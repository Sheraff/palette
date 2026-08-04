/**
 * The growth rule: did any **gated** working area's untagged count rise since the committed census?
 *
 * ## What this is, and what it deliberately is not
 *
 * It is a comparison of two report bodies, run as a normal local test
 * (`tests/honesty-area-growth.test.ts`). It is **not** a CI gate — the reviewer's ruling on build
 * item 15 is explicit that this must not create a CI dependency. A test that fails on the machine of
 * whoever added the constant, at the moment they run the suite, is the whole intent; a red build
 * owned by nobody is the failure mode being avoided.
 *
 * It is also **not** a check that the census is up to date. `cli.ts --check` already answers that by
 * comparing `bodyHash`, and it answers it for the whole tree. This rule answers a narrower and more
 * useful question: *of the areas someone has taken responsibility for, did any get less honest?*
 *
 * ## Why only growth, and only untagged
 *
 * A gated area is allowed to add tunable sites freely, as long as it tags them. The rule therefore
 * watches `untagged`, not `tunableSites` — the alternative would penalise an area for growing at all,
 * which is not what parameter honesty means and would make the metric an argument against writing
 * code.
 *
 * Deleting an untagged site lowers the count and is silently fine; there is no ratchet forcing the
 * count to keep falling. The rule is a floor, not a treadmill.
 *
 * ## The gate-flip case
 *
 * Comparison is against the baseline's *current* gate, read from live config rather than from the
 * committed report, so promoting an area to `GATED` takes effect immediately against the numbers
 * already committed. Promoting an area that is already above its baseline is therefore an instant
 * failure, which is the correct and visible outcome: you cannot gate an area and postpone the debt.
 */

import type { AreaRow } from "./report.ts"
import { gateFor } from "./areas.ts"

export interface AreaRegression {
	area: string
	workstream: string
	baselineUntagged: number
	currentUntagged: number
	/** `currentUntagged - baselineUntagged`, always > 0 for a regression. */
	growth: number
}

export interface GrowthComparison {
	ok: boolean
	regressions: AreaRegression[]
	/** Areas compared under a `GATED` flag, in sorted order — the rule's actual scope. */
	gatedAreas: string[]
	/** Gated areas present in the current census but absent from the baseline. */
	newGatedAreas: string[]
	/** Gated areas in the baseline that no longer appear — deletion, or a rename. Never a failure. */
	vanishedGatedAreas: string[]
}

/**
 * Compare a baseline census's areas against a current one.
 *
 * A gated area that is new (no baseline row) cannot have grown, so it is reported under
 * `newGatedAreas` and never as a regression: its first census *is* its baseline. Treating a new area
 * as a regression from zero would make creating a file a build failure.
 */
export function compareAreaGrowth(
	baseline: readonly AreaRow[],
	current: readonly AreaRow[],
): GrowthComparison {
	const baselineByArea = new Map(baseline.map((row) => [row.area, row]))
	const regressions: AreaRegression[] = []
	const gatedAreas: string[] = []
	const newGatedAreas: string[] = []

	for (const row of [...current].sort((a, b) => a.area.localeCompare(b.area))) {
		const { gate, workstream } = gateFor(row.area)
		if (gate !== "GATED") continue
		gatedAreas.push(row.area)
		const before = baselineByArea.get(row.area)
		if (before === undefined) {
			newGatedAreas.push(row.area)
			continue
		}
		if (row.untagged > before.untagged) {
			regressions.push({
				area: row.area,
				workstream,
				baselineUntagged: before.untagged,
				currentUntagged: row.untagged,
				growth: row.untagged - before.untagged,
			})
		}
	}

	const currentAreas = new Set(current.map((row) => row.area))
	const vanishedGatedAreas = baseline
		.map((row) => row.area)
		.filter((area) => gateFor(area).gate === "GATED" && !currentAreas.has(area))
		.sort()

	return {
		ok: regressions.length === 0,
		regressions,
		gatedAreas,
		newGatedAreas,
		vanishedGatedAreas,
	}
}

/** A reader-facing failure message naming every regressed area and what it would take to clear it. */
export function describeRegressions(comparison: GrowthComparison): string {
	if (comparison.ok) return "no gated area grew"
	const lines = [
		`${comparison.regressions.length} gated area(s) added untagged tunable sites since the committed census:`,
	]
	for (const r of comparison.regressions) {
		lines.push(
			`  ${r.area} (${r.workstream}): ${r.baselineUntagged} -> ${r.currentUntagged} untagged (+${r.growth})`,
		)
	}
	lines.push(
		"Either tag the new constants with a CONVENTIONS.md provenance tag, or — if the growth is intended and reviewed — regenerate the census (node --experimental-strip-types src/honesty/cli.ts) so the new numbers become the baseline.",
	)
	return lines.join("\n")
}
