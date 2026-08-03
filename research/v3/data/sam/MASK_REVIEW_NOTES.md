# Reviewer notes — SAM mask-quality round 1 (2026-08-03)

60/60 answered, released. Verbatim observations (the reviewer's words), with orchestrator
implications. Overall verdict: "the results are impressive, though not always accurate …
all in all, pretty good i thought" — **the prompt-set replacement (loose end A5) is
ratified by this round.**

1. "sometimes 'logo' could be part of the artwork itself, or some sort of added branding" —
   and likewise "sticker": part of the artwork, or something added on top.
   *Implication:* provenance (belongs-to-artwork vs overlay) is NOT the mask's job and the
   concept words shouldn't imply it — SAM answers "where", the VLM's group-C questions
   answer "whose". Candidate refinement: provenance-neutral concept names.
2. "i did not count 'parental advisory' marks as 'stickers' but the model seemed to consider
   them as stickers." *Implication:* the model detects PA marks reliably (useful — they are a
   provenance-exclusion target) but the label word mismatches the reviewer's category; this
   explains most of sticker's 25% yes-rate. Candidate refinement: re-add "parental advisory"
   as its own concept (it was in the original §8.3 set) so the category is honest.
3. Faces fire on depicted faces — "a graffiti of a face", "a sculpted bust". *Implication:*
   for palette salience purposes this is often fine (a depicted face is salient content);
   for photographic-person reasoning it is noise. Note, not a defect.
4. "a chinese character was recognized as a word (not incorrect, just interesting)" — recall
   generalizes across scripts.
5. album-title masks sometimes ambiguous between title and artist name — "definitely some of
   the main text". *Implication:* the concept is really "main display text"; which role the
   text plays is the VLM's group-B question. Candidate refinement: rename accordingly.

Reviewer's synthesis: "maybe we need to adjust the exact vocabulary of our queries so we
more semantically align with what the model is good at and we'd get even better results."
Parked as a loose-end (concept-vocabulary refinement probe — cheap, ~10 min GPU) rather than
run now, per the freeze discipline.

6. On the overlay rendering (mask fill + bbox + locator ring): "the three-layer rendering
   was helpful in some cases, i just got confused the first time that's all." *Implication:*
   rendering stays as designed; add a one-line legend on the first item of a round.

## Calibration outcome (from mask-quality-analysis)

- **SCORE_THRESHOLD calibrated: 0.578** (single cut — concept groups did not separate;
  precision 91%, recall 69%, J 0.514). Population-weighted alternative 0.644 (J 0.373);
  the unweighted optimum is partly an artefact of even-quota sampling — both recorded.
- **All 3 hallucination-signature masks: rejected by the reviewer AND dropped by the cut** —
  no area-fraction guard needed at this threshold.
- Text concepts (words / letter / lettering / album-title): 100% yes-rates (letter and
  lettering underpowered, n=4 each). logo 60%, face 67%, person 69%, sticker 25% (see note 2).

---

## ADDENDUM — corrections from the phase-0 adversarial review (2026-08-03)

Appended, not edited: everything above is what was written at the time and stays as written.
Source: `research/v3/reviews/phase-0-adversarial/sam.md`. Every number below was re-derived from
the round's own data, on CPU, with no model load.

**A1. The area-guard sentence above is withdrawn.** "All 3 hallucination-signature masks: rejected
by the reviewer AND dropped by the cut — no area-fraction guard needed at this threshold" is true
and carries no information. The "hallucination signature" is *defined* by the sampler as
`area_fraction > 0.5 AND score < 0.5`, so every member of it necessarily scores below any cut at or
above 0.5; the verdict was computed over that force-included subset alone and could never have
produced a counterexample.

The counterexample was in the same 60 masks. Of the **5** masks with `area_fraction > 0.5`, the
reviewer rejected **5 and accepted 0** — and one of them, `8b4f2aadf3b1:sticker:0` (score
**0.6787**, area **0.7807**), clears the calibrated cut with room. It is one of only three false
positives there. It was never force-included, so the old verdict never looked at it.

