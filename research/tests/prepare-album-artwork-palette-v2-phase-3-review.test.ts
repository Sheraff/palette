import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test, { type TestContext } from "node:test"
import { fileURLToPath } from "node:url"
import {
	parseAlbumArtworkPaletteV2Phase3ReviewArguments,
	prepareAlbumArtworkPaletteV2Phase3Review,
} from "../prepare-album-artwork-palette-v2-phase-3-review.ts"
import {
	parseCompletePaletteReviewFeedbackStore,
	parseCompletePaletteReviewManifest,
	type CompletePaletteReviewManifest,
} from "../src/complete-palette-review-v2.ts"

const contractId = "album-artwork-palette-v2-phase-3-attempt-contract-v1"
const anchorId = "closed-anchor"
const candidateId = "candidate-attempt"
const comparisonId = "comparison-attempt"
const workingExpansionManifestPath = fileURLToPath(new URL(
	"../data/album-artwork-palette-v2-phase-3-working-expansion.json",
	import.meta.url,
))
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url))

type RawTreatment = Readonly<{
	id: string
	background: Readonly<{ hex: string; generated: boolean }>
	surface: Readonly<{ hex: string; generated: boolean }>
	foreground: Readonly<{ hex: string; generated: boolean }>
	accent: Readonly<{ hex: string; generated: boolean }>
	gradient: boolean
	fieldTreatment: string
	sourceFieldHypothesisId: string
	familyRoles: Readonly<{
		background: string
		surface: string
		foreground: string
		accent: string
	}>
	collapse: Readonly<{ surface: boolean; accent: boolean }>
	gradientEvidence: null | Readonly<{ topology: string; direction: string }>
}>

function treatment(
	id: string,
	values: readonly [string, string, string, string],
	options: Readonly<{
		gradient?: boolean
		generatedAccent?: boolean
		fieldTreatment?: string
		sourceFieldHypothesisId?: string
		familyRoles?: RawTreatment["familyRoles"]
		gradientTopology?: string
		gradientDirection?: string
	}> = {},
): RawTreatment {
	const gradient = options.gradient ?? false
	return {
		id,
		background: { hex: values[0], generated: false },
		surface: { hex: values[1], generated: false },
		foreground: { hex: values[2], generated: false },
		accent: { hex: values[3], generated: options.generatedAccent ?? false },
		gradient,
		fieldTreatment: options.fieldTreatment ?? (gradient ? "gradient-field" : "separate-flat-fields"),
		sourceFieldHypothesisId: options.sourceFieldHypothesisId ?? (gradient ? "gradient:test" : "flat:test"),
		familyRoles: options.familyRoles ?? {
			background: "family-background",
			surface: "family-surface",
			foreground: "family-foreground",
			accent: "family-accent",
		},
		collapse: { surface: values[0] === values[1], accent: values[2] === values[3] },
		gradientEvidence: gradient ? {
			topology: options.gradientTopology ?? "linear",
			direction: options.gradientDirection ?? "left-right",
		} : null,
	}
}

const anchor = treatment("anchor", ["#101010", "#101010", "#f0f0f0", "#f0f0f0"])
const oldAlternative = treatment("old", ["#101010", "#101010", "#f0f0f0", "#cccccc"])
const changedWinner = treatment("changed", ["#101010", "#202020", "#f0f0f0", "#d00000"], {
	generatedAccent: true,
})
const novelFlat = treatment("novel-flat", ["#101010", "#101010", "#f0f0f0", "#00aa00"])
const novelGradient = treatment("novel-gradient", ["#101010", "#303030", "#f0f0f0", "#f0f0f0"], {
	gradient: true,
})
const secondNovel = treatment("second-novel", ["#181818", "#181818", "#eeeeee", "#3366cc"])
const comparisonAnchor = treatment("comparison", ["#121212", "#121212", "#ededed", "#ededed"])
const exactCarrier = treatment("exact-carrier", ["#202020", "#303030", "#505050", "#707070"], {
	gradient: true,
	sourceFieldHypothesisId: "gradient:exact-field",
	familyRoles: {
		background: "family-exact-background",
		surface: "family-exact-surface",
		foreground: "family-dark-foreground",
		accent: "family-exact-accent",
	},
	gradientTopology: "radial-center",
	gradientDirection: "center-out",
})
const exactReserve = treatment("exact-reserve", ["#202020", "#303030", "#f5f5f5", "#707070"], {
	gradient: true,
	sourceFieldHypothesisId: "gradient:exact-field",
	familyRoles: {
		background: "family-exact-background",
		surface: "family-exact-surface",
		foreground: "family-light-foreground",
		accent: "family-exact-accent",
	},
	gradientTopology: "radial-center",
	gradientDirection: "center-out",
})

