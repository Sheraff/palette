/**
 * The premise-test disambiguation round — analysis.
 *
 * The premise test (`research/v3/oracle/premise/`) put the VLM's `ground_type` next to the gradient
 * boolean on accepted palettes and sorted every pair into agreement / contradiction / can't-tell. On
 * the contradictions the two sources cannot both be right, and neither of them is a human looking at
 * the artwork and answering the question. The oracle-validation round is that human. This script
 * joins the three sides and says who the human agreed with.
 *
 * Three-way join, by content hash on every side:
 *   (a) the reviewer's `ground_type` answers, from the warehouse (`oracle-label`, `author.kind`
 *       `human`, scoped to one batch id);
 *   (b) the VLM's `ground_type` per prompt variant, from `premise-run-1.jsonl`;
 *   (c) the accepted palette's gradient boolean, from the same run's `gradient_truth` — which is
 *       `eval-set.json`'s ground truth, carried onto every row.
 *
 * This number decides the oracle-premise verdict, so the output is written as JSON *and* printed as
 * plain sentences and one line per artwork. Nothing here throws on missing answers: it runs on a
 * half-answered round and reports what is missing.
 *
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/src/review-server/analyze-oracle-validation.ts \
 *     [--warehouse <path>] [--fixture <path>] [--batch <id>] [--run <jsonl>] [--out <path>]
 *
 * Path note: the premise-test code in `research/v3/oracle/premise/` is another workstream's and is
 * not touched. This script only *reads* its committed outputs, and re-derives its maps from
 * constants that a test pins against `premise-run-1.agreement.json` so the two cannot drift.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { DEFAULT_WAREHOUSE_PATH } from "../warehouse/cli.ts"
import type { OracleLabelRecord, WarehouseRecord } from "../warehouse/records.ts"
import { readAll, resolve } from "../warehouse/warehouse.ts"
import {
	GRADIENT_MAP,
	PREMISE_DISAMBIGUATION_BATCH_ID,
	PREMISE_DISAMBIGUATION_FIXTURE_PATH,
	PREMISE_RUN_PATH,
	p6Bucket,
	readPremiseRun,
	type OracleValidationFixture,
	type P6Bucket,
} from "./oracle-validation.ts"

/** Where the analysis is written when `--out` is not given. Sits beside the fixture it analyses. */
export const ORACLE_VALIDATION_ANALYSIS_PATH = fileURLToPath(
	new URL("../../data/oracle-validation/premise-disambiguation-1-analysis.json", import.meta.url),
)

/** The binary a `ground_type` predicts, or null when the label makes no prediction either way. */
export type Binary = "gradient" | "flat" | null

function binaryOf(groundType: string): Binary {
	const mapped = GRADIENT_MAP[groundType]
	return mapped === undefined || mapped === "unmapped" ? null : mapped
}

export type VariantView = Readonly<{
	groundType: string
	binary: Binary
	bucket: P6Bucket
	/** The VLM said exactly what the reviewer said. */
	exactMatch: boolean | null
	/** The VLM's prediction and the reviewer's answer point the same way on the gradient boolean. */
	binaryAgrees: boolean | null
	/** This variant is one of the reasons the artwork is in the round. */
	contradicted: boolean
}>

export type ArtworkResult = Readonly<{
	itemId: string
	imagePath: string
	imageId: string
	sha256: string
	stratum: string
	answered: boolean
	/** The reviewer's answer, verbatim from the closed vocabulary. */
	reviewerGroundType: string | null
	/** What that answer predicts for the gradient boolean. Null when the label predicts nothing. */
	reviewerBinary: Binary
	/** The accepted palette's gradient boolean — the "flag". */
	flagGradient: boolean
	flagAgrees: boolean | null
	oracle: Readonly<Record<string, VariantView>>
	/**
	 * Who the reviewer's answer lands with, counting both variants: `both` means the reviewer agrees
	 * with the flag *and* with at least one variant (possible because a batch member can contradict
	 * under one prompt wording and agree under the other).
	 */
	whoAgreed: "oracle" | "flag" | "both" | "neither" | null
	/**
	 * The sharp version, on the contradicting variants only — the tie the round exists to break. In a
	 * contradiction cell the oracle and the flag point opposite ways by construction, so this is
	 * `oracle`, `flag`, or `neither` (the reviewer chose a label that predicts nothing).
	 */
	contradictionVerdict: "oracle" | "flag" | "neither" | null
}>

