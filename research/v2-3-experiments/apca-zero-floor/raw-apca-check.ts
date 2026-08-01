/**
 * Does the raw reimplementation agree with the vendored library everywhere?
 *
 * `apcaRawContrast` restates APCA's arithmetic up to the clip, so the claim that it is the same
 * quantity has to be checked rather than asserted. Putting the raw value back through the clip and
 * offset must reproduce `apcaContrast` exactly, for every pair.
 *
 * The one place they legitimately differ is APCA's `deltaYmin` early return: the library bails out
 * before computing anything when the two luminances are within 0.0005, and returns 0. That is
 * inside the zero bucket either way, so it cannot change any decision — but it is a real difference
 * and it is reported rather than hidden.
 */
import { apcaClampRawContrast, apcaContrast, apcaRawContrast } from "../../v2-3/src/internal/color.ts"
import type { RGB } from "../../v2-3/src/internal/types.ts"

let checked = 0
let mismatches = 0
let deltaYminCases = 0
let worst = 0
const examples: string[] = []

const sample = (value: number): RGB => [value, value, value]
for (let a = 0; a < 256; a += 1) {
	for (let b = 0; b < 256; b += 1) {
		const foreground = sample(a), background = sample(b)
		const library = apcaContrast(foreground, background)
		const rebuilt = apcaClampRawContrast(apcaRawContrast(foreground, background))
		checked += 1
		const difference = Math.abs(library - rebuilt)
		if (difference > 1e-9) {
			// APCA returns 0 early when the luminances are within deltaYmin; the raw form has no
			// such cliff. Both are inside the zero bucket, so nothing downstream can see it.
			if (library === 0 && Math.abs(rebuilt) < 10) { deltaYminCases += 1; continue }
			mismatches += 1
			worst = Math.max(worst, difference)
			if (examples.length < 5) examples.push(`grey ${a} on ${b}: library ${library}, rebuilt ${rebuilt}`)
		}
	}
}

process.stdout.write(`checked ${checked} grey pairs\n`)
process.stdout.write(`  exact agreement outside the zero bucket: ${mismatches === 0 ? "YES" : `NO (${mismatches} mismatches, worst ${worst})`}\n`)
for (const example of examples) process.stdout.write(`    ${example}\n`)
process.stdout.write(`  pairs where APCA's deltaYmin early return differs from the raw form: ${deltaYminCases}\n`)
process.stdout.write(`    (all inside the zero bucket, so no decision can depend on them)\n`)

// The relationship the doc comment claims: apcaContrast is 0 exactly when |raw| < 10.
let claimHolds = true
for (let a = 0; a < 256; a += 1) {
	for (let b = 0; b < 256; b += 1) {
		const library = apcaContrast(sample(a), sample(b))
		const raw = Math.abs(apcaRawContrast(sample(a), sample(b)))
		if ((library === 0) !== (raw < 10) && !(library === 0 && raw < 10.000001)) claimHolds = false
	}
}
process.stdout.write(`  "clamped 0 exactly when |raw| < 10" holds: ${claimHolds ? "YES" : "NO"}\n`)
