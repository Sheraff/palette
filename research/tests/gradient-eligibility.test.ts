import assert from "node:assert/strict"
import test from "node:test"
import { emptyCandidateSpatialEvidence, type Candidate } from "../src/candidates.ts"
import { mixOKLab, rgbToHex, rgbToOKLab } from "../src/color.ts"
import { analyzeGradientEligibility, decideGradientEligibility } from "../src/gradient-eligibility.ts"
import type { RegionAnalysis } from "../src/regions.ts"
import type { OKLab, RGB } from "../src/types.ts"

function candidate(id: number, rgb: RGB): Candidate {
	return {
		id,
		rgb,
		lab: rgbToOKLab(rgb),
		hex: rgbToHex(rgb),
		population: 0.5,
		background: 0.5,
		saliency: 0,
		text: 0,
		chroma: 0,
		generated: false,
		typographyOnly: false,
		regionIds: [],
		familyId: id,
		spatial: emptyCandidateSpatialEvidence(),
		familySpatial: emptyCandidateSpatialEvidence(),
	}
}

function analysis(width: number, height: number, at: (x: number, y: number) => OKLab): RegionAnalysis {
	const labs = new Float32Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const lab = at(x, y)
			const offset = (y * width + x) * 3
			labs[offset] = lab[0]
			labs[offset + 1] = lab[1]
			labs[offset + 2] = lab[2]
		}
	}
	return {
		regions: [],
		labels: new Int32Array(width * height),
		labs,
		edges: new Float32Array(width * height),
		data: new Uint8Array(width * height * 3),
		width,
		height,
	}
}

test("pair-specific eligibility recognizes a connected directional gradient", () => {
	const background = candidate(0, [18, 32, 68])
	const surface = candidate(1, [224, 170, 96])
	const width = 40
	const height = 32
	const evidence = analyzeGradientEligibility(background, surface, analysis(width, height, (x) =>
		mixOKLab(background.lab, surface.lab, x / (width - 1))))

	assert.equal(evidence.pairSpecific.isGradient, true)
	assert.ok(evidence.connectedField.coverage > 0.99)
	assert.equal(evidence.connectedField.continuity, 1)
	assert.ok(evidence.connectedField.localTransitionCoverage > 0.9)
	assert.ok(evidence.connectedField.directionalOrdering > 0.99)
	assert.equal(evidence.background.dominantFlat, false)
	assert.equal(evidence.surface.isolated, false)
	assert.deepEqual(decideGradientEligibility(evidence), {
		candidateVersion: "gradient-eligibility-0.8.6-dev",
		eligible: true,
		reason: "eligible",
	})
})

test("eligibility decisions reject stale evidence", () => {
	const background = candidate(0, [18, 32, 68])
	const surface = candidate(1, [224, 170, 96])
	const evidence = analyzeGradientEligibility(background, surface, analysis(20, 20, (x) =>
		mixOKLab(background.lab, surface.lab, x / 19)))

	assert.throws(() => decideGradientEligibility({
		...evidence,
		experimentVersion: "gradient-eligibility-0.1.0-dev",
	} as never), /Unsupported gradient eligibility evidence version/)
})

test("pair-specific eligibility exposes a flat background with an isolated surface object", () => {
	const background = candidate(0, [18, 18, 18])
	const surface = candidate(1, [190, 20, 35])
	const width = 40
	const height = 40
	const evidence = analyzeGradientEligibility(background, surface, analysis(width, height, (x, y) =>
		x >= 13 && x < 27 && y >= 11 && y < 29 ? surface.lab : background.lab))

	assert.equal(evidence.pairSpecific.isGradient, false)
	assert.equal(evidence.connectedField.continuity, 0)
	assert.equal(evidence.connectedField.localTransitionCoverage, 0)
	assert.equal(evidence.connectedField.abruptTransitionShare, 1)
	assert.equal(evidence.background.dominantFlat, true)
	assert.equal(evidence.surface.isolated, true)
	assert.ok(evidence.flatBackgroundIsolatedSurfaceRisk > 0.5)
	assert.equal(decideGradientEligibility(evidence).reason, "insufficient-spatial-continuity")
})

