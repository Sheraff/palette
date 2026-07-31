# Track B — adversarial findings 1 and 2

Branch: `worktree-agent-a8b3119dd1877e6fd`
Base: `research/palette-0.9-checkpoint` @ `4b0ffdf` (Track B H4 already integrated at `a864585`)

| commit | task | verdict |
| --- | --- | --- |
| `62e5b41` | merge trunk `4b0ffdf` | — |
| **`60ba13a`** | **Task 1 — drop the midpoint endpoint-proximity veto** | **ready, pending review of 15 new midpoints** |
| `6addc94` | Task 2 — sample contrast on the ramp that renders | **correct but blocked**, see below |

Sweep corpus: 94 images (34 base artworks + scrambled diagnostics + off-panel), the union of
every image path in `research/v2-3-eval/data/results`, minus the artwork marked invalid.

---

## Task 1 — the veto was refuting a claim that is provably false

`palette.ts` refused any midpoint within one bin step of an endpoint, because it "would render
as the same two-stop ramp". That is not merely wrong in some cases; it is wrong in all of
them, and the correct condition turns out to be the guard that was already there.

**Proof.** Write `R3` and `R2` for the three- and two-stop ramps and `C` for the chord
midpoint `mix(bg, surface, 0.5)`. For `t ≤ 0.5`, `R3(t) − R2(t) = 2t·(M − C)`; for `t ≥ 0.5`
it is `2(1−t)·(M − C)`. Both peak at `t = 0.5` with value `(M − C)`. So

> **max‖R3 − R2‖ = ‖M − C‖ = the chord deviation, for every triple.**

Where the midpoint sits relative to an *endpoint* has no bearing on how far the render moves.
Verified numerically over 3,375 triples spanning the OKLab cube — including the degenerate
midpoint-exactly-on-endpoint cases the veto was aimed at — with **max error 0**
(`rendered-difference.ts`). Confirmed again on every corpus case: the measured
`renderedDiff` column equals `deviation` to four decimals, always.

So the first guard was *already* the exact "does the third stop change the render" test the
comment claimed the second was making. The second only discarded evidence, and preferentially
the strongest: a midpoint that coincides with the background and sits 0.27 off the chord
renders a ramp that dwells at one end and then runs — about as far from a straight
interpolation as a three-stop gets, and strong evidence the field is *not* monotone between
the endpoints, which is the entire reason the third stop exists.

### Result: 15 midpoints gained, nothing else moved

**Zero role colours changed. Zero gradient booleans moved. Zero midpoints lost.** The three
existing midpoints are preserved exactly: loups `#fdc568`, doja `#ff8cc6`, birdsofprey
`#1880a7`.

Base artworks (`renderedDiff` equals `deviation` in every row, so one column serves both):

| case | background → **midpoint** → surface | chord would be | deviation | ×binStep | dist. to endpoint |
| --- | --- | --- | ---: | ---: | ---: |
| `muse` | `#000000` → **`#000000`** → `#026faa` | `#00273f` | 0.2674 | 6.7× | 0.0000 |
| `once` | `#817486` → **`#d9dee2`** → `#dddde7` | `#aea7b5` | 0.1604 | 4.0× | 0.0100 |
| `placebo` | `#6c8a8a` → **`#718785`** → `#86a5aa` | `#79979a` | 0.0512 | 1.3× | 0.0104 |
| `slim` | `#01040b` → **`#020308`** → `#140e18` | `#080811` | 0.0421 | 1.1× | 0.0101 |

Off-panel artworks:

| case | background → **midpoint** → surface | deviation | ×binStep |
| --- | --- | ---: | ---: |
| `01/…fcbe42` | `#7b7b71` → **`#b7c1c2`** → `#c1c3c0` | 0.1072 | 2.7× |
| `10/…c16db8` | `#80bbf7` → **`#81b9f2`** → `#b6debc` | 0.0795 | 2.0× |
| `10/…293797` | `#090a0c` → **`#0c0c0e`** → `#273a48` | 0.0878 | 2.2× |
| `11/…4c4721` | `#07395c` → **`#023749`** → `#095f5c` | 0.0729 | 1.8× |
| `06/…f1073` | `#424436` → **`#2d2b16`** → `#2f2e1c` | 0.0541 | 1.4× |
| `09/…440904` | `#6c5d58` → **`#4e3d36`** → `#4b3631` | 0.0472 | 1.2× |

Plus four scrambled diagnostics (`havana-`, `muse-`, `once-`, `placebo-`, `slim-scrambled`),
which mirror their bases and are not artwork.

**The two I would look at hardest.** `muse` is the headline: its midpoint *is* its background,
so the render holds black across the first half and then runs to blue — 6.7× the bar, the
largest deviation in the corpus, and the case Flo independently wondered about. `slim` is the
opposite end: 1.05× the bar between two near-blacks, the marginal one, and the first I would
drop if the bar wants raising.

Accent contrast is unchanged or improved on every new midpoint except `06/…f1073` and
`11/…4c4721`, where the minimum |Lc| moves by ≤ 1.2. No new sign flips anywhere.

---

## Task 2 — right fix, measured regression, do not integrate alone

`fieldSamples` sampled a straight `bg→surface` mix for every gradient, including those that
render three stops. Those samples feed foreground utility, the hue-aware sign guard and accent
salience, so readability was being judged against a field that exists nowhere — and wrong in
the direction that matters, since a third stop is earned *precisely* when it moves the ramp
furthest from the straight line. The treatments whose contrast was most mis-measured were
exactly the ones carrying a midpoint.

