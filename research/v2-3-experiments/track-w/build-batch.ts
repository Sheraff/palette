/**
 * Track W — batch-25 review materials.
 *
 * Writes `CachedResult` records (the shape `research/v2-3-eval/src/shared.ts` defines and the
 * review app reads) into a result-label directory.
 *
 * Two modes, because the two sides come from different runtimes and different sources:
 *
 *   winners <label> <outDir> <case>...
 *     Real extraction; the winner of whatever runtime is currently checked out. Used for the
 *     `before` side (runtime at 979c245) and for the `after` side of items 1-5 (runtime with
 *     the display-text grant + obligation-rank bound).
 *
 *   treatments <label> <outDir>
 *     Items 6-8. Re-runs the scoring pipeline and selects a named arrangement out of the slate
 *     the UNMODIFIED runtime materialized and scored, so the alternate is `legal` — an
 *     arrangement the algorithm could have chosen — rather than hand-written. Selection is by
 *     exact hex match on all four roles plus the gradient flag, highest `relationUtility` first.
 *
 * Images are read from the shared checkout via PALETTE_IMAGES_ROOT (charter, "Corpus trap").
 */
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename } from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import { buildPaletteSeedDomain, DEFAULT_PALETTE_EXTRACTION_OPTIONS } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "../../v2-3/src/internal/transition-normalization.ts"
import { constructAlbumArtworkPaletteV2Phase3SupplementalTreatments } from "../../v2-3/src/internal/palette-core.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"
import { buildRoleEvidence } from "../../v2-3/src/internal/role-evidence.ts"
import { scorePaletteCandidates } from "../../v2-3/src/internal/winner-scoring.ts"
import type { AlbumArtworkPaletteV2Phase3LogicalDescriptor, AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis } from "../../v2-3/src/internal/candidate-domain.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"
const ROLES = ["background", "surface", "foreground", "accent"] as const

type Color = Readonly<{ rgb: readonly number[]; oklab: readonly number[]; hex: string; generated: boolean }>
const color = (source: Color): unknown => ({
	rgb: [...source.rgb], oklab: [...source.oklab], hex: source.hex, generated: source.generated,
})

/** The eval harness's gradient render descriptor; two role stops when there is no midpoint. */
const researchRender = (midpoint: string | null): unknown => ({
	schemaVersion: 1,
	field: {
		kind: "linear-gradient",
		angleDegrees: 135,
		interpolation: "oklab",
		stops: [
			{ kind: "role", role: "background", position: 0 },
			...(midpoint ? [{ kind: "source-supported-color", hex: midpoint, position: 0.5 }] : []),
			{ kind: "role", role: "surface", position: 1 },
		],
	},
})

function writeRecord(
	outDir: string, label: string, caseFile: string,
	width: number, height: number,
	winner: Record<string, unknown>, midpoint: string | null,
): void {
	const bytes = readFileSync(`${ROOT}/${caseFile}`)
	const record = {
		schemaVersion: 1,
		label,
		algorithm: "v2-3",
		algorithmIdentity: "v2-3",
		image: basename(caseFile),
		imagePath: caseFile,
		sourceSha256: createHash("sha256").update(bytes).digest("hex"),
		byteCount: bytes.byteLength,
		extraction: {
			algorithm: "v2-3",
			width,
			height,
			winner,
			// Flat items carry no render descriptor; gradient items describe the field.
			...(winner.gradient ? { researchRender: researchRender(midpoint) } : {}),
		},
	}
	mkdirSync(outDir, { recursive: true })
	writeFileSync(`${outDir}/${basename(caseFile)}.json`, `${JSON.stringify(record, null, 1)}\n`)
	console.log(`  ${label}  ${basename(caseFile).slice(0, 44).padEnd(44)} ` +
		`${winner.background && (winner.background as Color).hex} ${(winner.surface as Color).hex} ` +
		`${(winner.foreground as Color).hex} ${(winner.accent as Color).hex} ${winner.gradient ? "grad" : "flat"}`)
}

const mode = process.argv[2]
const label = process.argv[3]
const outDir = process.argv[4]
if (!mode || !label || !outDir) throw new Error("usage: build-batch.ts <winners|treatments> <label> <outDir> [case...]")

