/**
 * Determinism, contract validity, and the one path the demo set never exercises.
 *
 * **Determinism is the load-bearing property here**, not a nicety. The SPEC forbids any tie broken
 * on anything but pixel values and raster coordinates, and the dev loop's whole cache/diff design
 * rests on "two runs of the same candidate over the same set produce byte-identical rows"
 * (`src/devloop/types.ts`). A `Map` iterated in the wrong place, a `sort` handed a non-transitive
 * comparator, a `Set` used for ordering — each of those is invisible in a single run and shows up as
 * an unexplainable diff a week later. So the test is the strongest available: run the whole
 * candidate twice and compare the serialised palettes byte for byte.
 *
 * **Contract validity** is the cycle-1 goal the SPEC actually states (*"quality is explicitly not
 * the cycle-1 goal; validity + measurability are"*), so the fixtures are pushed through
 * `validatePalette` and any violation fails the test.
 *
 * **The linear field.** No cover in `demo-20` has a linear-adequate field — all twenty type as
 * `flat` or `none` — so without a synthetic fixture the entire ramp path would ship untested and the
 * gradient-endpoint ruling would be a comment rather than a checked property. The vertical-ramp
 * fixture below is here for exactly that reason, and its failure would mean the gradient half of the
 * design is dead code rather than merely unexercised.
 */

import { test, describe, before, after } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { validatePalette } from "../../../../src/contract/invariants.ts"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import { paletteOf } from "../candidate.ts"
import { nodesOf } from "../dump.ts"
import { parseImage } from "../parse.ts"

let directory = ""

before(async () => {
	directory = await mkdtemp(join(tmpdir(), "p2-alpha-det-"))
})

after(async () => {
	if (directory !== "") await rm(directory, { recursive: true, force: true })
})

async function writeFixture(name: string, width: number, height: number, at: (x: number, y: number) => Rgb8): Promise<string> {
	const raw = Buffer.alloc(width * height * 3)
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const [red, green, blue] = at(x, y)
			const offset = (y * width + x) * 3
			raw[offset] = red
			raw[offset + 1] = green
			raw[offset + 2] = blue
		}
	}
	const path = join(directory, `${name}.png`)
	await sharp(raw, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 0 }).toFile(path)
	return path
}

/** A flat field with two marks on it: the structural branch's ordinary case. */
const flatField = (x: number, y: number): Rgb8 => {
	if (x >= 8 && x < 24 && y >= 8 && y < 24) return [20, 20, 24]
	if (x >= 34 && x < 42 && y >= 34 && y < 42) return [230, 40, 30]
	return [238, 236, 230]
}

/**
 * A vertical ramp with one mark. Each row moves the blue channel by two 8-bit steps, which is under
 * every regional bar, so the whole ramp chains into one α-zone (`alpha-zones.test.ts` pins that) and
 * the linear model is the first one adequate.
 */
const verticalRamp = (x: number, y: number): Rgb8 => {
	if (x >= 20 && x < 44 && y >= 26 && y < 38) return [250, 250, 250]
	return [30 + y, 40 + y, 120 + y * 2]
}

/** Deterministic fine texture with no flat field at all: the degenerate branch's case. */
const texture = (x: number, y: number): Rgb8 => [
	(x * 29 + y * 7) % 256,
	(x * 11 + y * 43) % 256,
	(x * 53 + y * 17) % 256,
]

const FIXTURES = [
	{ name: "flat-field", width: 48, height: 48, at: flatField },
	{ name: "vertical-ramp", width: 64, height: 64, at: verticalRamp },
	{ name: "texture", width: 40, height: 40, at: texture },
] as const

