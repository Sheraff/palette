import { test } from "node:test"
import assert from "node:assert"
import { oklabSpace } from "../spaces/oklab.ts"
import sharp from "sharp"
import { join } from "node:path"
import { extractColors } from "../extractColors.ts"
import { gapStatisticKmeans } from "../kmeans/gapStatistic.ts"

const images = [
	{ img: 'artofficial.jpg', gradient: 'maybe' },
	{ img: 'horsley.jpg', gradient: 'maybe' },
	{ img: 'havana.jpg', gradient: 'maybe' },
	{ img: 'disney.avif', gradient: false },
	{ img: 'placebo.jpg', gradient: true },
	{ img: 'greenday.jpg', gradient: false },
	{ img: 'snarky.jpg', gradient: false },
	{ img: 'toxicity.jpg', gradient: false },
	{ img: 'slipknot.jpg', gradient: false },
	{ img: 'nada.jpg', gradient: 'maybe' },
	{ img: 'doja.jpg', gradient: true },
	{ img: 'infected.jpg', gradient: true },
	{ img: 'franz.jpg', gradient: false },
	{ img: 'loups.jpg', gradient: true },
	{ img: 'knuckles.jpg', gradient: true },
	{ img: 'meteora.jpg', gradient: false },
	{ img: 'muse.jpg', gradient: true },
	{ img: 'krafty.jpg', gradient: false },
	{ img: 'orelsan.jpg', gradient: true },
	{ img: 'once.jpg', gradient: true },
	{ img: 'johns.jpg', gradient: false },
	{ img: 'ybbb.jpg', gradient: false },
	{ img: 'nobs.jpg', gradient: false },
	{ img: 'maroon5.jpg', gradient: false },
	{ img: 'birdsofprey.jpg', gradient: 'maybe' },
	{ img: 'skap.jpg', gradient: 'maybe' },
	{ img: 'vvbrown.jpg', gradient: false },
	{ img: 'black.jpg', gradient: false },
	{ img: 'horrorwood.jpg', gradient: true },
	{ img: 'elephunk.jpg', gradient: false },
	{ img: 'slim.jpg', gradient: true },
] as const

const __dirname = new URL('.', import.meta.url).pathname
const img_dir = join(__dirname, '..', 'images')
for (const { img, gradient } of images) {
	if (gradient === 'maybe') continue // Skip uncertain cases
	test(`Gradient Detection on ${img} (expected gradient: ${gradient})`, async () => {
		const result = await sharp(join(img_dir, img))
			.raw({ depth: "uchar" })
			.toBuffer({ resolveWithObject: true })
			.then(async ({ data, info }) => extractColors(data, info, {
				workers: true,
				colorSpace: oklabSpace,
				clamp: 0.005,
				strategy: gapStatisticKmeans({ maxK: 20, minK: 4 }),
			}, img))

		assert.strictEqual(result.bgGradient, gradient, `Gradient detection for ${img} should be ${gradient}`)
	})
}