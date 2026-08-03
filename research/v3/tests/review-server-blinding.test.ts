/**
 * Blinding is the instrument's integrity: if the reviewer can tell which side is which, every
 * verdict in the warehouse is contaminated. REVIEW_UI.md §2 — sides shuffled per item by content
 * hash, unblinding key never served.
 *
 * The second suite below is the important one. Absence of the variant id from the payload is not
 * the property that matters; what matters is that the payload does not *determine* the side order.
 * An adversarial verifier broke the first version of this server on exactly that distinction: the
 * shuffle was a pure function of the artwork hash and the two palette hashes, all of which the
 * server serves, so 28 of 60 items could be unblinded with certainty. The salt is the fix and this
 * suite is its regression guard — it replays the attack and asserts it now learns nothing.
 */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { after, before, describe, it } from "node:test"
import { hashPalette, type PaletteSnapshot } from "../src/warehouse/records.ts"
import { blindItem } from "../src/review-server/blinding.ts"
import { seedDemoBatch } from "../src/review-server/server.ts"
import { readJsonl } from "../src/review-server/store.ts"
import { call, makeBatch, makeVariedBatch, startHarness, type Harness } from "../src/review-server/test-support.ts"
import type { StoredBatch } from "../src/review-server/types.ts"

const SECRETS = [
	"VARIANT-LEFT-SECRET",
	"VARIANT-RIGHT-SECRET",
	"FINGERPRINT-VERSION-0-SECRET",
	"FINGERPRINT-VERSION-1-SECRET",
]

