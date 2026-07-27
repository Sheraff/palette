import { spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { access, link, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	CONTROLLED_FIELD_STATE_PRESENTATION_VERSION,
	CONTROLLED_FIELD_STATE_REVIEW_VERSION,
	controlledFieldStateManifestId,
	parseControlledFieldStateManifest,
	type ControlledFieldStateReviewEntry,
	type ControlledFieldStateReviewManifest,
	type ControlledFieldStateTask,
	type ControlledFieldStateTreatment,
} from "./src/controlled-field-state-review.ts"
import type { CorpusResult, Palette } from "./src/types.ts"

const experimentVersion = "controlled-field-state-supervision-0.1.0-development"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const experimentRoot = join(researchRoot, `data/experiments/${experimentVersion}`)
const reviewRoot = join(experimentRoot, "review-v1")
const resultPath = join(researchRoot, "data/results.json")
const transferDevelopmentPath = join(researchRoot, "data/native-exact-pair-topology-transfer-development.json")
const transferAnalysisPath = join(researchRoot, "data/native-exact-pair-topology-transfer-analysis.json")
const planPath = join(researchRoot, "CONTROLLED_FIELD_STATE_SUPERVISION_PLAN.md")
const expectedResultsSha256 = "546a53979c651f7b20d6a741e0c60c63e6bb97869f93a22918e1de4b5e488fec"
const expectedTransferDevelopmentSha256 = "cf7eede975536aa0fa50645d63c1f8c5158f19c971c3e81a09fe1dc730307d30"
const expectedTransferAnalysisSha256 = "17c31c78ae172b638e10171f598a10250bdcc89403f0b703546cf37ba177c4ca"
const selectedSourceCount = 24
const sourcesPerBatch = 12
const concurrency = 2

const diagnosticFiles = new Set([
	"birdsofprey.jpg",
	"knuckles.jpg",
	"krafty.jpg",
	"maroon5-masked.jpg",
	"maroon5-original.jpg",
	"maroon5-saliency.png",
	"maroon5.jpg",
	"once.jpg",
])

const implementationFiles = [
	"research/src/controlled-field-state-review.ts",
	"research/src/native-field-hypothesis-graph.ts",
	"research/controlled-field-state-candidate-child.ts",
	"research/prepare-controlled-field-state-review.ts",
	"research/serve-controlled-field-state-review.ts",
] as const

const presentationFiles = [
	"research/controlled-field-state-review/index.html",
	"research/controlled-field-state-review/app.js",
	"research/controlled-field-state-review/styles.css",
] as const

type EligibleChild = {
	schemaVersion: 1
	status: "eligible"
	source: { relativePath: string; sha256: string; bytes: number; width: number; height: number }
	stratum: string
	selection: unknown
	presentations: {
		pairPrimary: ControlledFieldStateReviewEntry["options"]["A"]
		pairChallenger: ControlledFieldStateReviewEntry["options"]["A"]
		collapsed: ControlledFieldStateReviewEntry["options"]["A"]
		twoField: ControlledFieldStateReviewEntry["options"]["A"]
		flat: ControlledFieldStateReviewEntry["options"]["A"]
		gradient: ControlledFieldStateReviewEntry["options"]["A"]
	}
	resource: { elapsedMs: number; maximumRssBytes: number }
}

type IneligibleChild = {
	schemaVersion: 1
	status: "ineligible"
	source: { relativePath: string; sha256: string; bytes: number; width: number; height: number }
	reason: string
	resource: { elapsedMs: number; maximumRssBytes: number }
}

type ChildResult = EligibleChild | IneligibleChild

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>
		return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`
	}
	return JSON.stringify(value)
}

function hashObject(value: unknown): string {
	return sha256(canonicalJson(value))
}

function jsonBytes(value: unknown): Buffer {
	return Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

async function exists(path: string): Promise<boolean> {
	try {
		await access(path)
		return true
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
		throw error
	}
}

async function writeExclusive(path: string, bytes: Uint8Array): Promise<void> {
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, bytes, { flag: "wx" })
	try {
		await link(temporary, path)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Refusing to overwrite ${path}`)
		throw error
	} finally {
		await rm(temporary, { force: true })
	}
}

async function fileHashes(files: readonly string[]): Promise<Record<string, string>> {
	return Object.fromEntries(await Promise.all(files.map(async (file) =>
		[file, sha256(await readFile(resolve(projectRoot, file)))] as const)))
}

