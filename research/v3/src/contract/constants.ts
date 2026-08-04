/**
 * Named constants for the v3 palette output contract.
 *
 * `research/v3/CONVENTIONS.md` forbids anonymous literals: every value here is named and carries a
 * provenance tag — `[REVIEWED] [MEASURED] [n=1] [INHERITED] [UNCALIBRATED] [HELD]` — plus a line
 * saying where the value comes from. No threshold, bar, epsilon, floor or limit may appear as a bare
 * number anywhere in this folder; it belongs here.
 *
 * **One exemption, deliberate:** fixed colorimetric constants — the sRGB transfer function's 0.04045
 * / 12.92 / 1.055 / 2.4, and the OKLab matrices — stay inline in `color.ts`. They are not tunables
 * and there is nothing to calibrate: they are fixed by the sRGB and OKLab specifications, and
 * `contract-color.test.ts` verifies the whole conversion against an external reference
 * (`colorjs.io`, agreement within 1e-6) rather than against a value we chose. Hoisting them here
 * would put physics in a file about policy and imply a provenance question that does not exist.
 * APCA's constants are *not* covered by this exemption — they are versioned by a third party, so
 * they live here as `APCA_G4G` with the package version recorded.
 */

/**
 * Version of this schema, stamped on every palette so old verdicts stay scopable
 * (`PHASE_0_DECISIONS.md` §2, "metadata block").
 *
 * `[HELD]` — an identifier, not a measurement. Bump on any breaking schema change.
 */
export const CONTRACT_VERSION = "v3-contract-0.1.0"

/**
 * The four roles, in the order the contract publishes and reports them.
 *
 * `[REVIEWED]` — fixed before design started (`V3_PLAN.md` §2, "the problem spec"). Not a
 * v3 decision and not open for one.
 */
export const ROLE_NAMES = ["background", "surface", "foreground", "accent"] as const

/**
 * How many stops a published gradient may carry.
 *
 * `[REVIEWED]` — `PHASE_0_DECISIONS.md` §2: two stops is a gradient, a third is allowed when the
 * artwork genuinely has a three-colour linear ramp, and stops 3–4 are otherwise *guides* that pull
 * the rendered interpolation back onto the artwork. Four is the ceiling because curvature carries a
 * banding cost when rendered.
 */
export const MIN_GRADIENT_STOPS = 2
export const MAX_GRADIENT_STOPS = 4

/**
 * The **entire** set of colours a palette may publish without the artwork containing them.
 *
 * `[REVIEWED — reviewer's ruling, 2026-08-04]`, verbatim: a palette may introduce *"EXACTLY ONE
 * color not present in the artwork: pure white (`#ffffff`) or pure black (`#000000`) only"*. Two
 * literals, no threshold, nothing to calibrate — which is why this constant needs no provenance
 * beyond the ruling itself and can never drift. See `NonSourceColorEscape` in `types.ts` for the
 * three other conditions the escape is held to.
 *
 * Anything else absent from the artwork is an invention and fails invariant 2.
 */
export const ESCAPE_COLORS = ["#ffffff", "#000000"] as const

/**
 * The roles the escape colour may occupy. Same ruling: *"used as background or foreground only (with
 * surface or accent collapsed correspondingly)"*, and the collapse partner each one implies.
 */
export const ESCAPE_ROLE_PARTNERS = {
	background: { partner: "surface", flag: "surfaceCollapsed" },
	foreground: { partner: "accent", flag: "accentCollapsed" },
} as const

/**
 * The four colour regions the same-colour bar is measured per.
 *
 * `[REVIEWED]` — the strata of the bracketing round
 * (`research/v3/data/calibration/bracketing-round-1.json`, `quadrantBoundaries`).
 */
export const COLOR_REGIONS = [
	"dark-neutral",
	"dark-saturated",
	"light-neutral",
	"light-saturated",
] as const

/**
 * Where a colour's OKLab lightness and chroma put it among the four regions.
 *
 * `[REVIEWED]` — the boundaries the bracketing round's strata were built on and the reviewer judged
 * against: `quadrantBoundaries` in `bracketing-round-1.json`, lightness 0.55, chroma 0.05. Below the
 * lightness boundary is "dark", below the chroma boundary is "neutral".
 */
export const REGION_LIGHTNESS_BOUNDARY = 0.55
export const REGION_CHROMA_BOUNDARY = 0.05

