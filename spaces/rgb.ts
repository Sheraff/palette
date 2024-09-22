import type { ColorSpace } from "./types"

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
}