function normalized(key: string, value: RawTreatment) {
	return { key, treatment: value }
}

function treatmentKey(value: RawTreatment): string {
	return `${value.background.hex}:${value.surface.hex}:${value.foreground.hex}:${value.accent.hex}:` +
		`${value.gradient ? "gradient" : "flat"}`
}

type FixtureSource = Readonly<{
	caseId: string
	path: string
	sha256: string
	byteCount: number
}>

type MutableExactCarrierArtifact = {
	attempts: Array<{
		identity: { attemptId: string }
		output: {
			winner: { key: string; treatment: RawTreatment }
			alternatives: Array<{ key: string; treatment: RawTreatment }>
			diagnostics?: {
				phase3SourceLightForegroundReserve: ReturnType<typeof exactCarrierDiagnostics>
			}
		}
		materialDelta: {
			winner: { candidateKey: string; changed: boolean }
		}
	}>
}

function artifact(source: FixtureSource, candidateWinner: RawTreatment,
	candidateAlternatives: Array<Readonly<{ key: string; treatment: RawTreatment }>>,
	comparisonWinner: RawTreatment = comparisonAnchor) {
	const anchorAlternatives = [normalized("anchor-key", anchor), normalized("old-key", oldAlternative)]
	const addedAlternativeKeys = candidateAlternatives
		.map(({ key }) => key)
		.filter((key) => !new Set(anchorAlternatives.map((entry) => entry.key)).has(key))
	const candidateWinnerKey = candidateWinner === anchor ? "anchor-key" : "changed-key"
	return {
		schemaVersion: 1,
		contractId,
		source: {
			caseId: source.caseId,
			sha256: source.sha256,
			byteCount: source.byteCount,
			width: 10,
			height: 10,
		},
		anchor: {
			identity: { anchorId },
			output: { winner: normalized("anchor-key", anchor), alternatives: anchorAlternatives },
		},
		attempts: [{
			identity: { attemptId: candidateId, configurationId: "synthetic" },
			output: { winner: normalized(candidateWinnerKey, candidateWinner), alternatives: candidateAlternatives },
			materialDelta: {
				identity: "canonical-role-hex-and-gradient-v1",
				winner: {
					anchorKey: "anchor-key",
					candidateKey: candidateWinnerKey,
					changed: candidateWinnerKey !== "anchor-key",
				},
				addedAlternativeKeys,
			},
		}, {
			identity: { attemptId: comparisonId, configurationId: "synthetic-comparison" },
			output: {
				winner: normalized("comparison-key", comparisonWinner),
				alternatives: [normalized("comparison-key", comparisonWinner)],
			},
			materialDelta: { identity: "unused-comparison-fixture" },
		}],
	}
}

