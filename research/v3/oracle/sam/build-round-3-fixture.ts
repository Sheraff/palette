/**
 * Build the review fixture for mask-quality round 3 — the area guard (A6) and hard text (A12).
 *
 *     node --experimental-strip-types build-round-3-fixture.ts
 *     node --experimental-strip-types build-round-3-fixture.ts --write
 *     node --experimental-strip-types build-round-3-fixture.ts --push http://127.0.0.1:3010
 *
 * Step 2 of two. Step 1 is `review_round_3.py --write`, which selects the masks and renders the
 * overlays; this turns that manifest into the fixture the review server serves. It reuses the shared
 * builder — `buildSamMaskQualityFixture` in `src/review-server/sam-mask-quality.ts` — so round 3
 * inherits round 1's serve order, its answer-key guard and its overlay-hash cross-check without a
 * second implementation. **No server code is modified or needed**: a `sam-mask-quality.v1` batch is
 * an ordinary oracle-validation fixture and the server already serves it at `/oracle?batch=<id>`.
 *
 * The round has two sections and three kinds of pass.
 *
 *   * The MASK passes are the shared builder's output unchanged: one pass per concept, asking
 *     whether a highlighted region is the thing it claims to be — the round-1/round-2 question the
 *     reviewer already knows, with the same y/n/p keys.
 *   * The GUARD pass is appended here, because the shared builder only knows how to ask whether a
 *     mask is correct, and that is not the question the area guard turns on. A mask can be a
 *     perfectly correct `person` AND cover the whole cover; the guard exists for that case, so the
 *     round has to ask about it separately. Same batch, separate pass, separate question key — an
 *     analysis that pooled the two would be averaging answers to different questions.
 *
 * Every section-A mask therefore appears TWICE: once under `mask_correct.<concept>` and once under
 * `big_area_is_real_subject`, as two items sharing one `imageId` (the mask row id). That is legal
 * and intended — `validateFixture` keys uniqueness on `(questionKey, imageId)`, precisely so that
 * one stimulus can carry two questions.
 *
 * Nothing here touches the GPU or a model. `--push` is the only side effect beyond writing the
 * fixture file.
 */

import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import {
	assertNoAnswerKey,
	buildSamMaskQualityFixture,
	OVERLAY_COLLECTION,
	pushSamMaskQualityRound,
	stratifiedShuffle,
} from "../../src/review-server/sam-mask-quality.ts"
import { mulberry32 } from "../../src/contract/calibration/same-color-bar-translation.ts"
import {
	serializeFixture,
	validateFixture,
	type OracleAnswerOption,
	type OracleQuestion,
	type OracleValidationFixture,
	type OracleValidationItem,
} from "../../src/review-server/oracle-validation.ts"

/** [REVIEWED] The batch id `review_round_3.py` writes into the manifest. The two must agree. */
export const ROUND_3_BATCH_ID = "sam-mask-quality-3-area-guard-and-hard-text"

/** The manifest `review_round_3.py --write` produces. */
export const ROUND_3_SAMPLE_PATH = fileURLToPath(
	new URL("../../data/sam/mask-quality-3-sample.json", import.meta.url),
)

/** Where the fixture lands, beside rounds 1 and 2. */
export const ROUND_3_FIXTURE_PATH = fileURLToPath(
	new URL(`../../data/sam/${ROUND_3_BATCH_ID}.json`, import.meta.url),
)

/** [UNCALIBRATED] Seed for the serve-order shuffle. The build date, matching the other v3 fixtures. */
export const ROUND_3_SEED = 20260805

const SAMPLE_REPO_PATH = "research/v3/data/sam/mask-quality-3-sample.json"
const ROUND_1_SAMPLE_REPO_PATH = "research/v3/data/sam/mask-quality-sample.json"

/** research/v3/oracle/sam/ → repository root. Overlay paths in the manifest are relative to it. */
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url))

