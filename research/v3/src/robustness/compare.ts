/**
 * Palette-vs-palette comparison, for the two halves of a robustness pair.
 *
 * The question this module answers is narrow: **did the same artwork, presented twice, produce the
 * same palette?** That is not the adjudication question (`src/adjudication/match.ts`), which asks
 * whether a candidate matches *reviewer evidence*. The difference is worth stating because the two
 * look alike and mean different things:
 *
 * - Adjudication compares a candidate against an entry that may carry only *some* roles, so it has
 *   a partial-entry policy and a `null` return meaning "not adjudicated".
 * - Robustness compares two full palettes produced by the *same* candidate. Both sides always carry
 *   all four roles, so there is no partial case, and the relation is **symmetric** — hence
 *   `left`/`right` rather than adjudication's `candidate`/`evidence`.
 *
 * What is deliberately shared: the **bar**. {@link barFor} is imported from `adjudication/match.ts`
 * rather than reimplemented, so "within the same-colour bar" cannot come to mean two different
 * things in two instruments. The contract's regional bar is the default and the only mode any
 * headline number is allowed to use.
 */

import { ROLE_NAMES, colorDistance } from "../contract/index.ts"
import type { Palette, PaletteColor, RoleName } from "../contract/types.ts"
import { barFor } from "../adjudication/match.ts"
import type { BarMode } from "../adjudication/types.ts"
import type { CompareOptions, PaletteComparison, RolePairComparison } from "./types.ts"

/**
 * The comparison every headline agreement rate is computed under.
 *
 * `[REVIEWED]` — the reviewer's wording for this harness is "same-palette = every role within its
 * regional same-colour bar". `regional` is also the contract's calibrated answer and
 * `adjudication/match.ts`'s default; `pooled`, `fixed` and `exact-hex` exist for diagnosis only,
 * and any report produced under them carries the mode it used.
 */
export const DEFAULT_COMPARE_OPTIONS: CompareOptions = {
	barMode: "regional",
	roles: ROLE_NAMES,
}

/** One role of one pair, compared under the requested bar mode. */
export function compareRolePair(
	role: RoleName,
	left: PaletteColor,
	right: PaletteColor,
	barMode: BarMode,
	fixedBar?: number,
): RolePairComparison {
	if (barMode === "exact-hex") {
		return {
			role,
			left: left.hex,
			right: right.hex,
			distance: null,
			bar: null,
			same: left.hex === right.hex,
		}
	}
	const bar = barFor(left, right, barMode, fixedBar)!
	const distance = colorDistance(left, right)
	return { role, left: left.hex, right: right.hex, distance, bar, same: distance < bar }
}

/**
 * Compare the two palettes of one robustness pair.
 *
 * `same` is the conjunction over the compared roles and nothing else. Two things are reported
 * alongside it that are deliberately **not** part of the verdict:
 *
 * - `collapseAgrees` — whether the two sides agree on the surface/accent collapse flags. A palette
 *   can hold all four roles within the bar and still have flipped a role from "collapsed" to
 *   "distinct", which is a real instability a reader should see. It is not folded into `same`
 *   because the reviewer's definition is about colour, and widening it silently would make this
 *   harness's number incomparable with the definition it was approved under.
 * - `gradientPresenceAgrees` — whether both sides emitted a gradient or neither did. Same reasoning.
 *
 * `worstRoleBarRatio` is `max(distance / bar)` over the compared roles: below 1 the pair agrees, and
 * how far below says how much headroom it had. It is `null` under `exact-hex`, where there is no
 * distance to take a ratio of.
 */
export function comparePalettes(
	left: Palette,
	right: Palette,
	options: CompareOptions = DEFAULT_COMPARE_OPTIONS,
): PaletteComparison {
	const comparisons = options.roles.map((role) =>
		compareRolePair(role, left.roles[role], right.roles[role], options.barMode, options.fixedBar),
	)
	const disagreeingRoles = comparisons.filter((c) => !c.same).map((c) => c.role)
	const ratios = comparisons
		.filter((c) => c.distance !== null && c.bar !== null && c.bar > 0)
		.map((c) => c.distance! / c.bar!)
	return {
		same: disagreeingRoles.length === 0,
		barMode: options.barMode,
		rolesCompared: options.roles,
		comparisons,
		disagreeingRoles,
		worstRoleBarRatio: ratios.length > 0 ? Math.max(...ratios) : null,
		collapseAgrees:
			left.collapse.surfaceCollapsed === right.collapse.surfaceCollapsed &&
			left.collapse.accentCollapsed === right.collapse.accentCollapsed,
		gradientPresenceAgrees: (left.gradient === null) === (right.gradient === null),
	}
}
