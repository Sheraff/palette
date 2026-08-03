/**
 * The human probe round — analysis (PREMISE_NEXT.md §12, use (b)).
 *
 * The model-free reliability test, and the only result in this campaign that needs no model at all.
 * The same reviewer answered the same 30 artworks twice, days apart, through two instruments:
 *
 *   - **direct**: one six-way `ground_type` question (`oracle-premise-disambiguation-1`);
 *   - **probes**: six yes/no/unsure probes whose aggregate derives the same tag through a table
 *     committed a priori (`oracle-probe-gold-1`, `group-a.probes.v1.1`).
 *
 * Same human, same images, same construct. So a disagreement between them is not about a model —
 * it is about which instrument is more reliable, or about how much noise the reviewer carries.
 *
 * The pre-registered frame, which this script does not get to move (§12):
 *   - **63%** is the reviewer's measured repeat consistency on a binary question
 *     (`bracketing-round-1-clarified`, `[MEASURED, PHASE_0_DECISIONS.md §3]`).
 *   - At or below it, a disagreement is inside the reviewer's own noise and says nothing.
 *   - Well above it, the two instruments are measuring the same thing and the derivation is faithful
 *     to the human's own construct.
 *   - Well beyond it *in a patterned way* — concentrated on particular tags or particular probes —
 *     is evidence about which instrument is more reliable.
 *   - **Report the confusion matrix, not a rate.** This script prints the matrix first.
 *
 * The derivation is a **lookup**, never a reimplementation: the committed 729-row table decides
 * every tag, its sha256 is checked against the pinned digest exactly as `derive_probes.py` does, and
 * no rule is evaluated anywhere in this file. "An implementation that disagrees with any of the 729
 * entries is wrong, not the table."
 *
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/src/review-server/analyze-probe-gold.ts [--warehouse <path>] [--out <path>]
 */
import { createHash } from "node:crypto"
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
	PROBE_GOLD_BATCH_ID,
	PROBE_GOLD_FIXTURE_PATH,
	PROBE_ORDER,
	type OracleValidationFixture,
} from "./oracle-validation.ts"

export const PROBE_GOLD_ANALYSIS_PATH = fileURLToPath(
	new URL("../../data/oracle-validation/probe-gold-1-analysis.json", import.meta.url),
)

const DERIVATION_PATH = fileURLToPath(
	new URL("../../oracle/premise/prompts/derivation.group-a.probes.v1.json", import.meta.url),
)

/**
 * The derivation table's pinned digest, mirrored from `oracle/premise/common.py`
 * (`DERIVATION_SHA256`). A changed table is a new schema version, not an edit — so this analysis
 * refuses to run against a table that is not the one the round was designed under.
 * [INHERITED] — `research/v3/oracle/premise/common.py`.
 */
export const DERIVATION_SHA256 = "da67d5ebf0aaab0c593f8fb8e040192e0e688f9dccfcc9bb2fe6b2af391a2fc5"
export const DERIVATION_TABLE_SIZE = 729

/** [INHERITED] — `common.py` `PROBE_ANSWER_CODES`. */
const PROBE_ANSWER_CODES: Readonly<Record<string, string>> = { yes: "y", no: "n", unsure: "u" }
/** [INHERITED] — `common.py` `INCOMPLETE_TAG` / `INCOMPLETE_DISPOSITION`. */
const INCOMPLETE_TAG = "underdetermined"
const INCOMPLETE_DISPOSITION = "incomplete"

/**
 * The reviewer's measured repeat consistency, the floor this round is read against.
 * [MEASURED] — `bracketing-round-1-clarified`, 8 silent repeats, 5 agreed; PHASE_0_DECISIONS.md §3.
 * Re-measured on 24 repeats across bracketing rounds 1+2: still 63%.
 */
export const REVIEWER_REPEAT_CONSISTENCY = 0.63

