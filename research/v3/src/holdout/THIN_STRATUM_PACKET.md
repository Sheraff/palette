# Decision packet — the holdout's thin ≤400 px stratum

**Status:** awaiting reviewer decision. Nothing in this file has been decided.
**Prepared:** 2026-08-04. **Prepared by:** analysis agent, read-only over stored data.
**Source item:** `research/v3/reviews/phase-0-adversarial/unrealized-ideas.md` lines 268–288 (item 9).
**Related loose ends:** A11, C1, C2, C3, C7 (`research/v3/PHASE_0_LOOSE_ENDS.md`).

---

## 0. Vocabulary — every term used below, in plain language

| term | what it means here |
|---|---|
| **holdout** | A fixed list of album artworks the v3 palette work is forbidden to look at during development, reserved so that one honest measurement can be made at the end of the campaign. Frozen list: `research/v3/data/holdout/holdout.json`, version 2.0.0, frozen 2026-08-02. |
| **candidate** | An artwork from `music-artworks/` that survived the inclusion filters (square within 5%, best rendition long edge > 150 px, no genuinely transparent pixels). There are 2757 of them. Candidates are the pool the holdout was drawn *from*; everything else in the collection was never eligible. |
| **freeze** | The act of fixing the holdout list and writing it to disk with a pinned random seed, so the same list is reproducible from the code alone. "The freeze" = the current version 2.0.0 list. |
| **stratum** (plural **strata**) | A bucket of the candidate pool defined by image resolution. Four buckets: ≤400 px, 401–640 px, 641–1024 px, >1024 px, measured on the long edge. Defined at `research/v3/src/holdout/freeze-holdout.ts:104-110`. |
| **stratification** | Drawing the holdout separately inside each bucket, rather than drawing 15% of everything at random, so that each resolution band is represented in the holdout at roughly its true rate. Without it, a small band can be missed entirely by bad luck. |
| **component** | A group of artworks that are the *same image* under different artwork ids (a re-issue, a re-upload, a CDN copy). Found by the near-duplicate census: an edge is drawn whenever any of three embedding models scores a pair at cosine ≥ 0.95, then connected groups are collapsed. The 2757 candidates are only **1712 distinct images**. |
| **component-level stratification** | The v2 rule: a component is entirely held out or entirely kept, and the *component* — not the individual artwork — is what gets assigned to a resolution bucket. A component's bucket is taken from its **largest** member. This is what makes the ≤400 bucket thin: an artwork that is itself 300 px, but has a 640 px twin under another id, is counted in the 401–640 bucket. |
| **coverage set** | The canonical *tuning* bench — 200 artworks chosen to span the corpus, built by `research/v3/src/coverage-set/build-coverage-set.ts`, output `research/v3/data/coverage-set/coverage-set-1.json`. It is built by *subtracting* the holdout ids from the universe, so it depends on the frozen list. |
| **ladder eligibility** | Which artworks the resolution ladder experiment is allowed to sample. Defined in `research/v3/oracle/ladder/build-manifest.ts` as "candidates, minus the 413 held out, minus the 12 quarantined, keeping only artworks with ≥2 renditions". It reads `holdout.json` directly and asserts the count is 413. |
| **boundary assertion** | An automated check that no near-duplicate edge crosses the held-out / not-held-out line — i.e. that no working-set image is secretly a copy of a held-out one. Asserted in `freeze-holdout.ts:783-788` (producer side) and again in `build-coverage-set.ts:536-550` (consumer side). |
| **Wilson interval** | A way of putting error bars on a percentage estimated from a small sample. If 12 of 14 held-out images pass a check, the true pass rate is not 85.7% — it is *somewhere in a range*, and the Wilson interval is the standard, well-behaved way to state that range for small n and for rates near 0 or 1 (where the naive ±1.96·√(p(1−p)/n) formula misbehaves and can even run past 100%). "95% Wilson interval" = the range that would contain the true rate 95% of the time. |
| **tail-specific claim** | A sentence of the form "*at low resolution*, the algorithm does X" — a claim restricted to one resolution stratum, as opposed to a **corpus-wide claim** ("across the corpus, the algorithm does X"). The whole question in this packet is whether the frozen holdout can support the first kind at ≤400 px. |
| **passenger** | (Term introduced in this packet.) A held-out artwork whose *own* resolution is ≤400 px but which was not drawn as part of the ≤400 stratum — it came along because a higher-resolution twin's component was drawn. |

---

## 1. What is being decided, and why now

The holdout was drawn in four resolution strata at 15% each. The ≤400 px stratum contains **93 candidate artworks in 91 components, of which 14 artworks in 13 components were held out**. Twice — once at the v1 freeze and once at the v2 redraw — the agent doing the work raised that this bucket is too thin to support any claim specific to low resolution, and asked for a decision between *oversample the tail* and *accept corpus-wide claims only*. Both times the orchestrator applied the second option as a silent default and did not put it to the reviewer, and neither time was the default written down anywhere. It is not in `HOLDOUT.md`, not in `PHASE_0_DECISIONS.md`, not in `decisions.json`, and it is not one of the five holdout loose ends (A11, C1, C2, C3, C7).

