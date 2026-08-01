import assert from "node:assert/strict"
import test from "node:test"

import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY,
	FOREGROUND_MARK_ADMISSION,
	IDENTITY_COVERAGE_DIRECTIONS,
	TEXT_DEMOTION_EVIDENCE,
} from "../src/internal/base-scoring.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_POLICY,
	ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS,
	ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS,
} from "../src/internal/policy.ts"
import {
	BAND_TIE_BREAK,
	FIELD_OWNERSHIP,
	GAMUT_COVERAGE,
	OBJECTIVE_REPAIRS,
	PROMOTION_ENVELOPE,
	TRANSITION_PROMOTION_ORDER,
	WINNER_QUALITY_AXES,
	WINNER_RANKING_HYPOTHESES,
	WINNER_SCORING_POLICY,
} from "../src/internal/winner-scoring.ts"
import { MAXIMUM_WINNER_QUALITY_LOSS } from "../src/internal/transition-promotion.ts"
import { TEXT_ROLE_RESTRICTION } from "../src/internal/text-role-restriction.ts"
import {
	ACCENT_RANK_FIDELITY_WEIGHT,
	ALBUM_ARTWORK_PALETTE_V2_MINIMUM_MIDPOINT_ENDPOINT_DIFFERENCE,
	CONTROL_FIELD_VARIANT_PAIRS,
	DEFAULT_PALETTE_EXTRACTION_OPTIONS,
	FAMILY_BIN_STEP,
	FIELD_MIDPOINT_BAND,
	FOREGROUND_RANK_ROLE_EVIDENCE_WEIGHT,
	REGION_ROLE_SCORE_CUE_SPAN,
	REGION_ROLE_SCORE_SUPPORT_BASE,
	REPRESENTATIVE_DENSITY_RADIUS,
} from "../src/internal/palette-core.ts"
import { CHROMA_BIN_ORIGIN_OFFSET } from "../src/internal/band-representative.ts"

/**
 * The shipped configuration, pinned — with each pin's provenance stated honestly.
 *
 * Nothing else in the suite notices if one of these is changed or reverted by a merge:
 * `parity.test.ts` would fail, but as up to 34 opaque palette mismatches with no attribution.
 * That is what this file is for. It is *not* a claim that every value below is review-backed.
 *
 * This file previously opened by asserting that "every value here was derived by a measured
 * experiment and confirmed by human review". That was false, and the provenance sweep of
 * 2026-08-01 (`research/v2-3-experiments/provenance-hygiene/REPORT.md`) replaced it with the
 * per-pin tags below. Each pin carries exactly one:
 *
 * - `[REVIEWED]`  measured by a named arm **and** adjudicated by a named review batch.
 * - `[MEASURED]`  measured by a named arm; no batch ruled on it directly.
 * - `[n=1]`       real evidence, but one named artwork carries it.
 * - `[INHERITED]` carried in from the frozen v2-2 baseline or earlier; never independently
 *                 reviewed in the v2-3 line. Value unchanged since the commit named on the pin.
 * - `[UNCALIBRATED]` the arm that set it says in its own words it could not derive it.
 * - `[HELD]`      the incumbent, retained because the alternative was measured and lost — which
 *                 is not the same as the incumbent having been endorsed.
 *
 * Two standing rules for anyone editing this file:
 *
 * 1. If you change a value, update the expectation in the same commit and say in the message
 *    which review decided it — and re-tag the pin.
 * 2. Charter "verdict recency" (`research/v2-3-eval/TRACK_CHARTER.md:32-34`) binds these comments
 *    too. A pin that argues from a named artwork's verdict is stale the moment a later batch
 *    supersedes that verdict. Two pins below were found reasoning from a `0cd48f` state that
 *    batches 27 and 28 had already replaced; check `research/v2-3-eval/data/verdicts.jsonl`
 *    (latest verdict per artwork wins) before trusting any artwork named here.
 *
 * The hygiene sweep's one recommended addition — pinning
 * `FIELD_OWNERSHIP.collapsedSurfaceFidelity = 0.45`, the most expensively derived constant in the
 * algorithm (Track A, four rounds) — was applied by the orchestrator in the same integration.
 *
 * PERVASIVE CLIFFS (added 2026-08-01). The sweep above audited the pins that existed. Track P's
 * tier-A perturbation measurement then showed that the pinned set was aimed at the wrong
 * constants: the values that decide this algorithm's output are quantization grains, candidate
 * bounds and ranking cut-offs that nobody had written a sentence about, and **zero of the thirteen
 * worst were pinned**. See `test("the pervasive-cliff constants are unchanged")` below and the
 * disposition table at `research/v2-3-experiments/track-p/PINNING.md`. Several pins above also
 * carry a tier-A escalation, downgrade or retraction; those are marked in place.
 */
