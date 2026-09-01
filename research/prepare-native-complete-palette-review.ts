import { createHash, randomUUID } from "node:crypto"
import { access, link, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { namePalette } from "./src/color-name.ts"
import {
	NATIVE_COMPLETE_PALETTE_REVIEW_BASELINE,
	NATIVE_COMPLETE_PALETTE_REVIEW_CANDIDATE,
	NATIVE_COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
	NATIVE_COMPLETE_PALETTE_REVIEW_VERSION,
	nativeCompletePaletteReviewManifestId,
	nativeCompletePaletteReviewRoles,
	parseNativeCompletePaletteReviewManifest,
	type NativeCompletePalettePresentedPalette,
	type NativeCompletePaletteReviewEntry,
	type NativeCompletePaletteReviewKind,
	type NativeCompletePaletteReviewManifest,
} from "./src/native-complete-palette-review.ts"
import type { CorpusResult, Palette, RoleName } from "./src/types.ts"
import {
	NATIVE_COMPLETE_PALETTE_REVIEW_AUTHORIZATION,
	NATIVE_COMPLETE_PALETTE_REVIEW_MANIFEST,
	NATIVE_COMPLETE_PALETTE_REVIEW_PLAN,
	NATIVE_COMPLETE_PALETTE_REVIEW_ROOT,
	verifyNativeCompletePaletteReview,
} from "./verify-native-complete-palette-review.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const outputRoot = resolve(projectRoot, NATIVE_COMPLETE_PALETTE_REVIEW_ROOT)
const stagingRoot = resolve(dirname(outputRoot), ".review-v1.staging")
const experimentFiles = [
	"research/data/experiments/native-complete-palette-0.2.5-development/protocol.json",
	"research/data/experiments/native-complete-palette-0.2.5-development/phase-5/manifest.json",
	"research/data/experiments/native-complete-palette-0.2.5-development/phase-5/results.json",
	"research/data/experiments/native-complete-palette-0.2.5-development/phase-5/analysis.json",
	"research/data/experiments/native-complete-palette-0.2.5-development/phase-5/certificate-index.json",
	NATIVE_COMPLETE_PALETTE_REVIEW_AUTHORIZATION,
	"research/data/results.json",
	"research/data/holdout-results.json",
	"research/data/experiments/native-complete-palette-0.1.0-development/evidence-inventory.json",
] as const
const implementationFiles = [
	"research/src/native-complete-palette-review.ts",
	"research/src/color-name.ts",
	"research/verify-native-complete-palette-review.ts",
	"research/prepare-native-complete-palette-review.ts",
	"research/serve-native-complete-palette-review.ts",
	"research/analyze-native-complete-palette-review.ts",
	"research/tests/native-complete-palette-review.test.ts",
	"research/tests/native-complete-palette-review-artifact.test.ts",
] as const
const presentationFiles = [
	"research/native-complete-palette-review/index.html",
	"research/native-complete-palette-review/app.js",
	"research/native-complete-palette-review/styles.css",
] as const

const controls = [
	{ kind: "accepted-control", path: "images/horsley.jpg",
		sourceSha256: "3b32f2f95f2ce01af5ecd0ca8383b2b292ba160a874aac5f8480ae6e26634acb" },
	{ kind: "rejected-control", path: "images/disney.avif",
		sourceSha256: "8aeb184764d9bdb5d8273bba8bffb4a1da2eaf44606330fa1f847a71fb01563b" },
	{ kind: "known-control", path: "images/birdsofprey.jpg",
		sourceSha256: "26b991b5d5b9c2a1a390bc5ec398a9b24231da0ce78e927e663aefd9ac1f5d9d" },
	{ kind: "known-control", path: "images/krafty.jpg",
		sourceSha256: "3afaf90cd911c134fe26708b3da3fdad181eb38cd8455a8a4538de88a4894091" },
	{ kind: "known-control", path: "images/once.jpg",
		sourceSha256: "26fb272d7128b9ed89ac19b8fc0c2810d10cae4ace1a06a37663b20b2bb61fc9" },
	{ kind: "known-control", path: "images/knuckles.jpg",
		sourceSha256: "057be6b5a93708db128db9752b66b3d7631fec5d5611f3c5e318a03f6ee0c0d2" },
	{ kind: "known-control", path: "images/maroon5-original.jpg",
		sourceSha256: "6dfd27c93891e02bccb9597196bca250807177c210e3e660f6fb66257cd2c1ef" },
] as const satisfies readonly { kind: NativeCompletePaletteReviewKind; path: string; sourceSha256: string }[]

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path)
		return true
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
		throw error
	}
}

async function fileHashes(paths: readonly string[]): Promise<Record<string, string>> {
	return Object.fromEntries(await Promise.all(paths.map(async (path) =>
		[path, sha256(await readFile(resolve(projectRoot, path)))] as const)))
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 })
	try {
		await link(temporary, path)
	} finally {
		await rm(temporary, { force: true })
	}
}

