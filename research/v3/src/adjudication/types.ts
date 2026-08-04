/**
 * Types for the auto-adjudication consumer.
 *
 * This file is the schema; nothing here computes. `match.ts` implements the comparison, `evidence.ts`
 * loads and indexes the standing evidence, `adjudicate.ts` joins the two, `report.ts` renders.
 *
 * ## The three design principles, as types
 *
 * The reviewer's three rulings (2026-08-04) are load-bearing here, not decoration. Each one shows up
 * as a shape this file makes it hard to violate:
 *
 * 1. **"There can be many valid palettes."** `MatchSignal` has three values — `win`, `loss`,
 *    `no-signal` — and *differing from an endorsement is `no-signal`*. There is no "miss" value and
 *    no numeric score anywhere in this file. A caller who wants a single number has to invent it
 *    themselves, in the open.
 * 2. **"I can contradict myself."** `Conflict` is a per-item record with the full grade history
 *    attached. The aggregate carries the conflict *list*, and counts by kind; it never carries a
 *    conflict rate, because a rate is exactly the averaging-away this principle forbids.
 * 3. **"We are rewriting from scratch and old truths might be invalid now."** Every evidence entry
 *    carries an `EvidenceProvenance` with an `era` and a `recordedAt`: it enters as a **dated prior**.
 *    Results split by era, and `AdjudicationReport.gating` is the literal string `"none"`.
 */

import type { HexColor, PaletteColor, RoleName } from "../contract/index.ts"

// ---------------------------------------------------------------------------------------------
// Candidate input — the run being adjudicated
// ---------------------------------------------------------------------------------------------

/**
 * A candidate palette, as read from a run file.
 *
 * This is the contract's `Palette` with the parts adjudication does not read made optional:
 * `gradient`, `collapse` and `contrast`. That is deliberate and narrow. Adjudication compares **role
 * colours only** — the legacy fixtures' own `gradientAdvisory` says gradient comparison against them
 * is advisory at best, since v2-3 gradients reused background/surface as endpoints and v3 stops are
 * decoupled from roles. Requiring a field this tool then refuses to use would block Phase 1
 * prototypes from being adjudicated for no gain.
 *
 * What is **not** optional is identity: `metadata.inputContentHash` and `metadata.sourceRendition`.
 * `PHASE_0_DECISIONS.md` §1 attaches a palette to the *file*, and every fixture entry is keyed by
 * content hash, so a record without one cannot be adjudicated at all — it is a parse error, not a
 * silent skip.
 *
 * `contractComplete` on the parsed record says whether the optional parts were in fact present, so a
 * later reader can tell a full contract palette from an early prototype's stub.
 */
export type CandidatePalette = Readonly<{
	contractVersion?: string
	roles: Readonly<Record<RoleName, PaletteColor>>
	metadata: Readonly<{
		algorithmVersion?: string
		preprocessingVersion?: string
		inputContentHash: string
		sourceRendition: Readonly<{
			path: string
			width?: number
			height?: number
			format?: string
		}>
	}>
}>

/**
 * One line of a candidate run file (JSONL, one JSON object per line).
 *
 * `availableColors` is the reachability input and is optional. It is the colour set the candidate
 * *could* have published for this artwork — a quantizer's output, a region-mean list, a cluster
 * roster. See `ReachabilityVerdict` for what is done with it and, more importantly, for what is not.
 *
 * `arm` names the paradigm or prototype that produced the line, so one file can hold several arms and
 * the report can split by them.
 */
export type CandidateRecord = Readonly<{
	palette: CandidatePalette
	availableColors?: readonly PaletteColor[]
	arm?: string
	note?: string
}>

/** A candidate record after parsing, with the line it came from and what the parse could tell. */
export type ParsedCandidate = Readonly<{
	/** 1-based line number in the run file. */
	line: number
	record: CandidateRecord
	/** True when the record also carried gradient, collapse and contrast. */
	contractComplete: boolean
}>

