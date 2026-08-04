/**
 * # Aggregation and the pre-registered verdict.
 *
 * **The criterion below was written before any aggregate number was looked at.** It is stated here
 * as code so that a reader can check it was not fitted to the answer.
 *
 * ## Which statistic the verdict is pre-registered on, and why
 *
 * arm-d §7 asks whether endorsed answers are "concentrated near the designated ends" or
 * "distributed roughly uniformly". The obvious statistic — the *best* percentile any bearing pixel
 * attains — cannot answer that question on its own, because it is dominated by how many pixels the
 * colour occupies. A background covering half a 640x640 image has 200,000 bearing pixels; under a
 * **uniformly random** ordering its best percentile would still be about 1/200,000. Reading that as
 * "concentrated" would be reading the colour's area, not the field's order.
 *
 * So the verdict is pre-registered on the **median position** of a role colour's bearing pixels,
 * whose null value is 0.5 for every colour whatever its area. The best percentile is reported in
 * full (the brief asks for it) beside two null baselines computed per colour from its own `n`:
 * `1/(n+1)` for the expected best, and `1 - 0.9^n` for the probability of landing in the top decile
 * by chance. Excess over the null baseline is the only reading of a best-percentile that means
 * anything.
 *
 *   node --experimental-strip-types falsifier/aggregate.ts
 */

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------------------------
// THE PRE-REGISTERED VERDICT CRITERION. Written before the aggregate was computed.
// ---------------------------------------------------------------------------------------------

/**
 * Applied per role, to the distribution of **median positions** across role colours (0 = the
 * ordering's designated end, 1 = its far end; the null value is 0.5).
 *
 * - **CONCENTRATED** — `median of median positions <= 0.25` **and** at least half the measured
 *   role colours have a median position `<= 0.25`. The endorsed answer lives near the designated
 *   end; a cut is all that is missing.
 * - **UNIFORM-MIDDLE** — `median of median positions` falls in `[0.35, 0.65]`. Indistinguishable
 *   from the endorsed colours being scattered through the ordering. **This is the refutation** of
 *   selection-by-rank-of-this-field for that role, per arm-d §7.
 * - **MIXED** — anything else: the ordering carries signal but the endorsed answer is not where a
 *   rank cut would find it.
 */
export const VERDICT_CRITERION = {
	concentrated: { medianOfMediansAtMost: 0.25, fractionAtOrBelow025AtLeast: 0.5 },
	uniformMiddle: { medianOfMediansBetween: [0.35, 0.65] as const },
} as const

function verdictFor(medianOfMedians: number, fractionAtOrBelow025: number): string {
	if (
		medianOfMedians <= VERDICT_CRITERION.concentrated.medianOfMediansAtMost &&
		fractionAtOrBelow025 >= VERDICT_CRITERION.concentrated.fractionAtOrBelow025AtLeast
	) return "CONCENTRATED"
	const [low, high] = VERDICT_CRITERION.uniformMiddle.medianOfMediansBetween
	if (medianOfMedians >= low && medianOfMedians <= high) return "UNIFORM-MIDDLE"
	return "MIXED"
}

// ---------------------------------------------------------------------------------------------

type RoleResult = {
	role: string
	hex: string
	rgb: number[]
	ordering: string | null
	skipped: string | null
	bearingPixels: number
	bearingPixelsInScope: number
	orderingPopulation: number
	bestPosition: number | null
	bestPositionPessimistic: number | null
	medianPosition: number | null
	nullExpectedBest: number | null
	nullProbabilityBestInTopDecile: number | null
}

type ArtworkResult = {
	contentSha256: string
	imagePath: string
	width: number
	height: number
	pixels: number
	eligiblePixels: number
	edgePixels: number
	interiorPixels: number
	bandPixels: number
	noEdges: boolean
	decodeError: string | null
	entries: { entryId: string; kind: string; completeness: string; roles: RoleResult[] }[]
	milliseconds: number
}

function quantile(sorted: number[], q: number): number {
	if (sorted.length === 0) return Number.NaN
	const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))
	return sorted[index]
}

function fmt(value: number, digits = 3): string {
	return Number.isFinite(value) ? value.toFixed(digits) : "—"
}

