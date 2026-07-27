import { createHash, randomUUID } from "node:crypto"
import { access, link, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { namePalette } from "./src/color-name.ts"
import {
	NEXT_PALETTE_REVIEW_PRESENTATION_VERSION,
	NEXT_PALETTE_REVIEW_VERSION,
	nextPaletteReviewManifestId,
	nextPaletteReviewRoles,
	parseNextPaletteReviewFeedbackStore,
	parseNextPaletteReviewManifest,
	type NextPalettePresentedPalette,
	type NextPaletteReviewEntry,
	type NextPaletteReviewManifest,
	type NextPaletteReviewQuality,
} from "./src/next-palette-review.ts"
import type { CorpusResult, Palette, RoleName } from "./src/types.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const experimentRoot = join(researchRoot, "data/experiments/next-palette-0.2.0-field-pair-development")
const previousRoot = join(researchRoot, "data/experiments/next-palette-0.1.0-development")
const outputRoot = join(experimentRoot, "review-v1")
const experimentFiles = [
	{ key: "manifest.json", path: join(experimentRoot, "manifest.json") },
	{ key: "protocol.json", path: join(experimentRoot, "protocol.json") },
	{ key: "analysis.json", path: join(experimentRoot, "analysis.json") },
	{ key: "results.json", path: join(experimentRoot, "results.json") },
	{ key: "certificates.json", path: join(experimentRoot, "certificates.json") },
	{ key: "review-authorization.json", path: join(experimentRoot, "review-authorization.json") },
	{ key: "../next-palette-0.1.0-development/manifest.json", path: join(previousRoot, "manifest.json") },
	{ key: "../next-palette-0.1.0-development/candidate-results.json", path: join(previousRoot, "candidate-results.json") },
	{ key: "../next-palette-0.1.0-development/candidate-00-results.json", path: join(previousRoot, "candidate-00-results.json") },
	{ key: "../next-palette-0.1.0-development/baseline-results.json", path: join(previousRoot, "baseline-results.json") },
	{ key: "../next-palette-0.1.0-development/baseline-00-results.json", path: join(previousRoot, "baseline-00-results.json") },
	{ key: "../next-palette-0.1.0-development/review-v2/plan.json", path: join(previousRoot, "review-v2/plan.json") },
	{ key: "../next-palette-0.1.0-development/review-v2/batch-01-manifest.json", path: join(previousRoot, "review-v2/batch-01-manifest.json") },
	{ key: "../next-palette-0.1.0-development/review-v2/batch-01-feedback.json", path: join(previousRoot, "review-v2/batch-01-feedback.json") },
	{ key: "../next-palette-0.1.0-development/review-v2/batch-02-manifest.json", path: join(previousRoot, "review-v2/batch-02-manifest.json") },
	{ key: "../next-palette-0.1.0-development/review-v2/batch-02-feedback.json", path: join(previousRoot, "review-v2/batch-02-feedback.json") },
] as const
const implementationFiles = [
	"research/src/next-palette-review.ts",
	"research/src/color-name.ts",
	"research/prepare-next-palette-field-pair-review.ts",
	"research/serve-next-palette-review.ts",
	"research/analyze-next-palette-review.ts",
] as const
const presentationFiles = [
	"research/next-palette-review/index.html",
	"research/next-palette-review/app.js",
	"research/next-palette-review/styles.css",
] as const
const batchSize = 27

type ResultEntry = {
	cohort: "development" | "00"
	file: string
	source: { path: string; sha256: string; bytes: number }
	palette: Palette
}
type ResultArtifact = {
	experimentId: string
	algorithmVersion: string
	entries: ResultEntry[]
}
type ExperimentManifest = {
	experimentId: string
	candidateIdentity: { algorithmVersion: string }
	sources: Array<{ cohort: "development" | "00"; path: string; sha256: string; bytes: number }>
}
type ReviewAuthorization = {
	experimentId: string
	candidateAlgorithmVersion: string
	boundArtifacts: Record<string, string>
	effectiveStructuralAssessment: { pass: boolean; violationCount: number }
	review: {
		authorized: boolean
		comparisonAlgorithmVersion: string
		freshVisualCases: number
		representedSourceOccurrences: number
		exactPreviousCandidateTransfers: number
		exactCanonicalBaselineTransfers: number
		ineligibleSources: number
	}
	prohibitions: {
		canonicalPromotionAuthorized: boolean
		candidateFreezeAuthorized: boolean
		reserveAccessAuthorized: boolean
		outputUnseenRootsOpened: string[]
		sourceRoots: string[]
	}
}
type PreviousPlan = {
	experimentId: string
	duplicateCarryEdges: Array<{
		representativeFile: string
		duplicateFile: string
		sourceSha256: string
		exactSourceBytes: true
		exactBaselinePresentation: true
		exactCandidatePresentation: true
	}>
}
type ReviewedCase = {
	caseId: string
	file: string
	cohort: NextPaletteReviewEntry["cohort"]
	source: NextPaletteReviewEntry["source"]
	sourceEligibility: string
	baselineQuality: NextPaletteReviewQuality | null
	previousCandidateQuality: NextPaletteReviewQuality | null
}
type FrontierEntry = {
	file: string
	cohort: NextPaletteReviewEntry["cohort"]
	currentEvidenceClassification: NextPaletteReviewEntry["currentEvidenceClassification"]
	changedRoles: RoleName[]
	gradientChanged: boolean
	baseline: Palette
	candidate: Palette
	source: { path: string; sha256: string; bytes: number }
	dimensions: { width: number; height: number }
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

async function fileHashes(files: readonly string[]): Promise<Record<string, string>> {
	return Object.fromEntries(await Promise.all(files.map(async (file) =>
		[file, sha256(await readFile(resolve(projectRoot, file)))] as const)))
}

function semanticKey(palette: Palette): string {
	return JSON.stringify({
		roles: nextPaletteReviewRoles.map((role) => [role, palette[role].rgb, palette[role].generated]),
		gradient: palette.gradient.isGradient,
	})
}

function presentedSemanticKey(palette: NextPalettePresentedPalette): string {
	return JSON.stringify({
		roles: nextPaletteReviewRoles.map((role) => [role, palette.roles[role].rgb, palette.roles[role].generated]),
		gradient: palette.gradient.isGradient,
	})
}

function presentPalette(palette: Palette): NextPalettePresentedPalette {
	const names = namePalette(nextPaletteReviewRoles.map((role) => palette[role].rgb))
	return {
		roles: Object.fromEntries(nextPaletteReviewRoles.map((role, index) => [role, {
			rgb: palette[role].rgb,
			hex: palette[role].hex.toLowerCase(),
			nearestName: names[index].nearestName,
			generated: palette[role].generated,
			sourceDistance: palette[role].sourceDistance,
		}])) as NextPalettePresentedPalette["roles"],
		gradient: { isGradient: palette.gradient.isGradient, confidence: palette.gradient.confidence },
		metrics: palette.metrics,
	}
}

function exactChangedRoles(baseline: Palette, candidate: Palette): RoleName[] {
	return nextPaletteReviewRoles.filter((role) => baseline[role].generated !== candidate[role].generated ||
		baseline[role].rgb.some((channel, index) => channel !== candidate[role].rgb[index]))
}

function evidenceClassification(quality: NextPaletteReviewQuality): NextPaletteReviewEntry["currentEvidenceClassification"] {
	if (quality === "strong" || quality === "acceptable-not-ideal") return "accepted"
	if (quality === "weak-fallback" || quality === "unacceptable") return "rejected"
	return "unknown"
}

function frontierSignature(entry: FrontierEntry): string {
	return [
		entry.cohort,
		entry.currentEvidenceClassification,
		entry.changedRoles.join("+") || "gradient-only",
		`${entry.baseline.gradient.isGradient ? "gradient" : "flat"}->${entry.candidate.gradient.isGradient ? "gradient" : "flat"}`,
		entry.candidate.background.hex === entry.candidate.surface.hex ? "surface-collapse" : "surface-distinct",
		entry.candidate.foreground.generated ? "generated-foreground" : "source-foreground",
		entry.candidate.accent.hex === entry.candidate.foreground.hex ? "accent-collapse" : "accent-distinct",
	].join("|")
}

function stratifiedOrder(entries: FrontierEntry[]): FrontierEntry[] {
	const buckets = new Map<string, FrontierEntry[]>()
	for (const entry of entries) {
		const signature = frontierSignature(entry)
		let bucket = buckets.get(signature)
		if (!bucket) buckets.set(signature, bucket = [])
		bucket.push(entry)
	}
	for (const bucket of buckets.values()) bucket.sort((first, second) =>
		sha256(`${NEXT_PALETTE_REVIEW_VERSION}\0${first.source.sha256}`).localeCompare(
			sha256(`${NEXT_PALETTE_REVIEW_VERSION}\0${second.source.sha256}`),
		))
	const signatures = [...buckets.keys()].sort((first, second) =>
		sha256(`signature\0${first}`).localeCompare(sha256(`signature\0${second}`)))
	const ordered: FrontierEntry[] = []
	while (ordered.length < entries.length) {
		for (const signature of signatures) {
			const entry = buckets.get(signature)!.shift()
			if (entry) ordered.push(entry)
		}
	}
	return ordered
}

function presentationKey(entry: FrontierEntry): string {
	return JSON.stringify([entry.source.sha256, semanticKey(entry.baseline), semanticKey(entry.candidate)])
}

async function writeExclusive(path: string, value: unknown): Promise<void> {
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

try {
	await access(outputRoot)
	throw new Error(`Refusing to overwrite existing review plan: ${outputRoot}`)
} catch (error) {
	if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
}

const experimentSources = Object.fromEntries(await Promise.all(experimentFiles.map(async ({ key, path }) => {
	const raw = await readFile(path)
	return [key, { raw, sha256: sha256(raw) }] as const
})))
const parseExperiment = <T>(key: keyof typeof experimentSources): T =>
	JSON.parse(experimentSources[key].raw.toString("utf8")) as T
const experimentManifest = parseExperiment<ExperimentManifest>("manifest.json")
const authorization = parseExperiment<ReviewAuthorization>("review-authorization.json")
const successor = parseExperiment<ResultArtifact>("results.json")
const previousManifest = parseExperiment<ExperimentManifest>("../next-palette-0.1.0-development/manifest.json")
const previousDevelopment = parseExperiment<CorpusResult>("../next-palette-0.1.0-development/candidate-results.json")
const previous00 = parseExperiment<CorpusResult>("../next-palette-0.1.0-development/candidate-00-results.json")
const canonicalDevelopment = parseExperiment<CorpusResult>("../next-palette-0.1.0-development/baseline-results.json")
const canonical00 = parseExperiment<CorpusResult>("../next-palette-0.1.0-development/baseline-00-results.json")
const previousPlan = parseExperiment<PreviousPlan>("../next-palette-0.1.0-development/review-v2/plan.json")
if (authorization.experimentId !== experimentManifest.experimentId ||
	authorization.candidateAlgorithmVersion !== experimentManifest.candidateIdentity.algorithmVersion ||
	!authorization.effectiveStructuralAssessment.pass || authorization.effectiveStructuralAssessment.violationCount !== 0 ||
	!authorization.review.authorized || authorization.review.comparisonAlgorithmVersion !== previousManifest.candidateIdentity.algorithmVersion ||
	authorization.prohibitions.canonicalPromotionAuthorized || authorization.prohibitions.candidateFreezeAuthorized ||
	authorization.prohibitions.reserveAccessAuthorized || authorization.prohibitions.outputUnseenRootsOpened.length !== 0 ||
	authorization.prohibitions.sourceRoots.join(",") !== "images,00") {
	throw new Error("Field-pair review authorization is invalid")
}
for (const [file, expected] of Object.entries(authorization.boundArtifacts)) {
	if (file === "review-authorization.json" || experimentSources[file]?.sha256 !== expected) {
		throw new Error(`Field-pair review authorization binding is invalid: ${file}`)
	}
}
if (successor.experimentId !== experimentManifest.experimentId ||
	successor.algorithmVersion !== experimentManifest.candidateIdentity.algorithmVersion || successor.entries.length !== 392 ||
	previousPlan.experimentId !== previousManifest.experimentId || previousPlan.duplicateCarryEdges.length !== 1) {
	throw new Error("Field-pair review experiment inputs disagree")
}

const previousByFile = new Map([
	...previousDevelopment.entries.map((entry) => [`images/${entry.file}`, entry.extraction.methods.spatial] as const),
	...previous00.entries.map((entry) => [entry.file, entry.extraction.methods.spatial] as const),
])
const canonicalByFile = new Map([
	...canonicalDevelopment.entries.map((entry) => [`images/${entry.file}`, entry.extraction.methods.spatial] as const),
	...canonical00.entries.map((entry) => [entry.file, entry.extraction.methods.spatial] as const),
])
const dimensionsByFile = new Map([
	...canonicalDevelopment.entries.map((entry) => [`images/${entry.file}`, { width: entry.width, height: entry.height }] as const),
	...canonical00.entries.map((entry) => [entry.file, { width: entry.width, height: entry.height }] as const),
])
const successorByFile = new Map(successor.entries.map((entry) => [entry.file, entry.palette]))
const sourceByFile = new Map(experimentManifest.sources.map((source) => [source.path, source]))

const reviewedCases: ReviewedCase[] = []
for (const batch of [1, 2] as const) {
	const manifestKey = `../next-palette-0.1.0-development/review-v2/batch-0${batch}-manifest.json` as const
	const feedbackKey = `../next-palette-0.1.0-development/review-v2/batch-0${batch}-feedback.json` as const
	const manifest = parseNextPaletteReviewManifest(JSON.parse(experimentSources[manifestKey].raw.toString("utf8")) as unknown)
	const feedback = parseNextPaletteReviewFeedbackStore(
		JSON.parse(experimentSources[feedbackKey].raw.toString("utf8")) as unknown,
		manifest,
	)
	if (feedback.entries.length !== manifest.entries.length) throw new Error(`Previous review batch ${batch} is incomplete`)
	const feedbackByCase = new Map(feedback.entries.map((entry) => [entry.caseId, entry]))
	for (const entry of manifest.entries) {
		const stored = feedbackByCase.get(entry.caseId)
		if (!stored) throw new Error(`Previous review feedback is missing ${entry.caseId}`)
		const baselineOption = entry.assignment.A === "baseline" ? entry.options.A : entry.options.B
		const candidateOption = entry.assignment.A === "candidate" ? entry.options.A : entry.options.B
		const baselineQuality = entry.assignment.A === "baseline" ? stored.qualityA : stored.qualityB
		const candidateQuality = entry.assignment.A === "candidate" ? stored.qualityA : stored.qualityB
		const canonical = canonicalByFile.get(entry.source.file)
		const previous = previousByFile.get(entry.source.file)
		if (!canonical || !previous || presentedSemanticKey(baselineOption) !== semanticKey(canonical) ||
			presentedSemanticKey(candidateOption) !== semanticKey(previous)) {
			throw new Error(`Previous review presentation is not bound to extraction output: ${entry.source.file}`)
		}
		reviewedCases.push({
			caseId: entry.caseId,
			file: entry.source.file,
			cohort: entry.cohort,
			source: entry.source,
			sourceEligibility: stored.sourceEligibility,
			baselineQuality,
			previousCandidateQuality: candidateQuality,
		})
	}
}
if (reviewedCases.length !== 80 || new Set(reviewedCases.map((entry) => entry.caseId)).size !== 80) {
	throw new Error("Expected 80 unique previous review cases")
}

const transfers: Array<{
	caseId: string
	file: string
	classification: "previous-candidate" | "canonical-baseline" | "ineligible"
	quality: NextPaletteReviewQuality | null
}> = []
const frontierOccurrences: FrontierEntry[] = []
for (const reviewed of reviewedCases) {
	const previous = previousByFile.get(reviewed.file)
	const canonical = canonicalByFile.get(reviewed.file)
	const candidate = successorByFile.get(reviewed.file)
	const source = sourceByFile.get(reviewed.file)
	const dimensions = dimensionsByFile.get(reviewed.file)
	if (!previous || !canonical || !candidate || !source || !dimensions || source.sha256 !== reviewed.source.sha256) {
		throw new Error(`Reviewed source is absent from the successor matrix: ${reviewed.file}`)
	}
	if (reviewed.sourceEligibility !== "eligible-artwork") {
		transfers.push({ caseId: reviewed.caseId, file: reviewed.file, classification: "ineligible", quality: null })
		continue
	}
	if (!reviewed.previousCandidateQuality || !reviewed.baselineQuality) {
		throw new Error(`Eligible previous review lacks quality: ${reviewed.file}`)
	}
	if (semanticKey(candidate) === semanticKey(previous)) {
		transfers.push({
			caseId: reviewed.caseId,
			file: reviewed.file,
			classification: "previous-candidate",
			quality: reviewed.previousCandidateQuality,
		})
		continue
	}
	if (semanticKey(candidate) === semanticKey(canonical)) {
		transfers.push({
			caseId: reviewed.caseId,
			file: reviewed.file,
			classification: "canonical-baseline",
			quality: reviewed.baselineQuality,
		})
		continue
	}
	const changedRoles = exactChangedRoles(previous, candidate)
	const gradientChanged = previous.gradient.isGradient !== candidate.gradient.isGradient
	if (changedRoles.length === 0 && !gradientChanged) throw new Error(`Novel review case has no exact visible change: ${reviewed.file}`)
	frontierOccurrences.push({
		file: reviewed.file,
		cohort: reviewed.cohort,
		currentEvidenceClassification: evidenceClassification(reviewed.previousCandidateQuality),
		changedRoles,
		gradientChanged,
		baseline: previous,
		candidate,
		source: { path: source.path, sha256: source.sha256, bytes: source.bytes },
		dimensions,
	})
}
if (transfers.filter((entry) => entry.classification === "previous-candidate").length !== 24 ||
	transfers.filter((entry) => entry.classification === "canonical-baseline").length !== 2 ||
	transfers.filter((entry) => entry.classification === "ineligible").length !== 1 || frontierOccurrences.length !== 53) {
	throw new Error("Exact previous-review transfer counts changed")
}

const priorCarry = previousPlan.duplicateCarryEdges[0]
const representative = frontierOccurrences.find((entry) => entry.file === priorCarry.representativeFile)
const duplicatePrevious = previousByFile.get(priorCarry.duplicateFile)
const duplicateCandidate = successorByFile.get(priorCarry.duplicateFile)
const duplicateSource = sourceByFile.get(priorCarry.duplicateFile)
const duplicateDimensions = dimensionsByFile.get(priorCarry.duplicateFile)
if (!representative || !duplicatePrevious || !duplicateCandidate || !duplicateSource || !duplicateDimensions ||
	duplicateSource.sha256 !== priorCarry.sourceSha256 || representative.source.sha256 !== priorCarry.sourceSha256 ||
	semanticKey(representative.baseline) !== semanticKey(duplicatePrevious) ||
	semanticKey(representative.candidate) !== semanticKey(duplicateCandidate)) {
	throw new Error("Exact duplicate carry no longer applies to the field-pair review")
}
frontierOccurrences.push({
	...representative,
	file: priorCarry.duplicateFile,
	source: { path: duplicateSource.path, sha256: duplicateSource.sha256, bytes: duplicateSource.bytes },
	dimensions: duplicateDimensions,
})

for (const entry of frontierOccurrences) {
	if (!/^(?:images|00)\/[^/\\]+$/.test(entry.source.path)) throw new Error(`Unauthorized review source: ${entry.source.path}`)
	const bytes = await readFile(resolve(projectRoot, entry.source.path))
	if (bytes.byteLength !== entry.source.bytes || sha256(bytes) !== entry.source.sha256) {
		throw new Error(`Review source changed: ${entry.source.path}`)
	}
}
const presentationGroups = new Map<string, FrontierEntry[]>()
for (const entry of frontierOccurrences) {
	const key = presentationKey(entry)
	let group = presentationGroups.get(key)
	if (!group) presentationGroups.set(key, group = [])
	group.push(entry)
}
const duplicateCarryEdges: Array<{
	representativeFile: string
	duplicateFile: string
	sourceSha256: string
	exactSourceBytes: true
	exactBaselinePresentation: true
	exactCandidatePresentation: true
}> = []
const reviewEntries = [...presentationGroups.values()].map((group) => {
	group.sort((first, second) => first.source.path.localeCompare(second.source.path))
	const selected = group[0]
	for (const duplicate of group.slice(1)) duplicateCarryEdges.push({
		representativeFile: selected.source.path,
		duplicateFile: duplicate.source.path,
		sourceSha256: selected.source.sha256,
		exactSourceBytes: true,
		exactBaselinePresentation: true,
		exactCandidatePresentation: true,
	})
	return selected
})
if (Number(frontierOccurrences.length) !== 54 || reviewEntries.length !== 53 || duplicateCarryEdges.length !== 1) {
	throw new Error("Field-pair review duplicate accounting changed")
}

const ordered = stratifiedOrder(reviewEntries)
const totalBatches = Math.ceil(ordered.length / batchSize)
const generatedAt = new Date().toISOString()
const provenance = {
	experiment: Object.fromEntries(Object.entries(experimentSources).map(([file, source]) => [file, source.sha256])),
	implementation: await fileHashes(implementationFiles),
	presentation: await fileHashes(presentationFiles),
}
const manifests: NextPaletteReviewManifest[] = []
for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
	const batchEntries = ordered.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize)
	const entries: NextPaletteReviewEntry[] = batchEntries.map((entry, entryIndex) => {
		const order = batchIndex * batchSize + entryIndex
		const baselineFirst = Number.parseInt(sha256(
			`${NEXT_PALETTE_REVIEW_PRESENTATION_VERSION}\0${entry.source.sha256}`,
		).slice(0, 2), 16) % 2 === 0
		return {
			caseId: `npr-${sha256(`${experimentManifest.experimentId}\0${entry.source.path}\0${entry.source.sha256}`).slice(0, 20)}`,
			order,
			cohort: entry.cohort,
			currentEvidenceClassification: entry.currentEvidenceClassification,
			frontierSignature: frontierSignature(entry),
			source: {
				file: entry.source.path,
				sha256: entry.source.sha256,
				bytes: entry.source.bytes,
				width: entry.dimensions.width,
				height: entry.dimensions.height,
			},
			changedRoles: entry.changedRoles,
			gradientChanged: entry.gradientChanged,
			options: baselineFirst
				? { A: presentPalette(entry.baseline), B: presentPalette(entry.candidate) }
				: { A: presentPalette(entry.candidate), B: presentPalette(entry.baseline) },
			assignment: baselineFirst ? { A: "baseline", B: "candidate" } : { A: "candidate", B: "baseline" },
		}
	})
	const identity: Omit<NextPaletteReviewManifest, "generatedAt" | "manifestId"> = {
		schemaVersion: 1,
		reviewVersion: NEXT_PALETTE_REVIEW_VERSION,
		presentationVersion: NEXT_PALETTE_REVIEW_PRESENTATION_VERSION,
		experimentId: experimentManifest.experimentId,
		baselineAlgorithmVersion: previousManifest.candidateIdentity.algorithmVersion,
		candidateAlgorithmVersion: experimentManifest.candidateIdentity.algorithmVersion,
		batch: { index: batchIndex + 1, size: entries.length, totalBatches, totalCases: ordered.length },
		provenance,
		entries,
	}
	const manifest: NextPaletteReviewManifest = {
		...identity,
		generatedAt,
		manifestId: nextPaletteReviewManifestId(identity),
	}
	parseNextPaletteReviewManifest(manifest)
	manifests.push(manifest)
}

await mkdir(outputRoot)
for (const manifest of manifests) {
	await writeExclusive(join(outputRoot, `batch-${String(manifest.batch.index).padStart(2, "0")}-manifest.json`), manifest)
}
await writeExclusive(join(outputRoot, "plan.json"), {
	schemaVersion: 1,
	reviewVersion: NEXT_PALETTE_REVIEW_VERSION,
	experimentId: experimentManifest.experimentId,
	generatedAt,
	comparisonAlgorithmVersion: previousManifest.candidateIdentity.algorithmVersion,
	candidateAlgorithmVersion: experimentManifest.candidateIdentity.algorithmVersion,
	priorSubmittedCases: reviewedCases.length,
	priorEligibleCases: reviewedCases.filter((entry) => entry.sourceEligibility === "eligible-artwork").length,
	exactPreviousCandidateTransfers: transfers.filter((entry) => entry.classification === "previous-candidate").length,
	exactCanonicalBaselineTransfers: transfers.filter((entry) => entry.classification === "canonical-baseline").length,
	ineligibleCases: transfers.filter((entry) => entry.classification === "ineligible").length,
	freshSourceOccurrences: frontierOccurrences.length,
	reviewCases: ordered.length,
	totalBatches,
	batchSize,
	stratification: "round-robin across cohort, prior candidate quality, exact role delta, gradient transition, and collapse/fallback state",
	transferPolicy: "exact complete visible semantic palette only; perceptual matching and pair-relative comments do not transfer",
	duplicateCarryPolicy: "exact source bytes and exact comparison/candidate visible presentations",
	duplicateCarryEdges,
	transfers,
	manifestIds: manifests.map((manifest) => manifest.manifestId),
})
process.stderr.write(`Prepared ${ordered.length} field-pair cases in ${totalBatches} blinded batches at ${relative(projectRoot, outputRoot)}\n`)
