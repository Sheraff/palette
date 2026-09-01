// Track D evaluation harness. Runs research/v2-3 over the target + regression subset
// and prints a stable before/after table. Evaluation-only: no runtime code imports this.
import { extractPaletteFromBytes } from "../../v2-3/index.ts"

const IMAGE_ROOT = process.env.PALETTE_IMAGE_ROOT ?? "/Users/Flo/github/palette/images"

// target = the field-topology-availability failure; regression = postmortem `strong` controls
// spanning 2-color collapse, 4-color flat, and correct gradient strata.
export const SUBSET: readonly Readonly<{ id: string; stratum: string }>[] = [
	{ id: "loups.jpg", stratum: "target (missing gradient)" },
	{ id: "black.jpg", stratum: "2-color collapse" },
	{ id: "slipknot.jpg", stratum: "2-color collapse" },
	{ id: "artofficial.jpg", stratum: "4-color flat" },
	{ id: "knuckles.jpg", stratum: "4-color flat" },
	{ id: "nada.jpg", stratum: "4-color flat" },
	{ id: "toxicity.jpg", stratum: "4-color flat" },
	{ id: "muse.jpg", stratum: "gradient (correct)" },
	{ id: "orelsan.jpg", stratum: "gradient (correct)" },
	{ id: "infected.jpg", stratum: "gradient (correct)" },
	{ id: "birdsofprey.jpg", stratum: "gradient (correct)" },
]

export async function runOne(id: string): Promise<string> {
	const extraction = await extractPaletteFromBytes(`${IMAGE_ROOT}/${id}`)
	const { background, surface, foreground, accent, gradient } = extraction.winner
	const midpoint = extraction.researchRender?.field.stops[1].hex ?? "-"
	return [background.hex, surface.hex, foreground.hex, accent.hex, gradient ? "gradient" : "flat", midpoint].join(" ")
}

async function main(): Promise<void> {
	const only = process.argv.slice(2).filter((value) => !value.startsWith("-"))
	const cases = only.length > 0 ? SUBSET.filter(({ id }) => only.includes(id)) : SUBSET
	const rows: string[] = []
	for (const { id, stratum } of cases) {
		const started = Date.now()
		const line = await runOne(id)
		rows.push(`${id.padEnd(16)} | ${stratum.padEnd(24)} | ${line} | ${((Date.now() - started) / 1000).toFixed(1)}s`)
		console.log(rows.at(-1))
	}
}

if (process.argv[1]?.endsWith("run-subset.ts")) await main()
