/**
 * Corpus-wide mover count between two censuses. Reports over the INTERSECTION of what both labels
 * actually covered, and states the coverage — a census killed for machine budget must never be
 * extrapolated to the whole corpus.
 *
 *   node --experimental-strip-types census-diff.ts <labelA> <labelB>
 */
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const [a, b] = process.argv.slice(2)
const dir = resolve(import.meta.dirname, "census")
const load = (label: string): Record<string, string> => {
	const out: Record<string, string> = {}
	for (let i = 0; i < 4; i++) {
		const p = resolve(dir, `${label}.${i}.json`)
		if (existsSync(p)) Object.assign(out, JSON.parse(readFileSync(p, "utf8")))
	}
	return out
}
const A = load(a), B = load(b)
const keys = Object.keys(A).filter((k) => B[k] !== undefined).sort()
const roles = ["background", "surface", "foreground", "accent"] as const

let moved = 0, errors = 0
const roleMoves = { background: 0, surface: 0, foreground: 0, accent: 0 }
let gradientFlips = 0, accentOnly = 0
for (const k of keys) {
	if (A[k].startsWith("ERROR") || B[k].startsWith("ERROR")) { errors++; continue }
	if (A[k] === B[k]) continue
	moved++
	const pa = A[k].split(" "), pb = B[k].split(" ")
	const changed = roles.filter((r, i) => pa[i] !== pb[i])
	for (const r of changed) roleMoves[r]++
	if (pa[4] !== pb[4]) gradientFlips++
	if (changed.length === 1 && changed[0] === "accent") accentOnly++
}
process.stdout.write(`census ${a} vs ${b}\n`)
process.stdout.write(`  coverage: ${a} ${Object.keys(A).length}, ${b} ${Object.keys(B).length}, ` +
	`compared ${keys.length} (extraction errors skipped: ${errors})\n`)
process.stdout.write(`  moved: ${moved}/${keys.length - errors} ` +
	`(${((100 * moved) / Math.max(1, keys.length - errors)).toFixed(1)} %)\n`)
process.stdout.write(`  roles moved: ${JSON.stringify(roleMoves)}\n`)
process.stdout.write(`  accent-only movers: ${accentOnly}   gradient decision flips: ${gradientFlips}\n`)
