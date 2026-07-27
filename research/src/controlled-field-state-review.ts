import { createHash } from "node:crypto"
import type { NextPalettePresentedPalette } from "./next-palette-review-v2.ts"
import type { RGB, RoleName } from "./types.ts"

export const CONTROLLED_FIELD_STATE_REVIEW_VERSION = "controlled-field-state-review-0.1.0" as const
export const CONTROLLED_FIELD_STATE_PRESENTATION_VERSION = "controlled-field-state-presentation-1" as const
export const controlledFieldStateTasks = ["ordered-pair", "multiplicity", "gradient-diagnostic"] as const
export const controlledFieldStateEligibility = [
	"eligible-artwork", "not-album-artwork", "not-reviewable", "uncertain",
] as const
export const controlledFieldStatePreferences = [
	"a-stronger", "b-stronger", "either-way", "no-visible-difference", "uncertain",
] as const
export const controlledFieldStateReasons = [
	"source-fidelity",
	"field-identity",
	"too-collapsed",
	"unnecessary-second-field",
	"unnecessary-gradient",
	"missing-gradient",
	"endpoint-visibility",
] as const

export type ControlledFieldStateTask = typeof controlledFieldStateTasks[number]
export type ControlledFieldStateEligibility = typeof controlledFieldStateEligibility[number]
export type ControlledFieldStatePreference = typeof controlledFieldStatePreferences[number]
export type ControlledFieldStateReason = typeof controlledFieldStateReasons[number]
export type ControlledFieldStateOption = "A" | "B"
export type ControlledFieldStateTreatment =
	| "pair-primary"
	| "pair-challenger"
	| "collapsed"
	| "two-field"
	| "flat"
	| "gradient"

export type ControlledFieldStateReviewEntry = {
	caseId: string
	order: number
	task: ControlledFieldStateTask
	source: { file: string; sha256: string; bytes: number; width: number; height: number }
	options: Record<ControlledFieldStateOption, NextPalettePresentedPalette>
	assignment: Record<ControlledFieldStateOption, ControlledFieldStateTreatment>
}

export type ControlledFieldStateReviewManifest = {
	schemaVersion: 1
	reviewVersion: typeof CONTROLLED_FIELD_STATE_REVIEW_VERSION
	presentationVersion: typeof CONTROLLED_FIELD_STATE_PRESENTATION_VERSION
	generatedAt: string
	manifestId: string
	experimentId: string
	batch: { index: number; size: number; totalBatches: number; totalCases: number }
	provenance: {
		experiment: Record<string, string>
		implementation: Record<string, string>
		presentation: Record<string, string>
	}
	entries: ControlledFieldStateReviewEntry[]
}

export type ControlledFieldStateFeedbackEntry = {
	caseId: string
	sourceSha256: string
	sourceEligibility: ControlledFieldStateEligibility
	preference: ControlledFieldStatePreference | null
	reasonsA: ControlledFieldStateReason[]
	reasonsB: ControlledFieldStateReason[]
	note: string
	submittedAt: string
}

export type ControlledFieldStateFeedbackStore = {
	schemaVersion: 1
	reviewVersion: typeof CONTROLLED_FIELD_STATE_REVIEW_VERSION
	manifestId: string
	entries: ControlledFieldStateFeedbackEntry[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
	const keys = Object.keys(value).sort()
	const wanted = [...expected].sort()
	if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
		throw new Error(`${label} fields are invalid`)
	}
}

function isSha256(value: unknown): value is string {
	return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
}

function validTimestamp(value: unknown): value is string {
	return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}

function isRgb(value: unknown): value is RGB {
	return Array.isArray(value) && value.length === 3 && value.every((channel) =>
		Number.isInteger(channel) && channel >= 0 && channel <= 255)
}

