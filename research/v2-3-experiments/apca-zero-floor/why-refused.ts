/**
 * Why is the closest thing to review's preferred founding-case answer not chosen?
 *
 * Trunk's slate contains `bg #058cde / surface #64b4e5` with the artwork's own yellow as the text —
 * the wide guard's palette minus its gradient claim. If the repair does not take it, the reason
 * matters: a protection firing is the mechanism working, a ranking accident is not.
 *
 * Usage: why-refused.ts <image>
 */
import sharp from "sharp"

import { apcaContrast, apcaRawContrast } from "../../v2-3/src/internal/color.ts"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import type { RGB } from "../../v2-3/src/internal/types.ts"

import { slateForImage } from "./slate-access.ts"

sharp.concurrency(1)

const image = await loadNativeImage(process.argv[2]!)
const { slate, published } = slateForImage(image)

const report = (label: string, mark: RGB, field: RGB) => {
	const raw = Math.abs(apcaRawContrast(mark, field))
	process.stdout.write(`      ${label.padEnd(22)} raw ${raw.toFixed(2).padStart(7)}   clamped ${apcaContrast(mark, field).toFixed(2).padStart(7)}` +
		`${raw < 10 ? "   <-- UNREADABLE" : ""}\n`)
}

const wanted = slate.filter(({ treatment }) =>
	treatment.background.hex.toLowerCase() === "#058cde" &&
	treatment.surface.hex.toLowerCase() === "#64b4e5" &&
	treatment.foreground.hex.toLowerCase() === "#fed700")

process.stdout.write(`trunk publishes bg=${published.treatment.background.hex} surface=${published.treatment.surface.hex}` +
	` fg=${published.treatment.foreground.hex} accent=${published.treatment.accent.hex}\n`)
process.stdout.write(`\nthe wide guard's field, carrying the artwork's yellow as text: ${wanted.length} candidate(s)\n`)
for (const entry of [...wanted].sort((a, b) => a.rank - b.rank)) {
	const t = entry.treatment
	process.stdout.write(`\n  rank ${entry.rank}  bg=${t.background.hex} surface=${t.surface.hex} fg=${t.foreground.hex}` +
		` accent=${t.accent.hex} ${t.gradient ? "gradient" : "flat"}\n`)
	report("foreground/surface", t.foreground.rgb, t.surface.rgb)
	report("foreground/background", t.foreground.rgb, t.background.rgb)
	report("accent/surface", t.accent.rgb, t.surface.rgb)
	report("accent/background", t.accent.rgb, t.background.rgb)
}
