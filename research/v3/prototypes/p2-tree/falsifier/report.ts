/**
 * Turning colour rows into the pre-registered verdict line, and nothing more than that.
 *
 * Two rules this file exists to keep:
 *
 * 1. **Every rate goes through `src/stats/`.** `wilsonInterval` for the interval, `honestLine` for
 *    the printed form, so a rate cannot reach a reader without its denominator, its method and its
 *    caveats. A refusal is a type there: `wilsonInterval` on an empty denominator returns `Refused`,
 *    which has no `rate` field, and this file prints the refusal rather than inventing a zero.
 * 2. **The verdict is a line, not a gate.** `SPEC.md`: "Both are report-lines, not gates — the
 *    reviewer judges." `verdict` is a string a human reads; nothing here exits non-zero on it.
 *
 * The observations are **clustered**: up to eight colour slots can come from a single artwork (351
 * endorsements over 173 artworks). Wilson's denominator counts them as independent, so an
 * artwork-clustered bootstrap is reported beside it and the disagreement between the two intervals
 * is the honest width.
 */

import { clusterBootstrapCI, honestLine, wilsonInterval } from "../../../src/stats/index.ts"
import type { BootstrapResult, WilsonIntervalResult } from "../../../src/stats/index.ts"
import {
	CLUSTER_BOOTSTRAP_RESAMPLES,
	CLUSTER_BOOTSTRAP_SEED,
	CONFIDENCE,
	ENDORSED_ARTWORKS,
	ENDORSED_ROLE_COLOUR_SLOTS,
	UNREACHABLE_SHARE_FALSIFIES_ABOVE,
} from "./constants.ts"
import type { ColourRow } from "./reachability.ts"

/** A statistic plus the one line that may be quoted from it. */
export type ReportedRate = Readonly<{
	result: WilsonIntervalResult
	line: string
}>

function rate(successes: number, trials: number): ReportedRate {
	const result = wilsonInterval(successes, trials, CONFIDENCE)
	return { result, line: honestLine(result) }
}

export type PipelineAggregate = Readonly<{
	pipeline: string
	/** Colour slots judged — the denominator of every rate below. */
	colours: number
	/** Distinct endorsement entries and artworks behind those slots. */
	entries: number
	artworks: number
	/** Share of the 1,397 pre-registered slots this run actually covered. */
	preregisteredCoverage: Readonly<{ colours: number; ofSlots: number; artworks: number; ofArtworks: number }>
	counts: Readonly<{
		reachableFromNodes: number
		reachableFromControl: number
		unreachableFromNodes: number
		/** The pre-registered numerator: unreachable from nodes **while** reachable from control. */
		unreachableFromNodesReachableFromControl: number
		/** Unreachable from both — the control's own ceiling, not the paradigm's failure. */
		unreachableFromBoth: number
		/** Images where the pipeline retained no node at all. Counted as unreachable, never abstained. */
		emptyNodeSets: number
		/** Images where no triple cleared the area floor. Makes the control vacuous for those rows. */
		emptyControlSets: number
	}>
	rates: Readonly<{
		reachableFromNodes: ReportedRate
		reachableFromControl: ReportedRate
		/** The rate the pre-registration judges. */
		falsifier: ReportedRate
		/**
		 * **Supplementary, not pre-registered.** The same numerator over the colours the control can
		 * reach at all, rather than over every endorsed colour.
		 *
		 * It exists because the pre-registered rate is bounded above by
		 * `reachableFromControl / colours` — measured at 16.8 % (floor 0.02) to 63.9 % (floor 0.0002)
		 * on the real corpus, see `NOTES.md` — so at a coarse floor the 25 % line is arithmetically
		 * unreachable and a "NOT FALSIFIED" reads as evidence when it is a ceiling. This conditional
		 * rate answers "of the colours the control *could* reach, what share did the nodes miss",
		 * which is the question the falsifier is trying to ask. **The pre-registered line is judged on
		 * `falsifier`, and this number may not be substituted for it after the fact.**
		 */
		falsifierAmongControlReachable: ReportedRate
	}>
	/** Artwork-clustered bootstrap of the falsifier rate; `null` when there were no rows. */
	falsifierClustered: BootstrapResult | null
	/** The pre-registered line, in words. */
	verdict: string
}>

function verdictLine(pipeline: string, numerator: number, denominator: number, coverage: number): string {
	const pct = UNREACHABLE_SHARE_FALSIFIES_ABOVE * 100
	if (denominator === 0) {
		return `${pipeline}: NOT ASSESSED — no endorsed colour slots were judged, so the pre-registered ` +
			`${pct}% line has no denominator. A run with nothing in it is not a pass.`
	}
	const share = numerator / denominator
	const outcome = share > UNREACHABLE_SHARE_FALSIFIES_ABOVE ? "FALSIFIED" : "NOT FALSIFIED"
	return `${pipeline}: ${outcome} — ${numerator}/${denominator} = ${(share * 100).toFixed(1)}% of endorsed ` +
		`role colours are unreachable from the retained-node representatives while remaining reachable ` +
		`from the control at the same area floor; the pre-registered line is >${pct}%. ` +
		`Coverage: ${(coverage * 100).toFixed(1)}% of the 1,397 pre-registered slots. ` +
		`Report line, not a gate — the reviewer judges.`
}

