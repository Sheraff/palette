/**
 * Build the staged pairwise fixture for P1's keep-or-kill round (DESIGN.md § V1, item 4).
 *
 * Reads the two emitter runs of record over demo-20, selects the SAME eight covers the predecessor
 * round used (per-arm grade comparability across rounds), translates each emitter palette into the
 * review server's push shape (`parseBatch` in `research/v3/src/review-server/batch.ts`), and writes:
 *
 *   batch.json  — the staged fixture, blinded. Safe to read: it says nothing about which side came
 *                 from which arm, from which iteration, or what this round decides.
 *   KEY.json    — ORCHESTRATOR-ONLY. The blinding salt, the per-item variantId -> arm mapping, the
 *                 true algorithmVersions, and the predecessor round's per-item grades. Never served,
 *                 never pushed, never quoted in a report.
 *
 * Blinding, three layers, all of them undone only by KEY.json — carried over unchanged from the
 * predecessor round's builder, which is this file's template:
 *   1. `variantId` is `v-<16 hex>` = sha256(salt · itemId · sourceTag): opaque, unique per item, and
 *      NOT recomputable from the fixture alone (a content-only derivation is brute-forceable by
 *      anyone who can guess the two source tags).
 *   2. The two sides are emitted sorted by `variantId`, so position in the file carries no signal.
 *   3. `fingerprint.algorithmVersion` is one shared string on both sides. The two true ones name
 *      their arm; they live in KEY.json instead. `preprocessingVersion` is asserted identical across
 *      the two runs before it is carried through, so it leaks nothing.
 *
 * One token class is banned here that was not banned in the predecessor round: the ITERATION marker.
 * `v0`/`v1` on a served string would tell the reviewer this cover has been shown before and that one
 * side is a repair — that is a prior, and it is exactly the prior this round must not plant. So the
 * blinded algorithmVersion carries no iteration segment, and `fundedBy` cites the two runs by a glob
 * that resolves to them without spelling one.
 *
 * Deterministic: re-running with an existing KEY.json reuses its salt and reproduces batch.json byte
 * for byte.
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

/** The two emitter runs of record. `tag` is the private source label; it never reaches batch.json. */
const SOURCES = [
	{ tag: "arm-a", file: "a-demo-20-2026-08-05-v1.jsonl", trueAlgorithmVersion: "p1a-0.2.0" },
	{ tag: "arm-aprime", file: "aprime-demo-20-2026-08-05-v1.jsonl", trueAlgorithmVersion: "p1ap-0.2.0" },
]

/** The commit the emission of record is attributed to, per the round's spawn brief. */
const GIT_COMMIT = "6b40db9"
const DIRTY = false

/**
 * One shared algorithmVersion, and a neutral one.
 *
 * The two true strings (`p1a-0.2.0`, `p1ap-0.2.0`) name their arm; they live in KEY.json. The stand-in
 * carries no arm, no prototype slug, and — unlike the predecessor round's `v3-emitter-v0-0.1.0` — no
 * iteration segment either. Both sides carry the same string, so it cannot separate them.
 */
const BLINDED_ALGORITHM_VERSION = "v3-emitter-0.2.0"

/** Opaque date-serial. Names nothing: not the question, not the iteration, not the arms. */
const BATCH_ID = "b-20260811-9d47"
const PURPOSE = "arm"

/**
 * `fundedBy` IS served (`/api/queue`, `/api/dashboard`, the payload endpoints — server.ts), so it is
 * written to the same standard as an itemId: no milestone words, no arm labels, no prototype paths,
 * no iteration markers, and nothing that says what a preference here decides. The full, unblinded
 * provenance is in ROUND.md and KEY.json.
 *
 * The glob resolves to exactly the two runs these palettes are taken from: the trailing `-*` after the
 * date is present on both of them and on neither of the earlier pair.
 */
