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
import { readFile } from "node:fs/promises"
import { dirname, isAbsolute, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { hex } from "../../../src/contract/color.ts"
import { ALGORITHM_VERSION, candidateId, paletteOf, PREPROCESSING_VERSION } from "../candidate.ts"
import { decodeAndInventory, packRgb } from "../src/decode.ts"

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
	assert.equal(ALGORITHM_VERSION, "p5-fieldfit-0.1.0")
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
