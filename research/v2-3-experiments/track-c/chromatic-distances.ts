/**
 * Chromatic separation between the foreground/accent pairs this track had to decide between,
 * used to place `identityChromaticSeparation` on evidence rather than taste.
 *
 *   node --no-warnings --experimental-strip-types research/v2-3-experiments/track-c/chromatic-distances.ts
 */

import { rgbToOKLab } from "../../v2-3/src/internal/color.ts"

const pairs: ReadonlyArray<readonly [string, string, string]> = [
	["johns pathological", "#cfd4d8", "#f8fcfd"],
	["black reviewed collapse", "#6e6e6e", "#565656"],
	["orelsan reviewed", "#e9dec8", "#6c5f57"],
	["orelsan competitor", "#6c5f57", "#d7c19c"],
	["knuckles preferred", "#d8cbdd", "#60aac5"],
	["artofficial preferred", "#bdc1ca", "#f5e20c"],
	["placebo reviewed", "#fbfdfa", "#111312"],
	["placebo competitor", "#fbfdfa", "#503d2c"],
	["ybbb reviewed", "#f8eeb3", "#0d0b0e"],
	["toxicity reviewed", "#edebd2", "#dd1434"],
	["disney reviewed", "#fbfdfc", "#f68121"],
	["disney current", "#fbfdfc", "#2199d6"],
	["meteora Flo arrangement", "#fafafa", "#a59073"],
]

function oklabOf(hex: string): readonly number[] {
	const value = Number.parseInt(hex.slice(1), 16)
	return rgbToOKLab([(value >> 16) & 255, (value >> 8) & 255, value & 255])
}

for (const [label, first, second] of pairs) {
	const [firstLab, secondLab] = [oklabOf(first), oklabOf(second)]
	const chromatic = Math.hypot(firstLab[1] - secondLab[1], firstLab[2] - secondLab[2])
	const total = Math.hypot(...firstLab.map((value, index) => value - secondLab[index]))
	console.log(`${label.padEnd(26)} ${first} ${second}  chromatic=${chromatic.toFixed(4)}  total=${total.toFixed(4)}`)
}
