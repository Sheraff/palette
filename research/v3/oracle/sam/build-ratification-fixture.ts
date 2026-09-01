/**
 * Build the review fixture for the concept-set-v2 ratification round.
 *
 *     node --experimental-strip-types build-ratification-fixture.ts
 *     node --experimental-strip-types build-ratification-fixture.ts --write
 *     node --experimental-strip-types build-ratification-fixture.ts --push http://127.0.0.1:8787
 *
 * Step 2 of two. Step 1 is `review_round_2.py --write`, which selects the masks and renders the
 * overlays; this turns that manifest into the fixture the review server serves. It is the same
 * builder round 1 used — `buildSamMaskQualityFixture` in `src/review-server/sam-mask-quality.ts`,
 * whose `samplePath` and `batchId` are already parameters — so the round inherits round 1's serve
 * order, its answer-key guard and its overlay-hash cross-check without a second implementation.
 *
 * The round has two sections. The mask section is that shared builder's output unchanged: one pass
 * per concept, asking whether a highlighted region is the thing it claims to be. The **residual
 * section** is appended here, because the shared builder only knows how to ask about masks: one
 * further pass over `residual_is_field`, showing each cover with every v2 mask cut out and asking
 * whether what remains is the background. It is the first time §8.3's subtractive premise is put in
 * front of a human. Same batch, separate pass, separate question key — an analysis that pooled the
 * two would be averaging answers to different questions.
 *
 * Two provenance strings inside that builder are hardcoded to round 1's manifest path (its
 * `builtFrom`, and every item's `rendition.source`). They are labels, not behaviour, but a fixture
 * that names the wrong source file is a provenance defect in a reviewer-facing artifact, so this
 * script corrects them for this round and re-runs the builder's own two checks over the result.
 * Correcting them at the source — making both follow `samplePath` — is a two-line change in the
 * review-server workstream's file and is theirs to make, not this one's.
 *
 * Nothing here touches the GPU or a model. `--push` is the only side effect beyond writing the
 * fixture file, and pushing a round to the reviewer's queue is the orchestrator's call.
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
	SAM_MASK_QUALITY_SEED,
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

/** [REVIEWED] The batch id `review_round_2.py` writes into the manifest. The two must agree. */
export const RATIFICATION_BATCH_ID = "sam-mask-quality-2-v2-ratification"

/** The manifest `review_round_2.py --write` produces. */
export const RATIFICATION_SAMPLE_PATH = fileURLToPath(
	new URL("../../data/sam/mask-quality-2-sample.json", import.meta.url),
)

/** Where the fixture lands. Named for the batch, beside round 1's `sam-mask-quality-1.json`. */
export const RATIFICATION_FIXTURE_PATH = fileURLToPath(
	new URL(`../../data/sam/${RATIFICATION_BATCH_ID}.json`, import.meta.url),
)

const SAMPLE_REPO_PATH = "research/v3/data/sam/mask-quality-2-sample.json"
const ROUND_1_SAMPLE_REPO_PATH = "research/v3/data/sam/mask-quality-sample.json"

/** research/v3/oracle/sam/ → repository root. Overlay paths in the manifest are relative to it. */
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url))

/**
 * What this round is for, in the fixture's own words. Read by anyone opening the fixture later and
 * by the push record; deliberately says what a `no` would mean, not only what a `yes` would.
 */
export const RATIFICATION_SELECTION_RULE =
	"About twenty-five SAM masks from the concept-set-v2 re-run of the eval set, one item per mask. " +
	"Purposive, not stratified: the round ratifies three named claims rather than estimating a rate. " +
	"The claims are that `parental-advisory` is a real category this model finds and finds only where " +
	"the mark is (reviewer note 2), that `display-text` is the honest name for what the prompt " +
	'"album title" returns because it masks the artist name as readily as the title (note 5), and that ' +
	'`emblem` is the honest name for what the prompt "logo" returns because a mask cannot know whether ' +
	"a mark is part of the artwork or applied to it (note 1). So: the parental-advisory masks on the " +
	"five covers confirmed by eye to carry a mark AND on covers nobody confirmed, where a false " +
	"positive would show; display-text masks in pairs from covers where two masks compete, so the " +
	"artist mask and the title mask of one cover are judged under the same name; and emblem masks " +
	"including the applied record-label logo and the emblem drawn into the artwork that probe 2 " +
	"opened. The panel and the question name the STORED TAG, not the prompt string, because the tag " +
	"is what is being ratified. A `no` on the confirmed covers retracts the rename it belongs to."

/* ----------------------------------------------------------------------------------------- */
/* The residual-field pass                                                                      */
/* ----------------------------------------------------------------------------------------- */

