/**
 * # The residual — a uniform density over the sRGB gamut
 *
 * Arm A §2.2: *"The residual is the uniform density over the sRGB gamut, absorbing mass no
 * four-colour model claims — photographic content, texture, everything the palette is not — at a
 * bounded, parameter-free price."* §3.4 names it as one of the four places a decision lives, and
 * §4 lists it under *explicitly not free*.
 *
 * "Uniform over the gamut" has exactly one number in it: the gamut's **volume in OKLab**, which is
 * the normalising constant of the uniform density. That number is not a parameter — it is a property
 * of sRGB and of the contract's one colour space — so this module computes it rather than storing it.
 *
 * ## How the volume is computed
 *
 * The sRGB cube is partitioned into an `n³` grid. Each cell's eight corners are mapped into OKLab
 * with the contract's own `rgbToOkLab` and the image cell — a curved hexahedron — is decomposed into
 * six tetrahedra whose signed volumes are summed in absolute value. As `n` grows this converges to
 * `∫ |det J| ` over the cube, which is the volume of the image of a diffeomorphism.
 *
 * **Why not a Monte-Carlo estimate.** Arm A §2.5: *"There is no RNG, no sampling."* A grid
 * quadrature is deterministic, and its error is a smooth function of `n` that can be exhibited by
 * refining — which is what `GAMUT_VOLUME_GRID`'s docstring does and what the test re-derives.
 *
 * **Why the tetrahedra rather than a finite-difference Jacobian.** Six 3×3 determinants per cell
 * reuse the corner conversions across neighbouring cells; a Jacobian would need its own stencil of
 * conversions per cell and cost roughly seven times as much for the same order of accuracy.
 */

import { rgbToOkLab } from "../../../../../src/contract/color.ts"
import type { Rgb8 } from "../../../../../src/contract/types.ts"
import { GAMUT_VOLUME_GRID } from "./constants.ts"

/**
 * The six-tetrahedron decomposition of a cube, as corner codes.
 *
 * Derived-and-stated: a corner code is the three-bit index `(di<<2)|(dj<<1)|dk` of a cube vertex.
 * These six tetrahedra are the standard Kuhn triangulation — every one of them contains the main
 * diagonal 0→7, they partition the cube exactly, and the triangulation is *consistent* across
 * neighbouring cells, so no face is covered twice or left uncovered.
 */
const CUBE_TETRAHEDRA: readonly (readonly [number, number, number, number])[] = [
	[0, 1, 3, 7],
	[0, 1, 5, 7],
	[0, 4, 5, 7],
	[0, 4, 6, 7],
	[0, 2, 6, 7],
	[0, 2, 3, 7],
]

/**
 * The OKLab volume of the sRGB gamut, by grid quadrature. Exported for the refinement test; the rest
 * of the energy reads the memoised `sRgbGamutVolumeOkLab()` below.
 */
export function computeSRgbGamutVolumeOkLab(gridSteps: number): number {
	const side = gridSteps + 1
	const corners = new Float64Array(side * side * side * 3)
	const cornerBase = (i: number, j: number, k: number) => ((i * side + j) * side + k) * 3

	for (let i = 0; i < side; i += 1) {
		for (let j = 0; j < side; j += 1) {
			for (let k = 0; k < side; k += 1) {
				// `rgbToOkLab` divides by 255 and is defined by arithmetic, not by a lookup, so it is
				// exact at the non-integer grid points a quadrature needs. Using the contract's own
				// function rather than a local copy is what keeps this volume the volume of *this*
				// prototype's colour space.
				const lab = rgbToOkLab([
					(255 * i) / gridSteps,
					(255 * j) / gridSteps,
					(255 * k) / gridSteps,
				] as unknown as Rgb8)
				const base = cornerBase(i, j, k)
				corners[base] = lab[0]
				corners[base + 1] = lab[1]
				corners[base + 2] = lab[2]
			}
		}
	}

	let volume = 0
	for (let i = 0; i < gridSteps; i += 1) {
		for (let j = 0; j < gridSteps; j += 1) {
			for (let k = 0; k < gridSteps; k += 1) {
				for (const tetrahedron of CUBE_TETRAHEDRA) {
					const [codeA, codeB, codeC, codeD] = tetrahedron
					const a = cornerBase(i + ((codeA >> 2) & 1), j + ((codeA >> 1) & 1), k + (codeA & 1))
					const b = cornerBase(i + ((codeB >> 2) & 1), j + ((codeB >> 1) & 1), k + (codeB & 1))
					const c = cornerBase(i + ((codeC >> 2) & 1), j + ((codeC >> 1) & 1), k + (codeC & 1))
					const d = cornerBase(i + ((codeD >> 2) & 1), j + ((codeD >> 1) & 1), k + (codeD & 1))

					const ux = corners[b] - corners[a]
					const uy = corners[b + 1] - corners[a + 1]
					const uz = corners[b + 2] - corners[a + 2]
					const vx = corners[c] - corners[a]
					const vy = corners[c + 1] - corners[a + 1]
					const vz = corners[c + 2] - corners[a + 2]
					const wx = corners[d] - corners[a]
					const wy = corners[d + 1] - corners[a + 1]
					const wz = corners[d + 2] - corners[a + 2]

					const determinant =
						ux * (vy * wz - vz * wy) - uy * (vx * wz - vz * wx) + uz * (vx * wy - vy * wx)
					volume += Math.abs(determinant) / 6
				}
			}
		}
	}
	return volume
}

let memoisedVolume: number | null = null

/**
 * The OKLab volume of the sRGB gamut at `GAMUT_VOLUME_GRID`, computed once per process.
 *
 * Lazy rather than eager so that importing the energy costs nothing; memoised rather than recomputed
 * so that a search evaluating a million configurations pays for it once. Neither choice can affect a
 * value: the function is pure and its argument is a constant.
 */
export function sRgbGamutVolumeOkLab(): number {
	if (memoisedVolume === null) memoisedVolume = computeSRgbGamutVolumeOkLab(GAMUT_VOLUME_GRID)
	return memoisedVolume
}

/**
 * The residual density itself: `1 / V`, in OKLab units⁻³. ≈ 18.45.
 *
 * A colour that no kernel in the configuration reaches costs `−log ρ₀ ≈ −2.915` nats, against
 * `≈ −9.9` for one sitting on a role colour. That gap — about seven nats — is the whole currency the
 * λ trade is denominated in, and it is fixed by sRGB rather than by anyone's taste.
 */
export function residualDensity(): number {
	return 1 / sRgbGamutVolumeOkLab()
}
