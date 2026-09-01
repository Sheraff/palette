/**
 * What APCA does near zero, measured rather than assumed.
 *
 * The founding case reports exactly 0.0000, and a threshold has to know whether that is a genuine
 * zero or the library reporting a whole band of real luminance differences as zero. It is the
 * latter, and the band is wide: APCA-W3 clips small results to exactly 0 and subtracts a constant
 * offset from what survives, so its output near zero is not continuous — it jumps from 0 to
 * roughly Lc 7. That discontinuity is the single most important fact for choosing a threshold,
 * because every candidate bar inside the jump selects exactly the same set of artworks.
 */
import { APCAcontrast, sRGBtoY } from "apca-w3"

const fg = [0xfe, 0xd7, 0x00], su = [0xd2, 0xe0, 0xeb]
console.log("founding case: Yfg", sRGBtoY(fg), "Ysu", sRGBtoY(su))
console.log("  Lc fg-on-surface", APCAcontrast(sRGBtoY(fg), sRGBtoY(su)))
console.log("  Lc surface-on-fg", APCAcontrast(sRGBtoY(su), sRGBtoY(fg)))

console.log("\nsmallest non-zero |Lc| APCA will report, swept over grey backgrounds:")
console.log("  greyLevel   first non-zero Lc (text lighter)   first non-zero Lc (text darker)")
for (const level of [8, 32, 64, 96, 128, 160, 192, 224, 248]) {
	const y = sRGBtoY([level, level, level])
	let lighter = 0, darker = 0
	for (let d = 0.000001; d < 1 && lighter === 0; d *= 1.0005) lighter = APCAcontrast(y + d, y)
	for (let d = 0.000001; d < 1 && darker === 0; d *= 1.0005) darker = APCAcontrast(Math.max(0, y - d), y)
	console.log(`  ${String(level).padStart(9)}   ${lighter.toFixed(4).padStart(30)}   ${darker.toFixed(4).padStart(29)}`)
}

console.log("\nover every 8-bit grey pair, the reported |Lc| values that land in (0, 15):")
const seen = []
for (let a = 0; a < 256; a += 1) {
	for (let b = 0; b < 256; b += 1) {
		if (a === b) continue
		const lc = Math.abs(APCAcontrast(sRGBtoY([a, a, a]), sRGBtoY([b, b, b])))
		if (lc > 0 && lc < 15) seen.push(lc)
	}
}
seen.sort((x, y) => x - y)
console.log(`  ${seen.length} pairs; smallest ${seen[0]?.toFixed(4)}, largest ${seen.at(-1)?.toFixed(4)}`)
for (const bar of [1, 2, 5, 7, 9, 12, 15]) {
	console.log(`    |Lc| < ${String(bar).padStart(2)}: ${seen.filter((v) => v < bar).length} of ${seen.length} non-zero pairs`)
}
