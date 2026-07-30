import { createHash } from "node:crypto"
import { namePalette } from "./color-name.ts"
import type { RGB } from "./types.ts"

export const COMPLETE_PALETTE_REVIEW_VERSION = "complete-palette-review-v2" as const
export const COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION =
	"complete-palette-review-v2-presentation-2" as const
export const completePaletteReviewSupportedPresentationVersions = [
	"complete-palette-review-v2-presentation-1",
	COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
] as const
export const COMPLETE_PALETTE_REVIEW_COLOR_NAME_POLICY =
	"colornames-oklab-0.6.0-nearest-oklab-presentation-only" as const
export const completePaletteReviewRoles = ["background", "surface", "foreground", "accent"] as const
export const completePaletteReviewModes = ["absolute", "pairwise"] as const
export const completePaletteReviewQualities = [
	"strong", "acceptable", "weak-fallback", "unacceptable", "uncertain",
] as const
export const completePaletteReviewComparisons = [
	"a-stronger", "b-stronger", "similarly-valid", "neither-acceptable", "uncertain",
] as const
export const completePaletteReviewIssueTags = [
	"missing gradient", "extraneous gradient", "incomplete artwork identity",
] as const

export type CompletePaletteReviewRole = typeof completePaletteReviewRoles[number]
export type CompletePaletteReviewMode = typeof completePaletteReviewModes[number]
export type CompletePaletteReviewQuality = typeof completePaletteReviewQualities[number]
export type CompletePaletteReviewComparison = typeof completePaletteReviewComparisons[number]
export type CompletePaletteReviewIssueTag = typeof completePaletteReviewIssueTags[number]
export type CompletePaletteReviewSide = "A" | "B"
export type CompletePaletteReviewPresentationVersion =
	typeof completePaletteReviewSupportedPresentationVersions[number]

export type CompletePaletteReviewColor = Readonly<{
	hex: string
	generated: boolean
}>

export type CompletePaletteReviewResearchRender = Readonly<{
	schemaVersion: 1
	field: Readonly<{
		kind: "linear-gradient"
		angleDegrees: 135
		interpolation: "oklab"
		stops: readonly [
			Readonly<{ kind: "role"; role: "background"; position: 0 }>,
			Readonly<{ kind: "source-supported-color"; hex: string; position: 0.5 }>,
			Readonly<{ kind: "role"; role: "surface"; position: 1 }>,
		]
	}>
}>

export type CompletePaletteReviewTreatment = Readonly<{
	roles: Readonly<Record<CompletePaletteReviewRole, CompletePaletteReviewColor>>
	gradient: boolean
	collapse: Readonly<{ surface: boolean; accent: boolean }>
	researchRender?: CompletePaletteReviewResearchRender
}>

export type CompletePaletteReviewSource = Readonly<{
	file: string
	sha256: string
	bytes: number
}>

type CompletePaletteReviewCaseBase = Readonly<{
	caseId: string
	order: number
	source: CompletePaletteReviewSource
}>

export type CompletePaletteAbsoluteReviewCase = CompletePaletteReviewCaseBase & Readonly<{
	treatment: CompletePaletteReviewTreatment
}>

export type CompletePalettePairwiseReviewCase = CompletePaletteReviewCaseBase & Readonly<{
	options: Readonly<Record<CompletePaletteReviewSide, CompletePaletteReviewTreatment>>
	assignment: Readonly<Record<CompletePaletteReviewSide, string>>
}>

type CompletePaletteReviewManifestBase = Readonly<{
	schemaVersion: 1
	reviewVersion: typeof COMPLETE_PALETTE_REVIEW_VERSION
	presentationVersion: CompletePaletteReviewPresentationVersion
	manifestId: string
	title: string
	blinded: boolean
}>

export type CompletePaletteAbsoluteReviewManifest = CompletePaletteReviewManifestBase & Readonly<{
	mode: "absolute"
	cases: readonly CompletePaletteAbsoluteReviewCase[]
}>

export type CompletePalettePairwiseReviewManifest = CompletePaletteReviewManifestBase & Readonly<{
	mode: "pairwise"
	cases: readonly CompletePalettePairwiseReviewCase[]
}>

export type CompletePaletteReviewManifest =
	CompletePaletteAbsoluteReviewManifest | CompletePalettePairwiseReviewManifest

type CompletePaletteReviewFeedbackBase = Readonly<{
	caseId: string
	sourceSha256: string
	comment: string
	submittedAt: string
}>

export type CompletePaletteAbsoluteReviewFeedback = CompletePaletteReviewFeedbackBase & Readonly<{
	quality: CompletePaletteReviewQuality
	issues: readonly CompletePaletteReviewIssueTag[]
}>

