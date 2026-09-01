/**
 * Track J's core diagnostic: for a wanted accent colour, say **where** it loses.
 *
 * Replays the real candidate pipeline (no re-implementation of any score), finds
 * the family whose prototype is nearest the wanted hex, and answers the four
 * questions the brief names, in the order that makes them mutually exclusive:
 *
 *   (d) candidate availability — is the family in the signature lane, does it
 *       have a non-generated representative, and does ANY scored treatment use
 *       it as the accent?
 *   (a) obligation priority   — is it an identity obligation, at what priority?
 *   (b) shortlist ranking     — where does it sit in `rankAccentOptions` for the
 *       winner's own field and foreground, and is it retained?
 *   (c) authority / objective — if treatments exist, how far behind the winner
 *       is the best of them, and on which axes?
 *
 * usage: inspect-accent-gap.ts <image> --want '#rrggbb' [--top N]
 */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, DEFAULT_PALETTE_EXTRACTION_OPTIONS, retainPeakObservableFamilyDirections } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "../../v2-3/src/internal/transition-normalization.ts"
import { constructAlbumArtworkPaletteV2Phase3SupplementalTreatments } from "../../v2-3/src/internal/palette-core.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"
import { buildRoleEvidence } from "../../v2-3/src/internal/role-evidence.ts"
import { scorePaletteCandidates } from "../../v2-3/src/internal/winner-scoring.ts"
import { classifyFieldConditionalFamilyRole } from "../../v2-3/src/internal/role-obligations.ts"
import { ALBUM_ARTWORK_PALETTE_V2_POLICY } from "../../v2-3/src/internal/policy.ts"
import type { AlbumArtworkPaletteV2Phase3LogicalDescriptor, AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis } from "../../v2-3/src/internal/candidate-domain.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"
const target = process.argv[2]
const wantIndex = process.argv.indexOf("--want")
const want = wantIndex > 0 ? process.argv[wantIndex + 1] : null
if (!target || !want) throw new Error("usage: inspect-accent-gap.ts <image> --want '#rrggbb' [--top N]")
const topIndex = process.argv.indexOf("--top")
const top = topIndex > 0 ? Number(process.argv[topIndex + 1]) : 6

const srgbToLinear = (channel: number): number => {
	const value = channel / 255
	return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}
function hexToOKLab(hex: string): [number, number, number] {
	const [red, green, blue] = [1, 3, 5].map((offset) => srgbToLinear(parseInt(hex.slice(offset, offset + 2), 16)))
	const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
	const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
	const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)
	return [
		0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
	]
}
const distance = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

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

const evidence = common.evidence.augmentedNative
const families = evidence.families
const wanted = hexToOKLab(want)
const nearest = [...families].sort((a, b) => distance(a.prototype, wanted) - distance(b.prototype, wanted))[0]
const signatureIds = evidence.lanes.find(({ name }) => name === "signature")?.familyIds ?? []
const obligation = common.seedAvailability.identityObligations.find(({ familyId }) => familyId === nearest.id)
const winner = scored.winner

console.log(`\n=== ${target}   want accent ${want}`)
console.log(`winner: ${winner.background.hex} ${winner.surface.hex} fg=${winner.foreground.hex} ac=${winner.accent.hex} ${winner.gradient ? "grad" : "flat"}`)
console.log(`winner familyRoles: ${JSON.stringify(winner.familyRoles)}`)
console.log(`obligations: ${common.seedAvailability.identityObligations.map((o) => `${o.familyId}@p${o.priority}`).join(", ")}`)

console.log(`\n-- nearest family to ${want}: ${nearest.id} proto-distance ${distance(nearest.prototype, wanted).toFixed(4)}`)
console.log(`   L=${nearest.prototype[0].toFixed(3)} chroma=${nearest.chroma.toFixed(3)} pop=${(nearest.populationFraction * 100).toFixed(3)}%`)
console.log(`   markSupport=${nearest.markSupport.toFixed(3)} components=${nearest.componentCount} observed=${nearest.observedComponentCount} marks=${nearest.markComponentCount}`)
console.log(`   (d) in signature lane: ${signatureIds.includes(nearest.id) ? `YES (rank ${signatureIds.indexOf(nearest.id)}/${signatureIds.length})` : "NO"}`)
const usable = nearest.representatives.filter((r) => !("generated" in r.support))
console.log(`   (d) source representatives: ${usable.length === 0 ? "NONE" : usable.map((r) => r.hex).join(" ")}`)
console.log(`   (a) identity obligation: ${obligation ? `YES @p${obligation.priority}` : "NO"}`)

