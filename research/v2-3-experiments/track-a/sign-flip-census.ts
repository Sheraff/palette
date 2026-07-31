/**
 * Counts, per image, how many materialized gradient treatments contain a signed
 * APCA sign flip across the rendered gradient samples for an active role. A flip
 * means the role crosses zero contrast somewhere inside the rendered field.
 *
 * Usage: node research/v2-3-experiments/track-a/sign-flip-census.ts <case.jpg> [...]
 */

import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, constructAlbumArtworkPaletteV2Phase3SupplementalTreatments } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "../../v2-3/src/internal/transition-normalization.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"

import type { CompletePaletteTreatment } from "../../v2-3/src/internal/palette-core.ts"
import type { AlbumArtworkPaletteV2Phase3LogicalDescriptor, AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis } from "../../v2-3/src/internal/candidate-domain.ts"

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url))
const imagesRoot = process.env.PALETTE_IMAGES_ROOT ?? resolve(repoRoot, "images")

function signAgreement(treatment: CompletePaletteTreatment, role: "foreground" | "accent"): number {
	const activeRole = role === "accent" && treatment.collapse.accent ? "foreground" : role
	const samples = treatment.contrast.pairs
		.filter((pair) => pair.role === activeRole && pair.fieldRole === "gradient-sample")
		.map(({ signedLc }) => signedLc)
		.filter((value) => Number.isFinite(value) && value !== 0)
	if (samples.length === 0) return 1
	return Math.abs(samples.reduce((sum, value) => sum + Math.sign(value), 0)) / samples.length
}

async function census(caseId: string): Promise<void> {
	const image = await loadNativeImage(new Uint8Array(await readFile(resolve(imagesRoot, caseId))))
	const seed = buildPaletteSeedDomain(image)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
	const envelope = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(common.evidence.nativeFieldTransitions)
	const normalized = new Map(envelope.hypotheses.map((hypothesis) => [hypothesis.id, hypothesis]))
	const fields: AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[] = common.fieldHypotheses.map((field) =>
		field.sourceType === "native-field-transition"
			? { ...field, hypothesis: normalized.get(field.hypothesis.id) ?? field.hypothesis }
			: field)
	const supplementalFields = fields.filter(({ sourceType }) => sourceType !== "native-seed")
	const sourceById = new Map(supplementalFields.map(({ sourceType, hypothesis }) => [hypothesis.id, sourceType]))
	const supplemental = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
		common.evidence.augmentedNative,
		supplementalFields.map(({ hypothesis }) => hypothesis),
	)
	const descriptors: AlbumArtworkPaletteV2Phase3LogicalDescriptor[] = supplemental.treatments.map((descriptor) => ({
		sourceType: sourceById.get(descriptor.fieldHypothesis.id)!,
		...descriptor,
	}))
	const materialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
		[...common.seedAvailability.logicalDescriptors, ...descriptors],
		common.seedAvailability.identityObligations,
	)
	const treatments = materialization.materialized.map(({ treatment }) => treatment)
	const gradients = treatments.filter(({ gradient }) => gradient)
	const flipped = gradients.filter((treatment) =>
		signAgreement(treatment, "foreground") < 1 || signAgreement(treatment, "accent") < 1)
	console.log(`${caseId.padEnd(16)} treatments=${treatments.length} gradient=${gradients.length} sign-flipped=${flipped.length}`)
	for (const treatment of flipped.slice(0, 5)) {
		console.log(`   ${treatment.background.hex}:${treatment.surface.hex}:${treatment.foreground.hex}:${treatment.accent.hex} fg=${signAgreement(treatment, "foreground").toFixed(2)} accent=${signAgreement(treatment, "accent").toFixed(2)}`)
	}
}

for (const caseId of process.argv.slice(2)) await census(caseId)
