# Fresh-shard import drill — shard `15/`

**Date:** 2026-08-04 · **Exercises:** loose end **A11** ("the fresh hex-shard import mechanism has never been exercised") · **Arm:** `dinov2-vitl14` @224 (`CANONICAL_ARM`, decision `d-2026-08-02-embedding-canonical-model`) · **GPU:** single slot held for the embedding step, released on completion.

A11 says that under reviewer ruling R-1 the *entire* naive-evaluation claim routes through importing fresh hex shards, and that the mechanism had never been run. The reviewer added `15/` — the first genuinely new shard since the corpus was mapped. This is the rehearsal, run deliberately **before** the day fresh shards are load-bearing.

> **The point of this drill was to find the bugs now. It found five — one a silent success, one a 34.6 MB commit waiting to happen.**

---

## 0. Verdict up front

| | |
|---|---|
| Files in `15/` | **378** (348 distinct artworks; 30 present at both renditions) |
| Exact byte duplicates vs the pinned 7,550 | **0** |
| Near-duplicates vs the pinned 16,145-file pool (cosine ≥ 0.95) | **1** (max 0.999422) |
| Internal near-duplicate pairs inside `15/` (≥ 0.95) | **30**, all of them the same artwork at two renditions |
| Cluster placement | **32 of 36** existing clusters receive files; **no new region of space** |
| Embedding cost | **16 s** wall for 378 files (34.4 img/s, MPS), against a 10-minute budget |
| Blocking bugs found | **5** (see §5) |

**Bottom line:** the shard itself is excellent evaluation material — genuinely fresh, 0.26 % contamination against a corpus whose own internal contamination rate is 16.8 %. The *machinery*, by contrast, had no working path for a fresh shard at all, and the flag that looks like the mechanism fails silently. All five bugs are fixable and three are fixed here.

---

## 1. Survey of `15/`

Measured 2026-08-04, all counts re-derivable by the commands in §7.

### Shape

| property | `15/` | pinned corpus convention |
|---|---|---|
| file count | 378 | 325–420 per shard; 7,550 across `00`–`14` |
| format | 378/378 JPEG **by magic bytes** | same — extensions are deliberately not trusted (`config.py` §"Extensions are deliberately not used") |
| filename | 40 hex chars, no extension | matches shards `05`–`14`; shards `00` and `01` carry `.jpg` — the corpus is *already* inconsistent here and `15/` follows the majority |
| filename conformance | 378/378 on-pattern | pinned corpus has **5 off-pattern** files (`corpus.ts:26-27`), so `15/` is *cleaner* than the corpus |
| shard key | chars 19–20 of every filename = `15` | same rule holds in every pinned shard |
| rendition prefixes | 140 × `ab67616d00001e02` (300 px), 238 × `ab67616d0000b273` (640 px) | both prefixes are in `SHARDED_RENDITION_PREFIXES`; ratio matches shard `14` (134/218) |
| total bytes | 34.6 MB; min 6,610, mean 91,451, max 352,410 | in range |

### Anomalies — all benign, none blocking

- **5 grayscale files** (`components 1` rather than 3). PIL's `convert("RGB")` handles these; the pinned corpus contains the same class of file. No action.
- **1 non-square file**, `ab67616d00001e020015d8ff6f7d5f1d9b4b2eba` at 300×299. `|w/h − 1| = 0.0033`, well inside `SQUARE_ASPECT_TOLERANCE = 0.05`, so it survives coverage-set filtering. No action.
- **All 378 files clear `MIN_BEST_LONG_EDGE_PX = 150`** (smallest rendition is 300 px).
- **Filename hygiene:** zero non-printable bytes, zero NULs, zero dotfiles, zero subdirectories, zero zero-byte files, zero unreadable files. `15/` is a clean drop.

### The one structural fact that matters for evaluation

`15/` is **378 files but only 348 artworks**. Thirty artwork ids appear at both 300 px and 640 px. Anyone treating a fresh shard as "378 independent evaluation items" overcounts by 8.6 %. This matches the pinned corpus's own behaviour (shard `14`: 327 artworks in 352 files) and is exactly what `shardedArtworkId()` in `corpus.ts` exists to collapse — but nothing *enforces* the collapse at import time.

