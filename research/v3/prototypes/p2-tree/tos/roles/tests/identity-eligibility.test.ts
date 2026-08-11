/**
 * **D12's two fixes, as artefacts.**
 *
 * `DECISIONS.md` D12 names two defects with a measurement behind each, and this file is the regression
 * evidence for both. The measurements live in `identity/q1/report.json` and `identity/q2/report.json`;
 * what is asserted here is the *behaviour that follows from them*, on the same three covers.
 *
 *  1. **Cross-lane dedup** (`roles/coincidence.ts`). Round 3a item 5 published a foreground of raw APCA
 *     7.7 that came from a "text group" of four components which were **one physical mark** — 2 L, 1 a,
 *     1 b, centroids within five pixels. Coincident centroids make `collinearity` answer 0 vacuously, so
 *     the whole of arm-b §2.4's conjunction was satisfied by a single blob. A merged component counts
 *     once toward `TEXT_MIN_COMPONENTS`, so that group must not form.
 *  2. **Antialias ineligibility** (`roles/eligibility.ts`). Round 3a item 2 published `#fcffff`, a
 *     one-pixel halo tracing the outline of the cover's photograph (five components, every one of
 *     inradius 1 px and boundary fraction 1.0). It reached the foreground because invariant I4 refused
 *     the artwork's real type `#1e2221` and the walk descended into the residual. A region with no
 *     interior pixel now sorts after every region that has one.
 *
 * **The counter-case is asserted with the same instrument**, because a rule that demotes near-whites
 * rather than filaments would pass the item-2 assertion and be wrong: item 1's foreground is a blown
 * highlight whose bar mask is a 16,937-pixel region of inradius 57.9 px, and it must stay eligible.
 *
 * *Amended after `DECISIONS.md` D15.* Lowering `UNREADABLE_COVERAGE_FRACTION` to 0.25 lifted item 1's
 * cover off the unreadable fallback and onto the field path, so the pool no longer names that region
 * with the residual triple `#fcfefd` the fallback used — it names it with a node's own representative.
 * The **claim** is unchanged and the hex was never the claim: a large genuine flat region must stay
 * eligible for identity roles, and only boundary-tracing regions are demoted. So the candidate is found
 * by the contract's ruler (which pool colour *is* that region, at the bar) rather than by a literal, and
 * "not demoted" is asserted on the ordering — no tracer ranks ahead of it — rather than on its rank. A
 * later constant ruling can move the pool again without making this file wrong about anything.
 *
 * ### What is deliberately not asserted
 *
 * **No hex is pinned on item 2.** D12 escalated invariant I4's ε floor to the main orchestrator as the
 * reason the artwork's true ink `#1e2221` cannot publish; until the reviewer rules, what *should* be
 * there is not decided, and pinning today's answer would freeze a consequence of an open contract
 * question. Three properties are asserted instead, and none of them depends on that ruling: the two
 * measured halos still measure as halos, they still sit **in** the pool but behind what published
 * (ordering, not retention), and what published is **carried by a retained node** — which is this
 * pipeline's own statement that a colour is a region of the artwork, and exactly what item 2's published
 * residual triple was not.
 *
 * ### Which instrument decides which claim
 *
 * `identity/pixels.ts`'s `barMaskOf` is the unit W-I measured with — every pixel the contract's regional
 * ruler calls the same colour as the subject — and it is what the pipeline itself uses for a **residual**
 * colour, so the halo and blown-highlight assertions are the pipeline's own measurement re-run
 * independently. For a **node**-backed colour the pipeline measures the node's mask instead, because a
 * node *is* a region in its own terms; those two readings can disagree on a colour whose node is real and
 * whose bar mask across the whole image is thin, so the node-backed claims here are asserted as
 * node-backing rather than through the pixel instrument. Stating which is which is the point: a test that
 * mixed them would fail on two instruments disagreeing rather than on the pipeline being wrong.
 */

import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { test } from "node:test"
import { colorFromRgb, rgbToHex, sameColor } from "../../../../../src/contract/color.ts"
import type { Rgb8 } from "../../../../../src/contract/types.ts"
import { paletteWithDiagnostics } from "../../candidate.ts"
import { attribute, barMaskOf } from "../../identity/pixels.ts"
import { decodeImage } from "../../pipeline.ts"
import { mergeCoincidentComponents, type CoincidenceCandidate } from "../coincidence.ts"
import { boundaryTracingLevel, hasInteriorPixel } from "../eligibility.ts"

/** The repository root: six levels up from `research/v3/prototypes/p2-tree/tos/roles/tests`. */
const REPOSITORY_ROOT = resolve(import.meta.dirname, "../../../../../../..")

