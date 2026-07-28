import { lstat, readdir, readFile } from "node:fs/promises"
import { basename, dirname, join, relative, resolve, sep } from "node:path"
import { canonicalJson, isObject, jsonPointer, normalizeTreatment, sha256 } from "./normalize.ts"
import type {
	ArtifactInventoryRecord,
	ArtifactKind,
	CandidateTreatment,
	JsonObject,
	NormalizedCase,
	NormalizedFeedback,
	NormalizedManifest,
	NormalizedOption,
} from "./types.ts"

const sourceInventoryNames = new Set([
	"album-artwork-palette-v2-development-panel.json",
	"album-artwork-palette-v2-fresh-sample.sealed.json",
	"album-artwork-palette-v2-future-sample-02.sealed.json",
	"album-artwork-palette-v2-future-sample-03.sealed.json",
	"source-provenance-inventory-00-14.json",
])
export const fastSampleExclusionPath = "research/data/album-artwork-palette-v2-phase-4-fast-sample.sealed.json"

type LoadedArtifact = ArtifactInventoryRecord & { value: JsonObject }

function projectPath(projectRoot: string, absolutePath: string): string {
	return relative(projectRoot, absolutePath).split(sep).join("/")
}

function isAlbumExperimentPath(path: string): boolean {
	return path.includes("/research/data/experiments/album-artwork-palette-v2-") ||
		path.startsWith("research/data/experiments/album-artwork-palette-v2-")
}

function isMajorManifestPath(path: string): boolean {
	const name = basename(path)
	if (isAlbumExperimentPath(path) && /review-manifest(?:\.private)?\.json$/.test(name)) return true
	if (/\/experiments\/(?:chromatic-role-|chromatic-role-reserve-validation-)/.test(path) &&
		/(?:review-)?manifest\.json$/.test(name)) return true
	if (/\/experiments\/(?:next-palette-|joint-palette-)/.test(path) && /batch-\d+-manifest\.json$/.test(name)) return true
	if (/\/experiments\/native-complete-palette-/.test(path) && /\/review-v1\/manifest\.json$/.test(path)) return true
	if (/\/experiments\/palette-role-/.test(path) && name === "manifest.json") return true
	if (/\/experiments\/region-graph-0\.19\.0-(?:native-resolution|scale-aware-native|native-role-observation-gradient)-/.test(path) &&
		name === "review-manifest.json") return true
	if (/\/experiments\/gradient-field-topology-3\.0\.0-(?:07-validation|music-repeat-review)\/review\.json$/.test(path)) return true
	if (/\/experiments\/gradient-field-topology-3\.0\.0-images-diagnostic\/diagnostic\.json$/.test(path)) return true
	return false
}

function selectedKind(path: string): ArtifactKind | null {
	const name = basename(path)
	if (path === fastSampleExclusionPath) return "source-exclusion"
	if (sourceInventoryNames.has(name) && dirname(path) === "research/data") return "source-inventory"
	if (/feedback.*\.json$/.test(name)) return "feedback"
	if (isMajorManifestPath(path)) return "manifest"
	return null
}

function isEmptyFeedback(value: JsonObject): boolean {
	const submissions = Array.isArray(value.entries) ? value.entries : Array.isArray(value.responses) ? value.responses : null
	return submissions?.length === 0
}

async function walk(directory: string): Promise<string[]> {
	const values: string[] = []
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name)
		if (entry.isSymbolicLink()) continue
		if (entry.isDirectory()) values.push(...await walk(path))
		else if (entry.isFile()) values.push(path)
	}
	return values
}

function quarantineAdapter(path: string): string | null {
	if (path.includes("region-pareto-0.4.0")) return "quarantine.missing-pareto-bindings"
	if (path.includes("gradient-eligibility-")) return "quarantine.ambiguous-gradient-control-mapping"
	if (path.includes("controlled-field-state-supervision-")) return "quarantine.specialized-controlled-field-state"
	if (path.includes("region-graph-0.18.0-poc.1-sealed")) return "quarantine.legacy-family-side-mapping"
	if (path.includes("typography-chromatic-apca-")) return "quarantine.specialized-typography"
	return null
}

