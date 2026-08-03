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
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
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
	images: number
}>

/** Index the pilot's parsed answers by both join keys. Canaries and failed rows never enter. */
export async function readPilotAnswers(path = BCDE_PILOT_RUN_PATH): Promise<PilotAnswers> {
	const text = await readFile(path, "utf8")
	const bySha = new Map<string, Map<string, Record<string, string | string[]>>>()
	const byArtwork = new Map<string, Map<string, Record<string, string | string[]>>>()
	const pathByArtwork = new Map<string, string>()
	for (const line of text.split("\n")) {
		const trimmed = line.trim()
		if (trimmed.length === 0) continue
		const row = JSON.parse(trimmed) as PilotRow
		if (row.is_canary === true || row.parse_failed === true || !row.parsed) continue
		if (row.status !== undefined && row.status !== "ok") continue
		let sha = bySha.get(row.image_sha256)
		if (sha === undefined) bySha.set(row.image_sha256, (sha = new Map()))
		sha.set(row.prompt_variant, row.parsed)
		if (typeof row.artwork_id === "string") {
			let art = byArtwork.get(row.artwork_id)
			if (art === undefined) byArtwork.set(row.artwork_id, (art = new Map()))
			art.set(row.prompt_variant, row.parsed)
			pathByArtwork.set(row.artwork_id, row.image_path)
		}
	}
	return { bySha, byArtwork, pathByArtwork, images: bySha.size }
}

/* ------------------------------------------------------------------------------------------- */
/* Reading the warehouse                                                                         */
/* ------------------------------------------------------------------------------------------- */

export type ReviewerAnswers = Readonly<{
	/** `questionKey` + " " + `imageId` → the standing answer. Arrays survive as arrays. */
	byQuestionAndImage: ReadonlyMap<string, string | readonly string[]>
	skipped: Readonly<Record<string, number>>
}>

/**
 * The reviewer's final answer per (question, image).
 *
 * Same supersession rule the server and every other analysis use: amendments applied first,
 * retracted records dropped, latest wins when one item carries several answers. Unlike the
 * probe-gold reader this one keeps array answers — the multi-select is the point.
 */
export function collectBcdeAnswers(records: readonly WarehouseRecord[], batchId: string): ReviewerAnswers {
	const skipped: Record<string, number> = { otherBatch: 0, machineAuthored: 0, retracted: 0, superseded: 0, unusableAnswer: 0 }
	const latest = new Map<string, { answer: string | readonly string[]; index: number }>()
	resolve(records).forEach((entry, index) => {
		if (entry.record.type !== "oracle-label") return
		const label = entry.record as OracleLabelRecord
		if (entry.retracted) {
			skipped.retracted++
			return
		}
		if (label.batch?.id !== batchId) {
			skipped.otherBatch++
			return
		}
		if (label.author.kind !== "human") {
			skipped.machineAuthored++
			return
		}
		const answer = label.answer
		const usable = typeof answer === "string" || (Array.isArray(answer) && answer.every((value) => typeof value === "string"))
		if (!usable) {
			skipped.unusableAnswer++
			return
		}
		const key = `${label.questionKey} ${label.imageId}`
		const previous = latest.get(key)
		if (previous !== undefined) skipped.superseded++
		if (previous === undefined || previous.index < index) {
			latest.set(key, { answer: answer as string | readonly string[], index })
		}
	})
	return {
		byQuestionAndImage: new Map([...latest].map(([key, value]) => [key, value.answer])),
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
	return [...a].sort().join(" ") === [...b].sort().join(" ")
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
	/** The rendition the pilot decoded, when it is not this one. */
	pilotImagePath: string | null
	reviewer: string | readonly string[] | null
	model: Readonly<Partial<Record<PilotVariant, string | readonly string[]>>>
	/** Per variant, P6's bucket. Absent where the artwork does not join. */
	bucket: Readonly<Partial<Record<PilotVariant, PairBucket>>>
	/** True when E and F said the same thing about this artwork — the only subset with one model answer. */
	variantsAgree: boolean | null
	setOverlap: number | null
}>

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
	/** Reviewer vs each variant, on the artworks that join at all. Counts always; kappa only above the floor. */
	perVariant: Readonly<
		Record<
			PilotVariant,
			Readonly<{
				buckets: Record<PairBucket, number>
				exactSetAgreement: number | null
				meanJaccard: number | null
				kappa: ReturnType<typeof cohenKappa>
			}>
		>
	>
	/** The subset where E and F said the same thing: the only place a single "the model" exists. */
	variantAgreementSubset: Readonly<{
		n: number
		buckets: Record<PairBucket, number>
		kappa: ReturnType<typeof cohenKappa>
	}>
	/** The subset where E and F split: what the reviewer's answer says about wording, not accuracy. */
	variantSplitSubset: Readonly<{ n: number; reviewerWithE: number; reviewerWithF: number; reviewerWithNeither: number }>
	joinCounts: Readonly<Record<JoinGrade, number>>
	perArtwork: readonly ArtworkAnswer[]
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
	perQuestion: readonly QuestionResult[]
	summaryLines: readonly string[]
}>

