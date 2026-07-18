import assert from "node:assert/strict"
import test from "node:test"
import { contrastRatio, rgbToHex } from "../src/color.ts"
import {
	CandidateValidationError,
	validateCandidateArtifacts,
	validateCandidateSummaryVersions,
} from "../src/candidate-validation.ts"
import type { RGB } from "../src/types.ts"

const candidateVersion = "region-graph-9.9.9"
const baselineVersion = "region-graph-1.0.0"

function role(rgb: RGB, generated = false) {
	return { rgb, hex: rgbToHex(rgb), generated, sourceDistance: 0 }
}

function candidate(rgb: RGB) {
	return {
		rgb,
		hex: rgbToHex(rgb),
		population: 0.25,
		background: 0.25,
		saliency: 0.25,
		text: 0.25,
		chroma: 0.1,
	}
}

function palette() {
	const background = role([255, 255, 255])
	const foreground = role([0, 0, 0])
	const surface = role([240, 240, 240])
	const accent = role([0, 0, 255])
	return {
		background,
		foreground,
		surface,
		accent,
		gradient: { isGradient: false, confidence: 1, coverage: 0, continuity: 0, coherence: 0 },
		score: 1,
		metrics: {
			foregroundContrast: contrastRatio(background.rgb, foreground.rgb),
			foregroundSurfaceContrast: contrastRatio(surface.rgb, foreground.rgb),
			accentContrast: contrastRatio(background.rgb, accent.rgb),
			accentSurfaceContrast: contrastRatio(surface.rgb, accent.rgb),
			minimumRoleDistance: 0.1,
			meanSourceDistance: 0,
			meanReconstructionError: 0,
		},
	}
}

function refreshContrasts(value: ReturnType<typeof palette>): void {
	value.metrics.foregroundContrast = contrastRatio(value.background.rgb, value.foreground.rgb)
	value.metrics.foregroundSurfaceContrast = contrastRatio(value.surface.rgb, value.foreground.rgb)
	value.metrics.accentContrast = contrastRatio(value.background.rgb, value.accent.rgb)
	value.metrics.accentSurfaceContrast = contrastRatio(value.surface.rgb, value.accent.rgb)
}

function extraction() {
	const candidates = [
		candidate([255, 255, 255]),
		candidate([0, 0, 0]),
		candidate([240, 240, 240]),
		candidate([0, 0, 255]),
	]
	return {
		version: candidateVersion,
		width: 224,
		height: 224,
		methods: { spatial: palette(), expressive: palette(), quantized: palette() },
		candidates,
		diagnostics: { regionCount: 4, candidateCount: candidates.length, processingMs: 0 },
	}
}

function entry(file: string, kind: "artwork" | "holdout", review: boolean) {
	return { file, kind, review, width: 224, height: 224, extraction: extraction() }
}

function artifacts() {
	const results = {
		generatedAt: "2026-01-01T00:00:00.000Z",
		algorithmVersion: candidateVersion,
		entries: Array.from({ length: 37 }, (_, index) => entry(`development-${index}.jpg`, "artwork", true)),
	}
	const holdoutResults = {
		generatedAt: "2026-01-01T00:00:00.000Z",
		algorithmVersion: candidateVersion,
		entries: Array.from({ length: 355 }, (_, index) =>
			entry(`00/${index.toString().padStart(40, "0")}.jpg`, "holdout", false)),
	}
	return {
		results,
		holdoutResults,
		baselineResults: {
			generatedAt: results.generatedAt,
			algorithmVersion: baselineVersion,
			entries: results.entries.map((value) => ({ ...value })),
		},
		baselineHoldoutResults: {
			generatedAt: holdoutResults.generatedAt,
			algorithmVersion: baselineVersion,
			entries: holdoutResults.entries.map((value) => ({ ...value })),
		},
	}
}

function validateFixture(fixture: ReturnType<typeof artifacts>) {
	return validateCandidateArtifacts(
		fixture.results,
		fixture.holdoutResults,
		fixture.baselineResults,
		fixture.baselineHoldoutResults,
	)
}

