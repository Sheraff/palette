import assert from "node:assert/strict"
import test from "node:test"
import { chroma, mixOKLab, oklabToRGB, rgbToHex, rgbToOKLab } from "../src/color.ts"
import {
	analyzeFieldRelation,
	deriveSourceFieldEligibility,
	deriveSourceFieldEligibilityDomain,
	harmonicConjunction,
} from "../src/field-relation.ts"
import type { Candidate, CandidateSpatialEvidence, ColorFamilyRecord } from "../src/candidates.ts"
import type { PaletteEvidenceNode } from "../src/palette-evidence-graph.ts"
import type { RegionAnalysis } from "../src/regions.ts"
import type { OKLab, RGB } from "../src/types.ts"

function spatial(field: number, detail = 0.05, frame = 0): CandidateSpatialEvidence {
	return {
		population: 0.5,
		regionIds: [0],
		components: [{ population: 0.5, regionIds: [0], sideCoverage: [1, 1, 1, 1], saliency: detail, text: detail }],
		sideCoverage: [1, 1, 1, 1],
		field,
		detail,
		frame,
	}
}

function node(id: number, rgb: RGB, evidence = spatial(0.9)): PaletteEvidenceNode {
	const lab = rgbToOKLab(rgb)
	const candidate: Candidate = {
		id,
		rgb,
		lab,
		hex: rgbToHex(rgb),
		population: 0.5,
		background: 0.8,
		saliency: evidence.detail,
		text: evidence.detail,
		chroma: chroma(lab),
		generated: false,
		typographyOnly: false,
		regionIds: [0],
		familyId: id,
		spatial: evidence,
		familySpatial: evidence,
	}
	const family: ColorFamilyRecord = {
		id,
		anchorCandidateId: id,
		memberCandidateIds: [id],
		primaryCandidateIds: [id],
		mask: new Uint8Array(1),
		spatial: evidence,
	}
	return {
		id,
		stableKey: `${candidate.hex}:${id}`,
		rgb,
		lab,
		hex: candidate.hex,
		population: candidate.population,
		background: candidate.background,
		saliency: candidate.saliency,
		text: candidate.text,
		chroma: candidate.chroma,
		typographyOnly: false,
		regionIds: [0],
		spatial: evidence,
		familyId: id,
		familySpatial: evidence,
		mask: new Uint8Array(1),
		binIds: [id],
		representativePixelIndex: 0,
		family,
		candidate,
	}
}

function analysis(
	width: number,
	height: number,
	labAtPosition: (x: number, y: number) => OKLab,
): RegionAnalysis {
	const total = width * height
	const labs = new Float32Array(total * 3)
	const data = new Uint8Array(total * 3)
	const labels = new Int32Array(total)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const pixel = y * width + x
			const lab = labAtPosition(x, y)
			labs.set(lab, pixel * 3)
			data.set(oklabToRGB(lab), pixel * 3)
			labels[pixel] = x
		}
	}
	return {
		width,
		height,
		labs,
		data,
		labels,
		edges: new Float32Array(total),
		regions: Array.from({ length: width }, (_, x) => {
			const lab = labAtPosition(x, Math.floor(height / 2))
			return {
				id: x,
				area: height,
				population: 1 / width,
				centerX: x,
				centerY: (height - 1) / 2,
				lab,
				rgb: oklabToRGB(lab),
				borderPixels: height === 1 ? 1 : 2,
				sideCount: x === 0 || x === width - 1 ? 3 : 2,
				edge: 0,
				variance: 0,
				distinctiveness: 0,
				localContrast: 0,
				background: 1,
				saliency: 0,
				text: 0,
				chroma: chroma(lab),
				neighbors: [x - 1, x + 1].filter((neighbor) => neighbor >= 0 && neighbor < width),
			}
		}),
	}
}

const background = node(0, [18, 34, 74])
const surface = node(1, [226, 174, 92])

function relation(value: RegionAnalysis) {
	return analyzeFieldRelation(
		background,
		surface,
		deriveSourceFieldEligibility(background),
		deriveSourceFieldEligibility(surface),
		value,
	)
}

test("harmonic conjunction is zero preserving and bounded", () => {
	assert.equal(harmonicConjunction([1, 0, 1]), 0)
	assert.equal(harmonicConjunction([1, 1, 1]), 1)
	assert.ok(Math.abs(harmonicConjunction([0.5, 1]) - 2 / 3) < 1e-12)
})

test("source field eligibility excludes detail-dominated nodes", () => {
	const field = deriveSourceFieldEligibility(background)
	const detailNode = node(2, [143, 143, 143], spatial(0.01, 0.95))
	const detailSource = { ...detailNode, background: 0.01 }
	const domain = deriveSourceFieldEligibilityDomain([background, detailSource])
	const detail = domain.get(detailNode.id)!

	assert.equal(domain.get(background.id)!.eligible, true)
	assert.ok(field.support > 0.5)
	assert.equal(detail.eligible, false)
	assert.ok(detail.support < field.support)
})

test("broad linear progression prefers gradient relation", () => {
	const value = analysis(48, 32, (x) => mixOKLab(background.lab, surface.lab, x / 47))
	const evidence = relation(value)

	assert.ok(evidence.endpoint.mass > 0.8)
	assert.ok(evidence.topology.monotoneConnectivity > 0.5)
	assert.ok(evidence.stateSupport.gradient > evidence.stateSupport.distinctFlat)
	assert.ok(evidence.stateSupport.gradient > 0.5)
})

test("hard endpoint split prefers distinct flat relation", () => {
	const value = analysis(48, 32, (x) => x < 24 ? background.lab : surface.lab)
	const evidence = relation(value)

	assert.ok(evidence.endpoint.mass > 0.9)
	assert.ok(evidence.stateSupport.distinctFlat > evidence.stateSupport.gradient)
	assert.ok(evidence.stateSupport.distinctFlat > 0.5)
})

test("monotone connectivity penalizes a reversing endpoint sequence", () => {
	const monotone = relation(analysis(48, 32, (x) => mixOKLab(background.lab, surface.lab, x / 47)))
	const reversing = relation(analysis(48, 32, (x) => {
		const section = Math.min(3, Math.floor(x / 12))
		const values = [0.05, 0.8, 0.2, 0.95]
		return mixOKLab(background.lab, surface.lab, values[section])
	}))

	assert.ok(reversing.topology.monotoneConnectivity < monotone.topology.monotoneConnectivity)
	assert.ok(reversing.stateSupport.gradient < monotone.stateSupport.gradient)
})

test("subtle positive-distance gradients remain analyzable", () => {
	const subtleSurface = node(3, [205, 176, 107])
	const subtleBackground = node(4, [205, 172, 92])
	const subtle = analyzeFieldRelation(
		subtleBackground,
		subtleSurface,
		deriveSourceFieldEligibility(subtleBackground),
		deriveSourceFieldEligibility(subtleSurface),
		analysis(48, 32, (x) => mixOKLab(subtleBackground.lab, subtleSurface.lab, x / 47)),
	)

	assert.ok(subtle.endpointDistance > 0)
	assert.ok(subtle.endpointDistance < 0.025)
	assert.ok(subtle.stateSupport.gradient > 0.5)
})

test("ownership cannot rescue absent endpoint mass", () => {
	const local = analysis(48, 32, (x) => x < 47 ? background.lab : surface.lab)
	const evidence = relation(local)

	assert.ok(evidence.endpoint.mass < 0.2)
	assert.ok(evidence.stateSupport.distinctFlat < 0.4)
	assert.ok(evidence.stateSupport.gradient < 0.4)
})
