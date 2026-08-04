/**
 * VERIFIER, check 2 — the sRGB-gamut-in-OKLab volume, re-derived from scratch.
 *
 * Imports nothing from the prototype (not even `rgbToOkLab`): the sRGB transfer function, the OKLab
 * matrices and the Jacobian are all written out here so that a mistake in the subject's colour code
 * would show as a disagreement rather than cancel.
 *
 * Three independent estimators of V = ∫_{[0,1]³} |det J(f)| dr dg db, f = sRGB → OKLab:
 *   1. analytic |det J| + tensor Gauss–Legendre quadrature (high order, the reference),
 *   2. analytic |det J| + midpoint rule (convergence check),
 *   3. Monte Carlo over the cube with a seeded LCG (a genuinely different family),
 *   4. the subject's *own definition* (Kuhn tetrahedra on an n³ grid), reimplemented here, so the
 *      claimed constant can be attributed to its quadrature rather than to a bug.
 */

// --- sRGB → OKLab, written from the published definition -------------------------------------

const toLinear = (u: number): number => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4)
const dToLinear = (u: number): number =>
	u <= 0.04045 ? 1 / 12.92 : (2.4 / 1.055) * ((u + 0.055) / 1.055) ** 1.4

const M = [
	[0.4122214708, 0.5363325363, 0.0514459929],
	[0.2119034982, 0.6806995451, 0.1073969566],
	[0.0883024619, 0.2817188376, 0.6299787005],
]
const A = [
	[0.2104542553, 0.793617785, -0.0040720468],
	[1.9779984951, -2.428592205, 0.4505937099],
	[0.0259040371, 0.7827717662, -0.808675766],
]

function det3(m: number[][]): number {
	return (
		m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
		m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
		m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
	)
}

const DET_M = det3(M)
const DET_A = det3(A)

function okLab(r: number, g: number, b: number): [number, number, number] {
	const rl = toLinear(r)
	const gl = toLinear(g)
	const bl = toLinear(b)
	const l = Math.cbrt(M[0][0] * rl + M[0][1] * gl + M[0][2] * bl)
	const m = Math.cbrt(M[1][0] * rl + M[1][1] * gl + M[1][2] * bl)
	const s = Math.cbrt(M[2][0] * rl + M[2][1] * gl + M[2][2] * bl)
	return [
		A[0][0] * l + A[0][1] * m + A[0][2] * s,
		A[1][0] * l + A[1][1] * m + A[1][2] * s,
		A[2][0] * l + A[2][1] * m + A[2][2] * s,
	]
}

/**
 * |det J| in closed form. f = A ∘ cbrt ∘ M ∘ γ⁻¹, all three inner maps having diagonal or constant
 * Jacobians, so det J = det A · (1/27)(u_L u_M u_S)^{-2/3} · det M · γ'(r)γ'(g)γ'(b).
 */
function absDetJ(r: number, g: number, b: number): number {
	const rl = toLinear(r)
	const gl = toLinear(g)
	const bl = toLinear(b)
	const uL = M[0][0] * rl + M[0][1] * gl + M[0][2] * bl
	const uM = M[1][0] * rl + M[1][1] * gl + M[1][2] * bl
	const uS = M[2][0] * rl + M[2][1] * gl + M[2][2] * bl
	if (uL <= 0 || uM <= 0 || uS <= 0) return 0
	const cube = (uL * uM * uS) ** (-2 / 3) / 27
	return Math.abs(DET_A * DET_M) * cube * dToLinear(r) * dToLinear(g) * dToLinear(b)
}

// --- 1. tensor Gauss–Legendre over a subdivided cube -------------------------------------------

/** Gauss–Legendre nodes/weights on [-1,1] by Newton on the Legendre polynomial. */
function gaussLegendre(n: number): { x: number[]; w: number[] } {
	const x: number[] = []
	const w: number[] = []
	for (let i = 0; i < n; i += 1) {
		let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5))
		let pp = 0
		for (let iter = 0; iter < 100; iter += 1) {
			let p0 = 1
			let p1 = 0
			for (let j = 0; j < n; j += 1) {
				const p2 = p1
				p1 = p0
				p0 = ((2 * j + 1) * z * p1 - j * p2) / (j + 1)
			}
			pp = (n * (z * p0 - p1)) / (z * z - 1)
			const dz = p0 / pp
			z -= dz
			if (Math.abs(dz) < 1e-15) break
		}
		x.push(z)
		w.push(2 / ((1 - z * z) * pp * pp))
	}
	return { x, w }
}

function gaussVolume(cells: number, order: number): number {
	const { x, w } = gaussLegendre(order)
	const h = 1 / cells
	// Pre-expand the 1-D node set over the whole [0,1] interval.
	const nodes: number[] = []
	const weights: number[] = []
	for (let c = 0; c < cells; c += 1) {
		const mid = (c + 0.5) * h
		for (let i = 0; i < order; i += 1) {
			nodes.push(mid + (h / 2) * x[i])
			weights.push((h / 2) * w[i])
		}
	}
	let total = 0
	for (let i = 0; i < nodes.length; i += 1) {
		for (let j = 0; j < nodes.length; j += 1) {
			const wij = weights[i] * weights[j]
			for (let k = 0; k < nodes.length; k += 1) {
				total += wij * weights[k] * absDetJ(nodes[i], nodes[j], nodes[k])
			}
		}
	}
	return total
}

