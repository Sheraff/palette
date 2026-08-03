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
