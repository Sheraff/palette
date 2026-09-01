/**
 * The SAM mask-quality round — `sam-mask-quality-1`, the reviewer's visual eval that calibrates
 * `oracle/sam/config.py` `SCORE_THRESHOLD` (PHASE_0_LOOSE_ENDS.md A6) and puts a human in front of
 * the replaced concept set for the first time (A5).
 *
 * **A new, self-contained file in another workstream's directory.** It lives here and not under
 * `oracle/sam/` for one reason: it builds an `OracleValidationFixture`, and a fixture builder that
 * drifts from the type it builds is the failure the review server exists to prevent. Nothing in
 * `oracle-validation.ts`, `server.ts` or the page is modified — this file only imports.
 *
 * What is judged is **an overlay, not an artwork**: the served image is a two-panel PNG, the
 * untouched artwork beside the same artwork with exactly one SAM mask highlighted. The question is
 * "is this mask actually the thing it claims to be?", asked once per concept in contiguous passes.
 *
 * The scores are the answer key and never reach this file's output. They live in the sample
 * manifest (`research/v3/data/sam/mask-quality-sample.json`), which the analysis re-joins by mask
 * row id after release — the same discipline the premise-disambiguation round used with the
 * oracle's own answers.
 *
 * Regenerate the committed fixture (overlays must exist first — see `oracle/sam/review_round.py`):
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/src/review-server/sam-mask-quality.ts --write
 */
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { mulberry32 } from "../contract/calibration/same-color-bar-translation.ts"
import {
	PREMISE_DISAMBIGUATION_FIXTURE_VERSION,
	serializeFixture,
	validateFixture,
	type OracleAnswerOption,
	type OracleQuestion,
	type OracleValidationFixture,
	type OracleValidationItem,
} from "./oracle-validation.ts"

/* ------------------------------------------------------------------------------------------- */
/* Identity                                                                                      */
/* ------------------------------------------------------------------------------------------- */

export const SAM_MASK_QUALITY_BATCH_ID = "sam-mask-quality-1"

/**
 * The label schema these answers are comparable under.
 *
 * Unlike the premise rounds this is **not** a VLM question-set version, because there is no model
 * arm to be row-comparable with: SAM emits a mask and a score, not an answer to this question. The
 * schema names the human instrument itself, and the analysis joins on it.
 * [REVIEWED] — named by the round's brief.
 */
export const SAM_MASK_QUALITY_LABEL_SCHEMA_VERSION = "sam-mask-quality.v1"

/**
 * Seed for the serve-order shuffle. Fixed so the committed fixture is reproducible.
 * [UNCALIBRATED] — the build date, matching the other v3 fixtures; any fixed value works.
 */
export const SAM_MASK_QUALITY_SEED = 20260803

export const SAM_MASK_QUALITY_SAMPLE_PATH = fileURLToPath(
	new URL("../../data/sam/mask-quality-sample.json", import.meta.url),
)
export const SAM_MASK_QUALITY_FIXTURE_PATH = fileURLToPath(
	new URL("../../data/sam/sam-mask-quality-1.json", import.meta.url),
)

/** research/v3/src/review-server/ → repository root. Fixture paths are stored relative to it. */
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url))

/**
 * What the served file is. Not a corpus name: the bytes are a rendered panel, not an artwork, and
 * calling it `sharded-corpus` would make the identity record claim a rendition that does not exist.
 */
export const OVERLAY_COLLECTION = "sam-review-overlay"

/* ------------------------------------------------------------------------------------------- */
/* The question                                                                                  */
/* ------------------------------------------------------------------------------------------- */

/**
 * The three answers, with the one-keystroke property §6 asks for.
 *
 * `kind` is **`enum`, not `boolean`**: `BOOLEAN_HOTKEYS` is fixed at `y`/`n` and there are three
 * answers. `u` is deliberately left unbound, so undo stays on `u` (the page moves undo to Backspace
 * only when a question binds `u` as an answer).
 *
 * `partly` is a real answer and not a hedge. A mask that finds the right thing and gets its extent
 * wrong is a different defect from a mask that found the wrong thing, and a threshold calibrated
 * with the two collapsed together cannot tell which one it is trading away.
 * [REVIEWED] — the round's brief: yes / no / partly, keys y/n/p.
 */
