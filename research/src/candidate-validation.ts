import { contrastRatio, okDistance, rgbToHex, rgbToOKLab } from "./color.ts"
import type { RGB } from "./types.ts"

const methodNames = ["spatial", "expressive", "quantized"] as const
const roleNames = ["background", "foreground", "surface", "accent"] as const
const metricNames = [
	"foregroundContrast",
	"foregroundSurfaceContrast",
	"accentContrast",
	"accentSurfaceContrast",
	"minimumRoleDistance",
	"meanSourceDistance",
	"meanReconstructionError",
] as const

type MethodName = typeof methodNames[number]
type RoleName = typeof roleNames[number]
type ParsedRole = { rgb: RGB; generated: boolean }
type ParsedPalette = Record<RoleName, ParsedRole> & { gradient: boolean }
type ParsedCandidate = {
	rgb: RGB
	population: number
	saliency: number
	text: number
}
type CorpusMetadata = {
	file: string
	kind: string
	review: boolean
	width: number
	height: number
}

export type CandidateCohortSummary = {
	entries: number
	generatedForegrounds: number
	relaxedBackgrounds: number
	relaxedSurfaces: number
	collapsedSurfaces: number
	gradients: number
}

export type CandidateValidationSummary = {
	algorithmVersion: string
	development: CandidateCohortSummary
	holdout: CandidateCohortSummary
	violations: 0
}

export class CandidateValidationError extends Error {
	readonly violations: readonly string[]

	constructor(violations: string[]) {
		super(`Candidate validation failed with ${violations.length} violation${violations.length === 1 ? "" : "s"}:\n- ${violations.join("\n- ")}`)
		this.name = "CandidateValidationError"
		this.violations = [...violations]
	}
}

type Context = {
	violations: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function report(context: Context, message: string): void {
	context.violations.push(message)
}

function requireExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string, context: Context): void {
	const expectedKeys = new Set(expected)
	const missing = expected.filter((key) => !(key in value))
	const unexpected = Object.keys(value).filter((key) => !expectedKeys.has(key))
	if (missing.length > 0) report(context, `${label} is missing fields: ${missing.join(", ")}`)
	if (unexpected.length > 0) report(context, `${label} has unexpected fields: ${unexpected.join(", ")}`)
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value)
}

function validateTimestamp(value: unknown, label: string, context: Context): void {
	if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
		report(context, `${label} must be an ISO timestamp`)
	}
}

function validateRgbHex(value: Record<string, unknown>, label: string, context: Context): RGB | null {
	let rgb: RGB | null = null
	if (!Array.isArray(value.rgb) || value.rgb.length !== 3 ||
		value.rgb.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
		report(context, `${label}.rgb must contain three integer channels from 0 to 255`)
	} else {
		rgb = value.rgb as unknown as RGB
	}

	if (typeof value.hex !== "string" || !/^#[a-f0-9]{6}$/i.test(value.hex)) {
		report(context, `${label}.hex must be a six-digit hex color`)
	} else if (rgb && rgbToHex(rgb) !== value.hex.toLowerCase()) {
		report(context, `${label}.hex does not match its RGB value`)
	}
	return rgb
}

function validateRole(value: unknown, label: string, context: Context): ParsedRole | null {
	if (!isRecord(value)) {
		report(context, `${label} must be a role color object`)
		return null
	}
	requireExactKeys(value, ["rgb", "hex", "generated", "sourceDistance"], label, context)
	const rgb = validateRgbHex(value, label, context)
	if (typeof value.generated !== "boolean") report(context, `${label}.generated must be boolean`)
	if (!isFiniteNumber(value.sourceDistance) || value.sourceDistance < 0) {
		report(context, `${label}.sourceDistance must be a finite non-negative number`)
	}
	return rgb && typeof value.generated === "boolean" ? { rgb, generated: value.generated } : null
}

