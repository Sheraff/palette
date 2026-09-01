import assert from "node:assert/strict"
import { lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"
import { contrastRatio, okDistance, rgbToHex, rgbToOKLab } from "../src/color.ts"
import { computeSemanticResultsSha256 } from "../src/corpus-selection.ts"
import { paretoObjectiveOrder, type ParetoPaletteCertificate } from "../src/pareto-palette.ts"
import {
	PARETO_BASELINE_VERSION,
	PARETO_EXPERIMENT_VERSION,
} from "../src/pareto-extract.ts"
import {
	beginExperimentOutput,
	computeParetoCertificateSemanticSha256,
	paretoArtifactNames,
	paretoImplementationFiles,
	resolveExperimentOutput,
	runParetoExperiment,
	sha256,
	validateParetoExperimentDirectory,
	type ParetoCertificateArtifact,
	type ParetoExperimentManifest,
} from "../src/pareto-experiment.ts"
import type { CorpusResult, Palette, RGB } from "../src/types.ts"

const generatedAt = "2026-07-19T00:00:00.000Z"

function role(rgb: RGB) {
	return { rgb, hex: rgbToHex(rgb), generated: false, sourceDistance: 0 }
}

function palette() {
	const background = role([255, 255, 255])
	const foreground = role([0, 0, 0])
	const surface = role([240, 240, 240])
	const accent = role([0, 0, 255])
	return {
		background,
		foreground,
		surface,
		accent,
		gradient: { isGradient: false, confidence: 1, coverage: 0, continuity: 0, coherence: 0 },
		score: 1,
		metrics: {
			foregroundContrast: contrastRatio(background.rgb, foreground.rgb),
			foregroundSurfaceContrast: contrastRatio(surface.rgb, foreground.rgb),
			accentContrast: contrastRatio(background.rgb, accent.rgb),
			accentSurfaceContrast: contrastRatio(surface.rgb, accent.rgb),
			minimumRoleDistance: 0.1,
			meanSourceDistance: 0,
			meanReconstructionError: 0,
		},
	}
}

function certificateForPalette(selectedPalette: Palette): ParetoPaletteCertificate {
	const roles = Object.fromEntries(["background", "foreground", "surface", "accent"].map((name) => {
		const role = selectedPalette[name as keyof Pick<Palette, "background" | "foreground" | "surface" | "accent">]
		return [name, `${role.hex.toLowerCase()}${role.generated ? "!" : ""}`]
	})) as ParetoPaletteCertificate["frontierSummaries"][number]["roles"]
	const surfaceModel = "field" as const
	const semanticKey = `${roles.background}:${roles.foreground}:${roles.surface}:${roles.accent}:${surfaceModel}`
	const objectiveVector = [1, 1, 1, 1, 1] as const
	const regret = [0, 0, 0, 0, 0] as const
	const accentBackgroundDistance = okDistance(rgbToOKLab(selectedPalette.accent.rgb), rgbToOKLab(selectedPalette.background.rgb))
	const accentSurfaceDistance = okDistance(rgbToOKLab(selectedPalette.accent.rgb), rgbToOKLab(selectedPalette.surface.rgb))
	return {
		counts: { attempted: 1, feasible: 1, frontier: 1, dominated: 0 },
		objectiveOrder: paretoObjectiveOrder,
		selected: {
			semanticKey,
			objectiveVector,
			objectiveComponents: {
				background: { coherentField: 1, frameRisk: 0, value: 1 },
				foreground: { typographyEvidence: 1, identity: 1, source: 1, value: 1 },
				surface: { model: surfaceModel, fieldEvidence: 1, gradientEvidence: 0, collapseEvidence: 0, value: 1 },
				accent: { identity: 1, visibility: 1, value: 1 },
				salientIdentityCoverage: { coveredWeight: 1, totalWeight: 1, value: 1 },
			},
			regret,
			lexicographicRegret: regret,
			gates: {
				foregroundBackground: { actual: selectedPalette.metrics.foregroundContrast, required: 3 },
				foregroundSurface: { actual: selectedPalette.metrics.foregroundSurfaceContrast, required: 2.5 },
				accentBackground: { actual: selectedPalette.metrics.accentContrast, required: 1.2 },
				accentBackgroundDistance,
				accentSurfaceDistance,
				generatedFallbackNecessary: selectedPalette.foreground.generated,
			},
		},
		frontierSummaries: [{
			semanticKey,
			roles,
			surfaceModel,
			objectiveVector,
			regret,
			lexicographicRegret: regret,
		}],
		selectionRule: "lexicographic-minimax-regret-then-semantic-key",
		gradientHandling: {
			kind: "local-current-pixel-evidence",
			description: "Fixture local gradient evidence.",
			limitation: "Fixture limitation.",
		},
	}
}

function extraction(version: string) {
	const colors: RGB[] = [[255, 255, 255], [0, 0, 0], [240, 240, 240], [0, 0, 255]]
	const candidates = colors.map((rgb) => ({
		rgb,
		hex: rgbToHex(rgb),
		population: 0.25,
		background: 0.25,
		saliency: 0.25,
		text: 0.25,
		chroma: 0.1,
	}))
	return {
		version,
		width: 1,
		height: 1,
		methods: { spatial: palette(), expressive: palette(), quantized: palette() },
		candidates,
		diagnostics: { regionCount: 1, candidateCount: candidates.length, processingMs: 0 },
	}
}

function corpus(version: string, cohort: "development" | "holdout"): CorpusResult {
	const count = cohort === "development" ? 37 : 355
	return {
		generatedAt,
		algorithmVersion: version,
		entries: Array.from({ length: count }, (_, index) => ({
			file: cohort === "development"
				? `development-${index}.jpg`
				: `00/${index.toString().padStart(40, "0")}.jpg`,
			kind: cohort === "development" ? "artwork" as const : "holdout" as const,
			review: cohort === "development",
			width: 1,
			height: 1,
			extraction: extraction(version),
		})),
	}
}

async function writeJson(path: string, value: unknown): Promise<Uint8Array> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
	return readFile(path)
}

