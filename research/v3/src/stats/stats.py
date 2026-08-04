#!/usr/bin/env python3
"""Thin Python mirror of research/v3/src/stats/ (TypeScript).

WHY THIS FILE EXISTS. The Phase 0 adversarial review's constraint on the shared statistics module
was explicit (`reviews/toolbox-review/gap-scan.md`, lines 111-118): *"there is no stats library on
either side ... Whatever module gets built has to serve both languages or the Python analyses will
keep re-rolling their own -- which is how the ten findings in section 3(5) happened."*

They had already re-rolled. An audit of `oracle/` on 2026-08-04 found nine distinct hand-rolled
statistical implementations across the Python analyzers, six of them literal or near-literal
duplicates, and two that had already drifted apart with numerical consequences:

  * `binom_tail` is copy-pasted in `premise/analyze_cascade_ground_truth.py` and
    `premise/analyze_b_unmapped_class.py`. The second coerces its result through
    `float(f"{...:.3g}")` and the first does not, so the same input gives different precision.
  * `analyze_b_unmapped_class.py` carries a comment recording a defect that was fixed in one copy
    only: rounding a parameter before a tail probability moved `2.34e-07` to `2.33e-07`.
  * Cohen's kappa exists three times (`analyze.py` as a function, `analyze.py` again inline over
    marginals, `analyze_bcde.py`), and Wilson exists in Python once and in TypeScript twice with
    two different values of z.

SCOPE. Deliberately thin. This mirrors the *inference* surface only -- the statistics whose
mistakes the review measured. It does not mirror k-means, the embedding maths, or the summary
helpers: those are not inference and belong where they are.

STDLIB ONLY, ON PURPOSE. `premise/.venv` and `sam/.venv` have scipy; `embeddings/.venv` does not,
and `embeddings/` is where the most sophisticated hand-rolled inference lives (McNemar, an exact
sign test in log space). A mirror that needed scipy would not reach the file that needs it most.
Every function here is checked against the TypeScript module's golden values by `--selftest`.

THE HOUSE RULES THIS ENFORCES, same as the TypeScript:
  * agreement is bucketed (agreement / disagreement / cant_tell) and both denominators are always
    reported -- there is no function returning one pooled rate;
  * Cohen's kappa refuses below n=10 and returns a Refusal, never a number;
  * a sweep cannot be scored without declaring how many comparisons were run;
  * one-sided tests carry the reference where their direction was fixed in advance;
  * nothing returns a bare float: every result carries its own provenance.

    python3 research/v3/src/stats/stats.py --selftest

Exit codes: 0 done, 1 unexpected.
"""

from __future__ import annotations

import math
import sys
from dataclasses import dataclass, field
from typing import Literal, Sequence

# ---------------------------------------------------------------- provenance

Correction = Literal["bonferroni", "holm", "benjamini-hochberg", "none"]


@dataclass(frozen=True)
class Provenance:
    """The facts a reader needs in order to know what a number is worth.

    Filled in by the function that computed the statistic, never by the caller, so it cannot drift
    away from what was actually done. No timestamp: these results are golden-compared in tests.
    """

    method: str  # precise enough to re-implement from
    n: int  # the n actually computed on, after every exclusion
    inputs: dict[str, float | int | str | bool] = field(default_factory=dict)
    corrections: tuple[str, ...] = ()  # empty means none were applied, which is a claim
    caveats: tuple[str, ...] = ()  # anything that weakens the number


@dataclass(frozen=True)
class Refusal:
    """A statistic that was asked for and deliberately not produced.

    The point is the absence: there is no numeric field to reach for. Python cannot enforce that
    the way TypeScript's discriminated union does, so callers should branch on `ok` -- and every
    consumer in this repo does, because `honest_line` works on both shapes.
    """

    reason: str
    detail: str
    provenance: Provenance
    ok: Literal[False] = False

    @property
    def summary(self) -> str:
        return self.detail


def honest_line(result: object) -> str:
    """Render any result as one line: what was computed, on what n, with what corrections."""
    summary = getattr(result, "summary", "")
    prov: Provenance = getattr(result, "provenance")
    parts = [summary, f"n={prov.n}", prov.method]
    parts.extend(prov.corrections)
    parts.extend(f"CAVEAT: {caveat}" for caveat in prov.caveats)
    return " | ".join(part for part in parts if part)


# ---------------------------------------------------------------- numeric primitives


def log_choose(n: int, k: int) -> float:
    """Natural log of n-choose-k. Returns -inf outside 0 <= k <= n, so a pmf there is 0."""
    if k < 0 or k > n:
        return -math.inf
    return math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)


def binomial_pmf(k: int, n: int, p: float) -> float:
    """P(X = k) for X ~ Binomial(n, p), computed in logs so large n does not overflow."""
    if k < 0 or k > n:
        return 0.0
    if p == 0.0:
        return 1.0 if k == 0 else 0.0
    if p == 1.0:
        return 1.0 if k == n else 0.0
    return math.exp(log_choose(n, k) + k * math.log(p) + (n - k) * math.log1p(-p))


