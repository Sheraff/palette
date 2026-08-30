# Cluster coverage of reviewed covers, and the next round’s draw

**Files:** `COVERAGE.md` (this) and `coverage.json` (machine-readable, including the per-cluster
id lists and the full draw record).

## The question

Of the 36 clusters the corpus was cut into, which ones has the reviewer actually judged a
**palette** on — and which ones has nobody ever looked at? A cluster nobody has judged is a
**category hole**: a kind of cover on which no arm has ever been graded, so nothing is known
about how it behaves, good or bad.

## Method

- **Clustering:** k=36, seed `0xc0efface`, arm `dinov2-vitl14`, over the 9232-artwork
  coverage-set universe, reproduced from research/v3/src/coverage-set/build-coverage-set.ts (same code path, same inputs).
  Verification: cluster sizes and all 218 in-universe coverage-set-1 cluster labels reproduce exactly; 44 iterations, converged.
  Nothing was re-embedded and no new clustering was invented — this is the same 36 clusters
  `data/coverage-set/COVERAGE_SET.md` reports, recovered so that arbitrary covers can be placed in it.
- **Phase 3 =** batches `cal-027`, `cal-028`, `cal-029`, `cal-030` — **13 distinct covers**.
- **Phase 2 =** every batch whose id starts `phase2-` — **49 distinct covers**
  (48 carry a verdict; the 49th, `ab67616d00001e0200000bbc3367a621256ce593`, carries the single
  `veto` record. Both count as judged.)
- **Other batches** (142 distinct covers placed in a cluster) are reported in their own column and
  are **not** part of the hole test. every other warehouse batch (SAM mask quality, perception-4, accent-*, residual-purity, pointing-*, oracle-*, bracketing, dropped-colors, cascade-ground-truth, bcde-*, demo-*, endorsement-recheck). Counted in a separate column because those rounds asked different questions of a cover; they are not palette verdicts.
  A further 67 covers touched by those batches cannot be placed at all: legacy images/ covers and synthetic probe ids (smq-*, pt1-*, resid*-*, pg1-*) that are not corpus artworks and therefore have no cluster. SAM overlay and residual-sheet records ARE resolved, through rendition.artworkId, to the corpus artwork they show.

## Per-cluster coverage

| cluster | universe | corpus share | Phase 2 | Phase 3 | P2+P3 | other batches | hole? |
|---|---|---|---|---|---|---|---|
| 0 | 256 | 2.77% | 0 | 0 | 0 | 1 | **HOLE** |
| 1 | 162 | 1.75% | 1 | 0 | 1 | 2 |  |
| 2 | 298 | 3.23% | 2 | 0 | 2 | 7 |  |
| 3 | 36 | 0.39% | 1 | 0 | 1 | 1 |  |
| 4 | 139 | 1.51% | 0 | 1 | 1 | 3 |  |
| 5 | 230 | 2.49% | 2 | 0 | 2 | 2 |  |
| 6 | 317 | 3.43% | 2 | 0 | 2 | 8 |  |
| 7 | 247 | 2.68% | 0 | 0 | 0 | 4 | **HOLE** |
| 8 | 342 | 3.7% | 1 | 2 | 3 | 6 |  |
| 9 | 300 | 3.25% | 0 | 0 | 0 | 5 | **HOLE** |
| 10 | 263 | 2.85% | 0 | 0 | 0 | 2 | **HOLE** |
| 11 | 113 | 1.22% | 0 | 0 | 0 | 4 | **HOLE** |
| 12 | 249 | 2.7% | 1 | 0 | 1 | 2 |  |
| 13 | 170 | 1.84% | 1 | 1 | 2 | 4 |  |
| 14 | 357 | 3.87% | 0 | 0 | 0 | 4 | **HOLE** |
| 15 | 352 | 3.81% | 5 | 1 | 6 | 9 |  |
| 16 | 389 | 4.21% | 4 | 0 | 4 | 3 |  |
| 17 | 238 | 2.58% | 2 | 1 | 3 | 2 |  |
| 18 | 477 | 5.17% | 1 | 1 | 2 | 8 |  |
| 19 | 231 | 2.5% | 3 | 0 | 3 | 8 |  |
| 20 | 296 | 3.21% | 0 | 0 | 0 | 4 | **HOLE** |
| 21 | 336 | 3.64% | 2 | 1 | 3 | 4 |  |
| 22 | 54 | 0.58% | 1 | 0 | 1 | 0 |  |
| 23 | 293 | 3.17% | 1 | 1 | 2 | 4 |  |
| 24 | 305 | 3.3% | 0 | 0 | 0 | 2 | **HOLE** |
| 25 | 247 | 2.68% | 1 | 0 | 1 | 4 |  |
| 26 | 289 | 3.13% | 0 | 0 | 0 | 4 | **HOLE** |
| 27 | 139 | 1.51% | 2 | 0 | 2 | 4 |  |
| 28 | 225 | 2.44% | 4 | 0 | 4 | 4 |  |
| 29 | 278 | 3.01% | 1 | 1 | 2 | 5 |  |
| 30 | 73 | 0.79% | 3 | 0 | 3 | 1 |  |
| 31 | 112 | 1.21% | 0 | 0 | 0 | 1 | **HOLE** |
| 32 | 225 | 2.44% | 2 | 0 | 2 | 5 |  |
| 33 | 246 | 2.66% | 1 | 1 | 2 | 2 |  |
| 34 | 595 | 6.44% | 1 | 0 | 1 | 7 |  |
| 35 | 353 | 3.82% | 4 | 2 | 6 | 6 |  |
| **total** | 9232 | 100% | 49 | 13 | 62 | 142 | 10 holes |

