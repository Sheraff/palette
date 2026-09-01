/**
 * Census of `scores.endpointBandSpread` across the materialized candidate domain,
 * grouped by the source of the field hypothesis, plus the count of same-family
 * gradient pairs the band-extent dominance guard actually reads asymmetrically.
 *
 * Adapted from `research/v2-3-experiments/adversarial-arch/spread-census.ts`
 * (branch `worktree-agent-aea17683dcda2e5f4`, finding F8). Two changes: the corpus
 * root honours `PALETTE_IMAGES_ROOT` (charter's corpus trap — a worktree `images/`
 * holds only scrambled decoys), and the census separates "absent / not measurable"
 * (`null`) from "measured zero", which is the distinction F8 is about.
 *
 *   PALETTE_IMAGES_ROOT=/abs/path/to/images node --no-warnings --experimental-strip-types \
 *     research/v2-3-experiments/track-i/spread-census.ts [--json <path>] [image...]
 */
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, constructAlbumArtworkPaletteV2Phase3SupplementalTreatments } from "../../v2-3/src/internal/palette-core.ts"
import type { CompletePaletteTreatment } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import type { AlbumArtworkPaletteV2Phase3LogicalDescriptor, AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis } from "../../v2-3/src/internal/candidate-domain.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"
import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "../../v2-3/src/internal/transition-normalization.ts"

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url))
const imagesRoot = process.env.PALETTE_IMAGES_ROOT
	? resolve(process.env.PALETTE_IMAGES_ROOT)
	: resolve(repositoryRoot, "images")

const DEFAULT_IMAGES = ["birdsofprey.jpg", "loups.jpg", "horsley.jpg", "orelsan.jpg", "muse.jpg", "infected.jpg",
	"placebo.jpg", "havana.jpg", "doja.jpg", "once.jpg", "slim.jpg"]

function sourceOf(hypothesisId: string): string {
	if (hypothesisId.startsWith("gradient:")) return "seed gradient fit"
	if (hypothesisId.startsWith("endpoint-refinement:")) return "band-local-endpoint"
	if (hypothesisId.startsWith("native-transition")) return "native-field-transition"
	return hypothesisId.split(":")[0]
}

/** Mirrors `winner-scoring.ts`'s `sameFamilyAssignment` — the guard's precondition. */
function sameFamilyAssignment(first: CompletePaletteTreatment, second: CompletePaletteTreatment): boolean {
	return first.gradient === second.gradient &&
		first.collapse.surface === second.collapse.surface &&
		first.collapse.accent === second.collapse.accent &&
		(["background", "surface", "foreground", "accent"] as const)
			.every((role) => first.familyRoles[role] === second.familyRoles[role])
}

type Bucket = { candidates: number; measured: number; absent: number; measuredZero: number }

function bucket(): Bucket {
	return { candidates: 0, measured: 0, absent: 0, measuredZero: 0 }
}

type ImageReport = Readonly<{
	image: string
	bySource: Record<string, Bucket>
	gradientCandidates: number
	/** Same-family gradient pairs where exactly one side has no measurable spread. */
	asymmetricPairs: number
	/** Distinct candidates appearing in at least one such pair. */
	asymmetricCandidates: number
	sameFamilyGradientPairs: number
}>

const args = process.argv.slice(2)
const jsonIndex = args.indexOf("--json")
const jsonPath = jsonIndex >= 0 ? args[jsonIndex + 1] : null
const names = args.filter((value, index) =>
	!value.startsWith("--") && !(jsonIndex >= 0 && index === jsonIndex + 1))
const images = names.length > 0 ? names : DEFAULT_IMAGES

const totals: Record<string, Bucket> = {}
const reports: ImageReport[] = []

for (const name of images) {
	const image = await loadNativeImage(await readFile(resolve(imagesRoot, name)))
	const common = buildAlbumArtworkPaletteV2Phase3CommonBase(buildPaletteSeedDomain(image))
	// Mirrors palette.ts so the supplemental (transition / band-local-endpoint)
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
	const perImage: Record<string, Bucket> = {}
	const gradients: CompletePaletteTreatment[] = []
	for (const { treatment } of materialization.materialized) {
		if (!treatment.gradient) continue
		gradients.push(treatment)
		const source = sourceOf(treatment.sourceFieldHypothesisId)
		for (const store of [perImage, totals]) {
			const entry = store[source] ?? bucket()
			entry.candidates += 1
			const spread = treatment.scores.endpointBandSpread
			if (spread === null) entry.absent += 1
			else if (spread === 0) entry.measuredZero += 1
			else entry.measured += 1
			store[source] = entry
		}
	}
	let asymmetricPairs = 0
	let sameFamilyGradientPairs = 0
	const asymmetric = new Set<string>()
	for (let first = 0; first < gradients.length; first++) {
		for (let second = first + 1; second < gradients.length; second++) {
			if (!sameFamilyAssignment(gradients[first], gradients[second])) continue
			sameFamilyGradientPairs += 1
			const left = gradients[first].scores.endpointBandSpread
			const right = gradients[second].scores.endpointBandSpread
			const leftMissing = left === null || left === 0
			const rightMissing = right === null || right === 0
			if (leftMissing === rightMissing) continue
			asymmetricPairs += 1
			asymmetric.add(gradients[first].id)
			asymmetric.add(gradients[second].id)
		}
	}
	const report: ImageReport = {
		image: name,
		bySource: perImage,
		gradientCandidates: gradients.length,
		asymmetricPairs,
		asymmetricCandidates: asymmetric.size,
		sameFamilyGradientPairs,
	}
	reports.push(report)
	const summary = Object.entries(perImage).sort().map(([source, entry]) =>
		`${source}: ${entry.measured}/${entry.candidates} measured>0, ${entry.absent} absent`).join("; ")
	console.log(`${name.padEnd(20)} ${summary || "no gradient candidates"}`)
	console.log(`${" ".repeat(20)} same-family gradient pairs ${sameFamilyGradientPairs}, asymmetric ${asymmetricPairs}, candidates touched ${asymmetric.size}/${gradients.length}`)
}

console.log("\n== all images ==")
for (const [source, entry] of Object.entries(totals).sort()) {
	console.log(`${source.padEnd(26)} ${entry.measured}/${entry.candidates} carry a nonzero spread, ${entry.measuredZero} measured zero, ${entry.absent} absent`)
}

if (jsonPath) {
	await writeFile(jsonPath, `${JSON.stringify({ imagesRoot, totals, reports }, null, "\t")}\n`)
	console.log(`\n-> ${jsonPath}`)
}
