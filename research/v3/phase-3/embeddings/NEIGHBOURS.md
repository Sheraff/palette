# Failure-class neighbourhoods

**Files:** `NEIGHBOURS.md` (this) and `neighbours.json` (machine-readable, every field below plus
the per-neighbour review batch ids).

## What this is for

Nine seed covers, one per named Phase 3 failure, each with its **k=12 nearest neighbours** by
cosine on the canonical embedding arm. The point is to let a fix be tested on *many artworks of
the same kind* instead of on the single cover that produced the complaint.

## Method

- **Arm:** `dinov2-vitl14` at 224 px — the canonical arm (decision `d-2026-08-02-embedding-canonical-model`). No new
  embedding was computed: every seed and every pool member already had a vector on disk.
- **Metric:** cosine (vectors are L2-normalized on write, so this is a dot product).
- **Granularity:** artwork, not file. One vector per artwork — its largest rendition, by the same
  rule the coverage set and the holdout freeze use (measured pixel area; ties prefer the
  un-suffixed original, then the lexicographically smallest path). Renditions of one artwork
  therefore cannot appear as each other’s neighbours.
- **Pool (as briefed):** coverage-set-1 union eval-142 union sharded shard 15, at ARTWORK level (one vector per artwork: its largest rendition), minus the holdout and its non-candidate quarantine — **668 artworks** (coverage-set-1:core 200, coverage-set-1:enrichment 18, eval-142 117, shard-15 348; music_artworks 52, sharded 268, sharded_fresh_15 348).
  The holdout/quarantine filter removed **0** artworks — zero: coverage-set-1 and shard 15 exclude the holdout by construction, and no locatable eval-142 entry is a held-out artwork, so this filter was vacuous rather than unapplied.
  25 eval-142 entries are legacy `images/` covers that were never embedded and cannot enter any pool.
- **Reviewed flag:** a neighbour counts as reviewed if its 24/32-hex artwork id or its file stem appears anywhere in the warehouse (raw substring, every record type), and the batch ids of any warehouse record whose artwork path carries that stem are listed. Source: `research/v3/data/warehouse/warehouse.jsonl`.
- **Corpus-wide supplement (9598 artworks):** SUPPLEMENT, beyond the brief: every clustered artwork in the two embedded collections plus shard 15, minus the holdout, its quarantine, and the music-artworks non-candidates (non-square, thumbnail-only, real-transparency). Added because the briefed pool turned out to be too sparse to supply same-kind artworks for most classes.

## Headline: the briefed pool is too thin for this job

| failure class | seed | k=12 cosine range | ≥ 0.6 | **unreviewed ≥ 0.6** | corpus-wide ≥ 0.6 | corpus-wide unreviewed ≥ 0.6 |
|---|---|---|---|---|---|---|
| face-as-field | `ab67616d0000b273…` | 0.777–0.499 | 5 | **3** | 12 | 10 |
| face-as-field | `ab67616d00001e02…` | 0.203–0.150 | 0 | **0** | 0 | 0 |
| twice-unacceptable | `ab67616d0000b273…` | 0.625–0.402 | 1 | **0** | 4 | 3 |
| label-logo | `ab67616d0000b273…` | 0.479–0.329 | 0 | **0** | 0 | 0 |
| frame-letterbox | `9c44f2accbca25be…` | 0.490–0.410 | 0 | **0** | 0 | 0 |
| frame-letterbox | `7b51bde9cbaefc73…` | 0.265–0.215 | 0 | **0** | 1 | 1 |
| no-field-photographic | `ab67616d0000b273…` | 0.107–0.072 | 0 | **0** | 0 | 0 |
| no-field-photographic | `952266f2430177b8…` | 0.640–0.347 | 1 | **1** | 3 | 3 |
| no-field-photographic | `ab67616d00001e02…` | 0.413–0.300 | 0 | **0** | 1 | 1 |

Across all nine seeds the briefed pool supplies **4 unreviewed neighbours above cosine 0.6**;
the whole corpus supplies **18**. Read that as two separate facts:

1. **A 668-artwork pool is a 7% sample of the corpus, and it is too sparse to hold same-kind
   company for an arbitrary cover.** Where a class does have a real neighbourhood, widening the
   pool finds it (`…094a786a…`: 5 → 12 neighbours above 0.6). The corpus-wide table is the one
   to draw a test set from.
2. **Some of these classes are not neighbourhoods at all.** `label-logo`, `frame-letterbox`
   (`9c44f2ac…`) and the degenerate `no-field` seed have nothing above 0.6 even corpus-wide.
   These failures are compositional properties — a thin logo, a border, an absent field — and
   DINOv2 similarity is dominated by subject and palette, not by that geometry. For those three,
   nearest-neighbour retrieval is the wrong instrument, and the honest move is a *measured*
   probe set (the frame and retreat fixtures already in `data/devloop/sets/` are exactly that)
   rather than an embedding query.

## Per-class neighbourhoods

Each table is the seed’s k=12 in the briefed pool. `reviewed?` is over the whole warehouse —
any batch, any record type — not only Phase 2 and Phase 3.

### face-as-field

#### seed `ab67616d0000b27300094a786a28459646be9b20`

`09/ab67616d0000b27300094a786a28459646be9b20` — 640x640, tier 401-640, cluster 17, in the pool, reviewed in `cal-027`, `cal-028`, `cal-029`, `cal-030`, `phase2-cal-020`, `phase2-cal-026`.

Why this seed: round-1/2 cover 1; phase2-cal-026 "the Sushi Rice beige is the face of the subject on this artwork, not a background"

| # | cosine | id | path | WxH | cl | source | reviewed? |
|---|---|---|---|---|---|---|---|
| 1 | 0.777 | `ab67616d0000b2730015956b588e9d58bc6a90ef` | `15/ab67616d0000b2730015956b588e9d58bc6a90ef` | 640x640 | 17 | shard-15 | no |
| 2 | 0.704 | `ab67616d00001e020010ac96d501c4170f39c4f0` | `10/ab67616d00001e020010ac96d501c4170f39c4f0` | 300x300 | 17 | cs1-core | `phase2-cal-022`, `phase2-cal-025` |
| 3 | 0.694 | `ab67616d0000b27300034b1c66ddd55a5337f66a` | `03/ab67616d0000b27300034b1c66ddd55a5337f66a.jpg` | 640x640 | 17 | eval-142 | `sam-mask-quality-2-v2-ratification`, `sam-mask-quality-3-area-guard-and-hard-text` |
| 4 | 0.631 | `ab67616d00001e020015810d15bce52b2032219a` | `15/ab67616d00001e020015810d15bce52b2032219a` | 300x300 | 17 | shard-15 | no |
| 5 | 0.602 | `ab67616d0000b2730015f52c52eed6381a5b0301` | `15/ab67616d0000b2730015f52c52eed6381a5b0301` | 640x640 | 17 | shard-15 | no |
| 6 | 0.595 | `c866754d1e525a56e7b0a18e6602db85` | `music-artworks/c/8/6/c866754d1e525a56e7b0a18e6602db85.jpeg` | 512x490 | 17 | cs1-core | no |
| 7 | 0.554 | `ab67616d00001e02001532c33b805e30b851346c` | `15/ab67616d00001e02001532c33b805e30b851346c` | 300x300 | 26 | shard-15 | no |
| 8 | 0.520 | `ab67616d0000b273000a377d9f357693eba4e828` | `0a/ab67616d0000b273000a377d9f357693eba4e828` | 640x640 | 7 | cs1-core | no |
| 9 | 0.506 | `ab67616d0000b27300158fbe049d823b52f94d5a` | `15/ab67616d0000b27300158fbe049d823b52f94d5a` | 640x640 | 17 | shard-15 | no |
| 10 | 0.506 | `ab67616d0000b273001595d94e99267968f65c86` | `15/ab67616d0000b273001595d94e99267968f65c86` | 640x640 | 24 | shard-15 | no |
| 11 | 0.502 | `ab67616d00001e020015fe4fb65ae2493dd81f50` | `15/ab67616d00001e020015fe4fb65ae2493dd81f50` | 300x300 | 0 | shard-15 | no |
| 12 | 0.499 | `ab67616d00001e0200151c388a952db4fd8eb1ed` | `15/ab67616d00001e0200151c388a952db4fd8eb1ed` | 300x300 | 17 | shard-15 | no |

