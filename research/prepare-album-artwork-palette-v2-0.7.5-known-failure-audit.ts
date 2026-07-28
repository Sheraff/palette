import { readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	canonicalJson,
	sha256,
} from "./src/album-artwork-palette-v2-0.7.4-candidate-review.ts"

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(moduleDirectory, "..")
const outputRelativePath = "research/data/album-artwork-palette-v2-0.7.5-known-failure-audit.json"
const outputPath = resolve(projectRoot, outputRelativePath)
const verifyOnly = process.argv.includes("--verify")

const bindings = Object.freeze([
	["research/ALBUM_ARTWORK_UI_PALETTE_0_7_4_CANDIDATE_REVIEW_POSTMORTEM.md", "3b90ae073ccdd06593f92c0e87d5d69434f54beeb8d98b1d1ae5d5e24f7a1acf"],
	["research/data/album-artwork-palette-v2-0.7.5-known-bad-roster.json", "6ab3c41f60b35bc87a53ee8da887dc7daa1d76cba0774ff15bfb0a858b6248b3"],
	["research/data/experiments/album-artwork-palette-v2-0.7.3-development/sources/development-03.json", "3afa3657504c59b81edb51fd161bc40e8aae16f5bdccdef753425545816a66e8"],
	["research/data/experiments/album-artwork-palette-v2-0.7.3-development/sources/development-16.json", "bb9eec75b27d05392d3d279dbe791e2d32c2edbc92248973e2fbd35e48921a98"],
	["research/data/experiments/album-artwork-palette-v2-0.7.4-development/sources/development-03.json", "50940af1cc7219a5c47a2b57fb2f8fa16fb03d709390c7425dab78604cbbc565"],
	["research/data/experiments/album-artwork-palette-v2-0.7.4-development/sources/development-12.json", "2fd1a63bca5838bbbc0fb6655700532955454fd21d201b06975903bf1d1e0ffd"],
	["research/data/experiments/album-artwork-palette-v2-0.7.4-development/sources/development-13.json", "a9123c773adda850a1d1ef02a3f8598e01b79cf768401fed720d0f35f5a68654"],
	["research/data/experiments/album-artwork-palette-v2-0.7.4-development/sources/development-15.json", "000bca4ed0509fe3ef284e1d08db0b4a8e42c753f8df619ed3f6d0727f5e7307"],
	["research/data/experiments/album-artwork-palette-v2-0.7.4-development/sources/development-16.json", "e24ebb710242867bf9f25fb86fab95aabc8b586278b76a45aa12f38ee1b6d5e5"],
	["research/data/experiments/album-artwork-palette-v2-0.7.4-development/sources/development-19.json", "1095579cfe397e6605f6edd285325354f1c4810b5248cc0bafb584370bf712d0"],
	["research/data/experiments/album-artwork-palette-v2-0.7.4-development/sources/development-26.json", "3f55e259020da7945a490c8afaa51c37fa08a3071deda3158f6edeb27f707cf0"],
] as const)

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

