/**
 * P5 field-fit — the integration smoke test (W-INTEG).
 *
 * One real cover from `data/devloop/sets/demo-20.txt`, run through `paletteOf`, checked for the four
 * properties assembly is actually responsible for. Not a quality test: nothing here says a palette is
 * good, and nothing here should ever be tightened into saying so.
 *
 *  1. **Every published colour is an exact artwork triple** (invariant 2's existence clause), checked
 *     against the decoder's own inventory rather than against a re-scan — the same ledger the
 *     candidate published from, so a mismatch is a real disagreement and not a decoding difference.
 *     The one sanctioned exception is a declared escape, whose colour is *required* to be absent.
 *  2. **Gradient ends are the field roles**, exactly, and positions span [0, 1] strictly increasing
 *     (invariant 1's `first-stop-not-background` / `last-stop-not-surface` / span clauses).
 *  3. **Collapse flags equal hex equality**, in both directions (invariant 1's flag consistency).
 *  4. **A collapsed surface publishes no gradient** — `GradientSpec`'s stated consequence.
 *
 * The set's first cover is used, so the test moves when the set does and never silently drifts onto a
 * cover nobody looks at.
 *
 * Run: NODE_NO_WARNINGS=1 node --experimental-strip-types --test prototypes/p5-fieldfit/tests/candidate.test.ts
 */

import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, isAbsolute, join, resolve } from "node:path"
import test, { after, before } from "node:test"
import { fileURLToPath } from "node:url"

import sharp from "sharp"

import { hex, rgbToOkLab } from "../../../src/contract/color.ts"
import { POOLED_SAME_COLOR_BAR } from "../../../src/contract/constants.ts"
import type { Rgb8 } from "../../../src/contract/types.ts"
import {
	ALGORITHM_VERSION,
	analyzeImage,
	candidateId,
	paletteOf,
	PREPROCESSING_VERSION,
} from "../candidate.ts"
import { decodeAndInventory, packRgb } from "../src/decode.ts"
import { fitField } from "../src/fieldfit.ts"
import { guideStopRefusal, rampContinuity } from "../src/ramp.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
/** `tests/` → `p5-fieldfit/` → `prototypes/` → `v3/` → `research/` → the repository root. */
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..", "..")
const V3_ROOT = resolve(HERE, "..", "..", "..")
const SET_PATH = resolve(V3_ROOT, "data", "devloop", "sets", "demo-20.txt")

/** First non-comment, non-blank line of the set file, resolved the way `run.ts` resolves it. */
async function firstImageOfSet(): Promise<string> {
	const lines = (await readFile(SET_PATH, "utf8")).split("\n")
	for (const raw of lines) {
		const line = raw.trim()
		if (line === "" || line.startsWith("#")) continue
		return isAbsolute(line) ? line : resolve(REPO_ROOT, line)
	}
	throw new Error(`${SET_PATH} lists no images`)
}

test("the candidate module exports what the dev loop loads", () => {
	assert.equal(candidateId, "p5-fieldfit")
	// v0.9.2 wires the family self-coherence gate v0.9.1 measured: 3 of 31 covers move, all on the
	// accent, one of them a restoration of a silent STRONG's colour (the constant's own note names all
	// three).
	assert.equal(ALGORITHM_VERSION, "p5-fieldfit-0.9.2")
	assert.equal(PREPROCESSING_VERSION, "sharp-0.33.5/srgb/no-resample")
	assert.equal(typeof paletteOf, "function")
})

