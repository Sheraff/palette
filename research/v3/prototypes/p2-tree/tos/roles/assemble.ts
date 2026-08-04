/**
 * **Twins must collapse.** Assembly-level enforcement of the reviewer's forbidden outcome.
 *
 * Round 1, verbatim, on `…21256ce593`: *"surface≈accent — **forbidden**"*. The obligation the round
 * handed cycle 2 is *"indistinguishable sibling pairs must collapse — never publish twins. Enforce as
 * assembly machinery, not a hope."*
 *
 * Cycle 1's machinery was a hope. `candidate.ts` walked the foreground ranking, re-validated, and — on
 * exhaustion — published its first choice anyway (`if (settled === null) return first`). That path
 * publishes exactly the palette the contract objected to. Worse, it is the *reachable* path whenever
 * the defect is in the **field** pair: if `surface` sits inside `background`'s same-colour bar without
 * being exactly equal, no choice of foreground can ever validate, so the walk exhausts on every
 * candidate and publishes twins with a clean face.
 *
 * ## The rule, stated as a matrix
 *
 * Six pairs among the four roles. Two of them have a **sanctioned collapse** — the contract's own
 * `SANCTIONED_COLLAPSE_PAIRS`:
 *
 * | pair | inside the same-colour bar ⇒ |
 * |---|---|
 * | `surface` ↔ `background` | **collapse**: `surface := background`, exactly, flag set, gradient dropped |
 * | `accent` ↔ `foreground` | **collapse**: `accent := foreground`, exactly, flag set |
 * | `foreground` ↔ `background` | **re-resolve**: next candidate in the foreground ranking |
 * | `foreground` ↔ `surface` | **re-resolve**: next candidate in the foreground ranking |
 * | `accent` ↔ `background` | **re-resolve**: next candidate in the accent ranking |
 * | `accent` ↔ `surface` | **re-resolve**: next candidate in the accent ranking |
 *
 * A collapse is only a collapse when it is **exact hex equality with the flag set** — invariant 3 says
 * so and refuses to let a flag launder a near-identical pair. So the collapse here assigns the
 * *identical triple*, never "close enough".
 *
 * The field-pair collapse is applied in `pipeline.ts` where `background` and `surface` are chosen, so
 * that the pools are ranked against the field that will actually be published. This module owns the
 * four re-resolving cells and the accent's collapse.
 *
 * ## Re-validation after every repair step
 *
 * Every candidate pair is assembled into a whole `Palette` and run through `validatePalette` before it
 * is accepted. That is what makes "the repair must not relocate the defect" a property of the code:
 * a foreground that clears the twin test but fails invariant 4 against the ramp is not accepted, and
 * the walk continues. The twin filter is applied *before* assembly purely as a cheap pre-filter — it
 * removes candidates `validatePalette` would reject anyway, without spending a ramp minimisation on
 * them.
 *
 * ## What happens when nothing clears
 *
 * The walk reports it rather than hiding it. `notes` carries `foreground-walk-exhausted` and, if the
 * artwork genuinely contains no colour outside its own field's bar, `foreground-twin-unavoidable` —
 * and in that case the published palette *does* carry a violation, visibly, because the honest answer
 * for a cover whose every colour is its background is that it has no foreground, and the contract is
 * the right place for that to be said. Silence there would be the cycle-1 defect wearing a new name.
 */

import { colorFromRgb, okLabDistance, rgbToOkLab, sameColorBar } from "../../../../src/contract/color.ts"
import { FOREGROUND_ACCENT_SEPARATION_DISTANCE } from "../../../../src/contract/constants.ts"
import { validatePalette } from "../../../../src/contract/invariants.ts"
import type { Palette, Rgb8 } from "../../../../src/contract/types.ts"

/** Two colours the contract's one ruler calls the same colour. */
export function sameColorRgb(first: Rgb8, second: Rgb8): boolean {
	return okLabDistance(rgbToOkLab(first), rgbToOkLab(second)) < sameColorBar(colorFromRgb(first), colorFromRgb(second))
}

/** The colour distance the contract requires between foreground and accent (invariant 3's raised cell). */
export function separatedFromForeground(accent: Rgb8, foreground: Rgb8): boolean {
	return okLabDistance(rgbToOkLab(accent), rgbToOkLab(foreground)) >= FOREGROUND_ACCENT_SEPARATION_DISTANCE
}

export type RoleResolution = Readonly<{
	palette: Palette
	foreground: Rgb8
	accent: Rgb8
	notes: readonly string[]
	/** How many whole-palette re-validations the walk spent. Reported, never used as evidence. */
	attempts: number
}>

/**
 * Walk the two rankings under the twin matrix, re-validating at every step.
 *
 * `assemble` is the caller's palette constructor — it owns the metadata, the gradient and the collapse
 * flags, and it is called once per candidate pair so that what the validator sees is the whole object
 * that would be published and never a stand-in.
 */
