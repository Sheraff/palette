import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { CandidateValidationError, validateCandidateArtifacts } from "../src/candidate-validation.ts"
import { extractChromaticRolePalette } from "../src/chromatic-role-extract.ts"
import { contrastRatio, rgbToHex } from "../src/color.ts"
import { extractPalette } from "../src/extract.ts"
import {
	FOREGROUND_CONTRAST_FLOOR_ALGORITHM_VERSION,
	FOREGROUND_CONTRAST_FLOOR_BASELINE_VERSION,
	extractForegroundContrastFloorPalette,
} from "../src/foreground-contrast-floor-extract.ts"
import {
	FOREGROUND_CONTRAST_ALGORITHM_VERSION,
	extractForegroundContrastPalette,
} from "../src/foreground-contrast-extract.ts"
import {
	DEVELOPMENT_FOREGROUND_CONTRAST_FLOOR_PROFILE,
	DEVELOPMENT_FOREGROUND_CONTRAST_PROFILE,
	hasStrongTypographyEvidence,
	resolveForegroundBackgroundRequirement,
	resolveForegroundBackgroundScoringBreakpoint,
	resolveForegroundSurfaceRequirement,
	resolveForegroundSurfaceScoringBreakpoint,
	resolveSourceForegroundPreferenceMinimum,
	sourceForegroundIsPreferred,
} from "../src/foreground-contrast.ts"
import { loadImage } from "../src/image.ts"
import { solveJointPalette } from "../src/joint-palette.ts"
import { extractRegionGraph017PaletteWithContext } from "../src/region-graph-0.17-extract.ts"
import type { CorpusResult, ExtractionResult, Palette, RGB } from "../src/types.ts"

const projectRoot = fileURLToPath(new URL("../..", import.meta.url))
const profile = DEVELOPMENT_FOREGROUND_CONTRAST_FLOOR_PROFILE
const poc1Profile = DEVELOPMENT_FOREGROUND_CONTRAST_PROFILE
const ordinary = { generated: false, population: 0.099, text: 0.8, saliency: 0.8 }
const strong = { generated: false, population: 0.1, text: 0.5, saliency: 0.55 }
const generated = { generated: true, population: 0, text: 0, saliency: 0 }

test("POC.2 separates hard floors from source and scoring preferences", () => {
	assert.equal(Object.isFrozen(profile), true)
	assert.equal(Object.isFrozen(profile.ordinary), true)
	assert.equal(hasStrongTypographyEvidence(strong), true)
	assert.deepEqual(profile, {
		ordinary: { backgroundMinimum: 3.5, surfaceMinimum: 3 },
		strongTypography: { backgroundMinimum: 3, surfaceMinimum: 2.5 },
		generatedFallback: { backgroundMinimum: 4.5, surfaceMinimum: 4.5 },
		sourceForegroundPreferenceMinimum: 4.5,
		backgroundScoringPreferenceMinimum: 4.5,
		surfaceScoringPreferenceMinimum: 4.5,
	})

	assert.equal(resolveForegroundBackgroundRequirement(ordinary, profile), 3.5)
	assert.equal(resolveForegroundBackgroundRequirement(strong, profile), 3)
	assert.equal(resolveForegroundBackgroundRequirement(generated, profile), 4.5)
	assert.equal(resolveForegroundSurfaceRequirement(ordinary, {
		foregroundBackgroundContrast: 10, allowRepresentativeSurface: false,
	}, profile), 3)
	assert.equal(resolveForegroundSurfaceRequirement(strong, {
		foregroundBackgroundContrast: 10, allowRepresentativeSurface: false,
	}, profile), 2.5)
	assert.equal(resolveForegroundSurfaceRequirement(generated, {
		foregroundBackgroundContrast: 10, allowRepresentativeSurface: false,
	}, profile), 4.5)

	assert.equal(resolveSourceForegroundPreferenceMinimum(profile), 4.5)
	assert.equal(sourceForegroundIsPreferred(ordinary, 4.5 - 1e-12, profile), false)
	assert.equal(sourceForegroundIsPreferred(ordinary, 4.5, profile), true)
	assert.equal(resolveForegroundBackgroundScoringBreakpoint(ordinary, 4.5 - 1e-12, profile), 3.5)
	assert.equal(resolveForegroundBackgroundScoringBreakpoint(strong, 4.5 - 1e-12, profile), 3)
	assert.equal(resolveForegroundBackgroundScoringBreakpoint(ordinary, 4.5, profile), 4.5)
	assert.equal(resolveForegroundBackgroundScoringBreakpoint(strong, 10, profile), 4.5)
	assert.equal(resolveForegroundSurfaceScoringBreakpoint(ordinary, 4.5 - 1e-12, {
		foregroundBackgroundContrast: 10, allowRepresentativeSurface: false,
	}, profile), 3)
	assert.equal(resolveForegroundSurfaceScoringBreakpoint(strong, 4.5 - 1e-12, {
		foregroundBackgroundContrast: 10, allowRepresentativeSurface: false,
	}, profile), 2.5)
	assert.equal(resolveForegroundSurfaceScoringBreakpoint(ordinary, 4.5, {
		foregroundBackgroundContrast: 10, allowRepresentativeSurface: false,
	}, profile), 4.5)
})

