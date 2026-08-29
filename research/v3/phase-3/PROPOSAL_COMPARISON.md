# Phase 3 proposals — comparison and recommendation

**Written 2026-08-29 by the orchestrator**, after reading all six proposals
(`proposals/*.md`) and the two adversarial reviews (`reviews/evidence-review.md`,
`reviews/build-review.md`). The brief is `PROPOSAL_BRIEF.md`.

## 1. What the six proposals have in common

Five of six (all but `ranks-new-substrate`) converge on the same skeleton, independently:

1. Fit a smooth colour surface to the whole image with P5's outlier-resistant fit. What the fit
   explains is the *ground*; what it rejects is the *figure* (marks: text, logos, objects).
2. Decide flat / two-block / gradient from the fit alone, **before any colour is chosen**, so the
   gradient decision cannot be influenced by which colours were picked.
3. Background and surface come from the ground; foreground and accent from the marks.
4. Enumerate every complete palette the contract allows (exact pixels, distinct pairs, contrast
   over the whole rendered ramp, declared collapses), and pick one by a fixed sequence of tests
   where no test can be traded against another — no weighted score, no election between rival
   palettes.
5. If nothing is feasible, relax in a fixed order (drop gradient → collapse → escape).

That skeleton is not itself a proposal; it is what the Phase 2 evidence pushes everyone toward.
The proposals differ in three places, and those are the actual bets:

