import { createHash } from "node:crypto"
import { contrastRatio, rgbToOKLab } from "./color.ts"
import type { CorpusResult } from "./types.ts"

export type SelectionTrack = "diversity" | "risk" | "random"

export type SelectionCandidate = {
	file: string
	sha256: string
	width: number
	height: number
	track: SelectionTrack
	rank: number
}

export type SelectionManifest = {
	schemaVersion: 3
	generatedAt: string
	selectorStrategyVersion: string
	manifestId: string
	algorithmVersion: string
	sourceResultsSha256: string
	semanticResultsSha256: string
	sourceCount: number
	targetSize: number
	quotas: Record<SelectionTrack, number>
	tracks: Record<SelectionTrack, SelectionCandidate[]>
}

export const selectorStrategyVersion = "balanced-diversity-risk-random-v1"
export const frozenReviewedCorpusStrategyVersion = "frozen-reviewed-corpus-v1"
export const selectionTracks: SelectionTrack[] = ["diversity", "risk", "random"]
export const selectionQuotas: Record<SelectionTrack, number> = {
	diversity: 50,
	risk: 30,
	random: 20,
}

type Entry = CorpusResult["entries"][number]
const sha256Pattern = /^[a-f0-9]{64}$/

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function selectionManifestId(manifest: Pick<SelectionManifest,
	"selectorStrategyVersion" | "algorithmVersion" | "semanticResultsSha256" | "quotas" | "tracks"
>): string {
	const identity = [
		manifest.selectorStrategyVersion,
		manifest.algorithmVersion,
		manifest.semanticResultsSha256,
		selectionTracks.map((track) => [
			track,
			manifest.quotas[track],
			manifest.tracks[track].map((candidate) => [candidate.file, candidate.sha256]),
		]),
	]
	return createHash("sha256").update(JSON.stringify(identity)).digest("hex")
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue)
	if (!isRecord(value)) return value
	return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]))
}

export function computeSemanticResultsSha256(corpus: CorpusResult): string {
	const semantic = {
		algorithmVersion: corpus.algorithmVersion,
		entries: corpus.entries.map((entry) => ({
			...entry,
			extraction: {
				...entry.extraction,
				diagnostics: {
					regionCount: entry.extraction.diagnostics.regionCount,
					candidateCount: entry.extraction.diagnostics.candidateCount,
				},
			},
		})),
	}
	return createHash("sha256").update(JSON.stringify(canonicalValue(semantic))).digest("hex")
}

function stableHash(value: string): number {
	let hash = 2166136261
	for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
	return hash >>> 0
}

function riskScore(entry: Entry): number {
	const palette = entry.extraction.methods.spatial
	const candidateCount = entry.extraction.candidates.length
	const distinctSurface = palette.background.hex !== palette.surface.hex
	const roleCrowding = distinctSurface && palette.metrics.minimumRoleDistance < 0.05 ? 1 : 0
	const gradientUncertainty = 1 - Math.min(1, Math.abs(palette.gradient.confidence - 0.5) * 2)
	return (palette.foreground.generated ? 4 : 0) +
		(palette.metrics.foregroundContrast < 4.5 ? 1.5 : 0) +
		(palette.metrics.foregroundSurfaceContrast < 4.5 ? 1.25 : 0) +
		Math.max(0, 1.5 - palette.metrics.accentContrast) * 1.5 +
		palette.metrics.meanReconstructionError * 8 +
		palette.metrics.meanSourceDistance * 16 +
		gradientUncertainty * 0.4 +
		roleCrowding * 0.5 +
		Math.max(0, 8 - candidateCount) * 0.15
}

