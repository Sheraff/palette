/**
 * Perception round 4 — the fixture, the wording, and the page **executing**.
 *
 * Three kinds of assertion live here, and the middle one is the reason the file is long.
 *
 * 1. **The design.** Item counts per arm, the balance properties each arm's fit depends on, and the
 *    construction invariants (isoluminance, purity, disagreement, margins). A round whose arms are
 *    not balanced the way its pre-registration says produces a number about something else.
 * 2. **The wording.** This round asks two questions of one reviewer in one sitting and pools each
 *    with a different earlier round. The identity wording is compared **byte for byte against the
 *    round-3 fixture on disk** — not against a constant in the same file, which would only prove the
 *    file agrees with itself — and the accent wording is checked to extend `accent-real-1`'s served
 *    text with the clarification that governed its scored answers, clause by clause.
 * 3. **The page, running.** `verify-live` establishes that a module is SERVED. It cannot establish
 *    that the module RUNS: `/freetext` shipped with a key handler that could never fire and 16 green
 *    server tests said nothing. So the page module is imported against a live harness and driven by
 *    keystrokes, every item is stepped through, and every drawn class is checked against a rule that
 *    really exists in `styles.css`.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import { okLabDistance, rgbToOkLab } from "../src/contract/color.ts"
import { SAME_COLOR_BAR_BY_REGION } from "../src/contract/constants.ts"
import {
	ACCENT_CLARIFICATION,
	ACCENT_PROMPT,
	ARM_A_ITEMS,
	ARM_A_MIN_DOMINANCE,
	ARM_A_MIN_MARGIN,
	ARM_B_DIRECTIONS,
	ARM_B_MIN_PURITY,
	ARM_B_REGION,
	ARM_B_RUNGS,
	ARM_C_ISO_ITEMS,
	ARM_C_NONISO_ITEMS,
	ARM_C_NONISO_MIN_DELTA_Y,
	buildPerception4Fixture,
	IDENTITY_ANSWERS,
	IDENTITY_PROMPT,
	PERCEPTION_4_BATCH_ID,
	PERCEPTION_4_FIXTURE_PATH,
	PERCEPTION_4_LABEL_SCHEMA_VERSION,
	PERCEPTION_4_TOTAL_ITEMS,
	serializeFixture,
} from "../src/review-server/perception-4.ts"
import { ACCENT_REAL_MAX_DELTA_Y, ACCENT_REAL_PROMPT } from "../src/review-server/accent-real.ts"
import { BRACKETING_ROUND_3_FIXTURE_PATH, PART_PROMPTS } from "../src/review-server/bracketing.ts"
import { auditRoundPayload, ITEM_FIELD_ALLOWLIST } from "../src/review-server/round-kit.ts"
import { batchReviewPaths } from "../src/review-server/server.ts"
import { call, openPage, startHarness, type FakePage, type Harness } from "../src/review-server/test-support.ts"

const PAGE = fileURLToPath(new URL("../review-ui/perception-4.js", import.meta.url))
const MARKUP = fileURLToPath(new URL("../review-ui/perception-4.html", import.meta.url))
const STYLESHEET = fileURLToPath(new URL("../review-ui/styles.css", import.meta.url))

/**
 * Every class name the stylesheet defines a rule for.
 *
 * The harness has no CSS engine, so a class that matches no rule renders identically here and
 * catastrophically in the browser.
 */
const STYLED_CLASSES = new Set(
	[...readFileSync(STYLESHEET, "utf8").matchAll(/\.([a-zA-Z][\w-]*)/gu)].map((match) => match[1]),
)

const NODE_IDS = [
	"preamble",
	"question",
	"instruction",
	"progress",
	"stage",
	"notebox",
	"noteinput",
	"notemark",
	"itemref",
	"mapping",
	"pending",
	"status",
	"keymap",
] as const

const built = await buildPerception4Fixture()
const truth = built.truth.items
const armA = truth.filter((item) => item.role === "arm-a")
const armB = truth.filter((item) => item.role === "arm-b")
const armCIso = truth.filter((item) => item.role === "arm-c-isoluminant")
const armCNon = truth.filter((item) => item.role === "arm-c-non-isoluminant")

