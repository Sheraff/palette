import { createHash } from "node:crypto"
import { lstat, readFile, realpath } from "node:fs/promises"
import { basename, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import {
	buildReviewEvidence,
	pairwiseJudgmentEventId,
	reviewEvidenceInputPaths,
} from "../build-review-evidence.ts"
import {
	parseChromaticRoleReviewFeedbackStore,
	parseChromaticRoleReviewManifest,
} from "./chromatic-role-review.ts"
import {
	parseNextPaletteReviewFeedbackStore,
	parseNextPaletteReviewManifest,
} from "./next-palette-review.ts"
import {
	parseNextPaletteReviewFeedbackStore as parseNextPaletteReviewFeedbackStoreV2,
	parseNextPaletteReviewManifest as parseNextPaletteReviewManifestV2,
} from "./next-palette-review-v2.ts"
import {
	parsePaletteRole00AuditFeedbackStore,
	parsePaletteRole00AuditManifest,
} from "./palette-role-00-audit.ts"
import { parsePaletteRoleFeedbackStore, parsePaletteRoleManifest } from "./palette-role-review.ts"
import { stableArtworkId, type PalettePreference } from "./review-evidence.ts"

export const NATIVE_COMPLETE_PALETTE_EVIDENCE_VERSION =
	"native-complete-palette-evidence-inventory-0.1.0-development" as const
export const NATIVE_COMPLETE_PALETTE_EXPERIMENT_VERSION =
	"native-complete-palette-0.1.0-development" as const
export const NATIVE_COMPLETE_PALETTE_SUPPORT_THRESHOLD = 50

const hashPattern = /^[a-f0-9]{64}$/
const forbiddenSourceRoots = new Set(["10", "11", "12", "13", "14"])
const allowedSourceRoots = new Set([
	"music-artworks", "images", "00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "0a", "0b", "0c", "0d", "0e", "0f",
])
const qualityValues = [
	"positive", "negative", "strong", "acceptable-not-ideal", "weak-fallback", "unacceptable", "uncertain",
] as const
const polarityValues = ["positive", "negative", "uncertain"] as const
const pairwiseValues = [
	"first-preferred", "second-preferred", "tie", "both-similarly-valid", "neither-acceptable", "uncertain",
] as const
const evidenceClassValues = ["direct-fresh", "exact-transfer", "repeated-presentation"] as const
const sourceKindValues = [
	"accepted-legacy-review", "chromatic-complete-palette", "broad-next-palette-v2",
	"connected-family-complete-palette", "incumbent-accent-complete-palette", "joint-complete-palette",
	"native-resolution-complete-palette", "scale-aware-complete-palette", "palette-role-00-absolute",
	"counterexample-current-absolute",
] as const
const exclusionKinds = [
	"factorized-field-state", "pair-only", "multiplicity-only", "gradient-only", "comments-as-labels",
	"unsubmitted", "autonomous-unbound", "candidate-only", "ineligible-source", "non-exact-palette-carry",
] as const

export type AbsoluteQuality = typeof qualityValues[number]
export type AbsolutePolarity = typeof polarityValues[number]
export type PairwiseOutcome = typeof pairwiseValues[number]
export type EvidenceClass = typeof evidenceClassValues[number]
export type EvidenceSourceKind = typeof sourceKindValues[number]
export type ExclusionKind = typeof exclusionKinds[number]

export type AbsoluteOutcome = {
	treatmentId: string
	quality: AbsoluteQuality
	polarity: AbsolutePolarity
}

export type CompletePaletteEvidenceEvent = {
	id: string
	sourceKind: EvidenceSourceKind
	experimentId: string
	inputPaths: string[]
	sourcePath: string
	sourceSha256: string
	sourceGroupId: string
	artworkFamilyId: string
	treatmentIds: string[]
	comparisonId: string | null
	evidenceClass: EvidenceClass
	transferFromEventId: string | null
	observedAt: string | null
	absoluteOutcomes: AbsoluteOutcome[]
	pairwiseOutcome: PairwiseOutcome | null
	commentPresent: boolean
}

export type NativeCompletePaletteEvidenceInventory = {
	schemaVersion: 1
	experiment: {
		version: typeof NATIVE_COMPLETE_PALETTE_EXPERIMENT_VERSION
		evidenceVersion: typeof NATIVE_COMPLETE_PALETTE_EVIDENCE_VERSION
		experimentId: string
		phase: 1
		modelFitted: false
	}
	declarations: {
		humanEvidenceUnit: "complete-rendered-palette"
		readOnly: true
		comments: "counted-qualitative-context-only-no-content-or-label"
		groupingPolicy: {
			exactDeduplication: "encoded-source-sha256"
			artworkFamilies: "spotify-stable-artwork-id-when-present-otherwise-exact-source-sha256"
			perceptualNearDuplicates: "not-claimed-no-general-metadata"
			independentUnit: "connected-component-of-exact-source-and-stable-artwork-family-identities"
		}
		denominatorPolicy: {
			directFresh: "one-independent-source-group-maximum"
			exactTransfer: "reported-not-independent"
			repeatedPresentation: "reported-not-independent"
		}
		outcomeMapping: {
			positiveQuality: string[]
			negativeQuality: string[]
			uncertainQuality: string[]
			pairwiseModelEligible: string[]
			pairwiseModelExcluded: string[]
		}
		exclusionPolicy: { excludedKinds: ExclusionKind[]; commentsNeverLabels: true; candidateEvidenceNeverHumanEvidence: true }
		noReserveAccess: { forbiddenRoots: string[]; accessedRoots: string[]; declaration: string }
		limitations: string[]
	}
	provenance: {
		inputs: Array<{ path: string; sha256: string; role: "included-evidence" | "transfer-evidence" | "exclusion-evidence" }>
		implementation: Array<{ path: string; sha256: string; role: "parser" | "generator" }>
	}
	exactSources: Array<{
		sha256: string
		paths: string[]
		artworkFamilyIds: string[]
		eventIds: string[]
	}>
	sourceGroups: Array<{
		id: string
		exactSourceSha256s: string[]
		artworkFamilyIds: string[]
		paths: string[]
		eventIds: string[]
		perceptualGroupId: null
	}>
	events: CompletePaletteEvidenceEvent[]
	exclusions: Array<{
		kind: ExclusionKind
		status: "excluded"
		reason: string
		submittedEvents: number
		unsubmittedEvents: number
		inputPaths: string[]
	}>
	summary: {
		evidenceClasses: { total: number; directFresh: number; exactTransfer: number; repeatedPresentation: number }
		absolute: {
			ratings: { total: number; positive: number; negative: number; uncertain: number; byQuality: Record<AbsoluteQuality, number> }
			independentSourceGroups: { modelEligible: number; positive: number; negative: number; uncertain: number }
		}
		pairwise: {
			events: Record<PairwiseOutcome | "total" | "decisive", number>
			independentSourceGroups: Record<PairwiseOutcome | "modelEligible" | "decisive", number>
		}
		comments: { eventsWithQualitativeContext: number; contentRetained: false }
		sources: {
			exactEncodedSources: number
			independentSourceGroups: number
			artworkFamilies: number
			aliasPaths: number
			exactDuplicateGroups: number
			multiHashArtworkFamilies: number
		}
	}
	supportability: {
		minimumIndependentSourceGroups: 50
		absolute: { independentSourceGroups: number; supportable: boolean }
		pairwise: { independentSourceGroups: number; supportable: boolean }
		decision: "both-supportable" | "absolute-only" | "pairwise-only" | "neither-supportable"
	}
	reconciliation: {
		eventsEqualClassSum: true
		absoluteRatingsEqualPolaritySum: true
		pairwiseEventsEqualOutcomeSum: true
		allEventSourcesBound: true
		allEventGroupsBound: true
		transfersAndRepeatsExcludedFromIndependentDenominators: true
		commentsContainNoContent: true
		factorizedEventsIncluded: 0
		all: true
	}
}

type JsonRecord = Record<string, unknown>
type MutableEvent = Omit<CompletePaletteEvidenceEvent, "id" | "sourceGroupId" | "evidenceClass"> & {
	id?: string
	sourceGroupId?: string
	evidenceClass: EvidenceClass
}

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function exactKeys(value: JsonRecord, expected: readonly string[], label: string): void {
	const actual = Object.keys(value).sort()
	const wanted = [...expected].sort()
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
		throw new Error(`${label} has unexpected or missing fields`)
	}
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue)
	if (!isRecord(value)) return value
	return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
}

function canonicalSha256(value: unknown): string {
	return sha256(JSON.stringify(canonicalValue(value)))
}

function uniqueSorted(values: Iterable<string>): string[] {
	return [...new Set(values)].sort()
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function isNonnegativeInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) >= 0
}

function assertHash(value: unknown, label: string): asserts value is string {
	if (typeof value !== "string" || !hashPattern.test(value)) throw new Error(`${label} must be a SHA-256`)
}

function assertStringArray(value: unknown, label: string, allowEmpty = true): asserts value is string[] {
	if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((item) => typeof item !== "string") ||
		new Set(value).size !== value.length || value.some((item, index) => index > 0 && value[index - 1] >= item)) {
		throw new Error(`${label} must be a sorted unique string array`)
	}
}

function assertOrderedStringArray(value: unknown, label: string, allowEmpty = true): asserts value is string[] {
	if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((item) => typeof item !== "string")) {
		throw new Error(`${label} must be a string array`)
	}
}

function normalizeQuality(value: string): AbsoluteQuality {
	if (value === "acceptable") return "acceptable-not-ideal"
	if (value === "weak") return "weak-fallback"
	if (!qualityValues.includes(value as AbsoluteQuality)) throw new Error(`Unsupported absolute quality: ${value}`)
	return value as AbsoluteQuality
}

function qualityPolarity(quality: AbsoluteQuality): AbsolutePolarity {
	if (quality === "positive" || quality === "strong" || quality === "acceptable-not-ideal") return "positive"
	if (quality === "negative" || quality === "weak-fallback" || quality === "unacceptable") return "negative"
	return "uncertain"
}

