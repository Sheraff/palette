import {
	chroma,
	contrastRatio,
	labAt,
	okDistance,
	rgbToHex,
	rgbToOKLab,
	roleMinimumDistance,
} from "./color.ts"
import type {
	Candidate,
	CandidateSpatialEvidence,
	SideCoverage as CandidateSideCoverage,
} from "./candidates.ts"
import type { RegionAnalysis } from "./regions.ts"
import type { GradientEvidence, Palette, PaletteMetrics, RGB, RoleColor } from "./types.ts"

export type SideCoverage = CandidateSideCoverage
export type SpatialEvidence = CandidateSpatialEvidence
export type ParetoCandidate = Candidate

export const paretoObjectiveOrder = [
	"backgroundCoherentField",
	"foregroundTypographyIdentity",
	"surfaceFieldGradientEvidence",
	"accentIdentityVisibility",
	"salientIdentityCoverage",
] as const

export type ParetoObjectiveName = typeof paretoObjectiveOrder[number]
export type ParetoObjectiveVector = readonly [number, number, number, number, number]
export type SurfaceModel = "collapsed" | "field" | "gradient"

export type ParetoObjectiveComponents = {
	background: {
		coherentField: number
		frameRisk: number
		value: number
	}
	foreground: {
		typographyEvidence: number
		identity: number
		source: number
		value: number
	}
	surface: {
		model: SurfaceModel
		fieldEvidence: number
		gradientEvidence: number
		collapseEvidence: number
		value: number
	}
	accent: {
		identity: number
		visibility: number
		value: number
	}
	salientIdentityCoverage: {
		coveredWeight: number
		totalWeight: number
		value: number
	}
}

export type ParetoFrontierSummary = {
	semanticKey: string
	roles: {
		background: string
		foreground: string
		surface: string
		accent: string
	}
	surfaceModel: SurfaceModel
	objectiveVector: ParetoObjectiveVector
	regret: ParetoObjectiveVector
	lexicographicRegret: ParetoObjectiveVector
}

export type ParetoPaletteCertificate = {
	counts: {
		attempted: number
		feasible: number
		frontier: number
		dominated: number
	}
	objectiveOrder: typeof paretoObjectiveOrder
	selected: {
		semanticKey: string
		objectiveVector: ParetoObjectiveVector
		objectiveComponents: ParetoObjectiveComponents
		regret: ParetoObjectiveVector
		lexicographicRegret: ParetoObjectiveVector
		gates: {
			foregroundBackground: { actual: number; required: number }
			foregroundSurface: { actual: number; required: number }
			accentBackground: { actual: number; required: number }
			accentBackgroundDistance: number
			accentSurfaceDistance: number
			generatedFallbackNecessary: boolean
		}
	}
	frontierSummaries: ParetoFrontierSummary[]
	selectionRule: "lexicographic-minimax-regret-then-semantic-key"
	gradientHandling: {
		kind: "local-current-pixel-evidence"
		description: string
		limitation: string
	}
}

type Selection = {
	background: ParetoCandidate
	foreground: ParetoCandidate
	surface: ParetoCandidate
	accent: ParetoCandidate
	surfaceModel: SurfaceModel
	gradient: GradientEvidence
	objectives: ParetoObjectiveVector
	components: ParetoObjectiveComponents
	semanticKey: string
}

type RegrettedSelection = Selection & {
	regret: ParetoObjectiveVector
	lexicographicRegret: ParetoObjectiveVector
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))
const epsilon = 1e-12
const minimumDistinctGradientSurfaceDistance = 0.025
const minimumDistinctSurfaceDistance = 0.05

function compareAscii(first: string, second: string): number {
	const length = Math.min(first.length, second.length)
	for (let index = 0; index < length; index++) {
		const difference = first.charCodeAt(index) - second.charCodeAt(index)
		if (difference !== 0) return difference
	}
	return first.length - second.length
}

export const minimumParetoForegroundBackgroundContrast = 3
export const minimumParetoForegroundSurfaceContrast = 2.5
export const minimumParetoAccentBackgroundContrast = 1.2
export const minimumParetoAccentBackgroundDistance = 0.08
export const minimumParetoAccentSurfaceDistance = 0.06
export const minimumParetoAccentForegroundDistance = 0.08

