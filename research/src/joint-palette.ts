import {
	apcaContrast,
	chroma,
	contrastRatio,
	labAt,
	okDistance,
	rgbToHex,
	rgbToOKLab,
	roleMinimumDistance,
} from "./color.ts"
import { assertAccentContrastProfile, type AccentContrastProfile } from "./accent-contrast.ts"
import { emptyCandidateSpatialEvidence, type Candidate, type CandidateSpatialEvidence } from "./candidates.ts"
import {
	hasStrongTypographyEvidence,
	resolveForegroundBackgroundRequirement,
	resolveForegroundSurfaceRequirement,
	resolveSourceForegroundPreferenceMinimum,
	sourceForegroundIsPreferred,
	type ForegroundContrastProfile,
} from "./foreground-contrast.ts"
import { detectGradient } from "./palette.ts"
import type { RegionAnalysis } from "./regions.ts"
import type { GradientEvidence, Palette, PaletteMetrics, RGB, RoleColor, RoleName } from "./types.ts"

export const JOINT_ALGORITHM_VERSION = "region-joint-spatial-0.2.0-poc.1"
export const JOINT_BASELINE_VERSION = "region-graph-0.17.0"

const roleNames = ["background", "foreground", "surface", "accent"] as const
const epsilon = 1e-12
const minimumAccentBackgroundContrast = 1.2
const minimumAccentBackgroundDistance = 0.08
const minimumAccentSurfaceDistance = 0.06
const minimumAccentForegroundDistance = 0.08
const minimumMeanObjectiveGain = 0.16
const minimumSingleObjectiveGain = 0.05
const minimumGradientSurfacePopulation = 0.15
const minimumGradientSurfaceChroma = 0.22
const minimumGradientSurfaceDistance = 0.38
const minimumGradientSurfaceContrast = 3
const maximumGradientSurfaceContrast = 4.5
const minimumGradientSurfaceObjectiveGain = 0.05
const minimumGradientSurfaceIdentityGain = 0.05
const minimumGradientSurfaceMeanGain = 0.02
const maximumGradientSurfaceAccentRegression = 0.02

type ObjectiveVector = readonly [
	background: number,
	foreground: number,
	surface: number,
	accent: number,
	identityCoverage: number,
]

type Selection = {
	background: Candidate
	foreground: Candidate
	surface: Candidate
	accent: Candidate
	gradient: GradientEvidence
	objectives: ObjectiveVector
	semanticKey: string
}

type SelectionSummary = {
	roles: Record<RoleName, string>
	gradient: boolean
	objectives: ObjectiveVector
	objectiveMean: number
	roleChanges: number
	gradientChanged: boolean
	objectiveDelta: ObjectiveVector
	semanticKey: string
}

export type JointPaletteCertificate = {
	schemaVersion: 2
	algorithmVersion: typeof JOINT_ALGORITHM_VERSION
	baselineAlgorithmVersion: typeof JOINT_BASELINE_VERSION
	selectionRule:
		| "reviewed-incumbent-pareto-or-strict-gradient-surface-recovery"
		| "reviewed-incumbent-pareto"
		| "accent-safety-first-minimax-regret"
		| "required-accent-safety-first-minimax-regret"
	counts: {
		attempted: number
		feasible: number
		admissibleImprovements: number
		gradientSurfaceConsidered: number
		gradientSurfaceRecoveries: number
	}
	baseline: SelectionSummary
	selected: SelectionSummary
	preservedBaseline: boolean
	selectedAdmission: "preserve" | "pareto" | "gradient-surface-recovery" | "accent-safety-correction"
	invariants: {
		completeFeasibleTupleEnumeration: boolean
		completeGradientSurfaceEnumeration: boolean
		pairSpecificGradientEvidence: true
		explicitSurfaceCollapse: true
		explicitAccentCollapse: true
		sourceForegroundPreferred: true
		strictGradientSurfaceRecovery: boolean
		backgroundForegroundAccentFrozenForSurfaceRecovery: true
		gradientDecisionFrozenForSurfaceRecovery: true
		accentContrastProfileSatisfied?: true
	}
	alternatives: SelectionSummary[]
	foregroundContrastProfile?: ForegroundContrastProfile
	accentContrastProfile?: AccentContrastProfile
	requiredAccentCandidateId?: number
	requiredAccentSelected?: boolean
	accentSafety?: {
		incumbentPass: boolean
		correctionsConsidered: number
		selectedPass: boolean
	}
}