const tally = <T>(rows: readonly T[], key: (row: T) => string): Record<string, number> => {
	const counts: Record<string, number> = {}
	for (const row of rows) counts[key(row)] = (counts[key(row)] ?? 0) + 1
	return counts
}

describe("the round-4 design, as PERCEPTION_MODEL_STUDY.md PART 2 sized it", () => {
	it("is the FULL 148, not the 78-item fallback", () => {
		assert.equal(built.fixture.items.length, 148)
		assert.equal(built.fixture.items.length, PERCEPTION_4_TOTAL_ITEMS)
		const counts = built.fixture.selection.counts
		assert.equal(counts.armA, ARM_A_ITEMS, "arm A is not 40 discriminating identity items")
		assert.equal(counts.armB, ARM_B_RUNGS * ARM_B_DIRECTIONS.length, "arm B is not 3 ladders of 12")
		assert.equal(counts.armCIsoluminant, ARM_C_ISO_ITEMS, "arm C's isoluminant ladder is not 36")
		assert.equal(counts.armCNonIsoluminant, ARM_C_NONISO_ITEMS, "the non-isoluminant stratum is not 24")
		assert.equal(counts.armCIsoluminant + counts.armCNonIsoluminant, 60, "arm C is not 60 accent items")
		assert.equal(counts.controlIdentical, 3, "there are not 3 identical attention checks")
		assert.equal(counts.controlObvious, 3, "there are not 3 obvious attention checks")
		assert.equal(counts.repeats, 6, "there are not 6 silent repeats")
	})

	it("splits its items between the two stimulus kinds the way the arms require", () => {
		assert.equal(built.fixture.selection.counts.identityItems, 84)
		assert.equal(built.fixture.selection.counts.accentItems, 64)
		assert.equal(
			truth.filter((item) => item.stimulus === "pair").length,
			built.fixture.selection.counts.identityItems,
			"an identity item is drawn as something other than a patch pair",
		)
		assert.equal(
			truth.filter((item) => item.stimulus === "mock").length,
			built.fixture.selection.counts.accentItems,
			"an accent item is drawn as something other than the mock player",
		)
	})
})

describe("arm A — every item is a place where the two rules disagree", () => {
	it("puts all 40 items where exactly one rule can be right", () => {
		assert.equal(armA.length, 40)
		for (const item of armA) {
			const rules = item.identity!.rules!
			assert.ok(rules.rulesDisagree, `${item.itemId} is not a disagreement item`)
			assert.equal(rules.okLabSaysSame, !rules.ictcpSaysSame)
		}
	})

	it("balances 20/20 on which rule says 'same', so the binomial is against p = 0.5", () => {
		assert.deepEqual(tally(armA, (item) => item.identity!.disagreement!), {
			"ictcp-says-same": 20,
			"oklab-says-same": 20,
		})
	})

	it("balances 20/20 on dominant direction, which is what the anisotropy veto reads", () => {
		// Round 3 returned `anisotropy-confounded` on exactly this split. An arm that could not compute
		// the veto would have no way to notice the same thing happening again.
		assert.deepEqual(tally(armA, (item) => item.identity!.dominantDirection), { chroma: 20, lightness: 20 })
		assert.deepEqual(
			tally(armA, (item) => `${item.identity!.disagreement}|${item.identity!.dominantDirection}`),
			{
				"ictcp-says-same|chroma": 10,
				"ictcp-says-same|lightness": 10,
				"oklab-says-same|chroma": 10,
				"oklab-says-same|lightness": 10,
			},
			"the veto's 2x2 is not square, so a direction effect could hide inside the rule effect",
		)
	})

	it("spreads evenly over the four contract regions, both colours inside one region", () => {
		assert.deepEqual(tally(armA, (item) => item.identity!.region), {
			"dark-neutral": 10,
			"dark-saturated": 10,
			"light-neutral": 10,
			"light-saturated": 10,
		})
		for (const item of armA) {
			assert.equal(
				item.identity!.regionFirst,
				item.identity!.regionSecond,
				`${item.itemId} straddles two regions — that is round 3's question, not this one`,
			)
		}
	})

	it("keeps every item clear of both thresholds, so nothing discriminates on rounding", () => {
		for (const item of armA) {
			const rules = item.identity!.rules!
			const okMargin = Math.abs(rules.okLabDistance - rules.okLabBar) / rules.okLabBar
			const ictcpMargin = Math.abs(rules.ictcpDistance - rules.ictcpThreshold) / rules.ictcpThreshold
			assert.ok(okMargin >= ARM_A_MIN_MARGIN, `${item.itemId} sits ${okMargin.toFixed(4)} from the OKLab bar`)
			assert.ok(ictcpMargin >= ARM_A_MIN_MARGIN, `${item.itemId} sits ${ictcpMargin.toFixed(4)} from the ICtCp bar`)
			assert.ok(
				item.identity!.dominance >= ARM_A_MIN_DOMINANCE,
				`${item.itemId} is only ${item.identity!.dominance.toFixed(2)} along its nominal direction`,
			)
		}
	})

	it("measures the incumbent with the contract's own bars, not a re-derivation", () => {
		for (const item of armA) {
			const rules = item.identity!.rules!
			assert.equal(
				rules.okLabBar,
				SAME_COLOR_BAR_BY_REGION[item.identity!.region as keyof typeof SAME_COLOR_BAR_BY_REGION],
				`${item.itemId} was placed against a bar that is not the committed one`,
			)
		}
	})
})

