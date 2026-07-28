import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test, { type TestContext } from "node:test"
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

type RawTreatment = Readonly<{
	id: string
	background: Readonly<{ hex: string; generated: boolean }>
	surface: Readonly<{ hex: string; generated: boolean }>
	foreground: Readonly<{ hex: string; generated: boolean }>
	accent: Readonly<{ hex: string; generated: boolean }>
	gradient: boolean
	collapse: Readonly<{ surface: boolean; accent: boolean }>
}>

function treatment(
	id: string,
	values: readonly [string, string, string, string],
	options: Readonly<{ gradient?: boolean; generatedAccent?: boolean }> = {},
): RawTreatment {
	return {
		id,
		background: { hex: values[0], generated: false },
		surface: { hex: values[1], generated: false },
		foreground: { hex: values[2], generated: false },
		accent: { hex: values[3], generated: options.generatedAccent ?? false },
		gradient: options.gradient ?? false,
		collapse: { surface: values[0] === values[1], accent: values[2] === values[3] },
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

function normalized(key: string, value: RawTreatment) {
	return { key, treatment: value }
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

	const artifact = (source: typeof sources[number], candidateWinner: RawTreatment,
		candidateAlternatives: Array<Readonly<{ key: string; treatment: RawTreatment }>>) => {
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
			}],
		}
	}
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
		"--review-case", "development-02.slate-02",
		"--review-case", "development-01.slate-04",
	]).reviewCaseIds, ["development-02.slate-02", "development-01.slate-04"])
	assert.throws(() => parseAlbumArtworkPaletteV2Phase3ReviewArguments([
		"run", candidateId, anchorId, "pairwise", "review", "--all",
		"--review-case", "development-01.winner",
	]), /cannot be combined/u)
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

test("explicit review cases preserve requested order and reject duplicate artwork", async (context) => {
	const input = await fixture(context)
	const prepared = await prepareAlbumArtworkPaletteV2Phase3Review(options(input, join(input.root, "review", "explicit"), {
		all: false,
		reviewCaseIds: ["development-01.slate-04", "development-02.slate-02"],
	}))
	const manifest = await readManifest(prepared.manifestPath)
	assert.deepEqual(manifest.cases.map(({ caseId }) => caseId), [
		"development-01.slate-04",
		"development-02.slate-02",
	])
	assert.equal(prepared.queuedCount, 2)
	assert.equal(new Set(manifest.cases.map(({ source }) => source.sha256)).size, 2)
	await assert.rejects(() => prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "explicit-duplicate"),
		{
			all: false,
			reviewCaseIds: ["development-01.winner", "development-01.slate-03"],
		},
	)), /at most one treatment per source/u)
})
