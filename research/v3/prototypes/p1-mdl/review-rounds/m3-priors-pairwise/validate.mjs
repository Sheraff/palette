/**
 * Validate the staged fixture against the real endpoint validator, on disk, and for blinding.
 *
 * Four passes, all of them against artifacts rather than against the builder's claims:
 *   1. `parseBatch` — the *same* function `POST /api/batches` calls (server.ts imports it from
 *      batch.ts). imagePaths are rewritten to absolute first, because the push API requires that
 *      and the staged file is repo-relative on purpose.
 *   2. every imagePath resolves to a readable regular file under the repo root, and its bytes hash
 *      to the `inputContentHash` both emitter runs recorded.
 *   3. fingerprints are complete on every side (all four fields, `dirty` a real boolean).
 *   4. blinding: no arm name, candidate id, salt or true algorithmVersion anywhere in batch.json;
 *      variantIds opaque and pairwise distinct; the two sides of an item never separable by any
 *      field other than the palette itself.
 *
 * Run:  node <this file>          exit 0 = all passed, 1 = at least one failure, named.
 */
import { createHash } from "node:crypto"
import { readFileSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseBatch } from "../../../../src/review-server/batch.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, "../../../../../..")

const batch = JSON.parse(readFileSync(resolve(HERE, "batch.json"), "utf8"))
const key = JSON.parse(readFileSync(resolve(HERE, "KEY.json"), "utf8"))

const failures = []
const check = (name, condition, detail = "") => {
	if (!condition) failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

// ---- 1. the endpoint's own validator -------------------------------------------------------
const absolute = {
	...batch,
	items: batch.items.map((item) => ({ ...item, imagePath: resolve(REPO_ROOT, item.imagePath) })),
}
delete absolute._comment
delete absolute.imagePathsRelativeTo
let parsed = null
try {
	parsed = parseBatch(absolute)
	console.log(`PARSE_BATCH ok — ${parsed.items.length} items, purpose ${parsed.purpose}`)
} catch (error) {
	check("PARSE_BATCH", false, error.message)
}

// ---- 2. the images ---------------------------------------------------------------------------
const hashById = new Map(key.items.map((item) => [item.itemId, item.inputContentHash]))
for (const item of batch.items) {
	const path = resolve(REPO_ROOT, item.imagePath)
	let stat = null
	try {
		stat = statSync(path)
	} catch (error) {
		check("IMAGE_MISSING", false, `${item.itemId} ${item.imagePath}: ${error.code}`)
		continue
	}
	check("IMAGE_NOT_FILE", stat.isFile(), `${item.itemId} ${item.imagePath}`)
	check("IMAGE_OUTSIDE_ROOT", path.startsWith(`${REPO_ROOT}/`), `${item.itemId} ${path}`)
	const digest = createHash("sha256").update(readFileSync(path)).digest("hex")
	check("IMAGE_HASH_MISMATCH", digest === hashById.get(item.itemId), `${item.itemId} ${digest}`)
}

// ---- 3. fingerprints -------------------------------------------------------------------------
for (const item of batch.items) {
	for (const side of item.sides) {
		const fingerprint = side.fingerprint ?? {}
		for (const field of ["algorithmVersion", "preprocessingVersion", "gitCommit"]) {
			check(
				"FINGERPRINT_INCOMPLETE",
				typeof fingerprint[field] === "string" && fingerprint[field].length > 0,
				`${item.itemId} ${field}`,
			)
		}
		check("FINGERPRINT_DIRTY_NOT_BOOLEAN", typeof fingerprint.dirty === "boolean", item.itemId)
		check("FINGERPRINT_COMMIT_UNEXPECTED", fingerprint.gitCommit === "b257412", `${item.itemId} ${fingerprint.gitCommit}`)
	}
}

// ---- 4. blinding -----------------------------------------------------------------------------
const serialized = JSON.stringify(batch)
const banned = [
	"arm-a",
	"arm-aprime",
	"aprime",
	"p1a-",
	"p1ap-",
	'"p1a"',
	'"p1ap"',
	"mass-normalised",
	"schema-derived",
	key.blindingSalt,
]
for (const needle of banned) {
	check("BLINDING_LEAK", !serialized.includes(needle), `batch.json contains ${JSON.stringify(needle.slice(0, 24))}`)
}
const everyVariantId = batch.items.flatMap((item) => item.sides.map((side) => side.variantId))
check("VARIANT_IDS_NOT_UNIQUE", new Set(everyVariantId).size === everyVariantId.length)
for (const variantId of everyVariantId) {
	check("VARIANT_ID_NOT_OPAQUE", /^v-[0-9a-f]{16}$/u.test(variantId), variantId)
}
for (const item of batch.items) {
	const [left, right] = item.sides
	// The only field allowed to differ between two sides of one item is the palette.
	check("SIDES_SEPARABLE_BY_FINGERPRINT", JSON.stringify(left.fingerprint) === JSON.stringify(right.fingerprint), item.itemId)
	check("SIDES_NOT_SORTED", left.variantId < right.variantId, item.itemId)
	check("SIDES_IDENTICAL_PALETTE", JSON.stringify(left.palette) !== JSON.stringify(right.palette), item.itemId)
}
// The key must actually unblind: every variantId in the fixture is mapped, and the derivation checks out.
for (const item of key.items) {
	for (const side of item.sides) {
		const expected = `v-${createHash("sha256").update(`${key.blindingSalt}|${item.itemId}|${side.source}`).digest("hex").slice(0, 16)}`
		check("KEY_DOES_NOT_DERIVE", expected === side.variantId, `${item.itemId} ${side.source}`)
		check("KEY_VARIANT_NOT_IN_BATCH", everyVariantId.includes(side.variantId), side.variantId)
	}
}
check("KEY_ITEM_COUNT", key.items.length === batch.items.length)

// ---- report ----------------------------------------------------------------------------------
if (failures.length === 0) {
	console.log(`ALL PASSED — ${batch.items.length} items, ${everyVariantId.length} sides`)
	process.exit(0)
}
console.error(`${failures.length} FAILURE(S):`)
for (const failure of failures) console.error(`  ${failure}`)
process.exit(1)
