/**
 * M1 — the disagreement matrix. **How often do the members publish different palettes at all?**
 *
 * P4's SPEC §6 makes this the milestone's whole point: "The disagreement rate sizes the selector's
 * whole value: if members rarely disagree materially, P4 is answered cheaply." So this measures one
 * thing and refuses to score anything.
 *
 * ## The ruler is the contract's, imported, not restated
 *
 * A role "disagrees" between two members on a cover when `compareRole()` from
 * `src/adjudication/match.ts` returns `same: false` — Euclidean OKLab `colorDistance` against the
 * calibrated bar, strict `<`. Two bar modes are reported, and both come from that module's own
 * `barFor()`:
 *
 *  - **`regional`** — `sameColorBar(first, second)`, the calibrated per-pair bar. `match.ts` states
 *    the rule this file obeys: "any *per-pair* judgement uses `sameColorBar()`". It is the headline,
 *    and it is what P4's SPEC §2 means by "the contract's own same-colour bar".
 *  - **`pooled`** — `POOLED_SAME_COLOR_BAR`, reported beside it because `constants.ts` reserves that
 *    scalar for exactly this shape of number: "corpus metrics … that need to reduce 'how different
 *    are these palettes?' to one number comparable across runs — agreement rates". Secondary, and
 *    labelled as such, per the same note that says it is not the gate's bar.
 *
 * **Zero new constants.** Every threshold in this file arrives through
 * `import { compareRole } from "../../../src/adjudication/match.ts"`. Nothing here declares a
 * number.
 *
 * ## What is counted
 *
 * Per unordered member pair, over the covers where *both* members published a palette:
 *
 *  - `materialDisagreementRate` — the share of shared covers on which **at least one** of the four
 *    roles is beyond the bar. This is the SPEC's "materially differ", and its complement is the
 *    immateriality rate §2.3b would record.
 *  - `perRole` — the same share, per role, so the reviewer can see whether disagreement is the accent
 *    (P3's STATE calls accent its least stable role) or the field.
 *  - Corpus-wide: `allFourAgreeRate` — the share of covers on which **every** member pair agrees on
 *    **every** role, i.e. one palette up to the bar across the whole portfolio. On those covers the
 *    selector cannot matter, whatever it costs.
 *
 * Covers where a member failed are excluded pairwise and counted (`coversMissing`), never imputed.
 *
 * Usage:
 *   node --experimental-strip-types tools/disagreement.ts \
 *     --run <slug>=<run.jsonl> [--run …] --out data/m1-disagreement.json
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { compareRole, DEFAULT_MATCH_OPTIONS } from "../../../src/adjudication/match.ts"
import { ROLE_NAMES } from "../../../src/contract/index.ts"
import type { BarMode, MatchOptions } from "../../../src/adjudication/types.ts"
import type { Palette, PaletteColor, RoleName } from "../../../src/contract/types.ts"

type Row = {
	kind: string
	index: number
	imagePath: string
	inputContentHash: string
	ok: boolean
	palette: Palette | null
	error: string | null
	computeMs: number
}

const BAR_MODES: readonly BarMode[] = ["regional", "pooled"]

function optionsFor(barMode: BarMode): MatchOptions {
	return { ...DEFAULT_MATCH_OPTIONS, barMode }
}

async function readRun(path: string): Promise<{ header: Record<string, unknown>; rows: Row[] }> {
	const text = await readFile(resolve(path), "utf8")
	let header: Record<string, unknown> = {}
	const rows: Row[] = []
	for (const line of text.split("\n")) {
		if (line.trim() === "") continue
		const parsed = JSON.parse(line) as Record<string, unknown>
		if (parsed.kind === "devloop-run-header") header = parsed
		else if (parsed.kind === "devloop-run-row") rows.push(parsed as unknown as Row)
	}
	return { header, rows }
}

const argv = process.argv.slice(2)
const outAt = argv.indexOf("--out")
const outPath = outAt === -1 ? undefined : argv[outAt + 1]
const specs = argv.flatMap((token, at) => (argv[at - 1] === "--run" ? [token] : []))
if (outPath === undefined || specs.length < 2) {
	process.stdout.write("usage: --run <slug>=<run.jsonl> [--run …] --out <out.json>\n")
	process.exit(2)
}

const members: Array<{ slug: string; runPath: string; header: Record<string, unknown>; rows: Row[] }> = []
for (const spec of specs) {
	const at = spec.indexOf("=")
	const slug = spec.slice(0, at)
	const runPath = spec.slice(at + 1)
	const run = await readRun(runPath)
	members.push({ slug, runPath: resolve(runPath), ...run })
}

// The covers are the run files' own rows, joined on the input content hash — the identity the
// contract already uses, and the one thing that is the same in every worktree.
const coverKeys = members[0].rows.map((row) => row.inputContentHash)
for (const member of members) {
	const keys = member.rows.map((row) => row.inputContentHash)
	if (keys.length !== coverKeys.length || keys.some((key, at) => key !== coverKeys[at])) {
		throw new Error(`${member.slug} ran a different set (or a different order) than ${members[0].slug}`)
	}
}

type PairKey = string
type PairStat = {
	a: string
	b: string
	coversShared: number
	coversMissing: number
	byBar: Record<string, { material: number; perRole: Record<RoleName, number> }>
}

const pairs = new Map<PairKey, PairStat>()
for (let i = 0; i < members.length; i += 1) {
	for (let j = i + 1; j < members.length; j += 1) {
		const byBar: PairStat["byBar"] = {}
		for (const mode of BAR_MODES) {
			byBar[mode] = {
				material: 0,
				perRole: Object.fromEntries(ROLE_NAMES.map((role) => [role, 0])) as Record<RoleName, number>,
			}
		}
		pairs.set(`${members[i].slug}|${members[j].slug}`, {
			a: members[i].slug,
			b: members[j].slug,
			coversShared: 0,
			coversMissing: 0,
			byBar,
		})
	}
}

/** Per cover, per bar mode: did every pair agree on every role? */
const allAgree: Record<string, number> = Object.fromEntries(BAR_MODES.map((mode) => [mode, 0]))
const coversAllPublished: string[] = []
const perCover: Array<Record<string, unknown>> = []

