import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { chroma, contrastRatio, okDistance, rgbToHex, rgbToOKLab } from "../src/color.ts"
import type { Candidate } from "../src/candidates.ts"
import { ALGORITHM_VERSION, extractPalette } from "../src/extract.ts"
import { minimumAccentBackgroundContrast, solvePalette } from "../src/palette.ts"
import type { RegionAnalysis } from "../src/regions.ts"
import type { CorpusResult, Palette, RawImage, RGB } from "../src/types.ts"

const artifactDirectory = process.env.RESEARCH_ARTIFACT_DIR
const projectRoot = fileURLToPath(new URL("../../", import.meta.url))

function artifactPath(file: string): string | URL {
	return artifactDirectory
		? resolve(projectRoot, artifactDirectory, file)
		: new URL(`../data/${file}`, import.meta.url)
}

function assertCandidateArtifactVersion(corpus: CorpusResult): void {
	if (!artifactDirectory) return
	assert.equal(corpus.algorithmVersion, ALGORITHM_VERSION)
	for (const entry of corpus.entries) assert.equal(entry.extraction.version, ALGORITHM_VERSION)
}

function solid(width: number, height: number, rgb: RGB): RawImage {
	const data = new Uint8Array(width * height * 3)
	for (let offset = 0; offset < data.length; offset += 3) data.set(rgb, offset)
	return { width, height, data }
}

function candidate(
	id: number,
	rgb: RGB,
	population: number,
	background: number,
	saliency: number,
	text: number,
): Candidate {
	const lab = rgbToOKLab(rgb)
	return {
		id,
		rgb,
		lab,
		hex: rgbToHex(rgb),
		population,
		background,
		saliency,
		text,
		chroma: chroma(lab),
		generated: false,
		typographyOnly: false,
		regionIds: [],
	}
}

function singlePixelAnalysis(rgb: RGB): RegionAnalysis {
	const lab = rgbToOKLab(rgb)
	return {
		regions: [{
			id: 0,
			area: 1,
			population: 1,
			centerX: 0,
			centerY: 0,
			lab,
			rgb,
			borderPixels: 1,
			sideCount: 4,
			edge: 0,
			variance: 0,
			distinctiveness: 0,
			localContrast: 0,
			background: 1,
			saliency: 0,
			text: 0,
			chroma: chroma(lab),
			neighbors: [],
		}],
		labels: new Int32Array([0]),
		labs: new Float32Array(lab),
		edges: new Float32Array(1),
		data: new Uint8Array(rgb),
		width: 1,
		height: 1,
	}
}

function analysisWithRegionColors(pixel: RGB, regionColors: RGB[]): RegionAnalysis {
	const analysis = singlePixelAnalysis(pixel)
	return {
		...analysis,
		regions: regionColors.map((rgb, id) => ({
			...analysis.regions[0],
			id,
			rgb,
			lab: rgbToOKLab(rgb),
		})),
	}
}

