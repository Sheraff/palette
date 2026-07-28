import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_PROTOCOL,
	ALBUM_ARTWORK_PALETTE_V2_0_7_4_VERSION,
	completeTreatmentKey,
	extractAlbumArtworkPaletteV2,
	extractAlbumArtworkPaletteV2074,
	extractAlbumArtworkPaletteV2074Details,
} from "../src/album-artwork-palette-v2.ts"
import type { AlbumArtworkPaletteV2074Details } from "../src/album-artwork-palette-v2.ts"
import type { RawImage } from "../src/types.ts"
import { loadNativeImage } from "../src/native-resolution-image.ts"

function gradientFixture(): RawImage {
	const width = 132
	const height = 72
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const amount = x / (width - 1)
			data.set([
				Math.round(22 + 188 * amount),
				Math.round(45 + 82 * amount),
				Math.round(154 - 105 * amount),
			], (y * width + x) * 3)
		}
	}
	return { width, height, data }
}

const image = gradientFixture()
let cachedDetails: AlbumArtworkPaletteV2074Details | undefined

function details(): AlbumArtworkPaletteV2074Details {
	return cachedDetails ??= extractAlbumArtworkPaletteV2074Details(image)
}

test("0.7.4 is separately identified and its live control remains byte-identical to 0.7.2", () => {
	const extraction = details()
	const directControl = extractAlbumArtworkPaletteV2(image)

	assert.equal(ALBUM_ARTWORK_PALETTE_V2_0_7_4_VERSION, "album-artwork-first-principles-0.7.4")
	assert.equal(ALBUM_ARTWORK_PALETTE_V2_0_7_4_PROTOCOL, "album-artwork-ui-palette-protocol-v2-0.7.4")
	assert.equal(extraction.result.version, ALBUM_ARTWORK_PALETTE_V2_0_7_4_VERSION)
	assert.equal(extraction.result.protocol, ALBUM_ARTWORK_PALETTE_V2_0_7_4_PROTOCOL)
	assert.equal(JSON.stringify(extraction.audit.control.result), JSON.stringify(directControl))
	assert.deepEqual(extractAlbumArtworkPaletteV2074(image), extraction.result)
})

test("0.7.4 preserves the exact control prefix and appends only canonical source-connected additions", () => {
	const { audit } = details()
	const controlKeys = new Set(audit.control.completeTreatmentKeys)

	assert.equal(audit.version, "album-artwork-palette-v2-0.7.4-core-audit-v1")
	assert.equal(audit.mechanism, "widened-field-hypothesis-retention")
	assert.deepEqual(audit.changedStages, ["field-hypothesis-retention"])
	assert.deepEqual(audit.control.changedStages, [])
	assert.deepEqual(audit.candidate.changedStages, ["field-hypothesis-retention"])
	assert.deepEqual(audit.construction, {
		proposalScope: "all-existing-semantics-control-lanes",
		representatives: "preferred",
		fieldRepresentativePairing: "same-index",
		materialization: "additive-control-prefix",
	})
	assert.ok(audit.additions.length > 0)
	assert.equal(audit.controlPrefixLength, audit.control.completeTreatments.length)
	assert.equal(audit.candidate.rawCandidateCount,
		audit.control.rawCandidateCount + audit.additions.length)
	assert.equal(audit.candidate.materializedCandidateCount,
		audit.control.materializedCandidateCount + audit.additions.length)
	assert.ok(audit.candidate.rawCandidateCount <= audit.candidate.capacity)
	assert.equal(audit.candidate.remainingCapacity,
		audit.candidate.capacity - audit.candidate.rawCandidateCount)
	assert.equal(new Set(audit.candidate.completeTreatmentKeys).size,
		audit.candidate.completeTreatmentKeys.length)
	assert.deepEqual(audit.candidate.completeTreatmentKeys, [
		...audit.control.completeTreatmentKeys,
		...audit.additions.map(({ key }) => key),
	])
	for (let index = 0; index < audit.controlPrefixLength; index++) {
		assert.equal(audit.candidate.completeTreatments[index], audit.control.completeTreatments[index])
	}

	for (const addition of audit.additions) {
		assert.equal(addition.key, completeTreatmentKey(addition.treatment))
		assert.equal(controlKeys.has(addition.key), false)
		assert.equal(addition.lineage.sourceConnected, true)
		assert.ok(addition.lineage.representatives.every(({ sourceConnected }) => sourceConnected))
		assert.ok(addition.lineage.familyIds.every((familyId) => audit.registry.families.some((family) =>
			family.familyId === familyId && family.sourceConnected)))
		assert.ok(audit.registry.fieldHypotheses.some((hypothesis) =>
			hypothesis.hypothesisId === addition.lineage.fieldHypothesisId && hypothesis.sourceConnected))
		assert.ok(audit.registry.fieldDirections.some((direction) =>
			direction.key === addition.lineage.fieldDirectionKey && direction.sourceConnected &&
			direction.hypothesisIds.includes(addition.lineage.fieldHypothesisId)))
		assert.ok(addition.lineage.roleDirectionKeys.every((key) => audit.registry.roleDirections.some((direction) =>
			direction.key === key && direction.sourceConnected)))
	}
})

