/**
 * The surround ladder — proposal §2.1.
 *
 * Six Gaussian-blurred versions of the image at full resolution, geometrically spaced from about
 * half the short edge down to about a sixty-fourth of it, built **in linear light** and converted to
 * OKLab per level. `ĉ_k(x)` is the surround colour of pixel `x` at scale `k`.
 *
 * ## Three things this file is careful about
 *
 * **Linear light, not OKLab.** Blurring is averaging photons; averaging OKLab coordinates instead
 * would darken every edge (the classic gamma-blur artefact) and manufacture a lightness displacement
 * along every boundary in the image — which is exactly the quantity `inkEnergy` reads. Proposal §2.1
 * says linear and means it.
 *
 * **Built by repeated blurs, fine to coarse.** Rung k is rung k+1 blurred by the extra σ that takes
 * it there, `√(σ_k² − σ_{k+1}²)`. That is what "repeated small-kernel blurs" means operationally, and
 * it is why the coarse rungs are the most Gaussian: each is a convolution of every box kernel below
 * it. The ladder is emitted **coarsest first**, per `types.ts`.
 *
 * **No decimation.** Every rung is width×height. The proposal's whole objection to segmentation is
 * that boundaries move under re-encoding; a resampled ladder would move them too.
 *
 * ## Geometry, not pixels
 *
 * σ is a fraction of the **short edge**, so the ladder is scale-free (`CONVENTIONS.md`) and a resize
 * reads the same surrounds. That is the mechanism behind the proposal's robustness claim for the
 * resize arm (§2.6).
 */

import type { SurroundLadder } from "../types.ts"
import { blurPlaneInPlace } from "./blur.ts"
import {
	LADDER_COARSEST_SHORT_EDGE_FRACTION,
	LADDER_FINEST_SHORT_EDGE_FRACTION,
	LADDER_LEVELS,
} from "./constants.ts"
import { linearPlanesToOkLab } from "./decode.ts"

/**
 * The ladder's σ values in pixels, **coarsest first**, geometrically spaced.
 *
 * With the held extent (½ → 1/64 over six levels) the ratio is exactly ½, so σ_k = shortEdge/2^(k+1).
 * The general form is kept rather than the power of two, because the extent is a `[HELD]` parameter
 * and the spacing must stay geometric if it moves.
 */
export function ladderSigmas(width: number, height: number): number[] {
	const shortEdge = Math.min(width, height)
	const ratio = (LADDER_FINEST_SHORT_EDGE_FRACTION / LADDER_COARSEST_SHORT_EDGE_FRACTION) **
		(1 / (LADDER_LEVELS - 1))
	const sigmas: number[] = []
	for (let level = 0; level < LADDER_LEVELS; level += 1) {
		sigmas.push(shortEdge * LADDER_COARSEST_SHORT_EDGE_FRACTION * ratio ** level)
	}
	return sigmas
}

/**
 * The incremental σ applied at each build step, **finest first** — the order the blurs actually run
 * in. Exported because `tests/substrate.test.ts` re-derives a ladder value from these by composing
 * box kernels by hand, which is only an independent check if the schedule is visible.
 *
 * Step 0 blurs the source by the finest σ; step j>0 blurs the previous rung by the σ that lifts its
 * variance to the next rung's (`√(σ² − σ_prev²)`, Gaussians adding in quadrature).
 */
export function ladderStepSigmas(width: number, height: number): number[] {
	const sigmas = ladderSigmas(width, height)
	const steps: number[] = []
	for (let level = LADDER_LEVELS - 1; level >= 0; level -= 1) {
		const target = sigmas[level]
		const previous = level === LADDER_LEVELS - 1 ? 0 : sigmas[level + 1]
		steps.push(Math.sqrt(Math.max(0, target * target - previous * previous)))
	}
	return steps
}

/**
 * Build the ladder from linear-light planes.
 *
 * The caller's planes are **consumed**: they are copied once into working buffers, then blurred in
 * place, step after step. Peak allocation is 3 working planes + 1 scratch + 3 OKLab planes per rung,
 * i.e. ~(4 + 3·6)·4 bytes per pixel ≈ 88 MB at 10⁶ pixels — the memory figure the proposal owns in
 * §5, and the reason it flags tiling for renditions above ~9·10⁶ pixels.
 */
export function buildSurroundLadder(
	linear: Readonly<{ red: Float32Array; green: Float32Array; blue: Float32Array }>,
	width: number,
	height: number,
): SurroundLadder {
	const count = width * height
	const sigmas = ladderSigmas(width, height)
	const steps = ladderStepSigmas(width, height)

	const red = Float32Array.from(linear.red)
	const green = Float32Array.from(linear.green)
	const blue = Float32Array.from(linear.blue)
	const scratch = new Float32Array(count)

	const levels: { L: Float32Array; a: Float32Array; b: Float32Array }[] = new Array(LADDER_LEVELS)

	// Finest to coarsest, because that is the order the incremental blurs compose in. The emitted
	// array is indexed coarsest-first (`types.ts`), so step j fills level LADDER_LEVELS-1-j.
	for (let step = 0; step < LADDER_LEVELS; step += 1) {
		const sigma = steps[step]
		blurPlaneInPlace(red, scratch, width, height, sigma)
		blurPlaneInPlace(green, scratch, width, height, sigma)
		blurPlaneInPlace(blue, scratch, width, height, sigma)

		const L = new Float32Array(count)
		const a = new Float32Array(count)
		const b = new Float32Array(count)
		linearPlanesToOkLab(red, green, blue, L, a, b)
		levels[LADDER_LEVELS - 1 - step] = { L, a, b }
	}

	return { sigmas, levels }
}