---

## 2. Deduplication

### 2.1 Byte-identical (sha256, CPU, run first)

- **0** of 378 files are byte-identical to any of the 7,550 pinned files.
- **0** byte-identical pairs *within* `15/`.

**Incidental finding, pre-existing, not caused by this drill:** the pinned corpus contains **3 groups of byte-identical files** spanning shards — one group of 7 (`01`×2, `07`×2, `14`, `0a`, `10`), one of 4 (`00`, `11`, `04`, `0e`), one of 2 (`03`, `10`). The same bytes are stored under different artwork ids in different shards. This is invisible to every count in the repo, which treats path as identity. Proposed as new loose end **A19** (§6).

### 2.2 Near-duplicate (embedding cosine ≥ 0.95, canonical arm)

Thresholds taken from `near_dup_census.py`: `NEAR_DUP_THRESHOLD = 0.95`, `STRICT_THRESHOLD = 0.98`, `COSINE_ROUND_DECIMALS = 6`.

**Against the pinned pool (378 × 16,145 cosines):**

| statistic | value |
|---|---|
| files with a neighbour ≥ 0.95 | **1** (0.26 %) |
| files with a neighbour ≥ 0.98 | **1** |
| max cosine | 0.999422 |
| mean of per-file max cosine | 0.554552 |
| median of per-file max cosine | 0.544357 |

The single collision:

```
0.999422   15/ab67616d00001e020015abbadbfa03113631c268
        ->  0b/ab67616d00001e02000bf4ce0e2ea7288843fbd8
```

Both 300×300 JPEG, **different bytes** (47,251 vs 46,973), **different sha256**, **different artwork ids in different shards** — the same picture re-encoded and re-published. Byte-checking alone would have missed it; this is precisely why the embedding pass is not optional. The next-nearest file is 0.9036, so the gap between "genuine duplicate" and "merely similar" is wide and unambiguous at this threshold.

**Context:** the pinned census reports **2,718 of 16,145 files (16.8 %)** involved in a ≥0.95 pair on this arm. A fresh shard contaminating at **0.26 %** is roughly two orders of magnitude cleaner. `15/` is fit for unbiased evaluation after quarantining one file.

**Within `15/` (378 × 378):**

- **30 pairs** at ≥ 0.95, lowest 0.971448, highest 0.998384.
- **30 of 30** are the same 24-char artwork id at two renditions — i.e. every internal near-duplicate is the expected 300 px/640 px pair, **not** a defect.
- **0** internal near-duplicate pairs between *different* artworks.

This independently confirms the filename analysis in §1, which found exactly 30 artwork ids present at both renditions. Two methods, same 30. That agreement is the drill's strongest evidence that the import read the shard correctly.

---

## 3. Integration — where the vectors went, and why there

### 3.1 The chosen shape: a new *collection*, not a wider shard list

`15/` is imported as its own collection, `sharded_fresh_15`, rather than by appending `"15"` to `SHARDED_DIR_NAMES`.

**Why.** `SHARDED_DIR_NAMES` is the denominator behind every completeness check in the package (`common.enumerate_collection` → `eval_pairs.discover_arms`, `embed.py`, `query.require_complete`). Widening it from 7,550 to 7,928 would retroactively mark **all five already-embedded arms incomplete**, and would recompute the bake-off pool, the near-duplicate census pool and the coverage-set universe over a different population than every committed number was measured on. The constants are pinned precisely to make that impossible to do by accident (adversarial review 2026-08-03, MINOR-11).

A separate collection lands in its own `<collection>.<arm>.*` files — the naming scheme the package already uses — so **nothing existing is overwritten and no pinned number moves.** This is the same doctrine as the near-duplicate census sidecar (loose end C10, `census_holdout_annotation.py:19-35`): *the bytes of the existing evidence are evidence; the addition goes beside them, not into them.*

