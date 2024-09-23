import type { ColorSpace } from "./types"

const negativePercentToHex = 255 / 250

const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

const factIn = 2.4
const rgb2srgbLinearBase = (c: number) => ((c + 0.055) / 1.055) ** factIn
const factOut = 1 / factIn
const srgbLinear2rgbBase = (c: number) => 1.055 * (c ** factOut) - 0.055

// conversions
const WHITES_D50 = [0.3457 / 0.3585, 1.00000, (1.0 - 0.3457 - 0.3585) / 0.3585]
const ε = 216 / 24389
const ε3 = 24 / 116
const κ = 24389 / 27

// distance
const dε = .000075
const Gfactor = 25 ** 7
const π = Math.PI
const r2d = 180 / π
const d2r = π / 180
const kL = 1
const kC = 1
const kH = 1

export const labSpace: ColorSpace = {
	name: "lab",
	toHex(array, index) {
		/**
		 * source https://gist.github.com/dkaraush/65d19d61396f5f3cd8ba7d1b4b3c9432
		 * source https://github.com/color-js/color.js/blob/main/src/spaces/oklch.js
		 */
		const r = array[index]
		const g = array[index + 1]
		const b = array[index + 2]

		const sr = rgb2srgbLinearBase(r)
		const sg = rgb2srgbLinearBase(g)
		const sb = rgb2srgbLinearBase(b)

		/**
		 * xyz 65
		 * source: https://github.com/color-js/color.js/blob/main/src/spaces/srgb-linear.js
		 */
		const x = 0.41239079926595934 * sr + 0.357584339383878 * sg + 0.1804807884018343 * sb
		const y = 0.21263900587151027 * sr + 0.715168678767756 * sg + 0.07219231536073371 * sb
		const z = 0.01933081871559182 * sr + 0.11919477979462598 * sg + 0.9505321522496607 * sb

		const x2 = x / WHITES_D50[0]
		const y2 = y / WHITES_D50[1]
		const z2 = z / WHITES_D50[2]

		const f0 = x2 > ε ? Math.cbrt(x2) : (κ * x2 + 16) / 116
		const f1 = y2 > ε ? Math.cbrt(y2) : (κ * y2 + 16) / 116
		const f2 = z2 > ε ? Math.cbrt(z2) : (κ * z2 + 16) / 116

		const l1 = 116 * f1 - 16
		const a1 = 500 * (f0 - f1)
		const b1 = 200 * (f1 - f2)

		return Math.round(l1 * 2.55) << 16 | Math.round((a1 + 125) * negativePercentToHex) << 8 | Math.round((b1 + 125) * negativePercentToHex)
	},
	toRgb(hex) {
		const l = (hex >> 16) / 2.55
		const a = (hex >> 8 & 0xff) / negativePercentToHex - 125
		const b = (hex & 0xff) / negativePercentToHex - 125

		const f1 = (l + 16) / 116
		const f0 = a / 500 + f1
		const f2 = f1 - b / 200

		const x0 = f0 > ε3 ? Math.pow(f0, 3) : (116 * f0 - 16) / κ
		const y0 = l > 8 ? Math.pow((l + 16) / 116, 3) : l / κ
		const z0 = f2 > ε3 ? Math.pow(f2, 3) : (116 * f2 - 16) / κ

		const x1 = x0 * WHITES_D50[0]
		const y1 = y0 * WHITES_D50[1]
		const z1 = z0 * WHITES_D50[2]

		const sr = 3.2409699419045226 * x1 + -1.537383177570094 * y1 + -0.4986107602930034 * z1
		const sg = -0.9692436362808796 * x1 + 1.8759675015077202 * y1 + 0.04155505740717559 * z1
		const sb = 0.05563007969699366 * x1 + -0.20397695888897652 * y1 + 1.0569715142428786 * z1

		return clamp(srgbLinear2rgbBase(sr)) << 16 | clamp(srgbLinear2rgbBase(sg)) << 8 | clamp(srgbLinear2rgbBase(sb))
	},
	contrast(hex1, hex2) {
		const L1 = (hex1 >> 16)
		const L2 = (hex2 >> 16)
		return Math.abs(L1 - L2) / 2.55
	},
	/**
	 * https://github.com/color-js/color.js/blob/main/src/deltaE/deltaEOK2.js
	 */
	distance(hex1: number, hex2: number): number {
		const L1 = hex1 >> 16
		const a1 = hex1 >> 8 & 0xff
		const b1 = hex1 & 0xff
		const isAchromatic1 = Math.abs(a1) < dε && Math.abs(b1) < dε
		const C1 = isAchromatic1 ? 0 : Math.sqrt(a1 ** 2 + b1 ** 2)

		const L2 = hex2 >> 16
		const a2 = hex2 >> 8 & 0xff
		const b2 = hex2 & 0xff
		const isAchromatic2 = Math.abs(a2) < dε && Math.abs(b2) < dε
		const C2 = isAchromatic2 ? 0 : Math.sqrt(a2 ** 2 + b2 ** 2)

		let Cbar = (C1 + C2) / 2 // mean Chroma

		// calculate a-axis asymmetry factor from mean Chroma
		// this turns JND ellipses for near-neutral colors back into circles
		let C7 = pow7(Cbar)

		let G = 0.5 * (1 - Math.sqrt(C7 / (C7 + Gfactor)))

		// scale a axes by asymmetry factor
		// this by the way is why there is no Lab2000 colorspace
		let adash1 = (1 + G) * a1
		let adash2 = (1 + G) * a2

		// calculate new Chroma from scaled a and original b axes
		let Cdash1 = Math.sqrt(adash1 ** 2 + b1 ** 2)
		let Cdash2 = Math.sqrt(adash2 ** 2 + b2 ** 2)

		// calculate new hues, with zero hue for true neutrals
		// and in degrees, not radians

		let h1 = (adash1 === 0 && b1 === 0) ? 0 : Math.atan2(b1, adash1)
		let h2 = (adash2 === 0 && b2 === 0) ? 0 : Math.atan2(b2, adash2)

		if (h1 < 0) {
			h1 += 2 * π
		}
		if (h2 < 0) {
			h2 += 2 * π
		}

		h1 *= r2d
		h2 *= r2d

		// Lightness and Chroma differences; sign matters
		let ΔL = L2 - L1
		let ΔC = Cdash2 - Cdash1

		// Hue difference, getting the sign correct
		let hdiff = h2 - h1
		let hsum = h1 + h2
		let habs = Math.abs(hdiff)
		let Δh

		if (Cdash1 * Cdash2 === 0) {
			Δh = 0
		}
		else if (habs <= 180) {
			Δh = hdiff
		}
		else if (hdiff > 180) {
			Δh = hdiff - 360
		}
		else if (hdiff < -180) {
			Δh = hdiff + 360
		}
		else {
			throw new Error("should not be possible")
		}

		// weighted Hue difference, more for larger Chroma
		let ΔH = 2 * Math.sqrt(Cdash2 * Cdash1) * Math.sin(Δh * d2r / 2)

		// calculate mean Lightness and Chroma
		let Ldash = (L1 + L2) / 2
		let Cdash = (Cdash1 + Cdash2) / 2
		let Cdash7 = pow7(Cdash)

		// Compensate for non-linearity in the blue region of Lab.
		// Four possibilities for hue weighting factor,
		// depending on the angles, to get the correct sign
		let hdash
		if (Cdash1 * Cdash2 === 0) {
			hdash = hsum   // which should be zero
		}
		else if (habs <= 180) {
			hdash = hsum / 2
		}
		else if (hsum < 360) {
			hdash = (hsum + 360) / 2
		}
		else {
			hdash = (hsum - 360) / 2
		}

		// positional corrections to the lack of uniformity of CIELAB
		// These are all trying to make JND ellipsoids more like spheres

		// SL Lightness crispening factor
		// a background with L=50 is assumed
		let lsq = (Ldash - 50) ** 2
		let SL = 1 + ((0.015 * lsq) / Math.sqrt(20 + lsq))

		// SC Chroma factor, similar to those in CMC and deltaE 94 formulae
		let SC = 1 + 0.045 * Cdash

		// Cross term T for blue non-linearity
		let T = 1
		T -= (0.17 * Math.cos((hdash - 30) * d2r))
		T += (0.24 * Math.cos(2 * hdash * d2r))
		T += (0.32 * Math.cos(((3 * hdash) + 6) * d2r))
		T -= (0.20 * Math.cos(((4 * hdash) - 63) * d2r))

		// SH Hue factor depends on Chroma,
		// as well as adjusted hue angle like deltaE94.
		let SH = 1 + 0.015 * Cdash * T

		// RT Hue rotation term compensates for rotation of JND ellipses
		// and Munsell constant hue lines
		// in the medium-high Chroma blue region
		// (Hue 225 to 315)
		let Δθ = 30 * Math.exp(-1 * (((hdash - 275) / 25) ** 2))
		let RC = 2 * Math.sqrt(Cdash7 / (Cdash7 + Gfactor))
		let RT = -1 * Math.sin(2 * Δθ * d2r) * RC

		// Finally calculate the deltaE, term by term as root sume of squares
		let dE = (ΔL / (kL * SL)) ** 2
		dE += (ΔC / (kC * SC)) ** 2
		dE += (ΔH / (kH * SH)) ** 2
		dE += RT * (ΔC / (kC * SC)) * (ΔH / (kH * SH))
		return Math.sqrt(dE)
	},
	epsilon: 7,
	lightness(hex) {
		return (hex >> 16) / 2.55
	},
}

function pow7(x) {
	// Faster than x ** 7 or Math.pow(x, 7)

	const x2 = x * x
	const x7 = x2 * x2 * x2 * x

	return x7
}