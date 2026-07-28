import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	completeTreatmentKey,
	extractAlbumArtworkPaletteV2,
	extractAlbumArtworkPaletteV2074,
	extractAlbumArtworkPaletteV2Phase3Closed074,
	extractAlbumArtworkPaletteV2Phase3Live072,
} from "../src/album-artwork-palette-v2.ts"
import { oklabToRGB } from "../src/color.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_WORKING_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_WORKING_ATTEMPT_ID,
	extractAlbumArtworkPaletteV2Phase3Working,
} from "../src/album-artwork-palette-v2-phase-3-contract.ts"
import { parseAlbumArtworkPaletteV2Phase3IterationArguments } from
	"../run-album-artwork-palette-v2-phase-3-iteration.ts"
import type { RGB, RawImage } from "../src/types.ts"

function clampByte(value: number): number {
	return Math.max(0, Math.min(255, Math.round(value)))
}

function mix(first: RGB, second: RGB, amount: number): RGB {
	return [
		clampByte(first[0] + (second[0] - first[0]) * amount),
		clampByte(first[1] + (second[1] - first[1]) * amount),
		clampByte(first[2] + (second[2] - first[2]) * amount),
	]
}

function transitionField(): RawImage {
	const width = 112
	const height = 68
	const data = new Uint8Array(width * height * 3)
	const first: RGB = [31, 52, 137]
	const middle: RGB = [61, 163, 143]
	const last: RGB = [221, 170, 58]
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const amount = Math.max(0, Math.min(1, x / (width - 1) + 0.035 * Math.sin(Math.PI * y / (height - 1))))
			const color = amount < 0.48
				? mix(first, middle, amount / 0.48)
				: mix(middle, last, (amount - 0.48) / 0.52)
			data.set(color, (y * width + x) * 3)
		}
	}
	return { width, height, data }
}

function radialEndpointField(): RawImage {
	const width = 144
	const height = 96
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (x >= 60 && x < 84 && y >= 38 && y < 58) {
				data.set([238, 38, 60], (y * width + x) * 3)
				continue
			}
			const amount = Math.max(0, Math.min(1,
				Math.hypot(x / (width - 1) - 0.5, y / (height - 1) - 0.5) / Math.SQRT1_2))
			data.set(oklabToRGB([0.48 + 0.085 * amount, 0.018, -0.025]), (y * width + x) * 3)
		}
	}
	return { width, height, data }
}

test("working candidate preserves the anchor prefix and reserves legal source transition directions", () => {
	const image = transitionField()
	const closed = extractAlbumArtworkPaletteV2074(image)
	const result = extractAlbumArtworkPaletteV2Phase3Working(image)
	const diagnostics = result.diagnostics.phase3Working

	assert.equal(result.version, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_WORKING_ATTEMPT_ID)
	assert.equal(diagnostics.selectionAuthority, "closed-anchor-prefix-source-strata-relation-complement-v2")
	assert.equal(completeTreatmentKey(result.winner), completeTreatmentKey(closed.winner))
	assert.deepEqual(result.alternatives.slice(0, 2).map(completeTreatmentKey),
		closed.alternatives.slice(0, 2).map(completeTreatmentKey))
	assert.ok(diagnostics.fieldTransition.eligibleTraceCount > 0)
	assert.ok(diagnostics.fieldTransition.hypotheses.length > 0)
	assert.ok(diagnostics.supplementalConstructedTreatmentCount > 0)
	assert.ok(diagnostics.logicalUnionDescriptorCount > diagnostics.closedDomainTreatmentCount)
	assert.ok(diagnostics.materializedDomainTreatmentCount <= 1_500)
	assert.ok(diagnostics.fieldTransition.hypotheses.every((custody) =>
		custody.constructedTreatmentCount > 0 && custody.materializedDomainTreatmentCount > 0 &&
		custody.publicSlateTreatmentCount > 0))
	assert.ok(diagnostics.materialization.strata.some(({ key, strongestMaterialized }) =>
		key.startsWith("source-hypothesis-mode:field-transition:") && strongestMaterialized))
	assert.ok(diagnostics.slatePolicy.reservedSupplemental.some(({ sources, strata }) =>
		sources.includes("field-transition") && strata.every((stratum) => stratum.includes("gradient-field"))))
	assert.ok(result.alternatives.length <= 8)
	assert.equal(diagnostics.roleAwareEvidence.integrated, false)

	const supplemental = result.diagnostics.fieldHypotheses.filter(({ id }) => id.startsWith("field-transition:"))
	assert.ok(supplemental.length > 0)
	for (const hypothesis of supplemental) {
		assert.equal(hypothesis.kind, "gradient-field")
		assert.ok(hypothesis.gradientEvidence?.topology === "linear" ||
			hypothesis.gradientEvidence?.topology === "radial-center" ||
			hypothesis.gradientEvidence?.topology === "radial-upper-center")
		for (const representative of [...hypothesis.backgroundRepresentatives, ...hypothesis.surfaceRepresentatives]) {
			assert.equal("generated" in representative.support, false)
			if (!("generated" in representative.support)) assert.ok(representative.support.regionIds.length > 0)
		}
	}
})

