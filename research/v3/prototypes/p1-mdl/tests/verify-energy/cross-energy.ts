/**
 * VERIFIER — check 5: do the two energies agree on the ORDERINGS of the eight synthetic cases the
 * two workers' suites use? They are different currencies (nats per unit image mass vs bits), so only
 * the ranking is comparable — but the mechanism predicts the same winners on cases this unambiguous.
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

function report(c: Case, measurementCache: Map<string, unknown>): Promise<void> {
	return (async () => {
		const m = await measureImage(c.path)
		measurementCache.set(c.path, m)
		const rows = c.entries.map(([label, cfg]) => ({
			label,
			a: energyOfA(m, cfg).total,
			p: energyOfAPrime(m, cfg).total,
		}))
		const byA = [...rows].sort((l, r) => l.a - r.a).map((r) => r.label)
		const byP = [...rows].sort((l, r) => l.p - r.p).map((r) => r.label)
		const same = byA.join(" < ") === byP.join(" < ")
		if (!same) disagreements += 1
		console.log(`\n### ${c.name}  ${same ? "AGREE" : "DISAGREE"}`)
		for (const r of rows) {
			console.log(`   ${r.label.padEnd(26)} A ${r.a.toFixed(6).padStart(14)} nats   A' ${r.p.toFixed(3).padStart(12)} bits`)
		}
		console.log(`   arm A  order: ${byA.join(" < ")}`)
		console.log(`   arm A' order: ${byP.join(" < ")}`)
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
		`\n=== ${disagreements === 0 ? "the two energies agree on every ordering" : `${disagreements} ORDERING DISAGREEMENT(S)`} ===`,
	)
} finally {
	await rm(dir, { recursive: true, force: true })
}
