/**
 * Turn detector hits into a reviewable series.
 *
 * For each selected case this re-runs the pipeline and writes TWO pseudo-result files in the
 * schema `research/v2-3-eval/data/results/<label>/<image>.json` uses:
 *
 *   vivid-series-incumbent/<name>.json   the current winner, exactly as trunk produces it
 *   vivid-series-vivid/<name>.json       the SAME field/foreground with the accent replaced by
 *                                        the small vivid family's representative
 *
 * The vivid side is never synthesised: it is lifted from a real scored treatment on the actual
 * slate, so every colour is source-supported and every arrangement is one the objective already
 * evaluated and ranked. `researchRender` is copied from the treatment's own render contract so
 * a gradient case renders the same ramp on both sides.
 *
 * Also writes a manifest with the measured statistics behind each trade-off.
 *
 * usage: build-review-series.ts <hits.jsonl> <selection.txt>
 */
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile, stat } from "node:fs/promises"
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, DEFAULT_PALETTE_EXTRACTION_OPTIONS, constructAlbumArtworkPaletteV2Phase3SupplementalTreatments } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { normalizeAlbumArtworkPaletteV2Phase3TransitionEnvelopeV4 } from "../../v2-3/src/internal/transition-normalization.ts"
import { materializeAlbumArtworkPaletteV2Phase3Descriptors } from "../../v2-3/src/internal/candidate-materialization.ts"
import { buildRoleEvidence } from "../../v2-3/src/internal/role-evidence.ts"
import { scorePaletteCandidates } from "../../v2-3/src/internal/winner-scoring.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"
import type { AlbumArtworkPaletteV2Phase3LogicalDescriptor, AlbumArtworkPaletteV2Phase3SourcedFieldHypothesis } from "../../v2-3/src/internal/candidate-domain.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"
// Two destinations. The shared checkout's `results/` is where the eval harness and review app
// read from, but it is gitignored, so a copy also goes under this track's folder to be committed.
const OUT = `${ROOT}/research/v2-3-eval/data/results`
const COMMITTED = `${import.meta.dirname}/review-series`
const chromaOf = ([, a, b]: readonly number[]): number => Math.hypot(a, b)

const [hitsPath, selectionPath] = process.argv.slice(2)
if (!hitsPath || !selectionPath) throw new Error("usage: build-review-series.ts <hits.jsonl> <selection.txt>")
const hits = new Map((await readFile(hitsPath, "utf8")).split("\n").filter(Boolean)
	.map((line) => JSON.parse(line) as Record<string, any>).map((hit) => [hit.image as string, hit]))
const selection = (await readFile(selectionPath, "utf8")).split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))

for (const base of [OUT, COMMITTED]) {
	await mkdir(`${base}/vivid-series-incumbent`, { recursive: true })
	await mkdir(`${base}/vivid-series-vivid`, { recursive: true })
}

const colorRecord = (color: Readonly<{ rgb: readonly number[]; oklab: readonly number[]; hex: string; generated?: boolean }>) => ({
	rgb: [...color.rgb], oklab: [...color.oklab], hex: color.hex, generated: Boolean(color.generated),
})

type ManifestEntry = Record<string, unknown>
const manifest: ManifestEntry[] = []

