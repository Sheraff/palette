/**
 * VERIFIER — the chromatic residual (`src/energy/aprime/chromatic.ts`, A′ 0.2.0), against an
 * independent re-derivation.
 *
 * `recompute.ts:chromaticResidualBits` rebuilds ρ from the module's *stated* formula by a different
 * algorithm — a plain O(Ω²) double loop over the joint lattice, with no slab index, no sorting, no
 * reach heuristic and no cache. Four things are asked here that the term-by-term comparison in
 * `hand-computation.ts` cannot ask on its own:
 *
 * 1. **ρ, p_generic and the code lengths**, hand-computed on a 12-triple fixture and put beside the
 *    module's, cell by cell and row by row, plus the Kraft sum of the distribution they define.
 * 2. **Isolation decides, mass only scales.** Two colours of *equal* pixel mass, one chromatically
 *    alone and one embedded in eight near-duplicates: the naming gain is recomputed here from the
 *    stated criterion `gain/px = (log₂Σρ − log₂ρ(c)) − (log₂Z(c) + chain(c))` and must come out
 *    positive for the isolate and negative for the embedded one.
 * 3. **The mass-free claim, and where it stops.** Doubling a colour's pixel count leaves ρ and
 *    p_generic bit-identical **when that colour is alone in its lattice cell**. When it shares a cell
 *    with a near-duplicate it does not: `joints.lattice.cellLab` is a *mass-weighted* centroid, so
 *    the cell's representative moves and ρ moves with it. That is the one route by which a pixel
 *    count still reaches the residual, and it is exhibited rather than argued away.
 * 4. **Two things the agreement would otherwise not test** — that the 4-bandwidth truncation is
 *    load-bearing (if 8 gave the same ρ, matching at 4 would prove nothing about the constant), and
 *    that the module's slab index drops no neighbour my exhaustive loop finds, on a 1,648-cell image.
 */

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { rgbToOkLab } from "../../../../src/contract/color.ts"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import type { Configuration } from "../../src/emit/types.ts"
import { chromaticResidual, energyOfAPrime } from "../../src/energy/aprime/index.ts"
import { measureImage } from "../../src/measure/index.ts"
import type { Measurement } from "../../src/measure/types.ts"
import { barOf, chromaticResidualBits } from "./recompute.ts"

