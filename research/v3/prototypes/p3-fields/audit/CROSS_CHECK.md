# P3 cross-check — the two field implementations, measured

**Auditor:** W3. **Harness:** `audit/cross-check.ts` (deterministic, no randomness anywhere).
**Subjects:** `src/fields.ts` (W1) and `falsifier/fields.ts` (W2), written blind to each other.
**Images:** the first five paths of the demo-20 set file named in the run header of
`research/v3/data/devloop/runs/p3-fields-0.1.0-demo-20-20260804T170925475Z.jsonl`.

## What the harness shares and what it does not

Decoding is shared: both implementations receive the *same* 8-bit sRGB buffer and the same
eligibility mask, obtained once through W1's `decodeImage`. Decode is upstream of both field
implementations and neither proposal treats it as part of the mechanism. Everything downstream of the
buffer is each author's own — W2 recomputes sRGB→OKLab from Ottosson's coefficients and re-derives its
own region codes rather than reading W1's `lab` or `bar` planes. The Spearman statistic is written in
the harness itself, so the referee belongs to neither side.

Depth Spearman is taken over 10 000 pixel indices at a deterministic stride (`floor(count/10000)` = 9
for a 300×300 image, indices `0, 9, 18, …`).

## Results

| image | size | eligible | edge frac W1 | edge frac W2 | edge pixels disagreeing | depth Spearman ρ | depth samples bit-identical |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `00007e976f2f…ba3.jpg` | 300×300 | 90 000 | 0.228489 | 0.228489 | 0 | 1.000000 | 10 000 / 10 000 |
| `ab67616d…00d8bc25fbca2eff2a4a.jpg` | 300×300 | 90 000 | 0.115011 | 0.115011 | 0 | 1.000000 | 10 000 / 10 000 |
| `ab67616d…01335fe604d859a69094.jpg` | 300×300 | 90 000 | 0.196589 | 0.196589 | 0 | 1.000000 | 10 000 / 10 000 |
| `ab67616d…099e97d17d28279e9184.jpg` | 300×300 | 90 000 | 0.473689 | 0.473689 | 0 | 1.000000 | 10 000 / 10 000 |
| `ab67616d…0bb3dc49110c4aab8aa7.jpg` | 300×300 | 90 000 | 0.474767 | 0.474767 | 0 | 1.000000 | 10 000 / 10 000 |

Total: **0 disagreeing edge pixels out of 450 000**, and **50 000 / 50 000 depth samples equal to the
bit**. Not "highly correlated" — identical.

## Controls, because perfect agreement is a claim that has to be earned

The brief said perfect agreement was not expected, so the first thing to rule out was a harness that
accidentally runs one implementation twice. Three controls, all run:

- **The W2 path is live.** Varying only W2's rank parameter moves its edge count sharply on the first
  image: k=2 → 25 044 edges, k=3 → 20 564, k=4 → 15 363. W1 at its `EDGE_RANK = 3` gives 20 564. The
  agreement is at k=3 and nowhere else, so the two code paths are genuinely both executing.
- **W2's OKLab is bit-identical to the contract's.** `max |rgb8ToOkLab − rgbToOkLab| = 0` over all
  90 000 pixels of the first image. Both are Ottosson's direct formulation with the same coefficients
  in the same association order, so the independent re-derivation lands on the same floats exactly.
- **The threshold comparisons are not trivially identical.** W1 compares `hypot(Δ) > bar`; W2 compares
  `Δl²+Δa²+Δb² > bar²`. These are *not* the same arithmetic — `Math.hypot` and `sqrt(Σ)` differ in the
  last ULP on 19 630 of 89 999 adjacent pixel pairs of the first image. A disagreement would require
  that ULP to straddle the bar exactly, which happened zero times in 450 000 pixels.

## Reading

The two implementations do not merely agree within tolerance; they produce bit-identical edge maps and
bit-identical depth fields on all five images. That is a stronger result than the cross-check was
designed to detect, and it is explicable rather than suspicious. The edge indicator is a *rank filter
on exact order statistics*: its output depends on the position of the k-th largest neighbour distance
relative to a frozen constant, and both authors converged on the same k, the same "p's own region"
reading of the bar (rather than the pair bar), the same `min(k, available) − 1` truncation rule at
borders, and the same exclusion-not-matting treatment of ineligible pixels. Rounding differences of a
few ULPs exist between them and are annihilated by the ranking — which is precisely the robustness
property arm-d claims for rank statistics, showing up here as agreement between two independent
authors rather than as a dither result. The depth field then follows deterministically: both use the
exact Felzenszwalb–Huttenlocher separable transform on integer-exact squared distances, so identical
seeds give identical output with no floating-point latitude at all.

Two documented parameter differences exist and were **not exercised by this corpus**, so they remain
untested rather than confirmed benign:

1. **Seed set.** W1 seeds the distance transform with edge pixels **or ineligible pixels**
   (`src/fields.ts:175`); W2 seeds it with edge pixels only (`falsifier/study.ts:192` passes `edge`).
   All five images are opaque JPEGs with 90 000/90 000 eligible pixels, so the difference is inert
   here. It would separate the two fields on any artwork with transparency — W1's reading (a pixel
   beside a transparent region is beside a boundary) is the consistent one, and W2's would let depth
   grow across a transparent gap.
2. **Seedless handling.** W1 fills depth flat at 1 and flags `seedless` (`src/fields.ts:181–184`);
   W2 returns `null` and makes the caller say so (`falsifier/fields.ts:275`). No image in the sample
   was seedless (`seedlessW1=false`, `depthNullW2=false` on all five).

**Conclusion: no structural disagreement, and none of the disagreements the brief anticipated
materialised.** The two divergences that do exist are documented, are in the transparency and
degenerate-input paths, and are untested by demo-20. A cross-check on a transparency-bearing set would
be needed to close them.
