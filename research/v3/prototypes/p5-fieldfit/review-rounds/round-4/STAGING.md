# P5 round 4 — staging record

Written by the staging worker (W-STAGE4), 2026-08-11, in the worktree `.worktrees/p5-fieldfit`
(branch `proto/p5-fieldfit`, HEAD `c5552f8` at the start of staging — **`899614d` at the end; see
§1.1, it is not my commit and it is not algorithm code**). Nothing here was pushed to the server.

Format, validation battery and installer caveats follow `round-3/STAGING.md` deliberately: same
payload shape, re-cut against `p5-fieldfit-0.8.2`.

**Read §3.1 and §6 first if you read nothing else.** Two things need a decision before the push:

1. **The payload has SEVEN items, not eight.** ROUND.md row 5's light-field-with-light-text class
   returned **zero** qualifiers again — this time over a 1041-cover pool, 4.9× round 3's and drawn
   from beyond coverage-set-1 exactly as ROUND.md instructed. Slot 5 is empty and one disclosed
   near-miss awaits the orchestrator's ruling in `ITEM5-QUESTION.md`. Nothing was relaxed.
2. **ROUND.md's item-7 confirmation question names a cover that is not in this payload**
   (`a8942d6547` is a round-3 item). §7 quotes the question verbatim for the installer and lays out
   the vehicle options, including the one that requires no new machinery.

---

## 1. The runs these palettes come from

All four runs below share one `codeVersion`,
`737d1f11667bf8518233591dea9e6c738ee3639bd8a1b5274f65acb5379d3b76`, so every palette in the payload
was produced by the same candidate bytes.

```
NODE_NO_WARNINGS=1 node --experimental-strip-types src/devloop/run.ts \
  --candidate prototypes/p5-fieldfit/candidate.ts \
  --set data/devloop/sets/<SET>
```

| set | run file (`data/devloop/runs/`) | result | `setHash` | feeds |
|---|---|---|---|---|
| `demo-20` | `p5-fieldfit-demo-20-20260811T112525309Z.jsonl` | 20 ok · 0 failed · 20 hits · 0 computed · 128 ms | `c364706ce35fde8ffad818f3427377ac182e1da9639e88d419e93863221b41e7` | items 1, 2, 4 |
| `p5-round2-fresh` | `p5-fieldfit-p5-round2-fresh-20260811T112531006Z.jsonl` | 2 ok · 0 failed · 2 hits · 0 computed · 59 ms | `b2544509196a50a859b5aab3a20b80de10a75994174f3e35b4e501bd7e280351` | **nothing** — see below |
| `p5-round3-fresh` | `p5-fieldfit-p5-round3-fresh-20260811T112531167Z.jsonl` | 5 ok · 0 failed · 5 hits · 0 computed · 70 ms | `97625315b8491412231e1f2e5628b6879c624742a7d7c6d4f6ada3f431173299` | item 3 |
| `p5-round4-fresh` | `p5-fieldfit-p5-round4-fresh-20260811T113044607Z.jsonl` | 4 ok · 0 failed · 0 hits · 4 computed · 1176 ms | `8fa47fef390b016508bb0f8158970f8801fc400d0d80f455468f3a900833f857` | items 6, 7, 8 (+ the item-5 nominee, **not** payload) |

**`p5-round2-fresh` feeds nothing, and that is a correction to the brief, not an omission.** The
brief named it as one of the three sets holding the returning items. It does not: ROUND.md's row 4
cover `fc8d58e0af` is `00/ab67616d00001e0200000ee5a62175fc8d58e0af.jpg`, a **demo-20** member (line
10 of the set file). All four returning items live in `demo-20` and `p5-round3-fresh`. The
`p5-round2-fresh` run was made anyway, recorded here, and used for nothing.

`p5-round3-fresh`'s `setHash` is **identical to round 3's second (payload) hash** — the set file has
not been touched since, so round-3 caveat N's two-hashes-one-name problem does not bite this round.

All four runs: `algorithmVersion` `p5-fieldfit-0.8.2`, `preprocessingVersion`
`sharp-0.33.5/srgb/no-resample`, node v25.8.1, `sharp@0.33.5`, `colornames-oklab@0.6.0`,
`apca-w3@0.1.9`, `colorjs.io@0.5.2`.

**The three returning-item runs report 100% cache hits.** The cache is keyed on `codeVersion` +
input content hash, and v0.8.2 had already been run over these sets in this worktree. Every row's
own `palette.metadata.algorithmVersion` reads `p5-fieldfit-0.8.2` and was checked programmatically
(`build-payload.ts` throws on any other value), so nothing from an earlier version can reach the
payload. The four round-4 covers were genuinely computed — 0 hits.

**Every colour in `items.json` is copied verbatim from a run row's `palette.roles[*].hex` and
`palette.gradient.stops[*].color.hex`.** `build-payload.ts` reads the `.jsonl` files and copies
fields. Two transformations only, both disclosed: `gradient.geometry` is dropped (caveat C) and stop
positions are canonicalised to 6 decimals with the server's own `canonicalPosition` (caveat O — new,
and load-bearing this round because two ramps carry a middle stop). Collapse flags are the run's own
`palette.collapse.{surfaceCollapsed,accentCollapsed}`.

### 1.1 `dirty: false`, measured — and HEAD moved

- `git diff c5552f8 -- research/v3/prototypes/p5-fieldfit/src research/v3/prototypes/p5-fieldfit/candidate.ts`
  → **empty**, at the start and at the end of staging.
- `git status --porcelain` over the same two paths → **empty**, likewise.
- Whole-worktree `git status --porcelain` at staging time → two untracked lines, neither of them
  algorithm code: this directory, and `data/devloop/sets/p5-round4-fresh.txt`.

**LOUD — HEAD moved from `c5552f8` to `899614d` during staging, and I did not move it.** The commit
is `p5-fieldfit: v0.8.2 robustness artifact — 41.7% overall, dither 47% and accent 43.3% both
best-ever, fg 33.0% flagged`, written by the concurrent robustness harness. Measured:

- `git diff --stat c5552f8..899614d` → **one file**,
  `research/v3/data/robustness/reports/p5-fieldfit-0.8.2.json`, +22278 lines.
- `git diff c5552f8..899614d -- research/v3/prototypes/p5-fieldfit/` → **zero lines**.

So the algorithm is byte-identical at both commits and every palette here is reproducible at either.
The fingerprint says `gitCommit: "c5552f8"` as the brief fixed it, and that remains the honest
answer — but **an installer diffing the fingerprint against HEAD will see a mismatch and must not
read it as a stale payload.** Caveat P. I never ran `git commit`.

---

## 2. The seven items

Order in `items.json` is ROUND.md's table order with row 5 absent. `itemId` is the **full 40-hex
filename stem** (caveat A). `imagePath` is repo-relative and every one resolves under
`/Users/Flo/GitHub/palette/`.

| # | itemId | imagePath | ROUND.md row / provenance |
|---|---|---|---|
| 1 | `ab67616d00001e020000269ead63cf2376a6b67d` | `00/…2376a6b67d.jpg` | row 1 — returning, 4th appearance; demo-20 |
| 2 | `ab67616d00001e02000022e7e9d11c908479200b` | `00/…908479200b.jpg` | row 2 — returning, R3 STRONG; **the deliberate accent question**; demo-20 |
| 3 | `ab67616d0000b27300094a786a28459646be9b20` | `09/ab67616d0000b27300094a786a28459646be9b20` | row 3 — returning, R3 UNACCEPTABLE; `p5-round3-fresh` |
| 4 | `ab67616d00001e0200000ee5a62175fc8d58e0af` | `00/…fc8d58e0af.jpg` | row 4 — returning, 3rd appearance; demo-20 |
| — | — | — | **row 5 — EMPTY. Zero qualifiers over 1041 covers. §3.1, `ITEM5-QUESTION.md`** |
| 6 | `ab67616d0000b2730003079010cf188395a0f57b` | `03/…95a0f57b.jpg` | row 6 — **fresh**, class *vivid illustration*, §3.2 |
| 7 | `ab67616d0000b27300012525e62c7f45baf46c90` | `01/…baf46c90.jpg` | row 7 — **fresh**, class *two-component/panel*, §3.3 |
| 8 | `ab67616d00001e02000227d883fd2cc65408f632` | `02/…5408f632.jpg` | row 8 — **fresh**, class *wildcard (most-ordinary cover)*, §3.4 |