test("accepted radial band-local endpoints construct source-local treatments and reach the slate", () => {
	const image = radialEndpointField()
	const closed = extractAlbumArtworkPaletteV2074(image)
	const result = extractAlbumArtworkPaletteV2Phase3Working(image)
	const diagnostics = result.diagnostics.phase3Working
	assert.equal(completeTreatmentKey(result.winner), completeTreatmentKey(closed.winner))
	assert.ok(diagnostics.endpointRefinement.acceptedCount > 0)
	assert.ok(diagnostics.endpointRefinement.hypotheses.some((custody) =>
		(custody.topology === "radial-center" || custody.topology === "radial-upper-center") &&
		custody.constructedTreatmentCount > 0 && custody.materializedDomainTreatmentCount > 0 &&
		custody.publicSlateTreatmentCount > 0))
	assert.ok(diagnostics.slatePolicy.reservedSupplemental.some(({ sources, strata }) =>
		sources.includes("endpoint-refinement") && strata.every((stratum) => stratum.includes("gradient-field"))))
	const hypotheses = result.diagnostics.fieldHypotheses.filter(({ id }) => id.startsWith("endpoint-refinement:"))
	assert.ok(hypotheses.length > 0)
	for (const hypothesis of hypotheses) {
		for (const [familyId, representatives] of [
			[hypothesis.backgroundFamilyId, hypothesis.backgroundRepresentatives],
			[hypothesis.surfaceFamilyId!, hypothesis.surfaceRepresentatives],
		] as const) {
			assert.ok(representatives.some((representative) =>
				!("generated" in representative.support) && representative.support.exactSource))
			for (const representative of representatives) {
				assert.ok(!("generated" in representative.support))
				if ("generated" in representative.support) continue
				assert.equal(representative.support.anchorFamilyId, familyId)
				assert.ok(representative.support.regionIds.every((id) => id.startsWith(`${familyId}-region-`)))
			}
		}
	}
})

test("working registration is explicit while live and closed extraction remain byte-identical", () => {
	const image = transitionField()
	assert.equal(JSON.stringify(extractAlbumArtworkPaletteV2Phase3Live072(image)),
		JSON.stringify(extractAlbumArtworkPaletteV2(image)))
	assert.equal(JSON.stringify(extractAlbumArtworkPaletteV2Phase3Closed074(image)),
		JSON.stringify(extractAlbumArtworkPaletteV2074(image)))
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_WORKING_ATTEMPT.identity.attemptId, "phase-3-working")
	assert.deepEqual(parseAlbumArtworkPaletteV2Phase3IterationArguments([
		"--iteration", "working-test", "--case", "development-03", "--attempt", "phase-3-working",
	]), {
		iterationId: "working-test",
		caseIds: ["development-03"],
		attemptIds: ["phase-3-working"],
	})
})

test("working inference has no evaluation identity, human evidence, or target-color dependency", async () => {
	const source = await readFile(new URL(
		"../src/album-artwork-palette-v2-phase-3-contract.ts",
		import.meta.url,
	), "utf8")
	assert.doesNotMatch(source, /(?:development-[0-9]+|artworkId|feedback|review|warehouse|target.?color)/iu)
})
