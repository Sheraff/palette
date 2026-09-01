/**
 * # The robustness harness — one command, both samples, one report.
 *
 * ```sh
 * NODE_NO_WARNINGS=1 node --experimental-strip-types src/robustness/check.ts \
 *   --candidate src/devloop/candidates/toy-median-offsets.ts
 * ```
 *
 * Runs a candidate over both halves of every standing rendition pair and both sides of every
 * perturbation arm, compares the palettes with the contract's colour machinery, and writes a report
 * carrying: the overall agreement rate, the rate by pair type, the reviewed-vs-unseen split, which
 * roles moved, and every disagreeing cover with the two paths that produced it.
 *
 * ## What the number means, and what it does not
 *
 * **Agreement is not quality.** A candidate that returns the same four colours for every image on
 * earth scores 100% here. This harness answers one question — *is the answer stable under changes
 * nobody can see?* — and it is deliberately blind to whether the answer is any good. Read it next
 * to adjudication, never instead of it.
 *
 * **Errors are not disagreements.** A trial the candidate could not complete is reported in its own
 * bucket and kept out of every denominator. Folding failures into "disagreed" would understate a
 * crashy candidate's instability; folding them into "agreed" would let it buy a good number by
 * failing more often.
 *
 * **The baselines against which this is read** (v2-3, `research/ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md` §1):
 * JPEG re-encode agreement **72.8%**, ±1 LSB dither **0 of 114** palettes unchanged,
 * reviewed-vs-unseen stability ratio **1.61×** where healthy is ≈1.0. Those were measured under
 * v2-3's ε = 0.04 mean-role-distance criterion; this harness uses v3's regional same-colour bar
 * instead, so the comparison is one of magnitude and direction, not of decimal places.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { parseArgs } from "node:util"

import { ROLE_NAMES } from "../contract/index.ts"
import type { Palette, RoleName } from "../contract/types.ts"
import type { CandidatePalette } from "../devloop/types.ts"
import { DEFAULT_COMPARE_OPTIONS, comparePalettes } from "./compare.ts"
import { PERTURBATION_ARMS, materializeArm } from "./perturb.ts"
import { loadReviewedArtworkIds, sha256Of } from "./pair-set.ts"
import { MIN_COMPARISONS_FOR_RATIO, agreementRate } from "./stats.ts"
import type {
	AgreementRate,
	CompareOptions,
	PairSetFile,
	PerturbationSetFile,
	Reviewedness,
	RobustnessReport,
	RoleInstability,
	StabilityRatio,
	Trial,
} from "./types.ts"

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const V3_ROOT = path.resolve(HERE, "..", "..")
export const REPO_ROOT = path.resolve(V3_ROOT, "..", "..")
export const DATA_ROOT = path.join(V3_ROOT, "data", "robustness")
export const DEFAULT_PAIR_SET = path.join(DATA_ROOT, "pair-set-1.json")
export const DEFAULT_PERTURBATION_SET = path.join(DATA_ROOT, "perturbation-set-1.json")
export const DEFAULT_CACHE_DIR = path.join(DATA_ROOT, "cache")
export const DEFAULT_REPORT_DIR = path.join(DATA_ROOT, "reports")

/**
 * `[UNCALIBRATED]` — how many trials run at once. Chosen so the harness finishes in minutes on a
 * laptop without making the machine unusable; not measured, and it changes no reported number.
 * Palette work is CPU-bound in the candidate, so this is a throughput knob only.
 */
export const DEFAULT_CONCURRENCY = 4

// ---------------------------------------------------------------------------
// Candidate loading
// ---------------------------------------------------------------------------

export type LoadedCandidate = { candidateId: string; paletteOf: CandidatePalette; modulePath: string }

/**
 * Load a candidate module and refuse an unusable one loudly, at load time.
 *
 * The shape is the dev-loop bundle's: a module exporting `candidateId` and `paletteOf`. Failing
 * here rather than on the first image is deliberate — a typo in an export name should not look like
 * a candidate that disagrees with itself 100% of the time.
 */