Each of ROUND.md's four returning tokens matched exactly one run row (the tokens are the last ten
characters of the filename stem; all twenty demo-20 stems and all five `p5-round3-fresh` stems are
distinct in their sets). `build-payload.ts` asserts a single match per token and throws otherwise.

### 2.1 The returning four, checked against ROUND.md's stated expectations

ROUND.md's table names three colours in advance. **All three match, exactly.** This was the loud-stop
condition and it did not trigger.

| # | ROUND.md predicts | run publishes | verdict |
|---|---|---|---|
| 1 | fg `#000000` / accent `#f81107` | fg `#000000`, accent `#f81107` | **MATCH** |
| 2 | accent `#231f20`, fg held at `#fed078` | accent `#231f20`, fg `#fed078` | **MATCH** |
| 4 | accent `#9ba193` | accent `#9ba193` | **MATCH** |

Row 3 states no hex; it describes "cream field, type-blue fg, black accent". The run publishes
background = surface `#fae8d0` (a cream, collapsed), foreground `#01bdfd` (the display type's cyan
blue), accent `#000000`. **Consistent with the description on all three counts.**

Item 1 additionally satisfies row 1's "all four named colours in the palette": `#fad107` yellow
field, `#f9fbf8` white surface, `#000000` foreground, `#f81107` red accent.

Two changes against round 3 worth recording, neither of them a mismatch:

- **Item 2's ramp gained a middle stop.** Round 3 published `#7a545f → #fd7b61` in two stops; v0.8.2
  publishes three, `#7a545f → #e06d68 (0.759884) → #fd7b61`. The ends are unchanged. This is the
  first 3-stop ramp any P5 round has staged and it changes the rendered CSS reserve from 35% to 10%
  (caveat Q).
- **Item 4 published a flat field in both earlier rounds and now carries a 2-stop ramp.** Round 1:
  `background #545d58 / surface #4b544f`, `gradient: null`, foreground = accent `#e0d0db`
  (`accentCollapsed: true`). Round 2: same two field colours, `gradient: null`, foreground `#feffff`,
  accent `#0b0c06`. Round 4: `#4a534e → #6c6c6a` as a ramp, foreground `#201c13`, accent `#9ba193`.
  So across three appearances the accent has gone near-white-collapsed → near-black → **the green
  family the reviewer named**, which is ROUND.md row 4's whole point.

**Diagnostics for the four returning covers** (record only, never payload):

| item | noField | fieldComponents | retreat | gradient | twoBlockFallback | fieldExplainedFraction | residualScale |
|---|---|---|---|---|---|---|---|
| 1 `2376a6b67d` | true | 3 | false | false | **true** | 0.0964 | 0.1683 |
| 2 `908479200b` | true | 3 | false | **true** | false | 0.0995 | 0.2499 |
| 3 `9646be9b20` | true | 0 | **true** | false | false | 0.0124 | 0.3433 |
| 4 `fc8d58e0af` | true | 2 | false | **true** | false | 0.4720 | 0.1002 |

Item 3's `retreat: true` is the ink veto landing — ROUND.md row 3's stated mechanism, visible in the
diagnostic.

---

## 3. Items 5–8 — the selection

### 3.0 Pool, exclusions and the census

**The pool is NOT coverage-set-1 this round.** ROUND.md row 5 requires the pool to widen beyond it
rather than the rule to relax, so:

**Pool rule, stated before any statistic was read:** every file in shards `01/`, `02/` and `03/` of
the repository root, in shard order 01, 02, 03 and within each shard in ascending filename (byte)
sort. **All three shards are taken whole — 1075 files.** The brief allowed "first N per shard" for a
≥500 pool; taking whole shards clears the floor twice over and needs no cut-off number, so there is
no free parameter in the pool at all. All 1075 are `.jpg`.

**Exclusions, all applied before any statistic was read:**

- **the frozen holdout** `data/holdout/holdout.json`, by artwork `id`, by every `files[*].path` and
  by `bestRenditionPath` (round-3's three-way check) — **0 hits**, as expected: every holdout entry
  is a `music-artworks/…` path under the music-stem id scheme, and no holdout row carries a
  shard-style path at all (measured: 0 of 413);
- **`data/coverage-set/coverage-set-1.json`, all 220 artworks** — already censused in round 3, and
  ROUND.md asks for covers from beyond it — **34 hits**. (26 of those are direct shard-01/02/03
  members of the coverage set; the other 8 are caught by the artwork key below, i.e. they are
  *different renditions* of coverage-set artworks that live in another shard.)
- **every cover any earlier P5 round drew** — `demo-20`, `p5-round2-fresh`, `p5-round3-fresh` —
  **0 hits** (all of them are in shards 00, 04, 08, 09, 11, 12, 14);
- **unreadable / undecodable** — **0 hits**.

Every id-shaped exclusion matches on round-3's artwork key: for a Spotify-style stem `ab67616d` + 32
hex, the leading 16 encode the rendition size and the **trailing 24 identify the artwork**, so a
different rendition of an excluded artwork is excluded too.

**1041 covers censused** of 1075 scanned.

**The census program** is `select-fresh-covers.mjs`, kept beside this file. Its **statistics are
round-3's, unchanged** — including the `.removeAlpha()` fix of round-3 §3.0 and the
`info.channels === 3` assertion. Only the pool machinery changed. It decodes each candidate at 64×64
(`sharp`, `removeAlpha`, `fit: "fill"`, sRGB, raw), converts to OKLab and reports `fieldMedianL`,
`fieldMedianC`, `fieldPlaneR2`/`Amplitude`, `fieldVectorPlaneR2`/`Amplitude`, `fieldBlockRange`,
`flatFrac`, `topBinShare`, `distinctBins`, `detail`, `blockDetail`, `textureIndex`,
`splitR2`/`DeltaE`/`Balance`/`Axis`/`At`, `markFrac`, `markLightShare`, `meanL/C`, `p05L`, `p95L`,
`p90C`, `vividFrac`, `planeR2`, `planeSlope`. Output: `census.json` (1041 rows).

**No palette, no diagnostic, and no candidate-algorithm call is involved.** The census imports
`sharp` and nothing from `prototypes/`.

**The ranking program** is `rank.mjs`, also kept beside this file. **Every class rule below was
written into that file's header before any ranking was read**, and it was run to produce
`selection.json`. Reading the rules off the program rather than off this prose is the point.

**Cross-class rule, stated before ranking:** classes resolve in the order 5, 6, 7, 8; a cover
**selected or nominated** by an earlier class is removed from every later pool. "Nominated" is in the
rule so the item-5 near-miss cannot already be sitting in another slot if the orchestrator rules it
in. Pools after each removal: 1041 → 1040 → 1039 → 1038.

**A defect in my own ranking program, disclosed.** The first run of `rank.mjs` added the item-5
claimant's *file name* to the taken-set while the taken-set is compared against the *stem* (no
extension), so the nominee was not actually withheld from classes 6–8 on that run. I fixed it and
re-ran. **The four picks are identical before and after** — verified by diffing the two
`selection.json` files — because none of classes 6–8 ranked the nominee anywhere near rank 1. The
fix is in the file with a comment saying so. No rule text was touched; the bug was in the
bookkeeping, not the gates.

**No palette was computed or read before the selection was fixed.** The order of operations was:
census → write rules → rank → look at the four artworks → run the dev loop → read palettes →
`diagnose.ts`. Unlike round 3 (its §3.0), the strict "no output seen before selection" property
holds for **every** round-4 fresh item.

### 3.1 Item 5 — the light-field class returned ZERO qualifiers. SLOT EMPTY.

**Rule (stated before ranking), round-3 §3.4's statistic UNRELAXED:**
`fieldMedianL ≥ 0.75` **and** `fieldMedianC ≤ 0.06` **and** `markLightShare ≥ 0.60`; rank survivors
by `markLightShare` descending, tie-break `fieldMedianL` descending, take rank 1.