test("the reviewed winner-ranking configuration is unchanged", () => {
	assert.deepEqual({ ...WINNER_RANKING_HYPOTHESES }, {
		// [REVIEWED] Track C round 4 (`track-c/EXPERIMENT.md:338-345`): only the *authorized* part
		// of the identity gain guards domination and decides the utility band. The looser
		// raw-coverage variant (Track A's `identityAuthority`) was measured, rejected on `johns`
		// and `black` (`track-c/EXPERIMENT.md:408-413`), and deleted. Ablations confirm it is the
		// most load-bearing of the added mechanisms (`adversarial-logic/VERDICTS.md:316-319`).
		authorizedIdentity: true,
		// [MEASURED] Track A H2 (`track-a/EXPERIMENT.md:75-97`). Substitutes a constant for a
		// collapsed surface's fidelity so collapsed treatments cannot out-score each other on the
		// availability of alternatives to a different treatment. Its entire runtime effect is to
		// substitute `FIELD_OWNERSHIP.collapsedSurfaceFidelity`, pinned below.
		fieldOwnershipBeforeCollapseEconomy: true,
	})
	// [MEASURED] Track A round 4 (`track-a/EXPERIMENT.md:388, 391-392`): the algorithm's most
	// expensively derived constant — four rounds. 0.25 tipped `johns` onto Track C's
	// grey/near-white pair; 0.45 holds every reviewed win on the integrated trunk. Pinned on the
	// provenance sweep's recommendation (2026-08-01); it previously appeared only in a comment
	// misattached to `qualityWeights.fieldFidelity`.
	assert.equal(FIELD_OWNERSHIP.collapsedSurfaceFidelity, 0.45)
	// [INHERITED] One of eleven `BASE_QUALITY_WEIGHTS` (winner-scoring.ts:226-238) that sum to 1.
	// Born as a bare literal in `3d3cea2` (2026-07-29) and unchanged since; copied through v2-2
	// into v2-3 by the scaffold commit. No document derives it, and no per-weight justification
	// exists for any of the eleven — `track-p/LEDGER.md:136-139` classes the whole map as
	// FITTED / UNEVIDENCED, "the ranking spine ... neither carries a single word of per-weight
	// justification".
	//
	// TIER-A ESCALATION (2026-08-01, `track-p/LEDGER.md:324-345`). This weight is no longer merely
	// undocumented: it is the **highest-risk pin in this file**. Perturbing it +-20 % moves 23 of
	// 154 published palettes, and it moves them ten times more often on artwork nobody has reviewed
	// (40 unseen flip opportunities) than on the reviewed fixtures (4) — the sharpest over-fitting
	// signature measured anywhere in the algorithm. All eleven `BASE_QUALITY_WEIGHTS` are
	// load-bearing (5-26 flips each; `renderedFieldClaim` 0.08 is the mildest at 5) and the whole
	// map carries a 2.50x unseen:reviewed asymmetry against 1.61x for the algorithm at large.
	// Treat any change to any of the eleven as a full re-review, and note that they sum to 1 by
	// hand, so changing one silently re-weights the other ten.
	//
	// This pin used to carry the comment "Track A round 4: 0.25 tipped `johns` onto Track C's
	// grey/near-white pair; 0.45 holds every reviewed win on the integrated trunk." That sentence
	// is real, but it describes a **different constant in a different object**:
	// `FIELD_OWNERSHIP.collapsedSurfaceFidelity = 0.45` (winner-scoring.ts:113), whose sweep points
	// are 0.25 and 0.45 (`track-a/EXPERIMENT.md:388, 391-392`). `track-p/LEDGER.md:207-215` and
	// `track-p/AGENDA.md:276-280` both flagged the misattribution; this is the fix.
	assert.equal(WINNER_SCORING_POLICY.qualityWeights.fieldFidelity, 0.15)
	// [INHERITED] Also born in `3d3cea2` (2026-07-29) as a bare literal, alongside two sibling
	// literals, with no comment and no cited experiment; carried verbatim through v2-2 into v2-3.
	// No measurement, sweep, or human review justifies the magnitude anywhere in the repository or
	// its full history — `track-p/LEDGER.md:153-154`: "applied at two gates against two different
	// baselines. No cited derivation for the magnitude."
	//
	// TIER-A DOWNGRADE (2026-08-01, `track-p/LEDGER.md:271, 378`). The provenance sweep called this
	// the "top calibration candidate"; measurement disagrees. It is consulted on all 154 artworks
	// and +-20 % flips **none** of them. It is a bound that rarely binds, not a cliff — unevidenced,
	// but cheap targets exist elsewhere. Track P's own caveat: the known `birdsofprey` 0.0016
	// near-miss argues for re-measuring it at +-5 %, where +-20 % says nothing.
	//
	// The two empirical facts on record are both cautionary, not supporting: the envelope has 3-6x
	// headroom and almost never binds (`adversarial-logic/REVIEW.md:485-488`,
	// `VERDICTS.md:246-257`), and the one time it did bind it bound wrongly — it excluded
	// `birdsofprey`'s reviewed-strong pink accent by 0.0016, and the fix was to change what the
	// envelope compares (`PROMOTION_ENVELOPE`, below) rather than to change 0.12
	// (`track-a/EXPERIMENT.md:355-361`).
	assert.equal(WINNER_SCORING_POLICY.maximumQualityLoss, 0.12)
	assert.equal(MAXIMUM_WINNER_QUALITY_LOSS, WINNER_SCORING_POLICY.maximumQualityLoss)
	assert.equal(WINNER_SCORING_POLICY.maximumIdentityGain,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.maximumIdentityGain)
	// [REVIEWED] Track A round 5 (`track-a/EXPERIMENT.md:447-524`): the band-extent rule, set from
	// two batch-7 verdicts (`horsley` and `orelsan` re-picks both dispreferred). The cheap OKLab
	// colour-span proxy was measured and rejected because it inverts on `orelsan` (`:458-472`);
	// `raw-utility-first` and `same-family-raw-utility` both cost more than they fixed (`:405-409`).
	// Neutrality evidence is the corpus sweep: only the two human-flagged cases move (`:505-524`).
	assert.equal(BAND_TIE_BREAK, "same-family-band-extent")
	// [n=1] Track A round 4 (`track-a/EXPERIMENT.md:338-374`): promotion replaces the field, so
	// gating it on the field axes is circular. Sound reasoning, but the evidence is one artwork —
	// `birdsofprey`, restored byte-identically to its reviewed baseline. Because the output is
	// byte-identical, no review batch ever adjudicated the change itself; the four `birdsofprey`
	// verdicts on record all endorse the same treatment and none of them is about this flag.
	// `track-p/LEDGER.md:119` records it as "1 named".
	assert.equal(PROMOTION_ENVELOPE, "field-axis-neutral")
	// [HELD] The pre-existing ordering, never a decision — and this pin previously carried no
	// comment at all inside a test named "the reviewed ... configuration".
	//
	// Its own source comment (winner-scoring.ts:155-159) records the contrary evidence: "Human
	// review of a gradient whose promoted accent had lower coverage but better readability
	// contradicts that ordering" (`birdsofprey`'s pink, `track-a/EXPERIMENT.md:246`). It stands
	// only because the alternative was measured and lost differently: `quality-after-decisive`
	// lands on a *third* accent (`#e0cdc7`), not the preferred pink, so the reorder does not fix
	// the case either (`track-a/EXPERIMENT.md:272-275`, rejected-options table at `:378-382`).
	// Track A's conclusion is that the fix "is not a simple reorder, and it is not in winner
	// scoring" — it belongs to whoever owns transition promotion.
	//
	// So this is an open question pinned for attribution, not a reviewed decision. It is also
	// decisive where it fires (`adversarial-logic/VERDICTS.md:345`), which is why it is pinned.
	// `track-p/AGENDA.md:283-285`: "Either the comment or the value is stale; both cannot be right."
	assert.equal(TRANSITION_PROMOTION_ORDER, "coverage-first")
	assert.deepEqual([...WINNER_QUALITY_AXES], [
		"fieldFidelity", "surfaceFidelity", "artworkIdentity", "representativeness", "sourceSupport",
		"renderedFieldClaim", "foregroundPath", "accentFidelity", "accentPath", "coherence", "economy",
	])
})

