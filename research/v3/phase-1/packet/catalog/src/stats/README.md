<!-- Phase 1 author packet — provenance
     source: research/v3/src/stats/README.md
     commit: 71a1d62d51006dd8f353e8c0bc6e4434bdb0c4b2
     date:   2026-08-04
     This file is a verbatim copy of the source above, assembled for a Phase 1 author packet.
-->

# Shared statistics

One place where the statistics are written correctly, so that the mistakes the Phase 0 adversarial
review kept finding are **structurally hard rather than merely discouraged**.

The review's own framing (`reviews/toolbox-review/gap-scan.md` §3(5), tier MUST) is the brief:

> Design principle that matters more than the function list: **make the errors unrepresentable, not
> merely avoidable.**

## Status and provenance

Built 2026-08-04 against **`TB-08`** of `reviews/toolbox-review/adjudication-items.json` — *"One
shared statistics module, built so the common mistakes cannot be typed"* — whose evidence is
gap-scan §3(5)'s table of **ten distinct error classes, each of which changed or would have changed
a published conclusion**.

**The reviewer's verdict exists: BUILD.** It is item 11 of
`reviews/toolbox-review/chat-adjudication-map.md` — *"shared stats module | BUILD | "build""* — a
ruling in chat, not an unanswered round. This paragraph previously read *"No reviewer verdict exists
yet"* on the strength of the warehouse holding zero answers for round `toolbox-adjudication-1`
(pushed 2026-08-04T07:30:52Z); that was the wrong place to look, since the adjudication came through
the chat map rather than the labelling warehouse. `TB-08`'s `recommendation: "build-now"` is still
only the orchestrator's call — but it now agrees with the reviewer's. Anything here the reviewer
later disagrees with is still a thing to change.

## The surface

| want | use | what it will not let you do |
|---|---|---|
| agreement | `bucketedAgreement` | print one pooled rate where three buckets exist |
| chance-corrected agreement | `cohensKappa` | get a number below n=10 |
| proportion vs a null | `exactBinomialTest` | run one-sided without naming the prereg; count repeats as units |
| interval on a proportion | `wilsonInterval` | report a rate with no denominator |
| 2×2 association | `fisherExact2x2` | run it on paired data; transpose the table unnoticed |
| paired comparison | `mcnemarExact` | report the pairs compared as if they were the n |
| more than one comparison | `sweepThenTest` | report the best cell of many silently |
| a fit or a threshold | `fitWithDeclaredSupport` | fit to a sample its own variable truncated |
| spread of any statistic | `bootstrapCI`, `clusterBootstrapCI` | resample clustered data as if it were independent |

Files: `types.ts` (provenance and refusals), `numeric.ts` (log-gamma, probit, seeded RNG,
quantiles), then one file per statistic. `index.ts` is the import surface. `stats.py` is the Python
mirror.

## The two rules everything else follows from

**1. No function returns a bare `number`.** Every result carries a `Provenance` — method, n,
corrections applied, caveats — and `honestLine(result)` renders it. An analysis that prints through
`honestLine` cannot emit the headline while dropping the family size or the truncation note, because
the same object carries all of them.

**2. A statistic that should not be computed is a *type*, not a value.** `Refused` has no numeric
field. `cohensKappa` below n=10 returns a shape with **no `kappa` property at all**, so a caller
must handle the refusal to get past it — while `rawAgreement`, which is meaningful at n=3, stays
available on both branches. There is no sentinel, no `NaN`, no `-1`.

## What each guard is defending against

Each of these is a defect the review measured, not a hypothetical. `tests/stats-adversarial.test.ts`
reproduces every one.

- **The uncorrected sweep.** A rejected hypothesis was corrected over a 364-rule grid (p 0.2927)
  while the rule that *replaced* it got a raw one-sided binomial of 0.0172 — same 43 items, no
  correction. `sweepThenTest` requires `comparisonsRun`, refuses a family smaller than the cells
  handed over, refuses `correction: "none"` without a written justification, and puts "best of 364"
  in the summary line. Holm over that family takes 0.0172 to 1.0.
