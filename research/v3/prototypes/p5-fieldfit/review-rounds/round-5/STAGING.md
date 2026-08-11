# P5 round 5 — staging record

Written by the staging worker (W-STAGE5), 2026-08-11, in the worktree `.worktrees/p5-fieldfit`
(branch `proto/p5-fieldfit`, HEAD `57f02ee0` at the start **and at the end** of staging). Nothing
here was pushed to the server and nothing was committed.

Format, validation battery and installer caveats follow `round-4/STAGING.md` deliberately: same
payload shape, re-cut against `p5-fieldfit-0.9.2`. Two protocol additions this round, both from
ROUND.md: the **served-name eyeball check** (§6, new) and the **returning-accent loud stop** (§2.1,
which did **not** trigger — all three predicted accents match exactly).

**Read §2.1, §3.1, §6 and §7 caveats U–Y first if you read nothing else.**

---

## 1. The runs these palettes come from

All three runs below share one `codeVersion`,
`024f5e55d529228d45fcfc912794c1095857a8ae58f2c12bf96ca0f24f41b8ee`, so every palette in the payload
was produced by the same candidate bytes.

```
NODE_NO_WARNINGS=1 node --experimental-strip-types src/devloop/run.ts \
  --candidate prototypes/p5-fieldfit/candidate.ts \
  --set data/devloop/sets/<SET>
```

| set | run file (`data/devloop/runs/`) | result | `setHash` | feeds |
|---|---|---|---|---|
| `p5-round3-fresh` | `p5-fieldfit-p5-round3-fresh-20260811T185158056Z.jsonl` | 5 ok · 0 failed · 5 hits · 0 computed · 74 ms | `97625315b8491412231e1f2e5628b6879c624742a7d7c6d4f6ada3f431173299` | items 2, 3 |
| `p5-round4-fresh` | `p5-fieldfit-p5-round4-fresh-20260811T185203809Z.jsonl` | 4 ok · 0 failed · 4 hits · 0 computed · 67 ms | `8fa47fef390b016508bb0f8158970f8801fc400d0d80f455468f3a900833f857` | item 1 |
| `p5-round5-fresh` | `p5-fieldfit-p5-round5-fresh-20260811T185547524Z.jsonl` | 5 ok · 0 failed · **0 hits · 5 computed** · 1127 ms | `2a1ab80db129e039a23290d5b39e747094257859c7fab31d904b935541785f08` | items 4–8 |

All three runs: `algorithmVersion` **`p5-fieldfit-0.9.2`**, `preprocessingVersion`
`sharp-0.33.5/srgb/no-resample`, node v25.8.1, `sharp@0.33.5`, `colornames-oklab@0.6.0`,
`apca-w3@0.1.9`, `colorjs.io@0.5.2`.

**The two returning-item runs report 100% cache hits.** The cache is keyed on `codeVersion` + input
content hash, and v0.9.2 had already been run over these sets in this worktree (the v9d measurement
work). Every row's own `palette.metadata.algorithmVersion` reads `p5-fieldfit-0.9.2` and is checked
programmatically — `build-payload.ts` **throws** on any other value, and separately on any other
`preprocessingVersion` — so nothing from an earlier version can reach the payload. The five round-5
covers were genuinely computed: 0 hits, 5 computed.

`p5-round3-fresh`'s `setHash` is identical to round 3's and round 4's payload hash (the set file has
not been touched), and `p5-round4-fresh`'s is identical to round 4's. `p5-round5-fresh` is new and
maps to exactly one hash so far.

**Every colour in `items.json` is copied verbatim from a run row's `palette.roles[*].hex` and
`palette.gradient.stops[*].color.hex`.** `build-payload.ts` reads the `.jsonl` files and copies
fields. Two transformations only, both disclosed and both inherited: `gradient.geometry` is dropped
(caveat C) and stop positions are canonicalised with the server's own `canonicalPosition`
(caveat O — **a no-op this round**, see the caveat). Collapse flags are the run's own
`palette.collapse.{surfaceCollapsed,accentCollapsed}`.

### 1.1 `dirty: false` and `gitCommit: 57f02ee0`, both measured

- `git diff 57f02ee0..HEAD -- research/v3/prototypes/p5-fieldfit/src research/v3/prototypes/p5-fieldfit/candidate.ts`
  → **empty** (HEAD *is* `57f02ee0`).
- `git status --porcelain` over the same two paths → **empty**, at the start and at the end of
  staging.
- Whole-worktree `git status --porcelain` at staging time → **one** untracked line, this directory.

**HEAD did not move during this staging.** Round 4 had to record a concurrent robustness commit
(its caveat P); this round the fingerprint commit and HEAD are the same object. A robustness harness
run may still land a `data/robustness/` commit after this file is written — if it does, the
algorithm diff against `57f02ee0` will be empty and the fingerprint stays honest. Caveat P below is
kept for that reason. **I never ran `git commit`.**

---

## 2. The eight items

Order in `items.json` is ROUND.md's table order. `itemId` is the **full 40-hex filename stem**
(caveat A). `imagePath` is repo-relative and every one resolves under `/Users/Flo/GitHub/palette/`.

| # | itemId | imagePath | provenance |
|---|---|---|---|
| 1 | `ab67616d0000b27300012525e62c7f45baf46c90` | `01/…45baf46c90.jpg` | **returning** — round-4 item 7 (NARCOSIS); run `p5-round4-fresh` |
| 2 | `ab67616d0000b27300125577fb06a6a8942d6547` | `12/…a8942d6547` | **returning** — round-3 item 7, the silent STRONG; run `p5-round3-fresh` |
| 3 | `ab67616d0000b27300094a786a28459646be9b20` | `09/…9646be9b20` | **returning, 3rd time** — round-3 item 6 (UNACCEPTABLE) → round-4 item 3 (acceptable); run `p5-round3-fresh` |
| 4 | `ab67616d0000b27300011897ac9fe3d4b4cd95b2` | `01/…b4cd95b2.jpg` | **fresh** — class *vivid illustration*, §3.1 |
| 5 | `ab67616d00001e0200020fe55990dc2670c3f5a6` | `02/…70c3f5a6.jpg` | **fresh** — class *two-component / panel*, §3.2 |
| 6 | `ab67616d0000b27300036816370505937e5e017c` | `03/…7e5e017c.jpg` | **fresh** — class *gradient-rich (high-chroma plane)*, §3.3 |
| 7 | `ab67616d00001e020001418e127493d543b718cb` | `01/…43b718cb.jpg` | **fresh** — wildcard A, *ordinariness*, §3.4 |
| 8 | `ab67616d0000b27300035026aa41f4f25760ac35` | `03/…5760ac35.jpg` | **fresh** — wildcard B, *diversity from everything served*, §3.5 |

`build-payload.ts` matches each planned cover to run rows by **exact basename** and asserts a single
match, throwing otherwise. (Round 4 matched on a 10-char token; exact basename is strictly tighter
and removes the token-collision question entirely.)

### 2.1 The returning three, against the stated expectations — **NO LOUD STOP, ALL THREE MATCH**

