/**
 * source: https://github.com/color-js/color.js/blob/main/src/contrast/APCA.js
 */

// APCA 0.0.98G
// https://github.com/Myndex/apca-w3
// see also https://github.com/w3c/silver/issues/643

// exponents
const normBG = 0.56
const normTXT = 0.57
const revTXT = 0.62
const revBG = 0.65

// clamps
const blkThrs = 0.022
const blkClmp = 1.414
const loClip = 0.1
const deltaYmin = 0.0005

// scalers
// see https://github.com/w3c/silver/issues/645
const scaleBoW = 1.14
const loBoWoffset = 0.027
const scaleWoB = 1.14
const loWoBoffset = 0.027

function fclamp(Y) {
	if (Y >= blkThrs) {
		return Y
	}
	return Y + (blkThrs - Y) ** blkClmp
}

function linearize(val) {
	let sign = val < 0 ? -1 : 1
	let abs = Math.abs(val)
	return sign * Math.pow(abs, 2.4)
}

/**
 * output: [0 - 100] for full RGB range
 * background first, then foreground
 */
export function contrastAPCA(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
	let S
	let C
	let Sapc

	// Calculates "screen luminance" with non-standard simple gamma EOTF
	// weights should be from CSS Color 4, not the ones here which are via Myndex and copied from Lindbloom
	let lumTxt = linearize(r1) * 0.2126729 + linearize(g1) * 0.7151522 + linearize(b1) * 0.0721750
	let lumBg = linearize(r2) * 0.2126729 + linearize(g2) * 0.7151522 + linearize(b2) * 0.0721750

	// toe clamping of very dark values to account for flare
	let Ytxt = fclamp(lumTxt)
	let Ybg = fclamp(lumBg)

	// are we "Black on White" (dark on light), or light on dark?
	let BoW = Ybg > Ytxt

	// why is this a delta, when Y is not perceptually uniform?
	// Answer: it is a noise gate, see
	// https://github.com/LeaVerou/color.js/issues/208
	if (Math.abs(Ybg - Ytxt) < deltaYmin) {
		C = 0
	}
	else {
		if (BoW) {
			// dark text on light background
			S = Ybg ** normBG - Ytxt ** normTXT
			C = S * scaleBoW
		}
		else {
			// light text on dark background
			S = Ybg ** revBG - Ytxt ** revTXT
			C = S * scaleWoB
		}
	}
	if (Math.abs(C) < loClip) {
		Sapc = 0
	}
	else if (C > 0) {
		// not clear whether Woffset is loBoWoffset or loWoBoffset
		// but they have the same value
		Sapc = C - loBoWoffset
	}
	else {
		Sapc = C + loBoWoffset
	}

	/**
	 * output: [-108, 106] for full RGB range
	 */
	const contrast = Sapc * 100

	return contrast < 0 ? -contrast / 1.08 : contrast / 1.06
}