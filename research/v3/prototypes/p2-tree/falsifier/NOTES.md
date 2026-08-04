# P2 reachability falsifier — the data plumbing, measured

**Worker C, 2026-08-04.** `SPEC.md` falsifier 1 in one sentence: *if >25 % of endorsed legacy role
colours are unreachable (within the same-colour bar) from a pipeline's retained-node representative
set, while remaining reachable from a control set of all exact triples clearing the same area floor,
the paradigm is wrong rather than under-tuned.*

The falsifier is only as good as the join behind it. Everything below was **measured**, not assumed;
every count is reproducible with the commands in §6.

---

## 1. The endorsement corpus

`research/v3/data/legacy/endorsements.json` — read through `src/adjudication/evidence.ts`
`loadEvidence({ eras: ["v2-3"] })`, never parsed by hand.

| fact | count |
|---|---|
| entries in the file | **351** |
| distinct artworks (`artwork.contentSha256`) | **173** |
| distinct `artwork.imagePath` | **173** (1:1 with the hash — no two paths share a hash, no hash two paths) |
| role slots actually carried | **1,397** |
| entries carrying all four roles | 348 |
| entries carrying three roles | 1 |
| entries carrying one role (`accent`) | 2 |
| `kind: grade-strong` / `correction-endorsed-sample` | 259 / 92 |
| `completeness` full / roles-only / partial | 255 / 93 / 3 |

**1,397 reproduces `phase-1/proposals/arm-b-prime.md` §7's pre-registered denominator exactly**, which
is the strongest available check that this harness counts what the pre-registration counted.
`351 × 4 = 1,404`; the seven-slot difference is the three partial entries, and
`data/legacy/README.md` A6 forbids treating a missing role as a constraint — so the harness scores
`presentRoles(entry)` and never four-by-default.

**Note the shape of the denominator:** 351 entries over 173 artworks; the busiest artwork carries **7
endorsement entries**, i.e. up to 28 colour slots from one image. Wilson's denominator treats those as independent facts, so every falsifier
rate is also reported with an **artwork-clustered bootstrap** (`src/stats/bootstrap.ts`,
`clusterBootstrapCI`, resampling whole artworks). Where the two disagree, the clustered one is the
honest width.

## 2. How an artwork is identified — and the join

`PHASE_0_DECISIONS.md` §1: the palette attaches to the **file**. Every legacy entry is keyed by
`artwork.contentSha256`, and `src/adjudication/evidence.ts` indexes the corpus by that hash
(`byArtwork`).

**Verified 2026-08-04:** `contentSha256` is plain sha-256 of the file's bytes for **173 of 173**
endorsed artworks — zero mismatches. So the harness's join is:

```
dump line `imagePath`  →  resolve against corpus roots  →  sha256(file bytes)  →  byArtwork
```

Filenames are never the key. `imagePath` is only a way to *find* the bytes; if a pipeline dumps a
path that resolves to different bytes, the hash join simply finds no endorsement and the line is
reported as `unendorsed-artwork` rather than mis-attributed.

## 3. Images on disk — the worktree trap

`imagePath` values are repo-relative shard paths (`01/ab67616d…jpg`). The shards `00/`…`15/` are
**gitignored** (`/Users/Flo/GitHub/palette/.gitignore` lines 2–28), so a linked git worktree contains
none of them:

| root | endorsed artworks resolving |
|---|---|
| `.worktrees/p2-tree/` (this worktree) | **0 / 173** |
| `/Users/Flo/GitHub/palette/` (main checkout) | **173 / 173** |

`corpus.ts` therefore resolves an image against an ordered root list — `--corpus-root` if given, then
this worktree, then the **main checkout, derived by reading the worktree's `.git` pointer file** (no
subprocess). Which root answered is recorded per image as a *label* (`worktree` / `main-checkout` /
`explicit` / `absolute`), not as a machine path, so the report stays comparable across machines; the
absolute roots appear once in a block flagged `machineDependentPaths: true`.

**Consequence for the sibling workers:** a dump written from inside this worktree can name
`01/….jpg` and the falsifier will still find the file. Nobody needs to copy the corpus.