test("paletteOf returns a contract-shaped palette on a real cover", async () => {
	const imagePath = await firstImageOfSet()
	const palette = await paletteOf(imagePath)
	const { inventory } = await decodeAndInventory(imagePath)

	// --- metadata says what produced it, and from what ---
	assert.equal(palette.metadata.algorithmVersion, ALGORITHM_VERSION)
	assert.equal(palette.metadata.sourceRendition.path, imagePath)
	assert.match(palette.metadata.inputContentHash, /^[0-9a-f]{64}$/)
	assert.deepEqual(palette.metadata.processedSize, {
		width: palette.metadata.sourceRendition.width,
		height: palette.metadata.sourceRendition.height,
	})

	// --- 1. exact artwork triples ---
	const escapeHex = palette.escape?.color ?? null
	const published = [
		...(["background", "surface", "foreground", "accent"] as const).map((role) => ({
			path: `roles.${role}`,
			color: palette.roles[role],
		})),
		...(palette.gradient?.stops ?? []).map((stop, index) => ({
			path: `gradient.stops[${index}]`,
			color: stop.color,
		})),
	]
	for (const { path, color } of published) {
		assert.equal(color.hex, hex(color.hex), `${path} hex is not canonical`)
		if (escapeHex !== null && color.hex === escapeHex) {
			// The escape is the one colour that must NOT be in the artwork.
			assert.equal(
				inventory.has(packRgb(color.rgb)),
				false,
				`${path} declares the escape ${color.hex} but the artwork contains it`,
			)
			continue
		}
		assert.equal(
			inventory.has(packRgb(color.rgb)),
			true,
			`${path} (${color.hex}) is not an exact triple of the artwork`,
		)
	}

	// --- 2. the gradient's ends are the field roles ---
	if (palette.gradient !== null) {
		const stops = palette.gradient.stops
		assert.ok(stops.length >= 2 && stops.length <= 4, `stop count ${stops.length} out of range`)
		assert.equal(stops[0].color.hex, palette.roles.background.hex)
		assert.equal(stops[stops.length - 1].color.hex, palette.roles.surface.hex)
		assert.equal(stops[0].position, 0)
		assert.equal(stops[stops.length - 1].position, 1)
		for (let index = 1; index < stops.length; index += 1) {
			assert.ok(
				stops[index].position > stops[index - 1].position,
				`stop ${index} at ${stops[index].position} does not exceed ${stops[index - 1].position}`,
			)
		}
	}

	// --- 3. collapse flags are hex equality, both ways ---
	assert.equal(
		palette.collapse.surfaceCollapsed,
		palette.roles.surface.hex === palette.roles.background.hex,
	)
	assert.equal(
		palette.collapse.accentCollapsed,
		palette.roles.accent.hex === palette.roles.foreground.hex,
	)

	// --- 4. a collapsed surface has no ramp ---
	if (palette.collapse.surfaceCollapsed) assert.equal(palette.gradient, null)

	// --- the escape, when declared, is one of the two permitted literals on a permitted role ---
	if (palette.escape != null) {
		assert.ok(["#ffffff", "#000000"].includes(palette.escape.color))
		assert.ok(["background", "foreground"].includes(palette.escape.role))
		assert.equal(palette.roles[palette.escape.role].hex, palette.escape.color)
		assert.equal(
			palette.escape.role === "foreground"
				? palette.collapse.accentCollapsed
				: palette.collapse.surfaceCollapsed,
			true,
		)
	}
})

// ---------------------------------------------------------------------------------------------
// The no-field fork: rescue versus retreat (SPEC decision 9's precedence ruling)
// ---------------------------------------------------------------------------------------------

/**
 * `noField` is a fork, not a verdict, and these two fixtures take the two branches.
 *
 * Both images defeat the affine fit for the same reason — a plane cannot sit on colours this far
 * apart, so `fieldExplainedFraction` collapses and `noField` fires. What separates them is whether
 * *two* colours can do what one surface could not:
 *
 *  - **two blocks.** Every pixel is one of two far-apart colours, so each of them is a flat
 *    field-like component: extensive (half the image each) and smooth (its claim sits exactly on it).
 *    The two-component reading fires, both roles survive, `surfaceCollapsed` is false. *v0.5: this
 *    used to be decision 9's separate two-block rescue, which has merged into the component reading
 *    (`E2_BRIEF.md`). The assertions below are unchanged from v0.4.1 on purpose — obligation (c) is
 *    that the merge subsumes the rescue, and an unchanged test is what that claim looks like.*
 *  - **sixteen blocks.** The best two colours cover an eighth of the image, far under the floor, so
 *    there is nothing to rescue and the retreat takes one colour with `surfaceCollapsed` true.
 *
 * The images are written as PNG and read back through `paletteOf`'s own decoder, so the fixtures are
 * exact 8-bit triples and the test exercises the real path rather than a hand-built raster. The
 * diagnostics are read through `analyzeImage`, which `paletteOf` wraps, so the two agree by
 * construction.
 *
 * Colours are laid out in vertical stripes rather than by pixel hash: a checkerboard of two colours
 * would also defeat the fit, but stripes make "the image is genuinely two blocks" true in the
 * spatial sense the reading is named for, not only in the histogram.
 */
const FIXTURE_SIZE = 64

