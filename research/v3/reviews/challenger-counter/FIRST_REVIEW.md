# Challenger disagreement counter — first review

**Verdict: keep the deferred confirming round deferred. And re-arm the trigger — this population
could not have produced a disagreement.**

Governed by `PRE_REGISTRATION.md` in this directory, committed at `f47b25e` **before** the run.
Nothing below reinterprets it. Run artifacts: `data/contract/challenger-disagreements.json` (the
ledger, 492 entries) and `run-summary.json` (this directory — every number here comes from it).
Runner: `src/contract/run-legacy-challenger-counter.ts` (new file; no contract logic was modified).
Statistics: `src/stats/` throughout — no interval or rate here was hand-rolled.

---

## 1. The population actually run

| quantity | count |
|---|---|
| legacy fixture entries read | **554** (endorsements 351, acceptable 166, known-bad 37) |
| distinct `roleSignature` after de-duplication | **492** |
| palettes run | **492** (489 with four roles, 1 with three, 2 with one) |
| palettes judging **zero** pairs (excluded from every denominator) | **2** |
| palettes contributing to the rate | **490** |
| **judged pairs** (the unit of count) | **2,857** |
| role pairs exempted as an exact, flagged sanctioned collapse | 80 |
| gradient-stop pairs judged | **0** — the fixtures publish no v3 stops |
| artwork images decoded | **0** — no pair invariant needs pixels |

Nothing was skipped for unavailability. The images referenced by the fixtures were never needed:
invariant 2 is the only check that reads pixels, it is not a pair invariant, and it ran as
`deferred` throughout. The two single-role palettes judge no pairs and are in the ledger with a
`null` rate, per `queryLedger`'s rule that "never disagreed" and "nothing to disagree about" are not
the same statement.

De-duplication on `roleSignature` was pre-registered: 31 signatures appear in more than one fixture
tier, and the counter judges colours, not artworks.

---

## 2. Totals, and the region breakdown that must be read with them

### `direction-aware-oklab` — bar 0.02063

**0 disagreements out of 2,857 judged pairs.**

| region | judged pairs | share of exposure | disagreements | rate, Wilson 95% |
|---|---|---|---|---|
| `dark-neutral` — **the only region either bar was measured in** | 120 | 4.2% | **0** | 0.0% (0.0–**3.1%**) |
| `dark-saturated` — unmeasured | 320 | 11.2% | **0** | 0.0% (0.0–1.2%) |
| `light-neutral` — unmeasured | 925 | 32.4% | **0** | 0.0% (0.0–0.4%) |
| `light-saturated` — unmeasured | 1,492 | 52.2% | **0** | 0.0% (0.0–0.3%) |
| **pooled** | **2,857** | 100% | **0** | 0.0% (0.0–0.1%) |

### `ictcp-global` — bar 0.01026

**0 disagreements out of 2,857 judged pairs.** The per-region table is identical, cell for cell.

### Directional split

`challengerSaysSameIncumbentDistinct = 0` and `incumbentSaysSameChallengerDistinct = 0`, for both
challengers. The dangerous direction — collisions the contract would ship silently — is zero because
*every* direction is zero, not because it was separately examined and found clean.

### The interval that respects the clustering

Six pairs from one palette share four colours, so the pooled Wilson interval above is the
naive-independence comparison, reported as such. The pre-registered primary interval is a cluster
percentile bootstrap resampling **whole palettes** (`clusterBootstrapCI`, 10,000 resamples, seed
20260804, 490 palettes): **0.0000, 95% CI 0.0000–0.0000**. With zero events in every cluster the
bootstrap is degenerate by construction, which is the honest reading of a zero count and not a
tight measurement.

> **The region caveat, restated where it cannot be missed:** both challenger bars were measured in
> `dark-neutral` alone and applied globally. `dark-neutral` carries **4.2%** of this run's exposure
> — 120 of 2,857 judged pairs — and its interval reaches **3.1%**. Ninety-six percent of the
> evidence above is from regions where a disagreement would have been a difference between two
> rules, not evidence about the frozen bar. This run is nearly silent about the one region anybody
> measured.

---

## 3. The instrument was working

A zero has one reading that has to be excluded before any other is offered: the counter silently
counting nothing. The identical code path was run over the palette
`tests/contract-challengers.test.ts` builds to make the challengers disagree — field roles `#202020`
and `#232323`, two dark-neutral greys the frozen bar calls distinct and the direction-aware bar calls
one colour. It produced **1 disagreement out of 6 judged pairs for each challenger, in
`dark-neutral`**, through this runner, on this run. It is not in the ledger; it is not a legacy
palette.

So the zero is a property of the population, not of the wiring.

---

## 4. Why the population produced zero — the distance structure

