import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath } from "node:url"
import { parseAlbumArtworkPaletteV2FutureSample } from "./src/album-artwork-palette-v2-future-sample.ts"
import { parseAlbumArtworkPaletteV2FutureSample03 } from "./src/album-artwork-palette-v2-future-sample-03.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS,
	ALBUM_ARTWORK_PALETTE_V2_PARETO_BLOCKS,
	ALBUM_ARTWORK_PALETTE_V2_POLICY,
	ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS,
	ALBUM_ARTWORK_PALETTE_V2_VERSION,
} from "./src/album-artwork-palette-v2-protocol.ts"
import type {
	AlbumArtworkPaletteV2Result,
	IdentityQualityGuardEvaluation,
} from "./src/album-artwork-palette-v2.ts"

type SourceRecord = Readonly<{
	caseId: string
	path: string
	sha256: string
	byteCount: number
	artworkId: string
	cohort: "stress" | "dataset"
	structureTags: readonly string[]
}>

type DevelopmentManifest = Readonly<{
	manifestId: string
	sourceCount: number
	sources: readonly SourceRecord[]
}>

type OpenedFreshManifest = Readonly<{
	sources: ReadonlyArray<Readonly<{ sha256: string }>>
}>

type SourceArtifact = Readonly<{
	schemaVersion: 3
	implementationHash: string
	developmentManifestId: string
	openedFreshSealManifestId: string
	protectedFutureSampleManifestIds: readonly string[]
	source: SourceRecord
	dimensions: Readonly<{ width: number; height: number }>
	extraction: AlbumArtworkPaletteV2Result
	presentations: ReadonlyArray<Readonly<{ treatmentId: string }>>
	scientificSha256: string
	deterministicRepeatedExtraction: true
	runtime: Readonly<{ wallMs: number; cpuUserMicros: number; cpuSystemMicros: number }>
}>

type FrozenPredecessorArtifact = Readonly<{
	source: SourceRecord
	dimensions: Readonly<{ width: number; height: number }>
	extraction: Readonly<{
		winner: Readonly<{ id: string }>
		diagnostics: Readonly<{
			nativeDiscovery: unknown
			preDiscoveryResize: unknown
			familyCount: number
			retainedFamilyCount: number
			lanes: unknown
			laneRetention: unknown
			families: unknown
			fieldDomains: ReadonlyArray<Readonly<{ eligible: boolean }>>
			fieldHypotheses: ReadonlyArray<Readonly<{ kind: string }>>
			gradientFits: unknown
			completeCandidateCount: number
			candidateAvailability: Readonly<{
				foregroundLaneFamilyIds: readonly string[]
				signatureLaneFamilyIds: readonly string[]
				fieldHypothesisFamilyIds: readonly string[]
				foregroundsPerFieldVariantQuota: number
				emergencyCandidateReserve: number
				foregroundPeakUnobservableRejectedOptionCount: number
				distinctAccentPeakUnobservableRejectedOptionCount: number
				completeCandidateForegroundFamilyIds: readonly string[]
				completeCandidateAccentFamilyIds: readonly string[]
			}>
			identityObligationGraph: Readonly<{
				selection: unknown
				obligations: unknown
				nodes: ReadonlyArray<Readonly<{ stage: string }>>
			}>
			paretoRanking: Readonly<{
				evidenceResolution: number
				dominanceUsesEvidenceLevels: boolean
				rankingPriorityBlocks: readonly string[]
				rawCandidateCount: number
				uniqueCandidateCount: number
				dominatedCandidateCount: number
				frontierCandidateCount: number
				frontierDirectionCount: number
				identityRetentionFrontierCandidateCount: number
				identityCarriedCandidateCount: number
				globalParetoTopTreatmentId: string
				qualityIncumbentTreatmentId: string
				identityChallengerCount: number
				selectedIdentityChallengerTreatmentId: string | null
				primaryTreatmentId: string
				legacyScalarTopTreatmentId: string
			}>
			legacyScalarTopTreatment: unknown
			emergency: unknown
			bounds: unknown
		}>
	}>
}>

