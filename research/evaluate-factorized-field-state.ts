import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { basename, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { buildReviewEvidence, reviewEvidenceInputPaths } from "./build-review-evidence.ts"
import {
	FACTORIZED_FIELD_STATE_VERSION,
	FIELD_MULTIPLICITY_FEATURES,
	FIELD_PAIR_FEATURES,
	fieldMultiplicityFeatures,
	fieldPairFeatures,
	fieldPairIdentity,
	fitFactorizedRanker,
	leaveOneFactorizedSourceGroupOut,
	mapQueriedFieldPalette,
	type FactorizedComparison,
	type QueriedFieldPalette,
} from "./src/factorized-field-state.ts"
import { harmonicConjunction } from "./src/field-relation.ts"
import { mapPaletteToFieldHypothesis } from "./src/field-state-calibration.ts"
import { scoreGradientFieldTopologyEvidence } from "./src/gradient-field-topology-model.ts"
import type {
	NativeFieldFamilyQuery,
	NativeFieldHypothesis,
	NativeFieldHypothesisGraph,
	NativeFieldTopologyQuery,
	NativeFieldTopologyQueryInput,
} from "./src/native-field-hypothesis-graph.ts"
import { stableArtworkId, type PaletteId, type PaletteSnapshot, type SemanticPalette } from "./src/review-evidence.ts"
import type { CorpusResult, Palette, RGB } from "./src/types.ts"

export const FACTORIZED_FIELD_STATE_DEVELOPMENT_PATH =
	"research/data/factorized-field-state-development.json" as const
export const FACTORIZED_FIELD_STATE_ANALYSIS_PATH =
	"research/data/factorized-field-state-analysis.json" as const

const graphPath = "research/data/native-field-hypothesis-graph-development.json" as const
const gradientRegistryPath = "research/data/experiments/gradient-field-topology-3.0.0-development.json" as const
const planPath = "research/FACTORIZED_FIELD_STATE_PLAN.md" as const
const expectedGraphSha256 = "990b3fb8370cb670831dcd0734b1bfdd1d17f58dd9fd617d3967698cc9fb8281"
const expectedGradientRegistrySha256 = "2722e5a99b8b218b3d28c975f5ae00624862420acae790da71f2cadfa3ec1983"

const rawNativeResultsPath =
	"research/data/experiments/region-graph-0.19.0-native-resolution-0.1.1-development/results.json" as const
const finalNativeResultsPath =
	"research/data/experiments/region-graph-0.19.0-native-role-observation-gradient-0.3.0-development/results.json" as const
const rawNativeFeedbackPath = "research/data/native-resolution-review-feedback.json" as const
const finalNativeFeedbackPath = "research/data/native-role-observation-gradient-review-feedback.json" as const

const reviewOrigins = Object.freeze([
	{
		origin: "field-pair",
		manifest: "research/data/experiments/next-palette-0.2.0-field-pair-development/review-v1/batch-01-manifest.json",
		feedback: "research/data/experiments/next-palette-0.2.0-field-pair-development/review-v1/batch-01-feedback.json",
	},
	{
		origin: "field-dominance",
		manifest: "research/data/experiments/joint-palette-field-dominance-first-0.1.0-development/review-v2/batch-01-manifest.json",
		feedback: "research/data/experiments/joint-palette-field-dominance-first-0.1.0-development/review-v2/batch-01-feedback.json",
	},
	{
		origin: "threshold-free",
		manifest: "research/data/experiments/joint-palette-threshold-free-collapse-0.1.0-development/review-v2/batch-01-manifest.json",
		feedback: "research/data/experiments/joint-palette-threshold-free-collapse-0.1.0-development/review-v2/batch-01-feedback.json",
	},
	{
		origin: "ablation",
		manifest: "research/data/experiments/joint-palette-ablation-stable-noncollapsed-field-0.1.0-development/review-v2/batch-01-manifest.json",
		feedback: "research/data/experiments/joint-palette-ablation-stable-noncollapsed-field-0.1.0-development/review-v2/batch-01-feedback.json",
	},
] as const)

const expectedCanonicalDirectIds = new Set([
	"judgment:pairwise:v1|artwork:file:knuckles.jpg|mrq34k2n-s7lgmdq5",
	"judgment:pairwise:v1|artwork:file:disney.avif|mrq5pw0k-wyzr9lut",
	"judgment:pairwise:v1|artwork:file:greenday.jpg|mrq8xjcq-rg0jthue",
	"judgment:pairwise:v1|artwork:file:meteora.jpg|mrq8znq9-azq3qf68",
	"judgment:pairwise:v1|artwork:file:vvbrown.jpg|mrq9yekr-3ey9odl8",
	"judgment:pairwise:v1|artwork:file:disney.avif|mrqb6f0i-s6s9u12d",
	"judgment:pairwise:v1|artwork:file:disney.avif|mrqd6cch-lvwlwin9",
	"judgment:pairwise:v1|artwork:file:elephunk.jpg|mrqfv8r4-pfu32f95",
	"judgment:pairwise:v1|artwork:file:nobs.jpg|mrqfwuam-5lwvm7ku",
	"judgment:pairwise:v1|artwork:spotify:000018e9b0ec8fc5ac790164|fc384e1f-2951-45b7-aa1b-0def21cac40e",
	"judgment:pairwise:v1|artwork:spotify:000045be7b6dfb8bf9fe7a15|de0f53b0-f16c-43b0-836d-fe00994f8959",
	"judgment:pairwise:v1|artwork:spotify:00004554beea0eaa5fef3858|33218e5f-3cf9-4943-aa75-4db378e05170",
])

const expectedManifestDirectIds = new Set([
	"npr-44c105a85986dd1c0605",
	"npr-ef01020627fe20876d57",
	"npr-d696a546087a6b9f256a",
	"npr-27487a19f0bdf3315863",
	"npr-053e8c1ebd5cc378b2c7",
	"npr-c9799befda4b812156e3",
	"npr-1edc6720974b4479ef58",
	"npr-ea8dd16ed0d55bb7babd",
	"npr-77e7e7e38fc90bd16bcc",
])

const diagnosticSourceSet: ReadonlySet<string> = new Set([
	"6dfd27c93891e02bccb9597196bca250807177c210e3e660f6fb66257cd2c1ef",
	"26fb272d7128b9ed89ac19b8fc0c2810d10cae4ace1a06a37663b20b2bb61fc9",
	"057be6b5a93708db128db9752b66b3d7631fec5d5611f3c5e318a03f6ee0c0d2",
	"26b991b5d5b9c2a1a390bc5ec398a9b24231da0ce78e927e663aefd9ac1f5d9d",
	"3afaf90cd911c134fe26708b3da3fdad181eb38cd8455a8a4538de88a4894091",
])

type GraphEntry = { file: string; source: { sha256: string }; graph: NativeFieldHypothesisGraph }
type GraphDevelopment = { entries: GraphEntry[] }

type DirectRow = {
	id: string
	origin: string
	sourcePath: string
	sourceSha256: string
	preferred: SemanticPalette
	other: SemanticPalette
	provenancePaths: string[]
}

type ChildResult = {
	schemaVersion: 1
	version: string
	policySha256: string
	source: { relativePath: string; bytes: number; sha256: string }
	graph: NativeFieldHypothesisGraph
	queries: NativeFieldFamilyQuery[]
	topologyQueries: NativeFieldTopologyQuery[]
	resource: { elapsedMs: number; maximumRssBytes: number }
}

type SourceRequest = {
	path: string
	sha256: string
	rgbs: Map<string, RGB>
	topologyPairs: Map<string, NativeFieldTopologyQueryInput>
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
	if (typeof value === "object" && value !== null) {
		const record = value as Record<string, unknown>
		return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`
	}
	return JSON.stringify(value)
}

function hashObject(value: unknown): string {
	return sha256(canonicalJson(value))
}

function mean(values: readonly number[]): number {
	if (values.length === 0) throw new Error("Cannot average an empty value set")
	return values.reduce((sum, value) => sum + value, 0) / values.length
}

function sourceGroupMean<T extends { groupId: string }>(values: readonly T[], metric: (value: T) => number): number | null {
	if (values.length === 0) return null
	const groups = new Map<string, number[]>()
	for (const value of values) {
		let entries = groups.get(value.groupId)
		if (!entries) groups.set(value.groupId, entries = [])
		entries.push(metric(value))
	}
	return mean([...groups.values()].map((entries) => mean(entries)))
}

function semanticRole(value: { rgb: RGB; generated: boolean }) {
	return { rgb: [...value.rgb] as RGB, generated: value.generated }
}

function semanticFromPalette(palette: Palette): SemanticPalette {
	return {
		background: semanticRole(palette.background),
		foreground: semanticRole(palette.foreground),
		surface: semanticRole(palette.surface),
		accent: semanticRole(palette.accent),
		gradient: palette.gradient.isGradient,
	}
}

function semanticFromPresented(value: any): SemanticPalette {
	return {
		background: semanticRole(value.roles.background),
		foreground: semanticRole(value.roles.foreground),
		surface: semanticRole(value.roles.surface),
		accent: semanticRole(value.roles.accent),
		gradient: value.gradient.isGradient,
	}
}

function sameRole(first: SemanticPalette, second: SemanticPalette, role: "background" | "foreground" | "surface" | "accent") {
	return first[role].generated === second[role].generated &&
		first[role].rgb.every((channel, index) => channel === second[role].rgb[index])
}

function literalCollapsed(palette: SemanticPalette): boolean {
	return !palette.gradient && palette.background.rgb.every((channel, index) => channel === palette.surface.rgb[index]) &&
		palette.background.generated === palette.surface.generated
}

function fieldControlled(first: SemanticPalette, second: SemanticPalette): boolean {
	return sameRole(first, second, "foreground") && sameRole(first, second, "accent")
}

function directMultiplicity(first: SemanticPalette, second: SemanticPalette): boolean {
	return fieldControlled(first, second) && literalCollapsed(first) !== literalCollapsed(second)
}

function sourcePath(file: string): string {
	if (/^(?:images|00)\/[^/\\]+$/.test(file)) return file
	if (file.includes("/") || file.includes("\\")) throw new Error(`Unsupported direct source path: ${file}`)
	return `images/${file}`
}

function queriedPalette(palette: SemanticPalette): QueriedFieldPalette {
	return { background: palette.background, surface: palette.surface, gradient: palette.gradient }
}

function snapshotLookup(palettes: readonly PaletteSnapshot[]) {
	const lookup = new Map<string, PaletteSnapshot>()
	for (const palette of palettes) lookup.set(`${palette.artworkId}\0${palette.paletteId}`, palette)
	return lookup
}

async function sourceSha(projectRoot: string, relativePath: string): Promise<string> {
	return sha256(await readFile(resolve(projectRoot, relativePath)))
}

async function canonicalDirectRows(
	projectRoot: string,
	ledger: Awaited<ReturnType<typeof buildReviewEvidence>>["ledger"],
): Promise<DirectRow[]> {
	const snapshots = snapshotLookup(ledger.palettes)
	const rows: DirectRow[] = []
	for (const event of ledger.events) {
		if (event.preference?.kind !== "preferred") continue
		const preferred = snapshots.get(`${event.artworkId}\0${event.preference.preferredPaletteId}`)
		const other = snapshots.get(`${event.artworkId}\0${event.preference.otherPaletteId}`)
		if (!preferred || !other || !directMultiplicity(preferred.semantic, other.semantic)) continue
		const path = sourcePath(preferred.file)
		rows.push({
			id: event.id,
			origin: "canonical-ledger",
			sourcePath: path,
			sourceSha256: await sourceSha(projectRoot, path),
			preferred: preferred.semantic,
			other: other.semantic,
			provenancePaths: [...event.sources],
		})
	}
	if (rows.length !== expectedCanonicalDirectIds.size ||
		rows.some((row) => !expectedCanonicalDirectIds.has(row.id))) {
		throw new Error(`Canonical direct multiplicity inventory changed: ${rows.map((row) => row.id).join(",")}`)
	}
	return rows
}

async function manifestDirectRows(projectRoot: string): Promise<DirectRow[]> {
	const rows: DirectRow[] = []
	for (const origin of reviewOrigins) {
		const [manifest, feedback] = await Promise.all([
			readFile(resolve(projectRoot, origin.manifest), "utf8").then(JSON.parse),
			readFile(resolve(projectRoot, origin.feedback), "utf8").then(JSON.parse),
		]) as [any, any]
		const entries = new Map(manifest.entries.map((entry: any) => [entry.caseId, entry]))
		for (const stored of feedback.entries) {
			if (!stored || stored.sourceEligibility !== "eligible-artwork" ||
				!(stored.preference === "a-stronger" || stored.preference === "b-stronger")) continue
			const entry: any = entries.get(stored.caseId)
			if (!entry || stored.sourceSha256 !== entry.source.sha256) throw new Error(`Review case binding failed: ${stored.caseId}`)
			const optionA = semanticFromPresented(entry.options.A)
			const optionB = semanticFromPresented(entry.options.B)
			if (!directMultiplicity(optionA, optionB)) continue
			const preferred = stored.preference === "a-stronger" ? optionA : optionB
			const other = stored.preference === "a-stronger" ? optionB : optionA
			rows.push({
				id: stored.caseId,
				origin: origin.origin,
				sourcePath: entry.source.file,
				sourceSha256: entry.source.sha256,
				preferred,
				other,
				provenancePaths: [origin.manifest, origin.feedback],
			})
		}
	}
	if (rows.length !== expectedManifestDirectIds.size || rows.some((row) => !expectedManifestDirectIds.has(row.id))) {
		throw new Error(`Manifest direct multiplicity inventory changed: ${rows.map((row) => row.id).join(",")}`)
	}
	return rows
}

function directTupleKey(row: DirectRow): string {
	return `${row.sourceSha256}\0${canonicalJson(row.preferred)}\0${canonicalJson(row.other)}`
}

function addRgb(request: SourceRequest, rgb: RGB): void {
	request.rgbs.set(rgb.join(","), [...rgb])
}

function addTopologyPair(request: SourceRequest, backgroundRgb: RGB, surfaceRgb: RGB): void {
	addRgb(request, backgroundRgb)
	addRgb(request, surfaceRgb)
	request.topologyPairs.set(`${backgroundRgb.join(",")}>${surfaceRgb.join(",")}`, {
		backgroundRgb: [...backgroundRgb],
		surfaceRgb: [...surfaceRgb],
	})
}

async function runChild(projectRoot: string, request: SourceRequest): Promise<ChildResult> {
	const childPath = fileURLToPath(new URL("./factorized-field-state-child.ts", import.meta.url))
	const payload = JSON.stringify({ rgbs: [...request.rgbs.values()], topologyPairs: [...request.topologyPairs.values()] })
	return await new Promise((resolveChild, rejectChild) => {
		const child = spawn(process.execPath, ["--experimental-strip-types", childPath, request.path, payload], {
			cwd: projectRoot,
			env: { ...process.env, NODE_NO_WARNINGS: "1" },
			stdio: ["ignore", "pipe", "pipe"],
		})
		let stdout = ""
		let stderr = ""
		const timer = setTimeout(() => child.kill("SIGKILL"), 180_000)
		child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
			stdout += chunk
			if (stdout.length > 32 * 1024 * 1024) child.kill("SIGKILL")
		})
		child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
			stderr += chunk
			if (stderr.length > 1024 * 1024) child.kill("SIGKILL")
		})
		child.on("error", rejectChild)
		child.on("close", (code, signal) => {
			clearTimeout(timer)
			if (code !== 0) return rejectChild(new Error(`Factorized child failed (${code ?? signal}): ${stderr.trim()}`))
			try {
				const parsed = JSON.parse(stdout) as ChildResult
				if (parsed.schemaVersion !== 1 || parsed.source.relativePath !== request.path ||
					parsed.source.sha256 !== request.sha256 || parsed.graph.source.sha256 !== request.sha256) {
					throw new Error("Factorized child identity is invalid")
				}
				resolveChild(parsed)
			} catch (error) {
				rejectChild(error)
			}
		})
	})
}

function hypothesisSupport(hypothesis: NativeFieldHypothesis): number {
	if (hypothesis.state === "collapsed") return hypothesis.oneFieldFit.mean
	return harmonicConjunction([hypothesis.twoFieldFit!.mean, hypothesis.incrementalSurfaceIdentity!.mean])
}

function metrics(comparisons: readonly FactorizedComparison[], featureNames: readonly string[]) {
	if (comparisons.length === 0) return null
	const predictions = leaveOneFactorizedSourceGroupOut(featureNames, comparisons)
	return {
		predictionCount: predictions.length,
		sourceGroupCount: new Set(comparisons.map((entry) => entry.groupId)).size,
		sourceBalancedAccuracy: sourceGroupMean(predictions, (entry) => entry.correct ? 1 : 0),
		sourceBalancedMeanLogLoss: sourceGroupMean(predictions, (entry) => entry.logLoss),
		comparisonAccuracy: predictions.filter((entry) => entry.correct).length / predictions.length,
		predictions,
	}
}

function corpusPalette(corpus: CorpusResult, file: string): Palette {
	const entry = corpus.entries.find((candidate) => candidate.file === file)
	if (!entry) throw new Error(`Corpus palette is missing: ${corpus.algorithmVersion}/${file}`)
	return entry.extraction.methods.spatial
}

async function inputHashes(projectRoot: string) {
	const paths = [
		graphPath, gradientRegistryPath, planPath, rawNativeResultsPath, finalNativeResultsPath,
		rawNativeFeedbackPath, finalNativeFeedbackPath,
		...reviewOrigins.flatMap((origin) => [origin.manifest, origin.feedback]),
		...reviewEvidenceInputPaths.map((path) => `research/${path}`),
	]
	const result: Record<string, string> = {}
	for (const path of [...new Set(paths)].sort(compareAscii)) result[path] = sha256(await readFile(resolve(projectRoot, path)))
	return result
}

export async function evaluateFactorizedFieldState(projectRoot = fileURLToPath(new URL("..", import.meta.url))) {
	const researchRoot = resolve(projectRoot, "research")
	const reviewEvidence = await buildReviewEvidence(researchRoot)
	const [graphSource, registrySource, canonicalRows, manifestRows, rawResultsSource,
		finalResultsSource, rawFeedbackSource, finalFeedbackSource, hashes] = await Promise.all([
		readFile(resolve(projectRoot, graphPath)),
		readFile(resolve(projectRoot, gradientRegistryPath), "utf8"),
		canonicalDirectRows(projectRoot, reviewEvidence.ledger),
		manifestDirectRows(projectRoot),
		readFile(resolve(projectRoot, rawNativeResultsPath), "utf8"),
		readFile(resolve(projectRoot, finalNativeResultsPath), "utf8"),
		readFile(resolve(projectRoot, rawNativeFeedbackPath), "utf8"),
		readFile(resolve(projectRoot, finalNativeFeedbackPath), "utf8"),
		inputHashes(projectRoot),
	])
	if (sha256(graphSource) !== expectedGraphSha256) throw new Error("Frozen native field graph changed")
	if (sha256(registrySource) !== expectedGradientRegistrySha256) throw new Error("Frozen gradient registry changed")
	const graphDevelopment = JSON.parse(graphSource.toString("utf8")) as GraphDevelopment
	const graphByArtwork = new Map(graphDevelopment.entries.map((entry) => [stableArtworkId(entry.file), entry]))
	const graphBySource = new Map(graphDevelopment.entries.map((entry) => [entry.source.sha256, entry]))
	const registry = JSON.parse(registrySource) as any
	const targetedRegistry = registry.entries.filter((entry: any) => entry.reviewBatch === "targeted" &&
		["validation-birdsofprey", "validation-doja", "validation-muse", "validation-nada"].includes(entry.familyId))
	if (targetedRegistry.length !== 4 || targetedRegistry.some((entry: any) => entry.judgment !== "should-be-gradient")) {
		throw new Error("Targeted gradient registry overlap changed")
	}

	const directRowsByTuple = new Map<string, DirectRow>()
	for (const row of [...canonicalRows, ...manifestRows]) {
		if (await sourceSha(projectRoot, row.sourcePath) !== row.sourceSha256) throw new Error(`Direct source hash changed: ${row.sourcePath}`)
		const key = directTupleKey(row)
		if (directRowsByTuple.has(key)) throw new Error(`Unexpected duplicate direct tuple: ${row.id}`)
		directRowsByTuple.set(key, row)
	}
	const directRows = [...directRowsByTuple.values()].sort((first, second) => compareAscii(first.id, second.id))
	if (directRows.length !== 21 || new Set(directRows.map((row) => row.sourceSha256)).size !== 19) {
		throw new Error("Direct multiplicity dataset does not contain 21 judgments over 19 source groups")
	}

	const requests = new Map<string, SourceRequest>()
	const requestFor = (path: string, sourceSha256: string) => {
		let request = requests.get(sourceSha256)
		if (!request) {
			request = { path, sha256: sourceSha256, rgbs: new Map(), topologyPairs: new Map() }
			requests.set(sourceSha256, request)
		} else if (request.path !== path && compareAscii(path, request.path) < 0) request.path = path
		return request
	}
	for (const row of directRows) {
		const request = requestFor(row.sourcePath, row.sourceSha256)
		for (const palette of [row.preferred, row.other]) {
			if (!palette.background.generated) addRgb(request, palette.background.rgb)
			if (!palette.surface.generated) addRgb(request, palette.surface.rgb)
			if (!literalCollapsed(palette) && !palette.background.generated && !palette.surface.generated) {
				addTopologyPair(request, palette.background.rgb, palette.surface.rgb)
			}
		}
	}
	for (const entry of targetedRegistry) {
		const request = requestFor(entry.sourceFile, entry.sourceSha256)
		addTopologyPair(request, entry.endpoints.background.rgb, entry.endpoints.surface.rgb)
	}
	const rawResults = JSON.parse(rawResultsSource) as CorpusResult
	const finalResults = JSON.parse(finalResultsSource) as CorpusResult
	const kraftyRaw = semanticFromPalette(corpusPalette(rawResults, "krafty.jpg"))
	const kraftyFinal = semanticFromPalette(corpusPalette(finalResults, "krafty.jpg"))
	const rawKraftyFeedback = (JSON.parse(rawFeedbackSource) as any).entries.find((entry: any) => entry.image === "krafty.jpg")
	const finalKraftyFeedback = (JSON.parse(finalFeedbackSource) as any).entries.find((entry: any) => entry.image === "krafty.jpg")
	if (!rawKraftyFeedback?.reasons?.includes("unnecessary-gradient") || rawKraftyFeedback.ship !== "left" ||
		finalKraftyFeedback?.ship !== "both" || !fieldControlled(kraftyRaw, kraftyFinal) ||
		!sameRole(kraftyRaw, kraftyFinal, "background") || !sameRole(kraftyRaw, kraftyFinal, "surface") ||
		kraftyRaw.gradient !== true || kraftyFinal.gradient !== false) {
		throw new Error("Structured Krafty gradient regression evidence changed")
	}
	const kraftyRequest = requestFor("images/krafty.jpg", rawKraftyFeedback.sourceSha256)
	addTopologyPair(kraftyRequest, kraftyRaw.background.rgb, kraftyRaw.surface.rgb)

	const childResults = new Map<string, ChildResult>()
	for (const [index, request] of [...requests.values()].sort((first, second) => compareAscii(first.path, second.path)).entries()) {
		const child = await runChild(projectRoot, request)
		childResults.set(request.sha256, child)
		process.stderr.write(`[${index + 1}/${requests.size}] ${request.path}\n`)
	}
	const frozenGraphQueryMismatches: string[] = []
	for (const [sourceSha256, child] of childResults) {
		const frozen = graphBySource.get(sourceSha256)
		if (frozen && !isDeepStrictEqual(frozen.graph, child.graph)) frozenGraphQueryMismatches.push(sourceSha256)
	}
	const queryMutationMismatches: string[] = []
	for (const sourceSha256 of frozenGraphQueryMismatches) {
		const request = requests.get(sourceSha256)!
		const ordinary = await runChild(projectRoot, {
			path: request.path,
			sha256: request.sha256,
			rgbs: new Map(),
			topologyPairs: new Map(),
		})
		if (!isDeepStrictEqual(ordinary.graph, childResults.get(sourceSha256)!.graph)) {
			queryMutationMismatches.push(sourceSha256)
		}
	}

	const multiplicityComparisons: FactorizedComparison[] = []
	const directMapping = []
	for (const row of directRows) {
		const child = childResults.get(row.sourceSha256)!
		const preferred = mapQueriedFieldPalette(child.graph, child.queries, queriedPalette(row.preferred))
		const other = mapQueriedFieldPalette(child.graph, child.queries, queriedPalette(row.other))
		const mapped = preferred.status === "mapped" && other.status === "mapped" &&
			(preferred.hypothesis.state === "collapsed") !== (other.hypothesis.state === "collapsed")
		directMapping.push({
			id: row.id,
			origin: row.origin,
			sourceSha256: row.sourceSha256,
			preferredStatus: preferred.status,
			otherStatus: other.status,
			mapped,
		})
		if (!mapped || preferred.status !== "mapped" || other.status !== "mapped") continue
		multiplicityComparisons.push({
			id: row.id,
			groupId: row.sourceSha256,
			preferred: fieldMultiplicityFeatures(child.graph, preferred.hypothesis),
			other: fieldMultiplicityFeatures(child.graph, other.hypothesis),
		})
	}
	const multiplicityTraining = multiplicityComparisons.filter((entry) => !diagnosticSourceSet.has(entry.groupId))
	const multiplicityEvaluation = metrics(multiplicityTraining, FIELD_MULTIPLICITY_FEATURES)
	const multiplicityModel = multiplicityTraining.length > 0
		? fitFactorizedRanker(FIELD_MULTIPLICITY_FEATURES, multiplicityTraining)
		: null
	const multiplicityBaselineRows = multiplicityTraining.map((comparison) => {
		const row = directRows.find((candidate) => candidate.id === comparison.id)!
		const child = childResults.get(row.sourceSha256)!
		const preferred = mapQueriedFieldPalette(child.graph, child.queries, queriedPalette(row.preferred))
		const other = mapQueriedFieldPalette(child.graph, child.queries, queriedPalette(row.other))
		return {
			groupId: row.sourceSha256,
			correct: preferred.status === "mapped" && other.status === "mapped" &&
				hypothesisSupport(preferred.hypothesis) > hypothesisSupport(other.hypothesis),
		}
	})
	const multiplicityBaselineAccuracy = sourceGroupMean(multiplicityBaselineRows, (entry) => entry.correct ? 1 : 0)

	const snapshots = snapshotLookup(reviewEvidence.ledger.palettes)
	const pairComparisons: FactorizedComparison[] = []
	for (const event of reviewEvidence.ledger.events) {
		if (event.preference?.kind !== "preferred") continue
		const preferredSnapshot = snapshots.get(`${event.artworkId}\0${event.preference.preferredPaletteId}`)
		const otherSnapshot = snapshots.get(`${event.artworkId}\0${event.preference.otherPaletteId}`)
		const graphEntry = graphByArtwork.get(event.artworkId)
		if (!preferredSnapshot || !otherSnapshot || !graphEntry || diagnosticSourceSet.has(graphEntry.source.sha256)) continue
		const preferred = mapPaletteToFieldHypothesis(graphEntry.graph, {
			background: preferredSnapshot.semantic.background,
			surface: preferredSnapshot.semantic.surface,
			gradient: { isGradient: preferredSnapshot.semantic.gradient },
		})
		const other = mapPaletteToFieldHypothesis(graphEntry.graph, {
			background: otherSnapshot.semantic.background,
			surface: otherSnapshot.semantic.surface,
			gradient: { isGradient: otherSnapshot.semantic.gradient },
		})
		if (preferred.status !== "mapped" || other.status !== "mapped") continue
		const preferredPair = fieldPairIdentity(preferred.hypothesis)
		const otherPair = fieldPairIdentity(other.hypothesis)
		if (!preferredPair || !otherPair || preferredPair === otherPair) continue
		pairComparisons.push({
			id: event.id,
			groupId: graphEntry.source.sha256,
			preferred: fieldPairFeatures(
				graphEntry.graph, preferred.hypothesis.backgroundFamilyStableKey, preferred.hypothesis.surfaceFamilyStableKey!,
			),
			other: fieldPairFeatures(
				graphEntry.graph, other.hypothesis.backgroundFamilyStableKey, other.hypothesis.surfaceFamilyStableKey!,
			),
		})
	}
	const pairEvaluation = metrics(pairComparisons, FIELD_PAIR_FEATURES)
	const pairModel = pairComparisons.length > 0 ? fitFactorizedRanker(FIELD_PAIR_FEATURES, pairComparisons) : null

	const gradientChecks = targetedRegistry.map((entry: any) => {
		const registryDecision = scoreGradientFieldTopologyEvidence(entry.evidence)
		const child = childResults.get(entry.sourceSha256)!
		const query = child.topologyQueries.find((candidate) =>
			candidate.backgroundRgb.every((channel, index) => channel === entry.endpoints.background.rgb[index]) &&
			candidate.surfaceRgb.every((channel, index) => channel === entry.endpoints.surface.rgb[index]))!
		return {
			familyId: entry.familyId,
			sourceSha256: entry.sourceSha256,
			judgment: entry.judgment,
			registryScore: registryDecision.score,
			registryEligible: registryDecision.eligible,
			nativeGraphStatus: query.status,
			nativeGraphObservation224: query.observation224,
		}
	})
	const kraftyQuery = childResults.get(rawKraftyFeedback.sourceSha256)!.topologyQueries.find((query) =>
		query.backgroundRgb.every((channel, index) => channel === kraftyRaw.background.rgb[index]) &&
		query.surfaceRgb.every((channel, index) => channel === kraftyRaw.surface.rgb[index]))!

	const gates = {
		familyQueriesPreserveGraphDomain: queryMutationMismatches.length === 0,
		sufficientMultiplicityGroups: new Set(multiplicityTraining.map((entry) => entry.groupId)).size >= 12,
		sufficientMultiplicityComparisons: multiplicityTraining.length >= 14,
		completeMultiplicityCoverage: multiplicityEvaluation?.predictionCount === multiplicityTraining.length,
		completePairCoverage: pairEvaluation?.predictionCount === pairComparisons.length,
		pairAccuracy: (pairEvaluation?.sourceBalancedAccuracy ?? 0) >= 0.6,
		pairLogLoss: (pairEvaluation?.sourceBalancedMeanLogLoss ?? Infinity) < Math.log(2),
		multiplicityAccuracy: (multiplicityEvaluation?.sourceBalancedAccuracy ?? 0) >= 0.65,
		multiplicityLogLoss: (multiplicityEvaluation?.sourceBalancedMeanLogLoss ?? Infinity) < Math.log(2),
		multiplicityImprovesBaseline: (multiplicityEvaluation?.sourceBalancedAccuracy ?? 0) >
			(multiplicityBaselineAccuracy ?? 1),
		structuredGradientChecks: gradientChecks.filter((entry: any) => entry.nativeGraphStatus === "mapped")
			.every((entry: any) => entry.registryEligible && entry.nativeGraphObservation224?.eligible === true),
		kraftyRegressionPrevented: kraftyQuery.status === "mapped" && kraftyQuery.observation224?.eligible === false,
		noInterpretedCommentTargets: true,
	}
	const passed = Object.values(gates).every(Boolean)
	const policy = {
		version: FACTORIZED_FIELD_STATE_VERSION,
		graphSha256: expectedGraphSha256,
		gradientRegistrySha256: expectedGradientRegistrySha256,
		pairFeatures: FIELD_PAIR_FEATURES,
		multiplicityFeatures: FIELD_MULTIPLICITY_FEATURES,
		diagnosticSourceSha256: [...diagnosticSourceSet].sort(compareAscii),
		labels: "direct-field-controlled-multiplicity-plus-state-free-holistic-pair-ranking",
		gradientAuthority: "frozen-gradient-field-topology-model-3.0.0-dev-exact-pair",
		commentsUsedAsLabels: false,
		paletteOutput: "forbidden",
		humanReview: "forbidden",
		reserveRoots: "forbidden",
	}
	const policySha256 = hashObject(policy)
	const development = {
		schemaVersion: 1,
		experimentId: FACTORIZED_FIELD_STATE_VERSION,
		policy,
		policySha256,
		scientificIdentitySha256: hashObject({ policySha256, inputs: hashes }),
		inputs: hashes,
		directMultiplicityDataset: {
			rawJudgments: directRows.length,
			rawSourceGroups: new Set(directRows.map((entry) => entry.sourceSha256)).size,
			mappedJudgments: multiplicityComparisons.length,
			trainingJudgments: multiplicityTraining.length,
			trainingSourceGroups: new Set(multiplicityTraining.map((entry) => entry.groupId)).size,
			excludedDiagnosticGroups: [...diagnosticSourceSet].sort(compareAscii),
			mapping: directMapping,
		},
		resources: {
			sourceCount: childResults.size,
			maximumRssBytes: Math.max(...[...childResults.values()].map((entry) => entry.resource.maximumRssBytes)),
			maximumElapsedMs: Math.max(...[...childResults.values()].map((entry) => entry.resource.elapsedMs)),
			frozenGraphReproductionMismatches: frozenGraphQueryMismatches,
			queryMutationMismatches,
		},
		pairModel,
		pairEvaluation,
		multiplicityModel,
		multiplicityEvaluation: multiplicityEvaluation && {
			...multiplicityEvaluation,
			baselineAccuracy: multiplicityBaselineAccuracy,
		},
		gradientAuthority: {
			registryDecisiveCount: registry.summary.judgments["should-be-gradient"] +
				registry.summary.judgments["should-not-be-gradient"],
			targetedChecks: gradientChecks,
			krafty: {
				rawEvidenceId: rawKraftyFeedback.id,
				finalEvidenceId: finalKraftyFeedback.id,
				rawStructuredReason: "unnecessary-gradient",
				exactRolesPreservedAcrossRawAndFinal: true,
				rawGradient: kraftyRaw.gradient,
				finalGradient: kraftyFinal.gradient,
				nativeGraphTopology: kraftyQuery,
			},
		},
		gates,
		decision: {
			status: passed ? "pass" : "withhold",
			factorizedFieldAuthority: passed,
			completeTuplePlanAuthorized: passed,
			paletteOutputAuthorized: false,
			humanReviewAuthorized: false,
			reserveRootsAuthorized: false,
		},
	}
	return development
}

async function main() {
	const arguments_ = process.argv.slice(2)
	if (arguments_.length > 1 || arguments_.length === 1 && arguments_[0] !== "--write") {
		throw new Error("Usage: evaluate-factorized-field-state.ts [--write]")
	}
	const projectRoot = fileURLToPath(new URL("..", import.meta.url))
	const development = await evaluateFactorizedFieldState(projectRoot)
	if (arguments_[0] !== "--write") {
		process.stdout.write(`${JSON.stringify({
			directMultiplicityDataset: development.directMultiplicityDataset,
			pairEvaluation: development.pairEvaluation,
			multiplicityEvaluation: development.multiplicityEvaluation,
			gradientAuthority: development.gradientAuthority,
			gates: development.gates,
			decision: development.decision,
		}, null, 2)}\n`)
		return
	}
	const developmentSource = `${JSON.stringify(development, null, 2)}\n`
	await writeFile(resolve(projectRoot, FACTORIZED_FIELD_STATE_DEVELOPMENT_PATH), developmentSource)
	const analysis = {
		schemaVersion: 1,
		experimentId: FACTORIZED_FIELD_STATE_VERSION,
		policySha256: development.policySha256,
		scientificIdentitySha256: development.scientificIdentitySha256,
		developmentSha256: sha256(developmentSource),
		directMultiplicityDataset: {
			rawJudgments: development.directMultiplicityDataset.rawJudgments,
			rawSourceGroups: development.directMultiplicityDataset.rawSourceGroups,
			mappedJudgments: development.directMultiplicityDataset.mappedJudgments,
			trainingJudgments: development.directMultiplicityDataset.trainingJudgments,
			trainingSourceGroups: development.directMultiplicityDataset.trainingSourceGroups,
		},
		pairEvaluation: development.pairEvaluation && {
			predictionCount: development.pairEvaluation.predictionCount,
			sourceGroupCount: development.pairEvaluation.sourceGroupCount,
			sourceBalancedAccuracy: development.pairEvaluation.sourceBalancedAccuracy,
			sourceBalancedMeanLogLoss: development.pairEvaluation.sourceBalancedMeanLogLoss,
		},
		multiplicityEvaluation: development.multiplicityEvaluation && {
			predictionCount: development.multiplicityEvaluation.predictionCount,
			sourceGroupCount: development.multiplicityEvaluation.sourceGroupCount,
			sourceBalancedAccuracy: development.multiplicityEvaluation.sourceBalancedAccuracy,
			sourceBalancedMeanLogLoss: development.multiplicityEvaluation.sourceBalancedMeanLogLoss,
			baselineAccuracy: development.multiplicityEvaluation.baselineAccuracy,
		},
		gradientAuthority: development.gradientAuthority,
		gates: development.gates,
		decision: development.decision,
		conclusion: development.decision.factorizedFieldAuthority
			? "Factorized field authority passed; a complete-tuple evidence plan is authorized."
			: "Factorized field authority is withheld; stop before complete-tuple inference or review.",
	}
	await writeFile(resolve(projectRoot, FACTORIZED_FIELD_STATE_ANALYSIS_PATH), `${JSON.stringify(analysis, null, 2)}\n`)
	process.stdout.write(`${FACTORIZED_FIELD_STATE_DEVELOPMENT_PATH}\n${FACTORIZED_FIELD_STATE_ANALYSIS_PATH}\n`)
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
	main().catch((error) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}
