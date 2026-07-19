import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import {
	acceptedRoundArchives,
	canonicalReviewEvidenceInputs,
	pairwiseJudgmentEventId,
	readReviewEvidenceJson,
	reviewEvidenceInputPaths,
	validateAcceptedRoundArchive,
} from "../build-review-evidence.ts"
import {
	acceptedSetFromEvents,
	buildEvidenceLedger,
	createCarryEdge,
	deduplicateJudgmentEvents,
	findEvidenceConflicts,
	matchAcceptedSet,
	paletteSnapshot,
	semanticPaletteId,
	stableArtworkId,
	type JudgmentEvent,
} from "../src/review-evidence.ts"
import type { Palette, RGB } from "../src/types.ts"

function palette(accent: RGB, gradient = false, generated = false): Palette {
	const role = (rgb: RGB) => ({ rgb, hex: "#000000", generated: false, sourceDistance: 0 })
	return {
		background: role([20, 20, 20]),
		foreground: role([245, 245, 245]),
		surface: role([40, 40, 40]),
		accent: { ...role(accent), generated },
		gradient: { isGradient: gradient, confidence: 0, coverage: 0, continuity: 0, coherence: 0 },
		score: 0,
		metrics: {
			foregroundContrast: 1,
			foregroundSurfaceContrast: 1,
			accentContrast: 1,
			accentSurfaceContrast: 1,
			minimumRoleDistance: 0,
			meanSourceDistance: 0,
			meanReconstructionError: 0,
		},
	}
}

const artworkId = stableArtworkId("art.jpg")

function event(id: string, outcomes: JudgmentEvent["outcomes"]): JudgmentEvent {
	return {
		id,
		artworkId,
		observedAt: `2026-01-01T00:00:0${id.slice(-1)}.000Z`,
		sources: [`source-${id}`],
		outcomes,
	}
}

test("an artwork retains multiple positively judged palettes", () => {
	const first = semanticPaletteId(palette([200, 80, 40]))
	const second = semanticPaletteId(palette([40, 160, 220]))
	const accepted = acceptedSetFromEvents([
		event("event-1", [{ paletteId: first, outcome: "positive" }]),
		event("event-2", [{ paletteId: second, outcome: "positive" }]),
	])
	assert.deepEqual(accepted.map((entry) => entry.paletteId), [second, first].sort())
})

test("positive and negative evidence for the same palette remains an explicit conflict", () => {
	const value = palette([200, 80, 40])
	const paletteId = semanticPaletteId(value)
	const events = [
		event("event-1", [{ paletteId, outcome: "positive" }]),
		event("event-2", [{ paletteId, outcome: "negative" }]),
	]
	const accepted = acceptedSetFromEvents(events)
	assert.equal(accepted.length, 1)
	assert.equal(accepted[0].conflicted, true)
	assert.deepEqual(findEvidenceConflicts(events), [{
		artworkId,
		positivePaletteId: paletteId,
		negativePaletteId: paletteId,
		positiveEventIds: ["event-1"],
		negativeEventIds: ["event-2"],
		exactSemanticMatch: true,
		maximumRoleDistance: 0,
		thresholdVersion: "role-oklab-0.025-v1",
	}])
})

test("perceptually equivalent positive and negative palettes mark the accepted entry conflicted", () => {
	const positive = paletteSnapshot({
		file: "art.jpg",
		algorithmVersion: "v1",
		method: "spatial",
		palette: palette([200, 80, 40]),
	})
	const negative = paletteSnapshot({
		file: "art.jpg",
		algorithmVersion: "v1",
		method: "expressive",
		palette: palette([201, 80, 40]),
	})
	const events = [
		event("event-1", [{ paletteId: positive.paletteId, outcome: "positive" }]),
		event("event-2", [{ paletteId: negative.paletteId, outcome: "negative" }]),
	]
	const accepted = acceptedSetFromEvents(events, [], [positive, negative])
	assert.equal(accepted[0].conflicted, true)
	const conflicts = findEvidenceConflicts(events, { palettes: [positive, negative] })
	assert.equal(conflicts.length, 1)
	assert.equal(conflicts[0].exactSemanticMatch, false)
})