export function resolveRoles(params: {
	background: Rgb8
	surface: Rgb8
	foregroundPool: readonly Rgb8[]
	accentPool: readonly Rgb8[]
	assemble: (foreground: Rgb8, accent: Rgb8) => Palette
	maxAttempts: number
}): RoleResolution {
	const { background, surface, foregroundPool, accentPool, assemble, maxAttempts } = params
	const notes: string[] = []
	let attempts = 0

	// A foreground or an accent inside a field role's bar has **no sanctioned collapse** and can only
	// be re-resolved, so it is not a candidate at all.
	const twinOfField = (color: Rgb8): boolean => sameColorRgb(color, background) || sameColorRgb(color, surface)

	const foregrounds = foregroundPool.filter((color) => !twinOfField(color))
	if (foregrounds.length === 0) notes.push("foreground-twin-unavoidable")

	// The foreground is settled first, against an accent collapsed onto it: the palette the contract
	// then judges is a statement about the foreground alone, and a cross-product would spend the whole
	// budget re-testing one foreground against sixteen accents when the foreground is what failed.
	let settled: Palette | null = null
	let settledForeground = foregrounds[0] ?? foregroundPool[0] ?? background
	for (const foreground of foregrounds) {
		if (attempts >= maxAttempts) break
		attempts += 1
		const palette = assemble(foreground, foreground)
		if (validatePalette(palette).violations.length === 0) {
			settled = palette
			settledForeground = foreground
			break
		}
	}
	if (settled === null) {
		notes.push("foreground-walk-exhausted")
		settled = assemble(settledForeground, settledForeground)
	}

	// Now the accent, against the foreground that cleared. Three filters, all of them the contract's:
	// not a twin of a field role, separated from the foreground by invariant 3's raised bar, and the
	// whole palette re-validated.
	for (const accent of accentPool) {
		if (attempts >= maxAttempts) break
		if (twinOfField(accent)) continue
		if (!separatedFromForeground(accent, settledForeground)) continue
		attempts += 1
		const palette = assemble(settledForeground, accent)
		if (validatePalette(palette).violations.length === 0) {
			return { palette, foreground: settledForeground, accent, notes, attempts }
		}
	}

	// Nothing in the accent ranking cleared, so the accent stays collapsed onto the foreground — a
	// sanctioned outcome carrying a declared flag, not a repair and not a twin.
	notes.push("accent-collapsed:no-separated-candidate")
	return { palette: settled, foreground: settledForeground, accent: settledForeground, notes, attempts }
}

/**
 * **The role-swap check.** Are the two mark roles the right way round?
 *
 * Reviewer evidence from the released campaign shows foreground↔accent *ordering* errors on colours
 * the extractor had already recovered correctly — a round asked for a swap of two colours that were
 * both already in the palette. That is not an extraction failure and no amount of better candidate
 * generation fixes it; it is an assignment failure, and it belongs at assembly.
 *
 * The test is the two rankings the parse already published, and nothing else:
 *
 * > swap ⟺ the accent sits **earlier in the foreground ranking** than the foreground does, **and** the
 * > foreground sits **earlier in the accent ranking** than the accent does — and the swapped palette
 * > validates.
 *
 * **Strict on both, or no swap.** A pair that improves one role and ties or worsens the other is left
 * alone: choosing there would be taste, and taste is what a lexicographic order exists to avoid. The
 * check therefore costs zero constants and is a pure function of two orderings the parse computed
 * before it knew which colour would land in which role.
 *
 * A collapsed accent is never swapped — there is only one colour, and swapping it with itself is the
 * identity.
 */
export function roleSwapImproves(params: {
	foreground: Rgb8
	accent: Rgb8
	foregroundPool: readonly Rgb8[]
	accentPool: readonly Rgb8[]
}): boolean {
	const { foreground, accent, foregroundPool, accentPool } = params
	const key = (color: Rgb8): number => (color[0] << 16) | (color[1] << 8) | color[2]
	if (key(foreground) === key(accent)) return false
	const rankIn = (pool: readonly Rgb8[], color: Rgb8): number => {
		const index = pool.findIndex((candidate) => key(candidate) === key(color))
		return index === -1 ? Number.POSITIVE_INFINITY : index
	}
	const foregroundImproves = rankIn(foregroundPool, accent) < rankIn(foregroundPool, foreground)
	const accentImproves = rankIn(accentPool, foreground) < rankIn(accentPool, accent)
	return foregroundImproves && accentImproves
}

/**
 * **The published-palette twin audit.** Which role pairs are indistinguishable without being a
 * sanctioned, exact, flagged collapse.
 *
 * A pure function of the finished palette, so a test can assert the forbidden outcome is absent from
 * an artefact rather than trusting the code that produced it. Returns `"role|role"` keys, ascending.
 */
export function forbiddenTwinPairs(palette: Palette): string[] {
	const roles = ["background", "surface", "foreground", "accent"] as const
	const sanctioned = new Map<string, boolean>([
		["background|surface", palette.collapse?.surfaceCollapsed === true],
		["accent|foreground", palette.collapse?.accentCollapsed === true],
	])
	const found: string[] = []
	for (let first = 0; first < roles.length; first += 1) {
		for (let second = first + 1; second < roles.length; second += 1) {
			const one = palette.roles[roles[first]]
			const other = palette.roles[roles[second]]
			const key = roles[first] < roles[second] ? `${roles[first]}|${roles[second]}` : `${roles[second]}|${roles[first]}`
			if (!sameColorRgb(one.rgb, other.rgb)) continue
			// Exactly equal *and* flagged is the contract's sanctioned collapse and is not a twin.
			if (sanctioned.get(key) === true && one.hex === other.hex) continue
			found.push(key)
		}
	}
	return found.sort()
}
