import type { DatabaseSync } from "node:sqlite"
import type { CandidateTreatment } from "./types.ts"

type Row = Record<string, unknown>

export type ArtworkHistoricalContext = Readonly<{
	sourceSha256: string
	sourceRelationships: readonly Row[]
	issueTags: readonly Row[]
	comments: readonly Row[]
}>

function rows(database: DatabaseSync, sql: string, ...parameters: Array<string | number | null>): Row[] {
	return database.prepare(sql).all(...parameters).map((value) => ({ ...value as Row }))
}

function treatmentIdentities(database: DatabaseSync, input: { treatmentIdentity?: string; rawTreatmentId?: string }): string[] {
	if (input.treatmentIdentity) return [input.treatmentIdentity]
	if (!input.rawTreatmentId) return []
	return rows(database, `SELECT DISTINCT treatment_identity FROM case_options WHERE raw_treatment_id = ? ORDER BY treatment_identity`,
		input.rawTreatmentId).map((row) => row.treatment_identity as string)
}

function placeholders(count: number): string {
	return Array.from({ length: count }, () => "?").join(", ")
}

export function artworkHistoricalContext(
	database: DatabaseSync,
	sourceSha256: string,
): ArtworkHistoricalContext {
	return {
		sourceSha256,
		sourceRelationships: rows(database, `SELECT source_path, artwork_family_id, artifact_path, raw_pointer
			FROM source_occurrences WHERE source_sha256 = ? ORDER BY artifact_path, raw_pointer`, sourceSha256),
		issueTags: rows(database, `SELECT i.tag, i.target_reference, i.treatment_identity, i.raw_pointer,
			r.artifact_path, r.raw_pointer AS response_pointer, r.case_id, r.submitted_at, r.raw_response_json
			FROM issue_tags i JOIN responses r ON r.id = i.response_id
			WHERE r.binding_status = 'bound' AND r.source_sha256 = ?
			ORDER BY r.submitted_at, r.artifact_path, i.id`, sourceSha256),
		comments: rows(database, `SELECT m.comment, m.raw_pointer, r.artifact_path,
			r.raw_pointer AS response_pointer, r.case_id, r.submitted_at, r.raw_response_json
			FROM comments m JOIN responses r ON r.id = m.response_id
			WHERE r.binding_status = 'bound' AND r.source_sha256 = ? AND m.comment <> ''
			ORDER BY r.submitted_at, r.artifact_path, m.id`, sourceSha256),
	}
}

