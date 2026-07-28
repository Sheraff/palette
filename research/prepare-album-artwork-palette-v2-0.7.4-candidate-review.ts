import { link, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { namePalette } from "./src/color-name.ts"
import type { RGB } from "./src/types.ts"
import {
	ABSOLUTE_QUALITY_VALUES,
	BOUND_REVIEW_CASES,
	COLOR_NAME_POLICY,
	FORBIDDEN_AUTHORIZATIONS,
	ISSUE_TAGS,
	PRESENTATION_VERSION,
	RELATIVE_VALUES,
	RENDERER_ID,
	REVIEW_PROTOCOL_ID,
	REVIEW_VERSION,
	ROLES,
	candidateSide,
	canonicalJson,
	mediaToken,
	paletteKey,
	publicItemId,
	reviewManifestContentId,
	sha256,
	sideAssignmentDigest,
	type PrivateReviewItem,
	type PrivateReviewManifest,
	type ReviewPalette,
} from "./src/album-artwork-palette-v2-0.7.4-candidate-review.ts"

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(moduleDirectory, "..")
const outputPath = resolve(moduleDirectory,
	"data/experiments/album-artwork-palette-v2-0.7.4-candidate-review/review-manifest.private.json")
const feedbackPath = resolve(moduleDirectory,
	"data/experiments/album-artwork-palette-v2-0.7.4-candidate-review/review-feedback.json")
const candidateRoot = "research/data/experiments/album-artwork-palette-v2-0.7.4-development"
const controlRoot = "research/data/experiments/album-artwork-palette-v2-0.7.2-development"

const inputBindings = [
	["research/ALBUM_ARTWORK_UI_PALETTE_PLAN_V2.md", "cf43b640ab6c89bb64fffb7cd143a6b2486259a9dc252311684bd2b4dc317855"],
	["research/ALBUM_ARTWORK_UI_PALETTE_0_7_3_CANDIDATE_RECALL_POSTMORTEM.md", "09d1d3d8e32c3dc00bc2ed25ae41328af4882209a65182a415bf7a5452ae2160"],
	["research/ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_7_4.md", "805bc221c18a4eddf99cb9f7a20bfa1a30a992caaae791d30d221d0e5bf05a86"],
	["research/ALBUM_ARTWORK_UI_PALETTE_0_7_4_CANDIDATE_CLOSURE_POSTMORTEM.md", "f3a61a63b6adf35083487bf546b05737248ccdac202bf166c4c6bad197e78742"],
	["research/data/album-artwork-palette-v2-development-panel.json", "9258032b8ea2d40166d2be89767f5b15341145de314b007c09e766ffbaac75e4"],
	[`${candidateRoot}/execution-manifest.json`, "4166864322673fb250a2ea9c7da23f5d324fde60c0a250c1a271ac70ce2fc549"],
	[`${candidateRoot}/results.json`, "aed8e386717a45020b8eccadf1362bc31157a47aef4804b4b3d8b8fb31a4a4b8"],
	[`${candidateRoot}/summary.json`, "d7a5686d6127027dd0eabb3568dcd303ac3f92332d4af3eaf340d172efed0bc3"],
	[`${candidateRoot}/analysis.json`, "b49cb58c1c6a3cdd1f66ab5a1689ec5da0676470c30f7e50cb46ba1b88c45bd8"],
	[`${candidateRoot}/manifest.json`, "ea070636d10353d72e131c70638d792540ffddae894a0be568df2985bfdf80f4"],
] as const

const implementationPaths = [
	"research/ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_7_4_CANDIDATE_REVIEW.md",
	"research/src/album-artwork-palette-v2-0.7.4-candidate-review.ts",
	"research/prepare-album-artwork-palette-v2-0.7.4-candidate-review.ts",
	"research/verify-album-artwork-palette-v2-0.7.4-candidate-review.ts",
	"research/serve-album-artwork-palette-v2-0.7.4-candidate-review.ts",
	"research/tests/album-artwork-palette-v2-0.7.4-candidate-review.test.ts",
	"research/album-artwork-palette-v2-0.7.4-candidate-review/index.html",
	"research/album-artwork-palette-v2-0.7.4-candidate-review/app.js",
	"research/album-artwork-palette-v2-0.7.4-candidate-review/styles.css",
	"research/data/experiments/album-artwork-palette-v2-0.7.4-candidate-review/README.md",
] as const

type Treatment = Readonly<Record<string, any>> & Readonly<{
	background: Readonly<{ rgb: RGB; hex: string; generated: boolean }>
	surface: Readonly<{ rgb: RGB; hex: string; generated: boolean }>
	foreground: Readonly<{ rgb: RGB; hex: string; generated: boolean }>
	accent: Readonly<{ rgb: RGB; hex: string; generated: boolean }>
	gradient: boolean
	collapse: Readonly<{ surface: boolean; accent: boolean }>
}>

async function readBound(path: string, expectedSha256: string): Promise<Buffer> {
	const bytes = await readFile(resolve(projectRoot, path))
	if (sha256(bytes) !== expectedSha256) throw new Error(`Raw binding changed: ${path}`)
	return bytes
}

async function refuseExisting(path: string): Promise<void> {
	try {
		await readFile(path)
		throw new Error(`Refusing to overwrite existing review artifact: ${path}`)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
	}
}

async function atomicExclusiveJson(path: string, value: unknown): Promise<Buffer> {
	const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
	const temporary = `${path}.${process.pid}.${sha256(bytes).slice(0, 12)}.tmp`
	await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 })
	try {
		await link(temporary, path)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") {
			throw new Error(`Refusing to overwrite existing review artifact: ${path}`)
		}
		throw error
	} finally {
		await rm(temporary, { force: true })
	}
	return bytes
}

