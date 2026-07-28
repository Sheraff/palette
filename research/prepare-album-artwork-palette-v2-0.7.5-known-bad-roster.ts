import { readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	canonicalJson,
	sha256,
} from "./src/album-artwork-palette-v2-0.7.4-candidate-review.ts"

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(moduleDirectory, "..")
const outputRelativePath = "research/data/album-artwork-palette-v2-0.7.5-known-bad-roster.json"
const outputPath = resolve(projectRoot, outputRelativePath)
const verifyOnly = process.argv.includes("--verify")

const inputBindings = Object.freeze([
	["research/ALBUM_ARTWORK_UI_PALETTE_PLAN_V2.md", "cf43b640ab6c89bb64fffb7cd143a6b2486259a9dc252311684bd2b4dc317855"],
	["research/ALBUM_ARTWORK_UI_PALETTE_0_7_3_CANDIDATE_RECALL_POSTMORTEM.md", "09d1d3d8e32c3dc00bc2ed25ae41328af4882209a65182a415bf7a5452ae2160"],
	["research/ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_7_4.md", "805bc221c18a4eddf99cb9f7a20bfa1a30a992caaae791d30d221d0e5bf05a86"],
	["research/ALBUM_ARTWORK_UI_PALETTE_0_7_4_CANDIDATE_CLOSURE_POSTMORTEM.md", "f3a61a63b6adf35083487bf546b05737248ccdac202bf166c4c6bad197e78742"],
	["research/ALBUM_ARTWORK_UI_PALETTE_PROTOCOL_V2_0_7_4_CANDIDATE_REVIEW.md", "9ee26ea72dc1260a66ce5f28eaf0c667554f888890fa125831e8060649e7f60f"],
	["research/ALBUM_ARTWORK_UI_PALETTE_0_7_4_CANDIDATE_REVIEW_POSTMORTEM.md", "3b90ae073ccdd06593f92c0e87d5d69434f54beeb8d98b1d1ae5d5e24f7a1acf"],
	["research/data/experiments/album-artwork-palette-v2-0.7.4-development/results.json", "aed8e386717a45020b8eccadf1362bc31157a47aef4804b4b3d8b8fb31a4a4b8"],
	["research/data/experiments/album-artwork-palette-v2-0.7.4-development/manifest.json", "ea070636d10353d72e131c70638d792540ffddae894a0be568df2985bfdf80f4"],
	["research/data/experiments/album-artwork-palette-v2-0.7.4-candidate-review/review-analysis.json", "fb56d5c9331b39fb7a9dc492d684fef820d18e1117bfc08d660222fe6d005243"],
	["research/data/experiments/album-artwork-palette-v2-0.7.1-development/quality-guard-review-manifest.private.json", "0d10397551fab94bfa44763a9c808d319703ac7877a02cda72ed6f9b67ad0132"],
	["research/data/experiments/album-artwork-palette-v2-0.7.1-development/quality-guard-review-analysis.json", "3ecaa90543f6924402e96f9766f322d2a1d74f56d9e00f12634be2b6988651eb"],
	["research/data/experiments/album-artwork-palette-v2-0.7.1-development/quality-guard-technical-interpretations.json", "b25e7e0f123f24fe7ba3d4c7ca5600de42bd15a893f4e56c9ed2bc3961b928dc"],
	["research/data/experiments/album-artwork-palette-v2-0.7.0-development/identity-obligation-review-manifest.private.json", "02ba912a0f31c4f887daa96bcdee8415933ea078e4b7b1e3f233f5bc685fea5b"],
	["research/data/experiments/album-artwork-palette-v2-0.7.0-development/identity-obligation-review-analysis.json", "2afcf69982bdf9dc924462c43bd41bd8d24db10fe2c469319ae0c8488f1897aa"],
	["research/data/experiments/album-artwork-palette-v2-0.7.0-development/identity-obligation-technical-interpretations.json", "441e8f1b591207fd54aae5af78956150881e152ca8ee86a96a6b66840b73f35c"],
	["research/data/experiments/album-artwork-palette-v2-0.5.1-development/ranking-review-manifest.private.json", "239fe5418fe77e0c7e52cc45df6f94a07e03b95d8268c318d0572b52fd9bff7e"],
	["research/data/experiments/album-artwork-palette-v2-0.5.1-development/ranking-review-analysis.json", "12f5a234265fbec65453676bab207cf4776a9cb6b3d03e46c5341afdf2961654"],
	["research/data/experiments/album-artwork-palette-v2-0.4.4-development/absolute-quality-delta-analysis.json", "b6faac15ae598e495ab4154db4ba8cffc05409bbd7a48a87a3292b7fa3795722"],
	["research/data/experiments/album-artwork-palette-v2-0.4.1-development/lightweight-review-analysis.json", "e334f649f6cc406757090f760e0a7fda08a284cc3ea0217793058ff28b3a4098"],
	["research/data/experiments/album-artwork-palette-v2-0.4.3-development/targeted-review-analysis.json", "cbba6743d11c7fadc0654c327a5dc423fcef4474a437cc2a20303537ba606614"],
	["research/data/experiments/album-artwork-palette-v2-0.4.3-development/targeted-review-manifest.json", "edd96e6b2f54646c82c164b369744feff0708e0f49304f7947175c0e7fcc4f35"],
	["research/data/experiments/album-artwork-palette-v2-0.7.4-development/sources/development-03.json", "50940af1cc7219a5c47a2b57fb2f8fa16fb03d709390c7425dab78604cbbc565"],
	["research/data/experiments/album-artwork-palette-v2-0.7.4-development/sources/development-12.json", "2fd1a63bca5838bbbc0fb6655700532955454fd21d201b06975903bf1d1e0ffd"],
	["research/data/experiments/album-artwork-palette-v2-0.7.4-development/sources/development-13.json", "a9123c773adda850a1d1ef02a3f8598e01b79cf768401fed720d0f35f5a68654"],
	["research/data/experiments/album-artwork-palette-v2-0.7.4-development/sources/development-15.json", "000bca4ed0509fe3ef284e1d08db0b4a8e42c753f8df619ed3f6d0727f5e7307"],
	["research/data/experiments/album-artwork-palette-v2-0.7.4-development/sources/development-16.json", "e24ebb710242867bf9f25fb86fab95aabc8b586278b76a45aa12f38ee1b6d5e5"],
	["research/data/experiments/album-artwork-palette-v2-0.7.4-development/sources/development-19.json", "1095579cfe397e6605f6edd285325354f1c4810b5248cc0bafb584370bf712d0"],
	["research/data/experiments/album-artwork-palette-v2-0.7.4-development/sources/development-26.json", "3f55e259020da7945a490c8afaa51c37fa08a3071deda3158f6edeb27f707cf0"],
] as const)