## The holes

**10 of 36 clusters hold 27.49% of the corpus and have never had a palette judged on them**
in Phase 2 or Phase 3, in descending corpus share:

| cluster | universe | corpus share | other-batch contact |
|---|---|---|---|
| 14 | 357 | 3.87% | 4 |
| 24 | 305 | 3.3% | 2 |
| 9 | 300 | 3.25% | 5 |
| 20 | 296 | 3.21% | 4 |
| 26 | 289 | 3.13% | 4 |
| 10 | 263 | 2.85% | 2 |
| 0 | 256 | 2.77% | 1 |
| 7 | 247 | 2.68% | 4 |
| 11 | 113 | 1.22% | 4 |
| 31 | 112 | 1.21% | 1 |

Caveat, stated so nobody over-reads the list: with every other warehouse batch counted too, no cluster is empty — the holes are holes in PALETTE judgement, not in all reviewer contact. All ten hole clusters
have had at least one cover in front of the reviewer for some *other* question (a SAM mask, a
perception judgement, an accent label) — the column above shows how many. What has never
happened in any of them is a palette verdict.

Read the other direction: judgement so far is concentrated. Clusters 15 and 35 carry 6 judged
covers each and 16 and 28 carry 4, while a quarter of the corpus carries none. Phase 2 reached
25 of 36 clusters; Phase 3’s 13 covers sit in 11 clusters, so **Phase 3 alone has 25 holes**.

## Proposed draw for the next round — 8 covers

**Not staged, not pushed, not registered as a round.** This is a proposal; a round is a
reviewer decision.

- **Seed:** `0x7c11e3` (8131043), mulberry32 — the 8 slots are allocated across the 10 hole clusters in proportion to corpus share (largest remainder), which lands exactly one cover in each of the 8 largest holes; clusters 11 and 31 (1.22% and 1.21%) get none. Within a cluster: candidates sorted by artworkId ascending, Fisher-Yates shuffled from one mulberry32(0x7c11e3) stream consumed in fixed stratum order (descending corpus share), then walked taking the first candidate passing every filter. The Python mulberry32 used here was verified against round-2 COVERS.md by reproducing its published first six draws for 0x5a7e21 exactly.
- **Candidate order:** coverage-set-1 core members of the cluster, then then eval-142 / shard-15 members of the cluster.
- **Filters, all applied in order:**
  - never reviewed: neither the artwork id, the file stem nor the basename appears anywhere in warehouse.jsonl (raw substring, plus every 24-40 hex token in it)
  - not held out and not quarantined
  - no near-duplicate component sibling that is reviewed, held out or quarantined
  - file present on disk; WxH re-read from the image header, not from a record
