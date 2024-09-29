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
 * background first, then foreground ([0-1])
 * 
 * Farther from 0 is better
 * - 50 is ~ 4.5:1 or greater
 * - for small text, aim for 55 or higher
 * - for large text, aim for 40 or higher
 * 
 * (the numbers above are approximations, and based on a [0-100] scale, though this algo is usually represented as [-127, 127] in theory, measured over the full RGB range as [-108, 106])
 * 
 * source: https://github.com/color-js/color.js/blob/main/src/contrast/APCA.js
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

function simpleExp(chan) { return Math.pow(chan, SA98G.mainTRC) }

/**
 * source: https://github.com/Myndex/apca-w3/blob/master/src/apca-w3.js
 */
export function contrastAPCA2(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
	const lumBg = SA98G.sRco * simpleExp(r1) + SA98G.sGco * simpleExp(g1) + SA98G.sBco * simpleExp(b1)
	const lumTxt = SA98G.sRco * simpleExp(r2) + SA98G.sGco * simpleExp(g2) + SA98G.sBco * simpleExp(b2)

	// toe clamping of very dark values to account for flare
	let txtY = fclamp(lumTxt)
	let bgY = fclamp(lumBg)

	const icp = [0.0, 1.1]     // input range clamp / input error check

	if (isNaN(txtY) || isNaN(bgY) || Math.min(txtY, bgY) < icp[0] ||
		Math.max(txtY, bgY) > icp[1]) {
		return 0.0  // return zero on error
		// return 'error'; // optional string return for error
	};

	//////////   SAPC LOCAL VARS   /////////////////////////////////////////

	let SAPC = 0.0            // For raw SAPC values
	let outputContrast = 0.0 // For weighted final values

	// TUTORIAL

	// Use Y for text and BG, and soft clamp black,
	// return 0 for very close luminances, determine
	// polarity, and calculate SAPC raw contrast
	// Then scale for easy to remember levels.

	// Note that reverse contrast (white text on black)
	// intentionally returns a negative number
	// Proper polarity is important!

	//////////   BLACK SOFT CLAMP   ////////////////////////////////////////

	// Soft clamps Y for either color if it is near black.
	txtY = (txtY > SA98G.blkThrs)
		? txtY
		: txtY + Math.pow(SA98G.blkThrs - txtY, SA98G.blkClmp)
	bgY = (bgY > SA98G.blkThrs)
		? bgY
		: bgY + Math.pow(SA98G.blkThrs - bgY, SA98G.blkClmp)

	///// Return 0 Early for extremely low ∆Y
	if (Math.abs(bgY - txtY) < SA98G.deltaYmin) { return 0.0 }


	//////////   APCA/SAPC CONTRAST - LOW CLIP (W3 LICENSE)  ///////////////

	if (bgY > txtY) {  // For normal polarity, black text on white (BoW)

		// Calculate the SAPC contrast value and scale
		SAPC = (Math.pow(bgY, SA98G.normBG) - Math.pow(txtY, SA98G.normTXT)) * SA98G.scaleBoW

		// Low Contrast smooth rollout to prevent polarity reversal
		// and also a low-clip for very low contrasts
		outputContrast = (SAPC < SA98G.loClip) ? 0.0 : SAPC - SA98G.loBoWoffset

	} else {  // For reverse polarity, light text on dark (WoB)
		// WoB should always return negative value.

		SAPC = (Math.pow(bgY, SA98G.revBG) - Math.pow(txtY, SA98G.revTXT)) * SA98G.scaleWoB

		outputContrast = (SAPC > -SA98G.loClip) ? 0.0 : SAPC + SA98G.loWoBoffset
	}

	outputContrast *= 100

	/**
	 * output: [-106, 104] for full RGB range
	 */
	return outputContrast < 0 ? -outputContrast / 1.06 : outputContrast / 1.04
}

const SA98G = {

	mainTRC: 2.4, // 2.4 exponent for emulating actual monitor perception

	// For reverseAPCA
	get mainTRCencode() { return 1 / this.mainTRC },

	// sRGB coefficients
	sRco: 0.2126729,
	sGco: 0.7151522,
	sBco: 0.0721750,

	// G-4g constants for use with 2.4 exponent
	normBG: 0.56,
	normTXT: 0.57,
	revTXT: 0.62,
	revBG: 0.65,

	// G-4g Clamps and Scalers
	blkThrs: 0.022,
	blkClmp: 1.414,
	scaleBoW: 1.14,
	scaleWoB: 1.14,
	loBoWoffset: 0.027,
	loWoBoffset: 0.027,
	deltaYmin: 0.0005,
	loClip: 0.1,

	///// MAGIC NUMBERS for UNCLAMP, for use with 0.022 & 1.414 /////
	// Magic Numbers for reverseAPCA
	mFactor: 1.94685544331710,
	get mFactInv() { return 1 / this.mFactor },
	mOffsetIn: 0.03873938165714010,
	mExpAdj: 0.2833433964208690,
	get mExp() { return this.mExpAdj / this.blkClmp },
	mOffsetOut: 0.3128657958707580,
} as const