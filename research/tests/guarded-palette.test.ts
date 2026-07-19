import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { chroma, rgbToHex, rgbToOKLab } from "../src/color.ts"
import type { Candidate, CandidateSpatialEvidence } from "../src/candidates.ts"
import { applyGuardedCorrections } from "../src/guarded-palette.ts"
import { extractGuardedPalette } from "../src/guarded-extract.ts"
import { loadImage } from "../src/image.ts"
import type { RegionAnalysis } from "../src/regions.ts"
import type { CorpusResult, Palette, RGB } from "../src/types.ts"

type CandidateOptions = {
	population?: number
	background?: number
	saliency?: number
	text?: number
	frame?: number
	sides?: readonly [number, number, number, number]
	typographyOnly?: boolean
}

function spatial(id: number, options: CandidateOptions): CandidateSpatialEvidence {
	const population = options.population ?? 0.1
	const sideCoverage = options.sides ?? [0, 0, 0, 0]
	return {
		population,
		regionIds: [id],
		components: [{
			population,
			regionIds: [id],
			sideCoverage,
			saliency: options.saliency ?? 0.5,
			text: options.text ?? 0.5,
		}],
		sideCoverage,
		field: Math.sqrt(population),
		detail: Math.max(options.saliency ?? 0.5, options.text ?? 0.5),
		frame: options.frame ?? 0,
	}
}

function candidate(id: number, rgb: RGB, options: CandidateOptions = {}): Candidate {
	const lab = rgbToOKLab(rgb)
	const evidence = spatial(id, options)
	return {
		id,
		rgb,
		lab,
		hex: rgbToHex(rgb),
		population: options.population ?? 0.1,
		background: options.background ?? 0.2,
		saliency: options.saliency ?? 0.5,
		text: options.text ?? 0.5,
		chroma: chroma(lab),
		generated: false,
		typographyOnly: options.typographyOnly ?? false,
		regionIds: [id],
		familyId: id,
		spatial: evidence,
		familySpatial: evidence,
	}
}