export function exactTreatmentLookup(database: DatabaseSync, input: {
	sourceSha256: string
	treatmentIdentity?: string
	rawTreatmentId?: string
	renderVariantId?: string
}): JsonReport {
	const identities = treatmentIdentities(database, input)
	const excluded = rows(database, `SELECT * FROM excluded_sources WHERE source_sha256 = ?`, input.sourceSha256)
	if (excluded.length > 0) return { sourceSha256: input.sourceSha256, excluded: true, exclusion: excluded[0] }
	const artworkHistory = artworkHistoricalContext(database, input.sourceSha256)
	if (identities.length === 0) return {
		sourceSha256: input.sourceSha256,
		excluded: false,
		inputTreatmentIdentity: input.treatmentIdentity ?? null,
		inputRawTreatmentId: input.rawTreatmentId ?? null,
		resolvedTreatmentIdentities: [],
		sourceRelationships: artworkHistory.sourceRelationships,
		artworkHistory,
		absoluteJudgments: [],
		setwiseJudgments: [],
		pairwiseAppearances: [],
		issueTags: [],
		comments: [],
	}
	const identitySql = placeholders(identities.length)
	const renderClause = input.renderVariantId ? " AND a.render_variant_id = ?" : ""
	const absoluteParameters = [input.sourceSha256, ...identities, ...(input.renderVariantId ? [input.renderVariantId] : [])]
	const absolute = rows(database, `SELECT a.quality, a.target_reference, a.treatment_identity, a.render_variant_id,
		r.artifact_path, r.raw_pointer AS response_pointer, a.raw_pointer, r.submitted_at, r.raw_response_json,
		c.presentation_version, c.review_unit, o.assignment_label, o.semantic_label, o.candidate_version, o.configuration_json
		FROM absolute_judgments a
		JOIN responses r ON r.id = a.response_id
		LEFT JOIN review_contracts c ON c.manifest_path = r.manifest_path
		LEFT JOIN case_options o ON o.case_database_id = r.case_database_id AND o.treatment_identity = a.treatment_identity AND
			(o.option_label = a.target_reference OR o.raw_treatment_id = a.target_reference)
		WHERE r.binding_status = 'bound' AND r.source_sha256 = ? AND a.treatment_identity IN (${identitySql})${renderClause}
		ORDER BY r.submitted_at, r.artifact_path, a.id`, ...absoluteParameters)
	const setwise = rows(database, `SELECT s.*, r.source_sha256, r.artifact_path, r.raw_response_json, r.submitted_at
		FROM setwise_judgments s JOIN responses r ON r.id = s.response_id
		WHERE r.binding_status = 'bound' AND r.source_sha256 = ? ORDER BY r.submitted_at, s.id`, input.sourceSha256)
		.filter((row) => {
			const values = JSON.parse(row.valid_treatment_identities_json as string) as string[]
			return values.some((value) => identities.includes(value))
		})
	const pairwise = rows(database, `SELECT p.*, r.source_sha256, r.artifact_path, r.raw_response_json, r.submitted_at
		FROM pairwise_judgments p JOIN responses r ON r.id = p.response_id
		WHERE r.binding_status = 'bound' AND r.source_sha256 = ? AND
		(p.left_treatment_identity IN (${identitySql}) OR p.right_treatment_identity IN (${identitySql}))
		ORDER BY r.submitted_at, p.id`, input.sourceSha256, ...identities, ...identities)
	const issues = rows(database, `SELECT i.*, r.artifact_path, r.submitted_at FROM issue_tags i
		JOIN responses r ON r.id = i.response_id
		WHERE r.binding_status = 'bound' AND r.source_sha256 = ? AND i.treatment_identity IN (${identitySql})
		ORDER BY r.submitted_at, i.id`, input.sourceSha256, ...identities)
	const comments = rows(database, `SELECT DISTINCT m.comment, m.raw_pointer, r.artifact_path, r.submitted_at, r.raw_response_json
		FROM comments m JOIN responses r ON r.id = m.response_id
		LEFT JOIN absolute_judgments a ON a.response_id = r.id
		LEFT JOIN pairwise_judgments p ON p.response_id = r.id
		WHERE r.binding_status = 'bound' AND r.source_sha256 = ? AND
		(a.treatment_identity IN (${identitySql}) OR p.left_treatment_identity IN (${identitySql}) OR p.right_treatment_identity IN (${identitySql}))
		ORDER BY r.submitted_at, r.artifact_path`, input.sourceSha256, ...identities, ...identities, ...identities)
	const qualities = [...new Set(absolute.map((row) => row.quality as string))].sort()
	return {
		sourceSha256: input.sourceSha256,
		excluded: false,
		inputTreatmentIdentity: input.treatmentIdentity ?? null,
		inputRawTreatmentId: input.rawTreatmentId ?? null,
		resolvedTreatmentIdentities: identities,
		sourceRelationships: artworkHistory.sourceRelationships,
		artworkHistory,
		renderVariantId: input.renderVariantId ?? null,
		absoluteQualities: qualities,
		conflictingAbsoluteQualities: qualities.length > 1,
		absoluteJudgments: absolute,
		setwiseJudgments: setwise,
		pairwiseAppearances: pairwise,
		issueTags: issues,
		comments,
	}
}

