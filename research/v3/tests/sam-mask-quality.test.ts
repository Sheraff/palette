/**
 * The SAM mask-quality round — `sam-mask-quality-1` (PHASE_0_LOOSE_ENDS.md A5 + A6).
 *
 * The round calibrates a threshold from a human's answers, so it dies in exactly two ways and this
 * file guards both:
 *
 *  - **the reviewer must not be able to see the score.** Every number the round is calibrating
 *    against — score, area fraction, band, and whether a mask was force-included as a suspicious
 *    shape — has to stay out of the fixture, out of the served payload and off the rendered panel.
 *    A reviewer who can read the score is not a second opinion about it.
 *  - **the join back must be exact.** An answer is about one (image, concept, instance) triple, not
 *    about an artwork; two masks from the same cover are two independent items, and if the item's
 *    `imageId` were the artwork they would silently overwrite each other.
 *
 * Named `sam-mask-quality` rather than `review-server-*` on purpose: the review-server workstream
 * owns that test glob, and this round is the oracle workstream's.
 */
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { after, before, describe, it } from "node:test"
import {
	ANALYSIS_VERSION,
	analyze,
	bestPoint,
	candidateThresholds,
	summarize,
	sweep,
	wilson,
	type Judged,
} from "../oracle/sam/analyze-mask-quality.ts"
import { PREMISE_DISAMBIGUATION_FIXTURE_VERSION, serializeFixture, validateFixture } from "../src/review-server/oracle-validation.ts"
import {
	MASK_QUALITY_ANSWERS,
	MASK_QUALITY_INSTRUCTION,
	OVERLAY_COLLECTION,
	SAM_MASK_QUALITY_BATCH_ID,
	SAM_MASK_QUALITY_FIXTURE_PATH,
	SAM_MASK_QUALITY_LABEL_SCHEMA_VERSION,
	SAM_MASK_QUALITY_SEED,
	buildSamMaskQualityFixture,
	questionKeyFor,
	readMaskSample,
	seedSamMaskQualityRound,
	stratifiedShuffle,
} from "../src/review-server/sam-mask-quality.ts"
import { REPO_ROOT } from "../src/review-server/server.ts"
import { readJsonl } from "../src/review-server/store.ts"
import { call, startHarness, type Harness } from "../src/review-server/test-support.ts"
import type { StoredOracleBatch } from "../src/review-server/types.ts"
import type { OracleLabelRecord } from "../src/warehouse/records.ts"

const BATCH = SAM_MASK_QUALITY_BATCH_ID

/**
 * The overlays are PNGs and the repository ignores `*.png`, so they are build products, not commits.
 * Everything below needs them on disk; fail with the command that makes them rather than with sixty
 * confusing hash errors.
 */
const manifest = await readMaskSample()
const missingOverlays = manifest.items.filter((entry) => entry.overlay === null || !existsSync(`${REPO_ROOT}/${entry.overlay.path}`))
assert.equal(
	missingOverlays.length,
	0,
	`${missingOverlays.length} overlays are not on disk. Run: research/v3/oracle/sam/.venv/bin/python research/v3/oracle/sam/review_round.py --write`,
)

const fixture = await buildSamMaskQualityFixture()

/** Everything the reviewer must not be able to read, as it is spelled in each source. */
const ANSWER_KEY_TOKENS = ["score", "areaFraction", "area_fraction", "forcedSuspicious", "band", "0.30-0.45", "0.80+"]