function featureVector(entry: Entry): number[] {
	const palette = entry.extraction.methods.spatial
	const roles = [palette.background, palette.foreground, palette.surface, palette.accent]
	const candidates = entry.extraction.candidates
	const totalPopulation = candidates.reduce((sum, candidate) => sum + candidate.population, 0) || 1
	const weighted = (value: (candidate: Entry["extraction"]["candidates"][number]) => number): number =>
		candidates.reduce((sum, candidate) => sum + candidate.population * value(candidate), 0) / totalPopulation
	const candidateLightness = candidates.map((candidate) => rgbToOKLab(candidate.rgb)[0])
	const meanLightness = weighted((candidate) => rgbToOKLab(candidate.rgb)[0])
	const lightnessSpread = Math.sqrt(weighted((candidate) => (rgbToOKLab(candidate.rgb)[0] - meanLightness) ** 2))
	return [
		...roles.flatMap((role) => rgbToOKLab(role.rgb)),
		meanLightness,
		lightnessSpread,
		weighted((candidate) => candidate.chroma),
		Math.max(...candidates.map((candidate) => candidate.chroma), 0),
		Math.max(...candidates.map((candidate) => candidate.population), 0),
		weighted((candidate) => candidate.background),
		weighted((candidate) => candidate.saliency),
		weighted((candidate) => candidate.text),
		candidates.length / 13,
		Math.min(palette.metrics.foregroundContrast, 12) / 12,
		Math.min(palette.metrics.foregroundSurfaceContrast, 12) / 12,
		Math.min(palette.metrics.accentContrast, 6) / 6,
		palette.metrics.meanReconstructionError / 0.2,
		palette.metrics.meanSourceDistance / 0.08,
		palette.gradient.isGradient ? 1 : 0,
		palette.gradient.coverage,
		palette.gradient.continuity,
		palette.gradient.coherence,
		palette.foreground.generated ? 1 : 0,
		palette.background.hex === palette.surface.hex ? 1 : 0,
		Math.min(entry.width, entry.height) / Math.max(entry.width, entry.height),
		Math.min(...candidateLightness, 1),
		Math.max(...candidateLightness, 0),
	]
}

function standardizedFeatures(entries: Entry[]): Map<string, number[]> {
	const raw = entries.map((entry) => featureVector(entry))
	const dimensions = raw[0]?.length || 0
	const means = Array.from({ length: dimensions }, (_, dimension) =>
		raw.reduce((sum, vector) => sum + vector[dimension], 0) / Math.max(raw.length, 1))
	const deviations = means.map((mean, dimension) => Math.sqrt(
		raw.reduce((sum, vector) => sum + (vector[dimension] - mean) ** 2, 0) / Math.max(raw.length, 1),
	) || 1)
	return new Map(entries.map((entry, index) => [
		entry.file,
		raw[index].map((value, dimension) => (value - means[dimension]) / deviations[dimension]),
	]))
}

function squaredDistance(first: number[], second: number[]): number {
	return first.reduce((sum, value, index) => sum + (value - second[index]) ** 2, 0)
}

function farthestFirst(entries: Entry[]): Entry[] {
	if (entries.length <= 1) return [...entries]
	const features = standardizedFeatures(entries)
	const remaining = new Map(entries.map((entry) => [entry.file, entry]))
	const first = [...entries].sort((a, b) => stableHash(`diversity:${a.file}`) - stableHash(`diversity:${b.file}`) ||
		a.file.localeCompare(b.file))[0]
	const ordered = [first]
	remaining.delete(first.file)
	const nearest = new Map<string, number>()
	while (remaining.size > 0) {
		const last = ordered.at(-1)!
		for (const entry of remaining.values()) {
			const distance = squaredDistance(features.get(entry.file)!, features.get(last.file)!)
			nearest.set(entry.file, Math.min(nearest.get(entry.file) ?? Infinity, distance))
		}
		const next = [...remaining.values()].sort((a, b) =>
			(nearest.get(b.file) || 0) - (nearest.get(a.file) || 0) || a.file.localeCompare(b.file))[0]
		ordered.push(next)
		remaining.delete(next.file)
	}
	return ordered
}

export function buildTrackQueues(corpus: CorpusResult): Record<SelectionTrack, Entry[]> {
	const entries = corpus.entries.filter((entry) => entry.kind === "holdout")
	if (new Set(entries.map((entry) => entry.file)).size !== entries.length) throw new Error("Holdout source files must be unique")
	const random = [...entries]
		.sort((a, b) => stableHash(`random:${a.file}`) - stableHash(`random:${b.file}`) || a.file.localeCompare(b.file))
		.slice(0, Math.min(60, entries.length))
	const randomFiles = new Set(random.map((entry) => entry.file))
	const risk = entries.filter((entry) => !randomFiles.has(entry.file))
		.sort((a, b) => riskScore(b) - riskScore(a) || a.file.localeCompare(b.file))
		.slice(0, Math.min(90, entries.length - random.length))
	const assigned = new Set([...random, ...risk].map((entry) => entry.file))
	const diversity = farthestFirst(entries.filter((entry) => !assigned.has(entry.file)))
	const tracks = { diversity, risk, random }
	for (const track of selectionTracks) {
		const minimum = selectionQuotas[track] * 2
		if (tracks[track].length < minimum) {
			throw new Error(`${track} has ${tracks[track].length} candidates; at least ${minimum} are required for reserves`)
		}
	}
	return tracks
}