test("the objective-structure repairs are at their measured settings", () => {
	// All three come from one arm: `research/v2-3-experiments/objective-repairs/EXPERIMENT.md`,
	// measuring the three repairs the adversarial objective review proposed
	// (`research/v2-3-experiments/adversarial-objective/REVIEW.md`, avenues A2, A1, A3). Corpus for
	// every figure below: 171 images from the shared checkout — 129 verdict-carrying artworks, all
	// 34 review fixtures, 34 `-scrambled` decoys and 37 off-panel — end to end, not at the ranking
	// layer. Latest verdict per artwork authoritative.
	//
	// Read all three knowing the review's own tempering finding (T6): layer agreement does **not**
	// predict verdict strength — the largest layer has lift −0.019 — so "the layers now agree" is
	// not evidence for any of them. Each had to earn its setting on named reviewed outcomes.

	// [MEASURED] Ships ON, and it is the only one of the three that does. It repairs a real aliasing
	// defect: `WinnerEvaluation.qualityUtility` carries `0.05 * gamutCoverage`, so the
	// `field-axis-neutral` promotion envelope — moved to that mode *specifically* to stop being
	// "sensitive to the claim axis's scale rather than to treatment quality" — still contained
	// field-derived credit, `GAMUT_COVERAGE.scope` being `"field-and-accent"`.
	//
	// The mechanism is measurably live: `envelope-probe.ts` finds 94 candidates on `birdsofprey`,
	// 86 on `havana` and 102 on `loups` whose envelope ADMISSION flips when coverage is removed,
	// with margin shifts up to 0.02262 — against the 0.0012 by which `birdsofprey`'s reviewed
	// promotion is documented to clear (`track-a/EXPERIMENT.md:355-361`).
	//
	// And it moves **0 of 171** published winners. That is the review's own second decisive branch,
	// verbatim: "no flip bounds the defect as real-but-inert and closes it". So this pin carries NO
	// accuracy claim and no batch has adjudicated it — there was nothing to show a reviewer. Its
	// case is correctness: the alias is removed, `axisUtility` and `qualityUtility` are now two
	// named quantities, and every envelope consumer states which it wants. Reverting it is
	// output-neutral today and re-arms the leak the moment `GAMUT_COVERAGE.weight` or `.scope`
	// moves.
	assert.equal(OBJECTIVE_REPAIRS.envelopeBasis, "coverage-free")

	// [MEASURED] Ships OFF, against the review's explicit prediction, which this arm falsified.
	//
	// The invariant is right in principle — the objective sums 13 terms and `dominates` guards 12,
	// and `OBJECTIVE_TERMS` now makes the coupling structural so the drift cannot recur silently.
	// What is measured is that CLOSING the gap is the frontier redesign the review had already
	// closed as A5 "do not pursue", reached by a different route.
	//
	// Predicted (A1): "the 5 attributed artworks move and <= 3 others; `havana`, `slim`, `johns`,
	// `0d5cdb`, `000e91d6` are all unchanged". Measured: 21 movers, 16 verdict-carrying, and ALL
	// FIVE named holds moved. 3 FIX / 8 REAL REG against the latest endorsed samples. The two
	// guardrails break at the exact hexes and distances the review recorded for pure raw
	// domination — `0d5cdb` onto the grey `#c7c6c1` batch 28 rejected (dOKLab 15.2), `johns` onto
	// surface `#0e2340` / foreground `#cfd4d8` (dOKLab 21.4). The review's own reusable artifact
	// applies and kills it: "any future frontier redesign should be tested against `havana` +
	// `0d5cdb` first, as a two-artwork pre-filter".
	//
	// Why the prediction missed, since the review's method was validated at 0/119: its attribution
	// asked which term caused the *compare-top's* prune. But guards only ever REMOVE domination
	// edges, so the frontier grows and the winner becomes the compare-order best among every
	// newly-admitted candidate — including candidates ranked between the old winner and the global
	// compare-top, which no prune attribution examined. The bound was structurally under-counted,
	// not mis-measured.
	//
	// Do not re-tune this to "pass". It was measured once, end to end, and the trade is worse than
	// the one already settled.
	assert.equal(OBJECTIVE_REPAIRS.dominationVocabulary, "declared-guards")

	// [MEASURED] Ships OFF. Predicted (A3): "exactly the 4 artworks ... can move, and no others —
	// the stage is unreachable elsewhere". Measured: 7 movers, and only ONE of the predicted four
	// is among them; four verdict-carrying movers were unpredicted. Same structural reason as
	// above — deleting a comparator stage changes the total order everywhere it is consulted,
	// including the zero-coverage reference pass that sets `GAMUT_COVERAGE.fieldGuard` and the
	// source-eligible sub-domain ranking, neither of which a winner-vs-runner-up analysis sees.
	//
	// The outcome is one-sided: 0 FIX / 3 REAL REG / 1 equal-cost on verdict-carrying movers. Three
	// `strong` artworks move OFF an exactly-endorsed palette, `slim`'s foreground moves 26.5 dOKLab
	// further from its endorsed `#56676f`, and the `nada` fixture collapses its surface. The review
	// flagged the risk in advance — "the stage may be doing accidental good, exactly as
	// `authorizedIdentity` was found to be accidentally protecting `slim`" — and that is what the
	// measurement found, on `slim` again.
	//
	// The criticism stands: this stage is an egalitarian tiebreak nobody argued for, sitting between
	// a utilitarian sum and a lexicographic order. It is retained because deleting it costs
	// reviewed outcomes, which is not the same as it having been endorsed.
	assert.equal(OBJECTIVE_REPAIRS.leximinFallback, "sorted-evidence-levels")

	// The whole object, so a fourth repair cannot be added without a pin.
	assert.deepEqual({ ...OBJECTIVE_REPAIRS }, {
		envelopeBasis: "coverage-free",
		dominationVocabulary: "declared-guards",
		leximinFallback: "sorted-evidence-levels",
	})
})

test("the reviewed gamut-coverage configuration is unchanged", () => {
	// [REVIEWED] Batch 26 (2026-07-31) adjudicated enablement: zero of eight movement pairs
	// regressed, the sailor-blue control was preferred outright, and the one previously adjudicated
	// incumbent the term trades away resolved as "both really work". `"utility"` keeps the term out
	// of `WINNER_QUALITY_AXES` (the eleven axes above are frozen), so it is additive on
	// `qualityUtility` only.
	//
	// Provenance: Track X, four rounds, `research/v2-3-experiments/track-x/EXPERIMENT.md` —
	// operating point at `:403` and `:721-722`. Read that record knowing the arm itself shipped
	// `integration: "off"` (`track-x/EXPERIMENT.md:759`), holding for exactly this adjudication;
	// batch-26 supplied it and the orchestrator turned it on in `fb3e3aa`. The arm's own "off" is
	// therefore the pre-batch state, not a contradiction of this pin.
	assert.equal(GAMUT_COVERAGE.integration, "utility")
	// [MEASURED] The largest weight at which no reviewed-strong artwork's field inverts. An
	// acceptance bound, not a fit: at 0.07 the white grounds break again
	// (`track-x/EXPERIMENT.md:721-722`).
	assert.equal(GAMUT_COVERAGE.weight, 0.05)
	// [HELD] Foreground excluded on measurement (`track-x/EXPERIMENT.md:387-391`): with it
	// included, an adjudicated incumbent flips on a foreground swap the reviewer had rejected. The
	// narrower `"mark-bearing"` scope — admit the foreground only where the artwork's own evidence
	// says it holds a mark — was measured by the carrier-ranking arm and rejected
	// (`carrier-ranking/EXPERIMENT.md:388-393`); it ships measured-OFF per batch-28 (`9983a1e`).
	//
	// RECENCY CORRECTION (2026-08-01). This comment used to close by arguing that "on `0cd48f` the
	// *navy* foreground the complaint is about gains more coverage (0.3911 -> 0.6003) than the teal
	// it asks for (0.4091 -> 0.5786), and no winner moves". The two coverage figures and the
	// no-winner-moves result are still correct as measurements. The *argument built on them* is
	// not: it was written against `0cd48f`'s batch-26 verdict, and batches 27 and 28 have since
	// superseded it. Batch-27 resolved the teal question — "both teals strong, slight lean to
	// #2b848c, 0cd48f is a pure ranking case" (`d11ac6c`) — and batch-28 graded the reachable teal
	// foreground `#a7dbd9` STRONG **over** the trunk navy, grade applying to the teal side alone
	// (`9983a1e`; warehouse chain review-19 acceptable -> review-25 acceptable -> batch-26
	// acceptable -> batch-27 strong -> batch-28 strong).
	//
	// So the navy is no longer the endorsed treatment whose coverage advantage this pin was citing
	// in its defence, and 0cd48f's teal foreground is now a verdict-mandated ranking target that
	// neither this scope nor any mechanism yet built delivers (`carrier-ranking/ROUND-4.md`
	// concludes a coverage domination guard cannot deliver it). `"field-and-accent"` stands because
	// nothing measured beats it, not because 0cd48f is settled. It is not.
	assert.equal(GAMUT_COVERAGE.scope, "field-and-accent")
	// [UNCALIBRATED] The arm that set it disowns the number in its own words —
	// `track-x/EXPERIMENT.md:451-453`: "Saturation at 0.75 is the one number here I cannot derive.
	// It is set above every complaint case's coverage and below `vvbrown`'s 99.1 %, which is a
	// two-sided constraint from two data points. It wants a proper calibration once more verdicts
	// exist." Track X also records that the white-ground failure mode is "not fixed, only masked at
	// the top of the range" (`:509`). Batch-26 adjudicated the operating point as a whole; it did
	// not rule on this coordinate.
	assert.equal(GAMUT_COVERAGE.saturation, 0.75)
	// [MEASURED] Not redundant with saturation: each mechanism catches an artwork the other misses
	// — saturation reaches `vvbrown` (99.1 % coverage), the guard reaches `02dc28` (23.5 %, far
	// below saturation) — ablation at `track-x/EXPERIMENT.md:574-576`. Note the shipped guard is
	// round 4's achromatic-field gate, not the `fieldFidelity`-shaded guard of round 3, which was
	// built, measured, cost three of four batch-24 mandate wins, and was discarded
	// (`track-x/EXPERIMENT.md:595-616`, replacement at `:702-704`).
	assert.equal(GAMUT_COVERAGE.fieldGuard, true)
})