/**
 * **The one ruler, per region.** The same-colour bar as a Euclidean distance in OKLab.
 *
 * `[REVIEWED]` — reviewer bracketing **rounds 1 and 2, pooled**, batches
 * `bracketing-round-1-clarified` and `bracketing-round-2`, criterion **register-as-same** ("not
 * whether you can detect any difference at the seam — if you have to hunt along the boundary to find
 * it, they're the same colour"). Both rounds ran the same criterion, so the analysis pools them
 * (`criterionMatches: true`, `poolable: true`). Source of truth:
 * `research/v3/data/calibration/bracketing-round-2-analysis.json`, `pooled.quadrants`. 140 of 140
 * pairs answered across the two rounds; each threshold is a logistic fit with its 95% interval:
 *
 * | region           | bar     | 95% CI              | trials | distinct pairs | from          |
 * |------------------|---------|---------------------|--------|----------------|---------------|
 * | dark-neutral     | 0.00932 | 0.00764 – 0.01137   | 28     | 22             | 14 r1 + 14 r2 |
 * | dark-saturated   | 0.01502 | 0.01137 – 0.01986   | 28     | 22             | 14 r1 + 14 r2 |
 * | light-neutral    | 0.01627 | 0.01308 – 0.02023   | 28     | 22             | 14 r1 + 14 r2 |
 * | light-saturated  | 0.02293 | 0.01658 – 0.03170   | 36     | 30             | 14 r1 + 22 r2 |
 *
 * **The two columns differ because the rounds deliberately repeated stimuli.** 24 of the 120 fitted
 * points are `repeat` items carrying byte-identical colours to the item they repeat (verified 8/8 in
 * round 1, 16/16 in round 2, 6 per region), and the fit counts each showing as an independent trial.
 * Refitting on distinct pairs only moves dark-neutral to 0.01061 (+13.8%) and light-neutral to
 * 0.01451 (−10.8%), the other two by under 6% — every move stays inside the published intervals, so
 * this is not a refutation of the freeze (`reviews/phase-0-adversarial/contract.md` finding 8). It is
 * a statement about resolution: under a defensible alternative weighting two of the four frozen
 * digits move by more than 10%, so the five-decimal freeze carries roughly one significant figure of
 * real information. That is consistent with the 62.5% repeat consistency below and with the 8-bit
 * quantisation floor, both of which say the same thing.
 *
 * Round 2 roughly halved every interval. It also **moved the middle two past each other**:
 * round 1 read dark-saturated (0.01764) as looser than light-neutral (0.01629), and pooled they read
 * the other way round. Do not build anything on that ordering — their intervals overlap across
 * almost their whole length (0.01137–0.01986 against 0.01308–0.02023), so the two are statistically
 * indistinguishable and the swap is noise. What *is* stable across both rounds is the pair at the
 * ends: dark-neutral is the tightest bar and light-saturated the loosest, by roughly 2.5×.
 *
 * **A single threshold stays refuted, now twice over.** `oneThresholdSurvives: false` — pooled,
 * *both* dark-neutral and light-saturated exclude the pooled threshold of 0.01535 (round 1 had only
 * dark-neutral excluding it). §3's "one ruler" survives as one *ruler* — Euclidean OKLab, used
 * everywhere — while its *threshold* is regional.
 *
 * **How much to trust these.** Reviewer repeat consistency is 63% across both rounds (5 of 8, then
 * 10 of 16; combined 62.5%), and all identical-colour controls passed. A threshold can never be
 * sharper than the reviewer's own repeatability, so 63% is the ceiling over everything here. The
 * 8-bit grid adds its own floor: in dark-neutral the nearest-neighbour step is 0.00150 against a
 * smallest rung of 0.00605, so rungs there are quantised to about ±0.00075. Every distance quoted is
 * the achieved one, measured on the two colours actually shown.
 *
 * **Two measured findings deliberately not encoded here** — both await a dedicated round before the
 * ruler is allowed to grow dimensions:
 *
 * 1. *`light-saturated` is not one population.* Split into hue thirds it reads 0.01516 at 0–120°
 *    (pink-red through yellow-green), 0.02074 at 120–240° (green, cyan, blue) and 0.03805 at
 *    240–360° (blue, violet, magenta, red) — a 2.5× spread, outside at least one interval. The bar
 *    there depends on hue. Using the single 0.02293 is therefore known to be too loose for warm
 *    colours and too tight for violets; it is a deliberate placeholder, not an accident.
 * 2. *OKLab distance looks anisotropic under this criterion.* A direction probe at a fixed 0.01500,
 *    where the pooled curve predicts 51% "same", got lightness-only differences called "same" 4/4,
 *    chroma-only 2/4, hue-only 1/4. With four pairs per direction that is a signal, not a number —
 *    but it says the same Euclidean distance means different things depending on which way it
 *    points, which no scalar bar can express.
 */
