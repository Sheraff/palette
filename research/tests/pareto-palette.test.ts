import assert from "node:assert/strict"
import test from "node:test"
import { chroma, contrastRatio, okDistance, rgbToHex, rgbToOKLab } from "../src/color.ts"
import type {
	Candidate,
	CandidateComponentEvidence,
	CandidateSpatialEvidence,
} from "../src/candidates.ts"
import {
	minimumParetoAccentBackgroundContrast,
	paretoObjectiveOrder,
	solveParetoPalette,
	type ParetoFrontierSummary,
} from "../src/pareto-palette.ts"
import type { RegionAnalysis } from "../src/regions.ts"
import type { RGB } from "../src/types.ts"

type CandidateOptions = {
	population?: number
	background?: number
	saliency?: number
	text?: number
	typographyOnly?: boolean
	familyId?: number
	field?: number
	detail?: number
	frame?: number
	components?: number
	sideCoverage?: readonly [number, number, number, number]
	familyField?: number
	familyComponents?: number
	familyFrame?: number
}

function evidence(
	population: number,
	field: number,
	detail: number,
	frame: number,
	componentCount: number,
	sideCoverage: readonly [number, number, number, number],
	id: number,
): CandidateSpatialEvidence {
	const components: CandidateComponentEvidence[] = Array.from({ length: componentCount }, (_, index) => ({
		population: population / componentCount,
		regionIds: [id * 100 + index],
		sideCoverage,
		saliency: detail,
		text: detail,
	}))
	return {
		population,
		regionIds: components.flatMap((component) => component.regionIds),
		components,
		sideCoverage,
		field,
		detail,
		frame,
	}
}

function candidate(id: number, rgb: RGB, options: CandidateOptions = {}): Candidate {
	const population = options.population ?? 0.1
	const field = options.field ?? 0.2
	const detail = options.detail ?? 0.2
	const frame = options.frame ?? 0
	const components = options.components ?? 1
	const sideCoverage = options.sideCoverage ?? [0, 0, 0, 0]
	const lab = rgbToOKLab(rgb)
	return {
		id,
		rgb,
		lab,
		hex: rgbToHex(rgb),
		population,
		background: options.background ?? 0,
		saliency: options.saliency ?? 0.2,
		text: options.text ?? 0.2,
		chroma: chroma(lab),
		generated: false,
		typographyOnly: options.typographyOnly ?? false,
		regionIds: [id],
		familyId: options.familyId ?? id,
		spatial: evidence(population, field, detail, frame, components, sideCoverage, id),
		familySpatial: evidence(
			population,
			options.familyField ?? field,
			detail,
			options.familyFrame ?? frame,
			options.familyComponents ?? components,
			sideCoverage,
			id,
		),
	}
}

function analysis(colors: readonly RGB[]): RegionAnalysis {
	const pixel = colors[0]
	const lab = rgbToOKLab(pixel)
	return {
		width: 1,
		height: 1,
		data: new Uint8Array(pixel),
		labs: new Float32Array(lab),
		labels: new Int32Array([0]),
		edges: new Float32Array(1),
		regions: colors.map((rgb, id) => {
			const regionLab = rgbToOKLab(rgb)
			return {
				id,
				area: 1,
				population: 1 / colors.length,
				centerX: 0,
				centerY: 0,
				lab: regionLab,
				rgb,
				borderPixels: 0,
				sideCount: 0,
				edge: 0,
				variance: 0,
				distinctiveness: 0,
				localContrast: 0,
				background: id === 0 ? 1 : 0,
				saliency: id === 0 ? 0 : 0.5,
				text: id === 0 ? 0 : 0.5,
				chroma: chroma(regionLab),
				neighbors: [],
			}
		}),
	}
}

function solve(candidates: Candidate[]) {
	const colors = [...candidates]
		.sort((first, second) => first.hex < second.hex ? -1 : first.hex > second.hex ? 1 : 0)
		.map((value) => value.rgb)
	return solveParetoPalette(candidates, analysis(colors))
}