export type DerivationRow = Readonly<{
	ground_type: string
	field_texture: string
	disposition: string
	tensions: readonly string[]
}>

export type Derivation = Readonly<{
	path: string
	sha256: string
	schemaVersion: string
	probeOrder: readonly string[]
	table: Readonly<Record<string, DerivationRow>>
}>

/**
 * Load and verify the committed table. A mirror of `ProbeDerivation.__init__`, deliberately: it
 * checks the same digest, the same size and the same probe order, and it holds no rules.
 */
export async function loadDerivation(path = DERIVATION_PATH): Promise<Derivation> {
	const raw = await readFile(path)
	const sha256 = createHash("sha256").update(raw).digest("hex")
	if (sha256 !== DERIVATION_SHA256) {
		throw new Error(
			`${path} sha256 ${sha256} != pinned ${DERIVATION_SHA256}. The derivation table is a contract; ` +
				"a changed table is a new schema version, not an edit.",
		)
	}
	const doc = JSON.parse(raw.toString("utf8")) as {
		schema_version: string
		probe_order: string[]
		table: Record<string, DerivationRow>
	}
	if (Object.keys(doc.table).length !== DERIVATION_TABLE_SIZE) {
		throw new Error(`${path} has ${Object.keys(doc.table).length} rows, expected ${DERIVATION_TABLE_SIZE}`)
	}
	if (doc.probe_order.length !== 6) throw new Error(`probe_order is ${doc.probe_order.join(",")}`)
	return { path, sha256, schemaVersion: doc.schema_version, probeOrder: doc.probe_order, table: doc.table }
}

export type Derived = Readonly<{
	probeVector: string | null
	probeMissing: readonly string[]
	groundType: string
	fieldTexture: string
	disposition: string
	derivedTag: string
	tensions: readonly string[]
}>

/** Pure lookup. Mirrors `ProbeDerivation.derive` minus the shading field this round does not ask. */
export function derive(derivation: Derivation, answers: Readonly<Record<string, string>>): Derived {
	const chars: string[] = []
	const missing: string[] = []
	for (const probe of derivation.probeOrder) {
		const code = PROBE_ANSWER_CODES[answers[probe] ?? ""]
		// An answer outside {yes,no,unsure} is treated as missing rather than guessed.
		if (code === undefined) missing.push(probe)
		else chars.push(code)
	}
	if (missing.length > 0) {
		// Not a drop, not a guess: a named, countable outcome.
		return {
			probeVector: null,
			probeMissing: missing,
			groundType: INCOMPLETE_TAG,
			fieldTexture: INCOMPLETE_TAG,
			disposition: INCOMPLETE_DISPOSITION,
			derivedTag: `${INCOMPLETE_TAG}:${INCOMPLETE_DISPOSITION}`,
			tensions: [],
		}
	}
	const vector = chars.join("")
	const row = derivation.table[vector]
	if (row === undefined) throw new Error(`the table has no row for ${vector}; it is meant to be total`)
	return {
		probeVector: vector,
		probeMissing: [],
		groundType: row.ground_type,
		fieldTexture: row.field_texture,
		disposition: row.disposition,
		derivedTag: `${row.ground_type}:${row.disposition}`,
		tensions: [...row.tensions],
	}
}

/* ------------------------------------------------------------------------------------------- */
/* Reading the warehouse                                                                         */
/* ------------------------------------------------------------------------------------------- */

/**
 * The reviewer's final answer per (batch, question, image).
 *
 * Same supersession rule the server and every other analysis use: amendments applied first,
 * retracted records dropped, and when one item carries several answers the latest wins. The earlier
 * ones are undo-and-answer-again, not extra evidence.
 */