export async function loadCandidate(modulePath: string): Promise<LoadedCandidate> {
	const absolute = path.isAbsolute(modulePath) ? modulePath : path.resolve(V3_ROOT, modulePath)
	const loaded = (await import(pathToFileURL(absolute).href)) as Record<string, unknown>
	const candidateId = loaded.candidateId
	const paletteOf = loaded.paletteOf
	if (typeof candidateId !== "string" || candidateId.length === 0) {
		throw new Error(`candidate ${modulePath} does not export a non-empty string \`candidateId\``)
	}
	if (typeof paletteOf !== "function") {
		throw new Error(`candidate ${modulePath} does not export a function \`paletteOf\``)
	}
	return { candidateId, paletteOf: paletteOf as CandidatePalette, modulePath: path.relative(REPO_ROOT, absolute) }
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

/**
 * Per-run memo of palettes, keyed by absolute path.
 *
 * Worth having for a real reason rather than for speed alone: the three JPEG arms of a cover share
 * one baseline, and an artwork can be an endpoint of several rendition pairs. Computing its palette
 * once per run also guarantees that the same file compared twice in one report cannot disagree with
 * itself through candidate nondeterminism — which is a *different* failure (the repeated-extraction
 * canary) and is not what this harness is measuring.
 */
export class PaletteMemo {
	private readonly entries = new Map<string, Promise<Palette>>()
	public millis = 0
	// Not a parameter property: `--experimental-strip-types` runs in strip-only mode, which
	// rejects TypeScript's constructor-parameter shorthand.
	private readonly paletteOf: CandidatePalette

	constructor(paletteOf: CandidatePalette) {
		this.paletteOf = paletteOf
	}

	get(absolutePath: string): Promise<Palette> {
		const existing = this.entries.get(absolutePath)
		if (existing) return existing
		const started = performance.now()
		const promise = this.paletteOf(absolutePath).then((palette) => {
			this.millis += performance.now() - started
			assertUsablePalette(palette, absolutePath)
			return palette
		})
		this.entries.set(absolutePath, promise)
		return promise
	}
}

function assertUsablePalette(palette: Palette, source: string): void {
	if (!palette || typeof palette !== "object" || !palette.roles) {
		throw new Error(`candidate returned no \`roles\` for ${source}`)
	}
	for (const role of ROLE_NAMES) {
		const color = palette.roles[role]
		if (!color || typeof color.hex !== "string" || !Array.isArray(color.rgb)) {
			throw new Error(`candidate returned no usable \`${role}\` for ${source}`)
		}
	}
}

/** Run async work over a list with bounded concurrency, preserving input order in the output. */
export async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length)
	let next = 0
	const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
		for (;;) {
			const index = next++
			if (index >= items.length) return
			results[index] = await worker(items[index]!, index)
		}
	})
	await Promise.all(runners)
	return results
}

type TrialSpec = {
	trialId: string
	kind: Trial["kind"]
	arm: Trial["arm"]
	artworkId: string
	reviewedness: Reviewedness
	collection: Trial["collection"]
	leftPath: string
	rightPath: string
	/** Work that must happen before the candidate is called (materialising a perturbed file). */
	prepare?: () => Promise<{ leftPath: string; rightPath: string }>
}

