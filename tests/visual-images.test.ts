/**
 * Comprehensive tests for all images from visual.ts
 * Tests all outputs: outer, inner, third, accent, bgGradient
 * 
 * Purpose: Prevent regressions when improving one aspect of the algorithm
 * 
 * Uses recorded-palettes.json as the source of truth for expected palettes.
 * When an image has multiple acceptable palettes, only one needs to match.
 * 
 * Usage (via environment variables):
 *   node --test tests/visual-images.test.ts                           # Run all
 *   METHOD=paired node --test tests/visual-images.test.ts             # Only test "paired" method
 *   IMAGE=birdsofprey node --test tests/visual-images.test.ts         # Only test images containing "birdsofprey"
 *   METHOD=paired IMAGE=knuckles node --test tests/visual-images.test.ts # Combined filters
 */

import { describe, test } from 'node:test'
import assert from 'node:assert'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { extractColors, type ExtractOptions } from '../extractColors.ts'
import { oklabSpace } from '../spaces/oklab.ts'
import { gapStatisticKmeans } from '../kmeans/gapStatistic.ts'
import sharp from 'sharp'
import { nameColor, simpleColor, longNameColor } from './color-name.ts'

// Parse environment variables for filtering
const methodFilter = process.env.METHOD?.toLowerCase()
const imageFilter = process.env.IMAGE?.toLowerCase()

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

// Load recorded palettes as source of truth
type RecordedPalette = {
	outer: number
	inner: number
	third: number
	accent: number
	isGradient: boolean
}

const recordedPalettesPath = join(import.meta.dirname, 'recorded-palettes.json')
const recordedPalettes: Record<string, RecordedPalette[]> = JSON.parse(
	readFileSync(recordedPalettesPath, 'utf-8')
)

// All available methods
const ALL_METHODS = ['current', 'hybrid', 'vibrant', 'multiPass', 'unified', 'paired', 'triplet'] as const
type MethodName = typeof ALL_METHODS[number]

// Filter methods based on CLI arg
const methodsToTest: MethodName[] = methodFilter
	? ALL_METHODS.filter(m => m.toLowerCase().includes(methodFilter))
	: [...ALL_METHODS]

// Filter images based on CLI arg
const sources = Object.keys(recordedPalettes).filter(img =>
	!imageFilter || img.toLowerCase().includes(imageFilter)
)

/**
 * Format a color for diagnostic output
 * Format: longName (shortName, simpleName)
 */
function formatColor(color: number): string {
	return `${longNameColor(color)} (${nameColor(color)}, ${simpleColor(color)})`
}

/**
 * Check if two colors match by comparing their longNameColor names
 */
function colorsMatch(actual: number, expected: number): boolean {
	return longNameColor(actual) === longNameColor(expected)
}

/**
 * Check if a palette matches one of the expected palettes
 * All fields (outer, inner, third, accent, isGradient) must match
 */
function paletteMatchesAny(
	actual: { outer: number; inner: number; third: number; accent: number; bgGradient: boolean },
	expectedPalettes: RecordedPalette[]
): { matches: boolean; bestMatch: RecordedPalette | null; bestMatchCount: number } {
	let bestMatch: RecordedPalette | null = null
	let bestMatchCount = 0

	for (const expected of expectedPalettes) {
		let matchCount = 0

		if (colorsMatch(actual.outer, expected.outer)) matchCount++
		if (colorsMatch(actual.inner, expected.inner)) matchCount++
		if (colorsMatch(actual.third, expected.third)) matchCount++
		if (colorsMatch(actual.accent, expected.accent)) matchCount++
		if (actual.bgGradient === expected.isGradient) matchCount++

		if (matchCount === 5) {
			return { matches: true, bestMatch: expected, bestMatchCount: 5 }
		}

		if (matchCount > bestMatchCount) {
			bestMatchCount = matchCount
			bestMatch = expected
		}
	}

	return { matches: false, bestMatch, bestMatchCount }
}

type FullPalette = { outer: number; inner: number; third: number; accent: number; bgGradient: boolean }

/**
 * Format a full palette for diagnostic output
 */
function formatPalette(p: FullPalette): string {
	const o = simpleColor(p.outer)
	const i = simpleColor(p.inner)
	const t = simpleColor(p.third)
	const a = simpleColor(p.accent)
	const g = p.bgGradient ? '↗' : '▪'
	return `bg:${o} fg:${i} 3rd:${t} acc:${a} ${g}`
}

// Log filter info
if (methodFilter || imageFilter) {
	console.log(`\n🔍 Filters applied:`)
	if (methodFilter) console.log(`   Methods: ${methodsToTest.join(', ')}`)
	if (imageFilter) console.log(`   Images: ${sources.length} matching "${imageFilter}"`)
	console.log('')
}

