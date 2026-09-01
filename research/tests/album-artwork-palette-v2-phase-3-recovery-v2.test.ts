import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	completeTreatmentKey,
	extractAlbumArtworkPaletteV2074Details,
} from "../src/album-artwork-palette-v2.ts"
import {
	buildAlbumArtworkPaletteV2Phase3CommonBase,
} from "../src/album-artwork-palette-v2-phase-3-common-base.ts"
import {
	materializeAlbumArtworkPaletteV2Phase3Descriptors,
} from "../src/album-artwork-palette-v2-phase-3-materialization.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V2_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V2_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V2_CONFIGURATION_ID,
	extractAlbumArtworkPaletteV2Phase3RecoveryV2,
} from "../src/album-artwork-palette-v2-phase-3-recovery-v2.ts"
import {
	selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2,
} from "../src/album-artwork-palette-v2-phase-3-recovery-selector-v2.ts"
import {
	parseAlbumArtworkPaletteV2Phase3IterationArguments,
} from "../run-album-artwork-palette-v2-phase-3-iteration.ts"
import type { RawImage } from "../src/types.ts"

function transitionField(): RawImage {
	const width = 64
	const height = 40
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const amount = x / (width - 1)
			data.set([
				Math.round(24 + 180 * amount),
				Math.round(52 + 92 * amount),
				Math.round(142 - 70 * amount),
			], (y * width + x) * 3)
		}
	}
	return { width, height, data }
}

test("recovery v2 preserves the common Wave 1 materialized domain and direct selector result", () => {
	const image = transitionField()
	const closedDetails = extractAlbumArtworkPaletteV2074Details(image)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(image, {
		closed074Details: closedDetails,
		materializeCurrentV1: (descriptors, obligations) =>
			materializeAlbumArtworkPaletteV2Phase3Descriptors(descriptors, obligations),
	})
	assert.ok(common.currentV1MaterializedDomain)
	const direct = selectAlbumArtworkPaletteV2Phase3RecoveryTreatmentsV2(
		common.currentV1MaterializedDomain.materialized.map(({ treatment }) => treatment),
		{ obligations: common.seedAvailability.identityObligations },
	)
	const result = extractAlbumArtworkPaletteV2Phase3RecoveryV2(image)
	const diagnostics = result.diagnostics.phase3RecoveryV2

	assert.equal(result.version, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V2_ATTEMPT_ID)
	assert.equal(result.protocol, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V2_CONFIGURATION_ID)
	assert.equal(diagnostics.domain.materializedTreatmentCount,
		common.currentV1MaterializedDomain.materialized.length)
	assert.equal(diagnostics.domain.materializedTreatmentCount,
		diagnostics.selector.domain.materializedTreatmentCount)
	assert.equal(diagnostics.domain.logicalDescriptorCount,
		diagnostics.domain.seedDescriptorCount + diagnostics.domain.supplementalDescriptorCount)
	assert.equal(completeTreatmentKey(result.winner), completeTreatmentKey(direct.winner))
	assert.deepEqual(result.alternatives.map(completeTreatmentKey), direct.slate.map(completeTreatmentKey))
	assert.equal(completeTreatmentKey(result.alternatives[0]), completeTreatmentKey(result.winner))
	assert.ok(result.alternatives.length >= 1 && result.alternatives.length <= 8)
	assert.ok(diagnostics.selector.evaluations.length > 0)
	assert.ok(diagnostics.selector.evaluations.every(({ quality, gradientStatus }) =>
		Object.values(quality).every(Number.isFinite) && gradientStatus.length > 0))
})

test("recovery v2 is deterministic and registered as the fifth independent attempt", () => {
	const image = transitionField()
	assert.equal(
		JSON.stringify(extractAlbumArtworkPaletteV2Phase3RecoveryV2(image)),
		JSON.stringify(extractAlbumArtworkPaletteV2Phase3RecoveryV2(image)),
	)
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_V2_ATTEMPT.identity.attemptId,
		"phase-3-recovery-v2")
	assert.deepEqual(parseAlbumArtworkPaletteV2Phase3IterationArguments([
		"--iteration", "recovery-v2-test", "--case", "development-03",
		"--attempt", "live-0.7.2",
		"--attempt", "phase-3-working",
		"--attempt", "phase-3-candidate-v2",
		"--attempt", "phase-3-recovery",
		"--attempt", "phase-3-recovery-v2",
	]), {
		iterationId: "recovery-v2-test",
		caseIds: ["development-03"],
		attemptIds: [
			"live-0.7.2",
			"phase-3-working",
			"phase-3-candidate-v2",
			"phase-3-recovery",
			"phase-3-recovery-v2",
		],
	})
})

test("recovery v2 inference does not consult closed outcomes or external identity data", async () => {
	const source = await readFile(new URL(
		"../src/album-artwork-palette-v2-phase-3-recovery-v2.ts",
		import.meta.url,
	), "utf8")
	assert.doesNotMatch(source, /from\s+["']node:/u)
	assert.doesNotMatch(source,
		/(?:development-[0-9]+|\bcaseId\b|\bartworkId\b|pathname|filePath|feedback|review|warehouse|manifest|target.?color|historical|comment|rankingScore)/iu)
	assert.doesNotMatch(source,
		/(?:closedDetails\.result\.(?:winner|alternatives)|anchorPrefix|forcedReservation|fallbackTreatment)/iu)
})