<details><summary>corpus-wide k=12 (supplement, beyond the briefed pool)</summary>

| # | cosine | id | path | WxH | cl | reviewed? |
|---|---|---|---|---|---|---|
| 1 | 0.820 | `ab67616d0000b27300136975ca896cbb472cdd97` | `13/ab67616d0000b27300136975ca896cbb472cdd97` | 640x640 | 17 | no |
| 2 | 0.777 | `ab67616d0000b2730015956b588e9d58bc6a90ef` | `15/ab67616d0000b2730015956b588e9d58bc6a90ef` | 640x640 | 17 | no |
| 3 | 0.752 | `ab67616d0000b273000f419202773a8142d38e1c` | `0f/ab67616d0000b273000f419202773a8142d38e1c` | 640x640 | 17 | no |
| 4 | 0.727 | `ab67616d0000b273000163bab08262008d8c32a2` | `01/ab67616d0000b273000163bab08262008d8c32a2.jpg` | 640x640 | 17 | no |
| 5 | 0.718 | `ab67616d0000b273001402e997ff7ec125e8e0c8` | `14/ab67616d0000b273001402e997ff7ec125e8e0c8` | 640x640 | 17 | no |
| 6 | 0.711 | `ab67616d0000b2730004621a5962a71580eec34c` | `04/ab67616d0000b2730004621a5962a71580eec34c` | 640x640 | 17 | no |
| 7 | 0.704 | `ab67616d00001e020010ac96d501c4170f39c4f0` | `10/ab67616d00001e020010ac96d501c4170f39c4f0` | 300x300 | 17 | `phase2-cal-022`, `phase2-cal-025` |
| 8 | 0.701 | `ab67616d0000b27300097a56b6b5cc55a9d18e9d` | `09/ab67616d0000b27300097a56b6b5cc55a9d18e9d` | 640x640 | 17 | no |
| 9 | 0.695 | `ab67616d0000b2730006a585e8b3bb908d2a1e95` | `06/ab67616d0000b2730006a585e8b3bb908d2a1e95` | 640x640 | 17 | no |
| 10 | 0.694 | `ab67616d0000b27300034b1c66ddd55a5337f66a` | `03/ab67616d0000b27300034b1c66ddd55a5337f66a.jpg` | 640x640 | 17 | `sam-mask-quality-2-v2-ratification`, `sam-mask-quality-3-area-guard-and-hard-text` |
| 11 | 0.692 | `ab67616d00001e020004ca71e73d4bfc8e6ee5d7` | `04/ab67616d00001e020004ca71e73d4bfc8e6ee5d7` | 300x300 | 17 | no |
| 12 | 0.679 | `ab67616d0000b273000c7915cfc541727ba30eef` | `0c/ab67616d0000b273000c7915cfc541727ba30eef` | 640x640 | 17 | no |

</details>

#### seed `ab67616d00001e02000f9ddb5dfe0c2590bed1b2`

`0f/ab67616d00001e02000f9ddb5dfe0c2590bed1b2` — 300x300, tier <=400, cluster 8, in the pool, reviewed in `cal-027`, `cal-028`, `phase2-pair-023`.

Why this seed: cal-027/028 and phase2-pair-023 cover; second face-as-field seed named in the task

| # | cosine | id | path | WxH | cl | source | reviewed? |
|---|---|---|---|---|---|---|---|
| 1 | 0.203 | `ab67616d0000b27300156cdb44da3b757912b1c2` | `15/ab67616d0000b27300156cdb44da3b757912b1c2` | 640x640 | 8 | shard-15 | no |
| 2 | 0.174 | `ab67616d0000b273001515598b11942c5e1fda5d` | `15/ab67616d0000b273001515598b11942c5e1fda5d` | 640x640 | 28 | shard-15 | no |
| 3 | 0.169 | `8cd594ad97ce7682b53c3dd5ae2a5bbe` | `music-artworks/8/c/d/8cd594ad97ce7682b53c3dd5ae2a5bbe.jpg` | 700x700 | 20 | cs1-core | no |
| 4 | 0.168 | `ab67616d00001e02000564718f605c1f326b2ca2` | `05/ab67616d00001e02000564718f605c1f326b2ca2` | 300x300 | 6 | eval-142 | `accent-real-1`, `oracle-premise-disambiguation-1`, `oracle-probe-gold-1`, `pointing-typical-1`, `sam-mask-quality-3-area-guard-and-hard-text` |
| 5 | 0.163 | `ab67616d0000b2730015a4269e256d3c7b846b04` | `15/ab67616d0000b2730015a4269e256d3c7b846b04` | 640x640 | 8 | shard-15 | no |
| 6 | 0.161 | `ab67616d0000b27300158c4f6366e82ad86a37f7` | `15/ab67616d0000b27300158c4f6366e82ad86a37f7` | 640x640 | 18 | shard-15 | no |
| 7 | 0.158 | `ab67616d00001e020015edf1d7d53715a1082611` | `15/ab67616d00001e020015edf1d7d53715a1082611` | 300x300 | 20 | shard-15 | no |
| 8 | 0.158 | `ab67616d0000b2730012eb9ade9c1bf4a5411c5d` | `12/ab67616d0000b2730012eb9ade9c1bf4a5411c5d` | 640x640 | 15 | eval-142 | `accent-real-1`, `oracle-premise-disambiguation-1`, `oracle-probe-gold-1`, `pointing-typical-1`, `residual-purity-2`, `sam-mask-quality-1`, `sam-mask-quality-2-v2-ratification` |
| 9 | 0.157 | `ab67616d0000b2730015dcf7dc3af58d4a481eec` | `15/ab67616d0000b2730015dcf7dc3af58d4a481eec` | 640x640 | 14 | shard-15 | no |
| 10 | 0.155 | `ab67616d0000b27300157a326802db6639e4e7cf` | `15/ab67616d0000b27300157a326802db6639e4e7cf` | 640x640 | 25 | shard-15 | no |
| 11 | 0.155 | `ab67616d0000b2730010403dcc48ac67e0a1b97f` | `10/ab67616d0000b2730010403dcc48ac67e0a1b97f` | 640x640 | 21 | cs1-core | `phase2-cal-017` |
| 12 | 0.150 | `ab67616d0000b273000c3c03eeb088f4bfcad783` | `0c/ab67616d0000b273000c3c03eeb088f4bfcad783` | 640x640 | 8 | cs1-core | no |

<details><summary>corpus-wide k=12 (supplement, beyond the briefed pool)</summary>

