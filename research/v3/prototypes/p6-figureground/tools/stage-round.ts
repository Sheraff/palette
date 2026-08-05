/**
 * # `stage-round` — a devloop run in, a reviewer-ready calibration round out.
 *
 *     node --experimental-strip-types prototypes/p6-figureground/tools/stage-round.ts \
 *       --run data/devloop/runs/<runId>.jsonl \
 *       --covers 0,3,7,11,14 \
 *       --name p6-first-field-calibration \
 *       --purpose "Does the figure/ground reading pick the field a human would call the field?"
 *
 * ## What this file is, and the three things it is deliberately not
 *
 * It is **staging**. It reads a finished run, picks 4–10 of its rows, and writes a directory that
 * somebody else can push. It does not talk to the review server, it does not create a batch, it
 * does not release anything, and it holds no opinion about whether a palette is good — the whole
 * point of the round is that the reviewer supplies that.
 *
 * The three non-goals, stated because each one is a mistake this tool is one edit away from:
 *
 *  1. **No server contact.** Not a socket, not a `fetch`, not a health check. The main orchestrator
 *     installs centrally and pushes; a prototype that pushes its own rounds is a prototype that can
 *     put its own evidence in front of the reviewer without anyone deciding it should be there.
 *  2. **No judgement.** Nothing here scores, ranks, filters by quality, or picks "interesting"
 *     covers. `--covers` is the human's list. A staging tool that chose the covers would be choosing
 *     the answer, because a round is exactly its items.
 *  3. **No truth in the payload.** See the blinding section below.
 *
 * ## The three files, and who is allowed to read each
 *
 * | file | goes where | may contain |
 * |---|---|---|
 * | `fixture.json` | pushed to the server (`POST /api/calibration`) | the push schema, verbatim |
 * | `sidecar.data.json` | served to the browser as `review-ui/<batch>.data.json` | render data only |
 * | `private-mapping.json` | stays here, read only by the post-release analyst | the de-blinding join |
 *
 * `private-mapping.json` exists because of SPEC directive 10: when a round releases, the main tier
 * sends a content-free "batch <id> released" signal, and this prototype's own analyst has to
 * de-blind the released payload by joining `data/review-server/batches.jsonl` against a mapping that
 * was written *at fixture-build time*. A mapping reconstructed afterwards from memory or from a run
 * file that has since been re-run is not a join, it is a guess. It is **never** referenced from the
 * fixture or the side-car, and no path in either points at it.
 *
 * ## Blinding — what is withheld, from whom, and the one thing that is not
 *
 * The reviewer must not learn *whose* palette they are grading (`review-server/types.ts`,
 * `PushedCalibrationItem`: *"an algorithm version on screen would still tell the reviewer whose
 * palette they are grading, and the grade is supposed to be about the palette"*). Two surfaces reach
 * the reviewer: the payload the server composes (`calibrationPayload` → `blindSidePayload`, which
 * withholds `variantId`, `fingerprint` and the palette hash by construction) and the side-car, which
 * is a static file this tool writes. So:
 *
 *  - **the side-car carries nothing but render data** — the same object `blindSidePayload` produces,
 *    built by calling that exact function, so an offline render and the served one cannot drift.
 *    No candidate id, no code version, no image path, no run file, no arm label, no palette hash.
 *  - **`variantId` in the fixture is an opaque per-batch token**, not the candidate id. The schema
 *    requires the field and the server never serves it, but a fixture that names the arm in plain
 *    text is one careless `cat` away from being read aloud in a review session.
 *  - **item ids are the cover's own content-addressed file stem**, never `<round-name>-NN-<hash>`.
 *    An item id is served twice — in the calibration payload and in every `/media/<batch>/<item>` URL
 *    the browser fetches — so a round called `p6-round-1` puts the prototype's number on the
 *    reviewer's screen before they have looked at a single palette. [RETIRED SCHEME] The
 *    `<round-name>-NN-<8 hex>` spelling shipped once, into the first staged round, and was caught at
 *    install time before any reviewer saw it; `blindingLeaks` and the test that calls it exist so it
 *    cannot come back. Covers whose file name is not a 40-hex stem fall back to a neutral token of the
 *    same shape derived from the run's content hash — never to anything naming the round.
 *  - **the batch id is a content-derived placeholder**, `cal-<8 hex over the sorted item ids>`, and
 *    the main-tier installer overwrites it with the real batch id at push time. It is here because the
 *    push schema requires the field, not because this tool gets to name a batch: batch ids are the
 *    installer's to assign, retired ones are never reused, and a batch id derived from the round name
 *    would land the prototype's name in `/media/<batch>/…` and in the side-car's served file name.
 *    `--batch-id` overrides it, and the override is checked for prototype tokens before it is used.
 *  - **`fingerprint` maps through unchanged**, including `fingerprint.algorithmVersion`, which for
 *    this prototype is byte-identical to the candidate id (`p6-figureground-0.1.0`). This is the one
 *    place a candidate id survives into the fixture, and it is deliberate: the push schema requires
 *    a real fingerprint, the fingerprint is what makes a verdict permanently scopable to the code
 *    that produced it, and `round-kit.ts`'s allowlist keeps it server-side. **Stated as a deviation**
 *    from a literal "no candidate id anywhere in the fixture" reading — the alternative is a
 *    fabricated algorithm version, which would put a lie in the warehouse to satisfy a grep.
 *
 * ## Determinism
 *
 * Same run file, same `--covers` ⇒ byte-identical output, and the round name no longer enters any of
 * it: item ids come from the covers, the batch id comes from the item ids, and `--name` only chooses
 * the directory and titles `ROUND.md`. No `Date.now`, no
 * `Math.random`, no timestamp anywhere in any of the three files. `gitCommit` and `dirty` are read
 * from the working tree, which is *state* and not time. Items are emitted sorted by run index
 * regardless of the order `--covers` listed them, so two humans who type the same set in a different
 * order stage the same round. Re-running over an existing round directory overwrites it in place,
 * which is what makes "regenerate and diff" a usable check.
 */

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { basename, isAbsolute, join, relative, resolve } from "node:path"
import { parseArgs } from "node:util"

import type { Palette } from "../../../src/contract/types.ts"
import { REPO_ROOT } from "../../../src/devloop/run.ts"
import type { RunHeader, RunRow } from "../../../src/devloop/types.ts"
import { blindSidePayload, parseCalibrationBatch } from "../../../src/review-server/batch.ts"
import { nameHexes } from "../../../src/review-server/color.ts"
import { canonicalPosition } from "../../../src/review-server/gradient.ts"
import { ROLES } from "../../../src/review-server/types.ts"
import { hashPalette, type CodeFingerprint, type PaletteSnapshot } from "../../../src/warehouse/records.ts"

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

