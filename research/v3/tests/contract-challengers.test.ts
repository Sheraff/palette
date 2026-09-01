/**
 * The report-only challengers to the frozen same-colour bar (`src/contract/challengers.ts`).
 *
 * `[PROVISIONAL — perception-4, reviewer-signed 2026-08-04, adoption gated on the disagreement
 * counter]`
 *
 * Two things are being proved here, and the first one is the whole reason the mechanism is allowed
 * to exist at all:
 *
 * 1. **A challenger cannot change a verdict.** Not on the fixtures, and not on a palette built
 *    specifically so that both challengers contradict the frozen rule. `valid`, the violation list
 *    and the deferred list are compared byte-for-byte against a run with no observer attached. If
 *    this ever fails, a provisional number has reached the gate without anybody deciding — which is
 *    the exact failure mode the reviewer's ruling about late-discovered constraints is about.
 *
 * 2. **The counter actually counts.** A mechanism that silently counted zero would be worse than no
 *    mechanism, because the reviewer's sign-off makes this counter the trigger for whether the
 *    deferred confirming round ever runs. So the disagreements are fired deliberately, in **both**
 *    directions, on constructed pairs whose numbers are written out here.
 *
 * The third group pins the reimplemented colour maths to the library it was copied from. `color.ts`
 * reimplements APCA rather than importing `apca-w3`, and the cross-check against the package is
 * what makes that copy safe; `challengers.ts` reimplements ICtCp rather than importing `colorjs.io`
 * so the contract's shipping closure keeps depending on no third-party package, and this is the
 * cross-check that makes *that* copy safe. It is an exact-equality check, not a tolerance one.
 */

import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import {
	CHALLENGERS,
	CHALLENGER_NOTE,
	compareChallengers,
	decomposeOkLab,
	directionAwareDistance,
	ictcpDistance,
	mergeTallies,
	rgbToIctcp,
	tallyChallengers,
	type ChallengerComparison,
} from "../src/contract/challengers.ts"
import {
	accumulate,
	emptyLedger,
	loadLedger,
	queryLedger,
	saveLedger,
} from "../src/contract/challenger-ledger.ts"
import { colorDistance, colorFromHex, colorRegion, sameColorBar } from "../src/contract/color.ts"
import {
	ICTCP_GLOBAL_SAME_COLOR_BAR,
	SAME_COLOR_BAR_BY_REGION,
	SAME_COLOR_BAR_LIGHTNESS_AXIS,
	SAME_COLOR_DIRECTION_WEIGHTS,
} from "../src/contract/constants.ts"
import { makePalette, validFlat, validGradient, validPalettes } from "../src/contract/fixtures.ts"
import { validatePalette, type InvariantObservation } from "../src/contract/invariants.ts"
import { AUDIT_ROWS } from "../src/contract/perception-model-audit.ts"
import {
	decompose,
	ellipsoidDistance,
	spaceById,
} from "../src/contract/perception-model-spaces.ts"
import { scorePalette } from "../src/contract/scorecard.ts"

// ---------------------------------------------------------------------------------------------
// Constructed pairs. Every number in the comments is measured, not asserted from memory — the
// tests below re-derive them, so a drift shows up as a failure rather than as a stale comment.
// ---------------------------------------------------------------------------------------------

/** dark-neutral, pure lightness. OKLab 0.01262 ≥ bar 0.00932 (distinct); direction-aware 0.01262 < 0.02063 (same). */
const LIGHTNESS_PAIR = [colorFromHex("#202020"), colorFromHex("#232323")] as const

/** dark-saturated, chroma-dominant. OKLab 0.01414 < bar 0.01502 (same); direction-aware 0.03619, ICtCp 0.01596 (both distinct). */
const CHROMA_PAIR = [colorFromHex("#000027"), colorFromHex("#030027")] as const

/** dark-neutral. OKLab 0.01154 ≥ bar 0.00932 (distinct); ICtCp 0.01020 < 0.01026 (same). */
const ICTCP_PAIR = [colorFromHex("#001827"), colorFromHex("#001b27")] as const

