import { createHash, randomUUID } from "node:crypto"
import { link, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { nameRGB } from "./src/color-name.ts"
import { computeSemanticResultsSha256, selectionTracks, validateSelectionManifest } from "./src/corpus-selection.ts"
import {
	PALETTE_ROLE_00_AUDIT_ALGORITHM_VERSION,
	PALETTE_ROLE_00_AUDIT_BATCH_COUNT,
	PALETTE_ROLE_00_AUDIT_BATCH_SIZE,
	PALETTE_ROLE_00_AUDIT_PRESENTATION_VERSION,
	PALETTE_ROLE_00_CANONICAL_ENTRY_COUNT,
	PALETTE_ROLE_00_AUDIT_VERSION,
	paletteRole00AuditBackgroundSurface,
	paletteRole00AuditCaseId,
	paletteRole00AuditImplementationFiles,
	paletteRole00AuditManifestId,
	paletteRole00AuditOrderKey,
	paletteRole00AuditPresentationFiles,
	paletteRole00AuditRoles,
	paletteRole00AuditSample,
	parsePaletteRole00AuditManifest,
	type PaletteRole00AuditEntry,
	type PaletteRole00AuditManifest,
	type PaletteRole00AuditPresentedPalette,
} from "./src/palette-role-00-audit.ts"
import type { CorpusResult, Palette, RGB } from "./src/types.ts"

const [outputArgument, ...unexpected] = process.argv.slice(2)
if (!outputArgument || unexpected.length > 0) {
	throw new Error("Usage: prepare-palette-role-00-audit.ts <manifest.json>")
}

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const researchRoot = fileURLToPath(new URL(".", import.meta.url))
const holdoutPath = resolve(researchRoot, "data/holdout-results.json")
const selectionPath = resolve(researchRoot, "data/selection.json")
const outputPath = resolve(outputArgument)

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isRGB(value: unknown): value is RGB {
	return Array.isArray(value) && value.length === 3 && value.every((channel) =>
		Number.isInteger(channel) && channel >= 0 && channel <= 255)
}

function assertFinite(value: unknown, label: string, minimum = -Infinity): asserts value is number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) throw new Error(`${label} is invalid`)
}

function parseCanonicalHoldout(value: unknown): CorpusResult {
	if (!isRecord(value) || typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt)) ||
		value.algorithmVersion !== PALETTE_ROLE_00_AUDIT_ALGORITHM_VERSION || !Array.isArray(value.entries) ||
		value.entries.length !== PALETTE_ROLE_00_CANONICAL_ENTRY_COUNT) {
		throw new Error(`Canonical holdout must contain exactly ${PALETTE_ROLE_00_CANONICAL_ENTRY_COUNT} ${PALETTE_ROLE_00_AUDIT_ALGORITHM_VERSION} entries`)
	}
	const files = new Set<string>()
	for (const [index, entry] of value.entries.entries()) {
		const label = `Canonical holdout entry ${index}`
		if (!isRecord(entry) || typeof entry.file !== "string" || !/^00\/[^/\\]+$/.test(entry.file) || files.has(entry.file) ||
			entry.kind !== "holdout" || entry.review !== false || !Number.isInteger(entry.width) || (entry.width as number) <= 0 ||
			!Number.isInteger(entry.height) || (entry.height as number) <= 0 || !isRecord(entry.extraction) ||
			entry.extraction.version !== PALETTE_ROLE_00_AUDIT_ALGORITHM_VERSION || entry.extraction.width !== entry.width ||
			entry.extraction.height !== entry.height || !isRecord(entry.extraction.methods) ||
			!isRecord(entry.extraction.methods.spatial)) throw new Error(`${label} is invalid or duplicated`)
		const palette = entry.extraction.methods.spatial
		for (const role of paletteRole00AuditRoles) {
			const color = palette[role]
			if (!isRecord(color) || !isRGB(color.rgb) || typeof color.hex !== "string" || !/^#[a-f0-9]{6}$/.test(color.hex) ||
				typeof color.generated !== "boolean") throw new Error(`${label} ${role} is invalid`)
			assertFinite(color.sourceDistance, `${label} ${role} source distance`, 0)
		}
		if (!isRecord(palette.gradient) || typeof palette.gradient.isGradient !== "boolean") {
			throw new Error(`${label} gradient is invalid`)
		}
		for (const field of ["confidence", "coverage", "continuity", "coherence"] as const) {
			assertFinite(palette.gradient[field], `${label} gradient ${field}`, 0)
			if ((palette.gradient[field] as number) > 1) throw new Error(`${label} gradient ${field} is invalid`)
		}
		assertFinite(palette.score, `${label} score`)
		if (!isRecord(palette.metrics)) throw new Error(`${label} metrics are invalid`)
		for (const metric of [
			"foregroundContrast", "foregroundSurfaceContrast", "accentContrast", "accentSurfaceContrast",
			"minimumRoleDistance", "meanSourceDistance", "meanReconstructionError",
		] as const) assertFinite(palette.metrics[metric], `${label} metric ${metric}`, 0)
		files.add(entry.file)
	}
	return value as unknown as CorpusResult
}

