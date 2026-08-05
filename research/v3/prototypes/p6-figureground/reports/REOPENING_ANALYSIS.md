# P6 reopening analysis — verdict: MECHANISM-FALSIFIED

Orchestrator-authored, 2026-08-05, after round 1 (batch phase2-cal-008, MOSTLY WEAK, 6/6 low) and
the pre-registered sensitivity sweep (`sensitivity-1.md`). Written to the two main-tier anchors:
(a) if pricing the margins the reviewer grades requires free exchange rates, that IS the
mechanism failing its own defence; (b) an honest MECHANISM-FALSIFIED is a fully successful
prototype outcome.

## The question

The MOSTLY-WEAK branch reopened the role-fitness vocabulary as a whole. The reopening question,
as pre-registered: **does a within-mechanism reformulation answer all three structural
signatures from stated principles, without new free exchange rates?**

## The evidence

Three structural signatures from round 1 + the battery, now joined by the sweep:

1. **Role degeneracy.** Accent fitness ≡ foreground fitness on greyscale artwork (rel-gap 3e-16).
   The sweep's answer to "does any anisotropy separate the roles": **no — it worsens
   monotonically** (fg≡accent fitness leaders: 13/18 covers at λ=0.25 → 18/18 at λ=8; swap gaps
   shrink monotonically with λ). On the covers the reviewer graded down for indistinguishable or
   mis-seated accents, the seat assignment is decided by gaps of ~1e-11 — that is, by the
   deterministic tie-break, not by the mechanism. The reviewer independently rejected the round's
   premise that one vivid + one pale colour can fill the two seats in either order.
2. **Barrier floor-sitting.** 5/6 "indistinguishable" complaints are published pairs clearing
   `sameColorBar` by 1e-4–3e-3; fg-APCA margins cluster at the ε floor (check 1, twice measured).
   The energy prices nothing above any barrier, and the optimum therefore sits ON the barriers.
   The reviewer grades margins; the mechanism cannot see them.
3. **Coverage family-blindness.** Major achromatic uncovered mass (ΔL 0.18–0.82) on 3/6 covers is
   invisible to the chroma-weighted transport; the reviewer named the missing black and missing
   yellow shades. Two genuine hue misses besides (Δh 105° at 1.9% mass; gold at 26.6%).

And the falsifier itself:

4. **Falsifier 3 fired.** `belonging` (×½ 69%, ×2 56% of palettes moved beyond the regional bar)
   and `collapse` (39%, 18%) are **load-bearing without principle** under the convention
   pre-registered before any data. The defence the proposal staked its identity on — prior
   multi-term failures were artifacts of quantised granularity; continuity cures them — is
   measurably false: the energy is continuous end-to-end, and its outputs still hinge on
   hand-set exchange rates. `PRIOR_ART_CHECK.md` §P6 predicted exactly this: *"exchange rates
   are a separate problem from graininess, and it does not answer it."*
5. **The quadrature is not flat.** `cellsPerBandwidth` coarser moves 17% of palettes — proposal
   §3 calls any palette-moving lattice knob a design violation. Bandwidth ×½/×2 moves 63–67%,
   which makes the h calibration (the 1.91e-2 anchor) load-bearing rather than checkable-inert.

## The reformulation question, answered per signature

- **Pricing margins** (signature 2): any term rewarding separation above a floor needs an
  exchange rate against belonging/coverage/fitness. The contract's calibrated quantities give
  *directions* (perception-4 explicitly refuses coefficients), so the rate would be hand-set.
  **Anchor (a) applies: this is the named relapse shape.**
- **Separating the roles** (signature 1): the vocabulary's two figure statistics (lightness
  displacement, chroma displacement) are measured to converge under the very weighting the
  proposal prescribes. A third statistic (spatial saliency, family membership, …) is a new term
  with a new rate. Same conclusion.
- **Family-aware coverage** (signature 3): extending transport to achromatic mass is arguably an
  interpretation fix, but the reviewer's "different colour family" structure needs hue-weighted
  distance — a reweighting of OKLab axes inside the transport, i.e. more exchange rates.
- And any reformulation would still stand on `belonging` and `collapse`, which are already over
  the pre-registered line as they are.

**No within-mechanism reformulation exists that does not add free exchange rates. The mechanism
fails its own defence. Verdict: MECHANISM-FALSIFIED.**

## What this does not say — kept precise for the record

- **The robustness pre-registration (falsifier 1: dither ≥0.98, jpeg-q92 ≥0.95) was never
  measured** — the harness run was queued behind the sweep and is now moot for a falsified
  mechanism unless the main tier wants the datum anyway (~30 min with --limit). UNANSWERED, not
  failed.
- **The substrate is verified sound and is salvage.** Independent verification (5/6 CONFIRMED,
  `verification-1.md`): exact search bit-identical to brute force at real scale; byte-determinism
  across processes with an empty exception mask; per-term faithfulness to 3e-17; the blur-ladder
  surround, habitual-ground statistics, lattice quadrature machinery, excursion profiler and the
  round-staging pipeline are all working instruments. P4's portfolio (and any arm needing a
  surround-at-scale substrate or an exact joint search) can take them whole — they are the
  unprecedented half of P6 per prior art; the *energy* is the relapsed half, and it is what
  failed.
- **Reachability (falsifier 2) never fired**: no endorsed colour was ever excluded by the pruned
  search — "the whole artwork is feasible for every role" held.

## Post-verdict corroboration (cross-arm, relayed 2026-08-05)

Another arm's audit found four of seven reviewer-named identity marks sitting at rank-0 of its
own ordering but excluded by a 0.1% population-support floor — against the corpus fact that the
median ENDORSED role colour has exact-triple share 8.89e-5. This sharpens two lines above for
whoever inherits:

- P6's per-mass ink/mark correction (W8) was the right direction and is part of the salvage:
  tiny concentrated marks are what gets endorsed, and any area/mass integral in role fitness
  fights the corpus's own endorsement pattern.
- The `belonging` term — the sweep's worst load-bearing-without-principle rate (69%/56%) — is
  not just unprincipled but *aimed the wrong way*: it charges colours for rarity while the
  endorsement record says rarity is what wins. The proposal knew the corpus fact (§2.2 quotes
  the 8.89e-5 figure) and priced belonging against it anyway, as a cost with no cutoff. A
  successor mechanism should treat presence mass as (at most) evidence about role, never as a
  cost on eligibility — which is also what reviewer-evidence row 9 (salience gates identity,
  presence ≠ eligibility) says from the other side.

## Disposition

Per the campaign standard this prototype is complete: mechanism genuinely attempted, judged by
the reviewer, falsified by its own pre-registered instruments, with the salvageable parts
verified and named. No further P6 rounds unless the main tier rules otherwise; the branch-digit
convention fix and real-ramps set pass to whichever arm inherits the substrate.
