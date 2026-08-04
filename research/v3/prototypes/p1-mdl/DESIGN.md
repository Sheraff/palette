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