let failures = 0
function check(ok: boolean, label: string, detail = ""): void {
	if (!ok) failures += 1
	console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`)
}

const dir = await mkdtemp(join(tmpdir(), "p1-chroma-"))
async function paint(name: string, w: number, h: number, f: (x: number, y: number) => Rgb8): Promise<string> {
	const raw = Buffer.alloc(w * h * 3)
	let off = 0
	for (let y = 0; y < h; y += 1) {
		for (let x = 0; x < w; x += 1, off += 3) {
			const c = f(x, y)
			raw[off] = c[0]
			raw[off + 1] = c[1]
			raw[off + 2] = c[2]
		}
	}
	const path = join(dir, name)
	await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png({ compressionLevel: 0 }).toFile(path)
	return path
}

/** The row of the triple table nearest a given colour. */
function rowOf(m: Measurement, rgb: Rgb8): number {
	const lab = rgbToOkLab(rgb)
	let best = -1
	let bestDistance = Number.POSITIVE_INFINITY
	for (let row = 0; row < m.triples.colorCount; row += 1) {
		const d =
			(m.triples.lab[row * 3] - lab[0]) ** 2 +
			(m.triples.lab[row * 3 + 1] - lab[1]) ** 2 +
			(m.triples.lab[row * 3 + 2] - lab[2]) ** 2
		if (d < bestDistance) {
			bestDistance = d
			best = row
		}
	}
	return best
}

/** `log₂ Z(c)` for the kernel code centred on `target` — my own log-sum-exp over the alphabet. */
function log2Z(m: Measurement, target: readonly [number, number, number]): number {
	const { colorCount: K, lab } = m.triples
	const targetBar = barOf(target)
	const u = new Float64Array(K)
	for (let r = 0; r < K; r += 1) {
		const rowBar = barOf([lab[r * 3], lab[r * 3 + 1], lab[r * 3 + 2]])
		const h = rowBar > targetBar ? rowBar : targetBar
		u[r] =
			((lab[r * 3] - target[0]) ** 2 + (lab[r * 3 + 1] - target[1]) ** 2 + (lab[r * 3 + 2] - target[2]) ** 2) /
			(h * h)
	}
	let smallest = u[0]
	for (let r = 1; r < K; r += 1) if (u[r] < smallest) smallest = u[r]
	let sum = 0
	for (let r = 0; r < K; r += 1) sum += Math.exp(-0.5 * (u[r] - smallest))
	return -0.5 * smallest * Math.LOG2E + Math.log2(sum)
}

const flat = (background: Rgb8, foreground: Rgb8): Configuration => ({
	background,
	surface: background,
	foreground,
	accent: foreground,
	gradient: false,
	stops: [],
	surfaceCollapsed: true,
	accentCollapsed: true,
	escape: null,
})

try {
	// =========================================================================================== 1
	console.log("(1) ρ, p_generic and the code lengths, hand-computed on a 12-triple fixture:")
	const PALETTE: Rgb8[] = [
		[60, 62, 68], [62, 64, 70], [64, 66, 72], [66, 68, 74], [68, 70, 76],
		[150, 148, 140], [152, 150, 142], [154, 152, 144],
		[240, 240, 236], [225, 45, 35], [30, 90, 200], [20, 160, 90],
	]
	const small = await measureImage(
		await paint("chroma-12.png", 24, 24, (x, y) => PALETTE[(x * 5 + y * 7 + ((x * y) % 3)) % PALETTE.length]),
	)
	const theirs = chromaticResidual(small)
	const mine = chromaticResidualBits(small)
	let worstCell = 0
	for (let q = 0; q < mine.occupiedCells; q += 1) {
		const d = Math.abs(theirs.cellDensity[q] - mine.cellDensity[q]) / Math.max(mine.cellDensity[q], 1e-300)
		if (d > worstCell) worstCell = d
	}
	let worstBits = 0
	let kraft = 0
	for (let r = 0; r < small.triples.colorCount; r += 1) {
		const d = Math.abs(theirs.bitsPerPixel[r] - mine.bitsPerPixel[r])
		if (d > worstBits) worstBits = d
		kraft += 2 ** -mine.bitsPerPixel[r]
	}
	console.log(
		`  K = ${small.triples.colorCount}, Ω = ${mine.occupiedCells}, Σρ = ${mine.normaliser.toPrecision(12)}, ` +
			`log₂Σρ = ${mine.log2Normaliser.toPrecision(12)}`,
	)
	for (let r = 0; r < small.triples.colorCount; r += 1) {
		const q = small.joints.lattice.tripleCell[r]
		console.log(
			`    row ${String(r).padStart(2)}  n ${String(small.triples.counts[r]).padStart(4)}  cell ${String(q).padStart(2)}` +
				`  ρ ${mine.cellDensity[q].toPrecision(12).padStart(15)}  p_generic ${(mine.cellDensity[q] / mine.normaliser).toPrecision(10).padStart(13)}` +
				`  bits/px ${mine.bitsPerPixel[r].toPrecision(12).padStart(15)}`,
		)
	}
	check(theirs.occupiedCells === mine.occupiedCells, "Ω agrees", `${theirs.occupiedCells} vs ${mine.occupiedCells}`)
	check(worstCell < 1e-14, "ρ agrees on every cell", `worst relative ${worstCell.toExponential(3)}`)
	check(worstBits < 1e-13, "−log₂ p_generic agrees on every row", `worst |Δ| ${worstBits.toExponential(3)} bits`)
	check(Math.abs(kraft - 1) < 1e-12, "the recomputed distribution is proper", `Kraft Σ2^−bits = ${kraft.toPrecision(17)}`)
	console.log("")

	// =========================================================================================== 2
	console.log("(2) isolation decides, mass only scales — two colours at exactly equal mass:")
	const BG: Rgb8 = [70, 75, 85]
	const EMBEDDED: Rgb8 = [110, 114, 122]
	const NEIGHBOURS: Rgb8[] = [
		[105, 109, 117], [107, 111, 119], [109, 113, 121], [111, 115, 123],
		[113, 117, 125], [115, 119, 127], [117, 121, 129], [103, 107, 115],
	]
	const ISOLATED: Rgb8 = [225, 20, 30]
	const isoScene = (isolatedHeight: number) => (x: number, y: number): Rgb8 => {
		if (x >= 4 && x < 13 && y >= 4 && y < 13) return EMBEDDED
		for (let i = 0; i < NEIGHBOURS.length; i += 1) {
			const bx = 20 + (i % 4) * 10
			const by = 4 + Math.floor(i / 4) * 10
			if (x >= bx && x < bx + 9 && y >= by && y < by + 9) return NEIGHBOURS[i]
		}
		if (x >= 60 && x < 69 && y >= 60 && y < 60 + isolatedHeight) return ISOLATED
		return BG
	}
	const scene = await measureImage(await paint("chroma-iso.png", 96, 96, isoScene(9)))
	const sceneResidual = chromaticResidualBits(scene)
	const gains: Record<string, { n: number; rho: number; generic: number; ink: number; gain: number }> = {}
	for (const [name, rgb] of [["embedded", EMBEDDED], ["isolated", ISOLATED]] as const) {
		const row = rowOf(scene, rgb)
		const cell = scene.joints.lattice.tripleCell[row]
		const lab: [number, number, number] = [
			scene.triples.lab[row * 3], scene.triples.lab[row * 3 + 1], scene.triples.lab[row * 3 + 2],
		]
		const generic = sceneResidual.bitsPerPixel[row]
		const ink = log2Z(scene, lab) + Math.log2(scene.triples.pixelCount) / scene.triples.counts[row] + 3
		gains[name] = {
			n: scene.triples.counts[row],
			rho: sceneResidual.cellDensity[cell],
			generic,
			ink,
			gain: generic - ink,
		}
		console.log(
			`  ${name.padEnd(9)} n ${String(scene.triples.counts[row]).padStart(4)}  ρ ${sceneResidual.cellDensity[cell].toPrecision(10).padStart(14)}` +
				`  generic ${generic.toFixed(6)} b/px   ink ${ink.toFixed(6)} b/px   gain ${(generic - ink >= 0 ? "+" : "") + (generic - ink).toFixed(6)} b/px` +
				`   total ${((generic - ink) * scene.triples.counts[row]).toFixed(3)} bits`,
		)
	}
	check(gains.embedded.n === gains.isolated.n, "the two colours carry exactly the same mass", `${gains.embedded.n} px each`)
	check(gains.isolated.gain > 0, "naming the isolate repays", `+${gains.isolated.gain.toFixed(6)} bits/px`)
	check(gains.embedded.gain < 0, "naming the embedded colour does not", `${gains.embedded.gain.toFixed(6)} bits/px`)
	const embeddedEnergy = energyOfAPrime(scene, flat(BG, EMBEDDED)).total
	const isolatedEnergy = energyOfAPrime(scene, flat(BG, ISOLATED)).total
	check(
		isolatedEnergy < embeddedEnergy,
		"and the energy agrees, at identical message length",
		`Δ = ${(embeddedEnergy - isolatedEnergy).toFixed(3)} bits, which is the isolate's whole recomputed gain ` +
			`(${(gains.isolated.gain * gains.isolated.n).toFixed(3)})`,
	)
	console.log("")

	// =========================================================================================== 3
	console.log("(3) doubling a colour's pixel count:")
	const doubled = await measureImage(await paint("chroma-iso-2x.png", 96, 96, isoScene(18)))
	const doubledResidual = chromaticResidualBits(doubled)
	const isolatedRow = rowOf(scene, ISOLATED)
	const doubledRow = rowOf(doubled, ISOLATED)
	let identicalCells = 0
	for (let q = 0; q < sceneResidual.cellDensity.length; q += 1) {
		if (sceneResidual.cellDensity[q] === doubledResidual.cellDensity[q]) identicalCells += 1
	}
	check(
		doubled.triples.counts[doubledRow] === 2 * scene.triples.counts[isolatedRow],
		"the isolate's mass really doubled",
		`${scene.triples.counts[isolatedRow]} → ${doubled.triples.counts[doubledRow]} px`,
	)
	check(
		identicalCells === sceneResidual.cellDensity.length,
		"ρ is bit-identical on every cell — the isolate is alone in its own",
		`${identicalCells}/${sceneResidual.cellDensity.length}`,
	)
	check(
		sceneResidual.log2Normaliser === doubledResidual.log2Normaliser &&
			sceneResidual.bitsPerPixel[isolatedRow] === doubledResidual.bitsPerPixel[doubledRow],
		"log₂Σρ and the isolate's bits/px are unmoved",
		`${sceneResidual.bitsPerPixel[isolatedRow]} both times`,
	)

	// …and the boundary: a colour sharing its cell, where the mass-weighted centroid does move ρ.
	const A: Rgb8 = [60, 60, 60]
	const B: Rgb8 = [61, 61, 61]
	const C: Rgb8 = [62, 62, 62]
	const D: Rgb8 = [230, 40, 30]
	const share = (aCols: number) => (x: number): Rgb8 =>
		x < aCols ? A : x < aCols + 8 ? B : x < aCols + 24 ? C : x < aCols + 32 ? D : C
	const shared1 = await measureImage(await paint("chroma-share-1.png", 64, 64, share(16)))
	const shared2 = await measureImage(await paint("chroma-share-2.png", 80, 64, share(32)))
	const s1 = chromaticResidualBits(shared1)
	const s2 = chromaticResidualBits(shared2)
	const sharedRowA1 = rowOf(shared1, A)
	const sharedRowA2 = rowOf(shared2, A)
	const moved = Math.abs(s2.cellDensity[0] - s1.cellDensity[0]) / s1.cellDensity[0]
	const bitsMoved = Math.abs(s2.bitsPerPixel[sharedRowA2] - s1.bitsPerPixel[sharedRowA1])
	console.log(
		`  boundary case — A and B share cell 0; n(A) ${shared1.triples.counts[sharedRowA1]} → ${shared2.triples.counts[sharedRowA2]}:` +
			`  ρ(cell 0) ${s1.cellDensity[0].toPrecision(12)} → ${s2.cellDensity[0].toPrecision(12)}` +
			`  (${(moved * 100).toFixed(3)}%),  bits/px moved ${bitsMoved.toExponential(3)}`,
	)
	const sharedTheirs1 = chromaticResidual(shared1)
	const sharedTheirs2 = chromaticResidual(shared2)
	check(
		sharedTheirs1.cellDensity[0] === s1.cellDensity[0] && sharedTheirs2.cellDensity[0] === s2.cellDensity[0],
		"the module reproduces the boundary case exactly — this is the claim's scope, not a code fault",
	)
	check(
		moved > 0,
		"and the claim's scope is real: mass reaches ρ through the mass-weighted cell centroid",
		`ρ moved ${(moved * 100).toFixed(3)}% for a doubling inside one cell`,
	)
	console.log("")

	// =========================================================================================== 4
	console.log("(4) the truncation, and the module's spatial index, on a 1,648-cell image:")
	const from: Rgb8 = [20, 25, 60]
	const to: Rgb8 = [240, 200, 120]
	const rich = await measureImage(
		await paint("chroma-rich.png", 128, 128, (x, y) => [
			Math.round(from[0] + ((to[0] - from[0]) * x) / 127),
			Math.round(from[1] + ((to[1] - from[1]) * (x + (y % 7))) / 127),
			Math.round(from[2] + ((to[2] - from[2]) * ((x + y) % 128)) / 127),
		]),
	)
	const lattice = rich.joints.lattice
	const cellBar = new Float64Array(lattice.cellCount)
	for (let q = 0; q < lattice.cellCount; q += 1) {
		cellBar[q] = barOf([lattice.cellLab[q * 3], lattice.cellLab[q * 3 + 1], lattice.cellLab[q * 3 + 2]])
	}
	const rhoAt = (bandwidths: number) => {
		const out = new Float64Array(lattice.cellCount)
		for (let i = 0; i < lattice.cellCount; i += 1) {
			let total = 0
			for (let j = 0; j < lattice.cellCount; j += 1) {
				const sq =
					(lattice.cellLab[i * 3] - lattice.cellLab[j * 3]) ** 2 +
					(lattice.cellLab[i * 3 + 1] - lattice.cellLab[j * 3 + 1]) ** 2 +
					(lattice.cellLab[i * 3 + 2] - lattice.cellLab[j * 3 + 2]) ** 2
				const h = cellBar[i] > cellBar[j] ? cellBar[i] : cellBar[j]
				if (sq >= bandwidths * bandwidths * h * h) continue
				total += Math.exp(-0.5 * (sq / (h * h)))
			}
			out[i] = total
		}
		return out
	}
	const at4 = rhoAt(4)
	const at8 = rhoAt(8)
	let truncationGap = 0
	for (let q = 0; q < at4.length; q += 1) {
		const rel = Math.abs(at8[q] - at4[q]) / Math.max(at4[q], 1e-300)
		if (rel > truncationGap) truncationGap = rel
	}
	check(
		truncationGap > 0,
		"the 4-bandwidth cutoff is load-bearing, so agreeing at 4 pins the constant",
		`ρ at 8 bandwidths departs by up to ${(truncationGap * 100).toFixed(4)}%`,
	)
	const richMine = chromaticResidualBits(rich)
	const richTheirs = chromaticResidual(rich)
	let indexGap = 0
	for (let q = 0; q < richMine.cellDensity.length; q += 1) {
		const rel = Math.abs(richTheirs.cellDensity[q] - richMine.cellDensity[q]) / Math.max(richMine.cellDensity[q], 1e-300)
		if (rel > indexGap) indexGap = rel
	}
	check(
		indexGap < 1e-14,
		"the module's slab index drops no neighbour the exhaustive loop finds",
		`K = ${rich.triples.colorCount}, Ω = ${lattice.cellCount}, worst relative ${indexGap.toExponential(3)} (summation order)`,
	)
	check(
		richTheirs.log2Normaliser === richMine.log2Normaliser,
		"log₂Σρ is bit-identical on the rich image",
		`${richMine.log2Normaliser}`,
	)

	console.log(`\n${failures === 0 ? "ALL CHECKS PASS" : `${failures} CHECK(S) FAILED`}`)
} finally {
	await rm(dir, { recursive: true, force: true })
}