Decode check over all 173: **0 unresolved, 0 refused** — no endorsed artwork carries a transparent
pixel, so invariant 5's refusal never fires on this corpus.

## 4. The control set, and the risk it carries

Control = every **exact triple** whose pixel count ≥ `areaFloor × totalPixels`, at native resolution,
no resampling, no quantisation. The floor comes from the dump (`areaFloor`, `constants.areaFloor` or
`constants.AREA_FLOOR`), else `--area-floor`, else `DEFAULT_AREA_FLOOR = 0.002` **[UNCALIBRATED]** —
and every image row carries `areaFloorSource` so a reader can see which happened before reading a
verdict.

No numeric area floor is pre-registered anywhere in `research/v3`. `arm-b.md` §4.2 defines the
structural floor as a quantity *to be measured* and leaves it unmeasured; the 0.002 default is
borrowed from the 0.2 % floor in `oracle/sam/RESIDUAL_EXPERIMENT_NOTES.md` and has no other warrant.

### The measured ceiling — read this before reading any verdict

The pre-registered rate is bounded above by the **control-reachable** rate: a colour the control
cannot reach can never enter the numerator. Measured on the real corpus (all 173 artworks, all 1,397
slots, regional bar):

| area floor | endorsed colours reachable from control | mean control-set size | images with an **empty** control |
|---|---|---|---|
| 0.02 | **235 / 1,397 = 16.8 %** | 1 | 88 |
| 0.01 | 279 / 1,397 = 20.0 % | 3 | 65 |
| 0.005 | 370 / 1,397 = 26.5 % | 8 | 43 |
| **0.002** (default) | **508 / 1,397 = 36.4 %** | 26 | 21 |
| 0.001 | 597 / 1,397 = 42.7 % | 63 | 8 |
| 0.0002 | 892 / 1,397 = 63.9 % | 453 | 1 |

**At a floor of 0.01 or coarser the 25 % line is arithmetically unfireable** — the ceiling is below
it, so "NOT FALSIFIED" would be a fact about the floor and not about P2. At the 0.002 default the
falsifier has an 11.4-point window between the line and the ceiling. Whatever floor the α-tree and
tree-of-shapes pipelines declare, **the ceiling must be quoted beside the verdict**, which is why
`renderText` prints a `CEILING:` line and the report carries a supplementary
`falsifierAmongControlReachable` rate (explicitly *not* the pre-registered one, and not substitutable
for it).

Second-order fact from the same table: at 0.002, **63.6 % of endorsed colours are not within one bar
of any exact triple covering 0.2 % of the image**. Those colours are unreachable from *both* sides
and are correctly not charged to the paradigm — but they also sit in the denominator, damping every
rate. `unreachableFromBoth` is reported so the damping is visible.

## 5. What the harness refuses to do quietly

- Empty node set → **not** `not-assessed`. `src/adjudication/match.ts` answers `not-assessed` for an
  empty `availableColors`, which is right for adjudication (no claim made) and wrong here (a pipeline
  that retained nothing has failed, not abstained). Those rows are expanded to `within: false`,
  `emptySet: true`, and counted as unreachable.
- Image named by a dump but absent from disk → `image-not-found` row, never a smaller denominator.
- Dump line for an artwork with no endorsement → `unendorsed-artwork`, reported and excluded.
- Same (pipeline, artwork) twice → deduplicated, count printed. Counting one artwork twice inflates
  every rate after it.
- A transparent pixel → decode refused loudly (invariant 5), reported as `decode-refused`.
- A malformed dump line or a node without a `repr` → parse error with line number. A dropped node is
  a colour that quietly became unreachable.

The bar is never re-implemented: `assessReachability(entry, colors, { barMode: "regional", … })` from
`src/adjudication/match.ts` is called once per side, which routes through the instrument's own
`barFor` → frozen `sameColorBar`. There is no second radius in this directory.

## 6. Running it

