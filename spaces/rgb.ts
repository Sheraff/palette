import { contrastAPCA } from "./apca-contrast.ts"
import type { ColorSpace } from "./types"

const factIn = 2.4
const rgb2srgbLinearBase = (c: number) => ((c + 0.055) / 1.055) ** factIn
const factOut = 1 / factIn
const srgbLinear2rgbBase = (c: number) => 1.055 * (c ** factOut) - 0.055

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
	epsilon: 1,
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
}
