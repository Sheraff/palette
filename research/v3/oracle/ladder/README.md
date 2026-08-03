# Resolution ladder — setup

**Status:** built, manifest frozen, machinery self-tested, **smoked on 2 artworks**. The real
run launches only on reviewer go-ahead (PHASE_0_DECISIONS.md §5: "the orchestrator asks
before starting or resuming any long run").

**What it measures.** ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md §7.4.3. Not "do 300 and 640
agree?" but **"at what resolution does each question become unanswerable?"**, as a curve.
Run the oracle over every rendition of every multi-rendition artwork in `music-artworks/`,
then per question compute agreement against that artwork's largest rendition as a function
of size. Then check (§7.3) whether the curve predicts the 300-vs-640 agreement actually
observed on the 644 cross-tier pairs of the sharded corpus. If it does, the curve is
trustworthy corpus-wide; if it does not, fall back to the in-distribution two-point number.

**Resolution policy: NATIVE.** Pipeline §7.5, the row that says so in as many words —
resolution *is* the independent variable here, so nothing is capped and nothing is
normalized. `--long-edge N` exists for memory emergencies only, and if used it is stamped
into every row and into the resume key so a capped row can never be read as a native one.

---

## Layout

| path | what |
|---|---|
| `build-manifest.ts` | enumerates the item sets, measures every header, hashes every file |
| `scope-cost.ts` | prices the three scopes off measured throughput; prints the decision table |
| `common_ladder.py` | items, scopes, the canary rule, the ladder provenance row |
| `run_ladder.py` | the worker, `--scope {full\|sample\|pairs}` |
| `supervise.sh` | the restarting supervisor (§5.1) |
| `analyze.py` | the curve, the per-question resolution floor, the transfer check |
| `selftest.py` | 60 model-free assertions over all of the above |

Outputs go to `research/v3/data/oracle-ladder/`. Nothing else in the repo is written.

**Everything model-shaped is the premise runner's, imported and never copied**: the model
pin, the grammar, the JSONL sink, the attempt ledger, the retry policy, `normalize_image`,
and the prompt loader all come from `../premise/common.py`. This workstream installs
nothing and never writes inside `premise/`. The interpreter is `../premise/.venv/bin/python`.

**Prompt: group-A variant B, one variant.** Variant B measured better than A on the premise
run (Cohen's κ 0.311 vs 0.210 strict, 0.484 vs 0.446 on mapped labels). The ladder asks a
*within-artwork* question — the same prompt at different sizes — so the second variant's
disagreement signal buys nothing here and would double the bill.

---

## The item manifest

`data/oracle-ladder/manifest.json`, rebuilt with:

```bash
NODE_NO_WARNINGS=1 node --experimental-strip-types research/v3/oracle/ladder/build-manifest.ts
NODE_NO_WARNINGS=1 node --experimental-strip-types research/v3/oracle/ladder/build-manifest.ts --verify
```

Idempotent — `--verify` re-derives everything and fails if the committed file disagrees.
Dimensions come from headers via `sharp`, never from the `_WxH` filename suffix (§7.4.1
trap 1), and every measurement is cross-checked against the holdout freeze's independent
header survey (8,595 files comparable, **0 disagreements**).

### How the ladder set narrows

| step | artworks | files |
|---|---|---|
| `music-artworks/` as found | 4,088 | 8,595 |
| − non-square best rendition (banners, heroes, site furniture) | 3,097 | |
| − thumbnail-only (best ≤ 150 px) | 3,081 | |
| − any file with genuinely transparent pixels | **2,757** album-artwork candidates | |
| − the frozen holdout (413) and its 12-artwork quarantine list | **2,344** working set | |
| − single-rendition artworks | **1,125 ladder-eligible** | **4,861** |
| deduplicated to distinct measured sizes | 1,125 | **4,306 rungs** |

The candidate filters are the holdout freeze's own rules, re-derived in this script and
asserted against its published counts, so "the non-holdout remainder" means the same thing
in both places.

**1,348 artworks in the whole collection carry ≥2 renditions** (§7.4.3's number). Of those,
1,156 are non-holdout, and **1,125** also pass the album-artwork filters — the 31 dropped
are 23 non-square (banners and hero images that happen to have several renditions), 5
thumbnail-only, and 3 on the holdout's quarantine list. Running them would measure
resolution sensitivity on the wrong kind of picture. No multi-rendition artwork was lost to
the transparency filter.

27 of the 1,125 have several renditions but only one distinct measured *size* — the CDN
re-encoded at the same dimensions. They carry no rung, so they are excluded from the
sample; with `--include-duplicate-sizes` they become the codec noise floor instead.

### The transfer-check set

All **644 cross-tier pairs / 1,288 files** of the sharded corpus, flagged separately in
`manifest.pairs`. The sharded corpus has no holdout (PHASE_0_DECISIONS.md §5), so there is
nothing to subtract.

One correction to §7.1 while measuring them: the 16-character rendition prefix does **not**
predict size perfectly. **21 of the 644 "640 px" files are actually 600×600, and one is
567×567** — the off-size files §7 counted, now located. Everything downstream uses the
measured long edge; the prefix is recorded as `declaredTierPx` and never trusted.

---

## Cost — the decision table

```bash
NODE_NO_WARNINGS=1 node --experimental-strip-types research/v3/oracle/ladder/scope-cost.ts
```

| scope | artworks | images | inferences | image tokens | hours (quiet machine) | hours (busy machine) |
|---|---|---|---|---|---|---|
| **full** | 1,125 | 4,306 | 4,350 | 1,227,633 | **3.4** | **10.2** |
| **sample** | 400 | 1,625 | 1,642 | 513,288 | **1.4** | **4.2** |
| **pairs** | 644 | 1,288 | 1,301 | 417,338 | **1.0** | **3.0** |
| sample + pairs | 1,044 | 2,913 | 2,943 | 930,626 | 2.4 | 7.1 |
| full `--include-duplicate-sizes` | 1,125 | 4,861 | 4,910 | 1,512,987 | 3.9 | 11.8 |

Timing is interpolated from six measured anchors (147 / 300 / 500 / 640 / 1,079 / 3,000 px)
rather than fitted, because a straight line through 300 and 640 predicted 24 s for the
3,000 px image and it actually took **55 s**. Cost above ~1,000 px is superlinear.

The two columns are not optimism and pessimism — they are the same machine on different
days. The smoke decoded the *same canary image* three times in one process at **8.9 s,
2.2 s and 14.6 s** (byte-identical answers). Machine contention moves the total by more
than any scope choice does.

### What each scope buys, which hours do not show

Scored comparisons per long-edge bin, and the Wilson ± a bin that size buys at 90% agreement:

| bin (px) | full | ± | sample | ± | pairs |
|---|---|---|---|---|---|
| 0–160 | 1,169 | 0.017 | 420 | 0.029 | — |
| 161–240 | 11 | 0.184 | 4 | 0.287 | — |
| 241–340 | 1,006 | 0.019 | 441 | 0.028 | 644 |
| 341–440 | 103 | 0.059 | 42 | 0.093 | — |
| 441–560 | 831 | 0.020 | 264 | 0.036 | — |
| 681–900 | 7 | 0.228 | 4 | 0.287 | — |
| 901–1400 | 15 | 0.158 | 15 | 0.158 | — |

**`sample` is not a cheaper approximation of `full` — for this question they answer the
same.** The sample already puts 264–441 comparisons in each well-populated bin, which is a
±0.03 curve point; `full` buys ±0.02 for 2.5× the machine time. All 86 matched-contrast
anchors are forced into the sample, so the transfer check has identical power either way.

**The 561–680 px bin is empty under every scope.** The CDN derives 147 / ~330 / ~480 px
renditions and nothing between 560 px and the original, so a ~640 px rung exists only when
640 *is* the original — where it is the reference, not a rung. So the ladder brackets 300 px
from both sides and is **silent on whether 640 px is itself enough**. If that question
matters, it needs a different collection, not a bigger scope here.

---

## Running it (do not, without go-ahead)

```bash
cd research/v3/oracle/ladder

# machinery check, no model, no GPU
../premise/.venv/bin/python selftest.py

# see the queue without loading the model
../premise/.venv/bin/python run_ladder.py --scope sample --out /tmp/x.jsonl --dry-run

# THE RUN — supervised, resumable, canary every 100 items
./supervise.sh --scope sample --out ../../data/oracle-ladder/ladder-sample-1.jsonl
./supervise.sh --scope pairs  --out ../../data/oracle-ladder/ladder-pairs-1.jsonl
./supervise.sh --scope full   --out ../../data/oracle-ladder/ladder-full-1.jsonl

# the answer
../premise/.venv/bin/python analyze.py \
  --results ../../data/oracle-ladder/ladder-sample-1.jsonl \
  --pairs   ../../data/oracle-ladder/ladder-pairs-1.jsonl
```

A resumed run appends to the same file and re-derives its queue from it. Changing the
prompt, the schema, or the resolution policy changes the resume key, so every row is redone
rather than silently mixed.

## Smoke (2026-08-03)

`data/oracle-ladder/smoke-1.jsonl` — two artworks, chosen so that one of them is the
largest image in the collection:

- `0d053af3…` — rungs 3000 / 1079 / 482 / 332 / 147 px
- `0175812f…` — rungs 640 / 483 / 482 / 368 / 318 / 147 / 112 px, a matched-contrast anchor

**13 inferences + 3 canaries, 16/16 ok, 0 parse failures, 0 retries, canary stable** (one
distinct answer across three decodes). `analyze.py` runs on the output and correctly
refuses a verdict on every bin — all of them are under `MIN_BIN_N`, which is the right
answer for two artworks.

Two findings worth carrying forward:

1. **No memory reason to cap** (pipeline §7.5's stated test). The 3,000 px image peaked at
   28.2 GB against 27.0 GB for a 640 px one, and decoded normally. Nothing in the
   collection is larger.
2. **The largest rendition is not automatically the best answer.** At 3,000 px the model
   called `0d053af3…` `pattern_or_texture`; every smaller rendition of the same artwork
   called it `flat_field`. It is seeing paper grain that is invisible at any size a user
   will ever view. The ladder's answer key is "the same model with the most pixels", not
   "the truth" — `analyze.py` says so in its notes, and this is the concrete case. If this
   turns out to be common, the reference rendition should be capped at a viewing-plausible
   size and the ladder re-scored against that instead; the run does not need repeating,
   only the analysis.

## How to read the result

Three things together, and the middle one is the easy one to skip:

1. **The curve**, per question, per bin, with Wilson intervals.
2. **The codec control** — two byte-different encodings of the *same* pixels. A curve
   plateauing at 0.88 means nothing until you know same-size agreement is not also 0.88.
   It is only populated if the run used `--include-duplicate-sizes`.
3. **The floor verdict** — `unanswerable_below_px`, computed by walking down from the
   largest bin and stopping at the first that fails the agreement floor. The floor itself is
   `[UNCALIBRATED]` (default 0.85, a CLI flag): this run is what calibrates it, so the whole
   curve is printed for the reviewer to set it against.

`shading_geometry` is reported **conditioned on the reference answering `shaded_field`**.
Pooled, its value is `not_applicable` most of the time and its agreement would mostly
measure how often both sizes agreed the question did not apply.
