# Track B4 — continuum contrast: the sampling is already exact, and the shortcut is unsound

Branch: `worktree-agent-acd6f08c44777f8a7`
Base: `research/palette-0.9-checkpoint` @ `83ee25b`
Corpus: real artwork via `PALETTE_IMAGES_ROOT`.

**No runtime change.** `research/v2-3/src` is byte-identical to `83ee25b`; all 34 fixtures and
every recorded verdict outcome are preserved by construction.

Flo's question: *"if we evaluate APCA contrast at discrete sample points along the gradient, we
might unfairly penalize or reward based on our sampling, when the real measurement would be
different if taken as a continuum."*

Answered with measurement. Two results, one of which cancels most of the proposed work and one of
which refutes the optimization it was to be built on.

---

## 1. The endpoint-derivable shortcut is unsound — do not build it

The design proposed that per ramp segment, background `Y(t)` is near-monotone, making `|Lc(t)|`
V-shaped, so the continuum minimum is derivable from the endpoints alone (0 if the sign flips
inside the segment, otherwise the smaller endpoint magnitude).

Nothing structural supports that. Along an OKLab mix, `l/m/s` are linear in `t` but the sRGB
channels are their cubes, and expanding APCA's luminance in the cubed cone responses gives
**mixed-sign** coefficients:

```
Y ≈ −0.0404·l³ + 1.1122·m³ − 0.0717·s³
```

so a turning point is available whenever chroma swings while `m` stays put. Measured over 20 000
deterministic random (background, surface, text) triples spanning the sRGB cube, at 2 000 steps
per segment:

| | |
| --- | ---: |
| segments with non-monotone `Y(t)` | **5.82 %** |
| triples where the endpoint shortcut misreports the minimum | **1.26 %** |
| worst `\|Lc\|` minimum error | **7.43** |

The worst case is the dangerous direction: the shortcut predicts `|Lc| = 7.43` where the true
minimum is **0.000** — it claims contrast that is not there, on exactly the zero-crossing
pathology charter rule 2 calls a defect. `verify-monotonicity.ts` reproduces this.

**So the cheap version of continuum evaluation does not exist.** A correct implementation needs a
dense grid with bisection refinement, which is what `continuum.ts` does.

## 2. …but on the real corpus, 5-point sampling already finds the exact minimum

Having built the correct continuum evaluator, the comparison against the current 5 sample
positions over every gradient winner in the corpus — 42 role/gradient pairs:

| | |
| --- | ---: |
| worst `\|Lc\|` minimum error from sampling | **0.00** |
| polarity crossings the samples **missed** | **0** |
| polarity crossings the samples **invented** | **1** |

The minimum is exact in **every single case**, to the printed precision, for both roles.

The reason is structural rather than lucky, and it is why this generalises: the sample positions
`0/.25/.5/.75/1` include **every segment boundary of the rendered ramp** — both endpoints and, for
a three-stop render, the midpoint corner at `t = 0.5`. Since `Y(t)` is monotone within a segment
in ~94 % of cases, the minimum of a V-shaped `|Lc|` lands on a segment boundary, which is always
sampled. The 5 points are not an arbitrary discretisation; they are the ramp's corner set.

**Flo's concern does not materialise for magnitudes.** The sampling is not unfairly penalising or
rewarding anything: it is exact.

## 3. The one place sampling does mislead

`birdsofprey`'s accent registers a **sign flip across the samples that does not exist in the
continuum** (`sampledFlip = true`, `trueCrossings = 0`). Its signed contrast approaches zero and
APCA clamps a band of it to exactly 0, so consecutive samples land on opposite sides of a
clamped-zero plateau that is never actually traversed. Sampling reports a polarity crossing —
"a defect a little bit", in Flo's earlier words — where the continuum shows none.

That is a genuine defect in the sampled machinery, and it is the only one in the corpus.

## 4. The new statistic works, and matches review language

`indistinctFraction` — the total `t`-length where `|Lc(t)|` falls below the adequacy bar. Because
`t` maps linearly across the field, this is literally the share of the gradient's screen area over
which a role is not distinguishable. At the accent bar of 9:

| case | role | indistinct |
| --- | --- | ---: |
| `birdsofprey` | accent | **42.9 %** |
| `loups` | accent | **31.1 %** |
| `09/…99f4` | accent | 29.0 % |
| `birdsofprey` | foreground | 19.4 % |
| `doja` | accent | 10.4 % |
| `loups` | foreground | 4.0 % |
| `once` | accent | 1.8 % |
| all others | both | 0.0 % |

The `loups` row is the validation. Review approved `#fc8831` with: *"the accent remains
distinguishable for a large part of the gradient. **However, on full background colored areas the
accent is still hard to distinguish.**"* The statistic says 31.1 % indistinct — the reviewer
described the residual defect this measures, in the same breath as approving the change. Nothing
in the current sampled evidence expresses that quantity.

Note also that both `birdsofprey` (42.9 %) and `loups` (31.1 %) are **reviewed strong**. So the
statistic is descriptive, not yet a gate: a third of the ramp being indistinct is demonstrably
acceptable. Calibrating a bar on it needs verdicts that turn on it, and there are none yet.

---

## Recommendation

**Do not replace the sampled minimum/mean with continuum equivalents.** The measured difference is
0.00 across the entire corpus. It would be pure churn against 34 reviewed fixtures for no change
in any number the algorithm consumes, and it would replace 5 cheap evaluations with ~512 plus
bisection in the hot ranking path.

**The two things actually worth doing, in order:**

1. **Exact polarity crossings** (`continuum.ts` already computes them by bisection, deterministic,
   no `Math.random`). This fixes a real defect — one phantom crossing — but it lands on
   `birdsofprey`, which is reviewed strong. It should be integrated as a *reviewed* change with
   the before/after put to a human, not silently: it improves a case that currently passes, so the
   only honest justification is correctness, and the risk is that its winner moves.
2. **Publish `indistinctFraction` as evidence** without gating on it, so the next accent review can
   be calibrated against a quantity that already tracks the reviewer's own language. Gating now
   would be an n=0 fence — no verdict has yet turned on it.

I did neither in this arm, because both change reviewed-strong cases and neither is justified by a
demonstrated output improvement. That judgement is the same one that made me refuse the n=1 fence
in B3, applied to a case where the evidence came out the other way than expected.

## Verification

- `research/v2-3/src` byte-identical to `83ee25b`; `git diff` empty.
- `verify-monotonicity.ts` — 20 000 deterministic triples, seeded LCG, no `Math.random`.
- `continuum.ts` — dense grid + bisection, segment-aligned to the three-stop corner; deterministic.
- `probe-sampling-error.ts` — 42 role/gradient pairs over the real corpus.
- Typecheck clean; architecture 2/2; configuration 6/6.

## Proposed review items

None from this arm as it stands. If the orchestrator wants item 1 above, the review item is
**`birdsofprey` before/after exact-crossing polarity** — its accent currently carries a phantom
sign flip, and removing it may move the winner of a reviewed-strong case.
