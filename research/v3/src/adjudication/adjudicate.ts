/**
 * The adjudication itself: read a candidate run, join it against the standing evidence, report.
 *
 * The whole file obeys one rule that is easy to state and easy to break: **nothing here computes a
 * score.** Every number in the output is a count of things that happened, or a distance in the one
 * ruler's units. There is no weighted sum of wins and losses, no accuracy, no rate over
 * endorsements, because any such number would price "differed from an endorsement" — and principle 1
 * says that costs nothing.
 */

import { readFileSync } from "node:fs"
import { colorFromHex, colorFromRgb, ROLE_NAMES } from "../contract/index.ts"
import type { PaletteColor, RoleName } from "../contract/index.ts"
import { assessReachability, DEFAULT_MATCH_OPTIONS, matchPalette } from "./match.ts"
import type {
	AdjudicationReport,
	CandidateParseError,
	CandidateRecord,
	CandidateRun,
	CandidateVerdict,
	Conflict,
	ConflictKind,
	EntryVerdict,
	EraTally,
	EvidenceCorpus,
	EvidenceEntry,
	EvidenceEra,
	MatchOptions,
	MovementReport,
	ParsedCandidate,
} from "./types.ts"

export const SCHEMA_VERSION = "adjudication-report-0.1.0"

/**
 * The three rulings, verbatim, carried in every report.
 *
 * `[REVIEWED]` — reviewer, 2026-08-04. They are in the output and not only in the README because a
 * report is what gets pasted into a summary, and a reader who sees a win count without them will
 * price the losses wrongly.
 */
export const PRINCIPLES: readonly string[] = [
	"There can be many valid palettes: matching an endorsement is a WIN signal; differing from one is " +
	"NO SIGNAL, never a penalty; only matching a known-bad is a LOSS signal.",
	"The reviewer can contradict himself: where the evidence corpus conflicts, the conflict is surfaced " +
	"per item and never averaged away. Recency decides standing; the disagreement is still reported.",
	"We are rewriting from scratch and old truths might be invalid now: every verdict enters as a DATED " +
	"PRIOR with an era tag, results split by era, and nothing here gates anything — it informs.",
]

// ---------------------------------------------------------------------------------------------
// Reading a candidate run
// ---------------------------------------------------------------------------------------------

const SHA256_PATTERN = /^[0-9a-f]{64}$/

function colorFrom(value: unknown): PaletteColor | null {
	if (typeof value === "string") {
		try {
			return colorFromHex(value.toLowerCase())
		} catch {
			return null
		}
	}
	if (value && typeof value === "object") {
		const record = value as { rgb?: unknown; hex?: unknown }
		if (Array.isArray(record.rgb) && record.rgb.length === 3) {
			try {
				return colorFromRgb(record.rgb as [number, number, number])
			} catch {
				return null
			}
		}
		if (typeof record.hex === "string") return colorFrom(record.hex)
	}
	return null
}

/**
 * Parse one line of a run file.
 *
 * Strict about identity, lenient about the rest — see `CandidatePalette`. A record without a content
 * hash cannot be joined to any prior, so it is a reported parse error rather than a silent skip: a
 * run that adjudicates 40 of its 200 lines because the emitter forgot a field should look broken,
 * not clean.
 */
