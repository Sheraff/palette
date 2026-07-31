/**
 * Track P detector — Series 2. Batch 17 said the vividness preference is general (8 vivid /
 * 3 equal / 0 incumbent across 11), so the open question is no longer *whether* but *where it
 * stops*. This widens Series 1's signature downward and tags every hit with the cell it tests.
 *
 * Widened relative to Series 1 (`chromaLead >= 0.06`, `smallPopulation <= 1.5 %`):
 *   chroma lead      >= 0.03   so the "barely more saturated" edge is reachable
 *   challenger size  >= 0.0005 so the tiny/noise-like edge is reachable
 *
 * Cells, assigned per hit:
 *   boundary   the challenger is weak on at least one axis — tiny (<= 0.4 %), a thin chroma
 *              lead (< 0.06), or thin evidence (few components / no mark)
 *   same-hue   the two accents are within `identityDirectionHueDegrees` of each other, so the
 *              swap is an intensification rather than a new direction
 *   replicate  an ordinary hue-jump contest at Series 1 strength — a stability check
 *
 * Two-colour artworks are EXCLUDED. Track K2's rule gives an interior chord blend between the
 * artwork's only two colours no identity of its own, so on those artworks the accent slot is
 * not a live contest: it collapses. Excluded on K2's own measure — the background family plus
 * the foreground family owning at least `accentBlend.minimumTwoColourCoverage` of the frame.
 *
 * usage: detect-boundary-contest.ts <out.jsonl> --list <file-of-paths>
 */
import { appendFile, readFile } from "node:fs/promises"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, DEFAULT_PALETTE_EXTRACTION_OPTIONS, constructAlbumArtworkPaletteV2Phase3SupplementalTreatments } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "../../v2-3/src/internal/transition-normalization.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"
import { buildRoleEvidence } from "../../v2-3/src/internal/role-evidence.ts"
import { scorePaletteCandidates } from "../../v2-3/src/internal/winner-scoring.ts"
import { ALBUM_ARTWORK_PALETTE_V2_POLICY } from "../../v2-3/src/internal/policy.ts"
import type { AlbumArtworkPaletteV2Phase3LogicalDescriptor, AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis } from "../../v2-3/src/internal/candidate-domain.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"

export const SIGNATURE = {
	winnerFullChroma: 0.09,
	winnerPopulationFloor: 0.015,
	smallPopulation: 0.015,
	tinyPopulation: 0.004,
	minimumPopulation: 0.0005,
	chromaLead: 0.03,
	seriesOneChromaLead: 0.06,
	populationRatio: 2,
	/** Matches the selector's own `identityDirectionHueDegrees`. */
	sameHueDegrees: 40,
}

const chromaOf = ([, a, b]: readonly number[]): number => Math.hypot(a, b)
const hueDegrees = ([, a, b]: readonly number[]): number => Math.atan2(b, a) * 180 / Math.PI
function hueGap(first: readonly number[], second: readonly number[]): number {
	const difference = Math.abs(hueDegrees(first) - hueDegrees(second))
	return difference > 180 ? 360 - difference : difference
}

const out = process.argv[2]
if (!out) throw new Error("usage: detect-boundary-contest.ts <out.jsonl> --list <file>")
let targets = process.argv.slice(3)
if (targets[0] === "--list") targets = (await readFile(targets[1], "utf8")).split("\n").map((l) => l.trim()).filter(Boolean)

