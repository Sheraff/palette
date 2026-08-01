# `ae-confirm` — confirmation batch (9 items), OPTIONAL

**Arm:** `accent-evidence`. **Trunk:** `5279f87`. **Branch:** `worktree-agent-a6de7bb777438fac1`.
**Decision package:** `research/v2-3-experiments/accent-evidence/INTEGRATION.md`.

Build it only if the orchestrator wants the loss column confirmed before integrating. If integration
proceeds on the existing 6:9 `ae-batch` result, this batch is unnecessary — it asks nothing new.

## What this batch asks

`ae-batch` came back **6 of 9 for the arm**, so the wins are settled. This batch is the other half:
every item is an artwork where the arm moves a palette **away from something you already decided**.

> **You decided these before. Do they still hold?**

Both sides are real algorithm output: `aa-off` is trunk (byte-identical to it on 223/223
extractions), `aa-on` is the arm at its shipping candidate configuration.

## Honest notes

1. **I expect to lose most of this batch, and that is the point.** Seven of the nine are cases where
   the warehouse already records a preference against where the arm lands. I am asking whether those
   preferences still hold under current taste, not trying to overturn them.
2. **Two items (8, 9) you have never seen the arm's side of.** Trunk happens to match a one-sided
   endorsed sample there; the arm's destination has never been shown to anyone. They are the sample
   from the eleven such cases.
3. **The losses are not separable from the wins.** Measured: every configuration of this arm moves
   all of these artworks *and* all of the artworks you endorsed in `ae-batch`. There is no setting
   that keeps one and drops the other, so "prefer trunk here" does not mean "tune it" — it means
   pricing the trade.
4. **Item 1 you priced twice already**, most recently in `ae-batch` itself. It is included because it
   is the single most-adjudicated artwork in the loss column and a third confirmation makes the price
   unambiguous.
5. Blinding is content-derived per item, balanced **5 items with `aa-on` as A, 4 with `aa-off` as A**.

## Items

| # | artwork | what the warehouse already says | what the arm does |
|---|---|---|---|
| 1 | `…000d5cdb…` | **ae-batch strong** for trunk + batch-28 strong (a pure-foreground A/B the gold won); note "both accents work, but the foreground is better on option B" | fg `#f7de67` → `#c7c6c1`, accent `#f22632` → `#cd1227` |
| 2 | `doja.jpg` | review-4 strong for trunk; review-5 graded the arm's palette **unacceptable**; review-12 strong for trunk, reason: "a gradient between pink and Bisque skin color which does not represent this artwork" | surface `#fd3d86` → `#f79e80`, accent `#fda8cf` → `#ce5e52` |
| 3 | `…0002881a…` | review-24 strong preferred `#d0456e` accent; review-8 note "the surface color feels dull, almost grayish" | **mixed** — accent lands on the endorsed `#d0456e`, surface lands on the one called dull |
| 4 | `horsley.jpg` | review-7 strong, stated preference | all four roles leave the decided palette |
| 5 | `…00110226…` | **batch-39-ordering** strong, stated preference | foreground |
| 6 | `…000f723f…` | **rw-batch-roleflip** strong, stated preference | accent |
| 7 | `…0012eb9a…` | batch-26 acceptable, stated preference | surface + foreground |
| 8 | `…001031d1…` | batch-26 strong — **one-sided**, arm's destination unseen | foreground |
| 9 | `…0011c1dc…` | batch-ma-revival strong — **one-sided**, arm's destination unseen | foreground |

## Serving

```sh
node --no-warnings --experimental-strip-types research/v2-3-eval/serve-review.ts ae-confirm
```

## What each outcome commits us to

Decided before the batch is seen.

- **trunk preferred on ≥ 7/9** — the loss column is real and current. Integration still has a case
  (13 adjudicated wins vs 7 losses) but it is a knowing trade, and the seven should be named in the
  integration commit so no later arm files them as bugs.
- **roughly split** — several old preferences have moved with taste; the trade becomes clearly
  positive and integration should proceed without further review.
- **arm preferred on ≥ 5/9** — the loss column largely dissolves, and the only remaining question is
  `doja` and `0d5cdb`, which are the two most-adjudicated artworks in the corpus.

Nothing in this batch can change the arm's configuration, because §2 of `INTEGRATION.md` proves the
wins and losses are one mechanism. It can only change the price.
