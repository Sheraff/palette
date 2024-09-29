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

test.describe('OKLab space, clamp, gapStatistic maxK 20 minK 4', {
	concurrency: true,
}, () => {
	const options: ExtractOptions = {
		workers: true,
		colorSpace: oklabSpace,
		clamp: 0.005,
		strategy: gapStatisticKmeans({ maxK: 20, minK: 4 }),
	}

	test('Longest Johns', async (t) => {
		await loadImage(join(import.meta.dirname, '../images/johns.jpg'), options)
			.then(({ accent, outer, inner, third }) => {
				t.diagnostic(`accent: ${hex(accent)} >> ${nameColor(accent)} (${simpleColor(accent)})`)
				t.diagnostic(`outer: ${hex(outer)} >> ${nameColor(outer)} (${simpleColor(outer)})`)
				t.diagnostic(`inner: ${hex(inner)} >> ${nameColor(inner)} (${simpleColor(inner)})`)
				t.diagnostic(`third: ${hex(third)} >> ${nameColor(third)} (${simpleColor(third)})`)
				assert.strictEqual(nameColor(accent), 'lightcoral')
				assert.strictEqual(nameColor(outer), 'black')
				assert.strictEqual(nameColor(inner), 'gainsboro')
				assert.strictEqual(nameColor(third), 'royalblue')
			})
	})

	test('Franz Ferdinand', async (t) => {
		await loadImage(join(import.meta.dirname, '../images/franz.jpg'), options)
			.then(({ accent, outer, inner, third }) => {
				t.diagnostic(`accent: ${hex(accent)} >> ${nameColor(accent)} (${simpleColor(accent)})`)
				t.diagnostic(`outer: ${hex(outer)} >> ${nameColor(outer)} (${simpleColor(outer)})`)
				t.diagnostic(`inner: ${hex(inner)} >> ${nameColor(inner)} (${simpleColor(inner)})`)
				t.diagnostic(`third: ${hex(third)} >> ${nameColor(third)} (${simpleColor(third)})`)
				assert.strictEqual(nameColor(accent), 'goldenrod')
				assert.strictEqual(nameColor(outer), 'black')
				assert.strictEqual(nameColor(inner), 'lemonchiffon')
				assert.strictEqual(nameColor(third), 'black')
			})
	})

	test('Slipknot', async (t) => {
		await loadImage(join(import.meta.dirname, '../images/slipknot.jpg'), options)
			.then(({ accent, outer, inner, third }) => {
				t.diagnostic(`accent: ${hex(accent)} >> ${nameColor(accent)} (${simpleColor(accent)})`)
				t.diagnostic(`outer: ${hex(outer)} >> ${nameColor(outer)} (${simpleColor(outer)})`)
				t.diagnostic(`inner: ${hex(inner)} >> ${nameColor(inner)} (${simpleColor(inner)})`)
				t.diagnostic(`third: ${hex(third)} >> ${nameColor(third)} (${simpleColor(third)})`)
				assert.strictEqual(nameColor(accent), 'white')
				assert.strictEqual(nameColor(outer), 'black')
				assert.strictEqual(nameColor(inner), 'white')
				assert.strictEqual(nameColor(third), 'black')
			})
	})

	test('Infected Mushrooms', async (t) => {
		await loadImage(join(import.meta.dirname, '../images/infected.jpg'), options)
			.then(({ accent, outer, inner, third }) => {
				t.diagnostic(`accent: ${hex(accent)} >> ${nameColor(accent)} (${simpleColor(accent)})`)
				t.diagnostic(`outer: ${hex(outer)} >> ${nameColor(outer)} (${simpleColor(outer)})`)
				t.diagnostic(`inner: ${hex(inner)} >> ${nameColor(inner)} (${simpleColor(inner)})`)
				t.diagnostic(`third: ${hex(third)} >> ${nameColor(third)} (${simpleColor(third)})`)
				assert.strictEqual(nameColor(accent), 'slateblue')
				assert.strictEqual(nameColor(outer), 'midnightblue')
				assert.strictEqual(nameColor(inner), 'indianred')
				assert.strictEqual(nameColor(third), 'midnightblue')
			})
	})
})