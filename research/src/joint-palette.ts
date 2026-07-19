import {
	chroma,
	contrastRatio,
	labAt,
	okDistance,
	rgbToHex,
	rgbToOKLab,
	roleMinimumDistance,
} from "./color.ts"
import { emptyCandidateSpatialEvidence, type Candidate, type CandidateSpatialEvidence } from "./candidates.ts"
import { detectGradient } from "./palette.ts"
import type { RegionAnalysis } from "./regions.ts"
import type { GradientEvidence, Palette, PaletteMetrics, RGB, RoleColor, RoleName } from "./types.ts"

export const JOINT_ALGORITHM_VERSION = "region-joint-spatial-0.1.0-poc.3"
export const JOINT_BASELINE_VERSION = "region-graph-0.16.0"

const roleNames = ["background", "foreground", "surface", "accent"] as const
const epsilon = 1e-12
const minimumForegroundBackgroundContrast = 3
const minimumForegroundSurfaceContrast = 2.5
const minimumAccentBackgroundContrast = 1.2
const minimumAccentBackgroundDistance = 0.08
const minimumAccentSurfaceDistance = 0.06
const minimumAccentForegroundDistance = 0.08
const minimumMeanObjectiveGain = 0.16
const minimumSingleObjectiveGain = 0.05

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
	schemaVersion: 1
	algorithmVersion: typeof JOINT_ALGORITHM_VERSION
	baselineAlgorithmVersion: typeof JOINT_BASELINE_VERSION
	selectionRule: "reviewed-incumbent-constrained-pareto-improvement"
	counts: {
		attempted: number
		feasible: number
		admissibleImprovements: number
	}
	baseline: SelectionSummary
	selected: SelectionSummary
	preservedBaseline: boolean
	invariants: {
		completeFeasibleTupleEnumeration: true
		pairSpecificGradientEvidence: true
		explicitSurfaceCollapse: true
		explicitAccentCollapse: true
		sourceForegroundPreferred: true
	}
	alternatives: SelectionSummary[]
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

function hasStrongTypographyEvidence(candidate: Candidate): boolean {
	return !candidate.generated && candidate.population >= 0.1 && candidate.text >= 0.5 && candidate.saliency >= 0.55
}

function foregroundBackgroundRequirement(candidate: Candidate): number {
	if (candidate.generated) return 4.5
	return hasStrongTypographyEvidence(candidate) ? minimumForegroundBackgroundContrast : 4
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
): number {
	if (foreground.generated) return 4.5
	const backgroundContrast = contrastRatio(foreground.rgb, background.rgb)
	if (hasStrongTypographyEvidence(foreground) && backgroundContrast < 4.5) return minimumForegroundSurfaceContrast
	return backgroundContrast < 4.5 || allowRepresentativeSurface ? 3 : 4.5
}

function foregroundPool(
	candidates: readonly Candidate[],
	background: Candidate,
	generated: readonly Candidate[],
): Candidate[] {
	const standard = candidates.filter((candidate) =>
		candidate !== background && contrastRatio(background.rgb, candidate.rgb) >= 4.5)
	const eligible = candidates.filter((candidate) => candidate !== background &&
		contrastRatio(background.rgb, candidate.rgb) >= foregroundBackgroundRequirement(candidate))
	const source = standard.length > 0
		? eligible.filter((candidate) =>
			contrastRatio(background.rgb, candidate.rgb) >= 4.5 || hasStrongTypographyEvidence(candidate))
		: eligible
	return source.length > 0
		? source
		: generated.filter((candidate) =>
			contrastRatio(background.rgb, candidate.rgb) >= foregroundBackgroundRequirement(candidate))
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
): boolean {
	return accent !== background && accent !== foreground && accent !== surface &&
		contrastRatio(accent.rgb, background.rgb) >= minimumAccentBackgroundContrast &&
		okDistance(accent.lab, background.lab) >= minimumAccentBackgroundDistance &&
		okDistance(accent.lab, surface.lab) >= minimumAccentSurfaceDistance &&
		okDistance(accent.lab, foreground.lab) >= minimumAccentForegroundDistance &&
		(accent.chroma >= 0.04 || contrastRatio(accent.rgb, foreground.rgb) >= 1.5)
}

function naturalAccentObjective(
	accent: Candidate,
	background: Candidate,
	surface: Candidate,
	maximumPopulation: number,
): number {
	const identity = clamp01(
		clamp01(accent.chroma / 0.18) * 0.31 + accent.saliency * 0.27 +
		detailEvidence(accent) * 0.17 + accent.text * 0.1 +
		Math.sqrt(accent.population / Math.max(maximumPopulation, epsilon)) * 0.15,
	)
	const contrastVisibility = clamp01((contrastRatio(accent.rgb, background.rgb) - minimumAccentBackgroundContrast) / 3.3)
	const backgroundDistance = clamp01((okDistance(accent.lab, background.lab) - minimumAccentBackgroundDistance) / 0.24)
	const surfaceDistance = clamp01((okDistance(accent.lab, surface.lab) - minimumAccentSurfaceDistance) / 0.24)
	const visibility = clamp01(contrastVisibility * 0.45 + backgroundDistance * 0.35 + surfaceDistance * 0.2)
	return clamp01(identity * 0.65 + visibility * 0.35)
}