test("the reviewed identity and mark parameters are unchanged", () => {
	const selector = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY
	// [INHERITED] Carried from the frozen v2-2 baseline (`research/v2-2/src/internal/base-scoring.ts:22`);
	// no v2-3 document derives 0.05. What is measured is only that raising it is worse in two
	// directions: 0.06 made `johns` worse and broke `black.jpg`'s reviewed collapse
	// (`track-c/EXPERIMENT.md:138-142`), and 0.10 undid the `doja` fix and inverted `vvbrown`
	// (`track-a/EXPERIMENT.md:71-73`). `track-p/LEDGER.md:202-205` flags the magnitude as
	// consequential and unexplained: it can move a candidate up to ten quantized utility bands.
	assert.equal(selector.maximumIdentityGain, 0.05)
	// [INHERITED] Introduced by Track C round 4 inside a bare parameter list with no derivation
	// (`track-c/EXPERIMENT.md:357-359`). The only sensitivity datum is one-sided: lowering it to
	// 0.06 does not recover `krafty` and loses `nobs` (`:380-381`). Never independently reviewed.
	assert.equal(selector.authorizedIdentityGain, 0.08)
	// [REVIEWED] Track C round 3 (`track-c/EXPERIMENT.md:275-289`): 0.05 broke `orelsan`; 0.01
	// separates the measured pathologies (<= 0.0043) from real pairings (>= 0.0174) and is an order
	// of magnitude below the family anchor radius (0.058), which is the one independent anchor any
	// of these three separations has. Verified against the six-row measurement table at `:275-282`.
	// Caveat in Track C's own words (`:235-239`): "values chosen from measured distances on this
	// corpus, and the corpus is the development set ... should be re-checked on unseen sources."
	// EVIDENCE RETRACTION (2026-08-01). This comment used to close: "The perturbation sweep also puts
	// it close to a boundary (`track-p/LEDGER.md:258`: 18,005 of 430,413 comparisons flip at
	// +/-20 %)." That figure was Track P's *census* boolean-flip count, and Track P has since retired
	// the method that produced it — `track-p/LEDGER.md:260-263`: "A boolean-flip margin is not
	// evidence of output fragility". Tier A measured the same constant at winner level: live on 151
	// artworks, **3 flips** at +-20 % (`track-p/LEDGER.md:276`), while sitting directly on its data
	// (nearest approach 0.1 %). Sitting on the data is not the same as deciding the output. The
	// Track C corpus-fitting caveat above stands on its own; the fragility claim does not.
	assert.equal(selector.identityChromaticSeparation, 0.01)
	// [n=1] Introduced by Track C round 2 H3 as a bare parenthetical
	// (`track-c/EXPERIMENT.md:144-149`). The single number bearing on the magnitude is that
	// `johns`' pathological white pair sits 0.113 apart, so 0.12 is set just above one observed
	// pathology on one artwork — and round 3 records that this rule then missed that same case by
	// 0.001 (`:271-272`), which is why the chromatic rule above was added. Self-declared
	// corpus-fitted in the same overfitting paragraph (`:235-239`). NOT the `0.12` that Track E
	// disowns — that is `mark.fieldSeparation` (policy.ts:190), a different constant.
	assert.equal(selector.identityRoleSeparation, 0.12)
	// [INHERITED] The *mechanism* is justified — the surface can carry identity, required for the
	// reviewed `disney` and `skap` treatments and blocked on `meteora`'s rejected surface
	// (`track-c/EXPERIMENT.md:346-348`) — but the *value* appears exactly once in the whole
	// experiment tree, in the same bare parameter list as `authorizedIdentityGain` (`:357`), with
	// no sweep and no anchor. It sits between the sibling credits `accentIdentityCredit` 0.8 and
	// `roleMismatchedIdentityCredit` 0.35; nothing on record says that is why.
	assert.equal(selector.surfaceIdentityCredit, 0.6)
	// [n=1] Track C round 4c, whose title is literally "a swap out of the foreground is a foreground
	// claim" (`track-c/EXPERIMENT.md:465`). The rule's direction is well evidenced by one reviewer
	// verdict on `krafty` — "The text of the artwork is Golden Mango, so the foreground of the
	// palette should also be golden mango" (`:467-471`, review-7-identity-confirm, still the latest
	// verdict on that artwork and not superseded).
	//
	// The MAGNITUDE is not evidenced by that case: `krafty`'s measured gap is 0.164 (golden 0.947
	// vs pink 0.783, `:479-481`), so it would fire at any margin below ~0.164. 0.04 is justified
	// only as "one evidence level" — i.e. reuse of `ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS.evidence`
	// (`:492-498`). No sweep of 0.02 / 0.06 / 0.08 exists anywhere in the tree.
	assert.equal(selector.identityForegroundClaimMargin, 0.04)
	// [REVIEWED] Carrier-ranking arm (`carrier-ranking/EXPERIMENT.md:242-246`), adjudicated by
	// batch 28 (`9983a1e`): the target mover wins decisively — `0d5cdb` publishes the gold
	// foreground `#f7de67` graded strong, the grade applying to the lever side alone.
	// The margin above protects the artwork's *strongest* text claim, not any
	// family that merely out-scores the foreground a candidate happened to choose. Measured on
	// `0d5cdb`: the red accent is the same colour in the same role in both the grey-foreground and
	// gold-foreground arrangements, and `"raw-score"` authorized it in one and not the other on
	// behalf of a third family that is not in either palette. `krafty` — the case the rule exists
	// for — is unaffected, because its golden mango carries that artwork's strongest claim (0.9465
	// against 0.8132 for the next obligation) and is byte-preserved by the arm's 141-set sweep.
	// The rejected `"claimed"` variant (fire only on `requiredRole === "foreground"`) is kept as an
	// option because it *reversed* krafty: that classifier is confidently undecided there
	// (`"ambiguous"` at confidence 0.902) while its foreground score is decisively the highest.
	assert.equal(TEXT_DEMOTION_EVIDENCE, "strongest-claim")
	// [HELD] The incumbent behaviour, retained: the alternative was measured and rejected by the
	// carrier-ranking arm, and only the alternative was ever measured. `carrier-ranking/
	// EXPERIMENT.md:427` records it plainly — "`"blanket"` ... (is the previous behaviour)". No
	// batch has endorsed it; batch-28 ships it measured-OFF alongside the mark-bearing coverage
	// scope (`9983a1e`). The predicate is still computed and published on the selector evaluation,
	// so re-measuring it costs one constant.
	//
	// The rejection evidence (`carrier-ranking/EXPERIMENT.md:388-393`): paying a chromatic
	// foreground for identity *authority* moves `0cd48f` onto a green foreground with a teal
	// accent, because the navy `#201f41` it replaces has chroma 0.0645, itself just over
	// `identityDirectionChroma`, which lifts rank 1's authority 0.01143 -> 0.03227. M2 pays *any*
	// chromatic foreground, which is the failure the blanket exclusion was written for.
	//
	// RECENCY CORRECTION (2026-08-01). That passage called the resulting arrangement "unreviewed",
	// and this comment repeated it. Narrowly it is still true — no batch has seen a *green-text*
	// `0cd48f`. But the inference it invited, that chromatic foregrounds on `0cd48f` are unexplored
	// territory, is superseded: batch-27 graded the teal `#2b848c` strong and batch-28 graded the
	// teal `#a7dbd9` strong **over** the trunk navy (see the `GAMUT_COVERAGE.scope` note above for
	// the full verdict chain). The navy this rule protects is the treatment the latest verdict
	// declined. `"blanket"` is right about M2 and silent about what `0cd48f` actually needs.
	assert.equal(FOREGROUND_MARK_ADMISSION, "blanket")
	// [REVIEWED] Carrier-ranking arm round 3 (`carrier-ranking/ROUND-3.md:155-165`). Read that
	// record knowing the arm shipped it OFF (`IDENTITY_COVERAGE_DIRECTIONS = "count-every-credit"`,
	// `ROUND-3.md:155`), explicitly deferring to review: "Zero demonstrated benefit at trunk against
	// four verdict-carrying movers is review's call, not an arm's." Batch 30 was that call and
	// enabled it (`4a5c37d`); the arm's OFF is the pre-batch state, not a contradiction.
	// The reviewer's `skap` principle — "a treatment cannot spend two
	// roles on one hue and be credited twice for it" — is stated by `identityDirections` and enforced
	// only on the authorized half; `one-hue-one-direction` applies the same test with the same
	// constant to ordinary coverage. Batch 30 (2026-08-01) served the complete four-artwork mover
	// set and enabled it: every rule-side output graded strong, the one decisive grade applied to
	// the rule side alone (000a8aa1 — predicted as a cost, judged a win), and the other three were
	// accepted both-ways with weak leans split across the sides. Enabling gained one decisive
	// endorsement and regressed nothing.
	assert.equal(IDENTITY_COVERAGE_DIRECTIONS, "one-hue-one-direction")
	// [MEASURED, awaiting review — round 3]
	// (`research/v2-3-experiments/role-assignment-2/EXPERIMENT.md`). Three shapes of this arm have
	// now been reviewed, and each verdict removed a degree of freedom rather than a case:
	//
	// 1. batch-31 PARKED generation 1 (3 wins / 3 losses / 4 equal). It reached the endorsed
	//    foreground on `0f58e77c` by *scoring*, which collapsed the whole field to `#171c16`.
	//    Review endorsed the flip and declined the output. -> the field became untouchable.
	// 2. batch-32 reverted round 2 on its own rule, and diagnosed why. Round 2 preserved the field
	//    but re-ranked it with the text role restricted, which let the ranking pick a NEW accent.
	//    On `034b1c66`: "I would actually prefer option A because its foreground color matches the
	//    main text of the artwork, but I cannot rate it as high or higher than option B because it
	//    uses a nutmeg accent that doesn't really fit this artwork, or at least I don't see where
	//    it's coming from in the artwork. If the accent was Daguerreotype instead, then I think they
	//    would at least be equally good, or maybe option A would be even better." -> the move became
	//    a TRUE SWAP: the two mark roles exchange their colours and nothing else happens, so no
	//    colour can enter the palette without provenance because no colour enters at all. Round 3
	//    produces that counterfactual byte-for-byte (`#281832 #273d77 #9ae5fc #c3b0c6`).
	// 3. The white-text boundary is settled by a measured margin, not a category — the claim
	//    family's own `foregroundEvidence - accentEvidence` must reach `decisiveRoleMargin` (0.11).
	//    Over the 10 boundary artworks whose accent holds their strongest text claim it is the ONLY
	//    published quantity with a gap between the two sides: the three whose latest verdict holds
	//    the incumbent foreground sit at -0.1465 (`nobs`), 0.0194 (`johns`, whose flip review-23 saw
	//    and declined) and 0.0677 (`0f723f36`); the two the arm serves sit at 0.1104 and 0.1224.
	//    Foreground-evidence gap, incumbent chroma, incumbent lean, polarity agreement, coherent
	//    support and population all overlap across that boundary; this one does not. The gap is
	//    0.043 wide and 0.11 was not chosen inside it — it is the threshold below which the
	//    classifier itself refuses to name a role.
	//
	// Both gates are load-bearing and protect different things, by full sweep on this trunk: the
	// chroma floor alone moves 25 non-scrambled winners and crosses `nobs` and `johns`; the margin
	// alone moves 14 and regresses seven artworks, every one of them promoting a near-neutral.
	//
	// The cost of the bar is disclosed and large: `0f58e77c` (margin 0.0480), `havana` (0.0808),
	// `0e91d6c3` (0.0493), `0a8aa1da` (0.0160) and `05a91812` (0.0059) all carry endorsed or
	// preferred flips the arm does NOT produce, because no threshold reaches them without also
	// crossing `johns`. Promoting a claim family that no role holds — which is what `10b864b2` and
	// `9d178a` need — was measured and has no boundary at all: every threshold reaching `10b864b2`
	// also reaches `9d178a`, `0d5cdb`, `slim` and `1031d1e1`, whose latest verdicts hold their
	// incumbent foreground. That arm is not implemented.
	//
	// The true swap also has a cost of its own, and it is on the arm's best case: `13bebcae`'s
	// thrice-endorsed blue accent `#035ba5` was never trunk's own colour, so a swap cannot reach it.
	// Round 3 pairs the endorsed gold foreground with trunk's near-black instead — an arrangement no
	// batch has seen. That is the price of refusing to re-source, and it is item 2 of the batch.
	assert.equal(TEXT_ROLE_RESTRICTION, "decisive-claim")
	// [INHERITED] 4 is the frozen v2-2 value (`research/v2-2/src/internal/policy.ts:84`), reaching
	// v2-3 in the scaffold commit `c9395ac`; nothing derives it. What Track C round 3 measured is a
	// REVERT, not a finding: round 2's H2 had raised the bound to 6, which admitted `placebo`'s
	// brown accent at priority 4 and cost the dark accent by about one utility level, so the bound
	// was put back (`track-c/EXPERIMENT.md:258-267`). The *reserve*, not the bound, was the
	// mechanism that mattered for the `johns` capacity finding. This is one-sided evidence on two
	// artworks — 3 and 5 were never tried.
	//
	// Recency note: `placebo`, the artwork this revert is argued from, has since moved. Its
	// review-3-identity `weak-fallback` was superseded through review-4, review-10 and review-12 to
	// review-14-b2, which endorses accent `#c91611` in place of `#111312`. The revert's conclusion
	// is unaffected (it is about the bound, not the accent), but do not read `placebo`'s state here
	// as current. `adversarial-logic/REVIEW.md:133-145` separately measures this cap as saturated
	// on all 31 non-degenerate artworks, with 52 % of obligation slots held by near-neutral families.
	//
	// TIER-A ESCALATION (2026-08-01, `track-p/LEDGER.md:382`). Live on all 154 artworks and moving
	// **18 of them** at +-20 %, with a strictly one-sided flip profile — 0 down, 18 up — so the bound
	// binds in exactly one direction, which is the direction Track C's revert came back from. A
	// one-sided calibration on a constant that moves 18 artworks, with 3 and 5 still never tried.
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.identityObligations, 4)
	// [INHERITED] Introduced by Track C round 2 H2 as a bare parenthetical with no derivation, no
	// sweep, and no alternative tried (`track-c/EXPERIMENT.md:116-118`). Its effect is attributed —
	// `johns`' blue enters the obligation set through the reserve — but that is the mechanism
	// firing, not the threshold being calibrated. Named by Track C itself as corpus-fitted and
	// due a re-check on unseen sources (`:235-239`).
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_POLICY.identity.reservedMajorFamilyPopulationFraction, 0.06)
	// [REVIEWED] scope / [INHERITED] magnitude. Track E revision 2 states the scope claim verbatim
	// (`track-e/EXPERIMENT.md:352-356`): mark evidence substitutes for the population-normalised
	// support terms at two sites and nothing else — candidacy, lanes and obligations are untouched.
	// Two of the four original substitution sites were removed with measurement (`:340-350`). The
	// governing principle, set by review, is at `:320-330`: "Mark evidence repairs a handicap in
	// fair competition. It does not confer an entitlement."
	//
	// The VALUE 1 is not calibrated. Only the endpoints are ever discussed — `substitution: 0`
	// restores the previous behaviour exactly (`:60`) — and no intermediate (0.25 / 0.5 / 0.75) is
	// swept anywhere. 1 is the full-substitution default implied by the design.
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_POLICY.mark.substitution, 1)
	// [INHERITED] Track E disowns this value in its own Uncertainty section
	// (`track-e/EXPERIMENT.md:244-246`): the `fieldSeparation = 0.12` saturation and the
	// "`minimumComponentPopulation = 12` floor are the two thresholds with the least evidence
	// behind them ... neither is load-bearing for placebo or slim ... but both would matter for a
	// borderline artwork the corpus does not contain."
	//
	// Track W later measured the floor's FORM and found it should be absolute rather than
	// scale-relative (`track-w/EXPERIMENT.md:113-123`, `componentFloorExponent` left at 0). That
	// is real evidence that 12 should not scale with image size. It is not evidence for 12: no
	// sweep of 8 / 12 / 16 / 20 exists, and `track-p/LEDGER.md:123` still lists 12 among the
	// `mark.*` values with "no per-value anchor".
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_POLICY.mark.minimumComponentPopulation, 12)
	// [INHERITED] No justifying document exists. The number appears exactly once in the whole Track
	// E record, as a half-clause inside the mechanism description — "with `plurality` requiring >= 3
	// qualifying components (saturating at 6)" (`track-e/EXPERIMENT.md:76`) — and the paragraph
	// that follows justifies the product form and the last two factors, never the 3. No threshold
	// sweep, no component-count distribution, no ablation at 2 or 4 exists in Track E or anywhere
	// else; Track E's own uncertainty list does not even flag it. `track-p/LEDGER.md:123`: the
	// individual `mark.*` thresholds "have **no per-value anchor**".
	//
	// The one later mention is not a validation: Track N uses 3 as a reference point for a
	// different, higher bar of 8 — "three strokes make a family a mark *candidate*, eight make it
	// substantial" (`track-n/EXPERIMENT.md:224-227`) — and it is 8, not 3, that Track N measured.
	//
	// Value unchanged since `d5f2003` (2026-07-31), the Track E integration that introduced it.
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_POLICY.mark.minimumComponentCount, 3)
})

