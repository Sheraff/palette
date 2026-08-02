/**
 * Distil the v2-3 verdict warehouse into the three v3 legacy fixture files.
 *
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/src/legacy/distill-legacy-verdicts.ts [--out <dir>] [--quiet]
 *
 * Policy: PHASE_0_DECISIONS.md §5 — v2-3 verdicts are NOT imported into the v3 warehouse.
 * Their value flows through the sanctioned channels below, and this script builds them all:
 *
 *   known-bad.json    palettes the reviewer graded `weak-fallback` or `unacceptable`
 *                     -> feeds the known-worse gate (§3)
 *   endorsements.json reviewer corrections (`endorsed-sample`) and `strong`-graded palettes
 *                     -> feeds the concordance dashboard and reachability diagnostics (§3)
 *   acceptable.json   palettes graded `acceptable` — a "not-rejected" baseline tier for the
 *                     concordance dashboard ONLY. Not endorsements. Added by orchestrator
 *                     decision; see the README's decision log.
 *
 * None of them is a verdict store. Nothing here is a current verdict about v3 output; every
 * entry is stamped `contract: "v2-3"` and scoped by rendition so a later reader cannot
 * mistake it for one.
 *
 * The script is deterministic and re-runnable: it reads only committed inputs, sorts every
 * output collection, and writes no timestamps other than the source records' own.
 */
import { createHash } from "node:crypto"
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { parseArgs } from "node:util"
import sharp from "sharp"

/* ------------------------------------------------------------------ constants */

/** [INHERITED] Repo layout: this file lives at research/v3/src/legacy/. */
const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..")
/** [INHERITED] The v2-3 evaluation track, read-only for this workstream (CONVENTIONS.md path ownership). */
const EVAL_ROOT = join(REPO_ROOT, "research", "v2-3-eval")
const VERDICTS_PATH = join(EVAL_ROOT, "data", "verdicts.jsonl")
const BATCHES_ROOT = join(EVAL_ROOT, "data", "batches")
const RESULTS_ROOT = join(EVAL_ROOT, "data", "results")
/** [INHERITED] Owned output directory (CONVENTIONS.md path ownership). */
const DEFAULT_OUT_ROOT = join(REPO_ROOT, "research", "v3", "data", "legacy")

/**
 * [REVIEWED] The era's full grade vocabulary, from research/v2-3-eval/serve-review.ts:44
 * (`export const verdicts = ["strong", "acceptable", "weak-fallback", "unacceptable"]`).
 * There is no grade literally named "weak"; `weak-fallback` is the era's equivalent.
 */
const GRADE_VOCABULARY = ["strong", "acceptable", "weak-fallback", "unacceptable"] as const
type Grade = (typeof GRADE_VOCABULARY)[number]

/** [REVIEWED] Grades that make a palette known-bad. `acceptable` is deliberately excluded. */
const BAD_GRADES: readonly Grade[] = ["weak-fallback", "unacceptable"]
/** [REVIEWED] The only grade exported as an endorsement. `acceptable` is not an endorsement. */
const ENDORSING_GRADE: Grade = "strong"
/**
 * [REVIEWED] Exported to its own baseline fixture, never to endorsements.json.
 * Orchestrator decision 2026-08-02 (open question 4).
 */
const BASELINE_GRADE: Grade = "acceptable"

/** [INHERITED] Contract stamp required on every entry (PHASE_0_DECISIONS.md §5). */
const CONTRACT_TAG = "v2-3"
/** [INHERITED] The v2-3 role set. v3 adds decoupled stops; v2-3 had none. */
const ROLES = ["background", "surface", "foreground", "accent"] as const
type Role = (typeof ROLES)[number]

/**
 * [INHERITED] v2-3 rendered a gradient as
 * `linear-gradient(135deg in oklab, background 0%, midpoint 50%, surface 100%)`
 * (research/v2-3-eval/README.md §4). Endpoints were the role colors; the midpoint was pinned
 * at 0.5. v3 decouples stops from roles, so gradient comparisons against these entries are
 * ADVISORY ONLY.
 */
const GRADIENT_ADVISORY =
	"v2-3 gradients reuse background/surface as the endpoints and pin the midpoint at t=0.5; "
	+ "v3 stops are decoupled from roles, so gradient comparison against this entry is advisory only. "
	+ "Role-level color matching is the reliable signal."

/**
 * [UNCALIBRATED] Intended matching semantics for every consumer of these fixtures.
 * Orchestrator decision 2026-08-02 (open question 2): a v3 palette "matches" a fixture entry when
 * all four role colors fall within the v3 same-color bar ("one ruler", PHASE_0_DECISIONS.md §3) —
 * never on exact hex equality. Exact hexes are stored so any bar can be applied after the fact.
 * The bar itself (unit and threshold) is UNCALIBRATED until the reviewer bracketing round settles
 * it; v2-3's 3.3 CIE76 is the prior, not the answer.
 */
const MATCH_SEMANTICS =
	"Match on roleSignature within the v3 same-color bar (all four roles), never exact hex equality. "
	+ "The bar is UNCALIBRATED pending the reviewer bracketing round (PHASE_0_DECISIONS.md §3, §6); "
	+ "exact hexes are stored here so any bar can be applied after the fact. "
	+ "paletteSignature (which folds in gradient, midpoint and collapse) is for provenance and "
	+ "de-duplication only — do not gate on it, because the v2-3 gradient representation does not "
	+ "survive into the v3 contract."

/* ------------------------------------------------------------------ source types */