/* ----------------------------------------------------------------------------------------- */
/* The guard question                                                                          */
/* ----------------------------------------------------------------------------------------- */

/**
 * [REVIEWED] The key the guard section answers under.
 *
 * Deliberately NOT of the `mask_correct.<concept>` family. This is not a question about whether a
 * mask found the right thing; it is a question about whether there IS a right thing at that size.
 * An analysis that grouped on the question-key prefix must not pool the two.
 */
export const GUARD_QUESTION_KEY = "big_area_is_real_subject"

/**
 * [REVIEWED] The stem. Plain words, no jargon, no numbers.
 *
 * It deliberately does not say "more than half the cover", does not name the guard, and does not
 * mention the threshold: the reviewer is being asked what they see, and a stem that announced "this
 * mask covers 57% of the image" would be handing over the very quantity the answer is joined against.
 */
export const GUARD_QUESTION =
	"Is the highlighted region a real thing that fills the cover, or has the model just outlined most of the picture?"

/**
 * [REVIEWED] Three answers, one keystroke each, and `u` left free so undo stays on `u`.
 *
 * The middle answer is not a hedge and is not "partly" reused from the mask question — it means
 * something specific here: there IS a real subject at that size, and the outline is loose around it.
 * That is a different finding from either end. If the reviewer says the subject is real but the
 * outline is sloppy, the guard is still deleting a mask of a real subject, and the fix is the
 * outline, not the guard.
 */
export const GUARD_ANSWERS: readonly OracleAnswerOption[] = [
	{
		key: "real-subject",
		label: "a real thing",
		gloss: "there really is one thing — a person, a face, an object — that takes up this much of the cover, and the outline follows it",
		hotkey: "r",
	},
	{
		key: "real-but-loose",
		label: "real, but loosely outlined",
		gloss: "there is a real thing that big, but the outline spills well past it or misses much of it",
		hotkey: "l",
	},
	{
		key: "whole-image",
		label: "just the whole picture",
		gloss: "the highlight is roughly the entire cover — it is not following any one thing",
		hotkey: "w",
	},
]

/**
 * [REVIEWED] The standing instruction for this pass. It has to undo the mask pass's habit.
 *
 * In the mask pass a big mask that found the right thing is a `yes`, and the reviewer is told not to
 * penalise it for what it missed. Here the size IS the question, so the instruction says so plainly:
 * a correct mask and a whole-image mask can look the same in the mask pass and must not here.
 */
export const GUARD_INSTRUCTION =
	"Here the size of the highlight is the whole question. A cover really can be almost entirely one face, one figure or one car — " +
	"if that is what you see, say so. Answer about what is in the picture, not about whether the outline is tidy."

/** [REVIEWED] The referent preamble. Same two panels as every other pass, said once more. */
export const GUARD_PREAMBLE =
	"Left: the artwork. Right: the same artwork with one region highlighted, outlined and boxed in colour. " +
	"The name under the right panel is what that one region claims to be."

/** [REVIEWED] The unsure framing, in the same shape as the mask pass's. */
export const GUARD_FRAMING =
	"If you cannot tell what the highlighted region is meant to be even after zooming, answer that it is just the whole picture."

export type GuardManifestItem = Readonly<{
	itemId: string
	maskRowId: string
	concept: string
	conceptPhrase: string
	conceptGroup: string
	selectionRole: string
	stratum: string
	artwork: Readonly<{
		imagePath: string
		imageId: string
		artworkId: string | null
		collection: string
		sha256: string
		width: number
		height: number
	}>
	overlay: Readonly<{ path: string; sha256: string; bytes: number; width: number; height: number }> | null
}>

export function guardQuestion(): OracleQuestion {
	return {
		key: GUARD_QUESTION_KEY,
		kind: "enum",
		question: GUARD_QUESTION,
		instruction: GUARD_INSTRUCTION,
		preamble: GUARD_PREAMBLE,
		framing: GUARD_FRAMING,
		answers: GUARD_ANSWERS,
	}
}