async function runTrial(spec: TrialSpec, memo: PaletteMemo, compare: CompareOptions): Promise<Trial> {
	const started = performance.now()
	let leftPath = spec.leftPath
	let rightPath = spec.rightPath
	const base = {
		trialId: spec.trialId,
		kind: spec.kind,
		arm: spec.arm,
		artworkId: spec.artworkId,
		reviewedness: spec.reviewedness,
		collection: spec.collection,
	}
	if (spec.prepare) {
		try {
			const prepared = await spec.prepare()
			leftPath = prepared.leftPath
			rightPath = prepared.rightPath
		} catch (error) {
			return {
				...base,
				leftPath,
				rightPath,
				comparison: null,
				error: { stage: "perturb", message: String(error instanceof Error ? error.message : error) },
				millis: performance.now() - started,
			}
		}
	}
	let left: Palette
	try {
		left = await memo.get(leftPath)
	} catch (error) {
		return {
			...base,
			leftPath,
			rightPath,
			comparison: null,
			error: { stage: "left", message: String(error instanceof Error ? error.message : error) },
			millis: performance.now() - started,
		}
	}
	let right: Palette
	try {
		right = await memo.get(rightPath)
	} catch (error) {
		return {
			...base,
			leftPath,
			rightPath,
			comparison: null,
			error: { stage: "right", message: String(error instanceof Error ? error.message : error) },
			millis: performance.now() - started,
		}
	}
	return {
		...base,
		leftPath,
		rightPath,
		comparison: comparePalettes(left, right, compare),
		error: null,
		millis: performance.now() - started,
	}
}

/**
 * Reviewedness is recomputed at check time, not read from the set file.
 *
 * The warehouse is append-only and actively written: every review round the reviewer completes adds
 * graded artworks. If the *label* were frozen with the sample, the reviewed-vs-unseen split would
 * quietly go stale — an artwork graded last week would still be counted as unseen, which is exactly
 * the direction that flatters the ratio.
 *
 * So the two halves are frozen separately, on purpose:
 *
 * - **membership** is frozen in the set file (drawn once, seeded, reproducible), and
 * - **the label** is recomputed live from today's warehouse.
 *
 * Growth in the warehouse therefore moves the split without re-rolling the sample, and the report
 * records how many labels moved since the draw. `useFrozenLabels` restores the old behaviour for
 * reproducing a historical report exactly.
 */
export type ReviewednessLabeller = { reviewedIds: Set<string> | null; relabelled: number }

function labelFor(
	labeller: ReviewednessLabeller,
	frozen: Reviewedness,
	artworkIds: readonly string[],
): Reviewedness {
	if (!labeller.reviewedIds) return frozen
	const live: Reviewedness = artworkIds.some((id) => labeller.reviewedIds!.has(id)) ? "reviewed" : "unseen"
	if (live !== frozen) labeller.relabelled += 1
	return live
}

export function pairTrialSpecs(pairSet: PairSetFile, repoRoot: string, labeller: ReviewednessLabeller): TrialSpec[] {
	return pairSet.pairs.map((pair) => ({
		trialId: `pair|${pair.pairId}`,
		kind: "rendition-pair" as const,
		arm: null,
		artworkId: pair.pairId,
		reviewedness: labelFor(labeller, pair.reviewedness, [pair.a.artworkId, pair.b.artworkId]),
		collection: pair.collection,
		leftPath: path.join(repoRoot, pair.a.path),
		rightPath: path.join(repoRoot, pair.b.path),
	}))
}