| # | cosine | id | path | WxH | cl | reviewed? |
|---|---|---|---|---|---|---|
| 1 | 0.282 | `ab67616d0000b27300013665bdb06b8284da67d4` | `01/ab67616d0000b27300013665bdb06b8284da67d4.jpg` | 640x640 | 28 | no |
| 2 | 0.245 | `ab67616d0000b2730005ca19dfe6a433d508da9e` | `05/ab67616d0000b2730005ca19dfe6a433d508da9e` | 640x640 | 28 | no |
| 3 | 0.232 | `ab67616d0000b273000ae1a1427d47b40314fee8` | `0a/ab67616d0000b273000ae1a1427d47b40314fee8` | 640x640 | 12 | no |
| 4 | 0.222 | `ab67616d0000b273000d28667402df9223496f3c` | `0d/ab67616d0000b273000d28667402df9223496f3c` | 640x640 | 28 | no |
| 5 | 0.219 | `743f03d6dcbf1e4addb3e729e6629fbb` | `music-artworks/7/4/3/743f03d6dcbf1e4addb3e729e6629fbb.jpg` | 500x500 | 21 | no |
| 6 | 0.219 | `ab67616d0000b273000aec6809ea1d2506f54a39` | `0a/ab67616d0000b273000aec6809ea1d2506f54a39` | 640x640 | 28 | no |
| 7 | 0.207 | `ab67616d0000b27300064fddf48a67a4b5ecbbde` | `06/ab67616d0000b27300064fddf48a67a4b5ecbbde` | 640x640 | 13 | no |
| 8 | 0.206 | `ab67616d0000b273001442d55babb7f6467e4c25` | `14/ab67616d0000b273001442d55babb7f6467e4c25` | 640x640 | 15 | no |
| 9 | 0.206 | `ab67616d0000b27300049f7b11bb3e506a8e15a7` | `04/ab67616d0000b27300049f7b11bb3e506a8e15a7` | 640x640 | 8 | no |
| 10 | 0.205 | `c642a2e7f05a95d04b200408a948a394` | `music-artworks/c/6/4/c642a2e7f05a95d04b200408a948a394.jpg` | 700x700 | 8 | no |
| 11 | 0.204 | `ab67616d0000b2730009c67cb0f24a511d101edc` | `09/ab67616d0000b2730009c67cb0f24a511d101edc` | 640x640 | 17 | no |
| 12 | 0.203 | `ab67616d0000b27300156cdb44da3b757912b1c2` | `15/ab67616d0000b27300156cdb44da3b757912b1c2` | 640x640 | 8 | no |

</details>

### twice-unacceptable

#### seed `ab67616d0000b273000131a334d00155369bb7b9`

`01/ab67616d0000b273000131a334d00155369bb7b9.jpg` — 640x640, tier 401-640, cluster 21, in the pool, reviewed in `cal-027`, `cal-028`, `cal-029`, `cal-030`.

Why this seed: round-1 cover 7 and round-2 cover 2: both arms graded unacceptable, twice, with no reviewer text

| # | cosine | id | path | WxH | cl | source | reviewed? |
|---|---|---|---|---|---|---|---|
| 1 | 0.625 | `ab67616d0000b273000d5cdbc67ed815efc360ad` | `0d/ab67616d0000b273000d5cdbc67ed815efc360ad` | 640x640 | 21 | eval-142 | `perception-4` |
| 2 | 0.538 | `ab67616d00001e0200151c388a952db4fd8eb1ed` | `15/ab67616d00001e0200151c388a952db4fd8eb1ed` | 300x300 | 17 | shard-15 | no |
| 3 | 0.522 | `ab67616d0000b273000cd48fb26f462cd33760f6` | `0c/ab67616d0000b273000cd48fb26f462cd33760f6` | 640x640 | 21 | eval-142 | `perception-4` |
| 4 | 0.472 | `ab67616d0000b27300155d349cbbebc867c574c9` | `15/ab67616d0000b27300155d349cbbebc867c574c9` | 640x640 | 7 | shard-15 | no |
| 5 | 0.458 | `ab67616d00001e020015fe4fb65ae2493dd81f50` | `15/ab67616d00001e020015fe4fb65ae2493dd81f50` | 300x300 | 0 | shard-15 | no |
| 6 | 0.456 | `ab67616d0000b27300151e17306f19bbb5bd51f3` | `15/ab67616d0000b27300151e17306f19bbb5bd51f3` | 640x640 | 21 | shard-15 | no |
| 7 | 0.427 | `ab67616d0000b2730015f52c52eed6381a5b0301` | `15/ab67616d0000b2730015f52c52eed6381a5b0301` | 640x640 | 17 | shard-15 | no |
| 8 | 0.427 | `ab67616d0000b273001590401b57872da7faed88` | `15/ab67616d0000b273001590401b57872da7faed88` | 640x640 | 21 | shard-15 | no |
| 9 | 0.416 | `ab67616d0000b27300158fb23234a6946eb50fcd` | `15/ab67616d0000b27300158fb23234a6946eb50fcd` | 640x640 | 21 | shard-15 | no |
| 10 | 0.411 | `260e1f491e4632305e7924462efc37c2` | `music-artworks/2/6/0/260e1f491e4632305e7924462efc37c2.jpg` | 700x700 | 28 | cs1-core | no |
| 11 | 0.406 | `ab67616d0000b2730015c78b47b0784ff686385e` | `15/ab67616d0000b2730015c78b47b0784ff686385e` | 640x640 | 21 | shard-15 | no |
| 12 | 0.402 | `ab67616d00001e020015c23d1d41fd676aef71b7` | `15/ab67616d00001e020015c23d1d41fd676aef71b7` | 300x300 | 21 | shard-15 | no |

<details><summary>corpus-wide k=12 (supplement, beyond the briefed pool)</summary>

| # | cosine | id | path | WxH | cl | reviewed? |
|---|---|---|---|---|---|---|
| 1 | 0.658 | `470fceab0231a9f7d5e614a865f3f00e` | `music-artworks/4/7/0/470fceab0231a9f7d5e614a865f3f00e.jpg` | 500x500 | 21 | no |
| 2 | 0.641 | `9d4546a5ed7db7d3ddc6518238c62a70` | `music-artworks/9/d/4/9d4546a5ed7db7d3ddc6518238c62a70.jpg` | 640x640 | 21 | no |
| 3 | 0.629 | `6a49fe83b89d06568c7a43757c973315` | `music-artworks/6/a/4/6a49fe83b89d06568c7a43757c973315.jpg` | 600x600 | 21 | no |
| 4 | 0.625 | `ab67616d0000b273000d5cdbc67ed815efc360ad` | `0d/ab67616d0000b273000d5cdbc67ed815efc360ad` | 640x640 | 21 | `perception-4` |
| 5 | 0.599 | `2035e93222ce3c50ef8e5335053d726d` | `music-artworks/2/0/3/2035e93222ce3c50ef8e5335053d726d.jpg` | 700x700 | 21 | no |
| 6 | 0.593 | `bad83cafc53143497df9fad0fa3c1277` | `music-artworks/b/a/d/bad83cafc53143497df9fad0fa3c1277.jpeg` | 953x953 | 21 | no |
| 7 | 0.583 | `3cb9dc325ef13ff0631ea35bace2f49c` | `music-artworks/3/c/b/3cb9dc325ef13ff0631ea35bace2f49c.png` | 600x600 | 21 | no |
| 8 | 0.574 | `90715f8ef5866405370584698c7baf62` | `music-artworks/9/0/7/90715f8ef5866405370584698c7baf62.jpg` | 640x635 | 21 | no |
| 9 | 0.572 | `f60c1104e4a71ce876b2eee96a35b222` | `music-artworks/f/6/0/f60c1104e4a71ce876b2eee96a35b222.jpeg` | 600x600 | 21 | no |
| 10 | 0.570 | `ab67616d0000b273000ff9697ee7527dde5a2b2a` | `0f/ab67616d0000b273000ff9697ee7527dde5a2b2a` | 640x640 | 21 | no |
| 11 | 0.569 | `25886477d7ffc5aed51bc414e06217d3` | `music-artworks/2/5/8/25886477d7ffc5aed51bc414e06217d3.jpg` | 700x700 | 21 | no |
| 12 | 0.567 | `ab67616d0000b273000a758fab221632013a99f7` | `0a/ab67616d0000b273000a758fab221632013a99f7` | 640x640 | 21 | no |

</details>

### label-logo

#### seed `ab67616d0000b273000146db0ad7d43bebdb3152`

`01/ab67616d0000b273000146db0ad7d43bebdb3152.jpg` — 640x640, tier 401-640, cluster 15, in the pool, reviewed in `phase2-cal-025`.

Why this seed: phase2-cal-025 verdict v-msp1tg8s-537e231c: "neither Firebrick (accent) nor Eggshell (surface) see to visually be part of this artwork. They are only present in the very small label logo at the bottom"

