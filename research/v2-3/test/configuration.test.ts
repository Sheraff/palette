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
	GAMUT_COVERAGE,
	PROMOTION_ENVELOPE,
	TRANSITION_PROMOTION_ORDER,
	WINNER_QUALITY_AXES,
	WINNER_RANKING_HYPOTHESES,
	WINNER_SCORING_POLICY,
} from "../src/internal/winner-scoring.ts"
import { MAXIMUM_WINNER_QUALITY_LOSS } from "../src/internal/transition-promotion.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_MINIMUM_MIDPOINT_ENDPOINT_DIFFERENCE,
	DEFAULT_PALETTE_EXTRACTION_OPTIONS,
} from "../src/internal/palette-core.ts"

/**
 * The reviewed configuration, pinned.
 *
 * Every value here was derived by a measured experiment and confirmed by human review; several
 * cost a whole arm to find (`collapsedSurfaceFidelity` took Track A four rounds, `chromaticCarryFull`
 * was calibrated against seven measured sign flips, `BAND_TIE_BREAK` came out of Track A round 5).
 * Nothing else in the suite notices if one of them is changed or reverted by a merge: `parity.test.ts`
 * would fail, but as up to 34 opaque palette mismatches with no attribution.
 *
 * If you are changing a value here deliberately, update the expectation in the same commit and say
 * in the message which review decided it.
 */
test("the reviewed winner-ranking configuration is unchanged", () => {
	assert.deepEqual({ ...WINNER_RANKING_HYPOTHESES }, {
		// Only the *authorized* part of the identity gain guards domination and decides the
		// utility band. The looser raw-coverage variant was measured, rejected, and deleted.
		authorizedIdentity: true,
		// Substitutes a constant for a collapsed surface's fidelity so collapsed treatments cannot
		// out-score each other on the availability of alternatives to a different treatment.
		fieldOwnershipBeforeCollapseEconomy: true,
	})
	// Track A round 4: 0.25 tipped `johns` onto Track C's grey/near-white pair; 0.45 holds every
	// reviewed win on the integrated trunk.
	assert.equal(WINNER_SCORING_POLICY.qualityWeights.fieldFidelity, 0.15)
	assert.equal(WINNER_SCORING_POLICY.maximumQualityLoss, 0.12)
	assert.equal(MAXIMUM_WINNER_QUALITY_LOSS, WINNER_SCORING_POLICY.maximumQualityLoss)
	assert.equal(WINNER_SCORING_POLICY.maximumIdentityGain,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.maximumIdentityGain)
	// Track A round 5: the band-extent rule; `raw-utility-first` and `same-family-raw-utility` both
	// cost more than they fixed.
	assert.equal(BAND_TIE_BREAK, "same-family-band-extent")
	// Track A round 4: promotion replaces the field, so gating it on the field axes is circular.
	assert.equal(PROMOTION_ENVELOPE, "field-axis-neutral")
	assert.equal(TRANSITION_PROMOTION_ORDER, "coverage-first")
	assert.deepEqual([...WINNER_QUALITY_AXES], [
		"fieldFidelity", "surfaceFidelity", "artworkIdentity", "representativeness", "sourceSupport",
		"renderedFieldClaim", "foregroundPath", "accentFidelity", "accentPath", "coherence", "economy",
	])
})

test("the reviewed gamut-coverage configuration is unchanged", () => {
	// Batch 26 (2026-07-31) adjudicated enablement: zero of eight movement pairs regressed, the
	// sailor-blue control was preferred outright, and the one previously adjudicated incumbent the
	// term trades away resolved as "both really work". Track X, four rounds; the operating point
	// below is the one the batch saw. `"utility"` keeps the term out of `WINNER_QUALITY_AXES` (the
	// eleven axes above are frozen), so it is additive on `qualityUtility` only.
	assert.equal(GAMUT_COVERAGE.integration, "utility")
	// The largest weight at which no reviewed-strong artwork's field inverts (acceptance bound).
	assert.equal(GAMUT_COVERAGE.weight, 0.05)
	// Foreground excluded on measurement: with it included, an adjudicated incumbent flips on a
	// foreground swap the reviewer had rejected. The narrower `"mark-bearing"` scope — admit the
	// foreground only where the artwork's own evidence says it holds a mark — was measured by the
	// carrier-ranking arm against the exact complaint the axis records as its counter-evidence, and
	// rejected: on `0cd48f` the *navy* foreground the complaint is about gains more coverage
	// (0.3911 -> 0.6003) than the teal it asks for (0.4091 -> 0.5786), and no winner moves.
	assert.equal(GAMUT_COVERAGE.scope, "field-and-accent")
	// Both guards are independently load-bearing (each holds a white-ground artwork the other
	// misses); the ablation is in the track record.
	assert.equal(GAMUT_COVERAGE.saturation, 0.75)
	assert.equal(GAMUT_COVERAGE.fieldGuard, true)
})