/**
 * A reviewer round is 4 to 10 items.
 *
 * `[REVIEWED]` — the standing rule carried into this campaign (MEMORY: *"frequent 4–10-item human
 * reviews, never one big review"*). Enforced as a hard error rather than a warning on purpose: the
 * failure mode it prevents is a 40-item round staged at 11pm that nobody notices is a 40-item round
 * until the reviewer is four items in.
 */
export const MIN_ROUND_ITEMS = 4
export const MAX_ROUND_ITEMS = 10

/**
 * Round names are lowercase, hyphenated, and short. Stricter than the server's `ID_PATTERN` on
 * purpose — the name is a directory name, and mixed case in a directory name is a way to end up with
 * two rounds that are the same round on a case-insensitive filesystem. The round name is local: it
 * names a directory and titles `ROUND.md`, and it reaches no payload.
 */
const ROUND_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/u

/** The server's own id rule, mirrored. Every id this tool emits must satisfy it. */
const SERVER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/iu

/** How many hex characters of a sha-256 a batch or variant token carries. */
const TOKEN_HEX = 8

/**
 * The shape of a cover's content-addressed file stem, and therefore the shape of an item id.
 *
 * The corpus names covers by a 40-hex id (`00/ab67616d…0164.jpg`), which is content-derived, neutral,
 * stable across runs and joinable across rounds — every property an item id wants. Covers named any
 * other way get a token of this same shape derived from the run's content hash instead.
 */
const ITEM_ID_PATTERN = /^[0-9a-f]{40}$/iu

/**
 * Tokens that must never appear in anything the reviewer's browser can reach.
 *
 * `p6` and `figureground` name the prototype: a reviewer who reads either one knows which mechanism
 * they are grading, which is the whole thing blinding exists to prevent. `round` is here for a
 * narrower reason — it is the tell of the retired `<round-name>-NN-<hash>` item id scheme, whose round
 * names are spelled `p6-round-1`. Matched on word boundaries, so `background` (b-a-c-k-g-**round**)
 * is not a hit.
 */
export const BLINDING_TOKENS = ["p6", "figureground", "figure-ground", "round"] as const

/** A prototype number in a token position: `p6`, `p11`, `arm-p3-b`. Not `phase2`, not `sharp`. */
const PROTOTYPE_TOKEN_PATTERN = /\bp\d{1,2}\b/iu

/** The batch purpose this tool stages. A calibration round is absolute grading, one palette per item. */
const ROUND_PURPOSE = "calibration" as const

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export type StagedItem = Readonly<{
	itemId: string
	variantId: string
	/** Row index in the run — the sort key, and the join back to the run file. */
	index: number
	/** Repo-relative, forward slashes. */
	imagePath: string
	/** Absolute, for validation and for the push-time rewrite. */
	absoluteImagePath: string
	inputContentHash: string
	palette: PaletteSnapshot
	paletteHash: string
	fingerprint: CodeFingerprint
	/** The one sanctioned non-source colour, if the palette declared one. `null` otherwise. */
	escape: Readonly<{ role: string; color: string }> | null
	colorNames: Readonly<Record<string, string>>
}>

export type StageOptions = Readonly<{
	/** Path to the run `.jsonl`. Absolute, or relative to `repoRoot`. */
	runPath: string
	/** Item selectors — run indices, paths, basenames, or content-hash prefixes. */
	covers: readonly string[]
	/** Local only: names the directory and titles `ROUND.md`. Never reaches a payload. */
	roundName: string
	/**
	 * Overrides the `cal-<8 hex>` placeholder. Rarely wanted — the installer assigns the real batch id
	 * at push time either way — and refused if it carries a prototype token.
	 */
	batchId?: string
	/** One line, for `ROUND.md`. Empty means "the orchestrator fills it before submission". */
	purpose: string
	/**
	 * Retirement continuity, written into `private-mapping.json` and nowhere else. `supersedes` is the
	 * record id of the retired round this one replaces; `supersededItemIds` maps its old item ids onto
	 * the ids staged here, so a verdict logged against a retired id can still be found.
	 */
	supersedes?: string
	supersededItemIds?: Readonly<Record<string, string>>
	/** Where `<roundName>/` is created. Defaults to `prototypes/p6-figureground/review-rounds`. */
	outDir: string
	/** What repo-relative paths are relative to. Injectable so tests can stage inside a temp tree. */
	repoRoot: string
	/** Working-tree state, not time. Injectable for the same reason. */
	gitCommit: string
	dirty: boolean
}>

export type StagedRound = Readonly<{
	roundDir: string
	batchId: string
	items: readonly StagedItem[]
	files: Readonly<{ fixture: string; sidecar: string; privateMapping: string; roundMd: string }>
	/** What was checked at write time, and what was not, and why. Rendered into `ROUND.md`. */
	checks: readonly string[]
	skipped: readonly string[]
}>

class StagingError extends Error {}

function require_(condition: unknown, message: string): asserts condition {
	if (!condition) throw new StagingError(message)
}

// ---------------------------------------------------------------------------------------------
// Reading the run
// ---------------------------------------------------------------------------------------------

export type LoadedRun = Readonly<{ path: string; header: RunHeader; rows: readonly RunRow[] }>

/**
 * Read a run file into its header and its rows.
 *
 * Failed rows are kept, not dropped: `RunRow.ok` splits success from failure precisely so a reader
 * can see that eleven covers threw, and a selector that names one of them should say so rather than
 * report "no such cover".
 */
export function parseRunFile(text: string, path: string): LoadedRun {
	const lines = text.split("\n").filter((line) => line.trim().length > 0)
	require_(lines.length > 0, `${path} is empty`)
	let header: RunHeader | null = null
	const rows: RunRow[] = []
	for (const [lineIndex, line] of lines.entries()) {
		let value: { kind?: string }
		try {
			value = JSON.parse(line) as { kind?: string }
		} catch (error) {
			throw new StagingError(`${path}:${lineIndex + 1} is not JSON (${(error as Error).message})`)
		}
		if (value.kind === "devloop-run-header") header = value as unknown as RunHeader
		else if (value.kind === "devloop-run-row") rows.push(value as unknown as RunRow)
		else if (value.kind === "devloop-run-footer") continue
		else throw new StagingError(`${path}:${lineIndex + 1} has unknown kind ${JSON.stringify(value.kind)}`)
	}
	require_(header !== null, `${path} has no devloop-run-header row`)
	require_(rows.length > 0, `${path} has no devloop-run-row rows`)
	return { path, header, rows }
}