function parsePalette(value: unknown, label: string): NextPalettePresentedPalette {
	if (!isRecord(value) || !isRecord(value.roles) || !isRecord(value.gradient) || !isRecord(value.metrics) ||
		typeof value.gradient.isGradient !== "boolean" || typeof value.gradient.confidence !== "number" ||
		!Number.isFinite(value.gradient.confidence) || value.gradient.confidence < 0 || value.gradient.confidence > 1) {
		throw new Error(`${label} is invalid`)
	}
	exactKeys(value, ["roles", "gradient", "metrics"], label)
	exactKeys(value.roles, ["background", "foreground", "surface", "accent"], `${label} roles`)
	exactKeys(value.gradient, ["isGradient", "confidence"], `${label} gradient`)
	exactKeys(value.metrics, [
		"foregroundContrast", "foregroundSurfaceContrast", "accentContrast", "accentSurfaceContrast",
		"minimumRoleDistance", "meanSourceDistance", "meanReconstructionError",
	], `${label} metrics`)
	for (const role of ["background", "foreground", "surface", "accent"] as const) {
		const color = value.roles[role]
		if (!isRecord(color) || !isRgb(color.rgb) || typeof color.hex !== "string" || !/^#[a-f0-9]{6}$/.test(color.hex) ||
			typeof color.nearestName !== "string" || color.nearestName.length === 0 || typeof color.generated !== "boolean" ||
			typeof color.sourceDistance !== "number" || !Number.isFinite(color.sourceDistance) || color.sourceDistance < 0) {
			throw new Error(`${label} ${role} is invalid`)
		}
		exactKeys(color, ["rgb", "hex", "nearestName", "generated", "sourceDistance"], `${label} ${role}`)
		const expectedHex = `#${color.rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
		if (color.hex !== expectedHex) throw new Error(`${label} ${role} RGB and hex differ`)
	}
	for (const metric of [
		"foregroundContrast", "foregroundSurfaceContrast", "accentContrast", "accentSurfaceContrast",
		"minimumRoleDistance", "meanSourceDistance", "meanReconstructionError",
	] as const) {
		if (typeof value.metrics[metric] !== "number" || !Number.isFinite(value.metrics[metric])) {
			throw new Error(`${label} metric ${metric} is invalid`)
		}
	}
	return value as unknown as NextPalettePresentedPalette
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first.every((channel, index) => channel === second[index])
}

function samePresentedRole(
	first: NextPalettePresentedPalette["roles"][RoleName],
	second: NextPalettePresentedPalette["roles"][RoleName],
): boolean {
	return JSON.stringify(first) === JSON.stringify(second)
}

function assertSingleFactor(entry: ControlledFieldStateReviewEntry, index: number): void {
	const first = entry.options.A
	const second = entry.options.B
	if (!samePresentedRole(first.roles.foreground, second.roles.foreground) ||
		!samePresentedRole(first.roles.accent, second.roles.accent)) {
		throw new Error(`Controlled field-state entry ${index} changes a retained role`)
	}
	for (const palette of [first, second]) for (const role of ["background", "surface"] as const) {
		if (palette.roles[role].generated || palette.roles[role].sourceDistance !== 0) {
			throw new Error(`Controlled field-state entry ${index} uses a generated field endpoint`)
		}
	}
	const changes = exactPresentedRoleChanges(first, second)
	switch (entry.task) {
		case "ordered-pair":
			if (first.gradient.isGradient || second.gradient.isGradient || changes.join(",") !== "background,surface" ||
				sameRgb(first.roles.background.rgb, first.roles.surface.rgb) ||
				sameRgb(second.roles.background.rgb, second.roles.surface.rgb)) {
				throw new Error(`Controlled field-state entry ${index} is not an isolated ordered-pair comparison`)
			}
			break
		case "multiplicity": {
			const collapsed = entry.assignment.A === "collapsed" ? first : second
			const twoField = entry.assignment.A === "two-field" ? first : second
			if (first.gradient.isGradient || second.gradient.isGradient || changes.join(",") !== "surface" ||
				!samePresentedRole(first.roles.background, second.roles.background) ||
				!sameRgb(collapsed.roles.background.rgb, collapsed.roles.surface.rgb) ||
				sameRgb(twoField.roles.background.rgb, twoField.roles.surface.rgb)) {
				throw new Error(`Controlled field-state entry ${index} is not an isolated multiplicity comparison`)
			}
			break
		}
		case "gradient-diagnostic":
			if (changes.length !== 0 || first.gradient.isGradient === second.gradient.isGradient ||
				(["background", "foreground", "surface", "accent"] as const)
					.some((role) => !samePresentedRole(first.roles[role], second.roles[role]))) {
				throw new Error(`Controlled field-state entry ${index} is not an isolated gradient comparison`)
			}
			break
	}
}

function expectedTreatments(task: ControlledFieldStateTask): readonly ControlledFieldStateTreatment[] {
	switch (task) {
		case "ordered-pair": return ["pair-primary", "pair-challenger"]
		case "multiplicity": return ["collapsed", "two-field"]
		case "gradient-diagnostic": return ["flat", "gradient"]
	}
}

export function controlledFieldStateManifestId(
	manifest: Omit<ControlledFieldStateReviewManifest, "generatedAt" | "manifestId">,
): string {
	return createHash("sha256").update(JSON.stringify(manifest)).digest("hex")
}

export function parseControlledFieldStateManifest(value: unknown): ControlledFieldStateReviewManifest {
	if (!isRecord(value)) throw new Error("Controlled field-state manifest must be an object")
	exactKeys(value, [
		"schemaVersion", "reviewVersion", "presentationVersion", "generatedAt", "manifestId", "experimentId",
		"batch", "provenance", "entries",
	], "Controlled field-state manifest")
	if (value.schemaVersion !== 1 || value.reviewVersion !== CONTROLLED_FIELD_STATE_REVIEW_VERSION ||
		value.presentationVersion !== CONTROLLED_FIELD_STATE_PRESENTATION_VERSION || !validTimestamp(value.generatedAt) ||
		!isSha256(value.manifestId) || !isSha256(value.experimentId) || !isRecord(value.batch) ||
		!isRecord(value.provenance) || !Array.isArray(value.entries) || value.entries.length < 1 || value.entries.length > 40) {
		throw new Error("Controlled field-state manifest header is invalid")
	}
	exactKeys(value.batch, ["index", "size", "totalBatches", "totalCases"], "Controlled field-state batch")
	if (!Number.isInteger(value.batch.index) || (value.batch.index as number) < 1 ||
		value.batch.size !== value.entries.length || !Number.isInteger(value.batch.totalBatches) ||
		(value.batch.totalBatches as number) < 1 || !Number.isInteger(value.batch.totalCases) ||
		(value.batch.totalCases as number) < value.entries.length) throw new Error("Controlled field-state batch is invalid")
	exactKeys(value.provenance, ["experiment", "implementation", "presentation"], "Controlled field-state provenance")
	for (const [label, record] of Object.entries(value.provenance)) {
		if (!isRecord(record) || Object.keys(record).length === 0 || Object.values(record).some((hash) => !isSha256(hash))) {
			throw new Error(`${label} provenance is invalid`)
		}
	}
	const caseIds = new Set<string>()
	const orders = new Set<number>()
	const sourceTasks = new Map<string, Set<ControlledFieldStateTask>>()
	const sourceIdentities = new Map<string, string>()
	for (const [index, candidate] of value.entries.entries()) {
		if (!isRecord(candidate) || typeof candidate.caseId !== "string" || !/^cfsr-[a-f0-9]{20}$/.test(candidate.caseId) ||
			caseIds.has(candidate.caseId) || !Number.isInteger(candidate.order) || orders.has(candidate.order as number) ||
			typeof candidate.task !== "string" || !controlledFieldStateTasks.includes(candidate.task as ControlledFieldStateTask) ||
			!isRecord(candidate.source) || typeof candidate.source.file !== "string" || !/^images\/[^/\\]+$/.test(candidate.source.file) ||
			!isSha256(candidate.source.sha256) || !Number.isInteger(candidate.source.bytes) || (candidate.source.bytes as number) <= 0 ||
			!Number.isInteger(candidate.source.width) || (candidate.source.width as number) <= 0 ||
			!Number.isInteger(candidate.source.height) || (candidate.source.height as number) <= 0 ||
			!isRecord(candidate.options) || !isRecord(candidate.assignment)) {
			throw new Error(`Controlled field-state entry ${index} is invalid`)
		}
		exactKeys(candidate, ["caseId", "order", "task", "source", "options", "assignment"], `Entry ${index}`)
		exactKeys(candidate.source, ["file", "sha256", "bytes", "width", "height"], `Entry ${index} source`)
		exactKeys(candidate.options, ["A", "B"], `Entry ${index} options`)
		exactKeys(candidate.assignment, ["A", "B"], `Entry ${index} assignment`)
		parsePalette(candidate.options.A, `Entry ${index} option A`)
		parsePalette(candidate.options.B, `Entry ${index} option B`)
		const expected = expectedTreatments(candidate.task as ControlledFieldStateTask)
		const assigned = [candidate.assignment.A, candidate.assignment.B]
		if (assigned.length !== 2 || assigned[0] === assigned[1] || assigned.some((item) => !expected.includes(item as never))) {
			throw new Error(`Controlled field-state entry ${index} assignment is invalid`)
		}
		const entry = candidate as unknown as ControlledFieldStateReviewEntry
		assertSingleFactor(entry, index)
		const taskSet = sourceTasks.get(entry.source.sha256) ?? new Set<ControlledFieldStateTask>()
		if (taskSet.has(entry.task)) throw new Error(`Controlled field-state source repeats task ${entry.task}`)
		taskSet.add(entry.task)
		sourceTasks.set(entry.source.sha256, taskSet)
		const identity = JSON.stringify(entry.source)
		if (sourceIdentities.has(entry.source.sha256) && sourceIdentities.get(entry.source.sha256) !== identity) {
			throw new Error("Controlled field-state source identity is inconsistent")
		}
		sourceIdentities.set(entry.source.sha256, identity)
		caseIds.add(candidate.caseId)
		orders.add(candidate.order as number)
	}
	if ([...sourceTasks.values()].some((tasks) => controlledFieldStateTasks.some((task) => !tasks.has(task)))) {
		throw new Error("Controlled field-state source does not contain every task")
	}
	const manifest = value as unknown as ControlledFieldStateReviewManifest
	const { generatedAt: _generatedAt, manifestId, ...identity } = manifest
	if (controlledFieldStateManifestId(identity) !== manifestId) throw new Error("Controlled field-state manifest identity is stale")
	return manifest
}

function parseReasons(value: unknown, label: string): ControlledFieldStateReason[] {
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string" ||
		!controlledFieldStateReasons.includes(item as ControlledFieldStateReason)) || new Set(value).size !== value.length) {
		throw new Error(`${label} is invalid`)
	}
	return value as ControlledFieldStateReason[]
}

export function parseControlledFieldStateFeedbackEntry(
	value: unknown,
	manifest: ControlledFieldStateReviewManifest,
	stored: boolean,
): ControlledFieldStateFeedbackEntry {
	if (!isRecord(value)) throw new Error("Controlled field-state feedback entry is invalid")
	exactKeys(value, stored
		? ["caseId", "sourceSha256", "sourceEligibility", "preference", "reasonsA", "reasonsB", "note", "submittedAt"]
		: ["caseId", "sourceSha256", "sourceEligibility", "preference", "reasonsA", "reasonsB", "note"],
	"Controlled field-state feedback entry")
	const entry = manifest.entries.find((candidate) => candidate.caseId === value.caseId)
	if (!entry || value.sourceSha256 !== entry.source.sha256 || typeof value.sourceEligibility !== "string" ||
		!controlledFieldStateEligibility.includes(value.sourceEligibility as ControlledFieldStateEligibility) ||
		typeof value.note !== "string" || value.note.length > 2000) {
		throw new Error("Controlled field-state feedback entry is invalid or stale")
	}
	const reasonsA = parseReasons(value.reasonsA, "Option A reasons")
	const reasonsB = parseReasons(value.reasonsB, "Option B reasons")
	const eligible = value.sourceEligibility === "eligible-artwork"
	let preference: ControlledFieldStatePreference | null = null
	if (eligible) {
		if (typeof value.preference !== "string" ||
			!controlledFieldStatePreferences.includes(value.preference as ControlledFieldStatePreference)) {
			throw new Error("Eligible artwork requires one structured comparison")
		}
		preference = value.preference as ControlledFieldStatePreference
	} else if (value.preference !== null || reasonsA.length > 0 || reasonsB.length > 0) {
		throw new Error("Ineligible sources cannot have field-state judgments")
	}
	if (stored && !validTimestamp(value.submittedAt)) throw new Error("Stored controlled feedback timestamp is invalid")
	return {
		caseId: entry.caseId,
		sourceSha256: entry.source.sha256,
		sourceEligibility: value.sourceEligibility as ControlledFieldStateEligibility,
		preference,
		reasonsA,
		reasonsB,
		note: value.note.trim(),
		submittedAt: stored ? value.submittedAt as string : new Date().toISOString(),
	}
}

export function parseControlledFieldStateFeedbackStore(
	value: unknown,
	manifest: ControlledFieldStateReviewManifest,
): ControlledFieldStateFeedbackStore {
	if (!isRecord(value) || value.schemaVersion !== 1 || value.reviewVersion !== CONTROLLED_FIELD_STATE_REVIEW_VERSION ||
		value.manifestId !== manifest.manifestId || !Array.isArray(value.entries)) {
		throw new Error("Controlled field-state feedback store is stale or invalid")
	}
	exactKeys(value, ["schemaVersion", "reviewVersion", "manifestId", "entries"], "Controlled field-state feedback store")
	const entries = value.entries.map((entry) => parseControlledFieldStateFeedbackEntry(entry, manifest, true))
	if (new Set(entries.map((entry) => entry.caseId)).size !== entries.length) {
		throw new Error("Controlled field-state feedback contains duplicate cases")
	}
	return { schemaVersion: 1, reviewVersion: CONTROLLED_FIELD_STATE_REVIEW_VERSION, manifestId: manifest.manifestId, entries }
}

export function exactPresentedRoleChanges(
	first: NextPalettePresentedPalette,
	second: NextPalettePresentedPalette,
): RoleName[] {
	return (["background", "foreground", "surface", "accent"] as const).filter((role) =>
		first.roles[role].generated !== second.roles[role].generated ||
		first.roles[role].rgb.some((channel, index) => channel !== second.roles[role].rgb[index]))
}
