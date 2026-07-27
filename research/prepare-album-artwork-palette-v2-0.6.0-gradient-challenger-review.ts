import { createHash } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	ALBUM_ARTWORK_PALETTE_V2_0_6_0_GRADIENT_REVIEW_VERSION,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_4_PRESENTATION_VERSION,
	phase4ReviewManifestId,
	type Phase4PrivateReviewCase,
} from "./src/album-artwork-palette-v2-phase-4-review.ts"
import type { CompletePaletteTreatment } from "./src/album-artwork-palette-v2.ts"

type Role = "background" | "surface" | "foreground" | "accent"
type Presentation = Readonly<{
	treatmentId: string
	roles: Readonly<Record<Role, Readonly<{ nearestName: string }>>>
}>
type SourceArtifact = Readonly<{
	implementationHash: string
	source: Readonly<{ caseId: string; path: string; sha256: string; byteCount: number }>
	extraction: Readonly<{ winner: CompletePaletteTreatment }>
	presentations: readonly Presentation[]
}>
type Aggregate = Readonly<{
	candidateVersion: string
	implementationHash: string
	developmentManifestId: string
	scientificSha256: string
	cases: readonly SourceArtifact[]
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const currentDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.6.0-development")
const predecessorDirectory = resolve(moduleDirectory, "data/experiments/album-artwork-palette-v2-0.5.2-development")
const outputPath = resolve(currentDirectory, "gradient-challenger-review-manifest.private.json")
const preparationPath = resolve(currentDirectory, "gradient-challenger-review-preparation.json")
const future03Path = resolve(moduleDirectory, "data/album-artwork-palette-v2-future-sample-03.sealed.json")
const ROLES = ["background", "surface", "foreground", "accent"] as const

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
	const record = value as Record<string, unknown>
	return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`
}

async function atomicJson(path: string, value: unknown): Promise<void> {
	const temporary = `${path}.${process.pid}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	await rename(temporary, path)
}

function treatmentKey(treatment: CompletePaletteTreatment): string {
	return [treatment.background.hex, treatment.surface.hex, treatment.foreground.hex, treatment.accent.hex,
		treatment.gradient ? "gradient" : "flat", treatment.collapse.surface ? "surface-collapsed" : "surface-distinct",
		treatment.collapse.accent ? "accent-collapsed" : "accent-distinct"].join(":")
}

function palette(artifact: SourceArtifact) {
	const treatment = artifact.extraction.winner
	const presentation = artifact.presentations.find(({ treatmentId }) => treatmentId === treatment.id)
	if (!presentation) throw new Error(`Missing winner presentation for ${artifact.source.caseId}`)
	return {
		roles: Object.fromEntries(ROLES.map((role) => [role, {
			hex: treatment[role].hex,
			nearestName: presentation.roles[role].nearestName,
			generated: treatment[role].generated,
		}])) as Record<Role, { hex: string; nearestName: string; generated: boolean }>,
		gradient: treatment.gradient,
		collapse: treatment.collapse,
	}
}

