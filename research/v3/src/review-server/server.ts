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
	GRADES,
	PREFERENCES,
	type AmendmentRecord,
	type ArtworkIdentity,
	type Author,
	type BatchCompleteRecord,
	type Grade,
	type OracleLabelRecord,
	type Preference,
	type RecordInput,
	type VerdictRecord,
	type VerdictSide,
	type VetoRecord,
	type VetoScope,
} from "../warehouse/records.ts"
import { append, readAll, resolve as resolveAmendments } from "../warehouse/warehouse.ts"
import { BadRequest, blindSidePayload, materialize, parseBatch, readArtworkIdentity } from "./batch.ts"
import { newAnswerToken, newBlindingSalt, sha256 } from "./blinding.ts"
import {
	BRACKETING_ACTIVE_BATCH_ID,
	BRACKETING_FIXTURE_PATH,
	BRACKETING_FIXTURE_VERSION,
	type BracketingFixture,
} from "./bracketing.ts"

export { BRACKETING_ACTIVE_BATCH_ID }
import {
	PREMISE_DISAMBIGUATION_BATCH_ID,
	PREMISE_DISAMBIGUATION_FIXTURE_PATH,
	PREMISE_DISAMBIGUATION_FIXTURE_VERSION,
	itemImagePath,
	validateFixture,
	type OracleValidationFixture,
} from "./oracle-validation.ts"

