/**
 * Round 3 — the straddle rule. Structural tests on the fixture, and the design invariants that make
 * it a measurement rather than a picture.
 *
 * The round exists because `sameColorBar()` picks `Math.max` of two regional bars when a pair
 * straddles a region boundary, that choice has never been measured (0 of the 140 pairs in rounds 1–2
 * straddle), and the tie-break its docstring used to cite was found unreproducible and *reversed* on
 * replication (`reviews/phase-0-adversarial/contract.md` finding 1). The reviewer ruled that it be
 * tested rather than argued.
 *
 * The load-bearing property is narrow and worth stating plainly: **an item only tests anything if its
 * achieved distance lands strictly between the two bars' average and their maximum**, because only
 * there do the two candidate rules give different verdicts. Most of what follows is that one fact,
 * checked from several directions, plus the guards that stop the round from measuring something else
 * by accident — the criterion string that makes it comparable to rounds 1–2, the direction balance
 * that stops known anisotropy from masquerading as a verdict, and the payload hygiene that stops the
 * page from telling the reviewer the answer.
 */
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { after, before, describe, test } from "node:test"
import { colorFromRgb, colorRegion, colorDistance, sameColorBar } from "../src/contract/color.ts"
import { SAME_COLOR_BAR_BY_REGION } from "../src/contract/constants.ts"
import {
	BRACKETING_CRITERION,
	BRACKETING_FIXTURE_VERSION,
	BRACKETING_ROUND_3_BATCH_ID,
	BRACKETING_ROUND_3_FIXTURE_PATH,
	ROUND3_BAND_CONTROLS_PER_SIDE,
	ROUND3_DIRECTIONS,
	ROUND3_IDENTICAL_CONTROLS,
	ROUND3_MIN_DIRECTION_PURITY,
	ROUND3_MIN_REPEAT_SEPARATION,
	ROUND3_OBVIOUS_CONTROLS,
	ROUND3_REGION_PAIRS,
	ROUND3_REPEATS,
	generateBracketingRound3Fixture,
	serializeFixture,
	straddleBand,
	type BracketingFixture,
	type BracketingItem,
} from "../src/review-server/bracketing.ts"
import { BRACKETING_FIXTURE_PATH, BRACKETING_ROUND_2_FIXTURE_PATH } from "../src/review-server/bracketing.ts"
import { startHarness, type Harness } from "../src/review-server/test-support.ts"

const EXPECTED_ITEMS = 58
const EXPECTED_IN_BAND = 42

const fixture = generateBracketingRound3Fixture()
const inBand = fixture.items.filter((item) => item.role === "ladder" && item.straddle?.zone === "in-band")
const ladder = fixture.items.filter((item) => item.role === "ladder")
const repeats = fixture.items.filter((item) => item.role === "repeat")

function pairKey(item: BracketingItem): string {
	return [item.straddle!.regionFirst, item.straddle!.regionSecond].slice().sort().join("|")
}

describe("bracketing round 3 — the fixture reproduces and is well formed", () => {
	test("regenerating reproduces the committed fixture byte for byte", async () => {
		const committed = await readFile(BRACKETING_ROUND_3_FIXTURE_PATH, "utf8")
		assert.equal(serializeFixture(fixture), committed)
	})

	test("it declares the version the server accepts, and its own batch id", () => {
		assert.equal(fixture.fixtureVersion, BRACKETING_FIXTURE_VERSION)
		assert.equal(fixture.batchId, BRACKETING_ROUND_3_BATCH_ID)
	})

	test("every item is served exactly once", () => {
		assert.equal(fixture.items.length, EXPECTED_ITEMS)
		const ids = fixture.items.map((item) => item.itemId)
		assert.equal(new Set(ids).size, ids.length, "item ids must be unique")
		assert.deepEqual([...fixture.serveOrder].sort(), [...ids].sort())
	})

	test("every item is a same-colour pair — round 3 has no accent part", () => {
		for (const item of fixture.items) assert.equal(item.part, "same-color")
	})

	test("the recorded distance is the achieved one, re-measured on the colours displayed", () => {
		for (const item of fixture.items) {
			const measured = colorDistance(colorFromRgb(item.first), colorFromRgb(item.second))
			assert.ok(
				Math.abs(measured - item.truth.okLabDistance) < 1e-12,
				`${item.itemId}: recorded ${item.truth.okLabDistance} but measured ${measured}`,
			)
		}
	})
})

