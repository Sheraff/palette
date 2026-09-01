/**
 * Did the mechanism deliver what the reviewer asked for, and how big are the movers really?
 *
 * (a) For every accent correction whose artwork is in the sweep, does the ON arm's accent land
 *     closer to the reviewer's prescription than the OFF arm's does?
 * (b) Grade every mover by perceptual magnitude, so a `#ffffff -> #fffffe` is not counted as a
 *     palette change.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { okDistance, rgbToOKLab, perceptualDifference } from "../../../v2-3/src/internal/color.ts"
import { hexToRgb } from "./probe.ts"
import { CASES } from "./salience-set.ts"

const here = new URL(".", import.meta.url).pathname
const worktreeRoot = resolve(here, "../../../..")
const resultsRoot = resolve(worktreeRoot, "research/v2-3-eval/data/results")
const [a, b] = process.argv.slice(2)
const ROLES = ["background", "surface", "foreground", "accent"] as const

function read(label: string, image: string) {
	for (const name of [image, `${image}.jpg`, `${image}.jpeg`, `${image}.png`, `${image}.avif`]) {
		const p = resolve(resultsRoot, label, `${name}.json`)
		if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"))
	}
	return null
}

// ---------- (a) delivery on the correction corpus ----------
console.log("=== did the ON arm move the accent toward the reviewer's prescription? ===")
console.log(`${"idx".padStart(4)} ${"class".padEnd(12)} ${"prescribed".padEnd(10)} ${"OFF accent".padEnd(11)} ${"ON accent".padEnd(11)} ${"dOFF".padStart(7)} ${"dON".padStart(7)} verdict`)
const tally: Record<string, { closer: number; farther: number; same: number; exact: number; n: number }> = {}
for (const c of CASES) {
	const ra = read(a, c.image), rb = read(b, c.image)
	if (!ra || !rb) continue
	const pre = rgbToOKLab(hexToRgb(c.prescribed))
	const dOff = okDistance(pre, ra.extraction.winner.accent.oklab)
	const dOn = okDistance(pre, rb.extraction.winner.accent.oklab)
	tally[c.klass] ??= { closer: 0, farther: 0, same: 0, exact: 0, n: 0 }
	const t = tally[c.klass]
	t.n++
	const eps = 1e-6
	const dir = dOn < dOff - eps ? "CLOSER" : dOn > dOff + eps ? "farther" : "same"
	if (dir === "CLOSER") t.closer++; else if (dir === "farther") t.farther++; else t.same++
	if (dOn <= 0.018) t.exact++
	console.log(`${String(c.idx).padStart(4)} ${c.klass.padEnd(12)} ${c.prescribed.padEnd(10)} ${ra.extraction.winner.accent.hex.padEnd(11)} ${rb.extraction.winner.accent.hex.padEnd(11)} ${dOff.toFixed(4).padStart(7)} ${dOn.toFixed(4).padStart(7)} ${dir}${dOn <= 0.018 ? "  <-- DELIVERED" : ""}`)
}
console.log()
for (const [k, t] of Object.entries(tally)) {
	console.log(`  ${k.padEnd(12)} n=${t.n}  closer=${t.closer}  farther=${t.farther}  unchanged=${t.same}  landed within MDD of the prescription=${t.exact}`)
}

// ---------- (b) magnitude of every mover ----------
console.log("\n=== magnitude of the movers (perceptualDifference, the repo's own ruler; sameColor bar = 3.3) ===")
const corpus = JSON.parse(readFileSync(resolve(here, "corpus.json"), "utf8")) as any[]
const groupOf = new Map(corpus.map((c) => [c.image, c.group]))
const buckets = { imperceptible: 0, small: 0, clear: 0, large: 0 }
let moved = 0, total = 0
const bigMovers: any[] = []
for (const f of readdirSync(resolve(resultsRoot, a))) {
	if (!f.endsWith(".json")) continue
	const image = f.replace(/\.json$/, "")
	const ra = JSON.parse(readFileSync(resolve(resultsRoot, a, f), "utf8"))
	const p = resolve(resultsRoot, b, f)
	if (!existsSync(p)) continue
	const rb = JSON.parse(readFileSync(p, "utf8"))
	total++
	const wa = ra.extraction.winner, wb = rb.extraction.winner
	const deltas = ROLES.map((r) => wa[r].hex === wb[r].hex ? 0 : perceptualDifference(wa[r].rgb, wb[r].rgb))
	const worst = Math.max(...deltas)
	if (worst === 0 && wa.gradient === wb.gradient) continue
	moved++
	const bucket = worst < 3.3 ? "imperceptible" : worst < 10 ? "small" : worst < 25 ? "clear" : "large"
	buckets[bucket]++
	if (worst >= 10) bigMovers.push({ image, group: groupOf.get(image) ?? "?", worst, roles: ROLES.filter((r, i) => deltas[i] > 0) })
}
console.log(`  moved at all:            ${moved}/${total}`)
console.log(`  worst-role dE < 3.3 (below the repo's own sameColor bar): ${buckets.imperceptible}`)
console.log(`  3.3 <= dE < 10 (small):  ${buckets.small}`)
console.log(`  10 <= dE < 25 (clear):   ${buckets.clear}`)
console.log(`  dE >= 25 (large):        ${buckets.large}`)
console.log(`  materially moved (dE >= 3.3): ${moved - buckets.imperceptible}/${total} = ${(100 * (moved - buckets.imperceptible) / total).toFixed(1)}%`)
const g: Record<string, number> = {}
for (const m of bigMovers) g[m.group] = (g[m.group] ?? 0) + 1
console.log(`  dE >= 10 movers by group: ${JSON.stringify(g)}`)
