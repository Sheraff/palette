/**
 * Comprehensive tests for all images from visual.ts
 * Tests all outputs: outer, inner, third, accent, bgGradient
 * 
 * Purpose: Prevent regressions when improving one aspect of the algorithm
 * 
 * Structure: Each image has expectations per method (current, hybrid, vibrant, unified)
 * 
 * IMPORTANT: These are IDEAL expected values based on visual feedback.
 * If a test fails, the algorithm needs to be fixed, NOT the expectation!
 */

import { describe, test } from 'node:test'
import assert from 'node:assert'
import { join } from 'node:path'
import { extractColors, type ExtractOptions } from '../extractColors.ts'
import { oklabSpace } from '../spaces/oklab.ts'
import { gapStatisticKmeans } from '../kmeans/gapStatistic.ts'
import sharp from 'sharp'
import { nameColor, simpleColor } from './color-name.ts'

function hex(c: number): string {
	return '#' + c.toString(16).padStart(6, '0')
}

async function loadImage(path: string, opts: ExtractOptions) {
	const raw = await sharp(path).raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true })
	return extractColors(raw.data, raw.info, opts, path)
}

// Test options matching visual.ts
const defaultOptions: ExtractOptions = {
	workers: true,
	colorSpace: oklabSpace,
	clamp: 0.005,
	strategy: gapStatisticKmeans({ maxK: 20, minK: 4 }),
	minForegroundContrast: 30,
}

// Color type: string, array of acceptable strings, or null (any value acceptable)
type Color = string | string[] | null

// Expectation for a single method's palette
type MethodExpectation = {
	outer?: Color
	inner?: Color
	third?: Color
	accent?: Color
	bgGradient?: boolean | null
}

// Per-image expectations for each method
type ImageExpectations = {
	current?: MethodExpectation
	hybrid?: MethodExpectation
	vibrant?: MethodExpectation
	unified?: MethodExpectation
	notes?: string
}

/**
 * IDEAL EXPECTED VALUES based on visual feedback.
 * 
 * These represent what SHOULD be correct, not what the algorithm currently produces.
 * Tests should FAIL if the algorithm regresses.
 */
