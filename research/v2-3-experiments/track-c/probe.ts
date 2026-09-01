/**
 * Track C ranking probe: reproduces the v2-3 winner pipeline up to the scored candidate
 * domain, then reports how the top candidates and a role-filtered counterexample compare on
 * quality utility and identity coverage. It answers "how much identity strength would this
 * case need?" instead of guessing.
 *
 * Usage (from the repository root):
 *   node --no-warnings --experimental-strip-types research/v2-3-experiments/track-c/probe.ts \
 *     meteora --background=family-220 --foreground=family-10804 --accent=family-7277
 */

import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, constructAlbumArtworkPaletteV2Phase3SupplementalTreatments } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"
import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "../../v2-3/src/internal/transition-normalization.ts"
import { buildRoleEvidence } from "../../v2-3/src/internal/role-evidence.ts"
import { classifyFieldConditionalFamilyRole } from "../../v2-3/src/internal/role-obligations.ts"
import { scorePaletteCandidates, WINNER_QUALITY_AXES, WINNER_SCORING_POLICY } from "../../v2-3/src/internal/winner-scoring.ts"
import { filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain } from "../../v2-3/src/internal/source-eligibility.ts"
import { selectSourceEligibleWinner } from "../../v2-3/src/internal/winner-selection.ts"
import { EVAL_CASES } from "./cases.ts"

import type { AlbumArtworkPaletteV2Phase3LogicalDescriptor, AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis } from "../../v2-3/src/internal/candidate-domain.ts"
import type { WinnerEvaluation } from "../../v2-3/src/internal/winner-scoring.ts"

const trackRoot = fileURLToPath(new URL(".", import.meta.url))
const packageRoot = resolve(trackRoot, "../..")

function imagesRoot(): string {
	const configured = process.env.TRACK_C_IMAGES_ROOT
	if (configured) return configured
	const local = resolve(packageRoot, "images")
	if (existsSync(resolve(local, "johns.jpg"))) return local
	return "/Users/Flo/github/palette/images"
}

const ELIGIBLE = new Set<string>()

function describe(evaluation: WinnerEvaluation): string {
	const treatment = evaluation.treatment
	return [
		`${treatment.background.hex} ${treatment.surface.hex} ${treatment.foreground.hex} ${treatment.accent.hex}`,
		treatment.gradient ? "gradient" : "flat    ",
		`${treatment.collapse.surface ? "S+" : "S-"}${treatment.collapse.accent ? "A+" : "A-"}`,
		`u=${evaluation.qualityUtility.toFixed(4)}`,
		`cov=${evaluation.identityCoverage.toFixed(3)}`,
		`gain=${evaluation.identityGain.toFixed(4)}`,
		`rel=${evaluation.relationUtility.toFixed(4)}`,
		`roles=${evaluation.identityRoles.map(({ familyId, role, credit }) => `${familyId}:${role}:${credit.toFixed(2)}`).join(",") || "-"}`,
		ELIGIBLE.has(evaluation.key) ? "eligible" : "INELIGIBLE",
		evaluation.paretoMember ? "pareto   " : "dominated",
		`fam=${treatment.familyRoles.background}/${treatment.familyRoles.surface}/${treatment.familyRoles.foreground}/${treatment.familyRoles.accent}`,
	].join(" ")
}

function axisTable(first: WinnerEvaluation, second: WinnerEvaluation): void {
	console.log("  axis                        winner  candidate  levelDelta  weightedDelta")
	let total = 0
	for (const axis of WINNER_QUALITY_AXES) {
		const levelDelta = second.evidenceLevels[axis] - first.evidenceLevels[axis]
		const weighted = WINNER_SCORING_POLICY.qualityWeights[axis] * (second.quality[axis] - first.quality[axis])
		total += weighted
		console.log(`  ${axis.padEnd(26)} ${first.quality[axis].toFixed(3)}     ${second.quality[axis].toFixed(3)}  ` +
			`${String(levelDelta).padStart(10)}  ${weighted.toFixed(5).padStart(13)}`)
	}
	console.log(`  candidate minus winner quality utility: ${total.toFixed(5)}`)
	console.log(`  identity gain needed to overturn: ${Math.max(0, -total).toFixed(5)} ` +
		`(available swing at coverage 1 is ${WINNER_SCORING_POLICY.maximumIdentityGain})`)
}