const FUNDED_BY = [
	"Two candidate emitters over the demo-20 set: identical decode, identical preprocessing, differing only in the objective that priced the configuration.",
	"Both objectives were re-derived after an earlier comparison of the same two; this round asks the question of the current palettes.",
	"data/emitter/*-demo-20-2026-08-05-*.jsonl — the two runs these palettes are taken from, verbatim.",
]

/**
 * The eight covers, in serve order — the SAME eight the predecessor round served, deliberately, so
 * each arm's grades are comparable across the two rounds per cover.
 */
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

/**
 * The predecessor round's per-item grades, for KEY.json only. This is the keep-or-kill axis: the
 * reading is grade DELTAS per arm per cover, and the baseline must be recorded before the new
 * verdicts exist, not reconstructed after. Source: the predecessor round's verdicts.json.
 */
const PREDECESSOR_ROUND = "phase2-pair-010"
const PREDECESSOR_VERDICTS = "research/v3/prototypes/p1-mdl/review-rounds/m3-priors-pairwise/verdicts.json"
const PREDECESSOR_GRADES = {
	"00007e976f2fb1819d1ec7e0cc2869f39d397ba3": { "arm-a": "acceptable", "arm-aprime": "unacceptable", preference: "arm-a" },
	ab67616d00001e020000269ead63cf2376a6b67d: { "arm-a": "weak", "arm-aprime": "unacceptable", preference: "arm-a" },
	ab67616d00001e02000025b4e66a00806cb6dd7d: { "arm-a": "unacceptable", "arm-aprime": "unacceptable", preference: null },
	ab67616d00001e02000022e7e9d11c908479200b: { "arm-a": "weak", "arm-aprime": "unacceptable", preference: "arm-a" },
	ab67616d00001e02000018e9b0ec8fc5ac790164: { "arm-a": "unacceptable", "arm-aprime": "weak", preference: "arm-aprime" },
	ab67616d00001e0200000bbc3367a621256ce593: { "arm-a": "unacceptable", "arm-aprime": "unacceptable", preference: null },
	ab67616d00001e020000099e97d17d28279e9184: { "arm-a": "weak", "arm-aprime": "unacceptable", preference: "arm-a" },
	ab67616d00001e0200001456cbd4881a798808bf: { "arm-a": "weak", "arm-aprime": "weak", preference: "arm-aprime" },
}

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

/** itemIds are the cover's 40-hex image stem — the campaign convention, and cross-round joinable. */
const itemIdOf = (filename) => filename.replace(/\.jpg$/u, "")

for (const filename of SELECTION) {
	const itemId = itemIdOf(filename)
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
		// The run must actually be the arm KEY.json will claim it is; a mislabelled key unblinds wrong.
		if (row.palette.metadata?.algorithmVersion !== run.trueAlgorithmVersion) {
			failures.push(
				`${itemId}: ${run.file} stamps ${row.palette.metadata?.algorithmVersion}, expected ${run.trueAlgorithmVersion}`,
			)
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
				lambda: row.diagnostics?.lambda ?? null,
				inputContentHash: row.palette.metadata.inputContentHash,
				minAbsApcaForeground: row.diagnostics?.apca?.foreground?.minAbsRaw ?? null,
				minAbsApcaAccent: row.diagnostics?.apca?.accent?.minAbsRaw ?? null,
				gradientStops: row.palette.gradient ? row.palette.gradient.stops.length : 0,
				swapDelta: row.diagnostics?.swap?.delta ?? null,
			},
		})
	}
	if (sides.length !== 2) {
		failures.push(`${itemId}: ${sides.length} usable sides, expected 2`)
		continue
	}
	// Both runs must have decoded the same bytes, or the two palettes are not comparable.
	if (sides[0].key.inputContentHash !== sides[1].key.inputContentHash) {
		failures.push(`${itemId}: the two runs disagree on the input content hash`)
		continue
	}
	// The one preprocessing string is carried into the payload, so it must not separate the arms.
	if (sides[0].side.fingerprint.preprocessingVersion !== sides[1].side.fingerprint.preprocessingVersion) {
		failures.push(`${itemId}: preprocessingVersion differs between runs — it would unblind the sides`)
		continue
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
		predecessorGrades: PREDECESSOR_GRADES[itemId] ?? null,
		sides: sides.map((entry) => entry.key),
	})
}

