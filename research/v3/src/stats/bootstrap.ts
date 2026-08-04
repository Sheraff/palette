/**
 * Bootstrap confidence intervals, including the cluster bootstrap.
 *
 * The bootstrap answers "how much would this number move if I had drawn a different sample" by
 * drawing different samples out of the one there is. Its single assumption is that the units it
 * resamples are independent — and that assumption is where this project's data usually breaks.
 *
 * The belongs study is the worked example. Its observations were colours, and colours came in
 * artworks: eight from one image, three from another. Resampling colours treats those eight as
 * eight independent facts, when they are closer to one. The interval that comes out is too narrow,
 * and it is too narrow in the flattering direction. Resampling **artworks**, carrying every colour
 * of a drawn artwork along with it, is the fix — {@link clusterBootstrapCI}.
 *
 * So {@link bootstrapCI} requires `independenceBasis`: a written statement of why these units are
 * independent of one another. It is a sentence, not a flag, and it exists because the honest answer
 * is often "they aren't, I need the cluster version", and nobody discovers that while typing a
 * parameter called `true`.
 *
 * Every draw is seeded. A CI printed into a committed analysis regenerates exactly.
 */

import { makeRng, quantileSorted } from "./numeric.ts"
import { provenance, refuse, type Provenance, type Refused } from "./types.ts"

/**
 * Fewest resamples that will produce an interval.
 *
 * [REVIEWED] 1000 is the conventional floor for a percentile interval at 95%: the bounds are the
 * 25th and 975th order statistics, so below roughly this many draws the endpoints are decided by a
 * handful of extreme resamples and the interval jitters between runs of the same data. Cheap enough
 * that there is no reason to go lower — the belongs study's cluster bootstrap runs in well under a
 * second at 10000.
 */
export const MIN_RESAMPLES = 1000

/**
 * Fewest clusters before a cluster bootstrap is annotated as thin.
 *
 * [REVIEWED] The same n=10 floor as `kappa.ts`, applied to the resampling unit rather than to rows.
 * A cluster bootstrap over 6 artworks is resampling 6 things however many colours they hold, and
 * its interval is as coarse as any other statistic on 6 observations. Annotates, never refuses.
 */
const THIN_CLUSTER_NOTE_BELOW = 10

export type BootstrapValue = {
	readonly ok: true
	/** The statistic on the original sample, not the mean of the resamples. */
	readonly pointEstimate: number
	readonly low: number
	readonly high: number
	readonly confidence: number
	readonly resamples: number
	readonly seed: number
	/** How many independent units the interval actually rests on: items, or clusters. */
	readonly resamplingUnits: number
	/** What one resampled unit is, in plain language. */
	readonly resamplingUnitLabel: string
	/** Resamples on which the statistic could not be computed. Excluded from the quantiles. */
	readonly degenerateDraws: number
	readonly summary: string
	readonly provenance: Provenance
}

export type BootstrapResult =
	| BootstrapValue
	| Refused<"too-few-resamples" | "empty-sample" | "statistic-undefined-on-sample" | "all-draws-degenerate">

export type BootstrapSpec<T> = {
	/** The observations, one per independent unit. */
	readonly units: readonly T[]
	/** The statistic, computed on a resampled collection. Return null where it is undefined. */
	readonly statistic: (sample: readonly T[]) => number | null
	readonly resamples: number
	readonly seed: number
	readonly confidence?: number
	/**
	 * Required: why these units are independent of one another.
	 *
	 * If the honest answer involves the phrase "well, some of them share a...", the statistic wants
	 * {@link clusterBootstrapCI} instead, clustered on whatever they share.
	 */
	readonly independenceBasis: string
	/** What one unit is, for the report. Defaults to "item". */
	readonly unitLabel?: string
}

/** Percentile bootstrap over independent units. */
export function bootstrapCI<T>(spec: BootstrapSpec<T>): BootstrapResult {
	const unitLabel = spec.unitLabel ?? "item"
	return runBootstrap({
		groups: spec.units.map((unit) => [unit] as readonly T[]),
		statistic: spec.statistic,
		resamples: spec.resamples,
		seed: spec.seed,
		confidence: spec.confidence ?? 0.95,
		resamplingUnitLabel: unitLabel,
		methodName: `percentile bootstrap over independent ${unitLabel}s`,
		extraInputs: { independenceBasis: spec.independenceBasis },
		extraCaveats: [`units treated as independent because: ${spec.independenceBasis}`],
		thinNoteBelow: THIN_CLUSTER_NOTE_BELOW,
	})
}

export type ClusterBootstrapSpec<T> = {
	/**
	 * The clusters. Every member of a drawn cluster comes along with it, which is the entire point
	 * — that is what stops eight colours from one artwork counting as eight independent facts.
	 */
	readonly clusters: readonly (readonly T[])[]
	readonly statistic: (sample: readonly T[]) => number | null
	readonly resamples: number
	readonly seed: number
	readonly confidence?: number
	/** What the clustering is on, in plain language: "artwork", "reviewer", "review round". */
	readonly clusterBy: string
}

