// source https://gist.github.com/dkaraush/65d19d61396f5f3cd8ba7d1b4b3c9432
// source https://github.com/color-js/color.js/blob/main/src/spaces/oklch.js
export type Color = [number, number, number]

const multiplyMatrices = (A, B): Color => {
	return [
		A[0] * B[0] + A[1] * B[1] + A[2] * B[2],
		A[3] * B[0] + A[4] * B[1] + A[5] * B[2],
		A[6] * B[0] + A[7] * B[1] + A[8] * B[2]
	]
}

export const oklch2oklab = ([l, c, h]: Color): Color => [
	l,
	isNaN(h) ? 0 : c * Math.cos(h * Math.PI / 180),
	isNaN(h) ? 0 : c * Math.sin(h * Math.PI / 180)
]
const oklab2oklch = ([l, a, b]: Color): Color => [
	l,
	Math.sqrt(a ** 2 + b ** 2),
	Math.abs(a) < 0.0002 && Math.abs(b) < 0.0002 ? NaN : (((Math.atan2(b, a) * 180) / Math.PI % 360) + 360) % 360
]

const rgb2srgbLinear = (rgb: Color) => rgb.map((c: number) => Math.abs(c) <= 0.04045
	? c / 12.92
	: (c < 0 ? -1 : 1) * rgb2srgbLinearBase(Math.abs(c))) as Color

const srgbLinear2rgb = (rgb: Color) => rgb.map(c =>
	Math.abs(c) > 0.0031308 ?
		(c < 0 ? -1 : 1) * srgbLinear2rgbBase(Math.abs(c)) :
		12.92 * c
) as Color

const oklab2xyz = (lab: Color): Color => {
	const LMSg = multiplyMatrices([
		1, 0.3963377773761749, 0.2158037573099136,
		1, -0.1055613458156586, -0.0638541728258133,
		1, -0.0894841775298119, -1.2914855480194092,
	], lab)
	const LMS = LMSg.map(val => val ** 3)
	return multiplyMatrices([
		1.2268798758459243, -0.5578149944602171, 0.2813910456659647,
		-0.0405757452148008, 1.1122868032803170, -0.0717110580655164,
		-0.0763729366746601, -0.4214933324022432, 1.5869240198367816
	], LMS)
}
const xyz2oklab = (xyz: Color): Color => {
	const LMS = multiplyMatrices([
		0.8190224379967030, 0.3619062600528904, -0.1288737815209879,
		0.0329836539323885, 0.9292868615863434, 0.0361446663506424,
		0.0481771893596242, 0.2642395317527308, 0.6335478284694309
	], xyz)
	const LMSg = LMS.map(val => Math.cbrt(val))
	return multiplyMatrices([
		0.2104542683093140, 0.7936177747023054, -0.0040720430116193,
		1.9779985324311684, -2.4285922420485799, 0.4505937096174110,
		0.0259040424655478, 0.7827717124575296, -0.8086757549230774
	], LMSg)
}
const xyz2rgbLinear = (xyz: Color): Color => {
	return multiplyMatrices([
		3.2409699419045226, -1.537383177570094, -0.4986107602930034,
		-0.9692436362808796, 1.8759675015077202, 0.04155505740717559,
		0.05563007969699366, -0.20397695888897652, 1.0569715142428786
	], xyz)
}
const rgbLinear2xyz = (rgb: Color): Color => {
	return multiplyMatrices([
		0.41239079926595934, 0.357584339383878, 0.1804807884018343,
		0.21263900587151027, 0.715168678767756, 0.07219231536073371,
		0.01933081871559182, 0.11919477979462598, 0.9505321522496607
	], rgb)
}

export const oklch2rgb = (lch: Color) =>
	srgbLinear2rgb(xyz2rgbLinear(oklab2xyz(oklch2oklab(lch))))

export const rgb2oklch = (rgb: Color) =>
	oklab2oklch(xyz2oklab(rgbLinear2xyz(rgb2srgbLinear(rgb))))

export const rgb2oklab = (rgb: Color) =>
	xyz2oklab(rgbLinear2xyz(rgb2srgbLinear(rgb)))

export const oklab2rgb = (lab: Color) =>
	srgbLinear2rgb(xyz2rgbLinear(oklab2xyz(lab)))

const srgbLinear2rgbBase = (c: number) => 1.055 * (Math.abs(c) ** (1 / 2.4)) - 0.055
const oklabHex2rgbHex = (hex: number) => {
	const l = hex >> 16 & 0xff / 2.55
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

	return Math.round(srgbLinear2rgbBase(sr)) << 16 | Math.round(srgbLinear2rgbBase(sg)) << 8 | Math.round(srgbLinear2rgbBase(sb))
}


const rgb2srgbLinearBase = (c: number) => ((c + 0.055) / 1.055) ** 2.4

const negativePercentToHex = 255 / 200
const rgb2oklabHex = (arr: Uint8Array, index: number) => {
	const r = arr[index]
	const g = arr[index + 1]
	const b = arr[index + 2]

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
}