export const MASK_QUALITY_ANSWERS: readonly OracleAnswerOption[] = [
	{
		key: "yes",
		label: "yes",
		gloss: "the highlighted region is that thing, and it covers about the right pixels",
		hotkey: "y",
	},
	{
		key: "no",
		label: "no",
		gloss: "the highlighted region is not that thing at all, or it covers something unrelated",
		hotkey: "n",
	},
	{
		key: "partly",
		label: "partly",
		gloss: "it is that thing, but the coverage is wrong — it misses much of it, or spills well beyond it",
		hotkey: "p",
	},
]

/**
 * The standing instruction, on screen for every item of every pass.
 *
 * Two things it has to fix, both of which would otherwise be answered differently by different
 * items. **Recall is not being asked about**: SAM's documented weakness is missing things, and a
 * reviewer who marks a mask `no` because there is a second unmasked word is answering a question
 * this round is not asking (each item is one instance, not the concept's full extent on the cover).
 * And **the left panel is the control**: the highlight is only judgeable against the untouched
 * artwork beside it.
 * [REVIEWED] — briefed wording, 2026-08-03.
 */
export const MASK_QUALITY_INSTRUCTION =
	"Judge only the highlighted region. Other instances of the same thing that were NOT highlighted are " +
	"not this question — a mask is not wrong for having missed something."

/**
 * The referent preamble, above the question on every item.
 * [REVIEWED] — briefed wording, 2026-08-03.
 */
export const MASK_QUALITY_PREAMBLE =
	"Left: the artwork. Right: the same artwork with one region highlighted, outlined and boxed in colour. " +
	"The name under the right panel is what that one region claims to be."

/**
 * The unsure framing. There is no `unsure` key by design — `partly` is the middle answer — so the
 * framing has to say what to do with a genuinely undecidable one.
 * [REVIEWED] — briefed wording, 2026-08-03.
 */
export const MASK_QUALITY_FRAMING =
	"If you cannot tell what the highlighted region is even after zooming, answer no: an unreadable mask is " +
	"not a usable one."

/** `mask_correct.<concept>` — one question per concept, so the concept can be named in the stem. */
export function questionKeyFor(concept: string): string {
	return `mask_correct.${concept}`
}

export function maskQualityQuestion(concept: string, phrase: string): OracleQuestion {
	return {
		key: questionKeyFor(concept),
		kind: "enum",
		question: `Is this a correct "${phrase}" mask?`,
		instruction: MASK_QUALITY_INSTRUCTION,
		preamble: MASK_QUALITY_PREAMBLE,
		framing: MASK_QUALITY_FRAMING,
		answers: MASK_QUALITY_ANSWERS,
	}
}

/* ------------------------------------------------------------------------------------------- */
/* The sample manifest                                                                           */
/* ------------------------------------------------------------------------------------------- */

/**
 * One sampled mask, as `oracle/sam/review_round.py` writes it.
 *
 * `score`, `areaFraction`, `band` and `forcedSuspicious` are read here **only** to be left out: the
 * fixture must not carry them, and the type exists so that a future edit that adds one of them to
 * an item fails to compile rather than quietly leaking the answer key.
 */
export type MaskSampleEntry = Readonly<{
	itemId: string
	maskRowId: string
	concept: string
	conceptPhrase: string
	conceptGroup: string
	score: number
	areaFraction: number
	band: string
	stratum: string
	forcedSuspicious: boolean
	maskRef: Readonly<{ run: string; runId: string; schemaVersion: string; imageSha256: string; instanceIdx: number }>
	artwork: Readonly<{
		imagePath: string
		imageId: string
		artworkId: string | null
		collection: string
		sha256: string
		width: number
		height: number
	}>
	overlay: Readonly<{ path: string; sha256: string; bytes: number; width: number; height: number; scale: number }> | null
}>

