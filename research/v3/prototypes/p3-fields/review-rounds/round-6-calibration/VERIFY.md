# Round 6 — staging verification

`verify.ts`, run at staging time against the two reviewer-facing files and the four run files this
round produced. Console output verbatim in `verify-console.txt`; exit code **0**.

    node --experimental-strip-types research/v3/prototypes/p3-fields/review-rounds/round-6-calibration/verify.ts

    determinism  PASS  coverage: 220/220 rows compared against the --no-cache P3_DIAG re-run  divergences=0
    determinism  PASS  demo: 20/20 rows compared against the --no-cache P3_DIAG re-run  divergences=0
    blinding     PASS  27 forbidden strings checked
    ab67616d00001e020010ac96d501c4170f39c4f0  PASS  path=yes  exact-pixel=yes (4/4)  gradient-endpoints=n/a  collapse=yes  sidecar=yes  contract=pass  verbatim=yes  provenance=yes  stem-id=yes
    ab67616d0000b2730011a326091e7dd7df58b175  PASS  path=yes  exact-pixel=yes (6/6)  gradient-endpoints=yes  collapse=yes  sidecar=yes  contract=pass  verbatim=yes  provenance=yes  stem-id=yes
    4e6dee3a672e62f84d6fab9d90a2af26          PASS  path=yes  exact-pixel=yes (4/4)  gradient-endpoints=n/a  collapse=yes  sidecar=yes  contract=pass  verbatim=yes  provenance=yes  stem-id=yes
    ab67616d0000b2730005d8403971249d1ef0786b  PASS  path=yes  exact-pixel=yes (6/6)  gradient-endpoints=yes  collapse=yes  sidecar=yes  contract=pass  verbatim=yes  provenance=yes  stem-id=yes
    ab67616d0000b2730000cb591a0d52d8b88692d9  PASS  path=yes  exact-pixel=yes (4/4)  gradient-endpoints=n/a  collapse=yes  sidecar=yes  contract=pass  verbatim=yes  provenance=yes  stem-id=yes
    d76d845e33b98c986bb8b1297e49487b          PASS  path=yes  exact-pixel=yes (6/6)  gradient-endpoints=yes  collapse=yes  sidecar=yes  contract=pass  verbatim=yes  provenance=yes  stem-id=yes
    ab67616d0000b2730011e7b5c1023c70f7a3d767  PASS  path=yes  exact-pixel=yes (4/4)  gradient-endpoints=n/a  collapse=yes  sidecar=yes  contract=pass  verbatim=yes  provenance=yes  stem-id=yes
    ab67616d00001e020000269ead63cf2376a6b67d  PASS  path=yes  exact-pixel=yes (4/4)  gradient-endpoints=n/a  collapse=yes  sidecar=yes  contract=pass  verbatim=yes  provenance=yes  stem-id=yes

    8 items · ALL PASS

## What each line means

**Exact pixel — 8/8 items, 38/38 hexes.** Every published hex is decoded independently of the pipeline
(`sharp`, sRGB, native resolution, no resample, alpha < 255 excluded) and must appear among the image's
actual pixels. 38 = four roles on all eight items (32) plus the two gradient stops on each of rows 1, 3
and 5 (6). Rows 0, 2, 4, 6 and 7 publish no gradient, so `gradient-endpoints` is `n/a` on those and the
check does not silently pass on absence.

**Gradient endpoints — 3/3 applicable.** First stop == background, last stop == surface on every row
that publishes a ramp. No row in this round exceeds two stops, so there are no guide stops to check and
no stop-spacing exposure.

**Collapse flags — 8/8, checked in both directions.** `surfaceCollapsed` iff surface == background and
`accentCollapsed` iff accent == foreground, asserted as an equivalence rather than an
implication, so a flag set on a non-collapsed palette fails as loudly as the reverse. **All eight items
are `false` / `false`**: no collapsed field end and no collapsed accent anywhere in the round. The one
draw that would have carried a collapsed surface (`…000ad40f7a92f3abf74f4683`, min-ramp 4.65) was
dropped at selection and the drop is recorded in `ROUND.md`.

**`validatePalette` — 8/8 pass**, re-derived here against the *whole* `Palette` of the run row each item
was built from, not taken from the run's own scorecard. The coverage run's scorecard is 200 pass /
20 fail over 220; none of the 20 is in this round, and two members of the conflict cohort were excluded
on exactly this check (`ROUND.md`, Exclusions).

