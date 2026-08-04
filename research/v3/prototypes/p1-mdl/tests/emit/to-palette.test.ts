/**
 * `toPalette()` + `feasibility()` — a hand-built legal configuration, round-tripped through the real
 * contract against a real corpus image.
 *
 * **Why a real image and not a synthetic one.** Invariant 2's existence clause is the whole reason
 * `Configuration` carries triples rather than arbitrary colours: every published colour has to be an
 * exact pixel of the input. A synthetic 2×2 test image would make that clause trivially true and
 * would test nothing about it. The configuration below is four exact pixels of one demo-20 cover,
 * plus one exact pixel as the interior gradient stop, and the test decodes that cover and hands the
 * real pixel data to `feasibility()`.
 *
 * **Provenance of the configuration.** `00/ab67616d00001e0200000ee5a62175fc8d58e0af.jpg` (sha-256
 * `20867116…e2ca`, 300×300 jpeg). The five triples were found by a farthest-point sweep over the
 * cover's 250 most common colours, keeping the first quadruple `validatePalette` accepted. They are
 * **not** a proposal about what a good palette for this cover is, and nothing about P1's mechanism
 * produced them — they are the cheapest legal point in the feasible set that exercises all five
 * invariants at once. Any legal quintuple would do.
 */

import assert from "node:assert/strict"
import { test } from "node:test"
import sharp from "sharp"
import { CONTRACT_VERSION } from "../../../../src/contract/constants.ts"
import { rgbToHex } from "../../../../src/contract/color.ts"
import type { PixelAccessor, Rgb8, TransparencyReport } from "../../../../src/contract/types.ts"
import { feasibility } from "../../src/emit/feasibility.ts"
import { ALGORITHM_VERSIONS, PREPROCESSING_VERSION, toPalette } from "../../src/emit/palette.ts"
import { sourceMetaOf } from "../../src/emit/source-meta.ts"
import { demo20Path, readSetFile, resolveCorpusPath } from "../../src/emit/paths.ts"
import { ConfigurationError, type Configuration } from "../../src/emit/types.ts"

/**
 * The cover this test runs on, corpus-relative. Line 7 of `data/devloop/sets/demo-20.txt`.
 * `[INHERITED]` — chosen from the dev loop's own demonstration set rather than invented, so this test
 * runs on exactly the data everything else in the loop runs on.
 */
const IMAGE = "00/ab67616d00001e0200000ee5a62175fc8d58e0af.jpg"

/** sha-256 of the file's bytes, as measured. Asserted so a silently different file fails loudly. */
const IMAGE_SHA256 = "20867116bc43fd68a11f0abf3d67b4a8324c8c5676b53ce784887c1c4f68e2ca"

/** Five exact pixels of `IMAGE`. See the header for how they were found and what they are not. */
const LEGAL: Configuration = {
	background: [87, 96, 93],
	surface: [227, 211, 222],
	foreground: [27, 24, 17],
	accent: [55, 58, 51],
	gradient: true,
	stops: [
		{ rgb: [87, 96, 93], position: 0 },
		{ rgb: [73, 82, 77], position: 0.5 },
		{ rgb: [227, 211, 222], position: 1 },
	],
	surfaceCollapsed: false,
	accentCollapsed: false,
	escape: null,
}

type Decoded = {
	path: string
	source: PixelAccessor
	transparency: TransparencyReport
	width: number
	height: number
}

/**
 * Decode the cover into a `PixelAccessor`.
 *
 * This is a *test fixture*, not the measurement layer: it is the smallest thing that satisfies
 * `PixelSource` so invariant 2 has something to check against. `src/measure/` owns real decoding.
 */
