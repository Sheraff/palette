/**
 * Track W verification set.
 *
 * The relative-`resolved` reformulation perturbs EVERY region observation, so the
 * blast radius has to be measured on everything the project can hold an opinion
 * about, not on a target subset:
 *
 *   - the 34 review fixtures (`parity.test.ts`'s frozen set),
 *   - their `-scrambled` decoys (they are legitimate *cases*, just not artworks),
 *   - the off-panel manifest (`research/v2-3-eval/data/offpanel-manifest.txt`),
 *   - every artwork carrying a verdict in the live warehouse, which is where the
 *     acceptance list lives.
 *
 * Artworks are read from the SHARED checkout: in a worktree `images/` and the
 * numbered directories are gitignored and hold only decoys (charter, "Corpus trap").
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"

import { reviewFixtures } from "../../v2-3/test/review-fixtures.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"

const all = new Set<string>()

// 1. the 34 review fixtures
for (const fixture of reviewFixtures) all.add(fixture.source.file)

// 2. their scrambled decoys, plus every other image in images/
for (const file of readdirSync(`${ROOT}/images`)) {
	if (file.startsWith(".")) continue
	all.add(`images/${file}`)
}

// 3. the off-panel manifest
for (const line of readFileSync(`${import.meta.dirname}/../../v2-3-eval/data/offpanel-manifest.txt`, "utf8").split("\n")) {
	const trimmed = line.trim()
	if (trimmed) all.add(trimmed)
}

// 4. every verdict-carrying artwork in the live warehouse
const verdicts = `${ROOT}/research/v2-3-eval/data/verdicts.jsonl`
const seen = new Set<string>()
for (const line of readFileSync(verdicts, "utf8").split("\n")) {
	if (!line.trim()) continue
	const record = JSON.parse(line) as { image: string }
	seen.add(record.image)
}
// verdict records carry a bare image id; locate it under the numbered roots or images/
const roots = readdirSync(ROOT).filter((entry) => /^[0-9a-f]{2}$/.test(entry)).sort()
for (const image of [...seen].sort()) {
	if (existsSync(`${ROOT}/images/${image}`)) {
		all.add(`images/${image}`)
		continue
	}
	for (const root of roots) {
		if (existsSync(`${ROOT}/${root}/${image}`)) {
			all.add(`${root}/${image}`)
			break
		}
	}
}

const ordered = [...all].filter((entry) => existsSync(`${ROOT}/${entry}`)).sort()
writeFileSync(`${import.meta.dirname}/cases.json`, `${JSON.stringify(ordered, null, "\t")}\n`)
console.log(`${ordered.length} cases (${seen.size} verdict-carrying images seen)`)