function retainedRole(palette: Palette, role: "foreground" | "accent") {
	return {
		rgb: [...palette[role].rgb],
		generated: palette[role].generated,
		sourceDistance: palette[role].sourceDistance,
	}
}

async function runChild(sourcePath: string, sourceSha256: string, palette: Palette): Promise<ChildResult> {
	const childPath = fileURLToPath(new URL("./controlled-field-state-candidate-child.ts", import.meta.url))
	const payload = JSON.stringify({
		sourceSha256,
		foreground: retainedRole(palette, "foreground"),
		accent: retainedRole(palette, "accent"),
	})
	return await new Promise((resolveChild, rejectChild) => {
		const child = spawn(process.execPath, ["--experimental-strip-types", childPath, sourcePath, payload], {
			cwd: projectRoot,
			env: { ...process.env, NODE_NO_WARNINGS: "1" },
			stdio: ["ignore", "pipe", "pipe"],
		})
		let stdout = ""
		let stderr = ""
		const timer = setTimeout(() => child.kill("SIGKILL"), 180_000)
		child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
			stdout += chunk
			if (stdout.length > 8 * 1024 * 1024) child.kill("SIGKILL")
		})
		child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
			stderr += chunk
			if (stderr.length > 1024 * 1024) child.kill("SIGKILL")
		})
		child.on("error", rejectChild)
		child.on("close", (code, signal) => {
			clearTimeout(timer)
			if (code !== 0) return rejectChild(new Error(`Controlled candidate child failed for ${sourcePath} (${code ?? signal}): ${stderr.trim()}`))
			try {
				const result = JSON.parse(stdout) as ChildResult
				if (result.schemaVersion !== 1 || result.source.relativePath !== sourcePath || result.source.sha256 !== sourceSha256) {
					throw new Error(`Controlled candidate child identity is invalid: ${sourcePath}`)
				}
				resolveChild(result)
			} catch (error) {
				rejectChild(error)
			}
		})
	})
}

async function mapConcurrent<T, U>(values: readonly T[], worker: (value: T, index: number) => Promise<U>): Promise<U[]> {
	const output = new Array<U>(values.length)
	let next = 0
	let completed = 0
	await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
		while (true) {
			const index = next++
			if (index >= values.length) return
			output[index] = await worker(values[index], index)
			completed++
			process.stderr.write(`[${completed}/${values.length}] controlled source candidate\n`)
		}
	}))
	return output
}

function stratifiedOrder(entries: EligibleChild[], experimentId: string): EligibleChild[] {
	const buckets = new Map<string, EligibleChild[]>()
	for (const entry of entries) {
		let bucket = buckets.get(entry.stratum)
		if (!bucket) buckets.set(entry.stratum, bucket = [])
		bucket.push(entry)
	}
	for (const bucket of buckets.values()) bucket.sort((first, second) =>
		compareAscii(sha256(`${experimentId}\0${first.source.sha256}`), sha256(`${experimentId}\0${second.source.sha256}`)))
	const strata = [...buckets.keys()].sort((first, second) =>
		compareAscii(sha256(`${experimentId}\0stratum\0${first}`), sha256(`${experimentId}\0stratum\0${second}`)))
	const ordered: EligibleChild[] = []
	while (ordered.length < entries.length) for (const stratum of strata) {
		const entry = buckets.get(stratum)!.shift()
		if (entry) ordered.push(entry)
	}
	return ordered
}

function taskOptions(entry: EligibleChild, task: ControlledFieldStateTask) {
	switch (task) {
		case "ordered-pair": return {
			first: entry.presentations.pairPrimary,
			second: entry.presentations.pairChallenger,
			firstTreatment: "pair-primary" as const,
			secondTreatment: "pair-challenger" as const,
		}
		case "multiplicity": return {
			first: entry.presentations.collapsed,
			second: entry.presentations.twoField,
			firstTreatment: "collapsed" as const,
			secondTreatment: "two-field" as const,
		}
		case "gradient-diagnostic": return {
			first: entry.presentations.flat,
			second: entry.presentations.gradient,
			firstTreatment: "flat" as const,
			secondTreatment: "gradient" as const,
		}
	}
}

if (process.argv.slice(2).length > 0) throw new Error("prepare-controlled-field-state-review.ts does not accept arguments")
if (await exists(experimentRoot)) throw new Error(`Refusing to overwrite existing experiment: ${experimentRoot}`)

