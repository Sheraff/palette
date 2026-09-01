import { createHash, randomUUID } from "node:crypto"
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { buildChromaticCandidateAvailability } from "./src/chromatic-candidate-availability.ts"
import {
	CHROMATIC_CANDIDATE_GENERATION_TRACE_VERSION,
	traceChromaticCandidateGeneration,
} from "./src/chromatic-candidate-generation-trace.ts"
import { loadImage } from "./src/image.ts"
import { extractRegionGraph017PaletteWithContext } from "./src/region-graph-0.17-extract.ts"

const cases = [
	{
		caseId: "pa00-db1e50f64820c77a0020",
		file: "00/ab67616d0000b273000058c3996b51b7579968f0.jpg",
		requestedFamilies: ["white-typography", "red-light-effect"],
	},
	{
		caseId: "pa00-fd039db1bbdea9bd080f",
		file: "00/ab67616d0000b2730000c4e4d278f49bbc995440.jpg",
		requestedFamilies: ["salmon-pink-typography"],
	},
	{
		caseId: "pa00-c551e604a876534799ec",
		file: "00/ab67616d0000b273000078b16e6bd8cff8e3807b.jpg",
		requestedFamilies: ["desaturated-green-detail"],
	},
] as const

const [outputArgument, ...unexpected] = process.argv.slice(2)
if (!outputArgument || unexpected.length > 0) {
	throw new Error("Usage: evaluate-chromatic-candidate-generation-trace.ts <output.json>")
}

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const outputPath = resolve(outputArgument)

function sha256(value: Uint8Array | string): string {
	return createHash("sha256").update(value).digest("hex")
}

async function fileSha256(file: string): Promise<string> {
	return sha256(await readFile(resolve(projectRoot, file)))
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true })
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	try {
		await link(temporary, path)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Refusing to overwrite ${path}`)
		throw error
	} finally {
		await rm(temporary, { force: true })
	}
}

const entries = []
for (const entry of cases) {
	const bytes = await readFile(resolve(projectRoot, entry.file))
	const image = await loadImage(bytes)
	const context = extractRegionGraph017PaletteWithContext(image)
	const availability = buildChromaticCandidateAvailability(context.analysis, context.candidates)
	entries.push({
		caseId: entry.caseId,
		file: entry.file,
		requestedFamilies: entry.requestedFamilies,
		sourceSha256: sha256(bytes),
		normalizedDimensions: { width: image.width, height: image.height },
		canonicalCandidateCount: context.candidates.length,
		productionAvailability: {
			diagnostics: availability.diagnostics,
			supplements: availability.supplements.map((supplement) => ({
				anchorDegrees: supplement.anchorDegrees,
				hex: supplement.candidate.hex,
				population: supplement.candidate.population,
				chroma: supplement.candidate.chroma,
				saliency: supplement.candidate.saliency,
				text: supplement.candidate.text,
				nearestBaselineDistance: supplement.nearestBaselineDistance,
			})),
		},
		trace: traceChromaticCandidateGeneration(context.analysis, context.candidates),
	})
}

await writeExclusive(outputPath, {
	schemaVersion: 1,
	experimentVersion: CHROMATIC_CANDIDATE_GENERATION_TRACE_VERSION,
	generatedAt: new Date().toISOString(),
	developmentEvidence: true,
	bindings: {
		auditInterpretationSha256: await fileSha256(
			"research/data/experiments/palette-role-00-audit-0.2.0-development/interpretation.json",
		),
		counterfactualAnalysisSha256: await fileSha256(
			"research/data/experiments/palette-role-counterfactual-trace-0.1.0-development/analysis.json",
		),
		canonicalAvailabilitySourceSha256: await fileSha256("research/src/chromatic-candidate-availability.ts"),
		traceSourceSha256: await fileSha256("research/src/chromatic-candidate-generation-trace.ts"),
	},
	interpretationPolicy: {
		requestedFamiliesComeFromQualitativeComments: true,
		targetHexesAreNotInferred: true,
		positivePaletteRatingsRemainNonExclusive: true,
		traceDoesNotAuthorizeRoleAssignment: true,
	},
	entries,
})
process.stderr.write(`Wrote candidate generation trace to ${relative(projectRoot, outputPath)}\n`)
