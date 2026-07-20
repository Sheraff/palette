import assert from "node:assert/strict"
import test from "node:test"
import type { Candidate, CandidateSpatialEvidence } from "../src/candidates.ts"
import { chroma, mixOKLab, okDistance, rgbToHex, rgbToOKLab } from "../src/color.ts"
import {
	analyzeGradientFieldTopology,
	GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION,
	type GradientFieldTopologyEvidence,
} from "../src/gradient-field-topology.ts"
import type { Region, RegionAnalysis } from "../src/regions.ts"
import type { OKLab, RGB } from "../src/types.ts"

type CandidateOptions = {
	detail?: number
	interior?: boolean
}

function spatial(options: CandidateOptions): CandidateSpatialEvidence {
	const detail = options.detail ?? 0
	const sideCoverage = options.interior ? [0, 0, 0, 0] as const : [0.35, 0.35, 0.35, 0.35] as const
	return {
		population: options.interior ? 0.18 : 0.24,
		regionIds: [],
		components: [{
			population: options.interior ? 0.18 : 0.24,
			regionIds: [],
			sideCoverage,
			saliency: detail,
			text: detail,
		}],
		sideCoverage,
		field: options.interior ? 0.38 : 0.84,
		detail,
		frame: 0,
	}
}

function candidate(id: number, rgb: RGB, options: CandidateOptions = {}): Candidate {
	const evidence = spatial(options)
	const lab = rgbToOKLab(rgb)
	return {
		id,
		rgb,
		lab,
		hex: rgbToHex(rgb),
		population: evidence.population,
		background: options.interior ? 0.35 : 0.9,
		saliency: options.detail ?? 0,
		text: options.detail ?? 0,
		chroma: chroma(lab),
		generated: false,
		typographyOnly: false,
		regionIds: [],
		familyId: id,
		spatial: evidence,
		familySpatial: evidence,
	}
}

function syntheticAnalysis(
	width: number,
	height: number,
	colorAt: (x: number, y: number) => OKLab,
	objectAt: (x: number, y: number) => number = () => 0,
	backgroundAt: (x: number, y: number) => number = () => 0.9,
): RegionAnalysis {
	const total = width * height
	const labs = new Float32Array(total * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) labs.set(colorAt(x, y), (y * width + x) * 3)
	}
	const labAt = (pixel: number): OKLab => [labs[pixel * 3], labs[pixel * 3 + 1], labs[pixel * 3 + 2]]
	const edges = new Float32Array(total)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const pixel = y * width + x
			let edge = 0
			if (x > 0) edge = Math.max(edge, okDistance(labAt(pixel), labAt(pixel - 1)) * 4)
			if (x + 1 < width) edge = Math.max(edge, okDistance(labAt(pixel), labAt(pixel + 1)) * 4)
			if (y > 0) edge = Math.max(edge, okDistance(labAt(pixel), labAt(pixel - width)) * 4)
			if (y + 1 < height) edge = Math.max(edge, okDistance(labAt(pixel), labAt(pixel + width)) * 4)
			edges[pixel] = edge
		}
	}

	const tileSize = 4
	const columns = Math.ceil(width / tileSize)
	const rows = Math.ceil(height / tileSize)
	const labels = new Int32Array(total)
	const regions: Region[] = Array.from({ length: columns * rows }, (_, id) => ({
		id,
		area: 0,
		population: 0,
		centerX: 0,
		centerY: 0,
		lab: [0, 0, 0],
		rgb: [0, 0, 0],
		borderPixels: 0,
		sideCount: 0,
		edge: 0,
		variance: 0,
		distinctiveness: 0,
		localContrast: 0,
		background: 0,
		saliency: 0,
		text: 0,
		chroma: 0,
		neighbors: [],
	}))
	const regionLabSums = regions.map(() => [0, 0, 0])
	const sideBits = new Uint8Array(regions.length)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const pixel = y * width + x
			const id = Math.floor(y / tileSize) * columns + Math.floor(x / tileSize)
			const region = regions[id]
			const lab = labAt(pixel)
			labels[pixel] = id
			region.area++
			region.centerX += x
			region.centerY += y
			regionLabSums[id][0] += lab[0]
			regionLabSums[id][1] += lab[1]
			regionLabSums[id][2] += lab[2]
			region.edge += edges[pixel]
			region.background += backgroundAt(x, y)
			region.saliency += objectAt(x, y)
			region.text += objectAt(x, y)
			if (x === 0 || x === width - 1 || y === 0 || y === height - 1) region.borderPixels++
			if (x === 0) sideBits[id] |= 1
			if (x === width - 1) sideBits[id] |= 2
			if (y === 0) sideBits[id] |= 4
			if (y === height - 1) sideBits[id] |= 8
		}
	}
	for (const region of regions) {
		region.population = region.area / total
		region.centerX /= region.area * Math.max(1, width - 1)
		region.centerY /= region.area * Math.max(1, height - 1)
		region.lab = [
			regionLabSums[region.id][0] / region.area,
			regionLabSums[region.id][1] / region.area,
			regionLabSums[region.id][2] / region.area,
		]
		region.edge /= region.area
		region.background /= region.area
		region.saliency /= region.area
		region.text /= region.area
		region.chroma = chroma(region.lab)
		region.sideCount = ((sideBits[region.id] & 1) ? 1 : 0) + ((sideBits[region.id] & 2) ? 1 : 0) +
			((sideBits[region.id] & 4) ? 1 : 0) + ((sideBits[region.id] & 8) ? 1 : 0)
	}
	const neighbors = regions.map(() => new Set<number>())
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const pixel = y * width + x
			for (const adjacent of [x + 1 < width ? pixel + 1 : -1, y + 1 < height ? pixel + width : -1]) {
				if (adjacent < 0 || labels[pixel] === labels[adjacent]) continue
				neighbors[labels[pixel]].add(labels[adjacent])
				neighbors[labels[adjacent]].add(labels[pixel])
			}
		}
	}
	for (const region of regions) region.neighbors = [...neighbors[region.id]]
	return { regions, labels, labs, edges, data: new Uint8Array(total * 3), width, height }
}

