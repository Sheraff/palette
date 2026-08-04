/**
 * VERIFIER — check 4: the four mechanism properties, on both energies.
 *
 *   (i)   evaluation-only — no config field is chosen or mutated
 *   (ii)  terms sum exactly to total
 *   (iii) λ enters only multiplicatively on the structural / serialization term
 *   (iv)  score-anything — six edge-shaped configurations, none of which may throw
 */

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import type { Configuration } from "../../src/emit/types.ts"
import { canonicalDigest, measureImage, unpackKey } from "../../src/measure/index.ts"
import { energyOfA } from "../../src/energy/a/index.ts"
import { energyOfAPrime } from "../../src/energy/aprime/index.ts"

const SIDE = 48
let failures = 0
function check(ok: boolean, label: string, detail = ""): void {
	if (!ok) failures += 1
	console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`)
}

async function fixture(dir: string): Promise<string> {
	const raw = Buffer.alloc(SIDE * SIDE * 3)
	let off = 0
	for (let y = 0; y < SIDE; y += 1) {
		for (let x = 0; x < SIDE; x += 1, off += 3) {
			// A ramp down the columns, two ink strokes, and a vivid patch: enough distinct triples that
			// every branch of both energies has something to chew on.
			let c: Rgb8
			if (x === 7 || x === 33) c = [245, 244, 240]
			else if (x >= 12 && x < 18 && y >= 12 && y < 18) c = [220, 30, 40]
			else {
				const t = x / (SIDE - 1)
				c = [
					Math.round(24 + t * 200),
					Math.round(28 + t * 160),
					Math.round(70 + t * 60),
				]
			}
			raw[off] = c[0]
			raw[off + 1] = c[1]
			raw[off + 2] = c[2]
		}
	}
	const path = join(dir, "mechanism.png")
	await sharp(raw, { raw: { width: SIDE, height: SIDE, channels: 3 } })
		.png({ compressionLevel: 0 })
		.toFile(path)
	return path
}

const dir = await mkdtemp(join(tmpdir(), "p1-mech-"))
try {
	const measurement = await measureImage(await fixture(dir))
	const triples: Rgb8[] = []
	for (let r = 0; r < measurement.triples.colorCount; r += 1) {
		triples.push(unpackKey(measurement.triples.keys[r]))
	}
	const pick = (i: number): Rgb8 => triples[i % triples.length]
	console.log(`fixture: ${SIDE}x${SIDE}, ${triples.length} triples\n`)

	// ------------------------------------------------------------------ (iv) score-anything
	const edgeShapes: [string, Configuration][] = [
		[
			"legacy reconstruction (3 stops, mid@0.5)",
			{
				background: pick(0),
				surface: pick(triples.length - 1),
				foreground: pick(5),
				accent: pick(9),
				gradient: true,
				stops: [
					{ rgb: pick(0), position: 0 },
					{ rgb: pick(triples.length >> 1), position: 0.5 },
					{ rgb: pick(triples.length - 1), position: 1 },
				],
				surfaceCollapsed: false,
				accentCollapsed: false,
				escape: null,
			},
		],
		[
			"both collapses",
			{
				background: pick(0),
				surface: pick(0),
				foreground: pick(5),
				accent: pick(5),
				gradient: false,
				stops: [],
				surfaceCollapsed: true,
				accentCollapsed: true,
				escape: null,
			},
		],
		[
			"escape (background -> #ffffff)",
			{
				background: pick(0),
				surface: pick(0),
				foreground: pick(5),
				accent: pick(5),
				gradient: false,
				stops: [],
				surfaceCollapsed: true,
				accentCollapsed: true,
				escape: { role: "background", color: "#ffffff" },
			},
		],
		[
			"4-stop gradient",
			{
				background: pick(0),
				surface: pick(triples.length - 1),
				foreground: pick(5),
				accent: pick(9),
				gradient: true,
				stops: [
					{ rgb: pick(0), position: 0 },
					{ rgb: pick(7), position: 0.3 },
					{ rgb: pick(15), position: 0.7 },
					{ rgb: pick(triples.length - 1), position: 1 },
				],
				surfaceCollapsed: false,
				accentCollapsed: false,
				escape: null,
			},
		],
		[
			"degenerate stops (coincident positions, out of order)",
			{
				background: pick(0),
				surface: pick(3),
				foreground: pick(5),
				accent: pick(9),
				gradient: true,
				stops: [
					{ rgb: pick(0), position: 0.5 },
					{ rgb: pick(3), position: 0.5 },
					{ rgb: pick(11), position: 0.2 },
				],
				surfaceCollapsed: false,
				accentCollapsed: false,
				escape: null,
			},
		],
		[
			"gradient with no stops + colours absent from the image",
			{
				background: [1, 2, 3],
				surface: [4, 5, 6],
				foreground: [7, 8, 9],
				accent: [250, 251, 252],
				gradient: true,
				stops: [],
				surfaceCollapsed: false,
				accentCollapsed: false,
				escape: null,
			},
		],
	]

	console.log("(iv) score-anything — six edge shapes, neither energy may throw:")
	for (const [label, config] of edgeShapes) {
		let ok = true
		let detail = ""
		try {
			const a = energyOfA(measurement, config)
			const p = energyOfAPrime(measurement, config)
			ok = Number.isFinite(a.total) && Number.isFinite(p.total)
			detail = `A ${a.total.toPrecision(8)}  A' ${p.total.toPrecision(8)}`
		} catch (error) {
			ok = false
			detail = `threw ${String(error)}`
		}
		check(ok, label, detail)
	}
	console.log("")

	// ------------------------------------------------------------------ (ii) terms sum to total
	const randomish: Configuration[] = []
	// A fixed low-discrepancy walk over the triple table — no RNG, reproducible.
	for (let k = 0; k < 5; k += 1) {
		const i = (k * 37 + 3) % triples.length
		const j = (k * 91 + 11) % triples.length
		const gradient = k % 2 === 0
		randomish.push({
			background: pick(i),
			surface: pick(j),
			foreground: pick(i + 13),
			accent: pick(j + 29),
			gradient,
			stops: gradient
				? [
						{ rgb: pick(i), position: 0 },
						...(k % 4 === 0 ? [{ rgb: pick(i + j), position: 0.4 }] : []),
						{ rgb: pick(j), position: 1 },
					]
				: [],
			surfaceCollapsed: k % 3 === 0,
			accentCollapsed: k % 3 === 1,
			escape: null,
		})
	}

	console.log("(ii) terms sum to total, 5 configurations, tolerance 1e-9:")
	for (let k = 0; k < randomish.length; k += 1) {
		const a = energyOfA(measurement, randomish[k])
		const p = energyOfAPrime(measurement, randomish[k])
		const sumA = Object.values(a.terms).reduce((t, v) => t + v, 0)
		const sumP = Object.values(p.terms).reduce((t, v) => t + v, 0)
		check(
			Math.abs(sumA - a.total) < 1e-9,
			`arm A  config ${k}`,
			`|Σterms − total| = ${Math.abs(sumA - a.total).toExponential(3)}`,
		)
		check(
			Math.abs(sumP - p.total) < 1e-9,
			`arm A' config ${k}`,
			`|Σterms − total| = ${Math.abs(sumP - p.total).toExponential(3)}`,
		)
	}
	console.log("")

	// ------------------------------------------------------------------ (iii) λ is multiplicative
	console.log("(iii) λ enters only on the structural / serialization term:")
	for (let k = 0; k < randomish.length; k += 1) {
		const config = randomish[k]
		const a1 = energyOfA(measurement, config, { lambda: 0.25 })
		const a2 = energyOfA(measurement, config, { lambda: 4 })
		const dataSame = a1.terms.field === a2.terms.field && a1.terms.ink === a2.terms.ink
		const structuralScales =
			a2.terms.structural === 4 * a1.nuisance.omega && a1.terms.structural === 0.25 * a1.nuisance.omega
		const affine = Math.abs(a2.total - a1.total - (4 - 0.25) * a1.nuisance.omega) < 1e-9
		check(
			dataSame && structuralScales && affine,
			`arm A  config ${k}`,
			`data identical ${dataSame}, structural = λΩ ${structuralScales}, affine ${affine}`,
		)

		const p1 = energyOfAPrime(measurement, config, { lambda: 0.25 })
		const p2 = energyOfAPrime(measurement, config, { lambda: 4 })
		const pDataSame =
			p1.terms.fieldColorBits === p2.terms.fieldColorBits &&
			p1.terms.fieldSupportBits === p2.terms.fieldSupportBits &&
			p1.terms.inkColorBits === p2.terms.inkColorBits &&
			p1.terms.inkSupportBits === p2.terms.inkSupportBits &&
			p1.terms.genericBits === p2.terms.genericBits
		const bits = p1.nuisance.serializationBits as number
		const pAffine = Math.abs(p2.total - p1.total - (4 - 0.25) * bits) < 1e-9
		check(
			pDataSame && p2.terms.paletteBits === 4 * bits && pAffine,
			`arm A' config ${k}`,
			`data identical ${pDataSame}, paletteBits = λ·L(P) ${p2.terms.paletteBits === 4 * bits}, affine ${pAffine}`,
		)
	}
	console.log("")

	// ------------------------------------------------------------------ (i) evaluation-only
	console.log("(i) evaluation-only — inputs unchanged, nothing chosen:")
	const before = canonicalDigest(measurement)
	const probe = randomish[0]
	const probeSnapshot = JSON.stringify(probe)
	// Freeze the configuration and its stops: a write of any kind now throws in strict mode.
	Object.freeze(probe)
	Object.freeze(probe.stops)
	for (const stop of probe.stops) Object.freeze(stop)
	let frozenOk = true
	let frozenDetail = ""
	try {
		energyOfA(measurement, probe)
		energyOfAPrime(measurement, probe)
	} catch (error) {
		frozenOk = false
		frozenDetail = String(error)
	}
	check(frozenOk, "both energies run against a deep-frozen configuration", frozenDetail)
	check(JSON.stringify(probe) === probeSnapshot, "configuration byte-identical after evaluation")
	check(canonicalDigest(measurement) === before, "measurement digest unchanged after evaluation")

	// Determinism: a second call has to reproduce the first exactly.
	const first = JSON.stringify(energyOfA(measurement, probe))
	const second = JSON.stringify(energyOfA(measurement, probe))
	check(first === second, "arm A double-run byte-identical")
	const firstP = JSON.stringify(energyOfAPrime(measurement, probe))
	const secondP = JSON.stringify(energyOfAPrime(measurement, probe))
	check(firstP === secondP, "arm A' double-run byte-identical")

	console.log(`\n${failures === 0 ? "ALL CHECKS PASS" : `${failures} CHECK(S) FAILED`}`)
} finally {
	await rm(dir, { recursive: true, force: true })
}
