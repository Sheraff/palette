import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { okDistance, rgbToHex, rgbToOKLab } from "./color.ts"
import { acceptedCandidates, validateCurationStore, type CurationStore } from "./corpus-curation.ts"
import { validateSelectionManifest, type SelectionManifest } from "./corpus-selection.ts"
import type { CorpusResult, Palette, RGB, RoleName } from "./types.ts"

export const roleDistanceThreshold = 0.025
export const roleNames: RoleName[] = ["background", "foreground", "surface", "accent"]

type SpatialPalette = Pick<Palette, RoleName | "gradient">

type AbsoluteFeedback = {
	image: string
	shippable: boolean
	reasons: string[]
	note: string
	decidedAt?: string
}

type AbsoluteFeedbackStore = {
	manifestId: string
	algorithmVersion: string
	semanticResultsSha256: string
	entries: AbsoluteFeedback[]
}

type FrozenCurationStore = {
	manifestId: string
	semanticResultsSha256: string
	frozenAt: string
	entries: Array<{ image: string; decision: "include" | "veto" }>
}

type EntryComparison = ReturnType<typeof compareEntries>

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function validTimestamp(value: unknown): value is string {
	return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}

function requireExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
	const expectedKeys = new Set(expected)
	if (expected.some((key) => !(key in value)) || Object.keys(value).some((key) => !expectedKeys.has(key))) {
		throw new Error(`${label} fields are invalid`)
	}
}

function validateColor(value: unknown, label: string): void {
	if (!isRecord(value) || !Array.isArray(value.rgb) || value.rgb.length !== 3 ||
		value.rgb.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255) ||
		typeof value.hex !== "string" || !/^#[a-f0-9]{6}$/i.test(value.hex) ||
		rgbToHex(value.rgb as unknown as RGB) !== value.hex.toLowerCase() || typeof value.generated !== "boolean" ||
		typeof value.sourceDistance !== "number" || !Number.isFinite(value.sourceDistance)) {
		throw new Error(`${label} is not a valid role color`)
	}
}

function validateCorpus(value: unknown, label: string): asserts value is CorpusResult {
	if (!isRecord(value) || !validTimestamp(value.generatedAt) || typeof value.algorithmVersion !== "string" ||
		!/^[a-z0-9][a-z0-9.-]*$/i.test(value.algorithmVersion) || !Array.isArray(value.entries)) {
		throw new Error(`${label} is not a valid corpus result`)
	}
	const seen = new Set<string>()
	for (const [index, entryValue] of value.entries.entries()) {
		const entryLabel = `${label} entry ${index}`
		if (!isRecord(entryValue) || typeof entryValue.file !== "string" || entryValue.file.length === 0 || seen.has(entryValue.file) ||
			!(["artwork", "synthetic", "diagnostic", "holdout"] as unknown[]).includes(entryValue.kind) ||
			typeof entryValue.review !== "boolean" || !Number.isInteger(entryValue.width) || (entryValue.width as number) <= 0 ||
			!Number.isInteger(entryValue.height) || (entryValue.height as number) <= 0 || !isRecord(entryValue.extraction)) {
			throw new Error(`${entryLabel} is invalid or duplicated`)
		}
		const extraction = entryValue.extraction
		if (extraction.version !== value.algorithmVersion || extraction.width !== entryValue.width || extraction.height !== entryValue.height ||
			!isRecord(extraction.methods) || !isRecord(extraction.methods.spatial)) {
			throw new Error(`${entryLabel} has invalid extraction provenance`)
		}
		const spatial = extraction.methods.spatial
		for (const role of roleNames) validateColor(spatial[role], `${entryLabel} ${role}`)
		if (!isRecord(spatial.gradient) || typeof spatial.gradient.isGradient !== "boolean") {
			throw new Error(`${entryLabel} has invalid spatial gradient evidence`)
		}
		seen.add(entryValue.file)
	}
}

