# P4 — portfolio of rival extractors under a selector

**Orchestrator spec, 2026-08-11. Governing docs: `PHASE_2_HANDOFF.md` §2 P4, `arm-c.md`,
`arm-c-prime.md`, `PRIOR_ART_CHECK.md` §P4, `PROTOTYPE_ORCHESTRATOR_BRIEF.md`.**

## 1. What is under test

Not the members. The selector. Prior art (§P4): portfolios were built in every era; every
selector was a hand-weighted confidence, a fitted preference model that failed its gate, or a
human. The one unproven claim P4 exists to test: **a non-fitted, member-independent selection
currency succeeds where four fitted/hand-tuned selectors failed.**

Per the Phase 2 handoff, the members are the campaign's REAL judge-tested prototypes, not
arm-c/c′'s thin sketches. This is the stronger test of the selector and the only honest one now
available.

## 2. The selector (adapted from arm-c′ §2.3 to black-box members)

Arm-c′ prices rival *field descriptions* in bits. Our members are full pipelines, so the currency
is applied one level up, to their OUTPUTS: **each member's published palette is read as a
compact description of the image, and priced in bits.**

- L(member) = L(palette) + Σ cells: residual negative log-likelihood at scale σ, where the
  reconstruction implied by the palette is: its field (flat colour or its published gradient
  rendered over the frame, OKLab-interpolated per the pinned display mapping) explaining the
  field pixels, its foreground/accent explaining pixels within the same-colour bar of those
  roles, everything else priced as unexplained residual at σ. σ is measured from the file
  (arm-c′ §2.1); the lattice-of-sufficient-statistics substrate is arm-c′ §2.1 verbatim; P6's
  verified blur-ladder/lattice machinery is the named implementation donor.
- L(palette): a fixed schema price — roles present, gradient boolean, stops — derived from the
  output contract itself (no coefficients). Collapses make palettes cheaper, as they should.
- **Member-independent by construction:** no member emits a score, weight, or confidence; the
  currency never sees which member produced a palette. Adding a member costs zero constants.
- **Immateriality check first (arm-c′ §2.3b):** if top members' palettes agree on the contract's
  own same-colour bar, selection is recorded as immaterial. No decision, no risk.
- **Measured margins (§2.3c):** block bootstrap over lattice cells, refit-free (palettes are
  fixed; only the residual sum is resampled); winner stands when the Wilson interval on its win
  fraction excludes ½, up to a compute cap.
- **Tie-break (§2.3d):** cheaper L(palette) — fewer published distinctions — wins. The
  conservative direction (biased against spurious structure), stated once, measurable corpus-wide.

## 3. Pre-registered falsifiers (before any implementation)

- **F1 — currency does not discriminate:** if across the coverage corpus the bootstrap win
  fraction sits near ½ on a large share of covers WHERE PALETTES MATERIALLY DIFFER, description
  length has no evidence to run on here. Selector falsified (arm-c′'s own second falsifier).
- **F2 — the relapse:** if a viable implementation requires any per-member weight, reliability
  constant, prior, or threshold (anything a member brings that the currency consumes), the
  historic failure has repeated. Falsified regardless of scores. Hand-set constants ARE the
  failure shape; discovering we need one is the result, not a licence to add it.
- **F3 — the selector earns nothing:** the selector only matters where members disagree. If, on
  disagreement covers, the reviewer's verdicts do not prefer the selector's choice over the
  fixed best single member (P3 as of its STATE.md), the portfolio adds risk without value.
  Measured by the round protocol in §5.

### 3.1 Registered decision candidate (pre-registration, 2026-08-11, not yet implemented)

M2 measured that arm-c′'s σ estimator returns exactly 0 on covers where most adjacent pixel
pairs are byte-identical (4/20 demo-20) — the likelihood degenerates and those covers are
REFUSED, not priced. No noise floor was added (F2). The candidate resolution, registered before
implementation: **σ_effective = max(σ_measured, the encoding's own quantization scale)** — 1 LSB
of 8-bit sRGB converted analytically to OKLab at the relevant operating point. This is derived
from the file format, not chosen; its anchor is arithmetic (like the consistency factor), not a
sweep, and arm-c′'s own anchor for decision 3 (the dither arm) is exactly a ±1-LSB probe — the
same scale. Until this is acknowledged by the main tier and implemented with its analytic
derivation in the provenance comment, refusals stand and are excluded from all denominators.

Initial set, pinned by worktree commit + fingerprint at integration time (M1):
P3 per-pixel fields (0.4.x), P2 tree-of-shapes merged candidate, P5 field-fit v0.8.2,
P1 λ-repaired arm-a (graft from a closed arm; probe member — its 240 s search budget is
runtime-hostile, so it runs at its 60 s budget as a probe and its membership is decided by the
retention rule, disclosed). Retention rule (arm-c′ free-param 2): a member never the outright
winner on a non-trivial corpus share is deleted — a set edit, one sentence, inspectable.
Runtime: all members run per-file, cold, no tables, no models; portfolio cost = Σ members + the
selector's substrate pass (arm-c′ prices the substrate at tens of ms; members dominate).
Member code is READ-ONLY: snapshotted into `members/` with provenance (commit, fingerprint,
byte-identity verification against a home-worktree run) — never edited in place.

## 5. Round protocol

First REVIEW-READY as early as honest: **selector-vs-best-member pairwise on disagreement
covers** — side A the selector's elected palette, side B P3's palette, on covers where they
differ materially; blinded, stems, standard staging. The selector earns its existence exactly
where it disagrees (F3). Later rounds: membership ablations if verdicts warrant.

## 6. Milestones

- **M1 — members integrated:** snapshots + provenance + byte-identity gates; all members run on
  demo-20 from this subtree; disagreement matrix (role-level, same-colour bar) + timings. The
  disagreement rate sizes the selector's whole value: if members rarely disagree materially,
  P4 is answered cheaply ("immaterial portfolio") — record and escalate.
- **M2 — substrate + currency:** lattice/census/σ pass (P6 donor machinery), L(·) implementation,
  zero new constants beyond arm-c′'s eight anchored decisions (each tagged, each anchored as the
  proposal states; any constant outside that list trips F2).
- **M3 — selector run + F1 measurement** on coverage-set-1; immateriality/margin/win-fraction
  tables published as the bit table (arm-c′ §8).
- **M4 — round 1** per §5, then F3 reads off the verdicts.

Reviewer principles corpus (RANKING P4 section) binds throughout: margins-not-floors, identity
coverage, salience gates eligibility, guide-stop canon — the selector inherits them via its
members and must not undo them (the currency prices explanation, not compliance; contract
validity remains each member's own duty and invalid palettes are excluded before selection,
recorded).