function collapsedAccentObjective(
	background: Candidate,
	foreground: Candidate,
	surface: Candidate,
	candidates: readonly Candidate[],
	maximumPopulation: number,
): number {
	const strongestNatural = candidates.reduce((strongest, candidate) =>
		naturalAccentEligible(candidate, background, foreground, surface)
			? Math.max(strongest, naturalAccentObjective(candidate, background, surface, maximumPopulation))
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
): Selection {
	const collapseSurface = collapsedSurfaceObjective(background, surfaces, maximumPopulation)
	const objectives: ObjectiveVector = [
		backgroundObjective(background, maximumPopulation),
		foregroundObjective(foreground, maximumPopulation),
		surfaceObjective(surface, background, gradient, maximumPopulation, collapseSurface),
		accent === foreground
			? collapsedAccentObjective(background, foreground, surface, candidates, maximumPopulation)
			: naturalAccentObjective(accent, background, surface, maximumPopulation),
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
): { palette: Palette; certificate: JointPaletteCertificate } {
	if (candidates.length === 0) throw new Error("Cannot solve a joint palette without candidates")
	const sourceCandidates = [...candidates].sort((first, second) => compareAscii(candidateKey(first), candidateKey(second)))
	const backgrounds = sourceCandidates.filter((candidate) => !candidate.typographyOnly)
	const surfaces = backgrounds
	const generated = [generatedCandidate([0, 0, 0], -1), generatedCandidate([255, 255, 255], -2)]
	const maximumPopulation = Math.max(...sourceCandidates.map((candidate) => candidate.population), epsilon)
	const weights = identityWeights(sourceCandidates)
	const incumbent = incumbentSelection(
		incumbentPalette, sourceCandidates, generated, maximumPopulation, weights, surfaces,
	)
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

	let attempted = 0
	let feasible = 0
	const improvements: Selection[] = []
	for (const background of backgrounds) {
		const foregrounds = foregroundPool(sourceCandidates, background, generated)
		const allowRepresentativeSurface = hasMultipleBackgroundFields(sourceCandidates, background)
		for (const foreground of foregrounds) {
			if (contrastRatio(foreground.rgb, background.rgb) < foregroundBackgroundRequirement(foreground)) continue
			for (const surface of surfaces) {
				if (contrastRatio(foreground.rgb, surface.rgb) < foregroundSurfaceRequirement(
					foreground, background, allowRepresentativeSurface,
				)) continue
				const gradient = gradientFor(background, surface)
				const minimumSurfaceDistance = gradient.isGradient ? 0.025 : 0.05
				if (surface !== background && okDistance(background.lab, surface.lab) < minimumSurfaceDistance) continue
				const accents = sourceCandidates.filter((accent) =>
					naturalAccentEligible(accent, background, foreground, surface))
				accents.push(foreground)
				for (const accent of accents) {
					attempted++
					if (accent === foreground && (
						contrastRatio(accent.rgb, background.rgb) < minimumAccentBackgroundContrast ||
						okDistance(accent.lab, background.lab) < 0.025 || okDistance(accent.lab, surface.lab) < 0.025
					)) continue
					feasible++
					const selection = buildSelection(
						background, foreground, surface, accent, gradient,
						maximumPopulation, weights, surfaces, sourceCandidates,
					)
					if (selection.semanticKey !== incumbent.semanticKey && isAdmissibleImprovement(selection, incumbent)) {
						improvements.push(selection)
					}
				}
			}
		}
	}

	improvements.sort((first, second) => compareImprovements(first, second, incumbent))
	const selected = improvements[0] ?? incumbent
	const certificate: JointPaletteCertificate = {
		schemaVersion: 1,
		algorithmVersion: JOINT_ALGORITHM_VERSION,
		baselineAlgorithmVersion: JOINT_BASELINE_VERSION,
		selectionRule: "reviewed-incumbent-constrained-pareto-improvement",
		counts: { attempted, feasible, admissibleImprovements: improvements.length },
		baseline: summary(incumbent, incumbent),
		selected: summary(selected, incumbent),
		preservedBaseline: selected === incumbent,
		invariants: {
			completeFeasibleTupleEnumeration: true,
			pairSpecificGradientEvidence: true,
			explicitSurfaceCollapse: true,
			explicitAccentCollapse: true,
			sourceForegroundPreferred: true,
		},
		alternatives: improvements.slice(0, 12).map((selection) => summary(selection, incumbent)),
	}
	return { palette: selected === incumbent ? incumbentPalette : toPalette(selected, analysis), certificate }
}
