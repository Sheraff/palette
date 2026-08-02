/**
 * Helpers for the review-server tests. Not part of the running server.
 *
 * Every test gets its own temporary warehouse and batch log, so tests never touch the reviewer's
 * real data and never depend on each other's writes.
 */
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { WarehouseRecord } from "../warehouse/records.ts"
import { readAll } from "../warehouse/warehouse.ts"
import { createReviewServer, REPO_ROOT, type ReviewServerHandle } from "./server.ts"
import type { PushedBatch } from "./types.ts"

/** Three artworks from the sharded corpus, referenced by absolute path. */
export const TEST_IMAGES = [
	"00/ab67616d00001e02000027594d67b44c00995865.jpg",
	"00/ab67616d00001e0200003a64886c352827bad270.jpg",
	"00/ab67616d00001e02000045168a00c9fa6fcc59da.jpg",
].map((relative) => join(REPO_ROOT, relative))

export type Harness = Readonly<{
	base: string
	handle: ReviewServerHandle
	warehousePath: string
	batchLogPath: string
	records(): WarehouseRecord[]
	stop(): Promise<void>
	/** Close and reopen the server against the same files — the restart-resilience check. */
	restart(): Promise<Harness>
}>

export async function startHarness(directory?: string): Promise<Harness> {
	const root = directory ?? (await mkdtemp(join(tmpdir(), "v3-review-server-")))
	const warehousePath = join(root, "warehouse.jsonl")
	const batchLogPath = join(root, "batches.jsonl")
	const handle = await createReviewServer({ warehousePath, batchLogPath, reviewerId: "test-reviewer" })
	const port = await handle.listen(0)
	return {
		base: `http://127.0.0.1:${port}`,
		handle,
		warehousePath,
		batchLogPath,
		records: () => readAll(warehousePath),
		async stop() {
			await handle.close()
			if (directory === undefined) await rm(root, { recursive: true, force: true })
		},
		async restart() {
			await handle.close()
			return startHarness(root)
		},
	}
}

export async function call(
	base: string,
	method: string,
	path: string,
	body?: unknown,
): Promise<{ status: number; body: any }> {
	const response = await fetch(`${base}${path}`, {
		method,
		headers: body === undefined ? undefined : { "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	})
	const text = await response.text()
	let parsed: unknown = text
	try {
		parsed = JSON.parse(text)
	} catch {
		// A static asset is not JSON; the raw text is what the caller wants.
	}
	return { status: response.status, body: parsed }
}

function hex(index: number, offset: number): string {
	const value = (index * 37 + offset * 91) % 256
	return `#${value.toString(16).padStart(2, "0").repeat(3)}`
}

/**
 * A synthetic batch with distinctive variant ids and fingerprints, so a test can assert that none
 * of them ever reach a served payload.
 */
export function makeBatch(
	batchId: string,
	itemCount: number,
	variantIds: [string, string] = ["VARIANT-LEFT-SECRET", "VARIANT-RIGHT-SECRET"],
): PushedBatch {
	return {
		batchId,
		purpose: "mechanism",
		fundedBy: ["review-server tests"],
		items: Array.from({ length: itemCount }, (_, index) => ({
			itemId: `item-${index}`,
			imagePath: TEST_IMAGES[index % TEST_IMAGES.length],
			sides: [0, 1].map((sideIndex) => ({
				variantId: variantIds[sideIndex],
				fingerprint: {
					algorithmVersion: `FINGERPRINT-VERSION-${sideIndex}-SECRET`,
					preprocessingVersion: "preprocessing-test",
					gitCommit: "0".repeat(40),
					dirty: false,
				},
				palette: {
					background: hex(index, sideIndex),
					surface: hex(index + 1, sideIndex),
					foreground: hex(index + 2, sideIndex),
					accent: hex(index + 3, sideIndex),
					gradient:
						sideIndex === 0
							? null
							: {
									stops: [
										{ color: hex(index, sideIndex), position: 0 },
										{ color: hex(index + 1, sideIndex), position: 1 },
									],
								},
					surfaceCollapsed: false,
					accentCollapsed: false,
				},
			})) as unknown as PushedBatch["items"][number]["sides"],
		})),
	}
}

/**
 * A batch whose palettes all differ and whose gradients sit on varying sides — so no side can be
 * identified by shape, and an unblinding attack has to work on the content hashes. Mirrors the
 * adversarial verifier's generator.
 */
export function makeVariedBatch(batchId: string, itemCount: number): PushedBatch {
	// A tiny LCG: the batch must be varied, and it must be the same varied batch on every run.
	let seed = 12345
	const next = () => {
		seed = (seed * 1103515245 + 12345) % 2147483648
		return seed / 2147483648
	}
	const color = () =>
		`#${[0, 0, 0].map(() => Math.floor(next() * 256).toString(16).padStart(2, "0")).join("")}`
	const palette = (withGradient: boolean) => {
		const background = color()
		const surface = color()
		return {
			background,
			surface,
			foreground: color(),
			accent: color(),
			gradient: withGradient
				? { stops: [{ color: background, position: 0 }, { color: surface, position: 1 }] }
				: null,
			surfaceCollapsed: false,
			accentCollapsed: false,
		}
	}
	return {
		batchId,
		purpose: "arm",
		fundedBy: [],
		items: Array.from({ length: itemCount }, (_, index) => ({
			itemId: `item-${String(index).padStart(3, "0")}`,
			imagePath: TEST_IMAGES[index % TEST_IMAGES.length],
			sides: [0, 1].map((sideIndex) => ({
				variantId: sideIndex === 0 ? "left-variant" : "right-variant",
				fingerprint: {
					algorithmVersion: `algo-${sideIndex}`,
					preprocessingVersion: "pp-1",
					gitCommit: "0".repeat(40),
					dirty: false,
				},
				palette: palette(sideIndex === 0 ? index % 2 === 0 : index % 3 === 0),
			})) as unknown as PushedBatch["items"][number]["sides"],
		})),
	}
}

export const COMPLETE_VERDICT = {
	gradeA: "strong",
	gradeB: "weak",
	preference: "a",
	comment: "side A keeps the artwork's blue; side B goes grey.",
	confound: false,
	confoundNote: "",
} as const