### 3.2 Artifacts produced

Written to `research/v3/data/embeddings-fresh-15/` — a **separate out-dir**, which is what `embed.py --paths-file`'s own help text prescribes for targeted runs, and which guarantees the committed `manifest.json` and the committed `.ids.jsonl` set are not rewritten.

| file | committed? | notes |
|---|---|---|
| `sharded_fresh_15.dinov2-vitl14.ids.jsonl` | **yes** | row → path + sha256 + dimensions, 378 rows, all `status: ok` |
| `sharded_fresh_15.dinov2-vitl14.npy` | no (gitignored) | (378, 1024) float32, L2-normalized |
| `shards/…f32`, `shards/…attempts.jsonl` | no (gitignored) | append-only write-ahead state |
| `manifest.json` | **yes** | provenance: model pin, weights sha256 verified, preprocessing, per-collection completeness |
| `fresh-shard-probe.json` | **yes** | the full dedup + cluster report backing this document |

`.gitignore` extended with the same policy the pinned directory uses: index and manifest committed, vectors not.

**Zero committed files were modified by the import.** `near-dup-census.json` was not regenerated, so its three sha256 pins (in `holdout.json`, `coverage-set-1.json`, `decisions.json`) still hold.

### 3.3 Cluster placement

There are **no stored centroids anywhere in the repo** — `gallery/summary.json` keeps cluster statistics only, and both clusterings are reproduced from their seeds rather than serialized. So placement was answered by re-deriving the pinned gallery clustering (k=36, seed 20260802, over the same 16,145-file pool in the same order) and assigning the fresh vectors to the nearest centroid with the pinned tie rule.

**The reproduction converged in 93 iterations — exactly the number `gallery/summary.json` records for `dinov2-vitl14`.** The clustering was reproduced bit-faithfully, so these assignments are exact, not approximate.

| statistic | fresh `15/` | pinned pool |
|---|---|---|
| clusters receiving files | **32 / 36** | 36 / 36 |
| mean cosine to assigned centroid | 0.4602 | 0.4928 |
| min cosine to assigned centroid | 0.0581 | — |

**No new region of space.** The fresh shard spreads across the existing structure and sits slightly *further* from centroids on average (0.4602 vs 0.4928) — consistent with unseen-but-same-distribution material, not with a novel visual population. Four clusters receive nothing: **5, 6, 12, 16**.

Distribution differences vs the pinned pool, in percentage points of each population:

| cluster | fresh share | pinned share | Δ |
|---|---|---|---|
| 25 | 6.88 % | 2.51 % | **+4.37 pp** |
| 27 | 11.11 % | 8.14 % | +2.97 pp |
| 26 | 5.82 % | 2.90 % | +2.92 pp |
| … | | | |
| 9 | 0.26 % | 1.78 % | −1.52 pp |
| 19 | 1.32 % | 2.93 % | −1.61 pp |
| 8 | 0.53 % | 3.77 % | **−3.24 pp** |

At n=378 a ±3–4 pp swing on a cluster holding 2–4 % of the corpus is a handful of files and should not be over-read. The honest summary is: **same space, mild reweighting, four thin clusters unrepresented.**

### 3.4 What a future holdout / coverage refresh must do with `15/`

1. **Quarantine one file.** `15/ab67616d00001e020015abbadbfa03113631c268` duplicates `0b/…f4ce0e2ea7288843fbd8` at 0.9994. It must not appear in a "never seen" evaluation set.
2. **Collapse to artworks before sampling.** 378 files → **348 artworks**. Sample artworks, choose the best rendition per artwork (the rule `corpus.ts` already implements), never sample files.
3. **Do not re-cluster to place it.** Clusters 5, 6, 12 and 16 are unrepresented; a stratified draw over `15/` alone cannot cover all 36 strata. Either accept 32-cluster coverage and say so, or import more fresh shards until the thin clusters fill.
4. **Do not fold `15/` into `coverage-set-1.json`.** A redraw is a new file carrying `supersedes` (`build-coverage-set.ts:55-58`), never an edit.
5. **Near-dup census:** produce a sidecar (`near-dup-census.shard-15.json`), never a regenerated census — the sha pins.
6. **Budget:** at 34.4 img/s, a fresh shard costs **~16 s of GPU** plus ~3 s for the probe. The expensive part is the cluster reproduction (full-corpus k-means), not the embedding. Importing ten shards at claim time is minutes, not hours.

