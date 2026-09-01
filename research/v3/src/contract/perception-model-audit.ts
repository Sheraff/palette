/**
 * PART 3 — the latent-structure audit.
 *
 * Every single-number perceptual or contract constant in `src/contract/`, classified by whether it
 * is provably independent of *where in colour space* and *in which direction* it is applied.
 *
 * The reviewer's ruling that commissioned this: *"in previous attempts discovering a constraint
 * late has led to failure of the attempts"*. So this table is deliberately adversarial. The default
 * classification is `unknown-untested`, and a constant only earns `position-independent` if there
 * is an argument that does not depend on any human answer — a closed-form derivation, a
 * third-party bound, or a structural fact about the representation. "Nobody has complained" is not
 * an argument, and neither is "it has been in the codebase a while".
 *
 * This module contains no thresholds of its own. It is a declaration, checked against the source by
 * `tests/contract-perception-model.test.ts` so that a constant added to `constants.ts` without an
 * audit row fails a test rather than silently escaping the census.
 *
 * Nothing here edits `PHASE_0_DECISIONS.md` or `data/decisions/decisions.json`. Proposed records are
 * in `PERCEPTION_MODEL_STUDY.md` for the reviewer to accept, amend or refuse.
 */

/**
 * The three classes, and what it takes to earn each one.
 *
 * - `position-independent` — there is a reason, statable without reference to any human answer, why
 *   this number cannot depend on where in colour space or in what direction it is applied. Usually:
 *   it is not a threshold on a perceptual quantity at all, or it is an exact property of the
 *   representation, or it is a bound derived in closed form.
 * - `possibly-dependent` — the number IS a threshold on a perceptual quantity, and either evidence
 *   of dependence already exists, or the quantity it sits on is one where dependence has been
 *   measured elsewhere. Evidence in both directions is recorded.
 * - `unknown-untested` — a threshold on a perceptual quantity with no evidence either way. The
 *   honest default.
 */
export type AuditClass = "position-independent" | "possibly-dependent" | "unknown-untested"

export type AuditRow = Readonly<{
	/** The exact identifier, or a `file:line` pointer when the number has no name. */
	id: string
	value: string
	site: string
	/** What the number is a threshold ON. Blank-quantity rows are the ones that turn out to be safe. */
	quantity: string
	classification: AuditClass
	/** Why this classification, in one paragraph. Evidence in BOTH directions where it exists. */
	reasoning: string
	/** What measurement would move this row out of `unknown-untested`, or refute its independence. */
	whatWouldSettleIt: string
	/** Existing ledger rows and decision records that already touch this constant. */
	relatedLedger: readonly string[]
}>

