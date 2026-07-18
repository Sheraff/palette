import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { contrastRatio, okDistance, rgbToOKLab } from "../src/color.ts"
import { extractPalette } from "../src/extract.ts"
import { minimumAccentBackgroundContrast } from "../src/palette.ts"
import type { CorpusResult, Palette, RawImage, RGB } from "../src/types.ts"

function solid(width: number, height: number, rgb: RGB): RawImage {
	const data = new Uint8Array(width * height * 3)
	for (let offset = 0; offset < data.length; offset += 3) data.set(rgb, offset)
	return { width, height, data }
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
	const path = new URL("../data/results.json", import.meta.url)
	const corpus = JSON.parse(await readFile(path, "utf8")) as CorpusResult
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
	const path = new URL("../data/holdout-results.json", import.meta.url)
	const corpus = JSON.parse(await readFile(path, "utf8")) as CorpusResult
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
