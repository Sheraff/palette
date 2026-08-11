/**
 * W-M1 probe 1 (ruling R2) — NARCOSIS accent measurement. Read-only: imports the prototype's own
 * modules and re-reads the trace `analyzeImage` already produces. Nothing here is adopted.
 *
 *     node --experimental-strip-types prototypes/p5-fieldfit/measurements/probe-narcosis.ts <img>
 */

import { analyzeImage } from "../candidate.ts"
import { coveredFamilies, sameColorLab } from "../src/assignment.ts"
import type { RoleCandidate } from "../src/assignment.ts"
import { colorDistance, okLabDistance, sameColorBar } from "../../../src/contract/color.ts"
import { ACCENT_VISIBILITY_COLOR_DISTANCE } from "../../../src/contract/constants.ts"
import { ACCENT_FG_EXCLUSION_MULTIPLE } from "../src/overlay.ts"

const image = process.argv[2]
const analysis = await analyzeImage(image)
const { palette, assignment } = analysis
if (assignment === null) throw new Error("no assignment solved")

const bg = palette.roles.background
const sf = palette.roles.surface
const fg = palette.roles.foreground

function row(candidate: RoleCandidate) {
	const dBg = colorDistance(candidate.color, bg)
	const dSf = colorDistance(candidate.color, sf)
	const twinDistance = colorDistance(candidate.color, fg)
	const twinBar = sameColorBar(candidate.color, fg)
	return {
		hex: candidate.color.hex,
		source: candidate.source,
		class: candidate.foregroundClass,
		mass: Number(candidate.mass.toFixed(1)),
		minRawApca: Number(candidate.legibility.toFixed(2)),
		visibilityVsBackground: Number(dBg.toFixed(5)),
		visibilityVsSurface: Number(dSf.toFixed(5)),
		visibilityFloor: ACCENT_VISIBILITY_COLOR_DISTANCE,
		visibilityClears: dBg >= ACCENT_VISIBILITY_COLOR_DISTANCE &&
			dSf >= ACCENT_VISIBILITY_COLOR_DISTANCE,
		twinDistance: Number(twinDistance.toFixed(5)),
		twinBar: Number(twinBar.toFixed(5)),
		twinRatio: Number((twinDistance / twinBar).toFixed(3)),
		twinClears: twinDistance >= ACCENT_FG_EXCLUSION_MULTIPLE * twinBar,
		coversFamilies: coveredFamilies(assignment.identity, [candidate.lab]),
	}
}

const shortlist = assignment.accentShortlist
const rows = shortlist.map(row)

// --- counterfactual orderings, over the same feasible accent shortlist ------------------------
const byMass = [...shortlist].sort((a, b) =>
	b.mass - a.mass || a.cluster.representative - b.cluster.representative
)
const classFirst = [...shortlist].sort((a, b) =>
	(a.foregroundClass === "B" ? 1 : 0) - (b.foregroundClass === "B" ? 1 : 0) ||
	b.mass - a.mass || a.cluster.representative - b.cluster.representative
)
const fieldCovered = new Set(assignment.fieldCovered)
function coverageOf(candidate: RoleCandidate): number {
	const set = new Set(fieldCovered)
	for (const rank of coveredFamilies(assignment!.identity, [assignment!.chosen!.foreground.lab])) {
		set.add(rank)
	}
	for (const rank of coveredFamilies(assignment!.identity, [candidate.lab])) set.add(rank)
	return set.size
}
const coverageFirst = [...shortlist].sort((a, b) =>
	coverageOf(b) - coverageOf(a) ||
	b.mass - a.mass || a.cluster.representative - b.cluster.representative
)

// --- where do sky and crimson sit in the FULL family ranking (not just the top F)? -------------
// Re-read the identity families the trace published (top F) plus the total count; then, for each
// accent candidate, which of the top-F families it sits inside at the shipped 1× radius, and at 8×.
const familyProbe = shortlist.map((candidate) => ({
	hex: candidate.color.hex,
	coversAt1x: assignment.identity.families.filter((f) => sameColorLab(candidate.lab, f.centre, 1))
		.map((f) => f.rank),
	coversAt8x: assignment.identity.families.filter((f) => sameColorLab(candidate.lab, f.centre, 8))
		.map((f) => f.rank),
	nearestFamilyRank: assignment.identity.families
		.map((f) => ({ rank: f.rank, d: okLabDistance(candidate.lab, f.centre) }))
		.sort((a, b) => a.d - b.d)[0],
}))

process.stdout.write(JSON.stringify({
	image,
	published: {
		background: bg.hex,
		surface: sf.hex,
		foreground: fg.hex,
		accent: palette.roles.accent.hex,
	},
	identity: {
		totalFamilies: assignment.identity.totalFamilies,
		massRetained: Number(assignment.identity.massRetained.toFixed(4)),
		familyCount: assignment.familyCount,
		families: assignment.identity.families.map((f) => ({
			rank: f.rank,
			massFraction: Number(f.massFraction.toFixed(4)),
		})),
		fieldCovered: assignment.fieldCovered,
		chosenCoverage: assignment.chosen?.coverage ?? null,
	},
	accentShortlist: rows,
	orderings: {
		currentUnionByMass: byMass.map((c) => c.color.hex),
		classFirst: classFirst.map((c) => `${c.color.hex}(${c.foregroundClass})`),
		coverageFirst: coverageFirst.map((c) => `${c.color.hex}@cov${coverageOf(c)}`),
	},
	familyProbe,
}, null, 2))
