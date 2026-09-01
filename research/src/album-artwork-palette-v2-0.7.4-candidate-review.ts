import { createHash } from "node:crypto"

export const REVIEW_PROTOCOL_ID = "album-artwork-ui-palette-protocol-v2-0.7.4-candidate-review-1" as const
export const REVIEW_VERSION = "album-artwork-palette-v2-0.7.4-candidate-review-1.0.0" as const
export const PRESENTATION_VERSION = "album-artwork-palette-v2-complete-treatment-presentation-1" as const
export const SIDE_ASSIGNMENT_DOMAIN = `${REVIEW_PROTOCOL_ID}/side-assignment` as const
export const PUBLIC_ITEM_DOMAIN = `${REVIEW_PROTOCOL_ID}/public-item` as const
export const MEDIA_TOKEN_DOMAIN = `${REVIEW_PROTOCOL_ID}/media` as const
export const RENDERER_ID = "album-artwork-palette-v2-complete-treatment-renderer-1" as const
export const COLOR_NAME_POLICY = "colornames-oklab-0.6.0-nearest-oklab-presentation-only" as const

export const ROLES = ["background", "surface", "foreground", "accent"] as const
export const SIDES = ["A", "B"] as const
export const ABSOLUTE_QUALITY_VALUES = [
	"strong",
	"acceptable",
	"weak-fallback",
	"unacceptable",
	"uncertain",
] as const
export const RELATIVE_VALUES = [
	"a-stronger",
	"b-stronger",
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
	"protectedArtworkAccess",
	"freshOrDirectionalSample",
	"phase4",
	"phase5",
	"inferenceChange",
	"rankingChange",
	"candidateSupport",
	"candidateFreeze",
	"promotion",
	"persistence",
	"defaultExtractorChange",
	"productBaselineChange",
	"productionReplacement",
	"fullRoster",
	"multiHourRun",
	"fullRunGo",
	"learnedModel",
	"commentOrColorNameInInference",
] as const

export const BOUND_REVIEW_CASES = [
	{
		caseId: "development-18",
		file: "images/artofficial.jpg",
		sourceSha256: "c5b20159f95c11e27525fc9fb7801045e60e5c7d44b8bb69c94e5e120bffafda",
		byteCount: 1_657_931,
		controlKey: "#31305c:#040325:#f5e50c:#fded9f:flat",
		candidateKey: "#04002a:#161439:#f5e50c:#fded9f:flat",
		candidateArtifactRawSha256: "3a3ec504a48fcd3a8a90f72e7b743eb470f8a7a332a32ec670c27374f9df18f5",
		controlArtifactRawSha256: "9f8d1318d77665cc2a4df5e747454401b00e7953930a6d628a419e01c4e0ac3a",
	},
	{
		caseId: "development-21",
		file: "01/ab67616d0000b27300014f6d389bd4b028d8e28e.jpg",
		sourceSha256: "f0156200040ddd42dbc872574dd5c47a70892999def6034e20154b9cd8ce66bd",
		byteCount: 141_935,
		controlKey: "#df34a7:#8c1cc6:#efd2ee:#e99235:flat",
		candidateKey: "#eed0ec:#ed81b2:#510cc9:#b62bba:flat",
		candidateArtifactRawSha256: "2e84f6d8b8379e11ce4ac3fb02d3738547597655450e96a2502935c07a2c2880",
		controlArtifactRawSha256: "87949559cabe373800b883b1bd149a26004c97780528d5e01ed192d5029c2748",
	},
] as const

export type ReviewRole = typeof ROLES[number]
export type ReviewSide = typeof SIDES[number]
export type AbsoluteQuality = typeof ABSOLUTE_QUALITY_VALUES[number]
export type RelativeJudgment = typeof RELATIVE_VALUES[number]
export type IssueTag = typeof ISSUE_TAGS[number]

export type ReviewColor = Readonly<{
	hex: string
	nearestName: string
	generated: boolean
}>

export type ReviewPalette = Readonly<{
	roles: Readonly<Record<ReviewRole, ReviewColor>>
	gradient: boolean
	collapse: Readonly<{ surface: boolean; accent: boolean }>
}>

