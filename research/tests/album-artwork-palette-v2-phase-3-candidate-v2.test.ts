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
import type {
	AlbumArtworkPaletteV2Result,
	CompletePaletteTreatment,
} from "../src/album-artwork-palette-v2.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CANDIDATE_V2_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CANDIDATE_V2_ATTEMPT_ID,
	extractAlbumArtworkPaletteV2Phase3CandidateV2,
} from "../src/album-artwork-palette-v2-phase-3-candidate-v2.ts"
import { oklabToRGB } from "../src/color.ts"
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
			const amount = Math.max(0, Math.min(1,
				x / (width - 1) + 0.035 * Math.sin(Math.PI * y / (height - 1))))
			data.set(amount < 0.48
				? mix(first, middle, amount / 0.48)
				: mix(middle, last, (amount - 0.48) / 0.52), (y * width + x) * 3)
		}
	}
	return { width, height, data }
}

function subtleRadialField(): RawImage {
	const width = 144
	const height = 96
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if ([20, 60, 100].some((markX) => x >= markX && x < markX + 4) && y >= 46 && y < 50) {
				data.set([238, 38, 60], (y * width + x) * 3)
				continue
			}
			const amount = Math.max(0, Math.min(1,
				Math.hypot(x / (width - 1) - 0.5, y / (height - 1) - 0.5) / Math.SQRT1_2))
			data.set(oklabToRGB([0.48 + 0.072 * amount, 0.018, -0.025]), (y * width + x) * 3)
		}
	}
	return { width, height, data }
}

function assertLegalAndSourceSupported(treatment: CompletePaletteTreatment): void {
	const roles = ["background", "surface", "foreground", "accent"] as const
	const distinct = new Set(roles.map((role) => treatment[role].hex)).size
	assert.equal(distinct, treatment.cardinality)
	assert.ok(distinct >= 2 && distinct <= 4)
	assert.equal(treatment.collapse.surface, treatment.background.hex === treatment.surface.hex)
	assert.equal(treatment.collapse.accent, treatment.foreground.hex === treatment.accent.hex)
	assert.ok(treatment.background.hex !== treatment.foreground.hex)
	assert.ok(treatment.background.hex !== treatment.accent.hex)
	if (!treatment.collapse.surface) {
		assert.ok(treatment.surface.hex !== treatment.foreground.hex)
		assert.ok(treatment.surface.hex !== treatment.accent.hex)
	}
	if (!treatment.collapse.accent) assert.ok(treatment.accent.hex !== treatment.surface.hex)
	if (treatment.gradient) {
		assert.equal(treatment.fieldTreatment, "gradient-field")
		assert.equal(treatment.collapse.surface, false)
		assert.ok(treatment.gradientEvidence)
	}
	for (const role of roles) {
		const color = treatment[role]
		assert.equal(color.generated, false)
		assert.notEqual(treatment.familyRoles[role], "generated")
		assert.equal("generated" in color.support, false)
		if ("generated" in color.support) continue
		assert.equal(color.support.anchorFamilyId, treatment.familyRoles[role])
		assert.ok(color.support.regionIds.length > 0)
	}
}

