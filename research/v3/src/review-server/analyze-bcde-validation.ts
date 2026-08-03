/**
 * The group-BCDE reviewer validation round — analysis (PREMISE_NEXT.md §15.9).
 *
 * The pilot (`bcde-pilot-1-analysis.json`) measured the instrument against itself: two prompt
 * orderings, E and F, and how often they said the same thing. Its own opening line is the reason
 * this file exists — *"NO GROUND TRUTH EXISTS for these thirteen questions … no number in this file
 * is an accuracy and none may be quoted as one."* A model can be perfectly self-consistent and
 * perfectly wrong. This round is the first human answer to any of these questions, and this script
 * is what puts the human beside the two model variants.
 *
 * **What it can and cannot say, stated before any number.** The round draws its twenty artworks from
 * the coverage set's core, which is the corpus's bench; the pilot ran on eval-142, which
 * `COVERAGE_SET.md` establishes was never a sample of this corpus. The two overlap on **three**
 * artworks — two on the same bytes, one at another rendition. So the reviewer-vs-model join is
 * three rows wide, and every agreement number below is reported with its n beside it and a kappa
 * that refuses to compute under `MIN_KAPPA_N`. What the round *does* buy at full width is the thing
 * §15.9 says is its real product: **which of these questions a human can answer at all**, on twenty
 * covers drawn to look like the corpus — plus twenty labels per question deposited on the bench,
 * where the next VLM run can meet them.
 *
 * **Never one accuracy number** (PHASE_0_DECISIONS.md §4 P6, and §8's restatement). Every join is
 * reported in P6's three buckets — agreement, disagreement, can't-tell — per question, per variant,
 * and split by whether E and F agreed with each other in the first place. A row where the two
 * variants split is not evidence about the model's accuracy; it is evidence about which wording the
 * human's answer landed on, and it is reported as that.
 *
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/src/review-server/analyze-bcde-validation.ts \
 *     [--warehouse <path>] [--fixture <path>] [--batch <id>] [--run <jsonl>] [--out <path>]
 *
 * It runs on a half-answered round, and on an unanswered one, and reports what is missing rather
 * than throwing — the same rule `analyze-oracle-validation.ts` follows.
 */
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { DEFAULT_WAREHOUSE_PATH } from "../warehouse/cli.ts"
import type { OracleLabelRecord, WarehouseRecord } from "../warehouse/records.ts"
import { readAll, resolve } from "../warehouse/warehouse.ts"
import {
	BCDE_PILOT_RUN_PATH,
	BCDE_VALIDATION_BATCH_ID,
	BCDE_VALIDATION_FIXTURE_PATH,
	BCDE_VALIDATION_OMITTED_REASONS,
	BCDE_VALIDATION_QUESTION_REASONS,
	type OracleValidationFixture,
} from "./oracle-validation.ts"
import { REPO_ROOT } from "./server.ts"
import type { SupersedingOracleLabel } from "./types.ts"

export const BCDE_VALIDATION_ANALYSIS_PATH = fileURLToPath(
	new URL("../../data/oracle-validation/bcde-validation-1-analysis.json", import.meta.url),
)

/**
 * The smallest join a kappa is computed on.
 *
 * Below this the coefficient is not a weak estimate, it is an artefact: on a handful of rows a
 * single cell decides the marginals, and kappa's correction for chance divides by a quantity
 * estimated from those same few rows. §15.9 already says as much for the round's own size — "at
 * n=20 the 1σ binomial noise is about ±2 items, so only large gaps mean anything" — and the
 * reviewer-vs-model join here is far smaller than 20. The counts are always reported; the
 * coefficient is null with its reason attached.
 * [REVIEWED] — PREMISE_NEXT.md §15.9's own noise statement, applied to a smaller n.
 */
export const MIN_KAPPA_N = 10

/**
 * The two prompt orderings the pilot ran. E is the wording this round's questions were parsed from.
 * [INHERITED] — `bcde-pilot-1-analysis.json` `inputs.prompt_files`.
 */
export const PILOT_VARIANTS = ["E", "F"] as const
export type PilotVariant = (typeof PILOT_VARIANTS)[number]

/** How well one artwork joins to the pilot's rows. Two grades, never pooled. */
export type JoinGrade = "exact_bytes" | "same_artwork_other_rendition" | "none"

/**
 * The join grades that carry a model answer, and therefore a statistic.
 *
 * Every joined number in this file is keyed by one of these. There is deliberately **no pooled
 * total** anywhere in the output: the scoping note says the grades are never pooled, and a file that
 * says that while emitting `2 agree / 1 disagree` over both grades is not scoped, it is captioned.
 * A 300 px and a 640 px rendition are different items (CONVENTIONS.md), and the note itself flags
 * `grain_or_noise` as something that can legitimately differ between them — so a rendition
 * disagreement pooled into a headline reads as model error when it may be nothing of the kind.
 */
export const JOINED_GRADES = ["exact_bytes", "same_artwork_other_rendition"] as const
export type JoinedGrade = (typeof JOINED_GRADES)[number]

/**
 * How alike two renditions must look before they are called the same artwork.
 *
 * Normalized 16x16 luma correlation. [MEASURED] — the adversarial audit swept all 20 round artworks
 * against all 142 pilot images: the three true pairs scored 0.9862 and above, and the highest
 * non-match scored 0.791. Anything in between is a gap wide enough that a single threshold is not a
 * tuning choice.
 */
export const SAME_ARTWORK_LUMA_CORRELATION = 0.9

/** Side length of the luma thumbnail the correlation is computed on. [n=1] — the audit's own grid. */
export const LUMA_GRID = 16

/** P6's three buckets (PHASE_0_DECISIONS.md §4), applied to a (reviewer, variant) pair. */
export type PairBucket = "agreement" | "disagreement" | "cant_tell"

type PilotRow = Readonly<{
	is_canary?: boolean
	status?: string
	parse_failed?: boolean
	parsed?: Record<string, string | string[]> | null
	image_sha256: string
	image_path: string
	artwork_id?: string
	prompt_variant: string
}>

export type PilotAnswers = Readonly<{
	bySha: ReadonlyMap<string, ReadonlyMap<string, Record<string, string | string[]>>>
	byArtwork: ReadonlyMap<string, ReadonlyMap<string, Record<string, string | string[]>>>
	/** `artwork_id` → the rendition the pilot decoded, so an other-rendition join can be named. */
	pathByArtwork: ReadonlyMap<string, string>
	/** `image_sha256` → the file the pilot decoded, so an exact-byte join can be re-hashed. */
	pathBySha: ReadonlyMap<string, string>
	/** `image_sha256` the pilot declared for each `artwork_id`, for the same reason. */
	shaByArtwork: ReadonlyMap<string, string>
	/**
	 * Every `prompt_variant` seen in the file. `PILOT_VARIANTS` is a hardcoded pair, so a third
	 * variant would otherwise be dropped without a word; this is what lets the analysis say so.
	 */
	variantsSeen: readonly string[]
	images: number
}>

/** Index the pilot's parsed answers by both join keys. Canaries and failed rows never enter. */
export async function readPilotAnswers(path = BCDE_PILOT_RUN_PATH): Promise<PilotAnswers> {
	const text = await readFile(path, "utf8")
	const bySha = new Map<string, Map<string, Record<string, string | string[]>>>()
	const byArtwork = new Map<string, Map<string, Record<string, string | string[]>>>()
	const pathByArtwork = new Map<string, string>()
	const pathBySha = new Map<string, string>()
	const shaByArtwork = new Map<string, string>()
	const variantsSeen = new Set<string>()
	for (const line of text.split("\n")) {
		const trimmed = line.trim()
		if (trimmed.length === 0) continue
		const row = JSON.parse(trimmed) as PilotRow
		if (row.is_canary === true || row.parse_failed === true || !row.parsed) continue
		if (row.status !== undefined && row.status !== "ok") continue
		variantsSeen.add(row.prompt_variant)
		let sha = bySha.get(row.image_sha256)
		if (sha === undefined) bySha.set(row.image_sha256, (sha = new Map()))
		sha.set(row.prompt_variant, row.parsed)
		pathBySha.set(row.image_sha256, row.image_path)
		if (typeof row.artwork_id === "string") {
			let art = byArtwork.get(row.artwork_id)
			if (art === undefined) byArtwork.set(row.artwork_id, (art = new Map()))
			art.set(row.prompt_variant, row.parsed)
			pathByArtwork.set(row.artwork_id, row.image_path)
			shaByArtwork.set(row.artwork_id, row.image_sha256)
		}
	}
	return {
		bySha,
		byArtwork,
		pathByArtwork,
		pathBySha,
		shaByArtwork,
		variantsSeen: [...variantsSeen].sort(),
		images: bySha.size,
	}
}

/* ------------------------------------------------------------------------------------------- */
/* Verifying the join against the actual image bytes                                             */
/* ------------------------------------------------------------------------------------------- */

/**
 * Whether the three claimed overlaps are real, checked against the files rather than against ids.
 *
 * The join itself is `artworkId` **string equality** across three mixed id namespaces — the pilot
 * index holds 24-hex sharded suffixes beside bare filename stems (`"disney"`, `"doja"`), the round
 * holds 24-hex beside 32-hex music-artworks stems — which is precisely what CONVENTIONS.md forbids
 * ("identify artworks by full path + content hash, never by id prefix"), in the join that produces
 * the headline. It got the right answer, but by luck of a perfect prefix convention rather than by
 * verification, and a join that is right by luck is a join that will be wrong quietly.
 *
 * So: every declared sha256 is recomputed from the file on disk, and every id-based rendition match
 * is confirmed perceptually before it is allowed to carry a statistic. A pair that fails is not a
 * join, and the artwork drops to `none` rather than contributing a comparison nobody checked.
 *
 * NOT re-run here: the full 20 x 142 perceptual sweep for *missed* overlaps. The audit did it once
 * (only the three pairs exceed 0.90; the highest non-match is 0.791) and it costs 2,840 decodes; the
 * overlap is by construction anyway (`BCDE_SELECTION_RULE` pins every core artwork the pilot
 * decoded). See PHASE_0_LOOSE_ENDS.md for the condition that revives it.
 */
export type OverlapVerification = Readonly<{
	method: string
	threshold: number
	imageRoot: string
	/** Round artworks whose file did not hash to the sha256 the fixture declares. */
	roundHashMismatches: readonly string[]
	/** Pilot rows whose file did not hash to the sha256 the run declares. */
	pilotHashMismatches: readonly string[]
	/** Paths that could not be read at all. A join cannot be verified against a file that is not there. */
	unresolvedPaths: readonly string[]
	/** One entry per artwork the id-based join proposed, with the evidence for or against it. */
	pairs: readonly Readonly<{
		sha256: string
		artworkId: string | null
		proposedGrade: JoinGrade
		roundPath: string
		pilotPath: string | null
		lumaCorrelation: number | null
		accepted: boolean
		reason: string
	}>[]
}>

/** Normalized 16x16 luma vector for one image. Null when the file cannot be read or decoded. */
async function lumaVector(absolutePath: string): Promise<Float64Array | null> {
	try {
		const { default: sharp } = await import("sharp")
		const raw = await sharp(absolutePath)
			.greyscale()
			.resize(LUMA_GRID, LUMA_GRID, { fit: "fill" })
			.raw()
			.toBuffer()
		const values = Float64Array.from(raw.subarray(0, LUMA_GRID * LUMA_GRID))
		const mean = values.reduce((sum, value) => sum + value, 0) / values.length
		let variance = 0
		for (const value of values) variance += (value - mean) ** 2
		const deviation = Math.sqrt(variance)
		// A perfectly flat image has zero deviation; normalizing would divide by zero, and a flat
		// image correlates with nothing, so it is reported as unverifiable rather than as a match.
		if (deviation === 0) return null
		return values.map((value) => (value - mean) / deviation)
	} catch {
		return null
	}
}