const expectedCases = Object.freeze({
	"development-03": Object.freeze({
		sourceSha256: "26b991b5d5b9c2a1a390bc5ec398a9b24231da0ce78e927e663aefd9ac1f5d9d",
		winnerKey: "#1c026d:#22438a:#e0cdc7:#d02981:gradient",
		severity: "severe-phase-4-blocker",
		blocking: true,
	}),
	"development-12": Object.freeze({
		sourceSha256: "06c5954c94eb50d02b71f5895503e1729c019e390e190b6f603f42ff25a282e0",
		winnerKey: "#fffffe:#fffffe:#080808:#584c1c:flat",
		severity: "severe-phase-4-blocker",
		blocking: true,
	}),
	"development-13": Object.freeze({
		sourceSha256: "26fb272d7128b9ed89ac19b8fc0c2810d10cae4ace1a06a37663b20b2bb61fc9",
		winnerKey: "#dddde7:#dddde7:#3b303e:#807387:flat",
		severity: "accepted-isolated-limitation",
		blocking: false,
	}),
	"development-15": Object.freeze({
		sourceSha256: "69382d609c4c88a917e9151aeb07fd6c1b938ae732fe286de0e43cf038662b7d",
		winnerKey: "#141b25:#36444f:#ccd3d9:#808b91:flat",
		severity: "accepted-isolated-limitation",
		blocking: false,
	}),
	"development-16": Object.freeze({
		sourceSha256: "92bfe9dd27931b1badc1b4ce5847c13c8852eacf8c49d6f38b6ff8ea58be7480",
		winnerKey: "#44648b:#354f70:#fbfcf7:#100d28:flat",
		severity: "confirmed-non-blocking-systemic-diagnostic",
		blocking: false,
	}),
	"development-19": Object.freeze({
		sourceSha256: "057be6b5a93708db128db9752b66b3d7631fec5d5611f3c5e318a03f6ee0c0d2",
		winnerKey: "#beb2c6:#9b9bbd:#1c0031:#d8cbdd:flat",
		severity: "confirmed-non-blocking-systemic-diagnostic",
		blocking: false,
	}),
	"development-26": Object.freeze({
		sourceSha256: "c76ff144d9d609785ac09e18626a554b411fabcc76118469cdc857840bd5d096",
		winnerKey: "#cdcac5:#8e8b86:#080808:#393631:gradient",
		severity: "confirmed-non-blocking-systemic-diagnostic",
		blocking: false,
	}),
} as const)

