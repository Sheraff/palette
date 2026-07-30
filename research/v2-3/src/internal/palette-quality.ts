import type { CompletePaletteTreatment, PaletteRoleColor } from "./palette-core.ts";

export const ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_QUALITY_AXES = [
	"fieldFidelity",
	"representativeness",
	"sourceSupport",
	"renderedGradientSalience",
	"foregroundPath",
	"accentPath",
	"coherence",
	"economy",
] as const

export type AlbumArtworkPaletteV2Phase3SelectorV2QualityAxis =
	typeof ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_V2_QUALITY_AXES[number]

export type AlbumArtworkPaletteV2Phase3SelectorV2GradientStatus =
	"earned-rendered" | "missing" | "unearned" | "not-applicable"

export type AlbumArtworkPaletteV2Phase3SelectorV2Quality = Readonly<
	Record<AlbumArtworkPaletteV2Phase3SelectorV2QualityAxis, number>
>

function clamp(value: number): number {
	return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function mean(values: readonly number[]): number {
	return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

function adjustedScore(treatment: CompletePaletteTreatment, value: number): number {
	return clamp(value - treatment.scores.generatedPenalty)
}

function colorDistance(first: PaletteRoleColor, second: PaletteRoleColor): number {
	return Math.hypot(
		first.oklab[0] - second.oklab[0],
		first.oklab[1] - second.oklab[1],
		first.oklab[2] - second.oklab[2],
	)
}

export function roleSourceSupport(color: PaletteRoleColor, declaredFamilyId: string): number {
	if (color.generated || "generated" in color.support || declaredFamilyId === "generated") return 0
	const support = color.support
	if (support.anchorFamilyId !== declaredFamilyId || support.regionIds.length === 0) return 0
	return clamp(
		0.26 * clamp(support.perceptualDensity / 0.5) +
		0.20 * clamp(support.totalSupport / 0.08) +
		0.20 * clamp(support.connectedSupport / 0.08) +
		0.14 * clamp(support.spatialCoverage) +
		0.10 * clamp(support.concentration) +
		0.10 * (1 - clamp(support.prototypeDistance / 0.06)),
	)
}

function treatmentSourceSupport(treatment: CompletePaletteTreatment): number {
	const activeRoles: Array<"background" | "surface" | "foreground" | "accent"> = ["background"]
	if (!treatment.collapse.surface) activeRoles.push("surface")
	activeRoles.push("foreground")
	if (!treatment.collapse.accent) activeRoles.push("accent")
	const unique = new Map<string, number>()
	for (const role of activeRoles) {
		const color = treatment[role]
		const key = `${color.hex.toLowerCase()}\0${treatment.familyRoles[role]}`
		unique.set(key, roleSourceSupport(color, treatment.familyRoles[role]))
	}
	const values = [...unique.values()]
	return values.length === 0 ? 0 : 0.65 * mean(values) + 0.35 * Math.min(...values)
}

function rolePathFraction(
	treatment: CompletePaletteTreatment,
	role: "foreground" | "accent",
): number {
	const activeRole = role === "accent" && treatment.collapse.accent ? "foreground" : role
	const path = treatment.contrast.pairs.filter((pair) => pair.role === activeRole)
	if (path.length === 0) return 0
	return path.filter(({ signedLc }) => Number.isFinite(signedLc) && signedLc !== 0).length / path.length
}

export function gradientEvidenceStrength(treatment: CompletePaletteTreatment): number {
	const evidence = treatment.gradientEvidence
	if (!evidence) return 0
	return mean([
		evidence.progression,
		evidence.modeProgression,
		evidence.monotonicity,
		evidence.edgeContinuity,
		evidence.coverage,
	].map(clamp))
}

function earnedGradientClaim(treatment: CompletePaletteTreatment): boolean {
	const evidence = treatment.gradientEvidence
	if (!treatment.gradient || treatment.fieldTreatment !== "gradient-field" ||
		treatment.collapse.surface || evidence === null) return false
	if (treatment.familyRoles.background === "generated" || treatment.familyRoles.surface === "generated") return false
	const supportingFamilies = new Set(evidence.supportingFamilyIds)
	return supportingFamilies.has(treatment.familyRoles.background) &&
		supportingFamilies.has(treatment.familyRoles.surface) &&
		Number.isFinite(evidence.span) && evidence.span > 0 &&
		colorDistance(treatment.background, treatment.surface) > 0 &&
		gradientEvidenceStrength(treatment) > 0
}

function gradientStatus(
	treatment: CompletePaletteTreatment,
	gradientExpected: boolean,
): AlbumArtworkPaletteV2Phase3SelectorV2GradientStatus {
	if (earnedGradientClaim(treatment)) return "earned-rendered"
	if (treatment.gradient) return "unearned"
	if (treatment.fieldTreatment === "gradient-field" || gradientExpected) return "missing"
	return "not-applicable"
}

function renderedGradientSalience(
	treatment: CompletePaletteTreatment,
	status: AlbumArtworkPaletteV2Phase3SelectorV2GradientStatus,
): number {
	if (status === "not-applicable") return 1
	if (status !== "earned-rendered") return 0
	const endpointSalience = clamp(colorDistance(treatment.background, treatment.surface) / 0.18)
	return Math.sqrt(endpointSalience * gradientEvidenceStrength(treatment))
}

export function albumArtworkPaletteV2Phase3SelectorV2Quality(
	treatment: CompletePaletteTreatment,
	gradientExpected = false,
): Readonly<{
	gradientStatus: AlbumArtworkPaletteV2Phase3SelectorV2GradientStatus
	quality: AlbumArtworkPaletteV2Phase3SelectorV2Quality
}> {
	const status = gradientStatus(treatment, gradientExpected)
	const foregroundPath = Math.sqrt(clamp(treatment.scores.foregroundUtility) *
		rolePathFraction(treatment, "foreground"))
	const accentPath = Math.sqrt(clamp(treatment.scores.accentUtility) *
		rolePathFraction(treatment, "accent"))
	return {
		gradientStatus: status,
		quality: {
			fieldFidelity: status === "unearned"
				? 0
				: adjustedScore(treatment, treatment.scores.fieldFidelity),
			representativeness: adjustedScore(treatment, treatment.scores.representativeness),
			sourceSupport: treatmentSourceSupport(treatment),
			renderedGradientSalience: renderedGradientSalience(treatment, status),
			foregroundPath: adjustedScore(treatment, foregroundPath),
			accentPath: adjustedScore(treatment, accentPath),
			coherence: adjustedScore(treatment, treatment.scores.coherence),
			economy: adjustedScore(treatment, treatment.scores.economy),
		},
	}
}
