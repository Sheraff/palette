/**
 * The dev loop's type surface: what a candidate is, what a run is, and what a run writes down.
 *
 * **What the dev loop is for.** Phase 1 is divergence — several people proposing several palette
 * algorithms. Each proposal has to be run over a set of covers, looked at, changed, and run again.
 * That inner loop is the thing being built here, and nothing in it decides whether a palette is
 * *good*: the loop produces palettes and shows them, and judgement stays where it already lives (the
 * review server, the reviewer, the warehouse).
 *
 * **The four pieces, and why they are one workflow.**
 *
 *  1. the **runner** (`run.ts`) turns a candidate plus a set of images into a JSONL file of palettes,
 *  2. the **cache** (`cache.ts`) makes the second run over the same images nearly free,
 *  3. the **viewer** (`serve.ts` plus the round-kit browse pages) puts a run's palettes next to the
 *     artworks they came from,
 *  4. the **diff** (`diff.ts`) puts two runs side by side, biggest change first.
 *
 * A tightened candidate is worth nothing until someone has *seen* what it changed, and the thing that
 * makes seeing it cheap is the cache: a fifteen-minute run that is re-run for a one-line change is a
 * loop nobody closes.
 *
 * **Set files are the norm, not the corpus.** A run is over a *set file* — a list of image paths.
 * Twenty covers is an ordinary set and the full corpus is just a bigger file. Nothing here assumes,
 * implies, or defaults to the whole corpus; a candidate that is iterated against thousands of images
 * every time is a candidate whose author stops iterating.
 */

import type { Palette } from "../contract/types.ts"

// ---------------------------------------------------------------------------------------------
// The candidate
// ---------------------------------------------------------------------------------------------

/**
 * **The one thing a Phase 1 proposal has to be.** Given the absolute path of an image file, produce
 * a palette in the contract's shape.
 *
 * Deliberately the smallest interface that can carry a proposal:
 *
 * - **A path, not a decoded buffer.** The candidate decodes its own input, because decoding is part
 *   of what a candidate does — `PHASE_0_DECISIONS.md` §1 forbids resampling, image dimensions come
 *   from the decoder's header, and a runner that pre-decoded would be quietly fixing a preprocessing
 *   choice for every candidate. `PaletteMetadata.preprocessingVersion` is the candidate's to fill in
 *   and its to be judged on.
 * - **A whole `Palette`, not a partial one.** The output contract is fixed (`PHASE_0_DECISIONS.md`
 *   §2) and it is what every downstream instrument already reads. A candidate that cannot fill in the
 *   contract has not finished being a candidate.
 * - **Async, and free to be slow.** Runs happen across cores and behind a cache.
 * - **No configuration argument.** A candidate with a knob is two candidates; make it two modules, or
 *   make the knob a constant with a provenance tag like everything else in v3. This keeps the cache
 *   key honest — see `CandidateModule.codeVersion`, which covers source and nothing else.
 */
export type CandidatePalette = (imagePath: string) => Promise<Palette>

/**
 * What a candidate module has to export.
 *
 * A candidate is a *module*, not a function, so that the runner can name it in provenance without
 * being told and can refuse an unusable one loudly at load time rather than per image.
 */
export type CandidateModule = Readonly<{
	/**
	 * A short stable name for this candidate. It appears in run ids, cache paths and the viewer, and
	 * it is the human's handle on "which proposal is this".
	 *
	 * It is **not** the cache key: renaming a candidate does not invalidate anything, and editing one
	 * without renaming it invalidates everything. The key is `codeVersion`, which is measured.
	 */
	candidateId: string
	paletteOf: CandidatePalette
}>

// ---------------------------------------------------------------------------------------------
// The set
// ---------------------------------------------------------------------------------------------

/**
 * A resolved set of images to run over.
 *
 * `setHash` covers the resolved absolute paths in order, so two runs quoting the same `setHash` were
 * over the same images in the same sequence — which is what makes a diff between two runs a
 * statement about the candidates rather than about which covers each happened to see.
 */
export type ImageSet = Readonly<{
	/** Where the list came from, for the provenance header. */
	setPath: string
	/** Short stable name, from the set file's basename. */
	setName: string
	/** Absolute paths, in file order, duplicates removed. */
	imagePaths: readonly string[]
	/** sha-256 over the newline-joined absolute paths. */
	setHash: string
}>

// ---------------------------------------------------------------------------------------------
// What a run writes
// ---------------------------------------------------------------------------------------------

/**
 * Versions of the packages the palettes actually came out of.
 *
 * A palette is a function of the decoder as much as of the candidate: `CONVENTIONS.md` records that
 * this repository carries two `sharp` versions precisely because they decode some AVIFs differently.
 * A run that does not say which one it used cannot be compared with one that used the other.
 */
export type PackageVersions = Readonly<Record<string, string>>

/**
 * The first line of every results file: everything needed to say what this run was.
 *
 * Written as a JSONL row like the results, with `kind: "devloop-run-header"`, so a results file is
 * one format end to end and a reader that streams rows does not need a second parser for line 1.
 */
export type RunHeader = Readonly<{
	kind: "devloop-run-header"
	/** `<candidateId>-<setName>-<startedAt compacted>` — unique per run, readable at a glance. */
	runId: string
	candidateId: string
	/** Absolute path of the candidate module, as it was loaded. */
	candidatePath: string
	/** The measured source hash of the candidate and everything it imports. See `codeVersion.ts`. */
	codeVersion: string
	setPath: string
	setName: string
	setHash: string
	imageCount: number
	/** ISO 8601, UTC. When the run started. */
	startedAt: string
	packageVersions: PackageVersions
	/** `process.version`, because a decoder is only half the environment. */
	nodeVersion: string
	/** How many workers this run was allowed. Affects wall time, never results. */
	workerCount: number
}>

/**
 * One image's outcome.
 *
 * A failure is a **row**, not a missing line: a candidate that throws on eleven covers has told you
 * something, and it has told you nothing at all if those eleven simply do not appear. `ok` splits
 * the two cases so no reader has to infer it from the presence of a field.
 */
export type RunRow = Readonly<{
	kind: "devloop-run-row"
	/** Position in the set, so rows can be ordered without re-reading the set file. */
	index: number
	imagePath: string
	/** sha-256 of the input file's bytes — the same identity the contract's metadata carries. */
	inputContentHash: string
	ok: boolean
	palette: Palette | null
	/** Present only when `ok` is false. The error's message, as thrown. */
	error: string | null
	/** True when this row came out of the cache rather than out of the candidate. */
	cached: boolean
	/** Milliseconds the candidate spent on this image. Zero-ish on a cache hit, and honestly so. */
	computeMs: number
}>

/** The last line: what the run did, so a reader does not have to tally the rows to find out. */
export type RunFooter = Readonly<{
	kind: "devloop-run-footer"
	runId: string
	finishedAt: string
	imageCount: number
	okCount: number
	failedCount: number
	cacheHits: number
	cacheMisses: number
	/** Wall-clock milliseconds from just before the first dispatch to just after the last row. */
	wallMs: number
}>

export type RunLine = RunHeader | RunRow | RunFooter

/** A results file, read back in full. */
export type RunFile = Readonly<{
	header: RunHeader
	rows: readonly RunRow[]
	footer: RunFooter | null
	/** Absolute path of the `.jsonl` this was read from. */
	path: string
}>
