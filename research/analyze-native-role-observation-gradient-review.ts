import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	verifyNativeRoleObservationGradientArtifact,
} from "./evaluate-native-role-observation-gradient.ts"
import { buildReviewColorNames, deduplicateReviewPresentations } from "./src/review-presentation.ts"
import type { CorpusResult, Palette } from "./src/types.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const experimentId = "region-graph-0.19.0-native-role-observation-gradient-0.3.0-development"
const artifactDirectory = resolve(projectRoot, `research/data/experiments/${experimentId}`)
const feedbackPath = resolve(projectRoot, "research/data/native-role-observation-gradient-review-feedback.json")
const outputPath = resolve(projectRoot, "research/data/native-role-observation-gradient-review-analysis.json")

type NormalizedJudgment = {
	file: string
	sourceSha256: string
	source: "carried" | "fresh"
	preference: "canonical" | "treatment" | "tie"
	canonicalShippable: boolean
	treatmentShippable: boolean
	note: string
}

type Feedback = {
	schemaVersion: 1
	experimentId: string
	reviewIdentity: string
	presentationVersion: number
	scientificIdentitySha256: string
	manifestSha256: string
	entries: Array<{
		id: string
		image: string
		leftMethod: "spatial" | "previous"
		rightMethod: "spatial" | "previous"
		preference: "left" | "right" | "tie"
		ship: "left" | "right" | "both" | "neither"
		note: string
		sourceSha256: string
		pairSha256: string
		manifestSha256: string
	}>
}

function normalizeFeedback(
	feedback: Feedback["entries"][number],
	entry: { file: string; sourceSha256: string; pairSha256: string; left: "canonical" | "treatment"; right: "canonical" | "treatment" },
): NormalizedJudgment {
	if (feedback.image !== entry.file || feedback.sourceSha256 !== entry.sourceSha256 ||
		feedback.pairSha256 !== entry.pairSha256) throw new Error(`Feedback provenance mismatch for ${entry.file}`)
	const identityAt = (side: "left" | "right") => entry[side]
	return {
		file: entry.file,
		sourceSha256: entry.sourceSha256,
		source: "fresh",
		preference: feedback.preference === "tie" ? "tie" : identityAt(feedback.preference),
		canonicalShippable: feedback.ship === "both" ||
			(feedback.ship !== "neither" && identityAt(feedback.ship) === "canonical"),
		treatmentShippable: feedback.ship === "both" ||
			(feedback.ship !== "neither" && identityAt(feedback.ship) === "treatment"),
		note: feedback.note,
	}
}

function tally(judgments: readonly NormalizedJudgment[]) {
	return {
		count: judgments.length,
		preference: {
			canonical: judgments.filter((entry) => entry.preference === "canonical").length,
			treatment: judgments.filter((entry) => entry.preference === "treatment").length,
			tie: judgments.filter((entry) => entry.preference === "tie").length,
		},
		shippable: {
			canonical: judgments.filter((entry) => entry.canonicalShippable).length,
			treatment: judgments.filter((entry) => entry.treatmentShippable).length,
		},
	}
}

function palettePresentation(palette: Palette, colorNames: ReturnType<typeof buildReviewColorNames>) {
	return Object.fromEntries(["background", "foreground", "surface", "accent"].map((role) => {
		const color = palette[role as keyof Pick<Palette, "background" | "foreground" | "surface" | "accent">]
		return [role, { hex: color.hex.toLowerCase(), nearestName: colorNames[color.hex.toLowerCase()].nearestName }]
	}))
}

