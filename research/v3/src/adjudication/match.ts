/**
 * Match semantics: when does a candidate palette count as "the same palette" as a standing prior,
 * and could the candidate have produced that prior at all.
 *
 * ## The definition, stated honestly
 *
 * A candidate **matches** an evidence entry when **every compared role colour is the same colour** by
 * the one ruler at that pair's bar. Two things make that sentence load-bearing rather than obvious:
 *
 * - **"The same colour" is `sameColor()` from `src/contract/color.ts`** — Euclidean OKLab distance
 *   against the region-dependent bar calibrated on the reviewer's bracketing rounds and frozen
 *   2026-08-03. Never exact hex. `data/legacy/README.md` decision 2 settles this, and the fixtures
 *   store exact hexes precisely so any bar can be applied after the fact.
 * - **"Every compared role" is not always all four.** Three legacy corrections are partial — one
 *   three-role, two single-role — and README A6 forbids treating a missing role as a constraint. So
 *   the comparison runs over the roles the *entry* carries, and the match records `basis` as
 *   `present-roles-only` when that was fewer than four. A single-role entry matches a great many
 *   palettes; the aggregate counts those separately rather than letting them inflate anything.
 *
 * Roles only. Not `paletteSignature`: it folds in gradient, midpoint and collapse, which do not
 * survive into the v3 contract. The fixtures' own `gradientAdvisory` says gradient comparison against
 * them is advisory at best.
 *
 * ## What a non-match is
 *
 * Nothing. Principle 1: differing from an endorsement is no signal. `worstRoleBarRatio` is recorded
 * on misses anyway, because "missed by 1.02 bars" and "missed by 40 bars" are different facts about a
 * candidate's behaviour — but neither is a cost, and no function here returns a score.
 */

import {
	colorDistance,
	POOLED_SAME_COLOR_BAR,
	ROLE_NAMES,
	sameColorBar,
} from "../contract/index.ts"
import type { PaletteColor, RoleName } from "../contract/index.ts"
import type {
	BarMode,
	EvidenceEntry,
	MatchOptions,
	PaletteMatch,
	ReachabilityVerdict,
	RoleComparison,
} from "./types.ts"

export const DEFAULT_MATCH_OPTIONS: MatchOptions = {
	barMode: "regional",
	roles: ROLE_NAMES,
	partialEntries: "compare-present",
}

/**
 * The bar for one pair, under the requested mode.
 *
 * `regional` is the calibrated answer and the default. `pooled` returns `POOLED_SAME_COLOR_BAR`,
 * which `data/legacy/README.md` states plainly **is not the gate's bar** — it exists for corpus
 * metrics that need one number comparable across runs, and any report produced with it says so.
 * `exact-hex` returns `null`: it measures nothing, and returning 0 would invite a reader to treat a
 * string comparison as a distance.
 */
export function barFor(
	first: PaletteColor,
	second: PaletteColor,
	mode: BarMode,
	fixedBar?: number,
): number | null {
	switch (mode) {
		case "regional":
			return sameColorBar(first, second)
		case "pooled":
			return POOLED_SAME_COLOR_BAR
		case "fixed":
			if (fixedBar === undefined || !Number.isFinite(fixedBar) || fixedBar <= 0) {
				throw new Error("barMode 'fixed' needs a positive finite --bar value")
			}
			return fixedBar
		case "exact-hex":
			return null
	}
}

/** One role, compared under the requested bar mode. */
export function compareRole(
	role: RoleName,
	candidate: PaletteColor,
	evidence: PaletteColor,
	options: MatchOptions,
): RoleComparison {
	if (options.barMode === "exact-hex") {
		return {
			role,
			candidate: candidate.hex,
			evidence: evidence.hex,
			distance: null,
			bar: null,
			same: candidate.hex === evidence.hex,
		}
	}
	const bar = barFor(candidate, evidence, options.barMode, options.fixedBar)!
	const distance = colorDistance(candidate, evidence)
	return { role, candidate: candidate.hex, evidence: evidence.hex, distance, bar, same: distance < bar }
}