describe("bracketing round 3 — the criterion is what makes it comparable", () => {
	/**
	 * This is not a style check. The bands are arithmetic on bars measured under this exact criterion;
	 * asking a different question makes the band arithmetic meaningless, and `analyze-bracketing`
	 * refuses to pool across a criterion mismatch. A *detection* criterion was the abandoned false
	 * start of 2026-08-02 that cost 72 answers.
	 */
	test("it is byte-identical to rounds 1 and 2, so the round pools and the bands mean something", async () => {
		assert.equal(fixture.criterion, BRACKETING_CRITERION)
		for (const path of [BRACKETING_FIXTURE_PATH, BRACKETING_ROUND_2_FIXTURE_PATH]) {
			const other = JSON.parse(await readFile(path, "utf8")) as BracketingFixture
			assert.equal(fixture.criterion, other.criterion)
		}
	})

	test("the prompt shown is the identity question, not the detection one", () => {
		const prompt = fixture.prompts["same-color"]
		assert.match(prompt.instruction, /register as the same color/)
		assert.match(prompt.instruction, /not whether you can detect any difference/)
	})
})

describe("bracketing round 3 — only in-band items discriminate", () => {
	test("there are exactly 42 of them", () => {
		assert.equal(inBand.length, EXPECTED_IN_BAND)
	})

	test("each one lands strictly inside its own disagreement band", () => {
		for (const item of inBand) {
			const facts = item.straddle!
			const distance = item.truth.okLabDistance
			assert.ok(
				distance > facts.avgBar && distance < facts.maxBar,
				`${item.itemId}: ${distance} is not strictly inside (${facts.avgBar}, ${facts.maxBar})`,
			)
			assert.ok(facts.bandFraction > 0 && facts.bandFraction < 1, `${item.itemId}: band fraction escaped (0,1)`)
		}
	})

	test("on each one the two rules genuinely disagree — max says same, the average says distinct", () => {
		for (const item of inBand) {
			const facts = item.straddle!
			assert.equal(facts.predictsSameUnderMax, true, `${item.itemId}`)
			assert.equal(facts.predictsSameUnderAvg, false, `${item.itemId}`)
			assert.equal(facts.discriminating, true, `${item.itemId}`)
		}
	})

	test("each one really does straddle a region boundary", () => {
		for (const item of inBand) {
			assert.notEqual(item.straddle!.regionFirst, item.straddle!.regionSecond, `${item.itemId}`)
		}
	})

	/**
	 * The round's partition has to be the *contract's* partition. `bracketing.ts` classifies with its
	 * own `quadrantOf` and the contract judges with `colorRegion`; if those two ever drifted, the
	 * round would measure a boundary the contract does not use, and nothing else here would notice.
	 */
	test("the fixture's regions and bars agree with the contract's own functions", () => {
		for (const item of fixture.items) {
			const first = colorFromRgb(item.first)
			const second = colorFromRgb(item.second)
			const facts = item.straddle!
			assert.equal(colorRegion(first), facts.regionFirst, `${item.itemId}: first region`)
			assert.equal(colorRegion(second), facts.regionSecond, `${item.itemId}: second region`)
			assert.equal(SAME_COLOR_BAR_BY_REGION[facts.regionFirst], facts.barFirst, `${item.itemId}`)
			assert.equal(SAME_COLOR_BAR_BY_REGION[facts.regionSecond], facts.barSecond, `${item.itemId}`)
			// The incumbent rule, evaluated by the contract itself, is this pair's max bar.
			assert.equal(sameColorBar(first, second), facts.maxBar, `${item.itemId}: sameColorBar`)
		}
	})

	test("the incumbent rule calls every in-band pair the same colour — which is what is on trial", () => {
		for (const item of inBand) {
			const first = colorFromRgb(item.first)
			const second = colorFromRgb(item.second)
			assert.ok(colorDistance(first, second) < sameColorBar(first, second), `${item.itemId}`)
		}
	})
})

