import * as http from 'http'
import * as fs from 'fs'
import { parseArgs, styleText } from "util"
import { join } from "path"
import sharp from "sharp"
import { elbowKmeans, extractColors, gapStatisticKmeans } from "./extractColors.ts"
import { oklabSpace } from "./spaces/oklab.ts"
import { rgbSpace } from "./spaces/rgb.ts"

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
		res.write('<style>body{background:rgb(13, 17, 23); color: rgb(240, 246, 252);}</style>')
		res.write('<h1>Album Art Color Extractor</h1>')
		res.write(`<ul style="
			display:grid;
			grid-template-columns:repeat(auto-fill, 430px);
			gap:1rem;
			padding:1rem;
			list-style:none;
		">`)
		for (const source of sources) {
			res.write(`<li style="border:1px solid rgb(211 211 211 / 20%); display:flex;" id="${source}" data-img>
				<img src="/image/${source}" width=200 />
				<div style="
					display:inline-flex;
					aspect-ratio:1;
					width:200px;
					vertical-align:top;
					flex-direction:column;"
				>
					<div style="flex:1;background:hotpink;"></div>
				</div>
			</li>`)
		}
		res.write(`</ul>
		<script>
			for (const div of document.querySelectorAll('[data-img]')) {
				fetch('/image/' + div.id + '?extract').then(async (response) => {
					const colors = await response.json()
					const total = colors.reduce((acc, [_, count]) => acc + count, 0)
					let inner = ''
					for (const [hex, count] of colors) {
						const percent = Math.round(count / total * 100)
						const color = hex.toString(16).padStart(6, '0')
						inner += \`<div style="
							background-color: #\${color};
							width: 100%;
							flex: \${percent};
						"></div>\`
					}
					div.querySelector('div').innerHTML = inner
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
		const s = sharp(path)
		s.metadata().then(metadata => {
			const transformed = s.extract({
				top: Math.round(metadata.height! * 0.05),
				left: Math.round(metadata.width! * 0.05),
				width: Math.round(metadata.width! * 0.9),
				height: Math.round(metadata.height! * 0.9),
			})
			if (format === 'small') {
				transformed
					.resize(300, 300, {
						fit: "cover",
						fastShrinkOnLoad: true,
						kernel: sharp.kernel.nearest
					})
					.jpeg()
					.toBuffer()
					.then(buffer => {
						res.writeHead(200, { 'Content-Type': 'image/jpeg' })
						res.end(buffer)
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
						const centroids = await extractColors(data, info.channels, {
							useWorkers: true,
							colorSpace: oklabSpace,
							// colorSpace: rgbSpace,
							clamp: 0.005,
							// clamp: false,
							strategy: gapStatisticKmeans({ maxK: 30 }),
							// strategy: elbowKmeans({ start: [2, 3, 4], end: [15, 16, 17] }),
							// strategy: elbowKmeans(),
						}, image)

						const sorted = sortColorMap(centroids)
						res.writeHead(200, { 'Content-Type': 'application/json' })
						res.end(JSON.stringify(sorted))
						return
					})
				return
			}
			res.writeHead(400, { 'Content-Type': 'text/plain' })
			res.end('Invalid format')
		}, err => {
			res.writeHead(500, { 'Content-Type': 'text/plain' })
			res.end(err.message)
		})
	}
})

const { values } = parseArgs({
	options: {
		port: { type: 'string', short: 'i', default: '3000' },
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
