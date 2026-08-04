/**
 * Cross-check: the falsifier's from-scratch OKLab and APCA transforms against the contract's, on a
 * deterministic colour grid. The falsifier is independent of the prototype's `src/`, but it must
 * not be independent of the campaign's *ruler* — if these two disagree, the study is measuring a
 * different space from the one the endorsements were judged in.
 *
 *   node --experimental-strip-types falsifier/selftest.ts
 */

import { apcaRaw, colorFromRgb, colorRegion, rgbToOkLab, sameColorBar } from "../../../src/contract/color.ts"
import { REGION_BAR, REGION_NAMES, apcaRaw8, regionCodeOf, rgb8ToOkLab } from "./fields.ts"
import type { Rgb8 } from "../../../src/contract/types.ts"

const STEP = 17 // 0,17,...,255 — 16^3 = 4096 triples, exhaustive on a coarse grid.

let worstLab = 0
let worstApca = 0
let regionMismatches = 0
let barMismatches = 0
let checked = 0

const grid: number[] = []
for (let value = 0; value <= 255; value += STEP) grid.push(value)

const reference: Rgb8 = [128, 96, 64]

for (const r of grid) {
	for (const g of grid) {
		for (const b of grid) {
			const rgb: Rgb8 = [r, g, b]
			const mine = rgb8ToOkLab(r, g, b)
			const theirs = rgbToOkLab(rgb)
			for (let i = 0; i < 3; i += 1) worstLab = Math.max(worstLab, Math.abs(mine[i] - theirs[i]))

			worstApca = Math.max(worstApca, Math.abs(apcaRaw8(rgb, reference) - apcaRaw(rgb, reference)))

			const myRegion = REGION_NAMES[regionCodeOf(mine[0], mine[1], mine[2])]
			if (myRegion !== colorRegion(colorFromRgb(rgb))) regionMismatches += 1

			const myBar = Math.max(
				REGION_BAR[regionCodeOf(mine[0], mine[1], mine[2])],
				REGION_BAR[regionCodeOf(...rgb8ToOkLab(...reference))],
			)
			if (Math.abs(myBar - sameColorBar(colorFromRgb(rgb), colorFromRgb(reference))) > 1e-12) {
				barMismatches += 1
			}
			checked += 1
		}
	}
}

console.log(JSON.stringify({
	checked,
	maxOkLabChannelDelta: worstLab,
	maxApcaRawDelta: worstApca,
	regionMismatches,
	barMismatches,
}, null, 2))

const ok = worstLab < 1e-12 && worstApca < 1e-9 && regionMismatches === 0 && barMismatches === 0
console.log(ok ? "SELFTEST PASS" : "SELFTEST FAIL")
process.exit(ok ? 0 : 1)