| # | cosine | id | path | WxH | cl | source | reviewed? |
|---|---|---|---|---|---|---|---|
| 1 | 0.479 | `ab67616d0000b273000be842b75414d50230d2ba` | `0b/ab67616d0000b273000be842b75414d50230d2ba` | 640x640 | 26 | cs1-core | no |
| 2 | 0.430 | `ab67616d0000b273001543c4d6dbdea410f97b10` | `15/ab67616d0000b273001543c4d6dbdea410f97b10` | 640x640 | 15 | shard-15 | no |
| 3 | 0.379 | `ab67616d0000b2730015188b8a6b552ad74a2985` | `15/ab67616d0000b2730015188b8a6b552ad74a2985` | 640x640 | 26 | shard-15 | no |
| 4 | 0.376 | `ab67616d0000b2730002dfdcde2cb0a75822168c` | `02/ab67616d0000b2730002dfdcde2cb0a75822168c.jpg` | 640x640 | 15 | eval-142 | `accent-real-1`, `cascade-ground-truth-1`, `oracle-premise-disambiguation-1`, `oracle-probe-gold-1`, `pointing-ground-1`, `residual-purity-1`, `residual-purity-2`, `sam-mask-quality-1` |
| 5 | 0.365 | `ab67616d00001e0200154f058e04a12205f96b0e` | `15/ab67616d00001e0200154f058e04a12205f96b0e` | 300x300 | 35 | shard-15 | no |
| 6 | 0.363 | `ab67616d00001e0200085a34e8d215c0bd5afa26` | `08/ab67616d00001e0200085a34e8d215c0bd5afa26` | 300x300 | 26 | cs1-core | no |
| 7 | 0.352 | `ab67616d0000b27300150e29acb16143dc5bdfac` | `15/ab67616d0000b27300150e29acb16143dc5bdfac` | 640x640 | 20 | shard-15 | no |
| 8 | 0.343 | `ab67616d0000b2730005a91812c85db291ea5d85` | `05/ab67616d0000b2730005a91812c85db291ea5d85` | 640x640 | 26 | eval-142 | `accent-real-1`, `oracle-premise-disambiguation-1`, `oracle-probe-gold-1` |
| 9 | 0.339 | `ab67616d00001e02001532c33b805e30b851346c` | `15/ab67616d00001e02001532c33b805e30b851346c` | 300x300 | 26 | shard-15 | no |
| 10 | 0.332 | `ab67616d0000b273000955ccfc1e8da97a09b32d` | `09/ab67616d0000b273000955ccfc1e8da97a09b32d` | 640x640 | 15 | eval-142 | `accent-real-1`, `pointing-typical-1`, `sam-mask-quality-1`, `sam-mask-quality-2-v2-ratification`, `sam-mask-quality-3-area-guard-and-hard-text` |
| 11 | 0.330 | `ab67616d0000b273001507b0e0362d9afec60ba1` | `15/ab67616d0000b273001507b0e0362d9afec60ba1` | 640x640 | 35 | shard-15 | no |
| 12 | 0.329 | `ab67616d0000b273000528de96baaabaa2cf3608` | `05/ab67616d0000b273000528de96baaabaa2cf3608` | 640x640 | 12 | cs1-core | `bcde-validation-1` |

<details><summary>corpus-wide k=12 (supplement, beyond the briefed pool)</summary>

| # | cosine | id | path | WxH | cl | reviewed? |
|---|---|---|---|---|---|---|
| 1 | 0.506 | `ab67616d0000b273001404067a22cc6591b452e7` | `14/ab67616d0000b273001404067a22cc6591b452e7` | 640x640 | 20 | no |
| 2 | 0.488 | `ab67616d0000b273000801bcef16d8cac6f36486` | `08/ab67616d0000b273000801bcef16d8cac6f36486` | 640x640 | 15 | no |
| 3 | 0.487 | `ab67616d0000b273000e7efde1d32870353464e6` | `0e/ab67616d0000b273000e7efde1d32870353464e6` | 640x640 | 15 | no |
| 4 | 0.480 | `ab67616d0000b2730009679f4c3d5e370297b2db` | `09/ab67616d0000b2730009679f4c3d5e370297b2db` | 640x640 | 26 | no |
| 5 | 0.479 | `ab67616d0000b273000be842b75414d50230d2ba` | `0b/ab67616d0000b273000be842b75414d50230d2ba` | 640x640 | 26 | no |
| 6 | 0.477 | `ab67616d0000b273000055eb9b12fcda92823610` | `00/ab67616d0000b273000055eb9b12fcda92823610.jpg` | 640x640 | 26 | no |
| 7 | 0.470 | `ab67616d0000b273000e7d91069befa668e47ab0` | `0e/ab67616d0000b273000e7d91069befa668e47ab0` | 640x640 | 20 | no |
| 8 | 0.463 | `ab67616d00001e020000c59b1facbb9e2d899099` | `00/ab67616d00001e020000c59b1facbb9e2d899099.jpg` | 300x300 | 26 | no |
| 9 | 0.459 | `ab67616d0000b273000de728998a006b6eef7b45` | `0d/ab67616d0000b273000de728998a006b6eef7b45` | 640x640 | 15 | no |
| 10 | 0.447 | `ab67616d00001e0200102d5dcf88c5f8a68092f1` | `10/ab67616d00001e0200102d5dcf88c5f8a68092f1` | 300x300 | 20 | no |
| 11 | 0.440 | `ab67616d0000b2730000f329bdedf99c818740d1` | `00/ab67616d0000b2730000f329bdedf99c818740d1.jpg` | 640x640 | 7 | no |
| 12 | 0.431 | `217dac85c71addf44842e05ac8d82684` | `music-artworks/2/1/7/217dac85c71addf44842e05ac8d82684.png` | 600x600 | 15 | no |

</details>

### frame-letterbox

#### seed `9c44f2accbca25be25af910c00f5b635`

`music-artworks/9/c/4/9c44f2accbca25be25af910c00f5b635.png` — 1024x1024, tier 641-1024, cluster 9, **not in the briefed pool** (a corpus cover outside coverage-set-1 / eval-142 / shard 15), never reviewed.

Why this seed: frame-probe.txt; retreat-test-4.md names it one of "the two thick-frame covers" (canvasShare 0.478); ground-test-1.jsonl reach 0.999 / enclosure 1.0

