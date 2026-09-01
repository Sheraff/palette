import { createHash, randomUUID } from "node:crypto"
import { link, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { dirname, extname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	CHROMATIC_CANDIDATE_AVAILABILITY_VERSION,
	extractChromaticCandidateAvailability,
	type ChromaticCandidateAvailabilityCertificate,
} from "./src/chromatic-candidate-availability.ts"
import { loadImage } from "./src/image.ts"

type Entry = {
	file: string
	kind: "artwork" | "synthetic" | "diagnostic" | "holdout"
	sourceSha256: string
	width: number
	height: number
	baselineCandidateCount: number
	certificate: ChromaticCandidateAvailabilityCertificate
}

const [outputArgument, ...unexpected] = process.argv.slice(2)
if (!outputArgument || unexpected.length > 0) {
	throw new Error("Usage: evaluate-chromatic-candidate-availability.ts <output.json>")
}

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const imagesRoot = join(projectRoot, "images")
const holdoutRoot = join(projectRoot, "00")
const outputPath = resolve(outputArgument)
const supported = new Set([".jpg", ".jpeg", ".png", ".avif", ".webp"])

function sha256(value: Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function classify(file: string): Entry["kind"] {
	if (file.includes("-masked") || file.includes("-saliency")) return "diagnostic"
	if (file.startsWith("pure")) return "synthetic"
	return "artwork"
}

function artworkId(file: string): string {
	return file.startsWith("ab67616d") ? file.slice(16) : file
}

function sourcePreference(file: string): number {
	if (file.startsWith("ab67616d0000b273")) return 2
	if (file.startsWith("ab67616d00001e02")) return 1
	return 0
}

async function evaluate(file: string, kind: Entry["kind"]): Promise<Entry> {
	const bytes = await readFile(join(projectRoot, file))
	const image = await loadImage(bytes)
	const { extraction, certificate } = extractChromaticCandidateAvailability(image)
	return {
		file,
		kind,
		sourceSha256: sha256(bytes),
		width: image.width,
		height: image.height,
		baselineCandidateCount: extraction.candidates.length,
		certificate,
	}
}

function summary(entries: readonly Entry[]) {
	const histogram: Record<string, number> = { "0": 0, "1": 0, "2": 0 }
	const anchorFrequency: Record<string, number> = {}
	let totalSupplementPopulation = 0
	let maximumSupplementPopulation = 0
	let totalDroppedByCap = 0
	for (const entry of entries) {
		const count = entry.certificate.supplements.length
		histogram[String(count)] = (histogram[String(count)] ?? 0) + 1
		totalDroppedByCap += entry.certificate.diagnostics.droppedByCap
		for (const supplement of entry.certificate.supplements) {
			totalSupplementPopulation += supplement.population
			maximumSupplementPopulation = Math.max(maximumSupplementPopulation, supplement.population)
			anchorFrequency[String(supplement.anchorDegrees)] = (anchorFrequency[String(supplement.anchorDegrees)] ?? 0) + 1
		}
	}
	const triggered = entries.filter((entry) => entry.certificate.supplements.length > 0).length
	return {
		entries: entries.length,
		triggered,
		triggerRate: entries.length === 0 ? 0 : triggered / entries.length,
		supplementCountHistogram: histogram,
		meanSupplementPopulationPerEntry: entries.length === 0 ? 0 : totalSupplementPopulation / entries.length,
		maximumSupplementPopulation,
		totalDroppedByCap,
		anchorFrequency,
	}
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

const developmentFiles = (await readdir(imagesRoot))
	.filter((file) => supported.has(extname(file).toLowerCase()) && !file.includes("-scrambled"))
	.sort()
const sourceByArtwork = new Map<string, string>()
for (const file of (await readdir(holdoutRoot)).filter((candidate) => supported.has(extname(candidate).toLowerCase())).sort()) {
	const id = artworkId(file)
	const current = sourceByArtwork.get(id)
	if (!current || sourcePreference(file) > sourcePreference(current)) sourceByArtwork.set(id, file)
}
const holdoutFiles = [...sourceByArtwork.values()].sort()
const development: Entry[] = []
const holdout: Entry[] = []
for (const [index, file] of developmentFiles.entries()) {
	development.push(await evaluate(`images/${file}`, classify(file)))
	process.stderr.write(`[development ${index + 1}/${developmentFiles.length}] ${file}\n`)
}
for (const [index, file] of holdoutFiles.entries()) {
	holdout.push(await evaluate(`00/${file}`, "holdout"))
	process.stderr.write(`[holdout ${index + 1}/${holdoutFiles.length}] ${file}\n`)
}

await writeExclusive(outputPath, {
	schemaVersion: 1,
	experimentVersion: CHROMATIC_CANDIDATE_AVAILABILITY_VERSION,
	generatedAt: new Date().toISOString(),
	developmentSummary: summary(development),
	holdoutSummary: summary(holdout),
	development,
	holdout,
})
process.stderr.write(`Wrote chromatic candidate availability evaluation to ${relative(projectRoot, outputPath)}\n`)