---

## 4. What worked first try

- **`enumerate_collection` generalized cleanly.** Adding a second sharded-style collection needed one branch condition and a directory-list selector; sort order, dotfile skipping and relative-path construction were all reusable as-is.
- **The store/resume machinery.** 378/378 embedded, 0 failed, 0 retries, append-only shard flushed and fsynced per batch, finalize to `.npy` clean on the first attempt.
- **Weight pinning.** `--verify-weights` re-hashed the checkpoint against the pinned sha256 and passed silently — the arm that embedded `15/` is provably the arm that embedded the corpus.
- **The count guard did its job.** `EXPECTED_FILE_COUNTS[sharded_fresh_15] = 378` was pinned the day the shard arrived, and `selftest.py` still passes all 11 checks with the pinned corpus untouched at 7,550.
- **Determinism.** The k-means reproduction hit 93 iterations, matching the committed run exactly. Seeded reproduction instead of stored centroids is more robust than it looks.
- **Performance was a non-issue.** 16 s against a 10-minute budget; nothing approached the 25-minute stop-and-report line.

---

## 5. What broke

### BUG 1 — `--paths-file` is a silent no-op for a fresh shard *(critical)*

`--paths-file` is the flag whose help text reads "for smoke tests and **targeted re-runs**" — the obvious mechanism for importing a new shard. It cannot work, because it *filters* the enumeration rather than *extending* it, and the enumeration only ever walks `SHARDED_DIR_NAMES`.

Verified empirically. Feeding all 378 real, readable `15/` paths to the `sharded` collection:

```
[embed] [dinov2-vitl14] sharded: 0 files, 0 already embedded, 0 already failed, 0 queued
[embed] sharded: wrote …/sharded.dinov2-vitl14.npy (0, 1024)
[embed] sharded stats: {… "queued": 0, "embedded": 0, "remaining": 0}
EXIT CODE: 0
```

**Exit code 0. `"remaining": 0`. A zero-row `.npy` and an empty `.ids.jsonl` written. No warning of any kind.** At claim time, under deadline, this is a trap that produces a confident empty result. An operator following the help text would conclude the import succeeded.

*Status: not patched — see proposed loose end A20. The right fix is a guard (refuse to run when `--paths-file` yields zero matches), not a behaviour change, and `--paths-file`'s semantics belong to a wider discussion than this drill.*

### BUG 2 — the obvious alternative is a trap in the other direction

Appending `"15"` to `SHARDED_DIR_NAMES` raises `CorpusSizeMismatch` from `enumerate_collection`. That is the guard working — but `query.collection_provenance` **catches** it and falls back to the pinned 7,550 with `complete = False`, so the failure surfaces downstream as "every census, gallery and bake-off run refuses to start" rather than as "you changed the corpus". Recoverable and not silent, but the error does not name the cause at the point of use.

*Status: not patched (correct behaviour, poor diagnostics). Folded into proposed A20.*

### BUG 3 — a non-pinned collection got no provenance record at all *(fixed)*

`write_manifest`'s per-collection loop iterated `config.COLLECTIONS`. A collection outside the pinned pair was embedded with **no entry in `manifest.json`** — 378 vectors on disk with no record of what model produced them, which is a direct violation of the provenance rule in `CONVENTIONS.md`. The drill found its own output undocumented.

*Status: **fixed.** The loop now iterates `ALL_COLLECTIONS` and skips collections with no store in the out-dir, so a manifest written over the pinned data directory is unchanged while a fresh-shard out-dir gets its entry.*

### BUG 4 — the shard list exists in four independent written forms *(two fixed, two documented)*

