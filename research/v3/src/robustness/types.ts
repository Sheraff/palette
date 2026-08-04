/**
 * Types for the robustness harness.
 *
 * Three vocabularies live here:
 *
 * 1. **The candidate interface** — what a palette-emitting module has to look like for this
 *    harness to run it. See {@link CandidatePalette}.
 * 2. **The standing samples** — the rendition-pair set and the perturbation set, both frozen
 *    files with provenance.
 * 3. **The report** — agreement rates, and the disagreeing covers the diff viewer consumes.
 */

import type { Palette, RoleName } from "../contract/types.ts"
import type { HexColor } from "../contract/types.ts"
import type { BarMode } from "../adjudication/types.ts"
import type { Collection, TierName } from "../coverage-set/corpus.ts"

// ---------------------------------------------------------------------------
// 1. The candidate interface
// ---------------------------------------------------------------------------

/**
 * **The dev-loop bundle owns this interface; this harness re-exports it.**
 *
 * The two workstreams were built the same afternoon (2026-08-04) and the instruction was to
 * coordinate by reading `src/devloop/` if it had landed. It had, so there is exactly one
 * definition of what a candidate is — `(imagePath: string) => Promise<Palette>` — and it lives
 * with the runner that calls it most. An earlier draft of this file defined its own
 * `(input: {path, contentHash})` variant; it was withdrawn rather than reconciled, because two
 * spellings of the candidate contract is precisely the drift this re-export prevents.
 *
 * The harness needs the input's content hash for provenance, but takes it from the frozen set
 * files and from {@link materializeArm} rather than asking the candidate to accept it — a
 * candidate should not be handed anything it does not need to do its job.
 *
 * **Coupling note.** This module imports `devloop/types.ts` and nothing else from the bundle. The
 * runner, the worker pool and the content-addressed cache were in active flux while this was
 * written, and a robustness harness that cannot run because a cache API moved is worse than one
 * that recomputes. Reusing `devloop/cache.ts` — whose key is `(input hash, computation id, code
 * version)`, exactly right for this — is the obvious optimisation once the bundle settles, and is
 * recorded as such in this module's README.
 */
export type { CandidatePalette, CandidateModule } from "../devloop/types.ts"

// ---------------------------------------------------------------------------
// 2. The standing samples
// ---------------------------------------------------------------------------

/** Whether the reviewer has ever graded an artwork. The axis item 4 exists to expose. */
export type Reviewedness = "reviewed" | "unseen"

/** How a *pair* relates to the reviewed set — a pair has two endpoints and they can differ. */
export type PairReviewedness = "both-reviewed" | "one-reviewed" | "neither-reviewed"

/** One endpoint of a rendition pair, identified by path + content hash per CONVENTIONS.md. */
export type RenditionEndpoint = Readonly<{
	artworkId: string
	collection: Collection
	/** Repo-root-relative, exactly as the census and the ids files spell it. */
	path: string
	sha256: string
	width: number
	height: number
	format: string
	bytes: number
	reviewed: boolean
}>

/** One standing rendition pair: the same artwork, encoded or rendered twice. */
export type RenditionPair = Readonly<{
	/** Stable across re-draws: the two artwork ids, sorted, joined by `~`. */
	pairId: string
	/**
	 * The strongest cosine the census recorded for these two artworks.
	 *
	 * Cosine is a property of a *file* pair, and two artworks can appear as several file pairs
	 * (`.jpg` vs `.jpg`, `_147x147.avif` vs `_482x482.avif`, …). This sample is a sample of artwork
	 * pairs, so the maximum over the census's records for the pair is what is reported.
	 */
	cosine: number
	/** How many file-level census records collapsed into this artwork pair. */
	renditionPairsInCensus: number
	foundByArms: readonly string[]
	similarityBand: string
	pairReviewedness: PairReviewedness
	/** The axis reported in the headline split: `reviewed` when either endpoint is graded. */
	reviewedness: Reviewedness
	collection: Collection
	tierPair: readonly [TierName, TierName]
	a: RenditionEndpoint
	b: RenditionEndpoint
}>