function validateGradient(value: unknown, label: string, context: Context): boolean | null {
	if (!isRecord(value)) {
		report(context, `${label} must be a gradient object`)
		return null
	}
	requireExactKeys(value, ["isGradient", "confidence", "coverage", "continuity", "coherence"], label, context)
	if (typeof value.isGradient !== "boolean") report(context, `${label}.isGradient must be boolean`)
	for (const field of ["confidence", "coverage", "continuity", "coherence"] as const) {
		if (!isFiniteNumber(value[field]) || value[field] < 0 || value[field] > 1) {
			report(context, `${label}.${field} must be a finite number from 0 to 1`)
		}
	}
	return typeof value.isGradient === "boolean" ? value.isGradient : null
}

function approximatelyEqual(first: number, second: number): boolean {
	return Math.abs(first - second) <= 1e-9 * Math.max(1, Math.abs(first), Math.abs(second))
}

function validateMetrics(
	value: unknown,
	roles: Partial<Record<RoleName, ParsedRole>>,
	label: string,
	context: Context,
): void {
	if (!isRecord(value)) {
		report(context, `${label} must be a metrics object`)
		return
	}
	requireExactKeys(value, metricNames, label, context)
	for (const field of metricNames) {
		if (!isFiniteNumber(value[field])) {
			report(context, `${label}.${field} must be finite`)
		} else if (value[field] < 0) {
			report(context, `${label}.${field} must be non-negative`)
		}
	}
	if (roleNames.some((role) => !roles[role])) return

	const completeRoles = roles as Record<RoleName, ParsedRole>
	const expected = {
		foregroundContrast: contrastRatio(completeRoles.background.rgb, completeRoles.foreground.rgb),
		foregroundSurfaceContrast: contrastRatio(completeRoles.surface.rgb, completeRoles.foreground.rgb),
		accentContrast: contrastRatio(completeRoles.background.rgb, completeRoles.accent.rgb),
		accentSurfaceContrast: contrastRatio(completeRoles.surface.rgb, completeRoles.accent.rgb),
	}
	for (const [field, recomputed] of Object.entries(expected)) {
		const recorded = value[field]
		if (isFiniteNumber(recorded) && !approximatelyEqual(recorded, recomputed)) {
			report(context, `${label}.${field} is ${recorded}, expected recomputed contrast ${recomputed}`)
		}
	}
}

function rgbKey(rgb: RGB): string {
	return rgb.join(",")
}

function isBlackOrWhite(rgb: RGB): boolean {
	return rgb.every((channel) => channel === 0) || rgb.every((channel) => channel === 255)
}

function hasStrongTypographyEvidence(candidate: ParsedCandidate): boolean {
	return candidate.population >= 0.1 && candidate.text >= 0.5 && candidate.saliency >= 0.55
}

function sourceForegroundContrast(candidate: ParsedCandidate): number {
	return hasStrongTypographyEvidence(candidate) ? 3 : 4
}

