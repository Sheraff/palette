import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { validateCandidateArtifacts, CandidateValidationError } from "../src/candidate-validation.ts"
import { contrastRatio, rgbToHex } from "../src/color.ts"
import { extractChromaticRolePalette } from "../src/chromatic-role-extract.ts"
import { extractPalette } from "../src/extract.ts"
import {
	FOREGROUND_CONTRAST_ALGORITHM_VERSION,
	FOREGROUND_CONTRAST_BASELINE_VERSION,
	extractForegroundContrastPalette,
} from "../src/foreground-contrast-extract.ts"
import {
	DEVELOPMENT_FOREGROUND_CONTRAST_PROFILE,
	defineForegroundContrastProfile,
	hasStrongTypographyEvidence,
	resolveForegroundBackgroundRequirement,
	resolveForegroundBackgroundScoringBreakpoint,
	resolveForegroundSurfaceRequirement,
	resolveForegroundSurfaceScoringBreakpoint,
	resolveSourceForegroundPreferenceMinimum,
	sourceForegroundIsPreferred,
} from "../src/foreground-contrast.ts"
import { solveGuardedPalette } from "../src/guarded-palette.ts"
import { loadImage } from "../src/image.ts"
import { evaluateJointRoleCounterfactual, solveJointPalette } from "../src/joint-palette.ts"
import { extractRegionGraph017PaletteWithContext } from "../src/region-graph-0.17-extract.ts"
import type { CorpusResult, Palette, RGB } from "../src/types.ts"

const projectRoot = fileURLToPath(new URL("../..", import.meta.url))
const profile = DEVELOPMENT_FOREGROUND_CONTRAST_PROFILE
const ordinary = { generated: false, population: 0.099, text: 0.8, saliency: 0.8 }
const strong = { generated: false, population: 0.1, text: 0.5, saliency: 0.55 }
const generated = { generated: true, population: 0, text: 0, saliency: 0 }

test("foreground contrast profile is immutable, validated, and exact at every boundary", () => {
	assert.equal(Object.isFrozen(profile), true)
	assert.equal(Object.isFrozen(profile.ordinary), true)
	assert.equal(hasStrongTypographyEvidence(strong), true)
	assert.equal(hasStrongTypographyEvidence({ ...strong, population: 0.1 - Number.EPSILON }), false)
	assert.equal(hasStrongTypographyEvidence({ ...strong, text: 0.5 - Number.EPSILON }), false)
	assert.equal(hasStrongTypographyEvidence({ ...strong, saliency: 0.55 - Number.EPSILON }), false)

	assert.equal(resolveForegroundBackgroundRequirement(ordinary, profile), 3.5)
	assert.equal(resolveForegroundSurfaceRequirement(ordinary, {
		foregroundBackgroundContrast: 21, allowRepresentativeSurface: false,
	}, profile), 3)
	assert.equal(resolveForegroundBackgroundRequirement(strong, profile), 3)
	assert.equal(resolveForegroundSurfaceRequirement(strong, {
		foregroundBackgroundContrast: 21, allowRepresentativeSurface: false,
	}, profile), 2.5)
	assert.equal(resolveForegroundBackgroundRequirement(generated, profile), 4.5)
	assert.equal(resolveForegroundSurfaceRequirement(generated, {
		foregroundBackgroundContrast: 1, allowRepresentativeSurface: true,
	}, profile), 4.5)

	assert.equal(resolveSourceForegroundPreferenceMinimum(profile), 3.5)
	assert.equal(sourceForegroundIsPreferred(ordinary, 3.5, profile), true)
	assert.equal(sourceForegroundIsPreferred(ordinary, 3.5 - 1e-12, profile), false)
	assert.equal(resolveForegroundBackgroundScoringBreakpoint(ordinary, 10, profile), 3.5)
	assert.equal(resolveForegroundSurfaceScoringBreakpoint(ordinary, 10, {
		foregroundBackgroundContrast: 10, allowRepresentativeSurface: false,
	}, profile), 3)

	assert.throws(() => defineForegroundContrastProfile({
		...profile,
		ordinary: { ...profile.ordinary, backgroundMinimum: 0.99 },
	}), /ordinary thresholds are invalid/)
})

test("explicit surface requirements do not inherit canonical contextual 4.5 branches", () => {
	const highContext = { foregroundBackgroundContrast: 5, allowRepresentativeSurface: false }
	assert.equal(resolveForegroundSurfaceRequirement(ordinary, highContext), 4.5)
	assert.equal(resolveForegroundSurfaceRequirement(strong, highContext), 4.5)
	assert.equal(resolveForegroundSurfaceRequirement(ordinary, highContext, profile), 3)
	assert.equal(resolveForegroundSurfaceRequirement(strong, highContext, profile), 2.5)
	assert.equal(resolveForegroundSurfaceRequirement(ordinary, {
		foregroundBackgroundContrast: 4, allowRepresentativeSurface: false,
	}), 3)
})