export type ReviewComparisonRecord = Readonly<{
	version: "album-artwork-first-principles-0.7.2" | "album-artwork-first-principles-0.7.4"
	key: string
	treatmentRecordSha256: string
	palette: ReviewPalette
}>

export type PrivateReviewItem = Readonly<{
	internalCaseId: string
	publicItemId: string
	mediaToken: string
	order: number
	source: Readonly<{ file: string; sha256: string; byteCount: number; cohort: "development" }>
	checkedArtifacts: Readonly<{
		candidatePath: string
		candidateRawSha256: string
		controlPath: string
		controlRawSha256: string
	}>
	comparison: Readonly<{ candidate: ReviewComparisonRecord; control: ReviewComparisonRecord }>
	assignment: Readonly<{
		digest: string
		A: "candidate" | "control"
		B: "candidate" | "control"
	}>
	options: Readonly<Record<ReviewSide, ReviewPalette>>
}>

export type PrivateReviewManifest = Readonly<{
	schemaVersion: 1
	protocolId: typeof REVIEW_PROTOCOL_ID
	reviewVersion: typeof REVIEW_VERSION
	presentationVersion: typeof PRESENTATION_VERSION
	contentId: string
	scope: Readonly<{
		evidenceClass: "bounded-development-final-winner-delta"
		itemCount: 2
		exactSourceCaseIds: readonly string[]
		protectedOverlap: false
		excludedNovelSlateAlternativeCount: 44
		excludedAuditTreatmentCount: 639
	}>
	closure: Readonly<Record<string, unknown>>
	implementationBindings: ReadonlyArray<Readonly<{ path: string; byteCount: number; rawSha256: string }>>
	presentation: Readonly<{
		rendererId: typeof RENDERER_ID
		rendererSourcePath: string
		rendererFunction: "renderTreatment"
		identicalRendererForAllSides: true
		gradientCss: "linear-gradient(135deg in oklab, background 0%, surface 100%)"
		colorNamePolicy: typeof COLOR_NAME_POLICY
		colorNamesPresentationOnly: true
	}>
	responseSchema: Readonly<Record<string, unknown>>
	analysisPlan: Readonly<Record<string, unknown>>
	authorization: Readonly<Record<string, boolean>>
	items: readonly PrivateReviewItem[]
}>

export type ReviewResponse = Readonly<{
	itemId: string
	qualityA: AbsoluteQuality
	qualityB: AbsoluteQuality
	relative: RelativeJudgment
	issuesA: readonly IssueTag[]
	issuesB: readonly IssueTag[]
	comment: string
}>

export type ReviewSubmission = Readonly<{
	schemaVersion: 1
	reviewId: string
	responses: readonly ReviewResponse[]
}>