| location | form | status |
|---|---|---|
| `oracle/embeddings/config.py` | explicit 21-entry tuple | left pinned; fresh shard added as a separate constant |
| `oracle/sam/config.py` | `tuple(f"{i:02x}" for i in range(0x15))` | **not edited — different workstream's owned path** |
| `oracle/embeddings/embed.py` | hardcoded string `"{00..09,0a..0f,10..14}/"` written into `manifest.json` | annotated with a warning comment |
| root `.gitignore` | one line per shard directory, `/00/`…`/14/` | **fixed** — `/15/` added; see BUG 5 |

Four forms means a future promotion of `15/` into the pinned corpus can update two of three and leave the third lying. **`sam/config.py` carries an active hazard:** `sam/common.py:67` routes an unlisted top-level directory to `f"other:{head}"` instead of erroring, so `15/` paths fed to the SAM stage today are silently classified `other:15` rather than `sharded`. Not a crash — a misclassification.

*Status: documented, not patched. `research/v3/oracle/sam/` is the SAM workstream's owned path per `CONVENTIONS.md`; proposed as loose end A21 rather than edited across an ownership boundary.*

### BUG 5 — a fresh shard arrives untracked *and unignored* *(fixed)*

The root `.gitignore` enumerates the corpus shards one directory per line, `/00/` through `/14/`. That is the **fourth** independent written form of the shard list (see BUG 4), and `15/` was not in it. The `*.jpg` rule below it does not help, because sharded files carry **no extension**.

```
$ git check-ignore -v 15/ab67616d00001e02001501215111d92ab3b09200
NOT IGNORED
$ git status --porcelain | grep '^?? 15/'
?? 15/
```

378 files / 34.6 MB of album artwork were one `git add -A` away from entering history permanently — in a repository whose corpus is deliberately never committed. The drill's own instruction to use an explicit pathspec is the only thing that prevented it here, which is a procedural safeguard, not a technical one.

*Status: **fixed.** `/15/` added to the root `.gitignore` with a provenance comment naming the trap.*

### Non-bug worth recording

**No centroids are stored anywhere.** Answering "where does this file land" required re-clustering all 16,145 pinned vectors. It is exact and it is cheap today (~2.5 s), but it makes cluster placement O(corpus) rather than O(new files), and it means there is no artifact to diff a future clustering against.

---

## 6. What a real evaluation-time import must do differently

1. **Never use `--paths-file` to add files.** Use a new collection. The drill's path — new collection, separate out-dir, own pinned count — is the pattern; it should be the documented one.
2. **Pin the count on arrival.** `EXPECTED_FILE_COUNTS[<fresh>]` was set the day the shard landed, so a later partial re-sync fails loudly. Do this before embedding, not after.
3. **Byte-check before you burn GPU.** sha256 over 7,928 files took under a second and would have caught a re-drop of existing material for free. It found nothing here, which is itself the finding.
4. **Always run the embedding pass anyway.** The single genuine duplicate was byte-distinct. Byte-checking alone would have reported a clean shard and quietly contaminated the evaluation.
5. **Collapse files to artworks before sampling**, and quarantine near-dup hits, *before* the shard is called an evaluation set.
6. **Expect ~0.3 % contamination per fresh shard** and budget a quarantine step. Do not assume fresh means clean.
7. **One shard does not cover 36 clusters.** Plan for several shards, or state the coverage limit in the claim.
8. **Keep the pinned corpus frozen.** Every number in the repo is measured over 7,550 + 8,595. A fresh shard is an *addition*, never a widening, unless the whole downstream stack is regenerated in the same commit.

---

## 7. Reproduction