function feedbackAdapter(value: JsonObject, path: string): string | null {
	const quarantine = quarantineAdapter(path)
	if (quarantine) return quarantine
	if (Array.isArray(value.responses)) return "album-v2.item-paired-feedback-v1"
	if (!Array.isArray(value.entries)) return null
	const first = value.entries.find(isObject)
	if (!first) {
		if (/\/(?:next-palette-|joint-palette-|native-complete-palette-|chromatic-role)/.test(path)) return "complete-palette.ab-feedback-v1"
		return "empty-feedback-v1"
	}
	if (typeof first.selectedTreatmentId === "string") {
		return Array.isArray(first.alsoValidTreatmentIds) ? "album-v2.selected-setwise-feedback-v3" : "album-v2.selected-feedback-v2"
	}
	if (typeof first.treatmentId === "string") return "album-v2.absolute-feedback-v1"
	if (Array.isArray(first.validOptionIds)) return "album-v2.setwise-feedback-v1"
	if ("qualityA" in first && "qualityB" in first) {
		return path.includes("album-artwork-palette-v2") ? "album-v2.paired-feedback-v1" : "complete-palette.ab-feedback-v1"
	}
	if (typeof first.image === "string" && (typeof first.choice === "string" || typeof first.preference === "string")) {
		return path.includes("native-") || path.includes("scale-aware-native")
			? "native-spatial.pair-feedback-v1" : "legacy.pair-feedback-v1"
	}
	if (typeof first.shippable === "boolean") return "legacy.absolute-feedback-v3"
	if (typeof first.overallQuality === "string" || first.overallQuality === null) return "palette-role.absolute-feedback-v1"
	if (typeof first.currentQuality === "string") return "palette-role.counterexample-feedback-v2"
	if (typeof first.pairSha256 === "string" && typeof first.decision === "string") return "gradient-topology.scoped-feedback-v1"
	return null
}

function manifestAdapter(value: JsonObject): string | null {
	if (Array.isArray(value.items)) return "album-v2.item-manifest-v1"
	if (Array.isArray(value.entries)) {
		const firstEntry = value.entries.find(isObject)
		if (firstEntry && isObject(firstEntry.options) && isObject(firstEntry.source)) return "complete-palette.ab-manifest-v1"
		if (firstEntry && isObject(firstEntry.palette) && isObject(firstEntry.source)) return "palette-role.single-manifest-v1"
		if (firstEntry && isObject(firstEntry.current) && Array.isArray(firstEntry.alternatives)) return "palette-role.counterexample-manifest-v2"
		if (firstEntry && typeof firstEntry.pairSha256 === "string" && isObject(firstEntry.anchor)) return "gradient-topology.scope-manifest-v1"
		if (firstEntry && typeof firstEntry.pairSha256 === "string" && typeof firstEntry.sourceSha256 === "string" &&
			(typeof firstEntry.left === "string" || typeof firstEntry.right === "string")) return "native-spatial.assignment-manifest-v1"
	}
	if (!Array.isArray(value.cases)) return null
	const first = value.cases.find(isObject)
	if (!first) return "album-v2.empty-manifest-v1"
	if (isObject(first.source) && isObject(first.options)) return "album-v2.paired-manifest-v1"
	if (typeof first.sourceSha256 === "string") return "album-v2.rich-manifest-v1"
	return null
}

function classify(kind: ArtifactKind, value: JsonObject, path: string): string {
	if (kind === "feedback") return feedbackAdapter(value, path) ?? "unsupported"
	if (kind === "manifest") return manifestAdapter(value) ?? "unsupported"
	if (kind === "source-inventory") return Array.isArray(value.sources) || Array.isArray(value.families)
		? "album-v2.source-inventory-v1" : "unsupported"
	if (kind === "source-exclusion") return Array.isArray(value.sources) || Array.isArray(value.selections)
		? "album-v2.fast-sample-exclusion-v1" : "unsupported"
	return "unsupported"
}