function paletteTreatmentId(palette: { roles: Record<string, { rgb: readonly number[]; generated: boolean }>; gradient: { isGradient: boolean } }): string {
	return canonicalSha256({
		roles: Object.fromEntries(["background", "foreground", "surface", "accent"].map((role) => [role, {
			rgb: palette.roles[role].rgb,
			generated: palette.roles[role].generated,
		}])),
		gradient: palette.gradient.isGradient,
	})
}

function legacyTreatmentId(paletteId: string): string {
	return sha256(`legacy-semantic-palette\0${paletteId}`)
}

function comparisonId(sourceSha256: string, treatmentIds: readonly string[], presentationVersion: string): string {
	return canonicalSha256({ sourceSha256, treatmentIds: [...treatmentIds], presentationVersion })
}

function artworkFamilyId(path: string, sourceSha256: string): string {
	const match = /^ab67616d[0-9a-f]{8}([0-9a-f]+)(?:\.[^.]+)?$/i.exec(basename(path))
	return match ? `spotify:${match[1].toLowerCase()}` : `exact:${sourceSha256}`
}

function sourcePathForLegacy(file: string): string {
	return file.includes("/") ? file : `images/${file}`
}

function eventIdentity(event: MutableEvent): string {
	return canonicalSha256({
		sourceKind: event.sourceKind,
		experimentId: event.experimentId,
		inputPaths: event.inputPaths,
		sourcePath: event.sourcePath,
		sourceSha256: event.sourceSha256,
		artworkFamilyId: event.artworkFamilyId,
		treatmentIds: event.treatmentIds,
		comparisonId: event.comparisonId,
		evidenceClass: event.evidenceClass,
		transferFromEventId: event.transferFromEventId,
		observedAt: event.observedAt,
		absoluteOutcomes: event.absoluteOutcomes,
		pairwiseOutcome: event.pairwiseOutcome,
		commentPresent: event.commentPresent,
	})
}

function pairwiseFromPreference(
	preference: PalettePreference,
	outcomes: readonly AbsoluteOutcome[],
): { treatmentIds: string[]; outcome: PairwiseOutcome } {
	if (preference.kind === "neither") {
		return { treatmentIds: outcomes.map((outcome) => outcome.treatmentId), outcome: "neither-acceptable" }
	}
	if (outcomes.length === 2 && outcomes.every((outcome) => outcome.polarity === "negative")) {
		return { treatmentIds: outcomes.map((outcome) => outcome.treatmentId), outcome: "neither-acceptable" }
	}
	if (preference.kind === "tie") {
		return {
			treatmentIds: outcomes.map((outcome) => outcome.treatmentId),
			outcome: outcomes.length === 2 && outcomes.every((outcome) => outcome.polarity === "positive")
				? "both-similarly-valid" : "tie",
		}
	}
	if (preference.kind !== "preferred") throw new Error(`Unsupported legacy preference kind: ${preference.kind}`)
	return {
		treatmentIds: [legacyTreatmentId(preference.preferredPaletteId), legacyTreatmentId(preference.otherPaletteId)],
		outcome: "first-preferred",
	}
}

export function supportabilityDecision(absoluteGroups: number, pairwiseGroups: number): NativeCompletePaletteEvidenceInventory["supportability"] {
	if (!isNonnegativeInteger(absoluteGroups) || !isNonnegativeInteger(pairwiseGroups)) {
		throw new Error("Supportability group counts must be nonnegative integers")
	}
	const absolute = absoluteGroups >= NATIVE_COMPLETE_PALETTE_SUPPORT_THRESHOLD
	const pairwise = pairwiseGroups >= NATIVE_COMPLETE_PALETTE_SUPPORT_THRESHOLD
	return {
		minimumIndependentSourceGroups: 50,
		absolute: { independentSourceGroups: absoluteGroups, supportable: absolute },
		pairwise: { independentSourceGroups: pairwiseGroups, supportable: pairwise },
		decision: absolute && pairwise ? "both-supportable" : absolute ? "absolute-only" : pairwise ? "pairwise-only" : "neither-supportable",
	}
}

const chromaticReviews = [
	["research/data/experiments/chromatic-role-0.1.0-poc.1-review/manifest.json", "research/data/experiments/chromatic-role-0.1.0-poc.1-review/feedback.json"],
	["research/data/experiments/chromatic-role-0.1.0-poc.2-review/manifest.json", "research/data/experiments/chromatic-role-0.1.0-poc.2-review/feedback.json"],
	["research/data/experiments/chromatic-role-reserve-validation-0.1.1-08/review/manifest.json", "research/data/experiments/chromatic-role-reserve-validation-0.1.1-08/review/feedback.json"],
	...(["09", "0a", "0b", "0c", "0d", "0e", "0f"] as const).map((root, index) => {
		const version = `0.${index + 2}.0-${root}`
		const base = `research/data/experiments/chromatic-role-reserve-validation-${version}`
		return [`${base}/review-manifest.json`, `${base}/review-feedback.json`]
	}),
] as const

const genericReviews: ReadonlyArray<{
	manifest: string
	feedback: string
	kind: EvidenceSourceKind
	parser: "v1" | "v2"
}> = [
	...[1, 2].map((batch) => ({
		manifest: `research/data/experiments/next-palette-0.1.0-development/review-v2/batch-0${batch}-manifest.json`,
		feedback: `research/data/experiments/next-palette-0.1.0-development/review-v2/batch-0${batch}-feedback.json`,
		kind: "broad-next-palette-v2" as const,
		parser: "v1" as const,
	})),
	{
		manifest: "research/data/experiments/next-palette-0.4.0-connected-family-development/review-v1/batch-01-manifest.json",
		feedback: "research/data/experiments/next-palette-0.4.0-connected-family-development/review-v1/batch-01-feedback.json",
		kind: "connected-family-complete-palette",
		parser: "v1",
	},
	...[1, 2].map((batch) => ({
		manifest: `research/data/experiments/next-palette-incumbent-accent-0.1.0-development/review-v1/batch-0${batch}-manifest.json`,
		feedback: `research/data/experiments/next-palette-incumbent-accent-0.1.0-development/review-v1/batch-0${batch}-feedback.json`,
		kind: "incumbent-accent-complete-palette" as const,
		parser: "v1" as const,
	})),
	...["joint-palette-field-tradeoff-0.1.1-development", "joint-palette-field-dominance-first-0.1.0-development",
		"joint-palette-threshold-free-collapse-0.1.0-development",
		"joint-palette-ablation-stable-noncollapsed-field-0.1.0-development",
		"joint-palette-compact-relation-dominance-review-transfer-audit-0.1.0-development"].map((experiment) => ({
		manifest: `research/data/experiments/${experiment}/review-v2/batch-01-manifest.json`,
		feedback: `research/data/experiments/${experiment}/review-v2/batch-01-feedback.json`,
		kind: "joint-complete-palette" as const,
		parser: "v2" as const,
	})),
]

const implementationPaths = [
	"research/src/native-complete-palette-evidence.ts",
	"research/inventory-native-complete-palette-evidence.ts",
	"research/src/review-evidence.ts",
	"research/build-review-evidence.ts",
	"research/src/chromatic-role-review.ts",
	"research/src/next-palette-review.ts",
	"research/src/next-palette-review-v2.ts",
	"research/src/palette-role-00-audit.ts",
	"research/src/palette-role-review.ts",
] as const