**Pool after the gate: 0 of 1041.**

| term | survivors |
|---|---|
| `fieldMedianL ≥ 0.75` | 182 |
| `fieldMedianC ≤ 0.06` | 699 |
| `markLightShare ≥ 0.60` | **6** |
| `fieldMedianL ≥ 0.75` ∧ `fieldMedianC ≤ 0.06` | 136 |
| **all three** | **0** |

Measured maximum `markLightShare` among the 136 light-and-neutral fields: **0.5636**. Maximum
anywhere in the pool: 0.9211, on covers that are not light fields. Round 3 measured a ceiling of
0.450 over 213 covers; round 4 measures 0.5636 over 1041 from a different part of the corpus. **The
ceiling rose and still did not reach the gate.**

**Slot 5 is empty in the payload.** The one cover above the brief's 0.50 disclosure floor —
`02/ab67616d00001e0200028475c3197f4510266bb9.jpg`, `markLightShare` 0.5636, a **6.1% shortfall** —
is written up in full in **`ITEM5-QUESTION.md`** and awaits the orchestrator's ruling. It was **not**
included. Three things from that file belong here too:

1. The nominee's artwork does **not** exhibit the class: it is a white field carrying a *darker*
   inset photograph, not light text. That is exactly why its `markLightShare` stops where it does.
2. Its palette nonetheless lands **inside** ROUND.md row 5's `(10.6, 28.9]` legibility bracket —
   `foreground #dcdcdc` on `background #fafafa`, `minRawApca 17.854` against a floor of 15, ratio
   **1.19**. It is the only cover in the round that does.