/** A line the parser refused. Reported, never dropped silently. */
export type CandidateParseError = Readonly<{
	line: number
	reason: string
	/** First 120 characters of the offending line, for the human fixing the emitter. */
	excerpt: string
}>

export type CandidateRun = Readonly<{
	/** Path as the caller gave it, verbatim. */
	path: string
	candidates: readonly ParsedCandidate[]
	parseErrors: readonly CandidateParseError[]
}>

// ---------------------------------------------------------------------------------------------
// Evidence — the standing corpus of prior verdicts
// ---------------------------------------------------------------------------------------------

/**
 * Which tier of standing evidence an entry belongs to. These are **not** grades — they are the three
 * files, and per `data/legacy/README.md` file membership *is* the signal.
 *
 * - `endorsement` — the reviewer graded it `strong`, or hand-built it as an endorsed sample.
 * - `known-bad` — the reviewer graded it `weak-fallback` or `unacceptable`.
 * - `acceptable` — a not-rejected baseline tier. Explicitly not an endorsement. Never a gate.
 */
export type EvidenceTier = "endorsement" | "known-bad" | "acceptable"

/**
 * The regime an entry was recorded under.
 *
 * Principle 3 in one field. `v2-3` is the old algorithm, the old contract and the old review UI;
 * `v3` is the current regime. A consumer that wants to know "does this hold under the rules we
 * actually have now" reads the `v3` slice; a consumer that wants the whole prior reads both. Nothing
 * here collapses the two into one number.
 */
export type EvidenceEra = "v2-3" | "v3"

/** Where an entry came from and when — the "dated prior" half of principle 3. */
export type EvidenceProvenance = Readonly<{
	era: EvidenceEra
	/** The contract string carried in the source data (`"v2-3"` on the legacy fixtures). */
	contract: string
	/** Repo-relative path of the file this entry was read from. */
	sourceFile: string
	/** ISO timestamp of the entry's standing (latest) grade, or `null` where the source has none. */
	recordedAt: string | null
	/** Whole days between `recordedAt` and the run's `--as-of` date; `null` when either is missing. */
	ageDays: number | null
}>

/**
 * The grade history behind an entry's standing grade.
 *
 * Carried on every entry — including the un-conflicted ones — because principle 2 is about surfacing
 * the corpus's own contradictions, and you cannot surface what you did not carry.
 */
export type EvidenceResolution = Readonly<{
	standingGrade: string | null
	distinctGrades: readonly string[]
	latestRecordedAt: string | null
	resolvedByRecency: boolean
	supersededByLaterGrade: boolean
	/** Identical-timestamp conflict — the one case recency cannot break. */
	contested: boolean
	history: readonly Readonly<{
		recordedAt: string | null
		grade: string | null
		batch: string | null
		label: string | null
	}>[]
}>

/** One standing prior: a palette some reviewer graded, on some file, at some time, under some regime. */
export type EvidenceEntry = Readonly<{
	entryId: string
	tier: EvidenceTier
	provenance: EvidenceProvenance
	artwork: Readonly<{
		contentSha256: string
		/** Repo-relative path. Never the absolute one — that would make output machine-dependent. */
		imagePath: string
		rendition: Readonly<{ format: string | null; width: number | null; height: number | null }>
	}>
	/**
	 * The graded palette's role colours. **Roles may be missing.** Three legacy corrections are
	 * partial (one 3-role, two single-role), and `data/legacy/README.md` A6 is explicit: compare only
	 * the roles actually set, and never treat a missing role as a constraint.
	 */
	roles: Partial<Readonly<Record<RoleName, PaletteColor>>>
	/** `"full"` | `"roles-only"` | `"partial"` as the source recorded it. */
	completeness: string
	/** Exact-hex role signature from the source, for de-duplication and cross-tier overlap only. */
	roleSignature: string
	resolution: EvidenceResolution
	/** Free-text reviewer notes attached to the entry. Never an input to any check. */
	notes: readonly string[]
}>

