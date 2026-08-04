/**
 * VERIFIER-OWNED. Is the ~0.1 degree axis offset on a 30-degree 8-bit ramp a defect, or the correct
 * answer for a plane fit of a *nonlinear* function of position over a square?
 *
 * Sweeps the ramp angle, and repeats each angle with a ramp built to be linear in OKLab L instead of
 * linear in the 8-bit code value. If the offset is a property of the estimand it must vanish at 45
 * degrees, mirror about 45, and shrink hard on the L-linear ramps.
 */

import { mkdirSync } from "node:fs"
import { join } from "node:path"
import sharp from "sharp"
import { measureImage } from "../../src/measure/index.ts"
import { rgbToOkLab } from "../../../../src/contract/color.ts"

const OUT = process.argv[2]
mkdirSync(OUT, { recursive: true })
const N = 200

// grey code value -> OKLab L, and its inverse by table search
const GREY_L = Array.from({ length: 256 }, (_u, v) => rgbToOkLab([v, v, v])[0])
function greyForL(target: number): number {
	let best = 0
	let bestErr = Infinity
	for (let v = 0; v < 256; v += 1) {
		const err = Math.abs(GREY_L[v] - target)
		if (err < bestErr) {
			bestErr = err
			best = v
		}
	}
	return best
}

async function ramp(name: string, degrees: number, lLinear: boolean): Promise<string> {
	const angle = (degrees * Math.PI) / 180
	const ux = Math.cos(angle)
	const uy = Math.sin(angle)
	let lo = Infinity
	let hi = -Infinity
	for (const [x, y] of [[0, 0], [N - 1, 0], [0, N - 1], [N - 1, N - 1]]) {
		const p = ux * x + uy * y
		if (p < lo) lo = p
		if (p > hi) hi = p
	}
	const raw = Buffer.alloc(N * N * 3)
	let offset = 0
	for (let y = 0; y < N; y += 1) {
		for (let x = 0; x < N; x += 1, offset += 3) {
			const t = (ux * x + uy * y - lo) / (hi - lo)
			const v = lLinear
				? greyForL(GREY_L[0] + t * (GREY_L[255] - GREY_L[0]))
				: Math.max(0, Math.min(255, Math.round(255 * t)))
			raw[offset] = v
			raw[offset + 1] = v
			raw[offset + 2] = v
		}
	}
	const path = join(OUT, name)
	await sharp(raw, { raw: { width: N, height: N, channels: 3 } }).png({ compressionLevel: 0 }).toFile(path)
	return path
}

const results: unknown[] = []
for (const degrees of [0, 15, 30, 45, 60, 75, 90]) {
	for (const lLinear of [false, true]) {
		const path = await ramp(`sweep-${degrees}-${lLinear ? "L" : "v"}.png`, degrees, lLinear)
		const m = await measureImage(path)
		const got = ((m.geometry.linear.axisAngleRadians as number) * 180) / Math.PI
		results.push({ degrees, ramp: lLinear ? "OKLab-L-linear" : "8bit-linear", fitted: got, error: got - degrees })
	}
}
console.log(JSON.stringify(results, null, 0))