// ---------------------------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------------------------

/**
 * Resolve one `--covers` selector to one run row.
 *
 * Six spellings are accepted, tried in order, and the first one that matches *anything* is the one
 * that decides — including deciding to fail, when it matched more than one row. Falling through an
 * ambiguous match to a later, narrower spelling would make the meaning of a selector depend on the
 * contents of the run, which is the sort of thing that quietly stages a different round than the one
 * the human asked for.
 */
export function resolveCover(token: string, rows: readonly RunRow[], repoRoot: string): RunRow {
	const trimmed = token.trim()
	require_(trimmed.length > 0, "an empty cover selector selects nothing")
	const attempts: ReadonlyArray<readonly [string, (row: RunRow) => boolean]> = [
		["run index", (row) => /^\d+$/u.test(trimmed) && row.index === Number(trimmed)],
		["absolute path", (row) => isAbsolute(trimmed) && row.imagePath === trimmed],
		["repo-relative path", (row) => !isAbsolute(trimmed) && row.imagePath === resolve(repoRoot, trimmed)],
		["file name", (row) => basename(row.imagePath) === trimmed],
		["file stem", (row) => basename(row.imagePath).replace(/\.[^.]+$/u, "") === trimmed],
		[
			"content-hash prefix",
			(row) => /^[0-9a-f]{8,64}$/u.test(trimmed) && row.inputContentHash.startsWith(trimmed),
		],
	]
	for (const [what, matches] of attempts) {
		const hits = rows.filter(matches)
		if (hits.length === 1) return hits[0] as RunRow
		if (hits.length > 1) {
			throw new StagingError(
				`cover ${JSON.stringify(trimmed)} matches ${hits.length} rows by ${what} (indices ${hits.map((row) => row.index).join(", ")})`,
			)
		}
	}
	throw new StagingError(
		`cover ${JSON.stringify(trimmed)} matches no row (try a run index, a path, a file name, or a content-hash prefix)`,
	)
}

export function selectRows(covers: readonly string[], rows: readonly RunRow[], repoRoot: string): readonly RunRow[] {
	require_(covers.length > 0, "--covers selected nothing")
	const chosen: RunRow[] = []
	const seen = new Set<number>()
	for (const token of covers) {
		const row = resolveCover(token, rows, repoRoot)
		require_(!seen.has(row.index), `cover ${JSON.stringify(token)} selects run index ${row.index} twice`)
		seen.add(row.index)
		chosen.push(row)
	}
	require_(
		chosen.length >= MIN_ROUND_ITEMS && chosen.length <= MAX_ROUND_ITEMS,
		`a reviewer round is ${MIN_ROUND_ITEMS}..${MAX_ROUND_ITEMS} items; ${chosen.length} were selected`,
	)
	for (const row of chosen) {
		require_(row.ok && row.palette !== null, `run index ${row.index} (${row.imagePath}) failed: ${row.error ?? "no palette"}`)
	}
	// Stable ordering: the round is a set, not a sequence the caller typed.
	return [...chosen].sort((a, b) => a.index - b.index)
}

// ---------------------------------------------------------------------------------------------
// Contract palette → push palette
// ---------------------------------------------------------------------------------------------

/**
 * Map the contract's `Palette` onto the push schema's `PaletteSnapshot`.
 *
 * Key order is fixed by construction because the emitted JSON has to be byte-stable.
 *
 * **`gradient.geometry` is dropped, and this is the honest option.** The contract's geometry is an
 * object (`{ kind, start, end, center, angleDegrees }`); the push schema's is a string of at most 64
 * characters. There is no lossless map between them, `PHASE_0_DECISIONS.md` §2 makes geometry
 * opportunistic and requires consumers to behave identically with or without it, and squeezing
 * `kind` into the string field would publish "linear" while silently discarding the coordinates that
 * gave the word its meaning. Reported upward as an open item rather than papered over here.
 */
export function toPaletteSnapshot(palette: Palette): PaletteSnapshot {
	return {
		background: palette.roles.background.hex,
		surface: palette.roles.surface.hex,
		foreground: palette.roles.foreground.hex,
		accent: palette.roles.accent.hex,
		gradient:
			palette.gradient === null
				? null
				: {
						stops: palette.gradient.stops.map((stop) => ({
							color: stop.color.hex,
							// Canonicalised here as well as at push time, so the file on disk and the object the
							// server stores are the same numbers. See `GRADIENT_POSITION_DECIMALS`.
							position: canonicalPosition(stop.position),
						})),
					},
		surfaceCollapsed: palette.collapse.surfaceCollapsed,
		accentCollapsed: palette.collapse.accentCollapsed,
	}
}

function shortHash(...parts: readonly string[]): string {
	const digest = createHash("sha256")
	for (const part of parts) {
		digest.update(part)
		digest.update("\u0000")
	}
	return digest.digest("hex").slice(0, TOKEN_HEX)
}

export type ItemIdScheme = "filename-stem" | "content-hash-fallback"

/**
 * The handle the reviewer's browser answers with, and the last path segment of `/media/<batch>/<item>`.
 *
 * The cover's own 40-hex file stem, because that is content-derived (it names the artwork, not the
 * round), neutral (it names no prototype, arm, code version or position), and joinable — the same
 * cover staged into two rounds by two prototypes gets the same id, so a reviewer's verdicts can be
 * compared across arms without a mapping table. Covers named anything else get the same shape derived
 * from the run's content hash, so the scheme is total and the fallback is still content-derived.
 *
 * What it deliberately is NOT is `<round-name>-<ordinal>-<hash>`, which is what shipped first and what
 * broke blinding: it named the prototype in every media URL the browser fetched. The ordinal that
 * scheme carried is not missed — `private-mapping.json` holds the run index, and the reviewer has no
 * use for a position.
 */
export function deriveItemId(
	imagePath: string,
	inputContentHash: string,
): Readonly<{ id: string; scheme: ItemIdScheme }> {
	const stem = basename(imagePath).replace(/\.[^.]+$/u, "")
	if (ITEM_ID_PATTERN.test(stem)) return { id: stem.toLowerCase(), scheme: "filename-stem" }
	require_(
		/^[0-9a-f]{40,}$/iu.test(inputContentHash),
		`cover ${imagePath} has no 40-hex file stem and its content hash ${JSON.stringify(inputContentHash)} is not hex either, so no neutral item id can be derived`,
	)
	return { id: inputContentHash.slice(0, 40).toLowerCase(), scheme: "content-hash-fallback" }
}

