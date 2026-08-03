/**
 * Build the oracle premise-test evaluation set: the artworks for which the v2-3 verdict
 * warehouse already holds a human-accepted gradient boolean.
 *
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/oracle/premise/build-eval-set.ts [--out <file>] [--quiet]
 *
 * Why this exists (V3_PLAN.md §5, step 1): before building any oracle machinery, run the VLM
 * against the one place existing human data directly checks the hard question — the gradient
 * boolean. This script produces the ground-truth side of that comparison.
 *
 * WHAT THE GROUND TRUTH ACTUALLY IS — read this before trusting a number computed from it.
 * The reviewer never answered "does this artwork have a gradient?" in the abstract. The
 * reviewer graded *palettes*, and every palette carries a `gradient` boolean that the v2-3
 * algorithm decided. A `strong` grade is the era's top absolute grade, so a strong-graded
 * palette's gradient boolean is a decision the reviewer looked at and accepted. That is
 * weaker than a direct label and stronger than nothing: it is an *accepted* decision, not an
 * elicited one, and the reviewer's attention was on the whole palette, not on that flag.
 * Every entry therefore carries its full evidence trail so a disagreement can be inspected
 * rather than merely counted.
 *
 * Selection rule, stated once (see SELECTION_RULE below for the version that ships in the file).
 */
import { createHash } from "node:crypto"
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { parseArgs } from "node:util"
import sharp from "sharp"

/* ------------------------------------------------------------------ constants */

/** [INHERITED] Repo layout: this file lives at research/v3/oracle/premise/. */
const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..")
/** [INHERITED] The v2-3 evaluation track — read-only for this workstream (CONVENTIONS.md). */
const EVAL_ROOT = join(REPO_ROOT, "research", "v2-3-eval")
const VERDICTS_PATH = join(EVAL_ROOT, "data", "verdicts.jsonl")
const BATCHES_ROOT = join(EVAL_ROOT, "data", "batches")
const RESULTS_ROOT = join(EVAL_ROOT, "data", "results")
/** [INHERITED] Cross-check input: the legacy-distillation workstream's output. Read-only. */
const ENDORSEMENTS_PATH = join(REPO_ROOT, "research", "v3", "data", "legacy", "endorsements.json")
/** [INHERITED] Owned output directory (CONVENTIONS.md path ownership). */
const DEFAULT_OUT = join(REPO_ROOT, "research", "v3", "data", "oracle-premise", "eval-set.json")

/**
 * [REVIEWED] The v2-3 grade vocabulary, from research/v2-3-eval/serve-review.ts:44.
 * Mirrored from research/v3/src/legacy/distill-legacy-verdicts.ts so the two agree by
 * construction rather than by luck.
 */
const GRADE_VOCABULARY = ["strong", "acceptable", "weak-fallback", "unacceptable"] as const
type Grade = (typeof GRADE_VOCABULARY)[number]

/** [REVIEWED] Grades that make a palette known-bad (distill-legacy-verdicts.ts:52). */
const BAD_GRADES: readonly Grade[] = ["weak-fallback", "unacceptable"]

/**
 * [REVIEWED] The only grade that counts as human acceptance here.
 * Matches the legacy distillation's ENDORSING_GRADE exactly: `acceptable` is NOT an
 * endorsement (PHASE_0_DECISIONS.md §5 and distill-legacy-verdicts.ts:53-59), so an
 * `acceptable` palette's gradient boolean is not evidence about the artwork.
 */
const ACCEPTING_GRADE: Grade = "strong"

/** [REVIEWED] Severity order, for reporting. Mirrors distill-legacy-verdicts.ts:661. */
const SEVERITY: Record<Grade, number> = { strong: 0, acceptable: 1, "weak-fallback": 2, unacceptable: 3 }

/** [INHERITED] The v2-3 role set. */
const ROLES = ["background", "surface", "foreground", "accent"] as const
type Role = (typeof ROLES)[number]

/**
 * [REVIEWED] Reviewer decision 2026-08-02, inherited verbatim from the legacy distillation
 * (distill-legacy-verdicts.ts:528). Applied here at two levels — see CONFLICT_RULE.
 */