export function parseCandidateLine(line: number, text: string): ParsedCandidate | CandidateParseError {
	const excerpt = text.slice(0, 120)
	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch (error) {
		return { line, reason: `not valid JSON: ${(error as Error).message}`, excerpt }
	}
	if (!parsed || typeof parsed !== "object") return { line, reason: "not a JSON object", excerpt }

	const record = parsed as { palette?: unknown; availableColors?: unknown; arm?: unknown; note?: unknown }
	const palette = record.palette as
		| { roles?: Record<string, unknown>; metadata?: Record<string, unknown>; contractVersion?: unknown }
		| undefined
	if (!palette || typeof palette !== "object") return { line, reason: "missing `palette`", excerpt }

	const roles: Partial<Record<RoleName, PaletteColor>> = {}
	for (const role of ROLE_NAMES) {
		const color = colorFrom(palette.roles?.[role])
		if (!color) return { line, reason: `role \`${role}\` missing or not a colour`, excerpt }
		roles[role] = color
	}

	const metadata = palette.metadata as
		| { inputContentHash?: unknown; sourceRendition?: { path?: unknown } }
		| undefined
	const hash = metadata?.inputContentHash
	if (typeof hash !== "string" || !SHA256_PATTERN.test(hash)) {
		return { line, reason: "`palette.metadata.inputContentHash` missing or not a lowercase sha-256", excerpt }
	}
	const path = metadata?.sourceRendition?.path
	if (typeof path !== "string" || path.length === 0) {
		return { line, reason: "`palette.metadata.sourceRendition.path` missing", excerpt }
	}

	const availableColors: PaletteColor[] = []
	if (Array.isArray(record.availableColors)) {
		for (const value of record.availableColors) {
			const color = colorFrom(value)
			if (color) availableColors.push(color)
		}
	}

	const full = palette as Record<string, unknown>
	const contractComplete = "gradient" in full && "collapse" in full && "contrast" in full

	const built: CandidateRecord = {
		palette: {
			contractVersion: typeof palette.contractVersion === "string" ? palette.contractVersion : undefined,
			roles: roles as Record<RoleName, PaletteColor>,
			metadata: {
				inputContentHash: hash,
				sourceRendition: { path },
			},
		},
		...(availableColors.length > 0 ? { availableColors } : {}),
		...(typeof record.arm === "string" ? { arm: record.arm } : {}),
		...(typeof record.note === "string" ? { note: record.note } : {}),
	}
	return { line, record: built, contractComplete }
}

/** Read a JSONL run file. Blank lines are skipped; everything else is either parsed or reported. */
export function readCandidateRun(path: string): CandidateRun {
	const text = readFileSync(path, "utf8")
	const candidates: ParsedCandidate[] = []
	const parseErrors: CandidateParseError[] = []
	const lines = text.split("\n")
	for (let index = 0; index < lines.length; index += 1) {
		const raw = lines[index]!.trim()
		if (raw.length === 0) continue
		const result = parseCandidateLine(index + 1, raw)
		if ("record" in result) candidates.push(result)
		else parseErrors.push(result)
	}
	return { path, candidates, parseErrors }
}

// ---------------------------------------------------------------------------------------------
// Adjudicating
// ---------------------------------------------------------------------------------------------

export type AdjudicateOptions = Readonly<{
	match?: MatchOptions
	asOf?: string | null
	eras?: readonly EvidenceEra[]
	reachability?: boolean
	/** How many nearest non-matching entries to keep per candidate. */
	nearMisses?: number
	inputPath?: string
}>

function signalFor(entry: EvidenceEntry, matched: boolean): "win" | "loss" | "no-signal" {
	if (!matched) return "no-signal"
	if (entry.tier === "endorsement") return "win"
	if (entry.tier === "known-bad") return "loss"
	return "no-signal"
}

function entryVerdict(
	entry: EvidenceEntry,
	match: ReturnType<typeof matchPalette>,
	availableColors: readonly PaletteColor[] | undefined,
	options: MatchOptions,
	reachabilityOn: boolean,
): EntryVerdict {
	return {
		entryId: entry.entryId,
		tier: entry.tier,
		era: entry.provenance.era,
		signal: signalFor(entry, Boolean(match?.matched)),
		match: match!,
		reachability: reachabilityOn
			? assessReachability(entry, availableColors, options)
			: { status: "not-assessed", perRole: [], rolesSkipped: [] },
		provenance: entry.provenance,
		standingGrade: entry.resolution.standingGrade,
		notes: entry.notes,
	}
}

