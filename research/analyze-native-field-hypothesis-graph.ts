import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { nameRGB } from "./src/color-name.ts"
import { harmonicConjunction } from "./src/field-relation.ts"
import type {
	NativeFieldFamilyNode,
	NativeFieldHypothesis,
	NativeFieldHypothesisGraph,
} from "./src/native-field-hypothesis-graph.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const developmentPath = resolve(projectRoot, "research/data/native-field-hypothesis-graph-development.json")
const outputPath = resolve(projectRoot, "research/data/native-field-hypothesis-graph-analysis.json")
const expectedDevelopmentSha256 = "990b3fb8370cb670831dcd0734b1bfdd1d17f58dd9fd617d3967698cc9fb8281"

type Development = {
	experimentId: string
	policySha256: string
	execution: { sourceCount: number; limited: boolean }
	summary: {
		scaleDisagreementRelations: number
		scaleUnanimousRelations: number
		maximumRssBytes: number
		maximumElapsedMs: number
	}
	entries: Array<{ file: string; graph: NativeFieldHypothesisGraph }>
}

function diagnosticSupport(hypothesis: NativeFieldHypothesis): number {
	if (hypothesis.state === "collapsed") return hypothesis.oneFieldFit.mean
	return harmonicConjunction([
		hypothesis.stateSupport.mean,
		hypothesis.twoFieldFit!.mean,
		hypothesis.incrementalSurfaceIdentity!.mean,
	])
}

function centerName(family: NativeFieldFamilyNode): string {
	const representative = family.representatives.find((entry) => entry.stableKey === family.centerRepresentativeKey)!
	return nameRGB(representative.rgb).nearestName
}

function rankedHypotheses(graph: NativeFieldHypothesisGraph) {
	const names = new Map(graph.families.map((family) => [family.stableKey, centerName(family)]))
	return [...graph.hypotheses].map((hypothesis) => ({
		hypothesis,
		support: diagnosticSupport(hypothesis),
		backgroundName: names.get(hypothesis.backgroundFamilyStableKey)!,
		surfaceName: hypothesis.surfaceFamilyStableKey ? names.get(hypothesis.surfaceFamilyStableKey)! : null,
	})).sort((first, second) => second.support - first.support ||
		first.hypothesis.stableKey.localeCompare(second.hypothesis.stableKey, "en"))
}

function pairRanks(
	graph: NativeFieldHypothesisGraph,
	firstName: string,
	secondName: string,
) {
	const ranked = rankedHypotheses(graph)
	return ranked.flatMap((entry, index) => {
		if (!entry.surfaceName || ![entry.backgroundName, entry.surfaceName].includes(firstName) ||
			![entry.backgroundName, entry.surfaceName].includes(secondName)) return []
		return [{
			rank: index + 1,
			state: entry.hypothesis.state,
			diagnosticSupport: entry.support,
			stateSupport: entry.hypothesis.stateSupport.mean,
			twoFieldFit: entry.hypothesis.twoFieldFit!.mean,
			incrementalSurfaceIdentity: entry.hypothesis.incrementalSurfaceIdentity!.mean,
			backgroundName: entry.backgroundName,
			surfaceName: entry.surfaceName,
		}]
	})
}

function topHypothesis(graph: NativeFieldHypothesisGraph) {
	const entry = rankedHypotheses(graph)[0]
	return {
		rank: 1,
		state: entry.hypothesis.state,
		diagnosticSupport: entry.support,
		backgroundName: entry.backgroundName,
		surfaceName: entry.surfaceName,
	}
}

function familyAvailability(graph: NativeFieldHypothesisGraph, names: readonly string[]) {
	return graph.families.flatMap((family) => {
		const familyName = centerName(family)
		if (!names.includes(familyName)) return []
		const center = family.representatives.find((entry) => entry.stableKey === family.centerRepresentativeKey)!
		return [{
			name: familyName,
			hex: center.hex,
			kind: family.kind,
			population: family.population,
			fieldSupport: family.native.fieldEligibility.support,
		}]
	})
}