ROUND.md and `measurements/v9d-delta.json` name three accents in advance. **All three match, exactly
— and every other role matches `v9d-delta.json` verbatim too.** The loud-stop condition did not
trigger. It is asserted twice: in `build-payload.ts` (throws before writing) and again in `check.ts`
against the built payload.

| # | cover | predicted accent | published accent | verdict | full published palette |
|---|---|---|---|---|---|
| 1 | `45baf46c90` | `#8d2639` | `#8d2639` | **MATCH** | bg `#e9d3df` → su `#d7e2e4` (2-stop ramp), fg `#161010`, accent `#8d2639` |
| 2 | `a8942d6547` | `#009cff` | `#009cff` | **MATCH** | bg `#120032` → su `#0f002a` (2-stop ramp), fg `#ffffff`, accent `#009cff` |
| 3 | `9646be9b20` | `#7f7ca7` | `#7f7ca7` | **MATCH** | bg = su `#fae8d0` (collapsed), no gradient, fg `#01bdfd`, accent `#7f7ca7` |

**Item 2 is byte-identical to what round 3 served** (`background #120032 / surface #0f002a /
foreground #ffffff / accent #009cff`, 2-stop ramp). The v0.9.0 excursion the coherence gate was
built to stop is not present. That is ROUND.md question (b)'s whole content and it is measured, not
assumed.

**Item 1's accent is a mechanism datum, not just a hex.** Its accent shortlist reads:

| rank | hex | source | mass | chroma | minRawApca |
|---|---|---|---|---|---|
| 1 | `#98a9c3` (the sky) | component | 45730.0 | 0.0424 | 27.27 |
| 2 | **`#8d2639`** (published, the crimson) | **mark** | 41179.0 | **0.1376** | 68.45 |
| 3 | `#5a1921` | component | 23632.9 | 0.0949 | 79.00 |

The crimson is in the pool **because marks are now in it**, and it wins **because the tie-break is
chroma-first** — it is second by mass. Round 4 published rank 1 (the sky blue) and the reviewer's
named ask was the crimson. Both v0.9 changes are visible in this one shortlist.

**Item 2's is the same shape**: rank 1 by mass is `#39367d` (mark, mass 328009, chroma 0.1168, APCA
10.52); the published `#009cff` is rank 2 by mass with chroma 0.1807 and APCA 49.13.

**Item 3's** rank 1 is the published `#7f7ca7` (mark, mass 320540, chroma 0.0648). Its `retreat:
true` — the ink veto — is still landing, exactly as rounds 3 and 4 recorded; the accent moved from
`#000000` to a chromatic mark colour without the field mechanism changing at all. The face-as-field
objection is structurally untouched, deliberately (ROUND.md row 3).

**Diagnostics for the three returning covers** (record only, never payload):

| item | noField | fieldComponents | retreat | gradient | twoBlockFallback | fieldExplainedFraction | residualScale | fg minRawApca (ratio) | coverage |
|---|---|---|---|---|---|---|---|---|---|
| 1 `45baf46c90` | true | 4 | false | **true** | false | 0.1866 | 0.1706 | 85.55 (5.70) | 1 |
| 2 `a8942d6547` | true | 1 | false | **true** | false | 0.0138 | 0.2614 | 109.98 (7.33) | 4 |
| 3 `9646be9b20` | true | 0 | **true** | false | false | 0.0124 | 0.3432 | 32.34 (2.16) | 2 |

---

## 3. Items 4–8 — the selection

### 3.0 Pool, exclusions and the census

**Pool rule, stated before any statistic was read — round-4's rule, UNCHANGED:** every file in
shards `01/`, `02/` and `03/` of the repository root, in shard order 01, 02, 03 and within each
shard in ascending filename (byte) sort. **All three shards whole — 1075 files.**

Holding the pool identical to round 4's is the point, and it is a decision I am stating rather than
leaving implicit: items 4 and 5 re-run round-4's and round-3's gates **verbatim**, and a
"next-best draw" is only interpretable against the same pool. Whole shards also leave the pool with
no cut-off parameter.

**Exclusions, all applied before any statistic was read** (round-4's three-way holdout check kept):

- **the frozen holdout** `data/holdout/holdout.json`, by artwork `id`, by every `files[*].path` and
  by `bestRenditionPath` — **0 hits** (every holdout entry is a `music-artworks/…` path);
- **`data/coverage-set/coverage-set-1.json`, all 220 artworks** (censused in round 3) — **34 hits**;
- **every cover any earlier P5 round DREW** — `demo-20`, `p5-round2-fresh`, `p5-round3-fresh` **and
  now `p5-round4-fresh`** — **4 hits** (round 4's four shard-01/02/03 covers). This is a superset of
  every cover any earlier round **served**;
- **unreadable / undecodable** — **0 hits**.

Every id-shaped exclusion matches on round-3's artwork key (leading 16 hex = rendition size,
trailing 24 = artwork), so a different rendition of an excluded artwork is excluded too.

**1037 covers censused** of 1075 scanned (round 4: 1041 — the difference is exactly round-4's four).

**The census program** is `select-fresh-covers.mjs`, kept beside this file. Its **statistics are
round-3's, unchanged** — `srgbToOklab` and the whole `stats()` body are **byte-identical to
round-4's** (verified by `diff`; including the `.removeAlpha()` fix and the `info.channels === 3`
assertion). Two things are new:

1. the exclusion list gained `p5-round4-fresh.txt`;
2. the program **also censuses the 20 distinct covers rounds 1–4 actually served**, read out of
   those rounds' own `items.json` files rather than re-listed by hand, into `served-census.json`.
   Those rows are reference points for item 8's diversity rule; they are **not** pool members and
   cannot be selected.

**No palette, no diagnostic and no candidate-algorithm call is involved.** The census imports
`sharp` and nothing from `prototypes/`.

**The ranking program** is `rank.mjs`, also kept beside this file. **Every class rule below was
written into that file's header before any ranking was read**, and it was run to produce
`selection.json`. Reading the rules off the program rather than off this prose is the point.

**Cross-class rule, stated before ranking:** classes resolve in the order 4, 5, 6, 7, 8; a cover
selected by an earlier class is removed from every later pool. Pools: 1037 → 1036 → 1035 → 1034 →
1033. (Round 4 also needed an "or nominated" clause; round 5 has no nomination path.)

**Order of operations, and the strict property holds for all five items:** census → rules written →
rank → look at the five artworks → run the dev loop → read palettes → `diagnose.ts`. **No palette
output was seen before the selection was fixed.**

### 3.1 Item 4 — vivid illustration. **THE CLASS MISSES FOR THE THIRD TIME.**

**Rule (stated before ranking), ROUND.md's own — round-4 §3.2's inverted gate verbatim:**
`flatFrac ≥ 0.20` **and** `topBinShare ≥ 0.15`; rank survivors by `vividFrac` descending, take rank
1. The photo gate's third term (`distinctBins ≥ 500`) is **dropped, not inverted** — round 4's
stated reasoning, unchanged: it is a busyness gate and demanding busyness of a flat-fill
illustration would contradict the two inverted terms.

**The miss risk was disclosed in `rank.mjs`'s header before the draw, and not mitigated:** round 4
ran this identical gate over this identical pool and drew a near-solid colour field; its §3.2
concluded that **neither the photo gate nor its inversion encodes "illustration"**. Round 5 re-runs
it on the same pool minus round-4's pick, so rank 1 here is **round-4's runner-up promoted**, and
another miss was the likely outcome before the draw. ROUND.md accepts that trade explicitly.

**Pool after the gate: 282 of 1037.**

**Rank 1: `ab67616d0000b27300011897ac9fe3d4b4cd95b2`** — `vividFrac 0.9846`, `flatFrac 0.9646`,
`topBinShare 0.7356`, `distinctBins 49`, `meanC 0.161`, `p90C 0.1634`, `fieldMedianL 0.615`,
`fieldMedianC 0.1632`, `detail 0.0043`.

**Runners-up:** `01/…b01299c4` (0.9712), `01/…50d9fa8e` (0.9282), `01/…350193bf` (0.9216),
`03/…30394775` (0.9141), `01/…fc037795` (0.9087), `03/…aaa7ba1ea` (0.9070). Rank 1 clears rank 2 by
0.013 on the rank key; no tie-break was needed.

**Honest description** (looked at after selection, before its palette was read): a **flat solid green
field** filling the whole frame, with a small black-and-white **Parental Advisory / Japanese
"explicit content" sticker** in the lower-left corner. Nothing else. No display type, no
illustration.

**LOUD — the class has now missed three times, in three different directions, and the misses are
informative:**

| round | gate | what it drew |
|---|---|---|
| 3 | photo gate (`flatFrac ≤ 0.20 ∧ topBinShare ≤ 0.15 ∧ distinctBins ≥ 500`) | an illustration, *by accident* |
| 4 | the gate inverted on its two shape terms | a near-solid blue with a faint wireframe line (`distinctBins 6`) |
| 5 | the same inverted gate, next-best | a **literally solid** green with a corner sticker (`distinctBins 49`, `detail 0.0043`) |

Item 4's grade is evidence about a **solid colour field with a small high-contrast corner mark**. It
is **not** evidence about vivid illustration as ROUND.md's row means it. Per ROUND.md's outcome rule
for row 4, this is "another miss": **the class is recorded as un-censusable by the current
statistics and goes to the reviewer as a known hole in this arm's draw protocol.** The rule was not
changed, relaxed or re-picked; it was stated in advance and its output is reported as drawn.

### 3.2 Item 5 — two-component / panel

**Rule (stated before ranking) — round-3 §3.2's rule, verbatim** (round 4 used it verbatim too, so
round-3 item 5, round-4 item 7 and round-5 item 5 are three comparable draws):
`splitR2 ≥ 0.50` **and** `splitDeltaE ≥ 0.15` **and** `splitBalance ≥ 0.25`; rank survivors by
`splitR2` descending, take rank 1.