/** Provenance for a source file a frozen set was derived from. */
export type SourceProvenance = Readonly<{
	path: string
	sha256: string
	note?: string
}>

/** The committed pair-set file. */
export type PairSetFile = Readonly<{
	what: string
	writtenAt: string
	generatedBy: string
	setId: string
	seed: number
	seedHex: string
	criterion: Readonly<{
		cosineThreshold: number
		arm: string
		holdoutExcluded: true
		reviewednessDefinition: string
	}>
	sources: Readonly<Record<string, SourceProvenance>>
	counts: Readonly<Record<string, number>>
	strata: readonly StratumAllocation[]
	pairs: readonly RenditionPair[]
}>

/** One stratum's population and how many of it the draw took. */
export type StratumAllocation = Readonly<{
	stratum: string
	population: number
	drawn: number
	/** True when the draw took the whole stratum because it was smaller than its quota. */
	exhaustive: boolean
}>

/**
 * The perturbations this harness knows how to make.
 *
 * `jpeg-q92` is the anchor: it is the exact setting (quality 92, chroma subsampling 4:4:4, same
 * size) behind v2-3's 72.8% re-encode agreement, so v3's number can be read against v2-3's. The
 * two lower qualities extend it into a gradient — a system whose agreement falls off smoothly with
 * quality is behaving differently from one that falls off a cliff at the first perturbation.
 */
export type PerturbationArmName = "jpeg-q92" | "jpeg-q85" | "jpeg-q75" | "dither-lsb1"

/**
 * One perturbation arm: a baseline rendering and a perturbed rendering of the same cover.
 *
 * Every arm names its own baseline. That is not ceremony — the JPEG arms compare the original
 * file against a re-encode of it, while the dither arm compares two *losslessly* stored images,
 * because a ±1 LSB signal does not survive a JPEG round trip and an arm that let it be destroyed
 * would measure nothing while appearing to pass.
 */
export type PerturbationArm = Readonly<{
	name: PerturbationArmName
	kind: "reencode" | "dither"
	description: string
	/** `original` = the corpus file itself; `lossless` = a PNG of the decoded original. */
	baseline: "original" | "lossless"
}>

/** One cover in the perturbation sample. */
export type PerturbationCover = Readonly<{
	artworkId: string
	collection: Collection
	path: string
	sha256: string
	width: number
	height: number
	format: string
	bytes: number
	tier: TierName
	reviewedness: Reviewedness
}>

/** The committed perturbation-set file. */
export type PerturbationSetFile = Readonly<{
	what: string
	writtenAt: string
	generatedBy: string
	setId: string
	seed: number
	seedHex: string
	criterion: Readonly<{
		holdoutExcluded: true
		reviewednessDefinition: string
		reviewedQuota: number
		unseenQuota: number
	}>
	sources: Readonly<Record<string, SourceProvenance>>
	counts: Readonly<Record<string, number>>
	strata: readonly StratumAllocation[]
	arms: readonly PerturbationArm[]
	covers: readonly PerturbationCover[]
}>

// ---------------------------------------------------------------------------
// 3. Comparison and report
// ---------------------------------------------------------------------------

/** Options for {@link comparePalettes}. Mirrors adjudication's `MatchOptions` minus partiality. */
export type CompareOptions = Readonly<{
	barMode: BarMode
	roles: readonly RoleName[]
	fixedBar?: number
}>

/** One role of one pair, compared. Symmetric, hence `left`/`right`. */
export type RolePairComparison = Readonly<{
	role: RoleName
	left: HexColor
	right: HexColor
	distance: number | null
	bar: number | null
	same: boolean
}>