const source = await readFile(developmentPath)
const digest = createHash("sha256").update(source).digest("hex")
if (digest !== expectedDevelopmentSha256) throw new Error("Native field graph development evidence changed")
const development = JSON.parse(source.toString("utf8")) as Development
if (development.experimentId !== "native-field-hypothesis-graph-0.1.0-development" ||
	development.execution.limited || development.execution.sourceCount !== 37 || development.entries.length !== 37) {
	throw new Error("Native field graph development evidence is incomplete")
}
const byFile = new Map(development.entries.map((entry) => [entry.file, entry.graph]))
const maroon = byFile.get("maroon5-original.jpg")!
const once = byFile.get("once.jpg")!
const knuckles = byFile.get("knuckles.jpg")!
const birds = byFile.get("birdsofprey.jpg")!
const krafty = byFile.get("krafty.jpg")!
const totalRelations = development.summary.scaleDisagreementRelations + development.summary.scaleUnanimousRelations

const result = {
	schemaVersion: 1 as const,
	experimentId: development.experimentId,
	policySha256: development.policySha256,
	developmentSha256: digest,
	structuralDecision: {
		status: "pass" as const,
		sourceCount: 37,
		resourceBoundsPassed: true,
		completeHypothesisDomains: true,
		exactSourceRepresentatives: true,
		paletteOutputProduced: false,
	},
	scaleEvidence: {
		totalOrderedRelations: totalRelations,
		disagreementRelations: development.summary.scaleDisagreementRelations,
		disagreementRate: development.summary.scaleDisagreementRelations / totalRelations,
	},
	resources: {
		maximumRssBytes: development.summary.maximumRssBytes,
		maximumElapsedMs: development.summary.maximumElapsedMs,
	},
	diagnosticCases: {
		maroon5: {
			observedReviewNeed: "mid-light warm pink-beige-peach secondary field",
			availability: familyAvailability(maroon, ["Chanterelle", "Cantaloupe"]),
			warmFieldPairRanks: pairRanks(maroon, "Chanterelle", "Blackout"),
			topHypothesis: topHypothesis(maroon),
			outcome: "available-but-under-ranked" as const,
		},
		once: {
			observedReviewNeed: "distinct fields rather than a collapsed background and surface",
			availability: familyAvailability(once, ["Fog", "Lavender Grey", "Smoky Purple"]),
			distinctFieldPairRanks: pairRanks(once, "Fog", "Lavender Grey"),
			topHypothesis: topHypothesis(once),
			outcome: "mechanically-separated" as const,
		},
		knuckles: {
			observedReviewNeed: "chromatic blue-purple field composition rather than a gray-feeling field",
			availability: familyAvailability(knuckles, ["Lilac Grey", "Coastal Slate"]),
			chromaticFieldPairRanks: pairRanks(knuckles, "Lilac Grey", "Coastal Slate"),
			topHypothesis: topHypothesis(knuckles),
			outcome: "available-but-under-ranked" as const,
		},
		birdsofprey: {
			observedReviewNeed: "gradient presentation over the native green-teal field pair",
			availability: familyAvailability(birds, ["Parakeet", "Aloe"]),
			greenTealPairRanks: pairRanks(birds, "Parakeet", "Aloe"),
			topHypothesis: topHypothesis(birds),
			outcome: "available-but-relation-evidence-near-zero" as const,
		},
		krafty: {
			observedReviewNeed: "avoid the unnecessary native-resolution gradient",
			availability: familyAvailability(krafty, ["Jet Black", "Evil Forces"]),
			darkFieldPairRanks: pairRanks(krafty, "Jet Black", "Evil Forces"),
			topHypothesis: topHypothesis(krafty),
			outcome: "mechanically-separated" as const,
		},
	},
	conclusion: {
		availabilityBottleneck: false,
		currentDiagnosticRankingAuthority: false,
		fieldRelationAloneExplainsHumanGradientPreference: false,
		nextAuthorizedWork: "source-grouped field-state and holistic-composition calibration over the frozen graph",
		humanReviewAuthorized: false,
		reserveRootsAuthorized: false,
	},
}

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({
	structuralDecision: result.structuralDecision,
	scaleEvidence: result.scaleEvidence,
	resources: result.resources,
	diagnosticOutcomes: Object.fromEntries(Object.entries(result.diagnosticCases).map(([file, value]) => [file, value.outcome])),
	conclusion: result.conclusion,
}, null, 2)}\n`)
