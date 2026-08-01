/**
 * What is actually tied at the smallest change, and how does each tie-break order them?
 *
 * Review chose "smallest change" on the founding artwork, but several candidates change the same
 * number of role colours and the tie-break decides which one is published. This lists them so the
 * tie-break is chosen against the palette review actually picked rather than guessed at.
 *
 * Usage: tiebreak-probe.ts <image>
 */
import sharp from "sharp"

import { apcaRawContrast } from "../../v2-3/src/internal/color.ts"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { rolePairIsUnreadable } from "../../v2-3/src/internal/palette-core.ts"

import { slateForImage } from "./slate-access.ts"

sharp.concurrency(1)

const image = await loadNativeImage(process.argv[2]!)
const { slate, published } = slateForImage(image)
const winner = published.treatment

const disturbance = (t: typeof winner) =>
	(t.background.hex === winner.background.hex ? 0 : 1) +
	(t.surface.hex === winner.surface.hex ? 0 : 1) +
	(t.foreground.hex === winner.foreground.hex ? 0 : 1) +
	(t.accent.hex === winner.accent.hex ? 0 : 1)

// The fg-surface configuration: foreground must read on the surface, and nothing may newly break.
const clean = (t: typeof winner) => {
	if (!t.collapse.surface && rolePairIsUnreadable(t.foreground.rgb, t.surface.rgb)) return false
	if (rolePairIsUnreadable(t.foreground.rgb, t.background.rgb)) return false
	if (!t.collapse.accent && !t.collapse.surface && rolePairIsUnreadable(t.accent.rgb, t.surface.rgb)) return false
	if (!t.collapse.accent && rolePairIsUnreadable(t.accent.rgb, t.background.rgb)) return false
	return true
}

const differentField = slate.filter(({ treatment }) =>
	!(treatment.background.hex === winner.background.hex &&
		treatment.surface.hex === winner.surface.hex &&
		treatment.gradient === winner.gradient) && clean(treatment))

process.stdout.write(`trunk: bg=${winner.background.hex} surface=${winner.surface.hex}` +
	` fg=${winner.foreground.hex} accent=${winner.accent.hex} ${winner.gradient ? "gradient" : "flat"}\n`)
process.stdout.write(`clean candidates on a different field: ${differentField.length}\n\n`)

const smallest = Math.min(...differentField.map(({ treatment }) => disturbance(treatment)))
const tied = differentField.filter(({ treatment }) => disturbance(treatment) === smallest)
process.stdout.write(`smallest change = ${smallest} of 4 roles; ${tied.length} candidate(s) tied there:\n\n`)
for (const entry of [...tied].sort((a, b) => a.rank - b.rank)) {
	const t = entry.treatment
	const cardinality = new Set([t.background.hex, t.surface.hex, t.foreground.hex, t.accent.hex]).size
	process.stdout.write(`  rank ${String(entry.rank).padStart(5)}  bg=${t.background.hex} surface=${t.surface.hex}` +
		` fg=${t.foreground.hex} accent=${t.accent.hex} ${t.gradient ? "gradient" : "flat"}\n`)
	process.stdout.write(`  ${" ".repeat(11)}  colours=${cardinality}` +
		`${t.collapse.surface ? " SURFACE-COLLAPSED" : ""}${t.collapse.accent ? " accent-collapsed" : ""}` +
		`  fg/surface raw ${Math.abs(apcaRawContrast(t.foreground.rgb, t.surface.rgb)).toFixed(1)}\n`)
}