export const SAME_COLOR_BAR_BY_REGION = {
	"dark-neutral": 0.00932,
	"dark-saturated": 0.01502,
	"light-neutral": 0.01627,
	"light-saturated": 0.02293,
} as const

/**
 * The same-colour bar pooled across all four regions.
 *
 * `[REVIEWED]` — bracketing rounds 1 and 2 pooled, `pooled.fit.threshold`: 0.01535
 * (95% CI 0.01263–0.01866) over 120 fitted points.
 *
 * **Not for the distinctness invariant.** The measurement that produced it also refuted it as a
 * single bar — pooled, both dark-neutral and light-saturated exclude it. It exists for the one
 * legitimate use of a scalar here: corpus metrics and dashboards that need to reduce "how different
 * are these palettes?" to one number comparable across runs — agreement rates, mover-set sizes,
 * drift tracking. Any *per-pair* judgement uses `sameColorBar()` instead.
 */
export const POOLED_SAME_COLOR_BAR = 0.01535

/**
 * Upper bound on |raw APCA| for two *exactly identical* colours.
 *
 * It is not zero because APCA's reverse branch raises the background to 0.65 and the text to 0.62;
 * identical inputs therefore leave a residue that depends only on luminance.
 *
 * `[MEASURED]` — solved analytically rather than sampled. For identical inputs the raw value is
 * `(Y^0.65 - Y^0.62) · 114`, whose extremum is at `Y* = (0.62/0.65)^(1/0.03) = 0.206987647443`,
 * giving `|raw| = 1.98151924695`. Rounded **up** to 1.98152 so the constant is a true bound. The
 * black soft clamp cannot reach Y*: it maps [0, 0.022] into [0.00304, 0.022], far below it.
 *
 * A first version of this constant was 1.9815, from a 2,000,001-step numeric scan — which an
 * independent verifier refuted with a real 8-bit pair, `#df11de` on itself (Y = 0.2069805, |raw| =
 * 1.981519246), exceeding it by 1.9e-5. A rounded-down bound is not a bound. `contract-color.test.ts`
 * now checks the constant against the analytic extremum and against that specific pair.
 *
 * Recorded because the epsilons below have to clear it: an epsilon at or under this value would fail
 * to flag a literally identical pair as zero contrast.
 */
export const APCA_RAW_IDENTICAL_CEILING = 1.98152

/**
 * Zero-contrast epsilon for the foreground, in raw pre-clamp APCA units
 * (`PHASE_0_DECISIONS.md` §4 invariant 4).
 *
 * `[UNCALIBRATED]` — §6 requires this measured from the distribution of raw values over corpus
 * pairs; that measurement has not run. The placeholder is chosen for one reason only: it must
 * exceed `APCA_RAW_IDENTICAL_CEILING` (1.9815), or the invariant would fail to flag a literally
 * identical foreground/background pair as zero contrast. 2.5 clears that and stays well inside the
 * Lc dead band (`APCA_RAW_LOW_CLIP` = 10), as §2 requires of the parameter default.
 */
export const EPSILON_TEXT_RAW = 2.5

/**
 * Zero-contrast epsilon for the accent, in raw pre-clamp APCA units. Separate knob by design —
 * the accent is not text and its stakes are lower (`PHASE_0_DECISIONS.md` §2, §4 invariant 4).
 *
 * `[UNCALIBRATED]` — same status and same placeholder reasoning as `EPSILON_TEXT_RAW`; the corpus
 * measurement of the raw-APCA distribution is still pending.
 *
 * This epsilon is the accent's **primary** floor and, since the reviewer's ruling of 2026-08-04, its
 * escape is a different constant from the one it used to be. The clause is still a conjunction — an
 * accent violates only when `|raw APCA| < ε` **and** it is closer than `ACCENT_FUNCTIONAL_DISTANCE` —
 * but that second threshold is no longer `ACCENT_VISIBILITY_COLOR_DISTANCE`, because the reviewer
 * ruled a *detection* distance the wrong instrument for the job. See both constants below.
 *
 * The escape is narrower than it was: the functional distance is 1.96× the detection one, so the band
 * of isoluminant accents this epsilon condemns is correspondingly wider. An imprecise value here
 * therefore matters slightly more than it did, and `PHASE_0_LOOSE_ENDS.md` A3's corpus measurement of
 * the raw-APCA distribution is still the fix.
 */
export const EPSILON_ACCENT_RAW = 2.5

