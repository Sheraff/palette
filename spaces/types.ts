export interface ColorSpace {
	name: string
	toHex(array: Uint8ClampedArray | Uint8Array | number[], index: number): number
	toRgb(hex: number): number
	distance(hexA: number, hexB: number): number
	epsilon: number
	lightness(hex: number): number
	contrast(hexA: number, hexB: number): number
}