import { readdir, readFile } from "node:fs/promises"
import { relative, resolve } from "node:path"
import { parseArgs } from "node:util"
import {
	type Batch,
	batchesRoot,
	dataRoot,
	invariant,
	readJson,
	readJsonIfPresent,
	repoRoot,
	selectImages,
	sha256,
	verdictsPath,
	writeJsonAtomic,
} from "./src/shared.ts"
import { loadVerdicts } from "./src/warehouse.ts"

// Diagnostic tooling, deliberately outside research/v2-3: the algorithm publishes only its winner, so a
// recall measurement has to replay the internal candidate construction. The v2-3 architecture test
// constrains imports *inside* that folder; reaching in from here is read-only and changes nothing.
import { loadNativeImage } from "../v2-3/src/internal/native-resolution-image.ts"
import {
	buildPaletteSeedDomain,
	constructAlbumArtworkPaletteV2Phase3SupplementalTreatments,
	completeTreatmentKey,
	DEFAULT_PALETTE_EXTRACTION_OPTIONS,
} from "../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../v2-3/src/internal/candidate-domain.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../v2-3/src/internal/candidate-materialization.ts"
import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "../v2-3/src/internal/transition-normalization.ts"
import { buildRoleEvidence } from "../v2-3/src/internal/role-evidence.ts"
import { scorePaletteCandidates } from "../v2-3/src/internal/winner-scoring.ts"
import { extractPaletteDetails } from "../v2-3/src/internal/palette.ts"

/**
 * Dump the candidate domain and its ranking for each image, so `eval-metrics.ts` can separate a recall
 * failure (the domain never contained the human's answer) from a ranking failure (it did, and we ranked
 * something else first).
 *
 *   node --no-warnings --experimental-strip-types research/v2-3-eval/export-candidates.ts \
 *     [--images <glob-or-list>] [--label <name>] [--force]
 *
 * The replayed sequence is exactly the one `extractPaletteDetails` runs internally, up to and including
 * `scorePaletteCandidates`; the published winner is extracted separately and stored for cross-checking.
 */

const { values } = parseArgs({
	options: {
		images: { type: "string" },
		label: { type: "string", default: "v2-3" },
		force: { type: "boolean", default: false },
		"from-warehouse": { type: "boolean", default: false },
	},
	strict: true,
})

const label = values.label ?? "v2-3"
invariant(/^[a-z0-9][a-z0-9._-]*$/iu.test(label), "--label must be a filesystem-safe token")
const outputRoot = resolve(dataRoot, "candidates", label)

export type CandidateDump = Readonly<{
	schemaVersion: 1
	label: string
	image: string
	imagePath: string
	sourceSha256: string
	byteCount: number
	candidateCount: number
	/** Canonical key of the treatment the algorithm actually publishes, after eligibility and promotion. */
	publishedWinnerKey: string
	publishedGradient: boolean
	publishedMidpoint: string | null
	/** Canonical key of the top of the unrestricted ranking, which can differ from the published winner. */
	topRankedKey: string
	candidates: readonly Readonly<{
		rank: number
		key: string
		pareto: boolean
		qualityUtility: number
		relationUtility: number
	}>[]
}>

/**
 * Reviewed artwork is not always in `images/` — batches also draw from the wider corpus. Batch files
 * record the path each reviewed image came from, so they are the address book for warehouse images.
 */
async function warehouseImages(): Promise<{ image: string; path: string }[]> {
	const reviewed = new Set((await loadVerdicts(verdictsPath)).map((record) => record.image))
	const batchFiles = (await readdir(batchesRoot))
		.filter((name) => name.endsWith(".json") && !name.endsWith(".key.json")).sort()
	const paths = new Map<string, string>()
	for (const file of batchFiles) {
		const batch = await readJson<Batch>(resolve(batchesRoot, file))
		for (const item of batch.items) {
			if (reviewed.has(item.image) && !paths.has(item.image)) paths.set(item.image, item.imagePath)
		}
	}
	const missing = [...reviewed].filter((image) => !paths.has(image)).sort()
	if (missing.length > 0) {
		process.stdout.write(`no batch records the path of ${missing.length} reviewed image(s): ${missing.join(", ")}\n`)
	}
	return [...paths.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
		.map(([image, path]) => ({ image, path: resolve(repoRoot, path) }))
}

const images = values["from-warehouse"] ? await warehouseImages() : await selectImages(values.images)
invariant(images.length > 0, "No images selected")
process.stdout.write(`exporting candidate domains for ${images.length} image(s) into data/candidates/${label}/\n`)

let exported = 0
let cached = 0
for (const [index, entry] of images.entries()) {
	const bytes = await readFile(entry.path)
	const sourceSha256 = sha256(bytes)
	const path = resolve(outputRoot, `${entry.image}.json`)
	const position = `[${String(index + 1).padStart(String(images.length).length, " ")}/${images.length}]`
	const existing = await readJsonIfPresent<CandidateDump>(path)
	if (!values.force && existing !== null && existing.sourceSha256 === sourceSha256 && existing.label === label) {
		cached += 1
		process.stdout.write(`${position} ${entry.image} cached (${existing.candidateCount} candidates)\n`)
		continue
	}

	const started = process.hrtime.bigint()
	const image = await loadNativeImage(bytes)
	const options = DEFAULT_PALETTE_EXTRACTION_OPTIONS

	// --- the replayed internal sequence -------------------------------------------------------------
	const seed = buildPaletteSeedDomain(image, options)
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
	const transitionEnvelope = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(
		common.evidence.nativeFieldTransitions,
	)
	const normalizedTransitionById = new Map(transitionEnvelope.hypotheses.map((hypothesis) =>
		[hypothesis.id, hypothesis]))
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
	const supplementalDescriptors = supplemental.treatments.map((descriptor) => {
		const sourceType = sourceByHypothesisId.get(descriptor.fieldHypothesis.id)
		invariant(sourceType !== undefined, "Supplemental candidate source is missing")
		return { sourceType, ...descriptor }
	})
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
	// --- end of replayed sequence -------------------------------------------------------------------

	const published = extractPaletteDetails(image, options)
	const dump: CandidateDump = {
		schemaVersion: 1,
		label,
		image: entry.image,
		imagePath: relative(repoRoot, entry.path),
		sourceSha256,
		byteCount: bytes.byteLength,
		candidateCount: materialization.materialized.length,
		publishedWinnerKey: completeTreatmentKey(published.winner),
		publishedGradient: published.winner.gradient,
		publishedMidpoint: published.midpoint.kind === "source-supported-three-stop"
			? published.midpoint.color.hex
			: null,
		topRankedKey: scored.evaluations[0].key,
		candidates: scored.evaluations.map((evaluation, rank) => ({
			rank: rank + 1,
			key: evaluation.key,
			pareto: evaluation.paretoMember,
			qualityUtility: evaluation.qualityUtility,
			relationUtility: evaluation.relationUtility,
		})),
	}
	await writeJsonAtomic(path, dump)
	exported += 1
	const elapsed = Number(process.hrtime.bigint() - started) / 1e6
	process.stdout.write(`${position} ${entry.image} ${dump.candidateCount} candidates in ${elapsed.toFixed(0)}ms`
		+ `${dump.publishedWinnerKey === dump.topRankedKey ? "" : " (published winner is not rank 1)"}\n`)
}

process.stdout.write(`done: ${exported} exported, ${cached} reused\n`)
