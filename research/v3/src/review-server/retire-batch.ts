/**
 * Retire an open batch — the orchestrator's way of closing a round nobody is going to finish.
 *
 * **Why a round ever needs this.** Two did on the same day. `toolbox-adjudication-1` was adjudicated
 * in conversation instead of in the UI (the reviewer: *"this review is deprecated now, right?"*), and
 * `dropped-colors-1` was abandoned part-way because a chat verdict made the remaining items moot.
 * Neither could be released — `release` refuses a round with unjudged items, and it is right to,
 * because releasing asserts the reviewer worked through every one. Neither could be left open either:
 * an open round is a standing request, and a standing request nobody intends to answer is noise that
 * makes every real one easier to ignore.
 *
 * **What it does not do.** It does not delete, alter, or invalidate a single answer. `dropped-colors-1`
 * stopped part-way and the answers it did collect are real colour-level labels; the round ending does
 * not make them less true, and anything downstream may still cite them. One record is appended and
 * nothing else is touched.
 *
 * **Why it talks to the running server rather than the file.** Appending to `warehouse.jsonl` behind
 * a live server's back leaves its in-memory state disagreeing with the log until someone restarts it
 * — and the dashboard the reviewer is looking at would go on showing the round as open. Going through
 * the server means the state and the log move together.
 *
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/src/review-server/retire-batch.ts \
 *     --batch <id> --reason "<why>" [--base http://127.0.0.1:3010]
 *
 * There is deliberately no reviewer-facing key for this. Whether a round still matters to the
 * campaign is a judgement about the campaign, not about an artwork, and the review UI should not ask
 * the reviewer to make it between two covers.
 */
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

export const DEFAULT_REVIEW_BASE = "http://127.0.0.1:3010"

export type RetirementResult = Readonly<{
	recordId: string
	retiredAt: string
	batchId: string
	reason: string
	/** The items that carried an answer when the round was retired. They stay valid. */
	answeredItemIds: readonly string[]
	itemCount: number | null
}>

/** POST the retirement to a running review server, and return what it recorded. */
export async function retireBatch(base: string, batchId: string, reason: string): Promise<RetirementResult> {
	const response = await fetch(`${base}/api/batches/${encodeURIComponent(batchId)}/retire`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ reason }),
	})
	const text = await response.text()
	if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 300)}`)
	return JSON.parse(text) as RetirementResult
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			batch: { type: "string" },
			reason: { type: "string" },
			base: { type: "string" },
		},
		strict: true,
	})
	const batchId = values.batch
	const reason = values.reason
	// Both required, and checked here as well as server-side so a typo costs a message rather than a
	// half-formed record. A retirement with no reason is indistinguishable later from an abandonment.
	if (batchId === undefined || batchId.trim().length === 0) throw new Error("--batch <id> is required")
	if (reason === undefined || reason.trim().length === 0) throw new Error("--reason \"<why>\" is required")

	const result = await retireBatch(values.base ?? DEFAULT_REVIEW_BASE, batchId, reason)
	process.stdout.write(`retired ${result.batchId} at ${result.retiredAt}\n`)
	process.stdout.write(`  reason: ${result.reason}\n`)
	process.stdout.write(`  ${result.answeredItemIds.length} of ${result.itemCount ?? "?"} item(s) carried an answer; they stay valid\n`)
	process.stdout.write(`  record: ${result.recordId}\n`)
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
	await main()
}