export function collectAnswers(
	records: readonly WarehouseRecord[],
	batchId: string,
): { byQuestionAndImage: Map<string, string>; skipped: Record<string, number> } {
	const skipped: Record<string, number> = { otherBatch: 0, machineAuthored: 0, retracted: 0, superseded: 0, nonString: 0 }
	const latest = new Map<string, { answer: string; index: number }>()
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
		if (typeof label.answer !== "string") {
			skipped.nonString++
			return
		}
		const key = `${label.questionKey} ${label.imageId}`
		const previous = latest.get(key)
		if (previous !== undefined) skipped.superseded++
		if (previous === undefined || previous.index < index) latest.set(key, { answer: label.answer, index })
	})
	return {
		byQuestionAndImage: new Map([...latest].map(([key, value]) => [key, value.answer])),
		skipped,
	}
}

/* ------------------------------------------------------------------------------------------- */
/* The analysis                                                                                  */
/* ------------------------------------------------------------------------------------------- */

export type ArtworkRow = Readonly<{
	imageId: string
	imagePath: string
	sha256: string
	stratum: string
	probeAnswers: Readonly<Record<string, string>>
	probeVector: string | null
	unsureCount: number
	derivedGroundType: string
	disposition: string
	tensions: readonly string[]
	directGroundType: string | null
	agrees: boolean | null
	derivedBinary: string | null
	directBinary: string | null
	binaryAgrees: boolean | null
}>

export type ProbeGoldAnalysis = Readonly<{
	generatedAt: string
	warehousePath: string
	probeBatchId: string
	directBatchId: string
	derivation: Readonly<{ path: string; sha256: string; schemaVersion: string }>
	scoping: readonly string[]
	counts: Readonly<{
		artworks: number
		probeAnswers: number
		expectedProbeAnswers: number
		comparable: number
		missingProbeAnswers: number
		missingDirectAnswers: number
	}>
	skipped: Readonly<{ probe: Record<string, number>; direct: Record<string, number> }>
	/** derived tag → direct tag → count. The headline output; a rate is a summary of this. */
	confusion: Readonly<Record<string, Readonly<Record<string, number>>>>
	agreement: Readonly<{
		exact: Readonly<{ n: number; agreed: number; rate: number | null }>
		binary: Readonly<{ n: number; agreed: number; rate: number | null; unmappable: number }>
		noiseFloor: number
	}>
	perProbe: readonly Readonly<{ probe: string; answered: number; yes: number; no: number; unsure: number; unsureRate: number | null }>[]
	dispositions: Readonly<Record<string, number>>
	tensions: Readonly<Record<string, number>>
	underdetermined: Readonly<{ count: number; byDisposition: Record<string, number> }>
	/** Where the disagreement sits: by direct tag, by derived tag, and by which probe carried it. */
	pattern: Readonly<{
		byDirectTag: Readonly<Record<string, { n: number; agreed: number; rate: number | null }>>
		byDerivedTag: Readonly<Record<string, { n: number; agreed: number; rate: number | null }>>
		byStratum: Readonly<Record<string, { n: number; agreed: number; rate: number | null }>>
	}>
	/**
	 * Did the ambiguity the reviewer reported actually surface in the instrument? The unsure answers
	 * and the tension flags are where it is supposed to appear; this is whether it did.
	 */
	ambiguitySurfaced: Readonly<{
		/** How much the unsure answer was used at all — judged before anything is read into it. */
		unsureAnswers: number
		unsureUsageRate: number | null
		artworksWithAnyUnsure: number
		artworksWithAnyTension: number
		artworksWithNeither: number
		agreeing: Readonly<{ n: number; meanUnsure: number | null; withTension: number; underdetermined: number }>
		disagreeing: Readonly<{ n: number; meanUnsure: number | null; withTension: number; underdetermined: number }>
		reading: string
	}>
	perArtwork: readonly ArtworkRow[]
	summaryLines: readonly string[]
}>

function rate(part: number, whole: number): number | null {
	return whole === 0 ? null : Number((part / whole).toFixed(4))
}

function pct(part: number, whole: number): string {
	return whole === 0 ? "n/a" : `${Math.round((part / whole) * 100)}%`
}

