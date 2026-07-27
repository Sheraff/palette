import { createHash, randomUUID } from "node:crypto"
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { namePalette } from "./src/color-name.ts"
import {
	CHROMATIC_ROLE_REVIEW_PRESENTATION_VERSION,
	CHROMATIC_ROLE_REVIEW_VERSION,
	chromaticRoleReviewManifestId,
	chromaticRoleReviewRoles,
	type ChromaticRolePresentedPalette,
	type ChromaticRoleReviewEntry,
	type ChromaticRoleReviewManifest,
} from "./src/chromatic-role-review.ts"
import { loadImage } from "./src/image.ts"
import type { CorpusResult, Palette, RoleName } from "./src/types.ts"

type SourcePlan = { file: string; cohort: ChromaticRoleReviewEntry["cohort"] }

const acceptedSources: SourcePlan[] = [
	{ file: "00/ab67616d00001e02000045168a00c9fa6fcc59da.jpg", cohort: "accepted" },
	{ file: "00/ab67616d0000b273000064c47077c5d50085297f.jpg", cohort: "accepted" },
	{ file: "00/ab67616d0000b273000082b6e9ba2855c904fd26.jpg", cohort: "accepted" },
	{ file: "00/ab67616d0000b2730000e47a4e869d4323ad0e3d.jpg", cohort: "rejected-target" },
]

const unselectedSources: SourcePlan[] = [
	"00/ab67616d00001e02000048e988ab5b276f2faf93.jpg",
	"00/ab67616d00001e020000595ccfa3cb070cc761e2.jpg",
	"00/ab67616d00001e0200005ce8ec02c77af782b821.jpg",
	"00/ab67616d00001e020000ca897c33e2a9a634e19f.jpg",
	"00/ab67616d00001e020000d55460e8982bda5cc695.jpg",
	"00/ab67616d0000b27300000ee5a62175fc8d58e0af.jpg",
	"00/ab67616d0000b27300004cb6234ff5606b29e27d.jpg",
	"00/ab67616d0000b2730000d17ed616914f65faf861.jpg",
	"00/ab67616d0000b2730000fc5b6750a56548ed782b.jpg",
].map((file) => ({ file, cohort: "unselected-holdout" }))

const [candidateArgument, outputArgument, sourceSet = "accepted", ...unexpected] = process.argv.slice(2)
if (!candidateArgument || !outputArgument || unexpected.length > 0 ||
	(sourceSet !== "accepted" && sourceSet !== "unselected")) {
	throw new Error("Usage: prepare-chromatic-role-review.ts <candidate-dir> <manifest.json> [accepted|unselected]")
}
const sources = sourceSet === "accepted" ? acceptedSources : unselectedSources

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const candidateRoot = resolve(candidateArgument)
const outputPath = resolve(outputArgument)
const baselineHoldoutPath = join(researchRoot, "data/holdout-results.json")
const candidateHoldoutPath = join(candidateRoot, "holdout-results.json")
const implementationFiles = [
	"research/prepare-chromatic-role-review.ts",
	"research/serve-chromatic-role-review.ts",
	"research/src/chromatic-role-review.ts",
	"research/src/chromatic-role-extract.ts",
	"research/src/chromatic-candidate-availability.ts",
	"research/src/candidates.ts",
	"research/src/guarded-palette.ts",
	"research/src/joint-palette.ts",
	"research/src/color-name.ts",
]
const presentationFiles = [
	"research/chromatic-role-review/index.html",
	"research/chromatic-role-review/app.js",
	"research/chromatic-role-review/styles.css",
]

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

async function fileHashes(files: string[]): Promise<Record<string, string>> {
	return Object.fromEntries(await Promise.all(files.map(async (file) => [file, sha256(await readFile(resolve(projectRoot, file)))])))
}

function sameRgb(first: readonly number[], second: readonly number[]): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function changedRoles(baseline: Palette, candidate: Palette): RoleName[] {
	return chromaticRoleReviewRoles.filter((role) => !sameRgb(baseline[role].rgb, candidate[role].rgb) ||
		baseline[role].generated !== candidate[role].generated)
}

