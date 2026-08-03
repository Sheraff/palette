# The ladder, re-scored against an answer key the instrument could actually have

**Date:** 2026-08-03 · **Analysis only — no GPU, no model, zero new inferences.**
**Produced by:** `analyze_capped.py` → `data/oracle-ladder/ladder-sample-1.capped-reference.analysis.json`
**Does not supersede:** `data/oracle-ladder/ladder-sample-1.analysis.json`, which stays the
authority for the published floors. Both answer keys are reported side by side, always.

Closes the analysis half of **unrealized-ideas item 5**, which was itself the ladder README's own
smoke finding (§198-201) and §7's last bullet: *"the reference rendition should be capped at a
viewing-plausible size and the ladder re-scored; the run does not need repeating, only the
analysis."*

---

## The problem, in one paragraph

Every published resolution floor grades a small rendition against **the artwork's largest
rendition**. For **223 of the 400 sampled artworks that largest rendition is bigger than 640 px** —
up to 3,000 px. The instrument is hard-capped at 640 (`oracle/premise/common.py`,
`RESOLUTION_CAP_PX = 640`, downscale-only), and the sharded corpus tops out there too. So the
answer key was allowed to see paper grain, canvas weave and faint gradients that **no downstream
consumer of the label, and no viewer, ever sees**. Renditions were then marked wrong for failing
to report them.

Nobody had ever checked how often this happens. It happens **often, and in one direction**.

## How common, and which way

Over the 223 artworks whose key sits above the cap:

| question | key changes when capped | …and every viewable rendition agreed against it |
|---|---|---|
| `ground_type` | **17.9%** (40/223) | **14.3%** (32/223) |
| `gradient_boolean` | 13.5% (22/163) | 10.4% |
| `field_texture` | 10.8% (24/223) | 9.4% |
| `enclosure` | 4.5% (10/223) | 2.7% |
| `shading_geometry` | **32.9%** (23/70) | 28.6% |

The second column is the paper-grain signature in its strong form: the big rendition says one
thing, and **every** rendition at or below the cap unanimously says another.

**The direction is not a wash — it is 11.5 to 1.** Of the 40 `ground_type` disagreements, **23**
are "the big file sees structure (`shaded_field` / `pattern_or_texture`) where every viewable file
sees `flat_field`", against **2** the other way. Twenty of the twenty-three are exactly
`shaded_field → flat_field`: **the published key was calling gradients that are not visible at any
size the pipeline can be given.** Item 5 said the bias ran "in an unknown direction". It is now
known, and it runs toward hallucinated structure.

## What moved

Floor = the smallest bin edge above which every bin clears 0.85. Capped key = each artwork's
largest rendition ≤ 640 px.

| question | published floor | **capped floor** | moved? |
|---|---|---|---|
| `ground_type` | ~241 px | **~241 px** | no |
| `gradient_boolean` | ~241 px | **~241 px** | no |
| `field_texture` | ~241 px | **~341 px** | yes — one bin worse |
| `enclosure` | answerable at every size | **~241 px** | yes — gains a floor |
| `shading_geometry` | ~441 px | **never clears the floor** | yes — collapses |

**The two floors anything downstream actually leans on did not move.** `ground_type` and the
`gradient_boolean` derived from it — the input to the palette's gradient decision — hold at ~241 px
under the honest key, and the gradient boolean's agreement gets *better*, not worse
(0.863 → 0.877 pooled), which is what you would expect once the key stops seeing gradients that
are not there.

The three that moved, each read carefully:

- **`field_texture` 241 → 341 px.** The 241-340 bin falls from 0.871 to 0.810. Its codec ceiling
  *rises* under the cap (0.922 → 0.949), so this is not noise-explained. But the bin's interval is
  [0.747, 0.860] — **it contains 0.85**, so the move is *unresolved*, not measured. Read it as
  "300 px `field_texture` is no longer supported by this data", not "300 px `field_texture` is
  proven bad".
- **`enclosure` gains a ~241 px floor** because its 0-160 bin drops 0.898 → 0.842. Interval
  [0.789, 0.884] — again straddles 0.85. Unresolved. `enclosure` remains the strongest question in
  the set at every size.
- **`shading_geometry` collapses to "never clears the floor".** This one is not really a
  resolution result. Its **same-size codec control under the cap is 0.796** — two byte-different
  encodings of *identical pixels* agree only 80% of the time. **The 0.85 floor is above this
  question's own noise ceiling, so no resolution could ever clear it.** Its published ~441 px floor
  was an artifact of a key that had extra information, not a size at which the question becomes
  reliable. §7 already warned "treat its floor as the size below which it is hopeless"; the capped
  score says the floor was never meaningful at all.

## The codec control under the cap