**Pool after the gate: 47 of 1036.**

**Rank 1: `ab67616d00001e0200020fe55990dc2670c3f5a6`** — `splitR2 0.8712`, `splitDeltaE 0.2485`,
`splitBalance 0.5000`, `splitAxis h`, `splitAt 0.5`, `fieldBlockRange 0.4341`, `fieldMedianL 0.7405`,
`fieldMedianC 0.0752`. (This is exactly round-4's runner-up #1 for the same class, promoted now that
round-4's pick is excluded.)

**Runners-up:** `01/…0ffcbe42` (0.8513), `02/…04d9b7c3` (0.8509), `02/…56c4f5ca` (0.8032),
`03/…da89643a` (0.7752), `02/…af227281` (0.7634), `01/…ad0e0e81` (0.7152). Rank 1 clears rank 2 by
0.020.

**Honest description:** a photograph of farmland. Pale blue sky with thin white cloud fills the upper
~45%; below the horizon, a tan/beige harvested field on the left and green sown crop rows sweeping
across the right and foreground. No type at all. The horizontal split at 0.5 is exactly what
`splitAt` says.

**Flagged, carried from round-3 §3.2 and round-4 §3.3 and now three-for-three:** this is again a
**photographic** two-component cover, not a graphic panel layout, and no stated statistic
distinguishes those. The class draws photographs every time. That is now a pattern, not an accident,
and it is the same shape of finding as §3.1's: the split statistic encodes *geometry*, and
"panel layout" is a *semantic* property.

### 3.3 Item 6 — gradient-rich (high-chroma plane)

**Rule (stated before ranking) — round-3 §3.6's rule, verbatim:** `fieldMedianC ≥ 0.09` **and**
`fieldVectorPlaneR2 ≥ 0.60` **and** `fieldVectorAmplitude ≥ 0.06`; rank survivors by `fieldMedianC`
descending, take rank 1. The terms read "the field carries real colour", "the field's OKLab vector
varies as a plane rather than as noise or panels" and "the plane actually goes somewhere across the
frame".

**Pool after the gate: 7 of 1035.** (The narrowest gate in the round — this class is genuinely rare.)

**Rank 1: `ab67616d0000b27300036816370505937e5e017c`** — `fieldMedianC 0.1898`,
`fieldVectorPlaneR2 0.6126`, `fieldVectorAmplitude 0.3771`, `fieldPlaneR2 0.6817`,
`fieldMedianL 0.3134`, `vividFrac 0.7197`, `flatFrac 0.3676`, `detail 0.0149`.

**Runners-up:** `01/…306c64d3` (0.1436), `03/…9af2a14e` (0.1396), `01/…4a22c499` (0.1035),
`03/…592c8b20` (0.1026), `03/…9525d82c` (0.0940), `01/…9525d82c` (0.0934) — see caveat Y about the
last two, which are two renditions of one artwork.

**Honest description:** a photograph seen through a large circular porthole/vignette that fills most
of the square. Inside the circle, a studio lit in deep blue: a person seated on a chair in
silhouette, a lighting stand with a cyan-white lamp at centre-left, a second lamp at the right edge
with a small warm-orange flare, and a bright cyan-blue pool of light on the wall behind. The circle
falls off from bright cyan-blue at centre-right to deep indigo at the edges; outside it the corners
are near-black with a diagonal-striped rim on the left. No type.

This is the round's only genuinely well-drawn class: the artwork **is** a smooth high-chroma plane in
blue, which is what the rule asks for.

### 3.4 Item 7 — wildcard A: the pool's most ORDINARY cover

**Rule (stated before ranking) — round-4 §3.4's rule, verbatim**, so the two ordinariness draws are
comparable: over the six statistics `fieldMedianL`, `fieldMedianC`, `flatFrac`, `detail`, `splitR2`,
`vividFrac`, compute each cover's percentile rank within the pool remaining at this point, score it
`Σ |percentile − 0.5|`, rank **ascending**, tie-break stem ascending, take rank 1.

**Pool: 1034** (no gate; the rule ranks the whole remaining pool).

**Rank 1: `ab67616d00001e020001418e127493d543b718cb`** — ordinariness score **0.5324**;
`fieldMedianL 0.4334`, `fieldMedianC 0.0631`, `flatFrac 0.0593`, `detail 0.0473`, `splitR2 0.1798`,
`vividFrac 0.0403`, `topBinShare 0.0815`, `markLightShare 0.4177`, `textureIndex 0.8233`. (Round-4's
runner-up #1 for the same rule, promoted; its score shifts from 0.5299 to 0.5324 only because the
pool shrank by four covers, which is the percentile denominator.)

**Runners-up:** `01/…6a7ad7ba` (0.5353), `03/…a01972b2` (0.5770), `03/…3ef57ed2` (0.5954),
`02/…f84ff23f` (0.5973), `03/…7c5066fc` (0.6167), `01/…342435ff` (0.6341).

**Honest description:** a commercial karaoke product cover. On the left, a photograph of a woman
singing into a large studio microphone, warm skin tones against a teal/blue-grey background; upper
right, a white logo lockup reading *Musical Creations — Performance Tracks* with a green treble clef;
lower right, large white capitals **KARAOKE** on a dark navy band. Busy, mixed, commercial — exactly
the "no distinguishing property" the rule asks for.

### 3.5 Item 8 — wildcard B: DIVERSITY from everything already served

**Rule (stated before ranking), and it is a DIFFERENT rule from item 7's by construction** — item 7
maximises typicality *within the pool*; item 8 maximises distance from *what the reviewer has
already been shown*, which is a property of the review history, not of the pool:

> over the twelve statistics `fieldMedianL`, `fieldMedianC`, `fieldBlockRange`, `flatFrac`,
> `topBinShare`, `distinctBins`, `detail`, `textureIndex`, `splitR2`, `splitDeltaE`, `vividFrac`,
> `markLightShare`, z-standardise each axis using the **mean and SD of the pool remaining at this
> point**, apply the same pool mean/SD to the **20 covers rounds 1–4 actually served**, and for each
> pool cover compute the **minimum** Euclidean distance to any served cover in that space. Rank
> **descending** on that minimum (tie-break stem ascending), take rank 1.

Max-**min** distance is deliberate: rank 1 cannot be near *any* previously served cover, rather than
merely far from their average.

**Pool: 1033.** Served reference set: **20** distinct covers (the union of rounds 1–4's `items.json`,
read from those files by the census program).

**Rank 1: `ab67616d0000b27300035026aa41f4f25760ac35`** — `minDistanceToServed` **7.2971**, nearest
served cover `…ca2eff2a4a` (round 1's black cover). Pool **median** min-distance is **2.474**, so
rank 1 sits at 2.95× the median: it is genuinely far out, not a hair's breadth win.
Statistics: `fieldMedianL 0.1867`, `fieldMedianC 0.0000`, `fieldBlockRange 0.0929`, `flatFrac 0.8192`,
`topBinShare 0.8171`, `distinctBins 6`, `detail 0.0047`, `textureIndex 0.7596`, `splitR2 0.5345`,
`splitDeltaE 0.0317`, `vividFrac 0.0000`, **`markLightShare 0.9211`**, `markFrac 0.0186`,
`meanC 0.0000`.

**Runners-up:** `02/…da73d67e` (6.6855), `01/…b01299c4` (6.5522), `01/…1b2fe263` (6.3445),
`01/…c5d844f9` (6.1034), `01/…6577a807` (6.0890), `03/…5b320f56` (5.8411).

**Honest description:** a near-black photographic render — a shrouded figure seated on a low bench,
facing away, draped head to foot in dark cloth, against an almost featureless black ground. The only
visible modulation is faint grey highlights on the fabric folds and on the bench edge. No type.

**This is the exact mirror of round-4's item 5, and that is a gift the rule produced without being
asked to.** Round 4's item 5 was a **light** field whose marks were barely darker than it
(`markLightShare 0.5636`, published `#dcdcdc` on `#fafafa` at raw APCA 17.85). Item 8 is a **dark**
field whose marks are barely lighter than it — `markLightShare 0.9211`, publishing `#585858` on
`#171717` at raw APCA 18.98. **That 0.9211 is the exact number round-4 §3.1 reported as "maximum
`markLightShare` anywhere in the pool… on covers that are not light fields": this is that cover.**
It is rank 1 on that statistic in the round-5 census too, by a wide margin (rank 2 is 0.7684) — and
the diversity rule found it without ever looking at `markLightShare` alone.
The foreground-legibility floor now has evidence from **both** ends of the lightness range, on
covers drawn by two unrelated rules.

### 3.6 `diagnose.ts` on the fresh five — record only, NOT payload

```
NODE_NO_WARNINGS=1 node --experimental-strip-types prototypes/p5-fieldfit/diagnose.ts <absolute image path>
```

| item | noField | components | retreat | gradient | twoBlockFallback | fieldExplainedFraction | residualScale | escape | coverage | massRetained |
|---|---|---|---|---|---|---|---|---|---|---|
| 4 `b4cd95b2` | false | 0 | false | false | false | 0.9853 | 0.0000 | null | **3** | 1.0000 |
| 5 `70c3f5a6` | **true** | 3 | false | **true** | false | 0.4343 | 0.0986 | null | 2 | 0.7819 |
| 6 `7e5e017c` | **true** | 3 | false | **true** | false | 0.4873 | 0.0925 | null | **0** | 0.8559 |
| 7 `43b718cb` | **true** | 2 | false | false | **true** | 0.3381 | 0.1284 | null | 2 | **0.4571** |
| 8 `5760ac35` | false | 0 | false | **true** | false | 0.9757 | 0.0061 | null | 2 | 0.9991 |

Published palettes, for reading alongside:

| item | background | surface | foreground | accent | gradient | collapse |
|---|---|---|---|---|---|---|
| 4 | `#009f4e` | `#009f4e` | `#ffffff` | `#050505` | null | **surface** |
| 5 | `#b7c9d7` | `#92bad4` | `#b2944e` | `#80532a` | 2-stop | — |
| 6 | `#3430c5` | `#04040e` | `#0075cd` | `#0075cd` | 2-stop | **accent** |
| 7 | `#1e4e5c` | `#545655` | `#348191` | `#a15734` | null | — |
| 8 | `#171717` | `#10100e` | `#585858` | `#3a3a3a` | 2-stop | — |

Five readings the reviewer's grades should be joined against:

**Item 4 — the solid field works, and the sticker carries the whole palette.** `coverage 3`,
`massRetained 1.0`, family rank 1 is `#009f4f` at mass fraction **1.0**. Foreground `#ffffff` and
accent `#050505` both come from the corner Advisory sticker: fg shortlist rank 1 `#ffffff`
(mass 1098, APCA 69.60), accent shortlist rank 1 `#000000` (mass 584) with the **published accent
`#050505` at rank 2**. Foreground legibility is the round's best by far (ratio **4.64**), and the
`foreground×accent` margin is 11.89× the bar. A palette drawn entirely from a ~2%-area corner
sticker is a real question about salience vs mass — asked here on the cleanest possible artwork.

**Item 5 — the green is in the family list and reaches no role.** `assignment.families` rank 3 is
`#707e31` (a green) at mass fraction **0.114**; the published palette is sky-blue field, tan
foreground, brown accent. The crop rows are the artwork's most distinctive mass and the reviewer will
see none of them. This is cross-arm note 1 (identity coverage) landing on a fresh cover, and it is
**this round's instance of the round-4 caveat T shape** — see caveat U. Its foreground
`#b2944e` publishes at raw APCA **15.71** against a floor of 15 — ratio **1.047**, the narrowest
foreground margin any P5 round has staged. The accent shortlist's rank 1 was `#dedde2` (cloud white,
mass 162, APCA 15.40); the published `#80532a` is rank **3** (mass 52, APCA 42.86), i.e. chroma-first
moved the accent off a near-white — the v0.9 change doing visible work.

**Item 6 — the accent shortlist is EMPTY and the accent collapsed.** `accentShortlist: []`,
`perRoleOnly.accent: null`, `coverage 0`, `fieldCovered []`. The foreground shortlist holds exactly
two entries, both the same blue (`#0075cd` mass 3299, `#006cce` mass 2549). So the published palette
is a blue ramp plus one blue: `background #3430c5 → surface #04040e`, `foreground = accent #0075cd`.
**This is the second payload item in any P5 round with `accentCollapsed: true`** (round-4 item 6 was
the first) and, like that one, it happens where the overlay offers a single colour. The artwork's
warm-orange lamp flare and its cyan highlight reach nothing. `foreground×accent` margin ratio is
**0** by construction.

**Item 7 — the two-block fallback, the lowest mass retention in the round, and a yellow that lost.**
`twoBlockFallback: true`, `massRetained 0.4571`, `fieldCovered [1,2]`. The foreground shortlist:

| rank | hex | source | mass | chroma | minRawApca |
|---|---|---|---|---|---|
| 1 | **`#348191`** (published) | overlay | 1505.6 | 0.0783 | **16.24** |
| 2 | `#3a909f` | overlay | 925.0 | 0.0842 | 22.69 |
| 3 | `#38899a` | overlay | 867.0 | 0.0817 | 19.73 |
| 4 | `#a86845` | overlay | 341.0 | 0.0961 | 16.48 |
| 5 | `#ffc700` | overlay | 306.0 | **0.1749** | **62.93** |

Mass chose a teal that clears the legibility floor by 1.083×, over a yellow with 3.9× the contrast at
one-fifth the mass. The artwork's large white **KARAOKE** display type does not appear in the
shortlist at all. If the reviewer objects to this foreground, the objection is about mass-led
foreground ranking, and item 5's `#b2944e` (ratio 1.047) is the same objection on a different cover.

**Item 8 — four near-blacks, and the narrowest published pair in P5's record.** The
`foreground×accent` margin is **1.504×** the same-colour bar (`#585858` vs `#3a3a3a`) — the smallest
ratio any P5 round has published; cross-arm note 6 says the reviewer calls exactly this
"indistinguishable". The accent shortlist's rank 1 was `#2a2a2a` (APCA 3.80); the published `#3a3a3a`
is rank **4** (APCA 8.16), so the accent floor did push upward — and still landed 1.5× off the
foreground. Foreground legibility: raw APCA **18.98**, ratio **1.265**.

**Round-level, and it is the strongest single pattern in the fresh five:** four of the five fresh
covers publish a foreground within **1.05–1.27×** of the raw-APCA floor of 15 — 15.71 (item 5),
16.24 (item 7), 17.98 (item 6), 18.98 (item 8). Only item 4 (69.60, ratio 4.64) is clear of it. See
caveat V: several legibility complaints in this round would be **one** mechanism, not four.

---

## 4. What is in each file

**`items.json`** — a bare JSON **array** of 8 calibration items, each with exactly five keys:
`itemId`, `imagePath`, `variantId`, `fingerprint`, `palette`. No batch envelope: the installer
supplies `batchId`, `purpose` and `fundedBy`.

`variantId` is `"p5-fieldfit-0.9.2"` on every item; `fingerprint` is
`{algorithmVersion: "p5-fieldfit-0.9.2", preprocessingVersion: "sharp-0.33.5/srgb/no-resample",
gitCommit: "57f02ee0", dirty: false}` on every item.

**`render-data.json`** — an **object keyed by `itemId`**, each value `{ roles, gradient, fieldCss }`:

- `roles` — four entries in fixed order `background, surface, foreground, accent`, each
  `{ role, hex, name, collapsed }`. `name` comes from `nameHexes()` (`src/review-server/color.ts:62`,
  the one `colornames-oklab` call site). `collapsed` is `false` for background and foreground by
  construction, and the palette's own `surfaceCollapsed` / `accentCollapsed` for the other two.
- `gradient` — the stops verbatim, or `null`.
- `fieldCss` — produced by the **pinned renderer**, `fieldCss()` at
  `src/review-server/gradient.ts:119`.

**Blinding.** Neither served file contains a prototype name, a mechanism label, a version string, a
diagnostic, a before/after framing or any round metadata. `variantId` and `fingerprint` do name the
algorithm, deliberately — they are TRUE names the server keeps and never serves. The leak scan in §5
covers everything else.

**`select-fresh-covers.mjs`, `rank.mjs`, `build-payload.ts`, `check.ts`, `census.json`,
`served-census.json`, `selection.json`, the eight `diagnose-*.json` files, `STAGING-REPORT.md` and
this file are staging artefacts, not payload. They must not be pushed.**

---

## 5. Validation

`check.ts`, kept beside this file, run from `research/v3`. **29 checks, all passed** — round-4's 28
plus the returning-accent assertion this round's brief requires.

```
PASS  items.json parses as an array of 8 — 8 items
PASS  8 unique itemIds
PASS  every itemId is a server-legal id token
PASS  every itemId is a full 40-hex stem
PASS  every hex matches ^#[0-9a-f]{6}$ — 42 hexes checked, bad: none
PASS  every imagePath exists under the MAIN checkout — 8/8 resolve
PASS  no imagePath is absolute
PASS  every itemId is its imagePath's filename stem
PASS  the three returning covers publish the accents ROUND.md / v9d-delta.json predicted — 45baf46c90=#8d2639(want #8d2639) a8942d6547=#009cff(want #009cff) 9646be9b20=#7f7ca7(want #7f7ca7)
PASS  gradient ends are background -> surface — 5 gradient items
PASS  gradient positions in [0,1] and strictly increasing at 6 dp
PASS  gradient ends sit at 0 and 1
PASS  gradient stop counts within 2..4
PASS  no gradient carries a non-string geometry
PASS  every item has both collapse booleans and required fields
PASS  collapse flags agree with hex equality (surface~background, accent~foreground)
PASS  items.json items carry exactly the 5 push keys
PASS  fingerprint is uniform and names v0.9.2 at 57f02ee0, dirty false
PASS  render-data has one entry per itemId
PASS  every render entry has 4 named roles in order
PASS  render hexes and collapse flags match items.json verbatim
PASS  render names are the current colornames-oklab output
PASS  fieldCss is the pinned renderer's output for every item
PASS  render entries carry exactly roles/gradient/fieldCss
PASS  no diagnostics / mechanism labels / version labels in any served field — clean
PASS  the "E2" mechanism label, word-bounded and case-sensitive
PASS  "e2" over the served colour NAMES only (hex-free text) — names: 38 words
PASS  parseCalibrationBatch OK: 8 items, purpose calibration
PASS  round-trip identical (palettes byte-identical after parse)

--- served-name notes (not checks) ---
NOTE  27 distinct names over 32 served role names
NOTE  cross-item name collision: "Snow" on items 2, 4 (hexes #ffffff)
NOTE  ONE NAME, TWO DIFFERENT HEXES: "Narwhal Grey" -> #120032, #0f002a

ALL CHECKS PASSED
```

**The parser dry run** feeds the 8 items (with `imagePath` rewritten to absolute) to
`parseCalibrationBatch` from `src/review-server/batch.ts`; every palette comes back **byte-identical**
under `JSON.stringify` comparison. It does **not** exercise `pushCalibration`'s later stages (path
allowlist, `sharp.metadata()` on the file header, batch-log write), so the live push is still the
real test.

