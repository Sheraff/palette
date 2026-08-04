/**
 * VERIFIER — an independent reimplementation of both energies from the modules' *stated* formulas.
 *
 * Nothing in this file imports `src/energy/a` or `src/energy/aprime`. It reads the `Measurement`
 * (whose own verification is a separate job) and the `Configuration`, and rebuilds every term from
 * the header comments of the two `index.ts` files plus the constants those headers name. The
 * comparison harness in `hand-computation.ts` puts the two side by side.
 */

import { rgbToOkLab } from "../../../../src/contract/color.ts"
import {
	REGION_CHROMA_BOUNDARY,
	REGION_LIGHTNESS_BOUNDARY,
	SAME_COLOR_BAR_BY_REGION,
} from "../../../../src/contract/constants.ts"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import type { Measurement } from "../../src/measure/types.ts"
import type { Configuration } from "../../src/emit/types.ts"

// --- shared: the identity bar, re-derived from the contract's two boundaries -------------------

export function barOf(lab: readonly [number, number, number]): number {
	const chroma = Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2])
	const light = lab[0] < REGION_LIGHTNESS_BOUNDARY ? "dark" : "light"
	const sat = chroma < REGION_CHROMA_BOUNDARY ? "neutral" : "saturated"
	return SAME_COLOR_BAR_BY_REGION[`${light}-${sat}` as keyof typeof SAME_COLOR_BAR_BY_REGION]
}

const TWO_PI_32 = (2 * Math.PI) ** 1.5
const TRUNC_SQ = 8 * 8

/**
 * `w` — arm A §4.2's softness, "one ladder octave", stated with no digits attached
 * (`constants.ts: FIELD_INK_SOFTNESS_OCTAVES`). Written here rather than imported: this file rebuilds
 * the energy from the modules' *stated* formulas and must not inherit their arithmetic.
 */
const SOFTNESS_OCTAVES = 1

// ============================================================================================
// ARM A
// ============================================================================================

export type ArmAResult = {
	total: number
	field: number
	ink: number
	structural: number
	escape: number
	omega: number
	fieldOrder: string
	splitScaleRung: number
	geometry: string
	direction: string
	residualWeight: number
	gamutVolume: number
	dataCost: number
	/** `Σ_c u_c·(−log m(ê_c))` — the extent half of the joint code, at the winning split scale. */
	supportCost: number
	/** `π₀ = σ((ŝ* − S/2)/w)` — the split scale read as the joint model's population prior. */
	fieldPrior: number
	/** `Σ_c π(c)·u_c` — the share of image mass the winning split scale puts in the field. */
	fieldMassFraction: number
}

/**
 * The extent half of arm A's joint (colour, extent) code, rebuilt from `support.ts`'s *stated*
 * densities rather than from its arithmetic.
 *
 *     q_field(ê) = e^{−ê/2w} / Z      q_ink(ê) = e^{−(S−ê)/2w} / Z      Z = ∫₀^S e^{−u/2w} du
 *     m(ê)       = π₀·q_field(ê) + (1−π₀)·q_ink(ê)          π₀ = σ((ŝ* − S/2)/w)
 *
 * `Z` is written in its closed form `2w(1 − e^{−S/2w})`, which is the integral above and not the
 * `(1 − e^{−S·r})/r` the module happens to type. Returns `−log m(ê)` in nats.
 */
export function extentSupportNats(
	rungs: Float64Array,
	splitScaleRung: number,
	rungCount: number,
): { nats: Float64Array; fieldPrior: number } {
	const w = SOFTNESS_OCTAVES
	const S = rungCount
	const Z = 2 * w * (1 - Math.exp(-S / (2 * w)))
	const fieldPrior = 1 / (1 + Math.exp(-(splitScaleRung - S / 2) / w))
	const nats = new Float64Array(rungs.length)
	for (let r = 0; r < rungs.length; r += 1) {
		const qField = Math.exp(-rungs[r] / (2 * w)) / Z
		const qInk = Math.exp(-(S - rungs[r]) / (2 * w)) / Z
		nats[r] = -Math.log(fieldPrior * qField + (1 - fieldPrior) * qInk)
	}
	return { nats, fieldPrior }
}

