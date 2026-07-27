import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { buildCandidateContext, type Candidate } from "./src/candidates.ts"
import { loadImage } from "./src/image.ts"
import { solveGuardedPalette } from "./src/guarded-palette.ts"
import { evaluateJointRoleCounterfactual, solveJointPalette } from "./src/joint-palette.ts"
import { loadNativeImage } from "./src/native-resolution-image.ts"
import { analyzeRegions } from "./src/regions.ts"
import {
	projectNativeCandidateContext,
	SCALE_AWARE_NATIVE_ALGORITHM_VERSION,
	SCALE_AWARE_NATIVE_OBSERVATION_MAX_EDGE,
	SCALE_AWARE_NATIVE_POLICY_SHA256,
} from "./src/scale-aware-native-extract.ts"
import type { Palette, RoleName } from "./src/types.ts"

const experimentRoot =
	"research/data/experiments/region-graph-0.19.0-scale-aware-native-0.2.1-development"
const outputPath = "research/data/scale-aware-native-foreground-diagnostics.json"
const childTimeoutMs = 120_000
const roles: readonly RoleName[] = ["background", "foreground", "surface", "accent"]

type ReviewJudgment = {
	preference: "canonical" | "treatment" | "tie"
	canonicalShippable: boolean
	treatmentShippable: boolean
	source: "fresh" | "carried"
}

type ReviewManifest = {
	experimentId: string
	scientificIdentitySha256: string
	manifestSha256?: string
	carried: Array<{
		file: string
		sourceSha256: string
		preference: ReviewJudgment["preference"]
		canonicalShippable: boolean
		treatmentShippable: boolean
	}>
	entries: Array<{
		file: string
		sourceRelativePath: string
		sourceSha256: string
		left: "canonical" | "treatment"
		right: "canonical" | "treatment"
	}>
}

type Feedback = {
	entries: Array<{
		image: string
		leftMethod: "spatial" | "previous"
		rightMethod: "spatial" | "previous"
		preference: "left" | "right" | "tie"
		ship: "left" | "right" | "both" | "neither"
	}>
}

function candidateKey(candidate: Candidate): string {
	return `${candidate.hex.toLowerCase()}${candidate.generated ? "!" : ""}:${candidate.typographyOnly ? "t" : "g"}:${candidate.id}`
}

function roleKeys(palette: Palette, candidates: readonly Candidate[]): Record<RoleName, string> {
	return Object.fromEntries(roles.map((role) => {
		const color = palette[role]
		const matches = candidates.filter((candidate) =>
			candidate.rgb.every((channel, index) => channel === color.rgb[index]))
		return [role, color.generated ? `${color.hex.toLowerCase()}!:generated` :
			matches.length === 0 ? `${color.hex.toLowerCase()}:unmatched` : matches.map(candidateKey).join("|")]
	})) as Record<RoleName, string>
}

function sourcePath(projectRoot: string, relativePath: string): string {
	const parts = relativePath.split("/")
	if (parts.length !== 2 || parts[0] !== "images" || basename(parts[1]) !== parts[1] || parts[1].length === 0) {
		throw new Error("Diagnostic accepts only direct images/ sources")
	}
	return join(projectRoot, ...parts)
}

