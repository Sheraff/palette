import assert from "node:assert/strict"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { UI_ACCENT_CONTRAST_PROFILE } from "../src/accent-contrast.ts"
import { extractChromaticRolePalette } from "../src/chromatic-role-extract.ts"
import { apcaContrast } from "../src/color.ts"
import {
	CONFIGURED_EXTRACTION_VERSION_PREFIX,
	configuredExtractionId,
	extractConfiguredPalette,
	extractConfiguredPaletteWithContext,
} from "../src/configured-extract.ts"
import { extractPalette } from "../src/extract.ts"
import {
	DEVELOPMENT_FOREGROUND_CONTRAST_PROFILE,
	defineForegroundContrastProfile,
} from "../src/foreground-contrast.ts"
import { loadImage } from "../src/image.ts"

const projectRoot = fileURLToPath(new URL("../..", import.meta.url))
const source = join(projectRoot, "images/artofficial.jpg")
const unsafeAccentSource = join(projectRoot, "images/black.jpg")
const safeAccentSource = join(projectRoot, "00/00007e976f2fb1819d1ec7e0cc2869f39d397ba3.jpg")
const typographyAccentSource = join(projectRoot, "00/ab67616d0000b2730000c4e4d278f49bbc995440.jpg")
const identityAccentSources = [
	{ file: "birdsofprey.jpg", accent: "#d1419f" },
	{ file: "ybbb.jpg", accent: "#0b0b0d" },
] as const

test("configured extraction has a profile-bound identity and preserves canonical non-spatial methods", async () => {
	const image = await loadImage(source)
	const profile = DEVELOPMENT_FOREGROUND_CONTRAST_PROFILE
	const options = { foregroundContrastProfile: profile }
	const canonical = extractPalette(image)
	const direct = extractChromaticRolePalette(image, profile).extraction
	const configured = extractConfiguredPaletteWithContext(image, options)

	assert.equal(configured.configuration.id, configuredExtractionId(options))
	assert.equal(configured.extraction.version,
		`${CONFIGURED_EXTRACTION_VERSION_PREFIX}${configured.configuration.id.slice(0, 16)}`)
	assert.notEqual(configured.extraction.version, canonical.version)
	assert.deepEqual(configured.extraction.methods, direct.methods)
	assert.deepEqual(configured.extraction.candidates, direct.candidates)
	assert.deepEqual(configured.extraction.methods.expressive, canonical.methods.expressive)
	assert.deepEqual(configured.extraction.methods.quantized, canonical.methods.quantized)
	assert.deepEqual(configured.configuration.foregroundContrastProfile, profile)
	assert.equal(Object.isFrozen(configured.configuration.foregroundContrastProfile), true)
})

test("configured extraction identity is stable for equivalent profiles", async () => {
	const image = await loadImage(source)
	const firstOptions = { foregroundContrastProfile: DEVELOPMENT_FOREGROUND_CONTRAST_PROFILE }
	const secondOptions = {
		foregroundContrastProfile: defineForegroundContrastProfile({
			ordinary: { backgroundMinimum: 3.5, surfaceMinimum: 3 },
			strongTypography: { backgroundMinimum: 3, surfaceMinimum: 2.5 },
			generatedFallback: { backgroundMinimum: 4.5, surfaceMinimum: 4.5 },
			sourceForegroundPreferenceMinimum: 3.5,
		}),
	}
	const first = extractConfiguredPalette(image, firstOptions)
	const second = extractConfiguredPalette(image, secondOptions)

	assert.equal(configuredExtractionId(firstOptions), configuredExtractionId(secondOptions))
	assert.equal(first.version, second.version)
	assert.deepEqual(first.methods, second.methods)
	assert.deepEqual(first.candidates, second.candidates)
})

test("configured extraction rejects missing or additional options", async () => {
	const image = await loadImage(source)
	assert.throws(() => extractConfiguredPalette(image, {} as never), /options are invalid/)
	assert.throws(() => extractConfiguredPalette(image, {
		foregroundContrastProfile: DEVELOPMENT_FOREGROUND_CONTRAST_PROFILE,
		extra: true,
	} as never), /options are invalid/)
	assert.throws(() => extractConfiguredPalette(image, {
		typographyChromaticAccent: true,
	}), /options are invalid/)
	assert.throws(() => extractConfiguredPalette(image, {
		accentContrastProfile: UI_ACCENT_CONTRAST_PROFILE,
		typographyChromaticAccent: false,
	} as never), /options are invalid/)
})

test("configured UI accent extraction corrects an unsafe incumbent within four colors", async () => {
	const image = await loadImage(unsafeAccentSource)
	const canonical = extractPalette(image)
	const configured = extractConfiguredPaletteWithContext(image, {
		accentContrastProfile: UI_ACCENT_CONTRAST_PROFILE,
	})
	const palette = configured.extraction.methods.spatial

	assert.notDeepEqual(palette, canonical.methods.spatial)
	assert.ok(Math.abs(apcaContrast(palette.accent.rgb, palette.background.rgb)) >=
		UI_ACCENT_CONTRAST_PROFILE.backgroundMinimumLc)
	assert.ok(Math.abs(apcaContrast(palette.accent.rgb, palette.surface.rgb)) >=
		UI_ACCENT_CONTRAST_PROFILE.surfaceMinimumLc)
	assert.ok(new Set([
		palette.background.hex,
		palette.foreground.hex,
		palette.surface.hex,
		palette.accent.hex,
	]).size <= 4)
	assert.equal(configured.jointCertificate?.selectedAdmission, "accent-safety-correction")
	assert.equal(configured.jointCertificate?.accentSafety?.selectedPass, true)
	assert.deepEqual(configured.configuration.accentContrastProfile, UI_ACCENT_CONTRAST_PROFILE)
	assert.deepEqual(configured.extraction.methods.expressive, canonical.methods.expressive)
	assert.deepEqual(configured.extraction.methods.quantized, canonical.methods.quantized)
})

