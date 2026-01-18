import test from "node:test"
import assert from "node:assert"
import { nameColor, simpleColor } from "./color-name.ts"
import sharp from "sharp"
import { oklabSpace } from "../spaces/oklab.ts"
import { extractColors, type ExtractOptions } from "../extractColors.ts"
import { join } from "node:path"
import { gapStatisticKmeans } from "../kmeans/gapStatistic.ts"

function loadImage(path: string, options: ExtractOptions) {
	return sharp(path)
		.raw({ depth: 'uchar' })
		.toBuffer({ resolveWithObject: true })
		.then(({ data, info }) => extractColors(data, info, options, path))
}

function hex(color: number) {
	return '#' + color.toString(16).padStart(6, '0')
}

// Helper to get the hybrid foreground color
function getHybridFg(result: Awaited<ReturnType<typeof loadImage>>): number {
	return result.foregroundMethods?.hybrid?.color ?? result.inner
}

const defaultOptions: ExtractOptions = {
	workers: true,
	colorSpace: oklabSpace,
	clamp: 0.005,
	strategy: gapStatisticKmeans({ maxK: 20, minK: 4 }),
	minForegroundContrast: 30,
	// saliencyWeight defaults to 5 (6x boost for salient pixels)
}

// For comparison: lower saliency weight
const lowSaliencyOptions: ExtractOptions = {
	...defaultOptions,
	saliencyWeight: 2, // Lower weight for comparison
}