async function json(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function fixture(context: TestContext): Promise<Readonly<{
	root: string
	iterationDirectory: string
	panelPath: string
}>> {
	const root = await mkdtemp(join(tmpdir(), "phase-3-review-bridge-"))
	context.after(async () => rm(root, { recursive: true, force: true }))
	const iterationDirectory = join(root, "research", "data", "scratch", "iteration")
	const imageDirectory = join(root, "images")
	await mkdir(iterationDirectory, { recursive: true })
	await mkdir(imageDirectory, { recursive: true })
	const sources = await Promise.all(["one", "two", "three"].map(async (name, index) => {
		const bytes = Buffer.from(`synthetic-artwork-${name}`)
		const file = `images/${name}.jpg`
		await writeFile(join(root, file), bytes)
		return {
			caseId: `development-0${index + 1}`,
			path: file,
			sha256: createHash("sha256").update(bytes).digest("hex"),
			byteCount: bytes.byteLength,
		}
	}))
	const panelPath = join(root, "research", "data", "album-artwork-palette-v2-development-panel.json")
	await mkdir(join(root, "research", "data"), { recursive: true })
	await json(panelPath, { schemaVersion: 1, sourceCount: sources.length, sources })

	const artifacts = [
		artifact(sources[0], changedWinner, [
			normalized("changed-key", structuredClone(changedWinner)),
			normalized("old-key", oldAlternative),
			normalized("novel-flat-key", novelFlat),
			normalized("novel-gradient-key", novelGradient),
		]),
		artifact(sources[1], anchor, [
			normalized("anchor-key", anchor),
			normalized("second-novel-key", secondNovel),
		]),
		artifact(sources[2], anchor, [normalized("anchor-key", anchor), normalized("old-key", oldAlternative)]),
	]
	for (const artifactValue of artifacts) {
		await json(join(iterationDirectory, `${artifactValue.source.caseId}.json`), artifactValue)
	}
	await json(join(iterationDirectory, "iteration.json"), {
		schemaVersion: 1,
		contractId,
		iterationId: "synthetic",
		sources: [...sources].reverse().map((source) => ({
			caseId: source.caseId,
			file: `${source.caseId}.json`,
		})),
	})
	return { root, iterationDirectory, panelPath }
}

function exactCarrierDiagnostics(anchorKeys: readonly string[], outputKeys: readonly string[]) {
	const carrierIndex = anchorKeys.indexOf(treatmentKey(exactCarrier))
	const gates = Object.fromEntries([
		"materializedKeyCanonical",
		"qualityEvaluationAvailable",
		"completeLineageDiagnosticAvailable",
		"fieldConditionalRoleEvidenceAvailable",
		"foregroundFamilyEvidenceAvailable",
		"rolePreferenceForeground",
		"lightForegroundEvidenceAtLeastMinimum",
		"familyConcentrationAtLeastMinimum",
		"withinQualityLossMaximum",
		"foregroundApcaSamplesAvailableAndFinite",
		"foregroundApcaSamplesAllNonpositive",
		"foregroundApcaHasNegativeSample",
		"ordinaryCompleteLineageEligible",
		"exactCurrentSlateCarrierAvailable",
		"foregroundChangesRelativeToCarrier",
		"candidateAbsentFromSlate",
		"matchedCarrierPreservedByCapacityAction",
	].map((key) => [key, true]))
	return {
		version: "album-artwork-palette-v2-phase-3-source-light-foreground-reserve-diagnostics-v1",
		configurationId: "synthetic-exact-reserve",
		sourceLightForegroundReserve: {
			version: "album-artwork-palette-v2-phase-3-source-light-foreground-reserve-v1",
			policy: {
				maximumReservedTreatments: 1,
				baselineMutation: "append-or-replace-last-only",
			},
			identities: {
				canonicalTreatment: "canonical-role-hex-and-gradient-v1",
				exactCarrier: "exact-current-slate-field-collapse-accent-carrier-v1",
			},
			baseline: {
				winnerKey: treatmentKey(anchor),
				slateKeys: anchorKeys,
			},
			candidates: [{
				key: treatmentKey(exactReserve),
				carrierKey: treatmentKey(exactCarrier),
				carrierIndex,
				gates,
				eligible: true,
				rejectionReasons: [],
			}],
			eligibleReserveKeysInOrder: [treatmentKey(exactReserve)],
			outcome: {
				exactNoOp: false,
				reservedKey: treatmentKey(exactReserve),
				reservedCarrierKey: treatmentKey(exactCarrier),
				reservedCarrierIndex: carrierIndex,
				replacedKey: treatmentKey(oldAlternative),
				winnerKey: treatmentKey(anchor),
				outputSlateKeys: outputKeys,
				winnerPreserved: true,
				baselinePrefixLength: 2,
				baselinePrefixPreserved: true,
				matchedCarrierPreserved: true,
			},
		},
	}
}

async function exactCarrierFixture(context: TestContext): Promise<Readonly<{
	root: string
	iterationDirectory: string
	panelPath: string
	artifactPath: string
}>> {
	const root = await mkdtemp(join(tmpdir(), "phase-3-exact-carrier-review-"))
	context.after(async () => rm(root, { recursive: true, force: true }))
	const iterationDirectory = join(root, "research", "data", "scratch", "iteration")
	const panelPath = join(root, "research", "data", "album-artwork-palette-v2-development-panel.json")
	const artifactPath = join(iterationDirectory, "development-01.json")
	await mkdir(iterationDirectory, { recursive: true })
	await mkdir(join(root, "images"), { recursive: true })
	const sourceBytes = Buffer.from("synthetic-exact-carrier-artwork")
	await writeFile(join(root, "images", "exact.jpg"), sourceBytes)
	const source = {
		caseId: "development-01",
		path: "images/exact.jpg",
		sha256: createHash("sha256").update(sourceBytes).digest("hex"),
		byteCount: sourceBytes.byteLength,
	}
	await json(panelPath, { schemaVersion: 1, sourceCount: 1, sources: [source] })
	const closedAlternatives = [
		normalized(treatmentKey(anchor), anchor),
		normalized(treatmentKey(oldAlternative), oldAlternative),
	]
	const comparisonAlternatives = [
		normalized(treatmentKey(anchor), anchor),
		normalized(treatmentKey(exactCarrier), exactCarrier),
		normalized(treatmentKey(oldAlternative), oldAlternative),
	]
	const candidateAlternatives = [
		normalized(treatmentKey(anchor), anchor),
		normalized(treatmentKey(exactCarrier), exactCarrier),
		normalized(treatmentKey(exactReserve), exactReserve),
	]
	await json(artifactPath, {
		schemaVersion: 1,
		contractId,
		source: {
			caseId: source.caseId,
			sha256: source.sha256,
			byteCount: source.byteCount,
			width: 10,
			height: 10,
		},
		anchor: {
			identity: { anchorId },
			output: {
				winner: normalized(treatmentKey(anchor), anchor),
				alternatives: closedAlternatives,
			},
		},
		attempts: [{
			identity: { attemptId: candidateId, configurationId: "synthetic-exact-reserve" },
			output: {
				winner: normalized(treatmentKey(anchor), anchor),
				alternatives: candidateAlternatives,
				diagnostics: {
					phase3SourceLightForegroundReserve: exactCarrierDiagnostics(
						comparisonAlternatives.map(({ key }) => key),
						candidateAlternatives.map(({ key }) => key),
					),
				},
			},
			materialDelta: {
				identity: "canonical-role-hex-and-gradient-v1",
				winner: {
					anchorKey: treatmentKey(anchor),
					candidateKey: treatmentKey(anchor),
					changed: false,
				},
				addedAlternativeKeys: [treatmentKey(exactCarrier), treatmentKey(exactReserve)],
			},
		}, {
			identity: { attemptId: comparisonId, configurationId: "synthetic-comparison" },
			output: {
				winner: normalized(treatmentKey(anchor), anchor),
				alternatives: comparisonAlternatives,
			},
			materialDelta: { identity: "unused-comparison-fixture" },
		}],
	})
	await json(join(iterationDirectory, "iteration.json"), {
		schemaVersion: 1,
		contractId,
		iterationId: "synthetic-exact-carrier",
		sources: [{ caseId: source.caseId, file: "development-01.json" }],
	})
	return { root, iterationDirectory, panelPath, artifactPath }
}

async function workingExpansionFixture(context: TestContext): Promise<Awaited<ReturnType<typeof fixture>>> {
	const root = await mkdtemp(join(tmpdir(), "phase-3-working-expansion-review-"))
	context.after(async () => rm(root, { recursive: true, force: true }))
	const manifest = JSON.parse(await readFile(workingExpansionManifestPath, "utf8")) as {
		manifestId: string
		expansionGroup: { sources: FixtureSource[] }
	}
	const source = manifest.expansionGroup.sources.find(({ caseId }) => caseId === "working-expansion-11")
	assert.ok(source)
	const sourceBytes = await readFile(join(repositoryRoot, source.path))
	assert.equal(sourceBytes.byteLength, source.byteCount)
	assert.equal(createHash("sha256").update(sourceBytes).digest("hex"), source.sha256)
	const iterationDirectory = join(root, "research", "data", "scratch", "working-expansion-review")
	await mkdir(iterationDirectory, { recursive: true })
	await mkdir(join(root, "04"), { recursive: true })
	await writeFile(join(root, source.path), sourceBytes)
	const normalizedArtifact = artifact(source, anchor, [
		normalized("anchor-key", anchor),
		normalized("raw-relation-key", novelFlat),
	], anchor)
	await json(join(iterationDirectory, "working-expansion-11.json"), normalizedArtifact)
	await json(join(iterationDirectory, "iteration.json"), {
		schemaVersion: 1,
		contractId,
		iterationId: "working-expansion-review",
		sourceAuthorization: { mode: "working-expansion", manifestId: manifest.manifestId },
		sources: [{
			caseId: source.caseId,
			sourceSha256: source.sha256,
			file: "working-expansion-11.json",
		}],
	})
	return {
		root,
		iterationDirectory,
		panelPath: join(root, "research", "data", "unused-development-panel.json"),
	}
}

function options(fixtureValue: Awaited<ReturnType<typeof fixture>>, outputDirectory: string,
	overrides: Partial<Parameters<typeof prepareAlbumArtworkPaletteV2Phase3Review>[0]> = {}) {
	return {
		iterationDirectory: fixtureValue.iterationDirectory,
		candidateAttemptId: candidateId,
		anchorId,
		mode: "pairwise" as const,
		outputDirectory,
		all: true,
		maximumCases: 16,
		reviewCaseIds: [],
		projectRoot: fixtureValue.root,
		developmentPanelPath: fixtureValue.panelPath,
		...overrides,
	}
}

async function readManifest(path: string): Promise<CompletePaletteReviewManifest> {
	return parseCompletePaletteReviewManifest(JSON.parse(await readFile(path, "utf8")) as unknown)
}

test("CLI binds the iteration, candidate, anchor, mode, output, and bounded/all policy", () => {
	assert.deepEqual(parseAlbumArtworkPaletteV2Phase3ReviewArguments([
		"--iteration-directory", "scratch/run",
		"--candidate-attempt", candidateId,
		"--anchor", anchorId,
		"--mode", "pairwise",
		"--output-directory", "scratch/review",
		"--all",
	]), {
		iterationDirectory: "scratch/run",
		candidateAttemptId: candidateId,
		anchorId,
		mode: "pairwise",
		outputDirectory: "scratch/review",
		all: true,
		maximumCases: 16,
		reviewCaseIds: [],
	})
	assert.throws(() => parseAlbumArtworkPaletteV2Phase3ReviewArguments([
		"--iteration", "run", "--candidate", candidateId, "--anchor", anchorId,
		"--mode", "absolute", "--output", "review", "--all", "--limit", "2",
	]), /cannot be combined/u)
	assert.equal(parseAlbumArtworkPaletteV2Phase3ReviewArguments([
		"run", candidateId, anchorId, "absolute", "review", "--all",
	]).mode, "absolute")
	assert.deepEqual(parseAlbumArtworkPaletteV2Phase3ReviewArguments([
		"run", candidateId, anchorId, "pairwise", "review",
		"--review-case", "development-01.winner",
		"--review-case", "development-01.slate-04",
	]).reviewCaseIds, ["development-01.winner", "development-01.slate-04"])
	assert.equal(parseAlbumArtworkPaletteV2Phase3ReviewArguments([
		"run", candidateId, anchorId, "pairwise", "review",
		"--working-expansion-manifest", "research/data/working-expansion.json",
	]).workingExpansionManifestPath, "research/data/working-expansion.json")
	assert.equal(parseAlbumArtworkPaletteV2Phase3ReviewArguments([
		"run", candidateId, anchorId, "pairwise", "review",
		"--pairwise-slate-anchor", "exact-foreground-carrier",
	]).pairwiseSlateAnchor, "exact-foreground-carrier")
	assert.throws(() => parseAlbumArtworkPaletteV2Phase3ReviewArguments([
		"run", candidateId, anchorId, "absolute", "review",
		"--pairwise-slate-anchor", "exact-foreground-carrier",
	]), /valid only in pairwise mode/u)
	assert.throws(() => parseAlbumArtworkPaletteV2Phase3ReviewArguments([
		"run", candidateId, anchorId, "pairwise", "review",
		"--pairwise-slate-anchor", "winner",
	]), /must be exact-foreground-carrier/u)
	assert.throws(() => parseAlbumArtworkPaletteV2Phase3ReviewArguments([
		"run", candidateId, anchorId, "pairwise", "review", "--all",
		"--review-case", "development-01.winner",
	]), /cannot be combined/u)
})

test("working-expansion preparation requires explicit verified opt-in and preserves canonical defaults", async (context) => {
	const input = await workingExpansionFixture(context)
	await assert.rejects(() => prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "missing-opt-in"),
		{ anchorId: comparisonId, all: false, reviewCaseIds: ["working-expansion-11.slate-02"] },
	)), /requires an explicit verified --working-expansion-manifest/u)

	const prepared = await prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "explicit-opt-in"),
		{
			anchorId: comparisonId,
			all: false,
			reviewCaseIds: ["working-expansion-11.slate-02"],
			workingExpansionManifestPath,
		},
	))
	assert.deepEqual({
		candidateCount: prepared.candidateCount,
		reviewNeededCount: prepared.reviewNeededCount,
		queuedCount: prepared.queuedCount,
		warehouseUsed: prepared.warehouseUsed,
	}, {
		candidateCount: 1,
		reviewNeededCount: 1,
		queuedCount: 1,
		warehouseUsed: false,
	})
	const manifest = await readManifest(prepared.manifestPath)
	assert.equal(manifest.mode, "pairwise")
	if (manifest.mode !== "pairwise") throw new Error("Expected pairwise working-expansion fixture")
	assert.deepEqual(manifest.cases.map(({ caseId }) => caseId), ["working-expansion-11.slate-02"])
	assert.deepEqual(manifest.cases[0].source, {
		file: "04/ab67616d0000b27300041272670218ce2846bb53",
		sha256: "8fb979d4794012b8b84e61f6680fb601ab043132ffe46391016f6bbb806dbf95",
		bytes: 169766,
	})
	assert.equal(manifest.cases[0].options.A.roles.accent.hex, novelFlat.accent.hex)
	assert.equal(manifest.cases[0].options.B.roles.background.hex, anchor.background.hex)
})