test("flat-field evidence tolerates a subject splitting the dominant endpoint", () => {
	const background = candidate(0, [245, 245, 242])
	const surface = candidate(1, [180, 160, 105])
	const width = 48
	const height = 48
	const evidence = analyzeGradientEligibility(background, surface, analysis(width, height, (x, y) => {
		if (x >= 8 && x < 40 && y >= 6 && y < 42) {
			if ((x + y) % 3 === 0) return surface.lab
			return rgbToOKLab([25, 28, 31])
		}
		return background.lab
	}))

	assert.equal(evidence.background.dominantFlat, true)
	assert.equal(evidence.surface.isolated, true)
	assert.ok(evidence.flatBackgroundIsolatedSurfaceRisk > 0.2)
})

test("complete color paths are rejected when flat-background isolation risk is strong", () => {
	const background = candidate(0, [20, 20, 20])
	const surface = candidate(1, [190, 30, 45])
	const evidence = analyzeGradientEligibility(background, surface, analysis(32, 32, (x) =>
		mixOKLab(background.lab, surface.lab, x / 31)))
	const risky = {
		...evidence,
		intermediateCoverage: evidence.colorPathCoverage * 0.2,
		colorPathDirectionalOrdering: 0,
		connectedField: { ...evidence.connectedField, directionalOrdering: 0 },
		flatBackgroundIsolatedSurfaceRisk: 0.4,
	}
	assert.deepEqual(decideGradientEligibility(risky), {
		candidateVersion: "gradient-eligibility-0.8.6-dev",
		eligible: false,
		reason: "flat-background-isolated-surface",
	})
})

test("broad non-flat intermediate fields survive the isolated-surface veto", () => {
	const background = candidate(0, [1, 1, 1])
	const surface = candidate(1, [86, 37, 86])
	const evidence = analyzeGradientEligibility(background, surface, analysis(40, 40, (x) =>
		mixOKLab(background.lab, surface.lab, x / 39)))
	const risky = {
		...evidence,
		intermediateCoverage: 0.2,
		colorPathDirectionalOrdering: 0,
		connectedField: { ...evidence.connectedField, directionalOrdering: 0 },
		flatBackgroundIsolatedSurfaceRisk: 0.4,
		surface: { ...evidence.surface, flatness: 0.2 },
	}

	assert.equal(decideGradientEligibility(risky).eligible, true)
	assert.equal(decideGradientEligibility({
		...risky,
		surface: { ...risky.surface, flatness: 0.201 },
	}).reason, "flat-background-isolated-surface")
})

test("an interrupted full-frame gradient remains eligible", () => {
	const background = candidate(0, [20, 35, 75])
	const surface = candidate(1, [225, 175, 100])
	const unrelated = rgbToOKLab([40, 190, 80])
	const width = 48
	const height = 40
	const evidence = analyzeGradientEligibility(background, surface, analysis(width, height, (x, y) =>
		x >= 17 && x < 31 && y >= 12 && y < 28
			? unrelated
			: mixOKLab(background.lab, surface.lab, x / (width - 1))))

	assert.equal(evidence.connectedField.continuity, 1)
	assert.equal(decideGradientEligibility(evidence).eligible, true)
})

test("a smooth ramp confined to a subject over a flat field is rejected", () => {
	const background = candidate(0, [16, 18, 20])
	const surface = candidate(1, [205, 40, 55])
	const width = 48
	const height = 40
	const evidence = analyzeGradientEligibility(background, surface, analysis(width, height, (x, y) => {
		if (x < 12 || x >= 36 || y < 8 || y >= 32) return background.lab
		return mixOKLab(background.lab, surface.lab, (x - 12) / 23)
	}))

	assert.equal(evidence.connectedField.continuity, 1)
	assert.equal(decideGradientEligibility(evidence).reason, "flat-background-isolated-surface")
})

test("two broad flat fields do not become a gradient", () => {
	const background = candidate(0, [25, 35, 55])
	const surface = candidate(1, [210, 160, 90])
	const width = 40
	const height = 32
	const evidence = analyzeGradientEligibility(background, surface, analysis(width, height, (x) =>
		x < width / 2 ? background.lab : surface.lab))

	assert.equal(evidence.connectedField.continuity, 0)
	assert.equal(decideGradientEligibility(evidence).reason, "insufficient-spatial-continuity")
})

