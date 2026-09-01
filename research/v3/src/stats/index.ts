/**
 * The shared statistics module.
 *
 * One import surface for every statistic the v3 analyzers need, written once so the mistakes the
 * adversarial review kept finding are structural rather than a matter of care:
 *
 * | want | use | what it refuses to let you do |
 * |---|---|---|
 * | agreement | {@link bucketedAgreement} | print one pooled rate where three buckets exist |
 * | chance-corrected agreement | {@link cohensKappa} | get a number below n=10 |
 * | proportion vs a null | {@link exactBinomialTest} | run one-sided without naming the prereg |
 * | interval on a proportion | {@link wilsonInterval} | report a rate with no denominator |
 * | 2x2 association | {@link fisherExact2x2} | transpose the table unnoticed |
 * | more than one comparison | {@link sweepThenTest} | report the best cell of many silently |
 * | a fit or a threshold | {@link fitWithDeclaredSupport} | fit to a sample its own variable truncated |
 * | spread of any statistic | {@link bootstrapCI}, {@link clusterBootstrapCI} | resample clustered data as if it were independent |
 *
 * Nothing here returns a bare `number`. Every result carries {@link Provenance} — n, method,
 * corrections, caveats — and {@link honestLine} turns any of them into a report line mechanically,
 * so an analysis cannot print the headline while dropping the family size or the truncation note.
 *
 * A refusal is a *type*, not a sentinel: {@link Refused} has no numeric field, so code that wants
 * the number must handle the refusal to reach it. `kappa.ts` is the reference case.
 *
 * Run the tests:
 *
 * ```sh
 * NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/v3/tests/stats-*.test.ts
 * ```
 *
 * A Python mirror of the same surface lives in `stats.py` beside this file, for the analyzers under
 * `research/v3/oracle/` that are Python.
 */

export {
	AGREEMENT_BUCKETS,
	bucketedAgreement,
	bucketPairs,
	describeRate,
	describeRateFully,
	ESCAPE_SHARE_NO_RELIABLE_RATE_ABOVE,
	type AgreementBucket,
	type AgreementCounts,
	type BucketedAgreementResult,
	type RateWithDenominator,
} from "./agreement.ts"

export {
	mcnemarExact,
	type McNemarAlternative,
	type McNemarResult,
	type McNemarSpec,
	type McNemarValue,
	type PairedCounts,
} from "./mcnemar.ts"

export {
	exactBinomialTest,
	formatConfidence,
	formatP,
	formatRate,
	wilsonInterval,
	type BinomialAlternative,
	type BinomialTestResult,
	type BinomialTestSpec,
	type BinomialTestValue,
	type WilsonIntervalResult,
	type WilsonIntervalValue,
	type TrialIndependence,
} from "./binomial.ts"

export {
	bootstrapCI,
	clusterBootstrapCI,
	MIN_RESAMPLES,
	type BootstrapResult,
	type BootstrapSpec,
	type BootstrapValue,
	type ClusterBootstrapSpec,
} from "./bootstrap.ts"

export {
	fisherExact2x2,
	type FisherAlternative,
	type FisherResult,
	type FisherSpec,
	type FisherValue,
	type Table2x2,
	type FisherPairing,
} from "./fisher.ts"

export {
	cohensKappa,
	kappaBelowFloorReason,
	KAPPA_DEGENERATE_REASON,
	KAPPA_NO_ROWS_REASON,
	MIN_KAPPA_N,
	roundFourPlaces,
	type KappaRefused,
	type KappaResult,
	type KappaValue,
	type RatedPair,
} from "./kappa.ts"

export {
	sweepThenTest,
	type CorrectedCell,
	type CorrectionMethod,
	type SweepCell,
	type SweepDeclaration,
	type SweepResult,
	type SweepValue,
	type BestCell,
} from "./multiplicity.ts"

export {
	binomialPmf,
	logChoose,
	logGamma,
	makeRng,
	probit,
	quantileSorted,
	zFor,
} from "./numeric.ts"

export {
	assessSupport,
	fitWithDeclaredSupport,
	type GuardedFit,
	type SampleSupport,
	type SelectionRelation,
	type SupportAssessment,
	type SupportVerdict,
} from "./truncation.ts"

export {
	honestBlock,
	honestLine,
	provenance,
	refuse,
	type Provenance,
	type Refused,
	type StatResult,
} from "./types.ts"
