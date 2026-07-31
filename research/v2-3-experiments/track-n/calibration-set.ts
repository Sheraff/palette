/**
 * The 12 decisive verdicts from batches 17 and 18, with every evidence measure the runtime
 * carries for the rival accent's family — so the separating rule is found by measurement rather
 * than guessed.
 *
 * FLIP   the reviewer preferred the vivid side
 * HOLD   the reviewer preferred the incumbent
 * (cases where neither side was preferred are omitted: they constrain nothing)
 *
 * usage: calibration-set.ts
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

export const CALIBRATION: ReadonlyArray<Readonly<{ image: string; want: "FLIP" | "HOLD"; accent: string; note?: string }>> = [
	// batch 17 — vivid preferred
	{ image: "08/ab67616d00001e0200087b1314ac8e17bc1c6916", want: "FLIP", accent: "#f94a2f" },
	{ image: "06/ab67616d00001e020006eb2197bdb0a7b9392108", want: "FLIP", accent: "#fcdd44" },
	{ image: "0e/ab67616d00001e02000e229142cb6dbae156341c", want: "FLIP", accent: "#f5f652" },
	{ image: "0a/ab67616d00001e02000a8aa1dafa651976a7bb44", want: "FLIP", accent: "#fbf809" },
	{ image: "0b/ab67616d00001e02000b87c4345d251dd50300f8", want: "FLIP", accent: "#9e0d2e" },
	{ image: "0d/ab67616d00001e02000d457f4b8829a59481e78b", want: "FLIP", accent: "#df241d" },
	{ image: "02/ab67616d0000b2730002dc280ccc28cadb7d4ae4.jpg", want: "FLIP", accent: "#ea64bb" },
	// batch 18 — incumbent preferred
	{ image: "05/ab67616d0000b273000531830819a9db4885e928", want: "HOLD", accent: "#f51702", note: "provenance: label icon in the corner" },
	{ image: "0a/ab67616d0000b273000a392cb5a08d9801562845", want: "HOLD", accent: "#0626f7" },
	{ image: "08/ab67616d0000b2730008601958194a047b8e75a3", want: "HOLD", accent: "#f34e2e", note: "fragment: 2 components" },
	{ image: "05/ab67616d00001e020005a54a9ea60f48619788f1", want: "HOLD", accent: "#fd645f", note: "same-hue intensification" },
	{ image: "01/ab67616d0000b27300014fb430dd1b693e653121.jpg", want: "HOLD", accent: "#4bca23" },
]

const chromaOf = ([, a, b]: readonly number[]): number => Math.hypot(a, b)
const hueDegrees = ([, a, b]: readonly number[]): number => Math.atan2(b, a) * 180 / Math.PI
function hueGap(first: readonly number[], second: readonly number[]): number {
	const d = Math.abs(hueDegrees(first) - hueDegrees(second))
	return d > 180 ? 360 - d : d
}

console.log("want  case                      | rival: pop%   chroma  mark   obs/tot markC | cohere spread corner center border | hueGapIncumbent  incumbent pop% chroma")
for (const entry of CALIBRATION) {
	const image = await loadNativeImage(`${ROOT}/${entry.image}`)
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
	const rival = ranked.find((e) => {
		const t = e.treatment
		return t.background.hex === w.background.hex && t.surface.hex === w.surface.hex &&
			t.foreground.hex === w.foreground.hex && t.gradient === w.gradient &&
			t.accent.hex.toLowerCase() === entry.accent.toLowerCase()
	})
	if (!rival) { console.log(`${entry.want}  ${entry.image.slice(0, 26)} -- rival not on slate`); continue }
	const family = byId.get(rival.treatment.familyRoles.accent)!
	const incumbent = byId.get(w.familyRoles.accent)
	console.log(
		`${entry.want}  ${entry.image.slice(0, 26)} | ` +
		`${(family.populationFraction * 100).toFixed(3).padStart(6)} ${chromaOf(rival.treatment.accent.oklab).toFixed(3)} ` +
		`${family.markSupport.toFixed(3)} ${String(family.observedComponentCount).padStart(3)}/${String(family.componentCount).padEnd(4)} ` +
		`${String(family.markComponentCount).padStart(3)} | ` +
		`${family.familyConcentration.toFixed(3)} ${family.spatialSpread.toFixed(3)} ${family.cornerCoverage.toFixed(2)} ` +
		`${family.centerCoverage.toFixed(2)} ${family.borderCoverage.toFixed(2)} | ` +
		`${hueGap(rival.treatment.accent.oklab, w.accent.oklab).toFixed(0).padStart(3)}deg  ` +
		`${((incumbent?.populationFraction ?? 0) * 100).toFixed(2).padStart(6)} ${chromaOf(w.accent.oklab).toFixed(3)}` +
		`${entry.note ? `  <- ${entry.note}` : ""}`)
}