test("omitting the profile preserves canonical scientific output and object shape", async () => {
	const image = await loadImage(join(projectRoot, "images/artofficial.jpg"))
	const first = extractChromaticRolePalette(image)
	const second = extractChromaticRolePalette(image, undefined)
	assert.deepEqual(first.extraction.methods, second.extraction.methods)
	assert.deepEqual(first.extraction.candidates, second.extraction.candidates)
	assert.deepEqual(first.certificate, second.certificate)
	assert.equal("foregroundContrastProfile" in first.certificate, false)

	const canonical = extractPalette(image)
	const artifact = JSON.parse(await readFile(join(projectRoot, "research/data/results.json"), "utf8")) as CorpusResult
	const bound = artifact.entries.find((entry) => entry.file === "artofficial.jpg")
	assert.ok(bound)
	assert.deepEqual(canonical.methods, bound.extraction.methods)
	assert.deepEqual(canonical.candidates, bound.extraction.candidates)
	assert.deepEqual(
		{ ...canonical.diagnostics, processingMs: 0 },
		{ ...bound.extraction.diagnostics, processingMs: 0 },
	)
})

test("guarded, joint, chromatic, and counterfactual paths propagate the same profile", async () => {
	const image = await loadImage(join(projectRoot, "images/artofficial.jpg"))
	const context = extractRegionGraph017PaletteWithContext(image)
	const guarded = solveGuardedPalette([...context.candidates], context.analysis, profile)
	const joint = solveJointPalette(context.candidates, context.analysis, guarded.palette, {
		foregroundContrastProfile: profile,
	})
	assert.deepEqual(guarded.certificate.foregroundContrastProfile, profile)
	assert.deepEqual(joint.certificate.foregroundContrastProfile, profile)
	assert.equal(joint.certificate.invariants.strictGradientSurfaceRecovery, false)
	assert.equal(joint.certificate.selectionRule, "reviewed-incumbent-pareto")

	const chromatic = extractChromaticRolePalette(image, profile)
	assert.deepEqual(chromatic.certificate.foregroundContrastProfile, profile)
	const foreground = context.candidates.find((candidate) =>
		candidate.rgb.every((channel, index) => channel === context.extraction.methods.spatial.foreground.rgb[index]))
	assert.ok(foreground)
	const counterfactual = evaluateJointRoleCounterfactual(
		context.candidates,
		context.analysis,
		context.extraction.methods.spatial,
		"foreground",
		foreground,
		profile,
	)
	assert.deepEqual(counterfactual.resolvedForegroundContrast, {
		profile,
		strongTypographyEvidence: hasStrongTypographyEvidence(foreground),
		sourceForegroundPreferenceMinimum: 3.5,
		foregroundBackgroundRequirement: resolveForegroundBackgroundRequirement(foreground, profile),
		foregroundSurfaceRequirement: resolveForegroundSurfaceRequirement(foreground, {
			foregroundBackgroundContrast: counterfactual.measurements.foregroundBackgroundContrast,
			allowRepresentativeSurface: false,
		}, profile),
	})
	assert.equal(counterfactual.measurements.foregroundBackgroundRequired,
		counterfactual.resolvedForegroundContrast.foregroundBackgroundRequirement)
	assert.equal(counterfactual.measurements.foregroundSurfaceRequired,
		counterfactual.resolvedForegroundContrast.foregroundSurfaceRequirement)
})

test("candidate wrapper binds its distinct identity, exact profile, and underlying certificate", async () => {
	const image = await loadImage(join(projectRoot, "images/artofficial.jpg"))
	const canonical = extractPalette(image)
	const candidate = extractForegroundContrastPalette(image)
	assert.equal(candidate.extraction.version, FOREGROUND_CONTRAST_ALGORITHM_VERSION)
	assert.notEqual(candidate.extraction.version, canonical.version)
	assert.equal(candidate.certificate.algorithmVersion, FOREGROUND_CONTRAST_ALGORITHM_VERSION)
	assert.equal(candidate.certificate.baselineAlgorithmVersion, FOREGROUND_CONTRAST_BASELINE_VERSION)
	assert.deepEqual(candidate.certificate.profile, profile)
	assert.deepEqual(candidate.certificate.underlyingChromaticCertificate.foregroundContrastProfile, profile)
	assert.deepEqual(candidate.extraction.methods.expressive, canonical.methods.expressive)
	assert.deepEqual(candidate.extraction.methods.quantized, canonical.methods.quantized)
})

test("an explicit profile cannot activate strict gradient-surface recovery", async () => {
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

function role(rgb: RGB, generatedRole = false) {
	return { rgb, hex: rgbToHex(rgb), generated: generatedRole, sourceDistance: 0 }
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

test("candidate validation applies the explicit profile only to spatial output", () => {
	const foreground: RGB = [145, 145, 145]
	assert.equal(contrastRatio([255, 255, 255], foreground) >= 3, true)
	assert.equal(contrastRatio([255, 255, 255], foreground) < 3.5, true)
	const candidateDevelopment = validationCorpus(false, FOREGROUND_CONTRAST_ALGORITHM_VERSION, foreground)
	const candidateHoldout = validationCorpus(true, FOREGROUND_CONTRAST_ALGORITHM_VERSION, foreground)
	const baselineDevelopment = validationCorpus(false, FOREGROUND_CONTRAST_BASELINE_VERSION, foreground)
	const baselineHoldout = validationCorpus(true, FOREGROUND_CONTRAST_BASELINE_VERSION, foreground)
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
