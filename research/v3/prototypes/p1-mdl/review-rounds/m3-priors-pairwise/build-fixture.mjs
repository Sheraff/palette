/**
 * Build the staged pairwise fixture for the M3 prior-comparison round.
 *
 * Reads the two M2 emitter runs over demo-20, selects the eight covers listed in `SELECTION`,
 * translates each emitter palette into the review server's push shape (`parseBatch` in
 * `research/v3/src/review-server/batch.ts`), and writes:
 *
 *   batch.json  — the staged fixture, blinded. Safe to read: it says nothing about which side
 *                 came from which prior.
 *   KEY.json    — ORCHESTRATOR-ONLY. The blinding salt and the per-item variantId -> source
 *                 mapping. Never served, never pushed, never quoted in a report.
 *
 * Blinding, three layers, all of them undone only by KEY.json:
 *   1. `variantId` is `v-<16 hex>` = sha256(salt · itemId · sourceTag), so it is opaque, unique
 *      per item, and NOT recomputable from the fixture alone. A content-only derivation would be
 *      brute-forceable by anyone who can guess the two source tags — the same self-consistency
 *      attack the review server's own README records against its unsalted first shuffle.
 *   2. The two sides are emitted sorted by `variantId`, so position in the file carries no signal.
 *   3. `fingerprint.algorithmVersion` is one shared string on both sides. The two real ones name
 *      their arm; they live in KEY.json instead. `preprocessingVersion` is asserted identical
 *      across the two runs before it is carried through, so it leaks nothing.
 *
 * Deterministic: re-running with an existing KEY.json reuses its salt and reproduces batch.json
 * byte for byte.
 *
 * Run from anywhere:  node <this file>
 */
import { createHash, randomBytes } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, "../../../../../..")
const EMITTER_DIR = resolve(REPO_ROOT, "research/v3/prototypes/p1-mdl/data/emitter")

/** The two emitter runs. `tag` is the private source label; it never reaches batch.json. */
const SOURCES = [
	{ tag: "arm-a", file: "a-demo-20-2026-08-05.jsonl" },
	{ tag: "arm-aprime", file: "aprime-demo-20-2026-08-05.jsonl" },
]

/** The commit the palettes are attributed to, per the round's spawn brief. */
const GIT_COMMIT = "b257412"
const DIRTY = false
/** One shared algorithmVersion: the real ones name their arm. True values are in KEY.json. */
const BLINDED_ALGORITHM_VERSION = "p1-mdl-v0-emitter-0.1.0"

const BATCH_ID = "priors-pairwise-20260805a"
const PURPOSE = "arm"
const FUNDED_BY = [
	"DESIGN.md M1 OUTCOME (2026-08-04): no pre-registered energy signal for either prior on legacy verdicts; the prior comparison waits on fresh palettes under current priors",
	"data/falsifier + data/falsifier-m1b — M1 attribution: spread for one prior, single genericBits culprit for the other (coverage vs identity)",
	"data/emitter/*-demo-20-2026-08-05.jsonl — the two M2 v0 emitter runs over demo-20 this round compares",
]

/** The eight covers, in serve order. Selected by the prototype orchestrator. */
const SELECTION = [
	"00007e976f2fb1819d1ec7e0cc2869f39d397ba3.jpg",
	"ab67616d00001e020000269ead63cf2376a6b67d.jpg",
	"ab67616d00001e02000025b4e66a00806cb6dd7d.jpg",
	"ab67616d00001e02000022e7e9d11c908479200b.jpg",
	"ab67616d00001e02000018e9b0ec8fc5ac790164.jpg",
	"ab67616d00001e0200000bbc3367a621256ce593.jpg",
	"ab67616d00001e020000099e97d17d28279e9184.jpg",
	"ab67616d00001e0200001456cbd4881a798808bf.jpg",
]

