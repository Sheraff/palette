/**
 * The gradient display mapping is [REVIEWED] and carried from v2-3 (REVIEW_UI.md §3), and the
 * preview renderer is pinned as part of the output contract (PHASE_0_DECISIONS.md §2). These tests
 * hold it to the exact renderings the reviewer approved.
 */
import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import {
	GRADIENT_DISPLAY_RESERVE_MULTI_STOP,
	GRADIENT_DISPLAY_RESERVE_TWO_STOP,
	canonicalPosition,
	displayPosition,
	displayStops,
	fieldCss,
} from "../src/review-server/gradient.ts"
import { call, makeBatch, startHarness, type Harness } from "../src/review-server/test-support.ts"
import { seedDemoBatch } from "../src/review-server/server.ts"

const names = { "#111111": "Ink", "#555555": "Middle", "#999999": "Pale" }

describe("gradient display mapping", () => {
	it("reproduces the reviewed 2-stop rendering (35 → 100)", () => {
		assert.equal(GRADIENT_DISPLAY_RESERVE_TWO_STOP, 0.35)
		assert.equal(displayPosition(0, 2), 0.35)
		assert.equal(displayPosition(1, 2), 1)
		assert.equal(
			fieldCss({ stops: [{ color: "#111111", position: 0 }, { color: "#999999", position: 1 }] }, "#111111", names),
			"linear-gradient(135deg in oklab, #111111 35%, #999999 100%)",
		)
	})

	it("reproduces the reviewed 3-stop rendering (10 / 55 / 100)", () => {
		assert.equal(GRADIENT_DISPLAY_RESERVE_MULTI_STOP, 0.1)
		assert.equal(displayPosition(0, 3), 0.1)
		assert.equal(Number(displayPosition(0.5, 3).toFixed(10)), 0.55)
		assert.equal(displayPosition(1, 3), 1)
		assert.equal(
			fieldCss(
				{
					stops: [
						{ color: "#111111", position: 0 },
						{ color: "#555555", position: 0.5 },
						{ color: "#999999", position: 1 },
					],
				},
				"#111111",
				names,
			),
			"linear-gradient(135deg in oklab, #111111 10%, #555555 55%, #999999 100%)",
		)
	})

	it("generalizes to 4 stops with no new constant, and leaves flat fields alone", () => {
		assert.equal(displayPosition(0, 4), GRADIENT_DISPLAY_RESERVE_MULTI_STOP)
		assert.equal(displayPosition(1, 4), 1)
		assert.equal(fieldCss(null, "#111111", names), "#111111")
	})

	it("rejects positions outside [0,1] and gradients with fewer than two stops", () => {
		assert.throws(() => displayPosition(1.2, 2), RangeError)
		assert.throws(() => displayPosition(-0.1, 2), RangeError)
		assert.throws(() => displayPosition(0.5, 1), RangeError)
	})

	it("serves a stop position in one canonical numeric form — a blinding defence, not a display choice", () => {
		// A position is served to the browser as a JSON number, so its float REPRESENTATION is served
		// with it. `0.35` and `0.35000000000000003` are the same ramp and different strings, and two
		// arms whose fitting code reaches the same position by different arithmetic would be told apart
		// by the trailing digits alone — without anyone looking at a colour. Positions were checked for
		// range and monotonicity and never canonicalized, so that channel was open.
		assert.equal(canonicalPosition(0.35000000000000003), 0.35)
		assert.equal(canonicalPosition(0.1 + 0.2), 0.3)
		assert.equal(canonicalPosition(0.35), 0.35, "a position already canonical is unchanged")

		const noisy = { stops: [{ color: "#111111", position: 0 }, { color: "#999999", position: 0.35000000000000003 }] }
		const clean = { stops: [{ color: "#111111", position: 0 }, { color: "#999999", position: 0.35 }] }
		assert.deepEqual(displayStops(noisy, names), displayStops(clean, names))
		// Including the derived number: 0.35 -> 0.5775000000000001 through the display mapping.
		for (const stop of displayStops(clean, names)) {
			assert.equal(stop.publishedPosition, canonicalPosition(stop.publishedPosition))
			assert.equal(stop.displayPosition, canonicalPosition(stop.displayPosition))
		}
		assert.equal(fieldCss(noisy, "#111111", names), fieldCss(clean, "#111111", names))
	})
})

