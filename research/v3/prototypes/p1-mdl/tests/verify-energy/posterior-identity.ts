/**
 * VERIFIER — check 6: is arm A's extent code's **posterior** really `split.ts`'s own logistic?
 *
 * This is the load-bearing claim of the DESIGN-9 fix (`src/energy/a/support.ts`, energy 0.2.0). If it
 * holds, the exponential rate `1/2w` is *forced* by a constant the model already had and the fix adds
 * no freedom. If it fails, the rate is a second, independent modelling choice and "no new constant"
 * is false.
 *
 * ## The derivation, done here rather than read from the module
 *
 * Write `r = 1/2w`, `Z = ∫₀^S e^{−u r} du`, and the two stated densities on `ê ∈ [0, S]`:
 *
 *     q_field(ê) = e^{−ê r} / Z        q_ink(ê) = e^{−(S−ê) r} / Z
 *     m(ê)       = π₀ q_field(ê) + (1−π₀) q_ink(ê)
 *
 * `Z` is shared, so it cancels out of the ratio:
 *
 *     π₀ q_field(ê)         π₀ e^{−ê r}                                1
 *     ───────────── = ──────────────────────────────── = ───────────────────────────────────
 *         m(ê)         π₀ e^{−ê r} + (1−π₀) e^{−(S−ê) r}   1 + (1−π₀)/π₀ · e^{−(S−ê) r + ê r}
 *
 *                   = σ( logit π₀ + (S − 2ê)·r )
 *                   = σ( logit π₀ + (S − 2ê)/2w ).
 *
 * Substituting the module's stated reparameterisation `π₀ = σ((ŝ* − S/2)/w)`, whose logit is
 * `(ŝ* − S/2)/w`:
 *
 *     logit π₀ + (S − 2ê)/2w = (ŝ* / w) − S/2w + S/2w − ê/w = (ŝ* − ê)/w.
 *
 * So the posterior is `σ((ŝ* − ê)/w)` — `split.ts: fieldMembership`, to the letter, at arm A §4.2's
 * one-octave softness. **The `S/2` offset in `π₀` is exactly what cancels the `+S/2w` the two anchors
 * contribute**, which is the whole reason the identity is available at rate `1/2w` and at no other:
 * a rate `ρ ≠ 1/2w` gives slope `2ρ ≠ 1/w` in `ê`, a logistic of a different width, contradicting the
 * anchor. The rate is therefore [DERIVED], not chosen.
 *
 * ## What is checked below
 *
 * The algebra above, evaluated numerically at 20 `ê` values across `[0, S]`, for two `(ŝ*, S, w)`
 * settings **taken from real measurements** — `S` is the ladder each cover's measurement reports and
 * `ŝ*` is the split scale `energyOfA` actually profiles to on that cover — against
 *
 *   (a) this file's own from-scratch `m(ê)` and `π₀`, and
 *   (b) `split.ts: fieldMembership`, the logistic the energy uses for membership.
 *
 * Nothing here imports `support.ts`. The module's own numbers are compared separately in
 * `hand-computation.ts`; this file only asks whether the *stated model* has the property claimed.
 */

import { join } from "node:path"
import type { Configuration } from "../../src/emit/types.ts"
import { energyOfA } from "../../src/energy/a/index.ts"
import { measureImage } from "../../src/measure/index.ts"
import { fieldMembership } from "../../src/energy/a/split.ts"
import { readSetFile, resolveCorpusRoot, setFilePath } from "../measure/support.ts"

/** Arm A §4.2's one octave, written here rather than imported — see `recompute.ts`. */
const W = 1

/** `π₀ = σ((ŝ* − S/2)/w)`, from the stated reparameterisation. */
function fieldPrior(splitScale: number, span: number): number {
	return 1 / (1 + Math.exp(-(splitScale - span / 2) / W))
}

/** `m(ê) = π₀ q_field + (1−π₀) q_ink`, from the stated densities. */
function marginal(rung: number, splitScale: number, span: number): number {
	const rate = 1 / (2 * W)
	const z = (1 - Math.exp(-span * rate)) / rate
	const prior = fieldPrior(splitScale, span)
	return (
		(prior * Math.exp(-rung * rate) + (1 - prior) * Math.exp(-(span - rung) * rate)) / z
	)
}