type CaseId = keyof typeof expectedCases

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

function rgbHex(value: string): string {
	const channels = value.split(",").map((entry) => Number(entry))
	assert(channels.length === 3 && channels.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 255),
		`Invalid treatment RGB ${value}`)
	return `#${channels.map((entry) => entry.toString(16).padStart(2, "0")).join("")}`
}

function treatmentIdKey(treatmentId: string): string {
	const parts = treatmentId.split("|")
	assert(parts.length === 6 && (parts[5] === "flat" || parts[5] === "gradient"), `Invalid treatment ID ${treatmentId}`)
	return [...parts.slice(1, 5).map(rgbHex), parts[5]].join(":")
}

function paletteKey(value: any): string {
	assert(value?.roles && typeof value.gradient === "boolean", "Review option is not a complete treatment")
	return ["background", "surface", "foreground", "accent"]
		.map((role) => String(value.roles[role].hex).toLowerCase())
		.concat(value.gradient ? "gradient" : "flat")
		.join(":")
}

const rawByPath = new Map<string, Buffer>()
const jsonByPath = new Map<string, any>()
for (const [path, expectedRawSha256] of inputBindings) {
	const bytes = await readFile(resolve(projectRoot, path))
	assert(sha256(bytes) === expectedRawSha256, `Raw binding changed: ${path}`)
	rawByPath.set(path, bytes)
	if (path.endsWith(".json")) jsonByPath.set(path, JSON.parse(bytes.toString("utf8")))
}

function json(path: string): any {
	const value = jsonByPath.get(path)
	assert(value, `Missing JSON binding ${path}`)
	return value
}

function pairObservation(args: Readonly<{
	manifestPath: string
	analysisPath: string
	caseId: CaseId
	assignmentTarget: "baseline" | "candidate"
	qualityField: string
	tagsField: string
	relativeField: string
	reviewTarget: "current-treatment" | "reviewed-alternative"
	commentScope: "current-treatment" | "pair-shared"
}>): any {
	const manifestCase = json(args.manifestPath).cases.find((entry: any) => entry.caseId === args.caseId)
	const analysisRoot = json(args.analysisPath)
	const results = analysisRoot.freshReview?.caseResults ?? analysisRoot.caseResults ?? analysisRoot.cases
	const result = results.find((entry: any) => entry.caseId === args.caseId)
	assert(manifestCase && result, `Missing pair evidence for ${args.caseId}`)
	const side = (["A", "B"] as const).find((entry) => manifestCase.assignment[entry] === args.assignmentTarget)
	assert(side, `Missing ${args.assignmentTarget} assignment for ${args.caseId}`)
	assert(manifestCase.source.sha256 === result.sourceSha256, `Review source mismatch for ${args.caseId}`)
	const treatmentKey = paletteKey(manifestCase.options[side])
	const comment = String(result.comment)
	return {
		evidenceKind: "human-review",
		reviewTarget: args.reviewTarget,
		commentScope: args.commentScope,
		sourceSha256: result.sourceSha256,
		treatmentKey,
		quality: result[args.qualityField],
		issues: result[args.tagsField],
		relativeOutcome: result[args.relativeField],
		comment,
		commentSha256: result.commentSha256 ?? sha256(comment),
		manifest: {
			path: args.manifestPath,
			rawSha256: sha256(rawByPath.get(args.manifestPath)!),
		},
		analysis: {
			path: args.analysisPath,
			rawSha256: sha256(rawByPath.get(args.analysisPath)!),
		},
	}
}

