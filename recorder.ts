import * as http from 'http'
import * as fs from 'fs'
import { parseArgs, styleText } from "util"
import { join } from "path"
import sharp from "sharp"
import { oklabSpace } from "./spaces/oklab.ts"
import { gapStatisticKmeans } from "./kmeans/gapStatistic.ts"
import { saliency } from "./saliency/saliency.ts"
import type { Pool } from "./kmeans/types.ts"
import type { ColorSpace } from "./spaces/types.ts"
import {
	trimSource,
	countColors,
	sortColorMap,
	transferableMap,
	clampCentroidsToOriginalColors,
	groupImperceptiblyDifferentColors,
	forceExtremeColors,
	type Meta,
} from "./extractColors.ts"

// Image sources (non-scrambled versions)
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
const palettesPath = join(cwd, 'tests', 'recorded-palettes.json')

// Worker pool for saliency/kmeans
let localPool: Pool | null | undefined

type Palette = {
	outer: number
	inner: number
	third: number
	accent: number
	isGradient: boolean
}

type PalettesFile = Record<string, Palette[]>

/**
 * Extract only centroids from an image (lines 53-106 of extractColors)
 * This avoids running the full palette detection logic.
 */
async function extractCentroids(
	source: Uint8ClampedArray | Uint8Array | Buffer,
	meta: Meta,
	colorSpace: ColorSpace = oklabSpace,
	name: string = ""
): Promise<Map<number, number>> {
	// Setup worker pool
	let workers: boolean | Pool = false
	if (localPool === undefined) {
		try {
			const { default: Piscina } = await import("piscina")
			localPool = new Piscina({ idleTimeout: 100 })
		} catch {
			localPool = null
		}
	}
	if (localPool) {
		workers = localPool
	}

	// Lines 83-86: trim source
	const trimmed = trimSource(source, meta, 0)
	const data = trimmed[0]
	meta = trimmed[1]
	const total = data.length / meta.channels

	// Lines 88-89: saliency
	const saliencyMap = new Uint8ClampedArray(
		new SharedArrayBuffer(meta.width * meta.height * Uint8ClampedArray.BYTES_PER_ELEMENT)
	)
	await saliency(name, colorSpace, data, saliencyMap, meta.width, meta.height, meta.channels, workers)

	// Lines 90-93: count and sort colors
	const colorCount = countColors(data, meta, colorSpace, saliencyMap, 5)
	const sorted = sortColorMap(colorCount)
	const array = transferableMap(sorted)
	console.log(name, "Unique Colors:", array.length / 2)

	// Line 94: k-means clustering
	const strategy = gapStatisticKmeans({ maxK: 20, minK: 4 })
	const centroids = await strategy(name, colorSpace, array, total, workers)

	// Lines 95-106: clamp, group, force extremes
	clampCentroidsToOriginalColors(0.005, total, centroids, colorCount, array, colorSpace)
	groupImperceptiblyDifferentColors(centroids, colorSpace)
	forceExtremeColors(centroids, colorCount, colorSpace, Math.max(50, total * 0.001))

	// Convert to RGB hex
	const rgbCentroids = new Map<number, number>()
	for (const [color, count] of centroids) {
		rgbCentroids.set(colorSpace.toRgb(color), count)
	}

	return rgbCentroids
}

function loadPalettes(): PalettesFile {
	try {
		const content = fs.readFileSync(palettesPath, 'utf-8')
		return JSON.parse(content)
	} catch {
		return {}
	}
}

function savePalettes(palettes: PalettesFile): void {
	fs.writeFileSync(palettesPath, JSON.stringify(palettes, null, '\t'))
}

function arePalettesEqual(a: Palette, b: Palette): boolean {
	return a.outer === b.outer &&
		a.inner === b.inner &&
		a.third === b.third &&
		a.accent === b.accent &&
		a.isGradient === b.isGradient
}