export function buildSelectionManifest(
	corpus: CorpusResult,
	hashes: ReadonlyMap<string, string>,
	sourceResultsSha256: string,
	generatedAt = new Date().toISOString(),
): SelectionManifest {
	if (!sha256Pattern.test(sourceResultsSha256)) throw new Error("Invalid holdout-results source SHA-256")
	for (const entry of corpus.entries.filter((item) => item.kind === "holdout")) {
		const hash = hashes.get(entry.file)
		if (!hash) throw new Error(`Missing source SHA-256 for ${entry.file}`)
		if (!sha256Pattern.test(hash)) throw new Error(`Invalid source SHA-256 for ${entry.file}`)
	}
	const tracks = buildTrackQueues(corpus)
	const manifest: SelectionManifest = {
		schemaVersion: 3,
		generatedAt,
		selectorStrategyVersion,
		manifestId: "",
		algorithmVersion: corpus.algorithmVersion,
		sourceResultsSha256,
		semanticResultsSha256: computeSemanticResultsSha256(corpus),
		sourceCount: corpus.entries.filter((entry) => entry.kind === "holdout").length,
		targetSize: Object.values(selectionQuotas).reduce((sum, quota) => sum + quota, 0),
		quotas: { ...selectionQuotas },
		tracks: Object.fromEntries(selectionTracks.map((track) => [
			track,
			tracks[track].map((entry, rank) => ({
				file: entry.file,
				sha256: hashes.get(entry.file)!,
				width: entry.width,
				height: entry.height,
				track,
				rank,
			})),
		])) as Record<SelectionTrack, SelectionCandidate[]>,
	}
	manifest.manifestId = selectionManifestId(manifest)
	return manifest
}

export function migrateFrozenSelectionManifest(
	baseline: SelectionManifest,
	corpus: CorpusResult,
	hashes: ReadonlyMap<string, string>,
	sourceResultsSha256: string,
	generatedAt = new Date().toISOString(),
): SelectionManifest {
	if (!sha256Pattern.test(baseline.manifestId)) throw new Error("Baseline selection manifest ID is invalid")
	if (!sha256Pattern.test(sourceResultsSha256)) throw new Error("Invalid holdout-results source SHA-256")
	if (selectionTracks.some((track) => baseline.quotas[track] !== selectionQuotas[track])) {
		throw new Error("Baseline selection quotas do not match the frozen corpus strategy")
	}
	const entries = new Map(corpus.entries.filter((entry) => entry.kind === "holdout").map((entry) => [entry.file, entry]))
	const baselineCandidates = selectionTracks.flatMap((track) => baseline.tracks[track])
	if (entries.size !== baselineCandidates.length || baselineCandidates.some((candidate) => !entries.has(candidate.file))) {
		throw new Error("Frozen selection does not exactly cover the promoted holdout corpus")
	}
	const tracks = Object.fromEntries(selectionTracks.map((track) => [
		track,
		baseline.tracks[track].map((candidate, rank) => {
			const entry = entries.get(candidate.file)!
			const digest = hashes.get(candidate.file)
			if (!digest || !sha256Pattern.test(digest)) throw new Error(`Invalid source SHA-256 for ${candidate.file}`)
			if (entry.width !== candidate.width || entry.height !== candidate.height) {
				throw new Error(`Frozen selection dimensions changed for ${candidate.file}`)
			}
			return { ...candidate, sha256: digest, track, rank }
		}),
	])) as Record<SelectionTrack, SelectionCandidate[]>
	const manifest: SelectionManifest = {
		schemaVersion: 3,
		generatedAt,
		selectorStrategyVersion: `${frozenReviewedCorpusStrategyVersion}:${baseline.manifestId}`,
		manifestId: "",
		algorithmVersion: corpus.algorithmVersion,
		sourceResultsSha256,
		semanticResultsSha256: computeSemanticResultsSha256(corpus),
		sourceCount: entries.size,
		targetSize: Object.values(selectionQuotas).reduce((sum, quota) => sum + quota, 0),
		quotas: { ...selectionQuotas },
		tracks,
	}
	manifest.manifestId = selectionManifestId(manifest)
	return manifest
}