**`collapse flags agree with hex equality` — the pairing, since it is not symmetric.**
`surfaceCollapsed` pairs `surface` with `background`; `accentCollapsed` pairs `accent` with
**`foreground`** (`src/contract/constants.ts:65`, `src/contract/invariants.ts:737`). Load-bearing
again this round: item 6 has `accentCollapsed: true` with `accent === foreground === "#0075cd"`, and
item 4 has `surfaceCollapsed: true`.

**Notes on the leak scan.** Round 2's: `"round"` cannot be used as a token — `background` and
`foreground` contain it. Round 3's: **`"e2"` cannot be used over colour data** — item 1's surface is
`#d7e2e4`, a served hex; so `"e2"` is scanned two ways (word-bounded case-sensitive `\bE2\b` over
the whole serialized payload, and case-insensitively over the served colour **names** alone, which
carry no hex). Both clean. **Round 5's four added tokens — `coherence`, `gate`, `identity`,
`crimson` — are all hex-safe** (`g`, `t`, `i`, `r`, `s`, `n`, `o`, `h`, `y`, `m` are not hex digits,
so no `#rrggbb` string can contain any of them) and clean over the 38 served name words.

Full token list scanned case-insensitively over `render-data.json` plus every item's `itemId` /
`imagePath` / `palette`: `p5`, `fieldfit`, `field-fit`, `v0.`, `0.3.0`, `0.5.1`, `0.6.0`, `0.8.2`,
**`0.9.0`**, **`0.9.1`**, **`0.9.2`**, `explf`, `nofield`, `round-1`…`round-5`, `round 2`…`round 5`,
`before`, `after`, `twoblock`, `two-block`, `retreat`, `component`, `smooth`, `prototype`,
`calibration`, `diagnos`, `class`, `union`, `coverage`, `escape`, `census`, `returning`, `fresh`,
**`coherence`**, **`gate`**, **`identity`**, **`crimson`**. **Zero hits.**

