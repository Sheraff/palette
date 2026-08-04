# P1 — one global objective priced as description length

**Prototype orchestrator's design spec, 2026-08-04.** Mechanism from `PHASE_2_HANDOFF.md` §2 P1;
sources: `phase-1/proposals/arm-a.md`, `arm-a-prime.md`, `phase-1/PRIOR_ART_CHECK.md` §P1.
The goal outranks the details (reviewer ruling): this spec commits to the mechanism and to a v0
that can be measured, not to every sentence of either proposal.

## The mechanism (what may not be compromised)

- **One scalar objective over the whole configuration** — four roles, gradient boolean, stops,
  collapse flags — minimised together. No stage picks a role before another; no candidate
  shortlist; no per-role filter. If the code ever chooses a background and hands the rest to a
  later step, it is off-mechanism.
- **The contract is the feasible set, never a term.** Invariants shrink the search space;
  the objective never rewards contrast, distinctness, or legality.
- **Mass is read smoothed, never exact-bin.** All objective mass flows through a kernel of the
  identity bar's width (endorsed median exact-triple share 8.89e-5 vs 1.91e-2 at the bar — a
  215× gap the objective must live on the right side of).
- **The energy is a function of any contract-legal palette**, not only of palettes we produce.
  This is the falsifier's mechanism and ships in v0 before any emitter.
- **Search discards only by certified bound** (or exhaustively at v0's coarse scale). Anytime,
  deterministic, with a published optimality gap. No RNG, no hash-order iteration; canonical
  sort + fixed tie-break (smoothed mass desc, hex asc).

## The internal experiment (the two priors)

Shared machinery, two energies, two candidateIds:

- **`p1a` (arm A):** explanatory cost in nats per unit image mass + λ·Ω(x), Ω counting structural
  elements (surface≠background: 1; ramp: 1; each interior stop: 1; accent≠foreground: 1).
  Field/ink membership is soft — logistic in the extent statistic e(p) from a dyadic box-mean
  ladder, with split scale s* optimised jointly.
- **`p1ap` (arm A′):** E(P) = L(pixels|P) + λ·L(P), where L(P) is the contract object's own
  serialization cost in bits (24 bits per named colour, gradient boolean, stops, flags).
  Field/ink separation via the support map's own coding cost (broad/low-frequency cheap under a
  coarse code; stroke-like cheap under an edge/run code).

## Decisions fixed by this spec (picked and stated, per handoff §4)

1. **Colour kernel bandwidth = the frozen regional same-colour bar** from
   `src/contract/constants.ts`. `[INHERITED]` — the model's one length scale IS the measured
   identity scale. Nothing may depend on its exact digits.
2. **λ v0 = 1.0, `[UNCALIBRATED]`,** with a mandatory sensitivity sweep λ ∈ {¼, ½, 1, 2, 4} in
   the falsifier stage. The λ review round (arm A §4.3) comes only after the sweep says the
   answer isn't flat.
3. **Foreground/accent assignment in v0: feasibility first, then ordering** (accent = the legal
   ink assignment moving further from the field in lightness, chroma secondary) — arm A′'s
   device, used for BOTH priors in v0. Arm A's anisotropic accent kernel (ratio `[UNCALIBRATED]`,
   range [1,4]) is deliberately deferred: an ordering costs no constant. Revisit only if the
   instruments show F/A assignment errors. Recorded as a v0 simplification of arm A.
4. **Residual/unexplained model:** arm A: uniform density over sRGB gamut (parameter-free);
   arm A′: the image's own smoothed colour density. Each arm keeps its own — it is part of the
   prior under test.
5. **Ramp orientation:** increasing t along the renderer's 135° axis; two-flat order: larger
   field mass is background. Two conventions, named as such.
6. **Escape branch:** search in-artwork feasible set; only if EMPTY, evaluate the two escape
   configurations. Expected to essentially never fire (1,396/1,397 endorsed role colours are
   exact source triples).
7. **Arm A's data term is the log of the field/ink/residual mixture, not the proposal's literal
   mass-weighted sum of logs** (decided 2026-08-04 after implementation). The literal §2.3 form
   double-counts: mass the field explains still enters the ink term at weight 1−π, so an ink
   colour adjacent to a large field colour harvests the leak — measured to invert the arm's own
   vivid-accent prediction (test d) — implementer measured 2.6e-3 nats; the independent verifier
   measured 1.03e-3 under a stated ε-profiling convention. Direction confirmed, magnitude
   corrected for the record 2026-08-04. The mixture is the genuine code length; the split form is
   its Jensen upper bound. Same mechanism, correct arithmetic. Not escalated, per the
   principles-bind-numbers-don't standard.
9. **Known defect awaiting fix (verifier finding, 2026-08-04): arm A's ink term prices no
   support.** On a clean diptych, "flat + second band as foreground" (Ω=0) undercuts two-flat at
   every λ; 62% of a solid band's mass lands in ink at the finest profiled s*. Arm A′ prices
   support and is immune. Fix in arm A's own vocabulary (§2.2: ink is small/high-frequency/
   marks-like ⇒ broad ink must pay), applied AFTER the M1 falsifier lands so M1's arm-A numbers
   correspond to one committed energy; falsifier re-runs after. Also owed in that fix:
   MIXTURE_WEIGHT_FLOOR is load-bearing (profiled ε pins to it on 3/4 fixtures) with a
   justification comment about quantities it does not govern — restate honestly.