Gradient samples now follow the render contract: `bg → midpoint → surface` at
`0/.25/.5/.75/1` when the candidate's own endpoints earn a midpoint, two-stop otherwise, flat
untouched. The earn decision moved into `earnedRenderMidpoint` in `palette-core`, and both the
renderer and the evidence ask through it, so they cannot disagree about what is on screen. The
detected radial geometry is deliberately **not** sampled — the render is what a reader's eye
meets.

### Attribution

| build | changes vs its own base |
| --- | --- |
| Task 1 alone | 15 midpoints, **no role colours** |
| **Task 2 alone** (veto restored, probe build) | **`doja`, `loups`** |
| Task 1 + Task 2 | the above **plus `09/…d1a8b2`** — the genuine interaction |

So the regression below is Task 2's alone, on midpoints that already existed at trunk; the
interaction with Task 1 costs one further off-panel case.

| case | trunk | Task 2 |
| --- | --- | --- |
| `doja` | `#fd75b5` `#fd3d86` `#fff6fc` `#fda8cf` | `#fd75b5` **`#f79e80`** `#fff6fc` **`#ce5e52`** |
| `loups` | accent `#fab14a` | accent **`#fc8831`** |
| `09/…d1a8b2` | `#481232` `#51454f` | `#491734` `#514249`, gains midpoint `#3f112b` |

### The blocker, with its mechanism measured

**`doja` reverts to the treatment Flo rejected.** `#fd75b5`/`#f79e80` is the pink→Bisque ramp
called "not representative… unacceptable" in batch 5, and the reason Track A was integrated.

The mechanism is measured, not guessed. Under render-truthful sampling:

| doja treatment | accent | accent |Lc| range on the 3-stop render | minimum |
| --- | --- | --- | ---: |
| pink→pink (**reviewed correct**) | `#fda8cf` | −26.9 … −7.8 | **7.8** |
| pink→salmon (**reviewed rejected**) | `#ce5e52` | 15.5 … 23.8 | **15.5** |

The correct treatment's accent passes close to its own midpoint colour, so its minimum accent
contrast halves once the midpoint is honestly sampled, and ranking follows the contrast. **The
evidence is right; the weighting that consumes it is what needs to move** — and it is exactly
the criterion the batch-10 rule discounts: *the accent is not used for text, it is used for
icons or UI elements*. A minimum |Lc| of 7.8 for an icon is not disqualifying; the ranking is
treating it as though it were body copy.

`loups`' accent change is a side effect of the same sensitivity, and is arguably favourable:
the new accent `#fc8831` samples `0.0 … 25.0` with **no negative values**, where `#fab14a`
sampled `−16.6 … 12.2` — the sign flip Flo called "a defect a little bit" disappears. Still
unreviewed, since loups' roles carry a strong verdict.

### Recommendation

Hold `6addc94`. It should land **with** a ranking-side change that weights accent
observability according to the recorded icon/UI semantics, or as a reviewed package where
doja's flip is put to a human directly. Integrating it alone silently undoes a batch-5
rejection, which is the one thing this change must not do.

---

## Verification

- Typecheck `research/v2-3/tsconfig.json`: clean.
- `research/v2-3/test/architecture.test.ts`: 2/2.
- Determinism: Task 1 (`muse`, `once`, `loups`) and Task 2 (`doja`, `muse`, `09/…d1a8b2`) run
  twice each, byte-identical.
- Trunk baseline re-derived from `4b0ffdf` by the same harness that measured the changes.
- Parity suite expected to break on the 15 Task-1 midpoint cases. Fixtures untouched.

## Honest assessment

**Task 1 is the strongest thing this track has produced.** The defect is refuted by an
identity rather than by a threshold, the correct condition was already present, and the fix is
a deletion. Blast radius is exactly the class it was aimed at.

**Task 2 is correct and I still recommend holding it.** I have argued before that an
evidence change which displaces reviewed outputs without improving any of them is not worth
its risk (that is why H1 was withdrawn). This is a stronger version of the same situation: the
change is *more* clearly right in principle, and the output it produces is *more* clearly
wrong in one reviewed case. That combination points at the consumer, not the measurement.

**Uncertainty.** (a) `muse`'s midpoint equalling its background is the most visually consequential
new midpoint and nobody has seen it. (b) `slim` clears the bar by 5%; if the review dislikes it
the bar is the thing to question, not the mechanism. (c) I have not verified that the accent
weighting is the *only* channel by which Task 2 flips doja — I measured the accent contrast
change and the flip, and the correlation is exact, but the ranking track owns that scoring
path and should confirm.

## Proposed review batch (6 items)

1. **`muse`** — `#000000` → `#000000` → `#026faa`. Largest deviation in the corpus (6.7×), and
   Flo asked about muse-class gradients unprompted. Does holding black then running read right?
2. **`once`** — `#817486` → `#d9dee2` → `#dddde7`. Ramps fast then plateaus; 4.0×.
3. **`placebo`** — `#6c8a8a` → `#718785` → `#86a5aa`. Subtle, 1.3×; the low-end sanity check.
4. **`slim`** — `#01040b` → `#020308` → `#140e18`. 1.1×, two near-blacks. The marginal case.
5. **`doja` under Task 2** — reviewed-correct `#fd75b5`/`#fd3d86` vs Task-2 `#fd75b5`/`#f79e80`.
   Confirms the batch-5 rejection still stands once contrast is measured honestly.
6. **`loups` accent under Task 2** — `#fab14a` (sign flip) vs `#fc8831` (no flip), roles
   otherwise identical. Bears on the accent zero-crossing Flo flagged.

Items 1–4 gate Task 1; items 5–6 gate Task 2.