export const AUDIT_ROWS: readonly AuditRow[] = [
	// ---------------------------------------------------------------------------------------------
	// The same-colour bars and their partition. These are the ones the study measures directly.
	// ---------------------------------------------------------------------------------------------
	{
		id: "SAME_COLOR_BAR_BY_REGION (4 values)",
		value: "0.00932 / 0.01502 / 0.01627 / 0.02293",
		site: "src/contract/constants.ts:154-157",
		quantity: "Euclidean OKLab distance below which two colours register as the same colour",
		classification: "possibly-dependent",
		reasoning:
			"Position dependence is not merely possible, it is the reason there are four values rather " +
			"than one: rounds 1+2 measured a single bar and refuted it. Direction dependence is now " +
			"measured too and is LARGER than the position dependence the four bars encode. Round 3's " +
			"pre-registered anisotropy veto fired: at matched OKLab distances inside the same band, " +
			"lightness-dominant pairs read 'same' 15/21 (0.714) and chroma-dominant 2/21 (0.095, exact " +
			"p = 0.00022). Round 2's direction probe pointed the same way at a fixed 0.01500 " +
			"(lightness 4/4, chroma 2/4, hue 1/4). The four regional bars span 2.5x; the direction " +
			"effect at fixed distance spans a larger share of the answer range than that. Evidence the " +
			"other way: none. No round has ever found the bar direction-invariant. Within-region " +
			"dependence is separately evidenced — light-saturated splits 0.01516 / 0.02074 / 0.03805 " +
			"across hue thirds, which constants.ts calls 'a deliberate placeholder, not an accident'.",
		whatWouldSettleIt:
			"A direction-crossed bar round inside a single region: separate lightness / chroma / hue " +
			"ladders, sized against the 83.3% repeat consistency measured in round 3. This is B9's own " +
			"question and it remains the cheapest thing that could retire the tripwire. PART 2 designs it.",
		relatedLedger: ["B9", "B10", "B12", "d-2026-08-03-same-color-bar-freeze"],
	},
	// ---------------------------------------------------------------------------------------------
	// The three challenger constants. Report-only by construction (`challengers.ts`), and audited
	// anyway — an unenforced number that escapes the census is exactly the "constraint discovered
	// late" the ruling that commissioned this table is about, and "it cannot affect a verdict today"
	// is the same argument as "nobody has complained", which this table does not accept.
	// ---------------------------------------------------------------------------------------------
	{
		id: "SAME_COLOR_DIRECTION_WEIGHTS",
		value: "{ chroma: 8.29, hue: 7.39 }",
		site: "src/contract/constants.ts:195",
		quantity:
			"relative weights on the chroma and hue components of an OKLab difference, under " +
			"d^2 = dL^2 + dC^2 + dH^2, for the report-only direction-aware same-colour bar",
		classification: "possibly-dependent",
		reasoning:
			"POSSIBLY DEPENDENT, AND PROVISIONAL BY DESIGN - the two are separate statements and both " +
			"hold. Dependent: the weights were measured in dark-neutral ONLY, on three 12-rung ladders " +
			"(perception-4 arm B), and nothing measured says the ratio holds in the other three regions " +
			"- which is position dependence of the weights themselves, one level up from the position " +
			"dependence SAME_COLOR_BAR_BY_REGION already encodes. Provisional: arm B was declared " +
			"under-powered for adoption BEFORE it ran, and it is. The ratios 2.88 [1.91, 4.39] and 2.72 " +
			"[1.65, 5.90] are Holm-clean over the round's declared family of 13 and are the only " +
			"Holm-clean identity results the round produced, but 12 rungs confirms a ratio and cannot " +
			"distinguish 2x from 4x (prereg 3.4 priced 30 rungs for that); the intervals contain 2, 2.9 " +
			"and the study's pooled prediction of 4.2 alike. The study's own pooled shape-(d) fit gives " +
			"17.4 and 14.8 on this parametrisation, about DOUBLE these - two independent analyses " +
			"agreeing qualitatively and disagreeing numerically, which is the honest reason the reviewer " +
			"signed this off provisionally rather than adopting it. Evidence the other way, i.e. that " +
			"the bar is direction-INVARIANT: none, from any round, ever. Round 3's pre-registered " +
			"anisotropy veto fired and round 2's four-pair probe pointed the same way.",
		whatWouldSettleIt:
			"Two things, both named in PERCEPTION_VERDICT.md as preconditions for landing the shape: a " +
			"second region's ladders (so the weights stop being a dark-neutral claim applied globally), " +
			"and 30 rungs per ladder (so the ratio is pinned rather than confirmed). The disagreement " +
			"counter in challengers.ts is what decides whether that round is worth commissioning - the " +
			"reviewer deferred it and made the counter the trigger.",
		relatedLedger: [
			"B9",
			"d-2026-08-04-identity-anisotropy-measured",
			"d-2026-08-04-identity-metric-shape-not-space",
			"d-2026-08-04-perception-4-package-signed-off",
		],
	},
	{
		id: "SAME_COLOR_BAR_LIGHTNESS_AXIS",
		value: '{ "dark-neutral": 0.02063 }',
		site: "src/contract/constants.ts:210",
		quantity:
			"the scale of the report-only direction-aware same-colour bar - the pure-lightness crossing " +
			"in dark-neutral",
		classification: "possibly-dependent",
		reasoning:
			"POSSIBLY DEPENDENT, AND PROVISIONAL BY DESIGN. It is a threshold on exactly the perceptual " +
			"quantity SAME_COLOR_BAR_BY_REGION is a threshold on, measured the same way, and that " +
			"quantity is the one constant in this file already KNOWN to be position-dependent - four " +
			"values exist because a single one was measured and refuted twice. The record deliberately " +
			"carries one key rather than four: arm B ran three ladders in dark-neutral and none " +
			"anywhere else, and the three absent keys are the measurement that was not made rather than " +
			"a claim of invariance. It is the sharpest available statement of what the frozen scalar " +
			"costs: the committed dark-neutral bar of 0.00932 sits BETWEEN the measured chroma " +
			"threshold (0.00717) and this lightness one (0.02063) - too loose for chroma and less than " +
			"half of what lightness needs. 95% CI [0.01606, 0.02666], from a 12-rung ladder, so the " +
			"same under-powering that qualifies the weights qualifies this. Evidence for independence: " +
			"none.",
		whatWouldSettleIt:
			"The same round as the weights above - this is that round's other output, not a separate " +
			"question. Landing it would additionally force a decision the measurement cannot make: " +
			"invariant 3 consumes sameColorBar() as a SCALAR, and a direction-aware rule has no single " +
			"bar to return, so either invariant 3 changes shape or the scalar survives beside it. " +
			"PERCEPTION_VERDICT.md calls that the real cost and says it must be decided before any " +
			"constant lands.",
		relatedLedger: [
			"B9",
			"d-2026-08-04-identity-anisotropy-measured",
			"d-2026-08-04-identity-metric-shape-not-space",
			"d-2026-08-04-perception-4-package-signed-off",
		],
	},
	{
		id: "ICTCP_GLOBAL_SAME_COLOR_BAR",
		value: "0.01026",
		site: "src/contract/constants.ts:236",
		quantity:
			"ICtCp distance (BT.2124 halved Ct, 720 scale omitted) below which the report-only " +
			"ICtCp-global challenger calls two colours the same",
		classification: "possibly-dependent",
		reasoning:
			"POSSIBLY DEPENDENT, AND PROVISIONAL BY DESIGN - and its dependence is the best-measured of " +
			"the three, because the round was built to measure it. This is a SINGLE GLOBAL constant on " +
			"the identity quantity, and a single global constant on that quantity has been refuted " +
			"twice in OKLab (rounds 1 and 2, which is why four regional bars exist). The claim ICtCp " +
			"makes is that its own space absorbs that position dependence so one constant suffices; the " +
			"round tested that claim and it FAILED the round's own multiplicity correction - 28/40, " +
			"exact binomial p = 0.0166 and decisive on the pre-registered arm rule, Holm-adjusted " +
			"p = 0.0995 against the declared family of 13. Worse for the constant's own shape: ICtCp's " +
			"entire margin came from lightness-dominant disagreements (16/20, p = 0.0118) while " +
			"chroma-dominant ones split 12/20 (p = 0.5034), so the arm that was supposed to vindicate a " +
			"direction-free global constant is itself DIRECTION-dependent. Its support in the held-out " +
			"model comparison exists only in the configuration containing the arm selected on the very " +
			"disagreement that comparison measures; drop arm A and it sits at adjusted p = 1.000. " +
			"Evidence for independence: the arm win, which is real and which its own correction refused. " +
			"FITTED, not measured directly - exp(-b0/b1) over the identity x ictcp x global-constant " +
			"cell, exact value 0.010264506875655147, carried here at this file's five-decimal " +
			"convention.",
		whatWouldSettleIt:
			"Nothing cheap, and deliberately so: PERCEPTION_VERDICT.md refuses the space change and the " +
			"reviewer signed that refusal. What would reopen it is the disagreement counter showing " +
			"ICtCp-global parting company with the frozen bar often, on real palettes, in a direction " +
			"the frozen bar gets wrong - i.e. an unenriched sample, which is exactly what arm A was not. " +
			"Until then this constant exists to be counted against, not to be adopted.",
		relatedLedger: [
			"B9",
			"d-2026-08-04-identity-metric-shape-not-space",
			"d-2026-08-04-perception-4-package-signed-off",
		],
	},
	{
		id: "REGION_LIGHTNESS_BOUNDARY",
		value: "0.55",
		site: "src/contract/constants.ts:88",
		quantity: "OKLab L at which the ruler switches from the dark bars to the light bars",
		classification: "unknown-untested",
		reasoning:
			"This is a threshold on position that was never measured AS a threshold — it is the stratum " +
			"boundary of bracketing round 1's stimulus design, promoted to a contract constant because " +
			"the answers were analysed in those strata. Nothing has ever tested whether the bar actually " +
			"steps at 0.55, or ramps smoothly, or steps somewhere else. The audit's sharpest version of " +
			"the worry: a step function fitted to strata WILL reproduce those strata, so the four-bar " +
			"result cannot distinguish 'the bar genuinely steps at 0.55' from 'we cut the data at 0.55'. " +
			"Round 3 compounds it structurally rather than resolving it — every straddling pair hugs a " +
			"boundary by construction, so the round says nothing about region interiors (its own " +
			"confound 1). Evidence for independence: none. Evidence against: none directly, which is " +
			"exactly why this row is untested rather than possibly-dependent.",
		whatWouldSettleIt:
			"Fit a continuous threshold surface against the step and compare held-out. PART 1 does " +
			"exactly this for the identity criterion, and it is the one part of the audit this study " +
			"itself answers rather than defers.",
		relatedLedger: ["d-2026-08-03-same-color-bar-freeze"],
	},
	{
		id: "REGION_CHROMA_BOUNDARY",
		value: "0.05",
		site: "src/contract/constants.ts:89",
		quantity: "OKLab chroma at which the ruler switches from the neutral bars to the saturated bars",
		classification: "unknown-untested",
		reasoning:
			"Identical status and identical argument to REGION_LIGHTNESS_BOUNDARY: a stimulus-design " +
			"stratum boundary promoted to a contract constant, never tested as a location. One extra " +
			"reason for suspicion specific to this axis: chroma is the direction round 3 found the bar " +
			"most sensitive to, so a mis-placed chroma boundary costs more than a mis-placed lightness " +
			"boundary. Under a hue-angle reparameterisation the chroma cut is also the axis along which " +
			"a fixed Euclidean step changes hue angle fastest at low chroma, which is a representational " +
			"reason to expect the bar to behave differently on either side of it — but that is an " +
			"argument for a boundary existing, not for this value of it.",
		whatWouldSettleIt: "Same as the lightness boundary; PART 1 fits it as a free location.",
		relatedLedger: ["d-2026-08-03-same-color-bar-freeze"],
	},
	{
		id: "sameColorBar() straddle rule — Math.max",
		value: "Math.max(barA, barB)",
		site: "src/contract/color.ts:250",
		quantity: "which bar governs a pair whose two colours fall in different regions",
		classification: "possibly-dependent",
		reasoning:
			"Not a number but a one-line policy that selects among numbers, and it is in this census " +
			"because it is the piece round 3 was built to settle and could not. Its stated provenance is " +
			"withdrawn: the dither-stability study cited for 'measurably most stable' has no script, seed " +
			"or output anywhere in the repository, does not replicate, and an independent replication " +
			"REVERSES it (midpoint most stable, recorded ordering reproduced 1/16 and 0/16). Round 3 put " +
			"42 discriminating items on it and returned anisotropy-confounded: the global 17/42 is the " +
			"average of two nearly opposite populations, and in the round's own words 'no scalar " +
			"combination of two regional bars can represent that'. So the rule is not merely unmeasured, " +
			"it is measured to be the wrong SHAPE. Evidence for keeping it: ground 1, the asymmetric " +
			"failure argument (a too-tight bar wrongly rejects a good palette; a too-loose bar admits a " +
			"real collision), which is untouched and is the only reason it still stands.",
		whatWouldSettleIt:
			"Nothing on the max-versus-average axis — round 3 established that further data on that " +
			"design cannot resolve it. A direction-aware bar makes the question disappear rather than " +
			"answering it, which is what PART 1 tests.",
		relatedLedger: ["B13", "d-2026-08-04-straddle-rule-anisotropy-confounded"],
	},
	{
		id: "POOLED_SAME_COLOR_BAR",
		value: "0.01535",
		site: "src/contract/constants.ts:172",
		quantity: "OKLab distance, pooled across all four regions",
		classification: "possibly-dependent",
		reasoning:
			"Position-dependent by direct measurement — the fit that produced it also refuted it as a " +
			"single bar, which constants.ts states at the point of use. It is classified here rather " +
			"than dismissed because it is still computed and still published to corpus metrics and " +
			"dashboards, so a reader can still pick it up as 'the' bar. Its blast radius is reporting " +
			"only: it is deliberately not wired to the distinctness invariant.",
		whatWouldSettleIt:
			"Not a measurement question. The exposure is that a refuted number remains published under " +
			"a name that does not say so; a rename or a report-side caveat closes it.",
		relatedLedger: ["d-2026-08-03-same-color-bar-freeze"],
	},

	// ---------------------------------------------------------------------------------------------
	// The accent distances — the functional criterion.
	// ---------------------------------------------------------------------------------------------
	{
		id: "ACCENT_FUNCTIONAL_DISTANCE",
		value: "0.14591",
		site: "src/contract/constants.ts:393",
		quantity: "OKLab distance between an accent and its governing field, as the escape from the APCA floor",
		classification: "possibly-dependent",
		reasoning:
			"The strongest direct evidence of position dependence anywhere in the contract, and it comes " +
			"from the round built to calibrate this exact constant. accent-real-1 passed all four " +
			"validity gates, fitted a pooled 0.18630 with 95% CI [0.14052, 0.24700] on 30 real-cover " +
			"items, and was then REFUSED under its own pre-registered condition 3 because three strata " +
			"fell outside that interval: field-lightness band mid at 0.13437, accent hue-third 0 at " +
			"0.13417 (and completely separated), hue-third 2 at 0.26385. That is a ~2x spread across hue " +
			"thirds at n=10 per cell. Evidence the other way, and it is real and load-bearing: the " +
			"governing-role cut AGREES — surface 0.17856 and background 0.19426, both inside the pooled " +
			"interval, 5/15 'works' each. So the dependence that showed up is on hue and field " +
			"lightness, i.e. on POSITION in colour space, and specifically not on which UI role the " +
			"field happened to be. The value standing in the constant today (0.14591) is not the fit at " +
			"all — it is the geometric midpoint of two ladder rungs from a DETECTION round, and no " +
			"stimulus was ever graded against the criterion the constant is named for.",
		whatWouldSettleIt:
			"A functional round stratified to estimate a hue-dependent threshold rather than to detect " +
			"that one exists — the n=10 per hue third that produced the refusal cannot support a " +
			"per-third value. PART 2 sizes it.",
		relatedLedger: [
			"A16",
			"B11",
			"d-2026-08-04-accent-functional-distance-is-a-bracketed-placeholder",
		],
	},
	{
		id: "FOREGROUND_ACCENT_SEPARATION_DISTANCE",
		value: "= ACCENT_VISIBILITY_COLOR_DISTANCE (0.07444)",
		site: "src/contract/constants.ts:324",
		quantity: "OKLab distance below which a foreground and an accent fail to read as two roles",
		classification: "unknown-untested",
		reasoning:
			"This is the constant on loan, and the loan is worse than it looks in one specific way the " +
			"ledger already states plainly: nobody has ever been shown a foreground and an accent side " +
			"by side and asked how far apart they must be to read as two roles. The number it borrows " +
			"was measured on an accent sitting ON a field at equal luminance — a different pair, a " +
			"different spatial arrangement, and a different task. Two things make it BETTER collateral " +
			"than the loan it replaced, and the audit records them rather than only the worry: the " +
			"borrowed number is a detection-class measurement doing a detection-class job (contrast " +
			"A16, where a detection number was doing a functional job), and it is applied as " +
			"Math.max(sameColorBar, separation) rather than as a replacement, so a region whose own bar " +
			"exceeds it still binds. The position/direction question is untouched either way: the " +
			"source measurement was itself completely separated (value is the geometric midpoint of " +
			"0.06300-0.08796) and was fitted on 10 points with no direction stratification at all. " +
			"Blast radius is live — one endorsed palette already fails on I3.foreground-accent-not-separated.",
		whatWouldSettleIt:
			"Show the pair. B31 and A16 are the same protocol on different stimuli and the ledger " +
			"already notes running them together is most of the saving; PART 2's round does that.",
		relatedLedger: ["B31", "d-2026-08-04-reviewer-metric-follows-the-pair"],
	},
	{
		id: "ACCENT_VISIBILITY_COLOR_DISTANCE",
		value: "0.07444",
		site: "src/contract/constants.ts:286",
		quantity: "OKLab distance at which an equal-luminance accent becomes detectable on a field",
		classification: "unknown-untested",
		reasoning:
			"Retired as a gate and kept as the measurement record plus the source of the loan above, so " +
			"its own exposure is historical — but it is in the census because the number it exports is " +
			"live in two places. The measurement is thin in ways that matter for THIS study's question: " +
			"10 fitted points, completely separated, so the published value is the geometric midpoint of " +
			"a gap rather than a crossing, and no confidence interval is quoted at all because sweeping " +
			"the ridge penalty 1e-1 to 1e-5 swings the interval width 2.4x non-monotonically. A " +
			"10-point separated fit cannot speak to position or direction dependence even in principle. " +
			"Bracketing round 1 part 2 carried 12 items total and stratified none of them by direction.",
		whatWouldSettleIt:
			"Nothing is owed for the retired gate. What matters is that the value not be re-borrowed a " +
			"third time without a measurement on the new pair.",
		relatedLedger: ["B11", "B31"],
	},

	// ---------------------------------------------------------------------------------------------
	// The APCA-domain epsilons.
	// ---------------------------------------------------------------------------------------------
	{
		id: "EPSILON_TEXT_RAW",
		value: "2.5",
		site: "src/contract/constants.ts:205",
		quantity: "raw pre-clamp APCA magnitude — the foreground's zero-contrast floor",
		classification: "possibly-dependent",
		reasoning:
			"The reviewer's brief named the epsilons specifically, and the adversarial reading is that " +
			"they are the single most likely late-discovery failure in the contract — not because they " +
			"are wrong but because the argument for 2.5 is not an argument about perception at all. " +
			"constants.ts is explicit: the placeholder 'is chosen for one reason only: it must exceed " +
			"APCA_RAW_IDENTICAL_CEILING (1.9815)'. 2.5 clears that and sits inside the Lc dead band, and " +
			"that is the entire justification. PHASE_0_DECISIONS §4 requires it derived from the " +
			"raw-APCA distribution over corpus pairs and §8 records that that run has not happened. " +
			"Now the position/direction question, which nobody has asked: raw APCA is a function of the " +
			"two colours' luminance Y ONLY. It is blind to hue and chroma by construction. So a fixed " +
			"raw-APCA epsilon is exactly position-independent WITHIN its own domain — and that is " +
			"precisely the hazard. Two pairs at identical |raw| can be at wildly different perceptual " +
			"distances, because the whole chromatic axis is invisible to the quantity the epsilon " +
			"thresholds. The epsilon is not a perceptually uniform floor and was never claimed to be; " +
			"the exposure is that it is READ as one. Classified possibly-dependent on the perceptual " +
			"quantity it stands in for, while being provably independent on the quantity it is " +
			"literally computed from — and the gap between those two sentences is the finding.",
		whatWouldSettleIt:
			"The pending corpus measurement of the raw-APCA distribution settles the VALUE. It does not " +
			"settle the shape question, which needs a stimulus set that varies hue and chroma at fixed " +
			"|raw| — cheap to build, never built, and not in PART 2's round because it is an " +
			"APCA-domain question rather than a distance-domain one.",
		relatedLedger: ["A3"],
	},
	{
		id: "EPSILON_ACCENT_RAW",
		value: "2.5",
		site: "src/contract/constants.ts:225",
		quantity: "raw pre-clamp APCA magnitude — the accent's zero-contrast floor",
		classification: "possibly-dependent",
		reasoning:
			"Same status, same placeholder reasoning and same analysis as EPSILON_TEXT_RAW. One extra " +
			"observation the census surfaces: the two epsilons are documented as 'separate knobs by " +
			"design' and are currently the identical number, so the design distinction is unexercised — " +
			"nothing in the corpus has ever demonstrated that the accent floor and the text floor want " +
			"different values, and nothing has demonstrated they want the same one. The accent side " +
			"additionally gates the escape (floor <= epsilon at invariants.ts:1091 and :1171), so it " +
			"interacts with ACCENT_FUNCTIONAL_DISTANCE, which is itself uncalibrated and now measured to " +
			"be hue-dependent. Two uncalibrated numbers in series, one of them known to be the wrong " +
			"shape, is the compound exposure worth naming.",
		whatWouldSettleIt: "As above, plus a check that the two knobs are ever driven apart by real data.",
		relatedLedger: ["A3"],
	},
	{
		id: "APCA_RAW_IDENTICAL_CEILING",
		value: "1.98152",
		site: "src/contract/constants.ts:193",
		quantity: "raw pre-clamp APCA magnitude produced by two identical colours",
		classification: "position-independent",
		reasoning:
			"Provably independent, and one of the few rows that earns it outright. The value is solved " +
			"in closed form from the APCA constants rather than sampled: Y* = (revTXT/revBG)^(1/blkThrs) " +
			"= (0.62/0.65)^(1/0.03) = 0.206987647443, giving |raw| = 1.98151924695, rounded UP so the " +
			"constant is a true bound. It is a property of the APCA formula, not of any colour, any " +
			"observer or any direction — the derivation never mentions a chromatic coordinate. It has " +
			"also survived an adversarial test: the prior value 1.9815 was refuted by an actual 8-bit " +
			"pair (#df11de against itself), which is how a bound should fail if it is wrong.",
		whatWouldSettleIt:
			"Only a change in the vendored APCA constants, which the contract test already pins against " +
			"apca-w3.",
		relatedLedger: [],
	},
	{
		id: "APCA_RAW_LOW_CLIP / LC_DEAD_BAND_CEILING / APCA_LC_TO_RAW_OFFSET",
		value: "10 / 7.3 / 2.7",
		site: "src/contract/constants.ts:484, :502, :511",
		quantity: "APCA scale landmarks — low clip, smallest expressible non-zero |Lc|, Lc-to-raw offset",
		classification: "position-independent",
		reasoning:
			"All three are exact restatements of vendored apca-w3 constants (loClip * 100, " +
			"(loClip - loBoWoffset) * 100, loBoWoffset * 100), symmetric in polarity and independent of " +
			"any colour coordinate. LC_DEAD_BAND_CEILING is written as the literal 7.3 rather than " +
			"computed precisely BECAUSE (0.1 - 0.027) * 100 evaluates to 7.300000000000001, one ulp " +
			"above the intended threshold — a float-exactness argument, not a perceptual one, and it is " +
			"documented at the site. A prior comment claiming float error in APCA_RAW_LOW_CLIP was " +
			"itself false and has been corrected.",
		whatWouldSettleIt: "Nothing perceptual. These move only if apca-w3 moves.",
		relatedLedger: [],
	},
	{
		id: "APCA input clamp 1.1 (unnamed)",
		value: "1.1",
		site: "src/contract/color.ts:347",
		quantity: "upper bound of the APCA input luminance domain",
		classification: "position-independent",
		reasoning:
			"Independent of position and direction — it is APCA's own icp = [0, 1.1] input clamp, a " +
			"third-party versioned bound on Y. It is in this census for a different reason, and it is " +
			"the census's one genuine hygiene finding: constants.ts:4-7 states that 'no threshold, bar, " +
			"epsilon, floor or limit may appear as a bare number anywhere in this folder', and this is " +
			"a bare number of exactly the class that folder rule was written for. It is not in " +
			"APCA_G4G, not named, and not cross-checked against apca-w3 by name, so it cannot drift-fail " +
			"loudly the way every other vendored APCA constant would. Compounding it: apcaRaw at " +
			"color.ts:320 deliberately does NOT apply this clamp, and the docstring at color.ts:305-318 " +
			"identifies that gap as 'the unsafe one'. A real exposure, but a code-hygiene one, not a " +
			"perceptual one — which is why the classification is independent and the row is still worth " +
			"reading.",
		whatWouldSettleIt:
			"Name it, move it into APCA_G4G, and pin it against apca-w3 in contract-color.test.ts. A " +
			"proposal, not a change made here.",
		relatedLedger: [],
	},
	{
		id: "CONTRAST_FLOOR_TOLERANCE",
		value: "1e-9",
		site: "src/contract/constants.ts:403",
		quantity: "absolute difference in raw-APCA magnitude between a declared and a re-derived floor",
		classification: "position-independent",
		reasoning:
			"Not a perceptual threshold at all — a float round-tripping allowance for values passing " +
			"through JSON, tagged [HELD] and described at the site as 'a numeric-noise allowance, not a " +
			"policy'. Independent of colour by construction: it thresholds a difference between two " +
			"representations of the same number.",
		whatWouldSettleIt: "Nothing. It would only need review if the serialisation format changed.",
		relatedLedger: [],
	},

	// ---------------------------------------------------------------------------------------------
	// Ramp sampling, source support, and the inherited excursion bar.
	// ---------------------------------------------------------------------------------------------
	{
		id: "P1 excursion bar",
		value: "2.5x the same-colour bar",
		site: "PHASE_0_DECISIONS.md §4 P1",
		quantity: "OKLab distance a ramp may excurse off the artwork's colours, as a multiple of the bar",
		classification: "unknown-untested",
		reasoning:
			"Inherited wholesale from v2-3 and never recalibrated, and it is the row that best " +
			"illustrates the reviewer's late-discovery worry: three bracketing rounds have now been run " +
			"and every one of them passed this constant by. It is worse than merely untested, because " +
			"it is expressed as a MULTIPLE of the same-colour bar — so it inherits, undeclared, every " +
			"position and direction dependence the bar has. If the bar is direction-dependent, so is " +
			"this, automatically, with a 2.5x lever on it and no one having decided that. No round has " +
			"ever shown a reviewer an excursion.",
		whatWouldSettleIt:
			"An excursion stimulus of any kind. Not in PART 2's round, which is deliberately scoped to " +
			"the two quantities the reviewer named; flagged here so it is not discovered late a fourth time.",
		relatedLedger: ["B12"],
	},
	{
		id: "SOURCE_POPULATION_FLOOR",
		value: "0.001",
		site: "src/contract/constants.ts:431",
		quantity: "fraction of artwork pixels exactly equal to a published colour",
		classification: "position-independent",
		reasoning:
			"Independent of position in colour space because it is not a threshold in colour space — it " +
			"thresholds a pixel-count fraction. It stays in the census as the campaign's best worked " +
			"example of the failure mode this audit is hunting: it was inherited, it gated real " +
			"palettes, and BELONGS_STUDY.md then measured that its stated mechanism has no " +
			"discriminating power at ANY threshold and that it refused 340 of 351 endorsed palettes. It " +
			"was retired as a gate on 2026-08-04 and is now report-only. The lesson the audit takes " +
			"from it: the constant was never the problem, the QUANTITY was, and no amount of " +
			"recalibrating the number would have found that.",
		whatWouldSettleIt: "Settled — retired as a gate.",
		relatedLedger: ["A17"],
	},
	{
		id: "RAMP_SAMPLES_PER_SEGMENT / RAMP_REFINEMENT_SAMPLES",
		value: "2048 / 4096",
		site: "src/contract/constants.ts:584, :603",
		quantity: "sample counts along a gradient segment",
		classification: "position-independent",
		reasoning:
			"Counts, not perceptual thresholds, and they are [MEASURED] with stated worst-case bounds " +
			"rather than asserted: per-step reach <= 0.69511 raw units away from a luminance crossing " +
			"and <= 1.21527 at a polarity flip, with 0 verdict disagreements against a 16x denser " +
			"reference over 120 ramps x 212 floors; refinement cuts worst overstatement from 0.406 to " +
			"<= 0.05 raw units wherever the true minimum is at least 1 raw unit. The bounds are stated " +
			"in raw-APCA units and hold uniformly over the sampled ramps, so the numbers are " +
			"position-independent in the only sense that matters for them: denser sampling cannot change " +
			"a verdict. The acknowledged deep-basin residual is a sampling caveat, not a colour-space one.",
		whatWouldSettleIt: "Nothing perceptual; the existing bound is the right kind of argument.",
		relatedLedger: [],
	},
	{
		id: "MIN_GRADIENT_STOPS / MAX_GRADIENT_STOPS",
		value: "2 / 4",
		site: "src/contract/constants.ts:43, :44",
		quantity: "count of gradient stops",
		classification: "position-independent",
		reasoning:
			"Counts fixed by reviewer decision, not thresholds on a perceptual quantity. The stated " +
			"reason for the ceiling — 'curvature carries a banding cost when rendered' — is a perceptual " +
			"claim and is unmeasured, and PHASE_0_DECISIONS calls the 4th stop 'negotiable on proven " +
			"utility'. But the constant is a structural cap on output shape, so no position or direction " +
			"dependence is expressible in it. Noted rather than classified as a perceptual risk.",
		whatWouldSettleIt: "A banding measurement would inform the ceiling; it does not change its shape.",
		relatedLedger: [],
	},
	{
		id: "SINGLETON_NEAR_ONE",
		value: "0.90",
		site: "PHASE_0_LOOSE_ENDS.md B20",
		quantity: "a share threshold, adopted post-hoc",
		classification: "unknown-untested",
		reasoning:
			"Carried into the census from the ledger rather than from constants.ts because the ledger " +
			"already records it as post-hoc — chosen after looking at the data it describes. Post-hoc " +
			"selection is a distinct failure mode from position dependence, and it is in scope for a " +
			"late-discovery hunt: a number picked to fit what was seen carries no guarantee on anything " +
			"unseen, in any region.",
		whatWouldSettleIt: "Pre-registration on fresh data.",
		relatedLedger: ["B20"],
	},
	{
		id: "Agreement floor",
		value: "0.85",
		site: "PHASE_0_DECISIONS.md §7",
		quantity: "inter-rater agreement rate required of an oracle question",
		classification: "position-independent",
		reasoning:
			"Independent of colour-space position — it thresholds an agreement rate, not a colour " +
			"difference. Recorded here because it is [UNCALIBRATED] ('a CLI flag with no measured " +
			"basis') and because the resolution floors of §7 were measured AGAINST it, so an unmeasured " +
			"number is load-bearing for published pixel floors. A calibration risk, not a geometry risk, " +
			"and the distinction is the point of separating these classes.",
		whatWouldSettleIt: "A measured basis for 0.85. Out of scope here; owned by the oracle workstream.",
		relatedLedger: ["A2"],
	},
] as const

export type AuditCounts = Readonly<{
	positionIndependent: number
	possiblyDependent: number
	unknownUntested: number
	total: number
}>

export function auditCounts(rows: readonly AuditRow[] = AUDIT_ROWS): AuditCounts {
	const counts = {
		positionIndependent: rows.filter((r) => r.classification === "position-independent").length,
		possiblyDependent: rows.filter((r) => r.classification === "possibly-dependent").length,
		unknownUntested: rows.filter((r) => r.classification === "unknown-untested").length,
		total: rows.length,
	}
	if (counts.positionIndependent + counts.possiblyDependent + counts.unknownUntested !== counts.total) {
		throw new Error("auditCounts: a row carries a classification outside the declared vocabulary")
	}
	return counts
}