test("working-expansion preparation rejects manifest tampering and normalized source path changes", async (context) => {
	const input = await workingExpansionFixture(context)
	const tamperedManifest = JSON.parse(await readFile(workingExpansionManifestPath, "utf8")) as {
		manifestId: string
	}
	tamperedManifest.manifestId = "0".repeat(64)
	const tamperedManifestPath = join(input.root, "tampered-working-expansion.json")
	await json(tamperedManifestPath, tamperedManifest)
	await assert.rejects(() => prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "tampered-manifest"),
		{
			anchorId: comparisonId,
			all: false,
			reviewCaseIds: ["working-expansion-11.slate-02"],
			workingExpansionManifestPath: tamperedManifestPath,
		},
	)), /does not exactly match/u)

	const artifactPath = join(input.iterationDirectory, "working-expansion-11.json")
	const changedPath = JSON.parse(await readFile(artifactPath, "utf8")) as {
		source: { file?: string }
	}
	changedPath.source.file = "04/not-the-pinned-source"
	await json(artifactPath, changedPath)
	await assert.rejects(() => prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "changed-source-path"),
		{
			anchorId: comparisonId,
			all: false,
			reviewCaseIds: ["working-expansion-11.slate-02"],
			workingExpansionManifestPath,
		},
	)), /conflicts with its development-panel source binding/u)
})

