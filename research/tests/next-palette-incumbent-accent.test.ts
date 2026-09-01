import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { extractPalette } from "../src/extract.ts"
import { loadImage } from "../src/image.ts"
import {
	extractNextPaletteIncumbentAccent,
	NEXT_PALETTE_INCUMBENT_ACCENT_ALGORITHM_VERSION,
	NEXT_PALETTE_INCUMBENT_ACCENT_POLICY,
} from "../src/next-palette-incumbent-accent.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const targetFile = "00/ab67616d0000b27300001b7dc13511d828fe5536.jpg"

test("incumbent-preserving accent selects the faithful local representative and freezes every collateral role", async () => {
	const bytes = await readFile(`${projectRoot}/${targetFile}`)
	assert.equal(createHash("sha256").update(bytes).digest("hex"),
		"0770d36aab0b3de441354d34221ea1f6af1fd0ad2c0f8f6476f9e16de73bde93")
	const image = await loadImage(bytes)
	const canonical = extractPalette(image)
	const first = extractNextPaletteIncumbentAccent(image)
	const second = extractNextPaletteIncumbentAccent(image)

	assert.deepEqual(first, second)
	assert.equal(first.certificate.algorithmVersion, NEXT_PALETTE_INCUMBENT_ACCENT_ALGORITHM_VERSION)
	assert.equal(first.certificate.policy, NEXT_PALETTE_INCUMBENT_ACCENT_POLICY)
	assert.equal(first.certificate.policy.fixedApcaAdmissionFloor, null)
	assert.equal(canonical.methods.spatial.accent.hex, "#99a4e4")
	assert.equal(first.palette.accent.hex, "#d8d418")
	assert.deepEqual(first.palette.background, canonical.methods.spatial.background)
	assert.deepEqual(first.palette.foreground, canonical.methods.spatial.foreground)
	assert.deepEqual(first.palette.surface, canonical.methods.spatial.surface)
	assert.deepEqual(first.palette.gradient, canonical.methods.spatial.gradient)
	assert.equal(first.palette.score, canonical.methods.spatial.score)
	assert.equal(first.certificate.selected.changed, true)
	assert.equal(first.certificate.selected.material, true)
	assert.ok(first.certificate.selected.identitySupportDelta > 0)
	assert.ok(first.certificate.selected.backgroundContrastMagnitudeDelta >= 0)
	assert.equal(first.certificate.options.filter((option) => option.eligible).length, 1)
	const selected = first.certificate.options.find((option) => option.optionId === first.certificate.selected.optionId)
	assert.ok(selected)
	assert.deepEqual(selected.failedGuards, [])
	assert.equal(selected.provenance.kind, "connected-family-local")
	assert.ok(selected.provenance.supportMaskSha256s.includes(
		"873b11e05497516e89b9d605798dcf7fe6018d65db5100c11574fa601ab9bab6"))
	assert.ok(selected.provenance.representativePixelIndices.includes(25874))
	const offset = 25874 * 3
	assert.deepEqual(selected.rgb, [...image.data.subarray(offset, offset + 3)])
	assert.ok(first.certificate.options.every((option) => Number.isFinite(option.contrast.background.signedLc) &&
		Number.isFinite(option.contrast.surface.signedLc)))
	assert.ok(new Set([first.palette.background.hex, first.palette.foreground.hex, first.palette.surface.hex,
		first.palette.accent.hex]).size <= 4)
})

test("a source incumbent without exact comparison evidence is preserved", async () => {
	const image = await loadImage(await readFile(
		`${projectRoot}/00/ab67616d00001e02000045168a00c9fa6fcc59da.jpg`,
	))
	const canonical = extractPalette(image).methods.spatial
	const result = extractNextPaletteIncumbentAccent(image)

	assert.equal(result.certificate.incumbent.evidenceAvailable, false)
	assert.deepEqual(result.palette, canonical)
	assert.equal(result.certificate.selected.changed, false)
	assert.ok(result.certificate.options.every((option) => !option.guards.identityStronger && !option.eligible))
})