/**
 * How far apart in OKLab an accent and its field must be for the accent to be visible **on colour
 * alone**, with no luminance difference at all.
 *
 * `[REVIEWED]` — reviewer bracketing round 1 part 2, batch `bracketing-round-1-clarified`,
 * 2026-08-02. Question: "Are the icons clearly visible on this background?" over equal-luminance
 * chromatic accent pairs (`accent-equal-luminance` stratum, 12 of 12 answered, 10 fitted points,
 * both controls passed). Threshold **0.07444**, bracketed by the separation interval
 * **0.06300–0.08796**.
 *
 * **Complete-separation caveat, from the analysis file:** every pair on one side of the gap was
 * answered one way and every pair on the other side the other way, so the logistic curve alone
 * cannot pin the threshold down. The reported value is the **middle of the gap** — specifically its
 * *geometric* midpoint, `sqrt(0.06300 · 0.08796)`, which is why it is 0.07444 and not the arithmetic
 * 0.07548 a reader would compute. The finding — that a chromatic accent at identical brightness
 * becomes visible somewhere in that band — is solid; the exact number inside the band is not
 * measured, only bracketed.
 *
 * **No confidence interval is quoted for this constant, deliberately.** The analysis file emits one
 * (0.05211–0.10564 at the current ridge), and earlier versions of this comment repeated it. It is an
 * artifact: on a perfectly separated fit the interval is a property of the ridge penalty rather than
 * of the reviewer. Sweeping that penalty from 1e-1 to 1e-5 swings the interval's width by 2.4× and
 * non-monotonically (0.04096–0.12351 → 0.05002–0.10845 → 0.05211–0.10564 → 0.04444–0.12422 →
 * 0.02856–0.19355), and with the penalty removed the slope diverges and the interval is unbounded —
 * measured in `reviews/phase-0-adversarial/contract.md` finding 4. Quoting it next to a threshold the
 * same paragraph calls unpinnable invites a reader to take it as measurement. **The threshold itself
 * stands**: the review's own re-derivation reproduces 0.07444 to five decimals from the raw answers,
 * and the separation band above is what the data supports. The regional bars in
 * `SAME_COLOR_BAR_BY_REGION` are unaffected — none of those fits is separated, and their intervals
 * survived both a ridge sweep and a 2,000-resample bootstrap.
 *
 * The reviewer's own summary: "a coloured accent at the same brightness as its background is
 * visible, once the two colours are about 0.07444 apart in colour. Below that the reviewer stopped
 * seeing it, even though nothing about the brightness changed."
 *
 * ## What this constant no longer does — reviewer ruling, 2026-08-04
 *
 * **It no longer gates the accent against any field**, and the reason is a criterion problem rather
 * than a scope one. It enforced exactly what it measured: invariant 4's accent clause fired only when
 * this distance *and* `EPSILON_ACCENT_RAW` were both undershot. The reviewer's refinement, verbatim:
 *
 * > *"if APCA says 0 (or close to it) and then we use 'minimal OKLab distance at which I can see the
 * > difference' those accents will still be hardly perceptible."*
 *
 * The question this number answers — the smallest separation at which a difference is *detected* —
 * turns out to be the wrong question to hang a contrast escape on. The escape now runs on
 * `ACCENT_FUNCTIONAL_DISTANCE`, a distinct and as-yet-unmeasured quantity.
 *
 * It survives here as **the measurement record**, which is a real thing to be: it is the only number
 * the reviewer's eyes have ever produced about colour-carried visibility, and its ladder is what
 * brackets the functional placeholder. Its one live consumer is
 * `FOREGROUND_ACCENT_SEPARATION_DISTANCE` below, which reuses it **out of its measured context** and
 * says so — and note that *that* reuse is on much safer ground than the retired one, because
 * foreground-versus-accent separation is itself a detection-class question ("are these two roles the
 * same colour?"), which is the class this number was measured on.
 *
 * Applies to the **accent only**. Text is luminance-driven and gets no colour rescue — that is a
 * standing reviewer verdict from v2-3 and is not up for reinterpretation here.
 */
export const ACCENT_VISIBILITY_COLOR_DISTANCE = 0.07444