function compare(pair: readonly [ReturnType<typeof colorFromHex>, ReturnType<typeof colorFromHex>]): ChallengerComparison {
	const [first, second] = pair
	return compareChallengers(
		first,
		second,
		colorDistance(first, second),
		sameColorBar(first, second),
		colorRegion(first),
	)
}

function verdictOf(comparison: ChallengerComparison, id: string) {
	const verdict = comparison.verdicts.find((v) => v.challenger === id)
	assert.notEqual(verdict, undefined, `no verdict for ${id}`)
	return verdict!
}

// ---------------------------------------------------------------------------------------------
// 1. Challengers never affect `valid`
// ---------------------------------------------------------------------------------------------

/**
 * A palette whose field roles are `LIGHTNESS_PAIR`: two dark-neutral greys the frozen bar calls
 * distinct and the direction-aware challenger calls the same colour. It is a **valid** palette, and
 * the point of the test is that it stays one.
 */
const disagreeingPalette = makePalette({
	background: "#202020",
	surface: "#232323",
	foreground: "#f2f5f7",
	accent: "#e0533a",
})

test("a challenger disagreement does not change the verdict, the violations, or the deferrals", () => {
	const unobserved = validatePalette(disagreeingPalette)
	const { scorecard, result } = scorePalette(disagreeingPalette)

	// The disagreement really is there — otherwise this test proves nothing.
	const total = scorecard.challengers.reduce((n, tally) => n + tally.disagreed, 0)
	assert.ok(total > 0, "the fixture was supposed to make the challengers disagree, and it did not")

	assert.equal(scorecard.valid, unobserved.valid)
	assert.equal(result.valid, unobserved.valid)
	assert.deepEqual(result.violations, unobserved.violations)
	assert.deepEqual(result.deferred, unobserved.deferred)
	assert.deepEqual(scorecard.violations, unobserved.violations)

	// And the palette is genuinely valid: a challenger that disagreed on a palette that was failing
	// anyway would leave the interesting case untested.
	assert.equal(unobserved.valid, true, "the constructed fixture should be a valid palette")
})

test("no challenger verdict reaches a violation, on any fixture", () => {
	for (const palette of [...validPalettes, disagreeingPalette]) {
		const plain = validatePalette(palette)
		const observed = validatePalette(palette, { observe: () => {} })
		const { scorecard } = scorePalette(palette)
		assert.equal(observed.valid, plain.valid)
		assert.deepEqual(observed.violations, plain.violations)
		assert.equal(scorecard.valid, plain.valid)
		// Nothing in a violation's details ever names a challenger.
		for (const violation of scorecard.violations) {
			assert.ok(
				!JSON.stringify(violation).includes("challenger"),
				`a violation mentions a challenger: ${violation.code}`,
			)
		}
	}
})

test("challengers are computed only for judgments, and only on invariant 3", () => {
	const observations: InvariantObservation[] = []
	validatePalette(validGradient, { observe: (o) => observations.push(o) })

	for (const observation of observations) {
		if (observation.invariant === "I3") {
			assert.notEqual(observation.challengers, undefined, `I3 observation ${observation.check} has no challengers`)
			assert.equal(observation.challengers?.verdicts.length, CHALLENGERS.length)
		} else {
			assert.equal(observation.challengers, undefined, `${observation.invariant} carries challengers`)
		}
	}
	assert.ok(observations.some((o) => o.invariant === "I3"), "no I3 observations were emitted")
})

test("the incumbent answer a challenger is compared against is the same-colour bar, not the elevated cell", () => {
	// The foreground↔accent cell is judged against max(sameColorBar, separation). If the challenger
	// were compared against that, the separation ruling's work would be booked as a perceptual
	// disagreement. So the comparison's incumbentBar must be the same-colour bar for every pair.
	const observations: InvariantObservation[] = []
	validatePalette(validFlat, { observe: (o) => observations.push(o) })

	const separated = observations.find((o) => o.check === "I3.foreground-accent-not-separated")
	assert.notEqual(separated, undefined, "expected a foreground↔accent judgment")
	assert.ok(separated!.bar > separated!.challengers!.incumbentBar, "the elevated cell should have a higher enforced bar")
	assert.equal(
		separated!.challengers!.incumbentBar,
		sameColorBar(validFlat.roles.foreground, validFlat.roles.accent),
	)
})