export async function loadArtifact(projectRoot: string, absolutePath: string, expectedKind?: ArtifactKind): Promise<LoadedArtifact> {
	const stats = await lstat(absolutePath)
	if (stats.isSymbolicLink()) throw new Error(`Review evidence artifact must not be a symlink: ${absolutePath}`)
	if (!stats.isFile()) throw new Error(`Review evidence artifact must be a regular file: ${absolutePath}`)
	const bytes = await readFile(absolutePath)
	const parsed: unknown = JSON.parse(bytes.toString("utf8"))
	if (!isObject(parsed)) throw new Error(`Review evidence artifact must contain an object: ${absolutePath}`)
	const path = projectPath(projectRoot, absolutePath)
	const selected = expectedKind ?? selectedKind(path) ?? "unsupported"
	const adapterId = classify(selected, parsed, path)
	const reviewVersion = typeof parsed.reviewVersion === "string" ? parsed.reviewVersion
		: typeof parsed.auditVersion === "string" ? parsed.auditVersion
			: typeof parsed.reviewIdentity === "string" ? parsed.reviewIdentity
				: typeof parsed.manifestVersion === "string" ? parsed.manifestVersion
					: typeof parsed.algorithmVersion === "string" ? parsed.algorithmVersion
						: typeof parsed.diagnosticVersion === "string" ? parsed.diagnosticVersion : null
	return {
		path,
		absolutePath,
		rawSha256: sha256(bytes),
		byteCount: bytes.byteLength,
		kind: adapterId === "unsupported" ? "unsupported" : selected,
		privacy: path.includes(".private.") ? "private" : path.includes(".sealed.") ? "protected" : "public",
		adapterId,
		schemaVersion: typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : null,
		reviewVersion,
		manifestId: typeof parsed.manifestId === "string" ? parsed.manifestId : null,
		contentId: typeof parsed.contentId === "string" ? parsed.contentId : null,
		value: parsed,
	}
}

export async function inventoryReviewArtifacts(projectRoot: string, options: {
	currentReviewPaths?: readonly string[]
} = {}): Promise<ArtifactInventoryRecord[]> {
	const dataRoot = join(projectRoot, "research", "data")
	const currentReviewPaths = new Set((options.currentReviewPaths ?? []).map((path) => resolve(projectRoot, path)))
	const currentReviewDirectories = new Set([...currentReviewPaths].map(dirname))
	const artifacts: ArtifactInventoryRecord[] = []
	for (const absolutePath of await walk(dataRoot)) {
		const path = projectPath(projectRoot, absolutePath)
		const kind = selectedKind(path) ?? (basename(absolutePath) === "manifest.json" &&
			currentReviewDirectories.has(dirname(absolutePath)) ? "manifest" : null)
		if (!kind) continue
		const loaded = await loadArtifact(projectRoot, absolutePath, kind)
		if (kind === "feedback" && path.startsWith("research/data/scratch/")) {
			const explicitlyCurrent = currentReviewPaths.has(absolutePath)
			if (!explicitlyCurrent || isEmptyFeedback(loaded.value)) continue
		}
		const { value: _value, ...artifact } = loaded
		artifacts.push(artifact)
	}
	return artifacts.sort((first, second) => first.path.localeCompare(second.path))
}

function normalizeAssignment(value: string | null, responseSchema: unknown): string | null {
	if (!value) return null
	if (value === "control") return "baseline"
	if (value === "alternative" && isObject(responseSchema) && responseSchema.candidateOutcomeMeans === "bound-alternative") {
		return "candidate"
	}
	return value
}

function optionFrom(
	value: unknown,
	label: string,
	rawPointer: string,
	assignmentLabel: string | null,
	manifest: JsonObject,
	candidateVersion: string | null,
	requireCollapse = true,
): NormalizedOption {
	const treatment = normalizeTreatment(value, {
		presentationVersion: typeof manifest.presentationVersion === "string" ? manifest.presentationVersion : null,
		presentation: manifest.presentation,
		requireCollapse,
	})
	let version = candidateVersion
	if (isObject(value) && isObject(value.version) && typeof value.version.candidateVersion === "string") version = value.version.candidateVersion
	return {
		...treatment,
		label,
		assignmentLabel,
		semanticLabel: normalizeAssignment(assignmentLabel, manifest.responseSchema),
		candidateVersion: version,
		configurationJson: null,
		rawPointer,
	}
}