test("candidate-v2 wires the neutral common seed through all four v2 modules before unpinned selection", () => {
	const image = transitionField()
	const closed = extractAlbumArtworkPaletteV2074(image)
	const result = extractAlbumArtworkPaletteV2Phase3CandidateV2(image)
	const publicResult: AlbumArtworkPaletteV2Result = result
	const diagnostics = result.diagnostics.phase3CandidateV2
	const treatmentKeys = result.alternatives.map(completeTreatmentKey)

	assert.equal(result.version, ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CANDIDATE_V2_ATTEMPT_ID)
	assert.equal(publicResult, result)
	assert.equal(completeTreatmentKey(result.winner), diagnostics.selector.winner.key)
	assert.equal(completeTreatmentKey(result.winner), treatmentKeys[0])
	assert.notEqual(completeTreatmentKey(result.winner), completeTreatmentKey(closed.winner))
	assert.ok(result.alternatives.length >= 1 && result.alternatives.length <= 8)
	assert.equal(new Set(treatmentKeys).size, treatmentKeys.length)
	assert.equal(diagnostics.fieldCombination.seedInputCount,
		diagnostics.seedAvailability.sourceSupportedFieldHypothesisCount)
	assert.equal(diagnostics.fieldCombination.proposalInputCount,
		diagnostics.fieldProposal.proposalCount)
	assert.equal(diagnostics.roleDomain.logicalDescriptorCount,
		diagnostics.materialization.inputLogicalDescriptorCount)
	assert.ok(diagnostics.materialization.materializedTreatmentCount <= 1_500)
	assert.equal(diagnostics.materialization.materializedTreatmentCount,
		diagnostics.selector.domain.materializedTreatmentCount)
	assert.equal(diagnostics.seedAvailability.strongSourceGradientRoleDescriptorCount > 0, true)
	assert.equal(diagnostics.seedAvailability.strongSourceGradientMaterializedCount > 0, true)
	assert.ok(diagnostics.custody.some(({ sourceType, kind, materializedTreatmentCount }) =>
		sourceType === "closed-0.7.4-seed" && kind === "gradient-field" && materializedTreatmentCount > 0))
	assert.ok(diagnostics.custody.some(({ sourceType, materializedTreatmentCount }) =>
		sourceType === "field-proposal-v2" && materializedTreatmentCount > 0))
	for (const treatment of [result.winner, ...result.alternatives]) {
		assertLegalAndSourceSupported(treatment)
	}
})

test("candidate-v2 is deterministic and field-v2 suppresses an inconsequential new radial gradient", () => {
	const image = subtleRadialField()
	const first = extractAlbumArtworkPaletteV2Phase3CandidateV2(image)
	const second = extractAlbumArtworkPaletteV2Phase3CandidateV2(image)
	assert.equal(JSON.stringify(first), JSON.stringify(second))
	const proposal = first.diagnostics.phase3CandidateV2.fieldProposal
	const radial = proposal.candidates.find(({ origin, topology }) =>
		origin === "band-local-endpoint" && topology === "radial-center")
	assert.ok(radial)
	assert.equal(radial.gradientEligible, false)
	assert.equal(radial.gradientEmitted, false)
	assert.equal(radial.flatCounterfactualEmitted, true)
	assert.equal(proposal.gradientProposalCount, 0)
})

test("attempt registration preserves exact live 0.7.2 and closed 0.7.4 output", () => {
	const image = transitionField()
	const liveBefore = JSON.stringify(extractAlbumArtworkPaletteV2(image))
	const closedBefore = JSON.stringify(extractAlbumArtworkPaletteV2074(image))
	extractAlbumArtworkPaletteV2Phase3CandidateV2(image)
	assert.equal(JSON.stringify(extractAlbumArtworkPaletteV2Phase3Live072(image)), liveBefore)
	assert.equal(JSON.stringify(extractAlbumArtworkPaletteV2Phase3Closed074(image)), closedBefore)
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_CANDIDATE_V2_ATTEMPT.identity.attemptId,
		"phase-3-candidate-v2")
	assert.deepEqual(parseAlbumArtworkPaletteV2Phase3IterationArguments([
		"--iteration", "candidate-v2-test", "--case", "development-03",
		"--attempt", "phase-3-candidate-v2",
	]), {
		iterationId: "candidate-v2-test",
		caseIds: ["development-03"],
		attemptIds: ["phase-3-candidate-v2"],
	})
})

test("candidate inference has no review, path, case, target, or closed outcome dependency", async () => {
	const source = await readFile(new URL(
		"../src/album-artwork-palette-v2-phase-3-candidate-v2.ts",
		import.meta.url,
	), "utf8")
	assert.doesNotMatch(source, /from\s+["']node:/u)
	assert.doesNotMatch(source,
		/(?:development-[0-9]+|caseId|artworkId|pathname|feedback|review|warehouse|manifest|target.?color)/iu)
	assert.doesNotMatch(source,
		/(?:closedDetails\.result\.(?:winner|alternatives)|audit\.candidate\.(?:completeTreatmentKeys|result))/u)
	assert.doesNotMatch(source,
		/(?:anchorPrefix|forcedReservation|provenanceReserve|fillToEight|fallbackTreatment)/iu)
})
