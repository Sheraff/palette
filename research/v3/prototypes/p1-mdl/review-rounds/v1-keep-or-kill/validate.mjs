/**
 * Validate the staged fixture against the real endpoint validator, on disk, and for blinding.
 *
 * Ported from the predecessor round's validate.mjs. Five passes, all of them against artifacts rather
 * than against the builder's claims:
 *   1. `parseBatch` — the *same* function `POST /api/batches` calls (server.ts imports it from
 *      batch.ts). imagePaths are rewritten to absolute first, because the push API requires that and
 *      the staged file is repo-relative on purpose.
 *   2. every imagePath resolves to a readable regular file under the repo root, and its bytes hash to
 *      the `inputContentHash` BOTH emitter runs recorded (the key carries one value per item only
 *      after the builder asserted the two runs agree).
 *   3. fingerprints are complete on every side (all four fields, `dirty` a real boolean) and pin the
 *      emission-of-record commit.
 *   4. blinding: no arm name, candidate id, salt, true algorithmVersion or repair name anywhere in
 *      batch.json; variantIds opaque and pairwise distinct; the two sides of an item never separable
 *      by any field other than the palette itself.
 *   5. the id surface: EVERY string in the fixture is scanned for round / milestone / arm / prototype
 *      tokens, plus — new in this round — ITERATION tokens (`v0`, `v1`) and the words that name what
 *      this round decides (`keep`, `kill`). An iteration marker on a served string would tell the
 *      reviewer the cover has been shown before and that one side is a repair; that is a prior, and
 *      it is the one this round must not plant. Run against `batch.negative-test.json` — the retired
 *      first staging of the predecessor round — so the scan cannot pass vacuously.
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
const EXPECTED_COMMIT = "6b40db9"
const EXPECTED_ITEM_IDS = [
	"00007e976f2fb1819d1ec7e0cc2869f39d397ba3",
	"ab67616d00001e020000269ead63cf2376a6b67d",
	"ab67616d00001e02000025b4e66a00806cb6dd7d",
	"ab67616d00001e02000022e7e9d11c908479200b",
	"ab67616d00001e02000018e9b0ec8fc5ac790164",
	"ab67616d00001e0200000bbc3367a621256ce593",
	"ab67616d00001e020000099e97d17d28279e9184",
	"ab67616d00001e0200001456cbd4881a798808bf",
]

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
// The key stores one hash per item; assert both sides' runs recorded it, not just the first.
for (const item of key.items) {
	for (const side of item.sides) {
		check("KEY_SIDE_HASH_DISAGREES", side.inputContentHash === item.inputContentHash, `${item.itemId} ${side.source}`)
	}
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
		check("FINGERPRINT_DIRTY_TRUE", fingerprint.dirty === false, item.itemId)
		check("FINGERPRINT_COMMIT_UNEXPECTED", fingerprint.gitCommit === EXPECTED_COMMIT, `${item.itemId} ${fingerprint.gitCommit}`)
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
	"chromatic",
	"residual",
	key.blindingSalt,
	...Object.values(key.trueAlgorithmVersions ?? {}),
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
		// The key's arm claim must match the version the emitter actually stamped on that side.
		check(
			"KEY_ARM_VERSION_MISMATCH",
			side.trueAlgorithmVersion === key.trueAlgorithmVersions?.[side.source],
			`${item.itemId} ${side.source} ${side.trueAlgorithmVersion}`,
		)
	}
	check("KEY_SIDE_COUNT", item.sides.length === 2, item.itemId)
	check("KEY_ARMS_NOT_BOTH_PRESENT", new Set(item.sides.map((side) => side.source)).size === 2, item.itemId)
}
check("KEY_ITEM_COUNT", key.items.length === batch.items.length)
for (const item of batch.items) {
	// itemIds are the cover's 40-hex image stem: neutral, and cross-round joinable.
	check("ITEM_ID_NOT_IMAGE_STEM", item.itemId === item.imagePath.replace(/^00\//u, "").replace(/\.jpg$/u, ""), item.itemId)
	check("ITEM_ID_NOT_HEX40", /^[0-9a-f]{40}$/u.test(item.itemId), item.itemId)
}
// The eight covers are the predecessor round's eight, in order — the comparability the round is built on.
check(
	"SELECTION_NOT_THE_PREDECESSOR_EIGHT",
	JSON.stringify(batch.items.map((item) => item.itemId)) === JSON.stringify(EXPECTED_ITEM_IDS),
	batch.items.map((item) => item.itemId).join(","),
)
// The keep-or-kill axis needs the predecessor baseline recorded before the new verdicts exist.
check("KEY_MISSING_PREDECESSOR_ROUND", key.predecessorRound?.installedBatchId === "phase2-pair-010")
check("KEY_MISSING_DESIGN_CITATION", typeof key.round?.spec === "string" && key.round.spec.includes("V1"))
check("KEY_MISSING_KILL_CONDITION", typeof key.round?.killCondition === "string" && key.round.killCondition.length > 0)
check(
	"KEY_MISSING_PREDECESSOR_GRADES",
	key.items.every(
		(item) =>
			item.predecessorGrades &&
			typeof item.predecessorGrades["arm-a"] === "string" &&
			typeof item.predecessorGrades["arm-aprime"] === "string",
	),
)

// ---- 5. the id surface ------------------------------------------------------------------------
/**
 * Forbidden token classes on any served string. `purpose` is the ONE exclusion: it is the server's own
 * six-value enum (`BATCH_PURPOSES`), shared by every prototype, and it identifies nothing here.
 *
 * The last three classes are new in this round: an iteration marker, or the words naming the decision,
 * would tell the reviewer this cover has been graded before and that one side is a repair.
 */
