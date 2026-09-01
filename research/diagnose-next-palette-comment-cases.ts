import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { apcaContrast, okDistance, rgbToOKLab } from "./src/color.ts"
import { nameRGB } from "./src/color-name.ts"
import { loadImage } from "./src/image.ts"
import {
	extractNextPaletteWithContext,
	NEXT_PALETTE_ALGORITHM_VERSION,
	NEXT_PALETTE_DEVELOPMENT_POLICY,
} from "./src/next-palette.ts"
import type { PaletteEvidenceNode } from "./src/palette-evidence-graph.ts"
import type { CorpusResult, Palette, RGB } from "./src/types.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const experimentRoot = resolve(projectRoot, "research/data/experiments/next-palette-0.1.0-development")
const reviewRoot = resolve(experimentRoot, "review-v2")
const outputPath = resolve(reviewRoot, "comment-case-diagnostics-batches-01-02.json")

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function passes(lc: number, positiveMinimum: number, negativeMinimumMagnitude: number): boolean {
	return lc >= positiveMinimum || lc <= -negativeMinimumMagnitude
}

function mean(values: readonly number[]): number {
	return values.reduce((sum, value) => sum + Math.max(0, Math.min(1, value)), 0) / values.length
}

function fieldSupport(node: PaletteEvidenceNode, maximumPopulation: number): number {
	return mean([
		node.background,
		node.spatial.field,
		node.familySpatial.field,
		Math.sqrt(node.population / maximumPopulation),
	])
}

function identitySupport(node: PaletteEvidenceNode, maximumPopulation: number, maximumChroma: number): number {
	return mean([
		node.chroma / Math.max(maximumChroma, 1e-12),
		node.saliency,
		Math.max(node.spatial.detail, node.familySpatial.detail),
		Math.sqrt(node.population / maximumPopulation),
	])
}

function distinctColorCount(colors: readonly RGB[]): number {
	return new Set(colors.map((rgb) => rgb.join(","))).size
}

