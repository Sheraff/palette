import { createHash } from "node:crypto"
import { defineAccentContrastProfile, type AccentContrastProfile } from "./accent-contrast.ts"
import {
	CHROMATIC_ROLE_MAXIMUM_ADMISSION_POPULATION,
	CHROMATIC_ROLE_MINIMUM_ADMISSION_TEXT,
	extractChromaticRolePaletteWithContext,
} from "./chromatic-role-extract.ts"
import type { Candidate } from "./candidates.ts"
import { defineForegroundContrastProfile, type ForegroundContrastProfile } from "./foreground-contrast.ts"
import { ALGORITHM_VERSION } from "./extract.ts"
import { solveJointPalette, type JointPaletteCertificate } from "./joint-palette.ts"
import type { RegionAnalysis } from "./regions.ts"
import {
	buildTypographyChromaticCandidateAvailability,
	TYPOGRAPHY_CHROMATIC_CANDIDATE_AVAILABILITY_VERSION,
} from "./typography-chromatic-candidate-availability.ts"
import type { ExtractionResult, RawImage } from "./types.ts"

export const CONFIGURED_EXTRACTION_VERSION_PREFIX = `${ALGORITHM_VERSION}+configured.`

export type ConfiguredExtractionOptions = Readonly<{
	foregroundContrastProfile?: ForegroundContrastProfile
	accentContrastProfile?: AccentContrastProfile
	typographyChromaticAccent?: true
}>

export type ConfiguredExtractionContext = {
	extraction: ExtractionResult
	analysis: RegionAnalysis
	candidates: Candidate[]
	configuration: Readonly<{
		id: string
		foregroundContrastProfile?: ForegroundContrastProfile
		accentContrastProfile?: AccentContrastProfile
		typographyChromaticAccent?: true
	}>
	jointCertificate?: JointPaletteCertificate
	typographyChromaticAccent?: {
		availabilityVersion: typeof TYPOGRAPHY_CHROMATIC_CANDIDATE_AVAILABILITY_VERSION
		availableSupplementIds: number[]
		admittedSupplementIds: number[]
		selectedSupplementIds: number[]
		emittedSupplementIds: number[]
		rejectionReasons: Array<"required-accent-infeasible" | "non-accent-role-change" | "gradient-change">
	}
}

function normalizeOptions(options: ConfiguredExtractionOptions): ConfiguredExtractionOptions {
	if (typeof options !== "object" || options === null || Array.isArray(options)) {
		throw new Error("Configured extraction options are invalid")
	}
	const keys = Object.keys(options).sort()
	const allowed = new Set(["accentContrastProfile", "foregroundContrastProfile", "typographyChromaticAccent"])
	if (keys.length === 0 || keys.some((key) => !allowed.has(key))) {
		throw new Error("Configured extraction options are invalid")
	}
	if (options.typographyChromaticAccent !== undefined && options.typographyChromaticAccent !== true) {
		throw new Error("Configured extraction options are invalid")
	}
	if (options.typographyChromaticAccent && !options.accentContrastProfile) {
		throw new Error("Configured extraction options are invalid")
	}
	return Object.freeze({
		...(options.foregroundContrastProfile ? {
			foregroundContrastProfile: defineForegroundContrastProfile(options.foregroundContrastProfile),
		} : {}),
		...(options.accentContrastProfile ? {
			accentContrastProfile: defineAccentContrastProfile(options.accentContrastProfile),
		} : {}),
		...(options.typographyChromaticAccent ? { typographyChromaticAccent: true as const } : {}),
	})
}

function candidateDiagnostic(candidate: Candidate): ExtractionResult["candidates"][number] {
	return {
		hex: candidate.hex,
		rgb: candidate.rgb,
		population: candidate.population,
		background: candidate.background,
		saliency: candidate.saliency,
		text: candidate.text,
		chroma: candidate.chroma,
	}
}

export function configuredExtractionId(options: ConfiguredExtractionOptions): string {
	const normalized = normalizeOptions(options)
	return createHash("sha256").update(JSON.stringify(normalized)).digest("hex")
}