export type CompletePalettePairwiseReviewFeedback = CompletePaletteReviewFeedbackBase & Readonly<{
	qualityA: CompletePaletteReviewQuality
	qualityB: CompletePaletteReviewQuality
	comparison: CompletePaletteReviewComparison
	issuesA: readonly CompletePaletteReviewIssueTag[]
	issuesB: readonly CompletePaletteReviewIssueTag[]
}>

export type CompletePaletteReviewFeedback =
	CompletePaletteAbsoluteReviewFeedback | CompletePalettePairwiseReviewFeedback

export type CompletePaletteReviewFeedbackStore = Readonly<{
	schemaVersion: 1
	reviewVersion: typeof COMPLETE_PALETTE_REVIEW_VERSION
	manifestId: string
	entries: readonly CompletePaletteReviewFeedback[]
}>

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isSupportedPresentationVersion(value: unknown): value is CompletePaletteReviewPresentationVersion {
	return typeof value === "string" &&
		(completePaletteReviewSupportedPresentationVersions as readonly string[]).includes(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
	const actual = Object.keys(value).sort()
	const wanted = [...expected].sort()
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
		throw new TypeError(`${label} must contain exactly ${wanted.join(", ")}`)
	}
}

function isSha256(value: unknown): value is string {
	return typeof value === "string" && /^[0-9a-f]{64}$/.test(value)
}

function validTimestamp(value: unknown): value is string {
	return typeof value === "string" && Number.isFinite(Date.parse(value)) &&
		new Date(value).toISOString() === value
}

function validSourceFile(value: unknown): value is string {
	if (typeof value !== "string" || value.length < 1 || value.length > 1_000 ||
		value.startsWith("/") || value.includes("\\")) return false
	const parts = value.split("/")
	return parts.every((part) => part.length > 0 && part !== "." && part !== "..")
}

