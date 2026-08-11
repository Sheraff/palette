/**
 * The small dense linear algebra the closed-form geometries need. Nothing here iterates to a
 * tolerance; every routine terminates in a fixed number of arithmetic operations, which is what makes
 * "no search, no iteration" (arm A′ §2.1) literally true of the geometry fits.
 */

import { LINEAR_SOLVE_PIVOT_EPSILON } from "./constants.ts"

/**
 * Solve `A x = b` for a small dense system by Gaussian elimination with partial pivoting.
 *
 * Returns `null` when the system is rank-deficient — a one-pixel-wide image, a single row — rather
 * than solving through the noise. The caller reports the geometry degenerate; it does not invent one.
 *
 * Pivot selection is by magnitude with the lowest row index winning a tie, so the elimination order
 * is a function of the numbers alone and the result is reproducible.
 */
export function solveLinearSystem(
	matrix: readonly number[][],
	rightHandSide: readonly number[],
): number[] | null {
	const size = rightHandSide.length
	const augmented = matrix.map((row, index) => [...row, rightHandSide[index]])

	for (let column = 0; column < size; column += 1) {
		let pivotRow = column
		let pivotMagnitude = Math.abs(augmented[column][column])
		for (let row = column + 1; row < size; row += 1) {
			const magnitude = Math.abs(augmented[row][column])
			if (magnitude > pivotMagnitude) {
				pivotMagnitude = magnitude
				pivotRow = row
			}
		}
		if (pivotMagnitude < LINEAR_SOLVE_PIVOT_EPSILON) return null
		if (pivotRow !== column) {
			const swap = augmented[column]
			augmented[column] = augmented[pivotRow]
			augmented[pivotRow] = swap
		}
		const pivot = augmented[column][column]
		for (let row = column + 1; row < size; row += 1) {
			const factor = augmented[row][column] / pivot
			if (factor === 0) continue
			for (let inner = column; inner <= size; inner += 1) {
				augmented[row][inner] -= factor * augmented[column][inner]
			}
		}
	}

	const solution = new Array<number>(size).fill(0)
	for (let row = size - 1; row >= 0; row -= 1) {
		let accumulated = augmented[row][size]
		for (let column = row + 1; column < size; column += 1) {
			accumulated -= augmented[row][column] * solution[column]
		}
		solution[row] = accumulated / augmented[row][row]
	}
	return solution
}

/**
 * Leading eigenpair of a symmetric 2×2 matrix `[[a, b], [b, c]]`, in closed form.
 *
 * This is the whole of "the leading canonical correlation between normalised position and OKLab
 * colour" (arm A §2.1): with position two-dimensional the problem is 2×2 and has a quadratic
 * solution, so the ramp axis is never searched.
 */
export function leadingEigenpair2x2(
	a: number,
	b: number,
	c: number,
): { eigenvalue: number; eigenvector: readonly [number, number]; secondEigenvalue: number } {
	const half = (a + c) / 2
	const gap = (a - c) / 2
	const discriminant = Math.sqrt(gap * gap + b * b)
	const eigenvalue = half + discriminant
	const secondEigenvalue = half - discriminant
	if (b !== 0) {
		const vectorX = eigenvalue - c
		const vectorY = b
		const norm = Math.hypot(vectorX, vectorY)
		return { eigenvalue, eigenvector: [vectorX / norm, vectorY / norm], secondEigenvalue }
	}
	return {
		eigenvalue,
		eigenvector: a >= c ? [1, 0] : [0, 1],
		secondEigenvalue,
	}
}
