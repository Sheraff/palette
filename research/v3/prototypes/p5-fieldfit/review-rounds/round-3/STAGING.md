# P5 round 3 — staging record

Written by the staging worker (W-STAGE3), 2026-08-05, in the worktree `.worktrees/p5-fieldfit`
(branch `proto/p5-fieldfit`, HEAD `e6b9966`). Nothing here was committed; nothing was pushed to the
server. `items.json`, `render-data.json`, `select-fresh-covers.mjs`, `REPORT.md`, this file, and the
set file `research/v3/data/devloop/sets/p5-round3-fresh.txt` are the whole output (plus the three
dev-loop run files the instrument wrote itself).

Format, validation battery and installer caveats follow `round-2/STAGING.md` deliberately: this is
the same payload shape, re-cut against `p5-fieldfit-0.5.1`.

**Read §3.0 first if you read nothing else.** Round 2's census had an RGBA channel-stride defect.
It was found *after* a first round-3 run, fixed, and the selection re-cut under the unchanged
pre-stated rules. Two of the five fresh covers changed as a result. The full disclosure is in §3.0.

---

## 1. The runs these palettes come from

**Items 1–3 — fresh demo-20 run.**

```
NODE_NO_WARNINGS=1 node --experimental-strip-types src/devloop/run.ts \
  --candidate prototypes/p5-fieldfit/candidate.ts \
  --set data/devloop/sets/demo-20.txt
```

- **Run file:** `research/v3/data/devloop/runs/p5-fieldfit-demo-20-20260805T062838826Z.jsonl`
- **Result:** 20 ok · 0 failed · 20 cache hits · 0 computed · 198 ms
- **`codeVersion`** (run header): `52ebc1069f39169c934f6a20e8c50c34832c8822050a1bc5c8f151e9a646749e`
- **`setHash`:** `c364706ce35fde8ffad818f3427377ac182e1da9639e88d419e93863221b41e7`

**Items 4–8 — the fresh five-cover run.**

```
NODE_NO_WARNINGS=1 node --experimental-strip-types src/devloop/run.ts \
  --candidate prototypes/p5-fieldfit/candidate.ts \
  --set data/devloop/sets/p5-round3-fresh.txt
```

- **Run file:** `research/v3/data/devloop/runs/p5-fieldfit-p5-round3-fresh-20260805T063553967Z.jsonl`
- **Result:** 5 ok · 0 failed · 3 cache hits · 2 computed · 778 ms
- **`codeVersion`** (run header): `52ebc1069f39169c934f6a20e8c50c34832c8822050a1bc5c8f151e9a646749e`
  — **identical to the demo-20 run's**, so both halves of the payload were produced by the same
  candidate bytes.
- **`setHash`:** `97625315b8491412231e1f2e5628b6879c624742a7d7c6d4f6ada3f431173299`

**A superseded run file exists and must not be read as payload.**
`p5-fieldfit-p5-round3-fresh-20260805T063310519Z.jsonl` (setHash
`986c657fd3bf262967e8459c263d6afd0c4af24c54e4652ebfb3440ea7044bab`, 5 ok · 5 computed) was the
run over the *pre-correction* five-cover set. Two of its covers are not in the payload; see §3.0.
The set file `p5-round3-fresh.txt` was overwritten in place, so its name now maps to the second
setHash only. **Both hashes are recorded here because the file no longer distinguishes them.**

Both payload runs: `algorithmVersion` `p5-fieldfit-0.5.1`, `preprocessingVersion`
`sharp-0.33.5/srgb/no-resample`, node v25.8.1, `sharp@0.33.5`, `colornames-oklab@0.6.0`.

The demo-20 run reports 20 cache hits and 0 computed — the cache is keyed on `codeVersion` + input
content hash, and v0.5.1 had already been run over demo-20 in this worktree. The rows are still
v0.5.1 rows (`metadata.algorithmVersion` on every one says so); nothing from an earlier version can
reach them. The five-cover run reports 3 hits because three of the five had already been computed by
the superseded run against the *same* `codeVersion` — same candidate bytes, same input hash, so the
hit is the same palette the compute would have produced. The two covers that entered on the
correction were genuinely computed.

**Every colour in `items.json` is copied verbatim from a run row's `palette.roles[*].hex` and
`palette.gradient.stops[*].color.hex`.** The builder reads the two `.jsonl` files and copies fields;
nothing was recomputed, re-quantised or re-rounded. The collapse flags are the run's own
`palette.collapse.{surfaceCollapsed,accentCollapsed}`.

### `dirty: false`, measured

- `git diff e6b9966 -- research/v3/prototypes/p5-fieldfit/src research/v3/prototypes/p5-fieldfit/candidate.ts`
  → **empty**.
- `git status --porcelain research/v3/prototypes/p5-fieldfit/src research/v3/prototypes/p5-fieldfit/candidate.ts`
  → **empty**.
- `HEAD` is still `e6b9966` at the end of staging — it did not move during this round.
- Whole-worktree `git status --porcelain` at staging time → five untracked lines, none of them
  algorithm code: this staging's four files, plus `review-rounds/round-3/NOTES-cross-arm.md`.

**Concurrent edit in this worktree, flagged (as round 2 flagged one).**
`review-rounds/round-3/NOTES-cross-arm.md` appeared during staging — not written by this worker. It
states in its own header that "the staged composition is untouched (staging was in flight when this
arrived)", so nothing here was changed in response to it. Its point 3 ("gradient boolean errs in
both directions… round-3 items 1–2 and fresh item 8 grade exactly this") lands on live evidence:
**fresh item 8 is a census-certified high-chroma gradient cover on which the palette publishes no
gradient at all** (§3.5, §3.6). Someone else is writing in this worktree; a re-run of the dev loop
is only guaranteed to reproduce these palettes while `candidate.ts` and `src/` stay untouched.

---

## 2. The eight items

Order in `items.json` is ROUND.md's table order. `itemId` is the **full 40-hex filename stem** (see
§6, caveat A) — all eight, including the five fresh ones, are Spotify-style 40-hex stems.
`imagePath` is repo-relative and every one resolves under `/Users/Flo/GitHub/palette/`.