async function decode(): Promise<Decoded> {
	const path = resolveCorpusPath(IMAGE)
	assert.notEqual(
		path,
		null,
		`corpus image ${IMAGE} not found on disk. This test needs the artwork shards, which live in the primary checkout and not in a git worktree — see src/emit/paths.ts. It is deliberately a failure and not a skip.`,
	)
	const { data, info } = await sharp(path as string)
		.toColourspace("srgb")
		.raw()
		.toBuffer({ resolveWithObject: true })
	const channels = info.channels
	let hasTransparentPixels = false
	if (channels === 4) {
		for (let offset = 3; offset < data.length; offset += 4) {
			if (data[offset] !== 255) {
				hasTransparentPixels = true
				break
			}
		}
	}
	return {
		path: path as string,
		width: info.width,
		height: info.height,
		source: {
			width: info.width,
			height: info.height,
			getPixel(x: number, y: number): Rgb8 {
				const offset = (y * info.width + x) * channels
				return [data[offset], data[offset + 1], data[offset + 2]]
			},
		},
		transparency: { hasAlphaChannel: channels === 4, hasTransparentPixels },
	}
}

test("the demo-20 set resolves and contains the image this test is built on", () => {
	const { found, missing } = readSetFile(demo20Path())
	assert.equal(missing.length, 0, `unresolved demo-20 entries: ${missing.join(", ")}`)
	assert.equal(found.length, 20)
	assert.ok(found.some((path) => path.endsWith(IMAGE)))
})

test("toPalette fills in the whole contract, and every field is the configuration's or the meta's", async () => {
	const decoded = await decode()
	const meta = await sourceMetaOf(decoded.path, ALGORITHM_VERSIONS.p1ap)
	assert.equal(meta.inputContentHash, IMAGE_SHA256)

	const palette = toPalette(LEGAL, meta)

	assert.equal(palette.contractVersion, CONTRACT_VERSION)
	assert.equal(palette.metadata.algorithmVersion, "p1ap-0.1.0")
	assert.equal(palette.metadata.preprocessingVersion, PREPROCESSING_VERSION)
	assert.equal(palette.metadata.preprocessingVersion, "sharp-0.33.5/srgb/no-resample")
	assert.equal(palette.metadata.inputContentHash, IMAGE_SHA256)
	assert.equal(palette.metadata.sourceRendition.path, decoded.path)
	assert.equal(palette.metadata.sourceRendition.format, "jpeg")
	assert.equal(palette.metadata.sourceRendition.width, 300)
	assert.equal(palette.metadata.sourceRendition.height, 300)
	// §1 forbids resampling, so the processed size is the rendition's.
	assert.deepEqual(palette.metadata.processedSize, { width: 300, height: 300 })

	// Colours travel byte for byte — no snapping, no rounding, no repair.
	assert.deepEqual(palette.roles.background.rgb, LEGAL.background)
	assert.deepEqual(palette.roles.surface.rgb, LEGAL.surface)
	assert.deepEqual(palette.roles.foreground.rgb, LEGAL.foreground)
	assert.deepEqual(palette.roles.accent.rgb, LEGAL.accent)
	assert.equal(palette.roles.background.hex, rgbToHex(LEGAL.background))

	// The reviewer's endpoint ruling, as emitted.
	assert.notEqual(palette.gradient, null)
	assert.equal(palette.gradient?.stops.length, 3)
	assert.equal(palette.gradient?.stops[0].color.hex, palette.roles.background.hex)
	assert.equal(palette.gradient?.stops[2].color.hex, palette.roles.surface.hex)
	assert.equal(palette.gradient?.stops[0].position, 0)
	assert.equal(palette.gradient?.stops[2].position, 1)

	assert.deepEqual(palette.collapse, { surfaceCollapsed: false, accentCollapsed: false })
	assert.equal(palette.escape, null)
	// Both floors resolved, never "none": requested 0 resolves to the epsilon, which is not off.
	assert.equal(palette.contrast.minTextContrast.requestedLc, 0)
	assert.ok(palette.contrast.minTextContrast.effectiveRawMagnitude > 0)
	assert.ok(palette.contrast.minAccentContrast.effectiveRawMagnitude > 0)
})

