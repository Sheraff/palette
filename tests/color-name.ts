import Color from "colorjs.io"
import KEYWORDS from './short-names.ts'


export function nameColor(hex: number) {
	const color = new Color('#' + hex.toString(16).padStart(6, '0'))
	let min = Infinity
	let name = ''
	for (let keyword in KEYWORDS) {
		let keywordColor = new Color("srgb", KEYWORDS[keyword])
		let deltaE = keywordColor.deltaE(color, { method: "2000" })
		if (deltaE < min) {
			min = deltaE
			name = keyword
		}
	}
	return name
}