/**
 * Scoping notes stamped on every run, ahead of every number.
 *
 * They live here rather than in a report because the conditions a measurement was taken under stop
 * travelling with it the moment they live somewhere else. Three of the four cut against the result.
 */
export const BCDE_SCOPING_NOTES = [
	"NO GROUND TRUTH EXISTED BEFORE THIS ROUND. The pilot measured E against F, which is " +
		"self-consistency; a model can be perfectly self-consistent and perfectly wrong. These reviewer " +
		"answers are the first human answer to any group-BCDE question, and they are elicited human " +
		"labels — PHASE_0_DECISIONS.md §8's primary judge for any oracle comparison.",
	"THE JOIN IS TINY, AND THAT IS THE HEADLINE. The round is drawn from the coverage set's core; the " +
		"pilot ran on eval-142. Three artworks are in both — two on identical bytes, one at another " +
		"rendition. No agreement rate computed on three rows is a rate. The two join grades are never " +
		"pooled: a 300 px and a 640 px rendition are different items (CONVENTIONS.md), and grain in " +
		"particular can legitimately differ between them.",
	"WORDING ASYMMETRY, PRE-REGISTERED (§15.9). Every stem and gloss the reviewer read was parsed out " +
		"of variant E's prompt file. Scoring F against these answers carries a wording caveat that " +
		"scoring E does not. That asymmetry is the price of two independent renderings; it is stated, " +
		"not discovered later.",
	"WHAT THE ROUND IS FOR AT FULL WIDTH: twenty reviewer labels per question on the corpus bench — the " +
		"first labels the coverage set has ever carried — and §15.9's real product, which is whether a " +
		"human can answer each of these questions at all. A question the reviewer finds unanswerable is " +
		"deleted regardless of what the model did with it.",
	"NEVER ONE ACCURACY NUMBER (PHASE_0_DECISIONS.md §4 P6). Every pair is bucketed agreement / " +
		"disagreement / can't-tell, and the E-and-F-agree subset is reported apart from the E-and-F-split " +
		"subset, because on a split row there is no single model answer to be accurate against.",
]

const EMPTY_BUCKETS = (): Record<PairBucket, number> => ({ agreement: 0, disagreement: 0, cant_tell: 0 })

function ratio(part: number, whole: number): number | null {
	return whole === 0 ? null : Number((part / whole).toFixed(4))
}