test("the hand-built configuration is feasible, with the image's real pixels supplied", async () => {
	const decoded = await decode()
	const meta = await sourceMetaOf(decoded.path, ALGORITHM_VERSIONS.p1ap)
	const palette = toPalette(LEGAL, meta)

	const report = feasibility(palette, { source: decoded.source, transparency: decoded.transparency })

	assert.deepEqual(report.violations, [], report.violations.map((v) => `${v.code}: ${v.message}`).join("\n"))
	assert.equal(report.valid, true)
	assert.deepEqual(report.factsSupplied, { source: true, transparency: true })
	// I2's exact-source clause ran — the whole reason a real image is used here.
	assert.ok(!report.deferred.includes("I2.source-support"))
	assert.ok(!report.deferred.includes("I5.transparency-report"))
	// Spatial spread has no thresholds and defers permanently. A deferral is never a pass, so
	// `allChecksRan` is false even though the palette is valid.
	assert.deepEqual(report.deferred, ["I2.spatial-spread"])
	assert.equal(report.allChecksRan, false)
})

test("without image facts the source-support and transparency checks defer rather than pass", async () => {
	const decoded = await decode()
	const meta = await sourceMetaOf(decoded.path, ALGORITHM_VERSIONS.p1ap)
	const report = feasibility(toPalette(LEGAL, meta))

	assert.equal(report.valid, true)
	assert.equal(report.allChecksRan, false)
	assert.deepEqual(report.factsSupplied, { source: false, transparency: false })
	assert.ok(report.deferred.includes("I2.source-support"))
	assert.ok(report.deferred.includes("I5.transparency-report"))
	assert.ok(report.deferred.includes("I2.spatial-spread"))
})

test("scorecard mode returns the same verdict plus the report", async () => {
	const decoded = await decode()
	const meta = await sourceMetaOf(decoded.path, ALGORITHM_VERSIONS.p1ap)
	const palette = toPalette(LEGAL, meta)

	const hard = feasibility(palette, { source: decoded.source, transparency: decoded.transparency })
	const scored = feasibility(
		palette,
		{ source: decoded.source, transparency: decoded.transparency },
		{ scorecard: true },
	)

	assert.equal(scored.valid, hard.valid)
	assert.deepEqual(scored.deferred, hard.deferred)
	assert.notEqual(scored.scorecard, null)
	assert.equal(scored.scorecard?.valid, hard.valid)
	assert.ok((scored.scorecard?.totals.judgments ?? 0) > 0)
	assert.equal(scored.scorecard?.totals.violations, 0)
	assert.equal(hard.scorecard, null)
})

test("an invented colour is a violation and not an emitter error — the contract is the judge", async () => {
	const decoded = await decode()
	const meta = await sourceMetaOf(decoded.path, ALGORITHM_VERSIONS.p1ap)
	// A colour chosen to be absent from the artwork. `toPalette` publishes it without complaint.
	const invented: Configuration = { ...LEGAL, accent: [1, 254, 3] }
	const palette = toPalette(invented, meta)
	assert.deepEqual(palette.roles.accent.rgb, [1, 254, 3])

	const report = feasibility(palette, { source: decoded.source, transparency: decoded.transparency })
	assert.equal(report.valid, false)
	assert.ok(report.violations.some((violation) => violation.invariant === "I2"))
})

