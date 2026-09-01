/**
 * Candidate lettering-vs-texture statistics, measured on the FULL component
 * enumeration of a family (not the bounded retained set).
 *
 * usage: inspect-cluster.ts <case> <#hex> [<#hex> ...]
 */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain } from "../../v2-3/src/internal/palette-core.ts"

const ROOT = "/Users/Flo/GitHub/palette"
const [caseFile, ...hexes] = process.argv.slice(2)
const image = await loadNativeImage(`${ROOT}/${caseFile}`)
const evidence = buildPaletteSeedDomain(image).evidence
const { width, height, familyAt, pixelCount } = evidence
const floor = Math.max(12, 0.00002 * pixelCount)

type Comp = { pop: number; w: number; h: number; cx: number; cy: number }

function componentsOf(familyIndex: number): Comp[] {
	const visited = new Uint8Array(pixelCount)
	const queue = new Int32Array(pixelCount)
	const out: Comp[] = []
	for (let start = 0; start < pixelCount; start++) {
		if (visited[start] || familyAt[start] !== familyIndex) continue
		let head = 0, tail = 0
		queue[tail++] = start
		visited[start] = 1
		let pop = 0, minX = width, minY = height, maxX = -1, maxY = -1, sx = 0, sy = 0
		while (head < tail) {
			const p = queue[head++]
			const x = p % width, y = Math.floor(p / width)
			pop++; sx += x; sy += y
			if (x < minX) minX = x; if (x > maxX) maxX = x
			if (y < minY) minY = y; if (y > maxY) maxY = y
			for (const q of [x > 0 ? p - 1 : -1, x + 1 < width ? p + 1 : -1, y > 0 ? p - width : -1, y + 1 < height ? p + width : -1]) {
				if (q >= 0 && !visited[q] && familyAt[q] === familyIndex) { visited[q] = 1; queue[tail++] = q }
			}
		}
		out.push({ pop, w: maxX - minX + 1, h: maxY - minY + 1, cx: sx / pop, cy: sy / pop })
	}
	return out
}

const mean = (v: number[]): number => v.reduce((s, x) => s + x, 0) / Math.max(1, v.length)
const cv = (v: number[]): number => { const m = mean(v); return m === 0 ? 1 : Math.sqrt(mean(v.map((x) => (x - m) ** 2))) / m }

for (const hex of hexes) {
	const want = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
	let fi = -1, best = Infinity
	evidence.families.forEach((f, i) => { for (const r of f.representatives) { const d = Math.hypot(r.rgb[0] - want[0], r.rgb[1] - want[1], r.rgb[2] - want[2]); if (d < best) { best = d; fi = i } } })
	const family = evidence.families[fi]
	const all = componentsOf(fi)
	const adm = all.filter((c) => c.pop >= floor).sort((a, b) => b.pop - a.pop)
	console.log(`\n=== ${caseFile}  ${family.id} ${family.representatives[0]?.hex}  mark=${family.markSupport.toFixed(3)} ===`)
	console.log(`components: ${all.length} total, ${adm.length} admissible (>=${floor.toFixed(0)}px), family pop ${family.population}px`)
	if (adm.length < 3) { console.log("  too few admissible"); continue }

	// metric uniformity
	console.log(`  height  cv=${cv(adm.map((c) => c.h)).toFixed(3)}  mean=${mean(adm.map((c) => c.h)).toFixed(1)}`)
	console.log(`  width   cv=${cv(adm.map((c) => c.w)).toFixed(3)}  mean=${mean(adm.map((c) => c.w)).toFixed(1)}`)
	console.log(`  pop     cv=${cv(adm.map((c) => c.pop)).toFixed(3)}  mean=${mean(adm.map((c) => c.pop)).toFixed(1)}`)

	// baseline banding: cluster centroid-y with tolerance = mean stroke height
	const tol = Math.max(2, mean(adm.map((c) => c.h)) * 0.5)
	const ys = adm.map((c) => c.cy).sort((a, b) => a - b)
	const bands: number[][] = []
	for (const y of ys) {
		const last = bands[bands.length - 1]
		if (last && y - last[last.length - 1] <= tol) last.push(y)
		else bands.push([y])
	}
	const banded = bands.filter((b) => b.length >= 3).reduce((s, b) => s + b.length, 0)
	console.log(`  baselines: ${bands.length} band(s) at tol=${tol.toFixed(1)}px, sizes [${bands.map((b) => b.length).join(",")}], ${banded}/${adm.length} in bands of >=3  => alignment=${(banded / adm.length).toFixed(3)}`)

	// spatial compactness of the admissible group
	const bx = [Math.min(...adm.map((c) => c.cx)), Math.max(...adm.map((c) => c.cx))]
	const by = [Math.min(...adm.map((c) => c.cy)), Math.max(...adm.map((c) => c.cy))]
	const area = ((bx[1] - bx[0]) * (by[1] - by[0])) / (width * height)
	console.log(`  group bbox: x[${bx[0].toFixed(0)}-${bx[1].toFixed(0)}] y[${by[0].toFixed(0)}-${by[1].toFixed(0)}]  = ${(area * 100).toFixed(2)}% of frame`)

	// density of the group: admissible strokes per unit of their own bbox
	const strokeArea = adm.reduce((s, c) => s + c.w * c.h, 0)
	const boxArea = Math.max(1, (bx[1] - bx[0] + 1) * (by[1] - by[0] + 1))
	console.log(`  group fill: strokes cover ${(strokeArea / boxArea * 100).toFixed(1)}% of their own bbox`)
}
