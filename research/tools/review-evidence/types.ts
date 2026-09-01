export type JsonObject = Record<string, unknown>

export type ArtifactKind = "feedback" | "manifest" | "source-inventory" | "source-exclusion" | "unsupported"

export type ArtifactInventoryRecord = {
	path: string
	absolutePath: string
	rawSha256: string
	byteCount: number
	kind: ArtifactKind
	privacy: "public" | "private" | "protected"
	adapterId: string
	schemaVersion: number | null
	reviewVersion: string | null
	manifestId: string | null
	contentId: string | null
}

export type VisibleRole = {
	rgb: [number, number, number]
	generated: boolean
}

export type VisibleTreatment = {
	schemaVersion: 1
	roles: {
		background: VisibleRole
		surface: VisibleRole
		foreground: VisibleRole
		accent: VisibleRole
	}
	collapse: {
		surface: boolean | null
		accent: boolean | null
	}
	gradient: {
		enabled: boolean
	}
}

export type NormalizedTreatment = {
	treatmentIdentity: string
	visible: VisibleTreatment
	renderVariantId: string
	renderVariant: JsonObject
	rawTreatmentId: string | null
}

export type NormalizedOption = NormalizedTreatment & {
	label: string
	assignmentLabel: string | null
	semanticLabel: string | null
	candidateVersion: string | null
	configurationJson: string | null
	rawPointer: string
}

export type NormalizedCase = {
	caseId: string
	publicItemId: string | null
	sourceSha256: string | null
	sourcePath: string | null
	artworkFamilyId: string | null
	rawPointer: string
	options: NormalizedOption[]
}

export type NormalizedManifest = {
	artifact: ArtifactInventoryRecord
	reviewVersion: string
	manifestId: string | null
	contentId: string | null
	reviewUnit: string | null
	presentationVersion: string | null
	candidateVersion: string | null
	configurationJson: string | null
	cases: NormalizedCase[]
}

export type NormalizedFeedback = {
	artifact: ArtifactInventoryRecord
	reviewVersion: string
	manifestId: string | null
	contentId: string | null
	manifestRawSha256: string | null
	contractJson: string
	containerKey: "entries" | "responses"
	responses: JsonObject[]
	submittedAt: string | null
}

export type CandidateTreatment = NormalizedTreatment & {
	caseId: string
	sourceSha256: string
	reviewQuestion: "absolute-quality"
}

export type WarehouseBuildStats = {
	databasePath: string
	artifacts: number
	feedbackArtifacts: number
	manifestArtifacts: number
	sourceInventoryArtifacts: number
	responses: number
	absoluteJudgments: number
	pairwiseJudgments: number
	setwiseJudgments: number
	issueTags: number
	comments: number
	classifications: number
	binaryJudgments: number
	scopedJudgments: number
	lineageEdges: number
	treatments: number
	caseOptions: number
	unresolvedBindings: number
	excludedSources: number
	excludedResponses: number
	feedbackStores: number
	totalSubmissions: number
	boundStores: number
	boundSubmissions: number
	quarantinedStores: number
	quarantinedSubmissions: number
}