test("POC.1 profile shape and scoring behavior remain unchanged", () => {
	assert.deepEqual(poc1Profile, {
		ordinary: { backgroundMinimum: 3.5, surfaceMinimum: 3 },
		strongTypography: { backgroundMinimum: 3, surfaceMinimum: 2.5 },
		generatedFallback: { backgroundMinimum: 4.5, surfaceMinimum: 4.5 },
		sourceForegroundPreferenceMinimum: 3.5,
	})
	assert.equal(resolveSourceForegroundPreferenceMinimum(poc1Profile), 3.5)
	assert.equal(resolveForegroundBackgroundScoringBreakpoint(ordinary, 10, poc1Profile), 3.5)
	assert.equal(resolveForegroundBackgroundScoringBreakpoint(strong, 10, poc1Profile), 3)
	assert.equal(resolveForegroundSurfaceScoringBreakpoint(ordinary, 10, {
		foregroundBackgroundContrast: 10, allowRepresentativeSurface: false,
	}, poc1Profile), 3)
	assert.equal(resolveForegroundSurfaceScoringBreakpoint(strong, 10, {
		foregroundBackgroundContrast: 10, allowRepresentativeSurface: false,
	}, poc1Profile), 2.5)
})

test("canonical undefined profile behavior remains exact", async () => {
	const image = await loadImage(join(projectRoot, "images/artofficial.jpg"))
	const implicit = extractChromaticRolePalette(image)
	const explicitUndefined = extractChromaticRolePalette(image, undefined)
	assert.deepEqual(scientificExtraction(implicit.extraction), scientificExtraction(explicitUndefined.extraction))
	assert.deepEqual(implicit.certificate, explicitUndefined.certificate)
	assert.equal("foregroundContrastProfile" in implicit.certificate, false)
	assert.equal(resolveForegroundBackgroundRequirement(ordinary), 4)
	assert.equal(resolveForegroundBackgroundScoringBreakpoint(ordinary, 4.5 - 1e-12), 4)
	assert.equal(resolveForegroundBackgroundScoringBreakpoint(ordinary, 4.5), 4.5)
})

function scientificExtraction(extraction: ExtractionResult): ExtractionResult {
	return { ...extraction, diagnostics: { ...extraction.diagnostics, processingMs: 0 } }
}

test("POC.1 wrapper still reproduces its frozen artifact", async () => {
	const [image, resultRaw, certificatesRaw] = await Promise.all([
		loadImage(join(projectRoot, "images/artofficial.jpg")),
		readFile(join(projectRoot,
			"research/data/experiments/foreground-contrast-0.1.0-poc.1-development/candidate-results.json"), "utf8"),
		readFile(join(projectRoot,
			"research/data/experiments/foreground-contrast-0.1.0-poc.1-development/candidate-certificates.json"), "utf8"),
	])
	const frozenResults = JSON.parse(resultRaw) as CorpusResult
	const frozenCertificates = JSON.parse(certificatesRaw) as {
		development: Record<string, ReturnType<typeof extractForegroundContrastPalette>["certificate"]>
	}
	const frozen = frozenResults.entries.find((entry) => entry.file === "artofficial.jpg")
	assert.ok(frozen)
	const candidate = extractForegroundContrastPalette(image)
	assert.equal(candidate.extraction.version, FOREGROUND_CONTRAST_ALGORITHM_VERSION)
	assert.deepEqual(scientificExtraction(candidate.extraction), scientificExtraction(frozen.extraction))
	assert.deepEqual(candidate.certificate, frozenCertificates.development["artofficial.jpg"])
})

test("POC.2 wrapper binds its exact version, profile, and underlying certificate", async () => {
	const image = await loadImage(join(projectRoot, "images/artofficial.jpg"))
	const canonical = extractPalette(image)
	const candidate = extractForegroundContrastFloorPalette(image)
	assert.equal(candidate.extraction.version, FOREGROUND_CONTRAST_FLOOR_ALGORITHM_VERSION)
	assert.equal(candidate.certificate.algorithmVersion, FOREGROUND_CONTRAST_FLOOR_ALGORITHM_VERSION)
	assert.equal(candidate.certificate.baselineAlgorithmVersion, FOREGROUND_CONTRAST_FLOOR_BASELINE_VERSION)
	assert.equal(candidate.certificate.selectionRule,
		"canonical-chromatic-spatial-chain-with-explicit-foreground-contrast-floor-profile")
	assert.deepEqual(candidate.certificate.profile, profile)
	assert.deepEqual(candidate.certificate.underlyingChromaticCertificate.foregroundContrastProfile, profile)
	assert.equal(candidate.certificate.invariants.hardFloorsSeparatedFromScoringPreference, true)
	assert.equal(candidate.certificate.invariants.accentGatesFrozen, true)
	assert.equal(candidate.certificate.invariants.objectiveWeightsFrozen, true)
	assert.equal(candidate.certificate.invariants.paretoFloorFrozen, true)
	assert.equal(candidate.certificate.invariants.candidateAdmissionFrozen, true)
	assert.equal(candidate.certificate.invariants.gradientLogicFrozen, true)
	assert.equal(candidate.certificate.invariants.strictGradientSurfaceRecoveryDisabled, true)
	assert.deepEqual(candidate.extraction.methods.expressive, canonical.methods.expressive)
	assert.deepEqual(candidate.extraction.methods.quantized, canonical.methods.quantized)
})