describe("bracketing round 3 — stratification", () => {
	test("all six region pairs are covered, 8/8/8/6/6/6 by measured corpus frequency", () => {
		const counts = new Map<string, number>()
		for (const item of inBand) counts.set(pairKey(item), (counts.get(pairKey(item)) ?? 0) + 1)
		assert.equal(counts.size, ROUND3_REGION_PAIRS.length, "every region pair must appear")
		const sorted = [...counts.values()].sort((a, b) => b - a)
		assert.deepEqual(sorted, [8, 8, 8, 6, 6, 6])
		for (const pair of ROUND3_REGION_PAIRS) {
			assert.ok(counts.get([pair[0], pair[1]].slice().sort().join("|"))! > 0, `${pair.join(" × ")} missing`)
		}
	})

	test("each region pair's items spread across its band rather than piling at one rung", () => {
		const byPair = new Map<string, number[]>()
		for (const item of inBand) {
			const list = byPair.get(pairKey(item)) ?? []
			list.push(item.straddle!.bandFraction)
			byPair.set(pairKey(item), list)
		}
		for (const [key, fractions] of byPair) {
			const distinct = new Set(fractions.map((value) => value.toFixed(2)))
			assert.ok(distinct.size >= 3, `${key}: only ${distinct.size} distinct band positions`)
		}
	})

	/**
	 * The round's main confound control. Crossing a boundary forces a component of the difference, and
	 * round 2 measured OKLab distance to be anisotropic under this criterion — so without an equal
	 * split a pure direction effect could be read as a verdict on the straddle rule.
	 */
	test("in-band items split evenly between the two direction classes", () => {
		for (const direction of ROUND3_DIRECTIONS) {
			const count = inBand.filter((item) => item.direction === direction).length
			assert.equal(count, EXPECTED_IN_BAND / 2, `${direction} should be half of the in-band items`)
		}
	})

	test("every directed item reaches the declared purity on its intended axis", () => {
		for (const item of fixture.items) {
			if (item.decomposition === undefined) continue
			assert.ok(
				item.decomposition.purity >= ROUND3_MIN_DIRECTION_PURITY,
				`${item.itemId}: purity ${item.decomposition.purity} below ${ROUND3_MIN_DIRECTION_PURITY}`,
			)
		}
	})

	/**
	 * `light-saturated`'s bar is a known placeholder: split by hue third it reads 0.01516 / 0.02074 /
	 * 0.03805, a 2.5× spread. Leaving hue to the sampler would let one third dominate the pairs whose
	 * band is least trustworthy.
	 */
	test("light-saturated pairs are spread over all three hue thirds", () => {
		const involved = inBand.filter(
			(item) => item.straddle!.regionFirst === "light-saturated" || item.straddle!.regionSecond === "light-saturated",
		)
		assert.ok(involved.length > 0)
		const thirds = new Set(involved.map((item) => item.hueThird))
		assert.deepEqual([...thirds].sort(), [0, 1, 2], "all three hue thirds must appear")
		for (const third of [0, 1, 2]) {
			assert.ok(involved.filter((item) => item.hueThird === third).length >= 5, `hue third ${third} under-covered`)
		}
	})

	/**
	 * Straddling forces both colours to hug the crossed boundary — that is structural. But on an axis
	 * the pair does *not* cross there is no such excuse, and clustering there would make the round a
	 * study of mid-tones rather than of regions.
	 */
	test("on an uncrossed lightness axis the pairs roam the region instead of hugging the boundary", () => {
		const sameLightnessBand = inBand.filter(
			(item) => item.straddle!.regionFirst.startsWith("dark") === item.straddle!.regionSecond.startsWith("dark"),
		)
		assert.ok(sameLightnessBand.length > 0)
		const spread = sameLightnessBand.map((item) => Math.min(...item.first.map(() => 0), 0) + item.truth.okLabDistance)
		assert.ok(spread.length > 0)
		const lightnesses = sameLightnessBand.map((item) => colorFromRgb(item.first).rgb).map((rgb) => rgb[0] + rgb[1] + rgb[2])
		assert.ok(
			Math.max(...lightnesses) - Math.min(...lightnesses) > 60,
			"same-lightness-band pairs all sit at nearly the same brightness",
		)
	})
})