/**
 * Compare one candidate palette against one evidence entry.
 *
 * Returns `null` when there is nothing to compare — the entry carries none of the requested roles, or
 * it is partial and the policy is `skip`. A null is "this entry was not adjudicated", which is a
 * different statement from "it did not match", and the caller keeps them apart.
 */
export function matchPalette(
	candidateRoles: Readonly<Record<RoleName, PaletteColor>>,
	entry: EvidenceEntry,
	options: MatchOptions = DEFAULT_MATCH_OPTIONS,
): PaletteMatch | null {
	const requested = options.roles.length > 0 ? options.roles : ROLE_NAMES
	const compared: RoleName[] = []
	const skipped: RoleName[] = []
	for (const role of requested) {
		if (entry.roles[role] && candidateRoles[role]) compared.push(role)
		else skipped.push(role)
	}
	if (compared.length === 0) return null

	const basis = skipped.length === 0 && requested.length === ROLE_NAMES.length
		? "all-four-roles"
		: "present-roles-only"
	if (basis === "present-roles-only" && options.partialEntries === "skip") return null

	const comparisons = compared.map((role) => compareRole(role, candidateRoles[role]!, entry.roles[role]!, options))
	const ratios = comparisons
		.map((comparison) => (comparison.distance !== null && comparison.bar ? comparison.distance / comparison.bar : null))
		.filter((ratio): ratio is number => ratio !== null)

	return {
		entryId: entry.entryId,
		matched: comparisons.every((comparison) => comparison.same),
		basis,
		rolesCompared: compared,
		rolesSkipped: skipped,
		comparisons,
		worstRoleBarRatio: ratios.length > 0 ? Math.max(...ratios) : null,
	}
}

/**
 * **Reachability** — could this candidate's colour set have produced this entry's palette?
 *
 * The angle v2-3 used, and it answers a question matching cannot. A candidate that *differs* from an
 * endorsement is exercising the freedom principle 1 grants it — no signal either way. A candidate
 * whose available colour set does not **contain** the endorsed colours could not have agreed even if
 * it had wanted to. That is a fact about the paradigm's ceiling, and it is reported beside the match,
 * never folded into it and never charged against anything.
 *
 * The colour set is the candidate's own: whatever pool the algorithm chose from for this artwork.
 * Without one, the answer is `not-assessed` — silence is never a pass.
 */
export function assessReachability(
	entry: EvidenceEntry,
	availableColors: readonly PaletteColor[] | undefined,
	options: MatchOptions = DEFAULT_MATCH_OPTIONS,
): ReachabilityVerdict {
	const requested = options.roles.length > 0 ? options.roles : ROLE_NAMES
	const present = requested.filter((role) => entry.roles[role])
	const skipped = requested.filter((role) => !entry.roles[role])

	if (!availableColors || availableColors.length === 0) {
		return { status: "not-assessed", perRole: [], rolesSkipped: skipped }
	}

	const perRole = present.map((role) => {
		const target = entry.roles[role]!
		let nearest: PaletteColor | null = null
		let nearestRatio = Number.POSITIVE_INFINITY
		for (const available of availableColors) {
			if (options.barMode === "exact-hex") {
				if (available.hex === target.hex) {
					nearest = available
					nearestRatio = 0
					break
				}
				continue
			}
			const bar = barFor(available, target, options.barMode, options.fixedBar)!
			const ratio = colorDistance(available, target) / bar
			if (ratio < nearestRatio) {
				nearestRatio = ratio
				nearest = available
			}
		}
		const within = options.barMode === "exact-hex" ? nearestRatio === 0 : nearestRatio < 1
		return {
			role,
			target: target.hex,
			nearest: nearest?.hex ?? null,
			barRatio: Number.isFinite(nearestRatio) ? nearestRatio : null,
			within,
		}
	})

	return {
		status: perRole.length > 0 && perRole.every((entry) => entry.within) ? "reachable" : "unreachable",
		perRole,
		rolesSkipped: skipped,
	}
}
