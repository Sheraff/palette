import { createHash } from "node:crypto"
import { access, readFile, readdir, writeFile } from "node:fs/promises"
import { extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { buildChromaticCandidateAvailability } from "./src/chromatic-candidate-availability.ts"
import { traceChromaticCandidateGeneration } from "./src/chromatic-candidate-generation-trace.ts"
import { addDeterministicNoise, cropOnePixel, loadImage } from "./src/image.ts"
import { extractRegionGraph017PaletteWithContext } from "./src/region-graph-0.17-extract.ts"
import {
	buildTypographyChromaticCandidateAvailability,
	TYPOGRAPHY_CHROMATIC_CANDIDATE_AVAILABILITY_THRESHOLDS,
	TYPOGRAPHY_CHROMATIC_CANDIDATE_AVAILABILITY_VERSION,
} from "./src/typography-chromatic-candidate-availability.ts"

type ReviewClass = "accepted" | "rejected" | "unselected"
type Cohort = "development" | "00"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const experimentRoot = join(
	projectRoot,
	"research/data/experiments/typography-chromatic-candidate-availability-0.2.0-poc.1-development",
)
const outputPath = join(experimentRoot, "evaluation.json")
const supported = new Set([".jpg", ".jpeg", ".png", ".avif", ".webp"])
const targetFile = "00/ab67616d0000b2730000c4e4d278f49bbc995440.jpg"
const implementationFiles = [
	"package.json",
	"pnpm-lock.yaml",
	"research/src/color.ts",
	"research/src/image.ts",
	"research/src/regions.ts",
	"research/src/candidates.ts",
	"research/src/region-graph-0.17-extract.ts",
	"research/src/chromatic-candidate-availability.ts",
	"research/src/chromatic-candidate-generation-trace.ts",
	"research/src/typography-chromatic-candidate-availability.ts",
	"research/evaluate-typography-chromatic-candidate-availability.ts",
] as const

function sha256(value: Uint8Array | string): string {
	return createHash("sha256").update(value).digest("hex")
}

function exactPixel(data: Uint8Array, rgb: readonly number[]): boolean {
	for (let offset = 0; offset < data.length; offset += 3) {
		if (data[offset] === rgb[0] && data[offset + 1] === rgb[1] && data[offset + 2] === rgb[2]) return true
	}
	return false
}

function artworkId(file: string): string {
	return file.startsWith("ab67616d") ? file.slice(16) : file
}

function sourcePreference(file: string): number {
	if (file.startsWith("ab67616d0000b273")) return 2
	if (file.startsWith("ab67616d00001e02")) return 1
	return 0
}

function classifyDevelopment(file: string): "artwork" | "synthetic" | "diagnostic" {
	if (file.includes("-masked") || file.includes("-saliency")) return "diagnostic"
	if (file.startsWith("pure")) return "synthetic"
	return "artwork"
}

async function assertOutputAbsent(): Promise<void> {
	try {
		await access(outputPath)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw new Error(`Refusing to overwrite ${outputPath}`)
}

const absoluteFeedback = JSON.parse(await readFile(
	join(projectRoot, "research/data/absolute-feedback.json"),
	"utf8",
)) as { entries: Array<{ image: string; shippable: boolean }> }
const reviewClass = new Map<string, ReviewClass>(absoluteFeedback.entries.map((entry) => [
	entry.image,
	entry.shippable ? "accepted" : "rejected",
]))

async function evaluate(file: string, cohort: Cohort) {
	const bytes = await readFile(join(projectRoot, file))
	const image = await loadImage(bytes)
	const context = extractRegionGraph017PaletteWithContext(image)
	const candidatesBefore = structuredClone(context.candidates)
	const frozenAvailability = buildChromaticCandidateAvailability(context.analysis, context.candidates)
	const result = buildTypographyChromaticCandidateAvailability(context.analysis, context.candidates)
	if (!isDeepStrictEqual(context.candidates, candidatesBefore)) throw new Error(`Canonical candidates changed for ${file}`)
	if (!isDeepStrictEqual(result.baselineAvailability, frozenAvailability)) {
		throw new Error(`Frozen availability changed for ${file}`)
	}
	if (result.addedSupplements.some((supplement) => !exactPixel(image.data, supplement.candidate.rgb))) {
		throw new Error(`Non-source typography supplement for ${file}`)
	}
	return {
		file,
		cohort,
		kind: cohort === "development" ? classifyDevelopment(file.slice("images/".length)) : "artwork",
		reviewClass: cohort === "00" ? reviewClass.get(file) ?? "unselected" : null,
		sourceSha256: sha256(bytes),
		normalizedDimensions: { width: image.width, height: image.height },
		diagnostics: result.diagnostics,
		baselineSupplementCount: result.baselineAvailability.supplements.length,
		addedSupplements: result.addedSupplements.map((supplement) => ({
			anchorDegrees: supplement.anchorDegrees,
			hex: supplement.candidate.hex,
			population: supplement.candidate.population,
			chroma: supplement.candidate.chroma,
			saliency: supplement.candidate.saliency,
			text: supplement.candidate.text,
			supportingRegionCount: supplement.supportingRegionCount,
			nearestRepresentingDistance: Number.isFinite(supplement.nearestRepresentingDistance)
				? supplement.nearestRepresentingDistance
				: null,
		})),
	}
}

function summary(entries: Awaited<ReturnType<typeof evaluate>>[]) {
	const triggered = entries.filter((entry) => entry.addedSupplements.length > 0)
	const byReviewClass = Object.fromEntries((["accepted", "rejected", "unselected"] as const).map((classification) => {
		const classified = entries.filter((entry) => entry.reviewClass === classification)
		return [classification, {
			total: classified.length,
			triggered: classified.filter((entry) => entry.addedSupplements.length > 0).length,
			files: classified.filter((entry) => entry.addedSupplements.length > 0).map((entry) => entry.file),
		}]
	}))
	return {
		entries: entries.length,
		triggered: triggered.length,
		triggerRate: entries.length === 0 ? 0 : triggered.length / entries.length,
		byReviewClass,
		anchorFrequency: triggered.flatMap((entry) => entry.addedSupplements)
			.reduce<Record<string, number>>((counts, supplement) => {
				counts[String(supplement.anchorDegrees)] = (counts[String(supplement.anchorDegrees)] ?? 0) + 1
				return counts
			}, {}),
		triggeredEntries: triggered,
	}
}

async function main(): Promise<void> {
	if (process.argv.slice(2).length > 0) throw new Error("This evaluator does not accept arguments")
	await assertOutputAbsent()
	const developmentFiles = (await readdir(join(projectRoot, "images")))
		.filter((file) => supported.has(extname(file).toLowerCase()) && !file.includes("-scrambled"))
		.sort()
		.map((file) => `images/${file}`)
	const sourceByArtwork = new Map<string, string>()
	for (const file of (await readdir(join(projectRoot, "00")))
		.filter((candidate) => supported.has(extname(candidate).toLowerCase())).sort()) {
		const id = artworkId(file)
		const current = sourceByArtwork.get(id)
		if (!current || sourcePreference(file) > sourcePreference(current)) sourceByArtwork.set(id, file)
	}
	const holdoutFiles = [...sourceByArtwork.values()].sort().map((file) => `00/${file}`)
	const development = []
	const holdout = []
	for (const [index, file] of developmentFiles.entries()) {
		development.push(await evaluate(file, "development"))
		process.stderr.write(`typography availability development: ${index + 1}/${developmentFiles.length}\r`)
	}
	process.stderr.write("\n")
	for (const [index, file] of holdoutFiles.entries()) {
		holdout.push(await evaluate(file, "00"))
		if ((index + 1) % 10 === 0 || index + 1 === holdoutFiles.length) {
			process.stderr.write(`typography availability 00: ${index + 1}/${holdoutFiles.length}\r`)
		}
	}
	process.stderr.write("\n")
	const targetBytes = await readFile(join(projectRoot, targetFile))
	const targetImage = await loadImage(targetBytes)
	const stability = [
		{ variant: "original", image: targetImage },
		{ variant: "crop-one-pixel", image: cropOnePixel(targetImage) },
		{ variant: "deterministic-noise", image: addDeterministicNoise(targetImage) },
	].map(({ variant, image }) => {
		const context = extractRegionGraph017PaletteWithContext(image)
		const result = buildTypographyChromaticCandidateAvailability(context.analysis, context.candidates)
		const trace = traceChromaticCandidateGeneration(context.analysis, context.candidates)
		const anchor = trace.hueAnchors.find((candidate) => candidate.anchorDegrees === 0)
		if (!anchor) throw new Error("Target hue anchor is missing from stability trace")
		const canonicalRepresentatives = [
			...(anchor.representability?.distanceMatches ?? []),
			...(anchor.representability?.hueLightnessMatches ?? []),
		].filter((candidate, index, candidates) => candidate.chroma >= 0.03 &&
			candidates.findIndex((other) => other.id === candidate.id) === index)
		return {
			variant,
			familyAvailable: result.addedSupplements.some((supplement) => supplement.anchorDegrees === 0) ||
				canonicalRepresentatives.length > 0,
			canonicalRepresentatives,
			supplements: result.addedSupplements.map((supplement) => ({
				anchorDegrees: supplement.anchorDegrees,
				hex: supplement.candidate.hex,
				population: supplement.candidate.population,
				text: supplement.candidate.text,
			})),
		}
	})
	const developmentSummary = summary(development)
	const holdoutSummary = summary(holdout)
	const target = holdout.find((entry) => entry.file === targetFile)
	if (!target) throw new Error("Target source is missing from the deduplicated 00 cohort")
	const syntheticTriggers = development.filter((entry) =>
		entry.kind === "synthetic" && entry.addedSupplements.length > 0).map((entry) => entry.file)
	const gateViolations = [...development, ...holdout].flatMap((entry) =>
		entry.addedSupplements.flatMap((supplement) => {
			const violations = []
			if (supplement.population < TYPOGRAPHY_CHROMATIC_CANDIDATE_AVAILABILITY_THRESHOLDS.minimumPopulation ||
				supplement.population > TYPOGRAPHY_CHROMATIC_CANDIDATE_AVAILABILITY_THRESHOLDS.maximumPopulation) {
				violations.push("population")
			}
			if (supplement.chroma < TYPOGRAPHY_CHROMATIC_CANDIDATE_AVAILABILITY_THRESHOLDS.minimumFamilyChroma) {
				violations.push("chroma")
			}
			if (supplement.text < TYPOGRAPHY_CHROMATIC_CANDIDATE_AVAILABILITY_THRESHOLDS.minimumTypographyEvidence) {
				violations.push("typography")
			}
			return violations.length === 0 ? [] : [{ file: entry.file, hex: supplement.hex, violations }]
		}),
	)
	const stops = {
		canonicalOrFrozenAvailabilityChanged: false,
		addedCandidateGateViolation: gateViolations.length > 0,
		canonical00BreadthExceeded: holdoutSummary.triggered > 35,
		acceptedBreadthExceeded: holdoutSummary.byReviewClass.accepted.triggered > 10,
		multipleAddedCandidates: [...development, ...holdout].some((entry) => entry.addedSupplements.length > 1),
		targetMissingOrUnstable: target.addedSupplements.length !== 1 ||
			stability.some((variant) => !variant.familyAvailable),
		syntheticTrigger: syntheticTriggers.length > 0,
	}
	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (file) => [
		file,
		sha256(await readFile(join(projectRoot, file))),
	] as const)))
	const inputs = Object.fromEntries(await Promise.all([
		"research/data/absolute-feedback.json",
		"research/data/experiments/palette-role-00-audit-0.2.0-development/interpretation.json",
		"research/data/experiments/chromatic-candidate-generation-trace-0.1.0-development/trace.json",
		"research/data/experiments/typography-chromatic-candidate-availability-0.2.0-poc.1-development/protocol.json",
	].map(async (file) => [file, sha256(await readFile(join(projectRoot, file)))] as const)))
	await writeFile(outputPath, `${JSON.stringify({
		schemaVersion: 1,
		experimentVersion: TYPOGRAPHY_CHROMATIC_CANDIDATE_AVAILABILITY_VERSION,
		generatedAt: new Date().toISOString(),
		developmentEvidence: true,
		thresholds: TYPOGRAPHY_CHROMATIC_CANDIDATE_AVAILABILITY_THRESHOLDS,
		bindings: { inputs, implementation },
		interpretationPolicy: {
			targetHexesAreNotInferred: true,
			positivePaletteRatingsRemainNonExclusive: true,
			availabilityDoesNotAuthorizeRoleAssignment: true,
		},
		developmentSummary,
		holdoutSummary,
		target,
		targetStability: stability,
		syntheticTriggers,
		gateViolations,
		stopConditions: stops,
		decision: Object.values(stops).some(Boolean) ? "stop" : "eligible-for-separate-role-integration-poc",
	}, null, 2)}\n`, { flag: "wx" })
}

await main()
