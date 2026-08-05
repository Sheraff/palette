/**
 * VERIFIER — check 5: do the two energies agree on the ORDERINGS of the eight synthetic cases the
 * two workers' suites use? They are different currencies (nats per unit image mass vs bits), so only
 * the ranking is comparable — but the mechanism predicts the same winners on cases this unambiguous.
 *
 * Since A′ 0.2.0 each disagreement is also **placed and classified**, because a raw count moves for
 * two very different reasons and the number alone cannot say which:
 *
 * - **provenance** — every case is additionally scored by `recompute.ts`'s arm A′ with the *0.1.0*
 *   residual switched back on (`generic: "smoothed-mass"`). A disagreement present in that column
 *   pre-dates the chromatic residual; one absent from it arrived with the residual.
 * - **currency-difference vs defect-candidate** — if A′ separates the entries and merely ranks them
 *   differently from A, the two energies have an opinion each and the gap is a currency difference.
 *   If A′'s totals are **bit-identical**, A′ has *no* opinion and the reported "ordering" is the
 *   sort's stable input order; that is not a currency difference and is reported as a defect
 *   candidate against A′, with the tie's size printed so the reader is not taking it on trust.
 */

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { okLabToRgb, rgbToOkLab } from "../../../../src/contract/color.ts"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import type { Configuration, ConfigurationStop } from "../../src/emit/types.ts"
import { measureImage } from "../../src/measure/index.ts"
import { energyOfA } from "../../src/energy/a/index.ts"
import { energyOfAPrime } from "../../src/energy/aprime/index.ts"
import { armAPrime, chromaticResidualBits } from "./recompute.ts"

let dir = ""

async function write(
	name: string,
	w: number,
	h: number,
	paint: (x: number, y: number) => Rgb8,
): Promise<string> {
	const raw = Buffer.alloc(w * h * 3)
	let off = 0
	for (let y = 0; y < h; y += 1) {
		for (let x = 0; x < w; x += 1, off += 3) {
			const c = paint(x, y)
			raw[off] = c[0]
			raw[off + 1] = c[1]
			raw[off + 2] = c[2]
		}
	}
	const path = join(dir, name)
	await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
		.png({ compressionLevel: 0 })
		.toFile(path)
	return path
}

function config(spec: {
	background: Rgb8
	surface?: Rgb8
	foreground: Rgb8
	accent?: Rgb8
	gradient?: boolean
	stops?: readonly ConfigurationStop[]
}): Configuration {
	return {
		background: spec.background,
		surface: spec.surface ?? spec.background,
		foreground: spec.foreground,
		accent: spec.accent ?? spec.foreground,
		gradient: spec.gradient ?? false,
		stops: spec.stops ?? [],
		surfaceCollapsed: spec.surface === undefined,
		accentCollapsed: spec.accent === undefined,
		escape: null,
	}
}

function rampTriple(from: Rgb8, to: Rgb8, t: number): Rgb8 {
	const s = rgbToOkLab(from)
	const e = rgbToOkLab(to)
	return okLabToRgb([s[0] + t * (e[0] - s[0]), s[1] + t * (e[1] - s[1]), s[2] + t * (e[2] - s[2])])
}

type Case = { name: string; path: string; entries: [string, Configuration][] }

let disagreements = 0
let disagreementsAt010 = 0
const verdicts: string[] = []