const FORBIDDEN = [
	[/\bm[0-9]\b/iu, "milestone token (m1..m9)"],
	[/\bmilestones?\b/iu, "milestone word"],
	[/\bfalsifier\b/iu, "milestone word"],
	[/\bpriors?\b/iu, "'prior' as a side label"],
	[/item-?\d/iu, "item ordinal"],
	[/\bp1ap?\b/iu, "arm name"],
	[/a-?prime/iu, "arm name"],
	[/p[1-6]-[a-z]+/iu, "prototype slug"],
	[/\bp[1-6]\b/iu, "prototype token"],
	[/\bv[01]\b/iu, "iteration token"],
	[/-v[01]\b/iu, "iteration token in a path or version"],
	[/\bkeep-or-kill\b|\bkill\b/iu, "names the decision this round makes"],
]

/** Every string the fixture carries, with the JSON path it sits at. `purpose` excluded, see above. */
function servedStrings(value, path = "$", out = []) {
	if (typeof value === "string") out.push([path, value])
	else if (Array.isArray(value)) value.forEach((entry, index) => servedStrings(entry, `${path}[${index}]`, out))
	else if (value && typeof value === "object") {
		for (const [name, entry] of Object.entries(value)) {
			if (path === "$" && name === "purpose") continue
			servedStrings(entry, `${path}.${name}`, out)
		}
	}
	return out
}

function scanIdSurface(fixture, label) {
	const hits = []
	for (const [path, text] of servedStrings(fixture)) {
		for (const [pattern, why] of FORBIDDEN) {
			const match = text.match(pattern)
			if (match) hits.push(`${label} ${path}: ${JSON.stringify(match[0])} — ${why}`)
		}
	}
	return hits
}

const liveHits = scanIdSurface(batch, "batch.json")
for (const hit of liveHits) check("ID_SURFACE_LEAK", false, hit)
console.log(`ID_SURFACE scanned ${servedStrings(batch).length} strings in batch.json — ${liveHits.length} hit(s)`)

// The negative test: the retired fixture MUST trip the same scan, or the scan proves nothing.
const negativePath = resolve(HERE, "batch.negative-test.json")
try {
	const negative = JSON.parse(readFileSync(negativePath, "utf8"))
	const negativeHits = scanIdSurface(negative, "batch.negative-test.json")
	check("ID_SURFACE_SCAN_VACUOUS", negativeHits.length > 0, "the retired fixture passed a scan it must fail")
	console.log(`ID_SURFACE negative test — retired fixture trips ${negativeHits.length} hit(s), e.g.:`)
	for (const hit of negativeHits.slice(0, 4)) console.log(`    ${hit}`)
} catch (error) {
	check("ID_SURFACE_NEGATIVE_TEST_MISSING", false, `${negativePath}: ${error.message}`)
}
// A second negative test for the class this round added: the scan must trip on an iteration marker,
// which the retired fixture does not carry. Synthetic, in memory, never written.
const iterationProbe = JSON.parse(JSON.stringify(batch))
iterationProbe.items[0].sides[0].fingerprint.algorithmVersion = "v3-emitter-v1-0.2.0"
const probeHits = scanIdSurface(iterationProbe, "iteration-probe")
check("ID_SURFACE_MISSES_ITERATION_TOKEN", probeHits.length > 0, "an iteration marker passed the scan")
console.log(`ID_SURFACE iteration probe — synthetic "…-v1-…" trips ${probeHits.length} hit(s)`)

// ---- report ----------------------------------------------------------------------------------
if (failures.length === 0) {
	console.log(`ALL PASSED — ${batch.items.length} items, ${everyVariantId.length} sides`)
	process.exit(0)
}
console.error(`${failures.length} FAILURE(S):`)
for (const failure of failures) console.error(`  ${failure}`)
process.exit(1)