/**
 * Cluster (block) percentile bootstrap: resamples whole clusters with replacement.
 *
 * The number of clusters drawn each time equals the number of clusters there are, so the resampled
 * collection varies in size when clusters differ in size. That is correct and deliberate — cluster
 * size is part of what varies between samples, and holding it fixed would understate the spread
 * this function exists to measure.
 */
export function clusterBootstrapCI<T>(spec: ClusterBootstrapSpec<T>): BootstrapResult {
	return runBootstrap({
		groups: spec.clusters,
		statistic: spec.statistic,
		resamples: spec.resamples,
		seed: spec.seed,
		confidence: spec.confidence ?? 0.95,
		resamplingUnitLabel: spec.clusterBy,
		methodName: `cluster percentile bootstrap, resampling whole ${spec.clusterBy}s`,
		extraInputs: { clusterBy: spec.clusterBy },
		extraCaveats: [
			`the interval rests on the number of ${spec.clusterBy}s, not on the number of observations inside them`,
		],
		thinNoteBelow: THIN_CLUSTER_NOTE_BELOW,
	})
}

function runBootstrap<T>(options: {
	groups: readonly (readonly T[])[]
	statistic: (sample: readonly T[]) => number | null
	resamples: number
	seed: number
	confidence: number
	resamplingUnitLabel: string
	methodName: string
	extraInputs: Record<string, number | string | boolean>
	extraCaveats: readonly string[]
	thinNoteBelow: number
}): BootstrapResult {
	const {
		groups,
		statistic,
		resamples,
		seed,
		confidence,
		resamplingUnitLabel,
		methodName,
		extraInputs,
		extraCaveats,
		thinNoteBelow,
	} = options

	if (!(confidence > 0 && confidence < 1)) {
		throw new RangeError(`bootstrap expects 0 < confidence < 1, got ${confidence}`)
	}

	const observations = groups.flat() as T[]
	const inputs: Record<string, number | string | boolean> = {
		resamplingUnits: groups.length,
		observations: observations.length,
		resamples,
		seed,
		confidence,
		...extraInputs,
	}
	const method = `${methodName}, ${resamples} resamples, seed ${seed}`

	if (resamples < MIN_RESAMPLES) {
		return refuse(
			"too-few-resamples",
			`Bootstrap not computed: ${resamples} resamples is below the ${MIN_RESAMPLES} floor. Below that the interval's endpoints are set by a handful of draws and move between runs of identical data.`,
			provenance(method, groups.length, inputs),
		)
	}
	if (groups.length === 0) {
		return refuse(
			"empty-sample",
			"Bootstrap not computed: there is nothing to resample.",
			provenance(method, 0, inputs),
		)
	}

	const pointEstimate = statistic(observations)
	if (pointEstimate === null || !Number.isFinite(pointEstimate)) {
		return refuse(
			"statistic-undefined-on-sample",
			"Bootstrap not computed: the statistic is undefined on the original sample, so there is no point estimate to put an interval around.",
			provenance(method, groups.length, inputs),
		)
	}

	const random = makeRng(seed)
	const draws: number[] = []
	let degenerateDraws = 0
	for (let draw = 0; draw < resamples; draw++) {
		const resampled: T[] = []
		for (let pick = 0; pick < groups.length; pick++) {
			const chosen = groups[Math.floor(random() * groups.length)]!
			for (const member of chosen) resampled.push(member)
		}
		const value = statistic(resampled)
		if (value === null || !Number.isFinite(value)) degenerateDraws += 1
		else draws.push(value)
	}

	if (draws.length === 0) {
		return refuse(
			"all-draws-degenerate",
			`Bootstrap not computed: the statistic was undefined on all ${resamples} resamples even though it is defined on the original sample. That usually means it needs a category or a comparison that a resample can lose entirely.`,
			provenance(method, groups.length, inputs),
		)
	}

	draws.sort((left, right) => left - right)
	const tail = (1 - confidence) / 2
	const low = quantileSorted(draws, tail)
	const high = quantileSorted(draws, 1 - tail)

	const caveats = [...extraCaveats]
	if (groups.length < thinNoteBelow) {
		caveats.push(
			`only ${groups.length} ${resamplingUnitLabel}s to resample; the bootstrap can only redistribute what is there, and at this count the interval is coarse`,
		)
	}
	if (degenerateDraws > 0) {
		caveats.push(
			`${degenerateDraws} of ${resamples} resamples produced no value and were dropped; the interval is over the remaining ${draws.length}`,
		)
	}

	return {
		ok: true,
		pointEstimate,
		low,
		high,
		confidence,
		resamples,
		seed,
		resamplingUnits: groups.length,
		resamplingUnitLabel,
		degenerateDraws,
		summary: `${pointEstimate.toFixed(4)} (${(confidence * 100).toFixed(0)}% percentile CI ${low.toFixed(4)}-${high.toFixed(4)} over ${groups.length} ${resamplingUnitLabel}s)`,
		provenance: provenance(method, groups.length, inputs, [], caveats),
	}
}