function toPalette(treatment: Treatment): ReviewPalette {
	const names = namePalette(ROLES.map((role) => treatment[role].rgb))
	return {
		roles: Object.fromEntries(ROLES.map((role, index) => [role, {
			hex: treatment[role].hex.toLowerCase(),
			nearestName: names[index].nearestName,
			generated: treatment[role].generated,
		}])) as ReviewPalette["roles"],
		gradient: treatment.gradient,
		collapse: { surface: treatment.collapse.surface, accent: treatment.collapse.accent },
	}
}

await Promise.all([refuseExisting(outputPath), refuseExisting(feedbackPath)])

const boundRaw = new Map<string, Buffer>()
for (const [path, expected] of inputBindings) boundRaw.set(path, await readBound(path, expected))
const panel = JSON.parse(boundRaw.get("research/data/album-artwork-palette-v2-development-panel.json")!.toString("utf8"))
const execution = JSON.parse(boundRaw.get(`${candidateRoot}/execution-manifest.json`)!.toString("utf8"))
const results = JSON.parse(boundRaw.get(`${candidateRoot}/results.json`)!.toString("utf8"))
const summary = JSON.parse(boundRaw.get(`${candidateRoot}/summary.json`)!.toString("utf8"))
const analysis = JSON.parse(boundRaw.get(`${candidateRoot}/analysis.json`)!.toString("utf8"))
const artifactManifest = JSON.parse(boundRaw.get(`${candidateRoot}/manifest.json`)!.toString("utf8"))
if (panel.manifestId !== "bd7ad739ada8a35385018737c7ad8d9563b1b6619c695c0ccc0e2a5b87488305" ||
	execution.executionManifestId !== "a80f75b402a12516fb00f2afb3dd56e4c0fb8a4a5f7d8d5284e557eec87a3d09" ||
	results.resultsId !== "5b2526b05267bf7df7aea80e91fd8f7fad0aed27044fc8bfe5bdb4b7e9ef1a7a" ||
	summary.summaryId !== "02a2bc1987a84e5567ff95316b11847c68b0df399cea9d3bdb11d7ef8d9bef37" ||
	analysis.analysisId !== "b2d542377ec21b9861155216ddcff5003bf501ce08fc355f277cf9303a3d8576" ||
	artifactManifest.manifestId !== "4f5278d454cfd7223fad9c1bd174a75892c0f17fdf40d04a3623d35f1f910aef" ||
	artifactManifest.orderedRoot !== "863290bfc38e96d7297353d7cf997e853baea511ccdedf71b8d768047664bd12" ||
	results.mechanicalGate?.pass !== true || analysis.mechanicalPass !== true ||
	JSON.stringify(results.caseIds?.novelFinalWinners) !== JSON.stringify(BOUND_REVIEW_CASES.map(({ caseId }) => caseId)) ||
	results.counts?.novelFinalWinners !== 2 || results.counts?.novelAlternativesReachingSlateWithoutTopOne !== 44 ||
	results.counts?.candidateAdditions !== 6673 || Object.values(results.authorization ?? {}).some((value) => value !== false)) {
	throw new Error("The checked 0.7.4 closure is not eligible for this bounded review")
}

