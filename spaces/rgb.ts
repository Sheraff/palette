import { contrastAPCA } from "./apca-contrast.ts"
import type { ColorSpace } from "./types"

const factIn = 2.4
const rgb2srgbLinearBase = (c: number) => ((c + 0.055) / 1.055) ** factIn
const factOut = 1 / factIn
const srgbLinear2rgbBase = (c: number) => 1.055 * (c ** factOut) - 0.055

const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

const dε = .000075

export const rgbSpace: ColorSpace = {
	name: "rgb",
	toHex(array, index) {
		return array[index] << 16 | array[index + 1] << 8 | array[index + 2]
	},
	toRgb(hex) {
		return hex
	},
	distance(hex1: number, hex2: number): number {
		const x = (hex1 >> 16 & 0xff) - (hex2 >> 16 & 0xff)
		const y = (hex1 >> 8 & 0xff) - (hex2 >> 8 & 0xff)
		const z = (hex1 & 0xff) - (hex2 & 0xff)
		return Math.sqrt(x * x + y * y + z * z)
	},
	epsilon: 20,
	lightness(hex) {
		/**
		 * source https://gist.github.com/dkaraush/65d19d61396f5f3cd8ba7d1b4b3c9432
		 * source https://github.com/color-js/color.js/blob/main/src/spaces/oklch.js
		 */
		const r = hex >> 16 & 0xff
		const g = hex >> 8 & 0xff
		const b = hex & 0xff

		const sr = rgb2srgbLinearBase(r)
		const sg = rgb2srgbLinearBase(g)
		const sb = rgb2srgbLinearBase(b)

		/**
		 * xyz 65
		 * source: https://github.com/color-js/color.js/blob/main/src/spaces/srgb-linear.js
		 */
		const y = 0.21263900587151027 * sr + 0.715168678767756 * sg + 0.07219231536073371 * sb

		/**
		 * luminance
		 * source: https://github.com/color-js/color.js/blob/main/src/luminance.js
		 */
		return y * 100
	},
	contrast(hexA, hexB) {
		const r1 = ((hexA >> 16) & 0xff) / 255
		const g1 = ((hexA >> 8) & 0xff) / 255
		const b1 = (hexA & 0xff) / 255
		const r2 = ((hexB >> 16) & 0xff) / 255
		const g2 = ((hexB >> 8) & 0xff) / 255
		const b2 = (hexB & 0xff) / 255
		return contrastAPCA(r1, g1, b1, r2, g2, b2)
	},
	chroma(hex) {
		const r = hex >> 16 & 0xff
		const g = hex >> 8 & 0xff
		const b = hex & 0xff

		const sr = rgb2srgbLinearBase(r)
		const sg = rgb2srgbLinearBase(g)
		const sb = rgb2srgbLinearBase(b)

		const x = 0.41239079926595934 * sr + 0.357584339383878 * sg + 0.1804807884018343 * sb
		const y = 0.21263900587151027 * sr + 0.715168678767756 * sg + 0.07219231536073371 * sb
		const z = 0.01933081871559182 * sr + 0.11919477979462598 * sg + 0.9505321522496607 * sb

		const l0 = Math.cbrt(0.8190224379967030 * x + 0.3619062600528904 * y + -0.1288737815209879 * z)
		const a0 = Math.cbrt(0.0329836539323885 * x + 0.9292868615863434 * y + 0.0361446663506424 * z)
		const b0 = Math.cbrt(0.0481771893596242 * x + 0.2642395317527308 * y + 0.6335478284694309 * z)

		const a1 = 1.9779985324311684 * l0 + -2.4285922420485799 * a0 + 0.4505937096174110 * b0
		const b1 = 0.0259040424655478 * l0 + 0.7827717124575296 * a0 + -0.8086757549230774 * b0

		const isAchromatic = Math.abs(a1) < dε && Math.abs(b1) < dε
		const chroma = isAchromatic ? 0 : Math.sqrt(a1 ** 2 + b1 ** 2)

		return chroma / 1.5
	},
	increaseContrast(of: number, against: number, towards: number, desired: number, foreground: boolean) {
		let contrast = 0
		let result = of
		const lumTowards = rgbSpace.lightness(towards)
		const lumAgainst = rgbSpace.lightness(against)
		const lighter = lumTowards > lumAgainst
		const add = lighter ? 0.01 : -0.01

		const r = result >> 16 & 0xff
		const g = result >> 8 & 0xff
		const b = result & 0xff

		const sr = rgb2srgbLinearBase(r)
		const sg = rgb2srgbLinearBase(g)
		const sb = rgb2srgbLinearBase(b)

		const x = 0.41239079926595934 * sr + 0.357584339383878 * sg + 0.1804807884018343 * sb
		let y = 0.21263900587151027 * sr + 0.715168678767756 * sg + 0.07219231536073371 * sb
		const z = 0.01933081871559182 * sr + 0.11919477979462598 * sg + 0.9505321522496607 * sb

		while (contrast < desired) {
			y += add
			if (y <= 0 || y >= 1) {
				break
			}

			const nsr = 3.2409699419045226 * x + -1.537383177570094 * y + -0.4986107602930034 * z
			const nsg = -0.9692436362808796 * x + 1.8759675015077202 * y + 0.04155505740717559 * z
			const nsb = 0.05563007969699366 * x + -0.20397695888897652 * y + 1.0569715142428786 * z

			const nr = clamp(srgbLinear2rgbBase(nsr))
			const ng = clamp(srgbLinear2rgbBase(nsg))
			const nb = clamp(srgbLinear2rgbBase(nsb))

			result = nr << 16 | ng << 8 | nb

			contrast = foreground
				? rgbSpace.contrast(against, result)
				: rgbSpace.contrast(result, against)
		}

		return result
	}
}