/**
 * `hasComparableEvidence`, not `hasEvidence`. An entry that exists but could not be compared — a
 * partial entry under `--partial-entries skip`, an entry carrying none of the requested roles — must
 * not turn into `differs`, which asserts that the candidate diverged from something. It did not
 * diverge from a comparison that never ran. Those files read as `unseen`: no comparable evidence
 * under these options.
 */
function outcomeOf(wins: number, losses: number, baseline: number, hasComparableEvidence: boolean) {
	if (losses > 0) return "known-bad-match" as const
	if (wins > 0) return "endorsement-match" as const
	if (baseline > 0) return "acceptable-match" as const
	return hasComparableEvidence ? ("differs" as const) : ("unseen" as const)
}

/**
 * Adjudicate one candidate palette against the evidence for its artwork.
 *
 * Note what this does *not* do when a candidate matches both a good tier and a known-bad tier: it
 * does not pick a winner. The loss outranks the win in the single `outcome` label — a stated
 * precedence, not a judgement — and both matches stay in their arrays, and the pair is raised as a
 * `candidate-matches-both-tiers` conflict. That case is only possible under the bar, never under
 * exact hex, because the good tiers and known-bad are exactly disjoint by role signature; two nearby
 * palettes graded differently are precisely the reviewer contradicting himself, which principle 2
 * says to show rather than resolve.
 */
