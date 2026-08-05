// W15 audit — re-derivation of W12's 0.4.0 coverage claims from run files alone.
// usage: node analyse.mjs <run.jsonl> [label]
import { readFile } from "node:fs/promises"

const path = process.argv[2]
const label = process.argv[3] ?? path
const lines = (await readFile(path, "utf8")).split("\n").filter((l) => l.length > 0)

let rows = 0
const stopHist = new Map()
let gradientCount = 0
let swapFired = 0
let accentCollapsed = 0
const haltHist = new Map()
const refusalTotals = { spacing: 0, monotone: 0, indistinct: 0, noReduction: 0 }
let minSpacingSeen = Infinity
let nonMonotone = 0

for (const line of lines) {
	const p = JSON.parse(line)
	if (p.kind !== "devloop-run-row") continue
	if (p.ok !== true || p.palette === null) continue
	rows += 1
	const pal = p.palette
	const stops = pal.gradient?.stops ?? pal.field?.stops ?? null
	let n = null
	if (Array.isArray(stops)) n = stops.length
	else if (Array.isArray(pal.stops)) n = pal.stops.length
	if (n !== null) {
		stopHist.set(n, (stopHist.get(n) ?? 0) + 1)
		if (n >= 3) gradientCount += 1
	}
	// intermediates / diagnostics
	const im = p.intermediates ?? p.diagnostics ?? {}
	if (im.roleSwapApplied === true) swapFired += 1
	if (im.accentCollapsed === true) accentCollapsed += 1
}

console.log(`== ${label}`)
console.log(`rows ${rows}`)
console.log(`stop-count histogram:`, [...stopHist.entries()].sort((a, b) => a[0] - b[0]))
console.log(`ramps with >=3 stops (gradient): ${gradientCount}`)
console.log(`roleSwapApplied: ${swapFired}  (${((100 * swapFired) / rows).toFixed(1)}%)`)
console.log(`accentCollapsed: ${accentCollapsed}`)