/** Aggregate one pipeline's rows. Rows must already belong to that pipeline. */
export function aggregatePipeline(pipeline: string, rows: readonly ColourRow[]): PipelineAggregate {
	const colours = rows.length
	const entries = new Set(rows.map((row) => row.entryId)).size
	const artworkIds = new Set(rows.map((row) => row.artworkSha256))

	const reachableFromNodes = rows.filter((row) => row.node.within).length
	const reachableFromControl = rows.filter((row) => row.control.within).length
	const unreachableFromNodes = colours - reachableFromNodes
	const numerator = rows.filter((row) => row.falsifies).length
	const unreachableFromBoth = rows.filter((row) => !row.node.within && !row.control.within).length

	const emptyNodeSets = new Set(rows.filter((row) => row.node.emptySet).map((row) => row.imagePath)).size
	const emptyControlSets = new Set(rows.filter((row) => row.control.emptySet).map((row) => row.imagePath)).size

	const clusters = [...groupBy(rows, (row) => row.artworkSha256).entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([, cluster]) => cluster)

	const falsifierClustered = colours === 0 ? null : clusterBootstrapCI<ColourRow>({
		clusters,
		statistic: (sample) => (sample.length === 0 ? null : sample.filter((row) => row.falsifies).length / sample.length),
		resamples: CLUSTER_BOOTSTRAP_RESAMPLES,
		seed: CLUSTER_BOOTSTRAP_SEED,
		confidence: CONFIDENCE,
		clusterBy: "artwork",
	})

	const coverage = colours / ENDORSED_ROLE_COLOUR_SLOTS

	return {
		pipeline,
		colours,
		entries,
		artworks: artworkIds.size,
		preregisteredCoverage: {
			colours,
			ofSlots: ENDORSED_ROLE_COLOUR_SLOTS,
			artworks: artworkIds.size,
			ofArtworks: ENDORSED_ARTWORKS,
		},
		counts: {
			reachableFromNodes,
			reachableFromControl,
			unreachableFromNodes,
			unreachableFromNodesReachableFromControl: numerator,
			unreachableFromBoth,
			emptyNodeSets,
			emptyControlSets,
		},
		rates: {
			reachableFromNodes: rate(reachableFromNodes, colours),
			reachableFromControl: rate(reachableFromControl, colours),
			falsifier: rate(numerator, colours),
			falsifierAmongControlReachable: rate(numerator, reachableFromControl),
		},
		falsifierClustered,
		verdict: verdictLine(pipeline, numerator, colours, coverage),
	}
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
	const out = new Map<K, T[]>()
	for (const item of items) {
		const bucket = out.get(key(item))
		if (bucket) bucket.push(item)
		else out.set(key(item), [item])
	}
	return out
}

/** Aggregate every pipeline present in the rows, in sorted pipeline order. */
export function aggregateAll(rows: readonly ColourRow[]): PipelineAggregate[] {
	return [...groupBy(rows, (row) => row.pipeline).entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([pipeline, pipelineRows]) => aggregatePipeline(pipeline, pipelineRows))
}

/**
 * JSON with every object's keys in sorted order.
 *
 * `SPEC.md` determinism: two runs over the same input must produce byte-identical output, and
 * insertion order is not something a reader should have to trust.
 */
export function stableStringify(value: unknown): string {
	return JSON.stringify(sortKeys(value), null, "\t") + "\n"
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys)
	if (value === null || typeof value !== "object") return value
	const out: Record<string, unknown> = {}
	for (const key of Object.keys(value as Record<string, unknown>).sort()) {
		out[key] = sortKeys((value as Record<string, unknown>)[key])
	}
	return out
}

/** The human-readable summary printed to stdout. Same numbers as the JSON, from the same objects. */
export function renderText(aggregates: readonly PipelineAggregate[]): string {
	const lines: string[] = []
	for (const aggregate of aggregates) {
		lines.push(`## ${aggregate.pipeline}`)
		lines.push(
			`   scope: ${aggregate.colours} endorsed colour slots | ${aggregate.entries} endorsement entries | ` +
				`${aggregate.artworks} artworks ` +
				`(of the pre-registered ${aggregate.preregisteredCoverage.ofSlots} slots / ` +
				`${aggregate.preregisteredCoverage.ofArtworks} artworks)`,
		)
		lines.push(`   reachable from retained nodes: ${aggregate.rates.reachableFromNodes.line}`)
		lines.push(`   reachable from control set:    ${aggregate.rates.reachableFromControl.line}`)
		lines.push(`   FALSIFIER RATE (unreachable from nodes, reachable from control): ${aggregate.rates.falsifier.line}`)
		if (aggregate.falsifierClustered) {
			lines.push(`   clustered by artwork:          ${honestLine(aggregate.falsifierClustered)}`)
		}
		lines.push(
			`   CEILING: the pre-registered rate cannot exceed the control-reachable rate ` +
				`(${aggregate.counts.reachableFromControl}/${aggregate.colours}). Supplementary, NOT pre-registered — ` +
				`among control-reachable colours only: ${aggregate.rates.falsifierAmongControlReachable.line}`,
		)
		lines.push(
			`   unreachable from both (control's own ceiling, not the paradigm's): ` +
				`${aggregate.counts.unreachableFromBoth}`,
		)
		if (aggregate.counts.emptyNodeSets > 0) {
			lines.push(`   CAVEAT: ${aggregate.counts.emptyNodeSets} image(s) retained no node at all`)
		}
		if (aggregate.counts.emptyControlSets > 0) {
			lines.push(`   CAVEAT: ${aggregate.counts.emptyControlSets} image(s) had no triple clearing the area floor`)
		}
		lines.push(`   ${aggregate.verdict}`)
		lines.push("")
	}
	return lines.join("\n")
}
