// Convert a devloop run JSONL into the adjudication input format.
// Usage: node to-adjudication.mjs <run.jsonl> <out.jsonl>
// The devloop row's `palette` is already the contract shape adjudication reads
// (contractVersion, roles, metadata.inputContentHash, metadata.sourceRendition),
// so the conversion is a wrap plus a drop of errored rows.
import { readFileSync, writeFileSync } from "node:fs"

const [, , inPath, outPath] = process.argv
const rows = readFileSync(inPath, "utf8")
	.trim()
	.split("\n")
	.map((l) => JSON.parse(l))
	.filter((r) => r.kind === "devloop-run-row")

const ok = rows.filter((r) => r.ok && r.palette)
const lines = ok.map((r) => JSON.stringify({ arm: "p3-fields", palette: r.palette }))
writeFileSync(outPath, `${lines.join("\n")}\n`)
console.log(`rows=${rows.length} ok=${ok.length} errored=${rows.length - ok.length} -> ${outPath}`)