---

## 6. §names — the served-name check (NEW this round, cross-arm note 8)

ROUND.md's first staging-protocol addition. Cross-arm note 8: *"the reviewer grades partly from the
colornames-oklab display names — a wrong-reading name can cost a grade even on a defensible hex"*,
with P5's own corroboration being cal-020 item 3's note, which **led** with "Sushi Rice beige is a
very weak pick".

**Every one of the 32 served role names was eyeballed against its colour and against the role that
colour plays in the artwork. No hex was changed and none may be — this section is flags only.** The
name pipeline is pinned server-side and is not P5's to change.

**27 distinct names over 32 role slots.**

| # | role | hex | served name | reads |
|---|---|---|---|---|
| 1 | background | `#e9d3df` | Sugared Almond | ok — pale pink, and the sky's pink haze |
| 1 | surface | `#d7e2e4` | Mist | ok — pale blue-grey |
| 1 | foreground | `#161010` | Iron Black | ok — the near-black type |
| 1 | accent | `#8d2639` | **Caponata** | **FLAG (moderate)** — see below |
| 2 | background | `#120032` | **Narwhal Grey** | **FLAG (high)** — see below |
| 2 | surface | `#0f002a` | **Narwhal Grey** | **FLAG (high)** — same name, different hex |
| 2 | foreground | `#ffffff` | Snow | ok (but see the cross-item collision) |
| 2 | accent | `#009cff` | Dodger Blue | ok — accurate and vivid |
| 3 | background | `#fae8d0` | **Sushi Rice** | **FLAG (highest)** — see below |
| 3 | surface | `#fae8d0` | **Sushi Rice** | same hex, genuine collapse — but the name repeats in the swatch list |
| 3 | foreground | `#01bdfd` | Capri | ok — a bright cyan, and Capri is a blue |
| 3 | accent | `#7f7ca7` | **Mecha Metal** | **FLAG (moderate)** — see below |
| 4 | background | `#009f4e` | Shamrock Green | ok — accurate |
| 4 | surface | `#009f4e` | Shamrock Green | same hex, genuine collapse |
| 4 | foreground | `#ffffff` | Snow | ok |
| 4 | accent | `#050505` | Blackout | ok — accurate |
| 5 | background | `#b7c9d7` | Rain Check | weak — an idiom, not a colour word, but it reads sky-ish |
| 5 | surface | `#92bad4` | **Ghost** | **FLAG (moderate)** — a clearly mid-blue named as a pale/white word |
| 5 | foreground | `#b2944e` | Faded Gold | ok — the harvested field's tan |
| 5 | accent | `#80532a` | Annatto | weak — obscure, but annatto genuinely is this red-brown |
| 6 | background | `#3430c5` | **Inkwell** | **FLAG (moderate)** — a saturated royal blue named as near-black ink |
| 6 | surface | `#04040e` | Deepest Night | ok — accurate |
| 6 | foreground | `#0075cd` | **Belly Flop** | **FLAG (moderate)** — a joke name with no colour content on the cover's headline blue |
| 6 | accent | `#0075cd` | **Belly Flop** | same hex, genuine collapse — the joke name lands twice in one item |
| 7 | background | `#1e4e5c` | Harbour Slate | ok — dark teal |
| 7 | surface | `#545655` | Iron Grey | ok — neutral grey |
| 7 | foreground | `#348191` | Dusty Cerulean | ok — teal-cyan |
| 7 | accent | `#a15734` | Churro | weak — food name, but it reads warm brown |
| 8 | background | `#171717` | Umbra | ok |
| 8 | surface | `#10100e` | Obsidian | ok |
| 8 | foreground | `#585858` | **Iron** | **FLAG (mild)** — near-collision with item 7's "Iron Grey" |
| 8 | accent | `#3a3a3a` | Graphite | ok |