function correlation(a: Float64Array, b: Float64Array): number {
	let sum = 0
	for (let index = 0; index < a.length; index += 1) sum += a[index] * b[index]
	return Number(sum.toFixed(4))
}

async function sha256Of(absolutePath: string): Promise<string | null> {
	try {
		return createHash("sha256")
			.update(await readFile(absolutePath))
			.digest("hex")
	} catch {
		return null
	}
}

export async function verifyPilotOverlap(
	fixture: OracleValidationFixture,
	pilot: PilotAnswers,
	imageRoot: string,
): Promise<OverlapVerification> {
	const roundHashMismatches: string[] = []
	const pilotHashMismatches: string[] = []
	const unresolvedPaths: string[] = []
	const pairs: OverlapVerification["pairs"] = []
	const seen = new Set<string>()

	const checkFile = async (relative: string, declared: string, into: string[]): Promise<boolean> => {
		const actual = await sha256Of(join(imageRoot, relative))
		if (actual === null) {
			unresolvedPaths.push(relative)
			return false
		}
		if (actual !== declared) {
			into.push(relative)
			return false
		}
		return true
	}

	for (const item of fixture.items) {
		if (seen.has(item.sha256)) continue
		seen.add(item.sha256)
		const roundOk = await checkFile(item.imagePath, item.sha256, roundHashMismatches)

		if (pilot.bySha.has(item.sha256)) {
			// An exact-byte join is already a content-hash join; all it needs is that both declarations
			// are true of the files they name.
			const pilotPath = pilot.pathBySha.get(item.sha256)!
			const pilotOk = await checkFile(pilotPath, item.sha256, pilotHashMismatches)
			pairs.push({
				sha256: item.sha256,
				artworkId: item.artworkId,
				proposedGrade: "exact_bytes",
				roundPath: item.imagePath,
				pilotPath,
				lumaCorrelation: null,
				accepted: roundOk && pilotOk,
				reason:
					roundOk && pilotOk
						? "both files hash to the sha256 they declare, and the two sha256 are the same"
						: "a declared sha256 does not match the file that carries it",
			})
			continue
		}

		const artworkId = item.artworkId
		if (artworkId === null || !pilot.byArtwork.has(artworkId)) continue
		const pilotPath = pilot.pathByArtwork.get(artworkId)!
		const pilotOk = await checkFile(pilotPath, pilot.shaByArtwork.get(artworkId)!, pilotHashMismatches)
		const [here, there] = await Promise.all([lumaVector(join(imageRoot, item.imagePath)), lumaVector(join(imageRoot, pilotPath))])
		const score = here === null || there === null ? null : correlation(here, there)
		const accepted = roundOk && pilotOk && score !== null && score >= SAME_ARTWORK_LUMA_CORRELATION
		pairs.push({
			sha256: item.sha256,
			artworkId,
			proposedGrade: "same_artwork_other_rendition",
			roundPath: item.imagePath,
			pilotPath,
			lumaCorrelation: score,
			accepted,
			reason:
				score === null
					? "one of the two renditions could not be decoded, so the id match stands unverified"
					: accepted
						? `the two renditions correlate at ${score}, above the ${SAME_ARTWORK_LUMA_CORRELATION} floor`
						: `the two renditions correlate at ${score}, below the ${SAME_ARTWORK_LUMA_CORRELATION} floor — the id matched and the pictures did not`,
		})
	}

	return {
		method:
			`sha256 recomputed from file bytes for every round artwork and every pilot row it joins; ` +
			`id-based rendition matches confirmed by normalized ${LUMA_GRID}x${LUMA_GRID} luma correlation`,
		threshold: SAME_ARTWORK_LUMA_CORRELATION,
		imageRoot,
		roundHashMismatches,
		pilotHashMismatches,
		unresolvedPaths,
		pairs,
	}
}

/* ------------------------------------------------------------------------------------------- */
/* Reading the warehouse                                                                         */
/* ------------------------------------------------------------------------------------------- */

/**
 * One link of a supersession chain that leaves the analyzed batch.
 *
 * `asGiven` is what the analyzed round recorded; `standing` is what the end of the chain says. They
 * are kept apart everywhere, because they answer two different questions — "what did this
 * elicitation design produce" and "what does the reviewer now hold" — and a file that reports one
 * under the other's name is worse than a file that reports neither.
 */
export type CrossBatchSupersession = Readonly<{
	questionKey: string
	imageId: string
	asGiven: string | readonly string[]
	standing: string | readonly string[]
	/** True when the end of the chain says something different from the analyzed round. */
	changed: boolean
	/** The analyzed batch's record first, then every superseder that replaced it, in order. */
	chain: readonly Readonly<{ recordId: string; batchId: string | null; revision: number | null; answer: string | readonly string[] }>[]
}>

export type ReviewerAnswers = Readonly<{
	/**
	 * AS GIVEN. `questionKey` + " " + `imageId` → the answer the ANALYZED BATCH recorded, with that
	 * batch's own supersessions applied and nothing from any other round. This is the measurement of
	 * the round's own elicitation design, and it never moves once the round is released.
	 */
	byQuestionAndImage: ReadonlyMap<string, string | readonly string[]>
	/**
	 * STANDING. The same keys, each carried to the END OF ITS SUPERSESSION CHAIN — including links in
	 * OTHER batches, which is what a reconciliation round writes. This is the reviewer's current
	 * position; it is what any later consumer of these labels must read.
	 */
	standingByQuestionAndImage: ReadonlyMap<string, string | readonly string[]>
	/** Every key whose chain left the analyzed batch, changed or not. Empty when none did. */
	crossBatchSupersessions: readonly CrossBatchSupersession[]
	/** The other batches that carry a superseder of a record in this one, sorted. */
	supersedingBatchIds: readonly string[]
	skipped: Readonly<Record<string, number>>
}>

/** A chain longer than this is a bug or a loop, not a re-answer. Nothing near it exists in the log. */
const MAX_SUPERSESSION_DEPTH = 64

/**
 * The reviewer's final answer per (question, image).
 *
 * Same supersession rule the server and every other analysis use: amendments applied first,
 * retracted records dropped, one standing answer per item. Unlike the probe-gold reader this one
 * keeps array answers — the multi-select is the point.
 *
 * **Two ways to know which of several answers stands, in priority order.**
 *
 *  1. A record that NAMES the record it replaces (`supersedes`, written by the server). Then the
 *     standing answer is simply the one no other record replaced, and the reader needs no convention
 *     at all — it can be checked, it survives reordering, and it agrees with anyone else who reads
 *     the same field.
 *  2. FILE ORDER, for records written before that field existed. It is the right answer for an
 *     append-only log, but it is a convention every consumer has to reproduce exactly and one that
 *     silently disagrees with `wc -l`: the bcde round is 163 records covering 160 answers, and
 *     anybody counting rows sees three phantoms.
 *
 * Both paths agree on today's data. Only the first can be verified.
 *
 * **A chain can leave the batch, and the batch filter must not hide that.** A reconciliation round is
 * a separate batch whose records name records of this one in `supersedes` — cross-batch supersession,
 * by design: "answers supersede bcde-validation-1's for the same (question, artwork); nothing is
 * edited or deleted". Scoping to `batchId` before resolving supersession therefore drops exactly the
 * records that say what the reviewer now holds, and the analysis reports a superseded answer as
 * current. Both readings are produced here and neither is allowed to stand in for the other:
 * `byQuestionAndImage` is AS GIVEN by this round, `standingByQuestionAndImage` is the end of every
 * chain. Nothing is mutated, and no record outside this batch contributes an answer to a
 * (question, image) this batch never asked — a superseder only ever replaces a value that is already
 * there.
 */
export function collectBcdeAnswers(records: readonly WarehouseRecord[], batchId: string): ReviewerAnswers {
	const skipped: Record<string, number> = { otherBatch: 0, machineAuthored: 0, retracted: 0, superseded: 0, unusableAnswer: 0 }
	type Candidate = { answer: string | readonly string[]; index: number; recordId: string }
	type Usable = { label: SupersedingOracleLabel; answer: string | readonly string[]; index: number; inBatch: boolean }
	const candidates = new Map<string, Candidate[]>()
	const replaced = new Set<string>()
	/** Every usable oracle-label in the WHOLE log, by every id it answers to. Chains are walked here. */
	const usableById = new Map<string, Usable>()
	/** `supersedes` target → the usable records that claim to replace it, any batch. */
	const supersededBy = new Map<string, Usable[]>()

	resolve(records).forEach((entry, index) => {
		if (entry.record.type !== "oracle-label") return
		const label = entry.record as SupersedingOracleLabel
		const inBatch = label.batch?.id === batchId
		// A record that cannot stand as an answer here cannot stand as a superseder either: a retracted
		// or machine-authored re-answer leaves the record it named in force, so the chain simply stops.
		// These three checks therefore run on EVERY record, not only this batch's.
		const answer = label.answer
		const usableAnswer = typeof answer === "string" || (Array.isArray(answer) && answer.every((value) => typeof value === "string"))
		const usable = !entry.retracted && label.author.kind === "human" && usableAnswer

		if (usable) {
			const held: Usable = { label, answer, index, inBatch }
			// Indexed under both ids: `supersedes` names the id the server wrote, and an amendment can
			// have moved `entry.record.id` on since. Looking up only one of the two would break a chain
			// that an amendment touched.
			usableById.set(label.id, held)
			usableById.set(entry.original.id, held)
			if (typeof label.supersedes === "string") {
				const list = supersededBy.get(label.supersedes)
				if (list === undefined) supersededBy.set(label.supersedes, [held])
				else list.push(held)
			}
		}

		// Batch scoping comes FIRST for the counters, so every one of them below is a statement about
		// *this* round. A retraction in some other round used to increment this round's `retracted`; it
		// read 0 only because all 13 retractions in the warehouse target `note` records, which never
		// reach here.
		if (!inBatch) {
			skipped.otherBatch++
			return
		}
		if (entry.retracted) {
			skipped.retracted++
			return
		}
		if (label.author.kind !== "human") {
			skipped.machineAuthored++
			return
		}
		if (!usableAnswer) {
			skipped.unusableAnswer++
			return
		}
		if (typeof label.supersedes === "string") replaced.add(label.supersedes)
		const key = `${label.questionKey} ${label.imageId}`
		const held = candidates.get(key)
		if (held === undefined) candidates.set(key, [{ answer, index, recordId: label.id }])
		else {
			held.push({ answer, index, recordId: label.id })
			skipped.superseded++
		}
	})

	const asGiven = new Map<string, string | readonly string[]>()
	/** The record id the AS-GIVEN answer came from, so its chain can be walked forward from there. */
	const asGivenRecordId = new Map<string, string>()
	for (const [key, held] of candidates) {
		// Path 1 where the records carry it; path 2 — the last one in the file — where they do not.
		const survivors = held.filter((candidate) => !replaced.has(candidate.recordId))
		const chosen = (survivors.length > 0 ? survivors : held).reduce((latest, candidate) =>
			candidate.index > latest.index ? candidate : latest,
		)
		asGiven.set(key, chosen.answer)
		asGivenRecordId.set(key, chosen.recordId)
	}

	/* --- carry each as-given answer to the end of its chain, wherever the chain goes -------------- */

	const standing = new Map<string, string | readonly string[]>(asGiven)
	const crossBatchSupersessions: CrossBatchSupersession[] = []
	const supersedingBatchIds = new Set<string>()
	for (const [key, recordId] of asGivenRecordId) {
		const start = usableById.get(recordId)
		if (start === undefined) continue
		const chain: { recordId: string; batchId: string | null; revision: number | null; answer: string | readonly string[] }[] = [
			{ recordId, batchId: start.label.batch?.id ?? null, revision: start.label.revision ?? null, answer: start.answer },
		]
		const seen = new Set<string>([recordId])
		let current = start
		let leftTheBatch = false
		for (let depth = 0; depth < MAX_SUPERSESSION_DEPTH; depth += 1) {
			const claimants = supersededBy.get(current.label.id) ?? supersededBy.get(chain[chain.length - 1].recordId) ?? []
			// Latest wins, by the same file-order rule the in-batch path uses — two records claiming the
			// same predecessor is a re-answer of a re-answer, not a fork.
			const next = claimants.filter((claim) => !seen.has(claim.label.id)).reduce<Usable | null>(
				(latest, claim) => (latest === null || claim.index > latest.index ? claim : latest),
				null,
			)
			if (next === null) break
			seen.add(next.label.id)
			chain.push({
				recordId: next.label.id,
				batchId: next.label.batch?.id ?? null,
				revision: next.label.revision ?? null,
				answer: next.answer,
			})
			if (!next.inBatch) {
				leftTheBatch = true
				if (next.label.batch?.id !== undefined) supersedingBatchIds.add(next.label.batch.id)
			}
			current = next
		}
		if (chain.length === 1) continue
		standing.set(key, current.answer)
		if (!leftTheBatch) continue
		const given = asGiven.get(key)!
		const split = key.indexOf(" ")
		crossBatchSupersessions.push({
			questionKey: key.slice(0, split),
			imageId: key.slice(split + 1),
			asGiven: given,
			standing: current.answer,
			changed: !sameAnswer(given, current.answer),
			chain,
		})
	}

	crossBatchSupersessions.sort((a, b) => (`${a.questionKey} ${a.imageId}` < `${b.questionKey} ${b.imageId}` ? -1 : 1))
	return {
		byQuestionAndImage: asGiven,
		standingByQuestionAndImage: standing,
		crossBatchSupersessions,
		supersedingBatchIds: [...supersedingBatchIds].sort(),
		skipped,
	}
}

