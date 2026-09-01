/**
 * Legal-slate treatment finder (adopted verbatim from `track-o/find-treatment.ts`).
 *
 * Enumerates the scored treatments for one artwork and ranks those matching a
 * requested arrangement, so a review alternate can be drawn from the candidate
 * set the objective actually produced rather than hand-written. "Legal" here
 * means: this exact treatment was materialized and scored by the unmodified
 * runtime, so it is an arrangement the algorithm could have chosen.
 *
 * Read-only. Images come from PALETTE_IMAGES_ROOT (charter, "Corpus trap").
 *
 * usage: find-treatment.ts <image> --want <bg,sf,fg,ac hexes, "*" for any> [--top N]
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
if (!target) throw new Error("usage: find-treatment.ts <image> --want bg,sf,fg,ac [--top N]")
const wantIndex = process.argv.indexOf("--want")
const want = (wantIndex > 0 ? process.argv[wantIndex + 1] : "*,*,*,*").split(",")
const topIndex = process.argv.indexOf("--top")
const top = topIndex > 0 ? Number(process.argv[topIndex + 1]) : 10

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

const okDistance = (a: readonly number[], b: readonly number[]): number =>
	Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!)
const hexToOklab = (hex: string): readonly number[] | null => {
	const found = scored.evaluations.find((e) =>
		[e.treatment.background, e.treatment.surface, e.treatment.foreground, e.treatment.accent]
			.find((c) => c.hex === hex))
	if (!found) return null
	for (const c of [found.treatment.background, found.treatment.surface, found.treatment.foreground, found.treatment.accent]) {
		if (c.hex === hex) return c.oklab
	}
	return null
}

const roles = ["background", "surface", "foreground", "accent"] as const
const wantLab = want.map((hex) => hex === "*" ? null : hexToOklab(hex))

console.log(`${target}  ${scored.evaluations.length} scored treatments`)
const w = scored.winner
console.log(`winner: ${w.background.hex} ${w.surface.hex} ${w.foreground.hex} ${w.accent.hex} ${w.gradient ? "grad" : "flat"}`)
console.log(`want:   ${want.join(" ")}\n`)

const ranked = scored.evaluations
	.map((e) => {
		let distance = 0
		for (const [index, role] of roles.entries()) {
			const wanted = wantLab[index]
			if (want[index] === "*") continue
			if (e.treatment[role].hex === want[index]) continue
			if (!wanted) return null
			distance += okDistance(e.treatment[role].oklab, wanted)
		}
		return { e, distance }
	})
	.filter((row): row is { e: typeof scored.evaluations[number]; distance: number } => row !== null)
	.sort((a, b) => a.distance - b.distance || b.e.relationUtility - a.e.relationUtility)

for (const { e, distance } of ranked.slice(0, top)) {
	const t = e.treatment
	console.log(`d=${distance.toFixed(4)}  ${t.background.hex} ${t.surface.hex} ${t.foreground.hex} ${t.accent.hex} ` +
		`${t.gradient ? "grad" : "flat"} collapse=[${t.collapse.surface},${t.collapse.accent}]  ` +
		`rel=${e.relationUtility.toFixed(4)} qual=${e.qualityUtility.toFixed(4)}`)
}