describe('Visual Images - Palette Tests', () => {
	for (const source of sources) {
		test(source, async (t) => {
			const imagePath = join(import.meta.dirname, '../images', source)
			const result = await loadImage(imagePath, defaultOptions)
			const expectedPalettes = recordedPalettes[source]

			if (!expectedPalettes || expectedPalettes.length === 0) {
				t.diagnostic(`No expectations defined for ${source}`)
				return
			}

			// Get full palettes from result
			const palettes = (result as any).fullPalettes as Record<string, FullPalette> | undefined

			// Log comparison for visual review
			t.diagnostic(`------- ${source} -------`)
			t.diagnostic(`Expected palettes: ${expectedPalettes.length}`)

			if (palettes) {
				for (const method of methodsToTest) {
					const palette = palettes[method]
					if (!palette) continue
					const marker = methodsToTest.length === 1 ? '★' : ' '
					t.diagnostic(`${marker}${method.padEnd(8)}: ${formatPalette(palette)}`)
				}
			}

			// Test each method - at least one expected palette must match
			for (const methodName of methodsToTest) {
				const palette = palettes?.[methodName]
				if (!palette) continue

				const { matches, bestMatch, bestMatchCount } = paletteMatchesAny(palette, expectedPalettes)

				if (!matches) {
					// Build detailed error message
					const actualFormatted = {
						outer: formatColor(palette.outer),
						inner: formatColor(palette.inner),
						third: formatColor(palette.third),
						accent: formatColor(palette.accent),
						bgGradient: palette.bgGradient,
					}

					let errorMsg = `[${source} → ${methodName}] No matching palette found (best match: ${bestMatchCount}/5 fields)\n`
					errorMsg += `  Actual:\n`
					errorMsg += `    outer:  ${actualFormatted.outer}\n`
					errorMsg += `    inner:  ${actualFormatted.inner}\n`
					errorMsg += `    third:  ${actualFormatted.third}\n`
					errorMsg += `    accent: ${actualFormatted.accent}\n`
					errorMsg += `    gradient: ${actualFormatted.bgGradient}\n`

					if (bestMatch) {
						errorMsg += `  Best matching expected palette:\n`
						errorMsg += `    outer:  ${formatColor(bestMatch.outer)}\n`
						errorMsg += `    inner:  ${formatColor(bestMatch.inner)}\n`
						errorMsg += `    third:  ${formatColor(bestMatch.third)}\n`
						errorMsg += `    accent: ${formatColor(bestMatch.accent)}\n`
						errorMsg += `    gradient: ${bestMatch.isGradient}\n`
						errorMsg += `  Mismatches:\n`

						if (!colorsMatch(palette.outer, bestMatch.outer)) {
							errorMsg += `    - outer: got ${longNameColor(palette.outer)}, expected ${longNameColor(bestMatch.outer)}\n`
						}
						if (!colorsMatch(palette.inner, bestMatch.inner)) {
							errorMsg += `    - inner: got ${longNameColor(palette.inner)}, expected ${longNameColor(bestMatch.inner)}\n`
						}
						if (!colorsMatch(palette.third, bestMatch.third)) {
							errorMsg += `    - third: got ${longNameColor(palette.third)}, expected ${longNameColor(bestMatch.third)}\n`
						}
						if (!colorsMatch(palette.accent, bestMatch.accent)) {
							errorMsg += `    - accent: got ${longNameColor(palette.accent)}, expected ${longNameColor(bestMatch.accent)}\n`
						}
						if (palette.bgGradient !== bestMatch.isGradient) {
							errorMsg += `    - gradient: got ${palette.bgGradient}, expected ${bestMatch.isGradient}\n`
						}
					}

					assert.fail(errorMsg)
				}
			}
		})
	}
})

/**
 * Summary test to count how many images each method gets fully correct
 */
describe('Method Comparison Summary', () => {
	test('Count correct palettes per method', async (t) => {
		const methodScores: Record<string, { correct: number; total: number; issues: string[] }> = {}
		for (const m of methodsToTest) {
			methodScores[m] = { correct: 0, total: 0, issues: [] }
		}

		for (const source of sources) {
			const imagePath = join(import.meta.dirname, '../images', source)
			const result = await loadImage(imagePath, defaultOptions)
			const expectedPalettes = recordedPalettes[source]
			const palettes = (result as any).fullPalettes as Record<string, FullPalette> | undefined

			if (!palettes || !expectedPalettes || expectedPalettes.length === 0) continue

			for (const methodName of methodsToTest) {
				const palette = palettes[methodName]
				if (!palette) continue

				methodScores[methodName].total++

				const { matches } = paletteMatchesAny(palette, expectedPalettes)

				if (matches) {
					methodScores[methodName].correct++
				} else {
					methodScores[methodName].issues.push(source)
				}
			}
		}

		// Log summary
		t.diagnostic('============ Method Comparison Summary ============')
		for (const method of methodsToTest) {
			const scores = methodScores[method]
			const pct = scores.total > 0 ? Math.round((scores.correct / scores.total) * 100) : 0
			t.diagnostic(`${method}: ${scores.correct}/${scores.total} correct (${pct}%)`)
			if (scores.issues.length > 0 && scores.issues.length <= 15) {
				t.diagnostic(`  Issues: ${scores.issues.join(', ')}`)
			}
		}
	})
})