async function writeStripes(path: string, colors: readonly Rgb8[]): Promise<void> {
	const data = Buffer.alloc(FIXTURE_SIZE * FIXTURE_SIZE * 3)
	for (let row = 0; row < FIXTURE_SIZE; row += 1) {
		for (let column = 0; column < FIXTURE_SIZE; column += 1) {
			// Stripe index from the column, so each colour owns a contiguous vertical band.
			const color = colors[Math.floor((column * colors.length) / FIXTURE_SIZE) % colors.length]
			const offset = (row * FIXTURE_SIZE + column) * 3
			data[offset] = color[0]
			data[offset + 1] = color[1]
			data[offset + 2] = color[2]
		}
	}
	await sharp(data, { raw: { width: FIXTURE_SIZE, height: FIXTURE_SIZE, channels: 3 } })
		.png()
		.toFile(path)
}

let fixtureDirectory = ""
before(async () => {
	fixtureDirectory = await mkdtemp(join(tmpdir(), "p5-fieldfit-candidate-"))
})
after(async () => {
	if (fixtureDirectory !== "") await rm(fixtureDirectory, { recursive: true, force: true })
})

test("a genuinely two-colour image is rescued into two blocks, not retreated", async () => {
	const path = join(fixtureDirectory, "two-blocks.png")
	await writeStripes(path, [[10, 20, 200], [250, 220, 30]])

	const { palette, diagnostics } = await analyzeImage(path)

	assert.equal(diagnostics.noField, true, "an affine plane cannot fit two far-apart colours")
	assert.equal(diagnostics.twoBlockFallback, true, "noField + twoBlockFallback is the rescue")
	assert.equal(diagnostics.gradient, false, "decision 5: a two-block reading publishes no ramp")
	assert.equal(palette.gradient, null)

	assert.equal(
		palette.collapse.surfaceCollapsed,
		false,
		`the rescue keeps two roles, got ${palette.roles.background.hex} / ${palette.roles.surface.hex}`,
	)
	assert.notEqual(palette.roles.surface.hex, palette.roles.background.hex)

	// Both blocks are in the image, and the heavier one leads — here the two stripes are equal in
	// area, so all that is asserted is that both published colours are the two fixture colours.
	const published = [palette.roles.background.hex, palette.roles.surface.hex].sort()
	assert.deepEqual(published, ["#0a14c8", "#fadc1e"])
})

test("a many-colour collage retreats to one colour: nothing to rescue", async () => {
	const path = join(fixtureDirectory, "sixteen-blocks.png")
	// Sixteen mutually far-apart colours, equal area. The best two cover 2/16 = 0.125 of the image,
	// well under NO_FIELD_EXPLAINED_FRACTION, so the rescue must decline.
	const colors: Rgb8[] = []
	for (let index = 0; index < 16; index += 1) {
		colors.push([
			(index % 4) * 85,
			(Math.floor(index / 4) % 4) * 85,
			((index * 7) % 4) * 85,
		])
	}
	await writeStripes(path, colors)

	const { palette, diagnostics } = await analyzeImage(path)

	assert.equal(diagnostics.noField, true, "sixteen far-apart colours are not a field")
	assert.equal(
		diagnostics.twoBlockFallback,
		false,
		"noField without twoBlockFallback is the retreat — two colours cannot explain half of this",
	)
	assert.equal(diagnostics.gradient, false)
	assert.equal(palette.gradient, null)
	assert.equal(
		palette.collapse.surfaceCollapsed,
		true,
		`the retreat is one flat colour, got ${palette.roles.background.hex} / ${palette.roles.surface.hex}`,
	)
	assert.equal(palette.roles.surface.hex, palette.roles.background.hex)
})

// ---------------------------------------------------------------------------------------------
// The two anchors of the t-continuity threshold (SPEC decision 5, ruling 2026-08-05)
// ---------------------------------------------------------------------------------------------

/**
 * `CONTINUOUS_MIDDLE_BAND_MASS` is `[UNCALIBRATED]` and the ruling anchors it on two named covers:
 * round-3 item 8 must read **continuous**, `2376a6b67d` must read **bimodal**. Those are the two
 * measurements the constant was picked between, so they belong in the suite rather than in a report
 * — a constant whose only justification is two numbers should fail loudly when either number moves.
 *
 * Both covers are corpus files resolved against the repository root, like `demo-20`'s own paths.
 */