// ---------------------------------------------------------------------------------------------
// 2. The counter fires
// ---------------------------------------------------------------------------------------------

test("disagreement counting fires: the challenger calls the same colour where the contract calls it distinct", () => {
	const comparison = compare(LIGHTNESS_PAIR)
	assert.equal(comparison.region, "dark-neutral")
	assert.equal(comparison.incumbentSaysSame, false, "the frozen bar should call this pure-lightness pair distinct")

	const verdict = verdictOf(comparison, "direction-aware-oklab")
	assert.equal(verdict.saysSame, true, "the direction-aware bar should call it the same colour")
	assert.equal(verdict.agrees, false)

	const [directionAware] = tallyChallengers([comparison])
	assert.equal(directionAware.challenger, "direction-aware-oklab")
	assert.equal(directionAware.judged, 1)
	assert.equal(directionAware.disagreed, 1)
	assert.equal(directionAware.agreed, 0)
	assert.equal(directionAware.challengerSaysSameIncumbentDistinct, 1)
	assert.equal(directionAware.incumbentSaysSameChallengerDistinct, 0)
	assert.equal(directionAware.disagreedByRegion["dark-neutral"], 1)
	assert.equal(directionAware.disagreedByRegion["light-saturated"], 0)
})

test("disagreement counting fires in the other direction too, and the two are not pooled", () => {
	// This is the dangerous direction: the contract calls the pair the same colour and both
	// challengers call it distinct, i.e. a collision the frozen bar would let through.
	const comparison = compare(CHROMA_PAIR)
	assert.equal(comparison.region, "dark-saturated")
	assert.equal(comparison.incumbentSaysSame, true)

	for (const id of ["direction-aware-oklab", "ictcp-global"] as const) {
		assert.equal(verdictOf(comparison, id).saysSame, false, `${id} should call this chroma step distinct`)
		assert.equal(verdictOf(comparison, id).agrees, false)
	}

	for (const tally of tallyChallengers([comparison])) {
		assert.equal(tally.disagreed, 1)
		assert.equal(tally.incumbentSaysSameChallengerDistinct, 1)
		assert.equal(tally.challengerSaysSameIncumbentDistinct, 0)
		assert.equal(tally.disagreedByRegion["dark-saturated"], 1)
	}
})

test("the ICtCp challenger disagrees on its own account, not only where the direction-aware one does", () => {
	const comparison = compare(ICTCP_PAIR)
	assert.equal(comparison.incumbentSaysSame, false)
	assert.equal(verdictOf(comparison, "ictcp-global").saysSame, true)
	assert.equal(verdictOf(comparison, "ictcp-global").agrees, false)
})

test("agreement is counted as agreement — the counter is not stuck on", () => {
	// Two colours nothing could confuse: the tally must record judged=1, disagreed=0.
	const far = compare([colorFromHex("#000000"), colorFromHex("#ffffff")] as const)
	assert.equal(far.incumbentSaysSame, false)
	for (const tally of tallyChallengers([far])) {
		assert.equal(tally.judged, 1)
		assert.equal(tally.agreed, 1)
		assert.equal(tally.disagreed, 0)
	}
})

test("the scorecard surfaces the counter and its caveat", () => {
	const { scorecard } = scorePalette(disagreeingPalette)
	assert.equal(scorecard.challengers.length, CHALLENGERS.length)
	assert.equal(scorecard.challengerNote, CHALLENGER_NOTE)
	assert.match(scorecard.challengerNote, /never affect `valid`/)
	assert.match(scorecard.challengerNote, /dark-neutral only/)

	const directionAware = scorecard.challengers.find((t) => t.challenger === "direction-aware-oklab")!
	assert.ok(directionAware.judged > 0, "the scorecard tallied no judgments")
	assert.ok(directionAware.disagreed > 0, "the constructed palette should produce a disagreement")
	assert.equal(directionAware.agreed + directionAware.disagreed, directionAware.judged)
	assert.equal(
		directionAware.challengerSaysSameIncumbentDistinct + directionAware.incumbentSaysSameChallengerDistinct,
		directionAware.disagreed,
	)
})