```bash
# survey
ls 15 | wc -l
file 15/* | sed 's/.*: //' | sort | uniq -c

# byte dedup
find 00 01 02 03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f 10 11 12 13 14 -type f -print0 \
  | xargs -0 -P 8 -n 200 shasum -a 256 > /tmp/corpus.sha256
find 15 -type f -print0 | xargs -0 -P 8 -n 200 shasum -a 256 > /tmp/shard15.sha256
join -j 1 <(sort -k1,1 /tmp/shard15.sha256) <(sort -k1,1 /tmp/corpus.sha256)   # empty

# embed (GPU, ~16 s)
cd research/v3/oracle/embeddings
.venv/bin/python embed.py --arm dinov2-vitl14 --collections sharded_fresh_15 \
  --out-dir ../../data/embeddings-fresh-15 --verify-weights

# dedup + cluster placement (CPU, ~3 s)
.venv/bin/python fresh_shard_probe.py --fresh-dir ../../data/embeddings-fresh-15 \
  --collection sharded_fresh_15 --out ../../data/embeddings-fresh-15/fresh-shard-probe.json

# the pinned corpus must be unmoved by all of the above
.venv/bin/python -c "import common; print(len(common.enumerate_collection('sharded')))"  # 7550
.venv/bin/python selftest.py                                                              # all pass
```

---

## 8. Files changed by this drill

**Edited (minimal, versioned, provenance-commented):**

- `research/v3/oracle/embeddings/config.py` — added `COLLECTION_SHARDED_FRESH_15`, `SHARDED_FRESH_15_DIR_NAMES`, `ALL_COLLECTIONS`, and `EXPECTED_FILE_COUNTS["sharded_fresh_15"] = 378`. **`SHARDED_DIR_NAMES` and both pinned counts are untouched.**
- `research/v3/oracle/embeddings/common.py` — `enumerate_collection` handles the fresh collection through the same code path with its own directory list.
- `research/v3/oracle/embeddings/embed.py` — `--collections` choices widened to `ALL_COLLECTIONS` (default unchanged); manifest loop no longer omits non-pinned collections; warning comment on the hardcoded shard glob.
- `research/v3/.gitignore` — vector/shard exclusions for the new out-dir.
- `.gitignore` (repo root) — `/15/` added, so the fresh shard is ignored like every other corpus shard.

**Added:**

- `research/v3/oracle/embeddings/fresh_shard_probe.py` — the dedup + placement probe.
- `research/v3/data/embeddings-fresh-15/` — ids index, manifest, probe report.
- this document.

**Deliberately not touched:** `SHARDED_DIR_NAMES`, `EXPECTED_FILE_COUNTS[sharded]`, `EXPECTED_SHARDED_FILES` in `corpus.ts`, `near-dup-census.json` and its three sha pins, `coverage-set-1.json`, `holdout.json`, `data/embeddings/manifest.json`, `oracle/sam/`.

---

## 9. Ledger updates proposed (not applied)

Proposed only — `PHASE_0_LOOSE_ENDS.md` is the housekeeping workstream's owned path, and the counts header must be re-derived by heading count at apply time.

### A11 — **amend, do not close**

The mechanism has now been exercised, which is what A11 asked for. But A11's own wording is "the mechanism has never been exercised", and exercising it revealed it does not work end-to-end without the changes in §8 and the unfixed items in §5. Recommended: keep A11 **open**, add an amendment bullet in the established style:

> - **AMENDED 2026-08-04 — the mechanism has now been REHEARSED, and it did not work first try.** Shard `15/` (378 files) was imported end-to-end on 2026-08-04: 0 exact duplicates, 1 near-duplicate at 0.9994 against the pinned pool, placement across 32 of 36 clusters with no new region of space. See `src/coverage-set/FRESH_SHARD_DRILL.md`. Four defects surfaced, one of them a silent success (`--paths-file` embeds nothing and exits 0). Three are fixed; the remainder are **A20** and **A21**. A11 stays open because the rehearsal proved the import is a *procedure*, not a command — it is closed when a fresh shard can be imported by following a written runbook without editing pinned constants.

Rationale for not closing: A11's blast radius is "final claims only", and the thing that would silently break a final claim — an operator running `--paths-file` and getting a confident empty result — is still live.

### A20 — **new** (sharp)

