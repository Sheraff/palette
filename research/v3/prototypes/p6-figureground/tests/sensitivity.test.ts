/**
 * `tools/sensitivity.ts` — **harness logic only**.
 *
 * Nothing here asserts a result of the sweep. A test that pinned a movement fraction would turn a
 * measurement into a fixture, and the next perturbation run would then be "fixing a test" — which is
 * the relapse the P6 README pre-registers. What is worth pinning is that the harness asks the
 * pre-registered question: the grid is the grid, the movement predicate is the contract's regional
 * bar and not exact hex, and the convention's line is `> 25%` and not `≥`.
 */

import assert from "node:assert/strict"
import { test } from "node:test"

import { sameColorBar } from "../../../src/contract/color.ts"
import type { Rgb8 } from "../../../src/contract/types.ts"
import { DEFAULT_EXCHANGE_RATES } from "../src/energy/rates.ts"
import { LATTICE_BANDWIDTH, LATTICE_CELLS_PER_BANDWIDTH } from "../src/lattice/index.ts"
import {
	anisotropyCurve,
	buildConfigs,
	chromaOf,
	coverLabel,
	FREE_RATE_NAMES,
	isLoadBearing,
	LOAD_BEARING_MOVED_FRACTION,
	movementOf,
	SENSITIVITY_COVERS,
} from "../tools/sensitivity.ts"

test("the grid is the pre-registered one: baseline + 6 rates × 2 + 4 quadrature + 3 λ extension", () => {
	const configs = buildConfigs()
	assert.equal(configs.length, 20)
	assert.equal(configs.filter((one) => one.family === "baseline").length, 1)
	assert.equal(configs.filter((one) => one.family === "rate").length, 12)
	assert.equal(configs.filter((one) => one.family === "quadrature").length, 4)
	assert.equal(configs.filter((one) => one.family === "anisotropy-extension").length, 3)

	// Every free rate of the registry is perturbed, and only by ×½ and ×2.
	for (const name of FREE_RATE_NAMES) {
		const points = configs.filter((one) => one.family === "rate" && one.knob === name)
		assert.equal(points.length, 2)
		const values = points.map((one) => one.rates[name]).sort((a, b) => a - b)
		assert.deepEqual(values, [DEFAULT_EXCHANGE_RATES[name] * 0.5, DEFAULT_EXCHANGE_RATES[name] * 2])
		// …and nothing else moved with it.
		for (const point of points) {
			for (const other of FREE_RATE_NAMES) {
				if (other === name) continue
				assert.equal(point.rates[other], DEFAULT_EXCHANGE_RATES[other])
			}
			assert.deepEqual(point.lattice, {})
		}
	}

	// The registry's key set IS the perturbed set — a rate added to `rates.ts` without being added
	// here would silently escape the falsifier.
	assert.deepEqual(
		[...FREE_RATE_NAMES].sort(),
		Object.keys(DEFAULT_EXCHANGE_RATES).sort(),
	)
})

test("the quadrature comparison class perturbs only quadrature, at the shipped neighbours", () => {
	const quadrature = buildConfigs().filter((one) => one.family === "quadrature")
	for (const config of quadrature) {
		assert.deepEqual(config.rates, DEFAULT_EXCHANGE_RATES)
	}
	const bandwidths = quadrature
		.filter((one) => one.knob === "bandwidth")
		.map((one) => one.lattice.bandwidth!)
		.sort((a, b) => a - b)
	assert.deepEqual(bandwidths, [LATTICE_BANDWIDTH * 0.5, LATTICE_BANDWIDTH * 2])
	const cells = quadrature
		.filter((one) => one.knob === "cellsPerBandwidth")
		.map((one) => one.lattice.cellsPerBandwidth!)
		.sort((a, b) => a - b)
	// One step denser and one step coarser than the working point (index 1 of the shipped list).
	assert.deepEqual(cells, [LATTICE_CELLS_PER_BANDWIDTH[2], LATTICE_CELLS_PER_BANDWIDTH[0]].sort((a, b) => a - b))
})

test("the anisotropy curve has six points and reuses the shared ones rather than re-solving them", () => {
	const configs = buildConfigs()
	const curve = anisotropyCurve(configs)
	assert.deepEqual(curve.map(([lambda]) => lambda), [0.25, 0.5, 1, 2, 4, 8])
	// λ=1 is the baseline itself; λ=0.5 and λ=2 are the pre-registered pair. Six points, three new.
	assert.equal(curve[2]![1], configs[0]!.id)
	assert.equal(new Set(curve.map(([, id]) => id)).size, 6)
})