function assertNormalizedFinite(value: unknown, path = "evidence"): void {
	if (typeof value === "number") {
		assert.ok(Number.isFinite(value), `${path} is not finite`)
		assert.ok(value >= 0 && value <= 1, `${path} is outside [0, 1]: ${value}`)
		return
	}
	if (Array.isArray(value)) {
		value.forEach((entry, index) => assertNormalizedFinite(entry, `${path}[${index}]`))
		return
	}
	if (value && typeof value === "object") {
		for (const [key, entry] of Object.entries(value)) {
			if (key !== "evidenceVersion") assertNormalizedFinite(entry, `${path}.${key}`)
		}
	}
}

const background = candidate(0, [18, 34, 74])
const surface = candidate(1, [226, 174, 92])

function linearField(width = 48, height = 40): RegionAnalysis {
	return syntheticAnalysis(width, height, (x) => mixOKLab(background.lab, surface.lab, x / (width - 1)))
}

test("extracts broad topology and held-out progression from a linear field", () => {
	const evidence = analyzeGradientFieldTopology(background, surface, linearField())

	assert.equal(evidence.evidenceVersion, GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION)
	assert.ok(evidence.histogram.absolutePairCoverage > 0.99)
	assert.ok(evidence.histogram.normalizedEntropy > 0.98)
	assert.ok(evidence.histogram.endpointBalance > 0.99)
	assert.ok(evidence.histogram.endpointPresence > 0.99)
	assert.ok(evidence.histogram.intermediateExtent > 0.97)
	assert.ok(evidence.features.massDistribution > 0.95)
	assert.ok(evidence.features.endpointSupport > 0.95)
	assert.ok(evidence.features.topology > 0.3)
	assert.ok(evidence.progression.linearFit > 0.99)
	assert.ok(evidence.features.progression > 0.95)
	assert.ok(evidence.features.fieldOwnership > 0.7)
	assert.ok(evidence.features.distributionContinuity > 0.7)
	assert.ok(evidence.features.connectedIntermediateContinuity > 0.3)
	assert.ok(evidence.ownership.spatialFieldOwnership > 0.7)
	assert.ok(evidence.ownership.surfaceRoleOwnership > 0.8)
	assert.ok(evidence.ownership.foregroundLocality < 0.05)
	assert.ok(Math.abs(evidence.histogram.supportMass.reduce((sum, mass) => sum + mass, 0) - 1) < 1e-9)
})