function validatePaletteGates(
	palette: Record<RoleName, ParsedRole>,
	method: MethodName,
	candidates: ParsedCandidate[],
	label: string,
	context: Context,
): void {
	const backgroundContrast = contrastRatio(palette.background.rgb, palette.foreground.rgb)
	const surfaceContrast = contrastRatio(palette.surface.rgb, palette.foreground.rgb)
	const accentContrast = contrastRatio(palette.background.rgb, palette.accent.rgb)
	const candidateColors = new Set(candidates.map((candidate) => rgbKey(candidate.rgb)))

	if (method !== "quantized") {
		if (palette.background.generated) report(context, `${label}.background must not be generated`)
		if (palette.surface.generated) report(context, `${label}.surface must not be generated`)
		for (const role of roleNames) {
			if (!palette[role].generated && !candidateColors.has(rgbKey(palette[role].rgb))) {
				report(context, `${label}.${role} does not appear in the candidate shortlist`)
			}
		}
		if (palette.foreground.generated) {
			const eligibleSource = candidates.find((candidate) =>
				rgbKey(candidate.rgb) !== rgbKey(palette.background.rgb) &&
				contrastRatio(palette.background.rgb, candidate.rgb) + 1e-12 >= sourceForegroundContrast(candidate))
			if (eligibleSource) {
				report(context, `${label}.foreground must not be generated because source candidate ${rgbToHex(eligibleSource.rgb)} ` +
					`is eligible under the source foreground contrast rules`)
			}
		}
	} else {
		if (palette.background.generated) report(context, `${label}.background must not be generated`)
		if (palette.surface.generated) report(context, `${label}.surface must not be generated`)
		// Quantized roles come from a separate 7-color shortlist; extraction.candidates exposes only the spatial 12-color shortlist.
		// Requiring quantized source colors to appear there would therefore validate against the wrong provenance evidence.
	}

	if (palette.foreground.generated) {
		if (!isBlackOrWhite(palette.foreground.rgb)) report(context, `${label}.foreground generated color must be black or white`)
		if (backgroundContrast + 1e-12 < 4.5) report(context, `${label}.foreground generated background contrast is below 4.5`)
		if (surfaceContrast + 1e-12 < 4.5) report(context, `${label}.foreground generated surface contrast is below 4.5`)
	} else if (method !== "quantized") {
		if (backgroundContrast + 1e-12 < 3) report(context, `${label}.foreground source background contrast is below 3.0`)
		if (surfaceContrast + 1e-12 < 2.5) report(context, `${label}.foreground source surface contrast is below 2.5`)
	}

	if (method === "quantized") {
		if (backgroundContrast + 1e-12 < 4.5) report(context, `${label}.foreground background contrast is below 4.5`)
		if (surfaceContrast + 1e-12 < 4.5) report(context, `${label}.foreground surface contrast is below 4.5`)
	}

	if (palette.accent.generated) {
		if (!palette.foreground.generated || rgbKey(palette.accent.rgb) !== rgbKey(palette.foreground.rgb)) {
			report(context, `${label}.accent generated color must equal the generated foreground`)
		}
		if (!isBlackOrWhite(palette.accent.rgb)) report(context, `${label}.accent generated color must be black or white`)
	}
	if (method !== "quantized" && accentContrast + 1e-12 < 1.2) {
		report(context, `${label}.accent background contrast is below 1.2`)
	}
	const accentLab = rgbToOKLab(palette.accent.rgb)
	if (okDistance(accentLab, rgbToOKLab(palette.background.rgb)) + 1e-12 < 0.025) {
		report(context, `${label}.accent is less than 0.025 OKLab from background`)
	}
	if (okDistance(accentLab, rgbToOKLab(palette.surface.rgb)) + 1e-12 < 0.025) {
		report(context, `${label}.accent is less than 0.025 OKLab from surface`)
	}
}

function validatePalette(
	value: unknown,
	method: MethodName,
	candidates: ParsedCandidate[],
	label: string,
	context: Context,
): ParsedPalette | null {
	if (!isRecord(value)) {
		report(context, `${label} must be a palette object`)
		return null
	}
	requireExactKeys(value, [...roleNames, "gradient", "score", "metrics"], label, context)
	const roles: Partial<Record<RoleName, ParsedRole>> = {}
	for (const role of roleNames) {
		const parsed = validateRole(value[role], `${label}.${role}`, context)
		if (parsed) roles[role] = parsed
	}
	const gradient = validateGradient(value.gradient, `${label}.gradient`, context)
	if (!isFiniteNumber(value.score)) report(context, `${label}.score must be finite`)
	validateMetrics(value.metrics, roles, `${label}.metrics`, context)
	if (roleNames.some((role) => !roles[role]) || gradient === null) return null
	const completeRoles = roles as Record<RoleName, ParsedRole>
	validatePaletteGates(completeRoles, method, candidates, label, context)
	return { ...completeRoles, gradient }
}