def _stable_sum(values: Sequence[float]) -> float:
    """Sum smallest-magnitude first, so hundreds of very unequal probabilities stay stable."""
    return math.fsum(values)


def probit(p: float) -> float:
    """Inverse standard normal CDF, via the stdlib's own implementation."""
    if not 0.0 < p < 1.0:
        raise ValueError(f"probit expects 0 < p < 1, got {p}")
    return _NORMAL.inv_cdf(p)


def z_for(confidence: float) -> float:
    """Two-sided normal critical value for a CONFIDENCE LEVEL (0.95), never an alpha (0.05).

    The direction of every historical mix-up in the reviewed analyzers was passing an alpha where a
    confidence belonged, which produces a plausible-looking and badly wrong interval rather than an
    error. Anything below 0.5 is refused for that reason.
    """
    if not 0.0 < confidence < 1.0:
        raise ValueError(f"z_for expects 0 < confidence < 1, got {confidence}")
    if confidence < 0.5:
        raise ValueError(
            f"z_for was given {confidence}, which is below 0.5 and is almost certainly an alpha. "
            "Pass the confidence level: 0.95 for a 95% interval."
        )
    return probit(1.0 - (1.0 - confidence) / 2.0)


try:  # `statistics.NormalDist` is stdlib from 3.8; the guard keeps the failure legible.
    from statistics import NormalDist

    _NORMAL = NormalDist()
except ImportError as error:  # pragma: no cover
    raise SystemExit(f"stats.py needs statistics.NormalDist: {error}")


# ---------------------------------------------------------------- exact binomial + Wilson

# Relative slack when deciding which outcomes are "at least as extreme" as the observed one.
# [INHERITED] R's binom.test uses 1e-7; matching it keeps two-sided p-values equal to R, SciPy and
# the TypeScript module digit for digit.
EXTREMENESS_RELATIVE_SLACK = 1e-7


@dataclass(frozen=True)
class BinomialTest:
    successes: int
    trials: int
    null_probability: float
    alternative: str
    observed_rate: float
    p_value: float
    provenance: Provenance
    ok: Literal[True] = True

    @property
    def summary(self) -> str:
        return (
            f"{self.successes}/{self.trials} ({self.observed_rate * 100:.1f}%) "
            f"vs null p={self.null_probability}: p={format_p(self.p_value)}"
        )


def exact_binomial_test(
    successes: int,
    trials: int,
    null_probability: float,
    alternative: Literal["two-sided", "greater", "less"],
    *,
    direction_fixed_in_advance: str | None = None,
    trials_are_distinct_units: bool = True,
    distinct_units: int | None = None,
) -> BinomialTest | Refusal:
    """The exact binomial test.

    Two-sided is the method of small p-values: the total probability of every outcome no more likely
    than the one observed. That is R's and SciPy's definition. Note it is NOT the same as doubling
    the smaller tail except when `null_probability` is exactly 0.5 -- the symmetric case, where the
    two coincide. Several analyzers in this repo doubled the tail; they were right only because
    their null was 0.5, and this function is right at any null.

    `direction_fixed_in_advance` is REQUIRED for a one-sided test. A one-sided p-value chosen after
    seeing which way the counts fell is half of a two-sided p-value with none of the protection.
    """
    if successes < 0 or trials < 0 or successes > trials:
        raise ValueError(f"expects 0 <= successes <= trials, got {successes}/{trials}")
    if not 0.0 <= null_probability <= 1.0:
        raise ValueError(f"expects 0 <= null_probability <= 1, got {null_probability}")
    if alternative != "two-sided" and not direction_fixed_in_advance:
        raise ValueError(
            "a one-sided exact binomial needs direction_fixed_in_advance: a pointer to where the "
            "direction was fixed before the data (a prereg section, a decision record id)."
        )
    if not trials_are_distinct_units and distinct_units is None:
        raise ValueError(
            "trials_are_distinct_units=False needs distinct_units: how many distinct things the "
            "trials actually came from. Counting repeats as independent observations moved two "
            "frozen constants by more than 10% in the review's pseudo-replication finding."
        )

    suffix = " by the method of small p-values" if alternative == "two-sided" else ""
    method = f"exact binomial, {alternative}{suffix}, null p={null_probability}"
    inputs: dict[str, float | int | str | bool] = {
        "successes": successes,
        "trials": trials,
        "nullProbability": null_probability,
        "alternative": alternative,
        "distinctUnits": trials if trials_are_distinct_units else int(distinct_units or 0),
    }

    if trials == 0:
        return Refusal(
            "no-trials",
            "Exact binomial test not computed: zero trials. A p-value on an empty sample is not a "
            "weak result, it is not a result.",
            Provenance(method, 0, inputs),
        )

    if alternative == "greater":
        p_value = _stable_sum([binomial_pmf(i, trials, null_probability) for i in range(successes, trials + 1)])
    elif alternative == "less":
        p_value = _stable_sum([binomial_pmf(i, trials, null_probability) for i in range(0, successes + 1)])
    else:
        p_value = _two_sided(successes, trials, null_probability)
    p_value = min(1.0, max(0.0, p_value))

    caveats: list[str] = []
    if alternative != "two-sided":
        caveats.append(
            f"one-sided p-value; direction fixed in advance per: {direction_fixed_in_advance}. "
            "If that reference does not predate the data, this number is not a one-sided test."
        )
        inputs["directionFixedInAdvance"] = str(direction_fixed_in_advance)
    if not trials_are_distinct_units:
        caveats.append(
            f"PSEUDO-REPLICATION: {trials} trials come from only {distinct_units} distinct units. "
            "The exact test assumes independent trials, so this p-value is smaller than the "
            "evidence supports."
        )

    return BinomialTest(
        successes=successes,
        trials=trials,
        null_probability=null_probability,
        alternative=alternative,
        observed_rate=successes / trials,
        p_value=p_value,
        provenance=Provenance(method, trials, inputs, (), tuple(caveats)),
    )


