import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_VERSION,
	selectAlbumArtworkPaletteV2Phase3Treatments,
} from "./src/album-artwork-palette-v2-phase-3-selector.ts"
import { completeTreatmentKey, extractAlbumArtworkPaletteV2074Details } from "./src/album-artwork-palette-v2.ts"
import { loadNativeImage } from "./src/native-resolution-image.ts"

type DevelopmentSource = Readonly<{
	caseId: string
	path: string
	sha256: string
}>

type DevelopmentPanel = Readonly<{
	sources: readonly DevelopmentSource[]
}>

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(moduleDirectory, "..")
const panelPath = resolve(moduleDirectory, "data/album-artwork-palette-v2-development-panel.json")
const defaultOutputPath = resolve(
	moduleDirectory,
	"data/scratch/album-artwork-palette-v2/phase-3-selector-wave-1/diagnostics.json",
)
const defaultCases = ["development-12", "development-19", "development-01", "development-13", "development-20"]

function parseArguments(args: readonly string[]): Readonly<{ caseIds: readonly string[]; outputPath: string }> {
	const caseIds: string[] = []
	let outputPath = defaultOutputPath
	for (let index = 0; index < args.length; index++) {
		const argument = args[index]
		if (argument === "--case") {
			const value = args[++index]
			if (!value) throw new Error("--case requires a value")
			caseIds.push(value)
		} else if (argument === "--output") {
			const value = args[++index]
			if (!value) throw new Error("--output requires a value")
			outputPath = resolve(value)
		} else {
			throw new Error(`Unknown argument ${argument}`)
		}
	}
	const selected = caseIds.length === 0 ? defaultCases : [...new Set(caseIds)]
	if (selected.length === 0 || selected.length > 8 || selected.some((caseId) => !/^development-[0-9]{2}$/u.test(caseId))) {
		throw new Error("Diagnostics require one to eight development case IDs")
	}
	return { caseIds: selected, outputPath }
}

async function evaluateSource(source: DevelopmentSource) {
	const image = await loadNativeImage(await readFile(resolve(projectRoot, source.path)))
	const closed = extractAlbumArtworkPaletteV2074Details(image)
	const domain = closed.audit.candidate.completeTreatments
	const identity = closed.result.diagnostics.identityObligationGraph
	const selection = selectAlbumArtworkPaletteV2Phase3Treatments(domain, identity)
	const repeated = selectAlbumArtworkPaletteV2Phase3Treatments([...domain].reverse(), {
		obligations: [...identity.obligations].reverse(),
	})
	const closedWinnerKey = completeTreatmentKey(closed.result.winner)
	const selectorWinnerKey = completeTreatmentKey(selection.winner)
	const closedSlateKeys = closed.result.alternatives.map(completeTreatmentKey)
	const selectorSlateKeys = selection.slate.map(completeTreatmentKey)
	const selectorSlateSet = new Set(selectorSlateKeys)
	const closedSlateSet = new Set(closedSlateKeys)
	const closedWinnerEvaluation = selection.evaluations.find(({ key }) => key === closedWinnerKey)
	const selectedWinnerEvaluation = selection.evaluations.find(({ key }) => key === selectorWinnerKey)
	if (!closedWinnerEvaluation || !selectedWinnerEvaluation) throw new Error(`Missing complete treatment for ${source.caseId}`)
	const generatedTreatmentCount = domain.filter((treatment) =>
		[treatment.background, treatment.surface, treatment.foreground, treatment.accent].some(({ generated }) => generated)).length
	return {
		caseId: source.caseId,
		sourceSha256: source.sha256,
		dimensions: { width: image.width, height: image.height },
		domain: selection.explanation.domain,
		deterministicUnderReversal: selectorWinnerKey === completeTreatmentKey(repeated.winner) &&
			JSON.stringify(selectorSlateKeys) === JSON.stringify(repeated.slate.map(completeTreatmentKey)) &&
			JSON.stringify(selection.explanation) === JSON.stringify(repeated.explanation),
		winnerDelta: {
			closedKey: closedWinnerKey,
			selectorKey: selectorWinnerKey,
			changed: closedWinnerKey !== selectorWinnerKey,
			closedWinner: {
				paretoMember: closedWinnerEvaluation.paretoMember,
				dominatedByKey: closedWinnerEvaluation.dominatedByKey,
				qualityUtility: closedWinnerEvaluation.qualityUtility,
				identityGain: closedWinnerEvaluation.identityGain,
				relationUtility: closedWinnerEvaluation.relationUtility,
			},
			selectorWinner: {
				qualityUtility: selectedWinnerEvaluation.qualityUtility,
				identityGain: selectedWinnerEvaluation.identityGain,
				relationUtility: selectedWinnerEvaluation.relationUtility,
			},
		},
		slateDelta: {
			closedKeys: closedSlateKeys,
			selectorKeys: selectorSlateKeys,
			addedKeys: selectorSlateKeys.filter((key) => !closedSlateSet.has(key)),
			removedKeys: closedSlateKeys.filter((key) => !selectorSlateSet.has(key)),
		},
		generated: {
			treatmentCount: generatedTreatmentCount,
			selected: selection.slate.filter((treatment) =>
				[treatment.background, treatment.surface, treatment.foreground, treatment.accent]
					.some(({ generated }) => generated)).length,
		},
	}
}

export async function evaluateAlbumArtworkPaletteV2Phase3Selector(
	caseIds: readonly string[],
) {
	const panel = JSON.parse(await readFile(panelPath, "utf8")) as DevelopmentPanel
	const byCaseId = new Map(panel.sources.map((source) => [source.caseId, source]))
	const sources = caseIds.map((caseId) => {
		const source = byCaseId.get(caseId)
		if (!source) throw new Error(`Unknown development case ${caseId}`)
		if (source.path.split(/[\\/]/u).includes("..")) throw new Error(`Unsafe development source ${caseId}`)
		return source
	})
	const cases = []
	for (const source of sources) cases.push(await evaluateSource(source))
	return {
		schemaVersion: 1,
		selectorVersion: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_VERSION,
		policy: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY,
		caseCount: cases.length,
		winnerChangeCount: cases.filter(({ winnerDelta }) => winnerDelta.changed).length,
		dominatedClosedWinnerCount: cases.filter(({ winnerDelta }) => !winnerDelta.closedWinner.paretoMember).length,
		allDeterministicUnderReversal: cases.every(({ deterministicUnderReversal }) => deterministicUnderReversal),
		cases,
	}
}

async function main(): Promise<void> {
	const options = parseArguments(process.argv.slice(2))
	const output = await evaluateAlbumArtworkPaletteV2Phase3Selector(options.caseIds)
	await mkdir(dirname(options.outputPath), { recursive: true })
	await writeFile(options.outputPath, `${JSON.stringify(output, null, 2)}\n`)
	process.stdout.write(`Wrote ${output.caseCount} bounded selector diagnostics to ${relative(projectRoot, options.outputPath)}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error: unknown) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}
