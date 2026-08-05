# Round 4 — staging verification

Eleven checks, run as code (`verify.ts`), against what is on disk. Re-run at any time:

```
node --experimental-strip-types research/v3/prototypes/p3-fields/review-rounds/round-4-polarity/verify.ts
```

Exit code 0 = every check passed. **Recorded run: 2026-08-05, exit 0, all checks pass — 6 items,
12 palettes.** Re-run after scratch cleanup: exit 0.

```
item-124 [tie-band] gap=0.00534 ΔL=0.7276 pub=dark hexes=16 path:ok pixels:ok endpoints:ok collapse:ok polarity-only:ok contract:ok preview:ok
item-130 [tie-band] gap=0.02048 ΔL=0.1247 pub=dark hexes=12 path:ok pixels:ok endpoints:ok collapse:ok polarity-only:ok contract:ok preview:ok
item-168 [tie-band] gap=0.05037 ΔL=0.1174 pub=dark hexes=12 path:ok pixels:ok endpoints:ok collapse:ok polarity-only:ok contract:ok preview:ok
item-009 [tie-band] gap=0.05612 ΔL=0.0537 pub=dark hexes=12 path:ok pixels:ok endpoints:ok collapse:ok polarity-only:ok contract:ok preview:ok
item-065 [tie-band] gap=0.09676 ΔL=0.8474 pub=dark hexes=8  path:ok pixels:ok endpoints:ok collapse:ok polarity-only:ok contract:ok preview:ok
item-132 [fill]     gap=0.10244 ΔL=0.4132 pub=light hexes=8 path:ok pixels:ok endpoints:ok collapse:ok polarity-only:ok contract:ok preview:ok
check 8: pinned copy reproduces 220/220 coverage-220 rows exactly
check 9: 12 pinned files, provenance ok; override touches [constants.ts, field-roles.ts, pipeline.ts]
check 9b: override absent from all 12 live src/*.ts files
check 10: 19 candidates — reproduction leg 19/19, swap leg 19/19
check 11: blinding ok — 6 neutral itemIds, no mechanism text in served fields

ALL CHECKS PASS — 6 items, 12 palettes
```

---

## 1 — Paths resolve in the MAIN checkout

`items.jsonl` carries **repo-relative** paths and `parseItem` requires absolute ones; the installer's
transform is `/Users/Flo/GitHub/palette/` + `imagePath`. The round was staged from a worktree whose
corpus shards are symlinks back to the main checkout, so the worktree's own absolute paths carry a
meaningless `.worktrees/p3-fields/` prefix. **The path checked is the one the consumer will use.**

| itemId | imagePath (repo-relative) | collection |
| --- | --- | --- |
| `item-124` | `0b/ab67616d0000b273000b1beb3b6d1f76fac28805` | `sharded-corpus` |
| `item-130` | `0c/ab67616d00001e02000c4ff9e01aba5eae6cbec4` | `sharded-corpus` |
| `item-168` | `11/ab67616d0000b2730011a326091e7dd7df58b175` | `sharded-corpus` |
| `item-009` | `music-artworks/3/8/7/3871a29a60651eb65e6ba7f31f7f899f.jpg` | `music-artworks` |
| `item-065` | `01/ab67616d00001e0200017f538694affaa568938d.jpg` | `sharded-corpus` |
| `item-132` | `0c/ab67616d0000b273000caa57174d7dd5f3a991ce` | `sharded-corpus` |

**6/6 resolve.**

## 2 — Every hex on BOTH sides is an exact pixel of the artwork

**68 published colours checked, 68 are exact pixels at native resolution.** Decoded here by `sharp`
independently of the pipeline — sRGB, no resample (no size argument is passed, so the raw buffer *is*
the decode), alpha < 255 excluded.

Per item: `item-124` 16 hexes (4 roles + 4 stops, ×2 sides), `item-130` / `item-168` / `item-009`
12 each (4 roles + 2 stops, ×2), `item-065` / `item-132` 8 each (4 roles, no gradient, ×2).

**This check carries more weight here than in round 3**, and the difference is worth naming. Round 3's
second side was *constructed* from the first by deleting the gradient, so it could not introduce a
colour the first side had not already published. Here side 1 is a genuine second run of the selection
cascade and could in principle publish something new. It does not: every colour on the forced side is
an exact triple present in the artwork. That is the discipline line holding under the override.

## 3 — Gradient endpoints are the field roles, on both sides, and the ramps reverse

Four of six covers publish a gradient; `item-065` and `item-132` publish none, **on both sides**
(check 3 fails a pair where the gradient is present on one side only — a ramp appearing or vanishing
under a polarity flip would be a second manipulation).

On all four gradient covers, on **both** sides: first stop == `background`, last stop == `surface`.
This is the reviewer's own ruling of 2026-08-04 (*"the first stop is the background and the last stop
is the surface"*) holding in both directions.

The two sides' ramps are exact **reverses** in colour with positions reflected about ½. Positions are
compared with a ±0.0626 (one rank step) tolerance because the interior guide stops are recomputed by
the excursion machinery on the second run rather than derived as `1 − t` — which is the point:

| itemId | side 0 stops | side 1 stops |
| --- | --- | --- |
| `item-124` | `#28211b` 0 · `#85705f` 0.4062 · `#e36c4c` 0.5625 · `#fdf7f9` 1 | `#fdf7f9` 0 · `#e36c4c` 0.4375 · `#85705f` 0.5938 · `#28211b` 1 |
| `item-130` | `#deb355` 0 · `#fcdf99` 1 | `#fcdf99` 0 · `#deb355` 1 |
| `item-168` | `#0b0800` 0 · `#26211d` 1 | `#26211d` 0 · `#0b0800` 1 |
| `item-009` | `#0a0904` 0 · `#1c1208` 1 | `#1c1208` 0 · `#0a0904` 1 |

**4/4 pass, both sides.**

## 4 — Collapse flags consistent, both directions, both sides

`surfaceCollapsed == (surface === background)` and `accentCollapsed == (accent === foreground)`, on
12/12 palettes. The check also **refuses any item whose surface is collapsed**, because a collapsed
field has no polarity to invert — that is the selection rule from `ROUND.md` re-asserted here so it
cannot be bypassed by hand-editing `items.jsonl`.

`item-124` carries `accentCollapsed: true` (accent == foreground == `#fffefc`) on **both** sides — a
`0.3.0` property of that cover, unchanged by the manipulation.

## 5 — The sides differ in exactly {background, surface, gradient}, with bg/surface swapped

For each item, the set of snapshot keys whose values differ between the two sides is required to be
exactly `background,surface,gradient` (gradient covers) or `background,surface` (flat covers).

**12/12: `foreground`, `accent`, `surfaceCollapsed` and `accentCollapsed` are byte-identical between
the sides on every cover.** Additionally asserted: `s0.background === s1.surface` and
`s0.surface === s1.background` — an exact exchange, not two independently re-derived colours that
happen to be close. And `variantId` differs between the sides, which `parseItem` requires.

## 6 — `validatePalette` passes on both sides of all six covers — 12/12

Run on the **full `Palette`** from each side's own pipeline run (the snapshot on the item line is a
projection of it), and the check additionally asserts the item line's four role hexes equal that
palette's, so a stale `items.jsonl` cannot pass.

**12/12 valid, zero violations.** This is the pre-registered admission criterion: this round cannot
settle contract validity, so a pair with a contract-invalid side would be a leading question and is
excluded by selection rather than judged by the reviewer.

## 7 — `render-preview.json` renders the item it belongs to

Every entry's `pushedSide0_asPublished` and `pushedSide1_polarityInverted` role hexes are checked
against the corresponding side of the same `itemId`. **6/6, 48 role comparisons.** `render-preview.json`
is a local staging artifact built through `sideFromPalette` — the same `review-server/color.ts` and
`review-server/gradient.ts` the server uses — and is **not** a server input.

## 8 — Side 0 is byte-for-byte what the published candidate emits

The pinned copy, run with no override, reproduces **220/220** rows of
`measurements/run-coverage-220-0.3.0.jsonl` exactly — full `Palette` JSON equality, not just role
hexes.

That run was produced by `bead404`'s `src/`. The only behavioural difference between `bead404` and
`5a4f845` in the selection path is itself behind an unset env var (`P3_DEPTH_FLOOR_MODE`, added by
W11b). So this single check establishes both halves of the provenance claim: **the pinned copy is the
candidate**, and **the override is inert when unset**. The fingerprint `gitCommit: 5a4f845,
dirty: false` on side 0 is therefore a fact.

## 9 — The pinned copy is `5a4f845` plus exactly the two documented changes

For each of the 12 pinned modules, `verify.ts` re-extracts the committed file with
`git show 5a4f845:research/v3/prototypes/p3-fields/src/<file>.ts`, mechanically undoes the two
documented changes, and demands **byte equality**. **12/12 pass.**

The override is confined to three files — `constants.ts`, `field-roles.ts`, `pipeline.ts` — which the
check reports rather than assumes. The other nine differ from the commit only by the import-depth
rewrite.

**Check 9b — override containment. All 12 live `src/*.ts` files were scanned for
`P3_FORCE_BG_POLARITY` and `backgroundPolarityOverrideInUse`: absent from all of them.** The override
exists in the pinned copy only; nothing on the shipping path can reach it.

This is the **only** read of live `src/` in the whole round, it is read-only, and it is deliberately
tolerant: another worker is editing that directory under 0.4.0 right now, so a missing or renamed file
there reports as "not checked" rather than failing this round's checklist. Finding the override in a
shipping file would be the real failure, and that is what it tests.

### The check is not vacuous — tampering probe

A two-line comment was appended to `_pinned-5a4f845/verify.ts` and the checklist re-run:

```
check 9: 12 pinned files, provenance FAIL; override touches [constants.ts, field-roles.ts, pipeline.ts]
1 FAILURES
  check 9: verify.ts is not 5a4f845 + the two documented changes
```