function absoluteObservation(args: Readonly<{
	analysisPath: string
	caseId: CaseId
	reviewTarget?: "current-treatment" | "reviewed-alternative"
}>): any {
	const result = json(args.analysisPath).caseResults.find((entry: any) => entry.caseId === args.caseId)
	assert(result, `Missing absolute evidence for ${args.caseId}`)
	const comment = String(result.comment)
	return {
		evidenceKind: "human-review",
		reviewTarget: args.reviewTarget ?? "current-treatment",
		commentScope: "current-treatment",
		sourceSha256: result.sourceSha256,
		treatmentKey: treatmentIdKey(result.treatmentId),
		quality: result.absoluteQuality,
		issues: [],
		relativeOutcome: null,
		comment,
		commentSha256: sha256(comment),
		manifest: null,
		analysis: {
			path: args.analysisPath,
			rawSha256: sha256(rawByPath.get(args.analysisPath)!),
		},
	}
}

function currentRecord(caseId: CaseId): any {
	const path = `research/data/experiments/album-artwork-palette-v2-0.7.4-development/sources/${caseId}.json`
	const artifact = json(path)
	const expected = expectedCases[caseId]
	const candidate = artifact.scientific?.candidate
	assert(artifact.candidateVersion === "album-artwork-first-principles-0.7.4", `Wrong candidate version for ${caseId}`)
	assert(artifact.scientific?.source?.caseId === caseId && artifact.scientific.source.sha256 === expected.sourceSha256,
		`Current source identity changed for ${caseId}`)
	assert(candidate?.winner?.key === expected.winnerKey, `Current winner changed for ${caseId}`)
	const domainKeys = candidate.domain.treatments.map((entry: any) => entry.key)
	const frontierKeys = candidate.globalFrontierKeys as string[]
	const slateKeys = candidate.slate.map((entry: any) => entry.key)
	assert(domainKeys.includes(expected.winnerKey) && frontierKeys.includes(expected.winnerKey) && slateKeys[0] === expected.winnerKey,
		`Winner custody changed for ${caseId}`)
	return {
		caseId,
		source: artifact.scientific.source,
		artifact: { path, rawSha256: sha256(rawByPath.get(path)!) },
		winnerKey: expected.winnerKey,
		winnerMatches072: artifact.scientific.deltaFrom072.winner.exactMatch,
		winnerMatches060: artifact.scientific.deltaFrom060.winner.exactMatch,
		domainKeys,
		frontierKeys,
		slateKeys,
		novelSlateKeys: artifact.scientific.deltaFrom072.novelRetainedSlateKeys,
	}
}

function currentLocation(record: any, treatmentKey: string): string {
	if (record.winnerKey === treatmentKey) return "winner"
	if (record.slateKeys.includes(treatmentKey)) return "public-slate"
	if (record.frontierKeys.includes(treatmentKey)) return "ordinary-global-frontier"
	if (record.domainKeys.includes(treatmentKey)) return "complete-candidate-domain"
	return "absent"
}