function validateCoverage(baseline: CorpusResult, candidate: CorpusResult, label: string): void {
	if (candidate.entries.length !== baseline.entries.length) {
		throw new Error(`${label} coverage differs: expected ${baseline.entries.length}, received ${candidate.entries.length}`)
	}
	const candidates = new Map(candidate.entries.map((entry) => [entry.file, entry]))
	for (const entry of baseline.entries) {
		const counterpart = candidates.get(entry.file)
		if (!counterpart) throw new Error(`${label} is missing ${entry.file}`)
		if (counterpart.kind !== entry.kind || counterpart.review !== entry.review || counterpart.width !== entry.width ||
			counterpart.height !== entry.height) throw new Error(`${label} metadata differs for ${entry.file}`)
	}
}

function validateReferenceStores(
	curationValue: unknown,
	feedbackValue: unknown,
	baselineHoldout: CorpusResult,
): { curation: FrozenCurationStore; feedback: AbsoluteFeedbackStore } {
	if (!isRecord(curationValue) || curationValue.schemaVersion !== 3 || typeof curationValue.manifestId !== "string" ||
		typeof curationValue.semanticResultsSha256 !== "string" || !validTimestamp(curationValue.frozenAt) ||
		!Array.isArray(curationValue.entries)) throw new Error("Curation store is not frozen or is invalid")
	const curationEntries: FrozenCurationStore["entries"] = []
	const curatedSeen = new Set<string>()
	for (const value of curationValue.entries) {
		if (!isRecord(value) || typeof value.image !== "string" || (value.decision !== "include" && value.decision !== "veto") ||
			curatedSeen.has(value.image)) throw new Error("Curation entries are invalid or duplicated")
		curatedSeen.add(value.image)
		curationEntries.push({ image: value.image, decision: value.decision })
	}
	const curation: FrozenCurationStore = {
		manifestId: curationValue.manifestId,
		semanticResultsSha256: curationValue.semanticResultsSha256,
		frozenAt: curationValue.frozenAt,
		entries: curationEntries,
	}

	if (!isRecord(feedbackValue) || feedbackValue.schemaVersion !== 3 || feedbackValue.presentationVersion !== 1 ||
		feedbackValue.manifestId !== curation.manifestId ||
		feedbackValue.semanticResultsSha256 !== curation.semanticResultsSha256 ||
		feedbackValue.algorithmVersion !== baselineHoldout.algorithmVersion || !Array.isArray(feedbackValue.entries)) {
		throw new Error("Absolute feedback does not match the frozen baseline provenance")
	}
	const feedbackEntries: AbsoluteFeedback[] = []
	const feedbackSeen = new Set<string>()
	for (const value of feedbackValue.entries) {
		if (!isRecord(value) || typeof value.image !== "string" || feedbackSeen.has(value.image) ||
			typeof value.shippable !== "boolean" || !Array.isArray(value.reasons) ||
			value.reasons.some((reason) => typeof reason !== "string") || typeof value.note !== "string" ||
			(value.shippable ? value.reasons.length !== 0 : value.reasons.length === 0)) {
			throw new Error("Absolute feedback entries are invalid or duplicated")
		}
		feedbackSeen.add(value.image)
		feedbackEntries.push({ image: value.image, shippable: value.shippable, reasons: [...value.reasons], note: value.note })
	}
	const feedback: AbsoluteFeedbackStore = {
		manifestId: feedbackValue.manifestId as string,
		algorithmVersion: feedbackValue.algorithmVersion as string,
		semanticResultsSha256: feedbackValue.semanticResultsSha256 as string,
		entries: feedbackEntries,
	}

	const included = new Set(curation.entries.filter((entry) => entry.decision === "include").map((entry) => entry.image))
	if (included.size !== 100) throw new Error(`Frozen curation must contain 100 included sources, received ${included.size}`)
	if (feedback.entries.length !== included.size || feedback.entries.some((entry) => !included.has(entry.image)) ||
		[...included].some((image) => !feedbackSeen.has(image))) {
		throw new Error("Absolute feedback must exactly cover the 100 included sources")
	}
	const holdoutFiles = new Set(baselineHoldout.entries.map((entry) => entry.file))
	for (const image of included) if (!holdoutFiles.has(image)) throw new Error(`Curated source is missing from baseline holdout: ${image}`)
	return { curation, feedback }
}

