/**
 * Round 7 (calibration) — the selection instrument. Read-only; writes nothing.
 *
 * Everything `ROUND.md` quotes as a number comes from here, over the four files this round produced,
 * all four freshly executed for this round rather than borrowed from a development loop:
 *
 *   - `run-coverage-220-0.4.4.jsonl`      — `p3-fields-0.4.4` at `affe3965` over `coverage-set-1-220`.
 *   - `run-coverage-220-0.4.4-diag.jsonl` — the same, `--no-cache`, `P3_DIAG` on → `diag-coverage-0.4.4/`.
 *   - `run-demo-20-0.4.4.jsonl` / `-diag` — the same candidate and commit over `demo-20`.
 *
 * The demo-20 pair exists for exactly the reason round 6 built one: **cover 19
 * (`…0000269ead63cf2376a6b67d`) is a `demo-20` cover and is not a member of `coverage-set-1-220`** —
 * checked below against the coverage run's own rows, not assumed. It is a re-grade, so the fresh-cover
 * rule (which draws beyond demo-20) has nothing to say about it; but its palette has to come from a run
 * that contains it. That is round-6's `sourceRun` precedent, re-applied unchanged.
 *
 * What it prints:
 *
 *   1. the two headers' `candidateId` / `codeVersion` / `setHash`, so each run's identity is read off
 *      the file rather than assumed;
 *   2. the four RE-GRADE covers — round-6's unacceptable/weak covers whose palettes 0.4.3/0.4.4 changed
 *      — each with its round-6 palette beside its 0.4.4 palette, so "changed" is shown and not claimed;
 *   3. the **neutral-branch firings** (`accentOrdering.neutralBranch`), all three, with the published
 *      foreground↔accent OKLab distance against both the governing same-colour bar and the
 *      foreground/accent separation distance — the twin-risk shortlist, ranked by margin over the bar
 *      (`EVIDENCE_2026-08-04.md` item 11: bars qualify, margins rank);
 *   4. the conflict cohort at 0.4.4 — held chromatic mark with the published foreground below min-ramp
 *      5.0 — so row-6's residual is placed inside a cohort rather than asserted alone;
 *   5. the fresh pool — contract-passing, accent-published covers unseen in rounds 1–6 — under the
 *      criterion this round applies to it, stated in the comment at that block.
 *
 *   node --experimental-strip-types research/v3/prototypes/p3-fields/review-rounds/round-7-calibration/select.ts
 */

