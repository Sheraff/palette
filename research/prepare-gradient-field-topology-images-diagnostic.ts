import { createHash } from "node:crypto"
import { readdir, readFile, stat } from "node:fs/promises"
import { basename, extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { prepareOutputTarget, writeJsonAtomic } from "./src/candidate-output.ts"
import { extractGradientFieldTopologyPalette, GRADIENT_FIELD_TOPOLOGY_EXPERIMENT_VERSION } from "./src/gradient-field-topology-extract.ts"
import { GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY } from "./src/gradient-field-topology-model.ts"
import { GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION } from "./src/gradient-field-topology.ts"
import { loadImage } from "./src/image.ts"
import { REGION_GRAPH_0_17_ALGORITHM_VERSION as ALGORITHM_VERSION } from "./src/region-graph-0.17-extract.ts"
import type { Palette, RGB, RoleColor } from "./src/types.ts"

type Decision = "should-be-gradient" | "should-not-be-gradient" | "either-way" |
	"no-visible-difference" | "selected-colors-not-identifiable"
type Color = { rgb: RGB; hex: string }
type PublicPalette = Record<"background" | "foreground" | "surface" | "accent", Color>
type DiagnosticEntry = {
	familyId: string
	anchor: { file: string; sha256: string; bytes: number; width: number; height: number }
	normalized: { width: number; height: number }
	pairSha256: string
	directedPair: { background: Color; surface: Color }
	palette: PublicPalette
	canonicalGradient: boolean
	v3: { evaluated: boolean; eligible: boolean; reason: "scored" | "baseline-not-gradient";
		score: number | null; threshold: number; margin: number | null }
}
type Diagnostic = {
	schemaVersion: 1
	diagnosticVersion: string
	diagnosticId: string
	bindings: { protocol: { file: string; sha256: string }; tooling: Record<string, string>;
		implementation: Record<string, string>; canonicalVersion: string; experimentVersion: string; evidenceVersion: string;
		modelIdentity: typeof GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY; modelIdentitySha256: string; parameterSha256: string;
		packageJsonSha256: string }
	entries: DiagnosticEntry[]
	[key: string]: unknown
}

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const sourceRoot = resolve(projectRoot, "images")
const artifactRoot = resolve(researchRoot, "data/experiments/gradient-field-topology-3.0.0-images-diagnostic")
const diagnosticPath = join(artifactRoot, "diagnostic.json")
const htmlPath = join(artifactRoot, "diagnostic.html")
const renderPath = join(artifactRoot, "render.json")
const feedbackPath = join(artifactRoot, "feedback.json")
const analysisPath = join(artifactRoot, "analysis.json")
const protocolFile = "GRADIENT_FIELD_TOPOLOGY_IMAGES_DIAGNOSTIC_3.md"
const toolingFiles = [
	"prepare-gradient-field-topology-images-diagnostic.ts",
	"render-gradient-field-topology-images-diagnostic.ts",
	"serve-gradient-field-topology-images-diagnostic.ts",
] as const
const implementationFiles = [
	"src/region-graph-0.17-extract.ts",
	"src/gradient-field-topology-extract.ts",
	"src/gradient-field-topology-model.ts",
	"src/gradient-field-topology.ts",
] as const
const supported = new Set([".jpg", ".jpeg", ".png", ".avif", ".webp"])
const diagnosticVersion = "gradient-field-topology-3.0.0-images-diagnostic-1"

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

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
	const actual = Object.keys(value).sort(), wanted = [...expected].sort()
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(`${label} has unexpected keys`)
}

function pairSha256(sourceSha256: string, background: RGB, surface: RGB): string {
	return sha256(`${sourceSha256}\0${background.join(",")}\0${surface.join(",")}`)
}

function color(value: RoleColor): Color {
	return { rgb: value.rgb, hex: value.hex }
}

function palette(value: Palette): PublicPalette {
	return { background: color(value.background), foreground: color(value.foreground),
		surface: color(value.surface), accent: color(value.accent) }
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first[0] === second[0] && first[1] === second[1] && first[2] === second[2]
}