export async function buildNativeCompletePaletteEvidenceInventory(
	projectRoot = fileURLToPath(new URL("../..", import.meta.url)),
): Promise<NativeCompletePaletteEvidenceInventory> {
	const rootRealPath = await realpath(projectRoot)
	const inputMap = new Map<string, { path: string; sha256: string; role: "included-evidence" | "transfer-evidence" | "exclusion-evidence"; value: unknown }>()
	const readInput = async (path: string, role: "included-evidence" | "transfer-evidence" | "exclusion-evidence" = "included-evidence") => {
		if (path.split("/").some((segment, index, all) => forbiddenSourceRoots.has(segment) && all[index - 1] !== "rounds")) {
			throw new Error(`Refusing forbidden reserve-root input path: ${path}`)
		}
		const current = inputMap.get(path)
		if (current) return current.value
		const absolute = resolve(projectRoot, path)
		const stats = await lstat(absolute)
		if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`Evidence input must be a regular non-symbolic file: ${path}`)
		const raw = await readFile(absolute)
		const value = JSON.parse(raw.toString("utf8")) as unknown
		inputMap.set(path, { path, sha256: sha256(raw), role, value })
		return value
	}

	const events: MutableEvent[] = []
	const reviewEventByCaseId = new Map<string, MutableEvent>()
	const sourceBytes = new Map<string, { path: string; sha256: string }>()
	const verifySource = async (path: string, expectedSha256: string): Promise<void> => {
		assertHash(expectedSha256, `Source ${path}`)
		if (path.includes("\\") || path.includes("..") || path.startsWith("/") || path.split("/").length < 2) {
			throw new Error(`Source path is not a safe project-relative path: ${path}`)
		}
		const sourceRoot = path.split("/", 1)[0]
		if (forbiddenSourceRoots.has(sourceRoot) || !allowedSourceRoots.has(sourceRoot)) {
			throw new Error(`Source root is not exposed for this inventory: ${sourceRoot}`)
		}
		const key = `${path}\0${expectedSha256}`
		if (sourceBytes.has(key)) return
		const absolute = resolve(projectRoot, path)
		const resolved = await realpath(absolute)
		if (resolved !== `${rootRealPath}${sep}${path.split("/").join(sep)}`) throw new Error(`Source path is indirect: ${path}`)
		const stats = await lstat(absolute)
		if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`Source must be a regular non-symbolic file: ${path}`)
		const actual = sha256(await readFile(absolute))
		if (actual !== expectedSha256) throw new Error(`Source SHA-256 changed: ${path}`)
		sourceBytes.set(key, { path, sha256: actual })
	}

	const pushEvent = async (event: MutableEvent): Promise<MutableEvent> => {
		event.inputPaths = uniqueSorted(event.inputPaths)
		event.treatmentIds = [...event.treatmentIds]
		await verifySource(event.sourcePath, event.sourceSha256)
		if (event.artworkFamilyId !== artworkFamilyId(event.sourcePath, event.sourceSha256)) {
			throw new Error(`Artwork family identity is stale for ${event.sourcePath}`)
		}
		event.id = eventIdentity(event)
		events.push(event)
		return event
	}

	// The legacy builder is intentionally reused: it validates only the explicit accepted-round allowlist and deduplicates copied stores.
	for (const path of reviewEvidenceInputPaths) await readInput(`research/${path}`)
	const legacy = await buildReviewEvidence(resolve(projectRoot, "research"))
	const filesByArtwork = new Map<string, string>()
	for (const palette of legacy.ledger.palettes) {
		const prior = filesByArtwork.get(palette.artworkId)
		if (prior && prior !== palette.file) throw new Error(`Legacy artwork maps to multiple source paths: ${palette.artworkId}`)
		filesByArtwork.set(palette.artworkId, palette.file)
	}
	const legacyComments = new Map<string, boolean>()
	const inspectLegacyStore = (value: unknown): void => {
		if (!isRecord(value)) return
		const inspectPairwise = (store: unknown): void => {
			if (!isRecord(store) || !Array.isArray(store.entries)) return
			for (const entry of store.entries) {
				if (!isRecord(entry) || typeof entry.image !== "string" || typeof entry.timestamp !== "string") continue
				const id = pairwiseJudgmentEventId(stableArtworkId(entry.image), entry.timestamp, entry.id)
				legacyComments.set(id, legacyComments.get(id) === true || (typeof entry.note === "string" && entry.note.trim().length > 0))
			}
		}
		const inspectAbsolute = (store: unknown): void => {
			if (!isRecord(store) || !Array.isArray(store.entries)) return
			for (const entry of store.entries) {
				if (!isRecord(entry) || typeof entry.image !== "string" || typeof entry.decidedAt !== "string") continue
				const id = `judgment:v1|${stableArtworkId(entry.image)}|${entry.decidedAt}`
				legacyComments.set(id, legacyComments.get(id) === true || (typeof entry.note === "string" && entry.note.trim().length > 0))
			}
		}
		inspectPairwise(value)
		inspectAbsolute(value)
		inspectPairwise(value.feedback)
		inspectAbsolute(value.absoluteFeedback)
		if (isRecord(value.reviewProvenance)) inspectPairwise(value.reviewProvenance.feedback)
	}
	for (const input of inputMap.values()) if (input.path.startsWith("research/data/") &&
		(reviewEvidenceInputPaths.includes(input.path.slice("research/".length)))) inspectLegacyStore(input.value)
	const legacyEventIdMap = new Map<string, string>()
	for (const event of legacy.ledger.events) {
		const file = filesByArtwork.get(event.artworkId)
		if (!file) throw new Error(`Legacy event source is unresolved: ${event.id}`)
		const sourcePath = sourcePathForLegacy(file)
		const raw = await readFile(resolve(projectRoot, sourcePath))
		const sourceSha256 = sha256(raw)
		const absoluteOutcomes = event.outcomes
			.filter((outcome) => outcome.outcome !== "preference-only")
			.map((outcome) => {
				const quality = outcome.outcome as "positive" | "negative"
				return { treatmentId: legacyTreatmentId(outcome.paletteId), quality, polarity: quality } satisfies AbsoluteOutcome
			})
		let treatmentIds = event.outcomes.map((outcome) => legacyTreatmentId(outcome.paletteId))
		let pairwiseOutcome: PairwiseOutcome | null = null
		if (event.preference) {
			const pairwise = pairwiseFromPreference(event.preference, absoluteOutcomes)
			treatmentIds = pairwise.treatmentIds
			pairwiseOutcome = pairwise.outcome
		}
		if (treatmentIds.length === 0) treatmentIds = absoluteOutcomes.map((outcome) => outcome.treatmentId)
		if (treatmentIds.length === 0) continue
		const inputPaths = event.sources.map((source) => `research/${source.split("#", 1)[0]}`)
		const inserted = await pushEvent({
			sourceKind: "accepted-legacy-review",
			experimentId: "accepted-legacy-review-evidence-ledger-v1",
			inputPaths,
			sourcePath,
			sourceSha256,
			artworkFamilyId: artworkFamilyId(sourcePath, sourceSha256),
			treatmentIds,
			comparisonId: pairwiseOutcome ? comparisonId(sourceSha256, treatmentIds, "legacy-review-presentation") : null,
			evidenceClass: "direct-fresh",
			transferFromEventId: null,
			observedAt: event.observedAt,
			absoluteOutcomes,
			pairwiseOutcome,
			commentPresent: legacyComments.get(event.id) === true,
		})
		legacyEventIdMap.set(event.id, inserted.id!)
	}
	const legacyExactTransfers: MutableEvent[] = []
	let approximateLegacyCarries = 0
	for (const edge of legacy.ledger.carryEdges) {
		if (!edge.exactSemanticMatch) {
			approximateLegacyCarries++
			continue
		}
		for (const originalId of edge.eventIds) {
			const original = events.find((event) => event.id === legacyEventIdMap.get(originalId))
			if (!original) continue
			const quality = original.absoluteOutcomes.find((outcome) =>
				outcome.treatmentId === legacyTreatmentId(edge.fromPaletteId))
			if (!quality) continue
			const treatmentId = legacyTreatmentId(edge.toPaletteId)
			legacyExactTransfers.push({
				sourceKind: original.sourceKind,
				experimentId: "accepted-legacy-exact-semantic-carry-v1",
				inputPaths: original.inputPaths,
				sourcePath: original.sourcePath,
				sourceSha256: original.sourceSha256,
				artworkFamilyId: original.artworkFamilyId,
				treatmentIds: [treatmentId],
				comparisonId: null,
				evidenceClass: "exact-transfer",
				transferFromEventId: original.id!,
				observedAt: null,
				absoluteOutcomes: [{ ...quality, treatmentId }],
				pairwiseOutcome: null,
				commentPresent: false,
			})
		}
	}
	for (const transfer of legacyExactTransfers) await pushEvent(transfer)

	for (const [manifestPath, feedbackPath] of chromaticReviews) {
		const manifest = parseChromaticRoleReviewManifest(await readInput(manifestPath))
		const feedback = parseChromaticRoleReviewFeedbackStore(await readInput(feedbackPath), manifest)
		const feedbackByCase = new Map(feedback.entries.map((entry) => [entry.caseId, entry]))
		for (const entry of manifest.entries) {
			const judgment = feedbackByCase.get(entry.caseId)
			if (!judgment || judgment.sourceEligibility !== "eligible-artwork") continue
			const first = paletteTreatmentId(entry.options.A)
			const second = paletteTreatmentId(entry.options.B)
			const absoluteOutcomes = [
				{ treatmentId: first, quality: normalizeQuality(judgment.qualityA!), polarity: qualityPolarity(normalizeQuality(judgment.qualityA!)) },
				{ treatmentId: second, quality: normalizeQuality(judgment.qualityB!), polarity: qualityPolarity(normalizeQuality(judgment.qualityB!)) },
			]
			const pairwiseOutcome = judgment.preference === "a-stronger" ? "first-preferred" :
				judgment.preference === "b-stronger" ? "second-preferred" : judgment.preference!
			const inserted = await pushEvent({
				sourceKind: "chromatic-complete-palette",
				experimentId: manifest.candidateAlgorithmVersion,
				inputPaths: [manifestPath, feedbackPath],
				sourcePath: entry.source.file,
				sourceSha256: entry.source.sha256,
				artworkFamilyId: artworkFamilyId(entry.source.file, entry.source.sha256),
				treatmentIds: [first, second],
				comparisonId: comparisonId(entry.source.sha256, [first, second], manifest.presentationVersion),
				evidenceClass: "direct-fresh",
				transferFromEventId: null,
				observedAt: judgment.submittedAt,
				absoluteOutcomes,
				pairwiseOutcome,
				commentPresent: judgment.note.length > 0,
			})
			reviewEventByCaseId.set(entry.caseId, inserted)
		}
	}

	for (const spec of genericReviews) {
		const manifestValue = await readInput(spec.manifest)
		const feedbackValue = await readInput(spec.feedback)
		const manifest = spec.parser === "v2" ? parseNextPaletteReviewManifestV2(manifestValue) : parseNextPaletteReviewManifest(manifestValue)
		const feedback = spec.parser === "v2"
			? parseNextPaletteReviewFeedbackStoreV2(feedbackValue, manifest as never)
			: parseNextPaletteReviewFeedbackStore(feedbackValue, manifest as never)
		const feedbackByCase = new Map(feedback.entries.map((entry) => [entry.caseId, entry]))
		for (const entry of manifest.entries) {
			const judgment = feedbackByCase.get(entry.caseId)
			if (!judgment || judgment.sourceEligibility !== "eligible-artwork") continue
			const baselineOption = entry.assignment.A === "baseline" ? "A" : "B"
			const candidateOption = baselineOption === "A" ? "B" : "A"
			const optionTreatment = { A: paletteTreatmentId(entry.options.A), B: paletteTreatmentId(entry.options.B) }
			const treatmentIds = [optionTreatment[baselineOption], optionTreatment[candidateOption]]
			const qualities = {
				A: normalizeQuality(judgment.qualityA!),
				B: normalizeQuality(judgment.qualityB!),
			}
			const absoluteOutcomes = [baselineOption, candidateOption].map((option) => ({
				treatmentId: optionTreatment[option],
				quality: qualities[option],
				polarity: qualityPolarity(qualities[option]),
			}))
			const pairwiseOutcome = judgment.preference === "both-similarly-valid" ||
				judgment.preference === "neither-acceptable" || judgment.preference === "uncertain"
				? judgment.preference
				: (judgment.preference === "a-stronger" ? "A" : "B") === baselineOption
					? "first-preferred" : "second-preferred"
			const inserted = await pushEvent({
				sourceKind: spec.kind,
				experimentId: manifest.experimentId,
				inputPaths: [spec.manifest, spec.feedback],
				sourcePath: entry.source.file,
				sourceSha256: entry.source.sha256,
				artworkFamilyId: artworkFamilyId(entry.source.file, entry.source.sha256),
				treatmentIds,
				comparisonId: comparisonId(entry.source.sha256, treatmentIds, manifest.presentationVersion),
				evidenceClass: "direct-fresh",
				transferFromEventId: null,
				observedAt: judgment.submittedAt,
				absoluteOutcomes,
				pairwiseOutcome,
				commentPresent: judgment.note.length > 0,
			})
			reviewEventByCaseId.set(entry.caseId, inserted)
		}
	}

	const ingestNativeReview = async (options: {
		manifestPath: string
		feedbackPath: string
		kind: "native-resolution-complete-palette" | "scale-aware-complete-palette"
	}) => {
		const manifest = await readInput(options.manifestPath) as JsonRecord
		const feedback = await readInput(options.feedbackPath) as JsonRecord
		if (!isRecord(manifest) || !isRecord(feedback) || typeof manifest.experimentId !== "string" ||
			manifest.experimentId !== feedback.experimentId || typeof manifest.reviewIdentity !== "string" ||
			manifest.reviewIdentity !== feedback.reviewIdentity || manifest.presentationVersion !== feedback.presentationVersion ||
			!Array.isArray(manifest.entries) || !Array.isArray(feedback.entries)) throw new Error("Native complete review header is invalid")
		const byFile = new Map(manifest.entries.map((entry) => {
			if (!isRecord(entry) || typeof entry.file !== "string") throw new Error("Native review manifest entry is invalid")
			return [entry.file, entry]
		}))
		const feedbackById = new Map<string, MutableEvent>()
		for (const value of feedback.entries) {
			if (!isRecord(value) || typeof value.image !== "string" || typeof value.sourceSha256 !== "string" ||
				typeof value.pairSha256 !== "string" || typeof value.preference !== "string" || typeof value.ship !== "string" ||
				typeof value.id !== "string" || typeof value.timestamp !== "string" || typeof value.note !== "string") {
				throw new Error("Native review feedback entry is invalid")
			}
			const entry = byFile.get(value.image)
			if (!entry || entry.sourceSha256 !== value.sourceSha256 || entry.pairSha256 !== value.pairSha256 ||
				typeof entry.sourceRelativePath !== "string" || (entry.left !== "baseline" && entry.left !== "canonical" && entry.left !== "treatment") ||
				(entry.right !== "baseline" && entry.right !== "canonical" && entry.right !== "treatment")) {
				throw new Error(`Native review feedback provenance is invalid for ${value.image}`)
			}
			const firstIdentity = entry.left === "treatment" ? "treatment" : "canonical"
			const secondIdentity = entry.right === "treatment" ? "treatment" : "canonical"
			const identities = [firstIdentity, secondIdentity]
			const treatmentIds = identities.map((identity) => sha256(`native-pair\0${value.pairSha256}\0${identity}`))
			const shippable = (identity: string): boolean => value.ship === "both" || (value.ship !== "neither" &&
				identities[value.ship === "left" ? 0 : 1] === identity)
			const absoluteOutcomes = identities.map((identity, index) => {
				const quality = shippable(identity) ? "positive" : "negative"
				return { treatmentId: treatmentIds[index], quality, polarity: quality } as AbsoluteOutcome
			})
			const pairwiseOutcome: PairwiseOutcome = value.ship === "neither" ? "neither-acceptable" :
				value.preference === "tie" ? (value.ship === "both" ? "both-similarly-valid" : "tie") :
				value.preference === "left" ? "first-preferred" : "second-preferred"
			const event = await pushEvent({
				sourceKind: options.kind,
				experimentId: manifest.experimentId,
				inputPaths: [options.manifestPath, options.feedbackPath],
				sourcePath: entry.sourceRelativePath,
				sourceSha256: value.sourceSha256,
				artworkFamilyId: artworkFamilyId(entry.sourceRelativePath, value.sourceSha256),
				treatmentIds,
				comparisonId: value.pairSha256,
				evidenceClass: "direct-fresh",
				transferFromEventId: null,
				observedAt: value.timestamp,
				absoluteOutcomes,
				pairwiseOutcome,
				commentPresent: value.note.trim().length > 0,
			})
			feedbackById.set(value.id, event)
		}
		if (manifest.queueCount !== feedback.entries.length) throw new Error("Native review feedback coverage is incomplete")
		if (Array.isArray(manifest.carried)) {
			for (const carry of manifest.carried) {
				if (!isRecord(carry) || typeof carry.file !== "string" || typeof carry.sourceSha256 !== "string" ||
					typeof carry.priorFeedbackId !== "string" || typeof carry.priorPairSha256 !== "string" ||
					typeof carry.preference !== "string" || typeof carry.canonicalShippable !== "boolean" ||
					typeof carry.treatmentShippable !== "boolean") throw new Error("Native carry entry is invalid")
				const original = feedbackById.get(carry.priorFeedbackId) ?? events.find((event) =>
					event.sourceSha256 === carry.sourceSha256 && event.comparisonId === carry.priorPairSha256)
				if (!original) throw new Error(`Native carry origin is unavailable: ${carry.priorFeedbackId}`)
				const treatmentIds = ["canonical", "treatment"].map((identity) =>
					sha256(`native-pair\0${carry.priorPairSha256}\0${identity}`))
				const qualities: AbsoluteQuality[] = [carry.canonicalShippable ? "positive" : "negative",
					carry.treatmentShippable ? "positive" : "negative"]
				await pushEvent({
					sourceKind: options.kind,
					experimentId: manifest.experimentId,
					inputPaths: [options.manifestPath, options.feedbackPath],
					sourcePath: original.sourcePath,
					sourceSha256: carry.sourceSha256,
					artworkFamilyId: artworkFamilyId(original.sourcePath, carry.sourceSha256),
					treatmentIds,
					comparisonId: carry.priorPairSha256,
					evidenceClass: "exact-transfer",
					transferFromEventId: original.id!,
					observedAt: null,
					absoluteOutcomes: qualities.map((quality, index) => ({ treatmentId: treatmentIds[index], quality, polarity: qualityPolarity(quality) })),
					pairwiseOutcome: carry.preference === "canonical" ? "first-preferred" :
						carry.preference === "treatment" ? "second-preferred" : "both-similarly-valid",
					commentPresent: false,
				})
			}
		}
	}
	await ingestNativeReview({
		manifestPath: "research/data/experiments/region-graph-0.19.0-native-resolution-0.1.1-development/review-manifest.json",
		feedbackPath: "research/data/native-resolution-review-feedback.json",
		kind: "native-resolution-complete-palette",
	})
	await ingestNativeReview({
		manifestPath: "research/data/experiments/region-graph-0.19.0-scale-aware-native-0.2.1-development/review-manifest.json",
		feedbackPath: "research/data/scale-aware-native-review-feedback.json",
		kind: "scale-aware-complete-palette",
	})

	const auditManifestPath = "research/data/experiments/palette-role-00-audit-0.2.0-development/manifest.json"
	const auditFeedbackPath = "research/data/experiments/palette-role-00-audit-0.2.0-development/feedback.json"
	const auditManifest = parsePaletteRole00AuditManifest(await readInput(auditManifestPath))
	const auditFeedback = parsePaletteRole00AuditFeedbackStore(await readInput(auditFeedbackPath), auditManifest)
	const auditByCase = new Map(auditManifest.entries.map((entry) => [entry.caseId, entry]))
	for (const judgment of auditFeedback.entries) {
		if (!judgment.overallQuality) continue
		const entry = auditByCase.get(judgment.caseId)!
		const treatmentId = paletteTreatmentId(entry.palette)
		const quality = normalizeQuality(judgment.overallQuality)
		await pushEvent({
			sourceKind: "palette-role-00-absolute",
			experimentId: auditManifest.auditVersion,
			inputPaths: [auditManifestPath, auditFeedbackPath],
			sourcePath: entry.source.file,
			sourceSha256: entry.source.sha256,
			artworkFamilyId: artworkFamilyId(entry.source.file, entry.source.sha256),
			treatmentIds: [treatmentId],
			comparisonId: null,
			evidenceClass: "direct-fresh",
			transferFromEventId: null,
			observedAt: judgment.submittedAt,
			absoluteOutcomes: [{ treatmentId, quality, polarity: qualityPolarity(quality) }],
			pairwiseOutcome: null,
			commentPresent: judgment.comment.length > 0,
		})
	}

	const counterManifestPath = "research/data/experiments/palette-role-counterexample-0.2.0-development/manifest.json"
	const counterFeedbackPath = "research/data/experiments/palette-role-counterexample-0.2.0-development/feedback.json"
	const counterManifest = parsePaletteRoleManifest(await readInput(counterManifestPath))
	const counterFeedback = parsePaletteRoleFeedbackStore(await readInput(counterFeedbackPath), counterManifest)
	const counterByCase = new Map(counterManifest.entries.map((entry) => [entry.caseId, entry]))
	for (const judgment of counterFeedback.entries) {
		if (judgment.sourceEligibility !== "eligible-artwork" || !judgment.currentQuality) continue
		const entry = counterByCase.get(judgment.caseId)!
		const treatmentId = paletteTreatmentId(entry.current)
		const quality = normalizeQuality(judgment.currentQuality)
		await pushEvent({
			sourceKind: "counterexample-current-absolute",
			experimentId: counterManifest.reviewVersion,
			inputPaths: [counterManifestPath, counterFeedbackPath],
			sourcePath: entry.source.file,
			sourceSha256: entry.source.sha256,
			artworkFamilyId: artworkFamilyId(entry.source.file, entry.source.sha256),
			treatmentIds: [treatmentId],
			comparisonId: null,
			evidenceClass: "direct-fresh",
			transferFromEventId: null,
			observedAt: judgment.submittedAt,
			absoluteOutcomes: [{ treatmentId, quality, polarity: qualityPolarity(quality) }],
			pairwiseOutcome: null,
			commentPresent: judgment.note.length > 0,
		})
	}

	// Bind declared exact transfer artifacts. Their target presentations are not recounted as fresh judgments.
	const transferSpecs = [
		{
			path: "research/data/experiments/joint-palette-threshold-free-collapse-0.1.0-development/review-transfer.json",
			experimentId: "joint-palette-threshold-free-collapse-0.1.0-development",
		},
		{
			path: "research/data/experiments/joint-palette-compact-relation-dominance-review-transfer-audit-0.1.0-development/transfer.json",
			experimentId: "joint-palette-compact-relation-dominance-0.1.0-development",
		},
	] as const
	for (const spec of transferSpecs) {
		const value = await readInput(spec.path, "transfer-evidence")
		if (!isRecord(value) || !Array.isArray(value.entries)) throw new Error(`Exact transfer artifact is invalid: ${spec.path}`)
		for (const entry of value.entries) {
			if (!isRecord(entry) || typeof entry.file !== "string" || typeof entry.sourceSha256 !== "string" ||
				typeof entry.candidateQuality !== "string" || typeof entry.comparison !== "string") {
				throw new Error(`Exact transfer entry is invalid: ${spec.path}`)
			}
			const sourcePath = entry.file.includes("/") ? entry.file : `images/${entry.file}`
			const candidateQuality = normalizeQuality(entry.candidateQuality)
			const comparison = entry.comparison === "candidate-stronger" ? "second-preferred" :
				entry.comparison === "baseline-stronger" ? "first-preferred" : entry.comparison as PairwiseOutcome
			const original = typeof entry.priorCaseId === "string" ? reviewEventByCaseId.get(entry.priorCaseId) :
				[...events].reverse().find((event) => event.sourceKind === "joint-complete-palette" &&
					event.sourceSha256 === entry.sourceSha256 && event.evidenceClass === "direct-fresh" &&
					event.pairwiseOutcome === comparison && event.absoluteOutcomes[1]?.quality === candidateQuality)
			if (!original) throw new Error(`Exact transfer origin is unavailable for ${entry.file}`)
			const baselineQuality = typeof entry.baselineQuality === "string" ? normalizeQuality(entry.baselineQuality) : "unacceptable"
			if (original.treatmentIds.length !== 2 || original.absoluteOutcomes[0]?.quality !== baselineQuality ||
				original.absoluteOutcomes[1]?.quality !== candidateQuality || original.pairwiseOutcome !== comparison) {
				throw new Error(`Exact transfer outcome identity changed for ${entry.file}`)
			}
			await pushEvent({
				sourceKind: "joint-complete-palette",
				experimentId: spec.experimentId,
				inputPaths: [spec.path],
				sourcePath,
				sourceSha256: entry.sourceSha256,
				artworkFamilyId: artworkFamilyId(sourcePath, entry.sourceSha256),
				treatmentIds: [...original.treatmentIds],
				comparisonId: original.comparisonId,
				evidenceClass: "exact-transfer",
				transferFromEventId: original.id!,
				observedAt: null,
				absoluteOutcomes: original.absoluteOutcomes.map((outcome) => ({ ...outcome })),
				pairwiseOutcome: comparison,
				commentPresent: false,
			})
		}
	}

	const broadPlanPath = "research/data/experiments/next-palette-0.1.0-development/review-v2/plan.json"
	const broadPlan = await readInput(broadPlanPath, "transfer-evidence")
	if (!isRecord(broadPlan) || !Array.isArray(broadPlan.duplicateCarryEdges)) throw new Error("Broad review duplicate plan is invalid")
	for (const edge of broadPlan.duplicateCarryEdges) {
		if (!isRecord(edge) || typeof edge.representativeFile !== "string" || typeof edge.duplicateFile !== "string" ||
			typeof edge.sourceSha256 !== "string") throw new Error("Broad review duplicate carry edge is invalid")
		const original = events.find((event) => event.sourceKind === "broad-next-palette-v2" &&
			event.sourcePath === edge.representativeFile && event.sourceSha256 === edge.sourceSha256)
		if (!original) throw new Error("Broad review duplicate carry origin is unavailable")
		await pushEvent({
			...original,
			id: undefined,
			sourcePath: edge.duplicateFile,
			artworkFamilyId: artworkFamilyId(edge.duplicateFile, edge.sourceSha256),
			inputPaths: [...original.inputPaths, broadPlanPath],
			evidenceClass: "exact-transfer",
			transferFromEventId: original.id!,
			observedAt: null,
			commentPresent: false,
		})
	}

	const chromaticCarryPath = "research/data/experiments/chromatic-role-0.1.0-poc.3-carry/analysis.json"
	const chromaticCarry = await readInput(chromaticCarryPath, "exclusion-evidence")
	if (!isRecord(chromaticCarry) || !Array.isArray(chromaticCarry.entries)) throw new Error("Chromatic carry analysis is invalid")
	const factorizedPath = "research/data/factorized-field-state-analysis.json"
	const controlledStopPath = "research/data/experiments/controlled-field-state-supervision-0.1.0-development/review-v1/batch-01-partial-stop-analysis.json"
	await readInput(factorizedPath, "exclusion-evidence")
	await readInput(controlledStopPath, "exclusion-evidence")
	for (const batch of [3, 4]) {
		await readInput(`research/data/experiments/next-palette-0.1.0-development/review-v2/batch-0${batch}-manifest.json`, "exclusion-evidence")
	}

	// Later exact re-presentations remain useful consistency evidence but cannot create an independent denominator.
	const directByPresentation = new Map<string, MutableEvent>()
	for (const event of [...events].sort((first, second) => compareAscii(first.observedAt ?? "", second.observedAt ?? "") ||
		compareAscii(first.id!, second.id!))) {
		if (event.evidenceClass !== "direct-fresh") continue
		const key = event.comparisonId ?? canonicalSha256({ sourceSha256: event.sourceSha256, treatmentIds: event.treatmentIds })
		const prior = directByPresentation.get(key)
		if (!prior) directByPresentation.set(key, event)
		else {
			event.evidenceClass = "repeated-presentation"
			event.transferFromEventId = prior.id!
			event.id = eventIdentity(event)
		}
	}
	const uniqueEvents = [...new Map(events.map((event) => [event.id!, event])).values()]
	events.splice(0, events.length, ...uniqueEvents)

	// Union exact byte identities and stable artwork-family identities without inventing perceptual groups.
	const sourceRecords = new Map<string, { paths: Set<string>; families: Set<string>; eventIds: Set<string> }>()
	for (const event of events) {
		let record = sourceRecords.get(event.sourceSha256)
		if (!record) sourceRecords.set(event.sourceSha256, record = { paths: new Set(), families: new Set(), eventIds: new Set() })
		record.paths.add(event.sourcePath)
		record.families.add(event.artworkFamilyId)
		record.eventIds.add(event.id!)
	}
	const parent = new Map<string, string>()
	const find = (value: string): string => {
		const current = parent.get(value) ?? value
		if (current === value) return value
		const root = find(current)
		parent.set(value, root)
		return root
	}
	const union = (first: string, second: string): void => {
		const left = find(first)
		const right = find(second)
		if (left !== right) parent.set(left < right ? right : left, left < right ? left : right)
	}
	for (const [sourceSha256, record] of sourceRecords) {
		parent.set(`sha:${sourceSha256}`, `sha:${sourceSha256}`)
		for (const family of record.families) {
			parent.set(`family:${family}`, parent.get(`family:${family}`) ?? `family:${family}`)
			union(`sha:${sourceSha256}`, `family:${family}`)
		}
	}
	const components = new Map<string, { hashes: Set<string>; families: Set<string>; paths: Set<string>; eventIds: Set<string> }>()
	for (const [sourceSha256, record] of sourceRecords) {
		const root = find(`sha:${sourceSha256}`)
		let component = components.get(root)
		if (!component) components.set(root, component = { hashes: new Set(), families: new Set(), paths: new Set(), eventIds: new Set() })
		component.hashes.add(sourceSha256)
		for (const value of record.families) component.families.add(value)
		for (const value of record.paths) component.paths.add(value)
		for (const value of record.eventIds) component.eventIds.add(value)
	}
	const sourceGroups = [...components.values()].map((component) => {
		const exactSourceSha256s = uniqueSorted(component.hashes)
		const artworkFamilyIds = uniqueSorted(component.families)
		return {
			id: canonicalSha256({ exactSourceSha256s, artworkFamilyIds }),
			exactSourceSha256s,
			artworkFamilyIds,
			paths: uniqueSorted(component.paths),
			eventIds: uniqueSorted(component.eventIds),
			perceptualGroupId: null,
		}
	}).sort((first, second) => compareAscii(first.id, second.id))
	const groupBySource = new Map(sourceGroups.flatMap((group) => group.exactSourceSha256s.map((hash) => [hash, group.id] as const)))
	const finalEvents: CompletePaletteEvidenceEvent[] = events.map((event) => ({
		...event,
		id: event.id!,
		sourceGroupId: groupBySource.get(event.sourceSha256)!,
	})).sort((first, second) => compareAscii(first.id, second.id))
	for (const group of sourceGroups) group.eventIds = uniqueSorted(finalEvents.filter((event) => event.sourceGroupId === group.id).map((event) => event.id))
	const exactSources = [...sourceRecords].map(([sourceSha256, record]) => ({
		sha256: sourceSha256,
		paths: uniqueSorted(record.paths),
		artworkFamilyIds: uniqueSorted(record.families),
		eventIds: uniqueSorted(finalEvents.filter((event) => event.sourceSha256 === sourceSha256).map((event) => event.id)),
	})).sort((first, second) => compareAscii(first.sha256, second.sha256))

	const summary = summarize(finalEvents, exactSources, sourceGroups)
	const supportability = supportabilityDecision(
		summary.absolute.independentSourceGroups.modelEligible,
		summary.pairwise.independentSourceGroups.modelEligible,
	)
	const exclusions: NativeCompletePaletteEvidenceInventory["exclusions"] = [
		{ kind: "factorized-field-state", status: "excluded", reason: "Isolated field-state tasks did not establish complete-palette validity.", submittedEvents: 10, unsubmittedEvents: 62, inputPaths: [controlledStopPath, factorizedPath].sort() },
		{ kind: "pair-only", status: "excluded", reason: "Ordered field-pair judgments are not complete-palette supervision.", submittedEvents: 5, unsubmittedEvents: 0, inputPaths: [controlledStopPath] },
		{ kind: "multiplicity-only", status: "excluded", reason: "One-field versus two-field judgments are not complete-palette supervision.", submittedEvents: 4, unsubmittedEvents: 0, inputPaths: [controlledStopPath] },
		{ kind: "gradient-only", status: "excluded", reason: "Conditional gradient labels cannot establish complete-palette quality.", submittedEvents: 275, unsubmittedEvents: 0, inputPaths: [controlledStopPath, factorizedPath].sort() },
		{ kind: "comments-as-labels", status: "excluded", reason: "Free text is retained only as an event-level presence count.", submittedEvents: summary.comments.eventsWithQualitativeContext, unsubmittedEvents: 0, inputPaths: [] },
		{ kind: "unsubmitted", status: "excluded", reason: "Manifest-only and stopped cases remain unjudged.", submittedEvents: 0, unsubmittedEvents: 106, inputPaths: [controlledStopPath,
			"research/data/experiments/next-palette-0.1.0-development/review-v2/batch-03-manifest.json",
			"research/data/experiments/next-palette-0.1.0-development/review-v2/batch-04-manifest.json"].sort() },
		{ kind: "autonomous-unbound", status: "excluded", reason: "Autonomous or provenance-unbound feedback is quarantined.", submittedEvents: 0, unsubmittedEvents: 0, inputPaths: [] },
		{ kind: "candidate-only", status: "excluded", reason: "Candidate outputs and mechanical scores are not human judgments.", submittedEvents: 0, unsubmittedEvents: 0, inputPaths: [] },
		{ kind: "ineligible-source", status: "excluded", reason: "Skipped, ineligible, and not-reviewable sources have no palette outcomes.", submittedEvents: 4, unsubmittedEvents: 0, inputPaths: [] },
		{ kind: "non-exact-palette-carry", status: "excluded", reason: "Perceptual-threshold carries are not exact complete-palette transfers.", submittedEvents: approximateLegacyCarries + chromaticCarry.entries.length, unsubmittedEvents: 0, inputPaths: [chromaticCarryPath] },
	]
	const implementation = await Promise.all(implementationPaths.map(async (path, index) => ({
		path,
		sha256: sha256(await readFile(resolve(projectRoot, path))),
		role: (index === 1 ? "generator" : "parser") as "parser" | "generator",
	})))
	const inputs = [...inputMap.values()].map(({ path, sha256: hash, role }) => ({ path, sha256: hash, role }))
		.sort((first, second) => compareAscii(first.path, second.path))
	const declarations: NativeCompletePaletteEvidenceInventory["declarations"] = {
		humanEvidenceUnit: "complete-rendered-palette",
		readOnly: true,
		comments: "counted-qualitative-context-only-no-content-or-label",
		groupingPolicy: {
			exactDeduplication: "encoded-source-sha256",
			artworkFamilies: "spotify-stable-artwork-id-when-present-otherwise-exact-source-sha256",
			perceptualNearDuplicates: "not-claimed-no-general-metadata",
			independentUnit: "connected-component-of-exact-source-and-stable-artwork-family-identities",
		},
		denominatorPolicy: {
			directFresh: "one-independent-source-group-maximum",
			exactTransfer: "reported-not-independent",
			repeatedPresentation: "reported-not-independent",
		},
		outcomeMapping: {
			positiveQuality: ["positive", "strong", "acceptable-not-ideal"],
			negativeQuality: ["negative", "weak-fallback", "unacceptable"],
			uncertainQuality: ["uncertain"],
			pairwiseModelEligible: ["first-preferred", "second-preferred", "tie", "both-similarly-valid"],
			pairwiseModelExcluded: ["neither-acceptable", "uncertain"],
		},
		exclusionPolicy: { excludedKinds: [...exclusionKinds], commentsNeverLabels: true, candidateEvidenceNeverHumanEvidence: true },
		noReserveAccess: {
			forbiddenRoots: ["10", "11", "12", "13", "14"],
			accessedRoots: [],
			declaration: "No source root 10, 11, 12, 13, or 14 was listed, read, decoded, hashed, or otherwise inspected by this inventory.",
		},
		limitations: [
			"No general perceptual-near-duplicate metadata exists for the exposed evidence, so no perceptual groups are claimed.",
			"Artwork grouping is conservative: exact bytes plus stable Spotify artwork identities when encoded in filenames; all other families remain exact-source groups.",
			"Legacy binary quality and modern ordinal quality are retained rather than pretending they share a finer common scale.",
		],
	}
	const experimentIdentity = {
		version: NATIVE_COMPLETE_PALETTE_EXPERIMENT_VERSION,
		evidenceVersion: NATIVE_COMPLETE_PALETTE_EVIDENCE_VERSION,
		inputs,
		implementation,
		declarations,
	}
	const inventory: NativeCompletePaletteEvidenceInventory = {
		schemaVersion: 1,
		experiment: {
			version: NATIVE_COMPLETE_PALETTE_EXPERIMENT_VERSION,
			evidenceVersion: NATIVE_COMPLETE_PALETTE_EVIDENCE_VERSION,
			experimentId: canonicalSha256(experimentIdentity),
			phase: 1,
			modelFitted: false,
		},
		declarations,
		provenance: { inputs, implementation },
		exactSources,
		sourceGroups,
		events: finalEvents,
		exclusions,
		summary,
		supportability,
		reconciliation: {
			eventsEqualClassSum: true,
			absoluteRatingsEqualPolaritySum: true,
			pairwiseEventsEqualOutcomeSum: true,
			allEventSourcesBound: true,
			allEventGroupsBound: true,
			transfersAndRepeatsExcludedFromIndependentDenominators: true,
			commentsContainNoContent: true,
			factorizedEventsIncluded: 0,
			all: true,
		},
	}
	return parseNativeCompletePaletteEvidenceInventory(inventory)
}

