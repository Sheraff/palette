import Color from "colorjs.io"
import short from './short-names.ts'
import simplest from './simplest-names.ts'


function base(keywords, hex: number) {
	const color = new Color('#' + hex.toString(16).padStart(6, '0'))
	let min = Infinity
	let name = ''
	for (let keyword in keywords) {
		let keywordColor = new Color("srgb", keywords[keyword])
		let deltaE = keywordColor.deltaE(color, { method: "2000" })
		if (deltaE < min) {
			min = deltaE
			name = keyword
		}
	}
	return name
}

export function nameColor(hex: number) {
	return base(short, hex)
}

export function simpleColor(hex: number) {
	return base(simplest, hex)
}