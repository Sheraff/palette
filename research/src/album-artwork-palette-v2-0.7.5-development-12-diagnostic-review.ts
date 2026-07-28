import { createHash } from "node:crypto"
import { access } from "node:fs/promises"

export const REVIEW_PROTOCOL_ID =
	"album-artwork-ui-palette-protocol-v2-0.7.5-development-12-diagnostic-review-1" as const
export const REVIEW_VERSION =
	"album-artwork-palette-v2-0.7.5-development-12-diagnostic-review-1.0.0" as const
export const PRESENTATION_VERSION = "album-artwork-palette-v2-complete-treatment-presentation-1" as const
export const RENDERER_ID = "album-artwork-palette-v2-complete-treatment-renderer-1" as const
export const COLOR_NAME_POLICY = "colornames-oklab-0.6.0-nearest-oklab-presentation-only" as const
export const SIDE_ASSIGNMENT_DOMAIN = `${REVIEW_PROTOCOL_ID}/side-assignment` as const
export const PUBLIC_ITEM_DOMAIN = `${REVIEW_PROTOCOL_ID}/public-item` as const
export const MEDIA_TOKEN_DOMAIN = `${REVIEW_PROTOCOL_ID}/media` as const
export const IMPLEMENTATION_BINDING_DOMAIN = `${REVIEW_PROTOCOL_ID}/implementation-binding` as const

export const MANIFEST_RELATIVE_PATH =
	"research/data/experiments/album-artwork-palette-v2-0.7.5-development-12-diagnostic-review/review-manifest.private.json" as const
export const FEEDBACK_RELATIVE_PATH =
	"research/data/experiments/album-artwork-palette-v2-0.7.5-development-12-diagnostic-review/review-feedback.json" as const
export const REVIEW_APP_RELATIVE_PATH =
	"research/album-artwork-palette-v2-0.7.5-development-12-diagnostic-review" as const

export const ROLES = ["background", "surface", "foreground", "accent"] as const
export const SIDES = ["A", "B"] as const
export const ABSOLUTE_QUALITY_VALUES = [
	"strong",
	"acceptable",
	"weak-fallback",
	"unacceptable",
	"uncertain",
] as const
export const BLINDED_RELATIVE_VALUES = [
	"a-stronger",
	"b-stronger",
	"similarly-valid",
	"neither-acceptable",
	"uncertain",
] as const
export const RELATIVE_OUTCOME_VALUES = [
	"candidate-stronger",
	"baseline-stronger",
	"similarly-valid",
	"neither-acceptable",
	"uncertain",
] as const
export const ISSUE_TAGS = [
	"missing gradient",
	"extraneous gradient",
	"incomplete artwork identity",
] as const

export const FORBIDDEN_AUTHORIZATIONS = [
	"serveOrOpenReview",
	"inspectRenderedReview",
	"humanReview",
	"feedbackSubmission",
	"feedbackAnalysis",
	"responseAnalysis",
	"protectedOrFreshArtworkAccess",
	"otherArtworkAccess",
	"otherTreatmentAccess",
	"paletteInference",
	"inferenceChange",
	"candidateProtocol",
	"candidateImplementation",
	"candidateOutput",
	"rankingChange",
	"candidateSupport",
	"candidateFreeze",
	"promotion",
	"persistence",
	"defaultExtractorChange",
	"productBaselineChange",
	"productionReplacement",
	"phase4",
	"phase5",
	"fullRoster",
	"multiHourRun",
	"fullRunGo",
	"learnedModel",
	"commentOrColorNameInInference",
] as const

export const BOUND_CASE = {
	caseId: "development-12",
	file: "images/vvbrown.jpg",
	sourceSha256: "06c5954c94eb50d02b71f5895503e1729c019e390e190b6f603f42ff25a282e0",
	byteCount: 57_673,
	artworkId: "exact:06c5954c94eb50d02b71f5895503e1729c019e390e190b6f603f42ff25a282e0",
	controlKey: "#fffffe:#fffffe:#080808:#584c1c:flat",
	alternativeKey: "#fffffe:#fffffe:#e6e622:#584c1c:flat",
	controlSlateIndex: 0,
	alternativeSlateIndex: 1,
	artifactPath:
		"research/data/experiments/album-artwork-palette-v2-0.7.4-development/sources/development-12.json",
	artifactRawSha256: "2fd1a63bca5838bbbc0fb6655700532955454fd21d201b06975903bf1d1e0ffd",
} as const