export type MaskSampleManifest = Readonly<{
	manifestVersion: string
	batchId: string
	seed: number
	generatedBy: string
	builtFrom: readonly string[]
	sourceRun: string
	scoreThresholdAtRun: number
	scoreBands: readonly Readonly<{ band: string; low: number; high: number }>[]
	conceptGroups: Readonly<Record<string, readonly string[]>>
	selection: Readonly<{ rule: string; composition: Readonly<Record<string, unknown>> }>
	items: readonly MaskSampleEntry[]
}>

export async function readMaskSample(path = SAM_MASK_QUALITY_SAMPLE_PATH): Promise<MaskSampleManifest> {
	return JSON.parse(await readFile(path, "utf8")) as MaskSampleManifest
}

/* ------------------------------------------------------------------------------------------- */
/* Serve order                                                                                   */
/* ------------------------------------------------------------------------------------------- */

function shuffled<T>(values: readonly T[], random: () => number): T[] {
	const out = [...values]
	for (let index = out.length - 1; index > 0; index--) {
		const swap = Math.floor(random() * (index + 1))
		;[out[index], out[swap]] = [out[swap], out[index]]
	}
	return out
}

/**
 * Shuffle one pass so the score bands interleave instead of clumping.
 *
 * A plain shuffle can put a pass's four low-score masks back to back by chance, and a reviewer who
 * has just said `no` four times is not a fresh reader of the fifth. Round-robin over the strata,
 * with the stratum order re-shuffled every round, keeps both properties: no run of one band, and no
 * fixed cycle the reviewer could learn.
 */
export function stratifiedShuffle<T extends { stratum: string; itemId: string }>(
	items: readonly T[],
	random: () => number,
): T[] {
	const byStratum = new Map<string, T[]>()
	for (const item of [...items].sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0))) {
		const bucket = byStratum.get(item.stratum)
		if (bucket === undefined) byStratum.set(item.stratum, [item])
		else bucket.push(item)
	}
	for (const [stratum, bucket] of byStratum) byStratum.set(stratum, shuffled(bucket, random))
	const out: T[] = []
	while (out.length < items.length) {
		const live = shuffled(
			[...byStratum.keys()].filter((stratum) => byStratum.get(stratum)!.length > 0).sort(),
			random,
		)
		for (const stratum of live) out.push(byStratum.get(stratum)!.pop()!)
	}
	return out
}

/* ------------------------------------------------------------------------------------------- */
/* The fixture                                                                                   */
/* ------------------------------------------------------------------------------------------- */

export const SAM_MASK_QUALITY_SELECTION_RULE =
	"Sixty SAM masks from the eval-142 run, one item per mask, drawn stratified by score band " +
	"(0.30-0.45 / 0.45-0.60 / 0.60-0.80 / 0.80+) and concept group (text_like / person_like), with every " +
	"row matching the hallucination signature (mask covers more than half the image while scoring below " +
	"0.5) force-included. Even quotas per cell and round-robin over concepts inside a cell, at most two " +
	"masks per artwork. The served image is a rendered overlay, never the bare artwork. What the round " +
	"decides: the calibrated SCORE_THRESHOLD (loose end A6) and whether the replaced concept set earns " +
	"its keep (loose end A5). Passes run one concept at a time because the concept has to be named in " +
	"the stem; the cost is that a concept's masks are seen consecutively, which the analysis reports " +
	"on rather than hides."

/**
 * Build the round from the sample manifest.
 *
 * Deliberately absent from the produced fixture: every mask's score, its area fraction, its band,
 * and whether it was force-included as a suspicious shape. The analysis re-derives all of it from
 * the manifest by mask row id, so nothing that would tell the reviewer what to answer is written
 * beside the items — and therefore nothing the page could reach.
 *
 * The overlay's hash is taken from the bytes on disk, not from the manifest, and the two are
 * cross-checked: a re-render that changed a pixel is a different stimulus, and it must fail here
 * rather than at push time with a confusing custody error.
 */