export type StoredReviewFeedback = Readonly<{
	schemaVersion: 1
	reviewVersion: typeof REVIEW_VERSION
	contentId: string
	responses: readonly ReviewResponse[]
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
	return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`
}

export function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

export function reviewManifestContentId(value: Omit<PrivateReviewManifest, "contentId">): string {
	return sha256(canonicalJson(value))
}

export function sideAssignmentDigest(
	sourceSha256: string,
	candidateTreatmentKey: string,
	controlTreatmentKey: string,
): string {
	return sha256(canonicalJson({
		domain: SIDE_ASSIGNMENT_DOMAIN,
		protocolId: REVIEW_PROTOCOL_ID,
		reviewVersion: REVIEW_VERSION,
		sourceSha256,
		candidateTreatmentKey,
		controlTreatmentKey,
	}))
}

export function candidateSide(
	sourceSha256: string,
	candidateTreatmentKey: string,
	controlTreatmentKey: string,
): ReviewSide {
	return Number.parseInt(sideAssignmentDigest(sourceSha256, candidateTreatmentKey, controlTreatmentKey).slice(0, 2), 16) % 2 === 0
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

function parseComparison(value: unknown, label: string, expectedVersion: string, expectedKey: string): ReviewComparisonRecord {
	if (!isRecord(value)) throw new TypeError(`${label} is invalid`)
	exactKeys(value, ["version", "key", "treatmentRecordSha256", "palette"], label)
	const palette = parsePalette(value.palette, `${label} palette`)
	if (value.version !== expectedVersion || value.key !== expectedKey || paletteKey(palette) !== expectedKey ||
		!isSha256(value.treatmentRecordSha256)) throw new TypeError(`${label} does not match the bound treatment`)
	return value as unknown as ReviewComparisonRecord
}

export function parsePrivateReviewManifest(value: unknown): PrivateReviewManifest {
	if (!isRecord(value)) throw new TypeError("Private review manifest must be an object")
	exactKeys(value, [
		"schemaVersion", "protocolId", "reviewVersion", "presentationVersion", "contentId", "scope", "closure",
		"implementationBindings", "presentation", "responseSchema", "analysisPlan", "authorization", "items",
	], "Private review manifest")
	if (value.schemaVersion !== 1 || value.protocolId !== REVIEW_PROTOCOL_ID || value.reviewVersion !== REVIEW_VERSION ||
		value.presentationVersion !== PRESENTATION_VERSION || !isSha256(value.contentId) || !isRecord(value.scope) ||
		!isRecord(value.closure) || !Array.isArray(value.implementationBindings) || !isRecord(value.presentation) ||
		!isRecord(value.responseSchema) || !isRecord(value.analysisPlan) || !isRecord(value.authorization) ||
		!Array.isArray(value.items)) throw new TypeError("Private review manifest header is invalid")
	exactKeys(value.scope, [
		"evidenceClass", "itemCount", "exactSourceCaseIds", "protectedOverlap", "excludedNovelSlateAlternativeCount",
		"excludedAuditTreatmentCount",
	], "Private review scope")
	if (value.scope.evidenceClass !== "bounded-development-final-winner-delta" || value.scope.itemCount !== 2 ||
		value.scope.protectedOverlap !== false || value.scope.excludedNovelSlateAlternativeCount !== 44 ||
		value.scope.excludedAuditTreatmentCount !== 639 ||
		JSON.stringify(value.scope.exactSourceCaseIds) !== JSON.stringify(BOUND_REVIEW_CASES.map(({ caseId }) => caseId)) ||
		value.items.length !== BOUND_REVIEW_CASES.length) throw new TypeError("Private review scope changed")
	exactKeys(value.presentation, [
		"rendererId", "rendererSourcePath", "rendererFunction", "identicalRendererForAllSides", "gradientCss",
		"colorNamePolicy", "colorNamesPresentationOnly",
	], "Private review presentation")
	if (value.presentation.rendererId !== RENDERER_ID ||
		value.presentation.rendererSourcePath !== "research/album-artwork-palette-v2-0.7.4-candidate-review/app.js" ||
		value.presentation.rendererFunction !== "renderTreatment" || value.presentation.identicalRendererForAllSides !== true ||
		value.presentation.gradientCss !== "linear-gradient(135deg in oklab, background 0%, surface 100%)" ||
		value.presentation.colorNamePolicy !== COLOR_NAME_POLICY || value.presentation.colorNamesPresentationOnly !== true) {
		throw new TypeError("Private review presentation policy changed")
	}
	const expectedAuthorizationKeys = [
		"boundedDevelopmentReview", "reviewPreparation", "localServing", "oneBoundSubmission", ...FORBIDDEN_AUTHORIZATIONS,
	]
	exactKeys(value.authorization, expectedAuthorizationKeys, "Private review authorization")
	for (const key of ["boundedDevelopmentReview", "reviewPreparation", "localServing", "oneBoundSubmission"]) {
		if (value.authorization[key] !== true) throw new TypeError(`Required review authorization ${key} is absent`)
	}
	for (const key of FORBIDDEN_AUTHORIZATIONS) {
		if (value.authorization[key] !== false) throw new TypeError(`Forbidden authorization ${key} must be false`)
	}
	const itemIds = new Set<string>()
	const mediaTokens = new Set<string>()
	for (const [order, itemValue] of value.items.entries()) {
		const bound = BOUND_REVIEW_CASES[order]
		if (!isRecord(itemValue) || !isRecord(itemValue.source) || !isRecord(itemValue.checkedArtifacts) ||
			!isRecord(itemValue.comparison) || !isRecord(itemValue.assignment) || !isRecord(itemValue.options)) {
			throw new TypeError(`Private review item ${order} is invalid`)
		}
		exactKeys(itemValue, [
			"internalCaseId", "publicItemId", "mediaToken", "order", "source", "checkedArtifacts", "comparison",
			"assignment", "options",
		], `Private review item ${order}`)
		exactKeys(itemValue.source, ["file", "sha256", "byteCount", "cohort"], `Private review item ${order} source`)
		exactKeys(itemValue.checkedArtifacts, [
			"candidatePath", "candidateRawSha256", "controlPath", "controlRawSha256",
		], `Private review item ${order} artifacts`)
		exactKeys(itemValue.comparison, ["candidate", "control"], `Private review item ${order} comparison`)
		exactKeys(itemValue.assignment, ["digest", "A", "B"], `Private review item ${order} assignment`)
		exactKeys(itemValue.options, SIDES, `Private review item ${order} options`)
		if (itemValue.internalCaseId !== bound.caseId || itemValue.order !== order || itemValue.source.file !== bound.file ||
			itemValue.source.sha256 !== bound.sourceSha256 || itemValue.source.byteCount !== bound.byteCount ||
			itemValue.source.cohort !== "development" || itemValue.publicItemId !== publicItemId(bound.sourceSha256) ||
			itemValue.mediaToken !== mediaToken(bound.sourceSha256) || itemIds.has(itemValue.publicItemId as string) ||
			mediaTokens.has(itemValue.mediaToken as string) || itemValue.checkedArtifacts.candidateRawSha256 !== bound.candidateArtifactRawSha256 ||
			itemValue.checkedArtifacts.controlRawSha256 !== bound.controlArtifactRawSha256) {
			throw new TypeError(`Private review item ${order} identity changed`)
		}
		const candidate = parseComparison(itemValue.comparison.candidate, `Private review item ${order} candidate`,
			"album-artwork-first-principles-0.7.4", bound.candidateKey)
		const control = parseComparison(itemValue.comparison.control, `Private review item ${order} control`,
			"album-artwork-first-principles-0.7.2", bound.controlKey)
		const digest = sideAssignmentDigest(bound.sourceSha256, bound.candidateKey, bound.controlKey)
		const expectedCandidateSide = candidateSide(bound.sourceSha256, bound.candidateKey, bound.controlKey)
		if (itemValue.assignment.digest !== digest || itemValue.assignment[expectedCandidateSide] !== "candidate" ||
			itemValue.assignment[expectedCandidateSide === "A" ? "B" : "A"] !== "control") {
			throw new TypeError(`Private review item ${order} assignment changed`)
		}
		const optionA = parsePalette(itemValue.options.A, `Private review item ${order} option A`)
		const optionB = parsePalette(itemValue.options.B, `Private review item ${order} option B`)
		if (canonicalJson(optionA) !== canonicalJson(itemValue.assignment.A === "candidate" ? candidate.palette : control.palette) ||
			canonicalJson(optionB) !== canonicalJson(itemValue.assignment.B === "candidate" ? candidate.palette : control.palette)) {
			throw new TypeError(`Private review item ${order} options do not match its assignment`)
		}
		itemIds.add(itemValue.publicItemId as string)
		mediaTokens.add(itemValue.mediaToken as string)
	}
	for (const binding of value.implementationBindings) {
		if (!isRecord(binding)) throw new TypeError("Implementation binding is invalid")
		exactKeys(binding, ["path", "byteCount", "rawSha256"], "Implementation binding")
		if (typeof binding.path !== "string" || !Number.isSafeInteger(binding.byteCount) || (binding.byteCount as number) < 1 ||
			!isSha256(binding.rawSha256)) throw new TypeError("Implementation binding is invalid")
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
	if (value.schemaVersion !== 1 || value.reviewId !== manifest.contentId ||
		!Array.isArray(value.responses) || value.responses.length !== manifest.items.length) {
		throw new TypeError("Review submission does not match the private manifest")
	}
	const byId = new Map(manifest.items.map((item) => [item.publicItemId, item]))
	const seen = new Set<string>()
	const responses: ReviewResponse[] = []
	for (const candidate of value.responses) {
		if (!isRecord(candidate)) throw new TypeError("Review response must be an object")
		exactKeys(candidate, [
			"itemId", "qualityA", "qualityB", "relative", "issuesA", "issuesB", "comment",
		], "Review response")
		if (typeof candidate.itemId !== "string" || !byId.has(candidate.itemId) || seen.has(candidate.itemId) ||
			!ABSOLUTE_QUALITY_VALUES.includes(candidate.qualityA as AbsoluteQuality) ||
			!ABSOLUTE_QUALITY_VALUES.includes(candidate.qualityB as AbsoluteQuality) ||
			!RELATIVE_VALUES.includes(candidate.relative as RelativeJudgment) || typeof candidate.comment !== "string" ||
			candidate.comment.length > 2_000) throw new TypeError("Review response value is invalid")
		responses.push({
			itemId: candidate.itemId,
			qualityA: candidate.qualityA as AbsoluteQuality,
			qualityB: candidate.qualityB as AbsoluteQuality,
			relative: candidate.relative as RelativeJudgment,
			issuesA: parseIssues(candidate.issuesA, "Option A issues"),
			issuesB: parseIssues(candidate.issuesB, "Option B issues"),
			comment: candidate.comment,
		})
		seen.add(candidate.itemId)
	}
	responses.sort((first, second) =>
		manifest.items.findIndex(({ publicItemId: id }) => id === first.itemId) -
		manifest.items.findIndex(({ publicItemId: id }) => id === second.itemId))
	return { schemaVersion: 1, reviewId: manifest.contentId, responses }
}

export function buildStoredReviewFeedback(
	submission: ReviewSubmission,
	manifestRawSha256: string,
	submittedAt: string,
): StoredReviewFeedback {
	if (!isSha256(manifestRawSha256) || !Number.isFinite(Date.parse(submittedAt)) || new Date(submittedAt).toISOString() !== submittedAt) {
		throw new TypeError("Stored feedback binding is invalid")
	}
	const identity = {
		schemaVersion: 1 as const,
		reviewVersion: REVIEW_VERSION,
		contentId: submission.reviewId,
		responses: submission.responses,
		manifestRawSha256,
		submittedAt,
	}
	return { ...identity, submissionId: sha256(canonicalJson(identity)) }
}

export function parseStoredReviewFeedback(value: unknown, manifest: PrivateReviewManifest): StoredReviewFeedback {
	if (!isRecord(value)) throw new TypeError("Stored review feedback must be an object")
	exactKeys(value, [
		"schemaVersion", "reviewVersion", "contentId", "responses", "manifestRawSha256", "submittedAt", "submissionId",
	], "Stored review feedback")
	const submission = parseReviewSubmission({
		schemaVersion: value.schemaVersion,
		reviewId: value.contentId,
		responses: value.responses,
	}, manifest)
	if (value.reviewVersion !== REVIEW_VERSION || !isSha256(value.manifestRawSha256) || typeof value.submittedAt !== "string" ||
		!Number.isFinite(Date.parse(value.submittedAt)) || new Date(value.submittedAt).toISOString() !== value.submittedAt ||
		!isSha256(value.submissionId)) throw new TypeError("Stored review feedback binding is invalid")
	const expected = buildStoredReviewFeedback(submission, value.manifestRawSha256, value.submittedAt)
	if (expected.submissionId !== value.submissionId) throw new TypeError("Stored review feedback content ID is stale")
	return expected
}

export function publicReviewPayload(manifest: PrivateReviewManifest) {
	return {
		schemaVersion: 1,
		reviewId: manifest.contentId,
		itemCount: manifest.items.length,
		colorNamesPresentationOnly: true,
		items: manifest.items.map((item) => ({
			itemId: item.publicItemId,
			order: item.order,
			artworkUrl: `/media/${item.mediaToken}`,
			options: item.options,
		})),
	}
}
