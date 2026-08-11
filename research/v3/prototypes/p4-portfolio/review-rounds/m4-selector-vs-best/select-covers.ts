/**
 * M4 round — **which eight covers**, decided before any palette is written into a fixture.
 *
 * Staging artefact. Reads the post-fix bit table and the M3 member run files, writes
 * `selection.json`. It is a pure function of those inputs: no clock, no randomness, no HEAD.
 *
 * ## Eligibility (all four, no exceptions)
 *
 *  1. **The selector's elected member is not `p3-fields`.** F3 is about covers where the selector
 *     disagrees with the fixed best single member; where it elects P3 there is nothing to test and
 *     the two sides would be the same palette.
 *  2. **Material disagreement against P3's palette**, at the contract's own regional bar — the
 *     `compareRole()` ruler `tools/disagreement.ts` used at M1, re-run here on the two palettes that
 *     will actually be served rather than trusted from the table.
 *  3. **Both members published** on the cover (no imputation, ever).
 *  4. **coverage-set-1, and not a demo-20 cover**, so the reviewer meets these artworks fresh; and
 *     the artwork's filename stem is the campaign's 40-hex id, which is what the itemId must be.
 *  5. **Not already staged in another prototype's review round.** "Fresh where possible" is a rule
 *     here, not a hope: every `items.json` under the sibling worktrees' `review-rounds` is scanned
 *     and every itemId it carries is excluded. It cost one cover (a `p5-fieldfit` round-3 item that
 *     would otherwise have been an item here, with `p5-fieldfit` as its elected side — the reviewer's
 *     recall of that round would have been a partial unblinding channel).
 *
 * ## Composition (the round brief's, applied mechanically)
 *
 * 4 covers the selector elects `p5-fieldfit` on + 3 it elects `p2-tree` on + **1 where the
 * bootstrap-semantics fix flipped the election** (M3 §3.1) if such a cover is eligible — it is, so
 * the split is 4/3/1 rather than the 4/4 fallback.
 *
 * Margins must span: the bands are decades of the margin in bits, and each group takes one cover per
 * band from the widest span available, so the payload holds both a **narrow-margin** cover (the flip
 * cover itself, at under a thousand bits) and a **huge-margin** one (tens of millions).
 *
 * ## The figure/ground preference (NOTES-cross-arm note 2)
 *
 * The reviewer's stated ideal on a two-gradient artwork is two greys for background/surface and two
 * blues for foreground/accent: **family separation runs figure-vs-ground, never within a pair.** A
 * member's output shows that shape when it publishes a gradient field AND its figure pair is farther
 * from its ground pair than either pair is from itself:
 *
 *     max(d(background, surface), d(foreground, accent)) < min over cross pairs d(ground, figure)
 *
 * in OKLab, with the contract's own `colorDistance`. Covers where either served side shows it are
 * **preferred** inside their band — a preference, not a filter, and no such term enters the currency
 * (that would need pre-registration and would trip F2).
 *
 * Usage, from `research/v3`:
 *   node --experimental-strip-types \
 *     prototypes/p4-portfolio/review-rounds/m4-selector-vs-best/select-covers.ts
 */

import { globSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, resolve } from "node:path"

import { compareRole, DEFAULT_MATCH_OPTIONS } from "../../../../src/adjudication/match.ts"
import { colorDistance } from "../../../../src/contract/color.ts"
import { ROLE_NAMES } from "../../../../src/contract/index.ts"
import type { Palette, PaletteColor, RoleName } from "../../../../src/contract/types.ts"

const HERE = dirname(new URL(import.meta.url).pathname)
const PROTOTYPE = resolve(HERE, "../..")
const REPO = "/Users/Flo/GitHub/palette"

const BEST_MEMBER = "p3-fields"
const DEMO_20 = "research/v3/data/devloop/sets/demo-20.txt"
const STEM_PATTERN = /^[0-9a-f]{40}$/u

const MEMBER_RUNS: readonly { slug: string; runPaths: readonly string[] }[] = [
	{
		slug: "p2-tree",
		runPaths: ["data/m3/runs/p2-tree-coverage1.jsonl", "data/m3/runs/p2-tree-coverage1-resume-1.jsonl"],
	},
	{ slug: "p3-fields", runPaths: ["data/m3/runs/p3-fields-coverage1.jsonl"] },
	{ slug: "p5-fieldfit", runPaths: ["data/m3/runs/p5-fieldfit-coverage1.jsonl"] },
]

type TableRow = {
	contentHash: string
	imagePath: string
	winner: string | null
	runnerUp: string | null
	elected: string | null
	electionContradictsCheapestTotal: boolean
	marginBits: number | null
	membersPriced: string[]
	bootstrap: { winFraction: number; resamples: number; intervalLow: number; intervalHigh: number } | null
}