describe("arm B — three pure-direction ladders inside one region", () => {
	it("runs 12 rungs in each of the three directions", () => {
		assert.deepEqual(tally(armB, (item) => item.identity!.ladderDirection!), {
			chroma: 12,
			hue: 12,
			lightness: 12,
		})
	})

	it("stays inside dark-neutral on both colours of every pair", () => {
		// The region with the tightest bar and the best existing coverage. A ladder that wandered out
		// of it would be estimating a mixture of two regions' thresholds.
		for (const item of armB) {
			assert.equal(item.identity!.regionFirst, ARM_B_REGION, `${item.itemId}'s first colour left the region`)
			assert.equal(item.identity!.regionSecond, ARM_B_REGION, `${item.itemId}'s second colour left the region`)
		}
	})

	it("keeps every rung pure along its own axis", () => {
		for (const item of armB) {
			const identity = item.identity!
			const along =
				identity.ladderDirection === "lightness"
					? identity.lightnessDelta
					: identity.ladderDirection === "chroma"
						? identity.chromaDelta
						: identity.hueDelta
			assert.ok(
				along / identity.okLabDistance >= ARM_B_MIN_PURITY,
				`${item.itemId} is only ${(along / identity.okLabDistance).toFixed(3)} along ${identity.ladderDirection}`,
			)
		}
	})

	it("climbs monotonically in each direction, so it is a ladder and not a scatter", () => {
		for (const direction of ARM_B_DIRECTIONS) {
			const rungs = armB
				.filter((item) => item.identity!.ladderDirection === direction)
				.sort((left, right) => left.identity!.rung! - right.identity!.rung!)
				.map((item) => item.identity!.okLabDistance)
			for (let at = 1; at < rungs.length; at++) {
				assert.ok(rungs[at] > rungs[at - 1], `the ${direction} ladder is not increasing at rung ${at}`)
			}
			assert.ok(rungs.at(-1)! / rungs[0] > 5, `the ${direction} ladder spans less than 5x, which cannot bracket`)
		}
	})
})