export function extractConfiguredPaletteWithContext(
	image: RawImage,
	options: ConfiguredExtractionOptions,
): ConfiguredExtractionContext {
	const normalized = normalizeOptions(options)
	const id = configuredExtractionId(normalized)
	const context = extractChromaticRolePaletteWithContext(
		image,
		normalized.foregroundContrastProfile,
	)
	const { extraction, analysis, candidates } = context
	let spatial = extraction.methods.spatial
	let configuredCandidates = candidates
	let jointCertificate: JointPaletteCertificate | undefined
	let typographyChromaticAccent: ConfiguredExtractionContext["typographyChromaticAccent"]
	if (normalized.accentContrastProfile) {
		const supplementIds = new Set(context.certificate.availability.supplements.map((supplement) => supplement.id))
		const admittedIds = new Set(context.certificate.decision.admittedSupplementIds)
		const roleCandidates = candidates.filter((candidate) =>
			!supplementIds.has(candidate.id) || admittedIds.has(candidate.id))
		let requiredAccentCandidateId: number | undefined
		if (normalized.typographyChromaticAccent) {
			const baselineCandidates = candidates.filter((candidate) => !supplementIds.has(candidate.id))
			const availability = buildTypographyChromaticCandidateAvailability(analysis, baselineCandidates)
			const availableCandidates = availability.addedSupplements.map((supplement) => supplement.candidate)
			const admittedCandidates = availableCandidates.filter((candidate) =>
				candidate.population <= CHROMATIC_ROLE_MAXIMUM_ADMISSION_POPULATION &&
				candidate.text >= CHROMATIC_ROLE_MINIMUM_ADMISSION_TEXT)
			configuredCandidates = [...candidates, ...availableCandidates]
			roleCandidates.push(...admittedCandidates)
			requiredAccentCandidateId = admittedCandidates[0]?.id
				typographyChromaticAccent = {
				availabilityVersion: TYPOGRAPHY_CHROMATIC_CANDIDATE_AVAILABILITY_VERSION,
				availableSupplementIds: availableCandidates.map((candidate) => candidate.id),
					admittedSupplementIds: admittedCandidates.map((candidate) => candidate.id),
					selectedSupplementIds: [],
					emittedSupplementIds: [],
					rejectionReasons: [],
				}
		}
		const incumbentSpatial = spatial
		const joint = solveJointPalette(roleCandidates, analysis, incumbentSpatial, {
			foregroundContrastProfile: normalized.foregroundContrastProfile,
			accentContrastProfile: normalized.accentContrastProfile,
			...(requiredAccentCandidateId !== undefined ? { requiredAccentCandidateId } : {}),
		})
		if (!joint.certificate.accentSafety?.selectedPass) {
			throw new Error("No four-role palette satisfies the configured accent contrast profile")
		}
		const jointSpatial = requiredAccentCandidateId !== undefined &&
			joint.palette.background.hex === incumbentSpatial.background.hex &&
			joint.palette.surface.hex === incumbentSpatial.surface.hex
			? { ...joint.palette, gradient: incumbentSpatial.gradient }
			: joint.palette
		jointCertificate = joint.certificate
		if (typographyChromaticAccent && requiredAccentCandidateId !== undefined) {
			if (!joint.certificate.requiredAccentSelected) {
				typographyChromaticAccent.rejectionReasons.push("required-accent-infeasible")
			} else {
				typographyChromaticAccent.selectedSupplementIds = [requiredAccentCandidateId]
				if (["background", "foreground", "surface"].some((role) =>
					jointSpatial[role as "background" | "foreground" | "surface"].hex !==
						incumbentSpatial[role as "background" | "foreground" | "surface"].hex)) {
					typographyChromaticAccent.rejectionReasons.push("non-accent-role-change")
				}
				if (jointSpatial.gradient.isGradient !== incumbentSpatial.gradient.isGradient) {
					typographyChromaticAccent.rejectionReasons.push("gradient-change")
				}
			}
			if (typographyChromaticAccent.selectedSupplementIds.length > 0 &&
				typographyChromaticAccent.rejectionReasons.length === 0) {
				typographyChromaticAccent.emittedSupplementIds = [requiredAccentCandidateId]
				spatial = jointSpatial
			} else {
				spatial = incumbentSpatial
			}
		} else {
			spatial = jointSpatial
		}
	}
	return {
		extraction: {
			...extraction,
			version: `${CONFIGURED_EXTRACTION_VERSION_PREFIX}${id.slice(0, 16)}`,
			methods: { ...extraction.methods, spatial },
			...(normalized.typographyChromaticAccent ? {
				candidates: configuredCandidates.map(candidateDiagnostic),
				diagnostics: { ...extraction.diagnostics, candidateCount: configuredCandidates.length },
			} : {}),
		},
		analysis,
		candidates: configuredCandidates,
		configuration: Object.freeze({
			id,
			...(normalized.foregroundContrastProfile ? {
				foregroundContrastProfile: normalized.foregroundContrastProfile,
			} : {}),
			...(normalized.accentContrastProfile ? {
				accentContrastProfile: normalized.accentContrastProfile,
			} : {}),
			...(normalized.typographyChromaticAccent ? { typographyChromaticAccent: true as const } : {}),
		}),
		...(jointCertificate ? { jointCertificate } : {}),
		...(typographyChromaticAccent ? { typographyChromaticAccent } : {}),
	}
}

export function extractConfiguredPalette(
	image: RawImage,
	options: ConfiguredExtractionOptions,
): ExtractionResult {
	return extractConfiguredPaletteWithContext(image, options).extraction
}
