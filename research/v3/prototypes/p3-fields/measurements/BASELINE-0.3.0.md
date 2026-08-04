# P3 — measurement baseline, 0.3.0

`candidateId` **p3-fields-0.3.0**, measured 2026-08-04/05 by W9. Nothing here gates anything. It
records what the standing instruments say about the candidate at commit `bead404`, the exact command
lines that produced each number, and how each number moved against the **0.1.0 full baseline**
(`BASELINE.md`, same worktree, same instrument, same sets).

Four readings:

1. **Robustness** — full 200 rendition pairs + 400 perturbation trials, no `--limit`.
2. **Adjudication** — the 197 evidence-bearing artworks. A dev aid; gates nothing; directional only.
3. **Coverage breadth** — the whole of `coverage-set-1` (220 artworks), with the `P3_DIAG` chain on.
4. **Gradient-round data** — the best rank correlation per artwork and what got published at ρ\* 0.62.

---

## Candidate git state

| | |
|---|---|
| worktree | `/Users/Flo/GitHub/palette/.worktrees/p3-fields` |
| branch | `proto/p3-fields` |
| HEAD | `bead4041cfc41c66dd6393ef64e962457a5c7e83` — *p3-fields 0.3.0: ends band-then-cascade, ink lump fix, role swap, rho\* 0.62* |
| **working tree** | **clean with respect to `src/`** — unlike the 0.1.0 baseline, every measured byte is committed at `bead404`. `git status --short` showed 10 entries at the end of measurement, all of them **files this pass created**: the nine new `measurements/*-0.3.0.*` artefacts plus the untracked `research/v3/data/devloop/p3-diag-coverage-0.3.0/` diagnostics directory. |
| candidate `codeVersion` | `1cc28c1efb1f38de1806daab20029d1565c5f6b5eb930337f3bc0dd6e91b4849` (dev-loop content hash of the module graph; 0.1.0's was `aeb70ab0…`) |
| node | v25.8.1 · sharp 0.33.5 / sharp-modern 0.35.3 · apca-w3 0.1.9 · colorjs.io 0.5.2 · colornames-oklab 0.6.0 · typescript 5.6.2 |

`check.ts` still writes no git fingerprint of its own; the line above is recorded by hand.

**Environment.** The corpus symlinks W4 created for the 0.1.0 pass (`{00..15}`, `music-artworks`,
`images/*` → the main checkout) are still in place and are the reason every path resolves; without
them `check.ts` and `run.ts` cannot see the corpus from this worktree. Instrument side effects, all
inside `research/v3/data/**`: the 400 perturbed images under `data/robustness/cache/` were **reused**,
not regenerated (identical `perturbationSet` sha256 to the 0.1.0 run), and 222 diagnostics records
were written under `data/devloop/p3-diag-coverage-0.3.0/` and `…/p3-diag-lostwins-0.3.0/`.

**The comparison is apples to apples.** Both runs read the same three inputs, byte for byte:

| input | sha256 |
|---|---|
| `data/robustness/pair-set-1.json` | `a1a5a83b4274c027…` |
| `data/robustness/perturbation-set-1.json` | `31c58f039e9b12e2…` |
| `data/warehouse/warehouse.jsonl` | `dbe648cc382bd63c…` |

Reviewedness labels in both: live warehouse, 113 reviewed artworks, 0 relabelled since the draw.

---

## 1. Robustness — the full run

```sh
cd /Users/Flo/GitHub/palette/.worktrees/p3-fields/research/v3

NODE_NO_WARNINGS=1 node --experimental-strip-types src/robustness/check.ts \
  --candidate prototypes/p3-fields/src/candidate.ts \
  --out prototypes/p3-fields/measurements/robustness-p3-fields-0.3.0.json \
  --emit-diff-set prototypes/p3-fields/measurements/robustness-disagreeing-images-0.3.0.txt
```

600 trials, **no `--limit`**, default concurrency 4, bar mode `regional`, all four roles,
**0 errored trials**, 1745.0 s wall. Console: `robustness-console-0.3.0.txt`.

### Agreement, against the 0.1.0 full baseline

| group | 0.1.0 | 0.3.0 | 95% Wilson (0.3.0) | Δ |
|---|---|---|---|---|
| **overall** | 18.2% (109/600) | **16.8% (101/600)** | 14.1–20.0 | **−1.4 pp** |
| rendition pairs | 14.5% (29/200) | **9.0% (18/200)** | 5.8–13.8 | **−5.5 pp** |
| `jpeg-q92` | 28.0% (28/100) | **34.0% (34/100)** | 25.5–43.7 | **+6.0 pp** |
| `jpeg-q85` | 17.0% (17/100) | **14.0% (14/100)** | 8.5–22.1 | **−3.0 pp** |
| `jpeg-q75` | 17.0% (17/100) | **13.0% (13/100)** | 7.8–21.0 | **−4.0 pp** |
| `dither-lsb1` | 18.0% (18/100) | **22.0% (22/100)** | 15.0–31.1 | **+4.0 pp** |

**The smoke expectation is confirmed on the full sample.** The 0.2.0/0.3.0 150-trial smokes
suggested q92 and dither improving while q85 and q75 regressed; the full run reproduces the sign of
all four moves (smoke q92 28.0→23.7→36.8, dither 18.0→27.0→32.4, q85 17.0→7.9→7.9,
q75 17.0→16.2→8.1). The full-run magnitudes are smaller than the smoke's on every arm, which is what
a 38-trial-per-arm sample should do. **No individual arm's 95% interval excludes the 0.1.0 point
estimate**, so each arm on its own is a direction, not a demonstration; the pattern is the finding,
not any one cell.

What the smokes did **not** show, because they carried no rendition pairs (`compared = 0`): the
**rendition-pair arm fell by 5.5 points, 14.5% → 9.0%**, and it is the largest single-arm move in the
table. Rendition pairs are the arm closest to a real deployment question (two files of one artwork),
and they are also where 0.3.0's all-four-role flips are concentrated (54 of 88).

### Reviewed vs unseen (overfit ratio)

| basis | 0.1.0 | 0.3.0 | reviewed | unseen |
|---|---|---|---|---|
| **perturbation** (50/50 by construction — the reportable one) | 1.286× | **1.128×** | 22.0% [16.8–28.2] (44/200) | 19.5% [14.6–25.5] (39/200) |
| rendition-pair | 0.679× **UNDERPOWERED** | **0.000× UNDERPOWERED** | 0.0% [0.0–27.8] (0/10) | 9.5% [6.1–14.5] (18/190) |

Healthy is ≈ 1.0; v2-3 measured 1.61×. The perturbation ratio moved **toward** 1.0 (1.286 → 1.128),
which is the direction wanted, and the intervals overlap heavily so it is not evidence of anything on
its own. The rendition-pair ratio is 0.000× only because its reviewed cell is **10 trials with zero
agreements**; it carries no information and must not be read as a number.

### Role instability (share of the 600 comparisons where the role moved)

| role | 0.1.0 | 0.3.0 | Δ |
|---|---|---|---|
| background | 31.2% (187/600) | **24.2% (145/600)** | −7.0 pp |
| surface | 51.0% (306/600) | **45.0% (270/600)** | −6.0 pp |
| foreground | 54.8% (329/600) | **54.2% (325/600)** | −0.6 pp |
| accent | 63.5% (381/600) | **69.5% (417/600)** | **+6.0 pp** |

Three roles got steadier and **accent got worse**. Accent is now the worst-moving role in 250 of the
499 disagreements (0.1.0: 168 of 491), and `accent` alone is the whole disagreement in 85 trials.

### Whole-palette flips

| roles that moved | 0.1.0 | 0.3.0 |
|---|---|---|
| 1 | 126 | 142 |
| 2 | 132 | 144 |
| 3 | 119 | 125 |
| **4 (all-four flip)** | **114** | **88** |
| total disagreeing trials | 491 | **499** |

**All-four-role flips fell from 114 to 88 (−23%).** That is 0.3.0's clearest win: the "whole palette
inverts on near-neutral high-contrast artwork" failure that dominated the 0.1.0 postmortem is
materially less common. The trade is visible in the same table — one more trial disagrees overall
(491 → 499), but the disagreements are *smaller*: 70 of 499 now sit under 2× the bar (0.1.0: 61 of
491), and the median worst-role movement rose only slightly (0.150 → 0.165 OKLab).

0.3.0's all-four flips by arm: rendition-pair 54, dither 13, q75 10, q85 8, q92 3
(0.1.0: rendition-pair 64, dither 15, q75 15, q92 11, q85 9).

### The q85/q75 regression — the five worst q75 cases

The regression is real (q75 17.0% → 13.0%, 87 disagreeing trials against 83). The five worst q75
disagreements, ranked by the raw OKLab movement of the worst-moving role
(`worst-disagreements.mjs`-style ranking, filtered to the arm; the harness's `worstRoleBarRatio` in
brackets). The right-hand file of every perturbation trial is the materialised
`data/robustness/cache/jpeg-q75/<hash>.jpeg-q75.perturbed.jpg`.

| # | OKLab | ×bar | worst role | movement | roles moved | reviewedness | artwork |
|---|---|---|---|---|---|---|---|
| 1 | **0.8032** | 35.0 | background | `#eefb87` → `#0e0e0e` | all four | **reviewed** | `04/ab67616d0000b273000442caec7ec8cb724bf265` |
| 2 | 0.7239 | 31.6 | background | `#d3f113` → `#1c1827` | all four | unseen | `05/ab67616d00001e020005ab1795e9ac7793fe109d` |
| 3 | 0.7072 | 37.7 | background | `#dffad9` → `#212224` | all four | unseen | `music-artworks/b/3/f/b3fae10d59aa74b6c3699562966e1bc1.jpg` |
| 4 | 0.6453 | 39.7 | foreground | `#b8bcbb` → `#000e0b` | all four | unseen | `11/ab67616d0000b27300112616baa5515c8c43aee1` |
| 5 | 0.5997 | 36.9 | accent | `#e1e6e0` → `#253a1b` | surf+fg+accent | **reviewed** | `03/ab67616d00001e020003e50500c5d762da89643a.jpg` |

Per-role detail for the five, in order:

1. bg `#eefb87`→`#0e0e0e` (0.803) · surf `#31ca24`→`#abf854` (0.172) · fg `#0e0d09`→`#12790c` (0.377) · accent `#0e0d09`→`#1ad315` (0.643)
2. bg `#d3f113`→`#1c1827` (0.724) · surf `#1d1135`→`#23417f` (0.184) · fg `#d63872`→`#d3f904` (0.484) · accent `#c12593`→`#da3cb5` (0.075)
3. bg `#dffad9`→`#212224` (0.707) · surf `#2e2828`→`#dffad9` (0.676) · fg `#d7e9d3`→`#9a6fb4` (0.337) · accent `#d7e9d3`→`#3e282a` (0.613)
4. bg `#162a29`→`#212f2f` (0.026) · surf `#535a53`→`#49524d` (0.030) · fg `#b8bcbb`→`#000e0b` (0.645) · accent `#02130d`→`#000e0b` (0.022)
5. surf `#c5c9b2`→`#d3d7c0` (0.043) · fg `#e1e6e0`→`#4d633f` (0.451) · accent `#e1e6e0`→`#253a1b` (0.600)

Three observations for the next iteration, stated as what the rows show and nothing more:

- **The top three are still whole-palette light↔dark inversions, and now they are led by the
  *background*.** In 0.1.0 the flip was led by foreground (179 of 491 worst-role) or accent (168);
  in these q75 cases the field end itself moves from a light near-neutral to near-black. The
  band-then-cascade change at the field ends did not remove this class from q75.
- **Cases 1–3 are all high-chroma-plus-near-neutral covers** where the two field ends are far apart
  in L and the ordering between them is what flips — the ends swap, and everything downstream
  re-derives against the swapped ramp.
- **Cases 4 and 5 are a different, smaller failure**: the two field ends barely move (0.026, 0.030,
  0.043) and a *text* role jumps the whole lightness axis under a stable field. That is the text-role
  search re-deciding, not the ends.

### Timing

| | 0.1.0 | 0.3.0 |
|---|---|---|
| wall | 1651.8 s (`--concurrency 8`) | **1745.0 s (concurrency 4, the default)** |
| `timing.candidateMillis` | 10 755 s | 5 699 s |

Wall time is comparable; **`candidateMillis` is not** — see instrument note 1 below. Do not read
"0.3.0 is twice as fast in the candidate" out of that row.

---

## 2. Adjudication — dev aid, gates nothing

```sh
cd /Users/Flo/GitHub/palette/.worktrees/p3-fields/research/v3

NODE_NO_WARNINGS=1 node --experimental-strip-types src/devloop/run.ts \
  --candidate prototypes/p3-fields/src/candidate.ts \
  --set prototypes/p3-fields/measurements/adjudicated-197.txt \
  --workers 4 \
  --out prototypes/p3-fields/measurements/run-adjudicated-197-0.3.0.jsonl
# 197 ok · 0 failed · 1 cache hit · 196 computed · 87 172 ms

node prototypes/p3-fields/measurements/to-adjudication.mjs \
  prototypes/p3-fields/measurements/run-adjudicated-197-0.3.0.jsonl \
  prototypes/p3-fields/measurements/adjudication-input-197-0.3.0.jsonl
# rows=197 ok=197 errored=0

NODE_NO_WARNINGS=1 node --experimental-strip-types src/adjudication/cli.ts \
  run prototypes/p3-fields/measurements/adjudication-input-197-0.3.0.jsonl
NODE_NO_WARNINGS=1 node --experimental-strip-types src/adjudication/cli.ts \
  run prototypes/p3-fields/measurements/adjudication-input-197-0.3.0.jsonl \
  --format json --out prototypes/p3-fields/measurements/adjudication-197-0.3.0.json
```

The set is unchanged: the same 197 artworks carrying standing v2-3 reviewer evidence (554 entries
over `endorsements.json` 351 / `known-bad.json` 37 / `acceptable.json` 166). 197 palettes parsed, 197
carried the full contract, 0 lines refused. Bar `regional`, all four roles, era v2-3 (the v3
warehouse still holds 0 entries).

| | 0.1.0 | 0.3.0 |
|---|---|---|
| **W** — endorsement matches | **3** candidates · 4 entries · 3 artworks | **1** candidate · 1 entry · 1 artwork |
| **L** — known-bad matches | **0** | **0** |
| baseline — `acceptable` matches | 0 | 0 |
| **NS** — differed | 194 | **196** |
| conflicts touched | 0 | 0 |
| reachability | not assessed (419 comparisons) | not assessed (418 comparisons) |

> ### CAVEAT — read this before reading the table above
>
> **The legacy warehouse contradicts itself at configuration level: 27 of 128 paired comparisons are
> exact ties filed under different tiers. These counts are directional, never a score.**

The surviving win is `images/slipknot.jpg` (endorsement `5cd3c20c508accc0`, basis all-four-roles;
0.3.0 publishes `#000000`/`#000000`/`#ffffff`/`#ffffff` where 0.1.0 published `#fefefe` for the two
text roles). The two lost wins, with what moved:

| artwork | 0.1.0 palette (matched) | 0.3.0 palette | what the diagnostics say |
|---|---|---|---|
| `09/ab67616d00001e020009657a5122a7b3d40458b0` (two endorsements at once, all-four-roles basis) | bg `#fffbf2` · surf `#fffbf2` · fg `#2a4b20` · accent `#0c1c11` | bg `#fffbf2` · surf `#fffbf2` · fg `#0f2115` · accent `#233f19` | field ends unchanged (`endsStep 0`, surface collapsed in both). The **foreground search walked to cursor 7** — deep into the second regime — and the accent to cursor 3. `roleSwapApplied: false`. |
| `images/placebo.jpg` (present-roles-only basis, accent `#d01510`) | bg `#efe3c9` · surf `#405956` · fg `#101211` · accent `#ca150e` | bg `#65888c` · surf `#dbb797` · fg `#131514` · accent `#472f23` | **`endsStep 6`** — the field ends stepped six times before verifying, so the entire palette re-derived against different ends. `roleSwapApplied: false`. |

**Neither lost win is the 0.3.0 role-swap comparator.** It did not fire on either artwork (checked
directly with `P3_DIAG` over a two-image set). The losses trace to the two other 0.3.0 changes: a
deeper foreground search on one, and the ends verify-and-step loop landing somewhere else on the
other.

### Contract validity on the same 197 artworks — the reading that did improve

`audit/rescore.ts` over both run files (same set, same contract, same code path):

| | 0.1.0 | 0.3.0 |
|---|---|---|
| PASS | 178 / 197 | **184 / 197** |
| FAIL | 19 | **13** |

---

## 3. Coverage breadth — all of `coverage-set-1`

The set file was built from `data/coverage-set/coverage-set-1.json` (setId `coverage-set-1`, seed
`0xc0efface`), taking each artwork's chosen rendition path — **all 220 rows, 200 `core` + 20
`enrichment`**, no filtering. All 220 paths resolve inside the worktree. Note for anyone computing a
*rate* off this run: `COVERAGE_SET.md` says the 20 enrichment artworks "are not part of the core and
never enter a rate"; the rates below are over all 220 because the task asked for breadth over the
whole file, and the enrichment slice is 9% of it.

```sh
cd /Users/Flo/GitHub/palette/.worktrees/p3-fields/research/v3

# the set: prototypes/p3-fields/measurements/coverage-set-1-220.txt   (220 repo-relative paths)
mkdir -p data/devloop/p3-diag-coverage-0.3.0
P3_DIAG=$PWD/data/devloop/p3-diag-coverage-0.3.0 \
NODE_NO_WARNINGS=1 node --experimental-strip-types src/devloop/run.ts \
  --candidate prototypes/p3-fields/src/candidate.ts \
  --set prototypes/p3-fields/measurements/coverage-set-1-220.txt \
  --workers 4 --no-cache \
  --out prototypes/p3-fields/measurements/run-coverage-220-0.3.0.jsonl
# 220 ok · 0 failed · 0 cache hits · 220 computed · 83 251 ms
```

`--no-cache` is deliberate: a cache hit returns a stored palette without running the pipeline, so it
would produce neither a diagnostics record nor a real `computeMs`.

Run id `p3-fields-0.3.0-coverage-set-1-220-20260804T220250458Z`, set hash
`9cf1eec630b7cc9e…`, `codeVersion 1cc28c1e…`.

### Rows

| | |
|---|---|
| ok | **220** |
| failed | **0** — no row carried an error |

### Contract scorecard (`src/contract/scorecard.ts`, no `source` option)

| | |
|---|---|
| PASS | **198 / 220 (90.0%)** |
| FAIL | **22 / 220 (10.0%)** |

Failing-invariant histogram (a row can carry more than one code):

| count | invariant : code |
|---|---|
| 19 | `I4 : I4.ramp-below-contrast-floor` |
| 3 | `I4 : I4.below-contrast-floor` |
| 2 | `I3 : I3.pair-not-distinct` |

The 22 failing rows:

```
7/0877cba57e0ec2d3c070e98f370f0e14.jpg                  I4.ramp-below-contrast-floor
0/260e1f491e4632305e7924462efc37c2.jpg                  I4.ramp-below-contrast-floor
8/2f8d0a41491891a8f466e28d7523d0be.jpg                  I4.ramp-below-contrast-floor
0/490ed4bb7956fb50aec1d08f3c13936a.jpg                  I4.ramp-below-contrast-floor
a/4eabe50e5fd72ab1161dd49fb4cdad65.jpg                  I4.ramp-below-contrast-floor
3/5c3c609f3022d34b57fbb2db52368016.jpg                  I4.ramp-below-contrast-floor
d/64db67de0a6d9ec0e1ec350bca5fdcd6.jpeg                 I3.pair-not-distinct, I4.below-contrast-floor
3/cc35f7f97c2c503a2812639457eae265.jpg                  I4.ramp-below-contrast-floor
01/ab67616d00001e02000126901c035d549c66ecc6.jpg         I4.ramp-below-contrast-floor
02/ab67616d00001e020002881a851f1e14c374562b.jpg         I4.ramp-below-contrast-floor
04/ab67616d0000b27300041947bcd0fc6b725a1fa2             I4.ramp-below-contrast-floor
0b/ab67616d00001e02000b09dc3945856aa26d231b             I4.ramp-below-contrast-floor
0d/ab67616d0000b273000d421bbe8403f031d09c57             I4.ramp-below-contrast-floor
0d/ab67616d0000b273000df8aaf4e987d42fda60de             I4.below-contrast-floor
0e/ab67616d00001e02000ea4559c7271bdcd9b56cb             I4.ramp-below-contrast-floor
0e/ab67616d0000b273000eb3826df233141af8322f             I4.ramp-below-contrast-floor
10/ab67616d00001e02001000ccca6b014c289b10fa             I4.ramp-below-contrast-floor
10/ab67616d00001e0200107f007fece44f1510fefc             I4.ramp-below-contrast-floor
12/ab67616d00001e0200120329603b7a4f0b3399f6             I3.pair-not-distinct, I4.below-contrast-floor
13/ab67616d00001e0200134d831ec9c6b59d442e5f             I4.ramp-below-contrast-floor
13/ab67616d00001e020013d322d1bc6a020541cfbd             I4.ramp-below-contrast-floor
14/ab67616d0000b2730014df1acc5765c8fe76036a             I4.ramp-below-contrast-floor
```

**19 of the 22 failures are one code**: a published gradient stop fails the ramp contrast floor.
Every one of those 19 rows published a gradient. That single code is the whole difference between a
90% and a ~99% scorecard on this set.

### Rates over the 220 published palettes

| | count | rate |
|---|---|---|
| gradient published | 86 / 220 | **39.1%** |
| surface collapsed | 24 / 220 | **10.9%** |
| accent collapsed | 19 / 220 | **8.6%** |
| escape taken | 0 / 220 | **0.0%** |

Gradient stop-count histogram: 2 stops ×45, 3 stops ×13, 4 stops ×28 (i.e. 41 of 86 gradients carry
at least one inserted guide stop).

### Decision-chain split (`P3_DIAG`, 220 / 220 records written)

| | split |
|---|---|
| **foreground regime** | **ink 111 (50.5%) · luminance 109 (49.5%) · escape 0** |
| luminance polarity, `decidedBy` | `trimmed-contrast` 101 · `darker-convention` 8 |
| ink lump clause, `chosen` | `extreme-lump` 80 · `darker-convention` 21 · `whole-population` 10 |
| ink contrast preference applied | 63 of 111 |
| **role-swap comparator fired** | **80 / 220 = 36.4%** |
| field set rule | `beta-quantile` 126 · `degenerate-depth` 94 (42.7%) |
| accent tier | tier 1 ×183 · tier 2 ×18 · none (collapsed) ×19; `fragile` 18 |
| repairs per image | 0 ×167, 1 ×4, 2 ×1, 3 ×3, 4 ×1, 5 ×7, 6 ×5, 7 ×5, 8 ×3, 9 ×3, 10 ×1, 12 ×2, **13 ×18** |

Two things worth carrying forward. **The role-swap comparator is not a rare corrective: it fires on
more than a third of the corpus.** And **the repair loop is bimodal** — 167 images need no repair at
all, and 18 exhaust the cursor limit (13 repairs) without the contract ever being satisfied.
`degenerate-depth`, 0.3.0's stated no-plateau case, is 43% of the set, not an edge case.

### Runtime (`computeMs` per row, 220 computed, 4 worker threads on a 14-core machine)

| min | p25 | median | p95 | max | mean | wall for 220 |
|---|---|---|---|---|---|---|
| 97 ms | 589 ms | **855 ms** | **5726 ms** | 13 089 ms | 1480 ms | 83.3 s |

The spread is resolution, not content: the set holds everything from 300 px to 3600 px.

---

## 4. Gradient-round data — `gradient-borderline-0.3.0.json`

Every one of the 220 diagnostics chains carries `gradient.bestSpearmanRho` (the winning rank
correlation) and `gradient.isGradient` (whether it cleared ρ\* = `GRADIENT_RANK_CORRELATION` = 0.62).

Distribution of best ρ over all 220 artworks:

| min | p10 | median | p90 | max |
|---|---|---|---|---|
| 0.000 | 0.156 | **0.567** | 0.782 | 0.977 |

| within of ρ\* = 0.62 | artworks |
|---|---|
| ±0.02 | **15** |
| ±0.05 | **38** |
| ±0.10 | **78** |

**The threshold sits close to the middle of the distribution.** The median artwork is 0.053 below
ρ\*, and 78 of 220 (35%) are within ±0.10 of it — so the flat-vs-gradient decision is genuinely
contested across a third of the corpus, and the pairwise round has plenty of material.

`isGradient` is true for **89** artworks but only **86** publish a gradient. The three-artwork gap is
**by design, not a defect**: `pipeline.ts` builds stops only when `!ends.collapsed &&
parameterisation.isGradient`, and all three
(`music-artworks/a9524ca757269f327884fedbf0f486c7.jpg`, `02/…0002653adc4ef57bc46a3680.jpg`,
`12/…00120329603b7a4f0b3399f6`) published `surfaceCollapsed: true`. Their ρ values are 0.725, 0.720
and 0.720 — all comfortably over the bar, all suppressed by the collapsed field.

**The file.** `measurements/gradient-borderline-0.3.0.json` holds the **20 artworks closest to ρ\*
from either side** — the 10 nearest at or above (all published a gradient) and the 10 nearest below
(none did) — each with `artworkId`, repo-relative `imagePath`, `bestRho`, signed
`distanceFromRhoStar`, `side`, `isGradientByCorrelation`, `publishedGradient`, `geometry`, and the
full `gradientStops` array (colour + position) where one was published. The header block carries the
distribution above so the file is self-describing.

The 20, in descending ρ:

| ρ | Δ from ρ\* | side | published | geometry | stops | artwork |
|---|---|---|---|---|---|---|
| 0.6547 | +0.0347 | gradient | yes | radial | 4 | `music-artworks/e/2/0/e20395f585b3e41dbbf98a3674f45bb1.jpg` |
| 0.6498 | +0.0298 | gradient | yes | linear | 4 | `music-artworks/e/d/d/edd28ba0f4a489a0b3f1f5851003ede1.jpg` |
| 0.6385 | +0.0185 | gradient | yes | linear | 4 | `12/ab67616d0000b2730012db16a41f984c378a6071` |
| 0.6365 | +0.0165 | gradient | yes | radial | 2 | `music-artworks/d/7/6/d76d845e33b98c986bb8b1297e49487b.jpg` |
| 0.6341 | +0.0141 | gradient | yes | linear | 4 | `09/ab67616d0000b2730009e00f495b4584cfdd4ef7` |
| 0.6323 | +0.0123 | gradient | yes | radial | 2 | `03/ab67616d0000b2730003f2b6590090abe420d104.jpg` |
| 0.6307 | +0.0107 | gradient | yes | linear | 3 | `02/ab67616d00001e020002881a851f1e14c374562b.jpg` |
| 0.6228 | +0.0028 | gradient | yes | linear | 2 | `0c/ab67616d00001e02000c4ff9e01aba5eae6cbec4` |
| 0.6221 | +0.0021 | gradient | yes | linear | 2 | `11/ab67616d0000b2730011a326091e7dd7df58b175` |
| 0.6217 | +0.0017 | gradient | yes | linear | 4 | `13/ab67616d0000b273001398589df77e24a722fe6a` |
| 0.6167 | −0.0033 | flat | no | — | — | `music-artworks/8/c/d/8cd594ad97ce7682b53c3dd5ae2a5bbe.jpg` |
| 0.6154 | −0.0046 | flat | no | — | — | `01/ab67616d00001e0200011a71dc82a914663aa5ce.jpg` |
| 0.6152 | −0.0048 | flat | no | — | — | `13/ab67616d0000b27300133fe10d39cafd71ab8a6b` |
| 0.6134 | −0.0066 | flat | no | — | — | `10/ab67616d0000b2730010403dcc48ac67e0a1b97f` |
| 0.6129 | −0.0071 | flat | no | — | — | `12/ab67616d00001e0200121f288d1d52703e36cd3a` |
| 0.6099 | −0.0101 | flat | no | — | — | `02/ab67616d0000b27300026b0642433bd2ffbcef38.jpg` |
| 0.6012 | −0.0188 | flat | no | — | — | `04/ab67616d0000b2730004365ce7b2f02c5401b0f5` |
| 0.5975 | −0.0225 | flat | no | — | — | `06/ab67616d00001e020006c376b34af7b7417b2b12` |
| 0.5974 | −0.0226 | flat | no | — | — | `05/ab67616d0000b2730005165a15d80c563a8d1ec2` |
| 0.5959 | −0.0241 | flat | no | — | — | `00/ab67616d0000b2730000c775567afe4972b0332b.jpg` |

One of these — `02/ab67616d00001e020002881a851f1e14c374562b.jpg`, ρ 0.6307, gradient published — is
also one of the 19 scorecard failures (`I4.ramp-below-contrast-floor`). Worth knowing before it is
put in front of a reviewer.

**A caveat on the recorded ρ.** The diagnostics chain is a flat object whose `gradient` key is
rewritten on every ends-step iteration, so the value stored is the one from the **final, published**
ends step. That is the right value for "what did this run decide", and it is *not* the right value
for "what would this artwork's ρ be at ends-step 0". For the 20 artworks above the published ends
step was 0 in 15 cases, 1 in three, and **6 in two** — so for those last two the recorded ρ is the
correlation of a field that had already been stepped six times. Read every ρ in the file as a
published-run value, not as a property of the artwork.

---

## Instrument notes (reported, not patched)

1. **`check.ts --concurrency` buys almost nothing for a CPU-bound candidate, and `candidateMillis` is
   not CPU time.** Trials run as in-process `async` work (`mapWithConcurrency`), so a synchronous JS
   candidate serialises on the one thread — this run held ~110% CPU on a 14-core machine at
   concurrency 4, against ~437% for `devloop/run.ts`, which uses real worker threads. Separately,
   `PaletteMemo.get` measures **elapsed wall time across an awaited promise** and sums it across
   *overlapping* computations, so `timing.candidateMillis` is inflated roughly by the concurrency
   factor. 0.1.0's 10 755 s was measured at `--concurrency 8` and 0.3.0's 5 699 s at 4: **the two
   numbers are not comparable**, and neither is any per-palette cost derived from them (0.1.0's
   BASELINE.md note 4, "~10.8 s per palette", is inflated for this reason — the coverage run measures
   855 ms median with a real per-call timer). Wall time is the comparable figure.
2. **`--emit-diff-set` still mixes cache artefacts into the set file** (0.1.0 note 2, unchanged): the
   809-line `robustness-disagreeing-images-0.3.0.txt` names
   `research/v3/data/robustness/cache/<arm>/<hash>.<arm>.{baseline,perturbed}.{png,jpg}` for the
   perturbation half, so it is not usable as a dev-loop set of original artworks.
3. **`check(...)` accepts `repoRoot` but `main()` exposes no `--repo-root` flag** (0.1.0 note 3,
   unchanged) — hence the 23 root symlinks.
4. **`check.ts` reports a stability ratio computed from a 10-trial cell.** The rendition-pair basis
   printed `0.000x` here off `0/10` reviewed. It is flagged `UNDERPOWERED`, which is correct, but the
   ratio is still emitted as a number and will be copied into tables by anyone reading fast.
   `MIN_COMPARISONS_FOR_RATIO` is 30, and the guard sets an `underpowered` flag rather than
   suppressing the quotient, so a 0-of-10 cell still yields a printed `0.000x`.
5. **The adjudication text report lists only signal-carrying candidates**, so comparing two runs'
   *lost* wins requires the `--format json` output and a join on `line`. Not a defect; recorded
   because this pass needed it.

---

## Files written by this pass

| file | what |
|---|---|
| `robustness-p3-fields-0.3.0.json` | the full report — 499 trial-level disagreements |
| `robustness-console-0.3.0.txt` | the harness's own formatted summary |
| `robustness-disagreeing-images-0.3.0.txt` | `--emit-diff-set` output, 809 paths (see note 2) |
| `coverage-set-1-220.txt` | the coverage set as a dev-loop set file, 220 paths |
| `run-coverage-220-0.3.0.jsonl` | the dev-loop run over coverage-set-1 |
| `devloop-console-coverage-0.3.0.txt` | its console |
| `run-adjudicated-197-0.3.0.jsonl` | the dev-loop run over the 197 evidence artworks |
| `devloop-console-adjudicated-0.3.0.txt` | its console |
| `adjudication-input-197-0.3.0.jsonl` | 197 lines, the adjudication tool's input format |
| `adjudication-197-0.3.0.txt` / `.json` | the adjudication report, text and machine-readable |
| `gradient-borderline-0.3.0.json` | the 20 artworks nearest ρ\*, for the flat-vs-gradient round |
| `BASELINE-0.3.0.md` | this file |

Nothing in `measurements/` from the 0.1.0 pass was overwritten; every artefact above is a new file.
Instrument side effects live under `research/v3/data/devloop/p3-diag-coverage-0.3.0/` (220 records)
and `research/v3/data/devloop/p3-diag-lostwins-0.3.0/` (2 records).