3. So the artwork-side question ("does this corpus contain light ink on light fields?") is **still
   unanswered** at 1041 covers, while the palette-side question ("does the legibility floor hold on a
   light field?") is answered, and answered badly.

Its palette was computed (it is line 4 of `p5-round4-fresh.txt`) purely so a ruling of "admit it"
needs no recompute. That run happened **after** selection was fixed.

### 3.2 Item 6 — vivid illustration

**Rule (stated before ranking):** round-2/3's "photographic gate" with its two **shape** terms
**inverted** — `flatFrac ≥ 0.20` **and** `topBinShare ≥ 0.15`; rank survivors by `vividFrac`
descending, take rank 1.

The inversion is the whole point of the class. Round-3 §3.3 recorded that the photographic gate
(`flatFrac ≤ 0.20 ∧ topBinShare ≤ 0.15 ∧ distinctBins ≥ 500`) encodes *continuous-tone and
unconcentrated*, not photography, and drew an illustration anyway. Inverting it asks for the opposite
shape deliberately: flat fills and a dominant colour.

**The photo gate's third term (`distinctBins ≥ 500`) is DROPPED, not inverted, and it is stated
rather than left quiet:** it is a busyness gate, and demanding busyness of a flat-fill illustration
would contradict the two inverted terms rather than sharpen them.

**Pool after the gate: 283 of 1040.**

**Rank 1: `ab67616d0000b2730003079010cf188395a0f57b`** — `vividFrac 0.9976`, `flatFrac 0.859`,
`topBinShare 0.9031`, `distinctBins 6`, `meanC 0.1219`, `p90C 0.1217`, `fieldMedianL 0.589`,
`fieldMedianC 0.1217`, `detail 0.0018`.

**Runners-up:** `01/…b4cd95b2` (0.9846), `01/…b01299c4` (0.9712), `01/…50d9fa8e` (0.9282),
`01/…350193bf` (0.9216), `03/…30394775` (0.9141), `01/…fc037795` (0.9087). Rank 1 clears rank 2 by
0.013 on the rank key; no tie-break was needed.

**Honest description** (looked at after selection, before its palette was read): a flat mid-blue
field carrying a low-poly wireframe stag's head — antlers and a triangulated muzzle — drawn in a
line only slightly darker than the field. No display type. Wide empty margins.

**LOUD, and it is the mirror image of round-3 §3.3's failure.** Round 3's gate encoded
"continuous-tone and busy" and drew an illustration. Round 4's inversion encodes "flat and
concentrated" and drew a **near-solid colour field**: `distinctBins 6`, `detail 0.0018`,
`topBinShare 0.90`. This cover is literally one blue with a faint line on it. **Neither gate encodes
"illustration"** — the pair of results is now strong evidence that no combination of these
flatness/concentration/busyness statistics can, and that the class needs a mark-level or
edge-level statistic if the round after this one wants it. Item 6's grade is evidence about a
**flat single-colour vector cover**, not about vivid illustration as ROUND.md's row 6 means it.

I did not change the rule. It was stated before ranking and the inversion was the brief's.

### 3.3 Item 7 — two-component / panel

**Rule (stated before ranking) — round-3 §3.2's rule, verbatim,** so round-3 item 5 and round-4
item 7 are comparable draws: `splitR2 ≥ 0.50` **and** `splitDeltaE ≥ 0.15` **and**
`splitBalance ≥ 0.25`; rank survivors by `splitR2` descending, take rank 1.

**Pool after the gate: 48 of 1039.**

**Rank 1: `ab67616d0000b27300012525e62c7f45baf46c90`** — `splitR2 0.8794`, `splitDeltaE 0.5205`,
`splitBalance 0.375`, `splitAxis h`, `splitAt 0.625`, `fieldBlockRange 0.7298`,
`fieldMedianL 0.7906`, `fieldMedianC 0.044`.

**Runners-up:** `02/…70c3f5a6` (0.8712), `01/…0ffcbe42` (0.8513), `02/…04d9b7c3` (0.8509),
`02/…56c4f5ca` (0.8032), `03/…da89643a` (0.7752), `02/…af227281` (0.7634). Rank 1 clears rank 2 by
0.008 on the rank key — **the narrowest margin in the round** — but the ordering is strict and no
tie-break was needed.

**Honest description:** a photograph. A hazy pale pink-and-cyan sky fills the upper ~60%; a dense
magenta/crimson field of scrub or heather fills the lower ~40%, with a dark horizon line between
them. Thin letter-spaced black capitals *NARCOSIS* with a smaller *WILJAN* beneath, set in the sky.
The horizontal split at 0.625 is exactly what `splitAt` says.

**Flagged, carried from round-3 §3.2:** this is again a **photographic** two-component cover, not a
graphic panel layout, and no stated statistic distinguishes those. The class has now drawn
photographic evidence twice running.

### 3.4 Item 8 — wildcard: the pool's most ORDINARY cover

**Rule (stated before ranking) — my stated choice.** ROUND.md calls slot 8 a drift check, and every
other slot in this round is an extreme of some statistic; an extreme here would re-ask a question the
round already asks four times. So: over the six statistics `fieldMedianL`, `fieldMedianC`,
`flatFrac`, `detail`, `splitR2`, `vividFrac`, compute each cover's percentile rank within the pool
remaining at this point, score it `Σ |percentile − 0.5|` over the six, rank **ascending**, tie-break
stem ascending, take rank 1. Rank 1 is the cover closest to the middle of the pool on all six axes at
once — an artwork with no distinguishing property to blame a bad palette on.

**Pool: 1038** (no gate; the rule ranks the whole remaining pool).

**Rank 1: `ab67616d00001e02000227d883fd2cc65408f632`** — ordinariness score **0.5106**;
`fieldMedianL 0.394`, `fieldMedianC 0.0385`, `flatFrac 0.1126`, `detail 0.0445`, `splitR2 0.1285`,
`vividFrac 0.0229`, `topBinShare 0.0916`, `markLightShare 0.3186`, `textureIndex 1.2044`.

**Runners-up:** `01/…43b718cb` (0.5299), `01/…6a7ad7ba` (0.5385), `03/…a01972b2` (0.5771),
`02/…f84ff23f` (0.6002), `03/…3ef57ed2` (0.6012), `03/…7c5066fc` (0.6195).

**Honest description:** a photograph of backlit autumn foliage — rust and orange leaf clusters on
bare dark branches — silhouetted against a dusky blue-grey evening sky, with a small bright yellow
full moon just left of centre. No type.

**Flagged, in the wildcard's favour:** the moon is a tiny, isolated, extremely salient high-chroma
region occupying almost no area. That is an unforced, unengineered test of how role assignment
weighs salience against mass, and §3.5 shows it produced the round's most interesting diagnostic.

### 3.5 `diagnose.ts` on the fresh three (and the nominee) — record only, NOT payload

```
NODE_NO_WARNINGS=1 node --experimental-strip-types prototypes/p5-fieldfit/diagnose.ts <absolute image path>
```

| item | noField | components | retreat | gradient | twoBlockFallback | fieldExplainedFraction | residualScale | escape |
|---|---|---|---|---|---|---|---|---|
| 6 `…95a0f57b` | false | 0 | false | false | false | 0.9943 | 0.0000 | **`{role: "foreground", color: "#000000"}`** |
| 7 `…baf46c90` | **true** | 4 | false | **true** | false | 0.1866 | 0.1706 | null |
| 8 `…5408f632` | false | 0 | false | **true** | false | 0.5429 | 0.0803 | null |
| *(nominee)* `…10266bb9` | false | 0 | false | false | false | 0.8277 | 0.0000 | null |

Three readings that the reviewer's grades should be joined against:

**Item 6 — the escape hatch fired.** `assignment: null`, `componentCandidates: []`, and
`escape: {role: "foreground", color: "#000000"}`. The field explains 99.4% of the image, the overlay
offered nothing usable, and the algorithm escaped to black for the foreground; the accent then
collapsed onto it. The published palette is one blue and one black:
`background = surface #2485ba (collapsed)`, `foreground = accent #000000 (collapsed)`. **This is the
first payload item in any P5 round with `accentCollapsed: true`.** The artwork's only other colour —
the faintly darker blue of the wireframe stag — reaches the palette nowhere. Whether that is right
is a genuinely open question and it is unseen evidence.

**Item 7 — the accent union saw the crimson and ranked it second.** The accent shortlist is

| rank | hex | source | mass | minRawApca |
|---|---|---|---|---|
| 1 | `#98a9c3` (the sky) | component | **45730.0** | 27.27 |
| 2 | `#5a1921` (the crimson scrub) | component | 23632.9 | 79.00 |
| 3 | `#36181a` | overlay | 55.6 | 83.13 |

The published accent is rank 1, the pale sky blue. **The artwork's single most striking feature —
the magenta/crimson field that fills 40% of the frame — is in the pool, is ranked second on mass, and
appears nowhere in the published palette.** This lands directly on ROUND.md's question (b), which
asks whether the accent union may displace a reviewer-seen accent with a heavier region colour: item
2 is the round's *deliberate* instance of that question, and item 7 is an **accidental second
instance on a fresh cover**, with the mass ratio (1.93×) and the contrast gap (27.3 vs 79.0) both
recorded. If the reviewer objects to item 7's accent, that is a second, independent data point on the
same mechanism — and it was not staged for it.

**Item 8 — the foreground is a six-pixel speck.** The foreground shortlist is

| rank | hex | source | mass | minRawApca |
|---|---|---|---|---|
| 1 | `#f8ea41` | overlay | 6.0 | 79.76 |
| 2 | **`#feff42`** (published) | overlay | 6.0 | 90.65 |
| 3 | `#ca6026` | overlay | 4.2 | 22.60 |

The moon *is* the foreground. Every candidate has a mass under 7, and the winner beat a
near-identical hex on legibility (90.65 vs 79.76). The drift check therefore asks a sharp question by
accident: on an entirely ordinary cover, the published foreground comes from an object of negligible
area, chosen between two indistinguishable yellows by an APCA tie-break. `foregroundLegibility`:
`minRawApca 90.649`, floor 15, ratio 6.043.

Item 7's foreground legibility for comparison: `minRawApca 85.548`, ratio 5.703. The nominee's:
`minRawApca 17.854`, ratio **1.19** — §3.1.

---

## 4. What is in each file

**`items.json`** — a bare JSON **array** of 7 calibration items, each with exactly five keys:
`itemId`, `imagePath`, `variantId`, `fingerprint`, `palette`. No batch envelope: the installer
supplies `batchId`, `purpose` and `fundedBy`.

`variantId` is `"p5-fieldfit-0.8.2"` on every item; `fingerprint` is
`{algorithmVersion: "p5-fieldfit-0.8.2", preprocessingVersion: "sharp-0.33.5/srgb/no-resample",
gitCommit: "c5552f8", dirty: false}` on every item.

**`render-data.json`** — an **object keyed by `itemId`**, each value `{ roles, gradient, fieldCss }`:

- `roles` — four entries in fixed order `background, surface, foreground, accent`, each
  `{ role, hex, name, collapsed }`. `name` comes from `nameHexes()` (`src/review-server/color.ts:62`,
  the one `colornames-oklab` call site). `collapsed` is `false` for background and foreground by
  construction, and the palette's own `surfaceCollapsed` / `accentCollapsed` for the other two.
- `gradient` — the stops verbatim, or `null`.
- `fieldCss` — produced by the **pinned renderer**, `fieldCss()` at
  `src/review-server/gradient.ts:119`: the flat background hex when there is no gradient, otherwise
  `linear-gradient(135deg in oklab, …)` with the reserve the renderer chooses for the stop count.

**Blinding.** Neither served file contains a prototype name, a mechanism label, a version string, a
diagnostic, a before/after framing or any round metadata. `variantId` and `fingerprint` do name the
algorithm, deliberately — they are TRUE names the server keeps and never serves
(`src/review-server/README.md`, "Calibration mode"). The leak scan in §5 covers everything else.

**`select-fresh-covers.mjs`, `rank.mjs`, `build-payload.ts`, `check.ts`, `census.json`,
`selection.json`, `ITEM5-QUESTION.md` and this file are staging artefacts, not payload. They must not
be pushed.**

---

## 5. Validation

`check.ts`, kept beside this file, run from `research/v3`. **28 checks, all passed** — round-3's 24
plus four this round needs (`itemId` is its own path's stem; gradient ends sit at 0 and 1; positions
canonical at 6 dp; `fieldCss` matches the pinned renderer per item rather than by ramp/flat shape).

```
PASS  items.json parses as an array of 7 — 7 items
PASS  7 unique itemIds
PASS  every itemId is a server-legal id token
PASS  every itemId is a full 40-hex stem
PASS  every hex matches ^#[0-9a-f]{6}$ — 38 hexes checked, bad: none
PASS  every imagePath exists under the MAIN checkout — 7/7 resolve
PASS  no imagePath is absolute
PASS  every itemId is its imagePath's filename stem
PASS  gradient ends are background -> surface — 4 gradient items
PASS  gradient positions in [0,1] and strictly increasing at 6 dp
PASS  gradient ends sit at 0 and 1
PASS  gradient stop counts within 2..4
PASS  no gradient carries a non-string geometry
PASS  every item has both collapse booleans and required fields
PASS  collapse flags agree with hex equality (surface~background, accent~foreground)
PASS  items.json items carry exactly the 5 push keys
PASS  fingerprint is uniform and names v0.8.2 at c5552f8, dirty false
PASS  render-data has one entry per itemId
PASS  every render entry has 4 named roles in order
PASS  render hexes and collapse flags match items.json verbatim
PASS  render names are the current colornames-oklab output
PASS  fieldCss is the pinned renderer's output for every item
PASS  render entries carry exactly roles/gradient/fieldCss
PASS  no diagnostics / mechanism labels / version labels in any served field — clean
PASS  the "E2" mechanism label, word-bounded and case-sensitive
PASS  "e2" over the served colour NAMES only (hex-free text) — names: 33 words
PASS  parseCalibrationBatch OK: 7 items, purpose calibration
PASS  round-trip identical (palettes byte-identical after parse)

ALL CHECKS PASSED
```

**The parser dry run** feeds the 7 items (with `imagePath` rewritten to absolute) to
`parseCalibrationBatch` from `src/review-server/batch.ts`; every palette comes back **byte-identical**
under `JSON.stringify` comparison. It does **not** exercise `pushCalibration`'s later stages (path
allowlist, `sharp.metadata()` on the file header, batch-log write), so the live push is still the
real test.