/** The verdict on one pair of palettes. */
export type PaletteComparison = Readonly<{
	same: boolean
	barMode: BarMode
	rolesCompared: readonly RoleName[]
	comparisons: readonly RolePairComparison[]
	disagreeingRoles: readonly RoleName[]
	worstRoleBarRatio: number | null
	/** Reported alongside the verdict, deliberately not folded into `same`. */
	collapseAgrees: boolean
	gradientPresenceAgrees: boolean
}>

/** Why a trial produced no verdict. Kept apart from disagreement — see the README. */
export type TrialError = Readonly<{
	stage: "left" | "right" | "perturb"
	message: string
}>

/** One executed comparison: a rendition pair, or one arm of one cover. */
export type Trial = Readonly<{
	trialId: string
	kind: "rendition-pair" | "perturbation"
	/** The arm for perturbation trials; null for rendition pairs. */
	arm: PerturbationArmName | null
	artworkId: string
	reviewedness: Reviewedness
	collection: Collection
	/** Absolute paths actually handed to the candidate, for the diff viewer. */
	leftPath: string
	rightPath: string
	comparison: PaletteComparison | null
	error: TrialError | null
	millis: number
}>

/** An agreement rate with its denominator. A rate without `n` is not reportable. */
export type AgreementRate = Readonly<{
	group: string
	agreed: number
	compared: number
	errored: number
	rate: number | null
	/** Wilson 95% interval on `rate`, so an underpowered stratum reads as underpowered. */
	interval: readonly [number, number] | null
}>

/**
 * The reviewed-vs-unseen stability ratio on one basis.
 *
 * v2-3 measured **1.61×** — tuned artwork was that much more perturbation-stable than unseen
 * artwork, which is quantified overfitting. Healthy is **≈1.0**. This is success criterion 2's
 * third number (`V3_PLAN.md` §1), the reviewer's TB-06, and loose-end **B30**.
 */
export type StabilityRatio = Readonly<{
	basis: string
	reviewed: AgreementRate
	unseen: AgreementRate
	/** `reviewed.rate / unseen.rate`. Null when either side has no comparisons or unseen is 0. */
	ratio: number | null
	/** True when either arm is too small for the ratio to mean anything. See the README. */
	underpowered: boolean
	note?: string
}>

/** Per-role disagreement counts, so a reader sees *which* role moves. */
export type RoleInstability = Readonly<{
	role: RoleName
	disagreed: number
	compared: number
	rate: number | null
}>

/** The report `check.ts` writes. */
export type RobustnessReport = Readonly<{
	what: string
	writtenAt: string
	generatedBy: string
	candidate: Readonly<{ name: string; version: string; module: string }>
	compare: CompareOptions
	sets: Readonly<Record<string, SourceProvenance>>
	/**
	 * How the reviewed/unseen labels were obtained.
	 *
	 * Sample *membership* is frozen in the set files; the *label* is recomputed from today's
	 * warehouse, because the warehouse grows and a frozen label would silently count a
	 * recently-graded artwork as unseen — the direction that flatters the ratio.
	 */
	reviewedness: Readonly<{
		source: "live-warehouse" | "frozen-set-file"
		/** How many sample members changed label since the draw. */
		relabelledSinceDraw: number
		reviewedArtworksInWarehouse: number | null
	}>
	overall: AgreementRate
	byPairType: readonly AgreementRate[]
	byReviewedness: readonly AgreementRate[]
	/**
	 * One ratio per basis, never one blended number.
	 *
	 * The two samples have very different reviewed/unseen balance — the perturbation set is
	 * allocated 50/50 by construction, the pair set is 23-vs-177 because that is all the corpus
	 * offers. Averaging them would launder an imbalanced estimate into the headline, so each basis
	 * reports its own ratio and its own power.
	 */
	stabilityRatios: readonly StabilityRatio[]
	byRole: readonly RoleInstability[]
	/** Every disagreeing trial, for the diff viewer. */
	disagreements: readonly Trial[]
	/** Every errored trial. Never silently folded into the rates. */
	errors: readonly Trial[]
	timing: Readonly<{ trials: number; wallMillis: number; candidateMillis: number }>
}>