if (mode === "winners") {
	for (const caseFile of process.argv.slice(5)) {
		const image = await loadNativeImage(`${ROOT}/${caseFile}`)
		const result = extractPaletteDetails(image)
		const w = result.winner
		writeRecord(outDir, label, caseFile, result.width, result.height, {
			background: color(w.background as Color),
			surface: color(w.surface as Color),
			foreground: color(w.foreground as Color),
			accent: color(w.accent as Color),
			gradient: w.gradient,
			collapse: { surface: w.collapse.surface, accent: w.collapse.accent },
		}, result.midpoint.color?.hex ?? null)
	}
} else if (mode === "treatments") {
	/** Items 6-8: the arrangement to lift out of each artwork's own scored slate. */
	const WANTED: readonly Readonly<{ case: string; want: readonly string[]; gradient: boolean }>[] = [
		{
			case: "0f/ab67616d0000b273000f815611cd5966187e2051",
			want: ["#dbdce1", "#fbfbfb", "#f166a1", "#f166a1"], gradient: true,
		},
		{
			case: "0c/ab67616d00001e02000cd48fb26f462cd33760f6",
			want: ["#ffffff", "#ffffff", "#e1317c", "#e1317c"], gradient: false,
		},
		{
			case: "images/johns.jpg",
			want: ["#0d181c", "#315a92", "#f7f8fa", "#ff5a62"], gradient: false,
		},
		{
			// Item 9: the arrangement neutralising `authorizedGain` actually produces (bisect below).
			case: "0d/ab67616d0000b273000d5cdbc67ed815efc360ad",
			want: ["#000000", "#000000", "#f7de67", "#c7c6c1"], gradient: false,
		},
	]
	const only = process.argv[5] ?? null
	for (const { case: caseFile, want, gradient } of WANTED.filter(({ case: entry }) => !only || entry.includes(only))) {
		const image = await loadNativeImage(`${ROOT}/${caseFile}`)
		const options = DEFAULT_PALETTE_EXTRACTION_OPTIONS
		const seed = buildPaletteSeedDomain(image, options)
		const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
		const envelope = normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4(common.evidence.nativeFieldTransitions)
		const normalizedById = new Map(envelope.hypotheses.map((hypothesis) => [hypothesis.id, hypothesis]))
		const candidateFields: AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis[] = common.fieldHypotheses.map((field) =>
			field.sourceType === "native-field-transition"
				? { ...field, hypothesis: normalizedById.get(field.hypothesis.id) ?? field.hypothesis }
				: field)
		const supplementalFields = candidateFields.filter(({ sourceType }) => sourceType !== "native-seed")
		const sourceByHypothesisId = new Map(supplementalFields.map(({ sourceType, hypothesis }) => [hypothesis.id, sourceType]))
		const supplemental = constructAlbumArtworkPaletteV2Phase3SupplementalTreatments(
			common.evidence.augmentedNative, supplementalFields.map(({ hypothesis }) => hypothesis), options)
		const supplementalDescriptors: AlbumArtworkPaletteV2Phase3LogicalDescriptor[] = supplemental.treatments.map((descriptor) => ({
			sourceType: sourceByHypothesisId.get(descriptor.fieldHypothesis.id)!, ...descriptor,
		}))
		const materialization = materializeAlbumArtworkPaletteV2Phase3Descriptors(
			[...common.seedAvailability.logicalDescriptors, ...supplementalDescriptors],
			common.seedAvailability.identityObligations)
		const roleEvidence = buildRoleEvidence(
			common.evidence.augmentedNative,
			[...common.seedAvailability.fieldHypotheses, ...supplemental.hypotheses.map((hypothesis) => ({
				sourceType: sourceByHypothesisId.get(hypothesis.id)!, hypothesis,
			}))].map(({ hypothesis }) => hypothesis),
			common.seedAvailability.identityObligations.map(({ familyId }) => familyId))
		const scored = scorePaletteCandidates(
			materialization.materialized.map(({ treatment }) => treatment),
			{ obligations: common.seedAvailability.identityObligations, roleRequirements: roleEvidence.requirements })
		const match = scored.evaluations
			.filter((evaluation) => evaluation.treatment.gradient === gradient &&
				ROLES.every((role, index) => evaluation.treatment[role].hex === want[index]))
			.sort((first, second) => second.relationUtility - first.relationUtility)[0]
		if (!match) throw new Error(`no on-slate treatment for ${caseFile} matching ${want.join(",")}`)
		const t = match.treatment
		console.log(`  found rel=${match.relationUtility.toFixed(4)} of ${scored.evaluations.length} scored`)
		writeRecord(outDir, label, caseFile, image.width, image.height, {
			background: color(t.background as Color),
			surface: color(t.surface as Color),
			foreground: color(t.foreground as Color),
			accent: color(t.accent as Color),
			gradient: t.gradient,
			collapse: { surface: t.collapse.surface, accent: t.collapse.accent },
		}, null)
	}
} else throw new Error(`unknown mode ${mode}`)