const rawByPath = new Map<string, Buffer>()
const jsonByPath = new Map<string, any>()
for (const [path, expectedRawSha256] of bindings) {
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

const rosterPath = "research/data/album-artwork-palette-v2-0.7.5-known-bad-roster.json"
const roster = json(rosterPath)
const { rosterId, ...rosterWithoutId } = roster
assert(rosterId === "0ce0465834d82b1a72e931eab21e5a4b318eac14919c4bb07b59e5e7e5653c6f" &&
	rosterId === sha256(canonicalJson(rosterWithoutId)), "Known-bad roster semantic identity changed")
assert(roster.status === "frozen-before-counterfactual-0.7.5-output" && roster.counts.phase4BlockerCount === 2,
	"Known-bad roster is not eligible for diagnosis")

const rosterByCase = new Map(roster.cases.map((entry: any) => [entry.caseId, entry]))

function currentArtifact(caseId: string): any {
	return json(`research/data/experiments/album-artwork-palette-v2-0.7.4-development/sources/${caseId}.json`)
}

function candidate(caseId: string): any {
	const artifact = currentArtifact(caseId)
	const rosterCase = rosterByCase.get(caseId) as any
	assert(artifact.scientific.source.sha256 === rosterCase.current074.source.sha256 &&
		artifact.scientific.candidate.winner.key === rosterCase.current074.winnerKey, `Current custody changed for ${caseId}`)
	return artifact.scientific.candidate
}

function location(candidateValue: any, key: string): Readonly<{ stage: string; domainIndex: number; frontierIndex: number; slateIndex: number }> {
	const domainIndex = candidateValue.domain.treatments.findIndex((entry: any) => entry.key === key)
	const frontierIndex = candidateValue.globalFrontierKeys.indexOf(key)
	const slateIndex = candidateValue.slate.findIndex((entry: any) => entry.key === key)
	const stage = candidateValue.winner.key === key
		? "winner"
		: slateIndex >= 0
			? "public-slate"
			: frontierIndex >= 0
				? "ordinary-global-frontier"
				: domainIndex >= 0
					? "complete-candidate-domain"
					: "absent"
	return { stage, domainIndex, frontierIndex, slateIndex }
}

function custodyCounts(candidateValue: any): any {
	return {
		domain: candidateValue.domain.treatments.length,
		ordinaryGlobalFrontier: candidateValue.globalFrontierKeys.length,
		publicSlate: candidateValue.slate.length,
	}
}

const candidate03 = candidate("development-03")
const candidate12 = candidate("development-12")
const candidate13 = candidate("development-13")
const candidate15 = candidate("development-15")
const candidate16 = candidate("development-16")
const candidate19 = candidate("development-19")
const candidate26 = candidate("development-26")

const reviewedAlternative = (caseId: string): any => {
	const alternatives = (rosterByCase.get(caseId) as any).reviewedAlternatives
	assert(alternatives.length === 1, `Expected one reviewed alternative for ${caseId}`)
	return alternatives[0]
}

const recall03Path = "research/data/experiments/album-artwork-palette-v2-0.7.3-development/sources/development-03.json"
const recall16Path = "research/data/experiments/album-artwork-palette-v2-0.7.3-development/sources/development-16.json"
const recall03 = json(recall03Path)
const recall16 = json(recall16Path)
const arms03 = new Map<string, any>(recall03.recallArms.map((entry: any): [string, any] =>
	[entry.scientific.arm, entry.scientific]))
const arms16 = new Map<string, any>(recall16.recallArms.map((entry: any): [string, any] =>
	[entry.scientific.arm, entry.scientific]))
const widenedFamily03 = arms03.get("widened-family-lane-retention") as any
assert(widenedFamily03, "Development-03 widened-family arm is missing")
const diagnostic03HypothesisId = "gradient:field-domain-0:linear:diagonal-down:family-3302:family-6753:#301684:#4bb15b"
const diagnostic03TreatmentKey = "#301684:#4bb15b:#030102:#d02981:gradient"
const hypothesis03 = widenedFamily03.registry.fieldHypotheses.find((entry: any) => entry.hypothesisId === diagnostic03HypothesisId)
const addition03 = widenedFamily03.additions.find((entry: any) => entry.key === diagnostic03TreatmentKey)
assert(hypothesis03?.sourceConnected === true && hypothesis03.controlProposed === false &&
	addition03?.lineage?.sourceConnected === true && addition03.qualification?.legalUnderUnchangedRules === true,
	"Development-03 discovery-semantic witness changed")
assert(location(candidate03, diagnostic03TreatmentKey).stage === "absent", "Development-03 diagnostic witness unexpectedly entered 0.7.4")

const correctedRoles03Key = "#1c026d:#22438a:#030102:#d02981:gradient"
assert(location(candidate03, correctedRoles03Key).stage === "complete-candidate-domain",
	"Development-03 incumbent-field role witness changed")

const exactBlackYellow12Key = "#fffffe:#fffffe:#080808:#e6e622:flat"
assert(location(candidate12, exactBlackYellow12Key).stage === "complete-candidate-domain",
	"Development-12 black-yellow complete-treatment witness changed")
const yellowDeferral12 = candidate12.identity.obligationGraph.winnerExplanation.obligationDeferrals
	.find((entry: any) => treatmentIdKey(entry.bestCarrierTreatmentId) === exactBlackYellow12Key)
assert(yellowDeferral12 && JSON.stringify(yellowDeferral12.failedQualityGuardBlocks) === JSON.stringify(["accentUtility"]),
	"Development-12 yellow identity guard witness changed")

const diagnosticReview12Key = candidate12.slate[1].key
assert(diagnosticReview12Key === "#fffffe:#fffffe:#e6e622:#584c1c:flat", "Development-12 deterministic diagnostic alternative changed")
assert(!(rosterByCase.get("development-12") as any).humanEvidence.some((entry: any) => entry.treatmentKey === diagnosticReview12Key) &&
	!(rosterByCase.get("development-12") as any).reviewedAlternatives.some((entry: any) => entry.treatmentKey === diagnosticReview12Key),
	"Development-12 diagnostic alternative is no longer unreviewed")

const gradient13Key = candidate13.globalFrontierKeys.find((key: string) => key.endsWith(":gradient"))
assert(gradient13Key && location(candidate13, gradient13Key).frontierIndex === 26, "Development-13 gradient availability changed")

const gradientCounts16 = Object.fromEntries([...arms16.entries()].map(([arm, value]) => [
	arm,
	(value.registry?.fieldHypotheses ?? []).filter((entry: any) => entry.kind === "gradient-field").length,
]))
assert(Object.values(gradientCounts16).every((count) => count === 0) &&
	candidate16.domain.treatments.every((entry: any) => entry.key.endsWith(":flat")),
	"Development-16 no-gradient custody changed")

const alternative19 = reviewedAlternative("development-19")
assert(alternative19.quality === "strong" && location(candidate19, alternative19.treatmentKey).stage === "ordinary-global-frontier",
	"Development-19 reviewed strong frontier custody changed")

const lightForeground26Key = "#bab7b2:#d2cfca:#d7d6d1:#080808:gradient"
assert(location(candidate26, lightForeground26Key).domainIndex === 1272 &&
	location(candidate26, lightForeground26Key).frontierIndex === 170 &&
	location(candidate26, lightForeground26Key).slateIndex === -1,
	"Development-26 light-foreground witness changed")

const classifications = [
	{
		caseId: "development-03",
		severity: "severe-phase-4-blocker",
		custodyCounts: custodyCounts(candidate03),
		winner: location(candidate03, candidate03.winner.key),
		reviewedAlternative: { key: reviewedAlternative("development-03").treatmentKey,
			quality: reviewedAlternative("development-03").quality,
			issues: reviewedAlternative("development-03").issues,
			location: location(candidate03, reviewedAlternative("development-03").treatmentKey) },
		witnesses: {
			incumbentFieldWithRequestedRoles: { key: correctedRoles03Key, location: location(candidate03, correctedRoles03Key), reviewed: false },
			diagnosticGradient: {
				hypothesisId: diagnostic03HypothesisId,
				treatmentKey: diagnostic03TreatmentKey,
				sourceConnected: hypothesis03.sourceConnected,
				controlProposed: hypothesis03.controlProposed,
				legalCompleteTreatmentConstructedInWidenedFamilyArm: addition03.qualification.legalUnderUnchangedRules,
				current074Location: location(candidate03, diagnostic03TreatmentKey),
				reviewed: false,
			},
		},
		earliestDemonstratedFailure: {
			class: "discovery-semantic-failure",
			custodyStage: "field-hypothesis-proposal",
			confidence: "high",
			rationale: "A source-connected broad gradient and legal complete treatment exist in the prior widened-family diagnostic arm but the field hypothesis is never proposed to the selected 0.7.4 retention boundary.",
		},
	},
	{
		caseId: "development-12",
		severity: "severe-phase-4-blocker",
		custodyCounts: custodyCounts(candidate12),
		winner: location(candidate12, candidate12.winner.key),
		reviewedAlternative: { key: reviewedAlternative("development-12").treatmentKey,
			quality: reviewedAlternative("development-12").quality,
			issues: reviewedAlternative("development-12").issues,
			location: location(candidate12, reviewedAlternative("development-12").treatmentKey) },
		witnesses: {
			exactBlackForegroundYellowAccent: {
				key: exactBlackYellow12Key,
				location: location(candidate12, exactBlackYellow12Key),
				identityBestCarrier: true,
				failedQualityGuardBlocks: yellowDeferral12.failedQualityGuardBlocks,
				reviewed: false,
			},
		},
		earliestDemonstratedFailure: {
			class: "unresolved",
			custodyStage: "after-complete-treatment-construction",
			confidence: "bounded",
			rationale: "The source-connected directions already coexist in a legal complete treatment, disproving role-availability and joint-construction loss. Its visible quality is unreviewed, so ordinary/guard loss cannot be called ranking failure.",
		},
	},
	{
		caseId: "development-13",
		severity: "accepted-isolated-limitation",
		custodyCounts: custodyCounts(candidate13),
		winner: location(candidate13, candidate13.winner.key),
		witnesses: { unreviewedGradient: { key: gradient13Key, location: location(candidate13, gradient13Key), reviewed: false } },
		earliestDemonstratedFailure: {
			class: "accepted-isolated-limitation",
			custodyStage: null,
			confidence: "high",
			rationale: "The winner is acceptable, the gradient request was optional, and gradient treatments already reach the public slate.",
		},
	},
	{
		caseId: "development-15",
		severity: "accepted-isolated-limitation",
		custodyCounts: custodyCounts(candidate15),
		winner: location(candidate15, candidate15.winner.key),
		witnesses: {},
		earliestDemonstratedFailure: {
			class: "accepted-isolated-limitation",
			custodyStage: null,
			confidence: "high",
			rationale: "The exact winner is acceptable and the only later criticism is explicitly uncertain with no issue tags.",
		},
	},
	{
		caseId: "development-16",
		severity: "confirmed-non-blocking-systemic-diagnostic",
		custodyCounts: custodyCounts(candidate16),
		winner: location(candidate16, candidate16.winner.key),
		witnesses: { current074GradientTreatmentCount: 0, priorRecallArmGradientHypothesisCounts: gradientCounts16 },
		earliestDemonstratedFailure: {
			class: "discovery-semantic-failure",
			custodyStage: "field-hypothesis-proposal",
			confidence: "high",
			rationale: "No gradient hypothesis exists in the selected registry or any predeclared 0.7.3 recall arm, and every 0.7.4 complete treatment is flat.",
		},
	},
	{
		caseId: "development-19",
		severity: "confirmed-non-blocking-systemic-diagnostic",
		custodyCounts: custodyCounts(candidate19),
		winner: location(candidate19, candidate19.winner.key),
		witnesses: { reviewedStrongPreferredTreatment: { key: alternative19.treatmentKey, location: location(candidate19, alternative19.treatmentKey) } },
		earliestDemonstratedFailure: {
			class: "ranking-or-retention-failure",
			custodyStage: "public-slate-retention",
			confidence: "high",
			rationale: "The exact historically strong and preferred treatment reaches the ordinary global frontier but is omitted from the public slate.",
			mechanismEligibility: "insufficient-alone-because-the-strong-treatment-is-not-already-in-the-public-slate",
		},
	},
	{
		caseId: "development-26",
		severity: "confirmed-non-blocking-systemic-diagnostic",
		custodyCounts: custodyCounts(candidate26),
		winner: location(candidate26, candidate26.winner.key),
		witnesses: { unreviewedLightForegroundTreatment: { key: lightForeground26Key,
			location: location(candidate26, lightForeground26Key), reviewed: false } },
		earliestDemonstratedFailure: {
			class: "unresolved",
			custodyStage: "after-ordinary-global-frontier",
			confidence: "bounded",
			rationale: "A legal source-connected light-foreground treatment reaches the frontier, but it is unreviewed and therefore cannot establish ranking failure.",
		},
	},
]

const auditWithoutId = {
	schemaVersion: 1,
	analysisVersion: "album-artwork-palette-v2-0.7.5-known-failure-audit-1.0.0",
	analysisType: "read-only-current-domain-custody",
	status: "closed-diagnostic-audit-no-counterfactual-candidate-output",
	roster: {
		path: rosterPath,
		rosterId,
		rawSha256: sha256(rawByPath.get(rosterPath)!),
	},
	bindings: bindings.map(([path, rawSha256]) => ({ path, rawSha256 })),
	classifications,
	mechanismSelection: {
		rule: "earliest-demonstrated-custody-loss-then-minimum-architectural-scope-over-repeated-severe-cases",
		severeCaseIds: ["development-03", "development-12"],
		selectedFailureClass: null,
		selectedMechanism: null,
		repeatedSevereFailureClassSupported: false,
		disposition: "end-0.7.5-as-diagnostic-audit",
		reason: [
			"development-03 is a discovery-semantic failure at field-hypothesis proposal",
			"development-12 remains unresolved after legal complete-treatment construction because its relevant alternatives are unreviewed",
			"no ranking, role-attribution, field-structure, joint-construction, discovery-semantic, or representative-collapse mechanism is demonstrated across both severe blockers",
		],
		mechanismAssessments: {
			deterministicRankingCorrection: "not-supported-repeated-strong-public-slate-alternatives-absent",
			roleSpecificIdentityAttribution: "disproved-for-development-12-and-not-earliest-for-development-03",
			multiHueOrPiecewiseFieldStructure: "not-demonstrated-across-severe-cases",
			mechanismAwareJointConstruction: "disproved-for-development-12-and-not-earliest-for-development-03",
			discoverySemanticFollowUp: "supported-for-development-03-and-development-16-but-not-development-12-and-no-common-one-factor-boundary-proven",
			representativeOrCollapseFollowUp: "not-demonstrated-across-severe-cases",
		},
	},
	nextBoundedDiagnosticReview: {
		status: "predeclared-not-authorized",
		purpose: "determine whether the best source-independently ordered unreviewed retained alternative closes development-12 or exposes a later selector failure",
		caseId: "development-12",
		sourceSha256: (rosterByCase.get("development-12") as any).current074.source.sha256,
		control: { key: candidate12.winner.key, quality: "weak-fallback", reviewed: true },
		alternative: { key: diagnosticReview12Key, publicSlateIndex: 1, reviewed: false,
			selectionRule: "first-deterministically-ordered-unreviewed-public-slate-alternative-after-current-winner" },
		maximumItemCount: 1,
		blindedPairwiseComparisonRequired: true,
		openingOrPreparingReviewAuthorized: false,
	},
	authorization: {
		knownFailureAuditComplete: true,
		oneFactorProtocolAuthorizedByEvidence: false,
		candidateImplementation: false,
		counterfactualCandidateOutput: false,
		humanReview: false,
		protectedOrFreshArtworkAccess: false,
		phase4: false,
		promotion: false,
		defaultExtractorChange: false,
		persistence: false,
	},
}

const audit = { ...auditWithoutId, analysisId: sha256(canonicalJson(auditWithoutId)) }
const outputBytes = Buffer.from(`${JSON.stringify(audit, null, 2)}\n`)

if (verifyOnly) {
	const existing = await readFile(outputPath)
	assert(existing.equals(outputBytes), `Frozen audit does not match ${outputRelativePath}`)
	console.log(JSON.stringify({ verified: true, analysisId: audit.analysisId, rawSha256: sha256(existing) }))
} else {
	await writeFile(outputPath, outputBytes, { flag: "wx", mode: 0o644 })
	console.log(JSON.stringify({ written: outputRelativePath, analysisId: audit.analysisId, rawSha256: sha256(outputBytes) }))
}
