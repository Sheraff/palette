import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { promisify } from "node:util"
import test from "node:test"
import {
	PHASE_4_FAST_SAMPLE_MANIFEST_PATH,
	PHASE_4_FAST_SAMPLE_SELECTION_POLICY,
	buildPhase4FastSampleManifest,
	verifyPhase4FastSampleManifest,
} from "../select-album-artwork-palette-v2-phase-4-fast-sample.ts"
import { parseSourceProvenanceInventory } from "../src/source-provenance-inventory.ts"

const run = promisify(execFile)
const inventoryUrl = new URL("../data/source-provenance-inventory-00-14.json", import.meta.url)
const manifestUrl = new URL("../data/album-artwork-palette-v2-phase-4-fast-sample.sealed.json", import.meta.url)
const selectorUrl = new URL("../select-album-artwork-palette-v2-phase-4-fast-sample.ts", import.meta.url)
const projectRoot = new URL("../../", import.meta.url)

async function input() {
	const bytes = await readFile(inventoryUrl)
	return {
		inventory: parseSourceProvenanceInventory(JSON.parse(bytes.toString("utf8")) as unknown),
		rawSha256: createHash("sha256").update(bytes).digest("hex"),
	}
}

test("selects and seals 12 deterministic source-only root-12 artwork families", async () => {
	const { inventory, rawSha256 } = await input()
	const first = buildPhase4FastSampleManifest(inventory, rawSha256)
	const second = buildPhase4FastSampleManifest(inventory, rawSha256)
	assert.deepEqual(first, second)
	assert.equal(first.selection.policy, PHASE_4_FAST_SAMPLE_SELECTION_POLICY)
	assert.equal(first.selection.root, "12")
	assert.equal(first.selections.length, 12)
	assert.equal(new Set(first.selections.map(({ familyId }) => familyId)).size, 12)
	assert.equal(new Set(first.selections.map(({ source }) => source.path)).size, 12)
	assert.equal(new Set(first.selections.map(({ source }) => source.sha256)).size, 12)
	assert.deepEqual(first.selections.map(({ selectionKey }) => selectionKey),
		first.selections.map(({ selectionKey }) => selectionKey).toSorted())
	for (const selected of first.selections) {
		assert.match(selected.source.path, /^12\//)
		const family = inventory.families.find(({ artworkId }) => artworkId === selected.familyId)
		assert.ok(family)
		assert.equal(family.reserve?.futureValidationEligible, true)
		assert.deepEqual(family.reserve?.roots, ["12"])
		assert.ok(family.variants.some(({ path, sha256, byteCount }) => path === selected.source.path &&
			sha256 === selected.source.sha256 && byteCount === selected.source.byteCount))
		const group = inventory.rawSha256Groups.find(({ sha256 }) => sha256 === selected.source.sha256)
		assert.ok(group)
		assert.equal(group.priorContentPaths.length, 0)
		assert.deepEqual(group.reserveArtworkIds, [selected.familyId])
	}
})

test("checked-in seal exactly reconstructs and explicitly forbids development extraction", async () => {
	const [{ inventory, rawSha256 }, bytes] = await Promise.all([input(), readFile(manifestUrl)])
	const manifest = JSON.parse(bytes.toString("utf8")) as unknown
	const verified = verifyPhase4FastSampleManifest(manifest, inventory, rawSha256)
	assert.equal(verified.inventory.path, "research/data/source-provenance-inventory-00-14.json")
	assert.equal(verified.inventory.rawSha256, rawSha256)
	assert.equal(verified.custody.sealState, "closed")
	assert.equal(verified.custody.developmentExtractionProhibited, true)
	assert.match(verified.custody.prohibition, /Development extraction is forbidden/)
	assert.equal(PHASE_4_FAST_SAMPLE_MANIFEST_PATH,
		"research/data/album-artwork-palette-v2-phase-4-fast-sample.sealed.json")
	const stale = structuredClone(verified) as unknown as { selections: Array<{ source: { byteCount: number } }> }
	stale.selections[0].source.byteCount++
	assert.throws(() => verifyPhase4FastSampleManifest(stale, inventory, rawSha256), /does not exactly match/)
})

test("selector verifies an existing seal and refuses to overwrite it", async () => {
	const selector = selectorUrl.pathname
	const options = { cwd: projectRoot.pathname, env: { ...process.env, NODE_NO_WARNINGS: "1" } }
	const verified = await run(process.execPath, ["--experimental-strip-types", selector, "--verify"], options)
	assert.match(verified.stdout, /Phase 4 fast sample verified: manifest=[a-f0-9]{64} seal=[a-f0-9]{64}/)
	await assert.rejects(
		run(process.execPath, ["--experimental-strip-types", selector, "seal"], options),
		(error: unknown) => {
			assert.match((error as { stderr: string }).stderr, /Refusing to overwrite sealed reserve selection/)
			return true
		},
	)
})

test("selector has no artwork discovery, decoding, rendering, or extraction surface", async () => {
	const source = await readFile(selectorUrl, "utf8")
	assert.doesNotMatch(source, /sharp|loadImage|readdir|opendir|glob|extractColors|extractPalette/)
	assert.match(source, /parseSourceProvenanceInventory/)
	assert.match(source, /variant\.sha256/)
	assert.match(source, /variant\.byteCount/)
	assert.doesNotMatch(source, /preferredSourcePath/)
})