- **Allocation:** cluster 0 → 1, cluster 7 → 1, cluster 9 → 1, cluster 10 → 1, cluster 14 → 1, cluster 20 → 1, cluster 24 → 1, cluster 26 → 1 (clusters 11 and 31 get 0 — they are the two smallest holes at 1.22% and 1.21%).
- **Rejections during the walk:** 0. Every stratum’s first shuffled candidate passed every filter.

| # | cluster | cluster share | id | path | WxH | tier | drawn from |
|---|---|---|---|---|---|---|---|
| 1 | 14 | 3.87% | `ab67616d0000b27300082f847e951b800ff04133` | `08/ab67616d0000b27300082f847e951b800ff04133` | 640x640 | 401-640 | coverage-set-1 core |
| 2 | 24 | 3.3% | `a707cfc0f073afb18bdbc6bda8b7786c` | `music-artworks/a/7/0/a707cfc0f073afb18bdbc6bda8b7786c.jpeg` | 700x700 | 641-1024 | coverage-set-1 core |
| 3 | 9 | 3.25% | `ab67616d00001e02000ea4559c7271bdcd9b56cb` | `0e/ab67616d00001e02000ea4559c7271bdcd9b56cb` | 300x300 | <=400 | coverage-set-1 core |
| 4 | 20 | 3.21% | `9ed9c1e7370812333c0f7ad2d7fb8090` | `music-artworks/9/e/d/9ed9c1e7370812333c0f7ad2d7fb8090.jpg` | 640x640 | 401-640 | coverage-set-1 core |
| 5 | 26 | 3.13% | `ab67616d00001e0200011a71dc82a914663aa5ce` | `01/ab67616d00001e0200011a71dc82a914663aa5ce.jpg` | 300x300 | <=400 | coverage-set-1 core |
| 6 | 10 | 2.85% | `ab67616d0000b273001010e764d0001eeb2e59f0` | `10/ab67616d0000b273001010e764d0001eeb2e59f0` | 640x640 | 401-640 | coverage-set-1 core |
| 7 | 0 | 2.77% | `4378237c16d1002f395ab654ccdd7012` | `music-artworks/4/3/7/4378237c16d1002f395ab654ccdd7012.jpg` | 500x500 | 401-640 | coverage-set-1 core |
| 8 | 7 | 2.68% | `ab67616d0000b273000eae9e88edccb2daddd528` | `0e/ab67616d0000b273000eae9e88edccb2daddd528` | 640x640 | 401-640 | coverage-set-1 core |

Every WxH above was re-read from the image header with Pillow at draw time and matched the
dimensions recorded in the embedding ids file; every file was confirmed present on disk. All
eight are `role: "core"` coverage-set-1 members, so all eight are in the embedding universe and
carry a near-duplicate component id.

Resolution mix of the eight: four at 640 px, two at 300 px, one at 700 px and one at 500 px —
six of eight in the 401–640 tier against the corpus’s 61.6%, two in ≤400 against 26.5%. Close
enough not to need repair, and not forced: the draw stratifies on cluster, not on tier, because
the holes are the thing being closed.

## What this draw does not do

1. **It closes 8 of 10 holes, not all 10.** Clusters 11 and 31 (2.4% of the corpus between them)
   stay dark. Adding them means a 10-cover round.
2. **One cover per cluster is presence, not coverage.** After this round each of those clusters
   has exactly one judged cover — enough to say the kind has been seen, nowhere near enough to
   say how an arm behaves on it.
3. **It carries no returning covers.** Rounds 1 and 2 both carried returning covers to measure
   drift. These eight are all fresh; if drift measurement matters more than hole-closing, the
   round needs to be bigger or the allocation split.
4. **The near-duplicate census is a lower bound** (it undercounts by ~46% against filename ground
   truth), so “never reviewed” is guaranteed only down to cosine 0.95. Same caveat as rounds 1 and 2.

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