export function exactPairHistory(database: DatabaseSync, input: {
	sourceSha256: string
	firstTreatmentIdentity?: string
	firstRawTreatmentId?: string
	secondTreatmentIdentity?: string
	secondRawTreatmentId?: string
}): JsonReport {
	const excluded = rows(database, `SELECT * FROM excluded_sources WHERE source_sha256 = ?`, input.sourceSha256)
	if (excluded.length > 0) return { sourceSha256: input.sourceSha256, excluded: true, history: [] }
	const first = treatmentIdentities(database, { treatmentIdentity: input.firstTreatmentIdentity, rawTreatmentId: input.firstRawTreatmentId })
	const second = treatmentIdentities(database, { treatmentIdentity: input.secondTreatmentIdentity, rawTreatmentId: input.secondRawTreatmentId })
	let history = rows(database, `SELECT p.*, r.artifact_path, r.raw_pointer AS response_pointer, r.raw_response_json,
		r.submitted_at, c.review_version, c.presentation_version,
		lo.assignment_label AS left_assignment_label, lo.semantic_label AS left_semantic_label,
		ro.assignment_label AS right_assignment_label, ro.semantic_label AS right_semantic_label
		, lo.candidate_version AS left_candidate_version, lo.configuration_json AS left_configuration_json
		, ro.candidate_version AS right_candidate_version, ro.configuration_json AS right_configuration_json
		FROM pairwise_judgments p
		JOIN responses r ON r.id = p.response_id
		LEFT JOIN review_contracts c ON c.manifest_path = r.manifest_path
		LEFT JOIN case_options lo ON lo.case_database_id = r.case_database_id AND lo.option_label = p.left_reference
		LEFT JOIN case_options ro ON ro.case_database_id = r.case_database_id AND ro.option_label = p.right_reference
		WHERE r.binding_status = 'bound' AND r.source_sha256 = ? ORDER BY r.submitted_at, p.id`, input.sourceSha256)
	if (first.length > 0 && second.length > 0) history = history.filter((row) =>
		(first.includes(row.left_treatment_identity as string) && second.includes(row.right_treatment_identity as string)) ||
		(first.includes(row.right_treatment_identity as string) && second.includes(row.left_treatment_identity as string)))
	return {
		sourceSha256: input.sourceSha256,
		excluded: false,
		firstTreatmentIdentities: first,
		secondTreatmentIdentities: second,
		judgmentCount: history.length,
		history,
	}
}

type JsonReport = Record<string, unknown>

type ConflictEntry = {
	key: string
	sourceSha256: string
	treatmentIdentity?: string
	renderVariantId?: string
	firstTreatmentIdentity?: string
	secondTreatmentIdentity?: string
	values: string[]
	judgments: Row[]
}

function groupedConflicts(values: Row[], kind: "absolute" | "pairwise"): { repeats: ConflictEntry[]; conflicts: ConflictEntry[] } {
	const grouped = new Map<string, Row[]>()
	for (const value of values) {
		const key = kind === "absolute"
			? `${value.source_sha256}\0${value.treatment_identity}\0${value.render_variant_id}`
			: `${value.source_sha256}\0${value.first_treatment_identity}\0${value.first_render_variant_id}\0${value.second_treatment_identity}\0${value.second_render_variant_id}`
		const entries = grouped.get(key) ?? []
		entries.push(value)
		grouped.set(key, entries)
	}
	const repeats: ConflictEntry[] = []
	const conflicts: ConflictEntry[] = []
	for (const [key, judgments] of grouped) {
		if (judgments.length < 2) continue
		const first = judgments[0]
		const distinct = [...new Set(judgments.map((entry) => String(kind === "absolute" ? entry.quality : entry.normalized_outcome ?? entry.unblinded_outcome)))].sort()
		const report: ConflictEntry = kind === "absolute" ? {
			key,
			sourceSha256: first.source_sha256 as string,
			treatmentIdentity: first.treatment_identity as string,
			renderVariantId: first.render_variant_id as string,
			values: distinct,
			judgments,
		} : {
			key,
			sourceSha256: first.source_sha256 as string,
			firstTreatmentIdentity: first.first_treatment_identity as string,
			secondTreatmentIdentity: first.second_treatment_identity as string,
			values: distinct,
			judgments,
		}
		repeats.push(report)
		if (distinct.length > 1) conflicts.push(report)
	}
	return { repeats, conflicts }
}