/** One loaded evidence file. */
export type EvidenceSource = Readonly<{
	tier: EvidenceTier
	era: EvidenceEra
	/** Repo-relative path. */
	path: string
	/** sha-256 of the file's bytes, so a report says exactly which corpus produced it. */
	contentHash: string
	entryCount: number
}>

/** The whole standing corpus, indexed by artwork content hash. */
export type EvidenceCorpus = Readonly<{
	sources: readonly EvidenceSource[]
	entries: readonly EvidenceEntry[]
	/** contentSha256 → entries for that exact file. */
	byArtwork: ReadonlyMap<string, readonly EvidenceEntry[]>
	/** Conflicts intrinsic to the corpus itself, found at load time. */
	corpusConflicts: readonly Conflict[]
}>

// ---------------------------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------------------------

/**
 * How "same colour" is decided.
 *
 * - `regional` — **the default and the only honest one.** `sameColorBar(a, b)` from
 *   `src/contract/color.ts`: region-dependent, calibrated on the reviewer's bracketing rounds 1+2 and
 *   frozen 2026-08-03 by `d-2026-08-03-same-color-bar-freeze`.
 * - `pooled` — one number (`POOLED_SAME_COLOR_BAR`, 0.01535) for corpus metrics that need
 *   cross-run comparability. `data/legacy/README.md` states plainly that this **is not the gate's
 *   bar**; it is offered for sensitivity sweeps, and the report labels any run that used it.
 * - `fixed` — an explicit bar, for sweeping the threshold.
 * - `exact-hex` — string equality. Present for one purpose only: reproducing hit counts computed
 *   before the bar landed, which `data/legacy/README.md` records as provisional. Never a live mode.
 */
export type BarMode = "regional" | "pooled" | "fixed" | "exact-hex"

/** How to treat evidence entries that do not carry all four roles. */
export type PartialEntryPolicy = "compare-present" | "skip"

export type MatchOptions = Readonly<{
	barMode: BarMode
	/** Only read when `barMode` is `"fixed"`. */
	fixedBar?: number
	/** Which roles participate. Default is all four. */
	roles: readonly RoleName[]
	partialEntries: PartialEntryPolicy
}>

/** One role, compared. */
export type RoleComparison = Readonly<{
	role: RoleName
	candidate: HexColor
	evidence: HexColor
	/** OKLab Euclidean distance — the one ruler. `null` in `exact-hex` mode, which measures nothing. */
	distance: number | null
	/** The bar this pair was judged against. `null` in `exact-hex` mode. */
	bar: number | null
	same: boolean
}>

/**
 * The result of comparing one candidate palette against one evidence entry.
 *
 * `basis` is the honesty field. `all-four-roles` is a full claim. `present-roles-only` means the
 * entry did not carry every role and the match rests on fewer — a one-role partial correction
 * "matches" a great many palettes, and the aggregate counts those separately rather than letting them
 * inflate a win count.
 */
export type PaletteMatch = Readonly<{
	entryId: string
	matched: boolean
	basis: "all-four-roles" | "present-roles-only"
	rolesCompared: readonly RoleName[]
	rolesSkipped: readonly RoleName[]
	comparisons: readonly RoleComparison[]
	/**
	 * Worst role's `distance / bar`. Below 1 on every role is a match. Reported on misses too, because
	 * "missed by 1.02 bars" and "missed by 40 bars" are different facts about a candidate — and
	 * neither is a penalty (principle 1).
	 */
	worstRoleBarRatio: number | null
}>

/**
 * Can the candidate's colour set produce this evidence palette at all?
 *
 * The angle v2-3 used, and it answers a different question from matching. A candidate that *differs*
 * from an endorsement is exercising the freedom principle 1 grants it. A candidate whose colour set
 * does not **contain** the endorsed colours could not have agreed even if it wanted to — that is a
 * fact about the paradigm's ceiling, and it is still **not a penalty**. It is reported beside the
 * match, never folded into it.
 *
 * `"not-assessed"` when the record carried no `availableColors`. Silence is never a pass here.
 */