const manifest071 = "research/data/experiments/album-artwork-palette-v2-0.7.1-development/quality-guard-review-manifest.private.json"
const analysis071 = "research/data/experiments/album-artwork-palette-v2-0.7.1-development/quality-guard-review-analysis.json"
const manifest070 = "research/data/experiments/album-artwork-palette-v2-0.7.0-development/identity-obligation-review-manifest.private.json"
const analysis070 = "research/data/experiments/album-artwork-palette-v2-0.7.0-development/identity-obligation-review-analysis.json"
const manifest051 = "research/data/experiments/album-artwork-palette-v2-0.5.1-development/ranking-review-manifest.private.json"
const analysis051 = "research/data/experiments/album-artwork-palette-v2-0.5.1-development/ranking-review-analysis.json"
const analysis044 = "research/data/experiments/album-artwork-palette-v2-0.4.4-development/absolute-quality-delta-analysis.json"
const analysis041 = "research/data/experiments/album-artwork-palette-v2-0.4.1-development/lightweight-review-analysis.json"

const current = Object.fromEntries((Object.keys(expectedCases) as CaseId[]).map((caseId) => [caseId, currentRecord(caseId)])) as
	Record<CaseId, ReturnType<typeof currentRecord>>

const evidence = {
	"development-03": [
		absoluteObservation({ analysisPath: analysis041, caseId: "development-03" }),
		absoluteObservation({ analysisPath: analysis044, caseId: "development-03" }),
		pairObservation({ manifestPath: manifest051, analysisPath: analysis051, caseId: "development-03", assignmentTarget: "baseline",
			qualityField: "predecessorQuality", tagsField: "predecessorTags", relativeField: "comparison", reviewTarget: "current-treatment",
			commentScope: "pair-shared" }),
		pairObservation({ manifestPath: manifest070, analysisPath: analysis070, caseId: "development-03", assignmentTarget: "baseline",
			qualityField: "predecessorQuality", tagsField: "predecessorTags", relativeField: "relativeOutcome", reviewTarget: "current-treatment",
			commentScope: "pair-shared" }),
		pairObservation({ manifestPath: manifest071, analysisPath: analysis071, caseId: "development-03", assignmentTarget: "baseline",
			qualityField: "baselineQuality", tagsField: "baselineTags", relativeField: "relativeOutcome", reviewTarget: "current-treatment",
			commentScope: "pair-shared" }),
	],
	"development-12": [
		pairObservation({ manifestPath: manifest070, analysisPath: analysis070, caseId: "development-12", assignmentTarget: "baseline",
			qualityField: "predecessorQuality", tagsField: "predecessorTags", relativeField: "relativeOutcome", reviewTarget: "current-treatment",
			commentScope: "pair-shared" }),
	],
	"development-13": [
		pairObservation({ manifestPath: manifest070, analysisPath: analysis070, caseId: "development-13", assignmentTarget: "baseline",
			qualityField: "predecessorQuality", tagsField: "predecessorTags", relativeField: "relativeOutcome", reviewTarget: "current-treatment",
			commentScope: "pair-shared" }),
	],
	"development-15": [
		absoluteObservation({ analysisPath: analysis044, caseId: "development-15" }),
		pairObservation({ manifestPath: manifest051, analysisPath: analysis051, caseId: "development-15", assignmentTarget: "baseline",
			qualityField: "predecessorQuality", tagsField: "predecessorTags", relativeField: "comparison", reviewTarget: "current-treatment",
			commentScope: "pair-shared" }),
	],
	"development-16": [
		absoluteObservation({ analysisPath: analysis044, caseId: "development-16" }),
		pairObservation({ manifestPath: manifest051, analysisPath: analysis051, caseId: "development-16", assignmentTarget: "baseline",
			qualityField: "predecessorQuality", tagsField: "predecessorTags", relativeField: "comparison", reviewTarget: "current-treatment",
			commentScope: "pair-shared" }),
	],
	"development-19": [
		absoluteObservation({ analysisPath: analysis044, caseId: "development-19" }),
		pairObservation({ manifestPath: manifest051, analysisPath: analysis051, caseId: "development-19", assignmentTarget: "baseline",
			qualityField: "predecessorQuality", tagsField: "predecessorTags", relativeField: "comparison", reviewTarget: "current-treatment",
			commentScope: "pair-shared" }),
	],
	"development-26": [
		absoluteObservation({ analysisPath: analysis044, caseId: "development-26" }),
		pairObservation({ manifestPath: manifest070, analysisPath: analysis070, caseId: "development-26", assignmentTarget: "baseline",
			qualityField: "predecessorQuality", tagsField: "predecessorTags", relativeField: "relativeOutcome", reviewTarget: "current-treatment",
			commentScope: "pair-shared" }),
	],
} as const

