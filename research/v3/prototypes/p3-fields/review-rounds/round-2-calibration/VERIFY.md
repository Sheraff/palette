# Round 2 — staging verification

Every check below was **run**, in this worktree, against what is on disk. Nothing here is a claim
about what the code should do.

Candidate `p3-fields-0.3.0`; fingerprint commit `bead404`; worktree HEAD `2ccb19b`.

```
$ node --experimental-strip-types research/v3/prototypes/p3-fields/review-rounds/round-2-calibration/verify.ts
```

## Per item

| itemId | verdict | path | exact-pixel | gradient endpoints | collapse | side-car | contract | verbatim | provenance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r2-item-0` | **PASS** | yes | yes (8/8) | yes | yes | yes | pass | yes | yes |
| `r2-item-1` | **PASS** | yes | yes (6/6) | yes | yes | yes | pass | yes | yes |
| `r2-item-2` | **PASS** | yes | yes (4/4) | n/a | yes | yes | pass | yes | yes |
| `r2-item-3` | **PASS** | yes | yes (4/4) | n/a | yes | yes | pass | yes | yes |
| `r2-item-4` | **PASS** | yes | yes (6/6) | yes | yes | yes | pass | yes | yes |
| `r2-item-5` | **PASS** | yes | yes (4/4) | n/a | yes | yes | pass | yes | yes |
| `r2-item-6` | **PASS** | yes | yes (8/8) | yes | yes | yes | pass | yes | yes |
| `r2-item-7` | **PASS** | yes | yes (4/4) | n/a | yes | yes | pass | yes | yes |
| `r2-item-8` | **PASS** | yes | yes (4/4) | n/a | yes | yes | pass | yes | yes |

**9 items · ALL PASS.** Exit code 0.

The `exact-pixel` counts are *every published colour*, not the four roles: `8/8` is four roles plus
four gradient stops, and the two 4-stop gradients (`r2-item-0`, `r2-item-6`) carry **inserted guide
stops** (`#4e273c`, `#1f3b12`; `#c00029`, `#77705e`) which are checked exactly like the endpoints.
The mechanism's central claim is that every published colour is an exact pixel of the artwork, and a
guide stop is a published colour.

## What each check does

1. **Path resolves in the MAIN checkout.** `items.jsonl` carries repo-relative paths; the round was
   staged from a worktree whose corpus shards and `music-artworks/` are symlinks. The checked path is
   `/Users/Flo/GitHub/palette/<imagePath>`, never the worktree's.
2. **Exact pixel.** Decoded independently of the pipeline — `sharp`, sRGB, no resample (no size is
   ever passed), alpha < 255 excluded — and every published hex must appear in the image's actual
   pixel set.
3. **Gradient endpoints are the field roles.** First stop == background, last stop == surface.
4. **Collapse flags, both directions.** `surfaceCollapsed` iff surface == background,
   `accentCollapsed` iff accent == foreground; a flag without the equality fails as loudly as an
   equality without the flag. No item in this round collapses either role.
5. **Side-car renders its item.** Four hexes and the full gradient stop list compared against the
   item. Also: no side-car key without an item, no duplicate itemId, no duplicate image.
6. **Contract + verbatim copy.** `validatePalette` (`src/contract/invariants.ts`) runs against the
   *whole* `Palette` from the source run row — contrast floors and metadata included, which the flat
   item shape does not carry — and every item field is compared against that row. **9/9 valid, 0
   violations.** This is what makes both "no contract-failing cover is in the round" and "nothing was
   recomputed at staging time" checked statements rather than selection notes.
7. **Provenance.** `collection` recomputed with `deriveCollection`'s own rule from
   `src/review-server/batch.ts` (`music-artworks` ×1, `sharded-corpus` ×8), `variantId` and all four
   fingerprint fields compared literally.

## Provenance of the palettes

**Two source runs, one code version.**

| | run | codeVersion | rows |
| --- | --- | --- | --- |
| four re-grades | `run-regrade-4-0.3.0.jsonl` (this round) | `1cc28c1efb1f38de…` | 4 ok · 0 failed |
| five fresh | `../../measurements/run-coverage-220-0.3.0.jsonl` (W9) | `1cc28c1efb1f38de…` | 220 ok · 0 failed |

The two `codeVersion` values are identical, and identical to the one `BASELINE-0.3.0.md` records for
the committed tree at `bead404`. That is the evidence for `dirty: false` in the fingerprint — not an
assertion.

```
$ git rev-parse HEAD
2ccb19b0d72f2c7d2c8f6f048e0cb61ff3154733
$ git diff --stat bead404 2ccb19b -- research/v3/prototypes/p3-fields/src/
(empty)
$ git status --short research/v3/prototypes/p3-fields/src/
(empty)
```