function loadRows(file) {
	const rows = readFileSync(resolve(EMITTER_DIR, file), "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line))
		.filter((row) => row.kind === "p1-emitter-row")
	return new Map(rows.map((row) => [basename(row.imagePath), row]))
}

/** Emitter palette -> the server's `PaletteSnapshot` push shape. Faithful, nothing invented. */
function translate(palette, what) {
	const fail = (message) => {
		throw new Error(`${what}: ${message}`)
	}
	if (!palette) fail("row carries no palette")
	if (palette.escape !== null) fail(`escape branch fired (${JSON.stringify(palette.escape)}) — translation not defined`)
	const hex = (role) => {
		const value = palette.roles?.[role]?.hex
		if (typeof value !== "string" || !/^#[0-9a-f]{6}$/u.test(value)) fail(`role ${role} has no usable hex`)
		return value
	}
	let gradient = null
	if (palette.gradient) {
		const stops = palette.gradient.stops
		if (!Array.isArray(stops) || stops.length < 2 || stops.length > 4) fail("gradient stop count outside 2..4")
		gradient = {
			stops: stops.map((stop, index) => {
				if (typeof stop.color?.hex !== "string") fail(`gradient stop ${index} has no hex`)
				if (typeof stop.position !== "number") fail(`gradient stop ${index} has no numeric position`)
				return { color: stop.color.hex, position: stop.position }
			}),
		}
		// The output contract: first stop IS background, last IS surface. Checked, not assumed.
		if (gradient.stops[0].color !== hex("background")) fail("first gradient stop is not the background")
		if (gradient.stops.at(-1).color !== hex("surface")) fail("last gradient stop is not the surface")
	}
	const surfaceCollapsed = palette.collapse?.surfaceCollapsed
	const accentCollapsed = palette.collapse?.accentCollapsed
	if (typeof surfaceCollapsed !== "boolean" || typeof accentCollapsed !== "boolean") fail("collapse flags missing")
	return {
		background: hex("background"),
		surface: hex("surface"),
		foreground: hex("foreground"),
		accent: hex("accent"),
		gradient,
		surfaceCollapsed,
		accentCollapsed,
	}
}

const keyPath = resolve(HERE, "KEY.json")
const previous = existsSync(keyPath) ? JSON.parse(readFileSync(keyPath, "utf8")) : null
const salt = previous?.blindingSalt ?? randomBytes(32).toString("hex")

const runs = SOURCES.map((source) => ({ ...source, rows: loadRows(source.file) }))

const items = []
const keyItems = []
const failures = []

SELECTION.forEach((filename, index) => {
	const itemId = `m3-item-${String(index + 1).padStart(2, "0")}`
	const sides = []
	for (const run of runs) {
		const row = run.rows.get(filename)
		if (!row) {
			failures.push(`${itemId}: ${filename} absent from ${run.file}`)
			continue
		}
		if (row.ok !== true) {
			failures.push(`${itemId}: ${run.file} row not ok (${row.error ?? "no error field"})`)
			continue
		}
		let palette
		try {
			palette = translate(row.palette, `${itemId}/${run.file}`)
		} catch (error) {
			failures.push(String(error.message))
			continue
		}
		const preprocessingVersion = row.palette.metadata?.preprocessingVersion
		if (typeof preprocessingVersion !== "string") {
			failures.push(`${itemId}: ${run.file} has no preprocessingVersion`)
			continue
		}
		const variantId = `v-${createHash("sha256").update(`${salt}|${itemId}|${run.tag}`).digest("hex").slice(0, 16)}`
		sides.push({
			sortKey: variantId,
			side: {
				variantId,
				fingerprint: {
					algorithmVersion: BLINDED_ALGORITHM_VERSION,
					preprocessingVersion,
					gitCommit: GIT_COMMIT,
					dirty: DIRTY,
				},
				palette,
			},
			key: {
				variantId,
				source: run.tag,
				sourceFile: `research/v3/prototypes/p1-mdl/data/emitter/${run.file}`,
				trueAlgorithmVersion: row.palette.metadata.algorithmVersion,
				candidateId: row.diagnostics?.candidateId ?? null,
				inputContentHash: row.palette.metadata.inputContentHash,
			},
		})
	}
	if (sides.length !== 2) {
		failures.push(`${itemId}: ${sides.length} usable sides, expected 2`)
		return
	}
	// Both runs must have decoded the same bytes, or the two palettes are not comparable.
	if (sides[0].key.inputContentHash !== sides[1].key.inputContentHash) {
		failures.push(`${itemId}: the two runs disagree on the input content hash`)
		return
	}
	// The one preprocessing string is carried into the payload, so it must not separate the arms.
	if (sides[0].side.fingerprint.preprocessingVersion !== sides[1].side.fingerprint.preprocessingVersion) {
		failures.push(`${itemId}: preprocessingVersion differs between runs — it would unblind the sides`)
		return
	}
	// Sorted by the opaque id: file position carries no signal.
	sides.sort((left, right) => (left.sortKey < right.sortKey ? -1 : 1))
	items.push({
		itemId,
		imagePath: `00/${filename}`,
		artworkId: null,
		sides: sides.map((entry) => entry.side),
	})
	keyItems.push({
		itemId,
		imagePath: `00/${filename}`,
		inputContentHash: sides[0].key.inputContentHash,
		sides: sides.map((entry) => entry.key),
	})
})

if (failures.length > 0) {
	console.error("TRANSLATION FAILURES:")
	for (const failure of failures) console.error(`  ${failure}`)
	process.exit(1)
}

const batch = {
	_comment: [
		"Staged pairwise round — NOT installed. The main orchestrator pushes it.",
		"imagePath entries are repo-root-relative; the push API requires absolute paths, so the",
		"installer rewrites them (the same convention as fixtures/demo-batch.json).",
		"Blinded: variantIds are salted opaque tokens, side order is sorted by them, and both sides",
		"carry one shared algorithmVersion. The arm mapping is in KEY.json, which is never served.",
	],
	imagePathsRelativeTo: "repo-root",
	batchId: BATCH_ID,
	purpose: PURPOSE,
	fundedBy: FUNDED_BY,
	items,
}

const key = {
	_warning: [
		"ORCHESTRATOR-ONLY. This file unblinds the round. Do not serve it, do not push it, do not",
		"read it while the batch is open, and never quote a variantId->arm pair in a report.",
		"arm-a = the mass-normalised prior (candidate p1a). arm-aprime = the schema-derived",
		"serialization prior (candidate p1ap).",
	],
	batchId: BATCH_ID,
	blindingSalt: salt,
	blindedAlgorithmVersion: BLINDED_ALGORITHM_VERSION,
	variantIdDerivation: 'sha256(`${blindingSalt}|${itemId}|${sourceTag}`) truncated to 16 hex, prefixed "v-"',
	items: keyItems,
}

writeFileSync(resolve(HERE, "batch.json"), `${JSON.stringify(batch, null, "\t")}\n`)
writeFileSync(keyPath, `${JSON.stringify(key, null, "\t")}\n`)

console.log(`wrote batch.json (${items.length} items) and KEY.json`)
for (const item of items) {
	const [left, right] = item.sides
	console.log(
		`  ${item.itemId} ${item.imagePath} ${left.variantId}/${right.variantId} ` +
			`grad=${left.palette.gradient ? left.palette.gradient.stops.length : 0}/${right.palette.gradient ? right.palette.gradient.stops.length : 0}`,
	)
}
