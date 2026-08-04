/**
 * Accent — a **lexicographic** rank, never a weighted sum (arm-d §2.6).
 *
 * The accent is a chromatic departure from the field with real support. Its score is a lexicographic
 * rank and the reason is `perception-4`: it measured that a lightness-moving accent works about twice as
 * often at matched distance, and said in the same breath to read that as a *direction* and not a
 * *coefficient*. So this encodes the direction and refuses the coefficient. Two tiers:
 *
 * - **Tier 1** — pixels that clear the same-colour bar from *both* field ends **and** differ from them in
 *   lightness by more than in chroma. Within tier 1, rank by OKLab distance from the nearer field end;
 *   publish the cascade pixel of its top-τ population.
 * - **Tier 2** — reached only when tier 1 is empty after verification: pixels that clear the bar
 *   chromatically only. Published, and **declared as the fragile case**.
 *
 * If tier 2 is also empty after verification, the accent **collapses to exactly the foreground**, flag
 * set — "genuinely no valid accent exists" arrived at as an empty population rather than asserted.
 *
 * ## The qualification level
 *
 * The bar a pixel must clear is the contract's **calibrated same-colour bar**, not
 * `ACCENT_FUNCTIONAL_DISTANCE`. That quantity has refused measurement twice and is stratum-dependent, so
 * a paradigm needing it as a *selection* constant would be betting on a number the campaign has twice
 * declined to produce. It is consumed only where the contract already imposes it — invariant 4's escape,
 * at publication time — and never to choose anything here.
 *
 * ## "Differ in lightness by more than in chroma", as implemented
 *
 * |ΔL| against `hypot(Δa, Δb)` — the lightness axis against the whole chroma plane, measured from the
 * *nearer* field end. Splitting the ab-plane displacement into chroma and hue would need a second
 * decomposition the contract does not sanction outside its report-only challengers, so the comparison is
 * made against the plane. This is a reading of §2.6's phrase, and it is the reading that keeps the
 * arithmetic inside the one ruler's own coordinates.
 *
 * Incidentally, tier 1's preference for lightness-moving accents is also the colour-vision-deficient
 * choice, since lightness contrast survives all common CVD types and hue contrast does not.
 */

import { TRIM_LEVEL } from "./constants.ts"
import type { DecodedImage } from "./decode.ts"
import { cascadePixel, labDistance, sortByKey, topWindow } from "./primitives.ts"

export type AccentTiers = Readonly<{
	/** Lightness-moving departures from both field ends, ordered ascending by distance from the field. */
	tier1: Int32Array
	/** Chroma-only departures, ordered the same way. The fragile case. */
	tier2: Int32Array
	/** Distance from the nearer field end, keyed by pixel index, for both tiers. */
	distanceFromField: Map<number, number>
}>

/**
 * Partition the eligible pixels into the two tiers. One pass; nothing is ranked yet.
 *
 * The eligible set for this role is **all N pixels**, as it is for every role — there is no candidacy
 * wall anywhere in this design, so a colour the reviewer would have chosen cannot be structurally
 * unpublishable; it can only be badly ranked.
 */
export function computeAccentTiers(
	image: DecodedImage,
	background: number,
	surface: number,
): AccentTiers {
	const { lab, bar, eligibleIndices } = image
	const tier1: number[] = []
	const tier2: number[] = []
	const distanceFromField = new Map<number, number>()

	for (let i = 0; i < eligibleIndices.length; i += 1) {
		const index = eligibleIndices[i]

		const toBackground = labDistance(lab, index, background)
		const backgroundBar = bar[index] > bar[background] ? bar[index] : bar[background]
		if (toBackground < backgroundBar) continue

		const toSurface = labDistance(lab, index, surface)
		const surfaceBar = bar[index] > bar[surface] ? bar[index] : bar[surface]
		if (toSurface < surfaceBar) continue

		const nearer = toBackground <= toSurface ? background : surface
		const nearestDistance = toBackground <= toSurface ? toBackground : toSurface
		distanceFromField.set(index, nearestDistance)

		const at = index * 3
		const to = nearer * 3
		const lightnessMove = Math.abs(lab[at] - lab[to])
		const chromaMove = Math.hypot(lab[at + 1] - lab[to + 1], lab[at + 2] - lab[to + 2])
		if (lightnessMove > chromaMove) tier1.push(index)
		else tier2.push(index)
	}

	// Both tiers are sorted here, once, rather than at each step of the verify-and-step loop: stepping a
	// rank moves where the cut is and must never be able to move what the order is.
	const rank = (index: number): number => distanceFromField.get(index) as number
	return {
		tier1: sortByKey(Int32Array.from(tier1), rank),
		tier2: sortByKey(Int32Array.from(tier2), rank),
		distanceFromField,
	}
}

export type AccentChoice = Readonly<{
	pixel: number
	tier: 1 | 2
	/** True for tier 2 — the case §2.6 requires to be declared fragile. */
	fragile: boolean
	populationSize: number
}>

/** The cascade pixel of the top-τ population of one tier, ranked by distance from the nearer field end. */
export function chooseAccent(
	image: DecodedImage,
	tiers: AccentTiers,
	tier: 1 | 2,
	step: number,
): AccentChoice | null {
	const sorted = tier === 1 ? tiers.tier1 : tiers.tier2
	if (sorted.length === 0) return null
	const window = topWindow(sorted, TRIM_LEVEL, step)
	if (window.length === 0) return null
	return {
		pixel: cascadePixel(window, window.length, image.lab, image.rgb),
		tier,
		fragile: tier === 2,
		populationSize: window.length,
	}
}
