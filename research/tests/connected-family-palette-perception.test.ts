import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
	CONNECTED_FAMILY_PALETTE_PERCEPTION_VERSION,
	perceivePaletteImageWithConnectedFamilies,
} from "../src/connected-family-palette-perception.ts"
import { loadImage } from "../src/image.ts"
import { perceivePaletteImage } from "../src/palette-perception.ts"
import type { RawImage, RGB } from "../src/types.ts"

const projectRoot = fileURLToPath(new URL("../..", import.meta.url))
const goldTypography = "00/ab67616d0000b27300001b7dc13511d828fe5536.jpg"

function image(width: number, height: number, colorAt: (x: number, y: number) => RGB): RawImage {
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) data.set(colorAt(x, y), (y * width + x) * 3)
	}
	return { width, height, data }
}

test("connected family perception retains the field partition and adds overlay-only source families", async () => {
	const source = await loadImage(await readFile(`${projectRoot}/${goldTypography}`))
	const base = perceivePaletteImage(source)
	const result = perceivePaletteImageWithConnectedFamilies(source)
	const reserves = result.candidates.filter((candidate) => candidate.construction === "connected-family-reserve")
	const baseKeys = base.candidates.map((candidate) => `${candidate.id}:${candidate.hex}:${candidate.population}`).sort()
	const integratedBaseKeys = result.candidates.filter((candidate) => candidate.construction !== "connected-family-reserve")
		.map((candidate) => `${candidate.id}:${candidate.hex}:${candidate.population}`).sort()

	assert.equal(result.version, CONNECTED_FAMILY_PALETTE_PERCEPTION_VERSION)
	assert.deepEqual(integratedBaseKeys, baseKeys)
	assert.ok(reserves.some((candidate) => candidate.hex === "#babb2d"))
	assert.ok(reserves.every((candidate) => candidate.fieldRoleAllowed === false))
	assert.ok(reserves.every((candidate) => candidate.familySpatial === candidate.spatial))
	const records = new Map(result.candidateRecords.map((record) => [record.candidateId, record]))
	const fieldSources = result.candidates.filter((candidate) => candidate.fieldRoleAllowed)
	for (let pixel = 0; pixel < source.width * source.height; pixel++) {
		assert.equal(fieldSources.reduce((sum, candidate) => sum + records.get(candidate.id)!.mask[pixel], 0), 1)
	}
	assert.deepEqual(result, perceivePaletteImageWithConnectedFamilies(source))
})

test("isolated chromatic specks do not enter integrated perception", () => {
	const source = image(100, 100, (x, y) => (x * 37 + y * 61) % 97 === 0 ? [245, 70, 150] : [16, 18, 22])
	const result = perceivePaletteImageWithConnectedFamilies(source)

	assert.equal(result.candidates.some((candidate) => candidate.construction === "connected-family-reserve"), false)
})
