/**
 * The change between two runs, biggest first.
 *
 * ## The question this answers
 *
 * You changed a candidate and re-ran it. Twenty covers came back, or two hundred. Which ones did your
 * change actually move, and which moved most? Scrolling a run looking for differences does not scale
 * past about five covers, and it fails in the direction that matters: the cover your change broke is
 * the one you did not happen to look at.
 *
 * ## The metric
 *
 * **`maxRolePairDistance` — the largest OKLab distance between corresponding role colours.**
 *
 *     max over {background, surface, foreground, accent} of okLabDistance(before[role], after[role])
 *
 * Four properties, each of them the reason it is this and not something else:
 *
 *  1. **It is the contract's own ruler.** `PHASE_0_DECISIONS.md` §3 fixes OKLab as the single space
 *     this project measures colour distance in — "one ruler, used for agreement, movement and
 *     distinctness alike" — and this is movement. A diff with its own distance measure would be a
 *     second ruler smuggled in through the back door, and the numbers here are meant to be readable
 *     against the same-colour bar (`SAME_COLOR_BAR_BY_REGION`) that every other v3 judgement uses.
 *  2. **Max, not mean.** A change that ruins one role and leaves three alone is exactly as visible to
 *     the reviewer as one that ruins all four, and averaging is what makes it disappear. The mean is
 *     reported beside it for readers who want it; the *ordering* is by the max.
 *  3. **Roles only.** Roles are what the mock renders as flat colour and what the reviewer grades.
 *     Gradient and collapse changes are recorded on every entry — `gradientChanged`,
 *     `collapseChanged`, `maxStopDistance` — and deliberately kept **out of the ordering number**, so
 *     the headline figure means one thing. An entry whose roles are identical but whose gradient
 *     moved still sorts above the truly-unchanged ones; see `changeRank`.
 *  4. **It is a magnitude, not a verdict.** A big number is not a regression and a small one is not
 *     safety. The reviewer's standing principle is that there are many valid palettes; this ordering
 *     decides what you *look at first*, and nothing else.
 *
 * ## Ordering
 *
 * Biggest first. Ties break on `imagePath`, ascending — so two runs diffed twice list in the same
 * order, which is the same determinism promise the runner makes about its rows.
 */

import { fileURLToPath } from "node:url"
import { colorDistance } from "../contract/color.ts"
import { ROLE_NAMES } from "../contract/constants.ts"
import type { Palette, PaletteColor, RoleName } from "../contract/types.ts"
import { readRunFile } from "./run.ts"
import type { RunFile, RunRow } from "./types.ts"

/**
 * What happened to one cover between two runs.
 *
 * `changed` and `unchanged` are about palettes that exist on both sides. The other three are the
 * cases a naive diff drops on the floor, and dropping them is how "my change fixed it" and "my change
 * made it throw" become indistinguishable.
 */
export type ChangeStatus = "changed" | "unchanged" | "started-failing" | "started-working" | "failed-both"

/** Per-role movement, so a big headline number can be attributed without opening the palettes. */
export type RoleDistances = Readonly<Record<RoleName, number>>

export type DiffEntry = Readonly<{
	/** Position in the *after* run's set, so the viewer can open the diff at a known cover. */
	index: number
	imagePath: string
	status: ChangeStatus
	/**
	 * **The ordering metric.** Largest OKLab distance between corresponding role colours.
	 * `null` when one side has no palette — there is no distance between a palette and an error.
	 */
	maxRolePairDistance: number | null
	/** Mean of the four role distances. Reported, never ordered on. */
	meanRolePairDistance: number | null
	perRole: RoleDistances | null
	/** Which role carried the max — the first thing anyone asks after seeing the number. */
	worstRole: RoleName | null
	/** True when the two palettes' gradients differ at all: stop count, colours or positions. */
	gradientChanged: boolean
	/**
	 * Largest OKLab distance between stops compared pairwise by position in the list. `null` when
	 * either side has no gradient or the stop counts differ — in which case `gradientChanged` carries
	 * the fact and no number pretends to measure it.
	 */
	maxStopDistance: number | null
	/** True when either collapse flag flipped. */
	collapseChanged: boolean
	/** True when the input file's own bytes changed between the runs. Almost always false, and loud. */
	inputChanged: boolean
	before: Palette | null
	after: Palette | null
}>