/**
 * [REVIEWED] The key the round's second section answers under, named by the coordinator's brief.
 * Deliberately NOT of the `mask_correct.<concept>` family: this is not a question about a mask, it
 * is a question about what is left when every mask is taken away, and the two must never be pooled
 * by an analysis that groups on the question key.
 */
export const RESIDUAL_QUESTION_KEY = "residual_is_field"

/** [REVIEWED] Briefed wording. */
export const RESIDUAL_QUESTION = "Everything the masks found has been removed. Is what remains the background/field?"

/**
 * [REVIEWED] Same three keys and hotkeys as the mask pass (y/n/p), different glosses.
 *
 * The glosses cannot be reused: the mask question's `partly` is about a mask's extent, and here
 * `partly` is about a residual that is mostly field with some subject left standing in it — which
 * is the single most informative answer this section can collect, because it is exactly what §8.3
 * assumes never happens.
 */
export const RESIDUAL_ANSWERS: readonly OracleAnswerOption[] = [
	{
		key: "yes",
		label: "yes",
		gloss: "what is left is the background — the ground, the field, the surface the subject sat on",
		hotkey: "y",
	},
	{
		key: "no",
		label: "no",
		gloss: "what is left is not background — the subject is still there, or nothing meaningful is",
		hotkey: "n",
	},
	{
		key: "partly",
		label: "partly",
		gloss: "mostly background, but something that is clearly not field is still standing in it",
		hotkey: "p",
	},
]

/**
 * [REVIEWED] The standing instruction for this pass. It says the opposite of the mask pass's
 * instruction and has to, or the two would be answered under one habit: there, a mask was not wrong
 * for having missed a second instance; here, a thing that was missed is the whole finding, because
 * the residual is what the colorimetry stage would be handed.
 */
export const RESIDUAL_INSTRUCTION =
	"Here, what was missed does matter: if a face, a figure or a piece of lettering is still standing in the " +
	"right-hand panel, that is a no. Judge the leftover pixels as a whole, not any one region."

/** [REVIEWED] The referent preamble. Says what the checkerboard is, because nothing else does. */
export const RESIDUAL_PREAMBLE =
	"Left: the artwork. Right: the same artwork with every region the model found cut out — the grey " +
	"checkerboard is removed pixels, not part of the cover."

/** [REVIEWED] The unsure framing, in the same shape as the mask pass's. */
export const RESIDUAL_FRAMING =
	"If the cover has no real background to speak of — an all-over pattern, a full-bleed photograph — answer " +
	"with what is actually left rather than with what the cover ought to have had."