function validateCandidate(value: unknown, label: string, context: Context): ParsedCandidate | null {
	if (!isRecord(value)) {
		report(context, `${label} must be a candidate object`)
		return null
	}
	requireExactKeys(value, ["hex", "rgb", "population", "background", "saliency", "text", "chroma"], label, context)
	const rgb = validateRgbHex(value, label, context)
	let scalarFieldsValid = true
	for (const field of ["population", "background", "saliency", "text"] as const) {
		if (!isFiniteNumber(value[field]) || value[field] < 0 || value[field] > 1) {
			report(context, `${label}.${field} must be a finite number from 0 to 1`)
			scalarFieldsValid = false
		}
	}
	if (!isFiniteNumber(value.chroma) || value.chroma < 0) report(context, `${label}.chroma must be finite and non-negative`)
	return rgb && scalarFieldsValid ? {
		rgb,
		population: value.population as number,
		saliency: value.saliency as number,
		text: value.text as number,
	} : null
}

function validateExtraction(
	value: unknown,
	algorithmVersion: string | null,
	width: number | null,
	height: number | null,
	label: string,
	context: Context,
): ParsedPalette | null {
	if (!isRecord(value)) {
		report(context, `${label} must be an extraction object`)
		return null
	}
	requireExactKeys(value, ["version", "width", "height", "methods", "candidates", "diagnostics"], label, context)
	if (typeof value.version !== "string" || (algorithmVersion !== null && value.version !== algorithmVersion)) {
		report(context, `${label}.version must match the artifact algorithmVersion`)
	}
	if (!Number.isInteger(value.width) || value.width !== width) report(context, `${label}.width must match entry width`)
	if (!Number.isInteger(value.height) || value.height !== height) report(context, `${label}.height must match entry height`)

	const candidates: ParsedCandidate[] = []
	if (!Array.isArray(value.candidates) || value.candidates.length === 0) {
		report(context, `${label}.candidates must be a non-empty array`)
	} else {
		for (const [index, candidate] of value.candidates.entries()) {
			const parsed = validateCandidate(candidate, `${label}.candidates[${index}]`, context)
			if (parsed) candidates.push(parsed)
		}
	}

	let spatial: ParsedPalette | null = null
	if (!isRecord(value.methods)) {
		report(context, `${label}.methods must be an object`)
	} else {
		requireExactKeys(value.methods, methodNames, `${label}.methods`, context)
		for (const method of methodNames) {
			const palette = validatePalette(value.methods[method], method, candidates, `${label}.methods.${method}`, context)
			if (method === "spatial") spatial = palette
		}
	}

	if (!isRecord(value.diagnostics)) {
		report(context, `${label}.diagnostics must be an object`)
	} else {
		requireExactKeys(value.diagnostics, ["regionCount", "candidateCount", "processingMs"], `${label}.diagnostics`, context)
		if (!Number.isInteger(value.diagnostics.regionCount) || (value.diagnostics.regionCount as number) <= 0) {
			report(context, `${label}.diagnostics.regionCount must be a positive integer`)
		}
		if (!Number.isInteger(value.diagnostics.candidateCount) ||
			!Array.isArray(value.candidates) || value.diagnostics.candidateCount !== value.candidates.length) {
			report(context, `${label}.diagnostics.candidateCount must equal the shortlist length`)
		}
		if (!isFiniteNumber(value.diagnostics.processingMs) || value.diagnostics.processingMs < 0) {
			report(context, `${label}.diagnostics.processingMs must be finite and non-negative`)
		}
	}
	return spatial
}

function emptySummary(entries: number): CandidateCohortSummary {
	return {
		entries,
		generatedForegrounds: 0,
		relaxedBackgrounds: 0,
		relaxedSurfaces: 0,
		collapsedSurfaces: 0,
		gradients: 0,
	}
}

function addPaletteSummary(summary: CandidateCohortSummary, palette: ParsedPalette): void {
	const backgroundContrast = contrastRatio(palette.background.rgb, palette.foreground.rgb)
	const surfaceContrast = contrastRatio(palette.surface.rgb, palette.foreground.rgb)
	if (palette.foreground.generated) summary.generatedForegrounds++
	if (backgroundContrast < 4.5) summary.relaxedBackgrounds++
	if (surfaceContrast < 4.5) summary.relaxedSurfaces++
	if (rgbKey(palette.background.rgb) === rgbKey(palette.surface.rgb)) summary.collapsedSurfaces++
	if (palette.gradient) summary.gradients++
}

