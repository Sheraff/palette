/**
 * W-VERIFY step 6, supporting measurement — how far is one LSB, in OKLab, as a function of level?
 *
 * The falsifier's per-cover bar is `POOLED_SAME_COLOR_BAR`. That bar is only a meaningful ceiling for
 * an endpoint move if one LSB of the *source* is itself below it. OKLab's lightness is a cube root of
 * a linear-light quantity, so near black the same 1/255 step is enormously larger in OKLab than it is
 * at mid grey. This prints the size of a `+1 on every channel` step at a range of levels, against the
 * pooled bar and against the region-dependent `sameColorBar` for the pair.
 *
 * Usage, from research/v3:
 *   node --experimental-strip-types prototypes/p5-fieldfit/verify/lsb-scale-probe.ts
 */

import { colorFromRgb, okLabDistance, rgbToOkLab, sameColorBar } from "../../../src/contract/color.ts"
import { POOLED_SAME_COLOR_BAR } from "../../../src/contract/constants.ts"
import type { Rgb8 } from "../../../src/contract/types.ts"

const levels = [0, 1, 2, 4, 8, 16, 32, 64, 128, 200, 254]

process.stdout.write(`pooled bar ${POOLED_SAME_COLOR_BAR}\n\n`)
process.stdout.write(`  level  step            OKLab distance   bars(pooled)  regional bar  same?\n`)
for (const level of levels) {
	const low: Rgb8 = [level, level, level]
	const high: Rgb8 = [level + 1, level + 1, level + 1]
	const distance = okLabDistance(rgbToOkLab(low), rgbToOkLab(high))
	const bar = sameColorBar(colorFromRgb(low), colorFromRgb(high))
	process.stdout.write(
		`  ${String(level).padStart(5)}  ${colorFromRgb(low).hex}→${colorFromRgb(high).hex}` +
			`   ${distance.toExponential(4)}      ${(distance / POOLED_SAME_COLOR_BAR).toFixed(2)}` +
			`          ${bar.toFixed(5)}     ${distance < bar}\n`,
	)
}