export function analyzeBcdeValidation(
	fixture: OracleValidationFixture,
	records: readonly WarehouseRecord[],
	pilot: PilotAnswers,
	paths: { warehousePath: string; fixturePath: string; pilotRunPath: string; batchId?: string },
	now: () => Date = () => new Date(),
): BcdeValidationAnalysis {
	const batchId = paths.batchId ?? fixture.batchId
	const { byQuestionAndImage, skipped } = collectBcdeAnswers(records, batchId)

	// One row per artwork, taken from the first pass — every pass covers the same twenty.
	const artworks = new Map<string, { imageId: string; imagePath: string; sha256: string; stratum: string; artworkId: string | null }>()
	for (const item of fixture.items) {
		if (artworks.has(item.sha256)) continue
		artworks.set(item.sha256, {
			imageId: item.imageId,
			imagePath: item.imagePath,
			sha256: item.sha256,
			stratum: item.stratum,
			artworkId: item.artworkId,
		})
	}

	const joinOf = (artwork: { sha256: string; artworkId: string | null }): { grade: JoinGrade; answers: ReadonlyMap<string, Record<string, string | string[]>> | null; pilotPath: string | null } => {
		const exact = pilot.bySha.get(artwork.sha256)
		if (exact !== undefined) return { grade: "exact_bytes", answers: exact, pilotPath: null }
		const other = artwork.artworkId === null ? undefined : pilot.byArtwork.get(artwork.artworkId)
		if (other !== undefined) {
			return {
				grade: "same_artwork_other_rendition",
				answers: other,
				pilotPath: pilot.pathByArtwork.get(artwork.artworkId!) ?? null,
			}
		}
		return { grade: "none", answers: null, pilotPath: null }
	}

	let answers = 0
	let unanswered = 0
	const joinTotals: Record<JoinGrade, number> = { exact_bytes: 0, same_artwork_other_rendition: 0, none: 0 }
	for (const artwork of artworks.values()) joinTotals[joinOf(artwork).grade] += 1

	const perQuestion: QuestionResult[] = fixture.questions.map((question) => {
		const reviewerDistribution: Record<string, number> = {}
		const perValue: Record<string, number> = {}
		const joinCounts: Record<JoinGrade, number> = { exact_bytes: 0, same_artwork_other_rendition: 0, none: 0 }
		const perVariant = Object.fromEntries(
			PILOT_VARIANTS.map((variant) => [
				variant,
				{ buckets: EMPTY_BUCKETS(), pairs: [] as [string, string][], jaccards: [] as number[], exactSets: [] as boolean[] },
			]),
		) as Record<PilotVariant, { buckets: Record<PairBucket, number>; pairs: [string, string][]; jaccards: number[]; exactSets: boolean[] }>
		const agreeSubset = { n: 0, buckets: EMPTY_BUCKETS(), pairs: [] as [string, string][] }
		const splitSubset = { n: 0, reviewerWithE: 0, reviewerWithF: 0, reviewerWithNeither: 0 }
		let answeredHere = 0
		let sizeSum = 0
		let singletons = 0

		const rows: ArtworkAnswer[] = [...artworks.values()]
			.sort((a, b) => (a.sha256 < b.sha256 ? -1 : 1))
			.map((artwork) => {
				const reviewer = byQuestionAndImage.get(`${question.key} ${artwork.imageId}`) ?? null
				if (reviewer === null) unanswered += 1
				else {
					answers += 1
					answeredHere += 1
					const values = typeof reviewer === "string" ? [reviewer] : [...reviewer]
					reviewerDistribution[values.join("+")] = (reviewerDistribution[values.join("+")] ?? 0) + 1
					for (const value of values) perValue[value] = (perValue[value] ?? 0) + 1
					sizeSum += values.length
					if (values.length === 1) singletons += 1
				}

				const join = joinOf(artwork)
				joinCounts[join.grade] += 1
				const model: Partial<Record<PilotVariant, string | readonly string[]>> = {}
				const bucket: Partial<Record<PilotVariant, PairBucket>> = {}
				let setOverlap: number | null = null
				for (const variant of PILOT_VARIANTS) {
					const parsed = join.answers?.get(variant)
					const value = parsed?.[question.key]
					if (value === undefined) continue
					model[variant] = value
					if (reviewer === null) continue
					const b = bucketOf(reviewer, value)
					bucket[variant] = b
					perVariant[variant].buckets[b] += 1
					// A kappa needs one token per side. A set answer is keyed by its sorted join, which makes
					// the coefficient an EXACT-SET kappa — the same reading §15.7 used on the pilot's own
					// multi-selects, and reported beside the Jaccard rather than instead of it.
					const left = typeof reviewer === "string" ? reviewer : [...reviewer].sort().join("+")
					const right = typeof value === "string" ? value : [...value].sort().join("+")
					perVariant[variant].pairs.push([left, right])
					if (typeof reviewer !== "string" || typeof value !== "string") {
						const overlap = jaccard(
							typeof reviewer === "string" ? [reviewer] : [...reviewer],
							typeof value === "string" ? [value] : [...value],
						)
						perVariant[variant].jaccards.push(overlap)
						perVariant[variant].exactSets.push(sameAnswer(reviewer, value))
						setOverlap = setOverlap === null ? overlap : Math.max(setOverlap, overlap)
					}
				}

				const e = model.E
				const f = model.F
				const variantsAgree = e === undefined || f === undefined ? null : sameAnswer(e, f)
				if (reviewer !== null && variantsAgree === true) {
					agreeSubset.n += 1
					const b = bucketOf(reviewer, e!)
					agreeSubset.buckets[b] += 1
					agreeSubset.pairs.push([
						typeof reviewer === "string" ? reviewer : [...reviewer].sort().join("+"),
						typeof e === "string" ? e : [...(e as readonly string[])].sort().join("+"),
					])
				}
				if (reviewer !== null && variantsAgree === false) {
					splitSubset.n += 1
					const withE = sameAnswer(reviewer, e!)
					const withF = sameAnswer(reviewer, f!)
					if (withE) splitSubset.reviewerWithE += 1
					if (withF) splitSubset.reviewerWithF += 1
					if (!withE && !withF) splitSubset.reviewerWithNeither += 1
				}

				return {
					imageId: artwork.imageId,
					imagePath: artwork.imagePath,
					sha256: artwork.sha256,
					stratum: artwork.stratum,
					joinGrade: join.grade,
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
				PILOT_VARIANTS.map((variant) => {
					const held = perVariant[variant]
					return [
						variant,
						{
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
			) as QuestionResult["perVariant"],
			variantAgreementSubset: { n: agreeSubset.n, buckets: agreeSubset.buckets, kappa: cohenKappa(agreeSubset.pairs) },
			variantSplitSubset: splitSubset,
			joinCounts,
			perArtwork: rows,
		}
	})

	/* --- plain language ------------------------------------------------------------------------ */

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
			`  reviewer said: ${distribution.length === 0 ? "nothing yet" : distribution.map(([value, count]) => `${value} ${count}`).join(" · ")}`,
		)
		if (result.multi !== null) {
			lines.push(`  set size: mean ${result.multi.meanSize ?? "n/a"} · one value only on ${result.multi.singletonRate ?? "n/a"} of rows`)
		}
		for (const variant of PILOT_VARIANTS) {
			const held = result.perVariant[variant]
			const total = held.buckets.agreement + held.buckets.disagreement + held.buckets.cant_tell
			lines.push(
				`  vs ${variant}: ${held.buckets.agreement} agree · ${held.buckets.disagreement} disagree · ` +
					`${held.buckets.cant_tell} can't-tell  (n=${total})` +
					`  kappa ${held.kappa.kappa ?? `— ${held.kappa.reason}`}`,
			)
		}
		lines.push(
			`  E and F agreed on ${result.variantAgreementSubset.n} answered rows ` +
				`(${result.variantAgreementSubset.buckets.agreement} with the reviewer); they split on ` +
				`${result.variantSplitSubset.n} (reviewer with E ${result.variantSplitSubset.reviewerWithE}, ` +
				`with F ${result.variantSplitSubset.reviewerWithF}, with neither ${result.variantSplitSubset.reviewerWithNeither})`,
		)
		lines.push("")
	}
	lines.push("QUESTIONS DELIBERATELY NOT ASKED, and why (the pilot's own numbers):")
	for (const [key, reason] of Object.entries(BCDE_VALIDATION_OMITTED_REASONS)) lines.push(`  ${key} — ${reason}`)
	lines.push("")
	lines.push("SCOPING:")
	for (const note of BCDE_SCOPING_NOTES) lines.push(`  - ${note}`)

	return {
		generatedAt: now().toISOString(),
		whatThisIs:
			"The first human answers to any group-BCDE question, beside the pilot's two prompt variants. " +
			"No number here is an accuracy: the reviewer-vs-model join is three artworks wide, and P6 " +
			"forbids reading any oracle cross-check as an exact-match test in the first place.",
		warehousePath: paths.warehousePath,
		fixturePath: paths.fixturePath,
		pilotRunPath: paths.pilotRunPath,
		batchId,
		labelSchemaVersion: fixture.labelSchemaVersion,
		scoping: BCDE_SCOPING_NOTES,
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
		},
		strict: true,
	})
	const warehousePath = values.warehouse ?? DEFAULT_WAREHOUSE_PATH
	const fixturePath = values.fixture ?? BCDE_VALIDATION_FIXTURE_PATH
	const pilotRunPath = values.run ?? BCDE_PILOT_RUN_PATH
	const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as OracleValidationFixture
	const analysis = analyzeBcdeValidation(fixture, readAll(warehousePath), await readPilotAnswers(pilotRunPath), {
		warehousePath,
		fixturePath,
		pilotRunPath,
		batchId: values.batch ?? BCDE_VALIDATION_BATCH_ID,
	})
	const outPath = values.out ?? BCDE_VALIDATION_ANALYSIS_PATH
	await mkdir(dirname(outPath), { recursive: true })
	await writeFile(outPath, `${JSON.stringify(analysis, null, "\t")}\n`)
	process.stdout.write(`${analysis.summaryLines.join("\n")}\n`)
	process.stdout.write(`\nwrote ${outPath}\n`)
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main()
}