| # | itemId | imagePath | ROUND.md row / provenance |
|---|---|---|---|
| 1 | `ab67616d00001e0200001a9be12b7116a8247378` | `00/…16a8247378.jpg` | row 1 — `16a8247378`, returning, R2 UNACCEPTABLE; the smooth-gate ruling's only evidence cover |
| 2 | `ab67616d00001e02000022e7e9d11c908479200b` | `00/…908479200b.jpg` | row 2 — `908479200b`, returning, R2 WEAK ×2; E2's motivating gradient |
| 3 | `ab67616d00001e020000269ead63cf2376a6b67d` | `00/…2376a6b67d.jpg` | row 3 — `2376a6b67d`, returning, R2 WEAK; the white question, third pass |
| 4 | `ab67616d00001e020004ccf0ae91364130886c02` | `04/ab67616d00001e020004ccf0ae91364130886c02` | row 4–8 — **fresh**, class *painted/textured field*, §3.1 |
| 5 | `ab67616d0000b27300113f74852a0091a16672c4` | `11/ab67616d0000b27300113f74852a0091a16672c4` | row 4–8 — **fresh**, class *panel/two-component*, §3.2 |
| 6 | `ab67616d0000b27300094a786a28459646be9b20` | `09/ab67616d0000b27300094a786a28459646be9b20` | row 4–8 — **fresh**, class *vivid photograph*, §3.3 |
| 7 | `ab67616d0000b27300125577fb06a6a8942d6547` | `12/ab67616d0000b27300125577fb06a6a8942d6547` | row 4–8 — **fresh, SUBSTITUTED**: the *light-field-with-light-text* class has no qualifying cover in the pool; this slot carries the *vivid photograph* runner-up, §3.4 |
| 8 | `ab67616d0000b27300096440c40e31757a78343d` | `09/ab67616d0000b27300096440c40e31757a78343d` | row 4–8 — **fresh**, class *high-chroma gradient*, §3.5 |

Each of the three ROUND.md tokens matched exactly one row of the demo-20 run (the tokens are the
last ten characters of the filename stem, and all twenty stems are distinct in that set).