export async function buildSamMaskQualityFixture(
	options: { samplePath?: string; repoRoot?: string; batchId?: string; seed?: number } = {},
): Promise<OracleValidationFixture> {
	const manifest = await readMaskSample(options.samplePath)
	const repoRoot = options.repoRoot ?? REPO_ROOT
	const seed = options.seed ?? SAM_MASK_QUALITY_SEED
	const random = mulberry32(seed)

	// Concepts in the manifest's declared group order, so the pass order is a property of the config
	// and not of which mask happened to sort first.
	const conceptOrder: string[] = []
	for (const group of Object.keys(manifest.conceptGroups)) {
		for (const concept of manifest.conceptGroups[group]) {
			if (manifest.items.some((entry) => entry.concept === concept)) conceptOrder.push(concept)
		}
	}

	const questions: OracleQuestion[] = []
	const items: OracleValidationItem[] = []
	const serveOrder: string[] = []
	const counts: Record<string, number> = { masks: manifest.items.length, concepts: conceptOrder.length }

	for (const concept of conceptOrder) {
		const entries = manifest.items.filter((entry) => entry.concept === concept)
		questions.push(maskQualityQuestion(concept, entries[0].conceptPhrase))
		const pass: OracleValidationItem[] = []
		for (const entry of entries) {
			if (entry.overlay === null) {
				throw new Error(
					`${entry.itemId}: no overlay on disk. Run oracle/sam/review_round.py --write before building the fixture.`,
				)
			}
			const bytes = await readFile(join(repoRoot, entry.overlay.path))
			const sha256 = createHash("sha256").update(bytes).digest("hex")
			if (sha256 !== entry.overlay.sha256) {
				throw new Error(
					`${entry.itemId}: ${entry.overlay.path} hashes ${sha256}, the manifest recorded ${entry.overlay.sha256}`,
				)
			}
			pass.push({
				itemId: entry.itemId,
				questionKey: questionKeyFor(concept),
				imagePath: entry.overlay.path,
				sha256,
				// The mask row, not the artwork: an artwork can contribute two masks, and an answer is
				// about one of them. This is the join key back into the run's JSONL.
				imageId: entry.maskRowId,
				artworkId: entry.artwork.artworkId,
				collection: OVERLAY_COLLECTION,
				rendition: {
					source: "research/v3/data/sam/mask-quality-sample.json",
					sourceEntryId: entry.maskRowId,
					longEdgePx: Math.max(entry.overlay.width, entry.overlay.height),
					width: entry.overlay.width,
					height: entry.overlay.height,
				},
				stratum: entry.stratum,
			})
		}
		items.push(...pass)
		serveOrder.push(...stratifiedShuffle(pass, random).map((item) => item.itemId))
		counts[concept] = pass.length
	}

	const fixture: OracleValidationFixture = {
		// The server accepts one oracle-validation fixture version; this round is the same shape.
		fixtureVersion: PREMISE_DISAMBIGUATION_FIXTURE_VERSION,
		batchId: options.batchId ?? SAM_MASK_QUALITY_BATCH_ID,
		purpose: "oracle-validation",
		labelSchemaVersion: SAM_MASK_QUALITY_LABEL_SCHEMA_VERSION,
		seed,
		generatedBy: "research/v3/src/review-server/sam-mask-quality.ts",
		builtFrom: [
			"research/v3/data/sam/mask-quality-sample.json",
			`research/v3/data/sam/${manifest.sourceRun}.jsonl`,
			"research/v3/oracle/sam/review_round.py",
		],
		selection: { rule: SAM_MASK_QUALITY_SELECTION_RULE, counts },
		questions,
		items,
		serveOrder,
	}
	validateFixture(fixture)
	assertNoAnswerKey(fixture)
	return fixture
}

/**
 * The fixture must not contain the score, the area fraction, the band or the forced flag.
 *
 * Checked structurally rather than trusted: the fixture is written to a file that a later reader
 * will reasonably assume is safe to open beside the round, and the one thing that would quietly
 * ruin the calibration is a score sitting next to the item it is calibrating.
 */