describe("arm C — hue-crossed accents, and the stratum the lightness axis has never had", () => {
	it("crosses the three accent hue thirds exactly, in both strata", () => {
		// The hue third is the stratification variable — the quantity accent-real-1 found a 2x spread
		// across, and the reason this arm exists. It is the one dimension the generator never relaxes.
		assert.deepEqual(tally(armCIso, (item) => String(item.accent!.hueThird)), { "0": 12, "1": 12, "2": 12 })
		assert.deepEqual(tally(armCNon, (item) => String(item.accent!.hueThird)), { "0": 8, "1": 8, "2": 8 })
	})

	it("keeps the isoluminant ladder isoluminant, on the finished 8-bit pair", () => {
		for (const item of armCIso) {
			assert.ok(
				Math.abs(item.accent!.governing.deltaApcaY) <= ACCENT_REAL_MAX_DELTA_Y,
				`${item.itemId} carries dY ${item.accent!.governing.deltaApcaY}`,
			)
			assert.equal(item.accent!.governing.apcaLc, 0, `${item.itemId} is not at APCA Lc 0`)
		}
	})

	it("keeps the non-isoluminant stratum a full four times clear of the isoluminant ceiling", () => {
		// The two strata are never pooled, so no item may be ambiguous about which one it belongs to.
		for (const item of armCNon) {
			assert.ok(
				Math.abs(item.accent!.governing.deltaApcaY) >= ARM_C_NONISO_MIN_DELTA_Y,
				`${item.itemId} carries dY ${item.accent!.governing.deltaApcaY}, which is not non-isoluminant`,
			)
		}
		assert.deepEqual(
			tally(armCNon, (item) => `${item.accent!.lightnessShare}|${item.accent!.lightnessSign}`),
			{ "0.45|-1": 6, "0.45|1": 6, "0.8|-1": 6, "0.8|1": 6 },
			"the lightness crossing is not balanced, so a lightness weight could not be told from a sign",
		)
	})

	it("actually moves along the lightness axis — the point of the whole stratum", () => {
		// PART 2: with every accent isoluminant, "the lightness axis of the functional threshold is not
		// merely unmeasured, it is unmeasurable from the existing data". These are the first samples.
		const lightnessDeltas = armCNon.map((item) =>
			Math.sqrt(
				Math.max(0, item.accent!.governing.okLabDistance ** 2 - item.accent!.governing.chromaDistance ** 2),
			),
		)
		assert.ok(Math.min(...lightnessDeltas) > 0.03, "the smallest lightness step is too small to identify a weight")
		assert.ok(Math.max(...lightnessDeltas) / Math.min(...lightnessDeltas) > 3, "the lightness steps do not span a range")
	})

	it("never lets an accent become a second foreground", () => {
		// B31 — the foreground/accent bar — is a different open question with a different stimulus, and
		// it is explicitly NOT in this round. An item answered 'no' because the accent had become a
		// second foreground would be evidence about B31 filed under arm C.
		for (const item of [...armCIso, ...armCNon]) {
			const foreground = item.accent!.placementProfile.find((pair) => pair.fieldRole === "foreground")
			assert.ok(foreground !== undefined, `${item.itemId} has no foreground reading`)
			assert.ok(foreground.okLabDistance >= 0.07444, `${item.itemId}'s accent is ${foreground.okLabDistance} from the foreground`)
		}
	})
})

