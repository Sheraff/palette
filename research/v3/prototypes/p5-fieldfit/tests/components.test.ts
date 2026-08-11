/**
 * W-E2 self-test: the recursive field-like component reading (`E2_BRIEF.md`, `SPEC.md` decision 12).
 *
 * The brief names four synthetic obligations and this file is them, in order:
 *
 *  (a) 40% smooth ramp + 60% texture ⇒ the ramp is the background **with its gradient**, not a
 *      retreat;
 *  (b) a flat panel over a distinct flat ground ⇒ the two-component reading, panel as surface;
 *  (c) the v0.3 two-block covers do not regress — the two-component reading subsumes the rescue
 *      (the palette-level half of this lives in `candidate.test.ts`, unchanged from v0.4.1; here it
 *      is asserted at component level);
 *  (d) a full-image smooth field reproduces the single-fit result — the recursion never runs, and
 *      when it is run anyway the global fit *is* the first component.
 *
 * Plus the three properties the brief makes structural rather than optional: **termination** under
 * the depth cap, **determinism**, and the paradigm line — the component search is a fit, so the only
 * masks in play are its own residual field (asserted as: supports are disjoint and every claimed
 * pixel is within the explained radius of its component's surface).
 *
 * Raster fixtures are built in code, exactly as `fieldfit.test.ts` builds them, so the component
 * tests test the recursion and nothing else. The two obligations that are *palette* claims — (a)'s
 * "with its gradient" and (b)'s "panel as surface" — additionally go through `analyzeImage` from a
 * written PNG, because only the assembly can publish a gradient.
 *
 * Run from `research/v3`:
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types --test prototypes/p5-fieldfit/tests/components.test.ts
 */

import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test, { after, before } from "node:test"

import sharp from "sharp"

import { POOLED_SAME_COLOR_BAR } from "../../../src/contract/constants.ts"
import { okLabDistance, okLabToRgb, rgbToOkLab } from "../../../src/contract/color.ts"
import type { OkLab, Rgb8 } from "../../../src/contract/types.ts"

import { analyzeImage } from "../candidate.ts"
import {
	COMPONENT_INK_GROUND_ADJACENCY_MAX,
	COMPONENT_INK_MORTALITY,
	compositeFieldFit,
	fieldFitWithoutInk,
	inkStatistics,
	pixelIndexOnAxis,
} from "../src/components.ts"
import { normalizedX, normalizedY } from "../src/decode.ts"
import {
	COMPONENT_CORE_FRACTION,
	EXPLAINED_RADIUS,
	EXTENSIVE_SUPPORT_FRACTION,
	fitField,
	fitFieldComponents,
	MAX_COMPONENT_DEPTH,
	NO_FIELD_EXPLAINED_FRACTION,
} from "../src/fieldfit.ts"
import type { DecodedRaster } from "../src/types.ts"

// ---------------------------------------------------------------------------------------------
// Fixture machinery (the same deterministic hash `fieldfit.test.ts` uses — no `Math.random`)
// ---------------------------------------------------------------------------------------------

function hash32(value: number): number {
	let h = value | 0
	h = Math.imul(h ^ (h >>> 16), 0x7feb352d)
	h = Math.imul(h ^ (h >>> 15), 0x846ca68b)
	h ^= h >>> 16
	return h >>> 0
}

/** Deterministic pseudo-noise in [0, 1). */
function noise(seed: number): number {
	return hash32(seed) / 0x1_0000_0000
}

function makeRaster(
	width: number,
	height: number,
	colorAt: (x: number, y: number, index: number) => OkLab,
): DecodedRaster {
	const lab = new Float32Array(width * height * 3)
	const packed = new Uint32Array(width * height)
	for (let row = 0; row < height; row += 1) {
		const y = normalizedY(row, height)
		for (let column = 0; column < width; column += 1) {
			const index = row * width + column
			const color = colorAt(normalizedX(column, width), y, index)
			lab[index * 3] = color[0]
			lab[index * 3 + 1] = color[1]
			lab[index * 3 + 2] = color[2]
			const rgb = okLabToRgb(color)
			packed[index] = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]
		}
	}
	return { width, height, format: "synthetic", lab, packed }
}

