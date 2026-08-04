# P3 — measurement baseline

`candidateId` **p3-fields-0.1.0**, measured 2026-08-04 by W4. Nothing in this file gates anything; it
records what the two standing instruments say about the candidate as it exists today, and the exact
commands that produced the numbers so they can be re-derived.

Two readings, in the order they matter for this mechanism:

1. **Robustness** — `src/robustness/check.ts`, the full 200 rendition pairs + 400 perturbation trials.
   This is P3's core question: the mechanism publishes the pixel holding a designated *rank*, so the
   thing to find out is whether the rank survives re-encode noise.
2. **Adjudication** — `src/adjudication/cli.ts`, a dev aid that gates nothing.

---

## Candidate git state

| | |
|---|---|
| worktree | `/Users/Flo/GitHub/palette/.worktrees/p3-fields` |
| branch | `proto/p3-fields` |
| HEAD | `f3376ffd6704609b63233e33760ed7193c1d6a11` — *p3-fields: the discipline line — arm-d's, stated and held* |
| `git status --short` count | **15 at the start of measurement** (14 staged `falsifier/` files + untracked `src/`), rising to 18 mid-run as other workers added `OWED_COMMITS.md` and `audit/`. Other workers share this worktree and committed while the run was in flight; by the time this file was written the count was 1 (this `measurements/` directory) and HEAD had advanced to `0f1a65a` (*owed-commit ledger*), which is where the measured `src/` now lives, committed. The measured `src/` bytes did not change — the dev-loop `codeVersion` below is identical before and after. |
| **working tree dirty** | **yes** — the measured `src/` is uncommitted. Every number below is against working-tree code, not against a commit. |
| candidate `codeVersion` | `aeb70ab0d4b7fcfe11f3ac2275cf7480d50b90a1cfbe36812d80a503db5f3150` (dev-loop content hash of the candidate's module graph; identical to the demo-20 run's, so the code did not move between W1's run and these) |
| node | v25.8.1 · sharp 0.33.5 / sharp-modern 0.35.3 · apca-w3 0.1.9 · colorjs.io 0.5.2 |

`check.ts` writes no git fingerprint of its own — the report's `candidate` block carries only
`{name, version, module}`. The dirty flag above is recorded by hand for that reason.

## Environment workarounds

The corpus image shards are not present in this worktree (they are gitignored data in the main
checkout). Three sets of **symlinks** were created; all are read-only pointers into
`/Users/Flo/GitHub/palette`, and none is visible to `git status` (`*.jpg` and the shard dirs are
gitignored):

| created | count | why |
|---|---|---|
| `<worktree>/{00..15}` → `/Users/Flo/GitHub/palette/{00..15}` | 22 | `check.ts` resolves set-file paths against `REPO_ROOT`, which is the worktree; there is no `--repo-root` CLI flag |
| `<worktree>/music-artworks` → main checkout | 1 | 313 of the pair set's endpoints and part of the cover sample live there |
| `<worktree>/images/*` → main checkout `images/*` | 37 | 60 of the 554 v2-3 evidence entries (49 of them endorsements) point at `images/*.jpg`; without these the adjudication run lost 26 of 197 artworks to ENOENT |

Instrument side effects, all inside `research/v3/data/**` and expected: 400 perturbed images
materialised under `data/robustness/cache/`, dev-loop cache entries under `data/devloop-cache/`.

---

## 1. Robustness — the headline

```sh
cd /Users/Flo/GitHub/palette/.worktrees/p3-fields/research/v3

NODE_NO_WARNINGS=1 node --experimental-strip-types src/robustness/build-perturbation-set.ts --materialize
# materialised 100 covers x 4 arms — generated 400, reused 0

NODE_NO_WARNINGS=1 node --experimental-strip-types src/robustness/check.ts \
  --candidate prototypes/p3-fields/src/candidate.ts \
  --concurrency 8 \
  --out prototypes/p3-fields/measurements/robustness-p3-fields-0.1.0.json \
  --emit-diff-set prototypes/p3-fields/measurements/robustness-disagreeing-images.txt
```

Full run, **no `--limit`**: 600 trials, 1651.8 s wall (27.5 min), 10 755 s of candidate CPU across
~1 000 distinct palette computations, **0 errored trials**. Bar mode `regional`, all four roles.
Reviewedness labels live from the warehouse (113 reviewed artworks, 0 relabelled since the draw).

Report: `research/v3/prototypes/p3-fields/measurements/robustness-p3-fields-0.1.0.json`

### Agreement

| group | agreement | 95% Wilson | n |
|---|---|---|---|
| **overall** | **18.2%** | 15.3–21.5 | 109/600 |
| rendition pairs | **14.5%** | 10.3–20.0 | 29/200 |
| `jpeg-q92` | **28.0%** | 20.1–37.5 | 28/100 |
| `jpeg-q85` | **17.0%** | 10.9–25.5 | 17/100 |
| `jpeg-q75` | **17.0%** | 10.9–25.5 | 17/100 |
| `dither-lsb1` | **18.0%** | 11.7–26.7 | 18/100 |

Reference points from the harness README: v2-3 scored **72.8%** on the identical `jpeg-q92` setting,
and **0 of 114** palettes survived the dither. P3 is far below v2-3 on re-encode and far above it on
the dither — but 18.0% is not survival either.

The `jpeg-q92 → q85 → q75` gradient is 28.0 → 17.0 → 17.0: it falls off a cliff between q92 and q85
and is then flat, which is not the smooth decay a stable rank statistic would show.

### Reviewed vs unseen (overfit ratio)

| basis | ratio | reviewed | unseen |
|---|---|---|---|
| **perturbation** (the reportable one, 50/50 by construction) | **1.286×** | 22.5% [17.3–28.8] (45/200) | 17.5% [12.9–23.4] (35/200) |
| rendition-pair | 0.679× **UNDERPOWERED** | 10.0% [1.8–40.4] (1/10) | 14.7% [10.4–20.5] (28/190) |

Healthy is ≈ 1.0; v2-3 measured 1.61×. The intervals overlap heavily, so 1.286× is not evidence of
overfitting on its own — but the direction is the same as v2-3's, and it is the number to watch when
the constants get calibrated, since none of them has been anchored yet.

### Role instability (share of the 600 comparisons where the role moved)

| role | instability |
|---|---|
| accent | **63.5%** (381/600) |
| foreground | 54.8% (329/600) |
| surface | 51.0% (306/600) |
| background | 31.2% (187/600) |

### The 10 worst disagreements

491 trials disagreed. Ranked by the raw OKLab movement of the worst-moving role
(`worst-disagreements.mjs`; the harness's own `worstRoleBarRatio` in brackets):

| OKLab | ×bar | trial | roles that moved | worst role | movement | artwork |
|---|---|---|---|---|---|---|
| 1.000 | 61.5 | `dither-lsb1` | bg+surf+accent | accent | `#ffffff` → `#000000` | `00/…9a5acf9fb19544298ce4.jpg` 300² |
| 0.994 | 61.1 | `jpeg-q92` | all four | foreground | `#000000` → `#fefdfb` | `10/…0010c158d73707fcc525c6fa` 640² |
| 0.992 | 61.0 | `jpeg-q75` | all four | foreground | `#000000` → `#fcfdf8` | same artwork as above |
| 0.986 | 60.6 | `dither-lsb1` | all four | background | `#000000` → `#fefbe9` | `06/…000606d3a5c7da73c3887268` 640² |
| 0.985 | 60.5 | `jpeg-q92` | fg+accent | foreground | `#fafafa` → `#000000` | `10/…00106c3252a4c133c0abde36` 300², **reviewed** |
| 0.985 | 60.5 | `dither-lsb1` | bg+surf+accent | background | `#000000` → `#fafaf9` | same artwork as above, **reviewed** |
| 0.979 | 60.2 | `dither-lsb1` | all four | background | `#000000` → `#f8f8f9` | `08/…00088460068752fad04f8541` 640², **reviewed** |
| 0.955 | 58.7 | rendition pair | surf+fg+accent | surface | `#f0f0f0` → `#000000` | `0008733d…` ~ `00108ff2…` |
| 0.928 | 57.0 | rendition pair | all four | surface | `#e7e7e7` → `#000000` | `music-artworks/…8b57f9a7…` ~ `…cbf7cc0c…` |
| 0.916 | 56.3 | rendition pair | all four | background | `#fcfdff` → `#030009` | `music-artworks/…0ac57b3c…` ~ `…61e9b628…` |

### The dominant failure pattern

**Polarity inversion on near-neutral, high-contrast artwork.** Every one of the ten worst
disagreements is a role jumping between the two ends of the lightness axis — black to white or white
to black — not a drift to a neighbouring colour.

- 94 of 491 disagreements (19%) have a role moving **> 0.5 OKLab**; 84 have a role crossing **> 0.6
  luma**, i.e. a light↔dark swap.
- Of the 155 individual role-moves over 0.5 OKLab, **68 have near-neutral colours on both sides**
  (RGB channel spread ≤ 32) — the flip is between greys, so it is not a hue change, it is a choice
  of which extreme to publish.
- The artworks confirm it: the top-ranked one (`00/…298ce4.jpg`) is literally greyscale and
  high-contrast (channel means 55/55/55, stdev 99/99/99).
- The role that moves is most often **foreground** (worst role in 179 of 491) or **accent** (168),
  then surface (102), background (42) — but the *joint* pattern dominates: 114 disagreements moved
  **all four roles at once**, and another 74 moved three. A whole-palette flip, not one bad role.
- The rest is small: median worst-role movement across all 491 is 0.150 OKLab, p10 0.027, and 61
  disagreements sit under 2× the bar (marginal misses).

Read plainly: on artwork with a bimodal, low-chroma lightness histogram, the pixel holding the
designated rank is a coin-flip between the dark mode and the light mode, and a ±1 LSB dither is
enough to flip the coin. That is the mechanism's tie-break behaviour, not a decode artefact — the
dither arm is lossless PNG on both sides.

---

## 2. Adjudication — dev aid, gates nothing

The demo-20 dev-loop run overlaps the evidence corpus in **1 of 20** artworks, which is no signal, so
the candidate was run over **all 197 artworks that carry v2-3 reviewer evidence** — the union of
`endorsements.json` (351 entries), `known-bad.json` (37) and `acceptable.json` (166), joined by
`artwork.imagePath`, 554 entries over 197 distinct files.

```sh
cd /Users/Flo/GitHub/palette/.worktrees/p3-fields/research/v3

# the set: every artwork with standing v2-3 evidence
#   prototypes/p3-fields/measurements/adjudicated-197.txt   (197 repo-relative paths)

NODE_NO_WARNINGS=1 node --experimental-strip-types src/devloop/run.ts \
  --candidate prototypes/p3-fields/src/candidate.ts \
  --set prototypes/p3-fields/measurements/adjudicated-197.txt \
  --workers 5 \
  --out prototypes/p3-fields/measurements/run-adjudicated-197.jsonl
# 197 ok · 0 failed

# devloop run -> adjudication input: wrap each ok row's `palette`, which is already the
# contract shape the tool reads (contractVersion, roles, metadata.inputContentHash, sourceRendition)
node prototypes/p3-fields/measurements/to-adjudication.mjs \
  prototypes/p3-fields/measurements/run-adjudicated-197.jsonl \
  prototypes/p3-fields/measurements/adjudication-input-197.jsonl

NODE_NO_WARNINGS=1 node --experimental-strip-types src/adjudication/cli.ts \
  run prototypes/p3-fields/measurements/adjudication-input-197.jsonl
NODE_NO_WARNINGS=1 node --experimental-strip-types src/adjudication/cli.ts \
  run prototypes/p3-fields/measurements/adjudication-input-197.jsonl \
  --format json --out prototypes/p3-fields/measurements/adjudication-197.json
```

197 palettes parsed, 197 carried the full contract, **0 lines refused**. Bar `regional`, all four
roles, era v2-3 (the v3 warehouse holds 0 real entries).

| | count |
|---|---|
| **W** — endorsement matches | **3** candidates · 4 distinct entries · 3 artworks (3 on all four roles, 1 on a partial entry's present roles only) |
| **L** — known-bad matches | **0** |
| baseline — `acceptable` matches | 0 (not-rejected tier, not an endorsement) |
| **NS** — differed | **194** · never seen in this era: 0 |
| **conflicts** | **0** touched by this run |
| reachability | not assessed (419 entry comparisons) — the run carries no `availableColors` |

The three wins: `09/ab67616d00001e020009657a5122a7b3d40458b0` (two endorsements at once, all-four-roles
basis), `images/placebo.jpg` (present-roles-only basis), `images/slipknot.jpg` (all-four-roles).

Per principle 1, the 194 "differed" cost nothing and are not a miss rate. The only thing this table
licenses is: **no loss signal, three wins, no contradiction in the evidence disturbed.**

---

## Instrument notes (reported, not patched)

1. **`check.ts` writes no `.disagreements.txt`.** The disagreement detail lives in the report JSON's
   `disagreements` array (491 records here, each with per-role hex, OKLab distance, bar and
   `worstRoleBarRatio`). The only text artefact is `--emit-diff-set`, which is a flat image list.
   The ranking table above was derived with `worst-disagreements.mjs`, kept next to this file.
2. **`--emit-diff-set` mixes cache artefacts into the set file.** It emits
   `path.relative(REPO_ROOT, trial.leftPath)` for every disagreeing trial, so for the perturbation
   half the "images" are `research/v3/data/robustness/cache/<arm>/<hash>.<arm>.{baseline,perturbed}.{png,jpg}`.
   The emitted 802-line file is therefore not usable as a dev-loop set of original artworks;
   resolving a perturbation trial back to its cover needs `perturbation-set-1.json` and the trial's
   `artworkId`.
3. **`check(...)` accepts `repoRoot` but `main()` exposes no `--repo-root` flag**, so a worktree
   without the corpus shards can only be measured by symlinking. Adding the flag would remove the
   need for the 23 root symlinks recorded above.
4. **Throughput.** The candidate averaged ~10.8 s per palette across the robustness sample, against
   ~1.4 s/image on the 300 px dev-loop set — the cover sample is largely 640 px and the cost is
   strongly superlinear in pixel count. Budget robustness runs at ~30 min, not the README's 20 s.

## Files

| file | what |
|---|---|
| `robustness-p3-fields-0.1.0.json` | the full report — every trial-level disagreement |
| `robustness-console.txt` | the harness's own formatted summary |
| `robustness-disagreeing-images.txt` | `--emit-diff-set` output, 802 paths (see note 2) |
| `worst-disagreements.mjs` | ranks the report's disagreements; produced the tables above |
| `adjudicated-197.txt` | the set: every artwork carrying standing v2-3 evidence |
| `run-adjudicated-197.jsonl` | the dev-loop run over that set |
| `to-adjudication.mjs` | dev-loop run → adjudication input |
| `adjudication-input-197.jsonl` | 197 lines, the tool's input format |
| `adjudication-197.txt` / `.json` | the adjudication report, text and machine-readable |
