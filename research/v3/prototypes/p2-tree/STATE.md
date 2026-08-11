# P2 — where we're at (reviewer pick document, 2026-08-05)

## 1. Mechanism

Hierarchical region decomposition: build a tree over the image (tree of shapes on L, a, b),
read the four roles off nodes by lexicographic structural orders. Carried family: tree of
shapes (`p2-tos-0.3.0-cycle-2-merged`, 627–727 ms/palette). Quasi-flat-zone family built,
judged, frozen as reference (`p2-alpha`).

## 2. Judge-validated strengths (provenance per claim)

- **Endorsed colours live in tree nodes:** 91.9% of 1,397 endorsed role slots reachable from
  retained nodes vs 36.4% control; pre-registered falsifier 1.7% against its >25% line
  (endorsed-173 corpus, merged pool). The paradigm's premise is measured, not assumed.
- **Reviewer preferred this family** 5–3 over the α-tree on the same covers (phase2-pair-002).
- **The artwork's-own-text-colour foreground rule:** validated in round-1 (`…d859a69094`
  "we should have black as the foreground" — the detector's election) and again by the I4
  diagnosis (the detector found the true ink even where the contract refused it).
- **Structural vivid-accent recall:** the reviewer named our mined coral "the correct shade
  of red (Strawberry Moon)" (phase2-pair-015 verbatim); recovered from a b-lane node at area
  rank 602/963 — past every mass-based cut, on stability not population (D8's principle,
  working).
- **Determinism/exactness:** independent 6-check verification — byte-identical double runs,
  0 exact-triple violations over 128k published colours/reprs, 0 contract violations.
- **Margins:** zero epsilon-margin pairs published (worst 0.0322 vs bars 0.009–0.023); the
  deliberate 0.0304 margin probe survived review without complaint (phase2-cal-014 item 2's
  bg/surface, the round's only acceptable).

## 3. Measured weaknesses, causes located

- **Fresh-cover quality is low: 5/6 at ≤ weak (phase2-cal-014).** Per-item causes, measured
  (tos/identity/): one contract-level (I4 ε-floor refused the true ink; halo published —
  demonstration staged, reviewer's call); one pipeline defect (phantom cross-lane text
  group — fix in flight); one genuine ceiling (no readable colour exists over that ramp);
  one mechanism limit (photo cover with no structure → blown-highlight white; the class
  arm-b predicted as its worst stratum).
- **Palette-level robustness unsolved: overall agreement 9.0%, dither 23.0%** (both families
  fired the pre-registered dither falsifier). Cause located (stability/q1): role-assignment
  identity swaps over churning candidate sets (82% of failures; representatives held).
  Ruler-indifference elections landed (matched-swap class closed, palettes byte-identical)
  — topline unmoved; the two remaining levers are measured and each sacrifices a
  reviewer-endorsed colour, so they are round-priced, not engineering calls. Cross-arm
  comparisons of these numbers need direction-checking (this campaign's own reading was
  inverted once; topline = agreement).
- **Gradients: 69% of published ramps are phantom vs legacy labels;** laminarity cut is
  unsettleable by measurement (0/77 Holm) and the reviewer rejected both stricter cuts
  (sided with legacy on real ramps, field-gradient-labels-1). Binding constant:
  `UNREADABLE_COVERAGE_FRACTION` (unmeasured, caps agreement at 63.9%) — promoted to
  next-measured (D13).
- **One accent slot cannot carry two colour families** (pair-015 verbatim note): coverage
  allocation prototype built (zero new constants, produces the reviewer-described structure
  on the named cover), un-judged; its adverse case (chroma traded for family) is staged for
  pricing.

## 4. Open questions and answer cost

| question | state | cost to answer |
|---|---|---|
| I4 floor wrong, or colour pick? | round-4 staged, REVIEW-READY sent (true ink, floor waived vs published halo) | 1 reviewer item |
| coverage gate (`UNREADABLE_COVERAGE_FRACTION`) | unmeasured; sweep spec'd over 144 labelled covers | dev-days, no reviewer time |
| cluster-member publication (the dither lever) | two variants measured, each trades an endorsed colour | 2 pairwise items |
| salience eligibility cut | T2-funded (level-first preferred, no note) | 1 pairwise item + dev-days |
| coverage allocation adverse case | prototype built, byte-identity proven off-case | 2 pairwise items |
| ramp polarity ("background should be white") | no constant-free mechanism found (projection decides 4.4× over band) | design work, then 1 round item |
| guide-stop/excursion machinery | owed (D6); currently cannot detect an owed guide stop | dev-days, no reviewer time |

## 5. Components graftable to other arms

- **Reachability falsifier harness** (`falsifier/`): pipeline-agnostic, consumes node/colour
  dumps, pre-registered lines, control-set ceiling printed — any candidate-pool arm.
- **Ruler-indifference election machinery** (`roles/indifference.ts`): semiorder-safe
  leader-linkage classes + truncation-stable cuts — any lexicographic-ranking arm.
- **Text detector** (stroke-width/height/collinearity grouping, lane-agnostic) with the
  text-colour-leads rule; cross-lane dedup landing now.
- **Antialias-ineligibility** (measured "accidental shadow" class: inradius ≈1px,
  boundary-tracing): any arm publishing exact pixels near edges.
- **Family census + coverage allocation** (`coverage/`): zero new constants, derived hue
  separation — any arm with a candidate pool and role slots.
- **Process artifacts:** release-analyst decode protocol, MECE outcome-table template
  lessons, margin reporting (D7).

## 6. Honest promise assessment

The candidate-generation half of this mechanism is validated by the judge and by
measurement: the tree finds what the reviewer endorses (91.9% reachability, coral, black
title), the structural orders carry his stated principles without invented constants, and
every located failure so far has resolved into a specific, addressable cause rather than a
paradigm mystery — including two that turned out not to be P2's fault (a contract floor, a
review-instrument reading). The unsolved half is election stability: palettes move under
perturbations that should not matter, the cheap fixes are exhausted, and the remaining
levers genuinely trade reviewer-endorsed colours, so they cannot be taken unilaterally.
Gradients are honestly blocked on one unmeasured constant. If the bake-off weighs faithful,
judge-agreeing colour selection with located, priced risks, P2 is promising; if it weighs
robustness-today, P2 is behind its own quality story and says so.

*(Update, same day: worker L landed (`78f0285`) — the phantom-text-group defect and the
antialias-halo publication in §3 row 1 are FIXED structurally, zero new constants (item 5's
fg now node-backed `#43752e`; item 2's halo displaced by node-backed `#cba69d` with I4 still
governing); reachability byte-identical (ordering, not retention, proven); robustness moved
within intervals only (overall 8.5%, dither 20.0% agreement — no signal claimed). Nothing in
flight. Round queue: round-4 with installer; pricing round staged next.)*