Why it is being surfaced now rather than filed away: the agent's own framing was "decide now, before anything consumes the list", and **the list has since been consumed** — by the coverage set, by ladder eligibility, and by the boundary assertions (inventory in §5). So the cheap option (redraw) is no longer cheap, and the expensive-to-reverse option (accept) is already de-facto in force without being recorded. Meanwhile the coverage set — a *different* artefact, the tuning bench — carries 53 artworks at ≤400 px, 26.5% of its core, and instructs in writing that everything measured on it be **reported stratified by resolution tier** (`research/v3/data/coverage-set/COVERAGE_SET.md:148`). That instruction sets up an end-of-campaign expectation that a per-tier number will exist. On the holdout side, at ≤400 px, the number that would validate it rests on 14 images. That mismatch is the live risk.

**This packet measures the situation and lays out the options. It does not choose.**

---

## 2. The measurement

Everything in this section was **recomputed independently** from stored data by a fresh script (`/tmp/thin-stratum-recompute.mjs`, scratch — not committed), reproducing the candidate build from `research/v3/data/holdout/measurements.jsonl` (8595 file headers), `research/v3/data/source-surveys/pixel_results.json` (transparency exclusions), and `research/v3/data/embeddings/near-dup-census.json` (6386 near-duplicate pairs), then re-deriving the strata and cross-checking the held-out side against `research/v3/data/holdout/holdout.json`. Where a number could not be recomputed it says so and why.

### 2.1 Candidate build — reproduces exactly

| quantity | recomputed | as recorded in `HOLDOUT.md` | agrees |
|---|---|---|---|
| files enumerated | 8595 | 8595 | yes |
| artworks | 4088 | 4088 | yes |
| dropped, non-square | 991 | 991 | yes |
| dropped, thumbnail-only | 16 | 16 | yes |
| dropped, real transparency | 324 | 324 | yes |
| **candidate artworks** | **2757** | 2757 | yes |
| **components** | **1712** | 1712 | yes |

*(verified by recomputation)*

### 2.2 The full stratum table — the primary answer

Stratum = the resolution band of the **component's largest member**. This is the axis the draw was balanced on.

| stratum | components | candidate artworks | held components | held artworks | held share of stratum | stratum's share of candidates | stratum's share of holdout |
|---|---|---|---|---|---|---|---|
| **≤400** | **91** | **93** | **13** | **14** | **15.05%** | **3.37%** | **3.39%** |
| 401–640 | 528 | 611 | 77 | 92 | 15.06% | 22.16% | 22.28% |
| 641–1024 | 916 | 1527 | 135 | 228 | 14.93% | 55.39% | 55.21% |
| >1024 | 177 | 526 | 29 | 79 | 15.02% | 19.08% | 19.13% |
| **total** | **1712** | **2757** | **254** | **413** | **14.98%** | 100% | 100% |

*(every cell verified by recomputation; matches `HOLDOUT.md:104-110` and `holdout.json` `header.strata` exactly, including the rounding)*

Working-set remainder per stratum, for completeness *(verified by recomputation)*:

| stratum | working artworks | working components |
|---|---|---|
| ≤400 | 79 | 78 |
| 401–640 | 519 | 451 |
| 641–1024 | 1299 | 781 |
| >1024 | 447 | 148 |

The 14 held-out ≤400 artworks span 24 files, and their best-rendition long edges are:
`175, 200, 200, 200, 240, 300, 300, 300, 300, 300, 300, 319, 332, 400` *(verified by recomputation from `holdout.json`)*.
Six of the fourteen are the same 300 px CDN size.

### 2.3 Is the holdout's tail proportional? — yes, to its own parent; no, to the deployment corpus

**Against the candidate pool it was drawn from: proportional to three significant figures.** The ≤400 stratum is 3.37% of candidates and 3.39% of the holdout *(verified by recomputation)*. The draw did not under-sample the tail. The tail is thin because **the parent pool's tail is thin**, and because component-level stratification moved most of it out (§2.5).

**Against the whole `music-artworks/` collection before filtering** — 4088 artworks, by each artwork's *own* long edge *(verified by recomputation)*:

| band | all 4088 artworks | share |
|---|---|---|
| ≤400 | 421 | 10.30% |
| 401–640 | 1387 | 33.93% |
| 641–1024 | 2079 | 50.86% |
| >1024 | 201 | 4.92% |

The inclusion filters cut the ≤400 band from 421 to 205 — 198 lost as non-square, 16 as thumbnail-only, 2 for transparency *(verified by recomputation)*. So the filters themselves remove roughly half the collection's low-resolution tail before stratification ever runs. That is a design consequence of the filters, not of the holdout draw, and it is not in scope here — but it explains part of the thinness.