export type OracleValidationAnalysis = Readonly<{
	generatedAt: string
	warehousePath: string
	fixturePath: string
	premiseRunPath: string
	batchId: string
	question: Readonly<{ key: string; question: string; instruction: string; vocabulary: readonly string[] }>
	total: number
	answered: number
	unanswered: number
	skipped: Readonly<Record<string, number>>
	perArtwork: readonly ArtworkResult[]
	totals: Readonly<{
		whoAgreed: Readonly<Record<string, number>>
		contradictionVerdict: Readonly<Record<string, number>>
		reviewerGroundType: Readonly<Record<string, number>>
		reviewerBinary: Readonly<Record<string, number>>
		/** The reviewer said the same word the VLM said. */
		exactMatchWithOracle: Readonly<Record<string, { n: number; matched: number; rate: number | null }>>
		/** The reviewer and the VLM point the same way on the gradient boolean. */
		binaryAgreementWithOracle: Readonly<Record<string, { n: number; agreed: number; rate: number | null }>>
		binaryAgreementWithFlag: Readonly<{ n: number; agreed: number; rate: number | null }>
		byStratum: Readonly<Record<string, Readonly<Record<string, number>>>>
	}>
	summaryLines: readonly string[]
	artworkLines: readonly string[]
}>

function rate(part: number, whole: number): number | null {
	return whole === 0 ? null : Number((part / whole).toFixed(4))
}

function bump(counter: Record<string, number>, key: string): void {
	counter[key] = (counter[key] ?? 0) + 1
}

/**
 * The reviewer's latest answer per artwork, keyed by content hash.
 *
 * Scoped to one batch id and to human authorship. Both filters are load-bearing: the same
 * `labelSchemaVersion` is what the VLM's own rows will carry when they land in the warehouse — that
 * is the point of the mode, the rows are meant to be comparable — so authorship is what separates
 * the rater from the subject, and a different batch is a different round that must never be pooled.
 */
export function collectReviewerAnswers(
	records: readonly WarehouseRecord[],
	fixture: OracleValidationFixture,
	batchId: string,
	questionKey: string,
): { bySha: Map<string, string>; skipped: Record<string, number> } {
	const known = new Map(fixture.items.map((item) => [item.sha256, item]))
	const skipped: Record<string, number> = {
		otherBatch: 0,
		machineAuthored: 0,
		otherQuestion: 0,
		unknownArtwork: 0,
		nonStringAnswer: 0,
		retracted: 0,
		superseded: 0,
	}
	const latest = new Map<string, { answer: string; index: number }>()
	resolve(records).forEach((entry, index) => {
		if (entry.record.type !== "oracle-label") return
		const label = entry.record as OracleLabelRecord
		if (entry.retracted) {
			skipped.retracted++
			return
		}
		if (label.batch === null || label.batch.id !== batchId) {
			skipped.otherBatch++
			return
		}
		if (label.author.kind !== "human") {
			skipped.machineAuthored++
			return
		}
		if (label.questionKey !== questionKey) {
			skipped.otherQuestion++
			return
		}
		const sha256 = label.artwork?.sha256 ?? ""
		if (!known.has(sha256)) {
			skipped.unknownArtwork++
			return
		}
		if (typeof label.answer !== "string") {
			skipped.nonStringAnswer++
			return
		}
		const previous = latest.get(sha256)
		if (previous !== undefined) skipped.superseded++
		if (previous === undefined || previous.index < index) latest.set(sha256, { answer: label.answer, index })
	})
	return { bySha: new Map([...latest].map(([sha256, entry]) => [sha256, entry.answer])), skipped }
}