const artifact = await verifyNativeRoleObservationGradientArtifact(artifactDirectory, projectRoot)
const feedbackSource = await readFile(feedbackPath)
const feedback = JSON.parse(feedbackSource.toString("utf8")) as Feedback
if (feedback.experimentId !== experimentId || feedback.scientificIdentitySha256 !== artifact.reviewManifest.scientificIdentitySha256 ||
	feedback.manifestSha256 !== artifact.manifestSha256 || feedback.entries.length !== artifact.reviewManifest.queueCount) {
	throw new Error("Completed feedback is incomplete or provenance-invalid")
}
const feedbackByFile = new Map(feedback.entries.map((entry) => [entry.image, entry]))
const fresh = artifact.reviewManifest.entries.map((entry) => {
	const response = feedbackByFile.get(entry.file)
	if (!response) throw new Error(`Missing feedback for ${entry.file}`)
	return normalizeFeedback(response, entry)
})
const carried: NormalizedJudgment[] = artifact.reviewManifest.carried.map((entry) => ({
	file: entry.file,
	sourceSha256: entry.sourceSha256,
	source: "carried",
	preference: entry.preference,
	canonicalShippable: entry.canonicalShippable,
	treatmentShippable: entry.treatmentShippable,
	note: "",
}))
const canonical = JSON.parse(await readFile(resolve(projectRoot, "research/data/results.json"), "utf8")) as CorpusResult
const canonicalByFile = new Map(canonical.entries.map((entry) => [entry.file, entry]))
const treatmentByFile = new Map(artifact.results.entries.map((entry) => [entry.file, entry]))
const all = [...carried, ...fresh]
const presentations = all.map((entry) => {
	const canonicalEntry = canonicalByFile.get(entry.file)
	const treatmentEntry = treatmentByFile.get(entry.file)
	if (!canonicalEntry || !treatmentEntry) throw new Error(`Missing reviewed palette for ${entry.file}`)
	return {
		file: entry.file,
		sourceSha256: entry.sourceSha256,
		canonical: canonicalEntry.extraction.methods.spatial,
		treatment: treatmentEntry.extraction.methods.spatial,
	}
})
const deduplicated = deduplicateReviewPresentations(presentations)
const judgmentByFile = new Map(all.map((entry) => [entry.file, entry]))
for (const edge of deduplicated.duplicateCarryEdges) {
	const representative = judgmentByFile.get(edge.representativeFile)!
	const duplicate = judgmentByFile.get(edge.duplicateFile)!
	if (representative.preference !== duplicate.preference ||
		representative.canonicalShippable !== duplicate.canonicalShippable ||
		representative.treatmentShippable !== duplicate.treatmentShippable) {
		throw new Error(`Duplicate judgments disagree for ${edge.representativeFile} and ${edge.duplicateFile}`)
	}
}
const uniqueJudgments = deduplicated.representatives.map((entry) => judgmentByFile.get(entry.file)!)
const colorNames = buildReviewColorNames(canonical, artifact.results)
const commentCases = fresh.filter((entry) => entry.note.trim().length > 0).map((entry) => ({
	file: entry.file,
	sourceSha256: entry.sourceSha256,
	preference: entry.preference,
	canonicalShippable: entry.canonicalShippable,
	treatmentShippable: entry.treatmentShippable,
	note: entry.note,
	canonical: palettePresentation(canonicalByFile.get(entry.file)!.extraction.methods.spatial, colorNames),
	treatment: palettePresentation(treatmentByFile.get(entry.file)!.extraction.methods.spatial, colorNames),
}))
const result = {
	schemaVersion: 1 as const,
	experimentId,
	scientificIdentitySha256: artifact.reviewManifest.scientificIdentitySha256,
	manifestSha256: artifact.manifestSha256,
	feedbackSha256: createHash("sha256").update(feedbackSource).digest("hex"),
	colorNamePolicy: "colornames-oklab-0.6.0-nearest-oklab-presentation-only",
	rawSubmitted: tally(all),
	uniqueRenderedSources: tally(uniqueJudgments),
	duplicateCarryEdges: deduplicated.duplicateCarryEdges,
	commentCases,
	decision: {
		status: "stop" as const,
		reason: "gradient-only correction trades one recovered native failure for one new unique-source failure",
		advance: false,
	},
}
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({
	rawSubmitted: result.rawSubmitted,
	uniqueRenderedSources: result.uniqueRenderedSources,
	duplicateCarryEdges: result.duplicateCarryEdges,
	decision: result.decision,
}, null, 2)}\n`)