const SIZE = 128

/** A left→right lightness ramp with a small chroma drift — the "sky" of obligation (a). */
function skyAt(x: number): OkLab {
	return [0.55 + 0.16 * x, 0.02 + 0.01 * x, -0.09 - 0.02 * x]
}

/** Structureless colour, spread over the whole gamut: nothing a low-order surface can explain. */
function textureAt(index: number): OkLab {
	return [
		0.1 + 0.8 * noise(index * 3 + 1),
		-0.2 + 0.4 * noise(index * 3 + 2),
		-0.2 + 0.4 * noise(index * 3 + 3),
	]
}

/** Rows above this fraction of the height are sky; the rest is texture. */
const SKY_FRACTION = 0.4

function skyOverTexture(): DecodedRaster {
	return makeRaster(SIZE, SIZE, (x, _y, index) => {
		const row = Math.floor(index / SIZE)
		return row < SKY_FRACTION * SIZE ? skyAt(x) : textureAt(index)
	})
}

// ---------------------------------------------------------------------------------------------
// (a) 40% smooth ramp + 60% texture
// ---------------------------------------------------------------------------------------------

test("(a) a 40% ramp under 60% texture is a component, not a retreat", () => {
	const raster = skyOverTexture()
	const fit = fitField(raster)

	// The trigger: one surface cannot explain half of this. (If this ever stops being true the test
	// below is vacuous, so it is asserted rather than assumed.)
	assert.equal(fit.noField, true, `global explained fraction ${fit.fieldExplainedFraction}`)

	const reading = fitFieldComponents(raster)
	assert.equal(reading.retreat, false, "a 40% smooth ramp must qualify as field-like")
	assert.ok(reading.components.length >= 1)

	const primary = reading.components[0]
	assert.equal(primary.order, 1, "the ramp component must keep its affine term")
	assert.ok(
		primary.supportFraction >= 0.35 && primary.supportFraction <= 0.65,
		`the ramp component should claim about the sky, claimed ${primary.supportFraction}`,
	)
	assert.ok(primary.extensive && primary.smooth, "the ramp component must pass both gates")

	// It is the sky, not an average of sky and texture: its surface sits on the sky at both ends.
	for (const x of [-0.75, 0, 0.75]) {
		const distance = okLabDistance(primary.fieldAt(x, -0.6), skyAt(x))
		assert.ok(
			distance < POOLED_SAME_COLOR_BAR,
			`component surface at x=${x} is ${distance} from the true sky colour`,
		)
	}

	// The texture is not a second field: no plane explains an extensive share of structureless colour.
	assert.equal(reading.components.length, 1, "the texture must not qualify as a component")
})

// ---------------------------------------------------------------------------------------------
// (d) a full-image smooth field: the recursion does not run, and would find the same fit if it did
// ---------------------------------------------------------------------------------------------

test("(d) a fully-explained field is one component, identical to the global fit", () => {
	const raster = makeRaster(SIZE, SIZE, (x) => skyAt(x))
	const fit = fitField(raster)
	assert.equal(fit.noField, false, "a full-image smooth field explains itself")

	// The recursion is guarded by `noField` in `candidate.ts`, so on this raster it never runs — that
	// is the bit-identity of obligation (d), and it is a property of the guard, not of a tolerance.
	// Run it anyway to pin the brief's other claim: the global fit *is* the first component.
	const reading = fitFieldComponents(raster)
	assert.equal(reading.components.length, 1)
	const primary = reading.components[0]
	assert.equal(primary.order, fit.order)
	assert.ok(primary.supportFraction > 0.99, `the one component covers the image, ${primary.supportFraction}`)
	for (let c = 0; c < 9; c += 1) {
		assert.ok(
			Math.abs(primary.coefficients[c] - fit.coefficients[c]) < 1e-3,
			`coefficient ${c}: component ${primary.coefficients[c]} vs global ${fit.coefficients[c]}`,
		)
	}
})

