/**
 * Track P probe: read the census and route every site into the perturbation sweep or out of it.
 *
 * The census answers two questions per site that no amount of winner-diffing can answer cheaply:
 *
 *   1. Does it fire at all? A constant whose guard is never evaluated on 154 mixed artworks is dead
 *      code on this corpus, and a zero-flip sweep result for it would mean nothing (charter: a
 *      mechanism firing on 1 artwork in 118 is indistinguishable from a dead one).
 *   2. If it is a threshold, does any evaluation come close enough to it that moving it +-20 % would
 *      change the boolean? If not, the constant provably cannot change any decision at that
 *      magnitude, and running the extraction to discover that would be wasted core-hours.
 *
 * Sites that are pure thresholds with zero flips are proven-inert at that magnitude and skipped.
 * Everything else — weights, divisors, saturation points, and thresholds with live margins — goes to
 * the perturbation sweep, because a weight has no boolean to flip and its effect is only visible in
 * the winner.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const trackRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))

type Site = {
	index: number; id: string; file: string; line: number; value: number
	propertyKey: string | null; topLevel: string; enclosing: string
	lineText: string; docComment: string | null; readInstrumented: boolean
}
const sites = (JSON.parse(readFileSync(resolve(trackRoot, "data/sites.json"), "utf8")) as {
	sites: Site[]
}).sites
const census = JSON.parse(readFileSync(resolve(trackRoot, "data/census.json"), "utf8")) as {
	images: number
	evaluations: number[]; reads: number[]; comparisons: number[]
	flips: number[]; nearest: (number | null)[]
}

/** Flip counters are laid out [up10, down10, up20, down20, up50, down50] per site. */
const flipAt = (index: number, offset: number): number => census.flips[index * 6 + offset] ?? 0

export type Routed = Site & {
	firings: number
	comparisons: number
	flip10: number; flip20: number; flip50: number
	nearest: number | null
	/** Uses that are not a comparison against this constant: weights, divisors, saturation points. */
	nonComparisonUses: number
	route: "dead" | "threshold-inert" | "sweep"
	reason: string
}

const routed: Routed[] = sites.map((site) => {
	const evaluations = census.evaluations[site.index] ?? 0
	const reads = census.reads[site.index] ?? 0
	const firings = site.readInstrumented ? reads : evaluations
	const comparisons = census.comparisons[site.index] ?? 0
	const flip10 = flipAt(site.index, 0) + flipAt(site.index, 1)
	const flip20 = flipAt(site.index, 2) + flipAt(site.index, 3)
	const flip50 = flipAt(site.index, 4) + flipAt(site.index, 5)
	const nonComparisonUses = Math.max(0, firings - comparisons)

	let route: Routed["route"] = "sweep"
	let reason = "weight, divisor or live threshold"
	if (firings === 0 && site.readInstrumented && evaluations > 0 && site.value !== 0 && site.value !== 1) {
		/*
		 * The declaration ran but no syntactic read was seen. That is what a *computed* access looks
		 * like: `qualityWeights[axis]` inside a reduce never mentions `fieldFidelity` by name, so the
		 * read instrumentation cannot see it. All twenty quality weights — the ranking spine of the
		 * algorithm — land here. Calling them dead would be exactly the corpus-artifact error the
		 * charter warns about, so they are swept and their firing count reported as unknown.
		 */
		route = "sweep"
		reason = "read via computed key; firing count unavailable, swept to decide"
	} else if (firings === 0) {
		route = "dead"
		reason = "never evaluated on the triage corpus"
	} else if (comparisons > 0 && nonComparisonUses === 0 && flip50 === 0) {
		route = "threshold-inert"
		reason = `pure threshold, ${comparisons} evaluations, no boolean flips even at +-50%`
	}
	return {
		...site, firings, comparisons, flip10, flip20, flip50,
		nearest: census.nearest[site.index] ?? null,
		nonComparisonUses, route, reason,
	}
})

writeFileSync(resolve(trackRoot, "data/routing.json"),
	`${JSON.stringify({ schemaVersion: 1, images: census.images, sites: routed }, null, "\t")}\n`)

const sweep = routed.filter((site) => site.route === "sweep")
const jobs = sweep.flatMap((site) => {
	// A policy switch pinned at 0 or 1 cannot be perturbed multiplicatively; move it to its documented
	// opposite instead, which is exactly the "restore the previous behaviour" toggle the comments name.
	if (site.value === 0) return [{ site: site.index, absolute: 1, label: `${site.index}-abs1` }]
	if (site.value === 1) return [{ site: site.index, absolute: 0, label: `${site.index}-abs0` }]
	return [
		{ site: site.index, factor: 1.2, label: `${site.index}-up20` },
		{ site: site.index, factor: 0.8, label: `${site.index}-down20` },
	]
})
writeFileSync(resolve(trackRoot, "data/jobs-triage.json"), `${JSON.stringify(jobs, null, "\t")}\n`)

/**
 * Tiering, because the full sweep is ~13 core-hours and a session is not.
 *
 * Tier A is every *named* tunable — policy-object fields and module-level constants. These are the
 * ones the ledger is about: they have names, doc comments, and in several cases a cited review, so a
 * flip result for them is directly actionable. Tier B is the anonymous inline arithmetic (blend
 * weights, saturation divisors), which is where most of the un-evidenced fitting lives but where a
 * single flip count is harder to act on without first knowing the named layer is sound.
 */
const isNamed = (site: Routed): boolean => site.propertyKey !== null || site.readInstrumented
const tierA = jobs.filter((job) => isNamed(routed[job.site]!))
const tierB = jobs.filter((job) => !isNamed(routed[job.site]!))
writeFileSync(resolve(trackRoot, "data/jobs-tier-a.json"), `${JSON.stringify(tierA, null, "\t")}\n`)
writeFileSync(resolve(trackRoot, "data/jobs-tier-b.json"), `${JSON.stringify(tierB, null, "\t")}\n`)
process.stdout.write(`tier A (named constants and policy fields): ${tierA.length} jobs\n`)
process.stdout.write(`tier B (inline literals): ${tierB.length} jobs\n`)

const counts = new Map<string, number>()
for (const site of routed) counts.set(site.route, (counts.get(site.route) ?? 0) + 1)
process.stdout.write(`census over ${census.images} artworks, ${routed.length} sites\n`)
for (const [route, count] of [...counts].sort((a, b) => b[1] - a[1])) {
	process.stdout.write(`  ${String(count).padStart(4)}  ${route}\n`)
}
process.stdout.write(`perturbation jobs queued: ${jobs.length}\n`)

const dead = routed.filter((site) => site.route === "dead")
process.stdout.write(`\ndead sites by file:\n`)
const deadByFile = new Map<string, number>()
for (const site of dead) {
	const name = site.file.replace(/^.*\//u, "")
	deadByFile.set(name, (deadByFile.get(name) ?? 0) + 1)
}
for (const [file, count] of [...deadByFile].sort((a, b) => b[1] - a[1])) {
	process.stdout.write(`  ${String(count).padStart(4)}  ${file}\n`)
}
process.stdout.write(`\nthresholds with live margins (flip20 > 0), most-fired first:\n`)
for (const site of routed.filter((entry) => entry.flip20 > 0)
	.sort((a, b) => b.flip20 - a.flip20).slice(0, 25)) {
	process.stdout.write(`  ${site.id} = ${site.value} :: ${site.comparisons} evals, `
		+ `flip10=${site.flip10} flip20=${site.flip20} flip50=${site.flip50}\n`)
}
