import { createHash } from "node:crypto"
import { access, readFile, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { UI_ACCENT_CONTRAST_PROFILE } from "./src/accent-contrast.ts"
import { contrastRatio, okDistance, rgbToOKLab } from "./src/color.ts"
import { extractConfiguredPaletteWithContext } from "./src/configured-extract.ts"
import { extractPalette } from "./src/extract.ts"
import { loadImage } from "./src/image.ts"
import type { CorpusResult, ExtractionResult, RoleName } from "./src/types.ts"

type ReviewClass = "accepted" | "rejected" | "unselected"
type Cohort = "development" | "00"
type CorpusEntry = CorpusResult["entries"][number]

const EXPERIMENT_VERSION = "region-ui-accent-joint-0.1.0-poc.1"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const experimentRoot = join(projectRoot, "research/data/experiments/ui-accent-joint-0.1.0-poc.1-development")
const outputPath = join(experimentRoot, "evaluation.json")
const roleNames: RoleName[] = ["background", "foreground", "surface", "accent"]
const inputFiles = {
	development: "research/data/results.json",
	canonical00: "research/data/holdout-results.json",
	absoluteFeedback: "research/data/absolute-feedback.json",
	contractAnalysis: "research/data/experiments/ui-accent-contrast-contract-0.1.0-development/analysis.json",
	protocol: "research/data/experiments/ui-accent-joint-0.1.0-poc.1-development/protocol.json",
} as const
const implementationFiles = [
	"package.json",
	"pnpm-lock.yaml",
	"research/src/accent-contrast.ts",
	"research/src/color.ts",
	"research/src/image.ts",
	"research/src/regions.ts",
	"research/src/candidates.ts",
	"research/src/foreground-contrast.ts",
	"research/src/joint-palette.ts",
	"research/src/chromatic-role-extract.ts",
	"research/src/configured-extract.ts",
	"research/src/extract.ts",
	"research/evaluate-ui-accent-joint.ts",
] as const

function sha256(value: Uint8Array | string): string {
	return createHash("sha256").update(value).digest("hex")
}

function scientificExtraction(extraction: ExtractionResult): ExtractionResult {
	return { ...extraction, diagnostics: { ...extraction.diagnostics, processingMs: 0 } }
}

function exactChangedRoles(baseline: ExtractionResult, candidate: ExtractionResult): RoleName[] {
	return roleNames.filter((role) => {
		const first = baseline.methods.spatial[role]
		const second = candidate.methods.spatial[role]
		return first.generated !== second.generated || first.rgb.some((channel, index) => channel !== second.rgb[index])
	})
}

function materialChangedRoles(baseline: ExtractionResult, candidate: ExtractionResult): RoleName[] {
	return roleNames.filter((role) => okDistance(
		rgbToOKLab(baseline.methods.spatial[role].rgb),
		rgbToOKLab(candidate.methods.spatial[role].rgb),
	) > 0.025)
}

async function assertOutputAbsent(): Promise<void> {
	try {
		await access(outputPath)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return
		throw error
	}
	throw new Error(`Refusing to overwrite ${outputPath}`)
}

async function evaluate(entry: CorpusEntry, cohort: Cohort, reviewClass: ReviewClass | null) {
	const sourcePath = cohort === "development"
		? join(projectRoot, "images", basename(entry.file))
		: join(projectRoot, entry.file)
	const bytes = await readFile(sourcePath)
	const image = await loadImage(bytes)
	const canonical = extractPalette(image)
	if (!isDeepStrictEqual(scientificExtraction(canonical), scientificExtraction(entry.extraction))) {
		throw new Error(`Canonical scientific extraction changed for ${entry.file}`)
	}
	const baseline = canonical.methods.spatial
	const baselinePass = contrastRatio(baseline.accent.rgb, baseline.background.rgb) >= 3 &&
		contrastRatio(baseline.accent.rgb, baseline.surface.rgb) >= 3
	try {
		const configured = extractConfiguredPaletteWithContext(image, {
			accentContrastProfile: UI_ACCENT_CONTRAST_PROFILE,
		})
		const candidate = configured.extraction
		const spatial = candidate.methods.spatial
		const backgroundContrast = contrastRatio(spatial.accent.rgb, spatial.background.rgb)
		const surfaceContrast = contrastRatio(spatial.accent.rgb, spatial.surface.rgb)
		const distinctColorCount = new Set(roleNames.map((role) => spatial[role].hex.toLowerCase())).size
		const exactRoles = exactChangedRoles(canonical, candidate)
		const materialRoles = materialChangedRoles(canonical, candidate)
		const gradientChanged = spatial.gradient.isGradient !== baseline.gradient.isGradient
		const nonSpatialFrozen = isDeepStrictEqual(candidate.methods.expressive, canonical.methods.expressive) &&
			isDeepStrictEqual(candidate.methods.quantized, canonical.methods.quantized) &&
			isDeepStrictEqual(candidate.candidates, canonical.candidates)
		const certificate = configured.jointCertificate
		if (!certificate) throw new Error("Configured accent extraction omitted its joint certificate")
		return {
			file: entry.file,
			cohort,
			reviewClass,
			sourceSha256: sha256(bytes),
			baselinePass,
			configurationId: configured.configuration.id,
			configuredVersion: candidate.version,
			contrast: { background: backgroundContrast, surface: surfaceContrast },
			distinctColorCount,
			exactChangedRoles: exactRoles,
			materialChangedRoles: materialRoles,
			gradientChanged,
			nonSpatialFrozen,
			baseline: {
				roles: Object.fromEntries(roleNames.map((role) => [role, baseline[role].hex.toLowerCase()])),
				gradient: baseline.gradient.isGradient,
			},
			candidate: {
				roles: Object.fromEntries(roleNames.map((role) => [role, spatial[role].hex.toLowerCase()])),
				gradient: spatial.gradient.isGradient,
			},
			certificate: {
				selectionRule: certificate.selectionRule,
				selectedAdmission: certificate.selectedAdmission,
				counts: certificate.counts,
				selected: certificate.selected,
				accentSafety: certificate.accentSafety,
				accentContrastProfile: certificate.accentContrastProfile,
			},
			error: null,
		}
	} catch (error) {
		return {
			file: entry.file,
			cohort,
			reviewClass,
			sourceSha256: sha256(bytes),
			baselinePass,
			error: error instanceof Error ? error.message : String(error),
		}
	}
}

type Evaluated = Awaited<ReturnType<typeof evaluate>>
type Successful = Exclude<Evaluated, { error: string }>

function summarize(entries: Evaluated[]) {
	const failures = entries.filter((entry) => entry.error !== null)
	const successful = entries.filter((entry): entry is Successful => entry.error === null)
	const changed = successful.filter((entry) => entry.exactChangedRoles.length > 0 || entry.gradientChanged)
	const material = successful.filter((entry) => entry.materialChangedRoles.length > 0 || entry.gradientChanged)
	const safeIncumbentsChanged = changed.filter((entry) => entry.baselinePass)
	const violations = successful.filter((entry) => entry.contrast.background < 3 || entry.contrast.surface < 3 ||
		entry.distinctColorCount > 4 || !entry.nonSpatialFrozen)
	const roleCounts = Object.fromEntries(roleNames.map((role) => [role,
		material.filter((entry) => entry.materialChangedRoles.includes(role)).length]))
	const byReviewClass = Object.fromEntries((["accepted", "rejected", "unselected"] as const).map((classification) => {
		const classified = successful.filter((entry) => entry.reviewClass === classification)
		const classifiedChanged = classified.filter((entry) => entry.exactChangedRoles.length > 0 || entry.gradientChanged)
		return [classification, {
			total: classified.length,
			changed: classifiedChanged.length,
			files: classifiedChanged.map((entry) => entry.file),
		}]
	}))
	return {
		entries: entries.length,
		successful: successful.length,
		failures: failures.length,
		failureEntries: failures,
		exactChanged: changed.length,
		materialChanged: material.length,
		safeIncumbentsChanged: safeIncumbentsChanged.length,
		contractViolations: violations.length,
		roleCounts,
		gradientChanged: material.filter((entry) => entry.gradientChanged).length,
		byReviewClass,
		changedEntries: changed,
	}
}

async function main(): Promise<void> {
	if (process.argv.slice(2).length > 0) throw new Error("This evaluator does not accept arguments")
	await assertOutputAbsent()
	const inputs = Object.fromEntries(await Promise.all(Object.entries(inputFiles).map(async ([name, file]) => {
		const bytes = await readFile(join(projectRoot, file))
		return [name, { file, sha256: sha256(bytes), bytes }] as const
	}))) as Record<keyof typeof inputFiles, { file: string; sha256: string; bytes: Buffer }>
	const developmentCorpus = JSON.parse(inputs.development.bytes.toString("utf8")) as CorpusResult
	const canonical00Corpus = JSON.parse(inputs.canonical00.bytes.toString("utf8")) as CorpusResult
	const feedback = JSON.parse(inputs.absoluteFeedback.bytes.toString("utf8")) as {
		entries: Array<{ image: string; shippable: boolean }>
	}
	const reviewClass = new Map<string, ReviewClass>(feedback.entries.map((entry) => [
		entry.image,
		entry.shippable ? "accepted" : "rejected",
	]))
	const development = []
	const canonical00 = []
	for (const [index, entry] of developmentCorpus.entries.entries()) {
		development.push(await evaluate(entry, "development", null))
		process.stderr.write(`UI accent joint development: ${index + 1}/${developmentCorpus.entries.length}\r`)
	}
	process.stderr.write("\n")
	for (const [index, entry] of canonical00Corpus.entries.entries()) {
		canonical00.push(await evaluate(entry, "00", reviewClass.get(entry.file) ?? "unselected"))
		if ((index + 1) % 10 === 0 || index + 1 === canonical00Corpus.entries.length) {
			process.stderr.write(`UI accent joint 00: ${index + 1}/${canonical00Corpus.entries.length}\r`)
		}
	}
	process.stderr.write("\n")
	const developmentSummary = summarize(development)
	const canonical00Summary = summarize(canonical00)
	const stops = {
		canonicalOutputChanged: false,
		noSafeTuple: developmentSummary.failures > 0 || canonical00Summary.failures > 0,
		configuredContractViolation: developmentSummary.contractViolations > 0 ||
			canonical00Summary.contractViolations > 0,
		safeIncumbentChanged: developmentSummary.safeIncumbentsChanged > 0 ||
			canonical00Summary.safeIncumbentsChanged > 0,
		changedSetMismatch: developmentSummary.exactChanged !== 20 || canonical00Summary.exactChanged !== 147,
		acceptedChangedSetMismatch: canonical00Summary.byReviewClass.accepted.changed !== 47,
	}
	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (file) => [
		file,
		sha256(await readFile(join(projectRoot, file))),
	] as const)))
	await writeFile(outputPath, `${JSON.stringify({
		schemaVersion: 1,
		experimentVersion: EXPERIMENT_VERSION,
		generatedAt: new Date().toISOString(),
		developmentEvidence: true,
		bindings: {
			inputs: Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, {
				file: input.file,
				sha256: input.sha256,
			}])),
			implementation,
		},
		profile: UI_ACCENT_CONTRAST_PROFILE,
		developmentSummary,
		canonical00Summary,
		stopConditions: stops,
		decision: Object.values(stops).some(Boolean)
			? "stop"
			: "configured-poc-passes-technical-contract-broad-review-required",
	}, null, 2)}\n`, { flag: "wx" })
}

await main()
