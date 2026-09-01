import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { writeJsonAtomic } from "./src/candidate-output.ts"
import {
	decideGradientEligibility,
	GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION,
	type GradientEligibilityEvidence,
} from "./src/gradient-eligibility.ts"
import type { Palette } from "./src/types.ts"

type DevelopmentEntry = {
	familyId: string
	anchor: { file: string; sha256: string; width: number; height: number }
	palette: Palette
	evidence: GradientEligibilityEvidence
}
type Development = {
	algorithmVersion: string
	experimentVersion: string
	entries: DevelopmentEntry[]
}
type Pilot = { reviewQueue: Array<{ familyId: string }> }
type ChangeReview = { entries: Array<{ familyId: string; cohort: "music" | "holdout" }> }

const [developmentArgument, pilotArgument, changeReviewArgument, outputArgument, mode = "changed"] = process.argv.slice(2)
if (!developmentArgument || !pilotArgument || !changeReviewArgument || !outputArgument ||
	(mode !== "changed" && mode !== "retained")) {
	throw new Error("Usage: prepare-gradient-eligibility-unseen-music-review.ts <development.json> <pilot.json> <change-review.json> <output.json> [changed|retained]")
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

const [developmentSource, pilotSource, changeReviewSource] = await Promise.all([
	readFile(resolve(developmentArgument)),
	readFile(resolve(pilotArgument)),
	readFile(resolve(changeReviewArgument)),
])
const development = JSON.parse(developmentSource.toString("utf8")) as Development
const pilot = JSON.parse(pilotSource.toString("utf8")) as Pilot
const changeReview = JSON.parse(changeReviewSource.toString("utf8")) as ChangeReview
if (development.algorithmVersion !== "region-graph-0.17.0" ||
	development.experimentVersion !== GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION ||
	!Array.isArray(development.entries) || !Array.isArray(pilot.reviewQueue) || !Array.isArray(changeReview.entries)) {
	throw new Error("Music evidence or prior review coverage is invalid")
}
const pilotIds = new Set(pilot.reviewQueue.map((entry) => entry.familyId))
const comparisonIds = new Set(changeReview.entries.filter((entry) => entry.cohort === "music")
	.map((entry) => entry.familyId))
if (pilotIds.size !== pilot.reviewQueue.length || comparisonIds.size !==
	changeReview.entries.filter((entry) => entry.cohort === "music").length) {
	throw new Error("Prior review coverage is duplicated")
}
const displayed = new Set([...pilotIds, ...comparisonIds])
const decisions = new Map(development.entries.map((entry) => {
	if (entry.evidence.experimentVersion !== GRADIENT_ELIGIBILITY_EXPERIMENT_VERSION) {
		throw new Error(`Stale evidence for ${entry.familyId}`)
	}
	return [entry.familyId, decideGradientEligibility(entry.evidence)]
}))
const changed = development.entries.filter((entry) => !decisions.get(entry.familyId)!.eligible)
const retained = development.entries.filter((entry) => decisions.get(entry.familyId)!.eligible)
const selected = mode === "changed" ? changed : retained
const previouslyDisplayed = selected.filter((entry) => displayed.has(entry.familyId))
const entries = selected.filter((entry) => !displayed.has(entry.familyId)).map((entry) => ({
	familyId: entry.familyId,
	anchor: entry.anchor,
	palette: entry.palette,
	candidateReason: decisions.get(entry.familyId)!.reason,
})).sort((first, second) => sha256(`unseen-music-promotion/${first.familyId}`).localeCompare(
	sha256(`unseen-music-promotion/${second.familyId}`)))
await writeJsonAtomic({ path: resolve(outputArgument), refuseOverwrite: true }, {
	schemaVersion: 1,
	reviewVersion: mode === "changed" ? "gradient-eligibility-unseen-music-promotion-review-0.1.0" :
		"gradient-eligibility-unseen-music-retained-review-0.1.0",
	experimentVersion: GRADIENT_ELIGIBILITY_CANDIDATE_VERSION,
	generatedAt: new Date().toISOString(),
	provenance: {
		developmentSha256: sha256(developmentSource),
		pilotSha256: sha256(pilotSource),
		changeReviewSha256: sha256(changeReviewSource),
	},
	summary: {
		reviewMode: mode,
		canonicalMusicGradients: development.entries.length,
		candidateChanges: changed.length,
		candidateRetained: retained.length,
		pilotCasesDisplayed: pilotIds.size,
		comparisonMusicCasesDisplayed: comparisonIds.size,
		previouslyDisplayedSelected: previouslyDisplayed.length,
		unseenSelected: entries.length,
	},
	entries,
})
process.stderr.write(`Prepared all ${entries.length} unseen ${mode} music gradients; excluded ${previouslyDisplayed.length} displayed cases\n`)
