import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test, { type TestContext } from "node:test"
import {
	evaluateAlbumArtworkPaletteV2Phase3ParallelWave,
	parseAlbumArtworkPaletteV2Phase3ParallelWaveArguments,
	writeAlbumArtworkPaletteV2Phase3ParallelWaveEvaluation,
} from "../evaluate-album-artwork-palette-v2-phase-3-parallel-wave.ts"
import { normalizeTreatment } from "../tools/review-evidence/normalize.ts"
import { buildWarehouse } from "../tools/review-evidence/warehouse.ts"

const contractId = "album-artwork-palette-v2-phase-3-attempt-contract-v1"
const sourceSha256 = "79c0978816663e7f59002cd25147d89dfe8ecfad50f71e3411185517a929629b"
const source = {
	caseId: "development-01",
	sha256: sourceSha256,
	byteCount: 1802,
	artworkId: `exact:${sourceSha256}`,
	width: 100,
	height: 100,
}
const controlIdentity = { attemptId: "recovery-v3", configurationId: "recovery-v3-config" }
const armAIdentity = { attemptId: "parallel-arm-a", configurationId: "parallel-a-config" }
const armBIdentity = { attemptId: "parallel-arm-b", configurationId: "parallel-b-config" }

type Treatment = ReturnType<typeof treatment>

function role(hex: string, familyId: string, generated = false) {
	return {
		hex,
		generated,
		support: generated
			? { generated: true }
			: { exactSource: true, anchorFamilyId: familyId, regionIds: [`region:${familyId}`] },
	}
}

function treatment(
	id: string,
	values: readonly [string, string, string, string],
	options: Readonly<{
		gradient?: boolean
		fieldTreatment?: string
		fieldId?: string
		families?: readonly [string, string, string, string]
		generated?: readonly [boolean, boolean, boolean, boolean]
		topology?: string
		direction?: string
	}> = {},
) {
	const families = options.families ?? ["field-a", "field-a", "foreground-a", "accent-a"]
	const generated = options.generated ?? [false, false, false, false]
	const gradient = options.gradient ?? false
	return {
		id,
		roles: {
			background: role(values[0], families[0], generated[0]),
			surface: role(values[1], families[1], generated[1]),
			foreground: role(values[2], families[2], generated[2]),
			accent: role(values[3], families[3], generated[3]),
		},
		gradient,
		collapse: { surface: values[0] === values[1], accent: values[2] === values[3] },
		fieldTreatment: options.fieldTreatment ?? "one-field",
		sourceFieldHypothesisId: options.fieldId ?? "field-a",
		familyRoles: {
			background: families[0],
			surface: families[1],
			foreground: families[2],
			accent: families[3],
		},
		gradientEvidence: gradient ? {
			topology: options.topology ?? "linear",
			direction: options.direction ?? "vertical",
		} : null,
	}
}

const closedAnchor = treatment("closed-anchor", ["#050505", "#050505", "#eeeeee", "#eeeeee"])
const controlTreatment = treatment("control", ["#101010", "#101010", "#f0f0f0", "#f0f0f0"])
const accentTreatment = treatment("accent", ["#101010", "#101010", "#f0f0f0", "#ff0000"], {
	families: ["field-a", "field-a", "foreground-a", "accent-red"],
})
const gradientTreatment = treatment(
	"gradient:field-domain-1:linear:vertical:field-a:field-b:#101010:#303030",
	["#101010", "#303030", "#f0f0f0", "#f0f0f0"],
	{
		gradient: true,
		fieldTreatment: "gradient-field",
		fieldId: "gradient-field",
		families: ["field-a", "field-b", "foreground-a", "foreground-a"],
	},
)
const foregroundTreatment = treatment("foreground", ["#101010", "#101010", "#00ff00", "#f0f0f0"], {
	families: ["field-a", "field-a", "foreground-green", "accent-a"],
})
const gradientTreatmentTwo = treatment(
	"field-transition:second",
	["#121212", "#343434", "#f0f0f0", "#f0f0f0"],
	{
		gradient: true,
		fieldTreatment: "gradient-field",
		fieldId: "gradient-field-two",
		families: ["field-c", "field-d", "foreground-a", "foreground-a"],
		topology: "linear",
		direction: "horizontal",
	},
)
const emergencyTreatment = treatment(
	"emergency",
	["#101010", "#101010", "#ffffff", "#ffffff"],
	{ families: ["field-a", "field-a", "generated", "generated"], generated: [false, false, true, true] },
)
const warehouseBaseline = treatment("warehouse-baseline", ["#202020", "#202020", "#ffffff", "#ffffff"])