type RoleSummary = {
	role: string
	total: number
	absentTriple: number
	outOfScope: number
	outOfScopeReasons: Record<string, number>
	measured: number
	medianPosition: { deciles: number[]; q1: number; median: number; q3: number }
	fractionMedianAtOrBelow025: number
	fractionMedianAtOrBelow010: number
	bestPosition: { deciles: number[]; q1: number; median: number; q3: number }
	fractionBestInTopDecile: number
	nullFractionBestInTopDecile: number
	medianNullExpectedBest: number
	bestPositionPessimistic: { q1: number; median: number; q3: number }
	medianBearingPixels: number
	medianOrderingPopulation: number
	verdict: string
	/**
	 * The same verdict with every out-of-scope role colour charged the worst possible position
	 * (1.0) instead of being dropped. A restriction that discards a third of the endorsed answers
	 * flatters itself if the discarded ones are simply not counted.
	 */
	penalised: { medianOfMedians: number; fractionMedianAtOrBelow025: number; verdict: string }
	/** `fractionBestInTopDecile` minus the mean per-colour null probability of the same event. */
	bestTopDecileExcessOverNull: number
}

function summarise(role: string, records: RoleResult[]): RoleSummary {
	const absent = records.filter((r) => r.skipped === "absent-triple")
	const outOfScope = records.filter((r) => r.skipped !== null && r.skipped !== "absent-triple")
	const measured = records.filter((r) => r.medianPosition !== null)

	const reasons: Record<string, number> = {}
	for (const record of outOfScope) reasons[record.skipped!] = (reasons[record.skipped!] ?? 0) + 1

	const medians = measured.map((r) => r.medianPosition!).sort((a, b) => a - b)
	const bests = measured.map((r) => r.bestPosition!).sort((a, b) => a - b)
	const pessimistic = measured.map((r) => r.bestPositionPessimistic!).sort((a, b) => a - b)
	const nulls = measured.map((r) => r.nullProbabilityBestInTopDecile!)
	const nullBest = measured.map((r) => r.nullExpectedBest!).sort((a, b) => a - b)
	const bearing = measured.map((r) => r.bearingPixels).sort((a, b) => a - b)
	const population = measured.map((r) => r.orderingPopulation).sort((a, b) => a - b)

	const deciles = (sorted: number[]) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => quantile(sorted, d / 10))
	const medianOfMedians = quantile(medians, 0.5)
	const fractionAtOrBelow025 = measured.length === 0
		? Number.NaN
		: medians.filter((m) => m <= 0.25).length / medians.length

	// Penalised: out-of-scope colours enter at 1.0. Absent triples stay out — an absent colour is a
	// reachability fact, not a rank-order fact, and charging it here would conflate the two.
	const penalisedMedians = [...medians, ...outOfScope.map(() => 1)].sort((a, b) => a - b)
	const penalisedMedianOfMedians = quantile(penalisedMedians, 0.5)
	const penalisedFraction = penalisedMedians.length === 0
		? Number.NaN
		: penalisedMedians.filter((m) => m <= 0.25).length / penalisedMedians.length

	const observedTopDecile = measured.length === 0
		? Number.NaN
		: bests.filter((b) => b <= 0.1).length / bests.length
	const nullTopDecile = measured.length === 0
		? Number.NaN
		: nulls.reduce((sum, value) => sum + value, 0) / nulls.length

	return {
		role,
		total: records.length,
		absentTriple: absent.length,
		outOfScope: outOfScope.length,
		outOfScopeReasons: reasons,
		measured: measured.length,
		medianPosition: {
			deciles: deciles(medians),
			q1: quantile(medians, 0.25),
			median: medianOfMedians,
			q3: quantile(medians, 0.75),
		},
		fractionMedianAtOrBelow025: fractionAtOrBelow025,
		fractionMedianAtOrBelow010: measured.length === 0
			? Number.NaN
			: medians.filter((m) => m <= 0.1).length / medians.length,
		bestPosition: {
			deciles: deciles(bests),
			q1: quantile(bests, 0.25),
			median: quantile(bests, 0.5),
			q3: quantile(bests, 0.75),
		},
		fractionBestInTopDecile: observedTopDecile,
		nullFractionBestInTopDecile: nullTopDecile,
		medianNullExpectedBest: quantile(nullBest, 0.5),
		bestPositionPessimistic: {
			q1: quantile(pessimistic, 0.25),
			median: quantile(pessimistic, 0.5),
			q3: quantile(pessimistic, 0.75),
		},
		medianBearingPixels: quantile(bearing, 0.5),
		medianOrderingPopulation: quantile(population, 0.5),
		verdict: verdictFor(medianOfMedians, fractionAtOrBelow025),
		penalised: {
			medianOfMedians: penalisedMedianOfMedians,
			fractionMedianAtOrBelow025: penalisedFraction,
			verdict: verdictFor(penalisedMedianOfMedians, penalisedFraction),
		},
		bestTopDecileExcessOverNull: observedTopDecile - nullTopDecile,
	}
}