/**
 * How far apart in OKLab the **foreground and the accent** must be for the palette to be publishing
 * two roles rather than one.
 *
 * `[INHERITED — calibrated for accent-vs-field visibility, relocated by reviewer ruling 2026-08-04;
 * re-measure for this pair]`
 *
 * ## Where the number comes from, and why that is not the same as where it now applies
 *
 * This is `ACCENT_VISIBILITY_COLOR_DISTANCE`, and the identity is written as an assignment rather
 * than a repeated literal so that no reader can mistake it for a second measurement. There is one
 * measurement and it is that one: bracketing round 1 part 2, 2026-08-02, question *"are the icons
 * clearly visible on this background?"*, asked about an **accent sitting on a field** at equal
 * luminance. Nobody has ever been shown a foreground and an accent side by side and asked how far
 * apart they must be to read as two roles.
 *
 * The relocation is the reviewer's, verbatim: *"Color distance is used between background and
 * surface, or between foreground and accent."* The ruling says which metric governs this pair; it
 * does not, and could not, say what value the threshold takes — no round has measured this pair. So
 * the number here is a **placeholder wearing borrowed evidence**: it is the right order of magnitude
 * from a neighbouring question (roughly 5× the same-colour bar, i.e. "clearly two colours, not merely
 * distinguishable ones"), and it is not a measurement of foreground-versus-accent separation.
 * Carrying a calibrated number to a pair it was not calibrated on is reuse of evidence out of its
 * measured context, and this comment exists so that the reuse is visible at the point of use rather
 * than inferable from a git log.
 *
 * **Loose end: re-measure this pair.** A bracketing round showing the reviewer foreground/accent
 * pairs at graded OKLab separations — the same protocol as round 1 part 2, different stimulus —
 * would replace this with a measured threshold and let the `[INHERITED]` tag become `[REVIEWED]`.
 * Until then, the digits are borrowed and any verdict that turns on them is provisional.
 *
 * Background↔surface, the ruling's other distance pair, is not given an elevated bar: it is already
 * on the distance machinery at the measured regional same-colour bar
 * (`SAME_COLOR_BAR_BY_REGION`, invariant 3), which *is* calibrated for exactly the question it is
 * being asked there. Nothing about that pair changed.
 */
export const FOREGROUND_ACCENT_SEPARATION_DISTANCE = ACCENT_VISIBILITY_COLOR_DISTANCE

/**
 * How far apart in OKLab an accent and its field must be for the accent to **work as an accent** at
 * zero luminance contrast — the one escape from the accent's APCA floor.
 *
 * `[UNCALIBRATED — reviewer-mandated two-tier semantics 2026-08-04; must be well above the JND bars;
 * calibrate via a functional-visibility round, criterion "does this work as an accent at a glance",
 * NOT the identity criterion]`
 *
 * ## Why this is not `ACCENT_VISIBILITY_COLOR_DISTANCE`
 *
 * The reviewer's refinement of 2026-08-04, verbatim:
 *
 * > *"yes, we want to keep that class of accents [isoluminant], but then the color distance must be
 * > something else than the bracketing calibration tests we've been running. Because if APCA says 0
 * > (or close to it) and then we use 'minimal OKLab distance at which I can see the difference' those
 * > accents will still be hardly perceptible (could sometimes be fine for accents, will not be fine
 * > at all for foreground)."*
 *
 * That is a ruling about **which question was asked**, not about arithmetic. Every distance this
 * repository has measured — the four regional bars and the 0.07444 — comes from a *detection*
 * criterion: can you tell these apart, do they register as the same colour. The reviewer is saying a
 * detection threshold is the wrong instrument for an escape from a contrast floor: a colour you can
 * just barely tell apart from its field, with no luminance difference at all, is not an accent that
 * works. Function needs more separation than detection, and nobody has measured how much more.
 *
 * So this constant is a **new quantity awaiting its own round**, not a re-derivation of an old one.
 * It shares nothing with `ACCENT_VISIBILITY_COLOR_DISTANCE` but the units.
 *
 * ## Where the placeholder digits come from, and what they are worth
 *
 * They are **bracketed by the reviewer's own answers, then interpolated** — a placeholder with two
 * real anchors, which is the best available before the round runs. The anchors are the rungs of
 * bracketing round 1 part 2's equal-luminance accent ladder
 * (`data/calibration/bracketing-round-1.json`, stratum `accent-equal-luminance`), whose ten stimuli
 * sat at OKLab distances 0.01267, 0.01615, 0.02230, 0.03231, 0.04692, 0.06339, 0.08804, 0.11743,
 * 0.14813, 0.24181. The reviewer answered "not visible" up to 0.06339 and "clearly visible" from
 * 0.08804 up — a completely separated ladder, which is why 0.07444 is a gap midpoint rather than a fit.
 *
 * - **Lower anchor, 0.08804** — the lowest rung the reviewer called clearly visible, and precisely the
 *   answer the refinement above retracts as "hardly perceptible". The functional threshold is
 *   therefore strictly *above* it. This is the one thing the refinement states outright.
 * - **Upper anchor, 0.24181** — the top rung, called clearly visible and **not** retracted. A
 *   threshold above it would refuse an accent the reviewer plainly endorses, and the same refinement
 *   opens with *"we want to keep that class of accents"*.
 *
 * `sqrt(0.08804 × 0.24181) = 0.14590302…`, rounded to five decimals. The *geometric* midpoint, and
 * deliberately so: it is the estimator `ACCENT_VISIBILITY_COLOR_DISTANCE` already uses for exactly
 * this situation — a value known to lie inside a bracket and nowhere more precisely — so the two
 * placeholders are at least wrong in the same, documented way. It lands between rungs 08 (0.14813)
 * and 09 (0.24181), which is to say the carve-out admits the two rungs the reviewer called visible by
 * a wide margin and refuses the two nearest the boundary they have now doubted.
 *
 * **What this is not.** It is not a measurement of functional visibility: no stimulus was ever graded
 * against the criterion this constant is named for. It is 1.96× the retired 0.07444 and 6.4–15.7× the
 * regional same-colour bars, which satisfies "well above the JND bars" — but "well above" is a
 * direction, and a direction is not a number. Treat any verdict that turns on this digit as
 * provisional. See the proposed functional-visibility round in the loose-end ledger.
 *
 * ## Where it applies
 *
 * **The accent only, and only at the epsilon.** The foreground gets no escape of any kind, at any
 * distance — the same refinement says an isoluminant foreground *"will not be fine at all"*, which
 * matches the standing v2-3 verdict that text is luminance-driven. And a caller who raises
 * `minAccentContrast` above the epsilon is asking for luminance contrast specifically; "but it is a
 * different hue" does not answer that request, so above the epsilon the accent clause is
 * one-dimensional too.
 */