if (failures.length > 0) {
	console.error("TRANSLATION FAILURES:")
	for (const failure of failures) console.error(`  ${failure}`)
	process.exit(1)
}

const batch = {
	_comment: [
		"Staged pairwise batch — NOT installed. The main orchestrator pushes it.",
		"imagePath entries are repo-root-relative; the push API requires absolute paths, so the",
		"installer rewrites them (the same convention as fixtures/demo-batch.json). Resolve them",
		"against the MAIN checkout root, never a worktree root: a worktree path would put a",
		"directory slug into the stored artwork identity.",
		"Every id here is neutral by construction: itemIds are the cover's image stem, variantIds",
		"are salted opaque tokens, side order is sorted by them, and both sides carry one shared",
		"algorithmVersion with no iteration segment. The side mapping lives in KEY.json, which is",
		"never served.",
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
		"arm-a = candidate p1a, the mass-normalised prior, at lambda 0.1.",
		"arm-aprime = candidate p1ap, the schema-derived serialization prior with the chromatic",
		"residual density (the repair under test).",
	],
	batchId: BATCH_ID,
	round: {
		what: "P1's one bounded-iteration keep-or-kill round",
		spec: "research/v3/prototypes/p1-mdl/DESIGN.md § V1 — the one bounded iteration (reviewer ruling, 2026-08-05)",
		grantedScope: [
			"chromatic residual density for arm-aprime (DESIGN item 11)",
			"lambda recalibration + disentangling arm-a's collapse degeneracy (lambda_a = 0.1, MEASURED)",
			"re-emit demo-20",
			"ONE 8-item pairwise round on the same eight covers as the predecessor round",
		],
		killCondition:
			"Pre-registered (DESIGN § V1): if the iteration needs ANYTHING beyond the recorded repair, that fact is itself the kill signal. Keep-or-kill is decided on this round's verdicts; the falsification record stands either way.",
		deliberatelyUntouched:
			"The indistinguishable-inks axis. Contract floors are the reviewer's; if this round dies there again, that is kill data, not a repair prompt.",
	},
	predecessorRound: {
		installedBatchId: PREDECESSOR_ROUND,
		stagedBatchId: "b-20260805-4a2e",
		stagingDir: "research/v3/prototypes/p1-mdl/review-rounds/m3-priors-pairwise/",
		verdicts: PREDECESSOR_VERDICTS,
		sameEightCovers: true,
		why: "Per-arm grade comparability across rounds. The keep-or-kill axis is the per-arm grade DELTA on the same cover, so the cover set is held fixed by design.",
		outcome:
			"MECHANISM-FALSIFIED filed on the predecessor round: zero strong grades, ink-recovery falsifier fired, coverage-vs-identity corroborated live, arm-a degenerate 20/20 two-colour.",
	},
	emissionOfRecord: {
		gitCommit: GIT_COMMIT,
		dirty: DIRTY,
		note: "The fingerprint attributes both sides to the commit that carries the two emission files. The runs' own provenance headers name the code commits they executed at (arm-a 14e6616 clean; arm-aprime 0de3b06 with a dirty tree); those are recorded in the run headers, not on the served surface.",
	},
	blindingSalt: salt,
	blindedAlgorithmVersion: BLINDED_ALGORITHM_VERSION,
	trueAlgorithmVersions: Object.fromEntries(SOURCES.map((source) => [source.tag, source.trueAlgorithmVersion])),
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
			`stops=${left.palette.gradient ? left.palette.gradient.stops.length : 0}/${right.palette.gradient ? right.palette.gradient.stops.length : 0}`,
	)
}
