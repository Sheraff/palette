import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import sharp from "sharp"
import {
	NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS,
	NATIVE_COMPLETE_PALETTE_CANONICAL_DEVELOPMENT_SHA256,
	NATIVE_COMPLETE_PALETTE_CONTROL_BINDINGS,
	NATIVE_COMPLETE_PALETTE_DIAGNOSTIC_SAMPLE_SIZE,
	assertRepeatedScientificEquality,
	buildExactSourceGroups,
	canonicalExtractionScientificSha256,
	canonicalExtractionScientificValue,
	nativeCompletePaletteTimeoutError,
	parseNativeCompletePaletteEvaluationArguments,
	selectNativeCompletePaletteDiagnosticCohort,
	sha256,
	spawnNativeCompletePaletteChild,
	stableJson,
	validateNativeCompletePaletteResult,
	writeAtomicExclusive,
	type NativeCompletePaletteCanonicalBinding,
	type NativeCompletePaletteChildOutput,
	type NativeCompletePaletteRosterRow,
	type NativeCompletePaletteSourceGroup,
} from "../evaluate-native-complete-palette.ts"
import {
	parseNativeCompletePaletteChildPayload,
	evaluateNativeCompletePaletteSource,
	resolveNativeCompletePaletteSource,
	transformNativeCompletePaletteSource,
} from "../native-complete-palette-child.ts"
import { extractPalette } from "../src/extract.ts"
import { loadImage } from "../src/image.ts"
import {
	buildNativeCompletePalette,
	NATIVE_COMPLETE_PALETTE_POLICY_SHA256,
	NATIVE_COMPLETE_PALETTE_VERSION,
} from "../src/native-complete-palette.ts"
import { loadNativeImage } from "../src/native-resolution-image.ts"
import type { ExtractionResult, Palette, RGB } from "../src/types.ts"

function role(rgb: RGB, generated = false) {
	return { rgb, hex: `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`,
		generated, sourceDistance: 0 }
}

function deeplyFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value
	for (const child of Object.values(value)) deeplyFreeze(child)
	return Object.freeze(value)
}

function palette(): Palette {
	return {
		background: role([10, 20, 30]), foreground: role([240, 240, 240]),
		surface: role([40, 50, 60]), accent: role([200, 100, 20]),
		gradient: { isGradient: false, confidence: 1, coverage: 0, continuity: 0, coherence: 0 },
		score: 0.5,
		metrics: { foregroundContrast: 10, foregroundSurfaceContrast: 8, accentContrast: 3,
			accentSurfaceContrast: 2, minimumRoleDistance: 0.1, meanSourceDistance: 0, meanReconstructionError: 0.1 },
	}
}

function extraction(processingMs = 1): ExtractionResult {
	const value = palette()
	return {
		version: "region-graph-0.19.0", width: 2, height: 2,
		methods: { spatial: value, expressive: structuredClone(value), quantized: structuredClone(value) },
		candidates: [], diagnostics: { regionCount: 1, candidateCount: 4, processingMs },
	}
}

function canonical(path: string, value = extraction()): NativeCompletePaletteCanonicalBinding {
	return {
		artifactPath: path.startsWith("images/") ? "research/data/results.json" : "research/data/holdout-results.json",
		artifactSha256: path.startsWith("images/") ? NATIVE_COMPLETE_PALETTE_CANONICAL_DEVELOPMENT_SHA256 :
			"5a7766dc9a41733fe76dcdd40c236ce4c394280143b0a246251570301daa7984",
		entryFile: path.startsWith("images/") ? path.slice(7) : path,
		extraction: value,
	}
}

function group(index: number, digest = index.toString(16).padStart(64, "0")): NativeCompletePaletteSourceGroup {
	const path = `images/synthetic-${index}.png`
	return { sha256: digest, bytes: 10 + index,
		rows: [{ cohort: "development", path, sha256: digest, bytes: 10 + index }], canonical: canonical(path) }
}

function output(resource = { elapsedMs: 1, maximumRssBytes: 10 }): NativeCompletePaletteChildOutput {
	return {
		schemaVersion: 1,
		executionVersion: "native-complete-palette-phase-5-execution-v2.5",
		candidate: NATIVE_COMPLETE_PALETTE_VERSION,
		policySha256: NATIVE_COMPLETE_PALETTE_POLICY_SHA256,
		mode: "base",
		source: { relativePath: "images/synthetic.png", bytes: 10, sha256: "0".repeat(64) },
		scientific: {
			evaluatedSourceSha256: "0".repeat(64), canonicalExtractionSha256: "1".repeat(64),
			canonicalPalette: palette(), palette: palette(), exactChanged: false, materialChanged: false,
			changedRoles: [], materialChangedRoles: [], generatedStatusChangedRoles: [], gradientChanged: false,
			fieldStateBefore: "distinct-flat", fieldStateAfter: "distinct-flat", selectedGeneratedForeground: false,
			familyCoverage: 0.5, scaleDisagreementCount: 0, hardViolations: [], certificateViolations: [],
		},
		transport: { format: "stable-json+gzip-base64", gzipLevel: 9, certificateJsonBytes: 2,
			certificateGzipBytes: 2, certificateSha256: "2".repeat(64), certificateGzipSha256: "3".repeat(64),
			certificateGzipBase64: "eA==" },
		resource,
	}
}

