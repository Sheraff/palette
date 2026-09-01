import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import {
	CHROMATIC_ROLE_FULL_ACCENT_CHROMA,
	CHROMATIC_ROLE_MAXIMUM_ACCENT_CHROMA_LOSS,
	CHROMATIC_ROLE_MAXIMUM_ACCENT_SALIENCY_LOSS_WITHOUT_CHROMA_GAIN,
	CHROMATIC_ROLE_MINIMUM_ACCENT_CHROMA_GAIN,
	CHROMATIC_ROLE_MINIMUM_ACCENT_TEXT_GAIN,
	CHROMATIC_ROLE_MINIMUM_EMITTED_ACCENT_CHROMA,
} from "./chromatic-role-extract.ts"
import type { Candidate, CandidateSpatialEvidence } from "./candidates.ts"
import { spatialEvidence } from "./candidates.ts"
import {
	buildConnectedFamilyRepresentativeFidelity,
	CONNECTED_FAMILY_REPRESENTATIVE_FIDELITY_VERSION,
	type ComponentLocalExactRepresentative,
	type ConnectedFamilyFidelityFamily,
} from "./connected-family-representative-fidelity.ts"
import { apcaContrast, chroma, contrastRatio, labAt, okDistance, rgbToHex, rgbToOKLab, roleMinimumDistance } from
	"./color.ts"
import { ALGORITHM_VERSION, extractPaletteWithContext } from "./extract.ts"
import { perceivePaletteImage } from "./palette-perception.ts"
import type { RegionAnalysis } from "./regions.ts"
import type { Palette, PaletteMetrics, RawImage, RGB, RoleColor, RoleName } from "./types.ts"

export const NEXT_PALETTE_INCUMBENT_ACCENT_ALGORITHM_VERSION =
	"region-graph-next-incumbent-accent-0.1.0-development"

export const NEXT_PALETTE_INCUMBENT_ACCENT_POLICY = Object.freeze({
	version: "next-palette-incumbent-accent-policy-0.1.0-development",
	incumbentAlgorithmVersion: ALGORITHM_VERSION,
	backgroundFrozen: true,
	foregroundFrozen: true,
	surfaceFrozen: true,
	gradientFrozen: true,
	expressiveFrozen: true,
	quantizedFrozen: true,
	maximumDistinctRoleColors: 4,
	fixedApcaAdmissionFloor: null,
	primaryContrastRelation: "accent-on-background" as const,
	secondaryContrastRelation: "accent-on-surface" as const,
	primaryContrastRule: "challenger-magnitude-not-less-than-incumbent" as const,
	identityRule: "strict-role-local-identity-support-gain" as const,
	comparisonEpsilon: 1e-12,
	minimumAccentChroma: CHROMATIC_ROLE_MINIMUM_EMITTED_ACCENT_CHROMA,
	minimumAccentChromaGain: CHROMATIC_ROLE_MINIMUM_ACCENT_CHROMA_GAIN,
	minimumAccentTextGain: CHROMATIC_ROLE_MINIMUM_ACCENT_TEXT_GAIN,
	maximumAccentChromaLoss: CHROMATIC_ROLE_MAXIMUM_ACCENT_CHROMA_LOSS,
	maximumAccentSaliencyLossWithoutChromaGain: CHROMATIC_ROLE_MAXIMUM_ACCENT_SALIENCY_LOSS_WITHOUT_CHROMA_GAIN,
	fullAccentChroma: CHROMATIC_ROLE_FULL_ACCENT_CHROMA,
})

export type IncumbentAccentProvenance = {
	kind: "connected-family-local" | "foreground-collapse"
	familyStableKeys: readonly string[]
	componentStableKeys: readonly string[]
	sourceRegionIds: readonly number[]
	representativePixelIndices: readonly number[]
	supportMaskSha256s: readonly string[]
}

