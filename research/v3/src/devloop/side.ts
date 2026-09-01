/**
 * A contract palette, in the shape the pinned mock player renders.
 *
 * **Nothing here is a display decision.** Every one of them was already made and reviewed elsewhere,
 * and this file only routes a `Palette` into them:
 *
 * - the colour **names** come from `review-server/color.ts`, which is the one `colornames-oklab` call
 *   site (`CONVENTIONS.md`: human-facing colour output is always named alongside the hex),
 * - the **field CSS** and the gradient's display positions come from `review-server/gradient.ts`,
 *   which is the pinned `[REVIEWED]` display mapping (`PHASE_0_DECISIONS.md` §2). The browser pastes
 *   `fieldCss` and never composes a ramp itself.
 *
 * Reusing them rather than reimplementing them is the point: a gradient verdict is a verdict about a
 * *rendered* ramp, so a dev viewer that built its own ramp would be showing a developer something no
 * reviewer will ever see — and the difference is real, up to 0.153 OKLab mid-segment if the
 * interpolation space alone is wrong (`contract-ramp.test.ts`).
 *
 * This is a read-only conversion. It never touches the palette and never decides anything about it.
 */

import { nameHexes } from "../review-server/color.ts"
import { canonicalPosition, displayPosition, fieldCss } from "../review-server/gradient.ts"
import { ROLE_NAMES } from "../contract/constants.ts"
import type { Palette } from "../contract/types.ts"

/** One role, as the mock's swatch list wants it. */
export type SideRole = Readonly<{ role: string; hex: string; name: string; collapsed: boolean }>

/** What `mock.js`'s `renderSide` consumes. Its shape is that module's, not this one's. */
export type MockSide = Readonly<{
	roles: readonly SideRole[]
	gradient: Readonly<{ stops: readonly Readonly<{ hex: string; name: string; publishedPosition: number; displayPosition: number }>[] }> | null
	fieldCss: string
}>

/**
 * Build the side payload for one palette.
 *
 * `collapsed` is read off the palette's own flags rather than recomputed from hex equality. The two
 * agree on a valid palette by invariant 3, and where they disagree the palette is lying — which the
 * viewer should show as the palette said it, not quietly correct.
 */
export function sideFromPalette(palette: Palette): MockSide {
	const gradient =
		palette.gradient === null
			? null
			: { stops: palette.gradient.stops.map((stop) => ({ color: stop.color.hex, position: stop.position })) }

	const hexes = [
		...ROLE_NAMES.map((role) => palette.roles[role].hex),
		...(gradient === null ? [] : gradient.stops.map((stop) => stop.color)),
	]
	const names = nameHexes(hexes)

	const collapsedFor = (role: string): boolean =>
		(role === "surface" && palette.collapse.surfaceCollapsed) ||
		(role === "accent" && palette.collapse.accentCollapsed)

	return {
		roles: ROLE_NAMES.map((role) => ({
			role,
			hex: palette.roles[role].hex,
			name: names[palette.roles[role].hex] ?? palette.roles[role].hex,
			collapsed: collapsedFor(role),
		})),
		gradient:
			gradient === null
				? null
				: {
						// Positions go through `gradient.ts`'s own reserve rule and its own canonicalisation.
						// Re-deriving `reserve + p × (1 − reserve)` here would be a second spelling of a
						// [REVIEWED] mapping, and a second spelling is a thing that can drift from the first.
						stops: gradient.stops.map((stop) => ({
							hex: stop.color,
							name: names[stop.color] ?? stop.color,
							publishedPosition: canonicalPosition(stop.position),
							displayPosition: canonicalPosition(displayPosition(stop.position, gradient.stops.length)),
						})),
					},
		fieldCss: fieldCss(gradient, palette.roles.background.hex, names),
	}
}
