import { createHash } from "node:crypto"
import { access, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { okDistance, rgbToOKLab } from "./src/color.ts"
import { extractPalette } from "./src/extract.ts"
import { loadImage } from "./src/image.ts"
import {
	evaluateTypographyChromaticRole,
	TYPOGRAPHY_CHROMATIC_ROLE_VERSION,
} from "./src/typography-chromatic-role.ts"
import type { RoleName } from "./src/types.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const experimentRoot = join(projectRoot, "research/data/experiments/typography-chromatic-role-0.1.0-poc.1-development")
const outputPath = join(experimentRoot, "evaluation.json")
const targetFile = "00/ab67616d0000b2730000c4e4d278f49bbc995440.jpg"
const roleNames: RoleName[] = ["background", "foreground", "surface", "accent"]
const implementationFiles = [
	"package.json",
	"pnpm-lock.yaml",
	"research/src/color.ts",
	"research/src/image.ts",
	"research/src/regions.ts",
	"research/src/candidates.ts",
	"research/src/guarded-palette.ts",
	"research/src/joint-palette.ts",
	"research/src/chromatic-candidate-availability.ts",
	"research/src/chromatic-role-extract.ts",
	"research/src/typography-chromatic-candidate-availability.ts",
	"research/src/typography-chromatic-role.ts",
	"research/evaluate-typography-chromatic-role.ts",
] as const

function sha256(value: Uint8Array | string): string {
	return createHash("sha256").update(value).digest("hex")
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

const availabilityEvaluationPath =
	"research/data/experiments/typography-chromatic-candidate-availability-0.2.0-poc.1-development/evaluation.json"
const availabilityEvaluationBytes = await readFile(join(projectRoot, availabilityEvaluationPath))
const availabilityEvaluation = JSON.parse(availabilityEvaluationBytes.toString("utf8")) as {
	holdoutSummary: {
		triggeredEntries: Array<{
			file: string
			reviewClass: "accepted" | "rejected" | "unselected"
			sourceSha256: string
		}>
	}
}

async function main(): Promise<void> {
	if (process.argv.slice(2).length > 0) throw new Error("This evaluator does not accept arguments")
	await assertOutputAbsent()
	const entries = []
	for (const source of availabilityEvaluation.holdoutSummary.triggeredEntries) {
		const bytes = await readFile(join(projectRoot, source.file))
		if (sha256(bytes) !== source.sourceSha256) throw new Error(`Bound source changed for ${source.file}`)
		const image = await loadImage(bytes)
		const canonical = extractPalette(image)
		const result = evaluateTypographyChromaticRole(image)
		const canonicalSummary = {
			roles: Object.fromEntries(roleNames.map((role) => [role, {
				hex: canonical.methods.spatial[role].hex.toLowerCase(),
				generated: canonical.methods.spatial[role].generated,
			}])),
			gradient: canonical.methods.spatial.gradient.isGradient,
			metrics: {
				foregroundBackgroundContrast: canonical.methods.spatial.metrics.foregroundContrast,
				foregroundSurfaceContrast: canonical.methods.spatial.metrics.foregroundSurfaceContrast,
				accentBackgroundContrast: canonical.methods.spatial.metrics.accentContrast,
				accentSurfaceContrast: canonical.methods.spatial.metrics.accentSurfaceContrast,
			},
		}
		if (JSON.stringify(canonicalSummary) !== JSON.stringify(result.canonical)) {
			throw new Error(`Canonical 0.19 output mismatch for ${source.file}`)
		}
		const materialChangedRoles = roleNames.filter((role) =>
			okDistance(
				rgbToOKLab(canonical.methods.spatial[role].rgb),
				rgbToOKLab(result.treatment.roles[role].hex.match(/[0-9a-f]{2}/gi)!.map((value) => parseInt(value, 16)) as [number, number, number]),
			) > 0.025)
		entries.push({
			file: source.file,
			reviewClass: source.reviewClass,
			sourceSha256: source.sourceSha256,
			materialChangedRoles,
			...result,
		})
	}
	const exactChanged = entries.filter((entry) =>
		entry.decision.exactChangedRoles.length > 0 || entry.decision.gradientChanged)
	const materialChanged = entries.filter((entry) =>
		entry.materialChangedRoles.length > 0 || entry.decision.gradientChanged)
	const reviewEligible = entries.filter((entry) => entry.decision.reviewEligible &&
		(entry.materialChangedRoles.length > 0 || entry.decision.gradientChanged))
	const target = entries.find((entry) => entry.file === targetFile)
	if (!target) throw new Error("Target is missing from role-integration inputs")
	const stops = {
		targetDidNotSelectForegroundOrAccent: target.decision.selectedSupplementRoles.foreground === undefined &&
			target.decision.selectedSupplementRoles.accent === undefined,
		changedWithoutSelectingAddedCandidate: materialChanged.some((entry) =>
			!entry.decision.treatmentSelectsAddedCandidate),
		gradientChanged: entries.some((entry) => entry.decision.gradientChanged),
		postSolverSafetyFailed: materialChanged.some((entry) => !entry.decision.postSolverSafetyEligible),
		totalBreadthExceeded: materialChanged.length > 7,
		acceptedBreadthExceeded: materialChanged.filter((entry) => entry.reviewClass === "accepted").length > 1,
		canonicalOutputChanged: false,
	}
	const implementation = Object.fromEntries(await Promise.all(implementationFiles.map(async (file) => [
		file,
		sha256(await readFile(join(projectRoot, file))),
	] as const)))
	const protocolPath = "research/data/experiments/typography-chromatic-role-0.1.0-poc.1-development/protocol.json"
	const bindings = {
		availabilityEvaluationSha256: sha256(availabilityEvaluationBytes),
		protocolSha256: sha256(await readFile(join(projectRoot, protocolPath))),
		implementation,
	}
	const decision = Object.values(stops).some(Boolean)
		? "stop"
		: reviewEligible.length > 0 ? "prepare-complete-blinded-review" : "stop-no-role-effect"
	await writeFile(outputPath, `${JSON.stringify({
		schemaVersion: 1,
		experimentVersion: TYPOGRAPHY_CHROMATIC_ROLE_VERSION,
		generatedAt: new Date().toISOString(),
		developmentEvidence: true,
		bindings,
		counts: {
			sources: entries.length,
			exactChanged: exactChanged.length,
			materialChanged: materialChanged.length,
			reviewEligible: reviewEligible.length,
			acceptedMaterialChanged: materialChanged.filter((entry) => entry.reviewClass === "accepted").length,
			rejectedMaterialChanged: materialChanged.filter((entry) => entry.reviewClass === "rejected").length,
			unselectedMaterialChanged: materialChanged.filter((entry) => entry.reviewClass === "unselected").length,
		},
		stopConditions: stops,
		decision,
		target,
		entries,
	}, null, 2)}\n`, { flag: "wx" })
}

await main()
