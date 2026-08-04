/**
 * VERIFIER — check 8: `DESIGN.md` decision 9's own fixture, scored by the independent
 * reimplementation as well as by the module.
 *
 * The defect the verifier found: on a clean 64×64 diptych (two flat halves, no ink anywhere) the
 * description *"flat field, second band as foreground"* (Ω = 0) undercut *"two flat areas"* (Ω = 1)
 * at every λ, because the split-scale profile could move 62% of the image's mass into the ink
 * population for free. The claimed repair flips it at λ = 1 and puts the crossover at λ ≈ 1.2748.
 *
 * Both numbers are reproduced here from `recompute.ts`'s independent arm A, which knows nothing of
 * `support.ts` and rebuilds the extent code from the stated densities. Ω differs by exactly 1 between
 * the two configurations, so the crossover λ **is** the data-term gap — no separate sweep is needed
 * to locate it, but one is run anyway as a control on that reasoning.
 */

import { measureImage } from "../../src/measure/index.ts"
import { energyOfA } from "../../src/energy/a/index.ts"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import { armA } from "./recompute.ts"
import { cleanupFixtures, configuration, writeRgbImage } from "../energy-a/support.ts"

const TOP: Rgb8 = [20, 22, 30]
const BOTTOM: Rgb8 = [230, 228, 220]

const path = await writeRgbImage("verify-diptych.png", 64, 64, (_x, y) => (y < 32 ? TOP : BOTTOM))
const measurement = await measureImage(path)

const flat = configuration({ background: TOP, foreground: BOTTOM })
const twoFlat = configuration({ background: TOP, surface: BOTTOM, foreground: BOTTOM })

console.log("λ = 1 — subject vs independent recomputation\n")
const rows: { label: string; subject: number; mine: number; data: number; omega: number }[] = []
for (const [label, config] of [
	["two-flat (Ω=1)", twoFlat],
	["flat, fg=band (Ω=0)", flat],
] as const) {
	const s = energyOfA(measurement, config)
	const v = armA(measurement, config)
	rows.push({ label, subject: s.total, mine: v.total, data: v.field + v.ink, omega: v.omega })
	console.log(
		`  ${label.padEnd(22)} subject ${s.total.toPrecision(12).padStart(18)}   mine ${v.total
			.toPrecision(12)
			.padStart(18)}   rel ${(Math.abs(s.total - v.total) / Math.max(Math.abs(s.total), 1e-300)).toExponential(2)}`,
	)
	console.log(
		`  ${"".padEnd(22)} rung ${s.nuisance.splitScaleRung}/${v.splitScaleRung}  inkMass ${(
			s.nuisance.inkMassFraction as number
		).toFixed(4)}  π₀ ${(s.nuisance.fieldPrior as number).toPrecision(6)}/${v.fieldPrior.toPrecision(6)}` +
			`  support ${(s.nuisance.extentSupportCost as number).toPrecision(10)}/${v.supportCost.toPrecision(10)}`,
	)
}

const gap = rows[1].data - rows[0].data
console.log(
	`\ntwo-flat ${rows[0].mine.toFixed(4)} vs flat ${rows[1].mine.toFixed(4)} at λ = 1 — ` +
		`${rows[0].mine < rows[1].mine ? "two-flat WINS" : "flat wins"}`,
)
console.log(`data-term gap = crossover λ (ΔΩ = 1) = ${gap.toPrecision(12)}`)

// The same fixture with the extent code switched off — decision 9's defect, rebuilt by the same
// implementation so the before/after is one instrument's measurement rather than two reports'.
console.log("\npre-fix control (colour coded given a free extent map), independent recomputation")
for (const [label, config] of [
	["two-flat (Ω=1)", twoFlat],
	["flat, fg=band (Ω=0)", flat],
] as const) {
	const v = armA(measurement, config, 1, { withSupport: false })
	console.log(
		`  ${label.padEnd(22)} total ${v.total.toPrecision(12).padStart(18)}  rung ${v.splitScaleRung}` +
			`  inkMass ${(1 - v.fieldMassFraction).toFixed(4)}`,
	)
}
{
	const f = armA(measurement, flat, 1, { withSupport: false })
	const t = armA(measurement, twoFlat, 1, { withSupport: false })
	console.log(
		`  pre-fix winner at λ=1: ${t.total < f.total ? "two-flat" : "flat"}   ` +
			`pre-fix data gap = crossover λ = ${(f.field + f.ink - (t.field + t.ink)).toPrecision(6)}`,
	)
}

// Control: locate the crossover by bisection on the independent totals, without using ΔΩ = 1.
let low = 0
let high = 8
for (let step = 0; step < 60; step += 1) {
	const mid = (low + high) / 2
	const f = armA(measurement, flat, mid).total
	const t = armA(measurement, twoFlat, mid).total
	if (t < f) low = mid
	else high = mid
}
console.log(`bisected crossover λ (independent totals) = ${((low + high) / 2).toPrecision(12)}`)

console.log("\nλ sweep — independent recomputation")
for (const lambda of [0.25, 0.5, 1, 2, 4]) {
	const f = armA(measurement, flat, lambda).total
	const t = armA(measurement, twoFlat, lambda).total
	console.log(
		`  λ=${String(lambda).padEnd(5)} two-flat ${t.toFixed(6).padStart(12)}  flat ${f
			.toFixed(6)
			.padStart(12)}  winner ${t < f ? "two-flat" : "flat"}`,
	)
}

await cleanupFixtures()
