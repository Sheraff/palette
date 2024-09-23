import * as http from 'http'
import * as fs from 'fs'
import { parseArgs, styleText } from "util"
import { join } from "path"
import sharp from "sharp"
import { extractColors } from "./extractColors.ts"
import { oklabSpace } from "./spaces/oklab.ts"
import { rgbSpace } from "./spaces/rgb.ts"
import { labSpace } from "./spaces/lab.ts"
import { gapStatisticKmeans } from "./kmeans/gapStatistic.ts"
import { elbowKmeans } from "./kmeans/elbow.ts"

const sources = [
	'images/black.jpg',
	'images/elephunk.jpg',
	'images/horrorwood.jpg',
	'images/meteora.jpg',
	'images/placebo.jpg',
	'images/slim.jpg',
	'images/vvbrown.jpg',
	'images/skap.jpg',
	'images/toxicity.jpg',
	'images/maroon5.jpg',
	'images/birdsofprey.jpg',
	'images/nobs.jpg',
	'images/ybbb.jpg',
	'images/johns.jpg',
	'images/once.jpg',
	'images/orelsan.jpg',
	'images/krafty.jpg',
	'images/muse.jpg',
	'images/franz.jpg',
	'images/loups.jpg',
	'images/knuckles.jpg',
	'images/infected.jpg',
	'images/doja.jpg',
	'images/nada.jpg',
	'images/slipknot.jpg',
	'images/snarky.jpg',
	'images/purered.jpg',
	'images/pureblack.jpg',
	'images/purewhite.jpg',
]

const cwd = process.cwd()