const RECENCY_RULE =
	"Latest-timestamped grade wins (reviewer decision 2026-08-02). Where the same artwork and the same "
	+ "exact palette were graded more than once, the most recent grade is the pair's standing verdict; "
	+ "earlier grades are history, not live contradictions. Only conflicting grades sharing an identical "
	+ "timestamp stay unresolved, and those warn rather than block."

const SELECTION_RULE = [
	"INCLUSION. An artwork enters the evaluation set when the warehouse holds at least one palette for it",
	"that (a) was graded `strong` — the era's top absolute grade and the only one the legacy distillation",
	"exports as an endorsement — and (b) still has `strong` as its standing grade under the recency rule,",
	"i.e. no later comparison graded that exact palette `weak-fallback` or `unacceptable`. The artwork's",
	"gradient ground truth is that palette's `gradient` boolean: a gradient decision a human looked at and",
	"accepted.",
	"",
	"EXCLUSIONS, each counted in meta.counts:",
	"  - `acceptable` grades. Explicitly not endorsements (PHASE_0_DECISIONS.md §5). A not-rejected",
	"    palette is not an accepted gradient decision.",
	"  - Reviewer corrections (`correctionsKind: endorsed-sample`). They carry role hexes only; the v2-3",
	"    warehouse records no gradient boolean on a correction, so they contribute no ground truth here.",
	"  - Records whose image cannot be resolved to a file on disk (no batch entry, no cached result).",
	"  - Records whose stored content hash disagrees with the file now on disk (the palette was graded",
	"    against different bytes; the label does not transfer).",
	"  - Artworks the inference runtime cannot decode (checked separately by the runner's preflight, not",
	"    here) — recorded, never silently dropped.",
	"",
	"CONFLICTS. Two levels, both resolved the same way and both flagged:",
	"  1. Same artwork, same exact palette, graded more than once: the legacy distillation's recency rule",
	"     verbatim — latest recordedAt wins. A palette whose standing grade is bad never enters.",
	"  2. Same artwork, DIFFERENT accepted palettes disagreeing on the gradient boolean: this is not a",
	"     contradiction in the warehouse — several palettes can be valid for one artwork, and v2-3's own",
	"     gradient neutrality work shows both a flat and a gradient palette can be acceptable for the same",
	"     cover. The recency rule is extended to it (latest accepted observation wins) so the set has a",
	"     defensible single label per artwork, and the artwork is marked `conflicted: true` with its full",
	"     observation history. Report agreement both including and excluding these; if they are a material",
	"     share of any disagreement, that is a finding about the ground truth, not about the oracle.",
	"     An exact timestamp tie between disagreeing observations is `underdetermined` and is excluded",
	"     from the primary set (kept in the file, `included: false`).",
].join("\n")

/**
 * [REVIEWED] What the label means, stamped on the file so a later reader cannot over-read it.
 * Derived from distill-legacy-verdicts.ts:758 (STRONG_EPISTEMOLOGY) plus the gradient-specific caveat.
 */
const GROUND_TRUTH_EPISTEMOLOGY =
	"An ACCEPTED ALGORITHM DECISION, not an elicited human label. The reviewer graded palettes, not "
	+ "artworks; `strong` was awarded to the preferred side of a blinded pair (or to both sides on an "
	+ "`equal` answer). The gradient boolean is one field of a palette the reviewer accepted as a whole, "
	+ "so the reviewer's attention was on the palette, not necessarily on that flag. `strong` also does "
	+ "not mean unique-best: several palettes can be valid for one artwork, and the same palette was "
	+ "sometimes graded differently in different comparisons. Treat disagreement with the oracle as a "
	+ "prompt to look at the artwork, never as a proof that the oracle is wrong."

/**
 * [REVIEWED] Rendition scoping. v2-3 verdicts are scoped to the exact file that was rendered
 * (PHASE_0_DECISIONS.md §1: the palette attaches to the file, not the artwork), so the oracle must be
 * run on that same file. Where the same 24-char artwork id appears at two renditions the entries stay
 * separate and are flagged; agreement must then be computed per artwork, not per file (pipeline §7.2).
 */