function presentPalette(palette: Palette): PaletteRole00AuditPresentedPalette {
	const roles = Object.fromEntries(paletteRole00AuditRoles.map((role) => {
		const descriptor = nameRGB(palette[role].rgb)
		if (descriptor.sourceHex !== palette[role].hex.toLowerCase()) {
			throw new Error(`Canonical ${role} RGB and hex disagree`)
		}
		return [role, {
			rgb: palette[role].rgb,
			hex: descriptor.sourceHex,
			generated: palette[role].generated,
			sourceDistance: palette[role].sourceDistance,
			colorName: {
				nearestName: descriptor.nearestName,
				referenceHex: descriptor.nearest.referenceHex,
				tier: descriptor.nearest.tier,
				distance: descriptor.nearest.distance,
			},
		}]
	})) as PaletteRole00AuditPresentedPalette["roles"]
	return {
		roles,
		gradient: {
			isGradient: palette.gradient.isGradient,
			confidence: palette.gradient.confidence,
			coverage: palette.gradient.coverage,
			continuity: palette.gradient.continuity,
			coherence: palette.gradient.coherence,
		},
		score: palette.score,
		metrics: palette.metrics,
		backgroundSurface: paletteRole00AuditBackgroundSurface(roles.background.rgb, roles.surface.rgb),
	}
}

async function fileHashes(files: readonly string[]): Promise<Record<string, string>> {
	return Object.fromEntries(await Promise.all(files.map(async (file) => [
		file,
		sha256(await readFile(resolve(projectRoot, file))),
	])))
}