/* ------------------------------------------------------------------------------------------- */
/* Comparing two answers                                                                         */
/* ------------------------------------------------------------------------------------------- */

/**
 * The vocabulary values that mean "this question does not apply to this cover".
 *
 * §15.4 added five of these and §15.8 warns about them in the same breath: "a value that maps to no
 * decision is a value that can refuse the question". A pair where either side refuses is P6's
 * can't-tell — it is not an agreement and it is not an error, and pooling it into either would be
 * the exact mistake §4 wrote the third bucket to prevent.
 * [INHERITED] — `group-bcde.v1.variant-e.json` vocabularies; `not_applicable` is the only spelling.
 */
export const REFUSAL_VALUES: readonly string[] = ["not_applicable"]

function isRefusal(answer: string | readonly string[]): boolean {
	return typeof answer === "string" ? REFUSAL_VALUES.includes(answer) : answer.every((value) => REFUSAL_VALUES.includes(value))
}

export function sameAnswer(a: string | readonly string[], b: string | readonly string[]): boolean {
	if (typeof a === "string" || typeof b === "string") return typeof a === "string" && typeof b === "string" && a === b
	return [...a].sort().join("\u0000") === [...b].sort().join("\u0000")
}

/** Jaccard on two sets. 1 when both are empty, which cannot happen here — a set answer is non-empty. */
export function jaccard(a: readonly string[], b: readonly string[]): number {
	const left = new Set(a)
	const right = new Set(b)
	const union = new Set([...left, ...right])
	if (union.size === 0) return 1
	let shared = 0
	for (const value of left) if (right.has(value)) shared += 1
	return shared / union.size
}

export function bucketOf(reviewer: string | readonly string[], model: string | readonly string[]): PairBucket {
	if (isRefusal(reviewer) || isRefusal(model)) return "cant_tell"
	return sameAnswer(reviewer, model) ? "agreement" : "disagreement"
}

/**
 * One answer as a single token, for a kappa vector, a distribution key and a set comparison alike.
 *
 * There used to be three spellings of this in one function — source order for the distribution,
 * sorted for the kappa token, sorted again inside `sameAnswer` — which agreed only because every
 * array in this round happens to have length 1. The first two-element answer would have made the
 * distribution and the kappa disagree about what the reviewer said.
 */
export function canonicalToken(answer: string | readonly string[]): string {
	return typeof answer === "string" ? answer : [...answer].sort().join("+")
}

/* ------------------------------------------------------------------------------------------- */
/* Gate consistency                                                                              */
/* ------------------------------------------------------------------------------------------- */

/**
 * The pre-registered contradiction rate the gate-consistency table is judged against.
 * [REVIEWED] — `oracle/premise/PREMISE_NEXT.md` §15.6-(3): *"Pre-registered ceiling: total
 * contradiction rate <= 10% of ok rows"*. It was written for the model. It is applied here to the
 * human, because these rows are the reference standard the model will be graded against, and a
 * reference standard held to a looser bar than the thing it measures is not a standard.
 */
export const CONTRADICTION_CEILING = 0.1

export type GateRule = Readonly<{
	/** The number in PREMISE_NEXT.md §15.6-(3)'s table. Kept so the two can be read side by side. */
	id: number
	gateKey: string
	/** The gate answers that arm the rule. */
	gateValues: readonly string[]
	/** Whether the rule arms when the gate IS one of those values, or when it is not. */
	gateIs: "in" | "not-in"
	conditionalKey: string
	/** What the conditional must be for the pair to be consistent. */
	expect: "refusal" | "substantive"
	statement: string
	reading: string
}>

/**
 * The gate-consistency table, transcribed from PREMISE_NEXT.md §15.6-(3).
 *
 * All twelve rows are listed, including the ones this round cannot evaluate, because "we did not
 * measure it" and "it did not fire" are different facts and an omitted row reads as the second.
 * Rows 7 and 8 are about multi-select shape rather than a gate pair, so they are checked separately.
 * [INHERITED] — the table is the reviewer's pre-registration, not a choice made here.
 */
export const GATE_CONSISTENCY_RULES: readonly GateRule[] = [
	{
		id: 1,
		gateKey: "has_text",
		gateValues: ["no", "illegible_at_this_size"],
		gateIs: "in",
		conditionalKey: "text_roles",
		expect: "refusal",
		statement: "has_text in {no, illegible_at_this_size} but text_roles != [not_applicable]",
		reading: "a kind of text named after saying it could not be read",
	},
	{
		id: 2,
		gateKey: "has_text",
		gateValues: ["no", "illegible_at_this_size"],
		gateIs: "in",
		conditionalKey: "text_dominance",
		expect: "refusal",
		statement: "has_text in {no, illegible_at_this_size} but text_dominance != not_applicable",
		reading: "the same, for weight",
	},
	{
		id: 3,
		gateKey: "has_text",
		gateValues: ["yes"],
		gateIs: "in",
		conditionalKey: "text_roles",
		expect: "substantive",
		statement: "has_text == yes but text_roles == [not_applicable]",
		reading: "text seen, no kind nameable — legitimate on odd covers; a high rate means the role vocabulary does not cover the corpus",
	},
	{
		id: 4,
		gateKey: "has_dominant_subject",
		gateValues: ["none"],
		gateIs: "in",
		conditionalKey: "subject_area_band",
		expect: "refusal",
		statement: "has_dominant_subject == none but subject_area_band != not_applicable",
		reading: "a size for a subject it said was absent",
	},
	{
		id: 5,
		gateKey: "has_signature_color",
		gateValues: ["no"],
		gateIs: "in",
		conditionalKey: "signature_carrier",
		expect: "refusal",
		statement: "has_signature_color == no but signature_carrier != not_applicable",
		reading: "a carrier for a colour it said does not exist",
	},
	{
		id: 6,
		gateKey: "has_signature_color",
		gateValues: ["yes"],
		gateIs: "in",
		conditionalKey: "signature_carrier",
		expect: "substantive",
		statement: "has_signature_color == yes but signature_carrier == not_applicable",
		reading: "the accent question refusing itself — §15.6-(3) calls this the single most decision-relevant contradiction in the set",
	},
	{
		id: 9,
		gateKey: "has_dominant_subject",
		gateValues: ["none"],
		gateIs: "in",
		conditionalKey: "subject_kind",
		expect: "refusal",
		statement: "has_dominant_subject == none but subject_kind != not_applicable",
		reading: "a noun for a subject it said was absent — §15.6-(3) calls this the one that matters most for the SAM handoff, because it is the shape of a bad concept prompt",
	},
	{
		id: 10,
		gateKey: "has_dominant_subject",
		gateValues: ["none"],
		gateIs: "not-in",
		conditionalKey: "subject_kind",
		expect: "substantive",
		statement: "has_dominant_subject != none but subject_kind == not_applicable",
		reading: "a subject it can see and cannot name — a vocabulary gap, and the argument for a seventh value",
	},
	{
		id: 11,
		gateKey: "medium",
		gateValues: ["typography_only"],
		gateIs: "in",
		conditionalKey: "has_text",
		expect: "substantive",
		statement: "medium == typography_only but has_text in {no, illegible_at_this_size}",
		reading: "type-only artwork with no readable type",
	},
	{
		id: 12,
		gateKey: "medium",
		gateValues: ["typography_only"],
		gateIs: "in",
		conditionalKey: "has_dominant_subject",
		expect: "refusal",
		statement: "medium == typography_only but has_dominant_subject != none",
		reading: "type-only artwork with a subject in it",
	},
]

/**
 * Rules 11 and 12 compare a gate against a value that is not a refusal token, so they need their own
 * predicate rather than `isRefusal`. Kept explicit rather than folded into `expect`, because
 * inventing a general mechanism for two rows this round cannot even evaluate would be the kind of
 * cleverness CONVENTIONS.md rules out.
 */
const RULE_SPECIFIC_CONSISTENT: Readonly<Record<number, (conditional: string | readonly string[]) => boolean>> = {
	11: (conditional) => typeof conditional === "string" && conditional !== "no" && conditional !== "illegible_at_this_size",
	12: (conditional) => typeof conditional === "string" && conditional === "none",
}

/**
 * Cohen's kappa on two label vectors, or null when the join is too small to carry one.
 *
 * `null` is also returned when both raters used exactly one value: the expected-agreement term is
 * then 1 and kappa is 0/0. That is a degenerate table, not a coefficient of zero, and reporting it
 * as zero would say the raters agreed by chance when in fact they agreed completely.
 */
export function cohenKappa(
	pairs: readonly (readonly [string, string])[],
	minimum = MIN_KAPPA_N,
): { kappa: number | null; n: number; raw: number | null; reason: string | null } {
	const n = pairs.length
	if (n === 0) return { kappa: null, n, raw: null, reason: "no comparable rows" }
	const agreed = pairs.filter(([a, b]) => a === b).length
	const raw = Number((agreed / n).toFixed(4))
	if (n < minimum) return { kappa: null, n, raw, reason: `n=${n} is below the ${minimum}-row floor for a kappa` }
	const values = [...new Set(pairs.flatMap(([a, b]) => [a, b]))]
	const left = new Map(values.map((value) => [value, pairs.filter(([a]) => a === value).length / n]))
	const right = new Map(values.map((value) => [value, pairs.filter(([, b]) => b === value).length / n]))
	const expected = values.reduce((sum, value) => sum + left.get(value)! * right.get(value)!, 0)
	if (Math.abs(1 - expected) < 1e-12) {
		return { kappa: null, n, raw, reason: "both raters used one value only; kappa is 0/0 on that table" }
	}
	return { kappa: Number(((agreed / n - expected) / (1 - expected)).toFixed(4)), n, raw, reason: null }
}