export function adjudicateCandidate(
	candidate: ParsedCandidate,
	corpus: EvidenceCorpus,
	options: AdjudicateOptions = {},
): CandidateVerdict {
	const matchOptions = options.match ?? DEFAULT_MATCH_OPTIONS
	const reachabilityOn = options.reachability ?? true
	const nearMisses = options.nearMisses ?? 3
	const eras = options.eras ?? (["v2-3", "v3"] as const)

	const sha = candidate.record.palette.metadata.inputContentHash
	const available = candidate.record.availableColors
	const forArtwork = (corpus.byArtwork.get(sha) ?? []).filter((entry) => eras.includes(entry.provenance.era))

	const endorsementMatches: EntryVerdict[] = []
	const knownBadMatches: EntryVerdict[] = []
	const acceptableMatches: EntryVerdict[] = []
	const unmatched: EntryVerdict[] = []

	for (const entry of forArtwork) {
		const match = matchPalette(candidate.record.palette.roles, entry, matchOptions)
		if (!match) continue
		const verdict = entryVerdict(entry, match, available, matchOptions, reachabilityOn)
		if (!match.matched) {
			unmatched.push(verdict)
			continue
		}
		if (entry.tier === "endorsement") endorsementMatches.push(verdict)
		else if (entry.tier === "known-bad") knownBadMatches.push(verdict)
		else acceptableMatches.push(verdict)
	}

	const nearest = [...unmatched]
		.sort((a, b) => {
			const left = a.match.worstRoleBarRatio ?? Number.POSITIVE_INFINITY
			const right = b.match.worstRoleBarRatio ?? Number.POSITIVE_INFINITY
			return left === right ? a.entryId.localeCompare(b.entryId) : left - right
		})
		.slice(0, Math.max(0, nearMisses))

	const conflicts: Conflict[] = []
	const matchedVerdicts = [...endorsementMatches, ...knownBadMatches, ...acceptableMatches]

	if (knownBadMatches.length > 0 && endorsementMatches.length + acceptableMatches.length > 0) {
		const good = [...endorsementMatches, ...acceptableMatches]
		conflicts.push({
			kind: "candidate-matches-both-tiers",
			artworkSha256: sha,
			artworkPath: candidate.record.palette.metadata.sourceRendition.path,
			entryIds: [...matchedVerdicts.map((verdict) => verdict.entryId)].sort(),
			era: knownBadMatches[0]!.era,
			detail: `one candidate palette is within the bar of ${good.length} good-tier ` +
				`and ${knownBadMatches.length} known-bad entr${knownBadMatches.length === 1 ? "y" : "ies"} ` +
				"for the same file — the reviewer graded two near-identical palettes differently",
			standingResolution: null,
			resolved: false,
			histories: matchedVerdicts.map((verdict) => {
				const entry = forArtwork.find((candidateEntry) => candidateEntry.entryId === verdict.entryId)!
				return entry.resolution
			}),
		})
	}

	for (const verdict of matchedVerdicts) {
		const entry = forArtwork.find((candidateEntry) => candidateEntry.entryId === verdict.entryId)!
		if (entry.resolution.distinctGrades.length > 1) {
			conflicts.push({
				kind: "grade-history-conflict",
				artworkSha256: sha,
				artworkPath: entry.artwork.imagePath,
				entryIds: [entry.entryId],
				era: entry.provenance.era,
				detail: `the matched entry was graded ${entry.resolution.distinctGrades.join(" and ")} at ` +
					"different times; recency picked the standing grade and the disagreement stands",
				standingResolution: entry.resolution.standingGrade
					? `${entry.resolution.standingGrade} (latest, ${entry.resolution.latestRecordedAt ?? "undated"})`
					: null,
				resolved: !entry.resolution.contested,
				histories: [entry.resolution],
			})
		}
	}

	// Corpus-intrinsic conflicts that touch an entry this candidate actually matched.
	const matchedIds = new Set(matchedVerdicts.map((verdict) => verdict.entryId))
	for (const conflict of corpus.corpusConflicts) {
		if (conflict.entryIds.some((id) => matchedIds.has(id))) conflicts.push(conflict)
	}

	const comparable = [...matchedVerdicts, ...unmatched]
	const byEra = [...eras]
		.sort()
		.map((era) => {
			const wins = endorsementMatches.filter((verdict) => verdict.era === era).length
			const losses = knownBadMatches.filter((verdict) => verdict.era === era).length
			const baseline = acceptableMatches.filter((verdict) => verdict.era === era).length
			const hasComparable = comparable.some((verdict) => verdict.era === era)
			return { era, outcome: outcomeOf(wins, losses, baseline, hasComparable) }
		})

	return {
		line: candidate.line,
		arm: candidate.record.arm ?? null,
		artworkSha256: sha,
		artworkPath: candidate.record.palette.metadata.sourceRendition.path,
		contractComplete: candidate.contractComplete,
		outcome: outcomeOf(
			endorsementMatches.length,
			knownBadMatches.length,
			acceptableMatches.length,
			comparable.length > 0,
		),
		signals: {
			win: endorsementMatches.length > 0,
			loss: knownBadMatches.length > 0,
			baseline: acceptableMatches.length > 0,
		},
		endorsementMatches: endorsementMatches.sort((a, b) => a.entryId.localeCompare(b.entryId)),
		knownBadMatches: knownBadMatches.sort((a, b) => a.entryId.localeCompare(b.entryId)),
		acceptableMatches: acceptableMatches.sort((a, b) => a.entryId.localeCompare(b.entryId)),
		unmatched: nearest,
		unmatchedCount: unmatched.length,
		conflicts,
		byEra,
	}
}