for (const caseId of Object.keys(evidence) as CaseId[]) {
	for (const observation of evidence[caseId]) {
		assert(observation.sourceSha256 === expectedCases[caseId].sourceSha256, `Evidence source changed for ${caseId}`)
		assert(observation.treatmentKey === expectedCases[caseId].winnerKey, `Evidence treatment changed for ${caseId}`)
	}
}

const alternative03 = pairObservation({ manifestPath: manifest070, analysisPath: analysis070, caseId: "development-03",
	assignmentTarget: "candidate", qualityField: "candidateQuality", tagsField: "candidateTags", relativeField: "relativeOutcome",
	reviewTarget: "reviewed-alternative", commentScope: "current-treatment" })
const alternative12 = pairObservation({ manifestPath: manifest070, analysisPath: analysis070, caseId: "development-12",
	assignmentTarget: "candidate", qualityField: "candidateQuality", tagsField: "candidateTags", relativeField: "relativeOutcome",
	reviewTarget: "reviewed-alternative", commentScope: "pair-shared" })
const alternative26 = pairObservation({ manifestPath: manifest070, analysisPath: analysis070, caseId: "development-26",
	assignmentTarget: "candidate", qualityField: "candidateQuality", tagsField: "candidateTags", relativeField: "relativeOutcome",
	reviewTarget: "reviewed-alternative", commentScope: "pair-shared" })

const targeted043ManifestPath = "research/data/experiments/album-artwork-palette-v2-0.4.3-development/targeted-review-manifest.json"
const targeted043AnalysisPath = "research/data/experiments/album-artwork-palette-v2-0.4.3-development/targeted-review-analysis.json"
const targeted19Manifest = json(targeted043ManifestPath).cases.find((entry: any) => entry.caseId === "development-19")
const targeted19Analysis = json(targeted043AnalysisPath).responseInterpretations.find((entry: any) => entry.caseId === "development-19")
const alternative19Treatment = targeted19Manifest.options.find((entry: any) => entry.optionId === targeted19Analysis.preferredOptionId).treatment
const alternative19Key = [alternative19Treatment.background.hex, alternative19Treatment.surface.hex,
	alternative19Treatment.foreground.hex, alternative19Treatment.accent.hex, alternative19Treatment.gradient ? "gradient" : "flat"].join(":")
const absolute19 = absoluteObservation({ analysisPath: analysis041, caseId: "development-19", reviewTarget: "reviewed-alternative" })
assert(absolute19.treatmentKey === alternative19Key, "Development-19 preferred treatment custody changed")

const reviewedAlternatives = {
	"development-03": [{ ...alternative03, current074Location: currentLocation(current["development-03"], alternative03.treatmentKey) }],
	"development-12": [{ ...alternative12, current074Location: currentLocation(current["development-12"], alternative12.treatmentKey) }],
	"development-13": [],
	"development-15": [],
	"development-16": [],
	"development-19": [{
		...absolute19,
		current074Location: currentLocation(current["development-19"], alternative19Key),
		additionalHumanEvidence: {
			independentlyValid: true,
			preferred: true,
			comment: targeted19Analysis.comment,
			manifest: { path: targeted043ManifestPath, rawSha256: sha256(rawByPath.get(targeted043ManifestPath)!) },
			analysis: { path: targeted043AnalysisPath, rawSha256: sha256(rawByPath.get(targeted043AnalysisPath)!) },
		},
	}],
	"development-26": [{ ...alternative26, current074Location: currentLocation(current["development-26"], alternative26.treatmentKey) }],
} as const