test("a full-frame radial background remains eligible", () => {
	const background = candidate(0, [15, 25, 55])
	const surface = candidate(1, [225, 180, 110])
	const width = 48
	const height = 48
	const maximumRadius = Math.hypot((width - 1) / 2, (height - 1) / 2)
	const evidence = analyzeGradientEligibility(background, surface, analysis(width, height, (x, y) => {
		const radius = Math.hypot(x - (width - 1) / 2, y - (height - 1) / 2)
		return mixOKLab(surface.lab, background.lab, radius / maximumRadius)
	}))

	assert.equal(evidence.connectedField.continuity, 1)
	assert.equal(decideGradientEligibility(evidence).eligible, true)
})

test("limited missing core bins are tolerated only with substantial connected path support", () => {
	const background = candidate(0, [18, 32, 68])
	const surface = candidate(1, [224, 170, 96])
	const evidence = analyzeGradientEligibility(background, surface, analysis(40, 32, (x) =>
		mixOKLab(background.lab, surface.lab, x / 39)))
	const partial = {
		...evidence,
		connectedField: { ...evidence.connectedField, continuity: 11 / 14, coverage: 0.05, shareOfColorPath: 0.05 },
	}
	assert.equal(decideGradientEligibility(partial).eligible, true)
	assert.equal(decideGradientEligibility({
		...partial,
		colorPathDirectionalOrdering: 0,
		connectedField: { ...partial.connectedField, shareOfColorPath: 0.049 },
	}).reason, "insufficient-spatial-continuity")
})

test("directional color-path evidence bridges a full-height occlusion", () => {
	const background = candidate(0, [18, 32, 68])
	const surface = candidate(1, [224, 170, 96])
	const unrelated = rgbToOKLab([40, 190, 80])
	const width = 48
	const height = 40
	const evidence = analyzeGradientEligibility(background, surface, analysis(width, height, (x) =>
		x >= 23 && x < 25 ? unrelated : mixOKLab(background.lab, surface.lab, x / (width - 1))))

	assert.equal(evidence.connectedField.coverage, 0)
	assert.ok(evidence.intermediateCoverage / evidence.colorPathCoverage > 0.4)
	assert.ok(evidence.colorPathDirectionalOrdering > 0.9)
	assert.equal(decideGradientEligibility(evidence).eligible, true)
})

test("a sparse transition against a border background is rejected", () => {
	const background = candidate(0, [18, 32, 68])
	const surface = candidate(1, [224, 170, 96])
	const evidence = analyzeGradientEligibility(background, surface, analysis(40, 32, (x) =>
		mixOKLab(background.lab, surface.lab, x / 39)))
	const sparse = {
		...evidence,
		intermediateCoverage: 0.08,
		background: { ...evidence.background, borderCoverage: 0.03, coverage: 0.2 },
	}

	assert.equal(decideGradientEligibility(sparse).reason, "insufficient-progressive-field-support")
	assert.equal(decideGradientEligibility({
		...sparse,
		intermediateCoverage: 0.0801,
	}).eligible, true)
	assert.equal(decideGradientEligibility({
		...sparse,
		background: { ...sparse.background, borderCoverage: 0.0299 },
	}).eligible, true)
	assert.equal(decideGradientEligibility({
		...sparse,
		background: { ...sparse.background, coverage: 0.199 },
	}).eligible, true)
})

test("a coherent nonlinear path can bridge disconnected endpoint support", () => {
	const background = candidate(0, [160, 6, 30])
	const surface = candidate(1, [124, 25, 30])
	const evidence = analyzeGradientEligibility(background, surface, analysis(40, 32, (x) =>
		mixOKLab(background.lab, surface.lab, x / 39)))
	const nonlinear = {
		...evidence,
		intermediateCoverage: evidence.colorPathCoverage * 0.6,
		colorPathContinuity: 1,
		colorPathDirectionalOrdering: 0,
		pairSpecific: { ...evidence.pairSpecific, isGradient: true, coherence: 0.5 },
		connectedField: { ...evidence.connectedField, coverage: 0, continuity: 0, shareOfColorPath: 0 },
		background: { ...evidence.background, borderCoverage: 0.034 },
	}

	assert.equal(decideGradientEligibility(nonlinear).eligible, true)
	assert.equal(decideGradientEligibility({
		...nonlinear,
		pairSpecific: { ...nonlinear.pairSpecific, coherence: 0.499 },
	}).reason, "insufficient-spatial-continuity")
})

