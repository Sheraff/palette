import assert from "node:assert/strict"
import test from "node:test"
import {
	buildReviewColorNames,
	deduplicateReviewPresentations,
	REVIEW_COLOR_NAME_POLICY,
	REVIEW_PRESENTATION_VERSION,
} from "../src/review-presentation.ts"
import type { CorpusResult, Palette, RGB } from "../src/types.ts"

function palette(background: RGB, surface: RGB): Palette {
	const role = (rgb: RGB) => ({
		rgb,
		hex: `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`,
		generated: false,
		sourceDistance: 0,
	})
	return {
		background: role(background),
		foreground: role([255, 255, 255]),
		surface: role(surface),
		accent: role([190, 60, 80]),
		gradient: { isGradient: false, confidence: 1, coverage: 0, continuity: 0, coherence: 0 },
		score: 1,
		metrics: {
			foregroundContrast: 10,
			foregroundSurfaceContrast: 8,
			accentContrast: 2,
			accentSurfaceContrast: 2,
			minimumRoleDistance: 0.1,
			meanSourceDistance: 0,
			meanReconstructionError: 0,
		},
	}
}

test("review color names cover every unique role color through colornames-oklab", () => {
	const spatial = palette([10, 10, 10], [139, 19, 31])
	const corpus: CorpusResult = {
		generatedAt: "2026-01-01T00:00:00.000Z",
		algorithmVersion: "test",
		entries: [{
			file: "test.jpg",
			kind: "artwork",
			review: true,
			width: 1,
			height: 1,
			extraction: {
				version: "test",
				width: 1,
				height: 1,
				methods: { spatial, expressive: spatial, quantized: spatial },
				candidates: [],
				diagnostics: { regionCount: 1, candidateCount: 0, processingMs: 0 },
			},
		}],
	}
	const names = buildReviewColorNames(corpus)
	assert.equal(REVIEW_PRESENTATION_VERSION, 3)
	assert.match(REVIEW_COLOR_NAME_POLICY, /^colornames-oklab-0\.6\.0/)
	assert.equal(names["#0a0a0a"].sourceHex, "#0a0a0a")
	assert.equal(names["#8b131f"].sourceHex, "#8b131f")
	assert.equal(typeof names["#8b131f"].nearestName, "string")
	assert.ok(names["#8b131f"].nearestName.length > 0)
})

test("exact source and rendered pair duplicates produce one explicit carry edge", () => {
	const canonical = palette([10, 10, 10], [90, 60, 50])
	const treatment = palette([10, 10, 10], [139, 19, 31])
	const sha = "6dfd27c93891e02bccb9597196bca250807177c210e3e660f6fb66257cd2c1ef"
	const result = deduplicateReviewPresentations([
		{ file: "maroon5-original.jpg", sourceSha256: sha, canonical, treatment },
		{ file: "maroon5.jpg", sourceSha256: sha, canonical, treatment },
	])
	assert.deepEqual(result.representatives.map((entry) => entry.file), ["maroon5-original.jpg"])
	assert.deepEqual(result.duplicateCarryEdges, [{
		representativeFile: "maroon5-original.jpg",
		duplicateFile: "maroon5.jpg",
		sourceSha256: sha,
		exactSourceBytes: true,
		exactCanonicalPresentation: true,
		exactTreatmentPresentation: true,
	}])
})