/**
 * Turn the manifest's guard section into one pass, with the same overlay-hash cross-check the shared
 * builder applies to the mask items.
 *
 * The overlay file is the SAME file the mask item serves. That is deliberate: it is the same pixels
 * being asked a second question, and rendering a byte-identical twin under a second name would only
 * give the two a way to drift apart.
 */
async function guardPass(
	items: readonly GuardManifestItem[],
	repoRoot: string,
): Promise<OracleValidationItem[]> {
	const out: OracleValidationItem[] = []
	for (const entry of items) {
		if (entry.overlay === null) {
			throw new Error(`${entry.itemId}: no overlay on disk. Run review_round_3.py --write first.`)
		}
		const bytes = await readFile(join(repoRoot, entry.overlay.path))
		const sha256 = createHash("sha256").update(bytes).digest("hex")
		if (sha256 !== entry.overlay.sha256) {
			throw new Error(
				`${entry.itemId}: ${entry.overlay.path} hashes ${sha256}, the manifest recorded ${entry.overlay.sha256}`,
			)
		}
		out.push({
			itemId: entry.itemId,
			questionKey: GUARD_QUESTION_KEY,
			imagePath: entry.overlay.path,
			sha256,
			// The mask row, the same id the mask item uses. Legal because uniqueness is
			// (questionKey, imageId), and it makes the join between the two answers exact.
			imageId: entry.maskRowId,
			artworkId: entry.artwork.artworkId,
			collection: OVERLAY_COLLECTION,
			rendition: {
				source: SAMPLE_REPO_PATH,
				sourceEntryId: entry.maskRowId,
				longEdgePx: Math.max(entry.overlay.width, entry.overlay.height),
				width: entry.overlay.width,
				height: entry.overlay.height,
			},
			stratum: entry.stratum,
		})
	}
	return out
}

export const ROUND_3_SELECTION_RULE =
	"Mask-quality round 3, two loose ends in one batch, both of them thresholds set without a human " +
	"ever seeing the masks they decide. SECTION A — the area guard (loose end A6). The guard rejects " +
	"any region covering more than half its cover. It was calibrated on a round whose big-area masks " +
	"were 3 stickers, 1 emblem and 1 face and contained NO person, yet 5 of the 6 regions it removes " +
	"across the corpus are `person`. A person filling most of a cover is an ordinary artwork, so the " +
	"guard may be deleting correct masks on a concept its calibration never tested. This section is a " +
	"CENSUS, not a sample: every region in the run over the guard, plus every region just under it as " +
	"boundary context. Each is asked twice — the usual mask question, and whether the region is a real " +
	"thing filling the cover or the model outlining the whole picture, which is what per-concept-group " +
	"scoping actually turns on. SECTION B — hard text (loose end A12). On the 11 covers where the VLM " +
	"reports text and no text_like mask survives the pooled cut, this shows the masks the current " +
	"thresholds THROW AWAY: up to three per cover, spread from the cover's strongest to its weakest. A " +
	"category-aware cut cannot be fitted to regions nobody has graded, so the below-cut masks are the " +
	"only thing that can calibrate one. The panel names the STORED TAG, not the prompt string."

/** Rewrite the provenance strings the shared builder hardcodes to round 1's manifest. */
function withCorrectedProvenance(fixture: OracleValidationFixture): OracleValidationFixture {
	const corrected = structuredClone(fixture) as {
		builtFrom: string[]
		selection: { rule: string; counts: Record<string, number> }
		items: { rendition: { source: string } }[]
	}
	corrected.builtFrom = fixture.builtFrom.map((entry) =>
		entry === ROUND_1_SAMPLE_REPO_PATH ? SAMPLE_REPO_PATH : entry,
	)
	if (!corrected.builtFrom.includes("research/v3/oracle/sam/review_round_3.py")) {
		corrected.builtFrom.push("research/v3/oracle/sam/review_round_3.py")
	}
	corrected.selection.rule = ROUND_3_SELECTION_RULE
	for (const item of corrected.items) {
		if (item.rendition.source === ROUND_1_SAMPLE_REPO_PATH) item.rendition.source = SAMPLE_REPO_PATH
	}
	return corrected as unknown as OracleValidationFixture
}