### 6.1 The flags, in priority order

**1. `#fae8d0` → "Sushi Rice", item 3, twice (background and surface).** This is **the** known
instance: cal-020's note on this very cover led with *"Sushi Rice beige is a very weak pick"*. The
name recurs verbatim, on the same cover, on its third appearance in the review sequence, and now on
**two** swatches because the surface collapsed onto the background. Item 3 is the item ROUND.md
question (c) turns on — whether the identity direction buys a grade. **If item 3's grade stays flat
and the note again names the field colour, the name is a live confound and the analysis must not
read that note as evidence about the hex.** Recorded, not changed.

**2. `#120032` and `#0f002a` → both "Narwhal Grey", item 2.** Two problems at once. (a) Both hexes
are **saturated dark indigo**, not grey — the name misdescribes the hue outright. (b) They are two
**different** hexes carrying **one** name, so the reviewer's swatch list shows the ramp's two ends as
the same colour with the same label; the ramp reads as flat in the swatches even though `fieldCss`
renders it as a gradient. Round 3 hit exactly this defect (its caveat G: item 7's two ramp ends both
read "Narwhal Grey" — **the same cover**), round 4 was free of it, and it is back because the cover
is back. Item 2 is the round's silence test: **a note about the field's colour or "two identical
swatches" on item 2 may be a name artefact rather than a coherence-gate failure.** This is the single
most likely way this round's question (b) gets misread.

