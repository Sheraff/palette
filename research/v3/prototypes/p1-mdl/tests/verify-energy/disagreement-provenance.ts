/**
 * VERIFIER — check 9: which of `cross-energy.ts`'s ordering disagreements did the extent code touch?
 *
 * `cross-energy.ts` reported **three** disagreements at energy 0.1.0 and reports **two** at 0.2.0.
 * "The diptych one went away" is a claim about a difference, so it is measured as one: the two
 * fixtures that still disagree are re-scored by `recompute.ts`'s arm A with the extent code switched
 * **off** (`withSupport: false`, the pre-0.2.0 model) and **on**, and the orderings are put beside arm
 * A′'s. If a disagreement is present in both columns it pre-dates the fix and is a standing currency
 * difference; if it appears only in the "on" column the fix introduced it.
 */

import { join } from "node:path"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import type { Configuration } from "../../src/emit/types.ts"
import { measureImage } from "../../src/measure/index.ts"
import { energyOfAPrime } from "../../src/energy/aprime/index.ts"
import { armA } from "./recompute.ts"
import { cleanupFixtures, configuration, writeRgbImage } from "../energy-a/support.ts"

type Entry = [string, Configuration]

async function judge(name: string, path: string, entries: Entry[]): Promise<void> {
	const measurement = await measureImage(path)
	const rows = entries.map(([label, config]) => ({
		label,
		off: armA(measurement, config, 1, { withSupport: false }).total,
		on: armA(measurement, config, 1).total,
		prime: energyOfAPrime(measurement, config).total,
	}))
	const order = (key: "off" | "on" | "prime") =>
		[...rows].sort((l, r) => l[key] - r[key]).map((r) => r.label).join(" < ")
	const primeOrder = order("prime")
	console.log(`\n### ${name}`)
	for (const row of rows) {
		console.log(
			`   ${row.label.padEnd(14)} A(no extent code) ${row.off.toFixed(6).padStart(12)}   ` +
				`A(0.2.0) ${row.on.toFixed(6).padStart(12)}   A' ${row.prime.toFixed(3).padStart(11)}`,
		)
	}
	console.log(`   A 0.1.0: ${order("off")}   ${order("off") === primeOrder ? "AGREE" : "DISAGREE"}`)
	console.log(`   A 0.2.0: ${order("on")}   ${order("on") === primeOrder ? "AGREE" : "DISAGREE"}`)
	console.log(`   A'     : ${primeOrder}`)
}

const only: Rgb8 = [40, 60, 90]
const unused: Rgb8 = [200, 100, 50]
await judge(
	"A'-suite (a) one-colour 64x64",
	await writeRgbImage("verify-prov-flat.png", 64, 64, () => only),
	[
		["collapsed", configuration({ background: only, foreground: only })],
		["two-flat", configuration({ background: only, surface: unused, foreground: only })],
		[
			"ramp",
			configuration({
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
		["four-roles", configuration({ background: only, surface: unused, foreground: only, accent: unused })],
	],
)

const from: Rgb8 = [20, 25, 60]
const to: Rgb8 = [240, 200, 120]
const column = (x: number): Rgb8 => [
	Math.round(from[0] + ((to[0] - from[0]) * x) / 63),
	Math.round(from[1] + ((to[1] - from[1]) * x) / 63),
	Math.round(from[2] + ((to[2] - from[2]) * x) / 63),
]
await judge(
	"A'-suite (c) linear ramp 64x64",
	await writeRgbImage("verify-prov-ramp.png", 64, 64, (x) => column(x)),
	[
		["flat", configuration({ background: column(0), foreground: column(63) })],
		["two-flat", configuration({ background: column(0), surface: column(63), foreground: column(63) })],
		[
			"ramp",
			configuration({
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
			configuration({
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
)

// The diptych, for contrast: the one the fix was aimed at.
const top: Rgb8 = [20, 22, 30]
const bottom: Rgb8 = [230, 228, 220]
await judge(
	"A'-suite (b) clean diptych 64x64 — the fix's target",
	await writeRgbImage("verify-prov-diptych.png", 64, 64, (_x, y) => (y < 32 ? top : bottom)),
	[
		["flat", configuration({ background: top, foreground: bottom })],
		["two-flat", configuration({ background: top, surface: bottom, foreground: bottom })],
		[
			"ramp",
			configuration({
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
)

await cleanupFixtures()