function presentPalette(palette: Palette): NativeCompletePalettePresentedPalette {
	const names = namePalette(nativeCompletePaletteReviewRoles.map((role) => palette[role].rgb))
	return {
		roles: Object.fromEntries(nativeCompletePaletteReviewRoles.map((role, index) => [role, {
			rgb: palette[role].rgb,
			hex: palette[role].hex.toLowerCase(),
			nearestName: names[index].nearestName,
			generated: palette[role].generated,
			sourceDistance: palette[role].sourceDistance,
		}])) as NativeCompletePalettePresentedPalette["roles"],
		gradient: { isGradient: palette.gradient.isGradient, confidence: palette.gradient.confidence },
		metrics: palette.metrics,
	}
}

function visibleChangedRoles(baseline: Palette, candidate: Palette): RoleName[] {
	return nativeCompletePaletteReviewRoles.filter((role) => baseline[role].generated !== candidate[role].generated ||
		baseline[role].rgb.some((channel, index) => channel !== candidate[role].rgb[index]))
}

if (process.argv.slice(2).length !== 0) throw new Error("prepare-native-complete-palette-review.ts accepts no arguments")
if (await pathExists(outputRoot) || await pathExists(stagingRoot)) {
	throw new Error("Refusing to overwrite a native complete-palette review namespace")
}

const sources = Object.fromEntries(await Promise.all(experimentFiles.map(async (path) => {
	const bytes = await readFile(resolve(projectRoot, path))
	return [path, { bytes, sha256: sha256(bytes) }] as const
})))
const authorization = JSON.parse(sources[NATIVE_COMPLETE_PALETTE_REVIEW_AUTHORIZATION].bytes.toString("utf8")) as any
const phase5Manifest = JSON.parse(sources[
	"research/data/experiments/native-complete-palette-0.2.5-development/phase-5/manifest.json"].bytes.toString("utf8")) as any
const phase5Results = JSON.parse(sources[
	"research/data/experiments/native-complete-palette-0.2.5-development/phase-5/results.json"].bytes.toString("utf8")) as any
const phase5Analysis = JSON.parse(sources[
	"research/data/experiments/native-complete-palette-0.2.5-development/phase-5/analysis.json"].bytes.toString("utf8")) as any
if (phase5Manifest.status !== "phase-5-matrix-complete-gate-a-pass" || phase5Analysis.gateA.passed !== true ||
	phase5Results.groups.length !== 391 || authorization.review?.authorized !== true ||
	authorization.review.reviewVersion !== NATIVE_COMPLETE_PALETTE_REVIEW_VERSION ||
	authorization.review.presentationVersion !== NATIVE_COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION) {
	throw new Error("Native complete-palette review is not authorized by a passing Phase 5 artifact")
}
for (const [path, expected] of Object.entries(authorization.boundPhase5 as Record<string, string>)) {
	if (sources[path]?.sha256 !== expected) throw new Error(`Review authorization Phase 5 binding changed: ${path}`)
}

const changedGroups = phase5Results.groups.filter((group: any) => group.scientific.exactChanged)
const materialGroups = changedGroups.filter((group: any) => group.scientific.materialChanged)
if (changedGroups.length !== 6 || materialGroups.length !== 2 ||
	JSON.stringify(changedGroups.map((group: any) => group.sourceSha256)) !==
		JSON.stringify(authorization.selection.changedSourceSha256) ||
	JSON.stringify(materialGroups.map((group: any) => group.sourceSha256)) !==
		JSON.stringify(authorization.selection.repeatSourceSha256) ||
	JSON.stringify(authorization.selection.controls) !== JSON.stringify(controls)) {
	throw new Error("Authorized native complete-palette review selection changed")
}

const development = JSON.parse(sources["research/data/results.json"].bytes.toString("utf8")) as CorpusResult
const cohort00 = JSON.parse(sources["research/data/holdout-results.json"].bytes.toString("utf8")) as CorpusResult
const dimensions = new Map([
	...development.entries.map((entry) => [`images/${entry.file}`, { width: entry.width, height: entry.height }] as const),
	...cohort00.entries.map((entry) => [entry.file, { width: entry.width, height: entry.height }] as const),
])
const groupByPath = new Map<string, any>()
for (const group of phase5Results.groups) for (const path of group.paths) groupByPath.set(path, group)