let matched = 0
let twoColourSkipped = 0
for (const caseFile of targets) {
	try {
		const image = await loadNativeImage(`${ROOT}/${caseFile}`)
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
		const signatureLane = new Set(common.evidence.augmentedNative.lanes.find(({ name }) => name === "signature")?.familyIds ?? [])
		const obligationPriority = new Map(common.seedAvailability.identityObligations.map((o) => [o.familyId, o.priority]))
		const ranked = [...scored.evaluations].sort((a, b) => b.relationUtility - a.relationUtility)
		const winner = ranked.find((e) => e.treatment === (scored.winner as never)) ?? ranked[0]
		const w = winner.treatment
		if (w.collapse.accent) continue

		// Track K2 exclusion: on a two-colour artwork the accent slot is not a live contest.
		const backgroundFamily = byId.get(w.familyRoles.background)
		const foregroundFamily = byId.get(w.familyRoles.foreground)
		const twoColourCoverage = (backgroundFamily?.populationFraction ?? 0) + (foregroundFamily?.populationFraction ?? 0)
		if (twoColourCoverage >= ALBUM_ARTWORK_PALETTE_V2_POLICY.accentBlend.minimumTwoColourCoverage) {
			twoColourSkipped += 1
			continue
		}

		const winnerFamily = byId.get(w.familyRoles.accent)
		if (!winnerFamily) continue
		const winnerChroma = chromaOf(w.accent.oklab)
		if (winnerChroma < SIGNATURE.winnerFullChroma) continue
		if (winnerFamily.populationFraction < SIGNATURE.winnerPopulationFloor) continue

		const rivals = ranked.filter((e) => {
			const t = e.treatment
			return t !== w && !t.collapse.accent &&
				t.background.hex === w.background.hex && t.surface.hex === w.surface.hex &&
				t.foreground.hex === w.foreground.hex && t.gradient === w.gradient &&
				t.accent.hex !== w.accent.hex
		})
		for (const rival of rivals) {
			const family = byId.get(rival.treatment.familyRoles.accent)
			if (!family) continue
			const chroma = chromaOf(rival.treatment.accent.oklab)
			const lead = chroma - winnerChroma
			if (family.populationFraction > SIGNATURE.smallPopulation) continue
			if (family.populationFraction < SIGNATURE.minimumPopulation) continue
			if (lead < SIGNATURE.chromaLead) continue
			if (winnerFamily.populationFraction / Math.max(1e-9, family.populationFraction) < SIGNATURE.populationRatio) continue

			const gap = hueGap(rival.treatment.accent.oklab, w.accent.oklab)
			const sameHue = gap < SIGNATURE.sameHueDegrees
			const thinEvidence = family.markSupport < 0.05 || family.observedComponentCount <= 4
			const tiny = family.populationFraction <= SIGNATURE.tinyPopulation
			const thinLead = lead < SIGNATURE.seriesOneChromaLead
			const cell = sameHue ? "same-hue"
				: (tiny || thinLead || thinEvidence) ? "boundary"
				: "replicate"
			// how far toward the edge: 0 = Series-1 strength, 1 = at every floor at once
			const weakness = (
				(tiny ? 1 : 0) + (thinLead ? 1 : 0) + (family.markSupport < 0.05 ? 1 : 0) +
				(family.observedComponentCount <= 4 ? 1 : 0) + (family.populationFraction <= 0.0015 ? 1 : 0)
			) / 5

			matched += 1
			await appendFile(out, `${JSON.stringify({
				image: caseFile, cell, weakness,
				width: image.width, height: image.height,
				winner: {
					background: w.background.hex, surface: w.surface.hex,
					foreground: w.foreground.hex, accent: w.accent.hex, gradient: w.gradient,
				},
				winnerAccent: {
					familyId: winnerFamily.id, hex: w.accent.hex, chroma: winnerChroma,
					populationFraction: winnerFamily.populationFraction, markSupport: winnerFamily.markSupport,
				},
				vivid: {
					familyId: family.id, hex: rival.treatment.accent.hex, chroma,
					populationFraction: family.populationFraction, markSupport: family.markSupport,
					componentCount: family.componentCount, observedComponentCount: family.observedComponentCount,
					markComponentCount: family.markComponentCount,
					obligationPriority: obligationPriority.get(family.id) ?? null,
					inSignatureLane: signatureLane.has(family.id),
				},
				margins: {
					relation: winner.relationUtility - rival.relationUtility,
					quality: winner.qualityUtility - rival.qualityUtility,
					identityGain: winner.identityGain - rival.identityGain,
					coverageWinner: winner.identityCoverage, coverageVivid: rival.identityCoverage,
				},
				chromaLead: lead, hueGapDegrees: gap,
				populationRatio: winnerFamily.populationFraction / Math.max(1e-9, family.populationFraction),
				twoColourCoverage,
				rank: ranked.indexOf(rival),
			})}\n`)
			console.log(`HIT[${cell}${cell === "boundary" ? ` w=${weakness.toFixed(1)}` : ""}] ${caseFile}  ` +
				`${w.accent.hex}(C=${winnerChroma.toFixed(3)},${(winnerFamily.populationFraction * 100).toFixed(2)}%) -> ` +
				`${rival.treatment.accent.hex}(C=${chroma.toFixed(3)},${(family.populationFraction * 100).toFixed(3)}%,` +
				`mark=${family.markSupport.toFixed(2)},comp=${family.observedComponentCount}) hue${gap.toFixed(0)}deg`)
		}
	} catch (error) {
		await appendFile(out.replace(/\.jsonl$/, "-errors.jsonl"),
			`${JSON.stringify({ image: caseFile, error: error instanceof Error ? error.message : String(error) })}\n`)
		console.log(`ERR  ${caseFile}  ${error instanceof Error ? error.message : error}`)
	}
}
console.log(`\n${matched} contests across ${targets.length} images; ${twoColourSkipped} two-colour artworks excluded`)