function componentCoherence(evidence: SpatialEvidence): number {
	if (evidence.components.length === 0) return evidence.population > 0 ? 0 : 1
	const total = evidence.components.reduce((sum, component) => sum + component.population, 0)
	const largest = Math.max(...evidence.components.map((component) => component.population))
	return total > epsilon ? largest / total : 0
}

function frameRisk(evidence: SpatialEvidence): number {
	return clamp01(evidence.frame)
}

function coherentField(candidate: ParetoCandidate): number {
	return clamp01(
		candidate.familySpatial.field * componentCoherence(candidate.familySpatial) * 0.68 +
		candidate.spatial.field * componentCoherence(candidate.spatial) * 0.32,
	)
}

function combinedFrameRisk(candidate: ParetoCandidate): number {
	return Math.max(frameRisk(candidate.spatial), frameRisk(candidate.familySpatial))
}

function detailEvidence(candidate: ParetoCandidate): number {
	return clamp01(candidate.spatial.detail * 0.65 + candidate.familySpatial.detail * 0.35)
}

function hasStrongTypographyEvidence(candidate: ParetoCandidate): boolean {
	return !candidate.generated && candidate.population >= 0.1 && candidate.text >= 0.5 && candidate.saliency >= 0.55
}

function foregroundBackgroundRequirement(candidate: ParetoCandidate): number {
	if (candidate.generated) return 4.5
	return hasStrongTypographyEvidence(candidate) ? minimumParetoForegroundBackgroundContrast : 4
}

function hasMultipleBackgroundFields(candidates: readonly ParetoCandidate[], background: ParetoCandidate): boolean {
	return candidates.filter((candidate) =>
		!candidate.generated && !candidate.typographyOnly && candidate !== background &&
		candidate.population >= 0.15 && candidate.background >= 0.4 &&
		okDistance(candidate.lab, background.lab) >= 0.08,
	).length >= 2
}

function foregroundSurfaceRequirement(
	foreground: ParetoCandidate,
	background: ParetoCandidate,
	allowRepresentativeSurface: boolean,
): number {
	if (foreground.generated) return 4.5
	const backgroundContrast = contrastRatio(foreground.rgb, background.rgb)
	if (hasStrongTypographyEvidence(foreground) && backgroundContrast < 4.5) {
		return minimumParetoForegroundSurfaceContrast
	}
	return backgroundContrast < 4.5 || allowRepresentativeSurface ? 3 : 4.5
}

function zeroSpatialEvidence(): SpatialEvidence {
	return {
		population: 0,
		regionIds: [],
		components: [],
		field: 0,
		detail: 0,
		frame: 0,
		sideCoverage: [0, 0, 0, 0],
	}
}

function generatedCandidate(rgb: RGB, id: number): ParetoCandidate {
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
		spatial: zeroSpatialEvidence(),
		familySpatial: zeroSpatialEvidence(),
	}
}

function candidateSemanticKey(candidate: ParetoCandidate): string {
	const family = String(candidate.familyId)
	const components = (evidence: SpatialEvidence): string => evidence.components
		.map((component) => [
			component.population.toFixed(12),
			[...component.regionIds].sort((first, second) => first - second).join("."),
			...component.sideCoverage.map((value) => value.toFixed(12)),
			component.saliency.toFixed(12),
			component.text.toFixed(12),
		].join(","))
		.sort(compareAscii)
		.join(";")
	const spatial = [
		candidate.spatial.population,
		candidate.spatial.field,
		candidate.spatial.detail,
		candidate.spatial.frame,
		...candidate.spatial.sideCoverage,
		candidate.familySpatial.population,
		candidate.familySpatial.field,
		candidate.familySpatial.detail,
		candidate.familySpatial.frame,
		...candidate.familySpatial.sideCoverage,
	].map((value) => value.toFixed(12)).join(",")
	return [
		candidate.hex.toLowerCase(),
		candidate.generated ? "generated" : "source",
		candidate.typographyOnly ? "typography" : "general",
		family,
		candidate.population.toFixed(12),
		candidate.background.toFixed(12),
		candidate.saliency.toFixed(12),
		candidate.text.toFixed(12),
		spatial,
		components(candidate.spatial),
		components(candidate.familySpatial),
	].join("|")
}