const [resultsSource, transferDevelopmentSource, transferAnalysisSource, planSource] = await Promise.all([
	readFile(resultPath),
	readFile(transferDevelopmentPath),
	readFile(transferAnalysisPath),
	readFile(planPath),
])
if (sha256(resultsSource) !== expectedResultsSha256 ||
	sha256(transferDevelopmentSource) !== expectedTransferDevelopmentSha256 ||
	sha256(transferAnalysisSource) !== expectedTransferAnalysisSha256) {
	throw new Error("Controlled field-state review input identity changed")
}
const transferAnalysis = JSON.parse(transferAnalysisSource.toString("utf8"))
if (transferAnalysis.decision?.status !== "pass" || transferAnalysis.decision?.futureStructuredFieldStatePlanAuthorized !== true ||
	transferAnalysis.decision?.humanReviewAuthorized !== false) {
	throw new Error("Native exact-pair transfer does not retain its narrow pass disposition")
}
const results = JSON.parse(resultsSource.toString("utf8")) as CorpusResult
if (results.algorithmVersion !== "region-graph-0.19.0" || results.entries.length !== 37) {
	throw new Error("Controlled field-state source roster changed")
}
const sourceInputs = await Promise.all(results.entries.filter((entry) => !diagnosticFiles.has(entry.file)).map(async (entry) => {
	const path = `images/${entry.file}`
	const source = await readFile(resolve(projectRoot, path))
	return {
		path,
		sha256: sha256(source),
		palette: entry.extraction.methods.spatial,
	}
}))
const inputHashes = {
	"research/CONTROLLED_FIELD_STATE_SUPERVISION_PLAN.md": sha256(planSource),
	"research/data/native-exact-pair-topology-transfer-development.json": sha256(transferDevelopmentSource),
	"research/data/native-exact-pair-topology-transfer-analysis.json": sha256(transferAnalysisSource),
	"research/data/results.json": sha256(resultsSource),
}
const experimentPolicy = {
	version: experimentVersion,
	inputs: inputHashes,
	sourceRoot: "images",
	diagnosticFiles: [...diagnosticFiles].sort(compareAscii),
	selectedSourceCount,
	tasks: ["ordered-pair", "multiplicity", "gradient-diagnostic"],
	singleFactor: true,
	commentsUsedAsLabels: false,
	reserveRootsAuthorized: false,
}
const experimentId = hashObject(experimentPolicy)
const childResults = await mapConcurrent(sourceInputs, (entry) => runChild(entry.path, entry.sha256, entry.palette))
const eligible = childResults.filter((entry): entry is EligibleChild => entry.status === "eligible")
if (eligible.length < selectedSourceCount) {
	throw new Error(`Only ${eligible.length} non-diagnostic sources support all controlled tasks; ${selectedSourceCount} required`)
}
const selected = stratifiedOrder(eligible, experimentId).slice(0, selectedSourceCount)
const selectedHashes = new Set(selected.map((entry) => entry.source.sha256))
const generatedAt = new Date().toISOString()
const authorization = {
	schemaVersion: 1,
	experimentId,
	experimentVersion,
	authorizationBasis: "explicit-user-request-if-review-give-me-a-review-2026-07-25",
	contractSha256: sha256(planSource),
	review: {
		authorized: true,
		blindedSingleFactorOnly: true,
		sourceGroupsPerTask: selectedSourceCount,
		tasks: experimentPolicy.tasks,
	},
	prohibitions: {
		fittingAuthorized: false,
		completeTupleInferenceAuthorized: false,
		promotionAuthorized: false,
		reserveAccessAuthorized: false,
		sourceRoots: ["images"],
	},
}
const experimentManifest = {
	schemaVersion: 1,
	experimentId,
	experimentVersion,
	generatedAt,
	policy: experimentPolicy,
	policySha256: hashObject(experimentPolicy),
	inputSourceCount: sourceInputs.length,
	eligibleSourceCount: eligible.length,
	selectedSourceCount: selected.length,
	totalReviewCases: selected.length * experimentPolicy.tasks.length,
	totalBatches: Math.ceil(selected.length / sourcesPerBatch),
	selectedSources: selected.map((entry) => entry.source),
}
const frontier = {
	schemaVersion: 1,
	experimentId,
	generatedAt,
	entries: childResults.map((entry) => ({ ...entry, selected: selectedHashes.has(entry.source.sha256) })),
}
const baseArtifacts = {
	"authorization.json": jsonBytes(authorization),
	"manifest.json": jsonBytes(experimentManifest),
	"frontier.json": jsonBytes(frontier),
}
const provenance = {
	experiment: Object.fromEntries(Object.entries(baseArtifacts).map(([file, bytes]) => [file, sha256(bytes)])),
	implementation: await fileHashes(implementationFiles),
	presentation: await fileHashes(presentationFiles),
}
const manifests: ControlledFieldStateReviewManifest[] = []
const tasks = experimentPolicy.tasks as readonly ControlledFieldStateTask[]
const totalBatches = Math.ceil(selected.length / sourcesPerBatch)
for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
	const sourceBatch = selected.slice(batchIndex * sourcesPerBatch, (batchIndex + 1) * sourcesPerBatch)
	const cases = sourceBatch.flatMap((entry) => tasks.map((task) => ({ entry, task })))
		.sort((first, second) => compareAscii(
			sha256(`${experimentId}\0${first.entry.source.sha256}\0${first.task}\0order`),
			sha256(`${experimentId}\0${second.entry.source.sha256}\0${second.task}\0order`),
		))
	const entries: ControlledFieldStateReviewEntry[] = cases.map(({ entry, task }, localOrder) => {
		const treatment = taskOptions(entry, task)
		const firstIsA = Number.parseInt(sha256(`${experimentId}\0${entry.source.sha256}\0${task}\0assignment`).slice(0, 2), 16) % 2 === 0
		return {
			caseId: `cfsr-${sha256(`${experimentId}\0${entry.source.sha256}\0${task}`).slice(0, 20)}`,
			order: batchIndex * sourcesPerBatch * tasks.length + localOrder,
			task,
			source: {
				file: entry.source.relativePath,
				sha256: entry.source.sha256,
				bytes: entry.source.bytes,
				width: entry.source.width,
				height: entry.source.height,
			},
			options: firstIsA
				? { A: treatment.first, B: treatment.second }
				: { A: treatment.second, B: treatment.first },
			assignment: firstIsA
				? { A: treatment.firstTreatment, B: treatment.secondTreatment }
				: { A: treatment.secondTreatment, B: treatment.firstTreatment },
		}
	})
	const identity: Omit<ControlledFieldStateReviewManifest, "generatedAt" | "manifestId"> = {
		schemaVersion: 1,
		reviewVersion: CONTROLLED_FIELD_STATE_REVIEW_VERSION,
		presentationVersion: CONTROLLED_FIELD_STATE_PRESENTATION_VERSION,
		experimentId,
		batch: {
			index: batchIndex + 1,
			size: entries.length,
			totalBatches,
			totalCases: selected.length * tasks.length,
		},
		provenance,
		entries,
	}
	const manifest: ControlledFieldStateReviewManifest = {
		...identity,
		generatedAt,
		manifestId: controlledFieldStateManifestId(identity),
	}
	parseControlledFieldStateManifest(manifest)
	manifests.push(manifest)
}

