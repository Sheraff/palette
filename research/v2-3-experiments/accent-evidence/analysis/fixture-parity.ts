/**
 * Targeted parity. `research/v2-3/test/parity.test.ts` cannot run inside a git worktree: it reads
 * `images/`, which checks out holding only `-scrambled` decoys (the real artwork is gitignored).
 * This is the equivalent check, and a stricter one — it compares the sha256 of the FULL extraction
 * JSON of every parity fixture, not just the displayed role hexes the parity test freezes.
 *
 *   node --no-warnings --experimental-strip-types .../fixture-parity.ts <labelA> <labelB>
 */
import { readFileSync, existsSync } from "node:fs"
import { createHash } from "node:crypto"
import { resolve } from "node:path"

const here = new URL(".", import.meta.url).pathname
const worktreeRoot = resolve(here, "../../../..")
const resultsRoot = resolve(worktreeRoot, "research/v2-3-eval/data/results")
const corpus = JSON.parse(readFileSync(resolve(here, "corpus.json"), "utf8")) as
	{ image: string; abs: string; group: string }[]

const [a, b] = process.argv.slice(2)
if (!a || !b) throw new Error("usage: fixture-parity.ts <labelA> <labelB>")

const fixtures = corpus.filter(({ group }) => group === "fixture")
let identical = 0
const differing: string[] = []
for (const { image } of fixtures) {
	const pa = resolve(resultsRoot, a, `${image}.json`)
	const pb = resolve(resultsRoot, b, `${image}.json`)
	if (!existsSync(pa) || !existsSync(pb)) { differing.push(`${image} (missing)`); continue }
	const digest = (p: string) => createHash("sha256")
		.update(JSON.stringify(JSON.parse(readFileSync(p, "utf8")).extraction)).digest("hex")
	if (digest(pa) === digest(pb)) identical++
	else differing.push(image)
}
process.stdout.write(`${a} vs ${b}: ${identical}/${fixtures.length} parity fixtures byte-identical\n`)
for (const image of differing) process.stdout.write(`  DIFFERS: ${image}\n`)