export async function buildRound3Fixture(): Promise<OracleValidationFixture> {
	const built = await buildSamMaskQualityFixture({
		samplePath: ROUND_3_SAMPLE_PATH,
		batchId: ROUND_3_BATCH_ID,
		seed: ROUND_3_SEED,
	})
	const manifest = JSON.parse(await readFile(ROUND_3_SAMPLE_PATH, "utf8")) as {
		guardSection?: { items: GuardManifestItem[]; rule: string }
	}
	const withProvenance = withCorrectedProvenance(built) as {
		questions: OracleQuestion[]
		items: OracleValidationItem[]
		serveOrder: string[]
		selection: { rule: string; counts: Record<string, number> }
	}

	const guardItems = await guardPass(manifest.guardSection?.items ?? [], REPO_ROOT)
	if (guardItems.length > 0) {
		withProvenance.questions.push(guardQuestion())
		withProvenance.items.push(...guardItems)
		// Appended whole, after every mask pass: §6 wants one pass per question, and validateFixture
		// rejects a serve order in which two questions interleave. Putting the guard pass LAST also
		// means the reviewer has already looked at every one of these masks once under the mask
		// question, so the second question is asked of a familiar picture rather than a cold one.
		withProvenance.serveOrder.push(
			...stratifiedShuffle(guardItems, mulberry32(ROUND_3_SEED + 1)).map((item) => item.itemId),
		)
		withProvenance.selection.counts[GUARD_QUESTION_KEY] = guardItems.length
		withProvenance.selection.rule = `${withProvenance.selection.rule} GUARD PASS — ${manifest.guardSection?.rule ?? ""}`
	}

	const fixture = withProvenance as unknown as OracleValidationFixture
	// The builder ran both of these before the rewrite; run them again after it, so a corrected string
	// or an appended pass can never be the thing that slipped an answer key or an invalid item past.
	validateFixture(fixture)
	assertNoAnswerKey(fixture)
	return fixture
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: { write: { type: "boolean", default: false }, push: { type: "string" } },
		strict: true,
	})
	const manifest = JSON.parse(await readFile(ROUND_3_SAMPLE_PATH, "utf8")) as {
		sourceRun: string
		conceptSetHash?: string
		selection: { composition: { notes: string[] } }
		gpuGap: { whatIsMissing: string }
	}
	const fixture = await buildRound3Fixture()
	process.stdout.write(
		`${fixture.batchId}: ${fixture.items.length} items, ${fixture.questions.length} passes\n` +
			`  source run: ${manifest.sourceRun}  concept set: ${manifest.conceptSetHash?.slice(0, 16) ?? "unknown"}\n`,
	)
	for (const question of fixture.questions) {
		const count = fixture.items.filter((item) => item.questionKey === question.key).length
		process.stdout.write(`  ${question.key.padEnd(30)} ${String(count).padStart(3)}  ${question.question}\n`)
	}
	for (const note of manifest.selection.composition.notes) process.stdout.write(`  NOTE ${note}\n`)
	process.stdout.write(`  GPU GAP ${manifest.gpuGap.whatIsMissing}\n`)
	if (values.write) {
		await writeFile(ROUND_3_FIXTURE_PATH, serializeFixture(fixture))
		process.stdout.write(`wrote ${ROUND_3_FIXTURE_PATH}\n`)
	}
	if (values.push !== undefined) {
		const pushed = await pushSamMaskQualityRound(values.push, ROUND_3_FIXTURE_PATH)
		process.stdout.write(`pushed to ${values.push}: ${pushed.status} ${JSON.stringify(pushed.body)}\n`)
	}
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main()
}