/* ------------------------------------------------------------------------------------------- */
/* The analysis                                                                                  */
/* ------------------------------------------------------------------------------------------- */

export type ArtworkAnswer = Readonly<{
	imageId: string
	imagePath: string
	sha256: string
	stratum: string
	joinGrade: JoinGrade
	/**
	 * Whether the join was confirmed against the image bytes. `null` means no verification was
	 * supplied to this run, which is a different statement from "checked and fine".
	 */
	joinVerified: boolean | null
	/** The rendition the pilot decoded, when it is not this one. */
	pilotImagePath: string | null
	reviewer: string | readonly string[] | null
	model: Readonly<Partial<Record<PilotVariant, string | readonly string[]>>>
	/** Per variant, P6's bucket. Absent where the artwork does not join. */
	bucket: Readonly<Partial<Record<PilotVariant, PairBucket>>>
	/** True when E and F said the same thing about this artwork — the only subset with one model answer. */
	variantsAgree: boolean | null
	/**
	 * Jaccard against each variant separately. It used to be one number, `Math.max` across E and F —
	 * an undocumented best-case-across-variants summary sitting on a per-artwork field.
	 */
	setOverlap: Readonly<Partial<Record<PilotVariant, number>>>
}>

export type VariantJoinStats = Readonly<{
	n: number
	buckets: Record<PairBucket, number>
	exactSetAgreement: number | null
	meanJaccard: number | null
	/**
	 * Computed on the rows where BOTH sides gave a substantive answer.
	 *
	 * A kappa has two categories per cell and no third bucket, so a can't-tell row cannot be
	 * represented in it. Leaving refusals in scored refusal-vs-refusal as agreement while `bucketOf`
	 * called the same row can't-tell — one row, two verdicts, in one file.
	 */
	kappa: ReturnType<typeof cohenKappa>
}>

/**
 * Every joined statistic, keyed by join grade and never summed across them.
 *
 * See `JOINED_GRADES`. The absence of a pooled field is the point of the shape.
 */
export type ByJoinGrade<T> = Readonly<Record<JoinedGrade, T>>

export type QuestionResult = Readonly<{
	key: string
	kind: string
	question: string
	whyAsked: string
	answered: number
	unanswered: number
	/** What the reviewer said, over all twenty artworks. The label deposit, and the answerability read. */
	reviewerDistribution: Readonly<Record<string, number>>
	/** For a multi-select: how often the reviewer picked more than one value. */
	multi: Readonly<{ singletonRate: number | null; meanSize: number | null; perValue: Record<string, number> }> | null
	/** Reviewer vs each variant, per join grade. Counts always; kappa only above the floor. */
	perVariant: Readonly<Record<PilotVariant, ByJoinGrade<VariantJoinStats>>>
	/** The subset where E and F said the same thing: the only place a single "the model" exists. */
	variantAgreementSubset: ByJoinGrade<
		Readonly<{
			n: number
			buckets: Record<PairBucket, number>
			kappa: ReturnType<typeof cohenKappa>
		}>
	>
	/** The subset where E and F split: what the reviewer's answer says about wording, not accuracy. */
	variantSplitSubset: ByJoinGrade<
		Readonly<{
			n: number
			reviewerWithE: number
			reviewerWithF: number
			/**
			 * A substantive human answer that matched neither wording. A REFUSAL never lands here — see
			 * `reviewerCantTell`. Recoding a declined question as "the reviewer agreed with neither" is
			 * exactly the pooling P6's third bucket exists to prevent, and it read as a human verdict on
			 * two wordings when the human had declined to give one.
			 */
			reviewerWithNeither: number
			/** The reviewer refused the question. Not an agreement, not an error, not a wording verdict. */
			reviewerCantTell: number
		}>
	>
	joinCounts: Readonly<Record<JoinGrade, number>>
	/**
	 * Artworks that join to the pilot but whose pilot row carries no answer for this question. They
	 * count as joined and enter no bucket, no kappa pair and no subset, so without this counter they
	 * leave through a hole in the arithmetic.
	 */
	joinedRowsMissingThisQuestion: ByJoinGrade<number>
	perArtwork: readonly ArtworkAnswer[]
}>

export type GateContradiction = Readonly<{
	ruleId: number
	imageId: string
	imagePath: string
	gateKey: string
	gateAnswer: string | readonly string[]
	conditionalKey: string
	conditionalAnswer: string | readonly string[]
}>

export type GateConsistency = Readonly<{
	ceiling: number
	ceilingSource: string
	/** Artworks with at least one answer — the "ok rows" the rate is over. */
	rowsConsidered: number
	rules: readonly Readonly<{
		id: number
		statement: string
		reading: string
		evaluable: boolean
		notEvaluableBecause: string | null
		/** Rows where the gate armed the rule and both answers were present. */
		rowsArmed: number
		contradictions: number
		rate: number | null
	}>[]
	multiSelectShape: Readonly<{ exclusiveValueBesideAnother: number; repeatedValue: number; note: string }>
	totalContradictions: number
	artworksWithAnyContradiction: number
	/** Contradictions over ok rows — the quantity the ceiling is written about. */
	contradictionRate: number | null
	/** Distinct artworks over ok rows. Reported beside it because one artwork can break two rules. */
	artworkRate: number | null
	withinCeiling: boolean | null
	/** How often a refusal value was used where a gate had just made it the only consistent answer. */
	abstentionUse: readonly Readonly<{ questionKey: string; opportunities: number; refusalsUsed: number }>[]
	contradictions: readonly GateContradiction[]
	reading: string
}>

export type VocabularyCheck = Readonly<{
	/** Stored answers checked, one per (question, artwork) with a standing answer. */
	checked: number
	offVocabulary: readonly Readonly<{ questionKey: string; imageId: string; value: string }>[]
	unsortedArrays: readonly Readonly<{ questionKey: string; imageId: string; answer: readonly string[] }>[]
	duplicateValues: readonly Readonly<{ questionKey: string; imageId: string; value: string }>[]
	emptyArrays: readonly Readonly<{ questionKey: string; imageId: string }>[]
	wrongShape: readonly Readonly<{ questionKey: string; imageId: string; expected: string; got: string }>[]
	/** Answers whose (questionKey, imageId) is in no fixture item — filed against nothing that was asked. */
	orphanAnswers: readonly Readonly<{ questionKey: string; imageId: string }>[]
	reading: string
}>

/**
 * The reviewer's own account of what the two readings are, verbatim and dated.
 *
 * It is quoted rather than paraphrased because the whole reading of this round turns on it, and
 * because a paraphrase of it drifts straight back into "the first answers were wrong".
 * [REVIEWED] — reviewer, 2026-08-03, on the gate-reconciliation round.
 */
export const ELICITATION_MODE_CLARIFICATION =
	'reviewer, 2026-08-03: "on some artworks if you ask me \\"is there a subject?\\" i might answer \\"no\\", ' +
	'but if you ask me *separately* \\"what is the subject?\\" i would answer \\"an animal\\". So if you ask me ' +
	"to *not make a story* then I will give you those 2 answers, but if you ask me *jointly* (or just one " +
	'after the other) then I will change my answers so they are coherent together."'

/**
 * The two readings of the same round, side by side and labelled so they cannot be swapped.
 *
 * **They are two ELICITATION MODES, not a draft and a correction.** Nothing in this block says the
 * independent answers were mistakes. Per the reviewer (quoted verbatim in
 * `ELICITATION_MODE_CLARIFICATION`), asked on its own a gate elicits a DOMINANCE judgement — "is
 * there a subject?" → "no", meaning nothing dominates — while its dependent, asked on its own,
 * elicits a BEST-AVAILABLE read — "what is the subject?" → "an animal", meaning the most
 * subject-like thing present is an animal. Both are honest answers to the questions actually asked.
 * The pair `none + animal` therefore carries MORE information than either reconciled answer: it
 * decodes as *nothing dominant, but an animal is present*. Joint elicitation forces a coherence that
 * destroys that nuance — it is a different instrument reading, not a better one.
 *
 *  - INDEPENDENT (by-question) — every question answered on its own, which is what this round's
 *    passes asked for and what its instruction demanded. These figures never move.
 *  - JOINT (by-artwork, reconciled) — the gate and its dependent on screen together, the reviewer
 *    asked to make the pair hold. These are the standing answers, and supersession is the mechanical
 *    rule that decides which answer a grader reads. Mechanically standing is not epistemically
 *    superior.
 *
 * Reporting either alone gives a false answer to one of the two questions.
 */
export type ReconciliationReading = Readonly<{
	whatThisIs: string
	asGivenLabel: string
	standingLabel: string
	/** Other batches carrying a superseder of one of this round's records. Empty when none do. */
	supersedingBatchIds: readonly string[]
	/** Every (question, artwork) whose chain left this batch — with the chain, and whether it moved. */
	crossBatchSupersessions: readonly CrossBatchSupersession[]
	answersSuperseded: number
	answersChanged: number
	/** The gate table and the pilot join, recomputed over STANDING answers. */
	standing: Readonly<{ gateConsistency: GateConsistency; perQuestion: readonly QuestionResult[] }>
	gateComparison: Readonly<{
		asGiven: Readonly<{ totalContradictions: number; artworksWithAnyContradiction: number; contradictionRate: number | null; withinCeiling: boolean | null }>
		standing: Readonly<{ totalContradictions: number; artworksWithAnyContradiction: number; contradictionRate: number | null; withinCeiling: boolean | null }>
		perRule: readonly Readonly<{
			id: number
			statement: string
			asGivenRowsArmed: number
			asGivenContradictions: number
			standingRowsArmed: number
			standingContradictions: number
			resolved: number
		}>[]
		reading: string
	}>
	/** Questions whose reviewer distribution moved between the two readings, with both distributions. */
	changedDistributions: readonly Readonly<{
		questionKey: string
		asGiven: Readonly<Record<string, number>>
		standing: Readonly<Record<string, number>>
		moved: readonly Readonly<{ value: string; asGiven: number; standing: number }>[]
	}>[]
	/** Pilot-join buckets that moved, per question, join grade and variant. Never pooled across grades. */
	changedJoins: readonly Readonly<{
		questionKey: string
		grade: JoinedGrade
		variant: PilotVariant
		asGiven: Readonly<{ n: number; buckets: Record<PairBucket, number> }>
		standing: Readonly<{ n: number; buckets: Record<PairBucket, number> }>
	}>[]
	reading: string
}>

export type BcdeValidationAnalysis = Readonly<{
	generatedAt: string
	whatThisIs: string
	warehousePath: string
	fixturePath: string
	pilotRunPath: string
	batchId: string
	labelSchemaVersion: string
	scoping: readonly string[]
	counts: Readonly<{
		artworks: number
		questions: number
		items: number
		answers: number
		unanswered: number
		joinExactBytes: number
		joinOtherRendition: number
		joinNone: number
	}>
	skipped: Readonly<Record<string, number>>
	questionsOmitted: Readonly<Record<string, string>>
	/**
	 * INDEPENDENT ELICITATION. The answers THIS ROUND recorded — every question answered on its own —
	 * checked against §15.6-(3)'s pre-registered table. This field never moves once the round is
	 * released. Read `gateConsistency.reading` before quoting the rate: it is not a reviewer defect,
	 * and the ceiling it is measured against was written for a differently-shaped instrument. For the
	 * joint reading see `reconciliation.standing.gateConsistency`.
	 */
	gateConsistency: GateConsistency
	/** INDEPENDENT ELICITATION. The stored answers checked against the vocabulary they were drawn from. */
	vocabulary: VocabularyCheck
	/**
	 * The joint reading, after supersession chains that leave this batch — a reconciliation round.
	 * Present on every run; when no other batch supersedes anything here, nothing was asked jointly,
	 * the two readings coincide, and the block says so rather than being absent, because "nothing
	 * superseded it" and "nobody looked" are different facts.
	 */
	reconciliation: ReconciliationReading
	/** The join checked against the image bytes, or null when this run was given no verification. */
	overlapVerification: OverlapVerification | null
	/** Prompt variants present in the pilot file that `PILOT_VARIANTS` does not cover. */
	unexpectedPilotVariants: readonly string[]
	perQuestion: readonly QuestionResult[]
	summaryLines: readonly string[]
}>