The three returning palettes match every colour ROUND.md's table predicts for them: item 2's
gradient is `#7a545f→#fd7b61` (row 2 quotes it), and item 3 carries the artwork's white as
**surface** `#f9fbf8` with a near-black accent `#000300` (row 3's claim). Item 1 now publishes a
gradient `#484b5a→#5d3f27` where round 2 had a flat `#010000`. That is a check on the run, not a
judgement on the palettes.

**Diagnostics for the three returning covers** (record only, never payload):

| item | noField | fieldComponents | retreat | gradient | twoBlockFallback | fieldExplainedFraction | residualScale |
|---|---|---|---|---|---|---|---|
| 1 `16a8247378` | true | 2 | false | **true** | false | 0.2048 | 0.1844 |
| 2 `908479200b` | true | 3 | false | **true** | false | 0.0995 | 0.2499 |
| 3 `2376a6b67d` | true | 3 | false | false | **true** | 0.0964 | 0.1683 |

**Four of the five fresh items carry no filename extension** (`04/…`, `11/…`, `09/…b9b20`,
`12/…6547`, `09/…343d` — all five, in fact). `file(1)` reports baseline JPEG for all five. `sharp`
reads the header, not the name, so decode is unaffected; an installer that assumes `.jpg` will
break. See §6, caveat J.

---

## 3. Items 4–8 — the selection

### 3.0 The RGBA channel-stride defect, and what it changed

**What was wrong.** `round-2/select-fresh-covers.mjs` decodes each candidate with
`sharp(...).resize(64,64).toColorspace("srgb").raw()` and then indexes the buffer at **stride 3**,
unconditionally. `sharp` returns **four** channels for an RGBA PNG (and the resize premultiplies).
Every statistic for such a cover was therefore computed over a mis-strided, colour-shifted buffer.
The prototype's own decoder does not have this defect — it reads `info.channels` and ignores alpha
(`prototypes/p5-fieldfit/src/decode.ts:97-101`).

**The fix.** `round-3/select-fresh-covers.mjs` calls `.removeAlpha()` **before** the resize and
asserts `info.channels === 3` afterwards, which is the faithful 64×64 analogue of what the prototype
does at full resolution.

**Blast radius, measured.** The census was run twice, before and after, over the identical 216-row
pool. **Exactly 3 rows changed**, and all three are the pool's only RGBA PNGs:

| cover | fieldMedianL | fieldMedianC | textureIndex | vividFrac |
|---|---|---|---|---|
| `music-artworks/2/1/b/21bebfd319e1d7a27648b317a5c09139.png` | 0.905 → 0.907 | 0.185 → 0.186 | **3.679 → 0.805** | 0.759 → 0.887 |
| `music-artworks/2/c/e/2ce31cb74501ca05c417ba63b26d6a89.png` | **0.757 → 0.392** | **0.170 → 0.025** | **2.854 → 0.501** | **0.459 → 0.003** |
| `music-artworks/4/3/6/4369ae62190a9f8366835acb96f4373a.png` | 0.938 → 0.848 | 0.032 → 0.006 | **3.623 → 0.753** | 0.271 → 0.000 |

Every one of the other 213 rows is **byte-identical** between the two censuses. The defect is
surgical: it touches RGBA inputs only.

**What it changed in round 3.** Under the buggy census, class 4 ranked `21be…9139.png` first and
class 8 ranked `2ce3…6a89.png` first. Both are PNGs; both were artefacts of the misread buffer
(`2ce3…` is in truth a near-neutral cover, `fieldMedianC` 0.025, and the palette computed for it in
the superseded run was a near-white `#fcfbf6` flat — consistent with the corrected statistic, not
the buggy one). Under the corrected census neither survives its class gate. Classes 5, 6 and 7 are
JPEG-only and are **unchanged**.

**The honesty problem, stated plainly.** The superseded run had already computed palettes for the
two PNG picks, and for the three JPEG picks, *before* the defect was found. So I had seen five
palettes when the re-ranking happened. What protects the selection is that **the rules were fixed
and written down before any ranking was read, and the re-ranking is mechanical**: the same gate
expressions and the same rank keys were re-applied to corrected inputs, with no rule text touched.
No palette influenced any rule. But the ordering is what it is, and a reader who wants the strict
"no output seen before selection" property has it for round 2 and *not* for round 3's classes 4 and
8. **Flagged, not smoothed over.**

**Round 2's own exposure: none.** All three PNG rows fail both of round-2's gates under the buggy
statistics *and* under the corrected ones. Round 2's items 7 and 8 are unaffected.

### 3.0b Pool and exclusions

**`data/coverage-set/coverage-set-1.json`, all 220 artworks.** Never `data/holdout/`: the
coverage-set build rule already removes the frozen holdout (`heldOutArtworksRemoved: 413`), and the
census re-checked every candidate against `data/holdout/holdout.json` — by artwork **id**, by every
`files[*].path`, **and** (new this round) by `bestRenditionPath`. **0 hits**, as expected.

Further exclusions, applied before any statistic was read:

- demo-20 artworks **and round-2's two fresh covers**, matched on the trailing 24 hex of the
  Spotify-style stem so that a *different rendition of the same artwork* is excluded too —
  **2 hits**, both of them round-2's covers (`…f569f953`, `…48ee7f1b`). Coverage-set-1 and demo-20
  still do not overlap.
- 2 artworks whose files are not reachable from this worktree: `images/greenday.jpg`,
  `images/slim.jpg` (the `images/enrichment` collection has no symlink here). Both are enrichment
  rows, neither is a shard cover. Same two as round 2.

**216 artworks censused.**

### 3.0c The census (input only)

`round-3/select-fresh-covers.mjs`, kept beside this file, is the exact program. It is round-2's
census with the alpha fix of §3.0 and four new statistic families. It decodes each candidate at
64×64 (`sharp`, `removeAlpha`, `fit: "fill"`, sRGB, raw), converts to OKLab and reports, per image,
round-2's statistics plus:

- `fieldVectorPlaneR2` / `fieldVectorAmplitude` — affine plane fits of block-median **L, a and b**
  separately, with the three residual sums pooled against the three total sums. Round 2's
  `fieldPlaneR2` fits lightness only and is blind to a field that ramps in **hue or chroma at
  near-constant lightness** — which is most of what "high-chroma gradient" means. `…Amplitude` is
  the OKLab distance the fitted vector plane travels across the frame.
- `blockDetail` / `textureIndex` — `blockDetail` is mean |ΔL| between neighbouring **block medians**
  (structure at field scale); round-2's `detail` is the same at pixel scale. `textureIndex =
  detail / blockDetail` is high when the frame carries fine variation the field-scale structure does
  not explain: brushwork, grain, weave, droplets.
- `splitR2` / `splitDeltaE` / `splitBalance` / `splitAxis` / `splitAt` — the best straight
  horizontal or vertical cut through the 16×16 block grid. `splitR2` is the share of block-median
  (L,a,b) variance the two side means explain; `splitDeltaE` is the OKLab distance between them;
  `splitBalance` is the smaller side's share of blocks. A poster split into two panels scores high
  on all three; a continuous photograph does not.
- `markFrac` / `markLightShare` — a pixel is a **mark** when it departs from its own block's median
  L by ≥ 0.05. `markFrac` is how much of the frame is marks; `markLightShare` is the share of those
  marks that are **lighter** than the field they sit on. Light text on a light field is
  `markLightShare` near 1 at a high `fieldMedianL`.

**No palette, no diagnostic, and no candidate-algorithm call is involved.** The census imports
`sharp` and nothing from `prototypes/`.

**Cross-class rule, stated before ranking:** classes are resolved in the order 4, 5, 6, 7, 8; a
cover taken by an earlier class is removed from every later pool. (This binds once: item 4's pick
was also class 8's rank 2, and was withheld from class 8 by this rule.)

### 3.1 Item 4 — painted/textured field

**Rule (stated before ranking):** `flatFrac ≤ 0.10` **and** `fieldBlockRange ≤ 0.30` **and**
`detail ≥ 0.03`; rank survivors by `textureIndex` descending, take rank 1.

The gate reads "continuous tone, not a vector fill" (`flatFrac`), "one coherent field, not panels"
(`fieldBlockRange`) and "real pixel-scale variation" (`detail`).

**Pool after the gate: 1 of 216.** There is no runner-up — the corrected census leaves a single
survivor.

**Rank 1 (= only survivor): `ab67616d00001e020004ccf0ae91364130886c02`** —
`textureIndex 2.074`, `detail 0.039`, `blockDetail 0.019`, `flatFrac 0.044`,
`fieldBlockRange 0.256`, `fieldMedianL 0.597`, `fieldMedianC 0.159`. (sharded corpus, core, cluster
27.)

Under the buggy census this pool had 2 members and this cover was rank 2; see §3.0.

**Honest description of the artwork** (looked at *after* selection, before its palette was read):
a macro photograph of a green leaf covered in water droplets, a brown-red midrib running top to
bottom, white letter-spaced capitals *MÚSICA AMBIENTE / DE LLUVIA CAYENDO / VOL. 1* across the lower
third. **Flagged:** the class name says *painted*/textured. This is **textured but not painted** —
photographic droplet micro-texture on a green field, not brushwork. `textureIndex` measures
"fine variation the field does not explain" and cannot separate a painter's marks from a macro lens's.
The class as stated ("painted/textured field") is satisfied by the *textured* half only, and the
round should read item 4's grade as evidence about texture, not about painting. Item 1 (returning)
remains the round's only genuinely painted cover.

### 3.2 Item 5 — panel/two-component

**Rule (stated before ranking):** `splitR2 ≥ 0.50` **and** `splitDeltaE ≥ 0.15` **and**
`splitBalance ≥ 0.25`; rank survivors by `splitR2` descending, take rank 1.

**Pool after the gate: 16 of 215.**

**Rank 1: `ab67616d0000b27300113f74852a0091a16672c4`** — `splitR2 0.806`, `splitDeltaE 0.361`,
`splitBalance 0.313`, `splitAxis h`, `splitAt 0.688`, `fieldBlockRange 0.527`. (sharded, core,
cluster 32.)

**Runners-up:** `music-artworks/d/d/d/ddd8a0e7961edcf8e95b771ae0d9b8c5.jpg` (0.769),
`0b/…d30345a2754191` (0.761), `music-artworks/a/6/e/a6ef87d93332870d480ed5bbdf044713.jpeg` (0.717),
`03/…b5347f9c0779` (0.711), `01/…d549c66ecc6` (0.699). Rank 1 is clear of rank 2 by 0.037 on the
rank key; no tie-break was needed.

**Honest description:** a photograph of a dark, wet, layered rock face filling the upper two thirds
with a pale sandy beach across the lower third; the title *Riego de Agua* is set in thin white
letter-spaced serif on the sand. Two components, split horizontally at about 0.69 of the frame —
which is what `splitAt 0.688` says. This is a **photographic** two-component cover, not a graphic
panel layout; no stated statistic distinguishes those, and the pool's rank-3 (`0b/…4191`,
`splitBalance 0.500`, `splitDeltaE 0.487`) looks more like a designed split. Recording that the rank
key chose photographic evidence for a class the reviewer may read as graphic.

### 3.3 Item 6 — vivid photograph

**Rule (stated before ranking) — round-2's item-8 rule, verbatim:** `flatFrac ≤ 0.20` **and**
`topBinShare ≤ 0.15` **and** `distinctBins ≥ 500`; rank survivors by `vividFrac` descending, take
rank 1. Re-used unchanged so that round 2's and round 3's vivid-photograph draws are comparable.

**Pool after the gate: 16 of 214.**

**Rank 1: `ab67616d0000b27300094a786a28459646be9b20`** — `vividFrac 0.458`, `meanC 0.110`,
`p90C 0.171`, `flatFrac 0.000`, `topBinShare 0.049`, `distinctBins 1183`. (sharded, core,
cluster 17.) This is round 2's own runner-up, promoted now that round 2's pick is excluded.

**Runners-up:** `12/…06a6a8942d6547` (0.417 — taken by item 7, §3.4),
`03/…b5140b3658d0a1` (0.407), `music-artworks/2/6/0/260e1f491e4632305e7924462efc37c2.jpg` (0.393),
`music-artworks/4/0/3/403901184875a1f7dfb89346911bb6e2.jpg` (0.338),
`music-artworks/e/7/5/e7540fff60e0049f2516e5e8fa6d0540.jpg` (0.304).

**Honest description, and a LOUD flag:** this is Steve Aoki's *HiROQUEST 3: PARAGON* — a **vivid
digital anime illustration**, not a photograph. A purple-haired figure with a red forehead gem,
ringed by rendered treasure-chest and crystal objects on a blue/purple energy field, with a large
chrome-blue display title.

Round 2 recorded this exact failure once already: its first rule ranked a *flat-colour cartoon*
first, and the rule was replaced with the "photographic gate" above. **The replacement did not fix
the problem — it only excluded the flat kind.** This cover is airbrushed and heavily rendered, so it
is continuous-tone (`flatFrac 0.000`), busy (`distinctBins 1183`) and unconcentrated
(`topBinShare 0.049`), and it sails through a gate whose three terms all encode "continuous tone and
busy" and none of which encodes "photograph". **The gate is misnamed.** I did not change it — it was
stated before ranking and round 2 uses it — but the round must not read item 6's grade as evidence
about photographs. It is evidence about vivid rendered illustration.

### 3.4 Item 7 — the light-field-with-light-text class has NO qualifying cover

**Rule (stated before ranking):** `fieldMedianL ≥ 0.70` **and** `markFrac ≥ 0.03` **and**
`markLightShare ≥ 0.60`; rank survivors by `markLightShare` descending, tie-break `fieldMedianL`
descending, take rank 1.

**Pool after the gate: 0 of 213. No qualifying cover exists.**

Which term kills it, measured over the 213 covers still available:

| term | survivors |
|---|---|
| `fieldMedianL ≥ 0.70` | 48 |
| `markFrac ≥ 0.03` | 212 |
| `markLightShare ≥ 0.60` | **1** |
| `fieldMedianL ≥ 0.70` ∧ `markFrac ≥ 0.03` | 47 |
| `fieldMedianL ≥ 0.70` ∧ `markLightShare ≥ 0.60` | **0** |

The best light field in the pool reaches `markLightShare` **0.450**
(`12/…d915b8bcdef14133`), then 0.448, 0.425, 0.424, 0.423. The single cover in the whole set that
clears 0.60 is `05/…f82f75e557d5d99b` at `fieldMedianL` **0.183** — a *dark* field with light text,
the opposite class. The statistic behaves; the class is simply absent from coverage-set-1. This is
not a threshold that missed by a hair: the gap from 0.450 to 0.60 is a third of the way to the
ceiling. **The rule was not bent.**

**The substitution, and the rule for it (stated before the ranking that produced it).** The slot
goes to the runner-up of whichever *other* class would otherwise carry the fewest covers in the
round, counting the returning items by ROUND.md's own descriptions of them; ties break by class
number ascending. Reading ROUND.md's rows: item 1 "painted autumn sky" pairs with class 4, item 3
"white now in the palette as surface" (a yellow field plus a white second component,
`twoBlockFallback true`) pairs with class 5, item 2 "the sunset now publishes its gradient" pairs
with class 8. **Class 6 — vivid photograph — has no returning partner**, so it is the thinnest, and
slot 7 takes its rank 2. *This pairing is my reading of ROUND.md's prose, not a fact the payload
carries; if the orchestrator maps the returning covers differently, the substitution should be
re-decided before the push.*

**Item 7: `ab67616d0000b27300125577fb06a6a8942d6547`** — the class-6 pool's rank 2:
`vividFrac 0.417`, `meanC 0.115`, `p90C 0.235`, `flatFrac 0.016`, `topBinShare 0.072`,
`distinctBins 520`. (sharded, core, cluster 34.)

**Honest description:** three performers photographed in a row — hoodie, sunglasses, dreadlocks,
varsity jacket — against a dark purple/blue graphic field with a faint large numeral behind them,
under heavy cyan-and-white display type (*MC LAN MC LIL MC FIOTI / SE EU TE SALVAR / NO LANÇA*).
Unlike item 6 this one **is** photographic in its subject. **Flagged:** the slot was meant for a
light field with light text; this is a **dark** field with light text. The round therefore has **no
light-field cover at all**, and ROUND.md's question about foreground legibility on light fields
goes unanswered this round. If that question matters, round 4 must widen the pool beyond
coverage-set-1 rather than relax `markLightShare`.

### 3.5 Item 8 — high-chroma gradient

**Rule (stated before ranking):** `fieldMedianC ≥ 0.09` **and** `fieldVectorPlaneR2 ≥ 0.60` **and**
`fieldVectorAmplitude ≥ 0.06`; rank survivors by `fieldMedianC` descending, take rank 1.

**Pool after the gate: 2 of 213** (item 4's cover would have been a third but was withheld by the
cross-class rule — it had `fieldMedianC 0.159`, and had it stayed it would have ranked **first**).

**Rank 1: `ab67616d0000b27300096440c40e31757a78343d`** — `fieldMedianC 0.149`,
`fieldVectorPlaneR2 0.639`, `fieldVectorAmplitude 0.306`, `fieldPlaneR2 0.069`,
`fieldMedianL 0.619`, `vividFrac 0.863`. (sharded, core, cluster 6.)

**Runner-up:** `music-artworks/2/6/0/260e1f491e4632305e7924462efc37c2.jpg` (`fieldMedianC 0.105`,
`fieldVectorPlaneR2 0.601`, `fieldVectorAmplitude 0.884`).

Note `fieldPlaneR2 0.069` against `fieldVectorPlaneR2 0.639`: this cover's field ramps almost
entirely in **hue and chroma**, barely in lightness. Round 2's lightness-only statistic would have
scored it as no ramp at all. That is exactly why the vector fit was added.

**Honest description:** *Harp Zone — Castlevania*: a harp silhouette over a full-frame vertical
gradient running olive-green at the top through orange to a saturated red at the bottom, with a
heavy grain/spatter band across the middle; *Harp Zone* in black sans at the top right, *Castlevania*
in a black script at the bottom.

**LOUD, and directly on ROUND.md's question (a) and NOTES-cross-arm point 3:** this is the round's
census-certified high-chroma gradient, and **the palette publishes no gradient**. It reads
`twoBlockFallback: true` and splits the ramp into two flat blocks — `background #f82f01` (the red
bottom) and `surface #98961d` (the olive top) — with `gradient: null`, so `fieldCss` renders the
flat red alone and the olive appears only in the role swatches (caveat I). The reviewer will see one
red field for an artwork that is unmistakably a green-to-red ramp. This is the strongest single
piece of evidence the round carries and it is *unseen* evidence: no ruling was derived from this
cover.