test("quadratic held-out fits recognize an off-center radial glow", () => {
	const width = 52
	const height = 44
	const centerX = 0.31
	const centerY = 0.62
	const maximum = Math.max(
		centerX ** 2 + centerY ** 2,
		(1 - centerX) ** 2 + centerY ** 2,
		centerX ** 2 + (1 - centerY) ** 2,
		(1 - centerX) ** 2 + (1 - centerY) ** 2,
	)
	const analysis = syntheticAnalysis(width, height, (x, y) => {
		const normalizedX = x / (width - 1)
		const normalizedY = y / (height - 1)
		const u = ((normalizedX - centerX) ** 2 + (normalizedY - centerY) ** 2) / maximum
		return mixOKLab(background.lab, surface.lab, u)
	})
	const evidence = analyzeGradientFieldTopology(background, surface, analysis)

	assert.ok(evidence.progression.nonlinearFit > 0.99)
	assert.ok(evidence.progression.nonlinearFit > evidence.progression.linearFit + 0.2)
	assert.ok(evidence.features.massDistribution > 0)
	assert.ok(evidence.features.topology > 0)
})

test("nonlinear progression captures a perspective-like foreshortened field", () => {
	const width = 48
	const height = 40
	const analysis = syntheticAnalysis(width, height, (x) => {
		const normalized = x / (width - 1)
		return mixOKLab(background.lab, surface.lab, normalized ** 2)
	})
	const evidence = analyzeGradientFieldTopology(background, surface, analysis)

	assert.ok(evidence.progression.nonlinearFit > 0.99)
	assert.ok(evidence.progression.nonlinearFit > evidence.progression.linearFit)
	assert.ok(evidence.features.progression > 0.7)
	assert.ok(evidence.features.topology > 0)
})

test("two hard flat fields have endpoint mass without progressive topology", () => {
	const width = 48
	const hard = syntheticAnalysis(width, 40, (x) => x < width / 2 ? background.lab : surface.lab)
	const evidence = analyzeGradientFieldTopology(background, surface, hard)
	const smooth = analyzeGradientFieldTopology(background, surface, linearField())

	assert.ok(evidence.histogram.largestBinConcentration > 0.49)
	assert.ok(evidence.features.massDistribution < 0.25)
	assert.ok(evidence.histogram.intermediateExtent < 1e-6)
	assert.ok(evidence.features.topology < 1e-6)
	assert.ok(evidence.features.progression < 1e-6)
	assert.ok(evidence.legacyDiagnostics.lowEdgeAffinity < 0.1)
	assert.ok(smooth.features.progression > evidence.features.progression)
})

test("an interior object ramp remains object-local over a flat background", () => {
	const width = 48
	const height = 40
	const inside = (x: number, y: number): boolean => x >= 12 && x < 36 && y >= 8 && y < 32
	const analysis = syntheticAnalysis(
		width,
		height,
		(x, y) => inside(x, y)
			? mixOKLab(background.lab, surface.lab, (x - 12) / 23)
			: background.lab,
		(x, y) => inside(x, y) ? 0.92 : 0,
		(x, y) => inside(x, y) ? 0.15 : 0.95,
	)
	const objectSurface = candidate(1, surface.rgb, { detail: 0.92, interior: true })
	const evidence = analyzeGradientFieldTopology(background, objectSurface, analysis)
	const broad = analyzeGradientFieldTopology(background, surface, linearField(width, height))

	assert.equal(evidence.legacyDiagnostics.intermediateBorderReach, 0)
	assert.ok(evidence.legacyDiagnostics.interiorSurfaceSupport > 0.95)
	assert.ok(evidence.ownership.foregroundLocality > broad.ownership.foregroundLocality)
	assert.ok(evidence.ownership.intermediateLowObject < broad.ownership.intermediateLowObject)
	assert.ok(evidence.ownership.surfaceBackgroundAffinity < broad.ownership.surfaceBackgroundAffinity)
	assert.ok(evidence.features.fieldOwnership < broad.features.fieldOwnership - 0.2)
	assert.ok(evidence.topology.occlusionBurden > 0.15)
})

test("pair support ignores an unrelated gradient elsewhere", () => {
	const width = 48
	const height = 42
	const unrelatedFirst = rgbToOKLab([25, 205, 75])
	const unrelatedSecond = rgbToOKLab([205, 35, 210])
	const mixed = syntheticAnalysis(width, height, (x, y) => y < 12
		? mixOKLab(background.lab, surface.lab, x / (width - 1))
		: mixOKLab(unrelatedFirst, unrelatedSecond, x / (width - 1)))
	const evidence = analyzeGradientFieldTopology(background, surface, mixed)
	const exact = analyzeGradientFieldTopology(background, surface, linearField(width, height))

	assert.ok(evidence.histogram.absolutePairCoverage > 0.25)
	assert.ok(evidence.histogram.absolutePairCoverage < exact.histogram.absolutePairCoverage)
})