export type ResidualManifestItem = Readonly<{
	itemId: string
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

export function residualQuestion(): OracleQuestion {
	return {
		key: RESIDUAL_QUESTION_KEY,
		kind: "enum",
		question: RESIDUAL_QUESTION,
		instruction: RESIDUAL_INSTRUCTION,
		preamble: RESIDUAL_PREAMBLE,
		framing: RESIDUAL_FRAMING,
		answers: RESIDUAL_ANSWERS,
	}
}

/**
 * Turn the manifest's residual section into one pass, with the same overlay-hash cross-check the
 * shared builder applies to the mask items: a re-rendered panel is a different stimulus, and it has
 * to fail here rather than at push time.
 */
async function residualPass(
	items: readonly ResidualManifestItem[],
	repoRoot: string,
): Promise<OracleValidationItem[]> {
	const out: OracleValidationItem[] = []
	for (const entry of items) {
		if (entry.overlay === null) {
			throw new Error(`${entry.itemId}: no residual overlay on disk. Run review_round_2.py --write first.`)
		}
		const bytes = await readFile(join(repoRoot, entry.overlay.path))
		const sha256 = createHash("sha256").update(bytes).digest("hex")
		if (sha256 !== entry.overlay.sha256) {
			throw new Error(`${entry.itemId}: ${entry.overlay.path} hashes ${sha256}, the manifest recorded ${entry.overlay.sha256}`)
		}
		out.push({
			itemId: entry.itemId,
			questionKey: RESIDUAL_QUESTION_KEY,
			imagePath: entry.overlay.path,
			sha256,
			// The artwork, not a mask row: this section asks one question per cover.
			imageId: `residual:${entry.artwork.sha256.slice(0, 12)}`,
			artworkId: entry.artwork.artworkId,
			collection: OVERLAY_COLLECTION,
			rendition: {
				source: SAMPLE_REPO_PATH,
				sourceEntryId: entry.artwork.sha256,
				longEdgePx: Math.max(entry.overlay.width, entry.overlay.height),
				width: entry.overlay.width,
				height: entry.overlay.height,
			},
			stratum: entry.stratum,
		})
	}
	return out
}

/** Rewrite the two provenance strings the shared builder hardcodes to round 1's manifest. */
function withCorrectedProvenance(fixture: OracleValidationFixture): OracleValidationFixture {
	const corrected = structuredClone(fixture) as {
		builtFrom: string[]
		selection: { rule: string; counts: Record<string, number> }
		items: { rendition: { source: string } }[]
	}
	corrected.builtFrom = fixture.builtFrom.map((entry) =>
		entry === ROUND_1_SAMPLE_REPO_PATH ? SAMPLE_REPO_PATH : entry,
	)
	if (!corrected.builtFrom.includes("research/v3/oracle/sam/review_round_2.py")) {
		corrected.builtFrom.push("research/v3/oracle/sam/review_round_2.py")
	}
	corrected.selection.rule = RATIFICATION_SELECTION_RULE
	for (const item of corrected.items) {
		if (item.rendition.source === ROUND_1_SAMPLE_REPO_PATH) item.rendition.source = SAMPLE_REPO_PATH
	}
	return corrected as unknown as OracleValidationFixture
}

export async function buildRatificationFixture(): Promise<OracleValidationFixture> {
	const built = await buildSamMaskQualityFixture({
		samplePath: RATIFICATION_SAMPLE_PATH,
		batchId: RATIFICATION_BATCH_ID,
	})
	const manifest = JSON.parse(await readFile(RATIFICATION_SAMPLE_PATH, "utf8")) as {
		residualSection?: { items: ResidualManifestItem[]; rule: string }
	}
	const withProvenance = withCorrectedProvenance(built) as {
		questions: OracleQuestion[]
		items: OracleValidationItem[]
		serveOrder: string[]
		selection: { rule: string; counts: Record<string, number> }
	}

	const residualItems = await residualPass(manifest.residualSection?.items ?? [], REPO_ROOT)
	if (residualItems.length > 0) {
		withProvenance.questions.push(residualQuestion())
		withProvenance.items.push(...residualItems)
		// Appended whole, after every mask pass: §6 wants one pass per question, and validateFixture
		// rejects a serve order in which two questions interleave.
		withProvenance.serveOrder.push(
			...stratifiedShuffle(residualItems, mulberry32(SAM_MASK_QUALITY_SEED + 1)).map((item) => item.itemId),
		)
		withProvenance.selection.counts[RESIDUAL_QUESTION_KEY] = residualItems.length
		withProvenance.selection.rule = `${withProvenance.selection.rule} SECOND SECTION — ${manifest.residualSection?.rule ?? ""}`
	}

	const fixture = withProvenance as unknown as OracleValidationFixture
	// The builder ran both of these before the rewrite; run them again after it, so a corrected
	// string or an appended pass can never be the thing that slipped an answer key or an invalid
	// item past.
	validateFixture(fixture)
	assertNoAnswerKey(fixture)
	return fixture
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: { write: { type: "boolean", default: false }, push: { type: "string" } },
		strict: true,
	})
	const manifest = JSON.parse(await readFile(RATIFICATION_SAMPLE_PATH, "utf8")) as {
		sourceRun: string
		conceptSetHash?: string
		selection: { composition: { shortfall: number; notes: string[] } }
		residualSection?: { composition: { notes: string[] } }
	}
	const fixture = await buildRatificationFixture()
	process.stdout.write(
		`${fixture.batchId}: ${fixture.items.length} items, ${fixture.questions.length} passes\n` +
			`  source run: ${manifest.sourceRun}  concept set: ${manifest.conceptSetHash?.slice(0, 16) ?? "unknown"}\n`,
	)
	for (const question of fixture.questions) {
		const count = fixture.items.filter((item) => item.questionKey === question.key).length
		process.stdout.write(`  ${question.key.padEnd(28)} ${String(count).padStart(3)}  ${question.question}\n`)
	}
	if (manifest.selection.composition.shortfall !== 0) {
		process.stdout.write(`  SHORTFALL ${manifest.selection.composition.shortfall}\n`)
	}
	for (const note of manifest.selection.composition.notes) process.stdout.write(`  NOTE ${note}\n`)
	for (const note of manifest.residualSection?.composition.notes ?? []) process.stdout.write(`  NOTE ${note}\n`)
	if (values.write) {
		await writeFile(RATIFICATION_FIXTURE_PATH, serializeFixture(fixture))
		process.stdout.write(`wrote ${RATIFICATION_FIXTURE_PATH}\n`)
	}
	if (values.push !== undefined) {
		const pushed = await pushSamMaskQualityRound(values.push, RATIFICATION_FIXTURE_PATH)
		process.stdout.write(`pushed to ${values.push}: ${pushed.status} ${JSON.stringify(pushed.body)}\n`)
	}
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main()
}
