import { chmod, mkdir, rename, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import {
	fastSampleExclusionPath,
	inventoryReviewArtifacts,
	loadArtifact,
	normalizeFeedback,
	normalizeManifest,
	sourceInventoryEntries,
} from "./adapters.ts"
import { canonicalJson, isObject, jsonPointer } from "./normalize.ts"
import type {
	ArtifactInventoryRecord,
	JsonObject,
	NormalizedCase,
	NormalizedFeedback,
	NormalizedManifest,
	NormalizedOption,
	WarehouseBuildStats,
} from "./types.ts"

export const defaultWarehouseRelativePath = "research/.cache/palette-review-evidence/warehouse.sqlite"

type ImportedCase = NormalizedCase & { databaseId: number; excluded: boolean }
type ImportedManifest = Omit<NormalizedManifest, "cases"> & { cases: ImportedCase[] }

const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE artifacts (
	path TEXT PRIMARY KEY,
	raw_sha256 TEXT NOT NULL,
	byte_count INTEGER NOT NULL,
	artifact_kind TEXT NOT NULL,
	privacy TEXT NOT NULL,
	adapter_id TEXT NOT NULL,
	schema_version INTEGER,
	review_version TEXT,
	manifest_id TEXT,
	content_id TEXT
) STRICT;
CREATE TABLE source_occurrences (
	id INTEGER PRIMARY KEY,
	source_sha256 TEXT NOT NULL,
	source_path TEXT,
	artwork_family_id TEXT,
	artifact_path TEXT NOT NULL REFERENCES artifacts(path),
	raw_pointer TEXT NOT NULL,
	UNIQUE (source_sha256, source_path, artwork_family_id, artifact_path, raw_pointer)
) STRICT;
CREATE TABLE excluded_sources (
	source_sha256 TEXT PRIMARY KEY,
	artifact_path TEXT NOT NULL REFERENCES artifacts(path),
	raw_pointer TEXT NOT NULL
) STRICT;
CREATE TABLE review_contracts (
	manifest_path TEXT PRIMARY KEY REFERENCES artifacts(path),
	review_version TEXT NOT NULL,
	manifest_id TEXT,
	content_id TEXT,
	review_unit TEXT,
	presentation_version TEXT,
	candidate_version TEXT,
	configuration_json TEXT
) STRICT;
CREATE TABLE review_cases (
	id INTEGER PRIMARY KEY,
	manifest_path TEXT NOT NULL REFERENCES review_contracts(manifest_path),
	case_id TEXT NOT NULL,
	public_item_id TEXT,
	source_sha256 TEXT,
	source_path TEXT,
	artwork_family_id TEXT,
	raw_pointer TEXT NOT NULL,
	excluded INTEGER NOT NULL CHECK (excluded IN (0, 1)),
	UNIQUE (manifest_path, case_id)
) STRICT;
CREATE TABLE treatments (
	treatment_identity TEXT PRIMARY KEY,
	visible_json TEXT NOT NULL,
	gradient_enabled INTEGER NOT NULL CHECK (gradient_enabled IN (0, 1)),
	UNIQUE (visible_json)
) STRICT;
CREATE TABLE render_variants (
	render_variant_id TEXT PRIMARY KEY,
	treatment_identity TEXT NOT NULL REFERENCES treatments(treatment_identity),
	render_json TEXT NOT NULL,
	presentation_version TEXT,
	UNIQUE (render_json)
) STRICT;
CREATE TABLE case_options (
	id INTEGER PRIMARY KEY,
	case_database_id INTEGER NOT NULL REFERENCES review_cases(id),
	option_label TEXT NOT NULL,
	assignment_label TEXT,
	semantic_label TEXT,
	treatment_identity TEXT NOT NULL REFERENCES treatments(treatment_identity),
	render_variant_id TEXT NOT NULL REFERENCES render_variants(render_variant_id),
	raw_treatment_id TEXT,
	candidate_version TEXT,
	configuration_json TEXT,
	raw_pointer TEXT NOT NULL,
	UNIQUE (case_database_id, option_label)
) STRICT;
CREATE INDEX case_options_treatment ON case_options(treatment_identity, render_variant_id);
CREATE INDEX case_options_alias ON case_options(raw_treatment_id);
CREATE TABLE responses (
	id INTEGER PRIMARY KEY,
	artifact_path TEXT NOT NULL REFERENCES artifacts(path),
	review_version TEXT NOT NULL,
	manifest_path TEXT REFERENCES review_contracts(manifest_path),
	case_database_id INTEGER REFERENCES review_cases(id),
	case_id TEXT,
	public_item_id TEXT,
	source_sha256 TEXT,
	submitted_at TEXT,
	raw_pointer TEXT NOT NULL,
	raw_response_json TEXT NOT NULL,
	binding_status TEXT NOT NULL,
	lineage_status TEXT NOT NULL
) STRICT;
CREATE TABLE feedback_stores (
	artifact_path TEXT PRIMARY KEY REFERENCES artifacts(path),
	adapter_id TEXT NOT NULL,
	disposition TEXT NOT NULL CHECK (disposition IN ('bound', 'quarantined')),
	reason TEXT,
	contract_json TEXT NOT NULL,
	submission_count INTEGER NOT NULL,
	bound_count INTEGER NOT NULL,
	quarantined_count INTEGER NOT NULL,
	CHECK (submission_count = bound_count + quarantined_count)
) STRICT;
CREATE TABLE quarantined_submissions (
	id INTEGER PRIMARY KEY,
	artifact_path TEXT NOT NULL REFERENCES feedback_stores(artifact_path),
	review_version TEXT,
	raw_pointer TEXT NOT NULL,
	reason TEXT NOT NULL,
	raw_response_json TEXT NOT NULL,
	UNIQUE (artifact_path, raw_pointer)
) STRICT;
CREATE TABLE binary_judgments (
	id INTEGER PRIMARY KEY,
	response_id INTEGER NOT NULL REFERENCES responses(id),
	scope_kind TEXT NOT NULL,
	scope_identity TEXT,
	left_reference TEXT,
	right_reference TEXT,
	raw_outcome TEXT,
	unblinded_outcome TEXT,
	secondary_outcome TEXT,
	reason_tags_json TEXT NOT NULL,
	binding_json TEXT,
	raw_pointer TEXT NOT NULL
) STRICT;
CREATE INDEX binary_scope ON binary_judgments(scope_kind, scope_identity);
CREATE TABLE scoped_judgments (
	id INTEGER PRIMARY KEY,
	response_id INTEGER NOT NULL REFERENCES responses(id),
	scope_kind TEXT NOT NULL,
	scope_identity TEXT NOT NULL,
	judgment_kind TEXT NOT NULL,
	target_reference TEXT,
	outcome TEXT NOT NULL,
	details_json TEXT,
	raw_pointer TEXT NOT NULL
) STRICT;
CREATE INDEX scoped_identity ON scoped_judgments(scope_kind, scope_identity);
CREATE TABLE absolute_judgments (
	id INTEGER PRIMARY KEY,
	response_id INTEGER NOT NULL REFERENCES responses(id),
	target_reference TEXT NOT NULL,
	treatment_identity TEXT REFERENCES treatments(treatment_identity),
	render_variant_id TEXT REFERENCES render_variants(render_variant_id),
	quality TEXT NOT NULL,
	raw_pointer TEXT NOT NULL
) STRICT;
CREATE INDEX absolute_exact ON absolute_judgments(treatment_identity, render_variant_id);
CREATE TABLE pairwise_judgments (
	id INTEGER PRIMARY KEY,
	response_id INTEGER NOT NULL REFERENCES responses(id),
	left_reference TEXT NOT NULL,
	right_reference TEXT NOT NULL,
	left_treatment_identity TEXT REFERENCES treatments(treatment_identity),
	right_treatment_identity TEXT REFERENCES treatments(treatment_identity),
	left_render_variant_id TEXT REFERENCES render_variants(render_variant_id),
	right_render_variant_id TEXT REFERENCES render_variants(render_variant_id),
	raw_outcome TEXT NOT NULL,
	unblinded_outcome TEXT,
	normalized_outcome TEXT,
	raw_pointer TEXT NOT NULL
) STRICT;
CREATE INDEX pairwise_exact ON pairwise_judgments(left_treatment_identity, right_treatment_identity);
CREATE TABLE setwise_judgments (
	id INTEGER PRIMARY KEY,
	response_id INTEGER NOT NULL REFERENCES responses(id),
	judgment_kind TEXT NOT NULL,
	valid_references_json TEXT NOT NULL,
	valid_treatment_identities_json TEXT NOT NULL,
	preferred_reference TEXT,
	preferred_treatment_identity TEXT,
	none_confidently_valid INTEGER,
	uncertain INTEGER,
	raw_pointer TEXT NOT NULL
) STRICT;
CREATE TABLE issue_tags (
	id INTEGER PRIMARY KEY,
	response_id INTEGER NOT NULL REFERENCES responses(id),
	target_reference TEXT,
	treatment_identity TEXT REFERENCES treatments(treatment_identity),
	tag TEXT NOT NULL,
	raw_pointer TEXT NOT NULL
) STRICT;
CREATE TABLE comments (
	id INTEGER PRIMARY KEY,
	response_id INTEGER NOT NULL REFERENCES responses(id),
	comment TEXT NOT NULL,
	raw_pointer TEXT NOT NULL
) STRICT;
CREATE TABLE classification_judgments (
	id INTEGER PRIMARY KEY,
	response_id INTEGER NOT NULL REFERENCES responses(id),
	classification_kind TEXT NOT NULL,
	classification_value TEXT NOT NULL,
	target_reference TEXT,
	treatment_identity TEXT REFERENCES treatments(treatment_identity),
	raw_pointer TEXT NOT NULL
) STRICT;
CREATE TABLE judgment_lineage (
	id INTEGER PRIMARY KEY,
	response_id INTEGER NOT NULL REFERENCES responses(id),
	lineage_kind TEXT NOT NULL,
	from_artifact_path TEXT,
	from_raw_pointer TEXT,
	raw_json TEXT NOT NULL,
	raw_pointer TEXT NOT NULL
) STRICT;
CREATE TABLE unresolved_bindings (
	id INTEGER PRIMARY KEY,
	artifact_path TEXT NOT NULL REFERENCES artifacts(path),
	response_id INTEGER REFERENCES responses(id),
	raw_pointer TEXT NOT NULL,
	binding_kind TEXT NOT NULL,
	raw_reference TEXT,
	reason TEXT NOT NULL,
	details_json TEXT
) STRICT;
CREATE INDEX unresolved_artifact ON unresolved_bindings(artifact_path, raw_pointer);
`

function insertArtifact(database: DatabaseSync, artifact: ArtifactInventoryRecord): void {
	database.prepare(`INSERT INTO artifacts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
		.run(artifact.path, artifact.rawSha256, artifact.byteCount, artifact.kind, artifact.privacy, artifact.adapterId,
			artifact.schemaVersion, artifact.reviewVersion, artifact.manifestId, artifact.contentId)
}

