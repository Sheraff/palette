/**
 * Read the census and answer the question the founding case raised: is an essentially-zero
 * foreground/surface contrast a freak or a class?
 *
 * The distribution is reported at the bars the brief asked for (|Lc| below 2, 5, 9, 15). The most
 * important thing it shows is that the first three of those bars cannot disagree: APCA's output has
 * a hard hole in (0, 7.3) — see `apca-gap.mjs` — so "below 2", "below 5" and "below 7" all name the
 * same set, the artworks reporting exactly zero.
 *
 * Usage: analyse.ts [--census <dir>] [--worst 20]
 */
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseArgs } from "node:util"

/** The guard-off census, used when a caller does not name one. */
export const defaultCensusRoot: string = resolve(import.meta.dirname, "data/census")

export type CensusRow = {
	path: string
	width: number
	height: number
	background: string
	surface: string
	foreground: string
	accent: string
	gradient: boolean
	collapse: { surface: boolean; accent: boolean }
	midpoint: string | null
	fgSurface: { lc: number; de: number }
	fgBackground: { lc: number; de: number }
	accentSurface: { lc: number; de: number }
	accentBackground: { lc: number; de: number }
	error?: string
}

export function loadCensus(root: string = defaultCensusRoot): CensusRow[] {
	const rows: CensusRow[] = []
	for (const file of readdirSync(root).sort()) {
		if (!file.endsWith(".jsonl")) continue
		for (const line of readFileSync(resolve(root, file), "utf8").split("\n")) {
			if (!line.trim()) continue
			try { rows.push(JSON.parse(line)) } catch { /* torn trailing line */ }
		}
	}
	rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
	return rows
}

/** Artwork identity, so the same cover stored at two resolutions is not counted twice. */
export function artworkIdentity(path: string): string {
	const name = path.split("/").pop()!
	const match = /^ab67616d[0-9a-f]{8}([0-9a-f]{24})/u.exec(name)
	return match ? match[1] : name
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const { values } = parseArgs({
		options: { census: { type: "string" }, worst: { type: "string", default: "20" } },
		strict: true,
	})
	const worstCount = Number(values.worst)
	const all = loadCensus(values.census ? resolve(values.census) : defaultCensusRoot)
	const failed = all.filter((row) => row.error)
	const rows = all.filter((row) => !row.error)

	const byIdentity = new Map<string, CensusRow>()
	for (const row of rows) if (!byIdentity.has(artworkIdentity(row.path))) byIdentity.set(artworkIdentity(row.path), row)
	const unique = [...byIdentity.values()]

	process.stdout.write(`census rows: ${all.length} (${failed.length} failed to extract)\n`)
	process.stdout.write(`distinct artworks after collapsing resolution variants: ${unique.length}\n\n`)

	const report = (label: string, pick: (row: CensusRow) => number, set: CensusRow[]) => {
		process.stdout.write(`${label} over ${set.length} artworks\n`)
		let previous = 0
		for (const bar of [2, 5, 9, 15]) {
			const count = set.filter((row) => Math.abs(pick(row)) < bar).length
			process.stdout.write(`  |Lc| < ${String(bar).padStart(2)}: ${String(count).padStart(5)}` +
				`  (${(100 * count / set.length).toFixed(2)}%)` +
				(bar > 2 ? `   +${count - previous} over the previous bar` : "") + "\n")
			previous = count
		}
		const exactZero = set.filter((row) => pick(row) === 0).length
		process.stdout.write(`  exactly 0 : ${String(exactZero).padStart(5)}  (${(100 * exactZero / set.length).toFixed(2)}%)\n\n`)
	}

	// All four pairs, at the same bars, so the coverage decision has one table behind it. A collapsed
	// role is the role it collapsed onto, so its pairs are not distinct claims and are excluded —
	// the same rule the repair applies, or the two would be counting different populations.
	report("foreground on SURFACE", (row) => row.fgSurface.lc, unique.filter((row) => !row.collapse.surface))
	report("foreground on BACKGROUND", (row) => row.fgBackground.lc, unique)
	report("accent on SURFACE", (row) => row.accentSurface.lc,
		unique.filter((row) => !row.collapse.surface && !row.collapse.accent))
	report("accent on BACKGROUND", (row) => row.accentBackground.lc, unique.filter((row) => !row.collapse.accent))

	// A collapsed surface is the background, so a zero there is a different (and larger) claim.
	const distinctSurface = unique.filter((row) => !row.collapse.surface)
	process.stdout.write(`--- restricted to the ${distinctSurface.length} artworks whose surface is a DISTINCT colour from the background ---\n\n`)
	report("foreground on SURFACE (distinct surface only)", (row) => row.fgSurface.lc, distinctSurface)

	const zeros = unique.filter((row) => row.fgSurface.lc === 0)
	process.stdout.write(`--- every artwork with an exactly-zero foreground/surface contrast (${zeros.length}) ---\n`)
	process.stdout.write("  the CIE76 dE column is what the existing distinctness rule (bar 3.3) sees\n\n")
	const sorted = [...zeros].sort((a, b) => b.fgSurface.de - a.fgSurface.de)
	for (const row of sorted.slice(0, worstCount)) {
		const name = row.path.split("/").slice(-2).join("/")
		process.stdout.write(`  ${name}\n`)
		process.stdout.write(`    bg=${row.background} surface=${row.surface} fg=${row.foreground} accent=${row.accent}` +
			` ${row.gradient ? "gradient" : "flat"}${row.collapse.surface ? " surface-collapsed" : ""}${row.collapse.accent ? " accent-collapsed" : ""}\n`)
		process.stdout.write(`    fg/surface Lc=${row.fgSurface.lc.toFixed(2)} dE=${row.fgSurface.de.toFixed(1)}` +
			`   fg/background Lc=${row.fgBackground.lc.toFixed(2)}` +
			`   accent/surface Lc=${row.accentSurface.lc.toFixed(2)}\n`)
	}
	if (sorted.length > worstCount) process.stdout.write(`  ... and ${sorted.length - worstCount} more\n`)

	process.stdout.write(`\n--- how many of the zero-contrast cases the existing dE 3.3 rule could already see ---\n`)
	const belowDe = zeros.filter((row) => row.fgSurface.de < 3.3).length
	process.stdout.write(`  ${belowDe} of ${zeros.length} have CIE76 dE < 3.3; the other ${zeros.length - belowDe} are perceptually far apart and invisible to it\n`)
}
