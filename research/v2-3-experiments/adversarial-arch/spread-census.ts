/**
 * Census of `scores.endpointBandSpread` across the materialized candidate domain,
 * grouped by the source of the field hypothesis.
 *
 * `FieldHypothesis.endpointBandSpread` (palette-core.ts:317-322) is documented as
 * "Absent for flat hypotheses, which have no band". It is in fact also absent for
 * every *gradient* hypothesis that does not come from `buildFieldHypothesisProposalsFromEvaluatedFits`
 * — `field-transition.ts:799-816` (native-field-transition) and
 * `candidate-domain.ts:94-144` (band-local-endpoint) both build gradient
 * hypotheses without it. `buildFieldVariants`' `bandSpreadOf` (palette-core.ts:2654)
 * then returns 0, which `dominates` and `compareEvaluations` (winner-scoring.ts:610, 676)
 * cannot distinguish from a measured zero.
 *
 *   node --no-warnings --experimental-strip-types \
 *     research/v2-3-experiments/adversarial-arch/spread-census.ts [image...]
 */
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, constructAlbumArtworkPaletteV2Phase3SupplementalTreatments } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import type { AlbumArtworkPaletteV2Phase3LogicalDescriptor, AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis } from "../../v2-3/src/internal/candidate-domain.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"
import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "../../v2-3/src/internal/transition-normalization.ts"

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url))
const DEFAULT_IMAGES = ["birdsofprey.jpg", "loups.jpg", "horsley.jpg", "orelsan.jpg", "muse.jpg", "infected.jpg",
	"placebo.jpg", "havana.jpg", "doja.jpg", "once.jpg", "slim.jpg"]

function sourceOf(hypothesisId: string): string {
	if (hypothesisId.startsWith("gradient:")) return "seed gradient fit"
	if (hypothesisId.startsWith("endpoint-refinement:")) return "band-local-endpoint"
	if (hypothesisId.startsWith("native-transition")) return "native-field-transition"
	return hypothesisId.split(":")[0]
}

const names = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_IMAGES
const totals = new Map<string, { candidates: number; zero: number }>()

for (const name of names) {
	const image = await loadNativeImage(await readFile(resolve(repositoryRoot, "images", name)))
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(buildPaletteSeedDomain(image))
	// Mirrors palette.ts:309-341 so the supplemental (transition / band-local-endpoint)
	// candidates are present, not only the seed ones.
	const envelope = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(common.evidence.nativeFieldTransitions)
	const normalizedById = new Map(envelope.hypotheses.map((hypothesis) => [hypothesis.id, hypothesis]))
	const candidateFields: AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[] = common.fieldHypotheses.map((field) =>
		field.sourceType === "native-field-transition"
			? { ...field, hypothesis: normalizedById.get(field.hypothesis.id) ?? field.hypothesis }
			: field)
	const supplementalFields = candidateFields.filter(({ sourceType }) => sourceType !== "native-seed")
	const sourceByHypothesisId = new Map(supplementalFields.map(({ sourceType, hypothesis }) => [hypothesis.id, sourceType]))
	const supplemental = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
		common.evidence.augmentedNative,
		supplementalFields.map(({ hypothesis }) => hypothesis),
	)
	const supplementalDescriptors: AlbumArtworkPaletteV2Phase3LogicalDescriptor[] = supplemental.treatments.map((descriptor) => ({
		sourceType: sourceByHypothesisId.get(descriptor.fieldHypothesis.id)!,
		...descriptor,
	}))
	const materialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
		[...common.seedAvailability.logicalDescriptors, ...supplementalDescriptors],
		common.seedAvailability.identityObligations,
	)
	const perImage = new Map<string, { candidates: number; zero: number }>()
	for (const { treatment } of materialization.materialized) {
		if (!treatment.gradient) continue
		const source = sourceOf(treatment.sourceFieldHypothesisId)
		for (const bucket of [perImage, totals]) {
			const entry = bucket.get(source) ?? { candidates: 0, zero: 0 }
			entry.candidates += 1
			if (treatment.scores.endpointBandSpread === 0) entry.zero += 1
			bucket.set(source, entry)
		}
	}
	const summary = [...perImage].map(([source, { candidates, zero }]) =>
		`${source}: ${candidates - zero}/${candidates} carry a spread`).join("; ")
	console.log(`${name.padEnd(18)} ${summary || "no gradient candidates"}`)
}

console.log("\n== all images ==")
for (const [source, { candidates, zero }] of [...totals].sort()) {
	console.log(`${source.padEnd(26)} ${candidates - zero}/${candidates} gradient candidates carry a nonzero endpointBandSpread`)
}
