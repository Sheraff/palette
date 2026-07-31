/**
 * Track N detector: find live "small vivid versus larger chromatic" accent contests.
 *
 * The signature comes from Track M's decomposition of `08/…087b13`, the prototype. A case is a
 * live contest when, on the winner's own field and foreground:
 *
 *   (a) the winning accent comes from a LARGER family that is ALREADY fully chromatic
 *       (chroma >= identityDirectionFullChroma = 0.09) — so the trade is not "grey versus
 *       colour", which is a different and already-settled question;
 *   (b) there exists a legal treatment differing ONLY in the accent, whose accent family is
 *       SMALL (population fraction <= smallPopulation) and whose rendered chroma is
 *       MEANINGFULLY higher (>= chromaLead above the winner's accent);
 *   (c) that alternative is genuinely reachable — it is in the scored slate, so it is a real
 *       candidate the objective already considered and rejected, not an invented colour.
 *
 * Everything reported is measured from the actual candidate slate. No colour is synthesised.
 *
 * usage: detect-vivid-contest.ts <out.jsonl> <image...>
 *        detect-vivid-contest.ts <out.jsonl> --list <file-of-paths>
 */
import { appendFile, readFile } from "node:fs/promises"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, DEFAULT_PALETTE_EXTRACTION_OPTIONS, constructAlbumArtworkPaletteV2Phase3SupplementalTreatments } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "../../v2-3/src/internal/transition-normalization.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"
import { buildRoleEvidence } from "../../v2-3/src/internal/role-evidence.ts"
import { scorePaletteCandidates } from "../../v2-3/src/internal/winner-scoring.ts"
import type { AlbumArtworkPaletteV2Phase3LogicalDescriptor, AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis } from "../../v2-3/src/internal/candidate-domain.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"

/** Tuned so `08/…087b13` (accent #e7a680 C=0.0927 pop 3.80% vs #f94a2f C=0.2155 pop 0.57%) matches. */
export const SIGNATURE = {
	/** The winning accent must already be a full chromatic direction — this is not grey-vs-colour. */
	winnerFullChroma: 0.09,
	/** ...and must come from a family materially larger than the challenger's. */
	winnerPopulationFloor: 0.015,
	/** The challenger family must be small. */
	smallPopulation: 0.015,
	/** ...and meaningfully more saturated than the incumbent accent. */
	chromaLead: 0.06,
	/** ...and the incumbent must be at least this many times larger, so the trade is real. */
	populationRatio: 2,
}

type Contest = Readonly<{
	image: string
	width: number
	height: number
	winner: Readonly<{ background: string; surface: string; foreground: string; accent: string; gradient: boolean }>
	winnerAccent: Readonly<{ familyId: string; hex: string; chroma: number; populationFraction: number; markSupport: number }>
	vivid: Readonly<{ familyId: string; hex: string; chroma: number; populationFraction: number; markSupport: number; obligationPriority: number | null; inSignatureLane: boolean }>
	margins: Readonly<{ relation: number; quality: number; identityGain: number; coverageWinner: number; coverageVivid: number }>
	chromaLead: number
	populationRatio: number
	rank: number
	score: number
}>

const chromaOf = ([, a, b]: readonly number[]): number => Math.hypot(a, b)

async function analyze(caseFile: string): Promise<Readonly<{ contest: Contest | null; note: string | null }>> {
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

	if (w.collapse.accent) return { contest: null, note: "accent-collapsed" }
	const winnerFamily = byId.get(w.familyRoles.accent)
	if (!winnerFamily) return { contest: null, note: "winner accent has no family" }
	const winnerChroma = chromaOf(w.accent.oklab)

	// (a) the incumbent must already be a full chromatic direction, from a larger family
	if (winnerChroma < SIGNATURE.winnerFullChroma) return { contest: null, note: null }
	if (winnerFamily.populationFraction < SIGNATURE.winnerPopulationFloor) return { contest: null, note: null }

	// (b)+(c) accent-only rivals from the real slate
	const rivals = ranked.filter((e) => {
		const t = e.treatment
		return t !== w && !t.collapse.accent &&
			t.background.hex === w.background.hex && t.surface.hex === w.surface.hex &&
			t.foreground.hex === w.foreground.hex && t.gradient === w.gradient &&
			t.accent.hex !== w.accent.hex
	})
	let best: Contest | null = null
	for (const rival of rivals) {
		const family = byId.get(rival.treatment.familyRoles.accent)
		if (!family) continue
		const chroma = chromaOf(rival.treatment.accent.oklab)
		if (family.populationFraction > SIGNATURE.smallPopulation) continue
		if (chroma - winnerChroma < SIGNATURE.chromaLead) continue
		if (winnerFamily.populationFraction / Math.max(1e-9, family.populationFraction) < SIGNATURE.populationRatio) continue
		// strength: how vivid the jump is, discounted by how far behind the alternative sits
		const score = (chroma - winnerChroma) / Math.max(0.01, winner.relationUtility - rival.relationUtility)
		if (best && score <= best.score) continue
		best = {
			image: caseFile,
			width: image.width,
			height: image.height,
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
				obligationPriority: obligationPriority.get(family.id) ?? null,
				inSignatureLane: signatureLane.has(family.id),
			},
			margins: {
				relation: winner.relationUtility - rival.relationUtility,
				quality: winner.qualityUtility - rival.qualityUtility,
				identityGain: winner.identityGain - rival.identityGain,
				coverageWinner: winner.identityCoverage,
				coverageVivid: rival.identityCoverage,
			},
			chromaLead: chroma - winnerChroma,
			populationRatio: winnerFamily.populationFraction / Math.max(1e-9, family.populationFraction),
			rank: ranked.indexOf(rival),
			score,
		}
	}
	return { contest: best, note: null }
}

const out = process.argv[2]
if (!out) throw new Error("usage: detect-vivid-contest.ts <out.jsonl> <image...|--list file>")
let targets = process.argv.slice(3)
if (targets[0] === "--list") {
	targets = (await readFile(targets[1], "utf8")).split("\n").map((line) => line.trim()).filter(Boolean)
}
let matched = 0
for (const caseFile of targets) {
	try {
		const { contest } = await analyze(caseFile)
		if (contest) {
			matched += 1
			await appendFile(out, `${JSON.stringify(contest)}\n`)
			console.log(`HIT  ${caseFile}  ac=${contest.winnerAccent.hex}(C=${contest.winnerAccent.chroma.toFixed(3)},${(contest.winnerAccent.populationFraction * 100).toFixed(2)}%) ` +
				`vs ${contest.vivid.hex}(C=${contest.vivid.chroma.toFixed(3)},${(contest.vivid.populationFraction * 100).toFixed(2)}%) ` +
				`rel-${contest.margins.relation.toFixed(4)} score=${contest.score.toFixed(2)}`)
		}
	} catch (error) {
		await appendFile(out.replace(/\.jsonl$/, "-errors.jsonl"),
			`${JSON.stringify({ image: caseFile, error: String(error instanceof Error ? error.message : error) })}\n`)
		console.log(`ERR  ${caseFile}  ${error instanceof Error ? error.message : error}`)
	}
}
console.log(`\n${matched} of ${targets.length} matched the signature`)
