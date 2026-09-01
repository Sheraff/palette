import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { buildReviewEvidence, reviewEvidenceInputPaths } from "./build-review-evidence.ts"
import {
	FIELD_STATE_CALIBRATION_FEATURES,
	FIELD_STATE_CALIBRATION_GRADIENT_TOLERANCE,
	FIELD_STATE_CALIBRATION_L2,
	FIELD_STATE_CALIBRATION_MAXIMUM_ITERATIONS,
	FIELD_STATE_CALIBRATION_VERSION,
	FIELD_STATE_MAPPING_DISTANCE,
	FIELD_STATE_MAPPING_MARGIN,
	fitFieldStateRanker,
	leaveOneSourceGroupOut,
	mapPaletteToFieldHypothesis,
	rankFieldHypotheses,
	scoreFieldStateFeatures,
	type FieldPaletteMapping,
	type FieldStatePairwiseComparison,
	type FieldStateRanker,
} from "./src/field-state-calibration.ts"
import { harmonicConjunction } from "./src/field-relation.ts"
import type { NativeFieldHypothesis, NativeFieldHypothesisGraph } from "./src/native-field-hypothesis-graph.ts"
import { stableArtworkId, type PaletteId, type PaletteSnapshot, type SemanticPalette } from "./src/review-evidence.ts"
import type { CorpusResult, Palette, RGB } from "./src/types.ts"

export const FIELD_STATE_CALIBRATION_DEVELOPMENT_PATH =
	"research/data/field-state-calibration-development.json" as const
export const FIELD_STATE_CALIBRATION_ANALYSIS_PATH =
	"research/data/field-state-calibration-analysis.json" as const

const nativeGraphPath = "research/data/native-field-hypothesis-graph-development.json" as const
const canonicalResultsPath = "research/data/results.json" as const
const treatmentRoot =
	"research/data/experiments/region-graph-0.19.0-native-role-observation-gradient-0.3.0-development" as const
const treatmentResultsPath = `${treatmentRoot}/results.json` as const
const treatmentManifestPath = `${treatmentRoot}/review-manifest.json` as const
const treatmentFeedbackPath = "research/data/native-role-observation-gradient-review-feedback.json" as const
const planPath = "research/FIELD_STATE_CALIBRATION_PLAN.md" as const
const expectedGraphSha256 = "990b3fb8370cb670831dcd0734b1bfdd1d17f58dd9fd617d3967698cc9fb8281"

const diagnosticSources = Object.freeze({
	maroon5: "6dfd27c93891e02bccb9597196bca250807177c210e3e660f6fb66257cd2c1ef",
	once: "26fb272d7128b9ed89ac19b8fc0c2810d10cae4ace1a06a37663b20b2bb61fc9",
	knuckles: "057be6b5a93708db128db9752b66b3d7631fec5d5611f3c5e318a03f6ee0c0d2",
	birdsofprey: "26b991b5d5b9c2a1a390bc5ec398a9b24231da0ce78e927e663aefd9ac1f5d9d",
	krafty: "3afaf90cd911c134fe26708b3da3fdad181eb38cd8455a8a4538de88a4894091",
})
const diagnosticSourceSet: ReadonlySet<string> = new Set<string>(Object.values(diagnosticSources))

export const FIELD_STATE_CALIBRATION_POLICY = Object.freeze({
	version: FIELD_STATE_CALIBRATION_VERSION,
	graphSha256: expectedGraphSha256,
	sourceGrouping: "exact-encoded-source-sha256",
	mapping: {
		exactRgb: "unique-primary-family-membership",
		maximumOKLabDistance: FIELD_STATE_MAPPING_DISTANCE,
		minimumSecondFamilyMarginExclusive: FIELD_STATE_MAPPING_MARGIN,
		generatedFields: "unmappable",
	},
	features: FIELD_STATE_CALIBRATION_FEATURES,
	labels: "decisive-pairwise-preference-only-absolute-external-check",
	weighting: "equal-total-weight-per-exact-source-group",
	model: {
		kind: "linear-bradley-terry-no-intercept",
		l2: FIELD_STATE_CALIBRATION_L2,
		maximumIterations: FIELD_STATE_CALIBRATION_MAXIMUM_ITERATIONS,
		gradientTolerance: FIELD_STATE_CALIBRATION_GRADIENT_TOLERANCE,
	},
	evaluation: "leave-one-exact-source-group-out-five-diagnostics-always-excluded-from-fit",
	diagnosticSources,
	gates: {
		minimumTrainingGroups: 12,
		minimumDecisiveComparisons: 20,
		minimumGroupedAccuracy: 0.6,
		minimumAccuracyImprovement: 0.03,
		maximumGroupedLogLoss: Math.log(2),
		onceDistinctFlatMaximumRank: 5,
		underRankedTargetMaximumQuantile: 0.25,
	},
	paletteOutput: "forbidden",
	humanReview: "forbidden",
	reserveRoots: "forbidden",
})