### 3.6 `diagnose.ts` on all five — for the record, NOT part of the payload

```
NODE_NO_WARNINGS=1 node --experimental-strip-types prototypes/p5-fieldfit/diagnose.ts <absolute image path>
```

(the tool resolves relative paths against `research/v3`, not the repository root, so absolute paths
were used). All five re-derive the run rows' palettes exactly.

**Item 4 — `ab67616d00001e020004ccf0ae91364130886c02`:**

```json
{
  "size": "300×300",
  "fieldOrder": 1,
  "diagnostics": {
    "noField": false,
    "inlierFraction": 0.9217333333333333,
    "fieldExplainedFraction": 0.6336,
    "fieldComponents": 0,
    "retreat": false,
    "residualScale": 0.06267762525938451,
    "marginBars": 1.379678084026326,
    "orientationMargin": -0.25795849897718925,
    "gradient": true,
    "excursionMax": 0.0018960419818724158,
    "thirdStopAccepted": false,
    "residualExcursion": 0.0015428174579534854,
    "twoBlockFallback": false,
    "accentChromaOnly": false,
    "offArtwork": { "background": false, "surface": false, "foreground": false, "accent": false },
    "escape": false
  },
  "attempts": null,
  "palette": {
    "background": "#45820d",
    "surface": "#67ad19",
    "foreground": "#1f5a00",
    "accent": "#8fc556",
    "gradient": [ { "hex": "#45820d", "position": 0 }, { "hex": "#67ad19", "position": 1 } ],
    "geometry": { "kind": "linear", "angleDegrees": -92.11892464524135 },
    "collapse": { "surfaceCollapsed": false, "accentCollapsed": false },
    "escape": null
  }
}
```

