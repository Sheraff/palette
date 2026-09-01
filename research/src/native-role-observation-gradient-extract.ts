import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { isDeepStrictEqual } from "node:util"
import type { Candidate } from "./candidates.ts"
import { loadImage } from "./image.ts"
import {
	extractNativeResolutionPaletteWithContext,
	NATIVE_RESOLUTION_ALGORITHM_VERSION,
	NATIVE_RESOLUTION_POLICY_SHA256,
} from "./native-resolution-extract.ts"
import { loadNativeImage, NATIVE_IMAGE_MAXIMUM_PIXELS } from "./native-resolution-image.ts"
import { detectGradient } from "./palette.ts"
import { analyzeRegions, type RegionAnalysis } from "./regions.ts"
import type { ExtractionResult, GradientEvidence, Palette, RawImage, RGB, RoleName } from "./types.ts"

export const NATIVE_ROLE_OBSERVATION_GRADIENT_ALGORITHM_VERSION =
	"region-graph-0.19.0-native-role-observation-gradient-0.3.0-development" as const
export const NATIVE_ROLE_OBSERVATION_GRADIENT_POLICY_VERSION =
	"native-role-observation-gradient-policy-v1" as const
export const NATIVE_ROLE_OBSERVATION_GRADIENT_MAX_EDGE = 224

export const NATIVE_ROLE_OBSERVATION_GRADIENT_POLICY = Object.freeze({
	version: NATIVE_ROLE_OBSERVATION_GRADIENT_POLICY_VERSION,
	nativeBaselineAlgorithmVersion: NATIVE_RESOLUTION_ALGORITHM_VERSION,
	nativeBaselinePolicySha256: NATIVE_RESOLUTION_POLICY_SHA256,
	nativeDecode: "sharp-0.33.5-rotate-flatten-white-srgb-remove-alpha-raw-uchar",
	nativeMaximumPixels: NATIVE_IMAGE_MAXIMUM_PIXELS,
	nativeResponsibility: "candidates-families-complete-role-allocation-role-score-role-metrics-expressive-quantized",
	observationDecode: "sharp-0.33.5-max-edge-224-lanczos3-rotate-flatten-white-srgb-remove-alpha-raw-uchar",
	observationResponsibility: "selected-native-background-surface-gradient-evidence-only",
	fieldEndpointBinding: "exact-rgb-native-candidate-membership-all-alias-ids-certified",
	equalFieldEndpointPolicy: "flat-confidence-one-zero-evidence",
	gradientPolicy: "unchanged-region-graph-detect-gradient-with-smooth-fallback",
	canonicalRolePolicy: "not-loaded-not-used",
})

export const NATIVE_ROLE_OBSERVATION_GRADIENT_POLICY_SHA256 = createHash("sha256")
	.update(NATIVE_ROLE_OBSERVATION_GRADIENT_POLICY_VERSION, "utf8")
	.update("\0")
	.update(JSON.stringify(NATIVE_ROLE_OBSERVATION_GRADIENT_POLICY), "utf8")
	.digest("hex")

const roles: readonly RoleName[] = ["background", "foreground", "surface", "accent"]
const flatGradient: GradientEvidence = {
	isGradient: false,
	confidence: 1,
	coverage: 0,
	continuity: 0,
	coherence: 0,
}

