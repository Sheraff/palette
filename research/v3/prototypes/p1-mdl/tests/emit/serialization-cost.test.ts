/**
 * `serializationCost()` — L(P), against numbers computed by hand.
 *
 * Every expected total below is written as its arithmetic, not as a literal, so the test reads as
 * the derivation it is checking. If a constant in `cost.ts` moves, these break in a way that says
 * which term moved — which is the point of a hand-computed test as opposed to a snapshot.
 *
 * The code being checked, from `cost.ts`:
 * ```
 *   collapse flags   2   always
 *   gradient flag    1   always
 *   background      24   always named (unless it is the escape role)
 *   foreground      24   always named (unless it is the escape role)
 *   surface         24   only when not collapsed
 *   accent          24   only when not collapsed
 *   stop count       2   only when gradient
 *   interior stop   32   24 colour + 8 position, each; endpoints are free
 *   escape        1024   replaces the escaping role's 24
 * ```
 */

import assert from "node:assert/strict"
import { test } from "node:test"
import {
	COLLAPSE_FLAG_BITS,
	COLOR_NAME_BITS,
	ESCAPE_COST_BITS,
	GRADIENT_FLAG_BITS,
	GRADIENT_STOP_COUNT_BITS,
	IN_ARTWORK_COST_BOUNDS,
	serializationCost,
	STOP_POSITION_BITS,
} from "../../src/emit/cost.ts"
import type { Configuration } from "../../src/emit/types.ts"

/**
 * Four arbitrary but distinct triples. Nothing in `serializationCost` reads a channel value — the
 * code is a flat 24-bit name over the sRGB cube — so these are placeholders and are deliberately
 * *not* pixels of any artwork: a cost function that started caring which colour it was pricing would
 * be reading the image, which is the double-counting `cost.ts` refuses.
 */
const BASE: Configuration = {
	background: [10, 20, 30],
	surface: [40, 50, 60],
	foreground: [200, 210, 220],
	accent: [180, 90, 40],
	gradient: false,
	stops: [],
	surfaceCollapsed: false,
	accentCollapsed: false,
	escape: null,
}

const FIXED = COLLAPSE_FLAG_BITS + GRADIENT_FLAG_BITS // 2 + 1 = 3, on every configuration
const INTERIOR_STOP = COLOR_NAME_BITS + STOP_POSITION_BITS // 24 + 8 = 32

test("flat field, four distinct roles: 4 names + 3 fixed bits = 99", () => {
	const { bits, breakdown } = serializationCost(BASE)
	assert.equal(breakdown.roles, 4 * COLOR_NAME_BITS)
	assert.equal(breakdown.collapseFlags, 2)
	assert.equal(breakdown.gradientFlag, 1)
	assert.equal(breakdown.stopCount, 0)
	assert.equal(breakdown.stops, 0)
	assert.equal(breakdown.escape, 0)
	assert.equal(bits, 4 * COLOR_NAME_BITS + FIXED)
	assert.equal(bits, 99)
})

test("a collapsed role is a reference, not a name: each collapse saves exactly 24 bits", () => {
	const surfaceOnly = serializationCost({ ...BASE, surfaceCollapsed: true })
	const accentOnly = serializationCost({ ...BASE, accentCollapsed: true })
	const both = serializationCost({ ...BASE, surfaceCollapsed: true, accentCollapsed: true })

	assert.equal(surfaceOnly.bits, 3 * COLOR_NAME_BITS + FIXED)
	assert.equal(surfaceOnly.bits, 75)
	assert.equal(accentOnly.bits, 75)
	assert.equal(both.bits, 2 * COLOR_NAME_BITS + FIXED)
	assert.equal(both.bits, 51)

	// The two flags are independent and each is worth exactly one colour name.
	assert.equal(serializationCost(BASE).bits - surfaceOnly.bits, COLOR_NAME_BITS)
	assert.equal(surfaceOnly.bits - both.bits, COLOR_NAME_BITS)
})

test("collapse flags are transmitted whether or not they are set", () => {
	// Both configurations pay the two flag bits; only the colour fields differ. This is what makes the
	// flags cheap enough to be worth having: 2 bits buy up to 48.
	assert.equal(serializationCost(BASE).breakdown.collapseFlags, COLLAPSE_FLAG_BITS)
	assert.equal(
		serializationCost({ ...BASE, surfaceCollapsed: true, accentCollapsed: true }).breakdown
			.collapseFlags,
		COLLAPSE_FLAG_BITS,
	)
})

test("a two-stop ramp costs the stop-count field and nothing else: both endpoints are free", () => {
	const twoStop = serializationCost({
		...BASE,
		gradient: true,
		stops: [
			{ rgb: BASE.background, position: 0 },
			{ rgb: BASE.surface, position: 1 },
		],
	})
	assert.equal(twoStop.breakdown.stops, 0)
	assert.equal(twoStop.breakdown.stopCount, GRADIENT_STOP_COUNT_BITS)
	assert.equal(twoStop.bits, 4 * COLOR_NAME_BITS + FIXED + GRADIENT_STOP_COUNT_BITS)
	assert.equal(twoStop.bits, 101)
	// Exactly the stop-count field more than the flat configuration.
	assert.equal(twoStop.bits - serializationCost(BASE).bits, GRADIENT_STOP_COUNT_BITS)
})