async function main(): Promise<void> {
	const [id, ...filters] = process.argv.slice(2)
	const testCase = EVAL_CASES.find((candidate) => candidate.id === id)
	if (!testCase) throw new Error(`Unknown case ${id}`)
	const wanted = new Map(filters.map((filter) => {
		const match = /^--(background|surface|foreground|accent)=(.+)$/u.exec(filter)
		if (!match) throw new Error(`Unknown filter ${filter}`)
		return [match[1] as "background" | "surface" | "foreground" | "accent", match[2]]
	}))

	const image = await loadNativeImage(resolve(imagesRoot(), testCase.file.replace(/^images\//u, "")))
	const seed = buildPaletteSeedDomain(image)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
	const transitionEnvelope = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(
		common.evidence.nativeFieldTransitions,
	)
	const normalizedTransitionById = new Map(transitionEnvelope.hypotheses.map((hypothesis) =>
		[hypothesis.id, hypothesis]))
	const candidateFields: AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[] = common.fieldHypotheses.map((field) =>
		field.sourceType === "native-field-transition"
			? { ...field, hypothesis: normalizedTransitionById.get(field.hypothesis.id) ?? field.hypothesis }
			: field)
	const supplementalFields = candidateFields.filter(({ sourceType }) => sourceType !== "native-seed")
	const sourceByHypothesisId = new Map(supplementalFields.map(({ sourceType, hypothesis }) =>
		[hypothesis.id, sourceType]))
	const supplemental = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
		common.evidence.augmentedNative,
		supplementalFields.map(({ hypothesis }) => hypothesis),
	)
	const sourcedFields: AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[] = [
		...common.seedAvailability.fieldHypotheses,
		...supplemental.hypotheses.map((hypothesis) => ({
			sourceType: sourceByHypothesisId.get(hypothesis.id)!,
			hypothesis,
		})),
	]
	const supplementalDescriptors: AlbumArtworkPaletteV2Phase3LogicalDescriptor[] =
		supplemental.treatments.map((descriptor) => ({
			sourceType: sourceByHypothesisId.get(descriptor.fieldHypothesis.id)!,
			...descriptor,
		}))
	const materialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
		[...common.seedAvailability.logicalDescriptors, ...supplementalDescriptors],
		common.seedAvailability.identityObligations,
	)
	const roleEvidence = buildRoleEvidence(
		common.evidence.augmentedNative,
		sourcedFields.map(({ hypothesis }) => hypothesis),
		common.seedAvailability.identityObligations.map(({ familyId }) => familyId),
	)
	const scored = scorePaletteCandidates(
		materialization.materialized.map(({ treatment }) => treatment),
		{
			obligations: common.seedAvailability.identityObligations,
			roleRequirements: roleEvidence.requirements,
		},
	)

	const materialized = materialization.materialized.map((candidate) => ({
		key: candidate.key,
		treatment: candidate.treatment,
		descriptors: candidate.descriptors as readonly AlbumArtworkPaletteV2Phase3LogicalDescriptor[],
	}))
	const eligibility = filterAlbumArtworkPaletteV2Phase3CompleteLineageWinnerDomain(materialized, {
		emergency: seed.emergency,
	})
	const eligibleKeys = new Set(eligibility.eligibleCandidates.map(({ key }) => key))
	for (const key of eligibleKeys) ELIGIBLE.add(key)

	const sourceEligible = selectSourceEligibleWinner({
		materialized,
		identityObligations: common.seedAvailability.identityObligations,
		identityRoleRequirements: roleEvidence.requirements,
		emergency: seed.emergency,
		fullDomainSelection: scored,
	})

	console.log(`\n================ ${id} ================`)
	console.log(`source-eligible candidates: ${eligibleKeys.size} of ${materialized.length}`)
	console.log(`source-eligible winner: ${sourceEligible.winner.treatment.background.hex} ` +
		`${sourceEligible.winner.treatment.surface.hex} ${sourceEligible.winner.treatment.foreground.hex} ` +
		`${sourceEligible.winner.treatment.accent.hex}`)
	console.log(`obligations: ${common.seedAvailability.identityObligations
		.map(({ familyId, priority }) => `p${priority}:${familyId}`).join(" ")}`)
	console.log(`candidates: ${scored.evaluations.length}`)
	console.log("top of full-domain ranking:")
	for (const evaluation of scored.evaluations.slice(0, 8)) console.log(`  ${describe(evaluation)}`)

	if (wanted.size > 0) {
		const matches = scored.evaluations.filter(({ treatment }) =>
			[...wanted].every(([role, familyId]) => treatment.familyRoles[role] === familyId))
		console.log(`\nfiltered candidates (${matches.length}):`)
		for (const evaluation of matches.slice(0, 6)) {
			console.log(`  index=${scored.evaluations.indexOf(evaluation)} ${describe(evaluation)}`)
		}
		if (matches.length > 0) {
			console.log("\nbest filtered candidate against the current winner:")
			axisTable(scored.evaluations[0], matches[0])
			const field = sourcedFields.map(({ hypothesis }) => hypothesis)
				.find(({ id: hypothesisId }) => hypothesisId === matches[0].treatment.sourceFieldHypothesisId)
			console.log(`  role classification on that field (${matches[0].treatment.sourceFieldHypothesisId}):`)
			for (const obligation of common.seedAvailability.identityObligations) {
				const family = common.evidence.augmentedNative.families.find(({ id }) => id === obligation.familyId)
				if (!family || !field) continue
				const classification = classifyFieldConditionalFamilyRole(family, field)
				console.log(`    ${obligation.familyId.padEnd(14)} fg=${classification.foreground.score.toFixed(3)} ` +
					`(geom=${classification.foreground.typographyLikeGeometry.toFixed(3)} rep=${classification.foreground.repetition.toFixed(3)} ` +
					`lc=${classification.foreground.observedLocalContrast.toFixed(3)} pol=${classification.foreground.polarityAgreement.toFixed(3)} ` +
					`fieldL=${classification.foreground.fieldLightnessContrast.toFixed(3)}) ` +
					`ac=${classification.accent.score.toFixed(3)} (compact=${classification.accent.compactness.toFixed(3)} ` +
					`chroma=${classification.accent.chroma.toFixed(3)} sig=${classification.accent.signatureObservation.toFixed(3)}) ` +
					`-> ${classification.preference}/${classification.reason} conf=${classification.confidence.toFixed(2)} ` +
					`pop=${(family.populationFraction * 100).toFixed(2)}%`)
			}
		}
	}
}

await main()