describe("mask-quality sample", () => {
	it("is 60 masks, stratified over four score bands and two concept groups", () => {
		assert.equal(manifest.items.length, 60)
		assert.equal(manifest.batchId, BATCH)
		const cells = new Map<string, number>()
		for (const entry of manifest.items) cells.set(entry.stratum, (cells.get(entry.stratum) ?? 0) + 1)
		assert.equal(cells.size, 8, "every band x group cell must be represented")
		for (const [cell, count] of cells) {
			assert.ok(count >= 5, `${cell} holds only ${count} masks; a cell that thin cannot inform a threshold`)
		}
		// Even allocation, not proportional: no cell may be more than one item off any other.
		const counts = [...cells.values()].sort((a, b) => a - b)
		assert.ok(counts.at(-1)! - counts[0] <= 2, `cell sizes ${counts.join(",")} are not close to even`)
	})

	it("force-includes every suspicious shape and no others", async () => {
		const forced = manifest.items.filter((entry) => entry.forcedSuspicious)
		assert.ok(forced.length > 0, "the hallucination signature has no representative in the round")
		for (const entry of forced) {
			assert.ok(entry.areaFraction > 0.5, `${entry.itemId} is flagged suspicious at area ${entry.areaFraction}`)
			assert.ok(entry.score < 0.5, `${entry.itemId} is flagged suspicious at score ${entry.score}`)
		}
		// And every row in the run that matches the signature is in the sample — the class is too
		// small to survive being sampled from.
		assert.deepEqual(
			forced.map((entry) => entry.maskRowId).sort(),
			(await suspiciousRowsInRun()).sort(),
			"a suspicious shape from the run is missing from the round",
		)
	})

	it("never takes more than two masks from one artwork", () => {
		const perArtwork = new Map<string, number>()
		for (const entry of manifest.items) {
			perArtwork.set(entry.artwork.sha256, (perArtwork.get(entry.artwork.sha256) ?? 0) + 1)
		}
		assert.ok(Math.max(...perArtwork.values()) <= 2)
		assert.ok(perArtwork.size >= 40, "sixty masks from fewer than forty artworks is not sixty independent looks")
	})

	it("is deterministic: rebuilding gives the same sixty masks", async () => {
		assert.deepEqual((await readMaskSample()).items.map((entry) => entry.itemId), manifest.items.map((entry) => entry.itemId))
		// Every overlay on disk is the one the manifest was written against.
		for (const entry of manifest.items) {
			const bytes = await readFile(`${REPO_ROOT}/${entry.overlay!.path}`)
			const { createHash } = await import("node:crypto")
			assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.overlay!.sha256, `${entry.itemId} re-rendered differently`)
		}
	})
})