function roleSemanticKey(candidate: ParetoCandidate): string {
	return `${candidate.hex.toLowerCase()}${candidate.generated ? "!" : ""}`
}

function selectionSemanticKey(
	background: ParetoCandidate,
	foreground: ParetoCandidate,
	surface: ParetoCandidate,
	accent: ParetoCandidate,
	surfaceModel: SurfaceModel,
): string {
	return [background, foreground, surface, accent].map(roleSemanticKey).join(":") + `:${surfaceModel}`
}

function foregroundPool(
	candidates: readonly ParetoCandidate[],
	background: ParetoCandidate,
	generated: readonly ParetoCandidate[],
): ParetoCandidate[] {
	const standard = candidates.filter((candidate) =>
		!candidate.generated && candidate !== background && contrastRatio(background.rgb, candidate.rgb) >= 4.5)
	const eligible = candidates.filter((candidate) =>
		!candidate.generated && candidate !== background &&
		contrastRatio(background.rgb, candidate.rgb) >= foregroundBackgroundRequirement(candidate))
	const source = standard.length > 0
		? eligible.filter((candidate) =>
			contrastRatio(background.rgb, candidate.rgb) >= 4.5 || hasStrongTypographyEvidence(candidate))
		: eligible
	if (source.length > 0) return source
	return generated.filter((candidate) =>
		contrastRatio(background.rgb, candidate.rgb) >= foregroundBackgroundRequirement(candidate))
}

function smoothGradientEvidence(analysis: RegionAnalysis): GradientEvidence {
	const farOffset = 12
	let samples = 0
	let evidence = 0
	let localDistanceTotal = 0
	let farDistanceTotal = 0
	for (let y = 0; y < analysis.height - farOffset; y += 2) {
		for (let x = 0; x < analysis.width - farOffset; x += 2) {
			const pixel = y * analysis.width + x
			if (analysis.regions[analysis.labels[pixel]].background < 0.35) continue
			for (const [deltaX, deltaY] of [[1, 0], [0, 1]] as const) {
				const localPixel = (y + deltaY) * analysis.width + x + deltaX
				const farPixel = (y + deltaY * farOffset) * analysis.width + x + deltaX * farOffset
				const localDistance = okDistance(labAt(analysis.labs, pixel), labAt(analysis.labs, localPixel))
				const farDistance = okDistance(labAt(analysis.labs, pixel), labAt(analysis.labs, farPixel))
				samples++
				localDistanceTotal += localDistance
				farDistanceTotal += farDistance
				if (localDistance > 0.0005 && localDistance < 0.025 && farDistance > 0.025 && farDistance > localDistance * 2) {
					evidence++
				}
			}
		}
	}
	if (samples === 0) return { isGradient: false, confidence: 1, coverage: 0, continuity: 0, coherence: 0 }
	const ratio = evidence / samples
	const localMean = localDistanceTotal / samples
	const farMean = farDistanceTotal / samples
	const isGradient = ratio >= 0.32 && localMean < 0.025 && farMean > 0.035
	const confidence = isGradient
		? clamp01(0.45 + ratio * 0.7 + Math.min(farMean, 0.15))
		: clamp01(0.55 + Math.max(0, 0.32 - ratio) + Math.max(0, localMean - 0.025) * 3)
	return {
		isGradient,
		confidence,
		coverage: ratio,
		continuity: clamp01(farMean / 0.1),
		coherence: clamp01(1 - localMean / 0.05),
	}
}

