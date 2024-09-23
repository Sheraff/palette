import test from "node:test"
import assert from "node:assert"
import { nameColor } from "./color-name.ts"
import sharp from "sharp"
import { oklabSpace } from "../spaces/oklab.ts"
import { extractColors, gapStatisticKmeans, type ExtractOptions } from "../extractColors.ts"
import { join } from "node:path"

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
		useWorkers: true,
		colorSpace: oklabSpace,
		clamp: 0.005,
		strategy: gapStatisticKmeans({ maxK: 20, minK: 4 }),
	}

	test('Longest Johns', async (t) => {
		await loadImage(join(import.meta.dirname, '../images/johns.jpg'), options)
			.then(({ accent, outer, inner, third }) => {
				t.diagnostic(`accent: ${hex(accent)} >> salmon`)
				t.diagnostic(`outer: ${hex(outer)} >> black`)
				t.diagnostic(`inner: ${hex(inner)} >> aliceblue`)
				t.diagnostic(`third: ${hex(third)} >> royalblue`)
				assert.strictEqual(nameColor(accent), 'salmon')
				assert.strictEqual(nameColor(outer), 'black')
				assert.strictEqual(nameColor(inner), 'aliceblue')
				assert.strictEqual(nameColor(third), 'royalblue')
			})
	})

	test('Franz Ferdinand', async (t) => {
		await loadImage(join(import.meta.dirname, '../images/franz.jpg'), options)
			.then(({ accent, outer, inner, third }) => {
				t.diagnostic(`accent: ${hex(accent)} >> goldenrod`)
				t.diagnostic(`outer: ${hex(outer)} >> black`)
				t.diagnostic(`inner: ${hex(inner)} >> lemonchiffon`)
				t.diagnostic(`third: ${hex(third)} >> black`)
				assert.strictEqual(nameColor(accent), 'goldenrod')
				assert.strictEqual(nameColor(outer), 'black')
				assert.strictEqual(nameColor(inner), 'lemonchiffon')
				assert.strictEqual(nameColor(third), 'black')
			})
	})

	test('Slipknot', async (t) => {
		await loadImage(join(import.meta.dirname, '../images/slipknot.jpg'), options)
			.then(({ accent, outer, inner, third }) => {
				t.diagnostic(`accent: ${hex(accent)} >> white`)
				t.diagnostic(`outer: ${hex(outer)} >> black`)
				t.diagnostic(`inner: ${hex(inner)} >> white`)
				t.diagnostic(`third: ${hex(third)} >> black`)
				assert.strictEqual(nameColor(accent), 'white')
				assert.strictEqual(nameColor(outer), 'black')
				assert.strictEqual(nameColor(inner), 'white')
				assert.strictEqual(nameColor(third), 'black')
			})
	})

	test('Infected Mushrooms', async (t) => {
		await loadImage(join(import.meta.dirname, '../images/infected.jpg'), options)
			.then(({ accent, outer, inner, third }) => {
				t.diagnostic(`accent: ${hex(accent)} >> crimson`)
				t.diagnostic(`outer: ${hex(outer)} >> darkslateblue`)
				t.diagnostic(`inner: ${hex(inner)} >> deepskyblue`)
				t.diagnostic(`third: ${hex(third)} >> midnightblue`)
				assert.strictEqual(nameColor(accent), 'crimson')
				assert.strictEqual(nameColor(outer), 'darkslateblue')
				assert.strictEqual(nameColor(inner), 'deepskyblue')
				assert.strictEqual(nameColor(third), 'midnightblue')
			})
	})
})