async function writeExclusiveJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true })
	const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
	try {
		await link(temporary, path)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Refusing to overwrite ${path}`)
		throw error
	} finally {
		await rm(temporary, { force: true })
	}
}

const [holdoutSource, selectionSource] = await Promise.all([
	readFile(holdoutPath),
	readFile(selectionPath),
])
const holdoutRawSha256 = sha256(holdoutSource)
const holdout = parseCanonicalHoldout(JSON.parse(holdoutSource.toString("utf8")) as unknown)
const selectionValue: unknown = JSON.parse(selectionSource.toString("utf8"))
validateSelectionManifest(selectionValue, holdout, holdoutRawSha256)
const selection = selectionValue
const holdoutSemanticSha256 = computeSemanticResultsSha256(holdout)
if (selection.sourceResultsSha256 !== holdoutRawSha256 || selection.semanticResultsSha256 !== holdoutSemanticSha256) {
	throw new Error("Source selection does not bind the canonical holdout raw and semantic provenance")
}

const allSources = selectionTracks.flatMap((track) => selection.tracks[track])
if (allSources.length !== PALETTE_ROLE_00_CANONICAL_ENTRY_COUNT ||
	new Set(allSources.map((source) => source.file)).size !== PALETTE_ROLE_00_CANONICAL_ENTRY_COUNT) {
	throw new Error("Source selection does not exactly and uniquely cover all 355 canonical holdout entries")
}
const selectedSources = paletteRole00AuditSample(selection)
const holdoutByFile = new Map(holdout.entries.map((entry) => [entry.file, entry]))
const entries: PaletteRole00AuditEntry[] = []
for (const selected of selectedSources) {
	const canonical = holdoutByFile.get(selected.file)
	if (!canonical) throw new Error(`Canonical holdout is missing selected source ${selected.file}`)
	const sourcePath = resolve(projectRoot, selected.file)
	const bytes = await readFile(sourcePath)
	if (sha256(bytes) !== selected.sha256) throw new Error(`On-disk source SHA-256 differs from selection for ${selected.file}`)
	const metadata = await sharp(bytes).metadata()
	if (!metadata.width || !metadata.height) throw new Error(`Could not read source dimensions for ${selected.file}`)
	if (canonical.width !== selected.width || canonical.height !== selected.height ||
		canonical.extraction.width !== canonical.width || canonical.extraction.height !== canonical.height) {
		throw new Error(`Normalized dimensions differ across canonical provenance for ${selected.file}`)
	}
	entries.push({
		caseId: paletteRole00AuditCaseId(selection.manifestId, selected.file, selected.sha256),
		order: 0,
		batch: 0,
		sampleTrack: selected.track,
		source: {
			file: selected.file,
			sha256: selected.sha256,
			bytes: bytes.byteLength,
			width: metadata.width,
			height: metadata.height,
		},
		normalized: { width: canonical.width, height: canonical.height },
		palette: presentPalette(canonical.extraction.methods.spatial),
	})
}
entries.sort((first, second) => {
	const firstKey = paletteRole00AuditOrderKey(selection.manifestId, first.source.file, first.source.sha256)
	const secondKey = paletteRole00AuditOrderKey(selection.manifestId, second.source.file, second.source.sha256)
	return firstKey < secondKey ? -1 : firstKey > secondKey ? 1 : first.source.file.localeCompare(second.source.file, "en")
})
for (const [index, entry] of entries.entries()) {
	entry.order = index + 1
	entry.batch = Math.floor(index / PALETTE_ROLE_00_AUDIT_BATCH_SIZE) + 1
}

const identity: Omit<PaletteRole00AuditManifest, "generatedAt" | "manifestId"> = {
	schemaVersion: 1,
	auditVersion: PALETTE_ROLE_00_AUDIT_VERSION,
	presentationVersion: PALETTE_ROLE_00_AUDIT_PRESENTATION_VERSION,
	algorithmVersion: PALETTE_ROLE_00_AUDIT_ALGORITHM_VERSION,
	batchSize: PALETTE_ROLE_00_AUDIT_BATCH_SIZE,
	totalBatches: PALETTE_ROLE_00_AUDIT_BATCH_COUNT,
	provenance: {
		canonicalHoldout: { rawSha256: holdoutRawSha256, semanticSha256: holdoutSemanticSha256 },
		sourceSelection: { rawSha256: sha256(selectionSource), manifestId: selection.manifestId },
		implementation: await fileHashes(paletteRole00AuditImplementationFiles),
		presentation: await fileHashes(paletteRole00AuditPresentationFiles),
	},
	entries,
}
const manifest: PaletteRole00AuditManifest = {
	...identity,
	generatedAt: new Date().toISOString(),
	manifestId: paletteRole00AuditManifestId(identity),
}
parsePaletteRole00AuditManifest(manifest)
await writeExclusiveJson(outputPath, manifest)
process.stderr.write(
	`Prepared ${entries.length} stratified canonical 00 palettes in ${PALETTE_ROLE_00_AUDIT_BATCH_COUNT} deterministic batches at ${relative(projectRoot, outputPath)}\n`,
)