function detectGradient(
	background: ParetoCandidate,
	surface: ParetoCandidate,
	analysis: RegionAnalysis,
	smooth: GradientEvidence,
): GradientEvidence {
	const difference = [
		surface.lab[0] - background.lab[0],
		surface.lab[1] - background.lab[1],
		surface.lab[2] - background.lab[2],
	] as const
	const squaredDistance = difference[0] ** 2 + difference[1] ** 2 + difference[2] ** 2
	const distance = Math.sqrt(squaredDistance)
	if (background === surface || distance <= epsilon) {
		return { isGradient: false, confidence: 1, coverage: 0, continuity: 0, coherence: 0 }
	}
	if (distance < 0.045) return { ...smooth }

	const binCount = 18
	const bins = new Uint32Array(binCount)
	const mask = new Uint8Array(analysis.width * analysis.height)
	let onPath = 0
	let intermediate = 0
	const tolerance = Math.max(0.016, distance * 0.16)
	for (let pixel = 0; pixel < mask.length; pixel++) {
		const lab = labAt(analysis.labs, pixel)
		const relative = [
			lab[0] - background.lab[0],
			lab[1] - background.lab[1],
			lab[2] - background.lab[2],
		] as const
		const projection = (
			relative[0] * difference[0] + relative[1] * difference[1] + relative[2] * difference[2]
		) / squaredDistance
		if (projection < -0.04 || projection > 1.04) continue
		const clampedProjection = clamp01(projection)
		const projected = [
			background.lab[0] + difference[0] * clampedProjection,
			background.lab[1] + difference[1] * clampedProjection,
			background.lab[2] + difference[2] * clampedProjection,
		] as const
		if (okDistance(lab, projected) > tolerance) continue
		onPath++
		bins[Math.min(binCount - 1, Math.floor(clampedProjection * binCount))]++
		if (clampedProjection > 0.12 && clampedProjection < 0.88) {
			mask[pixel] = 1
			intermediate++
		}
	}

	const coverage = mask.length === 0 ? 0 : onPath / mask.length
	const continuity = bins.slice(2, -2).filter((count) => count > 0).length / (binCount - 4)
	let largestComponent = 0
	let componentCount = 0
	const visited = new Uint8Array(mask.length)
	for (let start = 0; start < mask.length; start++) {
		if (!mask[start] || visited[start]) continue
		componentCount++
		let size = 0
		const stack = [start]
		visited[start] = 1
		while (stack.length > 0) {
			const pixel = stack.pop()!
			size++
			const x = pixel % analysis.width
			const y = Math.floor(pixel / analysis.width)
			const neighbors = [
				x > 0 ? pixel - 1 : -1,
				x + 1 < analysis.width ? pixel + 1 : -1,
				y > 0 ? pixel - analysis.width : -1,
				y + 1 < analysis.height ? pixel + analysis.width : -1,
			]
			for (const neighbor of neighbors) {
				if (neighbor >= 0 && mask[neighbor] && !visited[neighbor]) {
					visited[neighbor] = 1
					stack.push(neighbor)
				}
			}
		}
		largestComponent = Math.max(largestComponent, size)
	}
	const coherence = intermediate === 0 ? 0 : largestComponent / intermediate
	const intermediateRatio = mask.length === 0 ? 0 : intermediate / mask.length
	const rawConfidence = clamp01(
		coverage * 1.8 + continuity * 0.33 + coherence * 0.3 + intermediateRatio * 2.2 -
		Math.min(componentCount, 30) / 100,
	)
	const isGradient = coverage >= 0.08 && intermediateRatio >= 0.035 && continuity >= 0.55 && coherence >= 0.22
	if (smooth.isGradient && !isGradient) return { ...smooth }
	return {
		isGradient,
		confidence: isGradient ? rawConfidence : Math.max(smooth.confidence, 1 - rawConfidence * 0.65),
		coverage,
		continuity,
		coherence,
	}
}

function backgroundComponents(candidate: ParetoCandidate, maxPopulation: number): ParetoObjectiveComponents["background"] {
	const field = clamp01(
		coherentField(candidate) * 0.85 + candidate.background * 0.1 +
		Math.sqrt(candidate.population / Math.max(maxPopulation, epsilon)) * 0.05,
	)
	const risk = combinedFrameRisk(candidate)
	return { coherentField: field, frameRisk: risk, value: clamp01(field - risk * 0.72) }
}

function foregroundComponents(
	candidate: ParetoCandidate,
	maxPopulation: number,
): ParetoObjectiveComponents["foreground"] {
	const typographyEvidence = clamp01(
		candidate.text * 0.43 + candidate.saliency * 0.25 + detailEvidence(candidate) * 0.2 +
		Math.sqrt(candidate.population / Math.max(maxPopulation, epsilon)) * 0.12,
	)
	const extreme = Math.abs(candidate.lab[0] - 0.5) * 2
	const identity = clamp01(clamp01(candidate.chroma / 0.18) * 0.55 + extreme * 0.45)
	const source = candidate.generated ? 0 : 1
	return {
		typographyEvidence,
		identity,
		source,
		value: clamp01(typographyEvidence * 0.72 + identity * 0.18 + source * 0.1),
	}
}