/**
 * The placeholder batch id: `cal-<8 hex over the sorted item ids>`.
 *
 * Content-derived, so it is stable across re-emissions and says nothing about the round, the
 * prototype or the arm. **The installer overwrites it at push time** — batch ids are assigned
 * centrally, retired ids are never reused, and a prototype that picked its own would be naming a
 * server resource it does not own. Sorted, so the id does not depend on the order `--covers` listed.
 */
export function deriveBatchId(itemIds: readonly string[]): string {
	return `cal-${shortHash(...[...itemIds].sort())}`
}

/** One opaque variant name per batch. The true name lives in `private-mapping.json`. */
export function deriveVariantId(batchId: string, codeVersion: string): string {
	return `${batchId}-v-${shortHash(batchId, codeVersion)}`
}

/**
 * Every string a served payload carries that matches a blinding token or the round name.
 *
 * Returns findings rather than throwing so both callers can use it: `stageRound` turns a non-empty
 * result into a hard error, and the test asserts it is empty for every surface the browser can reach.
 * One implementation, because a guard the tests spell differently from the tool is a guard with a gap
 * exactly the width of the difference.
 */
export function blindingLeaks(
	entries: ReadonlyArray<readonly [string, string]>,
	roundName: string,
): readonly string[] {
	const found: string[] = []
	const needles: ReadonlyArray<readonly [string, RegExp]> = [
		[roundName, new RegExp(escapeRegExp(roundName), "iu")],
		...BLINDING_TOKENS.map((token) => [token, new RegExp(`\\b${escapeRegExp(token)}\\b`, "iu")] as const),
	]
	for (const [where, text] of entries) {
		for (const [token, pattern] of needles) {
			if (pattern.test(text)) found.push(`${where} carries ${JSON.stringify(token)} (in ${JSON.stringify(text)})`)
		}
	}
	return found
}

function escapeRegExp(source: string): string {
	// `-` is deliberately not escaped: outside a character class `\-` is a SyntaxError under the `u`
	// flag, and a bare `-` is already literal there. Round names and tokens are full of hyphens.
	return source.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
}

/**
 * Every `[path, string]` pair in a JSON-shaped value — object keys as well as string values, since a
 * key is served just as literally as what it holds. `exempt` is matched against the dotted path.
 */
export function servedStrings(
	value: unknown,
	exempt: (path: string) => boolean = () => false,
	path = "$",
	out: Array<readonly [string, string]> = [],
): ReadonlyArray<readonly [string, string]> {
	if (exempt(path)) return out
	if (typeof value === "string") out.push([path, value])
	else if (Array.isArray(value)) for (const [index, entry] of value.entries()) servedStrings(entry, exempt, `${path}[${index}]`, out)
	else if (typeof value === "object" && value !== null) {
		for (const [key, entry] of Object.entries(value)) {
			if (exempt(`${path}.${key}`)) continue
			out.push([`${path} key`, key])
			servedStrings(entry, exempt, `${path}.${key}`, out)
		}
	}
	return out
}

// ---------------------------------------------------------------------------------------------
// The hand schema — a mirror of what the server validates
// ---------------------------------------------------------------------------------------------

/**
 * Validate a staged fixture against the calibration push schema, field for field.
 *
 * This mirrors `src/review-server/batch.ts:parseCalibrationBatch` deliberately rather than only
 * calling it, so that a staged fixture is checked here even when the server module changes shape
 * underneath — and so that the fields the server requires are written down somewhere the P6
 * orchestrator can read without reading the server. `stageRound` runs BOTH: this mirror, and the
 * server's own parser on an absolutised clone. Two checks that must agree; a disagreement between
 * them is a drift report, not a nuisance.
 *
 * **The one intentional difference: `imagePath`.** The server requires an absolute path. A staged
 * fixture stores repo-relative paths and declares `imagePathsRelativeTo: "repo-root"`, exactly as
 * `src/review-server/fixtures/demo-calibration.json` does, so the directory is portable across
 * checkouts and worktrees; the pusher rewrites them to absolute paths before the POST.
 */
export function validateStagedFixture(value: unknown, repoRoot: string): void {
	const HEX = /^#[0-9a-f]{6}$/u
	const ID = /^[a-z0-9][a-z0-9._-]{0,127}$/iu
	const PURPOSES = ["mechanism", "arm", "calibration", "outlier-mine", "oracle-validation", "bake-off"]
	const record = value as Record<string, unknown>
	require_(typeof record === "object" && record !== null && !Array.isArray(record), "fixture must be an object")
	require_(typeof record.batchId === "string" && ID.test(record.batchId), "fixture.batchId must be a filesystem-safe token")
	require_(
		typeof record.purpose === "string" && PURPOSES.includes(record.purpose),
		`fixture.purpose must be one of ${PURPOSES.join(" | ")}`,
	)
	require_(Array.isArray(record.fundedBy), "fixture.fundedBy must be an array of strings")
	for (const [index, entry] of (record.fundedBy as unknown[]).entries()) {
		require_(typeof entry === "string" && entry.length <= 512, `fixture.fundedBy[${index}] must be a string ≤512 chars`)
	}
	require_(record.imagePathsRelativeTo === "repo-root", 'fixture.imagePathsRelativeTo must be "repo-root"')
	const items = record.items
	require_(Array.isArray(items) && items.length >= 1, "fixture.items must hold at least one item")
	require_(
		items.length >= MIN_ROUND_ITEMS && items.length <= MAX_ROUND_ITEMS,
		`fixture.items must hold ${MIN_ROUND_ITEMS}..${MAX_ROUND_ITEMS} items`,
	)
	const seen = new Set<string>()
	for (const [index, entry] of (items as Record<string, unknown>[]).entries()) {
		const at = `fixture.items[${index}]`
		require_(typeof entry === "object" && entry !== null && !Array.isArray(entry), `${at} must be an object`)
		require_(typeof entry.itemId === "string" && ID.test(entry.itemId), `${at}.itemId must be a filesystem-safe token`)
		require_(!seen.has(entry.itemId as string), `fixture has two items called ${entry.itemId}`)
		seen.add(entry.itemId as string)
		require_(
			typeof entry.imagePath === "string" && entry.imagePath.length <= 4096 && !isAbsolute(entry.imagePath),
			`${at}.imagePath must be a repo-relative path of at most 4096 characters`,
		)
		require_(
			entry.artworkId === null || typeof entry.artworkId === "string",
			`${at}.artworkId must be a string or null`,
		)
		require_(
			typeof entry.variantId === "string" && entry.variantId.length > 0 && entry.variantId.length <= 128,
			`${at}.variantId must be a string of at most 128 characters`,
		)
		const fingerprint = entry.fingerprint as Record<string, unknown>
		require_(typeof fingerprint === "object" && fingerprint !== null, `${at}.fingerprint must be an object`)
		for (const field of ["algorithmVersion", "preprocessingVersion", "gitCommit"] as const) {
			require_(
				typeof fingerprint[field] === "string" && (fingerprint[field] as string).length <= 128,
				`${at}.fingerprint.${field} must be a string of at most 128 characters`,
			)
		}
		require_(typeof fingerprint.dirty === "boolean", `${at}.fingerprint.dirty must be a boolean`)
		const palette = entry.palette as Record<string, unknown>
		require_(typeof palette === "object" && palette !== null, `${at}.palette must be an object`)
		for (const role of ROLES) {
			require_(typeof palette[role] === "string" && HEX.test(palette[role] as string), `${at}.palette.${role} must be #rrggbb`)
		}
		require_(typeof palette.surfaceCollapsed === "boolean", `${at}.palette.surfaceCollapsed must be a boolean`)
		require_(typeof palette.accentCollapsed === "boolean", `${at}.palette.accentCollapsed must be a boolean`)
		const gradient = palette.gradient as { stops?: unknown } | null
		if (gradient !== null) {
			require_(typeof gradient === "object" && Array.isArray(gradient.stops), `${at}.palette.gradient.stops must be an array`)
			const stops = gradient.stops as Record<string, unknown>[]
			require_(stops.length >= 2 && stops.length <= 4, `${at}.palette.gradient.stops must hold 2..4 stops`)
			let previous = -Infinity
			for (const [stopIndex, stop] of stops.entries()) {
				const where = `${at}.palette.gradient.stops[${stopIndex}]`
				require_(typeof stop.color === "string" && HEX.test(stop.color), `${where}.color must be #rrggbb`)
				const position = stop.position
				require_(
					typeof position === "number" && Number.isFinite(position) && position >= 0 && position <= 1,
					`${where}.position must be a number in [0,1]`,
				)
				require_(position > previous, `${where}.position must be strictly increasing`)
				previous = position as number
			}
		}
		void repoRoot
	}
}

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