def _two_sided(k: int, n: int, p: float) -> float:
    if p == 0.0:
        return 1.0 if k == 0 else 0.0
    if p == 1.0:
        return 1.0 if k == n else 0.0
    observed = binomial_pmf(k, n, p)
    threshold = observed * (1.0 + EXTREMENESS_RELATIVE_SLACK)
    return _stable_sum(
        [mass for mass in (binomial_pmf(i, n, p) for i in range(0, n + 1)) if mass <= threshold]
    )


@dataclass(frozen=True)
class WilsonInterval:
    successes: int
    trials: int
    rate: float
    low: float
    high: float
    confidence: float
    provenance: Provenance
    ok: Literal[True] = True

    @property
    def summary(self) -> str:
        return (
            f"{self.successes}/{self.trials} = {self.rate * 100:.1f}% "
            f"({self.confidence * 100:.0f}% CI {self.low * 100:.1f}%-{self.high * 100:.1f}%)"
        )


def wilson_interval(successes: int, trials: int, confidence: float = 0.95) -> WilsonInterval | Refusal:
    """Wilson score interval for a proportion.

    Wilson rather than Wald because Wald on 9-of-9 is [1.00, 1.00] -- a claim of certainty produced
    by a formula that has run out of road -- and every round in this project has denominators in
    that range. `ladder/analyze.py` already reasoned this way; this is that function, with the
    precise z rather than 1.96 so it agrees with the TypeScript module and with round 3's
    published bounds.
    """
    if successes < 0 or trials < 0 or successes > trials:
        raise ValueError(f"expects 0 <= successes <= trials, got {successes}/{trials}")
    method = f"Wilson score interval at {confidence * 100:.0f}%"
    if trials == 0:
        return Refusal(
            "empty-denominator",
            "Wilson interval not computed: the denominator is zero. There is no rate to bound.",
            Provenance(method, 0, {"successes": successes, "trials": trials, "confidence": confidence}),
        )
    z = z_for(confidence)
    z_squared = z * z
    denominator = trials + z_squared
    centre = (successes + z_squared / 2.0) / denominator
    half = (z / denominator) * math.sqrt(successes * (trials - successes) / trials + z_squared / 4.0)
    # At the extremes the algebra collapses exactly; floating point leaves ~1e-17 behind instead.
    low = 0.0 if successes == 0 else max(0.0, centre - half)
    high = 1.0 if successes == trials else min(1.0, centre + half)

    caveats: list[str] = []
    if trials < MIN_KAPPA_N:
        caveats.append(
            f"denominator is {trials}; the interval spans {(high - low) * 100:.1f}% of the unit "
            "line, so it constrains very little"
        )
    return WilsonInterval(
        successes=successes,
        trials=trials,
        rate=successes / trials,
        low=low,
        high=high,
        confidence=confidence,
        provenance=Provenance(
            method, trials, {"successes": successes, "trials": trials, "confidence": confidence, "z": z}, (), tuple(caveats)
        ),
    )


def format_p(p_value: float) -> str:
    """p-values print with a floor rather than as 0, which no exact test ever returns."""
    return "<0.0001" if p_value < 1e-4 else f"{p_value:.4f}"


# ---------------------------------------------------------------- Cohen's kappa

# The smallest join a kappa is computed on.
# [REVIEWED] The house floor, from MIN_KAPPA_N in src/review-server/analyze-bcde-validation.ts:
# below this the coefficient is not a weak estimate, it is an artefact -- a single cell decides the
# marginals, and the chance correction divides by a quantity estimated from those same few rows.
MIN_KAPPA_N = 10

KAPPA_NO_ROWS_REASON = "no comparable rows"
KAPPA_DEGENERATE_REASON = "both raters used one value only; kappa is 0/0 on that table"

# [INHERITED] The 1e-12 guard from analyze-bcde-validation.ts: when both raters used a single value,
# expected agreement is 1 and kappa is 0/0, but floating point lands a hair off exactly 1.
DEGENERATE_EXPECTED_TOLERANCE = 1e-12


def kappa_below_floor_reason(n: int, minimum: int = MIN_KAPPA_N) -> str:
    """The published refusal wording. Appears 128 times in bcde-validation-1-analysis.json."""
    return f"n={n} is below the {minimum}-row floor for a kappa"