function report(c: Case, measurementCache: Map<string, unknown>): Promise<void> {
	return (async () => {
		const m = await measureImage(c.path)
		measurementCache.set(c.path, m)
		const rows = c.entries.map(([label, cfg]) => ({
			label,
			a: energyOfA(m, cfg).total,
			p: energyOfAPrime(m, cfg).total,
			// The independent reimplementation, so the 0.2.0 column can be checked rather than trusted,
			// and the 0.1.0 column can exist at all.
			mine: armAPrime(m, cfg).total,
			old: armAPrime(m, cfg, 1, { generic: "smoothed-mass" }).total,
		}))
		const order = (key: "a" | "p" | "old") =>
			[...rows].sort((l, r) => l[key] - r[key]).map((r) => r.label).join(" < ")
		const byA = order("a")
		const byP = order("p")
		const byOld = order("old")
		const same = byA === byP
		const sameAt010 = byA === byOld
		if (!same) disagreements += 1
		if (!sameAt010) disagreementsAt010 += 1

		// The tie test. A′ is a bit count, not an ordering, so two configurations it prices identically
		// carry no ranking at all — `sort` is stable and hands back the input order, which is an artefact
		// of the fixture's array literal and not a verdict.
		const distinct = new Set(rows.map((r) => r.p)).size
		const tied = distinct < rows.length
		const exact = rows.every((r) => r.p === r.mine)

		console.log(`\n### ${c.name}  ${same ? "AGREE" : "DISAGREE"}`)
		for (const r of rows) {
			console.log(
				`   ${r.label.padEnd(26)} A ${r.a.toFixed(6).padStart(14)} nats   A' ${r.p.toFixed(3).padStart(12)} bits` +
					`   (0.1.0 residual ${r.old.toFixed(3).padStart(12)})`,
			)
		}
		console.log(`   arm A  order: ${byA}`)
		console.log(`   arm A' order: ${byP}`)
		console.log(
			`   recomputed independently, bit-exactly on every row: ${exact}` +
				`${tied ? `   — A′ TIES ${rows.length - distinct + 1} entries bit-for-bit` : ""}`,
		)
		if (!same) {
			const provenance = sameAt010 ? "NEW at A′ 0.2.0" : "PRE-EXISTING (also at A′ 0.1.0)"
			const kind = tied
				? "DEFECT-CANDIDATE — A′ has no opinion; the order shown is the sort's input order"
				: "CURRENCY-DIFFERENCE — both energies separate the entries and rank them differently"
			console.log(`   provenance: ${provenance};  ${kind}`)
			verdicts.push(`${c.name}\n      ${provenance};  ${kind}`)
			if (tied) {
				const residual = chromaticResidualBits(m)
				console.log(
					`   why the tie: Ω = ${residual.occupiedCells}, log₂Σρ = ${residual.log2Normaliser.toFixed(6)} bits —` +
						` under the ink code's 3-bit chain charge, so no colour in this image can repay a name and` +
						` every configuration of the same length prices identically.`,
				)
			}
		}
	})()
}