/** Two spaces, matching `src/review-server/fixtures/*.json`. Trailing newline, like every file here. */
function fixtureJson(value: unknown): string {
	return `${JSON.stringify(value, null, 2)}\n`
}

/** Tabs, matching `review-ui/*.data.json`. */
function sidecarJson(value: unknown): string {
	return `${JSON.stringify(value, null, "\t")}\n`
}

export function buildFixture(items: readonly StagedItem[], batchId: string) {
	return {
		// Every string here is served-adjacent and is checked by `blindingLeaks`: this comment used to
		// name the prototype in its first line, which is one `cat` away from being read aloud in a
		// review session.
		_comment: [
			"Staged calibration batch. Absolute grading, one palette per item, no comparison",
			"(REVIEW_UI.md §5).",
			"batchId is a content-derived placeholder; the installer assigns the real batch id at push",
			"time and overwrites this one.",
			"itemId is the cover's content-addressed file stem, so the same artwork carries the same id",
			"in every batch it appears in.",
			"imagePath entries are repo-root-relative so this directory is portable across worktrees;",
			"the pusher rewrites them to absolute paths before POST /api/calibration, which requires",
			"absolute paths.",
			"variantId is an opaque per-batch token. The true candidate identity is held by the staging",
			"tool and is deliberately not named here — this file is the payload, not the join.",
			"fundedBy is empty until the orchestrator fills in the record ids that motivated the batch.",
		],
		imagePathsRelativeTo: "repo-root",
		batchId,
		purpose: ROUND_PURPOSE,
		fundedBy: [] as string[],
		items: items.map((item) => ({
			itemId: item.itemId,
			imagePath: item.imagePath,
			artworkId: null,
			variantId: item.variantId,
			fingerprint: {
				algorithmVersion: item.fingerprint.algorithmVersion,
				preprocessingVersion: item.fingerprint.preprocessingVersion,
				gitCommit: item.fingerprint.gitCommit,
				dirty: item.fingerprint.dirty,
			},
			palette: item.palette,
		})),
	}
}

/**
 * The side-car: render data and nothing else.
 *
 * `side` is produced by the server's own `blindSidePayload`, not by a second renderer here — the
 * side-car has to draw what the server serves, and two spellings of "how a palette is rendered" is
 * two things that drift. `questionKey` is the item id, which is the handle the calibration page
 * already answers with (`calibrationPayload` serves `itemId`), so the join is the one that exists.
 */
export function buildSidecar(items: readonly StagedItem[], batchId: string) {
	return {
		batchId,
		items: items.map((item) => ({
			questionKey: item.itemId,
			side: blindSidePayload(item.palette, item.colorNames as Record<string, string>),
		})),
	}
}

/** The de-blinding join. SPEC directive 10. Never pushed, never served, never linked. */
export function buildPrivateMapping(
	items: readonly StagedItem[],
	run: LoadedRun,
	repoRoot: string,
	gitCommit: string,
	dirty: boolean,
	provenance: Readonly<{ supersedes?: string; supersededItemIds?: Readonly<Record<string, string>> }> = {},
) {
	const supersededItemIds = provenance.supersededItemIds ?? {}
	return {
		_comment: [
			"PRIVATE. The de-blinding join for the post-release analyst (P6 SPEC directive 10): item",
			"token <-> cover <-> candidate identity <-> run file. Read it only after the batch has been",
			"released, alongside data/review-server/batches.jsonl. It is never part of any payload and",
			"nothing in fixture.json or sidecar.data.json points at it.",
			"The join key is itemId, NOT a batch id: batch ids are assigned by the installer at push time",
			"and a retired batch is never re-pushed under its old id, so a mapping keyed on one would stop",
			"joining the moment the round was re-staged. Item ids are content-addressed and survive that.",
		],
		roundKind: ROUND_PURPOSE,
		run: {
			file: toRepoRelative(run.path, repoRoot),
			runId: run.header.runId,
			candidateId: run.header.candidateId,
			codeVersion: run.header.codeVersion,
			candidatePath: toRepoRelative(run.header.candidatePath, repoRoot),
			setName: run.header.setName,
			setHash: run.header.setHash,
			nodeVersion: run.header.nodeVersion,
			packageVersions: run.header.packageVersions,
		},
		stagedFrom: { gitCommit, dirty },
		// Continuity for a re-staged round: which record retired the previous staging, and which old
		// item id each current id replaces. Present only when this staging supersedes another, so an
		// ordinary round's mapping is unchanged by the existence of this field.
		...(provenance.supersedes === undefined && Object.keys(supersededItemIds).length === 0
			? {}
			: {
					provenance: {
						supersedesRecord: provenance.supersedes ?? null,
						supersededItemIds: Object.fromEntries(Object.entries(supersededItemIds).sort(([a], [b]) => (a < b ? -1 : 1))),
					},
				}),
		items: items.map((item) => ({
			itemId: item.itemId,
			variantId: item.variantId,
			runIndex: item.index,
			imagePath: item.imagePath,
			inputContentHash: item.inputContentHash,
			candidateId: run.header.candidateId,
			codeVersion: run.header.codeVersion,
			algorithmVersion: item.fingerprint.algorithmVersion,
			preprocessingVersion: item.fingerprint.preprocessingVersion,
			paletteHash: item.paletteHash,
			// Carried here because `PaletteSnapshot` has no field for it: an escape declaration is truth
			// about how the palette was produced, and dropping it on the way into the fixture would lose
			// it entirely. See `NonSourceColorEscape`.
			escape: item.escape ?? null,
		})),
	}
}