function tallyEra(era: EvidenceEra, verdicts: readonly CandidateVerdict[]): EraTally {
	const inEra = (verdicts: readonly EntryVerdict[]) => verdicts.filter((verdict) => verdict.era === era)
	let candidatesWithEvidence = 0
	let winCandidates = 0
	let fullBasis = 0
	let partialBasis = 0
	let lossCandidates = 0
	let baselineCandidates = 0
	let differs = 0
	let unseen = 0
	const winEntries = new Set<string>()
	const winArtworks = new Set<string>()
	const lossEntries = new Set<string>()
	const lossArtworks = new Set<string>()
	const baselineEntries = new Set<string>()
	const baselineArtworks = new Set<string>()

	for (const verdict of verdicts) {
		const outcome = verdict.byEra.find((row) => row.era === era)?.outcome ?? "unseen"
		if (outcome !== "unseen") candidatesWithEvidence += 1
		const wins = inEra(verdict.endorsementMatches)
		const losses = inEra(verdict.knownBadMatches)
		const baseline = inEra(verdict.acceptableMatches)
		if (wins.length > 0) {
			winCandidates += 1
			winArtworks.add(verdict.artworkSha256)
			for (const win of wins) {
				winEntries.add(win.entryId)
				if (win.match.basis === "all-four-roles") fullBasis += 1
				else partialBasis += 1
			}
		}
		if (losses.length > 0) {
			lossCandidates += 1
			lossArtworks.add(verdict.artworkSha256)
			for (const loss of losses) lossEntries.add(loss.entryId)
		}
		if (baseline.length > 0) {
			baselineCandidates += 1
			baselineArtworks.add(verdict.artworkSha256)
			for (const row of baseline) baselineEntries.add(row.entryId)
		}
		if (outcome === "differs") differs += 1
		if (outcome === "unseen") unseen += 1
	}

	return {
		era,
		candidatesWithEvidence,
		wins: {
			candidates: winCandidates,
			fullBasis,
			partialBasis,
			distinctEntries: winEntries.size,
			distinctArtworks: winArtworks.size,
		},
		losses: { candidates: lossCandidates, distinctEntries: lossEntries.size, distinctArtworks: lossArtworks.size },
		baseline: {
			candidates: baselineCandidates,
			distinctEntries: baselineEntries.size,
			distinctArtworks: baselineArtworks.size,
		},
		noSignal: { differs, unseen },
	}
}

/** Run-versus-run: the "never move TO known-worse" guardrail, as a list of items and not a score. */
export function compareRuns(
	candidate: readonly CandidateVerdict[],
	baseline: readonly CandidateVerdict[],
	baselinePath: string,
): MovementReport {
	const index = (verdicts: readonly CandidateVerdict[]) => {
		const map = new Map<string, CandidateVerdict>()
		for (const verdict of verdicts) if (!map.has(verdict.artworkSha256)) map.set(verdict.artworkSha256, verdict)
		return map
	}
	const left = index(candidate)
	const right = index(baseline)

	const movedToKnownBad: MovementReport["movedToKnownBad"][number][] = []
	const movedOffKnownBad: MovementReport["movedOffKnownBad"][number][] = []
	for (const [sha, verdict] of [...left.entries()].sort(([a], [b]) => a.localeCompare(b))) {
		const before = right.get(sha)
		if (!before) continue
		if (verdict.signals.loss && !before.signals.loss) {
			movedToKnownBad.push({
				artworkSha256: sha,
				artworkPath: verdict.artworkPath,
				entryIds: verdict.knownBadMatches.map((match) => match.entryId),
			})
		}
		if (!verdict.signals.loss && before.signals.loss) {
			movedOffKnownBad.push({
				artworkSha256: sha,
				artworkPath: verdict.artworkPath,
				entryIds: before.knownBadMatches.map((match) => match.entryId),
			})
		}
	}

	return {
		baselinePath,
		movedToKnownBad,
		movedOffKnownBad,
		onlyInCandidate: [...left.keys()].filter((sha) => !right.has(sha)).sort(),
		onlyInBaseline: [...right.keys()].filter((sha) => !left.has(sha)).sort(),
	}
}