/** V, by the Kuhn-tetrahedra definition `gamut.ts` states, at the grid `constants.ts` names. */
export function gamutVolume(n: number): number {
	const side = n + 1
	const corner = new Float64Array(side * side * side * 3)
	const at = (i: number, j: number, k: number) => ((i * side + j) * side + k) * 3
	for (let i = 0; i < side; i += 1)
		for (let j = 0; j < side; j += 1)
			for (let k = 0; k < side; k += 1) {
				const lab = rgbToOkLab([(255 * i) / n, (255 * j) / n, (255 * k) / n] as unknown as Rgb8)
				const b = at(i, j, k)
				corner[b] = lab[0]
				corner[b + 1] = lab[1]
				corner[b + 2] = lab[2]
			}
	const tets = [
		[0, 1, 3, 7],
		[0, 1, 5, 7],
		[0, 4, 5, 7],
		[0, 4, 6, 7],
		[0, 2, 6, 7],
		[0, 2, 3, 7],
	]
	let volume = 0
	for (let i = 0; i < n; i += 1)
		for (let j = 0; j < n; j += 1)
			for (let k = 0; k < n; k += 1)
				for (const t of tets) {
					const p = t.map((c) => at(i + ((c >> 2) & 1), j + ((c >> 1) & 1), k + (c & 1)))
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
	return volume
}

let cachedVolume: number | null = null
function residualDensity(): number {
	if (cachedVolume === null) cachedVolume = gamutVolume(16)
	return 1 / cachedVolume
}

function densityTo(
	lab: Float64Array,
	k: number,
	tripleBar: Float64Array,
	target: readonly [number, number, number],
): { kernel: Float64Array; density: Float64Array } {
	const kernel = new Float64Array(k)
	const density = new Float64Array(k)
	const tb = barOf(target)
	const tInv = 1 / (TWO_PI_32 * tb * tb * tb)
	for (let r = 0; r < k; r += 1) {
		const dl = lab[r * 3] - target[0]
		const da = lab[r * 3 + 1] - target[1]
		const db = lab[r * 3 + 2] - target[2]
		const sq = dl * dl + da * da + db * db
		const larger = tripleBar[r] > tb
		const h = larger ? tripleBar[r] : tb
		const ratio = sq / (h * h)
		if (ratio >= TRUNC_SQ) continue
		const v = Math.exp(-0.5 * ratio)
		kernel[r] = v
		density[r] = v * (larger ? 1 / (TWO_PI_32 * tripleBar[r] ** 3) : tInv)
	}
	return { kernel, density }
}

/** `γ(t)` — the piecewise-linear OKLab path through the configuration's stops. */
function pathAt(config: Configuration, t: number): [number, number, number] {
	const pts = config.stops
		.map((s, i) => ({ p: s.position, lab: rgbToOkLab(s.rgb), i }))
		.sort((a, b) => (a.p === b.p ? a.i - b.i : a.p - b.p))
	const last = pts.length - 1
	if (t <= pts[0].p) return pts[0].lab as [number, number, number]
	if (t >= pts[last].p) return pts[last].lab as [number, number, number]
	let seg = 0
	while (seg < last && pts[seg + 1].p < t) seg += 1
	const from = pts[seg]
	const to = pts[seg + 1]
	const span = to.p - from.p
	if (span <= 0) return to.lab as [number, number, number]
	const f = (t - from.p) / span
	return [
		from.lab[0] + f * (to.lab[0] - from.lab[0]),
		from.lab[1] + f * (to.lab[1] - from.lab[1]),
		from.lab[2] + f * (to.lab[2] - from.lab[2]),
	]
}

export function armA(
	measurement: Measurement,
	config: Configuration,
	lambda = 1.0,
	/**
	 * `withSupport: false` rebuilds the **pre-0.2.0** arm A — colour coded *given* a free extent map,
	 * which is `DESIGN.md` decision 9's defect. Kept so the fix's before/after can be measured on one
	 * fixture by one implementation, rather than compared against numbers quoted from a report.
	 */
	options: { withSupport?: boolean } = {},
): ArmAResult {
	const withSupport = options.withSupport ?? true
	const { colorCount: K, counts, pixelCount, lab } = measurement.triples
	const rho0 = residualDensity()

	const massShare = new Float64Array(K)
	const tripleBar = new Float64Array(K)
	for (let r = 0; r < K; r += 1) {
		massShare[r] = pixelCount === 0 ? 0 : counts[r] / pixelCount
		tripleBar[r] = barOf([lab[r * 3], lab[r * 3 + 1], lab[r * 3 + 2]])
	}

	const escapedRole = config.escape === null ? null : config.escape.role
	const escapeRgb: Rgb8 | null =
		config.escape === null ? null : config.escape.color === "#ffffff" ? [255, 255, 255] : [0, 0, 0]
	const bgRgb = escapedRole === "background" ? (escapeRgb as Rgb8) : config.background
	const fgRgb = escapedRole === "foreground" ? (escapeRgb as Rgb8) : config.foreground

	const order = config.gradient ? "ramp" : config.surfaceCollapsed ? "flat" : "two-flat"
	const accentSeparate =
		!config.accentCollapsed &&
		!(
			config.accent[0] === fgRgb[0] &&
			config.accent[1] === fgRgb[1] &&
			config.accent[2] === fgRgb[2]
		)

	const bg = densityTo(lab, K, tripleBar, rgbToOkLab(bgRgb))
	const surf =
		order === "two-flat"
			? densityTo(lab, K, tripleBar, rgbToOkLab(config.surface))
			: { kernel: new Float64Array(K), density: new Float64Array(K) }
	const fg = densityTo(lab, K, tripleBar, rgbToOkLab(fgRgb))
	const acc = accentSeparate
		? densityTo(lab, K, tripleBar, rgbToOkLab(config.accent))
		: { kernel: new Float64Array(K), density: new Float64Array(K) }

	const wFg = accentSeparate ? 0.5 : 1
	const wAcc = 1 - wFg
	const inkModel = new Float64Array(K)
	for (let r = 0; r < K; r += 1) {
		inkModel[r] = accentSeparate ? wFg * fg.density[r] + wAcc * acc.density[r] : fg.density[r]
	}

	// --- ramp candidates: (geometry × direction), path density per triple ------------------------
	const geometries = ["linear", "radial", "conic"] as const
	const directions = ["forward", "reversed"] as const
	const rampCands: { geometry: string; direction: string; density: Float64Array }[] = []
	if (order === "ramp") {
		const lattice = measurement.joints.lattice
		for (const geom of geometries) {
			const joint = measurement.joints[geom]
			const offsets = new Int32Array(lattice.cellCount + 1)
			for (let e = 0; e < joint.entryCount; e += 1) offsets[joint.entryCell[e] + 1] += 1
			for (let c = 0; c < lattice.cellCount; c += 1) offsets[c + 1] += offsets[c]
			for (const dir of directions) {
				const binLab = new Float64Array(joint.binCount * 3)
				const binBar = new Float64Array(joint.binCount)
				for (let b = 0; b < joint.binCount; b += 1) {
					const centre = (joint.binEdges[b] + joint.binEdges[b + 1]) / 2
					const p = pathAt(config, dir === "forward" ? centre : 1 - centre)
					binLab[b * 3] = p[0]
					binLab[b * 3 + 1] = p[1]
					binLab[b * 3 + 2] = p[2]
					binBar[b] = barOf(p)
				}
				const density = new Float64Array(K)
				for (let r = 0; r < K; r += 1) {
					const cell = lattice.tripleCell[r]
					const from = offsets[cell]
					const to = offsets[cell + 1]
					const cellMass = lattice.cellMass[cell]
					const usable = to > from && cellMass > 0
					let acc2 = 0
					const one = (b: number, weight: number) => {
						const dl = lab[r * 3] - binLab[b * 3]
						const da = lab[r * 3 + 1] - binLab[b * 3 + 1]
						const db = lab[r * 3 + 2] - binLab[b * 3 + 2]
						const sq = dl * dl + da * da + db * db
						const larger = tripleBar[r] > binBar[b]
						const h = larger ? tripleBar[r] : binBar[b]
						const ratio = sq / (h * h)
						if (ratio >= TRUNC_SQ) return
						const inv = larger
							? 1 / (TWO_PI_32 * tripleBar[r] ** 3)
							: 1 / (TWO_PI_32 * binBar[b] ** 3)
						acc2 += weight * Math.exp(-0.5 * ratio) * inv
					}
					if (usable) {
						for (let e = from; e < to; e += 1) one(joint.entryBin[e], joint.entryMass[e] / cellMass)
					} else {
						for (let b = 0; b < joint.binCount; b += 1) {
							const w = pixelCount === 0 ? 0 : joint.binMass[b] / pixelCount
							if (w !== 0) one(b, w)
						}
					}
					density[r] = acc2
				}
				rampCands.push({ geometry: geom, direction: dir, density })
			}
		}
	}

	// --- the extent ladder and its rungs ---------------------------------------------------------
	const rungCount = measurement.constants.extentLadderScales
	const weightSum = measurement.extent.weightSum
	const tailFloor = 2 ** (1 - rungCount)
	const rungs = new Float64Array(K)
	for (let r = 0; r < K; r += 1) {
		const e = measurement.derived.meanExtent[r]
		const clamped = e < 0 ? 0 : e > weightSum ? weightSum : e
		const rung = 1 - Math.log2(clamped + tailFloor)
		rungs[r] = rung < 0 ? 0 : rung > rungCount ? rungCount : rung
	}

	let best: ArmAResult | null = null
	for (let s = 0; s <= rungCount; s += 1) {
		const pi = new Float64Array(K)
		const fieldMass = new Float64Array(K)
		let fieldFraction = 0
		for (let r = 0; r < K; r += 1) {
			pi[r] = 1 / (1 + Math.exp(rungs[r] - s))
			fieldMass[r] = pi[r] * massShare[r]
			fieldFraction += fieldMass[r]
		}
		// The extent half of the joint code. It depends on the split scale and the image's extents only,
		// so it is computed once per grid point and added to the conditional colour cost.
		const support = extentSupportNats(rungs, s, rungCount)
		if (!withSupport) support.nats.fill(0)
		let supportCost = 0
		for (let r = 0; r < K; r += 1) {
			if (massShare[r] === 0) continue
			supportCost += massShare[r] * support.nats[r]
		}
		const candidateCount = order === "ramp" ? rampCands.length : 1
		for (let cand = 0; cand < candidateCount; cand += 1) {
			let fieldDensity: Float64Array
			if (order === "ramp") fieldDensity = rampCands[cand].density
			else if (order === "flat") fieldDensity = bg.density
			else {
				let mb = 0
				let ms = 0
				for (let r = 0; r < K; r += 1) {
					mb += fieldMass[r] * bg.kernel[r]
					ms += fieldMass[r] * surf.kernel[r]
				}
				const totalMass = mb + ms
				const wb = totalMass > 0 ? mb / totalMass : 0.5
				const ws = 1 - wb
				fieldDensity = new Float64Array(K)
				for (let r = 0; r < K; r += 1) {
					fieldDensity[r] = wb * bg.density[r] + ws * surf.density[r]
				}
			}

			const combined = new Float64Array(K)
			for (let r = 0; r < K; r += 1) {
				combined[r] = pi[r] * fieldDensity[r] + (1 - pi[r]) * inkModel[r]
			}

			// EM for the residual weight, per `mixture.ts`.
			let totalWeight = 0
			for (let r = 0; r < K; r += 1) totalWeight += massShare[r]
			let eps = 0.5
			if (totalWeight > 0) {
				for (let pass = 0; pass < 64; pass += 1) {
					const modelShare = 1 - eps
					const residualPart = eps * rho0
					let resp = 0
					for (let r = 0; r < K; r += 1) {
						if (massShare[r] === 0) continue
						resp += massShare[r] * (residualPart / (modelShare * combined[r] + residualPart))
					}
					let next = resp / totalWeight
					if (next < 1e-9) next = 1e-9
					if (next > 1 - 1e-9) next = 1 - 1e-9
					const moved = Math.abs(next - eps)
					eps = next
					if (moved < 1e-10) break
				}
			} else eps = 1

			let cost = 0
			if (totalWeight > 0) {
				const modelShare = 1 - eps
				const residualPart = eps * rho0
				for (let r = 0; r < K; r += 1) {
					if (massShare[r] === 0) continue
					cost += massShare[r] * -Math.log(modelShare * combined[r] + residualPart)
				}
			}

			// ε is profiled on the conditional colour code alone — `m(ê)` has no ε in it, so it is an
			// additive constant in the log-likelihood the EM maximises. The profile then *selects* on the
			// joint cost, which is what makes a convenient split scale unaffordable.
			const jointCost = cost + supportCost

			if (best === null || jointCost < best.dataCost) {
				// attribute the data cost to the two populations, exactly as `attributeCost` does
				const modelShare = 1 - eps
				const residualPart = eps * rho0
				let fieldCost = 0
				let inkCost = 0
				for (let r = 0; r < K; r += 1) {
					if (massShare[r] === 0) continue
					const fp = pi[r] * (modelShare * fieldDensity[r] + residualPart)
					const ip = (1 - pi[r]) * (modelShare * inkModel[r] + residualPart)
					const tot = fp + ip
					// The joint's per-triple cost: `−log ρ(c|ê) + (−log m(ê))`. `m(ê)` is a common factor of
					// both populations' contributions, so it does not move the ratio — it enlarges the cost
					// that ratio then splits, which is how a broad triple called ink pays inside `terms.ink`.
					const c = massShare[r] * (-Math.log(tot) + support.nats[r])
					fieldCost += c * (fp / tot)
					inkCost += c * (1 - fp / tot)
				}
				best = {
					total: 0,
					field: fieldCost,
					ink: inkCost,
					structural: 0,
					escape: 0,
					omega: 0,
					fieldOrder: order,
					splitScaleRung: s,
					geometry: order === "ramp" ? rampCands[cand].geometry : "none",
					direction: order === "ramp" ? rampCands[cand].direction : "none",
					residualWeight: eps,
					gamutVolume: cachedVolume as number,
					dataCost: jointCost,
					supportCost,
					fieldPrior: support.fieldPrior,
					fieldMassFraction: fieldFraction,
				}
			}
		}
	}

	const b = best as ArmAResult
	const interior = config.gradient ? Math.max(0, config.stops.length - 2) : 0
	const omega =
		(config.surfaceCollapsed ? 0 : 1) + (config.gradient ? 1 : 0) + interior +
		(config.accentCollapsed ? 0 : 1)
	b.omega = omega
	b.structural = lambda * omega
	b.escape = config.escape === null ? 0 : 1024 * Math.LN2
	b.total = b.field + b.ink + b.structural + b.escape
	return b
}

// ============================================================================================
// ARM A′
// ============================================================================================

export type ArmAPrimeResult = {
	total: number
	fieldColorBits: number
	fieldSupportBits: number
	inkColorBits: number
	inkSupportBits: number
	genericBits: number
	paletteBits: number
	serializationBits: number
	likelihoodBits: number
	fieldModel: string
	rampGeometry: string
	rampOrientation: string
	fieldTriples: number
	inkTriples: number
	genericTriples: number
}

/** L(P), rebuilt from `cost.ts`'s stated partition. */
export function serializationBits(config: Configuration): number {
	const escaped = config.escape === null ? null : config.escape.role
	let roles = 0
	if (escaped !== "background") roles += 24
	if (escaped !== "foreground") roles += 24
	if (!config.surfaceCollapsed) roles += 24
	if (!config.accentCollapsed) roles += 24
	const interior = config.gradient ? Math.max(0, config.stops.length - 2) : 0
	return (
		roles + 2 + 1 + (config.gradient ? 2 : 0) + interior * (24 + 8) +
		(config.escape === null ? 0 : 1024)
	)
}

function h2(p: number): number {
	if (p <= 0 || p >= 1) return 0
	return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p)
}

