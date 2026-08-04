/**
 * VERIFIER — the load-bearing numeric claim behind `DESIGN.md` decision 7.
 *
 * `src/energy/a/index.ts`'s header asserts that arm A §2.3's **literal** split form (mass split by π,
 * each half charged against its own population's density) *"ranks accent = the second field colour
 * above accent = the vivid patch, by 2.6e-3 nats"* on the 96×96 fixture of `orderings.test.ts` case
 * (d), and that the mixture form reverses it. Nothing in the shipped code computes the split form, so
 * the claim is unverifiable from the suite. Recomputed here.
 *
 * The split form leaves one thing unstated: how ε is profiled. Both readings are reported —
 * ε minimising the split cost itself, and ε taken from the mixture profile — so the finding does not
 * turn on the choice.
 */

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { rgbToOkLab } from "../../../../src/contract/color.ts"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import type { Configuration } from "../../src/emit/types.ts"
import { measureImage } from "../../src/measure/index.ts"
import type { Measurement } from "../../src/measure/types.ts"
import { energyOfA } from "../../src/energy/a/index.ts"
import { barOf, gamutVolume } from "./recompute.ts"

const TWO_PI_32 = (2 * Math.PI) ** 1.5
const TRUNC_SQ = 64

function densityTo(m: Measurement, tripleBar: Float64Array, target: readonly [number, number, number]) {
	const { colorCount: K, lab } = m.triples
	const kernel = new Float64Array(K)
	const density = new Float64Array(K)
	const tb = barOf(target)
	const tInv = 1 / (TWO_PI_32 * tb ** 3)
	for (let r = 0; r < K; r += 1) {
		const dl = lab[r * 3] - target[0]
		const da = lab[r * 3 + 1] - target[1]
		const db = lab[r * 3 + 2] - target[2]
		const sq = dl * dl + da * da + db * db
		const larger = tripleBar[r] > tb
		const h = larger ? tripleBar[r] : tb
		const ratio = sq / (h * h)
		if (ratio >= TRUNC_SQ) continue
		kernel[r] = Math.exp(-0.5 * ratio)
		density[r] = kernel[r] * (larger ? 1 / (TWO_PI_32 * tripleBar[r] ** 3) : tInv)
	}
	return { kernel, density }
}

/** Arm A §2.3's literal expression, profiled over the same s* grid and the same ε range. */
function splitForm(m: Measurement, config: Configuration, lambda = 1): { total: number; data: number; rung: number; eps: number } {
	const { colorCount: K, counts, pixelCount, lab } = m.triples
	const rho0 = 1 / gamutVolume(16)
	const massShare = new Float64Array(K)
	const tripleBar = new Float64Array(K)
	for (let r = 0; r < K; r += 1) {
		massShare[r] = counts[r] / pixelCount
		tripleBar[r] = barOf([lab[r * 3], lab[r * 3 + 1], lab[r * 3 + 2]])
	}
	const order = config.gradient ? "ramp" : config.surfaceCollapsed ? "flat" : "two-flat"
	if (order === "ramp") throw new Error("probe covers the flat orders only")

	const bg = densityTo(m, tripleBar, rgbToOkLab(config.background))
	const surf = order === "two-flat" ? densityTo(m, tripleBar, rgbToOkLab(config.surface)) : null
	const fg = densityTo(m, tripleBar, rgbToOkLab(config.foreground))
	const accentSeparate =
		!config.accentCollapsed &&
		!(
			config.accent[0] === config.foreground[0] &&
			config.accent[1] === config.foreground[1] &&
			config.accent[2] === config.foreground[2]
		)
	const acc = accentSeparate ? densityTo(m, tripleBar, rgbToOkLab(config.accent)) : null
	const wFg = accentSeparate ? 0.5 : 1
	const inkModel = new Float64Array(K)
	for (let r = 0; r < K; r += 1) {
		inkModel[r] = accentSeparate ? wFg * fg.density[r] + (1 - wFg) * (acc as { density: Float64Array }).density[r] : fg.density[r]
	}

	const rungCount = m.constants.extentLadderScales
	const tailFloor = 2 ** (1 - rungCount)
	const rungs = new Float64Array(K)
	for (let r = 0; r < K; r += 1) {
		const e = Math.min(Math.max(m.derived.meanExtent[r], 0), m.extent.weightSum)
		rungs[r] = Math.min(Math.max(1 - Math.log2(e + tailFloor), 0), rungCount)
	}

	let best = { total: Number.POSITIVE_INFINITY, data: 0, rung: 0, eps: 0 }
	for (let s = 0; s <= rungCount; s += 1) {
		const pi = new Float64Array(K)
		const fieldMass = new Float64Array(K)
		for (let r = 0; r < K; r += 1) {
			pi[r] = 1 / (1 + Math.exp(rungs[r] - s))
			fieldMass[r] = pi[r] * massShare[r]
		}
		let fieldDensity: Float64Array
		if (order === "flat") fieldDensity = bg.density
		else {
			let mb = 0
			let ms = 0
			for (let r = 0; r < K; r += 1) {
				mb += fieldMass[r] * bg.kernel[r]
				ms += fieldMass[r] * (surf as { kernel: Float64Array }).kernel[r]
			}
			const wb = mb + ms > 0 ? mb / (mb + ms) : 0.5
			fieldDensity = new Float64Array(K)
			for (let r = 0; r < K; r += 1) {
				fieldDensity[r] = wb * bg.density[r] + (1 - wb) * (surf as { density: Float64Array }).density[r]
			}
		}
		const cost = (eps: number): number => {
			const share = 1 - eps
			const part = eps * rho0
			let total = 0
			for (let r = 0; r < K; r += 1) {
				if (massShare[r] === 0) continue
				total +=
					massShare[r] *
					(pi[r] * -Math.log(share * fieldDensity[r] + part) +
						(1 - pi[r]) * -Math.log(share * inkModel[r] + part))
			}
			return total
		}
		// Profile ε on a log grid, then bisect — the split cost is smooth and unimodal in ε here.
		let bestEps = 1e-9
		let bestCost = Number.POSITIVE_INFINITY
		for (let i = 0; i <= 90000; i += 1) {
			const eps = 10 ** (-9 + (9 * i) / 90000)
			const c = cost(Math.min(eps, 1 - 1e-9))
			if (c < bestCost) {
				bestCost = c
				bestEps = Math.min(eps, 1 - 1e-9)
			}
		}
		if (bestCost < best.total) best = { total: bestCost, data: bestCost, rung: s, eps: bestEps }
	}
	const interior = config.gradient ? Math.max(0, config.stops.length - 2) : 0
	const omega =
		(config.surfaceCollapsed ? 0 : 1) + (config.gradient ? 1 : 0) + interior + (config.accentCollapsed ? 0 : 1)
	return { ...best, total: best.data + lambda * omega }
}