test.describe('Foreground Detection Tests', {
	concurrency: true,
}, () => {

	/**
	 * horsley.jpg: Orange/yellow gradient background with cream-colored text
	 * "JOACHIM HORSLEY" at top, "VIA HAVANA" at bottom
	 * The text is cream/pale yellow to match the vintage aesthetic.
	 */
	test('horsley - should have cream/white foreground', async (t) => {
		const result = await loadImage(join(import.meta.dirname, '../images/horsley.jpg'), defaultOptions)
		const hybridFg = getHybridFg(result)
		t.diagnostic(`outer (bg): ${hex(result.outer)} >> ${nameColor(result.outer)} (${simpleColor(result.outer)})`)
		t.diagnostic(`inner (original): ${hex(result.inner)} >> ${nameColor(result.inner)} (${simpleColor(result.inner)})`)
		t.diagnostic(`hybrid (fg): ${hex(hybridFg)} >> ${nameColor(hybridFg)} (${simpleColor(hybridFg)})`)

		// Cream/pale yellow or white - the text has a vintage cream color
		const fgSimple = simpleColor(hybridFg)
		assert.ok(
			fgSimple === 'white' || fgSimple === 'gray' || fgSimple === 'beige' || fgSimple === 'yellow',
			`Expected white/gray/beige/yellow foreground, got ${fgSimple} (${nameColor(hybridFg)})`
		)
	})

	/**
	 * birdsofprey.jpg: Colorful rainbow gradient background with BLACK text
	 * "BIRDS OF PREY" and "THE ALBUM" (main title is black)
	 * Background detected as dark blue, so black text may not have good contrast.
	 * The person's face (tan/pink) is a prominent foreground element.
	 */
	test('birdsofprey - should have reasonable foreground', async (t) => {
		const result = await loadImage(join(import.meta.dirname, '../images/birdsofprey.jpg'), defaultOptions)
		const hybridFg = getHybridFg(result)
		t.diagnostic(`outer (bg): ${hex(result.outer)} >> ${nameColor(result.outer)} (${simpleColor(result.outer)})`)
		t.diagnostic(`inner (original): ${hex(result.inner)} >> ${nameColor(result.inner)} (${simpleColor(result.inner)})`)
		t.diagnostic(`hybrid (fg): ${hex(hybridFg)} >> ${nameColor(hybridFg)} (${simpleColor(hybridFg)})`)

		// Black text, or tan/pink (face), or any high-contrast element
		const contrast = oklabSpace.contrast(
			oklabSpace.toHex([result.outer >> 16 & 0xff, result.outer >> 8 & 0xff, result.outer & 0xff], 0),
			oklabSpace.toHex([hybridFg >> 16 & 0xff, hybridFg >> 8 & 0xff, hybridFg & 0xff], 0)
		)
		t.diagnostic(`contrast: ${contrast}`)
		assert.ok(contrast >= 30, `Expected contrast >= 30, got ${contrast}`)
	})

	/**
	 * loups.jpg: Peach/orange/yellow warm background with WHITE text
	 * "LES LOUPS" and "CLUB CŒUR"
	 * White text exists but may not form a centroid (too small).
	 * The red geometric wolf is a prominent foreground element.
	 */
	test('loups - should have white or red foreground', async (t) => {
		const result = await loadImage(join(import.meta.dirname, '../images/loups.jpg'), defaultOptions)
		const hybridFg = getHybridFg(result)
		t.diagnostic(`outer (bg): ${hex(result.outer)} >> ${nameColor(result.outer)} (${simpleColor(result.outer)})`)
		t.diagnostic(`inner (original): ${hex(result.inner)} >> ${nameColor(result.inner)} (${simpleColor(result.inner)})`)
		t.diagnostic(`hybrid (fg): ${hex(hybridFg)} >> ${nameColor(hybridFg)} (${simpleColor(hybridFg)})`)

		// White text or red wolf logo
		const fgSimple = simpleColor(hybridFg)
		assert.ok(
			fgSimple === 'white' || fgSimple === 'gray' || fgSimple === 'red' || fgSimple === 'orange',
			`Expected white/gray/red/orange foreground, got ${fgSimple} (${nameColor(hybridFg)})`
		)
	})

	/**
	 * nada.jpg: Blue textured background with WHITE text
	 * "NADA SURF" and "LET GO"
	 * Expected foreground: white
	 */
	test('nada - should have white foreground', async (t) => {
		const result = await loadImage(join(import.meta.dirname, '../images/nada.jpg'), defaultOptions)
		const hybridFg = getHybridFg(result)
		t.diagnostic(`outer (bg): ${hex(result.outer)} >> ${nameColor(result.outer)} (${simpleColor(result.outer)})`)
		t.diagnostic(`inner (original): ${hex(result.inner)} >> ${nameColor(result.inner)} (${simpleColor(result.inner)})`)
		t.diagnostic(`hybrid (fg): ${hex(hybridFg)} >> ${nameColor(hybridFg)} (${simpleColor(hybridFg)})`)

		// Foreground should be white
		const fgSimple = simpleColor(hybridFg)
		assert.ok(
			fgSimple === 'white' || fgSimple === 'gray',
			`Expected white/gray foreground, got ${fgSimple} (${nameColor(hybridFg)})`
		)
	})

	/**
	 * maroon5.jpg: Black/red background with WHITE text
	 * "MAROON 5" and "SONGS ABOUT JANE"
	 * Expected foreground: white
	 */
	test('maroon5 - should have white foreground', async (t) => {
		const result = await loadImage(join(import.meta.dirname, '../images/maroon5.jpg'), defaultOptions)
		const hybridFg = getHybridFg(result)
		t.diagnostic(`outer (bg): ${hex(result.outer)} >> ${nameColor(result.outer)} (${simpleColor(result.outer)})`)
		t.diagnostic(`inner (original): ${hex(result.inner)} >> ${nameColor(result.inner)} (${simpleColor(result.inner)})`)
		t.diagnostic(`hybrid (fg): ${hex(hybridFg)} >> ${nameColor(hybridFg)} (${simpleColor(hybridFg)})`)

		// Foreground should be white or near-white
		const fgSimple = simpleColor(hybridFg)
		assert.ok(
			fgSimple === 'white' || fgSimple === 'gray',
			`Expected white/gray foreground, got ${fgSimple} (${nameColor(hybridFg)})`
		)
	})

	/**
	 * doja.jpg: Hot pink monochromatic with WHITE text
	 * "HOT PINK" and "DOJA CAT"
	 * Expected foreground: white
	 */
	test('doja - should have white foreground', async (t) => {
		const result = await loadImage(join(import.meta.dirname, '../images/doja.jpg'), defaultOptions)
		const hybridFg = getHybridFg(result)
		t.diagnostic(`outer (bg): ${hex(result.outer)} >> ${nameColor(result.outer)} (${simpleColor(result.outer)})`)
		t.diagnostic(`inner (original): ${hex(result.inner)} >> ${nameColor(result.inner)} (${simpleColor(result.inner)})`)
		t.diagnostic(`hybrid (fg): ${hex(hybridFg)} >> ${nameColor(hybridFg)} (${simpleColor(hybridFg)})`)

		// Foreground should be white
		const fgSimple = simpleColor(hybridFg)
		assert.ok(
			fgSimple === 'white' || fgSimple === 'gray',
			`Expected white/gray foreground, got ${fgSimple} (${nameColor(hybridFg)})`
		)
	})

	/**
	 * vvbrown.jpg: Has both black and yellow text on banners
	 * Either black or yellow is acceptable for foreground
	 * Background is black, so white/yellow are good foregrounds
	 */
	test('vvbrown - should have white or yellow foreground', async (t) => {
		const result = await loadImage(join(import.meta.dirname, '../images/vvbrown.jpg'), defaultOptions)
		const hybridFg = getHybridFg(result)
		t.diagnostic(`outer (bg): ${hex(result.outer)} >> ${nameColor(result.outer)} (${simpleColor(result.outer)})`)
		t.diagnostic(`inner (original): ${hex(result.inner)} >> ${nameColor(result.inner)} (${simpleColor(result.inner)})`)
		t.diagnostic(`hybrid (fg): ${hex(hybridFg)} >> ${nameColor(hybridFg)} (${simpleColor(hybridFg)})`)

		// White or yellow is acceptable (background is black)
		const fgSimple = simpleColor(hybridFg)
		assert.ok(
			fgSimple === 'white' || fgSimple === 'yellow' || fgSimple === 'olive',
			`Expected white/yellow/olive foreground, got ${fgSimple} (${nameColor(hybridFg)})`
		)
	})

	/**
	 * infected.jpg: Dark blue background with ORANGE/RED text and cyan glowing elements
	 * "INFECTED MUSHROOM" and "HEAD OF NASA"
	 * Expected foreground: red/orange (text), cyan/blue (glowing moon), or white (small text)
	 */
	test('infected - should have red, blue, cyan or white foreground', async (t) => {
		const result = await loadImage(join(import.meta.dirname, '../images/infected.jpg'), defaultOptions)
		const hybridFg = getHybridFg(result)
		t.diagnostic(`outer (bg): ${hex(result.outer)} >> ${nameColor(result.outer)} (${simpleColor(result.outer)})`)
		t.diagnostic(`inner (original): ${hex(result.inner)} >> ${nameColor(result.inner)} (${simpleColor(result.inner)})`)
		t.diagnostic(`hybrid (fg): ${hex(hybridFg)} >> ${nameColor(hybridFg)} (${simpleColor(hybridFg)})`)

		// Red/orange for text, cyan/blue for the moon, or white for small text
		const fgSimple = simpleColor(hybridFg)
		assert.ok(
			fgSimple === 'red' || fgSimple === 'blue' || fgSimple === 'orange' || fgSimple === 'cyan' || fgSimple === 'white',
			`Expected red/blue/orange/cyan/white foreground, got ${fgSimple} (${nameColor(hybridFg)})`
		)
	})

	/**
	 * orelsan.jpg: Dark photo, highlights are brownish/beige
	 * This is a photo without clear text, so foreground is more subjective
	 */
	test('orelsan - should have some highlight color', async (t) => {
		const result = await loadImage(join(import.meta.dirname, '../images/orelsan.jpg'), defaultOptions)
		const hybridFg = getHybridFg(result)
		t.diagnostic(`outer (bg): ${hex(result.outer)} >> ${nameColor(result.outer)} (${simpleColor(result.outer)})`)
		t.diagnostic(`inner (original): ${hex(result.inner)} >> ${nameColor(result.inner)} (${simpleColor(result.inner)})`)
		t.diagnostic(`hybrid (fg): ${hex(hybridFg)} >> ${nameColor(hybridFg)} (${simpleColor(hybridFg)})`)

		// Should have reasonable contrast
		const contrast = oklabSpace.contrast(
			oklabSpace.toHex([result.outer >> 16 & 0xff, result.outer >> 8 & 0xff, result.outer & 0xff], 0),
			oklabSpace.toHex([hybridFg >> 16 & 0xff, hybridFg >> 8 & 0xff, hybridFg & 0xff], 0)
		)
		t.diagnostic(`contrast: ${contrast}`)
		assert.ok(contrast >= 20, `Expected contrast >= 20, got ${contrast}`)
	})

	/**
	 * snarky.jpg: Yellow/olive background with BLACK and WHITE text
	 * "SNARKY PUPPY" (white) and "BRING US THE BRIGHT" (black)
	 * Either black or white is acceptable
	 */
	test('snarky - should have black or white foreground', async (t) => {
		const result = await loadImage(join(import.meta.dirname, '../images/snarky.jpg'), defaultOptions)
		const hybridFg = getHybridFg(result)
		t.diagnostic(`outer (bg): ${hex(result.outer)} >> ${nameColor(result.outer)} (${simpleColor(result.outer)})`)
		t.diagnostic(`inner (original): ${hex(result.inner)} >> ${nameColor(result.inner)} (${simpleColor(result.inner)})`)
		t.diagnostic(`hybrid (fg): ${hex(hybridFg)} >> ${nameColor(hybridFg)} (${simpleColor(hybridFg)})`)

		const fgSimple = simpleColor(hybridFg)
		assert.ok(
			fgSimple === 'black' || fgSimple === 'white' || fgSimple === 'gray',
			`Expected black/white/gray foreground, got ${fgSimple} (${nameColor(hybridFg)})`
		)
	})

	/**
	 * Test: Compare high vs low saliency weight for nada
	 * Demonstrates that higher saliency weight helps text colors form centroids
	 */
	test('nada - compare saliency weights', async (t) => {
		const lowResult = await loadImage(join(import.meta.dirname, '../images/nada.jpg'), lowSaliencyOptions)
		const highResult = await loadImage(join(import.meta.dirname, '../images/nada.jpg'), defaultOptions)

		const lowFg = getHybridFg(lowResult)
		const highFg = getHybridFg(highResult)

		t.diagnostic(`[saliencyWeight=2] hybrid: ${hex(lowFg)} >> ${nameColor(lowFg)} (${simpleColor(lowFg)})`)
		t.diagnostic(`[saliencyWeight=5] hybrid: ${hex(highFg)} >> ${nameColor(highFg)} (${simpleColor(highFg)})`)

		// Log all centroids to see if white appears
		t.diagnostic(`[saliencyWeight=2] centroids: ${Array.from(lowResult.centroids.keys()).map(c => hex(c)).join(', ')}`)
		t.diagnostic(`[saliencyWeight=5] centroids: ${Array.from(highResult.centroids.keys()).map(c => hex(c)).join(', ')}`)

		// With high saliency weight, should get white
		const fgSimple = simpleColor(highFg)
		assert.ok(
			fgSimple === 'white' || fgSimple === 'gray',
			`With saliencyWeight=5, expected white/gray, got ${fgSimple}`
		)
	})
})