describe("the wording — the load-bearing guarantee of the whole round", () => {
	it("carries the identity question BYTE-IDENTICALLY from the round-3 fixture on disk", async () => {
		// Against the FIXTURE, not against the constant: comparing a constant to itself proves the file
		// agrees with the file. The 184 answers this round pools with were recorded under the words in
		// that JSON, and those are the words that have to match.
		const round3 = JSON.parse(await readFile(BRACKETING_ROUND_3_FIXTURE_PATH, "utf8")) as {
			prompts: Record<string, { question: string; instruction: string }>
		}
		assert.equal(IDENTITY_PROMPT.question, round3.prompts["same-color"].question)
		assert.equal(IDENTITY_PROMPT.instruction, round3.prompts["same-color"].instruction)
		assert.equal(IDENTITY_PROMPT.question, PART_PROMPTS["same-color"].question)
		assert.equal(IDENTITY_PROMPT.instruction, PART_PROMPTS["same-color"].instruction)

		const identityQuestions = built.fixture.questions.filter((question) => question.question === IDENTITY_PROMPT.question)
		assert.equal(identityQuestions.length, 84, "not every identity item asks the identity question")
		for (const question of identityQuestions) {
			assert.equal(question.instruction, round3.prompts["same-color"].instruction, "an identity item's instruction drifted")
		}
	})

	it("extends the accent instruction with the clarification, and says so by construction", () => {
		// Not byte-identical, and it must not claim to be. The served text is accent-real-1's, unchanged,
		// FOLLOWED BY the clarification that governed accent-real-1's scored answers.
		assert.equal(ACCENT_PROMPT.question, ACCENT_REAL_PROMPT.question, "the accent stem moved")
		assert.ok(
			ACCENT_PROMPT.instruction.startsWith(ACCENT_REAL_PROMPT.instruction),
			"the served accent instruction no longer opens with accent-real-1's own words",
		)
		assert.equal(ACCENT_PROMPT.instruction, `${ACCENT_REAL_PROMPT.instruction} ${ACCENT_CLARIFICATION}`)
		assert.notEqual(ACCENT_PROMPT.instruction, ACCENT_REAL_PROMPT.instruction)
	})

	it("puts all four clauses of the clarification on screen, verbatim", () => {
		// These four are what the reviewer was told this round would ask. Each is asserted as a literal
		// substring rather than by keyword, because a paraphrase of an exclusion is a different exclusion.
		for (const clause of [
			"judge only whether the accent elements are findable at a glance as the highlights",
			"yes even if the colour looks wrong for the artwork",
			"ignore the foreground relation",
			"hunting = no",
		]) {
			assert.ok(ACCENT_CLARIFICATION.includes(clause), `the clarification does not contain "${clause}"`)
			for (const question of built.fixture.questions.filter((entry) => entry.question === ACCENT_PROMPT.question)) {
				assert.ok(question.instruction.includes(clause), `an accent item's instruction is missing "${clause}"`)
			}
		}
	})

	it("gives BOTH question kinds the escape answer, on the same three keys", () => {
		for (const question of built.fixture.questions) {
			assert.equal(question.kind, "enum")
			assert.deepEqual(
				question.answers.map((answer) => answer.hotkey),
				["1", "2", "3"],
				`${question.key} does not bind the round's one answer vocabulary`,
			)
			assert.equal(question.answers.at(-1)!.key, "cant_tell", `${question.key} offers no escape`)
		}
		assert.equal(IDENTITY_ANSWERS.at(-1)!.key, "cant_tell")
	})

	it("labels the stimulus type on every item, on both kinds", () => {
		const preambles = new Set(built.fixture.questions.map((question) => question.preamble))
		assert.deepEqual([...preambles].sort(), ["Colour-patch pair.", "Player mock, real cover."])
		for (const question of built.fixture.questions) {
			assert.ok(question.preamble !== undefined && question.preamble.length > 0, `${question.key} has no type label`)
			// The label names the STIMULUS. Criterion content in the preamble would be criterion content
			// added to the identity question, which is the one thing that has to stay byte-identical.
			assert.doesNotMatch(question.preamble!, /same|accent|hunt|glance/iu, "the type label carries criterion content")
		}
	})

	it("does NOT flag the non-isoluminant items on screen", () => {
		// The reviewer was told the variety is deliberate. A flag would turn a stratum into a hint about
		// what answer the round expects, on the one stratum with no prior at all.
		const nonIsoKeys = new Set(armCNon.map((item) => item.questionKey))
		const isoKeys = new Set(armCIso.map((item) => item.questionKey))
		const wordingOf = (keys: Set<string>) =>
			new Set(
				built.fixture.questions
					.filter((question) => keys.has(question.key))
					.map((question) => `${question.preamble}|${question.question}|${question.instruction}`),
			)
		assert.equal(wordingOf(nonIsoKeys).size, 1)
		assert.deepEqual([...wordingOf(nonIsoKeys)], [...wordingOf(isoKeys)], "the non-isoluminant items read differently")
		for (const item of built.pageData.items) {
			assert.ok(!("stratum" in item), "the side-car carries a stratum")
		}
	})
})