const absoluteReasons = new Set(["background", "foreground", "surface", "accent", "gradient", "lacks-artwork-identity", "other"])

function validateExactReferenceProvenance(input: {
	baselineHoldoutResults: unknown
	baselineHoldoutSource: string | Uint8Array
	selection: unknown
	curation: unknown
	absoluteFeedback: unknown
}): { baselineHoldout: CorpusResult; curation: CurationStore; feedback: AbsoluteFeedbackStore } {
	const sourceBytes = typeof input.baselineHoldoutSource === "string"
		? Buffer.from(input.baselineHoldoutSource)
		: input.baselineHoldoutSource
	const source = Buffer.from(sourceBytes).toString("utf8")
	let sourceValue: unknown
	try {
		sourceValue = JSON.parse(source) as unknown
	} catch (error) {
		throw new Error("Exact baseline holdout source is invalid JSON", { cause: error })
	}
	validateCorpus(sourceValue, "Exact baseline holdout source")
	if (!isDeepStrictEqual(sourceValue, input.baselineHoldoutResults)) {
		throw new Error("Baseline holdout results do not exactly match the supplied raw artifact")
	}
	const baselineHoldout = sourceValue
	const sourceResultsSha256 = createHash("sha256").update(sourceBytes).digest("hex")
	const selectionValue = input.selection
	validateSelectionManifest(selectionValue, baselineHoldout, sourceResultsSha256)
	const selection = selectionValue
	const curationValue = input.curation
	validateCurationStore(selection, curationValue)
	const curation = curationValue
	if (curation.frozenAt === null) throw new Error("Curation store must be frozen before classifying absolute feedback")

	const feedbackValue = input.absoluteFeedback
	if (!isRecord(feedbackValue)) throw new Error("Absolute feedback store must be an object")
	requireExactKeys(feedbackValue, [
		"schemaVersion",
		"manifestId",
		"algorithmVersion",
		"semanticResultsSha256",
		"presentationVersion",
		"entries",
	], "Absolute feedback store")
	if (feedbackValue.schemaVersion !== 3 || feedbackValue.manifestId !== selection.manifestId ||
		feedbackValue.algorithmVersion !== selection.algorithmVersion ||
		feedbackValue.semanticResultsSha256 !== selection.semanticResultsSha256 ||
		feedbackValue.presentationVersion !== 1 || !Array.isArray(feedbackValue.entries)) {
		throw new Error("Absolute feedback store does not match the frozen selection provenance")
	}

	const included = new Set(acceptedCandidates(selection, curation).map((candidate) => candidate.file))
	const feedbackEntries: AbsoluteFeedback[] = []
	const seen = new Set<string>()
	for (const entryValue of feedbackValue.entries) {
		if (!isRecord(entryValue)) throw new Error("Absolute feedback entry is invalid")
		requireExactKeys(entryValue, ["image", "shippable", "reasons", "note", "decidedAt"], "Absolute feedback entry")
		if (typeof entryValue.image !== "string" || !included.has(entryValue.image) || seen.has(entryValue.image)) {
			throw new Error("Absolute feedback images are unknown or duplicated")
		}
		if (typeof entryValue.shippable !== "boolean" || !Array.isArray(entryValue.reasons) ||
			entryValue.reasons.some((reason) => typeof reason !== "string" || !absoluteReasons.has(reason)) ||
			new Set(entryValue.reasons).size !== entryValue.reasons.length ||
			(entryValue.shippable ? entryValue.reasons.length !== 0 : entryValue.reasons.length === 0)) {
			throw new Error("Absolute feedback decision is invalid")
		}
		if (typeof entryValue.note !== "string" || entryValue.note.length > 500 ||
			(entryValue.reasons.includes("other") && entryValue.note.trim().length === 0)) {
			throw new Error("Absolute feedback note is invalid")
		}
		if (!validTimestamp(entryValue.decidedAt)) throw new Error("Absolute feedback timestamp is invalid")
		seen.add(entryValue.image)
		feedbackEntries.push({
			image: entryValue.image,
			shippable: entryValue.shippable,
			reasons: [...entryValue.reasons] as string[],
			note: entryValue.note,
			decidedAt: entryValue.decidedAt,
		})
	}
	if (feedbackEntries.length !== included.size || [...included].some((image) => !seen.has(image))) {
		throw new Error("Absolute feedback must exactly cover the frozen curated sources")
	}
	return {
		baselineHoldout,
		curation,
		feedback: {
			manifestId: feedbackValue.manifestId as string,
			algorithmVersion: feedbackValue.algorithmVersion as string,
			semanticResultsSha256: feedbackValue.semanticResultsSha256 as string,
			entries: feedbackEntries,
		},
	}
}