test("the reviewed identity and mark parameters are unchanged", () => {
	const selector = ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY
	assert.equal(selector.maximumIdentityGain, 0.05)
	assert.equal(selector.authorizedIdentityGain, 0.08)
	// Track C round 3: 0.05 broke `orelsan`; 0.01 separates the measured pathologies (<= 0.0043)
	// from real pairings (>= 0.0174) and is an order of magnitude below the family anchor radius.
	assert.equal(selector.identityChromaticSeparation, 0.01)
	assert.equal(selector.identityRoleSeparation, 0.12)
	assert.equal(selector.surfaceIdentityCredit, 0.6)
	// Track C round 4c: a swap out of the foreground is a foreground claim.
	assert.equal(selector.identityForegroundClaimMargin, 0.04)
	// Carrier-ranking arm: the margin above protects the artwork's *strongest* text claim, not any
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
	// Measured and rejected by the same arm: paying a chromatic foreground for identity *authority*
	// moves `0cd48f` onto an unreviewed green-text arrangement, because the navy it replaces is
	// itself over `identityDirectionChroma`. The predicate is still computed and published on the
	// selector evaluation, so re-measuring it costs one constant.
	assert.equal(FOREGROUND_MARK_ADMISSION, "blanket")
	// Carrier-ranking arm round 3: the reviewer's `skap` principle — "a treatment cannot spend two
	// roles on one hue and be credited twice for it" — is stated by `identityDirections` and enforced
	// only on the authorized half; `one-hue-one-direction` applies the same test with the same
	// constant to ordinary coverage. Batch 30 (2026-08-01) served the complete four-artwork mover
	// set and enabled it: every rule-side output graded strong, the one decisive grade applied to
	// the rule side alone (000a8aa1 — predicted as a cost, judged a win), and the other three were
	// accepted both-ways with weak leans split across the sides. Enabling gained one decisive
	// endorsement and regressed nothing.
	assert.equal(IDENTITY_COVERAGE_DIRECTIONS, "one-hue-one-direction")
	// Track C round 3: raising the bound to 6 admitted `placebo`'s brown accent. The *reserve*, not
	// the bound, was the mechanism that mattered.
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.identityObligations, 4)
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_POLICY.identity.reservedMajorFamilyPopulationFraction, 0.06)
	// Track E revision 2: mark evidence substitutes for population support and nothing else.
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_POLICY.mark.substitution, 1)
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_POLICY.mark.minimumComponentPopulation, 12)
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_POLICY.mark.minimumComponentCount, 3)
})

test("charter rule 2: the APCA hard minimum defaults to zero", () => {
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_POLICY.contrast.hardMinimum, 0)
	assert.equal(DEFAULT_PALETTE_EXTRACTION_OPTIONS.contrastHardMinimum,
		ALBUM_ARTWORK_PALETTE_V2_POLICY.contrast.hardMinimum)
})

test("the reviewed same-color bar is one number in three places", () => {
	const distinctness = ALBUM_ARTWORK_PALETTE_V2_POLICY.distinctness
	// Batch 12 (`muse`, `slim`): "we should consider them as the same color, in which case the same
	// rule as before should apply". Six midpoint judgements bracket the bar — refused at 0.00, 1.00
	// and 3.01, accepted at 3.64, 9.78, 19.75 and 62.59 — and batch 14 (`placebo`) is the recorded
	// shadow-material caveat on it.
	assert.equal(distinctness.sameColor, 3.3)
	// Track Q: raise these together or the three rules stop meaning the same thing. They are
	// separate fields only so a library user can raise one on its own.
	assert.equal(distinctness.foregroundField, distinctness.sameColor)
	assert.equal(distinctness.gradientEndpoints, distinctness.sameColor)
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_MINIMUM_MIDPOINT_ENDPOINT_DIFFERENCE, distinctness.sameColor)
	// It is a same-color-or-not bar, not a contrast floor. `knuckles`, the closest reviewed
	// foreground/background pair in the corpus, is ΔE 9.19 — so the two role rules cannot start
	// competing with the APCA minimum, which stays zero and stays a caller parameter.
	assert.ok(distinctness.foregroundField < 9.19)
})

test("the ranking quanta have a single source", () => {
	assert.deepEqual({ ...ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS }, { evidence: 0.04, utility: 0.005 })
	assert.equal(WINNER_SCORING_POLICY.evidenceResolution, ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS.evidence)
	assert.equal(WINNER_SCORING_POLICY.utilityResolution, ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS.utility)
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.evidenceResolution,
		ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS.evidence)
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.utilityResolution,
		ALBUM_ARTWORK_PALETTE_V2_RESOLUTIONS.utility)
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