| statistic over the 2,857 judged pairs | value |
|---|---|
| minimum OKLab distance ÷ its regional bar | **1.30×** |
| 1st percentile | 4.13× |
| 5th percentile | 6.19× |
| median | 19.5× |
| judged pairs below **2×** the bar | **1** |
| judged pairs below 3× | 4 |
| judged pairs below 5× | 64 |

The single closest judged pair in the entire population — `#fa7b34` against `#fc8831`, in
`light-saturated` — sits at OKLab distance 0.0297 against a 0.02293 bar. Its direction-aware distance
is 0.0580 (bar 0.02063) and its ICtCp distance is 0.0189 (bar 0.01026). All three rules call it
distinct, with room to spare, and it is the *nearest miss there is*.

The legacy palettes are bimodal by construction: a role pair is either **exactly equal** — 80 pairs,
all of them sanctioned collapses, exempt and therefore not judgments — or it is far away. There is
essentially no mass in the band between 0.00932 and 0.02063 where the frozen bar and the
direction-aware bar can possibly return different answers.

---

## 5. The pre-registered rule, applied mechanically

Per challenger, verbatim from `PRE_REGISTRATION.md` §4:

| clause | `direction-aware-oklab` | `ictcp-global` |
|---|---|---|
| **H1** — pooled rate ≥ 0.10 | 0.0000 → **false** | 0.0000 → **false** |
| **H2** — cluster-bootstrap 95% lower ≥ 0.05 | 0.0000 → **false** | 0.0000 → **false** |
| **HIGH** | **false** | **false** |
| **C-region** — top region ≥ 0.60 of disagreements at < 0.40 of exposure | no disagreements → **false** | **false** |
| **C-palette** — top decile of palettes (49 of 490) holds ≥ 0.50 of disagreements | 0 of 0; share undefined → **false** | **false** |
| **CONCENTRATED** | **false** | **false** |
| **VERDICT** | **keep the round deferred** | **keep the round deferred** |

Neither challenger is HIGH, so `HIGH ∧ CONCENTRATED` fails for both.

**Verdict: keep the deferred confirming round deferred. Do not propose it to the reviewer on this
evidence.**

### Where the rule fits the result awkwardly, said plainly

The rule was written to separate a **high, concentrated** rate from a **low or evenly smeared** one.
The result is neither: it is **empty**. The pre-registration's low-rate branch reads *"the frozen
scalar does no harm where it actually gets used"* — and this run does **not** establish that. It
establishes something weaker and different: **in this population the frozen scalar was never used
anywhere near its own edge.** A rule cannot be shown harmless in a regime that never occurred.

The rule stays exactly where it was. It returns "keep deferred", which is also the right operational
answer — there is no evidence here that would price a round. But the *reason* is the population, not
the bar, and the two must not be conflated later.

The C-palette clause is likewise vacuous here (0 disagreements spread over 0 palettes). That was
declared in advance as an accepted degeneracy at low rates, and it is not patched now.

---

## 6. What this run does not show

- **It does not discharge the handoff's trigger in substance.** `PHASE_1_HANDOFF.md` §5(b) says
  *"once a real corpus run has populated that file"*. The file is now populated, by 492 real
  reviewer-seen palettes — but by a population whose pairs never approach an identity bar. **The
  counter should be read again after the first genuine v3 corpus run**, and the trigger treated as
  re-armed rather than spent.
- **It says nothing about v3's pair mix.** The fixtures carry a gradient *boolean*, never a v3 stop
  list, so **not one stop pair was judged**. A v3 palette publishes 2–4 stops, and stop-to-stop and
  role-to-stop pairs are precisely where near-identity lives — a degenerate ramp is the canonical
  case invariant 3 exists for. This run under-samples the near-identical regime the challengers
  dispute, in the direction that understates disagreement.
- **It is not evidence that the three rules agree.** The positive control shows they differ on a pair
  that sits between the bars. It is evidence that *these* palettes contain no such pair.
- **It says nearly nothing about `dark-neutral`**, the only region either challenger bar was measured
  in: 120 judged pairs, interval to 3.1%.
- **A disagreement outside `dark-neutral` would have been a difference between two rules**, not
  evidence that the frozen bar is wrong there. That holds for 96% of this run's exposure, and it
  would have held for any non-zero cell in §2.
- **The population is not a sample of any corpus.** These are palettes that were shown to a reviewer
  in v2-3 A/B rounds and graded; selection ran through what got reviewed, and the palettes were
  produced by the previous era's algorithm under the previous era's role semantics.
- **It cannot move any bar, threshold, or constant.** Not the frozen `SAME_COLOR_BAR_BY_REGION`, not
  either challenger bar, not the provisional adoption of the direction-aware shape. Its only output
  is the recommendation in §5, and the reviewer decides.