export const ACCENT_FUNCTIONAL_DISTANCE = 0.14591

/**
 * How far a palette's declared `effectiveRawMagnitude` may sit from the value its recorded
 * `requestedLc` resolves to before invariant 1 calls it a misreport.
 *
 * `[HELD]` — a numeric-noise allowance, not a policy. The resolution is exact arithmetic
 * (`max(|Lc| + 2.7, ε)`), so the only legitimate discrepancy is float round-tripping through JSON;
 * 1e-9 is far above that and far below any floor a caller could mean.
 */
export const CONTRAST_FLOOR_TOLERANCE = 1e-9

/**
 * Fraction of the artwork a published colour occupies, the value the **report-only** population
 * figure is quoted against. **Retired as a gate on 2026-08-04** — it no longer decides validity.
 *
 * `[INHERITED]` — v2-3's `RAMP_SUPPORT_MINIMUM_POPULATION_FRACTION`
 * (`research/v2-3/src/internal/ramp-midpoint.ts:55`). The digits are unchanged and deliberately so:
 * a retired threshold keeps its value so a census over historical results still means what it meant.
 *
 * **Its stated reasoning did not survive contact with data, and is recorded here rather than
 * deleted.** The inherited argument was that one thousandth of the artwork is ~400 pixels on a
 * 640×640 master and ~120 on a 350 px thumbnail, two orders of magnitude above the noise floor, so
 * JPEG ringing in the shadows could not certify a colour. `BELONGS_STUDY.md` refutes the mechanism
 * directly: ringing *shatters* a colour's exact-triple count rather than inflating it, so the floor
 * was never protecting against the thing it named.
 *
 * What the study measured (see `validateSourceSupport` for the ruling that acted on it): the floor
 * has no discriminating power at any threshold — endorsed and known-bad colours have the *same
 * support*, minimum neighbourhood share 6.59e-5 versus 5.86e-5 — and as shipped it refused 340 of
 * 351 palettes whose colours the reviewer endorsed.
 *
 * Still scale-free by construction, as `CONVENTIONS.md` requires; that part was always right.
 *
 * **Do not restore this as a gate without new evidence.** If a hard noise guard is ever wanted,
 * `BELONGS_STUDY.md` recommends 5e-5 — below the minimum observed on any tier — and requires its
 * docstring to say in terms that it is a noise guard and not a quality signal.
 */
export const SOURCE_POPULATION_FLOOR = 0.001

/**
 * APCA G-4g constants, verbatim from the vendored `apca-w3@0.1.9` `SA98G` table.
 *
 * `[INHERITED]` — none of these are ours to tune. They are duplicated here rather than imported
 * because `apca-w3` exports only the clamped Lc, and invariant 4 needs the raw pre-clamp value
 * (`PHASE_0_DECISIONS.md` §4: the public Lc scale clamps everything below ~7.3 to 0 and so cannot
 * tell "truly invisible" from "very low but real"). `contract-color.test.ts` cross-checks our
 * clamped output against the package on a colour grid, which is what keeps this copy honest.
 */
