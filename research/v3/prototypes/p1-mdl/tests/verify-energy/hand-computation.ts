/**
 * VERIFIER — checks 1 and 3: the two energies against an independent reimplementation, on a
 * two-colour synthetic image, for the collapsed-flat and four-role configurations.
 */

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import type { Configuration } from "../../src/emit/types.ts"
import { measureImage } from "../../src/measure/index.ts"
import { energyOfA } from "../../src/energy/a/index.ts"
import { energyOfAPrime } from "../../src/energy/aprime/index.ts"
import { armA, armAPrime, gamutVolume, serializationBits } from "./recompute.ts"

const FIELD: Rgb8 = [64, 66, 72]
const INK: Rgb8 = [242, 242, 238]
const SIDE = 32

async function writeImage(dir: string): Promise<string> {
	const raw = Buffer.alloc(SIDE * SIDE * 3)
	let off = 0
	for (let y = 0; y < SIDE; y += 1) {
		for (let x = 0; x < SIDE; x += 1, off += 3) {
			// One 4x4 block of ink at (2,2)..(5,5); field everywhere else. Exactly two triples.
			const c = x >= 2 && x < 6 && y >= 2 && y < 6 ? INK : FIELD
			raw[off] = c[0]
			raw[off + 1] = c[1]
			raw[off + 2] = c[2]
		}
	}
	const path = join(dir, "two-colour.png")
	await sharp(raw, { raw: { width: SIDE, height: SIDE, channels: 3 } })
		.png({ compressionLevel: 0 })
		.toFile(path)
	return path
}

const collapsed: Configuration = {
	background: FIELD,
	surface: FIELD,
	foreground: INK,
	accent: INK,
	gradient: false,
	stops: [],
	surfaceCollapsed: true,
	accentCollapsed: true,
	escape: null,
}

const fourRole: Configuration = {
	background: FIELD,
	surface: INK,
	foreground: INK,
	accent: FIELD,
	gradient: false,
	stops: [],
	surfaceCollapsed: false,
	accentCollapsed: false,
	escape: null,
}

function rel(a: number, b: number): number {
	const scale = Math.max(Math.abs(a), Math.abs(b), 1e-300)
	return Math.abs(a - b) / scale
}

function row(name: string, subject: number, mine: number): void {
	const r = rel(subject, mine)
	const verdict = r < 1e-12 ? "EXACT" : r < 5e-7 ? "6 s.f. OK" : "DIVERGES"
	console.log(
		`  ${name.padEnd(20)} subject ${subject.toPrecision(12).padStart(18)}   mine ${mine
			.toPrecision(12)
			.padStart(18)}   rel ${r.toExponential(3)}  ${verdict}`,
	)
}

const dir = await mkdtemp(join(tmpdir(), "p1-verify-"))
try {
	const path = await writeImage(dir)
	const m = await measureImage(path)

	console.log(`image: ${SIDE}x${SIDE}, ${m.triples.colorCount} distinct triples, ${m.triples.pixelCount} px`)
	console.log(
		`counts: ${Array.from(m.triples.counts).join(", ")}   smoothedMass mode: ${m.smoothedMass.mode}`,
	)
	console.log(`V(16) recomputed here = ${gamutVolume(16).toPrecision(12)}`)
	console.log("")

	for (const [label, config] of [
		["collapsed-flat", collapsed],
		["four-role", fourRole],
	] as const) {
		console.log(`=== ARM A — ${label} ===`)
		const s = energyOfA(m, config)
		const v = armA(m, config)
		row("terms.field", s.terms.field, v.field)
		row("terms.ink", s.terms.ink, v.ink)
		row("terms.structural", s.terms.structural, v.structural)
		row("terms.escape", s.terms.escape, v.escape)
		row("total", s.total, v.total)
		console.log(
			`  nuisance: order ${s.nuisance.fieldOrder}/${v.fieldOrder}  rung ${s.nuisance.splitScaleRung}/${v.splitScaleRung}` +
				`  eps ${s.nuisance.residualWeight.toPrecision(8)}/${v.residualWeight.toPrecision(8)}` +
				`  omega ${s.nuisance.omega}/${v.omega}  V ${s.nuisance.gamutVolume.toPrecision(10)}/${v.gamutVolume.toPrecision(10)}`,
		)
		console.log("")

		console.log(`=== ARM A' — ${label} ===`)
		const sp = energyOfAPrime(m, config)
		const vp = armAPrime(m, config)
		row("fieldColorBits", sp.terms.fieldColorBits, vp.fieldColorBits)
		row("fieldSupportBits", sp.terms.fieldSupportBits, vp.fieldSupportBits)
		row("inkColorBits", sp.terms.inkColorBits, vp.inkColorBits)
		row("inkSupportBits", sp.terms.inkSupportBits, vp.inkSupportBits)
		row("genericBits", sp.terms.genericBits, vp.genericBits)
		row("paletteBits", sp.terms.paletteBits, vp.paletteBits)
		row("L(P) bits", sp.nuisance.serializationBits, serializationBits(config))
		row("total", sp.total, vp.total)
		row("chromatic log2Σρ", sp.nuisance.chromaticLog2Normaliser as number, vp.chromaticLog2Normaliser)
		console.log(
			`  nuisance: model ${sp.nuisance.fieldModel}/${vp.fieldModel}  triples f/i/g ` +
				`${sp.nuisance.fieldTriples},${sp.nuisance.inkTriples},${sp.nuisance.genericTriples} / ` +
				`${vp.fieldTriples},${vp.inkTriples},${vp.genericTriples}` +
				`  Ω ${sp.nuisance.chromaticCells}/${vp.chromaticCells}`,
		)
		console.log("")
	}
} finally {
	await rm(dir, { recursive: true, force: true })
}