type SourceColor = { rgb: [number, number, number]; oklab: [number, number, number]; hex: string; generated: boolean }
type SourcePalette = {
	background: SourceColor
	surface: SourceColor
	foreground: SourceColor
	accent: SourceColor
	gradient: boolean
	collapse: { surface: boolean; accent: boolean }
	midpoint: string | null
	width: number
	height: number
}
type VerdictRecord = {
	schemaVersion: number
	recordedAt: string
	batch: string
	image?: string | null
	imageSha256?: string | null
	labels?: string[]
	blindSides?: { A: string; B: string }
	palettes?: Record<string, SourcePalette>
	/** hand-recorded conversational records carry a bare hex palette instead */
	palette?: Partial<Record<Role, string>>
	gradient?: boolean
	comparison: string
	preference?: { side: string | null; label: string | null }
	verdict?: Grade | null
	verdictApplies?: string[]
	corrections?: Partial<Record<Role, string>> | null
	correctionsKind?: string
	source?: string
	tags?: string[]
	notes?: string
}

/* ------------------------------------------------------------------ output types */

type ColorEntry = { hex: string; rgb: [number, number, number] | null; name: string }
type ArtworkIdentity = {
	imagePath: string
	absolutePath: string
	contentSha256: string
	byteCount: number
	rendition: { format: string; width: number; height: number }
	imageId: string
}
type PaletteEntry = {
	completeness: "full" | "roles-only" | "partial"
	roles: Partial<Record<Role, ColorEntry>>
	gradient: boolean | null
	midpoint: ColorEntry | null
	collapse: { surface: boolean; accent: boolean } | null
	processedSize: { width: number; height: number } | null
	processedSizeMatchesHeader: boolean | null
}
type Evidence = {
	warehouseLine: number
	batch: string
	label: string | null
	recordedAt: string
	comparison: string
	verdict: Grade | null
	preferredLabel: string | null
	tags: string[]
	notes: string
	source?: string
}

/* ------------------------------------------------------------------ helpers */