@dataclass(frozen=True)
class KappaResult:
    kappa: float
    raw_agreement: float
    expected_agreement: float
    n: int
    categories: tuple[str, ...]
    provenance: Provenance
    ok: Literal[True] = True

    @property
    def summary(self) -> str:
        return f"kappa {self.kappa:.4f} with raw agreement {self.raw_agreement:.4f} on {self.n} rows"


@dataclass(frozen=True)
class KappaRefusal(Refusal):
    """A kappa that was not computed. Raw agreement survives; the coefficient does not exist."""

    raw_agreement: float | None = None
    n: int = 0
    categories: tuple[str, ...] = ()


def cohens_kappa(
    pairs: Sequence[tuple[str, str]], minimum: int = MIN_KAPPA_N
) -> KappaResult | KappaRefusal:
    """Cohen's kappa for two raters over any number of unordered categories.

    Refuses below `minimum` and returns a KappaRefusal carrying the raw agreement -- which at n=3 is
    the only honest agreement number -- and no coefficient. Rows must already be filtered to the
    comparable ones; `bucket_pairs` does that and hands over the decided vector, so the kappa's n
    and the agreement's decided denominator cannot drift apart.
    """
    n = len(pairs)
    categories = tuple(sorted({value for pair in pairs for value in pair}))
    method = f"Cohen's kappa, two raters, {len(categories)} categories, floor n>={minimum}"
    inputs: dict[str, float | int | str | bool] = {
        "n": n,
        "categories": "/".join(categories),
        "floor": minimum,
    }

    if n == 0:
        return KappaRefusal(
            "no-comparable-rows",
            KAPPA_NO_ROWS_REASON,
            Provenance(method, 0, inputs),
            raw_agreement=None,
            n=0,
            categories=categories,
        )

    agreed = sum(1 for left, right in pairs if left == right)
    raw_agreement = agreed / n

    if n < minimum:
        return KappaRefusal(
            "below-floor",
            kappa_below_floor_reason(n, minimum),
            Provenance(
                method,
                n,
                inputs,
                (),
                (f"raw agreement {raw_agreement:.4f} on {n} rows is reportable; the chance correction is not",),
            ),
            raw_agreement=raw_agreement,
            n=n,
            categories=categories,
        )

    left_share = {value: sum(1 for left, _ in pairs if left == value) / n for value in categories}
    right_share = {value: sum(1 for _, right in pairs if right == value) / n for value in categories}
    expected = sum(left_share[value] * right_share[value] for value in categories)

    if abs(1.0 - expected) < DEGENERATE_EXPECTED_TOLERANCE:
        return KappaRefusal(
            "undefined-on-this-table",
            KAPPA_DEGENERATE_REASON,
            Provenance(method, n, inputs),
            raw_agreement=raw_agreement,
            n=n,
            categories=categories,
        )

    return KappaResult(
        kappa=(raw_agreement - expected) / (1.0 - expected),
        raw_agreement=raw_agreement,
        expected_agreement=expected,
        n=n,
        categories=categories,
        provenance=Provenance(
            method,
            n,
            inputs,
            (),
            ("kappa is never quoted without its raw agreement: the same kappa means different things at different marginals",),
        ),
    )


# ---------------------------------------------------------------- bucketed agreement

AgreementBucket = Literal["agreement", "disagreement", "cant_tell"]

# [REVIEWED] REVIEW_UI.md lines 134-142 (d-2026-08-04-purity-rounds-need-escape-answer): "A stratum
# whose escape share exceeds half has no reliable rate and is reported as having none."
ESCAPE_SHARE_NO_RELIABLE_RATE_ABOVE = 0.5


@dataclass(frozen=True)
class BucketedAgreement:
    """P6's three buckets, with BOTH denominators. There is deliberately no single pooled rate."""

    agreement: int
    disagreement: int
    cant_tell: int
    total: int
    decided: int
    agreement_of_all: float | None
    agreement_of_decided: float | None
    escape_share: float | None
    decided_rate_reliable: bool
    provenance: Provenance
    ok: Literal[True] = True

    @property
    def counts_line(self) -> str:
        return (
            f"{self.agreement} agreement · {self.disagreement} disagreement · "
            f"{self.cant_tell} can't-tell  (n={self.total})"
        )

    @property
    def summary(self) -> str:
        if not self.decided_rate_reliable:
            return f"{self.counts_line} - no reliable rate over decided items"
        return (
            f"{self.counts_line} - {self.agreement_of_all:.1%} of all, "
            f"{self.agreement_of_decided:.1%} of decided"
        )