test("POC.2 explicit profile disables strict gradient-surface recovery", async () => {
	const file = "00/ab67616d0000b27300004d9bc5a7082303c8b125.jpg"
	const image = await loadImage(join(projectRoot, file))
	const context = extractRegionGraph017PaletteWithContext(image, profile)
	const result = solveJointPalette(context.candidates, context.analysis, context.extraction.methods.spatial, {
		enableGradientSurfaceRecovery: true,
		foregroundContrastProfile: profile,
	})
	assert.notEqual(result.certificate.selectedAdmission, "gradient-surface-recovery")
	assert.equal(result.certificate.counts.gradientSurfaceConsidered, 0)
	assert.equal(result.certificate.counts.gradientSurfaceRecoveries, 0)
	assert.equal(result.certificate.invariants.strictGradientSurfaceRecovery, false)
})

function role(rgb: RGB): Palette["foreground"] {
	return { rgb, hex: rgbToHex(rgb), generated: false, sourceDistance: 0 }
}

function safePalette(foreground: RGB = [0, 0, 0]): Palette {
	const background = role([255, 255, 255])
	const foregroundRole = role(foreground)
	const surface = role([255, 255, 255])
	const accent = role([0, 0, 0])
	return {
		background,
		foreground: foregroundRole,
		surface,
		accent,
		gradient: { isGradient: false, confidence: 1, coverage: 0, continuity: 0, coherence: 0 },
		score: 1,
		metrics: {
			foregroundContrast: contrastRatio(background.rgb, foregroundRole.rgb),
			foregroundSurfaceContrast: contrastRatio(surface.rgb, foregroundRole.rgb),
			accentContrast: contrastRatio(background.rgb, accent.rgb),
			accentSurfaceContrast: contrastRatio(surface.rgb, accent.rgb),
			minimumRoleDistance: 0,
			meanSourceDistance: 0,
			meanReconstructionError: 0,
		},
	}
}

function validationCorpus(holdout: boolean, version: string, foreground: RGB): CorpusResult {
	const entries = Array.from({ length: holdout ? 355 : 37 }, (_, index) => {
		const file = holdout ? `00/${index.toString().padStart(40, "0")}.jpg` : `sample-${index}.jpg`
		const candidates = [[255, 255, 255], foreground, [0, 0, 0]].map((rgb) => ({
			rgb: rgb as RGB,
			hex: rgbToHex(rgb as RGB),
			population: 0.25,
			background: 0.25,
			saliency: 0.25,
			text: 0.25,
			chroma: 0.1,
		}))
		const spatial = safePalette(foreground)
		return {
			file,
			kind: holdout ? "holdout" as const : "artwork" as const,
			review: !holdout,
			width: 1,
			height: 1,
			extraction: {
				version,
				width: 1,
				height: 1,
				methods: { spatial, expressive: safePalette(), quantized: safePalette() },
				candidates,
				diagnostics: { regionCount: 1, candidateCount: candidates.length, processingMs: 0 },
			},
		}
	})
	return { generatedAt: "2026-01-01T00:00:00.000Z", algorithmVersion: version, entries }
}

test("candidate validation applies POC.2 hard floors to spatial output", () => {
	const foreground: RGB = [145, 145, 145]
	assert.equal(contrastRatio([255, 255, 255], foreground) >= 3, true)
	assert.equal(contrastRatio([255, 255, 255], foreground) < 3.5, true)
	const candidateDevelopment = validationCorpus(false, FOREGROUND_CONTRAST_FLOOR_ALGORITHM_VERSION, foreground)
	const candidateHoldout = validationCorpus(true, FOREGROUND_CONTRAST_FLOOR_ALGORITHM_VERSION, foreground)
	const baselineDevelopment = validationCorpus(false, FOREGROUND_CONTRAST_FLOOR_BASELINE_VERSION, foreground)
	const baselineHoldout = validationCorpus(true, FOREGROUND_CONTRAST_FLOOR_BASELINE_VERSION, foreground)
	assert.doesNotThrow(() => validateCandidateArtifacts(
		candidateDevelopment, candidateHoldout, baselineDevelopment, baselineHoldout,
	))
	assert.throws(() => validateCandidateArtifacts(
		candidateDevelopment,
		candidateHoldout,
		baselineDevelopment,
		baselineHoldout,
		{ foregroundContrastProfile: profile },
	), (error: unknown) => error instanceof CandidateValidationError &&
		/foreground source background contrast is below 3\.5/.test(error.message))
})
