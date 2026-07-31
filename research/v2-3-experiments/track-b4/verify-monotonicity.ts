/**
 * Does the design's monotonicity assumption hold?
 *
 * The proposal is that along one ramp segment, background Y(t) is near-monotone, so |Lc(t)| is
 * V-shaped and its continuum minimum is derivable from the endpoints alone (0 when the sign flips
 * inside the segment, else the smaller endpoint magnitude).
 *
 * That is not free. Along an OKLab mix, l/m/s are linear in t but the sRGB channels are their
 * cubes, and APCA's Y weights those channels through a 2.4 power. Expanding Y in terms of the
 * cubed cone responses gives mixed-sign coefficients
 *
 *     Y ~ -0.0404 l^3 + 1.1122 m^3 - 0.0717 s^3
 *
 * so nothing structural forbids a turning point when chroma swings while m stays put. This
 * measures how often that actually happens, and how much error the endpoint shortcut would incur.
 */
import { APCAcontrast, sRGBtoY } from "apca-w3"

import { mixOKLab, oklabToRGB, rgbToOKLab } from "../../v2-3/src/internal/color.ts"
import type { OKLab, RGB } from "../../v2-3/src/internal/types.ts"

/** sRGB channels without the 8-bit rounding, so the sampled curve is the continuum, not a staircase. */
function oklabToFloatSRGB([lightness, a, b]: OKLab): readonly [number, number, number] {
	const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
	const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
	const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
	const linear = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	]
	return linear.map((value) => {
		const clamped = Math.max(0, Math.min(1, value))
		return 255 * (clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055)
	}) as unknown as readonly [number, number, number]
}

const luminance = (lab: OKLab): number => sRGBtoY(oklabToFloatSRGB(lab) as unknown as RGB)
const contrastAt = (text: number, lab: OKLab): number => APCAcontrast(text, luminance(lab))

// Deterministic pseudo-random endpoint pairs spanning the sRGB cube.
let seed = 12345
const next = (): number => {
	seed = (seed * 1103515245 + 12345) & 0x7fffffff
	return seed / 0x7fffffff
}
const randomRGB = (): RGB => [Math.floor(next() * 256), Math.floor(next() * 256), Math.floor(next() * 256)]

const STEPS = 2000
let pairs = 0
let nonMonotoneY = 0
let worstYDip = 0
let nonVShaped = 0
let worstMinimumError = 0
let worstMinimumErrorCase = ""

for (let trial = 0; trial < 20000; trial += 1) {
	const background = rgbToOKLab(randomRGB())
	const surface = rgbToOKLab(randomRGB())
	const text = rgbToOKLab(randomRGB())
	const textY = luminance(text)
	pairs += 1

	let previousY = luminance(background)
	let direction = 0
	let reversals = 0
	let dip = 0
	const values: number[] = []
	for (let step = 0; step <= STEPS; step += 1) {
		const lab = mixOKLab(background, surface, step / STEPS)
		const y = luminance(lab)
		values.push(APCAcontrast(textY, y))
		if (step > 0) {
			const delta = y - previousY
			if (Math.abs(delta) > 1e-12) {
				const sign = Math.sign(delta)
				if (direction !== 0 && sign !== direction) { reversals += 1; dip = Math.max(dip, Math.abs(delta)) }
				direction = sign
			}
		}
		previousY = y
	}
	if (reversals > 0) { nonMonotoneY += 1; worstYDip = Math.max(worstYDip, dip) }

	// The shortcut: 0 if the sign flips, else the smaller endpoint magnitude.
	const first = values[0]
	const last = values[values.length - 1]
	const flips = values.some((value) => value > 0) && values.some((value) => value < 0)
	const predicted = flips ? 0 : Math.min(Math.abs(first), Math.abs(last))
	const actual = Math.min(...values.map(Math.abs))
	const error = Math.abs(predicted - actual)
	if (error > 1e-9) {
		nonVShaped += 1
		if (error > worstMinimumError) {
			worstMinimumError = error
			worstMinimumErrorCase = `bg=${oklabToRGB(background)} su=${oklabToRGB(surface)} text=${oklabToRGB(text)} `
				+ `predicted ${predicted.toFixed(3)} actual ${actual.toFixed(3)}`
		}
	}
}

console.log(`pairs tested                       : ${pairs}`)
console.log(`segments with non-monotone Y(t)    : ${nonMonotoneY} (${(nonMonotoneY / pairs * 100).toFixed(2)}%)`)
console.log(`worst Y reversal magnitude         : ${worstYDip.toExponential(3)}`)
console.log(`endpoint shortcut wrong            : ${nonVShaped} (${(nonVShaped / pairs * 100).toFixed(2)}%)`)
console.log(`worst |Lc| minimum error           : ${worstMinimumError.toFixed(4)}`)
if (worstMinimumErrorCase) console.log(`worst case                         : ${worstMinimumErrorCase}`)