**Item 5 — `ab67616d0000b27300113f74852a0091a16672c4`:**

```json
{
  "size": "640×640",
  "fieldOrder": 1,
  "diagnostics": {
    "noField": true,
    "inlierFraction": 0.9957666015625,
    "fieldExplainedFraction": 0.27525634765625,
    "fieldComponents": 3,
    "retreat": false,
    "residualScale": 0.1660989524580538,
    "marginBars": 3.8862991212052287,
    "orientationMargin": 0.6683798066533831,
    "gradient": true,
    "excursionMax": 0.003044472549514842,
    "thirdStopAccepted": false,
    "residualExcursion": 0.002406338540688215,
    "twoBlockFallback": false,
    "accentChromaOnly": false,
    "offArtwork": { "background": false, "surface": false, "foreground": false, "accent": false },
    "escape": false
  },
  "attempts": [
    { "depth": 0, "order": 1, "supportFraction": 0.3165, "coreFraction": 0.7003, "extensive": true, "smooth": true },
    { "depth": 1, "order": 1, "supportFraction": 0.2788, "coreFraction": 0.8042, "extensive": true, "smooth": true },
    { "depth": 2, "order": 1, "supportFraction": 0.1866, "coreFraction": 0.6296, "extensive": true, "smooth": true },
    { "depth": 3, "order": 1, "supportFraction": 0.0971, "coreFraction": 0.6093, "extensive": false, "smooth": false }
  ],
  "palette": {
    "background": "#132028",
    "surface": "#17252e",
    "foreground": "#c39170",
    "accent": "#1f3038",
    "gradient": [ { "hex": "#132028", "position": 0 }, { "hex": "#17252e", "position": 1 } ],
    "geometry": { "kind": "linear", "angleDegrees": -101.93341269334205 },
    "collapse": { "surfaceCollapsed": false, "accentCollapsed": false },
    "escape": null
  }
}
```

Note for the analysis: the recursion went four levels deep and the palette took the **dark rock**
as the field. The pale sand — the artwork's other component and the half the census's split found —
reaches the palette only as the `#c39170` foreground.

**Item 6 — `ab67616d0000b27300094a786a28459646be9b20`:**

```json
{
  "size": "640×640",
  "fieldOrder": 1,
  "diagnostics": {
    "noField": true,
    "inlierFraction": 1,
    "fieldExplainedFraction": 0.01237548828125,
    "fieldComponents": 1,
    "retreat": false,
    "residualScale": 0.3432455606728792,
    "marginBars": 0.21790158290658715,
    "orientationMargin": -134.44240034876526,
    "gradient": false,
    "excursionMax": 0,
    "thirdStopAccepted": false,
    "residualExcursion": 0,
    "twoBlockFallback": false,
    "accentChromaOnly": false,
    "offArtwork": { "background": false, "surface": false, "foreground": false, "accent": false },
    "escape": false
  },
  "attempts": [
    { "depth": 0, "order": 1, "supportFraction": 0.1623, "coreFraction": 0.9559, "extensive": true, "smooth": true },
    { "depth": 1, "order": 0, "supportFraction": 0.079, "coreFraction": 0.5836, "extensive": false, "smooth": false }
  ],
  "palette": {
    "background": "#00bffa",
    "surface": "#00bffa",
    "foreground": "#fde9d0",
    "accent": "#000000",
    "gradient": null,
    "geometry": null,
    "collapse": { "surfaceCollapsed": true, "accentCollapsed": false },
    "escape": null
  }
}
```