function gradientObjective(evidence: GradientEvidence): number {
	if (!evidence.isGradient) return 0
	return clamp01(
		evidence.confidence * 0.4 + evidence.coverage * 0.2 +
		evidence.continuity * 0.2 + evidence.coherence * 0.2,
	)
}

function surfaceFieldEvidence(candidate: ParetoCandidate, maxPopulation: number): number {
	return clamp01(
		coherentField(candidate) * 0.62 + candidate.background * 0.18 +
		Math.sqrt(candidate.population / Math.max(maxPopulation, epsilon)) * 0.2 -
		combinedFrameRisk(candidate) * 0.35,
	)
}

function collapsedSurfaceEvidence(
	background: ParetoCandidate,
	surfaces: readonly ParetoCandidate[],
	maxPopulation: number,
): number {
	const strongestDistinctField = surfaces.reduce((strongest, candidate) => {
		if (candidate === background || okDistance(candidate.lab, background.lab) < minimumDistinctSurfaceDistance) {
			return strongest
		}
		return Math.max(strongest, surfaceFieldEvidence(candidate, maxPopulation))
	}, 0)
	return clamp01(1 - strongestDistinctField + 0.1)
}

function surfaceComponents(
	candidate: ParetoCandidate,
	background: ParetoCandidate,
	gradient: GradientEvidence,
	maxPopulation: number,
	collapseEvidence: number,
): ParetoObjectiveComponents["surface"] {
	const collapsed = candidate === background
	const fieldEvidence = surfaceFieldEvidence(candidate, maxPopulation)
	const gradientEvidence = collapsed ? 0 : gradientObjective(gradient)
	const calibratedCollapseEvidence = collapsed ? collapseEvidence : 0
	const model: SurfaceModel = collapsed ? "collapsed" : gradient.isGradient ? "gradient" : "field"
	const distinctEvidence = model === "gradient"
		? clamp01(fieldEvidence * 0.4 + gradientEvidence * 0.6)
		: fieldEvidence
	return {
		model,
		fieldEvidence,
		gradientEvidence,
		collapseEvidence: calibratedCollapseEvidence,
		value: collapsed ? calibratedCollapseEvidence : distinctEvidence,
	}
}

function accentComponents(
	candidate: ParetoCandidate,
	background: ParetoCandidate,
	surface: ParetoCandidate,
	maxPopulation: number,
): ParetoObjectiveComponents["accent"] {
	const identity = clamp01(
		clamp01(candidate.chroma / 0.18) * 0.31 + candidate.saliency * 0.27 +
		detailEvidence(candidate) * 0.17 + candidate.text * 0.1 +
		Math.sqrt(candidate.population / Math.max(maxPopulation, epsilon)) * 0.15,
	)
	const contrast = contrastRatio(candidate.rgb, background.rgb)
	const contrastVisibility = clamp01((contrast - minimumParetoAccentBackgroundContrast) / 3.3)
	const backgroundDistance = clamp01((okDistance(candidate.lab, background.lab) - 0.08) / 0.24)
	const surfaceDistance = clamp01((okDistance(candidate.lab, surface.lab) - 0.06) / 0.24)
	const visibility = clamp01(contrastVisibility * 0.45 + backgroundDistance * 0.35 + surfaceDistance * 0.2)
	return { identity, visibility, value: clamp01(identity * 0.65 + visibility * 0.35) }
}

function familyKey(candidate: ParetoCandidate): string {
	return String(candidate.familyId)
}

function familyIdentityWeights(candidates: readonly ParetoCandidate[]): Map<string, number> {
	const families = new Map<string, { population: number; saliency: number; detail: number }>()
	for (const candidate of candidates) {
		if (candidate.generated) continue
		const key = familyKey(candidate)
		const current = families.get(key) || { population: 0, saliency: 0, detail: 0 }
		current.population = Math.max(current.population, candidate.familySpatial.population)
		current.saliency = Math.max(current.saliency, candidate.saliency)
		current.detail = Math.max(current.detail, detailEvidence(candidate))
		families.set(key, current)
	}
	const weights = new Map<string, number>()
	for (const [key, family] of families) {
		weights.set(
			key,
			family.population * (0.2 + family.saliency * 0.8) * (0.45 + family.detail * 0.55),
		)
	}
	return weights
}