test("child parser accepts one strict bound payload and rejects reserve or traversal paths before access", () => {
	const payload = {
		schemaVersion: 1, mode: "base",
		source: { relativePath: "images/synthetic.png", bytes: 10, sha256: "0".repeat(64) },
		canonical: canonical("images/synthetic.png"),
	}
	assert.deepEqual(parseNativeCompletePaletteChildPayload(JSON.stringify(payload)), payload)
	assert.throws(() => parseNativeCompletePaletteChildPayload(`${JSON.stringify(payload)}\n{}`), /exactly one/)
	assert.throws(() => parseNativeCompletePaletteChildPayload(JSON.stringify({ ...payload, extra: true })), /unexpected/)
	assert.throws(() => resolveNativeCompletePaletteSource("/tmp/project", "10/secret.jpg"), /Reserve.*before file access/)
	for (const path of ["images/../secret.jpg", "images/a/b.jpg", "other/a.jpg", "images\\a.jpg"]) {
		assert.throws(() => resolveNativeCompletePaletteSource("/tmp/project", path), /invalid|accepts only/)
	}
	assert.equal(resolveNativeCompletePaletteSource("/tmp/project", "00/a.jpg"), "/tmp/project/00/a.jpg")
	assert.match(nativeCompletePaletteTimeoutError(payload).message,
		/600000ms ceiling: 0{64} images\/synthetic\.png/)
})

test("canonical scientific comparison excludes only processing timing", () => {
	const first = extraction(1)
	const second = extraction(999)
	assert.deepEqual(canonicalExtractionScientificValue(first), canonicalExtractionScientificValue(second))
	assert.equal(canonicalExtractionScientificSha256(first), canonicalExtractionScientificSha256(second))
	second.diagnostics.regionCount++
	assert.notEqual(canonicalExtractionScientificSha256(first), canonicalExtractionScientificSha256(second))
})

test("exact aliases form one SHA-scheduled run and must share canonical semantics", () => {
	const digest = "a".repeat(64)
	const rows: NativeCompletePaletteRosterRow[] = [
		{ cohort: "development", path: "images/z.png", sha256: digest, bytes: 20 },
		{ cohort: "development", path: "images/a.png", sha256: digest, bytes: 20 },
		{ cohort: "00", path: "00/b.png", sha256: "0".repeat(64), bytes: 10 },
	]
	const canonicals = new Map(rows.map((row) => [row.path, canonical(row.path, extraction(row.path === "images/z.png" ? 2 : 1))]))
	const groups = buildExactSourceGroups(rows, canonicals)
	assert.equal(groups.length, 2)
	assert.deepEqual(groups[1].rows.map((row) => row.path), ["images/a.png", "images/z.png"])
	canonicals.get("images/z.png")!.extraction.diagnostics.regionCount++
	assert.throws(() => buildExactSourceGroups(rows, canonicals), /aliases disagree/)
})

test("repeat equality excludes resource timing but includes the exact compressed certificate", () => {
	assert.doesNotThrow(() => assertRepeatedScientificEquality(output(), output({ elapsedMs: 9, maximumRssBytes: 20 })))
	const changed = output()
	changed.transport.certificateGzipBase64 = "eQ=="
	assert.throws(() => assertRepeatedScientificEquality(output(), changed), /nondeterministic/)
})

test("diagnostic cohort is the deterministic union of controls, changed frontier, and 16 SHA-selected groups", () => {
	const groups = Array.from({ length: 30 }, (_, index) => group(index + 100))
	for (const [index, control] of NATIVE_COMPLETE_PALETTE_CONTROL_BINDINGS.entries()) {
		groups[index] = group(index, control.sourceSha256)
	}
	const changed = new Set([groups[29].sha256])
	const first = selectNativeCompletePaletteDiagnosticCohort(groups, changed)
	const second = selectNativeCompletePaletteDiagnosticCohort([...groups], changed)
	assert.deepEqual(first.map((entry) => entry.sha256), second.map((entry) => entry.sha256))
	assert.ok(first.some((entry) => entry.sha256 === groups[29].sha256))
	for (const control of NATIVE_COMPLETE_PALETTE_CONTROL_BINDINGS) {
		assert.ok(first.some((entry) => entry.sha256 === control.sourceSha256))
	}
	assert.ok(first.length >= NATIVE_COMPLETE_PALETTE_DIAGNOSTIC_SAMPLE_SIZE)
})

test("frozen transforms are deterministic on synthetic encoded bytes", async () => {
	const raw = Buffer.alloc(12 * 10 * 3)
	for (let index = 0; index < raw.length; index++) raw[index] = index % 251
	const encoded = await sharp(raw, { raw: { width: 12, height: 10, channels: 3 } }).png().toBuffer()
	for (const mode of ["resize", "crop", "reencode", "noise"] as const) {
		const first = await transformNativeCompletePaletteSource(encoded, mode)
		const second = await transformNativeCompletePaletteSource(encoded, mode)
		assert.deepEqual(first, second, mode)
		assert.notEqual(first.byteLength, 0)
	}
})