export function renderRoundMd(
	round: Readonly<{ roundName: string; batchId: string; purpose: string; items: readonly StagedItem[] }>,
	checks: readonly string[],
	skipped: readonly string[],
): string {
	const purpose = round.purpose.trim().length > 0 ? round.purpose.trim() : "TODO — ORCHESTRATOR: one line, before submission."
	const lines: string[] = [
		`# ${round.roundName}`,
		"",
		`- **Round kind:** calibration (absolute grading, one palette per item, no comparison — REVIEW_UI.md §5)`,
		`- **Batch id (placeholder):** \`${round.batchId}\` — content-derived; the installer assigns the real batch id at push.`,
		`- **Items:** ${round.items.length}`,
		`- **Purpose:** ${purpose}`,
		"",
		"## The question this round answers",
		"",
		"TODO — ORCHESTRATOR: state the question in one sentence, in the reviewer's vocabulary, before",
		"submission. A calibration round asks *how good is this palette, on its own terms* — name the",
		"specific thing about P6's figure/ground reading that these covers were chosen to expose.",
		"",
		"## What we do under each outcome",
		"",
		"Filled in BEFORE the round is submitted, not after it comes back. A round whose consequences",
		"are written after the verdicts is a round that can be read to mean whatever is convenient.",
		"",
		"- **Mostly strong:** TODO — ORCHESTRATOR.",
		"- **Mixed:** TODO — ORCHESTRATOR. Name the split that would count as mixed, and what it changes.",
		"- **Mostly weak:** TODO — ORCHESTRATOR. Name the mechanism that gets reopened, not the constant",
		"  that gets nudged.",
		"- **Confounded / unanswerable:** TODO — ORCHESTRATOR. What gets restaged, and how differently.",
		"",
		"## Items",
		"",
		"| # | item id | cover |",
		"|---|---|---|",
	]
	for (const [ordinal, item] of round.items.entries()) {
		lines.push(`| ${ordinal + 1} | \`${item.itemId}\` | \`${item.imagePath}\` |`)
	}
	lines.push(
		"",
		"Candidate identity, code version and the run this came from are deliberately **not** here —",
		"they live in `private-mapping.json`, which the post-release analyst reads and nobody else does.",
		"",
		"## Staging checks",
		"",
	)
	for (const check of checks) lines.push(`- ${check}`)
	if (skipped.length > 0) {
		lines.push("", "### Not checked, and why", "")
		for (const reason of skipped) lines.push(`- ${reason}`)
	}
	lines.push(
		"",
		"## Before submission",
		"",
		"1. Fill in `fundedBy` in `fixture.json` with the record ids of the evidence that motivated it.",
		"2. Fill in every TODO above.",
		"3. Hand the directory to the main orchestrator. **This prototype does not push.**",
		"",
	)
	return lines.join("\n")
}

// ---------------------------------------------------------------------------------------------
// Staging
// ---------------------------------------------------------------------------------------------

function toRepoRelative(absolutePath: string, repoRoot: string): string {
	const rel = relative(repoRoot, absolutePath)
	if (rel.length === 0 || rel.startsWith("..") || isAbsolute(rel)) return absolutePath
	return rel.split("\\").join("/")
}

async function sha256OfFile(path: string): Promise<string> {
	return createHash("sha256").update(await readFile(path)).digest("hex")
}