describe("mask-quality fixture", () => {
	it("is deterministic and matches the committed file", async () => {
		assert.deepEqual(await buildSamMaskQualityFixture(), fixture)
		assert.equal(
			await readFile(SAM_MASK_QUALITY_FIXTURE_PATH, "utf8"),
			serializeFixture(fixture),
			"the committed fixture is not what the generator produces — regenerate with --write",
		)
	})

	it("carries the round's identity", () => {
		assert.equal(fixture.batchId, "sam-mask-quality-1")
		assert.equal(fixture.purpose, "oracle-validation")
		// The server accepts exactly one oracle-validation fixture version; this round rides it.
		assert.equal(fixture.fixtureVersion, PREMISE_DISAMBIGUATION_FIXTURE_VERSION)
		assert.equal(fixture.labelSchemaVersion, SAM_MASK_QUALITY_LABEL_SCHEMA_VERSION)
		assert.equal(fixture.labelSchemaVersion, "sam-mask-quality.v1")
		assert.equal(fixture.seed, SAM_MASK_QUALITY_SEED)
		assert.equal(fixture.items.length, 60)
		assert.doesNotThrow(() => validateFixture(fixture))
	})

	it("serves the overlay, and names the mask row as the item — not the artwork", () => {
		const artworkPaths = new Set(manifest.items.map((entry) => entry.artwork.imagePath))
		for (const item of fixture.items) {
			assert.match(item.imagePath, /^research\/v3\/data\/sam\/review-overlays\/smq-[0-9a-f]{12}\.png$/u)
			assert.ok(!artworkPaths.has(item.imagePath), "the bare artwork must never be the served image")
			assert.equal(item.collection, OVERLAY_COLLECTION)
			// (image, concept, instance) — the join key back into sam-eval-142.jsonl.
			assert.match(item.imageId, /^[0-9a-f]{12}:[a-z-]+:\d+$/u)
			assert.equal(item.rendition.sourceEntryId, item.imageId)
		}
		assert.equal(new Set(fixture.items.map((item) => item.imageId)).size, 60)
		// Two masks off one artwork are two items; if `imageId` were the artwork they would collide.
		const artworkIds = fixture.items.map((item) => item.artworkId)
		assert.ok(new Set(artworkIds).size < artworkIds.length, "the sample should contain at least one artwork twice")
	})

	it("carries no score, area fraction, band or forced flag", () => {
		const text = JSON.stringify({ items: fixture.items, questions: fixture.questions, selection: fixture.selection })
		for (const token of ["areaFraction", "area_fraction", "forcedSuspicious"]) {
			assert.ok(!text.includes(token), `the fixture leaks ${token}`)
		}
		// `stratum` legitimately names the band — it is what per-stratum stopping is keyed on — but it
		// is never served. The payload test below is what actually enforces that.
		for (const item of fixture.items) {
			assert.equal(Object.keys(item).sort().join(","), "artworkId,collection,imageId,imagePath,itemId,questionKey,rendition,sha256,stratum")
		}
	})

	it("asks one question per concept, in contiguous passes, with y / n / p", () => {
		const concepts = [...new Set(manifest.items.map((entry) => entry.concept))]
		assert.equal(fixture.questions.length, concepts.length)
		for (const question of fixture.questions) {
			assert.equal(question.kind, "enum", "three answers cannot be a boolean question")
			assert.deepEqual(
				question.answers.map((answer) => [answer.hotkey, answer.key]),
				[
					["y", "yes"],
					["n", "no"],
					["p", "partly"],
				],
			)
			// `u` stays free, so the page keeps undo on `u` instead of moving it to Backspace.
			assert.ok(!question.answers.some((answer) => answer.hotkey === "u"))
			assert.equal(question.instruction, MASK_QUALITY_INSTRUCTION)
			assert.match(question.instruction, /not wrong for having missed something/u)
			assert.ok((question.preamble ?? "").length > 0)
			assert.ok((question.framing ?? "").length > 0)
			// The concept is named in the stem — that is why there is a question per concept.
			const concept = question.key.replace("mask_correct.", "")
			const phrase = manifest.items.find((entry) => entry.concept === concept)!.conceptPhrase
			assert.equal(question.question, `Is this a correct "${phrase}" mask?`)
		}
		const order = fixture.serveOrder.map((id) => fixture.items.find((item) => item.itemId === id)!.questionKey)
		const runs: string[] = []
		for (const key of order) if (runs.at(-1) !== key) runs.push(key)
		assert.equal(new Set(runs).size, runs.length, "the passes must be contiguous")
		assert.deepEqual(runs, fixture.questions.map((question) => question.key))
	})

	it("interleaves the score bands inside each pass", () => {
		const byId = new Map(fixture.items.map((item) => [item.itemId, item]))
		for (const question of fixture.questions) {
			const pass = fixture.serveOrder.filter((id) => byId.get(id)!.questionKey === question.key)
			if (pass.length < 4) continue
			const strata = pass.map((id) => byId.get(id)!.stratum)
			let longestRun = 1
			let run = 1
			for (let index = 1; index < strata.length; index++) {
				run = strata[index] === strata[index - 1] ? run + 1 : 1
				longestRun = Math.max(longestRun, run)
			}
			// The pass holds at most four strata, so a stratified shuffle can never stack three.
			assert.ok(longestRun <= 2, `${question.key} serves ${longestRun} of one band back to back`)
		}
	})

	it("stratifiedShuffle is seeded and spreads the strata", () => {
		const items = Array.from({ length: 12 }, (_, index) => ({ itemId: `i${index}`, stratum: `s${index % 3}` }))
		const seededA = stratifiedShuffle(items, mulberry(1)).map((item) => item.itemId)
		const seededB = stratifiedShuffle(items, mulberry(1)).map((item) => item.itemId)
		assert.deepEqual(seededA, seededB, "the same seed must give the same order")
		assert.notDeepEqual(seededA, stratifiedShuffle(items, mulberry(2)).map((item) => item.itemId))
		assert.equal(new Set(seededA).size, 12)
	})
})