function useValidGeneratedFallback(extractionValue: ReturnType<typeof extraction>): void {
	const sourceAccent: RGB = [220, 180, 180]
	extractionValue.candidates = [candidate([255, 255, 255]), candidate([240, 240, 240]), candidate(sourceAccent)]
	extractionValue.diagnostics.candidateCount = extractionValue.candidates.length
	for (const method of ["spatial", "expressive"] as const) {
		const value = extractionValue.methods[method]
		value.foreground = role([0, 0, 0], true)
		value.accent = role(sourceAccent)
		refreshContrasts(value)
	}
	const quantized = extractionValue.methods.quantized
	quantized.foreground = role([0, 0, 0], true)
	quantized.accent = role([0, 0, 0], true)
	refreshContrasts(quantized)
}

function expectViolations(run: () => unknown, patterns: RegExp[]): void {
	assert.throws(run, (error: unknown) => {
		assert.ok(error instanceof CandidateValidationError)
		for (const pattern of patterns) assert.match(error.message, pattern)
		return true
	})
}

test("valid candidate artifacts return hard-gate counts with zero violations", () => {
	const fixture = artifacts()
	const summary = validateFixture(fixture)
	assert.deepEqual(summary, {
		algorithmVersion: candidateVersion,
		development: {
			entries: 37,
			generatedForegrounds: 0,
			relaxedBackgrounds: 0,
			relaxedSurfaces: 0,
			collapsedSurfaces: 0,
			gradients: 0,
		},
		holdout: {
			entries: 355,
			generatedForegrounds: 0,
			relaxedBackgrounds: 0,
			relaxedSurfaces: 0,
			collapsedSurfaces: 0,
			gradients: 0,
		},
		violations: 0,
	})

	useValidGeneratedFallback(fixture.results.entries[0].extraction)
	const generatedSummary = validateFixture(fixture)
	assert.equal(generatedSummary.development.generatedForegrounds, 1)
})

test("version, coverage, deduplication, and metadata violations are aggregated", () => {
	const fixture = artifacts()
	fixture.results.entries.pop()
	fixture.results.entries[0].file = "development-scrambled.jpg"
	fixture.results.entries[0].extraction.version = baselineVersion
	fixture.holdoutResults.entries[0].file = "00/ab67616d0000b273duplicate.jpg"
	fixture.holdoutResults.entries[1].file = "00/duplicate.jpg"
	fixture.holdoutResults.algorithmVersion = baselineVersion
	;(fixture.results as unknown as Record<string, unknown>).unexpected = true

	expectViolations(
		() => validateFixture(fixture),
		[/unexpected fields/, /exactly 37 entries/, /must not be scrambled/, /version must match/, /duplicates holdout artwork/, /versions do not match/],
	)
})

test("role provenance and palette hard gates reject unsafe source and generated colors", () => {
	const fixture = artifacts()
	const extractionValue = fixture.results.entries[0].extraction
	const spatial = extractionValue.methods.spatial
	spatial.background.generated = true
	spatial.foreground = role([180, 180, 180])
	spatial.accent = role([240, 240, 240])
	extractionValue.candidates.push(candidate([180, 180, 180]))
	extractionValue.diagnostics.candidateCount++
	refreshContrasts(spatial)

	const expressive = extractionValue.methods.expressive
	expressive.surface.generated = true
	expressive.foreground = role([20, 20, 20], true)
	expressive.accent = role([255, 255, 255], true)
	refreshContrasts(expressive)

	const quantized = extractionValue.methods.quantized
	quantized.surface = role([100, 100, 100])
	refreshContrasts(quantized)
	extractionValue.candidates.splice(2, 1)
	extractionValue.diagnostics.candidateCount--

	expectViolations(
		() => validateFixture(fixture),
		[
			/background must not be generated/,
			/surface must not be generated/,
			/accent does not appear in the candidate shortlist/,
			/source background contrast is below 3\.0/,
			/source surface contrast is below 2\.5/,
			/generated color must be black or white/,
			/generated color must equal the generated foreground/,
			/accent background contrast is below 1\.2/,
			/accent is less than 0\.025 OKLab from surface/,
			/quantized\.foreground surface contrast is below 4\.5/,
		],
	)
})

