/**
 * Track A winner-ranking experiment runner.
 *
 * Runs `research/v2-3` `extractPaletteFromBytes` over a fixed target subset (the
 * reviewed ranking failures) and a regression subset (cases the Phase 3 final
 * showcase review judged strong across strata), and prints one row per case:
 * the four role hexes, the gradient decision, and the research midpoint.
 *
 * Usage:
 *   node research/v2-3-experiments/track-a/run-subset.ts [--out <file.json>] [--only a,b,c] [--repeat <id>]
 *
 * Image root resolution: `PALETTE_IMAGES_ROOT` if set, otherwise `<repo>/images`.
 * (Unsuffixed artwork files are not tracked in every checkout.)
 */

import { readFile, writeFile, access } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { extractPaletteFromBytes } from "../../v2-3/index.ts"

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url))
const imagesRoot = process.env.PALETTE_IMAGES_ROOT ?? resolve(repoRoot, "images")

/** Reviewed ranking-failure cases this track targets. */
export const TARGET_CASES = [
	"greenday.jpg",
	"meteora.jpg",
	"elephunk.jpg",
	"skap.jpg",
	"vvbrown.jpg",
	"slim.jpg",
	"doja.jpg",
	"placebo.jpg",
] as const

/** Cases the review judged strong, spanning 2-color collapse / 3-color / 4-color flat / gradient. */
export const REGRESSION_CASES = [
	"slipknot.jpg",
	"franz.jpg",
	"nobs.jpg",
	"horrorwood.jpg",
	"toxicity.jpg",
	"muse.jpg",
	"orelsan.jpg",
] as const

/**
 * All 34 unsuffixed base artworks, i.e. the exact corpus of the Phase 3 final
 * showcase absolute review. Used to measure the blast radius of a ranking
 * change rather than only its intended targets.
 */
export const BASE_CORPUS = [
	"artofficial.jpg", "birdsofprey.jpg", "black.jpg", "disney.avif", "doja.jpg", "elephunk.jpg",
	"franz.jpg", "greenday.jpg", "havana.jpg", "horrorwood.jpg", "horsley.jpg", "infected.jpg",
	"johns.jpg", "knuckles.jpg", "krafty.jpg", "loups.jpg", "maroon5.jpg", "meteora.jpg",
	"muse.jpg", "nada.jpg", "nobs.jpg", "once.jpg", "orelsan.jpg", "placebo.jpg",
	"pureblack.jpg", "purered.jpg", "purewhite.jpg", "skap.jpg", "slim.jpg", "slipknot.jpg",
	"snarky.jpg", "toxicity.jpg", "vvbrown.jpg", "ybbb.jpg",
] as const

export type CaseResult = Readonly<{
	caseId: string
	background: string
	surface: string
	foreground: string
	accent: string
	gradient: boolean
	collapse: readonly [surface: boolean, accent: boolean]
	midpoint: string | null
	milliseconds: number
}>

export async function runCase(caseId: string): Promise<CaseResult> {
	const file = resolve(imagesRoot, caseId)
	await access(file)
	const bytes = new Uint8Array(await readFile(file))
	const started = Date.now()
	const extraction = await extractPaletteFromBytes(bytes)
	const winner = extraction.winner
	return {
		caseId,
		background: winner.background.hex,
		surface: winner.surface.hex,
		foreground: winner.foreground.hex,
		accent: winner.accent.hex,
		gradient: winner.gradient,
		collapse: [winner.collapse.surface, winner.collapse.accent],
		midpoint: extraction.researchRender?.field.stops[1].hex ?? null,
		milliseconds: Date.now() - started,
	}
}

function formatRow(result: CaseResult): string {
	return [
		result.caseId.padEnd(16),
		result.background,
		result.surface,
		result.foreground,
		result.accent,
		result.gradient ? "gradient" : "flat    ",
		result.midpoint ?? "-------",
		`${result.collapse[0] ? "S" : "-"}${result.collapse[1] ? "A" : "-"}`,
		`${result.milliseconds}ms`,
	].join("  ")
}

async function main(): Promise<void> {
	const argv = process.argv.slice(2)
	const readFlag = (name: string): string | null => {
		const index = argv.indexOf(name)
		return index >= 0 && index + 1 < argv.length ? argv[index + 1] : null
	}
	const only = readFlag("--only")
	const repeat = readFlag("--repeat")
	const out = readFlag("--out")
	const cases = argv.includes("--base-corpus")
		? [...BASE_CORPUS]
		: only
			? only.split(",").map((value) => value.trim()).filter((value) => value.length > 0)
			: [...TARGET_CASES, ...REGRESSION_CASES]

	const results: CaseResult[] = []
	for (const caseId of cases) {
		const result = await runCase(caseId)
		results.push(result)
		console.log(formatRow(result))
	}
	if (repeat) {
		const first = await runCase(repeat)
		const second = await runCase(repeat)
		const stable = (["background", "surface", "foreground", "accent", "gradient", "midpoint"] as const)
			.every((field) => first[field] === second[field])
		console.log(`determinism ${repeat}: ${stable ? "STABLE" : "DIVERGENT"}`)
		console.log(formatRow(first))
		console.log(formatRow(second))
	}
	if (out) {
		await writeFile(resolve(process.cwd(), out), `${JSON.stringify(results, null, "\t")}\n`)
	}
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
	await main()
}