function assertValidPalette(palette: Palette, allowRelaxedContrast = true): void {
	for (const role of ["background", "foreground", "surface", "accent"] as const) {
		assert.match(palette[role].hex, /^#[0-9a-f]{6}$/)
		assert.equal(palette[role].rgb.length, 3)
		for (const channel of palette[role].rgb) assert.ok(Number.isInteger(channel) && channel >= 0 && channel <= 255)
	}
	assert.ok(palette.metrics.foregroundContrast >= (allowRelaxedContrast ? 3 : 4.5))
	assert.ok(palette.metrics.foregroundSurfaceContrast >= (allowRelaxedContrast ? 2.5 : 4.5))
	assert.ok(okDistance(rgbToOKLab(palette.accent.rgb), rgbToOKLab(palette.background.rgb)) >= 0.025)
	assert.ok(okDistance(rgbToOKLab(palette.accent.rgb), rgbToOKLab(palette.surface.rgb)) >= 0.025)
	assert.ok(Number.isFinite(palette.metrics.meanReconstructionError))
}

test("reports the 0.15 algorithm version", () => {
	assert.equal(ALGORITHM_VERSION, "region-graph-0.15.0")
})

test("spatial score buckets prefer strong typography without changing expressive selection", () => {
	const background: RGB = [35, 20, 35]
	const candidates = [
		candidate(0, background, 0.65, 1, 0, 0),
		candidate(1, [180, 235, 50], 0.1, 0, 0.55, 0.5),
		candidate(2, [60, 200, 220], 0.099, 0, 0.7, 0.49),
		candidate(3, [240, 50, 140], 0.05, 0, 0.8, 0.2),
	]
	const analysis = singlePixelAnalysis(background)

	const spatial = solvePalette(candidates, analysis, "spatial")
	const expressive = solvePalette(candidates, analysis, "expressive")

	assert.equal(spatial.foreground.hex, "#b4eb32")
	assert.equal(spatial.accent.hex, "#f0328c")
	assert.equal(expressive.foreground.hex, "#3cc8dc")
})

test("dominant interior-field evidence observes its flat surface boundaries in both modes", () => {
	const background: RGB = [60, 180, 90]
	const solve = (
		surfacePopulation: number,
		surfaceBackground = 0.05,
		surfaceRgb: RGB = [250, 250, 250],
		mode: "spatial" | "expressive" = "spatial",
	) => solvePalette([
		candidate(0, background, 0.4, 1, 0, 0),
		candidate(1, [10, 20, 15], 0.1, 0, 0.7, 0.7),
		candidate(2, surfaceRgb, surfacePopulation, surfaceBackground, 0.1, 0.1),
	], singlePixelAnalysis(background), mode)

	assert.equal(solve(0.499).surface.hex, "#3cb45a")
	const palette = solve(0.5)
	assert.equal(palette.surface.hex, "#fafafa")
	assert.equal(palette.gradient.isGradient, false)
	assert.ok(palette.metrics.foregroundSurfaceContrast >= 4.5)
	assert.equal(solve(0.5, 0.05, [250, 250, 250], "expressive").surface.hex, "#fafafa")

	const belowBackgroundLimit = solve(0.5, 0.399)
	const atBackgroundLimit = solve(0.5, 0.4)
	assert.ok(belowBackgroundLimit.score >= atBackgroundLimit.score + 0.02)

	const belowDistanceRgb: RGB = [60, 180, 150]
	const atDistanceRgb: RGB = [65, 180, 150]
	assert.ok(okDistance(rgbToOKLab(background), rgbToOKLab(belowDistanceRgb)) < 0.08)
	assert.ok(okDistance(rgbToOKLab(background), rgbToOKLab(atDistanceRgb)) >= 0.08)
	const belowDistance = solve(0.5, 0.05, belowDistanceRgb)
	const atDistance = solve(0.5, 0.05, atDistanceRgb)
	assert.equal(belowDistance.surface.hex, rgbToHex(belowDistanceRgb))
	assert.equal(atDistance.surface.hex, rgbToHex(atDistanceRgb))
	assert.ok(atDistance.score >= belowDistance.score + 0.02)
})

test("near-white accent evidence requires population or stronger text", () => {
	const background: RGB = [180, 200, 160]
	const solve = (population: number, text: number) => solvePalette([
		candidate(0, background, 0.7, 1, 0, 0),
		candidate(1, [20, 30, 40], 0.15, 0, 0.7, 0.7),
		candidate(2, [250, 250, 245], population, 0, 0.9, text),
		candidate(3, [210, 30, 40], 0.01, 0, 0.5, 0.2),
	], singlePixelAnalysis(background), "spatial")

	assert.equal(solve(0.004, 0.55).accent.hex, "#d21e28")
	assert.equal(solve(0.005, 0.55).accent.hex, "#fafaf5")
	assert.equal(solve(0.004, 0.58).accent.hex, "#fafaf5")

	const darkBackground: RGB = [40, 60, 100]
	const darkAccent = solvePalette([
		candidate(0, darkBackground, 0.7, 1, 0, 0),
		candidate(1, [245, 245, 245], 0.15, 0, 0.7, 0.7),
		candidate(2, [5, 5, 5], 0.001, 0, 0.9, 0.55),
		candidate(3, [220, 50, 50], 0.02, 0, 0.4, 0.2),
	], singlePixelAnalysis(darkBackground), "spatial")
	assert.equal(darkAccent.accent.hex, "#050505")
})

test("flat surfaces need population or direct region support", () => {
	const background: RGB = [80, 150, 190]
	const surface: RGB = [205, 225, 235]
	const solve = (surfacePopulation: number, regionColors: RGB[], surfaceBackground = 0.749) => solvePalette([
		candidate(0, background, 0.3, 1, 0, 0),
		candidate(1, [5, 10, 15], 0.1, 0, 0.7, 0.7),
		candidate(2, surface, surfacePopulation, surfaceBackground, 0.1, 0.1),
		candidate(3, [180, 20, 40], 0.05, 0, 0.6, 0.2),
	], analysisWithRegionColors(background, regionColors), "spatial")

	assert.equal(solve(0.039, [background]).surface.hex, rgbToHex(background))
	assert.equal(solve(0.04, [background]).surface.hex, rgbToHex(surface))
	assert.equal(solve(0.039, [background, surface]).surface.hex, rgbToHex(surface))
	assert.equal(solve(0.039, [background], 0.75).surface.hex, rgbToHex(surface))
})

test("vivid major identity colors outrank tiny chromatic typography in spatial palettes", () => {
	const background: RGB = [176, 253, 252]
	const surface: RGB = [231, 254, 239]
	const vivid: RGB = [232, 7, 4]
	const muted: RGB = [144, 44, 5]
	const candidates = [
		candidate(0, background, 0.15, 0.66, 0.08, 0.22),
		candidate(1, [0, 0, 0], 0.014, 0.04, 0.83, 0.4),
		candidate(2, surface, 0.105, 0.37, 0.21, 0.26),
		candidate(3, vivid, 0.039, 0.33, 0.62, 0.51),
		candidate(4, muted, 0.012, 0.22, 0.76, 0.78),
	]
	const analysis = analysisWithRegionColors(background, [background, surface, vivid])

	assert.equal(solvePalette(candidates, analysis, "spatial").accent.hex, rgbToHex(vivid))
	assert.equal(solvePalette(candidates, analysis, "expressive").accent.hex, rgbToHex(muted))
})

test("vivid identity scoring can expose a supported near-white surface", () => {
	const background: RGB = [252, 207, 0]
	const foreground: RGB = [7, 3, 2]
	const white: RGB = [252, 250, 248]
	const vivid: RGB = [250, 3, 2]
	const candidates = [
		candidate(0, background, 0.476, 0.45, 0.2, 0.33),
		candidate(1, foreground, 0.061, 0.1, 0.86, 0.57),
		candidate(2, white, 0.144, 0.28, 0.3, 0.37),
		candidate(3, vivid, 0.139, 0.18, 0.49, 0.32),
		candidate(4, [251, 225, 182], 0.034, 0.28, 0.31, 0.4),
		candidate(5, [135, 0, 4], 0.011, 0.14, 0.67, 0.6),
	]
	const palette = solvePalette(
		candidates,
		analysisWithRegionColors(background, [background, foreground, white, vivid]),
		"spatial",
	)

	assert.equal(palette.surface.hex, rgbToHex(white))
	assert.equal(palette.accent.hex, rgbToHex(vivid))
})

test("uniform images use their source color as the background", () => {
	const result = extractPalette(solid(48, 48, [254, 0, 0]))
	assert.equal(result.methods.spatial.background.hex, "#fe0000")
	assert.equal(result.methods.spatial.surface.hex, "#fe0000")
	assertValidPalette(result.methods.spatial)
})

test("the extractor is deterministic", () => {
	const image = solid(64, 64, [20, 40, 90])
	for (let y = 15; y < 49; y++) {
		for (let x = 12; x < 52; x++) {
			const offset = (y * image.width + x) * 3
			image.data.set((x + y) % 5 === 0 ? [245, 210, 30] : [180, 40, 70], offset)
		}
	}
	const first = extractPalette(image)
	const second = extractPalette(image)
	const withoutTimings = (value: typeof first) => ({ ...value, diagnostics: { ...value.diagnostics, processingMs: 0 } })
	assert.deepEqual(withoutTimings(first), withoutTimings(second))
	assertValidPalette(first.methods.spatial)
	assertValidPalette(first.methods.expressive)
})

test("source candidates are exact observed pixels", () => {
	const image = solid(48, 48, [12, 13, 14])
	for (let pixel = 0; pixel < image.width * image.height; pixel += 3) {
		image.data.set(pixel % 2 === 0 ? [17, 18, 19] : [22, 23, 24], pixel * 3)
	}
	const observed = new Set<string>()
	for (let offset = 0; offset < image.data.length; offset += 3) {
		observed.add(`${image.data[offset]},${image.data[offset + 1]},${image.data[offset + 2]}`)
	}
	const result = extractPalette(image)
	for (const candidate of result.candidates) assert.ok(observed.has(candidate.rgb.join(",")))
})

test("generated corpus excludes scrambled files and satisfies hard gates", async () => {
	const path = artifactPath("results.json")
	const corpus = JSON.parse(await readFile(path, "utf8")) as CorpusResult
	assertCandidateArtifactVersion(corpus)
	assert.equal(corpus.entries.length, 37)
	assert.ok(corpus.entries.every((entry) => !entry.file.includes("-scrambled")))
	assert.ok(corpus.entries.some((entry) => entry.kind === "diagnostic" && !entry.review))
	for (const entry of corpus.entries) {
		const palette = entry.extraction.methods.spatial
		assertValidPalette(palette)
		assertValidPalette(entry.extraction.methods.expressive)
		assert.ok(palette.metrics.accentContrast >= minimumAccentBackgroundContrast)
		assert.ok(entry.extraction.methods.expressive.metrics.accentContrast >= minimumAccentBackgroundContrast)
		assertValidPalette(entry.extraction.methods.quantized, false)
		const sourceColors = new Set(entry.extraction.candidates.map((candidate) => candidate.hex))
		assert.equal(palette.background.generated, false)
		assert.equal(palette.surface.generated, false)
		assert.ok(sourceColors.has(palette.background.hex))
		assert.ok(sourceColors.has(palette.surface.hex))
		if (palette.foreground.generated) {
			assert.ok(["#000000", "#ffffff"].includes(palette.foreground.hex))
			assert.ok(entry.extraction.candidates.every((candidate) =>
				contrastRatio(palette.background.rgb, candidate.rgb) < (
					candidate.population >= 0.1 && candidate.text >= 0.5 && candidate.saliency >= 0.55 ? 3 : 4
				),
			))
		} else {
			assert.ok(sourceColors.has(palette.foreground.hex))
		}
		if (palette.accent.generated) {
			assert.equal(palette.accent.hex, palette.foreground.hex)
			assert.ok(["#000000", "#ffffff"].includes(palette.accent.hex))
		} else {
			assert.ok(sourceColors.has(palette.accent.hex))
		}
		if (entry.file === "meteora.jpg") {
			const accentCandidate = entry.extraction.candidates.find((candidate) => candidate.hex === palette.accent.hex)
			assert.ok(accentCandidate && accentCandidate.population >= 0.15)
		}
		if (entry.file === "toxicity.jpg") {
			const accentCandidate = entry.extraction.candidates.find((candidate) => candidate.hex === palette.accent.hex)
			assert.ok(accentCandidate && accentCandidate.chroma >= 0.14 && accentCandidate.text >= 0.58)
		}
		if (entry.file === "ybbb.jpg") {
			const accentCandidate = entry.extraction.candidates.find((candidate) => candidate.hex === palette.accent.hex)
			assert.ok(accentCandidate && accentCandidate.chroma < 0.02 && accentCandidate.text >= 0.7)
		}
		if (entry.file === "birdsofprey.jpg") {
			const surfaceCandidate = entry.extraction.candidates.find((candidate) => candidate.hex === palette.surface.hex)
			assert.ok(surfaceCandidate && surfaceCandidate.background >= 0.3)
			assert.ok(contrastRatio(palette.surface.rgb, palette.accent.rgb) >= 1.5)
		}
		if (entry.file === "disney.avif") {
			assert.notEqual(palette.background.hex, palette.surface.hex)
			assert.ok(palette.metrics.foregroundSurfaceContrast >= 3)
		}
		if (entry.file === "elephunk.jpg") {
			const foregroundCandidate = entry.extraction.candidates.find((candidate) => candidate.hex === palette.foreground.hex)
			assert.ok(foregroundCandidate && foregroundCandidate.population >= 0.1 && foregroundCandidate.chroma >= 0.04)
			assert.notEqual(palette.surface.hex, "#97a495")
		}
		if (entry.file === "franz.jpg") {
			const foregroundCandidate = entry.extraction.candidates.find((candidate) => candidate.hex === palette.foreground.hex)
			const accentCandidate = entry.extraction.candidates.find((candidate) => candidate.hex === palette.accent.hex)
			assert.ok(foregroundCandidate && foregroundCandidate.population >= 0.05)
			assert.ok(accentCandidate && accentCandidate.chroma >= 0.1)
		}
		if (entry.file === "greenday.jpg") {
			assert.ok(rgbToOKLab(palette.foreground.rgb)[0] >= 0.98)
		}
		if (entry.file === "horsley.jpg") {
			assert.equal(palette.gradient.isGradient, true)
			assert.ok(okDistance(rgbToOKLab(palette.background.rgb), rgbToOKLab(palette.surface.rgb)) >= 0.12)
		}
		if (entry.file === "loups.jpg") {
			const backgroundCandidate = entry.extraction.candidates.find((candidate) => candidate.hex === palette.background.hex)
			assert.ok(backgroundCandidate && backgroundCandidate.population >= 0.05)
			assert.equal(palette.foreground.generated, false)
		}
		if (entry.file === "nobs.jpg") {
			const backgroundLab = rgbToOKLab(palette.background.rgb)
			const foregroundCandidate = entry.extraction.candidates.find((candidate) => candidate.hex === palette.foreground.hex)
			const accentCandidate = entry.extraction.candidates.find((candidate) => candidate.hex === palette.accent.hex)
			assert.ok(backgroundLab[0] >= 0.95 && Math.hypot(backgroundLab[1], backgroundLab[2]) < 0.02)
			assert.equal(palette.surface.hex, palette.background.hex)
			assert.ok(foregroundCandidate && foregroundCandidate.chroma >= 0.1)
			assert.ok(palette.metrics.foregroundContrast >= 4.5)
			assert.ok(accentCandidate && accentCandidate.chroma >= 0.15)
		}
		if (entry.file === "skap.jpg") {
			const backgroundLab = rgbToOKLab(palette.background.rgb)
			const accentCandidate = entry.extraction.candidates.find((candidate) => candidate.hex === palette.accent.hex)
			assert.ok(backgroundLab[0] >= 0.95 && Math.hypot(backgroundLab[1], backgroundLab[2]) < 0.01)
			assert.ok(accentCandidate && accentCandidate.population >= 0.04 && accentCandidate.chroma >= 0.14)
		}
	}
})

test("holdout corpus is separate, deduplicated, and satisfies hard gates", async () => {
	const path = artifactPath("holdout-results.json")
	const corpus = JSON.parse(await readFile(path, "utf8")) as CorpusResult
	assertCandidateArtifactVersion(corpus)
	assert.equal(corpus.entries.length, 355)
	assert.equal(new Set(corpus.entries.map((entry) => entry.file.slice(19))).size, corpus.entries.length)
	for (const entry of corpus.entries) {
		assert.equal(entry.kind, "holdout")
		assert.equal(entry.review, false)
		const palette = entry.extraction.methods.spatial
		assertValidPalette(palette)
		assertValidPalette(entry.extraction.methods.expressive)
		assert.ok(palette.metrics.accentContrast >= minimumAccentBackgroundContrast)
		assert.ok(entry.extraction.methods.expressive.metrics.accentContrast >= minimumAccentBackgroundContrast)
		assertValidPalette(entry.extraction.methods.quantized, false)
		const sourceColors = new Set(entry.extraction.candidates.map((candidate) => candidate.hex))
		for (const role of ["background", "foreground", "surface", "accent"] as const) {
			if (!palette[role].generated) assert.ok(sourceColors.has(palette[role].hex))
		}
		assert.equal(palette.background.generated, false)
		assert.equal(palette.surface.generated, false)
	}
})
