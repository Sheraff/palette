/** Prove that the shipped OFF value reproduces trunk exactly, over the whole sweep corpus. */
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { createHash } from "node:crypto"

const here = new URL(".", import.meta.url).pathname
const resultsRoot = resolve(here, "../../../..", "research/v2-3-eval/data/results")
const [a, b] = process.argv.slice(2)

let compared = 0, identical = 0
const differing: string[] = []
for (const f of readdirSync(resolve(resultsRoot, a))) {
	if (!f.endsWith(".json")) continue
	const pb = resolve(resultsRoot, b, f)
	if (!existsSync(pb)) continue
	compared++
	const ea = JSON.stringify(JSON.parse(readFileSync(resolve(resultsRoot, a, f), "utf8")).extraction)
	const eb = JSON.stringify(JSON.parse(readFileSync(pb, "utf8")).extraction)
	if (createHash("sha256").update(ea).digest("hex") === createHash("sha256").update(eb).digest("hex")) identical++
	else differing.push(f.replace(/\.json$/, ""))
}
console.log(`${a} vs ${b}: ${identical}/${compared} extractions byte-identical (full extraction JSON sha256)`)
if (differing.length) console.log(`DIFFERING (${differing.length}): ${differing.join(", ")}`)