test("interior stops cost 32 bits each and nothing else changes", () => {
	const three = serializationCost({
		...BASE,
		gradient: true,
		stops: [
			{ rgb: BASE.background, position: 0 },
			{ rgb: [1, 2, 3], position: 0.5 },
			{ rgb: BASE.surface, position: 1 },
		],
	})
	const four = serializationCost({
		...BASE,
		gradient: true,
		stops: [
			{ rgb: BASE.background, position: 0 },
			{ rgb: [1, 2, 3], position: 0.25 },
			{ rgb: [4, 5, 6], position: 0.75 },
			{ rgb: BASE.surface, position: 1 },
		],
	})

	assert.equal(three.breakdown.stops, INTERIOR_STOP)
	assert.equal(three.bits, 4 * COLOR_NAME_BITS + FIXED + GRADIENT_STOP_COUNT_BITS + INTERIOR_STOP)
	assert.equal(three.bits, 133)

	assert.equal(four.breakdown.stops, 2 * INTERIOR_STOP)
	assert.equal(four.bits, 165)
	assert.equal(four.bits - three.bits, INTERIOR_STOP)
})

test("stop positions do not change the cost — only how many interior stops there are", () => {
	const at = (position: number) =>
		serializationCost({
			...BASE,
			gradient: true,
			stops: [
				{ rgb: BASE.background, position: 0 },
				{ rgb: [1, 2, 3], position },
				{ rgb: BASE.surface, position: 1 },
			],
		}).bits
	// The quantiser is fixed-width: a stop at t=0.001 and one at t=0.999 are the same message length.
	assert.equal(at(0.001), at(0.5))
	assert.equal(at(0.5), at(0.999))
})

test("stops are not priced when the gradient flag is clear", () => {
	// A configuration carrying stops it does not publish is not something the emitter would produce,
	// but the cost function must agree with `toPalette`, which emits `gradient: null` here.
	const cost = serializationCost({
		...BASE,
		gradient: false,
		stops: [
			{ rgb: BASE.background, position: 0 },
			{ rgb: [1, 2, 3], position: 0.5 },
			{ rgb: BASE.surface, position: 1 },
		],
	})
	assert.equal(cost.breakdown.stops, 0)
	assert.equal(cost.breakdown.stopCount, 0)
	assert.equal(cost.bits, 99)
})

test("the escape replaces its role's name and adds the barrier", () => {
	// The shape the reviewer's grant permits: white background, surface collapsed onto it.
	const escaped = serializationCost({
		...BASE,
		background: [255, 255, 255],
		surface: [255, 255, 255],
		surfaceCollapsed: true,
		escape: { role: "background", color: "#ffffff" },
	})
	// foreground (24) + accent (24) are the only names left; background is carried by the declaration
	// and surface is a reference to it.
	assert.equal(escaped.breakdown.roles, 2 * COLOR_NAME_BITS)
	assert.equal(escaped.breakdown.escape, ESCAPE_COST_BITS)
	assert.equal(escaped.bits, 2 * COLOR_NAME_BITS + FIXED + ESCAPE_COST_BITS)
	assert.equal(escaped.bits, 1075)

	const foregroundEscape = serializationCost({
		...BASE,
		foreground: [0, 0, 0],
		accent: [0, 0, 0],
		accentCollapsed: true,
		escape: { role: "foreground", color: "#000000" },
	})
	assert.equal(foregroundEscape.breakdown.roles, 2 * COLOR_NAME_BITS)
	assert.equal(foregroundEscape.bits, 1075)
})

test("the escape barrier dominates the entire in-artwork range — DESIGN.md §6's ordering", () => {
	// The claim `ESCAPE_COST_BITS`'s docstring makes, as an assertion rather than a sentence: no
	// in-artwork configuration can be outranked on structural cost by an escape configuration.
	assert.equal(IN_ARTWORK_COST_BOUNDS.min, 51)
	assert.equal(IN_ARTWORK_COST_BOUNDS.max, 165)

	const cheapestEscape = serializationCost({
		...BASE,
		background: [255, 255, 255],
		surface: [255, 255, 255],
		foreground: [0, 0, 0],
		accent: [0, 0, 0],
		surfaceCollapsed: true,
		accentCollapsed: true,
		escape: { role: "background", color: "#ffffff" },
	})
	// Cheapest possible escape configuration: one name (foreground) + flags + barrier.
	assert.equal(cheapestEscape.bits, COLOR_NAME_BITS + FIXED + ESCAPE_COST_BITS)
	assert.ok(cheapestEscape.bits > IN_ARTWORK_COST_BOUNDS.max)
	assert.ok(cheapestEscape.bits - IN_ARTWORK_COST_BOUNDS.max > IN_ARTWORK_COST_BOUNDS.max - IN_ARTWORK_COST_BOUNDS.min)
})

test("the breakdown always sums to the total", () => {
	const configurations: Configuration[] = [
		BASE,
		{ ...BASE, surfaceCollapsed: true },
		{ ...BASE, accentCollapsed: true },
		{ ...BASE, surfaceCollapsed: true, accentCollapsed: true },
		{
			...BASE,
			gradient: true,
			stops: [
				{ rgb: BASE.background, position: 0 },
				{ rgb: [1, 2, 3], position: 0.5 },
				{ rgb: BASE.surface, position: 1 },
			],
		},
		{ ...BASE, escape: { role: "background", color: "#ffffff" } },
	]
	for (const configuration of configurations) {
		const { bits, breakdown } = serializationCost(configuration)
		const sum = breakdown.roles + breakdown.collapseFlags + breakdown.gradientFlag +
			breakdown.stopCount + breakdown.stops + breakdown.escape
		assert.equal(sum, bits)
	}
})

test("pure: the same configuration always costs the same, and the input is not mutated", () => {
	const frozen = JSON.stringify(BASE)
	assert.equal(serializationCost(BASE).bits, serializationCost(BASE).bits)
	assert.equal(JSON.stringify(BASE), frozen)
})