export function conflictReport(database: DatabaseSync): JsonReport {
	const absoluteRows = rows(database, `SELECT r.source_sha256, a.treatment_identity, a.render_variant_id, a.quality,
		r.artifact_path, a.raw_pointer, r.submitted_at, r.raw_response_json
		FROM absolute_judgments a JOIN responses r ON r.id = a.response_id
		WHERE r.binding_status = 'bound' AND a.treatment_identity IS NOT NULL AND a.render_variant_id IS NOT NULL
		ORDER BY r.source_sha256, a.treatment_identity, a.render_variant_id, r.submitted_at, a.id`)
	const pairRows = rows(database, `SELECT r.source_sha256,
		CASE WHEN p.left_treatment_identity < p.right_treatment_identity THEN p.left_treatment_identity ELSE p.right_treatment_identity END AS first_treatment_identity,
		CASE WHEN p.left_treatment_identity < p.right_treatment_identity THEN p.left_render_variant_id ELSE p.right_render_variant_id END AS first_render_variant_id,
		CASE WHEN p.left_treatment_identity < p.right_treatment_identity THEN p.right_treatment_identity ELSE p.left_treatment_identity END AS second_treatment_identity,
		CASE WHEN p.left_treatment_identity < p.right_treatment_identity THEN p.right_render_variant_id ELSE p.left_render_variant_id END AS second_render_variant_id,
		p.normalized_outcome, p.unblinded_outcome, p.raw_outcome, r.artifact_path, p.raw_pointer, r.submitted_at, r.raw_response_json
		FROM pairwise_judgments p JOIN responses r ON r.id = p.response_id
		WHERE r.binding_status = 'bound' AND p.left_treatment_identity IS NOT NULL AND p.right_treatment_identity IS NOT NULL
		ORDER BY r.source_sha256, first_treatment_identity, second_treatment_identity, r.submitted_at, p.id`)
	const absolute = groupedConflicts(absoluteRows, "absolute")
	const pairwise = groupedConflicts(pairRows, "pairwise")
	return {
		absoluteRepeatCount: absolute.repeats.length,
		absoluteConflictCount: absolute.conflicts.length,
		pairwiseRepeatCount: pairwise.repeats.length,
		pairwiseConflictCount: pairwise.conflicts.length,
		absoluteRepeats: absolute.repeats,
		absoluteConflicts: absolute.conflicts,
		pairwiseRepeats: pairwise.repeats,
		pairwiseConflicts: pairwise.conflicts,
	}
}

export function unresolvedBindingsReport(database: DatabaseSync): JsonReport {
	const unresolved = rows(database, `SELECT u.*, a.raw_sha256 AS artifact_raw_sha256, a.adapter_id, r.raw_response_json
		FROM unresolved_bindings u JOIN artifacts a ON a.path = u.artifact_path
		LEFT JOIN responses r ON r.id = u.response_id ORDER BY u.artifact_path, u.raw_pointer, u.id`)
	return { unresolvedCount: unresolved.length, unresolved }
}

