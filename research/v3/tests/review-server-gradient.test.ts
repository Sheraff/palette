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
	displayPosition,
	fieldCss,
} from "../src/review-server/gradient.ts"
import { call, startHarness, type Harness } from "../src/review-server/test-support.ts"
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