export type JointPaletteOptions = {
	enableGradientSurfaceRecovery?: boolean
	foregroundContrastProfile?: ForegroundContrastProfile
	accentContrastProfile?: AccentContrastProfile
	requiredAccentCandidateId?: number
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function componentCoherence(evidence: CandidateSpatialEvidence): number {
	if (evidence.components.length === 0) return evidence.population > 0 ? 0 : 1
	const total = evidence.components.reduce((sum, component) => sum + component.population, 0)
	const largest = Math.max(...evidence.components.map((component) => component.population))
	return total > epsilon ? largest / total : 0
}

function coherentField(candidate: Candidate): number {
	return clamp01(
		candidate.familySpatial.field * componentCoherence(candidate.familySpatial) * 0.68 +
		candidate.spatial.field * componentCoherence(candidate.spatial) * 0.32,
	)
}

function frameRisk(candidate: Candidate): number {
	return clamp01(Math.max(candidate.spatial.frame, candidate.familySpatial.frame))
}

function detailEvidence(candidate: Candidate): number {
	return clamp01(candidate.spatial.detail * 0.65 + candidate.familySpatial.detail * 0.35)
}

function generatedCandidate(rgb: RGB, id: number): Candidate {
	const lab = rgbToOKLab(rgb)
	return {
		id,
		rgb,
		lab,
		hex: rgbToHex(rgb),
		population: 0,
		background: 0,
		saliency: 0,
		text: 0,
		chroma: chroma(lab),
		generated: true,
		typographyOnly: false,
		regionIds: [],
		familyId: id,
		spatial: emptyCandidateSpatialEvidence(),
		familySpatial: emptyCandidateSpatialEvidence(),
	}
}

function candidateKey(candidate: Candidate): string {
	return `${candidate.hex.toLowerCase()}${candidate.generated ? "!" : ""}:${candidate.typographyOnly ? "t" : "g"}:${candidate.id}`
}

function selectionKey(
	background: Candidate,
	foreground: Candidate,
	surface: Candidate,
	accent: Candidate,
	gradient: GradientEvidence,
): string {
	return [background, foreground, surface, accent].map(candidateKey).join(":") + `:${gradient.isGradient ? "gradient" : "flat"}`
}

function foregroundBackgroundRequirement(candidate: Candidate, profile?: ForegroundContrastProfile): number {
	return resolveForegroundBackgroundRequirement(candidate, profile)
}

function hasMultipleBackgroundFields(candidates: readonly Candidate[], background: Candidate): boolean {
	return candidates.filter((candidate) =>
		!candidate.generated && !candidate.typographyOnly && candidate !== background &&
		candidate.population >= 0.15 && candidate.background >= 0.4 &&
		okDistance(candidate.lab, background.lab) >= 0.08,
	).length >= 2
}

function foregroundSurfaceRequirement(
	foreground: Candidate,
	background: Candidate,
	allowRepresentativeSurface: boolean,
	profile?: ForegroundContrastProfile,
): number {
	const backgroundContrast = contrastRatio(foreground.rgb, background.rgb)
	return resolveForegroundSurfaceRequirement(foreground, {
		foregroundBackgroundContrast: backgroundContrast,
		allowRepresentativeSurface,
	}, profile)
}

function foregroundPool(
	candidates: readonly Candidate[],
	background: Candidate,
	generated: readonly Candidate[],
	profile?: ForegroundContrastProfile,
): Candidate[] {
	const preferenceMinimum = resolveSourceForegroundPreferenceMinimum(profile)
	const standard = candidates.filter((candidate) =>
		candidate !== background && contrastRatio(background.rgb, candidate.rgb) >= preferenceMinimum)
	const eligible = candidates.filter((candidate) => candidate !== background &&
		contrastRatio(background.rgb, candidate.rgb) >= foregroundBackgroundRequirement(candidate, profile))
	const source = standard.length > 0
		? eligible.filter((candidate) =>
			sourceForegroundIsPreferred(candidate, contrastRatio(background.rgb, candidate.rgb), profile))
		: eligible
	return source.length > 0
		? source
		: generated.filter((candidate) =>
			contrastRatio(background.rgb, candidate.rgb) >= foregroundBackgroundRequirement(candidate, profile))
}

function backgroundObjective(candidate: Candidate, maximumPopulation: number): number {
	const field = coherentField(candidate)
	const population = Math.sqrt(candidate.population / Math.max(maximumPopulation, epsilon))
	return clamp01(
		field * 0.48 + candidate.background * 0.27 + population * 0.15 +
		(1 - detailEvidence(candidate)) * 0.1 - frameRisk(candidate) * 0.65,
	)
}

function foregroundObjective(candidate: Candidate, maximumPopulation: number): number {
	const typography = clamp01(
		candidate.text * 0.43 + candidate.saliency * 0.25 + detailEvidence(candidate) * 0.2 +
		Math.sqrt(candidate.population / Math.max(maximumPopulation, epsilon)) * 0.12,
	)
	const extreme = Math.abs(candidate.lab[0] - 0.5) * 2
	const identity = clamp01(clamp01(candidate.chroma / 0.18) * 0.55 + extreme * 0.45)
	return clamp01(typography * 0.72 + identity * 0.18 + (candidate.generated ? 0 : 0.1))
}

function surfaceFieldObjective(candidate: Candidate, maximumPopulation: number): number {
	return clamp01(
		coherentField(candidate) * 0.62 + candidate.background * 0.18 +
		Math.sqrt(candidate.population / Math.max(maximumPopulation, epsilon)) * 0.2 - frameRisk(candidate) * 0.35,
	)
}

function collapsedSurfaceObjective(
	background: Candidate,
	surfaces: readonly Candidate[],
	maximumPopulation: number,
): number {
	const strongestDistinctField = surfaces.reduce((strongest, candidate) => {
		if (candidate === background || okDistance(candidate.lab, background.lab) < 0.05) return strongest
		return Math.max(strongest, surfaceFieldObjective(candidate, maximumPopulation))
	}, 0)
	return clamp01(1 - strongestDistinctField + 0.1)
}

function gradientObjective(evidence: GradientEvidence): number {
	if (!evidence.isGradient) return 0
	return clamp01(
		evidence.confidence * 0.4 + evidence.coverage * 0.2 +
		evidence.continuity * 0.2 + evidence.coherence * 0.2,
	)
}

function surfaceObjective(
	surface: Candidate,
	background: Candidate,
	gradient: GradientEvidence,
	maximumPopulation: number,
	collapseEvidence: number,
): number {
	if (surface === background) return collapseEvidence
	const field = surfaceFieldObjective(surface, maximumPopulation)
	return gradient.isGradient ? clamp01(field * 0.4 + gradientObjective(gradient) * 0.6) : field
}

function naturalAccentEligible(
	accent: Candidate,
	background: Candidate,
	foreground: Candidate,
	surface: Candidate,
	profile?: AccentContrastProfile,
): boolean {
	return accent !== background && accent !== foreground && accent !== surface &&
		accentContrastEligible(accent, background, surface, profile) &&
		okDistance(accent.lab, background.lab) >= minimumAccentBackgroundDistance &&
		okDistance(accent.lab, surface.lab) >= minimumAccentSurfaceDistance &&
		okDistance(accent.lab, foreground.lab) >= minimumAccentForegroundDistance &&
		(accent.chroma >= 0.04 || contrastRatio(accent.rgb, foreground.rgb) >= 1.5)
}

function accentContrastEligible(
	accent: Candidate,
	background: Candidate,
	surface: Candidate,
	profile?: AccentContrastProfile,
): boolean {
	if (profile) {
		return Math.abs(apcaContrast(accent.rgb, background.rgb)) >= profile.backgroundMinimumLc &&
			Math.abs(apcaContrast(accent.rgb, surface.rgb)) >= profile.surfaceMinimumLc
	}
	return contrastRatio(accent.rgb, background.rgb) >= minimumAccentBackgroundContrast
}

function naturalAccentObjective(
	accent: Candidate,
	background: Candidate,
	surface: Candidate,
	maximumPopulation: number,
	profile?: AccentContrastProfile,
): number {
	const identity = clamp01(
		clamp01(accent.chroma / 0.18) * 0.31 + accent.saliency * 0.27 +
		detailEvidence(accent) * 0.17 + accent.text * 0.1 +
		Math.sqrt(accent.population / Math.max(maximumPopulation, epsilon)) * 0.15,
	)
	const contrastVisibility = profile
		? clamp01((Math.abs(apcaContrast(accent.rgb, background.rgb)) - profile.backgroundMinimumLc) / 45)
		: clamp01((contrastRatio(accent.rgb, background.rgb) - minimumAccentBackgroundContrast) / 3.3)
	const surfaceContrastVisibility = profile
		? clamp01((Math.abs(apcaContrast(accent.rgb, surface.rgb)) - profile.surfaceMinimumLc) / 45)
		: 1
	const backgroundDistance = clamp01((okDistance(accent.lab, background.lab) - minimumAccentBackgroundDistance) / 0.24)
	const surfaceDistance = clamp01((okDistance(accent.lab, surface.lab) - minimumAccentSurfaceDistance) / 0.24)
	const visibility = profile
		? clamp01(contrastVisibility * 0.3 + surfaceContrastVisibility * 0.25 +
			backgroundDistance * 0.25 + surfaceDistance * 0.2)
		: clamp01(contrastVisibility * 0.45 + backgroundDistance * 0.35 + surfaceDistance * 0.2)
	return clamp01(identity * 0.65 + visibility * 0.35)
}

function collapsedAccentObjective(
	background: Candidate,
	foreground: Candidate,
	surface: Candidate,
	candidates: readonly Candidate[],
	maximumPopulation: number,
	profile?: AccentContrastProfile,
): number {
	const strongestNatural = candidates.reduce((strongest, candidate) =>
		naturalAccentEligible(candidate, background, foreground, surface, profile)
			? Math.max(strongest, naturalAccentObjective(candidate, background, surface, maximumPopulation, profile))
			: strongest, 0)
	return clamp01(1 - strongestNatural + 0.1)
}

function identityWeights(candidates: readonly Candidate[]): Map<number, number> {
	const families = new Map<number, { population: number; saliency: number; detail: number }>()
	for (const candidate of candidates) {
		const current = families.get(candidate.familyId) ?? { population: 0, saliency: 0, detail: 0 }
		current.population = Math.max(current.population, candidate.familySpatial.population)
		current.saliency = Math.max(current.saliency, candidate.saliency)
		current.detail = Math.max(current.detail, detailEvidence(candidate))
		families.set(candidate.familyId, current)
	}
	return new Map([...families].map(([family, evidence]) => [
		family,
		evidence.population * (0.2 + evidence.saliency * 0.8) * (0.45 + evidence.detail * 0.55),
	]))
}

function identityCoverage(roles: readonly Candidate[], weights: ReadonlyMap<number, number>): number {
	const selectedFamilies = new Set(roles.filter((candidate) => !candidate.generated).map((candidate) => candidate.familyId))
	let covered = 0
	let total = 0
	for (const [family, weight] of weights) {
		total += weight
		if (selectedFamilies.has(family)) covered += weight
	}
	return total > epsilon ? clamp01(covered / total) : 1
}

function buildSelection(
	background: Candidate,
	foreground: Candidate,
	surface: Candidate,
	accent: Candidate,
	gradient: GradientEvidence,
	maximumPopulation: number,
	weights: ReadonlyMap<number, number>,
	surfaces: readonly Candidate[],
	candidates: readonly Candidate[],
	accentContrastProfile?: AccentContrastProfile,
): Selection {
	const collapseSurface = collapsedSurfaceObjective(background, surfaces, maximumPopulation)
	const objectives: ObjectiveVector = [
		backgroundObjective(background, maximumPopulation),
		foregroundObjective(foreground, maximumPopulation),
		surfaceObjective(surface, background, gradient, maximumPopulation, collapseSurface),
		accent === foreground
			? collapsedAccentObjective(background, foreground, surface, candidates, maximumPopulation, accentContrastProfile)
			: naturalAccentObjective(accent, background, surface, maximumPopulation, accentContrastProfile),
		identityCoverage([background, foreground, surface, accent], weights),
	]
	return {
		background,
		foreground,
		surface,
		accent,
		gradient,
		objectives,
		semanticKey: selectionKey(background, foreground, surface, accent, gradient),
	}
}

function candidateForRole(candidates: readonly Candidate[], role: RoleColor): Candidate | null {
	if (role.generated) return null
	return [...candidates]
		.filter((candidate) => sameRgb(candidate.rgb, role.rgb))
		.sort((first, second) => Number(first.typographyOnly) - Number(second.typographyOnly) ||
			second.population - first.population || compareAscii(candidateKey(first), candidateKey(second)))[0] ?? null
}

function generatedForRole(generated: readonly Candidate[], role: RoleColor): Candidate | null {
	return generated.find((candidate) => sameRgb(candidate.rgb, role.rgb)) ?? null
}

function incumbentSelection(
	palette: Palette,
	candidates: readonly Candidate[],
	generated: readonly Candidate[],
	maximumPopulation: number,
	weights: ReadonlyMap<number, number>,
	surfaces: readonly Candidate[],
	accentContrastProfile?: AccentContrastProfile,
): Selection {
	const role = (name: RoleName): Candidate => {
		const selected = candidateForRole(candidates, palette[name]) ?? generatedForRole(generated, palette[name])
		if (!selected) throw new Error(`Canonical incumbent ${name} is absent from the joint candidate set`)
		return selected
	}
	return buildSelection(
		role("background"),
		role("foreground"),
		role("surface"),
		role("accent"),
		{ ...palette.gradient },
		maximumPopulation,
		weights,
		surfaces,
		candidates,
		accentContrastProfile,
	)
}

function objectiveMean(objectives: ObjectiveVector): number {
	return objectives.reduce((sum, value) => sum + value, 0) / objectives.length
}

function objectiveDelta(selection: Selection, incumbent: Selection): ObjectiveVector {
	return selection.objectives.map((value, index) => value - incumbent.objectives[index]) as unknown as ObjectiveVector
}

function changedRoles(selection: Selection, incumbent: Selection): number {
	return roleNames.filter((name) => {
		const current = incumbent[name]
		const candidate = selection[name]
		return current.generated !== candidate.generated || okDistance(current.lab, candidate.lab) > 0.025
	}).length
}

function summary(selection: Selection, incumbent: Selection): SelectionSummary {
	const delta = objectiveDelta(selection, incumbent)
	return {
		roles: Object.fromEntries(roleNames.map((name) => [name, selection[name].hex.toLowerCase()])) as Record<RoleName, string>,
		gradient: selection.gradient.isGradient,
		objectives: selection.objectives,
		objectiveMean: objectiveMean(selection.objectives),
		roleChanges: changedRoles(selection, incumbent),
		gradientChanged: selection.gradient.isGradient !== incumbent.gradient.isGradient,
		objectiveDelta: delta,
		semanticKey: selection.semanticKey,
	}
}

function isAdmissibleImprovement(selection: Selection, incumbent: Selection): boolean {
	const delta = objectiveDelta(selection, incumbent)
	return delta.every((value) => value >= -epsilon) &&
		delta.some((value) => value >= minimumSingleObjectiveGain) &&
		delta.reduce((sum, value) => sum + value, 0) / delta.length >= minimumMeanObjectiveGain
}

function compareImprovements(first: Selection, second: Selection, incumbent: Selection): number {
	const firstDelta = objectiveDelta(first, incumbent)
	const secondDelta = objectiveDelta(second, incumbent)
	const firstChanges = changedRoles(first, incumbent) + Number(first.gradient.isGradient !== incumbent.gradient.isGradient)
	const secondChanges = changedRoles(second, incumbent) + Number(second.gradient.isGradient !== incumbent.gradient.isGradient)
	if (firstChanges !== secondChanges) return firstChanges - secondChanges
	const firstGain = firstDelta.reduce((sum, value) => sum + value, 0)
	const secondGain = secondDelta.reduce((sum, value) => sum + value, 0)
	if (Math.abs(firstGain - secondGain) > epsilon) return secondGain - firstGain
	return compareAscii(first.semanticKey, second.semanticKey)
}

function compareAccentSafetyCorrections(first: Selection, second: Selection, incumbent: Selection): number {
	const regressions = (selection: Selection) => {
		const delta = objectiveDelta(selection, incumbent)
		const losses = delta.map((value) => Math.max(0, -value))
		return {
			maximum: Math.max(...losses),
			total: losses.reduce((sum, value) => sum + value, 0),
			changes: changedRoles(selection, incumbent) + Number(selection.gradient.isGradient !== incumbent.gradient.isGradient),
			mean: objectiveMean(selection.objectives),
		}
	}
	const firstRegression = regressions(first)
	const secondRegression = regressions(second)
	if (Math.abs(firstRegression.maximum - secondRegression.maximum) > epsilon) {
		return firstRegression.maximum - secondRegression.maximum
	}
	if (Math.abs(firstRegression.total - secondRegression.total) > epsilon) {
		return firstRegression.total - secondRegression.total
	}
	if (firstRegression.changes !== secondRegression.changes) return firstRegression.changes - secondRegression.changes
	if (Math.abs(firstRegression.mean - secondRegression.mean) > epsilon) return secondRegression.mean - firstRegression.mean
	return compareAscii(first.semanticKey, second.semanticKey)
}

function compareRequiredAccentCorrections(first: Selection, second: Selection, incumbent: Selection): number {
	const firstChanges = changedRoles(first, incumbent) + Number(first.gradient.isGradient !== incumbent.gradient.isGradient)
	const secondChanges = changedRoles(second, incumbent) + Number(second.gradient.isGradient !== incumbent.gradient.isGradient)
	return firstChanges - secondChanges || compareAccentSafetyCorrections(first, second, incumbent)
}

function isGradientSurfaceRecovery(selection: Selection, incumbent: Selection): boolean {
	if (selection.background !== incumbent.background || selection.foreground !== incumbent.foreground ||
		selection.accent !== incumbent.accent || selection.surface === incumbent.surface ||
		selection.gradient.isGradient !== incumbent.gradient.isGradient) return false
	const surface = selection.surface
	const contrast = contrastRatio(surface.rgb, incumbent.foreground.rgb)
	if (surface.population < minimumGradientSurfacePopulation || surface.chroma < minimumGradientSurfaceChroma ||
		okDistance(surface.lab, incumbent.background.lab) <= minimumGradientSurfaceDistance ||
		contrast < minimumGradientSurfaceContrast || contrast >= maximumGradientSurfaceContrast ||
		!selection.gradient.isGradient) return false
	const delta = objectiveDelta(selection, incumbent)
	return delta[0] >= -epsilon && delta[1] >= -epsilon &&
		delta[2] >= minimumGradientSurfaceObjectiveGain &&
		delta[3] >= -maximumGradientSurfaceAccentRegression &&
		delta[4] >= minimumGradientSurfaceIdentityGain &&
		delta.reduce((sum, value) => sum + value, 0) / delta.length >= minimumGradientSurfaceMeanGain
}

function compareGradientSurfaceRecoveries(first: Selection, second: Selection, incumbent: Selection): number {
	const firstDelta = objectiveDelta(first, incumbent)
	const secondDelta = objectiveDelta(second, incumbent)
	const firstMean = firstDelta.reduce((sum, value) => sum + value, 0) / firstDelta.length
	const secondMean = secondDelta.reduce((sum, value) => sum + value, 0) / secondDelta.length
	if (Math.abs(firstMean - secondMean) > epsilon) return secondMean - firstMean
	if (Math.abs(firstDelta[2] - secondDelta[2]) > epsilon) return secondDelta[2] - firstDelta[2]
	if (Math.abs(firstDelta[4] - secondDelta[4]) > epsilon) return secondDelta[4] - firstDelta[4]
	return compareAscii(first.semanticKey, second.semanticKey)
}

function nearestSourceDistance(candidate: Candidate, analysis: RegionAnalysis): number {
	let nearest = Infinity
	for (const region of analysis.regions) nearest = Math.min(nearest, okDistance(candidate.lab, region.lab))
	return Number.isFinite(nearest) ? nearest : 0
}

function roleColor(candidate: Candidate, analysis: RegionAnalysis): RoleColor {
	return {
		rgb: candidate.rgb,
		hex: candidate.hex,
		generated: candidate.generated,
		sourceDistance: nearestSourceDistance(candidate, analysis),
	}
}

function paletteMetrics(selection: Selection, analysis: RegionAnalysis): PaletteMetrics {
	const selected = roleNames.map((name) => selection[name])
	let reconstruction = 0
	let samples = 0
	const pixelCount = analysis.width * analysis.height
	const stride = Math.max(1, Math.floor(pixelCount / 12_000))
	for (let pixel = 0; pixel < pixelCount; pixel += stride) {
		const lab = labAt(analysis.labs, pixel)
		reconstruction += Math.min(...selected.map((candidate) => okDistance(lab, candidate.lab)))
		samples++
	}
	return {
		foregroundContrast: contrastRatio(selection.background.rgb, selection.foreground.rgb),
		foregroundSurfaceContrast: contrastRatio(selection.surface.rgb, selection.foreground.rgb),
		accentContrast: contrastRatio(selection.background.rgb, selection.accent.rgb),
		accentSurfaceContrast: contrastRatio(selection.surface.rgb, selection.accent.rgb),
		minimumRoleDistance: roleMinimumDistance(selected.map((candidate) => candidate.lab)),
		meanSourceDistance: selected.reduce((sum, candidate) => sum + nearestSourceDistance(candidate, analysis), 0) / selected.length,
		meanReconstructionError: samples === 0 ? 0 : reconstruction / samples,
	}
}

function toPalette(selection: Selection, analysis: RegionAnalysis): Palette {
	return {
		background: roleColor(selection.background, analysis),
		foreground: roleColor(selection.foreground, analysis),
		surface: roleColor(selection.surface, analysis),
		accent: roleColor(selection.accent, analysis),
		gradient: { ...selection.gradient },
		score: objectiveMean(selection.objectives),
		metrics: paletteMetrics(selection, analysis),
	}
}

export function solveJointPalette(
	candidates: readonly Candidate[],
	analysis: RegionAnalysis,
	incumbentPalette: Palette,
	options: JointPaletteOptions = {},
): { palette: Palette; certificate: JointPaletteCertificate } {
	if (candidates.length === 0) throw new Error("Cannot solve a joint palette without candidates")
	const profile = options.foregroundContrastProfile
	const accentProfile = options.accentContrastProfile
	if (accentProfile) assertAccentContrastProfile(accentProfile)
	const enableGradientSurfaceRecovery = profile === undefined && accentProfile === undefined &&
		options.enableGradientSurfaceRecovery === true
	const sourceCandidates = [...candidates].sort((first, second) => compareAscii(candidateKey(first), candidateKey(second)))
	if (options.requiredAccentCandidateId !== undefined && accentProfile === undefined) {
		throw new Error("A required accent candidate needs an accent contrast profile")
	}
	const requiredAccent = options.requiredAccentCandidateId === undefined
		? undefined
		: sourceCandidates.find((candidate) => candidate.id === options.requiredAccentCandidateId)
	if (options.requiredAccentCandidateId !== undefined && !requiredAccent) {
		throw new Error("Required accent candidate is unavailable")
	}
	const backgrounds = sourceCandidates.filter((candidate) => !candidate.typographyOnly)
	const surfaces = backgrounds
	const generated = [generatedCandidate([0, 0, 0], -1), generatedCandidate([255, 255, 255], -2)]
	const maximumPopulation = Math.max(...sourceCandidates.map((candidate) => candidate.population), epsilon)
	const weights = identityWeights(sourceCandidates)
	const incumbent = incumbentSelection(
		incumbentPalette, sourceCandidates, generated, maximumPopulation, weights, surfaces, accentProfile,
	)
	const incumbentAccentPass = accentProfile === undefined ||
		accentContrastEligible(incumbent.accent, incumbent.background, incumbent.surface, accentProfile)
	const incumbentRequiredAccentPass = requiredAccent === undefined || incumbent.accent === requiredAccent
	const gradientCache = new Map<string, GradientEvidence>()
	const gradientFor = (background: Candidate, surface: Candidate): GradientEvidence => {
		if (background === surface) return { isGradient: false, confidence: 1, coverage: 0, continuity: 0, coherence: 0 }
		const key = `${candidateKey(background)}=>${candidateKey(surface)}`
		let evidence = gradientCache.get(key)
		if (!evidence) {
			evidence = detectGradient(background, surface, analysis)
			gradientCache.set(key, evidence)
		}
		return evidence
	}
	const strictGradientCache = new Map<string, GradientEvidence>()
	const strictGradientFor = (background: Candidate, surface: Candidate): GradientEvidence => {
		const key = `${candidateKey(background)}=>${candidateKey(surface)}`
		let evidence = strictGradientCache.get(key)
		if (!evidence) {
			evidence = detectGradient(background, surface, analysis, { allowSmoothFallback: false })
			strictGradientCache.set(key, evidence)
		}
		return evidence
	}

	let attempted = 0
	let feasible = 0
	const improvements: Selection[] = []
	const accentSafetyCorrections: Selection[] = []
	if (!enableGradientSurfaceRecovery && (accentProfile === undefined || !incumbentAccentPass || !incumbentRequiredAccentPass)) {
		for (const background of backgrounds) {
			const foregrounds = foregroundPool(sourceCandidates, background, generated, profile)
			const allowRepresentativeSurface = hasMultipleBackgroundFields(sourceCandidates, background)
			for (const foreground of foregrounds) {
				if (contrastRatio(foreground.rgb, background.rgb) < foregroundBackgroundRequirement(foreground, profile)) continue
				for (const surface of surfaces) {
					if (contrastRatio(foreground.rgb, surface.rgb) < foregroundSurfaceRequirement(
						foreground, background, allowRepresentativeSurface, profile,
					)) continue
					const gradient = gradientFor(background, surface)
					const minimumSurfaceDistance = gradient.isGradient ? 0.025 : 0.05
					if (surface !== background && okDistance(background.lab, surface.lab) < minimumSurfaceDistance) continue
					const accents = requiredAccent
						? naturalAccentEligible(requiredAccent, background, foreground, surface, accentProfile)
							? [requiredAccent]
							: []
						: sourceCandidates.filter((accent) =>
							naturalAccentEligible(accent, background, foreground, surface, accentProfile))
					if (!requiredAccent && accentContrastEligible(foreground, background, surface, accentProfile)) accents.push(foreground)
					for (const accent of accents) {
						attempted++
						if (accent === foreground && (
							contrastRatio(accent.rgb, background.rgb) < minimumAccentBackgroundContrast ||
							okDistance(accent.lab, background.lab) < 0.025 || okDistance(accent.lab, surface.lab) < 0.025
						)) continue
						feasible++
						const selection = buildSelection(
							background, foreground, surface, accent, gradient,
							maximumPopulation, weights, surfaces, sourceCandidates, accentProfile,
						)
						if (accentProfile && (!incumbentAccentPass || requiredAccent !== undefined)) {
							accentSafetyCorrections.push(selection)
						} else if (selection.semanticKey !== incumbent.semanticKey && isAdmissibleImprovement(selection, incumbent)) {
							improvements.push(selection)
						}
					}
				}
			}
		}
	}

	improvements.sort((first, second) => compareImprovements(first, second, incumbent))
	accentSafetyCorrections.sort((first, second) => requiredAccent
		? compareRequiredAccentCorrections(first, second, incumbent)
		: compareAccentSafetyCorrections(first, second, incumbent))
	const gradientSurfaceRecoveries: Selection[] = []
	let gradientSurfaceConsidered = 0
	if (enableGradientSurfaceRecovery && accentProfile === undefined) {
		for (const surface of surfaces) {
			if (surface === incumbent.background || surface === incumbent.surface || surface.typographyOnly) continue
			gradientSurfaceConsidered++
			const contrast = contrastRatio(surface.rgb, incumbent.foreground.rgb)
			if (surface.population < minimumGradientSurfacePopulation || surface.chroma < minimumGradientSurfaceChroma ||
				okDistance(surface.lab, incumbent.background.lab) <= minimumGradientSurfaceDistance ||
				contrast < minimumGradientSurfaceContrast || contrast >= maximumGradientSurfaceContrast) continue
			const gradient = strictGradientFor(incumbent.background, surface)
			if (!gradient.isGradient || gradient.isGradient !== incumbent.gradient.isGradient) continue
			if (incumbent.accent === incumbent.foreground) {
				if (contrastRatio(incumbent.accent.rgb, incumbent.background.rgb) < minimumAccentBackgroundContrast ||
					okDistance(incumbent.accent.lab, incumbent.background.lab) < 0.025 ||
					okDistance(incumbent.accent.lab, surface.lab) < 0.025) continue
			} else if (!naturalAccentEligible(
				incumbent.accent, incumbent.background, incumbent.foreground, surface,
			)) continue
			const selection = buildSelection(
				incumbent.background, incumbent.foreground, surface, incumbent.accent, gradient,
				maximumPopulation, weights, surfaces, sourceCandidates, undefined,
			)
			if (isGradientSurfaceRecovery(selection, incumbent)) gradientSurfaceRecoveries.push(selection)
		}
		gradientSurfaceRecoveries.sort((first, second) => compareGradientSurfaceRecoveries(first, second, incumbent))
	}
	const selected = requiredAccent
		? incumbentRequiredAccentPass && incumbentAccentPass ? incumbent : accentSafetyCorrections[0] ?? incumbent
		: accentProfile
		? incumbentAccentPass ? incumbent : accentSafetyCorrections[0] ?? incumbent
		: improvements[0] ?? gradientSurfaceRecoveries[0] ?? incumbent
	const selectedAdmission: JointPaletteCertificate["selectedAdmission"] = selected === incumbent
		? "preserve"
		: selected === accentSafetyCorrections[0]
			? "accent-safety-correction"
			: selected === improvements[0] ? "pareto" : "gradient-surface-recovery"
	const certificate: JointPaletteCertificate = {
		schemaVersion: 2,
		algorithmVersion: JOINT_ALGORITHM_VERSION,
		baselineAlgorithmVersion: JOINT_BASELINE_VERSION,
		selectionRule: requiredAccent
			? "required-accent-safety-first-minimax-regret"
			: accentProfile ? "accent-safety-first-minimax-regret"
			: profile ? "reviewed-incumbent-pareto" : "reviewed-incumbent-pareto-or-strict-gradient-surface-recovery",
		counts: {
			attempted,
			feasible,
			admissibleImprovements: improvements.length,
			gradientSurfaceConsidered,
			gradientSurfaceRecoveries: gradientSurfaceRecoveries.length,
		},
		baseline: summary(incumbent, incumbent),
		selected: summary(selected, incumbent),
		preservedBaseline: selected === incumbent,
		selectedAdmission,
		invariants: {
			completeFeasibleTupleEnumeration: !enableGradientSurfaceRecovery,
			completeGradientSurfaceEnumeration: profile === undefined && accentProfile === undefined,
			pairSpecificGradientEvidence: true,
			explicitSurfaceCollapse: true,
			explicitAccentCollapse: true,
			sourceForegroundPreferred: true,
			strictGradientSurfaceRecovery: profile === undefined && accentProfile === undefined,
			backgroundForegroundAccentFrozenForSurfaceRecovery: true,
			gradientDecisionFrozenForSurfaceRecovery: true,
			...(accentProfile && selected !== incumbent ? { accentContrastProfileSatisfied: true as const } : {}),
		},
		alternatives: (accentProfile ? accentSafetyCorrections : [...improvements, ...gradientSurfaceRecoveries]).slice(0, 12)
			.map((selection) => summary(selection, incumbent)),
		...(profile ? { foregroundContrastProfile: profile } : {}),
		...(requiredAccent ? {
			requiredAccentCandidateId: requiredAccent.id,
			requiredAccentSelected: selected.accent === requiredAccent,
		} : {}),
		...(accentProfile ? {
			accentContrastProfile: accentProfile,
			accentSafety: {
				incumbentPass: incumbentAccentPass,
				correctionsConsidered: accentSafetyCorrections.length,
				selectedPass: accentContrastEligible(selected.accent, selected.background, selected.surface, accentProfile),
			},
		} : {}),
	}
	return { palette: selected === incumbent ? incumbentPalette : toPalette(selected, analysis), certificate }
}

type JointRoleCounterfactualGate = {
	name:
		| "replacement-production-membership"
		| "background-role-membership"
		| "surface-role-membership"
		| "source-foreground-preference-membership"
		| "foreground-background-contrast-tier"
		| "foreground-surface-contrast-tier"
		| "surface-background-distance"
		| "natural-accent-not-background"
		| "natural-accent-not-foreground"
		| "natural-accent-not-surface"
		| "natural-accent-background-contrast"
		| "natural-accent-background-distance"
		| "natural-accent-surface-distance"
		| "natural-accent-foreground-distance"
		| "natural-accent-chroma-or-foreground-contrast"
		| "collapsed-accent-equals-foreground"
		| "collapsed-accent-background-contrast"
		| "collapsed-accent-background-distance"
		| "collapsed-accent-surface-distance"
	kind: "boolean" | "numeric"
	applicable: boolean
	actual: boolean | number
	required: boolean | number
	operator: "equals" | ">="
	pass: boolean
}

type JointRoleCounterfactualResult = {
	targetRole: RoleName
	replacementCandidateKey: string
	incumbentRoles: Record<RoleName, string>
	replacementRoles: Record<RoleName, string>
	otherRolesFrozen: Record<RoleName, boolean>
	gradient: {
		pairChanged: boolean
		preservedIncumbent: boolean
		incumbent: GradientEvidence
		selected: GradientEvidence
		canonicalPair: GradientEvidence | null
		strictPair: GradientEvidence | null
		recomputedCanonicalPairIfDifferent: GradientEvidence | null
	}
	measurements: {
		foregroundBackgroundContrast: number
		foregroundBackgroundRequired: number
		foregroundSurfaceContrast: number
		foregroundSurfaceRequired: number
		surfaceBackgroundDistance: number
		surfaceBackgroundRequired: number
		accentBackgroundContrast: number
		accentBackgroundDistance: number
		accentSurfaceDistance: number
		accentForegroundDistance: number
		accentChroma: number
		accentForegroundContrast: number
	}
	gates: JointRoleCounterfactualGate[]
	hardFeasible: boolean
	status: "hard-infeasible" | "incumbent" | "feasible-rank-loss" | "feasible-pareto-admissible"
	ranking: null | {
		incumbentObjectives: ObjectiveVector
		replacementObjectives: ObjectiveVector
		objectiveDelta: ObjectiveVector
		incumbentObjectiveMean: number
		replacementObjectiveMean: number
		objectiveMeanDelta: number
		objectiveTotalDelta: number
		productionParetoAdmissible: boolean
		semanticKey: string
		changedRoleCount: number
		gradientChanged: boolean
	}
	collapse: {
		incumbent: { surfaceToBackground: boolean; accentToForeground: boolean }
		replacement: { surfaceToBackground: boolean; accentToForeground: boolean }
	}
	resolvedForegroundContrast?: {
		profile: ForegroundContrastProfile
		strongTypographyEvidence: boolean
		sourceForegroundPreferenceMinimum: number
		foregroundBackgroundRequirement: number
		foregroundSurfaceRequirement: number
	}
}

function sameGradientEvidence(first: GradientEvidence, second: GradientEvidence): boolean {
	return first.isGradient === second.isGradient && first.confidence === second.confidence &&
		first.coverage === second.coverage && first.continuity === second.continuity && first.coherence === second.coherence
}

/** Diagnostic only. This does not select or emit a palette. */
export function evaluateJointRoleCounterfactual(
	candidates: readonly Candidate[],
	analysis: RegionAnalysis,
	incumbentPalette: Palette,
	targetRole: RoleName,
	replacementCandidate: Candidate,
	profile?: ForegroundContrastProfile,
): JointRoleCounterfactualResult {
	if (candidates.length === 0) throw new Error("Cannot evaluate a joint counterfactual without candidates")
	if (!roleNames.includes(targetRole)) throw new Error(`Unknown counterfactual role: ${targetRole}`)
	const sourceCandidates = [...candidates].sort((first, second) => compareAscii(candidateKey(first), candidateKey(second)))
	const backgrounds = sourceCandidates.filter((candidate) => !candidate.typographyOnly)
	const surfaces = backgrounds
	const generated = [generatedCandidate([0, 0, 0], -1), generatedCandidate([255, 255, 255], -2)]
	const maximumPopulation = Math.max(...sourceCandidates.map((candidate) => candidate.population), epsilon)
	const weights = identityWeights(sourceCandidates)
	const incumbent = incumbentSelection(
		incumbentPalette, sourceCandidates, generated, maximumPopulation, weights, surfaces,
	)
	const roles = {
		background: incumbent.background,
		foreground: incumbent.foreground,
		surface: incumbent.surface,
		accent: incumbent.accent,
	}
	roles[targetRole] = replacementCandidate

	const canonicalGradient = roles.background === roles.surface
		? { isGradient: false, confidence: 1, coverage: 0, continuity: 0, coherence: 0 }
		: detectGradient(roles.background, roles.surface, analysis)
	const pairChanged = roles.background !== incumbent.background || roles.surface !== incumbent.surface
	const selectedGradient = targetRole === "background" || targetRole === "surface"
		? canonicalGradient
		: { ...incumbent.gradient }
	const strictGradient = targetRole === "background" || targetRole === "surface"
		? roles.background === roles.surface
			? { isGradient: false, confidence: 1, coverage: 0, continuity: 0, coherence: 0 }
			: detectGradient(roles.background, roles.surface, analysis, { allowSmoothFallback: false })
		: null
	const foregrounds = foregroundPool(sourceCandidates, roles.background, generated, profile)
	const allowRepresentativeSurface = hasMultipleBackgroundFields(sourceCandidates, roles.background)
	const foregroundBackgroundContrast = contrastRatio(roles.foreground.rgb, roles.background.rgb)
	const foregroundBackgroundRequired = foregroundBackgroundRequirement(roles.foreground, profile)
	const foregroundSurfaceContrast = contrastRatio(roles.foreground.rgb, roles.surface.rgb)
	const foregroundSurfaceRequired = foregroundSurfaceRequirement(
		roles.foreground, roles.background, allowRepresentativeSurface, profile,
	)
	const surfaceBackgroundDistance = okDistance(roles.background.lab, roles.surface.lab)
	const surfaceBackgroundRequired = selectedGradient.isGradient ? 0.025 : 0.05
	const accentBackgroundContrast = contrastRatio(roles.accent.rgb, roles.background.rgb)
	const accentBackgroundDistance = okDistance(roles.accent.lab, roles.background.lab)
	const accentSurfaceDistance = okDistance(roles.accent.lab, roles.surface.lab)
	const accentForegroundDistance = okDistance(roles.accent.lab, roles.foreground.lab)
	const accentForegroundContrast = contrastRatio(roles.accent.rgb, roles.foreground.rgb)
	const collapsedAccent = roles.accent === roles.foreground
	const booleanGate = (
		name: JointRoleCounterfactualGate["name"],
		applicable: boolean,
		actual: boolean,
	): JointRoleCounterfactualGate => ({
		name,
		kind: "boolean",
		applicable,
		actual,
		required: true,
		operator: "equals",
		pass: actual,
	})
	const numericGate = (
		name: JointRoleCounterfactualGate["name"],
		applicable: boolean,
		actual: number,
		required: number,
		pass = actual >= required,
	): JointRoleCounterfactualGate => ({
		name,
		kind: "numeric",
		applicable,
		actual,
		required,
		operator: ">=",
		pass,
	})
	const gates: JointRoleCounterfactualGate[] = [
		booleanGate("replacement-production-membership", true, sourceCandidates.includes(replacementCandidate)),
		booleanGate("background-role-membership", true, backgrounds.includes(roles.background)),
		booleanGate("surface-role-membership", true, surfaces.includes(roles.surface)),
		booleanGate("source-foreground-preference-membership", true, foregrounds.includes(roles.foreground)),
		numericGate("foreground-background-contrast-tier", true,
			foregroundBackgroundContrast, foregroundBackgroundRequired),
		numericGate("foreground-surface-contrast-tier", true,
			foregroundSurfaceContrast, foregroundSurfaceRequired),
		numericGate("surface-background-distance", true,
			surfaceBackgroundDistance, surfaceBackgroundRequired, roles.surface === roles.background ||
				surfaceBackgroundDistance >= surfaceBackgroundRequired),
		booleanGate("natural-accent-not-background", !collapsedAccent, roles.accent !== roles.background),
		booleanGate("natural-accent-not-foreground", !collapsedAccent, roles.accent !== roles.foreground),
		booleanGate("natural-accent-not-surface", !collapsedAccent, roles.accent !== roles.surface),
		numericGate("natural-accent-background-contrast", !collapsedAccent,
			accentBackgroundContrast, minimumAccentBackgroundContrast),
		numericGate("natural-accent-background-distance", !collapsedAccent,
			accentBackgroundDistance, minimumAccentBackgroundDistance),
		numericGate("natural-accent-surface-distance", !collapsedAccent,
			accentSurfaceDistance, minimumAccentSurfaceDistance),
		numericGate("natural-accent-foreground-distance", !collapsedAccent,
			accentForegroundDistance, minimumAccentForegroundDistance),
		booleanGate("natural-accent-chroma-or-foreground-contrast", !collapsedAccent,
			roles.accent.chroma >= 0.04 || accentForegroundContrast >= 1.5),
		booleanGate("collapsed-accent-equals-foreground", collapsedAccent, collapsedAccent),
		numericGate("collapsed-accent-background-contrast", collapsedAccent,
			accentBackgroundContrast, minimumAccentBackgroundContrast),
		numericGate("collapsed-accent-background-distance", collapsedAccent,
			accentBackgroundDistance, 0.025),
		numericGate("collapsed-accent-surface-distance", collapsedAccent,
			accentSurfaceDistance, 0.025),
	]
	const hardFeasible = gates.every((gate) => !gate.applicable || gate.pass)
	const selection = hardFeasible
		? buildSelection(
			roles.background, roles.foreground, roles.surface, roles.accent, selectedGradient,
			maximumPopulation, weights, surfaces, sourceCandidates,
		)
		: null
	const delta = selection ? objectiveDelta(selection, incumbent) : null
	const productionParetoAdmissible = selection ? isAdmissibleImprovement(selection, incumbent) : false
	const isIncumbent = selection?.semanticKey === incumbent.semanticKey
	return {
		targetRole,
		replacementCandidateKey: candidateKey(replacementCandidate),
		incumbentRoles: Object.fromEntries(roleNames.map((role) => [role, candidateKey(incumbent[role])])) as Record<RoleName, string>,
		replacementRoles: Object.fromEntries(roleNames.map((role) => [role, candidateKey(roles[role])])) as Record<RoleName, string>,
		otherRolesFrozen: Object.fromEntries(roleNames.map((role) => [
			role,
			role === targetRole || roles[role] === incumbent[role],
		])) as Record<RoleName, boolean>,
		gradient: {
			pairChanged,
			preservedIncumbent: targetRole === "foreground" || targetRole === "accent",
			incumbent: { ...incumbent.gradient },
			selected: { ...selectedGradient },
			canonicalPair: targetRole === "background" || targetRole === "surface" ? canonicalGradient : null,
			strictPair: strictGradient,
			recomputedCanonicalPairIfDifferent: targetRole === "foreground" || targetRole === "accent"
				? sameGradientEvidence(canonicalGradient, selectedGradient) ? null : canonicalGradient
				: null,
		},
		measurements: {
			foregroundBackgroundContrast,
			foregroundBackgroundRequired,
			foregroundSurfaceContrast,
			foregroundSurfaceRequired,
			surfaceBackgroundDistance,
			surfaceBackgroundRequired,
			accentBackgroundContrast,
			accentBackgroundDistance,
			accentSurfaceDistance,
			accentForegroundDistance,
			accentChroma: roles.accent.chroma,
			accentForegroundContrast,
		},
		gates,
		hardFeasible,
		status: !hardFeasible
			? "hard-infeasible"
			: isIncumbent ? "incumbent" : productionParetoAdmissible
				? "feasible-pareto-admissible" : "feasible-rank-loss",
		ranking: selection && delta ? {
			incumbentObjectives: incumbent.objectives,
			replacementObjectives: selection.objectives,
			objectiveDelta: delta,
			incumbentObjectiveMean: objectiveMean(incumbent.objectives),
			replacementObjectiveMean: objectiveMean(selection.objectives),
			objectiveMeanDelta: objectiveMean(selection.objectives) - objectiveMean(incumbent.objectives),
			objectiveTotalDelta: delta.reduce((sum, value) => sum + value, 0),
			productionParetoAdmissible,
			semanticKey: selection.semanticKey,
			changedRoleCount: changedRoles(selection, incumbent),
			gradientChanged: selection.gradient.isGradient !== incumbent.gradient.isGradient,
		} : null,
		collapse: {
			incumbent: {
				surfaceToBackground: incumbent.surface === incumbent.background,
				accentToForeground: incumbent.accent === incumbent.foreground,
			},
			replacement: {
				surfaceToBackground: roles.surface === roles.background,
				accentToForeground: roles.accent === roles.foreground,
			},
		},
		...(profile ? {
			resolvedForegroundContrast: {
				profile,
				strongTypographyEvidence: hasStrongTypographyEvidence(roles.foreground),
				sourceForegroundPreferenceMinimum: resolveSourceForegroundPreferenceMinimum(profile),
				foregroundBackgroundRequirement: foregroundBackgroundRequired,
				foregroundSurfaceRequirement: foregroundSurfaceRequired,
			},
		} : {}),
	}
}