function expectedDevelopmentMetadata(file: string): { kind: string; review: boolean } {
	if (file.includes("-masked") || file.includes("-saliency")) return { kind: "diagnostic", review: false }
	if (file.startsWith("pure")) return { kind: "synthetic", review: true }
	return { kind: "artwork", review: true }
}

function holdoutArtworkId(file: string): string {
	const name = file.slice(file.lastIndexOf("/") + 1)
	return name.startsWith("ab67616d") ? name.slice(16) : name
}

function validateBaselineCorpus(
	value: unknown,
	cohort: "development" | "holdout",
	expectedCount: number,
	context: Context,
): { algorithmVersion: string | null; entries: CorpusMetadata[] } {
	const label = cohort === "development" ? "Baseline development results" : "Baseline holdout results"
	if (!isRecord(value)) {
		report(context, `${label} must be an artifact object`)
		return { algorithmVersion: null, entries: [] }
	}
	requireExactKeys(value, ["generatedAt", "algorithmVersion", "entries"], label, context)
	validateTimestamp(value.generatedAt, `${label}.generatedAt`, context)
	const algorithmVersion = typeof value.algorithmVersion === "string" && /^[a-z0-9][a-z0-9.-]*$/i.test(value.algorithmVersion)
		? value.algorithmVersion
		: null
	if (algorithmVersion === null) report(context, `${label}.algorithmVersion must be a version string`)
	if (!Array.isArray(value.entries)) {
		report(context, `${label}.entries must be an array`)
		return { algorithmVersion, entries: [] }
	}
	if (value.entries.length !== expectedCount) {
		report(context, `${label} must contain exactly ${expectedCount} entries, received ${value.entries.length}`)
	}

	const entries: CorpusMetadata[] = []
	const files = new Set<string>()
	for (const [index, entryValue] of value.entries.entries()) {
		const entryLabel = `${label}.entries[${index}]`
		if (!isRecord(entryValue)) {
			report(context, `${entryLabel} must be an entry object`)
			continue
		}
		requireExactKeys(entryValue, ["file", "kind", "review", "width", "height", "extraction"], entryLabel, context)
		const file = typeof entryValue.file === "string" && entryValue.file.length > 0 ? entryValue.file : null
		if (file === null) report(context, `${entryLabel}.file must be a non-empty string`)
		else if (files.has(file)) report(context, `${entryLabel}.file duplicates ${file}`)
		else files.add(file)
		if (cohort === "holdout" && file !== null && !/^00\/[^/\\]+$/.test(file)) {
			report(context, `${entryLabel}.file must name a single file directly under 00/`)
		}
		const kind = typeof entryValue.kind === "string" &&
			["artwork", "synthetic", "diagnostic", "holdout"].includes(entryValue.kind) ? entryValue.kind : null
		if (kind === null) report(context, `${entryLabel}.kind is invalid`)
		const review = typeof entryValue.review === "boolean" ? entryValue.review : null
		if (review === null) report(context, `${entryLabel}.review must be boolean`)
		const width = Number.isInteger(entryValue.width) && (entryValue.width as number) > 0 ? entryValue.width as number : null
		const height = Number.isInteger(entryValue.height) && (entryValue.height as number) > 0 ? entryValue.height as number : null
		if (width === null) report(context, `${entryLabel}.width must be a positive integer`)
		if (height === null) report(context, `${entryLabel}.height must be a positive integer`)
		if (!isRecord(entryValue.extraction)) report(context, `${entryLabel}.extraction must be an object`)
		if (file !== null && kind !== null && review !== null && width !== null && height !== null) {
			entries.push({ file, kind, review, width, height })
		}
	}
	return { algorithmVersion, entries }
}

