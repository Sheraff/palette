/**
 * Compare two accent candidates that share a field and a foreground, axis by axis, with the
 * support terms underneath — so "where does the margin live" can be answered per artwork
 * instead of per corpus.
 *
 * Prints, for the winner and for every treatment that differs from it only in the accent:
 * the accent's OKLab chroma, its family's population fraction and mark evidence, the eleven
 * quality axes, and the signed per-axis margin. A vividness mechanism has to be calibrated
 * against this table, not against a single case.
 *
 * usage: inspect-accent-margin.ts <image> [--top N]
 */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, DEFAULT_PALETTE_EXTRACTION_OPTIONS, constructAlbumArtworkPaletteV2Phase3SupplementalTreatments } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "../../v2-3/src/internal/transition-normalization.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"
import { buildRoleEvidence } from "../../v2-3/src/internal/role-evidence.ts"
import { scorePaletteCandidates } from "../../v2-3/src/internal/winner-scoring.ts"
import type { AlbumArtworkPaletteV2Phase3LogicalDescriptor, AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis } from "../../v2-3/src/internal/candidate-domain.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"
const target = process.argv[2]
if (!target) throw new Error("usage: inspect-accent-margin.ts <image> [--top N]")
const topIndex = process.argv.indexOf("--top")
const top = topIndex > 0 ? Number(process.argv[topIndex + 1]) : 8

const chromaOf = ([, a, b]: readonly number[]): number => Math.hypot(a, b)

const image = await loadNativeImage(`${ROOT}/${target}`)
const options = DEFAULT_PALETTE_EXTRACTION_OPTIONS
const common = buildAlbumArtworkPaletteV2Phase3CommonBase(buildPaletteSeedDomain(image, options))
const envelope = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(common.evidence.nativeFieldTransitions)
const normalizedById = new Map(envelope.hypotheses.map((h) => [h.id, h]))
const candidateFields: AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[] = common.fieldHypotheses.map((field) =>
	field.sourceType === "native-field-transition"
		? { ...field, hypothesis: normalizedById.get(field.hypothesis.id) ?? field.hypothesis }
		: field)
const supplementalFields = candidateFields.filter(({ sourceType }) => sourceType !== "native-seed")
const sourceByHypothesisId = new Map(supplementalFields.map(({ sourceType, hypothesis }) => [hypothesis.id, sourceType]))
const supplemental = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
	common.evidence.augmentedNative, supplementalFields.map(({ hypothesis }) => hypothesis), options)
const supplementalDescriptors: AlbumArtworkPaletteV2Phase3LogicalDescriptor[] = supplemental.treatments.map((d) => ({
	sourceType: sourceByHypothesisId.get(d.fieldHypothesis.id)!, ...d,
}))
const materialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
	[...common.seedAvailability.logicalDescriptors, ...supplementalDescriptors],
	common.seedAvailability.identityObligations)
const allHypotheses = [...common.seedAvailability.fieldHypotheses, ...supplemental.hypotheses.map((hypothesis) => ({
	sourceType: sourceByHypothesisId.get(hypothesis.id)!, hypothesis,
}))].map(({ hypothesis }) => hypothesis)
const roleEvidence = buildRoleEvidence(common.evidence.augmentedNative, allHypotheses,
	common.seedAvailability.identityObligations.map(({ familyId }) => familyId))
const scored = scorePaletteCandidates(
	materialization.materialized.map(({ treatment }) => treatment),
	{ obligations: common.seedAvailability.identityObligations, roleRequirements: roleEvidence.requirements })

const byId = new Map(common.evidence.augmentedNative.families.map((f) => [f.id, f]))
const ranked = [...scored.evaluations].sort((a, b) => b.relationUtility - a.relationUtility)
const winner = ranked.find((e) => e.treatment === (scored.winner as never)) ?? ranked[0]
const w = winner.treatment
const axes = Object.keys(winner.quality) as (keyof typeof winner.quality)[]

const describe = (evaluation: typeof winner): string => {
	const t = evaluation.treatment
	const family = byId.get(t.familyRoles.accent)
	return `ac=${t.accent.hex} C=${chromaOf(t.accent.oklab).toFixed(4)} ` +
		`pop=${family ? (family.populationFraction * 100).toFixed(2) + "%" : "  -  "} ` +
		`mark=${family ? family.markSupport.toFixed(3) : "  -  "} ` +
		`rel=${evaluation.relationUtility.toFixed(4)} qual=${evaluation.qualityUtility.toFixed(4)} ` +
		`idCov=${evaluation.identityCoverage.toFixed(3)}`
}

console.log(`\n=== ${target}`)
console.log(`winner: ${w.background.hex} ${w.surface.hex} fg=${w.foreground.hex} ac=${w.accent.hex} ${w.gradient ? "grad" : "flat"}`)
console.log(`  ${describe(winner)}`)
console.log(`  ${axes.map((a) => `${a}=${(winner.quality[a] as number).toFixed(3)}`).join(" ")}`)

// treatments identical to the winner except for the accent
const rivals = ranked.filter((e) => {
	const t = e.treatment
	return t !== w &&
		t.background.hex === w.background.hex && t.surface.hex === w.surface.hex &&
		t.foreground.hex === w.foreground.hex && t.gradient === w.gradient &&
		t.accent.hex !== w.accent.hex
})
console.log(`\naccent-only rivals on the winner's own field and foreground: ${rivals.length}`)
for (const rival of rivals.slice(0, top)) {
	console.log(`\n  ${describe(rival)}`)
	const deltas = axes.map((a) => ({ a, d: (winner.quality[a] as number) - (rival.quality[a] as number) }))
		.filter(({ d }) => Math.abs(d) > 0.0005)
		.sort((x, y) => Math.abs(y.d) - Math.abs(x.d))
	console.log(`    margin qual ${(winner.qualityUtility - rival.qualityUtility).toFixed(4)} ` +
		`rel ${(winner.relationUtility - rival.relationUtility).toFixed(4)}`)
	console.log(`    ${deltas.map(({ a, d }) => `${a} ${d >= 0 ? "+" : ""}${d.toFixed(4)}`).join("  ")}`)
}