/**
 * Scoping notes stamped on every run, ahead of every number.
 *
 * They live here rather than in a report because the conditions a measurement was taken under stop
 * travelling with it the moment they live somewhere else. Three of the four cut against the result.
 */
export function bcdeScopingNotes(facts: {
	artworks: number
	joinExactBytes: number
	joinOtherRendition: number
	joinTotal: number
}): readonly string[] {
	// Every count in this prose is derived. The previous version wrote "two on identical bytes, one at
	// another rendition" and "twenty reviewer labels" as string literals beside fields that computed
	// the same facts — so the file stated its own join width twice, once measured and once asserted,
	// and only one of them could survive a change in the data.
	return [
		"NO GROUND TRUTH EXISTED BEFORE THIS ROUND. The pilot measured E against F, which is " +
			"self-consistency; a model can be perfectly self-consistent and perfectly wrong. These reviewer " +
			"answers are the first human answer to any group-BCDE question, and they are elicited human " +
			"labels — PHASE_0_DECISIONS.md §8's primary judge for any oracle comparison.",
		`THE JOIN IS TINY, AND THAT IS THE HEADLINE. The round is drawn from the coverage set's core; the ` +
			`pilot ran on eval-142. ${facts.joinTotal} artworks are in both — ${facts.joinExactBytes} on ` +
			`identical bytes, ${facts.joinOtherRendition} at another rendition. No agreement rate computed on ` +
			`${facts.joinTotal} rows is a rate. THE TWO JOIN GRADES ARE NEVER POOLED, and this file emits no ` +
			`figure that pools them: a 300 px and a 640 px rendition are different items (CONVENTIONS.md), and ` +
			`grain in particular can legitimately differ between them.`,
		"WORDING ASYMMETRY, PRE-REGISTERED (§15.9). Every stem and gloss the reviewer read was parsed out " +
			"of variant E's prompt file. Scoring F against these answers carries a wording caveat that " +
			"scoring E does not. That asymmetry is the price of two independent renderings; it is stated, " +
			"not discovered later.",
		`WHAT THE ROUND IS FOR AT FULL WIDTH: ${facts.artworks} reviewer labels per question on the corpus ` +
			`bench — the first labels the coverage set has ever carried — and §15.9's real product, which is ` +
			`whether a human can answer each of these questions at all. A question the reviewer finds ` +
			`unanswerable is deleted regardless of what the model did with it.`,
		"NEVER ONE ACCURACY NUMBER (PHASE_0_DECISIONS.md §4 P6). Every pair is bucketed agreement / " +
			"disagreement / can't-tell, and the E-and-F-agree subset is reported apart from the E-and-F-split " +
			"subset, because on a split row there is no single model answer to be accurate against. A " +
			"reviewer refusal is its own bucket everywhere, including in the split subset: the human " +
			"declining to answer is not the human disagreeing with both wordings.",
		"THE REVIEWER'S OWN ANSWERS ARE CHECKED AGAINST THE GATE TABLE, and the rate is reported against " +
			"§15.6-(3)'s pre-registered <= 10% ceiling because it was pre-registered — NOT because the two are " +
			"comparable. They are not: the ceiling was written for the model, whose joint constrained decode " +
			"generates the gate first and the dependent in its context, so coherence there is structural. " +
			"Applying it to a human answering each question in isolation compares two elicitation modes. See " +
			"`gateConsistency.reading` for the full reading; `withinCeiling` is not a verdict on the reviewer.",
		"TWO ELICITATION MODES, LABELLED, NEVER BLENDED — AND NEITHER IS THE OTHER'S CORRECTION. Every " +
			"top-level figure in this file — `gateConsistency`, `perQuestion`, `vocabulary`, `counts` — is the " +
			"INDEPENDENT reading: every question answered on its own, which is what this round asked for. " +
			"Those figures never move. The JOINT reading — the gate and its dependent on screen together, in a " +
			"reconciliation round — is under `reconciliation.standing`, recomputed there from scratch. The " +
			"reviewer holds that the independent answers are information-bearing rather than mistaken: " +
			`${ELICITATION_MODE_CLARIFICATION} A downstream consumer of these labels reads the standing ` +
			"(joint) state because it must read exactly one, and supersession is the mechanical rule that " +
			"picks it — recency, not correctness. Any statement about what the reviewer perceives, or about " +
			"how by-question elicitation behaves, reads the independent state.",
	]
}

const EMPTY_BUCKETS = (): Record<PairBucket, number> => ({ agreement: 0, disagreement: 0, cant_tell: 0 })

type ComputedState = {
	answers: number
	unanswered: number
	perQuestion: QuestionResult[]
	gateConsistency: GateConsistency
	vocabulary: VocabularyCheck
}

/**
 * Put the two readings beside each other, with the labels that keep them apart.
 *
 * Nothing here recomputes anything: both states arrive already computed, over their own answer map.
 * This only names them, diffs them, and states what the difference means.
 */
export function buildReconciliationReport(
	batchId: string,
	crossBatchSupersessions: readonly CrossBatchSupersession[],
	supersedingBatchIds: readonly string[],
	asGiven: ComputedState,
	standing: ComputedState,
): ReconciliationReading {
	const asGivenLabel =
		`INDEPENDENT ELICITATION (as given) — every question answered on its own, in ${batchId}'s by-question ` +
		`passes, under an instruction that expressly forbade making the answers cohere`
	const standingLabel =
		supersedingBatchIds.length === 0
			? `JOINT ELICITATION (standing) — the end of every supersession chain. No other batch supersedes ` +
				`anything in ${batchId}, so nothing was ever asked jointly and this equals the independent reading.`
			: `JOINT ELICITATION (standing) — the gate and its dependent asked together in ` +
				`${supersedingBatchIds.join(", ")}, the reviewer asked to make the pair hold`

	const standingRuleById = new Map(standing.gateConsistency.rules.map((rule) => [rule.id, rule]))
	const perRule = asGiven.gateConsistency.rules.map((rule) => {
		const now = standingRuleById.get(rule.id)
		return {
			id: rule.id,
			statement: rule.statement,
			asGivenRowsArmed: rule.rowsArmed,
			asGivenContradictions: rule.contradictions,
			standingRowsArmed: now?.rowsArmed ?? 0,
			standingContradictions: now?.contradictions ?? 0,
			// Negative would mean the reconciliation ADDED a contradiction — reported as a negative
			// rather than clamped, because that is the one outcome a reader must not miss.
			resolved: rule.contradictions - (now?.contradictions ?? 0),
		}
	})

	const changedDistributions: {
		questionKey: string
		asGiven: Record<string, number>
		standing: Record<string, number>
		moved: { value: string; asGiven: number; standing: number }[]
	}[] = []
	const standingQuestionByKey = new Map(standing.perQuestion.map((question) => [question.key, question]))
	const changedJoins: ReconciliationReading["changedJoins"][number][] = []
	for (const question of asGiven.perQuestion) {
		const now = standingQuestionByKey.get(question.key)
		if (now === undefined) continue
		const values = [...new Set([...Object.keys(question.reviewerDistribution), ...Object.keys(now.reviewerDistribution)])].sort()
		const moved = values
			.map((value) => ({ value, asGiven: question.reviewerDistribution[value] ?? 0, standing: now.reviewerDistribution[value] ?? 0 }))
			.filter((entry) => entry.asGiven !== entry.standing)
		if (moved.length > 0) {
			changedDistributions.push({
				questionKey: question.key,
				asGiven: question.reviewerDistribution,
				standing: now.reviewerDistribution,
				moved,
			})
		}
		for (const grade of JOINED_GRADES) {
			for (const variant of PILOT_VARIANTS) {
				const before = question.perVariant[variant][grade]
				const after = now.perVariant[variant][grade]
				const same =
					before.n === after.n &&
					before.buckets.agreement === after.buckets.agreement &&
					before.buckets.disagreement === after.buckets.disagreement &&
					before.buckets.cant_tell === after.buckets.cant_tell
				if (same) continue
				changedJoins.push({
					questionKey: question.key,
					grade,
					variant,
					asGiven: { n: before.n, buckets: before.buckets },
					standing: { n: after.n, buckets: after.buckets },
				})
			}
		}
	}

	const changed = crossBatchSupersessions.filter((entry) => entry.changed).length
	const before = asGiven.gateConsistency.totalContradictions
	const after = standing.gateConsistency.totalContradictions
	const reading =
		supersedingBatchIds.length === 0
			? `No batch outside ${batchId} supersedes any of its answers. Nothing here was ever asked jointly, so the ` +
				`standing state IS the independent state; both are reported anyway so that a later reconciliation shows ` +
				`up as a change rather than as a new field.`
			: `${crossBatchSupersessions.length} of ${batchId}'s answers were re-asked jointly in ` +
				`${supersedingBatchIds.join(", ")} and ${changed} came back different. THESE ARE TWO ELICITATION ` +
				`MODES, NOT A DRAFT AND A CORRECTION. Asked independently, ${batchId} produced ${before} gate ` +
				`contradiction(s); asked jointly, ${after} remain(s). The difference is a fact about the two ` +
				`instruments, and NEITHER READING IS THE ERROR. ${ELICITATION_MODE_CLARIFICATION} On that account the ` +
				`independent pair carries MORE information than the reconciled one — \`has_dominant_subject = none\` ` +
				`with \`subject_kind = animal\` decodes as *nothing dominates, but an animal is present*, and the ` +
				`joint format cannot express that at all: forcing coherence collapses two variables onto one and the ` +
				`second is lost. Supersession decides which answer a grader reads, and that is a mechanical rule about ` +
				`recency, not a judgement that the earlier answer was wrong. Any downstream consumer of these labels ` +
				`reads the standing (joint) state because it must read exactly one; any statement about what the ` +
				`reviewer perceives, or about how by-question elicitation behaves, reads the independent one.`

	return {
		whatThisIs:
			"Two elicitation modes over the same round and the same reviewer. `gateConsistency` and `perQuestion` at " +
			"the top level are the INDEPENDENT reading — every question answered on its own — and they never move. " +
			"Everything under `reconciliation.standing` is the JOINT reading, recomputed from scratch over the end of " +
			"every supersession chain. No figure is ever carried from one into the other, and neither is the other's " +
			"correction: see `reading` and `ELICITATION_MODE_CLARIFICATION`.",
		asGivenLabel,
		standingLabel,
		supersedingBatchIds,
		crossBatchSupersessions,
		answersSuperseded: crossBatchSupersessions.length,
		answersChanged: changed,
		standing: { gateConsistency: standing.gateConsistency, perQuestion: standing.perQuestion },
		gateComparison: {
			asGiven: {
				totalContradictions: asGiven.gateConsistency.totalContradictions,
				artworksWithAnyContradiction: asGiven.gateConsistency.artworksWithAnyContradiction,
				contradictionRate: asGiven.gateConsistency.contradictionRate,
				withinCeiling: asGiven.gateConsistency.withinCeiling,
			},
			standing: {
				totalContradictions: standing.gateConsistency.totalContradictions,
				artworksWithAnyContradiction: standing.gateConsistency.artworksWithAnyContradiction,
				contradictionRate: standing.gateConsistency.contradictionRate,
				withinCeiling: standing.gateConsistency.withinCeiling,
			},
			perRule,
			reading:
				`Per rule of §15.6-(3)'s pre-registered table, as given vs standing. \`resolved\` is the as-given ` +
				`count minus the standing one; a NEGATIVE value means the reconciliation introduced a contradiction ` +
				`that the by-question round did not have, and is reported as a negative rather than hidden.`,
		},
		changedDistributions,
		changedJoins,
		reading,
	}
}