test("charter rule 2: the APCA hard minimum defaults to zero", () => {
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_POLICY.contrast.hardMinimum, 0)
	assert.equal(DEFAULT_PALETTE_EXTRACTION_OPTIONS.contrastHardMinimum,
		ALBUM_ARTWORK_PALETTE_V2_POLICY.contrast.hardMinimum)
})

test("the reviewed same-color bar is one number in three places", () => {
	const distinctness = ALBUM_ARTWORK_PALETTE_V2_POLICY.distinctness
	// [REVIEWED] Batch 12 (`muse`, `slim`): "we should consider them as the same color, in which
	// case the same rule as before should apply". SEVEN midpoint judgements bracket the bar —
	// refused at 0.00, 1.00 and 3.01, accepted at 3.64, 9.78, 19.75 and 62.59 — and batch 14
	// (`placebo`) is the recorded shadow-material caveat on it.
	//
	// This comment said "Six" while enumerating seven; so does the source comment it mirrors.
	// `track-p/LEDGER.md:115` caught the arithmetic. No experiment file lists these anchors — they
	// exist only in these comments — so the enumeration is the record and the count is corrected to
	// match it. No value moves. (Corrected in the same sweep at `policy.ts:101` and — only on
	// 2026-08-01, by the pervasive-cliff pass; the sweep's claim to have fixed it was premature —
	// `palette-core.ts:3049`.)
	//
	// Carry the counterexample with the bar: `palette-core.ts:3061-3067` records a midpoint at
	// ΔE 2.58 — below this bar — carried by a *preferred* reviewed output, so the bar is known
	// over-strict by at least one case. `placebo`'s own verdict has also moved on since batch 12
	// (review-12 -> review-14-b2, a different endorsed accent), which is exactly why batch 14 is
	// cited here as the caveat rather than batch 12 as the last word.
	assert.equal(distinctness.sameColor, 3.3)
	// [MEASURED] Track Q — `research/v2-3-experiments/track-q/EXPERIMENT.md`, imported to trunk by
	// the 2026-08-01 provenance sweep; this citation previously resolved nowhere. Raise these
	// together or the three rules stop meaning the same thing. They are separate fields only so a
	// library user can raise one on its own.
	//
	// The reuse is licensed by a measurement, not by taste: on 214 distinct non-scrambled artworks
	// the foreground-vs-field ΔE distribution is sharply bimodal, with one case at ΔE 0.356 and
	// nothing at all between ΔE 1 and ΔE 9 (`track-q/EXPERIMENT.md:283-288`). Any threshold in
	// (1, 9) therefore has identical blast radius — zero outside the degenerate cases — so 3.3 is
	// "the bar review already set, dropped into an empty band" and not a tuned boundary
	// (`:301-304`).
	assert.equal(distinctness.foregroundField, distinctness.sameColor)
	assert.equal(distinctness.gradientEndpoints, distinctness.sameColor)
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_MINIMUM_MIDPOINT_ENDPOINT_DIFFERENCE, distinctness.sameColor)
	// It is a same-color-or-not bar, not a contrast floor. `knuckles`, the closest reviewed
	// foreground/background pair in the corpus, is ΔE 9.19 — so the two role rules cannot start
	// competing with the APCA minimum, which stays zero and stays a caller parameter.
	// Re-verified 2026-08-01 against `knuckles`' endorsed palette (review-3-identity, its only and
	// therefore latest verdict): `perceptualDifference("#d8cbdd", "#beb2c6")` = 9.188.
	assert.ok(distinctness.foregroundField < 9.19)
})