export const AUTHORITATIVE_BINDINGS = [
	{
		kind: "diagnostic-postmortem",
		path: "research/ALBUM_ARTWORK_UI_PALETTE_0_7_5_KNOWN_FAILURE_DIAGNOSTIC_POSTMORTEM.md",
		rawSha256: "3b6892ce36af983206119b650c3cc35e567e63fd530d9a10417f3a100a97d076",
		semanticIds: ["album-artwork-ui-palette-v2-0.7.5-known-failure-diagnostic-postmortem-1"],
	},
	{
		kind: "known-bad-roster",
		path: "research/data/album-artwork-palette-v2-0.7.5-known-bad-roster.json",
		rawSha256: "6ab3c41f60b35bc87a53ee8da887dc7daa1d76cba0774ff15bfb0a858b6248b3",
		semanticIds: [
			"album-artwork-palette-v2-0.7.5-known-bad-roster-1.0.0",
			"0ce0465834d82b1a72e931eab21e5a4b318eac14919c4bb07b59e5e7e5653c6f",
		],
	},
	{
		kind: "known-failure-audit",
		path: "research/data/album-artwork-palette-v2-0.7.5-known-failure-audit.json",
		rawSha256: "5a9302296c617512788d02edeac1a3f7d7ce1c183b11d7a98c6de9a277423cdf",
		semanticIds: [
			"album-artwork-palette-v2-0.7.5-known-failure-audit-1.0.0",
			"1fb095ab8d331694eaf09ab5405532961ca3e4845142ddc92b14f88bc5f54ae1",
		],
	},
	{
		kind: "checked-0.7.4-source-artifact",
		path: BOUND_CASE.artifactPath,
		rawSha256: BOUND_CASE.artifactRawSha256,
		semanticIds: [
			"album-artwork-first-principles-0.7.4",
			"album-artwork-ui-palette-protocol-v2-0.7.4",
			"a80f75b402a12516fb00f2afb3dd56e4c0fb8a4a5f7d8d5284e557eec87a3d09",
			"0a0bf7b95bc683882fada068d363fcab7e022420d0867261228aaab51ed68bd3",
		],
	},
	{
		kind: "development-panel",
		path: "research/data/album-artwork-palette-v2-development-panel.json",
		rawSha256: "9258032b8ea2d40166d2be89767f5b15341145de314b007c09e766ffbaac75e4",
		semanticIds: ["bd7ad739ada8a35385018737c7ad8d9563b1b6619c695c0ccc0e2a5b87488305"],
	},
	{
		kind: "development-source",
		path: BOUND_CASE.file,
		rawSha256: BOUND_CASE.sourceSha256,
		semanticIds: [BOUND_CASE.caseId, BOUND_CASE.artworkId],
	},
] as const

export const IMPLEMENTATION_PATHS = [
	"research/ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_7_5_DEVELOPMENT_12_DIAGNOSTIC_REVIEW.md",
	"research/src/album-artwork-palette-v2-0.7.5-development-12-diagnostic-review.ts",
	"research/prepare-album-artwork-palette-v2-0.7.5-development-12-diagnostic-review.ts",
	"research/verify-album-artwork-palette-v2-0.7.5-development-12-diagnostic-review.ts",
	"research/serve-album-artwork-palette-v2-0.7.5-development-12-diagnostic-review.ts",
	"research/tests/album-artwork-palette-v2-0.7.5-development-12-diagnostic-review.test.ts",
	`${REVIEW_APP_RELATIVE_PATH}/index.html`,
	`${REVIEW_APP_RELATIVE_PATH}/app.js`,
	`${REVIEW_APP_RELATIVE_PATH}/styles.css`,
	"research/data/experiments/album-artwork-palette-v2-0.7.5-development-12-diagnostic-review/README.md",
	"package.json",
] as const