function sigma(x: number): number {
	return 1 / (1 + Math.exp(-x))
}

const corpusRoot = resolveCorpusRoot("00")
if (corpusRoot === null) throw new Error("artwork shards are not present in this checkout")
const paths = await readSetFile(setFilePath("demo-20.txt"))

const flat = (rgb: [number, number, number], fg: [number, number, number]): Configuration => ({
	background: rgb,
	surface: rgb,
	foreground: fg,
	accent: fg,
	gradient: false,
	stops: [],
	surfaceCollapsed: true,
	accentCollapsed: true,
	escape: null,
})

const settings: { label: string; splitScale: number; span: number }[] = []
for (const relative of paths.slice(0, 2)) {
	const measurement = await measureImage(join(corpusRoot, relative))
	const result = energyOfA(measurement, flat([20, 20, 20], [240, 240, 240]))
	settings.push({
		label: relative,
		splitScale: result.nuisance.splitScaleRung as number,
		span: measurement.constants.extentLadderScales,
	})
}

let worstOwn = 0
let worstSplit = 0
for (const setting of settings) {
	const { label, splitScale, span } = setting
	console.log(`\n=== ${label}   ŝ* = ${splitScale}   S = ${span}   w = ${W}   π₀ = ${fieldPrior(splitScale, span).toPrecision(12)}`)
	const rungs = new Float64Array(20)
	for (let index = 0; index < 20; index += 1) rungs[index] = (index * span) / 19
	const membership = new Float64Array(20)
	fieldMembership(rungs, splitScale, membership)
	for (let index = 0; index < 20; index += 1) {
		const rung = rungs[index]
		const posterior = (fieldPrior(splitScale, span) * Math.exp(-rung / (2 * W)) /
			((1 - Math.exp(-span / (2 * W))) * 2 * W)) / marginal(rung, splitScale, span)
		const logistic = sigma((splitScale - rung) / W)
		const gapOwn = Math.abs(posterior - logistic)
		const gapSplit = Math.abs(posterior - membership[index])
		worstOwn = Math.max(worstOwn, gapOwn)
		worstSplit = Math.max(worstSplit, gapSplit)
		console.log(
			`  ê=${rung.toFixed(6).padStart(10)}  π₀q_field/m = ${posterior.toPrecision(12).padStart(18)}` +
				`   σ((ŝ*−ê)/w) = ${logistic.toPrecision(12).padStart(18)}   |Δ| ${gapOwn.toExponential(2)}` +
				`   vs split.ts ${gapSplit.toExponential(2)}`,
		)
	}
}

console.log(
	`\nworst |posterior − σ((ŝ*−ê)/w)| = ${worstOwn.toExponential(3)}   ` +
		`worst |posterior − split.ts fieldMembership| = ${worstSplit.toExponential(3)}   ` +
		`${worstOwn < 1e-14 && worstSplit < 1e-14 ? "IDENTITY HOLDS" : "IDENTITY FAILS"}`,
)

// A falsification control: the identity must be *specific* to the rate 1/2w. At any other rate the
// posterior is a logistic of a different width, so it must visibly leave σ((ŝ*−ê)/w).
console.log("\n--- control: the same check at rates other than 1/2w (must FAIL) ---")
for (const factor of [0.5, 2]) {
	const rate = factor / (2 * W)
	const { splitScale, span } = settings[0]
	const z = (1 - Math.exp(-span * rate)) / rate
	const prior = fieldPrior(splitScale, span)
	let worst = 0
	for (let index = 0; index < 20; index += 1) {
		const rung = (index * span) / 19
		const field = (prior * Math.exp(-rung * rate)) / z
		const ink = ((1 - prior) * Math.exp(-(span - rung) * rate)) / z
		worst = Math.max(worst, Math.abs(field / (field + ink) - sigma((splitScale - rung) / W)))
	}
	console.log(
		`  rate = ${factor}·(1/2w): worst gap ${worst.toExponential(3)}  ${worst > 1e-6 ? "DIFFERS (as required)" : "MATCHES — rate is NOT forced"}`,
	)
}