export function analyzeOracleValidation(
	fixture: OracleValidationFixture,
	records: readonly WarehouseRecord[],
	premise: Map<string, { truth: boolean; conflicted: boolean; byVariant: Map<string, string> }>,
	paths: { warehousePath: string; fixturePath: string; premiseRunPath: string; batchId?: string },
	now: () => Date = () => new Date(),
): OracleValidationAnalysis {
	const batchId = paths.batchId ?? fixture.batchId
	const question = fixture.questions[0]
	const { bySha: answers, skipped } = collectReviewerAnswers(records, fixture, batchId, question.key)

	const variants = [...new Set(fixture.items.flatMap((item) => [...(premise.get(item.sha256)?.byVariant.keys() ?? [])]))].sort()

	const whoAgreed: Record<string, number> = {}
	const contradictionVerdict: Record<string, number> = {}
	const reviewerGroundType: Record<string, number> = {}
	const reviewerBinary: Record<string, number> = {}
	const exact: Record<string, { n: number; matched: number; rate: number | null }> = {}
	const binaryOracle: Record<string, { n: number; agreed: number; rate: number | null }> = {}
	for (const variant of variants) {
		exact[variant] = { n: 0, matched: 0, rate: null }
		binaryOracle[variant] = { n: 0, agreed: 0, rate: null }
	}
	const flagTotals = { n: 0, agreed: 0, rate: null as number | null }
	const byStratum: Record<string, Record<string, number>> = {}

	const perArtwork: ArtworkResult[] = fixture.serveOrder.map((itemId) => {
		const item = fixture.items.find((entry) => entry.itemId === itemId)!
		const source = premise.get(item.sha256)
		if (source === undefined) throw new Error(`no premise row for ${item.imagePath}; the sources disagree about the corpus`)
		const answer = answers.get(item.sha256) ?? null
		const reviewerSide = answer === null ? null : binaryOf(answer)

		const oracle: Record<string, VariantView> = {}
		let agreesWithSomeVariant = false
		/** The binary the contradicting variants imply. Unambiguous: see the note below. */
		let contradictingSide: Binary = null
		for (const variant of variants) {
			const groundType = source.byVariant.get(variant)
			if (groundType === undefined) continue
			const bucket = p6Bucket(groundType, source.truth)
			const side = binaryOf(groundType)
			const contradicted = bucket.startsWith("contradiction")
			// In a contradiction cell the label is either flat_field against a published gradient or
			// shaded_field against a published flat, so its binary is always the opposite of the flag —
			// which is why two contradicting variants can never imply opposite sides of the tie.
			if (contradicted) contradictingSide = side
			const exactMatch = answer === null ? null : groundType === answer
			const binaryAgrees = answer === null || side === null || reviewerSide === null ? null : side === reviewerSide
			if (binaryAgrees === true) agreesWithSomeVariant = true
			oracle[variant] = { groundType, binary: side, bucket, exactMatch, binaryAgrees, contradicted }
			if (answer !== null) {
				exact[variant].n += 1
				if (exactMatch === true) exact[variant].matched += 1
				if (binaryAgrees !== null) {
					binaryOracle[variant].n += 1
					if (binaryAgrees) binaryOracle[variant].agreed += 1
				}
			}
		}

		const flagSide: Binary = source.truth ? "gradient" : "flat"
		const flagAgrees = answer === null || reviewerSide === null ? null : reviewerSide === flagSide
		const who =
			answer === null
				? null
				: flagAgrees === true && agreesWithSomeVariant
					? "both"
					: flagAgrees === true
						? "flag"
						: agreesWithSomeVariant
							? "oracle"
							: "neither"
		const verdict =
			answer === null || reviewerSide === null
				? answer === null
					? null
					: "neither"
				: reviewerSide === contradictingSide
					? "oracle"
					: reviewerSide === flagSide
						? "flag"
						: "neither"

		if (answer !== null) {
			bump(reviewerGroundType, answer)
			bump(reviewerBinary, reviewerSide ?? "no-prediction")
			bump(whoAgreed, who!)
			bump(contradictionVerdict, verdict!)
			byStratum[item.stratum] ??= {}
			bump(byStratum[item.stratum], verdict!)
			if (flagAgrees !== null) {
				flagTotals.n += 1
				if (flagAgrees) flagTotals.agreed += 1
			}
		}

		return {
			itemId: item.itemId,
			imagePath: item.imagePath,
			imageId: item.imageId,
			sha256: item.sha256,
			stratum: item.stratum,
			answered: answer !== null,
			reviewerGroundType: answer,
			reviewerBinary: reviewerSide,
			flagGradient: source.truth,
			flagAgrees,
			oracle,
			whoAgreed: who as ArtworkResult["whoAgreed"],
			contradictionVerdict: verdict as ArtworkResult["contradictionVerdict"],
		}
	})

	for (const variant of variants) {
		exact[variant].rate = rate(exact[variant].matched, exact[variant].n)
		binaryOracle[variant].rate = rate(binaryOracle[variant].agreed, binaryOracle[variant].n)
	}
	flagTotals.rate = rate(flagTotals.agreed, flagTotals.n)

	const answered = perArtwork.filter((entry) => entry.answered).length
	const sidedWithOracle = contradictionVerdict.oracle ?? 0
	const sidedWithFlag = contradictionVerdict.flag ?? 0
	const undetermined = contradictionVerdict.neither ?? 0

	/* --- plain language ----------------------------------------------------------------------- */

	const lines: string[] = []
	lines.push(`Premise-test disambiguation — ${batchId}`)
	lines.push(`${answered} of ${perArtwork.length} artworks answered by the reviewer.`)
	if (answered < perArtwork.length) {
		// The round is still being answered, and this output shows both sides' answers per artwork.
		lines.push("")
		lines.push("REVIEWER: DO NOT READ THIS YET. It lists what the oracle said and what the algorithm")
		lines.push(`published for each artwork, and ${perArtwork.length - answered} of them are still unanswered.`)
	}
	if (answered === 0) {
		lines.push("Nothing to say yet: the round has no answers.")
	} else {
		lines.push("")
		lines.push("THE TIE-BREAK. On each of these artworks the oracle and the accepted palette's gradient flag")
		lines.push("contradicted each other. Asked to look and answer the same question, the reviewer sided with:")
		lines.push(`  the oracle  ${sidedWithOracle} of ${answered} (${pct(sidedWithOracle, answered)})`)
		lines.push(`  the flag    ${sidedWithFlag} of ${answered} (${pct(sidedWithFlag, answered)})`)
		lines.push(
			`  neither     ${undetermined} of ${answered} (${pct(undetermined, answered)}) — ` +
				"the reviewer chose a label that predicts nothing about the gradient boolean",
		)
		lines.push("")
		lines.push(verdictSentence(sidedWithOracle, sidedWithFlag, undetermined, answered))
		lines.push("")
		lines.push("HOW OFTEN THE VLM SAID THE SAME WORD AS THE REVIEWER (exact ground_type match):")
		for (const variant of variants) {
			const entry = exact[variant]
			lines.push(`  variant ${variant}: ${entry.matched} of ${entry.n} (${pct(entry.matched, entry.n)})`)
		}
		lines.push("AND POINTED THE SAME WAY ON THE GRADIENT BOOLEAN (binary agreement, unmapped labels dropped):")
		for (const variant of variants) {
			const entry = binaryOracle[variant]
			lines.push(`  variant ${variant}: ${entry.agreed} of ${entry.n} (${pct(entry.agreed, entry.n)})`)
		}
		lines.push(`  the flag:  ${flagTotals.agreed} of ${flagTotals.n} (${pct(flagTotals.agreed, flagTotals.n)})`)
		lines.push("")
		lines.push("COUNTING BOTH VARIANTS AT ONCE (an artwork can contradict under one prompt wording and agree")
		lines.push("under the other, so `both` is reachable — the reviewer agreeing with the flag and with a variant):")
		for (const key of ["oracle", "flag", "both", "neither"]) {
			lines.push(`  ${key.padEnd(10)} ${whoAgreed[key] ?? 0}`)
		}
		lines.push("")
		lines.push("WHAT THE REVIEWER ACTUALLY SAW (their own answers, counted):")
		for (const [key, count] of Object.entries(reviewerGroundType).sort((a, b) => b[1] - a[1])) {
			lines.push(`  ${key.padEnd(26)} ${count}`)
		}
		const strata = Object.keys(byStratum).sort()
		if (strata.length > 1) {
			lines.push("")
			lines.push("BY RESOLUTION TIER (a difference here would be resolution, not content):")
			for (const stratum of strata) {
				const counts = byStratum[stratum]
				lines.push(
					`  ${stratum.padEnd(18)} oracle ${counts.oracle ?? 0} · flag ${counts.flag ?? 0} · neither ${counts.neither ?? 0}`,
				)
			}
		}
	}
	if (perArtwork.length > answered) {
		lines.push("")
		lines.push(`${perArtwork.length - answered} artworks are still unanswered; every number above is over the answered ones.`)
	}

	const artworkLines = perArtwork.map((entry) => {
		const oracleText = variants
			.map((variant) => `${variant}=${entry.oracle[variant]?.groundType ?? "-"}${entry.oracle[variant]?.contradicted ? "*" : ""}`)
			.join(" ")
		return (
			`${(entry.reviewerGroundType ?? "(unanswered)").padEnd(26)} ` +
			`${(entry.reviewerBinary ?? "no-prediction").padEnd(14)} ` +
			`sided-with=${(entry.contradictionVerdict ?? "-").padEnd(8)} ` +
			`flag=${entry.flagGradient ? "gradient" : "flat    "} ` +
			`oracle[${oracleText}] ${entry.imagePath}`
		)
	})

	return {
		generatedAt: now().toISOString(),
		warehousePath: paths.warehousePath,
		fixturePath: paths.fixturePath,
		premiseRunPath: paths.premiseRunPath,
		batchId,
		question: {
			key: question.key,
			question: question.question,
			instruction: question.instruction,
			vocabulary: question.answers.map((answer) => answer.key),
		},
		total: perArtwork.length,
		answered,
		unanswered: perArtwork.length - answered,
		skipped,
		perArtwork,
		totals: {
			whoAgreed,
			contradictionVerdict,
			reviewerGroundType,
			reviewerBinary,
			exactMatchWithOracle: exact,
			binaryAgreementWithOracle: binaryOracle,
			binaryAgreementWithFlag: flagTotals,
			byStratum,
		},
		summaryLines: lines,
		artworkLines,
	}
}

