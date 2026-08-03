/**
 * The v3 review server (Phase 0 skeleton).
 *
 * A standing local server that owns the review queue (REVIEW_UI.md §1): the orchestrator pushes
 * batches to it, the reviewer works through them whenever convenient, every item stays freely
 * editable until an explicit release. Node's built-in `http`, no frameworks.
 *
 * Every reviewer judgement is persisted by the warehouse library
 * (`research/v3/src/warehouse/`) — this server builds records and calls `append()`; it never
 * writes warehouse lines itself. The only file it owns is the batch log, which is server-side
 * state (it holds the variant ids the blinding hides) and not a warehouse record type.
 *
 * Start it:
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types research/v3/src/review-server/server.ts
 *
 * See README.md in this directory for the endpoint list and what is stubbed.
 */
import { readFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { DEFAULT_WAREHOUSE_PATH } from "../warehouse/cli.ts"
import {
	AMENDABLE_FIELDS,
	GRADES,
	hashPalette,
	PREFERENCES,
	type AmendmentRecord,
	type ArtworkIdentity,
	type Author,
	type BatchCompleteRecord,
	type BatchRef,
	type EndorsedSampleRecord,
	type Grade,
	type NoteRecord,
	type OracleLabelRecord,
	type PaletteSnapshot,
	type Preference,
	type RecordInput,
	type VerdictRecord,
	type VerdictSide,
	type VetoRecord,
	type VetoScope,
} from "../warehouse/records.ts"
import { append, readAll, resolve as resolveAmendments } from "../warehouse/warehouse.ts"
import {
	BadRequest,
	blindSidePayload,
	materialize,
	materializeCalibration,
	parseBatch,
	parseCalibrationBatch,
	parsePalette,
	readArtworkIdentity,
} from "./batch.ts"
import { foreignColors, pixelAt, readImageColors } from "./composer.ts"
import { nameHexes } from "./color.ts"
import { newAnswerToken, newBlindingSalt, sha256 } from "./blinding.ts"
import {
	BRACKETING_ACTIVE_BATCH_ID,
	BRACKETING_FIXTURE_PATH,
	BRACKETING_FIXTURE_VERSION,
	BRACKETING_ROUND_2_BATCH_ID,
	BRACKETING_ROUND_2_FIXTURE_PATH,
	type BracketingFixture,
} from "./bracketing.ts"

export { BRACKETING_ACTIVE_BATCH_ID, BRACKETING_ROUND_2_BATCH_ID }
import { analyzeOracleValidation, type OracleValidationAnalysis } from "./analyze-oracle-validation.ts"
import {
	PREMISE_DISAMBIGUATION_BATCH_ID,
	PREMISE_DISAMBIGUATION_FIXTURE_PATH,
	PREMISE_DISAMBIGUATION_FIXTURE_VERSION,
	PREMISE_RUN_PATH,
	PROBE_GOLD_BATCH_ID,
	PROBE_GOLD_FIXTURE_PATH,
	itemImagePath,
	readPremiseRun,
	validateFixture,
	type OracleValidationFixture,
} from "./oracle-validation.ts"

/**
 * The tag every adjudication note carries, and the two verdicts it can hold.
 *
 * Exact opposites by design (REVIEW_UI.md §4's symmetric-vocabulary rule): the question the round
 * left open is whether the disagreements are a blurry ontology or a misreading VLM, and a vocabulary
 * that could only express one of those would answer it by construction.
 */
export const ADJUDICATION_TAG = "adjudication-browse"
export const ADJUDICATION_VERDICTS = ["oracle-defensible", "oracle-misread"] as const
export type AdjudicationVerdict = (typeof ADJUDICATION_VERDICTS)[number]

/** The note's own words. Written out, because a tag alone is not evidence a human can read back. */
const ADJUDICATION_TEXT: Record<AdjudicationVerdict, (questionKey: string) => string> = {
	"oracle-defensible": (questionKey) =>
		`Browsing after release: the oracle's ${questionKey} answer is also defensible for this artwork — ` +
		"the two readings are both reasonable, so this disagreement is about where the line between the labels sits.",
	"oracle-misread": (questionKey) =>
		`Browsing after release: the oracle misread this artwork's ${questionKey} — ` +
		"this is not a blurry line, the answer is wrong.",
}

/**
 * What `d` and `m` are actually a judgement about.
 *
 * The reviewer's own report after the first browse: *"there are multiple oracle answers per
 * artwork"*, so the two keys felt ill-defined — with two variants on screen, "the oracle's answer"
 * is not one thing. The rule below names the referent and covers the case where both variants are
 * marked with different answers. On the page it appears twice, at the top and under every item,
 * because a rule read once at the top of a 30-item scroll is a rule the reviewer is guessing at by
 * item 12.
 * [REVIEWED] — reviewer's wording, 2026-08-03.
 */
export const ADJUDICATION_RULE =
	"Judge the answer marked '← contradicted the flag' — d means that marked reading is a defensible " +
	"view of this artwork, m means it misread the image. If both variants are marked with different " +
	"answers, d if EITHER marked reading is defensible."

/** The three groups the adjudication page is divided into, in reading order. */
export const ADJUDICATION_SECTIONS = [
	{
		key: "oracle",
		title: "the reviewer sided with the oracle",
		blurb: "The reviewer's own reading matched the oracle's, against the gradient decision the algorithm published.",
	},
	{
		key: "flag",
		title: "the reviewer sided with the published flag",
		blurb: "The reviewer's reading matched what the algorithm published, against the oracle.",
	},
	{
		key: "neither",
		title: "neither",
		blurb: "The reviewer chose a label that makes no prediction about the gradient boolean, so the tie stands open.",
	},
] as const

export { PREMISE_DISAMBIGUATION_BATCH_ID }
import { JsonlAppender, readJsonl } from "./store.ts"
import {
	isBracketingBatch,
	isCalibrationBatch,
	isOracleBatch,
	SIDES,
	type AbsoluteVerdictInput,
	type PushedBatch,
	type Side,
	type StoredAnyBatch,
	type StoredBatch,
	type StoredBracketingBatch,
	type StoredCalibrationBatch,
	type StoredCalibrationItem,
	type StoredItem,
	type StoredOracleBatch,
	type VerdictInput,
} from "./types.ts"

/** Largest accepted request body. A pushed batch is small; this is a sanity bound, not a policy. */
const MAX_REQUEST_BYTES = 4 * 1024 * 1024

/** Largest accepted free-text comment. Generous: free text is the primary channel. */
const MAX_COMMENT_LENGTH = 20_000

export const DEFAULT_PORT = 3010

/** Who the records are attributed to when the server is started without `--reviewer`. */
export const DEFAULT_REVIEWER_ID = "flo"

const here = new URL("./", import.meta.url)
export const DEFAULT_UI_ROOT = fileURLToPath(new URL("../../review-ui/", here))
export const DEFAULT_BATCH_LOG_PATH = fileURLToPath(new URL("../../data/review-server/batches.jsonl", here))
export const DEMO_BATCH_PATH = fileURLToPath(new URL("./fixtures/demo-batch.json", here))
export const DEMO_CALIBRATION_PATH = fileURLToPath(new URL("./fixtures/demo-calibration.json", here))
/** research/v3/src/review-server/ → repository root. */
export const REPO_ROOT = fileURLToPath(new URL("../../../../", here))

export { DEFAULT_WAREHOUSE_PATH }

class Conflict extends Error {}
class NotFound extends Error {}

function itemKey(batchId: string, itemId: string): string {
	return `${batchId} ${itemId}`
}

/**
 * The answer key for an oracle-validation item.
 *
 * Not `itemKey(batchId, imageId)`, which is what a bracketing answer uses: there the pair id *is* the
 * item id, here `imageId` is the artwork's real id and one artwork can be asked several questions in
 * the same batch — that is the whole point of by-question passes. The key has to be derivable from
 * a warehouse record alone (for the replay on start) and from a fixture item alone (for serving), so
 * it is built from the two fields both of them carry.
 */
function oracleAnswerKey(batchId: string, questionKey: string, imageId: string): string {
	return `${batchId} ${questionKey} ${imageId}`
}

type VerdictState = {
	record: VerdictRecord
	recordId: string
	revision: number
	/** Amendments applied to this verdict after release, newest last. Empty before the first one. */
	amendments: AmendmentRecord[]
	/** True when an amendment withdrew it: the item carries no standing judgement any more. */
	retracted: boolean
}
type VetoState = { record: VetoRecord; recordId: string; active: boolean }
type AnswerState = { record: OracleLabelRecord; recordId: string; revision: number }
/**
 * One endorsed sample, as submitted.
 *
 * A list per item rather than one entry: an endorsement is immutable evidence of what the reviewer
 * assembled and previewed, so an edited composition is a NEW record (the warehouse refuses an
 * amendment that carries palette changes). The earlier ones are not drafts to be discarded — "the
 * reviewer moved from this palette to that one" is itself evidence — so they stay on screen, and a
 * mistaken one is withdrawn with a retracting amendment.
 */
type EndorsementState = {
	record: EndorsedSampleRecord
	recordId: string
	retracted: boolean
}

export type ReviewServiceOptions = Readonly<{
	warehousePath?: string
	batchLogPath?: string
	reviewerId?: string
	/** Directories a pushed `imagePath` may live under. Defaults to the repository root. */
	imageRoots?: readonly string[]
}>

/**
 * All review state. Rebuilt on start by replaying the batch log and the warehouse, so a restart
 * is invisible to the reviewer and the server can be killed at any time.
 */
export class ReviewService {
	readonly warehousePath: string
	readonly batchLog: JsonlAppender
	readonly author: Author
	readonly imageRoots: readonly string[]
	readonly #batches = new Map<string, StoredBatch>()
	readonly #bracketing = new Map<string, StoredBracketingBatch>()
	readonly #oracle = new Map<string, StoredOracleBatch>()
	readonly #calibration = new Map<string, StoredCalibrationBatch>()
	readonly #verdicts = new Map<string, VerdictState>()
	readonly #vetoes = new Map<string, VetoState>()
	readonly #answers = new Map<string, AnswerState>()
	readonly #endorsements = new Map<string, EndorsementState[]>()
	readonly #releases = new Map<string, BatchCompleteRecord>()
	readonly #releaseIds = new Map<string, string>()
	/** Post-release joins for the adjudication view. Frozen data, so computed once per batch. */
	readonly #adjudicationCache = new Map<string, OracleValidationAnalysis>()
	#premiseRun: Awaited<ReturnType<typeof readPremiseRun>> | null = null

	constructor(options: ReviewServiceOptions = {}) {
		this.warehousePath = options.warehousePath ?? DEFAULT_WAREHOUSE_PATH
		this.batchLog = new JsonlAppender(options.batchLogPath ?? DEFAULT_BATCH_LOG_PATH)
		this.author = { kind: "human", id: options.reviewerId ?? DEFAULT_REVIEWER_ID }
		this.imageRoots = options.imageRoots ?? [REPO_ROOT]
	}

	async load(): Promise<void> {
		for (const stored of await readJsonl<StoredAnyBatch>(this.batchLog.path)) {
			if (isBracketingBatch(stored)) this.#bracketing.set(stored.batchId, stored)
			else if (isOracleBatch(stored)) this.#oracle.set(stored.batchId, stored)
			else if (isCalibrationBatch(stored)) this.#calibration.set(stored.batch.batchId, stored)
			else this.#batches.set(stored.batch.batchId, stored)
		}
		this.#replayWarehouse()
	}

	/**
	 * Rebuild every judgement from the warehouse.
	 *
	 * Run on start, and again after each amendment. Re-reading the whole log for one amendment is
	 * deliberate: amendment semantics are subtle (a retraction leaves the *previous* record standing,
	 * a patch applies over its whole chain), and the only way to be sure the running server agrees
	 * with what a query would see is to derive both from the same code. Amendments are rare and the
	 * log is small; a divergence between live state and replay would not be.
	 */
	#replayWarehouse(): void {
		this.#verdicts.clear()
		this.#vetoes.clear()
		this.#answers.clear()
		this.#endorsements.clear()
		this.#releases.clear()
		this.#releaseIds.clear()
		// Amendments are applied first: a retracted veto must come back as "not vetoed", and an
		// amended verdict must show its amended grades.
		for (const entry of resolveAmendments(readAll(this.warehousePath))) {
			const record = entry.record
			if (record.type === "verdict") {
				const key = itemKey(record.batch.id, record.itemId)
				const previous = this.#verdicts.get(key)
				const revision = (previous?.revision ?? 0) + 1
				// A retracted verdict still counts as a revision that happened, but is not the position:
				// withdrawing a re-save leaves the previous save standing, which is exactly what the
				// warehouse's `supersededVerdictIds` does. When there is no previous one, the retracted
				// record is kept as the state so the page can say "you withdrew this" — `#standing`
				// filters it out of everything that counts.
				if (entry.retracted) {
					this.#verdicts.set(
						key,
						previous === undefined
							? { record, recordId: entry.original.id, revision, amendments: entry.amendments, retracted: true }
							: { ...previous, revision },
					)
				} else {
					this.#verdicts.set(key, {
						record,
						recordId: entry.original.id,
						revision,
						amendments: entry.amendments,
						retracted: false,
					})
				}
			} else if (record.type === "endorsed-sample" && record.batch !== null && record.itemId !== null) {
				const key = itemKey(record.batch.id, record.itemId)
				const list = this.#endorsements.get(key) ?? []
				list.push({ record, recordId: entry.original.id, retracted: entry.retracted })
				this.#endorsements.set(key, list)
			} else if (record.type === "veto" && record.batch !== null && record.itemId !== null) {
				this.#vetoes.set(itemKey(record.batch.id, record.itemId), {
					record,
					recordId: entry.original.id,
					active: !entry.retracted,
				})
			} else if (record.type === "oracle-label" && record.batch !== null) {
				const key = this.#oracle.has(record.batch.id)
					? oracleAnswerKey(record.batch.id, record.questionKey, record.imageId)
					: itemKey(record.batch.id, record.imageId)
				const previous = this.#answers.get(key)
				const revision = (previous?.revision ?? 0) + 1
				if (entry.retracted) {
					if (previous !== undefined) this.#answers.set(key, { ...previous, revision })
				} else {
					this.#answers.set(key, { record, recordId: entry.original.id, revision })
				}
			} else if (record.type === "batch-complete") {
				this.#releases.set(record.batchId, record)
				this.#releaseIds.set(record.batchId, entry.original.id)
			}
		}
	}

	async close(): Promise<void> {
		await this.batchLog.close()
	}

	has(batchId: string): boolean {
		return (
			this.#batches.has(batchId) ||
			this.#bracketing.has(batchId) ||
			this.#oracle.has(batchId) ||
			this.#calibration.has(batchId)
		)
	}

	#batch(batchId: string): StoredBatch {
		const stored = this.#batches.get(batchId)
		if (stored === undefined) throw new NotFound(`Unknown batch ${batchId}`)
		return stored
	}

	#item(batchId: string, itemId: string): { stored: StoredBatch; index: number; item: StoredItem } {
		const stored = this.#batch(batchId)
		const index = stored.items.findIndex((entry) => entry.itemId === itemId)
		if (index < 0) throw new NotFound(`Unknown item ${itemId} in batch ${batchId}`)
		return { stored, index, item: stored.items[index] }
	}

	#calibrationBatch(batchId: string): StoredCalibrationBatch {
		const stored = this.#calibration.get(batchId)
		if (stored === undefined) throw new NotFound(`Unknown calibration batch ${batchId}`)
		return stored
	}

	#calibrationItem(
		batchId: string,
		itemId: string,
	): { stored: StoredCalibrationBatch; index: number; item: StoredCalibrationItem } {
		const stored = this.#calibrationBatch(batchId)
		const index = stored.items.findIndex((entry) => entry.itemId === itemId)
		if (index < 0) throw new NotFound(`Unknown item ${itemId} in batch ${batchId}`)
		return { stored, index, item: stored.items[index] }
	}

	/**
	 * One item of whichever palette-judging mode owns it.
	 *
	 * Pairwise and calibration items differ in how many palettes they show and in nothing else that
	 * matters to a veto, a composed palette, an eyedropper sample or an amendment. Those five routes
	 * are therefore shared, and this is what makes them so — rather than five pairs of near-identical
	 * handlers that will drift.
	 */
	#judgeable(
		batchId: string,
		itemId: string,
	): {
		kind: "pairwise" | "calibration"
		artwork: ArtworkIdentity
		batchRef: BatchRef
		/** Palette hashes of everything the reviewer was shown, keyed by the name they know it under. */
		shown: Record<string, string>
	} {
		if (this.#calibration.has(batchId)) {
			const { stored, item } = this.#calibrationItem(batchId, itemId)
			return {
				kind: "calibration",
				artwork: item.artwork,
				batchRef: this.#calibrationBatchRef(stored),
				shown: { palette: item.paletteHash },
			}
		}
		const { stored, item } = this.#item(batchId, itemId)
		return {
			kind: "pairwise",
			artwork: item.artwork,
			batchRef: this.#batchRef(stored),
			shown: Object.fromEntries(SIDES.map((side) => [side, item.paletteHashes[item.blinding[side]]])),
		}
	}

	released(batchId: string): BatchCompleteRecord | null {
		return this.#releases.get(batchId) ?? null
	}

	/** The batch metadata every record in the batch carries, denormalized (REVIEW_UI.md §7). */
	#batchRef(stored: StoredBatch): BatchRef {
		return {
			id: stored.batch.batchId,
			purpose: stored.batch.purpose,
			itemCount: stored.items.length,
			fundedBy: [...stored.batch.fundedBy],
		}
	}

	#calibrationBatchRef(stored: StoredCalibrationBatch): BatchRef {
		return {
			id: stored.batch.batchId,
			purpose: stored.batch.purpose,
			itemCount: stored.items.length,
			fundedBy: [...stored.batch.fundedBy],
		}
	}

	/**
	 * Materialize and persist a pushed batch.
	 *
	 * The blinding is decided here, once, under a fresh random salt that goes to the batch log and
	 * nowhere else. Re-pushing the same content under a new batch id therefore blinds differently —
	 * that is the point: the shuffle must not be a function of anything the browser can see.
	 */
	async pushBatch(value: unknown): Promise<{ batchId: string; itemCount: number }> {
		const batch: PushedBatch = parseBatch(value)
		if (this.#batches.has(batch.batchId)) throw new Conflict(`Batch ${batch.batchId} already exists`)
		const stored = await materialize(batch, new Date().toISOString(), newBlindingSalt(), this.imageRoots)
		await this.batchLog.append(stored)
		this.#batches.set(batch.batchId, stored)
		return { batchId: batch.batchId, itemCount: stored.items.length }
	}

	/**
	 * Materialize and persist a pushed calibration round (REVIEW_UI.md §5).
	 *
	 * Same push path as a pairwise batch, minus the blinding: with one palette per item there are no
	 * sides to shuffle. The variant id and the fingerprint still go to the batch log and never to the
	 * browser, for the reason `types.ts` gives — grading a palette should not be grading a label.
	 */
	async pushCalibration(value: unknown): Promise<{ batchId: string; itemCount: number }> {
		const batch = parseCalibrationBatch(value)
		if (this.has(batch.batchId)) throw new Conflict(`Batch ${batch.batchId} already exists`)
		const stored = await materializeCalibration(batch, new Date().toISOString(), this.imageRoots)
		await this.batchLog.append(stored)
		this.#calibration.set(batch.batchId, stored)
		return { batchId: batch.batchId, itemCount: stored.items.length }
	}

	queue() {
		const calibration = [...this.#calibration.values()].map((stored) => {
			const batchId = stored.batch.batchId
			const release = this.#releases.get(batchId)
			let judged = 0
			for (const item of stored.items) {
				const key = itemKey(batchId, item.itemId)
				if (this.#standing(key) !== null || this.#vetoes.get(key)?.active === true) judged += 1
			}
			return {
				batchId,
				kind: "calibration" as const,
				purpose: stored.batch.purpose,
				pushedAt: stored.pushedAt,
				itemCount: stored.items.length,
				judgedCount: judged,
				released: release !== undefined,
				releasedAt: release?.ts ?? null,
			}
		})
		const bracketing = [...this.#bracketing.values()].map((stored) => {
			const release = this.#releases.get(stored.batchId)
			const judged = stored.fixture.items.filter((item) => this.#answers.has(itemKey(stored.batchId, item.itemId))).length
			return {
				batchId: stored.batchId,
				kind: "bracketing" as const,
				purpose: stored.purpose,
				pushedAt: stored.pushedAt,
				itemCount: stored.fixture.items.length,
				judgedCount: judged,
				released: release !== undefined,
				releasedAt: release?.ts ?? null,
			}
		})
		const oracle = [...this.#oracle.values()].map((stored) => {
			const release = this.#releases.get(stored.batchId)
			const judged = stored.fixture.items.filter((item) => this.#answers.has(this.#oracleKey(stored, item))).length
			return {
				batchId: stored.batchId,
				kind: "oracle-validation" as const,
				purpose: stored.purpose,
				pushedAt: stored.pushedAt,
				itemCount: stored.fixture.items.length,
				judgedCount: judged,
				released: release !== undefined,
				releasedAt: release?.ts ?? null,
			}
		})
		const pairwise = [...this.#batches.values()].map((stored) => {
			const release = this.#releases.get(stored.batch.batchId)
			let judged = 0
			for (const item of stored.items) {
				const key = itemKey(stored.batch.batchId, item.itemId)
				if (this.#standing(key) !== null || this.#vetoes.get(key)?.active === true) judged += 1
			}
			return {
				batchId: stored.batch.batchId,
				kind: "pairwise" as const,
				purpose: stored.batch.purpose,
				pushedAt: stored.pushedAt,
				itemCount: stored.items.length,
				judgedCount: judged,
				released: release !== undefined,
				releasedAt: release?.ts ?? null,
			}
		})
		return [...pairwise, ...calibration, ...bracketing, ...oracle]
	}

	/**
	 * The reviewer's standing verdict on an item, or null when they have none.
	 *
	 * Null covers two different histories that behave identically from here on: never judged, and
	 * judged then retracted by a post-release amendment. In both cases nothing may cite the item.
	 */
	#standing(key: string): VerdictState | null {
		const state = this.#verdicts.get(key)
		return state === undefined || state.retracted ? null : state
	}

	/**
	 * Released batches take no more direct writes.
	 *
	 * Before release everything is freely editable with zero ceremony; after it, a second thought is
	 * an `amendment` record pointing at the original, which is what lets the orchestrator trigger on
	 * release without racing the reviewer (REVIEW_UI.md §1). So this is not "no more edits" — it is
	 * "edits change shape", and the message says where they go.
	 */
	#refuseWhenReleased(batchId: string, what: string): void {
		if (!this.#releases.has(batchId)) return
		throw new Conflict(
			`Batch ${batchId} is released; a ${what} after release is an amendment — ` +
				`POST /api/batches/${batchId}/items/<itemId>/amend`,
		)
	}

	/**
	 * What the browser is told about a verdict. Never a variant id, never a fingerprint.
	 *
	 * An absolute verdict is served with one `grade` and nothing about a comparison that did not
	 * happen — a calibration page reading `gradeA` and ignoring `gradeB` would be a page one edit away
	 * from recording half a pairwise judgement.
	 */
	#verdictPayload(key: string) {
		const state = this.#verdicts.get(key)
		if (state === undefined) return null
		const common = {
			comment: state.record.comment,
			revision: state.revision,
			recordedAt: state.record.ts,
			/** Post-release second thoughts, so the page can show that this is no longer the first answer. */
			amendmentCount: state.amendments.length,
			amendedAt: state.amendments.at(-1)?.ts ?? null,
			retracted: state.retracted,
		}
		if (state.record.mode === "absolute") return { mode: "absolute" as const, grade: state.record.gradeA, ...common }
		return {
			mode: "pairwise" as const,
			gradeA: state.record.gradeA,
			gradeB: state.record.gradeB,
			preference: state.record.preference,
			confound: state.record.confound,
			confoundNote: state.record.confoundNote ?? "",
			...common,
		}
	}

	/**
	 * Endorsed samples for one item, oldest first — every one of them, retracted ones included.
	 *
	 * `basedOnPaletteHash` is deliberately not here. It is the content hash of a *shown* side, and the
	 * payload-hygiene rule is that no shown side's hash is ever served: the browser has no use for it
	 * (it knows which side it started from), and it is exactly the kind of derived identifier a future
	 * blinding attack would be built on.
	 */
	#endorsementPayload(key: string) {
		return (this.#endorsements.get(key) ?? []).map((entry) => ({
			recordId: entry.recordId,
			// The palette the browser itself assembled and its hash: nothing it did not already have.
			palette: entry.record.palette,
			paletteHash: entry.record.paletteHash,
			comment: entry.record.comment,
			recordedAt: entry.record.ts,
			retracted: entry.retracted,
		}))
	}

	/** The blinded payload. Never contains a variant id, a fingerprint, or the blinding key. */
	batchPayload(batchId: string) {
		const stored = this.#batch(batchId)
		const release = this.#releases.get(batchId)
		return {
			batchId: stored.batch.batchId,
			purpose: stored.batch.purpose,
			pushedAt: stored.pushedAt,
			released: release !== undefined,
			releasedAt: release?.ts ?? null,
			releaseNote: release?.note ?? "",
			grades: GRADES,
			preferences: PREFERENCES,
			items: stored.items.map((item, index) => {
				const pushed = stored.batch.items[index]
				const key = itemKey(batchId, item.itemId)
				const veto = this.#vetoes.get(key)
				return {
					itemId: item.itemId,
					artwork: {
						media: `/media/${encodeURIComponent(batchId)}/${encodeURIComponent(item.itemId)}`,
						fileName: item.artwork.path.split("/").at(-1) ?? item.artwork.path,
						sha256: item.artwork.sha256,
						width: item.artwork.rendition.width,
						height: item.artwork.rendition.height,
						format: item.artwork.rendition.format,
						bytes: item.artwork.rendition.bytes,
						collection: item.artwork.rendition.collection,
					},
					sides: Object.fromEntries(
						SIDES.map((side) => [
							side,
							blindSidePayload(pushed.sides[item.blinding[side]].palette, item.colorNames),
						]),
					),
					/** True when both sides render identically: not a real comparison. */
					identical: item.paletteHashes[0] === item.paletteHashes[1],
					verdict: this.#verdictPayload(key),
					endorsements: this.#endorsementPayload(key),
					veto:
						veto === undefined
							? null
							: { active: veto.active, reason: veto.record.reason, scope: veto.record.scope, recordedAt: veto.record.ts },
				}
			}),
		}
	}

	/**
	 * The calibration payload: one palette per item, one grade to give (REVIEW_UI.md §5).
	 *
	 * Same hygiene as the pairwise payload — no variant id, no fingerprint, no palette hash — and the
	 * same rendered field, because the mock is the judging surface in both modes and a grade given
	 * against a different rendering is a grade about a different thing.
	 */
	calibrationPayload(batchId: string) {
		const stored = this.#calibrationBatch(batchId)
		const release = this.#releases.get(batchId)
		return {
			batchId,
			purpose: stored.batch.purpose,
			pushedAt: stored.pushedAt,
			released: release !== undefined,
			releasedAt: release?.ts ?? null,
			releaseNote: release?.note ?? "",
			mode: "absolute" as const,
			grades: GRADES,
			items: stored.items.map((item, index) => {
				const pushed = stored.batch.items[index]
				const key = itemKey(batchId, item.itemId)
				const veto = this.#vetoes.get(key)
				return {
					itemId: item.itemId,
					artwork: {
						media: `/media/${encodeURIComponent(batchId)}/${encodeURIComponent(item.itemId)}`,
						fileName: item.artwork.path.split("/").at(-1) ?? item.artwork.path,
						sha256: item.artwork.sha256,
						width: item.artwork.rendition.width,
						height: item.artwork.rendition.height,
						format: item.artwork.rendition.format,
						bytes: item.artwork.rendition.bytes,
						collection: item.artwork.rendition.collection,
					},
					side: blindSidePayload(pushed.palette, item.colorNames),
					verdict: this.#verdictPayload(key),
					endorsements: this.#endorsementPayload(key),
					veto:
						veto === undefined
							? null
							: { active: veto.active, reason: veto.record.reason, scope: veto.record.scope, recordedAt: veto.record.ts },
				}
			}),
		}
	}

	#side(stored: StoredBatch, item: StoredItem, index: number, side: Side): VerdictSide {
		const source = stored.batch.items[index].sides[item.blinding[side]]
		return {
			paletteHash: item.paletteHashes[item.blinding[side]],
			fingerprint: source.fingerprint,
			variantId: source.variantId,
			// The palette travels with the verdict, so one grepped line is a complete statement of
			// what was judged even if the batch log is gone.
			palette: source.palette,
		}
	}

	/**
	 * Write (or rewrite) one item's verdict.
	 *
	 * Every save appends a new verdict record — the log is append-only, and one item may carry
	 * several verdicts before release. The last one is the reviewer's position; the warehouse's
	 * `supersededVerdictIds` is what stops the earlier drafts being counted twice.
	 */
	async putVerdict(batchId: string, itemId: string, input: VerdictInput): Promise<VerdictState> {
		const { stored, index, item } = this.#item(batchId, itemId)
		this.#refuseWhenReleased(batchId, `verdict on ${itemId}`)
		const key = itemKey(batchId, itemId)
		const previous = this.#verdicts.get(key)
		const record = append<VerdictRecord>(this.warehousePath, {
			type: "verdict",
			author: this.author,
			mode: "pairwise",
			batch: this.#batchRef(stored),
			itemId,
			artwork: item.artwork,
			sideA: this.#side(stored, item, index, "A"),
			sideB: this.#side(stored, item, index, "B"),
			gradeA: input.gradeA,
			gradeB: input.gradeB,
			preference: input.preference,
			comment: input.comment,
			confound: input.confound,
			confoundNote: input.confound ? input.confoundNote : null,
		} satisfies RecordInput<VerdictRecord>)
		const state: VerdictState = {
			record,
			recordId: record.id,
			revision: (previous?.revision ?? 0) + 1,
			amendments: [],
			retracted: false,
		}
		this.#verdicts.set(key, state)
		return state
	}

	/**
	 * Write (or rewrite) one calibration item's absolute verdict (REVIEW_UI.md §5).
	 *
	 * `mode: "absolute"`, and side B, grade B and preference are null — the warehouse refuses an
	 * absolute verdict that carries any of them, which is what keeps a calibration grade from ever
	 * being counted as half of a comparison.
	 */
	async putAbsoluteVerdict(batchId: string, itemId: string, input: AbsoluteVerdictInput): Promise<VerdictState> {
		const { stored, index, item } = this.#calibrationItem(batchId, itemId)
		this.#refuseWhenReleased(batchId, `verdict on ${itemId}`)
		const key = itemKey(batchId, itemId)
		const previous = this.#verdicts.get(key)
		const pushed = stored.batch.items[index]
		const record = append<VerdictRecord>(this.warehousePath, {
			type: "verdict",
			author: this.author,
			mode: "absolute",
			batch: this.#calibrationBatchRef(stored),
			itemId,
			artwork: item.artwork,
			sideA: {
				paletteHash: item.paletteHash,
				fingerprint: pushed.fingerprint,
				variantId: pushed.variantId,
				palette: pushed.palette,
			},
			sideB: null,
			gradeA: input.grade,
			gradeB: null,
			preference: null,
			comment: input.comment,
			confound: false,
			confoundNote: null,
		} satisfies RecordInput<VerdictRecord>)
		const state: VerdictState = {
			record,
			recordId: record.id,
			revision: (previous?.revision ?? 0) + 1,
			amendments: [],
			retracted: false,
		}
		this.#verdicts.set(key, state)
		return state
	}

	/** Record an artwork veto. Withdrawing one is a retracting amendment, never a deletion. */
	async putVeto(batchId: string, itemId: string, reason: string, scope: VetoScope, active: boolean): Promise<VetoState> {
		const judgeable = this.#judgeable(batchId, itemId)
		this.#refuseWhenReleased(batchId, `veto on ${itemId}`)
		const key = itemKey(batchId, itemId)
		const previous = this.#vetoes.get(key)

		if (!active) {
			if (previous === undefined || !previous.active) throw new BadRequest(`Item ${itemId} carries no active veto`)
			append<AmendmentRecord>(this.warehousePath, {
				type: "amendment",
				author: this.author,
				targetId: previous.recordId,
				patch: {},
				retract: true,
				reason: reason.length > 0 ? reason : "veto withdrawn by the reviewer",
			} satisfies RecordInput<AmendmentRecord>)
			const state: VetoState = { ...previous, active: false }
			this.#vetoes.set(key, state)
			return state
		}

		const record = append<VetoRecord>(this.warehousePath, {
			type: "veto",
			author: this.author,
			batch: judgeable.batchRef,
			itemId,
			artwork: judgeable.artwork,
			reason,
			scope,
		} satisfies RecordInput<VetoRecord>)
		const state: VetoState = { record, recordId: record.id, active: true }
		this.#vetoes.set(key, state)
		return state
	}

	/* --- the palette composer (REVIEW_UI.md §4) ------------------------------------------------ */

	/**
	 * The artwork's own colours: a compact quantized grid, plus what the eyedropper is sampling.
	 *
	 * Served for pairwise and calibration items alike. Nothing here says anything about the palettes
	 * on screen — it is a property of the image file, so it cannot leak which side is which.
	 */
	async paletteSource(batchId: string, itemId: string) {
		const { artwork } = this.#judgeable(batchId, itemId)
		const colors = await readImageColors(artwork.path, artwork.sha256)
		return {
			batchId,
			itemId,
			width: colors.width,
			height: colors.height,
			pixels: colors.pixels,
			distinctColors: colors.distinctColors,
			swatches: colors.swatches,
			coveredAreaFraction: colors.coveredAreaFraction,
		}
	}

	/**
	 * The colour at a normalized point of the artwork — the eyedropper.
	 *
	 * Resolved here rather than in a canvas because the browser holds a *rendered* copy: scaled,
	 * possibly colour-managed, and therefore full of colours the file does not contain. A role colour
	 * is an exact source pixel or it is not a palette the algorithm could ever produce.
	 */
	async samplePixel(batchId: string, itemId: string, x: number, y: number) {
		const { artwork } = this.#judgeable(batchId, itemId)
		const colors = await readImageColors(artwork.path, artwork.sha256)
		return pixelAt(colors, x, y)
	}

	/** Every colour of a candidate palette that this artwork does not contain. */
	async #foreign(batchId: string, itemId: string, palette: PaletteSnapshot): Promise<string[]> {
		const { artwork } = this.#judgeable(batchId, itemId)
		const colors = await readImageColors(artwork.path, artwork.sha256)
		return foreignColors(colors, paletteHexes(palette))
	}

	/**
	 * Render a composed palette through the pinned preview renderer.
	 *
	 * The composer previews in the same mock as every judged side, and "the same" has to mean the
	 * same code: the browser pastes `fieldCss` and never composes a gradient itself (REVIEW_UI.md §3,
	 * the display mapping is `[REVIEWED]`). So the preview goes through `blindSidePayload`, exactly
	 * like a served side, and the reviewer is looking at the renderer they will be judged against.
	 */
	async previewPalette(batchId: string, itemId: string, value: unknown) {
		const palette = parsePalette(value)
		const foreign = await this.#foreign(batchId, itemId, palette)
		return {
			side: blindSidePayload(palette, nameHexes(paletteHexes(palette))),
			paletteHash: hashPalette(palette),
			/** Colours the artwork does not contain — a warning while composing, a refusal on submit. */
			foreign,
		}
	}

	/**
	 * Submit a composed palette as an `endorsed-sample`.
	 *
	 * **Editing an endorsement is a new endorsement.** The record is immutable evidence of what the
	 * reviewer assembled and previewed; the warehouse's AMENDABLE_FIELDS lists only `comment` for this
	 * type and throws on anything else, so there is no code path here that could rewrite a palette
	 * even by accident. Statistical weight: never a fitting target, never an auto-win (REVIEW_UI.md
	 * §4) — this server only records it.
	 */
	async putEndorsement(
		batchId: string,
		itemId: string,
		value: unknown,
		comment: string,
		basedOn: string | null,
	): Promise<{ recordId: string; paletteHash: string; count: number }> {
		const judgeable = this.#judgeable(batchId, itemId)
		this.#refuseWhenReleased(batchId, `endorsement on ${itemId}`)
		const palette = parsePalette(value)
		const foreign = await this.#foreign(batchId, itemId, palette)
		if (foreign.length > 0) {
			throw new BadRequest(
				`the artwork contains no such pixel: ${foreign.join(", ")} — role and stop colours are exact source pixels`,
			)
		}
		if (basedOn !== null && judgeable.shown[basedOn] === undefined) {
			throw new BadRequest(`basedOn must be one of ${Object.keys(judgeable.shown).join(" | ")}, or null`)
		}
		const record = append<EndorsedSampleRecord>(this.warehousePath, {
			type: "endorsed-sample",
			author: this.author,
			batch: judgeable.batchRef,
			itemId,
			artwork: judgeable.artwork,
			palette,
			paletteHash: hashPalette(palette),
			// Which shown palette it was assembled from, by content hash — the blinded side name is a
			// property of this batch's shuffle and would mean nothing outside it.
			basedOnPaletteHash: basedOn === null ? null : judgeable.shown[basedOn],
			comment,
		} satisfies RecordInput<EndorsedSampleRecord>)
		const key = itemKey(batchId, itemId)
		const list = this.#endorsements.get(key) ?? []
		list.push({ record, recordId: record.id, retracted: false })
		this.#endorsements.set(key, list)
		return { recordId: record.id, paletteHash: record.paletteHash, count: list.length }
	}

	/* --- post-release amendments (REVIEW_UI.md §1, §2) ----------------------------------------- */

	/**
	 * Amend or retract one item's judgement after its batch was released.
	 *
	 * Safe by construction, and that is the whole design: an amendment is a **new record pointing at
	 * the original**, the latest one wins at query time, and every downstream decision records the
	 * verdict ids that funded it — so a standing gate query (`recheckFundedBy`) flags anything funded
	 * by since-amended evidence instead of the orchestrator having to wait for the reviewer's second
	 * thoughts before triggering.
	 *
	 * What may change is bounded by the warehouse's `AMENDABLE_FIELDS`, not by this server: an
	 * amendment expresses a second thought about a *judgement* and may never change what the record
	 * was *about*. The palettes shown, the artwork, the fingerprints and the content hashes are frozen
	 * at append time, because a verdict is always about the exact palettes shown.
	 */
	async amendItem(
		batchId: string,
		itemId: string,
		target: "verdict" | "veto" | "endorsement",
		patch: Record<string, unknown>,
		reason: string,
		retract: boolean,
	): Promise<{ recordId: string; targetId: string; target: string; retracted: boolean }> {
		// The batch must exist and own the item: an amendment naming an item nobody was shown is a
		// typo, and the warehouse would happily store it.
		this.#judgeable(batchId, itemId)
		// Verdicts and vetoes are directly editable until release, so amending one before release would
		// be a second way to say the same thing. An endorsement is the exception and always has been:
		// it is immutable evidence from the moment it is appended, so withdrawing it is its *only*
		// correction, in an open batch as much as in a closed one.
		if (target !== "endorsement" && this.#releases.get(batchId) === undefined) {
			throw new Conflict(
				`Batch ${batchId} is not released; before release every item is directly editable — amendments are for second thoughts about closed batches`,
			)
		}
		if (reason.trim().length === 0) throw new BadRequest("an amendment needs a reason")
		const key = itemKey(batchId, itemId)

		const targetId = (() => {
			if (target === "verdict") {
				const state = this.#verdicts.get(key)
				if (state === undefined) throw new NotFound(`Item ${itemId} carries no verdict to amend`)
				// An absolute verdict has no side B and no preference, and the warehouse refuses one that
				// carries them. An amendment is not re-validated against that rule on append, so it is
				// enforced here: a calibration grade must never turn into half a comparison.
				if (state.record.mode === "absolute") {
					for (const field of ["gradeB", "preference", "confound", "confoundNote"]) {
						if (field in patch) throw new BadRequest(`${field} has no meaning on an absolute (calibration) verdict`)
					}
				}
				return state.recordId
			}
			if (target === "veto") {
				const state = this.#vetoes.get(key)
				if (state === undefined) throw new NotFound(`Item ${itemId} carries no veto to amend`)
				return state.recordId
			}
			// An endorsement is immutable evidence, so "amend the endorsement" can only ever mean the
			// latest one: an older one is a palette the reviewer already moved on from.
			const list = (this.#endorsements.get(key) ?? []).filter((entry) => !entry.retracted)
			if (list.length === 0) throw new NotFound(`Item ${itemId} carries no endorsement to amend`)
			return list[list.length - 1].recordId
		})()

		const record = append<AmendmentRecord>(this.warehousePath, {
			type: "amendment",
			author: this.author,
			targetId,
			patch,
			retract,
			reason,
		} satisfies RecordInput<AmendmentRecord>)

		// Derived, never mirrored: the running state is rebuilt from the log the amendment just joined,
		// so what the reviewer sees next and what a query would answer cannot disagree.
		this.#replayWarehouse()
		return { recordId: record.id, targetId, target, retracted: retract }
	}

	/**
	 * Amend the batch-level note on a released batch.
	 *
	 * `note` is the one amendable field of a `batch-complete` record. It exists because the release
	 * record is the batch's own statement of what it was, and "what I meant by this batch" is
	 * sometimes only clear afterwards.
	 */
	async amendReleaseNote(batchId: string, note: string, reason: string): Promise<{ recordId: string; targetId: string }> {
		const release = this.#releases.get(batchId)
		const targetId = this.#releaseIds.get(batchId)
		if (release === undefined || targetId === undefined) throw new NotFound(`Batch ${batchId} is not released`)
		if (reason.trim().length === 0) throw new BadRequest("an amendment needs a reason")
		const record = append<AmendmentRecord>(this.warehousePath, {
			type: "amendment",
			author: this.author,
			targetId,
			patch: { note },
			retract: false,
			reason,
		} satisfies RecordInput<AmendmentRecord>)
		this.#replayWarehouse()
		return { recordId: record.id, targetId }
	}

	/* --- calibration: the same-colour-bar bracketing round (PHASE_0_DECISIONS.md §3) --------- */

	/**
	 * Push a bracketing round. The fixture carries the truth (real distances, controls, which items
	 * are silent repeats); none of it is served.
	 */
	async pushBracketing(
		fixture: BracketingFixture,
		fundedBy: readonly string[] = [],
		batchId = fixture.batchId,
	): Promise<{ batchId: string; itemCount: number }> {
		if (fixture.fixtureVersion !== BRACKETING_FIXTURE_VERSION) {
			throw new BadRequest(`Unknown bracketing fixture version ${fixture.fixtureVersion}`)
		}
		if (this.has(batchId)) throw new Conflict(`Batch ${batchId} already exists`)
		const stored: StoredBracketingBatch = {
			kind: "bracketing",
			batchId,
			purpose: "calibration",
			fundedBy: [...fundedBy],
			pushedAt: new Date().toISOString(),
			fixture,
			answerTokens: Object.fromEntries(fixture.items.map((item) => [newAnswerToken(), item.itemId])),
		}
		await this.batchLog.append(stored)
		this.#bracketing.set(stored.batchId, stored)
		return { batchId: stored.batchId, itemCount: fixture.items.length }
	}

	#bracketingBatch(batchId: string): StoredBracketingBatch {
		const stored = this.#bracketing.get(batchId)
		if (stored === undefined) throw new NotFound(`Unknown bracketing batch ${batchId}`)
		return stored
	}

	/**
	 * What the browser may see: the two colours, in the seeded serve order, and nothing else.
	 *
	 * Deliberately absent — every one of these would corrupt the measurement: the true distance, the
	 * target rung, the APCA numbers, the quadrant (it names the stratum being tested), `role` (it
	 * would mark the controls), and `repeatOf` (the repeats have to be silent to measure noise).
	 */
	bracketingPayload(batchId: string) {
		const stored = this.#bracketingBatch(batchId)
		const byId = new Map(stored.fixture.items.map((item) => [item.itemId, item]))
		const tokenFor = new Map(Object.entries(stored.answerTokens).map(([token, itemId]) => [itemId, token]))
		const release = this.#releases.get(batchId)
		return {
			batchId,
			purpose: stored.purpose,
			pushedAt: stored.pushedAt,
			released: release !== undefined,
			releasedAt: release?.ts ?? null,
			// The wording comes from the fixture, so the page cannot drift from what the answers were
			// recorded under. A threshold only means something against the question that produced it.
			prompts: stored.fixture.prompts,
			criterion: stored.fixture.criterion,
			items: stored.fixture.serveOrder.map((itemId) => {
				const item = byId.get(itemId)!
				const answered = this.#answers.get(itemKey(batchId, itemId))
				return {
					token: tokenFor.get(itemId)!,
					part: item.part,
					first: item.firstHex,
					second: item.secondHex,
					answer: answered === undefined ? null : answered.record.answer,
					revision: answered?.revision ?? 0,
				}
			}),
		}
	}

	/**
	 * Record one y/n answer.
	 *
	 * Borrowed record type: these are `oracle-label` records (REVIEW_UI.md §6), because a bracketing
	 * answer is exactly what that type is for — one human answer to one closed-vocabulary question,
	 * carried with its stratum for per-stratum analysis. Two fields are used off-label and it is
	 * worth saying so plainly: `imageId` holds the *pair id* (there is no image — the stimulus is
	 * two flat colours), and `stratum` holds the OKLab quadrant rather than an embedding cluster.
	 * `labelSchemaVersion` is the bracketing fixture version, so these rows can never be confused
	 * with the VLM oracle's own labels.
	 */
	async putBracketingAnswer(batchId: string, token: string, answer: boolean): Promise<{ recordId: string; revision: number }> {
		const stored = this.#bracketingBatch(batchId)
		if (this.#releases.has(batchId)) throw new Conflict(`Batch ${batchId} is released`)
		const itemId = stored.answerTokens[token]
		if (itemId === undefined) throw new NotFound(`Unknown item token in batch ${batchId}`)
		const item = stored.fixture.items.find((entry) => entry.itemId === itemId)
		if (item === undefined) throw new NotFound(`Unknown item ${itemId} in batch ${batchId}`)
		const key = itemKey(batchId, itemId)
		const previous = this.#answers.get(key)
		const record = append<OracleLabelRecord>(this.warehousePath, {
			type: "oracle-label",
			author: this.author,
			imageId: item.itemId,
			artwork: null,
			labelSchemaVersion: stored.fixture.fixtureVersion,
			questionKey: item.part,
			answer,
			confidence: null,
			ambiguityNote: null,
			stratum: item.stratum,
			batch: {
				id: batchId,
				purpose: stored.purpose,
				itemCount: stored.fixture.items.length,
				fundedBy: [...stored.fundedBy],
			},
		} satisfies RecordInput<OracleLabelRecord>)
		const state = { record, recordId: record.id, revision: (previous?.revision ?? 0) + 1 }
		this.#answers.set(key, state)
		return { recordId: record.id, revision: state.revision }
	}

	/* --- oracle validation: by-question passes over artworks (REVIEW_UI.md §6) ---------------- */

	/**
	 * Push an oracle-validation round.
	 *
	 * Every item's file is read here and its identity materialized the same way a pairwise item's is
	 * (full path, content hash, dimensions from the header). The fixture's own hash is checked
	 * against the bytes on disk: an artwork that has changed is not the artwork the round was
	 * designed around, and silently relabelling a different rendition would corrupt the join back to
	 * the oracle's rows.
	 */
	async pushOracleValidation(
		fixture: OracleValidationFixture,
		fundedBy: readonly string[] = [],
		batchId = fixture.batchId,
	): Promise<{ batchId: string; itemCount: number }> {
		if (fixture.fixtureVersion !== PREMISE_DISAMBIGUATION_FIXTURE_VERSION) {
			throw new BadRequest(`Unknown oracle-validation fixture version ${fixture.fixtureVersion}`)
		}
		try {
			validateFixture(fixture)
		} catch (error) {
			throw new BadRequest(`Invalid oracle-validation fixture: ${(error as Error).message}`)
		}
		if (this.has(batchId)) throw new Conflict(`Batch ${batchId} already exists`)

		const artworks: Record<string, ArtworkIdentity> = {}
		for (const item of fixture.items) {
			const artwork = await readArtworkIdentity(itemImagePath(item), {
				what: `item ${item.itemId}`,
				collection: item.collection,
				artworkId: item.artworkId,
				imageRoots: this.imageRoots,
			})
			if (artwork.sha256 !== item.sha256) {
				throw new BadRequest(
					`item ${item.itemId}: ${item.imagePath} hashes ${artwork.sha256}, the fixture was built against ${item.sha256}`,
				)
			}
			artworks[item.itemId] = artwork
		}

		const stored: StoredOracleBatch = {
			kind: "oracle-validation",
			batchId,
			purpose: fixture.purpose,
			fundedBy: [...fundedBy],
			pushedAt: new Date().toISOString(),
			fixture,
			artworks,
			answerTokens: Object.fromEntries(fixture.items.map((item) => [newAnswerToken(), item.itemId])),
		}
		await this.batchLog.append(stored)
		this.#oracle.set(batchId, stored)
		return { batchId, itemCount: fixture.items.length }
	}

	#oracleKey(stored: StoredOracleBatch, item: { questionKey: string; imageId: string }): string {
		return oracleAnswerKey(stored.batchId, item.questionKey, item.imageId)
	}

	#oracleBatch(batchId: string): StoredOracleBatch {
		const stored = this.#oracle.get(batchId)
		if (stored === undefined) throw new NotFound(`Unknown oracle-validation batch ${batchId}`)
		return stored
	}

	/**
	 * What the browser may see: the questions with their answer vocabulary, and one image per item,
	 * in by-question serve order.
	 *
	 * Deliberately absent — this batch exists to break a tie between the oracle and the accepted
	 * palette, so both of their answers, and anything that implies one, must stay server-side: the
	 * VLM's `ground_type` per variant, the published gradient boolean, the item's contradiction
	 * bucket, the fixture's selection counts, the content hash (it is the join key to both), and the
	 * real item id. The reviewer answers the question, not the disagreement.
	 */
	oracleValidationPayload(batchId: string) {
		const stored = this.#oracleBatch(batchId)
		const byId = new Map(stored.fixture.items.map((item) => [item.itemId, item]))
		const tokenFor = new Map(Object.entries(stored.answerTokens).map(([token, itemId]) => [itemId, token]))
		const release = this.#releases.get(batchId)
		const counted = new Map<string, number>()
		for (const item of stored.fixture.items) counted.set(item.questionKey, (counted.get(item.questionKey) ?? 0) + 1)
		return {
			batchId,
			purpose: stored.purpose,
			pushedAt: stored.pushedAt,
			released: release !== undefined,
			releasedAt: release?.ts ?? null,
			// The wording comes from the fixture, so the page cannot drift from what the answers were
			// recorded under — the same rule the bracketing round had to learn.
			questions: stored.fixture.questions.map((question) => ({
				key: question.key,
				kind: question.kind,
				question: question.question,
				instruction: question.instruction,
				// Served so the page can put them above the question on every item of the pass. They are
				// part of what was asked, not chrome: see OracleQuestion.preamble.
				preamble: question.preamble ?? null,
				framing: question.framing ?? null,
				answers: question.answers.map((answer) => ({
					key: answer.key,
					label: answer.label,
					gloss: answer.gloss,
					hotkey: answer.hotkey,
				})),
				itemCount: counted.get(question.key) ?? 0,
			})),
			items: stored.fixture.serveOrder.map((itemId) => {
				const item = byId.get(itemId)!
				const artwork = stored.artworks[itemId]
				const answered = this.#answers.get(this.#oracleKey(stored, item))
				return {
					token: tokenFor.get(itemId)!,
					questionKey: item.questionKey,
					media: `/media/${encodeURIComponent(batchId)}/${encodeURIComponent(tokenFor.get(itemId)!)}`,
					// Dimensions from the header, so the page can hold the image's aspect ratio while it loads.
					width: artwork.rendition.width,
					height: artwork.rendition.height,
					answer: answered === undefined ? null : answered.record.answer,
					revision: answered?.revision ?? 0,
				}
			}),
		}
	}

	/**
	 * Record one closed-vocabulary answer.
	 *
	 * These are `oracle-label` records with the oracle's own provenance columns — same
	 * `labelSchemaVersion`, same `questionKey`, same answer vocabulary — because the whole point of
	 * the mode is that a human row and a VLM row are comparable field by field. What distinguishes
	 * them is `author.kind === "human"` and the batch purpose, never the schema.
	 */
	async putOracleAnswer(batchId: string, token: string, answer: string): Promise<{ recordId: string; revision: number }> {
		const stored = this.#oracleBatch(batchId)
		if (this.#releases.has(batchId)) throw new Conflict(`Batch ${batchId} is released`)
		const itemId = stored.answerTokens[token]
		if (itemId === undefined) throw new NotFound(`Unknown item token in batch ${batchId}`)
		const item = stored.fixture.items.find((entry) => entry.itemId === itemId)
		if (item === undefined) throw new NotFound(`Unknown item ${itemId} in batch ${batchId}`)
		const question = stored.fixture.questions.find((entry) => entry.key === item.questionKey)
		if (question === undefined) throw new NotFound(`Unknown question ${item.questionKey} in batch ${batchId}`)
		// A closed vocabulary is the instrument: an answer outside it is not a weaker answer, it is a
		// different question, and it would silently break every join against the oracle's rows.
		if (!question.answers.some((entry) => entry.key === answer)) {
			throw new BadRequest(`answer must be one of ${question.answers.map((entry) => entry.key).join(" | ")}`)
		}
		const key = this.#oracleKey(stored, item)
		const previous = this.#answers.get(key)
		const record = append<OracleLabelRecord>(this.warehousePath, {
			type: "oracle-label",
			author: this.author,
			imageId: item.imageId,
			artwork: stored.artworks[itemId],
			labelSchemaVersion: stored.fixture.labelSchemaVersion,
			questionKey: question.key,
			answer,
			confidence: null,
			ambiguityNote: null,
			stratum: item.stratum,
			batch: {
				id: batchId,
				purpose: stored.purpose,
				itemCount: stored.fixture.items.length,
				fundedBy: [...stored.fundedBy],
			},
		} satisfies RecordInput<OracleLabelRecord>)
		const state = { record, recordId: record.id, revision: (previous?.revision ?? 0) + 1 }
		this.#answers.set(key, state)
		return { recordId: record.id, revision: state.revision }
	}

	/* --- oracle validation: the post-release adjudication view --------------------------------- */

	/**
	 * The three-way join behind the adjudication page, cached per batch.
	 *
	 * Answers are frozen once a batch is released, and so is the premise run it is joined against, so
	 * this is computed once and reused. Notes do not enter it — they are read separately, because
	 * they keep arriving while the reviewer browses.
	 */
	async #adjudication(batchId: string) {
		const cached = this.#adjudicationCache.get(batchId)
		if (cached !== undefined) return cached
		const stored = this.#oracleBatch(batchId)
		this.#premiseRun ??= await readPremiseRun()
		const analysis = analyzeOracleValidation(stored.fixture, readAll(this.warehousePath), this.#premiseRun, {
			warehousePath: this.warehousePath,
			fixturePath: PREMISE_DISAMBIGUATION_FIXTURE_PATH,
			premiseRunPath: PREMISE_RUN_PATH,
			batchId,
		})
		this.#adjudicationCache.set(batchId, analysis)
		return analysis
	}

	/** The reviewer's latest adjudication note per item. Later notes supersede earlier ones. */
	#adjudicationNotes(batchId: string): Map<string, string> {
		const latest = new Map<string, string>()
		for (const entry of resolveAmendments(readAll(this.warehousePath))) {
			const record = entry.record
			if (entry.retracted || record.type !== "note") continue
			if (record.batch?.id !== batchId || record.itemId === null) continue
			if (!record.tags.includes(ADJUDICATION_TAG)) continue
			const verdict = record.tags.find((tag) => (ADJUDICATION_VERDICTS as readonly string[]).includes(tag))
			if (verdict !== undefined) latest.set(record.itemId, verdict)
		}
		return latest
	}

	/**
	 * The adjudication payload: every item with the reviewer's answer, both oracle variants, the
	 * published flag and the outcome, grouped by who the reviewer sided with.
	 *
	 * **Released batches only, and this is load-bearing.** Everything this page shows is exactly what
	 * the answering pass is built to withhold. Serving it for an open batch would unblind live
	 * judging — so an unreleased batch is not "empty here", it does not exist here.
	 */
	async oracleReviewPayload(batchId: string) {
		const stored = this.#oracleBatch(batchId)
		const release = this.#releases.get(batchId)
		if (release === undefined) {
			throw new NotFound(`Batch ${batchId} is not released; the adjudication view exists only after release`)
		}
		const analysis = await this.#adjudication(batchId)
		const notes = this.#adjudicationNotes(batchId)
		const tokenFor = new Map(Object.entries(stored.answerTokens).map(([token, itemId]) => [itemId, token]))
		const question = stored.fixture.questions[0]

		const rows = analysis.perArtwork
			.filter((entry) => entry.answered)
			.map((entry) => {
				const artwork = stored.artworks[entry.itemId]
				const token = tokenFor.get(entry.itemId)!
				return {
					token,
					media: `/media/${encodeURIComponent(batchId)}/${encodeURIComponent(token)}`,
					fileName: entry.imagePath,
					width: artwork.rendition.width,
					height: artwork.rendition.height,
					stratum: entry.stratum,
					reviewer: entry.reviewerGroundType,
					oracle: Object.entries(entry.oracle).map(([variant, view]) => ({
						variant,
						groundType: view.groundType,
						/** True on the variant whose reading is the one the flag contradicts. */
						contradicted: view.contradicted,
						agreesWithReviewer: view.exactMatch === true,
					})),
					flag: entry.flagGradient ? "gradient" : "flat",
					sidedWith: entry.contradictionVerdict,
					annotation: notes.get(entry.itemId) ?? null,
				}
			})

		return {
			batchId,
			released: true,
			releasedAt: release.ts,
			question: { key: question.key, question: question.question, instruction: question.instruction },
			rule: ADJUDICATION_RULE,
			verdicts: ADJUDICATION_VERDICTS,
			sections: ADJUDICATION_SECTIONS.map((section) => ({
				...section,
				items: rows.filter((row) => row.sidedWith === section.key),
			})),
			totals: {
				items: rows.length,
				annotated: rows.filter((row) => row.annotation !== null).length,
				...Object.fromEntries(ADJUDICATION_VERDICTS.map((verdict) => [verdict, rows.filter((row) => row.annotation === verdict).length])),
			},
		}
	}

	/**
	 * Record one adjudication note.
	 *
	 * A `note` record, not an `oracle-label`: this is not a second answer to the question, it is the
	 * reviewer's opinion *about* the oracle's answer, and folding the two together would corrupt
	 * every agreement number computed from the labels. The two tags are exact opposites, per the
	 * symmetric-vocabulary rule (REVIEW_UI.md §4) — a page that can only record "the oracle misread
	 * this" would measure the reviewer's willingness to complain.
	 *
	 * `derived` stays null. That field is for records a tagging agent re-derived from raw text; a
	 * keystroke from the reviewer is raw evidence itself. The provenance lives in the tags, and the
	 * item it is about is `batch` + `itemId` — which is also how it joins back to the reviewer's own
	 * answer for the same artwork.
	 */
	async putAdjudicationNote(batchId: string, token: string, verdict: string): Promise<{ recordId: string; verdict: string }> {
		const stored = this.#oracleBatch(batchId)
		if (!this.#releases.has(batchId)) {
			throw new NotFound(`Batch ${batchId} is not released; the adjudication view exists only after release`)
		}
		if (!(ADJUDICATION_VERDICTS as readonly string[]).includes(verdict)) {
			throw new BadRequest(`verdict must be one of ${ADJUDICATION_VERDICTS.join(" | ")}`)
		}
		const itemId = stored.answerTokens[token]
		if (itemId === undefined) throw new NotFound(`Unknown item token in batch ${batchId}`)
		const item = stored.fixture.items.find((entry) => entry.itemId === itemId)!
		const record = append<NoteRecord>(this.warehousePath, {
			type: "note",
			author: this.author,
			batch: {
				id: batchId,
				purpose: stored.purpose,
				itemCount: stored.fixture.items.length,
				fundedBy: [...stored.fundedBy],
			},
			itemId,
			artwork: stored.artworks[itemId],
			text: ADJUDICATION_TEXT[verdict as AdjudicationVerdict](item.questionKey),
			tags: [ADJUDICATION_TAG, verdict],
			derived: null,
		} satisfies RecordInput<NoteRecord>)
		return { recordId: record.id, verdict }
	}

	/** Items still missing a judgement. Release is refused while this is non-empty. */
	pending(batchId: string): string[] {
		const oracle = this.#oracle.get(batchId)
		if (oracle !== undefined) {
			return oracle.fixture.items
				.filter((item) => !this.#answers.has(this.#oracleKey(oracle, item)))
				.map((item) => item.itemId)
		}
		const bracketing = this.#bracketing.get(batchId)
		if (bracketing !== undefined) {
			return bracketing.fixture.items
				.filter((item) => !this.#answers.has(itemKey(batchId, item.itemId)))
				.map((item) => item.itemId)
		}
		const calibration = this.#calibration.get(batchId)
		const items = calibration === undefined ? this.#batch(batchId).items : calibration.items
		return items
			.filter((item) => {
				const key = itemKey(batchId, item.itemId)
				return this.#standing(key) === null && this.#vetoes.get(key)?.active !== true
			})
			.map((item) => item.itemId)
	}

	/** Items judged without free text. Reported, never blocking — a forced comment is a corrupted channel. */
	commentless(batchId: string): string[] {
		// A bracketing round has no free-text channel: the question is y/n by design. Neither has an
		// oracle-validation round: §6's whole design target is the 5-second answer.
		if (this.#bracketing.has(batchId) || this.#oracle.has(batchId)) return []
		const calibration = this.#calibration.get(batchId)
		const items = calibration === undefined ? this.#batch(batchId).items : calibration.items
		return items
			.filter((item) => (this.#verdicts.get(itemKey(batchId, item.itemId))?.record.comment ?? "").trim().length === 0)
			.filter((item) => this.#vetoes.get(itemKey(batchId, item.itemId))?.active !== true)
			.map((item) => item.itemId)
	}

	/**
	 * The record ids this release stands on: the standing verdict per item, every active veto, and
	 * every endorsed sample the reviewer composed along the way.
	 *
	 * This is what a downstream decision cites as `fundedBy`, and it is also what the standing gate
	 * query re-checks when one of them is later amended — so it lists everything the batch actually
	 * produced, not only the grades.
	 */
	fundingRecordIds(batchId: string): string[] {
		const oracle = this.#oracle.get(batchId)
		if (oracle !== undefined) {
			return oracle.fixture.items
				.map((item) => this.#answers.get(this.#oracleKey(oracle, item))?.recordId)
				.filter((id): id is string => id !== undefined)
		}
		const bracketed = this.#bracketing.get(batchId)
		if (bracketed !== undefined) {
			return bracketed.fixture.items
				.map((item) => this.#answers.get(itemKey(batchId, item.itemId))?.recordId)
				.filter((id): id is string => id !== undefined)
		}
		const calibration = this.#calibration.get(batchId)
		const items = calibration === undefined ? this.#batch(batchId).items : calibration.items
		const ids: string[] = []
		for (const item of items) {
			const key = itemKey(batchId, item.itemId)
			const verdict = this.#standing(key)
			const veto = this.#vetoes.get(key)
			if (verdict !== null) ids.push(verdict.recordId)
			if (veto?.active === true) ids.push(veto.recordId)
			for (const endorsement of this.#endorsements.get(key) ?? []) {
				if (!endorsement.retracted) ids.push(endorsement.recordId)
			}
		}
		return ids
	}

	/** The explicit reviewer action that completes a batch. Appends `batch-complete`. */
	async release(batchId: string, note = ""): Promise<BatchCompleteRecord> {
		// One release flow for every kind: the batch-complete record is what the watcher waits for,
		// whatever the batch was made of.
		const answersOnly = this.#bracketing.get(batchId) ?? this.#oracle.get(batchId)
		const calibration = this.#calibration.get(batchId)
		const stored = answersOnly === undefined && calibration === undefined ? this.#batch(batchId) : null
		if (this.#releases.has(batchId)) throw new Conflict(`Batch ${batchId} is already released`)
		const pending = this.pending(batchId)
		if (pending.length > 0) {
			throw new Conflict(
				`Batch ${batchId} still has unjudged items: ${pending.slice(0, 8).join(", ")}` +
					(pending.length > 8 ? ` (+${pending.length - 8} more)` : ""),
			)
		}
		const palettes = calibration ?? stored
		const record = append<BatchCompleteRecord>(this.warehousePath, {
			type: "batch-complete",
			author: this.author,
			batchId,
			purpose: answersOnly?.purpose ?? palettes!.batch.purpose,
			itemCount: answersOnly?.fixture.items.length ?? palettes!.items.length,
			fundedBy: [...(answersOnly?.fundedBy ?? palettes!.batch.fundedBy)],
			releasedItemIds: (answersOnly?.fixture.items ?? palettes!.items).map((item) => item.itemId),
			note,
		} satisfies RecordInput<BatchCompleteRecord>)
		this.#releases.set(batchId, record)
		this.#releaseIds.set(batchId, record.id)
		return record
	}

	/**
	 * Artwork bytes, with a custody check: a changed file invalidates every judgement about it.
	 *
	 * One route for every mode. On an oracle-validation batch the second segment is the item's
	 * opaque token, not its id — the browser never learns the id, so it cannot ask by one.
	 */
	async media(batchId: string, handle: string): Promise<{ bytes: Buffer; contentType: string }> {
		const oracle = this.#oracle.get(batchId)
		const artwork =
			oracle !== undefined
				? oracle.artworks[oracle.answerTokens[handle] ?? ""]
				: this.#judgeable(batchId, handle).artwork
		if (artwork === undefined) throw new NotFound(`Unknown item token in batch ${batchId}`)
		const bytes = await readFile(artwork.path)
		if (bytes.byteLength !== artwork.rendition.bytes || sha256(bytes) !== artwork.sha256) {
			throw new Conflict(`Artwork custody changed for ${artwork.path}`)
		}
		return { bytes, contentType: imageContentType(bytes) }
	}
}

/** Every colour a palette puts on screen: the four roles, plus every gradient stop. */
function paletteHexes(palette: PaletteSnapshot): string[] {
	return [
		palette.background,
		palette.surface,
		palette.foreground,
		palette.accent,
		...(palette.gradient?.stops.map((stop) => stop.color) ?? []),
	]
}

/** Content type from magic bytes. Filenames are never trusted in this repository. */
export function imageContentType(bytes: Buffer): string {
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
	if (bytes.length >= 8 && bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png"
	if (
		bytes.length >= 12 &&
		bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
		bytes.subarray(8, 12).toString("ascii") === "WEBP"
	) {
		return "image/webp"
	}
	if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp") {
		const brand = bytes.subarray(8, 12).toString("ascii")
		if (brand === "avif" || brand === "avis") return "image/avif"
		if (brand.startsWith("hei")) return "image/heic"
	}
	return "application/octet-stream"
}

function securityHeaders(contentType: string, length: number): Record<string, string | number> {
	return {
		"Content-Type": contentType,
		"Content-Length": length,
		"Cache-Control": "no-store, max-age=0",
		"Content-Security-Policy":
			"default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; " +
			"img-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'",
		"Referrer-Policy": "no-referrer",
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options": "DENY",
	}
}

function respond(response: ServerResponse, status: number, body: string | Buffer, type = "text/plain; charset=utf-8"): void {
	response.writeHead(status, securityHeaders(type, Buffer.byteLength(body)))
	response.end(body)
}

function respondJson(response: ServerResponse, status: number, value: unknown): void {
	respond(response, status, `${JSON.stringify(value)}\n`, "application/json; charset=utf-8")
}

async function requestBody(request: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = []
	let size = 0
	for await (const chunk of request) {
		const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
		size += bytes.byteLength
		if (size > MAX_REQUEST_BYTES) throw new BadRequest("Request body is too large")
		chunks.push(bytes)
	}
	if (chunks.length === 0) return {}
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
	} catch (error) {
		throw new BadRequest(`Body is not valid JSON: ${(error as Error).message}`)
	}
}

function parseVerdictInput(value: unknown): VerdictInput {
	if (typeof value !== "object" || value === null) throw new BadRequest("Verdict must be an object")
	const record = value as Record<string, unknown>
	const grade = (raw: unknown, what: string): Grade => {
		if (typeof raw !== "string" || !(GRADES as readonly string[]).includes(raw)) {
			throw new BadRequest(`${what} must be one of ${GRADES.join(" | ")}`)
		}
		return raw as Grade
	}
	const preference = record.preference
	if (typeof preference !== "string" || !(PREFERENCES as readonly string[]).includes(preference)) {
		throw new BadRequest(`preference must be one of ${PREFERENCES.join(" | ")}`)
	}
	const comment = record.comment ?? ""
	if (typeof comment !== "string" || comment.length > MAX_COMMENT_LENGTH) {
		throw new BadRequest(`comment must be a string of at most ${MAX_COMMENT_LENGTH} characters`)
	}
	const confound = record.confound ?? false
	if (typeof confound !== "boolean") throw new BadRequest("confound must be a boolean")
	const confoundNote = record.confoundNote ?? ""
	if (typeof confoundNote !== "string" || confoundNote.length > MAX_COMMENT_LENGTH) {
		throw new BadRequest("confoundNote must be a string")
	}
	// The flag without the defect is unqueryable: "re-run after the defect is fixed" needs to know which defect.
	if (confound && confoundNote.trim().length === 0) {
		throw new BadRequest("a confound flag needs a note saying which unrelated defect")
	}
	return {
		gradeA: grade(record.gradeA, "gradeA"),
		gradeB: grade(record.gradeB, "gradeB"),
		preference: preference as Preference,
		comment,
		confound,
		confoundNote,
	}
}

function parseAbsoluteVerdictInput(value: unknown): AbsoluteVerdictInput {
	if (typeof value !== "object" || value === null) throw new BadRequest("Verdict must be an object")
	const record = value as Record<string, unknown>
	const grade = record.grade
	if (typeof grade !== "string" || !(GRADES as readonly string[]).includes(grade)) {
		throw new BadRequest(`grade must be one of ${GRADES.join(" | ")}`)
	}
	const comment = record.comment ?? ""
	if (typeof comment !== "string" || comment.length > MAX_COMMENT_LENGTH) {
		throw new BadRequest(`comment must be a string of at most ${MAX_COMMENT_LENGTH} characters`)
	}
	// Deliberately refused rather than ignored: these are pairwise fields, and silently dropping them
	// would let a mis-wired page believe it recorded a comparison.
	for (const field of ["gradeA", "gradeB", "preference", "confound"]) {
		if (record[field] !== undefined) throw new BadRequest(`${field} has no meaning in absolute (calibration) grading`)
	}
	return { grade: grade as Grade, comment }
}

/** Which record an amendment is about. Verdict unless the reviewer says otherwise. */
const AMEND_TARGETS = ["verdict", "veto", "endorsement"] as const
type AmendTarget = (typeof AMEND_TARGETS)[number]

/** The warehouse record type behind each amendable target on an item. */
const AMEND_TARGET_TYPE = { verdict: "verdict", veto: "veto", endorsement: "endorsed-sample" } as const

/**
 * Validate an amendment's patch: allowed fields, and allowed *values*.
 *
 * `AMENDABLE_FIELDS` is the authority on which fields may change, and the warehouse enforces it on
 * append. It cannot check values, though — a patch is an untyped bag by construction, and nothing
 * re-validates the patched record. So a grade of "banana" or a preference of "maybe" would be
 * accepted by the log and only discovered by whatever tried to count it. That check is here.
 */
function parseAmendPatch(target: AmendTarget, value: unknown): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new BadRequest("patch must be an object")
	const raw = value as Record<string, unknown>
	const allowed = AMENDABLE_FIELDS[AMEND_TARGET_TYPE[target]]
	const patch: Record<string, unknown> = {}
	for (const [field, entry] of Object.entries(raw)) {
		if (entry === undefined) continue
		if (!allowed.includes(field)) {
			throw new BadRequest(
				`field ${JSON.stringify(field)} is not amendable on a ${AMEND_TARGET_TYPE[target]} record (allowed: ${allowed.join(", ") || "none"})`,
			)
		}
		if (field === "gradeA" || field === "gradeB") {
			if (typeof entry !== "string" || !(GRADES as readonly string[]).includes(entry)) {
				throw new BadRequest(`${field} must be one of ${GRADES.join(" | ")}`)
			}
		} else if (field === "preference") {
			if (typeof entry !== "string" || !(PREFERENCES as readonly string[]).includes(entry)) {
				throw new BadRequest(`preference must be one of ${PREFERENCES.join(" | ")}`)
			}
		} else if (field === "scope") {
			if (entry !== "artwork" && entry !== "rendition") throw new BadRequest("scope must be artwork | rendition")
		} else if (field === "confound") {
			if (typeof entry !== "boolean") throw new BadRequest("confound must be a boolean")
		} else if (typeof entry !== "string" || entry.length > MAX_COMMENT_LENGTH) {
			throw new BadRequest(`${field} must be a string of at most ${MAX_COMMENT_LENGTH} characters`)
		}
		patch[field] = entry
	}
	// The same rule the live form enforces: the flag without the defect is unqueryable.
	if (patch.confound === true && typeof patch.confoundNote === "string" && patch.confoundNote.trim().length === 0) {
		throw new BadRequest("a confound flag needs a note saying which unrelated defect")
	}
	if (patch.reason !== undefined && String(patch.reason).trim().length === 0) {
		throw new BadRequest("a veto's reason cannot be emptied by an amendment; retract it instead")
	}
	return patch
}

const STATIC_ROUTES = new Map<string, { file: string; type: string }>([
	["/", { file: "index.html", type: "text/html; charset=utf-8" }],
	["/index.html", { file: "index.html", type: "text/html; charset=utf-8" }],
	["/app.js", { file: "app.js", type: "text/javascript; charset=utf-8" }],
	["/styles.css", { file: "styles.css", type: "text/css; charset=utf-8" }],
	// Shared modules: the mock player is part of the output contract, so every page that shows one
	// shows the same one, from one file (`mock.js`), and the composer lives beside it.
	["/mock.js", { file: "mock.js", type: "text/javascript; charset=utf-8" }],
	["/composer.js", { file: "composer.js", type: "text/javascript; charset=utf-8" }],
	["/calibration", { file: "calibration.html", type: "text/html; charset=utf-8" }],
	["/calibration.html", { file: "calibration.html", type: "text/html; charset=utf-8" }],
	["/calibration.js", { file: "calibration.js", type: "text/javascript; charset=utf-8" }],
	["/amend", { file: "amend.html", type: "text/html; charset=utf-8" }],
	["/amend.html", { file: "amend.html", type: "text/html; charset=utf-8" }],
	["/amend.js", { file: "amend.js", type: "text/javascript; charset=utf-8" }],
	["/bracketing", { file: "bracketing.html", type: "text/html; charset=utf-8" }],
	["/bracketing.html", { file: "bracketing.html", type: "text/html; charset=utf-8" }],
	["/bracketing.js", { file: "bracketing.js", type: "text/javascript; charset=utf-8" }],
	["/oracle", { file: "oracle.html", type: "text/html; charset=utf-8" }],
	["/oracle.html", { file: "oracle.html", type: "text/html; charset=utf-8" }],
	["/oracle.js", { file: "oracle.js", type: "text/javascript; charset=utf-8" }],
	["/oracle-review", { file: "oracle-review.html", type: "text/html; charset=utf-8" }],
	["/oracle-review.html", { file: "oracle-review.html", type: "text/html; charset=utf-8" }],
	["/oracle-review.js", { file: "oracle-review.js", type: "text/javascript; charset=utf-8" }],
])

export type ReviewServerOptions = ReviewServiceOptions & Readonly<{ uiRoot?: string }>

export type ReviewServerHandle = Readonly<{
	server: Server
	service: ReviewService
	listen(port: number, host?: string): Promise<number>
	close(): Promise<void>
}>

export async function createReviewServer(options: ReviewServerOptions = {}): Promise<ReviewServerHandle> {
	const uiRoot = options.uiRoot ?? DEFAULT_UI_ROOT
	const service = new ReviewService(options)
	await service.load()

	const server = createServer(async (request, response) => {
		try {
			const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`)
			const method = request.method ?? "GET"
			const path = url.pathname

			if (method === "GET" && STATIC_ROUTES.has(path)) {
				const route = STATIC_ROUTES.get(path)!
				// Read per request: the UI can be edited while the server stands.
				respond(response, 200, await readFile(join(uiRoot, route.file)), route.type)
				return
			}
			if (method === "GET" && path === "/api/queue") {
				respondJson(response, 200, { batches: service.queue() })
				return
			}
			if (method === "POST" && path === "/api/batches") {
				respondJson(response, 201, await service.pushBatch(await requestBody(request)))
				return
			}

			/* --- calibration mode: absolute grading of single palettes (REVIEW_UI.md §5) --------- */

			if (method === "POST" && path === "/api/calibration") {
				respondJson(response, 201, await service.pushCalibration(await requestBody(request)))
				return
			}

			const calibrationMatch = /^\/api\/calibration\/([^/]+)$/u.exec(path)
			if (method === "GET" && calibrationMatch) {
				respondJson(response, 200, service.calibrationPayload(decodeURIComponent(calibrationMatch[1])))
				return
			}

			const calibrationVerdictMatch = /^\/api\/calibration\/([^/]+)\/items\/([^/]+)\/verdict$/u.exec(path)
			if (calibrationVerdictMatch && (method === "PUT" || method === "POST")) {
				const state = await service.putAbsoluteVerdict(
					decodeURIComponent(calibrationVerdictMatch[1]),
					decodeURIComponent(calibrationVerdictMatch[2]),
					parseAbsoluteVerdictInput(await requestBody(request)),
				)
				respondJson(response, 200, { recordId: state.recordId, revision: state.revision, recordedAt: state.record.ts })
				return
			}

			if (method === "POST" && path === "/api/bracketing") {
				const body = (await requestBody(request)) as Record<string, unknown>
				const fixture =
					body.fixture === undefined
						? ((JSON.parse(await readFile(BRACKETING_FIXTURE_PATH, "utf8")) as BracketingFixture))
						: (body.fixture as BracketingFixture)
				const fundedBy = Array.isArray(body.fundedBy) ? (body.fundedBy as string[]) : []
				respondJson(response, 201, await service.pushBracketing(fixture, fundedBy))
				return
			}

			const bracketingMatch = /^\/api\/bracketing\/([^/]+)$/u.exec(path)
			if (method === "GET" && bracketingMatch) {
				respondJson(response, 200, service.bracketingPayload(decodeURIComponent(bracketingMatch[1])))
				return
			}

			const answerMatch = /^\/api\/bracketing\/([^/]+)\/items\/([^/]+)\/answer$/u.exec(path)
			if (answerMatch && (method === "PUT" || method === "POST")) {
				const body = (await requestBody(request)) as Record<string, unknown>
				if (typeof body.answer !== "boolean") throw new BadRequest("answer must be true or false")
				respondJson(
					response,
					200,
					await service.putBracketingAnswer(
						decodeURIComponent(answerMatch[1]),
						decodeURIComponent(answerMatch[2]),
						body.answer,
					),
				)
				return
			}

			if (method === "POST" && path === "/api/oracle-validation") {
				const body = (await requestBody(request)) as Record<string, unknown>
				const fixture =
					body.fixture === undefined
						? ((JSON.parse(await readFile(PREMISE_DISAMBIGUATION_FIXTURE_PATH, "utf8")) as OracleValidationFixture))
						: (body.fixture as OracleValidationFixture)
				const fundedBy = Array.isArray(body.fundedBy) ? (body.fundedBy as string[]) : []
				respondJson(response, 201, await service.pushOracleValidation(fixture, fundedBy))
				return
			}

			const oracleMatch = /^\/api\/oracle-validation\/([^/]+)$/u.exec(path)
			if (method === "GET" && oracleMatch) {
				respondJson(response, 200, service.oracleValidationPayload(decodeURIComponent(oracleMatch[1])))
				return
			}

			const oracleAnswerMatch = /^\/api\/oracle-validation\/([^/]+)\/items\/([^/]+)\/answer$/u.exec(path)
			if (oracleAnswerMatch && (method === "PUT" || method === "POST")) {
				const body = (await requestBody(request)) as Record<string, unknown>
				if (typeof body.answer !== "string") throw new BadRequest("answer must be one of the offered vocabulary tokens")
				respondJson(
					response,
					200,
					await service.putOracleAnswer(
						decodeURIComponent(oracleAnswerMatch[1]),
						decodeURIComponent(oracleAnswerMatch[2]),
						body.answer,
					),
				)
				return
			}

			const reviewMatch = /^\/api\/oracle-review\/([^/]+)$/u.exec(path)
			if (method === "GET" && reviewMatch) {
				respondJson(response, 200, await service.oracleReviewPayload(decodeURIComponent(reviewMatch[1])))
				return
			}

			const reviewNoteMatch = /^\/api\/oracle-review\/([^/]+)\/items\/([^/]+)\/note$/u.exec(path)
			if (reviewNoteMatch && (method === "PUT" || method === "POST")) {
				const body = (await requestBody(request)) as Record<string, unknown>
				if (typeof body.verdict !== "string") throw new BadRequest("verdict must be a string")
				respondJson(
					response,
					200,
					await service.putAdjudicationNote(
						decodeURIComponent(reviewNoteMatch[1]),
						decodeURIComponent(reviewNoteMatch[2]),
						body.verdict,
					),
				)
				return
			}

			const batchMatch = /^\/api\/batches\/([^/]+)$/u.exec(path)
			if (method === "GET" && batchMatch) {
				respondJson(response, 200, service.batchPayload(decodeURIComponent(batchMatch[1])))
				return
			}

			const verdictMatch = /^\/api\/batches\/([^/]+)\/items\/([^/]+)\/verdict$/u.exec(path)
			if (verdictMatch && (method === "PUT" || method === "POST")) {
				const state = await service.putVerdict(
					decodeURIComponent(verdictMatch[1]),
					decodeURIComponent(verdictMatch[2]),
					parseVerdictInput(await requestBody(request)),
				)
				respondJson(response, 200, {
					recordId: state.recordId,
					revision: state.revision,
					recordedAt: state.record.ts,
				})
				return
			}

			const vetoMatch = /^\/api\/batches\/([^/]+)\/items\/([^/]+)\/veto$/u.exec(path)
			if (vetoMatch && (method === "PUT" || method === "POST")) {
				const body = (await requestBody(request)) as Record<string, unknown>
				const reason = typeof body.reason === "string" ? body.reason : ""
				const active = body.active === undefined ? true : body.active === true
				const scope = body.scope === "rendition" ? "rendition" : "artwork"
				if (active && reason.trim().length === 0) throw new BadRequest("a veto needs a reason")
				const state = await service.putVeto(
					decodeURIComponent(vetoMatch[1]),
					decodeURIComponent(vetoMatch[2]),
					reason,
					scope,
					active,
				)
				respondJson(response, 200, { recordId: state.recordId, active: state.active })
				return
			}

			/* --- the palette composer (REVIEW_UI.md §4) ------------------------------------------ */

			const colorsMatch = /^\/api\/batches\/([^/]+)\/items\/([^/]+)\/colors$/u.exec(path)
			if (method === "GET" && colorsMatch) {
				respondJson(
					response,
					200,
					await service.paletteSource(decodeURIComponent(colorsMatch[1]), decodeURIComponent(colorsMatch[2])),
				)
				return
			}

			const pixelMatch = /^\/api\/batches\/([^/]+)\/items\/([^/]+)\/pixel$/u.exec(path)
			if (method === "GET" && pixelMatch) {
				const x = Number(url.searchParams.get("x"))
				const y = Number(url.searchParams.get("y"))
				respondJson(
					response,
					200,
					await service.samplePixel(decodeURIComponent(pixelMatch[1]), decodeURIComponent(pixelMatch[2]), x, y),
				)
				return
			}

			const previewMatch = /^\/api\/batches\/([^/]+)\/items\/([^/]+)\/preview$/u.exec(path)
			if (previewMatch && (method === "POST" || method === "PUT")) {
				const body = (await requestBody(request)) as Record<string, unknown>
				respondJson(
					response,
					200,
					await service.previewPalette(
						decodeURIComponent(previewMatch[1]),
						decodeURIComponent(previewMatch[2]),
						body.palette,
					),
				)
				return
			}

			const endorsementMatch = /^\/api\/batches\/([^/]+)\/items\/([^/]+)\/endorsement$/u.exec(path)
			if (endorsementMatch && (method === "POST" || method === "PUT")) {
				const body = (await requestBody(request)) as Record<string, unknown>
				const comment = body.comment ?? ""
				if (typeof comment !== "string" || comment.length > MAX_COMMENT_LENGTH) {
					throw new BadRequest(`comment must be a string of at most ${MAX_COMMENT_LENGTH} characters`)
				}
				const basedOn = body.basedOn === undefined || body.basedOn === null ? null : String(body.basedOn)
				respondJson(
					response,
					201,
					await service.putEndorsement(
						decodeURIComponent(endorsementMatch[1]),
						decodeURIComponent(endorsementMatch[2]),
						body.palette,
						comment,
						basedOn,
					),
				)
				return
			}

			/* --- post-release amendments (REVIEW_UI.md §2) --------------------------------------- */

			const amendMatch = /^\/api\/batches\/([^/]+)\/items\/([^/]+)\/amend$/u.exec(path)
			if (method === "POST" && amendMatch) {
				const body = (await requestBody(request)) as Record<string, unknown>
				const target = body.target === undefined ? "verdict" : String(body.target)
				if (!(AMEND_TARGETS as readonly string[]).includes(target)) {
					throw new BadRequest(`target must be one of ${AMEND_TARGETS.join(" | ")}`)
				}
				const reason = typeof body.reason === "string" ? body.reason : ""
				const retract = body.retract === true
				const patch = parseAmendPatch(target as AmendTarget, body.patch ?? {})
				if (Object.keys(patch).length === 0 && !retract) {
					throw new BadRequest("an amendment must change something or retract the record")
				}
				respondJson(
					response,
					200,
					await service.amendItem(
						decodeURIComponent(amendMatch[1]),
						decodeURIComponent(amendMatch[2]),
						target as AmendTarget,
						patch,
						reason,
						retract,
					),
				)
				return
			}

			const releaseNoteMatch = /^\/api\/batches\/([^/]+)\/release-note$/u.exec(path)
			if (method === "POST" && releaseNoteMatch) {
				const body = (await requestBody(request)) as Record<string, unknown>
				if (typeof body.note !== "string" || body.note.length > MAX_COMMENT_LENGTH) {
					throw new BadRequest(`note must be a string of at most ${MAX_COMMENT_LENGTH} characters`)
				}
				const reason = typeof body.reason === "string" ? body.reason : ""
				respondJson(
					response,
					200,
					await service.amendReleaseNote(decodeURIComponent(releaseNoteMatch[1]), body.note, reason),
				)
				return
			}

			const releaseMatch = /^\/api\/batches\/([^/]+)\/release$/u.exec(path)
			if (method === "POST" && releaseMatch) {
				const batchId = decodeURIComponent(releaseMatch[1])
				const body = (await requestBody(request)) as Record<string, unknown>
				const commentless = service.commentless(batchId)
				const funding = service.fundingRecordIds(batchId)
				const record = await service.release(batchId, typeof body.note === "string" ? body.note : "")
				respondJson(response, 200, {
					recordId: record.id,
					releasedAt: record.ts,
					itemCount: record.itemCount,
					/** The records this release stands on — what a downstream decision cites as `fundedBy`. */
					fundingRecordIds: funding,
					// Reported for the record, never blocking.
					itemsWithoutComment: commentless,
				})
				return
			}

			const mediaMatch = /^\/media\/([^/]+)\/([^/]+)$/u.exec(path)
			if (method === "GET" && mediaMatch) {
				const media = await service.media(decodeURIComponent(mediaMatch[1]), decodeURIComponent(mediaMatch[2]))
				respond(response, 200, media.bytes, media.contentType)
				return
			}

			respondJson(response, 404, { error: `No route for ${method} ${path}` })
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			const status = error instanceof NotFound ? 404 : error instanceof Conflict ? 409 : 400
			respondJson(response, status, { error: message })
		}
	})

	return {
		server,
		service,
		listen(port: number, host = "127.0.0.1"): Promise<number> {
			return new Promise((resolve, reject) => {
				server.once("error", reject)
				server.listen(port, host, () => {
					server.removeListener("error", reject)
					const address = server.address()
					resolve(typeof address === "object" && address !== null ? address.port : port)
				})
			})
		},
		async close(): Promise<void> {
			await new Promise<void>((done) => server.close(() => done()))
			await service.close()
		},
	}
}

/**
 * Push the demo fixture batch if it is not in the queue yet. Idempotent by batch id.
 *
 * The fixture stores repo-root-relative image paths so it stays portable; the push API itself
 * always requires absolute paths, so they are resolved here.
 */
export async function seedDemoBatch(service: ReviewService, fixturePath = DEMO_BATCH_PATH): Promise<string | null> {
	const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as Record<string, unknown>
	if (typeof fixture.batchId === "string" && service.has(fixture.batchId)) return null
	if (fixture.imagePathsRelativeTo === "repo-root" && Array.isArray(fixture.items)) {
		fixture.items = fixture.items.map((item: Record<string, unknown>) => ({
			...item,
			imagePath: join(REPO_ROOT, String(item.imagePath)),
		}))
	}
	const pushed = await service.pushBatch(fixture)
	return pushed.batchId
}

/**
 * Push the demo calibration round if it is not in the queue yet. Idempotent by batch id.
 *
 * Same three artworks as the demo pairwise batch, so the two modes can be compared on screen without
 * inventing colours. Seeded under the same `--no-demo` flag, because it is the same kind of thing:
 * something to look at, never evidence.
 */
export async function seedDemoCalibration(service: ReviewService, fixturePath = DEMO_CALIBRATION_PATH): Promise<string | null> {
	const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as Record<string, unknown>
	if (typeof fixture.batchId === "string" && service.has(fixture.batchId)) return null
	if (fixture.imagePathsRelativeTo === "repo-root" && Array.isArray(fixture.items)) {
		fixture.items = fixture.items.map((item: Record<string, unknown>) => ({
			...item,
			imagePath: join(REPO_ROOT, String(item.imagePath)),
		}))
	}
	const pushed = await service.pushCalibration(fixture)
	return pushed.batchId
}

/** Push the active bracketing round if it is not in the queue yet. Idempotent by batch id. */
export async function seedBracketingRound(
	service: ReviewService,
	fixturePath = BRACKETING_FIXTURE_PATH,
	batchId = BRACKETING_ACTIVE_BATCH_ID,
): Promise<string | null> {
	const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as BracketingFixture
	if (service.has(batchId)) return null
	const pushed = await service.pushBracketing(
		fixture,
		["PHASE_0_DECISIONS.md §3 — the one ruler is [UNCALIBRATED]", `criterion: ${fixture.criterion}`],
		batchId,
	)
	return pushed.batchId
}

/**
 * Push the round-2 refinement pass if it is not in the queue yet. Idempotent by batch id.
 *
 * Round 1 is left exactly as it is — released, and still in the queue as evidence. The page lands on
 * this one because it picks the newest *unreleased* bracketing round.
 */
export async function seedBracketingRound2(
	service: ReviewService,
	fixturePath = BRACKETING_ROUND_2_FIXTURE_PATH,
	batchId = BRACKETING_ROUND_2_BATCH_ID,
): Promise<string | null> {
	const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as BracketingFixture
	if (service.has(batchId)) return null
	const pushed = await service.pushBracketing(
		fixture,
		[
			"bracketing round 1 — one threshold did not survive all four quadrants",
			`refines: ${fixture.refinement?.refines ?? BRACKETING_ACTIVE_BATCH_ID}`,
			`criterion: ${fixture.criterion}`,
		],
		batchId,
	)
	return pushed.batchId
}

/**
 * Push the human probe round if it is not in the queue yet. Idempotent by batch id.
 *
 * PREMISE_NEXT.md §12. Deliberately a separate batch from the disambiguation round even though it
 * covers the same 30 artworks: it asks different questions, under a different label schema, and the
 * whole point of use (b) is comparing the two — which needs them to be two.
 */
export async function seedProbeGoldRound(
	service: ReviewService,
	fixturePath = PROBE_GOLD_FIXTURE_PATH,
	batchId = PROBE_GOLD_BATCH_ID,
): Promise<string | null> {
	const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as OracleValidationFixture
	if (service.has(batchId)) return null
	const pushed = await service.pushOracleValidation(
		fixture,
		[
			"PREMISE_NEXT.md §12 — probe-native gold, and the model-free reliability test",
			`probes: ${fixture.questions.map((question) => question.key).join(", ")}`,
		],
		batchId,
	)
	return pushed.batchId
}

/** Push the premise-disambiguation round if it is not in the queue yet. Idempotent by batch id. */
export async function seedOracleValidationRound(
	service: ReviewService,
	fixturePath = PREMISE_DISAMBIGUATION_FIXTURE_PATH,
	batchId = PREMISE_DISAMBIGUATION_BATCH_ID,
): Promise<string | null> {
	const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as OracleValidationFixture
	if (service.has(batchId)) return null
	const pushed = await service.pushOracleValidation(
		fixture,
		[
			"V3_PLAN.md §5 step 1 — the premise test's contradictions have no human answer",
			`selection: ${fixture.selection.rule}`,
		],
		batchId,
	)
	return pushed.batchId
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			port: { type: "string", default: String(DEFAULT_PORT) },
			warehouse: { type: "string" },
			batches: { type: "string" },
			reviewer: { type: "string" },
			"no-demo": { type: "boolean", default: false },
			"no-bracketing": { type: "boolean", default: false },
			"no-oracle": { type: "boolean", default: false },
		},
		strict: true,
	})
	const port = Number(values.port)
	if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) throw new Error("--port must be a valid TCP port")

	const handle = await createReviewServer({
		warehousePath: values.warehouse,
		batchLogPath: values.batches,
		reviewerId: values.reviewer,
	})
	if (values["no-demo"] !== true) {
		const seeded = await seedDemoBatch(handle.service)
		if (seeded !== null) process.stdout.write(`seeded demo batch "${seeded}"\n`)
		const calibration = await seedDemoCalibration(handle.service)
		if (calibration !== null) {
			process.stdout.write(`seeded demo calibration round "${calibration}" — http://127.0.0.1:${values.port}/calibration\n`)
		}
	}
	if (values["no-bracketing"] !== true) {
		const seeded = await seedBracketingRound(handle.service)
		if (seeded !== null) process.stdout.write(`seeded bracketing round "${seeded}" — http://127.0.0.1:${values.port}/bracketing\n`)
		const round2 = await seedBracketingRound2(handle.service)
		if (round2 !== null) process.stdout.write(`seeded bracketing round "${round2}" — http://127.0.0.1:${values.port}/bracketing\n`)
	}
	if (values["no-oracle"] !== true) {
		const seeded = await seedOracleValidationRound(handle.service)
		if (seeded !== null) process.stdout.write(`seeded oracle-validation round "${seeded}" — http://127.0.0.1:${values.port}/oracle\n`)
		const probes = await seedProbeGoldRound(handle.service)
		if (probes !== null) process.stdout.write(`seeded oracle-validation round "${probes}" — http://127.0.0.1:${values.port}/oracle\n`)
	}
	const actual = await handle.listen(port)
	process.stdout.write(`v3 review server: http://127.0.0.1:${actual}/\n`)
	process.stdout.write(`  warehouse: ${handle.service.warehousePath}\n`)
	process.stdout.write(`  batch log: ${handle.service.batchLog.path} (server-side only — holds the variant ids)\n`)
	process.stdout.write(`  reviewer:  ${handle.service.author.id}\n`)
	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.once(signal, () => {
			handle.close().then(
				() => process.exit(0),
				() => process.exit(1),
			)
		})
	}
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main()
}