function binaryOf(groundType: string): string | null {
	const mapped = GRADIENT_MAP[groundType]
	return mapped === undefined || mapped === "unmapped" ? null : mapped
}

/**
 * Scoping notes stamped on every run.
 *
 * They are here rather than in a report because the conditions a measurement was taken under stop
 * travelling with it the moment they live somewhere else. The middle one cuts against the result and
 * is recorded for that reason.
 */
export const SCOPING_NOTES = [
	"CLEAN ON THE RULES: the reviewer answered all 180 probes before reading the derivation table, " +
		"so no answer was chosen to steer a tag. This is the condition use (b) needs.",
	"MILD ANCHORING CAVEAT, RECORDED: the reviewer browsed /oracle-review earlier the same day, which " +
		"displays their own direct answers for these same 30 artworks. The probe round itself shows " +
		"none of them, but the two sittings were not separated. Any agreement measured here is " +
		"therefore an upper bound on what two genuinely independent sittings would give.",
	"REVIEWER'S OWN REPORT, after answering: \"these questions are so ambiguous when looking at the " +
		"diverse artworks\", with a worry that some answers were incorrect. The unsure answers and the " +
		"tension flags are the machinery that is supposed to carry exactly that; whether it did is " +
		"measured under `ambiguitySurfaced`, not assumed.",
	"NO MODEL IS INVOLVED. Nothing here is compared against any VLM probe answers; none exist yet, and " +
		"when they do they must not be read before this analysis is committed.",
]