const expectations: Record<string, ImageExpectations> = {
	'artofficial.jpg': {
		// inner should be white, third shouldn't be too dark for hybrid
		current: { outer: 'black', inner: 'white', third: 'black', accent: 'yellow', bgGradient: true },
		hybrid: { outer: 'black', inner: 'white', third: ['black', 'gray', 'green'], accent: 'yellow', bgGradient: true },
		vibrant: { outer: 'black', inner: 'white', third: 'black', accent: 'yellow', bgGradient: true },
		unified: { outer: 'black', inner: 'white', third: 'black', accent: 'yellow', bgGradient: true },
		notes: 'inner should be white, hybrid third shouldn\'t be too dark'
	},

	'havana.jpg': {
		// inner should be white (only correct in "vibrant")
		current: { outer: 'blue', inner: 'white', third: 'blue', accent: 'orange', bgGradient: false },
		hybrid: { outer: 'blue', inner: 'white', third: 'blue', accent: 'orange', bgGradient: false },
		vibrant: { outer: 'blue', inner: 'white', third: 'blue', accent: 'orange', bgGradient: false },
		unified: { outer: 'blue', inner: 'white', third: 'blue', accent: 'orange', bgGradient: false },
		notes: 'inner should be white'
	},

	'horsley.jpg': {
		// inner should be beige (incorrect in "vibrant" which picks black)
		current: { outer: 'orange', inner: 'beige', third: 'gray', accent: 'beige', bgGradient: false },
		hybrid: { outer: 'orange', inner: 'beige', third: 'gray', accent: 'beige', bgGradient: false },
		vibrant: { outer: 'orange', inner: 'beige', third: 'gray', accent: 'beige', bgGradient: false },
		unified: { outer: 'orange', inner: 'beige', third: 'gray', accent: 'beige', bgGradient: false },
		notes: 'inner should be beige'
	},

	'black.jpg': {
		// third should be the same black as outer (only correct in "vibrant")
		current: { outer: 'black', inner: 'white', third: 'black', accent: 'white', bgGradient: false },
		hybrid: { outer: 'black', inner: 'white', third: 'black', accent: 'white', bgGradient: false },
		vibrant: { outer: 'black', inner: 'white', third: 'black', accent: 'white', bgGradient: false },
		unified: { outer: 'black', inner: 'white', third: 'black', accent: 'white', bgGradient: false },
		notes: 'third should be black (same as outer)'
	},

	'elephunk.jpg': {
		// third should not be red-brown (incorrect in "vibrant"), NOT a gradient
		current: { outer: 'black', inner: 'beige', third: 'blue', accent: 'beige', bgGradient: false },
		hybrid: { outer: 'black', inner: 'beige', third: 'blue', accent: 'beige', bgGradient: false },
		vibrant: { outer: 'black', inner: 'beige', third: 'blue', accent: 'beige', bgGradient: false },
		unified: { outer: 'black', inner: 'beige', third: 'blue', accent: 'beige', bgGradient: false },
		notes: 'third should be blue, NOT red-brown. NOT a gradient'
	},

	'horrorwood.jpg': {
		// third should not be red-purple (incorrect in "vibrant")
		current: { outer: 'black', inner: 'gray', third: 'blue', accent: 'white', bgGradient: true },
		hybrid: { outer: 'black', inner: 'gray', third: 'blue', accent: 'white', bgGradient: true },
		vibrant: { outer: 'black', inner: 'gray', third: 'blue', accent: 'white', bgGradient: true },
		unified: { outer: 'black', inner: 'gray', third: 'blue', accent: 'white', bgGradient: true },
		notes: 'third should be blue, NOT red-purple'
	},

	'meteora.jpg': {
		current: { outer: 'black', inner: 'white', third: 'black', accent: 'gray', bgGradient: false },
		hybrid: { outer: 'black', inner: 'white', third: 'black', accent: 'gray', bgGradient: false },
		vibrant: { outer: 'black', inner: 'white', third: 'black', accent: 'gray', bgGradient: false },
		unified: { outer: 'black', inner: 'white', third: 'black', accent: 'gray', bgGradient: false },
	},

	'placebo.jpg': {
		// third should not be brown (incorrect in "vibrant"), gradient is true
		current: { outer: 'gray', inner: 'white', third: 'gray', accent: ['pink', 'red'], bgGradient: true },
		hybrid: { outer: 'gray', inner: 'white', third: 'gray', accent: ['pink', 'red'], bgGradient: true },
		vibrant: { outer: 'gray', inner: 'white', third: 'gray', accent: ['pink', 'red'], bgGradient: true },
		unified: { outer: 'gray', inner: 'white', third: 'gray', accent: ['pink', 'red'], bgGradient: true },
		notes: 'third should be gray, NOT brown. gradient is true'
	},

	'slim.jpg': {
		current: { outer: 'black', inner: 'white', third: 'black', accent: 'red', bgGradient: true },
		hybrid: { outer: 'black', inner: 'white', third: 'black', accent: 'red', bgGradient: true },
		vibrant: { outer: 'black', inner: 'white', third: 'black', accent: 'red', bgGradient: true },
		unified: { outer: 'black', inner: 'white', third: 'black', accent: 'red', bgGradient: true },
	},

	'vvbrown.jpg': {
		// inner can be yellow or white (both acceptable)
		current: { outer: 'black', inner: ['yellow', 'white'], third: 'black', accent: 'yellow', bgGradient: true },
		hybrid: { outer: 'black', inner: ['yellow', 'white'], third: 'black', accent: 'yellow', bgGradient: true },
		vibrant: { outer: 'black', inner: ['yellow', 'white'], third: 'black', accent: 'yellow', bgGradient: true },
		unified: { outer: 'black', inner: ['yellow', 'white'], third: 'black', accent: 'yellow', bgGradient: true },
		notes: 'inner can be yellow or white'
	},

	'skap.jpg': {
		// accent should be red (good in "hybrid" and "vibrant")
		current: { outer: 'white', inner: 'black', third: 'pink', accent: 'red', bgGradient: true },
		hybrid: { outer: 'white', inner: 'black', third: 'pink', accent: 'red', bgGradient: true },
		vibrant: { outer: 'white', inner: 'black', third: 'pink', accent: 'red', bgGradient: true },
		unified: { outer: 'white', inner: 'black', third: 'pink', accent: 'red', bgGradient: true },
		notes: 'accent should be red, NOT saddlebrown'
	},

	'toxicity.jpg': {
		// accent should be red (good in "hybrid" and "vibrant")
		current: { outer: 'gray', inner: 'black', third: 'gray', accent: 'red', bgGradient: false },
		hybrid: { outer: 'gray', inner: 'black', third: 'gray', accent: 'red', bgGradient: false },
		vibrant: { outer: 'gray', inner: 'black', third: 'gray', accent: 'red', bgGradient: false },
		unified: { outer: 'gray', inner: 'black', third: 'gray', accent: 'red', bgGradient: false },
		notes: 'accent should be red, NOT saddlebrown'
	},

	'maroon5.jpg': {
		// inner should be white (correct in "hybrid" and "vibrant")
		// accent should be red not pink (only correct in "current")
		// NOT a gradient
		current: { outer: 'black', inner: 'white', third: 'saddlebrown', accent: 'red', bgGradient: false },
		hybrid: { outer: 'black', inner: 'white', third: 'saddlebrown', accent: 'red', bgGradient: false },
		vibrant: { outer: 'black', inner: 'white', third: 'saddlebrown', accent: 'red', bgGradient: false },
		unified: { outer: 'black', inner: 'white', third: 'saddlebrown', accent: 'red', bgGradient: false },
		notes: 'inner should be white, accent should be red (not pink), NOT a gradient'
	},

	'birdsofprey.jpg': {
		// inner should be black, outer and third should be high chroma (cyan, green, orange, pink, blue)
		// This is incorrect in ALL algorithms currently
		current: { outer: ['blue', 'cyan', 'green', 'orange', 'pink'], inner: 'black', third: ['blue', 'cyan', 'green', 'orange', 'pink'], accent: ['green', 'cyan'], bgGradient: true },
		hybrid: { outer: ['blue', 'cyan', 'green', 'orange', 'pink'], inner: 'black', third: ['blue', 'cyan', 'green', 'orange', 'pink'], accent: ['green', 'cyan'], bgGradient: true },
		vibrant: { outer: ['blue', 'cyan', 'green', 'orange', 'pink'], inner: 'black', third: ['blue', 'cyan', 'green', 'orange', 'pink'], accent: ['green', 'cyan'], bgGradient: true },
		unified: { outer: ['blue', 'cyan', 'green', 'orange', 'pink'], inner: 'black', third: ['blue', 'cyan', 'green', 'orange', 'pink'], accent: ['green', 'cyan'], bgGradient: true },
		notes: 'inner should be BLACK, outer/third should be high-chroma'
	},

	'nobs.jpg': {
		// third should not be lightgreen (incorrect in "vibrant")
		current: { outer: 'white', inner: 'purple', third: 'yellow', accent: 'red', bgGradient: false },
		hybrid: { outer: 'white', inner: 'purple', third: 'yellow', accent: 'red', bgGradient: false },
		vibrant: { outer: 'white', inner: 'purple', third: 'yellow', accent: 'red', bgGradient: false },
		unified: { outer: 'white', inner: 'purple', third: 'yellow', accent: 'red', bgGradient: false },
		notes: 'third should be yellow, NOT lightgreen'
	},

	'ybbb.jpg': {
		// outer and third should be same shade of red (incorrect in "vibrant" where third is darker)
		current: { outer: 'saddlebrown', inner: 'beige', third: 'saddlebrown', accent: ['beige', 'black'], bgGradient: false },
		hybrid: { outer: 'saddlebrown', inner: 'beige', third: 'saddlebrown', accent: ['beige', 'black'], bgGradient: false },
		vibrant: { outer: 'saddlebrown', inner: 'beige', third: 'saddlebrown', accent: ['beige', 'black'], bgGradient: false },
		unified: { outer: 'saddlebrown', inner: 'beige', third: 'saddlebrown', accent: ['beige', 'black'], bgGradient: false },
		notes: 'outer and third should match'
	},

	'johns.jpg': {
		// third should be blue (vibrant finds incorrect third)
		current: { outer: 'black', inner: 'white', third: 'blue', accent: 'salmon', bgGradient: false },
		hybrid: { outer: 'black', inner: 'white', third: 'blue', accent: 'salmon', bgGradient: false },
		vibrant: { outer: 'black', inner: 'white', third: 'blue', accent: 'salmon', bgGradient: false },
		unified: { outer: 'black', inner: 'white', third: 'blue', accent: 'salmon', bgGradient: false },
		notes: 'third should be blue'
	},

	'once.jpg': {
		// all algorithms find good colors
		current: { outer: 'white', inner: 'gray', third: 'white', accent: 'black', bgGradient: false },
		hybrid: { outer: 'white', inner: 'gray', third: 'white', accent: 'black', bgGradient: false },
		vibrant: { outer: 'white', inner: 'gray', third: 'white', accent: 'black', bgGradient: true },
		unified: { outer: 'white', inner: 'gray', third: 'white', accent: 'black', bgGradient: false },
		notes: 'all good. vibrant should have gradient:true'
	},

	'orelsan.jpg': {
		// should be a gradient
		current: { outer: 'black', inner: 'gray', third: 'black', accent: 'beige', bgGradient: true },
		hybrid: { outer: 'black', inner: 'gray', third: 'black', accent: 'beige', bgGradient: true },
		vibrant: { outer: 'black', inner: 'gray', third: 'black', accent: 'beige', bgGradient: true },
		unified: { outer: 'black', inner: 'gray', third: 'black', accent: 'beige', bgGradient: true },
		notes: 'should be a gradient'
	},

	'krafty.jpg': {
		current: { outer: 'black', inner: 'orange', third: 'purple', accent: 'purple', bgGradient: false },
		hybrid: { outer: 'black', inner: 'orange', third: 'purple', accent: 'purple', bgGradient: false },
		vibrant: { outer: 'black', inner: 'orange', third: 'purple', accent: 'purple', bgGradient: false },
		unified: { outer: 'black', inner: 'orange', third: 'purple', accent: 'purple', bgGradient: false },
	},

	'muse.jpg': {
		// hybrid is better for accent and third. gradient could be true or false
		current: { outer: 'black', inner: 'white', third: 'blue', accent: 'gray', bgGradient: null },
		hybrid: { outer: 'black', inner: 'white', third: 'blue', accent: 'gray', bgGradient: null },
		vibrant: { outer: 'black', inner: 'white', third: 'blue', accent: 'gray', bgGradient: null },
		unified: { outer: 'black', inner: 'white', third: 'blue', accent: 'gray', bgGradient: null },
		notes: 'hybrid is better for accent and third'
	},

	'franz.jpg': {
		// third should be same black as outer
		current: { outer: 'black', inner: 'beige', third: 'black', accent: 'orange', bgGradient: false },
		hybrid: { outer: 'black', inner: 'beige', third: 'black', accent: 'orange', bgGradient: false },
		vibrant: { outer: 'black', inner: 'beige', third: 'black', accent: 'orange', bgGradient: false },
		unified: { outer: 'black', inner: 'beige', third: 'black', accent: 'orange', bgGradient: false },
	},

	'loups.jpg': {
		// outer and third better in current/hybrid. should be a gradient
		current: { outer: 'orange', inner: 'red', third: 'beige', accent: 'salmon', bgGradient: true },
		hybrid: { outer: 'orange', inner: 'red', third: 'beige', accent: 'salmon', bgGradient: true },
		vibrant: { outer: 'orange', inner: 'red', third: 'beige', accent: 'salmon', bgGradient: true },
		unified: { outer: 'orange', inner: 'red', third: 'beige', accent: 'salmon', bgGradient: true },
		notes: 'should be a gradient'
	},

	'knuckles.jpg': {
		// accent must be white
		current: { outer: 'salmon', inner: 'white', third: 'gray', accent: 'white', bgGradient: true },
		hybrid: { outer: 'salmon', inner: 'white', third: 'gray', accent: 'white', bgGradient: true },
		vibrant: { outer: 'salmon', inner: 'white', third: 'gray', accent: 'white', bgGradient: true },
		unified: { outer: 'salmon', inner: 'white', third: 'gray', accent: 'white', bgGradient: true },
		notes: 'accent must be white'
	},

	'infected.jpg': {
		// inner and accent should be cyan and red (or red and cyan)
		current: { outer: 'blue', inner: ['cyan', 'red'], third: 'purple', accent: ['cyan', 'red'], bgGradient: true },
		hybrid: { outer: 'blue', inner: ['cyan', 'red'], third: 'purple', accent: ['cyan', 'red'], bgGradient: true },
		vibrant: { outer: 'blue', inner: ['cyan', 'red'], third: 'purple', accent: ['cyan', 'red'], bgGradient: true },
		unified: { outer: 'blue', inner: ['cyan', 'red'], third: 'purple', accent: ['cyan', 'red'], bgGradient: true },
		notes: 'inner and accent should be cyan and red'
	},

	'doja.jpg': {
		// inner should be white
		current: { outer: 'pink', inner: 'white', third: 'magenta', accent: 'black', bgGradient: true },
		hybrid: { outer: 'pink', inner: 'white', third: 'magenta', accent: 'black', bgGradient: true },
		vibrant: { outer: 'pink', inner: 'white', third: 'magenta', accent: 'black', bgGradient: true },
		unified: { outer: 'pink', inner: 'white', third: 'magenta', accent: 'black', bgGradient: true },
		notes: 'inner should be white'
	},

	'nada.jpg': {
		// inner should be white, third should form gradient with outer (lighter)
		current: { outer: 'blue', inner: 'white', third: 'black', accent: 'white', bgGradient: null },
		hybrid: { outer: 'blue', inner: 'white', third: ['gray', 'blue', 'black'], accent: 'white', bgGradient: true },
		vibrant: { outer: 'blue', inner: 'white', third: 'black', accent: 'white', bgGradient: null },
		unified: { outer: 'blue', inner: 'white', third: 'black', accent: 'white', bgGradient: null },
		notes: 'inner should be white, hybrid third should be lighter to form gradient'
	},

	'slipknot.jpg': {
		// third should be same black as outer
		current: { outer: 'black', inner: 'white', third: 'black', accent: 'white', bgGradient: false },
		hybrid: { outer: 'black', inner: 'white', third: 'black', accent: 'white', bgGradient: false },
		vibrant: { outer: 'black', inner: 'white', third: 'black', accent: 'white', bgGradient: false },
		unified: { outer: 'black', inner: 'white', third: 'black', accent: 'white', bgGradient: false },
	},

	'snarky.jpg': {
		// hybrid is best with white inner and black accent
		current: { outer: 'yellow', inner: 'white', third: 'yellow', accent: ['white', 'black'], bgGradient: false },
		hybrid: { outer: 'yellow', inner: 'white', third: 'yellow', accent: ['black', 'green'], bgGradient: false },
		vibrant: { outer: 'yellow', inner: 'white', third: 'yellow', accent: ['black', 'white'], bgGradient: false },
		unified: { outer: 'yellow', inner: 'white', third: 'yellow', accent: ['black', 'green'], bgGradient: false },
		notes: 'hybrid is best with black accent'
	},

	'greenday.jpg': {
		// accent should be red
		current: { outer: 'black', inner: 'white', third: 'black', accent: 'red', bgGradient: false },
		hybrid: { outer: 'black', inner: 'white', third: 'black', accent: 'red', bgGradient: false },
		vibrant: { outer: 'black', inner: 'white', third: 'black', accent: 'red', bgGradient: false },
		unified: { outer: 'black', inner: 'white', third: 'black', accent: 'red', bgGradient: false },
		notes: 'accent should be red'
	},

	'disney.avif': {
		// outer/third can be lime, purple, orange or blue. accent should be white
		current: { outer: ['lime', 'purple', 'orange', 'blue'], inner: 'white', third: ['lime', 'purple', 'orange', 'blue'], accent: 'white', bgGradient: false },
		hybrid: { outer: ['lime', 'purple', 'orange', 'blue'], inner: 'white', third: ['lime', 'purple', 'orange', 'blue'], accent: 'white', bgGradient: false },
		vibrant: { outer: ['lime', 'purple', 'orange', 'blue'], inner: 'white', third: ['lime', 'purple', 'orange', 'blue'], accent: 'white', bgGradient: false },
		unified: { outer: ['lime', 'purple', 'orange', 'blue'], inner: 'white', third: ['lime', 'purple', 'orange', 'blue'], accent: 'white', bgGradient: false },
		notes: 'accent should be white'
	},

	'purered.jpg': {
		current: { outer: 'red', inner: 'white', third: 'red', accent: 'white', bgGradient: false },
		hybrid: { outer: 'red', inner: 'white', third: 'red', accent: 'white', bgGradient: false },
		vibrant: { outer: 'red', inner: 'white', third: 'red', accent: 'white', bgGradient: false },
		unified: { outer: 'red', inner: 'white', third: 'red', accent: 'white', bgGradient: false },
	},

	'pureblack.jpg': {
		current: { outer: 'black', inner: 'white', third: 'black', accent: 'white', bgGradient: false },
		hybrid: { outer: 'black', inner: 'white', third: 'black', accent: 'white', bgGradient: false },
		vibrant: { outer: 'black', inner: 'white', third: 'black', accent: 'white', bgGradient: false },
		unified: { outer: 'black', inner: 'white', third: 'black', accent: 'white', bgGradient: false },
	},

	'purewhite.jpg': {
		current: { outer: 'white', inner: 'black', third: 'white', accent: 'black', bgGradient: false },
		hybrid: { outer: 'white', inner: 'black', third: 'white', accent: 'black', bgGradient: false },
		vibrant: { outer: 'white', inner: 'black', third: 'white', accent: 'black', bgGradient: false },
		unified: { outer: 'white', inner: 'black', third: 'white', accent: 'black', bgGradient: false },
	},
}