export type NativeRoleObservationGradientCertificate = {
	schemaVersion: 1
	algorithmVersion: typeof NATIVE_ROLE_OBSERVATION_GRADIENT_ALGORITHM_VERSION
	nativeBaselineAlgorithmVersion: typeof NATIVE_RESOLUTION_ALGORITHM_VERSION
	nativeBaselinePolicySha256: typeof NATIVE_RESOLUTION_POLICY_SHA256
	policySha256: typeof NATIVE_ROLE_OBSERVATION_GRADIENT_POLICY_SHA256
	selectionRule: "native-complete-role-allocation-with-observation-gradient-remeasurement"
	sourceSha256: string
	nativeImageSha256: string
	observationImageSha256: string
	fieldEndpoints: {
		background: { hex: string; candidateIds: number[] }
		surface: { hex: string; candidateIds: number[] }
	}
	gradient: {
		native: GradientEvidence
		observation: GradientEvidence
		decisionChanged: boolean
		evidenceChanged: boolean
	}
	invariants: {
		nativeSpatialRolesPreserved: true
		nativeSpatialScorePreserved: true
		nativeSpatialMetricsPreserved: true
		nativeExpressivePreserved: true
		nativeQuantizedPreserved: true
		nonGeneratedSpatialRolesAreExactNativePixels: true
		fieldEndpointsAreNativeCandidates: true
		observationChangesGradientOnly: true
		canonicalRoleColorsUsed: false
	}
}

export type NativeRoleObservationGradientExtractionContext = {
	extraction: ExtractionResult
	certificate: NativeRoleObservationGradientCertificate
	policy: typeof NATIVE_ROLE_OBSERVATION_GRADIENT_POLICY
}

