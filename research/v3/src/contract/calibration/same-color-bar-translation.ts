/**
 * Reproduces the translation that produced the same-colour bar's **superseded prior**.
 *
 * **Status: historical.** Reviewer bracketing rounds 1 and 2 (2026-08-02/03) measured the bar
 * directly, per region, and refuted a single threshold twice over — see `SAME_COLOR_BAR_BY_REGION`
 * in `constants.ts`. This
 * script is kept because its finding still stands and still matters: the translation from v2-3's
 * CIE76 bar into OKLab has no single answer, which is why a translated prior could never have
 * substituted for asking the reviewer. It is the argument for the round having been necessary.
 *
 * The question: v2-3's same-colour bar was CIE76 ΔE 3.3 (`research/v2-3/src/internal/policy.ts:109`,
 * measured by `perceptualDifference`, a Euclidean distance in **D65** CIELab). v3 moves the ruler to
 * Euclidean OKLab (`PHASE_0_DECISIONS.md` §3). What OKLab distance corresponds to ΔE 3.3?
 *
 * The answer is **protocol-dependent**, and that is the finding. There is no single OKLab distance
 * that means ΔE 3.3; there is a distribution, and its median moves by a factor of two depending on
 * how the sampled colour pairs are generated. A translated prior therefore cannot substitute for the
 * reviewer's bracketing round — it can only say roughly where to start looking.
 *
 * Run:
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/src/contract/calibration/same-color-bar-translation.ts
 *
 * Deterministic: every scheme uses a seeded PRNG, so the printed table is reproducible byte for
 * byte. Cheap enough to interrupt at any point.
 */

import { okLabDistance, rgbToOkLab } from "../color.ts"
import { POOLED_SAME_COLOR_BAR, SAME_COLOR_BAR_BY_REGION } from "../constants.ts"
import type { Rgb8 } from "../types.ts"

// ---------------------------------------------------------------------------------------------
// CIE76 in D65 CIELab, matching v2-3's `perceptualDifference` exactly.
// ---------------------------------------------------------------------------------------------

/** D65 white point, as v2-3's `CIELAB_WHITE_POINT`. Not D50 — `colorjs.io`'s `lab` space is D50 and
 *  would answer a different question. */
const D65_WHITE_POINT = [0.95047, 1, 1.08883] as const