function normalized(value: Treatment) {
	const visible = normalizeTreatment(value).visible
	const key = [visible.roles.background, visible.roles.surface, visible.roles.foreground, visible.roles.accent]
		.map(({ rgb }) => `#${rgb.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`)
		.join(":") + (visible.gradient.enabled ? ":gradient" : ":flat")
	return { key, treatment: value }
}

function reviewTreatment(value: Treatment) {
	return { roles: value.roles, gradient: value.gradient, collapse: value.collapse }
}

function output(identity: { attemptId: string; configurationId: string }, values: readonly Treatment[]) {
	const entries = values.map(normalized)
	return {
		version: identity.attemptId,
		protocol: identity.configurationId,
		dimensions: { width: source.width, height: source.height },
		winner: entries[0],
		alternatives: entries,
		diagnostics: {
			phase3Fixture: {
				version: "phase-3-fixture-v1",
				configurationId: identity.configurationId,
				domain: { materializedTreatmentCount: values.length + 4 },
				selector: {
					domain: {
						materializedTreatmentCount: values.length + 4,
						uniqueTreatmentCount: values.length + 4,
					},
					evaluations: entries.map((entry, index) => ({
						key: entry.key,
						gradientStatus: entry.treatment.gradient ? "earned-rendered" : "not-applicable",
						identityCoverage: identity === controlIdentity ? 0.5 : 0.7 + index / 100,
					})),
					winner: {
						key: entries[0].key,
						gradientStatus: entries[0].treatment.gradient ? "earned-rendered" : "not-applicable",
						identityCoverage: identity === controlIdentity ? 0.5 : 0.7,
					},
					slate: entries.map((entry, index) => ({ key: entry.key, index })),
				},
				custody: {
					selected: entries.map((entry, index) => ({
						index,
						selectionKind: index === 0 ? "winner" : "custody-reserve",
						recoveryV2: { key: entry.key },
						sourceConnectedDescriptorLineage: true,
						sourceTypes: entry.treatment.gradient ? ["native-field-transition"] : ["closed-0.7.4-seed"],
						coveredRoleObligationIds: [`role-${index}`],
						novelDimensions: index === 0 ? ["winner"] : [`mechanism-${index}`],
					})),
				},
			},
		},
	}
}

function attempt(identity: { attemptId: string; configurationId: string }, values: readonly Treatment[], wallMs: number) {
	return {
		identity,
		output: output(identity, values),
		runtime: { wallMs, cpuUserMs: wallMs / 2, cpuSystemMs: 1 },
		materialDelta: { identity: "synthetic" },
	}
}