**3. `#8d2639` → "Caponata", item 1.** The colour is a deep crimson/wine and the name is an
aubergine-and-tomato stew. It is not *wrong* — caponata is roughly this colour — but it carries no
colour word, and this hex is **the round-4 named ask being delivered**: the reviewer asked for the
crimson and the swatch that answers them says "Caponata". ROUND.md's outcome rule for item 1 turns on
whether the reviewer names another colour; a name that does not say "crimson" or "wine" makes it
harder for them to recognise that their ask was met. Flagged precisely because item 1 is where a
grade is being read as an answer to a request.

**4. `#7f7ca7` → "Mecha Metal", item 3's accent.** The colour is a muted violet-grey; the name says
"metal", i.e. neutral. Item 3's accent is the round's *chromatic* answer to round 4's "black accent…
losing identity" objection, and its name argues the opposite of the change it represents.

**5. `#92bad4` → "Ghost", item 5's surface.** "Ghost" reads as near-white; the hex is an unmistakable
mid blue. This is a plain hue/lightness mis-read of the kind note 8 describes.

**6. `#3430c5` → "Inkwell", item 6's background.** A bright royal blue named after black ink. Item 6's
field is a blue ramp from this colour into near-black `#04040e` ("Deepest Night"); the two names
suggest two darks, the two hexes are a vivid blue and a black.

**7. `#0075cd` → "Belly Flop", item 6's foreground *and* accent.** A pure joke name with no colour
content, shown twice in one item because the accent collapsed. On the artwork's single defining blue
this is the weakest name in the payload on the "does it describe the colour" axis, though unlike the
Sushi Rice case there is no evidence yet that a joke name costs a grade.

### 6.2 Cross-item name collisions (names occurring on 2+ items)

**Exactly one, and it is benign: "Snow" on items 2 and 4** — both `#ffffff`, i.e. the same colour,
correctly given the same name. Nothing to fix; recorded because the brief asks for every 2+-item
name and because a reviewer moving through the sequence will see "Snow" twice.

**One near-collision worth the same treatment: "Iron Grey" (`#545655`, item 7 surface) and "Iron"
(`#585858`, item 8 foreground)** — different hexes on different items, three lightness units apart,
names differing by one word. Adjacent in the sequence. Not a defect, but if the reviewer reports
"the same grey twice", this is why.

**Within-item name repeats, all three of which are genuine collapses correctly displayed:** item 3
"Sushi Rice" ×2 (`surfaceCollapsed`), item 4 "Shamrock Green" ×2 (`surfaceCollapsed`), item 6
"Belly Flop" ×2 (`accentCollapsed`). The only same-name-different-hex case in the payload is item 2's
"Narwhal Grey", flag 2 above.

---

## 7. Payload caveats an installer must act on

Caveats **A–T are carried over from `round-4/STAGING.md` §6** and re-verified against this payload;
**U–Y are new to this round.**

**A. `itemId` is the FULL 40-hex filename stem, not the 10-char token ROUND.md uses.** Unchanged from
rounds 1–4 and unchanged deliberately: switching now would make earlier feedback un-joinable on the
item handle. All eight pass `ID_PATTERN` (`batch.ts:32`).

**B. `imagePath` is repo-relative and MUST be rewritten to absolute before the push.**
`parseCalibrationBatch` requires `isAbsolute(imagePath)` (`batch.ts:219`). Prefix with
`/Users/Flo/GitHub/palette/` — the **main checkout**, not the worktree; the server's `imageRoots`
allowlist defaults to `REPO_ROOT` (`server.ts:460`). All 8 files were verified present there.

**C. `gradient.geometry` was dropped, deliberately.** The run emits an object
(`{kind, angleDegrees}`); the server requires a string of ≤64 chars when present (`batch.ts:104`),
and the pinned renderer fixes display at 135° (`gradient.ts:33`).

**D. Where the push shape was read from** — `src/review-server/README.md` "Calibration mode";
`server.ts:2462` (`POST /api/calibration` → `pushCalibration`, defined `server.ts:677`);
`batch.ts:205-242` (`parseCalibrationBatch`), `:107` (`parsePalette`), `:129-133`
(`parseFingerprint`, where `dirty` is required and never defaulted), `:72-105` (`parseGradient`),
`:110-117` (both collapse booleans required).

**E. `purpose` defaults to `calibration`** (`batch.ts:207`); `fundedBy` defaults to `[]`
(`batch.ts:212`) and was **not** invented here. The installer owns that list.

**F. The side-car shape is a MAP, not the `{batchId, items:[…]}` envelope the older side-cars use.**
`render-data.json` maps `itemId → { roles, gradient, fieldCss }`. Confirm before pushing.

