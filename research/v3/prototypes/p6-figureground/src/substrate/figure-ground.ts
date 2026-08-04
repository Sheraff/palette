/**
 * Figure–ground: what each pixel's displacement from its surround says about it — proposal §2.1.
 *
 * > A pixel whose displacement is near zero at every scale **is its own surround** — it is field.
 * > One whose displacement is large and **lightness-dominant** is ink. One whose displacement is
 * > large and **chroma/hue-dominant but lightness-small** is a mark.
 *
 * The displacement `d_k(x) = c(x) − ĉ_k(x)` is decomposed into (ΔL, ΔC, ΔH) **in the contract's
 * convention**, which is `challengers.ts:decomposeOkLab`: ΔL and ΔC are signed differences of
 * lightness and chroma, and ΔH is the *residual* `√(Δa² + Δb² − ΔC²)`, chosen there so that
 * `‖d‖² = ΔL² + ΔC² + ΔH²` holds exactly. Two consequences this file uses and the test pins:
 *
 * - `√(ΔC² + ΔH²) = √(Δa² + Δb²)` — the mark magnitude is the chromatic-plane distance, exactly.
 * - `‖d‖ = okLabDistance(c, ĉ)` — the field magnitude is the one ruler, exactly.
 *
 * So the aggregates below can be computed without ever forming ΔC and ΔH separately, and they are
 * still the contract's decomposition rather than a lookalike. `decomposeDisplacement` exists so the
 * decomposition is nameable and testable against the contract's function directly.
 *
 * ## The three aggregates
 *
 * - **`fieldWeight`** — `1 / (1 + (maxₖ‖dₖ‖ / bar)²)`, where `bar` is the pixel's own regional
 *   same-colour bar (see `FIELD_WEIGHT_SOFTNESS_BARS` for why the falloff is rational and not
 *   Gaussian — a Gaussian one measurably returns an all-zero plane on real artwork) and `k` ranges
 *   over the **fine and mid rungs only**, the coarsest `FIELD_WEIGHT_EXCLUDED_COARSE_RUNGS` being
 *   excluded. That exclusion is a recorded deviation from the proposal's "at every scale" and the
 *   reason for it, with its measured anchors, lives at the constant. Taking the max first rather
 *   than combining the rung weights is not an approximation — the weight is monotone decreasing in
 *   ‖d‖, so `minₖ w(‖dₖ‖) = w(maxₖ‖dₖ‖)` identically.
 * - **`inkEnergy`** — the ladder mean of `|ΔL|`, per `types.ts` ("ladder-aggregated |ΔL|"), over
 *   **all** rungs. The rung exclusion above is field-likeness's alone: the coarse rungs are what
 *   say a stroke is displaced from the page it sits on, which is the whole content of "ink".
 * - **`markEnergy`** — the ladder mean of `√(ΔC² + ΔH²)`, per `types.ts`, over all rungs likewise.
 *
 * Both energies are plain unweighted means over the six rungs, in fixed level order. They are
 * **densities, not decisions**: nothing here decides that a pixel is ink rather than a mark, and
 * nothing here compares the two. The proposal's "lightness-dominant" and "chroma-dominant" language
 * is a statement about which of `inkEnergy` and `markEnergy` is larger at a pixel — a comparison the
 * energy makes (`src/energy/`), from these two numbers, under a declared exchange rate. Folding a
 * dominance ratio in here would move that judgment into the substrate and hide it from
 * `tools/sensitivity.ts`, which is the failure mode SPEC rule 4 exists to prevent.
 *
 * ## Determinism
 *
 * Levels ascend, pixels ascend, sums accumulate in that fixed order. No allocation in the loops
 * beyond the three output planes and one working plane.
 */

import {
	REGION_CHROMA_BOUNDARY,
	REGION_LIGHTNESS_BOUNDARY,
	SAME_COLOR_BAR_BY_REGION,
} from "../../../../src/contract/constants.ts"
import type { ColorRegion } from "../../../../src/contract/types.ts"
import type { FigureGroundField, ImagePlanes, SurroundLadder } from "../types.ts"
import { FIELD_WEIGHT_EXCLUDED_COARSE_RUNGS, FIELD_WEIGHT_SOFTNESS_BARS } from "./constants.ts"

/**
 * Which measured region an OKLab point falls in.
 *
 * Mirrors `color.ts:colorRegion` on raw coordinates instead of a `PaletteColor`, because this runs
 * per pixel and the contract's version would allocate an object per call. Same two boundaries, same
 * comparisons, same order — pinned to the contract's function by test, and it must stay pinned: two
 * region rules would be two same-colour bars, which is the drift SPEC rule 2 forbids.
 */
export function regionOfOkLab(lightness: number, a: number, b: number): ColorRegion {
	const chroma = Math.sqrt(a * a + b * b)
	const lightnessBand = lightness < REGION_LIGHTNESS_BOUNDARY ? "dark" : "light"
	const chromaBand = chroma < REGION_CHROMA_BOUNDARY ? "neutral" : "saturated"
	return `${lightnessBand}-${chromaBand}` as ColorRegion
}

