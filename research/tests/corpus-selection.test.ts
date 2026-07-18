import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	buildSelectionManifest,
	computeSemanticResultsSha256,
	selectionManifestId,
	selectionQuotas,
	selectionTracks,
	validateSelectionManifest,
} from "../src/corpus-selection.ts"
import type { CorpusResult } from "../src/types.ts"

test("corpus selection is deterministic, disjoint, provenance-bound, and has reserves", async () => {
	const source = await readFile(new URL("../data/holdout-results.json", import.meta.url))
	const sourceResultsSha256 = createHash("sha256").update(source).digest("hex")
	const corpus = JSON.parse(source.toString("utf8")) as CorpusResult
	const hashes = new Map(corpus.entries.map((entry) => [entry.file, createHash("sha256").update(entry.file).digest("hex")]))
	const first = buildSelectionManifest(corpus, hashes, sourceResultsSha256, "2026-01-01T00:00:00.000Z")
	const second = buildSelectionManifest(corpus, hashes, sourceResultsSha256, "2026-02-01T00:00:00.000Z")
	assert.equal(first.manifestId, second.manifestId)
	assert.deepEqual(first.tracks, second.tracks)
	validateSelectionManifest(first, corpus, sourceResultsSha256)
	const files = selectionTracks.flatMap((track) => first.tracks[track].map((entry) => entry.file))
	assert.equal(files.length, corpus.entries.length)
	assert.equal(new Set(files).size, files.length)
	for (const track of selectionTracks) assert.ok(first.tracks[track].length >= selectionQuotas[track] * 2)
	const equivalentCorpus = structuredClone(corpus)
	equivalentCorpus.generatedAt = "2030-01-01T00:00:00.000Z"
	equivalentCorpus.entries[0].extraction.diagnostics.processingMs += 1000
	assert.equal(computeSemanticResultsSha256(equivalentCorpus), computeSemanticResultsSha256(corpus))
	const equivalentManifest = buildSelectionManifest(equivalentCorpus, hashes, "d".repeat(64), "2030-01-01T00:00:01.000Z")
	assert.equal(equivalentManifest.manifestId, first.manifestId)
	validateSelectionManifest(equivalentManifest, equivalentCorpus, "d".repeat(64))

	const changedCorpus = structuredClone(equivalentCorpus)
	changedCorpus.entries[0].extraction.methods.spatial.background.hex = "#ffffff"
	assert.notEqual(computeSemanticResultsSha256(changedCorpus), computeSemanticResultsSha256(corpus))

	const reordered = structuredClone(first)
	const firstCandidate = reordered.tracks.diversity[0]
	const secondCandidate = reordered.tracks.diversity[1]
	reordered.tracks.diversity[0] = { ...secondCandidate, rank: 0 }
	reordered.tracks.diversity[1] = { ...firstCandidate, rank: 1 }
	reordered.manifestId = selectionManifestId(reordered)
	assert.throws(() => validateSelectionManifest(reordered, corpus, sourceResultsSha256), /Selection queue does not match/)

	const missingHashes = new Map(hashes)
	missingHashes.delete(corpus.entries[0].file)
	assert.throws(() => buildSelectionManifest(corpus, missingHashes, sourceResultsSha256), /Missing source SHA-256/)
})
