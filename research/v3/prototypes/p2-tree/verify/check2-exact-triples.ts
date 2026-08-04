/**
 * Check 2 — the exact-triple invariant, re-derived.
 *
 * Every published role colour, every gradient stop, and every dumped node `repr` must be an exact
 * 8-bit triple present in the image, under this file's own decode. The only sanctioned exception is
 * a declared `escape` (pure white / pure black), which is counted and reported separately rather
 * than excused silently.
 */

import { decodeTriples, hexToInt, publishedColors, readJsonl } from "./lib.ts"

const HERE = new URL("./", import.meta.url).pathname
const P2 = new URL("../", import.meta.url).pathname

type Tally = {
	source: string
	images: number
	checked: number
	violations: number
	malformedHex: number
	escapes: number
	dimensionMismatches: number
	examples: string[]
}

async function checkRun(label: string, path: string): Promise<Tally> {
	const rows = (await readJsonl<any>(path)).filter((l) => l.kind === "devloop-run-row")
	const t: Tally = {
		source: label,
		images: rows.length,
		checked: 0,
		violations: 0,
		malformedHex: 0,
		escapes: 0,
		dimensionMismatches: 0,
		examples: [],
	}
	for (const row of rows) {
		if (!row.ok || row.palette === null) continue
		const decoded = await decodeTriples(row.imagePath)
		const p = row.palette
		if (
			p.metadata.sourceRendition.width !== decoded.width ||
			p.metadata.sourceRendition.height !== decoded.height ||
			p.metadata.processedSize.width !== decoded.width ||
			p.metadata.processedSize.height !== decoded.height
		) {
			t.dimensionMismatches++
		}
		const escapeHex = p.escape?.color ?? null
		if (escapeHex) t.escapes++
		for (const [label2, hex] of publishedColors(p)) {
			t.checked++
			const n = hexToInt(hex)
			if (n === null) {
				t.malformedHex++
				continue
			}
			if (decoded.triples.has(n)) continue
			if (escapeHex !== null && hex === escapeHex) continue // sanctioned non-source colour
			t.violations++
			if (t.examples.length < 5) t.examples.push(`${row.imagePath.split("/").pop()}:${label2}=${hex}`)
		}
	}
	return t
}

async function checkDump(label: string, path: string): Promise<Tally> {
	const lines = await readJsonl<any>(path)
	const t: Tally = {
		source: label,
		images: lines.length,
		checked: 0,
		violations: 0,
		malformedHex: 0,
		escapes: 0,
		dimensionMismatches: 0,
		examples: [],
	}
	for (const line of lines) {
		const decoded = await decodeTriples(line.imagePath)
		if (line.width !== decoded.width || line.height !== decoded.height) t.dimensionMismatches++
		for (const node of line.nodes) {
			t.checked++
			const n = hexToInt(node.repr)
			if (n === null) {
				t.malformedHex++
				continue
			}
			if (!decoded.triples.has(n)) {
				t.violations++
				if (t.examples.length < 5)
					t.examples.push(`${line.imagePath.split("/").pop()}:node${node.id}=${node.repr}`)
			}
		}
	}
	return t
}

const results = [
	await checkRun("run:p2-alpha demo-20", `${HERE}out/alpha-demo20.jsonl`),
	await checkRun("run:p2-tos demo-20", `${HERE}out/tos-demo20.jsonl`),
	await checkDump("dump:alpha demo-20", `${P2}alpha/out/demo-20.nodes.jsonl`),
	await checkDump("dump:tos demo-20", `${P2}tos/out/demo-20.nodes.jsonl`),
]
for (const r of results) console.log(JSON.stringify(r))