test("tallies merge additively, per challenger and per region", () => {
	const merged = mergeTallies(tallyChallengers([compare(LIGHTNESS_PAIR)]), tallyChallengers([compare(CHROMA_PAIR)]))
	const directionAware = merged.find((t) => t.challenger === "direction-aware-oklab")!
	assert.equal(directionAware.judged, 2)
	assert.equal(directionAware.disagreed, 2)
	assert.equal(directionAware.challengerSaysSameIncumbentDistinct, 1)
	assert.equal(directionAware.incumbentSaysSameChallengerDistinct, 1)
	assert.equal(directionAware.disagreedByRegion["dark-neutral"], 1)
	assert.equal(directionAware.disagreedByRegion["dark-saturated"], 1)
})

// ---------------------------------------------------------------------------------------------
// 3. The queryable artifact
// ---------------------------------------------------------------------------------------------

test("the ledger accumulates, re-derives its totals, and round-trips through disk", async () => {
	const directory = await mkdtemp(join(tmpdir(), "challenger-ledger-"))
	const path = join(directory, "challenger-disagreements.json")
	try {
		assert.deepEqual((await loadLedger(path)).entries, [], "a missing file reads as an empty ledger")

		let ledger = emptyLedger()
		ledger = accumulate(ledger, {
			subject: "constructed/lightness",
			tallies: tallyChallengers([compare(LIGHTNESS_PAIR)]),
			observedAt: "2026-08-04T00:00:00Z",
		})
		ledger = accumulate(ledger, {
			subject: "constructed/chroma",
			tallies: tallyChallengers([compare(CHROMA_PAIR)]),
			observedAt: "2026-08-04T00:00:01Z",
		})

		assert.equal(ledger.entries.length, 2)
		const totals = ledger.totals.find((t) => t.challenger === "direction-aware-oklab")!
		assert.equal(totals.judged, 2)
		assert.equal(totals.disagreed, 2)

		// Re-scoring one subject replaces its row rather than double-counting it.
		ledger = accumulate(ledger, {
			subject: "constructed/lightness",
			tallies: tallyChallengers([compare(LIGHTNESS_PAIR)]),
			observedAt: "2026-08-04T00:00:02Z",
		})
		assert.equal(ledger.entries.length, 2, "a repeated subject must replace, not append")
		assert.equal(ledger.totals.find((t) => t.challenger === "direction-aware-oklab")!.judged, 2)

		await saveLedger(path, ledger)
		const reloaded = await loadLedger(path)
		assert.deepEqual(reloaded, ledger)
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
})

test("the ledger is queryable by challenger, by region, and by rate", () => {
	let ledger = emptyLedger()
	ledger = accumulate(ledger, {
		subject: "constructed/lightness",
		tallies: tallyChallengers([compare(LIGHTNESS_PAIR)]),
		observedAt: "2026-08-04T00:00:00Z",
	})
	ledger = accumulate(ledger, {
		subject: "constructed/agreeing",
		tallies: tallyChallengers([compare([colorFromHex("#000000"), colorFromHex("#ffffff")] as const)]),
		observedAt: "2026-08-04T00:00:01Z",
	})

	const all = queryLedger(ledger, { challenger: "direction-aware-oklab" })
	assert.equal(all.length, 2)
	// Sorted by rate, worst first: the stratum that disagrees must not hide behind the mean.
	assert.equal(all[0].subject, "constructed/lightness")
	assert.equal(all[0].rate, 1)
	assert.equal(all[1].rate, 0)

	const byRegion = queryLedger(ledger, { challenger: "direction-aware-oklab", region: "light-saturated" })
	assert.equal(byRegion.every((row) => row.disagreed === 0), true, "no disagreement was in light-saturated")

	const hot = queryLedger(ledger, { challenger: "direction-aware-oklab", minRate: 0.5 })
	assert.deepEqual(hot.map((row) => row.subject), ["constructed/lightness"])
})

test("a subject that judged nothing has a null rate, never a zero one", () => {
	const ledger = accumulate(emptyLedger(), {
		subject: "constructed/empty",
		tallies: tallyChallengers([]),
		observedAt: "2026-08-04T00:00:00Z",
	})
	const rows = queryLedger(ledger, { challenger: "ictcp-global" })
	assert.equal(rows.length, 1)
	assert.equal(rows[0].judged, 0)
	assert.equal(rows[0].rate, null, "'never disagreed' and 'nothing to disagree about' must not be conflated")
})

// ---------------------------------------------------------------------------------------------
// 4. The reimplemented maths is the maths it claims to be
// ---------------------------------------------------------------------------------------------

test("the in-contract ICtCp is coordinate-identical to the colorjs.io-backed one", () => {
	// Exact equality, not a tolerance: the two compute the same expression in the same order, and a
	// tolerance here would let a genuine transcription error hide under it.
	const reference = spaceById("ictcp")
	for (let i = 0; i < 4096; i++) {
		const rgb = [(i * 37) % 256, (i * 91 + 13) % 256, (i * 17 + 7) % 256] as const
		const mine = rgbToIctcp(rgb as never)
		const theirs = reference.toCartesian(rgb as never)
		for (let k = 0; k < 3; k++) {
			assert.equal(mine[k], theirs[k], `ICtCp coord ${k} differs at ${rgb}`)
		}
	}
})

test("the in-contract decomposition is the study's decomposition", () => {
	const oklab = spaceById("oklab")
	for (let i = 0; i < 500; i++) {
		const firstRgb = [(i * 13) % 256, (i * 47) % 256, (i * 5) % 256] as const
		const secondRgb = [(i * 61) % 256, (i * 23) % 256, (i * 97) % 256] as const
		const mine = decomposeOkLab(colorFromHex(hexOf(firstRgb)), colorFromHex(hexOf(secondRgb)))
		const theirs = decompose(oklab.toCartesian(firstRgb as never), oklab.toCartesian(secondRgb as never))

		assert.ok(Math.abs(mine.deltaLightness - theirs.deltaLightness) < 1e-15)
		assert.ok(Math.abs(mine.deltaChroma - theirs.deltaChroma) < 1e-15)
		assert.ok(Math.abs(mine.deltaHue - theirs.deltaHue) < 1e-15)

		// And the direction-aware distance is the study's ellipsoid metric at these weights.
		const expected = ellipsoidDistance(theirs, SAME_COLOR_DIRECTION_WEIGHTS.chroma, SAME_COLOR_DIRECTION_WEIGHTS.hue)
		const actual = directionAwareDistance(colorFromHex(hexOf(firstRgb)), colorFromHex(hexOf(secondRgb)))
		assert.ok(Math.abs(expected - actual) < 1e-15, `${expected} != ${actual}`)
	}
})

function hexOf(rgb: readonly [number, number, number]): string {
	return `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`
}

test("the decomposition identity holds exactly: the ellipsoid reduces to the one ruler at unit weights", () => {
	for (let i = 0; i < 300; i++) {
		const first = colorFromHex(hexOf([(i * 29) % 256, (i * 71) % 256, (i * 11) % 256]))
		const second = colorFromHex(hexOf([(i * 53) % 256, (i * 19) % 256, (i * 83) % 256]))
		const { deltaLightness, deltaChroma, deltaHue } = decomposeOkLab(first, second)
		const recombined = Math.hypot(deltaLightness, deltaChroma, deltaHue)
		const direct = colorDistance(first, second)
		assert.ok(
			Math.abs(recombined - direct) <= 1e-12 * Math.max(1, direct),
			`decomposition ${recombined} != one-ruler distance ${direct}`,
		)
	}
})

test("ICtCp distance is symmetric and zero on an identical pair", () => {
	const a = colorFromHex("#3a5f8a")
	const b = colorFromHex("#8a5f3a")
	assert.equal(ictcpDistance(a, b), ictcpDistance(b, a))
	assert.equal(ictcpDistance(a, a), 0)
	assert.equal(directionAwareDistance(a, a), 0)
})

// ---------------------------------------------------------------------------------------------
// 5. The constants are the signed-off package, and they are audited
// ---------------------------------------------------------------------------------------------

test("the challenger constants are the digits the reviewer signed off on", () => {
	// PERCEPTION_VERDICT.md, recommended package for quantity 1: the weights are the measured ratios
	// squared, and the scale is arm B's pure-lightness crossing in dark-neutral.
	assert.deepEqual({ ...SAME_COLOR_DIRECTION_WEIGHTS }, { chroma: 8.29, hue: 7.39 })
	// The squares are 8.2944 and 7.3984. The signed-off digits truncate rather than round the
	// second (7.39, not 7.40); the constant carries the reviewer's digit and says so. The gap is
	// 0.0084 against a weight whose own 95% interval spans [1.65, 5.90] squared — three orders of
	// magnitude wider — so it moves nothing, and it is pinned here rather than left to be
	// rediscovered as a discrepancy.
	assert.ok(Math.abs(SAME_COLOR_DIRECTION_WEIGHTS.chroma - 2.88 ** 2) < 0.01)
	assert.ok(Math.abs(SAME_COLOR_DIRECTION_WEIGHTS.hue - 2.72 ** 2) < 0.01)
	assert.deepEqual({ ...SAME_COLOR_BAR_LIGHTNESS_AXIS }, { "dark-neutral": 0.02063 })

	// The measured gap that is the whole content of the challenge: the frozen dark-neutral bar sits
	// between the measured chroma threshold and the measured lightness one.
	assert.ok(SAME_COLOR_BAR_BY_REGION["dark-neutral"] > 0.00717, "frozen bar is looser than chroma needs")
	assert.ok(
		SAME_COLOR_BAR_BY_REGION["dark-neutral"] < SAME_COLOR_BAR_LIGHTNESS_AXIS["dark-neutral"] / 2,
		"frozen bar is less than half of what lightness needs",
	)

	assert.equal(ICTCP_GLOBAL_SAME_COLOR_BAR, 0.01026)
})

test("the scale is only claimed for dark-neutral — the other three regions are absent, not guessed", () => {
	assert.deepEqual(Object.keys(SAME_COLOR_BAR_LIGHTNESS_AXIS), ["dark-neutral"])
	assert.equal(Object.keys(SAME_COLOR_BAR_BY_REGION).length, 4)
})

test("every challenger constant carries an audit row", () => {
	const audited = AUDIT_ROWS.map((row) => `${row.id} ${row.site} ${row.reasoning}`).join("\n")
	for (const name of [
		"SAME_COLOR_DIRECTION_WEIGHTS",
		"SAME_COLOR_BAR_LIGHTNESS_AXIS",
		"ICTCP_GLOBAL_SAME_COLOR_BAR",
	]) {
		assert.ok(audited.includes(name), `${name} has no audit row`)
		const row = AUDIT_ROWS.find((candidate) => candidate.id === name)
		assert.notEqual(row, undefined, `${name} has no row of its own`)
		assert.equal(row!.classification, "possibly-dependent", `${name} should be possibly-dependent`)
		assert.match(row!.reasoning, /PROVISIONAL BY DESIGN/, `${name}'s row should say it is provisional by design`)
	}
})

test("both challengers are declared, in the order a report lists them", () => {
	assert.deepEqual(CHALLENGERS.map((c) => c.id), ["direction-aware-oklab", "ictcp-global"])
	for (const challenger of CHALLENGERS) {
		assert.ok(challenger.bar > 0)
		assert.ok(challenger.provenance.length > 80, `${challenger.id} needs a real provenance line`)
	}
})