describe("canonical positions at push time", () => {
	let harness: Harness

	before(async () => {
		harness = await startHarness()
	})

	after(async () => {
		await harness?.stop()
	})

	/**
	 * One item whose two sides carry the SAME ramp, reached by different arithmetic. Same colours,
	 * same positions — the only thing that could tell the arms apart is the float representation.
	 */
	function sameRampBothSides(batchId: string, left: number, right: number): any {
		const batch = JSON.parse(JSON.stringify(makeBatch(batchId, 1))) as any
		const ramp = (position: number) => ({
			stops: [
				{ color: "#111111", position: 0 },
				{ color: "#999999", position },
			],
		})
		batch.items[0].sides[0].palette = { ...batch.items[0].sides[0].palette, background: "#111111", gradient: ramp(left) }
		batch.items[0].sides[1].palette = { ...batch.items[0].sides[1].palette, background: "#111111", gradient: ramp(right) }
		return batch
	}

	it("stores and serves the same numbers for the same ramp, however it was computed", async () => {
		const pushed = await call(harness.base, "POST", "/api/batches", sameRampBothSides("canon-1", 0.35, 0.35000000000000003))
		assert.equal(pushed.status, 201)
		const payload = await call(harness.base, "GET", "/api/batches/canon-1")
		const [a, b] = (["A", "B"] as const).map((key) => payload.body.items[0].sides[key])
		// The two arms are indistinguishable in the served payload, which is the whole point: if a
		// trailing digit told them apart, the shuffle would be decoration for this batch.
		assert.deepEqual(a.gradient, b.gradient)
		assert.equal(a.fieldCss, b.fieldCss)
		assert.equal(a.gradient.stops[1].publishedPosition, 0.35)
	})

	it("refuses two stops that are the same position once canonicalized", async () => {
		const collapsed = sameRampBothSides("canon-2", 0.35, 0.35)
		collapsed.items[0].sides[0].palette.gradient.stops = [
			{ color: "#111111", position: 0.4 },
			{ color: "#999999", position: 0.4000000001 },
		]
		const refused = await call(harness.base, "POST", "/api/batches", collapsed)
		assert.equal(refused.status, 400)
		assert.match(String(refused.body.error?.message ?? refused.body.error), /strictly increasing at 6 decimal places/u)
	})
})

describe("demo fixture batch", () => {
	let harness: Harness

	before(async () => {
		harness = await startHarness()
		await seedDemoBatch(harness.handle.service)
	})

	after(async () => {
		await harness?.stop()
	})

	it("serves three items with a flat field, a 2-stop and a 3-stop gradient, every color named", async () => {
		const payload = await call(harness.base, "GET", "/api/batches/demo-batch-0001")
		assert.equal(payload.status, 200)
		assert.equal(payload.body.items.length, 3)

		const stopCounts = new Set<number | null>()
		for (const item of payload.body.items) {
			for (const side of ["A", "B"] as const) {
				const rendered = item.sides[side]
				stopCounts.add(rendered.gradient === null ? null : rendered.gradient.stops.length)
				for (const role of rendered.roles) {
					assert.match(role.hex, /^#[0-9a-f]{6}$/u)
					assert.ok(role.name.length > 0, `role ${role.role} has no colornames-oklab name`)
					assert.notEqual(role.name, role.hex, "a color fell back to its hex instead of a name")
				}
				for (const stop of rendered.gradient?.stops ?? []) {
					assert.ok(stop.name.length > 0, "a gradient stop has no colornames-oklab name")
					assert.ok(stop.displayPosition >= stop.publishedPosition, "the display mapping only ever pushes right")
				}
				assert.ok(
					rendered.gradient === null
						? rendered.fieldCss.startsWith("#")
						: rendered.fieldCss.startsWith("linear-gradient(135deg in oklab,"),
					"the served field CSS is not the pinned renderer's output",
				)
			}
		}
		assert.deepEqual([...stopCounts].sort(), [2, 3, null])
	})

	it("serves the artwork bytes for every item", async () => {
		for (const itemId of ["demo-1-light-illustration", "demo-2-dark-warm-photo", "demo-3-blue-cover"]) {
			const response = await fetch(`${harness.base}/media/demo-batch-0001/${itemId}`)
			assert.equal(response.status, 200)
			assert.equal(response.headers.get("content-type"), "image/jpeg")
			assert.ok(Number(response.headers.get("content-length")) > 1000)
		}
	})

	it("is idempotent: seeding twice does not duplicate the batch", async () => {
		assert.equal(await seedDemoBatch(harness.handle.service), null)
		const queue = await call(harness.base, "GET", "/api/queue")
		assert.equal(queue.body.batches.filter((batch: any) => batch.batchId === "demo-batch-0001").length, 1)
	})
})