const panelByCase = new Map(panel.sources.map((source: any) => [source.caseId, source]))
const resultByCase = new Map(results.sources.map((source: any) => [source.caseId, source]))
const items: PrivateReviewItem[] = []
for (const [order, bound] of BOUND_REVIEW_CASES.entries()) {
	const candidatePath = `${candidateRoot}/sources/${bound.caseId}.json`
	const controlPath = `${controlRoot}/sources/${bound.caseId}.json`
	const [candidateRaw, controlRaw, sourceBytes] = await Promise.all([
		readBound(candidatePath, bound.candidateArtifactRawSha256),
		readBound(controlPath, bound.controlArtifactRawSha256),
		readFile(resolve(projectRoot, bound.file)),
	])
	if (sourceBytes.byteLength !== bound.byteCount || sha256(sourceBytes) !== bound.sourceSha256) {
		throw new Error(`Development source custody changed: ${bound.caseId}`)
	}
	const candidateArtifact = JSON.parse(candidateRaw.toString("utf8"))
	const controlArtifact = JSON.parse(controlRaw.toString("utf8"))
	const panelSource = panelByCase.get(bound.caseId) as any
	const resultSource = resultByCase.get(bound.caseId) as any
	const controlTreatment = candidateArtifact.scientific?.control?.winner?.treatment as Treatment
	const candidateTreatment = candidateArtifact.scientific?.candidate?.winner?.treatment as Treatment
	if (!panelSource || panelSource.path !== bound.file || panelSource.sha256 !== bound.sourceSha256 ||
		panelSource.byteCount !== bound.byteCount || candidateArtifact.scientific?.source?.sha256 !== bound.sourceSha256 ||
		controlArtifact.source?.sha256 !== bound.sourceSha256 || candidateArtifact.scientific?.control?.winner?.key !== bound.controlKey ||
		candidateArtifact.scientific?.candidate?.winner?.key !== bound.candidateKey ||
		candidateArtifact.scientific?.deltaFrom072?.winner?.baselineKey !== bound.controlKey ||
		candidateArtifact.scientific?.deltaFrom072?.winner?.candidateKey !== bound.candidateKey ||
		candidateArtifact.scientific?.deltaFrom072?.novelFinalWinnerKey !== bound.candidateKey ||
		resultSource?.novelFinalWinnerKey !== bound.candidateKey || resultSource?.winnerMatches072 !== false ||
		canonicalJson(controlTreatment) !== canonicalJson(controlArtifact.extraction?.winner) ||
		candidateArtifact.scientific.control.domain.treatments.some(({ key }: { key: string }) => key === bound.candidateKey)) {
		throw new Error(`Winner binding changed: ${bound.caseId}`)
	}
	const controlPalette = toPalette(controlTreatment)
	const candidatePalette = toPalette(candidateTreatment)
	if (paletteKey(controlPalette) !== bound.controlKey || paletteKey(candidatePalette) !== bound.candidateKey) {
		throw new Error(`Complete treatment projection changed: ${bound.caseId}`)
	}
	const side = candidateSide(bound.sourceSha256, bound.candidateKey, bound.controlKey)
	const comparison = {
		candidate: {
			version: "album-artwork-first-principles-0.7.4" as const,
			key: bound.candidateKey,
			treatmentRecordSha256: sha256(canonicalJson(candidateTreatment)),
			palette: candidatePalette,
		},
		control: {
			version: "album-artwork-first-principles-0.7.2" as const,
			key: bound.controlKey,
			treatmentRecordSha256: sha256(canonicalJson(controlTreatment)),
			palette: controlPalette,
		},
	}
	items.push({
		internalCaseId: bound.caseId,
		publicItemId: publicItemId(bound.sourceSha256),
		mediaToken: mediaToken(bound.sourceSha256),
		order,
		source: { file: bound.file, sha256: bound.sourceSha256, byteCount: bound.byteCount, cohort: "development" },
		checkedArtifacts: {
			candidatePath,
			candidateRawSha256: bound.candidateArtifactRawSha256,
			controlPath,
			controlRawSha256: bound.controlArtifactRawSha256,
		},
		comparison,
		assignment: side === "A"
			? { digest: sideAssignmentDigest(bound.sourceSha256, bound.candidateKey, bound.controlKey), A: "candidate", B: "control" }
			: { digest: sideAssignmentDigest(bound.sourceSha256, bound.candidateKey, bound.controlKey), A: "control", B: "candidate" },
		options: side === "A"
			? { A: candidatePalette, B: controlPalette }
			: { A: controlPalette, B: candidatePalette },
	})
}