type FrozenPredecessorAggregate = Readonly<{
	candidateVersion: string
	implementationHash: string
	developmentManifestId: string
	scientificSha256: string
	cases: readonly FrozenPredecessorArtifact[]
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const developmentPath = resolve(moduleDirectory, "data/album-artwork-palette-v2-development-panel.json")
const openedFreshPath = resolve(moduleDirectory, "data/album-artwork-palette-v2-fresh-sample.sealed.json")
const futureSamplePath = resolve(moduleDirectory, "data/album-artwork-palette-v2-future-sample-02.sealed.json")
const futureSample03Path = resolve(moduleDirectory, "data/album-artwork-palette-v2-future-sample-03.sealed.json")
const previousExperimentPath = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.7.1-development/aggregate.json")
const previousSummaryPath = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.7.1-development/summary.json")
const experimentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.7.2-development")
const sourceOutputDirectory = resolve(experimentDirectory, "sources")
const childPath = resolve(moduleDirectory, "album-artwork-palette-v2-development-child.ts")
const OPENED_FRESH_MANIFEST_ID = "3e85bab09130d0fb6c883ba1e4543fce841e1a94a6b63a6539aececb8f58cb91"
const PROTECTED_FUTURE_MANIFEST_IDS = [
	"9ac421c0d4931b8fdd24ce8e628609dbac36652addc7c9dfdb65a814aaf20671",
	"bee665792a4ddfaeb3541aa5e58181c8f3a0685836b13475643d9deccace4060",
]
const FROZEN_0_7_1_IMPLEMENTATION_SHA256 = "a24561fd38227afdc6e68928a8cffc51e2e22213591bef6680290637a635103e"
const FROZEN_0_7_1_SCIENTIFIC_SHA256 = "0c3780a114cab31a0ae8384548d93c8ee49a541f70c3da214ca4527e3909d642"
const FROZEN_0_7_1_SUMMARY_SHA256 = "623fd7334e0ba6649e07c0c31ad7a61696b4d7efbb06b49fecf6e2a983d716f7"
const FROZEN_0_7_1_AGGREGATE_SHA256 = "15d31bba183f9c645327ed6f204d9be08fd80cd16092626097fe39f5af16d702"

function sha256(value: Uint8Array | string): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
	const object = value as Record<string, unknown>
	return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`
}

function qualityGuardEvaluationIsExact(
	evaluation: IdentityQualityGuardEvaluation,
	incumbentTreatmentId: string,
): boolean {
	if (evaluation.incumbentTreatmentId !== incumbentTreatmentId ||
		canonicalJson(evaluation.blocks.map(({ block }) => block)) !==
			canonicalJson(ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS)) return false
	const failedRows = evaluation.blocks.filter(({ pass }) => !pass)
	if (evaluation.blocks.some(({ incumbentEvidenceLevel, challengerEvidenceLevel, pass }) =>
		!Number.isSafeInteger(incumbentEvidenceLevel) || !Number.isSafeInteger(challengerEvidenceLevel) ||
		pass !== (challengerEvidenceLevel >= incumbentEvidenceLevel))) return false
	const expectedLosses = failedRows.map(({ block, incumbentEvidenceLevel, challengerEvidenceLevel }) => ({
		block,
		incumbentEvidenceLevel,
		challengerEvidenceLevel,
		evidenceLevelLoss: incumbentEvidenceLevel - challengerEvidenceLevel,
	}))
	return evaluation.pass === (failedRows.length === 0) &&
		canonicalJson(evaluation.resolvedLosses) === canonicalJson(expectedLosses)
}

async function atomicJson(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
	await rename(temporary, path)
}

function workerCountFromArguments(): number {
	const argument = process.argv.slice(2).find((value) => value.startsWith("--workers="))
	const requested = argument === undefined
		? ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.developmentWorkers
		: Number(argument.slice("--workers=".length))
	if (!Number.isSafeInteger(requested) || requested < 1 || requested > ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.developmentWorkers) {
		throw new RangeError(`Development workers must be from 1 through ${ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.developmentWorkers}`)
	}
	return requested
}

async function implementationHash(): Promise<string> {
	const paths = [
		fileURLToPath(import.meta.url),
		resolve(moduleDirectory, "src/album-artwork-palette-v2.ts"),
		resolve(moduleDirectory, "src/album-artwork-palette-v2-protocol.ts"),
		resolve(moduleDirectory, "src/album-artwork-palette-v2-future-sample.ts"),
		resolve(moduleDirectory, "src/album-artwork-palette-v2-future-sample-03.ts"),
		resolve(moduleDirectory, "src/source-provenance-inventory.ts"),
		resolve(moduleDirectory, "src/color.ts"),
		resolve(moduleDirectory, "src/color-name.ts"),
		resolve(moduleDirectory, "src/native-resolution-image.ts"),
		resolve(moduleDirectory, "src/types.ts"),
		resolve(moduleDirectory, "ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_7_2.md"),
		resolve(moduleDirectory, "tests/album-artwork-palette-v2.test.ts"),
		resolve(moduleDirectory, "tests/album-artwork-palette-v2-future-sample.test.ts"),
		resolve(moduleDirectory, "tests/album-artwork-palette-v2-future-sample-03.test.ts"),
		openedFreshPath,
		futureSamplePath,
		futureSample03Path,
		childPath,
		resolve(moduleDirectory, "../package.json"),
		resolve(moduleDirectory, "../pnpm-lock.yaml"),
	]
	const hash = createHash("sha256")
	hash.update(`${process.version}\0${process.platform}\0${process.arch}\0`)
	for (const path of paths) {
		hash.update(path.slice(moduleDirectory.length))
		hash.update("\0")
		hash.update(await readFile(path))
		hash.update("\0")
	}
	return hash.digest("hex")
}

async function reusableArtifact(path: string, source: SourceRecord, manifestId: string, implementation: string): Promise<boolean> {
	try {
		const artifact = JSON.parse(await readFile(path, "utf8")) as SourceArtifact
		return artifact.schemaVersion === 3 &&
			artifact.implementationHash === implementation &&
			artifact.developmentManifestId === manifestId &&
			artifact.openedFreshSealManifestId === OPENED_FRESH_MANIFEST_ID &&
			canonicalJson(artifact.protectedFutureSampleManifestIds) === canonicalJson(PROTECTED_FUTURE_MANIFEST_IDS) &&
			artifact.source.caseId === source.caseId &&
			artifact.source.sha256 === source.sha256 &&
			artifact.scientificSha256 === sha256(JSON.stringify({
				extraction: artifact.extraction,
				presentations: artifact.presentations,
			}))
	} catch {
		return false
	}
}

function runChild(source: SourceRecord, outputPath: string, implementation: string): Promise<void> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(process.execPath, [
			"--experimental-strip-types",
			childPath,
			developmentPath,
			openedFreshPath,
			futureSamplePath,
			futureSample03Path,
			outputPath,
			source.caseId,
			implementation,
		], { cwd: resolve(moduleDirectory, ".."), stdio: ["ignore", "pipe", "pipe"] })
		let stdout = ""
		let stderr = ""
		child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk })
		child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk })
		child.on("error", reject)
		child.on("exit", (code) => {
			if (stdout) process.stdout.write(stdout)
			if (code === 0) resolvePromise()
			else reject(new Error(`${source.caseId} failed with exit ${code}: ${stderr.trim()}`))
		})
	})
}

async function main(): Promise<void> {
	const workers = workerCountFromArguments()
	const [development, openedFresh, futureSampleValue, futureSample03Value, previousRaw, previousSummaryRaw] = await Promise.all([
		readFile(developmentPath, "utf8").then((value) => JSON.parse(value) as DevelopmentManifest),
		readFile(openedFreshPath, "utf8").then((value) => JSON.parse(value) as OpenedFreshManifest),
		readFile(futureSamplePath, "utf8").then((value) => JSON.parse(value) as unknown),
		readFile(futureSample03Path, "utf8").then((value) => JSON.parse(value) as unknown),
		readFile(previousExperimentPath, "utf8"),
		readFile(previousSummaryPath, "utf8"),
	])
	const previousAggregate = JSON.parse(previousRaw) as FrozenPredecessorAggregate
	if (development.sourceCount !== development.sources.length || development.sources.length < 20 || development.sources.length > 30) {
		throw new Error("Development panel must contain 20 through 30 bound sources")
	}
	if (sha256(previousRaw) !== FROZEN_0_7_1_AGGREGATE_SHA256 ||
		sha256(previousSummaryRaw) !== FROZEN_0_7_1_SUMMARY_SHA256 ||
		previousAggregate.candidateVersion !== "album-artwork-first-principles-0.7.1" ||
		previousAggregate.implementationHash !== FROZEN_0_7_1_IMPLEMENTATION_SHA256 ||
		previousAggregate.scientificSha256 !== FROZEN_0_7_1_SCIENTIFIC_SHA256 ||
		previousAggregate.developmentManifestId !== development.manifestId) {
		throw new Error("Frozen 0.7.1 predecessor binding is invalid")
	}
	const futureSample = parseAlbumArtworkPaletteV2FutureSample(futureSampleValue)
	const futureSample03 = parseAlbumArtworkPaletteV2FutureSample03(futureSample03Value)
	if (futureSample.manifestId !== PROTECTED_FUTURE_MANIFEST_IDS[0] ||
		futureSample03.manifestId !== PROTECTED_FUTURE_MANIFEST_IDS[1]) {
		throw new Error("Protected future-sample manifest binding is invalid")
	}
	const protectedHashes = new Set([
		...openedFresh.sources.map(({ sha256 }) => sha256),
		...futureSample.families.flatMap(({ variants }) => variants.map(({ sha256 }) => sha256)),
		...futureSample03.families.flatMap(({ variants }) => variants.map(({ sha256 }) => sha256)),
	])
	if (development.sources.some(({ sha256 }) => protectedHashes.has(sha256))) {
		throw new Error("Development panel overlaps a protected directional sample")
	}
	const implementation = await implementationHash()
	await mkdir(sourceOutputDirectory, { recursive: true })
	process.stdout.write(`Development worker count: ${workers}\n`)
	process.stdout.write(`Candidate implementation: ${implementation}\n`)
	const wallStart = performance.now()
	let nextSource = 0
	let reused = 0
	const runWorker = async (): Promise<void> => {
		while (true) {
			const index = nextSource++
			if (index >= development.sources.length) return
			const source = development.sources[index]
			const outputPath = resolve(sourceOutputDirectory, `${source.caseId}.json`)
			if (await reusableArtifact(outputPath, source, development.manifestId, implementation)) {
				reused += 1
				process.stdout.write(`${source.caseId} valid artifact reused\n`)
				continue
			}
			await runChild(source, outputPath, implementation)
		}
	}
	await Promise.all(Array.from({ length: Math.min(workers, development.sources.length) }, runWorker))
	const artifacts = await Promise.all(development.sources.map(({ caseId }) =>
		readFile(resolve(sourceOutputDirectory, `${caseId}.json`), "utf8").then((value) => JSON.parse(value) as SourceArtifact)))
	const scientificRows = artifacts.map((artifact) => ({
		caseId: artifact.source.caseId,
		sourceSha256: artifact.source.sha256,
		scientificSha256: artifact.scientificSha256,
		extraction: artifact.extraction,
		presentations: artifact.presentations,
	}))
	const scientificSha256 = sha256(canonicalJson(scientificRows))
	const wallMs = performance.now() - wallStart
	const totalCpuUserMicros = artifacts.reduce((sum, { runtime }) => sum + runtime.cpuUserMicros, 0)
	const totalCpuSystemMicros = artifacts.reduce((sum, { runtime }) => sum + runtime.cpuSystemMicros, 0)
	const exactPartition = (whole: readonly string[], ...parts: readonly (readonly string[])[]): boolean => {
		const allParts = parts.flat()
		return new Set(whole).size === whole.length && new Set(allParts).size === allParts.length &&
			canonicalJson([...whole].sort()) === canonicalJson([...allParts].sort())
	}
	const previousByCaseId = new Map(previousAggregate.cases.map((artifact) => [artifact.source.caseId, artifact]))
	const identityGraphChecks = artifacts.map(({ source, extraction, dimensions, deterministicRepeatedExtraction }) => {
		const graph = extraction.diagnostics.identityObligationGraph
		const ranking = extraction.diagnostics.paretoRanking
		const overlay = extraction.diagnostics.exactOverlayGradientChallenger
		const explanation = graph.winnerExplanation
		const expectedStages = [
			"source-signature",
			"role-availability",
			"complete-treatment",
			"retention-frontier",
			"retained-slate",
			"winner-explanation",
		] as const
		const stagesByObligation = new Map(graph.obligations.map(({ id }) => [
			id,
			graph.nodes.filter(({ obligationId }) => obligationId === id),
		]))
		const continuity = [...stagesByObligation.values()].every((nodes) => {
			const status = (stage: typeof expectedStages[number]) => nodes.find((node) => node.stage === stage)?.status
			const stagesExact = nodes.length === expectedStages.length && nodes.every((node, index) =>
				node.stage === expectedStages[index])
			const availabilitySatisfied = status("role-availability") === "satisfied"
			const completeSatisfied = status("complete-treatment") === "satisfied"
			const frontierSatisfied = status("retention-frontier") === "satisfied"
			const slateSatisfied = status("retained-slate") === "satisfied"
			return stagesExact && status("source-signature") === "satisfied" &&
				availabilitySatisfied === completeSatisfied &&
				completeSatisfied === frontierSatisfied &&
				frontierSatisfied === slateSatisfied
		})
		const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
		const expectedEdgeKeys = new Set([...stagesByObligation.values()].flatMap((nodes) =>
			nodes.slice(1).map((node, index) => `${nodes[index].id}\0${node.id}`)))
		const actualEdgeKeys = new Set(graph.edges.map(({ from, to }) => `${from}\0${to}`))
		const edgesExact = nodeById.size === graph.nodes.length &&
			actualEdgeKeys.size === graph.edges.length &&
			actualEdgeKeys.size === expectedEdgeKeys.size &&
			[...expectedEdgeKeys].every((key) => actualEdgeKeys.has(key)) &&
			graph.edges.every((edge) => {
				const sourceNode = nodeById.get(edge.from)
				const destinationNode = nodeById.get(edge.to)
				if (!sourceNode || !destinationNode || sourceNode.obligationId !== destinationNode.obligationId) return false
				const sourceIndex = expectedStages.indexOf(sourceNode.stage)
				const destinationIndex = expectedStages.indexOf(destinationNode.stage)
				return destinationIndex === sourceIndex + 1 && edge.carried === (destinationNode.status === "satisfied")
			})
		const deferralByObligation = new Map(explanation.obligationDeferrals.map((deferral) => [deferral.obligationId, deferral]))
		const deferralsExact = deferralByObligation.size === explanation.obligationDeferrals.length &&
			exactPartition(explanation.deferredObligationIds,
				explanation.qualityDeferredObligationIds, explanation.priorityDeferredObligationIds) &&
			explanation.deferredObligationIds.every((obligationId) => {
				const deferral = deferralByObligation.get(obligationId)
				const winnerNode = graph.nodes.find((node) =>
					node.obligationId === obligationId && node.stage === "winner-explanation")
				if (!deferral || !winnerNode || winnerNode.reason !== deferral.reason ||
					deferral.completeCarrierCount < 1 || deferral.bestCarrierTreatmentId.length === 0) return false
				if (new Set(deferral.failedQualityGuardBlocks).size !== deferral.failedQualityGuardBlocks.length ||
					deferral.failedQualityGuardBlocks.some((block) =>
						!ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS.includes(block))) return false
				if (deferral.reason === "all-complete-treatment-carriers-failed-quality-guard") {
					return deferral.qualityEligibleCarrierCount === 0 && deferral.failedQualityGuardBlocks.length > 0 &&
						explanation.qualityDeferredObligationIds.includes(obligationId)
				}
				return deferral.reason === "quality-eligible-carrier-deferred-by-higher-obligation-coverage-or-priority" &&
					deferral.qualityEligibleCarrierCount > 0 && explanation.priorityDeferredObligationIds.includes(obligationId)
			})
		const identityGuardByChallenger = new Map(ranking.identityChallengerQualityGuards.map((evaluation) =>
			[evaluation.challengerTreatmentId, evaluation]))
		const identityGuardDiagnosticsExact =
			ranking.identityChallengerQualityGuards.length === ranking.identityChallengerCount &&
			identityGuardByChallenger.size === ranking.identityChallengerQualityGuards.length &&
			ranking.identityChallengerQualityGuards.every((evaluation) =>
				qualityGuardEvaluationIsExact(evaluation, ranking.qualityIncumbentTreatmentId)) &&
			ranking.identityChallengerQualityGuards.filter(({ pass }) => pass).length ===
				ranking.eligibleIdentityChallengerCount
		const selectedIdentityGuard = ranking.selectedIdentityChallengerTreatmentId === null
			? null
			: identityGuardByChallenger.get(ranking.selectedIdentityChallengerTreatmentId) ?? null
		const selectedIdentityChallengerValid = ranking.selectedIdentityChallengerTreatmentId === null
			? ranking.selectedIdentityChallengerQualityGuard === null && ranking.primaryTreatmentId === ranking.qualityIncumbentTreatmentId
			: selectedIdentityGuard?.pass === true &&
				canonicalJson(selectedIdentityGuard) === canonicalJson(ranking.selectedIdentityChallengerQualityGuard) &&
				ranking.primaryTreatmentId === ranking.selectedIdentityChallengerTreatmentId
		const overlayRejectedCount = overlay.qualityGuardEvaluations.filter(({ pass }) => !pass).length
		const overlayEvaluationIds = new Set(overlay.qualityGuardEvaluations.map(({ challengerTreatmentId }) =>
			challengerTreatmentId))
		const expectedOverlayEvaluationCount = overlay.existingExactOverlayGradientCount + overlay.projectedUniqueCount
		const overlayGuardDiagnosticsExact = overlay.qualityGuardRequired ===
			(ranking.selectedIdentityChallengerTreatmentId !== null) &&
			overlay.projectedUniqueCount <= overlay.projectedLegalCount &&
			overlay.projectedLegalCount <= overlay.projectedAttemptCount &&
			overlayEvaluationIds.size === overlay.qualityGuardEvaluations.length &&
			overlay.qualityGuardEvaluations.every((evaluation) =>
				qualityGuardEvaluationIsExact(evaluation, ranking.qualityIncumbentTreatmentId)) &&
			overlay.qualityGuardRejectedCandidateCount === overlayRejectedCount &&
			(overlay.qualityGuardRequired
				? overlay.qualityGuardEvaluations.length === expectedOverlayEvaluationCount &&
					(!overlay.replacedPrimaryWinner ||
					overlay.selectedChallengerPassesQualityGuard === true &&
					overlay.qualityGuardEvaluations.some(({ challengerTreatmentId, pass }) =>
						challengerTreatmentId === overlay.selectedChallengerId && pass))
				: overlay.qualityGuardEvaluations.length === 0 &&
					overlay.qualityGuardRejectedCandidateCount === 0 &&
					overlay.selectedChallengerPassesQualityGuard === null)
		const guardDeclarationsExact = ranking.version === "pareto-identity-winner-diagnostics-v3" &&
			ranking.qualityGuardVersion === ALBUM_ARTWORK_PALETTE_V2_POLICY.identity.qualityGuard.version &&
			canonicalJson(ranking.paretoBlocks) === canonicalJson(ALBUM_ARTWORK_PALETTE_V2_PARETO_BLOCKS) &&
			canonicalJson(ranking.rankingPriorityBlocks) === canonicalJson(ALBUM_ARTWORK_PALETTE_V2_RANKING_PRIORITY_BLOCKS) &&
			canonicalJson(ranking.qualityGuardBlocks) ===
				canonicalJson(ALBUM_ARTWORK_PALETTE_V2_COMPLETE_QUALITY_GUARD_BLOCKS) &&
			ranking.globalParetoFrontierTreatmentIds.length === ranking.frontierCandidateCount &&
			new Set(ranking.globalParetoFrontierTreatmentIds).size === ranking.frontierCandidateCount &&
			ranking.globalParetoFrontierTreatmentIds[0] === ranking.globalParetoTopTreatmentId
		const winnerAttributable = ranking.selectedTreatmentId === extraction.winner.id &&
			explanation.treatmentId === extraction.winner.id &&
			explanation.primaryTreatmentId === ranking.primaryTreatmentId &&
			explanation.qualityIncumbentTreatmentId === ranking.qualityIncumbentTreatmentId &&
			explanation.selectedIdentityChallengerTreatmentId === ranking.selectedIdentityChallengerTreatmentId &&
			(extraction.winner.id === ranking.primaryTreatmentId ||
				overlay.replacedPrimaryWinner && overlay.selectedChallengerId === extraction.winner.id) &&
			(!overlay.qualityGuardRequired || !overlay.replacedPrimaryWinner ||
				overlay.selectedChallengerPassesQualityGuard === true)
		const incumbentRetained = ranking.globalParetoTopTreatmentId === ranking.qualityIncumbentTreatmentId &&
			extraction.alternatives.some(({ id }) => id === ranking.qualityIncumbentTreatmentId)
		const previous = previousByCaseId.get(source.caseId)
		const currentAvailability = extraction.diagnostics.candidateAvailability
		const currentPreWinnerAvailability = {
			foregroundLaneFamilyIds: currentAvailability.foregroundLaneFamilyIds,
			signatureLaneFamilyIds: currentAvailability.signatureLaneFamilyIds,
			fieldHypothesisFamilyIds: currentAvailability.fieldHypothesisFamilyIds,
			foregroundsPerFieldVariantQuota: currentAvailability.foregroundsPerFieldVariantQuota,
			emergencyCandidateReserve: currentAvailability.emergencyCandidateReserve,
			foregroundPeakUnobservableRejectedOptionCount: currentAvailability.foregroundPeakUnobservableRejectedOptionCount,
			distinctAccentPeakUnobservableRejectedOptionCount: currentAvailability.distinctAccentPeakUnobservableRejectedOptionCount,
			completeCandidateForegroundFamilyIds: currentAvailability.completeCandidateForegroundFamilyIds,
			completeCandidateAccentFamilyIds: currentAvailability.completeCandidateAccentFamilyIds,
		}
		const previousAvailability = previous?.extraction.diagnostics.candidateAvailability
		const previousPreWinnerAvailability = previousAvailability === undefined ? null : {
			foregroundLaneFamilyIds: previousAvailability.foregroundLaneFamilyIds,
			signatureLaneFamilyIds: previousAvailability.signatureLaneFamilyIds,
			fieldHypothesisFamilyIds: previousAvailability.fieldHypothesisFamilyIds,
			foregroundsPerFieldVariantQuota: previousAvailability.foregroundsPerFieldVariantQuota,
			emergencyCandidateReserve: previousAvailability.emergencyCandidateReserve,
			foregroundPeakUnobservableRejectedOptionCount: previousAvailability.foregroundPeakUnobservableRejectedOptionCount,
			distinctAccentPeakUnobservableRejectedOptionCount: previousAvailability.distinctAccentPeakUnobservableRejectedOptionCount,
			completeCandidateForegroundFamilyIds: previousAvailability.completeCandidateForegroundFamilyIds,
			completeCandidateAccentFamilyIds: previousAvailability.completeCandidateAccentFamilyIds,
		}
		const currentPreWinnerNodes = graph.nodes.filter(({ stage }) =>
			stage !== "retained-slate" && stage !== "winner-explanation")
		const previousPreWinnerNodes = previous?.extraction.diagnostics.identityObligationGraph.nodes.filter(({ stage }) =>
			stage !== "retained-slate" && stage !== "winner-explanation")
		const predecessorContinuity = previous !== undefined && previous.source.sha256 === source.sha256 &&
			canonicalJson(previous.source) === canonicalJson(source) &&
			canonicalJson(previous.dimensions) === canonicalJson(dimensions) &&
			previous.extraction.diagnostics.nativeDiscovery === extraction.diagnostics.nativeDiscovery &&
			previous.extraction.diagnostics.preDiscoveryResize === extraction.diagnostics.preDiscoveryResize &&
			previous.extraction.diagnostics.familyCount === extraction.diagnostics.familyCount &&
			previous.extraction.diagnostics.retainedFamilyCount === extraction.diagnostics.retainedFamilyCount &&
			canonicalJson(previous.extraction.diagnostics.lanes) === canonicalJson(extraction.diagnostics.lanes) &&
			canonicalJson(previous.extraction.diagnostics.laneRetention) === canonicalJson(extraction.diagnostics.laneRetention) &&
			canonicalJson(previous.extraction.diagnostics.families) === canonicalJson(extraction.diagnostics.families) &&
			canonicalJson(previous.extraction.diagnostics.fieldDomains) === canonicalJson(extraction.diagnostics.fieldDomains) &&
			canonicalJson(previous.extraction.diagnostics.fieldHypotheses) ===
				canonicalJson(extraction.diagnostics.fieldHypotheses) &&
			canonicalJson(previous.extraction.diagnostics.gradientFits) === canonicalJson(extraction.diagnostics.gradientFits) &&
			previous.extraction.diagnostics.completeCandidateCount === extraction.diagnostics.completeCandidateCount &&
			canonicalJson(previousPreWinnerAvailability) ===
				canonicalJson(currentPreWinnerAvailability) &&
			canonicalJson(previous.extraction.diagnostics.emergency) === canonicalJson(extraction.diagnostics.emergency) &&
			canonicalJson(previous.extraction.diagnostics.bounds) === canonicalJson(extraction.diagnostics.bounds) &&
			canonicalJson(previous.extraction.diagnostics.identityObligationGraph.selection) === canonicalJson(graph.selection) &&
			canonicalJson(previous.extraction.diagnostics.identityObligationGraph.obligations) === canonicalJson(graph.obligations) &&
			canonicalJson(previousPreWinnerNodes) === canonicalJson(currentPreWinnerNodes) &&
			canonicalJson(previous.extraction.diagnostics.paretoRanking.rankingPriorityBlocks) ===
				canonicalJson(ranking.rankingPriorityBlocks) &&
			previous.extraction.diagnostics.paretoRanking.evidenceResolution === ranking.evidenceResolution &&
			previous.extraction.diagnostics.paretoRanking.dominanceUsesEvidenceLevels === ranking.dominanceUsesEvidenceLevels &&
			previous.extraction.diagnostics.paretoRanking.rawCandidateCount === ranking.rawCandidateCount &&
			previous.extraction.diagnostics.paretoRanking.uniqueCandidateCount === ranking.uniqueCandidateCount &&
			previous.extraction.diagnostics.paretoRanking.dominatedCandidateCount === ranking.dominatedCandidateCount &&
			previous.extraction.diagnostics.paretoRanking.frontierCandidateCount === ranking.frontierCandidateCount &&
			previous.extraction.diagnostics.paretoRanking.frontierDirectionCount === ranking.frontierDirectionCount &&
			previous.extraction.diagnostics.paretoRanking.identityRetentionFrontierCandidateCount ===
				ranking.identityRetentionFrontierCandidateCount &&
			previous.extraction.diagnostics.paretoRanking.identityCarriedCandidateCount === ranking.identityCarriedCandidateCount &&
			previous.extraction.diagnostics.paretoRanking.globalParetoTopTreatmentId === ranking.globalParetoTopTreatmentId &&
			previous.extraction.diagnostics.paretoRanking.qualityIncumbentTreatmentId === ranking.qualityIncumbentTreatmentId &&
			previous.extraction.diagnostics.paretoRanking.identityChallengerCount === ranking.identityChallengerCount &&
			previous.extraction.diagnostics.paretoRanking.legacyScalarTopTreatmentId === ranking.legacyScalarTopTreatmentId &&
			canonicalJson(previous.extraction.diagnostics.legacyScalarTopTreatment) ===
				canonicalJson(extraction.diagnostics.legacyScalarTopTreatment)
		const winnerChangedFromPredecessor = previous?.extraction.winner.id !== extraction.winner.id
		const winnerChangeAttributableToGuard = !winnerChangedFromPredecessor || previous !== undefined &&
			previous.extraction.diagnostics.paretoRanking.selectedIdentityChallengerTreatmentId !== null &&
			identityGuardByChallenger.get(previous.extraction.diagnostics.paretoRanking.primaryTreatmentId)?.pass === false
		return {
			caseId: source.caseId,
			pass: graph.version === "identity-obligation-graph-v3" &&
				graph.obligations.length <= ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.identityObligations &&
				graph.nodes.length === graph.obligations.length * 6 &&
				edgesExact &&
				exactPartition(explanation.feasibleObligationIds,
					explanation.coveredObligationIds, explanation.deferredObligationIds) &&
				explanation.coveredObligationIds.length <= explanation.maximumCompleteTreatmentCoverage &&
				deferralsExact && guardDeclarationsExact && identityGuardDiagnosticsExact &&
				selectedIdentityChallengerValid && overlayGuardDiagnosticsExact && winnerAttributable && incumbentRetained &&
				predecessorContinuity && deterministicRepeatedExtraction === true && continuity &&
				winnerChangeAttributableToGuard &&
				extraction.diagnostics.completeCandidateCount <= ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.completeCandidates &&
				extraction.alternatives.length <= ALBUM_ARTWORK_PALETTE_V2_POLICY.bounds.retainedTreatments &&
				ranking.retainedCount === extraction.alternatives.length &&
				ranking.eligibleIdentityChallengerCount === explanation.eligibleIdentityChallengerCount,
			obligationCount: graph.obligations.length,
			feasibleCount: explanation.feasibleObligationIds.length,
			coveredCount: explanation.coveredObligationIds.length,
			deferredCount: explanation.deferredObligationIds.length,
			qualityDeferredCount: explanation.qualityDeferredObligationIds.length,
			priorityDeferredCount: explanation.priorityDeferredObligationIds.length,
			blockedNodeCount: graph.nodes.filter(({ status }) => status === "blocked").length,
			globalFrontierCount: ranking.frontierCandidateCount,
			identityRetentionFrontierCount: ranking.identityRetentionFrontierCandidateCount,
			identityChallengerCount: ranking.identityChallengerCount,
			eligibleIdentityChallengerCount: ranking.eligibleIdentityChallengerCount,
			rejectedIdentityChallengerCount: ranking.identityChallengerQualityGuards.filter(({ pass }) => !pass).length,
			identityChallengerResolvedLossCount: ranking.identityChallengerQualityGuards.reduce((sum, evaluation) =>
				sum + evaluation.resolvedLosses.length, 0),
			overlayQualityGuardEvaluationCount: overlay.qualityGuardEvaluations.length,
			rejectedOverlayCount: overlayRejectedCount,
			finalSlateCount: extraction.alternatives.length,
			winnerChangedFromPredecessor,
		}
	})
	const identityObligationGate = {
		pass: identityGraphChecks.every(({ pass }) => pass),
		totalObligations: identityGraphChecks.reduce((sum, { obligationCount }) => sum + obligationCount, 0),
		feasibleObligations: identityGraphChecks.reduce((sum, { feasibleCount }) => sum + feasibleCount, 0),
		winnerCoveredObligations: identityGraphChecks.reduce((sum, { coveredCount }) => sum + coveredCount, 0),
		deferredObligations: identityGraphChecks.reduce((sum, { deferredCount }) => sum + deferredCount, 0),
		qualityDeferredObligations: identityGraphChecks.reduce((sum, { qualityDeferredCount }) => sum + qualityDeferredCount, 0),
		priorityDeferredObligations: identityGraphChecks.reduce((sum, { priorityDeferredCount }) => sum + priorityDeferredCount, 0),
		blockedNodes: identityGraphChecks.reduce((sum, { blockedNodeCount }) => sum + blockedNodeCount, 0),
		globalParetoFrontierCandidates: identityGraphChecks.reduce((sum, { globalFrontierCount }) => sum + globalFrontierCount, 0),
		identityRetentionFrontierCandidates: identityGraphChecks.reduce((sum, { identityRetentionFrontierCount }) =>
			sum + identityRetentionFrontierCount, 0),
		identityChallengers: identityGraphChecks.reduce((sum, { identityChallengerCount }) => sum + identityChallengerCount, 0),
		eligibleIdentityChallengers: identityGraphChecks.reduce((sum, { eligibleIdentityChallengerCount }) =>
			sum + eligibleIdentityChallengerCount, 0),
		rejectedIdentityChallengers: identityGraphChecks.reduce((sum, { rejectedIdentityChallengerCount }) =>
			sum + rejectedIdentityChallengerCount, 0),
		identityChallengerResolvedLosses: identityGraphChecks.reduce((sum, { identityChallengerResolvedLossCount }) =>
			sum + identityChallengerResolvedLossCount, 0),
		overlayQualityGuardEvaluations: identityGraphChecks.reduce((sum, { overlayQualityGuardEvaluationCount }) =>
			sum + overlayQualityGuardEvaluationCount, 0),
		rejectedIdentityDescendedOverlays: identityGraphChecks.reduce((sum, { rejectedOverlayCount }) =>
			sum + rejectedOverlayCount, 0),
		finalSlateTreatments: identityGraphChecks.reduce((sum, { finalSlateCount }) => sum + finalSlateCount, 0),
		winnerChangesFromPredecessor: identityGraphChecks.filter(({ winnerChangedFromPredecessor }) =>
			winnerChangedFromPredecessor).map(({ caseId }) => caseId),
		failedCaseIds: identityGraphChecks.filter(({ pass }) => !pass).map(({ caseId }) => caseId),
	}
	if (!identityObligationGate.pass) {
		throw new Error(`Identity-obligation development gate failed: ${identityObligationGate.failedCaseIds.join(", ")}`)
	}
	const summary = {
		schemaVersion: 3,
		candidateVersion: ALBUM_ARTWORK_PALETTE_V2_VERSION,
		implementationHash: implementation,
		developmentManifestId: development.manifestId,
		workerCount: workers,
		sourceCount: artifacts.length,
		reusedSourceArtifacts: reused,
		scientificSha256,
		fieldHypothesisCoverage: {
			oneField: artifacts.filter(({ extraction }) => extraction.diagnostics.fieldHypotheses.some(({ kind }) => kind === "one-field")).length,
			separateFlatFields: artifacts.filter(({ extraction }) => extraction.diagnostics.fieldHypotheses.some(({ kind }) => kind === "separate-flat-fields")).length,
			gradientField: artifacts.filter(({ extraction }) => extraction.diagnostics.fieldHypotheses.some(({ kind }) => kind === "gradient-field")).length,
		},
		emergencyEligibleCount: artifacts.filter(({ extraction }) => extraction.diagnostics.emergency.eligible).length,
		connectedFieldDomainCoverage: artifacts.filter(({ extraction }) => extraction.diagnostics.fieldDomains.some(({ eligible }) => eligible)).length,
		completeCandidateCount: artifacts.reduce((sum, { extraction }) => sum + extraction.diagnostics.completeCandidateCount, 0),
		paretoFrontierCandidateCount: artifacts.reduce((sum, { extraction }) => sum + extraction.diagnostics.paretoRanking.frontierCandidateCount, 0),
		dominatedCandidateCount: artifacts.reduce((sum, { extraction }) => sum + extraction.diagnostics.paretoRanking.dominatedCandidateCount, 0),
		retainedTreatmentCount: artifacts.reduce((sum, { extraction }) => sum + extraction.alternatives.length, 0),
		identityObligationGate,
		runtime: {
			wallMs,
			totalCpuUserMicros,
			totalCpuSystemMicros,
			maximumSourceWallMs: Math.max(...artifacts.map(({ runtime }) => runtime.wallMs)),
		},
	}
	const aggregate = {
		...summary,
		cases: artifacts,
	}
	await Promise.all([
		atomicJson(resolve(experimentDirectory, "summary.json"), summary),
		atomicJson(resolve(experimentDirectory, "aggregate.json"), aggregate),
	])
	process.stdout.write(`Completed ${artifacts.length} sources in ${wallMs.toFixed(1)}ms; scientific hash ${scientificSha256}\n`)
}

await main()