| bet | field-and-marks | unseeded | tree-first | robustness-first | joint-search | ranks-new-substrate |
|---|---|---|---|---|---|---|
| **How the ground is told apart from a face or a frame** (largest complaint class) | enclosure (flood from border) + girth | reach (border coverage) × thickness (inradius) | descend the tree of shapes while one child holds a majority | border mass only | nothing new (fit's largest component) | ground band = top quartile of an "extent" field |
| **What the figure candidates are** | colour families over the residual (single-linkage) | spatially grouped marks, eligible by span OR mass | "pigments" — one colour, all its patches, over a tree | local maxima of a colour×space density | populations (P5 marks ∪ tree nodes) | windows of an ink field, K=8 |
| **What is supposed to stop near-tie flips** | decide on family sums, banded keys | intervals certified under ±1 LSB; overlap = tie | integer pigment count leads the ordering | measured deadbands | dyadic margin rungs | area-integral substrate; semiorder on accent |

## 2. What the reviews found

Both reviewers read all six against the sources. The two rankings disagree because they measure
different things (citation accuracy vs. can-it-be-built); read them together.

**Defects that apply to everyone (fix before any implementation):**

- **"P5's bg/surface were bit-identical across nine versions" is false.** Five proposals and
  `GRAFT_INVENTORY.md` row 6 say it; the P5 reports say 120/600 and 157/600 trials moved (20–26%).
  P5's field *is* the most stable substrate measured (bg/surface ~20% instability vs accent 46%),
  but the "bit-identical" claim needs removing from the inventory.
- **P5's cost is stale.** "4.2 s at 3000²" is a v0.6.1 figure; current fit is 1.6–2.9 s plus
  `readMarks` ~6 s. Every 3000 px estimate is ~2× low.
- **The guide-stop census "zero owed stops on 60 covers" is zero of 7** (only ramp covers carry
  the key). Cited as settled by all six.
- **The accent contrast floor is a conjunction** (APCA *and* colour distance both failing at the
  same ramp point). Only field-and-marks writes it correctly; the rest are over-strict.
- **The brief mixed conventions** (P3's 16% is disagreement; P2/P5 figures are agreement). Three
  proposals reasoned from the wrong reading; two falsifiers are inert because of it.
- Two proposals fix the field pair irrevocably and fire the white/black escape when a legal
  alternative pair exists — the contract says escape only when there is genuinely no other way.

**Per proposal — the hole that matters:**

| proposal | evidence rank | build rank | the hole |
|---|---|---|---|
| **tree-first** | 1 | 2 | Cost: no P2 measurement above 300² exists; honest 3000 px estimate is 60–90 s, not 5–9. Its `ink` formula is inverted (ranks blobs above strokes). Leader-linkage pigments are order-dependent on a float. |
| **unseeded** | 2 | 4 | The certified intervals (its core) cannot be computed for a redescending IRLS fit or for connectivity — they will overlap almost always and the ground falls to a convention. `thickness` is a max-EDT on a thresholded support (the exact shape P3 died on). The black-flare recalibrates the frozen ruler in the wrong direction. |
| **field-and-marks** | 3 | 6 | The one new idea (enclosure + girth) is a flood fill and a max-EDT on a thresholded mask — a one-pixel channel swings it globally — presented as "area integrals". `GIRTH_MIN`, `EXTENT_MIN`, `TIE_BAND` have no values. Its `ink` degenerates to mass at mark scale. |
| **robustness-first** | 4 | 6= | The candidate generator is an O(N²) 5-D kernel density with no evaluation scheme — foreground and accent are not implementable as written. Deadbands are fitted on the harness that then scores them. Best contract handling of the six (user floors as a late re-pick). |
| **ranks-new-substrate** | 5 | 1 | Every field has a formula; buildable; day-2 pre-reviewer kill; day-4 first palettes. But: checks foreground against *stops* not the ramp (the refuted per-stop check), publishes below the floor when nothing clears, and makes contrast the *selector* for both figure roles (the evidence says: floor filters, identity picks). K=8 candidates is a candidacy wall it disclaims. |
| **joint-search** | 6 | 5 | Requirement F is unsatisfiable on any gradient artwork with ≥4 populations (bg/surface share a family), so its top bundle never fires. `L()` has no coding scheme. The ladder order rests on a verdict count that is false. The leximin bound does not inherit P6's exactness. |

**Corpus arithmetic both reviewers reproduced:** the 206 `phase2-*` warehouse rows are autosave
snapshots of 61 distinct verdicts (39 with a note), 82 palettes. Every "N notes" count in the
proposals that used 206 as a base is inflated.

## 3. Assessment

- No proposal survives whole. Each one's *distinguishing* idea has a real hole; the *shared*
  skeleton has none the reviewers could find beyond the accent-floor and escape-order slips.
- The three "stability devices" are the weakest parts: certified intervals can't be computed,
  deadbands relocate the boundary, the integer count is near-inert once the field pair is fixed.
  The honest position is the one `robustness-first` states and then over-claims: a ±1-LSB
  change cannot move a published *value* past the bar; only *decisions* flip. So the number of
  decisions and what they read is the whole robustness story — and that argues for the shared
  skeleton (few decisions, each over a large population) more than for any device on top.
- The bet that matters most for the reviewer's complaints is the **ground test** — wrong
  background / face-as-field is the largest class and poisons the grade ("the rest is hard to
  judge in front of that incorrect background"). Three different geometric answers were proposed
  (enclosure+girth, reach×thickness, majority descent) and all three are cheap functions on top
  of the same fit. That is a head-to-head worth running.
- The second bet is the **figure candidate unit**: colour families over the residual vs pigments
  over a tree vs ink-field windows. These differ in cost by an order of magnitude at 3000 px.
- `ranks-new-substrate` is the one genuinely different substrate (no fit as the ground; an
  area-integral "extent" field). It is the most buildable document, has the only cheap
  pre-reviewer kill, and keeps P3's exact-pixel discipline. Its figure election is wrong as
  written but fixable (swap selector and filter, use the whole-ramp minimum, add relaxation).

## 4. Recommendation

Implement three arms, in isolated worktrees, sharing nothing but the contract and instruments:

**Arm A — field-first (merged).** The shared skeleton with the ground test as the experiment:
P5's fit + recursion, then **reach×thickness** (unseeded) and **enclosure+girth**
(field-and-marks) both computed, with a pre-registered comparison on the known face-as-field and
frame covers before round 1 — one is adopted on evidence, not by the author. Figure candidates =
spatially grouped marks over the residual (P5 `marks.ts`, which exists) with span-or-mass
eligibility; family grouping by `sameColorBar(pair)`, never the pooled bar. Feasible-set
enumeration with a relaxation ladder that relaxes the field first (tree-first's ordering) and
robustness-first's user-floor re-pick. **No certified intervals, no deadbands** in v1 — measure
instability first, then decide whether any device is needed. Cost target must be stated against
the corrected P5 numbers.

**Arm B — tree-first**, as proposed, with three fixes: `ink` thinness inverted; the cost story
(measure the tree at 1000² and 3000² on day 1; if it does not reach seconds, run the tree on a
bounded copy for discovery only, publish exact full-resolution pixels); persistence-at-the-bar
re-run through P2's reachability instrument (91.9%/1.7%) before anything else is built. Its
week-1 pigment-churn falsifier stays.

**Arm C — ranks-new-substrate**, as proposed, with the figure election corrected: whole-ramp
minimum, floor filters / identity picks, relaxation instead of publishing below the floor,
`accentCollapsed` only by exact equality, K removed or made a window over the *whole* ink
ordering. Its day-2 substrate kill runs first; if extent's drift is not ≥2× better than P3's
edge substrate, the arm stops before costing reviewer time.

**Not implemented:** `joint-search` (F unsatisfiable, undefined objective, order built on a false
count) and `robustness-first` (candidate generator not implementable). Two pieces of
robustness-first carry into Arm A: the user-floor re-pick and the "decisions, not values" framing.

**Before any arm starts:** correct `GRAFT_INVENTORY.md` row 6 (bit-identical claim) and the
cost/census figures; every arm's brief carries the corrected robustness conventions and the
conjunctive accent floor.

**What decides between arms:** the reviewer's verdicts on identical fresh-cover draws (blinded,
same 8 covers to all three arms per round), plus the harness dither/re-encode figures reported in
one convention. Not first-round grades — trajectory over three rounds, per `V3_PLAN.md` §6.