test("RGB consistency and finite non-negative recomputed contrast metrics are mandatory for every method", () => {
	const fixture = artifacts()
	const extractionValue = fixture.holdoutResults.entries[0].extraction
	extractionValue.methods.spatial.metrics.foregroundContrast += 0.5
	extractionValue.methods.expressive.metrics.meanSourceDistance = Number.POSITIVE_INFINITY
	extractionValue.methods.quantized.metrics.meanReconstructionError = -0.1
	extractionValue.methods.quantized.foreground.hex = "#ffffff"
	extractionValue.candidates[0].rgb = [255, 255, 254.5]

	expectViolations(
		() => validateFixture(fixture),
		[/expected recomputed contrast/, /meanSourceDistance must be finite/, /meanReconstructionError must be non-negative/, /hex does not match/, /integer channels/],
	)
})

test("candidate coverage must exactly match both canonical baseline artifacts", () => {
	const fixture = artifacts()
	fixture.results.entries[0].file = "renamed-development.jpg"
	fixture.results.entries[1].width++
	fixture.results.entries[2].kind = "holdout"
	fixture.results.entries[3].review = false
	fixture.holdoutResults.entries[0].file = "00/renamed-holdout.jpg"
	fixture.holdoutResults.entries[1].height++
	fixture.holdoutResults.entries[2].kind = "artwork"
	fixture.holdoutResults.entries[3].review = true

	expectViolations(
		() => validateFixture(fixture),
		[
			/development results is missing canonical file/,
			/development results metadata differs from the canonical baseline/,
			/holdout results is missing canonical file/,
			/holdout results metadata differs from the canonical baseline/,
		],
	)
})

test("holdout filenames reject nested and traversal paths", () => {
	const fixture = artifacts()
	fixture.holdoutResults.entries[0].file = "00/nested/artwork.jpg"
	fixture.holdoutResults.entries[1].file = "00/../artwork.jpg"

	expectViolations(
		() => validateFixture(fixture),
		[/file must name a single file directly under 00\//],
	)
})

test("generated foregrounds require the exposed source shortlist to have no eligible fallback", () => {
	const fixture = artifacts()
	const extractionValue = fixture.results.entries[0].extraction
	useValidGeneratedFallback(extractionValue)
	const strongCandidate = candidate([140, 140, 140])
	strongCandidate.population = 0.1
	strongCandidate.text = 0.5
	strongCandidate.saliency = 0.55
	extractionValue.candidates.push(strongCandidate)
	extractionValue.diagnostics.candidateCount++

	expectViolations(
		() => validateFixture(fixture),
		[/foreground must not be generated because source candidate #8c8c8c is eligible under the source foreground contrast rules/],
	)
})

test("quantized backgrounds and surfaces cannot claim generated fallback provenance", () => {
	const fixture = artifacts()
	const quantized = fixture.results.entries[0].extraction.methods.quantized
	quantized.background.generated = true
	quantized.surface.generated = true

	expectViolations(
		() => validateFixture(fixture),
		[/methods\.quantized\.background must not be generated/, /methods\.quantized\.surface must not be generated/],
	)
})

test("candidate summary versions must match each other and the current algorithm before diagnostics", () => {
	assert.throws(
		() => validateCandidateSummaryVersions(
			{ algorithmVersion: candidateVersion },
			{ algorithmVersion: "region-graph-9.9.8" },
			candidateVersion,
		),
		/artifact versions do not match/,
	)
	assert.throws(
		() => validateCandidateSummaryVersions(
			{ algorithmVersion: candidateVersion },
			{ algorithmVersion: candidateVersion },
			"region-graph-10.0.0",
		),
		/does not match current/,
	)
})