```sh
# the falsifier proper, once alpha/out/ or tos/out/ exist
NODE_NO_WARNINGS=1 node --experimental-strip-types \
  research/v3/prototypes/p2-tree/falsifier/run.ts \
  --dumps 'research/v3/prototypes/p2-tree/*/out/*.jsonl' \
  --out research/v3/prototypes/p2-tree/falsifier/out/report.json

# tests: synthetic image + hand-built dump + fabricated endorsement fixture
NODE_NO_WARNINGS=1 node --experimental-strip-types --test \
  research/v3/prototypes/p2-tree/falsifier/tests/falsifier.test.ts

# instrument bounds over the real 173-artwork join (SYNTHETIC pipelines — not a P2 result)
NODE_NO_WARNINGS=1 node --experimental-strip-types \
  research/v3/prototypes/p2-tree/falsifier/smoke-dump.ts \
  --out research/v3/prototypes/p2-tree/falsifier/out/smoke-nodes.jsonl --area-floor 0.002
NODE_NO_WARNINGS=1 node --experimental-strip-types \
  research/v3/prototypes/p2-tree/falsifier/run.ts \
  --dumps research/v3/prototypes/p2-tree/falsifier/out/smoke-nodes.jsonl --area-floor 0.002 \
  --out research/v3/prototypes/p2-tree/falsifier/out/smoke-report.json
```

Flags: `--dumps <glob|file…>` · `--out <report.json>` · `--limit n` · `--corpus-root <dir>` ·
`--legacy-dir <dir>` · `--area-floor <fraction>` · `--quiet`.

## 7. Verification status, 2026-08-04

**No real pipeline has been measured.** `alpha/out/` and `tos/out/` do not exist yet. Two things
were run instead:

1. **The synthetic fixture test** — 11 assertions, all passing, on two generated images whose
   reachability is known by construction. The load-bearing one: a case sitting at *exactly* 25.0 %
   must read `NOT FALSIFIED`, because the pre-registration says `>25 %` and a `>=` would flip a
   pre-registered verdict.
2. **Instrument bounds over the real corpus**, with two fabricated pipelines (`smoke-dump.ts`) whose
   answers are known in advance. At floor 0.002, coverage **1,397/1,397 slots and 173/173 artworks**:

   | synthetic pipeline | retained nodes | falsifier rate | expected |
   |---|---|---|---|
   | `smoke-oracle` | the control set itself | **0 / 1,397 = 0.0 %** | exactly 0 — tautology |
   | `smoke-null` | one mid-grey node | **508 / 1,397 = 36.4 %** (clustered 95 % CI 31.8–41.1 %) | equals the control-reachable count |

   Both land exactly on their construction, which is the evidence that the harness measures what it
   says. **Neither is a statement about hierarchical region decomposition.**

## 8. Open risks

1. **The floor decides the verdict.** §4's table: the ceiling moves from 16.8 % to 63.9 % across a
   100× range of floors, and the pre-registered line sits inside that range. A pipeline that declares
   a coarse floor cannot be falsified; one that declares a fine floor is judged against a much looser
   control. The pre-registration fixed the *line* and not the *floor*, and this is where that shows.
2. **`DEFAULT_AREA_FLOOR` is a guess.** It is only used when a dump declares nothing, and every row
   it touches says so — but a run that falls back to it is not comparing like with like.
3. **21 images have an empty control set at 0.002** (88 at 0.02). Their colour slots can never enter
   the numerator while staying in the denominator, which depresses the rate. Reported as
   `emptyControlSets` and `unreachableFromBoth`; not adjusted for, because adjusting would be
   reinterpreting the pre-registered denominator after seeing data.
4. **Clustering.** 1,397 slots come from 173 artworks. Wilson is reported because the pre-registration
   speaks of colours, and the clustered bootstrap beside it is the honest width.
5. **Dump field names are guessed.** No dump existed when this was written, so the area floor is read
   from three spellings (`areaFloor`, `constants.areaFloor`, `constants.AREA_FLOOR`). If workers A and
   B use a fourth, the run silently falls back to the `[UNCALIBRATED]` default — visibly, via
   `areaFloorSource`, but it is the most likely integration break.
6. **Era.** Only `v2-3` legacy endorsements are loaded; the v3 warehouse holds no non-demo verdicts
   yet. When it does, `--legacy-dir` is not the way in — `loadEvidence` will need `eras: ["v2-3","v3"]`
   and this harness will need a decision about whether to pool the two eras (principle 3 says not to).
