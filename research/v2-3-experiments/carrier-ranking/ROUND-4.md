# Round 4 — the coverage domination guard: no valley, no mechanism

Continues `EXPERIMENT.md`, `ROUND-2.md` and `ROUND-3.md`, from trunk `9983a1e`. Corpus custody
unchanged: shared checkout `/Users/Flo/GitHub/palette/`, full resolution, `VIPS_CONCURRENCY=1`, at
most two extraction processes. The verification set is now **161 artworks** — it keeps growing as
the live warehouse gains verdicts (141 at round 3, 151 mid-round-3, 161 now).

**Nothing is built and nothing ships.** The W-arm rule fires: there is no valley, and the
counterexample that kills it is one of the two hard guardrails the round was given. The `skap` rule
is untouched and still OFF; its four-pair batch is unaffected by anything here.

---

## K0. Two results, either of which is sufficient to stop

1. **A coverage domination guard cannot deliver `0cd48f` at trunk** — not "does not", *cannot*. §K1.
2. **No monotone rule in coverage separates "maximiser wrongly discarded" from "correctly
   discarded".** The blocking pair is `havana.jpg` (must protect) against **`0d5cdb` (must not —
   it is the hard guardrail)**, and `0d5cdb` is *more* extreme on **every** feature. §K2.

---

## K1. The guard cannot reach `0cd48f`, for a structural reason

The round-3 brief and my own report framed this as "the teal's 1.0000 coverage against the
frontier's 0.29–0.48 makes it undominatable". That is true and it is not enough.

```
const frontier = evaluations.filter(({ paretoMember }) => paretoMember).sort(compare)
const winner = frontier[0]
```

`evaluations` is already `compare`-sorted, so the frontier is the compare-ordered Pareto subset and
the winner is its **top by compare order**. Surviving domination therefore moves a candidate *onto*
the frontier; it cannot move it *past* a Pareto member that already outranks it.

At trunk, `0cd48f` is not a divergence at all (`data/sweep-trunk9983.tsv`, flag `top-is-winner`):

| | palette | `relationUtility` | pareto |
|---|---|---|---|
| compare #1 **and** frontier[0] | `#ffffff #ffffff #201f41 #b7f07d` (navy) | 0.80853 | **true** |
| endorsed teal | `#ffffff #ffffff #a7dbd9 #bdf369` | 0.78093 | false |

The navy is both the objective maximiser **and** already a Pareto member. Flipping the teal's
`paretoMember` to `true` changes nothing: it is 0.0276 behind in compare order — **5.5 utility
levels** at `utilityResolution` 0.005 — so `frontier[0]` stays the navy.

The pruning stage only became `0cd48f`'s blocker in round 2's rejected `FOREGROUND_CONTRAST_SCALE = 9`
configuration, where the teal *was* the maximiser. Delivering this artwork needs **both** a change
that makes the teal the objective maximiser *and* a domination guard so it is not then pruned. The
first half is the one round 2 could not find honestly, and it regressed `0d5cdb`.

**Acceptance target 2 is not reachable by the round-4 mechanism.** I record this before the valley
analysis because it stands on its own.

---

## K2. The valley: measured, and it does not exist

`sweep-valley.ts` records, for every artwork where the objective maximiser is pruned, both sides'
identity quantities and the latest verdict, so the two classes can be separated on numbers rather
than on narrative (`data/valley.json`).

| | count |
|---|---|
| artworks | 161 |
| divergences (maximiser pruned) | 20 |
| of those, carrying a verdict | 16 |
| **wrongly** discarded (endorsed **is** the pruned maximiser) → a guard must protect | **3** |
| **correctly** discarded (endorsed **is** the published winner) → a guard must not protect | **12** |
| endorsed is neither | 1 |

### K2.1 Every candidate feature overlaps

`analyse-valley.ts`, each feature's range over the two classes:

| feature | must-protect | must-not-protect | |
|---|---|---|---|
| maximiser coverage | 0.8571 … 0.9048 | 0.5714 … **1.0000** | overlaps |
| coverage gap (max − win) | 0.2857 … 0.7143 | 0.0000 … **0.7143** | overlaps |
| coverage ratio | 1.5000 … 4.7500 | 1.0000 … 3.7419 | overlaps |
| maximiser authorized gain | 0.0076 … 0.0114 | 0.0000 … 0.0229 | overlaps |
| authorized gap | −0.0114 … 0.0000 | −0.0131 … 0.0000 | overlaps |
| maximiser gamut coverage | 0.6178 … 0.9472 | 0.0000 … 1.0000 | overlaps |
| objective given up | 0.0049 … 0.0236 | −0.0003 … 0.0298 | overlaps |
| credited roles | 2 … 2 | 1 … 3 | overlaps |

Two entries are worth naming. **Coverage completeness is not the signal**: three
*correctly*-discarded maximisers have `identityCoverage` exactly **1.0000**. And the coverage gap's
maximum is **0.7143 in both classes** — `slim.jpg` (must protect) ties exactly with
`…0011c0148119` and `…001102263870` (must not).

### K2.2 The blocking pair, which is stronger than overlap

Overlapping ranges leave room for a rule using several features at once. `analyse-dominance.ts` asks
the sharper question: is there a must-not-protect case that is **at least as extreme on every
feature** as a must-protect case? If so, no monotone rule in those features can separate them.

There are two, and the first is decisive:

**Blocking pair 1 — `havana.jpg` (must protect, `strong`) vs `0d5cdb` (must NOT protect, `strong`):**