test("pairwise preparation groups duplicates, skips unchanged output, preserves custody and resumes feedback", async (context) => {
	const input = await fixture(context)
	const outputDirectory = join(input.root, "review", "bounded")
	const prepared = await prepareAlbumArtworkPaletteV2Phase3Review(options(input, outputDirectory, {
		all: false,
		maximumCases: 16,
	}))
	assert.deepEqual({
		candidateCount: prepared.candidateCount,
		reviewNeededCount: prepared.reviewNeededCount,
		queuedCount: prepared.queuedCount,
		deferredByBoundCount: prepared.deferredByBoundCount,
		warehouseUsed: prepared.warehouseUsed,
	}, {
		candidateCount: 4,
		reviewNeededCount: 4,
		queuedCount: 2,
		deferredByBoundCount: 2,
		warehouseUsed: false,
	})
	const manifest = await readManifest(prepared.manifestPath)
	assert.equal(manifest.mode, "pairwise")
	assert.equal(manifest.blinded, false)
	assert.deepEqual(manifest.cases.map(({ caseId }) => caseId), [
		"development-01.winner",
		"development-02.slate-02",
	])
	assert.equal(new Set(manifest.cases.map(({ source }) => source.sha256)).size, manifest.cases.length)
	if (manifest.mode !== "pairwise") throw new Error("Expected pairwise fixture")
	assert.deepEqual(manifest.cases[0].assignment, { A: "candidate", B: "anchor" })
	assert.equal(manifest.cases[0].options.A.roles.accent.generated, true)
	assert.equal(manifest.cases[0].options.A.collapse.surface, false)
	assert.equal(manifest.cases[0].options.A.gradient, false)
	assert.deepEqual(manifest.cases[0].source, {
		file: "images/one.jpg",
		sha256: createHash("sha256").update("synthetic-artwork-one").digest("hex"),
		bytes: Buffer.byteLength("synthetic-artwork-one"),
	})
	const emptyFeedback = parseCompletePaletteReviewFeedbackStore(
		JSON.parse(await readFile(prepared.feedbackPath, "utf8")) as unknown,
		manifest,
	)
	assert.deepEqual(emptyFeedback.entries, [])
	const resumed = {
		...emptyFeedback,
		entries: [{
			caseId: manifest.cases[0].caseId,
			sourceSha256: manifest.cases[0].source.sha256,
			qualityA: "strong",
			qualityB: "acceptable",
			comparison: "a-stronger",
			issuesA: [],
			issuesB: [],
			comment: "keep this response",
			submittedAt: "2026-07-28T00:00:00.000Z",
		}],
	}
	await json(prepared.feedbackPath, resumed)
	const rerun = await prepareAlbumArtworkPaletteV2Phase3Review(options(input, outputDirectory, {
		all: false,
		maximumCases: 16,
	}))
	assert.equal(rerun.resumedFeedbackCount, 1)
	assert.equal((JSON.parse(await readFile(prepared.feedbackPath, "utf8")) as typeof resumed).entries[0].comment,
		"keep this response")
})