// ---------------------------------------------------------------------------------------------
// (c) two blocks, at component level
// ---------------------------------------------------------------------------------------------

test("(c) two far-apart flat blocks are two flat components", () => {
	const blue: OkLab = [0.32, -0.02, -0.19]
	const gold: OkLab = [0.88, 0.02, 0.17]
	const raster = makeRaster(SIZE, SIZE, (x) => (x < 0 ? blue : gold))

	const fit = fitField(raster)
	assert.equal(fit.noField, true, "a plane cannot sit on two far-apart colours")

	const reading = fitFieldComponents(raster)
	assert.equal(reading.components.length, 2, "each block is a component")
	assert.equal(reading.retreat, false)
	for (const component of reading.components) {
		assert.equal(component.order, 0, "a flat block has no ramp")
		assert.ok(
			Math.abs(component.supportFraction - 0.5) < 0.02,
			`each block claims half the image, got ${component.supportFraction}`,
		)
		assert.equal(component.explainedFractionOwn, 1)
		assert.ok(component.coreFraction > 0.99, "a flat block sits inside its own core")
	}
	const centres = reading.components.map((component) => component.fieldAt(component.meanX, component.meanY))
	const found = centres.map((centre) =>
		okLabDistance(centre, blue) < okLabDistance(centre, gold) ? "blue" : "gold"
	)
	assert.deepEqual([...found].sort(), ["blue", "gold"], "the two components are the two blocks")
})

// ---------------------------------------------------------------------------------------------
// Termination, determinism, and the paradigm line
// ---------------------------------------------------------------------------------------------

test("the recursion terminates under the depth cap on an adversarial image", () => {
	// Sixteen equal-area colours, **scattered** rather than ordered — an ordered set of sixteen is a
	// quantized ramp and a plane explains most of it, which is a different fixture with a different
	// right answer. Every level here claims about a sixteenth, under the minimum claim, so the loop
	// stops at the first level rather than grinding to the cap.
	const raster = makeRaster(SIZE, SIZE, (x, y) => {
		const cell = Math.floor((x + 1) * 2) + 4 * Math.floor((y + 1) * 2)
		return [
			0.08 + 0.85 * noise(cell * 7 + 1),
			-0.2 + 0.4 * noise(cell * 7 + 2),
			-0.2 + 0.4 * noise(cell * 7 + 3),
		]
	})
	const reading = fitFieldComponents(raster)
	assert.ok(reading.attempts.length <= MAX_COMPONENT_DEPTH, "the depth cap is hard")
	assert.equal(reading.retreat, true, "no sixteenth of an image is extensive")

	// And the cap itself, on an image built to feed the loop: four flat bands of 25% each.
	const bands = makeRaster(SIZE, SIZE, (_x, y) => {
		const band = Math.min(3, Math.floor((y + 1) * 2))
		return [0.2 + 0.2 * band, 0, 0]
	})
	const banded = fitFieldComponents(bands)
	assert.ok(banded.attempts.length <= MAX_COMPONENT_DEPTH)
	assert.ok(banded.components.length >= 2, `four 25% bands are components, got ${banded.components.length}`)
})

