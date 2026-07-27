import assert from "node:assert/strict"
import { readFile, stat } from "node:fs/promises"
import test from "node:test"
import { verifyAlbumArtworkPaletteV2073Development } from
	"../analyze-album-artwork-palette-v2-0.7.3-development.ts"
import {
	albumArtworkPaletteV2073CanonicalJson,
	albumArtworkPaletteV2073ContentId,
	albumArtworkPaletteV2073OrderedRoot,
	albumArtworkPaletteV2073Sha256,
} from "../src/album-artwork-palette-v2-0.7.3-artifact.ts"
import { ALBUM_ARTWORK_PALETTE_V2_0_7_3_PROTOCOL } from
	"../src/album-artwork-palette-v2-0.7.3-protocol.ts"

const experimentUrl = new URL(
	"../data/experiments/album-artwork-palette-v2-0.7.3-development/",
	import.meta.url,
)

function objectKeys(value: unknown): string[] {
	if (value === null || typeof value !== "object") return []
	if (Array.isArray(value)) return value.flatMap(objectKeys)
	return Object.entries(value as Record<string, unknown>)
		.flatMap(([key, entry]) => [key, ...objectKeys(entry)])
}

test("0.7.3 canonical hashes and ordered roots are deterministic and order-bound", () => {
	const first = { z: [3, { b: true, a: null }], a: "value" }
	const second = { a: "value", z: [3, { a: null, b: true }] }
	assert.equal(albumArtworkPaletteV2073CanonicalJson(first), albumArtworkPaletteV2073CanonicalJson(second))
	const files = [
		{ path: "a.json", byteCount: 2, rawSha256: albumArtworkPaletteV2073Sha256("a\n") },
		{ path: "b.json", byteCount: 2, rawSha256: albumArtworkPaletteV2073Sha256("b\n") },
	]
	assert.equal(albumArtworkPaletteV2073OrderedRoot(files), albumArtworkPaletteV2073OrderedRoot([...files]))
	assert.notEqual(albumArtworkPaletteV2073OrderedRoot(files), albumArtworkPaletteV2073OrderedRoot([...files].reverse()))
})

test("0.7.3 protocol and harness define no resident-set or memory collection fields", async () => {
	assert.equal(objectKeys(ALBUM_ARTWORK_PALETTE_V2_0_7_3_PROTOCOL)
		.some((key) => /^(?:rss|memory|heap)/iu.test(key)), false)
	const harnessUrls = [
		new URL("../album-artwork-palette-v2-0.7.3-development-child.ts", import.meta.url),
		new URL("../evaluate-album-artwork-palette-v2-0.7.3-development.ts", import.meta.url),
		new URL("../analyze-album-artwork-palette-v2-0.7.3-development.ts", import.meta.url),
	]
	const harness = (await Promise.all(harnessUrls.map((url) => readFile(url, "utf8")))).join("\n")
	assert.equal(harness.includes(`process.${"memoryUsage"}`), false)
	assert.equal(new RegExp(`\\b${"rss"}\\s*[:=]`, "iu").test(harness), false)
})

test("checked 0.7.3 artifacts verify dynamically through their manifest", async (t) => {
	try {
		await stat(new URL("manifest.json", experimentUrl))
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			t.skip("Full 28-source 0.7.3 artifacts have not been published yet")
			return
		}
		throw error
	}
	const analysis = await verifyAlbumArtworkPaletteV2073Development(experimentUrl.pathname)
	assert.equal(analysis.analysisId, albumArtworkPaletteV2073ContentId(analysis, "analysisId"))
	assert.equal(analysis.mechanicalPass, true)
	const selection = analysis.selection as Readonly<{ pass: boolean; selectedArm: string | null }>
	assert.equal(selection.pass, selection.selectedArm !== null)
	assert.deepEqual(analysis.authorization, {
		humanReview: false,
		directionalSample: false,
		phase5: false,
		promotion: false,
		persistence: false,
		fullRoster: false,
	})
	if (!selection.pass) assert.equal(analysis.disposition, "next-research-unit-multi-hue-field-structure")
})
