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
}