test("configured UI accent extraction preserves a safe canonical incumbent exactly", async () => {
	const image = await loadImage(safeAccentSource)
	const canonical = extractPalette(image)
	const configured = extractConfiguredPaletteWithContext(image, {
		accentContrastProfile: UI_ACCENT_CONTRAST_PROFILE,
	})

	assert.deepEqual(configured.extraction.methods, canonical.methods)
	assert.deepEqual(configured.extraction.candidates, canonical.candidates)
	assert.equal(configured.jointCertificate?.selectedAdmission, "preserve")
	assert.equal(configured.jointCertificate?.accentSafety?.incumbentPass, true)
	assert.equal(configured.jointCertificate?.accentSafety?.selectedPass, true)
})

test("configured APCA profile preserves calibrated identity accents", async () => {
	for (const expected of identityAccentSources) {
		const image = await loadImage(join(projectRoot, "images", expected.file))
		const canonical = extractPalette(image)
		const configured = extractConfiguredPaletteWithContext(image, {
			accentContrastProfile: UI_ACCENT_CONTRAST_PROFILE,
		})
		const palette = configured.extraction.methods.spatial

		assert.equal(canonical.methods.spatial.accent.hex, expected.accent)
		assert.deepEqual(palette, canonical.methods.spatial)
		assert.ok(Math.abs(apcaContrast(palette.accent.rgb, palette.background.rgb)) >=
			UI_ACCENT_CONTRAST_PROFILE.backgroundMinimumLc)
		assert.ok(Math.abs(apcaContrast(palette.accent.rgb, palette.surface.rgb)) >=
			UI_ACCENT_CONTRAST_PROFILE.surfaceMinimumLc)
		assert.equal(configured.jointCertificate?.selectedAdmission, "preserve")
	}
})

test("configured typography accent admits the certified family through complete APCA-constrained search", async () => {
	const image = await loadImage(typographyAccentSource)
	const canonical = extractPalette(image)
	const options = {
		accentContrastProfile: UI_ACCENT_CONTRAST_PROFILE,
		typographyChromaticAccent: true as const,
	}
	const configured = extractConfiguredPaletteWithContext(image, options)
	const palette = configured.extraction.methods.spatial
	const availability = configured.typographyChromaticAccent

	assert.equal(canonical.methods.spatial.accent.hex, "#838383")
	assert.equal(palette.accent.hex, "#e3bbbb")
	assert.deepEqual(palette.background, canonical.methods.spatial.background)
	assert.deepEqual(palette.foreground, canonical.methods.spatial.foreground)
	assert.deepEqual(palette.surface, canonical.methods.spatial.surface)
	assert.deepEqual(palette.gradient, canonical.methods.spatial.gradient)
	assert.ok(Math.abs(apcaContrast(palette.accent.rgb, palette.background.rgb)) >=
		UI_ACCENT_CONTRAST_PROFILE.backgroundMinimumLc)
	assert.ok(Math.abs(apcaContrast(palette.accent.rgb, palette.surface.rgb)) >=
		UI_ACCENT_CONTRAST_PROFILE.surfaceMinimumLc)
	assert.ok(new Set([palette.background.hex, palette.foreground.hex, palette.surface.hex, palette.accent.hex]).size <= 4)
	assert.equal(configured.configuration.typographyChromaticAccent, true)
	assert.equal(configured.configuration.id, configuredExtractionId(options))
	assert.notEqual(configured.configuration.id, configuredExtractionId({
		accentContrastProfile: UI_ACCENT_CONTRAST_PROFILE,
	}))
	assert.deepEqual(availability?.availableSupplementIds, [12])
	assert.deepEqual(availability?.admittedSupplementIds, [12])
	assert.deepEqual(availability?.selectedSupplementIds, [12])
	assert.deepEqual(availability?.emittedSupplementIds, [12])
	assert.deepEqual(availability?.rejectionReasons, [])
	assert.equal(configured.jointCertificate?.selectionRule, "required-accent-safety-first-minimax-regret")
	assert.equal(configured.jointCertificate?.requiredAccentSelected, true)
	assert.equal(configured.jointCertificate?.selected.roleChanges, 1)
	assert.equal(configured.extraction.diagnostics.candidateCount, canonical.diagnostics.candidateCount + 1)
	assert.deepEqual(configured.extraction.methods.expressive, canonical.methods.expressive)
	assert.deepEqual(configured.extraction.methods.quantized, canonical.methods.quantized)
})

test("configured typography option has no palette effect without a certified family", async () => {
	const image = await loadImage(source)
	const baseline = extractConfiguredPaletteWithContext(image, {
		accentContrastProfile: UI_ACCENT_CONTRAST_PROFILE,
	})
	const configured = extractConfiguredPaletteWithContext(image, {
		accentContrastProfile: UI_ACCENT_CONTRAST_PROFILE,
		typographyChromaticAccent: true,
	})

	assert.deepEqual(configured.extraction.methods, baseline.extraction.methods)
	assert.deepEqual(configured.extraction.candidates, baseline.extraction.candidates)
	assert.deepEqual(configured.typographyChromaticAccent, {
		availabilityVersion: "region-typography-candidate-availability-0.2.0-poc.1",
		availableSupplementIds: [],
		admittedSupplementIds: [],
		selectedSupplementIds: [],
		emittedSupplementIds: [],
		rejectionReasons: [],
	})
})