function identityCoverageComponents(
	roles: readonly ParetoCandidate[],
	weights: ReadonlyMap<string, number>,
): ParetoObjectiveComponents["salientIdentityCoverage"] {
	const selectedFamilies = new Set(roles.filter((candidate) => !candidate.generated).map(familyKey))
	let coveredWeight = 0
	let totalWeight = 0
	for (const [family, weight] of weights) {
		totalWeight += weight
		if (selectedFamilies.has(family)) coveredWeight += weight
	}
	const value = totalWeight > epsilon ? coveredWeight / totalWeight : selectedFamilies.size > 0 ? 1 : 0
	return { coveredWeight, totalWeight, value: clamp01(value) }
}

function buildSelection(
	background: ParetoCandidate,
	foreground: ParetoCandidate,
	surface: ParetoCandidate,
	accent: ParetoCandidate,
	gradient: GradientEvidence,
	maxPopulation: number,
	identityWeights: ReadonlyMap<string, number>,
	collapseEvidence: number,
): Selection {
	const backgroundObjective = backgroundComponents(background, maxPopulation)
	const foregroundObjective = foregroundComponents(foreground, maxPopulation)
	const surfaceObjective = surfaceComponents(surface, background, gradient, maxPopulation, collapseEvidence)
	const accentObjective = accentComponents(accent, background, surface, maxPopulation)
	const coverageObjective = identityCoverageComponents(
		[background, foreground, surface, accent],
		identityWeights,
	)
	const objectives: ParetoObjectiveVector = [
		backgroundObjective.value,
		foregroundObjective.value,
		surfaceObjective.value,
		accentObjective.value,
		coverageObjective.value,
	]
	return {
		background,
		foreground,
		surface,
		accent,
		surfaceModel: surfaceObjective.model,
		gradient,
		objectives,
		components: {
			background: backgroundObjective,
			foreground: foregroundObjective,
			surface: surfaceObjective,
			accent: accentObjective,
			salientIdentityCoverage: coverageObjective,
		},
		semanticKey: selectionSemanticKey(
			background,
			foreground,
			surface,
			accent,
			surfaceObjective.model,
		),
	}
}

function dominates(first: ParetoObjectiveVector, second: ParetoObjectiveVector): boolean {
	let strictlyBetter = false
	for (let index = 0; index < first.length; index++) {
		if (first[index] + epsilon < second[index]) return false
		if (first[index] > second[index] + epsilon) strictlyBetter = true
	}
	return strictlyBetter
}

function addToFrontier(frontier: Selection[], candidate: Selection): void {
	if (frontier.some((existing) => dominates(existing.objectives, candidate.objectives))) return
	for (let index = frontier.length - 1; index >= 0; index--) {
		if (dominates(candidate.objectives, frontier[index].objectives)) frontier.splice(index, 1)
	}
	frontier.push(candidate)
}

function compareVectors(first: ParetoObjectiveVector, second: ParetoObjectiveVector): number {
	for (let index = 0; index < first.length; index++) {
		if (Math.abs(first[index] - second[index]) <= epsilon) continue
		return first[index] < second[index] ? -1 : 1
	}
	return 0
}

function withRegret(frontier: readonly Selection[]): RegrettedSelection[] {
	const ideals = paretoObjectiveOrder.map((_, index) =>
		Math.max(...frontier.map((selection) => selection.objectives[index])))
	return frontier.map((selection) => {
		const regret = selection.objectives.map((value, index) =>
			ideals[index] - value) as unknown as ParetoObjectiveVector
		const lexicographicRegret = [...regret].sort((first, second) => second - first) as unknown as ParetoObjectiveVector
		return { ...selection, regret, lexicographicRegret }
	})
}

function nearestSourceDistance(candidate: ParetoCandidate, analysis: RegionAnalysis): number {
	let nearest = Infinity
	for (const region of analysis.regions) nearest = Math.min(nearest, okDistance(candidate.lab, region.lab))
	return Number.isFinite(nearest) ? nearest : 0
}

