import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	completeTreatmentKey,
} from "../src/album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_ATTEMPT_ID,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CONFIGURATION_ID,
	extractAlbumArtworkPaletteV2Phase3Recovery,
} from "../src/album-artwork-palette-v2-phase-3-recovery.ts"
import { parseAlbumArtworkPaletteV2Phase3IterationArguments } from
	"../run-album-artwork-palette-v2-phase-3-iteration.ts"
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

test("recovery exposes the complete Wave 1 domain to an unpinned winner-first selector", () => {
	const result = extractAlbumArtworkPaletteV2Phase3Recovery(transitionField())
	const diagnostics = result.diagnostics.phase3Recovery

	assert.equal(result.version, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_ATTEMPT_ID)
	assert.equal(result.protocol, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_CONFIGURATION_ID)
	assert.equal(completeTreatmentKey(result.winner), diagnostics.selector.winner.key)
	assert.equal(completeTreatmentKey(result.winner), completeTreatmentKey(result.alternatives[0]))
	assert.ok(result.alternatives.length >= 1 && result.alternatives.length <= 8)
	assert.equal(new Set(result.alternatives.map(completeTreatmentKey)).size, result.alternatives.length)
	assert.equal(diagnostics.domain.logicalDescriptorCount,
		diagnostics.domain.seedDescriptorCount + diagnostics.domain.supplementalDescriptorCount)
	assert.equal(diagnostics.domain.materializedTreatmentCount,
		diagnostics.selector.domain.rawTreatmentCount)
	assert.ok(diagnostics.domain.supplementalDescriptorCount > 0)
	assert.ok(diagnostics.domain.winnerSourceTypes.length > 0)
})

test("recovery is deterministic and registered without changing prior attempts", () => {
	const image = transitionField()
	assert.equal(
		JSON.stringify(extractAlbumArtworkPaletteV2Phase3Recovery(image)),
		JSON.stringify(extractAlbumArtworkPaletteV2Phase3Recovery(image)),
	)
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_RECOVERY_ATTEMPT.identity.attemptId,
		"phase-3-recovery")
	assert.deepEqual(parseAlbumArtworkPaletteV2Phase3IterationArguments([
		"--iteration", "recovery-test", "--case", "development-03",
		"--attempt", "phase-3-recovery",
	]), {
		iterationId: "recovery-test",
		caseIds: ["development-03"],
		attemptIds: ["phase-3-recovery"],
	})
})

test("recovery inference contains no review metadata, pinned winner, or fallback policy", async () => {
	const source = await readFile(new URL(
		"../src/album-artwork-palette-v2-phase-3-recovery.ts",
		import.meta.url,
	), "utf8")
	assert.doesNotMatch(source, /from\s+["']node:/u)
	assert.doesNotMatch(source,
		/(?:development-[0-9]+|caseId|artworkId|pathname|feedback|review|warehouse|manifest|target.?color)/iu)
	assert.doesNotMatch(source,
		/(?:closedDetails\.result\.(?:winner|alternatives)|anchorPrefix|forcedReservation|fallbackTreatment)/u)
})