test("exact compatible minimal-review evidence avoids duplicate review and --all retains the remaining slate", async (context) => {
	const input = await fixture(context)
	const firstOutput = join(input.root, "review", "report-source")
	await prepareAlbumArtworkPaletteV2Phase3Review(options(input, firstOutput))
	const report = JSON.parse(await readFile(join(firstOutput, "minimal-review.json"), "utf8")) as {
		candidateCount: number
		excludedCount: number
		reviewNeededCount: number
		reviewWorkAvoidedCount: number
		entries: Array<Record<string, unknown>>
	}
	report.entries[0] = {
		...report.entries[0],
		status: "exact-evidence-reused",
		reviewNeeded: false,
		exactQualities: ["strong"],
	}
	report.reviewNeededCount -= 1
	report.reviewWorkAvoidedCount += 1
	const consumedReportPath = join(input.root, "minimal-review-consumed.json")
	await json(consumedReportPath, report)
	const outputDirectory = join(input.root, "review", "reused")
	const prepared = await prepareAlbumArtworkPaletteV2Phase3Review(options(input, outputDirectory, {
		minimalReviewReportPath: consumedReportPath,
	}))
	assert.equal(prepared.warehouseUsed, true)
	assert.equal(prepared.reusedOrExcludedCount, 1)
	assert.equal(prepared.queuedCount, 3)
	const manifest = await readManifest(prepared.manifestPath)
	assert.deepEqual(manifest.cases.map(({ caseId }) => caseId), [
		"development-02.slate-02",
		"development-01.slate-03",
		"development-01.slate-04",
	])
	assert.deepEqual(JSON.parse(await readFile(prepared.minimalReviewReportPath, "utf8")), report)

	const bounded = await prepareAlbumArtworkPaletteV2Phase3Review(options(input, join(input.root, "review", "reused-bounded"), {
		all: false,
		maximumCases: 16,
		minimalReviewReportPath: consumedReportPath,
	}))
	assert.equal(bounded.queuedCount, 2)
	assert.equal(bounded.deferredByBoundCount, 1)
	const boundedManifest = await readManifest(bounded.manifestPath)
	assert.deepEqual(boundedManifest.cases.map(({ caseId }) => caseId), [
		"development-02.slate-02",
		"development-01.slate-03",
	])
	const boundedReport = JSON.parse(await readFile(bounded.minimalReviewReportPath, "utf8")) as {
		candidateCount: number
		entries: unknown[]
	}
	assert.equal(boundedReport.candidateCount, 4)
	assert.equal(boundedReport.entries.length, 4)
	await assert.rejects(() => prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "explicit-resolved"),
		{
			all: false,
			reviewCaseIds: ["development-01.winner"],
			minimalReviewReportPath: consumedReportPath,
		},
	)), /unavailable or already resolved/u)
})