/** The contract's same-colour bar for a single OKLab point, by its own region. */
export function sameColorBarOfOkLab(lightness: number, a: number, b: number): number {
	return SAME_COLOR_BAR_BY_REGION[regionOfOkLab(lightness, a, b)]
}

/**
 * `d = c − ĉ` in the contract's (ΔL, ΔC, ΔH) convention.
 *
 * `first` is the surround `ĉ` and `second` is the pixel `c`, so the signs read the way the proposal
 * writes the displacement: positive ΔL means the pixel is lighter than what it sits on.
 */
export function decomposeDisplacement(
	pixelL: number,
	pixelA: number,
	pixelB: number,
	groundL: number,
	groundA: number,
	groundB: number,
): Readonly<{ deltaLightness: number; deltaChroma: number; deltaHue: number }> {
	const deltaLightness = pixelL - groundL
	const deltaChroma = Math.hypot(pixelA, pixelB) - Math.hypot(groundA, groundB)
	const chromaticSquared = (pixelA - groundA) ** 2 + (pixelB - groundB) ** 2
	// Clamped at zero exactly as the contract clamps it: ΔC² can exceed the chromatic plane's
	// squared difference by float noise alone.
	const deltaHue = Math.sqrt(Math.max(0, chromaticSquared - deltaChroma ** 2))
	return { deltaLightness, deltaChroma, deltaHue }
}

/**
 * Summarise the ladder into the per-pixel figure–ground field.
 *
 * The `ground` planes are the **coarsest** rung — `levels[0]`, σ ≈ shortEdge/2 — which is
 * `types.ts`'s "the colour this pixel is sitting on". They are returned by reference rather than
 * copied: the ladder outlives the substrate and nothing downstream writes to it.
 *
 * `excludedCoarseRungs` is a parameter only so the anchor measurement in `tests/substrate.test.ts`
 * can sweep it; the pipeline never passes it and the default is the `[MEASURED]` constant. It is
 * clamped to `levelCount − 1`, so the finest rung always survives and a hand-built one-rung ladder
 * still measures that rung.
 */
export function buildFigureGround(
	planes: ImagePlanes,
	ladder: SurroundLadder,
	excludedCoarseRungs: number = FIELD_WEIGHT_EXCLUDED_COARSE_RUNGS,
): FigureGroundField {
	const count = planes.width * planes.height
	const levelCount = ladder.levels.length
	if (levelCount === 0) throw new Error("buildFigureGround: the ladder has no levels")
	if (!Number.isInteger(excludedCoarseRungs) || excludedCoarseRungs < 0) {
		throw new RangeError(`excludedCoarseRungs must be a non-negative integer, got ${excludedCoarseRungs}`)
	}
	// Levels are coarsest-first (`ladder.ts`), so the excluded rungs are the leading ones.
	const firstFieldLevel = Math.min(excludedCoarseRungs, levelCount - 1)

	const fieldWeight = new Float32Array(count)
	const inkEnergy = new Float32Array(count)
	const markEnergy = new Float32Array(count)
	const maxDisplacement = new Float32Array(count)

	const pixelL = planes.L
	const pixelA = planes.a
	const pixelB = planes.b

	// Level-major so every inner loop is three sequential sweeps of typed arrays. The reduction
	// order is (level ascending, pixel ascending) and is what makes the sums bit-reproducible.
	for (let level = 0; level < levelCount; level += 1) {
		const groundL = ladder.levels[level].L
		const groundA = ladder.levels[level].a
		const groundB = ladder.levels[level].b
		for (let index = 0; index < count; index += 1) {
			const deltaL = pixelL[index] - groundL[index]
			const deltaA = pixelA[index] - groundA[index]
			const deltaB = pixelB[index] - groundB[index]
			// √(ΔC² + ΔH²) — identically the chromatic-plane distance under the contract's residual
			// ΔH (see the header). Math.sqrt of the sum rather than Math.hypot: same value here
			// because no term can overflow in OKLab, and hypot is an order of magnitude slower.
			const chromatic = Math.sqrt(deltaA * deltaA + deltaB * deltaB)
			if (level >= firstFieldLevel) {
				const displacement = Math.sqrt(deltaL * deltaL + chromatic * chromatic)
				if (displacement > maxDisplacement[index]) maxDisplacement[index] = displacement
			}
			inkEnergy[index] += deltaL < 0 ? -deltaL : deltaL
			markEnergy[index] += chromatic
		}
	}

	const inverseLevels = 1 / levelCount
	for (let index = 0; index < count; index += 1) {
		inkEnergy[index] *= inverseLevels
		markEnergy[index] *= inverseLevels
		const bar = sameColorBarOfOkLab(pixelL[index], pixelA[index], pixelB[index]) *
			FIELD_WEIGHT_SOFTNESS_BARS
		const ratio = maxDisplacement[index] / bar
		fieldWeight[index] = 1 / (1 + ratio * ratio)
	}

	return {
		fieldWeight,
		inkEnergy,
		markEnergy,
		ground: { L: ladder.levels[0].L, a: ladder.levels[0].a, b: ladder.levels[0].b },
	}
}
