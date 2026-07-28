import assert from "node:assert/strict"
import { readFile, stat } from "node:fs/promises"
import test from "node:test"
import { verifyAlbumArtworkPaletteV2074Development } from
	"../analyze-album-artwork-palette-v2-0.7.4-development.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_IMPLEMENTATION_PATHS,
	albumArtworkPaletteV2074CanonicalJson,
	albumArtworkPaletteV2074ContentId,
	albumArtworkPaletteV2074FileSha256,
	albumArtworkPaletteV2074OrderedFileRoot,
	albumArtworkPaletteV2074Sha256,
	buildAlbumArtworkPaletteV2074ImplementationClosure,
	verifyImmutableAlbumArtworkPaletteV2073Artifact,
} from "../src/album-artwork-palette-v2-0.7.4-artifact.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_DOCUMENT_BINDINGS,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_PROTOCOL,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_SELECTION_EVIDENCE,
} from "../src/album-artwork-palette-v2-0.7.4-protocol.ts"

const projectRoot = new URL("../../", import.meta.url).pathname
const finalExperiment = new URL(
	"../data/experiments/album-artwork-palette-v2-0.7.4-development/",
	import.meta.url,
)

function objectKeys(value: unknown): string[] {
	if (value === null || typeof value !== "object") return []
	if (Array.isArray(value)) return value.flatMap(objectKeys)
	return Object.entries(value as Record<string, unknown>)
		.flatMap(([key, entry]) => [key, ...objectKeys(entry)])
}

test("0.7.4 canonical hashes, content IDs, and roots are deterministic and order-bound", () => {
	const first = { z: [3, { b: true, a: null }], a: "value" }
	const second = { a: "value", z: [3, { a: null, b: true }] }
	assert.equal(albumArtworkPaletteV2074CanonicalJson(first), albumArtworkPaletteV2074CanonicalJson(second))
	const identified = { schemaVersion: 1, value: first, artifactId: "placeholder" }
	const id = albumArtworkPaletteV2074ContentId(identified, "artifactId")
	assert.equal(id, albumArtworkPaletteV2074ContentId({ ...identified, artifactId: id }, "artifactId"))
	const files = [
		{ path: "a.json", byteCount: 2, rawSha256: albumArtworkPaletteV2074Sha256("a\n") },
		{ path: "b.json", byteCount: 2, rawSha256: albumArtworkPaletteV2074Sha256("b\n") },
	]
	assert.equal(albumArtworkPaletteV2074OrderedFileRoot("test-root", files),
		albumArtworkPaletteV2074OrderedFileRoot("test-root", [...files]))
	assert.notEqual(albumArtworkPaletteV2074OrderedFileRoot("test-root", files),
		albumArtworkPaletteV2074OrderedFileRoot("test-root", [...files].reverse()))
})

test("0.7.4 closure raw-binds the protocol, handoff, and complete declared source roster", async () => {
	assert.equal(await albumArtworkPaletteV2074FileSha256(
		new URL(`../../${ALBUM_ARTWORK_PALETTE_V2_0_7_4_DOCUMENT_BINDINGS.handoff.path}`, import.meta.url).pathname,
	), ALBUM_ARTWORK_PALETTE_V2_0_7_4_DOCUMENT_BINDINGS.handoff.rawSha256)
	const closure = await buildAlbumArtworkPaletteV2074ImplementationClosure(projectRoot)
	assert.deepEqual(closure.files.map(({ path }) => path), ALBUM_ARTWORK_PALETTE_V2_0_7_4_IMPLEMENTATION_PATHS)
	for (const path of [
		ALBUM_ARTWORK_PALETTE_V2_0_7_4_DOCUMENT_BINDINGS.protocol.path,
		ALBUM_ARTWORK_PALETTE_V2_0_7_4_DOCUMENT_BINDINGS.handoff.path,
	]) {
		const row = closure.files.find((file) => file.path === path)
		assert.ok(row)
		assert.equal(row.rawSha256, await albumArtworkPaletteV2074FileSha256(new URL(`../../${path}`, import.meta.url).pathname))
	}
})

test("0.7.4 protocol and harness define no memory or resident-set collection fields", async () => {
	assert.equal(Object.values(ALBUM_ARTWORK_PALETTE_V2_0_7_4_PROTOCOL.runtime.memory)
		.every((value) => value === false), true)
	const harnessPaths = [
		"research/src/album-artwork-palette-v2-0.7.4-artifact.ts",
		"research/album-artwork-palette-v2-0.7.4-development-child.ts",
		"research/evaluate-album-artwork-palette-v2-0.7.4-development.ts",
		"research/analyze-album-artwork-palette-v2-0.7.4-development.ts",
	]
	const harness = (await Promise.all(harnessPaths.map((path) =>
		readFile(new URL(`../../${path}`, import.meta.url), "utf8")))).join("\n")
	assert.equal(harness.includes(`process.${"memoryUsage"}`), false)
	assert.equal(new RegExp(`\\b${"rss"}\\s*[:=]`, "iu").test(harness), false)
})

test("immutable 0.7.3 evidence verifies without a forward-checkout implementation gate", async () => {
	const evidence = await verifyImmutableAlbumArtworkPaletteV2073Artifact(projectRoot)
	assert.equal(evidence.manifestId, ALBUM_ARTWORK_PALETTE_V2_0_7_4_SELECTION_EVIDENCE.artifactManifest.id)
	assert.equal(evidence.orderedRoot, ALBUM_ARTWORK_PALETTE_V2_0_7_4_SELECTION_EVIDENCE.artifactManifest.orderedRoot)
	assert.equal(evidence.sourceOrderedRoot,
		ALBUM_ARTWORK_PALETTE_V2_0_7_4_SELECTION_EVIDENCE.artifactManifest.sourceOrderedRoot)
	assert.equal(evidence.mechanicalPass, true)
})

test("published 0.7.4 final artifact verifies dynamically when present", async (t) => {
	try {
		await stat(new URL("manifest.json", finalExperiment))
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			t.skip("Full 28-source 0.7.4 artifact has not been published yet")
			return
		}
		throw error
	}
	const analysis = await verifyAlbumArtworkPaletteV2074Development(finalExperiment.pathname)
	assert.equal(analysis.analysisId, albumArtworkPaletteV2074ContentId(analysis, "analysisId"))
	assert.equal(analysis.mechanicalPass, true)
	assert.equal(analysis.dispositionAuthority, true)
})