test("absolute mode emits the candidate treatment without an anchor option", async (context) => {
	const input = await fixture(context)
	const prepared = await prepareAlbumArtworkPaletteV2Phase3Review(options(input, join(input.root, "review", "absolute"), {
		mode: "absolute",
		all: false,
		maximumCases: 1,
	}))
	const manifest = await readManifest(prepared.manifestPath)
	assert.equal(manifest.mode, "absolute")
	if (manifest.mode !== "absolute") throw new Error("Expected absolute fixture")
	assert.equal(manifest.cases[0].treatment.roles.accent.hex, "#d00000")
	assert.equal("options" in manifest.cases[0], false)
})

test("pairwise mode can use another aligned attempt as its comparison anchor", async (context) => {
	const input = await fixture(context)
	const prepared = await prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "attempt-anchor"),
		{ anchorId: comparisonId, all: false, maximumCases: 1 },
	))
	const manifest = await readManifest(prepared.manifestPath)
	if (manifest.mode !== "pairwise") throw new Error("Expected pairwise fixture")
	assert.equal(manifest.cases[0].options.B.roles.background.hex, "#121212")
	assert.deepEqual(manifest.cases[0].assignment, { A: "candidate", B: "anchor" })
})

test("exact-foreground-carrier is explicit and pairs the sole reserved slate addition with its carrier", async (context) => {
	const input = await exactCarrierFixture(context)
	const reviewCaseIds = ["development-01.slate-03"]
	const defaultPreparation = await prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "default-anchor"),
		{ anchorId: comparisonId, all: false, reviewCaseIds },
	))
	const defaultManifest = await readManifest(defaultPreparation.manifestPath)
	if (defaultManifest.mode !== "pairwise") throw new Error("Expected pairwise default fixture")
	assert.equal(defaultManifest.cases[0].options.A.roles.foreground.hex, exactReserve.foreground.hex)
	assert.equal(defaultManifest.cases[0].options.B.roles.foreground.hex, anchor.foreground.hex)

	const exactPreparation = await prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "exact-anchor"),
		{
			anchorId: comparisonId,
			all: false,
			reviewCaseIds,
			pairwiseSlateAnchor: "exact-foreground-carrier",
		},
	))
	assert.deepEqual({
		candidateCount: exactPreparation.candidateCount,
		reviewNeededCount: exactPreparation.reviewNeededCount,
		queuedCount: exactPreparation.queuedCount,
	}, { candidateCount: 1, reviewNeededCount: 1, queuedCount: 1 })
	const exactManifest = await readManifest(exactPreparation.manifestPath)
	if (exactManifest.mode !== "pairwise") throw new Error("Expected pairwise exact-carrier fixture")
	assert.deepEqual(exactManifest.cases.map(({ caseId }) => caseId), reviewCaseIds)
	assert.equal(exactManifest.cases[0].options.A.roles.foreground.hex, exactReserve.foreground.hex)
	assert.equal(exactManifest.cases[0].options.B.roles.foreground.hex, exactCarrier.foreground.hex)
	assert.equal(exactManifest.cases[0].options.A.roles.background.hex,
		exactManifest.cases[0].options.B.roles.background.hex)
	assert.deepEqual(exactManifest.cases[0].source, {
		file: "images/exact.jpg",
		sha256: createHash("sha256").update("synthetic-exact-carrier-artwork").digest("hex"),
		bytes: Buffer.byteLength("synthetic-exact-carrier-artwork"),
	})

	await assert.rejects(() => prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "absolute-invalid"),
		{ mode: "absolute", pairwiseSlateAnchor: "exact-foreground-carrier" },
	)), /valid only in pairwise mode/u)
	await assert.rejects(() => prepareAlbumArtworkPaletteV2Phase3Review({
		...options(input, join(input.root, "review", "unsupported-value")),
		pairwiseSlateAnchor: "winner" as never,
	}), /must be exact-foreground-carrier/u)
})