test("an exceptionally broad ten-bin field remains eligible", () => {
	const background = candidate(0, [16, 16, 16])
	const surface = candidate(1, [28, 28, 28])
	const evidence = analyzeGradientEligibility(background, surface, analysis(40, 32, (x) =>
		mixOKLab(background.lab, surface.lab, x / 39)))
	const broad = {
		...evidence,
		intermediateCoverage: 0.2,
		colorPathDirectionalOrdering: 0,
		connectedField: {
			...evidence.connectedField,
			continuity: 10 / 14,
			coverage: 0.7,
			shareOfColorPath: 0.9,
			directionalOrdering: 0.5,
			abruptTransitionShare: 0.2,
		},
	}

	assert.equal(decideGradientEligibility(broad).eligible, true)
	assert.equal(decideGradientEligibility({
		...broad,
		connectedField: { ...broad.connectedField, coverage: 0.699 },
	}).reason, "insufficient-spatial-continuity")
})

test("a highly separated sparse ordered path remains eligible", () => {
	const background = candidate(0, [253, 134, 147])
	const surface = candidate(1, [0, 120, 235])
	const evidence = analyzeGradientEligibility(background, surface, analysis(40, 32, (x) =>
		mixOKLab(background.lab, surface.lab, x / 39)))
	const ordered = {
		...evidence,
		endpointDistance: 0.2,
		intermediateCoverage: evidence.colorPathCoverage * 0.04,
		colorPathContinuity: 1,
		colorPathDirectionalOrdering: 0.85,
		pairSpecific: { ...evidence.pairSpecific, isGradient: false, coherence: 0 },
		connectedField: { ...evidence.connectedField, coverage: 0, continuity: 0, shareOfColorPath: 0 },
		surface: { ...evidence.surface, borderCoverage: 0 },
	}

	assert.equal(decideGradientEligibility(ordered).eligible, true)
	assert.equal(decideGradientEligibility({ ...ordered, endpointDistance: 0.199 }).reason,
		"insufficient-spatial-continuity")
})

test("a coherent sparse disconnected path remains eligible", () => {
	const background = candidate(0, [1, 44, 186])
	const surface = candidate(1, [20, 70, 164])
	const evidence = analyzeGradientEligibility(background, surface, analysis(40, 32, (x) =>
		mixOKLab(background.lab, surface.lab, x / 39)))
	const coherentSparse = {
		...evidence,
		endpointDistance: 0.15,
		colorPathCoverage: 0.11,
		intermediateCoverage: 0.01,
		colorPathContinuity: 13 / 14,
		colorPathDirectionalOrdering: 0.15,
		pairSpecific: { ...evidence.pairSpecific, isGradient: false, coherence: 0.301 },
		connectedField: { ...evidence.connectedField, coverage: 0, continuity: 0, shareOfColorPath: 0 },
		surface: { ...evidence.surface, borderCoverage: 0 },
	}

	assert.equal(decideGradientEligibility(coherentSparse).eligible, true)
	assert.equal(decideGradientEligibility({
		...coherentSparse,
		pairSpecific: { ...coherentSparse.pairSpecific, coherence: 0.3 },
	}).reason, "insufficient-spatial-continuity")
})

test("a weak disconnected path is rejected", () => {
	const background = candidate(0, [20, 35, 75])
	const surface = candidate(1, [70, 60, 35])
	const evidence = analyzeGradientEligibility(background, surface, analysis(40, 32, (x) =>
		mixOKLab(background.lab, surface.lab, x / 39)))
	const unsupported = {
		...evidence,
		endpointDistance: 0.15,
		colorPathCoverage: 0.11,
		intermediateCoverage: 0.04,
		colorPathDirectionalOrdering: 0.5,
		pairSpecific: { ...evidence.pairSpecific, coherence: 0.3 },
		connectedField: { ...evidence.connectedField, coverage: 0, continuity: 0, shareOfColorPath: 0 },
	}

	assert.equal(decideGradientEligibility(unsupported).reason, "unsupported-disconnected-color-path")
	assert.equal(decideGradientEligibility({ ...unsupported, colorPathCoverage: 0.111 }).eligible, true)
})