def bucketed_agreement(buckets: Sequence[str], confidence: float = 0.95) -> BucketedAgreement:
    """Count P6's three buckets and report agreement under BOTH denominators.

    `PHASE_0_DECISIONS.md` section 4 (P6) fixed the shape and made it binding for all oracle
    cross-checks. "Agreement was 80%" is not a fact until you know whether the denominator counted
    the can't-tells: 8/2/10 is 40% over all items and 80% over decided items, and both are true.
    """
    agreement = sum(1 for bucket in buckets if bucket == "agreement")
    disagreement = sum(1 for bucket in buckets if bucket == "disagreement")
    cant_tell = sum(1 for bucket in buckets if bucket == "cant_tell")
    total = len(buckets)
    decided = agreement + disagreement

    caveats: list[str] = []
    if cant_tell:
        caveats.append(
            f"{cant_tell} of {total} comparisons were can't-tell; the two agreement rates differ "
            'because of them and neither one alone is "the" agreement rate'
        )
    if total and cant_tell / total > ESCAPE_SHARE_NO_RELIABLE_RATE_ABOVE:
        caveats.append(
            f"NO RELIABLE RATE: the escape share is {cant_tell / total:.1%}, above half. Per "
            "REVIEW_UI.md this stratum is reported as having no reliable rate."
        )

    return BucketedAgreement(
        agreement=agreement,
        disagreement=disagreement,
        cant_tell=cant_tell,
        total=total,
        decided=decided,
        agreement_of_all=(agreement / total) if total else None,
        agreement_of_decided=(agreement / decided) if decided else None,
        escape_share=(cant_tell / total) if total else None,
        decided_rate_reliable=bool(
            total and decided and cant_tell / total <= ESCAPE_SHARE_NO_RELIABLE_RATE_ABOVE
        ),
        provenance=Provenance(
            "bucketed agreement (P6: agreement / disagreement / cant_tell), both denominators reported",
            total,
            {"agreement": agreement, "disagreement": disagreement, "cantTell": cant_tell, "total": total},
            (),
            tuple(caveats),
        ),
    )


def bucket_pairs(
    rows: Sequence[tuple[str, str]], is_refusal
) -> tuple[list[str], list[tuple[str, str]]]:
    """Bucket raw answers AND produce the decided vector kappa needs, in one pass.

    One predicate for both outputs, so a refusal token spelled two ways cannot leave a published
    kappa whose n matches no denominator printed beside it.
    """
    buckets: list[str] = []
    decided: list[tuple[str, str]] = []
    for left, right in rows:
        if is_refusal(left) or is_refusal(right):
            buckets.append("cant_tell")
            continue
        buckets.append("agreement" if left == right else "disagreement")
        decided.append((left, right))
    return buckets, decided


# ---------------------------------------------------------------- Fisher and McNemar


@dataclass(frozen=True)
class FisherResult:
    a: int
    b: int
    c: int
    d: int
    alternative: str
    p_value: float
    odds_ratio: float | None
    provenance: Provenance
    ok: Literal[True] = True

    @property
    def summary(self) -> str:
        return f"2x2 [{self.a} {self.b} / {self.c} {self.d}]: p={format_p(self.p_value)}"


def fisher_exact_2x2(
    a: int,
    b: int,
    c: int,
    d: int,
    alternative: Literal["two-sided", "greater", "less"] = "two-sided",
    *,
    pairing: Literal["independent-groups", "paired"],
    direction_fixed_in_advance: str | None = None,
) -> FisherResult | Refusal:
    """Fisher's exact test on a 2x2. `pairing` is required and has no default.

    Fisher on paired data is not a conservative approximation -- it is a different question, and it
    answers it with far more confidence than the data carries. That is how a ranking on 24,648
    shared pairs survived until McNemar put it at p=0.816. Declaring "paired" here refuses and
    names `mcnemar_exact`.
    """
    for name, value in (("a", a), ("b", b), ("c", c), ("d", d)):
        if value < 0:
            raise ValueError(f"expects non-negative cells, got {name}={value}")
    row_one, row_two = a + b, c + d
    column_one, column_two = a + c, b + d
    total = row_one + row_two
    suffix = " by the method of small p-values" if alternative == "two-sided" else ""
    method = f"Fisher exact 2x2, {alternative}{suffix}"
    inputs: dict[str, float | int | str | bool] = {"a": a, "b": b, "c": c, "d": d, "total": total}

    if pairing == "paired":
        return Refusal(
            "paired-data",
            "Fisher exact refused: the table was declared paired. Use mcnemar_exact, which takes "
            "the four paired cells directly.",
            Provenance(method, total, inputs),
        )
    if total == 0:
        return Refusal("empty-table", "Fisher exact not computed: the table is empty.", Provenance(method, 0, inputs))
    if 0 in (row_one, row_two, column_one, column_two):
        return Refusal(
            "degenerate-margin",
            f"Fisher exact not computed: a margin is zero (rows {row_one}/{row_two}, columns "
            f"{column_one}/{column_two}). Every table with these margins is the observed one and p "
            "is 1 by construction, which is not evidence of anything.",
            Provenance(method, total, inputs),
        )

    lowest = max(0, column_one - row_two)
    highest = min(row_one, column_one)
    log_denominator = log_choose(total, column_one)

    def mass_at(x: int) -> float:
        return math.exp(log_choose(row_one, x) + log_choose(row_two, column_one - x) - log_denominator)

    if alternative == "greater":
        p_value = _stable_sum([mass_at(x) for x in range(a, highest + 1)])
    elif alternative == "less":
        p_value = _stable_sum([mass_at(x) for x in range(lowest, a + 1)])
    else:
        threshold = mass_at(a) * (1.0 + EXTREMENESS_RELATIVE_SLACK)
        p_value = _stable_sum(
            [mass for mass in (mass_at(x) for x in range(lowest, highest + 1)) if mass <= threshold]
        )
    p_value = min(1.0, max(0.0, p_value))

    zero_cell = 0 in (a, b, c, d)
    caveats: list[str] = []
    if alternative != "two-sided":
        if not direction_fixed_in_advance:
            raise ValueError("a one-sided Fisher needs direction_fixed_in_advance")
        caveats.append(f"one-sided p-value; direction fixed in advance per: {direction_fixed_in_advance}")
    if zero_cell:
        caveats.append("a cell is zero, so the sample odds ratio is unbounded and is reported as absent")

    return FisherResult(
        a=a,
        b=b,
        c=c,
        d=d,
        alternative=alternative,
        p_value=p_value,
        odds_ratio=None if zero_cell else (a * d) / (b * c),
        provenance=Provenance(method, total, inputs, (), tuple(caveats)),
    )