| maskRowId | concept | score | area | answer | above the cut? |
|---|---|---|---|---|---|
| `8b4f2aadf3b1:sticker:0` | sticker | 0.6787 | 0.7807 | no | **yes** |
| `ecf1191eb98a:sticker:0` | sticker | 0.5116 | 0.9406 | no | no |
| `8b4f2aadf3b1:logo:0` | logo | 0.4334 | 0.7732 | no (forced) | no |
| `ff0bc9c4e622:face:0` | face | 0.4262 | 0.5194 | no (forced) | no |
| `cbff25964afd:sticker:0` | sticker | 0.3744 | 0.8885 | no (forced) | no |

An `area_fraction > 0.5` guard costs **zero** true positives in this sample and removes that one
false positive: at the sweep optimum 0.577937, precision **0.9063 → 0.9355**, specificity
**0.8235 → 0.8824**, J **0.5140 → 0.5728**, recall unchanged. The guard is now
`config.CALIBRATED_MAX_AREA_FRACTION = 0.5`, applied through `config.passes_calibrated_cut()`.
`analyze-mask-quality.ts` now computes the verdict over every big-area mask, not the forced subset,
and the evidence file this section cites — `data/sam/mask-quality-analysis.json` — exists (it did
not, until now).

**Stated limit.** This round's big-area masks are 3 `sticker`, 1 `logo`, 1 `face` and contain **no
`person`** (the largest sampled `person` mask is area 0.302). Corpus-wide on `sam-eval-142-v2`, 6
regions clear the score cut with area > 0.5 and **5 of them are `person`**. A person filling most of
a cover is an ordinary artwork. The guard's main corpus effect therefore falls on a concept this
round never tested at big area — a round-3 item, not a settled question.

**A2. The "concept groups did not separate" sentence is withdrawn.** The analysis required *every*
group to gain over the pooled cut. One group always defines the pooled cut — the pooled optimum is
by construction some group's optimum — so its gain is necessarily zero and the test could never
pass with two groups. Re-derived, primary treatment:

| group | n | own optimum | own J | J at pooled 0.577937 | gain |
|---|---|---|---|---|---|
| `text_like` | 31 | **0.697295** | 0.4783 | 0.3587 | **+0.1196** |
| `person_like` | 29 | 0.577937 | 0.6784 | 0.6784 | 0.0000 |

`text_like` clears both of the analysis's own bars (separation 0.1194 ≥ 0.05, gain 0.1196 ≥ 0.05,
n = 31 ≥ 5). At the pooled cut it runs precision 0.875 / recall 0.6087; at its own 0.697295,
precision **1.000** / recall 0.4783. Over all 60 masks, cutting each group at its own threshold
gives precision 0.9630 / recall 0.6190 / J 0.5602 against 0.9063 / 0.6905 / 0.5140 pooled. Stored as
`config.CALIBRATED_GROUP_THRESHOLDS`.

**A3. The published triple does not hold at the stored constant.** "precision 91%, recall 69%,
J 0.514" is the sweep's winning candidate, the observed score **0.577937**. `config.py` stores the
rounded **0.578**, at which the same sample gives precision 0.9032, recall 0.6667, J 0.4902 — the
rounding moves the boundary-defining mask to the wrong side. The stored constant is deliberately
kept (every artifact on disk was computed at 0.578); the true optimum is now
`config.CALIBRATED_SWEEP_OPTIMUM`. The weighted alternative is likewise the observed score
**0.643816**, displayed as 0.644.