dir = await mkdtemp(join(tmpdir(), "p1-cross-"))
const cache = new Map<string, unknown>()
try {
	// ---------------------------------------------------------------- arm A's four fixtures
	const DULL_FIELD: Rgb8 = [64, 66, 72]
	const DULL_SECOND: Rgb8 = [150, 148, 140]
	const VIVID: Rgb8 = [225, 45, 35]
	const INK: Rgb8 = [242, 242, 238]
	const BAND_LEFT: Rgb8 = [58, 62, 92]
	const BAND_RIGHT: Rgb8 = [198, 152, 78]
	const RAMP_START: Rgb8 = [22, 26, 62]
	const RAMP_END: Rgb8 = [228, 178, 62]
	const STROKES = new Set([13, 47])

	await report(
		{
			name: "A-suite (a) flat 64x64 — collapsed should beat four-colour",
			path: await write("a-flat.png", 64, 64, (x, y) => {
				if (x < 2 && y < 2) return DULL_SECOND
				if (x < 2 && y >= 2 && y < 4) return VIVID
				if (x < 2 && y >= 4 && y < 6) return INK
				return DULL_FIELD
			}),
			entries: [
				["collapsed", config({ background: DULL_FIELD, foreground: INK })],
				[
					"four-colour",
					config({ background: DULL_FIELD, surface: DULL_SECOND, foreground: INK, accent: VIVID }),
				],
			],
		},
		cache,
	)

	await report(
		{
			name: "A-suite (b) two-band 64x64 — two-flat should beat flat and ramp",
			path: await write("a-band.png", 64, 64, (x) =>
				STROKES.has(x) ? INK : x < 32 ? BAND_LEFT : BAND_RIGHT,
			),
			entries: [
				["flat", config({ background: BAND_LEFT, foreground: INK })],
				["two-flat", config({ background: BAND_LEFT, surface: BAND_RIGHT, foreground: INK })],
				[
					"ramp",
					config({
						background: BAND_LEFT,
						surface: BAND_RIGHT,
						foreground: INK,
						gradient: true,
						stops: [
							{ rgb: BAND_LEFT, position: 0 },
							{ rgb: BAND_RIGHT, position: 1 },
						],
					}),
				],
			],
		},
		cache,
	)

	await report(
		{
			name: "A-suite (c) rendered ramp 64x64 — ramp should beat flat",
			path: await write("a-ramp.png", 64, 64, (x) =>
				STROKES.has(x) ? INK : rampTriple(RAMP_START, RAMP_END, x / 63),
			),
			entries: [
				["flat", config({ background: RAMP_START, foreground: INK })],
				[
					"ramp",
					config({
						background: RAMP_START,
						surface: RAMP_END,
						foreground: INK,
						gradient: true,
						stops: [
							{ rgb: RAMP_START, position: 0 },
							{ rgb: RAMP_END, position: 1 },
						],
					}),
				],
			],
		},
		cache,
	)

	await report(
		{
			name: "A-suite (d) vivid accent 96x96 — vivid accent should beat dull accent",
			path: await write("a-vivid.png", 96, 96, (x, y) => {
				if (STROKES.has(x)) return INK
				if (x >= 12 && x < 20 && y >= 12 && y < 20) return VIVID
				return x < 48 ? DULL_FIELD : DULL_SECOND
			}),
			entries: [
				[
					"accent=vivid",
					config({ background: DULL_FIELD, surface: DULL_SECOND, foreground: INK, accent: VIVID }),
				],
				[
					"accent=dull",
					config({
						background: DULL_FIELD,
						surface: DULL_SECOND,
						foreground: INK,
						accent: DULL_SECOND,
					}),
				],
			],
		},
		cache,
	)

	// ---------------------------------------------------------------- arm A′'s four fixtures
	const only: Rgb8 = [40, 60, 90]
	const unused: Rgb8 = [200, 100, 50]
	await report(
		{
			name: "A'-suite (a) one-colour 64x64 — collapsed < two-flat < ramp < four-roles",
			path: await write("p-flat.png", 64, 64, () => only),
			entries: [
				["collapsed", config({ background: only, foreground: only })],
				["two-flat", config({ background: only, surface: unused, foreground: only })],
				[
					"ramp",
					config({
						background: only,
						surface: unused,
						foreground: only,
						gradient: true,
						stops: [
							{ rgb: only, position: 0 },
							{ rgb: unused, position: 1 },
						],
					}),
				],
				["four-roles", config({ background: only, surface: unused, foreground: only, accent: unused })],
			],
		},
		cache,
	)

	const top: Rgb8 = [20, 22, 30]
	const bottom: Rgb8 = [230, 228, 220]
	await report(
		{
			name: "A'-suite (b) two-band 64x64 — two-flat should beat flat and ramp",
			path: await write("p-band.png", 64, 64, (_x, y) => (y < 32 ? top : bottom)),
			entries: [
				["flat", config({ background: top, foreground: bottom })],
				["two-flat", config({ background: top, surface: bottom, foreground: bottom })],
				[
					"ramp",
					config({
						background: top,
						surface: bottom,
						foreground: bottom,
						gradient: true,
						stops: [
							{ rgb: top, position: 0 },
							{ rgb: bottom, position: 1 },
						],
					}),
				],
			],
		},
		cache,
	)

	const from: Rgb8 = [20, 25, 60]
	const to: Rgb8 = [240, 200, 120]
	const column = (x: number): Rgb8 => [
		Math.round(from[0] + ((to[0] - from[0]) * x) / 63),
		Math.round(from[1] + ((to[1] - from[1]) * x) / 63),
		Math.round(from[2] + ((to[2] - from[2]) * x) / 63),
	]
	await report(
		{
			name: "A'-suite (c) linear ramp 64x64 — ramp+mid < ramp < two-flat < flat",
			path: await write("p-ramp.png", 64, 64, (x) => column(x)),
			entries: [
				["flat", config({ background: column(0), foreground: column(63) })],
				["two-flat", config({ background: column(0), surface: column(63), foreground: column(63) })],
				[
					"ramp",
					config({
						background: column(0),
						surface: column(63),
						foreground: column(63),
						gradient: true,
						stops: [
							{ rgb: column(0), position: 0 },
							{ rgb: column(63), position: 1 },
						],
					}),
				],
				[
					"ramp+mid@0.5",
					config({
						background: column(0),
						surface: column(63),
						foreground: column(63),
						gradient: true,
						stops: [
							{ rgb: column(0), position: 0 },
							{ rgb: column(32), position: 0.5 },
							{ rgb: column(63), position: 1 },
						],
					}),
				],
			],
		},
		cache,
	)

	const NG_FIELD: Rgb8 = [70, 75, 85]
	const NG_DULL: Rgb8 = [74, 79, 89]
	const NG_VIVID: Rgb8 = [220, 30, 40]
	await report(
		{
			name: "A'-suite (d) naming gain 64x64 — foreground=vivid should beat foreground=dull",
			path: await write("p-naming.png", 64, 64, (x, y) => {
				if (y < 16 && x < 38) return NG_DULL
				if (y >= 40 && y < 49 && x >= 40 && x < 49) return NG_VIVID
				return NG_FIELD
			}),
			entries: [
				["fg=dull", config({ background: NG_FIELD, foreground: NG_DULL })],
				["fg=vivid", config({ background: NG_FIELD, foreground: NG_VIVID })],
			],
		},
		cache,
	)

	console.log(
		`\n=== ${disagreements === 0 ? "the two energies agree on every ordering" : `${disagreements} ORDERING DISAGREEMENT(S)`}` +
			`, against ${disagreementsAt010} at the 0.1.0 residual ===`,
	)
	for (const verdict of verdicts) console.log(`   ${verdict}`)
} finally {
	await rm(dir, { recursive: true, force: true })
}