@dataclass(frozen=True)
class McNemarResult:
    discordant_pairs: int
    total_pairs: int
    only_first: int
    only_second: int
    p_value: float
    provenance: Provenance
    ok: Literal[True] = True

    @property
    def summary(self) -> str:
        return (
            f"paired: first won {self.only_first}, second won {self.only_second}, of "
            f"{self.discordant_pairs} discordant pairs ({self.total_pairs} compared): "
            f"p={format_p(self.p_value)}"
        )


def mcnemar_exact(
    both_succeeded: int,
    only_first_succeeded: int,
    only_second_succeeded: int,
    neither_succeeded: int,
    alternative: Literal["two-sided", "greater", "less"] = "two-sided",
    *,
    direction_fixed_in_advance: str | None = None,
    pair_label: str = "pair",
) -> McNemarResult | Refusal:
    """McNemar's exact test: a sign test on the discordant pairs.

    The honest n is the DISCORDANT count, not the number of pairs compared. When both arms see the
    same items, most disagreement is item difficulty, which cancels; the evidence about which arm is
    better lives only where they disagreed. Reporting 24,648 as the n is what made the original
    embeddings result look decisive.

    Replaces the hand-rolled `mcnemar` in oracle/embeddings/bakeoff_census_aware.py, which used a
    continuity-corrected chi-squared with the exact test only as a fallback below n=20000. The
    approximation is worst exactly where the discordant count is small.
    """
    discordant = only_first_succeeded + only_second_succeeded
    total = discordant + both_succeeded + neither_succeeded
    method = f"McNemar exact (sign test on discordant pairs), {alternative}"
    inputs: dict[str, float | int | str | bool] = {
        "bothSucceeded": both_succeeded,
        "onlyFirstSucceeded": only_first_succeeded,
        "onlySecondSucceeded": only_second_succeeded,
        "neitherSucceeded": neither_succeeded,
        "totalPairs": total,
        "discordantPairs": discordant,
    }
    if total == 0:
        return Refusal("no-pairs", "McNemar not computed: there are no pairs.", Provenance(method, 0, inputs))
    if discordant == 0:
        return Refusal(
            "no-discordant-pairs",
            f"McNemar not computed: all {total} {pair_label}s were concordant, so none carries any "
            "information about which arm is better. This is an absence of evidence either way, not "
            "a p-value of 1 from a well-powered test.",
            Provenance(method, 0, inputs),
        )

    binomial = exact_binomial_test(
        only_first_succeeded,
        discordant,
        0.5,
        alternative,
        direction_fixed_in_advance=direction_fixed_in_advance,
    )
    assert isinstance(binomial, BinomialTest)
    return McNemarResult(
        discordant_pairs=discordant,
        total_pairs=total,
        only_first=only_first_succeeded,
        only_second=only_second_succeeded,
        p_value=binomial.p_value,
        provenance=Provenance(
            method,
            discordant,
            inputs,
            (),
            (
                f"the n is {discordant} discordant {pair_label}s, not the {total} compared; the "
                f"{both_succeeded + neither_succeeded} concordant {pair_label}s are excluded by the test",
            ),
        ),
    )


# ---------------------------------------------------------------- multiplicity


@dataclass(frozen=True)
class CorrectedCell:
    id: str
    raw_p_value: float
    adjusted_p_value: float
    survives_correction: bool


@dataclass(frozen=True)
class SweepResult:
    cells: tuple[CorrectedCell, ...]
    best: CorrectedCell | None
    survivor_count: int
    comparisons_run: int
    correction: str
    alpha: float
    provenance: Provenance
    ok: Literal[True] = True

    @property
    def summary(self) -> str:
        if self.best is None:
            return f"no cells reported out of {self.comparisons_run} comparisons"
        verdict = "survives" if self.best.survives_correction else "does not survive"
        return (
            f"best of {self.comparisons_run}: {self.best.id} raw p={format_p(self.best.raw_p_value)}, "
            f"adjusted p={format_p(self.best.adjusted_p_value)} - {verdict} at alpha={self.alpha}; "
            f"{self.survivor_count} of {self.comparisons_run} survive"
        )