export type RunDiff = Readonly<{
	beforeRunId: string
	afterRunId: string
	/** True when both runs quote the same set hash — i.e. the same images in the same order. */
	sameSet: boolean
	/** Covers present in one run and not the other. Named, never silently dropped. */
	onlyInBefore: readonly string[]
	onlyInAfter: readonly string[]
	/** Every shared cover, biggest change first. Unchanged covers are included, at the end. */
	entries: readonly DiffEntry[]
	changedCount: number
	unchangedCount: number
}>

/** The largest role-pair distance, and which role it was. */
export function roleDistances(before: Palette, after: Palette): { perRole: RoleDistances; worst: RoleName; max: number; mean: number } {
	const perRole = {} as Record<RoleName, number>
	let worst: RoleName = ROLE_NAMES[0]
	let max = -1
	let total = 0
	for (const role of ROLE_NAMES) {
		const distance = colorDistance(before.roles[role], after.roles[role])
		perRole[role] = distance
		total += distance
		if (distance > max) {
			max = distance
			worst = role
		}
	}
	return { perRole, worst, max, mean: total / ROLE_NAMES.length }
}

function stopColors(palette: Palette): readonly PaletteColor[] {
	return palette.gradient === null ? [] : palette.gradient.stops.map((stop) => stop.color)
}

function gradientDiffers(before: Palette, after: Palette): { changed: boolean; maxStopDistance: number | null } {
	const beforeStops = before.gradient
	const afterStops = after.gradient
	if (beforeStops === null && afterStops === null) return { changed: false, maxStopDistance: null }
	if (beforeStops === null || afterStops === null) return { changed: true, maxStopDistance: null }
	if (beforeStops.stops.length !== afterStops.stops.length) return { changed: true, maxStopDistance: null }

	const beforeColors = stopColors(before)
	const afterColors = stopColors(after)
	let max = 0
	let changed = false
	for (const [position, color] of beforeColors.entries()) {
		const distance = colorDistance(color, afterColors[position])
		if (distance > max) max = distance
		if (distance > 0) changed = true
		if (beforeStops.stops[position].position !== afterStops.stops[position].position) changed = true
	}
	return { changed, maxStopDistance: max }
}

/**
 * The sort key. Everything with a role-colour change sorts above everything without one.
 *
 * A cover whose roles are identical but whose gradient or collapse flags moved is still a change and
 * still wants looking at, so it sorts above the untouched ones — below every genuine role movement,
 * because the roles are what the mock renders as flat colour. Rows with no comparable palette (an
 * error on one side) sort to the very top: an image that started failing is the most urgent thing a
 * diff can contain, and it has no distance to report.
 */
export function changeRank(entry: DiffEntry): number {
	if (entry.status === "started-failing" || entry.status === "started-working") return Number.POSITIVE_INFINITY
	if (entry.status === "failed-both") return Number.NEGATIVE_INFINITY
	if (entry.maxRolePairDistance !== null && entry.maxRolePairDistance > 0) return entry.maxRolePairDistance
	if (entry.gradientChanged || entry.collapseChanged) return 0
	return -1
}

function compareEntries(left: DiffEntry, right: DiffEntry): number {
	const difference = changeRank(right) - changeRank(left)
	if (difference !== 0 && Number.isFinite(difference)) return difference
	if (changeRank(right) !== changeRank(left)) return changeRank(right) > changeRank(left) ? 1 : -1
	return left.imagePath < right.imagePath ? -1 : left.imagePath > right.imagePath ? 1 : 0
}