type GraphDevelopmentEntry = {
	file: string
	source: { sha256: string }
	graph: NativeFieldHypothesisGraph
}

type GraphDevelopment = {
	schemaVersion: 1
	experimentId: string
	entries: GraphDevelopmentEntry[]
}

type MappedSnapshot = {
	snapshotId: string
	groupId: string
	mapping: Extract<FieldPaletteMapping, { status: "mapped" }>
}

type AbsoluteRecord = {
	id: string
	groupId: string
	label: 0 | 1
	features: number[]
	evidenceFamily: "canonical-ledger" | "native-final-chain"
}

type ComparisonRecord = FieldStatePairwiseComparison & {
	evidenceFamily: "canonical-ledger" | "native-final-chain"
	preferredHypothesis: string
	otherHypothesis: string
}

type NativeManifestJudgment = {
	file: string
	sourceSha256: string
	preference: "canonical" | "treatment" | "tie"
	canonicalShippable: boolean
	treatmentShippable: boolean
	evidenceId: string
	provenance: "fresh" | "carry"
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
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

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function mean(values: readonly number[]): number {
	if (values.length === 0) throw new Error("Cannot average an empty value set")
	return values.reduce((sum, value) => sum + value, 0) / values.length
}

function fieldPalette(palette: Palette | SemanticPalette) {
	const gradient = typeof palette.gradient === "boolean"
		? { isGradient: palette.gradient }
		: { isGradient: palette.gradient.isGradient }
	return { background: palette.background, surface: palette.surface, gradient }
}

function featuresDiffer(first: readonly number[], second: readonly number[]): boolean {
	return first.some((value, index) => value !== second[index])
}

function diagnosticSupport(hypothesis: NativeFieldHypothesis): number {
	if (hypothesis.state === "collapsed") return hypothesis.oneFieldFit.mean
	return harmonicConjunction([
		hypothesis.stateSupport.mean,
		hypothesis.twoFieldFit!.mean,
		hypothesis.incrementalSurfaceIdentity!.mean,
	])
}

function mappingFailureCounts(values: readonly FieldPaletteMapping[]) {
	return {
		mapped: values.filter((value) => value.status === "mapped").length,
		generatedColor: values.filter((value) => value.status === "generated-color").length,
		ambiguous: values.filter((value) => value.status === "ambiguous").length,
		unmappable: values.filter((value) => value.status === "unmappable").length,
		missingHypothesis: values.filter((value) => value.status === "missing-hypothesis").length,
	}
}

function paletteSnapshotLookup(palettes: readonly PaletteSnapshot[]) {
	const lookup = new Map<string, PaletteSnapshot>()
	for (const palette of [...palettes].sort((first, second) =>
		compareAscii(first.algorithmVersion, second.algorithmVersion) || compareAscii(first.method, second.method))) {
		const key = `${palette.artworkId}\0${palette.paletteId}`
		const current = lookup.get(key)
		if (current && canonicalJson(current.semantic) !== canonicalJson(palette.semantic)) {
			throw new Error(`Palette identity has incompatible semantics: ${key}`)
		}
		lookup.set(key, current ?? palette)
	}
	return lookup
}

function mappedSnapshot(
	snapshot: PaletteSnapshot,
	graphEntry: GraphDevelopmentEntry | undefined,
	mappings: FieldPaletteMapping[],
): MappedSnapshot | null {
	if (!graphEntry) return null
	const mapping = mapPaletteToFieldHypothesis(graphEntry.graph, fieldPalette(snapshot.semantic))
	mappings.push(mapping)
	if (mapping.status !== "mapped") return null
	return {
		snapshotId: `${snapshot.artworkId}\0${snapshot.paletteId}`,
		groupId: graphEntry.source.sha256,
		mapping,
	}
}

function corpusPalette(corpus: CorpusResult, file: string): Palette {
	const entry = corpus.entries.find((candidate) => candidate.file === file)
	if (!entry) throw new Error(`Corpus palette is missing: ${corpus.algorithmVersion}/${file}`)
	return entry.extraction.methods.spatial
}

function normalizeNativeJudgments(manifest: unknown, feedback: unknown): NativeManifestJudgment[] {
	const manifestRecord = manifest as {
		carried: Array<{
			file: string; sourceSha256: string; priorFeedbackId: string; preference: "canonical" | "treatment" | "tie"
			canonicalShippable: boolean; treatmentShippable: boolean
		}>
	}
	const feedbackEntries = (feedback as { entries: Array<{
		id: string; image: string; sourceSha256: string; leftMethod: "previous" | "spatial"
		rightMethod: "previous" | "spatial"; preference: "left" | "right" | "tie"; ship: "left" | "right" | "both" | "neither"
	}> }).entries
	const carried = manifestRecord.carried.map((entry) => ({
		file: entry.file,
		sourceSha256: entry.sourceSha256,
		preference: entry.preference,
		canonicalShippable: entry.canonicalShippable,
		treatmentShippable: entry.treatmentShippable,
		evidenceId: entry.priorFeedbackId,
		provenance: "carry" as const,
	}))
	const fresh = feedbackEntries.map((entry) => {
		const identityAt = (side: "left" | "right") => entry[`${side}Method`] === "previous" ? "canonical" : "treatment"
		const preference: NativeManifestJudgment["preference"] = entry.preference === "tie"
			? "tie"
			: identityAt(entry.preference)
		const shipped = (identity: "canonical" | "treatment") => entry.ship === "both" ||
			(entry.ship === "left" && identityAt("left") === identity) ||
			(entry.ship === "right" && identityAt("right") === identity)
		return {
			file: entry.image,
			sourceSha256: entry.sourceSha256,
			preference,
			canonicalShippable: shipped("canonical"),
			treatmentShippable: shipped("treatment"),
			evidenceId: entry.id,
			provenance: "fresh" as const,
		}
	})
	const deduplicated = new Map<string, NativeManifestJudgment>()
	for (const entry of [...carried, ...fresh].sort((first, second) => compareAscii(first.file, second.file))) {
		const current = deduplicated.get(entry.sourceSha256)
		if (current && (current.preference !== entry.preference ||
			current.canonicalShippable !== entry.canonicalShippable ||
			current.treatmentShippable !== entry.treatmentShippable)) {
			throw new Error(`Duplicate native source has incompatible judgments: ${entry.sourceSha256}`)
		}
		deduplicated.set(entry.sourceSha256, current ?? entry)
	}
	return [...deduplicated.values()].sort((first, second) => compareAscii(first.sourceSha256, second.sourceSha256))
}

function rankMap(
	graph: NativeFieldHypothesisGraph,
	ranker: FieldStateRanker | null,
	baseline: boolean,
): Map<string, number> {
	const ranked = baseline
		? [...graph.hypotheses].sort((first, second) => diagnosticSupport(second) - diagnosticSupport(first) ||
			compareAscii(first.stableKey, second.stableKey)).map((hypothesis) => ({ hypothesis }))
		: rankFieldHypotheses(graph, ranker!)
	return new Map(ranked.map((entry, index) => [entry.hypothesis.stableKey, index + 1]))
}

function familyForRgb(graph: NativeFieldHypothesisGraph, rgb: RGB): string {
	const mapping = mapPaletteToFieldHypothesis(graph, {
		background: { rgb, generated: false },
		surface: { rgb, generated: false },
		gradient: { isGradient: false },
	})
	if (mapping.status !== "mapped") throw new Error(`Diagnostic RGB ${rgb.join(",")} does not map uniquely`)
	return mapping.background.familyStableKey
}

function targetPairRanks(
	graph: NativeFieldHypothesisGraph,
	ranker: FieldStateRanker,
	backgroundRgb: RGB,
	surfaceRgb: RGB,
) {
	const background = familyForRgb(graph, backgroundRgb)
	const surface = familyForRgb(graph, surfaceRgb)
	const targets = graph.hypotheses.filter((hypothesis) => hypothesis.state !== "collapsed" &&
		hypothesis.backgroundFamilyStableKey === background && hypothesis.surfaceFamilyStableKey === surface)
	if (targets.length !== 2) throw new Error("Diagnostic target pair is incomplete")
	const learnedRanks = rankMap(graph, ranker, false)
	const baselineRanks = rankMap(graph, null, true)
	const present = (hypothesis: NativeFieldHypothesis) => ({
		state: hypothesis.state,
		stableKey: hypothesis.stableKey,
		baselineRank: baselineRanks.get(hypothesis.stableKey)!,
		learnedRank: learnedRanks.get(hypothesis.stableKey)!,
	})
	const entries = targets.map(present).sort((first, second) => first.learnedRank - second.learnedRank)
	return {
		backgroundFamilyStableKey: background,
		surfaceFamilyStableKey: surface,
		entries,
		bestBaselineRank: Math.min(...entries.map((entry) => entry.baselineRank)),
		bestLearnedRank: Math.min(...entries.map((entry) => entry.learnedRank)),
		maximumAuthorizedRank: Math.ceil(graph.hypotheses.length * 0.25),
	}
}

function bestStateRank(graph: NativeFieldHypothesisGraph, ranker: FieldStateRanker, states: readonly NativeFieldHypothesis["state"][]) {
	const ranks = rankMap(graph, ranker, false)
	return Math.min(...graph.hypotheses.filter((hypothesis) => states.includes(hypothesis.state))
		.map((hypothesis) => ranks.get(hypothesis.stableKey)!))
}

function rocAuc(entries: readonly { label: 0 | 1; score: number }[]): number | null {
	const positives = entries.filter((entry) => entry.label === 1)
	const negatives = entries.filter((entry) => entry.label === 0)
	if (positives.length === 0 || negatives.length === 0) return null
	let favorable = 0
	for (const positive of positives) for (const negative of negatives) {
		if (positive.score > negative.score) favorable++
		else if (positive.score === negative.score) favorable += 0.5
	}
	return favorable / (positives.length * negatives.length)
}

function sourceGroupMean<T extends { groupId: string }>(entries: readonly T[], value: (entry: T) => number): number | null {
	if (entries.length === 0) return null
	const byGroup = new Map<string, number[]>()
	for (const entry of entries) {
		let values = byGroup.get(entry.groupId)
		if (!values) byGroup.set(entry.groupId, values = [])
		values.push(value(entry))
	}
	return mean([...byGroup.values()].map((values) => mean(values)))
}

async function inputHashes(projectRoot: string) {
	const paths = [
		nativeGraphPath,
		planPath,
		canonicalResultsPath,
		treatmentResultsPath,
		treatmentManifestPath,
		treatmentFeedbackPath,
		...reviewEvidenceInputPaths.map((path) => `research/${path}`),
	]
	const unique = [...new Set(paths)].sort(compareAscii)
	const hashes: Record<string, string> = {}
	for (const path of unique) hashes[path] = sha256(await readFile(resolve(projectRoot, path)))
	return hashes
}

export async function evaluateFieldStateCalibration(
	projectRoot = fileURLToPath(new URL("..", import.meta.url)),
) {
	const researchRoot = resolve(projectRoot, "research")
	const [graphSource, canonicalSource, treatmentSource, manifestSource, feedbackSource, reviewEvidence, hashes] =
		await Promise.all([
			readFile(resolve(projectRoot, nativeGraphPath)),
			readFile(resolve(projectRoot, canonicalResultsPath), "utf8"),
			readFile(resolve(projectRoot, treatmentResultsPath), "utf8"),
			readFile(resolve(projectRoot, treatmentManifestPath), "utf8"),
			readFile(resolve(projectRoot, treatmentFeedbackPath), "utf8"),
			buildReviewEvidence(researchRoot),
			inputHashes(projectRoot),
		])
	if (sha256(graphSource) !== expectedGraphSha256) throw new Error("Frozen native field graph changed")
	const graphDevelopment = JSON.parse(graphSource.toString("utf8")) as GraphDevelopment
	if (graphDevelopment.schemaVersion !== 1 || graphDevelopment.entries.length !== 37) {
		throw new Error("Native field graph development evidence is incomplete")
	}
	const canonical = JSON.parse(canonicalSource) as CorpusResult
	const treatment = JSON.parse(treatmentSource) as CorpusResult
	const manifest = JSON.parse(manifestSource) as unknown
	const feedback = JSON.parse(feedbackSource) as unknown
	const graphByArtwork = new Map(graphDevelopment.entries.map((entry) => [stableArtworkId(entry.file), entry]))
	const graphBySource = new Map(graphDevelopment.entries.map((entry) => [entry.source.sha256, entry]))
	const snapshotByIdentity = paletteSnapshotLookup(reviewEvidence.ledger.palettes)
	const mappings: FieldPaletteMapping[] = []
	const comparisons: ComparisonRecord[] = []
	const absolutes: AbsoluteRecord[] = []
	let canonicalTieCount = 0
	let canonicalNeitherCount = 0

	const resolveLedgerPalette = (artworkId: string, paletteId: PaletteId): MappedSnapshot | null => {
		const snapshot = snapshotByIdentity.get(`${artworkId}\0${paletteId}`)
		if (!snapshot) return null
		return mappedSnapshot(snapshot, graphByArtwork.get(snapshot.artworkId), mappings)
	}
	for (const event of reviewEvidence.ledger.events) {
		if (event.preference?.kind === "preferred") {
			const preferred = resolveLedgerPalette(event.artworkId, event.preference.preferredPaletteId)
			const other = resolveLedgerPalette(event.artworkId, event.preference.otherPaletteId)
			if (preferred && other && preferred.groupId === other.groupId &&
				featuresDiffer(preferred.mapping.features, other.mapping.features)) {
				comparisons.push({
					id: `canonical:${event.id}`,
					groupId: preferred.groupId,
					preferred: preferred.mapping.features,
					other: other.mapping.features,
					evidenceFamily: "canonical-ledger",
					preferredHypothesis: preferred.mapping.hypothesis.stableKey,
					otherHypothesis: other.mapping.hypothesis.stableKey,
				})
			}
		} else if (event.preference?.kind === "tie") canonicalTieCount++
		else if (event.preference?.kind === "neither") canonicalNeitherCount++
		for (const outcome of event.outcomes) {
			if (outcome.outcome === "preference-only") continue
			const mapped = resolveLedgerPalette(event.artworkId, outcome.paletteId)
			if (!mapped) continue
			absolutes.push({
				id: `canonical:${event.id}:${outcome.paletteId}`,
				groupId: mapped.groupId,
				label: outcome.outcome === "positive" ? 1 : 0,
				features: mapped.mapping.features,
				evidenceFamily: "canonical-ledger",
			})
		}
	}

	const nativeJudgments = normalizeNativeJudgments(manifest, feedback)
	for (const judgment of nativeJudgments) {
		const graphEntry = graphBySource.get(judgment.sourceSha256)
		if (!graphEntry) continue
		const canonicalMapping = mapPaletteToFieldHypothesis(graphEntry.graph, fieldPalette(corpusPalette(canonical, judgment.file)))
		const treatmentMapping = mapPaletteToFieldHypothesis(graphEntry.graph, fieldPalette(corpusPalette(treatment, judgment.file)))
		mappings.push(canonicalMapping, treatmentMapping)
		if (canonicalMapping.status !== "mapped" || treatmentMapping.status !== "mapped") continue
		if (judgment.preference !== "tie" && featuresDiffer(canonicalMapping.features, treatmentMapping.features)) {
			const preferred = judgment.preference === "canonical" ? canonicalMapping : treatmentMapping
			const other = judgment.preference === "canonical" ? treatmentMapping : canonicalMapping
			comparisons.push({
				id: `native:${judgment.evidenceId}`,
				groupId: judgment.sourceSha256,
				preferred: preferred.features,
				other: other.features,
				evidenceFamily: "native-final-chain",
				preferredHypothesis: preferred.hypothesis.stableKey,
				otherHypothesis: other.hypothesis.stableKey,
			})
		}
		absolutes.push({
			id: `native:${judgment.evidenceId}:canonical`,
			groupId: judgment.sourceSha256,
			label: judgment.canonicalShippable ? 1 : 0,
			features: canonicalMapping.features,
			evidenceFamily: "native-final-chain",
		}, {
			id: `native:${judgment.evidenceId}:treatment`,
			groupId: judgment.sourceSha256,
			label: judgment.treatmentShippable ? 1 : 0,
			features: treatmentMapping.features,
			evidenceFamily: "native-final-chain",
		})
	}

	const comparisonIds = new Set<string>()
	for (const comparison of comparisons) {
		if (comparisonIds.has(comparison.id)) throw new Error(`Duplicate comparison identity: ${comparison.id}`)
		comparisonIds.add(comparison.id)
	}
	const training = comparisons.filter((comparison) => !diagnosticSourceSet.has(comparison.groupId))
	const trainingGroups = [...new Set(training.map((comparison) => comparison.groupId))].sort(compareAscii)
	const sufficient = trainingGroups.length >= FIELD_STATE_CALIBRATION_POLICY.gates.minimumTrainingGroups &&
		training.length >= FIELD_STATE_CALIBRATION_POLICY.gates.minimumDecisiveComparisons
	const model = sufficient ? fitFieldStateRanker(training) : null
	const grouped = sufficient ? leaveOneSourceGroupOut(training) : []
	const comparisonAccuracy = grouped.length === 0 ? null : grouped.filter((entry) => entry.correct).length / grouped.length
	const comparisonLogLoss = grouped.length === 0 ? null : grouped.reduce((sum, entry) => sum + entry.logLoss, 0) / grouped.length
	const groupedAccuracy = sourceGroupMean(grouped, (entry) => entry.correct ? 1 : 0)
	const groupedLogLoss = sourceGroupMean(grouped, (entry) => entry.logLoss)
	const baselineOutcomes = training.map((comparison) => {
		const entry = graphBySource.get(comparison.groupId)!
		const byKey = new Map(entry.graph.hypotheses.map((hypothesis) => [hypothesis.stableKey, hypothesis]))
		return {
			groupId: comparison.groupId,
			correct: diagnosticSupport(byKey.get(comparison.preferredHypothesis)!) >
				diagnosticSupport(byKey.get(comparison.otherHypothesis)!),
		}
	})
	const baselineComparisonAccuracy = training.length === 0 ? null :
		baselineOutcomes.filter((entry) => entry.correct).length / training.length
	const baselineAccuracy = sourceGroupMean(baselineOutcomes, (entry) => entry.correct ? 1 : 0)

	const absoluteScores: Array<{ id: string; groupId: string; label: 0 | 1; score: number }> = []
	if (sufficient) {
		const foldModels = new Map<string, FieldStateRanker>()
		for (const record of absolutes.filter((entry) => !diagnosticSourceSet.has(entry.groupId))) {
			let fold = foldModels.get(record.groupId)
			if (!fold) {
				const foldTraining = training.filter((comparison) => comparison.groupId !== record.groupId)
				if (foldTraining.length === 0) continue
				fold = fitFieldStateRanker(foldTraining)
				foldModels.set(record.groupId, fold)
			}
			absoluteScores.push({ ...record, score: scoreFieldStateFeatures(fold, record.features) })
		}
	}

	const diagnosticEntries = Object.fromEntries(Object.entries(diagnosticSources).map(([name, sourceSha256]) => {
		const entry = graphBySource.get(sourceSha256)
		if (!entry) throw new Error(`Diagnostic source graph is missing: ${name}`)
		return [name, entry]
	})) as Record<keyof typeof diagnosticSources, GraphDevelopmentEntry>
	const diagnostics = model ? {
		once: {
			bestDistinctFlatRank: bestStateRank(diagnosticEntries.once.graph, model, ["distinct-flat"]),
			bestCollapsedRank: bestStateRank(diagnosticEntries.once.graph, model, ["collapsed"]),
		},
		krafty: {
			bestNonGradientRank: bestStateRank(diagnosticEntries.krafty.graph, model, ["collapsed", "distinct-flat"]),
			bestGradientRank: bestStateRank(diagnosticEntries.krafty.graph, model, ["gradient"]),
		},
		maroon5: targetPairRanks(diagnosticEntries.maroon5.graph, model, [10, 10, 10], [230, 144, 119]),
		knuckles: targetPairRanks(diagnosticEntries.knuckles.graph, model, [103, 114, 146], [184, 165, 195]),
		birdsofprey: targetPairRanks(diagnosticEntries.birdsofprey.graph, model, [87, 201, 176], [63, 174, 79]),
	} : null
	const gates = {
		sufficientTrainingGroups: trainingGroups.length >= FIELD_STATE_CALIBRATION_POLICY.gates.minimumTrainingGroups,
		sufficientDecisiveComparisons: training.length >= FIELD_STATE_CALIBRATION_POLICY.gates.minimumDecisiveComparisons,
		completeGroupedCoverage: grouped.length === training.length,
		modelConverged: model?.converged === true,
		groupedAccuracy: groupedAccuracy !== null && groupedAccuracy >= FIELD_STATE_CALIBRATION_POLICY.gates.minimumGroupedAccuracy,
		baselineImprovement: groupedAccuracy !== null && baselineAccuracy !== null &&
			groupedAccuracy >= baselineAccuracy + FIELD_STATE_CALIBRATION_POLICY.gates.minimumAccuracyImprovement,
		groupedLogLoss: groupedLogLoss !== null && groupedLogLoss < FIELD_STATE_CALIBRATION_POLICY.gates.maximumGroupedLogLoss,
		oncePreserved: diagnostics !== null &&
			diagnostics.once.bestDistinctFlatRank <= FIELD_STATE_CALIBRATION_POLICY.gates.onceDistinctFlatMaximumRank,
		kraftyPreserved: diagnostics !== null &&
			diagnostics.krafty.bestNonGradientRank < diagnostics.krafty.bestGradientRank,
		maroon5Improved: diagnostics !== null && diagnostics.maroon5.bestLearnedRank < diagnostics.maroon5.bestBaselineRank &&
			diagnostics.maroon5.bestLearnedRank <= diagnostics.maroon5.maximumAuthorizedRank,
		knucklesImproved: diagnostics !== null && diagnostics.knuckles.bestLearnedRank < diagnostics.knuckles.bestBaselineRank &&
			diagnostics.knuckles.bestLearnedRank <= diagnostics.knuckles.maximumAuthorizedRank,
		birdsofpreyImproved: diagnostics !== null && diagnostics.birdsofprey.bestLearnedRank < diagnostics.birdsofprey.bestBaselineRank &&
			diagnostics.birdsofprey.bestLearnedRank <= diagnostics.birdsofprey.maximumAuthorizedRank,
	}
	const passed = Object.values(gates).every(Boolean)
	const policySha256 = hashObject(FIELD_STATE_CALIBRATION_POLICY)
	const scientificIdentitySha256 = hashObject({ policySha256, inputs: hashes })
	const development = {
		schemaVersion: 1,
		experimentId: FIELD_STATE_CALIBRATION_VERSION,
		policy: FIELD_STATE_CALIBRATION_POLICY,
		policySha256,
		scientificIdentitySha256,
		inputs: hashes,
		dataset: {
			graphSourceCount: graphDevelopment.entries.length,
			canonicalLedgerEvents: reviewEvidence.ledger.events.length,
			nativeFinalSourceGroups: nativeJudgments.length,
			mappingAttempts: mappings.length,
			mapping: mappingFailureCounts(mappings),
			decisiveComparisons: comparisons.length,
			trainingComparisons: training.length,
			trainingSourceGroups: trainingGroups,
			diagnosticSourceGroupsExcluded: [...diagnosticSourceSet].sort(compareAscii),
			comparisonEvidenceFamilies: {
				canonicalLedger: comparisons.filter((entry) => entry.evidenceFamily === "canonical-ledger").length,
				nativeFinalChain: comparisons.filter((entry) => entry.evidenceFamily === "native-final-chain").length,
			},
			canonicalNondecisive: { ties: canonicalTieCount, neither: canonicalNeitherCount },
			absoluteExternalRecords: absolutes.length,
		},
		model,
		groupedEvaluation: {
			predictionCount: grouped.length,
			sourceGroupBalancedAccuracy: groupedAccuracy,
			sourceGroupBalancedMeanLogLoss: groupedLogLoss,
			sourceGroupBalancedBaselineAccuracy: baselineAccuracy,
			comparisonAccuracy,
			comparisonMeanLogLoss: comparisonLogLoss,
			comparisonBaselineAccuracy: baselineComparisonAccuracy,
			predictions: grouped,
		},
		absoluteExternalCheck: {
			recordCount: absoluteScores.length,
			positiveCount: absoluteScores.filter((entry) => entry.label === 1).length,
			negativeCount: absoluteScores.filter((entry) => entry.label === 0).length,
			rocAuc: rocAuc(absoluteScores),
		},
		diagnostics,
		gates,
		decision: {
			status: passed ? "pass" : "withhold",
			fieldRankingAuthority: passed,
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
		throw new Error("Usage: evaluate-field-state-calibration.ts [--write]")
	}
	const projectRoot = fileURLToPath(new URL("..", import.meta.url))
	const development = await evaluateFieldStateCalibration(projectRoot)
	if (arguments_[0] !== "--write") {
		process.stdout.write(`${JSON.stringify({
			dataset: development.dataset,
			groupedEvaluation: development.groupedEvaluation,
			absoluteExternalCheck: development.absoluteExternalCheck,
			diagnostics: development.diagnostics,
			gates: development.gates,
			decision: development.decision,
		}, null, 2)}\n`)
		return
	}
	const developmentSource = `${JSON.stringify(development, null, 2)}\n`
	await writeFile(resolve(projectRoot, FIELD_STATE_CALIBRATION_DEVELOPMENT_PATH), developmentSource)
	const analysis = {
		schemaVersion: 1,
		experimentId: FIELD_STATE_CALIBRATION_VERSION,
		policySha256: development.policySha256,
		scientificIdentitySha256: development.scientificIdentitySha256,
		developmentSha256: sha256(developmentSource),
		dataset: development.dataset,
		groupedEvaluation: {
			predictionCount: development.groupedEvaluation.predictionCount,
			sourceGroupBalancedAccuracy: development.groupedEvaluation.sourceGroupBalancedAccuracy,
			sourceGroupBalancedMeanLogLoss: development.groupedEvaluation.sourceGroupBalancedMeanLogLoss,
			sourceGroupBalancedBaselineAccuracy: development.groupedEvaluation.sourceGroupBalancedBaselineAccuracy,
			comparisonAccuracy: development.groupedEvaluation.comparisonAccuracy,
			comparisonMeanLogLoss: development.groupedEvaluation.comparisonMeanLogLoss,
			comparisonBaselineAccuracy: development.groupedEvaluation.comparisonBaselineAccuracy,
		},
		absoluteExternalCheck: development.absoluteExternalCheck,
		diagnostics: development.diagnostics,
		gates: development.gates,
		decision: development.decision,
		conclusion: development.decision.fieldRankingAuthority
			? "All calibration gates passed; only a separate complete-tuple plan is authorized."
			: "Field-only graph calibration does not earn ranking authority; stop before tuple selection or review.",
	}
	await writeFile(resolve(projectRoot, FIELD_STATE_CALIBRATION_ANALYSIS_PATH), `${JSON.stringify(analysis, null, 2)}\n`)
	process.stdout.write(`${FIELD_STATE_CALIBRATION_DEVELOPMENT_PATH}\n${FIELD_STATE_CALIBRATION_ANALYSIS_PATH}\n`)
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
	main().catch((error) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}
