# Round 1 — calibration. Eight covers, one palette each.

**For the orchestrator, not the reviewer.** Nothing in this file is served; the reviewer-facing
side-car (`sidecar.data.json`) is blinded and carries no prototype name, arm label, or mechanism text.

Candidate `p3-fields-0.2.0`, commit `cb760d7`. Staged from the worktree `.worktrees/p3-fields`.

---

## The question this round answers

> **Are rank-selected palettes plausible to a human, graded per class — and where does the paradigm
> fail first?**

Not "is the mechanism sound" and not "is it better than X". The prototype has a contract scorecard
(19/20) and a robustness number; neither says whether a person shown one of these palettes on a mock
player would accept it. The round buys that, and buys it *per class*, so a bad aggregate can be
attributed to a class rather than to the mechanism.

## Proposed kind

**calibration** — absolute grading, one palette per item, no comparison
(`REVIEW_UI.md` §5; `parseCalibrationBatch` in `src/review-server/batch.ts`).

| | |
| --- | --- |
| Mode | absolute (single palette on the mock) |
| Grade scale | 1–4, the four warehouse grades: strong / acceptable / weak / unacceptable |
| Veto | available per item |
| Notes | per-item, free text |
| Items | 8 |
| Purpose field | `calibration` |

Eight items is the round size the workflow calls for — a 4-to-10-item review that gets *run*, not a
sweep that gets deferred.

---

## The item table

`itemId` carries the run's own zero-based index, so `#14` in a report and `item-14` here are the same
cover. Row order is the run's.

| itemId | cover, as it reads | selection class | regime | gradient | scorecard |
| --- | --- | --- | --- | --- | --- |
| `item-00` | *Smoke & Fire (Remixes)* — white card floating on an orange/pink field, red ring mark | **ink**-regime text | ink | — | pass |
| `item-02` | *Daniel Marques — The Remixes* — greyscale swoosh, large black type | gradient published | ink | 2 stops | pass |
| `item-05` | Bhojpuri release — two portraits, saturated Devanagari type, maximally busy | busy / photographic | luminance | — | pass |
| `item-07` | red-tree illustration on cream, no legible type | luminance, no text | luminance | — | pass |
| `item-11` | *Lofi Winter Wonderland* — dark navy, white snowflake | gradient published | luminance | 2 stops | pass |
| `item-12` | Japanese karaoke cover — white ground, green border, red and black type | **ink**-regime text | ink | — | pass |
| `item-14` | *A Few Good Men* — greyscale photograph of crushed cans | near-neutral, high contrast | luminance | — | pass |
| `item-19` | *8 Is Enough (Cypher)* — yellow ground, red paint, black bars | **ink**-regime text | ink | — | pass |

Class counts against the stated criteria: **3** ink-regime covers (`00`, `12`, `19`), **2** with a
published gradient (`02`, `11`), **1** luminance-without-text (`07`), **1** busy/photographic (`05`),
**1** near-neutral high-contrast (`14`). Eight.

`item-02` is *also* ink-regime, so the round shows four ink covers in total; it is counted under
gradient because that is the criterion it was picked to serve.

### How regime was determined

**Read from the pipeline, not guessed by eye.** There is no `P3_DIAG` environment variable in
`src/pipeline.ts` (checked). There is something better: `extractPalette` already returns
`{ palette, intermediates }`, and `intermediates.foregroundRegime` is the literal `"ink" | "luminance"
| "escape"` the run took. `candidate.ts` re-exports it for exactly this. Every regime in the table
above is that value.

`luminancePolarity` was `null` on all twenty — it is recorded only for the luminance regime's cascade
and no row in this set reached the step that sets it.

Cover appearance (*is there type*, *is it a photograph*, *is it busy*) is the one judgment no number
carries, and that was made by eye from `contact-sheet.jpg` (rebuild with `contact-sheet.mjs`).

### The exclusion

**`item-01` is excluded** — the all-black monochrome (*My Mozart / Rhyme Night*). Its palette is
`background = surface = foreground = #000000`, accent `#fdfdfd`.

Re-derived rather than taken on report: `validatePalette` over all twenty rows gives **19 pass / 1
fail**, and the single failure is index 01, with `I3.pair-not-distinct` ×2 and
`I4.below-contrast-floor` ×2. It is the contract-failing item the scorecard names.

A palette that already fails the contract is not a question. Grading it would spend reviewer
bandwidth confirming something the invariants proved for free, and would drag the round's aggregate
down for a reason that has nothing to do with whether rank-selection produces plausible colour.