test("the ranking quanta have a single source", () => {
	// [INHERITED] Both values come verbatim from the frozen v2-2 baseline
	// (`research/v2-2/src/internal/base-scoring.ts:20-21`). The v2-3 contribution is a
	// de-duplication, not a derivation: `evidence` had been re-declared five times and `utility`
	// twice, so a stage could silently quantize differently from the stage feeding it
	// (`adversarial-arch/HYGIENE.md:156`; the centralizing commit `c3ac156` is byte-identical).
	// What this test pins is therefore the single-source property, which is real, plus two
	// magnitudes that nothing derives.
	//
	// Do not treat 0.04 as JND-derived. `track-p/LEDGER.md:219-224` traced every such claim to one
	// uncited sentence in `research/v2-3-eval/README.md` ("1 JND ≈ 0.02"), and that sentence is
	// about the eval diff epsilon, not about a ranking quantum. Note also `policy.ts:1-14`: this
	// 0.04 is NOT the same quantity as `FAMILY_BIN_STEP` or `REPRESENTATIVE_DENSITY_RADIUS`, which
	// merely share the literal — do not unify them or retune one by grepping. Both of those are now
	// pinned in their own right, below.
	//
	// MEASURED CLIFF (Track P tier A, `track-p/LEDGER.md:385`): +-20 % on `evidence` moves 44 of 154
	// artworks and on `utility` moves 20. Neither appears in the pervasive-cliff block below only
	// because the classifier needs a firing-conditioned denominator and could not get one: both are
	// read through aliases and computed keys, which Track P's syntactic read instrumentation cannot
	// see (`track-p/LEDGER.md:398-404` — firing counts are a lower bound, never an upper one). 44 of
	// 154 published palettes is the pervasive-cliff *rate* whatever the denominator turns out to be.
	// Track P ranks `evidence` fifth of all de-fitting targets (`track-p/AGENDA.md:44`) and groups it
	// with the three quantization grains in the block below. Treat a change as a full re-review.
	assert.deepEqual({ ...ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS }, { evidence: 0.04, utility: 0.005 })
	assert.equal(WINNER_SCORING_POLICY.evidenceResolution, ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS.evidence)
	assert.equal(WINNER_SCORING_POLICY.utilityResolution, ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS.utility)
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.evidenceResolution,
		ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS.evidence)
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.utilityResolution,
		ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS.utility)
})

