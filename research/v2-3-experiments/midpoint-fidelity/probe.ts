import { readFile, mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { parseArgs } from "node:util"
import { writeFileSync } from "node:fs"

// Diagnostic tooling, deliberately outside research/v2-3 (same standing as research/v2-3-eval/export-candidates.ts):
// the algorithm publishes only its winner, so measuring what the midpoint guards kill means replaying the
// internal construction. Read-only; nothing under research/v2-3/ is modified.
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import {
	buildPaletteSeedDomain,
	constructAlbumArtworkPaletteV2Phase3SupplementalTreatments,
	completeTreatmentKey,
	DEFAULT_PALETTE_EXTRACTION_OPTIONS,
} from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"
import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "../../v2-3/src/internal/transition-normalization.ts"
import { buildRoleEvidence } from "../../v2-3/src/internal/role-evidence.ts"
import { scorePaletteCandidates } from "../../v2-3/src/internal/winner-scoring.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import { mixOKLab, okDistance, perceptualDifference } from "../../v2-3/src/internal/color.ts"
import { discoverSupportedNativeFieldTransitionPaths } from "../../v2-3/src/internal/field-transition.ts"

const { values } = parseArgs({
	options: { image: { type: "string" }, out: { type: "string" } },
	strict: true,
})
if (!values.image) throw new Error("--image required (absolute path)")

const DELTA_E_BAR = 3.3

const bytes = await readFile(values.image)
const image = await loadNativeImage(bytes)
const options = DEFAULT_PALETTE_EXTRACTION_OPTIONS

const seed = buildPaletteSeedDomain(image, options)
const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
const transitionEnvelope = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(
	common.evidence.nativeFieldTransitions,
)
const normalizedTransitionById = new Map(transitionEnvelope.hypotheses.map((h) => [h.id, h]))
const candidateFields = common.fieldHypotheses.map((field) =>
	field.sourceType === "native-field-transition"
		? { ...field, hypothesis: normalizedTransitionById.get(field.hypothesis.id) ?? field.hypothesis }
		: field)
const supplementalFields = candidateFields.filter(({ sourceType }) => sourceType !== "native-seed")
const sourceByHypothesisId = new Map(supplementalFields.map(({ sourceType, hypothesis }) =>
	[hypothesis.id, sourceType]))
const supplemental = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
	common.evidence.augmentedNative,
	supplementalFields.map(({ hypothesis }) => hypothesis),
	options,
)
const sourcedFields = [
	...common.seedAvailability.fieldHypotheses,
	...supplemental.hypotheses.map((hypothesis) => ({
		sourceType: sourceByHypothesisId.get(hypothesis.id)!,
		hypothesis,
	})),
]
const supplementalDescriptors = supplemental.treatments.map((descriptor) => ({
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
const rankByKey = new Map(scored.evaluations.map((evaluation, index) => [evaluation.key, index + 1]))

// ---- Route B: field-midpoint-band, per gradient candidate carrying midpoint evidence ----------------
type Row = {
	key: string
	rank: number | null
	bg: string
	surface: string
	mid: string
	chordDeviation: number
	minimumChordDeviation: number
	chordPass: boolean
	endpointDeltaE: number
	deltaEPass: boolean
	deltaEToBg: number
	deltaEToSurface: number
	/** lightness betweenness: 0 when inside the endpoints' L span, else the excursion in OKLab L */
	lightnessExcursion: number
	lightnessBetween: boolean
	bandPopulationFraction: number
	occupancyShare: number
	spatialSpreadRatio: number
}

const rows: Row[] = []
for (const { treatment } of materialization.materialized) {
	if (!treatment.gradient) continue
	const midpoint = treatment.gradientEvidence?.fieldMidpoint
	if (!midpoint) continue
	const bg = treatment.background
	const surface = treatment.surface
	const chord = mixOKLab(bg.oklab, surface.oklab, 0.5)
	const chordDeviation = okDistance(midpoint.oklab, chord)
	const deltaEToBg = perceptualDifference(midpoint.rgb, bg.rgb)
	const deltaEToSurface = perceptualDifference(midpoint.rgb, surface.rgb)
	const endpointDeltaE = Math.min(deltaEToBg, deltaEToSurface)
	const lowLightness = Math.min(bg.oklab[0], surface.oklab[0])
	const highLightness = Math.max(bg.oklab[0], surface.oklab[0])
	const midLightness = midpoint.oklab[0]
	const lightnessExcursion = midLightness < lowLightness
		? lowLightness - midLightness
		: midLightness > highLightness ? midLightness - highLightness : 0
	const key = completeTreatmentKey(treatment)
	rows.push({
		key,
		rank: rankByKey.get(key) ?? null,
		bg: bg.hex,
		surface: surface.hex,
		mid: midpoint.hex,
		chordDeviation,
		minimumChordDeviation: midpoint.minimumChordDeviation,
		chordPass: chordDeviation >= midpoint.minimumChordDeviation,
		endpointDeltaE,
		deltaEPass: endpointDeltaE >= DELTA_E_BAR,
		deltaEToBg,
		deltaEToSurface,
		lightnessExcursion,
		lightnessBetween: lightnessExcursion === 0,
		bandPopulationFraction: midpoint.bandPopulationFraction,
		occupancyShare: midpoint.occupancyShare,
		spatialSpreadRatio: midpoint.spatialSpreadRatio,
	})
}

// ---- Route A: transition-path stages, with the chord-position guard exposed -------------------------
const familyBinStep = common.evidence.augmentedNative.familyBinStep
const paths = discoverSupportedNativeFieldTransitionPaths(common.evidence.augmentedNative)
const pathRows = paths.map((path) => {
	const first = path.stages[0]?.prototype ?? [0, 0, 0]
	const last = path.stages.at(-1)?.prototype ?? [0, 0, 0]
	return {
		hypothesisId: path.hypothesis?.id ?? null,
		eligible: path.eligible,
		rejectionReasons: path.rejectionReasons,
		stageCount: path.stages.length,
		acceptedIntermediateCount: path.acceptedIntermediateSupport.length,
		stages: path.acceptedIntermediateSupport.map((stage) => {
			const directPathDifference = okDistance(
				stage.prototype, mixOKLab(first, last, stage.colorPosition))
			const spatialHalfwayDelta = Math.abs(stage.spatialPosition - 0.5)
			const colorHalfwayDelta = Math.abs(stage.colorPosition - 0.5)
			return {
				stageIndex: stage.stageIndex,
				hex: stage.exactColor.hex,
				spatialPosition: stage.spatialPosition,
				colorPosition: stage.colorPosition,
				populationFraction: stage.populationFraction,
				directPathDifference,
				spatialHalfwayDelta,
				colorHalfwayDelta,
				spatialPass: spatialHalfwayDelta <= 0.2,
				colorPass: colorHalfwayDelta <= 0.2,
				directPass: directPathDifference >= familyBinStep,
			}
		}),
	}
})

const published = extractPaletteDetails(image, options)
const publishedKey = completeTreatmentKey(published.winner)

const output = {
	image: values.image,
	familyBinStep,
	published: {
		key: publishedKey,
		gradient: published.winner.gradient,
		background: published.winner.background.hex,
		surface: published.winner.surface.hex,
		foreground: published.winner.foreground.hex,
		accent: published.winner.accent.hex,
		midpoint: published.midpoint.kind === "source-supported-three-stop"
			? published.midpoint.color.hex : null,
		midpointKind: published.midpoint.kind,
		midpointOrigin: published.midpoint.provenance?.origin ?? null,
	},
	publishedRow: rows.find((row) => row.key === publishedKey) ?? null,
	routeB: {
		total: rows.length,
		chordPass: rows.filter((row) => row.chordPass).length,
		bothPass: rows.filter((row) => row.chordPass && row.deltaEPass).length,
		killedByDeltaE: rows.filter((row) => row.chordPass && !row.deltaEPass).length,
		chordPassLightnessOutside: rows.filter((row) => row.chordPass && !row.lightnessBetween).length,
		bothPassLightnessOutside: rows.filter((row) =>
			row.chordPass && row.deltaEPass && !row.lightnessBetween).length,
	},
	rows,
	pathRows,
}

const out = values.out ?? "/dev/stdout"
if (values.out) await mkdir(resolve(values.out, ".."), { recursive: true })
writeFileSync(out, `${JSON.stringify(output, null, "\t")}\n`)
