# `ae-batch` — review manifest (9 items)

**Arm:** `accent-evidence`. **Trunk:** `a74f865`. **Branch:** `worktree-agent-a6de7bb777438fac1`.
**Full record:** `research/v2-3-experiments/accent-evidence/EXPERIMENT.md`.

## What this batch asks

Both sides are **real algorithm output** — no synthetic palette anywhere, unlike `sr-batch`. One side
is today's published palette (`ae-off`, byte-identical to trunk on 223/223 artworks); the other is the
same algorithm with the **accent evidence channel** on (`ae-on`): the accent role scored by the
algorithm's own accent-role classifier instead of by its signature score.

The mechanism **fails its own success metric** — it delivers 0 of the 7 accent asks `sr-batch`
adjudicated in its favour — and it ships OFF. So the question here is not "did it work".

> **The channel moves 27.9 % of the whole 7550-artwork corpus — and 30 artworks you have already
> graded. Are those moves better or worse?**

If they are mostly better, a mechanism that fixes the accent's evidence is worth carrying even though
it does not produce the specific hexes, and the next arm has a mandate at the winner comparator. If
they are mostly worse, the accent-evidence site is closed and the accent-correction class should stop
being mined as a target set.

## Honest notes — read before reviewing

1. **The mechanism does not deliver the accents you asked for.** On the five artworks where you
   preferred the prescribed accent in `sr-batch`, the published accent is unchanged on four and moves
   sideways (not to the ask) on one. That is measured, not hidden. This batch is about the collateral.
2. **Two items are known regressions against your own `strong` grades** (items 1 and 6). They are in
   the batch because a regression you confirm is worth more than one I argue away.
3. **Item 1 reverses a decision you already made twice.** `000d5cdb` was asked for `#cd1227` in
   review-25 and batch-27, then batch-28 graded `#f7de67` + `#f22632` **strong with an explicit side
   preference**. The `ae-on` side produces the old ask and takes the gold foreground away — the exact
   dim grey `#c7c6c1` you rejected in words ("The Dim grey feels too neutral for this artwork, it is
   not the focus of it"). Under verdict recency the `ae-off` side is the standing answer.
4. **Items 8 and 9 are fresh off-panel artworks** no review has seen, drawn from the movers, per the
   standing fresh-artwork instruction. They carry no prior verdict and nothing is being defended.
5. **Blinding is deterministic and content-derived** — 5 items show `ae-on` as A, 4 show `ae-off` as A.
   Neither the batch name nor the item order encodes a side.
6. Corrections are recorded as `endorsed-sample`, not oracles. Preferring either side, or neither, is
   a good answer.

## Items and their standing verdicts

| # | artwork | standing verdict | what moves (`ae-off` → `ae-on`) | why it is here |
|---|---|---|---|---|
| 1 | `ab67616d0000b273000d5cdbc67ed815efc360ad` | **batch-28 `strong`**, preferred `cr-m1` | fg `#f7de67` → `#c7c6c1`, accent `#f22632` → `#cd1227` | **the decisive regression.** Pinned roles 4/4 → 2/4. Predicted cost. |
| 2 | `ab67616d0000b273000e91d6c3b44e900d334a78` | review-20 `strong`, with a standing ask: *"Both the tangerine orange and the lemon chiffon yellow should be on the palette"* | fg `#e1ddda` → `#fbf072`, accent `#fbf072` → `#f94d37` | the `ae-on` side puts **both** on the palette. Predicted win. |
| 3 | `ab67616d00001e02000c4d52300a016ee65f1622` | line 202 salience ask, no later verdict: *"a bit muted compared to the artwork that contains very rich purples"* | surface `#300c16` → `#481f25`, accent `#b67161` → `#aa4483` | the one **standing** ask the channel moves toward (ΔE to the prescription 46.8 → 19.8). Predicted win. |
| 4 | `ab67616d0000b27300103a3729bf589e0dc913ab` | batch `acceptable`; line 167 corrected the accent to `#b29b3e` | all four roles move; accent `#f9f9ef` → `#fb870c` | moves **closer** to your recorded correction on the corrected role. |
| 5 | `ab67616d0000b2730007cc8b341c11227aa7b461` | **`sr-batch` `strong`** — you preferred the `#f06d13` orange ask | accent `#242426` → `#1f3a29` | direct accountability: the artwork whose ask you endorsed most strongly, where the channel moves the accent and **still does not reach the orange**. Predicted cost or neutral. |
| 6 | `ab67616d0000b2730005a91812c85db291ea5d85` | **batch-31 `strong`** | surface `#123146` → `#0c5381` | second guardrail mover; a single-role change on a graded-strong palette. |
| 7 | `ab67616d0000b2730009d178a401f9433fdddff2` | **batch-34 `strong`** (supersedes the line-132 ask) | surface `#c42a42` → `#ed3358` | the most recent `strong` grade the channel disturbs. |
| 8 | `ab67616d00001e02000f0a78a1791248aec707e3` | **none — fresh off-panel** | all four roles move | unseen artwork, largest fresh mover. |
| 9 | `ab67616d00001e0200060491ade88c8893373d9f` | **none — fresh off-panel** | fg + accent move | unseen artwork; also the one artwork where the inherited candidacy reservation needs *both* of its seats to fire. |

## Serving

```sh
node --no-warnings --experimental-strip-types research/v2-3-eval/serve-review.ts ae-batch
```

## What each outcome commits us to

Decided before the batch was seen.

- **`ae-on` preferred on ≥ 6/9** — the accent evidence channel is right even though it does not
  produce the asked-for hexes. It should be integrated at `"quality"` (the cheaper site: 26.0 % vs
  28.3 %, same delivery), the two broken guardrails re-graded, and the fifth arm gets a mandate at the
  winner comparator's contrast half (`relationUtility`'s band, `accentUtility`/`accentPath` outranking
  every identity block).
- **Split, roughly 4/5** — the channel is a lateral move. Ships OFF permanently; keep
  `familyAccentRoleEvidence` (proven inert) and close the accent-evidence line.
- **`ae-off` preferred on ≥ 6/9** — the accent-evidence site is closed for good. Four arms have now
  attacked it from four directions and the last one *repairs the evidence* and still publishes
  nothing; if its collateral is also unwanted, the 15 standing accent corrections should stop being
  treated as a target set and the class should be retired.

Any outcome is decisive, which is why it is worth running before a fifth mechanism.

## Revert rules

- Both flags ship `"off"` and neither may be enabled on `sr-batch` alone — that batch adjudicated the
  *asks*, and this mechanism does not produce them.
- `CHROMATIC_CANDIDACY_RESERVATION` is inherited verbatim from `accent-candidacy` (`6f3ab16`), which
  recommends against enabling it on its own evidence. Nothing here overrides that.
- `familyAccentRoleEvidence` (`role-obligations.ts`) is a pure extraction, proven inert on 223/223
  extractions and 34/34 parity fixtures. Keep it under every outcome.