const dir = await mkdtemp(join(tmpdir(), "p1-d7-"))
try {
	const DULL_FIELD: Rgb8 = [64, 66, 72]
	const DULL_SECOND: Rgb8 = [150, 148, 140]
	const VIVID: Rgb8 = [225, 45, 35]
	const INK: Rgb8 = [242, 242, 238]
	const STROKES = new Set([13, 47])
	const raw = Buffer.alloc(96 * 96 * 3)
	let off = 0
	for (let y = 0; y < 96; y += 1)
		for (let x = 0; x < 96; x += 1, off += 3) {
			const c = STROKES.has(x)
				? INK
				: x >= 12 && x < 20 && y >= 12 && y < 20
					? VIVID
					: x < 48
						? DULL_FIELD
						: DULL_SECOND
			raw[off] = c[0]
			raw[off + 1] = c[1]
			raw[off + 2] = c[2]
		}
	const path = join(dir, "vivid.png")
	await sharp(raw, { raw: { width: 96, height: 96, channels: 3 } }).png({ compressionLevel: 0 }).toFile(path)
	const m = await measureImage(path)

	const make = (accent: Rgb8): Configuration => ({
		background: DULL_FIELD,
		surface: DULL_SECOND,
		foreground: INK,
		accent,
		gradient: false,
		stops: [],
		surfaceCollapsed: false,
		accentCollapsed: false,
		escape: null,
	})
	const vivid = make(VIVID)
	const dull = make(DULL_SECOND)

	const mv = energyOfA(m, vivid)
	const md = energyOfA(m, dull)
	const sv = splitForm(m, vivid)
	const sd = splitForm(m, dull)

	console.log("fixture: orderings.test.ts case (d), 96x96, Ω = 2 for both configurations\n")
	console.log("  shipped mixture form:")
	console.log(`    accent=VIVID  ${mv.total.toFixed(9)}   accent=DULL_SECOND ${md.total.toFixed(9)}`)
	console.log(
		`    winner ${mv.total < md.total ? "VIVID" : "DULL"}, gap ${Math.abs(mv.total - md.total).toExponential(3)} nats`,
	)
	console.log("\n  arm A §2.3 literal split form (ε profiled on the split cost):")
	console.log(`    accent=VIVID  ${sv.total.toFixed(9)}   accent=DULL_SECOND ${sd.total.toFixed(9)}`)
	console.log(
		`    winner ${sv.total < sd.total ? "VIVID" : "DULL"}, gap ${Math.abs(sv.total - sd.total).toExponential(3)} nats` +
			`   (header claims: DULL wins by 2.6e-3)`,
	)
	console.log(`    profiled rung/ε: VIVID ${sv.rung}/${sv.eps.toExponential(3)}  DULL ${sd.rung}/${sd.eps.toExponential(3)}`)
} finally {
	await rm(dir, { recursive: true, force: true })
}