async function createValidationFixture(): Promise<{
	root: string
	researchRoot: string
	projectRoot: string
	directory: string
	implementationFiles: string[]
}> {
	const root = await mkdtemp(join(tmpdir(), "palette-pareto-experiment-"))
	const projectRoot = join(root, "project")
	const researchRoot = join(projectRoot, "research")
	const directory = join(researchRoot, "data", "experiments", "valid-run")
	await mkdir(directory, { recursive: true })
	await mkdir(join(projectRoot, "images"), { recursive: true })
	await mkdir(join(projectRoot, "00"), { recursive: true })

	const developmentBaseline = corpus(PARETO_BASELINE_VERSION, "development")
	const holdoutBaseline = corpus(PARETO_BASELINE_VERSION, "holdout")
	const development = corpus(PARETO_EXPERIMENT_VERSION, "development")
	const holdout = corpus(PARETO_EXPERIMENT_VERSION, "holdout")
	const sourceHashes: Record<string, string> = {}
	for (const entry of [...development.entries, ...holdout.entries]) {
		const source = Buffer.from(`source:${entry.file}`)
		const path = entry.file.startsWith("00/")
			? join(projectRoot, entry.file)
			: join(projectRoot, "images", entry.file)
		await writeFile(path, source)
		sourceHashes[entry.file] = sha256(source)
	}

	const developmentBaselineBytes = await writeJson(join(researchRoot, "data", "results.json"), developmentBaseline)
	const holdoutBaselineBytes = await writeJson(join(researchRoot, "data", "holdout-results.json"), holdoutBaseline)
	const developmentCertificates: ParetoCertificateArtifact = {
		generatedAt,
		experimentVersion: PARETO_EXPERIMENT_VERSION,
		baselineAlgorithmVersion: PARETO_BASELINE_VERSION,
		cohort: "development",
		entries: development.entries.map((entry) => ({
			file: entry.file,
			kind: entry.kind,
			review: entry.review,
			width: entry.width,
			height: entry.height,
			sourceSha256: sourceHashes[entry.file],
			certificate: certificateForPalette(entry.extraction.methods.spatial),
		})),
	}
	const holdoutCertificates: ParetoCertificateArtifact = {
		generatedAt,
		experimentVersion: PARETO_EXPERIMENT_VERSION,
		baselineAlgorithmVersion: PARETO_BASELINE_VERSION,
		cohort: "holdout",
		entries: holdout.entries.map((entry) => ({
			file: entry.file,
			kind: entry.kind,
			review: entry.review,
			width: entry.width,
			height: entry.height,
			sourceSha256: sourceHashes[entry.file],
			certificate: certificateForPalette(entry.extraction.methods.spatial),
		})),
	}
	const artifacts = {
		"results.json": development,
		"holdout-results.json": holdout,
		"pareto-certificates.json": developmentCertificates,
		"holdout-pareto-certificates.json": holdoutCertificates,
	}
	const artifactHashes: Partial<Record<typeof paretoArtifactNames[number], string>> = {}
	for (const name of paretoArtifactNames) artifactHashes[name] = sha256(await writeJson(join(directory, name), artifacts[name]))
	const artifactSemanticHashes: Partial<Record<typeof paretoArtifactNames[number], string>> = {
		"results.json": computeSemanticResultsSha256(development),
		"holdout-results.json": computeSemanticResultsSha256(holdout),
		"pareto-certificates.json": computeParetoCertificateSemanticSha256(developmentCertificates),
		"holdout-pareto-certificates.json": computeParetoCertificateSemanticSha256(holdoutCertificates),
	}

	const implementationFiles = ["run.ts", "src/solver.ts"]
	const implementationHashes: Record<string, string> = {}
	await mkdir(join(researchRoot, "src"), { recursive: true })
	for (const file of implementationFiles) {
		const source = `implementation:${file}\n`
		await writeFile(join(researchRoot, file), source)
		implementationHashes[file] = sha256(source)
	}
	const manifest: ParetoExperimentManifest = {
		schemaVersion: 2,
		experimentVersion: PARETO_EXPERIMENT_VERSION,
		baselineAlgorithmVersion: PARETO_BASELINE_VERSION,
		command: ["node", "run-pareto-experiment.ts", "data/experiments/valid-run"],
		nodeVersion: process.version,
		startedAt: generatedAt,
		completedAt: "2026-07-19T00:01:00.000Z",
		baseline: {
			development: {
				file: "data/results.json",
				rawSha256: sha256(developmentBaselineBytes),
				semanticSha256: computeSemanticResultsSha256(developmentBaseline),
			},
			holdout: {
				file: "data/holdout-results.json",
				rawSha256: sha256(holdoutBaselineBytes),
				semanticSha256: computeSemanticResultsSha256(holdoutBaseline),
			},
		},
		sourceHashes,
		implementationHashes,
		artifactHashes,
		artifactSemanticHashes,
		completion: {
			state: "complete",
			developmentEntries: 37,
			holdoutEntries: 355,
			developmentCertificates: 37,
			holdoutCertificates: 355,
		},
		failure: null,
	}
	await writeJson(join(directory, "manifest.json"), manifest)
	return { root, researchRoot, projectRoot, directory, implementationFiles }
}

