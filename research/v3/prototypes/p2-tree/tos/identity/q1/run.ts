/**
 * **Q1 — why did a near-white publish as the foreground on cal-014 items 1 and 2?**
 *
 * D10 ruling 1 names a suspected mechanism: *"the detector electing antialiasing/blend whites as 'the
 * text colour'"*. This script does not assume it. It reconstructs the whole foreground election for
 * each item and attributes the published colour to what physically carries it:
 *
 *  1. `electionOf` — the parse, its text groups, and the foreground ranking **labelled by provenance**
 *     (text group / same-colour cluster of retained nodes / residual exact triple);
 *  2. `mirrorTextGroups` — the detector's own inputs, self-validated against `parse.textGroups`, so a
 *     cluster that failed to become a group can be named with the conjunct it failed;
 *  3. `attribute` — the bar mask of the published colour, its connected components, their inradii, the
 *     boundary fraction and the outer-ring spectrum: the pixel evidence for (a) glyph ink, (b)
 *     antialiasing/compression halo, (c) scrim/overlay, (d) other;
 *  4. `paletteWithDiagnostics` — the assembly walk's own notes and attempt count, so "the ranking chose
 *     it" and "the repair walk landed on it" are told apart rather than inferred;
 *  5. the **second choice**: the next text group if one exists, and otherwise the best node-backed
 *     (cluster) candidate in the same ranking — the artwork colour the pipeline had and did not take.
 *
 * Deterministic: no randomness, no map-iteration order decides anything, one pass per image.
 * Provenance tag `p2-tos-identity/q1@1`. Writes `report.json` beside this file.
 */

import { writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { colorFromRgb, okLabDistance, rgbToOkLab, sameColorBar } from "../../../../../src/contract/color.ts"
import type { Rgb8 } from "../../../../../src/contract/types.ts"
import { hashFileBytes } from "../../../../../src/devloop/code-version.ts"
import { paletteWithDiagnostics } from "../../candidate.ts"
import { runChromaPipeline } from "../../lanes/pool.ts"
import { electionOf, hexOf } from "../election.ts"
import { mirrorTextGroups } from "../detector-mirror.ts"
import { attribute } from "../pixels.ts"
import { assemblerFor, traceForegroundWalk } from "../walk.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const WORKTREE = resolve(HERE, "..", "..", "..", "..", "..", "..", "..")

const ITEMS = [
	{ item: 1, id: "ab67616d0000b27300005f98559139b7dbc802fd", imagePath: "00/ab67616d0000b27300005f98559139b7dbc802fd.jpg", publishedForeground: "#fcfefd" },
	{ item: 2, id: "ab67616d0000b27300008912d4517960ad020c7a", imagePath: "00/ab67616d0000b27300008912d4517960ad020c7a.jpg", publishedForeground: "#fcffff" },
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

	const publishedForeground = diagnostics.palette.roles.foreground
	const attribution = attribute(election.image, publishedForeground.rgb)

	const assemble = assemblerFor(election.image, imagePath, election.parse, await hashFileBytes(imagePath))
	const walk = traceForegroundWalk({
		assemble,
		background: election.roles.background,
		surface: election.roles.surface,
		foregroundPool: election.parse.foregroundPool,
		expectedForeground: publishedForeground.hex,
	})

	// Why the leading candidate did or did not publish: the twin test the walk applies first.
	const background = election.roles.background
	const surface = election.roles.surface
	const poolWithWalk = election.pool.map((entry) => ({
		...entry,
		twinOfBackground: sameColor(entry.rgb, background),
		twinOfSurface: sameColor(entry.rgb, surface),
		refusedAsTwin: sameColor(entry.rgb, background) || sameColor(entry.rgb, surface),
		isPublished: entry.hex === publishedForeground.hex,
	}))
	const publishedRank = poolWithWalk.findIndex((entry) => entry.isPublished)
	const skipped = poolWithWalk.slice(0, Math.max(0, publishedRank))

	// The second choice, in the reviewer's sense: an artwork colour the pipeline had and did not take.
	const secondTextGroup = election.textGroups[1] ?? null
	const bestNodeBacked = poolWithWalk.find((entry) => entry.provenance !== "residual" && !entry.refusedAsTwin) ?? null
	const bestNodeBackedAttribution = bestNodeBacked === null ? null : attribute(election.image, bestNodeBacked.rgb)

	const firstTextGroup = election.textGroups[0] ?? null
	const firstTextGroupAttribution = firstTextGroup === null ? null : attribute(election.image, firstTextGroup.rgb)

	results.push({
		item: item.item,
		itemId: item.id,
		imagePath: item.imagePath,
		publishedForegroundExpected: item.publishedForeground,
		publishedForeground: publishedForeground.hex,
		reproduced: publishedForeground.hex === item.publishedForeground,
		palette: {
			background: diagnostics.palette.roles.background.hex,
			surface: diagnostics.palette.roles.surface.hex,
			foreground: publishedForeground.hex,
			accent: diagnostics.palette.roles.accent.hex,
		},
		parse: {
			width: election.width,
			height: election.height,
			verdict: election.verdict,
			coverage: election.coverage,
			gradient: election.gradient,
			notes: election.notes,
			laneNodeCounts: election.laneNodeCounts,
			backgroundHex: hexOf(background),
			surfaceHex: hexOf(surface),
		},
		assembly: { notes: diagnostics.notes, attempts: diagnostics.attempts, swapped: diagnostics.swapped },
		walk: { ...walk, foregroundSteps: walk.foregroundSteps.slice(0, 12) },
		census: election.census,
		textGroups: election.textGroups.map((group) => ({
			...group,
			twinOfBackground: sameColor(group.rgb, background),
			twinOfSurface: sameColor(group.rgb, surface),
		})),
		firstTextGroupAttribution,
		detector: {
			agrees: mirror.agrees,
			disagreement: mirror.disagreement,
			poolMarks: mirror.poolMarks,
			components: mirror.components,
			componentsAfterLimit: mirror.componentsAfterLimit,
			limitBinds: mirror.limitBinds,
			cuts: mirror.cuts,
			clustersWithEnoughMembers: mirror.clusters.filter((cluster) => cluster.memberCount >= mirror.cuts.TEXT_MIN_COMPONENTS).length,
			topClusters: mirror.clusters.slice(0, 12),
			publishedGroupGeometry: mirror.publishedGroupGeometry,
			leadingGroupMembers: mirror.leadingGroupMembers,
		},
		election: {
			publishedRank,
			skippedAheadOfPublished: skipped.map((entry) => ({
				rank: entry.rank,
				hex: entry.hex,
				provenance: entry.provenance,
				refusedAsTwin: entry.refusedAsTwin,
			})),
			pool: poolWithWalk,
			residualCheck: election.checks,
		},
		attribution,
		secondChoice: {
			secondTextGroup,
			bestNodeBackedCandidate: bestNodeBacked,
			bestNodeBackedAttribution,
		},
	})
}

const report = {
	provenance: "p2-tos-identity/q1@1",
	question: "why did the text detector publish near-whites on cal-014 items 1 and 2",
	candidate: "p2-tos-0.3.0-cycle-2-merged",
	generatedBy: "tos/identity/q1/run.ts",
	items: results,
}
writeFileSync(resolve(HERE, "report.json"), `${JSON.stringify(report, null, "\t")}\n`)
console.log(JSON.stringify(report.items.map((entry) => ({
	item: entry.item,
	reproduced: entry.reproduced,
	fg: entry.publishedForeground,
	textGroups: entry.textGroups.length,
	publishedRank: entry.election.publishedRank,
	provenance: entry.election.pool[entry.election.publishedRank]?.provenance,
	verdict: entry.attribution.verdict,
	maxInradius: entry.attribution.maxInradius,
	barShare: entry.attribution.barShare,
	mirrorAgrees: entry.detector.agrees,
	walkAgrees: entry.walk.agrees,
	walkRefusals: entry.walk.foregroundSteps
		.filter((step) => step.refusal !== null)
		.map((step) => `${step.hex}:${step.refusal}:${step.violations.join(";")}`),
}), ), null, 2))