function zeroQualityCounts(): Record<AbsoluteQuality, number> {
	return Object.fromEntries(qualityValues.map((value) => [value, 0])) as Record<AbsoluteQuality, number>
}

function zeroPairwiseCounts(): Record<PairwiseOutcome, number> {
	return Object.fromEntries(pairwiseValues.map((value) => [value, 0])) as Record<PairwiseOutcome, number>
}

function summarize(
	events: readonly CompletePaletteEvidenceEvent[],
	exactSources: NativeCompletePaletteEvidenceInventory["exactSources"],
	sourceGroups: NativeCompletePaletteEvidenceInventory["sourceGroups"],
): NativeCompletePaletteEvidenceInventory["summary"] {
	const classes = { "direct-fresh": 0, "exact-transfer": 0, "repeated-presentation": 0 }
	const qualities = zeroQualityCounts()
	const polarities = { positive: 0, negative: 0, uncertain: 0 }
	const pairwise = zeroPairwiseCounts()
	const absoluteGroups = { positive: new Set<string>(), negative: new Set<string>(), uncertain: new Set<string>() }
	const pairGroups = Object.fromEntries(pairwiseValues.map((value) => [value, new Set<string>()])) as Record<PairwiseOutcome, Set<string>>
	for (const event of events) {
		classes[event.evidenceClass]++
		for (const outcome of event.absoluteOutcomes) {
			qualities[outcome.quality]++
			polarities[outcome.polarity]++
			if (event.evidenceClass === "direct-fresh") absoluteGroups[outcome.polarity].add(event.sourceGroupId)
		}
		if (event.pairwiseOutcome) {
			pairwise[event.pairwiseOutcome]++
			if (event.evidenceClass === "direct-fresh") pairGroups[event.pairwiseOutcome].add(event.sourceGroupId)
		}
	}
	const decisiveGroups = new Set([...pairGroups["first-preferred"], ...pairGroups["second-preferred"]])
	const pairModelGroups = new Set([...decisiveGroups, ...pairGroups.tie, ...pairGroups["both-similarly-valid"]])
	const absoluteModelGroups = new Set([...absoluteGroups.positive, ...absoluteGroups.negative])
	const families = new Map<string, Set<string>>()
	for (const source of exactSources) for (const family of source.artworkFamilyIds) {
		let hashes = families.get(family)
		if (!hashes) families.set(family, hashes = new Set())
		hashes.add(source.sha256)
	}
	return {
		evidenceClasses: {
			total: events.length,
			directFresh: classes["direct-fresh"],
			exactTransfer: classes["exact-transfer"],
			repeatedPresentation: classes["repeated-presentation"],
		},
		absolute: {
			ratings: { total: Object.values(qualities).reduce((sum, value) => sum + value, 0), ...polarities, byQuality: qualities },
			independentSourceGroups: {
				modelEligible: absoluteModelGroups.size,
				positive: absoluteGroups.positive.size,
				negative: absoluteGroups.negative.size,
				uncertain: absoluteGroups.uncertain.size,
			},
		},
		pairwise: {
			events: {
				total: Object.values(pairwise).reduce((sum, value) => sum + value, 0),
				decisive: pairwise["first-preferred"] + pairwise["second-preferred"],
				...pairwise,
			},
			independentSourceGroups: {
				modelEligible: pairModelGroups.size,
				decisive: decisiveGroups.size,
				...Object.fromEntries(pairwiseValues.map((value) => [value, pairGroups[value].size])) as Record<PairwiseOutcome, number>,
			},
		},
		comments: { eventsWithQualitativeContext: events.filter((event) => event.commentPresent).length, contentRetained: false },
		sources: {
			exactEncodedSources: exactSources.length,
			independentSourceGroups: sourceGroups.length,
			artworkFamilies: families.size,
			aliasPaths: exactSources.reduce((sum, source) => sum + source.paths.length, 0),
			exactDuplicateGroups: exactSources.filter((source) => source.paths.length > 1).length,
			multiHashArtworkFamilies: [...families.values()].filter((hashes) => hashes.size > 1).length,
		},
	}
}