async function json(path: string, value: unknown): Promise<void> {
	await mkdir(join(path, ".."), { recursive: true })
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function wave(
	root: string,
	iterationId: string,
	identities: readonly { attemptId: string; configurationId: string }[],
	attempts: readonly ReturnType<typeof attempt>[],
	sha = sourceSha256,
): Promise<string> {
	const directory = join(root, iterationId)
	await mkdir(directory, { recursive: true })
	const caseSource = { ...source, sha256: sha, artworkId: `exact:${sha}` }
	await json(join(directory, `${source.caseId}.json`), {
		schemaVersion: 1,
		contractId,
		source: caseSource,
		anchor: { identity: { anchorId: "closed-0.7.4" }, output: output(
			{ attemptId: "closed", configurationId: "closed-config" }, [closedAnchor],
		) },
		attempts,
	})
	await json(join(directory, "iteration.json"), {
		schemaVersion: 1,
		contractId,
		iterationId,
		workerCount: 1,
		caseIds: [source.caseId],
		attempts: identities,
		runtime: { node: "synthetic", platform: "test", architecture: "test" },
		sources: [{
			caseId: source.caseId,
			sourceSha256: sha,
			file: `${source.caseId}.json`,
			materialDeltas: identities.map((identity) => ({ identity, materialDelta: { identity: "synthetic" } })),
		}],
	})
	return directory
}

async function fixture(context: TestContext, mismatchedSource = false) {
	const root = await mkdtemp(join(tmpdir(), "phase-3-parallel-wave-"))
	context.after(async () => rm(root, { recursive: true, force: true }))
	const controlDirectory = await wave(root, "control-wave", [controlIdentity], [
		attempt(controlIdentity, [controlTreatment], 10),
	])
	const armDirectory = await wave(root, "parallel-arms", [armAIdentity, armBIdentity], [
		attempt(armAIdentity, [accentTreatment, gradientTreatment, gradientTreatmentTwo, foregroundTreatment], 35),
		attempt(armBIdentity, [accentTreatment, gradientTreatment, gradientTreatmentTwo, foregroundTreatment], 36),
	], mismatchedSource ? "2".repeat(64) : sourceSha256)
	return { root, controlDirectory, armDirectory }
}

function options(input: Awaited<ReturnType<typeof fixture>>, warehousePath?: string) {
	return {
		iterationDirectories: [input.armDirectory, input.controlDirectory],
		controlAttempt: "recovery-v3@recovery-v3-config",
		attempts: ["parallel-arm-b", "parallel-arm-a@parallel-a-config"],
		...(warehousePath ? { warehousePath, presentationVersion: "current-v1" } : {}),
	}
}

async function warehouse(root: string): Promise<string> {
	const data = join(root, "warehouse-project", "research", "data")
	const exactExperiment = join(data, "experiments", "album-artwork-palette-v2-parallel-exact")
	const oldExperiment = join(data, "experiments", "album-artwork-palette-v2-parallel-old-render")
	await json(join(exactExperiment, "review-manifest.private.json"), {
		schemaVersion: 1,
		reviewVersion: "parallel-exact-v1",
		presentationVersion: "current-v1",
		manifestId: "parallel-exact-manifest",
		cases: [
			{
				caseId: "accent-case",
				source: { file: "images/source.jpg", sha256: sourceSha256 },
				options: { A: reviewTreatment(accentTreatment), B: reviewTreatment(warehouseBaseline) },
				assignment: { A: "candidate", B: "baseline" },
			},
			{
				caseId: "gradient-case",
				source: { file: "images/source.jpg", sha256: sourceSha256 },
				options: { A: reviewTreatment(gradientTreatment), B: reviewTreatment(warehouseBaseline) },
				assignment: { A: "candidate", B: "baseline" },
			},
			{
				caseId: "gradient-case-two",
				source: { file: "images/source.jpg", sha256: sourceSha256 },
				options: { A: reviewTreatment(gradientTreatmentTwo), B: reviewTreatment(warehouseBaseline) },
				assignment: { A: "candidate", B: "baseline" },
			},
		],
	})
	await json(join(oldExperiment, "review-manifest.private.json"), {
		schemaVersion: 1,
		reviewVersion: "parallel-old-v1",
		presentationVersion: "old-v1",
		manifestId: "parallel-old-manifest",
		cases: [{
			caseId: "foreground-case",
			source: { file: "images/source.jpg", sha256: sourceSha256 },
			options: { A: reviewTreatment(foregroundTreatment), B: reviewTreatment(warehouseBaseline) },
			assignment: { A: "candidate", B: "baseline" },
		}],
	})
	await json(join(data, "album-artwork-palette-v2-parallel-exact-one-feedback.json"), {
		schemaVersion: 1,
		reviewVersion: "parallel-exact-v1",
		manifestId: "parallel-exact-manifest",
		entries: [
			{ caseId: "accent-case", sourceSha256, qualityA: "strong", qualityB: "acceptable",
				comparison: "a-stronger", issuesA: [], issuesB: [], comment: "reusable accent", submittedAt: "2026-01-01T00:00:00Z" },
			{ caseId: "gradient-case", sourceSha256, qualityA: "strong", qualityB: "acceptable",
				comparison: "a-stronger", issuesA: [], issuesB: [], comment: "gradient one", submittedAt: "2026-01-01T00:00:00Z" },
			{ caseId: "gradient-case-two", sourceSha256, qualityA: "strong", qualityB: "acceptable",
				comparison: "a-stronger", issuesA: [], issuesB: [], comment: "gradient two", submittedAt: "2026-01-01T00:00:00Z" },
		],
	})
	await json(join(data, "album-artwork-palette-v2-parallel-exact-two-feedback.json"), {
		schemaVersion: 1,
		reviewVersion: "parallel-exact-v1",
		manifestId: "parallel-exact-manifest",
		entries: [{ caseId: "gradient-case", sourceSha256, qualityA: "unacceptable", qualityB: "acceptable",
			comparison: "b-stronger", issuesA: ["gradient"], issuesB: [], comment: "gradient conflict", submittedAt: "2026-01-02T00:00:00Z" },
			{ caseId: "gradient-case-two", sourceSha256, qualityA: "unacceptable", qualityB: "acceptable",
				comparison: "b-stronger", issuesA: ["gradient"], issuesB: [], comment: "gradient conflict two", submittedAt: "2026-01-02T00:00:00Z" }],
	})
	await json(join(data, "album-artwork-palette-v2-parallel-old-feedback.json"), {
		schemaVersion: 1,
		reviewVersion: "parallel-old-v1",
		manifestId: "parallel-old-manifest",
		entries: [{ caseId: "foreground-case", sourceSha256, qualityA: "strong", qualityB: "acceptable",
			comparison: "a-stronger", issuesA: [], issuesB: [], comment: "old render only", submittedAt: "2026-01-03T00:00:00Z" }],
	})
	await json(join(data, "album-artwork-palette-v2-development-panel.json"), {
		schemaVersion: 1,
		sourceCount: 1,
		sources: [{ caseId: source.caseId, path: "images/source.jpg", sha256: sourceSha256,
			artworkId: source.artworkId, byteCount: source.byteCount }],
	})
	const projectRoot = join(root, "warehouse-project")
	const databasePath = join(projectRoot, "warehouse.sqlite")
	await buildWarehouse({ projectRoot, databasePath })
	return databasePath
}

test("rejects case-sensitive source identity misalignment across parallel waves", async (context) => {
	const input = await fixture(context, true)
	await assert.rejects(() => evaluateAlbumArtworkPaletteV2Phase3ParallelWave(options(input)),
		/Source identity mismatch for case development-01/u)
})

test("rejects a source not bound to the authorized Phase 3 development panel", async (context) => {
	const root = await mkdtemp(join(tmpdir(), "phase-3-parallel-wave-unauthorized-"))
	context.after(async () => rm(root, { recursive: true, force: true }))
	const sha = "3".repeat(64)
	const controlDirectory = await wave(root, "control-wave", [controlIdentity], [
		attempt(controlIdentity, [controlTreatment], 10),
	], sha)
	const armDirectory = await wave(root, "arm-wave", [armAIdentity], [
		attempt(armAIdentity, [accentTreatment], 11),
	], sha)
	await assert.rejects(() => evaluateAlbumArtworkPaletteV2Phase3ParallelWave({
		iterationDirectories: [controlDirectory, armDirectory],
		controlAttempt: controlIdentity.attemptId,
		attempts: [armAIdentity.attemptId],
	}), /not bound to the authorized Phase 3 development panel/u)
})

test("groups exact arm outputs and emits per-case deltas against the explicit attempt control", async (context) => {
	const input = await fixture(context)
	const repeatedControlDirectory = await wave(input.root, "repeated-control-wave", [controlIdentity], [
		attempt(controlIdentity, [controlTreatment], 12),
	])
	const evaluationOptions = {
		...options(input),
		iterationDirectories: [input.armDirectory, repeatedControlDirectory, input.controlDirectory],
	}
	const report = await evaluateAlbumArtworkPaletteV2Phase3ParallelWave(evaluationOptions)
	const repeated = await evaluateAlbumArtworkPaletteV2Phase3ParallelWave(evaluationOptions)
	assert.deepEqual(repeated, report)
	assert.deepEqual((report.causalComparison as { control: unknown }).control, controlIdentity)
	const result = (report.cases as Array<Record<string, unknown>>)[0]
	assert.equal(((result.control as Record<string, unknown>).runtimeReplicates as unknown[]).length, 2)
	const groups = result.exactOutputGroups as Array<Record<string, unknown>>
	assert.equal(groups.length, 2)
	assert.deepEqual(groups.map((group) => (group.attempts as unknown[]).length).sort(), [1, 2])
	const attempts = result.attempts as Array<Record<string, unknown>>
	assert.equal((attempts[0].exactDelta as Record<string, unknown>).winnerChanged, true)
	assert.equal((attempts[1].exactDelta as Record<string, unknown>).outputGroupId,
		(attempts[0].exactDelta as Record<string, unknown>).outputGroupId)
	const controlWinner = normalizeTreatment(controlTreatment)
	assert.equal((attempts[0].exactDelta as Record<string, unknown>).controlWinner,
		`${controlWinner.treatmentIdentity}\0${controlWinner.renderVariantId}`)
	const flags = attempts[0].mechanismFlags as Array<Record<string, unknown>>
	assert.deepEqual(flags.map(({ mechanism }) => mechanism), [
		"domain-membership", "winner", "slate", "source-custody", "role-coverage", "gradient-status", "lineage", "runtime",
	])
	assert.deepEqual((flags.find(({ mechanism }) => mechanism === "runtime")!.reasons as string[]),
		["wall-runtime-over-3x-control"])
})

test("joins evidence conflict-safely and keeps materially distinct same-source review questions", async (context) => {
	const input = await fixture(context)
	const databasePath = await warehouse(input.root)
	await assert.rejects(() => evaluateAlbumArtworkPaletteV2Phase3ParallelWave({
		...options(input),
		warehousePath: databasePath,
	}), /warehouse evidence join requires an explicit presentation version/iu)
	const report = await evaluateAlbumArtworkPaletteV2Phase3ParallelWave(options(input, databasePath))
	const evidence = report.evidence as Record<string, unknown>
	assert.equal(evidence.joined, true)
	assert.equal(evidence.readOnly, true)
	assert.equal(evidence.reviewWorkAvoidedCount, 1)
	assert.equal((evidence.artworkContext as unknown[]).length, 1)
	const proposal = report.reviewProposal as Record<string, unknown>
	const candidates = proposal.candidates as Array<Record<string, unknown>>
	assert.equal(candidates.length, 3)
	assert.equal(new Set(candidates.map(({ sourceSha256 }) => sourceSha256)).size, 1)
	assert.deepEqual(candidates.map((candidate) => (candidate.evidence as Record<string, unknown>).status).sort(),
		["conflicting-exact-evidence", "conflicting-exact-evidence", "incompatible-render-variant"])
	assert.equal(candidates.filter((candidate) =>
		(candidate.evidence as Record<string, unknown>).status === "conflicting-exact-evidence").length, 2)
	assert.ok(candidates.some((candidate) => (candidate.unresolvedMechanisms as string[]).includes("evidence-conflict")))
	assert.ok(candidates.some((candidate) => (candidate.unresolvedMechanisms as string[]).includes("render-compatibility")))
	assert.deepEqual((proposal.resolvedByEvidence as Array<Record<string, unknown>>).map(({ status }) => status),
		["exact-evidence-reused"])
})

test("projects a winner overlay from a base selector and exact rescue diagnostics before custody index", async (context) => {
	const root = await mkdtemp(join(tmpdir(), "phase-3-parallel-wave-overlay-"))
	context.after(async () => rm(root, { recursive: true, force: true }))
	const controlDirectory = await wave(root, "control-wave", [controlIdentity], [
		attempt(controlIdentity, [controlTreatment], 10),
	])
	const overlayAttempt = attempt(armAIdentity, [gradientTreatment, controlTreatment], 12)
	const fixtureDiagnostics = overlayAttempt.output.diagnostics.phase3Fixture
	overlayAttempt.output.diagnostics = {
		phase3IntegratedFixture: {
			version: "phase-3-integrated-fixture-v1",
			configurationId: armAIdentity.configurationId,
			domain: fixtureDiagnostics.domain,
			baseSelector: fixtureDiagnostics.selector,
			custody: {
				selected: fixtureDiagnostics.custody.selected.slice(1),
			},
			transitionRescue: {
				candidates: [{
					key: normalized(gradientTreatment).key,
					sourceConnected: true,
					sourceTypes: ["native-field-transition"],
				}],
			},
			selection: { winnerLineageBasis: "ordinary-complete-source-lineage" },
		},
	}
	const armDirectory = await wave(root, "overlay-wave", [armAIdentity], [overlayAttempt])
	const report = await evaluateAlbumArtworkPaletteV2Phase3ParallelWave({
		iterationDirectories: [controlDirectory, armDirectory],
		controlAttempt: controlIdentity.attemptId,
		attempts: [armAIdentity.attemptId],
	})
	const result = (report.cases as Array<Record<string, unknown>>)[0]
	const candidate = (result.attempts as Array<Record<string, unknown>>)[0]
	const stages = candidate.stages as Record<string, unknown>
	const domain = stages.domainMembership as Record<string, unknown>
	const gradient = stages.gradientStatus as { winner: { status: string | null } }
	const lineage = stages.lineage as { winner: { sourceConnected: boolean | null; sourceTypes: string[] } }
	assert.equal(domain.winnerInEvaluatedDomain, true)
	assert.equal(domain.slateInEvaluatedDomain, true)
	assert.equal(gradient.winner.status, "earned-rendered")
	assert.equal(lineage.winner.sourceConnected, true)
	assert.deepEqual(lineage.winner.sourceTypes, ["native-field-transition"])
	assert.equal((lineage.winner as { basis?: string }).basis, "ordinary-complete-source-lineage")
	assert.equal(((stages.winner as Record<string, unknown>).diagnostic as Record<string, unknown>).key,
		normalized(gradientTreatment).key)
	const flags = candidate.mechanismFlags as Array<Record<string, unknown>>
	assert.equal(flags.find(({ mechanism }) => mechanism === "gradient-status")!.safety, "pass")
	assert.equal(flags.find(({ mechanism }) => mechanism === "lineage")!.safety, "pass")
})

test("separates a source-supported three-stop render from the same public two-stop treatment", async (context) => {
	const root = await mkdtemp(join(tmpdir(), "phase-3-parallel-wave-midpoint-"))
	context.after(async () => rm(root, { recursive: true, force: true }))
	const supportedIdentity = {
		attemptId: "phase-3-supported-gradient-path",
		configurationId: "supported-gradient-render-test-v2",
	}
	const controlDirectory = await wave(root, "control-wave", [controlIdentity], [
		attempt(controlIdentity, [gradientTreatment], 10),
	])
	const supportedAttempt = attempt(supportedIdentity, [gradientTreatment], 11)
	const fixtureDiagnostics = supportedAttempt.output.diagnostics.phase3Fixture
	const midpoint = {
		kind: "source-supported-three-stop",
		position: 0.5,
		color: { rgb: [24, 128, 167], oklab: [0.5, 0, 0], hex: "#1880a7" },
		provenance: {
			exactSource: true,
			familyId: "field-middle",
			regionId: "region-middle",
			pixelIndex: 304,
			x: 4,
			y: 3,
			fieldDomainId: "field-domain-1",
			stageIndex: 1,
			spatialPosition: 0.5,
			colorPosition: 0.5,
			populationFraction: 0.12,
		},
	}
	supportedAttempt.output.diagnostics = {
		phase3SupportedGradientPath: {
			version: "supported-gradient-fixture-v2",
			configurationId: supportedIdentity.configurationId,
			domain: fixtureDiagnostics.domain,
			selector: fixtureDiagnostics.selector,
			custody: fixtureDiagnostics.custody,
			selection: { winnerLineageBasis: "ordinary-complete-source-lineage" },
			gradientAuthority: {
				strictVetoApplied: false,
				projectedFlatSibling: false,
				baselineWinnerKey: normalized(gradientTreatment).key,
				winnerKey: normalized(gradientTreatment).key,
				correspondingPathIndex: 0,
				midpoint,
			},
			supportedGradientPath: {
				paths: [{
					eligible: true,
					hypothesisId: gradientTreatment.sourceFieldHypothesisId,
					midpointCustody: structuredClone(midpoint),
				}],
			},
		},
	}
	const armDirectory = await wave(root, "supported-wave", [supportedIdentity], [supportedAttempt])
	const report = await evaluateAlbumArtworkPaletteV2Phase3ParallelWave({
		iterationDirectories: [controlDirectory, armDirectory],
		controlAttempt: controlIdentity.attemptId,
		attempts: [supportedIdentity.attemptId],
	})
	const result = (report.cases as Array<Record<string, unknown>>)[0]
	assert.equal((result.exactOutputGroups as unknown[]).length, 2)
	const treatmentGroups = result.exactTreatmentGroups as Array<Record<string, unknown>>
	assert.equal(new Set(treatmentGroups.map(({ treatmentIdentity }) => treatmentIdentity)).size, 1)
	assert.equal(new Set(treatmentGroups.map(({ renderVariantId }) => renderVariantId)).size, 2)
	const candidate = (result.attempts as Array<Record<string, unknown>>)[0]
	assert.equal((candidate.exactDelta as Record<string, unknown>).winnerChanged, true)
	const gradientFlag = (candidate.mechanismFlags as Array<Record<string, unknown>>)
		.find(({ mechanism }) => mechanism === "gradient-status")
	assert.equal(gradientFlag?.safety, "pass")
	const proposal = report.reviewProposal as Record<string, unknown>
	const candidates = proposal.candidates as Array<Record<string, unknown>>
	assert.equal(candidates.length, 1)
	assert.ok((candidates[0].unresolvedMechanisms as string[]).includes("research-rendering"))
})

test("a declared normative one-color emergency is not reported as a lineage failure", async (context) => {
	const root = await mkdtemp(join(tmpdir(), "phase-3-parallel-wave-emergency-"))
	context.after(async () => rm(root, { recursive: true, force: true }))
	const emergencyIdentity = { attemptId: "emergency-arm", configurationId: "emergency-config" }
	const controlDirectory = await wave(root, "control-wave", [controlIdentity], [
		attempt(controlIdentity, [emergencyTreatment], 10),
	])
	const emergencyAttempt = attempt(emergencyIdentity, [emergencyTreatment], 11)
	const fixtureDiagnostics = emergencyAttempt.output.diagnostics.phase3Fixture
	emergencyAttempt.output.diagnostics = {
		phase3IntegratedFixture: {
			version: "phase-3-integrated-fixture-v1",
			configurationId: emergencyIdentity.configurationId,
			domain: fixtureDiagnostics.domain,
			selector: fixtureDiagnostics.selector,
			custody: {
				selected: fixtureDiagnostics.custody.selected.map((entry) => ({
					...entry,
					sourceConnectedDescriptorLineage: false,
				})),
			},
			selection: { winnerLineageBasis: "normative-one-color-emergency" },
		},
	}
	const armDirectory = await wave(root, "emergency-wave", [emergencyIdentity], [emergencyAttempt])
	const report = await evaluateAlbumArtworkPaletteV2Phase3ParallelWave({
		iterationDirectories: [controlDirectory, armDirectory],
		controlAttempt: controlIdentity.attemptId,
		attempts: [emergencyIdentity.attemptId],
	})
	const result = (report.cases as Array<Record<string, unknown>>)[0]
	const candidate = (result.attempts as Array<Record<string, unknown>>)[0]
	const lineage = (candidate.mechanismFlags as Array<Record<string, unknown>>)
		.find(({ mechanism }) => mechanism === "lineage")!
	assert.equal(lineage.safety, "pass")
	assert.deepEqual(lineage.reasons, ["normative-one-color-emergency"])
})

test("an ordinary treatment cannot self-declare a normative emergency", async (context) => {
	const root = await mkdtemp(join(tmpdir(), "phase-3-parallel-wave-false-emergency-"))
	context.after(async () => rm(root, { recursive: true, force: true }))
	const emergencyIdentity = { attemptId: "false-emergency-arm", configurationId: "false-emergency-config" }
	const controlDirectory = await wave(root, "control-wave", [controlIdentity], [attempt(controlIdentity, [controlTreatment], 10)])
	const candidateAttempt = attempt(emergencyIdentity, [controlTreatment], 11)
	const fixtureDiagnostics = candidateAttempt.output.diagnostics.phase3Fixture
	candidateAttempt.output.diagnostics = {
		phase3IntegratedFixture: {
			configurationId: emergencyIdentity.configurationId,
			domain: fixtureDiagnostics.domain,
			selector: fixtureDiagnostics.selector,
			custody: { selected: fixtureDiagnostics.custody.selected.map((entry) => ({
				...entry,
				sourceConnectedDescriptorLineage: false,
			})) },
			selection: { winnerLineageBasis: "normative-one-color-emergency" },
		},
	}
	const armDirectory = await wave(root, "false-emergency-wave", [emergencyIdentity], [candidateAttempt])
	const report = await evaluateAlbumArtworkPaletteV2Phase3ParallelWave({
		iterationDirectories: [controlDirectory, armDirectory],
		controlAttempt: controlIdentity.attemptId,
		attempts: [emergencyIdentity.attemptId],
	})
	const result = (report.cases as Array<Record<string, unknown>>)[0]
	const candidate = (result.attempts as Array<Record<string, unknown>>)[0]
	const flags = candidate.mechanismFlags as Array<Record<string, unknown>>
	for (const mechanism of ["source-custody", "lineage"]) {
		const flag = flags.find((entry) => entry.mechanism === mechanism)!
		assert.equal(flag.safety, "flag")
		assert.deepEqual(flag.reasons, ["invalid-normative-one-color-emergency"])
	}
})

test("rejects over-cap and non-winner-first public slates", async (context) => {
	const root = await mkdtemp(join(tmpdir(), "phase-3-parallel-wave-invalid-slate-"))
	context.after(async () => rm(root, { recursive: true, force: true }))
	const controlDirectory = await wave(root, "control-wave", [controlIdentity], [
		attempt(controlIdentity, [controlTreatment], 10),
	])
	const many = Array.from({ length: 9 }, (_, index) => {
		const byte = (32 + index).toString(16).padStart(2, "0")
		return treatment(`many-${index}`, [`#${byte}1010`, `#${byte}2020`, "#f0f0f0", "#e0e0e0"])
	})
	const overCapDirectory = await wave(root, "over-cap-wave", [armAIdentity], [attempt(armAIdentity, many, 11)])
	await assert.rejects(() => evaluateAlbumArtworkPaletteV2Phase3ParallelWave({
		iterationDirectories: [controlDirectory, overCapDirectory],
		controlAttempt: controlIdentity.attemptId,
		attempts: [armAIdentity.attemptId],
	}), /slate must contain 1 to 8 treatments/u)

	const malformed = attempt(armBIdentity, [accentTreatment, foregroundTreatment], 11)
	malformed.output.winner = normalized(foregroundTreatment)
	const malformedDirectory = await wave(root, "winner-order-wave", [armBIdentity], [malformed])
	await assert.rejects(() => evaluateAlbumArtworkPaletteV2Phase3ParallelWave({
		iterationDirectories: [controlDirectory, malformedDirectory],
		controlAttempt: controlIdentity.attemptId,
		attempts: [armBIdentity.attemptId],
	}), /winner is not the exact first slate treatment/u)
})

test("CLI requires an explicit output and writes no sibling artifacts", async (context) => {
	const input = await fixture(context)
	const outputDirectory = join(input.root, "output")
	await mkdir(outputDirectory)
	const outputPath = join(outputDirectory, "evaluation.json")
	const parsed = parseAlbumArtworkPaletteV2Phase3ParallelWaveArguments([
		"--wave", input.controlDirectory,
		"--iteration-directory", input.armDirectory,
		"--control", "recovery-v3",
		"--attempt", "parallel-arm-a",
		"--output", outputPath,
	])
	assert.equal(parsed.outputPath, outputPath)
	await writeAlbumArtworkPaletteV2Phase3ParallelWaveEvaluation(parsed)
	assert.deepEqual(await readdir(outputDirectory), ["evaluation.json"])
	const stored = JSON.parse(await readFile(outputPath, "utf8")) as Record<string, unknown>
	assert.equal(stored.reportId, "album-artwork-palette-v2-phase-3-parallel-wave-causal-evaluation-v1")
	assert.throws(() => parseAlbumArtworkPaletteV2Phase3ParallelWaveArguments([
		"--wave", input.controlDirectory, "--control", "recovery-v3", "--attempt", "parallel-arm-a",
	]), /Missing required --output/u)
})