---

## Outcome branches

What the orchestrator does with each result. Written before the grades exist.

**(a) The three ink-class items (`00`, `12`, `19`) grade ≥ 3.**
The mechanism's core claim — that publishing the designer's own ink colour is the paradigm's
strength — survives contact with a human. Robustness work continues as planned; the ink regime is not
the thing to redesign.

**(b) Grades of ≤ 2 spread broadly across classes.**
Not a tuning problem. If ink, luminance, gradient and near-neutral all read as weak, the paradigm is
producing implausible colour in general, and **a quality rethink outranks robustness tuning** — the
robustness number would be measuring the stability of an answer nobody wants. Report upward as the
next decision rather than absorbing it into the current plan.

**(c) Specific vetoes, or notes that name a role.**
Targeted per-role fixes. The three most likely, named here so a matching note is recognised rather
than rediscovered: `item-02`'s foreground `#c8c8c8` on a `#ffffff` background (the cover's actual ink
is black); `item-12`'s surface collapsed onto a white background; `item-05`'s foreground `#d69a8f` on
a saturated blue. Each is a role-level complaint with a role-level answer, and none of them is a
verdict on rank selection.

**(d) `item-14` grades ≥ 3.**
`item-14` is the polarity-flip class: a greyscale photograph where background `#ffffff` and surface
`#040404` sit at opposite ends, and the robustness work treats the choice between those ends as
consequential. A ≥ 3 here is *suggestive* that the polarity choice matters less to a human than the
robustness math implies — but **only one side is shown this round**, so it cannot settle it. A grade
of ≥ 3 on both sides' palettes would be the evidence; this round can only motivate asking.
**Flag as a candidate follow-up: a pairwise round on near-neutral covers, the two polarities as the
two sides.** Do not read (d) as settled from a single-sided grade.

**(e) Evidence watches — added post-staging from the P5/P2 rounds' verdicts (see
`../../EVIDENCE_2026-08-04.md`).**
Two things to read the notes for, beyond the branches above:
- **Twin siblings.** The reviewer forbade indistinguishable sibling pairs (collapse instead).
  Our collapse triggers at the same-colour bar; the reviewer's threshold may be wider. Any note
  reading "these two are the same colour" on a pair that cleared the bar is calibration evidence
  for the collapse width — count it, don't dismiss it as taste.
- **False gradients.** "Gradient on a flat artwork" is a graded-down error and ρ* = 0.6 is
  uncalibrated. `item-02` and `item-11` are the two published gradients here; a note calling
  either flat jumps ρ* calibration to the front of the iteration queue.
- One branch-(c) prediction is now evidence-expected rather than merely likely: the reviewer's
  "black text → black foreground" finding matches `item-02`'s fg `#c8c8c8` on white where the
  cover's ink is black. If that complaint lands, it is confirmation of a known ink-cascade defect,
  not new information — the fix targets the ink regime's cascade, not the ordering.

---

## Staging notes the orchestrator needs before pushing

1. **The 0.2.0 `demo-20` run did not exist.** `data/devloop/runs/` held only
   `p3-fields-0.1.0-demo-20-…jsonl`, produced before the version bump — `CANDIDATE_ID` is now
   `p3-fields-0.2.0`. This round produced its own: `run-demo-20-0.2.0.jsonl`, written into this
   directory rather than into `data/devloop/runs/`, which this worker does not own. 20 ok, 0 failed.
   Every hex in `items.jsonl` is copied verbatim from its rows; nothing was recomputed.
2. **`items.jsonl` is flat; the push API is nested.** The shape written here is the one this round was
   specified in — `background` / `surface` / `foreground` / `accent` / `gradient` /
   `surfaceCollapsed` / `accentCollapsed` at the top level. `parseCalibrationBatch` wants those under
   an `item.palette` key, and wants `imagePath` **absolute**. One mechanical transform at push time,
   noted so it is not discovered by a validation error.
3. **`preprocessingVersion` — RESOLVED by orchestrator decision (2026-08-04):** the descriptive
   string `sharp-0.33.5/srgb/no-resample/alpha-excluded` is the fingerprint value everywhere;
   `items.jsonl` updated (8/8 rows), fingerprint now equals run metadata. The spec's
   `native-decode-1` label is retired.
4. **The working tree was dirty when the run executed**, and the run was proven to be a statement
   about `cb760d7` anyway. See `VERIFY.md` check 5.