function roleColor(candidate: ParetoCandidate, analysis: RegionAnalysis): RoleColor {
	return {
		rgb: candidate.rgb,
		hex: candidate.hex,
		generated: candidate.generated,
		sourceDistance: nearestSourceDistance(candidate, analysis),
	}
}

function paletteMetrics(selection: Selection, analysis: RegionAnalysis): PaletteMetrics {
	const selected = [selection.background, selection.foreground, selection.surface, selection.accent]
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
		meanSourceDistance: selected.reduce((sum, candidate) => sum + nearestSourceDistance(candidate, analysis), 0) /
			selected.length,
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
		score: 0,
		metrics: paletteMetrics(selection, analysis),
	}
}

function frontierSummary(selection: RegrettedSelection): ParetoFrontierSummary {
	return {
		semanticKey: selection.semanticKey,
		roles: {
			background: roleSemanticKey(selection.background),
			foreground: roleSemanticKey(selection.foreground),
			surface: roleSemanticKey(selection.surface),
			accent: roleSemanticKey(selection.accent),
		},
		surfaceModel: selection.surfaceModel,
		objectiveVector: selection.objectives,
		regret: selection.regret,
		lexicographicRegret: selection.lexicographicRegret,
	}
}

function naturalAccentEligible(
	accent: ParetoCandidate,
	background: ParetoCandidate,
	foreground: ParetoCandidate,
	surface: ParetoCandidate,
): boolean {
	return accent !== background && accent !== foreground && accent !== surface &&
		contrastRatio(accent.rgb, background.rgb) >= minimumParetoAccentBackgroundContrast &&
		okDistance(accent.lab, background.lab) >= minimumParetoAccentBackgroundDistance &&
		okDistance(accent.lab, surface.lab) >= minimumParetoAccentSurfaceDistance &&
		okDistance(accent.lab, foreground.lab) >= minimumParetoAccentForegroundDistance
}

function collapsedAccentEligible(
	foreground: ParetoCandidate,
	background: ParetoCandidate,
	surface: ParetoCandidate,
): boolean {
	return contrastRatio(foreground.rgb, background.rgb) >= minimumParetoAccentBackgroundContrast &&
		okDistance(foreground.lab, background.lab) >= 0.025 &&
		okDistance(foreground.lab, surface.lab) >= 0.025
}