export type ReviewRole = typeof ROLES[number]
export type ReviewSide = typeof SIDES[number]
export type AbsoluteQuality = typeof ABSOLUTE_QUALITY_VALUES[number]
export type BlindedRelative = typeof BLINDED_RELATIVE_VALUES[number]
export type RelativeOutcome = typeof RELATIVE_OUTCOME_VALUES[number]
export type IssueTag = typeof ISSUE_TAGS[number]

export type ReviewColor = Readonly<{ hex: string; nearestName: string; generated: boolean }>
export type ReviewPalette = Readonly<{
	roles: Readonly<Record<ReviewRole, ReviewColor>>
	gradient: boolean
	collapse: Readonly<{ surface: boolean; accent: boolean }>
}>
export type ReviewTreatment = Readonly<{
	key: string
	slateIndex: number
	reviewed: boolean
	treatmentRecordSha256: string
	palette: ReviewPalette
}>
export type PrivateReviewItem = Readonly<{
	internalCaseId: typeof BOUND_CASE.caseId
	publicItemId: string
	mediaToken: string
	order: 0
	source: Readonly<{
		file: typeof BOUND_CASE.file
		sha256: typeof BOUND_CASE.sourceSha256
		byteCount: typeof BOUND_CASE.byteCount
		artworkId: typeof BOUND_CASE.artworkId
		cohort: "development"
	}>
	checkedArtifact: Readonly<{
		path: typeof BOUND_CASE.artifactPath
		rawSha256: typeof BOUND_CASE.artifactRawSha256
		candidateVersion: "album-artwork-first-principles-0.7.4"
		scientificSha256: "0a0bf7b95bc683882fada068d363fcab7e022420d0867261228aaab51ed68bd3"
	}>
	comparison: Readonly<{ control: ReviewTreatment; alternative: ReviewTreatment }>
	assignment: Readonly<{
		digest: string
		A: "alternative" | "control"
		B: "alternative" | "control"
	}>
	options: Readonly<Record<ReviewSide, ReviewPalette>>
}>
export type FileBinding = Readonly<{
	path: string
	semanticIds: readonly string[]
	byteCount: number
	rawSha256: string
}>
export type PrivateReviewManifest = Readonly<{
	schemaVersion: 1
	protocolId: typeof REVIEW_PROTOCOL_ID
	reviewVersion: typeof REVIEW_VERSION
	presentationVersion: typeof PRESENTATION_VERSION
	contentId: string
	scope: Readonly<{
		evidenceClass: "bounded-development-known-failure-diagnostic"
		purpose: "one-item-retained-alternative-quality-diagnosis"
		itemCount: 1
		exactSourceCaseIds: readonly [typeof BOUND_CASE.caseId]
		protectedOrFreshArtworkRootsAccessed: 0
	}>
	authoritativeBindings: readonly FileBinding[]
	implementationBindings: readonly FileBinding[]
	presentation: Readonly<Record<string, unknown>>
	responseSchema: Readonly<Record<string, unknown>>
	authorization: Readonly<Record<string, boolean>>
	items: readonly [PrivateReviewItem]
}>
export type ReviewResponse = Readonly<{
	itemId: string
	qualityA: AbsoluteQuality
	qualityB: AbsoluteQuality
	relative: BlindedRelative
	issuesA: readonly IssueTag[]
	issuesB: readonly IssueTag[]
	comment: string
}>
export type ReviewSubmission = Readonly<{
	schemaVersion: 1
	reviewId: string
	responses: readonly [ReviewResponse]
}>
export type StoredReviewResponse = Readonly<Omit<ReviewResponse, "relative"> & {
	relativeOutcome: RelativeOutcome
}>
export type StoredReviewFeedback = Readonly<{
	schemaVersion: 1
	reviewVersion: typeof REVIEW_VERSION
	contentId: string
	responses: readonly [StoredReviewResponse]
	manifestRawSha256: string
	submittedAt: string
	submissionId: string
}>

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value)
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