describe("review server blinding", () => {
	let harness: Harness

	after(async () => {
		await harness?.stop()
	})

	it("never serves the unblinding key, the variant ids, or the fingerprints", async () => {
		harness = await startHarness()
		assert.equal((await call(harness.base, "POST", "/api/batches", makeBatch("blind-batch", 12))).status, 201)
		const stored = (await readJsonl<StoredBatch>(harness.batchLogPath))[0]
		assert.match(stored.blindingSalt, /^[0-9a-f]{64}$/u, "a batch must be salted")

		const served: string[] = []
		for (const path of [
			"/",
			"/index.html",
			"/app.js",
			"/styles.css",
			// The pages added after the skeleton go through the same sweep — every one of them renders
			// palettes, and any of them could leak by accident.
			"/mock.js",
			"/composer.js",
			"/calibration",
			"/calibration.js",
			"/amend",
			"/amend.js",
			"/api/queue",
			"/api/batches/blind-batch",
			// The composer's own endpoints, on a blinded item: the artwork's colours, one sampled pixel.
			"/api/batches/blind-batch/items/item-0/colors",
			"/api/batches/blind-batch/items/item-0/pixel?x=0.5&y=0.5",
		]) {
			const response = await call(harness.base, "GET", path)
			assert.equal(response.status, 200, `${path} should serve`)
			served.push(typeof response.body === "string" ? response.body : JSON.stringify(response.body))
		}
		// A composed-palette preview, which renders through the same code a judged side does.
		const shown = (await call(harness.base, "GET", "/api/batches/blind-batch")).body.items[0].sides.A
		const preview = await call(harness.base, "POST", "/api/batches/blind-batch/items/item-0/preview", {
			palette: {
				...Object.fromEntries(shown.roles.map((role: any) => [role.role, role.hex])),
				gradient: null,
				surfaceCollapsed: false,
				accentCollapsed: false,
			},
		})
		assert.equal(preview.status, 200)
		served.push(JSON.stringify(preview.body))
		// The artwork bytes go through the same server; read them as text so a leaked id would show.
		const media = await fetch(`${harness.base}/media/blind-batch/item-0`)
		assert.equal(media.status, 200)
		served.push(Buffer.from(await media.arrayBuffer()).toString("latin1"))

		for (const payload of served) {
			for (const secret of [...SECRETS, stored.blindingSalt]) {
				assert.ok(!payload.includes(secret), `a served payload leaked ${secret}`)
			}
			// The key's own field names would also be a leak.
			assert.ok(!payload.includes("blinding"), "a served payload mentions the blinding key")
			assert.ok(!payload.includes("variantId"), "a served payload mentions variant ids")
		}
	})

	it("shuffles per item — both orders occur across a batch", async () => {
		const stored = (await readJsonl<StoredBatch>(harness.batchLogPath))[0]
		const orders = new Set(stored.items.map((item) => `${item.blinding.A}${item.blinding.B}`))
		assert.deepEqual([...orders].sort(), ["01", "10"], "a 12-item batch should land on both side orders")
	})

	it("reproduces the same shuffle after a restart, from the persisted salt", async () => {
		const before_ = await call(harness.base, "GET", "/api/batches/blind-batch")
		const backgroundsBefore = before_.body.items.map((item: any) => item.sides.A.roles[0].hex)

		harness = await harness.restart()

		const after_ = await call(harness.base, "GET", "/api/batches/blind-batch")
		const backgroundsAfter = after_.body.items.map((item: any) => item.sides.A.roles[0].hex)
		assert.deepEqual(backgroundsAfter, backgroundsBefore, "the same item blinded differently after a restart")

		// With the salt in hand the shuffle is exactly reproducible — that is what makes it auditable.
		const stored = (await readJsonl<StoredBatch>(harness.batchLogPath))[0]
		for (const item of stored.items) {
			assert.deepEqual(blindItem(stored.blindingSalt, item.artwork.sha256, item.paletteHashes), item.blinding)
		}
	})

	it("refuses to blind without a salt", () => {
		assert.throws(() => blindItem("", "a".repeat(64), ["b".repeat(64), "c".repeat(64)]), /salt/u)
	})

	it("blinds identical content differently under a different salt", async () => {
		assert.equal((await call(harness.base, "POST", "/api/batches", makeVariedBatch("salt-batch-1", 40))).status, 201)
		assert.equal((await call(harness.base, "POST", "/api/batches", makeVariedBatch("salt-batch-2", 40))).status, 201)

		const log = await readJsonl<StoredBatch>(harness.batchLogPath)
		const one = log.find((entry) => entry.batch.batchId === "salt-batch-1")!
		const two = log.find((entry) => entry.batch.batchId === "salt-batch-2")!
		assert.notEqual(one.blindingSalt, two.blindingSalt)
		assert.deepEqual(
			one.items.map((item) => item.paletteHashes),
			two.items.map((item) => item.paletteHashes),
			"the two batches should carry identical content",
		)
		// Same items, same hashes, different salt: over 40 items the shuffles must not agree everywhere.
		const differing = one.items.filter((item, index) => item.blinding.A !== two.items[index].blinding.A).length
		assert.ok(differing > 0, "the shuffle did not move when the salt changed — is the salt being used?")
	})
})

/* -------------------------------------------------------------------------- */

/** The palette snapshot an attacker rebuilds from one served side. */
function reconstruct(side: any): PaletteSnapshot {
	const roles = Object.fromEntries(side.roles.map((role: any) => [role.role, role.hex]))
	return {
		background: roles.background,
		surface: roles.surface,
		foreground: roles.foreground,
		accent: roles.accent,
		gradient:
			side.gradient === null
				? null
				: { stops: side.gradient.stops.map((stop: any) => ({ color: stop.hex, position: stop.publishedPosition })) },
		surfaceCollapsed: side.surfaceCollapsed,
		accentCollapsed: side.accentCollapsed,
	}
}

/** The unsalted digest the first version of this server used — the attacker's model. */
function unsaltedSwap(imageSha256: string, first: string, second: string): boolean {
	const digest = createHash("sha256").update([imageSha256, first, second].join(" ")).digest("hex")
	return Number.parseInt(digest.slice(0, 2), 16) % 2 === 1
}

type Attempt = Readonly<{ guess: 0 | 1 | null; refuted: boolean }>

/**
 * One item's attack. The attacker holds both palettes (they are on screen) but not which pushed
 * index each one was, so they test both orders for self-consistency.
 */