async function rewriteArtifact(
	directory: string,
	name: typeof paretoArtifactNames[number],
	mutate: (value: any) => void,
): Promise<void> {
	const artifactPath = join(directory, name)
	const artifact = JSON.parse(await readFile(artifactPath, "utf8"))
	mutate(artifact)
	const bytes = await writeJson(artifactPath, artifact)
	const manifestPath = join(directory, "manifest.json")
	const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ParetoExperimentManifest
	manifest.artifactHashes[name] = sha256(bytes)
	manifest.artifactSemanticHashes[name] = name.endsWith("certificates.json")
		? computeParetoCertificateSemanticSha256(artifact as ParetoCertificateArtifact)
		: computeSemanticResultsSha256(artifact as CorpusResult)
	await writeJson(manifestPath, manifest)
}

test("experiment output paths are confined to a named directory below data/experiments", () => {
	const researchRoot = resolve("/tmp/palette/research")
	assert.equal(
		resolveExperimentOutput(researchRoot, "data/experiments/pareto-1"),
		join(researchRoot, "data", "experiments", "pareto-1"),
	)
	assert.throws(() => resolveExperimentOutput(researchRoot, ""), /must not be empty/)
	assert.throws(() => resolveExperimentOutput(researchRoot, "data/experiments"), /exactly one direct child/)
	assert.throws(() => resolveExperimentOutput(researchRoot, "data/results.json"), /exactly one direct child/)
	assert.throws(() => resolveExperimentOutput(researchRoot, "../outside"), /exactly one direct child/)
	assert.throws(() => resolveExperimentOutput(researchRoot, "/tmp/outside"), /exactly one direct child/)
	assert.throws(() => resolveExperimentOutput(researchRoot, "data/experiments/nested/run"), /exactly one direct child/)
})

