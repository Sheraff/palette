/**
 * Track P probe: build firing-conditioned corpora for the deep pass.
 *
 * Only an artwork on which a constant's mechanism is *live* can change when that constant moves, so
 * a deep pass sized in raw artworks measures mostly nothing. This reads the per-artwork firing
 * fingerprints produced by `extract.ts --per-image` and, for each requested site, emits the artworks
 * where that site fired as a comparison — up to a target of 300 live cases, which is the sizing
 * required before a zero-flip result may be read as robustness rather than as absence of exposure.
 *
 *   probe/sweep.ts --mode fingerprint --corpus data/corpus-full.txt --workers 11
 *   probe/build-firing-corpus.ts --sites 41,88,207 --target 300
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

const trackRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))

const { values } = parseArgs({
	options: {
		fingerprints: { type: "string", default: "data/fingerprints.jsonl" },
		sites: { type: "string" },
		target: { type: "string", default: "300" },
	},
	strict: true,
})

const fingerprintPath = resolve(trackRoot, values.fingerprints!)
if (!existsSync(fingerprintPath)) {
	throw new Error(`no fingerprints at ${fingerprintPath}; run sweep.ts --mode fingerprint first`)
}

const target = Number(values.target)
const requested = values.sites === undefined
	? null
	: new Set(values.sites.split(",").map((token) => Number(token.trim())))

const sites = (JSON.parse(readFileSync(resolve(trackRoot, "data/sites.json"), "utf8")) as {
	sites: { index: number; id: string }[]
}).sites

/** site index -> artworks where that site fired as a comparison. */
const live = new Map<number, string[]>()
let artworks = 0
for (const line of readFileSync(fingerprintPath, "utf8").split("\n")) {
	if (line.trim().length === 0) continue
	const record = JSON.parse(line) as { image?: string; compared?: number[]; error?: string }
	if (!record.image || record.error || !record.compared) continue
	artworks += 1
	for (const site of record.compared) {
		if (requested !== null && !requested.has(site)) continue
		const list = live.get(site) ?? []
		if (list.length < target) list.push(record.image)
		live.set(site, list)
	}
}

mkdirSync(resolve(trackRoot, "data/firing-corpora"), { recursive: true })
const summary: { site: number; id: string; liveCases: number; sufficient: boolean }[] = []
for (const [site, images] of [...live].sort((a, b) => a[0] - b[0])) {
	writeFileSync(resolve(trackRoot, `data/firing-corpora/site-${site}.txt`), `${images.join("\n")}\n`)
	summary.push({
		site, id: sites[site]?.id ?? `#${site}`,
		liveCases: images.length, sufficient: images.length >= target,
	})
}
writeFileSync(resolve(trackRoot, "data/firing-corpora/summary.json"),
	`${JSON.stringify({ schemaVersion: 1, artworksScanned: artworks, target, sites: summary }, null, "\t")}\n`)

process.stdout.write(`scanned ${artworks} artworks\n`)
for (const entry of summary.sort((a, b) => a.liveCases - b.liveCases)) {
	process.stdout.write(`  ${String(entry.liveCases).padStart(4)} live  `
		+ `${entry.sufficient ? "ok      " : "UNDER   "}${entry.id}\n`)
}