describe("what the round serves, and what it keeps", () => {
	it("regenerates byte-for-byte from the committed fixture", async () => {
		assert.equal(serializeFixture(built.fixture), await readFile(PERCEPTION_4_FIXTURE_PATH, "utf8"))
	})

	it("routes on its own schema version, never on kind", () => {
		const paths = batchReviewPaths({
			batchId: PERCEPTION_4_BATCH_ID,
			kind: "oracle-validation",
			labelSchemaVersion: PERCEPTION_4_LABEL_SCHEMA_VERSION,
		})
		assert.equal(paths.page, `/perception-4?batch=${PERCEPTION_4_BATCH_ID}`)
		assert.equal(paths.payload, `/api/oracle-validation/${PERCEPTION_4_BATCH_ID}`)
	})

	it("keeps every prior out of the side-car", () => {
		// A static file the browser can read in full. On this round that matters more than usual: arm A's
		// items ARE the disagreement, so an arm label would print half the experiment.
		for (const item of built.pageData.items) {
			assert.deepEqual(
				Object.keys(item).sort(),
				item.stimulus === "pair" ? ["pair", "questionKey", "stimulus"] : ["questionKey", "side", "stimulus"],
				"the side-car carries a field the page does not need to draw",
			)
			// An opaque seeded slug and nothing else. `p4_arm_a_07` in generation order would spell out
			// the experiment: which items are arm A, which are controls, and in what order they were
			// built. The slug carries no arm, no rung, no region and no index.
			assert.match(item.questionKey, /^p4_[0-9a-f]{8}$/u, "the question key is not an opaque slug")
		}
	})

	it("carries no NUMBER anywhere, which is the only shape a prior could arrive in", () => {
		// Every quantity this round controls — a rung index, a target distance, an ICtCp reading, a
		// lightness share — is a number. The side-car is strings, booleans and one null: two hex values
		// for a pair, or a palette for a mock. So "contains no number at any depth" is a complete
		// statement about the leak surface rather than a list of words someone has to remember to extend.
		// (A substring scan over the values cannot do this job: the colour NAMES are human words and one
		// of them contains "arm".)
		const walk = (value: unknown, path: string): void => {
			if (typeof value === "number") assert.fail(`the side-car carries a number at ${path}`)
			if (Array.isArray(value)) {
				value.forEach((entry, index) => walk(entry, `${path}[${index}]`))
				return
			}
			if (value !== null && typeof value === "object") {
				for (const [key, entry] of Object.entries(value)) {
					assert.ok(
						!/rung|target|distance|stratum|arm|ictcp|oklab|disagree/iu.test(key),
						`the side-car has a field named ${key} at ${path}`,
					)
					walk(entry, `${path}.${key}`)
				}
			}
		}
		walk(built.pageData.items, "items")
	})
})

