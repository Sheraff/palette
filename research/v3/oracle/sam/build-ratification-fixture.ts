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

import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import {
	assertNoAnswerKey,
	buildSamMaskQualityFixture,
	pushSamMaskQualityRound,
} from "../../src/review-server/sam-mask-quality.ts"
import { serializeFixture, validateFixture, type OracleValidationFixture } from "../../src/review-server/oracle-validation.ts"

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
	const fixture = withCorrectedProvenance(built)
	// The builder ran both of these before the rewrite; run them again after it, so a corrected
	// string can never be the thing that slipped an answer key or an invalid item past.
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