export type ReachabilityStatus = "reachable" | "unreachable" | "not-assessed"

export type ReachabilityVerdict = Readonly<{
	status: ReachabilityStatus
	/** Per role: the nearest available colour and how many bars away it is. */
	perRole: readonly Readonly<{
		role: RoleName
		target: HexColor
		nearest: HexColor | null
		barRatio: number | null
		within: boolean
	}>[]
	/** Roles the entry did not carry, hence not assessed. */
	rolesSkipped: readonly RoleName[]
}>

// ---------------------------------------------------------------------------------------------
// Signals and conflicts
// ---------------------------------------------------------------------------------------------

/**
 * **Principle 1, as an enum.** Three values, and only three.
 *
 * A candidate that matches an endorsement is a `win`. A candidate that matches a known-bad is a
 * `loss`. Everything else — differing from every endorsement, matching an acceptable, never having
 * been seen — is `no-signal`. Differing is not a miss, is not a penalty, and has no numeric cost.
 */
export type MatchSignal = "win" | "loss" | "no-signal"

/**
 * The primary label for one candidate palette against one artwork's evidence.
 *
 * Precedence when several apply, stated once here so no caller has to guess: `known-bad-match` >
 * `endorsement-match` > `acceptable-match` > `differs` > `unseen`. A loss outranks a win rather than
 * cancelling it — both stay in the per-item arrays, and the pair is itself raised as a conflict
 * (`candidate-matches-both-tiers`).
 */
export type ArtworkOutcome =
	| "known-bad-match"
	| "endorsement-match"
	| "acceptable-match"
	| "differs"
	| "unseen"

/** The kinds of contradiction this tool surfaces. Each is per item; none is ever averaged. */
export type ConflictKind =
	/** The same (file, exact palette) sits in both good tiers. 31 such keys in the legacy corpus. */
	| "tier-overlap"
	/** The entry's own grade history holds more than one distinct grade; recency picked the standing one. */
	| "grade-history-conflict"
	/** An `acceptable.json` entry whose standing grade is `strong`. 9 such in the legacy corpus. */
	| "strong-graded-acceptable"
	/** One candidate palette is within the bar of both a good-tier entry and a known-bad entry. */
	| "candidate-matches-both-tiers"
	/** Conflicting grades at an identical timestamp — the one case recency cannot break. */
	| "identical-timestamp-contested"

/**
 * One contradiction, reported whole.
 *
 * `standingResolution` says what the corpus's recency rule decided, because recency does settle
 * *standing*. `resolved` says whether recency could settle it at all. The conflict is reported either
 * way — principle 2 is that the resolution does not erase the disagreement.
 */
export type Conflict = Readonly<{
	kind: ConflictKind
	/** `null` for corpus-intrinsic conflicts found without any candidate in hand. */
	artworkSha256: string | null
	artworkPath: string | null
	entryIds: readonly string[]
	era: EvidenceEra
	detail: string
	/** What the recency rule made the standing verdict, in words. */
	standingResolution: string | null
	resolved: boolean
	/** Grade histories of the entries involved, verbatim. */
	histories: readonly EvidenceResolution[]
}>

// ---------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------

/** One evidence entry matched (or notably nearly matched) by one candidate. */
export type EntryVerdict = Readonly<{
	entryId: string
	tier: EvidenceTier
	era: EvidenceEra
	signal: MatchSignal
	match: PaletteMatch
	reachability: ReachabilityVerdict
	provenance: EvidenceProvenance
	standingGrade: string | null
	notes: readonly string[]
}>

