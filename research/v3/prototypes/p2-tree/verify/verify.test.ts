/**
 * Worker D — the verification as assertions, so it can be re-run rather than re-read.
 *
 * Depends on the artifacts under `verify/out/` produced by the run commands documented in
 * `check1-determinism.ts` (two `--no-cache` 5-image runs per candidate, plus one `--no-cache`
 * demo-20 run per candidate). Nothing here imports `alpha/**`, `tos/**` or `falsifier/**`.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import sharp from "sharp"
import { scorePalette } from "../../../src/contract/index.ts"
import type { PixelAccessor } from "../../../src/contract/types.ts"
import { canonical, decodeTriples, hexToInt, publishedColors, readJsonl } from "./lib.ts"

const HERE = new URL("./", import.meta.url).pathname
const P2 = new URL("../", import.meta.url).pathname
const PIPELINES = ["alpha", "tos"] as const

const rowsOf = async (p: string) =>
	(await readJsonl<any>(p)).filter((l) => l.kind === "devloop-run-row")

for (const pipeline of PIPELINES) {
	test(`${pipeline}: two --no-cache runs agree on deterministicPart`, async () => {
		const a = await rowsOf(`${HERE}out/${pipeline}-5-run1.jsonl`)
		const b = await rowsOf(`${HERE}out/${pipeline}-5-run2.jsonl`)
		assert.equal(a.length, b.length)
		for (let i = 0; i < a.length; i++) {
			const strip = (r: any) => {
				const { cached, computeMs, ...rest } = r
				return canonical(rest)
			}
			assert.equal(strip(a[i]), strip(b[i]), `row ${i}`)
		}
	})

	test(`${pipeline}: every published colour is an exact triple of its image`, async () => {
		for (const row of await rowsOf(`${HERE}out/${pipeline}-demo20.jsonl`)) {
			assert.equal(row.ok, true)
			const decoded = await decodeTriples(row.imagePath)
			const escape = row.palette.escape?.color ?? null
			for (const [label, hex] of publishedColors(row.palette)) {
				const n = hexToInt(hex)
				assert.notEqual(n, null, `${label} malformed: ${hex}`)
				if (hex === escape) continue
				assert.ok(decoded.triples.has(n!), `${row.imagePath} ${label}=${hex} not in image`)
			}
		}
	})

	test(`${pipeline}: node dump is structurally a tree with exact-triple reprs`, async () => {
		for (const line of await readJsonl<any>(`${P2}${pipeline}/out/demo-20.nodes.jsonl`)) {
			const decoded = await decodeTriples(line.imagePath)
			assert.equal(line.width, decoded.width)
			assert.equal(line.height, decoded.height)
			const byId = new Map<number, any>(line.nodes.map((n: any) => [n.id, n]))
			assert.equal(byId.size, line.nodes.length, "ids not unique")
			let roots = 0
			for (let i = 0; i < line.nodes.length; i++) {
				const n = line.nodes[i]
				if (i > 0) assert.ok(n.id > line.nodes[i - 1].id, "ids not ascending")
				assert.ok(n.areaFraction > 0 && n.areaFraction <= 1, `areaFraction ${n.areaFraction}`)
				assert.ok(decoded.triples.has(hexToInt(n.repr)!), `repr ${n.repr} not in image`)
				const p = byId.get(n.parent)
				if (p === undefined) roots++
				else assert.ok(n.areaFraction <= p.areaFraction + 1e-9, `node ${n.id} bigger than parent`)
			}
			assert.equal(roots, 1, `${line.imagePath}: ${roots} roots`)
		}
	})

	test(`${pipeline}: every demo-20 palette is contract-valid against an independent decode`, async () => {
		for (const row of await rowsOf(`${HERE}out/${pipeline}-demo20.jsonl`)) {
			const { data, info } = await sharp(row.imagePath, { limitInputPixels: false })
				.raw()
				.toBuffer({ resolveWithObject: true })
			const ch = info.channels
			let transparent = 0
			if (ch === 4) for (let i = 3; i < data.length; i += 4) if (data[i]! < 255) transparent++
			const source: PixelAccessor = {
				width: info.width,
				height: info.height,
				getPixel: (x, y) => {
					const i = (y * info.width + x) * ch
					return [data[i]!, data[i + 1]!, data[i + 2]!]
				},
			}
			const { result } = scorePalette(row.palette, {
				source,
				transparency: {
					hasAlphaChannel: ch === 4,
					hasTransparentPixels: transparent > 0,
					transparentFraction: transparent / (info.width * info.height),
				},
				throwOnTransparentInput: false,
			})
			assert.deepEqual(result.violations, [], row.imagePath)
		}
	})
}

test("the endorsed list joins to endorsements.json by sha-256 of the file's bytes", async () => {
	const { default: doc } = await import(`${HERE}../../../data/legacy/endorsements.json`, {
		with: { type: "json" },
	})
	const { createHash } = await import("node:crypto")
	const { readFile } = await import("node:fs/promises")
	const { resolve } = await import("node:path")
	const roots = [resolve(HERE, "../../../../.."), "/Users/Flo/GitHub/palette"]
	const bySha = new Map<string, any>()
	for (const e of (doc as any).entries) bySha.set(e.artwork.contentSha256, e.artwork)
	const shas = [...bySha.keys()].sort()
	for (const i of [0, Math.floor(shas.length / 2), shas.length - 1]) {
		const art = bySha.get(shas[i]!)!
		const found = roots.map((r) => resolve(r, art.imagePath)).find((p) => existsSync(p))
		assert.ok(found, `unresolved: ${art.imagePath}`)
		const bytes = await readFile(found)
		assert.equal(createHash("sha256").update(bytes).digest("hex"), shas[i])
		assert.equal(bytes.byteLength, art.byteCount)
	}
})