**G. `render-data.json` names are the CURRENT `colornames-oklab@0.6.0` output** (the version all
three run headers record). Names are presentation-only. **This round §6 is the full treatment** — 27
distinct names over 32 slots, one same-name-different-hex pair (item 2's "Narwhal Grey"), one benign
cross-item repeat ("Snow"), and seven named flags. Read §6 before the push; nothing there is a
blocker, but two of the flags bear directly on how this round's grades must be read.

**H. Five items carry a gradient; three are flat.** Items 1, 2, 5, 6, 8 ramp; items 3, 4, 7 are flat.
Every ramp starts at `background` (position 0) and ends at `surface` (position 1).

**I. Two distinct field colours do not reach the rendered field when `gradient` is `null` — and
THIS ROUND IT BITES.** `fieldCss()` renders the flat background alone whenever `gradient` is `null`.
Items 3 and 4 collapse surface onto background, so nothing is lost there. **Item 7 does not**:
`background #1e4e5c` (dark teal) and `surface #545655` (neutral grey) are distinct, `gradient` is
`null`, and `fieldCss` is the flat `#1e4e5c`. The reviewer sees the grey **only as a swatch**, never
as field. See caveat X.

**J. Filename extensions.** Six of eight carry `.jpg`; **items 2 (`12/…a8942d6547`) and 3
(`09/…9646be9b20`) are extensionless.** `sharp` reads the header, not the name, so decode is
unaffected, but `src/devloop/serve.ts:295` falls back to `application/octet-stream` for an unknown
extension, so a browser preview served through the dev loop **may not display items 2 and 3**. Round
4 had one such item; this round has two, and both are returning covers whose comparison to earlier
rounds is the point.

**K–M (round-3's class caveats).** K (a slot carried the wrong class) does not recur. L has inverted
into caveat R. M does not recur — this round has no painted/textured class.

**N. Set-file / run-file pinning.** `p5-round3-fresh.txt` still maps to two setHashes in the run
directory (round-3 §1); this round's row uses `…185158056Z.jsonl` at setHash `9762…3299`, the
payload hash used by rounds 3 and 4 as well. `p5-round5-fresh.txt` is new and maps to exactly one
hash, `2a1a…5f08`. **Pin the run file, not the set name.**

**O. Stop-position canonicalisation is a NO-OP this round.** All five ramps are 2-stop at positions
0 and 1 exactly, so `canonicalPosition` changed nothing — unlike round 4, where two 3-stop ramps
carried float tails. The transformation is still applied (it is what guarantees the byte-identical
round trip) and the round trip passes.

**P. The fingerprint commit IS HEAD this round: `57f02ee0`.** Round-4's caveat P (fingerprint/HEAD
mismatch caused by a concurrent robustness commit) does **not** apply as written. The concurrent
robustness harness may still commit a `data/robustness/` report after this file is written; if it
does, `git diff 57f02ee0..HEAD -- research/v3/prototypes/p5-fieldfit/` will be empty and the
palettes reproduce at either commit. **Do not read such a mismatch as a stale payload.**

**Q. Ramp geometry is UNIFORM this round.** The pinned renderer uses a 35% reserve for 2-stop ramps
and 10% for 3-or-more (`gradient.ts:23,30`). All five ramps are 2-stop, so every gradient item
renders as `linear-gradient(135deg in oklab, A 35%, B 100%)`. Round 4 mixed the two conventions in
one round; round 5 does not, which makes cross-item field comparison cleaner than last round's.

**R. Item 4 is a solid colour field with a corner sticker, not a vivid illustration — the THIRD
consecutive miss for this class.** §3.1. **ROUND.md row 4's outcome rule applies in its "another
miss" branch:** the class is un-censusable by the current statistics and goes to the reviewer as a
known hole in the draw protocol. Item 4's grade is evidence about a solid field with a small
high-contrast corner mark. Say so in the write-up or the round will be read as a like-for-like
illustration test.

**S. Item 6 carries `accentCollapsed: true` and its accent shortlist was empty.** `#0075cd` is both
foreground and accent. If the review UI renders the accent swatch identically to the foreground
swatch, item 6 will look like a rendering bug rather than a collapse. **Confirm the UI shows the
collapse flag before pushing** (round-4 caveat S, unresolved and now recurring).

**T. Accent-union displacement recurs on a fresh cover — item 5.** Round 4 flagged item 7's crimson
sitting at shortlist rank 2 and never published. This round item 5's accent shortlist ranks a
near-white cloud colour first and publishes the rank-3 brown, which is chroma-first working — but see
caveat U for what is missing from item 5 entirely.

**U. NEW — item 5's green never reaches the palette.** The crop rows are the artwork's most
distinctive mass; `assignment.families` rank 3 is `#707e31` at mass fraction 0.114, and the published
palette is sky-blue / tan / brown. This is cross-arm note 1 (identity-coverage) on a fresh cover: a
distinct chromatic colour present in the artwork and absent from the palette. **If the reviewer names
the green, that is a third independent instance of the same axis** (round-2's missing white,
round-4's item-7 crimson) and it is a mechanism question — which role carries a second vivid colour —
not a tuning one.

**V. NEW — four of the five fresh items publish a foreground within 1.05–1.27× of the APCA floor.**
15.71 (item 5, ratio 1.047 — the narrowest P5 has ever staged), 16.24 (item 7, 1.083), 17.98
(item 6, 1.199), 18.98 (item 8, 1.265), against a floor of 15. Only item 4 is clear (69.60, 4.64).
**Several foreground-legibility complaints in this round are ONE finding, not four**, and they join
round-4 item 5's 17.85/1.19 on the light-field side. Cross-arm note 6 (the reviewer grades margins;
optimizers sit on floors) predicts exactly this shape of complaint.

**W. NEW — item 8's `foreground×accent` pair clears the same-colour bar by 1.504×, the narrowest
published pair in P5's record.** `#585858` against `#3a3a3a`. Round-3's evidence put reviewer-called
"indistinguishable" pairs at ratios 1.8–6.6; this is below that range. **Expect an
"accent and text are the same colour" note on item 8 and do not read it as an accent-selection
failure without checking the bar.**

**X. NEW — item 7's surface is a distinct colour that never renders as field.** `background #1e4e5c`
/ `surface #545655`, `gradient: null`, `fieldCss: "#1e4e5c"`. The grey exists only in the swatch row.
Round-4's caveat I noted this hazard and recorded that it did not bite; this round it does. Worth
confirming that showing a field colour only as a swatch is intended before the push.

**Y. NEW — the census pool contains duplicate artworks at two rendition sizes, and the cross-class
rule dedupes by STEM, not by artwork key.** The 1037 censused rows are **955 distinct artworks**: 82
artworks appear twice, once as `ab67616d00001e02…` (300 px) and once as `ab67616d0000b273…` (640 px),
with identical trailing-24 keys. This is inherited from round 4's pool rule and was not disclosed
there. **No round-5 pick is affected** — all five picks are single-rendition in the pool, and the
five are five distinct artworks (verified). But two classes could in principle select two renditions
of one artwork into two slots, and `rank.mjs`'s `taken` set would not catch it because it keys on the
full stem. The exclusion machinery already has `artKey()` for exactly this; a future round should use
it in the cross-class rule too. Recorded, not fixed — changing the rule mid-round would have been a
selection change after the fact.

---

## 8. Files this staging wrote

Under `review-rounds/round-5/`: `items.json`, `render-data.json`, `STAGING.md` (this file),
`STAGING-REPORT.md`, `select-fresh-covers.mjs`, `rank.mjs`, `build-payload.ts`, `check.ts`,
`census.json`, `served-census.json`, `selection.json`, and eight `diagnose-*.json` files
(`baf46c90`, `942d6547`, `46be9b20`, `b4cd95b2`, `70c3f5a6`, `7e5e017c`, `43b718cb`, `5760ac35`).

Plus one new set file: `data/devloop/sets/p5-round5-fresh.txt`.

Plus the three dev-loop run files the instrument wrote itself (§1), which land in
`data/devloop/runs/` — the runner's own output location, outside `review-rounds/round-5/`, and the
only files caused to appear outside the write scope.

Nothing was committed. Nothing was pushed.