export function validateSelectionManifest(
	value: unknown,
	corpus: CorpusResult,
	sourceResultsSha256: string,
): asserts value is SelectionManifest {
	if (!isRecord(value)) throw new Error("Selection manifest must be an object")
	if (value.schemaVersion !== 3) throw new Error("Unsupported selection manifest schema")
	const frozenStrategyPattern = new RegExp(`^${frozenReviewedCorpusStrategyVersion}:([a-f0-9]{64})$`)
	const frozenStrategy = typeof value.selectorStrategyVersion === "string"
		? frozenStrategyPattern.exec(value.selectorStrategyVersion)
		: null
	if (value.selectorStrategyVersion !== selectorStrategyVersion && !frozenStrategy) {
		throw new Error("Selection strategy version does not match")
	}
	if (typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt))) {
		throw new Error("Selection generatedAt is invalid")
	}
	if (typeof value.manifestId !== "string" || !sha256Pattern.test(value.manifestId)) throw new Error("Selection manifest ID is invalid")
	if (value.algorithmVersion !== corpus.algorithmVersion) throw new Error("Selection algorithm version does not match holdout results")
	if (value.sourceResultsSha256 !== sourceResultsSha256) throw new Error("Selection source-results SHA-256 does not match")
	if (value.semanticResultsSha256 !== computeSemanticResultsSha256(corpus)) {
		throw new Error("Selection semantic results SHA-256 does not match")
	}
	if (!isRecord(value.quotas) || Object.keys(value.quotas).sort().join(",") !== [...selectionTracks].sort().join(",")) {
		throw new Error("Selection quotas are invalid")
	}
	for (const track of selectionTracks) {
		if (value.quotas[track] !== selectionQuotas[track]) throw new Error(`Selection quota for ${track} does not match`)
	}
	const targetSize = Object.values(selectionQuotas).reduce((sum, quota) => sum + quota, 0)
	if (value.targetSize !== targetSize) throw new Error("Selection target size does not match its quotas")

	const entries = corpus.entries.filter((entry) => entry.kind === "holdout")
	const entryMap = new Map<string, Entry>()
	for (const entry of entries) {
		if (entryMap.has(entry.file)) throw new Error(`Duplicate holdout result for ${entry.file}`)
		if (!(entry as Entry & { extraction?: unknown }).extraction) throw new Error(`Holdout extraction is missing for ${entry.file}`)
		entryMap.set(entry.file, entry)
	}
	if (value.sourceCount !== entries.length) throw new Error("Selection source count does not match holdout results")
	if (!isRecord(value.tracks) || Object.keys(value.tracks).sort().join(",") !== [...selectionTracks].sort().join(",")) {
		throw new Error("Selection tracks are invalid")
	}
	const expectedTracks = value.selectorStrategyVersion === selectorStrategyVersion ? buildTrackQueues(corpus) : null
	const seen = new Set<string>()
	for (const track of selectionTracks) {
		const queue = value.tracks[track]
		if (!Array.isArray(queue) || (expectedTracks && queue.length !== expectedTracks[track].length) ||
			queue.length < selectionQuotas[track] * 2) {
			throw new Error(`Selection track ${track} does not have sufficient reserves`)
		}
		for (const [rank, candidateValue] of queue.entries()) {
			if (!isRecord(candidateValue)) throw new Error(`Selection candidate ${track}:${rank} is invalid`)
			const candidate = candidateValue as Record<string, unknown>
			if (typeof candidate.file !== "string" || seen.has(candidate.file)) throw new Error("Selection candidate files must be unique")
			if (expectedTracks && candidate.file !== expectedTracks[track][rank]?.file) {
				throw new Error(`Selection queue does not match the ${selectorStrategyVersion} strategy`)
			}
			const source = entryMap.get(candidate.file)
			if (!source) throw new Error(`Unknown selection candidate ${candidate.file}`)
			if (candidate.track !== track || candidate.rank !== rank) throw new Error(`Selection track or rank is invalid for ${candidate.file}`)
			if (candidate.width !== source.width || candidate.height !== source.height) {
				throw new Error(`Selection dimensions do not match holdout results for ${candidate.file}`)
			}
			if (typeof candidate.sha256 !== "string" || !sha256Pattern.test(candidate.sha256)) {
				throw new Error(`Selection source SHA-256 is invalid for ${candidate.file}`)
			}
			seen.add(candidate.file)
		}
	}
	if (seen.size !== entryMap.size || [...entryMap.keys()].some((file) => !seen.has(file))) {
		throw new Error("Selection candidates do not exactly cover holdout results")
	}
	const manifest = value as SelectionManifest
	if (manifest.manifestId !== selectionManifestId(manifest)) throw new Error("Selection manifest ID does not match its contents")
}