export function solveParetoPalette(
	candidates: readonly ParetoCandidate[],
	analysis: RegionAnalysis,
): { palette: Palette; certificate: ParetoPaletteCertificate } {
	if (candidates.length === 0) throw new Error("Cannot solve a Pareto palette without color candidates")

	const sourceCandidates = candidates.filter((candidate) => !candidate.generated)
		.sort((first, second) => compareAscii(candidateSemanticKey(first), candidateSemanticKey(second)))
	const backgrounds = sourceCandidates.filter((candidate) => !candidate.typographyOnly)
	if (backgrounds.length === 0) throw new Error("Cannot solve a Pareto palette without a source background candidate")
	const surfaces = sourceCandidates.filter((candidate) => !candidate.typographyOnly)
	const generated = [generatedCandidate([0, 0, 0], -1), generatedCandidate([255, 255, 255], -2)]
	const maxPopulation = Math.max(...sourceCandidates.map((candidate) => candidate.population), epsilon)
	const identityWeights = familyIdentityWeights(sourceCandidates)
	const smooth = smoothGradientEvidence(analysis)
	const gradientCache = new Map<string, GradientEvidence>()
	const gradientFor = (background: ParetoCandidate, surface: ParetoCandidate): GradientEvidence => {
		const key = `${candidateSemanticKey(background)}=>${candidateSemanticKey(surface)}`
		let evidence = gradientCache.get(key)
		if (!evidence) {
			evidence = detectGradient(background, surface, analysis, smooth)
			gradientCache.set(key, evidence)
		}
		return evidence
	}

	let attempted = 0
	let feasible = 0
	const frontier: Selection[] = []
	for (const background of backgrounds) {
		const foregrounds = foregroundPool(sourceCandidates, background, generated)
		const allowRepresentativeSurface = hasMultipleBackgroundFields(sourceCandidates, background)
		const collapseEvidence = collapsedSurfaceEvidence(background, surfaces, maxPopulation)
		for (const foreground of foregrounds) {
			const foregroundBackgroundContrast = contrastRatio(foreground.rgb, background.rgb)
			if (foregroundBackgroundContrast < foregroundBackgroundRequirement(foreground)) continue
			for (const surface of surfaces) {
				const foregroundSurfaceContrast = contrastRatio(foreground.rgb, surface.rgb)
				if (foregroundSurfaceContrast < foregroundSurfaceRequirement(
					foreground,
					background,
					allowRepresentativeSurface,
				)) continue
				const gradient = gradientFor(background, surface)
				const minimumSurfaceDistance = gradient.isGradient
					? minimumDistinctGradientSurfaceDistance
					: minimumDistinctSurfaceDistance
				if (surface !== background && okDistance(background.lab, surface.lab) < minimumSurfaceDistance) continue

				let naturalAccentCount = 0
				for (const accent of sourceCandidates) {
					attempted++
					if (!naturalAccentEligible(accent, background, foreground, surface)) continue
					naturalAccentCount++
					feasible++
					addToFrontier(frontier, buildSelection(
						background,
						foreground,
						surface,
						accent,
						gradient,
						maxPopulation,
						identityWeights,
						collapseEvidence,
					))
				}
				if (naturalAccentCount === 0) {
					attempted++
					if (!collapsedAccentEligible(foreground, background, surface)) continue
					feasible++
					addToFrontier(frontier, buildSelection(
						background,
						foreground,
						surface,
						foreground,
						gradient,
						maxPopulation,
						identityWeights,
						collapseEvidence,
					))
				}
			}
		}
	}

	if (frontier.length === 0) throw new Error("No feasible Pareto palette satisfies the role gates")
	const regretted = withRegret(frontier).sort((first, second) => {
		const regretOrder = compareVectors(first.lexicographicRegret, second.lexicographicRegret)
		return regretOrder || compareAscii(first.semanticKey, second.semanticKey)
	})
	const selected = regretted[0]
	const summaries = [...regretted]
		.sort((first, second) => compareAscii(first.semanticKey, second.semanticKey))
		.map(frontierSummary)
	const foregroundBackgroundActual = contrastRatio(selected.foreground.rgb, selected.background.rgb)
	const foregroundSurfaceActual = contrastRatio(selected.foreground.rgb, selected.surface.rgb)
	const allowRepresentativeSurface = hasMultipleBackgroundFields(sourceCandidates, selected.background)
	const certificate: ParetoPaletteCertificate = {
		counts: {
			attempted,
			feasible,
			frontier: frontier.length,
			dominated: feasible - frontier.length,
		},
		objectiveOrder: paretoObjectiveOrder,
		selected: {
			semanticKey: selected.semanticKey,
			objectiveVector: selected.objectives,
			objectiveComponents: selected.components,
			regret: selected.regret,
			lexicographicRegret: selected.lexicographicRegret,
			gates: {
				foregroundBackground: {
					actual: foregroundBackgroundActual,
					required: foregroundBackgroundRequirement(selected.foreground),
				},
				foregroundSurface: {
					actual: foregroundSurfaceActual,
					required: foregroundSurfaceRequirement(
						selected.foreground,
						selected.background,
						allowRepresentativeSurface,
					),
				},
				accentBackground: {
					actual: contrastRatio(selected.accent.rgb, selected.background.rgb),
					required: minimumParetoAccentBackgroundContrast,
				},
				accentBackgroundDistance: okDistance(selected.accent.lab, selected.background.lab),
				accentSurfaceDistance: okDistance(selected.accent.lab, selected.surface.lab),
				generatedFallbackNecessary: selected.foreground.generated,
			},
		},
		frontierSummaries: summaries,
		selectionRule: "lexicographic-minimax-regret-then-semantic-key",
		gradientHandling: {
			kind: "local-current-pixel-evidence",
			description: "The POC locally reproduces the canonical smooth and endpoint-path pixel evidence for each background/surface pair.",
			limitation: "Gradient evidence is pair-local and is not used to shortlist candidates; topology fields remain the non-gradient surface evidence.",
		},
	}
	return { palette: toPalette(selected, analysis), certificate }
}
