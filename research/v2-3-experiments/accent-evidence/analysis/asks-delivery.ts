/**
 * Publishes on the standing ask class — the only success metric this arm was given.
 *
 * Extracts each ask's artwork with whatever the two arm constants currently say (see
 * `with-arm.sh`) and reports the published accent against the reviewer's prescription. Writes one
 * JSON per configuration so configurations can be diffed without re-extracting.
 *
 *   sh with-arm.sh <channel> <reservation> node --no-warnings --experimental-strip-types \
 *      research/v2-3-experiments/accent-evidence/analysis/asks-delivery.ts <name>
 *
 * CORPUS: real artwork only, via `probe.ts::resolveArtwork` (shared checkout; refuses decoys).
 */
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import sharp from "sharp"
import { extractPalette } from "../../../v2-3/index.ts"
import { ACCENT_EVIDENCE_CHANNEL, CHROMATIC_CANDIDACY_RESERVATION } from "../../../v2-3/src/internal/palette-core.ts"
import { loadNativeImage } from "../../../v2-3/src/internal/native-resolution-image.ts"
import { rgbToOKLab, okDistance } from "../../../v2-3/src/internal/color.ts"
import { resolveArtwork, hexToRgb } from "./probe.ts"
import { SALIENCE } from "./salience-set.ts"

sharp.concurrency(1)

const name = process.argv[2] ?? "run"
/** Re-derived from the live warehouse by `standing-asks.ts` at arm start (287 records). */
const SUPERSEDED = new Set([132, 135, 178, 240])
const MANDATE = new Set([96, 102, 140, 164, 175, 205, 216])
const OUT_OF_SCOPE = new Set([209, 210])

/** The repo's own `sameColor` bar, in CIE76 over sRGB — the bar the brief names. */
function cie76(a: readonly number[], b: readonly number[]): number {
	// convert both through the same path the repo uses for its ΔE reporting: OKLab distance is the
	// algorithm's metric, but the brief's bar is CIE76 < 3.3, so use Lab.
	const toLab = (rgb: readonly number[]): [number, number, number] => {
		const f = (v: number) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
		const [r, g, bl] = [f(rgb[0]), f(rgb[1]), f(rgb[2])]
		const X = (0.4124 * r + 0.3576 * g + 0.1805 * bl) / 0.95047
		const Y = 0.2126 * r + 0.7152 * g + 0.0722 * bl
		const Z = (0.0193 * r + 0.1192 * g + 0.9505 * bl) / 1.08883
		const h = (t: number) => t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29
		const [fx, fy, fz] = [h(X), h(Y), h(Z)]
		return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
	}
	const [la, aa, ba] = toLab(a), [lb, ab, bb] = toLab(b)
	return Math.hypot(la - lb, aa - ab, ba - bb)
}

const seen = new Map<string, any>()
const rows: any[] = []
for (const kase of SALIENCE) {
	const path = resolveArtwork(kase.image)
	if (!path) { rows.push({ idx: kase.idx, error: "unresolved" }); continue }
	let extraction = seen.get(kase.image)
	if (extraction === undefined) {
		const image = await loadNativeImage(path)
		extraction = extractPalette(image)
		seen.set(kase.image, extraction)
	}
	const p = extraction.winner
	const accentHex: string = p.accent.hex
	const askRgb = hexToRgb(kase.prescribed)
	const gotRgb = hexToRgb(accentHex)
	const deltaE = cie76(askRgb, gotRgb)
	const okd = okDistance(rgbToOKLab(askRgb), rgbToOKLab(gotRgb))
	const publishedRgb = hexToRgb(kase.published)
	const row = {
		idx: kase.idx, image: kase.image,
		standing: !SUPERSEDED.has(kase.idx), mandate: MANDATE.has(kase.idx), outOfScope: OUT_OF_SCOPE.has(kase.idx),
		ask: kase.prescribed, incumbentAtAskTime: kase.published,
		background: p.background.hex, surface: p.surface.hex, foreground: p.foreground.hex, accent: accentHex,
		gradient: p.gradient, collapse: p.collapse,
		midpoint: extraction.researchRender?.field.stops[1] && "hex" in extraction.researchRender.field.stops[1] ? extraction.researchRender.field.stops[1].hex : null,
		deltaEToAsk: deltaE, okDistanceToAsk: okd,
		delivered: deltaE < 3.3,
		baselineDeltaE: cie76(askRgb, publishedRgb),
	}
	rows.push(row)
	process.stdout.write(`idx ${String(kase.idx).padStart(3)} ${kase.image.slice(16, 24)} ` +
		`${row.standing ? "STAND" : "super"}${row.mandate ? "*" : " "} ask ${kase.prescribed} got ${accentHex} ` +
		`dE ${deltaE.toFixed(1).padStart(5)} ${row.delivered ? "DELIVERED" : ""}\n`)
}

const consider = rows.filter((r) => r.standing && !r.outOfScope)
const mandate = rows.filter((r) => r.mandate)
process.stdout.write(`\n[${name}] channel=${ACCENT_EVIDENCE_CHANNEL} reservation=${CHROMATIC_CANDIDACY_RESERVATION}\n`)
process.stdout.write(`mandate asks delivered: ${mandate.filter((r) => r.delivered).length}/${mandate.length} ` +
	`(distinct artworks ${new Set(mandate.filter((r) => r.delivered).map((r) => r.image)).size}/${new Set(mandate.map((r) => r.image)).size})\n`)
process.stdout.write(`standing in-scope delivered: ${consider.filter((r) => r.delivered).length}/${consider.length}\n`)
writeFileSync(resolve(import.meta.dirname, `asks-${name}.json`),
	JSON.stringify({ name, channel: ACCENT_EVIDENCE_CHANNEL, reservation: CHROMATIC_CANDIDACY_RESERVATION, rows }, null, "\t") + "\n")