function analysis(candidates: readonly Candidate[]): RegionAnalysis {
	const rgb = candidates[0].rgb
	const lab = rgbToOKLab(rgb)
	return {
		width: 1,
		height: 1,
		data: new Uint8Array(rgb),
		labs: new Float32Array(lab),
		labels: new Int32Array([0]),
		edges: new Float32Array(1),
		regions: [{
			id: 0,
			area: 1,
			population: 1,
			centerX: 0.5,
			centerY: 0.5,
			lab,
			rgb,
			borderPixels: 0,
			sideCount: 0,
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
	}
}

function role(value: Candidate) {
	return { rgb: value.rgb, hex: value.hex, generated: false, sourceDistance: 0 }
}

function palette(background: Candidate, foreground: Candidate, surface: Candidate, accent: Candidate): Palette {
	return {
		background: role(background),
		foreground: role(foreground),
		surface: role(surface),
		accent: role(accent),
		gradient: { isGradient: false, confidence: 1, coverage: 0, continuity: 0, coherence: 0 },
		score: 1,
		metrics: {
			foregroundContrast: 1,
			foregroundSurfaceContrast: 1,
			accentContrast: 1,
			accentSurfaceContrast: 1,
			minimumRoleDistance: 0,
			meanSourceDistance: 0,
			meanReconstructionError: 0,
		},
	}
}

test("preserves the canonical palette byte-for-byte when no guard is admitted", () => {
	const background = candidate(0, [15, 20, 30], { population: 0.7, background: 1 })
	const foreground = candidate(1, [245, 245, 245], { population: 0.1, saliency: 0.8, text: 0.8 })
	const surface = candidate(2, [35, 45, 60], { population: 0.15, background: 0.7 })
	const accent = candidate(3, [210, 80, 40], { population: 0.05, saliency: 0.8 })
	const baseline = palette(background, foreground, surface, accent)
	const result = applyGuardedCorrections(baseline, [background, foreground, surface, accent], analysis([background]))
	assert.deepEqual(result.palette, baseline)
	assert.equal(result.certificate.decision.kind, "preserve")
})

test("replaces a thin all-side frame only with the canonical interior surface", () => {
	const frame = candidate(0, [145, 140, 110], {
		population: 0.04,
		background: 0.9,
		frame: 0.8,
		sides: [1, 1, 1, 1],
	})
	const field = candidate(1, [35, 75, 150], { population: 0.2, background: 0.35 })
	const foreground = candidate(2, [250, 250, 250], { population: 0.1, saliency: 0.8, text: 0.8 })
	const accent = candidate(3, [230, 150, 35], { population: 0.08, saliency: 0.8 })
	const baseline = palette(frame, foreground, field, accent)
	const candidates = [frame, field, foreground, accent]
	const first = applyGuardedCorrections(baseline, candidates, analysis(candidates))
	const second = applyGuardedCorrections(baseline, [...candidates].reverse(), analysis(candidates))
	assert.equal(first.certificate.decision.rule, "thin-frame-background")
	assert.equal(first.palette.background.hex, field.hex)
	assert.equal(first.palette.surface.hex, field.hex)
	assert.deepEqual(first, second)
})

test("accent guards reject tiny chromatic details and framed contrast alternatives", () => {
	const background = candidate(0, [20, 22, 30], { population: 0.6, background: 1 })
	const foreground = candidate(1, [250, 250, 250], { population: 0.1, saliency: 0.8, text: 0.8 })
	const surface = candidate(2, [5, 7, 12], { population: 0.2, background: 0.8 })
	const accent = candidate(3, [0, 0, 1], { population: 0.01, saliency: 0.8 })
	const tiny = candidate(4, [160, 120, 60], { population: 0.004, saliency: 0.9 })
	const framed = candidate(5, [190, 195, 205], { population: 0.15, saliency: 0.4, frame: 0.02 })
	const candidates = [background, foreground, surface, accent, tiny, framed]
	const baseline = palette(background, foreground, surface, accent)
	const result = applyGuardedCorrections(baseline, candidates, analysis(candidates))
	assert.deepEqual(result.palette, baseline)
	assert.equal(result.certificate.decision.kind, "preserve")
})

const projectRoot = fileURLToPath(new URL("../..", import.meta.url))

test("guarded corpus regressions change only the three high-confidence rejected examples", async () => {
	const roundsRoot = join(projectRoot, "research/data/rounds")
	const developmentArchive = JSON.parse(await readFile(join(roundsRoot, "region-graph-0.15.0.json"), "utf8")) as {
		results: CorpusResult
	}
	const holdoutArchive = JSON.parse(
		await readFile(join(roundsRoot, "region-graph-0.15.0-corpus-review.json"), "utf8"),
	) as { holdoutResults: CorpusResult }
	const baselineByFile = new Map(
		[...developmentArchive.results.entries, ...holdoutArchive.holdoutResults.entries]
			.map((entry) => [entry.file, entry.extraction.methods.spatial] as const),
	)
	const decisions = [
		["00/ab67616d0000b27300001a3ee120f20345896b12.jpg", "thin-frame-background"],
		["00/ab67616d0000b273000064c47077c5d50085297f.jpg", "chromatic-salient-accent"],
		["00/ab67616d0000b2730000f31d2426debbeaea5105.jpg", "collapsed-contrast-accent"],
		["images/snarky.jpg", null],
		["images/ybbb.jpg", null],
		["00/ab67616d0000b27300003409c3db06f20f3ed7b6.jpg", null],
	] as const
	for (const [file, expectedRule] of decisions) {
		const image = await loadImage(join(projectRoot, file))
		const baseline = baselineByFile.get(file.replace(/^images\//, ""))
		assert.ok(baseline, `Missing archived 0.15 baseline for ${file}`)
		const guarded = extractGuardedPalette(image)
		assert.equal(guarded.certificate.decision.rule, expectedRule, file)
		if (expectedRule === null) assert.deepEqual(guarded.extraction.methods.spatial, baseline, file)
		else {
			const changedRoles = (["background", "foreground", "surface", "accent"] as const)
				.filter((roleName) => guarded.extraction.methods.spatial[roleName].hex !== baseline[roleName].hex)
			assert.equal(changedRoles.length, 1, file)
		}
	}
})