**Item 7 — `ab67616d0000b27300125577fb06a6a8942d6547`:**

```json
{
  "size": "640×640",
  "fieldOrder": 1,
  "diagnostics": {
    "noField": true,
    "inlierFraction": 0.995966796875,
    "fieldExplainedFraction": 0.01375,
    "fieldComponents": 1,
    "retreat": false,
    "residualScale": 0.26142639429867265,
    "marginBars": 0.1841797310210942,
    "orientationMargin": 58.27334065378906,
    "gradient": true,
    "excursionMax": 0.003926482106198078,
    "thirdStopAccepted": false,
    "residualExcursion": 0.0020587044239544815,
    "twoBlockFallback": false,
    "accentChromaOnly": false,
    "offArtwork": { "background": false, "surface": false, "foreground": false, "accent": false },
    "escape": false
  },
  "attempts": [
    { "depth": 0, "order": 1, "supportFraction": 0.1992, "coreFraction": 0.5933, "extensive": true, "smooth": true },
    { "depth": 1, "order": 1, "supportFraction": 0.058, "coreFraction": 0.896, "extensive": false, "smooth": false }
  ],
  "palette": {
    "background": "#120032",
    "surface": "#0f002a",
    "foreground": "#ffffff",
    "accent": "#009cff",
    "gradient": [ { "hex": "#120032", "position": 0 }, { "hex": "#0f002a", "position": 1 } ],
    "geometry": { "kind": "linear", "angleDegrees": -112.88368863727949 },
    "collapse": { "surfaceCollapsed": false, "accentCollapsed": false },
    "escape": null
  }
}
```

Note: the two ramp ends are 3 units apart in blue and 3 in red (`#120032` / `#0f002a`) —
`nameHexes` gives both the same name, "Narwhal Grey" (caveat G), while `surfaceCollapsed` is
correctly `false` because the hexes differ. The rendered ramp will look flat.

**Item 8 — `ab67616d0000b27300096440c40e31757a78343d`:**

```json
{
  "size": "640×640",
  "fieldOrder": 1,
  "diagnostics": {
    "noField": false,
    "inlierFraction": 0.94085205078125,
    "fieldExplainedFraction": 0.6100146484375,
    "fieldComponents": 0,
    "retreat": false,
    "residualScale": 0.07157966667003929,
    "marginBars": 3.4857396446379956,
    "orientationMargin": -9.061395195283456,
    "gradient": false,
    "excursionMax": 0.036189377184029654,
    "thirdStopAccepted": false,
    "residualExcursion": 0.036189377184029654,
    "twoBlockFallback": true,
    "accentChromaOnly": false,
    "offArtwork": { "background": false, "surface": false, "foreground": false, "accent": false },
    "escape": false
  },
  "attempts": null,
  "palette": {
    "background": "#f82f01",
    "surface": "#98961d",
    "foreground": "#8c3406",
    "accent": "#d0d749",
    "gradient": null,
    "geometry": null,
    "collapse": { "surfaceCollapsed": false, "accentCollapsed": false },
    "escape": null
  }
}
```

---

## 4. What is in each file

**`items.json`** — a bare JSON **array** of 8 calibration items, each with exactly five keys:
`itemId`, `imagePath`, `variantId`, `fingerprint`, `palette`. No batch envelope: the installer
supplies `batchId`, `purpose` and `fundedBy`.

`variantId` is `"p5-fieldfit-0.5.1"` on every item; `fingerprint` is
`{algorithmVersion: "p5-fieldfit-0.5.1", preprocessingVersion: "sharp-0.33.5/srgb/no-resample",
gitCommit: "e6b9966", dirty: false}` on every item.

**`render-data.json`** — an **object keyed by `itemId`**, each value `{ roles, gradient, fieldCss }`:

- `roles` — four entries in fixed order `background, surface, foreground, accent`, each
  `{ role, hex, name, collapsed }`. `name` comes from `nameHexes()` (`src/review-server/color.ts:62`,
  the one `colornames-oklab` call site). `collapsed` is `false` for background and foreground by
  construction, and the palette's own `surfaceCollapsed` / `accentCollapsed` for the other two.
- `gradient` — the stops verbatim, or `null`.
- `fieldCss` — produced by the **pinned renderer**, `fieldCss()` at `src/review-server/gradient.ts:119`:
  the flat background hex when there is no gradient, otherwise
  `linear-gradient(135deg in oklab, <hex> 35%, <hex> 100%)`. The 35% is the 2-stop display reserve,
  not a fitted position; the true fitted positions stay in `gradient`.

**Blinding.** Neither served file contains a prototype name, a mechanism label, a version string, a
diagnostic, a before/after framing or any round metadata. `variantId` and `fingerprint` do name the
algorithm, deliberately — they are TRUE names the server keeps and never serves
(`src/review-server/README.md`, "Calibration mode"). The leak scan in §5 covers everything else.

**`select-fresh-covers.mjs`** is a staging artefact, not payload. It must not be pushed.

---

## 5. Validation

Run from `research/v3` with a throwaway `check-r3.ts` (kept out of the repository, in the session
scratchpad). All checks passed:

```
PASS  items.json parses as an array of 8 — 8 items
PASS  8 unique itemIds
PASS  every itemId is a server-legal id token
PASS  every itemId is a full 40-hex stem
PASS  every hex matches ^#[0-9a-f]{6}$ — 42 hexes checked, bad: none
PASS  every imagePath exists under the MAIN checkout — 8/8 resolve
PASS  no imagePath is absolute
PASS  gradient ends are background -> surface — 5 gradient items
PASS  gradient positions in [0,1] and strictly increasing
PASS  gradient stop counts within 2..4
PASS  no gradient carries a non-string geometry
PASS  every item has both collapse booleans and required fields
PASS  collapse flags agree with hex equality
PASS  items.json items carry exactly the 5 push keys
PASS  fingerprint is uniform and names v0.5.1
PASS  render-data has one entry per itemId
PASS  every render entry has 4 named roles in order
PASS  render hexes and collapse flags match items.json verbatim
PASS  render names are the current colornames-oklab output
PASS  fieldCss is a ramp when there is a gradient, the flat background otherwise
PASS  render entries carry exactly roles/gradient/fieldCss
PASS  no diagnostics / mechanism labels / version labels in any served field — clean
PASS  the "E2" mechanism label, word-bounded and case-sensitive — clean
PASS  "e2" over the served colour NAMES only (hex-free text) — clean

ALL CHECKS PASSED
```

