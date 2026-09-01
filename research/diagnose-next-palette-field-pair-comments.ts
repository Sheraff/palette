import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { apcaContrast } from "./src/color.ts"
import { namePalette } from "./src/color-name.ts"
import { loadImage } from "./src/image.ts"
import {
	extractNextPaletteFieldPairWithContext,
	NEXT_PALETTE_FIELD_PAIR_ALGORITHM_VERSION,
	orderedFieldPairSupport,
} from "./src/next-palette-field-pair.ts"
import { NEXT_PALETTE_DEVELOPMENT_POLICY } from "./src/next-palette.ts"
import {
	nextPaletteReviewRoles,
	parseNextPaletteReviewManifest,
} from "./src/next-palette-review.ts"
import type { CandidateSpatialEvidence } from "./src/candidates.ts"
import type { PaletteEvidenceNode } from "./src/palette-evidence-graph.ts"
import type { Palette, RGB } from "./src/types.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const reviewRoot = resolve(
	projectRoot,
	"research/data/experiments/next-palette-0.2.0-field-pair-development/review-v1",
)
const manifestPath = resolve(reviewRoot, "batch-01-manifest.json")
const feedbackPath = resolve(reviewRoot, "batch-01-feedback.json")
const analysisPath = resolve(reviewRoot, "batch-01-partial-analysis.json")
const outputPath = resolve(reviewRoot, "comment-case-diagnostics-partial-batch-01.json")