8. **Ramp direction is profiled per evaluation** (the measurement's axis sign is a
   measurement-side convention); the renderer's 135° rule governs presentation, not the energy.

## Reviewer evidence from the first P5/P2 rounds (2026-08-04), folded in pre-M2

Four verdict classes relayed by the main orchestrator, mapped onto this mechanism — recorded
BEFORE our first emitter run so later reads are attributable:

1. **Foreground readability is the dominant failure class.** This mechanism's position, held
   deliberately: contrast is never rewarded, only bounded (arm A′ §2.4 — the foreground is
   legible because it is the colour the artwork used for its ink, recovered by reconstruction).
   We will NOT add an APCA reward term; that would abandon the mechanism under test. Instead:
   (a) the emitter enforces the contract's whole-ramp APCA floors exactly as the contract states
   them, and (b) every emitted palette carries min-|APCA|-over-the-rendered-ramp for fg and
   accent as a REPORTED diagnostic. **Pre-registered consequence: if our foregrounds draw the
   same "unreadable" verdicts, that falsifies the ink-recovery story, not the tuning.**
2. **Indistinguishable sibling pairs are forbidden — collapse instead.** Priced structurally
   already: two kernels within an identity bar explain no better than one, so the extra name
   never repays λ and the model collapses; the contract bar additionally makes near-twins
   infeasible. Tested (energy suites, case a). These verdicts say that price is real.
3. **Identity (vivid accents mined from the artwork; shades must exist in it; black text →
   black foreground).** The naming-gain mechanism is exactly this bet (isolated vivid cluster =
   largest coding gain; tested, case d), and exact-triple sourcing is hard in the feasible set.
   Supporting evidence for the currency, not a change.
4. **A gradient on a flat artwork is a graded-down error.** The gradient boolean is priced (λ);
   arm A′'s own pre-registered weak class is gradient over-publication on skies. This verdict
   class is the calibration anchor for λ from above: λ must price ramps high enough that flat
   artwork never buys one. Read the M1 λ-sweep with this in hand; the λ review round (if the
   sweep isn't flat) should include flat-artwork items.

Third-round addendum (relayed 2026-08-04, after the above was committed):

5. **Accent readability is graded down too, against both surface and background.** Position
   unchanged (bounded, never rewarded — the contract's accent floor and its one escape are in
   the feasible set), but the M2 report-only diagnostic covers BOTH inks: min-|APCA| over the
   rendered ramp for foreground AND accent, per palette.
6. **The reviewer notices fg/accent ordering errors specifically** (one round asked for a role
   swap of correctly extracted colours). This is evidence for the joint mechanism's central
   claim — assignment is decided inside the one minimisation — and it stresses deferred
   decision 3. Concrete: M2 emits the F/A-swapped runner-up's energy delta as a per-palette
   diagnostic (arm A §8's runner-up list), so near-tied assignments are visible before a
   reviewer has to ask. If swap requests land on palettes where the delta was near-zero, the
   ordering (not the currency) is the weak part and decision 3's deferral gets revisited.
7. **Gradient-wrongness pricing is unpredictable round-to-round** (a hedged false-gradient note
   cost zero once). Calibrate λ on the direction (flat artwork must not buy ramps), never on
   per-verdict grade arithmetic.

## Module layout (all under `research/v3/prototypes/p1-mdl/`)

- `src/measure/` — decode (sharp 0.33.5, dims from header, refuse transparency loudly),
  per-triple table (exact integer counts + spatial moments), dyadic ladder + extent profile,
  smoothed density, closed-form geometries (linear/radial/conic) + (t, colour) joint.
- `src/emit/` — palette assembly + metadata/fingerprint, feasibility via `src/contract`
  (scorecard mode in dev), L(P) serialization cost, escape machinery.
- `src/energy/a.ts`, `src/energy/aprime.ts` — the two priors. Both expose
  `energyOf(measurement, palette) -> {total, terms}` for arbitrary contract-legal palettes.
- `src/falsifier/` — score legacy fixtures (351 endorsed / 166 acceptable / 37 known-bad,
  three tiers never concatenated) with both energies; paired same-artwork comparisons through
  `src/stats`.
- `src/search/` — v0: coarse exhaustive over a colour lattice with exact re-evaluation of
  survivors; v1: certified branch-and-bound. Differential test: exhaustive-vs-search identical
  configurations on a coarsened set (arm A §6's mandatory test).
- `candidates/p1a.ts`, `candidates/p1ap.ts` — devloop candidate modules.
- `tests/` — unit + determinism (double-run byte-identical) + differential tests.

## Milestones (pre-registered order)

- **M1 — energies without search.** Falsifier runs on legacy verdicts. Pre-registered reading
  (arm A′ §7, before any result is seen): if endorsed palettes are NOT systematically lower in
  energy than known-bad for the same artwork — no rank signal, no single term culpable, at any λ
  in the sweep — the currency is wrong, and that is reportable evidence, not a tuning prompt.
  (Legacy verdicts are weak evidence by construction; the result guides, the reviewer judges.)
- **M2 — v0 emitter** over demo-20 → scorecard, adjudication, robustness on both priors.
- **M3 — prior comparison + first review round** (pairwise p1a vs p1ap on the same artworks
  where they differ, or calibration if they agree).

## Verification discipline

Every load-bearing layer gets an independent verifier that re-derives from artifacts, not from
the implementer's claims: the measurement table (naive recomputation on small images +
determinism double-run), the energies (hand-computed values on synthetic images), the search
(differential vs exhaustive). Worker self-reports are evidence, not verification.