function validateBaselineCoverage(
	candidate: CorpusMetadata[],
	baseline: CorpusMetadata[],
	label: string,
	context: Context,
): void {
	const candidateByFile = new Map(candidate.map((entry) => [entry.file, entry]))
	const baselineByFile = new Map(baseline.map((entry) => [entry.file, entry]))
	for (const entry of baseline) {
		const counterpart = candidateByFile.get(entry.file)
		if (!counterpart) {
			report(context, `${label} is missing canonical file ${entry.file}`)
			continue
		}
		if (counterpart.width !== entry.width || counterpart.height !== entry.height || counterpart.kind !== entry.kind ||
			counterpart.review !== entry.review) {
			report(context, `${label} metadata differs from the canonical baseline for ${entry.file}`)
		}
	}
	for (const entry of candidate) {
		if (!baselineByFile.has(entry.file)) report(context, `${label} contains non-canonical file ${entry.file}`)
	}
}

function validateCorpus(
	value: unknown,
	cohort: "development" | "holdout",
	expectedCount: number,
	context: Context,
): { algorithmVersion: string | null; summary: CandidateCohortSummary; entries: CorpusMetadata[] } {
	const summary = emptySummary(0)
	const entries: CorpusMetadata[] = []
	const label = cohort === "development" ? "Development results" : "Holdout results"
	if (!isRecord(value)) {
		report(context, `${label} must be an artifact object`)
		return { algorithmVersion: null, summary, entries }
	}
	requireExactKeys(value, ["generatedAt", "algorithmVersion", "entries"], label, context)
	validateTimestamp(value.generatedAt, `${label}.generatedAt`, context)
	const algorithmVersion = typeof value.algorithmVersion === "string" && /^[a-z0-9][a-z0-9.-]*$/i.test(value.algorithmVersion)
		? value.algorithmVersion
		: null
	if (algorithmVersion === null) report(context, `${label}.algorithmVersion must be a version string`)
	if (!Array.isArray(value.entries)) {
		report(context, `${label}.entries must be an array`)
		return { algorithmVersion, summary, entries }
	}
	summary.entries = value.entries.length
	if (value.entries.length !== expectedCount) {
		report(context, `${label} must contain exactly ${expectedCount} entries, received ${value.entries.length}`)
	}

	const files = new Set<string>()
	const artworkIds = new Set<string>()
	for (const [index, entryValue] of value.entries.entries()) {
		const entryLabel = `${label}.entries[${index}]`
		if (!isRecord(entryValue)) {
			report(context, `${entryLabel} must be an entry object`)
			continue
		}
		requireExactKeys(entryValue, ["file", "kind", "review", "width", "height", "extraction"], entryLabel, context)
		const file = typeof entryValue.file === "string" && entryValue.file.length > 0 ? entryValue.file : null
		if (file === null) {
			report(context, `${entryLabel}.file must be a non-empty string`)
		} else {
			if (files.has(file)) report(context, `${entryLabel}.file duplicates ${file}`)
			files.add(file)
			if (file.toLowerCase().includes("-scrambled")) report(context, `${entryLabel}.file must not be scrambled`)
			if (cohort === "development") {
				const expected = expectedDevelopmentMetadata(file)
				if (entryValue.kind !== expected.kind || entryValue.review !== expected.review) {
						report(context, `${entryLabel} metadata does not match development classification for ${file}`)
					}
				} else {
					if (!/^00\/[^/\\]+$/.test(file)) report(context, `${entryLabel}.file must name a single file directly under 00/`)
					const id = holdoutArtworkId(file)
				if (artworkIds.has(id)) report(context, `${entryLabel}.file duplicates holdout artwork ${id}`)
				artworkIds.add(id)
			}
		}
		if (cohort === "holdout" && (entryValue.kind !== "holdout" || entryValue.review !== false)) {
			report(context, `${entryLabel} must have holdout kind and review false`)
		}
		const width = Number.isInteger(entryValue.width) && (entryValue.width as number) > 0 ? entryValue.width as number : null
		const height = Number.isInteger(entryValue.height) && (entryValue.height as number) > 0 ? entryValue.height as number : null
		if (width === null) report(context, `${entryLabel}.width must be a positive integer`)
		if (height === null) report(context, `${entryLabel}.height must be a positive integer`)
		const spatial = validateExtraction(entryValue.extraction, algorithmVersion, width, height, `${entryLabel}.extraction`, context)
		if (spatial) addPaletteSummary(summary, spatial)
		if (file !== null && typeof entryValue.kind === "string" && typeof entryValue.review === "boolean" &&
			width !== null && height !== null) {
			entries.push({ file, kind: entryValue.kind, review: entryValue.review, width, height })
		}
	}
	return { algorithmVersion, summary, entries }
}