/** Everything adjudication has to say about one candidate palette. */
export type CandidateVerdict = Readonly<{
	line: number
	arm: string | null
	artworkSha256: string
	artworkPath: string
	contractComplete: boolean
	outcome: ArtworkOutcome
	/** Present because the outcome is one label and a candidate can carry several signals at once. */
	signals: Readonly<{ win: boolean; loss: boolean; baseline: boolean }>
	/** Every entry for this artwork that matched, by tier. Sorted by entryId. */
	endorsementMatches: readonly EntryVerdict[]
	knownBadMatches: readonly EntryVerdict[]
	acceptableMatches: readonly EntryVerdict[]
	/**
	 * The **nearest** non-matching entries for this artwork (default 3, `--near-misses`), kept as
	 * telemetry: their `worstRoleBarRatio` and their reachability. **These are not misses to be
	 * minimised** — see `MatchSignal`. Truncated because an artwork can carry dozens of entries and a
	 * report nobody can read is a report nobody reads; `unmatchedCount` is the untruncated total.
	 */
	unmatched: readonly EntryVerdict[]
	unmatchedCount: number
	conflicts: readonly Conflict[]
	/** Per-era outcome, so an old-regime win is never silently counted as a current one. */
	byEra: readonly Readonly<{ era: EvidenceEra; outcome: ArtworkOutcome }>[]
}>

/** Counts for one era. No rates, no scores — see principle 1. */
export type EraTally = Readonly<{
	era: EvidenceEra
	/** Candidate palettes for which this era had any evidence at all. */
	candidatesWithEvidence: number
	wins: Readonly<{
		candidates: number
		/** Matches resting on all four roles. */
		fullBasis: number
		/** Matches resting on a partial entry's present roles only. */
		partialBasis: number
		distinctEntries: number
		distinctArtworks: number
	}>
	losses: Readonly<{ candidates: number; distinctEntries: number; distinctArtworks: number }>
	baseline: Readonly<{ candidates: number; distinctEntries: number; distinctArtworks: number }>
	noSignal: Readonly<{ differs: number; unseen: number }>
}>

/** Optional run-versus-run movement check — the "never move TO known-worse" guardrail. */
export type MovementReport = Readonly<{
	baselinePath: string
	/** Artworks that were clean in the baseline and match a known-bad in the candidate run. */
	movedToKnownBad: readonly Readonly<{ artworkSha256: string; artworkPath: string; entryIds: readonly string[] }>[]
	/** Artworks that matched a known-bad in the baseline and no longer do. */
	movedOffKnownBad: readonly Readonly<{ artworkSha256: string; artworkPath: string; entryIds: readonly string[] }>[]
	/** Artworks present in one run and not the other, so the comparison is scoped honestly. */
	onlyInCandidate: readonly string[]
	onlyInBaseline: readonly string[]
}>

export type AdjudicationReport = Readonly<{
	schemaVersion: string
	/**
	 * The literal string `"none"`. Principle 3: nothing in this report gates anything. It informs.
	 * A field rather than a doc sentence so a downstream tool that wants to gate has to override
	 * something visible.
	 */
	gating: "none"
	principles: readonly string[]
	input: Readonly<{
		path: string
		records: number
		contractComplete: number
		parseErrors: readonly CandidateParseError[]
	}>
	options: Readonly<{
		barMode: BarMode
		fixedBar: number | null
		roles: readonly RoleName[]
		partialEntries: PartialEntryPolicy
		asOf: string | null
		eras: readonly EvidenceEra[]
		reachability: boolean
	}>
	evidence: readonly EvidenceSource[]
	perCandidate: readonly CandidateVerdict[]
	aggregate: Readonly<{
		byEra: readonly EraTally[]
		byArm: readonly Readonly<{
			arm: string
			candidates: number
			wins: number
			losses: number
			noSignal: number
		}>[]
		reachability: Readonly<{
			assessedEntries: number
			reachable: number
			unreachable: number
			notAssessed: number
			/** Endorsements that no candidate for that artwork could have produced. */
			unreachableEndorsements: readonly Readonly<{
				entryId: string
				artworkPath: string
				era: EvidenceEra
			}>[]
		}>
		/** Counts by kind and the full list. Deliberately not a rate (principle 2). */
		conflicts: Readonly<{
			total: number
			byKind: readonly Readonly<{ kind: ConflictKind; count: number }>[]
			items: readonly Conflict[]
		}>
	}>
	movement: MovementReport | null
}>