test("the component reading is deterministic and its supports are disjoint claims of the fit", () => {
	const raster = skyOverTexture()
	const first = fitFieldComponents(raster)
	const second = fitFieldComponents(raster)

	assert.equal(first.components.length, second.components.length)
	for (let index = 0; index < first.components.length; index += 1) {
		assert.deepEqual([...first.components[index].coefficients], [...second.components[index].coefficients])
		assert.equal(first.components[index].supportPixels, second.components[index].supportPixels)
		assert.deepEqual(first.components[index].claim, second.components[index].claim)
	}

	// The paradigm line, as an assertion: a claim is exactly "the pixels this surface explains", and
	// no pixel is claimed twice. Nothing here knows about connectivity or shape.
	const seen = new Uint8Array(SIZE * SIZE)
	for (const component of first.attempts) {
		for (let row = 0; row < SIZE; row += 1) {
			for (let column = 0; column < SIZE; column += 1) {
				const index = row * SIZE + column
				if (component.claim[index] !== 1) continue
				assert.equal(seen[index], 0, `pixel ${index} claimed by two components`)
				seen[index] = 1
				const x = normalizedX(column, SIZE)
				const y = normalizedY(row, SIZE)
				const offset = index * 3
				const residual = okLabDistance(
					[raster.lab[offset], raster.lab[offset + 1], raster.lab[offset + 2]],
					component.fieldAt(x, y),
				)
				assert.ok(
					residual < EXPLAINED_RADIUS,
					`claimed pixel ${index} sits ${residual} from its component, radius ${EXPLAINED_RADIUS}`,
				)
			}
		}
	}
})

test("the composite view reads the local component, and the pixel inversion round-trips", () => {
	for (const size of [1, 2, 7, 128]) {
		for (const index of [0, Math.floor(size / 2), size - 1]) {
			assert.equal(pixelIndexOnAxis(normalizedX(index, size), size), index)
			assert.equal(pixelIndexOnAxis(normalizedY(index, size), size), index)
		}
	}

	const blue: OkLab = [0.32, -0.02, -0.19]
	const gold: OkLab = [0.88, 0.02, 0.17]
	const raster = makeRaster(SIZE, SIZE, (x) => (x < 0 ? blue : gold))
	const fit = fitField(raster)
	const reading = fitFieldComponents(raster)
	const composite = compositeFieldFit(reading, raster, fit)

	// The global fit sits between the two blocks; the composite sits on whichever block it is asked
	// about. That difference is the whole point of "measure against the *local* component".
	assert.ok(okLabDistance(composite.fieldAt(-0.5, 0), blue) < POOLED_SAME_COLOR_BAR)
	assert.ok(okLabDistance(composite.fieldAt(0.5, 0), gold) < POOLED_SAME_COLOR_BAR)
	assert.ok(okLabDistance(fit.fieldAt(-0.5, 0), blue) > 4 * POOLED_SAME_COLOR_BAR)
	assert.ok(composite.fieldExplainedFraction > 0.99, "the pool explains what the one surface could not")
})

// ---------------------------------------------------------------------------------------------
// The two palette-level obligations, through the real decoder
// ---------------------------------------------------------------------------------------------

let fixtureDirectory = ""
before(async () => {
	fixtureDirectory = await mkdtemp(join(tmpdir(), "p5-fieldfit-components-"))
})
after(async () => {
	if (fixtureDirectory !== "") await rm(fixtureDirectory, { recursive: true, force: true })
})

const PNG_SIZE = 96

async function writePng(
	path: string,
	colorAt: (column: number, row: number, index: number) => Rgb8,
): Promise<void> {
	const data = Buffer.alloc(PNG_SIZE * PNG_SIZE * 3)
	for (let row = 0; row < PNG_SIZE; row += 1) {
		for (let column = 0; column < PNG_SIZE; column += 1) {
			const index = row * PNG_SIZE + column
			const rgb = colorAt(column, row, index)
			data[index * 3] = rgb[0]
			data[index * 3 + 1] = rgb[1]
			data[index * 3 + 2] = rgb[2]
		}
	}
	await sharp(data, { raw: { width: PNG_SIZE, height: PNG_SIZE, channels: 3 } }).png().toFile(path)
}