function lastId(result: { lastInsertRowid: number | bigint }): number {
	return Number(result.lastInsertRowid)
}

function exactSha(value: string | null): value is string {
	return typeof value === "string" && /^[a-f\d]{64}$/.test(value)
}

function insertSource(database: DatabaseSync, source: {
	sha256: string | null
	sourcePath: string | null
	artworkFamilyId: string | null
	artifactPath: string
	rawPointer: string
}): void {
	if (!exactSha(source.sha256)) return
	database.prepare(`INSERT OR IGNORE INTO source_occurrences
		(source_sha256, source_path, artwork_family_id, artifact_path, raw_pointer) VALUES (?, ?, ?, ?, ?)`)
		.run(source.sha256, source.sourcePath, source.artworkFamilyId, source.artifactPath, source.rawPointer)
}

function insertUnresolved(database: DatabaseSync, values: {
	artifactPath: string
	responseId?: number | null
	rawPointer: string
	bindingKind: string
	rawReference?: string | null
	reason: string
	details?: unknown
}): void {
	database.prepare(`INSERT INTO unresolved_bindings
		(artifact_path, response_id, raw_pointer, binding_kind, raw_reference, reason, details_json)
		VALUES (?, ?, ?, ?, ?, ?, ?)`)
		.run(values.artifactPath, values.responseId ?? null, values.rawPointer, values.bindingKind, values.rawReference ?? null,
			values.reason, values.details === undefined ? null : canonicalJson(values.details))
}

