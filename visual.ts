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
import { constant } from "./kmeans/constant.ts"
import { extractTextRegions } from "./edgeDetection.ts"
import { saliency } from "./saliency/saliency.ts"
// import { extractTextRegions } from "./textRegions.ts"

const sources = [
	'images/artofficial.jpg',
	'images/havana.jpg',
	'images/horsley.jpg',
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
	'images/greenday.jpg',
	'images/disney.avif',
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
		res.write(`<style>
			body{background:rgb(13, 17, 23); color: rgb(240, 246, 252);font-size:32px;font-family:sans-serif; text-align:center;}
			.method-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7; margin-bottom: 2px; text-align: center; }
			.method-box { display: flex; flex-direction: column; width: 180px; border-left: 1px solid rgba(255,255,255,0.1); }
			.method-preview { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px; font-size: 14px; }
			.method-preview p { margin: 4px 0; }
			.winner { outline: 3px solid #00ff00; outline-offset: -3px; }
			.gradient-indicator { font-size: 9px; opacity: 0.6; margin-top: 4px; }
		</style>`)
		res.write('<h1>Album Art Color Extractor</h1>')
		res.write('<p style="font-size:14px;opacity:0.7;">Comparing full palettes: current (original), ★hybrid (achromatic-first), vibrant (target-based), multi (balanced weights)</p>')
		res.write(`<ul style="
			display:grid;
			grid-template-columns:repeat(auto-fill, 1200px);
			gap:1rem;
			padding:1rem;
			list-style:none;
		">`)
		for (const source of sources) {
			res.write(`<li style="border:1px solid rgb(211 211 211 / 20%); display:flex; align-items:stretch;" id="${source}" data-img>
				<img src="/image/${source}" width=120 style="object-fit:cover;" />
				<img src="/image/${source}?saliency" width=80 style="background:repeating-conic-gradient(#ccc 0 25%, #eee 0 50%) 50% / 8px 8px; object-fit:cover;" />
				<div style="
					display:flex;
					width:60px;
					flex-direction:column;"
					data-colors
				>
					<div style="flex:1;background:hotpink;"></div>
				</div>
				<!-- Full palette comparison boxes -->
				<div class="method-box" data-palette-current>
					<div class="method-label">current</div>
					<div class="method-preview" style="background:hotpink;">—</div>
				</div>
				<div class="method-box" data-palette-hybrid style="border:2px solid #0f0;">
					<div class="method-label">★ hybrid</div>
					<div class="method-preview" style="background:hotpink;">—</div>
				</div>
				<div class="method-box" data-palette-vibrant style="border:2px solid #ff0;">
					<div class="method-label">★ vibrant</div>
					<div class="method-preview" style="background:hotpink;">—</div>
				</div>
				<div class="method-box" data-palette-multiPass>
					<div class="method-label">multi</div>
					<div class="method-preview" style="background:hotpink;">—</div>
				</div>
			</li>`)
		}
		res.write(`</ul>
		<script>
			const toHex = (c) => c === -1 ? null : '#' + c.toString(16).padStart(6, '0')
			
			for (const div of document.querySelectorAll('[data-img]')) {
				fetch('/image/' + div.id + '?extract').then(async (response) => {
					const {centroids, inner, outer, third, accent, bgGradient, fullPalettes} = await response.json()
					console.log('Extracted colors for', div.id, 'fullPalettes:', fullPalettes)
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
					
					// Render each full palette method
					const methods = ['current', 'hybrid', 'vibrant', 'multiPass']
					
					for (const method of methods) {
						const palette = fullPalettes?.[method]
						const box = div.querySelector('[data-palette-' + method + ']')
						if (!box || !palette) continue
						
						const preview = box.querySelector('.method-preview')
						const bgColor = toHex(palette.outer)
						const fgColor = toHex(palette.inner)
						const thirdColor = toHex(palette.third)
						const accentColor = toHex(palette.accent)
						const isGradient = palette.bgGradient
						
						if (bgColor && fgColor) {
							const bgStyle = isGradient && thirdColor 
								? \`background: linear-gradient(135deg, \${bgColor}, \${thirdColor});\`
								: \`background: \${bgColor};\`
							
							preview.innerHTML = \`
								<div style="width:100%; height:100%; \${bgStyle} color:\${fgColor}; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:4px;">
									<p style="margin:0; font-size:18px; font-weight:bold;">hello</p>
									<p style="margin:2px 0 0 0; font-size:12px; color:\${accentColor || fgColor};">world</p>
									<div style="margin-top:4px; background:\${isGradient ? 'transparent' : (thirdColor || bgColor)}; padding:4px 8px; border-radius:2px;">
										<span style="font-size:10px; color:\${fgColor};">other </span>
										<span style="font-size:10px; color:\${accentColor || fgColor};">world</span>
									</div>
									<div class="gradient-indicator">\${isGradient ? '↗ gradient' : '▪ solid'}</div>
								</div>
							\`
							preview.style.padding = '0'
						} else {
							preview.style.background = '#333'
							preview.style.color = '#666'
							preview.innerHTML = '<span style="font-size:12px;">N/A</span>'
						}
					}
					
					// Highlight if methods disagree (different foreground colors found)
					const uniqueFgColors = new Set(methods.map(m => fullPalettes?.[m]?.inner).filter(c => c !== undefined && c !== -1))
					if (uniqueFgColors.size > 1) {
						div.style.borderColor = '#ff6600'
						div.style.borderWidth = '2px'
					}
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

		if (format === 'text') {
			transformed
				.raw({ depth: "uchar" })
				.toBuffer({ resolveWithObject: true })
				.then(({ data, info }) => {
					const { regions } = extractTextRegions(data, info)
					sharp(regions.buffer, { raw: { width: info.width, height: info.height, channels: info.channels } })
						.jpeg()
						.toBuffer()
						.then(textData => {
							res.writeHead(200, { 'Content-Type': 'image/jpeg' })
							res.end(textData)
						})
				})
			return
		}

		if (format === 'saliency') {
			transformed
				.raw({ depth: "uchar" })
				.toBuffer({ resolveWithObject: true })
				.then(async ({ data, info }) => {
					const saliencyMap = new Uint8ClampedArray(new SharedArrayBuffer(info.width * info.height * Uint8ClampedArray.BYTES_PER_ELEMENT))
					await saliency(image, oklabSpace, data, saliencyMap, info.width, info.height, info.channels, false)
					const result = new Uint8Array(info.width * info.height * 4)
					for (let i = 0; i < saliencyMap.length; i++) {
						const value = saliencyMap[i] / 255
						const a = i * 4
						const b = i * info.channels
						result[a + 0] = data[b + 0] * value
						result[a + 1] = data[b + 1] * value
						result[a + 2] = data[b + 2] * value
						result[a + 3] = value * 255
					}
					sharp(result.buffer, { raw: { width: info.width, height: info.height, channels: 4 } })
						.png()
						.toBuffer()
						.then(textData => {
							res.writeHead(200, { 'Content-Type': 'image/png' })
							res.end(textData)
						})
				})
			return
		}

		if (format === 'mask') {
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
						workers: true,
						colorSpace: oklabSpace,
						// colorSpace: rgbSpace,
						// colorSpace: labSpace,
						clamp: 0.005,
						// trimPercent: 0,
						// clamp: false,
						strategy: gapStatisticKmeans({ maxK: 20, minK: 4 }),
						// strategy: elbowKmeans({ start: [2, 3, 4, 5], end: [15, 16, 17, 50] }),
						// strategy: elbowKmeans(),
						// strategy: constant()
						minForegroundContrast: 30,
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
