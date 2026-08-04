/**
 * Loading the standing evidence corpus: the v2-3 legacy fixtures and the v3 warehouse.
 *
 * Two eras, one shape. Everything downstream sees `EvidenceEntry` and never has to know which file
 * or which regime an entry came from — except through `provenance.era`, which it must never average
 * over. That is the whole trick of principle 3: make the era impossible to lose, and impossible to
 * mistake for a gate.
 *
 * ## What is deliberately *not* done here
 *
 * The three legacy files are **not concatenated**. `data/legacy/README.md` is explicit: the two
 * good-tier files overlap each other by 31 keys, so concatenating double-counts. They are loaded as
 * separate tiers, and the overlap is raised as a `tier-overlap` conflict rather than de-duplicated
 * away — principle 2 again: the corpus contradicts itself and the reader gets told.
 */

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { relative, resolve as resolvePath } from "node:path"
import { fileURLToPath } from "node:url"
import { colorFromHex } from "../contract/index.ts"
import type { PaletteColor, RoleName } from "../contract/index.ts"
import { ROLE_NAMES } from "../contract/index.ts"
import { isDemoFixtureRecord } from "../warehouse/records.ts"
import type { Grade, PaletteSnapshot, VerdictRecord, WarehouseRecord } from "../warehouse/records.ts"
import { readAll, resolve as resolveAmendments } from "../warehouse/warehouse.ts"
import type {
	Conflict,
	EvidenceCorpus,
	EvidenceEntry,
	EvidenceEra,
	EvidenceResolution,
	EvidenceSource,
	EvidenceTier,
} from "./types.ts"

/** `research/v3`, derived from this file's location so the tool works from any cwd. */
export const V3_ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "")
/** The repository root. Output paths are relative to it, so a report is machine-independent. */
export const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url)).replace(/\/$/, "")

/** Where the legacy distillation lives. Owned by the legacy workstream; read-only here. */
export const DEFAULT_LEGACY_DIR = resolvePath(V3_ROOT, "data/legacy")
/** The v3 warehouse. Read-only here — adjudication never writes a record. */
export const DEFAULT_WAREHOUSE_FILE = resolvePath(V3_ROOT, "data/warehouse/warehouse.jsonl")

/**
 * The legacy grade vocabulary, mapped onto tiers.
 *
 * `[INHERITED]` — `data/legacy/README.md` "Grade vocabulary found in the source data". Note there is
 * no grade literally named `weak` in the v2-3 era; `weak-fallback` is its equivalent. The v3
 * warehouse *does* use `weak` (`src/warehouse/records.ts` `GRADES`), which is why both spellings are
 * here and why the two eras are loaded by separate functions rather than one forgiving parser.
 */
const GRADE_TO_TIER: Readonly<Record<string, EvidenceTier>> = {
	strong: "endorsement",
	acceptable: "acceptable",
	"weak-fallback": "known-bad",
	weak: "known-bad",
	unacceptable: "known-bad",
}

/** Which file holds which tier, in the legacy distillation. */
const LEGACY_TIER_FILES: readonly (readonly [EvidenceTier, string])[] = [
	["endorsement", "endorsements.json"],
	["known-bad", "known-bad.json"],
	["acceptable", "acceptable.json"],
]