function richCases(manifest: LoadedArtifact): NormalizedCase[] {
	const cases = manifest.value.cases as unknown[]
	const candidateVersion = typeof manifest.value.candidateVersion === "string" ? manifest.value.candidateVersion : null
	return cases.flatMap((caseValue, caseIndex) => {
		if (!isObject(caseValue) || typeof caseValue.caseId !== "string") return []
		const casePointer = jsonPointer("cases", caseIndex)
		const values = Array.isArray(caseValue.options)
			? { key: "options", values: caseValue.options }
			: Array.isArray(caseValue.alternatives)
				? { key: "alternatives", values: caseValue.alternatives }
				: { key: "alternatives", values: [] as unknown[] }
		const options = values.values.flatMap((option, optionIndex) => {
			if (!isObject(option)) return []
			const label = typeof option.optionId === "string" ? option.optionId : typeof option.id === "string" ? option.id : String(optionIndex)
			const treatment = isObject(option.treatment) ? option : option
			const assignment = typeof caseValue.winnerTreatmentId === "string" &&
				(option.id === caseValue.winnerTreatmentId || option.treatmentId === caseValue.winnerTreatmentId) ? "winner" : null
			try {
				return [optionFrom(treatment, label, jsonPointer("cases", caseIndex, values.key, optionIndex), assignment, manifest.value, candidateVersion)]
			} catch {
				return []
			}
		})
		return [{
			caseId: caseValue.caseId,
			publicItemId: null,
			sourceSha256: typeof caseValue.sourceSha256 === "string" ? caseValue.sourceSha256 : null,
			sourcePath: typeof caseValue.sourcePath === "string" ? caseValue.sourcePath : null,
			artworkFamilyId: typeof caseValue.artworkId === "string" ? caseValue.artworkId : null,
			rawPointer: casePointer,
			options,
		}]
	})
}

function pairedCases(manifest: LoadedArtifact): NormalizedCase[] {
	const cases = manifest.value.cases as unknown[]
	return cases.flatMap((caseValue, caseIndex) => {
		if (!isObject(caseValue) || typeof caseValue.caseId !== "string" || !isObject(caseValue.source) || !isObject(caseValue.options)) return []
		const assignment = isObject(caseValue.assignment) ? caseValue.assignment : {}
		const options = Object.entries(caseValue.options).flatMap(([label, value]) => {
			try {
				const assignmentLabel = typeof assignment[label] === "string" ? assignment[label] as string : null
				return [optionFrom(value, label, jsonPointer("cases", caseIndex, "options", label), assignmentLabel, manifest.value, null)]
			} catch {
				return []
			}
		})
		return [{
			caseId: caseValue.caseId,
			publicItemId: null,
			sourceSha256: typeof caseValue.source.sha256 === "string" ? caseValue.source.sha256 : null,
			sourcePath: typeof caseValue.source.file === "string" ? caseValue.source.file : null,
			artworkFamilyId: typeof caseValue.source.artworkId === "string" ? caseValue.source.artworkId : null,
			rawPointer: jsonPointer("cases", caseIndex),
			options,
		}]
	})
}

function itemCases(manifest: LoadedArtifact): NormalizedCase[] {
	const items = manifest.value.items as unknown[]
	return items.flatMap((itemValue, itemIndex) => {
		if (!isObject(itemValue) || typeof itemValue.internalCaseId !== "string" || !isObject(itemValue.source) || !isObject(itemValue.options)) return []
		const assignment = isObject(itemValue.assignment) ? itemValue.assignment : {}
		const comparison = isObject(itemValue.comparison) ? itemValue.comparison : {}
		const options = Object.entries(itemValue.options).flatMap(([label, value]) => {
			try {
				const assignmentLabel = typeof assignment[label] === "string" ? assignment[label] as string : null
				const comparisonValue = assignmentLabel && isObject(comparison[assignmentLabel]) ? comparison[assignmentLabel] as JsonObject : null
				const option = optionFrom(value, label, jsonPointer("items", itemIndex, "options", label), assignmentLabel, manifest.value,
					comparisonValue && typeof comparisonValue.version === "string" ? comparisonValue.version : null)
				option.configurationJson = comparisonValue ? canonicalJson(comparisonValue) : null
				return [option]
			} catch {
				return []
			}
		})
		return [{
			caseId: itemValue.internalCaseId,
			publicItemId: typeof itemValue.publicItemId === "string" ? itemValue.publicItemId : null,
			sourceSha256: typeof itemValue.source.sha256 === "string" ? itemValue.source.sha256 : null,
			sourcePath: typeof itemValue.source.file === "string" ? itemValue.source.file : null,
			artworkFamilyId: typeof itemValue.source.artworkId === "string" ? itemValue.source.artworkId : null,
			rawPointer: jsonPointer("items", itemIndex),
			options,
		}]
	})
}

function entrySource(entry: JsonObject): { sha256: string | null; path: string | null } {
	if (isObject(entry.source)) return {
		sha256: typeof entry.source.sha256 === "string" ? entry.source.sha256 : null,
		path: typeof entry.source.file === "string" ? entry.source.file : typeof entry.source.path === "string" ? entry.source.path : null,
	}
	return {
		sha256: typeof entry.sourceSha256 === "string" ? entry.sourceSha256 : null,
		path: typeof entry.sourceRelativePath === "string" ? entry.sourceRelativePath : typeof entry.file === "string" ? entry.file : null,
	}
}