const technicalInterpretations = {
	"development-03": [{
		target: "shared",
		transferStatus: "descriptive-symptom-only",
		classes: ["persistent-foreground-role-identity-misalignment", "persistent-field-chromatic-identity-misalignment"],
		source: {
			path: "research/data/experiments/album-artwork-palette-v2-0.7.1-development/quality-guard-technical-interpretations.json",
			rawSha256: "b25e7e0f123f24fe7ba3d4c7ca5600de42bd15a893f4e56c9ed2bc3961b928dc",
		},
	}, {
		target: "rejected-0.7.1-candidate",
		transferStatus: "non-transferable-different-treatment",
		classes: ["identity-quality-guard-incomplete-comparison-domain"],
		source: {
			path: "research/data/experiments/album-artwork-palette-v2-0.7.1-development/quality-guard-technical-interpretations.json",
			rawSha256: "b25e7e0f123f24fe7ba3d4c7ca5600de42bd15a893f4e56c9ed2bc3961b928dc",
		},
	}],
	"development-12": [{
		target: "rejected-0.7.0-candidate",
		transferStatus: "non-transferable-different-treatment",
		classes: ["identity-complement-regression-missing-dark-anchor"],
		source: {
			path: "research/data/experiments/album-artwork-palette-v2-0.7.0-development/identity-obligation-technical-interpretations.json",
			rawSha256: "441e8f1b591207fd54aae5af78956150881e152ca8ee86a96a6b66840b73f35c",
		},
	}],
	"development-13": [{
		target: "shared",
		transferStatus: "uncertain-descriptive-symptom-only",
		classes: ["gradient-availability-shared"],
		source: {
			path: "research/data/experiments/album-artwork-palette-v2-0.7.0-development/identity-obligation-technical-interpretations.json",
			rawSha256: "441e8f1b591207fd54aae5af78956150881e152ca8ee86a96a6b66840b73f35c",
		},
	}],
	"development-15": [],
	"development-16": [],
	"development-19": [],
	"development-26": [{
		target: "shared",
		transferStatus: "descriptive-symptom-only",
		classes: ["foreground-polarity-misalignment"],
		source: {
			path: "research/data/experiments/album-artwork-palette-v2-0.7.0-development/identity-obligation-technical-interpretations.json",
			rawSha256: "441e8f1b591207fd54aae5af78956150881e152ca8ee86a96a6b66840b73f35c",
		},
	}],
} as const

const rationale = Object.freeze({
	"development-03": "The exact current winner has repeated below-acceptable human assessments and unresolved core field and foreground identity criticism.",
	"development-12": "The exact current winner is a reviewed weak fallback with incomplete artwork identity because it omits the bright-yellow identity direction.",
	"development-13": "The exact current winner is acceptable; the only criticism is an optional slight gradient and its technical interpretation is explicitly uncertain.",
	"development-15": "The exact current winner is acceptable; the only later criticism is explicitly uncertain and carries no issue tags.",
	"development-16": "The exact current winner is acceptable but repeatedly carries a missing-gradient symptom and an artwork-specific accent request.",
	"development-19": "The exact current winner is acceptable, but an exact historically strong and preferred treatment remains in the 0.7.4 frontier and is lost before the public slate.",
	"development-26": "The exact current winner is acceptable but repeatedly carries the artwork-inconsistent dark-foreground polarity symptom.",
} as const)