export type IncumbentAccentEvidence = {
	population: number
	text: number
	saliency: number
	spatialDetail: number
	familyDetail: number
	chroma: number
	normalized: {
		chroma: number
		saliency: number
		detail: number
		population: number
	}
	identitySupport: number
}

export type IncumbentAccentOption = {
	optionId: string
	stableKey: string
	rgb: RGB
	hex: string
	generated: boolean
	provenance: IncumbentAccentProvenance
	evidence: IncumbentAccentEvidence
	contrast: {
		background: { signedLc: number; magnitude: number }
		surface: { signedLc: number; magnitude: number }
	}
	collapse: {
		foreground: boolean
		background: boolean
		surface: boolean
	}
	guards: {
		identityStronger: boolean
		primaryContrastNotDominated: boolean
		finiteContrast: boolean
		provenance: boolean
		roleMembership: boolean
		cardinality: boolean
		collapseSemantics: boolean
		chromaOrTextGain: boolean
		chromaLoss: boolean
		saliencyLossWithoutChromaGain: boolean
		fullChromaIncumbent: boolean
		minimumChroma: boolean
		collapsedBackground: boolean
		collateralRolesFrozen: boolean
	}
	failedGuards: readonly string[]
	eligible: boolean
}

export type NextPaletteIncumbentAccentCertificate = {
	schemaVersion: 1
	algorithmVersion: typeof NEXT_PALETTE_INCUMBENT_ACCENT_ALGORITHM_VERSION
	incumbentAlgorithmVersion: typeof ALGORITHM_VERSION
	fidelityVersion: typeof CONNECTED_FAMILY_REPRESENTATIVE_FIDELITY_VERSION
	policy: typeof NEXT_PALETTE_INCUMBENT_ACCENT_POLICY
	incumbent: {
		rgb: RGB
		hex: string
		generated: boolean
		evidenceAvailable: boolean
		evidence: IncumbentAccentEvidence
		contrast: IncumbentAccentOption["contrast"]
	}
	counts: {
		localRepresentativeAliases: number
		distinctConnectedOptions: number
		collapseOptions: number
		evaluated: number
		eligible: number
	}
	options: readonly IncumbentAccentOption[]
	selected: {
		optionId: string | null
		changed: boolean
		material: boolean
		accentDistance: number
		identitySupportDelta: number
		backgroundContrastMagnitudeDelta: number
		surfaceContrastMagnitudeDelta: number
	}
	invariants: {
		incumbentIsCanonical019: true
		backgroundFrozen: true
		foregroundFrozen: true
		surfaceFrozen: true
		gradientFrozen: true
		expressiveFrozen: true
		quantizedFrozen: true
		onlyAccentMayChange: true
		exactSourceProvenance: true
		connectedRepresentativesOverlayOnly: true
		maximumFourColors: true
		explicitAccentCollapse: true
		finiteSignedApca: true
		fixedApcaFloorAbsent: true
		collateralRoleLossImpossible: true
	}
}

export type NextPaletteIncumbentAccentResult = {
	palette: Palette
	certificate: NextPaletteIncumbentAccentCertificate
}

export type NextPaletteIncumbentAccentContext = NextPaletteIncumbentAccentResult & {
	canonicalExtraction: ReturnType<typeof extractPaletteWithContext>["extraction"]
}

type RawEvidence = {
	population: number
	text: number
	saliency: number
	spatialDetail: number
	familyDetail: number
	chroma: number
}

type RawOption = {
	stableKey: string
	rgb: RGB
	hex: string
	generated: boolean
	provenance: IncumbentAccentProvenance
	evidence: RawEvidence
}

const epsilon = NEXT_PALETTE_INCUMBENT_ACCENT_POLICY.comparisonEpsilon
const roleNames: readonly RoleName[] = ["background", "foreground", "surface", "accent"]

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0
	return Math.max(0, Math.min(1, value))
}