describe("mask-quality round in the review server", () => {
	let harness: Harness
	let stored: StoredOracleBatch

	before(async () => {
		harness = await startHarness()
		assert.equal(await seedSamMaskQualityRound(harness.handle.service), BATCH)
		stored = (await readJsonl<StoredOracleBatch>(harness.batchLogPath))[0] as StoredOracleBatch
	})

	after(async () => {
		await harness?.stop()
	})

	it("serves sixty overlays in pass order and nothing else", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		assert.equal(payload.status, 200)
		assert.equal(payload.body.items.length, 60)
		assert.equal(payload.body.questions.length, fixture.questions.length)
		assert.deepEqual(
			payload.body.items.map((item: any) => stored.answerTokens[item.token]),
			[...fixture.serveOrder],
		)
		for (const item of payload.body.items) {
			assert.match(item.media, /^\/media\//u)
			assert.ok(item.width > 0 && item.height > 0)
		}
	})

	it("leaks no score, no band and no item id to the browser", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		const text = JSON.stringify(payload.body)
		for (const token of ANSWER_KEY_TOKENS) assert.ok(!text.includes(token), `the payload leaks ${token}`)
		for (const item of fixture.items) {
			assert.ok(!text.includes(item.itemId), `the payload leaks the item id ${item.itemId}`)
			assert.ok(!text.includes(item.imageId), `the payload leaks the mask row id ${item.imageId}`)
			assert.ok(!text.includes(item.sha256), `the payload leaks the overlay hash ${item.sha256}`)
		}
	})

	it("serves the overlay bytes as a PNG", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		const response = await fetch(`${harness.base}${payload.body.items[0].media}`)
		assert.equal(response.status, 200)
		assert.equal(response.headers.get("content-type"), "image/png")
		assert.ok(Number(response.headers.get("content-length")) > 1000)
	})

	it("records an answer as an oracle-label keyed by the mask row", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		const first = payload.body.items[0]
		const itemId = stored.answerTokens[first.token]
		const item = fixture.items.find((entry) => entry.itemId === itemId)!
		const put = await call(harness.base, "PUT", `/api/oracle-validation/${BATCH}/items/${first.token}/answer`, { answer: "partly" })
		assert.equal(put.status, 200)
		const label = harness.records().find((record) => record.type === "oracle-label") as OracleLabelRecord
		assert.equal(label.labelSchemaVersion, "sam-mask-quality.v1")
		assert.equal(label.questionKey, item.questionKey)
		assert.equal(label.questionKey, questionKeyFor(item.imageId.split(":")[1]))
		assert.equal(label.imageId, item.imageId)
		assert.equal(label.stratum, item.stratum)
		assert.equal(label.answer, "partly")
		assert.equal(label.author.kind, "human")
		assert.equal(label.batch?.purpose, "oracle-validation")
	})

	it("refuses an answer outside the vocabulary", async () => {
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		const rejected = await call(harness.base, "PUT", `/api/oracle-validation/${BATCH}/items/${payload.body.items[1].token}/answer`, {
			answer: "unsure",
		})
		assert.equal(rejected.status, 400)
		assert.match(JSON.stringify(rejected.body), /yes \| no \| partly/u)
	})
})

