import { isDeepStrictEqual } from "node:util"
import { extractChromaticRolePaletteWithContext } from "./chromatic-role-extract.ts"
import type { Candidate } from "./candidates.ts"
import { contrastRatio } from "./color.ts"
import { evaluateJointRoleCounterfactual } from "./joint-palette.ts"
import type { RawImage, RGB } from "./types.ts"

export const UI_ACCENT_CONTRAST_TRACE_VERSION = "ui-accent-contrast-trace-0.1.0-development"
export const UI_ACCENT_BACKGROUND_MINIMUM = 3
export const UI_ACCENT_SURFACE_MINIMUM = 3

type Alternative = {
	candidate: {
		id: number
		hex: string
		rgb: RGB
		population: number
		chroma: number
		saliency: number
		text: number
		typographyOnly: boolean
	}
	contrast: {
		background: number
		surface: number
	}
	hardFeasible: boolean
	status: ReturnType<typeof evaluateJointRoleCounterfactual>["status"]
	objectives: {
		accent: number
		identityCoverage: number
		mean: number
		delta: readonly [number, number, number, number, number]
		accentDelta: number
		identityCoverageDelta: number
		meanDelta: number
		maximumRegression: number
		totalRegression: number
	}
	collapsesToForeground: boolean
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function mean(values: readonly number[]): number {
	return values.reduce((sum, value) => sum + value, 0) / values.length
}

function summarizeAlternative(
	candidate: Candidate,
	background: RGB,
	foreground: RGB,
	surface: RGB,
	evaluation: ReturnType<typeof evaluateJointRoleCounterfactual>,
): Alternative | null {
	if (!evaluation.ranking) return null
	const backgroundContrast = contrastRatio(candidate.rgb, background)
	const surfaceContrast = contrastRatio(candidate.rgb, surface)
	const objectives = evaluation.ranking.replacementObjectives
	const delta = evaluation.ranking.objectiveDelta
	const accentDelta = delta[3]
	const identityCoverageDelta = delta[4]
	const meanDelta = evaluation.ranking.objectiveMeanDelta
	const regressions = [accentDelta, identityCoverageDelta, meanDelta].map((value) => Math.max(0, -value))
	return {
		candidate: {
			id: candidate.id,
			hex: candidate.hex,
			rgb: candidate.rgb,
			population: candidate.population,
			chroma: candidate.chroma,
			saliency: candidate.saliency,
			text: candidate.text,
			typographyOnly: candidate.typographyOnly,
		},
		contrast: { background: backgroundContrast, surface: surfaceContrast },
		hardFeasible: evaluation.hardFeasible,
		status: evaluation.status,
		objectives: {
			accent: objectives[3],
			identityCoverage: objectives[4],
			mean: mean(objectives),
			delta,
			accentDelta,
			identityCoverageDelta,
			meanDelta,
			maximumRegression: Math.max(...regressions),
			totalRegression: regressions.reduce((sum, value) => sum + value, 0),
		},
		collapsesToForeground: sameRgb(candidate.rgb, foreground),
	}
}

function compareAlternatives(first: Alternative, second: Alternative): number {
	return first.objectives.maximumRegression - second.objectives.maximumRegression ||
		first.objectives.totalRegression - second.objectives.totalRegression ||
		second.objectives.accent - first.objectives.accent ||
		second.objectives.identityCoverage - first.objectives.identityCoverage ||
		first.candidate.hex.localeCompare(second.candidate.hex, "en") ||
		first.candidate.id - second.candidate.id
}

export function traceUiAccentContrast(image: RawImage) {
	const context = extractChromaticRolePaletteWithContext(image)
	const candidatesBefore = structuredClone(context.candidates)
	const canonical = context.extraction.methods.spatial
	const supplementIds = new Set(context.certificate.availability.supplements.map((supplement) => supplement.id))
	const admittedIds = new Set(context.certificate.decision.admittedSupplementIds)
	const productionCandidates = context.candidates.filter((candidate) =>
		!supplementIds.has(candidate.id) || admittedIds.has(candidate.id))
	const currentBackgroundContrast = contrastRatio(canonical.accent.rgb, canonical.background.rgb)
	const currentSurfaceContrast = contrastRatio(canonical.accent.rgb, canonical.surface.rgb)
	const alternatives = productionCandidates.map((candidate) => summarizeAlternative(
		candidate,
		canonical.background.rgb,
		canonical.foreground.rgb,
		canonical.surface.rgb,
		evaluateJointRoleCounterfactual(
			productionCandidates,
			context.analysis,
			canonical,
			"accent",
			candidate,
		),
	)).filter((alternative): alternative is Alternative => alternative !== null)
	const safeAlternatives = alternatives.filter((alternative) => alternative.hardFeasible &&
		alternative.contrast.background >= UI_ACCENT_BACKGROUND_MINIMUM &&
		alternative.contrast.surface >= UI_ACCENT_SURFACE_MINIMUM)
		.sort(compareAlternatives)
	if (!isDeepStrictEqual(context.candidates, candidatesBefore)) {
		throw new Error("UI accent contrast trace mutated canonical candidates")
	}
	return {
		schemaVersion: 1 as const,
		traceVersion: UI_ACCENT_CONTRAST_TRACE_VERSION,
		contract: {
			backgroundMinimum: UI_ACCENT_BACKGROUND_MINIMUM,
			surfaceMinimum: UI_ACCENT_SURFACE_MINIMUM,
			usage: "meaningful-ui-elements" as const,
		},
		canonical: {
			roles: {
				background: canonical.background.hex.toLowerCase(),
				foreground: canonical.foreground.hex.toLowerCase(),
				surface: canonical.surface.hex.toLowerCase(),
				accent: canonical.accent.hex.toLowerCase(),
			},
			gradient: canonical.gradient.isGradient,
			contrast: {
				background: currentBackgroundContrast,
				surface: currentSurfaceContrast,
				backgroundPass: currentBackgroundContrast >= UI_ACCENT_BACKGROUND_MINIMUM,
				surfacePass: currentSurfaceContrast >= UI_ACCENT_SURFACE_MINIMUM,
				pass: currentBackgroundContrast >= UI_ACCENT_BACKGROUND_MINIMUM &&
					currentSurfaceContrast >= UI_ACCENT_SURFACE_MINIMUM,
			},
		},
		candidateCounts: {
			productionSelectable: productionCandidates.length,
			evaluated: alternatives.length,
			safe: safeAlternatives.length,
		},
		bestSafeAlternative: safeAlternatives[0] ?? null,
		safeAlternatives,
		invariants: {
			backgroundFrozen: true as const,
			foregroundFrozen: true as const,
			surfaceFrozen: true as const,
			gradientFrozen: true as const,
			canonicalCandidatesUnchanged: true as const,
			canonicalOutputUnchanged: true as const,
			generatedAccentFallbackDisabled: true as const,
			readOnly: true as const,
		},
	}
}
