# Round 7 — staging verification

`verify.ts`, run at staging time against the two reviewer-facing files and the four run files this
round produced. Console output verbatim in `verify-console.txt`; exit code **0**.

    node --experimental-strip-types research/v3/prototypes/p3-fields/review-rounds/round-7-calibration/verify.ts

    determinism  PASS  coverage: 220/220 rows compared against the --no-cache P3_DIAG re-run  divergences=0
    determinism  PASS  demo: 20/20 rows compared against the --no-cache P3_DIAG re-run  divergences=0
    source-identity PASS  HEAD=a51b1d29  fingerprint=affe3965  uncommitted-in-src=0  src-files-changed-since-fingerprint=0
    blinding     PASS  40 forbidden strings checked
    ab67616d0000b2730011a326091e7dd7df58b175  PASS  path=yes  exact-pixel=yes (6/6)  gradient-endpoints=yes  collapse=yes  sidecar=yes  contract=pass  verbatim=yes  provenance=yes  stem-id=yes
    ab67616d00001e020003748f0b2cb5347f9c0779  PASS  path=yes  exact-pixel=yes (4/4)  gradient-endpoints=n/a  collapse=yes  sidecar=yes  contract=pass  verbatim=yes  provenance=yes  stem-id=yes
    ab67616d00001e020010ac96d501c4170f39c4f0  PASS  path=yes  exact-pixel=yes (4/4)  gradient-endpoints=n/a  collapse=yes  sidecar=yes  contract=pass  verbatim=yes  provenance=yes  stem-id=yes
    ab67616d0000b2730011e7b5c1023c70f7a3d767  PASS  path=yes  exact-pixel=yes (4/4)  gradient-endpoints=n/a  collapse=yes  sidecar=yes  contract=pass  verbatim=yes  provenance=yes  stem-id=yes
    4e6dee3a672e62f84d6fab9d90a2af26          PASS  path=yes  exact-pixel=yes (4/4)  gradient-endpoints=n/a  collapse=yes  sidecar=yes  contract=pass  verbatim=yes  provenance=yes  stem-id=yes
    ab67616d0000b273000146db0ad7d43bebdb3152  PASS  path=yes  exact-pixel=yes (4/4)  gradient-endpoints=n/a  collapse=yes  sidecar=yes  contract=pass  verbatim=yes  provenance=yes  stem-id=yes
    ab67616d00001e020000269ead63cf2376a6b67d  PASS  path=yes  exact-pixel=yes (4/4)  gradient-endpoints=n/a  collapse=yes  sidecar=yes  contract=pass  verbatim=yes  provenance=yes  stem-id=yes

    7 items · ALL PASS

## What each line means

**Exact pixel — 7/7 items, 30/30 hexes.** Every published hex is decoded independently of the pipeline
(`sharp`, sRGB, native resolution, no resample, alpha < 255 excluded) and must appear among the image's
actual pixels. 30 = four roles on all seven items (28) plus the two gradient stops on row 0 (2). Rows
1–6 publish no gradient, so `gradient-endpoints` is `n/a` on those and the check does not silently pass
on absence. This is the contract's central rule and it is the one check that cannot be satisfied by a
colour the algorithm invented, however plausible.

**Gradient endpoints — 1/1 applicable.** First stop == background, last stop == surface on row 0, the
only row publishing a ramp (ρ 0.622 against ρ\* 0.62). No row in this round exceeds two stops, so there
are no guide stops to check and no stop-spacing or banding exposure at all this round.

**Collapse flags — 7/7, checked in both directions.** `surfaceCollapsed` iff surface == background and
`accentCollapsed` iff accent == foreground, asserted as an equivalence rather than an implication, so a
flag set on a non-collapsed palette fails as loudly as the reverse. **All seven items are `false` /
`false`**: no collapsed field end and no collapsed accent anywhere in the round. Accent-collapsed covers
(23/220 at 0.4.4) were excluded from the fresh pool at selection, and the exclusion is recorded in
`ROUND.md`.

**`validatePalette` — 7/7 pass**, re-derived here against the *whole* `Palette` of the run row each item
was built from, not taken from the run's own scorecard. The coverage run's scorecard is 200 pass /
20 fail over 220; none of the 20 is in this round. Every one of the seven clears I3's foreground/accent
separation, which matters this round because two items are here precisely to ask whether *clearing* it
is enough — row 0 at 1.09× the bar and row 1 at 1.75× (`ROUND.md`, branch (b)). The contract check and
the reviewer's eye are different instruments and this file only speaks for the first.

**Verbatim copy — 7/7.** Every item's four roles, gradient stops and positions, and both collapse flags
are compared field by field against the run row. This is what makes "nothing was recomputed at staging
time" a checked statement rather than a claim about `build.ts`.

**Provenance — 7/7.** `collection` is re-derived by `deriveCollection`'s own rule from the repo-relative
path (six `sharded-corpus`, one `music-artworks`); `variantId` is `p3-fields-0.4.4`; the fingerprint is
`{algorithmVersion: "p3-fields-0.4.4", preprocessingVersion: "sharp-0.33.5/srgb/no-resample/alpha-
excluded", gitCommit: "affe3965", dirty: false}` on every row, and the run rows' own
`metadata.algorithmVersion` / `metadata.preprocessingVersion` are checked to agree with it.