function entryCases(manifest: LoadedArtifact): NormalizedCase[] {
	const entries = manifest.value.entries as unknown[]
	return entries.flatMap((entryValue, entryIndex) => {
		if (!isObject(entryValue)) return []
		const caseId = typeof entryValue.caseId === "string" ? entryValue.caseId
			: typeof entryValue.pairSha256 === "string" ? entryValue.pairSha256 : null
		if (!caseId) return []
		const source = entrySource(entryValue)
		const assignment = isObject(entryValue.assignment) ? entryValue.assignment : {}
		let rawOptions: Array<{ label: string; value: unknown; pointer: string }> = []
		if (isObject(entryValue.options)) rawOptions = Object.entries(entryValue.options).map(([label, value]) => ({
			label, value, pointer: jsonPointer("entries", entryIndex, "options", label),
		}))
		else if (isObject(entryValue.palette)) rawOptions = [{
			label: "palette", value: entryValue.palette, pointer: jsonPointer("entries", entryIndex, "palette"),
		}]
		else if (isObject(entryValue.current)) {
			rawOptions.push({ label: "current", value: entryValue.current, pointer: jsonPointer("entries", entryIndex, "current") })
			if (Array.isArray(entryValue.alternatives)) {
				for (let index = 0; index < entryValue.alternatives.length; index++) {
					const alternative = entryValue.alternatives[index]
					if (!isObject(alternative) || !isObject(alternative.palette)) continue
					rawOptions.push({
						label: typeof alternative.id === "string" ? alternative.id : String(index),
						value: alternative.palette,
						pointer: jsonPointer("entries", entryIndex, "alternatives", index, "palette"),
					})
				}
			}
		}
		const options = rawOptions.flatMap(({ label, value, pointer }) => {
			try {
				return [optionFrom(value, label, pointer, typeof assignment[label] === "string" ? assignment[label] as string : null,
					manifest.value, null, false)]
			} catch {
				return []
			}
		})
		return [{
			caseId,
			publicItemId: null,
			sourceSha256: source.sha256 ?? (isObject(entryValue.anchor) && typeof entryValue.anchor.sha256 === "string" ? entryValue.anchor.sha256 : null),
			sourcePath: source.path ?? (isObject(entryValue.anchor) && typeof entryValue.anchor.file === "string" ? entryValue.anchor.file : null),
			artworkFamilyId: typeof entryValue.familyId === "string" ? entryValue.familyId : null,
			rawPointer: jsonPointer("entries", entryIndex),
			options,
		}]
	})
}

export function normalizeManifest(artifact: LoadedArtifact): NormalizedManifest {
	if (!artifact.reviewVersion) throw new Error(`${artifact.path} has no reviewVersion`)
	const cases = artifact.adapterId === "album-v2.rich-manifest-v1"
		? richCases(artifact)
		: artifact.adapterId === "album-v2.paired-manifest-v1"
			? pairedCases(artifact)
			: artifact.adapterId === "album-v2.item-manifest-v1"
				? itemCases(artifact)
				: ["complete-palette.ab-manifest-v1", "palette-role.single-manifest-v1",
					"palette-role.counterexample-manifest-v2", "gradient-topology.scope-manifest-v1",
					"native-spatial.assignment-manifest-v1"].includes(artifact.adapterId)
					? entryCases(artifact) : []
	return {
		artifact,
		reviewVersion: artifact.reviewVersion,
		manifestId: artifact.manifestId,
		contentId: artifact.contentId,
		reviewUnit: typeof artifact.value.reviewUnit === "string" ? artifact.value.reviewUnit : null,
		presentationVersion: typeof artifact.value.presentationVersion === "string" ? artifact.value.presentationVersion : null,
		candidateVersion: typeof artifact.value.candidateVersion === "string" ? artifact.value.candidateVersion : null,
		configurationJson: isObject(artifact.value.closure) ? canonicalJson(artifact.value.closure) : null,
		cases,
	}
}