/**
 * The pervasive cliffs — the constants that actually decide this algorithm's output.
 *
 * Track P's tier-A perturbation sweep (620 runs, 335 sites, 154 artworks, zero extraction errors;
 * `research/v2-3-experiments/track-p/LEDGER.md` §7, imported to trunk by `track-p/IMPORTED.md`)
 * re-ran every measurable constant at +-20 % over the full triage corpus and diffed every published
 * value against baseline. Thirteen sites came out **consulted on >= 100 of the 154 artworks AND
 * flipping the published palette on >= 20 % of them**. Every one of the thirteen was undocumented,
 * and not one was pinned — the pinned set in this file was drawn from the constants that attracted
 * human review, and the fragility ranking turns out to be almost disjoint from it
 * (`track-p/LEDGER.md:387-391`).
 *
 * That is the finding this block exists to answer: `FAMILY_BIN_STEP` = 0.04 moves **97 % of all
 * published palettes** at +-20 %, and until 2026-08-01 a merge could have changed it with nothing
 * but 34 opaque parity mismatches to show for it.
 *
 * TAGS. All thirteen are `[INHERITED]`: not one has a derivation, a sweep, or a review anywhere in
 * the repository or its history. What is `[MEASURED]` about them is their **blast radius**, not
 * their value — so each pin below carries the measured-cliff warning rather than a provenance
 * claim, and `[INHERITED]` is extended here to cover a constant that arrived as an undocumented
 * bare literal in an integration commit whose review adjudicated the *mechanism* and never saw the
 * number (that is `FIELD_MIDPOINT_BAND` and `CHROMA_BIN_ORIGIN_OFFSET`, both from `a864585`); the
 * other eight named here predate v2-3 in the frozen v2-2 baseline.
 *
 * SCOPE. Track P's mirror was built at `c2366d2`; all thirteen sites carry forward to this trunk
 * unchanged in identity and value (`track-p/LEDGER.md:347-367`, `probe/trunk-delta.ts`). Nothing
 * introduced by the batch-26/27/28/30 integrations or by `gamut-coverage.ts` is measured here at
 * all.
 *
 * TEN, NOT THIRTEEN. Three of Track P's thirteen are not pinned because they are not tunable
 * constants — a variance-clamp floor, an exponent in a variance identity, and an accumulator
 * initializer. Perturbing them measures arithmetic corruption, not tuning. The full disposition,
 * with the reasoning for each, is `research/v2-3-experiments/track-p/PINNING.md`.
 */