export const APCA_G4G = {
	/** Monitor transfer exponent. */
	mainTRC: 2.4,
	/** sRGB luminance coefficients. */
	sRco: 0.2126729,
	sGco: 0.7151522,
	sBco: 0.0721750,
	/** Normal polarity (dark text on light background) exponents. */
	normBG: 0.56,
	normTXT: 0.57,
	/** Reverse polarity (light text on dark background) exponents. */
	revTXT: 0.62,
	revBG: 0.65,
	/** Black soft-clamp threshold and exponent. */
	blkThrs: 0.022,
	blkClmp: 1.414,
	/** Output scalers. */
	scaleBoW: 1.14,
	scaleWoB: 1.14,
	/** Offsets subtracted after the low clip. */
	loBoWoffset: 0.027,
	loWoBoffset: 0.027,
	/** Below this ∆Y the package returns 0 before computing anything. */
	deltaYmin: 0.0005,
	/** Below this |SAPC| the package clamps the output to 0. */
	loClip: 0.1,
} as const

/**
 * The low clip expressed on the same ×100 scale as Lc and as our raw values.
 *
 * `[INHERITED]` — `APCA_G4G.loClip * 100`. Any pair whose |raw| is below this reports Lc 0, which is
 * exactly the blindness invariant 4 works around.
 *
 * Written as a literal for legibility, and it is exact either way: `0.1 * 100 === 10` in IEEE-754
 * double arithmetic, with no representation error. (An earlier version of this comment claimed
 * `0.1 * 100` was 10.000000000000002 and used that as the reason. It is not — the claim was false,
 * and is corrected here per `reviews/phase-0-adversarial/contract.md` finding 9. The hazard it
 * describes is real, but it belongs to `LC_DEAD_BAND_CEILING`, not to this constant.)
 * `contract-color.test.ts` asserts the literal against the derivation, so the provenance is checked
 * rather than merely claimed.
 */
export const APCA_RAW_LOW_CLIP = 10

/**
 * Top of Lc's dead band: the smallest non-zero magnitude Lc can express.
 *
 * `[INHERITED]` — `(APCA_G4G.loClip - APCA_G4G.loBoWoffset) * 100`. Lc jumps from 0 straight to 7.3;
 * nothing in between is representable. This is why `PHASE_0_DECISIONS.md` §2 makes the contrast
 * parameters' default equal to their minimum equal to an epsilon expressed in raw units — the
 * default lives below the range the public unit can say.
 *
 * **This is the constant where writing the literal actually matters**, and it is the only one of the
 * three: `(0.1 - 0.027) * 100` is 7.300000000000001 in binary floating point, not 7.3, so computing
 * it would put the value one ulp above the number this file means — and this value is a *threshold*.
 * (`0.1 * 100` and `0.027 * 100` are both exact, so `APCA_RAW_LOW_CLIP` and `APCA_LC_TO_RAW_OFFSET`
 * are literals for legibility only.) `contract-color.test.ts` checks the derivation and, since
 * 2026-08-03, checks which of the three products is exact — the 1e-9 tolerance it used before could
 * not tell the cases apart.
 */
export const LC_DEAD_BAND_CEILING = 7.3

/**
 * Offset between |Lc| and |raw| above the low clip.
 *
 * `[INHERITED]` — `APCA_G4G.loBoWoffset * 100`. Both polarities use the same offset in
 * `apca-w3@0.1.9`, so the conversion is symmetric; `contract-color.test.ts` asserts both the
 * derivation and the symmetry.
 */
export const APCA_LC_TO_RAW_OFFSET = 2.7

/**
 * Canonical form of the input content hash recorded in palette metadata.
 *
 * `[INHERITED]` — sha-256, hex, lowercase: the digest used everywhere in this repository
 * (24,249 `createHash("sha256")` call sites and no other algorithm). `CONVENTIONS.md` requires
 * artworks identified by full path plus content hash, so the hash is not optional and its shape
 * is worth checking.
 */
export const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/

/**
 * Canonical form of a published colour's hex string: lowercase, six digits, leading `#`.
 *
 * `[HELD]` — a format decision, not a measurement. It exists because invariant 3's sanctioned
 * collapses are defined as *exact hex equality*, and "exact" only means something once one
 * spelling is canonical.
 */
export const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/

