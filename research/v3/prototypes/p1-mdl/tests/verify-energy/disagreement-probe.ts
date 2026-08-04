/**
 * VERIFIER — follow-up on the cross-energy ordering disagreements.
 *
 * Question 1: is the arm A ranking on the clean diptych an accident of λ = 1, or does it survive the
 * mandatory sweep λ ∈ {¼, ½, 1, 2, 4}?
 * Question 2: is it a property of arm A′'s fixture, or of arm A's energy? Probe arm A's *own*
 * two-band fixture with a flat configuration whose foreground names the second band.
 *
 * **Standing at energy `p1a-energy-0.2.0` (re-run 2026-08-04).** These two questions produced
 * `DESIGN.md` decision 9; the joint (colour, extent) code answers them. The diptych now ranks
 * two-flat first for λ ≤ 1 and the disagreement with arm A′ is gone — the sweep is kept because it is
 * the shape of the finding, and because λ ≥ 2 flipping the diptych back is λ doing its job (Ω differs
 * by 1 and the data gap is 1.2748) rather than the defect returning. The reproduction of the defect
 * itself, measured by an implementation that never had the fix, is `diptych.ts`'s pre-fix control.
 */

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import type { Configuration, ConfigurationStop } from "../../src/emit/types.ts"
import { measureImage } from "../../src/measure/index.ts"
import { energyOfA } from "../../src/energy/a/index.ts"
import { energyOfAPrime } from "../../src/energy/aprime/index.ts"

let dir = ""
async function write(name: string, w: number, h: number, paint: (x: number, y: number) => Rgb8) {
	const raw = Buffer.alloc(w * h * 3)
	let off = 0
	for (let y = 0; y < h; y += 1)
		for (let x = 0; x < w; x += 1, off += 3) {
			const c = paint(x, y)
			raw[off] = c[0]
			raw[off + 1] = c[1]
			raw[off + 2] = c[2]
		}
	const path = join(dir, name)
	await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png({ compressionLevel: 0 }).toFile(path)
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

dir = await mkdtemp(join(tmpdir(), "p1-probe-"))
try {
	const top: Rgb8 = [20, 22, 30]
	const bottom: Rgb8 = [230, 228, 220]
	const m = await measureImage(await write("band.png", 64, 64, (_x, y) => (y < 32 ? top : bottom)))
	const flat = config({ background: top, foreground: bottom })
	const twoFlat = config({ background: top, surface: bottom, foreground: bottom })

	console.log("=== A'-suite (b) clean diptych, arm A over the mandatory λ sweep ===")
	console.log("   λ      flat(A)      two-flat(A)   winner        flat(A')     two-flat(A')  winner")
	for (const lambda of [0.25, 0.5, 1, 2, 4]) {
		const f = energyOfA(m, flat, { lambda })
		const t = energyOfA(m, twoFlat, { lambda })
		const fp = energyOfAPrime(m, flat, { lambda })
		const tp = energyOfAPrime(m, twoFlat, { lambda })
		console.log(
			`  ${String(lambda).padEnd(5)} ${f.total.toFixed(6).padStart(11)} ${t.total
				.toFixed(6)
				.padStart(13)}   ${(f.total < t.total ? "flat" : "two-flat").padEnd(12)}` +
				` ${fp.total.toFixed(2).padStart(11)} ${tp.total.toFixed(2).padStart(13)}   ${
					fp.total < tp.total ? "flat" : "two-flat"
				}`,
		)
	}
	const f1 = energyOfA(m, flat)
	const t1 = energyOfA(m, twoFlat)
	console.log(
		`\n  arm A data terms only: flat ${(f1.terms.field + f1.terms.ink).toFixed(6)} vs two-flat ${(
			t1.terms.field + t1.terms.ink
		).toFixed(6)}  → two-flat's data is better by ${(
			f1.terms.field + f1.terms.ink - (t1.terms.field + t1.terms.ink)
		).toFixed(6)} nats, which is the λ it repays up to (Ω differs by exactly 1).`,
	)
	console.log(
		`  arm A nuisance: flat fieldMass ${f1.nuisance.fieldMassFraction.toFixed(4)} ink ${f1.nuisance.inkMassFraction.toFixed(
			4,
		)} rung ${f1.nuisance.splitScaleRung} | two-flat fieldMass ${t1.nuisance.fieldMassFraction.toFixed(
			4,
		)} rung ${t1.nuisance.splitScaleRung}`,
	)
	const fp1 = energyOfAPrime(m, flat)
	const tp1 = energyOfAPrime(m, twoFlat)
	console.log(
		`  arm A' mass split: flat field/ink/generic ${fp1.nuisance.fieldMassFraction}/${fp1.nuisance.inkMassFraction}/${fp1.nuisance.genericMassFraction}` +
			` | two-flat ${tp1.nuisance.fieldMassFraction}/${tp1.nuisance.inkMassFraction}/${tp1.nuisance.genericMassFraction}`,
	)

	// -------- the same probe on arm A's OWN two-band fixture -------------------------------------
	const BAND_LEFT: Rgb8 = [58, 62, 92]
	const BAND_RIGHT: Rgb8 = [198, 152, 78]
	const INK: Rgb8 = [242, 242, 238]
	const STROKES = new Set([13, 47])
	const m2 = await measureImage(
		await write("aband.png", 64, 64, (x) => (STROKES.has(x) ? INK : x < 32 ? BAND_LEFT : BAND_RIGHT)),
	)
	console.log("\n=== arm A's own two-band fixture, with the ink role pointed at the second band ===")
	const asTested = config({ background: BAND_LEFT, foreground: INK })
	const twoFlatTested = config({ background: BAND_LEFT, surface: BAND_RIGHT, foreground: INK })
	const inkIsBand = config({ background: BAND_LEFT, foreground: BAND_RIGHT })
	const inkIsBandWithAccent = config({
		background: BAND_LEFT,
		foreground: BAND_RIGHT,
		accent: INK,
	})
	for (const [label, cfg] of [
		["flat, fg=INK          (as the suite tests)", asTested],
		["two-flat, fg=INK      (as the suite tests)", twoFlatTested],
		["flat, fg=BAND_RIGHT   (Ω=0)", inkIsBand],
		["flat, fg=BAND_RIGHT + accent=INK (Ω=1)", inkIsBandWithAccent],
	] as const) {
		const a = energyOfA(m2, cfg)
		const p = energyOfAPrime(m2, cfg)
		console.log(
			`  ${label.padEnd(44)} Ω=${a.nuisance.omega}  A ${a.total.toFixed(6).padStart(11)}   A' ${p.total
				.toFixed(2)
				.padStart(10)}`,
		)
	}

	// -------- the one-colour case ------------------------------------------------------------------
	const only: Rgb8 = [40, 60, 90]
	const unused: Rgb8 = [200, 100, 50]
	const m3 = await measureImage(await write("one.png", 64, 64, () => only))
	console.log("\n=== one-colour image: arm A′'s L(pixels|P) = 0 property has no arm A analogue ===")
	for (const [label, cfg] of [
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
	] as const) {
		const a = energyOfA(m3, cfg)
		const p = energyOfAPrime(m3, cfg)
		console.log(
			`  ${label.padEnd(12)} Ω=${a.nuisance.omega}  A data ${(a.terms.field + a.terms.ink)
				.toFixed(6)
				.padStart(11)}  total ${a.total.toFixed(6).padStart(11)}   A' L(pix|P) ${String(
				p.nuisance.likelihoodBits,
			).padStart(3)}  total ${p.total.toFixed(1).padStart(7)}`,
		)
	}
} finally {
	await rm(dir, { recursive: true, force: true })
}
