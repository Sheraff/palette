# Round 5 — staging verification

Every check below was **run**, in this worktree, against what is on disk. Nothing here is a claim
about what the code should do.

Candidate `p3-fields-0.4.1`; fingerprint commit `9504846`; worktree HEAD `9504846`.

```
$ node --experimental-strip-types research/v3/prototypes/p3-fields/review-rounds/round-5-calibration/verify.ts
```

## Round-level

```
determinism  PASS  220/220 rows compared against the --no-cache P3_DIAG re-run  divergences=0
blinding     PASS  21 forbidden strings checked
```

## Per item

| itemId (stem) | verdict | path | exact-pixel | gradient endpoints | collapse | side-car | contract | verbatim | provenance | stem-id |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ab67616d0000b27300062339a473711468f14643` | **PASS** | yes | yes (4/4) | n/a | yes | yes | pass | yes | yes | yes |
| `ab67616d0000b2730005d8403971249d1ef0786b` | **PASS** | yes | yes (6/6) | yes | yes | yes | pass | yes | yes | yes |
| `ab67616d0000b27300115cade5b18898a33dac6a` | **PASS** | yes | yes (4/4) | n/a | yes | yes | pass | yes | yes | yes |
| `ab67616d0000b2730010403dcc48ac67e0a1b97f` | **PASS** | yes | yes (4/4) | n/a | yes | yes | pass | yes | yes | yes |
| `ab67616d00001e02000c4ff9e01aba5eae6cbec4` | **PASS** | yes | yes (6/6) | yes | yes | yes | pass | yes | yes | yes |
| `05687107a2a9019ee68c3b7f70ff47b6` | **PASS** | yes | yes (4/4) | n/a | yes | yes | pass | yes | yes | yes |
| `ddd8a0e7961edcf8e95b771ae0d9b8c5` | **PASS** | yes | yes (7/7) | yes | yes | yes | pass | yes | yes | yes |
| `ab67616d0000b2730011a326091e7dd7df58b175` | **PASS** | yes | yes (6/6) | yes | yes | yes | pass | yes | yes | yes |
| `ab67616d0000b27300014778c5ef2a0dea2461a4` | **PASS** | yes | yes (4/4) | n/a | yes | yes | pass | yes | yes | yes |

**9 items · ALL PASS.** Exit code 0. Console kept verbatim in `verify-console.txt`.

## The exact-pixel check, spelled out

`exact-pixel` counts **every published colour**, not the four roles. 45 hexes total across the nine
items — 36 role colours plus 9 gradient stops, guide stops included. Every one of them appears in its
own image's actual pixel set, decoded independently of the pipeline (`sharp`, sRGB, **no size ever
passed** so no resample, alpha < 255 excluded).

| itemId (stem) | background | surface | foreground | accent | gradient stops | hexes checked |
| --- | --- | --- | --- | --- | --- | --- |
| `ab67616d0000b27300062339a473711468f14643` | `#d3d5c8` | `#465abb` | `#100f14` | `#cf6529` | none | 4 |
| `ab67616d0000b2730005d8403971249d1ef0786b` | `#4b4b4b` | `#7a7a7a` | `#f7fef6` | `#421b50` | `#4b4b4b`@0 → `#7a7a7a`@1 | 6 |
| `ab67616d0000b27300115cade5b18898a33dac6a` | `#cc001e` | `#ecb491` | `#e96849` | `#ee2d42` | none | 4 |
| `ab67616d0000b2730010403dcc48ac67e0a1b97f` | `#6bb8fe` | `#060412` | `#ffffff` | `#b8c504` | none | 4 |
| `ab67616d00001e02000c4ff9e01aba5eae6cbec4` | `#deb355` | `#fcdf99` | `#1f0302` | `#97191a` | `#deb355`@0 → `#fcdf99`@1 | 6 |
| `05687107a2a9019ee68c3b7f70ff47b6` | `#e2ca12` | `#520d06` | `#e0580a` | `#ffa720` | none | 4 |
| `ddd8a0e7961edcf8e95b771ae0d9b8c5` | `#fefcd6` | `#764638` | `#000000` | `#64c7c2` | `#fefcd6`@0 → **`#f2b7d3`@0.3125** → `#764638`@1 | 7 |
| `ab67616d0000b2730011a326091e7dd7df58b175` | `#0b0800` | `#26211d` | `#2aa5e9` | `#3d3936` | `#0b0800`@0 → `#26211d`@1 | 6 |
| `ab67616d0000b27300014778c5ef2a0dea2461a4` | `#fcfcfc` | `#141414` | `#a2a2a2` | `#c26b0a` | none | 4 |

`#f2b7d3` is the round's only **inserted guide stop** and is checked exactly like an endpoint: the
mechanism's central claim is that every published colour is an exact pixel of the artwork, and a guide
stop is a published colour.