Same size, different bytes — the noise floor every curve has to be read against. Restricted to
sizes the instrument can be shown (≤ 640 px), which is the honest restriction: a disagreement
measured at 1,440 px is not this corpus's noise floor.

| question | published control | capped control (≤640) | vs the 0.85 floor |
|---|---|---|---|
| `ground_type` | 0.903 (n=206) | **0.885** (n=156) | ceiling above the floor — floor reachable |
| `field_texture` | 0.922 | **0.949** | reachable |
| `enclosure` | 0.961 | **0.955** | reachable |
| `gradient_boolean` | 0.907 | **0.887** | reachable |
| `shading_geometry` | 0.857 (n=63) | **0.796** (n=44) | **floor is ABOVE the ceiling — unreachable** |

A1's conclusion survives for four of five questions: the failing resolution bins sit below their
codec ceilings, so those drops are genuine resolution effects. **For `shading_geometry` it does
not survive** — under the cap its ceiling falls beneath the floor being applied to it.

## Does any corpus-inclusion decision read differently?

The open question is the **2,270 artworks that exist only at 300 px** (pipeline §12: are they
worth including, or is a 4,631-artwork corpus of 640 px renditions a better instrument?). 300 px
lands in the 241-340 bin:

| question | published 241-340 | capped 241-340 | clears 0.85? |
|---|---|---|---|
| `gradient_boolean` | 0.872 | **0.878** | yes, under both keys |
| `ground_type` | 0.857 | **0.853** | yes, under both, narrowly |
| `enclosure` | 0.941 | **0.902** | yes, under both |
| `field_texture` | 0.871 | **0.810** | **no longer** |
| `shading_geometry` | 0.683 | 0.706 | no, under either |

**The decision does not flip.** The gradient boolean — the only one of these the palette contract
consumes — clears the floor at 300 px under the honest key and clears it slightly *better* than
under the published one. Keeping the 2,270 300 px-only artworks stays correct.

What changes is the **blind-spot list that comes with them**: under the honest key a 300 px
rendition supports `ground_type`, `gradient_boolean` and `enclosure`, and must be tagged
`below_resolution` for **`field_texture`** (newly) and `shading_geometry` (already). The corpus
was never the problem; the per-question tagging was one question too generous.

## What this re-score cannot say

Stated plainly, because two of these are load-bearing:

1. **The capped key is a proxy.** The pipeline would take the 3,000 px file and downscale it to
   640. That image was never inferred and inferring it needs the GPU this analysis was forbidden.
   The key used here is the CDN's *own* ~483 px or ~333 px rendition — a different resampler and
   codec arriving near the same size. The size of that proxy error is exactly the codec control
   above (0.80-0.95 depending on question), and it is reported beside every number rather than
   assumed away.
2. **The published `REFERENCE_MIN_LONG_EDGE_PX = 500` rule cannot survive the cap.** Measured:
   **zero** of the 223 affected artworks own a rendition between 500 and 640 px — the CDN derives
   ~147 / ~333 / ~483 and then jumps to the original, which is why the 561-680 bin is structurally
   empty. Keeping 500 would not tighten the analysis, it would delete every artwork the cap is
   about. The headline capped column therefore uses **441 px** (a published bin edge, the largest
   value admitting the ~483 keys) and the JSON reports 500 / 441 / 300 / 0 side by side. **This is
   a deviation from a published constant and is stamped as one in the output.**
3. **Most verdicts are not settled at 0.85.** Of the decisive bins, most have a 95% interval that
   *contains* 0.85 — including both bins behind the `field_texture` and `enclosure` moves. The
   floor is still `[UNCALIBRATED]` (loose end **A2**) and this data cannot sharply resolve verdicts
   at that value under **either** key. `floor_fragility` in the JSON flags every bin as settled or
   not.
4. **Power is lower, honestly.** 1,190 → 669 primary comparisons; 373 → 193 artworks. **49
   artworks leave the analysis entirely** — their only rendition at or below the cap is their
   smallest (~147 px), so they own a key with no rung beneath it. That is a fact about what the CDN
   derived, not a result.
5. **The transfer check is untouched.** Its rows were already all ≤ 640 px (a ~300 rung against a
   ~640 key), so capping changes nothing: predicted 0.834 vs observed 0.818, still holds, n=145
   identical. The argument that lets the curve be used corpus-wide never rested on the contaminated
   key. **This is the reassuring result of the whole exercise.**
6. **The ladder is still silent on whether 640 px is enough.** Capping the key cannot answer that;
   it still needs a different collection.

## Verification

Column A in the new JSON is produced by importing `analyze.py`'s own scoring functions and is
asserted **bit-identical** to the published `ladder-sample-1.analysis.json` — curves, pooled
rates, codec control and floor verdicts, all five questions. Any difference between the columns is
a difference of answer key and of nothing else.