function getRecorderHTML(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Palette Test Recorder</title>
	<style>
		* { box-sizing: border-box; }
		body {
			background: #0d1117;
			color: #f0f6fc;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			margin: 0;
			padding: 20px;
		}
		h1 { text-align: center; margin-bottom: 10px; }
		.subtitle { text-align: center; opacity: 0.7; font-size: 14px; margin-bottom: 20px; }
		.container {
			display: flex;
			gap: 30px;
			max-width: 1600px;
			margin: 0 auto;
			flex-wrap: wrap;
		}
		.panel {
			background: #161b22;
			border: 1px solid #30363d;
			border-radius: 8px;
			padding: 20px;
		}
		.panel h2 { margin-top: 0; font-size: 16px; opacity: 0.8; }
		
		/* Image + Preview side by side */
		.image-preview-row {
			display: flex;
			gap: 0;
		}
		.image-preview-row .panel {
			border-radius: 0;
			padding: 0;
		}
		.image-preview-row .panel:first-child { border-radius: 8px 0 0 8px; }
		.image-preview-row .panel:last-child { border-radius: 0 8px 8px 0; border-left: none; }
		
		/* Image panel */
		.image-panel { flex: 0 0 auto; }
		.image-panel img { width: 400px; height: 400px; object-fit: cover; display: block; }
		.image-name { text-align: center; padding: 8px; font-size: 14px; opacity: 0.7; background: #161b22; }
		
		/* Preview panel */
		.preview-panel { flex: 0 0 auto; display: flex; flex-direction: column; }
		.preview-box {
			width: 400px;
			height: 400px;
			display: flex;
			flex-direction: column;
			justify-content: center;
			align-items: center;
			transition: background 0.2s;
		}
		.preview-box .main-text { font-size: 48px; font-weight: bold; margin: 0; }
		.preview-box .accent-text { font-size: 28px; margin: 12px 0 0 0; }
		.preview-box .third-block {
			margin-top: 20px;
			padding: 12px 24px;
			border-radius: 4px;
		}
		.preview-box .third-inner-text { font-size: 16px; margin: 0; }
		.preview-box .third-accent-text { font-size: 16px; margin: 4px 0 0 0; }
		
		/* Controls panel */
		.controls-panel { flex: 0 0 800px; }
		.control-row {
			display: flex;
			align-items: center;
			gap: 10px;
			margin-bottom: 12px;
		}
		.control-row label {
			width: 70px;
			font-size: 14px;
			opacity: 0.8;
		}
		.color-select {
			flex: 1;
			display: flex;
			gap: 4px;
			flex-wrap: wrap;
		}
		.color-option {
			width: 28px;
			height: 28px;
			border-radius: 4px;
			cursor: pointer;
			border: 2px solid transparent;
			transition: border-color 0.15s, transform 0.1s;
		}
		.color-option:hover { transform: scale(1.1); }
		.color-option.selected { border-color: #fff; }
		.color-option.artificial {
			border: 2px dashed #666;
			position: relative;
		}
		.color-option.artificial::after {
			content: '';
			position: absolute;
			top: 50%;
			left: 50%;
			width: 4px;
			height: 4px;
			background: #666;
			border-radius: 50%;
			transform: translate(-50%, -50%);
		}
		.color-option.artificial.selected { border-color: #fff; border-style: dashed; }
		.color-swatch {
			width: 28px;
			height: 28px;
			border-radius: 4px;
			border: 1px solid #30363d;
		}
		
		.checkbox-row {
			display: flex;
			align-items: center;
			gap: 8px;
			margin: 16px 0;
		}
		.checkbox-row input { width: 18px; height: 18px; }
		
		/* Contrast display */
		.contrast-display {
			background: #21262d;
			border-radius: 6px;
			padding: 12px;
			margin: 16px 0;
			font-size: 13px;
		}
		.contrast-display h3 { margin: 0 0 8px 0; font-size: 12px; opacity: 0.7; text-transform: uppercase; }
		.contrast-row {
			display: flex;
			justify-content: space-between;
			padding: 4px 0;
			border-bottom: 1px solid #30363d;
		}
		.contrast-row:last-child { border-bottom: none; }
		.contrast-label { opacity: 0.8; }
		.contrast-value { font-weight: bold; font-family: monospace; }
		.contrast-value.good { color: #3fb950; }
		.contrast-value.warning { color: #d29922; }
		.contrast-value.bad { color: #f85149; }
		
		/* Color names display */
		.color-names {
			background: #21262d;
			border-radius: 6px;
			padding: 12px;
			margin: 16px 0;
			font-size: 13px;
		}
		.color-names h3 { margin: 0 0 8px 0; font-size: 12px; opacity: 0.7; text-transform: uppercase; }
		.color-name-row {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 4px 0;
			border-bottom: 1px solid #30363d;
		}
		.color-name-row:last-child { border-bottom: none; }
		.color-name-role { opacity: 0.8; width: 60px; }
		.color-name-detail { font-family: monospace; font-size: 12px; }
		.color-name-simple { font-weight: bold; color: #58a6ff; }
		.color-name-full { opacity: 0.6; margin-left: 8px; }
		
		.btn {
			padding: 10px 20px;
			border: none;
			border-radius: 6px;
			font-size: 14px;
			cursor: pointer;
			transition: opacity 0.15s;
		}
		.btn:hover { opacity: 0.85; }
		.btn-primary { background: #238636; color: white; }
		.btn-secondary { background: #30363d; color: #f0f6fc; }
		.btn-row { display: flex; gap: 10px; margin-top: 16px; }
		
		
		/* Recorded palettes */
		.recorded-panel { flex: 1; min-width: 400px; }
		.recorded-list { display: flex; flex-wrap: wrap; gap: 12px; }
		.recorded-palette {
			display: flex;
			flex-direction: column;
			gap: 4px;
			padding: 8px;
			background: #21262d;
			border-radius: 6px;
			font-size: 11px;
		}
		.recorded-palette .mini-preview {
			width: 150px;
			height: 120px;
			border-radius: 4px;
			display: flex;
			flex-direction: column;
			justify-content: center;
			align-items: center;
			cursor: pointer;
			transition: transform 0.1s, box-shadow 0.1s;
		}
		.recorded-palette .mini-preview:hover {
			transform: scale(1.02);
			box-shadow: 0 0 0 2px #58a6ff;
		}
		.recorded-palette .mini-preview .mini-main { font-size: 18px; font-weight: bold; margin: 0; }
		.recorded-palette .mini-preview .mini-accent { font-size: 12px; margin: 4px 0 0 0; }
		.recorded-palette .mini-preview .mini-third {
			margin-top: 8px;
			padding: 4px 8px;
			border-radius: 3px;
		}
		.recorded-palette .mini-preview .mini-third-inner { font-size: 9px; margin: 0; }
		.recorded-palette .mini-preview .mini-third-accent { font-size: 9px; margin: 2px 0 0 0; }
		.recorded-palette .delete-btn {
			background: #da3633;
			color: white;
			border: none;
			border-radius: 3px;
			padding: 4px 8px;
			font-size: 10px;
			cursor: pointer;
		}
		
		.loading { opacity: 0.5; pointer-events: none; }
		.status { margin-top: 10px; font-size: 12px; opacity: 0.7; }
	</style>
</head>
<body>
	<h1>Palette Test Recorder</h1>
	<p class="subtitle">Select 4 colors to compose a valid palette for unit tests</p>
	
	<div class="container">
		<div class="image-preview-row">
			<div class="panel image-panel">
				<img id="currentImage" src="" alt="Current image" />
				<div class="image-name" id="imageName">Loading...</div>
			</div>
			
			<div class="panel preview-panel">
				<div class="preview-box" id="previewBox">
					<p class="main-text" id="previewMain">Hello</p>
					<p class="accent-text" id="previewAccent">World</p>
					<div class="third-block" id="previewThird">
						<p class="third-inner-text" id="previewThirdInner">Inner text</p>
						<p class="third-accent-text" id="previewThirdAccent">Accent text</p>
					</div>
				</div>
			</div>
		</div>
		
		<div class="panel controls-panel">
			<h2>Controls</h2>
			<div class="control-row">
				<label>Outer:</label>
				<div class="color-swatch" id="outerSwatch"></div>
				<div class="color-select" id="outerSelect"></div>
			</div>
			<div class="control-row">
				<label>Inner:</label>
				<div class="color-swatch" id="innerSwatch"></div>
				<div class="color-select" id="innerSelect"></div>
			</div>
			<div class="control-row">
				<label>Third:</label>
				<div class="color-swatch" id="thirdSwatch"></div>
				<div class="color-select" id="thirdSelect"></div>
			</div>
			<div class="control-row">
				<label>Accent:</label>
				<div class="color-swatch" id="accentSwatch"></div>
				<div class="color-select" id="accentSelect"></div>
			</div>
			
			<div class="checkbox-row">
				<input type="checkbox" id="isGradient" />
				<label for="isGradient">Is Gradient (outer → third)</label>
			</div>
			
			<div class="contrast-display">
				<h3>Contrast Ratios</h3>
				<div class="contrast-row">
					<span class="contrast-label">Inner on Outer:</span>
					<span class="contrast-value" id="contrastInnerOuter">—</span>
				</div>
				<div class="contrast-row">
					<span class="contrast-label">Inner on Third:</span>
					<span class="contrast-value" id="contrastInnerThird">—</span>
				</div>
				<div class="contrast-row">
					<span class="contrast-label">Accent on Outer:</span>
					<span class="contrast-value" id="contrastAccentOuter">—</span>
				</div>
				<div class="contrast-row">
					<span class="contrast-label">Accent on Third:</span>
					<span class="contrast-value" id="contrastAccentThird">—</span>
				</div>
			</div>
			
			<div class="color-names">
				<h3>Color Names</h3>
				<div class="color-name-row">
					<span class="color-name-role">Outer:</span>
					<span class="color-name-detail"><span class="color-name-simple" id="outerSimple">—</span><span class="color-name-full" id="outerFull"></span></span>
				</div>
				<div class="color-name-row">
					<span class="color-name-role">Inner:</span>
					<span class="color-name-detail"><span class="color-name-simple" id="innerSimple">—</span><span class="color-name-full" id="innerFull"></span></span>
				</div>
				<div class="color-name-row">
					<span class="color-name-role">Third:</span>
					<span class="color-name-detail"><span class="color-name-simple" id="thirdSimple">—</span><span class="color-name-full" id="thirdFull"></span></span>
				</div>
				<div class="color-name-row">
					<span class="color-name-role">Accent:</span>
					<span class="color-name-detail"><span class="color-name-simple" id="accentSimple">—</span><span class="color-name-full" id="accentFull"></span></span>
				</div>
			</div>
			
			<div class="btn-row">
				<button class="btn btn-primary" id="recordBtn">Record Palette</button>
				<button class="btn btn-secondary" id="nextBtn">Next Image →</button>
			</div>
			<div class="status" id="status"></div>
		</div>
		
		<div class="panel recorded-panel">
			<h2>Recorded Palettes for this Image</h2>
			<div class="recorded-list" id="recordedList">
				<div style="opacity:0.5">None yet</div>
			</div>
		</div>
	</div>
	
	<script>
		const sources = ${JSON.stringify(sources)};
		let currentIndex = 0;
		let centroids = [];
		let palette = { outer: null, inner: null, third: null, accent: null, isGradient: false };
		
		const toHex = (c) => '#' + c.toString(16).padStart(6, '0');
		
		// APCA contrast calculation (from spaces/apca-contrast.ts)
		const SA98G = {
			mainTRC: 2.4,
			sRco: 0.2126729, sGco: 0.7151522, sBco: 0.0721750,
			normBG: 0.56, normTXT: 0.57, revTXT: 0.62, revBG: 0.65,
			blkThrs: 0.022, blkClmp: 1.414,
			scaleBoW: 1.14, scaleWoB: 1.14,
			loBoWoffset: 0.027, loWoBoffset: 0.027,
			deltaYmin: 0.0005, loClip: 0.1,
		};
		
		function simpleExp(chan) { return Math.pow(chan, SA98G.mainTRC); }
		function fclamp(Y) {
			return Y > SA98G.blkThrs ? Y : Y + Math.pow(SA98G.blkThrs - Y, SA98G.blkClmp);
		}
		
		// APCA contrast: bg is background, fg is foreground (text)
		// Returns Lc value (0-100+ scale, higher is better contrast)
		function contrastAPCA(bgHex, fgHex) {
			if (bgHex === null || fgHex === null) return null;
			
			// Extract RGB [0-1]
			const r1 = ((bgHex >> 16) & 0xff) / 255;
			const g1 = ((bgHex >> 8) & 0xff) / 255;
			const b1 = (bgHex & 0xff) / 255;
			const r2 = ((fgHex >> 16) & 0xff) / 255;
			const g2 = ((fgHex >> 8) & 0xff) / 255;
			const b2 = (fgHex & 0xff) / 255;
			
			const lumBg = SA98G.sRco * simpleExp(r1) + SA98G.sGco * simpleExp(g1) + SA98G.sBco * simpleExp(b1);
			const lumTxt = SA98G.sRco * simpleExp(r2) + SA98G.sGco * simpleExp(g2) + SA98G.sBco * simpleExp(b2);
			
			let txtY = fclamp(lumTxt);
			let bgY = fclamp(lumBg);
			
			if (Math.abs(bgY - txtY) < SA98G.deltaYmin) return 0;
			
			let SAPC, outputContrast;
			if (bgY > txtY) {
				SAPC = (Math.pow(bgY, SA98G.normBG) - Math.pow(txtY, SA98G.normTXT)) * SA98G.scaleBoW;
				outputContrast = SAPC < SA98G.loClip ? 0 : SAPC - SA98G.loBoWoffset;
			} else {
				SAPC = (Math.pow(bgY, SA98G.revBG) - Math.pow(txtY, SA98G.revTXT)) * SA98G.scaleWoB;
				outputContrast = SAPC > -SA98G.loClip ? 0 : SAPC + SA98G.loWoBoffset;
			}
			
			outputContrast *= 100;
			return outputContrast < 0 ? -outputContrast / 1.06 : outputContrast / 1.04;
		}
		
		function updateContrastDisplay() {
			const pairs = [
				['contrastInnerOuter', palette.outer, palette.inner],
				['contrastInnerThird', palette.third, palette.inner],
				['contrastAccentOuter', palette.outer, palette.accent],
				['contrastAccentThird', palette.third, palette.accent],
			];
			
			for (const [id, bg, fg] of pairs) {
				const el = document.getElementById(id);
				const lc = contrastAPCA(bg, fg);
				if (lc === null) {
					el.textContent = '—';
					el.className = 'contrast-value';
				} else {
					el.textContent = 'Lc ' + Math.round(lc);
					// APCA: 60+ is good for body text, 45+ for large text, 30+ minimum
					el.className = 'contrast-value ' + (lc >= 60 ? 'good' : lc >= 45 ? 'warning' : 'bad');
				}
			}
		}
		
		// Color names (simplified from tests/color-name.ts and tests/short-names.ts)
		const shortNames = {
			"black": [0, 0, 0], "white": [1, 1, 1], "red": [1, 0, 0], "green": [0, 0.5, 0],
			"blue": [0, 0, 1], "yellow": [1, 1, 0], "cyan": [0, 1, 1], "magenta": [1, 0, 1],
			"gray": [0.5, 0.5, 0.5], "silver": [0.75, 0.75, 0.75], "maroon": [0.5, 0, 0],
			"olive": [0.5, 0.5, 0], "lime": [0, 1, 0], "aqua": [0, 1, 1], "teal": [0, 0.5, 0.5],
			"navy": [0, 0, 0.5], "fuchsia": [1, 0, 1], "purple": [0.5, 0, 0.5],
			"orange": [1, 0.65, 0], "pink": [1, 0.75, 0.8], "brown": [0.65, 0.16, 0.16],
			"beige": [0.96, 0.96, 0.86], "salmon": [0.98, 0.5, 0.45], "coral": [1, 0.5, 0.31],
			"gold": [1, 0.84, 0], "khaki": [0.94, 0.9, 0.55], "plum": [0.87, 0.63, 0.87],
			"violet": [0.93, 0.51, 0.93], "indigo": [0.29, 0, 0.51], "crimson": [0.86, 0.08, 0.24],
			"tomato": [1, 0.39, 0.28], "chocolate": [0.82, 0.41, 0.12], "tan": [0.82, 0.71, 0.55],
			"sienna": [0.63, 0.32, 0.18], "peru": [0.8, 0.52, 0.25], "saddlebrown": [0.55, 0.27, 0.07],
			"darkgray": [0.66, 0.66, 0.66], "dimgray": [0.41, 0.41, 0.41],
			"lightgray": [0.83, 0.83, 0.83], "slategray": [0.44, 0.5, 0.56],
			"darkblue": [0, 0, 0.55], "darkgreen": [0, 0.39, 0], "darkred": [0.55, 0, 0],
			"darkorange": [1, 0.55, 0], "deeppink": [1, 0.08, 0.58], "hotpink": [1, 0.41, 0.71],
			"lightblue": [0.68, 0.85, 0.9], "lightgreen": [0.56, 0.93, 0.56],
			"lightpink": [1, 0.71, 0.76], "lightyellow": [1, 1, 0.88],
			"skyblue": [0.53, 0.81, 0.92], "steelblue": [0.27, 0.51, 0.71],
			"royalblue": [0.25, 0.41, 0.88], "midnightblue": [0.1, 0.1, 0.44],
		};
		
		const simplestNames = {
			"red": [1, 0, 0], "green": [0, 0.5, 0], "blue": [0, 0, 1], "yellow": [1, 1, 0],
			"orange": [1, 0.65, 0], "purple": [0.5, 0, 0.5], "pink": [1, 0.75, 0.8],
			"saddlebrown": [0.55, 0.27, 0.07], "black": [0, 0, 0], "white": [1, 1, 1],
			"gray": [0.5, 0.5, 0.5], "cyan": [0, 1, 1], "magenta": [1, 0, 1], "lime": [0, 1, 0],
			"beige": [0.96, 0.96, 0.86], "salmon": [0.98, 0.5, 0.45],
		};
		
		function colorDistance(hex, ref) {
			const r1 = ((hex >> 16) & 0xff) / 255;
			const g1 = ((hex >> 8) & 0xff) / 255;
			const b1 = (hex & 0xff) / 255;
			return Math.sqrt((r1 - ref[0]) ** 2 + (g1 - ref[1]) ** 2 + (b1 - ref[2]) ** 2);
		}
		
		function nameColor(hex) {
			if (hex === null) return null;
			let minDist = Infinity, name = '';
			for (const [n, rgb] of Object.entries(shortNames)) {
				const d = colorDistance(hex, rgb);
				if (d < minDist) { minDist = d; name = n; }
			}
			return name;
		}
		
		function simpleColor(hex) {
			if (hex === null) return null;
			let minDist = Infinity, name = '';
			for (const [n, rgb] of Object.entries(simplestNames)) {
				const d = colorDistance(hex, rgb);
				if (d < minDist) { minDist = d; name = n; }
			}
			return name;
		}
		
		function updateColorNames() {
			['outer', 'inner', 'third', 'accent'].forEach(role => {
				const color = palette[role];
				const simpleEl = document.getElementById(role + 'Simple');
				const fullEl = document.getElementById(role + 'Full');
				if (color === null) {
					simpleEl.textContent = '—';
					fullEl.textContent = '';
				} else {
					const simple = simpleColor(color);
					const full = nameColor(color);
					simpleEl.textContent = simple;
					fullEl.textContent = simple !== full ? \`(\${full})\` : '';
				}
			});
		}
		
		function updatePreview() {
			const box = document.getElementById('previewBox');
			const main = document.getElementById('previewMain');
			const accent = document.getElementById('previewAccent');
			const thirdBlock = document.getElementById('previewThird');
			const thirdInner = document.getElementById('previewThirdInner');
			const thirdAccent = document.getElementById('previewThirdAccent');
			
			const outerColor = palette.outer !== null ? toHex(palette.outer) : '#333';
			const innerColor = palette.inner !== null ? toHex(palette.inner) : '#fff';
			const thirdColor = palette.third !== null ? toHex(palette.third) : outerColor;
			const accentColor = palette.accent !== null ? toHex(palette.accent) : innerColor;
			
			if (palette.isGradient && palette.outer !== null && palette.third !== null) {
				box.style.background = \`linear-gradient(in oklab 135deg, \${outerColor}, \${thirdColor})\`;
				thirdBlock.style.background = 'transparent';
			} else {
				box.style.background = outerColor;
				thirdBlock.style.background = thirdColor;
			}
			
			main.style.color = innerColor;
			accent.style.color = accentColor;
			thirdInner.style.color = innerColor;
			thirdAccent.style.color = accentColor;
			
			// Update swatches
			document.getElementById('outerSwatch').style.background = outerColor;
			document.getElementById('innerSwatch').style.background = innerColor;
			document.getElementById('thirdSwatch').style.background = thirdColor;
			document.getElementById('accentSwatch').style.background = accentColor;
			
			// Update selection highlights
			updateSelectionHighlights();
			
			// Update contrast display
			updateContrastDisplay();
			
			// Update color names
			updateColorNames();
		}
		
		function updateSelectionHighlights() {
			document.querySelectorAll('.color-option').forEach(el => {
				el.classList.remove('selected');
			});
			['outer', 'inner', 'third', 'accent'].forEach(role => {
				if (palette[role] !== null) {
					const selector = \`[data-role="\${role}"][data-color="\${palette[role]}"]\`;
					document.querySelectorAll(selector).forEach(el => el.classList.add('selected'));
				}
			});
			
			// Mark centroids that are used
			document.querySelectorAll('.centroid-swatch').forEach(el => {
				const color = parseInt(el.dataset.color);
				const used = Object.values(palette).includes(color);
				el.classList.toggle('used', used);
			});
		}
		
		function renderColorSelectors() {
			const PURE_WHITE = 0xffffff;
			const PURE_BLACK = 0x000000;
			
			['outer', 'inner', 'third', 'accent'].forEach(role => {
				const container = document.getElementById(role + 'Select');
				container.innerHTML = '';
				
				// Add pure white and black first (artificial)
				[PURE_WHITE, PURE_BLACK].forEach(color => {
					const btn = document.createElement('div');
					btn.className = 'color-option artificial';
					btn.style.background = toHex(color);
					btn.dataset.role = role;
					btn.dataset.color = color;
					btn.title = (color === PURE_WHITE ? 'Pure White' : 'Pure Black') + ' (artificial)';
					btn.onclick = () => {
						palette[role] = color;
						updatePreview();
					};
					container.appendChild(btn);
				});
				
				// Add centroid colors
				centroids.forEach(([color, count]) => {
					const btn = document.createElement('div');
					btn.className = 'color-option';
					btn.style.background = toHex(color);
					btn.dataset.role = role;
					btn.dataset.color = color;
					btn.title = toHex(color);
					btn.onclick = () => {
						palette[role] = color;
						updatePreview();
					};
					container.appendChild(btn);
				});
			});
		}
		
		
		async function loadRecordedPalettes() {
			const imagePath = sources[currentIndex];
			const imageName = imagePath.split('/').pop();
			const res = await fetch('/palettes/' + encodeURIComponent(imageName));
			const data = await res.json();
			renderRecordedPalettes(data.palettes || []);
		}
		
		function renderRecordedPalettes(palettes) {
			const list = document.getElementById('recordedList');
			if (palettes.length === 0) {
				list.innerHTML = '<div style="opacity:0.5">None yet</div>';
				return;
			}
			
			list.innerHTML = '';
			palettes.forEach((p, idx) => {
				const div = document.createElement('div');
				div.className = 'recorded-palette';
				
				const outerColor = toHex(p.outer);
				const innerColor = toHex(p.inner);
				const thirdColor = toHex(p.third);
				const accentColor = toHex(p.accent);
				
				// Create mini preview
				const preview = document.createElement('div');
				preview.className = 'mini-preview';
				if (p.isGradient) {
					preview.style.background = \`linear-gradient(in oklab 135deg, \${outerColor}, \${thirdColor})\`;
				} else {
					preview.style.background = outerColor;
				}
				
				const mainText = document.createElement('p');
				mainText.className = 'mini-main';
				mainText.style.color = innerColor;
				mainText.textContent = 'Hello';
				
				const accentText = document.createElement('p');
				accentText.className = 'mini-accent';
				accentText.style.color = accentColor;
				accentText.textContent = 'World';
				
				const thirdBlock = document.createElement('div');
				thirdBlock.className = 'mini-third';
				thirdBlock.style.background = p.isGradient ? 'transparent' : thirdColor;
				
				const thirdInner = document.createElement('p');
				thirdInner.className = 'mini-third-inner';
				thirdInner.style.color = innerColor;
				thirdInner.textContent = 'Inner';
				
				const thirdAccent = document.createElement('p');
				thirdAccent.className = 'mini-third-accent';
				thirdAccent.style.color = accentColor;
				thirdAccent.textContent = 'Accent';
				
				thirdBlock.appendChild(thirdInner);
				thirdBlock.appendChild(thirdAccent);
				preview.appendChild(mainText);
				preview.appendChild(accentText);
				preview.appendChild(thirdBlock);
				
				// Click to load this palette into controls
				preview.style.cursor = 'pointer';
				preview.title = 'Click to load this palette';
				preview.onclick = () => {
					palette.outer = p.outer;
					palette.inner = p.inner;
					palette.third = p.third;
					palette.accent = p.accent;
					palette.isGradient = p.isGradient;
					document.getElementById('isGradient').checked = p.isGradient;
					updatePreview();
				};
				
				const deleteBtn = document.createElement('button');
				deleteBtn.className = 'delete-btn';
				deleteBtn.textContent = 'Delete';
				deleteBtn.onclick = async () => {
					await deletePalette(idx);
				};
				
				div.appendChild(preview);
				div.appendChild(deleteBtn);
				list.appendChild(div);
			});
		}
		
		async function deletePalette(index) {
			const imagePath = sources[currentIndex];
			const imageName = imagePath.split('/').pop();
			await fetch('/palettes/' + encodeURIComponent(imageName) + '/' + index, { method: 'DELETE' });
			await loadRecordedPalettes();
		}
		
		async function loadImage() {
			document.body.classList.add('loading');
			
			const imagePath = sources[currentIndex];
			const imageName = imagePath.split('/').pop();
			
			// Update URL with current image
			const url = new URL(window.location);
			url.searchParams.set('image', imageName);
			window.history.replaceState({}, '', url);
			
			document.getElementById('currentImage').src = '/image/' + imagePath;
			document.getElementById('imageName').textContent = imageName;
			
			// Reset palette
			palette = { outer: null, inner: null, third: null, accent: null, isGradient: false };
			document.getElementById('isGradient').checked = false;
			
			// Load centroids
			try {
				const res = await fetch('/centroids/' + imagePath);
				const data = await res.json();
				centroids = data.centroids;
				renderColorSelectors();
				updatePreview();
			} catch (err) {
				console.error('Failed to load centroids:', err);
			}
			
			await loadRecordedPalettes();
			document.body.classList.remove('loading');
			document.getElementById('status').textContent = '';
		}
		
		async function recordPalette() {
			if (palette.outer === null || palette.inner === null || palette.third === null || palette.accent === null) {
				document.getElementById('status').textContent = 'Please select all 4 colors';
				return;
			}
			
			// Force isGradient to false if outer and third are the same color
			const paletteToSave = { ...palette };
			if (paletteToSave.outer === paletteToSave.third) {
				paletteToSave.isGradient = false;
			}
			
			const imagePath = sources[currentIndex];
			const imageName = imagePath.split('/').pop();
			
			const res = await fetch('/palettes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					image: imageName,
					palette: paletteToSave
				})
			});
			
			const data = await res.json();
			if (data.success) {
				document.getElementById('status').textContent = data.duplicate ? 'Palette already exists' : 'Palette recorded!';
				await loadRecordedPalettes();
			} else {
				document.getElementById('status').textContent = 'Error: ' + data.error;
			}
		}
		
		function nextImage() {
			currentIndex = (currentIndex + 1) % sources.length;
			loadImage();
		}
		
		// Event listeners
		document.getElementById('isGradient').addEventListener('change', (e) => {
			palette.isGradient = e.target.checked;
			updatePreview();
		});
		
		document.getElementById('recordBtn').addEventListener('click', recordPalette);
		document.getElementById('nextBtn').addEventListener('click', nextImage);
		
		// Keyboard shortcuts
		document.addEventListener('keydown', (e) => {
			if (e.key === 'ArrowRight' || e.key === 'n') nextImage();
			if (e.key === 'Enter' || e.key === 's') recordPalette();
			if (e.key === 'g') {
				document.getElementById('isGradient').checked = !document.getElementById('isGradient').checked;
				palette.isGradient = document.getElementById('isGradient').checked;
				updatePreview();
			}
		});
		
		// Read image from URL param on initial load
		const urlParams = new URLSearchParams(window.location.search);
		const imageParam = urlParams.get('image');
		if (imageParam) {
			const idx = sources.findIndex(s => s.endsWith('/' + imageParam) || s.endsWith(imageParam));
			if (idx !== -1) currentIndex = idx;
		}
		
		// Initial load
		loadImage();
	</script>
</body>
</html>`
}

// HTTP Server
const server = http.createServer(async (req, res) => {
	if (!req.url) {
		res.writeHead(404, { 'Content-Type': 'text/plain' })
		res.end('Not Found')
		return
	}

	const url = new URL(req.url, `http://${req.headers.host}`)

	// Root path - serve recorder HTML
	if (url.pathname === '/') {
		res.writeHead(200, { 'Content-Type': 'text/html' })
		res.end(getRecorderHTML())
		return
	}

	// Serve image
	if (url.pathname.startsWith('/image/')) {
		const imagePath = url.pathname.slice('/image/'.length)
		const fullPath = join(cwd, imagePath)

		try {
			const stream = fs.createReadStream(fullPath)
			stream.on('open', () => {
				const ext = imagePath.split('.').pop()?.toLowerCase()
				const contentType = ext === 'avif' ? 'image/avif' :
					ext === 'png' ? 'image/png' : 'image/jpeg'
				res.setHeader('Content-Type', contentType)
				stream.pipe(res)
			})
			stream.on('error', () => {
				res.writeHead(404, { 'Content-Type': 'text/plain' })
				res.end('Image not found')
			})
		} catch {
			res.writeHead(404, { 'Content-Type': 'text/plain' })
			res.end('Image not found')
		}
		return
	}

	// Extract centroids
	if (url.pathname.startsWith('/centroids/')) {
		const imagePath = url.pathname.slice('/centroids/'.length)
		const fullPath = join(cwd, imagePath)

		try {
			const { data, info } = await sharp(fullPath)
				.raw({ depth: "uchar" })
				.toBuffer({ resolveWithObject: true })

			const centroids = await extractCentroids(data, info, oklabSpace, imagePath)
			const sorted = sortColorMap(centroids)

			res.writeHead(200, { 'Content-Type': 'application/json' })
			res.end(JSON.stringify({ centroids: sorted }))
		} catch (err) {
			console.error('Error extracting centroids:', err)
			res.writeHead(500, { 'Content-Type': 'application/json' })
			res.end(JSON.stringify({ error: String(err) }))
		}
		return
	}

	// Get palettes for an image
	if (url.pathname.startsWith('/palettes/') && req.method === 'GET') {
		const imageName = decodeURIComponent(url.pathname.slice('/palettes/'.length))
		const palettes = loadPalettes()

		res.writeHead(200, { 'Content-Type': 'application/json' })
		res.end(JSON.stringify({ palettes: palettes[imageName] || [] }))
		return
	}

	// Delete a palette
	if (url.pathname.match(/^\/palettes\/[^/]+\/\d+$/) && req.method === 'DELETE') {
		const parts = url.pathname.split('/')
		const index = parseInt(parts.pop()!, 10)
		const imageName = decodeURIComponent(parts.pop()!)

		const palettes = loadPalettes()
		if (palettes[imageName] && palettes[imageName][index]) {
			palettes[imageName].splice(index, 1)
			if (palettes[imageName].length === 0) {
				delete palettes[imageName]
			}
			savePalettes(palettes)
		}

		res.writeHead(200, { 'Content-Type': 'application/json' })
		res.end(JSON.stringify({ success: true }))
		return
	}

	// Save a palette
	if (url.pathname === '/palettes' && req.method === 'POST') {
		let body = ''
		req.on('data', chunk => { body += chunk })
		req.on('end', () => {
			try {
				const { image, palette } = JSON.parse(body) as { image: string, palette: Palette }

				if (!image || !palette ||
					palette.outer === null || palette.inner === null ||
					palette.third === null || palette.accent === null) {
					res.writeHead(400, { 'Content-Type': 'application/json' })
					res.end(JSON.stringify({ success: false, error: 'Invalid palette data' }))
					return
				}

				const palettes = loadPalettes()
				if (!palettes[image]) {
					palettes[image] = []
				}

				// Check for duplicates
				const isDuplicate = palettes[image].some(p => arePalettesEqual(p, palette))

				if (!isDuplicate) {
					palettes[image].push(palette)
					savePalettes(palettes)
				}

				res.writeHead(200, { 'Content-Type': 'application/json' })
				res.end(JSON.stringify({ success: true, duplicate: isDuplicate }))
			} catch (err) {
				res.writeHead(400, { 'Content-Type': 'application/json' })
				res.end(JSON.stringify({ success: false, error: String(err) }))
			}
		})
		return
	}

	res.writeHead(404, { 'Content-Type': 'text/plain' })
	res.end('Not Found')
})

const { values } = parseArgs({
	options: {
		port: { type: 'string', short: 'p', default: '3001' },
	},
	strict: true,
})

server.listen(values.port, () => {
	console.log(`Palette Recorder running at`, styleText('magentaBright', `http://localhost:${values.port}/`))
})