/**
 * Legal range for a gradient stop position and for normalized geometry coordinates.
 *
 * `[REVIEWED]` — `PHASE_0_DECISIONS.md` §4 invariant 1 ("stops 2–4 with ordered positions in
 * [0,1]"). Normalized coordinates rather than pixels per `CONVENTIONS.md`'s scale-free rule.
 */
export const POSITION_MIN = 0
export const POSITION_MAX = 1

/**
 * How many uniform samples of the rendered ramp invariant 4 evaluates **per segment** between
 * consecutive published stops, in the coarse pass.
 *
 * `[MEASURED — tests/contract-ramp.test.ts, 2026-08-03]`, and the measurement is the provenance: the
 * test re-derives every number below and fails if any of them stops holding.
 *
 * The reviewer's whole-ramp ruling turns a floor check into a minimisation, and a minimisation by
 * sampling owes an answer to "what could you have stepped over?". There are two ways to miss, and
 * they have different answers.
 *
 * **1. Stepping clean over a below-floor excursion.** This is the one that would matter — a ramp that
 * dips under the floor between two samples and is never seen to. It cannot happen, and the argument
 * is a **per-step reach** bound rather than a slope: the rendered ramp is 8-bit, so `|raw|` along it
 * is a step function and an instantaneous derivative measures the framebuffer, not the function. What
 * matters is how far `|raw|` can move between two adjacent samples. That splits in two, because
 * APCA's polarity flip is a genuine discontinuity:
 *
 * - *The ramp crosses the subject in luminance.* APCA's branch changes and `raw` changes sign. Both
 *   sides of the flip are small — the two branches straddle the same-colour residue, bounded by
 *   `APCA_RAW_IDENTICAL_CEILING` = 1.98152. Measured, the better of the two samples adjacent to any
 *   flip reads at most **1.21527** raw units, which is below the smallest floor the contract can
 *   express. So a luminance crossing is **always** caught, however narrow it is in `t`. This is the
 *   case that produces the deepest violations, and it needs no density argument at all.
 * - *It does not cross.* Then `|raw|` moves smoothly, by at most **0.69511** raw units between
 *   adjacent samples at this density. So if the true minimum is `m`, the nearest sample reads at most
 *   `m + 0.69511`, and **every true minimum below `F − 0.69511` is certainly seen** at floor `F` — at
 *   the smallest floor, everything below 1.805.
 *
 * Between them the two cases cover every way a ramp can approach a floor. The empirical half agrees:
 * 0 verdict disagreements against a 16× denser reference over 120 random ramps × every floor a caller
 * can request (Lc 2.5 to 108.0 — 212 floors).
 *
 * **2. Overstating the depth of a minimum.** `|raw|`'s true minimum sits in whichever 8-bit
 * quantisation cell comes closest to the subject's luminance, and a cell can be narrower than a
 * sampling step. This is a real error and it is why `RAMP_REFINEMENT_SAMPLES` exists. After
 * refinement the measured worst overstatement is **≤ 0.05 raw units wherever the true minimum is at
 * or above 1 raw unit**. Below that it stays larger — but a minimum under 1 raw unit is under *every*
 * floor the contract can express, so the verdict is identical and only the quoted number moves.
 *
 * 2048 is the smallest power of two clearing (1) with room to spare; a 4-stop ramp costs 6145 coarse
 * samples and roughly 3 ms, so the density is not paid for by anything that matters.
 */
export const RAMP_SAMPLES_PER_SEGMENT = 2048

/**
 * How many extra samples the ramp minimisation spends inside the one coarse step either side of the
 * coarse minimum.
 *
 * `[MEASURED — tests/contract-ramp.test.ts, 2026-08-03]`. See failure mode 2 in
 * `RAMP_SAMPLES_PER_SEGMENT`: uniform sampling can step over a narrow 8-bit quantisation cell and
 * overstate the minimum by up to **0.406 raw units** at the coarse density alone, which is 16% of the
 * ε floor and too much to quote in a violation. Rescanning the coarse minimum's neighbourhood puts
 * the effective sampling rate where the answer is at `2048 × 4096 / 2 ≈ 4.2 M` per segment and cuts
 * the overstatement to **≤ 0.05** raw units over the whole verdict-relevant range (0.0211 on the
 * seeded sweep the test runs; the assertion carries the band rather than the point estimate).
 *
 * It does **not** need to make the number exact in the deep basins (true minimum < 1 raw unit), where
 * a broad flat bottom can put the closest cell outside the refined neighbourhood and a few tenths of
 * a raw unit remain. Nothing reads that difference: a minimum that low is below every floor the contract can
 * express, so the violation fires either way and the reported figure is already "invisible".
 */
export const RAMP_REFINEMENT_SAMPLES = 4096
