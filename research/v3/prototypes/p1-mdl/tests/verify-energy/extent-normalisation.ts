/**
 * VERIFIER — check 7: is the extent half of arm A's joint code actually a **code**?
 *
 * `support.ts` claims `q_field`, `q_ink` and their mixture `m` are densities on `ê ∈ [0, S]`. If any
 * of them integrates to something other than 1, `−log m(ê)` is not a code length and arm A's currency
 * ("nats per unit image mass") is broken — a sub-normalised density would let the model buy energy by
 * leaking probability mass off the support.
 *
 * The module's own test (`tests/energy-a/support.test.ts` case (i)) uses a 20,000-step trapezoid rule.
 * This file deliberately uses a **different** quadrature — 16-point Gauss–Legendre on each of 64
 * panels, exact for polynomials of degree 31 per panel — so agreement is not an artefact of a shared
 * discretisation, and its tolerance is 1e-13 rather than 1e-6.
 *
 * Three integrands, over the whole profile grid `ŝ* ∈ {0, …, S}`:
 *
 *   1. `q_field` and `q_ink` from the module's exported `extentDensities`;
 *   2. `m(ê) = π₀q_field + (1−π₀)q_ink` built from the module's exported `extentFieldPrior`;
 *   3. `exp(−extentSupportNats(ê))` — the quantity the energy actually charges, which must be `m`
 *      itself. This is the one that matters: it closes the gap between "the densities normalise" and
 *      "the number added to the energy is the log of a normalised density".
 */

import {
	extentDensities,
	extentFieldPrior,
	extentLadderOf,
	extentSupportNats,
} from "../../src/energy/a/index.ts"
import { measureImage } from "../../src/measure/index.ts"
import { writeRgbImage, cleanupFixtures } from "../energy-a/support.ts"

/** 16-point Gauss–Legendre nodes and weights on [−1, 1]. */
const NODES = [
	-0.0950125098376374, 0.0950125098376374, -0.2816035507792589, 0.2816035507792589,
	-0.4580167776572274, 0.4580167776572274, -0.6178762444026438, 0.6178762444026438,
	-0.755404408355003, 0.755404408355003, -0.8656312023878318, 0.8656312023878318,
	-0.9445750230732326, 0.9445750230732326, -0.9894009349916499, 0.9894009349916499,
]
const WEIGHTS = [
	0.1894506104550685, 0.1894506104550685, 0.1826034150449236, 0.1826034150449236,
	0.1691565193950025, 0.1691565193950025, 0.1495959888165767, 0.1495959888165767,
	0.1246289712555339, 0.1246289712555339, 0.0951585116824928, 0.0951585116824928,
	0.0622535239386479, 0.0622535239386479, 0.0271524594117541, 0.0271524594117541,
]
const PANELS = 64

function integrate(span: number, f: (x: number) => number): number {
	const width = span / PANELS
	let total = 0
	for (let panel = 0; panel < PANELS; panel += 1) {
		const centre = (panel + 0.5) * width
		const half = width / 2
		for (let node = 0; node < NODES.length; node += 1) {
			total += WEIGHTS[node] * f(centre + half * NODES[node]) * half
		}
	}
	return total
}

const path = await writeRgbImage("verify-extent-normalisation.png", 32, 32, (x) =>
	x < 16 ? [58, 62, 92] : [198, 152, 78],
)
const ladder = extentLadderOf(await measureImage(path))
const span = ladder.rungCount
console.log(`ladder: S = ${span} rungs, weightSum = ${ladder.weightSum}, tailFloor = ${ladder.tailFloor}`)

const one = new Float64Array(1)
const at = new Float64Array(1)
let worst = 0
console.log("\n ŝ*      ∫q_field        ∫q_ink          ∫m(ê)           ∫exp(−supportNats)")
for (let splitScale = 0; splitScale <= span; splitScale += 1) {
	const prior = extentFieldPrior(splitScale, ladder)
	const field = integrate(span, (x) => extentDensities(x, ladder).field)
	const ink = integrate(span, (x) => extentDensities(x, ladder).ink)
	const mix = integrate(span, (x) => {
		const d = extentDensities(x, ladder)
		return prior * d.field + (1 - prior) * d.ink
	})
	const charged = integrate(span, (x) => {
		at[0] = x
		extentSupportNats(at, splitScale, ladder, one)
		return Math.exp(-one[0])
	})
	for (const value of [field, ink, mix, charged]) worst = Math.max(worst, Math.abs(value - 1))
	console.log(
		`  ${String(splitScale).padStart(2)}   ${field.toPrecision(15)}  ${ink.toPrecision(15)}  ` +
			`${mix.toPrecision(15)}  ${charged.toPrecision(15)}`,
	)
}
console.log(
	`\nworst |∫ − 1| over all four integrands and all ${span + 1} grid points = ${worst.toExponential(3)}  ` +
		`${worst < 1e-13 ? "NORMALISED" : "NOT NORMALISED"}`,
)

await cleanupFixtures()