function compareRows(index: number, before: RunRow, after: RunRow): DiffEntry {
	const base = {
		index,
		imagePath: after.imagePath,
		inputChanged: before.inputContentHash !== after.inputContentHash,
		before: before.palette,
		after: after.palette,
	}

	if (!before.ok && !after.ok) {
		return {
			...base,
			status: "failed-both",
			maxRolePairDistance: null,
			meanRolePairDistance: null,
			perRole: null,
			worstRole: null,
			gradientChanged: false,
			maxStopDistance: null,
			collapseChanged: false,
		}
	}
	if (before.ok !== after.ok || before.palette === null || after.palette === null) {
		return {
			...base,
			status: after.ok ? "started-working" : "started-failing",
			maxRolePairDistance: null,
			meanRolePairDistance: null,
			perRole: null,
			worstRole: null,
			gradientChanged: false,
			maxStopDistance: null,
			collapseChanged: false,
		}
	}

	const roles = roleDistances(before.palette, after.palette)
	const gradient = gradientDiffers(before.palette, after.palette)
	const collapseChanged =
		before.palette.collapse.surfaceCollapsed !== after.palette.collapse.surfaceCollapsed ||
		before.palette.collapse.accentCollapsed !== after.palette.collapse.accentCollapsed

	return {
		...base,
		status: roles.max > 0 || gradient.changed || collapseChanged ? "changed" : "unchanged",
		maxRolePairDistance: roles.max,
		meanRolePairDistance: roles.mean,
		perRole: roles.perRole,
		worstRole: roles.worst,
		gradientChanged: gradient.changed,
		maxStopDistance: gradient.maxStopDistance,
		collapseChanged,
	}
}

/**
 * Diff two runs.
 *
 * Covers are joined on **image path**, not on position: a set file that gained a line at the top
 * would otherwise shift every row against its neighbour and report the whole run as changed. When the
 * same path carries different bytes in the two runs, that is reported (`inputChanged`) rather than
 * hidden — the palette legitimately changed, but not because the candidate did.
 */
export function diffRuns(before: RunFile, after: RunFile): RunDiff {
	const beforeByPath = new Map(before.rows.map((row) => [row.imagePath, row]))
	const afterByPath = new Map(after.rows.map((row) => [row.imagePath, row]))

	const entries: DiffEntry[] = []
	for (const [index, afterRow] of after.rows.entries()) {
		const beforeRow = beforeByPath.get(afterRow.imagePath)
		if (beforeRow === undefined) continue
		entries.push(compareRows(index, beforeRow, afterRow))
	}
	entries.sort(compareEntries)

	return {
		beforeRunId: before.header.runId,
		afterRunId: after.header.runId,
		sameSet: before.header.setHash === after.header.setHash,
		onlyInBefore: before.rows.filter((row) => !afterByPath.has(row.imagePath)).map((row) => row.imagePath),
		onlyInAfter: after.rows.filter((row) => !beforeByPath.has(row.imagePath)).map((row) => row.imagePath),
		entries,
		changedCount: entries.filter((entry) => entry.status !== "unchanged" && entry.status !== "failed-both").length,
		unchangedCount: entries.filter((entry) => entry.status === "unchanged").length,
	}
}

/* ------------------------------------------------------------------------------------------- */
/* CLI                                                                                            */
/* ------------------------------------------------------------------------------------------- */

/**
 * `diff.ts <before.jsonl> <after.jsonl>` — the same ordering the viewer shows, as text.
 *
 * The browse page is the real surface: a palette change is a thing you look at, not a number you
 * read. This exists because a number is what you can paste into a message, grep, and check in a test.
 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const [beforePath, afterPath] = process.argv.slice(2)
	if (beforePath === undefined || afterPath === undefined) {
		process.stdout.write("usage: diff.ts <before.jsonl> <after.jsonl>\n")
		process.exitCode = 2
	} else {
		const diff = diffRuns(await readRunFile(beforePath), await readRunFile(afterPath))
		process.stdout.write(
			`${diff.beforeRunId} -> ${diff.afterRunId}\n` +
				`${diff.changedCount} changed, ${diff.unchangedCount} unchanged` +
				(diff.sameSet ? "" : "  (DIFFERENT SETS)") +
				"\n",
		)
		for (const entry of diff.entries) {
			const magnitude = entry.maxRolePairDistance === null ? "     —" : entry.maxRolePairDistance.toFixed(4)
			process.stdout.write(`  ${magnitude}  ${entry.status.padEnd(15)} ${entry.worstRole ?? ""}  ${entry.imagePath}\n`)
		}
	}
}