test("(a, palette) the ramp component publishes background AND its gradient", async () => {
	const path = join(fixtureDirectory, "sky-over-texture.png")
	await writePng(path, (column, row, index) => {
		const x = normalizedX(column, PNG_SIZE)
		if (row < SKY_FRACTION * PNG_SIZE) return okLabToRgb(skyAt(x))
		return okLabToRgb(textureAt(index))
	})

	const { palette, diagnostics, fieldComponents } = await analyzeImage(path)

	assert.equal(diagnostics.noField, true, "the trigger fired")
	assert.notEqual(fieldComponents, null, "the recursion ran")
	assert.notEqual(palette.gradient, null, "the sky's own ramp is published — this is the obligation")
	assert.equal(diagnostics.gradient, true)
	assert.notEqual(palette.roles.surface.hex, palette.roles.background.hex)
	assert.equal(palette.collapse.surfaceCollapsed, false)

	// Both ends are sky colours: light in the middle of the sky's lightness range, not the texture's
	// average. Checked as "within the sky's own span of the sky field", the only claim the fixture
	// licenses.
	for (const role of [palette.roles.background, palette.roles.surface]) {
		const lab = rgbToOkLab(role.rgb)
		const nearest = Math.min(
			...[-0.9, -0.5, 0, 0.5, 0.9].map((x) => okLabDistance(lab, skyAt(x))),
		)
		assert.ok(nearest < 4 * POOLED_SAME_COLOR_BAR, `${role.hex} is ${nearest} from the sky ramp`)
	}
})

test("(b, palette) a flat panel over a flat ground is the two-component reading", async () => {
	// Ground 48%, panel 42%, textured border 10%: no single colour is a majority, so the global fit
	// cannot explain half the image and the recursion is reached. **Stated limitation:** the trigger
	// is SPEC decision 12's global explained fraction, so a panel over a *majority* ground is still
	// read as one flat field — widening the trigger is not this worker's call, and this fixture is
	// built to the trigger rather than around it.
	const path = join(fixtureDirectory, "panel-on-ground.png")
	const ground: Rgb8 = [38, 46, 62]
	const panel: Rgb8 = [232, 226, 208]
	await writePng(path, (column, row, index) => {
		if (row >= 0.9 * PNG_SIZE) return okLabToRgb(textureAt(index))
		const inPanel = column >= 0.06 * PNG_SIZE && column <= 0.66 * PNG_SIZE &&
			row >= 0.08 * PNG_SIZE && row <= 0.78 * PNG_SIZE
		return inPanel ? panel : ground
	})

	const { palette, diagnostics, fieldComponents } = await analyzeImage(path)

	assert.equal(diagnostics.noField, true)
	assert.equal(fieldComponents?.components.length, 2, "ground and panel are two components")
	assert.equal(diagnostics.twoBlockFallback, true, "two flat components are the two-block reading")
	assert.equal(palette.gradient, null, "two flat fields publish no ramp")
	assert.equal(palette.collapse.surfaceCollapsed, false, "the panel survives as the surface")

	const surfaceDistance = okLabDistance(rgbToOkLab(palette.roles.surface.rgb), rgbToOkLab(panel))
	const backgroundDistance = okLabDistance(rgbToOkLab(palette.roles.background.rgb), rgbToOkLab(ground))
	assert.ok(surfaceDistance < POOLED_SAME_COLOR_BAR, `surface ${palette.roles.surface.hex} is not the panel`)
	assert.ok(
		backgroundDistance < POOLED_SAME_COLOR_BAR,
		`background ${palette.roles.background.hex} is not the ground`,
	)
})

test("the two gate constants are the ones the rulings state, and are separate names", () => {
	// Pinned because both are `[UNCALIBRATED]` and the reports quote them: a change here is a change
	// to what "a region of the picture" and "holds its pixels close" mean, and it should have to edit
	// a test to happen.
	assert.equal(EXTENSIVE_SUPPORT_FRACTION, 0.1)
	assert.equal(MAX_COMPONENT_DEPTH, 4)
	assert.ok(Math.abs(EXPLAINED_RADIUS - 4 * POOLED_SAME_COLOR_BAR) < 1e-15)

	// The v0.5.1 smooth-gate ruling, as an assertion. The value, and — separately — the *decoupling*:
	// v0.5.0 read the smooth gate off `NO_FIELD_EXPLAINED_FRACTION`, so a test that only checked
	// `COMPONENT_CORE_FRACTION === 0.4` would still pass if someone re-coupled them by moving decision
	// 9's global threshold down to 0.4 — which is precisely what the ruling refuses.
	assert.equal(COMPONENT_CORE_FRACTION, 0.39)
	assert.equal(NO_FIELD_EXPLAINED_FRACTION, 0.5)
	assert.notEqual(COMPONENT_CORE_FRACTION, NO_FIELD_EXPLAINED_FRACTION)
})