function relaxedTypographyCandidates(): Candidate[] {
	return [
		candidate(0, [24, 28, 35], {
			population: 0.62,
			background: 1,
			field: 0.95,
			detail: 0,
		}),
		candidate(1, [120, 120, 120], {
			population: 0.12,
			saliency: 0.9,
			text: 0.85,
			detail: 0.95,
			typographyOnly: true,
		}),
		candidate(2, [220, 40, 50], {
			population: 0.16,
			saliency: 0.9,
			text: 0.25,
			detail: 0.8,
			typographyOnly: true,
		}),
	]
}

test("enforces hard gates while preserving accepted foreground contrast tiers", () => {
	const candidates = relaxedTypographyCandidates()
	const result = solve(candidates)
	const gates = result.certificate.selected.gates

	assert.equal(result.palette.foreground.hex, "#787878")
	assert.equal(gates.foregroundBackground.required, 3)
	assert.ok(gates.foregroundBackground.actual >= 3 && gates.foregroundBackground.actual < 4.5)
	assert.ok(gates.foregroundSurface.actual >= gates.foregroundSurface.required)
	assert.ok(gates.accentBackground.actual >= minimumParetoAccentBackgroundContrast)
	assert.ok(result.certificate.counts.attempted >= result.certificate.counts.feasible)
	for (const summary of result.certificate.frontierSummaries) {
		assert.notEqual(summary.roles.accent, summary.roles.background)
	}
})

test("uses generated black or white only when no source foreground is feasible", () => {
	const background = candidate(0, [120, 120, 120], {
		population: 1,
		background: 1,
		field: 1,
		detail: 0,
	})
	const result = solve([background])

	assert.equal(result.palette.background.hex, background.hex)
	assert.equal(result.palette.surface.hex, background.hex)
	assert.equal(result.palette.foreground.hex, "#000000")
	assert.equal(result.palette.foreground.generated, true)
	assert.equal(result.palette.accent.hex, result.palette.foreground.hex)
	assert.equal(result.palette.accent.generated, true)
	assert.equal(result.certificate.selected.gates.generatedFallbackNecessary, true)
	assert.ok(result.palette.metrics.foregroundContrast >= 4.5)
	assert.equal(Object.keys(result.palette).sort().join(","), "accent,background,foreground,gradient,metrics,score,surface")
})

test("prefers explicit surface collapse when distinct candidates lack field or gradient evidence", () => {
	const candidates = [
		candidate(0, [18, 24, 32], { population: 0.75, background: 1, field: 0.95, detail: 0 }),
		candidate(1, [245, 245, 245], {
			population: 0.12,
			saliency: 0.8,
			text: 0.9,
			detail: 0.9,
			typographyOnly: true,
		}),
		candidate(2, [210, 40, 60], {
			population: 0.08,
			saliency: 0.9,
			detail: 0.9,
			typographyOnly: true,
		}),
		candidate(3, [55, 65, 75], { population: 0.001, field: 0, detail: 0 }),
	]
	const result = solve(candidates)

	assert.equal(result.palette.surface.hex, result.palette.background.hex)
	assert.equal(result.certificate.selected.objectiveComponents.surface.model, "collapsed")
	assert.ok(result.certificate.selected.objectiveComponents.surface.collapseEvidence > 0)
})

test("connected fields outrank equally supported fragmented fields", () => {
	const connected = candidate(0, [20, 28, 38], {
		population: 0.42,
		background: 0.9,
		field: 0.8,
		components: 1,
		familyId: 0,
		familyField: 0.8,
		familyComponents: 1,
	})
	const fragmented = candidate(1, [38, 30, 25], {
		population: 0.42,
		background: 0.9,
		field: 0.8,
		components: 6,
		familyId: 0,
		familyField: 0.8,
		familyComponents: 1,
	})
	const candidates = [
		connected,
		fragmented,
		candidate(2, [245, 245, 245], {
			population: 0.1,
			saliency: 0.8,
			text: 0.9,
			detail: 0.9,
			typographyOnly: true,
		}),
		candidate(3, [210, 45, 65], {
			population: 0.06,
			saliency: 0.9,
			detail: 0.9,
			typographyOnly: true,
		}),
	]

	assert.equal(solve(candidates).palette.background.hex, connected.hex)
})