function namedCode(
	lab: Float64Array,
	K: number,
	tripleBar: Float64Array,
	target: readonly [number, number, number],
): Float64Array {
	const u = new Float64Array(K)
	const tb = barOf(target)
	for (let r = 0; r < K; r += 1) {
		const dl = lab[r * 3] - target[0]
		const da = lab[r * 3 + 1] - target[1]
		const db = lab[r * 3 + 2] - target[2]
		const h = tripleBar[r] > tb ? tripleBar[r] : tb
		u[r] = (dl * dl + da * da + db * db) / (h * h)
	}
	let smallest = K === 0 ? 0 : u[0]
	for (let r = 1; r < K; r += 1) if (u[r] < smallest) smallest = u[r]
	let sum = 0
	for (let r = 0; r < K; r += 1) sum += Math.exp(-0.5 * (u[r] - smallest))
	const log2Z = K === 0 ? 0 : -0.5 * smallest * Math.LOG2E + Math.log2(sum)
	const out = new Float64Array(K)
	for (let r = 0; r < K; r += 1) out[r] = 0.5 * u[r] * Math.LOG2E + log2Z
	return out
}

export function armAPrime(
	measurement: Measurement,
	config: Configuration,
	lambda = 1.0,
): ArmAPrimeResult {
	const { colorCount: K, counts, lab, pixelCount } = measurement.triples
	const { covXX, covXY, covYY } = measurement.derived
	const shortEdge = measurement.source.shortEdge

	// --- support codes ---------------------------------------------------------------------------
	const pixelArea = 1 / (shortEdge * shortEdge)
	const imageArea = measurement.source.width * measurement.source.height * pixelArea
	const reg = pixelArea / 12
	const chainStart = pixelCount > 0 ? Math.log2(pixelCount) : 0
	const coarse = new Float64Array(K)
	const chain = new Float64Array(K)
	for (let r = 0; r < K; r += 1) {
		const xx = covXX[r] + reg
		const yy = covYY[r] + reg
		const xy = covXY[r]
		const det = Math.max(0, xx * yy - xy * xy)
		const foot = Math.max(4 * Math.PI * Math.sqrt(det), pixelArea)
		const fill = foot > 0 ? Math.min(1, (counts[r] * pixelArea) / foot) : 1
		const locate = Math.max(0, Math.log2(imageArea / foot))
		const n = counts[r] > 0 ? counts[r] : 1
		coarse[r] = locate / n + h2(fill) / fill
		chain[r] = chainStart / n + 3
	}

	// --- generic code ----------------------------------------------------------------------------
	const smoothed = measurement.smoothedMass.mass
	let smoothedTotal = 0
	for (let r = 0; r < K; r += 1) smoothedTotal += smoothed[r]
	const generic = new Float64Array(K)
	for (let r = 0; r < K; r += 1) {
		generic[r] =
			smoothed[r] > 0 ? Math.log2(smoothedTotal) - Math.log2(smoothed[r]) : Number.POSITIVE_INFINITY
	}

	const tripleBar = new Float64Array(K)
	for (let r = 0; r < K; r += 1) {
		tripleBar[r] = barOf([lab[r * 3], lab[r * 3 + 1], lab[r * 3 + 2]])
	}

	const roleColor = (role: "background" | "surface" | "foreground" | "accent"): Rgb8 => {
		if (config.escape !== null && config.escape.role === role) {
			return config.escape.color === "#ffffff" ? [255, 255, 255] : [0, 0, 0]
		}
		return config[role]
	}

	// --- ink code --------------------------------------------------------------------------------
	const ink = namedCode(lab, K, tripleBar, rgbToOkLab(roleColor("foreground")))
	if (!config.accentCollapsed) {
		const a = namedCode(lab, K, tripleBar, rgbToOkLab(roleColor("accent")))
		for (let r = 0; r < K; r += 1) if (a[r] < ink[r]) ink[r] = a[r]
	}

	const assemble = (fieldCost: Float64Array) => {
		let fcb = 0
		let fsb = 0
		let icb = 0
		let isb = 0
		let gb = 0
		let ft = 0
		let it = 0
		let gt = 0
		for (let r = 0; r < K; r += 1) {
			const n = counts[r]
			if (n <= 0) continue
			const f = fieldCost[r] + coarse[r]
			const i = ink[r] + chain[r]
			const g = generic[r]
			if (f <= i && f <= g) {
				fcb += n * fieldCost[r]
				fsb += n * coarse[r]
				ft += 1
			} else if (i <= g) {
				icb += n * ink[r]
				isb += n * chain[r]
				it += 1
			} else {
				gb += n * g
				gt += 1
			}
		}
		return {
			fcb, fsb, icb, isb, gb, ft, it, gt,
			likelihood: fcb + fsb + icb + isb + gb,
		}
	}

	const usesRamp = config.gradient && config.stops.length >= 1
	let fieldModel = config.gradient ? "ramp" : config.surfaceCollapsed ? "flat" : "flat-two"
	let best: ReturnType<typeof assemble> | null = null
	let bestGeom = "none"
	let bestOrient = "none"

	if (usesRamp) {
		const lattice = measurement.joints.lattice
		for (const geom of ["linear", "radial", "conic"] as const) {
			const joint = measurement.joints[geom]
			const start = new Int32Array(lattice.cellCount + 1)
			for (let e = 0; e < joint.entryCount; e += 1) start[joint.entryCell[e] + 1] += 1
			for (let c = 0; c < lattice.cellCount; c += 1) start[c + 1] += start[c]
			for (const orient of ["forward", "reverse"] as const) {
				const bins = joint.binCount
				const binLab = new Float64Array(bins * 3)
				const binBar = new Float64Array(bins)
				const log2Z = new Float64Array(bins)
				for (let b = 0; b < bins; b += 1) {
					const mid = 0.5 * (joint.binEdges[b] + joint.binEdges[b + 1])
					const p = pathAt(config, orient === "reverse" ? 1 - mid : mid)
					binLab[b * 3] = p[0]
					binLab[b * 3 + 1] = p[1]
					binLab[b * 3 + 2] = p[2]
					binBar[b] = barOf(p)
					const u = new Float64Array(K)
					for (let r = 0; r < K; r += 1) {
						const dl = lab[r * 3] - p[0]
						const da = lab[r * 3 + 1] - p[1]
						const db = lab[r * 3 + 2] - p[2]
						const h = tripleBar[r] > binBar[b] ? tripleBar[r] : binBar[b]
						u[r] = (dl * dl + da * da + db * db) / (h * h)
					}
					let smallest = K === 0 ? 0 : u[0]
					for (let r = 1; r < K; r += 1) if (u[r] < smallest) smallest = u[r]
					let sum = 0
					for (let r = 0; r < K; r += 1) sum += Math.exp(-0.5 * (u[r] - smallest))
					log2Z[b] = K === 0 ? 0 : -0.5 * smallest * Math.LOG2E + Math.log2(sum)
				}
				const rampCost = new Float64Array(K)
				for (let r = 0; r < K; r += 1) {
					const cell = lattice.tripleCell[r]
					const from = start[cell]
					const to = start[cell + 1]
					const cellMass = lattice.cellMass[cell]
					if (to <= from || cellMass <= 0) {
						rampCost[r] = Number.POSITIVE_INFINITY
						continue
					}
					let total = 0
					for (let e = from; e < to; e += 1) {
						const b = joint.entryBin[e]
						const w = joint.entryMass[e] / cellMass
						if (w <= 0) continue
						const dl = lab[r * 3] - binLab[b * 3]
						const da = lab[r * 3 + 1] - binLab[b * 3 + 1]
						const db = lab[r * 3 + 2] - binLab[b * 3 + 2]
						const h = tripleBar[r] > binBar[b] ? tripleBar[r] : binBar[b]
						const sq = (dl * dl + da * da + db * db) / (h * h)
						total += w * (0.5 * sq * Math.LOG2E + log2Z[b])
					}
					rampCost[r] = total
				}
				const cand = assemble(rampCost)
				if (best === null || cand.likelihood < best.likelihood) {
					best = cand
					bestGeom = geom
					bestOrient = orient
				}
			}
		}
	} else {
		if (config.gradient) fieldModel = "ramp-without-stops"
		const flat = namedCode(lab, K, tripleBar, rgbToOkLab(roleColor("background")))
		if (!config.surfaceCollapsed) {
			const s = namedCode(lab, K, tripleBar, rgbToOkLab(roleColor("surface")))
			for (let r = 0; r < K; r += 1) if (s[r] < flat[r]) flat[r] = s[r]
		}
		best = assemble(flat)
	}

	const a = best as ReturnType<typeof assemble>
	const bits = serializationBits(config)
	const paletteBits = lambda * bits
	return {
		total: a.likelihood + paletteBits,
		fieldColorBits: a.fcb,
		fieldSupportBits: a.fsb,
		inkColorBits: a.icb,
		inkSupportBits: a.isb,
		genericBits: a.gb,
		paletteBits,
		serializationBits: bits,
		likelihoodBits: a.likelihood,
		fieldModel,
		rampGeometry: bestGeom,
		rampOrientation: bestOrient,
		fieldTriples: a.ft,
		inkTriples: a.it,
		genericTriples: a.gt,
	}
}
