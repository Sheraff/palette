export interface ColorSpace {
	name: string
	toHex(array: Uint8ClampedArray | Uint8Array | number[], index: number): number
	toRgb(hex: number): number
	distance(hexA: number, hexB: number): number
	/** distance below which two colors are considered the same */
	epsilon: number
	/** [0 - 100] for full RGB range */
	lightness(hex: number): number
	/** [0 - 100] for full RGB range */
	chroma(hex: number): number
	/** [0 - 100] for full RGB range */
	contrast(background: number, foreground: number): number
	/**
	 * Increase the contrast of a color towards another color
	 * @param of the color to change (hex)
	 * @param against the color to increase contrast against (contrast will be measured against this color) (hex)
	 * @param towards a reference color in the direction of which to move `of` (hex)
	 * @param desired the desired contrast value (0-100)
	 * @param foreground when measuring contrast, should `of` be the foreground or the background?
	 */
	increaseContrast(of: number, against: number, towards: number, desired: number, foreground: boolean)
}