| # | cosine | id | path | WxH | cl | source | reviewed? |
|---|---|---|---|---|---|---|---|
| 1 | 0.490 | `ab67616d00001e020002fc520894d5fd547eb7f3` | `02/ab67616d00001e020002fc520894d5fd547eb7f3.jpg` | 300x300 | 18 | cs1-core | no |
| 2 | 0.480 | `ab67616d00001e0200134d831ec9c6b59d442e5f` | `13/ab67616d00001e0200134d831ec9c6b59d442e5f` | 300x300 | 9 | cs1-core | no |
| 3 | 0.467 | `ab67616d0000b273000899b3352ee28935439b14` | `08/ab67616d0000b273000899b3352ee28935439b14` | 640x640 | 9 | cs1-core | `bcde-validation-1` |
| 4 | 0.462 | `ab67616d00001e0200015a7a9909e03141e001e3` | `01/ab67616d00001e0200015a7a9909e03141e001e3.jpg` | 300x300 | 8 | eval-142 | `perception-4`, `sam-mask-quality-2-v2-ratification`, `sam-mask-quality-3-area-guard-and-hard-text` |
| 5 | 0.450 | `ab67616d0000b273001575911afdf9e4647a5e6c` | `15/ab67616d0000b273001575911afdf9e4647a5e6c` | 640x640 | 34 | shard-15 | no |
| 6 | 0.447 | `ab67616d00001e020005fa7c7e0e067474967e41` | `05/ab67616d00001e020005fa7c7e0e067474967e41` | 300x300 | 9 | eval-142 | `perception-4`, `residual-purity-1`, `sam-mask-quality-1` |
| 7 | 0.437 | `ab67616d00001e020015f0c7d165c2611b350cea` | `15/ab67616d00001e020015f0c7d165c2611b350cea` | 300x300 | 9 | shard-15 | no |
| 8 | 0.436 | `ab67616d0000b2730006a059abb2a6b7dd4ad461` | `06/ab67616d0000b2730006a059abb2a6b7dd4ad461` | 640x640 | 25 | eval-142 | `oracle-premise-disambiguation-1`, `oracle-probe-gold-1`, `perception-4` |
| 9 | 0.422 | `ab67616d00001e020015042c01ff4d5782fcabac` | `15/ab67616d00001e020015042c01ff4d5782fcabac` | 300x300 | 9 | shard-15 | no |
| 10 | 0.422 | `ab67616d0000b273000323957b88112ca49b8ee0` | `03/ab67616d0000b273000323957b88112ca49b8ee0.jpg` | 640x640 | 8 | eval-142 | `perception-4` |
| 11 | 0.418 | `ab67616d0000b27300018a1a84604edc97ce428f` | `01/ab67616d0000b27300018a1a84604edc97ce428f.jpg` | 640x640 | 8 | cs1-core | no |
| 12 | 0.410 | `ab67616d0000b2730015524c63f4b29e86cca4aa` | `15/ab67616d0000b2730015524c63f4b29e86cca4aa` | 640x640 | 14 | shard-15 | no |

<details><summary>corpus-wide k=12 (supplement, beyond the briefed pool)</summary>

| # | cosine | id | path | WxH | cl | reviewed? |
|---|---|---|---|---|---|---|
| 1 | 0.575 | `ab67616d0000b2730014ef3176a253f33ec672cb` | `14/ab67616d0000b2730014ef3176a253f33ec672cb` | 640x640 | 8 | no |
| 2 | 0.564 | `16c3bdda1f8955b8aedc452df0400c5e` | `music-artworks/1/6/c/16c3bdda1f8955b8aedc452df0400c5e.jpg` | 640x640 | 8 | no |
| 3 | 0.558 | `a45628cb770f049e1b048f8d3d77da1d` | `music-artworks/a/4/5/a45628cb770f049e1b048f8d3d77da1d.jpg` | 640x640 | 20 | no |
| 4 | 0.554 | `ab67616d00001e02000421b1b140f556d31000fb` | `04/ab67616d00001e02000421b1b140f556d31000fb` | 300x300 | 9 | no |
| 5 | 0.553 | `2fb7ca5a1a45a05f123482f996656b5a` | `music-artworks/2/f/b/2fb7ca5a1a45a05f123482f996656b5a.jpeg` | 512x512 | 8 | no |
| 6 | 0.546 | `ab67616d0000b27300025a1924343775ce96bcab` | `02/ab67616d0000b27300025a1924343775ce96bcab.jpg` | 640x640 | 9 | no |
| 7 | 0.541 | `f9b41cf998fbd6f0337934646f06d9f2` | `music-artworks/f/9/b/f9b41cf998fbd6f0337934646f06d9f2.jpeg` | 700x700 | 8 | no |
| 8 | 0.535 | `ab2b64caa5e6c879142c5aa7e5fd8507` | `music-artworks/a/b/2/ab2b64caa5e6c879142c5aa7e5fd8507.jpeg` | 250x250 | 8 | no |
| 9 | 0.532 | `ab67616d0000b273000586012e80478c1a21c6d2` | `05/ab67616d0000b273000586012e80478c1a21c6d2` | 640x640 | 9 | no |
| 10 | 0.530 | `ab67616d0000b2730003b29128be224d74813b36` | `03/ab67616d0000b2730003b29128be224d74813b36.jpg` | 640x640 | 9 | no |
| 11 | 0.530 | `53f4a61a65c079cf9671a722d2958557` | `music-artworks/5/3/f/53f4a61a65c079cf9671a722d2958557.png` | 500x500 | 8 | no |
| 12 | 0.524 | `ab67616d00001e02000b134986b50155db1beda2` | `0b/ab67616d00001e02000b134986b50155db1beda2` | 300x300 | 9 | no |

</details>

#### seed `7b51bde9cbaefc73faf8f94402042cce`

`music-artworks/7/b/5/7b51bde9cbaefc73faf8f94402042cce.jpg` — 640x640, tier 401-640, cluster 10, **not in the briefed pool** (a corpus cover outside coverage-set-1 / eval-142 / shard 15), never reviewed.

Why this seed: frame-probe.txt; retreat-test-4.md names it the other of "the two thick-frame covers" (canvasShare 0.446)

| # | cosine | id | path | WxH | cl | source | reviewed? |
|---|---|---|---|---|---|---|---|
| 1 | 0.265 | `20db369b046d88454f86244116ea2579` | `music-artworks/2/0/d/20db369b046d88454f86244116ea2579.jpg` | 700x700 | 23 | cs1-core | no |
| 2 | 0.263 | `ab67616d0000b27300093ce40fe3f073dcd87ab5` | `09/ab67616d0000b27300093ce40fe3f073dcd87ab5` | 640x640 | 5 | eval-142 | `perception-4`, `sam-mask-quality-1` |
| 3 | 0.256 | `ab67616d0000b273001558aa691894d9a0afb091` | `15/ab67616d0000b273001558aa691894d9a0afb091` | 640x640 | 23 | shard-15 | no |
| 4 | 0.237 | `ab67616d0000b2730003ea1037f2515b8b874e6d` | `03/ab67616d0000b2730003ea1037f2515b8b874e6d.jpg` | 640x640 | 0 | cs1-core | no |
| 5 | 0.236 | `cc35f7f97c2c503a2812639457eae265` | `music-artworks/c/c/3/cc35f7f97c2c503a2812639457eae265.jpg` | 400x400 | 23 | cs1-core | no |
| 6 | 0.231 | `ab67616d00001e02000e007955ee2f8b29f5b2b4` | `0e/ab67616d00001e02000e007955ee2f8b29f5b2b4` | 300x300 | 23 | cs1-core,eval-142 | `bcde-gate-reconciliation-1`, `bcde-validation-1`, `oracle-premise-disambiguation-1`, `oracle-probe-gold-1`, `perception-4` |
| 7 | 0.230 | `4369ae62190a9f8366835acb96f4373a` | `music-artworks/4/3/6/4369ae62190a9f8366835acb96f4373a.png` | 600x600 | 10 | cs1-core | no |
| 8 | 0.228 | `ab67616d00001e020015ccf9fea44b8b8db4d60f` | `15/ab67616d00001e020015ccf9fea44b8b8db4d60f` | 300x300 | 9 | shard-15 | no |
| 9 | 0.227 | `ab67616d0000b27300153df174a1a5a0dcca807d` | `15/ab67616d0000b27300153df174a1a5a0dcca807d` | 640x640 | 21 | shard-15 | no |
| 10 | 0.226 | `ab67616d0000b2730015ffd12327ba2f9006b7c3` | `15/ab67616d0000b2730015ffd12327ba2f9006b7c3` | 640x640 | 5 | shard-15 | no |
| 11 | 0.215 | `ab67616d0000b27300155bf191242d7ea5760e0a` | `15/ab67616d0000b27300155bf191242d7ea5760e0a` | 640x640 | 16 | shard-15 | no |
| 12 | 0.215 | `952266f2430177b8659cd7a83785ac5e` | `music-artworks/9/5/2/952266f2430177b8659cd7a83785ac5e.jpg` | 700x700 | 10 | cs1-core | no |

<details><summary>corpus-wide k=12 (supplement, beyond the briefed pool)</summary>