type Candidate = {
	contentHash: string
	itemId: string
	imagePath: string
	elected: string
	cheapestTotal: string | null
	flipped: boolean
	marginBits: number
	marginBand: string
	differingRoles: RoleName[]
	figureGroundClass: { elected: boolean; best: boolean }
	winFraction: number | null
	resamples: number | null
}

function readRunPalettes(runPaths: readonly string[]): Map<string, Palette> {
	const palettes = new Map<string, Palette>()
	for (const runPath of runPaths) {
		for (const line of readFileSync(resolve(PROTOTYPE, runPath), "utf8").split("\n")) {
			if (line.trim() === "") continue
			const row = JSON.parse(line) as {
				kind: string
				inputContentHash: string
				ok: boolean
				palette: Palette | null
			}
			if (row.kind !== "devloop-run-row" || !row.ok || row.palette === null) continue
			if (!palettes.has(row.inputContentHash)) palettes.set(row.inputContentHash, row.palette)
		}
	}
	return palettes
}

/** The band a margin falls in — decades of bits, so "spanning margin magnitudes" is a rule. */
function marginBand(bits: number): string {
	if (bits < 1e4) return "narrow (<10⁴)"
	if (bits < 1e5) return "mid (10⁴–10⁵)"
	if (bits < 1e6) return "large (10⁵–10⁶)"
	return "huge (≥10⁶)"
}

const BANDS = ["narrow (<10⁴)", "mid (10⁴–10⁵)", "large (10⁵–10⁶)", "huge (≥10⁶)"] as const

/** NOTES note 2's shape, read off one palette: a gradient field, and figure separated from ground. */
function figureGround(palette: Palette): boolean {
	if (palette.gradient === null) return false
	const ground: PaletteColor[] = [palette.roles.background, palette.roles.surface]
	const figure: PaletteColor[] = [palette.roles.foreground, palette.roles.accent]
	const within = Math.max(colorDistance(ground[0]!, ground[1]!), colorDistance(figure[0]!, figure[1]!))
	let across = Infinity
	for (const one of ground) for (const other of figure) across = Math.min(across, colorDistance(one, other))
	return within < across
}

// ---------------------------------------------------------------------------------------------

const demoStems = new Set(
	readFileSync(resolve(REPO, DEMO_20), "utf8")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "" && !line.startsWith("#"))
		.map((line) => basename(line).replace(/\.[a-z0-9]+$/iu, "")),
)

/** Every itemId any other prototype has already staged for the reviewer, with where it came from. */
const stagedElsewhere = new Map<string, string[]>()
const roundFixtures = globSync(`${REPO}/.worktrees/*/research/v3/prototypes/*/review-rounds/*/items.json`)
	.filter((path) => !path.includes("/p4-portfolio/"))
	.sort()
for (const path of roundFixtures) {
	let fixture: unknown
	try {
		fixture = JSON.parse(readFileSync(path, "utf8"))
	} catch {
		continue
	}
	const entries = Array.isArray(fixture) ? fixture : []
	for (const entry of entries as { itemId?: string }[]) {
		if (typeof entry.itemId !== "string") continue
		const where = path.replace(`${REPO}/`, "")
		stagedElsewhere.set(entry.itemId, [...(stagedElsewhere.get(entry.itemId) ?? []), where])
	}
}

const table = JSON.parse(readFileSync(resolve(PROTOTYPE, "data/m3/bit-table-coverage.json"), "utf8")) as {
	rows: TableRow[]
}
const palettesBySlug = new Map(MEMBER_RUNS.map((member) => [member.slug, readRunPalettes(member.runPaths)]))

const candidates: Candidate[] = []
const rejected: Record<string, number> = {}
const reject = (why: string): void => {
	rejected[why] = (rejected[why] ?? 0) + 1
}