/** Adjudicate a whole run and assemble the report. Deterministic: no clock, no absolute paths. */
export function adjudicateRun(
	run: CandidateRun,
	corpus: EvidenceCorpus,
	options: AdjudicateOptions = {},
	movement: MovementReport | null = null,
): AdjudicationReport {
	const matchOptions = options.match ?? DEFAULT_MATCH_OPTIONS
	const eras = options.eras ?? (["v2-3", "v3"] as const)
	const perCandidate = run.candidates
		.map((candidate) => adjudicateCandidate(candidate, corpus, options))
		.sort((a, b) => (a.artworkSha256 === b.artworkSha256 ? a.line - b.line : a.artworkSha256.localeCompare(b.artworkSha256)))

	const conflictItems: Conflict[] = []
	const seenConflicts = new Set<string>()
	for (const verdict of perCandidate) {
		for (const conflict of verdict.conflicts) {
			const key = `${conflict.kind}\u0000${conflict.artworkSha256 ?? ""}\u0000${conflict.entryIds.join(",")}`
			if (seenConflicts.has(key)) continue
			seenConflicts.add(key)
			conflictItems.push(conflict)
		}
	}
	conflictItems.sort((a, b) =>
		a.kind === b.kind ? a.entryIds.join(",").localeCompare(b.entryIds.join(",")) : a.kind.localeCompare(b.kind)
	)
	const byKind = new Map<ConflictKind, number>()
	for (const conflict of conflictItems) byKind.set(conflict.kind, (byKind.get(conflict.kind) ?? 0) + 1)

	let assessedEntries = 0
	let reachable = 0
	let unreachable = 0
	let notAssessed = 0
	const unreachableEndorsements = new Map<string, { entryId: string; artworkPath: string; era: EvidenceEra }>()
	for (const verdict of perCandidate) {
		const all = [
			...verdict.endorsementMatches,
			...verdict.knownBadMatches,
			...verdict.acceptableMatches,
			...verdict.unmatched,
		]
		for (const entry of all) {
			if (entry.reachability.status === "not-assessed") {
				notAssessed += 1
				continue
			}
			assessedEntries += 1
			if (entry.reachability.status === "reachable") reachable += 1
			else {
				unreachable += 1
				if (entry.tier === "endorsement") {
					unreachableEndorsements.set(entry.entryId, {
						entryId: entry.entryId,
						artworkPath: verdict.artworkPath,
						era: entry.era,
					})
				}
			}
		}
	}

	const armNames = [...new Set(perCandidate.map((verdict) => verdict.arm ?? "(unnamed)"))].sort()
	const byArm = armNames.map((arm) => {
		const rows = perCandidate.filter((verdict) => (verdict.arm ?? "(unnamed)") === arm)
		return {
			arm,
			candidates: rows.length,
			wins: rows.filter((verdict) => verdict.signals.win).length,
			losses: rows.filter((verdict) => verdict.signals.loss).length,
			noSignal: rows.filter((verdict) => !verdict.signals.win && !verdict.signals.loss).length,
		}
	})

	return {
		schemaVersion: SCHEMA_VERSION,
		gating: "none",
		principles: PRINCIPLES,
		input: {
			path: options.inputPath ?? run.path,
			records: run.candidates.length,
			contractComplete: run.candidates.filter((candidate) => candidate.contractComplete).length,
			parseErrors: run.parseErrors,
		},
		options: {
			barMode: matchOptions.barMode,
			fixedBar: matchOptions.fixedBar ?? null,
			roles: matchOptions.roles,
			partialEntries: matchOptions.partialEntries,
			asOf: options.asOf ?? null,
			eras: [...eras].sort(),
			reachability: options.reachability ?? true,
		},
		evidence: corpus.sources,
		perCandidate,
		aggregate: {
			byEra: [...eras].sort().map((era) => tallyEra(era, perCandidate)),
			byArm,
			reachability: {
				assessedEntries,
				reachable,
				unreachable,
				notAssessed,
				unreachableEndorsements: [...unreachableEndorsements.values()].sort((a, b) =>
					a.entryId.localeCompare(b.entryId)
				),
			},
			conflicts: {
				total: conflictItems.length,
				byKind: [...byKind.entries()]
					.sort(([a], [b]) => a.localeCompare(b))
					.map(([kind, count]) => ({ kind, count })),
				items: conflictItems,
			},
		},
		movement,
	}
}