const ANCHOR_CONTINUOUS = "09/ab67616d0000b27300096440c40e31757a78343d"
const ANCHOR_BIMODAL = "00/ab67616d00001e020000269ead63cf2376a6b67d.jpg"
/** Round-3 item 1, the cover whose reviewer comment decision 17 exists to answer. */
const ANCHOR_GUIDE_STOP = "00/ab67616d00001e0200001a9be12b7116a8247378.jpg"

test("anchor: round-3 item 8 reads continuous and publishes its ramp", async () => {
	const { palette, diagnostics } = await analyzeImage(resolve(REPO_ROOT, ANCHOR_CONTINUOUS))
	// v0.6.1: the discriminator's reading is a `Diagnostics` field, not a separate `Analysis` one.
	const continuity = diagnostics.continuity

	assert.ok(continuity !== null, "the chord left the artwork, so the discriminator ran")
	assert.equal(continuity.bimodal, false, `middle-band mass ${continuity.middleBandMass}`)
	// The measured value the threshold was set below. A tolerance, not an equality: the number is a
	// property of the cover and the fit, and it is quoted in `ramp.ts`'s provenance as 0.2982.
	assert.ok(
		Math.abs(continuity.middleBandMass - 0.2982) < 0.01,
		`item 8's middle-band mass was 0.2982 when the threshold was set, now ${continuity.middleBandMass}`,
	)

	// The outcome the ruling asked for: a ramp, not the two-block reading v0.5.1 published here.
	assert.equal(diagnostics.twoBlockFallback, false)
	assert.equal(diagnostics.gradient, true)
	assert.notEqual(palette.gradient, null)
	assert.equal(palette.collapse.surfaceCollapsed, false)
})

test("anchor: 2376a6b67d reads bimodal and keeps its two-block palette", async () => {
	const path = resolve(REPO_ROOT, ANCHOR_BIMODAL)
	const { palette, diagnostics } = await analyzeImage(path)

	// The **field** reading is byte-identical to v0.5.1, which is what this anchor is about: the
	// discriminator's verdict must not move under decision 17's or 18's rulings.
	assert.equal(palette.roles.background.hex, "#fad107")
	assert.equal(palette.roles.surface.hex, "#f9fbf8")
	// The **accent** moved in v0.8.1 (`#000300` → the red): decision 18(a)'s pool re-union let the red
	// component reach a role. v0.8.2's class ordering decides *which* role — the black ink keeps the
	// foreground it held in v0.7.1 and the red takes the accent, which is round 3's verbatim ask. Both
	// are role-sourcing changes, not field-reading ones, and the trace is in `tests/assignment.test.ts`.
	assert.equal(palette.roles.foreground.hex, "#000000")
	assert.equal(palette.roles.accent.hex, "#f81107")
	assert.equal(palette.gradient, null)
	assert.equal(diagnostics.twoBlockFallback, true)

	// Its two-block reading comes from the component pool, not from `readRamp`'s decision-5 fallback,
	// so the discriminator is never consulted on the published path. The anchor is still measurable,
	// and it is measured here the way the ruling names it: the inlier mass of the whole-image fit
	// along the chord between the two colours this cover actually publishes.
	const { raster, inventory } = await decodeAndInventory(path)
	const continuity = rampContinuity(
		fitField(raster),
		raster,
		rgbToOkLab(palette.roles.background.rgb),
		rgbToOkLab(palette.roles.surface.rgb),
	)
	assert.equal(continuity.bimodal, true, `middle-band mass ${continuity.middleBandMass}`)
	// 0.0446 is the *most generous* reading available for this cover — on the component weights the
	// reading actually uses it is 0.0000 — and it is the one `ramp.ts`'s provenance quotes, because a
	// threshold should clear the hardest version of its own counterexample.
	assert.ok(
		Math.abs(continuity.middleBandMass - 0.0446) < 0.005,
		`2376a6b67d's middle-band mass was 0.0446 when the threshold was set, now ${continuity.middleBandMass}`,
	)
	assert.ok(inventory.has(packRgb(palette.roles.surface.rgb)))
})

// ---------------------------------------------------------------------------------------------
// SPEC decision 17: the cover the ruling was written for
// ---------------------------------------------------------------------------------------------

