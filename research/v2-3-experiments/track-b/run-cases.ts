// Track B evaluation harness.
//
// Runs research/v2-3/index.ts extractPaletteFromBytes over the Track B case set and
// writes a JSON record of (4 hexes, gradient flag, midpoint hex) per case.
//
// Usage:
//   node --experimental-strip-types research/v2-3-experiments/track-b/run-cases.ts <label> [caseId...]
//
// Images are gitignored in this repo; they live in the primary checkout.
// IMAGE_ROOT can override the lookup directory.

import { readFileSync, writeFileSync } from "node:fs"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

// ALGORITHM_INDEX points at an alternative build of the algorithm (a trunk snapshot exported
// with `git archive`, say) so a composition can be measured against its own base.
const algorithmIndex = process.env.ALGORITHM_INDEX ??
	resolve(import.meta.dirname, "../../v2-3/index.ts")

const { extractPaletteFromBytes } = await import(algorithmIndex) as
	typeof import("../../v2-3/index.ts")

const IMAGE_ROOTS = [
	process.env.IMAGE_ROOT,
	resolve(import.meta.dirname, "../../../images"),
	"/Users/Flo/github/palette/images",
].filter((value): value is string => typeof value === "string")

// Targets addressed by Track B.
export const TARGET_CASES = ["loups.jpg", "doja.jpg", "placebo.jpg", "birdsofprey.jpg"] as const

// Every case the review fixtures mark gradient: true.
export const GRADIENT_CASES = [
	"birdsofprey.jpg",
	"doja.jpg",
	"havana.jpg",
	"horsley.jpg",
	"infected.jpg",
	"muse.jpg",
	"once.jpg",
	"orelsan.jpg",
	"placebo.jpg",
	"slim.jpg",
] as const

// Flat neutrality set: cases the phase-3 postmortem judged `strong` and that render flat.
// Spans 4-colour flat, 2-colour collapse, and pure/degenerate fields.
export const FLAT_CASES = [
	"artofficial.jpg",
	"franz.jpg",
	"horrorwood.jpg",
	"knuckles.jpg",
	"krafty.jpg",
	"maroon5.jpg",
	"nada.jpg",
	"toxicity.jpg",
	"disney.avif",
	"nobs.jpg",
	"snarky.jpg",
	"ybbb.jpg",
] as const

export const ALL_CASES = [...new Set([...TARGET_CASES, ...GRADIENT_CASES, ...FLAT_CASES])].sort()

// The complete reviewed corpus, for acceptance sweeps.
export const FIXTURE_CASES = [
	"artofficial.jpg", "birdsofprey.jpg", "black.jpg", "disney.avif", "doja.jpg", "elephunk.jpg",
	"franz.jpg", "greenday.jpg", "havana.jpg", "horrorwood.jpg", "horsley.jpg", "infected.jpg",
	"johns.jpg", "knuckles.jpg", "krafty.jpg", "loups.jpg", "maroon5.jpg", "meteora.jpg",
	"muse.jpg", "nada.jpg", "nobs.jpg", "once.jpg", "orelsan.jpg", "placebo.jpg", "pureblack.jpg",
	"purered.jpg", "purewhite.jpg", "skap.jpg", "slim.jpg", "slipknot.jpg", "snarky.jpg",
	"toxicity.jpg", "vvbrown.jpg", "ybbb.jpg",
] as const

// Off-panel artworks: never used to design anything, held back as a generalisation check.
// 10/ab67616d00001e02001061a3c7a084a0af56580d is excluded — the artwork itself is marked
// invalid in research/v2-3-eval/data/invalid-artworks.txt.
export const OFF_PANEL_CASES = [
	"00/ab67616d00001e020000269ead63cf2376a6b67d.jpg",
	"01/ab67616d00001e020001738a49a69ed70ffcbe42.jpg",
	"03/ab67616d00001e020003e50500c5d762da89643a.jpg",
	"05/ab67616d0000b2730005230fae1822525e5a5ff6",
	"07/ab67616d0000b27300075841f68d8cd71db368d8",
	"09/ab67616d0000b2730009d178a401f9433fdddff2",
	"11/ab67616d0000b2730011c0148119c34e2b222b02",
] as const

export type CaseRecord = Readonly<{
	caseId: string
	background: string
	surface: string
	foreground: string
	accent: string
	gradient: boolean
	collapseSurface: boolean
	collapseAccent: boolean
	midpoint: string | null
	milliseconds: number
}>

const REPO_ROOTS = [
	resolve(import.meta.dirname, "../../.."),
	"/Users/Flo/GitHub/palette",
]

function locate(caseId: string): string {
	// Off-panel entries are repository-relative paths; panel entries are images/ basenames.
	const roots = caseId.includes("/") ? REPO_ROOTS : IMAGE_ROOTS
	for (const root of roots) {
		const path = resolve(root, caseId)
		if (existsSync(path)) return path
	}
	throw new Error(`image not found for ${caseId} in ${roots.join(", ")}`)
}

export async function runCase(caseId: string): Promise<CaseRecord> {
	const started = Date.now()
	const extraction = await extractPaletteFromBytes(locate(caseId))
	return {
		caseId,
		background: extraction.winner.background.hex,
		surface: extraction.winner.surface.hex,
		foreground: extraction.winner.foreground.hex,
		accent: extraction.winner.accent.hex,
		gradient: extraction.winner.gradient,
		collapseSurface: extraction.winner.collapse.surface,
		collapseAccent: extraction.winner.collapse.accent,
		midpoint: extraction.researchRender?.field.stops[1].hex ?? null,
		milliseconds: Date.now() - started,
	}
}

async function main(): Promise<void> {
	const [label, ...selected] = process.argv.slice(2)
	if (!label) throw new Error("usage: run-cases.ts <label> [caseId...]")
	const cases = selected.length === 1 && selected[0] === "--corpus"
		// The exact image set the trunk's own cached result label covers, minus any artwork
		// marked invalid. Regenerate with scratch tooling when the trunk label moves.
		? JSON.parse(readFileSync(resolve(import.meta.dirname, "a5-corpus.json"), "utf8")) as string[]
		: selected.length === 1 && selected[0] === "--fixtures"
		? [...FIXTURE_CASES]
		: selected.length === 1 && selected[0] === "--off-panel"
		? [...OFF_PANEL_CASES]
		: selected.length === 1 && selected[0] === "--all"
		? [...FIXTURE_CASES, ...OFF_PANEL_CASES]
		: selected.length > 0 ? selected : ALL_CASES
	const records: CaseRecord[] = []
	for (const caseId of cases) {
		const record = await runCase(caseId)
		records.push(record)
		process.stdout.write(
			`${caseId.padEnd(18)} ${record.background} ${record.surface} ${record.foreground} ${record.accent} ` +
				`gradient=${String(record.gradient).padEnd(5)} midpoint=${record.midpoint ?? "-"}` +
				` (${record.milliseconds}ms)\n`,
		)
	}
	const output = resolve(import.meta.dirname, `results-${label}.json`)
	writeFileSync(output, `${JSON.stringify(records, null, "\t")}\n`)
	process.stdout.write(`\nwrote ${output}\n`)
}

if (process.argv[1] === import.meta.filename) await main()