**Source identity — PASS (new check 11).** The branch tip advanced from `affe3965` to `a51b1d29` — an
orchestrator commit touching `STATE.md` and nothing else — while these runs were executing. So "HEAD
equals the fingerprint" is **false**, and a check asserting it would have had to be either wrong or
switched off. What the fingerprint actually claims is that *the sources these runs read are
`affe3965`'s sources*, and that is what check 11 checks, in two parts over
`research/v3/prototypes/p3-fields/src` and `research/v3/src`:

- `git status --porcelain` — **empty**: nothing uncommitted was in the tree the workers imported;
- `git diff --name-only affe3965 HEAD` — **empty**: nothing committed since changed those trees either.

Together those make `dirty: false` a fact about the tree, and they name the commit a re-run must check
out to reproduce these rows. Corroborated independently by the headers: all four runs carry
`codeVersion` `2d750e713af4dcb2c4fee5059dd7a7506cbd6c5d1ff75e64b3ba6b6c023340c3` — the value the
committed tree produces, recorded four times across two sets and two cache modes.

**Stem ids — 7/7.** `itemId` equals `basename(imagePath)` with the extension removed and nothing else
(`../QUEUE.md`, the round-4 staging convention). No run ordinal appears anywhere in `items.jsonl`, so
the installer never has to rewrite an id and the private↔served mapping stays trivial.

**Determinism — 240/240 rows, 0 divergences.** Both shipping runs have an independent second execution
over the same set with `--no-cache` and `P3_DIAG` **on**, and every row of both is palette-identical
(roles, gradient, collapse) between the pair. That is `diagnostics.ts`'s "diagnostics do not change the
answer" and `run.ts`'s "two runs of the same candidate over the same set produce byte-identical rows",
checked over the whole sets rather than over the seven items. It also licenses `ROUND.md`'s numbers:
every min-ramp, chroma, branch-firing and edge-fraction figure is read from the `P3_DIAG` chains of the
re-runs, which this check shows publish the same palettes as the shipping runs.

**Blinding — 40 forbidden strings, 0 hits.** The side-car is the one file that reaches the reviewer, and
a leaked prototype name in a colour *name* would be as fatal as one in a field. Mechanism vocabulary is
matched on **word boundaries** (the naive substring form false-positives on `round` inside
`background`/`foreground`, which are the contract's own role names); version strings and commit hashes
are matched as plain substrings. This round widens round 6's list with 0.4.4's own vocabulary and this
round's class names — `neutral`, `branch`, `twin`, `margin`, `arbitration`, `prescription`, `regrade`
— plus the literals `0.4.4`, `0.4.3`, `0.4.2`, `affe3965`, `2fc45768`, `a51b1d29`, `b9c41a4` and
`re-grade`. Nothing in the served names tripped any of them.

## Endpoints, paths and the two runs

- Every `imagePath` is **repo-relative** and was verified to resolve at
  `/Users/Flo/GitHub/palette/<imagePath>` — the MAIN checkout, which is the path the installer and the
  review server will use. The round was staged from `.worktrees/p3-fields`, whose corpus shards and
  `music-artworks/` are symlinks back to main, so the worktree prefix is stripped exactly once and the
  check is against main rather than against the worktree it was produced in.
- Six items ship from `run-coverage-220-0.4.4.jsonl`. **One ships from `run-demo-20-0.4.4.jsonl`**:
  cover 19 (`…0000269ead63cf2376a6b67d`) is not a member of `coverage-set-1-220` — verified twice, by
  `grep` against the set file (0 matches) and by `select.ts` finding no such row among the coverage
  run's own 220 — so its palette cannot come from the coverage run. This is round 6's `sourceRun`
  precedent re-applied unchanged. Both runs are the same candidate at the same commit with the same
  `codeVersion`; `verify.ts` routes each item to its own run via the item's `sourceRun` field and
  checks determinism for both.
- Set identity is read off the headers, not assumed. `coverage-set-1-220`, `setHash`
  `9cf1eec630b7cc9ee252e446741c2987b8468a62c00dc300cf60e2ee4486efbc`; `demo-20`, `setHash`
  `72272a5edd6e7d8273f60ff0bda60919d032aca585c8268803f086c3cecdd561`. **Both are byte-identical to the
  hashes round 6 recorded**, so "the same 220 covers and the same 20 covers" is a checked statement
  across the two rounds — which is what makes the four re-grades comparisons of the *candidate* rather
  than of the sample.
- Package versions are identical across all four headers and to round 6's: `sharp` 0.33.5, `apca-w3`
  0.1.9. The `preprocessingVersion` string in the fingerprint therefore describes the decode that
  actually ran.

## Not covered by this file

- **Push-shape fields.** `items.jsonl` carries two orchestrator-only fields, `selectionClass` and
  `sourceRun`, which are not part of the push shape (rounds 5 and 6 shipped `selectionClass` on the same
  basis). The installer strips them; nothing here asserts that it does.
- **`purpose` and `fundedBy`.** Declared in `ROUND.md` (`purpose: calibration`, `fundedBy` linkage-free)
  and honoured installer-side. This file verifies the item payload, not the batch envelope.
- **The reviewer-facing render.** The side-car is checked to carry the same hexes as the item and to
  leak nothing; whether the mock renders it as intended is a live-verification step for the round
  handoff, not a staging check.
- **Round-6 grades quoted in `ROUND.md`'s item table.** They are orchestrator context transcribed from
  `../round-6-calibration/VERDICTS.md`, not a machine-checked join, and nothing served carries them.