test("config ids are a hash of the configuration and nothing else — no clock, and stable", () => {
	const first = buildConfigs()
	const second = buildConfigs()
	assert.deepEqual(first.map((one) => one.id), second.map((one) => one.id))
	assert.equal(new Set(first.map((one) => one.id)).size, first.length)
	for (const config of first) assert.match(config.id, /^[A-Za-z0-9.=-]+-[0-9a-f]{8}$/u)
})

test("movement is the regional same-colour bar, not exact hex", () => {
	const roles = (
		background: Rgb8,
		surface: Rgb8,
		foreground: Rgb8,
		accent: Rgb8,
	) => ({ background, surface, foreground, accent })

	const base = roles([20, 20, 20], [30, 30, 30], [240, 240, 240], [200, 40, 40])

	// Identical palettes never move.
	assert.equal(movementOf(base, base).moved, false)

	// A one-LSB change is a different hex and is NOT a move: the bar is the ruler.
	const oneLsb = roles([21, 20, 20], [30, 30, 30], [240, 240, 240], [200, 40, 40])
	const movement = movementOf(base, oneLsb)
	assert.equal(movement.moved, false)
	assert.equal(movement.byRole.background, false)

	// A change well beyond any regional bar is a move, and only that role is flagged.
	const far = roles([20, 20, 20], [30, 30, 30], [240, 240, 240], [40, 200, 40])
	const farMovement = movementOf(base, far)
	assert.equal(farMovement.moved, true)
	assert.equal(farMovement.byRole.accent, true)
	assert.equal(farMovement.byRole.background, false)
	// The bar this test relies on is the contract's own, at this pair's region.
	assert.ok(sameColorBar({ rgb: [200, 40, 40], hex: "#c82828" }, { rgb: [40, 200, 40], hex: "#28c828" }) > 0)
})

test("an fg/accent seat swap is recognised as a swap, not merely as movement", () => {
	const base = {
		background: [20, 20, 20] as Rgb8,
		surface: [30, 30, 30] as Rgb8,
		foreground: [240, 240, 240] as Rgb8,
		accent: [200, 40, 40] as Rgb8,
	}
	const swapped = { ...base, foreground: base.accent, accent: base.foreground }
	const movement = movementOf(base, swapped)
	assert.equal(movement.seatSwap, true)
	assert.equal(movement.moved, true)

	// A collapsed palette (fg === accent) cannot "swap" — the predicate must not fire on it.
	const collapsed = { ...base, accent: base.foreground }
	assert.equal(movementOf(collapsed, collapsed).seatSwap, false)
})

test("the convention's line is strictly greater than 25%", () => {
	assert.equal(LOAD_BEARING_MOVED_FRACTION, 0.25)
	assert.equal(isLoadBearing(0.25), false)
	assert.equal(isLoadBearing(5 / 18), true) // 5 of 18 covers is the smallest count that crosses it
	assert.equal(isLoadBearing(4 / 18), false)
})

test("the cover set is the 18 of the prior reports, in a fixed order, distinctly labelled", () => {
	assert.equal(SENSITIVITY_COVERS.length, 18)
	assert.equal(new Set(SENSITIVITY_COVERS).size, 18)
	assert.equal(new Set(SENSITIVITY_COVERS.map(coverLabel)).size, 18)
	// The two non-terminating demo-20 covers are absent (first-palettes.md §3.0).
	for (const excluded of ["0000bbc3367a621256ce593", "00001a9be12b7116a8247378"]) {
		assert.ok(!SENSITIVITY_COVERS.some((cover) => cover.includes(excluded)))
	}
})

test("chromaOf is OKLab chroma: zero on neutrals, positive on a saturated primary", () => {
	assert.ok(chromaOf([0, 0, 0]) < 1e-6)
	assert.ok(chromaOf([128, 128, 128]) < 1e-6) // float32 sRGB->OKLab roundoff puts neutral chroma at ~2e-8, not 0
	assert.ok(chromaOf([255, 255, 255]) < 1e-6)
	assert.ok(chromaOf([255, 0, 0]) > 0.2)
})