export async function stageRound(options: StageOptions): Promise<StagedRound> {
	require_(
		ROUND_NAME_PATTERN.test(options.roundName),
		`--name must be lowercase letters, digits and hyphens (≤64 chars); got ${JSON.stringify(options.roundName)}`,
	)
	const runPath = isAbsolute(options.runPath) ? options.runPath : resolve(options.repoRoot, options.runPath)
	const run = parseRunFile(await readFile(runPath, "utf8"), runPath)
	const rows = selectRows(options.covers, run.rows, options.repoRoot)

	const checks: string[] = []
	const skipped: string[] = []

	// Ids first, because each one is derived from the last: the item ids come from the covers, the
	// batch id from the sorted item ids, the variant id from the batch id. Nothing derives from the
	// round name, which is what stopped the prototype's identity reaching the browser.
	const derived = rows.map((row) => deriveItemId(row.imagePath, row.inputContentHash))
	const itemIds = derived.map((entry) => entry.id)
	const byId = new Map<string, number>()
	for (const [ordinal, id] of itemIds.entries()) {
		require_(SERVER_ID_PATTERN.test(id), `item id ${JSON.stringify(id)} is not a filesystem-safe server token`)
		const first = byId.get(id)
		require_(
			first === undefined,
			`run indices ${(rows[first ?? 0] as RunRow).index} and ${(rows[ordinal] as RunRow).index} both derive item id ${id} — two covers cannot share an item id`,
		)
		byId.set(id, ordinal)
	}
	const schemes = new Set(derived.map((entry) => entry.scheme))
	checks.push(
		`item ids are content-derived and name nothing about this prototype (${[...schemes].sort().join(" + ")}${schemes.has("content-hash-fallback") ? "; covers without a 40-hex file stem fell back to the run's content hash" : ""}).`,
	)

	const batchId = options.batchId ?? deriveBatchId(itemIds)
	require_(SERVER_ID_PATTERN.test(batchId), `--batch-id must be a filesystem-safe token; got ${JSON.stringify(batchId)}`)
	require_(
		!PROTOTYPE_TOKEN_PATTERN.test(batchId) && blindingLeaks([["--batch-id", batchId]], options.roundName).length === 0,
		`--batch-id ${JSON.stringify(batchId)} names the prototype or the round; the batch id is served in every /media/<batch>/<item> URL and in the side-car's file name. Pass a neutral one, or pass none and take the cal-<hex> placeholder the installer overwrites at push time.`,
	)
	checks.push(
		options.batchId === undefined
			? `\`batchId\` is the placeholder \`${batchId}\`, derived from the item ids — the installer assigns the real batch id at push.`
			: `\`batchId\` was supplied explicitly as \`${batchId}\` and carries no prototype token; the installer still assigns the real batch id at push.`,
	)
	const variantId = deriveVariantId(batchId, run.header.codeVersion)

	const items: StagedItem[] = []
	for (const [ordinal, row] of rows.entries()) {
		const palette = row.palette as Palette
		const snapshot = toPaletteSnapshot(palette)
		const hexes = [
			...ROLES.map((role) => snapshot[role]),
			...(snapshot.gradient?.stops.map((stop) => stop.color) ?? []),
		]
		items.push({
			itemId: itemIds[ordinal] as string,
			variantId,
			index: row.index,
			imagePath: toRepoRelative(row.imagePath, options.repoRoot),
			absoluteImagePath: row.imagePath,
			inputContentHash: row.inputContentHash,
			palette: snapshot,
			paletteHash: hashPalette(snapshot),
			fingerprint: {
				algorithmVersion: palette.metadata.algorithmVersion,
				preprocessingVersion: palette.metadata.preprocessingVersion,
				gitCommit: options.gitCommit,
				dirty: options.dirty,
			},
			escape: palette.escape ?? null,
			colorNames: nameHexes(hexes),
		})
	}

	// --- validate on write -------------------------------------------------------------------

	for (const item of items) {
		const info = await stat(item.absoluteImagePath).catch(() => null)
		require_(info !== null && info.isFile(), `item ${item.itemId}: ${item.absoluteImagePath} does not exist`)
		require_(
			!isAbsolute(item.imagePath),
			`item ${item.itemId}: ${item.absoluteImagePath} is outside the repo root ${options.repoRoot}, so it has no repo-relative form`,
		)
	}
	checks.push(`every cover exists on disk and has a repo-relative path (${items.length} covers).`)

	// The strongest palette↔artwork check staging can make without re-decoding: the bytes on disk
	// still hash to what the run said they hashed to, AND the palette's own metadata agrees with the
	// row it came in. A cover that was replaced since the run, or a row whose palette belongs to a
	// different image, both die here.
	for (const [ordinal, item] of items.entries()) {
		const row = rows[ordinal] as RunRow
		const palette = row.palette as Palette
		require_(
			palette.metadata.inputContentHash === row.inputContentHash,
			`item ${item.itemId}: palette metadata hash ${palette.metadata.inputContentHash} ≠ row hash ${row.inputContentHash}`,
		)
		require_(
			palette.metadata.sourceRendition.path === row.imagePath,
			`item ${item.itemId}: palette was produced from ${palette.metadata.sourceRendition.path}, not ${row.imagePath}`,
		)
		const onDisk = await sha256OfFile(item.absoluteImagePath)
		require_(
			onDisk === item.inputContentHash,
			`item ${item.itemId}: ${item.imagePath} now hashes to ${onDisk}, the run saw ${item.inputContentHash} — the cover changed since the run`,
		)
	}
	checks.push("every palette's metadata hash and source path match its run row, and every cover's bytes still hash to what the run saw.")

	// The exact-pixel check (invariant 2) is NOT performed here, and this is the stated reason.
	skipped.push(
		"**Published colours were not re-checked against the artwork's pixels.** The run row carries a " +
			"palette and a content hash, not a colour inventory, so the check would mean re-decoding every " +
			"cover at staging time — with whichever `sharp` this process resolves, which is not necessarily " +
			"the one the run used (`CONVENTIONS.md`: this repo carries two, and they decode some AVIFs " +
			"differently). A staging-time decode could therefore manufacture a failure the palette does not " +
			"have. Invariant 2 belongs to `src/contract/invariants.ts`, run against the same decode that " +
			"produced the palette.",
	)
	skipped.push(
		"**`gradient.geometry` is dropped.** The contract publishes an object; the push schema takes a " +
			"string of ≤64 characters. There is no lossless map, and geometry is opportunistic by design " +
			"(`PHASE_0_DECISIONS.md` §2).",
	)

	const fixture = buildFixture(items, batchId)
	validateStagedFixture(fixture, options.repoRoot)
	checks.push("`fixture.json` passes this tool's own mirror of the calibration push schema.")

	// And the server's own parser, on an absolutised clone. Two independent checks that must agree.
	parseCalibrationBatch({
		...fixture,
		items: fixture.items.map((item, index) => ({
			...item,
			imagePath: (items[index] as StagedItem).absoluteImagePath,
		})),
	})
	checks.push("`fixture.json` passes `src/review-server/batch.ts:parseCalibrationBatch` verbatim (paths absolutised, as the pusher will).")

	const sidecar = buildSidecar(items, batchId)
	const privateMapping = buildPrivateMapping(items, run, options.repoRoot, options.gitCommit, options.dirty, {
		supersedes: options.supersedes,
		supersededItemIds: options.supersededItemIds,
	})

	// The blinding guard, enforced here and not only in the tests: a side-car that names the candidate
	// is a leak that ships, and it ships silently because the page still renders.
	const forbidden = [run.header.candidateId, run.header.codeVersion, run.header.runId, run.header.candidatePath]
	const sidecarText = sidecarJson(sidecar)
	for (const needle of forbidden) {
		require_(!sidecarText.includes(needle), `side-car leaks ${JSON.stringify(needle)} — render data only (REVIEW_UI.md §5)`)
	}
	for (const item of items) {
		require_(!sidecarText.includes(item.imagePath), `side-car leaks the cover path for ${item.itemId}`)
	}
	// Neither payload may name the de-blinding join, not even in a comment: a fixture that says where
	// the mapping lives is a fixture that hands anyone holding it the way to unblind the round.
	const fixtureText = fixtureJson(fixture)
	for (const body of [fixtureText, sidecarText]) {
		require_(!body.includes("private-mapping"), "no payload may reference the de-blinding join (SPEC directive 10)")
	}
	for (const needle of [run.header.codeVersion, run.header.runId, run.header.candidatePath]) {
		require_(!fixtureText.includes(needle), `fixture leaks ${JSON.stringify(needle)}`)
	}
	checks.push("`sidecar.data.json` carries render data only — no candidate id, code version, run id, or cover path.")
	checks.push(
		"neither payload names the de-blinding join, and the fixture carries the candidate id only as `fingerprint.algorithmVersion` (schema-required, never served).",
	)

	// The mechanism-blinding guard. Every string in either payload — object keys included, since a key
	// is served as literally as what it holds — plus the media URLs the browser will actually fetch,
	// checked against the round name and `BLINDING_TOKENS`. The single exemption is
	// `fingerprint.algorithmVersion`, which the push schema requires and `round-kit.ts` keeps
	// server-side; it is the documented deviation above, and it is exempted by PATH, not by value, so
	// the same string appearing anywhere else is still a leak.
	const leaks = [
		...blindingLeaks(servedStrings(fixture, (path) => /^\$\.items\[\d+\]\.fingerprint\.algorithmVersion$/u.test(path)).map(
			([where, text]) => [`fixture ${where}`, text] as const,
		), options.roundName),
		...blindingLeaks(servedStrings(sidecar).map(([where, text]) => [`side-car ${where}`, text] as const), options.roundName),
		...blindingLeaks(
			items.map((item) => [
				`media url for ${item.itemId}`,
				`/media/${encodeURIComponent(batchId)}/${encodeURIComponent(item.itemId)}`,
			] as const),
			options.roundName,
		),
	]
	require_(
		leaks.length === 0,
		`the payload would tell the reviewer which prototype they are grading:\n  ${leaks.join("\n  ")}`,
	)
	checks.push(
		`no served string — item id, batch id, media URL, side-car key or fixture field — carries the round name or any of ${BLINDING_TOKENS.map((token) => `\`${token}\``).join(", ")}, except \`fingerprint.algorithmVersion\`, which the server never serves.`,
	)

	const roundDir = resolve(options.outDir, options.roundName)
	await mkdir(roundDir, { recursive: true })
	const files = {
		fixture: join(roundDir, "fixture.json"),
		sidecar: join(roundDir, "sidecar.data.json"),
		privateMapping: join(roundDir, "private-mapping.json"),
		roundMd: join(roundDir, "ROUND.md"),
	}
	await writeFile(files.fixture, fixtureText, "utf8")
	await writeFile(files.sidecar, sidecarText, "utf8")
	await writeFile(files.privateMapping, sidecarJson(privateMapping), "utf8")
	await writeFile(
		files.roundMd,
		renderRoundMd({ roundName: options.roundName, batchId, purpose: options.purpose, items }, checks, skipped),
		"utf8",
	)

	return { roundDir, batchId, items, files, checks, skipped }
}