export function analyzeProbeGold(
	probeFixture: OracleValidationFixture,
	directFixture: OracleValidationFixture,
	derivation: Derivation,
	records: readonly WarehouseRecord[],
	paths: { warehousePath: string; probeBatchId?: string; directBatchId?: string },
	now: () => Date = () => new Date(),
): ProbeGoldAnalysis {
	const probeBatchId = paths.probeBatchId ?? PROBE_GOLD_BATCH_ID
	const directBatchId = paths.directBatchId ?? PREMISE_DISAMBIGUATION_BATCH_ID
	const probe = collectAnswers(records, probeBatchId)
	const direct = collectAnswers(records, directBatchId)

	// One row per artwork, keyed by content hash — the join the whole round was built to make exact.
	const artworks = new Map<string, { imageId: string; imagePath: string; stratum: string }>()
	for (const item of probeFixture.items) {
		artworks.set(item.sha256, { imageId: item.imageId, imagePath: item.imagePath, stratum: item.stratum })
	}
	const directImageIds = new Map(directFixture.items.map((item) => [item.sha256, item.imageId]))

	const confusion: Record<string, Record<string, number>> = {}
	const dispositions: Record<string, number> = {}
	const tensionCounts: Record<string, number> = {}
	const perProbeCounts = PROBE_ORDER.map((probeKey) => ({ probe: probeKey, answered: 0, yes: 0, no: 0, unsure: 0 }))
	let probeAnswerCount = 0
	let missingProbeAnswers = 0
	let missingDirectAnswers = 0

	const rows: ArtworkRow[] = [...artworks.entries()]
		.sort(([a], [b]) => (a < b ? -1 : 1))
		.map(([sha256, meta]) => {
			const answers: Record<string, string> = {}
			let unsureCount = 0
			for (const [index, probeKey] of PROBE_ORDER.entries()) {
				const answer = probe.byQuestionAndImage.get(`${probeKey} ${meta.imageId}`)
				if (answer === undefined) {
					missingProbeAnswers += 1
					continue
				}
				answers[probeKey] = answer
				probeAnswerCount += 1
				perProbeCounts[index].answered += 1
				if (answer === "yes") perProbeCounts[index].yes += 1
				else if (answer === "no") perProbeCounts[index].no += 1
				else if (answer === "unsure") {
					perProbeCounts[index].unsure += 1
					unsureCount += 1
				}
			}
			const derived = derive(derivation, answers)
			dispositions[derived.disposition] = (dispositions[derived.disposition] ?? 0) + 1
			for (const tension of derived.tensions) tensionCounts[tension] = (tensionCounts[tension] ?? 0) + 1

			const directImageId = directImageIds.get(sha256)
			const directAnswer =
				directImageId === undefined ? null : (direct.byQuestionAndImage.get(`ground_type ${directImageId}`) ?? null)
			if (directAnswer === null) missingDirectAnswers += 1

			if (directAnswer !== null) {
				confusion[derived.groundType] ??= {}
				confusion[derived.groundType][directAnswer] = (confusion[derived.groundType][directAnswer] ?? 0) + 1
			}
			const derivedBinary = binaryOf(derived.groundType)
			const directBinary = directAnswer === null ? null : binaryOf(directAnswer)
			return {
				imageId: meta.imageId,
				imagePath: meta.imagePath,
				sha256,
				stratum: meta.stratum,
				probeAnswers: answers,
				probeVector: derived.probeVector,
				unsureCount,
				derivedGroundType: derived.groundType,
				disposition: derived.disposition,
				tensions: derived.tensions,
				directGroundType: directAnswer,
				agrees: directAnswer === null ? null : derived.groundType === directAnswer,
				derivedBinary,
				directBinary,
				binaryAgrees:
					directAnswer === null || derivedBinary === null || directBinary === null ? null : derivedBinary === directBinary,
			}
		})

	const comparable = rows.filter((row) => row.agrees !== null)
	const agreed = comparable.filter((row) => row.agrees === true).length
	const binaryComparable = comparable.filter((row) => row.binaryAgrees !== null)
	const binaryAgreed = binaryComparable.filter((row) => row.binaryAgrees === true).length

	const group = (keyOf: (row: ArtworkRow) => string) => {
		const out: Record<string, { n: number; agreed: number; rate: number | null }> = {}
		for (const row of comparable) {
			const key = keyOf(row)
			out[key] ??= { n: 0, agreed: 0, rate: null }
			out[key].n += 1
			if (row.agrees === true) out[key].agreed += 1
		}
		for (const entry of Object.values(out)) entry.rate = rate(entry.agreed, entry.n)
		return out
	}

	const underdetermined = rows.filter((row) => row.derivedGroundType === "underdetermined")
	const byDisposition: Record<string, number> = {}
	for (const row of underdetermined) byDisposition[row.disposition] = (byDisposition[row.disposition] ?? 0) + 1

	/* --- did the ambiguity surface? ------------------------------------------------------------ */

	const summarise = (subset: ArtworkRow[]) => ({
		n: subset.length,
		meanUnsure:
			subset.length === 0 ? null : Number((subset.reduce((sum, row) => sum + row.unsureCount, 0) / subset.length).toFixed(3)),
		withTension: subset.filter((row) => row.tensions.length > 0).length,
		underdetermined: subset.filter((row) => row.derivedGroundType === "underdetermined").length,
	})
	const agreeing = summarise(comparable.filter((row) => row.agrees === true))
	const disagreeing = summarise(comparable.filter((row) => row.agrees === false))
	// How much the unsure channel was used at all. If it is near zero the surfacing verdict cannot
	// rest on it, whatever the split says — one answer is not a signal.
	const totalUnsure = perProbeCounts.reduce((sum, entry) => sum + entry.unsure, 0)
	const unsureUsage = rate(totalUnsure, probeAnswerCount)
	let reading: string
	if (disagreeing.n === 0 || agreeing.n === 0) {
		reading = "One side of the split is empty, so nothing can be said about where the ambiguity concentrated."
	} else {
		const flaggedDisagreeing =
			disagreeing.n === 0
				? 0
				: (disagreeing.withTension + disagreeing.underdetermined) / disagreeing.n
		const flaggedAgreeing = agreeing.n === 0 ? 0 : (agreeing.withTension + agreeing.underdetermined) / agreeing.n
		// The unsure channel is judged on its own before anything is read into it: it is the part of
		// the machinery aimed straight at the reviewer's complaint, and a near-zero usage rate is a
		// finding about the channel, not a small number to average over.
		const unsureVerdict =
			unsureUsage === null || unsureUsage < 0.05
				? `The UNSURE CHANNEL WENT ESSENTIALLY UNUSED: ${totalUnsure} of ${probeAnswerCount} answers ` +
					`(${pct(totalUnsure, probeAnswerCount)}). The reviewer reported the questions as ambiguous and then almost ` +
					"never said so through the answer built for it. Two readings, and this round cannot separate them: either " +
					"each probe really is answerable on its own even when the six-way question is not — which is the " +
					"decomposition's whole hypothesis — or the escape hatch is under-used and the ambiguity is being forced " +
					"into a yes or a no. Nothing below rests on the unsure counts."
				: `The unsure channel carried ${totalUnsure} of ${probeAnswerCount} answers (${pct(totalUnsure, probeAnswerCount)}).`
		const flagged =
			flaggedDisagreeing > flaggedAgreeing * 1.5
				? "YES, through the tensions and the underdetermined tags — not through unsure. " +
					`${pct(disagreeing.withTension + disagreeing.underdetermined, disagreeing.n)} of the disagreeing artworks ` +
					`fired a tension or landed underdetermined, against ` +
					`${pct(agreeing.withTension + agreeing.underdetermined, agreeing.n)} of the agreeing ones. ` +
					"So where the two instruments part company, the derivation is usually already saying that something " +
					"about the artwork does not resolve — the disagreement is visible from inside the instrument."
				: flaggedDisagreeing < flaggedAgreeing * 0.67
					? "INVERTED — the disagreements carry *fewer* flags than the agreements. The reviewer was most confident " +
						"exactly where the two instruments part company, which is the worst case: the ambiguity is real and the " +
						"instrument is not registering it."
					: "NOT CLEARLY — the flags do not separate the disagreements from the agreements " +
						`(${pct(disagreeing.withTension + disagreeing.underdetermined, disagreeing.n)} vs ` +
						`${pct(agreeing.withTension + agreeing.underdetermined, agreeing.n)} flagged). ` +
						"A disagreement looks the same as an agreement from the outside, so the reported ambiguity is not yet " +
						"queryable."
		reading = `${unsureVerdict} ${flagged}`
	}

	/* --- plain language ------------------------------------------------------------------------ */

	const tags = [...new Set([...comparable.map((row) => row.derivedGroundType), ...comparable.map((row) => row.directGroundType!)])].sort()
	const lines: string[] = []
	lines.push(`Human probe round — ${probeBatchId} vs ${directBatchId}`)
	lines.push("Same reviewer, same 30 artworks, two instruments. No model is involved.")
	lines.push("")
	lines.push(
		`${probeAnswerCount} of ${probeFixture.items.length} probe answers · ${comparable.length} artworks comparable · ` +
			`derivation ${derivation.schemaVersion} (${derivation.sha256.slice(0, 12)}…, ${DERIVATION_TABLE_SIZE} rows, lookup only)`,
	)
	lines.push("")
	lines.push("CONFUSION MATRIX — rows: tag derived from the six probes · columns: the direct six-way answer")
	const width = Math.max(...tags.map((tag) => tag.length), 22)
	lines.push(`  ${"derived \\ direct".padEnd(width)} ${tags.map((tag) => tag.slice(0, 10).padStart(11)).join("")}   total`)
	for (const derivedTag of tags) {
		const cells = tags.map((directTag) => String(confusion[derivedTag]?.[directTag] ?? 0).padStart(11))
		const total = tags.reduce((sum, directTag) => sum + (confusion[derivedTag]?.[directTag] ?? 0), 0)
		if (total === 0 && !tags.some((directTag) => (confusion[directTag]?.[derivedTag] ?? 0) > 0)) continue
		lines.push(`  ${derivedTag.padEnd(width)} ${cells.join("")}   ${String(total).padStart(5)}`)
	}
	lines.push(
		`  ${"total".padEnd(width)} ` +
			tags
				.map((directTag) => String(tags.reduce((sum, d) => sum + (confusion[d]?.[directTag] ?? 0), 0)).padStart(11))
				.join(""),
	)
	lines.push("")
	lines.push("AGREEMENT, against the reviewer's own 63% repeat-consistency floor:")
	lines.push(`  exact six-way   ${agreed} of ${comparable.length} (${pct(agreed, comparable.length)})`)
	lines.push(
		`  binary-mapped   ${binaryAgreed} of ${binaryComparable.length} (${pct(binaryAgreed, binaryComparable.length)})` +
			`  ·  ${comparable.length - binaryComparable.length} artworks map to no prediction on either side`,
	)
	const exactRate = rate(agreed, comparable.length)
	if (exactRate !== null) {
		const distance = exactRate - REVIEWER_REPEAT_CONSISTENCY
		lines.push(
			`  The floor is ${Math.round(REVIEWER_REPEAT_CONSISTENCY * 100)}%. Exact agreement sits ` +
				`${Math.abs(Math.round(distance * 100))} points ${distance >= 0 ? "above" : "below"} it. ` +
				(Math.abs(distance) <= 0.05
					? "That is on the floor: this disagreement is indistinguishable from the reviewer answering the same question twice."
					: distance > 0
						? "Read the matrix before the rate: what matters is whether the residue is scattered or concentrated."
						: "Below the floor, the two instruments disagree more than the reviewer disagrees with themselves — which is itself the finding."),
		)
	}
	lines.push("")
	lines.push("PER PROBE — how often the reviewer could not tell:")
	for (const entry of perProbeCounts) {
		lines.push(
			`  ${entry.probe.padEnd(18)} yes ${String(entry.yes).padStart(2)} · no ${String(entry.no).padStart(2)} · ` +
				`unsure ${String(entry.unsure).padStart(2)} of ${entry.answered} (${pct(entry.unsure, entry.answered)})`,
		)
	}
	lines.push("")
	lines.push("WHAT THE DERIVATION DID WITH THEM:")
	for (const [disposition, count] of Object.entries(dispositions).sort((a, b) => b[1] - a[1])) {
		lines.push(`  ${disposition.padEnd(26)} ${count}`)
	}
	lines.push(`  underdetermined tags        ${underdetermined.length} of ${rows.length}`)
	if (Object.keys(tensionCounts).length === 0) {
		lines.push("  tension flags fired         none")
	} else {
		lines.push("  tension flags fired:")
		for (const [tension, count] of Object.entries(tensionCounts).sort((a, b) => b[1] - a[1])) {
			lines.push(`    ${tension.padEnd(24)} ${count}`)
		}
	}
	lines.push("")
	lines.push("WHERE THE DISAGREEMENT SITS (the pattern, which is the part that carries information):")
	const byDirect = group((row) => row.directGroundType!)
	for (const [tag, entry] of Object.entries(byDirect).sort((a, b) => b[1].n - a[1].n)) {
		lines.push(`  direct said ${tag.padEnd(26)} ${entry.agreed}/${entry.n} agreed (${pct(entry.agreed, entry.n)})`)
	}
	lines.push("")
	lines.push("DID THE REPORTED AMBIGUITY SURFACE IN THE INSTRUMENT?")
	lines.push(
		`  agreeing artworks    n=${agreeing.n} · ${agreeing.meanUnsure} unsure/artwork · ` +
			`${agreeing.withTension} with a tension · ${agreeing.underdetermined} underdetermined`,
	)
	lines.push(
		`  disagreeing artworks n=${disagreeing.n} · ${disagreeing.meanUnsure} unsure/artwork · ` +
			`${disagreeing.withTension} with a tension · ${disagreeing.underdetermined} underdetermined`,
	)
	lines.push(`  ${reading}`)
	lines.push("")
	lines.push("SCOPING:")
	for (const note of SCOPING_NOTES) lines.push(`  - ${note}`)

	return {
		generatedAt: now().toISOString(),
		warehousePath: paths.warehousePath,
		probeBatchId,
		directBatchId,
		derivation: { path: derivation.path, sha256: derivation.sha256, schemaVersion: derivation.schemaVersion },
		scoping: SCOPING_NOTES,
		counts: {
			artworks: rows.length,
			probeAnswers: probeAnswerCount,
			expectedProbeAnswers: probeFixture.items.length,
			comparable: comparable.length,
			missingProbeAnswers,
			missingDirectAnswers,
		},
		skipped: { probe: probe.skipped, direct: direct.skipped },
		confusion,
		agreement: {
			exact: { n: comparable.length, agreed, rate: rate(agreed, comparable.length) },
			binary: {
				n: binaryComparable.length,
				agreed: binaryAgreed,
				rate: rate(binaryAgreed, binaryComparable.length),
				unmappable: comparable.length - binaryComparable.length,
			},
			noiseFloor: REVIEWER_REPEAT_CONSISTENCY,
		},
		perProbe: perProbeCounts.map((entry) => ({ ...entry, unsureRate: rate(entry.unsure, entry.answered) })),
		dispositions,
		tensions: tensionCounts,
		underdetermined: { count: underdetermined.length, byDisposition },
		pattern: {
			byDirectTag: byDirect,
			byDerivedTag: group((row) => row.derivedGroundType),
			byStratum: group((row) => row.stratum),
		},
		ambiguitySurfaced: {
			unsureAnswers: totalUnsure,
			unsureUsageRate: unsureUsage,
			artworksWithAnyUnsure: rows.filter((row) => row.unsureCount > 0).length,
			artworksWithAnyTension: rows.filter((row) => row.tensions.length > 0).length,
			artworksWithNeither: rows.filter((row) => row.unsureCount === 0 && row.tensions.length === 0).length,
			agreeing,
			disagreeing,
			reading,
		},
		perArtwork: rows,
		summaryLines: lines,
	}
}