**A4. The per-concept yes-rates above are quoted on undisclosed denominators.** `face 67%` is
10/**15** — the one `partly` answer dropped — while the concept holds 16 items; 10/16 is 62.5%. The
primary treatment throughout this round excludes `partly` from **both** sides. `logo` 3/5,
`person` 9/13, `sticker` 2/8 and the four text concepts are exact.

**A5. Round 2's residual panels were judged at the 0.3 union, not the calibrated cut.**
`review_round_2.py` selected its mask items at `CALIBRATED_SCORE_THRESHOLD` but rendered the
residual panels from the run's stored `union_mask_rle`, which `run_sam.py` computes over **all**
instances at the run-time `SCORE_THRESHOLD = 0.3`. So round 2 showed calibrated-cut masks beside a
0.3-cut residual, and the reviewer's "7 of 15 residuals only partly field" verdict — which premise
probe 4 was built on — is a judgment about the **0.3 union**. Measured on `sam-eval-142-v2`, stored
vs recomputed residual at the pooled cut, score-only: mean difference 0.0416, median 0.0088, max
0.6668; 70 of 142 images differ by more than 0.01 and 14 by more than 0.10. The two covers probe 4
names are barely affected (0.427 → 0.429; 0.969 → 0.974), so probe 4's conclusions stand; the
general trap does not. `run_sam.py` now writes calibrated aggregates alongside the 0.3 ones for
future runs, and `derive_calibrated_aggregates.py` produces them on CPU for runs already on disk
(`data/sam/sam-eval-142-v2.calibrated-aggregates.jsonl`, and a score-only pooled variant that
reproduces the numbers quoted here exactly).

# Round 3 — the area guard and hard text (2026-08-04)

54/54 answered, released 2026-08-03T22:33Z, zero supersessions and zero retractions. Two loose
ends in one batch, both of them thresholds nobody had ever seen the masks of. Every rule applied
below was **pre-registered** in `mask-quality-3-sample.json` before the answers existed; the
analyzer re-reads those rules off the manifest on every run and aborts if they have drifted
(`analyze-mask-quality-3.ts`, `assertPreRegistered`). Numbers regenerate with:

```sh
NODE_NO_WARNINGS=1 node --experimental-strip-types \
  research/v3/oracle/sam/analyze-mask-quality-3.ts --write
```

## A6 — the area guard. Verdict: scope it OFF for `person_like`, leave it alone everywhere else.

The unit of decision is the concept group; only `over-guard` items vote; the middle answer
(`real, but loosely outlined`) is excluded from both sides.

| group | over-guard | covers | real | loose | whole | decided | real-share | verdict |
|---|---|---|---|---|---|---|---|---|
| `person_like` | 6 | 6 | 6 | 0 | 0 | 6 | **1.000** | **EXEMPT** (≥ 0.70) |
| `mark_like` | 4 | 3 | 2 | 0 | 2 | 4 | 0.500 | UNDECIDED (guard stays) |
| `dynamic_subject` | 2 | 2 | 2 | 0 | 0 | 2 | 1.000 | UNDECIDED — only 2 decided, rule needs 3 |
| `text_like` | 0 | 0 | — | — | — | 0 | n/a | NOT TESTED — no region of this group is anywhere near the guard |

**`person_like` is unanimous, and it is the group the guard was never calibrated on.** All six
big-area person/face regions came back "a real thing that fills the cover". Not one was called
"the model outlined most of the picture", and not one was even called loosely outlined. The
config comment written on 2026-08-03 predicted this exposure in as many words — "a person filling
most of a cover is an ordinary artwork, and those 5 masks may well be correct" — and the census
says they are.

**The 5 person masks the guard currently deletes.** These are the ones that clear the score cut
and die on area alone, i.e. the guard's entire corpus-wide effect on this concept. The reviewer
answered **yes (correct person mask)** and **real-subject** on all five:

| mask row | score | area | mask | guard | cover |
|---|---|---|---|---|---|
| `3b82cee640a2:person:0` | 0.839 | 57.1% | yes | real-subject | `10/…100a3e9c764acf01c16db8` |
| `89ab247d72c9:person:0` | 0.818 | 53.4% | yes | real-subject | `10/…1063830a2e597293293797` |
| `7f522b435cdc:person:0` | 0.766 | 68.2% | yes | real-subject | `03/…034b1c66ddd55a5337f66a` |
| `dca149beb8a5:person:0` | 0.736 | 51.3% | yes | real-subject | `03/…034b60105d8937440211da` |
| `5a45dc54f71a:person:0` | 0.688 | 58.4% | yes | real-subject | `images/placebo.jpg` |

The poster case is the first row — a person mask scoring **0.839**, well clear of any cut in the
system, covering **57%** of the cover, deleted today for no reason but its size.

**Contradictions: zero.** The pre-registered cross-check looked for items answered `yes` to the
mask question *and* `whole-image` to the guard question — a correct mask that is also the whole
picture, which is the case the guard was added for. **No item in the census is one.** The two
`whole-image` answers are both `sticker` masks the reviewer *also* called wrong masks
(`cbff25964afd:sticker:0` at 89% area, `ecf1191eb98a:sticker:0` at 94% area), so the score cut and
the mask question already agree about them. The guard's founding worry did not materialise on any
region in the run.

**Why `mark_like` keeps the guard, and why that matters.** Its share is exactly 0.500 — dead
centre of the undecided band — so by the pre-registered rule the guard stays on and the group is
recorded unresolved. Two caveats make that the right call rather than a near miss. First, the four
answers cover only **three distinct regions**: `8b4f2aadf3b1:emblem:0` and `8b4f2aadf3b1:sticker:0`
are the same big region on the same cover (bboxes 0.995×0.990 and 0.997×0.991, areas 77.3% and
78.1%) returned under two concept tags, and the reviewer called it a correct *emblem*, not a
correct *sticker* — one region voting twice. Second, **round 1's single in-sample win for the guard
was `8b4f2aadf3b1:sticker:0`**, a false positive at 0.679 that the guard removes. That win is
inside `mark_like`, so scoping the guard off for `person_like` alone **preserves it intact**. This
is the whole reason the proposal is per-group and not a repeal.

`dynamic_subject`'s exemption would be inert today regardless: both its over-guard regions score
0.362 and 0.335, below the pooled cut of 0.578, so the score cut removes them whatever the guard
does.

## A12 — hard text. The cut is discarding correct text, but that does not fund a lower number.

24 below-cut `text_like` masks, 3 per cover across the 8 A12 covers that carry any, strongest to
weakest. **22 yes, 1 no, 1 partly — a 95.7% accept rate on 23 decided answers.**

**Where the reviewer's boundary sits: nowhere near either cut.** Every one of the 24 masks scores
**at or below 0.576**. That is below the `text_like` group cut of 0.697295 *and* below the pooled
cut of 0.578. Both cuts keep **0 of 24**. On these covers the 0.578–0.697 band is simply empty —
the strongest text the model finds is 0.576. The reviewer's own yes/no line falls at the bottom of
the range: the single `no` is the weakest mask in the whole section (`4312a7e73414:letter:12` at
0.3004, the run-time floor) and every mask from 0.302 upward was accepted. So the manifest's first
expected outcome is the one that happened — **the cut is throwing away correct text.**

**But the pre-registered sweep cannot be taken at face value, and this is the important part.**
The gates all PASS on section B (separation 0.395, J gain 1.000, 23 decided), and the sweep's
"optimum" is 0.301998 at a perfect J of 1.000. That number is an artefact. Section B was *selected*
as masks below the cut, so it cannot contain a single mask on the keep side, and it holds exactly
**one** negative answer — a perfect separation of 22 positives from 1 negative measures where the
sample was cut, not where the boundary is. Reporting PASS without saying so would be textbook
selection bias.

**The de-truncation check, which costs no GPU.** Round 1 graded 31 `text_like` masks drawn across
the full score range on an unconditioned sample. Pooling them with round 3's 24 (55 rows, no
overlap, scores 0.300–0.928, 9 negatives) and re-running the same sweep:

| | threshold | precision | recall | J |
|---|---|---|---|---|
| incumbent | 0.697295 | 100.0% | 24.4% | 0.2444 |
| pooled-sample optimum | 0.514847 | 91.3% | 46.7% | 0.2444 |

**The J gain is exactly zero — the J-gain gate FAILS.** Lowering the cut buys recall and pays for
it in precision, one for one. There is no separating number hiding here.

**A further caution nobody asked for but the data volunteers: these masks are tiny.** 22 of the 24
cover **less than 1%** of their cover and 14 cover less than 0.1%; the median is 0.087%. The 16
`letter` masks have a median area of **0.04%** — single glyphs. Only `display-text` reaches useful
size (median 2.9%, max 10.8%). The round asked whether these masks are *correct*, and they are; it
never asked whether they are *useful*. A lowered cut would admit mostly single glyphs, which may
well be enough to answer "is there text here, and where" — that is A12's actual question — but it
is not the same as recovering a text region, and the distinction should be made deliberately
rather than inherited.

**So: is a per-category or lowered cut supported?** A *lowered global* `text_like` cut is **not**
supported — the honest sweep gains nothing. What the answers do support is a **per-cover rescue
rule**: on a cover where no `text_like` mask clears the cut at all, admit that cover's strongest
`text_like` mask down to a floor. That targets exactly the A12 shape (the class is *defined* by
having nothing above the cut) without moving a threshold that is doing its job on the other 131
covers. The floor cannot be fitted from this round — it needs a round that samples both sides of
the boundary on hard covers — so it is proposed as a shape, not a number.

## What is still genuinely un-reviewed: the CJK masks. The GPU micro-run has NOT been run.

**Say this plainly: no human has ever seen a CJK-prompt mask.** `chinese characters` and `kanji`
are not in `config.CONCEPT_PROMPTS`, so no eval run contains them. Probe 4 did run them, but its
rows store only score, bbox and area_fraction — **no `mask_rle`** — so there is nothing on disk
that can be rendered as an overlay. Two of probe 4's four CJK covers are absent from the eval set
entirely.

Everything in section B above is the **incumbent Latin-glyph** concepts (`letter`, `lettering`,
`display-text`, `words`) firing weakly on hard covers. It calibrates `text_like`. **It is not
evidence about a CJK concept.** The finding that `chinese characters` recalls 4/4 CJK covers with
zero false positives while topping out at 0.472 remains a number in a table that no reviewer has
ever seen a picture of.

The manifest's `gpuGap.exactRunNeeded` block specifies the run that would close this, and it is
**tiny** — roughly 7 covers × 3 prompts (`chinese characters`, `kanji`, and `words` as the
incumbent control), storing `mask_rle` per instance at the run-time floor `SCORE_THRESHOLD = 0.3`,
via `probe_scripts_objects.py` or a `run_sam.py` pass. Probe 4 measured 16 covers × 14 phrasings in
51.6 s of inference, so this is on the order of **5–15 seconds of inference, well under a minute of
wall clock**. It has still not been run. A12 cannot be closed until it is, and no amount of further
CPU analysis substitutes for it.

## Proposed, NOT applied

The manifest pre-registered that **no threshold in `config.py` is edited by this round**, and none
was. Three decision records and one `config.py` diff are proposed in
`mask-quality-3-analysis.json` (`proposals`), with `fundedBy` ids derived from the warehouse
records rather than transcribed. `oracle/sam` is quiet, and the guard change deserves its own
reviewed commit.

### Proposed `config.py` diff (NOT applied — for its own reviewed commit)

Two edits in `oracle/sam/config.py`: one new constant, one change to `passes_calibrated_cut`'s
contract. No existing number moves — `CALIBRATED_MAX_AREA_FRACTION` stays `0.5`,
`CALIBRATED_SCORE_THRESHOLD` stays `0.578`, `CALIBRATED_GROUP_THRESHOLDS["text_like"]` stays
`0.697295`.

```diff
 CALIBRATED_MAX_AREA_FRACTION = 0.5
 
 
+# [MEASURED] Concept groups the area guard does NOT apply to. Added 2026-08-04 by mask-quality
+# round 3 (loose end A6), a CENSUS — every region in sam-eval-142-v3-dynamic over the guard, plus
+# every region just under it as context — which asked each one whether it is "a real thing that
+# fills the cover" or "the model outlining most of the picture":
+#
+#   group            over-guard  covers  real  loose  whole  share  verdict
+#   person_like               6       6     6      0      0  1.000  EXEMPT (>= 0.70)
+#   mark_like                 4       3     2      0      2  0.500  undecided, guard stays
+#   dynamic_subject           2       2     2      0      0  1.000  undecided, 2 decided < 3
+#   text_like                 0       0     -      -      -    n/a  no region near the guard
+#
+# The 5 person masks that clear the score cut and die on area alone — the guard's entire corpus
+# effect on this concept — were each answered `yes` (a correct person mask) AND `real-subject`:
+#   3b82cee640a2:person:0  score 0.838555  area 0.5712
+#   89ab247d72c9:person:0  score 0.817568  area 0.5340
+#   7f522b435cdc:person:0  score 0.766371  area 0.6822
+#   dca149beb8a5:person:0  score 0.735899  area 0.5133
+#   5a45dc54f71a:person:0  score 0.687865  area 0.5836
+# The exposure the comment above recorded on 2026-08-03 — "a person filling most of a cover is an
+# ordinary artwork, and those 5 masks may well be correct" — is now MEASURED, and resolved in
+# favour of the masks. The pre-registered contradiction check (mask=yes AND guard=whole-image, the
+# case the guard exists for) found ZERO items in the entire census.
+#
+# WHY PER-GROUP AND NOT A REPEAL. The guard's one in-sample win in round 1 was
+# 8b4f2aadf3b1:sticker:0, a false positive at score 0.678697 / area 0.780706. That region is
+# mark_like, which keeps the guard, so the win is preserved unchanged. mark_like's 0.500 share
+# also rests on only 3 distinct regions: 8b4f2aadf3b1:emblem:0 and 8b4f2aadf3b1:sticker:0 are the
+# same region under two tags (bbox 0.995x0.990 vs 0.997x0.991), called a correct emblem and an
+# incorrect sticker.
+GUARD_EXEMPT_GROUPS: frozenset[str] = frozenset({"person_like"})
+
+
 def passes_calibrated_cut(score: float, area_fraction: float,
                           concept: str | None = None,
-                          max_area_fraction: float | None = CALIBRATED_MAX_AREA_FRACTION) -> bool:
+                          max_area_fraction: float | None = CALIBRATED_MAX_AREA_FRACTION,
+                          apply_group_exemptions: bool = True) -> bool:
     """The calibrated cut as one predicate: score threshold AND area guard.
 
     One place, so a consumer cannot pick up the threshold and miss the guard. Pass
     `max_area_fraction=None` to reproduce a score-only artifact made before the guard existed
     (every probe table and nesting table on disk today is score-only — see the addenda in
     data/sam/*NOTES.md).
 
     `concept` selects the per-group threshold when one is calibrated; leave it None for the
     pooled cut.
+
+    The area guard does not apply to a concept whose group is in GUARD_EXEMPT_GROUPS (mask round
+    3, loose end A6). Pass `apply_group_exemptions=False` to reproduce an artifact computed with
+    the guard applied uniformly — i.e. anything guard-on written before 2026-08-04.
     """
     if score < calibrated_threshold_for(concept):
         return False
-    return max_area_fraction is None or area_fraction <= max_area_fraction
+    if max_area_fraction is None:
+        return True
+    if apply_group_exemptions and concept is not None and group_of(concept) in GUARD_EXEMPT_GROUPS:
+        return True
+    return area_fraction <= max_area_fraction
```

**Blast radius, and the companion edits the same commit owes.**

- `run_sam.py:115` filters through this predicate with the concept, so future runs keep big person
  masks in their calibrated aggregates. Its stored `calibrated_cut` provenance block (`run_sam.py`
  ~line 145) must gain a `"guard_exempt_groups": sorted(config.GUARD_EXEMPT_GROUPS)` key, or a
  reader cannot tell which rule produced a file — that block exists precisely so a later change to
  the constants is visible in the data.
- `analyze_residual_isolation.py:68` — its **guard-on** branch changes; the guard-off branch does
  not. It already reports both, which is why this is cheap.
- `derive_calibrated_aggregates.py` regenerates guard-on aggregates on **CPU**, so
  `sam-eval-142-v2.calibrated-aggregates.jsonl` and `residual-isolation-analysis.json` can be
  refreshed without GPU. Anything quoted from their guard-on numbers is stale until they are.
- `analyze_nesting.py` defaults the guard **off** — unaffected unless `--max-area-fraction` is passed.
- `analyze-mask-quality.ts` mirrors `CALIBRATED_MAX_AREA_FRACTION` in TypeScript and applies it
  uniformly in its `guardEffect` sweep. Round 1's published numbers are historical and should NOT
  be recomputed, but the mirror comment needs a line saying the Python side now has an exemption,
  or the two drift silently.

**No change is proposed to any score threshold.** The hard-text answers fund a finding, not a
constant: see A12 above — the de-truncated sweep's J gain is zero.

### Proposed decision records (NOT appended to `decisions.json`)

Full text with machine-derived `fundedBy` ids in `mask-quality-3-analysis.json` → `proposals`.

1. **`d-2026-08-04-sam-area-guard-scoped-off-for-person-like`** (instrument-calibration, 12 funding
   records). The guard is scoped off for `person_like`, on for everything else. Must not be read as
   a claim the guard was wrong, nor as a corpus-wide exemption.
2. **`d-2026-08-04-sam-area-guard-unresolved-for-mark-like-and-dynamic-subject`** (deliberately-open,
   4 funding records). Records a **non-move**: both groups fall in the undecided band, the guard
   stays on unchanged, and a round that cannot separate says so.
3. **`d-2026-08-04-sam-text-like-cut-discards-correct-text-on-a12-covers`** (measurement, 24 funding
   records). Funds the finding that the cut discards correct text on the A12 class, and explicitly
   **does not** fund a lowered constant.

A6 can be closed by record 1 once applied. **A12 cannot be closed** — it still waits on the
sub-minute CJK GPU micro-run described above, which has not been run.