> ### A20. `--paths-file` cannot add files, and says nothing when it adds none
> - **What.** `embed.py --paths-file` filters the collection enumeration rather than extending it, and the enumeration only walks `SHARDED_DIR_NAMES`. Feeding 378 valid `15/` paths to the `sharded` collection queues 0 files, writes a `(0, 1024)` `.npy` and an empty `.ids.jsonl`, reports `"remaining": 0`, and exits 0 (verified 2026-08-04, fresh-shard drill §5). The flag's help text — "for smoke tests and targeted re-runs" — points an operator straight at it. Separately, the correct alternative (widening `SHARDED_DIR_NAMES`) raises `CorpusSizeMismatch`, which `query.collection_provenance` catches and converts into `complete = False`, so the cause is not named where the failure appears.
> - **Consequence.** At claim time, the fresh-shard import can appear to succeed while importing nothing. Every downstream count would then be computed over an empty fresh set and read as authoritative.
> - **Owner.** embeddings. **Revives when:** the next fresh shard is imported — or immediately, since the fix is a guard, not a redesign: refuse to run when `--paths-file` matches zero enumerated paths, and name `SHARDED_DIR_NAMES` in the `CorpusSizeMismatch` message.
> - **Blast radius.** Any fresh-shard import; silently, which is the problem.

### A21 — **new** (sharp)

> ### A21. The shard list has four independent written forms, and SAM's silently misroutes an unlisted shard
> - **What.** `SHARDED_DIR_NAMES` exists as an explicit tuple in `oracle/embeddings/config.py`, as `tuple(f"{i:02x}" for i in range(0x15))` in `oracle/sam/config.py`, and as the hardcoded string `"{00..09,0a..0f,10..14}/"` written into `manifest.json` by `embed.py`, and as one line per directory in the root `.gitignore` (which is how shard `15/` arrived unignored — fixed 2026-08-04). `sam/common.py:67` routes a top-level directory not in its list to `f"other:{head}"` rather than raising, so `15/` paths handed to the SAM stage today are classified `other:15`, not `sharded` (found 2026-08-04, fresh-shard drill §5 BUG 4).
> - **Consequence.** Promoting a fresh shard into the pinned corpus can update two of three forms and leave the third stale; and the SAM stage will process a fresh shard under a collection label nothing else recognises, producing rows that silently fall out of every `sharded` aggregate.
> - **Owner.** oracle — SAM (for the routing) plus embeddings (for the third form). **Revives when:** `15/` or any later shard is promoted into `SHARDED_DIR_NAMES`, or the SAM stage is next run over the sharded collection.
> - **Blast radius.** SAM aggregates over the sharded collection; any multi-form shard-list update.

### A19 — **new** (standing, low urgency)

> ### A19. The pinned corpus contains byte-identical files under different artwork ids
> - **What.** sha256 over all 7,550 pinned sharded files (2026-08-04) finds 3 groups of byte-identical files spanning shards: one group of 7, one of 4, one of 2. Identity in this repo is path + content hash (`CONVENTIONS.md`:60), so these are counted as distinct artworks everywhere.
> - **Consequence.** The pool size 16,145, the coverage-set universe and every per-cluster count include a handful of exact repeats. The effect is small (≤13 files) and does not move any reported figure materially, but "distinct artworks" is not quite what the counts mean.
> - **Owner.** embeddings. **Revives when:** a claim is made about corpus size or artwork diversity, or the census is next regenerated.
> - **Blast radius.** Cosmetic today; matters only if a count is quoted as a count of distinct pictures.

### Constants version bump — **applied, scoped**

No pinned constant was widened. What changed is additive: a new collection with its own pinned count of 378, and a manifest loop that no longer drops non-pinned collections. If and when `15/` is promoted into the pinned corpus, the full list of what must move together is §8's "deliberately not touched" list plus `sam/config.py` — that promotion is a single atomic commit that regenerates every downstream artifact, and it is explicitly **not** what this drill did.

### Counts header

Adding A19, A20, A21 moves the A-section from A1–A18 to A1–A21 and the open count by +3, with A11 remaining open. Re-derive by counting headings at apply time, per the ledger's own rule.