export function normalizeFeedback(artifact: LoadedArtifact): NormalizedFeedback {
	const containerKey = Array.isArray(artifact.value.responses) ? "responses" : "entries"
	const values = artifact.value[containerKey]
	if (!Array.isArray(values)) throw new Error(`${artifact.path} has no feedback array`)
	return {
		artifact,
		reviewVersion: artifact.reviewVersion ?? `${artifact.adapterId}:schema-${artifact.schemaVersion ?? "unknown"}`,
		manifestId: artifact.manifestId,
		contentId: artifact.contentId,
		manifestRawSha256: typeof artifact.value.manifestRawSha256 === "string" ? artifact.value.manifestRawSha256 : null,
		contractJson: canonicalJson(Object.fromEntries(Object.entries(artifact.value).filter(([key]) => key !== containerKey))),
		containerKey,
		responses: values.filter(isObject),
		submittedAt: typeof artifact.value.submittedAt === "string" ? artifact.value.submittedAt : null,
	}
}

export function sourceInventoryEntries(artifact: LoadedArtifact): Array<{
	sha256: string; sourcePath: string | null; artworkFamilyId: string | null; rawPointer: string
}> {
	const sources = Array.isArray(artifact.value.sources) ? artifact.value.sources.flatMap((source, index) =>
		isObject(source) && typeof source.sha256 === "string" ? [{
		sha256: source.sha256,
		sourcePath: typeof source.path === "string" ? source.path : null,
		artworkFamilyId: typeof source.artworkId === "string" ? source.artworkId : null,
		rawPointer: jsonPointer("sources", index),
	}] : []) : []
	const families = Array.isArray(artifact.value.families) ? artifact.value.families.flatMap((family, familyIndex) => {
		if (!isObject(family) || !Array.isArray(family.variants)) return []
		return family.variants.flatMap((variant, variantIndex) => isObject(variant) && typeof variant.sha256 === "string" ? [{
			sha256: variant.sha256,
			sourcePath: typeof variant.path === "string" ? variant.path : null,
			artworkFamilyId: typeof family.artworkId === "string" ? family.artworkId : null,
			rawPointer: jsonPointer("families", familyIndex, "variants", variantIndex),
		}] : [])
	}) : []
	const selections = Array.isArray(artifact.value.selections) ? artifact.value.selections.flatMap((selection, index) => {
		if (!isObject(selection) || !isObject(selection.source) || typeof selection.source.sha256 !== "string") return []
		return [{
			sha256: selection.source.sha256,
			sourcePath: typeof selection.source.path === "string" ? selection.source.path : null,
			artworkFamilyId: typeof selection.familyId === "string" ? selection.familyId : null,
			rawPointer: jsonPointer("selections", index, "source"),
		}]
	}) : []
	return [...sources, ...families, ...selections]
}

export function candidateTreatments(value: unknown): CandidateTreatment[] {
	if (!isObject(value)) throw new Error("Candidate input must be an object")
	const presentationVersion = typeof value.presentationVersion === "string" ? value.presentationVersion : null
	const presentation = value.presentation
	const direct = Array.isArray(value.candidates) ? value.candidates : null
	if (direct) return direct.map((candidate, index) => {
		if (!isObject(candidate) || typeof candidate.sourceSha256 !== "string") throw new Error(`Candidate ${index} has no sourceSha256`)
		const treatment = normalizeTreatment(candidate.treatment ?? candidate.visibleTreatment ?? candidate, { presentationVersion, presentation })
		return { ...treatment, caseId: typeof candidate.caseId === "string" ? candidate.caseId : String(index), sourceSha256: candidate.sourceSha256,
			reviewQuestion: "absolute-quality" as const }
	})

	const fake: LoadedArtifact = {
		path: "<candidate>", absolutePath: "<candidate>", rawSha256: "", byteCount: 0, kind: "manifest", privacy: "private",
		adapterId: Array.isArray(value.items) ? "album-v2.item-manifest-v1" : "album-v2.rich-manifest-v1",
		schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : null,
		reviewVersion: typeof value.reviewVersion === "string" ? value.reviewVersion : "candidate-input",
		manifestId: null, contentId: null, value,
	}
	const cases = Array.isArray(value.items) ? itemCases(fake) : richCases(fake)
	return cases.flatMap((entry) => {
		let option = entry.options.find((candidate) => candidate.semanticLabel === "candidate" || candidate.assignmentLabel === "winner")
		if (!option && entry.options.length === 1) option = entry.options[0]
		if (!option || !entry.sourceSha256) return []
		return [{ ...option, caseId: entry.caseId, sourceSha256: entry.sourceSha256, reviewQuestion: "absolute-quality" as const }]
	})
}
