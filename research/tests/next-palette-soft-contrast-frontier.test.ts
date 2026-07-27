import assert from "node:assert/strict"
import test from "node:test"
import {
	buildNextPaletteSoftContrastFrontier,
	NEXT_PALETTE_SOFT_CONTRAST_FRONTIER_POLICY,
	NEXT_PALETTE_SOFT_CONTRAST_FRONTIER_VERSION,
} from "../src/next-palette-soft-contrast-frontier.ts"
import type { Palette, RawImage, RGB, RoleColor } from "../src/types.ts"

function imageFixture(): RawImage {
	const width = 24
	const height = 24
	const colors: RGB[] = [
		[18, 24, 42],
		[42, 67, 105],
		[230, 216, 158],
		[207, 78, 42],
	]
	const data = new Uint8Array(width * height * 3)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const color = colors[(x >= width / 2 ? 1 : 0) + (y >= height / 2 ? 2 : 0)]
			data.set(color, (y * width + x) * 3)
		}
	}
	return { width, height, data }
}

function role(rgb: RGB): RoleColor {
	return {
		rgb,
		hex: `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`,
		generated: false,
		sourceDistance: 0,
	}
}

function paletteFixture(): Palette {
	return {
		background: role([18, 24, 42]),
		foreground: role([230, 216, 158]),
		surface: role([42, 67, 105]),
		accent: role([207, 78, 42]),
		gradient: { isGradient: true, confidence: 1, coverage: 1, continuity: 1, coherence: 1 },
		score: 1,
		metrics: {
			foregroundContrast: 1,
			foregroundSurfaceContrast: 1,
			accentContrast: 1,
			accentSurfaceContrast: 1,
			minimumRoleDistance: 1,
			meanSourceDistance: 0,
			meanReconstructionError: 0,
		},
	}
}

test("soft contrast frontier is read-only, source exact, deterministic, and floor free", () => {
	const image = imageFixture()
	const palette = paletteFixture()
	const before = JSON.stringify(palette)
	const first = buildNextPaletteSoftContrastFrontier(image, palette)
	const second = buildNextPaletteSoftContrastFrontier(image, palette)

	assert.deepEqual(first, second)
	assert.equal(JSON.stringify(palette), before)
	assert.equal(first.diagnosticVersion, NEXT_PALETTE_SOFT_CONTRAST_FRONTIER_VERSION)
	assert.equal(first.policy, NEXT_PALETTE_SOFT_CONTRAST_FRONTIER_POLICY)
	assert.equal(first.policy.fixedApcaFloorEntersAdmission, false)
	assert.equal(first.policy.fixedApcaFloorEntersFrontierMembership, false)
	assert.equal(first.alternatives.filter((alternative) => alternative.generated).length, 2)
	assert.equal(first.alternatives.filter((alternative) => !alternative.generated).length,
		first.perception.candidateCount)
	assert.ok(first.frontiers.foreground.length > 0)
	assert.ok(first.frontiers.accent.length > 0)

	for (const alternative of first.alternatives) {
		assert.ok(Number.isFinite(alternative.contrast.onBackground.signedLc))
		assert.ok(Number.isFinite(alternative.contrast.onSurface.signedLc))
		assert.equal(alternative.contrast.onBackground.magnitude,
			Math.abs(alternative.contrast.onBackground.signedLc))
		assert.equal(alternative.contrast.onSurface.magnitude,
			Math.abs(alternative.contrast.onSurface.signedLc))
		if (alternative.generated) {
			assert.equal(alternative.provenance.kind, "generated-authorized")
			assert.equal(alternative.membership.field, false)
			continue
		}
		assert.equal(alternative.provenance.kind, "source-exact")
		const pixel = alternative.provenance.representativePixelIndex!
		assert.deepEqual(alternative.rgb, [...image.data.subarray(pixel * 3, pixel * 3 + 3)])
		assert.ok(alternative.legacyPolicy["next-palette-0.4"].foreground?.enumerated)
		assert.ok(alternative.legacyPolicy["next-palette-0.4"].accent?.enumerated)
	}
})
