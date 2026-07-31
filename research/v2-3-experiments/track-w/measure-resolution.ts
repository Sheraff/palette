/**
 * The corpus resolution distribution.
 *
 * `resolved` saturates at an ABSOLUTE population (255 px). Whether that constant is
 * strict or lax depends entirely on how big the artwork is, so before reformulating it
 * we need to know what "how big" looks like across the corpus — the reference pixel
 * count has to come from this distribution, not from the cases the arm wants to move.
 */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import cases from "./cases.json" with { type: "json" }

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"

const rows: { case: string; width: number; height: number; pixels: number }[] = []
for (const caseFile of cases as string[]) {
	const image = await loadNativeImage(`${ROOT}/${caseFile}`)
	rows.push({ case: caseFile, width: image.width, height: image.height, pixels: image.width * image.height })
}

const pixels = rows.map((row) => row.pixels).sort((first, second) => first - second)
const quantile = (q: number): number => pixels[Math.min(pixels.length - 1, Math.floor(q * pixels.length))]!
console.log(`n=${pixels.length}`)
for (const q of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
	const value = quantile(q)
	console.log(`  p${String(Math.round(q * 100)).padStart(3)}  ${String(value).padStart(9)} px  (${Math.round(Math.sqrt(value))}²)`)
}

const bySide = new Map<number, number>()
for (const row of rows) {
	const side = Math.round(Math.sqrt(row.pixels))
	bySide.set(side, (bySide.get(side) ?? 0) + 1)
}
console.log("\nnominal side -> count")
for (const [side, count] of [...bySide].sort((first, second) => first[0] - second[0])) {
	console.log(`  ${String(side).padStart(5)}  ${count}`)
}