/** Round 3a item 5 — the phantom text group. `review-rounds/round-3-quality/items.json`. */
const PHANTOM_GROUP_COVER = "02/ab67616d00001e020002653adc4ef57bc46a3680.jpg"
/** What the phantom group published, and what the reviewer called an unreadable foreground. */
const PHANTOM_GROUP_HEX = "#b9e0b1"
/** Round 3a item 2 — the published one-pixel halo. */
const HALO_COVER = "00/ab67616d0000b27300008912d4517960ad020c7a.jpg"
/** Round 3a item 1 — the blown highlight that must stay eligible. */
const HIGHLIGHT_COVER = "00/ab67616d0000b27300005f98559139b7dbc802fd.jpg"

/** Does the contract's bar mask for this colour have an interior pixel anywhere in the image? */
async function barMaskHasInterior(path: string, color: Rgb8): Promise<boolean> {
	const image = await decodeImage(path)
	return hasInteriorPixel(barMaskOf(image, color), image.width, image.height)
}

// -------------------------------------------------------------------------------------------------
// The merge criterion, without the corpus
// -------------------------------------------------------------------------------------------------

/** A square region of `size` px at `(x, y)`, in an `imageSize`-square image. */
function square(imageSize: number, x: number, y: number, size: number, repr: Rgb8): CoincidenceCandidate {
	return {
		centroidX: (x + (size - 1) / 2) / imageSize,
		centroidY: (y + (size - 1) / 2) / imageSize,
		minX: x,
		minY: y,
		maxX: x + size - 1,
		maxY: y + size - 1,
		areaPixels: size * size,
		repr,
		contains: (pixel: number): boolean => {
			const px = pixel % imageSize
			const py = (pixel - px) / imageSize
			return px >= x && px < x + size && py >= y && py < y + size
		},
	}
}

test("the merge is spatial identity AND colour agreement, never spatial identity alone", () => {
	const size = 400
	const ink: Rgb8 = [20, 20, 20]
	// Two lanes naming the same mark: same place, same colour, one slightly larger than the other.
	const sameMark = [square(size, 100, 100, 20, ink), square(size, 99, 99, 22, ink)]
	assert.deepEqual(
		mergeCoincidentComponents(sameMark, size, size),
		[[0, 1]],
		"two namings of one mark, same colour, must merge into one component",
	)

	// The glyph-over-a-scrim case: the same place, a genuinely different colour. Merging these on
	// position alone would delete one of the two marks the artwork actually carries.
	const overScrim = [square(size, 100, 100, 20, ink), square(size, 99, 99, 22, [240, 60, 60])]
	assert.deepEqual(
		mergeCoincidentComponents(overScrim, size, size),
		[[0], [1]],
		"two different colours at one position are two marks; the bar is what says so",
	)

	// A badge concentric with its panel: same colour, same centroid, 100% contained — and refused, by
	// the box clause, because the two do not cover the same place. This is the case
	// `COMPONENT_CHAIN_AREA_AGREEMENT`'s own doc comment names as the one a region rule must not swallow.
	// A row of six glyphs is refused earlier still, at the centroid clause.
	const nested = [square(size, 100, 100, 60, ink), square(size, 120, 120, 20, ink)]
	assert.deepEqual(mergeCoincidentComponents(nested, size, size), [[0], [1]], "a concentric nesting is two regions")

	const row = Array.from({ length: 6 }, (_unused, index) => square(size, 40 + index * 30, 100, 20, ink))
	assert.deepEqual(
		mergeCoincidentComponents(row, size, size),
		[[0], [1], [2], [3], [4], [5]],
		"a line of type must survive the merge as six components, or the detector loses its input",
	)
})

test("a region with no interior pixel is exactly a one-pixel tracer", () => {
	// A 1-px-thick ring: every pixel touches the outside, so there is no interior.
	const ring = new Uint8Array(7 * 7)
	for (let index = 0; index < 7; index += 1) {
		ring[index] = 1
		ring[6 * 7 + index] = 1
		ring[index * 7] = 1
		ring[index * 7 + 6] = 1
	}
	assert.equal(hasInteriorPixel(ring, 7, 7), false, "a one-pixel ring traces a boundary")

	// The same ring filled: the middle pixel has four neighbours inside.
	const filled = new Uint8Array(7 * 7).fill(1)
	assert.equal(hasInteriorPixel(filled, 7, 7), true, "a filled square has an interior")

	// A 2-px-wide ring has an interior in its own wall; a single pixel and an empty mask do not.
	assert.equal(hasInteriorPixel(new Uint8Array(7 * 7), 7, 7), false, "an empty mask has no interior")
	const dot = new Uint8Array(7 * 7)
	dot[3 * 7 + 3] = 1
	assert.equal(hasInteriorPixel(dot, 7, 7), false, "one pixel is all boundary")
})