export function completePaletteReviewCanonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(completePaletteReviewCanonicalJson).join(",")}]`
	const record = value as Record<string, unknown>
	return `{${Object.keys(record).sort().map((key) =>
		`${JSON.stringify(key)}:${completePaletteReviewCanonicalJson(record[key])}`).join(",")}}`
}

export function completePaletteReviewManifestId(
	manifest: Omit<CompletePaletteReviewManifest, "manifestId">,
): string {
	return createHash("sha256").update(completePaletteReviewCanonicalJson(manifest)).digest("hex")
}

function parseSource(value: unknown, label: string): CompletePaletteReviewSource {
	if (!isRecord(value)) throw new TypeError(`${label} must be an object`)
	exactKeys(value, ["file", "sha256", "bytes"], label)
	if (!validSourceFile(value.file) || !isSha256(value.sha256) ||
		!Number.isSafeInteger(value.bytes) || (value.bytes as number) < 1) {
		throw new TypeError(`${label} is invalid`)
	}
	return value as unknown as CompletePaletteReviewSource
}

function parseTreatment(value: unknown, label: string): CompletePaletteReviewTreatment {
	if (!isRecord(value) || !isRecord(value.roles) || !isRecord(value.collapse)) {
		throw new TypeError(`${label} must be a complete treatment`)
	}
	exactKeys(value, ["roles", "gradient", "collapse", ...(value.researchRender === undefined ? [] : ["researchRender"])], label)
	exactKeys(value.roles, completePaletteReviewRoles, `${label} roles`)
	exactKeys(value.collapse, ["surface", "accent"], `${label} collapse`)
	if (typeof value.gradient !== "boolean" || typeof value.collapse.surface !== "boolean" ||
		typeof value.collapse.accent !== "boolean") throw new TypeError(`${label} state is invalid`)
	for (const role of completePaletteReviewRoles) {
		const color = value.roles[role]
		if (!isRecord(color)) throw new TypeError(`${label} ${role} is invalid`)
		exactKeys(color, ["hex", "generated"], `${label} ${role}`)
		if (typeof color.hex !== "string" || !/^#[0-9a-f]{6}$/.test(color.hex) ||
			typeof color.generated !== "boolean") throw new TypeError(`${label} ${role} is invalid`)
	}
	const treatment = value as unknown as CompletePaletteReviewTreatment
	const hex = Object.fromEntries(completePaletteReviewRoles.map((role) =>
		[role, treatment.roles[role].hex])) as Record<CompletePaletteReviewRole, string>
	if (treatment.collapse.surface !== (hex.surface === hex.background) ||
		treatment.collapse.accent !== (hex.accent === hex.foreground) ||
		hex.background === hex.foreground || (treatment.gradient && treatment.collapse.surface)) {
		throw new TypeError(`${label} collapse or gradient is illegal`)
	}
	for (let first = 0; first < completePaletteReviewRoles.length; first++) {
		for (let second = first + 1; second < completePaletteReviewRoles.length; second++) {
			const pair = `${completePaletteReviewRoles[first]}:${completePaletteReviewRoles[second]}`
			if (hex[completePaletteReviewRoles[first]] === hex[completePaletteReviewRoles[second]] &&
				pair !== "background:surface" && pair !== "foreground:accent") {
				throw new TypeError(`${label} contains an illegal role equality`)
			}
		}
	}
	const cardinality = new Set(Object.values(hex)).size
	if (cardinality < 2 || cardinality > 4) throw new TypeError(`${label} must use two through four colors`)
	if (value.researchRender !== undefined) {
		const render = parseCompletePaletteReviewResearchRender(value.researchRender, `${label} research render`)
		const midpoint = render.field.stops[1].hex
		if (!treatment.gradient || treatment.collapse.surface || midpoint === hex.background || midpoint === hex.surface) {
			throw new TypeError(`${label} research render is incompatible with its treatment`)
		}
	}
	return treatment
}

export function parseCompletePaletteReviewResearchRender(
	value: unknown,
	label = "Complete-palette research render",
): CompletePaletteReviewResearchRender {
	if (!isRecord(value) || !isRecord(value.field)) throw new TypeError(`${label} must be an object`)
	exactKeys(value, ["schemaVersion", "field"], label)
	exactKeys(value.field, ["kind", "angleDegrees", "interpolation", "stops"], `${label} field`)
	if (value.schemaVersion !== 1 || value.field.kind !== "linear-gradient" || value.field.angleDegrees !== 135 ||
		value.field.interpolation !== "oklab" || !Array.isArray(value.field.stops) || value.field.stops.length !== 3) {
		throw new TypeError(`${label} field protocol is invalid`)
	}
	const [background, midpoint, surface] = value.field.stops
	for (const [index, stop] of value.field.stops.entries()) {
		if (!isRecord(stop)) throw new TypeError(`${label} stop ${index} is invalid`)
	}
	if (!isRecord(background) || !isRecord(midpoint) || !isRecord(surface)) {
		throw new TypeError(`${label} stops are invalid`)
	}
	exactKeys(background, ["kind", "role", "position"], `${label} background stop`)
	exactKeys(midpoint, ["kind", "hex", "position"], `${label} midpoint stop`)
	exactKeys(surface, ["kind", "role", "position"], `${label} surface stop`)
	if (background.kind !== "role" || background.role !== "background" || background.position !== 0 ||
		midpoint.kind !== "source-supported-color" || typeof midpoint.hex !== "string" ||
		!/^#[0-9a-f]{6}$/.test(midpoint.hex) || midpoint.position !== 0.5 || surface.kind !== "role" ||
		surface.role !== "surface" || surface.position !== 1) throw new TypeError(`${label} stops are invalid`)
	return value as unknown as CompletePaletteReviewResearchRender
}

export function parseCompletePaletteReviewManifest(value: unknown): CompletePaletteReviewManifest {
	if (!isRecord(value)) throw new TypeError("Complete-palette review manifest must be an object")
	exactKeys(value, [
		"schemaVersion", "reviewVersion", "presentationVersion", "manifestId", "title", "mode", "blinded", "cases",
	], "Complete-palette review manifest")
	if (value.schemaVersion !== 1 || value.reviewVersion !== COMPLETE_PALETTE_REVIEW_VERSION ||
		!isSupportedPresentationVersion(value.presentationVersion) || !isSha256(value.manifestId) ||
		typeof value.title !== "string" || value.title.trim().length < 1 || value.title.length > 200 ||
		!completePaletteReviewModes.includes(value.mode as CompletePaletteReviewMode) ||
		typeof value.blinded !== "boolean" || !Array.isArray(value.cases) ||
		value.cases.length < 1 || value.cases.length > 100) {
		throw new TypeError("Complete-palette review manifest header is invalid")
	}
	const caseIds = new Set<string>()
	const orders = new Set<number>()
	const sourceBindings = new Map<string, string>()
	for (const [index, candidate] of value.cases.entries()) {
		if (!isRecord(candidate)) throw new TypeError(`Review case ${index} must be an object`)
		const pairwise = value.mode === "pairwise"
		exactKeys(candidate, pairwise
			? ["caseId", "order", "source", "options", "assignment"]
			: ["caseId", "order", "source", "treatment"], `Review case ${index}`)
		if (typeof candidate.caseId !== "string" || !/^[A-Za-z0-9._-]{1,200}$/.test(candidate.caseId) ||
			caseIds.has(candidate.caseId) || !Number.isInteger(candidate.order) ||
			(candidate.order as number) < 0 || orders.has(candidate.order as number)) {
			throw new TypeError(`Review case ${index} identity is invalid`)
		}
		const source = parseSource(candidate.source, `Review case ${index} source`)
		const sourceIdentity = `${source.sha256}:${source.bytes}`
		if (sourceBindings.has(source.file) && sourceBindings.get(source.file) !== sourceIdentity) {
			throw new TypeError(`Review case ${index} conflicts with another source binding`)
		}
		sourceBindings.set(source.file, sourceIdentity)
		if (pairwise) {
			if (!isRecord(candidate.options) || !isRecord(candidate.assignment)) {
				throw new TypeError(`Review case ${index} pair is invalid`)
			}
			exactKeys(candidate.options, ["A", "B"], `Review case ${index} options`)
			exactKeys(candidate.assignment, ["A", "B"], `Review case ${index} assignment`)
			parseTreatment(candidate.options.A, `Review case ${index} option A`)
			parseTreatment(candidate.options.B, `Review case ${index} option B`)
			if (typeof candidate.assignment.A !== "string" || candidate.assignment.A.trim().length < 1 ||
				candidate.assignment.A.length > 200 || typeof candidate.assignment.B !== "string" ||
				candidate.assignment.B.trim().length < 1 || candidate.assignment.B.length > 200 ||
				candidate.assignment.A === candidate.assignment.B) {
				throw new TypeError(`Review case ${index} assignment is invalid`)
			}
		} else {
			parseTreatment(candidate.treatment, `Review case ${index} treatment`)
		}
		caseIds.add(candidate.caseId)
		orders.add(candidate.order as number)
	}
	if ([...orders].sort((first, second) => first - second).some((order, index) => order !== index)) {
		throw new TypeError("Review case order must be contiguous from zero")
	}
	const manifest = value as unknown as CompletePaletteReviewManifest
	const { manifestId, ...identity } = manifest
	if (completePaletteReviewManifestId(identity) !== manifestId) {
		throw new TypeError("Complete-palette review manifest identity is stale")
	}
	return manifest
}

function parseIssues(value: unknown, label: string): CompletePaletteReviewIssueTag[] {
	if (!Array.isArray(value) || new Set(value).size !== value.length ||
		!value.every((tag) => typeof tag === "string" &&
			completePaletteReviewIssueTags.includes(tag as CompletePaletteReviewIssueTag))) {
		throw new TypeError(`${label} must be a unique subset of the canonical issue tags`)
	}
	return value as CompletePaletteReviewIssueTag[]
}

export function parseCompletePaletteReviewFeedback(
	value: unknown,
	manifest: CompletePaletteReviewManifest,
	stored: boolean,
): CompletePaletteReviewFeedback {
	if (!isRecord(value)) throw new TypeError("Complete-palette review feedback must be an object")
	const pairwise = manifest.mode === "pairwise"
	exactKeys(value, ["caseId", "sourceSha256", ...(pairwise
		? ["qualityA", "qualityB", "comparison", "issuesA", "issuesB"]
		: ["quality", "issues"]), "comment", ...(stored ? ["submittedAt"] : [])],
	"Complete-palette review feedback")
	const reviewCase = manifest.cases.find((candidate) => candidate.caseId === value.caseId)
	if (!reviewCase || value.sourceSha256 !== reviewCase.source.sha256 ||
		typeof value.comment !== "string" || value.comment.length > 2_000) {
		throw new TypeError("Complete-palette review feedback is invalid or stale")
	}
	if (stored && !validTimestamp(value.submittedAt)) throw new TypeError("Feedback timestamp is invalid")
	const submittedAt = stored ? value.submittedAt as string : new Date().toISOString()
	if (pairwise) {
		if (!completePaletteReviewQualities.includes(value.qualityA as CompletePaletteReviewQuality) ||
			!completePaletteReviewQualities.includes(value.qualityB as CompletePaletteReviewQuality) ||
			!completePaletteReviewComparisons.includes(value.comparison as CompletePaletteReviewComparison)) {
			throw new TypeError("Pairwise feedback requires both qualities and one comparison")
		}
		return {
			caseId: reviewCase.caseId,
			sourceSha256: reviewCase.source.sha256,
			qualityA: value.qualityA as CompletePaletteReviewQuality,
			qualityB: value.qualityB as CompletePaletteReviewQuality,
			comparison: value.comparison as CompletePaletteReviewComparison,
			issuesA: parseIssues(value.issuesA, "Option A issues"),
			issuesB: parseIssues(value.issuesB, "Option B issues"),
			comment: value.comment,
			submittedAt,
		}
	}
	if (!completePaletteReviewQualities.includes(value.quality as CompletePaletteReviewQuality)) {
		throw new TypeError("Absolute feedback requires one quality")
	}
	return {
		caseId: reviewCase.caseId,
		sourceSha256: reviewCase.source.sha256,
		quality: value.quality as CompletePaletteReviewQuality,
		issues: parseIssues(value.issues, "Treatment issues"),
		comment: value.comment,
		submittedAt,
	}
}

export const parseCompletePaletteReviewFeedbackEntry = parseCompletePaletteReviewFeedback

export function parseCompletePaletteReviewFeedbackStore(
	value: unknown,
	manifest: CompletePaletteReviewManifest,
): CompletePaletteReviewFeedbackStore {
	if (!isRecord(value)) throw new TypeError("Complete-palette review feedback store must be an object")
	exactKeys(value, ["schemaVersion", "reviewVersion", "manifestId", "entries"], "Feedback store")
	if (value.schemaVersion !== 1 || value.reviewVersion !== COMPLETE_PALETTE_REVIEW_VERSION ||
		value.manifestId !== manifest.manifestId || !Array.isArray(value.entries)) {
		throw new TypeError("Feedback store does not match the review manifest")
	}
	const entries = value.entries.map((entry) => parseCompletePaletteReviewFeedback(entry, manifest, true))
	if (new Set(entries.map((entry) => entry.caseId)).size !== entries.length) {
		throw new TypeError("Feedback store contains duplicate cases")
	}
	return {
		schemaVersion: 1,
		reviewVersion: COMPLETE_PALETTE_REVIEW_VERSION,
		manifestId: manifest.manifestId,
		entries,
	}
}

function rgb(hex: string): RGB {
	return [
		Number.parseInt(hex.slice(1, 3), 16),
		Number.parseInt(hex.slice(3, 5), 16),
		Number.parseInt(hex.slice(5, 7), 16),
	]
}

function presentTreatment(treatment: CompletePaletteReviewTreatment) {
	const names = namePalette(completePaletteReviewRoles.map((role) => rgb(treatment.roles[role].hex)))
	return {
		roles: Object.fromEntries(completePaletteReviewRoles.map((role, index) => [role, {
			hex: treatment.roles[role].hex,
			generated: treatment.roles[role].generated,
			nearestName: names[index].nearestName,
		}])) as Record<CompletePaletteReviewRole, CompletePaletteReviewColor & { nearestName: string }>,
		gradient: treatment.gradient,
		collapse: treatment.collapse,
		...(treatment.researchRender ? {
			researchRender: {
				...treatment.researchRender,
				field: {
					...treatment.researchRender.field,
					stops: treatment.researchRender.field.stops.map((stop) => stop.kind === "source-supported-color"
						? { ...stop, nearestName: namePalette([rgb(stop.hex)])[0].nearestName }
						: stop),
				},
			},
		} : {}),
	}
}

export function completePaletteReviewPublicPayload(manifest: CompletePaletteReviewManifest) {
	return {
		schemaVersion: 1 as const,
		reviewVersion: manifest.reviewVersion,
		presentationVersion: manifest.presentationVersion,
		manifestId: manifest.manifestId,
		title: manifest.title,
		mode: manifest.mode,
		blinded: manifest.blinded,
		colorNamePolicy: COMPLETE_PALETTE_REVIEW_COLOR_NAME_POLICY,
		cases: manifest.cases.map((reviewCase) => manifest.mode === "absolute"
			? {
				caseId: reviewCase.caseId,
				order: reviewCase.order,
				sourceSha256: reviewCase.source.sha256,
				artworkUrl: `/artwork/${encodeURIComponent(reviewCase.caseId)}`,
				treatment: presentTreatment(reviewCase.treatment),
			}
			: {
				caseId: reviewCase.caseId,
				order: reviewCase.order,
				sourceSha256: reviewCase.source.sha256,
				artworkUrl: `/artwork/${encodeURIComponent(reviewCase.caseId)}`,
				options: {
					A: presentTreatment(reviewCase.options.A),
					B: presentTreatment(reviewCase.options.B),
				},
				...(manifest.blinded ? {} : { assignment: reviewCase.assignment }),
			}),
	}
}

export const publicCompletePaletteReviewPayload = completePaletteReviewPublicPayload