// All images from visual.ts
const sources = Object.keys(expectations)

function assertColorMatch(actual: number, expected: Color, field: string, context: string) {
	if (expected === null) return // Accept any value

	const actualSimple = simpleColor(actual)
	const expectedArray = Array.isArray(expected) ? expected : [expected]

	assert.ok(
		expectedArray.includes(actualSimple),
		`[${context}] ${field}: expected ${expectedArray.join('/')} but got ${actualSimple} (${hex(actual)} = ${nameColor(actual)})`
	)
}

function assertGradient(actual: boolean, expected: boolean | null, context: string) {
	if (expected === null) return
	assert.strictEqual(actual, expected, `[${context}] bgGradient: expected ${expected} but got ${actual}`)
}

// Helper to format a full palette as a compact string
function formatPalette(p: { outer: number, inner: number, third: number, accent: number, bgGradient: boolean }): string {
	const o = simpleColor(p.outer).slice(0, 3)
	const i = simpleColor(p.inner).slice(0, 3)
	const t = simpleColor(p.third).slice(0, 3)
	const a = simpleColor(p.accent).slice(0, 3)
	const g = p.bgGradient ? '↗' : '▪'
	return `bg:${o} fg:${i} 3rd:${t} acc:${a} ${g}`
}

type FullPalette = { outer: number, inner: number, third: number, accent: number, bgGradient: boolean }