test("a lying collapse flag reaches the invariants rather than being repaired", async () => {
	const decoded = await decode()
	const meta = await sourceMetaOf(decoded.path, ALGORITHM_VERSIONS.p1ap)

	// Flag set, colours not equal. `toPalette` publishes the contradiction untouched; invariant 1
	// reports it as `I1.collapse-flag-inconsistent`. The emitter recomputing the flag from hex
	// equality would make this class of bug permanently invisible.
	const flagSet: Configuration = { ...LEGAL, surfaceCollapsed: true }
	const withFlagSet = toPalette(flagSet, meta)
	assert.equal(withFlagSet.collapse.surfaceCollapsed, true)
	assert.notEqual(withFlagSet.roles.surface.hex, withFlagSet.roles.background.hex)
	const flagSetReport = feasibility(withFlagSet, { source: decoded.source })
	assert.equal(flagSetReport.valid, false)
	assert.ok(flagSetReport.violations.some((v) => v.code === "I1.collapse-flag-inconsistent"))

	// The other half of invariant 3's "there is no third state": colours exactly equal, flag clear.
	const flagClear: Configuration = { ...LEGAL, gradient: false, surface: LEGAL.background }
	const withFlagClear = toPalette(flagClear, meta)
	assert.equal(withFlagClear.collapse.surfaceCollapsed, false)
	assert.equal(withFlagClear.roles.surface.hex, withFlagClear.roles.background.hex)
	const flagClearReport = feasibility(withFlagClear, { source: decoded.source })
	assert.equal(flagClearReport.valid, false)
	assert.ok(flagClearReport.violations.some((v) => v.code === "I1.collapse-flag-inconsistent"))
	assert.ok(flagClearReport.violations.some((v) => v.code === "I3.collapse-not-sanctioned"))
})

test("toPalette refuses only what has no contract shape: a ramp with fewer than two stops", () => {
	const meta = {
		algorithmVersion: ALGORITHM_VERSIONS.p1a,
		inputContentHash: "0".repeat(64),
		sourceRendition: { path: "/nowhere.jpg", width: 1, height: 1, format: "jpeg" },
	}
	assert.throws(
		() => toPalette({ ...LEGAL, gradient: true, stops: [{ rgb: LEGAL.background, position: 0 }] }, meta),
		/ConfigurationError|at least 2 stops/,
	)
	// Five stops IS representable — it is `I1.stop-count-out-of-range`, not an emitter error.
	const fiveStops = toPalette(
		{
			...LEGAL,
			stops: [
				{ rgb: LEGAL.background, position: 0 },
				{ rgb: [1, 1, 1], position: 0.2 },
				{ rgb: [2, 2, 2], position: 0.4 },
				{ rgb: [3, 3, 3], position: 0.6 },
				{ rgb: LEGAL.surface, position: 1 },
			],
		},
		meta,
	)
	const report = feasibility(fiveStops)
	assert.equal(report.valid, false)
	assert.ok(report.violations.some((violation) => violation.code === "I1.stop-count-out-of-range"))
})

test("gradient: false emits gradient: null, whatever stops the configuration carries", async () => {
	const decoded = await decode()
	const meta = await sourceMetaOf(decoded.path, ALGORITHM_VERSIONS.p1a)
	const palette = toPalette({ ...LEGAL, gradient: false }, meta)
	assert.equal(palette.gradient, null)
	assert.equal(palette.metadata.algorithmVersion, "p1a-0.1.0")

	const report = feasibility(palette, { source: decoded.source, transparency: decoded.transparency })
	assert.deepEqual(report.violations, [], report.violations.map((v) => v.code).join(", "))
})

test("an escape declaration is carried through verbatim, as a branded hex", () => {
	const meta = {
		algorithmVersion: ALGORITHM_VERSIONS.p1ap,
		inputContentHash: "0".repeat(64),
		sourceRendition: { path: "/nowhere.jpg", width: 1, height: 1, format: "jpeg" },
	}
	const palette = toPalette(
		{
			...LEGAL,
			background: [255, 255, 255],
			surface: [255, 255, 255],
			surfaceCollapsed: true,
			gradient: false,
			escape: { role: "background", color: "#ffffff" },
		},
		meta,
	)
	assert.deepEqual(palette.escape, { role: "background", color: "#ffffff" })
	assert.equal(palette.roles.background.hex, "#ffffff")
})

test("ConfigurationError is the error type, named", () => {
	assert.equal(new ConfigurationError("x").name, "ConfigurationError")
})
