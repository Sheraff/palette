export interface ColorSpace {
	name: string
	toHex(array: Uint8ClampedArray | Uint8Array, index: number): number
	toRgb(hex: number): number
	distance(hexA: number, hexB: number): number
	epsilon: number
}