function counts<T extends string>(values: readonly T[]): Partial<Record<T, number>> {
	const result: Partial<Record<T, number>> = {}
	for (const value of values) result[value] = (result[value] ?? 0) + 1
	return result
}

async function hashes(files: readonly string[]): Promise<Record<string, string>> {
	return Object.fromEntries(await Promise.all(files.map(async (file) =>
		[file, sha256(await readFile(join(researchRoot, file)))] as const)))
}

async function prepare(): Promise<void> {
	await prepareOutputTarget({ path: diagnosticPath, refuseOverwrite: true })
	if (ALGORITHM_VERSION !== "region-graph-0.17.0" ||
		GRADIENT_FIELD_TOPOLOGY_EXPERIMENT_VERSION !== "gradient-field-topology-model-3.0.0-experimental" ||
		GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION !== GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.evidenceVersion ||
		GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.parameterSha256 !==
			"98d0a0d89e83d1e66a211c05557db74467f13bf4cb1d99766a650f29178fbc11") throw new Error("Frozen diagnostic identity mismatch")
	const [directory, protocolSource, tools, implementation, packageSource] = await Promise.all([
		readdir(sourceRoot, { withFileTypes: true }),
		readFile(join(researchRoot, protocolFile)),
		hashes(toolingFiles),
		hashes(implementationFiles),
		readFile(resolve(projectRoot, "package.json")),
	])
	const files = directory.filter((entry) => entry.isFile() && supported.has(extname(entry.name).toLowerCase()) &&
		!basename(entry.name, extname(entry.name)).includes("-"))
		.map((entry) => entry.name).sort((first, second) => first.localeCompare(second, "en"))
	if (files.length === 0) throw new Error("Mechanical base-image selection is empty")
	const entries: DiagnosticEntry[] = []
	const pairIdentities = new Set<string>()
	for (const file of files) {
		const path = join(sourceRoot, file)
		const [bytes, sourceStat, metadata] = await Promise.all([readFile(path), stat(path), sharp(path).metadata()])
		if (!sourceStat.isFile() || !metadata.width || !metadata.height) throw new Error(`Invalid base image: ${file}`)
		const sourceSha256 = sha256(bytes)
		const image = await loadImage(bytes)
		const result = extractGradientFieldTopologyPalette(image)
		const spatial = result.extraction.methods.spatial
		const certificate = result.certificate
		if (certificate.baselineGradient && (!certificate.directedEndpoints || !certificate.evidence ||
			!sameRgb(certificate.directedEndpoints.background.rgb, spatial.background.rgb) ||
			!sameRgb(certificate.directedEndpoints.surface.rgb, spatial.surface.rgb))) {
			throw new Error(`Evaluated directed endpoints changed for ${file}`)
		}
		if (!certificate.baselineGradient && (certificate.directedEndpoints !== null || certificate.evidence !== null ||
			certificate.decision.reason !== "baseline-not-gradient")) throw new Error(`Canonical-flat certificate is invalid for ${file}`)
		const pair = pairSha256(sourceSha256, spatial.background.rgb, spatial.surface.rgb)
		if (pairIdentities.has(pair)) throw new Error(`Duplicate base-image pair identity: ${file}`)
		pairIdentities.add(pair)
		entries.push({
			familyId: `image-${sha256(file).slice(0, 20)}`,
			anchor: { file: `images/${file}`, sha256: sourceSha256, bytes: sourceStat.size,
				width: metadata.width, height: metadata.height },
			normalized: { width: image.width, height: image.height },
			pairSha256: pair,
			directedPair: { background: color(spatial.background), surface: color(spatial.surface) },
			palette: palette(spatial),
			canonicalGradient: certificate.baselineGradient,
			v3: certificate.baselineGradient ? {
				evaluated: true,
				eligible: certificate.decision.eligible,
				reason: "scored",
				score: certificate.decision.score,
				threshold: certificate.decision.threshold,
				margin: certificate.decision.margin,
			} : {
				evaluated: false,
				eligible: false,
				reason: "baseline-not-gradient",
				score: null,
				threshold: GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.threshold,
				margin: null,
			},
		})
	}
	const draft = {
		schemaVersion: 1,
		diagnosticVersion,
		generatedAt: new Date().toISOString(),
		selectionRule: "regular direct child with supported extension and no hyphen in basename before extension",
		bindings: {
			protocol: { file: protocolFile, sha256: sha256(protocolSource) },
			tooling: tools,
			implementation,
			canonicalVersion: ALGORITHM_VERSION,
			experimentVersion: GRADIENT_FIELD_TOPOLOGY_EXPERIMENT_VERSION,
			evidenceVersion: GRADIENT_FIELD_TOPOLOGY_EVIDENCE_VERSION,
			modelIdentity: GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY,
			modelIdentitySha256: sha256(JSON.stringify(GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY)),
			parameterSha256: GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.parameterSha256,
			packageJsonSha256: sha256(packageSource),
		},
		runtime: { node: process.version, nodeVersions: process.versions, sharpVersions: sharp.versions,
			platform: process.platform, arch: process.arch },
		summary: { baseFiles: entries.length, canonicalGradients: entries.filter((entry) => entry.canonicalGradient).length,
			canonicalFlats: entries.filter((entry) => !entry.canonicalGradient).length,
			v3Gradients: entries.filter((entry) => entry.v3.eligible).length,
			v3Flats: entries.filter((entry) => !entry.v3.eligible).length },
		entries,
	}
	const diagnosticId = sha256(JSON.stringify(draft))
	await writeJsonAtomic({ path: diagnosticPath, refuseOverwrite: true }, { ...draft, diagnosticId })
	process.stderr.write(`Prepared exposed diagnostics for ${entries.length} mechanical base images\n`)
}

