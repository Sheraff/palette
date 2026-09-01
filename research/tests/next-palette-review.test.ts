import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	NEXT_PALETTE_REVIEW_PRESENTATION_VERSION,
	NEXT_PALETTE_REVIEW_VERSION,
	nextPaletteReviewFailureClasses,
	nextPaletteReviewManifestId,
	parseNextPaletteReviewFeedbackEntry,
	parseNextPaletteReviewManifest,
	type NextPalettePresentedPalette,
	type NextPaletteReviewManifest,
} from "../src/next-palette-review.ts"

const hash = "a".repeat(64)

function palette(offset: number): NextPalettePresentedPalette {
	const roles = ["background", "foreground", "surface", "accent"] as const
	return {
		roles: Object.fromEntries(roles.map((role, index) => [role, {
			rgb: [offset + index, offset + index, offset + index],
			hex: `#${(offset + index).toString(16).padStart(2, "0").repeat(3)}`,
			nearestName: `Gray ${index}`,
			generated: false,
			sourceDistance: 0,
		}])) as unknown as NextPalettePresentedPalette["roles"],
		gradient: { isGradient: false, confidence: 1 },
		metrics: {
			foregroundContrast: 7,
			foregroundSurfaceContrast: 7,
			accentContrast: 2,
			accentSurfaceContrast: 2,
			minimumRoleDistance: 0.1,
			meanSourceDistance: 0,
			meanReconstructionError: 0.05,
		},
	}
}

function manifest(): NextPaletteReviewManifest {
	const identity: Omit<NextPaletteReviewManifest, "generatedAt" | "manifestId"> = {
		schemaVersion: 1,
		reviewVersion: NEXT_PALETTE_REVIEW_VERSION,
		presentationVersion: NEXT_PALETTE_REVIEW_PRESENTATION_VERSION,
		experimentId: hash,
		baselineAlgorithmVersion: "baseline",
		candidateAlgorithmVersion: "candidate",
		batch: { index: 1, size: 1, totalBatches: 1, totalCases: 1 },
		provenance: {
			experiment: { "frontier.json": hash },
			implementation: { "research/src/next-palette-review.ts": hash },
			presentation: { "research/next-palette-review/styles.css": hash },
		},
		entries: [{
			caseId: "npr-aaaaaaaaaaaaaaaaaaaa",
			order: 0,
			cohort: "curated-00",
			currentEvidenceClassification: "accepted",
			frontierSignature: "signature",
			source: { file: "00/example.jpg", sha256: hash, bytes: 100, width: 100, height: 100 },
			changedRoles: ["accent"],
			gradientChanged: false,
			options: { A: palette(10), B: palette(20) },
			assignment: { A: "baseline", B: "candidate" },
		}],
	}
	return {
		...identity,
		generatedAt: "2026-07-21T00:00:00.000Z",
		manifestId: nextPaletteReviewManifestId(identity),
	}
}

test("next palette review manifest is identity-bound and reserve-confined", () => {
	const value = manifest()
	assert.deepEqual(parseNextPaletteReviewManifest(value), value)
	assert.throws(() => parseNextPaletteReviewManifest({ ...value, experimentId: "b".repeat(64) }), /identity is stale/)
	assert.throws(() => parseNextPaletteReviewManifest({
		...value,
		entries: [{ ...value.entries[0], source: { ...value.entries[0].source, file: "10/example.jpg" } }],
	}), /entry 0 is invalid/)
})

test("feedback records independent quality and optional architecture failure classes", () => {
	const value = manifest()
	const parsed = parseNextPaletteReviewFeedbackEntry({
		caseId: value.entries[0].caseId,
		sourceSha256: hash,
		sourceEligibility: "eligible-artwork",
		qualityA: "strong",
		qualityB: "acceptable-not-ideal",
		preference: "both-similarly-valid",
		failureClassesA: [],
		failureClassesB: [...nextPaletteReviewFailureClasses],
		note: "  useful note  ",
	}, value, false)
	assert.equal(parsed.note, "useful note")
	assert.deepEqual(parsed.failureClassesB, [...nextPaletteReviewFailureClasses])
	assert.throws(() => parseNextPaletteReviewFeedbackEntry({
		...parsed,
		sourceEligibility: "not-reviewable",
	}, value, false), /Ineligible sources cannot have palette judgments/)
})

test("next palette review chrome uses only achromatic literal colors", async () => {
	const css = await readFile(new URL("../next-palette-review/styles.css", import.meta.url), "utf8")
	const colors = [...css.matchAll(/#[0-9a-f]{3,6}\b/gi)].map((match) => match[0])
	assert.ok(colors.length > 0)
	for (const color of colors) {
		const expanded = color.length === 4
			? color.slice(1).split("").map((channel) => channel.repeat(2))
			: [color.slice(1, 3), color.slice(3, 5), color.slice(5, 7)]
		assert.equal(new Set(expanded.map((channel) => channel.toLowerCase())).size, 1, color)
	}
	assert.match(css, /background: var\(--path\)/)
	assert.match(css, /background: var\(--swatch\)/)
})