const [currentRaw, predecessorRaw, analysisRaw, future03Raw] = await Promise.all([
	readFile(resolve(currentDirectory, "aggregate.json"), "utf8"),
	readFile(resolve(predecessorDirectory, "aggregate.json"), "utf8"),
	readFile(resolve(currentDirectory, "development-analysis.json"), "utf8"),
	readFile(future03Path, "utf8"),
])
const current = JSON.parse(currentRaw) as Aggregate
const predecessor = JSON.parse(predecessorRaw) as Aggregate
const analysis = JSON.parse(analysisRaw) as {
	implementationHash: string
	scientificSha256: string
	mechanismGate: Readonly<{ pass: boolean }>
	mechanical: Readonly<{ changedWinnerCaseIds: readonly string[] }>
	futureSample03: Readonly<{ manifestId: string; opened: false }>
}
const future03 = JSON.parse(future03Raw) as { manifestId: string }
const expectedChanged = ["development-06", "development-22"]
if (current.candidateVersion !== "album-artwork-first-principles-0.6.0" ||
	predecessor.candidateVersion !== "album-artwork-first-principles-0.5.2" ||
	current.implementationHash !== analysis.implementationHash || current.scientificSha256 !== analysis.scientificSha256 ||
	current.developmentManifestId !== predecessor.developmentManifestId || !analysis.mechanismGate.pass ||
	canonicalJson(analysis.mechanical.changedWinnerCaseIds) !== canonicalJson(expectedChanged) ||
	analysis.futureSample03.opened !== false || analysis.futureSample03.manifestId !== future03.manifestId ||
	sha256(future03Raw) !== "690e85ace6377fd154db1124754dfb7d876c64a3c063f8b567e0e219d88f0183") {
	throw new Error("The 0.6.0 gradient challenger is not eligible for blinded review")
}
const predecessorByCase = new Map(predecessor.cases.map((entry) => [entry.source.caseId, entry]))
const changed = expectedChanged.map((caseId) => {
	const entry = current.cases.find(({ source }) => source.caseId === caseId)
	const old = predecessorByCase.get(caseId)
	if (!entry || !old || entry.source.sha256 !== old.source.sha256 ||
		treatmentKey(entry.extraction.winner) === treatmentKey(old.extraction.winner)) {
		throw new Error(`Invalid changed-winner binding for ${caseId}`)
	}
	return { entry, old }
})
const ordered = [...changed].sort((first, second) => sha256([
	ALBUM_ARTWORK_PALETTE_V2_0_6_0_GRADIENT_REVIEW_VERSION,
	current.developmentManifestId,
	first.entry.source.sha256,
].join("\0")).localeCompare(sha256([
	ALBUM_ARTWORK_PALETTE_V2_0_6_0_GRADIENT_REVIEW_VERSION,
	current.developmentManifestId,
	second.entry.source.sha256,
].join("\0"))))
const cases: Phase4PrivateReviewCase[] = ordered.map(({ entry, old }, order) => {
	const candidateSide = order % 2 === 0 ? "A" : "B"
	return {
		caseId: entry.source.caseId,
		order,
		source: { file: entry.source.path, sha256: entry.source.sha256, bytes: entry.source.byteCount },
		options: candidateSide === "A" ? { A: palette(entry), B: palette(old) } : { A: palette(old), B: palette(entry) },
		assignment: candidateSide === "A" ? { A: "candidate", B: "baseline" } : { A: "baseline", B: "candidate" },
	}
})
const identity = {
	schemaVersion: 1 as const,
	reviewVersion: ALBUM_ARTWORK_PALETTE_V2_0_6_0_GRADIENT_REVIEW_VERSION,
	presentationVersion: ALBUM_ARTWORK_PALETTE_V2_PHASE_4_PRESENTATION_VERSION,
	cases,
}
const manifest = { ...identity, manifestId: phase4ReviewManifestId(identity) }
const bindings = cases.map((reviewCase) => {
	const entry = current.cases.find(({ source }) => source.caseId === reviewCase.caseId)!
	const old = predecessorByCase.get(reviewCase.caseId)!
	return {
		caseId: reviewCase.caseId,
		sourceSha256: reviewCase.source.sha256,
		candidateSide: reviewCase.assignment.A === "candidate" ? "A" : "B",
		candidateTreatmentId: entry.extraction.winner.id,
		candidateTreatmentKey: treatmentKey(entry.extraction.winner),
		predecessorTreatmentId: old.extraction.winner.id,
		predecessorTreatmentKey: treatmentKey(old.extraction.winner),
	}
})
const preparationWithoutId = {
	schemaVersion: 1,
	reviewVersion: manifest.reviewVersion,
	manifestId: manifest.manifestId,
	candidateVersion: current.candidateVersion,
	implementationHash: current.implementationHash,
	scientificSha256: current.scientificSha256,
	predecessorVersion: predecessor.candidateVersion,
	predecessorImplementationHash: predecessor.implementationHash,
	predecessorScientificSha256: predecessor.scientificSha256,
	reviewCaseCount: cases.length,
	candidateSideCounts: {
		A: cases.filter(({ assignment }) => assignment.A === "candidate").length,
		B: cases.filter(({ assignment }) => assignment.B === "candidate").length,
	},
	bindings,
	inputHashes: {
		currentAggregateSha256: sha256(currentRaw),
		predecessorAggregateSha256: sha256(predecessorRaw),
		developmentAnalysisSha256: sha256(analysisRaw),
		futureSample03Sha256: sha256(future03Raw),
	},
	futureSample03: { manifestId: future03.manifestId, opened: false },
}
const preparation = { ...preparationWithoutId, preparationId: sha256(canonicalJson(preparationWithoutId)) }
await Promise.all([atomicJson(outputPath, manifest), atomicJson(preparationPath, preparation)])
process.stdout.write(`Prepared ${cases.length} blinded gradient deltas; candidate sides A/B ${preparation.candidateSideCounts.A}/${preparation.candidateSideCounts.B}\n`)