const interpretationSource = await readFile(resolve(reviewRoot, "comment-interpretation-batches-01-02.json"))
const interpretation = JSON.parse(interpretationSource.toString("utf8")) as {
	experimentId: string
	entries: Array<{ batch: number; caseId: string; file: string; scope: string; classifications: string[]; finding: string }>
}
const [developmentSource, source00] = await Promise.all([
	readFile(resolve(experimentRoot, "candidate-results.json")),
	readFile(resolve(experimentRoot, "candidate-00-results.json")),
])
const development = JSON.parse(developmentSource.toString("utf8")) as CorpusResult
const canonical00 = JSON.parse(source00.toString("utf8")) as CorpusResult
if (development.algorithmVersion !== NEXT_PALETTE_ALGORITHM_VERSION || canonical00.algorithmVersion !== NEXT_PALETTE_ALGORITHM_VERSION) {
	throw new Error("Comment diagnostics candidate artifacts are stale")
}
const artifactByFile = new Map([...development.entries, ...canonical00.entries].map((entry) => [entry.file, entry]))
const diagnostics = []
for (const interpreted of interpretation.entries) {
	const artifactFile = interpreted.file.startsWith("images/") ? interpreted.file.slice("images/".length) : interpreted.file
	const artifact = artifactByFile.get(artifactFile)
	if (!artifact) throw new Error(`Missing candidate artifact for ${interpreted.file}`)
	const sourcePath = interpreted.file.startsWith("images/") ? interpreted.file : artifactFile
	const bytes = await readFile(resolve(projectRoot, sourcePath))
	const image = await loadImage(bytes)
	const result = extractNextPaletteWithContext(image)
	if (!sameRgb(result.palette.background.rgb, artifact.extraction.methods.spatial.background.rgb) ||
		!sameRgb(result.palette.foreground.rgb, artifact.extraction.methods.spatial.foreground.rgb) ||
		!sameRgb(result.palette.surface.rgb, artifact.extraction.methods.spatial.surface.rgb) ||
		!sameRgb(result.palette.accent.rgb, artifact.extraction.methods.spatial.accent.rgb) ||
		result.palette.gradient.isGradient !== artifact.extraction.methods.spatial.gradient.isGradient) {
		throw new Error(`Frozen candidate output changed for ${interpreted.file}`)
	}
	const nodes = result.graph.nodes
	const fields = nodes.filter((node) => !node.typographyOnly)
	const maximumPopulation = Math.max(...nodes.map((node) => node.population))
	const maximumChroma = Math.max(...nodes.map((node) => node.chroma))
	const selectedIds = result.certificate.selected.candidateIds
	const selectedNode = (role: "background" | "foreground" | "surface" | "accent") => {
		const id = selectedIds[role]
		return typeof id === "number" ? nodes.find((node) => node.id === id) ?? null : null
	}
	const background = selectedNode("background")!
	const surface = selectedNode("surface")!
	const foregroundRgb = result.palette.foreground.rgb
	const accentRgb = result.palette.accent.rgb
	const accentLab = selectedNode("accent")?.lab ?? rgbToOKLab(accentRgb)
	const foregroundLc = (field: PaletteEvidenceNode): number => apcaContrast(foregroundRgb, field.rgb)
	const accentLc = (field: PaletteEvidenceNode): number => apcaContrast(accentRgb, field.rgb)
	const foregroundPassesField = (field: PaletteEvidenceNode): boolean => passes(
		foregroundLc(field),
		NEXT_PALETTE_DEVELOPMENT_POLICY.foregroundDarkOnLightMinimumLc,
		NEXT_PALETTE_DEVELOPMENT_POLICY.foregroundLightOnDarkMinimumMagnitudeLc,
	)
	const accentPassesField = (rgb: RGB, field: PaletteEvidenceNode): boolean => passes(
		apcaContrast(rgb, field.rgb),
		NEXT_PALETTE_DEVELOPMENT_POLICY.accentDarkOnLightMinimumLc,
		NEXT_PALETTE_DEVELOPMENT_POLICY.accentLightOnDarkMinimumMagnitudeLc,
	)
	const feasibleAccents = nodes.filter((node) =>
		accentPassesField(node.rgb, background) && accentPassesField(node.rgb, surface) &&
		okDistance(node.lab, background.lab) >= NEXT_PALETTE_DEVELOPMENT_POLICY.distinctAccentFieldMinimumDistance &&
		okDistance(node.lab, surface.lab) >= NEXT_PALETTE_DEVELOPMENT_POLICY.distinctAccentFieldMinimumDistance)
	const sourceForegrounds = nodes.filter((node) =>
		passes(apcaContrast(node.rgb, background.rgb),
			NEXT_PALETTE_DEVELOPMENT_POLICY.foregroundDarkOnLightMinimumLc,
			NEXT_PALETTE_DEVELOPMENT_POLICY.foregroundLightOnDarkMinimumMagnitudeLc) &&
		passes(apcaContrast(node.rgb, surface.rgb),
			NEXT_PALETTE_DEVELOPMENT_POLICY.foregroundDarkOnLightMinimumLc,
			NEXT_PALETTE_DEVELOPMENT_POLICY.foregroundLightOnDarkMinimumMagnitudeLc))
	const feasibleDistinctSurfaces = fields.filter((node) =>
		node.id !== background.id && okDistance(node.lab, background.lab) >= NEXT_PALETTE_DEVELOPMENT_POLICY.distinctFieldMinimumDistance &&
		foregroundPassesField(node) && accentPassesField(accentRgb, node) &&
		okDistance(accentLab, node.lab) >=
			NEXT_PALETTE_DEVELOPMENT_POLICY.distinctAccentFieldMinimumDistance &&
		distinctColorCount([background.rgb, foregroundRgb, node.rgb, accentRgb]) <=
			NEXT_PALETTE_DEVELOPMENT_POLICY.maximumDistinctRoleColors)
	let fieldPairsWithSourceForeground = 0
	for (const candidateBackground of fields) {
		for (const candidateSurface of fields) {
			if (candidateBackground.id !== candidateSurface.id &&
				okDistance(candidateBackground.lab, candidateSurface.lab) < NEXT_PALETTE_DEVELOPMENT_POLICY.distinctFieldMinimumDistance) continue
			if (nodes.some((node) => passes(
				apcaContrast(node.rgb, candidateBackground.rgb),
				NEXT_PALETTE_DEVELOPMENT_POLICY.foregroundDarkOnLightMinimumLc,
				NEXT_PALETTE_DEVELOPMENT_POLICY.foregroundLightOnDarkMinimumMagnitudeLc,
			) && passes(
				apcaContrast(node.rgb, candidateSurface.rgb),
				NEXT_PALETTE_DEVELOPMENT_POLICY.foregroundDarkOnLightMinimumLc,
				NEXT_PALETTE_DEVELOPMENT_POLICY.foregroundLightOnDarkMinimumMagnitudeLc,
			))) fieldPairsWithSourceForeground++
		}
	}
	const nodeSummary = (node: PaletteEvidenceNode) => ({
		id: node.id,
		hex: node.hex,
		nearestName: nameRGB(node.rgb).nearestName,
		population: node.population,
		background: node.background,
		saliency: node.saliency,
		text: node.text,
		chroma: node.chroma,
		typographyOnly: node.typographyOnly,
		familyId: node.familyId,
		fieldSupport: fieldSupport(node, maximumPopulation),
		identitySupport: identitySupport(node, maximumPopulation, maximumChroma),
		accentLc: {
			onSelectedBackground: apcaContrast(node.rgb, background.rgb),
			onSelectedSurface: apcaContrast(node.rgb, surface.rgb),
		},
		foregroundLc: {
			onSelectedBackground: apcaContrast(node.rgb, background.rgb),
			onSelectedSurface: apcaContrast(node.rgb, surface.rgb),
		},
		selectedRoles: (["background", "foreground", "surface", "accent"] as const)
			.filter((role) => typeof selectedIds[role] === "number" && selectedIds[role] === node.id),
	})
	diagnostics.push({
		...interpreted,
		source: { path: sourcePath, sha256: sha256(bytes), width: image.width, height: image.height },
		selected: {
			roles: Object.fromEntries((["background", "foreground", "surface", "accent"] as const).map((role) => [role, {
				hex: result.palette[role].hex,
				nearestName: nameRGB(result.palette[role].rgb).nearestName,
				generated: result.palette[role].generated,
				candidateId: selectedIds[role],
			}])),
			gradient: result.certificate.selected.gradientState,
			distinctRoleColors: distinctColorCount([
				result.palette.background.rgb,
				result.palette.foreground.rgb,
				result.palette.surface.rgb,
				result.palette.accent.rgb,
			]),
			objectives: result.certificate.selected.objectives,
		},
		domain: {
			nodeCount: nodes.length,
			familyCount: new Set(nodes.map((node) => node.familyId)).size,
			fieldNodeCount: fields.length,
			feasibleAccentCandidateIds: feasibleAccents.map((node) => node.id),
			sourceForegroundCandidateIdsForSelectedFields: sourceForegrounds.map((node) => node.id),
			feasibleDistinctSurfaceCandidateIdsForSelectedTuple: feasibleDistinctSurfaces.map((node) => node.id),
			fieldPairsWithSourceForeground,
		},
		nodes: nodes.map(nodeSummary),
	})
}

const output = {
	schemaVersion: 1,
	experimentId: interpretation.experimentId,
	candidateAlgorithmVersion: NEXT_PALETTE_ALGORITHM_VERSION,
	generatedAt: new Date().toISOString(),
	provenance: {
		interpretationSha256: sha256(interpretationSource),
		candidateDevelopmentSha256: sha256(developmentSource),
		candidate00Sha256: sha256(source00),
		implementationSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
	},
	policy: {
		diagnosticOnly: true,
		commentTextDoesNotEnterInference: true,
		targetColorsInferred: false,
	},
	entries: diagnostics,
}
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, { flag: "wx" })
process.stderr.write(`Wrote ${diagnostics.length} comment-case diagnostics to ${outputPath}\n`)