// --- 2. midpoint rule --------------------------------------------------------------------------

function midpointVolume(n: number): number {
	const h = 1 / n
	let total = 0
	for (let i = 0; i < n; i += 1) {
		const r = (i + 0.5) * h
		for (let j = 0; j < n; j += 1) {
			const g = (j + 0.5) * h
			for (let k = 0; k < n; k += 1) {
				total += absDetJ(r, g, (k + 0.5) * h)
			}
		}
	}
	return total * h * h * h
}

// --- 3. Monte Carlo ------------------------------------------------------------------------------

function monteCarloVolume(samples: number, seed: number): { mean: number; stderr: number } {
	// A plain 64-bit-ish LCG; deterministic, and nothing about the answer depends on its quality
	// beyond equidistribution, which the standard error below reports on.
	let state = BigInt(seed)
	const mul = 6364136223846793005n
	const inc = 1442695040888963407n
	const mask = (1n << 64n) - 1n
	const next = (): number => {
		state = (state * mul + inc) & mask
		return Number(state >> 11n) / 2 ** 53
	}
	let sum = 0
	let sumSq = 0
	for (let i = 0; i < samples; i += 1) {
		const v = absDetJ(next(), next(), next())
		sum += v
		sumSq += v * v
	}
	const mean = sum / samples
	const variance = sumSq / samples - mean * mean
	return { mean, stderr: Math.sqrt(Math.max(0, variance) / samples) }
}

// --- 4. the subject's own definition, reimplemented ----------------------------------------------

const KUHN: readonly (readonly [number, number, number, number])[] = [
	[0, 1, 3, 7],
	[0, 1, 5, 7],
	[0, 4, 5, 7],
	[0, 4, 6, 7],
	[0, 2, 6, 7],
	[0, 2, 3, 7],
]

function kuhnGridVolume(n: number): number {
	const side = n + 1
	const corner = new Float64Array(side * side * side * 3)
	const at = (i: number, j: number, k: number) => ((i * side + j) * side + k) * 3
	for (let i = 0; i < side; i += 1) {
		for (let j = 0; j < side; j += 1) {
			for (let k = 0; k < side; k += 1) {
				const lab = okLab(i / n, j / n, k / n)
				const base = at(i, j, k)
				corner[base] = lab[0]
				corner[base + 1] = lab[1]
				corner[base + 2] = lab[2]
			}
		}
	}
	let volume = 0
	for (let i = 0; i < n; i += 1) {
		for (let j = 0; j < n; j += 1) {
			for (let k = 0; k < n; k += 1) {
				for (const tet of KUHN) {
					const p = tet.map((code) =>
						at(i + ((code >> 2) & 1), j + ((code >> 1) & 1), k + (code & 1)),
					)
					const ux = corner[p[1]] - corner[p[0]]
					const uy = corner[p[1] + 1] - corner[p[0] + 1]
					const uz = corner[p[1] + 2] - corner[p[0] + 2]
					const vx = corner[p[2]] - corner[p[0]]
					const vy = corner[p[2] + 1] - corner[p[0] + 1]
					const vz = corner[p[2] + 2] - corner[p[0] + 2]
					const wx = corner[p[3]] - corner[p[0]]
					const wy = corner[p[3] + 1] - corner[p[0] + 1]
					const wz = corner[p[3] + 2] - corner[p[0] + 2]
					volume +=
						Math.abs(
							ux * (vy * wz - vz * wy) - uy * (vx * wz - vz * wx) + uz * (vx * wy - vy * wx),
						) / 6
				}
			}
		}
	}
	return volume
}

// --- report -------------------------------------------------------------------------------------

const CLAIMED_V = 0.0541866
const CLAIMED_RHO = 18.4548

console.log("CLAIMED   V =", CLAIMED_V, "  rho0 =", CLAIMED_RHO)
console.log("")
console.log("-- estimator 1: analytic |det J|, Gauss-Legendre --")
for (const [cells, order] of [
	[8, 6],
	[16, 8],
	[24, 10],
] as const) {
	const v = gaussVolume(cells, order)
	console.log(`  cells=${cells} order=${order}  V = ${v.toFixed(10)}  rho0 = ${(1 / v).toFixed(6)}`)
}
console.log("")
console.log("-- estimator 2: analytic |det J|, midpoint --")
for (const n of [64, 128, 256, 512]) {
	const v = midpointVolume(n)
	console.log(`  n=${String(n).padStart(4)}  V = ${v.toFixed(10)}  rho0 = ${(1 / v).toFixed(6)}`)
}
console.log("")
console.log("-- estimator 3: Monte Carlo --")
for (const seed of [1, 2, 3]) {
	const { mean, stderr } = monteCarloVolume(4_000_000, seed)
	console.log(
		`  seed=${seed}  V = ${mean.toFixed(8)} +/- ${stderr.toFixed(8)}  rho0 = ${(1 / mean).toFixed(5)}`,
	)
}
console.log("")
console.log("-- estimator 4: the subject's own Kuhn-tetrahedra definition, reimplemented --")
for (const n of [8, 16, 32, 48, 64, 96]) {
	const v = kuhnGridVolume(n)
	console.log(`  n=${String(n).padStart(3)}  V = ${v.toFixed(10)}  rho0 = ${(1 / v).toFixed(6)}`)
}
