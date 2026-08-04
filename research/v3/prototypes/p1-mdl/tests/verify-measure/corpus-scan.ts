/**
 * VERIFIER-OWNED. Two things the existing suite does not report:
 *   1. how many demo-20 covers take the lattice path by default (K > SMOOTHED_MASS_EXACT_MAX_COLORS),
 *   2. what the lattice-vs-exact worst relative deviation actually is on the *fixture* the suite's own
 *      "agrees with the exact sum" test uses, so it can be put beside the real-corpus number.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import sharp from "sharp"
import { measureImage } from "../../src/measure/index.ts"

const REPO = "/Users/Flo/GitHub/palette"
const SCRATCH = process.argv[2]

const set = readFileSync(join(REPO, "research/v3/data/devloop/sets/demo-20.txt"), "utf8")
	.split("\n")
	.map((line) => line.trim())
	.filter((line) => line.length > 0 && !line.startsWith("#"))

let lattice = 0
const rows: string[] = []
for (const relative of set) {
	const m = await measureImage(join(REPO, relative))
	if (m.smoothedMass.mode === "lattice") lattice += 1
	rows.push(`${relative.slice(3, 15)} K=${String(m.triples.colorCount).padStart(6)} ${m.smoothedMass.mode}`)
}

// the suite's own lattice fixture, rebuilt here
const N = 96
const raw = Buffer.alloc(N * N * 3)
let offset = 0
for (let y = 0; y < N; y += 1) {
	for (let x = 0; x < N; x += 1, offset += 3) {
		const value = (x * 3 + y * 2) % 256
		raw[offset] = value
		raw[offset + 1] = (value * 5) % 256
		raw[offset + 2] = (value * 11) % 256
	}
}
const fixture = join(SCRATCH, "suite-lattice-fixture.png")
await sharp(raw, { raw: { width: N, height: N, channels: 3 } }).png({ compressionLevel: 0 }).toFile(fixture)
const exact = await measureImage(fixture)
const approx = await measureImage(fixture, { smoothedMassCellsPerBar: 4 })
let worst = 0
for (let row = 0; row < exact.triples.colorCount; row += 1) {
	const r = Math.abs(approx.smoothedMass.mass[row] - exact.smoothedMass.mass[row]) / exact.smoothedMass.mass[row]
	if (r > worst) worst = r
}

console.log(rows.join("\n"))
console.log(`demo-20: ${lattice}/${set.length} take the lattice path by default`)
console.log(`suite fixture (96x96, K=${exact.triples.colorCount}): lattice@4 vs exact worst relative = ${worst}`)