test("child execution reproduces canonical and validates a full synthetic certificate without discovery", async () => {
	const projectRoot = await realpath(await mkdtemp(join(tmpdir(), "native-complete-child-")))
	try {
		await mkdir(join(projectRoot, "images"))
		const width = 96
		const height = 64
		const raw = Buffer.alloc(width * height * 3)
		for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
			const rgb = x < width / 2 ? [12, 24, 52] : y < height / 2 ? [230, 190, 80] : [180, 40, 35]
			raw.set(rgb, (y * width + x) * 3)
		}
		const encoded = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer()
		await writeFile(join(projectRoot, "images", "synthetic.png"), encoded)
		const expected = extractPalette(await loadImage(encoded))
		const result = await evaluateNativeCompletePaletteSource(projectRoot, {
			schemaVersion: 1,
			mode: "base",
			source: { relativePath: "images/synthetic.png", bytes: encoded.byteLength, sha256: sha256(encoded) },
			canonical: canonical("images/synthetic.png", expected),
		})
		assert.equal(result.scientific.canonicalExtractionSha256, canonicalExtractionScientificSha256(expected))
		assert.deepEqual(result.scientific.hardViolations, [])
		assert.deepEqual(result.scientific.certificateViolations, [])
		assert.match(result.transport.certificateSha256, /^[0-9a-f]{64}$/)
		const inconsistentCanonical = structuredClone(expected.methods.spatial)
		inconsistentCanonical.surface = structuredClone(inconsistentCanonical.background)
		inconsistentCanonical.gradient.isGradient = true
		inconsistentCanonical.accent.generated = true
		const native = await loadNativeImage(encoded)
		const selected = buildNativeCompletePalette(native, sha256(encoded), inconsistentCanonical)
		assert.equal(selected.palette, inconsistentCanonical)
		assert.doesNotThrow(() => validateNativeCompletePaletteResult({
			result: selected,
			canonical: inconsistentCanonical,
			sourceSha256: sha256(encoded),
			native,
			exactReferenceRequired: true,
		}))
		assert.doesNotThrow(() => validateNativeCompletePaletteResult({
			result: {
				palette: structuredClone(selected.palette),
				certificate: deeplyFreeze(JSON.parse(stableJson(selected.certificate))),
			},
			canonical: inconsistentCanonical,
			sourceSha256: sha256(encoded),
			native,
			exactReferenceRequired: false,
		}))
	} finally {
		await rm(projectRoot, { recursive: true, force: true })
	}
})

test("exclusive atomic writer never overwrites and artifact paths are closed", async () => {
	const directory = await mkdtemp(join(tmpdir(), "native-complete-evaluation-"))
	try {
		await mkdir(join(directory, "out"))
		const path = join(directory, "out", "value.json")
		await writeAtomicExclusive(path, "first")
		assert.equal(await readFile(path, "utf8"), "first")
		await assert.rejects(writeAtomicExclusive(path, "second"), /overwrite/)
		assert.equal(await readFile(path, "utf8"), "first")
		assert.equal(NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.final.endsWith("/phase-5"), true)
		assert.equal(NATIVE_COMPLETE_PALETTE_ARTIFACT_PATHS.failure.endsWith("/phase-5-failed"), true)
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
})

test("parent kills a synthetic child instead of silently truncating oversized stdout", async () => {
	const projectRoot = await realpath(await mkdtemp(join(tmpdir(), "native-complete-process-")))
	try {
		const script = join(projectRoot, "oversized.mjs")
		await writeFile(script, "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write(Buffer.alloc(12582913)))\n")
		await assert.rejects(spawnNativeCompletePaletteChild({
			projectRoot,
			childPath: script,
			payload: {
				schemaVersion: 1, mode: "base",
				source: { relativePath: "images/synthetic.png", bytes: 10, sha256: "0".repeat(64) },
				canonical: canonical("images/synthetic.png"),
			},
			spawnExecutable: process.execPath,
			spawnArguments: [script],
		}), /stdout exceeded its frozen ceiling/)
	} finally {
		await rm(projectRoot, { recursive: true, force: true })
	}
})

test("sealed evaluator has one exact execution command and stable JSON uses ASCII keys", () => {
	assert.deepEqual(parseNativeCompletePaletteEvaluationArguments(["--execute-sealed-matrix"]), { execute: true })
	for (const arguments_ of [[], ["--limit", "1"], ["--execute-sealed-matrix", "--again"]]) {
		assert.throws(() => parseNativeCompletePaletteEvaluationArguments(arguments_), /Usage/)
	}
	assert.equal(stableJson({ z: 1, A: 2, a: 3 }), "{\"A\":2,\"a\":3,\"z\":1}")
	assert.equal(sha256("fixture").length, 64)
})
