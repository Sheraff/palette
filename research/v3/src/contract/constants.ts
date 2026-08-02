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
 * The one ruler: the same-colour bar, as a Euclidean distance in OKLab.
 *
 * `[UNCALIBRATED]` — v2-3's prior translated into the new unit. A starting point, not an answer.
 * v2-3 used CIE76 ΔE 3.3 (`research/v2-3/src/internal/policy.ts:109`, `distinctness.sameColor`,
 * measured through `perceptualDifference`: Euclidean distance in **D65** CIELab).
 * `PHASE_0_DECISIONS.md` §3 moves the ruler to Euclidean OKLab and says the threshold is to be
 * bracketed by the reviewer in a purpose-built round.
 *
 * **The exact protocol, because the answer depends on it.** Reproduce with
 * `calibration/same-color-bar-translation.ts` (seeded mulberry32, deterministic):
 *
 * - Ruler: CIE76 in D65 CIELab, white point [0.95047, 1, 1.08883], byte-identical to v2-3's
 *   `perceptualDifference`. Not `colorjs.io`'s `lab`, which is D50-adapted and answers a different
 *   question — an error in this constant's first derivation.
 * - Sampling (scheme B, "exact-ΔE ray", seed 555): draw a base colour uniformly over the
 *   *continuous* sRGB cube and a uniformly random direction; bisect along that ray for the point at
 *   exactly ΔE 3.3; discard pairs leaving the cube; accept within ΔE 3.3 ± 0.15. 30,000 pairs.
 * - Result: OKLab distance **median 0.01162**, p05 0.00784, p95 0.02434. Rounded to 0.012.
 *
 * **Why that scheme and not another.** The obvious alternative — perturb each 8-bit channel by a
 * random offset in [-radius, +radius] and keep pairs near ΔE 3.3 — has a free knob, and the answer
 * tracks it: median 0.00955 at radius ±3, 0.01235 at ±8, 0.01698 at ±48 (full sweep in the
 * calibration script). That is a factor of 1.8 across plausible protocols, far more than any
 * rounding. The exact-ΔE ray has no such knob: the step length is fixed by the ΔE constraint rather
 * than chosen. **This spread is the finding.** There is no single OKLab distance that "means" ΔE
 * 3.3, only a distribution, so a translated prior cannot substitute for the bracketing round — it
 * can only say where to start looking.
 *
 * **Four-quadrant check** (same scheme, seed 556): medians dark/neutral 0.01130, dark/saturated
 * 0.01186, light/neutral 0.01096, light/saturated 0.01163. The between-quadrant spread (0.0009) is
 * an order of magnitude smaller than the within-quadrant spread (p05→p95 ≈ 0.017), which is mildly
 * encouraging for §3's "does one threshold survive all four quadrants" question but does not settle
 * it — the reviewer's eyes do.
 */
export const SAME_COLOR_BAR = 0.012

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
 * `[UNCALIBRATED]` — same status and same placeholder reasoning as `EPSILON_TEXT_RAW`, plus one
 * unresolved question carried by §6: a chromatic icon at equal luminance can be visible, so the
 * accent floor may properly live in colour distance (already enforced by invariant 3) rather than
 * in luminance at all. The bracketing round shows the reviewer flat equal-luminance chromatic
 * accent pairs and decides. Set equal to the text epsilon until then — deliberately *not* a claim
 * that they are equal.
 */
export const EPSILON_ACCENT_RAW = 2.5

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
 * Fraction of the artwork a published colour must occupy for its source support to count
 * (`PHASE_0_DECISIONS.md` §4 invariant 2).
 *
 * `[INHERITED]` — v2-3's `RAMP_SUPPORT_MINIMUM_POPULATION_FRACTION`
 * (`research/v2-3/src/internal/ramp-midpoint.ts:55`). Its stated reasoning transfers unchanged: one
 * thousandth of the artwork is roughly 400 pixels on a 640×640 master and roughly 120 on a 350 px
 * thumbnail, two orders of magnitude above the noise floor at either scale, so JPEG ringing in the
 * shadows cannot certify a colour. Scale-free by construction, as `CONVENTIONS.md` requires.
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
 * Written as a literal rather than as the product because `0.1 * 100` is 10.000000000000002 in
 * binary floating point, and this value is a *threshold*: a pair sitting exactly on it would fall on
 * the wrong side. `contract-color.test.ts` asserts the literal against the derivation, so the
 * provenance is checked rather than merely claimed.
 */
export const APCA_RAW_LOW_CLIP = 10

/**
 * Top of Lc's dead band: the smallest non-zero magnitude Lc can express.
 *
 * `[INHERITED]` — `(APCA_G4G.loClip - APCA_G4G.loBoWoffset) * 100`. Lc jumps from 0 straight to 7.3;
 * nothing in between is representable. This is why `PHASE_0_DECISIONS.md` §2 makes the contrast
 * parameters' default equal to their minimum equal to an epsilon expressed in raw units — the
 * default lives below the range the public unit can say. Literal for the same floating-point reason
 * as `APCA_RAW_LOW_CLIP`, and checked against the derivation by the same test.
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