function pct(part: number, whole: number): string {
	return whole === 0 ? "n/a" : `${((part / whole) * 100).toFixed(0)}%`
}

/**
 * The one sentence a reader should be able to quote.
 *
 * Deliberately hedged where the data is thin: a 30-item round decides which side of a contradiction
 * the human is on, not what the oracle's accuracy is on the corpus.
 */
function verdictSentence(oracle: number, flag: number, neither: number, answered: number): string {
	if (answered === 0) return "No verdict: nothing answered."
	const majority = Math.max(oracle, flag)
	const leader = oracle === flag ? "neither side" : oracle > flag ? "the oracle" : "the flag"
	if (oracle === flag) {
		return (
			`READING: the reviewer split evenly (${oracle} each, ${neither} undetermined). The contradictions are ` +
			"genuinely ambiguous artworks rather than a failure of one side; treat the premise as unproven either way."
		)
	}
	const share = majority / answered
	if (share >= 0.7) {
		return (
			`READING: ${leader} was right on ${pct(majority, answered)} of the contradictions. ` +
			(leader === "the oracle"
				? "The VLM was reading these artworks the way a human does, and the disagreement is with what the " +
					"algorithm published — the premise survives, and the contradictions are evidence about the published " +
					"gradient decisions, not about the oracle."
				: "The VLM was misreading these artworks; the accepted palettes were right. The premise is in doubt on " +
					"exactly the question it was asked to answer.")
		)
	}
	return (
		`READING: ${leader} was ahead but only at ${pct(majority, answered)} of ${answered} answered ` +
		`(${neither} undetermined). That is a lean, not a verdict: report it with the count, and widen the round ` +
		"before it funds a decision."
	)
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
	const fixturePath = values.fixture ?? PREMISE_DISAMBIGUATION_FIXTURE_PATH
	const premiseRunPath = values.run ?? PREMISE_RUN_PATH
	const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as OracleValidationFixture
	const analysis = analyzeOracleValidation(fixture, readAll(warehousePath), await readPremiseRun(premiseRunPath), {
		warehousePath,
		fixturePath,
		premiseRunPath,
		batchId: values.batch ?? PREMISE_DISAMBIGUATION_BATCH_ID,
	})
	const outPath = values.out ?? ORACLE_VALIDATION_ANALYSIS_PATH
	await mkdir(dirname(outPath), { recursive: true })
	await writeFile(outPath, `${JSON.stringify(analysis, null, "\t")}\n`)
	process.stdout.write(`${analysis.summaryLines.join("\n")}\n`)
	process.stdout.write("\nPER ARTWORK (* marks the variant that contradicted the flag):\n")
	for (const line of analysis.artworkLines) process.stdout.write(`  ${line}\n`)
	process.stdout.write(`\nwrote ${outPath}\n`)
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main()
}