function colorSnapshot(color: SpatialPalette[RoleName]) {
	return { hex: color.hex, rgb: color.rgb, generated: color.generated }
}

export function compareSpatialPalettes(baseline: SpatialPalette, candidate: SpatialPalette) {
	const roles = Object.fromEntries(roleNames.map((role) => {
		const oldColor = baseline[role]
		const newColor = candidate[role]
		const distance = okDistance(rgbToOKLab(oldColor.rgb), rgbToOKLab(newColor.rgb))
		return [role, {
			distance,
			changed: distance > roleDistanceThreshold,
			old: colorSnapshot(oldColor),
			new: colorSnapshot(newColor),
		}]
	})) as Record<RoleName, {
		distance: number
		changed: boolean
		old: ReturnType<typeof colorSnapshot>
		new: ReturnType<typeof colorSnapshot>
	}>
	const gradient = {
		changed: baseline.gradient.isGradient !== candidate.gradient.isGradient,
		old: baseline.gradient.isGradient,
		new: candidate.gradient.isGradient,
	}
	return {
		changed: gradient.changed || roleNames.some((role) => roles[role].changed),
		gradient,
		roles,
	}
}

function compareEntries(
	baseline: CorpusResult["entries"][number],
	candidate: CorpusResult["entries"][number],
	feedback: AbsoluteFeedback | null,
) {
	return {
		file: baseline.file,
		kind: baseline.kind,
		review: baseline.review,
		...compareSpatialPalettes(baseline.extraction.methods.spatial, candidate.extraction.methods.spatial),
		oldFeedback: feedback ? {
			shippable: feedback.shippable,
			reasons: feedback.reasons,
			note: feedback.note,
		} : null,
	}
}

function comparisonGroup(entries: EntryComparison[]) {
	const changedFiles = entries.filter((entry) => entry.changed).map((entry) => entry.file)
	return {
		total: entries.length,
		changedCount: changedFiles.length,
		unchangedCount: entries.length - changedFiles.length,
		changedFiles,
		entries,
	}
}

