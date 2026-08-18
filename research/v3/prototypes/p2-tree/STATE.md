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
- **Palette-level robustness unsolved — and the freed levers did not pay.** Close run over
  the settled tree (gate 0.25 + class-bounded member rules): overall agreement 9.0%
  [7.0–11.6], dither 15.0% [9.3–23.3] (trajectory 12.0 → 14.7 → 9.0 → 8.5 → 9.0 overall;
  dither 34 → 33 → 23 → 20 → 15). Round-5 freed the cluster-member levers and they were
  adopted (D18/D20, class-bounded per the priced scope), but the measured variant gains were
  from UNBOUNDED rules, and the opened gate simultaneously moved more covers into
  churn-prone structural judging — net effect flat-to-worse, stated plainly. The dither
  falsifier remains fired. Remaining known lever space: D19's overlay ordering, margin-aware
  preference (D7), and design work on assignment-set stability; no cheap fix is left.
  Direction caveat: topline = agreement; cross-arm comparisons must direction-check.
- **Gradients:** the gate is APPLIED (0.25, [MEASURED], D15 — false-unreadable 64.6%→4.2%,
  ramp recall 11.8%→47%, explicitly NOT an agreement improvement; all 8 demo-20 verdict
  flips matched W-M's predictions exactly). Guide-stop machinery landed (worker N): the
  owed-stop census is ZERO on demo-20 + fresh-40 (vs C7's 42% legacy-midpoint figure) —
  current ramps are short and on-artwork; insertion path proven on synthetics with monotone
  + spacing preconditions. Laminarity agreement remains at the majority baseline (0/77 and
  0/13 Holm across two studies) — phantom-rate improvement now rides the gate change,
  validated only by future rounds; the reviewer's first missed-gradient datum (round-5
  item 5) is queued into this work.
- **One accent slot cannot carry two colour families** (pair-015): coverage-allocation
  prototype built (zero new constants, produces the reviewer-described structure on the
  named cover); its adverse cases are round-5 items 3–4.

## 4. Open questions and answer cost

| question | state | cost to answer |
|---|---|---|
| I4 floor wrong, or colour pick? | **ANSWERED** (pair-018, D14): floor stands, pick fixed | 0 — spent |
| coverage gate | **ANSWERED + APPLIED** (D15, `041fc4b4`) | 0 — spent; validation rides future rounds |
| cluster-member levers | **ANSWERED + ADOPTED** (round-5, D18/D20, class-bounded) — did not move the dither topline; see §3 | 0 — spent |
| coverage allocation integration | **UNDECIDED by the judge** (round-5 J-0b: 0/2, both no-preference); prototype stays separate | future round under D17 |
| identity-vs-legibility floor | **OPENED** by round-5 I5-V: identity loses at \|APCA\| 2.7; floor owed between 2.5 and 2.7 | measure-then-calibrate; 1 item if measurement refuses |
| salience eligibility cut | T2-funded, unstaged | 1 item + dev-days |
| overlay (label-logo) ordering | D19, evidence-backed, unimplemented | dev-days; validation rides rounds |
| ramp polarity ("background should be white") | no constant-free mechanism found (projection decides 4.4×) | design work, then 1 item |
| item-4 (cal-014) note-less unacceptable | evidence gap, queued for a noted re-ask | 1 item |
| assignment-set stability (the dither residue) | cheap and priced levers exhausted; design problem | the mechanism's hardest open item |

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
measurement: the tree finds what the reviewer endorses (91.9% reachability, falsifier 1.7%
re-confirmed at close), the structural orders carry his stated principles without invented
constants, and every located failure has resolved into a specific cause — several closed by
fixes the reviewer's own later words converged with (the putty foreground; ramp recall; the
two-family Strawberry Moon structure). The unsolved half is election stability, and the
close run removes any remaining optimism about cheap fixes: the reviewer-freed levers were
adopted and the dither topline did not move (15–20% agreement band; falsifier still fired) —
what remains is genuine design work on assignment-set stability plus two evidence-backed
orderings (overlays, margins) with no measured stability upside yet. Gradient truth is
unblocked (gate applied, guide-stop machinery landed, owed-stop census zero) but laminarity
agreement still sits at baseline pending reviewer labels. If the bake-off weighs faithful,
judge-agreeing colour selection with located, priced risks, P2 is promising; if it weighs
robustness-today, P2 is behind its own quality story and says so — more plainly now than in
the previous revision of this paragraph.

*(In-flight footnote — refreshed at every dispatch/fan-in: NOTHING in flight; tree clean
and committed through the close. All six staged rounds released, analyzed, verified, ruled
(D9/D10/D13/D14/D18); DECISIONS D1–D20 bind; ledger empty. Close measurements: robustness
600 trials + endorsed reachability, detached-run pattern, sentinel-verified.)*