| # | cosine | id | path | WxH | cl | reviewed? |
|---|---|---|---|---|---|---|
| 1 | 0.675 | `ab67616d0000b273000d0bc0cabedc5d06ffd767` | `0d/ab67616d0000b273000d0bc0cabedc5d06ffd767` | 640x640 | 23 | no |
| 2 | 0.599 | `ab67616d00001e02000068b80cb9d0cf032793d6` | `00/ab67616d00001e02000068b80cb9d0cf032793d6.jpg` | 299x300 | 9 | no |
| 3 | 0.592 | `ab67616d0000b2730007565a361a9f3cabb86d3a` | `07/ab67616d0000b2730007565a361a9f3cabb86d3a` | 640x640 | 10 | no |
| 4 | 0.508 | `ab67616d0000b2730012c9dea8cde8135fcd9c06` | `12/ab67616d0000b2730012c9dea8cde8135fcd9c06` | 640x640 | 23 | no |
| 5 | 0.377 | `dd0a51cf6cfd9aecd6366526524ec096` | `music-artworks/d/d/0/dd0a51cf6cfd9aecd6366526524ec096.jpg` | 640x640 | 10 | no |
| 6 | 0.366 | `ab67616d00001e020007f3475732dbe8c2e73f79` | `07/ab67616d00001e020007f3475732dbe8c2e73f79` | 300x300 | 23 | no |
| 7 | 0.361 | `ab67616d0000b273000d2b2468a5b8693dcce085` | `0d/ab67616d0000b273000d2b2468a5b8693dcce085` | 640x640 | 14 | no |
| 8 | 0.357 | `ab67616d0000b273000fec05461670e3c6d3faeb` | `0f/ab67616d0000b273000fec05461670e3c6d3faeb` | 640x640 | 5 | no |
| 9 | 0.341 | `ab67616d0000b2730014e7aead2d1a54fae10246` | `14/ab67616d0000b2730014e7aead2d1a54fae10246` | 640x640 | 10 | no |
| 10 | 0.328 | `ab67616d00001e0200079f22216a08e13e0d172e` | `07/ab67616d00001e0200079f22216a08e13e0d172e` | 300x300 | 25 | no |
| 11 | 0.328 | `ab67616d0000b2730011f8dd8835a3b92ec217e9` | `11/ab67616d0000b2730011f8dd8835a3b92ec217e9` | 640x640 | 0 | no |
| 12 | 0.328 | `ab67616d0000b273000ae39961878e25f0567311` | `0a/ab67616d0000b273000ae39961878e25f0567311` | 640x632 | 5 | no |

</details>

### no-field-photographic

#### seed `ab67616d0000b2730003e28f477763147b213494`

`03/ab67616d0000b2730003e28f477763147b213494.jpg` — 640x640, tier 401-640, cluster 30, in the pool, never reviewed.

Why this seed: retreat-probe-2.txt; retreat-test-2.jsonl accepted=0, remainderArea 1.0, one full-canvas piece, no rejected attempts (the maximally degenerate retreat)

| # | cosine | id | path | WxH | cl | source | reviewed? |
|---|---|---|---|---|---|---|---|
| 1 | 0.107 | `ab67616d0000b2730015ffe87a711324130ff456` | `15/ab67616d0000b2730015ffe87a711324130ff456` | 640x640 | 2 | shard-15 | no |
| 2 | 0.098 | `ab67616d0000b2730007960724fb77c8041c6c13` | `07/ab67616d0000b2730007960724fb77c8041c6c13` | 640x640 | 7 | eval-142 | `accent-real-1`, `residual-purity-2`, `sam-mask-quality-1`, `sam-mask-quality-3b-cjk` |
| 3 | 0.093 | `ab67616d00001e020015c4b1e321737715655be1` | `15/ab67616d00001e020015c4b1e321737715655be1` | 300x300 | 1 | shard-15 | no |
| 4 | 0.085 | `ab67616d0000b2730015283bfca377c00f4b0d63` | `15/ab67616d0000b2730015283bfca377c00f4b0d63` | 640x640 | 0 | shard-15 | no |
| 5 | 0.084 | `ab67616d0000b273000eae9e88edccb2daddd528` | `0e/ab67616d0000b273000eae9e88edccb2daddd528` | 640x640 | 7 | cs1-core | no |
| 6 | 0.083 | `ab67616d0000b2730000fc5b6750a56548ed782b` | `00/ab67616d0000b2730000fc5b6750a56548ed782b.jpg` | 640x640 | 18 | cs1-core | no |
| 7 | 0.082 | `ab67616d0000b27300103a4dcd62e3dd6f76d123` | `10/ab67616d0000b27300103a4dcd62e3dd6f76d123` | 640x640 | 3 | eval-142 | `perception-4`, `sam-mask-quality-3-area-guard-and-hard-text` |
| 8 | 0.081 | `ab67616d0000b2730015f52c52eed6381a5b0301` | `15/ab67616d0000b2730015f52c52eed6381a5b0301` | 640x640 | 17 | shard-15 | no |
| 9 | 0.080 | `ab67616d0000b273000c42c61ba60f69e5a40a29` | `0c/ab67616d0000b273000c42c61ba60f69e5a40a29` | 640x640 | 2 | eval-142 | `perception-4`, `residual-purity-1` |
| 10 | 0.076 | `ab67616d0000b27300137c811595edad61c67781` | `13/ab67616d0000b27300137c811595edad61c67781` | 640x640 | 11 | cs1-core | `bcde-validation-1` |
| 11 | 0.074 | `ab67616d0000b273001398589df77e24a722fe6a` | `13/ab67616d0000b273001398589df77e24a722fe6a` | 640x640 | 5 | cs1-core | no |
| 12 | 0.072 | `ab67616d0000b27300150e29acb16143dc5bdfac` | `15/ab67616d0000b27300150e29acb16143dc5bdfac` | 640x640 | 20 | shard-15 | no |

<details><summary>corpus-wide k=12 (supplement, beyond the briefed pool)</summary>

| # | cosine | id | path | WxH | cl | reviewed? |
|---|---|---|---|---|---|---|
| 1 | 0.323 | `fed2bf2533abfd3e9f0a34297e9ad2cf` | `music-artworks/f/e/d/fed2bf2533abfd3e9f0a34297e9ad2cf.jpg` | 640x640 | 2 | no |
| 2 | 0.317 | `76910368655d7ccc167d4a1878065d24` | `music-artworks/7/6/9/76910368655d7ccc167d4a1878065d24.jpeg` | 512x512 | 2 | no |
| 3 | 0.251 | `ab67616d0000b2730010ab6734a97bd1d6054985` | `10/ab67616d0000b2730010ab6734a97bd1d6054985` | 640x640 | 2 | no |
| 4 | 0.206 | `ab67616d0000b2730010573c55138dccc815116f` | `10/ab67616d0000b2730010573c55138dccc815116f` | 640x640 | 2 | no |
| 5 | 0.204 | `ab67616d0000b2730000631f4a1f3f8a3286f79d` | `00/ab67616d0000b2730000631f4a1f3f8a3286f79d.jpg` | 640x640 | 2 | no |
| 6 | 0.202 | `ab67616d00001e020000ed9129fb488bc47da8e3` | `00/ab67616d00001e020000ed9129fb488bc47da8e3.jpg` | 300x300 | 2 | no |
| 7 | 0.200 | `ab67616d0000b273000cdba0e702ada0cd320861` | `0c/ab67616d0000b273000cdba0e702ada0cd320861` | 640x640 | 8 | no |
| 8 | 0.198 | `ab67616d0000b2730012c5ae5834907342517811` | `12/ab67616d0000b2730012c5ae5834907342517811` | 640x640 | 2 | no |
| 9 | 0.181 | `ab67616d0000b2730002fde618d9b5290865bbe0` | `02/ab67616d0000b2730002fde618d9b5290865bbe0.jpg` | 640x640 | 2 | no |
| 10 | 0.180 | `ab67616d0000b27300125ce175144b9ed18021e7` | `12/ab67616d0000b27300125ce175144b9ed18021e7` | 640x640 | 2 | no |
| 11 | 0.178 | `ab67616d0000b273000119c0652455206c04c17b` | `01/ab67616d0000b273000119c0652455206c04c17b.jpg` | 640x640 | 2 | no |
| 12 | 0.174 | `ab67616d0000b2730004cbd46e1ef34b044a4186` | `04/ab67616d0000b2730004cbd46e1ef34b044a4186` | 640x640 | 2 | no |

