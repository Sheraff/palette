# P2 — where we're at (reviewer pick document, refreshed 2026-08-05, tree `9060fb3`)

## 1. Mechanism

Hierarchical region decomposition: build a tree over the image (tree of shapes on L, a, b),
read the four roles off nodes by lexicographic structural orders. Carried family: tree of
shapes — merged candidate `p2-tos-0.3.0-cycle-2-merged`, **provenance pin: any commit from
`78f0285` through HEAD (candidate bytes identical; cross-arm consumers pin `734c3f5`)**,
~670 ms/palette. Quasi-flat-zone family built, judged, frozen as reference (`p2-alpha`).

## 2. Judge-validated strengths (provenance per claim)

- **Endorsed colours live in tree nodes:** 91.9% of 1,397 endorsed role slots reachable from
  retained nodes vs 36.4% control; pre-registered falsifier 1.7% vs its >25% line. The
  paradigm's premise is measured, not assumed.
- **Reviewer preferred this family** 5–3 over the α-tree (phase2-pair-002).
- **Artwork's-own-text-colour foreground:** validated round-1 (black title, `…d859a69094`);
  reaffirmed by pair-018 ("side A has the right idea to take a color from the artwork").
- **Structural vivid-accent recall:** the mined coral named "the correct shade of red"
  (pair-015 verbatim), recovered on stability at area rank 602/963 — mass floors would have
  killed it (D8 working).
- **I4 floor demonstration (pair-018) closed a contract question in P2's favour on process:**
  floor affirmed, the halo pick named the defect — and the fix (antialias-ineligibility,
  zero constants) was landed BEFORE the verdict; the current build publishes a putty-family
  colour on that cover, in the family the reviewer volunteered as valid. Unvalidated until
  the next quality round; recorded as convergence, not claim.
- **Determinism/exactness:** independent 6-check verification — byte-identical runs, 0
  exact-triple violations over 128k colours, 0 contract violations; margins healthy (worst
  pair 0.0322; the deliberate 0.0304 probe survived review).

## 3. Measured weaknesses, causes located, current status

- **Fresh-cover quality low (cal-014: 5/6 ≤ weak).** All four causes located and now:
  contract-level cause RESOLVED (I4 affirmed + pick fixed, D14); phantom text group FIXED
  (cross-lane dedup, `78f0285`); one genuine readability ceiling (ramp field — real limit);
  one mechanism limit (photo covers with no structure; arm-b predicted it). Post-fix
  quality is unmeasured by the judge — next quality round carries it.
- **Palette-level robustness unsolved: agreement 8.5% overall, 20.0% dither** (pre-registered
  dither falsifiers fired, both families; deltas from fixes are within CIs, claimed as
  no-signal). Cause located: candidate-set churn at role assignment; ruler-indifference
  landed (matched-swap class closed); the two remaining levers each trade a
  reviewer-endorsed colour and are staged in round-5 for pricing, not taken unilaterally.
  Direction caveat: topline = agreement; cross-arm comparisons must direction-check.
- **Gradients:** 69% of published ramps phantom vs legacy; laminarity unsettleable by
  measurement (0/77 Holm) and both stricter cuts rejected by the reviewer (sided with
  legacy ramps, D13). The binding constant was measured (W-M sweep): coverage gate ruled
  0.5→**0.25** by pick-one-and-state (D15 — false-unreadable 64.6%→4.2%, ramp recall
  11.8%→47%, explicitly NOT an agreement improvement), application pending worker N's
  fan-in. Guide-stop machinery (D6's owed excursion census) is worker N's in-flight task.
- **One accent slot cannot carry two colour families** (pair-015): coverage-allocation
  prototype built (zero new constants, produces the reviewer-described structure on the
  named cover); its adverse cases are round-5 items 3–4.

## 4. Open questions and answer cost

| question | state | cost to answer |
|---|---|---|
| I4 floor wrong, or colour pick? | **ANSWERED** (pair-018, D14): floor stands, pick fixed | 0 — spent |
| coverage gate | **ANSWERED** (W-M sweep + D15): 0.25, applied at W-N fan-in | 0 — spent; validation rides future rounds |
| cluster-member publication (dither lever) | round-5 items 1–2, with installer | 2 items |
| coverage adverse cases | round-5 items 3–4, with installer | 2 items |
| low-contrast text cover (W-L owed) | round-5 item 5, with installer | 1 item |
| salience eligibility cut | T2-funded, queued behind round-5 | 1 item + dev-days |
| ramp polarity ("background should be white") | no constant-free mechanism found (projection decides 4.4×) | design work, then 1 item |
| guide-stop/excursion machinery | worker N in flight (census + insertion + preconditions) | dev-days, no reviewer time |
| item-4 (cal-014) note-less unacceptable | evidence gap, queued for a noted re-ask | 1 item |

## 5. Components graftable to other arms

Reachability falsifier harness (pipeline-agnostic; pre-registered lines; control ceiling
printed) · ruler-indifference election machinery (semiorder-safe classes, truncation-stable
cuts) · text detector + cross-lane dedup + text-colour-leads rule · antialias-ineligibility
(measured accidental-shadow class: no-interior-pixel regions) · family census + coverage
allocation (zero new constants) · release-analyst decode protocol · mechanical MECE
outcome-table validation (round-5's validate.ts — enumerates all answer states, proves
exactly one row fires) · D7 margin reporting.

## 6. Honest promise assessment

The candidate-generation half of this mechanism is validated by the judge and by
measurement: the tree finds what the reviewer endorses, the structural orders carry his
stated principles without invented constants, and every located failure has resolved into a
specific cause — two of them closed by fixes the reviewer's own later words converged with
(the putty foreground; ramp recall). The unsolved half is election stability: palettes move
under perturbations that should not matter, the cheap fixes are exhausted with honestly-null
toplines, and the remaining levers are with the reviewer in round-5 because each trades an
endorsed colour. Gradient truth is now unblocked (gate ruled, machinery landing) but its
agreement ceiling is real and low until the reviewer's labels say otherwise. If the
bake-off weighs faithful, judge-agreeing colour selection with located, priced risks, P2 is
promising; if it weighs robustness-today, P2 is behind its own quality story and says so.

*(In-flight footnote — refreshed at every dispatch/fan-in: worker N (excursion machinery,
D6) owns tos/candidate.ts + tos/gradient/ uncommitted mid-flight; everything else committed
through `9060fb3`. Rounds: round-5 staged (`95f85e6`) with installer; all released rounds
(pair-002, cal-014, pair-015, field-gradient-labels-1, pair-018) analyzed, verified, ruled —
D9/D10/D13/D14. Ledger empty.)*