// -------------------------------------------------------------------------------------------------
// The three covers
// -------------------------------------------------------------------------------------------------

test("round 3a item 5: one physical mark no longer masquerades as a line of type", async () => {
	const path = join(REPOSITORY_ROOT, PHANTOM_GROUP_COVER)
	assert.ok(existsSync(path), `the corpus shard is missing: ${path}`)
	const { palette, parse } = await paletteWithDiagnostics(path)

	// The merge fired on this cover, and it is the reason the group is gone.
	assert.ok(
		parse.notes.some((note) => note.startsWith("coincident-components-merged:")),
		`no components were merged on the cover the merge was written for: ${JSON.stringify(parse.notes)}`,
	)
	assert.deepEqual(
		parse.textGroups.map((group) => rgbToHex(group.repr)),
		[],
		"the phantom group is a single blob named once per lane; no group may form from it",
	)
	assert.notEqual(
		palette.roles.foreground.hex,
		PHANTOM_GROUP_HEX,
		"the foreground the reviewer called unreadable is still being published",
	)
	// Not an assertion about which colour wins — only that the fall-through went to the readability
	// ranking, which is the degradation the detector's false negatives are supposed to reach.
	assert.equal(rgbToHex(parse.foregroundPool[0]), palette.roles.foreground.hex)
})

test("round 3a item 2: the published foreground is a region of the artwork, not a boundary tracer", async () => {
	const path = join(REPOSITORY_ROOT, HALO_COVER)
	assert.ok(existsSync(path), `the corpus shard is missing: ${path}`)
	const { palette, parse } = await paletteWithDiagnostics(path)

	const poolHexes = parse.foregroundPool.map(rgbToHex)
	const publishedRank = poolHexes.indexOf(palette.roles.foreground.hex)
	assert.ok(publishedRank >= 0, "the published foreground did not come from the parse's own pool")

	// The halo W-I attributed, and the near-white beside it, are both one-pixel tracers under the same
	// instrument that report used — the contract's bar mask.
	for (const halo of [[252, 255, 255], [250, 254, 255]] as Rgb8[]) {
		const hex = colorFromRgb(halo).hex
		assert.equal(await barMaskHasInterior(path, halo), false, `${hex} was measured as a one-pixel halo and no longer reads as one`)
		assert.notEqual(palette.roles.foreground.hex, hex, `the published foreground is still the halo ${hex}`)
		// **Ordering, not retention.** The halo stays reachable — the assembly walk may still need it —
		// and only sorts behind every candidate that is a region.
		const haloRank = poolHexes.indexOf(hex)
		assert.ok(haloRank >= 0, `${hex} was removed from the pool; the level is an ordering, not a filter`)
		assert.ok(haloRank > publishedRank, `${hex} still ranks ahead of the published foreground`)
	}

	// The property, not the hex: I4 still refuses the artwork's true ink (D12's escalation), so what
	// publishes here is not settled — but whatever it is has to be a **region of the artwork**, which in
	// this pipeline's own terms means a retained node names it. Item 2's defect was publishing a
	// residual triple with no node behind it at all.
	assert.ok(
		parse.nodes.some((node) => rgbToHex(node.repr) === palette.roles.foreground.hex),
		`the published foreground ${palette.roles.foreground.hex} is carried by no retained node`,
	)
	// The detector still finds the artwork's own type; it is the contract that refuses it.
	assert.ok(
		parse.textGroups.length > 0,
		"the text detector must still find this cover's type — the merge may not cost recall here",
	)
})