export function buildCandidateComparisonReport(input: {
	baselineResults: unknown
	baselineHoldoutResults: unknown
	baselineHoldoutSource?: string | Uint8Array
	candidateResults: unknown
	candidateHoldoutResults: unknown
	selection?: unknown
	curation: unknown
	absoluteFeedback: unknown
}) {
	const exactProvenanceRequested = input.baselineHoldoutSource !== undefined || input.selection !== undefined
	if (exactProvenanceRequested && (input.baselineHoldoutSource === undefined || input.selection === undefined)) {
		throw new Error("Selection manifest and exact baseline holdout source must be supplied together")
	}
	const exactProvenance = exactProvenanceRequested
		? validateExactReferenceProvenance({
			baselineHoldoutResults: input.baselineHoldoutResults,
			baselineHoldoutSource: input.baselineHoldoutSource!,
			selection: input.selection,
			curation: input.curation,
			absoluteFeedback: input.absoluteFeedback,
		})
		: null
	validateCorpus(input.baselineResults, "Baseline results")
	if (!exactProvenance) validateCorpus(input.baselineHoldoutResults, "Baseline holdout results")
	validateCorpus(input.candidateResults, "Candidate results")
	validateCorpus(input.candidateHoldoutResults, "Candidate holdout results")
	const baselineResults = input.baselineResults
	const baselineHoldout = exactProvenance?.baselineHoldout ?? input.baselineHoldoutResults as CorpusResult
	const candidateResults = input.candidateResults
	const candidateHoldout = input.candidateHoldoutResults

	if (baselineResults.algorithmVersion !== baselineHoldout.algorithmVersion) {
		throw new Error("Baseline result versions do not match")
	}
	if (candidateResults.algorithmVersion !== candidateHoldout.algorithmVersion) {
		throw new Error("Candidate result versions do not match")
	}
	if (baselineResults.entries.length !== 37) {
		throw new Error(`Baseline legacy research coverage must contain 37 entries, received ${baselineResults.entries.length}`)
	}
	validateCoverage(baselineResults, candidateResults, "Candidate legacy research")
	validateCoverage(baselineHoldout, candidateHoldout, "Candidate holdout")
	const { curation, feedback } = exactProvenance ??
		validateReferenceStores(input.curation, input.absoluteFeedback, baselineHoldout)

	const candidateLegacy = new Map(candidateResults.entries.map((entry) => [entry.file, entry]))
	const legacy = baselineResults.entries.map((entry) => compareEntries(entry, candidateLegacy.get(entry.file)!, null))
	const reviewableLegacy = legacy.filter((entry) => entry.review)
	const diagnostics = legacy.filter((entry) => entry.kind === "diagnostic")
	if (reviewableLegacy.length + diagnostics.length !== legacy.length) {
		throw new Error("Every legacy entry must be reviewable or explicitly diagnostic")
	}

	const included = new Set(curation.entries.filter((entry) => entry.decision === "include").map((entry) => entry.image))
	const feedbackByImage = new Map(feedback.entries.map((entry) => [entry.image, entry]))
	const candidateHoldoutByFile = new Map(candidateHoldout.entries.map((entry) => [entry.file, entry]))
	const holdout = baselineHoldout.entries.map((entry) => compareEntries(
		entry,
		candidateHoldoutByFile.get(entry.file)!,
		feedbackByImage.get(entry.file) ?? null,
	))
	const selected = holdout.filter((entry) => included.has(entry.file))
	const accepted = selected.filter((entry) => entry.oldFeedback?.shippable === true)
	const rejected = selected.filter((entry) => entry.oldFeedback?.shippable === false)
	const unselected = holdout.filter((entry) => !included.has(entry.file))

	return {
		schemaVersion: 1,
		thresholds: { roleOKLabDistanceExclusive: roleDistanceThreshold },
		versions: {
			baseline: baselineResults.algorithmVersion,
			candidate: candidateResults.algorithmVersion,
		},
		coverage: {
			legacyResearch: legacy.length,
			reviewableLegacyResearch: reviewableLegacy.length,
			diagnosticLegacyResearch: diagnostics.length,
			holdout: holdout.length,
			curated: selected.length,
			accepted: accepted.length,
			rejected: rejected.length,
			unselectedHoldout: unselected.length,
		},
		legacyResearch: {
			reviewable: comparisonGroup(reviewableLegacy),
			diagnostics: comparisonGroup(diagnostics),
		},
		accepted: comparisonGroup(accepted),
		rejected: comparisonGroup(rejected),
		unselectedHoldout: comparisonGroup(unselected),
	}
}