test("evidence is finite, normalized, deterministic, and safely zero below endpoint distance", () => {
	const analysis = linearField()
	const first = analyzeGradientFieldTopology(background, surface, analysis)
	const second = analyzeGradientFieldTopology(background, surface, analysis)
	assert.deepEqual(first, second)
	assertNormalizedFinite(first)

	const closeBackground = candidate(0, [100, 100, 100])
	const closeSurface = candidate(1, [102, 102, 102])
	assert.ok(okDistance(closeBackground.lab, closeSurface.lab) < 0.025)
	const rejected = analyzeGradientFieldTopology(closeBackground, closeSurface, analysis)
	assert.deepEqual(rejected.features, {
		endpointSupport: 0,
		massDistribution: 0,
		topology: 0,
		progression: 0,
		fieldOwnership: 0,
		distributionContinuity: 0,
		connectedIntermediateContinuity: 0,
	})
	assert.equal(rejected.histogram.absolutePairCoverage, 0)
	assertNormalizedFinite(rejected)
})

test("field evidence tolerates reflection and quarter-turn rotation", () => {
	const size = 48
	const forward = analyzeGradientFieldTopology(background, surface, linearField(size, size))
	const reflected = analyzeGradientFieldTopology(background, surface, syntheticAnalysis(size, size, (x) =>
		mixOKLab(background.lab, surface.lab, 1 - x / (size - 1))))
	const rotated = analyzeGradientFieldTopology(background, surface, syntheticAnalysis(size, size, (_, y) =>
		mixOKLab(background.lab, surface.lab, y / (size - 1))))

	for (const feature of ["endpointSupport", "massDistribution", "topology", "progression", "fieldOwnership",
		"distributionContinuity", "connectedIntermediateContinuity"] as const) {
		assert.ok(Math.abs(forward.features[feature] - reflected.features[feature]) < 0.02, feature)
		assert.ok(Math.abs(forward.features[feature] - rotated.features[feature]) < 0.02, feature)
	}
})

test("projected pair support is distance-scaled and endpoint-swap invariant", () => {
	const makeEndpoint = (base: Candidate, id: number, lab: OKLab): Candidate => ({ ...base, id, familyId: id, lab })
	const evidenceAtScale = (distance: number): GradientFieldTopologyEvidence => {
		const first = makeEndpoint(background, 0, [0.4, 0, 0])
		const second = makeEndpoint(surface, 1, [0.4 + distance, 0, 0])
		const color: OKLab = [0.4 + distance * 0.37, distance * 0.08, 0]
		return analyzeGradientFieldTopology(first, second, syntheticAnalysis(24, 20, () => color))
	}
	const short = evidenceAtScale(0.04)
	const long = evidenceAtScale(0.24)
	assert.ok(Math.abs(short.histogram.absolutePairCoverage - long.histogram.absolutePairCoverage) < 1e-6)

	const analysis = linearField()
	const forward = analyzeGradientFieldTopology(background, surface, analysis)
	const reverse = analyzeGradientFieldTopology(surface, background, analysis)
	for (const feature of ["endpointSupport", "massDistribution", "topology", "progression"] as const) {
		assert.ok(Math.abs(forward.features[feature] - reverse.features[feature]) < 1e-6, feature)
	}
	assert.ok(Math.abs(forward.histogram.absolutePairCoverage - reverse.histogram.absolutePairCoverage) < 1e-6)
	assert.ok(Math.abs(forward.histogram.endpointBalance - reverse.histogram.endpointBalance) < 1e-6)
	assert.ok(Math.abs(forward.topology.forwardConnectivity - reverse.topology.reverseConnectivity) < 1e-6)
	assert.ok(Math.abs(forward.topology.reverseConnectivity - reverse.topology.forwardConnectivity) < 1e-6)
	assert.ok(Math.abs(forward.ownership.spatialFieldOwnership - reverse.ownership.spatialFieldOwnership) < 1e-6)
	assert.ok(Math.abs(forward.ownership.intermediateLowObject - reverse.ownership.intermediateLowObject) < 1e-6)
})

