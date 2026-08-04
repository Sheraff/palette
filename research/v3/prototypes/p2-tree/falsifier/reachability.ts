/**
 * The measurement itself: is each endorsed role colour inside one same-colour bar of *something* the
 * pipeline retained, and — the half that makes it a test of the parse rather than of the exact-pixel
 * rule — is it inside one bar of something in the control set?
 *
 * ## What is computed, and by whom
 *
 * The comparison is **not reimplemented here**. `src/adjudication/match.ts`'s `assessReachability`
 * is called twice per endorsement entry, once with the retained-node representatives and once with
 * the control triples, both under `barMode: "regional"` — which routes through the instrument's own
 * `barFor` → `sameColorBar(available, target)`, the frozen region-dependent ruler. There is no
 * second radius anywhere in this directory (`SPEC.md` binding rules).
 *
 * ## The one thing this file does that the instrument does not
 *
 * `assessReachability` answers `not-assessed` for an **empty** colour set, with an empty `perRole`.
 * That is right for adjudication (a run that supplied no `availableColors` made no claim) and wrong
 * here: a pipeline that retained nothing for an image has not abstained, it has failed to reach
 * every colour in it. Silence is never a pass. So an empty set is expanded into explicit
 * `within: false` rows carrying `emptySet: true`, and the aggregate counts them as unreachable.
 */

import { ROLE_NAMES } from "../../../src/contract/constants.ts"
import type { PaletteColor, RoleName } from "../../../src/contract/types.ts"
import { assessReachability } from "../../../src/adjudication/match.ts"
import type { EvidenceEntry, MatchOptions } from "../../../src/adjudication/types.ts"
import { BAR_MODE } from "./constants.ts"

/** The options every call in this harness uses. All four roles, partial entries compared as-is. */
export const FALSIFIER_MATCH_OPTIONS: MatchOptions = {
	barMode: BAR_MODE,
	roles: ROLE_NAMES,
	partialEntries: "compare-present",
}

/** One side's answer for one role. */
export type SideVerdict = Readonly<{
	nearest: string | null
	barRatio: number | null
	within: boolean
	/** True when the side had no colours at all, so `within: false` is a failure and not an abstention. */
	emptySet: boolean
}>

/** One endorsed role colour, judged from both sides. The falsifier's unit of observation. */
export type ColourRow = Readonly<{
	pipeline: string
	imagePath: string
	artworkSha256: string
	entryId: string
	role: RoleName
	target: string
	node: SideVerdict
	control: SideVerdict
	/**
	 * The pre-registered predicate, per colour: unreachable from the retained nodes **while still
	 * reachable** from the control at the same area floor. The falsifier's numerator is the count of
	 * these.
	 */
	falsifies: boolean
}>

/**
 * Which roles an entry actually constrains.
 *
 * `data/legacy/README.md` A6 and `src/adjudication/types.ts`: a missing role is never a constraint.
 * Three legacy endorsements are partial (one three-role, two single-role), which is why 351 entries
 * yield 1,397 colour slots and not 1,404.
 */
export function presentRoles(entry: EvidenceEntry): RoleName[] {
	return ROLE_NAMES.filter((role) => entry.roles[role] !== undefined)
}

/**
 * One side, as per-role verdicts.
 *
 * Delegates to the adjudication instrument whenever there is anything to delegate; expands the empty
 * case explicitly rather than letting `not-assessed` erase the rows.
 */
export function sideVerdicts(
	entry: EvidenceEntry,
	colors: readonly PaletteColor[],
): Map<RoleName, SideVerdict> {
	const out = new Map<RoleName, SideVerdict>()
	if (colors.length === 0) {
		for (const role of presentRoles(entry)) {
			out.set(role, { nearest: null, barRatio: null, within: false, emptySet: true })
		}
		return out
	}
	const verdict = assessReachability(entry, colors, FALSIFIER_MATCH_OPTIONS)
	for (const perRole of verdict.perRole) {
		out.set(perRole.role, {
			nearest: perRole.nearest,
			barRatio: perRole.barRatio,
			within: perRole.within,
			emptySet: false,
		})
	}
	return out
}

/**
 * Judge one endorsement entry against one image's two colour sets.
 *
 * Rows come out sorted by `ROLE_NAMES` order, which is fixed in `src/contract/constants.ts`; the
 * caller sorts across entries and images.
 */
export function rowsForEntry(
	options: Readonly<{
		pipeline: string
		imagePath: string
		entry: EvidenceEntry
		nodeColors: readonly PaletteColor[]
		controlColors: readonly PaletteColor[]
	}>,
): ColourRow[] {
	const nodes = sideVerdicts(options.entry, options.nodeColors)
	const control = sideVerdicts(options.entry, options.controlColors)
	const missing: SideVerdict = { nearest: null, barRatio: null, within: false, emptySet: true }

	return presentRoles(options.entry).map((role) => {
		const node = nodes.get(role) ?? missing
		const controlSide = control.get(role) ?? missing
		return {
			pipeline: options.pipeline,
			imagePath: options.imagePath,
			artworkSha256: options.entry.artwork.contentSha256,
			entryId: options.entry.entryId,
			role,
			target: options.entry.roles[role]!.hex,
			node,
			control: controlSide,
			falsifies: !node.within && controlSide.within,
		}
	})
}

/** Deterministic row order: pipeline, then image, then entry, then the fixed role order. */
export function sortRows(rows: readonly ColourRow[]): ColourRow[] {
	const roleIndex = new Map(ROLE_NAMES.map((role, index) => [role, index] as const))
	return [...rows].sort((a, b) =>
		a.pipeline.localeCompare(b.pipeline) ||
		a.imagePath.localeCompare(b.imagePath) ||
		a.entryId.localeCompare(b.entryId) ||
		(roleIndex.get(a.role)! - roleIndex.get(b.role)!)
	)
}
