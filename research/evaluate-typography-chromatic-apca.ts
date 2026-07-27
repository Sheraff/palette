import { createHash } from "node:crypto"
import { access, readFile, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { UI_ACCENT_CONTRAST_PROFILE } from "./src/accent-contrast.ts"
import { apcaContrast } from "./src/color.ts"
import { extractConfiguredPaletteWithContext } from "./src/configured-extract.ts"
import { loadImage } from "./src/image.ts"
import type { CorpusResult, Palette, RGB, RoleName } from "./src/types.ts"

const EXPERIMENT_VERSION = "region-typography-chromatic-apca-0.1.0-poc.1"
const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const experimentRoot = join(
	projectRoot,
	"research/data/experiments/typography-chromatic-apca-0.1.0-poc.1-development",
)
const outputPath = join(experimentRoot, "evaluation.json")
const targetFile = "00/ab67616d0000b2730000c4e4d278f49bbc995440.jpg"
const targetCandidate = "#e3bbbb"
const roleNames: RoleName[] = ["background", "foreground", "surface", "accent"]
const inputFiles = {
	development: "research/data/results.json",
	canonical00: "research/data/holdout-results.json",
	absoluteFeedback: "research/data/absolute-feedback.json",
	availabilityEvaluation:
		"research/data/experiments/typography-chromatic-candidate-availability-0.2.0-poc.1-development/evaluation.json",
	protocol: "research/data/experiments/typography-chromatic-apca-0.1.0-poc.1-development/protocol.json",
} as const
const implementationFiles = [
	"package.json",
	"pnpm-lock.yaml",
	"research/src/accent-contrast.ts",
	"research/src/color.ts",
	"research/src/configured-extract.ts",
	"research/src/chromatic-candidate-availability.ts",
	"research/src/chromatic-role-extract.ts",
	"research/src/joint-palette.ts",
	"research/src/typography-chromatic-candidate-availability.ts",
	"research/evaluate-typography-chromatic-apca.ts",
] as const

type CorpusEntry = CorpusResult["entries"][number]
type Cohort = "development" | "00"
type ReviewClass = "accepted" | "rejected" | "unselected" | null

function sha256(value: Uint8Array | string): string {
	return createHash("sha256").update(value).digest("hex")
}

function exactChangedRoles(first: Palette, second: Palette): RoleName[] {
	return roleNames.filter((role) => first[role].generated !== second[role].generated ||
		first[role].rgb.some((channel, index) => channel !== second[role].rgb[index]))
}

function exactSourcePixel(image: Awaited<ReturnType<typeof loadImage>>, rgb: RGB): boolean {
	for (let offset = 0; offset < image.data.length; offset += 3) {
		if (image.data[offset] === rgb[0] && image.data[offset + 1] === rgb[1] && image.data[offset + 2] === rgb[2]) {
			return true
		}
	}
	return false
}

function paletteSummary(palette: Palette) {
	return {
		roles: Object.fromEntries(roleNames.map((role) => [role, palette[role].hex.toLowerCase()])),
		gradient: palette.gradient.isGradient,
		apca: {
			accentBackgroundLc: apcaContrast(palette.accent.rgb, palette.background.rgb),
			accentSurfaceLc: apcaContrast(palette.accent.rgb, palette.surface.rgb),
		},
		distinctColorCount: new Set(roleNames.map((role) => palette[role].hex.toLowerCase())).size,
	}
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

async function evaluate(
	entry: CorpusEntry,
	cohort: Cohort,
	reviewClass: ReviewClass,
) {
	const sourcePath = cohort === "development"
		? join(projectRoot, "images", basename(entry.file))
		: join(projectRoot, entry.file)
	const bytes = await readFile(sourcePath)
	const image = await loadImage(bytes)
	const configured = extractConfiguredPaletteWithContext(image, {
		accentContrastProfile: UI_ACCENT_CONTRAST_PROFILE,
		typographyChromaticAccent: true,
	})
	const treatment = configured.extraction.methods.spatial
	const typography = configured.typographyChromaticAccent
	if (!typography) throw new Error("Configured extraction omitted typography diagnostics")
	const availableCandidates = typography.availableSupplementIds.map((id) => {
		const candidate = configured.candidates.find((value) => value.id === id)
		if (!candidate) throw new Error(`Configured typography candidate ${id} is unavailable`)
		return {
			id,
			hex: candidate.hex,
			population: candidate.population,
			chroma: candidate.chroma,
			saliency: candidate.saliency,
			text: candidate.text,
			exactSourcePixel: exactSourcePixel(image, candidate.rgb),
		}
	})
	let apcaBaseline: Palette | null = null
	if (availableCandidates.length > 0) {
		apcaBaseline = extractConfiguredPaletteWithContext(image, {
			accentContrastProfile: UI_ACCENT_CONTRAST_PROFILE,
		}).extraction.methods.spatial
	}
	const summary = paletteSummary(treatment)
	return {
		file: entry.file,
		cohort,
		reviewClass,
		sourceSha256: sha256(bytes),
		configurationId: configured.configuration.id,
		configuredVersion: configured.extraction.version,
		availableCandidates,
		typography,
		canonicalChangedRoles: exactChangedRoles(entry.extraction.methods.spatial, treatment),
		typographyChangedRoles: apcaBaseline ? exactChangedRoles(apcaBaseline, treatment) : [],
		typographyGradientChanged: apcaBaseline
			? apcaBaseline.gradient.isGradient !== treatment.gradient.isGradient
			: false,
		nonSpatialFrozen: isDeepStrictEqual(configured.extraction.methods.expressive, entry.extraction.methods.expressive) &&
			isDeepStrictEqual(configured.extraction.methods.quantized, entry.extraction.methods.quantized),
		palette: summary,
		joint: configured.jointCertificate ? {
			selectionRule: configured.jointCertificate.selectionRule,
			selectedAdmission: configured.jointCertificate.selectedAdmission,
			selected: configured.jointCertificate.selected,
			requiredAccentCandidateId: configured.jointCertificate.requiredAccentCandidateId ?? null,
			requiredAccentSelected: configured.jointCertificate.requiredAccentSelected ?? null,
			accentSafety: configured.jointCertificate.accentSafety ?? null,
		} : null,
	}
}

if (process.argv.slice(2).length > 0) throw new Error("This evaluator does not accept arguments")
await assertOutputAbsent()
const inputs = Object.fromEntries(await Promise.all(Object.entries(inputFiles).map(async ([name, file]) => {
	const bytes = await readFile(join(projectRoot, file))
	return [name, { file, bytes, sha256: sha256(bytes) }] as const
}))) as Record<keyof typeof inputFiles, { file: string; bytes: Buffer; sha256: string }>
const development = JSON.parse(inputs.development.bytes.toString("utf8")) as CorpusResult
const canonical00 = JSON.parse(inputs.canonical00.bytes.toString("utf8")) as CorpusResult
const feedback = JSON.parse(inputs.absoluteFeedback.bytes.toString("utf8")) as {
	entries: Array<{ image: string; shippable: boolean }>
}
const reviewClasses = new Map(feedback.entries.map((entry) => [
	entry.image,
	entry.shippable ? "accepted" as const : "rejected" as const,
]))
const frozenAvailability = JSON.parse(inputs.availabilityEvaluation.bytes.toString("utf8")) as {
	holdoutSummary: { triggeredEntries: Array<{ file: string }> }
}
const entries = []
for (const [index, entry] of development.entries.entries()) {
	entries.push(await evaluate(entry, "development", null))
	process.stderr.write(`Typography APCA development: ${index + 1}/${development.entries.length}\r`)
}
process.stderr.write("\n")
for (const [index, entry] of canonical00.entries.entries()) {
	entries.push(await evaluate(entry, "00", reviewClasses.get(entry.file) ?? "unselected"))
	if ((index + 1) % 10 === 0 || index + 1 === canonical00.entries.length) {
		process.stderr.write(`Typography APCA 00: ${index + 1}/${canonical00.entries.length}\r`)
	}
}
process.stderr.write("\n")

const available = entries.filter((entry) => entry.availableCandidates.length > 0)
const selected = available.filter((entry) => entry.typography.selectedSupplementIds.length > 0)
const emitted = available.filter((entry) => entry.typography.emittedSupplementIds.length > 0)
const rejected = selected.filter((entry) => entry.typography.emittedSupplementIds.length === 0)
const target = entries.find((entry) => entry.file === targetFile)
const expectedAvailability = frozenAvailability.holdoutSummary.triggeredEntries.map((entry) => entry.file).sort()
const actualAvailability = available.map((entry) => entry.file).sort()
const apcaViolations = entries.filter((entry) =>
	Math.abs(entry.palette.apca.accentBackgroundLc) < UI_ACCENT_CONTRAST_PROFILE.backgroundMinimumLc ||
	Math.abs(entry.palette.apca.accentSurfaceLc) < UI_ACCENT_CONTRAST_PROFILE.surfaceMinimumLc)
const stops = {
	availabilitySetChanged: !isDeepStrictEqual(actualAvailability, expectedAvailability),
	availabilityBreadthExceeded: available.length > 7,
	acceptedAvailabilityBreadthExceeded: available.filter((entry) => entry.reviewClass === "accepted").length > 1,
	emittedNonAccentRoleChange: emitted.some((entry) =>
		entry.typographyChangedRoles.some((role) => role !== "accent")),
	emittedGradientChange: emitted.some((entry) => entry.typographyGradientChanged),
	apcaViolation: apcaViolations.length > 0,
	fourColorViolation: entries.some((entry) => entry.palette.distinctColorCount > 4),
	nonSpatialChanged: entries.some((entry) => !entry.nonSpatialFrozen),
	nonSourceTypographyCandidate: available.some((entry) =>
		entry.availableCandidates.some((candidate) => !candidate.exactSourcePixel)),
	acceptedEmissionBreadthExceeded: emitted.filter((entry) => entry.reviewClass === "accepted").length > 1,
	targetNotEmitted: !target || target.typography.emittedSupplementIds.length !== 1 ||
		target.palette.roles.accent !== targetCandidate ||
		target.typographyChangedRoles.some((role) => role !== "accent"),
}
const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (file) => [
	file,
	sha256(await readFile(join(projectRoot, file))),
] as const)))
const decision = Object.values(stops).some(Boolean)
	? "stop"
	: emitted.length > 0 ? "prepare-complete-palette-review" : "stop-no-role-effect"
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
	counts: {
		entries: entries.length,
		developmentEntries: entries.filter((entry) => entry.cohort === "development").length,
		canonical00Entries: entries.filter((entry) => entry.cohort === "00").length,
		available: available.length,
		selected: selected.length,
		emitted: emitted.length,
		rejectedAfterJointSelection: rejected.length,
		acceptedAvailable: available.filter((entry) => entry.reviewClass === "accepted").length,
		acceptedEmitted: emitted.filter((entry) => entry.reviewClass === "accepted").length,
	},
	stopConditions: stops,
	decision,
	target,
	reviewEntries: emitted,
	rejectedEntries: rejected,
	entries,
}, null, 2)}\n`, { flag: "wx" })
console.log(`Wrote ${entries.length} evaluations to ${outputPath}`)