function parseDiagnostic(value: unknown): Diagnostic {
	const result = record(value, "Diagnostic")
	if (result.schemaVersion !== 1 || result.diagnosticVersion !== diagnosticVersion || !Array.isArray(result.entries) ||
		!isRecord(result.bindings)) throw new Error("Diagnostic is invalid")
	return result as Diagnostic
}

async function verifyDiagnostic(diagnostic: Diagnostic, source: Buffer): Promise<void> {
	const { diagnosticId: _, ...draft } = diagnostic
	if (sha256(JSON.stringify(draft)) !== diagnostic.diagnosticId ||
		diagnostic.bindings.canonicalVersion !== ALGORITHM_VERSION ||
		diagnostic.bindings.modelIdentitySha256 !== sha256(JSON.stringify(GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY)) ||
		diagnostic.bindings.parameterSha256 !== GRADIENT_FIELD_TOPOLOGY_MODEL_IDENTITY.parameterSha256) throw new Error("Diagnostic identity is stale")
	for (const [file, expected] of [
		[diagnostic.bindings.protocol.file, diagnostic.bindings.protocol.sha256],
		...Object.entries(diagnostic.bindings.tooling),
		...Object.entries(diagnostic.bindings.implementation),
	] as Array<[string, string]>) {
		if (sha256(await readFile(join(researchRoot, file))) !== expected) throw new Error(`Diagnostic binding changed: ${file}`)
	}
	if (sha256(source) !== sha256(await readFile(diagnosticPath))) throw new Error("Diagnostic changed during verification")
}