test("absolute extent separates a full field from unsupported local ramps", () => {
	const width = 48
	const height = 40
	const unrelated = rgbToOKLab([25, 205, 75])
	const local = (left: number, right: number, top: number, bottom: number): GradientFieldTopologyEvidence =>
		analyzeGradientFieldTopology(background, surface, syntheticAnalysis(width, height, (x, y) => {
			if (x < left || x >= right || y < top || y >= bottom) return unrelated
			return mixOKLab(background.lab, surface.lab, (x - left) / Math.max(1, right - left - 1))
		}))
	const broad = analyzeGradientFieldTopology(background, surface, linearField(width, height))
	const small = local(18, 30, 10, 30)
	const medium = local(12, 36, 8, 32)
	const large = local(6, 42, 4, 36)

	assert.ok(broad.histogram.normalizedEntropy > medium.histogram.normalizedEntropy - 0.03)
	assert.ok(broad.features.massDistribution > large.features.massDistribution)
	assert.ok(large.features.massDistribution > medium.features.massDistribution)
	assert.ok(medium.features.massDistribution > small.features.massDistribution)
	assert.ok(broad.histogram.intermediateExtent > large.histogram.intermediateExtent)
	assert.ok(large.histogram.intermediateExtent > medium.histogram.intermediateExtent)
	assert.ok(medium.histogram.intermediateExtent > small.histogram.intermediateExtent)
	assert.ok(broad.features.progression > large.features.progression)
	assert.ok(large.features.progression > medium.features.progression)
	assert.ok(medium.features.progression > small.features.progression)
})

test("spatial arrangement separates fields with the same color histogram", () => {
	const width = 48
	const height = 40
	const ordered = analyzeGradientFieldTopology(background, surface, linearField(width, height))
	const shuffled = analyzeGradientFieldTopology(background, surface, syntheticAnalysis(width, height, (x, y) =>
		mixOKLab(background.lab, surface.lab, ((x * 17 + y * 31) % width) / (width - 1))))

	assert.ok(Math.abs(ordered.histogram.normalizedEntropy - shuffled.histogram.normalizedEntropy) < 1e-6)
	assert.ok(Math.abs(ordered.features.massDistribution - shuffled.features.massDistribution) < 1e-6)
	assert.ok(ordered.features.progression > shuffled.features.progression)
	assert.ok(ordered.features.topology > shuffled.features.topology)
})

test("missing endpoints cannot be rescued by a broad middle-only distribution", () => {
	const width = 48
	const middleOnly = analyzeGradientFieldTopology(background, surface, syntheticAnalysis(width, 40, (x) =>
		mixOKLab(background.lab, surface.lab, 0.2 + 0.6 * x / (width - 1))))

	assert.equal(middleOnly.histogram.backgroundEndpointShare, 0)
	assert.equal(middleOnly.histogram.surfaceEndpointShare, 0)
	assert.equal(middleOnly.histogram.endpointBalance, 0)
	assert.equal(middleOnly.histogram.endpointPresence, 0)
	assert.equal(middleOnly.features.endpointSupport, 0)
	assert.equal(middleOnly.features.massDistribution, 0)
	assert.ok(middleOnly.histogram.normalizedEntropy > 0.8)
})

test("core field evidence tolerates rectangular rotation and resize", () => {
	const field = (width: number, height: number, vertical: boolean): GradientFieldTopologyEvidence =>
		analyzeGradientFieldTopology(background, surface, syntheticAnalysis(width, height, (x, y) =>
			mixOKLab(background.lab, surface.lab, vertical ? y / (height - 1) : x / (width - 1))))
	const horizontal = field(64, 32, false)
	const rotated = field(32, 64, true)
	const resized = field(48, 24, false)

	for (const feature of ["endpointSupport", "massDistribution", "progression", "fieldOwnership"] as const) {
		assert.ok(Math.abs(horizontal.features[feature] - rotated.features[feature]) < 1e-6, feature)
		assert.ok(Math.abs(horizontal.features[feature] - resized.features[feature]) < 0.03, feature)
	}
	assert.ok(Math.abs(horizontal.features.topology - rotated.features.topology) < 0.03)
	assert.ok(Math.abs(horizontal.ownership.spatialFieldOwnership - rotated.ownership.spatialFieldOwnership) < 1e-6)
})