test("round 3a item 1: the blown highlight stays eligible for an identity role", async (context) => {
	const path = join(REPOSITORY_ROOT, HIGHLIGHT_COVER)
	assert.ok(existsSync(path), `the corpus shard is missing: ${path}`)
	const { palette, parse } = await paletteWithDiagnostics(path)
	const image = await decodeImage(path)
	const hasInterior = (color: Rgb8): boolean =>
		hasInteriorPixel(barMaskOf(image, color), image.width, image.height)

	// This cover still has no text group at all, so the foreground is decided inside the identity
	// ordering — which is exactly where a rule that demoted near-whites rather than filaments would show
	// up. (`parse.notes` carries `no-text-groups:contrast-ranking-only` for the same fact.)
	assert.deepEqual(parse.textGroups.map((group) => rgbToHex(group.repr)), [], "this cover carries no type")
	context.diagnostic(
		`verdict=${parse.verdict} coverage=${parse.coverage.toFixed(4)} pool=${parse.foregroundPool.length} published=${palette.roles.foreground.hex}`,
	)

	// ---- the premise, re-measured rather than quoted -------------------------------------------------
	//
	// D12's counter-case is a *region*, and the instrument says so on its own: the blown highlight's bar
	// mask is a thick area with an interior, nothing like the one-pixel tracers item 2 published. The
	// measurement is re-run here rather than pinned, because the number is what the rule turns on.
	const highlight: Rgb8 = [252, 254, 253]
	const measured = attribute(image, highlight)
	assert.equal(hasInterior(highlight), true, "the fixture's premise is wrong: the blown highlight has no region")
	assert.equal(boundaryTracingLevel(true), 0, "a region with an interior is not demoted; that is the rule")
	assert.ok(
		measured.maxInradius > 1,
		`the blown highlight measures as a filament (inradius ${measured.maxInradius}), so this cover no longer tests the counter-case`,
	)
	context.diagnostic(
		`blown highlight: ${measured.barPixels} bar px, inradius ${measured.maxInradius.toFixed(1)} px, boundary fraction ${measured.boundaryFraction.toFixed(3)}`,
	)

	// ---- eligibility, on whichever path the cover now takes ------------------------------------------
	//
	// **No hex is pinned.** `DECISIONS.md` D15 moved `UNREADABLE_COVERAGE_FRACTION` to 0.25, this cover's
	// coverage clears the new gate, and the pool is now built by the field path rather than by the
	// unreadable fallback — so the exact triple the fallback used to publish for this region (`#fcfefd`,
	// a residual) is not the triple the field path names it with. What must survive that change is the
	// **region's eligibility**, so the candidate is found by the contract's own ruler: whatever colour
	// the pool carries that *is* the blown highlight, at the bar.
	const carriers = parse.foregroundPool
		.map((color, rank) => ({ color, rank }))
		.filter(({ color }) => sameColor(colorFromRgb(color), colorFromRgb(highlight)))
	assert.ok(
		carriers.length > 0,
		`no candidate in the ${parse.foregroundPool.length}-colour pool is the blown highlight: ${
			parse.foregroundPool.slice(0, 8).map(rgbToHex).join(" ")
		}`,
	)
	const carrier = carriers[0]
	context.diagnostic(`the highlight is carried by ${rgbToHex(carrier.color)} at rank ${carrier.rank} of ${parse.foregroundPool.length}`)

	// It is a region of the artwork by the same instrument, and this pipeline's own statement that a
	// colour is a region — a retained node names it.
	assert.equal(hasInterior(carrier.color), true, `${rgbToHex(carrier.color)} carries the highlight but measures as a tracer`)
	assert.ok(
		parse.nodes.some((node) => rgbToHex(node.repr) === rgbToHex(carrier.color)),
		`${rgbToHex(carrier.color)} is carried by no retained node`,
	)

	// ---- and if it loses, it loses on ordering ------------------------------------------------------
	//
	// `identityEligibilityLevel` puts the tracing level **outermost**, so a demoted candidate sorts behind
	// every candidate that has an interior — that, and not a rank, is what a demotion looks like in the
	// pool. Two readings of the ordering pin it from both sides, and neither one is a threshold:
	//
	//  - nothing ranked **ahead** of the highlight is a tracer, so the level is still an ordering rather
	//    than a filter (item 2's halos are reachable, just last);
	//  - at least one region ranks **behind** the highlight, which is impossible for a demoted candidate
	//    and is therefore the falsifier for "a rule that demotes near-whites rather than filaments".
	//
	// Whatever separated the highlight from the colour that beat it lives in the readability ranking
	// inside the level, which is the one place this rule is not allowed to reach.
	const tracersAhead = parse.foregroundPool.slice(0, carrier.rank).filter((color) => !hasInterior(color)).map(rgbToHex)
	assert.deepEqual(tracersAhead, [], `boundary tracers rank ahead of the blown highlight: ${tracersAhead.join(" ")}`)

	const regionBehind = parse.foregroundPool.slice(carrier.rank + 1).find((color) => hasInterior(color))
	assert.ok(
		regionBehind !== undefined,
		`the blown highlight sorts behind every region in the pool, which is exactly what a tracing demotion looks like`,
	)
	context.diagnostic(`a region still ranks behind the highlight: ${rgbToHex(regionBehind)}`)

	assert.equal(
		hasInterior(palette.roles.foreground.rgb),
		true,
		`the published foreground ${palette.roles.foreground.hex} is not a region of the artwork`,
	)
})
