/**
 * **The owed-guide-stop census** — `DECISIONS.md` D6's *"today we cannot even detect when we owe one"*,
 * answered on a set of covers.
 *
 *     node --experimental-strip-types prototypes/p2-tree/tos/gradient/census.ts --set <set.txt> [--out <file.jsonl>]
 *     node --experimental-strip-types prototypes/p2-tree/tos/gradient/census.ts <image…> --out <file.jsonl>
 *
 * One JSON line per image, plus a summary on stderr. Report-only: it runs the published candidate and
 * records what the machinery in `guide-stop.ts` decided, it never decides anything itself.
 *
 * The number to read it beside is **C7**, quoted in D6: *42% of legacy midpoints sit outside their
 * endpoints' lightness span* — the campaign's only prior estimate of how often a straight 2-stop line
 * is the wrong path. C7 is a statement about legacy's *published midpoints*, not about this
 * prototype's ramps, so the two are companions rather than comparable rates; the summary prints both
 * so a reader cannot mistake one for the other.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { paletteWithDiagnostics } from "../candidate.ts"

/** What the census records for one cover. */
export type CensusRow = Readonly<{
	imagePath: string
	/** `null` when the palette published no ramp — a flat, partitioned, textured or collapsed cover. */
	gradient: unknown
	stops: number
	roles: Readonly<{ background: string; surface: string }>
}>

export async function censusOf(imagePath: string): Promise<CensusRow> {
	const diagnostics = await paletteWithDiagnostics(imagePath)
	const palette = diagnostics.palette
	return {
		imagePath,
		gradient: diagnostics.gradientExcursion,
		stops: palette.gradient === null ? 0 : palette.gradient.stops.length,
		roles: { background: palette.roles.background.hex, surface: palette.roles.surface.hex },
	}
}

const V3_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..")
const REPO_ROOT = resolve(V3_ROOT, "..", "..")

async function main(argv: readonly string[]): Promise<void> {
	const images: string[] = []
	let out: string | null = null
	let setPath: string | null = null
	for (let index = 0; index < argv.length; index += 1) {
		if (argv[index] === "--out") {
			out = argv[index + 1]
			index += 1
		} else if (argv[index] === "--set") {
			setPath = argv[index + 1]
			index += 1
		} else {
			images.push(argv[index])
		}
	}
	if (setPath !== null) {
		const text = await readFile(resolve(setPath), "utf8")
		for (const line of text.split("\n")) {
			const trimmed = line.trim()
			if (trimmed === "" || trimmed.startsWith("#")) continue
			images.push(isAbsolute(trimmed) ? trimmed : resolve(REPO_ROOT, trimmed))
		}
	}
	if (images.length === 0) throw new Error("census.ts needs at least one image, or a --set file")

	const rows: CensusRow[] = []
	for (const image of images) {
		const absolute = isAbsolute(image) ? image : resolve(REPO_ROOT, image)
		const row = await censusOf(absolute)
		rows.push(row)
		const report = row.gradient as null | {
			owed: boolean
			inserted: boolean
			refusal: string
			before: { maxBars: number; position: number }
			after: null | { maxBars: number }
		}
		process.stderr.write(
			report === null
				? `${absolute.split("/").pop()}  no-ramp\n`
				: `${absolute.split("/").pop()}  before=${report.before.maxBars.toFixed(3)} bars @t=${
					report.before.position.toFixed(4)
				}  owed=${report.owed}  inserted=${report.inserted}  ${report.refusal}${
					report.after === null ? "" : `  after=${report.after.maxBars.toFixed(3)}`
				}\n`,
		)
	}

	const ramps = rows.filter((row) => row.gradient !== null)
	const reports = ramps.map((row) =>
		row.gradient as {
			owed: boolean
			inserted: boolean
			refusal: string
			before: { maxBars: number }
			after: null | { maxBars: number }
		}
	)
	const owed = reports.filter((report) => report.owed)
	const inserted = reports.filter((report) => report.inserted)
	const byRefusal = new Map<string, number>()
	for (const report of owed) {
		if (report.inserted) continue
		byRefusal.set(report.refusal, (byRefusal.get(report.refusal) ?? 0) + 1)
	}
	process.stderr.write(
		`\ncovers ${rows.length} · ramps ${ramps.length} · over the excursion bar ${owed.length} · stops kept ${inserted.length}\n`,
	)
	for (const [refusal, count] of [...byRefusal].sort((first, second) => (first[0] < second[0] ? -1 : 1))) {
		process.stderr.write(`  refused ${refusal}: ${count}\n`)
	}
	process.stderr.write("C7 companion figure (legacy midpoints outside their endpoints' lightness span): 42%\n")

	if (out !== null) {
		const outPath = resolve(out)
		await mkdir(dirname(outPath), { recursive: true })
		await writeFile(outPath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8")
		process.stderr.write(`wrote ${rows.length} rows to ${outPath}\n`)
	}
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
	await main(process.argv.slice(2))
}
