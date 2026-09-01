/**
 * Why does an ACCENT-only channel move the FOREGROUND?
 *
 * ANSWER, measured below and NOT the one I first guessed. Two hypotheses are refuted by the numbers
 * this script prints:
 *
 *  1. *"`accentFidelity`'s `sqrt(separation(accent, foreground))` factor tilts toward the far
 *     foreground."* — No. Separation **saturates at 1.0** for all four tuples on this artwork, so
 *     that factor is identical everywhere and cannot be the cause.
 *  2. *"the good foreground paired with the new accent is not a candidate."* — No. All four
 *     (foreground, accent) pairs exist in the materialized domain, the gold-foreground/deep-red pair
 *     among them, 11 candidates deep.
 *
 * What is actually happening: the channel changes **which accent family wins**, and the foreground
 * that travels with it is chosen by axes the channel never touches. Trunk's winner was
 * (gold foreground, bright red). The channel raises the deep red's role score by +0.107 against the
 * bright red's +0.064, so every deep-red candidate gains ~0.043 more than every bright-red one and
 * the deep red takes the accent. Within the deep-red family the algorithm's own preferred
 * foreground was already the grey — that preference is trunk's, unchanged.
 *
 * The consequence is the important part: **the effect is not separable by choosing which axes read
 * the channel.** Confirmed empirically — `ACCENT_EVIDENCE_CHANNEL = "fidelity"`, which confines the
 * channel to the one axis that is purely about the accent, moves this artwork exactly the same way.
 * Any change to accent scoring re-selects the whole four-tuple.
 *
 * This prints the arithmetic for the four competing tuples on the artwork review caught.
 *
 *   node --experimental-strip-types fg-sideeffect.ts
 *
 * CORPUS: real artwork, shared checkout, via probe.ts::resolveArtwork.
 */
import sharp from "sharp"
import { buildNativePaletteEvidence } from "../../../v2-3/src/internal/palette-core.ts"
import { loadNativeImage } from "../../../v2-3/src/internal/native-resolution-image.ts"
import { okDistance, rgbToOKLab } from "../../../v2-3/src/internal/color.ts"
import { familyAccentRoleEvidence } from "../../../v2-3/src/internal/role-obligations.ts"
import { resolveArtwork, hexToRgb } from "./probe.ts"

sharp.concurrency(1)
const clamp = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0))
const MDD = 0.018

const IMAGE = "ab67616d0000b273000d5cdbc67ed815efc360ad"
/** The two tuples the warehouse has repeatedly compared on this artwork. */
const TUPLES = [
	{ name: "trunk / four-times-endorsed", foreground: "#f7de67", accent: "#f22632" },
	{ name: "arm / review rejected", foreground: "#c7c6c1", accent: "#cd1227" },
	{ name: "cross A", foreground: "#f7de67", accent: "#cd1227" },
	{ name: "cross B", foreground: "#c7c6c1", accent: "#f22632" },
]

const path = resolveArtwork(IMAGE)
if (!path) throw new Error("unresolved artwork")
const evidence = buildNativePaletteEvidence(await loadNativeImage(path))
const families = evidence.families as any[]

function own(hex: string) {
	const lab = rgbToOKLab(hexToRgb(hex))
	for (const f of families) if (f.representatives.some((r: any) => r.hex.toLowerCase() === hex.toLowerCase())) return f
	let best = Infinity, bestF: any = null
	for (const f of families) { const d = okDistance(lab, f.prototype); if (d < best) { best = d; bestF = f } }
	return bestF
}
/** trunk's `signatureAccentRoleScore` */
function trunkScore(f: any): number {
	const coherent = clamp(f.largestComponentFraction / 0.002)
	const repaired = clamp(f.signatureScore + 0.25 * (Math.max(coherent, f.markSupport) - coherent))
	return clamp(0.55 * repaired + 0.45 * f.signatureAccentObservation)
}
const armScore = (f: any) => clamp(familyAccentRoleEvidence(f).score)

