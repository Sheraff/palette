import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { extractPalette } from "../src/extract.ts"
import { loadImage } from "../src/image.ts"
import { extractNextPaletteIncumbentAccent } from "../src/next-palette-incumbent-accent.ts"
import {
	extractNextPaletteNarrowedAccent,
	NEXT_PALETTE_NARROWED_ACCENT_ALGORITHM_VERSION,
	NEXT_PALETTE_NARROWED_ACCENT_POLICY,
} from "../src/next-palette-narrowed-accent.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))

async function extract(file: string) {
	const image = await loadImage(await readFile(`${projectRoot}/${file}`))
	return {
		canonical: extractPalette(image).methods.spatial,
		predecessor: extractNextPaletteIncumbentAccent(image),
		narrowed: extractNextPaletteNarrowedAccent(image),
	}
}

test("narrowed accent preserves a reviewed connected-family improvement", async () => {
	const { canonical, predecessor, narrowed } = await extract(
		"00/ab67616d0000b27300001b7dc13511d828fe5536.jpg",
	)

	assert.equal(canonical.accent.hex, "#99a4e4")
	assert.equal(predecessor.palette.accent.hex, "#d8d418")
	assert.equal(narrowed.palette.accent.hex, "#d8d418")
	assert.equal(narrowed.certificate.algorithmVersion, NEXT_PALETTE_NARROWED_ACCENT_ALGORITHM_VERSION)
	assert.equal(narrowed.certificate.policy, NEXT_PALETTE_NARROWED_ACCENT_POLICY)
	assert.equal(narrowed.certificate.selected.changed, true)
	assert.deepEqual(narrowed.certificate.failedGuards, [])
	assert.deepEqual(narrowed.palette.background, canonical.background)
	assert.deepEqual(narrowed.palette.foreground, canonical.foreground)
	assert.deepEqual(narrowed.palette.surface, canonical.surface)
	assert.deepEqual(narrowed.palette.gradient, canonical.gradient)
})

test("narrowed accent rejects perceptual collapse with a frozen field", async () => {
	const { canonical, predecessor, narrowed } = await extract(
		"00/ab67616d0000b2730000076231b78e8e8ea5168c.jpg",
	)

	assert.equal(predecessor.certificate.selected.changed, true)
	assert.ok(predecessor.palette.accent.hex !== canonical.accent.hex)
	assert.deepEqual(narrowed.palette, canonical)
	assert.equal(narrowed.certificate.guards.roleSeparation, false)
	assert.ok(narrowed.certificate.minimumDistanceFromFrozenRole < 0.025)
	assert.equal(narrowed.certificate.selected.suppressedPredecessor, true)
})

test("narrowed accent removes foreground collapse", async () => {
	const { canonical, predecessor, narrowed } = await extract("images/ybbb.jpg")

	assert.equal(predecessor.certificate.selected.changed, true)
	assert.equal(predecessor.palette.accent.hex, predecessor.palette.foreground.hex)
	assert.deepEqual(narrowed.palette, canonical)
	assert.equal(narrowed.certificate.guards.connectedFamilyOnly, false)
	assert.equal(narrowed.certificate.guards.roleSeparation, false)
})

test("narrowed accent preserves the incumbent for a large weak-evidence move", async () => {
	const { canonical, predecessor, narrowed } = await extract(
		"00/ab67616d0000b27300007a9fd0edca5330d06caf.jpg",
	)

	assert.equal(predecessor.certificate.selected.changed, true)
	assert.ok(predecessor.certificate.selected.accentDistance > 0.2)
	assert.ok(predecessor.certificate.selected.identitySupportDelta < 0.02)
	assert.deepEqual(narrowed.palette, canonical)
	assert.equal(narrowed.certificate.guards.largeMoveIdentityGain, false)
	assert.equal(narrowed.certificate.selected.suppressedPredecessor, true)
})