async function analyze(feedbackArgument: string, outputArgument: string): Promise<void> {
	const output = resolve(outputArgument)
	await prepareOutputTarget({ path: output, refuseOverwrite: true })
	const [diagnosticSource, renderSource, htmlSource, feedbackSource] = await Promise.all([
		readFile(diagnosticPath), readFile(renderPath), readFile(htmlPath), readFile(resolve(feedbackArgument)),
	])
	const diagnostic = parseDiagnostic(JSON.parse(diagnosticSource.toString("utf8")) as unknown)
	await verifyDiagnostic(diagnostic, diagnosticSource)
	const render = record(JSON.parse(renderSource.toString("utf8")) as unknown, "Render")
	const feedback = record(JSON.parse(feedbackSource.toString("utf8")) as unknown, "Feedback")
	if (render.planSha256 !== sha256(diagnosticSource) || render.htmlSha256 !== sha256(htmlSource) ||
		feedback.planSha256 !== sha256(diagnosticSource) || feedback.htmlSha256 !== sha256(htmlSource) ||
		!Array.isArray(feedback.entries) || feedback.entries.length !== diagnostic.entries.length) throw new Error("Diagnostic feedback provenance or coverage is invalid")
	const byFamily = new Map(diagnostic.entries.map((entry) => [entry.familyId, entry]))
	const valid = new Set<Decision>(["should-be-gradient", "should-not-be-gradient", "either-way",
		"no-visible-difference", "selected-colors-not-identifiable"])
	const seen = new Set<string>()
	const entries = (feedback.entries as Array<Record<string, unknown>>).map((response) => {
		const familyId = typeof response.familyId === "string" ? response.familyId : ""
		const decision = response.decision as Decision
		const planned = byFamily.get(familyId)
		if (!planned || seen.has(familyId) || !valid.has(decision) || response.pairSha256 !== planned.pairSha256) {
			throw new Error(`Feedback is invalid for ${familyId}`)
		}
		seen.add(familyId)
		const truth = decision === "should-be-gradient" ? true : decision === "should-not-be-gradient" ? false : null
		return { familyId, pairSha256: planned.pairSha256, decision, canonicalGradient: planned.canonicalGradient,
			v3Gradient: planned.v3.eligible, canonicalCorrect: truth === null ? null : planned.canonicalGradient === truth,
			v3Correct: truth === null ? null : planned.v3.eligible === truth, comment: response.comment,
			submittedAt: response.submittedAt }
	})
	if (seen.size !== diagnostic.entries.length) throw new Error("Feedback does not cover every base image")
	const decisive = entries.filter((entry) => entry.decision === "should-be-gradient" || entry.decision === "should-not-be-gradient")
	const confusion = (field: "canonicalGradient" | "v3Gradient") => ({
		truePositive: decisive.filter((entry) => entry.decision === "should-be-gradient" && entry[field]).length,
		falseNegative: decisive.filter((entry) => entry.decision === "should-be-gradient" && !entry[field]).length,
		trueNegative: decisive.filter((entry) => entry.decision === "should-not-be-gradient" && !entry[field]).length,
		falsePositive: decisive.filter((entry) => entry.decision === "should-not-be-gradient" && entry[field]).length,
	})
	await writeJsonAtomic({ path: output, refuseOverwrite: true }, {
		schemaVersion: 1,
		analysisVersion: "gradient-field-topology-3.0.0-images-diagnostic-analysis-1",
		generatedAt: new Date().toISOString(),
		thresholdRefit: false,
		provenance: { diagnosticSha256: sha256(diagnosticSource), renderSha256: sha256(renderSource),
			htmlSha256: sha256(htmlSource), feedbackSha256: sha256(feedbackSource) },
		summary: { cases: entries.length, decisive: decisive.length,
			nondecisive: entries.length - decisive.length,
			judgments: counts(entries.map((entry) => entry.decision)),
			canonical: { confusion: confusion("canonicalGradient"), correct: decisive.filter((entry) => entry.canonicalCorrect).length },
			v3: { confusion: confusion("v3Gradient"), correct: decisive.filter((entry) => entry.v3Correct).length },
			nondecisiveLabels: counts(entries.filter((entry) => entry.decision !== "should-be-gradient" &&
				entry.decision !== "should-not-be-gradient").map((entry) => entry.decision)) },
		entries,
	})
	process.stderr.write(`Analyzed complete feedback for ${entries.length} base images\n`)
}

const [mode, ...arguments_] = process.argv.slice(2)
if (mode === "prepare" && arguments_.length === 0) await prepare()
else if (mode === "analyze" && arguments_.length <= 2) {
	await analyze(arguments_[0] ?? feedbackPath, arguments_[1] ?? analysisPath)
} else throw new Error("Usage: prepare-gradient-field-topology-images-diagnostic.ts prepare | analyze [feedback.json] [analysis.json]")