describe("mask-quality analysis", () => {
	let harness: Harness

	/**
	 * A synthetic reviewer whose opinion is a clean function of the score, so the sweep has a right
	 * answer to find. Anything at or above the cut is `yes`, the two masks just below it are
	 * `partly`, everything else is `no`.
	 */
	const SYNTHETIC_CUT = 0.62

	before(async () => {
		harness = await startHarness()
		await seedSamMaskQualityRound(harness.handle.service)
		const payload = await call(harness.base, "GET", `/api/oracle-validation/${BATCH}`)
		const stored = (await readJsonl<StoredOracleBatch>(harness.batchLogPath))[0] as StoredOracleBatch
		const scoreOf = new Map(manifest.items.map((entry) => [entry.itemId, entry.score]))
		for (const item of payload.body.items) {
			const score = scoreOf.get(stored.answerTokens[item.token])!
			const answer = score >= SYNTHETIC_CUT ? "yes" : score >= SYNTHETIC_CUT - 0.03 ? "partly" : "no"
			const put = await call(harness.base, "PUT", `/api/oracle-validation/${BATCH}/items/${item.token}/answer`, { answer })
			assert.equal(put.status, 200)
		}
		const released = await call(harness.base, "POST", `/api/batches/${BATCH}/release`, { note: "synthetic" })
		assert.ok(released.status === 200 || released.status === 201, `release replied ${released.status}`)
	})

	after(async () => {
		await harness?.stop()
	})

	it("finds the threshold the synthetic reviewer used", async () => {
		const analysis: any = await analyze({ warehousePath: harness.warehousePath })
		assert.equal(analysis.analysisVersion, ANALYSIS_VERSION)
		assert.equal(analysis.coverage.answered, 60)
		assert.deepEqual(analysis.coverage.unanswered, [])
		const recommended = analysis.recommendation.scoreThreshold
		const value = typeof recommended === "number" ? recommended : Math.min(...(Object.values(recommended) as number[]))
		// Every threshold in (highest `no`, lowest `yes`] separates perfectly, so the recommendation
		// must land in that window — and, by the tie-break, at its bottom. That the window's bottom
		// sits below the synthetic cut is the tie-break working: the scores in between belong to
		// `partly` masks, which the primary treatment does not score either way.
		const scores = new Map(manifest.items.map((entry) => [entry.itemId, entry.score]))
		const highestNo = Math.max(...manifest.items.filter((entry) => entry.score < SYNTHETIC_CUT - 0.03).map((entry) => entry.score))
		const lowestYes = Math.min(...manifest.items.filter((entry) => entry.score >= SYNTHETIC_CUT).map((entry) => entry.score))
		assert.ok(value > highestNo, `recommended ${value} keeps a mask the reviewer rejected (highest no is ${highestNo})`)
		assert.ok(value <= lowestYes, `recommended ${value} drops a mask the reviewer accepted (lowest yes is ${lowestYes})`)
		assert.equal(value, Math.min(...[...scores.values()].filter((score) => score > highestNo)), "the tie must go to the lowest separating threshold")
		assert.equal(analysis.recommendation.pooled.youdenJ, 1, "a perfectly separable reviewer must score J = 1")
		assert.equal(analysis.recommendation.pooled.keptFalsePositive, 0)
		assert.equal(analysis.recommendation.pooled.droppedFalseNegative, 0)
	})

	it("reports partly separately and says whether it changes the answer", async () => {
		const analysis: any = await analyze({ warehousePath: harness.warehousePath })
		const treatments = new Map(analysis.recommendation.sensitivityToPartly.map((entry: any) => [entry.treatment, entry.threshold]))
		assert.equal(treatments.size, 3)
		// `partly` sits just under the cut here, so folding it in as positive must lower the threshold
		// and folding it in as negative must not raise it. The point is that the round can tell.
		assert.ok((treatments.get("positive") as number) <= (treatments.get("excluded") as number))
		const bandTotals = analysis.perBand.reduce((sum: number, entry: any) => sum + entry.answered, 0)
		assert.equal(bandTotals, 60)
		for (const band of analysis.perBand) {
			assert.equal(band.tally.yes + band.tally.no + band.tally.partly + band.tally.other, band.answered)
		}
	})

	it("states the hallucination class's fate explicitly", async () => {
		const analysis: any = await analyze({ warehousePath: harness.warehousePath })
		assert.equal(analysis.hallucination.inSample, manifest.items.filter((entry) => entry.forcedSuspicious).length)
		assert.ok(analysis.hallucination.verdict.length > 0)
		// Every forced shape scores below 0.5 and the synthetic cut is 0.62, so all of them are
		// rejected and all of them are dropped: the verdict must say so, not stay vague.
		assert.equal(analysis.hallucination.survivingTheRecommendedThreshold, 0)
		assert.match(analysis.hallucination.verdict, /drops every rejected suspicious shape/u)
		for (const entry of analysis.hallucination.answered) assert.equal(entry.droppedByRecommendedThreshold, true)
	})

	it("names every concept, with its share of the run", async () => {
		const analysis: any = await analyze({ warehousePath: harness.warehousePath })
		assert.equal(analysis.perConcept.length, new Set(manifest.items.map((entry) => entry.concept)).size)
		for (const entry of analysis.perConcept) {
			assert.ok(entry.populationInRun >= entry.answered, `${entry.concept} claims a population smaller than the sample`)
		}
		const summary = summarize(analysis)
		assert.match(summary, /RECOMMENDED SCORE_THRESHOLD/u)
		assert.match(summary, /HALLUCINATION CLASS/u)
		assert.match(summary, /loose end A5/u)
		// The summary is read by a human beside the reviewer; it must not be a wall of JSON.
		assert.ok(summary.split("\n").length < 120)
	})
})