- **Kappa below the floor.** `MIN_KAPPA_N = 10`, [REVIEWED], inherited from
  `analyze-bcde-validation.ts`. The three refusal strings are exported constants because they are
  published text — they appear 128 times in `data/oracle-validation/bcde-validation-1-analysis.json`.
- **The truncated-sample fit** (round 3). A threshold fitted to a sample selected *by the
  threshold's own variable* measures where the sample was cut. `SampleSupport` requires a
  `selectionRelationToVariable`, and it is a four-way union with no "probably fine" member. It
  separates the fatal `selected-on-the-outcome` from the survivable
  `left-truncated-at-a-run-floor` — and the latter *requires* the sensitivity check that makes it
  survivable, which is what round 3b actually supplied.
- **Pseudo-replication.** 24 of 120 "points" were byte-identical repeats; dropping them moved two
  frozen constants by >10%. `exactBinomialTest` cannot be called without saying whether the trials
  are distinct units, and `clusterBootstrapCI` resamples the unit of independence rather than the
  unit of observation — the belongs study's fix, generalised.
- **No paired test where one was needed.** Two arms on the same 24,648 pairs, compared unpaired;
  McNemar collapsed the ranking to p=0.816. `fisherExact2x2` requires `pairing` and refuses
  `"paired"` by name, pointing at `mcnemarExact`, whose n is the discordant count.
- **Vacuous guards over empty input.** `canary_stable: true` over zero rows. Nothing here returns a
  passing verdict on an empty sample.
- **Divergent spellings of the same interval.** Wilson existed three times with two different values
  of z. Now once, with the precise z.

## Running it

```sh
# TypeScript
NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/v3/tests/stats-*.test.ts

# Python mirror
python3 research/v3/src/stats/stats.py --selftest
```

The TypeScript tests check the arithmetic two ways: golden values from R and SciPy, and **BigInt
oracles** that recompute the exact binomial and Fisher p-values in integer arithmetic, sharing no
code and no numerical strategy with the implementation. A Lanczos coefficient typo cannot survive
those.

## The Python mirror

`stats.py` is deliberately thin — the inference surface only, stdlib only. It exists because the
gap-scan made it a condition: *"Whatever module gets built has to serve both languages or the Python
analyses will keep re-rolling their own."* They already had. An audit of `oracle/` on 2026-08-04
found nine hand-rolled statistical implementations, six of them duplicates, and two that had already
drifted — the two copies of `binom_tail` differ in precision, and a rounding defect documented and
fixed in one copy was never fixed in its twin. `stats.py` needs no scipy, because `embeddings/` is
the venv without it and also the one carrying the most sophisticated hand-rolled inference.

`--selftest` cross-checks 31 values against the same goldens the TypeScript tests use, so the two
implementations cannot drift apart silently.

## Migrations

Two committed analyzers were migrated as proof, both reproducing their published outputs exactly.
See `tests/stats-migration.test.ts`, which reads the committed round-3 artifact and recomputes every
statistic in it.

- `src/review-server/analyze-bcde-validation.ts` — `cohenKappa` now delegates to `cohensKappa`. The
  function survives as an adapter to the published `{ kappa, n, raw, reason }` shape, since that
  shape is embedded in a committed artifact. Re-running the analyzer produced a JSON
  **byte-identical apart from its `generatedAt` timestamp** (8,439 lines, 342 kappa mentions).
- `data/calibration/analyze-bracketing-round-3.ts` — its hand-rolled log-factorial, binomial pmf,
  tail-doubling test and Wilson interval are gone. Two licensed differences, both proved inert by
  test: the general two-sided rule replaces tail-doubling (identical at p=0.5, which is why the old
  code was right *here* and would not have been elsewhere), and the Wilson interval now clamps to
  [0, 1] (unreachable on the bounds the pre-registered cut search reads).

## If you are adding a statistic

Match the two rules. Return a result object with a `Provenance` and a `summary`; make the refusal a
type with no numeric field; put anything a caller must think about into a **required** field with no
default, and prefer a union with no innocuous member over a boolean. Name every constant with a
provenance tag per `CONVENTIONS.md`. Add the adversarial case to
`tests/stats-adversarial.test.ts` — the point of that file is that each entry is a real defect
someone actually shipped.