export function validateCandidateSummaryVersions(
	development: unknown,
	holdout: unknown,
	currentAlgorithmVersion: string,
): void {
	if (!isRecord(development) || typeof development.algorithmVersion !== "string") {
		throw new Error("Candidate development results do not contain an algorithmVersion")
	}
	if (!isRecord(holdout) || typeof holdout.algorithmVersion !== "string") {
		throw new Error("Candidate holdout results do not contain an algorithmVersion")
	}
	if (development.algorithmVersion !== holdout.algorithmVersion) {
		throw new Error(`Candidate summary artifact versions do not match: ${development.algorithmVersion} and ${holdout.algorithmVersion}`)
	}
	if (development.algorithmVersion !== currentAlgorithmVersion) {
		throw new Error(`Candidate summary algorithmVersion ${development.algorithmVersion} does not match current ${currentAlgorithmVersion}`)
	}
}

export function validateCandidateArtifacts(
	results: unknown,
	holdoutResults: unknown,
	baselineResultsOrVersion: unknown,
	baselineHoldoutResults?: unknown,
): CandidateValidationSummary {
	const context: Context = { violations: [] }
	let baselineVersion: string | null = null
	let baselineDevelopment: ReturnType<typeof validateBaselineCorpus> | null = null
	let baselineHoldout: ReturnType<typeof validateBaselineCorpus> | null = null
	if (baselineHoldoutResults === undefined) {
		if (typeof baselineResultsOrVersion !== "string" || baselineResultsOrVersion.length === 0) {
			report(context, "Baseline algorithmVersion must be a non-empty string")
		} else {
			baselineVersion = baselineResultsOrVersion
		}
	} else {
		baselineDevelopment = validateBaselineCorpus(baselineResultsOrVersion, "development", 37, context)
		baselineHoldout = validateBaselineCorpus(baselineHoldoutResults, "holdout", 355, context)
		if (baselineDevelopment.algorithmVersion !== null && baselineHoldout.algorithmVersion !== null &&
			baselineDevelopment.algorithmVersion !== baselineHoldout.algorithmVersion) {
			report(context, `Canonical baseline artifact versions do not match: ${baselineDevelopment.algorithmVersion} and ` +
				`${baselineHoldout.algorithmVersion}`)
		}
		baselineVersion = baselineDevelopment.algorithmVersion ?? baselineHoldout.algorithmVersion
	}
	const development = validateCorpus(results, "development", 37, context)
	const holdout = validateCorpus(holdoutResults, "holdout", 355, context)
	if (baselineDevelopment && baselineHoldout) {
		validateBaselineCoverage(development.entries, baselineDevelopment.entries, "Candidate development results", context)
		validateBaselineCoverage(holdout.entries, baselineHoldout.entries, "Candidate holdout results", context)
	}
	if (development.algorithmVersion !== null && holdout.algorithmVersion !== null &&
		development.algorithmVersion !== holdout.algorithmVersion) {
		report(context, `Candidate artifact versions do not match: ${development.algorithmVersion} and ${holdout.algorithmVersion}`)
	}
	const algorithmVersion = development.algorithmVersion ?? holdout.algorithmVersion
	if (algorithmVersion !== null && baselineVersion !== null && algorithmVersion === baselineVersion) {
		report(context, `Candidate algorithmVersion ${algorithmVersion} must differ from baseline`)
	}
	if (context.violations.length > 0) throw new CandidateValidationError(context.violations)
	return {
		algorithmVersion: algorithmVersion!,
		development: development.summary,
		holdout: holdout.summary,
		violations: 0,
	}
}