import { readFileSync, readdirSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { validatePalette } from "../../../../src/contract/invariants.ts"
import { colorDistance, colorFromHex, sameColorBar } from "../../../../src/contract/color.ts"
import { FOREGROUND_ACCENT_SEPARATION_DISTANCE } from "../../../../src/contract/constants.ts"
import type { Palette } from "../../../../src/contract/types.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const WORKTREE = "/Users/Flo/GitHub/palette/.worktrees/p3-fields"

/** Every cover shown in rounds 1–6, by repo-relative image path. The fresh class excludes all of them. */
const PRIOR_ROUNDS = [
	"round-1-calibration",
	"round-2-calibration",
	"round-3-gradient-pairwise",
	"round-4-polarity",
	"round-5-calibration",
	"round-6-calibration",
]

type RunRow = Readonly<{ kind: string; index: number; imagePath: string; ok: boolean; palette: Palette }>
type Diag = Readonly<{
	imagePath: string
	edges: { edgeFraction: number }
	accentOrdering?: { neutralBranch: boolean; neutralQualified: number }
	accent: { collapsed: boolean; hex: string | null }
	roleSwap: null | {
		applied: boolean
		comparatorRan: boolean
		chromaticMarkHeld: boolean
		accentChroma: number
		chromaBoundary: number
		textFloor: number
		foregroundMinRamp: number
		accentMinRamp: number
		publishedForegroundHex: string
		publishedAccentHex: string
	}
}>

function readRun(file: string): RunRow[] {
	const lines = readFileSync(join(HERE, file), "utf8").trim().split("\n")
	const header = JSON.parse(lines[0]) as Record<string, unknown>
	console.log(
		`header  ${file}  candidateId=${header.candidateId}  codeVersion=${String(header.codeVersion).slice(0, 16)}…  ` +
			`set=${header.setName}  setHash=${String(header.setHash).slice(0, 16)}…  n=${header.imageCount}`,
	)
	const out: RunRow[] = []
	for (const line of lines) {
		const row = JSON.parse(line) as RunRow
		if (row.kind === "devloop-run-row") out.push(row)
	}
	return out
}

const rows = readRun("run-coverage-220-0.4.4.jsonl")
const demoRows = readRun("run-demo-20-0.4.4.jsonl")

const diags = new Map<string, Diag>()
for (const dir of ["diag-coverage-0.4.4", "diag-demo-20-0.4.4"]) {
	for (const file of readdirSync(join(HERE, dir))) {
		if (!file.endsWith(".json")) continue
		const diag = JSON.parse(readFileSync(join(HERE, dir, file), "utf8")) as Diag
		if (!diags.has(rel(diag.imagePath))) diags.set(rel(diag.imagePath), diag)
	}
}

function rel(absolute: string): string {
	return absolute.startsWith(`${WORKTREE}/`) ? absolute.slice(WORKTREE.length + 1) : absolute
}
function stem(path: string): string {
	return basename(path).replace(/\.[a-z0-9]+$/iu, "")
}

const shown = new Set<string>()
/** stem → the round-6 palette, for the four re-grades' before/after. */
const round6 = new Map<string, Record<string, unknown>>()
for (const round of PRIOR_ROUNDS) {
	for (const line of readFileSync(join(HERE, "..", round, "items.jsonl"), "utf8").trim().split("\n")) {
		const item = JSON.parse(line) as Record<string, string>
		shown.add(stem(item.imagePath))
		if (round === "round-6-calibration") round6.set(stem(item.imagePath), item)
	}
}
console.log(`prior rounds 1–6: ${shown.size} distinct covers shown (round 6 contributed ${round6.size})`)

type Record_ = { row: RunRow; diag: Diag | undefined; path: string; stem: string; valid: boolean }
function toRecord(row: RunRow): Record_ {
	const path = rel(row.imagePath)
	return { row, diag: diags.get(path), path, stem: stem(path), valid: row.ok && validatePalette(row.palette).valid }
}
/** The coverage run alone. Every rate and cohort below is over these 220 and nothing else. */
const all: Record_[] = rows.map(toRecord)
/** The demo-20 run, used for exactly one cover the coverage set does not contain. */
const demo: Record_[] = demoRows.map(toRecord)
console.log(`contract: ${all.filter((r) => r.valid).length} pass / ${all.filter((r) => !r.valid).length} fail of ${all.length}`)
console.log(`accent collapsed: ${all.filter((r) => r.row.palette.collapse.accentCollapsed).length}`)
console.log(`gradient published: ${all.filter((r) => r.row.palette.gradient !== null).length}`)
console.log(`diag chains matched: ${all.filter((r) => r.diag !== undefined).length}/${all.length}`)

function describe(r: Record_): string {
	const p = r.row.palette.roles
	const s = r.diag?.roleSwap
	return (
		`${r.stem}  idx=${r.row.index}  bg=${p.background.hex} sf=${p.surface.hex} fg=${p.foreground.hex} ac=${p.accent.hex}  ` +
		`grad=${r.row.palette.gradient === null ? "none" : `${r.row.palette.gradient.stops.length}-stop`}  ` +
		`sfCol=${r.row.palette.collapse.surfaceCollapsed} acCol=${r.row.palette.collapse.accentCollapsed}  ` +
		`contract=${r.valid ? "pass" : "FAIL"}  ` +
		(s === null || s === undefined
			? "swap=(no comparator record)"
			: `swapApplied=${s.applied} held=${s.chromaticMarkHeld} accentChroma=${s.accentChroma.toFixed(4)} fgMinRamp=${s.foregroundMinRamp.toFixed(2)} acMinRamp=${s.accentMinRamp.toFixed(2)}`) +
		`  neutralBranch=${r.diag?.accentOrdering?.neutralBranch ?? "?"}` +
		`  edgeFrac=${r.diag?.edges.edgeFraction.toFixed(4) ?? "?"}`
	)
}

const byStemSuffix = (suffix: string): Record_ => {
	const hit = all.filter((r) => r.stem.endsWith(suffix))
	if (hit.length === 1) return hit[0]
	if (hit.length > 1) throw new Error(`${suffix}: ${hit.length} matches in coverage-220`)
	const fallback = demo.filter((r) => r.stem.endsWith(suffix))
	if (fallback.length !== 1) throw new Error(`${suffix}: ${hit.length} in coverage-220, ${fallback.length} in demo-20`)
	console.log(`  [not in coverage-set-1-220 — taken from the demo-20 run]`)
	return fallback[0]
}

/**
 * The foreground↔accent gap as the contract measures it: OKLab distance against the *larger* of the
 * regional same-colour bar and the foreground/accent separation distance, which is exactly the bar
 * `validatePalette`'s I3 applies to that one pair.
 */
function fgAccentGap(r: Record_): { distance: number; bar: number; margin: number; ratio: number } {
	const fg = colorFromHex(r.row.palette.roles.foreground.hex)
	const ac = colorFromHex(r.row.palette.roles.accent.hex)
	const distance = colorDistance(fg, ac)
	const bar = Math.max(sameColorBar(fg, ac), FOREGROUND_ACCENT_SEPARATION_DISTANCE)
	return { distance, bar, margin: distance - bar, ratio: distance / bar }
}

console.log("\n== the four RE-GRADES: round-6 palette → 0.4.4 palette ==")
for (const [label, suffix] of [
	["168 — the paired-family shape (r6 weak, 'the foreground should be blue')", "1a326091e7dd7df58b175"],
	["r6 row 0 — black fg prescribed (r6 unacceptable)", "0010ac96d501c4170f39c4f0"],
	["r6 row 2 — mildest conflict, min-ramp 4.93 (r6 unacceptable)", "4e6dee3a672e62f84d6fab9d90a2af26"],
	["cover 19 — the four named colours (r6 unacceptable, regression)", "0000269ead63cf2376a6b67d"],
] as const) {
	const r = byStemSuffix(suffix)
	const before = round6.get(r.stem)
	console.log(`${label}`)
	console.log(
		`  r6:    bg=${before?.background} sf=${before?.surface} fg=${before?.foreground} ac=${before?.accent}  ` +
			`grad=${before?.gradient === null ? "none" : "yes"}`,
	)
	console.log(`  0.4.4: ${describe(r)}`)
	const gap = fgAccentGap(r)
	console.log(
		`  fg↔ac: distance=${gap.distance.toFixed(5)} bar=${gap.bar} margin=${gap.margin.toFixed(5)} ratio=${gap.ratio.toFixed(2)}×`,
	)
	console.log(
		`  gradient=${JSON.stringify(r.row.palette.gradient?.stops.map((s) => [s.color.hex, s.position]) ?? null)}  path=${r.path}`,
	)
}

console.log("\n== the NEUTRAL-BRANCH firings (0.4.4's new branch) — the twin-risk shortlist ==")
const firings = all.filter((r) => r.diag?.accentOrdering?.neutralBranch === true)
console.log(`neutralBranch fired on ${firings.length}/${all.length} coverage covers`)
/**
 * Ranked by **margin over the governing bar** rather than by whether it clears it. Every one of these
 * clears — `validatePalette` passes on all three — so a pass/fail read says nothing. `EVIDENCE item 11`
 * is the rule being applied: *bars qualify, margins rank; never publish at the bar's edge when the
 * ordering offers headroom.* The twin-risk item is the smallest margin, i.e. the firing whose published
 * foreground and accent a reviewer is most likely to call one colour.
 */
for (const r of [...firings].sort((a, b) => fgAccentGap(a).margin - fgAccentGap(b).margin)) {
	const gap = fgAccentGap(r)
	const p = r.row.palette.roles
	console.log(
		`  margin=${gap.margin.toFixed(5)}  ratio=${gap.ratio.toFixed(2)}×  distance=${gap.distance.toFixed(5)} vs bar=${gap.bar}  ` +
			`fg=${p.foreground.hex} ac=${p.accent.hex}  bg=${p.background.hex} sf=${p.surface.hex}  ` +
			`contract=${r.valid ? "pass" : "FAIL"}  seen=${shown.has(r.stem) ? "YES" : "no"}  ${r.stem}`,
	)
	console.log(`    ${describe(r)}  path=${r.path}`)
}

console.log("\n== the conflict cohort at 0.4.4: chromatic mark HELD, published foreground below min-ramp 5.0 ==")
const conflict = all
	.filter((r) => r.diag?.roleSwap != null && r.diag.roleSwap.chromaticMarkHeld && r.diag.roleSwap.foregroundMinRamp < 5)
	.sort((a, b) => a.diag!.roleSwap!.foregroundMinRamp - b.diag!.roleSwap!.foregroundMinRamp)
const held = all.filter((r) => r.diag?.roleSwap != null && r.diag.roleSwap.chromaticMarkHeld)
console.log(`chromaticMarkHeld total = ${held.length}; of those below min-ramp 5.0 = ${conflict.length}`)
for (const r of conflict.slice(0, 12)) {
	console.log(
		`  ${r.diag!.roleSwap!.foregroundMinRamp.toFixed(2)}  ${r.stem}  fg=${r.row.palette.roles.foreground.hex} ac=${r.row.palette.roles.accent.hex}  seen=${shown.has(r.stem) ? "YES" : "no"}`,
	)
}
console.log("\n-- row-6's residual, in full (round-6 prescribed a WHITE foreground) --")
{
	const r = byStemSuffix("0011e7b5c1023c70f7a3d767")
	const before = round6.get(r.stem)
	console.log(`  r6:    bg=${before?.background} sf=${before?.surface} fg=${before?.foreground} ac=${before?.accent}`)
	console.log(`  0.4.4: ${describe(r)}  path=${r.path}`)
}

console.log("\n== swap fire rate ==")
const comparator = all.filter((r) => r.diag?.roleSwap != null)
console.log(`comparator ran on ${comparator.length}; applied on ${comparator.filter((r) => r.diag!.roleSwap!.applied).length}`)

console.log("\n== fresh pool: unseen in rounds 1–6, contract-passing, accent published ==")
const fresh = all.filter((r) => !shown.has(r.stem) && r.valid && !r.row.palette.collapse.accentCollapsed)
console.log(`${fresh.length} candidates`)
/**
 * The fresh criterion, stated: **the highest edge fraction among fresh contract-passing covers** —
 * round-5's rule, re-applied unchanged for the third round running.
 *
 * Keeping the rule fixed is the whole point. Edge fraction is a property of the *artwork*, not of
 * anything 0.4.3 or 0.4.4 changed, so a fresh cover chosen this way is not a cover chosen for the
 * release having worked, and round-5's, round-6's and round-7's fresh grades are comparable to each
 * other rather than merely all being "fresh". A fresh cover picked on, say, "the neutral branch fired
 * and it looks good" would tell the overfitting watch nothing at all.
 */
const byEdge = [...fresh].sort((a, b) => (b.diag?.edges.edgeFraction ?? 0) - (a.diag?.edges.edgeFraction ?? 0))
console.log("top 10 by edge fraction (the round-5 fresh rule, third application):")
for (const r of byEdge.slice(0, 10)) console.log(`  ${describe(r)}  path=${r.path}`)

console.log("\n== selected item paths ==")
for (const suffix of [
	"1a326091e7dd7df58b175",
	"0010ac96d501c4170f39c4f0",
	"4e6dee3a672e62f84d6fab9d90a2af26",
	"0000269ead63cf2376a6b67d",
	"0011e7b5c1023c70f7a3d767",
]) {
	const r = byStemSuffix(suffix)
	console.log(`  ${r.stem}  idx=${r.row.index}  ${r.path}`)
}