`src/` is byte-identical between the fingerprinted commit `bead404` and the worktree HEAD `2ccb19b`
at which the runs executed, and is clean in the working tree. The palettes are a statement about
`bead404`.

Re-grade run: `runId p3-fields-0.3.0-regrade-4-20260804T224145168Z`, set `regrade-4` (setHash
`bb3fd878…`), 4 images, node v25.8.1, `--no-cache`, `P3_DIAG` writing to `_diag-regrade/`.
`--no-cache` matters: a cache hit returns a stored palette without running the pipeline, so it would
produce neither a diagnostics record nor a real timing.

## Determinism of the re-grade run — three independent checks, all matched

The four re-grade palettes did not exist before this round (round 1's run is `p3-fields-0.2.0`), so
they carry no cross-check for free. Three were constructed:

1. **Diagnostics no-op.** A second `--no-cache` run of the same set with `P3_DIAG` **unset**
   produced palettes byte-identical to the staged run's, for all four covers. (The prototype's own
   `ATTRIBUTION.md` records the same property over `demo-20`; this repeats it on this round's set.)
2. **Independent-run cross-check.** `item-19`'s cover
   (`00/ab67616d00001e020000269ead63cf2376a6b67d.jpg`) is also row-present in W9's
   `run-adjudicated-197-0.3.0.jsonl`, a run this round did not produce. Both runs publish
   `#fdd001` / `#fe0000` / `#010101` / `#fbfcff`, gradient `null`, both collapse flags false —
   identical roles **and** gradient. The other three re-grade covers are in neither the coverage set
   nor the adjudicated set (checked by filename), so this is the only overlap available and it is
   consistent.
3. **Set-level disjointness.** `coverage-set-1` contains **zero** of the four re-grade covers and
   zero `demo-20` covers, so no fresh item is a `demo-20` cover under another name. Checked by
   filename against `measurements/coverage-set-1-220.txt`.

## Blinding

- **Side-car keys**, exhaustively: `roles` (`role`, `hex`, `name`, `collapsed`), `gradient`
  (`stops` → `hex`, `publishedPosition`, `displayPosition`), `fieldCss`. Item keys are exactly
  `r2-item-0` … `r2-item-8`. Nothing else.
- A case-insensitive grep of `sidecar.data.json` for `p3`, `prototype`, `arm-d`, `rank`, `ink`,
  `regime`, `swap`, `regrade`, `coverage`, `0.3.0` matches **nine times, all of them the substring
  `field` inside the UI key `fieldCss`** — the same key round 1 served. No other hit.
- **No item id, class or ordering says which four covers were graded before.** Ids are
  `r2-item-N` by row position; re-grades sit at 1/3/5/7 among fresh covers at 0/2/4/6/8.
- **`selectionClass` (which does contain the string `regrade`) never reaches the warehouse.**
  `parseCalibrationBatch` builds each item from an allowlist — `itemId`, `imagePath`, `collection`,
  `artworkId`, `variantId`, `palette`, `fingerprint` — and drops every other key. Checked by reading
  the parser, not assumed. It is `items.jsonl` bookkeeping only.

### One thing the installer must confirm, not this worker

`variantId` **does** travel in the push payload and **is** parsed and stored — its value is the true
name `p3-fields-0.3.0`. This is round 1's shape unchanged (`p3-fields-0.2.0` travelled the same way
and the round was blind in practice), and blinding is delivered by the side-car and the calibration
UI rather than by the payload. Before pushing, confirm the calibration view does not render
`variantId` anywhere the reviewer can see it. This worker cannot check a running server.

## Files staged

| file | sha256 | served? |
| --- | --- | --- |
| `items.jsonl` | `99746b279d6d0e7f…` | yes (after the flat→nested transform) |
| `sidecar.data.json` | `a23b58e99cbafd7e…` | yes |
| `run-regrade-4-0.3.0.jsonl` | `b339bd8edb0a0020…` | no — provenance |
| `regrade-4.txt` | `74db237ba573d68c…` | no — the re-grade run's set file |
| `ROUND.md` | — | **no. Carries the round-1 grades; must never be served.** |
| `build.ts`, `verify.ts`, `shortlist-sheet.mjs`, `shortlist-sheet.jpg`, `_diag-regrade/` | — | no — staging machinery and selection working artefacts |

## Push-time transform, restated

`items.jsonl` is flat; `parseCalibrationBatch` wants the six palette fields under `item.palette` and
wants `imagePath` **absolute** (`/Users/Flo/GitHub/palette/` + the recorded path). `selectionClass` is
dropped. One mechanical transform, noted here so it is not discovered by a validation error.