test("preference-only outcomes do not enter the accepted set", () => {
	const preferred = semanticPaletteId(palette([200, 80, 40]))
	const other = semanticPaletteId(palette([40, 160, 220]))
	const preferenceEvent = event("event-1", [
		{ paletteId: preferred, outcome: "preference-only" },
		{ paletteId: other, outcome: "preference-only" },
	])
	preferenceEvent.preference = { kind: "preferred", preferredPaletteId: preferred, otherPaletteId: other }
	assert.deepEqual(acceptedSetFromEvents([preferenceEvent]), [])
})

test("a carried judgment is deduplicated and propagated through a carry edge", () => {
	const previous = paletteSnapshot({
		file: "art.jpg",
		algorithmVersion: "v1",
		method: "spatial",
		palette: palette([200, 80, 40]),
	})
	const current = paletteSnapshot({
		file: "art.jpg",
		algorithmVersion: "v2",
		method: "spatial",
		palette: palette([201, 80, 40]),
	})
	const direct = event("event-1", [{ paletteId: previous.paletteId, outcome: "positive" }])
	const carriedOccurrence = { ...direct, sources: ["current-store"], outcomes: [] }
	const deduplicated = deduplicateJudgmentEvents([direct, carriedOccurrence])
	assert.equal(deduplicated.length, 1)
	assert.deepEqual(deduplicated[0].sources, ["current-store", "source-event-1"])

	const edge = createCarryEdge({ artworkId, from: previous, to: current, eventIds: [direct.id] })
	assert.ok(edge)
	const accepted = acceptedSetFromEvents(deduplicated, [edge])
	assert.equal(accepted.some((entry) => entry.paletteId === previous.paletteId), true)
	assert.deepEqual(accepted.find((entry) => entry.paletteId === current.paletteId)?.carriedEventIds, [direct.id])
})

test("incompatible duplicate judgment outcomes are rejected instead of unioned", () => {
	const paletteId = semanticPaletteId(palette([200, 80, 40]))
	assert.throws(() => deduplicateJudgmentEvents([
		event("event-1", [{ paletteId, outcome: "positive" }]),
		event("event-1", [{ paletteId, outcome: "negative" }]),
	]), /incompatible outcome evidence/)
})

test("unequal duplicate snapshot identities are rejected", () => {
	const first = paletteSnapshot({
		file: "art.jpg",
		algorithmVersion: "v1",
		method: "spatial",
		palette: palette([200, 80, 40]),
	})
	const unequal = paletteSnapshot({
		file: "art.jpg",
		algorithmVersion: "v1",
		method: "spatial",
		palette: palette([40, 160, 220]),
	})
	assert.throws(() => buildEvidenceLedger({ palettes: [first, unequal], events: [] }), /incompatible duplicate data/)
	assert.equal(buildEvidenceLedger({ palettes: [first, structuredClone(first)], events: [] }).palettes.length, 1)
})

test("semantic identity and versioned perceptual accepted-set matching are role aware", () => {
	const accepted = palette([200, 80, 40])
	const sameSemantics = structuredClone(accepted)
	sameSemantics.score = 100
	sameSemantics.metrics.meanReconstructionError = 0.9
	assert.equal(semanticPaletteId(accepted), semanticPaletteId(sameSemantics))
	assert.notEqual(semanticPaletteId(accepted), semanticPaletteId(palette([200, 80, 40], false, true)))
	assert.notEqual(semanticPaletteId(accepted), semanticPaletteId(palette([200, 80, 40], true)))

	assert.equal(matchAcceptedSet(palette([201, 80, 40]), [accepted]).accepted, true)
	assert.equal(matchAcceptedSet(palette([40, 180, 220]), [accepted]).accepted, false)
	assert.equal(matchAcceptedSet(palette([201, 80, 40], true), [accepted]).accepted, false)
	assert.equal(
		stableArtworkId("00/ab67616d0000b2730000da2732248f519c60d357.jpg"),
		stableArtworkId("00/ab67616d00001e020000da2732248f519c60d357.jpg"),
	)
})