export function assertNoAnswerKey(fixture: OracleValidationFixture): void {
	const text = JSON.stringify({ items: fixture.items, questions: fixture.questions })
	for (const forbidden of ["score", "areaFraction", "area_fraction", "forcedSuspicious", "band"]) {
		if (text.includes(forbidden)) throw new Error(`the mask-quality fixture leaks ${forbidden}`)
	}
	// `stratum` legitimately carries the band, and the analysis needs it there — but it is never
	// served: `oracleValidationPayload` sends token, question key, media, dimensions and the answer.
}

/* ------------------------------------------------------------------------------------------- */
/* Pushing                                                                                       */
/* ------------------------------------------------------------------------------------------- */

/** Minimal structural view of the review service, so this file does not import the server. */
type PushTarget = {
	has(batchId: string): boolean
	pushOracleValidation(
		fixture: OracleValidationFixture,
		fundedBy?: readonly string[],
		batchId?: string,
	): Promise<{ batchId: string; itemCount: number }>
}

/**
 * Push the mask-quality round if it is not in the queue yet. Idempotent by batch id.
 *
 * Typed against a structural `PushTarget` rather than `ReviewService` so this file stays a leaf:
 * nothing in `server.ts` has to know the round exists, and the round can be pushed over
 * `POST /api/oracle-validation` against a server that was started without it.
 */
export async function seedSamMaskQualityRound(
	service: PushTarget,
	fixturePath = SAM_MASK_QUALITY_FIXTURE_PATH,
	batchId = SAM_MASK_QUALITY_BATCH_ID,
): Promise<string | null> {
	const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as OracleValidationFixture
	if (service.has(batchId)) return null
	const pushed = await service.pushOracleValidation(
		fixture,
		[
			"PHASE_0_LOOSE_ENDS.md A6 — SCORE_THRESHOLD = 0.3 is [UNCALIBRATED] and no reviewer has seen a mask",
			"PHASE_0_LOOSE_ENDS.md A5 — the concept set was replaced by an agent over a standing reviewer prerogative",
			`selection: ${fixture.selection.rule}`,
		],
		batchId,
	)
	return pushed.batchId
}

/** Push over HTTP, for a server that is already running. Returns what the server replied. */
export async function pushSamMaskQualityRound(
	base: string,
	fixturePath = SAM_MASK_QUALITY_FIXTURE_PATH,
): Promise<{ status: number; body: unknown }> {
	const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as OracleValidationFixture
	const response = await fetch(`${base}/api/oracle-validation`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			fixture,
			fundedBy: ["PHASE_0_LOOSE_ENDS.md A5 + A6 — the SAM mask-quality round"],
		}),
	})
	const text = await response.text()
	return { status: response.status, body: text.length === 0 ? null : JSON.parse(text) }
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: { write: { type: "boolean", default: false }, push: { type: "string" } },
		strict: true,
	})
	const fixture = await buildSamMaskQualityFixture()
	process.stdout.write(`${fixture.batchId}: ${fixture.items.length} items, ${fixture.questions.length} passes\n`)
	for (const question of fixture.questions) {
		const count = fixture.items.filter((item) => item.questionKey === question.key).length
		process.stdout.write(`  ${question.key.padEnd(26)} ${String(count).padStart(3)}  ${question.question}\n`)
	}
	const byStratum = new Map<string, number>()
	for (const item of fixture.items) byStratum.set(item.stratum, (byStratum.get(item.stratum) ?? 0) + 1)
	for (const [stratum, count] of [...byStratum].sort()) process.stdout.write(`  ${stratum.padEnd(26)} ${count}\n`)
	if (values.write) {
		await writeFile(SAM_MASK_QUALITY_FIXTURE_PATH, serializeFixture(fixture))
		process.stdout.write(`wrote ${SAM_MASK_QUALITY_FIXTURE_PATH}\n`)
	}
	if (values.push !== undefined) {
		const pushed = await pushSamMaskQualityRound(values.push)
		process.stdout.write(`pushed to ${values.push}: ${pushed.status} ${JSON.stringify(pushed.body)}\n`)
	}
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main()
}