**Endpoints.** Four items publish a gradient; on all four the first stop equals `background` and the
last equals `surface`, checked in both directions.

**Collapse flags.** `surfaceCollapsed` iff surface == background and `accentCollapsed` iff accent ==
foreground, each checked in both directions — a flag without the equality fails as loudly as an
equality without the flag. **No item in this round collapses either role**, which is deliberate: an
accent collapse would be an item with no accent to grade, and this round's question is about accents.

## What each check does

1. **Path resolves in the MAIN checkout.** `items.jsonl` carries repo-relative paths; the round was
   staged from a worktree whose corpus shards and `music-artworks/` are symlinks. The checked path is
   `/Users/Flo/GitHub/palette/<imagePath>`, never the worktree's. 9/9 resolve.
2. **Exact pixel.** As above.
3. **Gradient endpoints are the field roles.**
4. **Collapse flags, both directions.**
5. **Side-car renders its item.** Four hexes and the full gradient stop list compared against the item.
   Also: no side-car key without an item, no duplicate itemId, no duplicate image, and 4 ≤ items ≤ 10.
6. **Contract + verbatim copy.** `validatePalette` (`src/contract/invariants.ts`) runs against the
   *whole* `Palette` from the source run row — contrast floors and metadata included, which the flat
   item shape does not carry — and every item field is compared against that row. **9/9 valid, 0
   violations.** This is what makes both "no contract-failing cover is in the round" and "nothing was
   recomputed at staging time" checked statements rather than selection notes.
7. **Provenance.** `collection` recomputed with `deriveCollection`'s own rule from
   `src/review-server/batch.ts` (`music-artworks` ×2, `sharded-corpus` ×7), `variantId` and all four
   fingerprint fields compared literally.
8. **`itemId` IS the artwork content stem.** `basename(imagePath)` with the extension stripped, and
   nothing else — the round-4 staging convention (`../QUEUE.md`). A round that emitted a run ordinal
   would pass every other check here, so this is its own check. 9/9.
9. **Determinism of the staging run.** See below.
10. **The side-car is blinded.** See below.

## Provenance of the palettes

**One source run.**

| | run | runId | codeVersion | rows |
| --- | --- | --- | --- | --- |
| all nine | `run-coverage-220-0.4.1.jsonl` (this round) | `p3-fields-0.4.1-coverage-set-1-220-20260811T064500590Z` | `715a729dfa69b733…` | 220 ok · 0 failed |

Set `coverage-set-1-220`, setHash `9cf1eec6…`, 220 images, node v25.8.1.

```
$ git rev-parse HEAD
9504846deb58feda6d34ee514f29cb9d9686c1de
$ git status --short research/v3/prototypes/p3-fields/src research/v3/src
(empty)
```

`src/` is clean in the working tree at the fingerprinted commit, and the run's `codeVersion`
(`715a729dfa69b733…`) is the value the committed tree produces. That value also appears in
`../../measurements/run-adjudicated-197-0.4.1.jsonl` — a **committed** run this round did not produce
— so `dirty: false` is corroborated by an artefact that predates this staging rather than only by
this worker's own runs.

## Determinism — measured over all 220 rows, not the nine

The nine palettes did not exist before this round, so they carry no cross-check for free. Two were
constructed, and the first is the strong one:

1. **Full-set re-execution, diagnostics ON, cache OFF.**
   `run-coverage-220-0.4.1-diag.jsonl`, runId `…20260811T064831547Z`, same `codeVersion`, `--no-cache`
   (0 cache hits · 220 computed), `P3_DIAG` writing the 220-file chain in `diag-coverage-0.4.1/`.
   `verify.ts` check 9 compares **roles, gradient and collapse of all 220 rows** between the two runs:
   **220/220 identical, 0 divergences.** That is simultaneously `run.ts`'s "two runs of the same
   candidate over the same set produce byte-identical rows" and `diagnostics.ts`'s "the published
   palette is a function of the image alone, with or without `P3_DIAG`", both checked rather than
   cited, and checked on the whole set rather than on the sample.

   `--no-cache` matters: a cache hit returns a stored palette without running the pipeline, so it would
   produce neither a diagnostics record nor a real re-execution. The shipping run took 19 cache hits;
   the re-run took none, so the comparison is genuinely against fresh computation.