function rasterSha256(image: RawImage): string {
	return createHash("sha256").update(`${image.width}x${image.height}:`, "utf8").update(image.data).digest("hex")
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function gradientChanged(first: GradientEvidence, second: GradientEvidence): boolean {
	return first.isGradient !== second.isGradient || first.confidence !== second.confidence ||
		first.coverage !== second.coverage || first.continuity !== second.continuity || first.coherence !== second.coherence
}

function exactSourcePixel(image: RawImage, rgb: RGB): boolean {
	for (let offset = 0; offset < image.data.length; offset += 3) {
		if (image.data[offset] === rgb[0] && image.data[offset + 1] === rgb[1] && image.data[offset + 2] === rgb[2]) return true
	}
	return false
}

function matchingCandidates(candidates: readonly Candidate[], rgb: RGB): Candidate[] {
	return candidates.filter((candidate) => !candidate.generated && sameRgb(candidate.rgb, rgb))
		.sort((first, second) => first.id - second.id)
}

export function measureNativeFieldObservationGradient(
	palette: Palette,
	candidates: readonly Candidate[],
	observationAnalysis: RegionAnalysis,
): {
	gradient: GradientEvidence
	backgroundCandidateIds: number[]
	surfaceCandidateIds: number[]
} {
	if (palette.background.generated || palette.surface.generated) {
		throw new Error("Native field endpoints must be source colors")
	}
	const backgrounds = matchingCandidates(candidates, palette.background.rgb)
	const surfaces = matchingCandidates(candidates, palette.surface.rgb)
	if (backgrounds.length === 0 || surfaces.length === 0) {
		throw new Error("Native field endpoint is absent from the native candidate universe")
	}
	return {
		gradient: sameRgb(palette.background.rgb, palette.surface.rgb)
			? { ...flatGradient }
			: detectGradient(backgrounds[0], surfaces[0], observationAnalysis),
		backgroundCandidateIds: backgrounds.map((candidate) => candidate.id),
		surfaceCandidateIds: surfaces.map((candidate) => candidate.id),
	}
}

function requireSha256(value: string): void {
	if (!/^[0-9a-f]{64}$/.test(value)) throw new Error("Encoded source SHA-256 is invalid")
}

export function extractNativeRoleObservationGradientPaletteWithContext(
	native: RawImage,
	observation: RawImage,
	sourceSha256: string,
): NativeRoleObservationGradientExtractionContext {
	requireSha256(sourceSha256)
	const startedAt = performance.now()
	const nativeContext = extractNativeResolutionPaletteWithContext(native)
	const nativeExtraction = nativeContext.extraction
	const nativeSpatial = nativeExtraction.methods.spatial
	const observationAnalysis = analyzeRegions(observation)
	const measured = measureNativeFieldObservationGradient(nativeSpatial, nativeContext.candidates, observationAnalysis)
	const spatial: Palette = { ...nativeSpatial, gradient: measured.gradient }
	const extraction: ExtractionResult = {
		...nativeExtraction,
		version: NATIVE_ROLE_OBSERVATION_GRADIENT_ALGORITHM_VERSION,
		methods: { ...nativeExtraction.methods, spatial },
		diagnostics: {
			...nativeExtraction.diagnostics,
			processingMs: Math.round(performance.now() - startedAt),
		},
	}

	if (!roles.every((role) => isDeepStrictEqual(extraction.methods.spatial[role], nativeSpatial[role]))) {
		throw new Error("Observation evidence changed a native spatial role")
	}
	if (extraction.methods.spatial.score !== nativeSpatial.score ||
		!isDeepStrictEqual(extraction.methods.spatial.metrics, nativeSpatial.metrics) ||
		!isDeepStrictEqual(extraction.methods.expressive, nativeExtraction.methods.expressive) ||
		!isDeepStrictEqual(extraction.methods.quantized, nativeExtraction.methods.quantized)) {
		throw new Error("Observation evidence changed native non-gradient output")
	}
	if (!roles.every((role) => extraction.methods.spatial[role].generated ||
		exactSourcePixel(native, extraction.methods.spatial[role].rgb))) {
		throw new Error("A spatial role is not an exact native source pixel")
	}

	return {
		extraction,
		policy: NATIVE_ROLE_OBSERVATION_GRADIENT_POLICY,
		certificate: {
			schemaVersion: 1,
			algorithmVersion: NATIVE_ROLE_OBSERVATION_GRADIENT_ALGORITHM_VERSION,
			nativeBaselineAlgorithmVersion: NATIVE_RESOLUTION_ALGORITHM_VERSION,
			nativeBaselinePolicySha256: NATIVE_RESOLUTION_POLICY_SHA256,
			policySha256: NATIVE_ROLE_OBSERVATION_GRADIENT_POLICY_SHA256,
			selectionRule: "native-complete-role-allocation-with-observation-gradient-remeasurement",
			sourceSha256,
			nativeImageSha256: rasterSha256(native),
			observationImageSha256: rasterSha256(observation),
			fieldEndpoints: {
				background: { hex: nativeSpatial.background.hex.toLowerCase(), candidateIds: measured.backgroundCandidateIds },
				surface: { hex: nativeSpatial.surface.hex.toLowerCase(), candidateIds: measured.surfaceCandidateIds },
			},
			gradient: {
				native: { ...nativeSpatial.gradient },
				observation: { ...measured.gradient },
				decisionChanged: nativeSpatial.gradient.isGradient !== measured.gradient.isGradient,
				evidenceChanged: gradientChanged(nativeSpatial.gradient, measured.gradient),
			},
			invariants: {
				nativeSpatialRolesPreserved: true,
				nativeSpatialScorePreserved: true,
				nativeSpatialMetricsPreserved: true,
				nativeExpressivePreserved: true,
				nativeQuantizedPreserved: true,
				nonGeneratedSpatialRolesAreExactNativePixels: true,
				fieldEndpointsAreNativeCandidates: true,
				observationChangesGradientOnly: true,
				canonicalRoleColorsUsed: false,
			},
		},
	}
}

export async function loadAndExtractNativeRoleObservationGradientPaletteWithContext(
	source: string | Uint8Array,
): Promise<NativeRoleObservationGradientExtractionContext> {
	const encoded = typeof source === "string" ? await readFile(source) : source
	const sourceSha256 = createHash("sha256").update(encoded).digest("hex")
	const [native, observation] = await Promise.all([
		loadNativeImage(encoded),
		loadImage(encoded, { maxSize: NATIVE_ROLE_OBSERVATION_GRADIENT_MAX_EDGE }),
	])
	return extractNativeRoleObservationGradientPaletteWithContext(native, observation, sourceSha256)
}