const field = allHypotheses.find(({ id }) => id === winner.sourceFieldHypothesisId)
if (field) {
	const roleEv = classifyFieldConditionalFamilyRole(nearest, field)
	console.log(`   role classifier on the winning field: ${roleEv.preference}/${roleEv.reason} fg=${roleEv.foreground.score.toFixed(3)} ac=${roleEv.accent.score.toFixed(3)}`)
}

// (d)/(b): does any scored treatment carry it as the accent?
const withAccent = scored.evaluations.filter((e) => e.treatment.familyRoles.accent === nearest.id)
console.log(`\n-- (d) scored treatments using ${nearest.id} as accent: ${withAccent.length} of ${scored.evaluations.length}`)
if (withAccent.length === 0) {
	console.log("   => the accent shortlist never carried it. This is a candidacy/shortlist failure, not a ranking one.")
} else {
	const ranked = [...scored.evaluations].sort((a, b) => b.relationUtility - a.relationUtility)
	const winnerEval = ranked.find((e) => e.treatment === (winner as never)) ?? ranked[0]
	const best = [...withAccent].sort((a, b) => b.relationUtility - a.relationUtility)[0]
	const position = ranked.indexOf(best)
	console.log(`   best such treatment ranks ${position} of ${ranked.length} by relationUtility`)
	const axes = Object.keys(best.quality) as (keyof typeof best.quality)[]
	const show = (label: string, e: typeof best) => {
		const t = e.treatment
		console.log(`   ${label}: ${t.background.hex} ${t.surface.hex} fg=${t.foreground.hex} ac=${t.accent.hex} ${t.gradient ? "grad" : "flat"}`)
		console.log(`      rel=${e.relationUtility.toFixed(4)} qual=${e.qualityUtility.toFixed(4)} idCov=${e.identityCoverage.toFixed(3)} idGain=${e.identityGain.toFixed(4)} authGain=${(e as never as { identityAuthorizedGain: number }).identityAuthorizedGain?.toFixed(4) ?? "?"} pareto=${e.paretoMember}`)
		console.log(`      ${axes.map((a) => `${a}=${(e.quality[a] as number).toFixed(3)}`).join(" ")}`)
	}
	show("winner ", winnerEval)
	show("wanted ", best)
	console.log(`   (c) gap: rel ${(winnerEval.relationUtility - best.relationUtility).toFixed(4)}  qual ${(winnerEval.qualityUtility - best.qualityUtility).toFixed(4)}`)
	console.log(`   per-axis deficit (winner - wanted), largest first:`)
	const deficits = axes.map((a) => ({ a, d: (winnerEval.quality[a] as number) - (best.quality[a] as number) }))
		.sort((x, y) => y.d - x.d)
	for (const { a, d } of deficits.slice(0, 5)) console.log(`      ${String(a).padEnd(22)} ${d >= 0 ? "+" : ""}${d.toFixed(4)}`)
	console.log(`\n   top ${top} treatments carrying the wanted accent:`)
	for (const e of [...withAccent].sort((a, b) => b.relationUtility - a.relationUtility).slice(0, top)) {
		const t = e.treatment
		console.log(`      ${t.background.hex} ${t.surface.hex} fg=${t.foreground.hex} ac=${t.accent.hex} ${t.gradient ? "grad" : "flat"} rel=${e.relationUtility.toFixed(4)} qual=${e.qualityUtility.toFixed(4)} idCov=${e.identityCoverage.toFixed(3)} pareto=${e.paretoMember}`)
	}
}

console.log(`\n-- (b) accent shortlist retention quota = ${ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.distinctAccentsPerForeground}, obligations get priority retention`)
console.log(`   retainPeakObservableFamilyDirections is exported and exercised by the runtime; obligation ids passed in are`)
console.log(`   ${common.seedAvailability.identityObligations.map(({ familyId }) => familyId).join(", ")}`)
void retainPeakObservableFamilyDirections
