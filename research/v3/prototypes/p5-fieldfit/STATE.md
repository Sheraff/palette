# P5 field-fit — where we're at (reviewer-ordered state doc, 2026-08-05; updated 2026-08-11)

**Delta since the 08-05 freeze:** pass 16 landed — foreground is class-first (overlay ink outranks
ground-shaped components; the item-3 cover now publishes the reviewer's verbatim round-3 ask,
fg `#000000` / accent `#f81107`, closing the mechanism side of the three-round rotation). v0.8.2
robustness: 41.7% overall, **dither 47% and accent instability 43.3% both best-ever**, fg 33.0%
flagged (class/coverage added threshold surface); stabilization pass still the queued fix. Round 4
staged and with the installer (`phase2-cal-020`): four returning covers incl. the deliberate
accent-union question (may a heavier region displace a reviewer-seen accent? two live instances),
the first real escape-path firing, and the only known cover inside the fg-floor bracket. §3's
"in flight at freeze" row is superseded by this paragraph.

## 1. Mechanism

Robust affine field fit (Tukey IRLS) *is* the segmentation: field = what the fit explains,
overlay = what it rejects; roles read off the decomposition. Extended in Phase 2 with recursive
field-like components (E2), ink-shape sourcing, and joint role assignment. No clustering, no
candidate walls, no models, ~0.35 s/palette at 300², 4.2 s at 3000².

## 2. Judge-validated strengths (round/verdict provenance)

- **Component field reading (E2)**: sunset cover `weak→weak→strong` across three rounds
  (phase2-cal-004→013); autumn-sky `unacceptable→acceptable`; every round-2 complaint retired by
  name; returning covers net **+5 grade-steps** in round 3.
- **Zero false gradients ever**: six published ramps across rounds, no gradient complaint in
  either direction on any of them (cal-013); the t-continuity discriminator's two-block/ramp
  split validated on both anchors.
- **Foreground legibility ruling**: its motivating cover `unacceptable→STRONG` (cal-004 item 1 →
  cal-013 item 1 field roles).
- **Accent identity rulings**: the reviewer's named pink published and verified (cal-013 item 4
  R2→R3 context); accent visibility floor separates cal-013's complaints **8-for-8** using the
  contract's own constant.
- **Two silent STRONGs** on fresh covers (cal-013 items 2, 7) — the type-colour fg+accent cover
  is the positive control for the ink-sourcing principle.

## 3. Measured weaknesses, causes located

- **Robustness is the weak flank**: 40.8% overall palette agreement (q92 65%, dither 39%, real
  rendition pairs 26.5%) vs P3's 81.8% and the 72.8% q92 incumbent anchor. Located: bg/surface
  are stable (19.5/21.0% instability, field path bit-stable under dither at ≤1.06×
  amplification); the leak is **discrete selections near thresholds** — accent 46.2% instability,
  measured constant (51–53%) across three selection rules, so it is the argmax-near-margins
  shape, not any one rule. Stabilization pass designed but not yet run.
- **Overlay-mark role sourcing unanswered** (cal-013 items 4, 8): erosion-mortality ink
  measurement is provably degenerate on bar-neighbourhood clusters (1.0000 on 60/60) — needs
  mark-level connected support (arm-f's deferred scale-space grouping). Deferred, stated.
- **Set-level identity coverage near-inert** at bar granularity (coverageDecided 0/27):
  bar-neighbourhood families fragment visual colours (one black = 70 families). At 8× bar the
  families become exactly the reviewer's named colours but with unacceptable collateral —
  granularity blocked on formula recalibration (upward packet, 4 strikes).
- **Item-6 class** ("many colors" on vivid illustrations): after the ink veto the component pool
  empties and the retreat publishes 3 colours; no structural answer yet.
- **In flight at freeze**: pass 16 (fg class-first ordering fixing v0.8.1's measured
  field-vs-overlay mass scale mixing; sunset-STRONG byte-identity is a stop-condition anchor).

## 4. Open questions and answer cost

| question | cost |
|---|---|
| Pass-16 anchors (item-3 fg/accent split = reviewer's ask; STRONG holds) | in flight, ~1 h |
| Round 4: rulings 15–18 judged on returning + fresh covers (round-3 analysis complete, rulings implemented through pass 15) | staged round + reviewer time |
| Mark-level grouping (answers fg sourcing 15b + coherence eligibility, cross-arm convergent) | days — the one big unbuilt piece |
| Robustness stabilization (margin-aware selection; target the 46% accent) | 1–2 days + 600-trial runs |
| Identity granularity | blocked upward (same-colour bar near black, 4 measured strikes) |
| Light-field-light-text class | needs draw beyond coverage-set-1 (0/213 there) |
| Escape path (never exercised on any real cover) | cheap synthetic round item |

## 5. Graftable to other arms

Robust-fit-as-segmentation core (IRLS + explained-fraction no-field detector); recursive
component extraction with the ink veto (component-level ink instrument: mortality high +
ground-adjacency low); t-continuity ramp/two-block discriminator (measured anchors); ramp-path
guide-stop machinery (doctrine-aligned, spacing floor); mass-maximizing snap (anti-dither);
margins/diagnostics sidecar (per-pair distances vs bars — made cal-013's 8-for-8 finding
readable); the staging/validation protocol (census-selected fresh covers, leak scans, parser
dry-runs).

## 6. Honest promise assessment

The paradigm's core claim — spatial field structure, not colour statistics, determines the
palette — has survived every direct test the judge has run: gradients recovered where flat was
graded down, fields kept stable under perturbation, zero false gradients, and all three
round-over-round arcs bending upward with complaints retired by name rather than smoothed. The
honest caveats are two. Palette-level robustness is well behind P3 and the incumbent anchor, and
the cause is located but not yet fixed — the field is stable, the discrete role selections near
their thresholds are not; until the stabilization pass runs, the mechanism's own robustness
thesis (integrals over areas) is only proven for half the pipeline. And the newest reviewer
findings (typography sourcing, set-level identity) are one mechanism away — mark-level support —
which is designed and evidenced but unbuilt. If those two land the way E2 and the fg/accent
rulings landed, this is a promising arm; if stabilization stalls, its palettes will be right on
first sight and unreliable under re-encode, which the campaign's own success criterion rules out.