// ---------------------------------------------------------------------------------------------
// The smooth gate, at the value the ruling sets it to (`16a8247378`-class)
// ---------------------------------------------------------------------------------------------

/**
 * **A painted region**: the sky ramp with per-pixel brushwork, amplitude set so the claim's pixels
 * spread across the explained radius instead of piling at its centre.
 *
 * This is the shape `16a8247378` has and the synthetic (a) fixture does not: (a)'s sky is exact, so
 * its core fraction is ~1 and it clears any gate in (0, 1). The cover the ruling was written for sits
 * at 0.40 — brushwork is a real signal the affine surface cannot carry, and the component still *is*
 * the sky. Amplitude is expressed in explained radii so the fixture cannot drift if the bar moves.
 */
function paintedSkyAt(x: number, index: number, amplitude: number): OkLab {
	const base = skyAt(x)
	const jitter = amplitude * EXPLAINED_RADIUS
	return [
		base[0] + jitter * (noise(index * 5 + 11) - 0.5),
		base[1] + 0.25 * jitter * (noise(index * 5 + 12) - 0.5),
		base[2] + 0.25 * jitter * (noise(index * 5 + 13) - 0.5),
	]
}

/** Brushwork amplitudes, in explained radii, measured on the sweep recorded in `reports/wp9.md`. */
const PAINTED_AMPLITUDE = 3.1
const NOISY_AMPLITUDE = 5.5

/** Obligation (a)'s fixture with the sky repainted — the same geometry, so only the gate differs. */
function paintedSkyOverTexture(amplitude: number): DecodedRaster {
	return makeRaster(SIZE, SIZE, (x, _y, index) => {
		const row = Math.floor(index / SIZE)
		return row < SKY_FRACTION * SIZE ? paintedSkyAt(x, index, amplitude) : textureAt(index)
	})
}

test("the smooth gate admits a painted ramp at 0.4–0.5 core and still refuses a noisy region", () => {
	// (i) Painted. The amplitude is tuned so the sky lands where the evidence cover does: claim 0.239
	// against `16a8247378`'s 0.237, core **0.468** — above `COMPONENT_CORE_FRACTION`, below the 0.5
	// v0.5.0 borrowed. That band is the entire behavioural content of the ruling, so the test asserts
	// the band and not just the verdict: a component that qualified at core 0.8 would pass under both
	// versions and prove nothing.
	const painted = paintedSkyOverTexture(PAINTED_AMPLITUDE)
	assert.equal(fitField(painted).noField, true, "the trigger must fire or the fixture is vacuous")

	const reading = fitFieldComponents(painted)
	const sky = reading.attempts.find((component) => component.supportFraction > 0.2)
	assert.ok(sky !== undefined, "the sky claims a fifth of the frame at minimum")
	assert.ok(
		sky.coreFraction >= COMPONENT_CORE_FRACTION && sky.coreFraction < NO_FIELD_EXPLAINED_FRACTION,
		`the fixture must sit in the decoupled band, core fraction ${sky.coreFraction}`,
	)
	assert.equal(sky.extensive, true)
	assert.equal(sky.smooth, true, "a painted ramp above 0.4 core is field-like — the ruling")
	assert.equal(sky.order, 1, "it is still the sky's ramp, brushwork and all")
	assert.equal(reading.retreat, false)
	assert.equal(reading.components[0].supportPixels, sky.supportPixels, "the sky carries the field")

	// (ii) Noisy: the *same* region, brushwork wide enough that the surface holds its pixels only at
	// the rim of the radius (core 0.224). It still claims an extensive share — that is the point, the
	// extensive gate cannot tell these two apart — and *smooth* must refuse it. Without this the
	// ruling would read as "0.4 lets more through", with no evidence anything is still kept out.
	const noisy = paintedSkyOverTexture(NOISY_AMPLITUDE)
	const noisyReading = fitFieldComponents(noisy)
	assert.equal(noisyReading.attempts[0].extensive, true, "extensive alone would have admitted it")
	for (const component of noisyReading.attempts) {
		assert.ok(
			component.coreFraction < COMPONENT_CORE_FRACTION,
			`level ${component.depth} sits at core ${component.coreFraction}, above the gate`,
		)
		assert.equal(component.smooth, false)
	}
	assert.equal(noisyReading.retreat, true, "a region whose pixels sit at the rim is not a field")
})