describe('Visual Images - Per-Method Palette Tests', () => {
	for (const source of sources) {
		test(source, async (t) => {
			const imagePath = join(import.meta.dirname, '../images', source)
			const result = await loadImage(imagePath, defaultOptions)
			const imageExp = expectations[source]

			if (!imageExp) {
				t.diagnostic(`No expectations defined for ${source}`)
				return
			}

			// Get full palettes from result
			const palettes = (result as any).fullPalettes as Record<string, FullPalette> | undefined

			// Log comparison for visual review
			t.diagnostic(`------- ${source} -------`)
			if (palettes) {
				for (const [method, palette] of Object.entries(palettes)) {
					const marker = method === 'unified' ? '★' : ' '
					t.diagnostic(`${marker}${method.padEnd(8)}: ${formatPalette(palette)}`)
				}
			}
			if (imageExp.notes) {
				t.diagnostic(`📝 ${imageExp.notes}`)
			}

			// Test each method's expectations
			const methodsToTest: Array<{ name: string, palette: FullPalette | undefined, exp: MethodExpectation | undefined }> = [
				{ name: 'current', palette: palettes?.current, exp: imageExp.current },
				{ name: 'hybrid', palette: palettes?.hybrid, exp: imageExp.hybrid },
				{ name: 'vibrant', palette: palettes?.vibrant, exp: imageExp.vibrant },
				{ name: 'unified', palette: palettes?.unified, exp: imageExp.unified },
			]

			for (const { name, palette, exp } of methodsToTest) {
				if (!palette || !exp) continue

				const ctx = `${source} → ${name}`

				if (exp.outer !== undefined) assertColorMatch(palette.outer, exp.outer, 'outer', ctx)
				if (exp.inner !== undefined) assertColorMatch(palette.inner, exp.inner, 'inner', ctx)
				if (exp.third !== undefined) assertColorMatch(palette.third, exp.third, 'third', ctx)
				if (exp.accent !== undefined) assertColorMatch(palette.accent, exp.accent, 'accent', ctx)
				if (exp.bgGradient !== undefined) assertGradient(palette.bgGradient, exp.bgGradient, ctx)
			}
		})
	}
})

