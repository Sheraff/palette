/**
 * Is the wide guard's founding-case answer actually reachable from trunk's slate?
 *
 * Level 2b re-picks from the candidates the pipeline already built, so it can only ever produce a
 * palette that is *in* that slate. The wide guard produced `surface #64b4e5` — but the wide guard
 * also changed which candidates materialization admitted, which is exactly the cascade this arm
 * measured. So "it was a candidate under the wide guard" does not imply "it is a candidate under
 * trunk", and the difference decides whether 2b failing to reproduce it is a ranking problem or a
 * reachability problem.
 *
 * This dumps the source-eligible slate for one artwork and looks for the palette.
 *
 * Usage: slate-probe.ts <image> [--surface "#64b4e5"] [--top 25]
 */
import { parseArgs } from "node:util"

import sharp from "sharp"

import { apcaRawContrast } from "../../v2-3/src/internal/color.ts"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { slateForImage } from "./slate-access.ts"

sharp.concurrency(1)

const { values, positionals } = parseArgs({
	options: { surface: { type: "string" }, background: { type: "string" }, top: { type: "string", default: "25" } },
	allowPositionals: true,
	strict: true,
})
const image = await loadNativeImage(positionals[0]!)
const { slate, published } = slateForImage(image)

process.stdout.write(`published: bg=${published.treatment.background.hex} surface=${published.treatment.surface.hex}` +
	` fg=${published.treatment.foreground.hex} accent=${published.treatment.accent.hex}` +
	` ${published.treatment.gradient ? "gradient" : "flat"}\n`)
process.stdout.write(`source-eligible slate: ${slate.length} candidates\n\n`)

const wantedSurface = values.surface?.toLowerCase()
const wantedBackground = values.background?.toLowerCase()
if (wantedSurface || wantedBackground) {
	const matches = slate.filter(({ treatment }) =>
		(!wantedSurface || treatment.surface.hex.toLowerCase() === wantedSurface) &&
		(!wantedBackground || treatment.background.hex.toLowerCase() === wantedBackground))
	process.stdout.write(`candidates matching ${wantedBackground ?? "any background"} / ${wantedSurface ?? "any surface"}: ${matches.length}\n`)
	for (const entry of matches.slice(0, 20)) {
		process.stdout.write(`  rank ${String(entry.rank).padStart(5)}  bg=${entry.treatment.background.hex}` +
			` surface=${entry.treatment.surface.hex} fg=${entry.treatment.foreground.hex}` +
			` accent=${entry.treatment.accent.hex} ${entry.treatment.gradient ? "gradient" : "flat"}` +
			`  fg/surface raw ${Math.abs(apcaRawContrast(entry.treatment.foreground.rgb, entry.treatment.surface.rgb)).toFixed(1)}\n`)
	}
	// Whether the colour appears anywhere at all is the reachability question; the role it appears in
	// is a separate one, so both are reported.
	const anywhere = slate.filter(({ treatment }) => wantedSurface !== undefined && [
		treatment.background.hex, treatment.surface.hex, treatment.foreground.hex, treatment.accent.hex,
	].some((hex) => hex.toLowerCase() === wantedSurface))
	process.stdout.write(`\ncandidates carrying ${wantedSurface} in ANY role: ${anywhere.length}\n`)
	process.stdout.write("\n")
}

process.stdout.write(`top ${values.top} of the slate by ranking:\n`)
for (const entry of [...slate].sort((a, b) => a.rank - b.rank).slice(0, Number(values.top))) {
	process.stdout.write(`  rank ${String(entry.rank).padStart(5)}  bg=${entry.treatment.background.hex}` +
		` surface=${entry.treatment.surface.hex} fg=${entry.treatment.foreground.hex}` +
		` accent=${entry.treatment.accent.hex} ${entry.treatment.gradient ? "gradient" : "flat"}` +
		`  fg/surface raw ${Math.abs(apcaRawContrast(entry.treatment.foreground.rgb, entry.treatment.surface.rgb)).toFixed(1)}\n`)
}

/** Every distinct field the slate offers, which is the set 2b can choose among. */
const fields = new Map<string, number>()
for (const entry of slate) {
	const key = `${entry.treatment.background.hex}->${entry.treatment.surface.hex}${entry.treatment.gradient ? " gradient" : " flat"}`
	fields.set(key, Math.min(fields.get(key) ?? Infinity, entry.rank))
}
process.stdout.write(`\ndistinct fields in the slate: ${fields.size}\n`)
for (const [field, rank] of [...fields.entries()].sort((a, b) => a[1] - b[1]).slice(0, 15)) {
	process.stdout.write(`  best rank ${String(rank).padStart(5)}  ${field}\n`)
}