**Verbatim copy — 8/8.** Every item's four roles, gradient stops and positions, and both collapse flags
are compared field by field against the run row. This is what makes "nothing was recomputed at staging
time" a checked statement rather than a claim about `build.ts`.

**Provenance — 8/8.** `collection` is re-derived by `deriveCollection`'s own rule from the repo-relative
path (six `sharded-corpus`, two `music-artworks`); `variantId` is `p3-fields-0.4.2`; the fingerprint is
`{algorithmVersion: "p3-fields-0.4.2", preprocessingVersion: "sharp-0.33.5/srgb/no-resample/alpha-
excluded", gitCommit: "b9c41a4", dirty: false}` on every row, and the run rows' own
`metadata.algorithmVersion` / `metadata.preprocessingVersion` are checked to agree with it.

`dirty: false` is checkable rather than asserted: `git status --short` over
`research/v3/prototypes/p3-fields/src` and `research/v3/src` is empty at `b9c41a4`, and both run headers
carry `codeVersion` `a5f17f31abd94a3240f2cf1042ca183f3926a4d853976ed0dcb38e2c2332748a` — the value the
committed tree produces, recorded independently by two runs over two different sets.

**Stem ids — 8/8.** `itemId` equals `basename(imagePath)` with the extension removed and nothing else.
No run ordinal appears anywhere in `items.jsonl`, so the installer never has to rewrite an id.

**Determinism — 240/240 rows, 0 divergences.** Both shipping runs have an independent second execution
over the same set with `--no-cache` and `P3_DIAG` **on**, and every row of both is palette-identical
(roles, gradient, collapse) between the pair. That is `diagnostics.ts`'s "diagnostics do not change the
answer" and `run.ts`'s "two runs of the same candidate over the same set produce byte-identical rows",
checked over the whole sets rather than over the eight items.

**Blinding — 27 forbidden strings, 0 hits.** The side-car is the one file that reaches the reviewer. The
mechanism vocabulary is matched on **word boundaries** (the naive substring form false-positives on
`round` inside `background`/`foreground`, which are the contract's own role names); version strings and
commit hashes are matched as plain substrings. This round adds `legibility`, `identity`, `conflict` and
`ramp` to round 5's list — the round's own subject matter — plus the literals `0.4.2` and `b9c41a4`.

## Endpoints, paths and the two runs

- Every `imagePath` is **repo-relative** and was verified to resolve at
  `/Users/Flo/GitHub/palette/<imagePath>` — the MAIN checkout, which is the path the installer and the
  review server will use. The round was staged from `.worktrees/p3-fields`, whose corpus shards and
  `music-artworks/` are symlinks back to main, so the worktree prefix is stripped exactly once and the
  check is against main rather than against the worktree it was produced in.
- Seven items ship from `run-coverage-220-0.4.2.jsonl`. **One ships from `run-demo-20-0.4.2.jsonl`**:
  cover 19 (`…0000269ead63cf2376a6b67d`) is not a member of `coverage-set-1-220` — verified against the
  set file — and its palette therefore cannot come from the coverage run. Both runs are the same
  candidate at the same commit with the same `codeVersion`; `verify.ts` routes each item to its own run
  via the item's `sourceRun` field and checks determinism for both.
- Set identity is read off the headers, not assumed: `coverage-set-1-220`, `setHash`
  `9cf1eec630b7cc9ee252e446741c2987b8468a62c00dc300cf60e2ee4486efbc` — byte-identical to the set hash
  round 5 recorded, so "the same 220 covers" is a checked statement across the two rounds.

## Not covered by this file

- **Push-shape fields.** `items.jsonl` carries two orchestrator-only fields, `selectionClass` and
  `sourceRun`, which are not part of the push shape (round 5 shipped `selectionClass` on the same
  basis). The installer strips them; nothing here asserts that it does.
- **`purpose` and `fundedBy`.** Declared in `ROUND.md` (`purpose: calibration`, `fundedBy` linkage-free)
  and honoured installer-side. This file verifies the item payload, not the batch envelope.
- **The reviewer-facing render.** The side-car is checked to carry the same hexes as the item and to
  leak nothing; whether the mock renders it as intended is a live-verification step for the round
  handoff, not a staging check.
