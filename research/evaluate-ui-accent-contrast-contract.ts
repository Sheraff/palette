import { createHash } from "node:crypto"
import { access, readFile, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { extractPalette } from "./src/extract.ts"
import { loadImage } from "./src/image.ts"
import {
	traceUiAccentContrast,
	UI_ACCENT_CONTRAST_TRACE_VERSION,
} from "./src/ui-accent-contrast-trace.ts"
import type { CorpusResult, ExtractionResult } from "./src/types.ts"

type ReviewClass = "accepted" | "rejected" | "unselected"
type Cohort = "development" | "00"
type CorpusEntry = CorpusResult["entries"][number]

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const experimentRoot = join(projectRoot, "research/data/experiments/ui-accent-contrast-contract-0.1.0-development")
const outputPath = join(experimentRoot, "evaluation.json")
const inputFiles = {
	development: "research/data/results.json",
	canonical00: "research/data/holdout-results.json",
	absoluteFeedback: "research/data/absolute-feedback.json",
	protocol: "research/data/experiments/ui-accent-contrast-contract-0.1.0-development/protocol.json",
} as const
const implementationFiles = [
	"package.json",
	"pnpm-lock.yaml",
	"research/src/color.ts",
	"research/src/image.ts",
	"research/src/regions.ts",
	"research/src/candidates.ts",
	"research/src/joint-palette.ts",
	"research/src/chromatic-role-extract.ts",
	"research/src/extract.ts",
	"research/src/ui-accent-contrast-trace.ts",
	"research/evaluate-ui-accent-contrast-contract.ts",
] as const

function sha256(value: Uint8Array | string): string {
	return createHash("sha256").update(value).digest("hex")
}

function scientificExtraction(extraction: ExtractionResult): ExtractionResult {
	return { ...extraction, diagnostics: { ...extraction.diagnostics, processingMs: 0 } }
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

async function evaluate(entry: CorpusEntry, cohort: Cohort, reviewClass: ReviewClass | null) {
	const sourcePath = cohort === "development"
		? join(projectRoot, "images", basename(entry.file))
		: join(projectRoot, entry.file)
	const bytes = await readFile(sourcePath)
	const image = await loadImage(bytes)
	const canonical = extractPalette(image)
	if (!isDeepStrictEqual(scientificExtraction(canonical), scientificExtraction(entry.extraction))) {
		throw new Error(`Canonical scientific extraction changed for ${entry.file}`)
	}
	const trace = traceUiAccentContrast(image)
	if (!isDeepStrictEqual(trace.canonical.roles, {
		background: canonical.methods.spatial.background.hex.toLowerCase(),
		foreground: canonical.methods.spatial.foreground.hex.toLowerCase(),
		surface: canonical.methods.spatial.surface.hex.toLowerCase(),
		accent: canonical.methods.spatial.accent.hex.toLowerCase(),
	}) || trace.canonical.gradient !== canonical.methods.spatial.gradient.isGradient) {
		throw new Error(`Trace canonical binding changed for ${entry.file}`)
	}
	return {
		file: entry.file,
		cohort,
		reviewClass,
		sourceSha256: sha256(bytes),
		trace,
	}
}

function summarize(entries: Awaited<ReturnType<typeof evaluate>>[]) {
	const unsafe = entries.filter((entry) => !entry.trace.canonical.contrast.pass)
	const noSafeAlternative = unsafe.filter((entry) => entry.trace.bestSafeAlternative === null)
	const backgroundFailures = entries.filter((entry) => !entry.trace.canonical.contrast.backgroundPass)
	const surfaceFailures = entries.filter((entry) => !entry.trace.canonical.contrast.surfacePass)
	const byReviewClass = Object.fromEntries((["accepted", "rejected", "unselected"] as const).map((classification) => {
		const classified = entries.filter((entry) => entry.reviewClass === classification)
		const classifiedUnsafe = classified.filter((entry) => !entry.trace.canonical.contrast.pass)
		return [classification, {
			total: classified.length,
			unsafe: classifiedUnsafe.length,
			noSafeAlternative: classifiedUnsafe.filter((entry) => entry.trace.bestSafeAlternative === null).length,
			unsafeFiles: classifiedUnsafe.map((entry) => entry.file),
		}]
	}))
	return {
		entries: entries.length,
		currentSafe: entries.length - unsafe.length,
		currentUnsafe: unsafe.length,
		backgroundFailures: backgroundFailures.length,
		surfaceFailures: surfaceFailures.length,
		unsafeWithSafeAlternative: unsafe.length - noSafeAlternative.length,
		unsafeWithNoSafeAlternative: noSafeAlternative.length,
		byReviewClass,
		unsafeEntries: unsafe,
	}
}

async function main(): Promise<void> {
	if (process.argv.slice(2).length > 0) throw new Error("This evaluator does not accept arguments")
	await assertOutputAbsent()
	const inputs = Object.fromEntries(await Promise.all(Object.entries(inputFiles).map(async ([name, file]) => {
		const bytes = await readFile(join(projectRoot, file))
		return [name, { file, sha256: sha256(bytes), bytes }] as const
	}))) as Record<keyof typeof inputFiles, { file: string; sha256: string; bytes: Buffer }>
	const developmentCorpus = JSON.parse(inputs.development.bytes.toString("utf8")) as CorpusResult
	const canonical00Corpus = JSON.parse(inputs.canonical00.bytes.toString("utf8")) as CorpusResult
	const feedback = JSON.parse(inputs.absoluteFeedback.bytes.toString("utf8")) as {
		entries: Array<{ image: string; shippable: boolean }>
	}
	const reviewClass = new Map<string, ReviewClass>(feedback.entries.map((entry) => [
		entry.image,
		entry.shippable ? "accepted" : "rejected",
	]))
	const development = []
	const canonical00 = []
	for (const [index, entry] of developmentCorpus.entries.entries()) {
		development.push(await evaluate(entry, "development", null))
		process.stderr.write(`UI accent development: ${index + 1}/${developmentCorpus.entries.length}\r`)
	}
	process.stderr.write("\n")
	for (const [index, entry] of canonical00Corpus.entries.entries()) {
		canonical00.push(await evaluate(entry, "00", reviewClass.get(entry.file) ?? "unselected"))
		if ((index + 1) % 10 === 0 || index + 1 === canonical00Corpus.entries.length) {
			process.stderr.write(`UI accent 00: ${index + 1}/${canonical00Corpus.entries.length}\r`)
		}
	}
	process.stderr.write("\n")
	const developmentSummary = summarize(development)
	const canonical00Summary = summarize(canonical00)
	const stops = {
		canonicalOutputChanged: false,
		canonical00BreadthExceeded: canonical00Summary.currentUnsafe > 20,
		acceptedBreadthExceeded: canonical00Summary.byReviewClass.accepted.unsafe > 10,
		missingSourceSafeAlternative: canonical00Summary.unsafeWithNoSafeAlternative > 0 ||
			developmentSummary.unsafeWithNoSafeAlternative > 0,
		otherRoleOrGradientChangeRequired: canonical00Summary.unsafeWithNoSafeAlternative > 0 ||
			developmentSummary.unsafeWithNoSafeAlternative > 0,
	}
	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (file) => [
		file,
		sha256(await readFile(join(projectRoot, file))),
	] as const)))
	await writeFile(outputPath, `${JSON.stringify({
		schemaVersion: 1,
		experimentVersion: UI_ACCENT_CONTRAST_TRACE_VERSION,
		generatedAt: new Date().toISOString(),
		developmentEvidence: true,
		bindings: {
			inputs: Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, {
				file: input.file,
				sha256: input.sha256,
			}])),
			implementation,
		},
		contract: { accentBackgroundMinimum: 3, accentSurfaceMinimum: 3, maximumColors: 4 },
		developmentSummary,
		canonical00Summary,
		stopConditions: stops,
		decision: Object.values(stops).some(Boolean)
			? "stop-contract-requires-broad-redesign"
			: "eligible-for-frozen-role-correction-poc",
	}, null, 2)}\n`, { flag: "wx" })
}

await main()
