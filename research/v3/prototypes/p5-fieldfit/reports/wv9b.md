# W-V9b — v0.9.0 wired. Suite 112/112, scorecard 0 violations ×4.

`ALGORITHM_VERSION = "p5-fieldfit-0.9.0"`. Owned files only; types proposed in `wv9a-types.md` stand
(add `RoleCandidate.chroma`, `source: "mark"`, `MarkScaleChoice.slopeIndex`, `criterion: "default"`).

## Recovered patch — adopted, with two repairs

Baseline **verified** first: `v9b-collect.ts` over the four committed v0.8.2 runs reproduces
`v9b-baseline-0.8.2.json` exactly (31 covers, rows tagged `p5-fieldfit-0.8.2`).

Adopted: the scale ruling (plateau, else `MARK_SCALE_DEFAULT_DIAGONAL_FRACTION = 0.0077`) and the
erosion short-circuit. Both **re-derived, not trusted**: the two bracketing curves reproduce exactly
(`4130886c02` `N(1)=472` at r/diag `.00236`; NARCOSIS `N(23)=7` at `.02541`; geometric centre
`.00774`). wv9a's "473 marks" is the *entry* count (472 marks + 1 region) — no conflict.

Two repairs, both because the patch was incomplete or unsound:

1. **It never skipped the transform** — it only shrank `pad`, and left a duplicate `inkRadius`
   (a compile error). Completed: `distance` is not computed when the bound fires.
2. **The default could snap onto the terminal `N ≤ 1` rung** — the "everything merged into one"
   degenerate reading the criterion it replaces structurally excluded. Restored to the ladder's
   interior. Measured cost of not doing this: `a8942d6547` read as **one mark = 80% of the frame**.

## Accent tie-break sweep — chroma-first wins 4–0, wired

31 covers × both rules (`v9b-sweep-{mass,chroma}.json`).

| graded verdict | mass-first | chroma-first |
|---|---|---|
| `2376a6b67d` R4-1 **STRONG silent** (R2 dark-olive rejected; R3 red named) | `#26210b` — **breaks it**, and with the rejected dark-olive class | `#f81107` **identical** |
| `908479200b` R4-2 **STRONG silent** | identical | identical |
| `fc8d58e0af` R4-4 **STRONG** (R2 obsidian rejected, brown-green named) | identical | identical |
| `45baf46c90` R4-7 crimson named over sky | `#98a9c3` sky — **not satisfied** | `#8d2639` **crimson** |

No conflict to trade off; no third rule. **All three round-4 silent STRONGs byte-identical.**

**NARCOSIS trace**: crimson enters the pool as a *mark* (mass 41 179, C **.1376**) beside the sky
component (45 730, C .0424). Coverage ties at 1 (each covers one family), foregrounds equal → the
accent term alone decides. Mass keeps the sky; chroma publishes the crimson.

## Delta vs v0.8.2 — 18 of 31 moved

Full table: `v9b-published-0.9.0.json` vs `v9b-baseline-0.8.2.json`. 16 accent-only, 2 foreground
(`d859a69094` unreviewed; `91a16672c4` back to v0.7.1's `#c39170`). Accent sources: 20 overlay,
5 component, 5 mark, 1 collapse. Scale criterion: 11 plateau / 17 default / 3 degenerate.

**Loud finding — one round-3 silent STRONG moved.** `a8942d6547`: `#009cff` → `#39367d`. **Not the
tie-break** — the blue is *more* chromatic (.1807 vs .1168). **Coverage** moved it: the cover's
residual is one contiguous illustration (`N(0)=451, N(2)=5, N(3)=4, N(4)=2, N(6)=1`), so at every
rung one mark holds ~328k of 409k px and its median enters the union at massFraction .80. The accent
covering it reaches coverage 4; the blue 3. `9646be9b20` (R4-3, re-diagnosed) has the same shape:
accent `#000000` → `#7f7ca7`, a 78%-of-frame median at chroma .0648 — responsive to *"black accent…
losing identity"*, but it is wv9a's "mud". **Both pinned as regressions in tests, not re-baselined.**
The v0.9 gate (round-**4** STRONGs) holds; whether an 80%-of-frame median belongs in an identity set
is yours.

## Cost — regressed, and the remaining fix is not my file

3000² marks: **9.3–13.8 s** vs wv9a's 3.8–12.4 s. Cause: the default picks r=32 at 3000², so marks
are few and huge and per-entry work dominates. The short-circuit works (fires **38/50** on
`4130886c02`; ink now **863 ms**/50 entries against wv9a's 2.7 s transform) but cannot fire on large
marks. The dominant term is now `snapToArtwork`/`barNeighbourhoodMass` at **5.5 s** — wv9a's second
named optimization, in **`src/snap.ts`, which I do not own**. Routing it is the only remaining win.
(`v9b-cost-split.ts`.)

## Tests — 112/112, honest recomputation

107 + 5 new (family-union merge/`max`-not-sum, accent-pool dedupe, wired tie-break, scale default,
plus the `a8942d6547` cause). 10 failed and every one was re-derived, none relaxed. Two synthetics
changed verdict by ruling and say so. One — *"the artwork's white beats a more distant dark"* — was
**falsified as a model**: it made `#f81107` the *surface*, when on the real cover that is the
*accent*, so it tested a scene the reviewer's own R3 note (*"missing the strong red"*) had already
superseded. Rebuilt to the cover's real roles and real mass ordering (olive 60 > red 20); it now
reproduces round 4's STRONG and discriminates the two rules.

`tsc --strict` clean but the four pre-existing errors (2 contract, 2 W-M1 probes). Devloop ×4 agrees
with the in-process sweep on all 31. Scorecard: 0 fail, 0 refused, ×4 sets.
