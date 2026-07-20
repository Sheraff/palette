import { createHash } from "node:crypto"
import { readdir, readFile, stat } from "node:fs/promises"
import { basename, extname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { writeJsonAtomic } from "./src/candidate-output.ts"
import { ALGORITHM_VERSION } from "./src/extract.ts"
import {
	GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION,
	GRADIENT_ELIGIBILITY_THRESHOLDS,
} from "./src/gradient-eligibility.ts"

type Source = { file: string; sha256: string; width: number; height: number; bytes: number }
type MusicManifest = { families: Array<{ variants: Array<{ sha256: string }> }> }

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const supported = new Set([".jpg", ".jpeg", ".png", ".avif", ".webp"])
const implementationFiles = [
	"src/candidates.ts",
	"src/color.ts",
	"src/extract.ts",
	"src/gradient-eligibility-extract.ts",
	"src/gradient-eligibility.ts",
	"src/guarded-palette.ts",
	"src/image.ts",
	"src/joint-palette.ts",
	"src/palette.ts",
	"src/regions.ts",
	"src/types.ts",
] as const
const [sourceArgument, musicManifestArgument, outputArgument] = process.argv.slice(2)
if (!sourceArgument || !musicManifestArgument || !outputArgument) {
	throw new Error("Usage: seal-gradient-eligibility-validation.ts <source-directory> <music-manifest.json> <output.json>")
}
const sourceRoot = resolve(sourceArgument)
const sourceDirectory = relative(projectRoot, sourceRoot)
if (!/^0[1-6]$/.test(sourceDirectory)) {
	throw new Error("The sealed validation source must be the project 01, 02, 03, 04, 05, or 06 directory")
}
const validationRound = Number(sourceDirectory)
const priorDirectories = Array.from({ length: validationRound }, (_, index) => String(index).padStart(2, "0"))
const protocolFile = validationRound === 1
	? "GRADIENT_ELIGIBILITY_VALIDATION.md"
	: validationRound === 2 ? "GRADIENT_ELIGIBILITY_VALIDATION_0_8.md" :
		validationRound === 3 ? "GRADIENT_ELIGIBILITY_VALIDATION_0_8_1.md" :
			validationRound === 4 ? "GRADIENT_ELIGIBILITY_VALIDATION_0_8_4.md" :
				validationRound === 5 ? "GRADIENT_ELIGIBILITY_VALIDATION_0_8_5.md" :
					"GRADIENT_ELIGIBILITY_VALIDATION_0_8_6.md"

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function artworkId(file: string): string {
	const name = basename(file)
	return name.startsWith("ab67616d") ? name.slice(16) : name
}

function sourcePreference(file: string): number {
	const name = basename(file)
	if (name.startsWith("ab67616d0000b273")) return 2
	if (name.startsWith("ab67616d00001e02")) return 1
	return 0
}

function compareSources(first: Source, second: Source): number {
	return sourcePreference(second.file) - sourcePreference(first.file) ||
		Math.min(second.width, second.height) - Math.min(first.width, first.height) ||
		second.width * second.height - first.width * first.height || first.file.localeCompare(second.file, "en")
}

async function readSources(root: string, prefix: string): Promise<Source[]> {
	const entries = await readdir(root, { withFileTypes: true })
	const invalid = entries.filter((entry) => !entry.isFile())
	if (invalid.length > 0) throw new Error(`Unsupported ${prefix} source entries: ${invalid.map((entry) => entry.name).join(", ")}`)
	return Promise.all(entries.sort((first, second) => first.name.localeCompare(second.name, "en")).map(async (entry) => {
		const path = join(root, entry.name)
		const [bytes, metadata, sourceStat] = await Promise.all([readFile(path), sharp(path).metadata(), stat(path)])
		const extension = extname(entry.name).toLowerCase()
		const extensionlessJpeg = extension === "" && metadata.format === "jpeg"
		if (!sourceStat.isFile() || !metadata.width || !metadata.height ||
			!supported.has(extension) && !extensionlessJpeg) throw new Error(`Invalid image source: ${path}`)
		return { file: `${prefix}/${entry.name}`, sha256: sha256(bytes), width: metadata.width,
			height: metadata.height, bytes: sourceStat.size }
	}))
}

const protocolPath = join(researchRoot, protocolFile)
const generatorPath = fileURLToPath(import.meta.url)
const [sources, priorSources, musicManifestSource, protocolSource, generatorSource, ...implementationSources] =
	await Promise.all([
		readSources(sourceRoot, sourceDirectory),
		Promise.all(priorDirectories.map((directory) => readSources(resolve(projectRoot, directory), directory)))
			.then((groups) => groups.flat()),
		readFile(resolve(musicManifestArgument)),
		readFile(protocolPath),
		readFile(generatorPath),
		...implementationFiles.map((file) => readFile(join(researchRoot, file))),
	])
const musicManifest = JSON.parse(musicManifestSource.toString("utf8")) as MusicManifest
if (!Array.isArray(musicManifest.families)) throw new Error("Music manifest is invalid")
const priorArtworkIds = new Set(priorSources.map((source) => artworkId(source.file)))
const priorHashes = new Set(priorSources.map((source) => source.sha256))
const musicHashes = new Set(musicManifest.families.flatMap((family) => family.variants.map((variant) => variant.sha256)))
const byArtwork = new Map<string, Source[]>()
for (const source of sources) {
	const id = artworkId(source.file)
	const family = byArtwork.get(id) ?? []
	family.push(source)
	byArtwork.set(id, family)
}
const orderedArtwork = [...byArtwork].sort(([first], [second]) => first.localeCompare(second, "en"))
const internalHashOwner = new Map<string, string>()
for (const [id, values] of orderedArtwork) {
	for (const source of values) if (!internalHashOwner.has(source.sha256)) internalHashOwner.set(source.sha256, id)
}
const excluded: Array<{ artworkKeySha256: string; reasons: string[]; sources: Source[] }> = []
const families = orderedArtwork.flatMap(([id, values]) => {
	const reasons = [
		...(values.some((source) => internalHashOwner.get(source.sha256) !== id) ? ["internal-exact-source"] : []),
		...(priorArtworkIds.has(id) ? ["prior-artwork-id"] : []),
		...(values.some((source) => priorHashes.has(source.sha256)) ? ["prior-exact-source"] : []),
		...(values.some((source) => musicHashes.has(source.sha256)) ? ["music-exact-source"] : []),
	]
	const sorted = [...values].sort(compareSources)
	if (reasons.length > 0) {
		excluded.push({ artworkKeySha256: sha256(id), reasons, sources: sorted })
		return []
	}
	return [{ familyId: `gv-${sha256(id).slice(0, 20)}`, anchor: sorted[0], variants: sorted }]
})
const duplicateHashes = new Map<string, string[]>()
for (const source of sources) {
	const duplicates = duplicateHashes.get(source.sha256) ?? []
	duplicates.push(source.file)
	duplicateHashes.set(source.sha256, duplicates)
}
const implementationSha256 = Object.fromEntries(implementationFiles.map((file, index) =>
	[file, sha256(implementationSources[index])]))
const draft = {
	schemaVersion: 1,
	manifestVersion: `gradient-eligibility-sealed-validation-0.${validationRound}.0`,
	generatedAt: new Date().toISOString(),
	protocolSha256: sha256(protocolSource),
	generatorSha256: sha256(generatorSource),
	baselineAlgorithmVersion: ALGORITHM_VERSION,
	candidateAlgorithmVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	evidenceVersion: GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION,
	thresholds: GRADIENT_ELIGIBILITY_THRESHOLDS,
	implementationSha256,
	inputs: {
		sourceDirectory,
		priorDirectories,
		priorInventorySha256: sha256(JSON.stringify(priorSources.map((source) =>
			({ file: source.file, sha256: source.sha256 })) )),
		musicManifest: relative(researchRoot, resolve(musicManifestArgument)),
		musicManifestSha256: sha256(musicManifestSource),
	},
	runtime: { node: process.version, platform: process.platform, arch: process.arch },
	summary: {
		rawSources: sources.length,
		artworkFamilies: byArtwork.size,
		includedFamilies: families.length,
		excludedFamilies: excluded.length,
		multiSourceFamilies: families.filter((family) => family.variants.length > 1).length,
		internalExactDuplicateGroups: [...duplicateHashes.values()].filter((files) => files.length > 1).length,
		internalExactSourceExclusions: excluded.filter((entry) => entry.reasons.includes("internal-exact-source")).length,
		priorArtworkIdOverlaps: excluded.filter((entry) => entry.reasons.includes("prior-artwork-id")).length,
		priorExactSourceOverlaps: excluded.filter((entry) => entry.reasons.includes("prior-exact-source")).length,
		musicExactSourceOverlaps: excluded.filter((entry) => entry.reasons.includes("music-exact-source")).length,
	},
	excluded,
	families,
}
const manifestId = sha256(JSON.stringify(draft))
await writeJsonAtomic({ path: resolve(outputArgument), refuseOverwrite: true }, { ...draft, manifestId })
process.stderr.write(`Sealed ${families.length}/${byArtwork.size} independent validation families as ${manifestId}\n`)