const cases = (Object.keys(expectedCases) as CaseId[]).map((caseId) => ({
	caseId,
	severity: expectedCases[caseId].severity,
	blocksPhase4: expectedCases[caseId].blocking,
	rationale: rationale[caseId],
	current074: {
		source: current[caseId].source,
		artifact: current[caseId].artifact,
		winnerKey: current[caseId].winnerKey,
		winnerMatches072: current[caseId].winnerMatches072,
		winnerMatches060: current[caseId].winnerMatches060,
		slateKeys: current[caseId].slateKeys,
		novelSlateKeys: current[caseId].novelSlateKeys,
	},
	humanEvidence: evidence[caseId],
	technicalInterpretations: technicalInterpretations[caseId],
	reviewedAlternatives: reviewedAlternatives[caseId],
}))

const rosterWithoutId = {
	schemaVersion: 1,
	rosterVersion: "album-artwork-palette-v2-0.7.5-known-bad-roster-1.0.0",
	status: "frozen-before-counterfactual-0.7.5-output",
	authority: "bounded-development-diagnosis-and-one-factor-mechanism-selection-only",
	baseline: {
		version: "album-artwork-first-principles-0.7.4",
		resultsId: json("research/data/experiments/album-artwork-palette-v2-0.7.4-development/results.json").resultsId,
		artifactManifestId: json("research/data/experiments/album-artwork-palette-v2-0.7.4-development/manifest.json").manifestId,
		candidateReviewAnalysisId: json("research/data/experiments/album-artwork-palette-v2-0.7.4-candidate-review/review-analysis.json").analysisId,
	},
	bindings: inputBindings.map(([path, rawSha256]) => ({ path, rawSha256 })),
	severityPolicy: {
		phase4Blocker: "exact-current-source-and-treatment with a latest applicable direct human quality below acceptable and an unresolved core product obligation",
		systemicDiagnostic: "exact-current-source-and-treatment remains acceptable but has repeated or independently corroborated core-obligation criticism",
		acceptedIsolatedLimitation: "exact-current-source-and-treatment remains acceptable and criticism is optional, uncertain, or non-systemic",
		contradictoryHumanJudgmentsRemainVerbatim: true,
		technicalInterpretationsNeverReplaceHumanLabels: true,
		changedTreatmentsInheritSourceLevelLabels: false,
		severityMayChangeAfterCounterfactualInspection: false,
	},
	counts: {
		caseCount: cases.length,
		phase4BlockerCount: cases.filter((entry) => entry.blocksPhase4).length,
		systemicDiagnosticCount: cases.filter((entry) => entry.severity === "confirmed-non-blocking-systemic-diagnostic").length,
		acceptedIsolatedLimitationCount: cases.filter((entry) => entry.severity === "accepted-isolated-limitation").length,
	},
	cases,
	exclusions: {
		protectedOrFreshSources: "excluded",
		filenameSourceIdColorNameAndAgentMemoryOnlyCases: "excluded",
		changedOrNovelUnreviewedTreatments: "retained-as-unreviewed-current-custody-only",
	},
	authorization: {
		current074ReadOnlyDiagnosis: true,
		oneFactorProtocolPreparation: true,
		counterfactualCandidateOutputBeforeProtocol: false,
		humanReview: false,
		protectedOrFreshArtworkAccess: false,
		phase4: false,
		promotion: false,
		defaultExtractorChange: false,
		persistence: false,
	},
}

const roster = { ...rosterWithoutId, rosterId: sha256(canonicalJson(rosterWithoutId)) }
const outputBytes = Buffer.from(`${JSON.stringify(roster, null, 2)}\n`)

if (verifyOnly) {
	const existing = await readFile(outputPath)
	assert(existing.equals(outputBytes), `Frozen roster does not match ${outputRelativePath}`)
	console.log(JSON.stringify({ verified: true, rosterId: roster.rosterId, rawSha256: sha256(existing) }))
} else {
	await writeFile(outputPath, outputBytes, { flag: "wx", mode: 0o644 })
	console.log(JSON.stringify({ written: outputRelativePath, rosterId: roster.rosterId, rawSha256: sha256(outputBytes) }))
}