| feature | `havana` — protect | `0d5cdb` — do **not** protect |
|---|---|---|
| maximiser coverage | 0.8571 | **0.9286** |
| coverage gap | 0.2857 | **0.3571** |
| coverage ratio | 1.5000 | **1.6250** |
| objective given up | 0.0105 | **0.0141** |

`0d5cdb` is more extreme on **all four**. Its pruned maximiser is
`#000000 #000000 #c7c6c1 #f22632` — **the grey foreground batch 28 rejected**, pruned in favour of
`#f7de67`, the gold it endorsed. So:

> **Any monotone rule that protects `havana`'s endorsed maximiser also protects `0d5cdb`'s grey, and
> protecting `0d5cdb`'s grey reverts the batch-28 gold — the hard guardrail this round was given.**

Blocking pair 2 is `havana` against `…0011c0148119` (`acceptable`), which is more extreme still
(coverage 1.0000, gap 0.7143, ratio 3.5000, given up 0.0223).

### K2.3 And the one escape route is a fitted threshold

`slim` is not in a blocking pair: its coverage *ratio* is 4.7500, above every must-not-protect case
(the highest is `johns` at 3.7419, then 3.5000). So a ratio rule with a threshold in (3.7419, 4.7500)
would deliver `slim` while preserving `0d5cdb` and `johns`.

I am not proposing it, for three reasons and any one is enough:

- It is a **threshold picked from the gap between two adjacent observations**, with **n = 1** on the
  protect side. That is the fitted-threshold move the charter forbids and that this arm has already
  called out twice in its own work.
- It serves **one of the three** must-protect cases. `havana` (1.5000) and `…000e91d6` (1.5000) sit
  *below* `0d5cdb` (1.6250), so no ratio rule reaches them without reverting the gold.
- A ratio is undefined-ish where the winner's coverage is near zero, and two must-not-protect cases
  sit at 0.2214 and 0.2316 — the statistic is least stable exactly where it would be doing the work.

---

## K3. Interaction with the `skap` rule, reported jointly as required

Both mechanisms read `identityCoverage`, so they are reported together even though only one was ever
built.

- **`skap` is untouched and still OFF** on this branch (`IDENTITY_COVERAGE_DIRECTIONS =
  "count-every-credit"`, pinned in `configuration.test.ts`). Its four-pair batch is unaffected by
  round 4.
- **The two do not interact on the pruning statistic.** Round 3 measured the divergence count with
  `skap` enabled: **18 before, 18 after** — the rule changes no artwork's prune/no-prune status.
- **They would interact if the guard existed**, and in the direction that makes the guard harder:
  `skap` *lowers* coverage for palettes that spend two roles on one hue, which changes exactly the
  numbers a coverage guard would threshold on. Any future attempt at this guard must be measured
  against both settings of `skap`, not one.
- **`skap` does not rescue the valley.** It cannot: the blocking pair is `havana` vs `0d5cdb`, and
  neither of those four palettes spends two roles on one hue (round 3 §J2.2 measured `0d5cdb`
  unchanged under the rule).

---

## K4. Verification

No mechanism was built, so there is nothing to sweep for regressions. The branch state is unchanged
from round 3:

| check | result |
|---|---|
| runtime diff vs `9983a1e` | two files, both behaviour-neutral at the shipped settings (round 2's rename; round 3's `skap`, off) |
| `IDENTITY_COVERAGE_DIRECTIONS` | `"count-every-credit"` — untouched, as instructed |
| typecheck, architecture + configuration tests | pass (unchanged from round 3) |
| 141/141 byte-parity with trunk | established in round 3 §J5 and not disturbed |

The round-4 artefacts are diagnostic only: `sweep-valley.ts`, `analyse-valley.ts`,
`analyse-dominance.ts`, `data/valley.json`.

---

## K5. Honest self-assessment

**What I am confident in.** K1 is a structural argument about six lines of code plus two measured
numbers, and it does not depend on the valley result at all. K2.2 is a dominance argument, not a
threshold search: it does not say "I could not find a rule", it says a rule of that shape cannot
exist while `0d5cdb` is a guardrail. That is the strongest form of negative this arm has produced.

**What I am not.**

- **n = 3 on the must-protect side.** The valley might exist and be invisible at this sample size,
  and the classes are defined by *which side the endorsement landed on*, which is a coarse proxy —
  `…0002dc28` is `strong` with the endorsement on neither side, and I simply excluded it.
- **I only tested features already computed.** The coordinator asked for "something else already
  computed", and I swept eight such quantities; I did not go looking for a new one, because a new
  quantity would need its own derivation and this round's instruction was valley-first.
- **The ratio escape is real and I rejected it on principle, not on measurement.** If review decides
  a one-case rule is acceptable to recover `slim`, the number is there. I do not think it should be,
  and I would rather say so than bury it.
- **I have now spent four rounds without delivering either mandated case**, and the honest summary
  is that both are blocked outside the ranking layer I was asked to work in: `0cd48f` needs the
  objective changed *and* the pruning changed; `03e50500` needs the accent lane to retain a family
  it currently does not.

---

## K6. Proposed review items

**None from round 4.** No mechanism was built, so no real A/B pair exists, and this round produced
questions rather than palettes — which is exactly what round 3's instruction said not to spend
review slots on.

The four `skap` pairs from round 3 §J7 stand unchanged and are the only thing this arm has pending.

The one thing round 4 changes about the *future* review load: **if the pruning stage is ever
revisited, `0d5cdb` and `havana.jpg` should be shown as a pair to the same reviewer**, because they
are the two artworks whose correct answers pull the guard in opposite directions, and a single
judgement about "should a much-higher-coverage maximiser beat a narrowly-better-quality winner"
would settle both at once. That is a review *design* note, not a request for a slot now.
