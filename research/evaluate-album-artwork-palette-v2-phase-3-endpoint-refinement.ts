import { readFile } from "node:fs/promises"
import { performance } from "node:perf_hooks"
import {
	buildNativePaletteEvidence,
	diagnoseGradientFits,
} from "./src/album-artwork-palette-v2.ts"
import {
	buildBandLocalEndpointRefinements,
} from "./src/album-artwork-palette-v2-phase-3-endpoint-refinement.ts"
import { loadNativeImage } from "./src/native-resolution-image.ts"

type DevelopmentSource = Readonly<{
	caseId: string
	path: string
}>

type DevelopmentPanel = Readonly<{
	sources: readonly DevelopmentSource[]
}>

const requested = process.argv.slice(2)
if (requested.length === 0 || requested.length > 4 ||
	requested.some((caseId) => !/^development-[0-9]{2}$/u.test(caseId)) ||
	new Set(requested).size !== requested.length) {
	throw new Error("Pass one to four unique development case IDs")
}

const panel = JSON.parse(await readFile(new URL(
	"./data/album-artwork-palette-v2-development-panel.json",
	import.meta.url,
), "utf8")) as DevelopmentPanel
const sources = requested.map((caseId) => {
	const source = panel.sources.find((candidate) => candidate.caseId === caseId)
	if (!source) throw new Error(`Unknown development case ${caseId}`)
	return source
})

const results = []
for (const source of sources) {
	const image = await loadNativeImage(await readFile(new URL(`../${source.path}`, import.meta.url)))
	const started = performance.now()
	const evidence = buildNativePaletteEvidence(image)
	const diagnostics = diagnoseGradientFits(evidence)
	const refinement = buildBandLocalEndpointRefinements(evidence, diagnostics)
	results.push({
		caseId: source.caseId,
		dimensions: { width: image.width, height: image.height },
		runtimeMs: performance.now() - started,
		evaluatedFitCount: refinement.evaluatedFitCount,
		sameFamilyFitCount: refinement.sameFamilyFitCount,
		acceptedCount: refinement.acceptedCount,
		rejectedCount: refinement.rejectedCount,
		accepted: refinement.refinements.filter(({ accepted }) => accepted).map((candidate) => ({
			topology: candidate.fit.topology,
			direction: candidate.fit.direction,
			endpointDistance: candidate.endpointDistance,
			occupiedModeDistance: candidate.occupiedModeDistance,
			low: candidate.low && {
				hex: candidate.low.representatives.denseExact.hex,
				population: candidate.low.family.population,
				modeShare: candidate.low.distribution.localModes[0].neighborhoodFraction,
				strategies: candidate.low.family.representatives.map(({ strategy }) => strategy),
			},
			high: candidate.high && {
				hex: candidate.high.representatives.denseExact.hex,
				population: candidate.high.family.population,
				modeShare: candidate.high.distribution.localModes[0].neighborhoodFraction,
				strategies: candidate.high.family.representatives.map(({ strategy }) => strategy),
			},
		})),
		rejectionCounts: Object.fromEntries([...refinement.refinements
			.flatMap(({ rejectionReasons }) => rejectionReasons)
			.reduce((counts, reason) => counts.set(reason, (counts.get(reason) ?? 0) + 1), new Map<string, number>())]
			.sort(([first], [second]) => first < second ? -1 : first > second ? 1 : 0)),
	})
}

process.stdout.write(`${JSON.stringify({ workerCount: 1, results }, null, 2)}\n`)