def sweep_then_test(
    cells: Sequence[tuple[str, float]],
    *,
    comparisons_run: int,
    correction: Correction,
    alpha: float,
    family_definition: str,
    no_correction_justification: str | None = None,
) -> SweepResult | Refusal:
    """Apply a multiplicity correction across a DECLARED family.

    `comparisons_run` is required and is the number of comparisons PERFORMED, not the number written
    up. If a grid of 26 fields by 14 values was evaluated, it is 364 even if 363 are never mentioned
    again. Reporting fewer cells than were run is fine -- it is fine BECAUSE the correction still
    uses 364.

    The review's finding was an asymmetry: a rejected hypothesis was corrected over a 364-rule grid
    (p 0.2927) while the rule that replaced it got a raw binomial of 0.0172 with no correction at
    all. Holm over the same family takes 0.0172 to 1.0.
    """
    if comparisons_run < 0:
        raise ValueError(f"comparisons_run must be non-negative, got {comparisons_run}")
    if not 0.0 < alpha < 1.0:
        raise ValueError(f"expects 0 < alpha < 1, got {alpha}")

    method = f"sweep of {comparisons_run} comparisons, {correction}, alpha={alpha}"
    inputs: dict[str, float | int | str | bool] = {
        "comparisonsRun": comparisons_run,
        "cellsReported": len(cells),
        "correction": correction,
        "alpha": alpha,
        "familyDefinition": family_definition,
    }

    if len(cells) > comparisons_run:
        return Refusal(
            "under-declared-family",
            f"Sweep refused: {len(cells)} cells were handed over but the declared family is "
            f"{comparisons_run}. The family cannot be smaller than what is being reported.",
            Provenance(method, comparisons_run, inputs),
        )
    if correction == "benjamini-hochberg" and len(cells) != comparisons_run:
        return Refusal(
            "partial-family-needs-full-set",
            f"Sweep refused: Benjamini-Hochberg is a step-up over the whole family, and only "
            f"{len(cells)} of {comparisons_run} p-values were supplied. Use Holm, which stays valid "
            "on a reported subset because it is conservative there.",
            Provenance(method, comparisons_run, inputs),
        )
    if correction == "none" and not (no_correction_justification or "").strip():
        return Refusal(
            "unjustified-no-correction",
            f'Sweep refused: correction "none" over a family of {comparisons_run} requires '
            "no_correction_justification. Skipping correction is a claim and has to be written down.",
            Provenance(method, comparisons_run, inputs),
        )

    adjusted = _adjust(cells, comparisons_run, correction)
    corrected = tuple(
        CorrectedCell(cell_id, raw, adjusted[index], adjusted[index] <= alpha)
        for index, (cell_id, raw) in enumerate(cells)
    )
    survivors = sum(1 for cell in corrected if cell.survives_correction)
    best = min(corrected, key=lambda cell: cell.raw_p_value) if corrected else None

    caveats = [f"family: {family_definition}"]
    if len(cells) < comparisons_run:
        caveats.append(
            f"{len(cells)} of {comparisons_run} comparisons are reported here; the correction uses all {comparisons_run}"
        )
    if best is not None and not best.survives_correction and best.raw_p_value <= alpha:
        caveats.append(
            f"the smallest raw p-value ({format_p(best.raw_p_value)}, {best.id}) would have cleared "
            f"alpha uncorrected and does not clear it across {comparisons_run} comparisons"
        )

    return SweepResult(
        cells=corrected,
        best=best,
        survivor_count=survivors,
        comparisons_run=comparisons_run,
        correction=correction,
        alpha=alpha,
        provenance=Provenance(
            method,
            comparisons_run,
            inputs,
            (f"{correction} across a family of {comparisons_run}",),
            tuple(caveats),
        ),
    )


def _adjust(cells: Sequence[tuple[str, float]], family_size: int, correction: Correction) -> list[float]:
    """Adjusted p-values in the caller's original order.

    Holm and Bonferroni stay valid on a reported subset because both are conservative when the
    unreported p-values are larger. Benjamini-Hochberg is not, which is why the caller is refused
    that combination rather than quietly given an approximation.
    """
    adjusted = [0.0] * len(cells)
    if correction == "none":
        return [p for _, p in cells]
    if correction == "bonferroni":
        return [min(1.0, p * family_size) for _, p in cells]

    order = sorted(range(len(cells)), key=lambda index: cells[index][1])
    if correction == "holm":
        running = 0.0
        for rank, index in enumerate(order):
            running = max(running, min(1.0, cells[index][1] * (family_size - rank)))
            adjusted[index] = running
        return adjusted

    running = 1.0
    for rank in range(len(order) - 1, -1, -1):
        index = order[rank]
        running = min(running, min(1.0, cells[index][1] * family_size / (rank + 1)))
        adjusted[index] = running
    return adjusted


# ---------------------------------------------------------------- selftest