test("population-aware frame evidence distinguishes a dominant surround from a thin frame", () => {
	const surroundingPopulation = 0.82
	const framePopulation = 0.08
	const surrounding = candidate(0, [20, 30, 45], {
		population: surroundingPopulation,
		background: 0.85,
		field: 0.82,
		frame: 1 - Math.sqrt(surroundingPopulation),
		familyFrame: 1 - Math.sqrt(surroundingPopulation),
		sideCoverage: [1, 1, 1, 1],
	})
	const frame = candidate(1, [45, 20, 25], {
		population: framePopulation,
		background: 1,
		field: 1,
		frame: 1 - Math.sqrt(framePopulation),
		familyFrame: 1 - Math.sqrt(framePopulation),
		sideCoverage: [1, 1, 1, 1],
	})
	const result = solve([
		surrounding,
		frame,
		candidate(2, [245, 245, 245], {
			population: 0.1,
			saliency: 0.8,
			text: 0.9,
			detail: 0.9,
			typographyOnly: true,
		}),
		candidate(3, [220, 55, 35], {
			population: 0.05,
			saliency: 0.9,
			detail: 0.9,
			typographyOnly: true,
		}),
	])

	assert.equal(result.palette.background.hex, surrounding.hex)
	assert.ok(Math.abs(
		result.certificate.selected.objectiveComponents.background.frameRisk -
		(1 - Math.sqrt(surroundingPopulation)),
	) < 1e-12)
})

test("collapses ordinary surfaces below canonical perceptual separation", () => {
	const background = candidate(0, [20, 30, 42], {
		population: 0.58,
		background: 1,
		field: 0.8,
		detail: 0,
	})
	const nearSurface = candidate(1, [28, 38, 50], {
		population: 0.24,
		background: 0.9,
		field: 1,
		detail: 0,
	})
	const distance = okDistance(background.lab, nearSurface.lab)
	assert.ok(distance > 0.025 && distance < 0.05)

	const result = solve([
		background,
		nearSurface,
		candidate(2, [245, 245, 245], {
			population: 0.1,
			saliency: 0.8,
			text: 0.9,
			detail: 0.9,
			typographyOnly: true,
		}),
		candidate(3, [220, 55, 35], {
			population: 0.05,
			saliency: 0.9,
			detail: 0.9,
			typographyOnly: true,
		}),
	])

	assert.equal(result.palette.surface.hex, result.palette.background.hex)
	assert.ok(result.certificate.frontierSummaries.every((summary) =>
		summary.surfaceModel === "collapsed" && summary.roles.surface === summary.roles.background))
})

test("a strong distinct field can outrank the calibrated collapse prior", () => {
	const background = candidate(0, [20, 30, 42], {
		population: 0.42,
		background: 1,
		field: 0.65,
		detail: 0,
	})
	const field = candidate(1, [55, 90, 125], {
		population: 0.38,
		background: 0.8,
		field: 1,
		detail: 0,
	})
	const result = solve([
		background,
		field,
		candidate(2, [245, 245, 245], {
			population: 0.12,
			saliency: 0.8,
			text: 0.9,
			detail: 0.9,
			typographyOnly: true,
		}),
		candidate(3, [220, 55, 35], {
			population: 0.08,
			saliency: 0.9,
			detail: 0.9,
			typographyOnly: true,
		}),
	])

	assert.notEqual(result.palette.background.hex, result.palette.surface.hex)
	assert.ok([background.hex, field.hex].includes(result.palette.background.hex))
	assert.ok([background.hex, field.hex].includes(result.palette.surface.hex))
	assert.equal(result.certificate.selected.objectiveComponents.surface.model, "field")
	assert.equal(result.palette.gradient.isGradient, false)
})