test("active ownership is invariant to all candidate metadata", () => {
	const analysis = linearField()
	const baseline = analyzeGradientFieldTopology(background, surface, analysis)
	const extremeSpatial: CandidateSpatialEvidence = {
		population: 0.001,
		regionIds: [999],
		components: [{
			population: 0.001,
			regionIds: [999],
			sideCoverage: [0, 0, 0, 0],
			saliency: 1,
			text: 1,
		}],
		sideCoverage: [0, 0, 0, 0],
		field: 0,
		detail: 1,
		frame: 1,
	}
	const mutate = (value: Candidate): Candidate => ({
		...value,
		population: 0.001,
		background: 0,
		saliency: 1,
		text: 1,
		typographyOnly: true,
		regionIds: [999],
		spatial: extremeSpatial,
		familySpatial: extremeSpatial,
	})
	const mutated = analyzeGradientFieldTopology(mutate(background), mutate(surface), analysis)

	assert.deepEqual(mutated.features, baseline.features)
	assert.deepEqual(mutated.histogram, baseline.histogram)
	assert.deepEqual(mutated.topology, baseline.topology)
	assert.deepEqual(mutated.progression, baseline.progression)
	assert.deepEqual(mutated.ownership, baseline.ownership)
	assert.notDeepEqual(mutated.legacyDiagnostics.candidates, baseline.legacyDiagnostics.candidates)
})

test("foreground ownership rejects the same interior ramp over unrelated and endpoint backgrounds", () => {
	const width = 48
	const height = 40
	const unrelated = rgbToOKLab([25, 205, 75])
	const inside = (x: number, y: number): boolean => x >= 12 && x < 36 && y >= 8 && y < 32
	const analyze = (outside: OKLab): GradientFieldTopologyEvidence => analyzeGradientFieldTopology(
		background,
		surface,
		syntheticAnalysis(
			width,
			height,
			(x, y) => inside(x, y) ? mixOKLab(background.lab, surface.lab, (x - 12) / 23) : outside,
			(x, y) => inside(x, y) ? 0.9 : 0,
			(x, y) => inside(x, y) ? 0.1 : 0.95,
		),
	)
	const unrelatedBackground = analyze(unrelated)
	const endpointBackground = analyze(background.lab)
	const broad = analyzeGradientFieldTopology(background, surface, linearField(width, height))

	for (const local of [unrelatedBackground, endpointBackground]) {
		assert.ok(local.ownership.intermediateLowObject < broad.ownership.intermediateLowObject)
		assert.ok(local.ownership.surfaceRoleOwnership < broad.ownership.surfaceRoleOwnership)
		assert.ok(local.ownership.spatialFieldOwnership < broad.ownership.spatialFieldOwnership)
		assert.ok(local.features.fieldOwnership < broad.features.fieldOwnership)
		assert.ok(local.ownership.foregroundLocality > broad.ownership.foregroundLocality)
	}
})

test("role ownership separates sparse background and foreground fields with identical geometry", () => {
	const width = 64
	const height = 48
	const inside = (x: number, y: number): boolean => x >= 20 && x < 44 && y >= 16 && y < 32
	const unrelated = rgbToOKLab([25, 205, 75])
	const analyze = (object: number, backgroundAffinity: number): GradientFieldTopologyEvidence =>
		analyzeGradientFieldTopology(background, surface, syntheticAnalysis(
			width,
			height,
			(x, y) => inside(x, y) ? mixOKLab(background.lab, surface.lab, (x - 20) / 23) : unrelated,
			(x, y) => inside(x, y) ? object : 0,
			(x, y) => inside(x, y) ? backgroundAffinity : 0.1,
		))
	const backgroundOwned = analyze(0, 0.9)
	const foregroundOwned = analyze(0.9, 0.1)

	assert.ok(Math.abs(backgroundOwned.ownership.spatialFieldOwnership -
		foregroundOwned.ownership.spatialFieldOwnership) < 1e-9)
	assert.ok(backgroundOwned.ownership.surfaceRoleOwnership > foregroundOwned.ownership.surfaceRoleOwnership)
	assert.ok(backgroundOwned.features.fieldOwnership > foregroundOwned.features.fieldOwnership)
	assert.ok(backgroundOwned.ownership.foregroundLocality < foregroundOwned.ownership.foregroundLocality)
})

