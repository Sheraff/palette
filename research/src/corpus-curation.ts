import { selectionTracks, type SelectionCandidate, type SelectionManifest, type SelectionTrack } from "./corpus-selection.ts"

export type EligibilityDecision = "include" | "veto"

export type CurationEntry = {
	image: string
	decision: EligibilityDecision
	reasons: string[]
	note: string
	decidedAt: string
}

export type CurationStore = {
	schemaVersion: 3
	manifestId: string
	semanticResultsSha256: string
	frozenAt: string | null
	entries: CurationEntry[]
}

export type CurationProgress = {
	target: number
	accepted: number
	vetoed: number
	screened: number
	complete: boolean
	tracks: Record<SelectionTrack, { quota: number; accepted: number; vetoed: number }>
}

export const curationReasonValues = [
	"not-artwork",
	"unusable-quality",
	"out-of-distribution",
	"corrupt-or-incomplete",
	"duplicate",
	"other",
] as const

const curationReasons = new Set<string>(curationReasonValues)

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function selectionCandidateMap(manifest: SelectionManifest): Map<string, SelectionCandidate> {
	const candidates = new Map<string, SelectionCandidate>()
	for (const candidate of selectionTracks.flatMap((track) => manifest.tracks[track])) {
		if (candidates.has(candidate.file)) throw new Error(`Duplicate selection candidate ${candidate.file}`)
		candidates.set(candidate.file, candidate)
	}
	return candidates
}

export function validateCurationStore(manifest: SelectionManifest, value: unknown): asserts value is CurationStore {
	if (!isRecord(value) || value.schemaVersion !== 3 || value.manifestId !== manifest.manifestId ||
		value.semanticResultsSha256 !== manifest.semanticResultsSha256 || !Array.isArray(value.entries)) {
		throw new Error("Curation store does not match the current selection manifest")
	}
	if (value.frozenAt !== null && (typeof value.frozenAt !== "string" || !Number.isFinite(Date.parse(value.frozenAt)) ||
		new Date(value.frozenAt).toISOString() !== value.frozenAt)) throw new Error("Invalid curation freeze timestamp")
	const candidates = selectionCandidateMap(manifest)
	const seen = new Set<string>()
	const accepted = Object.fromEntries(selectionTracks.map((track) => [track, 0])) as Record<SelectionTrack, number>
	for (const entryValue of value.entries) {
		if (!isRecord(entryValue)) throw new Error("Invalid curation entry")
		const entry = entryValue as Record<string, unknown>
		if (typeof entry.image !== "string" || !candidates.has(entry.image)) throw new Error("Unknown curation image")
		if (seen.has(entry.image)) throw new Error(`Duplicate curation decision for ${entry.image}`)
		if (entry.decision !== "include" && entry.decision !== "veto") throw new Error("Invalid curation decision")
		if (!Array.isArray(entry.reasons) || entry.reasons.some((reason) => typeof reason !== "string" || !curationReasons.has(reason)) ||
			new Set(entry.reasons).size !== entry.reasons.length) throw new Error("Invalid curation reasons")
		if (entry.decision === "include" && entry.reasons.length !== 0) throw new Error("Included sources cannot have veto reasons")
		if (entry.decision === "veto" && entry.reasons.length === 0) throw new Error("A veto requires at least one reason")
		if (typeof entry.note !== "string" || entry.note.length > 500) throw new Error("Invalid curation note")
		if (entry.reasons.includes("other") && entry.note.trim().length === 0) throw new Error("The other reason requires a note")
		if (typeof entry.decidedAt !== "string" || !Number.isFinite(Date.parse(entry.decidedAt)) ||
			new Date(entry.decidedAt).toISOString() !== entry.decidedAt) throw new Error("Invalid curation timestamp")
		seen.add(entry.image)
		if (entry.decision === "include") accepted[candidates.get(entry.image)!.track]++
	}
	for (const track of selectionTracks) {
		if (accepted[track] > manifest.quotas[track]) throw new Error(`Curation track ${track} exceeds its quota`)
	}
	const acceptedCount = selectionTracks.reduce((sum, track) => sum + accepted[track], 0)
	const complete = acceptedCount === manifest.targetSize && selectionTracks.every((track) => accepted[track] === manifest.quotas[track])
	if (value.frozenAt !== null && !complete) throw new Error("Curation can only be frozen when complete")
}

export function curationProgress(manifest: SelectionManifest, store: CurationStore): CurationProgress {
	validateCurationStore(manifest, store)
	const candidates = selectionCandidateMap(manifest)
	const tracks = Object.fromEntries(selectionTracks.map((track) => {
		const entries = store.entries.filter((entry) => candidates.get(entry.image)!.track === track)
		return [track, {
			quota: manifest.quotas[track],
			accepted: entries.filter((entry) => entry.decision === "include").length,
			vetoed: entries.filter((entry) => entry.decision === "veto").length,
		}]
	})) as CurationProgress["tracks"]
	const accepted = selectionTracks.reduce((sum, track) => sum + tracks[track].accepted, 0)
	const vetoed = selectionTracks.reduce((sum, track) => sum + tracks[track].vetoed, 0)
	return {
		target: manifest.targetSize,
		accepted,
		vetoed,
		screened: accepted + vetoed,
		complete: accepted === manifest.targetSize && selectionTracks.every((track) => tracks[track].accepted === tracks[track].quota),
		tracks,
	}
}

export function acceptedCandidates(manifest: SelectionManifest, store: CurationStore): SelectionCandidate[] {
	validateCurationStore(manifest, store)
	const decisions = new Map(store.entries.map((entry) => [entry.image, entry]))
	return selectionTracks.flatMap((track) => manifest.tracks[track]
		.filter((candidate) => decisions.get(candidate.file)?.decision === "include"))
}

export function pendingCandidates(manifest: SelectionManifest, store: CurationStore): SelectionCandidate[] {
	validateCurationStore(manifest, store)
	const decisions = new Set(store.entries.map((entry) => entry.image))
	const progress = curationProgress(manifest, store)
	return selectionTracks.flatMap((track) => progress.tracks[track].accepted >= manifest.quotas[track]
		? []
		: manifest.tracks[track].filter((candidate) => !decisions.has(candidate.file)))
}

export function curationExhausted(manifest: SelectionManifest, store: CurationStore): boolean {
	const progress = curationProgress(manifest, store)
	const decisions = new Set(store.entries.map((entry) => entry.image))
	return !progress.complete && selectionTracks.some((track) =>
		progress.tracks[track].accepted < manifest.quotas[track] && manifest.tracks[track].every((candidate) => decisions.has(candidate.file)))
}
