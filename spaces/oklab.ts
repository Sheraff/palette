import { oklab2rgb, rgb2oklab, type Color } from "../conversion.ts"
import type { ColorSpace } from "./types"

const negativePercentToHex = 255 / 200

const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

export const oklabSpace: ColorSpace = {
	name: "oklab",
	toHex(array, index) {
		/**
		 * l: 0;100
		 * a: -100;100
		 * b: -100;100
		 */
		const lab = rgb2oklab([array[index], array[index + 1], array[index + 2]])
		return Math.round(lab[0] * 2.55) << 16 | Math.round((lab[1] + 100) * negativePercentToHex) << 8 | Math.round((lab[2] + 100) * negativePercentToHex)
	},
	toRgb(hex) {
		const rgb = oklab2rgb([(hex >> 16 & 0xff) / 2.55, (hex >> 8 & 0xff) / negativePercentToHex - 100, (hex & 0xff) / negativePercentToHex - 100] as Color)
		return clamp(rgb[0]) << 16 | clamp(rgb[1]) << 8 | clamp(rgb[2])
	},
	/**
	 * https://github.com/color-js/color.js/blob/main/src/deltaE/deltaEOK2.js
	 */
	distance(hex1: number, hex2: number): number {
		const L1 = hex1 >> 16 & 0xff
		const a1 = hex1 >> 8 & 0xff
		const b1 = hex1 & 0xff
		const L2 = hex2 >> 16 & 0xff
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