function parseEvent(value: unknown, index: number): CompletePaletteEvidenceEvent {
	if (!isRecord(value)) throw new Error(`Event ${index} must be an object`)
	exactKeys(value, ["id", "sourceKind", "experimentId", "inputPaths", "sourcePath", "sourceSha256", "sourceGroupId",
		"artworkFamilyId", "treatmentIds", "comparisonId", "evidenceClass", "transferFromEventId", "observedAt",
		"absoluteOutcomes", "pairwiseOutcome", "commentPresent"], `Event ${index}`)
	assertHash(value.id, `Event ${index} ID`)
	assertHash(value.sourceSha256, `Event ${index} source`)
	assertHash(value.sourceGroupId, `Event ${index} source group`)
	if (typeof value.sourceKind !== "string" || !sourceKindValues.includes(value.sourceKind as EvidenceSourceKind) ||
		typeof value.experimentId !== "string" || value.experimentId.length === 0 || typeof value.sourcePath !== "string" ||
		typeof value.artworkFamilyId !== "string" || typeof value.commentPresent !== "boolean") throw new Error(`Event ${index} identity is invalid`)
	assertStringArray(value.inputPaths, `Event ${index} inputs`, false)
	assertOrderedStringArray(value.treatmentIds, `Event ${index} treatments`, false)
	const treatmentIds = value.treatmentIds
	for (const treatmentId of treatmentIds) assertHash(treatmentId, `Event ${index} treatment`)
	if (value.comparisonId !== null) assertHash(value.comparisonId, `Event ${index} comparison`)
	if (typeof value.evidenceClass !== "string" || !evidenceClassValues.includes(value.evidenceClass as EvidenceClass)) {
		throw new Error(`Event ${index} evidence class is invalid`)
	}
	if (value.transferFromEventId !== null) assertHash(value.transferFromEventId, `Event ${index} transfer origin`)
	if ((value.evidenceClass === "direct-fresh") !== (value.transferFromEventId === null)) {
		throw new Error(`Event ${index} transfer/repeat denominator classification is invalid`)
	}
	if (value.observedAt !== null && (typeof value.observedAt !== "string" || !Number.isFinite(Date.parse(value.observedAt)))) {
		throw new Error(`Event ${index} observation time is invalid`)
	}
	if (!Array.isArray(value.absoluteOutcomes)) throw new Error(`Event ${index} absolute outcomes are invalid`)
	const absoluteOutcomes = value.absoluteOutcomes.map((outcome, outcomeIndex) => {
		if (!isRecord(outcome)) throw new Error(`Event ${index} absolute outcome ${outcomeIndex} is invalid`)
		exactKeys(outcome, ["treatmentId", "quality", "polarity"], `Event ${index} absolute outcome ${outcomeIndex}`)
		assertHash(outcome.treatmentId, `Event ${index} absolute treatment`)
		if (!treatmentIds.includes(outcome.treatmentId) || typeof outcome.quality !== "string" ||
			!qualityValues.includes(outcome.quality as AbsoluteQuality) || typeof outcome.polarity !== "string" ||
			!polarityValues.includes(outcome.polarity as AbsolutePolarity) ||
			qualityPolarity(outcome.quality as AbsoluteQuality) !== outcome.polarity) {
			throw new Error(`Event ${index} absolute outcome ${outcomeIndex} is invalid`)
		}
		return outcome as AbsoluteOutcome
	})
	if (value.pairwiseOutcome !== null && (typeof value.pairwiseOutcome !== "string" ||
		!pairwiseValues.includes(value.pairwiseOutcome as PairwiseOutcome))) throw new Error(`Event ${index} pairwise outcome is invalid`)
	if (value.pairwiseOutcome !== null && treatmentIds.length !== 2) throw new Error(`Event ${index} pairwise treatment count is invalid`)
	const event = { ...value, absoluteOutcomes } as unknown as CompletePaletteEvidenceEvent
	if (event.id !== eventIdentity(event)) throw new Error(`Event ${index} ID does not bind its evidence`)
	return event
}

