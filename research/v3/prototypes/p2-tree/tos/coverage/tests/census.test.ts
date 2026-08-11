/**
 * **The census is a function of the pool, and of nothing else.**
 *
 * Three properties, because a census that moved with visiting order would make every allocation
 * decision below it an artefact of an array:
 *
 *  1. **determinism** — two runs of the whole pipeline over the same file produce the same families,
 *     the same ranks, the same representatives;
 *  2. **order-independence** — shuffling `parse.nodes` before the census does not move a family. The
 *     grouping is single-linkage on a *sorted* hue circle and every aggregate is a min/max/sum, so this
 *     is a property of the construction; the test is here because "is" and "stays" are different claims;
 *  3. **the split is the pipeline's own** — the lower-median growth this module recomputes equals the
 *     one `pipeline.ts` published in `parse.notes` as `salience-median-growth:…`, so D3's level and the
 *     family ranking are gated on one statement about the image rather than two.
 *
 * Plus the derived separation: asserted against its geometry rather than against a copied number, so a
 * recalibration of either contract input moves the assertion with it.
 */

import assert from "node:assert/strict"
import { access } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { REGION_CHROMA_BOUNDARY, SAME_COLOR_BAR_BY_REGION } from "../../../../../src/contract/constants.ts"
import { runChromaPipeline } from "../../lanes/pool.ts"
import { FAMILY_HUE_SEPARATION, familyCensus, lowerMedian } from "../census.ts"

const V3_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..")
const REPO_ROOT = resolve(V3_ROOT, "..", "..")
/** D9's acceptance cover — the one the census has to be right about. */
const ACCEPTANCE_IMAGE = resolve(REPO_ROOT, "00", "ab67616d00001e0200000f92552b0935b967964d.jpg")

async function requireImage(path: string): Promise<string> {
	await access(path).catch(() => {
		throw new Error(`missing corpus image ${path}; the corpus shards must be linked into the worktree`)
	})
	return path
}

test("the family separation is the same-colour bar's hue geometry at the chromatic boundary", () => {
	// 2·C·sin(Δh/2) = bar, at C = the neutral/saturated strata boundary, with the widest saturated bar.
	const chord = 2 * REGION_CHROMA_BOUNDARY * Math.sin(FAMILY_HUE_SEPARATION / 2)
	assert.ok(Math.abs(chord - SAME_COLOR_BAR_BY_REGION["light-saturated"]) < 1e-12, `chord ${chord}`)
	// Sanity on the scale it lands at: a fifteenth of the hue circle, not a degree and not a quadrant.
	assert.ok(FAMILY_HUE_SEPARATION > 0.4 && FAMILY_HUE_SEPARATION < 0.5, `${FAMILY_HUE_SEPARATION} rad`)
})

test("the lower median is the order statistic, not the mean of the middle pair", () => {
	assert.equal(lowerMedian([3, 1, 2]), 2)
	assert.equal(lowerMedian([4, 1, 2, 3]), 2)
	assert.equal(lowerMedian([]), Number.POSITIVE_INFINITY)
})

test("the census is deterministic, order-independent, and split on the pipeline's own median", async () => {
	const path = await requireImage(ACCEPTANCE_IMAGE)
	const first = familyCensus((await runChromaPipeline(path)).parse)
	const second = (await runChromaPipeline(path)).parse
	const secondCensus = familyCensus(second)

	const shape = (census: ReturnType<typeof familyCensus>) =>
		census.families.map((family) => ({
			rank: family.rank,
			repr: family.representative.hex,
			members: family.members.map((member) => member.hex),
			level: family.salienceLevel,
			growth: family.bestGrowth,
		}))

	assert.deepEqual(shape(secondCensus), shape(first), "two runs must produce the same census")

	// (2) shuffle the node array with a fixed permutation and census again.
	const shuffled = { ...second, nodes: second.nodes.slice() }
	for (let index = shuffled.nodes.length - 1; index > 0; index -= 1) {
		// A deterministic permutation — a seeded LCG, so a failure is reproducible.
		const swap = (index * 1103515245 + 12345) % (index + 1)
		const held = shuffled.nodes[index]
		shuffled.nodes[index] = shuffled.nodes[swap]
		shuffled.nodes[swap] = held
	}
	assert.deepEqual(shape(familyCensus(shuffled)), shape(first), "the census must not depend on node array order")

	// (3) the salience split is the one the pipeline published.
	const note = second.notes.find((entry) => entry.startsWith("salience-median-growth:"))
	assert.ok(note !== undefined, "the pipeline must publish its salience median for this to be checkable")
	assert.equal(first.medianGrowth, Number(note.slice("salience-median-growth:".length)))
})

test("the acceptance cover carries exactly two families: a red and a green", async () => {
	const path = await requireImage(ACCEPTANCE_IMAGE)
	const census = familyCensus((await runChromaPipeline(path)).parse)
	assert.equal(census.families.length, 2, `families: ${census.families.map((family) => family.representative.hex)}`)

	// Named by hue band rather than by hex, so the assertion survives a representative moving one LSB.
	const degrees = census.families.map((family) => [(family.hueStart * 180) / Math.PI, (family.hueEnd * 180) / Math.PI])
	const red = degrees.findIndex(([start, end]) => start < 60 && end < 60)
	const green = degrees.findIndex(([start, end]) => start > 90 && end < 160)
	assert.ok(red !== -1, `no red-family arc in ${JSON.stringify(degrees)}`)
	assert.ok(green !== -1, `no green-family arc in ${JSON.stringify(degrees)}`)
	assert.notEqual(red, green)
})