test("a fragmented connected path is rejected", () => {
	const background = candidate(0, [215, 216, 211])
	const surface = candidate(1, [223, 76, 18])
	const evidence = analyzeGradientEligibility(background, surface, analysis(40, 32, (x) =>
		mixOKLab(background.lab, surface.lab, x / 39)))
	const fragmented = {
		...evidence,
		connectedField: { ...evidence.connectedField, coverage: 0.09, shareOfColorPath: 0.2 },
	}

	assert.equal(decideGradientEligibility(fragmented).reason, "fragmented-connected-color-path")
	assert.equal(decideGradientEligibility({
		...fragmented,
		connectedField: { ...fragmented.connectedField, shareOfColorPath: 0.201 },
	}).eligible, true)
})

test("two broad border-connected flat fields are rejected", () => {
	const background = candidate(0, [237, 174, 134])
	const surface = candidate(1, [226, 110, 90])
	const evidence = analyzeGradientEligibility(background, surface, analysis(40, 32, (x) =>
		mixOKLab(background.lab, surface.lab, x / 39)))
	const separateFields = {
		...evidence,
		intermediateCoverage: evidence.colorPathCoverage * 0.17,
		background: { ...evidence.background, borderCoverage: 0.27 },
		surface: { ...evidence.surface, borderCoverage: 0.27 },
	}

	assert.equal(decideGradientEligibility(separateFields).reason, "separate-border-connected-flat-fields")
	assert.equal(decideGradientEligibility({
		...separateFields,
		background: { ...separateFields.background, borderCoverage: 0.269 },
	}).eligible, true)
	assert.equal(decideGradientEligibility({
		...separateFields,
		intermediateCoverage: evidence.colorPathCoverage * 0.171,
	}).eligible, true)
})

test("a sparse connected path over a fragmented background is rejected", () => {
	const background = candidate(0, [131, 119, 114])
	const surface = candidate(1, [137, 174, 208])
	const evidence = analyzeGradientEligibility(background, surface, analysis(40, 32, (x) =>
		mixOKLab(background.lab, surface.lab, x / 39)))
	const sparseConnected = {
		...evidence,
		pairSpecific: { ...evidence.pairSpecific, isGradient: false },
		intermediateCoverage: 0.04,
		connectedField: { ...evidence.connectedField, coverage: 0.05 },
		background: { ...evidence.background, coherence: 0.3, borderCoverage: 0 },
	}

	assert.equal(decideGradientEligibility(sparseConnected).reason, "insufficient-progressive-field-support")
	assert.equal(decideGradientEligibility({
		...sparseConnected,
		background: { ...sparseConnected.background, coherence: 0.301 },
	}).eligible, true)
})

test("a near-complete coherent field survives the flat-background risk veto", () => {
	const background = candidate(0, [0, 0, 0])
	const surface = candidate(1, [115, 6, 25])
	const evidence = analyzeGradientEligibility(background, surface, analysis(40, 32, (x) =>
		mixOKLab(background.lab, surface.lab, x / 39)))
	const coherentField = {
		...evidence,
		intermediateCoverage: 0.05,
		colorPathDirectionalOrdering: 0,
		pairSpecific: { ...evidence.pairSpecific, isGradient: true, coherence: 0.55 },
		connectedField: { ...evidence.connectedField, shareOfColorPath: 0.993, directionalOrdering: 0 },
		background: { ...evidence.background, coverage: 0.3, borderCoverage: 0.3, flatness: 1 },
		surface: { ...evidence.surface, coherence: 0.3, flatness: 1 },
		flatBackgroundIsolatedSurfaceRisk: 0.4,
	}

	assert.equal(decideGradientEligibility(coherentField).eligible, true)
	assert.equal(decideGradientEligibility({
		...coherentField,
		surface: { ...coherentField.surface, coherence: 0.301 },
	}).reason, "flat-background-isolated-surface")
})