2. **Independent cross-check by a different worker's run.** `../../measurements/run-coverage-220-0.4.1.jsonl`
   was produced by **another worker in this shared worktree** (runId `…20260811T064438718Z`, started
   22 s before this round's and not by this worker) over the same set at the same `codeVersion`.
   Compared row by row against the shipping run: **220/220 palette-identical, 0 divergences.** Three
   independent executions therefore agree on all 220 covers.

   This round nonetheless ships from **its own copy** in this directory rather than reading that file.
   It is another worker's artefact, it is untracked, and a round whose palettes are read from a path a
   concurrent worker may rewrite is a round that cannot be re-verified later. The copy here is the
   provenance; the agreement above is the evidence.

   The *other* cross-check round 2 had is unavailable and is stated rather than skipped: none of the
   nine covers appears in `run-adjudicated-197-0.4.1.jsonl` (checked by filename; overlap 0/9), so
   there is no run over a **different set** that touches these covers.

**Corroboration of the run's own contract numbers**, from the same artefacts — PASS **200/220**, accent
collapses **29**, surface collapses **24**, gradients published **86**, escapes **0**. These reproduce the numbers
`../../measurements/substrate/ADOPTION_RULING.md` §2 and `../../src/verify.ts` record for the adopted
default, on a run neither of them was written from.

## Blinding

- **Side-car keys**, exhaustively: `roles` (`role`, `hex`, `name`, `collapsed`), `gradient` (`stops` →
  `hex`, `name`, `publishedPosition`, `displayPosition`), `fieldCss`. Item keys are exactly the nine
  content stems. Nothing else.
- **`verify.ts` check 10** greps the serialized side-car for 21 forbidden strings: `p3`, `fields`,
  `arm`, `prototype`, `candidate`, `variant`, `departure`, `coherence`, `coherent`, `eligibility`,
  `eligible`, `cascade`, `swap`, `ordering`, `regime`, `round`, `calibration` on **word boundaries**,
  plus `0.4.1`, `0.4.0`, `0.3.0`, `9504846` as literals. **Zero hits.**

  The word-boundary form is load-bearing and was found by the check failing: the naive substring form
  matches `round` inside `background` and `foreground`, which are the contract's own role names and
  have to be there. A blinding check that cries wolf on the schema is one somebody switches off, so the
  boundary is part of the check rather than a loosening of it. `fieldCss` (which round 2 recorded as
  its only hit) does not match `\bfields\b`.
- **No item id, class or ordering says which class an item is in.** Ids are content stems, which are
  properties of the artwork and carry nothing about this round. Row order interleaves the three classes
  A N F A N A F N A.
- **`selectionClass` never reaches the warehouse.** `parseCalibrationBatch`
  (`src/review-server/batch.ts`) builds each item from an allowlist — `itemId`, `imagePath`,
  `collection`, `artworkId`, `variantId`, `palette`, `fingerprint` — and drops every other key. Checked
  by reading the parser, not assumed. It is `items.jsonl` bookkeeping only.

### One thing the installer must confirm, not this worker

`variantId` **does** travel in the push payload and **is** parsed and stored — its value is the true
name `p3-fields-0.4.1`. This is rounds 1–4's shape unchanged, and blinding is delivered by the side-car
and the calibration UI rather than by the payload. Before pushing, confirm the calibration view does
not render `variantId` anywhere the reviewer can see it. This worker cannot check a running server.

## Files staged

| file | sha256 | served? |
| --- | --- | --- |
| `items.jsonl` | `6602ed69e3a2ad4777ec…` | yes (after the flat→nested transform) |
| `sidecar.data.json` | `369aee8fc521f7f4fa34…` | yes |
| `run-coverage-220-0.4.1.jsonl` | `3c352c398e1d13836af3…` | no — provenance, the source of all nine palettes |
| `run-coverage-220-0.4.1-diag.jsonl` | `e537d683d934c38a3043…` | no — the determinism re-run |
| `accent-support-0.4.1.json` | `56915950ff64623b7e97…` | no — the selection input (support / fill / route per cover) |
| `build.ts` | `a594fdaf515a8a6567ec…` | no — staging machinery |
| `verify.ts` | `2d0d24256c4300f2d9fb…` | no — staging machinery |
| `accent-support.ts` | `00b15bf818b7a332e08c…` | no — the selection probe |
| `diag-coverage-0.4.1/` (220 files) | — | no — the `P3_DIAG` chain the item table's regimes and edge fractions are read from |
| `console-*.txt`, `verify-console.txt` | — | no — run consoles |
| `ROUND.md` | — | **no. Carries the class table and the outcome branches; must never be served.** |

## Push-time transform, restated

`items.jsonl` is flat; `parseCalibrationBatch` wants the six palette fields under `item.palette` and
wants `imagePath` **absolute** (`/Users/Flo/GitHub/palette/` + the recorded path). `selectionClass` is
dropped. One mechanical transform, noted here so it is not discovered by a validation error.

Two fields the installer must not improvise, both from `ROUND.md`'s kind section: **`purpose` is
`calibration`**, honoured verbatim (rounds 3 and 4 both went out as `"mechanism"` against their own
ROUND.md), and **`fundedBy` stays linkage-free** — no batch id, no item id, no prior-round reference
while the batch is open. Motivating verdict ids are recorded post-release by main.