// ---------------------------------------------------------------------------------------------

const ARMS = [
	{ k: 3, file: "parts/k3.json", primary: true },
	{ k: 5, file: "parts/k5.json", primary: false },
	{ k: 8, file: "parts/k8.json", primary: false },
]

const ROLE_ORDER = ["background", "surface", "foreground", "accent"]

type ArmSummary = {
	edgeRankK: number
	primary: boolean
	artworks: number
	entries: number
	roleColours: number
	decodeErrors: { imagePath: string; error: string }[]
	artworksWithNoEdges: number
	edgeFraction: { min: number; q1: number; median: number; q3: number; max: number }
	interiorFraction: { median: number }
	bandFraction: { median: number }
	totalRuntimeMs: number
	roles: RoleSummary[]
}

const arms: ArmSummary[] = []
const fullData: Record<string, unknown> = {}

for (const arm of ARMS) {
	const parsed = JSON.parse(readFileSync(resolve(HERE, arm.file), "utf8")) as {
		meta: { elapsedMs: number; artworksDone: number }
		artworks: ArtworkResult[]
	}
	const artworks = parsed.artworks
	const byRole = new Map<string, RoleResult[]>()
	let entries = 0
	let roleColours = 0
	for (const artwork of artworks) {
		for (const entry of artwork.entries) {
			entries += 1
			for (const role of entry.roles) {
				roleColours += 1
				const list = byRole.get(role.role)
				if (list === undefined) byRole.set(role.role, [role])
				else list.push(role)
			}
		}
	}

	const edgeFractions = artworks.filter((a) => a.decodeError === null)
		.map((a) => a.edgePixels / a.pixels).sort((x, y) => x - y)
	const interiorFractions = artworks.filter((a) => a.decodeError === null)
		.map((a) => a.interiorPixels / a.pixels).sort((x, y) => x - y)
	const bandFractions = artworks.filter((a) => a.decodeError === null)
		.map((a) => a.bandPixels / a.pixels).sort((x, y) => x - y)

	arms.push({
		edgeRankK: arm.k,
		primary: arm.primary,
		artworks: artworks.length,
		entries,
		roleColours,
		decodeErrors: artworks.filter((a) => a.decodeError !== null)
			.map((a) => ({ imagePath: a.imagePath, error: a.decodeError! })),
		artworksWithNoEdges: artworks.filter((a) => a.noEdges).length,
		edgeFraction: {
			min: edgeFractions[0],
			q1: quantile(edgeFractions, 0.25),
			median: quantile(edgeFractions, 0.5),
			q3: quantile(edgeFractions, 0.75),
			max: edgeFractions[edgeFractions.length - 1],
		},
		interiorFraction: { median: quantile(interiorFractions, 0.5) },
		bandFraction: { median: quantile(bandFractions, 0.5) },
		totalRuntimeMs: parsed.meta.elapsedMs,
		roles: ROLE_ORDER.map((role) => summarise(role, byRole.get(role) ?? [])),
	})
	if (arm.primary) fullData.perArtwork = artworks
	;((fullData.perArtworkByArm ??= {}) as Record<string, unknown>)[`k${arm.k}`] = artworks
}