**Against the sharded corpus — the collection the coverage set is 74.6% made of, and the one closest to a CDN deployment distribution** *(verified by recomputation from `research/v3/data/embeddings/sharded.dinov2-vitl14.ids.jsonl`, grouping 7550 measured files into artworks by the 24-char id and taking each artwork's largest rendition)*:

| band | sharded artworks | share |
|---|---|---|
| ≤400 | 2273 | **32.91%** |
| 401–640 | 4633 | 67.09% |
| 641–1024 | 0 | 0% |
| >1024 | 0 | 0% |

(6906 sharded artworks total — matches `COVERAGE_SET.md:23` exactly.)

**This is the representativeness finding.** Low resolution is 3.4% of the holdout and 33% of the sharded corpus. `COVERAGE_SET.md:37` records the combined universe as **26.45% ≤400 px**, and the coverage-set core is deliberately matched to it at 26.5% — my own arithmetic reconciles that 2442 to within 4 artworks (2273 sharded + 173 music-artworks working-set ≤400, minus part of the 18 enrichment removals) *(coverage-set universe count as recorded in `COVERAGE_SET.md:37`; cross-checked, not byte-recomputed)*. So the tuning bench is a quarter low-resolution and the holdout is a thirtieth. The holdout is proportional to `music-artworks/`; `music-artworks/` is not proportional to where the palette will run. **Note that the holdout only ever covered `music-artworks/` by design — the sharded collection has no holdout at all (loose end A11), so this is not a defect of the draw; it is the reason a low-resolution end-of-campaign claim has nowhere to come from.**

### 2.4 The v1 vs v2 comparison in the quote — both numbers verified, and the quote is subtler than it looks

The v1 artefacts are **not** on disk (`HOLDOUT.md:8`: "The old list is retrievable from git history; it is not kept on disk"), but they **are** recoverable: commit `418e39d` contains both v1 `HOLDOUT.md` and v1 `holdout.json`.

| | v1 (commit `418e39d`) | v2 (current) |
|---|---|---|
| stratification unit | each artwork's **own** best-rendition long edge | the **component's largest member** |
| ≤400 candidates | **205** | **93** |
| ≤400 held out | **31** | **14** |
| total held out | 414 | 413 |

*(v1 numbers verified two ways: read from `git show 418e39d:research/v3/data/holdout/HOLDOUT.md` lines 73-79, and independently recounted from `git show 418e39d:research/v3/data/holdout/holdout.json` — 414 artworks, of which 31 carry stratum `≤400`. The v1 candidate figure 205 is also reproduced from scratch by my recomputation of the current data: exactly 205 of the 2757 candidates have their own best rendition at ≤400 px.)*

So the quote's "205 → 93" is exact and correctly attributed to component-level stratification. But it understates one thing and overstates another:

- **It overstates the loss of low-resolution images.** v1 held out 31 genuinely-≤400 artworks; v2 holds out **32** *(verified by recomputation: `holdout.json` `ownLongEdgeBand` = ≤400 for 32 of the 413, spanning 30 distinct components)*. The number of low-resolution images inside the holdout went **up by one**. What collapsed from 31 to 14 is the number that were *balanced as low-resolution by the draw*.
- **It understates the structural problem.** The other 18 of those 32 are **passengers** — their own image is ≤400 px, but their component's largest member is bigger, so they were drawn as part of a higher-resolution bucket. Corpus-wide, 112 of the 205 own-band-≤400 candidates ride up into a higher stratum this way *(verified by recomputation)*. Passengers are not a random sample of low-resolution images: by construction, every passenger is a low-resolution image **that has a higher-resolution twin somewhere in the corpus**. Whether that biases a low-resolution claim depends entirely on what is being claimed, and it has never been assessed.

Both views are already in the frozen file, and `HOLDOUT.md:145-147` already instructs: *"Use `ownLongEdgeBand` for any per-artwork resolution analysis; `stratum` only describes how the draw was balanced."* Under that instruction the pool for a low-resolution claim is **32 artworks / 30 components**, not 14/13. This distinction is the single biggest lever in the packet and it is why §3 computes both.

Held-out artworks by own best-rendition band *(verified by recomputation; matches `HOLDOUT.md:138-143`)*:

| own band | held artworks | distinct components |
|---|---|---|
| ≤400 | 32 | 30 |
| 401–640 | 183 | 139 |
| 641–1024 | 169 | 152 |
| >1024 | 29 | 29 |

And all 2757 candidates by own band *(verified by recomputation)*: ≤400 **205** (7.44%), 401–640 **1247** (45.23%), 641–1024 **1120** (40.62%), >1024 **185** (6.71%). Held share of the own-band ≤400 pool: 32/205 = **15.61%** — again proportional.

### 2.5 Why the stratum is thin, stated causally

Three separate causes, each measured, in order of size:

1. **The collection's tail is small to begin with:** 421 of 4088 artworks (10.3%) are ≤400 px.
2. **The inclusion filters halve it:** 421 → 205, mostly by dropping 198 non-square low-resolution files (banners and site furniture skew small).
3. **Component-level stratification halves it again *as a stratification axis*:** 205 → 93, because 112 low-resolution artworks have a higher-resolution twin and ride up into a higher bucket.

Then 15% of 93 is 14. None of the three steps is a mistake — steps 2 and 3 are both deliberate and both defensible (step 3 exists to close the v1 leak, where 224 of 414 held-out artworks had a twin on the wrong side of the line). The thinness is the *sum* of three correct decisions, which is exactly why nobody caught it as a decision point.

---

## 3. What the numbers mean — error bars on a claim from this stratum

### 3.1 How to read a Wilson interval

Suppose an end-of-campaign check is run on the held-out low-resolution images and *k* of *n* pass. The observed rate *k/n* is not the truth; it is an estimate, and with small *n* the estimate is loose. The **95% Wilson interval** is the standard range for that looseness. Its formula, for observed proportion p̂ = k/n and z = 1.96:

```
centre     = ( p̂ + z²/(2n) ) / ( 1 + z²/n )
half-width = ( z / (1 + z²/n) ) · sqrt( p̂(1−p̂)/n  +  z²/(4n²) )
interval   = centre ± half-width
```

The "±X points" column below is the half-width in percentage points. **A ± of 20 points means the measurement cannot tell 70% apart from 100%.**

### 3.2 The intervals, computed

All rows *(verified by recomputation — Wilson formula above, z = 1.959964, evaluated numerically)*. `k` is rounded to the nearest whole image, which is why p̂ is not exactly the nominal rate.

**n = 14 — the ≤400 *stratum* as drawn (the pessimistic, as-balanced reading):**

| nominal rate | k | p̂ | 95% Wilson interval | total width | ± |
|---|---|---|---|---|---|
| 0.5 | 7 | 0.5000 | [0.268, 0.732] | 46.4 pts | ±23.2 |
| 0.8 | 11 | 0.7857 | [0.524, 0.924] | 40.0 pts | ±20.0 |
| 0.9 | 13 | 0.9286 | [0.685, 0.987] | 30.2 pts | ±15.1 |
| 1.0 | 14 | 1.0000 | [0.785, 1.000] | 21.5 pts | ±10.8 |

**n = 13 — the same stratum counted in *independent images* (components), which `HOLDOUT.md:113-116` says is the number to use for statistical power:**

| nominal rate | k | p̂ | 95% Wilson interval | total width | ± |
|---|---|---|---|---|---|
| 0.5 | 7 | 0.5385 | [0.291, 0.768] | 47.7 pts | ±23.8 |
| 0.8 | 10 | 0.7692 | [0.497, 0.918] | 42.1 pts | ±21.0 |
| 0.9 | 12 | 0.9231 | [0.667, 0.986] | 31.9 pts | ±16.0 |
| 1.0 | 13 | 1.0000 | [0.772, 1.000] | 22.8 pts | ±11.4 |

**n = 32 / 30 — the own-band reading (all held-out artworks whose own image is ≤400 px, and their independent-image count):**

| n | nominal rate | k | p̂ | 95% Wilson interval | ± |
|---|---|---|---|---|---|
| 32 | 0.5 | 16 | 0.5000 | [0.336, 0.664] | ±16.4 |
| 32 | 0.8 | 26 | 0.8125 | [0.647, 0.911] | ±13.2 |
| 32 | 0.9 | 29 | 0.9063 | [0.758, 0.968] | ±10.5 |
| 32 | 1.0 | 32 | 1.0000 | [0.893, 1.000] | ±5.4 |
| 30 | 0.5 | 15 | 0.5000 | [0.332, 0.669] | ±16.8 |
| 30 | 0.9 | 27 | 0.9000 | [0.744, 0.965] | ±11.1 |
| 30 | 1.0 | 30 | 1.0000 | [0.887, 1.000] | ±5.7 |

**For contrast, the corpus-wide holdout** (n = 413 nominal, n = 254 effective) *(verified by recomputation)*: at a 90% rate, ±2.9 points nominal / ±3.7 points effective; at 50%, ±4.8 / ±6.1.

### 3.3 The single most useful sentence in this packet

**A pass-rate claim restricted to the ≤400 stratum as drawn carries roughly ±20 points of 95% uncertainty at any realistic rate below 0.95, and ±23 points at 50%.** A claim of the form "at low resolution the algorithm succeeds 80% of the time" would, honestly stated, read "somewhere between 52% and 92%" — which does not distinguish "works" from "half-broken". Only two kinds of statement survive at n = 14:

- **A one-sided floor after a clean sweep.** If all 14 pass, the honest claim is "**at least 78%**" (Wilson lower bound 0.785; the rule-of-three approximation 1 − 3/14 gives 0.786 — *verified by recomputation, the two agree to a third decimal*). "At least 78%" is a real, publishable, modest claim, and it is available today at no cost. On the 13-component reading it is "at least 77%".
- **Detection of a catastrophe.** If low resolution were badly broken — say a true rate of 30% — 14 images would show it: the interval around 4/14 is [0.117, 0.548], which excludes 0.8 outright. Small samples are bad at measuring and adequate at alarming.

### 3.4 The price tag for a usefully narrow claim (±10 points)

Minimum n for a 95% Wilson interval no wider than 20 points total (±10) *(verified by recomputation — smallest integer n satisfying the width condition)*:

| true rate assumed | minimum n | actual width at that n |
|---|---|---|
| 0.50 (worst case) | **93** | 19.9 pts |
| 0.80 | **60** | 20.0 pts |
| 0.90 | **34** | 19.9 pts |
| 0.95 | **24** | 19.5 pts |

For reference, ±5 points at a 50% rate needs **n = 381** *(verified by recomputation)*.

**Read those against the pools that exist, because this is where option B's price becomes concrete:**

| framing | pool available | held today | n needed for ±10 at p=0.9 | n needed for ±10 at p=0.5 |
|---|---|---|---|---|
| ≤400 **stratum** (component's largest ≤400) | 93 candidates / 91 components | 14 / 13 | 34 → **36.6% of the stratum** | 93 → **the entire stratum, and still only just** |
| ≤400 **own band** (artwork's own image ≤400) | 205 candidates | 32 (30 components) | 34 → **16.6% of the pool; +2 artworks from today** | 93 → **45.4% of the pool** |

Two things follow, and they point opposite ways:

- **On the stratum framing, ±10 at a 50% rate is arithmetically unreachable from this corpus.** The whole stratum is 93 artworks in 91 components; you would have to hold out all of it and still land at the edge, and there would then be no low-resolution images left in the working set to develop against. A tail-specific claim at ±10 and a middling rate is not a thing this collection can produce, at any price, under this framing.
- **On the own-band framing, the gap is two artworks.** If the analysis unit is `ownLongEdgeBand` — which `HOLDOUT.md:145-147` already directs for exactly this kind of analysis — then n = 32 today, and n = 34 buys ±10 points *provided the true rate is around 0.9*. At n = 30 independent components the same target is ±11.1. **This is close enough to the line that the choice between options is partly a choice of which framing is legitimate**, and that legitimacy question — are 18 passenger artworks an acceptable sample of low-resolution behaviour, given every one of them has a higher-resolution twin — has never been examined. It is not resolved here.

---

## 4. What a decision cannot un-consume

The agent's original framing was "decide now, before anything consumes the list". That window has closed. `research/v3/data/decisions/decisions.json:56` records, of the v1→v2 redraw: *"The redraw was free of consequence only because NOTHING HAD YET CONSUMED the holdout. That is the reason the authorisation was cheap to give; it will not be cheap again."* That premise is now false. Inventory follows.

---

## 5. What already depends on the frozen list

*(established by repository search; each row verified to exist at the path and line given, but these are dependency facts, not recomputed quantities)*

### 5.1 Hard consumers — code that reads `holdout.json` and asserts on it

| consumer | how it consumes | invalidated by a redraw? |
|---|---|---|
| `research/v3/src/coverage-set/build-coverage-set.ts` | `:115` declares `holdout.json` as input; `:255-257` builds the 413-id set and **hard-asserts the count is 413**; `:260-261` asserts the census sha256 matches; `:279-285` subtracts held-out ids from the universe; `:536-550` runs the consumer-side boundary assertions | **Yes.** Universe size, all tier percentages, core membership, and both boundary check results are functions of the exact id set. `:55` states in comment that a redraw is a NEW file. |
| `research/v3/data/coverage-set/coverage-set-1.json` + `COVERAGE_SET.md` | The canonical tuning bench itself — 200 core artworks, 9 named checks recorded as passing, resolution tier table (`:37`), universe count 9232 (`:23`) | **Yes.** Would become `coverage-set-2.json`. |
| `research/v3/oracle/ladder/build-manifest.ts` | `:15-18` states eligibility replicates the freeze's candidate rules *"because the ladder must draw from the same population the holdout was cut out of"*; `:115` `EXPECTED_HELD_OUT_ARTWORKS = 413`; `:128-129` reads both `holdout.json` and `measurements.jsonl`; `:472-477` working set = candidates − held − quarantined, eligible = ≥2 renditions; `:407-420` cross-checks every header against the holdout survey | **Yes.** A different working set gives a different Fisher-Yates draw, so the 400-artwork ladder sample is not reproducible. |
| `research/v3/data/oracle-ladder/manifest.json`, `ladder-sample-1.jsonl`, `ladder-sample-1.analysis.json`, `ladder-sample-1.capped-reference.analysis.json`, `ladder-pairs-1.jsonl`, `ladder-codec-control-1.jsonl` | the ladder artefacts drawn from that working set | **Yes** (the sample; whether the measured floors move is empirical) |
| `research/v3/oracle/embeddings/holdout_filter.py`, `gallery.py`, `census_holdout_annotation.py` | exposure audit, gallery filtering, census sidecar — all keyed to the id set | **Yes** — the 117/413 exposure audit and `near-dup-census.holdout-v2.json` are per-id |
| `research/v3/data/embeddings/holdout-exposure.json` / `HOLDOUT_EXPOSURE.md` / `gallery/summary.json` | recorded exposure and gallery stamps (`holdout_version: "2.0.0"`, `holdout_artworks: 413`) | **Yes** |

### 5.2 Second-order — things built on the coverage set or the ladder

`research/v3/src/review-server/oracle-validation.ts:979` pins `coverage-set-1.json` and `:1238` pins the holdout's four-band tier vocabulary; `research/v3/data/oracle-validation/bcde-validation-1.json` and its analysis draw their population from the coverage-set core; reviewer label deposits (`src/review-server/server.ts:2673`) attach to coverage-set artworks; decisions `d-2026-08-03-reviewer-rounds-from-coverage-core` and `d-2026-08-03-coverage-set-canonical-bench` (`decisions.json:664-671, 690`) rest on that membership; the published resolution floors in `PHASE_0_DECISIONS.md` §7 (`:477-480`) and `d-2026-08-03-ladder-capped-reference-key` rest on the ladder sample; `oracle/sam/RESIDUAL_PURITY_VERDICT.md:208` and `analyze_residual_purity_1.py:354` **hardcode** the post-holdout universe percentage `26.45`.

### 5.3 Boundary assertions specifically

- Producer side, `freeze-holdout.ts:783-788`: *"THE leak check: no census edge (any arm, ≥ threshold) crosses the boundary"* — asserts `crossingEdges === 0`, written to `holdout.json` as `nearDuplicateEdgesCrossingHoldoutBoundary: 0`.
- Consumer side, `build-coverage-set.ts:536-550`: no held-out or quarantined artwork in the core, **and** no selected artwork sharing a near-duplicate component with a held-out one — with the comment *"the census-graph assertion the holdout-v2 redraw exists to enforce"*.
- Independently re-verified in review: `research/v3/reviews/phase-0-adversarial/embeddings-corpus.md:246-255` — 6,236 music-artworks edges, 62 with exactly one endpoint held out, all 62 landing on the 12 quarantined artworks.

### 5.4 Written count claims that would go stale

Roughly 25 numeric claims across 8 markdown files and 4 decision records cite 413 / 254 / 2757 / 1712 / 9232, including `PHASE_0_DECISIONS.md:307-338`, `HOLDOUT.md` throughout, `COVERAGE_SET.md:23`, `oracle/ladder/README.md:69-71`, `decisions.json:36`, and the adversarial review's own reconciliation at `reviews/phase-0-adversarial/embeddings-corpus.md:319-321`.

### 5.5 Low-resolution claims that already exist — and where they come from

Note carefully: **claims about ≤400 px are already being made in this repo, but none of them come from the holdout.** They come from the coverage set and the ladder:

- `COVERAGE_SET.md:148` / `build-coverage-set.ts:1088`: *"26.5% of the core is at or below 400 px, some questions are physically unanswerable at that size, and a single pooled number over a mixed-resolution sample is not interpretable"* — plus the standing instruction to report everything on that set **stratified by tier**.
- `PHASE_0_DECISIONS.md` §7: measured resolution floors (~241 px `ground_type` / `gradient_boolean`, ~441 px `shading_geometry`), currently provisional under loose end A1.
- `PHASE_0_LOOSE_ENDS.md:111`: the "2,270 300 px-only artworks" decision and `below_resolution` tagging corpus-wide.

The coverage set is a **tuning** bench, so nothing measured on it is a leak-free end-of-campaign number. The holdout is the only leak-free instrument, and at ≤400 px it holds 14 (or 32, by framing) images. **The gap between "report everything by tier" and "the tier has 14 images" is what this decision is about.**

---

## 6. The options

Each option below states what would be written, where, what it costs, and what it forecloses. **None is recommended here.**

### Option A — Accept as-is, and record the default *as* a decision

**What it is.** Keep the frozen list untouched. Write down, in the places that a future claim-writer will actually read, that the ≤400 stratum is too thin for a tail-specific claim and that only corpus-wide claims are available from this holdout.

**What would have to be written, and where:**

1. **`research/v3/data/holdout/HOLDOUT.md`** — a short subsection under "Counts". *Mechanical constraint:* this file is **generated** by `freeze-holdout.ts` (`:1039-1190`) and byte-compared by `--verify`, so the text must be added to the generator's template, not to the .md by hand, or the next `--verify` fails. This is the only edit in option A that touches code.
2. **`research/v3/data/decisions/decisions.json`** — a decision record, e.g. `d-2026-08-04-holdout-low-res-corpus-wide-only`, recording the default, that it was applied twice without being put to the reviewer, and the ±20-point arithmetic behind it.
3. **`research/v3/PHASE_0_DECISIONS.md`** §holdout — one line pointing at the decision record.
4. **`research/v3/PHASE_0_LOOSE_ENDS.md`** — either close item 9 by reference, or open a **C-row** ("latent — harmless today, harmful under one specific move") naming the specific move as *"an end-of-campaign claim written per resolution tier"*.

**What a future claim-writer would be forbidden from saying** (the operative text; this is the content of the decision, and the reviewer may want to edit the wording):

> Forbidden, from the holdout: any sentence of the form "at ≤400 px, X% of held-out artworks …", any per-tier holdout table with a ≤400 row carrying a rate, any comparison of the ≤400 rate against another tier's rate, and any statement that low-resolution behaviour was *validated*. Permitted: corpus-wide holdout rates; a one-sided floor from a clean sweep of the ≤400 subset, stated with its n and its Wilson lower bound (e.g. "all 14 held-out ≤400 px artworks passed; ≥78% at 95% confidence"); and the observation that no low-resolution catastrophe was detected, stated with the sensitivity that detection had.

**Cost.** Roughly an hour. No artefact is invalidated. No re-run of anything.

**Consequence.** The campaign permanently has no validated low-resolution number from `music-artworks/`. This collides with `COVERAGE_SET.md:148`'s standing instruction to report by tier: tuning results will exist per tier and the holdout confirmation will not, and someone must not silently promote the former to the latter. **It also leaves A11 carrying more weight** — since the sharded corpus (33% low-resolution) has no holdout at all, the fresh-shard import named in A11 becomes the only conceivable future source of a low-resolution leak-free number, and that mechanism has never been exercised once.

### Option B — Rebalance / oversample the tail at the next freeze

**What it is.** Redraw the holdout with a higher sampling rate in the ≤400 stratum (or with the stratification axis changed to own-band), so that the tail is thick enough for a tail-specific claim.

**The n required**, from §3.4: 34 for ±10 points at a 0.9 rate; 60 at a 0.8 rate; 93 — the entire stratum — at 0.5. Under the stratum framing, n = 34 means holding out **36.6% of a 93-artwork stratum** and leaving 59 low-resolution artworks in the working set; n = 60 means holding out 65% and leaving 33, which is likely too few to develop against. Under the own-band framing the same n = 34 costs **two artworks** over today's 32.

**What it costs — this is the expensive option.** Per loose end **C3** (`PHASE_0_LOOSE_ENDS.md:1636`): *"A holdout re-roll voids every claim made against the old list. It has happened once, deliberately, with reviewer authorisation (v1 → v2). Changing HOLDOUT_SEED, the census, or the component rule does it again. Authorisation-gated: reviewer only."* Changing the stratification rule or the per-stratum rate **is** a change to the component/draw rule. **Reviewer authorisation is mandatory and no agent may do this.**

**Specifically invalidated** (from §5): the coverage set `coverage-set-1.json` and its 200-artwork core, all 9 of its recorded check results, its universe count 9232 and every tier percentage; every reviewer label already deposited against coverage-set artworks and the two decisions that made that bench canonical; the ladder manifest, the 400-artwork ladder sample and the five ladder data files drawn from it (the measured resolution floors would need re-derivation, whether or not they move); the 117/413 exposure audit; the census holdout sidecar; the gallery `summary.json` stamps; and roughly 25 written count claims across 8 markdown files and 4 decision records. `oracle/sam/analyze_residual_purity_1.py:354` hardcodes `26.45` and would silently disagree. Only `measurements.jsonl` is cheaply regenerable (loose end C7).

**Second cost, easy to miss:** oversampling the ≤400 stratum removes low-resolution images from the *working set*, where they are needed for development and for the ladder. At n = 60 held out, the working set keeps 33 low-resolution artworks in 33-ish components. The tail is small enough that the holdout and the development set are competing for the same scarce images.

**Consequence.** Buys a tail-specific claim at ±10 points and a 0.9-ish rate, at the price of re-deriving the tuning bench and the ladder sample from scratch and re-recording every downstream number.

### Option C — Keep the freeze, carve out an explicit exclusion

**What it is.** A narrower, enforceable version of option A: rather than a prose warning, register the ≤400 stratum as **out of scope for claims** in the same machine-checked way the boundary assertion is registered, so that a per-tier claim cannot be produced by accident.

**Which claims specifically would be carved out:**

- Any per-tier table computed over the holdout that carries a rate in the ≤400 row (the row would carry `n=14 — INSUFFICIENT` instead of a percentage).
- Any tier-to-tier comparison involving ≤400.
- Any statement that low-resolution behaviour is validated, as opposed to un-contradicted.
- **Not** carved out: corpus-wide holdout rates; ≤400 counts and floors, stated as one-sided bounds with n; the coverage set's own per-tier tuning numbers (a different artefact, clearly labelled as tuning).

**How it would be enforced.** Three levels, in increasing cost, and the reviewer may want only the first:

1. **Declarative:** a `claimScope` block in `holdout.json`'s header, emitted by `freeze-holdout.ts`, naming per-stratum minimum-n and marking `≤400` as `insufficient-for-rate-claims` with the Wilson width recorded. Costs one generator change; makes the constraint machine-readable and therefore quotable.
2. **Assertive:** a check in whatever end-of-campaign reporting script eventually exists, refusing to emit a rate for a stratum below a declared minimum n. Cannot be built yet — no such script exists. Would be a spec, not code, today.
3. **Reviewed:** a line in the claim-writing checklist. Costs nothing, enforces nothing.

**Cost.** Level 1 is roughly the same as option A plus a small generator change. Nothing is invalidated. No redraw.

**Consequence.** Same claim ceiling as option A, but the ceiling is written where a machine can see it instead of only where a reader can. It does **not** create a low-resolution claim; it only makes the absence of one hard to overlook. Its weakness is that the enforcement point (level 2) does not exist yet, so today it is option A with better ergonomics.

### Null option — Do nothing, leave it unrecorded

**Honest description:** this is the status quo, and it is what happened twice already — at the v1 freeze and again at the v2 redraw. The default ("accept; claim corpus-wide only") is already operationally in force: the freeze exists, the list is consumed, and no tail-specific claim has been made. Nothing breaks today.

**What it costs:** the reasoning stays in a review file (`unrealized-ideas.md`) rather than in the decision record, so at claim time the constraint has to be rediscovered by whoever is writing the claim — against a standing instruction in `COVERAGE_SET.md:148` to report everything by resolution tier, and against a coverage-set core that is 26.5% low-resolution and looks like it should have a matching holdout row. The specific failure mode is a per-tier end-of-campaign table with a ≤400 row containing a percentage computed over 14 images and no error bar. That is the third occurrence of this same default, and the first one that would produce a wrong published number rather than just an unrecorded decision.

---

## 7. What the data points to — observation only, not a recommendation

Stated as observations so the reviewer can weigh them; **the choice is not made here.**

- The draw is **not** at fault. Every stratum was sampled at 15.0% ± 0.1 and the ≤400 stratum's share of the holdout (3.39%) matches its share of the candidates (3.37%). If the tail is a problem, it is a corpus problem and a filter/component-rule problem, not a sampling problem.
- **The framing choice may be worth more than the option choice.** At the stratum framing (n=14) a ±10-point claim is unreachable at any price. At the own-band framing (n=32, which `HOLDOUT.md:145-147` already directs for per-artwork resolution analysis) it is two artworks away. Deciding whether the 18 "passenger" artworks are a legitimate low-resolution sample would change the arithmetic more than options A/B/C do — and that question is currently unanswered rather than answered badly.
- **The relevant comparison for deployment is 33%, not 3.4%.** The sharded corpus is a third low-resolution and has no holdout at all. Whatever is decided here, a low-resolution claim about the *deployment* distribution routes through A11's never-exercised fresh-shard import, not through this file.
- **Something is available today for free:** the one-sided floor. If all 14 (or all 32) held-out low-resolution artworks pass an end-of-campaign check, "≥78%" (or "≥89%") is a real, honest, defensible claim, and it requires no redraw and no authorisation. Whichever option is chosen, this sentence is worth writing into it explicitly, because a claim-writer who has been told "no tail-specific claims" may not realise a floor is still permitted.

---

## 8. Decision box — for Flo

Tick one primary option. Sub-items are independent.

```
PRIMARY

[ ] A — Accept as-is; record the default as a decision.
        Wording of the forbidden/permitted list in §6-A:  [ ] as written   [ ] amended (see notes)

[ ] B — Redraw with the tail oversampled.  *** VOIDS THE FREEZE — C3 authorisation ***
        Target n in the ≤400 stratum: ______   (34 → ±10 pts @ p≈0.9; 60 → ±10 @ p≈0.8)
        I acknowledge this invalidates: coverage-set-1.json + its 200-artwork core + its
        recorded checks + reviewer labels attached to it, the ladder manifest and sample,
        the exposure audit, the census sidecar, and ~25 written count claims.   [ ] yes

[ ] C — Keep the freeze; register an explicit machine-readable claim-scope exclusion.
        Enforcement level:  [ ] 1 declarative only   [ ] 1+2 (spec now, check later)   [ ] 3 checklist only

[ ] NULL — Leave unrecorded (status quo; third occurrence).

INDEPENDENT SUB-DECISIONS

[ ] Analysis unit for any future low-resolution statement:
       [ ] `stratum` (n=14 / 13 components)      [ ] `ownLongEdgeBand` (n=32 / 30 components)
       [ ] undecided — refer the "passenger" question (§2.4) to a separate review

[ ] Permit the one-sided floor claim ("all N passed; ≥X% at 95% confidence") under whichever
    option is chosen:   [ ] yes   [ ] no

[ ] Record in the decision that this default was applied twice without reviewer input:
       [ ] yes   [ ] no

NOTES / AMENDMENTS:
_______________________________________________________________________________
_______________________________________________________________________________
```

**If this is not decided:** the null option takes effect by inaction, for the third time. The operative risk is not abstract — `COVERAGE_SET.md:148` instructs that everything measured on the canonical bench be reported stratified by resolution tier, and the bench's ≤400 tier holds 53 artworks. When an end-of-campaign claim is drafted, the natural move is to produce the matching holdout table; its ≤400 row would be computed over 14 images, carry a ±20-point uncertainty nobody stated, and read exactly like the other three rows. Nothing in the repository would stop that today.

---

## Appendix — provenance of every number

| number | source | status |
|---|---|---|
| 8595 files, 4088 artworks, 2757 candidates, 1712 components | recomputed from `research/v3/data/holdout/measurements.jsonl`, `research/v3/data/source-surveys/pixel_results.json`, `research/v3/data/embeddings/near-dup-census.json` | verified by recomputation |
| full stratum table (91/93/13/14 etc.) | recomputed as above + `research/v3/data/holdout/holdout.json` | verified by recomputation; matches `HOLDOUT.md:104-110` exactly |
| working-set per-stratum remainders | recomputed | verified by recomputation |
| own-band tables (205/1247/1120/185; 32/183/169/29) | recomputed | verified by recomputation; held-out row matches `HOLDOUT.md:138-143` |
| 30 distinct components behind the 32 own-band ≤400 held-out artworks | recomputed from `holdout.json` `componentId` | verified by recomputation |
| 112 candidates riding up out of ≤400 | recomputed | verified by recomputation |
| whole-collection band table (421/1387/2079/201) | recomputed | verified by recomputation |
| filter losses in the ≤400 band (198 / 16 / 2) | recomputed | verified by recomputation |
| v1: 205 candidates, 31 held, 414 total | `git show 418e39d:research/v3/data/holdout/HOLDOUT.md:73-79` **and** recounted from `git show 418e39d:research/v3/data/holdout/holdout.json` | verified by recomputation from the git-recovered v1 artefact (v1 is not on disk, by design — `HOLDOUT.md:8`) |
| sharded corpus: 6906 artworks, 2273 ≤400 (32.91%) | recomputed from `research/v3/data/embeddings/sharded.dinov2-vitl14.ids.jsonl`, grouping 7550 measured files by 24-char artwork id, largest rendition per artwork | verified by recomputation; artwork count matches `COVERAGE_SET.md:23` |
| coverage-set universe 2442 ≤400 / 26.45%, core 53 / 26.5% | `research/v3/data/coverage-set/COVERAGE_SET.md:37` | as recorded; cross-checked by independent arithmetic to within 4 artworks — not byte-recomputed, because rebuilding the coverage set requires the k-means run |
| all Wilson intervals, min-n figures, rule-of-three | computed numerically from the formula in §3.1, z = 1.959964 | verified by recomputation |
| exposure 117 of 413 (28.3%) | `research/v3/data/embeddings/HOLDOUT_EXPOSURE.md:9` | as recorded; not recomputed (requires re-running the gallery render audit) |
| resolution floors ~241 px / ~441 px | `research/v3/PHASE_0_DECISIONS.md` §7 | as recorded; **and flagged provisional by loose end A1** (the ladder's codec-control noise floor was never populated) |
| consumer inventory in §5 | repository search; each path:line checked to exist | dependency facts, verified present; not recomputed quantities |

**Method note.** The recomputation is an independent reimplementation of `freeze-holdout.ts`'s candidate build and stratification (same rules: best rendition = largest measured pixel area, ties preferring the un-suffixed original then the lexicographically smallest path; square within \|w/h−1\| ≤ 0.05; long edge > 150 px; transparency exclusion by artwork id; union-find over census pairs where both endpoints are `music_artworks` candidates). It was **not** run by invoking the freeze script, and it wrote nothing to the repository. It reproduces every published count in `HOLDOUT.md` exactly, which is the evidence that the reimplementation is faithful. Held-out counts were read from the frozen `holdout.json` rather than re-drawn, so the seeded shuffle itself was not re-executed — the draw's reproducibility is separately asserted by `freeze-holdout.ts --verify`, which was **not** run here (it may rewrite the `measurements.jsonl` cache, and this analysis was required to modify no tracked file).