function invariant(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

function normalizeHex(hex: string): string {
	const value = hex.trim().toLowerCase()
	invariant(/^#[0-9a-f]{6}$/u.test(value), `not a 6-digit hex color: ${hex}`)
	return value
}

function hexToRgb(hex: string): [number, number, number] {
	const value = normalizeHex(hex)
	return [
		Number.parseInt(value.slice(1, 3), 16),
		Number.parseInt(value.slice(3, 5), 16),
		Number.parseInt(value.slice(5, 7), 16),
	]
}

/**
 * Nearest color name, for human adjudication only. CONVENTIONS.md: human-facing color output
 * always carries a name alongside the hex. Names never feed any mechanical check.
 */
let nameRGB: ((rgb: [number, number, number]) => { nearestName: string }) | null = null
async function loadColorNamer(): Promise<void> {
	const module = await import(join(REPO_ROOT, "research", "src", "color-name.ts"))
	nameRGB = module.nameRGB as (rgb: [number, number, number]) => { nearestName: string }
}

function colorEntry(hex: string): ColorEntry {
	const value = normalizeHex(hex)
	const rgb = hexToRgb(value)
	invariant(nameRGB !== null, "color namer not loaded")
	return { hex: value, rgb, name: nameRGB(rgb).nearestName }
}

/** Stable id for an entry: content hash of the fields that define its identity. */
function stableId(parts: readonly string[]): string {
	return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 16)
}

function sortedUnique(values: readonly string[]): string[] {
	return [...new Set(values)].sort()
}

/* ------------------------------------------------------------------ input indices */

type BatchItem = { image: string; imagePath?: string; sourceSha256?: string; byteCount?: number }

/** (batch name, image) -> batch item, the primary source of the artwork's repo-relative path. */
async function readBatchIndex(): Promise<Map<string, BatchItem>> {
	const index = new Map<string, BatchItem>()
	for (const file of (await readdir(BATCHES_ROOT)).sort()) {
		if (!file.endsWith(".json") || file.endsWith(".key.json")) continue
		const parsed = JSON.parse(await readFile(join(BATCHES_ROOT, file), "utf8")) as
			{ name?: string; items?: BatchItem[] }
		const name = parsed.name ?? basename(file, ".json")
		for (const item of parsed.items ?? []) index.set(`${name}\u0000${item.image}`, item)
	}
	return index
}

/**
 * image id -> repo-relative path, from the cached corpus results. Fallback for records whose
 * batch has no definition file (the hand-recorded `conversational` batch).
 */
async function readResultsIndex(): Promise<Map<string, string>> {
	const index = new Map<string, string>()
	const conflicts = new Set<string>()
	for (const label of (await readdir(RESULTS_ROOT, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : 1)) {
		if (!label.isDirectory()) continue
		for (const file of (await readdir(join(RESULTS_ROOT, label.name))).sort()) {
			if (!file.endsWith(".json")) continue
			const parsed = JSON.parse(await readFile(join(RESULTS_ROOT, label.name, file), "utf8")) as
				{ image?: string; imagePath?: string }
			if (typeof parsed.image !== "string" || typeof parsed.imagePath !== "string") continue
			const existing = index.get(parsed.image)
			if (existing !== undefined && existing !== parsed.imagePath) conflicts.add(parsed.image)
			index.set(parsed.image, parsed.imagePath)
		}
	}
	invariant(conflicts.size === 0, `image ids map to more than one path: ${[...conflicts].join(", ")}`)
	return index
}

/* ------------------------------------------------------------------ artwork identity */

const artworkCache = new Map<string, ArtworkIdentity>()

/** Identity is full path + content hash; dimensions come from the file header, never a filename. */
async function resolveArtwork(imagePath: string): Promise<ArtworkIdentity> {
	const cached = artworkCache.get(imagePath)
	if (cached !== undefined) return cached
	const absolutePath = join(REPO_ROOT, imagePath)
	const bytes = await readFile(absolutePath)
	const metadata = await sharp(bytes).metadata()
	invariant(typeof metadata.width === "number" && typeof metadata.height === "number",
		`no dimensions in header for ${imagePath}`)
	const identity: ArtworkIdentity = {
		imagePath,
		absolutePath,
		contentSha256: createHash("sha256").update(bytes).digest("hex"),
		byteCount: bytes.byteLength,
		rendition: { format: metadata.format ?? "unknown", width: metadata.width, height: metadata.height },
		imageId: basename(imagePath),
	}
	artworkCache.set(imagePath, identity)
	return identity
}

/* ------------------------------------------------------------------ palette shaping */

function fullPalette(source: SourcePalette, artwork: ArtworkIdentity): PaletteEntry {
	const roles: Partial<Record<Role, ColorEntry>> = {}
	for (const role of ROLES) {
		const color = source[role]
		roles[role] = { hex: normalizeHex(color.hex), rgb: [...color.rgb], name: colorEntry(color.hex).name }
	}
	const processedSize = { width: source.width, height: source.height }
	return {
		completeness: "full",
		roles,
		gradient: source.gradient,
		midpoint: source.midpoint === null ? null : colorEntry(source.midpoint),
		collapse: { ...source.collapse },
		processedSize,
		processedSizeMatchesHeader:
			processedSize.width === artwork.rendition.width && processedSize.height === artwork.rendition.height,
	}
}

function hexPalette(hexes: Partial<Record<Role, string>>, gradient: boolean | null): PaletteEntry {
	const roles: Partial<Record<Role, ColorEntry>> = {}
	for (const role of ROLES) {
		const hex = hexes[role]
		if (typeof hex === "string") roles[role] = colorEntry(hex)
	}
	const count = Object.keys(roles).length
	return {
		completeness: count === ROLES.length ? "roles-only" : "partial",
		roles,
		gradient,
		midpoint: null,
		collapse: null,
		processedSize: null,
		processedSizeMatchesHeader: null,
	}
}

/** Signature used for de-duplication and for cross-fixture contest detection. */
function paletteSignature(palette: PaletteEntry): string {
	const roles = ROLES.map((role) => `${role}=${palette.roles[role]?.hex ?? "-"}`).join(",")
	const gradient = palette.gradient === null ? "g?" : palette.gradient ? "g1" : "g0"
	const midpoint = palette.midpoint === null ? "m-" : `m${palette.midpoint.hex}`
	const collapse = palette.collapse === null
		? "c?"
		: `c${palette.collapse.surface ? 1 : 0}${palette.collapse.accent ? 1 : 0}`
	return `${roles}|${gradient}|${midpoint}|${collapse}`
}

/** Role-only signature: what survives the v2-3 -> v3 contract change. */
function roleSignature(palette: PaletteEntry): string {
	return ROLES.map((role) => palette.roles[role]?.hex ?? "-").join(",")
}

/* ------------------------------------------------------------------ main */

const { values } = parseArgs({
	options: {
		out: { type: "string" },
		quiet: { type: "boolean", default: false },
	},
	strict: true,
})
const OUT_ROOT = values.out === undefined ? DEFAULT_OUT_ROOT : resolve(values.out)

await loadColorNamer()
const batchIndex = await readBatchIndex()
const resultsIndex = await readResultsIndex()

const lines = (await readFile(VERDICTS_PATH, "utf8")).split("\n").filter((line) => line.trim() !== "")
const records: { line: number; record: VerdictRecord }[] = lines.map((line, i) => ({
	line: i + 1,
	record: JSON.parse(line) as VerdictRecord,
}))

/* counters */
const counts = {
	recordsRead: records.length,
	recordsWithEmbeddedPalettes: 0,
	recordsWithHexOnlyPalette: 0,
	recordsWithCorrections: 0,
	recordsCarryingNoPalette: 0,
	artworkResolvedFromBatch: 0,
	artworkResolvedFromResults: 0,
	artworkUnresolvable: 0,
	paletteInstancesRecovered: 0,
	paletteInstancesUnrecoverable: 0,
	labelsWithoutPalette: 0,
	contentHashVerified: 0,
	contentHashMismatch: 0,
	/** graded `acceptable` palette instances found in the warehouse; they feed acceptable.json */
	acceptableGradedInstances: 0,
	/**
	 * The losing side of an A/B item whose winner was graded weak-fallback/unacceptable.
	 * Presumably worse than the winner, but the reviewer never graded it. Not exported
	 * (see README ambiguity A2); counted so the decision can be revisited with a number.
	 */
	ungradedLosingSidesInBadRecords: 0,
	gradeCounts: {} as Record<string, number>,
	comparisonCounts: {} as Record<string, number>,
	correctionsKindCounts: {} as Record<string, number>,
}
const unresolvable: { warehouseLine: number; batch: string; image: string | null; comparison: string; reason: string; notes: string }[] = []

/** Resolve the repo-relative image path for a record, or null when it cannot be recovered. */
async function artworkFor(record: VerdictRecord): Promise<ArtworkIdentity | null> {
	const image = record.image
	if (typeof image !== "string" || image === "") return null
	const fromBatch = batchIndex.get(`${record.batch}\u0000${image}`)
	let imagePath: string | null = null
	let via: "batch" | "results" | null = null
	if (fromBatch?.imagePath !== undefined) {
		imagePath = fromBatch.imagePath
		via = "batch"
	} else {
		const fromResults = resultsIndex.get(image)
		if (fromResults !== undefined) {
			imagePath = fromResults
			via = "results"
		}
	}
	if (imagePath === null) return null
	const artwork = await resolveArtwork(imagePath)
	if (via === "batch") counts.artworkResolvedFromBatch += 1
	else counts.artworkResolvedFromResults += 1
	if (typeof record.imageSha256 === "string") {
		counts.contentHashVerified += 1
		if (record.imageSha256 !== artwork.contentSha256) counts.contentHashMismatch += 1
	}
	return artwork
}

/* --- pass 1: every graded palette instance, for contest detection ------------- */

type GradedInstance = {
	line: number
	record: VerdictRecord
	label: string
	grade: Grade
	artwork: ArtworkIdentity
	palette: PaletteEntry
}
const graded: GradedInstance[] = []
type CorrectionInstance = {
	line: number
	record: VerdictRecord
	artwork: ArtworkIdentity
	palette: PaletteEntry
}
const corrections: CorrectionInstance[] = []

for (const { line, record } of records) {
	counts.comparisonCounts[record.comparison] = (counts.comparisonCounts[record.comparison] ?? 0) + 1
	const gradeKey = record.verdict ?? "(none)"
	counts.gradeCounts[gradeKey] = (counts.gradeCounts[gradeKey] ?? 0) + 1
	const kindKey = record.correctionsKind ?? "(none)"
	counts.correctionsKindCounts[kindKey] = (counts.correctionsKindCounts[kindKey] ?? 0) + 1

	const hasEmbedded = record.palettes !== undefined && Object.keys(record.palettes).length > 0
	const hasHexOnly = record.palette !== undefined && Object.keys(record.palette).length > 0
	const correctionHexes = record.corrections ?? {}
	const hasCorrections = Object.keys(correctionHexes).length > 0
	if (hasEmbedded) counts.recordsWithEmbeddedPalettes += 1
	if (hasHexOnly) counts.recordsWithHexOnlyPalette += 1
	if (hasCorrections) counts.recordsWithCorrections += 1
	if (!hasEmbedded && !hasHexOnly && !hasCorrections) counts.recordsCarryingNoPalette += 1

	const artwork = await artworkFor(record)
	if (artwork === null) {
		counts.artworkUnresolvable += 1
		if (hasEmbedded || hasHexOnly || hasCorrections) {
			counts.paletteInstancesUnrecoverable += 1
			unresolvable.push({
				warehouseLine: line,
				batch: record.batch,
				image: record.image ?? null,
				comparison: record.comparison,
				reason: "no repo-relative image path recoverable from batch files or cached results",
				notes: record.notes ?? "",
			})
		} else {
			unresolvable.push({
				warehouseLine: line,
				batch: record.batch,
				image: record.image ?? null,
				comparison: record.comparison,
				reason: "record carries no palette content (note-only / survey); nothing to distil",
				notes: record.notes ?? "",
			})
		}
		continue
	}

	const grade = record.verdict ?? null
	const applies = record.verdictApplies ?? []
	if (grade !== null && hasEmbedded) {
		for (const label of applies) {
			const source = record.palettes?.[label]
			if (source === undefined) {
				counts.labelsWithoutPalette += 1
				continue
			}
			counts.paletteInstancesRecovered += 1
			if (grade === "acceptable") counts.acceptableGradedInstances += 1
			graded.push({ line, record, label, grade, artwork, palette: fullPalette(source, artwork) })
		}
		if (BAD_GRADES.includes(grade) && record.comparison === "ab") {
			for (const label of record.labels ?? []) {
				if (!applies.includes(label)) counts.ungradedLosingSidesInBadRecords += 1
			}
		}
	} else if (grade !== null && hasHexOnly) {
		// Hand-recorded conversational verdict: a bare hex palette plus a gradient flag.
		counts.paletteInstancesRecovered += 1
		const label = applies[0] ?? record.labels?.[0] ?? null
		graded.push({
			line,
			record,
			label: label ?? "(unlabelled)",
			grade,
			artwork,
			palette: hexPalette(record.palette ?? {}, record.gradient ?? null),
		})
	}

	if (hasCorrections) {
		counts.paletteInstancesRecovered += 1
		corrections.push({ line, record, artwork, palette: hexPalette(correctionHexes, null) })
	}
}

/* --- contest map: every grade ever attached to (artwork, exact palette) ------- */

const contestKey = (artwork: ArtworkIdentity, palette: PaletteEntry): string =>
	`${artwork.contentSha256}\u0000${paletteSignature(palette)}`
const historyByKey = new Map<string, GradedInstance[]>()
for (const instance of graded) {
	const key = contestKey(instance.artwork, instance.palette)
	const list = historyByKey.get(key) ?? []
	list.push(instance)
	historyByKey.set(key, list)
}

/**
 * [REVIEWED] Reviewer decision 2026-08-02: when the same (artwork, exact palette) pair carries more
 * than one grade, **the latest-timestamped grade wins**. The v2-3 records carry `recordedAt`, so a
 * later look at the same palette supersedes an earlier one rather than standing beside it as a
 * permanent contradiction. Only an exact timestamp tie between *conflicting* grades leaves a pair
 * unresolved; those warn instead of blocking.
 */
const RECENCY_RULE =
	"Latest-timestamped grade wins (reviewer decision 2026-08-02). Where the same artwork and the same "
	+ "exact palette were graded more than once, the most recent grade is the pair's standing verdict; "
	+ "earlier grades are history, not live contradictions. Only conflicting grades sharing an identical "
	+ "timestamp stay unresolved, and those warn rather than block."

/**
 * [REVIEWED] Verifier caveat, 2026-08-02. Stated on every fixture so a consumer cannot get it wrong.
 */
const MEMBERSHIP_RULE =
	"Membership is the signal: no standingGrade filtering is needed or expected. Every palette with a "
	+ "bad standing grade lives in known-bad.json and nowhere else; every palette in this file has a good "
	+ "standing grade. Entries removed from this file because a later comparison downgraded them are "
	+ "listed in meta.droppedAsStandingBad, and their full grade history lives on the matching known-bad "
	+ "entry's resolution.gradeHistory."

type GradeHistoryRow = {
	recordedAt: string
	grade: Grade
	batch: string
	label: string
	warehouseLine: number
}
type Resolution = {
	gradeHistory: GradeHistoryRow[]
	distinctGrades: Grade[]
	latestGrade: Grade | null
	latestRecordedAt: string
	/** more than one distinct grade, and recency picked a single winner */
	resolvedByRecency: boolean
	/** non-empty only when conflicting grades share the latest timestamp — the unresolved case */
	tiedLatestGrades: Grade[]
	/** this entry's own grade is not the pair's latest word */
	supersededByLaterGrade: boolean
	rule: string
}

function resolutionOf(key: string, ownGrade: Grade): Resolution {
	const instances = historyByKey.get(key) ?? []
	const gradeHistory: GradeHistoryRow[] = instances
		.map((instance) => ({
			recordedAt: instance.record.recordedAt,
			grade: instance.grade,
			batch: instance.record.batch,
			label: instance.label,
			warehouseLine: instance.line,
		}))
		.sort((a, b) => (a.recordedAt === b.recordedAt
			? a.warehouseLine - b.warehouseLine
			: (a.recordedAt < b.recordedAt ? -1 : 1)))
	const distinctGrades = [...new Set(gradeHistory.map((row) => row.grade))]
		.sort((a, b) => SEVERITY[a] - SEVERITY[b])
	const latestRecordedAt = gradeHistory
		.reduce((latest, row) => (row.recordedAt > latest ? row.recordedAt : latest), "")
	const atLatest = [...new Set(gradeHistory
		.filter((row) => row.recordedAt === latestRecordedAt)
		.map((row) => row.grade))]
	const tied = atLatest.length > 1
	const latestGrade = tied ? null : (atLatest[0] ?? null)
	return {
		gradeHistory,
		distinctGrades,
		latestGrade,
		latestRecordedAt,
		resolvedByRecency: distinctGrades.length > 1 && !tied,
		tiedLatestGrades: tied ? [...atLatest].sort((a, b) => SEVERITY[a] - SEVERITY[b]) : [],
		supersededByLaterGrade: !tied && latestGrade !== null && latestGrade !== ownGrade,
		rule: RECENCY_RULE,
	}
}

/**
 * Known-bad membership under the recency rule: the pair's standing verdict must be a bad grade.
 * An unresolved tie involving a bad grade stays in, flagged, and warns instead of blocking.
 */
function belongsInKnownBad(resolution: Resolution): boolean {
	return resolution.tiedLatestGrades.length > 0
		? resolution.tiedLatestGrades.some((grade) => BAD_GRADES.includes(grade))
		: resolution.latestGrade !== null && BAD_GRADES.includes(resolution.latestGrade)
}

function evidenceOf(instance: GradedInstance): Evidence {
	const { record } = instance
	return {
		warehouseLine: instance.line,
		batch: record.batch,
		label: instance.label,
		recordedAt: record.recordedAt,
		comparison: record.comparison,
		verdict: instance.grade,
		preferredLabel: record.preference?.label ?? null,
		tags: [...(record.tags ?? [])].sort(),
		notes: record.notes ?? "",
		...(record.source === undefined ? {} : { source: record.source }),
	}
}

/* --- known-bad ---------------------------------------------------------------- */

type KnownBadEntry = {
	contract: typeof CONTRACT_TAG
	entryId: string
	artwork: ArtworkIdentity
	palette: PaletteEntry
	paletteSignature: string
	roleSignature: string
	grades: Grade[]
	worstGrade: Grade
	/** the pair's standing grade under the recency rule; null only on an unresolved timestamp tie */
	standingGrade: Grade | null
	resolvedByRecency: boolean
	/** true only on an unresolved identical-timestamp conflict — warn, never block */
	contested: boolean
	resolution: Resolution
	gradientAdvisory: string
	evidence: Evidence[]
}

/**
 * [REVIEWED] Reviewer decision 2026-08-02, superseding the earlier warn-not-block policy for
 * contested pairs: conflicts resolve by RECENCY (see RECENCY_RULE). A palette whose latest grade is
 * bad is a hard-gate entry even though an earlier comparison called it good; a palette whose latest
 * grade is good is not in this file at all. `contested: true` now means only one thing — conflicting
 * grades sharing an identical timestamp, which recency cannot decide.
 */
const GATE_POLICY =
	"Every entry here has a bad standing grade under the recency rule, and blocks integration when a v3 "
	+ "output matches it. The sole exception is contested: true — conflicting grades at an identical "
	+ "timestamp, which recency cannot decide; those warn rather than block. Palettes whose latest grade "
	+ "is strong or acceptable are absent from this file entirely, even if an earlier comparison graded "
	+ "them bad; they live in endorsements.json or acceptable.json instead."

/** [REVIEWED] Severity order for reporting a single worst grade per entry. */
const SEVERITY: Record<Grade, number> = { strong: 0, acceptable: 1, "weak-fallback": 2, unacceptable: 3 }

type DroppedByRecency = {
	entryId: string
	imagePath: string
	contentSha256: string
	roleSignature: string
	droppedGrade: Grade
	standingGrade: Grade | null
	standingRecordedAt: string
	nowLivesIn: string
	gradeHistory: GradeHistoryRow[]
}
/** Bad-graded palettes removed from known-bad because a later comparison graded them good. */
const droppedByRecency = new Map<string, DroppedByRecency>()

const knownBadByKey = new Map<string, KnownBadEntry>()
for (const instance of graded) {
	if (!BAD_GRADES.includes(instance.grade)) continue
	const key = contestKey(instance.artwork, instance.palette)
	const resolution = resolutionOf(key, instance.grade)
	if (!belongsInKnownBad(resolution)) {
		// A later comparison graded this exact palette strong or acceptable. Under the recency rule
		// that later word stands, so the palette is not known-bad; it lives in the fixture its
		// standing grade puts it in.
		droppedByRecency.set(key, {
			entryId: stableId([instance.artwork.contentSha256, paletteSignature(instance.palette)]),
			imagePath: instance.artwork.imagePath,
			contentSha256: instance.artwork.contentSha256,
			roleSignature: roleSignature(instance.palette),
			droppedGrade: instance.grade,
			standingGrade: resolution.latestGrade,
			standingRecordedAt: resolution.latestRecordedAt,
			nowLivesIn: resolution.latestGrade === ENDORSING_GRADE ? "endorsements.json" : "acceptable.json",
			gradeHistory: resolution.gradeHistory,
		})
		continue
	}
	const existing = knownBadByKey.get(key)
	if (existing === undefined) {
		knownBadByKey.set(key, {
			contract: CONTRACT_TAG,
			entryId: stableId([instance.artwork.contentSha256, paletteSignature(instance.palette)]),
			artwork: instance.artwork,
			palette: instance.palette,
			paletteSignature: paletteSignature(instance.palette),
			roleSignature: roleSignature(instance.palette),
			grades: resolution.distinctGrades,
			worstGrade: instance.grade,
			standingGrade: resolution.latestGrade,
			resolvedByRecency: resolution.resolvedByRecency,
			contested: resolution.tiedLatestGrades.length > 0,
			resolution,
			gradientAdvisory: GRADIENT_ADVISORY,
			evidence: [evidenceOf(instance)],
		})
	} else {
		existing.evidence.push(evidenceOf(instance))
		if (SEVERITY[instance.grade] > SEVERITY[existing.worstGrade]) existing.worstGrade = instance.grade
	}
}
const knownBad = [...knownBadByKey.values()]
	.map((entry) => ({ ...entry, evidence: entry.evidence.sort((a, b) => a.warehouseLine - b.warehouseLine) }))
	.sort((a, b) => (a.artwork.imagePath + a.paletteSignature < b.artwork.imagePath + b.paletteSignature ? -1 : 1))

/* --- endorsements ------------------------------------------------------------- */

type EndorsementKind = "correction-endorsed-sample" | "grade-strong" | "grade-acceptable"
type EndorsementEntry = {
	contract: typeof CONTRACT_TAG
	entryId: string
	kind: EndorsementKind
	artwork: ArtworkIdentity
	palette: PaletteEntry
	paletteSignature: string
	roleSignature: string
	/** present on grade-strong and grade-acceptable entries — the recency resolution for this pair */
	resolution?: Resolution
	/** the pair's standing grade under the recency rule (null only on an unresolved timestamp tie) */
	standingGrade?: Grade | null
	resolvedByRecency?: boolean
	/** true when this entry's own grade has been superseded by a later, different grade */
	supersededByLaterGrade?: boolean
	/** true only on an unresolved identical-timestamp conflict */
	contested?: boolean
	uniqueBest: false
	gradientAdvisory: string
	epistemology: string
	evidence: Evidence[]
}

/** [REVIEWED] research/v2-3-eval/README.md: `correctionsKind: "endorsed-sample"`. */
const CORRECTION_EPISTEMOLOGY =
	"One palette the reviewer would endorse — a sample from a possibly-multi-valid set, never an oracle. "
	+ "An empty or partial answer is not disagreement. Every hex was one of the swatches the review server "
	+ "offered for that image (an exact pixel of the artwork, or a color from a palette under review)."
/** [REVIEWED] PHASE_0_DECISIONS.md §5 + the warehouse's own censored/relative epistemology. */
const STRONG_EPISTEMOLOGY =
	"Graded `strong` — the era's top absolute grade, awarded to the preferred side of a blinded pair "
	+ "(or to both sides when the reviewer answered equal). strong ≠ unique-best: the grade is relative to "
	+ "what the reviewer happened to be shown, several palettes can be valid for one artwork, and the same "
	+ "palette was sometimes graded differently in different comparisons."

const endorsementsByKey = new Map<string, EndorsementEntry>()

for (const instance of corrections) {
	const key = `correction\u0000${instance.artwork.contentSha256}\u0000${paletteSignature(instance.palette)}`
	const existing = endorsementsByKey.get(key)
	const evidence: Evidence = {
		warehouseLine: instance.line,
		batch: instance.record.batch,
		label: null,
		recordedAt: instance.record.recordedAt,
		comparison: instance.record.comparison,
		verdict: instance.record.verdict ?? null,
		preferredLabel: instance.record.preference?.label ?? null,
		tags: [...(instance.record.tags ?? [])].sort(),
		notes: instance.record.notes ?? "",
		...(instance.record.source === undefined ? {} : { source: instance.record.source }),
	}
	if (existing === undefined) {
		endorsementsByKey.set(key, {
			contract: CONTRACT_TAG,
			entryId: stableId(["correction", instance.artwork.contentSha256, paletteSignature(instance.palette)]),
			kind: "correction-endorsed-sample",
			artwork: instance.artwork,
			palette: instance.palette,
			paletteSignature: paletteSignature(instance.palette),
			roleSignature: roleSignature(instance.palette),
			uniqueBest: false,
			gradientAdvisory: GRADIENT_ADVISORY,
			epistemology: CORRECTION_EPISTEMOLOGY,
			evidence: [evidence],
		})
	} else existing.evidence.push(evidence)
}

/**
 * [REVIEWED] Verifier caveat, 2026-08-02: these fixtures are consumed mechanically, so **file
 * membership must be the signal**. A palette whose standing grade is bad does not belong in a
 * good-tier file at all, even flagged as superseded history — a consumer reading endorsements.json
 * must never have to filter on standingGrade to avoid endorsing something the reviewer downgraded.
 * Its full history survives in the matching known-bad entry's resolution.gradeHistory, and it is
 * listed in meta.droppedAsStandingBad so nothing disappears silently.
 */
type DroppedAsStandingBad = {
	entryId: string
	kind: EndorsementKind
	imagePath: string
	contentSha256: string
	roleSignature: string
	ownGrade: Grade
	standingGrade: Grade | null
	standingRecordedAt: string
	nowLivesIn: string
	gradeHistory: GradeHistoryRow[]
}
const droppedAsStandingBad: DroppedAsStandingBad[] = []

function dropAsStandingBad(
	instance: GradedInstance,
	kind: EndorsementKind,
	idPrefix: string,
	resolution: Resolution,
): void {
	const entryId = stableId([idPrefix, instance.artwork.contentSha256, paletteSignature(instance.palette)])
	if (droppedAsStandingBad.some((row) => row.entryId === entryId)) return
	droppedAsStandingBad.push({
		entryId,
		kind,
		imagePath: instance.artwork.imagePath,
		contentSha256: instance.artwork.contentSha256,
		roleSignature: roleSignature(instance.palette),
		ownGrade: instance.grade,
		standingGrade: resolution.latestGrade,
		standingRecordedAt: resolution.latestRecordedAt,
		nowLivesIn: "known-bad.json",
		gradeHistory: resolution.gradeHistory,
	})
}

for (const instance of graded) {
	if (instance.grade !== ENDORSING_GRADE) continue
	const resolution = resolutionOf(contestKey(instance.artwork, instance.palette), instance.grade)
	if (belongsInKnownBad(resolution)) {
		// A later comparison graded this exact palette bad. It is a known-bad entry, not an
		// endorsement, so it is absent from this file entirely rather than present-but-flagged.
		dropAsStandingBad(instance, "grade-strong", "strong", resolution)
		continue
	}
	const key = `strong\u0000${instance.artwork.contentSha256}\u0000${paletteSignature(instance.palette)}`
	const existing = endorsementsByKey.get(key)
	if (existing === undefined) {
		endorsementsByKey.set(key, {
			contract: CONTRACT_TAG,
			entryId: stableId(["strong", instance.artwork.contentSha256, paletteSignature(instance.palette)]),
			kind: "grade-strong",
			artwork: instance.artwork,
			palette: instance.palette,
			paletteSignature: paletteSignature(instance.palette),
			roleSignature: roleSignature(instance.palette),
			resolution,
			standingGrade: resolution.latestGrade,
			resolvedByRecency: resolution.resolvedByRecency,
			supersededByLaterGrade: resolution.supersededByLaterGrade,
			contested: resolution.tiedLatestGrades.length > 0,
			uniqueBest: false,
			gradientAdvisory: GRADIENT_ADVISORY,
			epistemology: STRONG_EPISTEMOLOGY,
			evidence: [evidenceOf(instance)],
		})
	} else existing.evidence.push(evidenceOf(instance))
}

const sortEntries = (entries: EndorsementEntry[]): EndorsementEntry[] => entries
	.map((entry) => ({ ...entry, evidence: entry.evidence.sort((a, b) => a.warehouseLine - b.warehouseLine) }))
	.sort((a, b) => {
		const left = `${a.kind}\u0000${a.artwork.imagePath}\u0000${a.paletteSignature}`
		const right = `${b.kind}\u0000${b.artwork.imagePath}\u0000${b.paletteSignature}`
		return left < right ? -1 : 1
	})

const endorsements = sortEntries([...endorsementsByKey.values()])

/* --- acceptable: the "not-rejected" baseline tier ----------------------------- */

/**
 * [REVIEWED] Orchestrator decision 2026-08-02 (open question 4): baseline tier only.
 * Matching one of these means "the reviewer once found this palette acceptable" — nothing stronger.
 */
const ACCEPTABLE_PURPOSE =
	"A NOT-REJECTED BASELINE TIER FOR THE CONCORDANCE DASHBOARD ONLY. These are explicitly NOT "
	+ "endorsements: matching one of these entries means 'the reviewer once found this palette "
	+ "acceptable' and nothing stronger. Never a gate, never a fitting target, never evidence that a "
	+ "palette is good. Endorsements live in endorsements.json; this tier sits below them."
const ACCEPTABLE_EPISTEMOLOGY =
	"Graded `acceptable` — the reviewer found this palette acceptable on this rendition, in one comparison, "
	+ "and nothing stronger. NOT an endorsement: it was not called good and carries no claim that it is a "
	+ "target worth reaching. A not-rejected baseline tier for the concordance dashboard only."

const acceptableByKey = new Map<string, EndorsementEntry>()
for (const instance of graded) {
	if (instance.grade !== BASELINE_GRADE) continue
	const resolution = resolutionOf(contestKey(instance.artwork, instance.palette), instance.grade)
	if (belongsInKnownBad(resolution)) {
		// Standing grade is bad: this palette belongs in known-bad.json, not in the baseline tier.
		dropAsStandingBad(instance, "grade-acceptable", "acceptable", resolution)
		continue
	}
	const key = `acceptable ${instance.artwork.contentSha256} ${paletteSignature(instance.palette)}`
	const existing = acceptableByKey.get(key)
	if (existing === undefined) {
		acceptableByKey.set(key, {
			contract: CONTRACT_TAG,
			entryId: stableId(["acceptable", instance.artwork.contentSha256, paletteSignature(instance.palette)]),
			kind: "grade-acceptable",
			artwork: instance.artwork,
			palette: instance.palette,
			paletteSignature: paletteSignature(instance.palette),
			roleSignature: roleSignature(instance.palette),
			resolution,
			standingGrade: resolution.latestGrade,
			resolvedByRecency: resolution.resolvedByRecency,
			supersededByLaterGrade: resolution.supersededByLaterGrade,
			contested: resolution.tiedLatestGrades.length > 0,
			uniqueBest: false,
			gradientAdvisory: GRADIENT_ADVISORY,
			epistemology: ACCEPTABLE_EPISTEMOLOGY,
			evidence: [evidenceOf(instance)],
		})
	} else existing.evidence.push(evidenceOf(instance))
}
const acceptable = sortEntries([...acceptableByKey.values()])

/* --- identical-timestamp conflicts (the only case recency cannot decide) ------- */

/**
 * Checked, not assumed. A conflict here means two different grades were recorded for the same
 * (artwork, exact palette) at the same instant, which the recency rule cannot break.
 */
const identicalTimestampConflicts = [...historyByKey.entries()]
	.map(([key, instances]) => ({ key, resolution: resolutionOf(key, instances[0]!.grade) }))
	.filter(({ resolution }) => resolution.tiedLatestGrades.length > 0)
	.map(({ key, resolution }) => ({
		contentSha256: key.slice(0, key.indexOf("\u0000")),
		tiedGrades: resolution.tiedLatestGrades,
		recordedAt: resolution.latestRecordedAt,
		gradeHistory: resolution.gradeHistory,
	}))

/* --- cross-fixture overlap ---------------------------------------------------- */

const knownBadRoleSignatures = new Set(knownBad.map((entry) => `${entry.artwork.contentSha256}\u0000${entry.roleSignature}`))
const matchesKnownBad = (entry: EndorsementEntry): boolean =>
	knownBadRoleSignatures.has(`${entry.artwork.contentSha256}\u0000${entry.roleSignature}`)
const acceptableOverlap = acceptable.filter(matchesKnownBad)
const overlapRows = (entries: EndorsementEntry[]) => entries.map((e) =>
	({ entryId: e.entryId, kind: e.kind, imagePath: e.artwork.imagePath, roleSignature: e.roleSignature }))
const overlap = endorsements.filter((entry) =>
	knownBadRoleSignatures.has(`${entry.artwork.contentSha256}\u0000${entry.roleSignature}`))

/* --- write -------------------------------------------------------------------- */

const meta = {
	contract: CONTRACT_TAG,
	generatedBy: "research/v3/src/legacy/distill-legacy-verdicts.ts",
	policy: "research/v3/PHASE_0_DECISIONS.md §5 — not a verdict store; a data input for mechanical checks only",
	source: {
		warehouse: "research/v2-3-eval/data/verdicts.jsonl",
		batches: "research/v2-3-eval/data/batches/",
		results: "research/v2-3-eval/data/results/",
	},
	gradeVocabulary: GRADE_VOCABULARY,
	gradientAdvisory: GRADIENT_ADVISORY,
	matchSemantics: MATCH_SEMANTICS,
	counts,
}

await mkdir(OUT_ROOT, { recursive: true })
await writeFile(
	join(OUT_ROOT, "known-bad.json"),
	`${JSON.stringify({
		meta: {
			...meta,
			fixture: "known-bad",
			consumedBy: "known-worse gate (PHASE_0_DECISIONS.md §3)",
			selection: `verdict in {${BAD_GRADES.join(", ")}}, applied to the labels listed in verdictApplies`,
			gatePolicy: GATE_POLICY,
			recencyRule: RECENCY_RULE,
			entryCount: knownBad.length,
			contestedEntryCount: knownBad.filter((entry) => entry.contested).length,
			hardGateEntryCount: knownBad.filter((entry) => !entry.contested).length,
			resolvedByRecencyEntryCount: knownBad.filter((entry) => entry.resolvedByRecency).length,
			droppedByRecency: [...droppedByRecency.values()]
				.sort((a, b) => (a.imagePath + a.roleSignature < b.imagePath + b.roleSignature ? -1 : 1)),
			identicalTimestampConflicts: identicalTimestampConflicts,
			unrecoverable: unresolvable,
		},
		entries: knownBad,
	}, null, "\t")}\n`,
	"utf8",
)
await writeFile(
	join(OUT_ROOT, "endorsements.json"),
	`${JSON.stringify({
		meta: {
			...meta,
			fixture: "endorsements",
			consumedBy: "concordance dashboard and reachability diagnostics (PHASE_0_DECISIONS.md §3)",
			selection: "corrections (correctionsKind endorsed-sample) and palettes graded strong",
			entryCount: endorsements.length,
			entryCountByKind: {
				"correction-endorsed-sample": endorsements.filter((e) => e.kind === "correction-endorsed-sample").length,
				"grade-strong": endorsements.filter((e) => e.kind === "grade-strong").length,
			},
			contestedGradeStrongCount: endorsements.filter((e) => e.contested === true).length,
			membershipRule: MEMBERSHIP_RULE,
			overlapWithKnownBadByRoleSignature: overlapRows(overlap),
			droppedAsStandingBad: droppedAsStandingBad.filter((row) => row.kind === "grade-strong"),
			unrecoverable: unresolvable,
		},
		entries: endorsements,
	}, null, "\t")}\n`,
	"utf8",
)
await writeFile(
	join(OUT_ROOT, "acceptable.json"),
	`${JSON.stringify({
		meta: {
			...meta,
			fixture: "acceptable",
			purpose: ACCEPTABLE_PURPOSE,
			consumedBy: "concordance dashboard only (PHASE_0_DECISIONS.md §3) — never a gate, never an endorsement",
			selection: `verdict == ${BASELINE_GRADE}, applied to the labels listed in verdictApplies`,
			entryCount: acceptable.length,
			entryCountByKind: { "grade-acceptable": acceptable.length },
			contestedEntryCount: acceptable.filter((e) => e.contested === true).length,
			membershipRule: MEMBERSHIP_RULE,
			overlapWithKnownBadByRoleSignature: overlapRows(acceptableOverlap),
			droppedAsStandingBad: droppedAsStandingBad.filter((row) => row.kind === "grade-acceptable"),
			unrecoverable: unresolvable,
		},
		entries: acceptable,
	}, null, "\t")}\n`,
	"utf8",
)

if (!values.quiet) {
	const report = {
		...counts,
		knownBadEntries: knownBad.length,
		knownBadContested: knownBad.filter((e) => e.contested).length,
		knownBadHardGate: knownBad.filter((e) => !e.contested).length,
		knownBadResolvedByRecency: knownBad.filter((e) => e.resolvedByRecency).length,
		knownBadDroppedByRecency: droppedByRecency.size,
		identicalTimestampConflicts: identicalTimestampConflicts.length,
		droppedAsStandingBad: droppedAsStandingBad.length,
		acceptableEntries: acceptable.length,
		acceptableContested: acceptable.filter((e) => e.contested === true).length,
		acceptableOverlapEntries: acceptableOverlap.length,
		endorsementEntries: endorsements.length,
		endorsementCorrections: endorsements.filter((e) => e.kind === "correction-endorsed-sample").length,
		endorsementGradeStrong: endorsements.filter((e) => e.kind === "grade-strong").length,
		endorsementContested: endorsements.filter((e) => e.contested === true).length,
		overlapEntries: overlap.length,
		unrecoverableRecords: unresolvable.length,
		distinctArtworks: artworkCache.size,
	}
	process.stdout.write(`${JSON.stringify(report, null, "\t")}\n`)
	process.stdout.write(`wrote ${join(OUT_ROOT, "known-bad.json")}\n`)
	process.stdout.write(`wrote ${join(OUT_ROOT, "endorsements.json")}\n`)
	process.stdout.write(`wrote ${join(OUT_ROOT, "acceptable.json")}\n`)
}