The file was restored and the checklist returned to `ALL CHECKS PASS`. A provenance check that cannot
fail is not a provenance check, so this is recorded rather than claimed.

## 10 — The override changed only the polarity decision

Run over all **19** scanned candidates (5 tie-band + the 14 nearest above-band), from the `P3_DIAG`
decision chains rather than from the palettes alone.

**Reproduction leg — 19/19.** Forcing the polarity the shipped rule already chose
(`P3_FORCE_BG_POLARITY=dark` where the published background was the darker end, `=light` where it was
the lighter) reproduces the published palette **byte-for-byte**.

**Swap leg — 19/19.** Against the published run, the opposite-polarity run has:

- the **same `{e₁, e₂}` pixel-index pair** (identical indices, two distinct pixels),
- the **same field median**, the **same ends step**, the **same field-set rule**,
- `farIsBackground` **inverted**,
- `background` and `surface` hexes **exactly exchanged**,
- `foreground` and `accent` **byte-identical**.

> **Polarity-only: CONFIRMED.** The override moves which end is called background. Nothing upstream of
> the decision moves, and everything downstream is re-derived by the normal cascade (the ramp reverses,
> check 3; the contract re-validates, check 6).

## 11 — Nothing served carries a mechanism hint

- All six `itemId`s match `^item-\d{3}$` — the neutral form rounds 1 and 3 used. Nothing in an id says
  which side is which, or that the round is about polarity.
- Each pushed side carries exactly `{variantId, palette, fingerprint}`; `blindSidePayload` serves none
  of the first or third. The check asserts that key set so a future change to the push shape cannot
  smuggle a label through.
- The served fields (`itemId`, `imagePath`, `collection`, `artworkId`, and the two palettes) are
  grepped for `/polarity|invert|dark|light|tie|prevalence|background-end|forced/i`. **No match.**

The nine orchestrator-only keys — including `publishedPolarity`, which names which side is which —
live on the item line outside the fields `parseItem` reads. `ROUND.md` staging note 3 tells the
installer they may be stripped.

---

## Files

| path | what it is |
| --- | --- |
| `items.jsonl` | **the push shape**, 6 lines. One transform owed: `imagePath` → absolute |
| `ROUND.md` | the question, the pre-registered decision rule and branches, the numbers, the override |
| `VERIFY.md` | this file |
| `build.ts` | selection + staging. Reads `work/*.jsonl`, writes `items.jsonl` and `render-preview.json` |
| `scan.ts` | runs the **pinned** candidate over a path list, emitting the polarity chain + palette |
| `verify.ts` | the eleven checks above |
| `render-preview.json` | **local** preview of both sides. NOT a server input — do not copy it anywhere |
| `_pinned-5a4f845/` | `git show 5a4f845:…/src/*.ts` + the two documented changes. All palettes came from here |
| `work/published-220.jsonl` | the full 220-cover sweep, side 0. The selection pool and check 8's input |
| `work/forced-light.jsonl`, `work/forced-dark.jsonl` | the 19 candidates under each forced polarity. Check 10's input |
| `work/diag-published/` | the 220 `P3_DIAG` decision chains for the published side |
| `work/verify-console.txt` | the recorded run above |
| `work/candidates-sheet.jpg`, `work/six-sheet.jpg` | contact sheets, built **after** selection, for describing the covers only |
| `work/sheet.mjs`, `work/table.ts`, `work/contrast.ts` | the scratch scripts that produced the sheets and `ROUND.md`'s tables |

Reproduce the whole round from scratch:

```
# side 0 — the published polarity, over the 220-cover coverage set
P3_DIAG=$PWD/work/diag-published node --experimental-strip-types scan.ts work/paths-220.txt work/published-220.jsonl
# the two forced sides, over the candidate set
P3_FORCE_BG_POLARITY=light P3_DIAG=$PWD/work/diag-light node --experimental-strip-types scan.ts work/paths-candidates.txt work/forced-light.jsonl
P3_FORCE_BG_POLARITY=dark  P3_DIAG=$PWD/work/diag-dark  node --experimental-strip-types scan.ts work/paths-candidates.txt work/forced-dark.jsonl
node --experimental-strip-types build.ts
node --experimental-strip-types verify.ts
```

(The recorded run sharded `scan.ts` across six processes for wall-clock; the script is deterministic
and a single-process run over the same path list produces the same rows.)

## Not verified here, stated instead

- **`fundedBy` has no verdict id.** Round 1's `VERDICTS.md` recorded item-14's grade and branch but not
  the verdict id, so this round cannot emit one. The installer must resolve it from the warehouse
  (batch `phase2-cal-003`, `item-14`) before pushing. `ROUND.md` staging note 4.
- **The batch id is not set.** The installer's to choose.
- **The blinded A/B mapping is not checked**, because it does not exist yet: `blindItem` builds it from
  the per-batch salt at push time. What is checked is that the pushed payload carries nothing that
  would separate the sides if the mapping were guessed (check 11).
- **Nothing was committed or pushed.** No `git add`, no `git commit`, no server started. The worktree's
  `src/` was read at `5a4f845` through `git show` only.