test("directed role ownership preserves a broad one-sided gradient", () => {
	const width = 64
	const height = 48
	const analyze = (coordinate: (x: number) => number): GradientFieldTopologyEvidence =>
		analyzeGradientFieldTopology(background, surface, syntheticAnalysis(width, height, (x) =>
			mixOKLab(background.lab, surface.lab, coordinate(x)), () => 0, () => 0.9))
	const balanced = analyze((x) => x / (width - 1))
	const oneSided = analyze((x) => 0.05 + 0.62 * x / (width - 1))

	assert.ok(oneSided.histogram.endpointBalance < balanced.histogram.endpointBalance)
	assert.ok(Math.abs(oneSided.ownership.intermediateLowObject - balanced.ownership.intermediateLowObject) < 1e-9)
	assert.ok(Math.abs(oneSided.ownership.surfaceBackgroundAffinity - balanced.ownership.surfaceBackgroundAffinity) < 1e-6)
	assert.ok(oneSided.ownership.surfaceRoleOwnership > 0.8)
	assert.ok(oneSided.features.fieldOwnership > 0.7)
})

test("spatial ownership rescues a broad salient radial field", () => {
	const width = 56
	const height = 48
	const centerX = 0.43
	const centerY = 0.54
	const maximum = Math.max(
		centerX ** 2 + centerY ** 2,
		(1 - centerX) ** 2 + centerY ** 2,
		centerX ** 2 + (1 - centerY) ** 2,
		(1 - centerX) ** 2 + (1 - centerY) ** 2,
	)
	const evidence = analyzeGradientFieldTopology(background, surface, syntheticAnalysis(
		width,
		height,
		(x, y) => {
			const dx = x / (width - 1) - centerX
			const dy = y / (height - 1) - centerY
			return mixOKLab(background.lab, surface.lab, (dx ** 2 + dy ** 2) / maximum)
		},
		() => 0.9,
		() => 0.1,
	))

	assert.ok(evidence.ownership.surfaceRoleOwnership < evidence.ownership.spatialFieldOwnership)
	assert.ok(evidence.ownership.spatialFieldOwnership > 0.4)
	assert.ok(evidence.features.fieldOwnership > 0.4)
	assert.ok(evidence.progression.nonlinearFit > 0.99)
})

test("surface role evidence is intentionally directed while spatial evidence is endpoint-symmetric", () => {
	const width = 48
	const height = 40
	const analysis = syntheticAnalysis(
		width,
		height,
		(x) => mixOKLab(background.lab, surface.lab, x / (width - 1)),
		() => 0,
		(x) => 0.1 + 0.8 * x / (width - 1),
	)
	const forward = analyzeGradientFieldTopology(background, surface, analysis)
	const reverse = analyzeGradientFieldTopology(surface, background, analysis)

	assert.ok(Math.abs(forward.ownership.spatialFieldOwnership - reverse.ownership.spatialFieldOwnership) < 1e-6)
	assert.ok(Math.abs(forward.ownership.intermediateBackgroundAffinity -
		reverse.ownership.intermediateBackgroundAffinity) < 1e-6)
	assert.ok(Math.abs(forward.ownership.intermediateLowObject - reverse.ownership.intermediateLowObject) < 1e-6)
	assert.notEqual(forward.ownership.surfaceBackgroundAffinity, reverse.ownership.surfaceBackgroundAffinity)
	assert.notEqual(forward.features.fieldOwnership, reverse.features.fieldOwnership)
})

test("equal-lightness chromatic fields do not depend on edge luminance", () => {
	const first = { ...background, lab: [0.62, -0.16, 0.02] as OKLab }
	const second = { ...surface, lab: [0.62, 0.16, -0.02] as OKLab }
	const width = 48
	const smooth = analyzeGradientFieldTopology(first, second, syntheticAnalysis(width, 40, (x) =>
		mixOKLab(first.lab, second.lab, x / (width - 1))))
	const hard = analyzeGradientFieldTopology(first, second, syntheticAnalysis(width, 40, (x) =>
		x < width / 2 ? first.lab : second.lab))

	assert.ok(smooth.features.fieldOwnership > hard.features.fieldOwnership)
	assert.ok(smooth.ownership.spatialFieldOwnership > hard.ownership.spatialFieldOwnership)
	assert.ok(smooth.features.connectedIntermediateContinuity > hard.features.connectedIntermediateContinuity)
})