for (const caseFile of selection) {
	const hit = hits.get(caseFile)
	if (!hit) { console.log(`SKIP ${caseFile} — not in hits`); continue }
	const bytes = await readFile(`${ROOT}/${caseFile}`)
	const sha256 = createHash("sha256").update(bytes).digest("hex")
	const byteCount = (await stat(`${ROOT}/${caseFile}`)).size
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

	const ranked = [...scored.evaluations].sort((a, b) => b.relationUtility - a.relationUtility)
	const winner = ranked.find((e) => e.treatment === (scored.winner as never)) ?? ranked[0]
	const w = winner.treatment
	const rival = ranked.find((e) => {
		const t = e.treatment
		return t !== w && !t.collapse.accent &&
			t.background.hex === w.background.hex && t.surface.hex === w.surface.hex &&
			t.foreground.hex === w.foreground.hex && t.gradient === w.gradient &&
			t.accent.hex === hit.vivid.hex && t.familyRoles.accent === hit.vivid.familyId
	})
	if (!rival) { console.log(`SKIP ${caseFile} — vivid rival no longer on the slate`); continue }

	// The published midpoint comes from the same entry point the eval harness uses, so the
	// rendered ramp on both sides is the one a viewer would actually see.
	const published = extractPaletteDetails(image)
	const midpoint = published.midpoint.color?.hex ?? null
	const name = caseFile.split("/").pop()!
	const render = (gradient: boolean) => gradient
		? {
			schemaVersion: 1,
			field: {
				kind: "linear-gradient", angleDegrees: 135, interpolation: "oklab",
				stops: [
					{ kind: "role", role: "background", position: 0 },
					...(midpoint ? [{ kind: "source-supported-color", hex: midpoint, position: 0.5 }] : []),
					{ kind: "role", role: "surface", position: 1 },
				],
			},
		}
		: { schemaVersion: 1, field: { kind: "solid", role: "background" } }

	const write = async (label: string, evaluation: typeof winner): Promise<void> => {
		const t = evaluation.treatment
		const body = `${JSON.stringify({
			schemaVersion: 1,
			label,
			algorithm: "v2-3",
			algorithmIdentity: "v2-3",
			image: name,
			imagePath: caseFile,
			sourceSha256: sha256,
			byteCount,
			extraction: {
				algorithm: "v2-3",
				width: image.width,
				height: image.height,
				winner: {
					background: colorRecord(t.background), surface: colorRecord(t.surface),
					foreground: colorRecord(t.foreground), accent: colorRecord(t.accent),
					gradient: t.gradient,
					collapse: { surface: t.collapse.surface, accent: t.collapse.accent },
				},
				researchRender: render(t.gradient),
			},
		}, null, 1)}\n`
		for (const base of [OUT, COMMITTED]) await writeFile(`${base}/${label}/${name}.json`, body)
	}
	await write("vivid-series-incumbent", winner)
	await write("vivid-series-vivid", rival)

	const vividFamily = hit.vivid
	manifest.push({
		image: caseFile,
		name,
		sourceSha256: sha256,
		root: caseFile.slice(0, 2),
		dimensions: [image.width, image.height],
		gradient: w.gradient,
		midpoint,
		incumbent: {
			palette: [w.background.hex, w.surface.hex, w.foreground.hex, w.accent.hex],
			accentHex: w.accent.hex,
			accentChroma: Number(chromaOf(w.accent.oklab).toFixed(4)),
			accentFamilyPopulationPercent: Number((hit.winnerAccent.populationFraction * 100).toFixed(3)),
			accentFamilyMarkSupport: Number(hit.winnerAccent.markSupport.toFixed(3)),
			relationUtility: Number(winner.relationUtility.toFixed(4)),
			qualityUtility: Number(winner.qualityUtility.toFixed(4)),
			identityCoverage: Number(winner.identityCoverage.toFixed(3)),
		},
		vivid: {
			palette: [rival.treatment.background.hex, rival.treatment.surface.hex,
				rival.treatment.foreground.hex, rival.treatment.accent.hex],
			accentHex: rival.treatment.accent.hex,
			accentChroma: Number(chromaOf(rival.treatment.accent.oklab).toFixed(4)),
			accentFamilyPopulationPercent: Number((vividFamily.populationFraction * 100).toFixed(3)),
			accentFamilyMarkSupport: Number(vividFamily.markSupport.toFixed(3)),
			obligationPriority: vividFamily.obligationPriority,
			inSignatureLane: vividFamily.inSignatureLane,
			relationUtility: Number(rival.relationUtility.toFixed(4)),
			qualityUtility: Number(rival.qualityUtility.toFixed(4)),
			identityCoverage: Number(rival.identityCoverage.toFixed(3)),
			slateRank: ranked.indexOf(rival),
		},
		tradeoff: {
			chromaLead: Number((chromaOf(rival.treatment.accent.oklab) - chromaOf(w.accent.oklab)).toFixed(4)),
			populationRatio: Number(hit.populationRatio.toFixed(1)),
			relationMargin: Number((winner.relationUtility - rival.relationUtility).toFixed(4)),
			qualityMargin: Number((winner.qualityUtility - rival.qualityUtility).toFixed(4)),
			identityGainMargin: Number((winner.identityGain - rival.identityGain).toFixed(4)),
			identityShareOfMargin: Number(((winner.identityGain - rival.identityGain) /
				Math.max(1e-9, winner.relationUtility - rival.relationUtility)).toFixed(3)),
		},
	})
	console.log(`OK   ${caseFile}  ${w.accent.hex} -> ${rival.treatment.accent.hex}`)
}

const manifestBody = `${JSON.stringify({
	schemaVersion: 1,
	generatedBy: "research/v2-3-experiments/track-n/build-review-series.ts",
	trunk: "3cb2ecd",
	question: "Should a small, highly saturated family beat a larger family that is already fully chromatic, for the accent role?",
	detectorSignature: {
		winnerFullChroma: 0.09,
		winnerPopulationFloor: 0.015,
		smallPopulation: 0.015,
		chromaLead: 0.06,
		populationRatio: 2,
	},
	labels: { incumbent: "vivid-series-incumbent", vivid: "vivid-series-vivid" },
	cases: manifest,
}, null, 1)}\n`
for (const base of [OUT, COMMITTED]) await writeFile(`${base}/vivid-series-manifest.json`, manifestBody)
console.log(`\nwrote ${manifest.length} case pairs and the manifest`)