function attackItem(imageSha256: string, hashA: string, hashB: string): Attempt {
	// "pushed order was (A,B)" implies no swap; "pushed order was (B,A)" implies a swap.
	const straight = unsaltedSwap(imageSha256, hashA, hashB) === false
	const swapped = unsaltedSwap(imageSha256, hashB, hashA) === true
	if (straight && !swapped) return { guess: 0, refuted: false }
	if (!straight && swapped) return { guess: 1, refuted: false }
	// Neither order explains the data: impossible against an unsalted server, where the true order
	// always reproduces itself. Seeing this tells the attacker their model is wrong.
	if (!straight && !swapped) return { guess: null, refuted: true }
	return { guess: null, refuted: false }
}

function score(attempts: ReadonlyArray<{ attempt: Attempt; truth: 0 | 1 }>) {
	const refuted = attempts.filter((entry) => entry.attempt.refuted).length
	const unique = attempts.filter((entry) => entry.attempt.guess !== null).length
	const correct = attempts.filter((entry) => entry.attempt.guess === entry.truth).length
	return {
		items: attempts.length,
		refuted,
		unique,
		correct,
		/** What a rational attacker keeps: nothing at all, once their model has been contradicted. */
		certain: refuted > 0 ? 0 : unique,
	}
}

describe("blinding is not derivable from served data", () => {
	let harness: Harness
	const attempts: Array<{ attempt: Attempt; truth: 0 | 1 }> = []

	before(async () => {
		harness = await startHarness()
		await seedDemoBatch(harness.handle.service)
		assert.equal((await call(harness.base, "POST", "/api/batches", makeVariedBatch("attack-batch", 40))).status, 201)

		const log = await readJsonl<StoredBatch>(harness.batchLogPath)
		for (const batchId of ["demo-batch-0001", "attack-batch"]) {
			const stored = log.find((entry) => entry.batch.batchId === batchId)!
			const payload = await call(harness.base, "GET", `/api/batches/${batchId}`)
			for (const [index, item] of payload.body.items.entries()) {
				const hashA = hashPalette(reconstruct(item.sides.A))
				const hashB = hashPalette(reconstruct(item.sides.B))
				// The attack only means anything if the reconstruction is exact: assert the attacker
				// really did rebuild the server's own palette hashes out of browser-visible JSON.
				assert.deepEqual([hashA, hashB].sort(), [...stored.items[index].paletteHashes].sort())
				attempts.push({
					attempt: attackItem(item.artwork.sha256, hashA, hashB),
					truth: stored.items[index].blinding.A,
				})
			}
		}
	})

	after(async () => {
		await harness?.stop()
	})

	it("the attack that broke the unsalted server now determines nothing", () => {
		const result = score(attempts)
		assert.equal(result.items, 43, "the demo batch plus a 40-item batch")
		// Over 43 items the odds of no contradiction turning up by chance are 0.75^43 ≈ 3e-6.
		assert.ok(result.refuted > 0, "no item contradicted the content-only model — is the salt in the digest?")
		assert.equal(result.certain, 0, "a served payload uniquely determined the side order")
	})

	it("the same attack does break an unsalted shuffle — the test has teeth", async () => {
		const log = await readJsonl<StoredBatch>(harness.batchLogPath)
		const stored = log.find((entry) => entry.batch.batchId === "attack-batch")!
		const control: Array<{ attempt: Attempt; truth: 0 | 1 }> = []
		for (const item of stored.items) {
			// What this server would have published without a salt.
			const truth: 0 | 1 = unsaltedSwap(item.artwork.sha256, item.paletteHashes[0], item.paletteHashes[1]) ? 1 : 0
			const shownA = item.paletteHashes[truth]
			const shownB = item.paletteHashes[truth === 0 ? 1 : 0]
			control.push({ attempt: attackItem(item.artwork.sha256, shownA, shownB), truth })
		}
		const result = score(control)
		assert.equal(result.refuted, 0, "an unsalted shuffle can never contradict the attacker's model")
		assert.ok(result.certain > 0, "the attack should unblind a large share of an unsalted batch")
		assert.equal(result.correct, result.unique, "every certain unblinding of an unsalted batch is correct")
	})
})