describe("mask-quality statistics", () => {
	const rows = (values: readonly [number, string][]): Judged[] =>
		values.map(([score, answer], index) => ({
			itemId: `i${index}`,
			maskRowId: `m${index}`,
			concept: "letter",
			group: "text_like",
			band: "0.60-0.80",
			score,
			areaFraction: 0.01,
			forcedSuspicious: false,
			answer,
			weight: 1,
			artworkPath: "00/x.jpg",
		}))

	it("sweeps every observed score plus the floor and one past the top", () => {
		const thresholds = candidateThresholds(rows([[0.4, "yes"], [0.7, "no"]]), 0.3)
		assert.deepEqual(thresholds.slice(0, 3), [0.3, 0.4, 0.7])
		assert.ok(thresholds.at(-1)! > 0.7)
	})

	it("prefers the lower threshold when two are equally good", () => {
		// A gap with nothing in it: 0.5 and 0.6 both separate perfectly, and the cheap mistake wins.
		const points = sweep(rows([[0.4, "no"], [0.45, "no"], [0.6, "yes"], [0.9, "yes"]]), 0.3, "excluded", false)
		const best = bestPoint(points)!
		assert.equal(best.youdenJ, 1)
		assert.equal(best.threshold, 0.6, "the tie must go to the lowest threshold that still separates")
	})

	it("never scores `partly` in the primary treatment, but always counts it", () => {
		const points = sweep(rows([[0.4, "partly"], [0.8, "yes"]]), 0.3, "excluded", false)
		const at = points.find((point) => point.threshold === 0.8)!
		assert.equal(at.keptTruePositive, 1)
		assert.equal(at.keptFalsePositive, 0)
		assert.equal(at.partlyKept, 0)
		assert.equal(at.partlyDropped, 1)
	})

	it("computes a Wilson interval that contains the point estimate", () => {
		const interval = wilson(8, 10)!
		assert.ok(interval.low < 0.8 && interval.high > 0.8)
		assert.equal(wilson(0, 0), null)
	})
})

/* --------------------------------------------------------------------------------------------- */

/** The suspicious rows in the run itself, recomputed here so the sample cannot define its own bar. */
async function suspiciousRowsInRun(): Promise<string[]> {
	const text = await readFile(`${REPO_ROOT}/research/v3/data/sam/${manifest.sourceRun}.jsonl`, "utf8")
	const out: string[] = []
	for (const line of text.split("\n")) {
		const trimmed = line.trim()
		if (trimmed.length === 0) continue
		const row = JSON.parse(trimmed) as any
		if (row.record_type !== "region") continue
		if (row.area_fraction > 0.5 && row.score < 0.5) out.push(`${row.image_sha256.slice(0, 12)}:${row.concept}:${row.instance_idx}`)
	}
	return out
}

/** A local copy of the fixture's PRNG, so the shuffle test does not depend on the contract module. */
function mulberry(seed: number): () => number {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}