// ---------------------------------------------------------------------------------------------
// SPEC decision 15 — the ink-likeness instrument, and 15a's field-candidacy veto
// ---------------------------------------------------------------------------------------------

/** Draw a support mask with a callback, so each fixture below reads as the shape it is. */
function mask(width: number, height: number, inside: (x: number, y: number) => boolean): Uint8Array {
	const out = new Uint8Array(width * height)
	for (let row = 0; row < height; row += 1) {
		for (let column = 0; column < width; column += 1) {
			if (inside(column, row)) out[row * width + column] = 1
		}
	}
	return out
}

function count(support: Uint8Array): number {
	let total = 0
	for (const value of support) if (value === 1) total += 1
	return total
}

test("ink instrument: strokes die at the ink scale, a blob of the same mass does not", () => {
	// 300×300, so the ink radius is 9 px and the texture closing is 2 px — the same numbers a 300²
	// cover gets. Strokes are 7 px wide (inside the measured designed-mark range); the blob is a
	// square carrying the *same* number of pixels, so the only thing that differs is shape.
	const size = 300
	const strokeWidth = 7
	const strokePitch = 30
	const strokes = mask(size, size, (x) => x % strokePitch < strokeWidth)
	const side = Math.round(Math.sqrt(count(strokes)))
	const blob = mask(size, size, (x, y) => x < side && y < side)
	assert.ok(
		Math.abs(count(blob) - count(strokes)) / count(strokes) < 0.01,
		`matched mass: strokes ${count(strokes)}, blob ${count(blob)}`,
	)

	const ground = new Uint8Array(size * size).fill(1)
	const strokeInk = inkStatistics(strokes, ground, size, size)
	const blobInk = inkStatistics(blob, ground, size, size)

	assert.equal(strokeInk.erosionMortality, 1, "a 7 px stroke cannot survive a 9 px erosion")
	assert.ok(
		blobInk.erosionMortality < 0.5,
		`a compact blob of the same mass must mostly survive, measured ${blobInk.erosionMortality}`,
	)
	// The instrument is a shape measurement: mass is held fixed and the verdict still separates.
	assert.ok(strokeInk.erosionMortality - blobInk.erosionMortality > 0.5)
})

test("ink instrument: ground adjacency counts only outward neighbours the ground claims", () => {
	const size = 32
	const support = mask(size, size, (x, y) => x >= 8 && x < 24 && y >= 8 && y < 24)
	const all = new Uint8Array(size * size).fill(1)
	const none = new Uint8Array(size * size)
	assert.equal(inkStatistics(support, all, size, size).groundAdjacency, 1)
	assert.equal(inkStatistics(support, none, size, size).groundAdjacency, 0)

	// Half the frame is ground: the boundary is counted per outward neighbour, so a square whose
	// left/right sides face ground and top/bottom do not sits at exactly one half.
	const half = mask(size, size, (x) => x < 8 || x >= 24)
	assert.equal(inkStatistics(support, half, size, size).groundAdjacency, 0.5)
})

test("ink instrument: the border is replicated, so a full-bleed support is not eroded by the frame", () => {
	const size = 300
	const full = new Uint8Array(size * size).fill(1)
	const ground = new Uint8Array(size * size)
	assert.equal(inkStatistics(full, ground, size, size).erosionMortality, 0)
})

