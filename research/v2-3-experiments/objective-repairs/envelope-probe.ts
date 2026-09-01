import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import sharp from "sharp"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, completeTreatmentKey, DEFAULT_PALETTE_EXTRACTION_OPTIONS } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"
import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "../../v2-3/src/internal/transition-normalization.ts"
import { buildRoleEvidence } from "../../v2-3/src/internal/role-evidence.ts"
import { buildArtworkGamut, isAchromaticField } from "../../v2-3/src/internal/gamut-coverage.ts"
import {
	GAMUT_COVERAGE,
	promotionEnvelopeUtility,
	resolveObjectiveRepairs,
	scorePaletteCandidates,
	WINNER_SCORING_POLICY,
} from "../../v2-3/src/internal/winner-scoring.ts"
import type { GamutScoringInput } from "../../v2-3/src/internal/winner-scoring.ts"
import { SHARED_CHECKOUT } from "./corpus.ts"

/**
 * How much room the promotion envelope has, under each basis, on the artworks whose promotion the
 * envelope is documented to have decided.
 *
 * `or-t1-envelope` moves no winner anywhere, so the only way to tell a repaired-but-inert defect
 * from a defect that was never there is to measure the quantity the toggle changes: the margin by
 * which each candidate clears `maximumQualityLoss`. This prints it both ways.
 */

sharp.concurrency(1)

const images = process.argv.slice(2)
if (images.length === 0) throw new Error("usage: envelope-probe.ts <repo-relative image path>...")

for (const relative of images) {
	const bytes = await readFile(resolve(SHARED_CHECKOUT, relative))
	const image = await loadNativeImage(bytes)
	const options = DEFAULT_PALETTE_EXTRACTION_OPTIONS
	const seed = buildPaletteSeedDomain(image, options)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
	const envelope = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(common.evidence.nativeFieldTransitions)
	const normalized = new Map(envelope.hypotheses.map((hypothesis) => [hypothesis.id, hypothesis]))
	const fields = common.fieldHypotheses.map((field) => field.sourceType === "native-field-transition"
		? { ...field, hypothesis: normalized.get(field.hypothesis.id) ?? field.hypothesis }
		: field)
	const materialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
		common.seedAvailability.logicalDescriptors, common.seedAvailability.identityObligations)
	const roleEvidence = buildRoleEvidence(
		common.evidence.augmentedNative,
		fields.map(({ hypothesis }) => hypothesis),
		common.seedAvailability.identityObligations.map(({ familyId }) => familyId))
	const treatments = materialization.materialized.map(({ treatment }) => treatment)
	const identityInput = {
		obligations: common.seedAvailability.identityObligations,
		roleRequirements: roleEvidence.requirements,
	}
	const reference = scorePaletteCandidates(treatments, identityInput, null).winner
	const gamutScoring: GamutScoringInput = {
		gamut: buildArtworkGamut(common.evidence.native),
		integration: GAMUT_COVERAGE.integration,
		weight: GAMUT_COVERAGE.weight,
		scope: GAMUT_COVERAGE.scope,
		saturation: GAMUT_COVERAGE.saturation,
		fieldGuard: GAMUT_COVERAGE.fieldGuard && isAchromaticField([reference.background.oklab, reference.surface.oklab]),
	}
	const scored = scorePaletteCandidates(treatments, identityInput, gamutScoring)
	const winnerKey = completeTreatmentKey(scored.winner)
	const baseline = scored.evaluations.find(({ key }) => key === winnerKey)!

	const inclusive = resolveObjectiveRepairs({ envelopeBasis: "coverage-inclusive" })
	const free = resolveObjectiveRepairs({ envelopeBasis: "coverage-free" })
	const budget = WINNER_SCORING_POLICY.maximumQualityLoss

	// Margin by which each candidate clears the envelope, under each basis. Negative means excluded.
	const margins = scored.evaluations.map((evaluation) => ({
		key: evaluation.key,
		coverage: evaluation.gamutCoverage,
		inclusive: promotionEnvelopeUtility(evaluation, inclusive) + budget - promotionEnvelopeUtility(baseline, inclusive),
		free: promotionEnvelopeUtility(evaluation, free) + budget - promotionEnvelopeUtility(baseline, free),
	}))
	const flipped = margins.filter(({ inclusive: a, free: b }) => (a >= 0) !== (b >= 0))
	const shifts = margins.map(({ inclusive: a, free: b }) => Math.abs(a - b))
	const nearest = [...margins].sort((first, second) => Math.abs(first.inclusive) - Math.abs(second.inclusive))[0]

	process.stdout.write(`\n${relative}\n`)
	process.stdout.write(`  candidates ${margins.length}; winner ${winnerKey}\n`)
	process.stdout.write(`  coverage spread across candidates: `
		+ `${(Math.max(...margins.map((m) => m.coverage)) - Math.min(...margins.map((m) => m.coverage))).toFixed(4)} raw, `
		+ `weighted ${((Math.max(...margins.map((m) => m.coverage)) - Math.min(...margins.map((m) => m.coverage))) * GAMUT_COVERAGE.weight).toFixed(5)}\n`)
	process.stdout.write(`  envelope margin shift when coverage is removed: mean `
		+ `${(shifts.reduce((sum, value) => sum + value, 0) / shifts.length).toFixed(5)}, max ${Math.max(...shifts).toFixed(5)}\n`)
	process.stdout.write(`  candidates whose ADMISSION flips: ${flipped.length}\n`)
	process.stdout.write(`  tightest margin (coverage-inclusive): ${nearest.inclusive.toFixed(5)} `
		+ `-> coverage-free ${nearest.free.toFixed(5)} (shift ${(nearest.free - nearest.inclusive).toFixed(5)})\n`)
	process.stdout.write(`  admitted: ${margins.filter(({ inclusive: a }) => a >= 0).length} inclusive / `
		+ `${margins.filter(({ free: b }) => b >= 0).length} coverage-free\n`)
}