describe("the perception-4 page, executing", () => {
	let harness: Harness
	let page: FakePage

	before(async () => {
		harness = await startHarness()
		await harness.handle.service.pushOracleValidation(built.fixture, [])
		page = await openPage(harness.base, PAGE, NODE_IDS, `${harness.base}/perception-4?batch=${PERCEPTION_4_BATCH_ID}`)
	})

	after(async () => {
		await harness?.stop()
	})

	it("gets past its loading state", () => {
		assert.notEqual(page.nodes.question.textContent, "loading…", "STUCK: the page never left its loading state")
		assert.ok(
			[IDENTITY_PROMPT.question, ACCENT_PROMPT.question].includes(page.nodes.question.textContent),
			`the first item asks ${JSON.stringify(page.nodes.question.textContent)}, which is neither question`,
		)
		assert.ok(page.nodes.instruction.textContent.length > 0, "the criterion is not on screen")
		assert.ok(page.nodes.preamble.textContent.length > 0, "the stimulus type is not on screen")
	})

	it("draws one of the two stimuli on every single item, and never an empty stage", async () => {
		// The failure this guards is specific and silent: a side-car that did not load leaves a blank
		// judging surface the reviewer would still answer, and the answer would look like data.
		let pairs = 0
		let mocks = 0
		for (let at = 0; at < built.fixture.items.length; at += 1) {
			const stage = page.stage()
			const drewPair = stage.byClass("pair").length === 1
			const drewMock = stage.byClass("mock").length === 1
			assert.ok(drewPair !== drewMock, `item ${at + 1} drew ${drewPair && drewMock ? "both" : "neither"} stimulus`)
			assert.equal(stage.byClass("round-error").length, 0, `item ${at + 1} rendered the side-car error panel`)
			if (drewPair) {
				pairs += 1
				assert.equal(stage.byClass("pair-field").length, 2, `item ${at + 1}: a pair without two fields`)
				assert.equal(stage.byClass("pair-divider").length, 1, `item ${at + 1}: no seam between the fields`)
				// The question a patch pair asks is the identity one, on every one of them.
				assert.equal(page.nodes.question.textContent, IDENTITY_PROMPT.question, `item ${at + 1} pairs the wrong question`)
				assert.equal(page.nodes.instruction.textContent, IDENTITY_PROMPT.instruction)
			} else {
				mocks += 1
				assert.equal(stage.byClass("mock-art").length, 1, `item ${at + 1}: the artwork is not in the mock`)
				assert.ok(stage.byClass("mock-card").length > 0, `item ${at + 1}: no surface card, so the accent has no surface context`)
				assert.equal(page.nodes.question.textContent, ACCENT_PROMPT.question, `item ${at + 1} pairs the wrong question`)
				assert.equal(page.nodes.instruction.textContent, ACCENT_PROMPT.instruction)
			}
			if (at + 1 < built.fixture.items.length) await page.press("j")
		}
		assert.equal(pairs, 84, "the wrong number of items drew a colour-patch pair")
		assert.equal(mocks, 64, "the wrong number of items drew the real mock player")
		for (let at = built.fixture.items.length - 1; at > 0; at -= 1) await page.press("k")
	})

	it("draws every element with a class the stylesheet actually styles", () => {
		const drawn = [...page.stage().descendants(), ...page.nodes.mapping.descendants()]
		const unstyled = new Set<string>()
		for (const node of drawn) {
			for (const token of node.className.split(" ").filter(Boolean)) {
				if (!STYLED_CLASSES.has(token)) unstyled.add(token)
			}
		}
		assert.deepEqual([...unstyled], [], "these classes match no rule in styles.css, so they render unstyled")
		for (const token of page.nodes.stage.className.split(" ").filter(Boolean)) {
			assert.ok(STYLED_CLASSES.has(token), `the stage carries the unstyled class ${token}`)
		}
	})

	it("puts the three answers in the styled hotkey grid, not a run-on line", () => {
		assert.equal(page.nodes.mapping.byClass("oracle-map").length, 3)
	})

	it("advertises every key it binds in the markup, so the affordance survives a dead fetch", () => {
		const footer = readFileSync(MARKUP, "utf8")
		assert.match(footer, /id="keymap"/u, "there is no generated keymap node")
		assert.doesNotMatch(footer, /<b>[123jkur]<\/b>/u, "the footer hand-writes key names the kit is meant to generate")
	})

	it("moves between stimuli WITHOUT answering", async () => {
		assert.match(page.nodes.progress.textContent, /· 0 answered/u)
		await page.press("j")
		assert.match(page.nodes.progress.textContent, /^2 \/ 148/u, "j did not reach the second item")
		assert.match(page.nodes.progress.textContent, /· 0 answered/u, "moving recorded an answer")
		await page.press("k")
		assert.match(page.nodes.progress.textContent, /^1 \/ 148/u, "k did not go back")
	})

	it("records an answer on each of the three keys, escape included", async () => {
		await page.press("1")
		assert.match(page.nodes.progress.textContent, /· 1 answered/u, "STUCK: the answer key did not advance")
		await page.press("2")
		assert.match(page.nodes.progress.textContent, /· 2 answered/u)
		await page.press("3")
		assert.match(page.nodes.status.textContent, /recorded cant_tell/u, "the escape did not record as an ordinary answer")
		const { body } = await call(harness.base, "GET", `/api/oracle-validation/${PERCEPTION_4_BATCH_ID}`)
		const answered = (body.items as { answer: string | null }[])
			.filter((item) => item.answer !== null)
			.map((item) => item.answer!)
		assert.equal(answered.length, 3)
		assert.ok(answered.includes("cant_tell"), "the escape answer was not stored")
	})

	it("takes a per-item note, and shows the item id the reviewer would quote", async () => {
		assert.match(page.nodes.itemref.textContent, new RegExp(`^${PERCEPTION_4_BATCH_ID}/`, "u"), "no copyable item id on screen")
		await page.press("f")
		assert.equal(page.nodes.notebox.hidden, false, "f did not open the note box")
		page.nodes.noteinput.value = "this pair reads oddly on my screen"
		await page.press("Enter")
		assert.equal(page.nodes.notebox.hidden, true, "the box stayed open after saving")
		assert.match(page.nodes.notemark.textContent, /note saved/u, "the note was not acknowledged")
	})

	it("serves only allowlisted fields, and leaks none of this round's own priors", async () => {
		// The live-payload key smoke, as a test rather than a curl. Asserted against the server's OWN
		// allowlist rather than a remembered key list.
		const { body } = await call(harness.base, "GET", `/api/oracle-validation/${PERCEPTION_4_BATCH_ID}`)
		assert.deepEqual(auditRoundPayload(body as Record<string, unknown>), [], "the payload carries a field off the allowlist")
		const items = body.items as Record<string, unknown>[]
		assert.equal(items.length, built.fixture.items.length)
		const allowed = new Set<string>(ITEM_FIELD_ALLOWLIST)
		for (const item of items) {
			for (const key of Object.keys(item)) {
				assert.ok(allowed.has(key), `the payload serves ${key}, which is not on ITEM_FIELD_ALLOWLIST`)
			}
			// `stratum` is this round's sharpest prior: it names the arm, the region, and which rule the
			// item was built to favour.
			for (const forbidden of ["stratum", "itemId", "sha256", "imagePath", "imageId", "selection", "truth"]) {
				assert.ok(!(forbidden in item), `the payload leaks ${forbidden}`)
			}
		}
	})
})