type Seed = {
	kind: NativeCompletePaletteReviewKind
	path: string
	group: any
	occurrence: "primary" | "repeat"
}
const seeds: Seed[] = [
	...changedGroups.map((group: any): Seed => ({ kind: "changed", path: group.paths[0], group, occurrence: "primary" })),
	...materialGroups.map((group: any): Seed => ({ kind: "hidden-repeat", path: group.paths[0], group, occurrence: "repeat" })),
	...controls.map((control): Seed => {
		const group = groupByPath.get(control.path)
		if (!group || group.sourceSha256 !== control.sourceSha256 || group.scientific.exactChanged) {
			throw new Error(`Authorized review control changed: ${control.path}`)
		}
		return { kind: control.kind, path: control.path, group, occurrence: "primary" }
	}),
]
seeds.sort((first, second) => compareAscii(
	sha256(`${NATIVE_COMPLETE_PALETTE_REVIEW_VERSION}\0order\0${first.kind}\0${first.group.sourceSha256}\0${first.occurrence}`),
	sha256(`${NATIVE_COMPLETE_PALETTE_REVIEW_VERSION}\0order\0${second.kind}\0${second.group.sourceSha256}\0${second.occurrence}`),
))
if (seeds.length !== 15) throw new Error("Native complete-palette review must contain exactly 15 cases")

const entries: NativeCompletePaletteReviewEntry[] = seeds.map((seed, order) => {
	const scientific = seed.group.scientific
	const sourceDimensions = dimensions.get(seed.path)
	if (!sourceDimensions) throw new Error(`Review source dimensions are unavailable: ${seed.path}`)
	const candidateFirst = order < 8
	const baseline = presentPalette(scientific.canonicalPalette)
	const candidate = presentPalette(scientific.palette)
	return {
		caseId: `ncpr-${sha256(`${authorization.experimentId}\0${seed.kind}\0${seed.path}\0${seed.occurrence}`).slice(0, 20)}`,
		order,
		kind: seed.kind,
		cohort: seed.group.cohorts[0],
		materialChanged: scientific.materialChanged,
		source: { file: seed.path, sha256: seed.group.sourceSha256, bytes: seed.group.bytes, ...sourceDimensions },
		changedRoles: visibleChangedRoles(scientific.canonicalPalette, scientific.palette),
		gradientChanged: scientific.gradientChanged,
		options: candidateFirst ? { A: candidate, B: baseline } : { A: baseline, B: candidate },
		assignment: candidateFirst ? { A: "candidate", B: "baseline" } : { A: "baseline", B: "candidate" },
	}
})

const generatedAt = new Date().toISOString()
const identity: Omit<NativeCompletePaletteReviewManifest, "generatedAt" | "manifestId"> = {
	schemaVersion: 1,
	reviewVersion: NATIVE_COMPLETE_PALETTE_REVIEW_VERSION,
	presentationVersion: NATIVE_COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
	experimentId: authorization.experimentId,
	candidate: NATIVE_COMPLETE_PALETTE_REVIEW_CANDIDATE,
	baseline: NATIVE_COMPLETE_PALETTE_REVIEW_BASELINE,
	reviewAuthorizationSha256: sources[NATIVE_COMPLETE_PALETTE_REVIEW_AUTHORIZATION].sha256,
	batch: { index: 1, size: 15, totalBatches: 1, totalCases: 15 },
	provenance: {
		experiment: Object.fromEntries(Object.entries(sources).map(([path, source]) => [path, source.sha256])),
		implementation: await fileHashes(implementationFiles),
		presentation: await fileHashes(presentationFiles),
	},
	entries,
}
const manifest: NativeCompletePaletteReviewManifest = {
	...identity,
	generatedAt,
	manifestId: nativeCompletePaletteReviewManifestId(identity),
}
parseNativeCompletePaletteReviewManifest(manifest)
await mkdir(stagingRoot, { recursive: false, mode: 0o700 })
await writeExclusive(resolve(stagingRoot, "manifest.json"), manifest)
const manifestSource = await readFile(resolve(stagingRoot, "manifest.json"))
await writeExclusive(resolve(stagingRoot, "plan.json"), {
	schemaVersion: 1,
	reviewVersion: NATIVE_COMPLETE_PALETTE_REVIEW_VERSION,
	experimentId: manifest.experimentId,
	manifestId: manifest.manifestId,
	manifestSha256: sha256(manifestSource),
	generatedAt,
	cases: 15,
	batches: 1,
	batchSize: 15,
	composition: { changed: 6, hiddenMaterialRepeats: 2, acceptedControls: 1, rejectedControls: 1, knownControls: 5 },
	assignment: { candidateA: 8, candidateB: 7, method: "deterministic-order-balanced" },
	comments: "qualitative-only-no-target-inference",
	reserveAccessed: false,
})
await verifyNativeCompletePaletteReview(resolve(stagingRoot, "manifest.json"), projectRoot)
await rename(stagingRoot, outputRoot)
await verifyNativeCompletePaletteReview(resolve(projectRoot, NATIVE_COMPLETE_PALETTE_REVIEW_MANIFEST), projectRoot)
process.stdout.write(`${resolve(projectRoot, NATIVE_COMPLETE_PALETTE_REVIEW_PLAN)}\n`)