function mean(values: readonly number[]): number {
	return values.reduce((sum, value) => sum + clamp01(value), 0) / values.length
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function rgbKey(rgb: RGB): string {
	return `${rgb[0]},${rgb[1]},${rgb[2]}`
}

function sourceEvidence(analysis: RegionAnalysis, mask: Uint8Array): {
	population: number
	text: number
	saliency: number
	background: number
	spatial: CandidateSpatialEvidence
} {
	let count = 0
	let text = 0
	let saliency = 0
	let background = 0
	for (let pixel = 0; pixel < mask.length; pixel++) {
		if (!mask[pixel]) continue
		const region = analysis.regions[analysis.labels[pixel]]
		count++
		text += region.text
		saliency += region.saliency
		background += region.background
	}
	if (count === 0) throw new Error("Incumbent accent source evidence mask is empty")
	return {
		population: count / mask.length,
		text: text / count,
		saliency: saliency / count,
		background: background / count,
		spatial: spatialEvidence(analysis, mask),
	}
}

function candidateEvidence(candidate: Candidate): RawEvidence {
	return {
		population: candidate.population,
		text: candidate.text,
		saliency: candidate.saliency,
		spatialDetail: candidate.spatial.detail,
		familyDetail: candidate.familySpatial.detail,
		chroma: candidate.chroma,
	}
}

function representativeOption(
	family: ConnectedFamilyFidelityFamily,
	componentStableKey: string,
	representative: ComponentLocalExactRepresentative,
	analysis: RegionAnalysis,
): RawOption {
	const local = sourceEvidence(analysis, representative.supportMask)
	const familySpatial = spatialEvidence(analysis, family.mask)
	return {
		stableKey: representative.stableKey,
		rgb: representative.rgb,
		hex: representative.hex,
		generated: false,
		provenance: {
			kind: "connected-family-local",
			familyStableKeys: [family.stableKey],
			componentStableKeys: [componentStableKey],
			sourceRegionIds: representative.sourceRegionId === null ? [] : [representative.sourceRegionId],
			representativePixelIndices: [representative.representativePixelIndex],
			supportMaskSha256s: [representative.supportMaskSha256],
		},
		evidence: {
			population: local.population,
			text: local.text,
			saliency: local.saliency,
			spatialDetail: local.spatial.detail,
			familyDetail: familySpatial.detail,
			chroma: representative.chroma,
		},
	}
}

function mergeProvenance(options: readonly RawOption[]): IncumbentAccentProvenance {
	const values = <T>(items: readonly T[]) => [...new Set(items)]
	return {
		kind: options.some((option) => option.provenance.kind === "connected-family-local")
			? "connected-family-local"
			: "foreground-collapse",
		familyStableKeys: values(options.flatMap((option) => option.provenance.familyStableKeys)).sort(compareAscii),
		componentStableKeys: values(options.flatMap((option) => option.provenance.componentStableKeys)).sort(compareAscii),
		sourceRegionIds: values(options.flatMap((option) => option.provenance.sourceRegionIds)).sort((a, b) => a - b),
		representativePixelIndices: values(options.flatMap((option) => option.provenance.representativePixelIndices))
			.sort((a, b) => a - b),
		supportMaskSha256s: values(options.flatMap((option) => option.provenance.supportMaskSha256s)).sort(compareAscii),
	}
}

function contrast(rgb: RGB, field: RGB): { signedLc: number; magnitude: number } {
	const signedLc = apcaContrast(rgb, field)
	if (!Number.isFinite(signedLc)) throw new Error("Incumbent accent APCA is non-finite")
	return { signedLc, magnitude: Math.abs(signedLc) }
}

function normalizedEvidence(raw: RawEvidence, maximumPopulation: number, maximumChroma: number): IncumbentAccentEvidence {
	const normalized = {
		chroma: clamp01(raw.chroma / Math.max(maximumChroma, epsilon)),
		saliency: clamp01(raw.saliency),
		detail: clamp01(Math.max(raw.spatialDetail, raw.familyDetail)),
		population: clamp01(Math.sqrt(raw.population / Math.max(maximumPopulation, epsilon))),
	}
	return {
		...raw,
		normalized,
		identitySupport: mean([normalized.chroma, normalized.saliency, normalized.detail, normalized.population]),
	}
}

function nearestSourceDistance(rgb: RGB, analysis: RegionAnalysis): number {
	const lab = rgbToOKLab(rgb)
	let nearest = Infinity
	for (const region of analysis.regions) nearest = Math.min(nearest, okDistance(lab, region.lab))
	return Number.isFinite(nearest) ? nearest : 0
}

function paletteMetrics(palette: Pick<Palette, RoleName>, analysis: RegionAnalysis): PaletteMetrics {
	const roleLabs = roleNames.map((role) => rgbToOKLab(palette[role].rgb))
	let reconstruction = 0
	let samples = 0
	const pixelCount = analysis.width * analysis.height
	const stride = Math.max(1, Math.floor(pixelCount / 12_000))
	for (let pixel = 0; pixel < pixelCount; pixel += stride) {
		const lab = labAt(analysis.labs, pixel)
		reconstruction += Math.min(...roleLabs.map((roleLab) => okDistance(lab, roleLab)))
		samples++
	}
	return {
		foregroundContrast: contrastRatio(palette.background.rgb, palette.foreground.rgb),
		foregroundSurfaceContrast: contrastRatio(palette.surface.rgb, palette.foreground.rgb),
		accentContrast: contrastRatio(palette.background.rgb, palette.accent.rgb),
		accentSurfaceContrast: contrastRatio(palette.surface.rgb, palette.accent.rgb),
		minimumRoleDistance: roleMinimumDistance(roleLabs),
		meanSourceDistance: roleNames.reduce((sum, role) => sum + nearestSourceDistance(palette[role].rgb, analysis), 0) /
			roleNames.length,
		meanReconstructionError: samples === 0 ? 0 : reconstruction / samples,
	}
}

function candidateForRgb(candidates: readonly Candidate[], rgb: RGB): Candidate | null {
	return candidates.filter((candidate) => !candidate.generated && sameRgb(candidate.rgb, rgb))
		.sort((first, second) => Number(first.typographyOnly) - Number(second.typographyOnly) ||
			second.population - first.population || first.id - second.id)[0] ?? null
}

function optionSort(first: IncumbentAccentOption, second: IncumbentAccentOption): number {
	return second.evidence.identitySupport - first.evidence.identitySupport ||
		second.contrast.background.magnitude - first.contrast.background.magnitude ||
		second.contrast.surface.magnitude - first.contrast.surface.magnitude ||
		second.evidence.chroma - first.evidence.chroma ||
		second.evidence.saliency - first.evidence.saliency ||
		compareAscii(first.stableKey, second.stableKey)
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value
	for (const child of Object.values(value)) deepFreeze(child)
	return Object.freeze(value)
}

export function extractNextPaletteIncumbentAccentWithContext(image: RawImage): NextPaletteIncumbentAccentContext {
	const canonicalContext = extractPaletteWithContext(image)
	const canonicalExtraction = canonicalContext.extraction
	if (canonicalExtraction.version !== ALGORITHM_VERSION) throw new Error("Incumbent accent baseline is not canonical 0.19")
	const canonical = canonicalExtraction.methods.spatial
	const perception = perceivePaletteImage(image)
	const fidelity = buildConnectedFamilyRepresentativeFidelity(perception)
	const analysis = perception.analysis
	const rawAliases = fidelity.families.flatMap((family) => family.components.flatMap((component) =>
		component.representatives.map((representative) => representativeOption(
			family,
			component.stableKey,
			representative,
			analysis,
		))))
	const candidateIncumbent = candidateForRgb(perception.candidates, canonical.accent.rgb)
	const generatedIncumbent = canonical.accent.generated
	const incumbentEvidenceAvailable = generatedIncumbent || candidateIncumbent !== null
	const incumbentRaw: RawEvidence = candidateIncumbent ? candidateEvidence(candidateIncumbent) : {
		population: 0,
		text: 0,
		saliency: 0,
		spatialDetail: 0,
		familyDetail: 0,
		chroma: chroma(rgbToOKLab(canonical.accent.rgb)),
	}
	const foregroundCandidate = canonical.foreground.generated
		? null
		: candidateForRgb(perception.candidates, canonical.foreground.rgb)
	const foregroundRecord = foregroundCandidate
		? perception.candidateRecords.find((record) => record.candidateId === foregroundCandidate.id) ?? null
		: null
	const collapseRaw: RawOption | null = sameRgb(canonical.foreground.rgb, canonical.accent.rgb)
		? null
		: canonical.foreground.generated ? {
			stableKey: `foreground-collapse:${canonical.foreground.hex}:generated`,
			rgb: canonical.foreground.rgb,
			hex: canonical.foreground.hex,
			generated: true,
			provenance: {
				kind: "foreground-collapse",
				familyStableKeys: [],
				componentStableKeys: [],
				sourceRegionIds: [],
				representativePixelIndices: [],
				supportMaskSha256s: [],
			},
			evidence: { population: 0, text: 0, saliency: 0, spatialDetail: 0, familyDetail: 0,
				chroma: chroma(rgbToOKLab(canonical.foreground.rgb)) },
	} : foregroundCandidate && foregroundRecord ? {
			stableKey: `foreground-collapse:${canonical.foreground.hex}:candidate-${foregroundCandidate.id}`,
			rgb: canonical.foreground.rgb,
			hex: canonical.foreground.hex,
			generated: false,
			provenance: {
				kind: "foreground-collapse",
				familyStableKeys: [`baseline-family-${foregroundCandidate.familyId}`],
				componentStableKeys: [],
				sourceRegionIds: [],
			representativePixelIndices: [foregroundRecord.representativePixelIndex],
			supportMaskSha256s: [createHash("sha256").update(foregroundRecord.mask).digest("hex")],
			},
			evidence: candidateEvidence(foregroundCandidate),
		} : null
	const allRaw = collapseRaw ? [...rawAliases, collapseRaw] : rawAliases
	const maximumPopulation = Math.max(incumbentRaw.population, ...allRaw.map((option) => option.evidence.population), epsilon)
	const maximumChroma = Math.max(incumbentRaw.chroma, ...allRaw.map((option) => option.evidence.chroma), epsilon)
	const incumbentEvidence = normalizedEvidence(incumbentRaw, maximumPopulation, maximumChroma)
	const incumbentContrast = {
		background: contrast(canonical.accent.rgb, canonical.background.rgb),
		surface: contrast(canonical.accent.rgb, canonical.surface.rgb),
	}
	const byRgb = new Map<string, RawOption[]>()
	for (const option of allRaw) {
		if (sameRgb(option.rgb, canonical.accent.rgb) && option.generated === canonical.accent.generated) continue
		const key = rgbKey(option.rgb)
		const aliases = byRgb.get(key) ?? []
		aliases.push(option)
		byRgb.set(key, aliases)
	}
	const options: IncumbentAccentOption[] = []
	for (const aliases of byRgb.values()) {
		const rankedAliases = aliases.map((alias) => ({
			alias,
			evidence: normalizedEvidence(alias.evidence, maximumPopulation, maximumChroma),
		})).sort((first, second) => second.evidence.identitySupport - first.evidence.identitySupport ||
			compareAscii(first.alias.stableKey, second.alias.stableKey))
		const representative = rankedAliases[0]
		const evidence = representative.evidence
		const optionContrast = {
			background: contrast(representative.alias.rgb, canonical.background.rgb),
			surface: contrast(representative.alias.rgb, canonical.surface.rgb),
		}
		const collapse = {
			foreground: sameRgb(representative.alias.rgb, canonical.foreground.rgb),
			background: sameRgb(representative.alias.rgb, canonical.background.rgb),
			surface: sameRgb(representative.alias.rgb, canonical.surface.rgb),
		}
		const distinctColorCount = new Set([
			rgbKey(canonical.background.rgb),
			rgbKey(canonical.foreground.rgb),
			rgbKey(canonical.surface.rgb),
			rgbKey(representative.alias.rgb),
		]).size
		const chromaGain = evidence.chroma >= incumbentEvidence.chroma +
			NEXT_PALETTE_INCUMBENT_ACCENT_POLICY.minimumAccentChromaGain
		const guards = {
			identityStronger: incumbentEvidenceAvailable &&
				evidence.identitySupport > incumbentEvidence.identitySupport + epsilon,
			primaryContrastNotDominated: optionContrast.background.magnitude + epsilon >= incumbentContrast.background.magnitude,
			finiteContrast: Number.isFinite(optionContrast.background.signedLc) && Number.isFinite(optionContrast.surface.signedLc),
			provenance: representative.alias.generated ? collapse.foreground && canonical.foreground.generated :
				representative.alias.provenance.representativePixelIndices.every((pixel) => {
					const offset = pixel * 3
					return sameRgb(representative.alias.rgb,
						[image.data[offset], image.data[offset + 1], image.data[offset + 2]])
				}),
			roleMembership: representative.alias.provenance.kind === "connected-family-local" || collapse.foreground,
			cardinality: distinctColorCount <= NEXT_PALETTE_INCUMBENT_ACCENT_POLICY.maximumDistinctRoleColors,
			collapseSemantics: !(collapse.background || collapse.surface) || collapse.foreground,
			chromaOrTextGain: evidence.text >= incumbentEvidence.text +
				NEXT_PALETTE_INCUMBENT_ACCENT_POLICY.minimumAccentTextGain || chromaGain,
			chromaLoss: evidence.chroma >= incumbentEvidence.chroma -
				NEXT_PALETTE_INCUMBENT_ACCENT_POLICY.maximumAccentChromaLoss,
			saliencyLossWithoutChromaGain: chromaGain || evidence.saliency >= incumbentEvidence.saliency -
				NEXT_PALETTE_INCUMBENT_ACCENT_POLICY.maximumAccentSaliencyLossWithoutChromaGain,
			fullChromaIncumbent: !(incumbentEvidence.chroma >= NEXT_PALETTE_INCUMBENT_ACCENT_POLICY.fullAccentChroma &&
				evidence.chroma < incumbentEvidence.chroma),
			minimumChroma: evidence.chroma >= NEXT_PALETTE_INCUMBENT_ACCENT_POLICY.minimumAccentChroma,
			collapsedBackground: !sameRgb(canonical.background.rgb, canonical.surface.rgb) ||
				chroma(rgbToOKLab(canonical.background.rgb)) < NEXT_PALETTE_INCUMBENT_ACCENT_POLICY.fullAccentChroma,
			collateralRolesFrozen: true,
		}
		const failedGuards = Object.entries(guards).filter(([, pass]) => !pass).map(([name]) => name).sort(compareAscii)
		options.push({
			optionId: `accent-${rgbKey(representative.alias.rgb).replaceAll(",", "-")}`,
			stableKey: representative.alias.stableKey,
			rgb: representative.alias.rgb,
			hex: representative.alias.hex,
			generated: representative.alias.generated,
			provenance: mergeProvenance(aliases),
			evidence,
			contrast: optionContrast,
			collapse,
			guards,
			failedGuards,
			eligible: failedGuards.length === 0,
		})
	}
	options.sort(optionSort)
	const selected = options.find((option) => option.eligible) ?? null
	const accent: RoleColor = selected ? {
		rgb: selected.rgb,
		hex: rgbToHex(selected.rgb),
		generated: selected.generated,
		sourceDistance: selected.generated ? canonical.foreground.sourceDistance : nearestSourceDistance(selected.rgb, analysis),
	} : canonical.accent
	const paletteBase: Pick<Palette, RoleName> = {
		background: canonical.background,
		foreground: canonical.foreground,
		surface: canonical.surface,
		accent,
	}
	const palette: Palette = selected ? {
		...paletteBase,
		gradient: canonical.gradient,
		score: canonical.score,
		metrics: paletteMetrics(paletteBase, analysis),
	} : canonical
	const accentDistance = okDistance(rgbToOKLab(canonical.accent.rgb), rgbToOKLab(palette.accent.rgb))
	const changed = !sameRgb(canonical.accent.rgb, palette.accent.rgb) || canonical.accent.generated !== palette.accent.generated
	const frozen = (role: Exclude<RoleName, "accent">) => isDeepStrictEqual(palette[role], canonical[role])
	if (!frozen("background") || !frozen("foreground") || !frozen("surface") ||
		!isDeepStrictEqual(palette.gradient, canonical.gradient)) throw new Error("Incumbent accent changed a frozen role")
	if (new Set(roleNames.map((role) => rgbKey(palette[role].rgb))).size > 4) {
		throw new Error("Incumbent accent exceeded four colors")
	}
	const selectedIdentity = selected?.evidence.identitySupport ?? incumbentEvidence.identitySupport
	const selectedContrast = selected?.contrast ?? incumbentContrast
	return deepFreeze({
		palette,
		canonicalExtraction,
		certificate: {
			schemaVersion: 1,
			algorithmVersion: NEXT_PALETTE_INCUMBENT_ACCENT_ALGORITHM_VERSION,
			incumbentAlgorithmVersion: ALGORITHM_VERSION,
			fidelityVersion: CONNECTED_FAMILY_REPRESENTATIVE_FIDELITY_VERSION,
			policy: NEXT_PALETTE_INCUMBENT_ACCENT_POLICY,
			incumbent: {
				rgb: canonical.accent.rgb,
				hex: canonical.accent.hex,
				generated: canonical.accent.generated,
				evidenceAvailable: incumbentEvidenceAvailable,
				evidence: incumbentEvidence,
				contrast: incumbentContrast,
			},
			counts: {
				localRepresentativeAliases: rawAliases.length,
				distinctConnectedOptions: new Set(rawAliases.map((option) => rgbKey(option.rgb))).size,
				collapseOptions: collapseRaw ? 1 : 0,
				evaluated: options.length,
				eligible: options.filter((option) => option.eligible).length,
			},
			options,
			selected: {
				optionId: selected?.optionId ?? null,
				changed,
				material: accentDistance > 0.025,
				accentDistance,
				identitySupportDelta: selectedIdentity - incumbentEvidence.identitySupport,
				backgroundContrastMagnitudeDelta: selectedContrast.background.magnitude - incumbentContrast.background.magnitude,
				surfaceContrastMagnitudeDelta: selectedContrast.surface.magnitude - incumbentContrast.surface.magnitude,
			},
			invariants: {
				incumbentIsCanonical019: true,
				backgroundFrozen: true,
				foregroundFrozen: true,
				surfaceFrozen: true,
				gradientFrozen: true,
				expressiveFrozen: true,
				quantizedFrozen: true,
				onlyAccentMayChange: true,
				exactSourceProvenance: true,
				connectedRepresentativesOverlayOnly: true,
				maximumFourColors: true,
				explicitAccentCollapse: true,
				finiteSignedApca: true,
				fixedApcaFloorAbsent: true,
				collateralRoleLossImpossible: true,
			},
		},
	})
}

export function extractNextPaletteIncumbentAccent(image: RawImage): NextPaletteIncumbentAccentResult {
	const { canonicalExtraction: _canonicalExtraction, ...result } = extractNextPaletteIncumbentAccentWithContext(image)
	return result
}
