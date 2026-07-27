import assert from "node:assert/strict"
import test from "node:test"
import {
	CONTROLLED_FIELD_STATE_PRESENTATION_VERSION,
	CONTROLLED_FIELD_STATE_REVIEW_VERSION,
	controlledFieldStateManifestId,
	exactPresentedRoleChanges,
	parseControlledFieldStateFeedbackEntry,
	parseControlledFieldStateManifest,
	type ControlledFieldStateReviewManifest,
} from "../src/controlled-field-state-review.ts"
import type { NextPalettePresentedPalette } from "../src/next-palette-review-v2.ts"

function palette(background = "#111111", surface = "#222222", gradient = false): NextPalettePresentedPalette {
	const role = (hex: string) => ({
		rgb: [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16)] as [number, number, number],
		hex,
		nearestName: hex,
		generated: false,
		sourceDistance: 0,
	})
	return {
		roles: {
			background: role(background),
			foreground: role("#eeeeee"),
			surface: role(surface),
			accent: role("#ffcc00"),
		},
		gradient: { isGradient: gradient, confidence: 0.7 },
		metrics: {
			foregroundContrast: 10,
			foregroundSurfaceContrast: 8,
			accentContrast: 7,
			accentSurfaceContrast: 6,
			minimumRoleDistance: 0.1,
			meanSourceDistance: 0,
			meanReconstructionError: 0,
		},
	}
}

function manifest(): ControlledFieldStateReviewManifest {
	const identity: Omit<ControlledFieldStateReviewManifest, "generatedAt" | "manifestId"> = {
		schemaVersion: 1,
		reviewVersion: CONTROLLED_FIELD_STATE_REVIEW_VERSION,
		presentationVersion: CONTROLLED_FIELD_STATE_PRESENTATION_VERSION,
		experimentId: "1".repeat(64),
		batch: { index: 1, size: 3, totalBatches: 1, totalCases: 3 },
		provenance: {
			experiment: { "manifest.json": "2".repeat(64) },
			implementation: { "research/example.ts": "3".repeat(64) },
			presentation: { "research/example.html": "4".repeat(64) },
		},
		entries: [
			{
				caseId: `cfsr-${"5".repeat(20)}`,
				order: 0,
				task: "multiplicity",
				source: { file: "images/example.jpg", sha256: "6".repeat(64), bytes: 10, width: 20, height: 20 },
				options: { A: palette("#111111", "#111111"), B: palette("#111111", "#222222") },
				assignment: { A: "collapsed", B: "two-field" },
			},
			{
				caseId: `cfsr-${"7".repeat(20)}`,
				order: 1,
				task: "ordered-pair",
				source: { file: "images/example.jpg", sha256: "6".repeat(64), bytes: 10, width: 20, height: 20 },
				options: { A: palette("#111111", "#222222"), B: palette("#333333", "#444444") },
				assignment: { A: "pair-primary", B: "pair-challenger" },
			},
			{
				caseId: `cfsr-${"8".repeat(20)}`,
				order: 2,
				task: "gradient-diagnostic",
				source: { file: "images/example.jpg", sha256: "6".repeat(64), bytes: 10, width: 20, height: 20 },
				options: { A: palette("#111111", "#222222"), B: palette("#111111", "#222222", true) },
				assignment: { A: "flat", B: "gradient" },
			},
		],
	}
	return { ...identity, generatedAt: "2026-07-25T00:00:00.000Z", manifestId: controlledFieldStateManifestId(identity) }
}

test("controlled field-state review strictly binds one blinded factor", () => {
	const value = manifest()
	assert.deepEqual(parseControlledFieldStateManifest(value), value)
	assert.deepEqual(exactPresentedRoleChanges(value.entries[0].options.A, value.entries[0].options.B), ["surface"])
	const tampered = structuredClone(value)
	tampered.entries[0].assignment.B = "gradient"
	assert.throws(() => parseControlledFieldStateManifest(tampered), /assignment/)
	const drifted = structuredClone(value)
	drifted.entries[1].options.B.roles.accent.rgb = [0, 0, 0]
	drifted.entries[1].options.B.roles.accent.hex = "#000000"
	assert.throws(() => parseControlledFieldStateManifest(drifted), /retained role/)
})

test("controlled feedback preserves no-visible-difference as structured evidence", () => {
	const value = manifest()
	const parsed = parseControlledFieldStateFeedbackEntry({
		caseId: value.entries[0].caseId,
		sourceSha256: value.entries[0].source.sha256,
		sourceEligibility: "eligible-artwork",
		preference: "no-visible-difference",
		reasonsA: [],
		reasonsB: ["endpoint-visibility"],
		note: "same treatment",
	}, value, false)
	assert.equal(parsed.preference, "no-visible-difference")
	assert.equal(parsed.note, "same treatment")
})
