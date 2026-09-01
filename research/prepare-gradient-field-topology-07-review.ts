import { createHash } from "node:crypto"
import { readdir, readFile, stat } from "node:fs/promises"
import { availableParallelism } from "node:os"
import { basename, extname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads"
import sharp from "sharp"
import { prepareOutputTarget, writeJsonAtomic } from "./src/candidate-output.ts"
import type { Candidate } from "./src/candidates.ts"
import {
	analyzeGradientEligibility,
	decideGradientEligibility,
	GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION,
	GRADIENT_ELIGIBILITY_THRESHOLDS,
} from "./src/gradient-eligibility.ts"
import {
	GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY,
	scoreGradientFieldTopologyEvidence,
} from "./src/gradient-field-topology-model.ts"
import {
	analyzeGradientFieldTopology,
	GRADIENT_FIELD_TOPOLOGY_CONSTANTS,
	GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION,
} from "./src/gradient-field-topology.ts"
import { loadImage } from "./src/image.ts"
import {
	extractRegionGraph017PaletteWithContext as extractPaletteWithContext,
	REGION_GRAPH_0_17_ALGORITHM_VERSION as ALGORITHM_VERSION,
} from "./src/region-graph-0.17-extract.ts"
import type { Palette, RGB, RoleColor } from "./src/types.ts"

type Source = { file: string; sha256: string; width: number; height: number; bytes: number }
type Family = { familyId: string; anchor: Source; variants: Source[] }
type Manifest = {
	schemaVersion: 1
	manifestVersion: string
	manifestId: string
	bindings: {
		protocol: { file: string; sha256: string }
		workflow: Record<string, string>
		canonical: { algorithmVersion: string; implementationSha256: Record<string, string> }
		topology: { evidenceVersion: string; constantsSha256: string; implementationSha256: string }
		model: { modelVersion: string; identitySha256: string; implementationSha256: string; parameterSha256: string }
		comparator: { candidateVersion: string; evidenceVersion: string; thresholdsSha256: string; implementationSha256: string }
		fit: { file: string; sha256: string }
		developmentRegistry: { file: string; sha256: string; entries: number }
	}
	inputs: { sourceDirectory: string; priorDirectories: string[]; musicManifest: string }
	families: Family[]
	[key: string]: unknown
}
type DevelopmentEntry = {
	familyId: string
	sourceSha256: string
	endpoints: { background: { rgb: RGB }; surface: { rgb: RGB } }
}
type WorkerTask = { familyId: string; anchor: Source }
type PaletteColors = Record<"background" | "foreground" | "surface" | "accent", { rgb: RGB; hex: string }>
type EvaluationEntry = {
	familyId: string
	anchor: Source
	normalized: { width: number; height: number }
	canonicalGradient: boolean
	palette: Palette
	pairSha256: string | null
	eligibleForReview: boolean
	exclusionReason: "canonical-flat" | "development-registry-overlap" | null
	old086: { eligible: boolean; reason: string } | null
	v3: ReturnType<typeof scoreGradientFieldTopologyEvidence> | null
	evidence: ReturnType<typeof analyzeGradientFieldTopology> | null
}
type EligibleEntry = EvaluationEntry & {
	pairSha256: string
	old086: NonNullable<EvaluationEntry["old086"]>
	v3: NonNullable<EvaluationEntry["v3"]>
}
type Stratum = "old-gradient-v3-flat" | "old-flat-v3-gradient" | "both-gradient" | "both-flat"
type SelectionLane = "stratum-nearest" | "stratum-hash" | "shortfall-nearest" |
	"shortfall-control-hash" | "remaining-threshold"
type Selected = { entry: EligibleEntry; sourceStratum: Stratum; lane: SelectionLane; reason: string }
type Decision = "should-be-gradient" | "should-not-be-gradient" | "either-way" |
	"no-visible-difference" | "selected-colors-not-identifiable"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const sourceRoot = resolve(projectRoot, "07")
const artifactRoot = resolve(researchRoot, "data/experiments/gradient-field-topology-3.0.0-07-validation")
const manifestPath = join(artifactRoot, "manifest.json")
const evaluationPath = join(artifactRoot, "evaluation.json")
const reviewPath = join(artifactRoot, "review.json")
const defaultFeedbackPath = join(artifactRoot, "feedback.json")
const defaultInterpretationPath = join(artifactRoot, "review-interpretation.json")
const analysisPath = join(artifactRoot, "analysis.json")
const renderPath = join(artifactRoot, "render.json")
const htmlPath = join(artifactRoot, "review.html")
const protocolFile = "GRADIENT_FIELD_TOPOLOGY_VALIDATION_3.md"
const fitFile = "data/experiments/gradient-field-topology-3.0.0-fit.json"
const developmentFile = "data/experiments/gradient-field-topology-3.0.0-development.json"
const musicManifestFile = "data/candidates/region-graph-0.18.0-poc.1-sealed/manifest.json"
const manifestVersion = "gradient-field-topology-3.0.0-07-validation-manifest-1"
const evaluationVersion = "gradient-field-topology-3.0.0-07-evaluation-1"
const reviewVersion = "gradient-field-topology-3.0.0-07-review-1"
const supported = new Set([".jpg", ".jpeg", ".png", ".avif", ".webp"])
const workflowFiles = [
	"prepare-gradient-field-topology-07-review.ts",
	"render-gradient-field-topology-review.ts",
	"serve-gradient-field-topology-review.ts",
] as const
const canonicalFiles = [
	"src/candidates.ts",
	"src/color.ts",
	"src/region-graph-0.17-extract.ts",
	"src/guarded-palette.ts",
	"src/image.ts",
	"src/joint-palette.ts",
	"src/palette.ts",
	"src/regions.ts",
	"src/types.ts",
] as const
const intendedAllocation: Record<Stratum, number> = {
	"old-gradient-v3-flat": 6,
	"old-flat-v3-gradient": 6,
	"both-gradient": 5,
	"both-flat": 5,
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
	if (!isRecord(value)) throw new Error(`${label} is invalid`)
	return value
}

function requireString(value: unknown, label: string): string {
	if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is invalid`)
	return value
}

function requireSha(value: unknown, label: string): string {
	const result = requireString(value, label)
	if (!/^[a-f0-9]{64}$/.test(result)) throw new Error(`${label} is not SHA-256`)
	return result
}

function requireRgb(value: unknown, label: string): RGB {
	if (!Array.isArray(value) || value.length !== 3 || value.some((channel) =>
		!Number.isInteger(channel) || channel < 0 || channel > 255)) throw new Error(`${label} is invalid`)
	return [value[0] as number, value[1] as number, value[2] as number]
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
	const actual = Object.keys(value).sort()
	const wanted = [...expected].sort()
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
		throw new Error(`${label} has unexpected keys`)
	}
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
	const directory = await readdir(root, { withFileTypes: true })
	const invalid = directory.filter((entry) => !entry.isFile())
	if (invalid.length > 0) throw new Error(`Unsupported ${prefix} entries: ${invalid.map((entry) => entry.name).join(", ")}`)
	return Promise.all(directory.sort((first, second) => first.name.localeCompare(second.name, "en")).map(async (entry) => {
		const path = join(root, entry.name)
		const [bytes, metadata, sourceStat] = await Promise.all([readFile(path), sharp(path).metadata(), stat(path)])
		const extension = extname(entry.name).toLowerCase()
		const extensionlessJpeg = extension === "" && metadata.format === "jpeg"
		if (!sourceStat.isFile() || !metadata.width || !metadata.height ||
			!supported.has(extension) && !extensionlessJpeg) throw new Error(`Invalid image source: ${path}`)
		return {
			file: `${prefix}/${entry.name}`,
			sha256: sha256(bytes),
			width: metadata.width,
			height: metadata.height,
			bytes: sourceStat.size,
		}
	}))
}

function pairSha256(sourceSha256: string, background: RGB, surface: RGB): string {
	return sha256(`${sourceSha256}\0${background.join(",")}\0${surface.join(",")}`)
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function exactCandidate(candidates: Candidate[], rgb: RGB, role: string, familyId: string): Candidate {
	const matches = candidates.filter((candidate) => sameRgb(candidate.rgb, rgb))
	if (matches.length !== 1) throw new Error(`${familyId} ${role} resolved to ${matches.length} exact candidates`)
	return matches[0]
}

function publicRole(color: RoleColor): { rgb: RGB; hex: string } {
	return { rgb: color.rgb, hex: color.hex }
}

function publicPalette(palette: Palette): PaletteColors {
	return {
		background: publicRole(palette.background),
		foreground: publicRole(palette.foreground),
		surface: publicRole(palette.surface),
		accent: publicRole(palette.accent),
	}
}

async function fileHashes(files: readonly string[]): Promise<Record<string, string>> {
	return Object.fromEntries(await Promise.all(files.map(async (file) =>
		[file, sha256(await readFile(join(researchRoot, file)))] as const)))
}

async function seal(): Promise<void> {
	await prepareOutputTarget({ path: manifestPath, refuseOverwrite: true })
	if (ALGORITHM_VERSION !== "region-graph-0.17.0" ||
		GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION !== GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.evidenceVersion ||
		GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.parameterSha256 !==
			"98d0a0d89e83d1e66a211c05557db74467f13bf4cb1d99766a650f29178fbc11" ||
		GRADIENT_ELIGIBILITY_CANDIDATE_VERSION !== "gradient-eligibility-0.8.6-dev") {
		throw new Error("Frozen runtime identities changed before sealing")
	}
	const priorDirectories = Array.from({ length: 7 }, (_, index) => String(index).padStart(2, "0"))
	const [sources, priorGroups, musicManifestSource, protocolSource, workflowSha256, canonicalSha256,
		topologySource, modelSource, comparatorSource, fitSource, developmentSource, packageSource] = await Promise.all([
		readSources(sourceRoot, "07"),
		Promise.all(priorDirectories.map((directory) => readSources(resolve(projectRoot, directory), directory))),
		readFile(join(researchRoot, musicManifestFile)),
		readFile(join(researchRoot, protocolFile)),
		fileHashes(workflowFiles),
		fileHashes(canonicalFiles),
		readFile(join(researchRoot, "src/gradient-field-topology.ts")),
		readFile(join(researchRoot, "src/gradient-field-topology-model.ts")),
		readFile(join(researchRoot, "src/gradient-eligibility.ts")),
		readFile(join(researchRoot, fitFile)),
		readFile(join(researchRoot, developmentFile)),
		readFile(resolve(projectRoot, "package.json")),
	])
	const priorSources = priorGroups.flat()
	const musicManifest = requireRecord(JSON.parse(musicManifestSource.toString("utf8")) as unknown, "Music manifest")
	if (!Array.isArray(musicManifest.families)) throw new Error("Music manifest families are invalid")
	const musicHashes = new Set<string>()
	for (const [index, familyValue] of musicManifest.families.entries()) {
		const family = requireRecord(familyValue, `Music family ${index}`)
		if (!Array.isArray(family.variants)) throw new Error(`Music family ${index} variants are invalid`)
		for (const variantValue of family.variants) {
			const variant = requireRecord(variantValue, `Music family ${index} variant`)
			musicHashes.add(requireSha(variant.sha256, `Music family ${index} variant sha256`))
		}
	}
	const fit = requireRecord(JSON.parse(fitSource.toString("utf8")) as unknown, "Fit artifact")
	const fitModel = requireRecord(fit.model, "Fit model")
	if (!isDeepStrictEqual(fitModel, GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY)) {
		throw new Error("Runtime model identity does not exactly match the frozen fit model")
	}
	const development = requireRecord(JSON.parse(developmentSource.toString("utf8")) as unknown, "Development registry")
	if (!Array.isArray(development.entries) || development.entries.length !== 412) {
		throw new Error("Development registry must contain exactly 412 entries")
	}
	const priorArtworkIds = new Set(priorSources.map((source) => artworkId(source.file)))
	const priorHashes = new Set(priorSources.map((source) => source.sha256))
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
		const files = duplicateHashes.get(source.sha256) ?? []
		files.push(source.file)
		duplicateHashes.set(source.sha256, files)
	}
	const draft = {
		schemaVersion: 1,
		manifestVersion,
		generatedAt: new Date().toISOString(),
		bindings: {
			protocol: { file: protocolFile, sha256: sha256(protocolSource) },
			workflow: workflowSha256,
			canonical: { algorithmVersion: ALGORITHM_VERSION, implementationSha256: canonicalSha256 },
			topology: {
				evidenceVersion: GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION,
				constantsSha256: sha256(JSON.stringify(GRADIENT_FIELD_TOPOLOGY_CONSTANTS)),
				implementationSha256: sha256(topologySource),
			},
			model: {
				modelVersion: GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.modelVersion,
				identitySha256: sha256(JSON.stringify(GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY)),
				implementationSha256: sha256(modelSource),
				parameterSha256: GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.parameterSha256,
			},
			comparator: {
				candidateVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
				evidenceVersion: GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION,
				thresholdsSha256: sha256(JSON.stringify(GRADIENT_ELIGIBILITY_THRESHOLDS)),
				implementationSha256: sha256(comparatorSource),
			},
			fit: { file: fitFile, sha256: sha256(fitSource) },
			developmentRegistry: { file: developmentFile, sha256: sha256(developmentSource), entries: 412 },
			packageJsonSha256: sha256(packageSource),
		},
	inputs: {
			sourceDirectory: "07",
			priorDirectories,
			priorInventorySha256: sha256(JSON.stringify(priorSources.map((source) => ({
				file: source.file,
				sha256: source.sha256,
			})))),
			musicManifest: musicManifestFile,
			musicManifestSha256: sha256(musicManifestSource),
		},
		runtime: {
			node: process.version,
			nodeVersions: process.versions,
			sharpVersions: sharp.versions,
			platform: process.platform,
			arch: process.arch,
		},
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
	await writeJsonAtomic({ path: manifestPath, refuseOverwrite: true }, { ...draft, manifestId })
	process.stderr.write(`Sealed ${families.length}/${byArtwork.size} 07 families as ${manifestId}\n`)
}

function parseManifest(value: unknown): Manifest {
	const manifest = requireRecord(value, "Manifest")
	if (manifest.schemaVersion !== 1 || manifest.manifestVersion !== manifestVersion ||
		!Array.isArray(manifest.families) || !isRecord(manifest.bindings) || !isRecord(manifest.inputs)) {
		throw new Error("Manifest structure is invalid")
	}
	return manifest as Manifest
}

async function verifyManifest(manifest: Manifest, source: Buffer): Promise<void> {
	const { manifestId: _, ...draft } = manifest
	if (sha256(JSON.stringify(draft)) !== manifest.manifestId || manifest.inputs.sourceDirectory !== "07" ||
		!isDeepStrictEqual(manifest.inputs.priorDirectories, ["00", "01", "02", "03", "04", "05", "06"])) {
		throw new Error("Manifest identity or corpus scope is invalid")
	}
	if (manifest.bindings.canonical.algorithmVersion !== ALGORITHM_VERSION ||
		manifest.bindings.topology.evidenceVersion !== GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION ||
		manifest.bindings.topology.constantsSha256 !== sha256(JSON.stringify(GRADIENT_FIELD_TOPOLOGY_CONSTANTS)) ||
		manifest.bindings.model.modelVersion !== GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.modelVersion ||
		manifest.bindings.model.identitySha256 !== sha256(JSON.stringify(GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY)) ||
		manifest.bindings.model.parameterSha256 !== GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.parameterSha256 ||
		manifest.bindings.comparator.candidateVersion !== GRADIENT_ELIGIBILITY_CANDIDATE_VERSION ||
		manifest.bindings.comparator.evidenceVersion !== GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION ||
		manifest.bindings.comparator.thresholdsSha256 !== sha256(JSON.stringify(GRADIENT_ELIGIBILITY_THRESHOLDS))) {
		throw new Error("Manifest does not bind the current frozen identities")
	}
	const bindings = [
		[manifest.bindings.protocol.file, manifest.bindings.protocol.sha256],
		...Object.entries(manifest.bindings.workflow),
		...Object.entries(manifest.bindings.canonical.implementationSha256),
		["src/gradient-field-topology.ts", manifest.bindings.topology.implementationSha256],
		["src/gradient-field-topology-model.ts", manifest.bindings.model.implementationSha256],
		["src/gradient-eligibility.ts", manifest.bindings.comparator.implementationSha256],
		[manifest.bindings.fit.file, manifest.bindings.fit.sha256],
		[manifest.bindings.developmentRegistry.file, manifest.bindings.developmentRegistry.sha256],
	] as Array<[string, string]>
	for (const [file, expected] of bindings) {
		if (sha256(await readFile(join(researchRoot, file))) !== expected) throw new Error(`Frozen binding changed: ${file}`)
	}
	if (sha256(source) !== sha256(await readFile(manifestPath))) throw new Error("Manifest changed during verification")
	const familyIds = new Set<string>()
	const anchors = new Set<string>()
	for (const family of manifest.families) {
		if (typeof family.familyId !== "string" || familyIds.has(family.familyId) || anchors.has(family.anchor.file) ||
			!/^07\/[^/\\]+$/.test(family.anchor.file) || !Array.isArray(family.variants) || family.variants.length === 0 ||
			!family.variants.some((variant) => isDeepStrictEqual(variant, family.anchor))) {
			throw new Error("Manifest family coverage is invalid")
		}
		familyIds.add(family.familyId)
		anchors.add(family.anchor.file)
	}
}

async function evaluateTask(task: WorkerTask): Promise<EvaluationEntry> {
	if (!/^07\/[^/\\]+$/.test(task.anchor.file)) throw new Error(`Invalid 07 anchor: ${task.anchor.file}`)
	const bytes = await readFile(resolve(projectRoot, task.anchor.file))
	if (bytes.byteLength !== task.anchor.bytes || sha256(bytes) !== task.anchor.sha256) {
		throw new Error(`Sealed anchor changed: ${task.anchor.file}`)
	}
	const image = await loadImage(bytes)
	const context = extractPaletteWithContext(image)
	const palette = context.extraction.methods.spatial
	if (!palette.gradient.isGradient) {
		return {
			familyId: task.familyId,
			anchor: task.anchor,
			normalized: { width: image.width, height: image.height },
			canonicalGradient: false,
			palette,
			pairSha256: null,
			eligibleForReview: false,
			exclusionReason: "canonical-flat",
			old086: null,
			v3: null,
			evidence: null,
		}
	}
	const background = exactCandidate(context.candidates, palette.background.rgb, "background", task.familyId)
	const surface = exactCandidate(context.candidates, palette.surface.rgb, "surface", task.familyId)
	const evidence = analyzeGradientFieldTopology(background, surface, context.analysis)
	const v3 = scoreGradientFieldTopologyEvidence(evidence)
	const old086 = decideGradientEligibility(analyzeGradientEligibility(background, surface, context.analysis))
	return {
		familyId: task.familyId,
		anchor: task.anchor,
		normalized: { width: image.width, height: image.height },
		canonicalGradient: true,
		palette,
		pairSha256: pairSha256(task.anchor.sha256, palette.background.rgb, palette.surface.rgb),
		eligibleForReview: true,
		exclusionReason: null,
		old086: { eligible: old086.eligible, reason: old086.reason },
		v3,
		evidence,
	}
}

async function runWorker(tasks: WorkerTask[]): Promise<EvaluationEntry[]> {
	const entries: EvaluationEntry[] = []
	for (const [index, task] of tasks.entries()) {
		entries.push(await evaluateTask(task))
		if ((index + 1) % 5 === 0) parentPort?.postMessage({ progress: 5 })
	}
	return entries
}

async function runParallel(tasks: WorkerTask[]): Promise<EvaluationEntry[]> {
	const workerCount = Math.min(Math.max(1, availableParallelism() - 1), 8, tasks.length)
	const partitions = Array.from({ length: workerCount }, () => [] as WorkerTask[])
	for (const [index, task] of tasks.entries()) partitions[index % workerCount].push(task)
	let completed = 0
	const workers = partitions.map((partition) => new Promise<EvaluationEntry[]>((resolveWorker, rejectWorker) => {
		const worker = new Worker(new URL(import.meta.url), { workerData: partition })
		worker.on("message", (message: { progress: number } | { entries: EvaluationEntry[] }) => {
			if ("entries" in message) resolveWorker(message.entries)
			else {
				completed += message.progress
				process.stderr.write(`07 topology evaluation: at least ${Math.min(completed, tasks.length)}/${tasks.length}\r`)
			}
		})
		worker.on("error", rejectWorker)
		worker.on("exit", (code) => {
			if (code !== 0) rejectWorker(new Error(`07 evaluation worker exited with code ${code}`))
		})
	}))
	const entries = (await Promise.all(workers)).flat()
	process.stderr.write(`07 topology evaluation: ${entries.length}/${tasks.length}\n`)
	return entries.sort((first, second) => first.familyId.localeCompare(second.familyId, "en"))
}

function sourceStratum(entry: EligibleEntry): Stratum {
	if (entry.old086.eligible && !entry.v3.eligible) return "old-gradient-v3-flat"
	if (!entry.old086.eligible && entry.v3.eligible) return "old-flat-v3-gradient"
	return entry.v3.eligible ? "both-gradient" : "both-flat"
}

function byMargin(first: EligibleEntry, second: EligibleEntry): number {
	return Math.abs(first.v3.margin) - Math.abs(second.v3.margin) || first.pairSha256.localeCompare(second.pairSha256, "en")
}

function hashOrder(manifestId: string, lane: string, first: EligibleEntry, second: EligibleEntry): number {
	return sha256(`${manifestId}\0${lane}\0${first.pairSha256}`).localeCompare(
		sha256(`${manifestId}\0${lane}\0${second.pairSha256}`), "en")
}

function selectReview(entries: EligibleEntry[], manifestId: string): { selected: Selected[]; deficits: Record<Stratum, number> } {
	const selected: Selected[] = []
	const selectedPairs = new Set<string>()
	const deficits = {} as Record<Stratum, number>
	const add = (entry: EligibleEntry, lane: SelectionLane, reason: string): void => {
		if (selectedPairs.has(entry.pairSha256)) throw new Error(`Selection duplicated pair ${entry.pairSha256}`)
		selectedPairs.add(entry.pairSha256)
		selected.push({ entry, sourceStratum: sourceStratum(entry), lane, reason })
	}
	for (const [stratum, target] of Object.entries(intendedAllocation) as Array<[Stratum, number]>) {
		const pool = entries.filter((entry) => sourceStratum(entry) === stratum)
		const available = Math.min(target, pool.length)
		const nearestCount = Math.min(available, Math.ceil(target / 2))
		const nearest = [...pool].sort(byMargin).slice(0, nearestCount)
		for (const entry of nearest) add(entry, "stratum-nearest", `${stratum}: nearest absolute v3 margin`)
		const hashCount = available - nearest.length
		const hashCandidates = pool.filter((entry) => !selectedPairs.has(entry.pairSha256))
			.sort((first, second) => hashOrder(manifestId, `${stratum}/hash`, first, second)).slice(0, hashCount)
		for (const entry of hashCandidates) add(entry, "stratum-hash", `${stratum}: deterministic SHA ordering`)
		deficits[stratum] = target - available
	}
	let missing = Object.values(deficits).reduce((sum, value) => sum + value, 0)
	const closestFallback = entries.filter((entry) => !selectedPairs.has(entry.pairSha256)).sort(byMargin)
	for (const entry of closestFallback.slice(0, missing)) {
		add(entry, "shortfall-nearest", "first-four-strata shortfall: closest remaining absolute v3 margin")
	}
	missing -= Math.min(missing, closestFallback.length)
	if (missing > 0) {
		const controls = entries.filter((entry) => !selectedPairs.has(entry.pairSha256) &&
			(sourceStratum(entry) === "both-gradient" || sourceStratum(entry) === "both-flat"))
			.sort((first, second) => hashOrder(manifestId, "shortfall/control", first, second))
		for (const entry of controls.slice(0, missing)) {
			add(entry, "shortfall-control-hash", "first-four-strata shortfall: deterministic control ordering")
		}
		missing -= Math.min(missing, controls.length)
	}
	if (missing > 0) throw new Error(`Unable to fill ${missing} first-four-strata slots`)
	const remainingThreshold = entries.filter((entry) => !selectedPairs.has(entry.pairSha256)).sort(byMargin).slice(0, 3)
	for (const entry of remainingThreshold) add(entry, "remaining-threshold", "closest remaining absolute v3 threshold margin")
	if (selected.length < 25) {
		const controls = entries.filter((entry) => !selectedPairs.has(entry.pairSha256))
			.sort((first, second) => hashOrder(manifestId, "final/control", first, second))
		for (const entry of controls.slice(0, 25 - selected.length)) {
			add(entry, "shortfall-control-hash", "final deterministic control fallback")
		}
	}
	if (selected.length !== 25) throw new Error(`Selection produced ${selected.length}, expected 25`)
	return { selected, deficits }
}

async function prepare(): Promise<void> {
	await Promise.all([
		prepareOutputTarget({ path: evaluationPath, refuseOverwrite: true }),
		prepareOutputTarget({ path: reviewPath, refuseOverwrite: true }),
	])
	const manifestSource = await readFile(manifestPath)
	const manifest = parseManifest(JSON.parse(manifestSource.toString("utf8")) as unknown)
	await verifyManifest(manifest, manifestSource)
	const developmentSource = await readFile(join(researchRoot, manifest.bindings.developmentRegistry.file))
	const development = requireRecord(JSON.parse(developmentSource.toString("utf8")) as unknown, "Development registry")
	if (!Array.isArray(development.entries) || development.entries.length !== 412) throw new Error("Development registry count changed")
	const registry = new Set<string>()
	for (const [index, value] of development.entries.entries()) {
		const entry = requireRecord(value, `Development entry ${index}`) as unknown as DevelopmentEntry
		const background = requireRgb(entry.endpoints?.background?.rgb, `Development entry ${index} background`)
		const surface = requireRgb(entry.endpoints?.surface?.rgb, `Development entry ${index} surface`)
		const identity = pairSha256(requireSha(entry.sourceSha256, `Development entry ${index} sourceSha256`), background, surface)
		if (registry.has(identity)) throw new Error(`Development registry duplicates exact pair ${identity}`)
		registry.add(identity)
	}
	if (registry.size !== 412) throw new Error("Development exact-pair registry is not 412 entries")
	const entries = await runParallel(manifest.families.map((family) => ({ familyId: family.familyId, anchor: family.anchor })))
	const pairOwners = new Map<string, string>()
	for (const entry of entries) {
		if (!entry.pairSha256) continue
		const owner = pairOwners.get(entry.pairSha256)
		if (owner) throw new Error(`Duplicate 07 exact pair: ${owner} and ${entry.familyId}`)
		pairOwners.set(entry.pairSha256, entry.familyId)
		if (registry.has(entry.pairSha256)) {
			entry.eligibleForReview = false
			entry.exclusionReason = "development-registry-overlap"
		}
	}
	const eligible = entries.filter((entry): entry is EligibleEntry => entry.eligibleForReview && entry.pairSha256 !== null &&
		entry.old086 !== null && entry.v3 !== null)
	if (eligible.length < 25) throw new Error(`Only ${eligible.length} eligible exact pairs; 25 required`)
	const { selected, deficits } = selectReview(eligible, manifest.manifestId)
	const actualStrata = Object.fromEntries((Object.keys(intendedAllocation) as Stratum[]).map((stratum) =>
		[stratum, selected.filter((item) => item.sourceStratum === stratum).length]))
	const lanes = Object.fromEntries([...new Set(selected.map((item) => item.lane))].sort().map((lane) =>
		[lane, selected.filter((item) => item.lane === lane).length]))
	const evaluation = {
		schemaVersion: 1,
		evaluationVersion,
		generatedAt: new Date().toISOString(),
		manifestId: manifest.manifestId,
		manifestSha256: sha256(manifestSource),
		model: {
			identity: GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY,
			identitySha256: sha256(JSON.stringify(GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY)),
			implementationSha256: manifest.bindings.model.implementationSha256,
			parameterSha256: GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.parameterSha256,
			thresholdRefitOn07: false,
		},
		comparator: {
			candidateVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
			implementationSha256: manifest.bindings.comparator.implementationSha256,
		},
		exactPairSemantics: "sha256(sourceSha256 + NUL + background RGB CSV + NUL + surface RGB CSV)",
		reviewPopulation: "canonical-gradient exact directed pairs excluding duplicates and the 412-entry development registry",
		selectionInterpretation: "Selection-enriched non-prevalence review; no population prevalence, calibration, or accuracy estimate is valid.",
		summary: {
			sealedFamilies: entries.length,
			canonicalGradients: entries.filter((entry) => entry.canonicalGradient).length,
			canonicalFlats: entries.filter((entry) => !entry.canonicalGradient).length,
			developmentRegistryOverlaps: entries.filter((entry) => entry.exclusionReason === "development-registry-overlap").length,
			eligiblePairs: eligible.length,
			selectedPairs: selected.length,
			eligibleStrata: Object.fromEntries((Object.keys(intendedAllocation) as Stratum[]).map((stratum) =>
				[stratum, eligible.filter((entry) => sourceStratum(entry) === stratum).length])),
		},
		selection: {
			intended: { ...intendedAllocation, "closest-remaining-threshold": 3, total: 25 },
			actualSourceStrata: actualStrata,
			actualLanes: lanes,
			deficits,
			fallbackUsed: Object.values(deficits).some((value) => value > 0),
			selected: selected.map((item) => ({
				familyId: item.entry.familyId,
				pairSha256: item.entry.pairSha256,
				sourceStratum: item.sourceStratum,
				lane: item.lane,
				reason: item.reason,
				absoluteV3Margin: Math.abs(item.entry.v3.margin),
			})),
		},
		entries,
	}
	const evaluationSerialized = `${JSON.stringify(evaluation, null, 2)}\n`
	await writeJsonAtomic({ path: evaluationPath, refuseOverwrite: true }, evaluation)
	const reviewEntries = selected.map((item) => ({
		familyId: item.entry.familyId,
		anchor: { file: item.entry.anchor.file, sha256: item.entry.anchor.sha256, bytes: item.entry.anchor.bytes },
		pairSha256: item.entry.pairSha256,
		palette: publicPalette(item.entry.palette),
		gradientFirst: Number.parseInt(sha256(`${manifest.manifestId}\0${item.entry.pairSha256}\0gradient-first`).slice(0, 2), 16) % 2 === 0,
	})).sort((first, second) => sha256(`${manifest.manifestId}\0${first.pairSha256}\0order`).localeCompare(
		sha256(`${manifest.manifestId}\0${second.pairSha256}\0order`), "en"))
	const review = {
		schemaVersion: 1,
		reviewVersion,
		generatedAt: new Date().toISOString(),
		manifestId: manifest.manifestId,
		provenance: {
			manifestSha256: sha256(manifestSource),
			evaluationSha256: sha256(evaluationSerialized),
			modelFileSha256: manifest.bindings.model.implementationSha256,
			modelIdentitySha256: manifest.bindings.model.identitySha256,
			parameterSha256: manifest.bindings.model.parameterSha256,
		},
		entries: reviewEntries,
	}
	await writeJsonAtomic({ path: reviewPath, refuseOverwrite: true }, review)
	process.stderr.write(`Prepared ${eligible.length} eligible exact pairs and a blinded 25-case review\n`)
}

function count<T extends string>(values: readonly T[]): Partial<Record<T, number>> {
	const result: Partial<Record<T, number>> = {}
	for (const value of values) result[value] = (result[value] ?? 0) + 1
	return result
}

function marginBand(margin: number): "<0.02" | "0.02-<0.05" | "0.05-<0.10" | ">=0.10" {
	const absolute = Math.abs(margin)
	if (absolute < 0.02) return "<0.02"
	if (absolute < 0.05) return "0.02-<0.05"
	if (absolute < 0.1) return "0.05-<0.10"
	return ">=0.10"
}

async function analyze(feedbackArgument: string, interpretationArgument: string, outputArgument: string): Promise<void> {
	const output = resolve(outputArgument)
	await prepareOutputTarget({ path: output, refuseOverwrite: true })
	const [manifestSource, evaluationSource, reviewSource, renderSource, htmlSource, feedbackSource, interpretationSource] =
		await Promise.all([
			readFile(manifestPath), readFile(evaluationPath), readFile(reviewPath), readFile(renderPath), readFile(htmlPath),
			readFile(resolve(feedbackArgument)), readFile(resolve(interpretationArgument)),
		])
	const manifest = parseManifest(JSON.parse(manifestSource.toString("utf8")) as unknown)
	const evaluation = requireRecord(JSON.parse(evaluationSource.toString("utf8")) as unknown, "Evaluation")
	const review = requireRecord(JSON.parse(reviewSource.toString("utf8")) as unknown, "Review")
	const render = requireRecord(JSON.parse(renderSource.toString("utf8")) as unknown, "Render binding")
	const feedback = requireRecord(JSON.parse(feedbackSource.toString("utf8")) as unknown, "Feedback")
	const interpretation = requireRecord(JSON.parse(interpretationSource.toString("utf8")) as unknown, "Interpretation")
	await verifyManifest(manifest, manifestSource)
	exactKeys(evaluation, ["schemaVersion", "evaluationVersion", "generatedAt", "manifestId", "manifestSha256",
		"model", "comparator", "exactPairSemantics", "reviewPopulation", "selectionInterpretation", "summary",
		"selection", "entries"], "Evaluation")
	exactKeys(review, ["schemaVersion", "reviewVersion", "generatedAt", "manifestId", "provenance", "entries"], "Review")
	exactKeys(render, ["schemaVersion", "renderVersion", "generatedAt", "planFile", "planSha256", "htmlFile", "htmlSha256"], "Render binding")
	exactKeys(feedback, ["schemaVersion", "reviewVersion", "reviewSha256", "htmlSha256", "entries"], "Feedback")
	const evaluationModel = requireRecord(evaluation.model, "Evaluation model")
	const evaluationComparator = requireRecord(evaluation.comparator, "Evaluation comparator")
	exactKeys(evaluationModel, ["identity", "identitySha256", "implementationSha256", "parameterSha256",
		"thresholdRefitOn07"], "Evaluation model")
	exactKeys(evaluationComparator, ["candidateVersion", "implementationSha256"], "Evaluation comparator")
	if (evaluation.manifestId !== manifest.manifestId || evaluation.manifestSha256 !== sha256(manifestSource) ||
		evaluation.schemaVersion !== 1 || evaluation.evaluationVersion !== evaluationVersion ||
		!isDeepStrictEqual(evaluationModel.identity, GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY) ||
		evaluationModel.identitySha256 !== manifest.bindings.model.identitySha256 ||
		evaluationModel.implementationSha256 !== manifest.bindings.model.implementationSha256 ||
		evaluationModel.parameterSha256 !== manifest.bindings.model.parameterSha256 ||
		evaluationModel.thresholdRefitOn07 !== false ||
		evaluationComparator.candidateVersion !== GRADIENT_ELIGIBILITY_CANDIDATE_VERSION ||
		evaluationComparator.implementationSha256 !== manifest.bindings.comparator.implementationSha256 ||
		review.manifestId !== manifest.manifestId || !isRecord(review.provenance) ||
		review.schemaVersion !== 1 || review.reviewVersion !== reviewVersion ||
		review.provenance.manifestSha256 !== sha256(manifestSource) ||
		review.provenance.evaluationSha256 !== sha256(evaluationSource) ||
		review.provenance.modelFileSha256 !== manifest.bindings.model.implementationSha256 ||
		review.provenance.modelIdentitySha256 !== manifest.bindings.model.identitySha256 ||
		review.provenance.parameterSha256 !== manifest.bindings.model.parameterSha256 ||
		render.schemaVersion !== 1 || render.renderVersion !== "gradient-field-topology-3.0.0-07-render-1" ||
		render.planSha256 !== sha256(reviewSource) || render.htmlSha256 !== sha256(htmlSource) ||
		feedback.schemaVersion !== 1 || feedback.reviewVersion !== reviewVersion ||
		feedback.reviewSha256 !== sha256(reviewSource) || feedback.htmlSha256 !== sha256(htmlSource)) {
		throw new Error("Review provenance chain is invalid")
	}
	exactKeys(review.provenance, ["manifestSha256", "evaluationSha256", "modelFileSha256", "modelIdentitySha256",
		"parameterSha256"], "Review provenance")
	exactKeys(interpretation, ["schemaVersion", "recordedAt", "decisionScope", "reviewPopulation", "thresholdRefit", "reviewSha256", "htmlSha256", "feedbackSha256", "note"], "Interpretation")
	if (interpretation.schemaVersion !== 1 || interpretation.decisionScope !== "exact-directed-background-surface-pair" ||
		interpretation.reviewPopulation !== "selection-enriched-non-prevalence" || interpretation.thresholdRefit !== false ||
		interpretation.reviewSha256 !== sha256(reviewSource) || interpretation.htmlSha256 !== sha256(htmlSource) ||
		interpretation.feedbackSha256 !== sha256(feedbackSource) || typeof interpretation.recordedAt !== "string" ||
		!Number.isFinite(Date.parse(interpretation.recordedAt)) || typeof interpretation.note !== "string") {
		throw new Error("Interpretation artifact is invalid or not bound to this completed review")
	}
	if (!Array.isArray(review.entries) || review.entries.length !== 25 || !Array.isArray(feedback.entries) ||
		feedback.entries.length !== 25 || !Array.isArray(evaluation.entries)) throw new Error("Analysis requires exactly 25 responses")
	const reviewByFamily = new Map<string, Record<string, unknown>>()
	for (const value of review.entries) {
		const entry = requireRecord(value, "Review entry")
		exactKeys(entry, ["familyId", "anchor", "pairSha256", "palette", "gradientFirst"], "Review entry")
		const familyId = requireString(entry.familyId, "Review familyId")
		if (reviewByFamily.has(familyId)) throw new Error(`Duplicate review family ${familyId}`)
		reviewByFamily.set(familyId, entry)
	}
	const evaluationByFamily = new Map<string, EvaluationEntry>()
	for (const value of evaluation.entries) {
		const entry = requireRecord(value, "Evaluation entry") as unknown as EvaluationEntry
		evaluationByFamily.set(requireString(entry.familyId, "Evaluation familyId"), entry)
	}
	const privateSelection = requireRecord(evaluation.selection, "Evaluation selection")
	if (!Array.isArray(privateSelection.selected)) throw new Error("Evaluation selection entries are invalid")
	const selectionByFamily = new Map<string, Record<string, unknown>>()
	for (const value of privateSelection.selected) {
		const selected = requireRecord(value, "Selected entry")
		selectionByFamily.set(requireString(selected.familyId, "Selected familyId"), selected)
	}
	const decisions = new Set<Decision>(["should-be-gradient", "should-not-be-gradient", "either-way",
		"no-visible-difference", "selected-colors-not-identifiable"])
	const seen = new Set<string>()
	const analyzed = feedback.entries.map((value) => {
		const response = requireRecord(value, "Feedback entry")
		exactKeys(response, ["familyId", "pairSha256", "decision", "comment", "submittedAt"], "Feedback entry")
		const familyId = requireString(response.familyId, "Feedback familyId")
		const judgment = requireString(response.decision, `Feedback ${familyId} decision`) as Decision
		const reviewed = reviewByFamily.get(familyId)
		const evaluated = evaluationByFamily.get(familyId)
		const selected = selectionByFamily.get(familyId)
		const reviewedAnchor = reviewed && requireRecord(reviewed.anchor, `Review ${familyId} anchor`)
		if (seen.has(familyId) || !decisions.has(judgment) || !reviewed || !reviewedAnchor || !evaluated || !selected ||
			response.pairSha256 !== reviewed.pairSha256 || evaluated.pairSha256 !== reviewed.pairSha256 ||
			reviewedAnchor.file !== evaluated.anchor.file || reviewedAnchor.sha256 !== evaluated.anchor.sha256 ||
			reviewedAnchor.bytes !== evaluated.anchor.bytes ||
			!evaluated.v3 || !evaluated.old086) throw new Error(`Feedback is duplicated or unbound for ${familyId}`)
		seen.add(familyId)
		const truth = judgment === "should-be-gradient" ? true : judgment === "should-not-be-gradient" ? false : null
		const oldCorrect = truth === null ? null : evaluated.old086.eligible === truth
		const v3Correct = truth === null ? null : evaluated.v3.eligible === truth
		const pairedOutcome = truth === null ? "nondecisive" : !oldCorrect && v3Correct ? "improvement" :
			oldCorrect && !v3Correct ? "regression" : oldCorrect ? "unchanged-correct" : "unchanged-wrong"
		return {
			familyId,
			pairSha256: evaluated.pairSha256,
			judgment,
			comment: response.comment,
			submittedAt: response.submittedAt,
			sourceStratum: selected.sourceStratum,
			selectionLane: selected.lane,
			v3: { eligible: evaluated.v3.eligible, score: evaluated.v3.score, threshold: evaluated.v3.threshold,
				margin: evaluated.v3.margin, correct: v3Correct },
			old086: { eligible: evaluated.old086.eligible, reason: evaluated.old086.reason, correct: oldCorrect },
			marginBand: marginBand(evaluated.v3.margin),
			pairedOutcome,
		}
	})
	if (seen.size !== 25 || [...reviewByFamily].some(([familyId]) => !seen.has(familyId))) {
		throw new Error("All 25 planned cases must have exactly one response")
	}
	const decisive = analyzed.filter((entry) => entry.judgment === "should-be-gradient" || entry.judgment === "should-not-be-gradient")
	const nondecisive = analyzed.filter((entry) => entry.pairedOutcome === "nondecisive")
	const confusion = (field: "v3" | "old086") => ({
		truePositive: decisive.filter((entry) => entry.judgment === "should-be-gradient" && entry[field].eligible).length,
		falseNegative: decisive.filter((entry) => entry.judgment === "should-be-gradient" && !entry[field].eligible).length,
		trueNegative: decisive.filter((entry) => entry.judgment === "should-not-be-gradient" && !entry[field].eligible).length,
		falsePositive: decisive.filter((entry) => entry.judgment === "should-not-be-gradient" && entry[field].eligible).length,
	})
	const breakdown = (field: "sourceStratum" | "marginBand") => Object.fromEntries(
		[...new Set(analyzed.map((entry) => String(entry[field])))].sort().map((key) => [key, {
			cases: analyzed.filter((entry) => entry[field] === key).length,
			judgments: count(analyzed.filter((entry) => entry[field] === key).map((entry) => entry.judgment)),
			pairedOutcomes: count(analyzed.filter((entry) => entry[field] === key).map((entry) => entry.pairedOutcome)),
		}]),
	)
	await writeJsonAtomic({ path: output, refuseOverwrite: true }, {
		schemaVersion: 1,
		analysisVersion: "gradient-field-topology-3.0.0-07-analysis-1",
		generatedAt: new Date().toISOString(),
		manifestId: manifest.manifestId,
		thresholdRefitOn07: false,
		interpretation,
		provenance: {
			manifestSha256: sha256(manifestSource), evaluationSha256: sha256(evaluationSource),
			reviewSha256: sha256(reviewSource), renderSha256: sha256(renderSource), htmlSha256: sha256(htmlSource),
			feedbackSha256: sha256(feedbackSource), interpretationSha256: sha256(interpretationSource),
			modelFileSha256: manifest.bindings.model.implementationSha256,
			parameterSha256: manifest.bindings.model.parameterSha256,
		},
		summary: {
			cases: analyzed.length,
			decisive: decisive.length,
			nondecisive: nondecisive.length,
			judgments: count(analyzed.map((entry) => entry.judgment)),
			v3: confusion("v3"),
			old086: confusion("old086"),
			pairedOutcomes: count(analyzed.map((entry) => entry.pairedOutcome)),
			byPrivateStratum: breakdown("sourceStratum"),
			byMarginBand: breakdown("marginBand"),
			nondecisiveByModelOutcome: {
				v3Gradient: nondecisive.filter((entry) => entry.v3.eligible).length,
				v3Flat: nondecisive.filter((entry) => !entry.v3.eligible).length,
				oldGradient: nondecisive.filter((entry) => entry.old086.eligible).length,
				oldFlat: nondecisive.filter((entry) => !entry.old086.eligible).length,
			},
		},
		entries: analyzed,
	})
	process.stderr.write(`Analyzed 25/25 responses: ${decisive.length} decisive, ${nondecisive.length} nondecisive\n`)
}

if (!isMainThread) {
	runWorker(workerData as WorkerTask[]).then((entries) => parentPort!.postMessage({ entries }), (error: unknown) => {
		throw error
	})
} else {
	const [mode, ...arguments_] = process.argv.slice(2)
	if (mode === "seal" && arguments_.length === 0) await seal()
	else if (mode === "prepare" && arguments_.length === 0) await prepare()
	else if (mode === "analyze" && arguments_.length <= 3) {
		await analyze(arguments_[0] ?? defaultFeedbackPath, arguments_[1] ?? defaultInterpretationPath,
			arguments_[2] ?? analysisPath)
	} else {
		throw new Error("Usage: prepare-gradient-field-topology-07-review.ts seal | prepare | analyze [feedback.json] [review-interpretation.json] [analysis.json]")
	}
}