export function parseNativeCompletePaletteEvidenceInventory(value: unknown): NativeCompletePaletteEvidenceInventory {
	if (!isRecord(value)) throw new Error("Native complete-palette evidence inventory must be an object")
	exactKeys(value, ["schemaVersion", "experiment", "declarations", "provenance", "exactSources", "sourceGroups", "events",
		"exclusions", "summary", "supportability", "reconciliation"], "Inventory")
	if (value.schemaVersion !== 1 || !isRecord(value.experiment) || !isRecord(value.declarations) || !isRecord(value.provenance) ||
		!Array.isArray(value.exactSources) || !Array.isArray(value.sourceGroups) || !Array.isArray(value.events) ||
		!Array.isArray(value.exclusions) || !isRecord(value.summary) || !isRecord(value.supportability) || !isRecord(value.reconciliation)) {
		throw new Error("Inventory header is invalid")
	}
	exactKeys(value.experiment, ["version", "evidenceVersion", "experimentId", "phase", "modelFitted"], "Experiment")
	assertHash(value.experiment.experimentId, "Experiment ID")
	if (value.experiment.version !== NATIVE_COMPLETE_PALETTE_EXPERIMENT_VERSION ||
		value.experiment.evidenceVersion !== NATIVE_COMPLETE_PALETTE_EVIDENCE_VERSION || value.experiment.phase !== 1 ||
		value.experiment.modelFitted !== false) throw new Error("Experiment identity is invalid")

	const declarations = value.declarations
	exactKeys(declarations, ["humanEvidenceUnit", "readOnly", "comments", "groupingPolicy", "denominatorPolicy", "outcomeMapping",
		"exclusionPolicy", "noReserveAccess", "limitations"], "Declarations")
	if (declarations.humanEvidenceUnit !== "complete-rendered-palette" || declarations.readOnly !== true ||
		declarations.comments !== "counted-qualitative-context-only-no-content-or-label" || !isRecord(declarations.groupingPolicy) ||
		!isRecord(declarations.denominatorPolicy) || !isRecord(declarations.outcomeMapping) || !isRecord(declarations.exclusionPolicy) ||
		!isRecord(declarations.noReserveAccess) || !Array.isArray(declarations.limitations)) throw new Error("Declarations are invalid")
	exactKeys(declarations.groupingPolicy, ["exactDeduplication", "artworkFamilies", "perceptualNearDuplicates", "independentUnit"], "Grouping policy")
	exactKeys(declarations.denominatorPolicy, ["directFresh", "exactTransfer", "repeatedPresentation"], "Denominator policy")
	exactKeys(declarations.outcomeMapping, ["positiveQuality", "negativeQuality", "uncertainQuality", "pairwiseModelEligible", "pairwiseModelExcluded"], "Outcome mapping")
	exactKeys(declarations.exclusionPolicy, ["excludedKinds", "commentsNeverLabels", "candidateEvidenceNeverHumanEvidence"], "Exclusion policy")
	exactKeys(declarations.noReserveAccess, ["forbiddenRoots", "accessedRoots", "declaration"], "No-reserve declaration")
	if (declarations.groupingPolicy.exactDeduplication !== "encoded-source-sha256" ||
		declarations.groupingPolicy.perceptualNearDuplicates !== "not-claimed-no-general-metadata" ||
		declarations.denominatorPolicy.exactTransfer !== "reported-not-independent" ||
		declarations.denominatorPolicy.repeatedPresentation !== "reported-not-independent" ||
		declarations.exclusionPolicy.commentsNeverLabels !== true || declarations.exclusionPolicy.candidateEvidenceNeverHumanEvidence !== true ||
		JSON.stringify(declarations.exclusionPolicy.excludedKinds) !== JSON.stringify(exclusionKinds) ||
		JSON.stringify(declarations.noReserveAccess.forbiddenRoots) !== JSON.stringify(["10", "11", "12", "13", "14"]) ||
		!Array.isArray(declarations.noReserveAccess.accessedRoots) || declarations.noReserveAccess.accessedRoots.length !== 0 ||
		declarations.limitations.some((item) => typeof item !== "string")) throw new Error("Required policy declaration is invalid")

	exactKeys(value.provenance, ["inputs", "implementation"], "Provenance")
	if (!Array.isArray(value.provenance.inputs) || !Array.isArray(value.provenance.implementation)) throw new Error("Provenance is invalid")
	const inputPaths = new Set<string>()
	for (const [index, input] of value.provenance.inputs.entries()) {
		if (!isRecord(input)) throw new Error(`Input ${index} is invalid`)
		exactKeys(input, ["path", "sha256", "role"], `Input ${index}`)
		assertHash(input.sha256, `Input ${index}`)
		if (typeof input.path !== "string" || inputPaths.has(input.path) ||
			!(input.role === "included-evidence" || input.role === "transfer-evidence" || input.role === "exclusion-evidence")) {
			throw new Error(`Input ${index} is invalid`)
		}
		if (index > 0 && (value.provenance.inputs[index - 1] as { path: string }).path >= input.path) {
			throw new Error("Provenance inputs are not deterministically ordered")
		}
		inputPaths.add(input.path)
	}
	const implementationPathsSeen = new Set<string>()
	let generatorCount = 0
	for (const [index, implementation] of value.provenance.implementation.entries()) {
		if (!isRecord(implementation)) throw new Error(`Implementation ${index} is invalid`)
		exactKeys(implementation, ["path", "sha256", "role"], `Implementation ${index}`)
		assertHash(implementation.sha256, `Implementation ${index}`)
		if (typeof implementation.path !== "string" || implementationPathsSeen.has(implementation.path) ||
			!(implementation.role === "parser" || implementation.role === "generator")) {
			throw new Error(`Implementation ${index} is invalid`)
		}
		implementationPathsSeen.add(implementation.path)
		if (implementation.role === "generator") generatorCount++
	}
	if (generatorCount !== 1 || !value.provenance.implementation.some((entry) => entry.role === "parser")) {
		throw new Error("Parser/generator implementation provenance is incomplete")
	}
	const expectedExperimentId = canonicalSha256({
		version: value.experiment.version,
		evidenceVersion: value.experiment.evidenceVersion,
		inputs: value.provenance.inputs,
		implementation: value.provenance.implementation,
		declarations: value.declarations,
	})
	if (value.experiment.experimentId !== expectedExperimentId) throw new Error("Experiment ID does not bind provenance and policy")

	const exactSourceIds = new Set<string>()
	const exactSourceById = new Map<string, JsonRecord>()
	const sourceEventReferences = new Map<string, Set<string>>()
	for (const [index, source] of value.exactSources.entries()) {
		if (!isRecord(source)) throw new Error(`Exact source ${index} is invalid`)
		exactKeys(source, ["sha256", "paths", "artworkFamilyIds", "eventIds"], `Exact source ${index}`)
		assertHash(source.sha256, `Exact source ${index}`)
		assertStringArray(source.paths, `Exact source ${index} paths`, false)
		if (source.paths.some((path) => {
			const root = path.split("/", 1)[0]
			return path.includes("..") || path.includes("\\") || forbiddenSourceRoots.has(root) || !allowedSourceRoots.has(root)
		})) throw new Error(`Exact source ${index} contains a forbidden or invalid path`)
		assertStringArray(source.artworkFamilyIds, `Exact source ${index} families`, false)
		assertStringArray(source.eventIds, `Exact source ${index} events`, false)
		if (exactSourceIds.has(source.sha256) || (index > 0 &&
			(value.exactSources[index - 1] as { sha256: string }).sha256 >= source.sha256)) {
			throw new Error(`Exact source ${index} is duplicated or not deterministically ordered`)
		}
		exactSourceIds.add(source.sha256)
		exactSourceById.set(source.sha256, source)
		sourceEventReferences.set(source.sha256, new Set(source.eventIds))
	}
	const sourceGroupIds = new Set<string>()
	const groupedSourceIds = new Set<string>()
	const sourceGroupById = new Map<string, JsonRecord>()
	const groupEventReferences = new Map<string, Set<string>>()
	for (const [index, group] of value.sourceGroups.entries()) {
		if (!isRecord(group)) throw new Error(`Source group ${index} is invalid`)
		exactKeys(group, ["id", "exactSourceSha256s", "artworkFamilyIds", "paths", "eventIds", "perceptualGroupId"], `Source group ${index}`)
		assertHash(group.id, `Source group ${index}`)
		assertStringArray(group.exactSourceSha256s, `Source group ${index} hashes`, false)
		for (const hash of group.exactSourceSha256s) assertHash(hash, `Source group ${index} hash`)
		assertStringArray(group.artworkFamilyIds, `Source group ${index} families`, false)
		assertStringArray(group.paths, `Source group ${index} paths`, false)
		assertStringArray(group.eventIds, `Source group ${index} events`, false)
		if (group.perceptualGroupId !== null || sourceGroupIds.has(group.id) ||
			group.exactSourceSha256s.some((hash) => !exactSourceIds.has(hash)) ||
			group.exactSourceSha256s.some((hash) => groupedSourceIds.has(hash)) ||
			(index > 0 && (value.sourceGroups[index - 1] as { id: string }).id >= group.id) ||
			group.id !== canonicalSha256({ exactSourceSha256s: group.exactSourceSha256s, artworkFamilyIds: group.artworkFamilyIds })) {
			throw new Error(`Source group ${index} identity is invalid`)
		}
		for (const hash of group.exactSourceSha256s) groupedSourceIds.add(hash)
		sourceGroupIds.add(group.id)
		sourceGroupById.set(group.id, group)
		groupEventReferences.set(group.id, new Set(group.eventIds))
	}
	if (groupedSourceIds.size !== exactSourceIds.size) throw new Error("Source groups do not partition exact sources")
	const events = value.events.map(parseEvent)
	const eventIds = new Set(events.map((event) => event.id))
	if (eventIds.size !== events.length || events.some((event, index) => index > 0 && events[index - 1].id >= event.id)) {
		throw new Error("Event IDs are not unique or deterministically ordered")
	}
	for (const event of events) {
		const exactSource = exactSourceById.get(event.sourceSha256)
		const sourceGroup = sourceGroupById.get(event.sourceGroupId)
		if (!exactSourceIds.has(event.sourceSha256) || !sourceGroupIds.has(event.sourceGroupId) ||
			event.inputPaths.some((path) => !inputPaths.has(path)) || !sourceEventReferences.get(event.sourceSha256)?.has(event.id) ||
			!groupEventReferences.get(event.sourceGroupId)?.has(event.id)) throw new Error(`Event ${event.id} has unbound provenance`)
		if (!exactSource || !sourceGroup || !(exactSource.paths as string[]).includes(event.sourcePath) ||
			!(exactSource.artworkFamilyIds as string[]).includes(event.artworkFamilyId) ||
			!(sourceGroup.exactSourceSha256s as string[]).includes(event.sourceSha256) ||
			!(sourceGroup.paths as string[]).includes(event.sourcePath) ||
			!(sourceGroup.artworkFamilyIds as string[]).includes(event.artworkFamilyId) ||
			event.artworkFamilyId !== artworkFamilyId(event.sourcePath, event.sourceSha256)) {
			throw new Error(`Event ${event.id} source grouping provenance is invalid`)
		}
		if (event.transferFromEventId !== null && !eventIds.has(event.transferFromEventId)) throw new Error(`Event ${event.id} transfer origin is absent`)
	}
	for (const ids of [...sourceEventReferences.values(), ...groupEventReferences.values()]) {
		if ([...ids].some((id) => !eventIds.has(id))) throw new Error("Source or group references an absent event")
	}
	for (const [sourceSha256, ids] of sourceEventReferences) {
		const expected = uniqueSorted(events.filter((event) => event.sourceSha256 === sourceSha256).map((event) => event.id))
		if (JSON.stringify([...ids]) !== JSON.stringify(expected)) throw new Error("Exact-source event references do not reconcile")
	}
	for (const [sourceGroupId, ids] of groupEventReferences) {
		const expected = uniqueSorted(events.filter((event) => event.sourceGroupId === sourceGroupId).map((event) => event.id))
		if (JSON.stringify([...ids]) !== JSON.stringify(expected)) throw new Error("Source-group event references do not reconcile")
	}

	const exclusions = value.exclusions.map((entry, index) => {
		if (!isRecord(entry)) throw new Error(`Exclusion ${index} is invalid`)
		exactKeys(entry, ["kind", "status", "reason", "submittedEvents", "unsubmittedEvents", "inputPaths"], `Exclusion ${index}`)
		if (entry.kind !== exclusionKinds[index] || entry.status !== "excluded" ||
			typeof entry.reason !== "string" || !isNonnegativeInteger(entry.submittedEvents) ||
			!isNonnegativeInteger(entry.unsubmittedEvents)) throw new Error(`Exclusion ${index} is invalid`)
		assertStringArray(entry.inputPaths, `Exclusion ${index} inputs`)
		if (entry.inputPaths.some((path) => !inputPaths.has(path))) throw new Error(`Exclusion ${index} input is unbound`)
		return entry
	})
	if (new Set(exclusions.map((entry) => entry.kind)).size !== exclusionKinds.length ||
		exclusionKinds.some((kind) => !exclusions.some((entry) => entry.kind === kind)) ||
		events.some((event) => !sourceKindValues.includes(event.sourceKind))) throw new Error("Exclusion policy is incomplete or factorized evidence leaked")

	const recomputedSummary = summarize(events, value.exactSources as never, value.sourceGroups as never)
	if (JSON.stringify(value.summary) !== JSON.stringify(recomputedSummary)) throw new Error("Inventory counts do not reconcile")
	const expectedSupportability = supportabilityDecision(
		recomputedSummary.absolute.independentSourceGroups.modelEligible,
		recomputedSummary.pairwise.independentSourceGroups.modelEligible,
	)
	if (JSON.stringify(value.supportability) !== JSON.stringify(expectedSupportability)) throw new Error("Supportability decision does not reconcile")
	exactKeys(value.reconciliation, ["eventsEqualClassSum", "absoluteRatingsEqualPolaritySum", "pairwiseEventsEqualOutcomeSum",
		"allEventSourcesBound", "allEventGroupsBound", "transfersAndRepeatsExcludedFromIndependentDenominators",
		"commentsContainNoContent", "factorizedEventsIncluded", "all"], "Reconciliation")
	if (Object.entries(value.reconciliation).some(([key, result]) => key === "factorizedEventsIncluded" ? result !== 0 : result !== true)) {
		throw new Error("Inventory reconciliation is not complete")
	}
	return value as unknown as NativeCompletePaletteEvidenceInventory
}

export function nativeCompletePaletteEvidenceJson(inventory: NativeCompletePaletteEvidenceInventory): string {
	parseNativeCompletePaletteEvidenceInventory(inventory)
	return `${JSON.stringify(inventory, null, 2)}\n`
}