**Plus the dry-run through the real parser**, as rounds 1 and 2 did:

```
parseCalibrationBatch OK: 8 items, purpose calibration
round-trip identical: true
```

The 8 items (with `imagePath` rewritten to absolute) were fed to `parseCalibrationBatch` from
`src/review-server/batch.ts` and every palette came back byte-identical. It does **not** exercise
`pushCalibration`'s later stages (path allowlist, `sharp.metadata()` on the file header, batch-log
write), so the live push is still the real test.

**`collapse flags agree with hex equality` — the pairing, since it is not symmetric.**
`surfaceCollapsed` pairs `surface` with `background`; `accentCollapsed` pairs `accent` with
**`foreground`**, not with surface (`src/contract/constants.ts:65`,
`src/contract/invariants.ts:737`). The check asserts both, in that pairing.

**Two notes on the leak scan.** Round 2's: `"round"` cannot be used as a token — `background` and
`foreground` contain it. Round 3's, new: **`"e2"` cannot be used over colour data either** — item 1's
foreground is `#fee2ba`, a served hex. `"e2"` was therefore scanned two ways instead: word-bounded
and case-sensitive (`\bE2\b`) over the whole serialized payload, and case-insensitively over the
served colour **names** alone, which carry no hex. Both clean. The list actually scanned over
everything is `p5`, `fieldfit`, `field-fit`, `v0.`, `0.3.0`, `0.5.1`, `explf`, `nofield`, `round-1`,
`round-2`, `round-3`, `round 2`, `round 3`, `before`, `after`, `twoblock`, `two-block`, `retreat`,
`component`, `smooth`, `prototype`, `calibration`, `diagnos`, case-insensitively, over all of
`render-data.json` plus every item's `itemId` / `imagePath` / `palette`. Zero hits.

---

## 6. Payload caveats an installer must act on

Caveats **A–J are carried over from `round-2/STAGING.md` §6** and re-verified against this payload;
**K–N are new to this round.**

**A. `itemId` is the FULL 40-hex filename stem, not the 10-char token ROUND.md uses.** Unchanged
from rounds 1 and 2, and unchanged deliberately: switching now would make round-1/2/3 feedback
un-joinable on the item handle. All eight pass `ID_PATTERN` (`batch.ts:32`). **If the orchestrator
wants the short token, decide before the push** — the item id is the reviewer's copy-paste feedback
handle (ROUND_KIT.md) and changing it afterwards orphans any note that quoted it.

**B. `imagePath` is repo-relative and MUST be rewritten to absolute before the push.**
`parseCalibrationBatch` requires `isAbsolute(imagePath)` (`batch.ts:219`). Prefix with
`/Users/Flo/GitHub/palette/` — the **main checkout**, not the worktree; the server's `imageRoots`
allowlist defaults to `REPO_ROOT` (`server.ts:460`) and is satisfied by the main checkout root, and
all 8 files were verified present there.

**C. `gradient.geometry` was dropped, deliberately.** The run emits an **object**
(`{kind, angleDegrees}`); the server requires a **string** of ≤64 chars when the field is present
(`batch.ts:104`). The five fitted angles are −92.1°, −101.9°, −112.9° and the two returning items'
66.1° and 84.3°, and the pinned renderer fixes display at 135° (`gradient.ts:33`), so nothing
reaches the field either way. Flattening it to a string is a decision, not a fix. **This round has
five gradients rather than round 2's two, so the mismatch between fitted angle and displayed 135° is
now on five of eight items.**

**D. Where the push shape was read from** — `src/review-server/README.md` "Calibration mode";
`server.ts:2462` (`POST /api/calibration` → `pushCalibration`, defined `server.ts:677`);
`batch.ts:205-242` (`parseCalibrationBatch`), `:107` (`parsePalette`), `:129-133`
(`parseFingerprint`, where `dirty` is **required and never defaulted**), `:72-105` (`parseGradient`:
2–4 stops, hex colours, positions canonicalised to 6 decimals then required strictly increasing),
`:110-117` (both collapse booleans required; the server deliberately does **not** enforce contract
invariants).

**E. `purpose` defaults to `calibration`** (`batch.ts:207`); `fundedBy` defaults to `[]`
(`batch.ts:212`) and was **not** invented here. The installer owns that list.

**F. The side-car shape is a MAP, not the `{batchId, items:[…]}` envelope the existing side-cars
use.** `render-data.json` maps `itemId → { roles, gradient, fieldCss }` — the inner `side` object of
`review-ui/accent-real-1.data.json`, hoisted. If the page rendering this round expects the
accent-real envelope, this file needs re-wrapping (a wrapper, not a rebuild). The live
`/calibration` page (`review-ui/calibration.js`) is pre-kit and builds its side from the **server
payload**, so on today's server this file may be advisory. Confirm before pushing.

**G. `render-data.json` names are the CURRENT `colornames-oklab@0.6.0` output** (the version both
run headers record). Names are presentation-only and never feed a judgement, but they were computed
here rather than server-side; a re-name under a different package version would disagree. `nameHexes`
is deliberately not `unique: true`. **This round it bites twice:** item 6's background and surface
both read "Capri" — that identity *is* the collapse, shown — and item 7's background `#120032` and
surface `#0f002a` **both read "Narwhal Grey" while being different colours and not collapsed**. A
reviewer reading names alone will think item 7 collapsed when it did not.

**H. Five items carry a gradient; three are flat.** Items 1, 2, 4, 5, 7. All five ramps are 2-stop
with `stops[0].color === background` and `stops[1].color === surface` at positions 0 and 1.

**I. Two distinct field colours do not reach the rendered field when `gradient` is `null`.**
`fieldCss()` renders the flat background alone whenever `gradient` is `null`, so a two-block reading
shows only its first colour. **This round it hits item 8**, which is the round's high-chroma
gradient cover: `background #f82f01`, `surface #98961d`, `surfaceCollapsed: false`, `gradient: null`
— the reviewer sees flat red for a green-to-red ramp, and the olive appears only in the swatches.
That is the pinned renderer behaving as specified, not a staging error — but it means item 8's grade
will be a judgement on a flat red field. **If the round wants the second block visible on the mock,
that is a REVIEW_UI change and must be decided before the push, not patched into this file.**