test("(15a) a type-shaped extensive component cannot carry the field", () => {
	// A flat vector colour laid out as strokes over material no surface explains — the shape of
	// round-3 item 6, where the display type and its frame were published as the gradient. The
	// strokes are extensive (they claim well over `EXTENSIVE_SUPPORT_FRACTION`) and smooth (a flat
	// colour's fit holds its pixels in the core), so both v0.6.1 gates admit them.
	const ink: OkLab = [0.72, -0.06, -0.14]
	const size = 128
	const strokeWidth = 5
	const strokePitch = 24
	const raster = makeRaster(size, size, (_x, _y, index) => {
		const column = index % size
		return column % strokePitch < strokeWidth ? ink : textureAt(index)
	})

	const fit = fitField(raster)
	assert.equal(fit.noField, true, "the trigger must fire, or the recursion never runs")

	const reading = fitFieldComponents(raster)
	const typeLevel = reading.attempts.find((component) => component.extensive)
	assert.ok(typeLevel !== undefined, "the strokes must be found as an extensive component")
	assert.equal(typeLevel.smooth, true, "extensive and smooth: v0.6.1 would have published it")
	assert.ok(typeLevel.ink !== null, "an accepted component is measured")
	assert.ok(
		typeLevel.ink.erosionMortality >= COMPONENT_INK_MORTALITY,
		`strokes must read thin, measured ${typeLevel.ink.erosionMortality}`,
	)
	assert.ok(
		typeLevel.ink.groundAdjacency < COMPONENT_INK_GROUND_ADJACENCY_MAX,
		`strokes over residue must read floating, measured ${typeLevel.ink.groundAdjacency}`,
	)
	assert.equal(typeLevel.inkLike, true)

	// The veto's whole content: it is not in the pool, and the pool has nothing else, so the reading
	// retreats rather than publishing the type colour as the field.
	assert.ok(
		!reading.components.includes(typeLevel),
		"an ink-shaped component must not carry the field",
	)
	assert.equal(reading.retreat, true)
	// And it is kept, with its statistics, so a report can say why.
	assert.ok(reading.attempts.includes(typeLevel))
})

test("(15a) a smooth extensive field is untouched by the veto", () => {
	// Obligation (a)'s fixture, re-asserted through the veto: the sky is a region, it tiles with what
	// else the recursion explains, and nothing about v0.7 may move it.
	const reading = fitFieldComponents(skyOverTexture())
	assert.equal(reading.retreat, false)
	const primary = reading.components[0]
	assert.equal(primary.inkLike, false)
	assert.ok(primary.ink !== null)
	assert.ok(
		primary.ink.erosionMortality < COMPONENT_INK_MORTALITY ||
			primary.ink.groundAdjacency >= COMPONENT_INK_GROUND_ADJACENCY_MAX,
		`the sky must fail at least one conjunct: mortality ${primary.ink.erosionMortality}, ` +
			`adjacency ${primary.ink.groundAdjacency}`,
	)
})

test("(15a) the vetoed material is overlay: fieldFitWithoutInk zeroes its weights", () => {
	const ink: OkLab = [0.72, -0.06, -0.14]
	const size = 128
	const raster = makeRaster(size, size, (_x, _y, index) => {
		const column = index % size
		return column % 24 < 5 ? ink : textureAt(index)
	})
	const fit = fitField(raster)
	const reading = fitFieldComponents(raster)
	const vetoed = reading.attempts.find((component) => component.inkLike)
	assert.ok(vetoed !== undefined)

	const masked = fieldFitWithoutInk(fit, reading, raster)
	assert.notEqual(masked, fit, "a veto must produce a different view")
	for (let index = 0; index < size * size; index += 1) {
		if (vetoed.claim[index] === 1) assert.equal(masked.weights[index], 0)
	}
	// No veto ⇒ the view is the fit itself, so a cover without ink pays nothing and cannot move.
	const clean = skyOverTexture()
	const cleanFit = fitField(clean)
	assert.equal(fieldFitWithoutInk(cleanFit, fitFieldComponents(clean), clean), cleanFit)
})