// simple http server using node
const server = http.createServer((req, res) => {
	if (!req.url) {
		res.writeHead(404, { 'Content-Type': 'text/plain' })
		res.end('Not Found')
		return
	}
	// root path
	if (req.url === '/') {
		res.writeHead(200, { 'Content-Type': 'text/html' })
		res.write('<style>body{background:rgb(13, 17, 23); color: rgb(240, 246, 252);font-size:32px;font-family:sans-serif; text-align:center;}</style>')
		res.write('<h1>Album Art Color Extractor</h1>')
		res.write(`<ul style="
			display:grid;
			grid-template-columns:repeat(auto-fill, 1000px);
			gap:1rem;
			padding:1rem;
			list-style:none;
		">`)
		for (const source of sources) {
			res.write(`<li style="border:1px solid rgb(211 211 211 / 20%); display:flex;" id="${source}" data-img>
				<img src="/image/${source}" width=200 />
				<!--<img src="/image/${source}?small" width=200 />-->
				<div style="
					display:flex;
					aspect-ratio:1;
					width:200px;
					flex-direction:column;"
					data-colors
				>
					<div style="flex:1;background:hotpink;"></div>
				</div>
				<div style="display:flex;flex-direction:column;aspect-ratio:1;width:200px;" data-html>
					<div style="flex:1;background:hotpink;"></div>
				</div>
				<div style="display:flex;flex-direction:column;aspect-ratio:1;width:200px;" data-outer>
					<div style="flex:1;background:hotpink;"></div>
				</div>
				<div style="display:flex;flex-direction:column;aspect-ratio:1;width:200px;" data-inner>
					<div style="flex:1;background:hotpink;"></div>
				</div>
			</li>`)
		}
		res.write(`</ul>
		<script>
			for (const div of document.querySelectorAll('[data-img]')) {
				fetch('/image/' + div.id + '?extract').then(async (response) => {
					const {centroids, inner, outer, third, accent, innerColors, outerColors} = await response.json()
					const total = centroids.reduce((acc, [_, count]) => acc + count, 0)
					let content = ''
					for (const [hex, count] of centroids) {
						const color = hex.toString(16).padStart(6, '0')
						content += \`<div style="
							background-color: #\${color};
							width: 100%;
							flex: \${count};
						"></div>\`
					}
					div.querySelector('[data-colors]').innerHTML = content
					div.querySelector('[data-html]').innerHTML = \`<div style="
						height:100%;
						background:#\${outer.toString(16).padStart(6, '0')};
						color:#\${inner.toString(16).padStart(6, '0')};
						align-content:center;
					">
						<p style="margin-bottom:0;">hello</p>
						<p style="font-size:0.5em;margin-top: 0.5em;">
							<span style="color:#\${accent.toString(16).padStart(6, '0')};">world</span>
						</p>
						<div style="
							background:#\${third.toString(16).padStart(6, '0')};
							padding: 0.5rem;
						">
							<p style="font-size:0.5em;">
								other
								<span style="color:#\${accent.toString(16).padStart(6, '0')};">
									world
								</span>
							</p>
						</div>
					</div>\`
					div.querySelector('[data-outer]').innerHTML = outerColors.map(([color, count]) => (\`
						<div style="
							background-color: #\${color.toString(16).padStart(6, '0')};
							width: 100%;
							flex: \${count};
						"></div>
					\`)).join('')
					div.querySelector('[data-inner]').innerHTML = innerColors.map(([color, count]) => (\`
						<div style="
							background-color: #\${color.toString(16).padStart(6, '0')};
							width: 100%;
							flex: \${count};
						"></div>
					\`)).join('')
				})
			}
		</script>`)
		res.end()
		return
	}
	// image path
	if (req.url.startsWith('/image/')) {
		const [image, format] = req.url.slice('/image/'.length).split('?')
		if (!image) {
			res.writeHead(400, { 'Content-Type': 'text/plain' })
			res.end('No image provided, use /image/<path>')
			return
		}
		const path = join(cwd, image)
		if (!format) {
			fs.readFile(path, (err, buffer) => {
				if (err) {
					res.writeHead(500, { 'Content-Type': 'text/plain' })
					res.end(err.message)
					return
				}
				res.writeHead(200, { 'Content-Type': 'image/jpeg' })
				res.end(buffer)
			})
			return
		}
		const transformed = sharp(path)

		if (format === 'small') {
			transformed
				// .resize(300, 300, {
				// 	fit: "cover",
				// 	fastShrinkOnLoad: true,
				// 	kernel: sharp.kernel.nearest
				// })
				// .jpeg()
				.raw({ depth: "uchar" })
				.toBuffer({ resolveWithObject: true })
				.then(({ data, info: { width, height, channels } }) => {
					const outside = new Uint8Array({
						[Symbol.iterator]: function* () {
							const radius = Math.max(width, height) / 2
							const wCenter = width / 2
							const hCenter = height / 2
							for (let i = 0; i < data.length; i += channels) {
								const x = i / channels % width
								const y = i / channels / width
								const isOut = Math.hypot(x - wCenter, y - hCenter) > radius * 0.95
								const isIn = !isOut && (Math.hypot(x - wCenter, y - hCenter) < radius * 0.70)
								if (isOut || isIn) {
									for (let j = 0; j < channels; j++) {
										yield data[i + j]
									}
								} else {
									for (let j = 0; j < channels; j++) {
										yield 0
									}
								}
							}
						}
					})
					sharp(outside.buffer, { raw: { width, height, channels } }).jpeg().toBuffer().then(buffer => {
						res.writeHead(200, { 'Content-Type': 'image/jpeg' })
						res.end(buffer)
					})
				})
			return
		}
		if (format === 'extract') {
			transformed.raw({ depth: "uchar" })
				.toBuffer({ resolveWithObject: true })
				.then(async ({ data, info }) => {
					if (info.channels !== 3 && info.channels !== 4) {
						throw new Error('Image must have 3 or 4 channels')
					}
					const { centroids, ...rest } = await extractColors(data, info, {
						useWorkers: true,
						colorSpace: oklabSpace,
						// colorSpace: rgbSpace,
						// colorSpace: labSpace,
						clamp: 0.005,
						// clamp: false,
						strategy: gapStatisticKmeans({ maxK: 20, minK: 4 }),
						// strategy: elbowKmeans({ start: [2, 3, 4], end: [15, 16, 17, 50] }),
						// strategy: elbowKmeans(),
					}, image)

					const sorted = sortColorMap(centroids)
					res.writeHead(200, { 'Content-Type': 'application/json' })
					res.end(JSON.stringify({ centroids: sorted, ...rest }))
					return
				})
			return
		}
		res.writeHead(400, { 'Content-Type': 'text/plain' })
		res.end('Invalid format')
	}
})

const { values } = parseArgs({
	options: {
		port: { type: 'string', short: 'p', default: '3000' },
	},
	strict: true,
})
server.listen(values.port, () => {
	console.log(`Server running at `, styleText('magentaBright', `http://localhost:${values.port}/`))
})




function sortColorMap(colors: Map<number, number>): [hex: number, count: number][] {
	return Array.from(colors.entries()).sort((a, b) => b[1] - a[1])
}

function hexToArray(hex: number, ...pad: number[]): Uint8ClampedArray {
	return new Uint8ClampedArray([hex >> 16 & 0xff, hex >> 8 & 0xff, hex & 0xff, ...pad])
}