export function perturbationTrialSpecs(
	set: PerturbationSetFile,
	repoRoot: string,
	cacheDir: string,
	force: boolean,
	labeller: ReviewednessLabeller,
): TrialSpec[] {
	const specs: TrialSpec[] = []
	for (const cover of set.covers) {
		const source = path.join(repoRoot, cover.path)
		const reviewedness = labelFor(labeller, cover.reviewedness, [cover.artworkId])
		for (const arm of PERTURBATION_ARMS) {
			specs.push({
				trialId: `perturb|${cover.artworkId}|${arm.name}`,
				kind: "perturbation",
				arm: arm.name,
				artworkId: cover.artworkId,
				reviewedness,
				collection: cover.collection,
				leftPath: source,
				rightPath: source,
				prepare: async () => {
					const materialized = await materializeArm(source, cover.sha256, arm, cacheDir, force)
					return { leftPath: materialized.baselinePath, rightPath: materialized.perturbedPath }
				},
			})
		}
	}
	return specs
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function rateOver(group: string, trials: readonly Trial[]): AgreementRate {
	let agreed = 0
	let compared = 0
	let errored = 0
	for (const trial of trials) {
		if (trial.error || !trial.comparison) {
			errored += 1
			continue
		}
		compared += 1
		if (trial.comparison.same) agreed += 1
	}
	return agreementRate(group, agreed, compared, errored)
}

export function stabilityRatioOver(basis: string, trials: readonly Trial[], note?: string): StabilityRatio {
	const reviewed = rateOver(`${basis}|reviewed`, trials.filter((t) => t.reviewedness === "reviewed"))
	const unseen = rateOver(`${basis}|unseen`, trials.filter((t) => t.reviewedness === "unseen"))
	const ratio = reviewed.rate !== null && unseen.rate !== null && unseen.rate > 0 ? reviewed.rate / unseen.rate : null
	return {
		basis,
		reviewed,
		unseen,
		ratio,
		underpowered: reviewed.compared < MIN_COMPARISONS_FOR_RATIO || unseen.compared < MIN_COMPARISONS_FOR_RATIO,
		...(note ? { note } : {}),
	}
}

export function roleInstability(trials: readonly Trial[]): RoleInstability[] {
	return ROLE_NAMES.map((role: RoleName) => {
		let disagreed = 0
		let compared = 0
		for (const trial of trials) {
			if (!trial.comparison) continue
			const found = trial.comparison.comparisons.find((c) => c.role === role)
			if (!found) continue
			compared += 1
			if (!found.same) disagreed += 1
		}
		return { role, disagreed, compared, rate: compared > 0 ? disagreed / compared : null }
	})
}

export function summarize(
	trials: readonly Trial[],
	candidate: LoadedCandidate,
	compare: CompareOptions,
	sets: RobustnessReport["sets"],
	timing: RobustnessReport["timing"],
	now: string,
	reviewedness: RobustnessReport["reviewedness"],
): RobustnessReport {
	const pairs = trials.filter((t) => t.kind === "rendition-pair")
	const perturbations = trials.filter((t) => t.kind === "perturbation")
	const byPairType: AgreementRate[] = [rateOver("rendition-pair", pairs)]
	for (const arm of PERTURBATION_ARMS) {
		byPairType.push(rateOver(arm.name, perturbations.filter((t) => t.arm === arm.name)))
	}
	return {
		what: "Robustness of one candidate palette system under rendition pairs and invisible perturbations.",
		writtenAt: now,
		generatedBy: "research/v3/src/robustness/check.ts",
		candidate: { name: candidate.candidateId, version: candidate.candidateId, module: candidate.modulePath },
		compare,
		sets,
		reviewedness,
		overall: rateOver("overall", trials),
		byPairType,
		byReviewedness: [
			rateOver("all|reviewed", trials.filter((t) => t.reviewedness === "reviewed")),
			rateOver("all|unseen", trials.filter((t) => t.reviewedness === "unseen")),
		],
		stabilityRatios: [
			stabilityRatioOver(
				"perturbation",
				perturbations,
				"The reportable one: the perturbation sample is allocated 50/50 reviewed/unseen by construction.",
			),
			stabilityRatioOver(
				"rendition-pair",
				pairs,
				"Underpowered by construction: only 23 eligible pairs touch a graded artwork, and none have two.",
			),
		],
		byRole: roleInstability(trials),
		disagreements: trials.filter((t) => t.comparison && !t.comparison.same),
		errors: trials.filter((t) => t.error !== null),
		timing,
	}
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function formatRate(rate: AgreementRate): string {
	if (rate.rate === null) return `${rate.group.padEnd(24)} — no comparisons (${rate.errored} errored)`
	const interval = rate.interval ? ` [${(rate.interval[0] * 100).toFixed(1)}–${(rate.interval[1] * 100).toFixed(1)}]` : ""
	const errors = rate.errored > 0 ? `, ${rate.errored} errored` : ""
	return `${rate.group.padEnd(24)} ${(rate.rate * 100).toFixed(1)}%${interval}  (${rate.agreed}/${rate.compared}${errors})`
}

export function formatReport(report: RobustnessReport): string {
	const lines: string[] = []
	lines.push(`candidate: ${report.candidate.name}  (${report.candidate.module})`)
	lines.push(`bar mode:  ${report.compare.barMode}`)
	lines.push("")
	lines.push(formatRate(report.overall))
	lines.push("")
	lines.push("by pair type")
	for (const rate of report.byPairType) lines.push(`  ${formatRate(rate)}`)
	lines.push("")
	lines.push(
		`reviewed vs unseen  (v2-3: 1.61x, healthy ~1.0)  [labels: ${report.reviewedness.source}, ${report.reviewedness.relabelledSinceDraw} relabelled since the draw]`,
	)
	for (const ratio of report.stabilityRatios) {
		const value = ratio.ratio === null ? "n/a" : `${ratio.ratio.toFixed(3)}x`
		lines.push(`  ${ratio.basis.padEnd(16)} ${value}${ratio.underpowered ? "  UNDERPOWERED" : ""}`)
		lines.push(`    ${formatRate(ratio.reviewed)}`)
		lines.push(`    ${formatRate(ratio.unseen)}`)
	}
	lines.push("")
	lines.push("role instability (share of comparisons where the role moved)")
	for (const role of report.byRole) {
		const value = role.rate === null ? "n/a" : `${(role.rate * 100).toFixed(1)}%`
		lines.push(`  ${role.role.padEnd(12)} ${value}  (${role.disagreed}/${role.compared})`)
	}
	lines.push("")
	lines.push(`disagreeing trials: ${report.disagreements.length}`)
	lines.push(`errored trials:     ${report.errors.length}`)
	lines.push(
		`timing: ${report.timing.trials} trials, ${(report.timing.wallMillis / 1000).toFixed(1)}s wall, ${(report.timing.candidateMillis / 1000).toFixed(1)}s in candidate`,
	)
	return lines.join("\n")
}

export type CheckOptions = {
	candidatePath: string
	pairSetPath?: string
	perturbationSetPath?: string
	cacheDir?: string
	repoRoot?: string
	concurrency?: number
	limit?: number
	compare?: CompareOptions
	forcePerturb?: boolean
	skipPairs?: boolean
	skipPerturbations?: boolean
	warehousePath?: string
	/** Use the set files' frozen reviewedness labels instead of today's warehouse. */
	useFrozenLabels?: boolean
	now?: () => string
}

export async function check(options: CheckOptions): Promise<RobustnessReport> {
	const repoRoot = options.repoRoot ?? REPO_ROOT
	const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR
	const compare = options.compare ?? DEFAULT_COMPARE_OPTIONS
	const candidate = await loadCandidate(options.candidatePath)
	const startedAt = performance.now()

	const warehousePath = options.warehousePath ?? path.join(V3_ROOT, "data", "warehouse", "warehouse.jsonl")
	const labeller: ReviewednessLabeller = {
		reviewedIds: options.useFrozenLabels ? null : loadReviewedArtworkIds(warehousePath),
		relabelled: 0,
	}

	const sets: Record<string, { path: string; sha256: string }> = {}
	let specs: TrialSpec[] = []

	if (!options.skipPairs) {
		const pairSetPath = options.pairSetPath ?? DEFAULT_PAIR_SET
		const pairSet = JSON.parse(await readFile(pairSetPath, "utf8")) as PairSetFile
		sets.pairSet = { path: path.relative(repoRoot, pairSetPath), sha256: await sha256Of(pairSetPath) }
		specs.push(...pairTrialSpecs(pairSet, repoRoot, labeller))
	}
	if (!options.skipPerturbations) {
		const perturbationSetPath = options.perturbationSetPath ?? DEFAULT_PERTURBATION_SET
		const perturbationSet = JSON.parse(await readFile(perturbationSetPath, "utf8")) as PerturbationSetFile
		sets.perturbationSet = {
			path: path.relative(repoRoot, perturbationSetPath),
			sha256: await sha256Of(perturbationSetPath),
		}
		specs.push(
			...perturbationTrialSpecs(perturbationSet, repoRoot, cacheDir, options.forcePerturb ?? false, labeller),
		)
		sets.warehouse = { path: path.relative(repoRoot, warehousePath), sha256: await sha256Of(warehousePath) }
	}
	if (options.limit !== undefined) specs = specs.slice(0, options.limit)

	const memo = new PaletteMemo(candidate.paletteOf)
	const trials = await mapWithConcurrency(specs, options.concurrency ?? DEFAULT_CONCURRENCY, (spec) =>
		runTrial(spec, memo, compare),
	)
	const now = options.now ? options.now() : new Date().toISOString()
	return summarize(
		trials,
		candidate,
		compare,
		sets,
		{
			trials: trials.length,
			wallMillis: performance.now() - startedAt,
			candidateMillis: memo.millis,
		},
		now,
		{
			source: options.useFrozenLabels ? "frozen-set-file" : "live-warehouse",
			relabelledSinceDraw: labeller.relabelled,
			reviewedArtworksInWarehouse: labeller.reviewedIds ? labeller.reviewedIds.size : null,
		},
	)
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			candidate: { type: "string" },
			pairs: { type: "string" },
			perturbations: { type: "string" },
			cache: { type: "string" },
			out: { type: "string" },
			concurrency: { type: "string" },
			limit: { type: "string" },
			"bar-mode": { type: "string" },
			"force-perturb": { type: "boolean", default: false },
			"skip-pairs": { type: "boolean", default: false },
			"skip-perturbations": { type: "boolean", default: false },
			"emit-diff-set": { type: "string" },
			"frozen-labels": { type: "boolean", default: false },
		},
	})
	if (!values.candidate) {
		console.error(
			"usage: node --experimental-strip-types src/robustness/check.ts --candidate <module.ts> [--pairs f] [--perturbations f] [--limit n] [--out f]",
		)
		process.exitCode = 2
		return
	}
	const report = await check({
		candidatePath: values.candidate,
		pairSetPath: values.pairs,
		perturbationSetPath: values.perturbations,
		cacheDir: values.cache,
		concurrency: values.concurrency ? Number(values.concurrency) : undefined,
		limit: values.limit ? Number(values.limit) : undefined,
		compare: values["bar-mode"]
			? { ...DEFAULT_COMPARE_OPTIONS, barMode: values["bar-mode"] as CompareOptions["barMode"] }
			: undefined,
		forcePerturb: values["force-perturb"],
		skipPairs: values["skip-pairs"],
		skipPerturbations: values["skip-perturbations"],
		useFrozenLabels: values["frozen-labels"],
	})
	console.log(formatReport(report))

	const outPath = values.out ?? path.join(DEFAULT_REPORT_DIR, `${report.candidate.name}.json`)
	await mkdir(path.dirname(outPath), { recursive: true })
	await writeFile(outPath, `${JSON.stringify(report, null, "\t")}\n`)
	console.log(`\nreport: ${path.relative(REPO_ROOT, outPath)}`)

	if (values["emit-diff-set"]) {
		// One image path per line — the set-file shape the dev loop's viewer and diff read.
		const paths = new Set<string>()
		for (const trial of report.disagreements) {
			paths.add(path.relative(REPO_ROOT, trial.leftPath))
			paths.add(path.relative(REPO_ROOT, trial.rightPath))
		}
		const body = [
			`# disagreeing images from ${report.candidate.name}, ${report.writtenAt}`,
			...[...paths].sort(),
			"",
		].join("\n")
		await mkdir(path.dirname(values["emit-diff-set"]), { recursive: true })
		await writeFile(values["emit-diff-set"], body)
		console.log(`diff set: ${values["emit-diff-set"]} (${paths.size} images)`)
	}
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	await main()
}