**`collapse flags agree with hex equality` — the pairing, since it is not symmetric.**
`surfaceCollapsed` pairs `surface` with `background`; `accentCollapsed` pairs `accent` with
**`foreground`**, not with surface (`src/contract/constants.ts:65`,
`src/contract/invariants.ts:737`). The check asserts both, in that pairing. **This round it is
load-bearing for the first time:** item 6 has `accentCollapsed: true` with
`accent === foreground === "#000000"`, and a check that had paired accent with surface would have
failed it wrongly.

**Three notes on the leak scan.** Round 2's: `"round"` cannot be used as a token — `background` and
`foreground` contain it. Round 3's: **`"e2"` cannot be used over colour data** — this round item 7's
surface is `#d7e2e4`, a served hex. `"e2"` was therefore scanned two ways: word-bounded and
case-sensitive (`\bE2\b`) over the whole serialized payload, and case-insensitively over the served
colour **names** alone, which carry no hex. Both clean. Round 4's, new: the brief's three added
tokens (`class`, `union`, `coverage`) are all safe over hex and over the 33 served name words.

The full list scanned over everything, case-insensitively, is `p5`, `fieldfit`, `field-fit`, `v0.`,
`0.3.0`, `0.5.1`, `0.6.0`, `0.8.2`, `explf`, `nofield`, `round-1`, `round-2`, `round-3`, `round-4`,
`round 2`, `round 3`, `round 4`, `before`, `after`, `twoblock`, `two-block`, `retreat`, `component`,
`smooth`, `prototype`, `calibration`, `diagnos`, **`class`**, **`union`**, **`coverage`**, `escape`,
`census`, `returning`, `fresh` — over all of `render-data.json` plus every item's `itemId` /
`imagePath` / `palette`. **Zero hits.**

---

## 6. Payload caveats an installer must act on

Caveats **A–N are carried over from `round-3/STAGING.md` §6** and re-verified against this payload;
**O–T are new to this round.**

**A. `itemId` is the FULL 40-hex filename stem, not the 10-char token ROUND.md uses.** Unchanged
from rounds 1–3, and unchanged deliberately: switching now would make round-1/2/3/4 feedback
un-joinable on the item handle. All seven pass `ID_PATTERN` (`batch.ts:32`).

**B. `imagePath` is repo-relative and MUST be rewritten to absolute before the push.**
`parseCalibrationBatch` requires `isAbsolute(imagePath)` (`batch.ts:219`). Prefix with
`/Users/Flo/GitHub/palette/` — the **main checkout**, not the worktree; the server's `imageRoots`
allowlist defaults to `REPO_ROOT` (`server.ts:460`). All 7 files were verified present there.

**C. `gradient.geometry` was dropped, deliberately.** The run emits an **object**
(`{kind, angleDegrees}`); the server requires a **string** of ≤64 chars when present
(`batch.ts:104`). The four fitted angles are 84.3°, 10.7°, −89.1° and −60.3°, and the pinned renderer
fixes display at 135° (`gradient.ts:33`), so nothing reaches the field either way.

**D. Where the push shape was read from** — `src/review-server/README.md` "Calibration mode";
`server.ts:2462` (`POST /api/calibration` → `pushCalibration`, defined `server.ts:677`);
`batch.ts:205-242` (`parseCalibrationBatch`), `:107` (`parsePalette`), `:129-133`
(`parseFingerprint`, where `dirty` is **required and never defaulted**), `:72-105` (`parseGradient`),
`:110-117` (both collapse booleans required; the server deliberately does **not** enforce contract
invariants).

**E. `purpose` defaults to `calibration`** (`batch.ts:207`); `fundedBy` defaults to `[]`
(`batch.ts:212`) and was **not** invented here. The installer owns that list.

**F. The side-car shape is a MAP, not the `{batchId, items:[…]}` envelope the existing side-cars
use.** `render-data.json` maps `itemId → { roles, gradient, fieldCss }`. If the page rendering this
round expects the accent-real envelope, this file needs re-wrapping (a wrapper, not a rebuild).
Confirm before pushing.

**G. `render-data.json` names are the CURRENT `colornames-oklab@0.6.0` output** (the version all four
run headers record). Names are presentation-only. **This round it bites once:** item 6's background
and surface both read "Blue Jay" *and* its foreground and accent both read "Pitch Black" — both
identities **are** collapses, correctly shown. No two *different* colours share a name in this
payload — checked explicitly: 23 distinct names, and every repeated name is a genuine hex duplicate.
That is better than round 3, where item 7's two distinct ramp ends both read "Narwhal Grey".

**H. Four items carry a gradient; three are flat.** Items 2, 4, 7, 8 ramp; items 1, 3, 6 are flat.
Every ramp starts at `background` (position 0) and ends at `surface` (position 1).

**I. Two distinct field colours do not reach the rendered field when `gradient` is `null`.**
`fieldCss()` renders the flat background alone whenever `gradient` is `null`. **This round it does
NOT bite:** all three flat items (1, 3, 6) either collapse surface onto background (3, 6) or — item
1 — carry a distinct `surface #f9fbf8` that the reviewer sees only in the swatches. Item 1's white
surface is exactly the "white now in the palette" claim ROUND.md rows have tracked for three rounds,
and **it is a swatch, not a field.** Worth confirming that is intended before the push.

**J. Filename extensions.** Round 3 flagged five extensionless items. This round **six of seven carry
`.jpg`**; only item 3 (`09/ab67616d0000b27300094a786a28459646be9b20`, carried over from round 3) is
extensionless. `sharp` reads the header, not the name, so decode is unaffected, but
`src/devloop/serve.ts:295` falls back to `application/octet-stream` for an unknown extension, so a
browser preview served through the dev loop **may not display item 3's image**.