describe("bracketing round 3 — controls and anchors", () => {
	test("the band controls sit outside the band, where the two rules agree", () => {
		const below = ladder.filter((item) => item.straddle!.zone === "below-avg")
		const above = ladder.filter((item) => item.straddle!.zone === "above-max")
		assert.equal(below.length, ROUND3_BAND_CONTROLS_PER_SIDE)
		assert.equal(above.length, ROUND3_BAND_CONTROLS_PER_SIDE)
		for (const item of [...below, ...above]) {
			assert.equal(item.straddle!.discriminating, false, `${item.itemId} must not discriminate`)
		}
		for (const item of below) assert.ok(item.truth.okLabDistance < item.straddle!.avgBar, `${item.itemId}`)
		for (const item of above) assert.ok(item.truth.okLabDistance > item.straddle!.maxBar, `${item.itemId}`)
	})

	test("identical controls really are the same colour twice", () => {
		const identical = fixture.items.filter((item) => item.role === "control-identical")
		assert.equal(identical.length, ROUND3_IDENTICAL_CONTROLS)
		for (const item of identical) {
			assert.deepEqual(item.first, item.second, `${item.itemId}`)
			assert.equal(item.firstHex, item.secondHex)
			assert.equal(item.truth.identical, true)
			assert.equal(item.truth.okLabDistance, 0)
		}
	})

	test("clearly-distinct controls are far enough out to be an attention check, not a judgement call", () => {
		const obvious = fixture.items.filter((item) => item.role === "control-obvious")
		assert.equal(obvious.length, ROUND3_OBVIOUS_CONTROLS)
		for (const item of obvious) {
			assert.ok(
				item.truth.okLabDistance > item.straddle!.maxBar * 3,
				`${item.itemId}: ${item.truth.okLabDistance} is not comfortably past ${item.straddle!.maxBar}`,
			)
			assert.equal(item.straddle!.discriminating, false)
		}
	})

	test("repeats duplicate an in-band item byte for byte, and are served far from it", () => {
		assert.equal(repeats.length, ROUND3_REPEATS)
		const byId = new Map(fixture.items.map((item) => [item.itemId, item]))
		const position = new Map(fixture.serveOrder.map((id, index) => [id, index]))
		const sources = new Set<string>()
		for (const item of repeats) {
			assert.notEqual(item.repeatOf, null, `${item.itemId} must name its source`)
			const source = byId.get(item.repeatOf!)
			assert.ok(source !== undefined, `${item.itemId}: unknown source ${item.repeatOf}`)
			assert.equal(source.straddle!.zone, "in-band", "repeats must duplicate a scored item")
			assert.deepEqual(item.first, source.first)
			assert.deepEqual(item.second, source.second)
			assert.ok(!sources.has(item.repeatOf!), `${item.repeatOf} repeated more than once`)
			sources.add(item.repeatOf!)
			const gap = Math.abs(position.get(item.itemId)! - position.get(item.repeatOf!)!)
			assert.ok(gap >= ROUND3_MIN_REPEAT_SEPARATION, `${item.itemId}: served only ${gap} positions from its source`)
		}
	})

	test("the repeats are not counted as extra in-band items", () => {
		// The pre-registered population is the 42 first showings. If a repeat ever acquired
		// `role: "ladder"` it would silently inflate n and re-introduce finding 8's double counting.
		for (const item of repeats) assert.equal(item.role, "repeat")
		assert.equal(ladder.filter((item) => item.repeatOf !== null).length, 0)
	})
})