for (const row of table.rows) {
	const elected = row.elected
	if (elected === null || row.marginBits === null) {
		reject("unpriced")
		continue
	}
	if (elected === BEST_MEMBER) {
		reject("selector elects P3 — nothing to compare")
		continue
	}
	if (!row.membersPriced.includes(BEST_MEMBER) || !row.membersPriced.includes(elected)) {
		reject("a side did not publish")
		continue
	}
	const itemId = basename(row.imagePath).replace(/\.[a-z0-9]+$/iu, "")
	if (!STEM_PATTERN.test(itemId)) {
		reject("stem is not the campaign's 40-hex id")
		continue
	}
	if (demoStems.has(itemId)) {
		reject("demo-20 cover")
		continue
	}
	if (stagedElsewhere.has(itemId)) {
		reject("already staged in another prototype's round — not fresh")
		continue
	}
	const electedPalette = palettesBySlug.get(elected)!.get(row.contentHash)
	const bestPalette = palettesBySlug.get(BEST_MEMBER)!.get(row.contentHash)
	if (electedPalette === undefined || bestPalette === undefined) {
		reject("run file has no palette for a side")
		continue
	}
	// The materiality check, re-run on the two palettes that will actually be served.
	const differingRoles = ROLE_NAMES.filter(
		(role) =>
			!compareRole(role, electedPalette.roles[role], bestPalette.roles[role], DEFAULT_MATCH_OPTIONS).same,
	)
	if (differingRoles.length === 0) {
		reject("immaterial against P3 at the regional bar")
		continue
	}
	candidates.push({
		contentHash: row.contentHash,
		itemId,
		imagePath: row.imagePath,
		elected,
		cheapestTotal: row.winner,
		flipped: row.electionContradictsCheapestTotal,
		marginBits: row.marginBits,
		marginBand: marginBand(row.marginBits),
		differingRoles,
		figureGroundClass: { elected: figureGround(electedPalette), best: figureGround(bestPalette) },
		winFraction: row.bootstrap?.winFraction ?? null,
		resamples: row.bootstrap?.resamples ?? null,
	})
}

/** Deterministic order inside a band: the figure/ground class first, then the content hash. */
function preferred(pool: Candidate[]): Candidate[] {
	return [...pool].sort((left, right) => {
		const leftClass = left.figureGroundClass.elected || left.figureGroundClass.best ? 0 : 1
		const rightClass = right.figureGroundClass.elected || right.figureGroundClass.best ? 0 : 1
		if (leftClass !== rightClass) return leftClass - rightClass
		return left.contentHash < right.contentHash ? -1 : 1
	})
}

/** One cover per band, widest span first, then whatever is left in preference order. */
function takeSpanning(pool: Candidate[], count: number, taken: Set<string>): Candidate[] {
	const chosen: Candidate[] = []
	for (const band of [...BANDS].reverse()) {
		if (chosen.length >= count) break
		const inBand = preferred(pool.filter((one) => one.marginBand === band && !taken.has(one.contentHash)))
		const pick = inBand[0]
		if (pick === undefined) continue
		chosen.push(pick)
		taken.add(pick.contentHash)
	}
	for (const pick of preferred(pool.filter((one) => !taken.has(one.contentHash)))) {
		if (chosen.length >= count) break
		chosen.push(pick)
		taken.add(pick.contentHash)
	}
	return chosen
}

const taken = new Set<string>()
const flipCovers = preferred(candidates.filter((one) => one.flipped))
const flip = flipCovers[0]
if (flip !== undefined) taken.add(flip.contentHash)

const p5 = takeSpanning(
	candidates.filter((one) => one.elected === "p5-fieldfit"),
	4,
	taken,
)
const p2 = takeSpanning(
	candidates.filter((one) => one.elected === "p2-tree"),
	flip === undefined ? 4 : 3,
	taken,
)

const items = [...p5, ...p2, ...(flip === undefined ? [] : [flip])]
items.sort((left, right) => (left.contentHash < right.contentHash ? -1 : 1))

const selection = {
	kind: "p4-portfolio-m4-selection",
	round: "selector's elected palette vs the fixed best single member, on disagreement covers",
	bestMember: BEST_MEMBER,
	source: {
		table: "data/m3/bit-table-coverage.json",
		memberRuns: MEMBER_RUNS,
		freshnessExclusions: {
			demoSet: DEMO_20,
			otherPrototypeRounds: roundFixtures.map((path) => path.replace(`${REPO}/`, "")),
			itemIdsExcludedForFreshness: [...stagedElsewhere.entries()]
				.filter(([itemId]) => table.rows.some((row) => basename(row.imagePath).replace(/\.[a-z0-9]+$/iu, "") === itemId))
				.map(([itemId, where]) => ({ itemId, stagedIn: where })),
		},
	},
	eligibility: {
		candidates: candidates.length,
		rejected,
		bar: "src/adjudication/match.ts compareRole() with DEFAULT_MATCH_OPTIONS (regional) — M1's ruler",
	},
	composition: {
		requested: "4 elected p5-fieldfit + 3 elected p2-tree + 1 election flipped by the M3 §3.1 fix",
		flipCoverAvailable: flip !== undefined,
		fallbackUsed: flip === undefined ? "4/4 split" : null,
		bands: Object.fromEntries(BANDS.map((band) => [band, items.filter((one) => one.marginBand === band).length])),
		figureGroundItems: items.filter((one) => one.figureGroundClass.elected || one.figureGroundClass.best).length,
	},
	items,
}

writeFileSync(resolve(HERE, "selection.json"), `${JSON.stringify(selection, null, "\t")}\n`)
process.stdout.write(
	`${items.length} items — ${items.map((one) => `${one.itemId.slice(0, 10)}:${one.elected}@${Math.round(one.marginBits)}`).join(" ")}\n`,
)
