import type { ColorSpace } from "./types"

const negativePercentToHex = 255 / 200

const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

const factIn = 2.4
const rgb2srgbLinearBase = (c: number) => ((c + 0.055) / 1.055) ** factIn
const factOut = 1 / factIn
const srgbLinear2rgbBase = (c: number) => 1.055 * (c ** factOut) - 0.055

export const oklabSpace: ColorSpace = {
	name: "oklab",
	toHex(array, index) {
		/**
		 * l: 0;100
		 * a: -100;100
		 * b: -100;100
		 * 
		 * source https://gist.github.com/dkaraush/65d19d61396f5f3cd8ba7d1b4b3c9432
		 * source https://github.com/color-js/color.js/blob/main/src/spaces/oklch.js
		 */
		const r = array[index]
		const g = array[index + 1]
		const b = array[index + 2]

		const sr = rgb2srgbLinearBase(r)
		const sg = rgb2srgbLinearBase(g)
		const sb = rgb2srgbLinearBase(b)

		const x = 0.41239079926595934 * sr + 0.357584339383878 * sg + 0.1804807884018343 * sb
		const y = 0.21263900587151027 * sr + 0.715168678767756 * sg + 0.07219231536073371 * sb
		const z = 0.01933081871559182 * sr + 0.11919477979462598 * sg + 0.9505321522496607 * sb

		const l0 = Math.cbrt(0.8190224379967030 * x + 0.3619062600528904 * y + -0.1288737815209879 * z)
		const a0 = Math.cbrt(0.0329836539323885 * x + 0.9292868615863434 * y + 0.0361446663506424 * z)
		const b0 = Math.cbrt(0.0481771893596242 * x + 0.2642395317527308 * y + 0.6335478284694309 * z)

		const l1 = 0.2104542683093140 * l0 + 0.7936177747023054 * a0 + -0.0040720430116193 * b0
		const a1 = 1.9779985324311684 * l0 + -2.4285922420485799 * a0 + 0.4505937096174110 * b0
		const b1 = 0.0259040424655478 * l0 + 0.7827717124575296 * a0 + -0.8086757549230774 * b0

		return Math.round(l1 * 2.55) << 16 | Math.round((a1 + 100) * negativePercentToHex) << 8 | Math.round((b1 + 100) * negativePercentToHex)
	},
	toRgb(hex) {
		const l = (hex >> 16) / 2.55
		const a = (hex >> 8 & 0xff) / negativePercentToHex - 100
		const b = (hex & 0xff) / negativePercentToHex - 100

		const x0 = (l + 0.3963377773761749 * a + 0.2158037573099136 * b) ** 3
		const y0 = (l + -0.1055613458156586 * a + -0.0638541728258133 * b) ** 3
		const z0 = (l + -0.0894841775298119 * a + -1.2914855480194092 * b) ** 3

		const x1 = 1.2268798758459243 * x0 + -0.5578149944602171 * y0 + 0.2813910456659647 * z0
		const y1 = -0.0405757452148008 * x0 + 1.1122868032803170 * y0 + -0.0717110580655164 * z0
		const z1 = -0.0763729366746601 * x0 + -0.4214933324022432 * y0 + 1.5869240198367816 * z0

		const sr = 3.2409699419045226 * x1 + -1.537383177570094 * y1 + -0.4986107602930034 * z1
		const sg = -0.9692436362808796 * x1 + 1.8759675015077202 * y1 + 0.04155505740717559 * z1
		const sb = 0.05563007969699366 * x1 + -0.20397695888897652 * y1 + 1.0569715142428786 * z1

		return clamp(srgbLinear2rgbBase(sr)) << 16 | clamp(srgbLinear2rgbBase(sg)) << 8 | clamp(srgbLinear2rgbBase(sb))
	},
	/**
	 * https://github.com/color-js/color.js/blob/main/src/deltaE/deltaEOK2.js
	 */
	distance(hex1: number, hex2: number): number {
		const L1 = hex1 >> 16
		const a1 = hex1 >> 8 & 0xff
		const b1 = hex1 & 0xff
		const L2 = hex2 >> 16
		const a2 = hex2 >> 8 & 0xff
		const b2 = hex2 & 0xff
		const ΔL = (L1 - L2) / 2.55
		const abscale = 2 / negativePercentToHex
		const Δa = abscale * (a1 - a2)
		const Δb = abscale * (b1 - b2)
		return Math.sqrt(ΔL ** 2 + Δa ** 2 + Δb ** 2)
	},
	epsilon: 9
}