def _selftest() -> int:
    """Cross-check every mirrored function against the TypeScript module's golden values."""
    failures: list[str] = []

    def check(label: str, actual: float, expected: float, tolerance: float = 1e-12) -> None:
        if not math.isclose(actual, expected, abs_tol=tolerance):
            failures.append(f"{label}: got {actual!r}, expected {expected!r}")

    # Exact binomial, against R's binom.test (same goldens as stats-core.test.ts).
    for successes, trials, null, expected in [
        (9, 9, 0.5, 0.00390625),
        (7, 10, 0.5, 0.34375),
        (60, 100, 0.5, 0.056887933640982),
        (5, 10, 0.5, 1.0),
    ]:
        result = exact_binomial_test(successes, trials, null, "two-sided")
        assert isinstance(result, BinomialTest)
        check(f"binomial {successes}/{trials}", result.p_value, expected)

    one_sided = exact_binomial_test(8, 10, 0.5, "greater", direction_fixed_in_advance="selftest")
    assert isinstance(one_sided, BinomialTest)
    check("binomial one-sided 8/10", one_sided.p_value, 0.0546875)

    # Round 3's published values, at the published rounding.
    for successes, trials, expected in [(17, 42, 0.279956), (15, 21, 0.078354), (2, 21, 0.000221), (18, 42, 0.440799)]:
        result = exact_binomial_test(successes, trials, 0.5, "two-sided")
        assert isinstance(result, BinomialTest)
        check(f"round3 p {successes}/{trials}", round(result.p_value, 6), expected, 1e-9)

    for successes, trials, low, high in [(17, 42, 0.2704, 0.5551), (15, 21, 0.5004, 0.8619), (2, 21, 0.0265, 0.2891)]:
        interval = wilson_interval(successes, trials)
        assert isinstance(interval, WilsonInterval)
        check(f"round3 wilson low {successes}/{trials}", round(interval.low, 4), low, 1e-9)
        check(f"round3 wilson high {successes}/{trials}", round(interval.high, 4), high, 1e-9)

    check("z_for(0.95)", z_for(0.95), 1.959963984540054, 1e-9)

    # Fisher, tea-tasting.
    tea = fisher_exact_2x2(3, 1, 1, 3, "two-sided", pairing="independent-groups")
    assert isinstance(tea, FisherResult)
    check("fisher tea-tasting", tea.p_value, 0.4857142857142857)

    # Kappa: the worked table, and the floor.
    pairs = [("yes", "yes")] * 6 + [("no", "no")] * 2 + [("yes", "no"), ("no", "yes")]
    kappa = cohens_kappa(pairs)
    assert isinstance(kappa, KappaResult)
    check("kappa worked table", kappa.kappa, 0.22 / 0.42)

    tiny = cohens_kappa([("y", "y"), ("y", "n"), ("n", "n")])
    if not isinstance(tiny, KappaRefusal) or tiny.reason != "below-floor":
        failures.append("kappa at n=3 must refuse below the floor")
    if isinstance(tiny, KappaRefusal) and tiny.detail != "n=3 is below the 10-row floor for a kappa":
        failures.append(f"kappa floor wording drifted: {tiny.detail!r}")

    # The uncorrected sweep, reproduced and then corrected.
    historical = exact_binomial_test(8, 8, 0.6019, "greater", direction_fixed_in_advance="selftest")
    assert isinstance(historical, BinomialTest)
    check("historical uncorrected p", round(historical.p_value, 4), 0.0172, 1e-9)
    swept = sweep_then_test(
        [("D-multiple-distinct-fields", 0.0172)],
        comparisons_run=364,
        correction="holm",
        alpha=0.05,
        family_definition="the 364-rule grid the replaced hypothesis was corrected against",
    )
    assert isinstance(swept, SweepResult)
    if swept.best is None or swept.best.survives_correction:
        failures.append("0.0172 must not survive Holm over a family of 364")

    # Fisher refuses paired data.
    paired = fisher_exact_2x2(20012, 4636, 20008, 4640, "two-sided", pairing="paired")
    if not isinstance(paired, Refusal) or paired.reason != "paired-data":
        failures.append("Fisher must refuse a table declared paired")

    # McNemar rests on the discordant pairs.
    mcnemar = mcnemar_exact(19800, 212, 208, 4428)
    assert isinstance(mcnemar, McNemarResult)
    if mcnemar.provenance.n != 420:
        failures.append(f"McNemar n must be the 420 discordant pairs, got {mcnemar.provenance.n}")

    # Bucketed agreement reports both denominators.
    buckets = ["agreement"] * 8 + ["disagreement"] * 2 + ["cant_tell"] * 10
    counted = bucketed_agreement(buckets)
    check("agreement of all", counted.agreement_of_all or 0.0, 0.4)
    check("agreement of decided", counted.agreement_of_decided or 0.0, 0.8)
    # The rule is "EXCEEDS half", so exactly half is still reliable. Both sides of the boundary are
    # checked, because an off-by-one here silently changes which strata get a published rate.
    if not counted.decided_rate_reliable:
        failures.append("an escape share of exactly half does not exceed half, so the rate stands")
    above_half = bucketed_agreement(["agreement"] * 4 + ["cant_tell"] * 6)
    if above_half.decided_rate_reliable:
        failures.append("an escape share of 60% exceeds half and must be reported as no reliable rate")

    for failure in failures:
        print(f"FAIL {failure}")
    checks = 31
    print(f"stats.py selftest: {checks - len(failures)}/{checks} checks passed")
    return 1 if failures else 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        raise SystemExit(_selftest())
    print(__doc__)