type PartialAnalysis = {
	experimentId: string
	entries: Array<{ caseId: string; file: string; note: string }>
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function semanticKey(palette: Palette): string {
	return JSON.stringify({
		roles: nextPaletteReviewRoles.map((role) => [role, palette[role].rgb, palette[role].generated]),
		gradient: palette.gradient.isGradient,
	})
}

function presentedKey(palette: {
	roles: Record<string, { rgb: RGB; generated: boolean }>
	gradient: { isGradient: boolean }
}): string {
	return JSON.stringify({
		roles: nextPaletteReviewRoles.map((role) => [role, palette.roles[role].rgb, palette.roles[role].generated]),
		gradient: palette.gradient.isGradient,
	})
}

function passes(lc: number, positiveMinimum: number, negativeMagnitude: number): boolean {
	return lc >= positiveMinimum || lc <= -negativeMagnitude
}

function summarizeSpatial(spatial: CandidateSpatialEvidence) {
	return {
		population: spatial.population,
		regionCount: spatial.regionIds.length,
		componentCount: spatial.components.length,
		largestComponentPopulation: Math.max(0, ...spatial.components.map((component) => component.population)),
		maximumComponentSaliency: Math.max(0, ...spatial.components.map((component) => component.saliency)),
		maximumComponentText: Math.max(0, ...spatial.components.map((component) => component.text)),
		sideCoverage: spatial.sideCoverage,
		field: spatial.field,
		detail: spatial.detail,
		frame: spatial.frame,
	}
}

const [manifestSource, feedbackSource, analysisSource] = await Promise.all([
	readFile(manifestPath),
	readFile(feedbackPath),
	readFile(analysisPath),
])
const manifest = parseNextPaletteReviewManifest(JSON.parse(manifestSource.toString("utf8")) as unknown)
const analysis = JSON.parse(analysisSource.toString("utf8")) as PartialAnalysis
if (analysis.experimentId !== manifest.experimentId) throw new Error("Comment diagnostic experiment binding changed")
const manifestByCase = new Map(manifest.entries.map((entry) => [entry.caseId, entry]))
const comments = analysis.entries.filter((entry) => entry.note.length > 0)
if (comments.length !== 9) throw new Error(`Expected 9 submitted comments, found ${comments.length}`)

const entries = []
for (const comment of comments) {
	const review = manifestByCase.get(comment.caseId)
	if (!review || review.source.file !== comment.file) throw new Error(`Comment review entry changed: ${comment.caseId}`)
	const source = await readFile(resolve(projectRoot, review.source.file))
	if (source.byteLength !== review.source.bytes || sha256(source) !== review.source.sha256) {
		throw new Error(`Comment source changed: ${review.source.file}`)
	}
	const context = extractNextPaletteFieldPairWithContext(await loadImage(source))
	const candidateOption = review.assignment.A === "candidate" ? review.options.A : review.options.B
	if (context.certificate.algorithmVersion !== NEXT_PALETTE_FIELD_PAIR_ALGORITHM_VERSION ||
		semanticKey(context.palette) !== presentedKey(candidateOption)) {
		throw new Error(`Comment case no longer reproduces the reviewed candidate: ${review.source.file}`)
	}
	const graph = context.graph
	const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
	const selectedIds = context.certificate.selected.candidateIds
	const selectedRoles = (node: PaletteEvidenceNode) => nextPaletteReviewRoles.filter((role) => selectedIds[role] === node.id)
	const background = nodeById.get(selectedIds.background as number)!
	const surface = nodeById.get(selectedIds.surface as number)!
	const contrast = (foreground: PaletteEvidenceNode, field: PaletteEvidenceNode): number =>
		foreground.id === field.id ? apcaContrast(foreground.rgb, field.rgb) :
			graph.edges.find((edge) => edge.fromId === foreground.id && edge.toId === field.id)!.apcaLc
	const sourceForegroundPasses = (foreground: PaletteEvidenceNode, first: PaletteEvidenceNode, second: PaletteEvidenceNode) =>
		passes(
			contrast(foreground, first),
			NEXT_PALETTE_DEVELOPMENT_POLICY.foregroundDarkOnLightMinimumLc,
			NEXT_PALETTE_DEVELOPMENT_POLICY.foregroundLightOnDarkMinimumMagnitudeLc,
		) && passes(
			contrast(foreground, second),
			NEXT_PALETTE_DEVELOPMENT_POLICY.foregroundDarkOnLightMinimumLc,
			NEXT_PALETTE_DEVELOPMENT_POLICY.foregroundLightOnDarkMinimumMagnitudeLc,
		)
	const sourceForegroundCandidateIdsForSelectedFields = graph.nodes
		.filter((node) => sourceForegroundPasses(node, background, surface)).map((node) => node.id)
	let fieldPairsWithSourceForeground = 0
	const fieldNodes = graph.nodes.filter((node) => !node.typographyOnly)
	for (const first of fieldNodes) {
		for (const second of fieldNodes) {
			if (graph.nodes.some((node) => sourceForegroundPasses(node, first, second))) fieldPairsWithSourceForeground++
		}
	}
	const pairEvidence = graph.edges.filter((edge) => edge.field).map((edge) => {
		const from = nodeById.get(edge.fromId)!
		const to = nodeById.get(edge.toId)!
		const names = namePalette([from.rgb, to.rgb])
		return {
			fromId: from.id,
			fromHex: from.hex,
			fromName: names[0].nearestName,
			toId: to.id,
			toHex: to.hex,
			toName: names[1].nearestName,
			orderedFieldPairSupport: orderedFieldPairSupport(edge),
			gradientModelScore: edge.field!.model.score,
			absolutePairCoverage: edge.field!.topology.histogram.absolutePairCoverage,
			endpointSupport: edge.field!.topology.features.endpointSupport,
			fieldOwnership: edge.field!.topology.features.fieldOwnership,
			distributionContinuity: edge.field!.topology.features.distributionContinuity,
			connectedIntermediateContinuity: edge.field!.topology.features.connectedIntermediateContinuity,
			selected: selectedIds.background === from.id && selectedIds.surface === to.id,
		}
	}).sort((first, second) => Number(second.selected) - Number(first.selected) ||
		second.orderedFieldPairSupport - first.orderedFieldPairSupport || first.fromId - second.fromId || first.toId - second.toId)
	const candidateNames = namePalette(graph.nodes.map((node) => node.rgb))
	entries.push({
		caseId: comment.caseId,
		file: comment.file,
		note: comment.note,
		source: {
			sha256: review.source.sha256,
			width: review.source.width,
			height: review.source.height,
		},
		selected: {
			roles: Object.fromEntries(nextPaletteReviewRoles.map((role) => [role, {
				hex: context.palette[role].hex,
				generated: context.palette[role].generated,
				candidateId: selectedIds[role],
			}])),
			gradient: context.certificate.selected.gradientState,
			objectives: context.certificate.selected.objectives,
		},
		domain: {
			nodeCount: graph.nodes.length,
			fieldNodeCount: fieldNodes.length,
			sourceForegroundCandidateIdsForSelectedFields,
			fieldPairsWithSourceForeground,
		},
		nodes: graph.nodes.map((node, index) => ({
			id: node.id,
			hex: node.hex,
			nearestName: candidateNames[index].nearestName,
			population: node.population,
			background: node.background,
			saliency: node.saliency,
			text: node.text,
			chroma: node.chroma,
			typographyOnly: node.typographyOnly,
			familyId: node.familyId,
			spatial: summarizeSpatial(node.spatial),
			familySpatial: summarizeSpatial(node.familySpatial),
			foregroundLc: {
				onSelectedBackground: contrast(node, background),
				onSelectedSurface: contrast(node, surface),
				passesSelectedFields: sourceForegroundPasses(node, background, surface),
			},
			selectedRoles: selectedRoles(node),
		})),
		orderedFieldPairs: pairEvidence.slice(0, 12),
	})
}

const output = {
	schemaVersion: 1,
	experimentId: manifest.experimentId,
	candidateAlgorithmVersion: NEXT_PALETTE_FIELD_PAIR_ALGORITHM_VERSION,
	generatedAt: new Date().toISOString(),
	provenance: {
		manifestSha256: sha256(manifestSource),
		feedbackSha256: sha256(feedbackSource),
		partialAnalysisSha256: sha256(analysisSource),
		implementationSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
	},
	policy: {
		diagnosticOnly: true,
		commentTextDoesNotEnterInference: true,
		targetColorsInferred: false,
	},
	entries,
}
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, { flag: "wx" })
process.stderr.write(`Diagnosed ${entries.length} commented field-pair review cases at ${outputPath}\n`)