/**
 * Round-3 item 1 drew the comment decision 17 quotes verbatim — *"the gradient might be better with a
 * 3rd or 4th stop added to lead the interpolation through colors that better match the artwork"*. It
 * is the ruling's only cover-level evidence, so its measurement belongs in the suite rather than in a
 * report: if the path stops bending, or the stop stops reducing, this is where that shows up.
 *
 * The three roles decision 17 must not touch are asserted byte-identical to v0.7.0 — decision 17
 * changes what the interpolation runs *through*, not which colours the palette publishes — and they
 * are the assertions that fail if a ramp change starts leaking into role selection through the
 * foreground's over-the-ramp contrast floor (which it legitimately can: see `757a78343d`).
 *
 * **The accent moved in v0.8.1**, `#263143` → `#736e6a`, and not through the ramp: decision 18(a)'s
 * pool re-union offers this cover's second field-like component (support 0.138, field mass 5 233) to
 * the ink roles, and it outweighs every rejected-mass cluster on the cover by an order of magnitude
 * (the deep blue it displaces carried 144). The foreground is untouched because the cream title's own
 * legibility keeps it at the head of its shortlist. Recorded here rather than re-baselined silently.
 */
test("anchor: 16a8247378 publishes a guide stop that leads the interpolation back to its path", async () => {
	const { palette, diagnostics, pathExcursion, componentCandidates } = await analyzeImage(
		resolve(REPO_ROOT, ANCHOR_GUIDE_STOP),
	)

	assert.equal(palette.roles.background.hex, "#484b5a")
	assert.equal(palette.roles.surface.hex, "#5d3f27")
	assert.equal(palette.roles.foreground.hex, "#fee2ba")
	// v0.9.0 moved the accent to a **mark**: `#746045` led `#736e6a` on both readings (mass 55 989
	// against 5 233, chroma .0476 against .0088), so the *pool* moved it rather than the tie-break.
	//
	// **v0.9.2's coherence gate moves it back**, and this is one of the pass's three movers. The mark
	// is 62.2% of the frame at **.294** self-coherence — a blend median by the gate's own definition —
	// so it contributes no identity family, the component's `#736e6a` leads on coverage, and the
	// published accent returns to **v0.8.x's answer byte-identically**.
	//
	// **The standing note comes back with it.** Round-3 item 1 graded this cover *acceptable* with the
	// one remark *"accent is a little hard to see on top of the background"* — said about `#736e6a`,
	// which is what is published again here (chroma .0088 against the background's `#484b5a`). No
	// reviewer-blessed accent is displaced either way; what v0.9.2 does is trade an unreviewed browner
	// mark for the reviewed colour that drew a note, and round 5 is where that is answered.
	assert.equal(palette.roles.accent.hex, "#736e6a", "was #263143 pre-union, #746045 in v0.9.0–0.9.1")
	assert.equal(componentCandidates.length, 1, "one unslotted component, and it is still offered")
	assert.equal(componentCandidates[0]!.published, "#736e6a")

	assert.ok(pathExcursion !== null, "a published gradient always measures its own path")
	// The chord leaves the field's colour path by well over a bar — the ruling's premise on its own
	// evidence cover. 2.573 bars when the rule was written.
	assert.ok(
		pathExcursion.chord / POOLED_SAME_COLOR_BAR > 2,
		`path excursion of the chord was 2.573 bars, now ${pathExcursion.chord / POOLED_SAME_COLOR_BAR}`,
	)
	// And one interior stop more than halves it. 1.213 bars when the rule was written.
	assert.ok(
		pathExcursion.published * 2 < pathExcursion.chord,
		`published path excursion ${pathExcursion.published} against a chord of ${pathExcursion.chord}`,
	)
	assert.equal(diagnostics.thirdStopAccepted, true)

	const stops = palette.gradient?.stops ?? []
	assert.equal(stops.length, 3, "a third stop is what the reviewer asked for here")
	assert.equal(stops[0].color.hex, palette.roles.background.hex)
	assert.equal(stops[2].color.hex, palette.roles.surface.hex)
	// Decision 17's own conjuncts, on the published colours: monotone, spaced, and a colour the ends
	// do not carry.
	assert.equal(
		guideStopRefusal(
			stops[1].position,
			stops[1].color,
			palette.roles.background,
			palette.roles.surface,
		),
		null,
	)
	// Invariant 2: the stop is an exact artwork triple, published without a second snap.
	const { inventory } = await decodeAndInventory(resolve(REPO_ROOT, ANCHOR_GUIDE_STOP))
	assert.ok(inventory.has(packRgb(stops[1].color.rgb)), `${stops[1].color.hex} is not in the artwork`)
})