</details>

#### seed `952266f2430177b8659cd7a83785ac5e`

`music-artworks/9/5/2/952266f2430177b8659cd7a83785ac5e.jpg` — 700x700, tier 641-1024, cluster 10, in the pool, never reviewed.

Why this seed: retreat-probe-2.txt; accepted=0, remainderArea 0.956, enclosure 0.943 with one rejected attempt (retreat with competing candidates)

| # | cosine | id | path | WxH | cl | source | reviewed? |
|---|---|---|---|---|---|---|---|
| 1 | 0.640 | `f16b9facbba474709fffd417ee45a9fe` | `music-artworks/f/1/6/f16b9facbba474709fffd417ee45a9fe.jpg` | 640x632 | 10 | cs1-core | no |
| 2 | 0.493 | `c8010570617778ff9c5d0afdc4c0fb31` | `music-artworks/c/8/0/c8010570617778ff9c5d0afdc4c0fb31.jpeg` | 640x640 | 10 | cs1-core | `bcde-validation-1` |
| 3 | 0.434 | `ab67616d0000b2730015fd01c483824991d77549` | `15/ab67616d0000b2730015fd01c483824991d77549` | 640x640 | 25 | shard-15 | no |
| 4 | 0.387 | `ab67616d0000b273001581121970e9dcb865cf4d` | `15/ab67616d0000b273001581121970e9dcb865cf4d` | 640x640 | 10 | shard-15 | no |
| 5 | 0.385 | `ab67616d00001e020015a21d302001ee4ed15c81` | `15/ab67616d00001e020015a21d302001ee4ed15c81` | 300x300 | 25 | shard-15 | no |
| 6 | 0.382 | `ab67616d0000b2730015274a720a3d4e20c4c01a` | `15/ab67616d0000b2730015274a720a3d4e20c4c01a` | 640x640 | 16 | shard-15 | no |
| 7 | 0.377 | `ab67616d0000b27300014fb430dd1b693e653121` | `01/ab67616d0000b27300014fb430dd1b693e653121.jpg` | 640x640 | 10 | eval-142 | `cascade-ground-truth-1`, `ground-freetext-1`, `perception-4`, `pointing-ground-1`, `residual-purity-1`, `sam-mask-quality-1`, `sam-mask-quality-2-v2-ratification` |
| 8 | 0.369 | `ab67616d0000b273000efaac56201fc13ee0724b` | `0e/ab67616d0000b273000efaac56201fc13ee0724b` | 640x640 | 25 | eval-142 | no |
| 9 | 0.358 | `ab67616d0000b2730015a4891df8f35473f31ac3` | `15/ab67616d0000b2730015a4891df8f35473f31ac3` | 640x640 | 10 | shard-15 | no |
| 10 | 0.356 | `ab67616d0000b27300157a326802db6639e4e7cf` | `15/ab67616d0000b27300157a326802db6639e4e7cf` | 640x640 | 25 | shard-15 | no |
| 11 | 0.348 | `20db369b046d88454f86244116ea2579` | `music-artworks/2/0/d/20db369b046d88454f86244116ea2579.jpg` | 700x700 | 23 | cs1-core | no |
| 12 | 0.347 | `ab67616d0000b2730005230fae1822525e5a5ff6` | `05/ab67616d0000b2730005230fae1822525e5a5ff6` | 640x640 | 23 | cs1-enrichment,eval-142 | `oracle-premise-disambiguation-1`, `oracle-probe-gold-1`, `perception-4` |

<details><summary>corpus-wide k=12 (supplement, beyond the briefed pool)</summary>

| # | cosine | id | path | WxH | cl | reviewed? |
|---|---|---|---|---|---|---|
| 1 | 0.640 | `f16b9facbba474709fffd417ee45a9fe` | `music-artworks/f/1/6/f16b9facbba474709fffd417ee45a9fe.jpg` | 640x632 | 10 | no |
| 2 | 0.630 | `ab67616d0000b2730004814db3765c91299270e5` | `04/ab67616d0000b2730004814db3765c91299270e5` | 640x640 | 10 | no |
| 3 | 0.606 | `bcf968c83115796dfe03f34047f5298d` | `music-artworks/b/c/f/bcf968c83115796dfe03f34047f5298d.jpg` | 700x700 | 10 | no |
| 4 | 0.599 | `1e29723f47861de52d6d508d7e8fddc4` | `music-artworks/1/e/2/1e29723f47861de52d6d508d7e8fddc4.jpg` | 700x700 | 10 | no |
| 5 | 0.593 | `ab67616d00001e02000d2fc6af6d7295442f4aec` | `0d/ab67616d00001e02000d2fc6af6d7295442f4aec` | 300x300 | 10 | no |
| 6 | 0.591 | `ab67616d0000b2730002e1b8d58ec69833a5cf1e` | `02/ab67616d0000b2730002e1b8d58ec69833a5cf1e.jpg` | 640x640 | 10 | no |
| 7 | 0.570 | `2b1e94072d5ab01a069d61652202d5f1` | `music-artworks/2/b/1/2b1e94072d5ab01a069d61652202d5f1.jpg` | 700x700 | 10 | no |
| 8 | 0.568 | `ab67616d00001e02001440815485f74f33ec46f3` | `14/ab67616d00001e02001440815485f74f33ec46f3` | 300x300 | 10 | no |
| 9 | 0.563 | `ab67616d0000b273000719f4494ead933edb4c10` | `07/ab67616d0000b273000719f4494ead933edb4c10` | 640x640 | 10 | no |
| 10 | 0.553 | `ab67616d0000b27300132dea78777add4b23b777` | `13/ab67616d0000b27300132dea78777add4b23b777` | 640x640 | 10 | no |
| 11 | 0.553 | `0a16d4cc323a00aac76567d5206eb1b2` | `music-artworks/0/a/1/0a16d4cc323a00aac76567d5206eb1b2.jpg` | 640x640 | 10 | no |
| 12 | 0.548 | `c5072c9f9323d62000058b310fec4878` | `music-artworks/c/5/0/c5072c9f9323d62000058b310fec4878.jpg` | 593x600 | 10 | no |

</details>

#### seed `ab67616d00001e020013d322d1bc6a020541cfbd`

`13/ab67616d00001e020013d322d1bc6a020541cfbd` — 300x300, tier <=400, cluster 32, in the pool, never reviewed.

Why this seed: retreat-probe-2.txt; accepted=0, remainderArea 0.925 — the least degenerate unreviewed retreat cover

