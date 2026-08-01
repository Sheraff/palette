/**
 * Was the wide guard's founding-case answer ever reachable from trunk's slate?
 *
 * The wide guard published `bg #058cde / surface #64b4e5`, **as a gradient**, and review preferred it.
 * Level 2b can only re-pick from candidates trunk already built, so if that palette is not in trunk's
 * slate then 2b failing to produce it is a reachability fact, not a ranking mistake — and the only
 * mechanism that can reach it is the one that perturbs the domain.
 *
 * Usage: founding-case-reachability.ts <image>
 */
import sharp from "sharp"

import { apcaRawContrast } from "../../v2-3/src/internal/color.ts"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"

import { slateForImage } from "./slate-access.ts"

sharp.concurrency(1)

const image = await loadNativeImage(process.argv[2]!)
const { slate, published } = slateForImage(image)

const WIDE_BACKGROUND = "#058cde"
const WIDE_SURFACE = "#64b4e5"

process.stdout.write(`trunk publishes: bg=${published.treatment.background.hex} surface=${published.treatment.surface.hex}` +
	` fg=${published.treatment.foreground.hex} accent=${published.treatment.accent.hex}` +
	` ${published.treatment.gradient ? "gradient" : "flat"}\n`)
process.stdout.write(`source-eligible slate: ${slate.length} candidates\n\n`)

const onWideField = slate.filter(({ treatment }) =>
	treatment.background.hex.toLowerCase() === WIDE_BACKGROUND &&
	treatment.surface.hex.toLowerCase() === WIDE_SURFACE)
const asGradient = onWideField.filter(({ treatment }) => treatment.gradient)
const asFlat = onWideField.filter(({ treatment }) => !treatment.gradient)

process.stdout.write(`candidates on the wide guard's field (${WIDE_BACKGROUND} -> ${WIDE_SURFACE}):\n`)
process.stdout.write(`  total ${onWideField.length}   as GRADIENT ${asGradient.length}   as flat ${asFlat.length}\n`)
if (asGradient.length > 0) {
	process.stdout.write(`  best-ranked gradient candidates on that field:\n`)
	for (const entry of [...asGradient].sort((a, b) => a.rank - b.rank).slice(0, 10)) {
		process.stdout.write(`    rank ${String(entry.rank).padStart(5)}  fg=${entry.treatment.foreground.hex}` +
			` accent=${entry.treatment.accent.hex}` +
			`  fg/surface raw ${Math.abs(apcaRawContrast(entry.treatment.foreground.rgb, entry.treatment.surface.rgb)).toFixed(1)}\n`)
	}
} else {
	process.stdout.write(`  NONE. The wide guard's palette is a gradient on this field, and trunk's slate\n`)
	process.stdout.write(`  contains that field only as a FLAT treatment. It is unreachable by any re-pick.\n`)
}

// The reviewed answer keeps the artwork's yellow as the text, so that specific arrangement is the
// one worth asking about, not merely the field.
const withYellowText = onWideField.filter(({ treatment }) => treatment.foreground.hex.toLowerCase() === "#fed700")
process.stdout.write(`\n  ...of which carry the artwork's yellow as the foreground: ${withYellowText.length}\n`)
for (const entry of [...withYellowText].sort((a, b) => a.rank - b.rank).slice(0, 5)) {
	process.stdout.write(`    rank ${String(entry.rank).padStart(5)}  ${entry.treatment.gradient ? "gradient" : "flat"}` +
		` accent=${entry.treatment.accent.hex}` +
		`  fg/surface raw ${Math.abs(apcaRawContrast(entry.treatment.foreground.rgb, entry.treatment.surface.rgb)).toFixed(1)}\n`)
}

// What 2b actually had to choose from: everything clean, in ranking order.
const clean = slate.filter(({ treatment }) =>
	Math.abs(apcaRawContrast(treatment.foreground.rgb, treatment.surface.rgb)) >= 10)
process.stdout.write(`\ncandidates whose foreground clears the floor on their own surface: ${clean.length}\n`)
process.stdout.write(`best six by ranking — this is the ordering level 2b follows:\n`)
for (const entry of [...clean].sort((a, b) => a.rank - b.rank).slice(0, 6)) {
	process.stdout.write(`  rank ${String(entry.rank).padStart(5)}  bg=${entry.treatment.background.hex}` +
		` surface=${entry.treatment.surface.hex} fg=${entry.treatment.foreground.hex}` +
		` accent=${entry.treatment.accent.hex} ${entry.treatment.gradient ? "gradient" : "flat"}\n`)
}