/**
 * Summary test to count how many images each method gets fully correct
 */
describe('Method Comparison Summary', () => {
	test('Count correct palettes per method', async (t) => {
		const methodScores: Record<string, { correct: number, total: number, issues: string[] }> = {
			current: { correct: 0, total: 0, issues: [] },
			hybrid: { correct: 0, total: 0, issues: [] },
			vibrant: { correct: 0, total: 0, issues: [] },
			unified: { correct: 0, total: 0, issues: [] },
		}

		for (const source of sources) {
			const imagePath = join(import.meta.dirname, '../images', source)
			const result = await loadImage(imagePath, defaultOptions)
			const imageExp = expectations[source]
			const palettes = (result as any).fullPalettes as Record<string, FullPalette> | undefined

			if (!palettes || !imageExp) continue

			for (const methodName of ['current', 'hybrid', 'vibrant', 'unified'] as const) {
				const palette = palettes[methodName]
				const exp = imageExp[methodName]
				if (!palette || !exp) continue

				methodScores[methodName].total++
				let isCorrect = true

				// Check each field
				if (exp.outer !== undefined) {
					const expected = Array.isArray(exp.outer) ? exp.outer : [exp.outer]
					if (exp.outer !== null && !expected.includes(simpleColor(palette.outer))) {
						isCorrect = false
					}
				}
				if (exp.inner !== undefined) {
					const expected = Array.isArray(exp.inner) ? exp.inner : [exp.inner]
					if (exp.inner !== null && !expected.includes(simpleColor(palette.inner))) {
						isCorrect = false
					}
				}
				if (exp.third !== undefined) {
					const expected = Array.isArray(exp.third) ? exp.third : [exp.third]
					if (exp.third !== null && !expected.includes(simpleColor(palette.third))) {
						isCorrect = false
					}
				}
				if (exp.accent !== undefined) {
					const expected = Array.isArray(exp.accent) ? exp.accent : [exp.accent]
					if (exp.accent !== null && !expected.includes(simpleColor(palette.accent))) {
						isCorrect = false
					}
				}
				if (exp.bgGradient !== undefined && exp.bgGradient !== null) {
					if (palette.bgGradient !== exp.bgGradient) {
						isCorrect = false
					}
				}

				if (isCorrect) {
					methodScores[methodName].correct++
				} else {
					methodScores[methodName].issues.push(source)
				}
			}
		}

		// Log summary
		t.diagnostic('============ Method Comparison Summary ============')
		for (const [method, scores] of Object.entries(methodScores)) {
			const pct = scores.total > 0 ? Math.round((scores.correct / scores.total) * 100) : 0
			t.diagnostic(`${method}: ${scores.correct}/${scores.total} correct (${pct}%)`)
			if (scores.issues.length > 0 && scores.issues.length <= 15) {
				t.diagnostic(`  Issues: ${scores.issues.join(', ')}`)
			}
		}
	})
})