async function diagnoseSource(projectRoot: string, relativePath: string) {
	const source = await readFile(sourcePath(projectRoot, relativePath))
	const [native, observation] = await Promise.all([
		loadNativeImage(source),
		loadImage(source, { maxSize: SCALE_AWARE_NATIVE_OBSERVATION_MAX_EDGE }),
	])
	const observationAnalysis = analyzeRegions(observation)
	const nativeContext = buildCandidateContext(analyzeRegions(native), 12, true, { stableFamilyAnchors: true })
	const projection = projectNativeCandidateContext(nativeContext, native, observationAnalysis)
	const guarded = solveGuardedPalette(projection.candidates, observationAnalysis)
	const joint = solveJointPalette(projection.candidates, observationAnalysis, guarded.palette)
	const maximumPopulation = Math.max(...projection.candidates.map((candidate) => candidate.population))
	const maximumChroma = Math.max(...projection.candidates.map((candidate) => candidate.chroma))

	return {
		schemaVersion: 1 as const,
		algorithmVersion: SCALE_AWARE_NATIVE_ALGORITHM_VERSION,
		policySha256: SCALE_AWARE_NATIVE_POLICY_SHA256,
		source: {
			relativePath,
			bytes: source.byteLength,
			sha256: createHash("sha256").update(source).digest("hex"),
		},
		projection: {
			candidateCount: projection.candidates.length,
			principalCandidateIds: projection.principalCandidateIds,
			excludedTypographyCandidateIds: projection.excludedTypographyCandidateIds,
			nativePartitionSha256: projection.nativePartitionSha256,
			projectedPartitionSha256: projection.projectedPartitionSha256,
		},
		guarded: {
			roles: roleKeys(guarded.palette, projection.candidates),
			palette: guarded.palette,
			certificate: guarded.certificate,
		},
		emitted: {
			roles: roleKeys(joint.palette, projection.candidates),
			palette: joint.palette,
			certificate: joint.certificate,
		},
		candidates: projection.candidates.map((candidate) => ({
			key: candidateKey(candidate),
			id: candidate.id,
			hex: candidate.hex.toLowerCase(),
			rgb: candidate.rgb,
			familyId: candidate.familyId,
			typographyOnly: candidate.typographyOnly,
			evidence: {
				population: candidate.population,
				populationRelativeToMaximum: candidate.population / maximumPopulation,
				background: candidate.background,
				saliency: candidate.saliency,
				text: candidate.text,
				chroma: candidate.chroma,
				chromaRelativeToMaximum: maximumChroma === 0 ? 0 : candidate.chroma / maximumChroma,
				spatial: candidate.spatial,
				familySpatial: candidate.familySpatial,
			},
			guardedCounterfactual: evaluateJointRoleCounterfactual(
				projection.candidates, observationAnalysis, guarded.palette, "foreground", candidate,
			),
			emittedCounterfactual: evaluateJointRoleCounterfactual(
				projection.candidates, observationAnalysis, joint.palette, "foreground", candidate,
			),
		})),
		resource: { maximumRssBytes: process.resourceUsage().maxRSS * 1024 },
	}
}

function feedbackJudgment(entry: Feedback["entries"][number]): ReviewJudgment {
	const preferredMethod = entry.preference === "tie" ? null :
		entry.preference === "left" ? entry.leftMethod : entry.rightMethod
	const shippableMethods = entry.ship === "both" ? new Set(["spatial", "previous"]) :
		entry.ship === "neither" ? new Set<string>() :
		new Set([entry.ship === "left" ? entry.leftMethod : entry.rightMethod])
	return {
		preference: preferredMethod === null ? "tie" : preferredMethod === "spatial" ? "treatment" : "canonical",
		canonicalShippable: shippableMethods.has("previous"),
		treatmentShippable: shippableMethods.has("spatial"),
		source: "fresh",
	}
}

async function runChild(projectRoot: string, relativePath: string): Promise<Awaited<ReturnType<typeof diagnoseSource>>> {
	const scriptPath = fileURLToPath(import.meta.url)
	return await new Promise((resolveChild, rejectChild) => {
		const child = spawn(process.execPath, ["--experimental-strip-types", scriptPath, "--child", relativePath], {
			cwd: projectRoot,
			env: { ...process.env, NODE_NO_WARNINGS: "1" },
			stdio: ["ignore", "pipe", "pipe"],
		})
		let stdout = ""
		let stderr = ""
		const timer = setTimeout(() => child.kill("SIGKILL"), childTimeoutMs)
		child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
			stdout += chunk
			if (stdout.length > 16 * 1024 * 1024) child.kill("SIGKILL")
		})
		child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
			stderr += chunk
			if (stderr.length > 1024 * 1024) child.kill("SIGKILL")
		})
		child.on("error", (error) => {
			clearTimeout(timer)
			rejectChild(error)
		})
		child.on("close", (code, signal) => {
			clearTimeout(timer)
			if (code !== 0) {
				rejectChild(new Error(`Foreground diagnostic child failed (${code ?? signal ?? "unknown"}): ${stderr.trim()}`))
				return
			}
			try {
				resolveChild(JSON.parse(stdout) as Awaited<ReturnType<typeof diagnoseSource>>)
			} catch (error) {
				rejectChild(error)
			}
		})
	})
}

