import assert from "node:assert/strict"
import test from "node:test"
import { findCarriedReviews, hasSubmittedFeedback, palettesDiffer } from "../src/review-queue.ts"
import type { CorpusResult, Palette, RGB } from "../src/types.ts"

function palette(accent: RGB): Palette {
	const role = (rgb: RGB) => ({ rgb, hex: "#000000", generated: false, sourceDistance: 0 })
	return {
		background: role([20, 20, 20]),
		foreground: role([250, 250, 250]),
		surface: role([30, 30, 30]),
		accent: role(accent),
		gradient: { isGradient: false, confidence: 1, coverage: 0, continuity: 0, coherence: 0 },
		score: 0,
		metrics: {
			foregroundContrast: 10,
			foregroundSurfaceContrast: 10,
			accentContrast: 2,
			accentSurfaceContrast: 2,
			minimumRoleDistance: 0,
			meanSourceDistance: 0,
			meanReconstructionError: 0,
		},
	}
}

function corpus(version: string, spatialAccent: RGB, quantizedAccent: RGB = [40, 160, 220]): CorpusResult {
	return {
		generatedAt: "2026-01-01T00:00:00.000Z",
		algorithmVersion: version,
		entries: [{
			file: "art.jpg",
			kind: "artwork",
			review: true,
			width: 10,
			height: 10,
			extraction: {
				version,
				width: 10,
				height: 10,
				methods: {
					spatial: palette(spatialAccent),
					expressive: palette([180, 80, 140]),
					quantized: palette(quantizedAccent),
				},
				candidates: [],
				diagnostics: { regionCount: 1, candidateCount: 1, processingMs: 0 },
			},
		}],
	}
}

const feedback = (algorithmVersion: string) => ({
	reviewSchema: 2,
	presentationVersion: 2,
	algorithmVersion,
	image: "art.jpg",
	comparison: "baseline",
})

test("palette comparison ignores imperceptible channel movement", () => {
	assert.equal(palettesDiffer(palette([200, 80, 40]), palette([201, 80, 40])), false)
	assert.equal(palettesDiffer(palette([200, 80, 40]), palette([40, 180, 200])), true)
})

test("unchanged reviewed comparison pairs carry into a new round", () => {
	const previous = corpus("previous", [200, 80, 40])
	const current = corpus("current", [201, 80, 40])
	const carried = findCarriedReviews(current, new Map([["previous", previous]]), [feedback("previous")], 2)
	assert.deepEqual(carried, [{ image: "art.jpg", comparison: "baseline", algorithmVersion: "previous" }])
})

test("changed and differently presented pairs require another review", () => {
	const previous = corpus("previous", [200, 80, 40])
	const current = corpus("current", [40, 180, 200])
	const archives = new Map([["previous", previous]])
	assert.deepEqual(findCarriedReviews(current, archives, [feedback("previous")], 2), [])
	assert.deepEqual(findCarriedReviews(current, archives, [feedback("previous")], 3), [])
})

test("the latest prior judgment controls carry-forward", () => {
	const matching = corpus("matching", [200, 80, 40])
	const changed = corpus("changed", [40, 180, 200])
	const current = corpus("current", [200, 80, 40])
	const archives = new Map([["matching", matching], ["changed", changed]])
	const carried = findCarriedReviews(current, archives, [feedback("matching"), feedback("changed")], 2)
	assert.deepEqual(carried, [])
})

test("duplicate detection is scoped to one rendered comparison", () => {
	const entries = [feedback("current")]
	assert.equal(hasSubmittedFeedback(entries, "current", 2, "art.jpg", "baseline"), true)
	assert.equal(hasSubmittedFeedback(entries, "next", 2, "art.jpg", "baseline"), false)
	assert.equal(hasSubmittedFeedback(entries, "current", 3, "art.jpg", "baseline"), false)
	assert.equal(hasSubmittedFeedback(entries, "current", 2, "art.jpg", "variant"), false)
})