for (const [at, key] of coverKeys.entries()) {
	const published = members.map((member) => member.rows[at])
	const everyone = published.every((row) => row.ok && row.palette !== null)
	if (everyone) coversAllPublished.push(key)

	const coverEntry: Record<string, unknown> = {
		inputContentHash: key,
		imagePath: members[0].rows[at].imagePath,
		failed: members.flatMap((member, mi) => (published[mi].ok ? [] : [member.slug])),
	}
	const coverPairs: Array<Record<string, unknown>> = []

	const agreedEverywhere: Record<string, boolean> = Object.fromEntries(BAR_MODES.map((m) => [m, true]))

	for (const stat of pairs.values()) {
		const left = members.find((m) => m.slug === stat.a)!.rows[at]
		const right = members.find((m) => m.slug === stat.b)!.rows[at]
		if (!left.ok || !right.ok || left.palette === null || right.palette === null) {
			stat.coversMissing += 1
			for (const mode of BAR_MODES) agreedEverywhere[mode] = false
			continue
		}
		stat.coversShared += 1
		const entry: Record<string, unknown> = { a: stat.a, b: stat.b }
		for (const mode of BAR_MODES) {
			const differing: RoleName[] = []
			const distances: Record<string, number | null> = {}
			for (const role of ROLE_NAMES) {
				const first = left.palette.roles[role] as PaletteColor
				const second = right.palette.roles[role] as PaletteColor
				const comparison = compareRole(role, first, second, optionsFor(mode))
				distances[role] = comparison.distance
				if (!comparison.same) {
					differing.push(role)
					stat.byBar[mode].perRole[role] += 1
				}
			}
			if (differing.length > 0) {
				stat.byBar[mode].material += 1
				agreedEverywhere[mode] = false
			}
			entry[mode] = { differingRoles: differing, distances }
		}
		coverPairs.push(entry)
	}

	for (const mode of BAR_MODES) {
		if (everyone && agreedEverywhere[mode]) allAgree[mode] += 1
	}
	coverEntry.pairs = coverPairs
	perCover.push(coverEntry)
}

function rate(numerator: number, denominator: number): number | null {
	return denominator === 0 ? null : numerator / denominator
}

const pairSummaries = [...pairs.values()].map((stat) => ({
	a: stat.a,
	b: stat.b,
	coversShared: stat.coversShared,
	coversMissing: stat.coversMissing,
	byBar: Object.fromEntries(
		BAR_MODES.map((mode) => [
			mode,
			{
				materialDisagreementCount: stat.byBar[mode].material,
				materialDisagreementRate: rate(stat.byBar[mode].material, stat.coversShared),
				perRoleCount: stat.byBar[mode].perRole,
				perRoleRate: Object.fromEntries(
					ROLE_NAMES.map((role) => [role, rate(stat.byBar[mode].perRole[role], stat.coversShared)]),
				),
			},
		]),
	),
}))

const report = {
	kind: "p4-portfolio-m1-disagreement",
	generatedAt: new Date().toISOString(),
	ruler: {
		source: "research/v3/src/adjudication/match.ts compareRole()/barFor()",
		regional: "sameColorBar(first, second) — the calibrated per-pair bar; headline",
		pooled: "POOLED_SAME_COLOR_BAR — the cross-run comparable scalar; secondary, not the gate's bar",
		newConstantsIntroduced: 0,
	},
	members: members.map((member) => ({
		slug: member.slug,
		runPath: member.runPath,
		candidateId: member.header.candidateId,
		codeVersion: member.header.codeVersion,
		okCount: member.rows.filter((row) => row.ok).length,
		coverCount: member.rows.length,
	})),
	coverCount: coverKeys.length,
	coversAllMembersPublished: coversAllPublished.length,
	allFourAgree: Object.fromEntries(
		BAR_MODES.map((mode) => [
			mode,
			{ count: allAgree[mode], rate: rate(allAgree[mode], coversAllPublished.length) },
		]),
	),
	pairs: pairSummaries,
	perCover,
}

await mkdir(dirname(resolve(outPath)), { recursive: true })
await writeFile(resolve(outPath), `${JSON.stringify(report, null, "\t")}\n`)
process.stdout.write(`${resolve(outPath)}\n`)