test("the pervasive-cliff constants are unchanged", () => {
	// [INHERITED] The perceptual-family quantization grain: OKLab lightness/a/b are floored onto a
	// 0.04 grid to decide which pixels belong to the same colour family. Verbatim from the frozen
	// v2-2 baseline (`research/v2-2/src/internal/palette-core.ts:574`); no document in the repo or
	// its history derives it, and it carried no comment at all until this pin.
	//
	// MEASURED CLIFF, THE LARGEST IN THE ALGORITHM (`track-p/LEDGER.md:290`): live on all 154
	// artworks, +-20 % moves **150 of them — 97 % of palettes** (150 down, 146 up). Treat any change
	// as a full re-review; in practice a change here is a new algorithm, not a retune.
	//
	// Track P's harness validation used exactly this constant: x1.2 changes 3 of 4 spot-check
	// artworks outright, which is how the sweep proved its zero-flip results were real inertness
	// rather than a dead instrument (`track-p/LEDGER.md:241-242`).
	//
	// Do NOT unify with `RESOLUTIONS.evidence` or `REPRESENTATIVE_DENSITY_RADIUS` — three different
	// quantities that merely share the literal 0.04 (`policy.ts:9-13`).
	assert.equal(FAMILY_BIN_STEP, 0.04)
	// [INHERITED] How many representatives each role may draw per family — a pure search-truncation
	// bound. Verbatim from frozen v2-2 (`research/v2-2/src/internal/policy.ts:81`); nothing derives
	// it and it carries no comment at its definition.
	//
	// MEASURED CLIFF (`track-p/LEDGER.md:291`): live on all 154 artworks, and -20 % moves **125 of
	// them (81 %)** — the second-largest blast radius measured. Strictly one-sided: 125 flips
	// downward, **0** upward, which is the signature of a truncation bound rather than a preference.
	// Every flip it produces is a candidate the search never saw. Track P's recommended repair is to
	// measure the bound at which output stops changing and set it there with the measurement
	// recorded (`track-p/AGENDA.md:76-79`) — a bound justified by convergence is not a free
	// parameter. Until then, treat any change as a full re-review.
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.representativesPerRole, 2)
	// [INHERITED] The weight on the role-evidence term of the foreground ranking score, against 0.16
	// each for support quality and contrast. Verbatim from frozen v2-2
	// (`research/v2-2/src/internal/palette-core.ts:2977-2978`, where the whole formula existed twice);
	// no derivation anywhere.
	//
	// MEASURED CLIFF (`track-p/LEDGER.md:292`): live on all 154 artworks, +-20 % moves **88 (57 %)**
	// — 88 up, 64 down. Track P classes it with `ACCENT_RANK_FIDELITY_WEIGHT` and the two region
	// scores as *ranking cut-offs*, whose principled repair is to express the decision as a
	// separation in evidence quanta rather than an absolute level (`track-p/AGENDA.md:80-82`).
	// Treat any change as a full re-review.
	//
	// Lifted from a bare literal on 2026-08-01. It appeared twice, once per comparator side, at the
	// identical value; the two sides must always carry the same weight, which a shared constant
	// states and two literals do not. Byte-identical output verified on five artworks.
	assert.equal(FOREGROUND_RANK_ROLE_EVIDENCE_WEIGHT, 0.68)
	// [INHERITED] The weight on the fidelity term of the accent ranking score, against 0.25 each for
	// support quality and utility. Verbatim from frozen v2-2
	// (`research/v2-2/src/internal/palette-core.ts:3013`); no derivation anywhere.
	//
	// MEASURED CLIFF (`track-p/LEDGER.md:293`): live on 151 artworks, +-20 % moves **78 (52 %)** —
	// 78 up, 66 down. Same class and same recommended repair as the foreground weight above. Treat
	// any change as a full re-review.
	//
	// Lifted from a bare literal on 2026-08-01, written `0.50`, twice, once per comparator side.
	assert.equal(ACCENT_RANK_FIDELITY_WEIGHT, 0.5)
	// [INHERITED] How many background/surface representative pairs the `"control"` representative
	// policy walks when it is not cross-pairing. Verbatim from frozen v2-2
	// (`research/v2-2/src/internal/palette-core.ts:2329`); no derivation anywhere.
	//
	// MEASURED CLIFF (`track-p/LEDGER.md:294`): live on all 154 artworks, and -20 % moves **60 of
	// them (39 %)**; 0 flips upward, because 2 -> 2.4 truncates back to the same pair count. The
	// same truncation-bound shape as `bounds.representativesPerRole` above, and the same repair
	// applies. Treat any change as a full re-review.
	//
	// Lifted from a bare literal on 2026-08-01 at its single use site.
	assert.equal(CONTROL_FIELD_VARIANT_PAIRS, 2)
	// [INHERITED] The OKLab radius within which neighbouring bins count toward a representative's
	// density support. Verbatim from frozen v2-2 (`research/v2-2/src/internal/palette-core.ts:578`);
	// no derivation, no comment until this pin.
	//
	// MEASURED CLIFF (`track-p/LEDGER.md:295`): live on all 154 artworks, +-20 % moves **51 (33 %)**
	// — 51 down, 7 up. A quantization grain, and one of the four Track P names as the best
	// derivation candidates in the whole algorithm: the codebase already establishes that one 8-bit
	// step spans `okDistance` 0.067 at the black point against 0.003 at white, a 22.6x swing, so a
	// single grain cannot be right at both ends (`track-p/AGENDA.md:69-75`). Treat any change as a
	// full re-review.
	assert.equal(REPRESENTATIVE_DENSITY_RADIUS, 0.04)
	// [INHERITED] The region role score is `sourceSupport * (BASE + CUE_SPAN * cues)`. The two sum
	// to 1, so a component with every role cue saturated scores exactly its source support and one
	// with no cue at all keeps `BASE` of it — one degree of freedom written as two literals. Both
	// verbatim from frozen v2-2 (`research/v2-2/src/internal/palette-core.ts:763`, where a
	// `role === "typography" ? 1 : 1` no-op factor also survived); nothing derives where in [0, 1]
	// the split sits.
	//
	// MEASURED CLIFFS, BOTH (`track-p/LEDGER.md:296-297`): each live on all 154 artworks; +-20 % on
	// the base moves **49 (32 %)** and on the cue span moves **45 (29 %)**. Ranking cut-offs by
	// Track P's classification (`track-p/AGENDA.md:80-82`). Treat any change as a full re-review —
	// and note that changing one without the other also breaks the sum-to-1 property, which is the
	// only statement on record about either number.
	//
	// Lifted from bare literals on 2026-08-01, each at its single use site.
	assert.equal(REGION_ROLE_SCORE_SUPPORT_BASE, 0.45)
	assert.equal(REGION_ROLE_SCORE_CUE_SPAN, 0.55)
	assert.equal(REGION_ROLE_SCORE_SUPPORT_BASE + REGION_ROLE_SCORE_CUE_SPAN, 1)
	// [INHERITED] The spatial band, in normalized gradient position, from which the field midpoint's
	// representative colour is drawn. Introduced by the Track B H4 chord-deviation integration
	// (`a864585`, 2026-07-31) as a bare `Object.freeze([0.42, 0.58])` with no comment. That commit
	// was reviewed — but on its *mechanism* and its blast radius (`loups`, `doja`, one off-panel
	// case); no reviewer saw these two numbers and no experiment file in the tree contains `0.42`.
	//
	// MEASURED CLIFF (`track-p/LEDGER.md:301`): the lower edge is live on 113 artworks and +-20 %
	// moves **28 of them (25 %)** — 28 down, 25 up. Treat any change as a full re-review. The band
	// is symmetric about 0.5 and should stay so; 0.58 was not separately swept.
	assert.deepEqual([...FIELD_MIDPOINT_BAND], [0.42, 0.58])
	// [INHERITED] The origin shift applied to the OKLab `a` and `b` axes before flooring them into
	// mode bins, so that negative chroma coordinates land in non-negative bins; lightness needs no
	// shift and takes 0. Introduced by the same `a864585` Track B H4 integration as a bare literal,
	// twice on one line, with no comment.
	//
	// MEASURED CLIFF (`track-p/LEDGER.md:302`): live on 113 artworks and +-20 % moves **27 of them
	// (24 %)**, symmetrically (27 up, 27 down). It reads as a mere encoding detail and is not one:
	// moving the origin re-phases every bin boundary relative to the data, so it selects different
	// modal representatives. Treat any change as a full re-review. It is NOT the same quantity as
	// the `+ 0.4` offsets in `palette-core.ts`'s `quantizedKeyOf`, which serve the same purpose on a
	// different grid.
	//
	// Lifted from bare literals on 2026-08-01; the two chroma axes must always share it.
	assert.equal(CHROMA_BIN_ORIGIN_OFFSET, 0.5)
})

test("the quality weights sum to one at both stages", () => {
	const winner = Object.values(WINNER_SCORING_POLICY.qualityWeights)
		.reduce((sum, weight) => sum + weight, 0)
	const waveOne = Object.values(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.qualityWeights)
		.reduce((sum, weight) => sum + weight, 0)
	assert.ok(Math.abs(winner - 1) < 1e-9, `winner weights sum to ${winner}`)
	assert.ok(Math.abs(waveOne - 1) < 1e-9, `wave-1 weights sum to ${waveOne}`)
})

test("the ranking block list is indexable into the treatment scores", () => {
	// The list used to exist twice, verbatim, in two modules consumed by two different comparators.
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS.length, 11)
	assert.equal(new Set(ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS).size,
		ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS.length)
})
