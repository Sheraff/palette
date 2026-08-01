/**
 * Attribute every mover between two swept labels.
 *
 * Reports, per artwork: which roles changed, whether the gradient decision changed, the standing
 * verdict (latest-wins from the LIVE warehouse), and whether the artwork is a parity fixture or a
 * named guardrail.
 */
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

const here = new URL(".", import.meta.url).pathname
const worktreeRoot = resolve(here, "../../../..")
const resultsRoot = resolve(worktreeRoot, "research/v2-3-eval/data/results")
const SHARED = "/Users/Flo/GitHub/palette"

const [a, b] = process.argv.slice(2)
if (!a || !b) throw new Error("usage: diff-arms.ts <labelA> <labelB>")

function load(label: string) {
	const dir = resolve(resultsRoot, label)
	const m = new Map<string, any>()
	for (const f of readdirSync(dir)) {
		if (!f.endsWith(".json")) continue
		m.set(f.replace(/\.json$/, ""), JSON.parse(readFileSync(resolve(dir, f), "utf8")))
	}
	return m
}
const A = load(a), B = load(b)

// latest-wins standing verdict per artwork, from the LIVE warehouse
const verdicts = readFileSync(`${SHARED}/research/v2-3-eval/data/verdicts.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l))
const standing = new Map<string, any>()
for (const v of verdicts) if (v.image) standing.set(v.image.replace(/\.(jpg|jpeg|png|webp|avif)$/i, ""), v)

// the 34 byte-pinned parity fixtures, keyed by basename as the sweep names them
const fixturesSrc = readFileSync(resolve(worktreeRoot, "research/v2-3/test/review-fixtures.ts"), "utf8")
const fixtures = new Set([...fixturesSrc.matchAll(/file:\s*"([^"]+)"/g)].map((m) => m[1].split("/").pop()!))

const corpus = JSON.parse(readFileSync(resolve(here, "corpus.json"), "utf8")) as any[]
const groupOf = new Map(corpus.map((c) => [c.image, c.group]))

const ROLES = ["background", "surface", "foreground", "accent"] as const
const movers: any[] = []
let compared = 0
for (const [image, ra] of A) {
	const rb = B.get(image)
	if (!rb) continue
	compared++
	const wa = ra.extraction.winner, wb = rb.extraction.winner
	const changed = ROLES.filter((r) => wa[r].hex !== wb[r].hex)
	const gradientChanged = wa.gradient !== wb.gradient
	const midA = ra.extraction.researchRender?.field.stops[1].hex ?? null
	const midB = rb.extraction.researchRender?.field.stops[1].hex ?? null
	const midChanged = midA !== midB
	if (changed.length === 0 && !gradientChanged && !midChanged) continue
	movers.push({
		image, group: groupOf.get(image) ?? "?", changed, gradientChanged, midChanged,
		a: Object.fromEntries(ROLES.map((r) => [r, wa[r].hex])), b: Object.fromEntries(ROLES.map((r) => [r, wb[r].hex])),
		gradA: wa.gradient, gradB: wb.gradient, midA, midB,
		fixture: fixtures.has(image), verdict: standing.get(image)?.verdict ?? null,
		note: (standing.get(image)?.notes ?? "").replace(/\s+/g, " ").slice(0, 90),
	})
}

console.log(`compared ${compared} artworks; ${movers.length} moved (${(100 * movers.length / compared).toFixed(1)}%)`)
const byGroup: Record<string, { n: number; moved: number }> = {}
for (const [image] of A) {
	const g = groupOf.get(image) ?? "?"
	byGroup[g] ??= { n: 0, moved: 0 }
	byGroup[g].n++
}
for (const m of movers) byGroup[m.group].moved++
for (const [g, v] of Object.entries(byGroup)) console.log(`  ${g.padEnd(15)} ${v.moved}/${v.n} moved (${(100 * v.moved / v.n).toFixed(1)}%)`)
const roleCounts: Record<string, number> = {}
for (const m of movers) for (const r of m.changed) roleCounts[r] = (roleCounts[r] ?? 0) + 1
console.log(`  roles moved: ${JSON.stringify(roleCounts)}   gradient flips: ${movers.filter((m) => m.gradientChanged).length}   midpoint changes: ${movers.filter((m) => m.midChanged).length}`)
console.log(`  accent-only movers: ${movers.filter((m) => m.changed.length === 1 && m.changed[0] === "accent" && !m.gradientChanged && !m.midChanged).length}`)
console.log(`  parity fixtures moved: ${movers.filter((m) => m.fixture).length}`)

console.log(`\n${"image".padEnd(42)} ${"grp".padEnd(9)} ${"fx".padEnd(3)} ${"verdict".padEnd(14)} roles`)
for (const m of movers.sort((x, y) => (y.fixture ? 1 : 0) - (x.fixture ? 1 : 0) || x.image.localeCompare(y.image))) {
	console.log(`${m.image.padEnd(42)} ${m.group.padEnd(9)} ${(m.fixture ? "FX" : "").padEnd(3)} ${String(m.verdict ?? "-").padEnd(14)} ${m.changed.join(",")}${m.gradientChanged ? ` grad ${m.gradA}->${m.gradB}` : ""}${m.midChanged ? ` mid ${m.midA}->${m.midB}` : ""}`)
	for (const r of m.changed) console.log(`${"".padEnd(42)} ${"".padEnd(9)} ${"".padEnd(3)} ${"".padEnd(14)}   ${r}: ${m.a[r]} -> ${m.b[r]}`)
	if (m.note) console.log(`${"".padEnd(42)} ${"".padEnd(9)} ${"".padEnd(3)} ${"".padEnd(14)}   note: ${m.note}`)
}
