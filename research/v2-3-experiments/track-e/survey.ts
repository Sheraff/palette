/**
 * One row per colour family, corpus-wide, carrying every candidate
 * lettering-vs-texture discriminator this arm evaluated.
 *
 * Self-contained: it re-derives the full connected-component set from the
 * evidence's own `familyAt` map in a single labelling pass, so it runs against
 * unmodified `research/v2-3/` and needs no diagnostic fields in the runtime.
 * (The evidence itself retains only a bounded component subset per family,
 * which is precisely what made the knuckles speckle population invisible.)
 *
 * Written as TSV so a threshold can be chosen from the whole distribution
 * rather than from a handful of hand-picked families — the mistake that sank
 * attempts 1 and 2, recorded in EXPERIMENT-lettering.md.
 */
import { writeFile } from "node:fs/promises"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain } from "../../v2-3/src/internal/palette-core.ts"
import { ALBUM_ARTWORK_PALETTE_V2_POLICY } from "../../v2-3/src/internal/policy.ts"
import { reviewFixtures } from "../../v2-3/test/review-fixtures.ts"

const ROOT = "/Users/Flo/GitHub/palette"
const CASES = [
	...reviewFixtures.map(({ source }) => source.file),
	"03/ab67616d00001e020003e50500c5d762da89643a.jpg",
	"11/ab67616d0000b2730011c0148119c34e2b222b02",
	"05/ab67616d0000b2730005230fae1822525e5a5ff6",
	"09/ab67616d0000b2730009d178a401f9433fdddff2",
	"01/ab67616d0000b27300015083990110d3b1a4ea8a.jpg",
]

type Stats = {
	components: number
	admissible: number
	boxAreaSum: number
	heightSum: number
	heightSquareSum: number
	minX: number
	minY: number
	maxX: number
	maxY: number
}

const rows: string[] = [[
	"case", "family", "hex", "mark", "strokes", "admissible", "components",
	"enum", "groupEnum", "groupFill", "groupBox%", "heightCV", "pop%",
].join("\t")]

for (const caseFile of CASES) {
	const image = await loadNativeImage(`${ROOT}/${caseFile}`)
	const evidence = buildPaletteSeedDomain(image).evidence
	const { width, height, familyAt, pixelCount } = evidence
	const floor = Math.max(
		ALBUM_ARTWORK_PALETTE_V2_POLICY.mark.minimumComponentPopulation,
		ALBUM_ARTWORK_PALETTE_V2_POLICY.mark.minimumComponentFraction * pixelCount)

	const stats = evidence.families.map((): Stats => ({
		components: 0, admissible: 0, boxAreaSum: 0, heightSum: 0, heightSquareSum: 0,
		minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity,
	}))
	const visited = new Uint8Array(pixelCount)
	const queue = new Int32Array(pixelCount)
	for (let start = 0; start < pixelCount; start++) {
		if (visited[start]) continue
		const familyIndex = familyAt[start]
		let head = 0
		let tail = 0
		queue[tail++] = start
		visited[start] = 1
		let pop = 0, minX = width, minY = height, maxX = -1, maxY = -1
		while (head < tail) {
			const p = queue[head++]
			const x = p % width
			const y = (p - x) / width
			pop += 1
			if (x < minX) minX = x
			if (x > maxX) maxX = x
			if (y < minY) minY = y
			if (y > maxY) maxY = y
			if (x > 0 && !visited[p - 1] && familyAt[p - 1] === familyIndex) { visited[p - 1] = 1; queue[tail++] = p - 1 }
			if (x + 1 < width && !visited[p + 1] && familyAt[p + 1] === familyIndex) { visited[p + 1] = 1; queue[tail++] = p + 1 }
			if (y > 0 && !visited[p - width] && familyAt[p - width] === familyIndex) { visited[p - width] = 1; queue[tail++] = p - width }
			if (y + 1 < height && !visited[p + width] && familyAt[p + width] === familyIndex) { visited[p + width] = 1; queue[tail++] = p + width }
		}
		const s = stats[familyIndex]
		s.components += 1
		if (pop >= floor) {
			const w = maxX - minX + 1
			const h = maxY - minY + 1
			s.admissible += 1
			s.boxAreaSum += w * h
			s.heightSum += h
			s.heightSquareSum += h * h
			s.minX = Math.min(s.minX, minX)
			s.minY = Math.min(s.minY, minY)
			s.maxX = Math.max(s.maxX, maxX)
			s.maxY = Math.max(s.maxY, maxY)
		}
	}

	evidence.families.forEach((f, index) => {
		if (f.markComponentCount < 3) return
		const s = stats[index]
		const boxArea = s.admissible === 0 ? 0 : (s.maxX - s.minX + 1) * (s.maxY - s.minY + 1)
		const meanHeight = s.admissible === 0 ? 0 : s.heightSum / s.admissible
		const heightCV = meanHeight <= 0
			? 1
			: Math.sqrt(Math.max(0, s.heightSquareSum / s.admissible - meanHeight ** 2)) / meanHeight
		rows.push([
			caseFile.split("/").pop()!.slice(0, 22),
			f.id,
			f.representatives[0]?.hex ?? "?",
			f.markSupport.toFixed(3),
			f.markComponentCount,
			s.admissible,
			s.components,
			(f.markComponentCount / Math.max(1, s.components)).toFixed(3),
			(f.markComponentCount / Math.max(1, s.admissible)).toFixed(3),
			(boxArea === 0 ? 0 : Math.min(1, s.boxAreaSum / boxArea)).toFixed(4),
			(boxArea / pixelCount * 100).toFixed(2),
			heightCV.toFixed(3),
			(f.populationFraction * 100).toFixed(4),
		].join("\t"))
	})
	console.log(`${caseFile} done`)
}

const out = `${import.meta.dirname}/data/family-survey.tsv`
await writeFile(out, `${rows.join("\n")}\n`)
console.log(`\n${rows.length - 1} family rows -> ${out}`)