writeFileSync(
	resolve(HERE, "results.json"),
	JSON.stringify({
		meta: {
			what: "P3 pre-registered falsifier (arm-d §7) — rank positions of endorsed role colours in the paradigm's field orderings.",
			source: "research/v3/data/legacy/endorsements.json (351 entries, 173 distinct artworks)",
			primaryArm: "edgeRankK = 3, fieldQuantileBeta = 0.75",
			verdictCriterion: VERDICT_CRITERION,
			positionConvention: "0 = at the ordering's designated end (the maximum of the scalar field), 1 = at the far end. Ties resolve in the paradigm's favour; bestPositionPessimistic resolves them against.",
			generatedAt: new Date().toISOString(),
		},
		arms,
		...fullData,
	}),
)

// ---------------------------------------------------------------------------------------------
// Console tables (pasted into REPORT.md).
// ---------------------------------------------------------------------------------------------

for (const arm of arms) {
	console.log(`\n### k = ${arm.edgeRankK}${arm.primary ? " (PRE-REGISTERED PRIMARY)" : " (sensitivity)"}`)
	console.log(
		`artworks=${arm.artworks} entries=${arm.entries} roleColours=${arm.roleColours} ` +
			`decodeErrors=${arm.decodeErrors.length} noEdgeArtworks=${arm.artworksWithNoEdges} runtime=${(arm.totalRuntimeMs / 1000).toFixed(1)}s`,
	)
	console.log(
		`edgeFraction min/q1/med/q3/max = ${fmt(arm.edgeFraction.min)}/${fmt(arm.edgeFraction.q1)}/` +
			`${fmt(arm.edgeFraction.median)}/${fmt(arm.edgeFraction.q3)}/${fmt(arm.edgeFraction.max)}  ` +
			`interiorFraction med=${fmt(arm.interiorFraction.median)} bandFraction med=${fmt(arm.bandFraction.median)}`,
	)
	console.log(
		"\n| role | N | absent | out-of-scope | measured | median-pos Q1 | median-pos MED | median-pos Q3 | frac med<=0.25 | best Q1 | best MED | best Q3 | frac best<=0.10 | null frac best<=0.10 | pess best MED | verdict |",
	)
	console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |")
	for (const role of arm.roles) {
		console.log(
			`| ${role.role} | ${role.total} | ${role.absentTriple} | ${role.outOfScope} | ${role.measured} | ` +
				`${fmt(role.medianPosition.q1)} | **${fmt(role.medianPosition.median)}** | ${fmt(role.medianPosition.q3)} | ` +
				`${fmt(role.fractionMedianAtOrBelow025)} | ` +
				`${fmt(role.bestPosition.q1, 4)} | ${fmt(role.bestPosition.median, 4)} | ${fmt(role.bestPosition.q3, 4)} | ` +
				`${fmt(role.fractionBestInTopDecile)} | ${fmt(role.nullFractionBestInTopDecile)} | ` +
				`${fmt(role.bestPositionPessimistic.median)} | **${role.verdict}** |`,
		)
	}
	console.log("\npenalised (out-of-scope charged 1.0) and best-vs-null:")
	console.log("| role | penalised median-pos MED | penalised frac<=0.25 | penalised verdict | best top-decile OBSERVED | NULL | excess |")
	console.log("| --- | ---: | ---: | --- | ---: | ---: | ---: |")
	for (const role of arm.roles) {
		console.log(
			`| ${role.role} | ${fmt(role.penalised.medianOfMedians)} | ${fmt(role.penalised.fractionMedianAtOrBelow025)} | ` +
				`**${role.penalised.verdict}** | ${fmt(role.fractionBestInTopDecile)} | ${fmt(role.nullFractionBestInTopDecile)} | ` +
				`${role.bestTopDecileExcessOverNull >= 0 ? "+" : ""}${fmt(role.bestTopDecileExcessOverNull)} |`,
		)
	}
	console.log("\ndeciles of the median position (D1..D9):")
	for (const role of arm.roles) {
		console.log(`| ${role.role} | ${role.medianPosition.deciles.map((d) => fmt(d)).join(" | ")} |`)
	}
	console.log("deciles of the best position (D1..D9):")
	for (const role of arm.roles) {
		console.log(`| ${role.role} | ${role.bestPosition.deciles.map((d) => fmt(d, 4)).join(" | ")} |`)
	}
	console.log("out-of-scope reasons:")
	for (const role of arm.roles) {
		if (role.outOfScope > 0) console.log(`  ${role.role}: ${JSON.stringify(role.outOfScopeReasons)}`)
	}
}