const implementationBindings = []
for (const path of implementationPaths) {
	const bytes = await readFile(resolve(projectRoot, path))
	implementationBindings.push({ path, byteCount: bytes.byteLength, rawSha256: sha256(bytes) })
}

const authorization: Record<string, boolean> = {
	boundedDevelopmentReview: true,
	reviewPreparation: true,
	localServing: true,
	oneBoundSubmission: true,
}
for (const key of FORBIDDEN_AUTHORIZATIONS) authorization[key] = false

const identity: Omit<PrivateReviewManifest, "contentId"> = {
	schemaVersion: 1,
	protocolId: REVIEW_PROTOCOL_ID,
	reviewVersion: REVIEW_VERSION,
	presentationVersion: PRESENTATION_VERSION,
	scope: {
		evidenceClass: "bounded-development-final-winner-delta",
		itemCount: 2,
		exactSourceCaseIds: BOUND_REVIEW_CASES.map(({ caseId }) => caseId),
		protectedOverlap: false,
		excludedNovelSlateAlternativeCount: 44,
		excludedAuditTreatmentCount: 639,
	},
	closure: {
		candidateVersion: "album-artwork-first-principles-0.7.4",
		controlVersion: "album-artwork-first-principles-0.7.2",
		productComparisonVersion: "album-artwork-first-principles-0.6.0",
		implementationSha256: "b1139a62047bcb5d454c39c19b74e0c518de07145c49efa784d416305b8d2f3e",
		scientificSha256: "3dd20b73f39ebca33ca6dd762f9a4d5db13867dc85e685aa15f8d4a17708cc21",
		executionManifestId: execution.executionManifestId,
		resultsId: results.resultsId,
		summaryId: summary.summaryId,
		analysisId: analysis.analysisId,
		artifactManifestId: artifactManifest.manifestId,
		artifactOrderedRoot: artifactManifest.orderedRoot,
		inputBindings: inputBindings.map(([path, rawSha256]) => ({ path, rawSha256 })),
		protectedManifestBindings: execution.frozenBindings.protectedSamples.map((entry: any) => ({
			path: entry.path,
			manifestId: entry.manifestId,
			rawSha256: entry.rawSha256,
		})),
	},
	implementationBindings,
	presentation: {
		rendererId: RENDERER_ID,
		rendererSourcePath: "research/album-artwork-palette-v2-0.7.4-candidate-review/app.js",
		rendererFunction: "renderTreatment",
		identicalRendererForAllSides: true,
		gradientCss: "linear-gradient(135deg in oklab, background 0%, surface 100%)",
		colorNamePolicy: COLOR_NAME_POLICY,
		colorNamesPresentationOnly: true,
	},
	responseSchema: {
		absoluteQuality: ABSOLUTE_QUALITY_VALUES,
		relativeSideValues: RELATIVE_VALUES,
		unblindedSemantics: ["candidate-stronger", "baseline-stronger", "similarly-valid", "neither-acceptable", "uncertain"],
		issueTags: ISSUE_TAGS,
		comment: { required: false, maximumUtf16CodeUnits: 2_000, preserveVerbatim: true },
		isolatedSwatchQuestions: false,
	},
	analysisPlan: {
		status: "predeclared-not-executed",
		descriptiveCountsOnly: true,
		commentsAnalyzedNow: false,
		technicalInterpretationsSeparate: true,
		candidateSupportAuthority: false,
		phase4Authority: false,
	},
	authorization,
	items,
}
const manifest: PrivateReviewManifest = { ...identity, contentId: reviewManifestContentId(identity) }
const bytes = await atomicExclusiveJson(outputPath, manifest)
process.stdout.write(`${JSON.stringify({
	reviewVersion: REVIEW_VERSION,
	itemCount: items.length,
	contentId: manifest.contentId,
	manifestRawSha256: sha256(bytes),
	candidateSides: Object.fromEntries(items.map((item) => [item.internalCaseId,
		item.assignment.A === "candidate" ? "A" : "B"])),
	feedbackPath: "research/data/experiments/album-artwork-palette-v2-0.7.4-candidate-review/review-feedback.json",
}, null, 2)}\n`)