// ---------------------------------------------------------------------------------------------
// Working-tree state (state, not time)
// ---------------------------------------------------------------------------------------------

export function readGitState(repoRoot: string): Readonly<{ gitCommit: string; dirty: boolean }> {
	const git = (...args: string[]) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" })
	return { gitCommit: git("rev-parse", "HEAD").trim(), dirty: git("status", "--porcelain").trim().length > 0 }
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

const DEFAULT_OUT_DIR = resolve(import.meta.dirname, "..", "review-rounds")

async function main(argv: readonly string[]): Promise<void> {
	const { values } = parseArgs({
		args: [...argv],
		options: {
			run: { type: "string" },
			covers: { type: "string" },
			name: { type: "string" },
			purpose: { type: "string" },
			out: { type: "string" },
			"batch-id": { type: "string" },
			supersedes: { type: "string" },
			"superseded-item-ids": { type: "string" },
		},
		strict: true,
	})
	if (values.run === undefined || values.covers === undefined || values.name === undefined) {
		process.stderr.write(
			"usage: stage-round.ts --run <run.jsonl> --covers <ids or indices> --name <round-name>\n" +
				"                     [--purpose \"<one line>\"] [--out <dir>] [--batch-id <neutral token>]\n" +
				"                     [--supersedes <record id>] [--superseded-item-ids <old>=<new>,...]\n" +
				"\n" +
				"  --name is local: it names the output directory and titles ROUND.md. It reaches no payload.\n" +
				"  --batch-id is rarely wanted; without it the fixture carries a cal-<hex> placeholder and the\n" +
				"    installer assigns the real batch id at push time.\n" +
				"  --supersedes / --superseded-item-ids write retirement continuity into private-mapping.json\n" +
				"    when a round is re-staged, and appear nowhere else.\n",
		)
		process.exitCode = 2
		return
	}
	// `old=new,old=new`. Parsed here rather than taken as JSON so the whole invocation stays a shell
	// line somebody can paste back to reproduce the emission byte for byte.
	const supersededItemIds: Record<string, string> = {}
	for (const pair of (values["superseded-item-ids"] ?? "").split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0)) {
		const [old, next, ...rest] = pair.split("=")
		if (old === undefined || next === undefined || rest.length > 0 || old.length === 0 || next.length === 0) {
			process.stderr.write(`stage-round: --superseded-item-ids expects <old>=<new> pairs; got ${JSON.stringify(pair)}\n`)
			process.exitCode = 2
			return
		}
		supersededItemIds[old] = next
	}
	const gitState = readGitState(REPO_ROOT)
	const round = await stageRound({
		// A path the human typed in a shell is relative to the shell, not to the repo root.
		runPath: resolve(process.cwd(), values.run),
		covers: values.covers.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0),
		roundName: values.name,
		batchId: values["batch-id"],
		purpose: values.purpose ?? "",
		supersedes: values.supersedes,
		supersededItemIds,
		outDir: values.out === undefined ? DEFAULT_OUT_DIR : resolve(values.out),
		repoRoot: REPO_ROOT,
		gitCommit: gitState.gitCommit,
		dirty: gitState.dirty,
	})
	const report = [
		`staged ${round.items.length} items into ${round.roundDir}`,
		`batch id (placeholder, installer overwrites at push): ${round.batchId}`,
		...round.items.map((item) => `  ${item.itemId}  ${item.imagePath}`),
		"",
		"checks:",
		...round.checks.map((check) => `  - ${check}`),
		"",
		"not checked:",
		...round.skipped.map((reason) => `  - ${reason.replace(/\*\*/gu, "")}`),
		"",
		"NEXT: fill in fundedBy and every TODO in ROUND.md, then hand the directory to the main",
		"orchestrator. This tool does not push.",
		"",
	].join("\n")
	process.stdout.write(report)
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
	main(process.argv.slice(2)).catch((error: unknown) => {
		process.stderr.write(`stage-round: ${(error as Error).message}\n`)
		process.exitCode = 1
	})
}