test("collapsed surfaces cannot retain image-level smooth gradient evidence", () => {
	const width = 16
	const height = 16
	const total = width * height
	const data = new Uint8Array(total * 3)
	const labs = new Float32Array(total * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const value = Math.round(30 + (x + y) / (width + height - 2) * 180)
			const pixel = y * width + x
			data.set([value, value, value], pixel * 3)
			labs.set(rgbToOKLab([value, value, value]), pixel * 3)
		}
	}
	const background = candidate(0, [80, 80, 80], {
		population: 1,
		background: 1,
		field: 1,
		detail: 0,
	})
	const regionLab = rgbToOKLab(background.rgb)
	const gradientAnalysis: RegionAnalysis = {
		width,
		height,
		data,
		labs,
		labels: new Int32Array(total),
		edges: new Float32Array(total),
		regions: [{
			id: 0,
			area: total,
			population: 1,
			centerX: 0.5,
			centerY: 0.5,
			lab: regionLab,
			rgb: background.rgb,
			borderPixels: 0,
			sideCount: 4,
			edge: 0,
			variance: 0,
			distinctiveness: 0,
			localContrast: 0,
			background: 1,
			saliency: 0,
			text: 0,
			chroma: 0,
			neighbors: [],
		}],
	}
	const result = solveParetoPalette([background], gradientAnalysis)

	assert.equal(result.certificate.selected.objectiveComponents.surface.model, "collapsed")
	assert.equal(result.palette.background.hex, result.palette.surface.hex)
	assert.equal(result.palette.gradient.isGradient, false)
})

function dominates(first: ParetoFrontierSummary, second: ParetoFrontierSummary): boolean {
	return first.objectiveVector.every((value, index) => value >= second.objectiveVector[index]) &&
		first.objectiveVector.some((value, index) => value > second.objectiveVector[index])
}

function compareRegret(first: ParetoFrontierSummary, second: ParetoFrontierSummary): number {
	for (let index = 0; index < paretoObjectiveOrder.length; index++) {
		const difference = first.lexicographicRegret[index] - second.lexicographicRegret[index]
		if (Math.abs(difference) > 1e-12) return difference
	}
	return first.semanticKey < second.semanticKey ? -1 : first.semanticKey > second.semanticKey ? 1 : 0
}

test("filters dominated vectors and selects deterministic lexicographic minimax regret", () => {
	const result = solve([
		...relaxedTypographyCandidates(),
		candidate(3, [35, 80, 160], {
			population: 0.1,
			saliency: 0.65,
			detail: 0.55,
			typographyOnly: true,
		}),
		candidate(4, [65, 72, 80], { population: 0.08, background: 0.5, field: 0.65 }),
	])
	const frontier = result.certificate.frontierSummaries

	assert.ok(result.certificate.counts.dominated > 0)
	for (const first of frontier) {
		for (const second of frontier) {
			if (first !== second) assert.equal(dominates(first, second), false)
		}
	}
	const minimax = [...frontier].sort(compareRegret)[0]
	assert.equal(result.certificate.selected.semanticKey, minimax.semanticKey)
	assert.deepEqual(result.certificate.selected.lexicographicRegret, minimax.lexicographicRegret)
})

test("is invariant to candidate permutation", () => {
	const candidates = [
		...relaxedTypographyCandidates(),
		candidate(3, [50, 65, 78], { population: 0.08, background: 0.5, field: 0.7 }),
	]
	assert.deepEqual(solve(candidates), solve([...candidates].reverse()))
})

test("preserves exact source provenance and keeps the certificate outside Palette", () => {
	const candidates = relaxedTypographyCandidates()
	const result = solve(candidates)
	const sources = new Map(candidates.map((value) => [value.hex, value.rgb]))

	for (const role of ["background", "foreground", "surface", "accent"] as const) {
		assert.equal(result.palette[role].generated, false)
		assert.deepEqual(result.palette[role].rgb, sources.get(result.palette[role].hex))
	}
	assert.equal(result.palette.score, 0)
	assert.equal("certificate" in result.palette, false)
	assert.equal(result.certificate.objectiveOrder.length, 5)
	assert.equal(result.certificate.selected.objectiveVector.length, 5)
	assert.equal(result.certificate.counts.frontier, result.certificate.frontierSummaries.length)
	assert.ok(contrastRatio(result.palette.background.rgb, result.palette.accent.rgb) >= 1.2)
})