test("experiment staging refuses an existing output directory", async () => {
	const root = await mkdtemp(join(tmpdir(), "palette-pareto-overwrite-"))
	try {
		const researchRoot = join(root, "research")
		const output = join(researchRoot, "data", "experiments", "existing")
		await mkdir(output, { recursive: true })
		await assert.rejects(
			beginExperimentOutput(researchRoot, "data/experiments/existing"),
			/Refusing to overwrite existing experiment output/,
		)
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})

test("experiment staging does not create a missing experiments parent", async () => {
	const root = await mkdtemp(join(tmpdir(), "palette-pareto-missing-root-"))
	try {
		const researchRoot = join(root, "research")
		await mkdir(researchRoot)
		await assert.rejects(
			beginExperimentOutput(researchRoot, "data/experiments/run"),
			/must already exist as a real directory/,
		)
		await assert.rejects(lstat(join(researchRoot, "data")), { code: "ENOENT" })
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})

test("experiment staging rejects a symlinked experiments root", async () => {
	const root = await mkdtemp(join(tmpdir(), "palette-pareto-symlink-root-"))
	try {
		const researchRoot = join(root, "research")
		const outside = join(root, "outside-experiments")
		await mkdir(join(researchRoot, "data"), { recursive: true })
		await mkdir(outside)
		await symlink(outside, join(researchRoot, "data", "experiments"), "dir")
		await assert.rejects(
			beginExperimentOutput(researchRoot, "data/experiments/escaped"),
			/non-symlink directory/,
		)
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})

test("stale or broken experiment locks are rejected without weakening no-overwrite", async () => {
	const root = await mkdtemp(join(tmpdir(), "palette-pareto-stale-lock-"))
	try {
		const researchRoot = join(root, "research")
		const experimentsRoot = join(researchRoot, "data", "experiments")
		await mkdir(experimentsRoot, { recursive: true })
		const lockPath = join(experimentsRoot, ".run.lock")
		await writeFile(lockPath, "stale\n")
		await assert.rejects(
			beginExperimentOutput(researchRoot, "data/experiments/run"),
			/stale or broken locks/,
		)
		assert.equal(await readFile(lockPath, "utf8"), "stale\n")
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})

test("post-lock failures preserve staging and reliably release the owned lock", async () => {
	const root = await mkdtemp(join(tmpdir(), "palette-pareto-cleanup-"))
	try {
		const researchRoot = join(root, "research")
		const experimentsRoot = join(researchRoot, "data", "experiments")
		await mkdir(experimentsRoot, { recursive: true })
		await assert.rejects(
			runParetoExperiment({
				researchRoot,
				projectRoot: root,
				outputArgument: "data/experiments/run",
				command: ["node", "run-pareto-experiment.ts", "data/experiments/run"],
				extract: () => { throw new Error("not reached") },
			}),
			/Pareto experiment failed; staging attempt preserved/,
		)
		await assert.rejects(lstat(join(experimentsRoot, ".run.lock")), { code: "ENOENT" })
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})

test("completed experiment manifests and all bound hashes validate", async () => {
	const fixture = await createValidationFixture()
	try {
		const summary = await validateParetoExperimentDirectory(fixture.directory, fixture)
		assert.deepEqual(summary, {
			experimentVersion: PARETO_EXPERIMENT_VERSION,
			developmentEntries: 37,
			holdoutEntries: 355,
			developmentCertificates: 37,
			holdoutCertificates: 355,
		})

		await writeFile(join(fixture.directory, "results.json"), " \n", { flag: "a" })
		await assert.rejects(
			validateParetoExperimentDirectory(fixture.directory, fixture),
			/Artifact hash mismatch for results\.json/,
		)
	} finally {
		await rm(fixture.root, { recursive: true, force: true })
	}
})

test("incomplete experiment attempts are rejected before artifact acceptance", async () => {
	const fixture = await createValidationFixture()
	try {
		const manifestPath = join(fixture.directory, "manifest.json")
		const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ParetoExperimentManifest
		manifest.completion.state = "failed"
		manifest.failure = "Error: interrupted"
		await writeJson(manifestPath, manifest)
		await assert.rejects(
			validateParetoExperimentDirectory(fixture.directory, fixture),
			/Experiment is not complete: failed/,
		)
	} finally {
		await rm(fixture.root, { recursive: true, force: true })
	}
})

test("the experiment uses the fresh region-field-frontier identity and rejects an old manifest", async () => {
	assert.equal(PARETO_EXPERIMENT_VERSION, "region-field-frontier-0.1.0-poc.2")
	assert.ok(paretoImplementationFiles.includes("src/corpus-selection.ts"))
	assert.ok(paretoImplementationFiles.includes("src/candidate-validation.ts"))
	const fixture = await createValidationFixture()
	try {
		const manifestPath = join(fixture.directory, "manifest.json")
		const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
		manifest.experimentVersion = "region-pareto-0.5.0-poc.1"
		await writeJson(manifestPath, manifest)
		await assert.rejects(
			validateParetoExperimentDirectory(fixture.directory, fixture),
			/manifest version is invalid/,
		)
	} finally {
		await rm(fixture.root, { recursive: true, force: true })
	}
})

test("certificate surface models must match the emitted gradient and role identity", async () => {
	const fixture = await createValidationFixture()
	try {
		await rewriteArtifact(fixture.directory, "results.json", (artifact) => {
			artifact.entries[0].extraction.methods.spatial.gradient.isGradient = true
		})
		await assert.rejects(
			validateParetoExperimentDirectory(fixture.directory, fixture),
			/selected surface model differs from the corresponding result palette/,
		)
	} finally {
		await rm(fixture.root, { recursive: true, force: true })
	}
})

test("certificate artifacts must contain the concrete Pareto certificate schema", async () => {
	const fixture = await createValidationFixture()
	try {
		await rewriteArtifact(fixture.directory, "pareto-certificates.json", (artifact) => {
			delete artifact.entries[0].certificate.counts
		})
		await assert.rejects(
			validateParetoExperimentDirectory(fixture.directory, fixture),
			/certificate fields do not match the experiment schema/,
		)
	} finally {
		await rm(fixture.root, { recursive: true, force: true })
	}
})

test("certificate selected roles must match the corresponding result palette", async () => {
	const fixture = await createValidationFixture()
	try {
		await rewriteArtifact(fixture.directory, "pareto-certificates.json", (artifact) => {
			const certificate = artifact.entries[0].certificate
			certificate.frontierSummaries[0].roles.background = "#010101"
			const summary = certificate.frontierSummaries[0]
			summary.semanticKey = `${summary.roles.background}:${summary.roles.foreground}:${summary.roles.surface}:${summary.roles.accent}:${summary.surfaceModel}`
			certificate.selected.semanticKey = summary.semanticKey
		})
		await assert.rejects(
			validateParetoExperimentDirectory(fixture.directory, fixture),
			/selected background differs from the corresponding result palette/,
		)
	} finally {
		await rm(fixture.root, { recursive: true, force: true })
	}
})

test("certificate regret arithmetic and gate evidence must match the selected palette", async () => {
	const fixture = await createValidationFixture()
	try {
		await rewriteArtifact(fixture.directory, "pareto-certificates.json", (artifact) => {
			artifact.entries[0].certificate.selected.gates.foregroundBackground.actual = 20
		})
		await assert.rejects(
			validateParetoExperimentDirectory(fixture.directory, fixture),
			/selected gate evidence differs from the corresponding result palette/,
		)

		await rewriteArtifact(fixture.directory, "pareto-certificates.json", (artifact) => {
			artifact.entries[0].certificate.selected.gates.foregroundBackground.actual =
				artifact.entries[1].certificate.selected.gates.foregroundBackground.actual
			artifact.entries[0].certificate.selected.regret[0] = 0.1
			artifact.entries[0].certificate.selected.lexicographicRegret[0] = 0.1
			artifact.entries[0].certificate.frontierSummaries[0].regret[0] = 0.1
			artifact.entries[0].certificate.frontierSummaries[0].lexicographicRegret[0] = 0.1
		})
		await assert.rejects(
			validateParetoExperimentDirectory(fixture.directory, fixture),
			/invalid regret arithmetic/,
		)
	} finally {
		await rm(fixture.root, { recursive: true, force: true })
	}
})

test("expressive, quantized, shortlist, and structural controls must stay frozen", async () => {
	const fixture = await createValidationFixture()
	try {
		await rewriteArtifact(fixture.directory, "results.json", (artifact) => {
			artifact.entries[0].extraction.methods.expressive.score = 2
		})
		await assert.rejects(
			validateParetoExperimentDirectory(fixture.directory, fixture),
			/changed the frozen expressive control/,
		)
	} finally {
		await rm(fixture.root, { recursive: true, force: true })
	}
})

test("unexpected experiment bundle entries are rejected", async () => {
	const fixture = await createValidationFixture()
	try {
		await writeFile(join(fixture.directory, "notes.txt"), "unexpected\n")
		await assert.rejects(
			validateParetoExperimentDirectory(fixture.directory, fixture),
			/unexpected: notes\.txt/,
		)
	} finally {
		await rm(fixture.root, { recursive: true, force: true })
	}
})

test("symlinked bundle files are rejected instead of followed", async () => {
	const fixture = await createValidationFixture()
	try {
		const resultsPath = join(fixture.directory, "results.json")
		await rm(resultsPath)
		await symlink("holdout-results.json", resultsPath, "file")
		await assert.rejects(
			validateParetoExperimentDirectory(fixture.directory, fixture),
			/regular non-symlink file/,
		)
	} finally {
		await rm(fixture.root, { recursive: true, force: true })
	}
})

test("artifact timestamps must match the manifest start timestamp", async () => {
	const fixture = await createValidationFixture()
	try {
		await rewriteArtifact(fixture.directory, "results.json", (artifact) => {
			artifact.generatedAt = "2026-07-19T00:00:01.000Z"
		})
		await assert.rejects(
			validateParetoExperimentDirectory(fixture.directory, fixture),
			/Result artifact timestamps do not match/,
		)
	} finally {
		await rm(fixture.root, { recursive: true, force: true })
	}
})