**J. All five fresh items have no filename extension.** `04/…30886c02`, `11/…a16672c4`,
`09/…46be9b20`, `12/…942d6547`, `09/…7a78343d` are extensionless files on disk. `sharp` and the dev
loop handle them; `src/devloop/serve.ts:295` falls back to `application/octet-stream` for an unknown
extension, so **a browser preview served through the dev loop may not display these five images**
even though the palettes are correct. Anything that infers a content type from the filename needs a
header sniff here. This is now five of eight items, up from two of eight.

**K. NEW — the class-7 slot does not carry the class ROUND.md asked for.** Item 7 is a second vivid
photograph, not a light field with light text; the class has no member in coverage-set-1 under a
stated rule (§3.4). ROUND.md's row 4–8 text and any analysis mapping must be corrected before the
round is written up, or the round will be read as having tested light-field legibility when it did
not.

**L. NEW — item 6 is an illustration, not a photograph.** The "photographic gate" (round 2's rule,
re-used verbatim for comparability) does not encode photography; it encodes continuous-tone and
busy. Item 6's grade is evidence about vivid rendered illustration (§3.3).

**M. NEW — item 4 is textured but not painted.** `textureIndex` cannot separate brushwork from
photographic micro-texture; item 4 is a macro leaf photograph. Item 1 (returning) remains the
round's only painted cover, which means ROUND.md's outcome rule "any fresh cover exposing an absurd
component → the 0.4 gate has one evidence cover, so one counterexample re-opens it" is **not**
strengthened by a second painted draw this round (§3.1).

**N. NEW — the set file name `p5-round3-fresh.txt` maps to two different setHashes in the run
directory.** It was overwritten in place after the census correction. The payload comes from
`…20260805T063553967Z.jsonl` (setHash `9762…3299`) only; `…20260805T063310519Z.jsonl` (setHash
`986c…4bab`) is superseded and contains two covers that are not in the payload. Anything that
re-derives the payload from "the latest run for that set name" will be right by luck, not by
construction — pin the run file, not the set name.

---

## 7. Report

*(This section is the staging worker's report. It was to be written to `round-3/REPORT.md`; the
harness refuses standalone report files from a worker, so the file channel carries it here instead.)*

**itemIds** (full 40-hex stems, ROUND.md order):
`ab67616d00001e0200001a9be12b7116a8247378` · `ab67616d00001e02000022e7e9d11c908479200b` ·
`ab67616d00001e020000269ead63cf2376a6b67d` · `ab67616d00001e020004ccf0ae91364130886c02` ·
`ab67616d0000b27300113f74852a0091a16672c4` · `ab67616d0000b27300094a786a28459646be9b20` ·
`ab67616d0000b27300125577fb06a6a8942d6547` · `ab67616d0000b27300096440c40e31757a78343d`

**Fresh items — class · rule · diagnostics · fg/accent:**

| # | itemId tail | class | rule (stated before ranking) | pool | components / retreat / gradient | fg | accent |
|---|---|---|---|---|---|---|---|
| 4 | `…30886c02` | painted/textured field | `flatFrac≤.10 ∧ fieldBlockRange≤.30 ∧ detail≥.03`, rank `textureIndex` | 1 | 0 / false / **true** | `#1f5a00` | `#8fc556` |
| 5 | `…a16672c4` | panel/two-component | `splitR2≥.50 ∧ splitΔE≥.15 ∧ splitBalance≥.25`, rank `splitR2` | 16 | 3 / false / **true** | `#c39170` | `#1f3038` |
| 6 | `…46be9b20` | vivid photograph | round-2's item-8 rule, verbatim; rank `vividFrac` | 16 | 1 / false / false | `#fde9d0` | `#000000` |
| 7 | `…942d6547` | **SUBSTITUTION** — vivid-photograph rank 2 | light-field-with-light-text gate returns **0**; slot reassigned by the pre-stated thinnest-class rule | 0 → 16 | 1 / false / **true** | `#ffffff` | `#009cff` |
| 8 | `…7a78343d` | high-chroma gradient | `fieldMedianC≥.09 ∧ fieldVectorPlaneR2≥.60 ∧ fieldVectorAmplitude≥.06`, rank `fieldMedianC` | 2 | 0 / false / **false, twoBlockFallback true** | `#8c3406` | `#d0d749` |

**Validation:** all 24 checks PASS; `parseCalibrationBatch` OK, round-trip identical; 8 items
exactly; `dirty:false` measured (diff against `e6b9966` and porcelain both empty over
`prototypes/p5-fieldfit/src` + `candidate.ts`; HEAD still `e6b9966`).

**Files written:** `round-3/items.json`, `round-3/render-data.json`,
`round-3/select-fresh-covers.mjs`, `round-3/STAGING.md`, and
`data/devloop/sets/p5-round3-fresh.txt`.

**Uncertain / flagged loudly:**

1. **Round-2's census misread every RGBA PNG** (stride 3 on a 4-channel buffer). Fixed; 3 of 216
   rows changed; items 4 and 8 were re-cut **after** the superseded picks' palettes had been
   computed and seen. The rules were pre-stated and re-applied mechanically, and round 2's own
   picks are unaffected — but the strict "no output seen before selection" property does not hold
   for round-3 classes 4 and 8. §3.0.
2. **Item 8 is the round's certified high-chroma gradient and publishes no gradient** — the mock
   shows a flat red field for a green→red ramp. §3.5, caveat I.
3. **Item 6 is a vivid anime illustration, not a photograph** — the re-used "photographic gate"
   encodes continuous-tone-and-busy, not photography. §3.3, caveat L.
4. **Item 4 is textured but not painted** (macro leaf photograph). §3.1, caveat M.
5. **The round has no light-field cover at all**; ROUND.md's light-field legibility question goes
   unanswered. §3.4, caveat K.
6. **Item 7's two ramp ends both name "Narwhal Grey"** while being different colours and not
   collapsed — names will read as a collapse that did not happen. Caveat G.
7. The thinnest-class substitution rule relies on **my reading** of which returning cover pairs with
   which class; if the orchestrator maps them differently, re-decide slot 7 before the push. §3.4.
8. `round-3/NOTES-cross-arm.md` appeared in this directory during staging, **not written by this
   worker**. §1.