export function minimalReviewNeed(database: DatabaseSync, candidates: CandidateTreatment[]): JsonReport {
	const entries = candidates.map((candidate) => {
		const excluded = rows(database, `SELECT artifact_path, raw_pointer FROM excluded_sources WHERE source_sha256 = ?`, candidate.sourceSha256)
		if (excluded.length > 0) return {
			caseId: candidate.caseId,
			sourceSha256: candidate.sourceSha256,
			treatmentIdentity: candidate.treatmentIdentity,
			renderVariantId: candidate.renderVariantId,
			status: "excluded-source",
			reviewNeeded: false,
			exclusion: excluded[0],
		}
		const semantic = rows(database, `SELECT a.quality, a.render_variant_id, r.artifact_path, a.raw_pointer, r.submitted_at
			FROM absolute_judgments a JOIN responses r ON r.id = a.response_id
			WHERE r.binding_status = 'bound' AND r.source_sha256 = ? AND a.treatment_identity = ?
			ORDER BY r.submitted_at, a.id`, candidate.sourceSha256, candidate.treatmentIdentity)
		const exact = semantic.filter((row) => row.render_variant_id === candidate.renderVariantId)
		const qualities = [...new Set(exact.map((row) => row.quality as string))].sort()
		const conflict = qualities.length > 1
		const uncertain = qualities.includes("uncertain")
		const reusable = exact.length > 0 && !conflict && !uncertain
		return {
			caseId: candidate.caseId,
			sourceSha256: candidate.sourceSha256,
			treatmentIdentity: candidate.treatmentIdentity,
			renderVariantId: candidate.renderVariantId,
			status: reusable ? "exact-evidence-reused" : conflict ? "conflicting-exact-evidence"
				: uncertain ? "uncertain-exact-evidence" : semantic.length > 0 ? "incompatible-render-variant" : "no-exact-absolute-evidence",
			reviewNeeded: !reusable,
			exactQualities: qualities,
			exactJudgments: exact,
			relatedVisibleTreatmentJudgments: semantic.length - exact.length,
		}
	})
	const considered = entries.filter((entry) => entry.status !== "excluded-source")
	const consideredSources = [...new Set(considered.map(({ sourceSha256 }) => sourceSha256))].sort()
	return {
		candidateCount: candidates.length,
		excludedCount: entries.length - considered.length,
		reviewNeededCount: considered.filter((entry) => entry.reviewNeeded).length,
		reviewWorkAvoidedCount: considered.filter((entry) => !entry.reviewNeeded).length,
		artworkHistory: consideredSources.map((sourceSha256) => artworkHistoricalContext(database, sourceSha256)),
		entries,
	}
}

export function warehouseSummary(database: DatabaseSync): JsonReport {
	const count = (table: string): number => Number((database.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count)
	return {
		artifacts: count("artifacts"),
		feedbackArtifacts: Number((database.prepare(`SELECT count(*) AS count FROM artifacts WHERE artifact_kind = 'feedback'`).get() as { count: number }).count),
		manifestArtifacts: Number((database.prepare(`SELECT count(*) AS count FROM artifacts WHERE artifact_kind = 'manifest'`).get() as { count: number }).count),
		responses: count("responses"),
		absoluteJudgments: count("absolute_judgments"),
		pairwiseJudgments: count("pairwise_judgments"),
		binaryJudgments: count("binary_judgments"),
		scopedJudgments: count("scoped_judgments"),
		setwiseJudgments: count("setwise_judgments"),
		issueTags: count("issue_tags"),
		comments: count("comments"),
		treatments: count("treatments"),
		caseOptions: count("case_options"),
		unresolvedBindings: count("unresolved_bindings"),
		excludedSources: count("excluded_sources"),
		feedbackStores: count("feedback_stores"),
		totalSubmissions: Number((database.prepare(`SELECT coalesce(sum(submission_count), 0) AS count FROM feedback_stores`).get() as { count: number }).count),
		boundStores: Number((database.prepare(`SELECT count(*) AS count FROM feedback_stores WHERE disposition = 'bound'`).get() as { count: number }).count),
		boundSubmissions: Number((database.prepare(`SELECT coalesce(sum(bound_count), 0) AS count FROM feedback_stores`).get() as { count: number }).count),
		quarantinedStores: Number((database.prepare(`SELECT count(*) AS count FROM feedback_stores WHERE disposition = 'quarantined'`).get() as { count: number }).count),
		quarantinedSubmissions: count("quarantined_submissions"),
	}
}
