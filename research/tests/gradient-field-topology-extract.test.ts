import assert from "node:assert/strict"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { extractPalette, extractPaletteWithContext } from "../src/extract.ts"
import {
	extractGradientFieldTopologyPalette,
	GRADIENT_FIELD_TOPOLOGY_EXPERIMENT_VERSION,
} from "../src/gradient-field-topology-extract.ts"
import { analyzeGradientFieldTopology } from "../src/gradient-field-topology.ts"
import { scoreGradientFieldTopologyEvidence } from "../src/gradient-field-topology-model.ts"
import { loadImage } from "../src/image.ts"
import type { ExtractionResult, RawImage, RGB } from "../src/types.ts"

const projectRoot = fileURLToPath(new URL("../..", import.meta.url))

function solidImage(rgb: RGB, width = 24, height = 24): RawImage {
	const data = new Uint8Array(width * height * 3)
	for (let pixel = 0; pixel < width * height; pixel++) data.set(rgb, pixel * 3)
	return { width, height, data }
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function restoreAllowedFields(candidate: ExtractionResult, baseline: ExtractionResult): ExtractionResult {
	return {
		...candidate,
		version: baseline.version,
		methods: {
			...candidate.methods,
			spatial: {
				...candidate.methods.spatial,
				gradient: {
					...candidate.methods.spatial.gradient,
					isGradient: baseline.methods.spatial.gradient.isGradient,
				},
			},
		},
		diagnostics: {
			...candidate.diagnostics,
			processingMs: baseline.diagnostics.processingMs,
		},
	}
}

test("topology wrapper never promotes a canonical flat palette", () => {
	const image = solidImage([44, 66, 88])
	const baseline = extractPalette(image)
	const result = extractGradientFieldTopologyPalette(image)
	assert.equal(baseline.methods.spatial.gradient.isGradient, false)
	assert.equal(result.extraction.methods.spatial.gradient.isGradient, false)
	assert.equal(result.extraction.version, GRADIENT_FIELD_TOPOLOGY_EXPERIMENT_VERSION)
	assert.deepEqual(result.certificate, {
		schemaVersion: 1,
		algorithmVersion: GRADIENT_FIELD_TOPOLOGY_EXPERIMENT_VERSION,
		baselineAlgorithmVersion: "region-graph-0.17.0",
		baselineGradient: false,
		directedEndpoints: null,
		evidence: null,
		decision: { eligible: false, reason: "baseline-not-gradient" },
		invariants: {
			rolesUnchanged: true,
			canonicalGradientOnly: true,
			exactDirectedCandidateMatch: true,
		},
	})
	assert.deepEqual(restoreAllowedFields(result.extraction, baseline), baseline)
})

test("topology wrapper evaluates exact directed canonical endpoints and changes no other output", async () => {
	const image = await loadImage(join(projectRoot, "images", "muse.jpg"))
	const baseline = extractPaletteWithContext(image)
	const result = extractGradientFieldTopologyPalette(image)
	assert.equal(baseline.extraction.methods.spatial.gradient.isGradient, true)
	assert.equal(result.certificate.baselineGradient, true)
	if (!result.certificate.baselineGradient) assert.fail("Expected an evaluated canonical gradient")
	const backgroundMatches = baseline.candidates.filter((candidate) =>
		sameRgb(candidate.rgb, baseline.extraction.methods.spatial.background.rgb))
	const surfaceMatches = baseline.candidates.filter((candidate) =>
		sameRgb(candidate.rgb, baseline.extraction.methods.spatial.surface.rgb))
	assert.equal(backgroundMatches.length, 1)
	assert.equal(surfaceMatches.length, 1)
	assert.deepEqual(result.certificate.directedEndpoints, {
		background: { candidateId: backgroundMatches[0].id, rgb: backgroundMatches[0].rgb },
		surface: { candidateId: surfaceMatches[0].id, rgb: surfaceMatches[0].rgb },
	})
	const evidence = analyzeGradientFieldTopology(backgroundMatches[0], surfaceMatches[0], baseline.analysis)
	assert.deepEqual(result.certificate.evidence, evidence)
	assert.deepEqual(result.certificate.decision, scoreGradientFieldTopologyEvidence(evidence))
	assert.equal(
		result.extraction.methods.spatial.gradient.isGradient,
		result.certificate.decision.eligible,
	)
	assert.deepEqual(restoreAllowedFields(result.extraction, baseline.extraction), baseline.extraction)
	for (const role of ["background", "foreground", "surface", "accent"] as const) {
		assert.deepEqual(result.extraction.methods.spatial[role], baseline.extraction.methods.spatial[role])
	}
	assert.deepEqual(result.extraction.methods.spatial.metrics, baseline.extraction.methods.spatial.metrics)
	assert.equal(result.extraction.methods.spatial.score, baseline.extraction.methods.spatial.score)
	assert.deepEqual(result.extraction.methods.expressive, baseline.extraction.methods.expressive)
	assert.deepEqual(result.extraction.methods.quantized, baseline.extraction.methods.quantized)
	assert.deepEqual(result.extraction.candidates, baseline.extraction.candidates)
})
