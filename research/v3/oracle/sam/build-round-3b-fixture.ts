/**
 * Build the review fixture for mask-quality round 3b — the CJK masks (loose end A12).
 *
 *     node --experimental-strip-types build-round-3b-fixture.ts
 *     node --experimental-strip-types build-round-3b-fixture.ts --write
 *     node --experimental-strip-types build-round-3b-fixture.ts --push http://127.0.0.1:3010
 *
 * Step 3 of three. Step 1 is `run_cjk_probe.py --out sam-cjk-probe-7`, the GPU run that produced
 * masks for prompts the static concept set does not contain; step 2 is `review_round_3b.py --write`,
 * which selects them and renders the overlays; this turns that manifest into the fixture the review
 * server serves.
 *
 * Unlike round 3 this adds NO question of its own. The round asks exactly one thing, the question
 * rounds 1 and 2 asked — "is this a correct <thing> mask?", y/n/p — over three passes, one per
 * concept: `cjk-script` (the finding under test), `kanji` (its union partner) and `words` (the
 * incumbent control). So the shared builder in `src/review-server/sam-mask-quality.ts` produces the
 * whole fixture and this file only corrects the provenance strings it hardcodes to round 1's
 * manifest, then re-runs the builder's own two checks.
 *
 * **No server code is modified or needed.** A `sam-mask-quality.v1` batch is an ordinary
 * oracle-validation fixture and the server already serves it at `/oracle?batch=<id>`.
 */

import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import {
	assertNoAnswerKey,
	buildSamMaskQualityFixture,
	pushSamMaskQualityRound,
} from "../../src/review-server/sam-mask-quality.ts"
import {
	serializeFixture,
	validateFixture,
	type OracleValidationFixture,
} from "../../src/review-server/oracle-validation.ts"

/** [REVIEWED] The batch id `review_round_3b.py` writes into the manifest. The two must agree. */
export const ROUND_3B_BATCH_ID = "sam-mask-quality-3b-cjk"

/** The manifest `review_round_3b.py --write` produces. */
export const ROUND_3B_SAMPLE_PATH = fileURLToPath(
	new URL("../../data/sam/mask-quality-3b-sample.json", import.meta.url),
)

/** Where the fixture lands, beside rounds 1, 2 and 3. */
export const ROUND_3B_FIXTURE_PATH = fileURLToPath(
	new URL(`../../data/sam/${ROUND_3B_BATCH_ID}.json`, import.meta.url),
)

/** [UNCALIBRATED] Seed for the serve-order shuffle. Distinct from every previous round's. */
export const ROUND_3B_SEED = 20260806

const SAMPLE_REPO_PATH = "research/v3/data/sam/mask-quality-3b-sample.json"
const ROUND_1_SAMPLE_REPO_PATH = "research/v3/data/sam/mask-quality-sample.json"

export const ROUND_3B_SELECTION_RULE =
	"Twenty-five SAM masks from `sam-cjk-probe-7`, a 7-cover GPU run of three prompts made specifically " +
	"to close the gap round 3 reported. The finding under test is probe 4's: the prompt \"chinese " +
	"characters\" recalls 4 of 4 CJK covers with zero false positives — and is silent on Korean, Thai " +
	"and Malayalam, so it means THIS SCRIPT and not merely not-Latin — while never scoring above 0.472, " +
	"which is below every cut in force. Probe 4 stored no mask, so no reviewer has ever seen one; this " +
	"round is the first time they are on screen. Three passes: `cjk-script`, its union partner `kanji`, " +
	"and `words` as the INCUMBENT CONTROL, because a new concept is only worth its cost if what the set " +
	"already asks does not catch the same glyphs. Up to three masks per cover per concept, spread from " +
	"that cell's strongest to its weakest, because a category-aware cut needs a boundary to be fitted to " +
	"and a round of best-masks-only would give a sweep nothing to separate. The round is made almost " +
	"entirely of masks every threshold in force DISCARDS: 0 of the run's 18 `cjk-script` regions clear " +
	"the pooled cut of 0.578. What it decides: whether the calibrated cut is category-dependent. If " +
	"these are correct masks, the cut is throwing away a category it was never fitted on and a CJK group " +
	"threshold is justified on evidence; if they are not, A12 closes and the incumbent keeps the field. " +
	"The panel names what the mask CLAIMS, not the prompt: \"chinese characters\" prints as \"Chinese or " +
	"Japanese characters\" because it demonstrably fires on both, and asking the reviewer to reject a " +
	"correct mask on a Japanese cover for being Japanese would measure the label rather than the mask. " +
	"config.CONCEPT_PROMPTS is UNTOUCHED by this run, so every stored run stays reproducible."

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
	for (const extra of [
		"research/v3/oracle/sam/review_round_3b.py",
		"research/v3/oracle/sam/run_cjk_probe.py",
	]) {
		if (!corrected.builtFrom.includes(extra)) corrected.builtFrom.push(extra)
	}
	corrected.selection.rule = ROUND_3B_SELECTION_RULE
	for (const item of corrected.items) {
		if (item.rendition.source === ROUND_1_SAMPLE_REPO_PATH) item.rendition.source = SAMPLE_REPO_PATH
	}
	return corrected as unknown as OracleValidationFixture
}

export async function buildRound3bFixture(): Promise<OracleValidationFixture> {
	const built = await buildSamMaskQualityFixture({
		samplePath: ROUND_3B_SAMPLE_PATH,
		batchId: ROUND_3B_BATCH_ID,
		seed: ROUND_3B_SEED,
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
	const manifest = JSON.parse(await readFile(ROUND_3B_SAMPLE_PATH, "utf8")) as {
		sourceRun: string
		conceptSetHash?: string
		probeConceptSetHash?: string
		selection: { composition: { notes: string[] } }
		silentCoverYield: { imagePath: string; regionsFound: number; recovered: boolean }[]
	}
	const fixture = await buildRound3bFixture()
	process.stdout.write(
		`${fixture.batchId}: ${fixture.items.length} items, ${fixture.questions.length} passes\n` +
			`  source run: ${manifest.sourceRun}\n` +
			`  probe prompt set: ${manifest.probeConceptSetHash?.slice(0, 16) ?? "unknown"}  ` +
			`static set UNCHANGED: ${manifest.conceptSetHash?.slice(0, 16) ?? "unknown"}\n`,
	)
	for (const question of fixture.questions) {
		const count = fixture.items.filter((item) => item.questionKey === question.key).length
		process.stdout.write(`  ${question.key.padEnd(24)} ${String(count).padStart(3)}  ${question.question}\n`)
	}
	for (const entry of manifest.silentCoverYield) {
		process.stdout.write(
			`  SILENT-COVER ${entry.imagePath} n=${entry.regionsFound} ` +
				`${entry.recovered ? "RECOVERED" : "still nothing"}\n`,
		)
	}
	for (const note of manifest.selection.composition.notes) process.stdout.write(`  NOTE ${note}\n`)
	if (values.write) {
		await writeFile(ROUND_3B_FIXTURE_PATH, serializeFixture(fixture))
		process.stdout.write(`wrote ${ROUND_3B_FIXTURE_PATH}\n`)
	}
	if (values.push !== undefined) {
		const pushed = await pushSamMaskQualityRound(values.push, ROUND_3B_FIXTURE_PATH)
		process.stdout.write(`pushed to ${values.push}: ${pushed.status} ${JSON.stringify(pushed.body)}\n`)
	}
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main()
}
