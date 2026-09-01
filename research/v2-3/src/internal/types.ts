export type RGB = readonly [red: number, green: number, blue: number]

export type OKLab = readonly [lightness: number, a: number, b: number]

export type RawImage = {
	width: number
	height: number
	data: Uint8Array
}