function srgbToLinear(channel: number): number {
	const value = channel / 255
	return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function cielabTransfer(ratio: number): number {
	return ratio > 216 / 24389 ? Math.cbrt(ratio) : (841 / 108) * ratio + 4 / 29
}

function rgbToCieLab(rgb: readonly number[]): [number, number, number] {
	const r = srgbToLinear(rgb[0])
	const g = srgbToLinear(rgb[1])
	const b = srgbToLinear(rgb[2])
	const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / D65_WHITE_POINT[0]
	const y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b) / D65_WHITE_POINT[1]
	const z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / D65_WHITE_POINT[2]
	const fx = cielabTransfer(x)
	const fy = cielabTransfer(y)
	const fz = cielabTransfer(z)
	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/**
 * Byte-identical to v2-3's `perceptualDifference` (`research/v2-3/src/internal/color.ts:105`):
 * maximum absolute difference 0 over 5,000 pairs. Reimplemented rather than imported so that this
 * calibration does not couple v3 to v2-3 source; `contract-color.test.ts` pins the white point with
 * blue-against-black, which reads 137.6502 under D65 and 134.4920 under D50.
 */
export function cie76(first: readonly number[], second: readonly number[]): number {
	const a = rgbToCieLab(first)
	const b = rgbToCieLab(second)
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function okDistance(first: readonly number[], second: readonly number[]): number {
	return okLabDistance(rgbToOkLab(first as unknown as Rgb8), rgbToOkLab(second as unknown as Rgb8))
}

// ---------------------------------------------------------------------------------------------
// Seeded PRNG (mulberry32), so the table is reproducible.
// ---------------------------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
	let state = seed | 0
	return () => {
		state = (state + 0x6D2B79F5) | 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/** v2-3's bar, the quantity being translated. */
export const V2_3_SAME_COLOR_DELTA_E = 3.3

/** Half-width of the acceptance window around ΔE 3.3. */
export const ACCEPTANCE_HALF_WIDTH = 0.15

function quantile(sorted: readonly number[], p: number): number {
	return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
}

export type TranslationSummary = Readonly<{
	n: number
	median: number
	p05: number
	p95: number
}>

function summarize(values: number[]): TranslationSummary {
	const sorted = [...values].sort((a, b) => a - b)
	return {
		n: sorted.length,
		median: quantile(sorted, 0.5),
		p05: quantile(sorted, 0.05),
		p95: quantile(sorted, 0.95),
	}
}

// ---------------------------------------------------------------------------------------------
// Scheme A — 8-bit local offset. One free knob: the offset radius.
// ---------------------------------------------------------------------------------------------

/**
 * Draw a base colour uniformly over the 8-bit sRGB cube, perturb each channel by a uniform integer
 * offset in [-radius, +radius], clamp, and keep the pair when its ΔE lands in the acceptance window.
 *
 * The radius is a free parameter and the result depends strongly on it — which is the reason this
 * scheme is reported but not used as the answer.
 */
export function schemeLocalOffset(radius: number, want: number, seed: number): TranslationSummary {
	const random = mulberry32(seed)
	const distances: number[] = []
	let tries = 0
	while (distances.length < want && tries < 40_000_000) {
		tries++
		const a = [0, 0, 0].map(() => Math.floor(random() * 256))
		const b = a.map((channel) =>
			Math.max(0, Math.min(255, channel + Math.round((random() * 2 - 1) * radius)))
		)
		if (Math.abs(cie76(a, b) - V2_3_SAME_COLOR_DELTA_E) > ACCEPTANCE_HALF_WIDTH) continue
		distances.push(okDistance(a, b))
	}
	return summarize(distances)
}

// ---------------------------------------------------------------------------------------------
// Scheme B — exact-ΔE ray. No free knob.
// ---------------------------------------------------------------------------------------------

/**
 * Draw a base colour uniformly over the *continuous* sRGB cube and a uniformly random direction,
 * then bisect along that ray for the point at exactly ΔE 3.3. Pairs leaving the cube are discarded.
 *
 * This is the defensible scheme: the step length is determined by the ΔE constraint rather than
 * chosen, so there is no knob to tune the answer with. It is what the recorded value should be read
 * against.
 */
export function schemeExactDeltaERay(want: number, seed: number): TranslationSummary {
	const random = mulberry32(seed)
	const distances: number[] = []
	let tries = 0
	while (distances.length < want && tries < 40_000_000) {
		tries++
		const a = [random() * 255, random() * 255, random() * 255]
		const raw = [random() * 2 - 1, random() * 2 - 1, random() * 2 - 1]
		const norm = Math.hypot(raw[0], raw[1], raw[2])
		if (norm === 0) continue
		const direction = raw.map((component) => component / norm)

		let low = 0
		let high = 60
		for (let step = 0; step < 60; step++) {
			const mid = (low + high) / 2
			const candidate = a.map((channel, axis) => channel + direction[axis] * mid)
			if (candidate.some((channel) => channel < 0 || channel > 255)) {
				high = mid
				continue
			}
			if (cie76(a, candidate) < V2_3_SAME_COLOR_DELTA_E) low = mid
			else high = mid
		}
		const b = a.map((channel, axis) => channel + direction[axis] * low)
		if (b.some((channel) => channel < 0 || channel > 255)) continue
		if (Math.abs(cie76(a, b) - V2_3_SAME_COLOR_DELTA_E) > ACCEPTANCE_HALF_WIDTH) continue
		distances.push(okDistance(a, b))
	}
	return summarize(distances)
}

/** Split the exact-ΔE ray sample by lightness and chroma quadrant. */
export function schemeExactDeltaERayByQuadrant(
	want: number,
	seed: number,
): Record<string, TranslationSummary> {
	const random = mulberry32(seed)
	const buckets: Record<string, number[]> = {}
	let collected = 0
	let tries = 0
	while (collected < want && tries < 40_000_000) {
		tries++
		const a = [random() * 255, random() * 255, random() * 255]
		const raw = [random() * 2 - 1, random() * 2 - 1, random() * 2 - 1]
		const norm = Math.hypot(raw[0], raw[1], raw[2])
		if (norm === 0) continue
		const direction = raw.map((component) => component / norm)
		let low = 0
		let high = 60
		for (let step = 0; step < 60; step++) {
			const mid = (low + high) / 2
			const candidate = a.map((channel, axis) => channel + direction[axis] * mid)
			if (candidate.some((channel) => channel < 0 || channel > 255)) {
				high = mid
				continue
			}
			if (cie76(a, candidate) < V2_3_SAME_COLOR_DELTA_E) low = mid
			else high = mid
		}
		const b = a.map((channel, axis) => channel + direction[axis] * low)
		if (b.some((channel) => channel < 0 || channel > 255)) continue
		if (Math.abs(cie76(a, b) - V2_3_SAME_COLOR_DELTA_E) > ACCEPTANCE_HALF_WIDTH) continue

		const labA = rgbToCieLab(a)
		const labB = rgbToCieLab(b)
		const lightness = (labA[0] + labB[0]) / 2
		const chroma = (Math.hypot(labA[1], labA[2]) + Math.hypot(labB[1], labB[2])) / 2
		const key = `${lightness < 50 ? "dark" : "light"}/${chroma < 20 ? "neutral" : "saturated"}`
		;(buckets[key] ??= []).push(okDistance(a, b))
		collected++
	}
	return Object.fromEntries(Object.entries(buckets).map(([key, values]) => [key, summarize(values)]))
}

// ---------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------

function line(label: string, summary: TranslationSummary): string {
	return `${label.padEnd(28)} n=${String(summary.n).padStart(6)}  median=${summary.median.toFixed(5)}` +
		`  p05=${summary.p05.toFixed(5)}  p95=${summary.p95.toFixed(5)}`
}

function main(): void {
	console.log(`Translating v2-3's CIE76 ΔE ${V2_3_SAME_COLOR_DELTA_E} (D65 CIELab) into Euclidean OKLab.`)
	console.log(`Acceptance window: ΔE ${V2_3_SAME_COLOR_DELTA_E} ± ${ACCEPTANCE_HALF_WIDTH}\n`)

	console.log("Scheme A — 8-bit local offset, swept over its free radius knob:")
	for (const radius of [3, 4, 6, 8, 10, 12, 16, 24, 48]) {
		console.log(`  ${line(`radius ±${radius}`, schemeLocalOffset(radius, 30_000, 1000 + radius))}`)
	}

	console.log("\nScheme B — exact-ΔE ray, no free knob:")
	console.log(`  ${line("all pairs", schemeExactDeltaERay(30_000, 555))}`)
	const quadrants = schemeExactDeltaERayByQuadrant(30_000, 556)
	for (const key of Object.keys(quadrants).sort()) {
		console.log(`  ${line(`  ${key}`, quadrants[key])}`)
	}

	console.log(`\nSuperseded prior was 0.012 (the exact-\u0394E ray median, rounded).`)
	console.log(`Measured bars, reviewer bracketing rounds 1+2 pooled:`)
	for (const [region, bar] of Object.entries(SAME_COLOR_BAR_BY_REGION)) {
		console.log(`  ${region.padEnd(16)} ${bar}`)
	}
	console.log(`  ${"pooled (reference)".padEnd(16)} ${POOLED_SAME_COLOR_BAR}`)
}

if (import.meta.filename === process.argv[1]) main()