function sha256OfFile(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function repoRelative(path: string): string {
	const rel = relative(REPO_ROOT, path)
	return rel.startsWith("..") ? path : rel
}

/**
 * Whole days between two ISO timestamps, floored. `null` when either is absent.
 *
 * Floored rather than rounded so "how old is this prior" never reads younger than it is.
 */
export function ageInDays(recordedAt: string | null, asOf: string | null): number | null {
	if (!recordedAt || !asOf) return null
	const from = Date.parse(recordedAt)
	const to = Date.parse(asOf)
	if (!Number.isFinite(from) || !Number.isFinite(to)) return null
	return Math.floor((to - from) / 86_400_000)
}

// ---------------------------------------------------------------------------------------------
// Legacy fixtures (era v2-3)
// ---------------------------------------------------------------------------------------------

type LegacyRole = { hex: string; rgb?: number[]; name?: string }

type LegacyEntry = {
	contract?: string
	entryId: string
	kind?: string
	artwork: {
		imagePath: string
		contentSha256: string
		rendition?: { format?: string; width?: number; height?: number }
	}
	palette: { completeness?: string; roles: Partial<Record<RoleName, LegacyRole>> }
	roleSignature: string
	standingGrade?: string | null
	contested?: boolean
	resolvedByRecency?: boolean
	supersededByLaterGrade?: boolean
	resolution?: {
		distinctGrades?: string[]
		latestRecordedAt?: string | null
		latestGrade?: string | null
		resolvedByRecency?: boolean
		supersededByLaterGrade?: boolean
		gradeHistory?: { recordedAt?: string; grade?: string; batch?: string; label?: string | null }[]
	}
	evidence?: { recordedAt?: string; notes?: string; batch?: string; label?: string | null }[]
}

function rolesFromLegacy(entry: LegacyEntry): Partial<Record<RoleName, PaletteColor>> {
	const roles: Partial<Record<RoleName, PaletteColor>> = {}
	for (const role of ROLE_NAMES) {
		const value = entry.palette.roles?.[role]
		if (value && typeof value.hex === "string") roles[role] = colorFromHex(value.hex)
	}
	return roles
}

function resolutionFromLegacy(entry: LegacyEntry): EvidenceResolution {
	const source = entry.resolution ?? {}
	const history = (source.gradeHistory ?? []).map((row) => ({
		recordedAt: row.recordedAt ?? null,
		grade: row.grade ?? null,
		batch: row.batch ?? null,
		label: row.label ?? null,
	}))
	return {
		standingGrade: entry.standingGrade ?? source.latestGrade ?? null,
		distinctGrades: [...(source.distinctGrades ?? [])].sort(),
		latestRecordedAt: source.latestRecordedAt ?? null,
		resolvedByRecency: Boolean(entry.resolvedByRecency ?? source.resolvedByRecency),
		supersededByLaterGrade: Boolean(entry.supersededByLaterGrade ?? source.supersededByLaterGrade),
		contested: Boolean(entry.contested),
		history,
	}
}

/**
 * Load one legacy tier file.
 *
 * The standing grade is taken as the source recorded it. This function does **not** re-run the
 * recency rule — the distillation already applied it, and re-deriving it here from a subset of the
 * warehouse would be a second, quieter answer to a question the reviewer already settled.
 */
export function loadLegacyTier(
	path: string,
	tier: EvidenceTier,
	asOf: string | null,
): { source: EvidenceSource; entries: EvidenceEntry[] } {
	const raw = JSON.parse(readFileSync(path, "utf8")) as { meta?: { contract?: string }; entries: LegacyEntry[] }
	const contract = raw.meta?.contract ?? "v2-3"
	const relPath = repoRelative(path)

	const entries = raw.entries.map((entry): EvidenceEntry => {
		const resolution = resolutionFromLegacy(entry)
		const recordedAt = resolution.latestRecordedAt ??
			entry.evidence?.map((row) => row.recordedAt ?? "").filter(Boolean).sort().at(-1) ?? null
		const notes = (entry.evidence ?? [])
			.map((row) => (row.notes ?? "").trim())
			.filter((note) => note.length > 0)
		return {
			entryId: entry.entryId,
			tier,
			provenance: {
				era: "v2-3",
				contract,
				sourceFile: relPath,
				recordedAt,
				ageDays: ageInDays(recordedAt, asOf),
			},
			artwork: {
				contentSha256: entry.artwork.contentSha256,
				imagePath: entry.artwork.imagePath,
				rendition: {
					format: entry.artwork.rendition?.format ?? null,
					width: entry.artwork.rendition?.width ?? null,
					height: entry.artwork.rendition?.height ?? null,
				},
			},
			roles: rolesFromLegacy(entry),
			completeness: entry.palette.completeness ?? "unknown",
			roleSignature: entry.roleSignature,
			resolution,
			notes,
		}
	})

	return {
		source: { tier, era: "v2-3", path: relPath, contentHash: sha256OfFile(path), entryCount: entries.length },
		entries,
	}
}

// ---------------------------------------------------------------------------------------------
// Warehouse (era v3)
// ---------------------------------------------------------------------------------------------

/** One graded palette instance pulled off a v3 record, before the recency rule runs. */
type V3Instance = {
	artwork: { path: string; sha256: string; format: string | null; width: number | null; height: number | null }
	roles: Partial<Record<RoleName, PaletteColor>>
	roleSignature: string
	grade: Grade | null
	recordedAt: string
	batch: string | null
	label: string | null
	note: string
	/** `true` for endorsed-sample records, which are endorsements regardless of any grade. */
	endorsedSample: boolean
}

function rolesFromSnapshot(snapshot: PaletteSnapshot): Partial<Record<RoleName, PaletteColor>> | null {
	const roles: Partial<Record<RoleName, PaletteColor>> = {}
	for (const role of ROLE_NAMES) {
		const value = snapshot[role]
		if (typeof value !== "string") return null
		try {
			roles[role] = colorFromHex(value.toLowerCase())
		} catch {
			return null
		}
	}
	return roles
}

function signatureOf(roles: Partial<Record<RoleName, PaletteColor>>): string {
	return ROLE_NAMES.map((role) => roles[role]?.hex ?? "-").join(",")
}

function instancesFromVerdict(record: VerdictRecord): V3Instance[] {
	const out: V3Instance[] = []
	const sides: readonly (readonly [{ palette?: PaletteSnapshot | null; variantId: string } | null, Grade | null])[] = [
		[record.sideA, record.gradeA],
		[record.sideB, record.gradeB],
	]
	for (const [side, grade] of sides) {
		if (!side?.palette || !grade) continue
		const roles = rolesFromSnapshot(side.palette)
		if (!roles) continue
		out.push({
			artwork: {
				path: record.artwork.path,
				sha256: record.artwork.sha256,
				format: record.artwork.rendition?.format ?? null,
				width: record.artwork.rendition?.width ?? null,
				height: record.artwork.rendition?.height ?? null,
			},
			roles,
			roleSignature: signatureOf(roles),
			grade,
			recordedAt: record.ts,
			batch: record.batch?.id ?? null,
			label: side.variantId,
			note: record.comment ?? "",
			endorsedSample: false,
		})
	}
	return out
}

/**
 * Build v3-era evidence from the warehouse.
 *
 * **Demo fixtures are excluded by default**, and the count of what was excluded is returned rather
 * than swallowed. `src/warehouse/records.ts` says why in as many words: counting them is how "how
 * many verdicts exist in v3" gets answered `8` when the honest answer is `0`. This tool would rather
 * report an empty current regime than a populated fake one — which is, today, exactly what it does.
 *
 * The recency rule is applied here, the same rule the legacy distillation applied: group by
 * (artwork content hash, exact role signature), sort the grade history by timestamp, and let the
 * latest grade decide which tier the entry lives in. Ties at the latest timestamp with disagreeing
 * grades are `contested` — reported, never silently broken.
 */
export function loadWarehouseEvidence(
	path: string,
	asOf: string | null,
	options: { includeDemoFixtures?: boolean } = {},
): { sources: EvidenceSource[]; entries: EvidenceEntry[]; excludedDemoFixtures: number } {
	let records: WarehouseRecord[]
	try {
		records = readAll(path)
	} catch {
		return { sources: [], entries: [], excludedDemoFixtures: 0 }
	}

	let excludedDemoFixtures = 0
	const instances: V3Instance[] = []
	for (const entry of resolveAmendments(records)) {
		const record = entry.record
		if (entry.retracted) continue
		if (record.type !== "verdict" && record.type !== "endorsed-sample") continue
		if (isDemoFixtureRecord(record)) {
			if (!options.includeDemoFixtures) {
				excludedDemoFixtures += 1
				continue
			}
		}
		if (record.type === "verdict") {
			instances.push(...instancesFromVerdict(record))
			continue
		}
		const roles = rolesFromSnapshot(record.palette)
		if (!roles) continue
		instances.push({
			artwork: {
				path: record.artwork.path,
				sha256: record.artwork.sha256,
				format: record.artwork.rendition?.format ?? null,
				width: record.artwork.rendition?.width ?? null,
				height: record.artwork.rendition?.height ?? null,
			},
			roles,
			roleSignature: signatureOf(roles),
			grade: null,
			recordedAt: record.ts,
			batch: record.batch?.id ?? null,
			label: null,
			note: record.comment ?? "",
			endorsedSample: true,
		})
	}

	// Group by (artwork, exact palette) and let recency decide the standing tier.
	const groups = new Map<string, V3Instance[]>()
	for (const instance of instances) {
		const key = `${instance.artwork.sha256}\u0000${instance.roleSignature}`
		const bucket = groups.get(key)
		if (bucket) bucket.push(instance)
		else groups.set(key, [instance])
	}

	const relPath = repoRelative(path)
	const entries: EvidenceEntry[] = []
	for (const [key, bucket] of [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
		const sorted = [...bucket].sort((a, b) =>
			a.recordedAt === b.recordedAt ? (a.label ?? "").localeCompare(b.label ?? "") : a.recordedAt < b.recordedAt ? -1 : 1
		)
		const latestAt = sorted.at(-1)!.recordedAt
		const latest = sorted.filter((instance) => instance.recordedAt === latestAt)
		const latestGrades = [...new Set(latest.map((instance) => instance.grade ?? "endorsed-sample"))].sort()
		const standingGrade = latestGrades[0] ?? null
		const contested = latestGrades.length > 1
		const anyEndorsedSample = latest.some((instance) => instance.endorsedSample)
		const tier: EvidenceTier = anyEndorsedSample
			? "endorsement"
			: GRADE_TO_TIER[standingGrade ?? ""] ?? "acceptable"

		const head = sorted.at(-1)!
		const history = sorted.map((instance) => ({
			recordedAt: instance.recordedAt,
			grade: instance.grade ?? (instance.endorsedSample ? "endorsed-sample" : null),
			batch: instance.batch,
			label: instance.label,
		}))
		const distinctGrades = [...new Set(history.map((row) => row.grade).filter((g): g is string => g !== null))].sort()

		entries.push({
			entryId: createHash("sha256").update(key).digest("hex").slice(0, 16),
			tier,
			provenance: {
				era: "v3",
				contract: "v3",
				sourceFile: relPath,
				recordedAt: latestAt,
				ageDays: ageInDays(latestAt, asOf),
			},
			artwork: {
				contentSha256: head.artwork.sha256,
				imagePath: repoRelative(head.artwork.path),
				rendition: { format: head.artwork.format, width: head.artwork.width, height: head.artwork.height },
			},
			roles: head.roles,
			completeness: "full",
			roleSignature: head.roleSignature,
			resolution: {
				standingGrade,
				distinctGrades,
				latestRecordedAt: latestAt,
				resolvedByRecency: distinctGrades.length > 1,
				supersededByLaterGrade: distinctGrades.length > 1 && !contested,
				contested,
				history,
			},
			notes: [...new Set(sorted.map((instance) => instance.note.trim()).filter((note) => note.length > 0))],
		})
	}

	const byTier = new Map<EvidenceTier, number>()
	for (const entry of entries) byTier.set(entry.tier, (byTier.get(entry.tier) ?? 0) + 1)
	const contentHash = (() => {
		try {
			return sha256OfFile(path)
		} catch {
			return "absent"
		}
	})()
	const sources: EvidenceSource[] = (["endorsement", "known-bad", "acceptable"] as const).map((tier) => ({
		tier,
		era: "v3" as const,
		path: relPath,
		contentHash,
		entryCount: byTier.get(tier) ?? 0,
	}))

	return { sources, entries, excludedDemoFixtures }
}

// ---------------------------------------------------------------------------------------------
// Corpus assembly and the conflicts intrinsic to it
// ---------------------------------------------------------------------------------------------

/**
 * Conflicts that exist in the evidence corpus itself, before any candidate is compared.
 *
 * Three kinds, all documented in `data/legacy/README.md` as facts about the data rather than bugs:
 * the two good tiers overlap by 31 keys; 9 `acceptable` entries carry a standing grade of `strong`;
 * and a number of entries have a grade history with more than one distinct grade, which recency
 * resolved for *standing* without making the disagreement go away.
 */
export function findCorpusConflicts(entries: readonly EvidenceEntry[]): Conflict[] {
	const conflicts: Conflict[] = []

	// Tier overlap: same file, same exact palette, in two different tiers.
	const byKey = new Map<string, EvidenceEntry[]>()
	for (const entry of entries) {
		const key = `${entry.provenance.era}\u0000${entry.artwork.contentSha256}\u0000${entry.roleSignature}`
		const bucket = byKey.get(key)
		if (bucket) bucket.push(entry)
		else byKey.set(key, [entry])
	}
	for (const [, bucket] of [...byKey.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
		const tiers = [...new Set(bucket.map((entry) => entry.tier))].sort()
		if (tiers.length < 2) continue
		const first = bucket[0]!
		conflicts.push({
			kind: "tier-overlap",
			artworkSha256: first.artwork.contentSha256,
			artworkPath: first.artwork.imagePath,
			entryIds: bucket.map((entry) => entry.entryId).sort(),
			era: first.provenance.era,
			detail: `the same file and the same exact palette sits in ${tiers.length} tiers at once: ${tiers.join(", ")}`,
			standingResolution: null,
			resolved: false,
			histories: bucket.map((entry) => entry.resolution),
		})
	}

	for (const entry of [...entries].sort((a, b) => a.entryId.localeCompare(b.entryId))) {
		if (entry.tier === "acceptable" && entry.resolution.standingGrade === "strong") {
			conflicts.push({
				kind: "strong-graded-acceptable",
				artworkSha256: entry.artwork.contentSha256,
				artworkPath: entry.artwork.imagePath,
				entryIds: [entry.entryId],
				era: entry.provenance.era,
				detail: "an entry in the not-rejected baseline tier whose standing grade is `strong` — the tier " +
					"says 'merely tolerated', the grade says 'good'",
				standingResolution: `standing grade ${entry.resolution.standingGrade}`,
				resolved: false,
				histories: [entry.resolution],
			})
		}
		if (entry.resolution.contested) {
			conflicts.push({
				kind: "identical-timestamp-contested",
				artworkSha256: entry.artwork.contentSha256,
				artworkPath: entry.artwork.imagePath,
				entryIds: [entry.entryId],
				era: entry.provenance.era,
				detail: "conflicting grades share an identical timestamp, which the recency rule cannot break",
				standingResolution: null,
				resolved: false,
				histories: [entry.resolution],
			})
		}
	}

	return conflicts
}

export type LoadOptions = Readonly<{
	legacyDir?: string
	warehouseFile?: string
	eras?: readonly EvidenceEra[]
	asOf?: string | null
	includeDemoFixtures?: boolean
}>

/** Load whichever eras were asked for, index by artwork, and record the corpus's own contradictions. */
export function loadEvidence(options: LoadOptions = {}): EvidenceCorpus & { excludedDemoFixtures: number } {
	const eras = options.eras ?? (["v2-3", "v3"] as const)
	const asOf = options.asOf ?? null
	const sources: EvidenceSource[] = []
	const entries: EvidenceEntry[] = []
	let excludedDemoFixtures = 0

	if (eras.includes("v2-3")) {
		const dir = options.legacyDir ?? DEFAULT_LEGACY_DIR
		for (const [tier, file] of LEGACY_TIER_FILES) {
			const loaded = loadLegacyTier(resolvePath(dir, file), tier, asOf)
			sources.push(loaded.source)
			entries.push(...loaded.entries)
		}
	}
	if (eras.includes("v3")) {
		const loaded = loadWarehouseEvidence(
			options.warehouseFile ?? DEFAULT_WAREHOUSE_FILE,
			asOf,
			{ includeDemoFixtures: options.includeDemoFixtures },
		)
		sources.push(...loaded.sources)
		entries.push(...loaded.entries)
		excludedDemoFixtures = loaded.excludedDemoFixtures
	}

	const byArtwork = new Map<string, EvidenceEntry[]>()
	for (const entry of entries) {
		const bucket = byArtwork.get(entry.artwork.contentSha256)
		if (bucket) bucket.push(entry)
		else byArtwork.set(entry.artwork.contentSha256, [entry])
	}
	for (const bucket of byArtwork.values()) bucket.sort((a, b) => a.entryId.localeCompare(b.entryId))

	return {
		sources,
		entries,
		byArtwork,
		corpusConflicts: findCorpusConflicts(entries),
		excludedDemoFixtures,
	}
}