describe("the identity controls are answerable at all", () => {
	it("makes the identical checks literally identical, and the obvious ones four bars apart", () => {
		const identical = truth.filter((item) => item.role === "control-identical" && item.identity !== null)
		for (const item of identical) {
			assert.ok(item.identity!.identical, `${item.itemId} is not the same colour twice`)
			assert.equal(item.identity!.okLabDistance, 0)
		}
		const obvious = truth.filter((item) => item.role === "control-obvious" && item.identity !== null)
		for (const item of obvious) {
			const bar = SAME_COLOR_BAR_BY_REGION[item.identity!.regionFirst as keyof typeof SAME_COLOR_BAR_BY_REGION]
			assert.ok(
				okLabDistance(rgbToOkLab(item.identity!.first), rgbToOkLab(item.identity!.second)) > bar * 3,
				`${item.itemId} is not clearly distinct`,
			)
		}
	})

	it("re-asks 6 items silently, 4 of them identity so the 83.3% figure has a comparison", () => {
		const repeats = truth.filter((item) => item.role === "repeat")
		assert.equal(repeats.length, 6)
		assert.equal(repeats.filter((item) => item.kind === "identity").length, 4)
		assert.equal(repeats.filter((item) => item.kind === "accent").length, 2)
		for (const repeat of repeats) {
			assert.ok(repeat.repeatOf !== null, `${repeat.itemId} repeats nothing`)
			const source = truth.find((item) => item.itemId === repeat.repeatOf)
			assert.ok(source !== undefined, `${repeat.itemId} repeats an item that is not in the round`)
			assert.notEqual(repeat.questionKey, source.questionKey, "a repeat shares its source's question key")
		}
	})

	it("separates every repeat from its source in the served order", () => {
		const at = new Map(built.fixture.serveOrder.map((itemId, index) => [itemId, index]))
		for (const repeat of truth.filter((item) => item.role === "repeat")) {
			const gap = Math.abs(at.get(repeat.itemId)! - at.get(repeat.repeatOf!)!)
			assert.ok(gap >= 12, `${repeat.itemId} is only ${gap} items from the pair it repeats`)
		}
	})
})