await mkdir(reviewRoot, { recursive: true })
for (const [file, bytes] of Object.entries(baseArtifacts)) await writeExclusive(join(experimentRoot, file), bytes)
for (const manifest of manifests) {
	const batch = String(manifest.batch.index).padStart(2, "0")
	await writeExclusive(join(reviewRoot, `batch-${batch}-manifest.json`), jsonBytes(manifest))
	await writeExclusive(join(reviewRoot, `batch-${batch}-feedback.json`), jsonBytes({
		schemaVersion: 1,
		reviewVersion: CONTROLLED_FIELD_STATE_REVIEW_VERSION,
		manifestId: manifest.manifestId,
		entries: [],
	}))
}
await writeExclusive(join(reviewRoot, "plan.json"), jsonBytes({
	schemaVersion: 1,
	experimentId,
	generatedAt,
	status: "authorized-controlled-field-state-review",
	sourceGroupsPerTask: selected.length,
	taskCounts: Object.fromEntries(tasks.map((task) => [task, selected.length])),
	totalCases: selected.length * tasks.length,
	totalBatches,
	manifestIds: manifests.map((manifest) => manifest.manifestId),
	interpretation: {
		preferenceIsSourceSpecific: true,
		noVisibleDifferenceIsDecisiveStructuredEvidence: true,
		commentsDoNotEnterFitting: true,
		resultsDoNotAuthorizeCompleteTupleInferenceOrPromotion: true,
	},
}))
process.stderr.write(`Prepared ${selected.length * tasks.length} controlled cases in ${totalBatches} batches at ${relative(projectRoot, reviewRoot)}\n`)
