import assert from "node:assert/strict"
import test from "node:test"
import {
	acceptedCandidates,
	curationExhausted,
	curationProgress,
	pendingCandidates,
	validateCurationStore,
	type CurationStore,
} from "../src/corpus-curation.ts"
import { selectionQuotas, selectionTracks, type SelectionManifest } from "../src/corpus-selection.ts"

const manifest: SelectionManifest = {
	schemaVersion: 3,
	generatedAt: "2026-01-01T00:00:00.000Z",
	selectorStrategyVersion: "test",
	manifestId: "b".repeat(64),
	algorithmVersion: "test",
	sourceResultsSha256: "a".repeat(64),
	semanticResultsSha256: "d".repeat(64),
	sourceCount: 9,
	targetSize: 3,
	quotas: { diversity: 1, risk: 1, random: 1 },
	tracks: Object.fromEntries(selectionTracks.map((track) => [track, [0, 1, 2].map((rank) => ({
		file: `${track}-${rank}`,
		sha256: "c".repeat(64),
		width: 100,
		height: 100,
		track,
		rank,
	}))])) as SelectionManifest["tracks"],
}

test("vetoed candidates are replaced within their selection track", () => {
	const store: CurationStore = {
		schemaVersion: 3,
		manifestId: manifest.manifestId,
		semanticResultsSha256: manifest.semanticResultsSha256,
		frozenAt: null,
		entries: [
			{ image: "diversity-0", decision: "veto", reasons: ["not-artwork"], note: "", decidedAt: "2026-01-01T00:00:00.000Z" },
			{ image: "diversity-1", decision: "include", reasons: [], note: "", decidedAt: "2026-01-01T00:00:01.000Z" },
			{ image: "risk-0", decision: "include", reasons: [], note: "", decidedAt: "2026-01-01T00:00:02.000Z" },
			{ image: "random-0", decision: "include", reasons: [], note: "", decidedAt: "2026-01-01T00:00:03.000Z" },
		],
	}
	assert.deepEqual(acceptedCandidates(manifest, store).map((candidate) => candidate.file), ["diversity-1", "risk-0", "random-0"])
	assert.equal(curationProgress(manifest, store).complete, true)
	assert.equal(pendingCandidates(manifest, store).length, 0)
	assert.deepEqual(selectionQuotas, { diversity: 50, risk: 30, random: 20 })
})

test("duplicate or malformed curation entries cannot falsely complete", () => {
	const duplicate: CurationStore = {
		schemaVersion: 3,
		manifestId: manifest.manifestId,
		semanticResultsSha256: manifest.semanticResultsSha256,
		frozenAt: null,
		entries: [
			{ image: "diversity-0", decision: "include", reasons: [], note: "", decidedAt: "2026-01-01T00:00:00.000Z" },
			{ image: "diversity-0", decision: "include", reasons: [], note: "", decidedAt: "2026-01-01T00:00:01.000Z" },
			{ image: "risk-0", decision: "include", reasons: [], note: "", decidedAt: "2026-01-01T00:00:02.000Z" },
			{ image: "random-0", decision: "include", reasons: [], note: "", decidedAt: "2026-01-01T00:00:03.000Z" },
		],
	}
	assert.throws(() => curationProgress(manifest, duplicate), /Duplicate curation decision/)

	const malformed = structuredClone(duplicate) as unknown as { entries: Array<Record<string, unknown>> }
	malformed.entries = [{ image: "diversity-0", decision: "include", reasons: ["other"], note: "", decidedAt: "not-a-date" }]
	assert.throws(() => curationProgress(manifest, malformed as unknown as CurationStore), /Included sources cannot have veto reasons/)
})

test("an exhausted queue is explicitly incomplete", () => {
	const store: CurationStore = {
		schemaVersion: 3,
		manifestId: manifest.manifestId,
		semanticResultsSha256: manifest.semanticResultsSha256,
		frozenAt: null,
		entries: [
			...manifest.tracks.diversity.map((candidate, index) => ({
				image: candidate.file,
				decision: "veto" as const,
				reasons: ["not-artwork"],
				note: "",
				decidedAt: `2026-01-01T00:00:0${index}.000Z`,
			})),
		],
	}
	assert.equal(curationProgress(manifest, store).complete, false)
	assert.equal(pendingCandidates(manifest, store).length, 6)
	assert.equal(curationExhausted(manifest, store), true)
})

test("a frozen curation store must be complete and have a valid timestamp", () => {
	const entries: CurationStore["entries"] = ["diversity", "risk", "random"].map((track) => ({
		image: `${track}-0`,
		decision: "include",
		reasons: [],
		note: "",
		decidedAt: "2026-01-01T00:00:00.000Z",
	}))
	const frozen: CurationStore = {
		schemaVersion: 3,
		manifestId: manifest.manifestId,
		semanticResultsSha256: manifest.semanticResultsSha256,
		frozenAt: "2026-01-01T00:01:00.000Z",
		entries,
	}
	assert.doesNotThrow(() => validateCurationStore(manifest, frozen))
	assert.throws(() => validateCurationStore(manifest, { ...frozen, entries: entries.slice(1) }), /only be frozen when complete/)
	assert.throws(() => validateCurationStore(manifest, { ...frozen, frozenAt: "yesterday" }), /freeze timestamp/)
})
