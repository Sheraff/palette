/**
 * Enumerate EVERY connected component of one colour family, not just the
 * bounded set the evidence retains. Read-only: it re-runs the same 4-neighbour
 * flood fill over the evidence's own `familyAt` map.
 */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain } from "../../v2-3/src/internal/palette-core.ts"

const ROOT = "/Users/Flo/GitHub/palette"
const [caseFile, wantHex] = process.argv.slice(2)
if (!caseFile || !wantHex) throw new Error("usage: inspect-components.ts <case> <#hex>")

const image = await loadNativeImage(`${ROOT}/${caseFile}`)
const evidence = buildPaletteSeedDomain(image).evidence
const want = [1, 3, 5].map((i) => parseInt(wantHex.slice(i, i + 2), 16))

let familyIndex = -1
let best = Infinity
evidence.families.forEach((family, index) => {
	for (const rep of family.representatives) {
		const d = Math.hypot(rep.rgb[0] - want[0], rep.rgb[1] - want[1], rep.rgb[2] - want[2])
		if (d < best) { best = d; familyIndex = index }
	}
})
const family = evidence.families[familyIndex]
console.log(`${caseFile}  ${image.width}x${image.height}`)
console.log(`family ${family.id} ${family.representatives[0]?.hex} pop=${(family.populationFraction * 100).toFixed(4)}% components=${family.componentCount} mark=${family.markSupport.toFixed(3)} strokes=${family.markComponentCount}\n`)

const { width, height, familyAt, pixelCount } = evidence
const visited = new Uint8Array(pixelCount)
type Comp = { pop: number; minX: number; minY: number; maxX: number; maxY: number; cx: number; cy: number }
const comps: Comp[] = []
const queue = new Int32Array(pixelCount)
for (let start = 0; start < pixelCount; start++) {
	if (visited[start] || familyAt[start] !== familyIndex) continue
	let head = 0
	let tail = 0
	queue[tail++] = start
	visited[start] = 1
	const c: Comp = { pop: 0, minX: width, minY: height, maxX: -1, maxY: -1, cx: 0, cy: 0 }
	while (head < tail) {
		const p = queue[head++]
		const x = p % width
		const y = Math.floor(p / width)
		c.pop += 1
		c.cx += x
		c.cy += y
		if (x < c.minX) c.minX = x
		if (x > c.maxX) c.maxX = x
		if (y < c.minY) c.minY = y
		if (y > c.maxY) c.maxY = y
		const n = [x > 0 ? p - 1 : -1, x + 1 < width ? p + 1 : -1, y > 0 ? p - width : -1, y + 1 < height ? p + width : -1]
		for (const q of n) if (q >= 0 && !visited[q] && familyAt[q] === familyIndex) { visited[q] = 1; queue[tail++] = q }
	}
	c.cx /= c.pop
	c.cy /= c.pop
	comps.push(c)
}
comps.sort((a, b) => b.pop - a.pop)
console.log(`enumerated ${comps.length} components`)

const buckets = new Map<string, number>()
for (const c of comps) {
	const key = c.pop === 1 ? "1" : c.pop <= 3 ? "2-3" : c.pop <= 7 ? "4-7" : c.pop <= 15 ? "8-15" : c.pop <= 31 ? "16-31" : c.pop <= 63 ? "32-63" : "64+"
	buckets.set(key, (buckets.get(key) ?? 0) + 1)
}
console.log("size histogram:", [...buckets].map(([k, v]) => `${k}px:${v}`).join("  "))

const show = Number(process.env.SHOW ?? 40)
console.log(`\ntop ${show} by population — pop  box      centroid      fill`)
for (const c of comps.slice(0, show)) {
	const w = c.maxX - c.minX + 1
	const h = c.maxY - c.minY + 1
	console.log(`  ${String(c.pop).padStart(5)}  ${String(w).padStart(3)}x${String(h).padStart(3)}  (${c.cx.toFixed(0).padStart(3)},${c.cy.toFixed(0).padStart(3)})  ${(c.pop / (w * h)).toFixed(2)}`)
}

// Spatial concentration: where do the biggest components sit?
const region = (c: Comp): string => `${c.cy / height < 0.5 ? "top" : "bottom"}-${c.cx / width < 0.5 ? "left" : "right"}`
const byRegion = new Map<string, { n: number; pop: number }>()
for (const c of comps) {
	const r = region(c)
	const e = byRegion.get(r) ?? { n: 0, pop: 0 }
	e.n += 1
	e.pop += c.pop
	byRegion.set(r, e)
}
console.log("\nquadrant distribution (all components):",
	[...byRegion].map(([k, v]) => `${k}: ${v.n} comps / ${v.pop}px`).join("   "))
const big = comps.filter((c) => c.pop >= 12)
const byRegionBig = new Map<string, number>()
for (const c of big) byRegionBig.set(region(c), (byRegionBig.get(region(c)) ?? 0) + 1)
console.log(`quadrant distribution (>=12px, ${big.length} comps):`,
	[...byRegionBig].map(([k, v]) => `${k}: ${v}`).join("   "))
