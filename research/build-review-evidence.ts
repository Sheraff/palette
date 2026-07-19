import { lstat, readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import {
	acceptedSetFromEvents,
	buildEvidenceLedger,
	createCarryEdge,
	defaultPerceptualThresholdVersion,
	deduplicatePaletteSnapshots,
	deduplicateJudgmentEvents,
	matchAcceptedSet,
	paletteSnapshot,
	stableArtworkId,
	type ArtworkId,
	type CarryEdge,
	type EvidenceOutcome,
	type JudgmentEvent,
	type PaletteId,
	type PaletteMethod,
	type PalettePreference,
	type PaletteSnapshot,
} from "./src/review-evidence.ts"
import type { CorpusResult, Palette } from "./src/types.ts"

type JsonRecord = Record<string, unknown>

export const canonicalReviewEvidenceInputs = Object.freeze({
	results: "data/results.json",
	holdoutResults: "data/holdout-results.json",
	pairwiseFeedback: "data/feedback.json",
	absoluteFeedback: "data/absolute-feedback.json",
} as const)

export const acceptedRoundArchives = Object.freeze([
	{ file: "region-graph-0.1.0.json", algorithmVersion: "region-graph-0.1.0" },
	{ file: "region-graph-0.2.0.json", algorithmVersion: "region-graph-0.2.0" },
	{ file: "region-graph-0.3.0.json", algorithmVersion: "region-graph-0.3.0" },
	{ file: "region-graph-0.4.0.json", algorithmVersion: "region-graph-0.4.0" },
	{ file: "region-graph-0.5.0.json", algorithmVersion: "region-graph-0.5.0" },
	{ file: "region-graph-0.6.0.json", algorithmVersion: "region-graph-0.6.0" },
	{ file: "region-graph-0.7.0.json", algorithmVersion: "region-graph-0.7.0" },
	{ file: "region-graph-0.8.0.json", algorithmVersion: "region-graph-0.8.0" },
	{ file: "region-graph-0.9.0.json", algorithmVersion: "region-graph-0.9.0" },
	{ file: "region-graph-0.10.0.json", algorithmVersion: "region-graph-0.10.0" },
	{ file: "region-graph-0.11.0.json", algorithmVersion: "region-graph-0.11.0" },
	{ file: "region-graph-0.11.0-corpus-review.json", algorithmVersion: "region-graph-0.11.0" },
	{ file: "region-graph-0.12.0.json", algorithmVersion: "region-graph-0.12.0" },
	{ file: "region-graph-0.13.0.json", algorithmVersion: "region-graph-0.13.0" },
	{ file: "region-graph-0.13.0-corpus-review.json", algorithmVersion: "region-graph-0.13.0" },
	{ file: "region-graph-0.15.0.json", algorithmVersion: "region-graph-0.15.0" },
	{ file: "region-graph-0.15.0-corpus-review.json", algorithmVersion: "region-graph-0.15.0" },
	{ file: "region-graph-0.16.0.json", algorithmVersion: "region-graph-0.16.0" },
] as const)

export const reviewEvidenceInputPaths: readonly string[] = Object.freeze([
	...Object.values(canonicalReviewEvidenceInputs),
	...acceptedRoundArchives.map((archive) => `data/rounds/${archive.file}`),
])

type SourceReport = {
	path: string
	kind: "corpus" | "pairwise-feedback" | "absolute-feedback" | "round-archive"
	records: number
	supportedRecords: number
	unsupportedRecords: number
}

type UnsupportedEvent = {
	source: string
	eventId: string | null
	image: string | null
	reason: string
}

type AbsoluteStore = {
	source: string
	version: string
	value: JsonRecord
}

type AbsoluteObservation = {
	event: JudgmentEvent
	outcome: Exclude<EvidenceOutcome, "preference-only">
	snapshot: PaletteSnapshot
	source: string
}

const methods = new Set<PaletteMethod>(["spatial", "expressive", "quantized"])
const shipValues = new Set(["left", "right", "both", "neither"])
const preferenceValues = new Set(["left", "right", "tie"])
const legacyChoiceValues = new Set(["left", "right", "tie", "neither"])

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

export async function readReviewEvidenceJson(path: string): Promise<unknown> {
	const stats = await lstat(path)
	if (stats.isSymbolicLink()) throw new Error(`Review evidence input must not be a symbolic link: ${path}`)
	if (!stats.isFile()) throw new Error(`Review evidence input must be a regular file: ${path}`)
	return JSON.parse(await readFile(path, "utf8")) as unknown
}

export function validateAcceptedRoundArchive(source: string, expectedVersion: string, value: unknown): JsonRecord {
	if (!isRecord(value)) throw new Error(`${source} is not an object`)
	const validateVersion = (record: JsonRecord, key: string, label: string): void => {
		if (record[key] !== undefined && record[key] !== expectedVersion) {
			throw new Error(`${source} ${label} does not identify ${expectedVersion}`)
		}
	}
	validateVersion(value, "algorithmVersion", "archive metadata")
	if (value.decision !== undefined && value.decision !== "accepted") {
		throw new Error(`${source} is not an accepted archive`)
	}
	if (value.acceptance !== undefined) {
		if (!isRecord(value.acceptance) || value.acceptance.decision !== "accepted") {
			throw new Error(`${source} does not contain an accepted decision`)
		}
	}
	for (const key of ["results", "holdoutResults", "absoluteFeedback"] as const) {
		const record = value[key]
		if (isRecord(record)) validateVersion(record, "algorithmVersion", `${key} metadata`)
	}
	if (isRecord(value.feedback)) {
		validateVersion(value.feedback, "algorithmVersion", "feedback metadata")
		validateVersion(value.feedback, "candidateAlgorithmVersion", "feedback candidate metadata")
	}
	if (value.reviewProvenance !== undefined) {
		if (!isRecord(value.reviewProvenance) || typeof value.reviewProvenance.algorithmVersion !== "string") {
			throw new Error(`${source} review provenance is invalid`)
		}
		const reviewedVersion = value.reviewProvenance.algorithmVersion
		for (const key of ["results", "holdoutResults"] as const) {
			const record = value.reviewProvenance[key]
			if (!isRecord(record) || record.algorithmVersion !== reviewedVersion) {
				throw new Error(`${source} review provenance ${key} does not identify ${reviewedVersion}`)
			}
		}
		const feedback = value.reviewProvenance.feedback
		if (!isRecord(feedback) || feedback.candidateAlgorithmVersion !== reviewedVersion) {
			throw new Error(`${source} review provenance feedback does not identify ${reviewedVersion}`)
		}
	}
	return value
}

function timestampEventId(artworkId: ArtworkId, timestamp: string): string {
	return `judgment:v1|${artworkId}|${timestamp}`
}

export function pairwiseJudgmentEventId(artworkId: ArtworkId, timestamp: string, persistedRecordId?: unknown): string {
	if (persistedRecordId === undefined) return timestampEventId(artworkId, timestamp)
	if (typeof persistedRecordId !== "string" || persistedRecordId.trim().length === 0) {
		throw new Error("Persisted pairwise record ID must be a non-empty string")
	}
	return `judgment:pairwise:v1|${artworkId}|${persistedRecordId}`
}

function versionParts(version: string): number[] {
	return (version.match(/\d+/g) ?? []).map(Number)
}

function compareVersions(first: string, second: string): number {
	const left = versionParts(first)
	const right = versionParts(second)
	for (let index = 0; index < Math.max(left.length, right.length); index++) {
		const difference = (left[index] ?? 0) - (right[index] ?? 0)
		if (difference !== 0) return difference
	}
	return first.localeCompare(second)
}

function snapshotKey(version: string, file: string, method: PaletteMethod): string {
	return `${version}\0${stableArtworkId(file)}\0${method}`
}

function uniqueById<T extends { id: string }>(values: readonly T[]): T[] {
	return [...new Map(values.map((value) => [value.id, value])).values()]
}

export async function buildReviewEvidence(researchRoot = fileURLToPath(new URL(".", import.meta.url))) {
	const dataRoot = join(researchRoot, "data")
	const roundsRoot = join(dataRoot, "rounds")
	const sourceReports = new Map<string, SourceReport>()
	const unsupported: UnsupportedEvent[] = []
	const snapshots = new Map<string, PaletteSnapshot>()
	const pairwiseSources: Array<{ source: string; value: JsonRecord }> = []
	const absoluteStores: AbsoluteStore[] = []

	const reportSource = (path: string, kind: SourceReport["kind"], records = 0): SourceReport => {
		let report = sourceReports.get(path)
		if (!report) {
			report = { path, kind, records, supportedRecords: 0, unsupportedRecords: 0 }
			sourceReports.set(path, report)
		} else report.records += records
		return report
	}

	const reject = (source: string, eventId: string | null, image: string | null, reason: string): void => {
		unsupported.push({ source, eventId, image, reason })
		const report = sourceReports.get(source)
		if (report) report.unsupportedRecords++
	}

	const registerCorpus = (source: string, value: unknown): CorpusResult | null => {
		if (!isRecord(value) || typeof value.algorithmVersion !== "string" || !Array.isArray(value.entries)) {
			reject(source, null, null, "Corpus result has an unsupported top-level schema")
			return null
		}
		const report = reportSource(source, "corpus", value.entries.length)
		for (const entryValue of value.entries) {
			if (!isRecord(entryValue) || typeof entryValue.file !== "string" || !isRecord(entryValue.extraction) ||
				!isRecord(entryValue.extraction.methods)) {
				reject(source, null, null, "Corpus entry has no file or extraction methods")
				continue
			}
			let entrySupported = true
			for (const method of methods) {
				const palette = entryValue.extraction.methods[method]
				if (!isRecord(palette)) {
					entrySupported = false
					continue
				}
				let snapshot: PaletteSnapshot
				try {
					snapshot = paletteSnapshot({
						file: entryValue.file,
						algorithmVersion: value.algorithmVersion,
						method,
						palette: palette as Palette,
					})
				} catch (error) {
					entrySupported = false
					reject(source, null, entryValue.file, `Invalid ${method} palette: ${(error as Error).message}`)
					continue
				}
				const key = snapshotKey(value.algorithmVersion, entryValue.file, method)
				const current = snapshots.get(key)
				if (current) {
					try {
						deduplicatePaletteSnapshots([current, snapshot])
					} catch (error) {
						throw new Error(`${source}: ${(error as Error).message}`)
					}
				} else {
					snapshots.set(key, snapshot)
				}
			}
			if (entrySupported) report.supportedRecords++
		}
		return value as unknown as CorpusResult
	}

	const currentResultsPath = join(researchRoot, canonicalReviewEvidenceInputs.results)
	const currentHoldoutPath = join(researchRoot, canonicalReviewEvidenceInputs.holdoutResults)
	const currentFeedbackPath = join(researchRoot, canonicalReviewEvidenceInputs.pairwiseFeedback)
	const currentAbsolutePath = join(researchRoot, canonicalReviewEvidenceInputs.absoluteFeedback)
	const [currentResultsValue, currentHoldoutValue, currentFeedbackValue, currentAbsoluteValue] = await Promise.all([
		readReviewEvidenceJson(currentResultsPath),
		readReviewEvidenceJson(currentHoldoutPath),
		readReviewEvidenceJson(currentFeedbackPath),
		readReviewEvidenceJson(currentAbsolutePath),
	])
	const currentResults = registerCorpus("data/results.json", currentResultsValue)
	const currentHoldout = registerCorpus("data/holdout-results.json", currentHoldoutValue)
	if (!currentResults || !currentHoldout) throw new Error("Current canonical results are required")
	if (currentResults.algorithmVersion !== currentHoldout.algorithmVersion) {
		throw new Error("Current development and holdout algorithm versions differ")
	}

	const roundDocuments: Array<{ source: string; value: JsonRecord }> = []
	for (const archive of acceptedRoundArchives) {
		const source = `data/rounds/${archive.file}`
		const value = validateAcceptedRoundArchive(
			source,
			archive.algorithmVersion,
			await readReviewEvidenceJson(join(roundsRoot, archive.file)),
		)
		reportSource(source, "round-archive")
		roundDocuments.push({ source, value })
		if (value.results !== undefined) registerCorpus(`${source}#results`, value.results)
		if (value.holdoutResults !== undefined) registerCorpus(`${source}#holdoutResults`, value.holdoutResults)
		if (isRecord(value.reviewProvenance)) {
			registerCorpus(`${source}#reviewProvenance.results`, value.reviewProvenance.results)
			registerCorpus(`${source}#reviewProvenance.holdoutResults`, value.reviewProvenance.holdoutResults)
		}
	}

	if (!isRecord(currentFeedbackValue)) throw new Error("Current pairwise feedback must be an object")
	pairwiseSources.push({ source: "data/feedback.json", value: currentFeedbackValue })
	for (const round of roundDocuments) {
		if (isRecord(round.value.feedback) && Array.isArray(round.value.feedback.entries)) {
			pairwiseSources.push({ source: `${round.source}#feedback`, value: round.value.feedback })
		}
		if (isRecord(round.value.reviewProvenance) && isRecord(round.value.reviewProvenance.feedback) &&
			Array.isArray(round.value.reviewProvenance.feedback.entries)) {
			pairwiseSources.push({
				source: `${round.source}#reviewProvenance.feedback`,
				value: round.value.reviewProvenance.feedback,
			})
		}
		if (isRecord(round.value.absoluteFeedback) && typeof round.value.absoluteFeedback.algorithmVersion === "string") {
			absoluteStores.push({
				source: `${round.source}#absoluteFeedback`,
				version: round.value.absoluteFeedback.algorithmVersion,
				value: round.value.absoluteFeedback,
			})
		}
	}
	if (!isRecord(currentAbsoluteValue) || typeof currentAbsoluteValue.algorithmVersion !== "string") {
		throw new Error("Current absolute feedback must identify its algorithm version")
	}
	absoluteStores.push({ source: "data/absolute-feedback.json", version: currentAbsoluteValue.algorithmVersion, value: currentAbsoluteValue })

	const resolveMethod = (entry: JsonRecord, side: "left" | "right"): PaletteSnapshot | null => {
		const methodValue = entry[`${side}Method`]
		if (typeof methodValue !== "string" || typeof entry.image !== "string" || typeof entry.algorithmVersion !== "string") return null
		if (methodValue === "previous") {
			if (typeof entry.previousAlgorithmVersion !== "string") return null
			return snapshots.get(snapshotKey(entry.previousAlgorithmVersion, entry.image, "spatial")) ?? null
		}
		if (!methods.has(methodValue as PaletteMethod)) return null
		return snapshots.get(snapshotKey(entry.algorithmVersion, entry.image, methodValue as PaletteMethod)) ?? null
	}

	const pairwiseEvents: JudgmentEvent[] = []
	let pairwiseRecordCount = 0
	for (const pairwiseSource of pairwiseSources) {
		const entries = pairwiseSource.value.entries
		if (!Array.isArray(entries)) {
			reportSource(pairwiseSource.source, "pairwise-feedback")
			reject(pairwiseSource.source, null, null, "Pairwise feedback has no entries array")
			continue
		}
		const report = reportSource(pairwiseSource.source, "pairwise-feedback", entries.length)
		for (const entryValue of entries) {
			pairwiseRecordCount++
			if (!isRecord(entryValue) || typeof entryValue.image !== "string" || typeof entryValue.timestamp !== "string") {
				reject(pairwiseSource.source, null, null, "Pairwise event has no image or timestamp")
				continue
			}
			const artworkId = stableArtworkId(entryValue.image)
			const eventId = pairwiseJudgmentEventId(artworkId, entryValue.timestamp, entryValue.id)
			const left = resolveMethod(entryValue, "left")
			const right = resolveMethod(entryValue, "right")
			if (!left || !right) {
				reject(pairwiseSource.source, eventId, entryValue.image,
					"Referenced palette snapshot is absent from canonical results or round archives")
				continue
			}
			let preference: PalettePreference
			let outcomes: JudgmentEvent["outcomes"]
			if (entryValue.reviewSchema === 2) {
				if (typeof entryValue.preference !== "string" || !preferenceValues.has(entryValue.preference) ||
					typeof entryValue.ship !== "string" || !shipValues.has(entryValue.ship)) {
					reject(pairwiseSource.source, eventId, entryValue.image, "Review-schema-2 event has unsupported preference or ship values")
					continue
				}
				preference = entryValue.preference === "left"
					? { kind: "preferred", preferredPaletteId: left.paletteId, otherPaletteId: right.paletteId }
					: entryValue.preference === "right"
						? { kind: "preferred", preferredPaletteId: right.paletteId, otherPaletteId: left.paletteId }
						: { kind: "tie", paletteIds: [left.paletteId, right.paletteId] }
				const leftOutcome: Exclude<EvidenceOutcome, "preference-only"> =
					entryValue.ship === "left" || entryValue.ship === "both" ? "positive" : "negative"
				const rightOutcome: Exclude<EvidenceOutcome, "preference-only"> =
					entryValue.ship === "right" || entryValue.ship === "both" ? "positive" : "negative"
				outcomes = [
					{ paletteId: left.paletteId, outcome: leftOutcome },
					{ paletteId: right.paletteId, outcome: rightOutcome },
				]
			} else {
				if (typeof entryValue.choice !== "string" || !legacyChoiceValues.has(entryValue.choice)) {
					reject(pairwiseSource.source, eventId, entryValue.image, "Legacy event has an unsupported choice")
					continue
				}
				preference = entryValue.choice === "left"
					? { kind: "preferred", preferredPaletteId: left.paletteId, otherPaletteId: right.paletteId }
					: entryValue.choice === "right"
						? { kind: "preferred", preferredPaletteId: right.paletteId, otherPaletteId: left.paletteId }
						: { kind: entryValue.choice, paletteIds: [left.paletteId, right.paletteId] } as PalettePreference
				outcomes = [
					{ paletteId: left.paletteId, outcome: "preference-only" },
					{ paletteId: right.paletteId, outcome: "preference-only" },
				]
			}
			pairwiseEvents.push({
				id: eventId,
				artworkId,
				observedAt: entryValue.timestamp,
				sources: [pairwiseSource.source],
				outcomes,
				preference,
			})
			report.supportedRecords++
		}
	}

	absoluteStores.sort((first, second) => compareVersions(first.version, second.version) || first.source.localeCompare(second.source))
	const absoluteEvents: JudgmentEvent[] = []
	const carryEdges: CarryEdge[] = []
	const previousAbsolute = new Map<string, AbsoluteObservation>()
	let absoluteRecordCount = 0
	for (const store of absoluteStores) {
		const entries = store.value.entries
		if (store.value.schemaVersion !== 3 || !Array.isArray(entries)) {
			reportSource(store.source, "absolute-feedback")
			reject(store.source, null, null, "Only absolute-feedback schema version 3 is supported")
			continue
		}
		const report = reportSource(store.source, "absolute-feedback", entries.length)
		for (const entryValue of entries) {
			absoluteRecordCount++
			if (!isRecord(entryValue) || typeof entryValue.image !== "string" || typeof entryValue.decidedAt !== "string" ||
				typeof entryValue.shippable !== "boolean") {
				reject(store.source, null, null, "Absolute event has no image, timestamp, or boolean shippability")
				continue
			}
			const artworkId = stableArtworkId(entryValue.image)
			const eventId = timestampEventId(artworkId, entryValue.decidedAt)
			const snapshot = snapshots.get(snapshotKey(store.version, entryValue.image, "spatial"))
			if (!snapshot) {
				reject(store.source, eventId, entryValue.image, "Absolute event palette is absent from canonical holdout results or corpus archives")
				continue
			}
			const outcome = entryValue.shippable ? "positive" : "negative"
			const event: JudgmentEvent = {
				id: eventId,
				artworkId,
				observedAt: entryValue.decidedAt,
				sources: [store.source],
				outcomes: [{ paletteId: snapshot.paletteId, outcome }],
			}
			const prior = previousAbsolute.get(eventId)
			if (!prior) {
				absoluteEvents.push(event)
				previousAbsolute.set(eventId, { event, outcome, snapshot, source: store.source })
				report.supportedRecords++
				continue
			}
			if (prior.outcome !== outcome) {
				reject(store.source, eventId, entryValue.image, "A carried absolute event changed outcome without a new timestamp")
				continue
			}
			if (prior.snapshot.algorithmVersion !== snapshot.algorithmVersion) {
				const edge = createCarryEdge({ artworkId, from: prior.snapshot, to: snapshot, eventIds: [eventId] })
				if (!edge) {
					reject(store.source, eventId, entryValue.image,
						`Carried palette exceeds ${defaultPerceptualThresholdVersion}; no outcome was inferred`)
					continue
				}
				carryEdges.push(edge)
			}
			absoluteEvents.push({ ...event, outcomes: [] })
			previousAbsolute.set(eventId, { event, outcome, snapshot, source: store.source })
			report.supportedRecords++
		}
	}

	const rawEvents = [...pairwiseEvents, ...absoluteEvents]
	const events = deduplicateJudgmentEvents(rawEvents)
	const ledger = buildEvidenceLedger({
		palettes: [...snapshots.values()],
		events,
		carryEdges: uniqueById(carryEdges),
	})
	const semanticByPaletteId = new Map(ledger.palettes.map((palette) => [palette.paletteId, palette.semantic]))
	const currentSnapshot = (file: string): PaletteSnapshot | null =>
		snapshots.get(snapshotKey(currentResults.algorithmVersion, file, "spatial")) ?? null

	const negativeByArtwork = new Map<ArtworkId, Set<PaletteId>>()
	const negativeEventsByNode = new Map<string, Set<string>>()
	for (const event of ledger.events) {
		for (const outcome of event.outcomes) {
			if (outcome.outcome !== "negative") continue
			const key = `${event.artworkId}\0${outcome.paletteId}`
			let eventIds = negativeEventsByNode.get(key)
			if (!eventIds) negativeEventsByNode.set(key, eventIds = new Set())
			eventIds.add(event.id)
		}
	}
	let propagated = true
	while (propagated) {
		propagated = false
		for (const edge of ledger.carryEdges) {
			const from = negativeEventsByNode.get(`${edge.artworkId}\0${edge.fromPaletteId}`)
			if (!from) continue
			const key = `${edge.artworkId}\0${edge.toPaletteId}`
			let to = negativeEventsByNode.get(key)
			if (!to) negativeEventsByNode.set(key, to = new Set())
			for (const eventId of edge.eventIds) {
				if (from.has(eventId) && !to.has(eventId)) {
					to.add(eventId)
					propagated = true
				}
			}
		}
	}
	for (const key of negativeEventsByNode.keys()) {
		const separator = key.indexOf("\0")
		const artworkId = key.slice(0, separator) as ArtworkId
		const paletteId = key.slice(separator + 1) as PaletteId
		let ids = negativeByArtwork.get(artworkId)
		if (!ids) negativeByArtwork.set(artworkId, ids = new Set())
		ids.add(paletteId)
	}

	const acceptedByArtwork = new Map<ArtworkId, ReturnType<typeof acceptedSetFromEvents>>()
	for (const accepted of ledger.acceptedSet) {
		let values = acceptedByArtwork.get(accepted.artworkId)
		if (!values) acceptedByArtwork.set(accepted.artworkId, values = [])
		values.push(accepted)
	}
	const eventsByArtwork = new Map<ArtworkId, JudgmentEvent[]>()
	for (const event of ledger.events) {
		let values = eventsByArtwork.get(event.artworkId)
		if (!values) eventsByArtwork.set(event.artworkId, values = [])
		values.push(event)
	}
	const conflictsByArtwork = new Map<ArtworkId, typeof ledger.conflicts>()
	for (const conflict of ledger.conflicts) {
		let values = conflictsByArtwork.get(conflict.artworkId)
		if (!values) conflictsByArtwork.set(conflict.artworkId, values = [])
		values.push(conflict)
	}

	const currentAbsoluteEntries = currentAbsoluteValue.entries
	if (!Array.isArray(currentAbsoluteEntries)) throw new Error("Current absolute feedback has no entries")
	const reviewableFiles = currentResults.entries.filter((entry) => entry.review).map((entry) => entry.file).sort()
	const curatedFiles = currentAbsoluteEntries.flatMap((entry) => isRecord(entry) && typeof entry.image === "string" ? [entry.image] : []).sort()
	if (reviewableFiles.length !== 35) throw new Error(`Expected 35 reviewable development entries, received ${reviewableFiles.length}`)
	if (curatedFiles.length !== 100) throw new Error(`Expected 100 curated entries, received ${curatedFiles.length}`)
	const holdoutFiles = new Set(currentHoldout.entries.map((entry) => entry.file))
	for (const file of curatedFiles) if (!holdoutFiles.has(file)) throw new Error(`Curated file is absent from current holdout: ${file}`)

	const artworkReport = (file: string, cohort: "reviewable-development" | "curated-00") => {
		const artworkId = stableArtworkId(file)
		const accepted = acceptedByArtwork.get(artworkId) ?? []
		const negativeIds = [...(negativeByArtwork.get(artworkId) ?? [])].sort()
		const acceptedSemantics = accepted.flatMap((entry) => {
			const semantic = semanticByPaletteId.get(entry.paletteId)
			return semantic ? [semantic] : []
		})
		const negativeSemantics = negativeIds.flatMap((paletteId) => {
			const semantic = semanticByPaletteId.get(paletteId)
			return semantic ? [semantic] : []
		})
		const current = currentSnapshot(file)
		if (!current) throw new Error(`Current spatial palette is missing for ${file}`)
		const acceptedMatch = matchAcceptedSet(current.semantic, acceptedSemantics)
		const negativeMatch = matchAcceptedSet(current.semantic, negativeSemantics)
		const classification = acceptedMatch.accepted && negativeMatch.accepted
			? "conflicted"
			: acceptedMatch.accepted
				? "accepted"
				: negativeMatch.accepted
					? "rejected"
					: "unknown"
		const artworkEvents = eventsByArtwork.get(artworkId) ?? []
		return {
			artworkId,
			file,
			cohort,
			eventCount: artworkEvents.length,
			positivePaletteCount: accepted.length,
			negativePaletteCount: negativeIds.length,
			preferenceOnlyEventCount: artworkEvents.filter((event) =>
				event.outcomes.length > 0 && event.outcomes.every((outcome) => outcome.outcome === "preference-only")).length,
			acceptedPaletteIds: accepted.map((entry) => entry.paletteId).sort(),
			negativePaletteIds: negativeIds,
			currentPaletteId: current.paletteId,
			currentClassification: classification,
			currentAcceptedMatches: acceptedMatch.matches.map((match) => match.paletteId),
			currentNegativeMatches: negativeMatch.matches.map((match) => match.paletteId),
			conflictCount: (conflictsByArtwork.get(artworkId) ?? []).length,
		}
	}

	const artworks = [
		...reviewableFiles.map((file) => artworkReport(file, "reviewable-development")),
		...curatedFiles.map((file) => artworkReport(file, "curated-00")),
	]
	const cohortSummary = (cohort: "reviewable-development" | "curated-00") => {
		const entries = artworks.filter((artwork) => artwork.cohort === cohort)
		return {
			artworkCount: entries.length,
			withEvidence: entries.filter((entry) => entry.eventCount > 0).length,
			withMultiplePositivePalettes: entries.filter((entry) => entry.positivePaletteCount > 1).length,
			currentAccepted: entries.filter((entry) => entry.currentClassification === "accepted").length,
			currentRejected: entries.filter((entry) => entry.currentClassification === "rejected").length,
			currentConflicted: entries.filter((entry) => entry.currentClassification === "conflicted").length,
			currentUnknown: entries.filter((entry) => entry.currentClassification === "unknown").length,
		}
	}

	const outcomeCounts = { positive: 0, negative: 0, "preference-only": 0 }
	for (const event of ledger.events) for (const outcome of event.outcomes) outcomeCounts[outcome.outcome]++
	const report = {
		schemaVersion: ledger.schemaVersion,
		threshold: {
			version: ledger.thresholdVersion,
			roleOKLabDistanceInclusive: 0.025,
			gradientDecisionMustMatch: true,
		},
		coverage: {
			currentAlgorithmVersion: currentResults.algorithmVersion,
			reviewableDevelopment: cohortSummary("reviewable-development"),
			curated00: cohortSummary("curated-00"),
		},
		evidence: {
			paletteSnapshots: ledger.palettes.length,
			pairwiseRecordsRead: pairwiseRecordCount,
			absoluteRecordsRead: absoluteRecordCount,
			rawEventOccurrences: rawEvents.length,
			deduplicatedJudgmentEvents: ledger.events.length,
			outcomes: outcomeCounts,
			acceptedPaletteEntries: ledger.acceptedSet.length,
			carryEdges: ledger.carryEdges.length,
			conflicts: ledger.conflicts.length,
		},
		sources: [...sourceReports.values()].sort((first, second) => first.path.localeCompare(second.path)),
		unsupported,
		carryEdges: ledger.carryEdges,
		conflicts: ledger.conflicts,
		artworks,
	}
	return { ledger, report }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null
if (invokedPath === import.meta.url) {
	const { report } = await buildReviewEvidence()
	process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}
