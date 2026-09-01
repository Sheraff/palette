/**
 * Replay the candidate pipeline for one artwork and dump the scored treatments,
 * so the winner's margin over a rival can be attributed axis by axis.
 *
 * Read-only: it re-runs the same exported entry points `palette.ts` uses.
 *
 * usage: inspect-treatments.ts <image> [--fg <hexprefix>] [--top N]
 */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, DEFAULT_PALETTE_EXTRACTION_OPTIONS } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "../../v2-3/src/internal/transition-normalization.ts"
import { constructAlbumArtworkPaletteV2Phase3SupplementalTreatments } from "../../v2-3/src/internal/palette-core.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"
import { buildRoleEvidence } from "../../v2-3/src/internal/role-evidence.ts"
import { scorePaletteCandidates } from "../../v2-3/src/internal/winner-scoring.ts"
import type { AlbumArtworkPaletteV2Phase3LogicalDescriptor, AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis } from "../../v2-3/src/internal/candidate-domain.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"
const target = process.argv[2]
if (!target) throw new Error("usage: inspect-treatments.ts <image> [--fg hex] [--top N]")
const fgIndex = process.argv.indexOf("--fg")
const fgFilter = fgIndex > 0 ? process.argv[fgIndex + 1] : null
const topIndex = process.argv.indexOf("--top")
const top = topIndex > 0 ? Number(process.argv[topIndex + 1]) : 12

const image = await loadNativeImage(`${ROOT}/${target}`)
const options = DEFAULT_PALETTE_EXTRACTION_OPTIONS
const seed = buildPaletteSeedDomain(image, options)
const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
const envelope = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(common.evidence.nativeFieldTransitions)
const normalizedById = new Map(envelope.hypotheses.map((h) => [h.id, h]))
const candidateFields: AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[] = common.fieldHypotheses.map((field) =>
	field.sourceType === "native-field-transition"
		? { ...field, hypothesis: normalizedById.get(field.hypothesis.id) ?? field.hypothesis }
		: field)
const supplementalFields = candidateFields.filter(({ sourceType }) => sourceType !== "native-seed")
const sourceByHypothesisId = new Map(supplementalFields.map(({ sourceType, hypothesis }) => [hypothesis.id, sourceType]))
const supplemental = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
	common.evidence.augmentedNative,
	supplementalFields.map(({ hypothesis }) => hypothesis),
	options,
)
const supplementalDescriptors: AlbumArtworkPaletteV2Phase3LogicalDescriptor[] = supplemental.treatments.map((d) => ({
	sourceType: sourceByHypothesisId.get(d.fieldHypothesis.id)!,
	...d,
}))
const materialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
	[...common.seedAvailability.logicalDescriptors, ...supplementalDescriptors],
	common.seedAvailability.identityObligations,
)
const roleEvidence = buildRoleEvidence(
	common.evidence.augmentedNative,
	[...common.seedAvailability.fieldHypotheses, ...supplemental.hypotheses.map((hypothesis) => ({
		sourceType: sourceByHypothesisId.get(hypothesis.id)!,
		hypothesis,
	}))].map(({ hypothesis }) => hypothesis),
	common.seedAvailability.identityObligations.map(({ familyId }) => familyId),
)
const scored = scorePaletteCandidates(
	materialization.materialized.map(({ treatment }) => treatment),
	{ obligations: common.seedAvailability.identityObligations, roleRequirements: roleEvidence.requirements },
)

console.log(`${target}  ${scored.evaluations.length} scored treatments`)
console.log(`identity obligations: ${common.seedAvailability.identityObligations.map((o) => `${o.familyId}@p${(o as { priority?: number }).priority ?? "?"}`).join(", ")}`)
const w = scored.winner
console.log(`unrestricted winner: ${w.background.hex} ${w.surface.hex} ${w.foreground.hex} ${w.accent.hex} ${w.gradient ? "grad" : "flat"}\n`)

const axes = Object.keys(scored.evaluations[0].quality) as (keyof typeof scored.evaluations[0]["quality"])[]
console.log(`axes: ${axes.join(" ")}\n`)

const ranked = [...scored.evaluations].sort((a, b) =>
	b.relationUtility - a.relationUtility || b.qualityUtility - a.qualityUtility)
const shown = fgFilter
	? ranked.filter((e) => e.treatment.foreground.hex.startsWith(fgFilter)).slice(0, top)
	: ranked.slice(0, top)

for (const e of shown) {
	const t = e.treatment
	console.log(`${t.background.hex} ${t.surface.hex} fg=${t.foreground.hex} ac=${t.accent.hex} ${t.gradient ? "grad" : "flat"}  rel=${e.relationUtility.toFixed(4)} qual=${e.qualityUtility.toFixed(4)} idCov=${e.identityCoverage.toFixed(3)} idGain=${e.identityGain.toFixed(4)} pareto=${e.paretoMember}`)
	console.log(`    ${axes.map((a) => `${a}=${(e.quality[a] as number).toFixed(3)}`).join(" ")}`)
}

// Best treatment per distinct foreground hex, to see where a target foreground tops out.
console.log("\n=== best treatment per foreground hex (top 12 by relationUtility)")
const bestByFg = new Map<string, typeof ranked[number]>()
for (const e of ranked) if (!bestByFg.has(e.treatment.foreground.hex)) bestByFg.set(e.treatment.foreground.hex, e)
for (const [hex, e] of [...bestByFg].sort((a, b) => b[1].relationUtility - a[1].relationUtility).slice(0, 12)) {
	console.log(`fg=${hex}  ac=${e.treatment.accent.hex} bg=${e.treatment.background.hex} sf=${e.treatment.surface.hex}  rel=${e.relationUtility.toFixed(4)} qual=${e.qualityUtility.toFixed(4)} idGain=${e.identityGain.toFixed(4)}`)
}