async function diagnoseReviewedCohort(projectRoot: string) {
	const manifest = JSON.parse(await readFile(resolve(projectRoot, experimentRoot, "review-manifest.json"), "utf8")) as ReviewManifest
	const feedback = JSON.parse(await readFile(resolve(
		projectRoot, "research/data/scale-aware-native-review-feedback.json",
	), "utf8")) as Feedback
	if (manifest.experimentId !== SCALE_AWARE_NATIVE_ALGORITHM_VERSION) throw new Error("Review manifest experiment changed")
	const feedbackByFile = new Map(feedback.entries.map((entry) => [entry.image, entry]))
	const reviewed = [
		...manifest.carried.map((entry) => ({
			file: entry.file,
			relativePath: `images/${entry.file}`,
			sourceSha256: entry.sourceSha256,
			judgment: {
				preference: entry.preference,
				canonicalShippable: entry.canonicalShippable,
				treatmentShippable: entry.treatmentShippable,
				source: "carried" as const,
			},
		})),
		...manifest.entries.map((entry) => {
			const response = feedbackByFile.get(entry.file)
			if (!response) throw new Error(`Missing fresh review feedback for ${entry.file}`)
			return {
				file: entry.file,
				relativePath: entry.sourceRelativePath,
				sourceSha256: entry.sourceSha256,
				judgment: feedbackJudgment(response),
			}
		}),
	].sort((first, second) => first.file.localeCompare(second.file, "en"))
	if (reviewed.length !== 24 || new Set(reviewed.map((entry) => entry.file)).size !== reviewed.length) {
		throw new Error("Expected 24 unique reviewed sources")
	}

	const entries = []
	for (const [index, entry] of reviewed.entries()) {
		const diagnostic = await runChild(projectRoot, entry.relativePath)
		if (diagnostic.source.sha256 !== entry.sourceSha256 || diagnostic.algorithmVersion !== SCALE_AWARE_NATIVE_ALGORITHM_VERSION ||
			diagnostic.policySha256 !== SCALE_AWARE_NATIVE_POLICY_SHA256) {
			throw new Error(`Diagnostic identity mismatch for ${entry.file}`)
		}
		entries.push({ file: entry.file, judgment: entry.judgment, diagnostic })
		process.stderr.write(`[${index + 1}/${reviewed.length}] ${entry.file}\n`)
	}
	return {
		schemaVersion: 1 as const,
		experimentId: SCALE_AWARE_NATIVE_ALGORITHM_VERSION,
		policySha256: SCALE_AWARE_NATIVE_POLICY_SHA256,
		reviewScientificIdentitySha256: manifest.scientificIdentitySha256,
		cohort: {
			sourceCount: entries.length,
			freshCount: entries.filter((entry) => entry.judgment.source === "fresh").length,
			carriedCount: entries.filter((entry) => entry.judgment.source === "carried").length,
			treatmentShippableCount: entries.filter((entry) => entry.judgment.treatmentShippable).length,
			treatmentPreferredCount: entries.filter((entry) => entry.judgment.preference === "treatment").length,
		},
		inferenceInputs: {
			candidateIdentity: "native-role-aware-candidates",
			spatialEvidence: "224-scale-exact-area-projection",
			incumbents: ["treatment-guarded", "treatment-emitted"],
			canonicalRoleColorsUsed: false,
		},
		entries,
	}
}

async function main(): Promise<void> {
	const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))
	if (process.argv[2] === "--child" && process.argv.length === 4) {
		process.stdout.write(`${JSON.stringify(await diagnoseSource(projectRoot, process.argv[3]))}\n`)
		return
	}
	if (process.argv.length !== 2) throw new Error("Usage: diagnose-scale-aware-native-foreground.ts")
	const result = await diagnoseReviewedCohort(projectRoot)
	await writeFile(resolve(projectRoot, outputPath), `${JSON.stringify(result, null, 2)}\n`)
	process.stdout.write(`${outputPath}\n`)
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
	main().catch((error) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}