const RENDITION_SCOPING =
	"Ground truth is scoped to the exact rendition the reviewer saw. Run the oracle on `image.absolutePath` "
	+ "and nothing else. Where two entries share `artworkId`, they are two renditions of one artwork: "
	+ "aggregate per artworkId before quoting an agreement rate (pipeline doc §7.2)."

/** [MEASURED] Words that make a free-text note gradient-relevant. Human audit only, never read by code. */
const GRADIENT_NOTE_PATTERN =
	/gradient|grad\b|ramp|midpoint|mid-point|stop\b|stops\b|shad(e|ed|ing|ow)|blend|band(ing)?|flat\b|two[- ]tone|duotone|vignette|smooth/i

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
	palettes?: Record<string, SourcePalette>
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

/* ------------------------------------------------------------------ helpers */

function invariant(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

/**
 * The 24-character artwork id inside a 40-hex sharded filename (pipeline doc §7.1: a 16-char
 * rendition prefix followed by a 24-char artwork id). Anything else is its own identity.
 */
function artworkIdOf(imagePath: string): { artworkId: string; scheme: "sharded-suffix" | "filename" } {
	const name = basename(imagePath).replace(/\.[^.]+$/u, "")
	if (/^[0-9a-f]{40}$/u.test(name)) return { artworkId: name.slice(16), scheme: "sharded-suffix" }
	return { artworkId: name, scheme: "filename" }
}

/* ------------------------------------------------------------------ input indices */

type BatchItem = { image: string; imagePath?: string }

/** (batch name, image) -> batch item. Same resolution order as the legacy distillation. */
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

/** image id -> repo-relative path, from cached corpus results. Fallback when the batch has no file. */
async function readResultsIndex(): Promise<Map<string, string>> {
	const index = new Map<string, string>()
	const conflicts = new Set<string>()
	for (const label of (await readdir(RESULTS_ROOT, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
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

type ImageIdentity = {
	imageId: string
	imagePath: string
	absolutePath: string
	sha256: string
	byteCount: number
	format: string
	width: number
	height: number
	longEdgePx: number
	artworkId: string
	artworkIdScheme: "sharded-suffix" | "filename"
}

const imageCache = new Map<string, ImageIdentity>()

/** Identity is full path + content hash; dimensions come from the header, never the filename. */
async function resolveImage(imagePath: string): Promise<ImageIdentity> {
	const cached = imageCache.get(imagePath)
	if (cached !== undefined) return cached
	const absolutePath = join(REPO_ROOT, imagePath)
	const bytes = await readFile(absolutePath)
	const metadata = await sharp(bytes).metadata()
	invariant(typeof metadata.width === "number" && typeof metadata.height === "number",
		`no dimensions in header for ${imagePath}`)
	const { artworkId, scheme } = artworkIdOf(imagePath)
	const identity: ImageIdentity = {
		imageId: basename(imagePath),
		imagePath,
		absolutePath,
		sha256: createHash("sha256").update(bytes).digest("hex"),
		byteCount: bytes.byteLength,
		format: metadata.format ?? "unknown",
		width: metadata.width,
		height: metadata.height,
		longEdgePx: Math.max(metadata.width, metadata.height),
		artworkId,
		artworkIdScheme: scheme,
	}
	imageCache.set(imagePath, identity)
	return identity
}

/* ------------------------------------------------------------------ palette shaping */

/** Signature of an exact palette — the recency rule's key, verbatim from the legacy distillation. */
function paletteSignature(palette: SourcePalette): string {
	const roles = ROLES.map((role) => `${role}=${palette[role].hex.toLowerCase()}`).join(",")
	const gradient = palette.gradient ? "g1" : "g0"
	const midpoint = palette.midpoint === null ? "m-" : `m${palette.midpoint.toLowerCase()}`
	const collapse = `c${palette.collapse.surface ? 1 : 0}${palette.collapse.accent ? 1 : 0}`
	return `${roles}|${gradient}|${midpoint}|${collapse}`
}

/** Signature for a hand-recorded record that carries bare hexes instead of a full palette. */
function hexPaletteSignature(hexes: Partial<Record<Role, string>>, gradient: boolean | null): string {
	const roles = ROLES.map((role) => `${role}=${hexes[role]?.toLowerCase() ?? "-"}`).join(",")
	return `${roles}|${gradient === null ? "g?" : gradient ? "g1" : "g0"}|m-|c?`
}

/* ------------------------------------------------------------------ main */

const { values } = parseArgs({
	options: { out: { type: "string" }, quiet: { type: "boolean", default: false } },
	strict: true,
})
const OUT_PATH = values.out === undefined ? DEFAULT_OUT : resolve(values.out)

const batchIndex = await readBatchIndex()
const resultsIndex = await readResultsIndex()

const lines = (await readFile(VERDICTS_PATH, "utf8")).split("\n").filter((line) => line.trim() !== "")
const records = lines.map((line, i) => ({ line: i + 1, record: JSON.parse(line) as VerdictRecord }))

const counts = {
	warehouseRecords: records.length,
	gradedPaletteInstances: 0,
	strongPaletteInstances: 0,
	acceptablePaletteInstancesSkipped: 0,
	badPaletteInstancesSkipped: 0,
	correctionRecordsSkipped: 0,
	imageUnresolvable: 0,
	contentHashVerified: 0,
	contentHashMismatchSkipped: 0,
	strongInstancesDroppedByRecency: 0,
	handRecordedStrongInstances: 0,
	observationsAccepted: 0,
}

type Observation = {
	warehouseLine: number
	recordedAt: string
	batch: string
	label: string
	comparison: string
	gradient: boolean
	paletteSignature: string
	roles: Record<Role, string>
	midpoint: string | null
	collapse: { surface: boolean; accent: boolean } | null
	tags: string[]
	notes: string
	/** true when the exact palette carried a different grade at some earlier point */
	regradedHistory: { recordedAt: string; grade: Grade; batch: string; warehouseLine: number }[]
}

/* --- pass 1: every graded palette instance, keyed for the recency rule -------- */

type GradedInstance = {
	line: number
	record: VerdictRecord
	label: string
	grade: Grade
	image: ImageIdentity
	signature: string
	gradient: boolean | null
}
const graded: GradedInstance[] = []
const unresolvable: { warehouseLine: number; batch: string; image: string | null; reason: string }[] = []

for (const { line, record } of records) {
	const grade = record.verdict ?? null
	const hasEmbedded = record.palettes !== undefined && Object.keys(record.palettes).length > 0
	const hasHexOnly = record.palette !== undefined && Object.keys(record.palette).length > 0
	if (record.correctionsKind === "endorsed-sample" && Object.keys(record.corrections ?? {}).length > 0) {
		counts.correctionRecordsSkipped += 1
	}
	if (grade === null || (!hasEmbedded && !hasHexOnly)) continue

	const imageName = record.image
	if (typeof imageName !== "string" || imageName === "") {
		counts.imageUnresolvable += 1
		unresolvable.push({ warehouseLine: line, batch: record.batch, image: null, reason: "record carries no image name" })
		continue
	}
	const fromBatch = batchIndex.get(`${record.batch}\u0000${imageName}`)
	const imagePath = fromBatch?.imagePath ?? resultsIndex.get(imageName) ?? null
	if (imagePath === null) {
		counts.imageUnresolvable += 1
		unresolvable.push({
			warehouseLine: line,
			batch: record.batch,
			image: imageName,
			reason: "no repo-relative path recoverable from batch files or cached results",
		})
		continue
	}
	const image = await resolveImage(imagePath)
	if (typeof record.imageSha256 === "string") {
		counts.contentHashVerified += 1
		if (record.imageSha256 !== image.sha256) {
			counts.contentHashMismatchSkipped += 1
			unresolvable.push({
				warehouseLine: line,
				batch: record.batch,
				image: imageName,
				reason: `stored imageSha256 ${record.imageSha256.slice(0, 12)}… does not match the file on disk`,
			})
			continue
		}
	}

	if (hasEmbedded) {
		for (const label of record.verdictApplies ?? []) {
			const source = record.palettes?.[label]
			if (source === undefined) continue
			counts.gradedPaletteInstances += 1
			graded.push({
				line, record, label, grade, image,
				signature: paletteSignature(source),
				gradient: source.gradient,
			})
		}
	} else {
		counts.gradedPaletteInstances += 1
		counts.handRecordedStrongInstances += grade === ACCEPTING_GRADE ? 1 : 0
		const label = (record.verdictApplies ?? [])[0] ?? record.labels?.[0] ?? "(unlabelled)"
		graded.push({
			line, record, label, grade, image,
			signature: hexPaletteSignature(record.palette ?? {}, record.gradient ?? null),
			gradient: record.gradient ?? null,
		})
	}
}

/* --- the recency rule, at the (image, exact palette) level -------------------- */

const historyByKey = new Map<string, GradedInstance[]>()
for (const instance of graded) {
	const key = `${instance.image.sha256}\u0000${instance.signature}`
	const list = historyByKey.get(key) ?? []
	list.push(instance)
	historyByKey.set(key, list)
}

function standingGradeOf(key: string): { latest: Grade | null; tied: Grade[]; history: GradedInstance[] } {
	const history = (historyByKey.get(key) ?? []).slice().sort((a, b) => (
		a.record.recordedAt === b.record.recordedAt ? a.line - b.line : (a.record.recordedAt < b.record.recordedAt ? -1 : 1)
	))
	const latestAt = history.reduce((latest, i) => (i.record.recordedAt > latest ? i.record.recordedAt : latest), "")
	const atLatest = [...new Set(history.filter((i) => i.record.recordedAt === latestAt).map((i) => i.grade))]
	return atLatest.length > 1
		? { latest: null, tied: atLatest, history }
		: { latest: atLatest[0] ?? null, tied: [], history }
}

/* --- pass 2: accepted observations, grouped per image ------------------------- */

const observationsByImage = new Map<string, { image: ImageIdentity; observations: Observation[] }>()

for (const instance of graded) {
	if (instance.grade !== ACCEPTING_GRADE) {
		if (instance.grade === "acceptable") counts.acceptablePaletteInstancesSkipped += 1
		else counts.badPaletteInstancesSkipped += 1
		continue
	}
	counts.strongPaletteInstances += 1
	if (instance.gradient === null) continue

	const key = `${instance.image.sha256}\u0000${instance.signature}`
	const standing = standingGradeOf(key)
	const standingIsBad = standing.tied.length > 0
		? standing.tied.some((g) => BAD_GRADES.includes(g))
		: standing.latest !== null && BAD_GRADES.includes(standing.latest)
	if (standingIsBad) {
		counts.strongInstancesDroppedByRecency += 1
		continue
	}

	const source = instance.record.palettes?.[instance.label]
	const bucket = observationsByImage.get(instance.image.sha256)
		?? { image: instance.image, observations: [] }
	bucket.observations.push({
		warehouseLine: instance.line,
		recordedAt: instance.record.recordedAt,
		batch: instance.record.batch,
		label: instance.label,
		comparison: instance.record.comparison,
		gradient: instance.gradient,
		paletteSignature: instance.signature,
		roles: Object.fromEntries(ROLES.map((role) => [
			role,
			source === undefined ? (instance.record.palette?.[role] ?? "-") : source[role].hex.toLowerCase(),
		])) as Record<Role, string>,
		midpoint: source?.midpoint ?? null,
		collapse: source === undefined ? null : { ...source.collapse },
		tags: [...(instance.record.tags ?? [])].sort(),
		notes: instance.record.notes ?? "",
		regradedHistory: standing.history.length > 1
			? standing.history.map((h) => ({
				recordedAt: h.record.recordedAt, grade: h.grade, batch: h.record.batch, warehouseLine: h.line,
			}))
			: [],
	})
	observationsByImage.set(instance.image.sha256, bucket)
	counts.observationsAccepted += 1
}

/* --- every note in the warehouse for these images, for human audit ------------ */

const notesByImageSha = new Map<string, { warehouseLine: number; recordedAt: string; batch: string; verdict: Grade | null; tags: string[]; note: string }[]>()
for (const { line, record } of records) {
	const note = (record.notes ?? "").trim()
	if (note === "") continue
	const imageName = record.image
	if (typeof imageName !== "string" || imageName === "") continue
	const fromBatch = batchIndex.get(`${record.batch}\u0000${imageName}`)
	const imagePath = fromBatch?.imagePath ?? resultsIndex.get(imageName) ?? null
	if (imagePath === null) continue
	const image = imageCache.get(imagePath)
	if (image === undefined) continue
	if (!observationsByImage.has(image.sha256)) continue
	const list = notesByImageSha.get(image.sha256) ?? []
	list.push({
		warehouseLine: line,
		recordedAt: record.recordedAt,
		batch: record.batch,
		verdict: record.verdict ?? null,
		tags: [...(record.tags ?? [])].sort(),
		note,
	})
	notesByImageSha.set(image.sha256, list)
}

/* --- resolve one label per image ---------------------------------------------- */

type Entry = {
	entryId: string
	included: boolean
	exclusionReason: string | null
	image: ImageIdentity
	groundTruth: {
		gradient: boolean | null
		agreementAmongAcceptedPalettes: "unanimous" | "conflicted-resolved-by-recency" | "underdetermined"
		observationCount: number
		observationsTrue: number
		observationsFalse: number
		decidedByRecordedAt: string
		conflicted: boolean
	}
	observations: Observation[]
	notes: { gradientRelevant: typeof gradientRelevantSample; other: typeof gradientRelevantSample }
	regradedInHistory: boolean
}
type NoteRow = { warehouseLine: number; recordedAt: string; batch: string; verdict: Grade | null; tags: string[]; note: string }
let gradientRelevantSample: NoteRow[] = []

const entries: Entry[] = []
for (const [sha, bucket] of observationsByImage) {
	const sorted = bucket.observations.slice().sort((a, b) => (
		a.recordedAt === b.recordedAt ? a.warehouseLine - b.warehouseLine : (a.recordedAt < b.recordedAt ? -1 : 1)
	))
	const distinct = new Set(sorted.map((o) => o.gradient))
	const latestAt = sorted[sorted.length - 1]!.recordedAt
	const atLatest = [...new Set(sorted.filter((o) => o.recordedAt === latestAt).map((o) => o.gradient))]

	let gradient: boolean | null
	let agreement: Entry["groundTruth"]["agreementAmongAcceptedPalettes"]
	let included: boolean
	let exclusionReason: string | null = null
	if (distinct.size === 1) {
		gradient = sorted[0]!.gradient
		agreement = "unanimous"
		included = true
	} else if (atLatest.length === 1) {
		gradient = atLatest[0]!
		agreement = "conflicted-resolved-by-recency"
		included = true
	} else {
		gradient = null
		agreement = "underdetermined"
		included = false
		exclusionReason = "accepted palettes disagree on the gradient boolean at an identical latest timestamp; recency cannot decide"
	}

	const allNotes = (notesByImageSha.get(sha) ?? []).sort((a, b) => a.warehouseLine - b.warehouseLine)
	entries.push({
		entryId: createHash("sha256").update(`${sha}\u0000premise-eval`).digest("hex").slice(0, 16),
		included,
		exclusionReason,
		image: bucket.image,
		groundTruth: {
			gradient,
			agreementAmongAcceptedPalettes: agreement,
			observationCount: sorted.length,
			observationsTrue: sorted.filter((o) => o.gradient).length,
			observationsFalse: sorted.filter((o) => !o.gradient).length,
			decidedByRecordedAt: latestAt,
			conflicted: distinct.size > 1,
		},
		observations: sorted,
		notes: {
			gradientRelevant: allNotes.filter((n) => GRADIENT_NOTE_PATTERN.test(n.note)),
			other: allNotes.filter((n) => !GRADIENT_NOTE_PATTERN.test(n.note)),
		},
		regradedInHistory: sorted.some((o) => o.regradedHistory.length > 0),
	})
}
entries.sort((a, b) => (a.image.imagePath < b.image.imagePath ? -1 : 1))

/* --- cross-check against the legacy distillation ------------------------------ */

let crossCheck: Record<string, unknown>
try {
	const legacy = JSON.parse(await readFile(ENDORSEMENTS_PATH, "utf8")) as
		{ entries: { kind: string; artwork: { contentSha256: string } }[] }
	const legacyShas = new Set(legacy.entries.filter((e) => e.kind === "grade-strong").map((e) => e.artwork.contentSha256))
	const ours = new Set(entries.map((e) => e.image.sha256))
	crossCheck = {
		source: "research/v3/data/legacy/endorsements.json (kind = grade-strong)",
		legacyDistinctImages: legacyShas.size,
		thisFileDistinctImages: ours.size,
		inLegacyNotHere: [...legacyShas].filter((s) => !ours.has(s)).length,
		hereNotInLegacy: [...ours].filter((s) => !legacyShas.has(s)).length,
		note: "Both sides apply the same grade filter and the same recency rule, so the two sets must match. "
			+ "A non-zero difference means one of the two drifted and must be investigated before the run.",
	}
} catch (error) {
	crossCheck = { error: `could not read ${ENDORSEMENTS_PATH}: ${(error as Error).message}` }
}

/* --- artwork-level view (pipeline doc §7.2) ----------------------------------- */

const byArtwork = new Map<string, Entry[]>()
for (const entry of entries) {
	const list = byArtwork.get(entry.image.artworkId) ?? []
	list.push(entry)
	byArtwork.set(entry.image.artworkId, list)
}
const multiRendition = [...byArtwork.entries()]
	.filter(([, list]) => list.length > 1)
	.map(([artworkId, list]) => ({
		artworkId,
		renditions: list.map((e) => ({ imagePath: e.image.imagePath, longEdgePx: e.image.longEdgePx, gradient: e.groundTruth.gradient })),
		labelsAgree: new Set(list.map((e) => e.groundTruth.gradient)).size === 1,
	}))

/* --- write -------------------------------------------------------------------- */

const included = entries.filter((e) => e.included)
const summary = {
	entries: entries.length,
	included: included.length,
	excluded: entries.length - included.length,
	gradientTrue: included.filter((e) => e.groundTruth.gradient === true).length,
	gradientFalse: included.filter((e) => e.groundTruth.gradient === false).length,
	unanimous: included.filter((e) => e.groundTruth.agreementAmongAcceptedPalettes === "unanimous").length,
	conflictedResolvedByRecency: included.filter((e) => e.groundTruth.conflicted).length,
	underdetermined: entries.filter((e) => e.groundTruth.agreementAmongAcceptedPalettes === "underdetermined").length,
	distinctArtworks: byArtwork.size,
	multiRenditionArtworks: multiRendition.length,
	entriesWithGradientRelevantNotes: entries.filter((e) => e.notes.gradientRelevant.length > 0).length,
	byLongEdge: Object.fromEntries(
		Object.entries(included.reduce<Record<string, number>>((acc, e) => {
			acc[String(e.image.longEdgePx)] = (acc[String(e.image.longEdgePx)] ?? 0) + 1
			return acc
		}, {})).sort((a, b) => Number(a[0]) - Number(b[0])),
	),
	byFormat: included.reduce<Record<string, number>>((acc, e) => {
		acc[e.image.format] = (acc[e.image.format] ?? 0) + 1
		return acc
	}, {}),
}

await mkdir(dirname(OUT_PATH), { recursive: true })
await writeFile(OUT_PATH, `${JSON.stringify({
	meta: {
		purpose: "Ground-truth side of the oracle premise test (V3_PLAN.md §5, step 1).",
		generatedBy: "research/v3/oracle/premise/build-eval-set.ts",
		source: {
			warehouse: "research/v2-3-eval/data/verdicts.jsonl",
			batches: "research/v2-3-eval/data/batches/",
			results: "research/v2-3-eval/data/results/",
		},
		gradeVocabulary: GRADE_VOCABULARY,
		acceptingGrade: ACCEPTING_GRADE,
		selectionRule: SELECTION_RULE,
		recencyRule: RECENCY_RULE,
		groundTruthEpistemology: GROUND_TRUTH_EPISTEMOLOGY,
		renditionScoping: RENDITION_SCOPING,
		gradientNotePattern: GRADIENT_NOTE_PATTERN.source,
		summary,
		counts,
		crossCheckAgainstLegacyDistillation: crossCheck,
		multiRenditionArtworks: multiRendition,
		unresolvable,
	},
	entries,
}, null, "\t")}\n`, "utf8")

if (!values.quiet) {
	process.stdout.write(`${JSON.stringify({ summary, counts, crossCheck }, null, "\t")}\n`)
	process.stdout.write(`wrote ${OUT_PATH}\n`)
}