test("exact-foreground-carrier rejects missing, stale, wrong-carrier, structural, and winner tampering", async (context) => {
	const rejectTamper = async (
		child: TestContext,
		name: string,
		mutate: (attempt: MutableExactCarrierArtifact["attempts"][number]) => void,
		pattern: RegExp,
	): Promise<void> => {
		const input = await exactCarrierFixture(child)
		const artifactValue = JSON.parse(await readFile(input.artifactPath, "utf8")) as MutableExactCarrierArtifact
		const attempt = artifactValue.attempts.find(({ identity }) => identity.attemptId === candidateId)
		assert.ok(attempt)
		mutate(attempt)
		await json(input.artifactPath, artifactValue)
		await assert.rejects(() => prepareAlbumArtworkPaletteV2Phase3Review(options(
			input,
			join(input.root, "review", name),
			{
				anchorId: comparisonId,
				all: false,
				reviewCaseIds: ["development-01.slate-03"],
				pairwiseSlateAnchor: "exact-foreground-carrier",
			},
		)), pattern)
	}

	await context.test("missing diagnostics", async (child) => rejectTamper(child, "missing", (attempt) => {
		delete attempt.output.diagnostics
	}, /diagnostics are missing/u))
	await context.test("unsupported diagnostics", async (child) => rejectTamper(child, "unsupported", (attempt) => {
		attempt.output.diagnostics!.phase3SourceLightForegroundReserve.version = "unsupported"
	}, /stale or unsupported/u))
	await context.test("wrong carrier", async (child) => rejectTamper(child, "wrong-carrier", (attempt) => {
		const reserve = attempt.output.diagnostics!.phase3SourceLightForegroundReserve.sourceLightForegroundReserve
		reserve.outcome.reservedCarrierKey = treatmentKey(anchor)
		reserve.outcome.reservedCarrierIndex = 0
		reserve.candidates[0].carrierKey = treatmentKey(anchor)
		reserve.candidates[0].carrierIndex = 0
	}, /candidate and carrier differ/u))
	await context.test("raw treatment structure", async (child) => rejectTamper(child, "structure", (attempt) => {
		const reserved = attempt.output.alternatives.find(({ key }) => key === treatmentKey(exactReserve))!
		reserved.treatment = {
			...reserved.treatment,
			familyRoles: { ...reserved.treatment.familyRoles, surface: "tampered-surface-family" },
		}
	}, /differ in surface family or hex/u))
	await context.test("winner change", async (child) => rejectTamper(child, "winner", (attempt) => {
		const reserved = attempt.output.alternatives.find(({ key }) => key === treatmentKey(exactReserve))!
		attempt.output.winner = structuredClone(reserved)
		attempt.materialDelta.winner.candidateKey = reserved.key
		attempt.materialDelta.winner.changed = true
		attempt.output.diagnostics!.phase3SourceLightForegroundReserve.sourceLightForegroundReserve.outcome.winnerKey =
			reserved.key
	}, /cannot use a winner change as a slate task/u))
})

test("explicit review cases accept multiple treatments per source and preserve requested order", async (context) => {
	const input = await fixture(context)
	const prepared = await prepareAlbumArtworkPaletteV2Phase3Review(options(input, join(input.root, "review", "explicit"), {
		all: false,
		reviewCaseIds: ["development-01.slate-04", "development-01.winner", "development-02.slate-02"],
	}))
	const manifest = await readManifest(prepared.manifestPath)
	assert.deepEqual(manifest.cases.map(({ caseId }) => caseId), [
		"development-01.slate-04",
		"development-01.winner",
		"development-02.slate-02",
	])
	assert.equal(prepared.queuedCount, 3)
	assert.equal(new Set(manifest.cases.map(({ source }) => source.sha256)).size, 2)
})