test("0.7.4 runs the shared selector with candidate-domain authority", () => {
	const { result, audit } = details()
	const ranking = result.diagnostics.paretoRanking
	const graph = result.diagnostics.identityObligationGraph
	const overlay = result.diagnostics.exactOverlayGradientChallenger
	const candidateGradientVariantCount = audit.candidate.fieldVariantKeys.filter((key) =>
		key.endsWith(":gradient")).length
	const controlGradientVariantCount = audit.control.fieldVariantKeys.filter((key) =>
		key.endsWith(":gradient")).length

	assert.equal(result, audit.candidate.result)
	assert.equal(result.diagnostics.completeCandidateCount, audit.candidate.rawCandidateCount)
	assert.equal(ranking.rawCandidateCount, audit.candidate.rawCandidateCount)
	assert.equal(ranking.uniqueCandidateCount, audit.candidate.materializedCandidateCount)
	assert.equal(ranking.selectedTreatmentId, result.winner.id)
	assert.ok(audit.candidate.completeTreatments.some(({ id }) => id === ranking.qualityIncumbentTreatmentId))
	assert.ok(result.alternatives.length <= result.diagnostics.bounds.retainedTreatments)
	assert.ok(candidateGradientVariantCount > controlGradientVariantCount)
	assert.equal(overlay.acceptedGradientVariantCount, candidateGradientVariantCount)

	for (const node of graph.nodes.filter(({ stage }) => stage === "role-availability")) {
		const roles = audit.candidate.availableIdentityRoles.find(({ familyId }) => familyId === node.familyId)?.roles ?? []
		assert.deepEqual(node.availableRoles, roles)
	}
	if (ranking.selectedIdentityChallengerQualityGuard) {
		assert.equal(ranking.selectedIdentityChallengerQualityGuard.pass, true)
	}
	if (overlay.selectedChallengerPassesQualityGuard !== null) {
		assert.equal(overlay.selectedChallengerPassesQualityGuard, true)
	}
})

test("0.7.4 preserves selected-arm quota context before lineage admission", async () => {
	const historical = JSON.parse(await readFile(new URL(
		"../data/experiments/album-artwork-palette-v2-0.7.3-development/sources/development-07.json",
		import.meta.url,
	), "utf8")) as Readonly<{
		source: Readonly<{ path: string }>
		recallArms: ReadonlyArray<Readonly<{
			scientific: Readonly<{ arm: string; additions: ReadonlyArray<Readonly<{ key: string }>> }>
		}>>
	}>
	const selected = historical.recallArms.find(({ scientific }) =>
		scientific.arm === "widened-field-hypothesis-retention")
	assert.ok(selected)
	const source = new URL(`../../${historical.source.path}`, import.meta.url)
	const candidate = extractAlbumArtworkPaletteV2074Details(await loadNativeImage(await readFile(source)))

	assert.deepEqual(candidate.audit.additions.map(({ key }) => key),
		selected.scientific.additions.map(({ key }) => key))
})
