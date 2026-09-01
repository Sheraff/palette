import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { createHash } from "node:crypto"
import {
	link,
	lstat,
	mkdir,
	readFile,
	readdir,
	realpath,
	rename,
	unlink,
	writeFile,
} from "node:fs/promises"
import { gunzipSync } from "node:zlib"
import { basename, dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { apcaContrast, okDistance, rgbToHex, rgbToOKLab } from "./src/color.ts"
import {
	NATIVE_COMPLETE_PALETTE_ABLATIONS,
	NATIVE_COMPLETE_PALETTE_COMPONENT_ORDER,
	NATIVE_COMPLETE_PALETTE_POLICY,
	NATIVE_COMPLETE_PALETTE_POLICY_SHA256,
	NATIVE_COMPLETE_PALETTE_SOURCE_ROSTER,
	NATIVE_COMPLETE_PALETTE_THRESHOLDS,
	NATIVE_COMPLETE_PALETTE_VERSION,
	nativeCompletePaletteStrictlyDominates,
	parseNativeCompletePaletteProtocol,
	type NativeCompletePaletteCertificate,
	type NativeCompletePaletteResult,
} from "./src/native-complete-palette.ts"
import type { CorpusResult, ExtractionResult, Palette, RawImage, RGB, RoleName } from "./src/types.ts"

export const NATIVE_COMPLETE_PALETTE_CANONICAL_DEVELOPMENT_SHA256 =
	"546a53979c651f7b20d6a741e0c60c63e6bb97869f93a22918e1de4b5e488fec" as const
export const NATIVE_COMPLETE_PALETTE_CANONICAL_00_SHA256 =
	"5a7766dc9a41733fe76dcdd40c236ce4c394280143b0a246251570301daa7984" as const
export const NATIVE_COMPLETE_PALETTE_EXECUTION_VERSION = "native-complete-palette-phase-5-execution-v2.5" as const
export const NATIVE_COMPLETE_PALETTE_CONCURRENCY = 4
export const NATIVE_COMPLETE_PALETTE_AGGREGATE_CHILD_RSS_BYTES = 5_368_709_120
export const NATIVE_COMPLETE_PALETTE_CHILD_TIMEOUT_MS = 600_000
export const NATIVE_COMPLETE_PALETTE_CHILD_RSS_BYTES = 1_342_177_280
export const NATIVE_COMPLETE_PALETTE_RSS_POLL_INTERVAL_MS = 100
export const NATIVE_COMPLETE_PALETTE_CHILD_STDIN_BYTES = 2 * 1024 * 1024
export const NATIVE_COMPLETE_PALETTE_CHILD_STDOUT_BYTES = 12 * 1024 * 1024
export const NATIVE_COMPLETE_PALETTE_CHILD_STDERR_BYTES = 256 * 1024
export const NATIVE_COMPLETE_PALETTE_CERTIFICATE_JSON_BYTES = 32 * 1024 * 1024
export const NATIVE_COMPLETE_PALETTE_CERTIFICATE_GZIP_BYTES = 8 * 1024 * 1024
export const NATIVE_COMPLETE_PALETTE_ARTIFACT_FILE_BYTES = Object.freeze({
	"results.json": 64 * 1024 * 1024,
	"analysis.json": 8 * 1024 * 1024,
	"certificate-index.json": 8 * 1024 * 1024,
	"manifest.json": 1024 * 1024,
	"failure.json": 4 * 1024 * 1024,
} as const)
export const NATIVE_COMPLETE_PALETTE_MATERIAL_OKLAB_DISTANCE = 0.025
export const NATIVE_COMPLETE_PALETTE_DIAGNOSTIC_SAMPLE_SIZE = 16

export const NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS = Object.freeze({
	experiment: "research/data/experiments/native-complete-palette-0.2.5-development",
	protocol: "research/data/experiments/native-complete-palette-0.2.5-development/protocol.json",
	staging: "research/data/experiments/native-complete-palette-0.2.5-development/.phase-5.staging",
	final: "research/data/experiments/native-complete-palette-0.2.5-development/phase-5",
	failure: "research/data/experiments/native-complete-palette-0.2.5-development/phase-5-failed",
	results: "results.json",
	analysis: "analysis.json",
	certificateIndex: "certificate-index.json",
	manifest: "manifest.json",
	failureRecord: "failure.json",
} as const)

export const NATIVE_COMPLETE_PALETTE_DIAGNOSTICS = Object.freeze({
	cohort: "union(material-changed-frontier,all-matrix-controls,sha-selected-16-group-sample)",
	sampleHashDomain: "native-complete-palette-phase-5-diagnostic-sample-v1",
	transforms: ["resize", "crop", "reencode", "noise"] as const,
	scaleDisagreement: "selected-and-staged-topology-profile-eligibility-disagreement",
	sharp: {
		version: "0.33.5",
		vips: "8.15.3",
		colourspace: "srgb",
		orientation: "auto-rotate",
		alpha: "flatten-white",
		output: { format: "png", compressionLevel: 9, adaptiveFiltering: false, palette: false },
		resize: { maximumEdge: 192, fit: "inside", withoutEnlargement: true, kernel: "lanczos3" },
		crop: { pixelsPerEdge: 1, minimumDimension: 4 },
		reencode: { raster: "native-oriented-flattened-srgb" },
		noise: { delta: "sign((((channelIndex*1103515245+12345)>>>29)-3))", maximumMagnitude: 1 },
	},
	gateUse: "reporting-only-except-structural-nondeterminism-resource-or-invalid-output",
	limitation: "Full transforms run only on the frozen union cohort, not all 391 exact-source groups.",
} as const)

export const NATIVE_COMPLETE_PALETTE_CONTROL_BINDINGS = Object.freeze([
	{ id: "birds-of-prey", classes: ["gradient", "multi-hue"], paths: ["images/birdsofprey.jpg"],
		sourceSha256: "26b991b5d5b9c2a1a390bc5ec398a9b24231da0ce78e927e663aefd9ac1f5d9d" },
	{ id: "krafty", classes: ["gradient", "inappropriate-gradient"], paths: ["images/krafty.jpg"],
		sourceSha256: "3afaf90cd911c134fe26708b3da3fdad181eb38cd8455a8a4538de88a4894091" },
	{ id: "once", classes: ["inappropriate-collapse"], paths: ["images/once.jpg"],
		sourceSha256: "26fb272d7128b9ed89ac19b8fc0c2810d10cae4ace1a06a37663b20b2bb61fc9" },
	{ id: "knuckles", classes: ["wrong-background", "multi-hue"], paths: ["images/knuckles.jpg"],
		sourceSha256: "057be6b5a93708db128db9752b66b3d7631fec5d5611f3c5e318a03f6ee0c0d2" },
	{ id: "maroon-5-exact-aliases", classes: ["wrong-background", "unidentifiable-endpoint"],
		paths: ["images/maroon5-original.jpg", "images/maroon5.jpg"],
		sourceSha256: "6dfd27c93891e02bccb9597196bca250807177c210e3e660f6fb66257cd2c1ef" },
] as const)

export const NATIVE_COMPLETE_PALETTE_EXTERNAL_CONTROL_BINDINGS = Object.freeze([
	{ class: "wrong-background", sourceIds: ["gc-583a7f4b2375592af971"],
		artifact: "research/data/experiments/gradient-eligibility-0.8.5-music-development-analysis.json",
		matrixStatus: "outside-bound-roster-not-accessed" },
	{ class: "unidentifiable-endpoint", sourceIds: ["gv-385e29fbf301aa2fc340", "gv-8b1b5f052c4cf5bb4b81"],
		artifact: "research/data/experiments/gradient-eligibility-0.8.0-sealed-validation/manifest.json",
		matrixStatus: "outside-bound-roster-not-accessed" },
	{ class: "invisible-accent", sourceIds: ["gv-ad255facc9eba8ff001f"],
		artifact: "research/data/experiments/gradient-eligibility-0.8.6-sealed-validation/manifest.json",
		matrixStatus: "outside-bound-roster-not-accessed" },
	{ class: "multi-hue", sourceIds: ["gv-d121e2591909215324f1", "00/ab67616d0000b2730000c4e4d278f49bbc995440.jpg"],
		artifact: "research/data/experiments/typography-chromatic-role-0.1.0-poc.1-development/analysis.json",
		matrixStatus: "one-bound-source-and-one-outside-bound-roster" },
	{ class: "inappropriate-collapse", sourceIds: ["images/once.jpg"],
		artifact: "research/data/native-field-hypothesis-graph-analysis.json",
		matrixStatus: "bound-reporting-only" },
] as const)

const roleNames = ["background", "foreground", "surface", "accent"] as const satisfies readonly RoleName[]
const blockNames = ["Field", "Foreground", "Accent", "Composition", "Robustness"] as const
const sha256Pattern = /^[0-9a-f]{64}$/

export type NativeCompletePaletteTransform = typeof NATIVE_COMPLETE_PALETTE_DIAGNOSTICS.transforms[number]
export type NativeCompletePaletteChildMode = "base" | NativeCompletePaletteTransform

export type NativeCompletePaletteRosterRow = {
	cohort: "00" | "development"
	path: string
	sha256: string
	bytes: number
}

export type NativeCompletePaletteCanonicalBinding = {
	artifactPath: "research/data/results.json" | "research/data/holdout-results.json"
	artifactSha256: string
	entryFile: string
	extraction: ExtractionResult
}

export type NativeCompletePaletteChildPayload = {
	schemaVersion: 1
	mode: NativeCompletePaletteChildMode
	source: { relativePath: string; bytes: number; sha256: string }
	canonical: NativeCompletePaletteCanonicalBinding
}

export type NativeCompletePaletteScientificSummary = {
	evaluatedSourceSha256: string
	canonicalExtractionSha256: string
	canonicalPalette: Palette
	palette: Palette
	exactChanged: boolean
	materialChanged: boolean
	changedRoles: RoleName[]
	materialChangedRoles: RoleName[]
	generatedStatusChangedRoles: RoleName[]
	gradientChanged: boolean
	fieldStateBefore: "collapsed" | "distinct-flat" | "gradient"
	fieldStateAfter: "collapsed" | "distinct-flat" | "gradient"
	selectedGeneratedForeground: boolean
	familyCoverage: number | null
	scaleDisagreementCount: number
	hardViolations: []
	certificateViolations: []
}

export type NativeCompletePaletteCertificateTransport = {
	format: "stable-json+gzip-base64"
	gzipLevel: 9
	certificateJsonBytes: number
	certificateGzipBytes: number
	certificateSha256: string
	certificateGzipSha256: string
	certificateGzipBase64: string
}

export type NativeCompletePaletteChildOutput = {
	schemaVersion: 1
	executionVersion: typeof NATIVE_COMPLETE_PALETTE_EXECUTION_VERSION
	candidate: typeof NATIVE_COMPLETE_PALETTE_VERSION
	policySha256: typeof NATIVE_COMPLETE_PALETTE_POLICY_SHA256
	mode: NativeCompletePaletteChildMode
	source: { relativePath: string; bytes: number; sha256: string }
	scientific: NativeCompletePaletteScientificSummary
	transport: NativeCompletePaletteCertificateTransport
	resource: { elapsedMs: number; maximumRssBytes: number }
}

export type NativeCompletePaletteSourceGroup = {
	sha256: string
	bytes: number
	rows: NativeCompletePaletteRosterRow[]
	canonical: NativeCompletePaletteCanonicalBinding
}

type ChildExecution = {
	output: NativeCompletePaletteChildOutput
	stdoutBytes: number
	stderrBytes: number
	peakLiveRssBytes: number
}

type RepeatedExecution = {
	output: NativeCompletePaletteChildOutput
	resources: [ChildExecution["output"]["resource"] & { stdoutBytes: number; stderrBytes: number; peakLiveRssBytes: number },
		ChildExecution["output"]["resource"] & { stdoutBytes: number; stderrBytes: number; peakLiveRssBytes: number }]
}

export function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

export function stableJson(value: unknown): string {
	if (value === undefined) throw new Error("Stable JSON cannot encode undefined")
	if (value === null || typeof value !== "object") {
		const encoded = JSON.stringify(value)
		if (encoded === undefined) throw new Error("Stable JSON value is not serializable")
		return encoded
	}
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
	const entries = Object.entries(value as Record<string, unknown>)
		.sort(([first], [second]) => compareAscii(first, second))
	return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`
}

export function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function record(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
	return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
	if (Object.keys(value).sort(compareAscii).join("\0") !== [...keys].sort(compareAscii).join("\0")) {
		throw new Error(`${label} has unexpected or missing fields`)
	}
}

function finiteNumbers(value: unknown, path = "value", seen = new Set<unknown>()): void {
	if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`${path} is not finite`)
	if (!value || typeof value !== "object" || seen.has(value)) return
	seen.add(value)
	for (const [key, child] of Object.entries(value)) finiteNumbers(child, `${path}.${key}`, seen)
}

function fieldState(palette: Palette): "collapsed" | "distinct-flat" | "gradient" {
	if (sameRgb(palette.background.rgb, palette.surface.rgb)) return "collapsed"
	return palette.gradient.isGradient ? "gradient" : "distinct-flat"
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first.length === 3 && first.every((channel, index) => channel === second[index])
}

function byteRgb(value: unknown): value is RGB {
	return Array.isArray(value) && value.length === 3 && value.every((channel) =>
		Number.isInteger(channel) && channel >= 0 && channel <= 255)
}

function paletteEqual(first: Palette, second: Palette): boolean {
	return stableJson(first) === stableJson(second)
}

export function canonicalExtractionScientificValue(extraction: ExtractionResult): unknown {
	const value = structuredClone(extraction) as ExtractionResult
	delete (value.diagnostics as Partial<ExtractionResult["diagnostics"]>).processingMs
	return value
}

export function canonicalExtractionScientificSha256(extraction: ExtractionResult): string {
	return sha256(stableJson(canonicalExtractionScientificValue(extraction)))
}

function selectedComponent(certificate: NativeCompletePaletteCertificate, name: string): number | null {
	for (const block of certificate.selection.blocks) {
		const component = block.components.find((entry) => entry.name === name)
		if (component) return component.value
	}
	return null
}

function assertDeeplyFrozen(value: unknown, seen = new Set<unknown>()): void {
	if (!value || typeof value !== "object" || seen.has(value) || ArrayBuffer.isView(value)) return
	seen.add(value)
	if (!Object.isFrozen(value)) throw new Error("Native complete-palette result is not deeply immutable before serialization")
	for (const child of Object.values(value)) assertDeeplyFrozen(child, seen)
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value
	for (const child of Object.values(value)) deepFreeze(child)
	return Object.freeze(value)
}

function assertApca(
	decision: NativeCompletePaletteCertificate["selection"]["apca"][keyof NativeCompletePaletteCertificate["selection"]["apca"]],
	foreground: RGB,
	background: RGB,
	positive: number,
	negative: number,
): void {
	const lc = apcaContrast(foreground, background)
	const margin = Math.max(lc - positive, -lc - negative)
	const polarity = lc > 1e-12 ? "positive" : lc < -1e-12 ? "negative" : "none"
	if (Math.abs(decision.lc - lc) > 1e-12 || decision.positiveMinimumLc !== positive ||
		decision.negativeMinimumMagnitudeLc !== negative || Math.abs(decision.margin - margin) > 1e-12 ||
		decision.polarity !== polarity || decision.passed !== true) {
		throw new Error("Selected signed APCA evidence does not reconcile")
	}
}

function assertRunCounts(counts: NativeCompletePaletteCertificate["counts"] | NativeCompletePaletteCertificate["ablations"][keyof NativeCompletePaletteCertificate["ablations"]]["counts"]): void {
	if (counts.attemptedCompleteTuples !== counts.hardRejectedCompleteTuples + counts.hardFeasibleCompleteTuples ||
		counts.hardFeasibleCompleteTuples !== counts.blockRejectedCompleteTuples + counts.blockPassingCompleteTuples ||
		counts.blockPassingCompleteTuples !== counts.incumbentNondominatingCompleteTuples +
			counts.incumbentDominatingCompleteTuples ||
		Object.values(counts.hardRejections).reduce((sum, count) => sum + count, 0) !== counts.hardRejectedCompleteTuples ||
		Object.values(counts.blockRejections).reduce((sum, count) => sum + count, 0) !== counts.blockRejectedCompleteTuples) {
		throw new Error("Complete-tuple counts do not reconcile")
	}
}

function rasterSha256(image: RawImage): string {
	return createHash("sha256").update(`${image.width}x${image.height}:`, "utf8").update(image.data).digest("hex")
}

export function validateNativeCompletePaletteResult(input: {
	result: NativeCompletePaletteResult
	canonical: Palette
	sourceSha256: string
	native?: RawImage
	exactReferenceRequired: boolean
}): NativeCompletePaletteScientificSummary {
	const { result, canonical, sourceSha256, native, exactReferenceRequired } = input
	const { certificate, palette } = result
	finiteNumbers(result, "result")
	assertDeeplyFrozen(certificate)
	if (!certificate.unchangedCanonicalAssertion.unchanged) assertDeeplyFrozen(palette)
	if (certificate.schemaVersion !== 1 || certificate.identity.candidate !== NATIVE_COMPLETE_PALETTE_VERSION ||
		certificate.identity.policySha256 !== NATIVE_COMPLETE_PALETTE_POLICY_SHA256 ||
		stableJson(certificate.policy) !== stableJson(NATIVE_COMPLETE_PALETTE_POLICY) ||
		certificate.source.sha256 !== sourceSha256 || !sha256Pattern.test(sourceSha256)) {
		throw new Error("Certificate source or policy identity is invalid")
	}
	if (native && (certificate.source.nativeWidth !== native.width || certificate.source.nativeHeight !== native.height ||
		certificate.source.nativeRasterSha256 !== rasterSha256(native))) {
		throw new Error("Certificate native raster identity is invalid")
	}
	if (certificate.source.graphSourceMatchesSuppliedSource !== true ||
		certificate.source.nativeRasterMatchesGraph !== true ||
		certificate.source.topologyBoundToSameSourceAndRaster !== true ||
		Object.values(certificate.invariants).some((value) => value !== true && value !== false) ||
		Object.entries(certificate.invariants).some(([key, value]) =>
			key === "completeRejectedTupleDomainsSerialized" || key === "canonicalExtractorInvokedInternally"
				? value !== false : value !== true)) {
		throw new Error("Certificate invariants are not complete")
	}
	const selected = certificate.selection.roles
	for (const role of roleNames) {
		const provenance = selected[role]
		if (!byteRgb(provenance.rgb) || !sameRgb(provenance.rgb, palette[role].rgb)) {
			throw new Error(`Selected ${role} provenance does not match the palette`)
		}
		if (provenance.status === "exact-source") {
			if (palette[role].generated) throw new Error(`Exact-source ${role} is marked generated`)
			if (role === "background" || role === "surface") {
				if (provenance.familyKind !== "primary-field" || provenance.roleDomain !== "primary") {
					throw new Error(`Selected ${role} violates the field role domain`)
				}
			}
			if (native) {
				const index = provenance.representativePixelIndex
				const rgb: RGB = [native.data[index * 3], native.data[index * 3 + 1], native.data[index * 3 + 2]]
				if (!Number.isSafeInteger(index) || index < 0 || index >= native.width * native.height || !sameRgb(rgb, provenance.rgb)) {
					throw new Error(`Selected ${role} is not its exact native source pixel`)
				}
			}
		} else if (provenance.status === "generated-fallback") {
			if (role !== "foreground" || !sameRgb(provenance.rgb, [0, 0, 0]) && !sameRgb(provenance.rgb, [255, 255, 255]) ||
				provenance.necessity.sourceForegroundsPassing !== 0 || provenance.necessity.perTreatmentAuthorized !== true ||
				!palette[role].generated) {
				throw new Error("Generated role rules are invalid")
			}
		} else if (!certificate.unchangedCanonicalAssertion.unchanged) {
			throw new Error("A changed selection retained canonical provenance")
		}
	}
	const unchanged = certificate.unchangedCanonicalAssertion.unchanged
	const state = fieldState(palette)
	const rgbKey = (rgb: RGB) => rgbToHex(rgb).toLowerCase()
	const expectedSemanticKey = `${rgbKey(palette.background.rgb)}>${rgbKey(palette.surface.rgb)}:${state}` +
		`|fg:${rgbKey(palette.foreground.rgb)}|ac:${rgbKey(palette.accent.rgb)}`
	if (certificate.selection.semanticKey !== expectedSemanticKey ||
		unchanged !== !certificate.selection.route.startsWith("challenger-selected") ||
		certificate.canonical.semanticSha256 !== sha256(stableJson(canonical))) {
		throw new Error("Selected semantic key, route, or canonical hash is invalid")
	}
	if (!unchanged && (state === "collapsed" !== sameRgb(palette.background.rgb, palette.surface.rgb) ||
		state === "gradient" !== palette.gradient.isGradient ||
		state !== "collapsed" && okDistance(rgbToOKLab(palette.background.rgb), rgbToOKLab(palette.surface.rgb)) + 1e-12 < 0.025)) {
		throw new Error("Selected collapse, gradient, or field distance is invalid")
	}
	if (!unchanged && (sameRgb(palette.foreground.rgb, palette.background.rgb) || sameRgb(palette.foreground.rgb, palette.surface.rgb) ||
		sameRgb(palette.accent.rgb, palette.background.rgb) || sameRgb(palette.accent.rgb, palette.surface.rgb) ||
		sameRgb(palette.accent.rgb, palette.foreground.rgb) ||
		okDistance(rgbToOKLab(palette.accent.rgb), rgbToOKLab(palette.background.rgb)) + 1e-12 < 0.025 ||
		okDistance(rgbToOKLab(palette.accent.rgb), rgbToOKLab(palette.surface.rgb)) + 1e-12 < 0.025 ||
		okDistance(rgbToOKLab(palette.accent.rgb), rgbToOKLab(palette.foreground.rgb)) + 1e-12 < 0.025 ||
		new Set(roleNames.map((role) => palette[role].rgb.join(","))).size > 4)) {
		throw new Error("Selected role distance, collapse, or cardinality is invalid")
	}
	assertApca(certificate.selection.apca.foregroundOnBackground, palette.foreground.rgb, palette.background.rgb,
		NATIVE_COMPLETE_PALETTE_POLICY.foregroundApca.positiveMinimumLc,
		NATIVE_COMPLETE_PALETTE_POLICY.foregroundApca.negativeMinimumMagnitudeLc)
	assertApca(certificate.selection.apca.foregroundOnSurface, palette.foreground.rgb, palette.surface.rgb,
		NATIVE_COMPLETE_PALETTE_POLICY.foregroundApca.positiveMinimumLc,
		NATIVE_COMPLETE_PALETTE_POLICY.foregroundApca.negativeMinimumMagnitudeLc)
	assertApca(certificate.selection.apca.accentOnBackground, palette.accent.rgb, palette.background.rgb,
		NATIVE_COMPLETE_PALETTE_POLICY.accentApca.positiveMinimumLc,
		NATIVE_COMPLETE_PALETTE_POLICY.accentApca.negativeMinimumMagnitudeLc)
	assertApca(certificate.selection.apca.accentOnSurface, palette.accent.rgb, palette.surface.rgb,
		NATIVE_COMPLETE_PALETTE_POLICY.accentApca.positiveMinimumLc,
		NATIVE_COMPLETE_PALETTE_POLICY.accentApca.negativeMinimumMagnitudeLc)
	if (Object.values(certificate.selection.apca).some((decision) => !decision.passed)) {
		throw new Error("Selected finite APCA evidence contract failed")
	}
	if (certificate.selection.blocks.map((block) => block.name).join("\0") !== blockNames.join("\0")) {
		throw new Error("Certificate does not contain all five blocks in order")
	}
	const components = certificate.selection.blocks.flatMap((block) => block.components)
	if (certificate.selection.flattenedVector) {
		if (components.map((component) => component.name).join("\0") !== NATIVE_COMPLETE_PALETTE_COMPONENT_ORDER.join("\0") ||
			components.some((component, index) => component.threshold !== NATIVE_COMPLETE_PALETTE_THRESHOLDS[component.name] ||
				Math.abs(component.margin - (component.value - component.threshold)) > 1e-12 ||
				component.passed !== (component.margin >= -1e-12) ||
				component.value !== certificate.selection.flattenedVector![index]) ||
			certificate.selection.blocks.some((block) => block.status !==
				(block.components.every((component) => component.passed) ? "pass" : "fail"))) {
			throw new Error("Certificate block components do not reconcile")
		}
	}
	const staged = certificate.stagedDomain.counts
	if (staged.rawFieldProvenanceTreatments !== staged.hardFieldRejectedProvenanceTreatments +
		staged.hardFieldEligibleProvenanceTreatments ||
		staged.hardFieldEligibleProvenanceTreatments !== staged.semanticAliasDuplicates + staged.semanticFieldTreatments ||
		staged.hardFieldEligibleProvenanceTreatments !== staged.nonTopologyRejectedAliases +
			staged.topologyRejectedAliases + staged.retainedFieldAliases ||
		certificate.stagedDomain.retainedFieldTreatments.reduce((sum, treatment) => sum + treatment.aliases.length, 0) !==
			staged.retainedFieldAliases) {
		throw new Error("Staged field counts do not reconcile")
	}
	assertRunCounts(certificate.counts)
	if (certificate.counts.completeParetoFrontier !== certificate.frontiers.completePareto.length ||
		certificate.counts.withinClassParetoFrontier !== certificate.frontiers.minimumBlockPareto.length ||
		certificate.admittedDomain.exactCount !== certificate.counts.incumbentDominatingCompleteTuples ||
		certificate.admittedDomain.retainedCompleteParetoTuples !== certificate.counts.completeParetoFrontier ||
		certificate.admittedDomain.retainedMinimumBlockParetoTuples !== certificate.counts.withinClassParetoFrontier ||
		certificate.dominanceWitnessSummary.total !== certificate.counts.incumbentNondominatingCompleteTuples ||
		Object.values(certificate.dominanceWitnessSummary.byReason).reduce((sum, count) => sum + count, 0) !==
			certificate.dominanceWitnessSummary.total ||
		Object.values(certificate.dominanceWitnessSummary.byComponent).reduce((sum, count) => sum + count, 0) !==
			certificate.dominanceWitnessSummary.byReason["weaker-component"] ||
		certificate.dominanceWitnessSummary.examples.length > 16) {
		throw new Error("Certificate domain or dominance summaries do not reconcile")
	}
	if (Object.keys(certificate.ablations).sort(compareAscii).join("\0") !==
		[...NATIVE_COMPLETE_PALETTE_ABLATIONS].sort(compareAscii).join("\0")) {
		throw new Error("Certificate does not contain the eight frozen ablations")
	}
	for (const name of NATIVE_COMPLETE_PALETTE_ABLATIONS) {
		const ablation = certificate.ablations[name]
		if (ablation.independentAccumulator !== true || !sha256Pattern.test(ablation.domainSha256) ||
			ablation.dominanceWitnessSummary.total !== ablation.counts.incumbentNondominatingCompleteTuples ||
			ablation.admittedDomain.exactCount !== ablation.counts.incumbentDominatingCompleteTuples) {
			throw new Error(`Ablation ${name} does not reconcile`)
		}
		assertRunCounts(ablation.counts)
	}
	const expectedTupleHash = sha256(stableJson({
		semanticKey: certificate.selection.semanticKey,
		provenanceIdentity: certificate.selection.provenanceIdentity,
		vector: certificate.selection.flattenedVector,
		roles: certificate.selection.roles,
	}))
	const topologyStatus = (background: RGB, surface: RGB, state: string) => state === "collapsed" ? "collapsed" :
		certificate.stagedDomain.topologyQueries.find((query) =>
			sameRgb(query.backgroundRgb, background) && sameRgb(query.surfaceRgb, surface))?.status
	const fieldDomainIdentity = {
		counts: certificate.stagedDomain.counts,
		retained: certificate.stagedDomain.retainedFieldTreatments.flatMap((treatment) => treatment.aliases.map((alias) => ({
			semanticKey: treatment.semanticKey,
			provenanceIdentity: alias.provenanceIdentity,
			values: alias.fieldComponents,
			topologyStatus: topologyStatus(treatment.backgroundRgb, treatment.surfaceRgb, treatment.state),
		}))),
		witnesses: certificate.stagedDomain.witnesses,
	}
	if (certificate.hashes.selectedPaletteSha256 !== sha256(stableJson(palette)) ||
		certificate.hashes.selectedTupleSha256 !== expectedTupleHash ||
		certificate.hashes.fieldDomainSha256 !== sha256(stableJson(fieldDomainIdentity)) ||
		Object.values(certificate.hashes).some((digest) => !sha256Pattern.test(digest)) ||
		!sha256Pattern.test(certificate.dominanceWitnessSummary.streamingSha256) ||
		!sha256Pattern.test(certificate.admittedDomain.streamingSha256)) {
		throw new Error("Certificate hashes are invalid")
	}
	if (unchanged) {
		if (!paletteEqual(palette, canonical) || !certificate.unchangedCanonicalAssertion.exactObjectReferencePreserved ||
			certificate.unchangedCanonicalAssertion.semanticHashBefore !== certificate.unchangedCanonicalAssertion.semanticHashAfter ||
			certificate.canonical.semanticSha256 !== sha256(stableJson(canonical)) ||
			exactReferenceRequired && result.palette !== canonical) {
			throw new Error("Unchanged canonical exact equality or reference semantics failed")
		}
	} else {
		if (!certificate.selection.flattenedVector || !certificate.canonical.flattenedVector ||
			!nativeCompletePaletteStrictlyDominates(certificate.selection.flattenedVector, certificate.canonical.flattenedVector) ||
			certificate.selection.blocks.some((block) => block.status !== "pass") ||
			certificate.counts.selectedChallengers !== 1) {
			throw new Error("Changed selection does not strictly dominate the canonical reference")
		}
	}
	const changedRoles = roleNames.filter((role) => stableJson(palette[role]) !== stableJson(canonical[role]))
	const materialChangedRoles = roleNames.filter((role) =>
		okDistance(rgbToOKLab(palette[role].rgb), rgbToOKLab(canonical[role].rgb)) >
			NATIVE_COMPLETE_PALETTE_MATERIAL_OKLAB_DISTANCE)
	const generatedStatusChangedRoles = roleNames.filter((role) => palette[role].generated !== canonical[role].generated)
	const gradientChanged = palette.gradient.isGradient !== canonical.gradient.isGradient
	const exactChanged = !paletteEqual(palette, canonical)
	return {
		evaluatedSourceSha256: sourceSha256,
		canonicalExtractionSha256: "",
		canonicalPalette: canonical,
		palette,
		exactChanged,
		materialChanged: materialChangedRoles.length > 0 || gradientChanged || generatedStatusChangedRoles.length > 0,
		changedRoles,
		materialChangedRoles,
		generatedStatusChangedRoles,
		gradientChanged,
		fieldStateBefore: fieldState(canonical),
		fieldStateAfter: fieldState(palette),
		selectedGeneratedForeground: palette.foreground.generated,
		familyCoverage: selectedComponent(certificate, "composition.familyCoverage"),
		scaleDisagreementCount: certificate.stagedDomain.topologyQueries.filter((query) => query.status === "mapped" &&
			new Set(query.profiles.map((profile) => profile.eligible)).size > 1).length,
		hardViolations: [],
		certificateViolations: [],
	}
}

export function scientificChildProjection(output: NativeCompletePaletteChildOutput): unknown {
	return {
		schemaVersion: output.schemaVersion,
		executionVersion: output.executionVersion,
		candidate: output.candidate,
		policySha256: output.policySha256,
		mode: output.mode,
		source: output.source,
		scientific: output.scientific,
		transport: output.transport,
	}
}

export function assertRepeatedScientificEquality(
	first: NativeCompletePaletteChildOutput,
	second: NativeCompletePaletteChildOutput,
): void {
	if (!isDeepStrictEqual(scientificChildProjection(first), scientificChildProjection(second)) ||
		first.transport.certificateSha256 !== second.transport.certificateSha256 ||
		first.transport.certificateGzipBase64 !== second.transport.certificateGzipBase64) {
		throw new Error("Repeated extraction scientific output or candidate certificate is nondeterministic")
	}
}

export function decodeCertificateTransport(output: NativeCompletePaletteChildOutput): {
	certificate: NativeCompletePaletteCertificate
	json: string
	gzip: Buffer
} {
	const transport = output.transport
	if (transport.format !== "stable-json+gzip-base64" || transport.gzipLevel !== 9 ||
		!sha256Pattern.test(transport.certificateSha256) || !sha256Pattern.test(transport.certificateGzipSha256)) {
		throw new Error("Certificate transport identity is invalid")
	}
	const gzip = Buffer.from(transport.certificateGzipBase64, "base64")
	if (gzip.byteLength !== transport.certificateGzipBytes || gzip.byteLength > NATIVE_COMPLETE_PALETTE_CERTIFICATE_GZIP_BYTES ||
		sha256(gzip) !== transport.certificateGzipSha256) throw new Error("Compressed certificate transport is invalid")
	const json = gunzipSync(gzip).toString("utf8")
	if (Buffer.byteLength(json) !== transport.certificateJsonBytes ||
		Buffer.byteLength(json) > NATIVE_COMPLETE_PALETTE_CERTIFICATE_JSON_BYTES ||
		sha256(json) !== transport.certificateSha256) throw new Error("Certificate JSON transport is invalid")
	const certificate = JSON.parse(json) as NativeCompletePaletteCertificate
	if (stableJson(certificate) !== json) throw new Error("Certificate transport is not canonical stable JSON")
	return { certificate, json, gzip }
}

function parseRoster(value: unknown): NativeCompletePaletteRosterRow[] {
	const manifest = record(value, "Bound source roster")
	if (!Array.isArray(manifest.sources)) throw new Error("Bound source roster has no sources array")
	const rows = manifest.sources.map((entry, index): NativeCompletePaletteRosterRow => {
		const row = record(entry, `Bound source roster row ${index}`)
		exactKeys(row, ["cohort", "path", "sha256", "bytes"], `Bound source roster row ${index}`)
		if ((row.cohort !== "00" && row.cohort !== "development") || typeof row.path !== "string" ||
			!sha256Pattern.test(String(row.sha256)) || !Number.isSafeInteger(row.bytes) || Number(row.bytes) <= 0) {
			throw new Error(`Bound source roster row ${index} is invalid`)
		}
		assertAuthorizedRelativePath(row.path)
		if (row.cohort === "00" !== row.path.startsWith("00/")) throw new Error("Roster cohort and root disagree")
		return { cohort: row.cohort, path: row.path, sha256: String(row.sha256), bytes: Number(row.bytes) }
	})
	return rows
}

export function assertAuthorizedRelativePath(relativePath: string): void {
	if (relativePath.includes("\\") || relativePath.includes("\0")) throw new Error("Source path syntax is invalid")
	const parts = relativePath.split("/")
	if (parts.length !== 2 || !["images", "00"].includes(parts[0]) ||
		["10", "11", "12", "13", "14"].includes(parts[0]) ||
		parts.some((part) => !part || part === "." || part === ".." || basename(part) !== part)) {
		throw new Error("Source root or path is not authorized")
	}
}

function canonicalMap(development: CorpusResult, cohort00: CorpusResult): Map<string, NativeCompletePaletteCanonicalBinding> {
	const map = new Map<string, NativeCompletePaletteCanonicalBinding>()
	for (const [corpus, artifactPath, artifactSha256, prefix] of [
		[development, "research/data/results.json", NATIVE_COMPLETE_PALETTE_CANONICAL_DEVELOPMENT_SHA256, "images/"],
		[cohort00, "research/data/holdout-results.json", NATIVE_COMPLETE_PALETTE_CANONICAL_00_SHA256, ""],
	] as const) {
		if (corpus.algorithmVersion !== "region-graph-0.19.0") throw new Error("Canonical algorithm identity changed")
		for (const entry of corpus.entries) {
			const path = `${prefix}${entry.file}`
			assertAuthorizedRelativePath(path)
			if (map.has(path) || entry.width !== entry.extraction.width || entry.height !== entry.extraction.height) {
				throw new Error(`Canonical coverage is invalid for ${path}`)
			}
			map.set(path, { artifactPath, artifactSha256, entryFile: entry.file, extraction: entry.extraction })
		}
	}
	return map
}

export function buildExactSourceGroups(
	rows: readonly NativeCompletePaletteRosterRow[],
	canonicals: ReadonlyMap<string, NativeCompletePaletteCanonicalBinding>,
): NativeCompletePaletteSourceGroup[] {
	const grouped = new Map<string, NativeCompletePaletteRosterRow[]>()
	for (const row of rows) {
		if (!canonicals.has(row.path)) throw new Error(`Canonical coverage is missing: ${row.path}`)
		const group = grouped.get(row.sha256) ?? []
		group.push(row)
		grouped.set(row.sha256, group)
	}
	const groups = [...grouped.entries()].map(([digest, aliases]): NativeCompletePaletteSourceGroup => {
		const ordered = [...aliases].sort((first, second) => compareAscii(first.path, second.path))
		if (new Set(ordered.map((row) => row.bytes)).size !== 1) throw new Error("Exact aliases disagree on encoded byte count")
		const canonical = canonicals.get(ordered[0].path)!
		const semantic = canonicalExtractionScientificSha256(canonical.extraction)
		for (const alias of ordered.slice(1)) {
			if (canonicalExtractionScientificSha256(canonicals.get(alias.path)!.extraction) !== semantic) {
				throw new Error("Exact source aliases disagree on canonical scientific extraction")
			}
		}
		return { sha256: digest, bytes: ordered[0].bytes, rows: ordered, canonical }
	})
	return groups.sort((first, second) => compareAscii(first.sha256, second.sha256) ||
		compareAscii(first.rows[0].path, second.rows[0].path))
}

export async function preflightNativeCompletePalette(
	projectRoot = fileURLToPath(new URL("..", import.meta.url)),
): Promise<{ protocol: Readonly<Record<string, unknown>>; rows: NativeCompletePaletteRosterRow[];
	groups: NativeCompletePaletteSourceGroup[]; protocolSha256: string }> {
	const protocolPath = resolve(projectRoot, NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.protocol)
	const rosterPath = resolve(projectRoot, NATIVE_COMPLETE_PALETTE_SOURCE_ROSTER.path.replace(/#sources$/, ""))
	const [protocolSource, rosterSource, developmentSource, cohort00Source] = await Promise.all([
		readFile(protocolPath, "utf8"), readFile(rosterPath),
		readFile(resolve(projectRoot, "research/data/results.json")),
		readFile(resolve(projectRoot, "research/data/holdout-results.json")),
	])
	const protocol = parseNativeCompletePaletteProtocol(protocolSource) as Readonly<Record<string, unknown>>
	const authorization = record(protocol.authorization, "Protocol authorization")
	const resources = record(protocol.resources, "Protocol resources")
	if (protocol.status !== "phase-5-matrix-authorized" || authorization.developmentMatrix !== true ||
		authorization.realSourceOutputInspection !== true ||
		["reviewManifest", "server", "reserveAccess", "promotion"].some((key) => authorization[key] !== false)) {
		throw new Error("Protocol does not authorize only the sealed Phase 5 matrix")
	}
	if (resources.nodeVersion !== process.version || resources.platform !== process.platform || resources.arch !== process.arch) {
		throw new Error("Execution runtime differs from the frozen Node/platform/architecture binding")
	}
	if (sha256(rosterSource) !== NATIVE_COMPLETE_PALETTE_SOURCE_ROSTER.artifactSha256 ||
		sha256(developmentSource) !== NATIVE_COMPLETE_PALETTE_CANONICAL_DEVELOPMENT_SHA256 ||
		sha256(cohort00Source) !== NATIVE_COMPLETE_PALETTE_CANONICAL_00_SHA256) {
		throw new Error("Bound roster or canonical artifact identity changed")
	}
	const rows = parseRoster(JSON.parse(rosterSource.toString("utf8")))
	const semanticRows = [...rows].sort((first, second) => compareAscii(first.cohort, second.cohort) ||
		compareAscii(first.path, second.path) || compareAscii(first.sha256, second.sha256))
	if (sha256(JSON.stringify(semanticRows)) !== NATIVE_COMPLETE_PALETTE_SOURCE_ROSTER.asciiSortedSemanticSha256 ||
		rows.length !== 392 || new Set(rows.map((row) => row.path)).size !== 392 ||
		rows.filter((row) => row.cohort === "development").length !== 37 ||
		rows.filter((row) => row.cohort === "00").length !== 355) throw new Error("Bound roster semantics changed")
	const development = JSON.parse(developmentSource.toString("utf8")) as CorpusResult
	const cohort00 = JSON.parse(cohort00Source.toString("utf8")) as CorpusResult
	if (development.entries.length !== 37 || cohort00.entries.length !== 355) throw new Error("Canonical artifact counts changed")
	const canonicals = canonicalMap(development, cohort00)
	if (canonicals.size !== 392 || [...canonicals.keys()].some((path) => !rows.some((row) => row.path === path))) {
		throw new Error("Canonical coverage does not exactly equal the bound roster")
	}
	const groups = buildExactSourceGroups(rows, canonicals)
	if (groups.length !== 391 || groups.filter((group) => group.rows.length > 1).length !== 1 ||
		groups.reduce((sum, group) => sum + group.rows.length, 0) !== 392) throw new Error("Exact-source grouping changed")
	await verifyNativeCompletePaletteImplementationClosure(protocol, projectRoot)
	return { protocol, rows, groups, protocolSha256: sha256(protocolSource) }
}

export async function verifyNativeCompletePaletteImplementationClosure(
	protocol: Readonly<Record<string, unknown>>,
	projectRoot: string,
): Promise<void> {
	const closure = record(protocol.implementationClosure, "Protocol implementation closure")
	if (closure.status !== "phase-5-execution-frozen" || closure.matrixExecuted !== false || !Array.isArray(closure.files)) {
		throw new Error("Phase 5 implementation closure is not frozen")
	}
	const closurePaths: string[] = []
	for (const entry of closure.files) {
		const file = record(entry, "Implementation closure file")
		if (typeof file.path !== "string" || !sha256Pattern.test(String(file.sha256)) ||
			sha256(await readFile(resolve(projectRoot, file.path))) !== file.sha256) {
			throw new Error(`Implementation closure mismatch: ${String(file.path)}`)
		}
		closurePaths.push(file.path)
	}
	if (closurePaths.join("\0") !== [...new Set(closurePaths)].sort(compareAscii).join("\0")) {
		throw new Error("Implementation closure paths are not unique ASCII order")
	}
	const pending = ["research/evaluate-native-complete-palette.ts", "research/native-complete-palette-child.ts"]
	const discovered = new Set<string>()
	while (pending.length > 0) {
		const path = pending.shift()!
		if (discovered.has(path)) continue
		discovered.add(path)
		const source = await readFile(resolve(projectRoot, path), "utf8")
		const imports = [...source.matchAll(/\bfrom\s+["'](\.[^"']+)["']/g),
			...source.matchAll(/\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g)]
		for (const match of imports) {
			const imported = relative(projectRoot, resolve(projectRoot, dirname(path), match[1])).split(sep).join("/")
			if (imported.endsWith(".ts") && !discovered.has(imported)) pending.push(imported)
		}
	}
	const expected = [...discovered,
		"package.json",
		"pnpm-lock.yaml",
		"research/NATIVE_COMPLETE_PALETTE_EXECUTION_PLAN.md",
		"research/NATIVE_COMPLETE_PALETTE_PROTOCOL_0_2_4.md",
		"research/NATIVE_COMPLETE_PALETTE_PROTOCOL_0_2_5.md",
		"research/NEXT_PALETTE_SOFT_CONTRAST_PLAN.md",
		"research/data/experiments/native-complete-palette-0.2.4-development/phase-5-failed/failure.json",
		"research/data/experiments/native-complete-palette-0.2.4-development/protocol.json",
		"research/data/experiments/native-complete-palette-0.2.4-development/rejection.json",
		"research/prepare-native-complete-palette-0.2.5-protocol.ts",
		"research/tests/native-complete-palette-artifact.test.ts",
		"research/tests/native-complete-palette-evaluation.test.ts",
		"research/tests/native-complete-palette.test.ts",
	].sort(compareAscii)
	if (closurePaths.join("\0") !== expected.join("\0")) {
		throw new Error("Implementation closure does not exactly equal runtime imports and declared tests")
	}
}

export function selectNativeCompletePaletteDiagnosticCohort(
	groups: readonly NativeCompletePaletteSourceGroup[],
	materialChangedSha256: ReadonlySet<string>,
): NativeCompletePaletteSourceGroup[] {
	const controls = new Set(NATIVE_COMPLETE_PALETTE_CONTROL_BINDINGS.map((control) => control.sourceSha256))
	const sample = [...groups].sort((first, second) => {
		const firstKey = sha256(`${NATIVE_COMPLETE_PALETTE_DIAGNOSTICS.sampleHashDomain}\0${first.sha256}`)
		const secondKey = sha256(`${NATIVE_COMPLETE_PALETTE_DIAGNOSTICS.sampleHashDomain}\0${second.sha256}`)
		return compareAscii(firstKey, secondKey) || compareAscii(first.sha256, second.sha256)
	}).slice(0, NATIVE_COMPLETE_PALETTE_DIAGNOSTIC_SAMPLE_SIZE)
	const included = new Set([...materialChangedSha256, ...controls, ...sample.map((group) => group.sha256)])
	return groups.filter((group) => included.has(group.sha256))
}

type SpawnOptions = {
	projectRoot: string
	childPath: string
	payload: NativeCompletePaletteChildPayload
	abortSignal?: AbortSignal
	onLiveRss?: (pid: number, rssBytes: number) => void
	spawnExecutable?: string
	spawnArguments?: readonly string[]
}

export function nativeCompletePaletteTimeoutError(payload: NativeCompletePaletteChildPayload): Error {
	return new Error(`Child extraction timed out at the frozen ${NATIVE_COMPLETE_PALETTE_CHILD_TIMEOUT_MS}ms ceiling: ` +
		`${payload.source.sha256} ${payload.source.relativePath}`)
}

async function processRssBytes(pid: number): Promise<number> {
	return await new Promise((resolveRss, rejectRss) => {
		const poll = spawn("/bin/ps", ["-o", "rss=", "-p", String(pid)], { stdio: ["ignore", "pipe", "pipe"] })
		let stdout = ""
		let stderr = ""
		poll.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk })
		poll.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk })
		poll.on("error", rejectRss)
		poll.on("close", (code) => {
			if (code !== 0) return rejectRss(new Error(`RSS polling failed: ${stderr.trim()}`))
			const kibibytes = Number(stdout.trim())
			if (!Number.isFinite(kibibytes) || kibibytes < 0) return rejectRss(new Error("RSS polling returned invalid data"))
			resolveRss(kibibytes * 1024)
		})
	})
}

function killChild(child: ChildProcessWithoutNullStreams): void {
	if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
}

export async function spawnNativeCompletePaletteChild(options: SpawnOptions): Promise<ChildExecution> {
	const input = Buffer.from(JSON.stringify(options.payload))
	if (input.byteLength > NATIVE_COMPLETE_PALETTE_CHILD_STDIN_BYTES) throw new Error("Child stdin payload exceeds its frozen ceiling")
	if (options.abortSignal?.aborted) throw new Error("Sealed matrix stopped before this child could start")
	const executable = options.spawnExecutable ?? process.execPath
	const arguments_ = options.spawnArguments ?? ["--experimental-strip-types", options.childPath]
	return await new Promise((resolveChild, rejectChild) => {
		const child = spawn(executable, [...arguments_], {
			cwd: options.projectRoot,
			env: { ...process.env, NODE_NO_WARNINGS: "1" },
			stdio: ["pipe", "pipe", "pipe"],
		})
		const stdout: Buffer[] = []
		const stderr: Buffer[] = []
		let stdoutBytes = 0
		let stderrBytes = 0
		let peakLiveRssBytes = 0
		let terminalError: Error | null = null
		let polling = false
		const fail = (error: Error) => {
			terminalError ??= error
			killChild(child)
		}
		const timeout = setTimeout(() => fail(nativeCompletePaletteTimeoutError(options.payload)),
			NATIVE_COMPLETE_PALETTE_CHILD_TIMEOUT_MS)
		const poll = setInterval(async () => {
			if (polling || child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return
			polling = true
			try {
				const rss = await processRssBytes(child.pid)
				peakLiveRssBytes = Math.max(peakLiveRssBytes, rss)
				options.onLiveRss?.(child.pid, rss)
				if (rss > NATIVE_COMPLETE_PALETTE_CHILD_RSS_BYTES) fail(new Error("Child live RSS exceeded its frozen ceiling"))
			} catch (error) {
				if (child.exitCode === null && child.signalCode === null) fail(error as Error)
			} finally {
				polling = false
			}
		}, NATIVE_COMPLETE_PALETTE_RSS_POLL_INTERVAL_MS)
		const abort = () => fail(new Error("Sealed matrix stopped after another child failure"))
		options.abortSignal?.addEventListener("abort", abort, { once: true })
		child.stdout.on("data", (chunk: Buffer) => {
			stdoutBytes += chunk.byteLength
			if (stdoutBytes > NATIVE_COMPLETE_PALETTE_CHILD_STDOUT_BYTES) fail(new Error("Child stdout exceeded its frozen ceiling"))
			else stdout.push(chunk)
		})
		child.stderr.on("data", (chunk: Buffer) => {
			stderrBytes += chunk.byteLength
			if (stderrBytes > NATIVE_COMPLETE_PALETTE_CHILD_STDERR_BYTES) fail(new Error("Child stderr exceeded its frozen ceiling"))
			else stderr.push(chunk)
		})
		child.stdin.on("error", (error: NodeJS.ErrnoException) => {
			if (error.code !== "EPIPE") fail(error)
		})
		child.on("error", (error) => { terminalError ??= error })
		child.on("close", (code, signal) => {
			clearTimeout(timeout)
			clearInterval(poll)
			options.abortSignal?.removeEventListener("abort", abort)
			options.onLiveRss?.(child.pid ?? -1, 0)
			if (terminalError) return rejectChild(terminalError)
			if (code !== 0) return rejectChild(new Error(
				`Child process failed (${code ?? signal ?? "unknown"}): ${Buffer.concat(stderr).toString("utf8").trim()}`))
			try {
				const source = Buffer.concat(stdout).toString("utf8")
				const output = JSON.parse(source) as NativeCompletePaletteChildOutput
				validateChildEnvelope(output, options.payload)
				if (output.resource.maximumRssBytes > NATIVE_COMPLETE_PALETTE_CHILD_RSS_BYTES ||
					peakLiveRssBytes > NATIVE_COMPLETE_PALETTE_CHILD_RSS_BYTES) {
					throw new Error("Child reported or live RSS exceeded its frozen ceiling")
				}
				decodeCertificateTransport(output)
				resolveChild({ output, stdoutBytes, stderrBytes, peakLiveRssBytes })
			} catch (error) {
				rejectChild(error)
			}
		})
		child.stdin.end(input)
	})
}

function validateChildEnvelope(output: NativeCompletePaletteChildOutput, payload: NativeCompletePaletteChildPayload): void {
	if (output.schemaVersion !== 1 || output.executionVersion !== NATIVE_COMPLETE_PALETTE_EXECUTION_VERSION ||
		output.candidate !== NATIVE_COMPLETE_PALETTE_VERSION || output.policySha256 !== NATIVE_COMPLETE_PALETTE_POLICY_SHA256 ||
		output.mode !== payload.mode || output.source.relativePath !== payload.source.relativePath ||
		output.source.bytes !== payload.source.bytes || output.source.sha256 !== payload.source.sha256 ||
		output.scientific.canonicalExtractionSha256 !== canonicalExtractionScientificSha256(payload.canonical.extraction) ||
		output.scientific.hardViolations.length !== 0 || output.scientific.certificateViolations.length !== 0) {
		throw new Error("Child output envelope or canonical binding is invalid")
	}
}

function childPayload(group: NativeCompletePaletteSourceGroup, mode: NativeCompletePaletteChildMode): NativeCompletePaletteChildPayload {
	return { schemaVersion: 1, mode, source: { relativePath: group.rows[0].path, bytes: group.bytes, sha256: group.sha256 },
		canonical: group.canonical }
}

async function repeatedChild(
	group: NativeCompletePaletteSourceGroup,
	mode: NativeCompletePaletteChildMode,
	context: { projectRoot: string; childPath: string; abort: AbortController; liveRss: Map<number, number>;
		aggregatePeak: { value: number } },
): Promise<RepeatedExecution> {
	const run = async (): Promise<ChildExecution> => await spawnNativeCompletePaletteChild({
		projectRoot: context.projectRoot,
		childPath: context.childPath,
		payload: childPayload(group, mode),
		abortSignal: context.abort.signal,
		onLiveRss: (pid, rss) => {
			if (pid >= 0) context.liveRss.set(pid, rss)
			const aggregate = [...context.liveRss.values()].reduce((sum, value) => sum + value, 0)
			context.aggregatePeak.value = Math.max(context.aggregatePeak.value, aggregate)
			if (aggregate > NATIVE_COMPLETE_PALETTE_AGGREGATE_CHILD_RSS_BYTES) context.abort.abort()
		},
	})
	const first = await run()
	const second = await run()
	assertRepeatedScientificEquality(first.output, second.output)
	return {
		output: first.output,
		resources: [first, second].map((entry) => ({ ...entry.output.resource, stdoutBytes: entry.stdoutBytes,
			stderrBytes: entry.stderrBytes, peakLiveRssBytes: entry.peakLiveRssBytes })) as RepeatedExecution["resources"],
	}
}

async function mapConcurrentStop<T, U>(
	values: readonly T[],
	worker: (value: T, index: number) => Promise<U>,
	abort: AbortController,
): Promise<U[]> {
	const results = new Array<U>(values.length)
	let next = 0
	let firstError: unknown = null
	const workers = Array.from({ length: Math.min(NATIVE_COMPLETE_PALETTE_CONCURRENCY, values.length) }, async () => {
		while (!abort.signal.aborted) {
			const index = next++
			if (index >= values.length) return
			try {
				results[index] = await worker(values[index], index)
			} catch (error) {
				abort.abort()
				firstError ??= error
				return
			}
		}
	})
	await Promise.allSettled(workers)
	if (firstError) throw firstError
	if (abort.signal.aborted && results.some((entry) => entry === undefined)) throw new Error("Sealed matrix aborted")
	return results
}

async function pathAbsent(path: string): Promise<boolean> {
	try {
		await lstat(path)
		return false
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return true
		throw error
	}
}

export async function writeAtomicExclusive(path: string, bytes: string | Uint8Array): Promise<void> {
	const temporary = `${path}.tmp`
	if (!await pathAbsent(path) || !await pathAbsent(temporary)) throw new Error(`Refusing to overwrite artifact path: ${path}`)
	await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 })
	try {
		await link(temporary, path)
	} finally {
		await unlink(temporary).catch(() => {})
	}
}

function assertArtifactFileCeiling(name: keyof typeof NATIVE_COMPLETE_PALETTE_ARTIFACT_FILE_BYTES,
	bytes: string | Uint8Array): void {
	if (Buffer.byteLength(bytes) > NATIVE_COMPLETE_PALETTE_ARTIFACT_FILE_BYTES[name]) {
		throw new Error(`${name} exceeds its frozen artifact byte ceiling`)
	}
}

function shardRelativePath(group: NativeCompletePaletteSourceGroup, mode: NativeCompletePaletteChildMode): string {
	return mode === "base" ? `certificates/base/${group.sha256}.json.gz` :
		`certificates/diagnostics/${mode}/${group.sha256}.json.gz`
}

async function writeShard(stage: string, group: NativeCompletePaletteSourceGroup, mode: NativeCompletePaletteChildMode,
	execution: RepeatedExecution) {
	const decoded = decodeCertificateTransport(execution.output)
	const relativePath = shardRelativePath(group, mode)
	await writeAtomicExclusive(join(stage, relativePath), decoded.gzip)
	return {
		logicalKey: `${mode}\0${group.sha256}`,
		mode,
		sourceSha256: group.sha256,
		evaluatedSourceSha256: execution.output.scientific.evaluatedSourceSha256,
		path: relativePath,
		certificateSha256: execution.output.transport.certificateSha256,
		gzipSha256: execution.output.transport.certificateGzipSha256,
		jsonBytes: execution.output.transport.certificateJsonBytes,
		gzipBytes: execution.output.transport.certificateGzipBytes,
	}
}

function compactExecution(group: NativeCompletePaletteSourceGroup, execution: RepeatedExecution) {
	return {
		sourceSha256: group.sha256,
		bytes: group.bytes,
		paths: group.rows.map((row) => row.path),
		cohorts: [...new Set(group.rows.map((row) => row.cohort))].sort(compareAscii),
		scientific: execution.output.scientific,
		certificate: {
			sha256: execution.output.transport.certificateSha256,
			gzipSha256: execution.output.transport.certificateGzipSha256,
			jsonBytes: execution.output.transport.certificateJsonBytes,
			gzipBytes: execution.output.transport.certificateGzipBytes,
		},
		deterministic: true,
		resources: execution.resources,
	}
}

function diagnosticComparison(base: NativeCompletePaletteScientificSummary,
	diagnostic: NativeCompletePaletteScientificSummary) {
	const roleDistances = Object.fromEntries(roleNames.map((role) => [role,
		okDistance(rgbToOKLab(base.palette[role].rgb), rgbToOKLab(diagnostic.palette[role].rgb))])) as
		Record<RoleName, number>
	return {
		exactPaletteChangedFromBase: !paletteEqual(base.palette, diagnostic.palette),
		materialPaletteChangedFromBase: Object.values(roleDistances).some((distance) =>
			distance > NATIVE_COMPLETE_PALETTE_MATERIAL_OKLAB_DISTANCE) ||
			base.palette.gradient.isGradient !== diagnostic.palette.gradient.isGradient ||
			roleNames.some((role) => base.palette[role].generated !== diagnostic.palette[role].generated),
		roleOklabDistances: roleDistances,
		maximumRoleOklabDistance: Math.max(...Object.values(roleDistances)),
		gradientChangedFromBase: base.palette.gradient.isGradient !== diagnostic.palette.gradient.isGradient,
		fieldStateChangedFromBase: base.fieldStateAfter !== diagnostic.fieldStateAfter,
		generatedStatusChangedFromBase: roleNames.filter((role) =>
			base.palette[role].generated !== diagnostic.palette[role].generated),
	}
}

function resourceSummary(executions: readonly RepeatedExecution[]) {
	const resources = executions.flatMap((execution) => execution.resources)
	return {
		childRuns: resources.length,
		maximumElapsedMs: Math.max(0, ...resources.map((entry) => entry.elapsedMs)),
		maximumReportedRssBytes: Math.max(0, ...resources.map((entry) => entry.maximumRssBytes)),
		maximumLiveRssBytes: Math.max(0, ...resources.map((entry) => entry.peakLiveRssBytes)),
		maximumStdoutBytes: Math.max(0, ...resources.map((entry) => entry.stdoutBytes)),
		maximumStderrBytes: Math.max(0, ...resources.map((entry) => entry.stderrBytes)),
	}
}

function countBy<T extends string>(values: readonly T[], domain: readonly T[]): Record<T, number> {
	return Object.fromEntries(domain.map((value) => [value, values.filter((entry) => entry === value).length])) as Record<T, number>
}

function buildAnalysis(results: any) {
	const groups = results.groups as ReturnType<typeof compactExecution>[]
	const exactChanged = groups.filter((group) => group.scientific.exactChanged)
	const materialChanged = groups.filter((group) => group.scientific.materialChanged)
	const changedAliases = exactChanged.reduce((sum, group) => sum + group.paths.length, 0)
	const materialAliases = materialChanged.reduce((sum, group) => sum + group.paths.length, 0)
	const exactUnchangedCanonicalEquality = groups.every((group) => group.scientific.exactChanged ||
		stableJson(group.scientific.palette) === stableJson(group.scientific.canonicalPalette))
	const roleChanges = Object.fromEntries(roleNames.map((role) => [role, {
		exactGroups: groups.filter((group) => group.scientific.changedRoles.includes(role)).length,
		materialGroups: groups.filter((group) => group.scientific.materialChangedRoles.includes(role)).length,
		exactAliases: groups.filter((group) => group.scientific.changedRoles.includes(role))
			.reduce((sum, group) => sum + group.paths.length, 0),
	}]))
	const controls = NATIVE_COMPLETE_PALETTE_CONTROL_BINDINGS.map((binding) => {
		const group = groups.find((entry) => entry.sourceSha256 === binding.sourceSha256)
		return { ...binding, status: group ? "reported" : "missing", outcome: group?.scientific ?? null }
	})
	const hardViolationCount = groups.reduce((sum, group) => sum + group.scientific.hardViolations.length +
		group.scientific.certificateViolations.length, 0)
	const diagnosticsValid = results.diagnostics.entries.every((entry: any) => entry.deterministic &&
		entry.scientific.hardViolations.length === 0 && entry.scientific.certificateViolations.length === 0)
	const gateA = {
		zeroHardViolations: hardViolationCount === 0,
		exactDeterminism: groups.every((group) => group.deterministic) && results.diagnostics.entries.every((entry: any) => entry.deterministic),
		certificateReconciliation: hardViolationCount === 0 && results.certificateIndex.entryCount ===
			groups.length + results.diagnostics.entries.length,
		atLeastOneMaterialChangedExactSourceGroup: materialChanged.length >= 1,
		atMost40ChangedExactSourceGroups: exactChanged.length <= 40,
		noKnownTechnicalRegression: controls.every((control) => control.status === "reported" && control.outcome !== null &&
			control.outcome.hardViolations.length === 0 && control.outcome.certificateViolations.length === 0) && diagnosticsValid,
		noReserveAccess: true,
		noInterpretedCommentTarget: true,
	}
	return {
		schemaVersion: 1,
		executionVersion: NATIVE_COMPLETE_PALETTE_EXECUTION_VERSION,
		candidate: NATIVE_COMPLETE_PALETTE_VERSION,
		coverage: { rosterPaths: 392, exactSourceGroups: groups.length,
			developmentPaths: groups.flatMap((group) => group.paths).filter((path) => path.startsWith("images/")).length,
			cohort00Paths: groups.flatMap((group) => group.paths).filter((path) => path.startsWith("00/")).length },
		changes: { exactGroups: exactChanged.length, materialGroups: materialChanged.length, changedAliases,
			materialAliases, exactGroupSha256: exactChanged.map((group) => group.sourceSha256),
			materialGroupSha256: materialChanged.map((group) => group.sourceSha256), roleChanges,
			gradientGroups: groups.filter((group) => group.scientific.gradientChanged).length,
			generatedStatusGroups: groups.filter((group) => group.scientific.generatedStatusChangedRoles.length > 0).length,
			fieldStateTransitions: countBy(groups.filter((group) =>
				group.scientific.fieldStateBefore !== group.scientific.fieldStateAfter).map((group) =>
				`${group.scientific.fieldStateBefore}->${group.scientific.fieldStateAfter}`),
				["collapsed->distinct-flat", "collapsed->gradient", "distinct-flat->collapsed", "distinct-flat->gradient",
					"gradient->collapsed", "gradient->distinct-flat"]),
			fallbackGroups: groups.filter((group) => group.scientific.selectedGeneratedForeground).length,
			collapsedBeforeGroups: groups.filter((group) => group.scientific.fieldStateBefore === "collapsed").length,
			collapsedAfterGroups: groups.filter((group) => group.scientific.fieldStateAfter === "collapsed").length },
		familyCoverage: { minimum: Math.min(...groups.map((group) => group.scientific.familyCoverage ?? Infinity)),
			maximum: Math.max(...groups.map((group) => group.scientific.familyCoverage ?? -Infinity)),
			unavailable: groups.filter((group) => group.scientific.familyCoverage === null).length },
		resources: results.resources,
		violations: { hard: hardViolationCount, certificate: 0, entries: [] },
		exactUnchangedCanonicalEquality,
		controls: { interpretation: "diagnostic-outcomes-only-no-target-or-quality-label", matrix: controls,
			external: NATIVE_COMPLETE_PALETTE_EXTERNAL_CONTROL_BINDINGS },
		diagnostics: { ...results.diagnostics.summary,
			byTransform: Object.fromEntries(NATIVE_COMPLETE_PALETTE_DIAGNOSTICS.transforms.map((mode) => {
				const entries = results.diagnostics.entries.filter((entry: any) => entry.mode === mode)
				return [mode, { groups: entries.length,
					exactChangedFromBase: entries.filter((entry: any) => entry.comparisonToBase.exactPaletteChangedFromBase).length,
					materialChangedFromBase: entries.filter((entry: any) => entry.comparisonToBase.materialPaletteChangedFromBase).length,
					maximumRoleOklabDistance: Math.max(0, ...entries.map((entry: any) =>
						entry.comparisonToBase.maximumRoleOklabDistance)) }]
			})),
			limitation: NATIVE_COMPLETE_PALETTE_DIAGNOSTICS.limitation,
			gateUse: NATIVE_COMPLETE_PALETTE_DIAGNOSTICS.gateUse },
		gateA: { ...gateA, passed: Object.values(gateA).every(Boolean) },
		nextAuthorization: Object.values(gateA).every(Boolean)
			? "human-pause-1-no-review-artifacts-generated"
			: "candidate-rejected-no-review-authorized",
	}
}

function orderedAggregate(entries: readonly any[]): string {
	const hash = createHash("sha256").update("native-complete-palette-certificate-index-v1\0")
	for (const entry of entries) hash.update(`${entry.logicalKey}\0${entry.path}\0${entry.certificateSha256}\0${entry.gzipSha256}\n`)
	return hash.digest("hex")
}

async function prepareStage(projectRoot: string): Promise<string> {
	const experiment = resolve(projectRoot, NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.experiment)
	const metadata = await lstat(experiment)
	if (!metadata.isDirectory() || metadata.isSymbolicLink() || await realpath(experiment) !== experiment) {
		throw new Error("Candidate experiment root must be a physical directory")
	}
	for (const path of [NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.staging, NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.final,
		NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.failure]) {
		if (!await pathAbsent(resolve(projectRoot, path))) throw new Error(`Refusing to overwrite prior Phase 5 namespace: ${path}`)
	}
	const stage = resolve(projectRoot, NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.staging)
	await mkdir(stage, { recursive: false, mode: 0o700 })
	for (const path of ["certificates", "certificates/base", "certificates/diagnostics",
		...NATIVE_COMPLETE_PALETTE_DIAGNOSTICS.transforms.map((mode) => `certificates/diagnostics/${mode}`)]) {
		await mkdir(join(stage, path), { recursive: false, mode: 0o700 })
	}
	return stage
}

async function preserveFailure(stage: string, projectRoot: string, error: unknown, completed: readonly unknown[]): Promise<never> {
	const failure = {
		schemaVersion: 1,
		executionVersion: NATIVE_COMPLETE_PALETTE_EXECUTION_VERSION,
		status: "stopped",
		error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack ?? null } : { message: String(error) },
		completed,
		continuationAuthorized: false,
		candidateInspectionAuthorized: false,
	}
	const failureSource = `${JSON.stringify(failure, null, 2)}\n`
	assertArtifactFileCeiling("failure.json", failureSource)
	await writeAtomicExclusive(join(stage, NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.failureRecord), failureSource)
	const failed = resolve(projectRoot, NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.failure)
	await rename(stage, failed)
	throw new Error(`Sealed Phase 5 matrix stopped; failure artifact preserved at ${failed}`, { cause: error })
}

export async function executeNativeCompletePaletteSealedMatrix(
	projectRoot = fileURLToPath(new URL("..", import.meta.url)),
): Promise<string> {
	const stage = await prepareStage(projectRoot)
	const abort = new AbortController()
	const completed: any[] = []
	const shardEntries: any[] = []
	try {
		const preflight = await preflightNativeCompletePalette(projectRoot)
		const context = { projectRoot, childPath: fileURLToPath(new URL("./native-complete-palette-child.ts", import.meta.url)),
			abort, liveRss: new Map<number, number>(), aggregatePeak: { value: 0 } }
		let changed = 0
		const base = await mapConcurrentStop(preflight.groups, async (group, index) => {
			const execution = await repeatedChild(group, "base", context)
			if (execution.output.scientific.exactChanged && ++changed > NATIVE_COMPLETE_PALETTE_POLICY.maximumChangedExactSourceGroups) {
				throw new Error("Changed exact-source frontier exceeded the frozen maximum of 40")
			}
			shardEntries.push(await writeShard(stage, group, "base", execution))
			completed.push({ mode: "base", sourceSha256: group.sha256 })
			process.stderr.write(`[${index + 1}/${preflight.groups.length}] ${group.sha256} ${group.rows[0].path}\n`)
			return execution
		}, abort)
		const material = new Set(preflight.groups.filter((_, index) => base[index].output.scientific.materialChanged)
			.map((group) => group.sha256))
		if (material.size === 0) throw new Error("Sealed base matrix produced no material changed exact-source group")
		const diagnosticCohort = selectNativeCompletePaletteDiagnosticCohort(preflight.groups, material)
		const diagnosticTasks = diagnosticCohort.flatMap((group) =>
			NATIVE_COMPLETE_PALETTE_DIAGNOSTICS.transforms.map((mode) => ({ group, mode })))
		const diagnostics = await mapConcurrentStop(diagnosticTasks, async ({ group, mode }, index) => {
			const execution = await repeatedChild(group, mode, context)
			shardEntries.push(await writeShard(stage, group, mode, execution))
			completed.push({ mode, sourceSha256: group.sha256 })
			process.stderr.write(`[diagnostic ${index + 1}/${diagnosticTasks.length}] ${mode} ${group.sha256}\n`)
			return { group, mode, execution }
		}, abort)
		shardEntries.sort((first, second) => compareAscii(first.logicalKey, second.logicalKey))
		const certificateIndex = { schemaVersion: 1, format: "stable-json+gzip", entryCount: shardEntries.length,
			orderedAggregateSha256: orderedAggregate(shardEntries), entries: shardEntries }
		const resultGroups = preflight.groups.map((group, index) => compactExecution(group, base[index]))
		const baseBySha = new Map(preflight.groups.map((group, index) => [group.sha256, base[index].output.scientific]))
		const diagnosticEntries = diagnostics.map(({ group, mode, execution }) => ({ mode,
			...compactExecution(group, execution),
			comparisonToBase: diagnosticComparison(baseBySha.get(group.sha256)!, execution.output.scientific) }))
		const results: any = {
			schemaVersion: 1,
			executionVersion: NATIVE_COMPLETE_PALETTE_EXECUTION_VERSION,
			candidate: NATIVE_COMPLETE_PALETTE_VERSION,
			policySha256: NATIVE_COMPLETE_PALETTE_POLICY_SHA256,
			schedule: "encoded-sha256-then-path-ascii",
			groups: resultGroups,
			diagnostics: {
				policy: NATIVE_COMPLETE_PALETTE_DIAGNOSTICS,
				cohortSha256: diagnosticCohort.map((group) => group.sha256),
				entries: diagnosticEntries,
				summary: { cohortGroups: diagnosticCohort.length, transformedExtractions: diagnosticEntries.length,
					scaleDisagreementBaseGroups: resultGroups.filter((group) => group.scientific.scaleDisagreementCount > 0).length },
			},
			resources: { ...resourceSummary([...base, ...diagnostics.map((entry) => entry.execution)]),
				maximumAggregateLiveRssBytes: context.aggregatePeak.value,
				aggregateDeclaredChildCeilingBytes: NATIVE_COMPLETE_PALETTE_AGGREGATE_CHILD_RSS_BYTES },
			certificateIndex: { entryCount: certificateIndex.entryCount,
				orderedAggregateSha256: certificateIndex.orderedAggregateSha256 },
		}
		const analysis = buildAnalysis(results)
		if (!analysis.gateA.passed) throw new Error("Mechanical Gate A failed after the complete sealed run")
		const resultsSource = `${JSON.stringify(results, null, 2)}\n`
		const analysisSource = `${JSON.stringify(analysis, null, 2)}\n`
		const indexSource = `${JSON.stringify(certificateIndex, null, 2)}\n`
		assertArtifactFileCeiling("results.json", resultsSource)
		assertArtifactFileCeiling("analysis.json", analysisSource)
		assertArtifactFileCeiling("certificate-index.json", indexSource)
		await writeAtomicExclusive(join(stage, NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.results), resultsSource)
		await writeAtomicExclusive(join(stage, NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.analysis), analysisSource)
		await writeAtomicExclusive(join(stage, NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.certificateIndex), indexSource)
		const manifest = {
			schemaVersion: 1,
			executionVersion: NATIVE_COMPLETE_PALETTE_EXECUTION_VERSION,
			candidate: NATIVE_COMPLETE_PALETTE_VERSION,
			policySha256: NATIVE_COMPLETE_PALETTE_POLICY_SHA256,
			protocolSha256: preflight.protocolSha256,
			status: "phase-5-matrix-complete-gate-a-pass",
			artifactHashes: {
				[NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.results]: sha256(resultsSource),
				[NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.analysis]: sha256(analysisSource),
				[NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.certificateIndex]: sha256(indexSource),
			},
			certificateOrderedAggregateSha256: certificateIndex.orderedAggregateSha256,
			publication: { noOverwrite: true, staging: ".phase-5.staging", atomicDirectoryRename: true,
				reviewArtifactsGenerated: false },
		}
		const manifestSource = `${JSON.stringify(manifest, null, 2)}\n`
		assertArtifactFileCeiling("manifest.json", manifestSource)
		await writeAtomicExclusive(join(stage, NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.manifest), manifestSource)
		await verifyNativeCompletePaletteArtifact(stage, projectRoot, true)
		const final = resolve(projectRoot, NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.final)
		await rename(stage, final)
		await verifyNativeCompletePaletteArtifact(final, projectRoot, true)
		return final
	} catch (error) {
		return await preserveFailure(stage, projectRoot, error, completed)
	}
}

async function assertPhysicalFile(path: string): Promise<Buffer> {
	const metadata = await lstat(path)
	if (!metadata.isFile() || metadata.isSymbolicLink() || await realpath(path) !== resolve(path)) {
		throw new Error(`Artifact is not a physical file: ${path}`)
	}
	return await readFile(path)
}

export async function verifyNativeCompletePaletteArtifact(
	artifactDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)), NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.final),
	projectRoot = fileURLToPath(new URL("..", import.meta.url)),
	allowStaging = false,
) {
	const metadata = await lstat(artifactDirectory)
	if (!metadata.isDirectory() || metadata.isSymbolicLink() || await realpath(artifactDirectory) !== resolve(artifactDirectory) ||
		!allowStaging && resolve(artifactDirectory) !== resolve(projectRoot, NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.final)) {
		throw new Error("Phase 5 artifact directory is invalid")
	}
	const topNames = (await readdir(artifactDirectory)).sort(compareAscii)
	if (topNames.join("\0") !== ["analysis.json", "certificate-index.json", "certificates", "manifest.json", "results.json"].join("\0")) {
		throw new Error("Phase 5 artifact top-level file set is invalid")
	}
	const sources = Object.fromEntries(await Promise.all([
		NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.results,
		NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.analysis,
		NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.certificateIndex,
		NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.manifest,
	].map(async (name) => [name, (await assertPhysicalFile(join(artifactDirectory, name))).toString("utf8")] as const)))
	const manifest = record(JSON.parse(sources["manifest.json"]), "Phase 5 manifest")
	const results = record(JSON.parse(sources["results.json"]), "Phase 5 results") as any
	const analysis = record(JSON.parse(sources["analysis.json"]), "Phase 5 analysis") as any
	const index = record(JSON.parse(sources["certificate-index.json"]), "Phase 5 certificate index") as any
	if (manifest.schemaVersion !== 1 || manifest.executionVersion !== NATIVE_COMPLETE_PALETTE_EXECUTION_VERSION ||
		manifest.candidate !== NATIVE_COMPLETE_PALETTE_VERSION || manifest.policySha256 !== NATIVE_COMPLETE_PALETTE_POLICY_SHA256 ||
		manifest.status !== "phase-5-matrix-complete-gate-a-pass" || !index.entries ||
		results.groups.length !== 391 || results.groups.reduce((sum: number, group: any) => sum + group.paths.length, 0) !== 392) {
		throw new Error("Phase 5 artifact identity or coverage is invalid")
	}
	const hashes = record(manifest.artifactHashes, "Phase 5 artifact hashes")
	for (const name of ["results.json", "analysis.json", "certificate-index.json"]) {
		if (hashes[name] !== sha256(sources[name])) throw new Error(`Phase 5 artifact hash mismatch: ${name}`)
	}
	const protocolSource = await readFile(resolve(projectRoot, NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.protocol), "utf8")
	const protocol = parseNativeCompletePaletteProtocol(protocolSource) as Readonly<Record<string, unknown>>
	if (manifest.protocolSha256 !== sha256(protocolSource)) throw new Error("Published protocol hash mismatch")
	await verifyNativeCompletePaletteImplementationClosure(protocol, projectRoot)
	if (index.schemaVersion !== 1 || index.format !== "stable-json+gzip" || index.entryCount !== index.entries.length ||
		index.entryCount !== results.groups.length + results.diagnostics.entries.length ||
		index.orderedAggregateSha256 !== orderedAggregate(index.entries) ||
		manifest.certificateOrderedAggregateSha256 !== index.orderedAggregateSha256) {
		throw new Error("Certificate index does not reconcile")
	}
	const expectedShardPaths = new Set<string>()
	const resultByKey = new Map<string, any>()
	for (const group of results.groups) resultByKey.set(`base\0${group.sourceSha256}`, group)
	for (const entry of results.diagnostics.entries) resultByKey.set(`${entry.mode}\0${entry.sourceSha256}`, entry)
	for (const entry of index.entries) {
		if (typeof entry.path !== "string" || expectedShardPaths.has(entry.path) || dirname(entry.path) === "." ||
			basename(entry.path) !== `${entry.sourceSha256}.json.gz`) throw new Error("Certificate shard path is invalid")
		expectedShardPaths.add(entry.path)
		const gzip = await assertPhysicalFile(join(artifactDirectory, entry.path))
		const json = gunzipSync(gzip).toString("utf8")
		const certificate = deepFreeze(JSON.parse(json)) as NativeCompletePaletteCertificate
		const resultEntry = resultByKey.get(entry.logicalKey)
		if (gzip.byteLength !== entry.gzipBytes || Buffer.byteLength(json) !== entry.jsonBytes ||
			sha256(gzip) !== entry.gzipSha256 || sha256(json) !== entry.certificateSha256 || stableJson(certificate) !== json ||
			certificate.source.sha256 !== entry.evaluatedSourceSha256 || !resultEntry ||
			certificate.hashes.selectedPaletteSha256 !== sha256(stableJson(resultEntry.scientific.palette))) {
			throw new Error(`Certificate shard failed independent verification: ${entry.path}`)
		}
		const serializedSummary = validateNativeCompletePaletteResult({
			result: { certificate, palette: deepFreeze(structuredClone(resultEntry.scientific.palette)) },
			canonical: deepFreeze(structuredClone(resultEntry.scientific.canonicalPalette)),
			sourceSha256: entry.evaluatedSourceSha256,
			exactReferenceRequired: false,
		})
		for (const key of ["exactChanged", "materialChanged", "changedRoles", "materialChangedRoles",
			"generatedStatusChangedRoles", "gradientChanged", "fieldStateBefore", "fieldStateAfter",
			"selectedGeneratedForeground", "familyCoverage", "scaleDisagreementCount"] as const) {
			if (!isDeepStrictEqual(serializedSummary[key], resultEntry.scientific[key])) {
				throw new Error(`Certificate shard scientific summary mismatch: ${entry.path} ${key}`)
			}
		}
	}
	const actualShardPaths: string[] = []
	for (const base of ["certificates/base", ...NATIVE_COMPLETE_PALETTE_DIAGNOSTICS.transforms.map((mode) =>
		`certificates/diagnostics/${mode}`)]) {
		for (const name of await readdir(join(artifactDirectory, base))) actualShardPaths.push(`${base}/${name}`)
	}
	if (actualShardPaths.sort(compareAscii).join("\0") !== [...expectedShardPaths].sort(compareAscii).join("\0")) {
		throw new Error("Certificate shard file set does not match the index")
	}
	const expectedAnalysis = buildAnalysis(results)
	if (!isDeepStrictEqual(analysis, expectedAnalysis) || analysis.gateA.passed !== true ||
		Object.values(analysis.gateA).some((value) => value !== true) || analysis.exactUnchangedCanonicalEquality !== true) {
		throw new Error("Phase 5 analysis counts or Gate A do not independently reconcile")
	}
	return { manifest, results, analysis, certificateIndex: index }
}

export function parseNativeCompletePaletteEvaluationArguments(arguments_: readonly string[]): { execute: true } {
	if (arguments_.length !== 1 || arguments_[0] !== "--execute-sealed-matrix") {
		throw new Error("Usage: evaluate-native-complete-palette.ts --execute-sealed-matrix")
	}
	return { execute: true }
}

async function main(): Promise<void> {
	parseNativeCompletePaletteEvaluationArguments(process.argv.slice(2))
	process.stdout.write(`${await executeNativeCompletePaletteSealedMatrix()}\n`)
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main().catch((error) => {
	process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
	process.exitCode = 1
})
