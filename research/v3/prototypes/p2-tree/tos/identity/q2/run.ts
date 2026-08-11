/**
 * **Q2 — why are foregrounds still unreadable on fresh covers (cal-014 items 5 and 6)?**
 *
 * Three mechanisms produce an unreadable published foreground and they need different repairs:
 *
 *  - **ceiling** — the ranking worked and the pool has nothing readable in it. Test: the published
 *    colour is the pool's `minFieldContrast` maximum, *and* the whole artwork's maximum over every
 *    admissible exact triple is no better. Reported as `poolCeiling` and `imageCeiling`.
 *  - **bypass** — D3's text-colour-leads rule put a text group's colour ahead of the readability
 *    ranking and it published. Test: the published colour's provenance is `text-group` and a
 *    strictly more readable non-text candidate existed behind it.
 *  - **repair-walk** — the ranking's head was refused (twin of a field role, or a contract violation)
 *    and the walk descended. Test: the traced walk's accepted rank is not the first eligible rank.
 *
 * The three are measured, not chosen: `traceForegroundWalk` gives the per-candidate refusal, `electionOf`
 * gives the provenance and the score, and the ceiling is computed over the *whole* image so "the pool
 * had nothing" is separated from "the pipeline never offered what the artwork had".
 *
 * The **image ceiling** is the honest denominator: the best `minFieldContrast` achievable by any exact
 * triple of the artwork at or above the node area floor — the same floor `parseTree`'s residual uses, so
 * a colour counted here is a colour the residual tier could in principle have offered.
 *
 * Deterministic; provenance tag `p2-tos-identity/q2@1`. Writes `report.json` beside this file.
 */

import { writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { colorFromRgb, okLabDistance, rgbToOkLab, sameColorBar } from "../../../../../src/contract/color.ts"
import type { Rgb8 } from "../../../../../src/contract/types.ts"
import { hashFileBytes } from "../../../../../src/devloop/code-version.ts"
import { paletteWithDiagnostics } from "../../candidate.ts"
import { MIN_NODE_AREA_FRACTION } from "../../constants.ts"
import { runChromaPipeline } from "../../lanes/pool.ts"
import { unpack } from "../../pipeline.ts"
import { minFieldContrast, renderedFieldOf } from "../../roles/rank.ts"
import { mirrorTextGroups } from "../detector-mirror.ts"
import { electionOf, hexOf, histogramOf } from "../election.ts"
import { attribute } from "../pixels.ts"
import { assemblerFor, traceForegroundWalk } from "../walk.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const WORKTREE = resolve(HERE, "..", "..", "..", "..", "..", "..", "..")

const ITEMS = [
	{
		item: 5,
		id: "ab67616d00001e020002653adc4ef57bc46a3680",
		imagePath: "02/ab67616d00001e020002653adc4ef57bc46a3680.jpg",
		published: { background: "#b7f38f", surface: "#b7f38f", foreground: "#b9e0b1", accent: "#9ead9a" },
		note: "unreadable foreground",
	},
	{
		item: 6,
		id: "ab67616d00001e020002fc520894d5fd547eb7f3",
		imagePath: "02/ab67616d00001e020002fc520894d5fd547eb7f3.jpg",
		published: { background: "#646464", surface: "#fafafa", foreground: "#515151", accent: "#515151" },
		note: "background should be white / foreground is hard to read",
	},
] as const

const sameColor = (first: Rgb8, second: Rgb8): boolean =>
	okLabDistance(rgbToOkLab(first), rgbToOkLab(second)) < sameColorBar(colorFromRgb(first), colorFromRgb(second))

const results = []
for (const item of ITEMS) {
	const imagePath = resolve(WORKTREE, item.imagePath)
	const election = await electionOf(imagePath, 24)
	const { lanes } = await runChromaPipeline(imagePath)
	const mirror = mirrorTextGroups(election.image, lanes, election.parse)
	const diagnostics = await paletteWithDiagnostics(imagePath)
	const published = diagnostics.palette.roles.foreground

	const background = election.roles.background
	const surface = election.roles.surface
	const field = renderedFieldOf(background, surface, election.gradient)

	const assemble = assemblerFor(election.image, imagePath, election.parse, await hashFileBytes(imagePath))
	const walk = traceForegroundWalk({
		assemble,
		background,
		surface,
		foregroundPool: election.parse.foregroundPool,
		expectedForeground: published.hex,
	})

	// --- the ranking's two ceilings ----------------------------------------------------------------
	const publishedContrast = minFieldContrast(published.rgb, field)
	const poolScores = election.parse.foregroundPool.map((color) => ({ hex: hexOf(color), contrast: minFieldContrast(color, field) }))
	const poolBest = poolScores.slice().sort((first, second) => second.contrast - first.contrast)[0] ?? null
	const poolBestAdmissible =
		election.parse.foregroundPool
			.map((color) => ({ color, hex: hexOf(color), contrast: minFieldContrast(color, field) }))
			.filter((entry) => !sameColor(entry.color, background) && !sameColor(entry.color, surface))
			.sort((first, second) => second.contrast - first.contrast)[0] ?? null

	const histogram = histogramOf(election.image)
	const totalPixels = election.width * election.height
	const areaFloor = Math.max(1, Math.ceil(MIN_NODE_AREA_FRACTION * totalPixels))
	let imageCeiling: { hex: string; contrast: number; share: number } | null = null
	let imageCeilingAny: { hex: string; contrast: number; share: number } | null = null
	for (const [packed, count] of histogram) {
		const rgb = unpack(packed)
		const contrast = minFieldContrast(rgb, field)
		const entry = { hex: hexOf(rgb), contrast, share: count / totalPixels }
		if (imageCeilingAny === null || contrast > imageCeilingAny.contrast) imageCeilingAny = entry
		if (count >= areaFloor && (imageCeiling === null || contrast > imageCeiling.contrast)) imageCeiling = entry
	}

	// --- attribute ---------------------------------------------------------------------------------
	const publishedRank = election.parse.foregroundPool.findIndex((color) => hexOf(color) === published.hex)
	const firstEligibleRank = walk.foregroundSteps.find((step) => step.refusal !== "twin-of-background" && step.refusal !== "twin-of-surface")?.rank ?? null
	const publishedProvenance = election.pool.find((entry) => entry.hex === published.hex)?.provenance ?? "beyond-labelled-head"
	const moreReadableBehind = poolScores
		.slice(publishedRank + 1)
		.filter((entry) => entry.contrast > publishedContrast + 1e-9).length

	// **The ceiling is tested first**, because it is the only one of the three that is a statement about
	// what was *available*: if nothing admissible in the pool is more readable than what published, then
	// no ordering change and no repair could have helped, and neither of the other two labels explains
	// the complaint even when they also describe what the code did. Only when a more readable admissible
	// candidate existed does it matter *why* it was passed over — text-colour-leads (bypass) or a
	// descent forced on the walk (repair-walk).
	const isCeiling = poolBestAdmissible !== null && Math.abs(poolBestAdmissible.contrast - publishedContrast) < 1e-9
	const isBypass = !isCeiling && publishedProvenance === "text-group" && moreReadableBehind > 0
	const isRepairWalk = !isCeiling && !isBypass && firstEligibleRank !== null && publishedRank !== firstEligibleRank

	results.push({
		item: item.item,
		itemId: item.id,
		imagePath: item.imagePath,
		reviewerNote: item.note,
		publishedExpected: item.published,
		published: {
			background: diagnostics.palette.roles.background.hex,
			surface: diagnostics.palette.roles.surface.hex,
			foreground: published.hex,
			accent: diagnostics.palette.roles.accent.hex,
		},
		reproduced:
			diagnostics.palette.roles.background.hex === item.published.background &&
			diagnostics.palette.roles.surface.hex === item.published.surface &&
			published.hex === item.published.foreground &&
			diagnostics.palette.roles.accent.hex === item.published.accent,
		parse: {
			width: election.width,
			height: election.height,
			verdict: election.verdict,
			coverage: election.coverage,
			gradient: election.gradient,
			notes: election.notes,
			laneNodeCounts: election.laneNodeCounts,
		},
		assembly: { notes: diagnostics.notes, attempts: diagnostics.attempts, swapped: diagnostics.swapped },
		walk: { ...walk, foregroundSteps: walk.foregroundSteps.slice(0, 16) },
		textGroups: election.textGroups,
		detector: {
			agrees: mirror.agrees,
			disagreement: mirror.disagreement,
			poolMarks: mirror.poolMarks,
			components: mirror.components,
			limitBinds: mirror.limitBinds,
			clustersWithEnoughMembers: mirror.clusters.filter((cluster) => cluster.memberCount >= mirror.cuts.TEXT_MIN_COMPONENTS).length,
			topClusters: mirror.clusters.slice(0, 10),
			publishedGroupGeometry: mirror.publishedGroupGeometry,
			leadingGroupMembers: mirror.leadingGroupMembers,
		},
		ranking: {
			publishedRank,
			publishedProvenance,
			publishedContrast,
			firstEligibleRank,
			moreReadableBehindPublished: moreReadableBehind,
			poolSize: election.parse.foregroundPool.length,
			poolBest,
			poolBestAdmissible: poolBestAdmissible === null ? null : { hex: poolBestAdmissible.hex, contrast: poolBestAdmissible.contrast },
			imageCeilingAtAreaFloor: imageCeiling,
			imageCeilingAnyPixel: imageCeilingAny,
			areaFloorPixels: areaFloor,
		},
		pool: election.pool.map((entry) => ({
			...entry,
			refusedAsTwin: sameColor(entry.rgb, background) || sameColor(entry.rgb, surface),
			isPublished: entry.hex === published.hex,
		})),
		census: election.census,
		publishedAttribution: attribute(election.image, published.rgb),
		attribution: isCeiling ? "ceiling" : isBypass ? "bypass" : isRepairWalk ? "repair-walk" : "unclassified",
		attributionEvidence: {
			isBypass,
			isRepairWalk,
			isCeiling,
			publishedIsPoolMaximum: poolBest !== null && Math.abs(poolBest.contrast - publishedContrast) < 1e-9,
			publishedIsAdmissiblePoolMaximum:
				poolBestAdmissible !== null && Math.abs(poolBestAdmissible.contrast - publishedContrast) < 1e-9,
			imageOffersBetter: imageCeiling !== null && imageCeiling.contrast > publishedContrast + 1e-9,
		},
	})
}

const report = {
	provenance: "p2-tos-identity/q2@1",
	question: "why are foregrounds still unreadable on cal-014 items 5 and 6",
	candidate: "p2-tos-0.3.0-cycle-2-merged",
	generatedBy: "tos/identity/q2/run.ts",
	items: results,
}
writeFileSync(resolve(HERE, "report.json"), `${JSON.stringify(report, null, "\t")}\n`)
console.log(
	JSON.stringify(
		report.items.map((entry) => ({
			item: entry.item,
			reproduced: entry.reproduced,
			fg: entry.published.foreground,
			attribution: entry.attribution,
			publishedRank: entry.ranking.publishedRank,
			provenance: entry.ranking.publishedProvenance,
			publishedContrast: entry.ranking.publishedContrast,
			poolBest: entry.ranking.poolBest,
			imageCeiling: entry.ranking.imageCeilingAtAreaFloor,
			textGroups: entry.textGroups.length,
			walkAgrees: entry.walk.agrees,
			mirrorAgrees: entry.detector.agrees,
		})),
		null,
		2,
	),
)