**K–M (round 3's class caveats) — status this round.** K (class 7 carried the wrong class) does not
recur: slot 7 carries its stated class. L (item 6 was an illustration, not a photograph) has
**inverted into caveat R below**. M (item 4 was textured, not painted) does not recur — round 4 has
no painted/textured class.

**N. Set-file / run-file pinning.** `p5-round3-fresh.txt` still maps to two setHashes in the run
directory (round-3 §1); this round's row uses `…20260811T112531167Z.jsonl` at setHash `9762…3299`,
the payload hash. `p5-round4-fresh.txt` is new and maps to exactly one hash so far,
`8fa4…f857`. **Pin the run file, not the set name.**

**O. NEW — stop positions were canonicalised to 6 decimals before being written.** The run emits
`0.7598841922774648` (item 2) and `0.4655060465440726` (item 8); `items.json` carries `0.759884` and
`0.465506`. This is not a rounding-away of information: `canonicalPosition` is the server's own
function (`gradient.ts:68`) and `parseCalibrationBatch` applies it at push time regardless
(`batch.ts:93`). Writing it in advance is what makes the dry-run round-trip **byte-identical**, which
the brief required. Round 3 did not need this because all its ramps sat at positions 0 and 1.

**P. NEW — HEAD is `899614d`, the fingerprint says `c5552f8`, and both are correct.** The concurrent
robustness harness committed one file (`data/robustness/reports/p5-fieldfit-0.8.2.json`) during
staging. `git diff c5552f8..899614d -- research/v3/prototypes/p5-fieldfit/` is **empty**, so the
algorithm is identical at both commits and the palettes reproduce at either. **Do not read the
fingerprint/HEAD mismatch as a stale payload**; if the installer prefers the fingerprint to name
HEAD, `899614d` is equally true and the change is a one-line edit in seven places — but it is a
decision, not a fix, and I did not make it.

**Q. NEW — two ramps are 3-stop, which changes the rendered CSS reserve.** The pinned renderer uses a
35% reserve for 2-stop ramps and **10%** for 3-or-more (`gradient.ts:23,30`). Items 2 and 8 render as
`linear-gradient(135deg in oklab, A 10%, B …%, C 100%)`; items 4 and 7 as `… A 35%, B 100%`. Every P5
round before this one was 2-stop only, so **this is the first time two items in one round are shown
against a visibly different ramp geometry from their neighbours.** That is the renderer behaving as
specified, but a reviewer comparing fields across items is comparing two display conventions.

**R. NEW — item 6 is a flat single-colour vector cover, not a vivid illustration.** The inverted gate
encodes flat-and-concentrated, not illustration; it drew a cover with 6 distinct colour bins. Item
6's grade is evidence about a near-solid colour field with an escaped black foreground. §3.2.
**ROUND.md row 6's outcome rule ("UNACCEPTABLE again → item-6 class is structural") cannot be applied
to this item as written**, because it is not the same class of cover round 3 graded. Say so in the
write-up or the round will be read as a like-for-like retest.

**S. NEW — item 6 carries `accentCollapsed: true`, and its palette has two colours total.**
`#2485ba` and `#000000`. (Not a first: round 1's `fc8d58e0af` also collapsed its accent, onto
`#e0d0db`. It is the first since, and the first where *both* collapse flags are true at once.)
The reviewer sees a flat blue field with black type and no
distinguishable accent. If the review UI renders the accent swatch identically to the foreground
swatch, item 6 will look like a rendering bug rather than a collapse. **Confirm the UI shows the
collapse flag before pushing.**

**T. NEW — item 7 is an unstaged second instance of ROUND.md's question (b).** Its accent shortlist
holds the artwork's dominant crimson at rank 2 by mass and publishes the sky blue at rank 1. If the
reviewer notes the accent, that is independent evidence on the same union mechanism item 2 was staged
to probe. **Do not treat an item-7 accent note as unrelated to item 2's verdict.** §3.5.

---

## 7. The item-7 confirmation question — quoted for the installer, with vehicle options

ROUND.md § *Item-7 confirmation question (from round 3's silent STRONG)* reads, verbatim:

> the installer chooses the vehicle (a freetext follow-up item on `a8942d6547`, or a per-item note
> prompt): *"On this cover the palette used the artwork's display-type white and cyan as foreground
> and accent. Was that part of why it worked?"* — escape answer required ("can't tell"). If no
> vehicle fits the kit, drop it rather than build machinery (standing prohibition).

**LOUD — `a8942d6547` is NOT in this payload.** It is
`ab67616d0000b27300125577fb06a6a8942d6547`, round 3's item 7 (`12/…`), whose palette was
`background #120032 / surface #0f002a / foreground #ffffff / accent #009cff` — the white-and-cyan the
question refers to. ROUND.md's round-4 composition table does not include it. So the first-named
vehicle cannot be used as written without changing the round's composition.

The options, stated neutrally for the installer's decision:

1. **Per-item note prompt on a round-4 item** — ROUND.md's own second vehicle, and the only one
   needing no composition change and no machinery. But **no round-4 item has a white-and-cyan
   display-type foreground/accent**, so the question's text would have to be re-pointed at whatever
   item carries it, and re-pointing it changes what it asks. Item 3's `foreground #01bdfd` is the
   nearest thing in the round to "the artwork's display-type cyan" — but its field is cream, not
   dark, and its accent is black, so the question's "white and cyan as foreground and accent" is
   simply false of it. **Re-pointing would misdescribe the palette to the reviewer.**
2. **Add `a8942d6547` back as an eighth (or ninth) item** carrying its v0.8.2 palette, and hang the
   freetext follow-up on it as ROUND.md wrote it. This needs one dev-loop row and one payload entry —
   no machinery — but it grows the round and re-shows a cover the reviewer already graded STRONG,
   which the blinding does not currently account for. It would also interact with the empty slot 5.
3. **Drop the question**, per ROUND.md's own standing prohibition ("If no vehicle fits the kit, drop
   it rather than build machinery"). On the reading that vehicle 1 misdescribes and vehicle 2 changes
   the composition, this is the option ROUND.md's own instruction points at.

**I did not choose.** No follow-up item, note prompt or freetext field appears in `items.json` or
`render-data.json`; the payload is seven plain calibration items. Whichever vehicle the installer
picks, options 1 and 2 are payload edits, not machinery.

---

## 8. Files this staging wrote

Under `review-rounds/round-4/`: `items.json`, `render-data.json`, `STAGING.md` (this file),
`STAGING-REPORT.md`, `ITEM5-QUESTION.md`, `select-fresh-covers.mjs`, `rank.mjs`, `build-payload.ts`,
`check.ts`, `census.json`, `selection.json`.

Plus one new set file: `data/devloop/sets/p5-round4-fresh.txt`.

Plus the four dev-loop run files the instrument wrote itself (§1).

Nothing was committed. Nothing was pushed.


---

# APPENDED — W-STAGE4B, item 5 installed, 2026-08-11 (post-ruling)

## 9. The ruling this section acts on

`ROUND.md` § *APPENDED — staging rulings, 2026-08-11 (pre-release)*, ruling **1**, verbatim:

> **Item 5 = the disclosed near-miss** (`ITEM5-QUESTION.md` cover): zero qualifiers across
> 1,254 censused artworks under the unrelaxed 0.60 gate (ceiling 0.5636); the near-miss (6.1%
> short, disclosed) publishes `#dcdcdc` on `#fafafa` at raw APCA **17.85** — the only known
> cover inside the fg-floor bracket (10.6, 28.9], hence the best possible probe of exactly what
> this slot exists to test. Rule stands; shortfall recorded, not smoothed.

This is **option 2** of `ITEM5-QUESTION.md` §4 — *admit the nominee as item 5, disclosed*. §9.3 below
carries the disclosure the option obliges, verbatim from `ITEM5-QUESTION.md`.

Note for whoever reconciles the two documents later: the ruling says **1,254** censused artworks;
`ITEM5-QUESTION.md`, `STAGING.md` §3 and the set-file header all say the census pool was **1041**
covers (shards `01/`, `02/`, `03/` whole, 1075 files, minus holdout / coverage-set-1 / previously
drawn). W-STAGE4B did not re-run the census and does not know which figure the ruling intended; the
measured pool behind every statistic in this file is **1041**, and the two falsifiable numbers the
ruling turns on — ceiling `markLightShare` **0.5636** and published raw APCA **17.85** — are both
re-confirmed below. Recorded, not resolved.

## 9.1 The run

The cover was re-run through the dev loop rather than copied out of the earlier run file:

```sh
node --experimental-strip-types src/devloop/run.ts \
  --candidate prototypes/p5-fieldfit/candidate.ts \
  --set data/devloop/sets/p5-round4-fresh.txt
# data/devloop/runs/p5-fieldfit-p5-round4-fresh-20260811T114248560Z.jsonl
# 4 ok · 0 failed · 4 cache hits · 0 computed · 63 ms
```

Header verified: `candidateId p5-fieldfit`, `codeVersion
737d1f11667bf8518233591dea9e6c738ee3639bd8a1b5274f65acb5379d3b76`, `sharp 0.33.5`,
`colornames-oklab 0.6.0`, `apca-w3 0.1.9`. The row's own `palette.metadata.algorithmVersion` is
**`p5-fieldfit-0.8.2`** and `preprocessingVersion` is `sharp-0.33.5/srgb/no-resample` — the
fingerprint the other seven items carry. All four rows were cache hits, i.e. the run reproduces the
earlier `…113044607Z.jsonl` palette exactly; nothing was recomputed by hand.

**Palette, verbatim from the run row** — matches the ruling's `#dcdcdc` on `#fafafa`, **no
mismatch, no loud stop**:

```
background #fafafa   surface #fafafa (COLLAPSED)   foreground #dcdcdc   accent #9a9f98
gradient: null      escape: null      accentCollapsed: false
```

`inputContentHash 12ba3e147b0e43167e0a55b86fd1e4d014ecab5546a3726b590b72a4b6a8f1a6`, source rendition
300×300 jpeg, processed 300×300 (no resample).

## 9.2 The insertion

`build-payload.ts` gained one `PLAN` row (`row: 5`, token `10266bb9`, run `R4B` = the run above) in
ROUND.md order — **between `…fc8d58e0af` and `…8395a0f57b`** — and was re-run. The builder copies
fields; nothing here was hand-written into `items.json` or `render-data.json`.

Payload order is now:

```
ab67616d00001e020000269ead63cf2376a6b67d   ab67616d00001e02000022e7e9d11c908479200b
ab67616d0000b27300094a786a28459646be9b20   ab67616d00001e0200000ee5a62175fc8d58e0af
ab67616d00001e0200028475c3197f4510266bb9   ab67616d0000b2730003079010cf188395a0f57b
ab67616d0000b27300012525e62c7f45baf46c90   ab67616d00001e02000227d883fd2cc65408f632
```

The new item, as written:

```json
{
	"itemId": "ab67616d00001e0200028475c3197f4510266bb9",
	"imagePath": "02/ab67616d00001e0200028475c3197f4510266bb9.jpg",
	"variantId": "p5-fieldfit-0.8.2",
	"fingerprint": {
		"algorithmVersion": "p5-fieldfit-0.8.2",
		"preprocessingVersion": "sharp-0.33.5/srgb/no-resample",
		"gitCommit": "c5552f8",
		"dirty": false
	},
	"palette": {
		"background": "#fafafa",
		"surface": "#fafafa",
		"foreground": "#dcdcdc",
		"accent": "#9a9f98",
		"gradient": null,
		"surfaceCollapsed": true,
		"accentCollapsed": false
	}
}
```

and its `render-data.json` entry (names from the one `nameHexes()` call site, `fieldCss` from the
pinned renderer):

```json
{
	"roles": [
		{ "role": "background", "hex": "#fafafa", "name": "Snow", "collapsed": false },
		{ "role": "surface", "hex": "#fafafa", "name": "Snow", "collapsed": true },
		{ "role": "foreground", "hex": "#dcdcdc", "name": "Fog", "collapsed": false },
		{ "role": "accent", "hex": "#9a9f98", "name": "Edamame", "collapsed": false }
	],
	"gradient": null,
	"fieldCss": "#fafafa"
}
```

**The other seven items are untouched.** Diffed against the pre-insertion files: the seven
pre-existing `items.json` entries and their seven `render-data.json` entries are **byte-identical**
after the rebuild.

**Fingerprint re-verified, not assumed.** `dirty: false` and `gitCommit: c5552f8` are still the
measured truth at `HEAD 899614d`:

```sh
git diff c5552f8..HEAD -- prototypes/p5-fieldfit/src prototypes/p5-fieldfit/candidate.ts   # empty
git status --short -- prototypes/p5-fieldfit/src prototypes/p5-fieldfit/candidate.ts       # empty
```

The algorithm diff between the fingerprinted commit and HEAD is empty and the working tree carries no
uncommitted change to either path, so `c5552f8` / `dirty false` describes the code that produced all
eight palettes. (`STAGING-REPORT.md` loud item 5 stands: HEAD moved for the robustness harness only.)

## 9.3 The disclosure this item ships under — verbatim from `ITEM5-QUESTION.md`

Quoted, not paraphrased. This is what the ruling means by *"shortfall recorded, not smoothed"*, and
it is the text any write-up of item 5's grade must carry.

> **Pool: 1041 covers** — a census over shards `01/`, `02/`, `03/` taken whole, with the holdout, all
> of coverage-set-1, and every cover any earlier P5 round drew excluded first (STAGING.md §3.0b).
> […]
> **Survivors of all three terms: 0.**

> - Highest `markLightShare` among the 136 light *and* neutral fields: **0.5636**.
> - Highest `markLightShare` anywhere in the pool: **0.9211** — on covers that are not light fields.

> **The shortfall is 0.0364 on `markLightShare`, i.e. 6.1% short of the gate.** Round 3's shortfall was
> 0.150. Stated loudly: this cover **does not clear the stated rule**.

> ### The honest problem with the nominee, which is NOT a threshold problem
>
> **This cover does not exhibit the class.** ROUND.md row 5 wants a *light field carrying light text*,
> to test foreground legibility when the artwork's own ink is light. The nominee is a light field
> carrying a **darker inset photograph**. That is precisely why `markLightShare` stops at 0.5636: the
> marks against the white field are the photo, and the photo is mostly darker than the paper. Admitting
> it does not answer ROUND.md's artwork-side question. **A reader told "round 4 tested light ink on a
> light field" would be misled.** I will not smooth this over.

> - **artwork-side** ("does the corpus contain light ink on light fields?") — **still unanswered**, at
>   1041 covers as at 213. This may be a fact about album artwork rather than a sampling accident.
> - **palette-side** ("does the legibility floor hold when the field is light?") — **answered, and
>   answered badly**: the floor let a 1.19× ratio through and published near-invisible ink.

Its rule-term table, verbatim:

> | statistic | value | rule term | verdict |
> |---|---|---|---|
> | `fieldMedianL` | **1.0000** | ≥ 0.75 | passes, at the ceiling |
> | `fieldMedianC` | **0.0000** | ≤ 0.06 | passes, at the floor |
> | `markLightShare` | **0.5636** | ≥ 0.60 | **FAILS by 0.0364** |
> | `markFrac` | 0.0537 | (round-3's ≥ 0.03) | would pass |
> | `flatFrac` | 0.7825 | — | |
> | `topBinShare` | 0.8157 | — | |
> | `vividFrac` | 0.0000 | — | |

And the artwork description, so no later reader has to take the class claim on trust:

> A pure-white field with a small photograph pasted into the upper-middle third — a hazy harbour or
> river under an overcast sky, a city skyline on the far bank, a white railing across the near
> foreground — with a strip of translucent tape over the photo's top edge. Wide white margins all
> round. No display type anywhere.

**So: item 5's grade is evidence about the foreground legibility floor. It is not evidence about
light ink on a light field — that class remains un-evidenced at 1041 covers.** ROUND.md row 5's
outcome rule ("fg complaint about light ink → the bracket gets its light-field evidence") therefore
applies only in its palette-side half.

Cross-class safety, from `ITEM5-QUESTION.md`: the nominee was withheld from classes 6–8 during
selection, so its admission cannot collide with items 6, 7 or 8 — and the 8 unique-itemId check
below confirms it did not.

## 9.4 Item 5's diagnostics, in full

`node --experimental-strip-types prototypes/p5-fieldfit/diagnose.ts 02/ab67616d00001e0200028475c3197f4510266bb9.jpg`

The four numbers `ITEM5-QUESTION.md` §3 quoted are re-confirmed here unchanged: `noField false`,
`fieldExplainedFraction 0.828`, `residualScale 0`, `retreat false`, and
`foregroundLegibility: minRawApca 17.854, floor 15, ratio 1.19` — **17.854 inside ROUND.md row 5's
(10.6, 28.9] bracket**, the only item in the round that is. The foreground shortlist shows the
choice the floor permitted: `#dcdcdc` at raw APCA 17.85 was taken over `#d3d3d1` (23.11), `#ccccca`
(27.08), `#c5c6c0` (30.71) and `#babbb5` (36.77) — the mass ordering won, the floor did not object.
The accent shortlist is the other half of §3's claim: `#9a9f98` at 52.06 was published and `#69746c`
at 73.46 sat below it. Note also `assignment.families`: rank 1 is `#ffffff` at 0.8233 mass fraction,
and the published foreground is family rank 2 at 0.0136.

```json
{
  "image": "/Users/Flo/GitHub/palette/.worktrees/p5-fieldfit/02/ab67616d00001e0200028475c3197f4510266bb9.jpg",
  "size": "300×300",
  "fieldOrder": 0,
  "diagnostics": {
    "noField": false,
    "inlierFraction": 0.8094555555555556,
    "fieldExplainedFraction": 0.8277666666666667,
    "fieldComponents": 0,
    "retreat": false,
    "residualScale": 0,
    "marginBars": -1.4465446574920616e-14,
    "orientationMargin": 0,
    "gradient": false,
    "excursionMax": 0,
    "thirdStopAccepted": false,
    "residualExcursion": 0,
    "twoBlockFallback": false,
    "accentChromaOnly": false,
    "offArtwork": {
      "background": false,
      "surface": false,
      "foreground": false,
      "accent": false
    },
    "escape": false
  },
  "continuity": null,
  "pathExcursion": null,
  "margins": {
    "pairs": [
      {
        "pair": "background×surface",
        "colors": "#fafafa/#fafafa",
        "distance": 0,
        "bar": 0.01627,
        "ratio": 0,
        "collapsed": true
      },
      {
        "pair": "foreground×accent",
        "colors": "#dcdcdc/#9a9f98",
        "distance": 0.19849,
        "bar": 0.07444,
        "ratio": 2.666,
        "collapsed": false
      },
      {
        "pair": "foreground×background",
        "colors": "#dcdcdc/#fafafa",
        "distance": 0.09061,
        "bar": 0.01627,
        "ratio": 5.569,
        "collapsed": false
      },
      {
        "pair": "foreground×surface",
        "colors": "#dcdcdc/#fafafa",
        "distance": 0.09061,
        "bar": 0.01627,
        "ratio": 5.569,
        "collapsed": true
      },
      {
        "pair": "accent×background",
        "colors": "#9a9f98/#fafafa",
        "distance": 0.289,
        "bar": 0.01627,
        "ratio": 17.762,
        "collapsed": false
      },
      {
        "pair": "accent×surface",
        "colors": "#9a9f98/#fafafa",
        "distance": 0.289,
        "bar": 0.01627,
        "ratio": 17.762,
        "collapsed": true
      }
    ],
    "foregroundLegibility": {
      "minRawApca": 17.854,
      "floor": 15,
      "ratio": 1.19
    },
    "accentTwin": {
      "distance": 0.19849,
      "bar": 0.01627,
      "ratio": 12.2,
      "exclusionMultiple": 8,
      "clearance": 1.525,
      "collapsed": false
    }
  },
  "assignment": {
    "shortlistSize": 5,
    "familyCount": 4,
    "enumerated": 30,
    "feasible": 30,
    "totalFamilies": 21,
    "massRetained": 0.8719,
    "families": [
      {
        "rank": 1,
        "hex": "#ffffff",
        "massFraction": 0.8233,
        "members": 23
      },
      {
        "rank": 2,
        "hex": "#dcdcdc",
        "massFraction": 0.0136,
        "members": 51
      },
      {
        "rank": 3,
        "hex": "#d3d3d1",
        "massFraction": 0.0069,
        "members": 38
      },
      {
        "rank": 4,
        "hex": "#ccccca",
        "massFraction": 0.0055,
        "members": 36
      }
    ],
    "fieldCovered": [
      1
    ],
    "coverage": 2,
    "covered": [
      1,
      2
    ],
    "coverageDecided": false,
    "perRoleOnly": {
      "foreground": "#dcdcdc",
      "accent": "#9a9f98",
      "coverage": 2
    },
    "foregroundShortlist": [
      {
        "hex": "#dcdcdc",
        "source": "overlay",
        "mass": 1460,
        "minRawApca": 17.85
      },
      {
        "hex": "#d3d3d1",
        "source": "overlay",
        "mass": 966,
        "minRawApca": 23.11
      },
      {
        "hex": "#ccccca",
        "source": "overlay",
        "mass": 688,
        "minRawApca": 27.08
      },
      {
        "hex": "#c5c6c0",
        "source": "overlay",
        "mass": 607,
        "minRawApca": 30.71
      },
      {
        "hex": "#babbb5",
        "source": "overlay",
        "mass": 497,
        "minRawApca": 36.77
      }
    ],
    "accentShortlist": [
      {
        "hex": "#9a9f98",
        "source": "overlay",
        "mass": 336,
        "minRawApca": 52.06
      },
      {
        "hex": "#a4a7a0",
        "source": "overlay",
        "mass": 325,
        "minRawApca": 47.7
      },
      {
        "hex": "#aeb2b1",
        "source": "overlay",
        "mass": 323,
        "minRawApca": 41.78
      },
      {
        "hex": "#a9b2b1",
        "source": "overlay",
        "mass": 280,
        "minRawApca": 42.32
      },
      {
        "hex": "#69746c",
        "source": "overlay",
        "mass": 261,
        "minRawApca": 73.46
      }
    ]
  },
  "componentCandidates": [],
  "attempts": null,
  "palette": {
    "background": "#fafafa",
    "surface": "#fafafa",
    "foreground": "#dcdcdc",
    "accent": "#9a9f98",
    "gradient": null,
    "geometry": null,
    "collapse": {
      "surfaceCollapsed": true,
      "accentCollapsed": false
    },
    "escape": null
  }
}
```

## 9.5 Re-validation — the FULL battery, now over 8 items

`check.ts` was re-run unmodified except for its item-count constant (`N === 7` → `N === 8`); every
other check is the round-3 §5 battery plus this round's push-fingerprint and leak-scan additions,
exactly as `STAGING-REPORT.md` recorded them. It includes the `parseCalibrationBatch` dry run with
the byte-identical round-trip and the leak scan.

```
PASS  items.json parses as an array of 8 — 8 items
PASS  8 unique itemIds
PASS  every itemId is a server-legal id token
PASS  every itemId is a full 40-hex stem
PASS  every hex matches ^#[0-9a-f]{6}$ — 42 hexes checked, bad: none
PASS  every imagePath exists under the MAIN checkout — 8/8 resolve
PASS  no imagePath is absolute
PASS  every itemId is its imagePath's filename stem
PASS  gradient ends are background -> surface — 4 gradient items
PASS  gradient positions in [0,1] and strictly increasing at 6 dp
PASS  gradient ends sit at 0 and 1
PASS  gradient stop counts within 2..4
PASS  no gradient carries a non-string geometry
PASS  every item has both collapse booleans and required fields
PASS  collapse flags agree with hex equality (surface~background, accent~foreground)
PASS  items.json items carry exactly the 5 push keys
PASS  fingerprint is uniform and names v0.8.2 at c5552f8, dirty false
PASS  render-data has one entry per itemId
PASS  every render entry has 4 named roles in order
PASS  render hexes and collapse flags match items.json verbatim
PASS  render names are the current colornames-oklab output
PASS  fieldCss is the pinned renderer's output for every item
PASS  render entries carry exactly roles/gradient/fieldCss
PASS  no diagnostics / mechanism labels / version labels in any served field — clean
PASS  the "E2" mechanism label, word-bounded and case-sensitive
PASS  "e2" over the served colour NAMES only (hex-free text) — names: 34 words
PASS  parseCalibrationBatch OK: 8 items, purpose calibration
PASS  round-trip identical (palettes byte-identical after parse)

ALL CHECKS PASSED
```

**28/28 PASS over 8 items** — including `parseCalibrationBatch OK: 8 items, purpose calibration`,
`round-trip identical (palettes byte-identical after parse)`, and a clean leak scan over 42 hexes and
34 name words. No check was removed, weakened or skipped.

## 9.6 Files W-STAGE4B touched

Under `review-rounds/round-4/`: `items.json` (7 → 8 items), `render-data.json` (7 → 8 entries),
`build-payload.ts` (one `PLAN` row + one run constant), `check.ts` (item-count constant 7 → 8),
`STAGING.md` (this §9), `STAGE4B-REPORT.md` (new).

Plus one comment appended to `data/devloop/sets/p5-round4-fresh.txt` recording the ruling. The
cover's path was **already** line 27 of that set file (W-STAGE4 ran it there as the nominee), so
nothing was added to the set itself — appending the path again would have created a duplicate run
row. The comment says the fourth line is now a payload item.

Plus one dev-loop run file the instrument wrote itself:
`data/devloop/runs/p5-fieldfit-p5-round4-fresh-20260811T114248560Z.jsonl` (§9.1). This is outside
`review-rounds/round-4/` — it is the runner's own output location and the only file W-STAGE4B caused
to appear outside its write scope; recorded here rather than passed over.

§8's file list above is W-STAGE4's and is left as written; this section supersedes its "seven plain
calibration items" only as to the count. **The round is now EIGHT items.** The item-7 confirmation
question (§7) was dropped by ROUND.md ruling 3 and no vehicle was added here.

Nothing was committed. Nothing was pushed.
