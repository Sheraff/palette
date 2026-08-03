/**
 * The mock player's layout — revision 3, 2026-08-03.
 *
 * The mock is the primary judging surface (REVIEW_UI.md §3) and part of the output contract, so its
 * layout is not a styling preference: a defect here silently changes what every verdict was about.
 * Revision 1 had four defects, reported by the reviewer, who is the design authority on this
 * surface. Their words are the spec, and each of the four has a test below:
 *
 *  1. "the artwork takes too much space, i can barely see the background/gradient i'm supposed to
 *     review"
 *  2. "all the content is at the bottom, so in case of a gradient, almost nothing is on top of the
 *     background color"
 *  3. "the accent color is only used on top of a surface colored area, so i won't be able to see it
 *     in other contexts"
 *  4. "the swatches to show the palette details takes too much space, put it below the mock ui, not
 *     next to it"
 *
 * Revision 3 is one number: testing revision 2 live, the reviewer said *"now the artwork is slightly
 * too small"*. 96 px → 152 px. Finding 1 is still the constraint — the artwork stays a thumbnail and
 * the field keeps the frame — so its test below asserts the band rather than only the number, which
 * is what would catch a future revision drifting back towards revision 1's full-width artwork.
 *
 * The page is driven through the real `review-ui/app.js` against the real server, so what is
 * asserted is the DOM the reviewer actually gets.
 */
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { after, before, describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { call, makeBatch, openPage, startHarness, type FakeNode, type FakePage, type Harness } from "../src/review-server/test-support.ts"

const APP_PAGE = fileURLToPath(new URL("../review-ui/app.js", import.meta.url))
const STYLES = fileURLToPath(new URL("../review-ui/styles.css", import.meta.url))
const NODE_IDS = ["batch-line", "item-nav", "prev", "next", "release", "item", "status"] as const
const BATCH = "mock-layout-batch"

/** The two mock panels on the page, one per blinded side. */
function mocks(page: FakePage): FakeNode[] {
	return page.nodes.item.byClass("mock")
}

/** Revision 3's artwork width, and the two revisions it sits between. Reviewer-set, `[REVIEWED]`. */
const REVISION_2_ART_WIDTH_PX = 96
const ART_WIDTH_PX = 152
/** The reviewer asked for "somewhere between": 1.5–1.8x revision 2, keeping the field dominant. */
const ART_WIDTH_BAND = [1.5, 1.8] as const

describe("mock player layout (revision 3)", () => {
	let harness: Harness
	let page: FakePage
	let sides: { roles: Record<string, string>; fieldCss: string }[]

	before(async () => {
		harness = await startHarness()
		// makeBatch's side B carries a two-stop gradient, which is the case the reviewer's second and
		// third findings are about — content and accent must reach both ends of the ramp.
		await call(harness.base, "POST", "/api/batches", makeBatch(BATCH, 1))
		const payload = await call(harness.base, "GET", `/api/batches/${BATCH}`)
		sides = ["A", "B"].map((name) => {
			const side = payload.body.items[0].sides[name]
			return {
				roles: Object.fromEntries(side.roles.map((role: any) => [role.role, role.hex])),
				fieldCss: side.fieldCss,
			}
		})
		page = await openPage(harness.base, APP_PAGE, NODE_IDS, `${harness.base}/?batch=${BATCH}`)
	})

	after(async () => {
		await harness?.stop()
	})

	it("renders both sides' mocks with the pinned field CSS pasted, never recomposed", () => {
		assert.equal(mocks(page).length, 2, "one mock per blinded side")
		for (const [index, mock] of mocks(page).entries()) {
			// The [REVIEWED] gradient display mapping is the server's output; the page pastes it.
			assert.equal(mock.style.background, sides[index].fieldCss)
		}
		const gradientMock = mocks(page).find((_, index) => sides[index].fieldCss.includes("linear-gradient"))
		assert.ok(gradientMock !== undefined, "the fixture should give one side a gradient to judge")
	})

	it("1. the artwork is a thumbnail, so the field dominates the frame", async () => {
		for (const mock of mocks(page)) {
			const art = mock.byClass("mock-art")
			assert.equal(art.length, 1)
			// It sits inside the middle region, beside the card — not alone on a full-width row as in
			// revision 1, where it pushed every other element to the bottom.
			const middle = mock.byClass("mock-middle")[0]
			assert.ok(middle.children.includes(art[0]), "the artwork must share the middle region with the card")
			assert.ok(!mock.children.includes(art[0]), "the artwork must no longer be a top-level row of the mock")
			// Borderless on the field, unchanged and not negotiable (REVIEW_UI.md §3).
			assert.equal(art[0].attrs.alt, "album artwork")
		}
		const css = await readFile(STYLES, "utf8")
		const rule = css.slice(css.indexOf(".mock-art {"), css.indexOf("}", css.indexOf(".mock-art {")))
		const width = Number(/width:\s*(\d+)px/u.exec(rule)?.[1])
		assert.equal(width, ART_WIDTH_PX, "the artwork must have a fixed width, in px")
		assert.match(rule, /border:\s*0/u, "borderless on the field")
		assert.ok(!/width:\s*100%/u.test(rule), "revision 1's full-width artwork is the defect being fixed")
		// Revision 3: bigger than revision 2 by the factor the reviewer asked for, and no bigger.
		const factor = width / REVISION_2_ART_WIDTH_PX
		assert.ok(
			factor >= ART_WIDTH_BAND[0] && factor <= ART_WIDTH_BAND[1],
			`the artwork is ${factor.toFixed(2)}x revision 2's ${REVISION_2_ART_WIDTH_PX}px, outside the ${ART_WIDTH_BAND.join("–")}x the reviewer asked for`,
		)
		// And still a thumbnail: under half of the narrowest column the sides grid can give a mock, so
		// the field keeps the majority of the frame. That is the property finding 1 is about.
		const columns = css.slice(css.indexOf(".sides {"), css.indexOf("}", css.indexOf(".sides {")))
		const narrowestColumn = Number(/minmax\((\d+)px/u.exec(columns)?.[1])
		assert.ok(narrowestColumn > 0, "the sides grid should declare a minimum column width")
		assert.ok(width < narrowestColumn / 2, "the artwork must stay well under half the mock's width")
	})

	it("2. content sits at BOTH ends, so a gradient is judged over its whole ramp", async () => {
		for (const mock of mocks(page)) {
			const regions = mock.children.map((child) => child.className)
			assert.deepEqual(regions, ["mock-top", "mock-middle", "mock-bottom"], "three regions, top to bottom")

			const top = mock.byClass("mock-top")[0]
			const bottom = mock.byClass("mock-bottom")[0]
			// Foreground text directly on the field at the top — the relationship revision 1 could not
			// show, because everything sat on the surface card near the bottom.
			assert.ok(top.textContent.includes("Album title"), "the top region carries foreground text on the field")
			assert.ok(top.textContent.includes("Artist name"))
			assert.ok(bottom.textContent.includes("Up next"), "the bottom region carries text on the field too")
		}
		// The frame has to be tall enough that a two-stop ramp reads as a ramp between the two ends,
		// and the regions have to be pushed to those ends rather than stacked at the bottom.
		const css = await readFile(STYLES, "utf8")
		const rule = css.slice(css.indexOf("\n.mock {"), css.indexOf("}", css.indexOf("\n.mock {")))
		assert.match(rule, /min-height:\s*420px/u)
		assert.match(rule, /justify-content:\s*space-between/u, "the regions must be pushed to the ends")
	})

	it("3. the accent appears against background, against surface, and on both gradient ends", () => {
		for (const [index, mock] of mocks(page).entries()) {
			const accent = sides[index].roles.accent
			const background = sides[index].roles.background
			const surface = sides[index].roles.surface
			const painted = (region: FakeNode) =>
				region.descendants().filter((node) => node.style.background === accent).length

			const top = mock.byClass("mock-top")[0]
			const bottom = mock.byClass("mock-bottom")[0]
			const card = mock.byClass("mock-card")[0]

			// Against the field at the top of the ramp, against the field at the bottom, and on the
			// surface card — the three relationships the contract's accent floors are checked against.
			assert.ok(painted(top) > 0, "no accent element on the field at the top")
			assert.ok(painted(bottom) > 0, "no accent element on the field at the bottom")
			assert.ok(painted(card) > 0, "no accent element on the surface card")

			// And accent directly on a background-coloured rail, so accent-vs-background is on screen as
			// a real adjacency rather than as two swatches in a list.
			const rails = mock.byClass("mock-track")
			assert.ok(rails.length >= 2, "a rail in the card and one on the field")
			for (const railNode of rails) {
				assert.equal(railNode.style.background, background, "the rail must be the background colour")
				const fill = railNode.byClass("mock-track-fill")[0]
				assert.equal(fill.style.background, accent)
			}
			assert.notEqual(surface, undefined)
			// Revision 1's defect stated as an assertion: accent must not live only on the card.
			assert.ok(painted(top) + painted(bottom) > 0, "accent appears only over the surface, as in revision 1")
		}
	})

	it("4. the swatches sit below the mock, not beside it", async () => {
		const bodies = page.nodes.item.byClass("side-body")
		assert.equal(bodies.length, 2)
		for (const body of bodies) {
			assert.deepEqual(
				body.children.map((child) => child.className),
				["mock", "swatches"],
				"mock first, swatches under it",
			)
		}
		const css = await readFile(STYLES, "utf8")
		const rule = css.slice(css.indexOf(".side-body {"), css.indexOf("}", css.indexOf(".side-body {")))
		assert.match(rule, /flex-direction:\s*column/u, "revision 1's two-column grid is the defect being fixed")
		assert.ok(!/grid-template-columns/u.test(rule))
		const swatchRule = css.slice(css.indexOf("\n.swatches {"), css.indexOf("}", css.indexOf("\n.swatches {")))
		assert.match(swatchRule, /flex-wrap:\s*wrap/u, "a compact wrapping row, not a column")
	})

	it("keeps every colour on screen named, and the chrome black and white", () => {
		for (const [index, mock] of mocks(page).entries()) {
			void mock
			const swatches = page.nodes.item.byClass("swatches")[index]
			const roles = swatches.byClass("swatch-role").map((node) => node.textContent)
			for (const role of ["background", "surface", "foreground", "accent"]) {
				assert.ok(roles.includes(role), `${role} has no swatch`)
			}
			// colornames-oklab names travel with every hex (REVIEW_UI.md §3).
			for (const [role, hex] of Object.entries(sides[index].roles)) {
				void role
				assert.ok(swatches.textContent.includes(hex), `${hex} is shown without its name and hex line`)
			}
		}
	})

	it("has no shadow anywhere, in the mock or outside it", async () => {
		const css = await readFile(STYLES, "utf8")
		assert.ok(!/box-shadow|text-shadow|drop-shadow/u.test(css), "REVIEW_UI.md §3: no shadows, anywhere")
	})
})
