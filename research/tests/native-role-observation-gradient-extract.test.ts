import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { emptyCandidateSpatialEvidence, type Candidate } from "../src/candidates.ts"
import { rgbToOKLab } from "../src/color.ts"
import { loadImage } from "../src/image.ts"
import { extractNativeResolutionPaletteWithContext } from "../src/native-resolution-extract.ts"
import { loadNativeImage } from "../src/native-resolution-image.ts"
import {
	loadAndExtractNativeRoleObservationGradientPaletteWithContext,
	measureNativeFieldObservationGradient,
	NATIVE_ROLE_OBSERVATION_GRADIENT_ALGORITHM_VERSION,
} from "../src/native-role-observation-gradient-extract.ts"
import type { RegionAnalysis } from "../src/regions.ts"
import type { Palette } from "../src/types.ts"

const projectRoot = resolve(import.meta.dirname, "../..")

function candidate(rgb: [number, number, number]): Candidate {
	const lab = rgbToOKLab(rgb)
	return {
		id: 0,
		rgb,
		lab,
		hex: `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`,
		population: 1,
		background: 1,
		saliency: 0,
		text: 0,
		chroma: Math.hypot(lab[1], lab[2]),
		generated: false,
		typographyOnly: false,
		regionIds: [0],
		familyId: 0,
		spatial: emptyCandidateSpatialEvidence(),
		familySpatial: emptyCandidateSpatialEvidence(),
	}
}

test("equal native field endpoints always produce explicit flat observation evidence", () => {
	const sourceCandidate = candidate([10, 20, 30])
	const role = { rgb: sourceCandidate.rgb, hex: sourceCandidate.hex, generated: false, sourceDistance: 0 }
	const palette = {
		background: role,
		foreground: role,
		surface: role,
		accent: role,
		gradient: { isGradient: true, confidence: 0.5, coverage: 0.5, continuity: 0.5, coherence: 0.5 },
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
	} satisfies Palette
	assert.deepEqual(measureNativeFieldObservationGradient(palette, [sourceCandidate], {} as RegionAnalysis), {
		gradient: { isGradient: false, confidence: 1, coverage: 0, continuity: 0, coherence: 0 },
		backgroundCandidateIds: [sourceCandidate.id],
		surfaceCandidateIds: [sourceCandidate.id],
	})
})

test("field endpoints must resolve to exact native candidates", () => {
	const sourceCandidate = candidate([0, 0, 0])
	const palette = {
		background: { rgb: [1, 1, 1], hex: "#010101", generated: false, sourceDistance: 0 },
		foreground: { rgb: [0, 0, 0], hex: "#000000", generated: false, sourceDistance: 0 },
		surface: { rgb: [0, 0, 0], hex: "#000000", generated: false, sourceDistance: 0 },
		accent: { rgb: [0, 0, 0], hex: "#000000", generated: false, sourceDistance: 0 },
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
	} satisfies Palette
	assert.throws(() => measureNativeFieldObservationGradient(
		palette, [sourceCandidate] satisfies Candidate[], {} as RegionAnalysis,
	),
		/absent from the native candidate universe/)
})

test("integration preserves native role output and changes only gradient evidence", async () => {
	const source = await readFile(resolve(projectRoot, "images/birdsofprey.jpg"))
	const [native, observation, treatment] = await Promise.all([
		loadNativeImage(source),
		loadImage(source),
		loadAndExtractNativeRoleObservationGradientPaletteWithContext(source),
	])
	const baselineContext = extractNativeResolutionPaletteWithContext(native)
	const baseline = baselineContext.extraction
	assert.equal(treatment.extraction.version, NATIVE_ROLE_OBSERVATION_GRADIENT_ALGORITHM_VERSION)
	for (const role of ["background", "foreground", "surface", "accent"] as const) {
		assert.deepEqual(treatment.extraction.methods.spatial[role], baseline.methods.spatial[role])
	}
	assert.equal(treatment.extraction.methods.spatial.score, baseline.methods.spatial.score)
	assert.deepEqual(treatment.extraction.methods.spatial.metrics, baseline.methods.spatial.metrics)
	assert.deepEqual(treatment.extraction.methods.expressive, baseline.methods.expressive)
	assert.deepEqual(treatment.extraction.methods.quantized, baseline.methods.quantized)
	assert.equal(treatment.certificate.gradient.native.isGradient, false)
	assert.equal(treatment.certificate.gradient.observation.isGradient, true)
	assert.equal(treatment.certificate.gradient.decisionChanged, true)
	assert.equal(treatment.certificate.nativeImageSha256, baselineContext.resolution.nativeImageSha256)
	assert.equal(observation.width <= 224 && observation.height <= 224, true)
})