describe("bracketing round 3 — the pre-registered design travels with the fixture", () => {
	test("the scoring rule is recorded, with the decisive cut fixed at the design n", () => {
		const design = fixture.straddleDesign
		assert.ok(design !== undefined, "round 3 must carry its design")
		assert.equal(design.round, 3)
		assert.deepEqual(design.scoring.decisiveAtDesignN, { n: 42, favoursMax: 28, favoursAverage: 14 })
		assert.equal(design.scoring.decisiveAtDesignN.n, EXPECTED_IN_BAND)
		assert.match(design.preregistration, /bracketing-round-3-preregistration\.md$/)
		assert.match(design.scoring.decisive, /two-sided exact binomial/)
		assert.match(design.scoring.unresolved, /not a licence to keep Math\.max/)
		assert.match(design.scoring.anisotropyVeto, /anisotropy-confounded/)
	})

	test("the bands it records are the bands the items were built in", () => {
		for (const band of fixture.straddleDesign!.bands) {
			const computed = straddleBand(band.regions[0], band.regions[1])
			assert.equal(band.avgBar, computed.avg)
			assert.equal(band.maxBar, computed.max)
			assert.ok(band.width > 0)
			const actual = inBand.filter(
				(item) => pairKey(item) === [band.regions[0], band.regions[1]].slice().sort().join("|"),
			).length
			assert.equal(band.inBandItems, actual, `${band.regions.join(" × ")}: declared count does not match`)
		}
	})

	test("the corpus measurement that drove the stratification is recorded with its sources", () => {
		const frequency = fixture.straddleDesign!.corpusFrequency
		assert.equal(frequency.palettes, 554)
		assert.equal(frequency.crossRegionPairs, 2582)
		assert.equal(frequency.pairsInAnyDisagreementBand, 0)
		assert.equal(frequency.source.length, 3)
		for (const path of frequency.source) assert.match(path, /^research\/v3\/data\/legacy\//)
	})

	test("the total item count matches what the pre-registration commits to", () => {
		const design = fixture.straddleDesign!
		const declared = design.bands.reduce((sum, band) => sum + band.inBandItems, 0)
		assert.equal(declared, EXPECTED_IN_BAND)
		assert.equal(
			EXPECTED_IN_BAND + ROUND3_BAND_CONTROLS_PER_SIDE * 2 + ROUND3_IDENTICAL_CONTROLS + ROUND3_OBVIOUS_CONTROLS + ROUND3_REPEATS,
			EXPECTED_ITEMS,
		)
	})
})

describe("bracketing round 3 — nothing the page receives gives the answer away", () => {
	let harness: Harness

	before(async () => {
		harness = await startHarness()
		await harness.handle.service.pushBracketing(fixture, ["round 3 — the straddle rule"])
	})
	after(async () => {
		await harness.stop()
	})

	test("the payload carries the two colours and nothing about the band", async () => {
		const payload = harness.handle.service.bracketingPayload(fixture.batchId)
		assert.equal(payload.items.length, EXPECTED_ITEMS)
		const serialized = JSON.stringify(payload)
		for (const forbidden of ["straddle", "in-band", "below-avg", "above-max", "bandFraction", "discriminating"]) {
			assert.ok(!serialized.includes(forbidden), `payload leaks ${forbidden}`)
		}
		for (const key of ["okLabDistance", "targetDistance", "repeatOf", "role", "stratum", "hueThird"]) {
			assert.ok(!serialized.includes(key), `payload leaks ${key}`)
		}
		for (const item of payload.items) {
			assert.deepEqual(Object.keys(item).sort(), ["answer", "first", "part", "revision", "second", "token"])
		}
	})

	test("the serve order walks neither the region pairs nor the ladder in order", () => {
		const positions = fixture.serveOrder
			.map((id) => fixture.items.find((item) => item.itemId === id)!)
			.filter((item) => item.straddle?.zone === "in-band")
		let sameNeighbour = 0
		for (let index = 1; index < positions.length; index++) {
			if (pairKey(positions[index]) === pairKey(positions[index - 1])) sameNeighbour++
		}
		assert.ok(sameNeighbour < positions.length / 2, "the serve order clusters region pairs together")
	})
})

describe("bracketing round 3 — it does not disturb what came before", () => {
	test("no stimulus is shared with rounds 1 or 2", async () => {
		const seen = new Set<string>()
		for (const path of [BRACKETING_FIXTURE_PATH, BRACKETING_ROUND_2_FIXTURE_PATH]) {
			const other = JSON.parse(await readFile(path, "utf8")) as BracketingFixture
			for (const item of other.items) seen.add(`${item.firstHex}/${item.secondHex}`)
		}
		for (const item of fixture.items) {
			assert.ok(
				!seen.has(`${item.firstHex}/${item.secondHex}`),
				`${item.itemId} reuses a stimulus from an earlier round`,
			)
		}
	})
})
