/**
 * The same defect in the pairs Flo's rule does *not* name.
 *
 * The rule under evaluation is about foreground-on-surface. But the surface panel also carries the
 * accent as text (`review-app/app.js` puts an `.accent-copy` element inside `.surface-card`), and
 * the foreground is drawn on the background too. So the identical question can be asked of three
 * more pairs, and the answers differ by an order of magnitude. This decides how far the rule
 * should reach, which is a judgement for the reviewer, not for the arm — so the numbers are
 * reported and nothing is recommended.
 *
 * Usage: sibling-pathologies.ts [--census <dir>]
 */
import { resolve } from "node:path"
import { parseArgs } from "node:util"

import { artworkIdentity, loadCensus, type CensusRow } from "./analyse.ts"

const { values } = parseArgs({ options: { census: { type: "string" } }, strict: true })
const rows = loadCensus(values.census ? resolve(values.census) : undefined).filter((row) => !row.error)
const byIdentity = new Map<string, CensusRow>()
for (const row of rows) if (!byIdentity.has(artworkIdentity(row.path))) byIdentity.set(artworkIdentity(row.path), row)
const unique = [...byIdentity.values()]

const zeroFgSurface = new Set(unique.filter((row) => row.fgSurface.lc === 0).map((row) => row.path))
const zeroFgBackground = new Set(unique.filter((row) => row.fgBackground.lc === 0).map((row) => row.path))
const zeroAccentSurface = new Set(unique.filter((row) => row.accentSurface.lc === 0).map((row) => row.path))
const zeroAccentBackground = new Set(unique.filter((row) => row.accentBackground.lc === 0).map((row) => row.path))

const pct = (n: number) => `${(100 * n / unique.length).toFixed(2)}%`
process.stdout.write(`${unique.length} distinct artworks\n\n`)
process.stdout.write(`exactly-zero APCA contrast, by role pair:\n`)
process.stdout.write(`  foreground on surface      ${String(zeroFgSurface.size).padStart(4)}  (${pct(zeroFgSurface.size)})   <- the pair the rule names\n`)
process.stdout.write(`  foreground on background   ${String(zeroFgBackground.size).padStart(4)}  (${pct(zeroFgBackground.size)})\n`)
process.stdout.write(`  accent on surface          ${String(zeroAccentSurface.size).padStart(4)}  (${pct(zeroAccentSurface.size)})\n`)
process.stdout.write(`  accent on background       ${String(zeroAccentBackground.size).padStart(4)}  (${pct(zeroAccentBackground.size)})\n`)

const bothForeground = [...zeroFgSurface].filter((path) => zeroFgBackground.has(path))
const eitherForeground = new Set([...zeroFgSurface, ...zeroFgBackground])
process.stdout.write(`\nforeground unreadable on EITHER field endpoint: ${eitherForeground.size} (${pct(eitherForeground.size)})\n`)
process.stdout.write(`  overlap (unreadable on both): ${bothForeground.length}\n`)

const anyRole = new Set([...zeroFgSurface, ...zeroFgBackground, ...zeroAccentSurface, ...zeroAccentBackground])
process.stdout.write(`\nany of the four pairs at exactly zero: ${anyRole.size} (${pct(anyRole.size)})\n`)

process.stdout.write(`\n--- the foreground-on-background cases the named rule would NOT touch (${zeroFgBackground.size - bothForeground.length}) ---\n`)
for (const row of unique.filter((r) => zeroFgBackground.has(r.path) && !zeroFgSurface.has(r.path))
	.sort((a, b) => b.fgBackground.de - a.fgBackground.de)) {
	process.stdout.write(`  ${row.path.split("/").slice(-2).join("/")}\n`)
	process.stdout.write(`    bg=${row.background} surface=${row.surface} fg=${row.foreground} accent=${row.accent} ` +
		`${row.gradient ? "gradient" : "flat"}   fg/bg Lc=0.00 dE=${row.fgBackground.de.toFixed(1)}  fg/surface Lc=${row.fgSurface.lc.toFixed(1)}\n`)
}