export function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
	const record = value as Record<string, unknown>
	return `{${Object.keys(record).sort().map((key) =>
		`${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`
}

export function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

export async function refuseExistingReviewArtifact(path: string): Promise<void> {
	try {
		await access(path)
		throw new Error(`Refusing to overwrite existing review artifact: ${path}`)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
	}
}

export function implementationSemanticId(path: string, rawSha256: string): string {
	return sha256(canonicalJson({ domain: IMPLEMENTATION_BINDING_DOMAIN, path, rawSha256 }))
}

export function reviewManifestContentId(value: Omit<PrivateReviewManifest, "contentId">): string {
	return sha256(canonicalJson(value))
}

export function sideAssignmentDigest(sourceSha256: string, alternativeTreatmentKey: string,
	controlTreatmentKey: string): string {
	return sha256(canonicalJson({
		alternativeTreatmentKey,
		controlTreatmentKey,
		domain: SIDE_ASSIGNMENT_DOMAIN,
		protocolId: REVIEW_PROTOCOL_ID,
		reviewVersion: REVIEW_VERSION,
		sourceSha256,
	}))
}

export function alternativeSide(sourceSha256: string, alternativeTreatmentKey: string,
	controlTreatmentKey: string): ReviewSide {
	return Number.parseInt(sideAssignmentDigest(sourceSha256, alternativeTreatmentKey, controlTreatmentKey).slice(0, 2), 16) % 2 === 0
		? "A"
		: "B"
}

export function publicItemId(sourceSha256: string): string {
	return sha256(`${PUBLIC_ITEM_DOMAIN}\0${sourceSha256}`).slice(0, 24)
}

export function mediaToken(sourceSha256: string): string {
	return sha256(`${MEDIA_TOKEN_DOMAIN}\0${sourceSha256}`).slice(0, 32)
}

export function paletteKey(palette: ReviewPalette): string {
	return [
		palette.roles.background.hex,
		palette.roles.surface.hex,
		palette.roles.foreground.hex,
		palette.roles.accent.hex,
		palette.gradient ? "gradient" : "flat",
	].join(":")
}

function parsePalette(value: unknown, label: string): ReviewPalette {
	if (!isRecord(value) || !isRecord(value.roles) || !isRecord(value.collapse)) {
		throw new TypeError(`${label} must be a complete palette`)
	}
	exactKeys(value, ["roles", "gradient", "collapse"], label)
	exactKeys(value.roles, ROLES, `${label} roles`)
	exactKeys(value.collapse, ["surface", "accent"], `${label} collapse`)
	if (typeof value.gradient !== "boolean" || typeof value.collapse.surface !== "boolean" ||
		typeof value.collapse.accent !== "boolean") throw new TypeError(`${label} treatment fields are invalid`)
	for (const role of ROLES) {
		const color = value.roles[role]
		if (!isRecord(color)) throw new TypeError(`${label} ${role} is invalid`)
		exactKeys(color, ["hex", "nearestName", "generated"], `${label} ${role}`)
		if (typeof color.hex !== "string" || !/^#[0-9a-f]{6}$/.test(color.hex) ||
			typeof color.nearestName !== "string" || color.nearestName.length < 1 || color.nearestName.length > 200 ||
			typeof color.generated !== "boolean") throw new TypeError(`${label} ${role} presentation is invalid`)
	}
	const palette = value as unknown as ReviewPalette
	if (palette.collapse.surface !== (palette.roles.surface.hex === palette.roles.background.hex) ||
		palette.collapse.accent !== (palette.roles.accent.hex === palette.roles.foreground.hex) ||
		palette.roles.background.hex === palette.roles.foreground.hex ||
		(palette.gradient && palette.collapse.surface)) throw new TypeError(`${label} collapse or gradient is invalid`)
	return palette
}

function parseBinding(value: unknown, label: string): FileBinding {
	if (!isRecord(value)) throw new TypeError(`${label} is invalid`)
	exactKeys(value, ["path", "semanticIds", "byteCount", "rawSha256"], label)
	if (typeof value.path !== "string" || !Array.isArray(value.semanticIds) || value.semanticIds.length < 1 ||
		!value.semanticIds.every((id) => typeof id === "string" && id.length > 0) ||
		!Number.isSafeInteger(value.byteCount) || (value.byteCount as number) < 1 || !isSha256(value.rawSha256)) {
		throw new TypeError(`${label} is invalid`)
	}
	return value as unknown as FileBinding
}

function parseTreatment(value: unknown, label: string, expectedKey: string, expectedIndex: number,
	expectedReviewed: boolean): ReviewTreatment {
	if (!isRecord(value)) throw new TypeError(`${label} is invalid`)
	exactKeys(value, ["key", "slateIndex", "reviewed", "treatmentRecordSha256", "palette"], label)
	const palette = parsePalette(value.palette, `${label} palette`)
	if (value.key !== expectedKey || value.slateIndex !== expectedIndex || value.reviewed !== expectedReviewed ||
		!isSha256(value.treatmentRecordSha256) || paletteKey(palette) !== expectedKey) {
		throw new TypeError(`${label} does not match its bound public-slate treatment`)
	}
	return value as unknown as ReviewTreatment
}

export function parsePrivateReviewManifest(value: unknown): PrivateReviewManifest {
	if (!isRecord(value)) throw new TypeError("Private review manifest must be an object")
	exactKeys(value, [
		"schemaVersion", "protocolId", "reviewVersion", "presentationVersion", "contentId", "scope",
		"authoritativeBindings", "implementationBindings", "presentation", "responseSchema", "authorization", "items",
	], "Private review manifest")
	if (value.schemaVersion !== 1 || value.protocolId !== REVIEW_PROTOCOL_ID || value.reviewVersion !== REVIEW_VERSION ||
		value.presentationVersion !== PRESENTATION_VERSION || !isSha256(value.contentId) || !isRecord(value.scope) ||
		!Array.isArray(value.authoritativeBindings) || !Array.isArray(value.implementationBindings) ||
		!isRecord(value.presentation) || !isRecord(value.responseSchema) || !isRecord(value.authorization) ||
		!Array.isArray(value.items)) throw new TypeError("Private review manifest header is invalid")
	exactKeys(value.scope, [
		"evidenceClass", "purpose", "itemCount", "exactSourceCaseIds", "protectedOrFreshArtworkRootsAccessed",
	], "Private review scope")
	if (value.scope.evidenceClass !== "bounded-development-known-failure-diagnostic" ||
		value.scope.purpose !== "one-item-retained-alternative-quality-diagnosis" || value.scope.itemCount !== 1 ||
		value.scope.protectedOrFreshArtworkRootsAccessed !== 0 ||
		canonicalJson(value.scope.exactSourceCaseIds) !== canonicalJson([BOUND_CASE.caseId]) || value.items.length !== 1) {
		throw new TypeError("Private review scope changed")
	}
	const authoritativeBindings = value.authoritativeBindings.map((binding, index) =>
		parseBinding(binding, `Authoritative binding ${index}`))
	if (canonicalJson(authoritativeBindings.map(({ path, semanticIds, rawSha256 }) => ({ path, semanticIds, rawSha256 }))) !==
		canonicalJson(AUTHORITATIVE_BINDINGS.map(({ path, semanticIds, rawSha256 }) => ({ path, semanticIds, rawSha256 })))) {
		throw new TypeError("Authoritative binding set changed")
	}
	const implementationBindings = value.implementationBindings.map((binding, index) =>
		parseBinding(binding, `Implementation binding ${index}`))
	if (canonicalJson(implementationBindings.map(({ path }) => path)) !== canonicalJson(IMPLEMENTATION_PATHS)) {
		throw new TypeError("Implementation binding path set changed")
	}
	for (const binding of implementationBindings) {
		const expectedSemanticId = binding.path.endsWith("DIAGNOSTIC_REVIEW.md")
			? REVIEW_PROTOCOL_ID
			: implementationSemanticId(binding.path, binding.rawSha256)
		if (canonicalJson(binding.semanticIds) !== canonicalJson([expectedSemanticId])) {
			throw new TypeError(`Implementation semantic ID changed: ${binding.path}`)
		}
	}
	const requiredAuthorizations = ["diagnosticReviewPreparation", "immutableReviewPackage", "focusedVerification"]
	exactKeys(value.authorization, [...requiredAuthorizations, ...FORBIDDEN_AUTHORIZATIONS], "Private review authorization")
	for (const key of requiredAuthorizations) {
		if (value.authorization[key] !== true) throw new TypeError(`Required authorization ${key} is absent`)
	}
	for (const key of FORBIDDEN_AUTHORIZATIONS) {
		if (value.authorization[key] !== false) throw new TypeError(`Forbidden authorization ${key} must be false`)
	}
	const itemValue = value.items[0]
	if (!isRecord(itemValue) || !isRecord(itemValue.source) || !isRecord(itemValue.checkedArtifact) ||
		!isRecord(itemValue.comparison) || !isRecord(itemValue.assignment) || !isRecord(itemValue.options)) {
		throw new TypeError("Private review item is invalid")
	}
	exactKeys(itemValue, [
		"internalCaseId", "publicItemId", "mediaToken", "order", "source", "checkedArtifact", "comparison",
		"assignment", "options",
	], "Private review item")
	exactKeys(itemValue.source, ["file", "sha256", "byteCount", "artworkId", "cohort"], "Private review source")
	exactKeys(itemValue.checkedArtifact, ["path", "rawSha256", "candidateVersion", "scientificSha256"],
		"Private review checked artifact")
	exactKeys(itemValue.comparison, ["control", "alternative"], "Private review comparison")
	exactKeys(itemValue.assignment, ["digest", "A", "B"], "Private review assignment")
	exactKeys(itemValue.options, SIDES, "Private review options")
	if (itemValue.internalCaseId !== BOUND_CASE.caseId || itemValue.order !== 0 ||
		itemValue.publicItemId !== publicItemId(BOUND_CASE.sourceSha256) ||
		itemValue.mediaToken !== mediaToken(BOUND_CASE.sourceSha256) || itemValue.source.file !== BOUND_CASE.file ||
		itemValue.source.sha256 !== BOUND_CASE.sourceSha256 || itemValue.source.byteCount !== BOUND_CASE.byteCount ||
		itemValue.source.artworkId !== BOUND_CASE.artworkId || itemValue.source.cohort !== "development" ||
		itemValue.checkedArtifact.path !== BOUND_CASE.artifactPath ||
		itemValue.checkedArtifact.rawSha256 !== BOUND_CASE.artifactRawSha256 ||
		itemValue.checkedArtifact.candidateVersion !== "album-artwork-first-principles-0.7.4" ||
		itemValue.checkedArtifact.scientificSha256 !== "0a0bf7b95bc683882fada068d363fcab7e022420d0867261228aaab51ed68bd3") {
		throw new TypeError("Private review item identity changed")
	}
	const control = parseTreatment(itemValue.comparison.control, "Control treatment", BOUND_CASE.controlKey,
		BOUND_CASE.controlSlateIndex, true)
	const alternative = parseTreatment(itemValue.comparison.alternative, "Alternative treatment", BOUND_CASE.alternativeKey,
		BOUND_CASE.alternativeSlateIndex, false)
	const digest = sideAssignmentDigest(BOUND_CASE.sourceSha256, BOUND_CASE.alternativeKey, BOUND_CASE.controlKey)
	const side = alternativeSide(BOUND_CASE.sourceSha256, BOUND_CASE.alternativeKey, BOUND_CASE.controlKey)
	if (itemValue.assignment.digest !== digest || itemValue.assignment[side] !== "alternative" ||
		itemValue.assignment[side === "A" ? "B" : "A"] !== "control") throw new TypeError("Side assignment changed")
	const optionA = parsePalette(itemValue.options.A, "Option A")
	const optionB = parsePalette(itemValue.options.B, "Option B")
	if (canonicalJson(optionA) !== canonicalJson(itemValue.assignment.A === "alternative" ? alternative.palette : control.palette) ||
		canonicalJson(optionB) !== canonicalJson(itemValue.assignment.B === "alternative" ? alternative.palette : control.palette)) {
		throw new TypeError("Displayed options do not match the blinded assignment")
	}
	const manifest = value as unknown as PrivateReviewManifest
	const { contentId, ...identity } = manifest
	if (reviewManifestContentId(identity) !== contentId) throw new TypeError("Private review manifest content ID is stale")
	return manifest
}

function parseIssues(value: unknown, label: string): IssueTag[] {
	if (!Array.isArray(value) || new Set(value).size !== value.length ||
		!value.every((tag) => typeof tag === "string" && ISSUE_TAGS.includes(tag as IssueTag))) {
		throw new TypeError(`${label} must be a unique subset of the bounded issue tags`)
	}
	return value as IssueTag[]
}

export function parseReviewSubmission(value: unknown, manifest: PrivateReviewManifest): ReviewSubmission {
	if (!isRecord(value)) throw new TypeError("Review submission must be an object")
	exactKeys(value, ["schemaVersion", "reviewId", "responses"], "Review submission")
	if (value.schemaVersion !== 1 || value.reviewId !== manifest.contentId || !Array.isArray(value.responses) ||
		value.responses.length !== 1) throw new TypeError("Review submission does not match the one-item manifest")
	const candidate = value.responses[0]
	if (!isRecord(candidate)) throw new TypeError("Review response must be an object")
	exactKeys(candidate, ["itemId", "qualityA", "qualityB", "relative", "issuesA", "issuesB", "comment"],
		"Review response")
	if (candidate.itemId !== manifest.items[0].publicItemId ||
		!ABSOLUTE_QUALITY_VALUES.includes(candidate.qualityA as AbsoluteQuality) ||
		!ABSOLUTE_QUALITY_VALUES.includes(candidate.qualityB as AbsoluteQuality) ||
		!BLINDED_RELATIVE_VALUES.includes(candidate.relative as BlindedRelative) ||
		typeof candidate.comment !== "string" || candidate.comment.length > 2_000) {
		throw new TypeError("Review response value is invalid")
	}
	return {
		schemaVersion: 1,
		reviewId: manifest.contentId,
		responses: [{
			itemId: candidate.itemId as string,
			qualityA: candidate.qualityA as AbsoluteQuality,
			qualityB: candidate.qualityB as AbsoluteQuality,
			relative: candidate.relative as BlindedRelative,
			issuesA: parseIssues(candidate.issuesA, "Option A issues"),
			issuesB: parseIssues(candidate.issuesB, "Option B issues"),
			comment: candidate.comment,
		}],
	}
}

export function relativeOutcome(relative: BlindedRelative, item: PrivateReviewItem): RelativeOutcome {
	if (relative === "similarly-valid" || relative === "neither-acceptable" || relative === "uncertain") return relative
	const strongerSide = relative === "a-stronger" ? "A" : "B"
	return item.assignment[strongerSide] === "alternative" ? "candidate-stronger" : "baseline-stronger"
}

export function buildStoredReviewFeedback(submission: ReviewSubmission, manifest: PrivateReviewManifest,
	manifestRawSha256: string, submittedAt: string): StoredReviewFeedback {
	if (!isSha256(manifestRawSha256) || !Number.isFinite(Date.parse(submittedAt)) ||
		new Date(submittedAt).toISOString() !== submittedAt) throw new TypeError("Stored feedback binding is invalid")
	const response = submission.responses[0]
	const identity = {
		schemaVersion: 1 as const,
		reviewVersion: REVIEW_VERSION,
		contentId: submission.reviewId,
		responses: [{
			itemId: response.itemId,
			qualityA: response.qualityA,
			qualityB: response.qualityB,
			relativeOutcome: relativeOutcome(response.relative, manifest.items[0]),
			issuesA: response.issuesA,
			issuesB: response.issuesB,
			comment: response.comment,
		}] as const,
		manifestRawSha256,
		submittedAt,
	}
	return { ...identity, submissionId: sha256(canonicalJson(identity)) }
}

export function publicReviewPayload(manifest: PrivateReviewManifest) {
	return {
		schemaVersion: 1,
		reviewId: manifest.contentId,
		itemCount: 1,
		colorNamesPresentationOnly: true,
		items: manifest.items.map((item) => ({
			itemId: item.publicItemId,
			order: item.order,
			artworkUrl: `/media/${item.mediaToken}`,
			options: item.options,
		})),
	}
}