process.stdout.write(`artwork ${IMAGE}\n`)
process.stdout.write(`accent family role scores:\n`)
for (const hex of ["#f22632", "#cd1227"]) {
	const f = own(hex)
	process.stdout.write(`  ${hex}  family ${String(f.id).padEnd(14)} trunk ${trunkScore(f).toFixed(4)}  arm ${armScore(f).toFixed(4)}  ` +
		`(delta ${(armScore(f) - trunkScore(f) >= 0 ? "+" : "") + (armScore(f) - trunkScore(f)).toFixed(4)})\n`)
}
process.stdout.write(`\naccentFidelity = roleScore(accentFamily) * sqrt(clamp((okDist(accent,fg) - ${MDD}) / 0.18))\n`)
process.stdout.write(`${"tuple".padEnd(30)} ${"fg".padEnd(9)} ${"accent".padEnd(9)} ${"sep".padStart(7)} ${"trunk".padStart(8)} ${"arm".padStart(8)} ${"gain".padStart(8)}\n`)
for (const t of TUPLES) {
	const f = own(t.accent)
	const sep = clamp((okDistance(rgbToOKLab(hexToRgb(t.accent)), rgbToOKLab(hexToRgb(t.foreground))) - MDD) / 0.18)
	const tr = trunkScore(f) * Math.sqrt(sep)
	const ar = armScore(f) * Math.sqrt(sep)
	process.stdout.write(`${t.name.padEnd(30)} ${t.foreground.padEnd(9)} ${t.accent.padEnd(9)} ${sep.toFixed(4).padStart(7)} ` +
		`${tr.toFixed(4).padStart(8)} ${ar.toFixed(4).padStart(8)} ${((ar - tr >= 0 ? "+" : "") + (ar - tr).toFixed(4)).padStart(8)}\n`)
}
// Which (foreground, accent) pairs actually EXIST as scored candidates? The accent shortlist is
// built per foreground and capped by `bounds.distinctAccentsPerForeground`, so a colour can be an
// offered accent under one foreground and absent under another.
const { buildPaletteSeedDomain, DEFAULT_PALETTE_EXTRACTION_OPTIONS, completeTreatmentKey } =
	await import("../../../v2-3/src/internal/palette-core.ts")
const { buildAlbumArtworkPaletteV2Phase3CommonBase } = await import("../../../v2-3/src/internal/candidate-domain.ts")
const { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } =
	await import("../../../v2-3/src/internal/transition-normalization.ts")
const { materializeAlbumArtworkPaletteV2Phase3Descriptors } =
	await import("../../../v2-3/src/internal/candidate-materialization.ts")
const { constructAlbumArtworkPaletteV2Phase3SupplementalTreatments } =
	await import("../../../v2-3/src/internal/palette-core.ts")

const image = await loadNativeImage(path)
const options = DEFAULT_PALETTE_EXTRACTION_OPTIONS
const seed = buildPaletteSeedDomain(image, options)
const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
const envelope = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(common.evidence.nativeFieldTransitions)
const byId = new Map(envelope.hypotheses.map((h: any) => [h.id, h]))
const candidateFields = common.fieldHypotheses.map((f: any) =>
	f.sourceType === "native-field-transition" ? { ...f, hypothesis: byId.get(f.hypothesis.id) ?? f.hypothesis } : f)
const supplementalFields = candidateFields.filter(({ sourceType }: any) => sourceType !== "native-seed")
const sourceByHypothesisId = new Map(supplementalFields.map(({ sourceType, hypothesis }: any) => [hypothesis.id, sourceType]))
const supplemental = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
	common.evidence.augmentedNative, supplementalFields.map(({ hypothesis }: any) => hypothesis), options)
const supplementalDescriptors = supplemental.treatments.map((d: any) =>
	({ sourceType: sourceByHypothesisId.get(d.fieldHypothesis.id), ...d }))
const materialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
	[...common.seedAvailability.logicalDescriptors, ...supplementalDescriptors] as any,
	common.seedAvailability.identityObligations)

const near = (a: string, b: string) => okDistance(rgbToOKLab(hexToRgb(a)), rgbToOKLab(hexToRgb(b))) <= MDD
process.stdout.write(`\nmaterialized candidates: ${materialization.materialized.length}\n`)
process.stdout.write(`does each (foreground, accent) pair exist as a candidate?\n`)
for (const t of TUPLES) {
	const hits = materialization.materialized.filter(({ treatment }: any) =>
		!treatment.collapse.accent &&
		near(treatment.foreground.hex, t.foreground) && near(treatment.accent.hex, t.accent))
	process.stdout.write(`  ${t.name.padEnd(30)} fg ${t.foreground} accent ${t.accent}  ->  ${hits.length} candidate(s)\n`)
}

