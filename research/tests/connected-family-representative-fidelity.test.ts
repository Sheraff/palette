import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { okDistance } from "../src/color.ts"
import {
	buildConnectedFamilyRepresentativeFidelity,
	CONNECTED_FAMILY_REPRESENTATIVE_FIDELITY_VERSION,
} from "../src/connected-family-representative-fidelity.ts"
import { perceivePaletteImageWithConnectedFamilies } from "../src/connected-family-palette-perception.ts"
import { loadImage } from "../src/image.ts"
import { buildConnectedFamilyPaletteRelationGraph } from "../src/palette-relation-graph.ts"
import { perceivePaletteImage } from "../src/palette-perception.ts"
import type { RawImage, RGB } from "../src/types.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const targetFile = "00/ab67616d0000b27300001b7dc13511d828fe5536.jpg"
const targetSourceSha256 = "0770d36aab0b3de441354d34221ea1f6af1fd0ad2c0f8f6476f9e16de73bde93"
const targetFamilyMaskSha256 = "f8c6cdcc12c31698f427a18f48879df2bad0c6ebbd515b60139f7a12ff98f5fb"

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function image(width: number, height: number, colorAt: (x: number, y: number) => RGB): RawImage {
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) data.set(colorAt(x, y), (y * width + x) * 3)
	}
	return { width, height, data }
}

test("representative fidelity exposes exact local modes without changing family or field evidence", async () => {
	const source = await readFile(`${projectRoot}/${targetFile}`)
	assert.equal(sha256(source), targetSourceSha256)
	const normalized = await loadImage(source)
	const perception = perceivePaletteImage(normalized)
	const beforeCandidates = structuredClone(perception.candidates)
	const beforeRecords = perception.candidateRecords.map((record) => ({
		candidateId: record.candidateId,
		binIds: [...record.binIds],
		maskSha256: sha256(record.mask),
		representativePixelIndex: record.representativePixelIndex,
	}))
	const first = buildConnectedFamilyRepresentativeFidelity(perception)
	const second = buildConnectedFamilyRepresentativeFidelity(perception)

	assert.deepEqual(first, second)
	assert.equal(first.version, CONNECTED_FAMILY_REPRESENTATIVE_FIDELITY_VERSION)
	assert.deepEqual(perception.candidates, beforeCandidates)
	assert.deepEqual(perception.candidateRecords.map((record) => ({
		candidateId: record.candidateId,
		binIds: [...record.binIds],
		maskSha256: sha256(record.mask),
		representativePixelIndex: record.representativePixelIndex,
	})), beforeRecords)
	assert.equal(first.invariants.representativesNotPassedToRoleSolver, true)
	assert.equal(first.invariants.representativesOverlayOnly, true)

	const family = first.families.find((entry) => entry.maskSha256 === targetFamilyMaskSha256)
	assert.ok(family)
	assert.equal(family.anchorDegrees, 90)
	assert.equal(family.availabilityRepresentative.representativePixelIndex, 25411)
	assert.equal(family.availabilityRepresentative.hex, "#babb2d")
	assert.deepEqual(family.componentFirstPixelIndices, [24286])
	assert.equal(sha256(family.mask), targetFamilyMaskSha256)
	assert.equal(family.components.length, 1)
	const component = family.components[0]
	assert.equal(component.firstPixelIndex, 24286)
	assert.equal(component.pixelCount, 145)
	assert.equal(sha256(component.mask), component.maskSha256)
	const bright = component.representatives.find((representative) => representative.sourceRegionId === 143)
	const shadow = component.representatives.find((representative) => representative.sourceRegionId === 144)
	assert.ok(bright)
	assert.ok(shadow)
	assert.equal(bright.supportPixelCount, 92)
	assert.equal(bright.supportMaskSha256, "873b11e05497516e89b9d605798dcf7fe6018d65db5100c11574fa601ab9bab6")
	assert.equal(bright.representativePixelIndex, 25874)
	assert.equal(bright.hex, "#d8d418")
	assert.equal(shadow.supportPixelCount, 53)
	assert.equal(shadow.supportMaskSha256, "d5c2d6f349600c04a0196da95f7dbaf57213ccfe5aec4802c0fdecd1af2026ed")
	assert.equal(shadow.representativePixelIndex, 25636)
	assert.equal(shadow.hex, "#888a3d")
	assert.ok(bright.distanceToCenter < okDistance(family.availabilityRepresentative.lab, bright.center))

	const componentUnion = new Uint8Array(family.mask.length)
	for (const current of family.components) {
		for (let pixel = 0; pixel < current.mask.length; pixel++) {
			assert.equal(componentUnion[pixel] & current.mask[pixel], 0)
			componentUnion[pixel] |= current.mask[pixel]
		}
		for (const representative of current.representatives) {
			assert.equal(representative.membership.field, false)
			assert.equal(representative.membership.overlay, true)
			assert.equal(current.mask[representative.representativePixelIndex], 1)
			assert.equal(representative.supportMask[representative.representativePixelIndex], 1)
			const offset = representative.representativePixelIndex * 3
			assert.deepEqual(representative.rgb, [...normalized.data.subarray(offset, offset + 3)])
			assert.equal(sha256(representative.supportMask), representative.supportMaskSha256)
		}
	}
	assert.deepEqual(componentUnion, family.mask)

	const integrated = perceivePaletteImageWithConnectedFamilies(normalized)
	const graph = buildConnectedFamilyPaletteRelationGraph(integrated)
	const fieldIds = new Set(graph.fieldNodeIds)
	const reserveIds = new Set(graph.nodes.filter((node) => node.construction === "connected-family-reserve")
		.map((node) => node.id))
	assert.ok([...reserveIds].every((id) => !fieldIds.has(id)))
	assert.ok(graph.edges.filter((edge) => reserveIds.has(edge.fromId) || reserveIds.has(edge.toId))
		.every((edge) => edge.fieldRelation === undefined))
	const lloydIds = new Set(integrated.candidates.filter((candidate) => candidate.construction === "lloyd-cluster")
		.map((candidate) => candidate.id))
	const coverage = new Uint8Array(normalized.width * normalized.height)
	for (const record of integrated.candidateRecords) {
		if (!lloydIds.has(record.candidateId)) continue
		for (let pixel = 0; pixel < coverage.length; pixel++) coverage[pixel] += record.mask[pixel]
	}
	assert.ok(coverage.every((value) => value === 1))
})

test("fidelity cannot promote isolated equal-histogram specks", () => {
	const pink: RGB = [245, 70, 150]
	const black: RGB = [16, 18, 22]
	const isolatedPixels = new Set(Array.from({ length: 32 }, (_, index) => `${(index * 29) % 100},${(index * 47) % 100}`))
	const isolated = image(100, 100, (x, y) => isolatedPixels.has(`${x},${y}`) ? pink : black)
	const result = buildConnectedFamilyRepresentativeFidelity(perceivePaletteImage(isolated))

	assert.equal(result.families.some((family) => family.availabilityRepresentative.hex === "#f54696"), false)
})