export { PREMISE_DISAMBIGUATION_BATCH_ID }
import { JsonlAppender, readJsonl } from "./store.ts"
import {
	isBracketingBatch,
	isOracleBatch,
	SIDES,
	type PushedBatch,
	type Side,
	type StoredAnyBatch,
	type StoredBatch,
	type StoredBracketingBatch,
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

type VerdictState = { record: VerdictRecord; recordId: string; revision: number }
type VetoState = { record: VetoRecord; recordId: string; active: boolean }
type AnswerState = { record: OracleLabelRecord; recordId: string; revision: number }

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
	readonly #verdicts = new Map<string, VerdictState>()
	readonly #vetoes = new Map<string, VetoState>()
	readonly #answers = new Map<string, AnswerState>()
	readonly #releases = new Map<string, BatchCompleteRecord>()

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
			else this.#batches.set(stored.batch.batchId, stored)
		}
		// Amendments are applied first: a retracted veto must come back as "not vetoed", and an
		// amended verdict must show its amended grades.
		for (const entry of resolveAmendments(readAll(this.warehousePath))) {
			const record = entry.record
			if (record.type === "verdict") {
				const key = itemKey(record.batch.id, record.itemId)
				const previous = this.#verdicts.get(key)
				const revision = (previous?.revision ?? 0) + 1
				// A retracted verdict still counts as a revision that happened, but is not the position.
				if (entry.retracted) {
					if (previous !== undefined) this.#verdicts.set(key, { ...previous, revision })
				} else {
					this.#verdicts.set(key, { record, recordId: entry.original.id, revision })
				}
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
			}
		}
	}

	async close(): Promise<void> {
		await this.batchLog.close()
	}

	has(batchId: string): boolean {
		return this.#batches.has(batchId) || this.#bracketing.has(batchId) || this.#oracle.has(batchId)
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

	released(batchId: string): BatchCompleteRecord | null {
		return this.#releases.get(batchId) ?? null
	}

	/** The batch metadata every record in the batch carries, denormalized (REVIEW_UI.md §7). */
	#batchRef(stored: StoredBatch) {
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

	queue() {
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
				if (this.#verdicts.has(key) || this.#vetoes.get(key)?.active === true) judged += 1
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
		return [...pairwise, ...bracketing, ...oracle]
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
			grades: GRADES,
			preferences: PREFERENCES,
			items: stored.items.map((item, index) => {
				const pushed = stored.batch.items[index]
				const key = itemKey(batchId, item.itemId)
				const verdict = this.#verdicts.get(key)
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
					verdict:
						verdict === undefined
							? null
							: {
									gradeA: verdict.record.gradeA,
									gradeB: verdict.record.gradeB,
									preference: verdict.record.preference,
									comment: verdict.record.comment,
									confound: verdict.record.confound,
									confoundNote: verdict.record.confoundNote ?? "",
									revision: verdict.revision,
									recordedAt: verdict.record.ts,
								},
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
		if (this.#releases.has(batchId)) {
			throw new Conflict(`Batch ${batchId} is released; post-release edits need an amendment record (not built yet)`)
		}
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
		const state: VerdictState = { record, recordId: record.id, revision: (previous?.revision ?? 0) + 1 }
		this.#verdicts.set(key, state)
		return state
	}

	/** Record an artwork veto. Withdrawing one is a retracting amendment, never a deletion. */
	async putVeto(batchId: string, itemId: string, reason: string, scope: VetoScope, active: boolean): Promise<VetoState> {
		const { stored, item } = this.#item(batchId, itemId)
		if (this.#releases.has(batchId)) throw new Conflict(`Batch ${batchId} is released`)
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
			batch: this.#batchRef(stored),
			itemId,
			artwork: item.artwork,
			reason,
			scope,
		} satisfies RecordInput<VetoRecord>)
		const state: VetoState = { record, recordId: record.id, active: true }
		this.#vetoes.set(key, state)
		return state
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
		const stored = this.#batch(batchId)
		return stored.items
			.filter((item) => {
				const key = itemKey(batchId, item.itemId)
				return !this.#verdicts.has(key) && this.#vetoes.get(key)?.active !== true
			})
			.map((item) => item.itemId)
	}

	/** Items judged without free text. Reported, never blocking — a forced comment is a corrupted channel. */
	commentless(batchId: string): string[] {
		// A bracketing round has no free-text channel: the question is y/n by design. Neither has an
		// oracle-validation round: §6's whole design target is the 5-second answer.
		if (this.#bracketing.has(batchId) || this.#oracle.has(batchId)) return []
		const stored = this.#batch(batchId)
		return stored.items
			.filter((item) => (this.#verdicts.get(itemKey(batchId, item.itemId))?.record.comment ?? "").trim().length === 0)
			.filter((item) => this.#vetoes.get(itemKey(batchId, item.itemId))?.active !== true)
			.map((item) => item.itemId)
	}

	/** The record ids this release stands on: the latest verdict per item, plus active vetoes. */
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
		const stored = this.#batch(batchId)
		const ids: string[] = []
		for (const item of stored.items) {
			const key = itemKey(batchId, item.itemId)
			const verdict = this.#verdicts.get(key)
			const veto = this.#vetoes.get(key)
			if (verdict !== undefined) ids.push(verdict.recordId)
			if (veto?.active === true) ids.push(veto.recordId)
		}
		return ids
	}

	/** The explicit reviewer action that completes a batch. Appends `batch-complete`. */
	async release(batchId: string, note = ""): Promise<BatchCompleteRecord> {
		// One release flow for every kind: the batch-complete record is what the watcher waits for,
		// whatever the batch was made of.
		const answersOnly = this.#bracketing.get(batchId) ?? this.#oracle.get(batchId)
		const stored = answersOnly === undefined ? this.#batch(batchId) : null
		if (this.#releases.has(batchId)) throw new Conflict(`Batch ${batchId} is already released`)
		const pending = this.pending(batchId)
		if (pending.length > 0) {
			throw new Conflict(
				`Batch ${batchId} still has unjudged items: ${pending.slice(0, 8).join(", ")}` +
					(pending.length > 8 ? ` (+${pending.length - 8} more)` : ""),
			)
		}
		const record = append<BatchCompleteRecord>(this.warehousePath, {
			type: "batch-complete",
			author: this.author,
			batchId,
			purpose: answersOnly?.purpose ?? stored!.batch.purpose,
			itemCount: answersOnly?.fixture.items.length ?? stored!.items.length,
			fundedBy: [...(answersOnly?.fundedBy ?? stored!.batch.fundedBy)],
			releasedItemIds: (answersOnly?.fixture.items ?? stored!.items).map((item) => item.itemId),
			note,
		} satisfies RecordInput<BatchCompleteRecord>)
		this.#releases.set(batchId, record)
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
			oracle === undefined
				? this.#item(batchId, handle).item.artwork
				: oracle.artworks[oracle.answerTokens[handle] ?? ""]
		if (artwork === undefined) throw new NotFound(`Unknown item token in batch ${batchId}`)
		const bytes = await readFile(artwork.path)
		if (bytes.byteLength !== artwork.rendition.bytes || sha256(bytes) !== artwork.sha256) {
			throw new Conflict(`Artwork custody changed for ${artwork.path}`)
		}
		return { bytes, contentType: imageContentType(bytes) }
	}
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

const STATIC_ROUTES = new Map<string, { file: string; type: string }>([
	["/", { file: "index.html", type: "text/html; charset=utf-8" }],
	["/index.html", { file: "index.html", type: "text/html; charset=utf-8" }],
	["/app.js", { file: "app.js", type: "text/javascript; charset=utf-8" }],
	["/styles.css", { file: "styles.css", type: "text/css; charset=utf-8" }],
	["/bracketing", { file: "bracketing.html", type: "text/html; charset=utf-8" }],
	["/bracketing.html", { file: "bracketing.html", type: "text/html; charset=utf-8" }],
	["/bracketing.js", { file: "bracketing.js", type: "text/javascript; charset=utf-8" }],
	["/oracle", { file: "oracle.html", type: "text/html; charset=utf-8" }],
	["/oracle.html", { file: "oracle.html", type: "text/html; charset=utf-8" }],
	["/oracle.js", { file: "oracle.js", type: "text/javascript; charset=utf-8" }],
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
	}
	if (values["no-bracketing"] !== true) {
		const seeded = await seedBracketingRound(handle.service)
		if (seeded !== null) process.stdout.write(`seeded bracketing round "${seeded}" — http://127.0.0.1:${values.port}/bracketing\n`)
	}
	if (values["no-oracle"] !== true) {
		const seeded = await seedOracleValidationRound(handle.service)
		if (seeded !== null) process.stdout.write(`seeded oracle-validation round "${seeded}" — http://127.0.0.1:${values.port}/oracle\n`)
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
