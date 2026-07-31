/**
 * Track A ranking diagnostic.
 *
 * Rebuilds the v2-3 candidate domain for one image (mirroring
 * `research/v2-3/src/internal/palette.ts:extractPaletteDetails` up to
 * `scorePaletteCandidates`) and dumps the ranked winner evaluations with their
 * per-axis quality, so the reviewed "a better candidate existed but lost"
 * claims can be checked against the actual numbers.
 *
 * This file is an experiment harness. It is intentionally outside `research/v2-3`.
 *
 * Usage:
 *   node research/v2-3-experiments/track-a/diagnose.ts <case.jpg> [--top 12] [--grep <hex or family substring>]
 */

import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, constructAlbumArtworkPaletteV2Phase3SupplementalTreatments } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "../../v2-3/src/internal/transition-normalization.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"
import { scorePaletteCandidates, WINNER_QUALITY_AXES } from "../../v2-3/src/internal/winner-scoring.ts"

import type { AlbumArtworkPaletteV2Phase3LogicalDescriptor, AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis } from "../../v2-3/src/internal/candidate-domain.ts"

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url))
const imagesRoot = process.env.PALETTE_IMAGES_ROOT ?? resolve(repoRoot, "images")

async function scoreCase(caseId: string) {
	const bytes = new Uint8Array(await readFile(resolve(imagesRoot, caseId)))
	const image = await loadNativeImage(bytes)
	const seed = buildPaletteSeedDomain(image)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
	const transitionEnvelope = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(
		common.evidence.nativeFieldTransitions,
	)
	const normalizedTransitionById = new Map(transitionEnvelope.hypotheses.map((hypothesis) => [hypothesis.id, hypothesis]))
	const candidateFields: AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[] = common.fieldHypotheses.map((field) =>
		field.sourceType === "native-field-transition"
			? { ...field, hypothesis: normalizedTransitionById.get(field.hypothesis.id) ?? field.hypothesis }
			: field)
	const supplementalFields = candidateFields.filter(({ sourceType }) => sourceType !== "native-seed")
	const sourceByHypothesisId = new Map(supplementalFields.map(({ sourceType, hypothesis }) => [hypothesis.id, sourceType]))
	const supplemental = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
		common.evidence.augmentedNative,
		supplementalFields.map(({ hypothesis }) => hypothesis),
	)
	const supplementalDescriptors: AlbumArtworkPaletteV2Phase3LogicalDescriptor[] = supplemental.treatments.map((descriptor) => {
		const sourceType = sourceByHypothesisId.get(descriptor.fieldHypothesis.id)
		if (!sourceType) throw new Error("Supplemental candidate source is missing")
		return { sourceType, ...descriptor }
	})
	const materialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
		[...common.seedAvailability.logicalDescriptors, ...supplementalDescriptors],
		common.seedAvailability.identityObligations,
	)
	const scored = scorePaletteCandidates(
		materialization.materialized.map(({ treatment }) => treatment),
		{ obligations: common.seedAvailability.identityObligations },
	)
	return { common, scored }
}

async function main(): Promise<void> {
	const [caseId, ...rest] = process.argv.slice(2)
	if (!caseId) throw new Error("usage: diagnose.ts <case.jpg>")
	const readFlag = (name: string): string | null => {
		const index = rest.indexOf(name)
		return index >= 0 && index + 1 < rest.length ? rest[index + 1] : null
	}
	const argvHas = (name: string): boolean => rest.includes(name)
	const top = Number(readFlag("--top") ?? 12)
	const grep = readFlag("--grep")
	const { common, scored } = await scoreCase(caseId)

	console.log(`obligations: ${common.seedAvailability.identityObligations
		.map(({ familyId, priority }) => `${familyId}@${priority}`).join(", ") || "(none)"}`)
	const families = [...common.evidence.native.families]
		.sort((first, second) => second.populationFraction - first.populationFraction)
		.slice(0, 10)
	console.log("top families (id, popFrac, field, signature, foreground, chroma, polarity*conf):")
	for (const family of families) {
		console.log(`  ${family.id.padEnd(14)} ${family.populationFraction.toFixed(4)} f=${family.fieldScore.toFixed(3)} s=${family.signatureScore.toFixed(3)} g=${family.foregroundScore.toFixed(3)} c=${family.chroma.toFixed(3)} p=${(family.foregroundPolarityObservation.polarity * family.foregroundPolarityObservation.confidence).toFixed(3)}`)
	}

	console.log(`\nevaluations: ${scored.evaluations.length}; frontier: ${scored.evaluations.filter((e) => e.paretoMember).length}`)
	console.log(`axes: ${WINNER_QUALITY_AXES.join(" ")}`)
	const rows = scored.evaluations
		.map((evaluation, index) => ({ evaluation, index }))
		.filter(({ evaluation, index }) => index < top ||
			(grep !== null && (evaluation.key.includes(grep) || Object.values(evaluation.treatment.familyRoles).includes(grep))))
	for (const { evaluation, index } of rows) {
		const axes = WINNER_QUALITY_AXES.map((axis) => evaluation.evidenceLevels[axis].toString().padStart(3)).join(" ")
		console.log(`#${index.toString().padStart(4)} ${evaluation.paretoMember ? "P" : "."} ru=${evaluation.relationUtility.toFixed(4)} qu=${evaluation.qualityUtility.toFixed(4)} ic=${evaluation.identityCoverage.toFixed(3)} ${evaluation.key.padEnd(42)} [${axes}] ${evaluation.gradientStatus} roles=${Object.values(evaluation.treatment.familyRoles).join("/")}`)
		if (!argvHas("--role-support")) continue
		for (const role of ["background", "surface", "foreground", "accent"] as const) {
			const support = evaluation.treatment[role].support
			console.log(`        ${role.padEnd(11)} ${evaluation.treatment[role].hex} ${"generated" in support
				? "generated"
				: `density=${support.perceptualDensity.toFixed(4)} total=${support.totalSupport.toFixed(4)} connected=${support.connectedSupport.toFixed(4)} coverage=${support.spatialCoverage.toFixed(4)} concentration=${support.concentration.toFixed(4)}`}`)
		}
	}
}

await main()