function presentPalette(palette: Palette): ChromaticRolePresentedPalette {
	const names = namePalette(chromaticRoleReviewRoles.map((role) => palette[role].rgb))
	return {
		roles: Object.fromEntries(chromaticRoleReviewRoles.map((role, index) => [role, {
			rgb: palette[role].rgb,
			hex: palette[role].hex.toLowerCase(),
			nearestName: names[index].nearestName,
			generated: palette[role].generated,
			sourceDistance: palette[role].sourceDistance,
		}])) as ChromaticRolePresentedPalette["roles"],
		gradient: { isGradient: palette.gradient.isGradient, confidence: palette.gradient.confidence },
		metrics: palette.metrics,
	}
}

function corpusEntry(corpus: CorpusResult, file: string): CorpusResult["entries"][number] {
	const entry = corpus.entries.find((candidate) => candidate.file === file)
	if (!entry) throw new Error(`Corpus is missing ${file}`)
	return entry
}

async function prepareEntry(plan: SourcePlan, baseline: CorpusResult, candidate: CorpusResult): Promise<ChromaticRoleReviewEntry> {
	const path = resolve(projectRoot, plan.file)
	const bytes = await readFile(path)
	const sourceSha256 = sha256(bytes)
	const metadata = await sharp(bytes).metadata()
	if (!metadata.width || !metadata.height) throw new Error(`Could not read dimensions for ${plan.file}`)
	const image = await loadImage(bytes)
	const baselinePalette = corpusEntry(baseline, plan.file).extraction.methods.spatial
	const candidatePalette = corpusEntry(candidate, plan.file).extraction.methods.spatial
	const roles = changedRoles(baselinePalette, candidatePalette)
	if (roles.length === 0) throw new Error(`Review source did not change: ${plan.file}`)
	const baselineFirst = Number.parseInt(sha256(`${CHROMATIC_ROLE_REVIEW_VERSION}\0${sourceSha256}`).slice(0, 2), 16) % 2 === 0
	return {
		caseId: `cr-${sha256(`${CHROMATIC_ROLE_REVIEW_VERSION}\0${sourceSha256}`).slice(0, 20)}`,
		cohort: plan.cohort,
		source: {
			file: plan.file,
			sha256: sourceSha256,
			bytes: bytes.byteLength,
			width: metadata.width,
			height: metadata.height,
		},
		normalized: { width: image.width, height: image.height },
		changedRoles: roles,
		options: baselineFirst
			? { A: presentPalette(baselinePalette), B: presentPalette(candidatePalette) }
			: { A: presentPalette(candidatePalette), B: presentPalette(baselinePalette) },
		assignment: baselineFirst ? { A: "baseline", B: "candidate" } : { A: "candidate", B: "baseline" },
	}
}

async function writeExclusiveJson(path: string, value: unknown): Promise<void> {
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

const [baselineSource, candidateSource] = await Promise.all([
	readFile(baselineHoldoutPath),
	readFile(candidateHoldoutPath),
])
const baseline = JSON.parse(baselineSource.toString("utf8")) as CorpusResult
const candidate = JSON.parse(candidateSource.toString("utf8")) as CorpusResult
const entries = await Promise.all(sources.map((source) => prepareEntry(source, baseline, candidate)))
entries.sort((first, second) => sha256(`order\0${first.caseId}`).localeCompare(sha256(`order\0${second.caseId}`), "en"))
const identity: Omit<ChromaticRoleReviewManifest, "generatedAt" | "manifestId"> = {
	schemaVersion: 1,
	reviewVersion: CHROMATIC_ROLE_REVIEW_VERSION,
	presentationVersion: CHROMATIC_ROLE_REVIEW_PRESENTATION_VERSION,
	baselineAlgorithmVersion: baseline.algorithmVersion,
	candidateAlgorithmVersion: candidate.algorithmVersion,
	provenance: {
		sourceSelectionSha256: sha256(JSON.stringify(sources)),
		baselineHoldoutSha256: sha256(baselineSource),
		candidateHoldoutSha256: sha256(candidateSource),
		implementation: await fileHashes(implementationFiles),
		presentation: await fileHashes(presentationFiles),
	},
	entries,
}
const manifest: ChromaticRoleReviewManifest = {
	...identity,
	generatedAt: new Date().toISOString(),
	manifestId: chromaticRoleReviewManifestId(identity),
}
await writeExclusiveJson(outputPath, manifest)
process.stderr.write(`Prepared ${entries.length} blinded chromatic role cases at ${relative(projectRoot, outputPath)}\n`)