function ratio(part: number, whole: number): number | null {
	return whole === 0 ? null : Number((part / whole).toFixed(4))
}

export function analyzeBcdeValidation(
	fixture: OracleValidationFixture,
	records: readonly WarehouseRecord[],
	pilot: PilotAnswers,
	paths: { warehousePath: string; fixturePath: string; pilotRunPath: string; batchId?: string },
	now: () => Date = () => new Date(),
	verification: OverlapVerification | null = null,
): BcdeValidationAnalysis {
	const batchId = paths.batchId ?? fixture.batchId
	const { byQuestionAndImage, standingByQuestionAndImage, crossBatchSupersessions, supersedingBatchIds, skipped } = collectBcdeAnswers(
		records,
		batchId,
	)

	// One row per artwork, taken from the first pass — every pass covers the same twenty.
	const artworks = new Map<string, { imageId: string; imagePath: string; sha256: string; stratum: string; artworkId: string | null; imageIds: string[] }>()
	for (const item of fixture.items) {
		const held = artworks.get(item.sha256)
		if (held !== undefined) {
			// Dedup keeps the first item's `imageId`, so answers filed under a sibling id would vanish
			// into `unanswered` with no counter. sha256 -> imageId is 1:1 today; every id this artwork
			// ever wore is kept anyway, so the lookup cannot depend on that staying true.
			if (!held.imageIds.includes(item.imageId)) held.imageIds.push(item.imageId)
			continue
		}
		artworks.set(item.sha256, {
			imageId: item.imageId,
			imagePath: item.imagePath,
			sha256: item.sha256,
			stratum: item.stratum,
			artworkId: item.artworkId,
			imageIds: [item.imageId],
		})
	}

	// Verification, indexed by the artwork it is about. Absent verification is `null` throughout — a
	// different statement from "checked and fine", and reported as such.
	const verdictBySha = new Map(verification?.pairs.map((pair) => [pair.sha256, pair]) ?? [])

	const joinOf = (artwork: {
		sha256: string
		artworkId: string | null
	}): {
		grade: JoinGrade
		answers: ReadonlyMap<string, Record<string, string | string[]>> | null
		pilotPath: string | null
		verified: boolean | null
	} => {
		const verdict = verdictBySha.get(artwork.sha256)
		// A join the bytes do not support is not a join. It drops to `none` rather than contributing a
		// comparison nobody checked — the id matching is what got audited, not what got trusted.
		const rejected = verdict !== undefined && !verdict.accepted
		const verified = verdict === undefined ? null : verdict.accepted
		const exact = pilot.bySha.get(artwork.sha256)
		if (exact !== undefined) {
			if (rejected) return { grade: "none", answers: null, pilotPath: null, verified: false }
			return { grade: "exact_bytes", answers: exact, pilotPath: null, verified }
		}
		const other = artwork.artworkId === null ? undefined : pilot.byArtwork.get(artwork.artworkId)
		if (other !== undefined) {
			if (rejected) return { grade: "none", answers: null, pilotPath: null, verified: false }
			return {
				grade: "same_artwork_other_rendition",
				answers: other,
				pilotPath: pilot.pathByArtwork.get(artwork.artworkId!) ?? null,
				verified,
			}
		}
		return { grade: "none", answers: null, pilotPath: null, verified: null }
	}

	const joinTotals: Record<JoinGrade, number> = { exact_bytes: 0, same_artwork_other_rendition: 0, none: 0 }
	for (const artwork of artworks.values()) joinTotals[joinOf(artwork).grade] += 1

	/** One accumulator per join grade, for every joined statistic. Nothing crosses between them. */
	type VariantHeld = { n: number; buckets: Record<PairBucket, number>; pairs: [string, string][]; jaccards: number[]; exactSets: boolean[] }
	const emptyVariantHeld = (): VariantHeld => ({ n: 0, buckets: EMPTY_BUCKETS(), pairs: [], jaccards: [], exactSets: [] })
	const byGrade = <T>(make: () => T): Record<JoinedGrade, T> =>
		Object.fromEntries(JOINED_GRADES.map((grade) => [grade, make()])) as Record<JoinedGrade, T>

	const served = new Map(fixture.questions.map((question) => [question.key, question]))
	const askedPairs = new Set(fixture.items.map((item) => `${item.questionKey} ${item.imageId}`))

	/**
	 * One complete reading of the round, over ONE answer map.
	 *
	 * Run twice and never blended: once over the answers this round recorded (AS GIVEN), once over the
	 * end of every supersession chain (STANDING). Everything downstream of a reviewer answer —
	 * distributions, the pilot join, the gate table, the vocabulary check — is inside here, because a
	 * figure computed on one map and printed beside a figure computed on the other is precisely the
	 * confusion this split exists to prevent.
	 */
	const computeState = (
		source: ReadonlyMap<string, string | readonly string[]>,
	): { answers: number; unanswered: number; perQuestion: QuestionResult[]; gateConsistency: GateConsistency; vocabulary: VocabularyCheck } => {
		/** The reviewer's answer for one question on one artwork, under any id it wore. */
		const answerFor = (question: string, artwork: { imageIds: readonly string[] }): string | readonly string[] | null => {
			for (const imageId of artwork.imageIds) {
				const held = source.get(`${question} ${imageId}`)
				if (held !== undefined) return held
			}
			return null
		}

		let answers = 0
		let unanswered = 0

		const perQuestion: QuestionResult[] = fixture.questions.map((question) => {
			const reviewerDistribution: Record<string, number> = {}
			const perValue: Record<string, number> = {}
			const joinCounts: Record<JoinGrade, number> = { exact_bytes: 0, same_artwork_other_rendition: 0, none: 0 }
			const missingQuestion = byGrade(() => 0)
			const perVariant = Object.fromEntries(
				PILOT_VARIANTS.map((variant) => [variant, byGrade(emptyVariantHeld)]),
			) as Record<PilotVariant, Record<JoinedGrade, VariantHeld>>
			const agreeSubset = byGrade(() => ({ n: 0, buckets: EMPTY_BUCKETS(), pairs: [] as [string, string][] }))
			const splitSubset = byGrade(() => ({ n: 0, reviewerWithE: 0, reviewerWithF: 0, reviewerWithNeither: 0, reviewerCantTell: 0 }))
			let answeredHere = 0
			let sizeSum = 0
			let singletons = 0

			const rows: ArtworkAnswer[] = [...artworks.values()]
				.sort((a, b) => (a.sha256 < b.sha256 ? -1 : 1))
				.map((artwork) => {
					const reviewer = answerFor(question.key, artwork)
					if (reviewer === null) unanswered += 1
					else {
						answers += 1
						answeredHere += 1
						const values = typeof reviewer === "string" ? [reviewer] : [...reviewer]
						const token = canonicalToken(reviewer)
						reviewerDistribution[token] = (reviewerDistribution[token] ?? 0) + 1
						for (const value of values) perValue[value] = (perValue[value] ?? 0) + 1
						sizeSum += values.length
						if (values.length === 1) singletons += 1
					}

					const join = joinOf(artwork)
					joinCounts[join.grade] += 1
					// Every accumulator below is addressed through `grade`. When the artwork does not join,
					// `grade` is null and nothing is accumulated — there is no bucket for an unjoined row and
					// no total that spans the two grades.
					const grade: JoinedGrade | null = join.grade === "none" ? null : join.grade
					const model: Partial<Record<PilotVariant, string | readonly string[]>> = {}
					const bucket: Partial<Record<PilotVariant, PairBucket>> = {}
					const setOverlap: Partial<Record<PilotVariant, number>> = {}
					let sawAnyValue = false
					for (const variant of PILOT_VARIANTS) {
						const parsed = join.answers?.get(variant)
						const value = parsed?.[question.key]
						if (value === undefined) continue
						sawAnyValue = true
						model[variant] = value
						if (reviewer === null || grade === null) continue
						const held = perVariant[variant][grade]
						const b = bucketOf(reviewer, value)
						bucket[variant] = b
						held.buckets[b] += 1
						held.n += 1
						// A kappa needs one token per side and has no third category, so a can't-tell row cannot
						// be represented in it. Rows where either side refused are left out rather than scored as
						// agreement — which is what refusal-vs-refusal used to be, in a file whose own bucket
						// logic called the same row can't-tell.
						if (b !== "cant_tell") {
							// A set answer is keyed by its sorted join, which makes the coefficient an EXACT-SET
							// kappa — the reading §15.7 used on the pilot's own multi-selects, reported beside the
							// Jaccard rather than instead of it.
							held.pairs.push([canonicalToken(reviewer), canonicalToken(value)])
						}
						if (typeof reviewer !== "string" || typeof value !== "string") {
							const overlap = jaccard(
								typeof reviewer === "string" ? [reviewer] : [...reviewer],
								typeof value === "string" ? [value] : [...value],
							)
							held.jaccards.push(overlap)
							held.exactSets.push(sameAnswer(reviewer, value))
							setOverlap[variant] = overlap
						}
					}
					if (grade !== null && !sawAnyValue) missingQuestion[grade] += 1

					const e = model.E
					const f = model.F
					const variantsAgree = e === undefined || f === undefined ? null : sameAnswer(e, f)
					if (reviewer !== null && grade !== null && variantsAgree === true) {
						const held = agreeSubset[grade]
						held.n += 1
						const b = bucketOf(reviewer, e!)
						held.buckets[b] += 1
						if (b !== "cant_tell") held.pairs.push([canonicalToken(reviewer), canonicalToken(e!)])
					}
					if (reviewer !== null && grade !== null && variantsAgree === false) {
						const held = splitSubset[grade]
						held.n += 1
						if (isRefusal(reviewer)) {
							// The human declined. That is not a substantive answer that missed both wordings, and
							// filing it as one turns an abstention into a verdict on the wording.
							held.reviewerCantTell += 1
						} else {
							const withE = sameAnswer(reviewer, e!)
							const withF = sameAnswer(reviewer, f!)
							if (withE) held.reviewerWithE += 1
							if (withF) held.reviewerWithF += 1
							if (!withE && !withF) held.reviewerWithNeither += 1
						}
					}

					return {
						imageId: artwork.imageId,
						imagePath: artwork.imagePath,
						sha256: artwork.sha256,
						stratum: artwork.stratum,
						joinGrade: join.grade,
						joinVerified: join.verified,
						pilotImagePath: join.pilotPath,
						reviewer,
						model,
						bucket,
						variantsAgree,
						setOverlap,
					}
				})

			return {
				key: question.key,
				kind: question.kind,
				question: question.question,
				whyAsked: BCDE_VALIDATION_QUESTION_REASONS[question.key] ?? "",
				answered: answeredHere,
				unanswered: rows.length - answeredHere,
				reviewerDistribution,
				multi:
					question.kind !== "multi"
						? null
						: {
								singletonRate: ratio(singletons, answeredHere),
								meanSize: answeredHere === 0 ? null : Number((sizeSum / answeredHere).toFixed(3)),
								perValue,
							},
				perVariant: Object.fromEntries(
					PILOT_VARIANTS.map((variant) => [
						variant,
						Object.fromEntries(
							JOINED_GRADES.map((grade) => {
								const held = perVariant[variant][grade]
								return [
									grade,
									{
										n: held.n,
										buckets: held.buckets,
										exactSetAgreement:
											held.exactSets.length === 0 ? null : ratio(held.exactSets.filter(Boolean).length, held.exactSets.length),
										meanJaccard:
											held.jaccards.length === 0
												? null
												: Number((held.jaccards.reduce((sum, value) => sum + value, 0) / held.jaccards.length).toFixed(4)),
										kappa: cohenKappa(held.pairs),
									},
								]
							}),
						),
					]),
				) as QuestionResult["perVariant"],
				variantAgreementSubset: Object.fromEntries(
					JOINED_GRADES.map((grade) => [
						grade,
						{ n: agreeSubset[grade].n, buckets: agreeSubset[grade].buckets, kappa: cohenKappa(agreeSubset[grade].pairs) },
					]),
				) as QuestionResult["variantAgreementSubset"],
				variantSplitSubset: splitSubset,
				joinCounts,
				joinedRowsMissingThisQuestion: missingQuestion,
				perArtwork: rows,
			}
		})

		/* --- the reviewer's answers, checked against themselves ------------------------------------- */

		const answeredArtworks = [...artworks.values()].filter((artwork) =>
			fixture.questions.some((question) => answerFor(question.key, artwork) !== null),
		)
		const contradictions: GateContradiction[] = []
		const abstentionOpportunities = new Map<string, number>()
		const gateRules = GATE_CONSISTENCY_RULES.map((rule) => {
			const missing = [rule.gateKey, rule.conditionalKey].filter((key) => !served.has(key))
			if (missing.length > 0) {
				return {
					id: rule.id,
					statement: rule.statement,
					reading: rule.reading,
					evaluable: false,
					// "We did not measure it" and "it did not fire" are different facts, and an omitted row
					// reads as the second one.
					notEvaluableBecause: `this round did not ask ${missing.join(" or ")}`,
					rowsArmed: 0,
					contradictions: 0,
					rate: null,
				}
			}
			let armed = 0
			let broken = 0
			for (const artwork of answeredArtworks) {
				const gate = answerFor(rule.gateKey, artwork)
				const conditional = answerFor(rule.conditionalKey, artwork)
				if (gate === null || conditional === null) continue
				const gateToken = canonicalToken(gate)
				const matches = rule.gateValues.includes(gateToken)
				if (matches !== (rule.gateIs === "in")) continue
				armed += 1
				if (rule.expect === "refusal") {
					abstentionOpportunities.set(rule.conditionalKey, (abstentionOpportunities.get(rule.conditionalKey) ?? 0) + 1)
				}
				const specific = RULE_SPECIFIC_CONSISTENT[rule.id]
				const consistent =
					specific !== undefined
						? specific(conditional)
						: rule.expect === "refusal"
							? isRefusal(conditional)
							: !isRefusal(conditional)
				if (consistent) continue
				broken += 1
				contradictions.push({
					ruleId: rule.id,
					imageId: artwork.imageId,
					imagePath: artwork.imagePath,
					gateKey: rule.gateKey,
					gateAnswer: gate,
					conditionalKey: rule.conditionalKey,
					conditionalAnswer: conditional,
				})
			}
			return {
				id: rule.id,
				statement: rule.statement,
				reading: rule.reading,
				evaluable: true,
				notEvaluableBecause: null,
				rowsArmed: armed,
				contradictions: broken,
				rate: ratio(broken, armed),
			}
		})

		// Rules 7 and 8 are about multi-select shape rather than a gate pair.
		let exclusiveBesideAnother = 0
		let repeatedValue = 0
		for (const question of fixture.questions) {
			if (question.kind !== "multi") continue
			for (const artwork of artworks.values()) {
				const answer = answerFor(question.key, artwork)
				if (answer === null || typeof answer === "string") continue
				if (new Set(answer).size !== answer.length) repeatedValue += 1
				if (answer.length > 1 && answer.some((value) => REFUSAL_VALUES.includes(value) || value === "none")) {
					exclusiveBesideAnother += 1
				}
			}
		}

		// Only questions that actually OFFER a refusal value: `has_dominant_subject` is the conditional of
		// rule 12, but its vocabulary has no `not_applicable`, so "used it 0 times" would be a fact about
		// the vocabulary rather than about the reviewer.
		const abstentionUse = [...new Set(GATE_CONSISTENCY_RULES.filter((rule) => rule.expect === "refusal").map((rule) => rule.conditionalKey))]
			.filter((key) => served.get(key)?.answers.some((answer) => REFUSAL_VALUES.includes(answer.key)) === true)
			.map((questionKey) => {
				let used = 0
				for (const artwork of artworks.values()) {
					const answer = answerFor(questionKey, artwork)
					if (answer !== null && isRefusal(answer)) used += 1
				}
				return { questionKey, opportunities: abstentionOpportunities.get(questionKey) ?? 0, refusalsUsed: used }
			})

		const distinctArtworks = new Set(contradictions.map((entry) => entry.imageId)).size
		const okRows = answeredArtworks.length
		const contradictionRate = ratio(contradictions.length, okRows)
		const gateConsistency: GateConsistency = {
			ceiling: CONTRADICTION_CEILING,
			ceilingSource:
				"PREMISE_NEXT.md §15.6-(3): total contradiction rate <= 10% of ok rows. Pre-registered FOR THE " +
				"MODEL, whose decode is joint and constrained — the gate is generated first and the dependent is " +
				"generated in its context, so coherence is structurally forced and a low rate is architecture rather " +
				"than accuracy. Carrying that number across to a human answering each question in isolation compares " +
				"two different elicitation modes, which is a category error; the rate below is computed and reported " +
				"because it was pre-registered, and `withinCeiling` must not be read as a verdict on the reviewer.",
			rowsConsidered: okRows,
			rules: gateRules,
			multiSelectShape: {
				exclusiveValueBesideAnother: exclusiveBesideAnother,
				repeatedValue,
				note:
					"Rules 7 and 8 of the same table. The server refuses both at write time " +
					"(shape, membership, non-empty, no-repeat, then sort), so a non-zero count here means a row " +
					"reached the warehouse by some path other than the server.",
			},
			totalContradictions: contradictions.length,
			artworksWithAnyContradiction: distinctArtworks,
			contradictionRate,
			artworkRate: ratio(distinctArtworks, okRows),
			withinCeiling: contradictionRate === null ? null : contradictionRate <= CONTRADICTION_CEILING,
			abstentionUse,
			contradictions,
			reading:
				contradictions.length === 0
					? okRows === 0
						? "Nothing answered yet, so nothing to check."
						: `No contradiction fired on ${okRows} answered artworks. The gates and their conditionals agree.`
					: `${contradictions.length} contradiction(s) across ${distinctArtworks} of ${okRows} answered artworks — ` +
						`${((contradictionRate ?? 0) * 100).toFixed(0)}% against a pre-registered ceiling of ` +
						`${(CONTRADICTION_CEILING * 100).toFixed(0)}%. THE COMPARISON IS A CATEGORY ERROR AND THIS RATE IS ` +
						`NOT A REVIEWER DEFECT (loose end L-b, read 2026-08-03). Two reasons, and the second subsumes the ` +
						`first. (1) THE CEILING WAS WRITTEN FOR A DIFFERENT INSTRUMENT. The model decodes gate and dependent ` +
						`jointly, gate first, so its coherence is structurally forced: its low contradiction rate is ` +
						`architecture, not virtue, and it is not comparable to a human answering each question in isolation ` +
						`under an instruction that expressly forbade making the answers cohere. (2) THE PAIRS CONFLATE TWO ` +
						`VARIABLES. The gate asks about the EXISTENCE OF A DOMINANT X; its dependent asks for the KIND OF THE ` +
						`BEST-AVAILABLE X. Asked apart, both have honest answers that break the rule — ` +
						`${ELICITATION_MODE_CLARIFICATION} — so a "contradiction" here is not an inconsistency in the ` +
						`reviewer, it is two answers to two different questions, and the pair carries MORE information than ` +
						`either coherent answer does. What this rate measures is how often the two variables come apart on ` +
						`real covers. That is the argument for splitting them in schema v2 (see design rule 9), not for ` +
						`grading a human against a bar written for a constrained decoder.`,
		}

		/* --- the stored answers, checked against the vocabulary they were drawn from ----------------- */

		const offVocabulary: { questionKey: string; imageId: string; value: string }[] = []
		const unsortedArrays: { questionKey: string; imageId: string; answer: readonly string[] }[] = []
		const duplicateValues: { questionKey: string; imageId: string; value: string }[] = []
		const emptyArrays: { questionKey: string; imageId: string }[] = []
		const wrongShape: { questionKey: string; imageId: string; expected: string; got: string }[] = []
		const orphanAnswers: { questionKey: string; imageId: string }[] = []
		let checked = 0
		for (const [key, answer] of source) {
			const split = key.indexOf(" ")
			const questionKey = key.slice(0, split)
			const imageId = key.slice(split + 1)
			if (!askedPairs.has(key)) orphanAnswers.push({ questionKey, imageId })
			const question = served.get(questionKey)
			if (question === undefined) continue
			checked += 1
			const vocabulary = new Set(question.answers.map((entry) => entry.key))
			const isArray = Array.isArray(answer)
			if (question.kind === "multi" && !isArray) wrongShape.push({ questionKey, imageId, expected: "array", got: "string" })
			if (question.kind !== "multi" && isArray) wrongShape.push({ questionKey, imageId, expected: "string", got: "array" })
			const values = typeof answer === "string" ? [answer] : [...answer]
			for (const value of values) if (!vocabulary.has(value)) offVocabulary.push({ questionKey, imageId, value })
			if (isArray) {
				if (values.length === 0) emptyArrays.push({ questionKey, imageId })
				const seen = new Set<string>()
				for (const value of values) {
					if (seen.has(value)) duplicateValues.push({ questionKey, imageId, value })
					seen.add(value)
				}
				if (canonicalToken(answer) !== values.join("+")) unsortedArrays.push({ questionKey, imageId, answer: values })
			}
		}
		const vocabularyProblems =
			offVocabulary.length + unsortedArrays.length + duplicateValues.length + emptyArrays.length + wrongShape.length + orphanAnswers.length
		const vocabulary: VocabularyCheck = {
			checked,
			offVocabulary,
			unsortedArrays,
			duplicateValues,
			emptyArrays,
			wrongShape,
			orphanAnswers,
			reading:
				vocabularyProblems === 0
					? `All ${checked} stored answers are in the fixture's own vocabulary, in the shape their question ` +
						`declares, sorted and without repeats, and every one is filed against a pair the round actually asked. ` +
						`The server enforces all of this at write time; this check exists because the analyzer used to type-check ` +
						`"string or string[]" and nothing else, so a hand-appended warehouse row with a bogus value would have ` +
						`passed the analysis silently.`
					: `${vocabularyProblems} stored answer(s) do not match the fixture they were recorded under. The server ` +
						`refuses all of these at write time, so a row that carries one did not come through the server.`,
		}

		return { answers, unanswered, perQuestion, gateConsistency, vocabulary }
	}

	/* --- the two readings, computed apart and never blended -------------------------------------- */

	// AS GIVEN: what this round's by-question passes produced. Frozen the moment the round released —
	// it is the measurement OF that elicitation design, and a later round cannot revise it.
	const asGivenState = computeState(byQuestionAndImage)
	// STANDING: the end of every supersession chain, including links written by later batches. This is
	// the reviewer's current position and the only reading a downstream consumer of these labels may use.
	const standingState = computeState(standingByQuestionAndImage)
	const { answers, unanswered, perQuestion, gateConsistency, vocabulary } = asGivenState
	const reconciliation = buildReconciliationReport(batchId, crossBatchSupersessions, supersedingBatchIds, asGivenState, standingState)

	/* --- plain language ------------------------------------------------------------------------ */

	const scoping = bcdeScopingNotes({
		artworks: artworks.size,
		joinExactBytes: joinTotals.exact_bytes,
		joinOtherRendition: joinTotals.same_artwork_other_rendition,
		joinTotal: joinTotals.exact_bytes + joinTotals.same_artwork_other_rendition,
	})
	const lines: string[] = []
	lines.push(`Group-BCDE reviewer validation — ${batchId} (${fixture.labelSchemaVersion})`)
	lines.push(
		`${artworks.size} artworks from the coverage-set core x ${fixture.questions.length} questions = ` +
			`${fixture.items.length} items · ${answers} answered, ${unanswered} not yet`,
	)
	lines.push(
		`JOIN TO THE PILOT: ${joinTotals.exact_bytes} artworks on identical bytes, ` +
			`${joinTotals.same_artwork_other_rendition} at another rendition, ${joinTotals.none} with no model answer at all.`,
	)
	lines.push("")
	if (answers === 0) {
		lines.push("NOTHING ANSWERED YET. Everything below is the round's shape, not its result.")
		lines.push("")
	}
	for (const result of perQuestion) {
		lines.push(`${result.key.toUpperCase()} (${result.kind}) — ${result.answered}/${result.answered + result.unanswered} answered`)
		const distribution = Object.entries(result.reviewerDistribution).sort((a, b) => b[1] - a[1])
		lines.push(
			`  reviewer said [independent]: ${distribution.length === 0 ? "nothing yet" : distribution.map(([value, count]) => `${value} ${count}`).join(" · ")}`,
		)
		// Printed ONLY where the two readings differ, so the absence of this line is itself the statement
		// that nothing about this question moved.
		const moved = reconciliation.changedDistributions.find((entry) => entry.questionKey === result.key)
		if (moved !== undefined) {
			const after = Object.entries(moved.standing).sort((a, b) => b[1] - a[1])
			lines.push(`  reviewer said [joint]: ${after.map(([value, count]) => `${value} ${count}`).join(" · ")}`)
		}
		if (result.multi !== null) {
			// A rate is not a count: `singletonRate` used to be printed as "one value only on 1 of rows",
			// which means twenty and reads as one.
			const rate = result.multi.singletonRate
			lines.push(
				`  set size: mean ${result.multi.meanSize ?? "n/a"} · one value only on ` +
					`${rate === null ? "n/a" : `${Math.round(rate * result.answered)} of ${result.answered} answered rows (${(rate * 100).toFixed(0)}%)`}`,
			)
		}
		// Per join grade, never across them: a 300 px rendition and a 640 px file are different items.
		for (const grade of JOINED_GRADES) {
			for (const variant of PILOT_VARIANTS) {
				const held = result.perVariant[variant][grade]
				if (held.n === 0) continue
				lines.push(
					`  [${grade}] vs ${variant}: ${held.buckets.agreement} agree · ${held.buckets.disagreement} disagree · ` +
						`${held.buckets.cant_tell} can't-tell  (n=${held.n})` +
						`  kappa ${held.kappa.kappa ?? `— ${held.kappa.reason}`}`,
				)
			}
			const agree = result.variantAgreementSubset[grade]
			const split = result.variantSplitSubset[grade]
			if (agree.n === 0 && split.n === 0) continue
			lines.push(
				`  [${grade}] E and F agreed on ${agree.n} answered rows (${agree.buckets.agreement} with the reviewer); ` +
					`they split on ${split.n} (reviewer with E ${split.reviewerWithE}, with F ${split.reviewerWithF}, ` +
					`with neither ${split.reviewerWithNeither}, could not tell ${split.reviewerCantTell})`,
			)
		}
		lines.push("")
	}
	lines.push(`GATE CONSISTENCY [${reconciliation.asGivenLabel}], against §15.6-(3)'s pre-registered table:`)
	for (const rule of gateConsistency.rules) {
		lines.push(
			rule.evaluable
				? `  #${rule.id} ${rule.statement} — ${rule.contradictions} of ${rule.rowsArmed} armed rows`
				: `  #${rule.id} ${rule.statement} — not evaluable: ${rule.notEvaluableBecause}`,
		)
	}
	for (const use of gateConsistency.abstentionUse) {
		lines.push(
			`  abstention: ${use.questionKey} used not_applicable ${use.refusalsUsed} time(s), on ` +
				`${use.opportunities} occasion(s) where its gate had just made it the only consistent answer`,
		)
	}
	lines.push(`  ${gateConsistency.reading}`)
	lines.push("")
	lines.push(`GATE CONSISTENCY [${reconciliation.standingLabel}]:`)
	for (const rule of reconciliation.standing.gateConsistency.rules) {
		lines.push(
			rule.evaluable
				? `  #${rule.id} ${rule.statement} — ${rule.contradictions} of ${rule.rowsArmed} armed rows`
				: `  #${rule.id} ${rule.statement} — not evaluable: ${rule.notEvaluableBecause}`,
		)
	}
	lines.push(`  ${reconciliation.standing.gateConsistency.reading}`)
	lines.push("")
	lines.push("INDEPENDENT vs JOINT ELICITATION — the same reviewer, the same artworks, two instruments:")
	lines.push(
		`  contradictions ${reconciliation.gateComparison.asGiven.totalContradictions} -> ` +
			`${reconciliation.gateComparison.standing.totalContradictions} · artworks ` +
			`${reconciliation.gateComparison.asGiven.artworksWithAnyContradiction} -> ` +
			`${reconciliation.gateComparison.standing.artworksWithAnyContradiction} · rate ` +
			`${reconciliation.gateComparison.asGiven.contradictionRate} -> ${reconciliation.gateComparison.standing.contradictionRate}`,
	)
	for (const rule of reconciliation.gateComparison.perRule) {
		if (rule.asGivenContradictions === 0 && rule.standingContradictions === 0) continue
		lines.push(
			`  #${rule.id} ${rule.asGivenContradictions} of ${rule.asGivenRowsArmed} armed -> ` +
				`${rule.standingContradictions} of ${rule.standingRowsArmed} armed  (resolved ${rule.resolved})`,
		)
	}
	lines.push(
		`  ${reconciliation.answersSuperseded} answer(s) superseded from another batch, ${reconciliation.answersChanged} of them changed`,
	)
	for (const entry of reconciliation.crossBatchSupersessions.filter((row) => row.changed)) {
		lines.push(
			`    ${entry.questionKey} on ${entry.imageId}: ${canonicalToken(entry.asGiven)} -> ${canonicalToken(entry.standing)}`,
		)
	}
	for (const question of reconciliation.changedDistributions) {
		lines.push(
			`  distribution moved — ${question.questionKey}: ` +
				question.moved.map((entry) => `${entry.value} ${entry.asGiven}->${entry.standing}`).join(" · "),
		)
	}
	for (const join of reconciliation.changedJoins) {
		lines.push(
			`  join moved — ${join.questionKey} [${join.grade}] vs ${join.variant}: ` +
				`${join.asGiven.buckets.agreement}/${join.asGiven.buckets.disagreement}/${join.asGiven.buckets.cant_tell} -> ` +
				`${join.standing.buckets.agreement}/${join.standing.buckets.disagreement}/${join.standing.buckets.cant_tell} ` +
				`(agree/disagree/can't-tell, n=${join.asGiven.n}->${join.standing.n})`,
		)
	}
	lines.push(`  ${reconciliation.reading}`)
	lines.push("")
	lines.push(`VOCABULARY: ${vocabulary.reading}`)
	if (verification !== null) {
		lines.push("")
		lines.push(`JOIN VERIFIED AGAINST THE IMAGE BYTES (${verification.method}):`)
		for (const pair of verification.pairs) {
			lines.push(`  ${pair.accepted ? "accepted" : "REJECTED"} ${pair.roundPath} (${pair.proposedGrade}) — ${pair.reason}`)
		}
		if (verification.unresolvedPaths.length > 0) lines.push(`  ${verification.unresolvedPaths.length} path(s) could not be read`)
	} else {
		lines.push("")
		lines.push("JOIN NOT VERIFIED IN THIS RUN. The grades below rest on id equality alone; run the CLI to check them against the files.")
	}
	lines.push("")
	lines.push("QUESTIONS DELIBERATELY NOT ASKED, and why (the pilot's own numbers):")
	for (const [key, reason] of Object.entries(BCDE_VALIDATION_OMITTED_REASONS)) lines.push(`  ${key} — ${reason}`)
	lines.push("")
	lines.push("SCOPING:")
	for (const note of scoping) lines.push(`  - ${note}`)

	return {
		generatedAt: now().toISOString(),
		whatThisIs:
			`The first human answers to any group-BCDE question, beside the pilot's two prompt variants. ` +
			`No number here is an accuracy: the reviewer-vs-model join is ` +
			`${joinTotals.exact_bytes + joinTotals.same_artwork_other_rendition} artworks wide and is reported ` +
			`split by join grade, never pooled; and P6 forbids reading any oracle cross-check as an exact-match ` +
			`test in the first place.`,
		warehousePath: paths.warehousePath,
		fixturePath: paths.fixturePath,
		pilotRunPath: paths.pilotRunPath,
		batchId,
		labelSchemaVersion: fixture.labelSchemaVersion,
		scoping,
		counts: {
			artworks: artworks.size,
			questions: fixture.questions.length,
			items: fixture.items.length,
			answers,
			unanswered,
			joinExactBytes: joinTotals.exact_bytes,
			joinOtherRendition: joinTotals.same_artwork_other_rendition,
			joinNone: joinTotals.none,
		},
		skipped,
		questionsOmitted: BCDE_VALIDATION_OMITTED_REASONS,
		gateConsistency,
		vocabulary,
		reconciliation,
		overlapVerification: verification,
		unexpectedPilotVariants: pilot.variantsSeen.filter((variant) => !(PILOT_VARIANTS as readonly string[]).includes(variant)),
		perQuestion,
		summaryLines: lines,
	}
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			warehouse: { type: "string" },
			fixture: { type: "string" },
			batch: { type: "string" },
			run: { type: "string" },
			out: { type: "string" },
			/** Where a fixture's relative `imagePath` is rooted, for the byte-level join verification. */
			"image-root": { type: "string" },
			/** Skip the byte-level verification. The analysis then says so rather than implying it passed. */
			"no-verify": { type: "boolean", default: false },
		},
		strict: true,
	})
	const warehousePath = values.warehouse ?? DEFAULT_WAREHOUSE_PATH
	const fixturePath = values.fixture ?? BCDE_VALIDATION_FIXTURE_PATH
	const pilotRunPath = values.run ?? BCDE_PILOT_RUN_PATH
	const imageRoot = values["image-root"] ?? REPO_ROOT
	const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as OracleValidationFixture
	const pilot = await readPilotAnswers(pilotRunPath)
	const verification = values["no-verify"] === true ? null : await verifyPilotOverlap(fixture, pilot, imageRoot)
	const analysis = analyzeBcdeValidation(
		fixture,
		readAll(warehousePath),
		pilot,
		{
			warehousePath,
			fixturePath,
			pilotRunPath,
			batchId: values.batch ?? BCDE_VALIDATION_BATCH_ID,
		},
		() => new Date(),
		verification,
	)
	const outPath = values.out ?? BCDE_VALIDATION_ANALYSIS_PATH
	await mkdir(dirname(outPath), { recursive: true })
	await writeFile(outPath, `${JSON.stringify(analysis, null, "\t")}\n`)
	process.stdout.write(`${analysis.summaryLines.join("\n")}\n`)
	process.stdout.write(`\nwrote ${outPath}\n`)
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main()
}