describe("determinism", () => {
	for (const fixture of FIXTURES) {
		test(`${fixture.name}: two runs produce byte-identical palette JSON`, async () => {
			const path = await writeFixture(fixture.name, fixture.width, fixture.height, fixture.at)
			const first = JSON.stringify(await paletteOf(path))
			const second = JSON.stringify(await paletteOf(path))
			assert.equal(first, second)
		})

		test(`${fixture.name}: two runs produce byte-identical node dumps`, async () => {
			const path = await writeFixture(`${fixture.name}-dump`, fixture.width, fixture.height, fixture.at)
			const first = JSON.stringify(await nodesOf(path))
			const second = JSON.stringify(await nodesOf(path))
			assert.equal(first, second)
		})
	}

	test("a copy of the same bytes under a different name produces the same palette", async () => {
		// Nothing may be derived from the filename or from a content hash — the SPEC's rule, and the
		// cheapest way for it to be broken by accident is a cache keyed on the wrong thing.
		const original = await writeFixture("named-one", 48, 48, flatField)
		const copy = await writeFixture("named-two-different-length", 48, 48, flatField)
		const first = JSON.parse(JSON.stringify(await paletteOf(original)))
		const second = JSON.parse(JSON.stringify(await paletteOf(copy)))
		delete first.metadata
		delete second.metadata
		assert.deepEqual(first, second)
	})
})

describe("contract validity", () => {
	for (const fixture of FIXTURES) {
		test(`${fixture.name} publishes a valid palette`, async () => {
			const path = await writeFixture(`${fixture.name}-valid`, fixture.width, fixture.height, fixture.at)
			const palette = await paletteOf(path)
			const result = validatePalette(palette)
			assert.deepEqual(result.violations, [], `violations on ${fixture.name}`)
		})
	}

	test("a published gradient's ends are exactly the two field roles", async () => {
		const path = await writeFixture("ramp-endpoints", 64, 64, verticalRamp)
		const palette = await paletteOf(path)
		assert.notEqual(palette.gradient, null, "the ramp fixture must publish a gradient")
		const stops = [...(palette.gradient?.stops ?? [])]
		assert.ok(stops.length >= 2)
		assert.equal(stops[0]?.color.hex, palette.roles.background.hex)
		assert.equal(stops[stops.length - 1]?.color.hex, palette.roles.surface.hex)
		assert.equal(stops.length, 2, "cycle 1 publishes two stops or null; a third stop is out of scope")
		assert.equal(palette.collapse.surfaceCollapsed, false, "a collapsed surface forbids a gradient")
	})

	test("a flat field publishes no gradient", async () => {
		const path = await writeFixture("flat-no-gradient", 48, 48, flatField)
		const palette = await paletteOf(path)
		assert.equal(palette.gradient, null)
	})
})

describe("the field model reaches every branch it claims to", () => {
	test("a flat field types flat, a ramp types linear, and pure texture types none", async () => {
		const flat = await parseImage(await writeFixture("model-flat", 48, 48, flatField))
		assert.equal(flat.model.kind, "flat")
		assert.equal(flat.roles.branch, "structural")

		const ramp = await parseImage(await writeFixture("model-ramp", 64, 64, verticalRamp))
		assert.equal(ramp.model.kind, "linear")
		assert.equal(ramp.roles.sources.background, "ramp-low")
		assert.equal(ramp.roles.sources.surface, "ramp-high")

		const noise = await parseImage(await writeFixture("model-none", 40, 40, texture))
		assert.equal(noise.model.kind, "none")
		assert.equal(noise.roles.branch, "degenerate")
		assert.equal(noise.roles.sources.background, "image-mode")
	})

	test("the tree is a tree: every retained node's parent precedes it and areas nest", async () => {
		const dump = await nodesOf(await writeFixture("tree-shape", 48, 48, flatField))
		assert.ok(dump.nodes.length > 0)
		assert.equal(dump.nodes[0].parent, null, "node 0 is the root")
		assert.equal(dump.nodes[0].areaFraction, 1)
		const byId = new Map(dump.nodes.map((node) => [node.id, node]))
		for (const node of dump.nodes) {
			assert.equal(node.id, dump.nodes.indexOf(node), "nodes are sorted by id")
			if (node.parent === null) continue
			assert.ok(node.parent < node.id, "a parent is always published before its child")
			const parent = byId.get(node.parent)
			assert.ok(parent !== undefined)
			assert.ok(node.areaFraction <= (parent as { areaFraction: number }).areaFraction + 1e-12)
			assert.equal(node.depth, (parent as { depth: number }).depth + 1)
			assert.ok(node.levelBars >= 1, "α = 1 bar is the finest level in the tree")
		}
	})
})