| # | cosine | id | path | WxH | cl | source | reviewed? |
|---|---|---|---|---|---|---|---|
| 1 | 0.413 | `ab67616d00001e020015d6b79af51cb0e22b8c45` | `15/ab67616d00001e020015d6b79af51cb0e22b8c45` | 300x300 | 32 | shard-15 | no |
| 2 | 0.390 | `ab67616d00001e020015c35b3c99827a6b75ceea` | `15/ab67616d00001e020015c35b3c99827a6b75ceea` | 300x300 | 7 | shard-15 | no |
| 3 | 0.363 | `ab67616d0000b27300151d7616eece56361d531b` | `15/ab67616d0000b27300151d7616eece56361d531b` | 640x640 | 29 | shard-15 | no |
| 4 | 0.350 | `ab67616d0000b27300157130c7c4faf82358d272` | `15/ab67616d0000b27300157130c7c4faf82358d272` | 640x640 | 32 | shard-15 | no |
| 5 | 0.340 | `ab67616d00001e0200157a009db182b9099b7bc0` | `15/ab67616d00001e0200157a009db182b9099b7bc0` | 300x300 | 29 | shard-15 | no |
| 6 | 0.333 | `ab67616d0000b2730015de706bf50c2858b60fcd` | `15/ab67616d0000b2730015de706bf50c2858b60fcd` | 640x640 | 29 | shard-15 | no |
| 7 | 0.327 | `ab67616d00001e020015716f05a2325446a4f79d` | `15/ab67616d00001e020015716f05a2325446a4f79d` | 300x300 | 15 | shard-15 | no |
| 8 | 0.319 | `ab67616d0000b27300083cc5b8d8d2e7ca7147cd` | `08/ab67616d0000b27300083cc5b8d8d2e7ca7147cd` | 640x640 | 29 | eval-142 | `accent-real-1` |
| 9 | 0.317 | `ab67616d0000b2730015b705ad0527c60f57f13c` | `15/ab67616d0000b2730015b705ad0527c60f57f13c` | 640x640 | 25 | shard-15 | no |
| 10 | 0.314 | `ab67616d00001e02000485aa752a4671880731ca` | `04/ab67616d00001e02000485aa752a4671880731ca` | 300x300 | 33 | cs1-core | `cal-029`, `cal-030` |
| 11 | 0.300 | `ab67616d0000b273000eae9e88edccb2daddd528` | `0e/ab67616d0000b273000eae9e88edccb2daddd528` | 640x640 | 7 | cs1-core | no |
| 12 | 0.300 | `ab67616d00001e020003748f0b2cb5347f9c0779` | `03/ab67616d00001e020003748f0b2cb5347f9c0779.jpg` | 300x300 | 32 | cs1-core | `phase2-cal-025` |

<details><summary>corpus-wide k=12 (supplement, beyond the briefed pool)</summary>

| # | cosine | id | path | WxH | cl | reviewed? |
|---|---|---|---|---|---|---|
| 1 | 0.647 | `ab67616d0000b27300079803fc63a983c4e79909` | `07/ab67616d0000b27300079803fc63a983c4e79909` | 640x640 | 31 | no |
| 2 | 0.550 | `ab67616d0000b27300050d7ab243b39f627317e8` | `05/ab67616d0000b27300050d7ab243b39f627317e8` | 640x640 | 19 | no |
| 3 | 0.471 | `ab67616d0000b2730008f6e43329b4bbef3bbc11` | `08/ab67616d0000b2730008f6e43329b4bbef3bbc11` | 640x640 | 7 | no |
| 4 | 0.441 | `ab67616d00001e020004991468ca28b8543235fb` | `04/ab67616d00001e020004991468ca28b8543235fb` | 300x300 | 32 | no |
| 5 | 0.437 | `ab67616d0000b2730013eacbdc48a9f93c587b38` | `13/ab67616d0000b2730013eacbdc48a9f93c587b38` | 640x640 | 32 | no |
| 6 | 0.419 | `ab67616d0000b27300069ba24213c4ab4e15f0a7` | `06/ab67616d0000b27300069ba24213c4ab4e15f0a7` | 640x640 | 32 | no |
| 7 | 0.413 | `ab67616d00001e020015d6b79af51cb0e22b8c45` | `15/ab67616d00001e020015d6b79af51cb0e22b8c45` | 300x300 | 32 | no |
| 8 | 0.407 | `ab67616d0000b27300000e2bb5fe26014ecb90c1` | `00/ab67616d0000b27300000e2bb5fe26014ecb90c1.jpg` | 640x640 | 19 | no |
| 9 | 0.398 | `ab67616d00001e020006177f757a4450281d133f` | `06/ab67616d00001e020006177f757a4450281d133f` | 300x300 | 29 | no |
| 10 | 0.395 | `f0e1c6c82515a056a986d24f3d152fb3` | `music-artworks/f/0/e/f0e1c6c82515a056a986d24f3d152fb3.jpg` | 700x700 | 12 | no |
| 11 | 0.394 | `ab67616d0000b2730003868f1003ddb07a7a2300` | `03/ab67616d0000b2730003868f1003ddb07a7a2300.jpg` | 640x640 | 32 | no |
| 12 | 0.390 | `ab67616d00001e020015c35b3c99827a6b75ceea` | `15/ab67616d00001e020015c35b3c99827a6b75ceea` | 300x300 | 7 | no |

</details>

## Seed provenance and the two judgement calls

Four seeds were named in the task and resolve unambiguously. Five were not, and were chosen
under a stated rule:

**frame/letterbox.** `ground-test-1.jsonl` and `retreat-test-4.md` rank the 8-cover
`data/devloop/sets/frame-probe.txt` fixture by two different measures, and they disagree.
By the field literally named `thickness` the two thickest are `b4a18636…` (0.249) and
`cc35f7f9…` (0.140); by pixel share, `retreat-test-4.md` names `9c44f2ac…` (0.478) and
`7b51bde9…` (0.446) *in prose* as “the two thick-frame covers”. **The prose pair is used**,
because it is the one the measurement doc itself calls out and because `ground-test-1.jsonl`
independently corroborates it as frame-*shaped* (`9c44f2ac…` reach 0.999, enclosure 1.0),
whereas the thickest-by-band cover `b4a18636…` has enclosure 0.0005 — a large flat band that
encloses nothing. Both alternates are in the corpus with embeddings if the other reading is
wanted: `music_artworks:b4a18636207b8de2cb0d9d4e9747bd71` (cluster 23) and
`music_artworks:cc35f7f97c2c503a2812639457eae265` (cluster 23).

**no-field/photographic.** All 18 covers in `data/devloop/sets/retreat-probe-2.txt` carry
`accepted: 0` — no field component was accepted at all — with the unexplained remainder covering
92–100% of the image. Three were taken, none of them already reviewed (6 of the 18 are: they are
round-2 covers or the phase2 veto), one per structural sub-kind, and they happen to span three
resolution tiers and three clusters: the maximally degenerate full-canvas case
(`…0003e28f…`, remainderArea 1.0, no rejected attempts), a case with competing rejected
attempts (`952266f2…`, remainderArea 0.956, enclosure 0.943), and the least degenerate
(`…0013d322…`, remainderArea 0.925).

## Caveats

1. **Neighbour ≠ same failure.** Cosine proximity in DINOv2 space is visual similarity, not
   shared failure mode. Nothing here has been checked by eye or by running an arm. A
   neighbourhood is a *candidate* test set; it becomes evidence only once the fix is run on it.
2. **Two seeds sit outside the briefed pool** (`9c44f2ac…`, `7b51bde9…`) and one class’s seeds
   are mostly inside it. That asymmetry is a property of where the probe fixtures were drawn
   from, not of the classes.
3. **The near-duplicate census is a documented lower bound.** A neighbour listed as unreviewed
   could still be a near-copy of a reviewed cover below cosine 0.95. This carries the same
   caveat round 1 and round 2 carry.
4. **`reviewed?` is deliberately broad.** It fires on SAM, perception and oracle batches as well
   as on palette verdicts, so a cover marked reviewed has not necessarily had a *palette*
   judged. `reviewedIn` in the JSON names the batches; check it before treating a cover as spent.

## Reproducing this

```
cd /Users/Flo/GitHub/palette
V=research/v3/oracle/embeddings/.venv/bin/python
T=research/v3/phase-3/embeddings/tools
# 1. recover the coverage-set clustering (writes tools/clusters.json, ~5 MB, ~2 min, CPU only)
node --experimental-strip-types $T/recluster.ts $T/clusters.json
# 2. the data files
$V $T/neighbours.py && $V $T/coverage.py
# 3. the markdown
$V $T/render_neighbours.py && $V $T/render_coverage.py
```

Nothing in the chain decodes an image except the final header read on the eight drawn covers,
nothing touches the GPU, and nothing writes outside `research/v3/phase-3/embeddings/`.