test("pairwise judgment identity prefers the persisted record ID", () => {
	assert.equal(
		pairwiseJudgmentEventId(artworkId, "2026-01-01T00:00:00.000Z", "record-1"),
		pairwiseJudgmentEventId(artworkId, "2026-02-01T00:00:00.000Z", "record-1"),
	)
	assert.notEqual(
		pairwiseJudgmentEventId(artworkId, "2026-01-01T00:00:00.000Z"),
		pairwiseJudgmentEventId(artworkId, "2026-02-01T00:00:00.000Z"),
	)
})

test("review evidence uses only the explicit accepted archive allowlist", () => {
	assert.deepEqual(acceptedRoundArchives.map((archive) => archive.file), [
		"region-graph-0.1.0.json",
		"region-graph-0.2.0.json",
		"region-graph-0.3.0.json",
		"region-graph-0.4.0.json",
		"region-graph-0.5.0.json",
		"region-graph-0.6.0.json",
		"region-graph-0.7.0.json",
		"region-graph-0.8.0.json",
		"region-graph-0.9.0.json",
		"region-graph-0.10.0.json",
		"region-graph-0.11.0.json",
		"region-graph-0.11.0-corpus-review.json",
		"region-graph-0.12.0.json",
		"region-graph-0.13.0.json",
		"region-graph-0.13.0-corpus-review.json",
		"region-graph-0.15.0.json",
		"region-graph-0.15.0-corpus-review.json",
		"region-graph-0.16.0.json",
	])
	assert.equal(reviewEvidenceInputPaths.includes("data/rounds/region-graph-0.14.0.json"), false)
	assert.equal(reviewEvidenceInputPaths.some((path) => path.startsWith("data/candidates/")), false)
	assert.equal(reviewEvidenceInputPaths.some((path) => path.includes("pareto-feedback")), false)
	const canonicalPaths = new Set<string>(Object.values(canonicalReviewEvidenceInputs))
	assert.equal(reviewEvidenceInputPaths.every((path) =>
		canonicalPaths.has(path) || path.startsWith("data/rounds/")), true)
})

test("accepted archive metadata must agree with its allowlisted identity", () => {
	assert.doesNotThrow(() => validateAcceptedRoundArchive("archive.json", "v1", {
		algorithmVersion: "v1",
		results: { algorithmVersion: "v1" },
		acceptance: { decision: "accepted" },
	}))
	assert.throws(() => validateAcceptedRoundArchive("archive.json", "v1", {
		algorithmVersion: "v1",
		decision: "rejected",
	}), /not an accepted archive/)
	assert.throws(() => validateAcceptedRoundArchive("archive.json", "v1", {
		algorithmVersion: "other",
	}), /does not identify v1/)
	assert.doesNotThrow(() => validateAcceptedRoundArchive("archive.json", "v1", {
		algorithmVersion: "v1",
		reviewProvenance: {
			algorithmVersion: "poc1",
			results: { algorithmVersion: "poc1" },
			holdoutResults: { algorithmVersion: "poc1" },
			feedback: { candidateAlgorithmVersion: "poc1" },
		},
	}))
	assert.throws(() => validateAcceptedRoundArchive("archive.json", "v1", {
		algorithmVersion: "v1",
		reviewProvenance: {
			algorithmVersion: "poc1",
			results: { algorithmVersion: "poc2" },
			holdoutResults: { algorithmVersion: "poc1" },
			feedback: { candidateAlgorithmVersion: "poc1" },
		},
	}), /review provenance results does not identify poc1/)
})

test("review evidence JSON inputs must be regular files and never symlinks", async (context) => {
	const root = await mkdtemp(join(tmpdir(), "palette-review-evidence-"))
	context.after(async () => rm(root, { recursive: true, force: true }))
	const regular = join(root, "regular.json")
	const directory = join(root, "directory")
	const symbolicLink = join(root, "link.json")
	await writeFile(regular, "{\"trusted\":true}\n")
	await mkdir(directory)
	await symlink(regular, symbolicLink)
	assert.deepEqual(await readReviewEvidenceJson(regular), { trusted: true })
	await assert.rejects(readReviewEvidenceJson(directory), /regular file/)
	await assert.rejects(readReviewEvidenceJson(symbolicLink), /symbolic link/)
})
