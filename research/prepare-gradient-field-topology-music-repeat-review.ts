import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import sharp from "sharp"
import { prepareOutputTarget, writeJsonAtomic } from "./src/candidate-output.ts"
import { decideGradientEligibility, GRADIENT_ELIGIBILITY_CANDIDATE_VERSION } from "./src/gradient-eligibility.ts"
import {
	GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY,
	scoreGradientFieldTopologyEvidence,
} from "./src/gradient-field-topology-model.ts"
import { GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION, type GradientFieldTopologyEvidence } from "./src/gradient-field-topology.ts"
import { REGION_GRAPH_0_17_ALGORITHM_VERSION as ALGORITHM_VERSION } from "./src/region-graph-0.17-extract.ts"
import type { GradientEligibilityEvidence } from "./src/gradient-eligibility.ts"
import type { Palette, RGB, RoleColor } from "./src/types.ts"

type HistoricalLabel = "should-be-gradient" | "should-not-be-gradient" | "either-way" | "uncertain"
type ReviewLabel = Exclude<HistoricalLabel, "uncertain"> | "no-visible-difference" | "selected-colors-not-identifiable"
type Source = { file: string; sha256: string; bytes: number; width: number; height: number }
type Color = { rgb: RGB; hex: string }
type PublicPalette = Record<"background" | "foreground" | "surface" | "accent", Color>
type RegistryEntry = {
	reviewBatch: string
	familyId: string
	sourceFile: string
	sourceSha256: string
	judgment: HistoricalLabel
	endpoints: { background: Color; surface: Color }
	evidence: GradientFieldTopologyEvidence
}
type PaletteEntry = {
	familyId: string
	anchor: { file: string; sha256: string; width: number; height: number }
	palette: Palette
	evidence: GradientEligibilityEvidence
}
type ManifestEntry = {
	familyId: string
	source: Source
	pairSha256: string
	endpoints: { background: Color; surface: Color }
	historicalLabel: HistoricalLabel
}
type Manifest = {
	schemaVersion: 1
	manifestVersion: string
	manifestId: string
	bindings: {
		protocol: { file: string; sha256: string }
		tooling: Record<string, string>
		development: { file: string; sha256: string; entries: number }
		fit: { file: string; sha256: string }
		paletteSource: { file: string; sha256: string }
		model: { modelVersion: string; evidenceVersion: string; parameterSha256: string; identitySha256: string;
			scorerSha256: string; evidenceSha256: string }
		canonical: { algorithmVersion: string; extractSha256: string }
		comparator: { candidateVersion: string; implementationSha256: string }
	}
	entries: ManifestEntry[]
	[key: string]: unknown
}
type EvaluationEntry = ManifestEntry & {
	palette: PublicPalette
	v3: ReturnType<typeof scoreGradientFieldTopologyEvidence>
	old086: ReturnType<typeof decideGradientEligibility>
	privateCell: string
	selected: boolean
	selectionLane: string | null
}
type Selected = { entry: EvaluationEntry; lane: string }

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const artifactRoot = resolve(researchRoot, "data/experiments/gradient-field-topology-3.0.0-music-repeat-review")
const manifestPath = join(artifactRoot, "manifest.json")
const evaluationPath = join(artifactRoot, "evaluation.json")
const reviewPath = join(artifactRoot, "review.json")
const htmlPath = join(artifactRoot, "review.html")
const renderPath = join(artifactRoot, "render.json")
const feedbackPath = join(artifactRoot, "feedback.json")
const interpretationPath = join(artifactRoot, "review-interpretation.json")
const analysisPath = join(artifactRoot, "analysis.json")
const protocolFile = "GRADIENT_FIELD_TOPOLOGY_MUSIC_REPEAT_REVIEW_3.md"
const developmentFile = "data/experiments/gradient-field-topology-3.0.0-development.json"
const fitFile = "data/experiments/gradient-field-topology-3.0.0-fit.json"
const paletteSourceFile = "data/experiments/gradient-eligibility-0.7.0-development.json"
const toolingFiles = [
	"prepare-gradient-field-topology-music-repeat-review.ts",
	"render-gradient-field-topology-music-repeat-review.ts",
	"serve-gradient-field-topology-music-repeat-review.ts",
] as const
const manifestVersion = "gradient-field-topology-3.0.0-music-repeat-manifest-1"
const evaluationVersion = "gradient-field-topology-3.0.0-music-repeat-evaluation-1"
const reviewVersion = "gradient-field-topology-3.0.0-music-repeat-review-1"
const intended: Record<Exclude<HistoricalLabel, "uncertain">, number> = {
	"should-be-gradient": 10,
	"should-not-be-gradient": 10,
	"either-way": 5,
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function record(value: unknown, label: string): Record<string, unknown> {
	if (!isRecord(value)) throw new Error(`${label} is invalid`)
	return value
}

function stringValue(value: unknown, label: string): string {
	if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is invalid`)
	return value
}

function shaValue(value: unknown, label: string): string {
	const result = stringValue(value, label)
	if (!/^[a-f0-9]{64}$/.test(result)) throw new Error(`${label} is not SHA-256`)
	return result
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
	const actual = Object.keys(value).sort()
	const wanted = [...expected].sort()
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
		throw new Error(`${label} has unexpected keys`)
	}
}

function pairSha256(sourceSha256: string, background: RGB, surface: RGB): string {
	return sha256(`${sourceSha256}\0${background.join(",")}\0${surface.join(",")}`)
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function publicColor(color: RoleColor): Color {
	return { rgb: color.rgb, hex: color.hex }
}

function publicPalette(palette: Palette): PublicPalette {
	return {
		background: publicColor(palette.background),
		foreground: publicColor(palette.foreground),
		surface: publicColor(palette.surface),
		accent: publicColor(palette.accent),
	}
}

function counts<T extends string>(values: readonly T[]): Partial<Record<T, number>> {
	const result: Partial<Record<T, number>> = {}
	for (const value of values) result[value] = (result[value] ?? 0) + 1
	return result
}

async function toolingHashes(): Promise<Record<string, string>> {
	return Object.fromEntries(await Promise.all(toolingFiles.map(async (file) =>
		[file, sha256(await readFile(join(researchRoot, file)))] as const)))
}

function parseDevelopment(value: unknown): RegistryEntry[] {
	const root = record(value, "Development artifact")
	if (!Array.isArray(root.entries) || root.entries.length !== 412) throw new Error("Development registry must have 412 entries")
	return root.entries as RegistryEntry[]
}

function parsePaletteSource(value: unknown): PaletteEntry[] {
	const root = record(value, "Palette source")
	if (!Array.isArray(root.entries)) throw new Error("Palette source entries are invalid")
	return root.entries as PaletteEntry[]
}

async function seal(): Promise<void> {
	await prepareOutputTarget({ path: manifestPath, refuseOverwrite: true })
	const [protocolSource, developmentSource, fitSource, paletteSource, scorerSource, evidenceSource, extractSource,
		comparatorSource, packageSource, tools] = await Promise.all([
		readFile(join(researchRoot, protocolFile)),
		readFile(join(researchRoot, developmentFile)),
		readFile(join(researchRoot, fitFile)),
		readFile(join(researchRoot, paletteSourceFile)),
		readFile(join(researchRoot, "src/gradient-field-topology-model.ts")),
		readFile(join(researchRoot, "src/gradient-field-topology.ts")),
		readFile(join(researchRoot, "src/region-graph-0.17-extract.ts")),
		readFile(join(researchRoot, "src/gradient-eligibility.ts")),
		readFile(resolve(projectRoot, "package.json")),
		toolingHashes(),
	])
	if (sha256(developmentSource) !== GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.trainingArtifactSha256 ||
		GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.parameterSha256 !==
			"98d0a0d89e83d1e66a211c05557db74467f13bf4cb1d99766a650f29178fbc11" ||
		GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION !== GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.evidenceVersion ||
		ALGORITHM_VERSION !== "region-graph-0.17.0") throw new Error("Frozen identity mismatch")
	const fit = record(JSON.parse(fitSource.toString("utf8")) as unknown, "Fit")
	if (!isDeepStrictEqual(fit.model, GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY)) throw new Error("Fit model differs from runtime scorer")
	const registry = parseDevelopment(JSON.parse(developmentSource.toString("utf8")) as unknown)
	const palettes = parsePaletteSource(JSON.parse(paletteSource.toString("utf8")) as unknown)
	const paletteByFamily = new Map(palettes.map((entry) => [entry.familyId, entry]))
	const music = registry.filter((entry) => entry.reviewBatch === "music")
	const historicalCounts = counts(music.map((entry) => entry.judgment))
	if (music.length !== 190 || !isDeepStrictEqual(historicalCounts, {
		"should-not-be-gradient": 86,
		"should-be-gradient": 65,
		uncertain: 1,
		"either-way": 38,
	})) throw new Error(`Unexpected music registry counts: ${JSON.stringify(historicalCounts)}`)
	const entries: ManifestEntry[] = []
	const pairs = new Set<string>()
	for (const entry of music) {
		if (!/^music-artworks\/[0-9a-f]\/[0-9a-f]\/[0-9a-f]\/[^/\\]+$/i.test(entry.sourceFile)) {
			throw new Error(`Music source is invalid: ${entry.sourceFile}`)
		}
		const paletteEntry = paletteByFamily.get(entry.familyId)
		if (!paletteEntry || paletteEntry.anchor.file !== entry.sourceFile || paletteEntry.anchor.sha256 !== entry.sourceSha256 ||
			!sameRgb(paletteEntry.palette.background.rgb, entry.endpoints.background.rgb) ||
			!sameRgb(paletteEntry.palette.surface.rgb, entry.endpoints.surface.rgb)) {
			throw new Error(`Palette provenance does not preserve exact pair ${entry.familyId}`)
		}
		const path = resolve(projectRoot, entry.sourceFile)
		const [bytes, sourceStat, metadata] = await Promise.all([readFile(path), stat(path), sharp(path).metadata()])
		if (!sourceStat.isFile() || sha256(bytes) !== entry.sourceSha256 || !metadata.width || !metadata.height ||
			metadata.width !== paletteEntry.anchor.width || metadata.height !== paletteEntry.anchor.height) {
			throw new Error(`Music source changed: ${entry.sourceFile}`)
		}
		const pair = pairSha256(entry.sourceSha256, entry.endpoints.background.rgb, entry.endpoints.surface.rgb)
		if (pairs.has(pair)) throw new Error(`Duplicate music exact pair ${pair}`)
		pairs.add(pair)
		entries.push({
			familyId: entry.familyId,
			source: { file: entry.sourceFile, sha256: entry.sourceSha256, bytes: sourceStat.size,
				width: metadata.width, height: metadata.height },
			pairSha256: pair,
			endpoints: entry.endpoints,
			historicalLabel: entry.judgment,
		})
	}
	const draft = {
		schemaVersion: 1,
		manifestVersion,
		generatedAt: new Date().toISOString(),
		purpose: "repeat-label-consistency-development-study",
		bindings: {
			protocol: { file: protocolFile, sha256: sha256(protocolSource) },
			tooling: tools,
			development: { file: developmentFile, sha256: sha256(developmentSource), entries: 412 },
			fit: { file: fitFile, sha256: sha256(fitSource) },
			paletteSource: { file: paletteSourceFile, sha256: sha256(paletteSource) },
			model: {
				modelVersion: GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.modelVersion,
				evidenceVersion: GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.evidenceVersion,
				parameterSha256: GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.parameterSha256,
				identitySha256: sha256(JSON.stringify(GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY)),
				scorerSha256: sha256(scorerSource),
				evidenceSha256: sha256(evidenceSource),
			},
			canonical: { algorithmVersion: ALGORITHM_VERSION, extractSha256: sha256(extractSource) },
			comparator: { candidateVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
				implementationSha256: sha256(comparatorSource) },
			packageJsonSha256: sha256(packageSource),
		},
		runtime: { node: process.version, nodeVersions: process.versions, sharpVersions: sharp.versions,
			platform: process.platform, arch: process.arch },
		summary: { registryEntries: registry.length, musicEntries: music.length, historicalLabels: historicalCounts,
			eligibleAfterUncertainExclusion: music.filter((entry) => entry.judgment !== "uncertain").length },
		entries,
	}
	const manifestId = sha256(JSON.stringify(draft))
	await writeJsonAtomic({ path: manifestPath, refuseOverwrite: true }, { ...draft, manifestId })
	process.stderr.write(`Sealed ${entries.length} music repeat-label registry pairs as ${manifestId}\n`)
}

function parseManifest(value: unknown): Manifest {
	const result = record(value, "Manifest")
	if (result.schemaVersion !== 1 || result.manifestVersion !== manifestVersion || !Array.isArray(result.entries) ||
		!isRecord(result.bindings)) throw new Error("Manifest is invalid")
	return result as Manifest
}

async function verifyManifest(manifest: Manifest, source: Buffer): Promise<void> {
	const { manifestId: _, ...draft } = manifest
	if (sha256(JSON.stringify(draft)) !== manifest.manifestId) throw new Error("Manifest ID is invalid")
	const bindings: Array<[string, string]> = [
		[manifest.bindings.protocol.file, manifest.bindings.protocol.sha256],
		...Object.entries(manifest.bindings.tooling),
		[manifest.bindings.development.file, manifest.bindings.development.sha256],
		[manifest.bindings.fit.file, manifest.bindings.fit.sha256],
		[manifest.bindings.paletteSource.file, manifest.bindings.paletteSource.sha256],
		["src/gradient-field-topology-model.ts", manifest.bindings.model.scorerSha256],
		["src/gradient-field-topology.ts", manifest.bindings.model.evidenceSha256],
		["src/extract.ts", manifest.bindings.canonical.extractSha256],
		["src/gradient-eligibility.ts", manifest.bindings.comparator.implementationSha256],
	]
	for (const [file, expected] of bindings) {
		if (sha256(await readFile(join(researchRoot, file))) !== expected) throw new Error(`Frozen binding changed: ${file}`)
	}
	if (manifest.bindings.model.identitySha256 !== sha256(JSON.stringify(GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY)) ||
		manifest.bindings.model.parameterSha256 !== GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.parameterSha256 ||
		manifest.bindings.canonical.algorithmVersion !== ALGORITHM_VERSION || sha256(source) !== sha256(await readFile(manifestPath))) {
		throw new Error("Manifest runtime identity is stale")
	}
}

function byMargin(first: EvaluationEntry, second: EvaluationEntry): number {
	return Math.abs(first.v3.margin) - Math.abs(second.v3.margin) || first.pairSha256.localeCompare(second.pairSha256, "en")
}

function selectDecisive(pool: EvaluationEntry[], label: "should-be-gradient" | "should-not-be-gradient"): Selected[] {
	if (pool.length < 10) throw new Error(`Historical ${label} pool has only ${pool.length} entries`)
	const expected = label === "should-be-gradient"
	const selected: Selected[] = []
	const used = new Set<string>()
	const add = (entry: EvaluationEntry, lane: string): void => {
		used.add(entry.pairSha256)
		selected.push({ entry, lane })
	}
	const disagreements = pool.filter((entry) => entry.v3.eligible !== expected)
		.sort((first, second) => first.pairSha256.localeCompare(second.pairSha256, "en"))
	for (const entry of disagreements.slice(0, 5)) add(entry, "v3-disagreement-pair-hash")
	const remaining = 10 - selected.length
	const nearestCount = Math.ceil(remaining / 2)
	const nearest = pool.filter((entry) => !used.has(entry.pairSha256)).sort(byMargin).slice(0, nearestCount)
	for (const entry of nearest) add(entry, "nearest-margin")
	const hash = pool.filter((entry) => !used.has(entry.pairSha256))
		.sort((first, second) => first.pairSha256.localeCompare(second.pairSha256, "en")).slice(0, 10 - selected.length)
	for (const entry of hash) add(entry, "pair-hash")
	if (selected.length !== 10) throw new Error(`Could not fill ${label} allocation`)
	return selected
}

function selectEither(pool: EvaluationEntry[]): Selected[] {
	if (pool.length < 5) throw new Error("Historical either-way pool cannot fill five cases")
	const groups = [pool.filter((entry) => entry.v3.eligible), pool.filter((entry) => !entry.v3.eligible)]
	const selected: Selected[] = []
	const used = new Set<string>()
	const add = (entry: EvaluationEntry, lane: string): void => {
		if (!used.has(entry.pairSha256)) {
			used.add(entry.pairSha256)
			selected.push({ entry, lane })
		}
	}
	if (groups.every((group) => group.length >= 2)) {
		for (const group of groups) {
			add([...group].sort(byMargin)[0], "either-outcome-nearest")
			const hash = group.filter((entry) => !used.has(entry.pairSha256))
				.sort((first, second) => first.pairSha256.localeCompare(second.pairSha256, "en"))[0]
			add(hash, "either-outcome-pair-hash")
		}
		add(pool.filter((entry) => !used.has(entry.pairSha256)).sort(byMargin)[0], "either-fifth-nearest")
	} else {
		const scarce = groups.find((group) => group.length < 2)!
		for (const entry of scarce.sort((first, second) => first.pairSha256.localeCompare(second.pairSha256, "en"))) {
			add(entry, "either-scarce-outcome-all")
		}
		let nearest = true
		while (selected.length < 5) {
			const remaining = pool.filter((entry) => !used.has(entry.pairSha256))
			const entry = nearest ? remaining.sort(byMargin)[0] :
				remaining.sort((first, second) => first.pairSha256.localeCompare(second.pairSha256, "en"))[0]
			if (!entry) throw new Error("Either-way balancing exhausted")
			add(entry, nearest ? "either-fill-nearest" : "either-fill-pair-hash")
			nearest = !nearest
		}
	}
	if (selected.length !== 5) throw new Error("Either-way selection did not produce five cases")
	return selected
}

async function prepare(): Promise<void> {
	await Promise.all([
		prepareOutputTarget({ path: evaluationPath, refuseOverwrite: true }),
		prepareOutputTarget({ path: reviewPath, refuseOverwrite: true }),
	])
	const manifestSource = await readFile(manifestPath)
	const manifest = parseManifest(JSON.parse(manifestSource.toString("utf8")) as unknown)
	await verifyManifest(manifest, manifestSource)
	const [developmentSource, paletteSource] = await Promise.all([
		readFile(join(researchRoot, manifest.bindings.development.file)),
		readFile(join(researchRoot, manifest.bindings.paletteSource.file)),
	])
	const registry = parseDevelopment(JSON.parse(developmentSource.toString("utf8")) as unknown)
	const registryByFamily = new Map(registry.map((entry) => [entry.familyId, entry]))
	const palettes = parsePaletteSource(JSON.parse(paletteSource.toString("utf8")) as unknown)
	const paletteByFamily = new Map(palettes.map((entry) => [entry.familyId, entry]))
	const evaluated: EvaluationEntry[] = []
	for (const sealed of manifest.entries) {
		const registryEntry = registryByFamily.get(sealed.familyId)
		const paletteEntry = paletteByFamily.get(sealed.familyId)
		if (!registryEntry || !paletteEntry || registryEntry.reviewBatch !== "music" ||
			registryEntry.judgment !== sealed.historicalLabel || registryEntry.sourceSha256 !== sealed.source.sha256 ||
			pairSha256(registryEntry.sourceSha256, registryEntry.endpoints.background.rgb,
				registryEntry.endpoints.surface.rgb) !== sealed.pairSha256 ||
			!sameRgb(paletteEntry.palette.background.rgb, sealed.endpoints.background.rgb) ||
			!sameRgb(paletteEntry.palette.surface.rgb, sealed.endpoints.surface.rgb)) {
			throw new Error(`Registry or palette binding changed for ${sealed.familyId}`)
		}
		const bytes = await readFile(resolve(projectRoot, sealed.source.file))
		if (bytes.byteLength !== sealed.source.bytes || sha256(bytes) !== sealed.source.sha256) {
			throw new Error(`Sealed music source changed: ${sealed.source.file}`)
		}
		const v3 = scoreGradientFieldTopologyEvidence(registryEntry.evidence)
		const old086 = decideGradientEligibility(paletteEntry.evidence)
		evaluated.push({
			...sealed,
			palette: publicPalette(paletteEntry.palette),
			v3,
			old086,
			privateCell: `${sealed.historicalLabel}/${v3.eligible ? "v3-gradient" : "v3-flat"}`,
			selected: false,
			selectionLane: null,
		})
	}
	const eligible = evaluated.filter((entry) => entry.historicalLabel !== "uncertain")
	if (eligible.length !== 189) throw new Error(`Expected 189 eligible music labels, received ${eligible.length}`)
	const selected = [
		...selectDecisive(eligible.filter((entry) => entry.historicalLabel === "should-be-gradient"), "should-be-gradient"),
		...selectDecisive(eligible.filter((entry) => entry.historicalLabel === "should-not-be-gradient"), "should-not-be-gradient"),
		...selectEither(eligible.filter((entry) => entry.historicalLabel === "either-way")),
	]
	for (const item of selected) {
		item.entry.selected = true
		item.entry.selectionLane = item.lane
	}
	const actualLabels = counts(selected.map((item) => item.entry.historicalLabel))
	if (!isDeepStrictEqual(actualLabels, intended)) throw new Error(`Selection allocation mismatch: ${JSON.stringify(actualLabels)}`)
	const evaluation = {
		schemaVersion: 1,
		evaluationVersion,
		generatedAt: new Date().toISOString(),
		manifestId: manifest.manifestId,
		manifestSha256: sha256(manifestSource),
		developmentSha256: sha256(developmentSource),
		fitSha256: manifest.bindings.fit.sha256,
		paletteSourceSha256: sha256(paletteSource),
		modelIdentity: GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY,
		thresholdRefit: false,
		registryLabelsMutable: false,
		old086Recovery: "Recovered by applying the frozen 0.8.6 comparator to already-bound stored eligibility evidence; no historical label was rerun or altered.",
		summary: {
			registryMusic: evaluated.length,
			uncertainExcluded: evaluated.filter((entry) => entry.historicalLabel === "uncertain").length,
			eligible: eligible.length,
			eligibleHistoricalLabels: counts(eligible.map((entry) => entry.historicalLabel)),
			eligiblePrivateCells: counts(eligible.map((entry) => entry.privateCell)),
			selected: selected.length,
		},
		selection: {
			intended,
			actualHistoricalLabels: actualLabels,
			actualPrivateCells: counts(selected.map((item) => item.entry.privateCell)),
			actualLanes: counts(selected.map((item) => item.lane)),
			eitherV3Outcomes: counts(selected.filter((item) => item.entry.historicalLabel === "either-way")
				.map((item) => item.entry.v3.eligible ? "v3-gradient" : "v3-flat")),
			entries: selected.map((item) => ({ familyId: item.entry.familyId, pairSha256: item.entry.pairSha256,
				historicalLabel: item.entry.historicalLabel, privateCell: item.entry.privateCell, lane: item.lane,
				v3Eligible: item.entry.v3.eligible, absoluteMargin: Math.abs(item.entry.v3.margin) })),
		},
		entries: evaluated,
	}
	const evaluationSerialized = `${JSON.stringify(evaluation, null, 2)}\n`
	await writeJsonAtomic({ path: evaluationPath, refuseOverwrite: true }, evaluation)
	const reviewEntries = selected.map(({ entry }) => ({
		familyId: entry.familyId,
		anchor: { file: entry.source.file, sha256: entry.source.sha256, bytes: entry.source.bytes },
		pairSha256: entry.pairSha256,
		palette: entry.palette,
		gradientFirst: Number.parseInt(sha256(`${manifest.manifestId}\0${entry.pairSha256}\0gradient-first`).slice(0, 2), 16) % 2 === 0,
	})).sort((first, second) => sha256(`${manifest.manifestId}\0${first.pairSha256}\0order`).localeCompare(
		sha256(`${manifest.manifestId}\0${second.pairSha256}\0order`), "en"))
	await writeJsonAtomic({ path: reviewPath, refuseOverwrite: true }, {
		schemaVersion: 1,
		reviewVersion,
		generatedAt: new Date().toISOString(),
		manifestId: manifest.manifestId,
		provenance: {
			manifestSha256: sha256(manifestSource),
			evaluationSha256: sha256(evaluationSerialized),
			developmentSha256: manifest.bindings.development.sha256,
			modelFileSha256: manifest.bindings.model.scorerSha256,
			modelIdentitySha256: manifest.bindings.model.identitySha256,
			parameterSha256: manifest.bindings.model.parameterSha256,
		},
		entries: reviewEntries,
	})
	process.stderr.write("Prepared blinded 25-case music repeat-label review\n")
}

function matrix(rows: readonly string[], columns: readonly string[], entries: Array<{ historicalLabel: string; current: string }>): Record<string, Record<string, number>> {
	return Object.fromEntries(rows.map((row) => [row, Object.fromEntries(columns.map((column) =>
		[column, entries.filter((entry) => entry.historicalLabel === row && entry.current === column).length]))]))
}

async function analyze(feedbackArgument: string, interpretationArgument: string, outputArgument: string): Promise<void> {
	const output = resolve(outputArgument)
	await prepareOutputTarget({ path: output, refuseOverwrite: true })
	const [manifestSource, evaluationSource, reviewSource, renderSource, htmlSource, feedbackSource, interpretationSource] =
		await Promise.all([readFile(manifestPath), readFile(evaluationPath), readFile(reviewPath), readFile(renderPath),
			readFile(htmlPath), readFile(resolve(feedbackArgument)), readFile(resolve(interpretationArgument))])
	const manifest = parseManifest(JSON.parse(manifestSource.toString("utf8")) as unknown)
	await verifyManifest(manifest, manifestSource)
	const evaluation = record(JSON.parse(evaluationSource.toString("utf8")) as unknown, "Evaluation")
	const review = record(JSON.parse(reviewSource.toString("utf8")) as unknown, "Review")
	const render = record(JSON.parse(renderSource.toString("utf8")) as unknown, "Render")
	const feedback = record(JSON.parse(feedbackSource.toString("utf8")) as unknown, "Feedback")
	const interpretation = record(JSON.parse(interpretationSource.toString("utf8")) as unknown, "Interpretation")
	if (evaluation.manifestId !== manifest.manifestId || evaluation.manifestSha256 !== sha256(manifestSource) ||
		!isRecord(review.provenance) || review.provenance.manifestSha256 !== sha256(manifestSource) ||
		review.provenance.evaluationSha256 !== sha256(evaluationSource) || render.planSha256 !== sha256(reviewSource) ||
		render.htmlSha256 !== sha256(htmlSource) || feedback.reviewSha256 !== sha256(reviewSource) ||
		feedback.htmlSha256 !== sha256(htmlSource)) throw new Error("Repeat-review provenance chain is invalid")
	exactKeys(interpretation, ["schemaVersion", "recordedAt", "decisionScope", "reviewPurpose", "registryLabelsMutated",
		"reviewSha256", "htmlSha256", "feedbackSha256", "note"], "Interpretation")
	if (interpretation.schemaVersion !== 1 || interpretation.decisionScope !== "exact-directed-background-surface-pair" ||
		interpretation.reviewPurpose !== "repeat-label-consistency" || interpretation.registryLabelsMutated !== false ||
		interpretation.reviewSha256 !== sha256(reviewSource) || interpretation.htmlSha256 !== sha256(htmlSource) ||
		interpretation.feedbackSha256 !== sha256(feedbackSource) || typeof interpretation.recordedAt !== "string" ||
		!Number.isFinite(Date.parse(interpretation.recordedAt)) || typeof interpretation.note !== "string") {
		throw new Error("Interpretation is invalid or stale")
	}
	if (!Array.isArray(evaluation.entries) || !Array.isArray(review.entries) || review.entries.length !== 25 ||
		!Array.isArray(feedback.entries) || feedback.entries.length !== 25) throw new Error("Exactly 25 responses are required")
	const evaluated = new Map((evaluation.entries as EvaluationEntry[]).map((entry) => [entry.familyId, entry]))
	const planned = new Map((review.entries as Array<Record<string, unknown>>).map((entry) =>
		[stringValue(entry.familyId, "Review familyId"), entry]))
	const valid = new Set<ReviewLabel>(["should-be-gradient", "should-not-be-gradient", "either-way",
		"no-visible-difference", "selected-colors-not-identifiable"])
	const seen = new Set<string>()
	const entries = (feedback.entries as Array<Record<string, unknown>>).map((response) => {
		const familyId = stringValue(response.familyId, "Feedback familyId")
		const current = stringValue(response.decision, `Feedback ${familyId} decision`) as ReviewLabel
		const old = evaluated.get(familyId)
		const plan = planned.get(familyId)
		if (!old || !plan || seen.has(familyId) || !valid.has(current) || response.pairSha256 !== old.pairSha256 ||
			plan.pairSha256 !== old.pairSha256) throw new Error(`Feedback is invalid for ${familyId}`)
		seen.add(familyId)
		const oldTruth = old.historicalLabel === "should-be-gradient" ? true :
			old.historicalLabel === "should-not-be-gradient" ? false : null
		const repeatTruth = current === "should-be-gradient" ? true : current === "should-not-be-gradient" ? false : null
		return {
			familyId, pairSha256: old.pairSha256, historicalLabel: old.historicalLabel, current,
			v3Eligible: old.v3.eligible, old086Eligible: old.old086.eligible, privateCell: old.privateCell,
			selectionLane: old.selectionLane, historicalV3Correct: oldTruth === null ? null : old.v3.eligible === oldTruth,
			repeatV3Correct: repeatTruth === null ? null : old.v3.eligible === repeatTruth,
			comment: response.comment, submittedAt: response.submittedAt,
		}
	})
	if (seen.size !== 25) throw new Error("Feedback does not cover every planned case")
	const labels: ReviewLabel[] = ["should-be-gradient", "should-not-be-gradient", "either-way",
		"no-visible-difference", "selected-colors-not-identifiable"]
	const bothDecisive = entries.filter((entry) =>
		(entry.historicalLabel === "should-be-gradient" || entry.historicalLabel === "should-not-be-gradient") &&
		(entry.current === "should-be-gradient" || entry.current === "should-not-be-gradient"))
	const by = (field: "privateCell" | "selectionLane") => Object.fromEntries(
		[...new Set(entries.map((entry) => String(entry[field])))].sort().map((key) => [key, {
			cases: entries.filter((entry) => entry[field] === key).length,
			currentLabels: counts(entries.filter((entry) => entry[field] === key).map((entry) => entry.current)),
			exactAgreement: entries.filter((entry) => entry[field] === key && entry.historicalLabel === entry.current).length,
		}]))
	const historicalDecisive = entries.filter((entry) => entry.historicalLabel !== "either-way")
	const repeatDecisive = entries.filter((entry) => entry.current === "should-be-gradient" || entry.current === "should-not-be-gradient")
	await writeJsonAtomic({ path: output, refuseOverwrite: true }, {
		schemaVersion: 1,
		analysisVersion: "gradient-field-topology-3.0.0-music-repeat-analysis-1",
		generatedAt: new Date().toISOString(),
		registryLabelsMutated: false,
		thresholdRefit: false,
		interpretation,
		provenance: { manifestSha256: sha256(manifestSource), evaluationSha256: sha256(evaluationSource),
			reviewSha256: sha256(reviewSource), renderSha256: sha256(renderSource), htmlSha256: sha256(htmlSource),
			feedbackSha256: sha256(feedbackSource), interpretationSha256: sha256(interpretationSource) },
		summary: {
			cases: entries.length,
			agreementMatrix: matrix(labels, labels, entries),
			exactFiveWayAgreement: entries.filter((entry) => entry.historicalLabel === entry.current).length,
			bothDecisive: bothDecisive.length,
			decisiveRepeatAgreement: bothDecisive.filter((entry) => entry.historicalLabel === entry.current).length,
			decisiveToNondecisive: historicalDecisive.filter((entry) => entry.current !== "should-be-gradient" &&
				entry.current !== "should-not-be-gradient").length,
			gradientToFlatFlips: entries.filter((entry) => entry.historicalLabel === "should-be-gradient" &&
				entry.current === "should-not-be-gradient").length,
			flatToGradientFlips: entries.filter((entry) => entry.historicalLabel === "should-not-be-gradient" &&
				entry.current === "should-be-gradient").length,
			v3AgainstHistorical: { decisive: historicalDecisive.length,
				correct: historicalDecisive.filter((entry) => entry.historicalV3Correct).length },
			v3AgainstRepeat: { decisive: repeatDecisive.length,
				correct: repeatDecisive.filter((entry) => entry.repeatV3Correct).length },
			identifiabilityChanges: {
				newNoVisibleDifference: entries.filter((entry) => entry.current === "no-visible-difference").length,
				newSelectedColorsNotIdentifiable: entries.filter((entry) =>
					entry.current === "selected-colors-not-identifiable").length,
			},
			byPrivateCell: by("privateCell"),
			bySelectionLane: by("selectionLane"),
		},
		entries,
	})
	process.stderr.write("Analyzed 25/25 music repeat-label responses without mutating registry labels\n")
}

const [mode, ...arguments_] = process.argv.slice(2)
if (mode === "seal" && arguments_.length === 0) await seal()
else if (mode === "prepare" && arguments_.length === 0) await prepare()
else if (mode === "analyze" && arguments_.length <= 3) {
	await analyze(arguments_[0] ?? feedbackPath, arguments_[1] ?? interpretationPath, arguments_[2] ?? analysisPath)
} else {
	throw new Error("Usage: prepare-gradient-field-topology-music-repeat-review.ts seal | prepare | analyze [feedback.json] [review-interpretation.json] [analysis.json]")
}