function insertTreatment(database: DatabaseSync, option: NormalizedOption, presentationVersion: string | null): void {
	database.prepare(`INSERT OR IGNORE INTO treatments
		(treatment_identity, visible_json, gradient_enabled) VALUES (?, ?, ?)`)
		.run(option.treatmentIdentity, canonicalJson(option.visible), option.visible.gradient.enabled ? 1 : 0)
	database.prepare(`INSERT OR IGNORE INTO render_variants
		(render_variant_id, treatment_identity, render_json, presentation_version) VALUES (?, ?, ?, ?)`)
		.run(option.renderVariantId, option.treatmentIdentity, canonicalJson(option.renderVariant), presentationVersion)
}

function optionByReference(entry: ImportedCase, reference: string): { option: NormalizedOption | null; ambiguous: boolean } {
	const matches = entry.options.filter((option) => option.label === reference || option.rawTreatmentId === reference)
	if (matches.length === 0) return { option: null, ambiguous: false }
	const identities = new Set(matches.map((option) => `${option.treatmentIdentity}\0${option.renderVariantId}`))
	return identities.size === 1 ? { option: matches[0], ambiguous: false } : { option: null, ambiguous: true }
}

function pairedOutcome(
	left: NormalizedOption | null,
	right: NormalizedOption | null,
	rawOutcome: string,
): { unblinded: string | null; normalized: string | null } {
	if (rawOutcome === "both-similarly-valid") rawOutcome = "similarly-valid"
	let preferred: NormalizedOption | null = null
	let unblinded: string | null = rawOutcome
	if (rawOutcome === "a-stronger") {
		preferred = left
		unblinded = left?.semanticLabel ? `${left.semanticLabel}-stronger` : null
	} else if (rawOutcome === "b-stronger") {
		preferred = right
		unblinded = right?.semanticLabel ? `${right.semanticLabel}-stronger` : null
	} else if (rawOutcome === "candidate-stronger") {
		preferred = left?.semanticLabel === "candidate" ? left : right?.semanticLabel === "candidate" ? right : null
	} else if (rawOutcome === "baseline-stronger") {
		preferred = left?.semanticLabel === "baseline" ? left : right?.semanticLabel === "baseline" ? right : null
	}
	if (!left || !right) return { unblinded, normalized: null }
	if (preferred) {
		const first = left.treatmentIdentity.localeCompare(right.treatmentIdentity) <= 0 ? left : right
		return { unblinded, normalized: preferred.treatmentIdentity === first.treatmentIdentity ? "first-stronger" : "second-stronger" }
	}
	if (["similarly-valid", "neither-acceptable", "uncertain"].includes(rawOutcome)) return { unblinded, normalized: rawOutcome }
	return { unblinded, normalized: null }
}

function responseIdentity(response: JsonObject): { caseId: string | null; publicItemId: string | null; sourceSha256: string | null } {
	return {
		caseId: typeof response.caseId === "string" ? response.caseId : typeof response.pairSha256 === "string" ? response.pairSha256 : null,
		publicItemId: typeof response.itemId === "string" ? response.itemId : null,
		sourceSha256: typeof response.sourceSha256 === "string" ? response.sourceSha256 : null,
	}
}