async function loadFixture(path: string): Promise<OracleValidationFixture> {
	return JSON.parse(await readFile(path, "utf8")) as OracleValidationFixture
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: { warehouse: { type: "string" }, out: { type: "string" } },
		strict: true,
	})
	const warehousePath = values.warehouse ?? DEFAULT_WAREHOUSE_PATH
	const analysis = analyzeProbeGold(
		await loadFixture(PROBE_GOLD_FIXTURE_PATH),
		await loadFixture(PREMISE_DISAMBIGUATION_FIXTURE_PATH),
		await loadDerivation(),
		readAll(warehousePath),
		{ warehousePath },
	)
	const outPath = values.out ?? PROBE_GOLD_ANALYSIS_PATH
	await mkdir(dirname(outPath), { recursive: true })
	await writeFile(outPath, `${JSON.stringify(analysis, null, "\t")}\n`)
	process.stdout.write(`${analysis.summaryLines.join("\n")}\n`)
	process.stdout.write("\nPER ARTWORK:\n")
	for (const row of analysis.perArtwork) {
		process.stdout.write(
			`  ${(row.probeVector ?? "??????").padEnd(7)} ${row.derivedGroundType.padEnd(26)} ` +
				`direct=${(row.directGroundType ?? "-").padEnd(26)} ${row.agrees === true ? "  " : "≠ "}` +
				`unsure=${row.unsureCount} ${row.tensions.length > 0 ? `tension=${row.tensions.join(",")} ` : ""}${row.imagePath}\n`,
		)
	}
	process.stdout.write(`\nwrote ${outPath}\n`)
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main()
}