function addFeedbackJudgments(
	database: DatabaseSync,
	feedback: NormalizedFeedback,
	response: JsonObject,
	responseId: number,
	responsePointer: string,
	entry: ImportedCase,
	stats: WarehouseBuildStats,
): void {
	const bind = (reference: string, pointer: string): NormalizedOption | null => {
		const result = optionByReference(entry, reference)
		if (!result.option) insertUnresolved(database, {
			artifactPath: feedback.artifact.path,
			responseId,
			rawPointer: pointer,
			bindingKind: "treatment",
			rawReference: reference,
			reason: result.ambiguous ? "Treatment reference resolves to multiple visible/render identities" : "Treatment reference is absent from the bound manifest case",
		})
		return result.option
	}
	const absolute = (reference: string, quality: string, pointer: string): void => {
		const option = bind(reference, pointer)
		database.prepare(`INSERT INTO absolute_judgments
			(response_id, target_reference, treatment_identity, render_variant_id, quality, raw_pointer) VALUES (?, ?, ?, ?, ?, ?)`)
			.run(responseId, reference, option?.treatmentIdentity ?? null, option?.renderVariantId ?? null, quality, pointer)
		stats.absoluteJudgments++
	}
	const issueTags = (reference: string, value: unknown, pointer: string): void => {
		if (!Array.isArray(value)) return
		const option = optionByReference(entry, reference).option
		for (let index = 0; index < value.length; index++) {
			if (typeof value[index] !== "string") continue
			database.prepare(`INSERT INTO issue_tags
				(response_id, target_reference, treatment_identity, tag, raw_pointer) VALUES (?, ?, ?, ?, ?)`)
				.run(responseId, reference, option?.treatmentIdentity ?? null, value[index], `${pointer}/${index}`)
			stats.issueTags++
		}
	}

	if (typeof response.selectedTreatmentId === "string" && typeof response.quality === "string") {
		absolute(response.selectedTreatmentId, response.quality, `${responsePointer}/selectedTreatmentId`)
		issueTags(response.selectedTreatmentId, response.tags, `${responsePointer}/tags`)
		if (Array.isArray(response.alsoValidTreatmentIds)) {
			const references = [response.selectedTreatmentId, ...response.alsoValidTreatmentIds.filter((value): value is string => typeof value === "string")]
			const options = references.map((reference, index) => bind(reference,
				index === 0 ? `${responsePointer}/selectedTreatmentId` : `${responsePointer}/alsoValidTreatmentIds/${index - 1}`))
			database.prepare(`INSERT INTO setwise_judgments
				(response_id, judgment_kind, valid_references_json, valid_treatment_identities_json, preferred_reference,
				preferred_treatment_identity, none_confidently_valid, uncertain, raw_pointer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
				.run(responseId, "selected-plus-also-valid", JSON.stringify(references),
					JSON.stringify(options.flatMap((option) => option ? [option.treatmentIdentity] : [])), response.selectedTreatmentId,
					options[0]?.treatmentIdentity ?? null, 0, 0, responsePointer)
			stats.setwiseJudgments++
		}
	} else if (typeof response.treatmentId === "string" && typeof response.quality === "string") {
		absolute(response.treatmentId, response.quality, `${responsePointer}/treatmentId`)
		issueTags(response.treatmentId, response.tags, `${responsePointer}/tags`)
	} else if (Array.isArray(response.validOptionIds)) {
		const references = response.validOptionIds.filter((value): value is string => typeof value === "string")
		const options = references.map((reference, index) => bind(reference, `${responsePointer}/validOptionIds/${index}`))
		const preferredReference = typeof response.preferredOptionId === "string" ? response.preferredOptionId : null
		const preferred = preferredReference ? bind(preferredReference, `${responsePointer}/preferredOptionId`) : null
		database.prepare(`INSERT INTO setwise_judgments
			(response_id, judgment_kind, valid_references_json, valid_treatment_identities_json, preferred_reference,
			preferred_treatment_identity, none_confidently_valid, uncertain, raw_pointer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
			.run(responseId, "independent-valid-options", JSON.stringify(references),
				JSON.stringify(options.flatMap((option) => option ? [option.treatmentIdentity] : [])), preferredReference,
				preferred?.treatmentIdentity ?? null, typeof response.noneConfidentlyValid === "boolean" ? Number(response.noneConfidentlyValid) : null,
				typeof response.uncertain === "boolean" ? Number(response.uncertain) : null, responsePointer)
		stats.setwiseJudgments++
	} else if ("qualityA" in response && "qualityB" in response) {
		if (typeof response.qualityA === "string") absolute("A", response.qualityA, `${responsePointer}/qualityA`)
		if (typeof response.qualityB === "string") absolute("B", response.qualityB, `${responsePointer}/qualityB`)
		const left = optionByReference(entry, "A").option
		const right = optionByReference(entry, "B").option
		const rawOutcome = typeof response.comparison === "string" ? response.comparison
			: typeof response.relative === "string" ? response.relative
				: typeof response.relativeOutcome === "string" ? response.relativeOutcome
					: typeof response.preference === "string" ? response.preference : null
		if (rawOutcome) {
			const outcome = pairedOutcome(left, right, rawOutcome)
			database.prepare(`INSERT INTO pairwise_judgments
				(response_id, left_reference, right_reference, left_treatment_identity, right_treatment_identity,
				left_render_variant_id, right_render_variant_id, raw_outcome, unblinded_outcome, normalized_outcome, raw_pointer)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
				.run(responseId, "A", "B", left?.treatmentIdentity ?? null, right?.treatmentIdentity ?? null,
					left?.renderVariantId ?? null, right?.renderVariantId ?? null, rawOutcome, outcome.unblinded, outcome.normalized,
					`${responsePointer}/${typeof response.comparison === "string" ? "comparison" : typeof response.relative === "string" ? "relative"
						: typeof response.relativeOutcome === "string" ? "relativeOutcome" : "preference"}`)
			stats.pairwiseJudgments++
		}
		issueTags("A", response.tagsA ?? response.issuesA, `${responsePointer}/${Array.isArray(response.tagsA) ? "tagsA" : "issuesA"}`)
		issueTags("B", response.tagsB ?? response.issuesB, `${responsePointer}/${Array.isArray(response.tagsB) ? "tagsB" : "issuesB"}`)
		issueTags("A", response.failureClassesA, `${responsePointer}/failureClassesA`)
		issueTags("B", response.failureClassesB, `${responsePointer}/failureClassesB`)
	} else if (typeof response.overallQuality === "string") {
		absolute("palette", response.overallQuality, `${responsePointer}/overallQuality`)
	} else if (typeof response.currentQuality === "string") {
		absolute("current", response.currentQuality, `${responsePointer}/currentQuality`)
		issueTags("current", response.failureTags, `${responsePointer}/failureTags`)
		if (typeof response.alternativeConclusion === "string") {
			database.prepare(`INSERT INTO scoped_judgments
				(response_id, scope_kind, scope_identity, judgment_kind, target_reference, outcome, details_json, raw_pointer)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(responseId, "case", entry.caseId, "alternative-conclusion", null,
				response.alternativeConclusion, Array.isArray(response.improvedAlternativeIds)
					? canonicalJson(response.improvedAlternativeIds) : null, `${responsePointer}/alternativeConclusion`)
			stats.scopedJudgments++
		}
	}

	const comment = typeof response.comment === "string" ? response.comment : typeof response.note === "string" ? response.note : null
	if (comment !== null) {
		database.prepare(`INSERT INTO comments (response_id, comment, raw_pointer) VALUES (?, ?, ?)`) 
			.run(responseId, comment, `${responsePointer}/${typeof response.comment === "string" ? "comment" : "note"}`)
		stats.comments++
	}
	if (isObject(response.classification) && typeof response.classification.kind === "string" &&
		typeof response.classification.value === "string") {
		database.prepare(`INSERT INTO classification_judgments
			(response_id, classification_kind, classification_value, target_reference, treatment_identity, raw_pointer)
			VALUES (?, ?, ?, ?, ?, ?)`)
			.run(responseId, response.classification.kind, response.classification.value, null, null, `${responsePointer}/classification`)
		stats.classifications++
	}
	if (isObject(response.lineage) && typeof response.lineage.kind === "string") {
		database.prepare(`INSERT INTO judgment_lineage
			(response_id, lineage_kind, from_artifact_path, from_raw_pointer, raw_json, raw_pointer) VALUES (?, ?, ?, ?, ?, ?)`)
			.run(responseId, response.lineage.kind, typeof response.lineage.fromArtifactPath === "string" ? response.lineage.fromArtifactPath : null,
				typeof response.lineage.fromRawPointer === "string" ? response.lineage.fromRawPointer : null,
				JSON.stringify(response.lineage), `${responsePointer}/lineage`)
		stats.lineageEdges++
	}
}

function quarantineReason(adapterId: string): string {
	const reasons: Record<string, string> = {
		"quarantine.missing-pareto-bindings": "Pareto feedback does not carry an exact candidate-set binding",
		"quarantine.ambiguous-gradient-control-mapping": "Gradient eligibility controls do not map unambiguously to complete-palette treatment semantics",
		"quarantine.specialized-controlled-field-state": "Controlled-field state supervision has a specialized target schema",
		"quarantine.specialized-typography": "Typography/APCA evidence has a specialized target schema",
		"quarantine.legacy-family-side-mapping": "Legacy family-side assignments do not identify exact complete-palette treatments",
	}
	return reasons[adapterId] ?? "Unsupported historical feedback semantics"
}

function feedbackBinding(value: JsonObject): JsonObject {
	const keys = ["manifestId", "contentId", "experimentId", "algorithmVersion", "previousAlgorithmVersion",
		"baselineAlgorithmVersion", "candidateAlgorithmVersion", "baselineResultsSemanticSha256", "candidateResultsSemanticSha256",
		"baselineHoldoutSemanticSha256", "candidateHoldoutSemanticSha256", "scientificIdentitySha256", "manifestSha256"]
	return Object.fromEntries(keys.flatMap((key) => value[key] === undefined ? [] : [[key, value[key]]])) as JsonObject
}

function addBinaryJudgment(
	database: DatabaseSync,
	feedback: NormalizedFeedback,
	response: JsonObject,
	responseId: number,
	pointer: string,
	stats: WarehouseBuildStats,
): void {
	const pairSha256 = typeof response.pairSha256 === "string" ? response.pairSha256 : null
	const left = typeof response.leftMethod === "string" ? response.leftMethod : null
	const right = typeof response.rightMethod === "string" ? response.rightMethod : null
	let rawOutcome: string | null = null
	let unblinded: string | null = null
	if (typeof response.choice === "string") rawOutcome = response.choice
	else if (typeof response.preference === "string") rawOutcome = response.preference
	else if (typeof response.shippable === "boolean") rawOutcome = response.shippable ? "shippable" : "not-shippable"
	if (rawOutcome === "left") unblinded = left
	else if (rawOutcome === "right") unblinded = right
	else unblinded = rawOutcome
	const reasons = Array.isArray(response.reasons) ? response.reasons : []
	const contract = JSON.parse(feedback.contractJson) as JsonObject
	const binding = {
		reviewVersion: feedback.reviewVersion,
		manifestId: feedback.manifestId,
		contentId: feedback.contentId,
		...feedbackBinding(contract),
		...feedbackBinding(response),
	}
	database.prepare(`INSERT INTO binary_judgments
		(response_id, scope_kind, scope_identity, left_reference, right_reference, raw_outcome, unblinded_outcome,
		secondary_outcome, reason_tags_json, binding_json, raw_pointer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
		responseId,
		pairSha256 ? "exact-pair" : typeof response.shippable === "boolean" ? "source-palette" : "presentation-pair",
		pairSha256 ?? (typeof response.image === "string" ? response.image : null), left, right, rawOutcome, unblinded,
		typeof response.ship === "string" ? response.ship : null, canonicalJson(reasons), canonicalJson(binding), pointer,
	)
	stats.binaryJudgments++
	const comment = typeof response.note === "string" ? response.note : typeof response.comment === "string" ? response.comment : null
	if (comment !== null) {
		database.prepare(`INSERT INTO comments (response_id, comment, raw_pointer) VALUES (?, ?, ?)`).run(
			responseId, comment, `${pointer}/${typeof response.note === "string" ? "note" : "comment"}`)
		stats.comments++
	}
}

function addTopologyJudgment(
	database: DatabaseSync,
	response: JsonObject,
	responseId: number,
	pointer: string,
	stats: WarehouseBuildStats,
): void {
	if (typeof response.pairSha256 !== "string" || typeof response.decision !== "string") return
	database.prepare(`INSERT INTO scoped_judgments
		(response_id, scope_kind, scope_identity, judgment_kind, target_reference, outcome, details_json, raw_pointer)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(responseId, "exact-pair", response.pairSha256, "gradient-topology",
		typeof response.familyId === "string" ? response.familyId : null, response.decision, null, `${pointer}/decision`)
	stats.scopedJudgments++
	if (typeof response.comment === "string") {
		database.prepare(`INSERT INTO comments (response_id, comment, raw_pointer) VALUES (?, ?, ?)`).run(
			responseId, response.comment, `${pointer}/comment`)
		stats.comments++
	}
}

export async function buildWarehouse(options: {
	projectRoot: string
	databasePath?: string
	currentReviewPaths?: readonly string[]
}): Promise<WarehouseBuildStats> {
	const databasePath = options.databasePath ?? join(options.projectRoot, defaultWarehouseRelativePath)
	const temporaryPath = `${databasePath}.tmp-${process.pid}-${Date.now()}`
	await mkdir(dirname(databasePath), { recursive: true })
	await rm(temporaryPath, { force: true })
	const inventory = await inventoryReviewArtifacts(options.projectRoot, { currentReviewPaths: options.currentReviewPaths })
	const database = new DatabaseSync(temporaryPath)
	const stats: WarehouseBuildStats = {
		databasePath,
		artifacts: inventory.length,
		feedbackArtifacts: inventory.filter((entry) => entry.kind === "feedback").length,
		manifestArtifacts: inventory.filter((entry) => entry.kind === "manifest").length,
		sourceInventoryArtifacts: inventory.filter((entry) => entry.kind === "source-inventory").length,
		responses: 0,
		absoluteJudgments: 0,
		pairwiseJudgments: 0,
		setwiseJudgments: 0,
		issueTags: 0,
		comments: 0,
		classifications: 0,
		binaryJudgments: 0,
		scopedJudgments: 0,
		lineageEdges: 0,
		treatments: 0,
		caseOptions: 0,
		unresolvedBindings: 0,
		excludedSources: 0,
		excludedResponses: 0,
		feedbackStores: 0,
		totalSubmissions: 0,
		boundStores: 0,
		boundSubmissions: 0,
		quarantinedStores: 0,
		quarantinedSubmissions: 0,
	}
	try {
		database.exec(schema)
		database.exec("BEGIN IMMEDIATE")
		for (const artifact of inventory) insertArtifact(database, artifact)

		const excluded = new Set<string>()
		const sourceByPath = new Map<string, string[]>()
		for (const artifact of inventory.filter((entry) => entry.kind === "source-inventory" || entry.kind === "source-exclusion")) {
			const loaded = await loadArtifact(options.projectRoot, artifact.absolutePath, artifact.kind)
			for (const source of sourceInventoryEntries(loaded)) {
				insertSource(database, { ...source, artifactPath: artifact.path })
				if (source.sourcePath) {
					const values = sourceByPath.get(source.sourcePath) ?? []
					values.push(source.sha256)
					sourceByPath.set(source.sourcePath, values)
				}
				if (artifact.path === fastSampleExclusionPath && exactSha(source.sha256)) {
					excluded.add(source.sha256)
					database.prepare(`INSERT OR IGNORE INTO excluded_sources VALUES (?, ?, ?)`)
						.run(source.sha256, artifact.path, source.rawPointer)
				}
			}
		}
		stats.excludedSources = excluded.size

		const manifests: ImportedManifest[] = []
		const byManifestId = new Map<string, ImportedManifest[]>()
		const byContentId = new Map<string, ImportedManifest[]>()
		const byReviewVersion = new Map<string, ImportedManifest[]>()
		for (const artifact of inventory.filter((entry) => entry.kind === "manifest")) {
			const loaded = await loadArtifact(options.projectRoot, artifact.absolutePath, "manifest")
			if (loaded.adapterId === "unsupported") {
				insertUnresolved(database, { artifactPath: artifact.path, rawPointer: "", bindingKind: "artifact",
					reason: "No V2 manifest adapter accepted this artifact" })
				continue
			}
			const manifest = normalizeManifest(loaded)
			database.prepare(`INSERT INTO review_contracts VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
				.run(artifact.path, manifest.reviewVersion, manifest.manifestId, manifest.contentId, manifest.reviewUnit,
					manifest.presentationVersion, manifest.candidateVersion, manifest.configurationJson)
			const importedCases: ImportedCase[] = []
			for (const entry of manifest.cases) {
				const isExcluded = entry.sourceSha256 ? excluded.has(entry.sourceSha256) : false
				const result = database.prepare(`INSERT INTO review_cases
					(manifest_path, case_id, public_item_id, source_sha256, source_path, artwork_family_id, raw_pointer, excluded)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
					.run(artifact.path, entry.caseId, entry.publicItemId, entry.sourceSha256, entry.sourcePath, entry.artworkFamilyId,
						entry.rawPointer, isExcluded ? 1 : 0)
				const imported: ImportedCase = { ...entry, databaseId: lastId(result), excluded: isExcluded }
				importedCases.push(imported)
				insertSource(database, { sha256: entry.sourceSha256, sourcePath: entry.sourcePath, artworkFamilyId: entry.artworkFamilyId,
					artifactPath: artifact.path, rawPointer: entry.rawPointer })
				if (!exactSha(entry.sourceSha256)) insertUnresolved(database, { artifactPath: artifact.path, rawPointer: entry.rawPointer,
					bindingKind: "source", rawReference: entry.sourceSha256, reason: "Manifest case has no exact source SHA-256" })
				if (isExcluded) continue
				for (const option of entry.options) {
					insertTreatment(database, option, manifest.presentationVersion)
					database.prepare(`INSERT INTO case_options
						(case_database_id, option_label, assignment_label, semantic_label, treatment_identity, render_variant_id,
						raw_treatment_id, candidate_version, configuration_json, raw_pointer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
						.run(imported.databaseId, option.label, option.assignmentLabel, option.semanticLabel, option.treatmentIdentity,
							option.renderVariantId, option.rawTreatmentId, option.candidateVersion, option.configurationJson, option.rawPointer)
					stats.caseOptions++
				}
			}
			const imported: ImportedManifest = { ...manifest, cases: importedCases }
			manifests.push(imported)
			if (manifest.manifestId) {
				const values = byManifestId.get(manifest.manifestId) ?? []
				values.push(imported)
				byManifestId.set(manifest.manifestId, values)
			}
			if (manifest.contentId) {
				const values = byContentId.get(manifest.contentId) ?? []
				values.push(imported)
				byContentId.set(manifest.contentId, values)
			}
			const versions = byReviewVersion.get(manifest.reviewVersion) ?? []
			versions.push(imported)
			byReviewVersion.set(manifest.reviewVersion, versions)
		}

		for (const artifact of inventory.filter((entry) => entry.kind === "feedback")) {
			const loaded = await loadArtifact(options.projectRoot, artifact.absolutePath, "feedback")
			if (loaded.adapterId === "unsupported") {
				insertUnresolved(database, { artifactPath: artifact.path, rawPointer: "", bindingKind: "artifact",
					reason: "No review-evidence feedback adapter accepted this artifact" })
				continue
			}
			const feedback = normalizeFeedback(loaded)
			stats.feedbackStores++
			stats.totalSubmissions += feedback.responses.length
			if (loaded.adapterId.startsWith("quarantine.")) {
				const reason = quarantineReason(loaded.adapterId)
				database.prepare(`INSERT INTO feedback_stores VALUES (?, ?, 'quarantined', ?, ?, ?, 0, ?)`).run(
					artifact.path, loaded.adapterId, reason, feedback.contractJson, feedback.responses.length, feedback.responses.length)
				stats.quarantinedStores++
				stats.quarantinedSubmissions += feedback.responses.length
				for (let index = 0; index < feedback.responses.length; index++) {
					database.prepare(`INSERT INTO quarantined_submissions
						(artifact_path, review_version, raw_pointer, reason, raw_response_json) VALUES (?, ?, ?, ?, ?)`).run(
						artifact.path, loaded.reviewVersion, jsonPointer(feedback.containerKey, index), reason,
						JSON.stringify(feedback.responses[index]))
				}
				continue
			}
			database.prepare(`INSERT INTO feedback_stores VALUES (?, ?, 'bound', NULL, ?, ?, ?, 0)`).run(
				artifact.path, loaded.adapterId, feedback.contractJson, feedback.responses.length, feedback.responses.length)
			stats.boundStores++
			stats.boundSubmissions += feedback.responses.length
			const legacy = loaded.adapterId.startsWith("legacy.")
			const matched = feedback.manifestId ? byManifestId.get(feedback.manifestId) ?? []
				: feedback.contentId ? byContentId.get(feedback.contentId) ?? []
					: byReviewVersion.get(feedback.reviewVersion) ?? []
			const manifest = matched.length === 1 ? matched[0] : null
			if (!manifest && !legacy) insertUnresolved(database, { artifactPath: artifact.path, rawPointer: "", bindingKind: "manifest",
				rawReference: feedback.manifestId ?? feedback.contentId,
				reason: matched.length > 1 ? "Feedback identity matches multiple manifests" : "Feedback identity matches no imported manifest" })
			if (manifest && feedback.reviewVersion !== manifest.reviewVersion) insertUnresolved(database, { artifactPath: artifact.path,
				rawPointer: "/reviewVersion", bindingKind: "review-contract", rawReference: feedback.reviewVersion,
				reason: "Feedback and manifest reviewVersion values differ", details: { manifestReviewVersion: manifest.reviewVersion } })
			if (manifest && feedback.manifestRawSha256 && feedback.manifestRawSha256 !== manifest.artifact.rawSha256) {
				insertUnresolved(database, { artifactPath: artifact.path, rawPointer: "/manifestRawSha256", bindingKind: "manifest-bytes",
					rawReference: feedback.manifestRawSha256, reason: "Feedback manifestRawSha256 does not match the bound manifest bytes",
					details: { actual: manifest.artifact.rawSha256 } })
			}

			for (let index = 0; index < feedback.responses.length; index++) {
				const response = feedback.responses[index]
				const pointer = jsonPointer(feedback.containerKey, index)
				const identity = responseIdentity(response)
				const caseMatches = manifest ? manifest.cases.filter((entry) => identity.publicItemId
					? entry.publicItemId === identity.publicItemId
					: entry.caseId === identity.caseId) : []
				const entry = caseMatches.length === 1 ? caseMatches[0] : null
				const image = typeof response.image === "string" ? response.image : null
				const sourceHashes = isObject(loaded.value.sourceHashes) ? loaded.value.sourceHashes : null
				const pathSources = image ? [...new Set(sourceByPath.get(image) ?? [])] : []
				const responseSource = identity.sourceSha256 ?? entry?.sourceSha256 ??
					(image && sourceHashes && typeof sourceHashes[image] === "string" ? sourceHashes[image] as string : null) ??
					(pathSources.length === 1 ? pathSources[0] : null)
				let status = legacy || (manifest && entry) ? "bound" : "unresolved"
				if (entry?.excluded || (responseSource ? excluded.has(responseSource) : false)) status = "excluded"
				if (entry && identity.sourceSha256 && entry.sourceSha256 !== identity.sourceSha256) status = "unresolved"
				const submittedAt = typeof response.submittedAt === "string" ? response.submittedAt
					: typeof response.timestamp === "string" ? response.timestamp
						: typeof response.decidedAt === "string" ? response.decidedAt : feedback.submittedAt
				const responseResult = database.prepare(`INSERT INTO responses
					(artifact_path, review_version, manifest_path, case_database_id, case_id, public_item_id, source_sha256,
					submitted_at, raw_pointer, raw_response_json, binding_status, lineage_status)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
					.run(artifact.path, feedback.reviewVersion, manifest?.artifact.path ?? null, entry?.databaseId ?? null,
						identity.caseId ?? entry?.caseId ?? (typeof response.id === "string" ? response.id : image), identity.publicItemId,
						responseSource, submittedAt, pointer,
						JSON.stringify(response), status, isObject(response.lineage) ? "explicit" : "unspecified")
				const responseId = lastId(responseResult)
				stats.responses++
				insertSource(database, { sha256: responseSource, sourcePath: entry?.sourcePath ?? null,
					artworkFamilyId: entry?.artworkFamilyId ?? null, artifactPath: artifact.path, rawPointer: pointer })
				if (legacy) addBinaryJudgment(database, feedback, response, responseId, pointer, stats)
				else if (!manifest) insertUnresolved(database, { artifactPath: artifact.path, responseId, rawPointer: pointer,
					bindingKind: "manifest", rawReference: feedback.manifestId ?? feedback.contentId,
					reason: "Response cannot bind without one exact manifest" })
				else if (!entry) insertUnresolved(database, { artifactPath: artifact.path, responseId, rawPointer: pointer,
					bindingKind: "case", rawReference: identity.caseId ?? identity.publicItemId,
					reason: caseMatches.length > 1 ? "Response case reference is ambiguous" : "Response case reference is absent from the bound manifest" })
				else if (identity.sourceSha256 && entry.sourceSha256 !== identity.sourceSha256) insertUnresolved(database, {
					artifactPath: artifact.path, responseId, rawPointer: `${pointer}/sourceSha256`, bindingKind: "source",
					rawReference: identity.sourceSha256, reason: "Feedback source SHA-256 differs from the bound manifest case",
					details: { manifestSourceSha256: entry.sourceSha256 },
				})
				else if (status === "excluded") stats.excludedResponses++
				else if (loaded.adapterId === "native-spatial.pair-feedback-v1") {
					addBinaryJudgment(database, feedback, response, responseId, pointer, stats)
				} else if (loaded.adapterId === "gradient-topology.scoped-feedback-v1") {
					addTopologyJudgment(database, response, responseId, pointer, stats)
				} else addFeedbackJudgments(database, feedback, response, responseId, pointer, entry, stats)
			}
		}

		for (const artifact of inventory.filter((entry) => entry.kind === "unsupported")) {
			insertUnresolved(database, { artifactPath: artifact.path, rawPointer: "", bindingKind: "artifact",
				reason: "Selected historical artifact has no supported adapter" })
		}
		database.exec("COMMIT")
		stats.treatments = Number((database.prepare(`SELECT count(*) AS count FROM treatments`).get() as { count: number }).count)
		stats.unresolvedBindings = Number((database.prepare(`SELECT count(*) AS count FROM unresolved_bindings`).get() as { count: number }).count)
		database.exec("PRAGMA optimize")
	} catch (error) {
		try { database.exec("ROLLBACK") } catch { /* transaction may not have started */ }
		database.close()
		await rm(temporaryPath, { force: true })
		throw error
	}
	database.close()
	await rm(databasePath, { force: true })
	await rename(temporaryPath, databasePath)
	await chmod(databasePath, 0o444)
	return stats
}

export function openWarehouse(databasePath: string): DatabaseSync {
	const database = new DatabaseSync(databasePath, { readOnly: true } as never)
	database.exec("PRAGMA foreign_keys = ON; PRAGMA query_only = ON")
	return database
}
