import { readdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

import {
	type Batch,
	batchesRoot,
	readJson,
	verdictsPath,
} from "../../v2-3-eval/src/shared.ts"
import { loadVerdicts } from "../../v2-3-eval/src/warehouse.ts"
import { reviewFixtures } from "../../v2-3/test/review-fixtures.ts"
import type { ObjectiveRepairOverrides } from "../../v2-3/src/internal/winner-scoring.ts"

/**
 * The real artwork lives ONLY in the shared checkout: in a git worktree `images/` contains just the
 * `-scrambled` decoys and the hex roots `00/`..`14/` are absent entirely (TRACK_CHARTER.md, "Corpus
 * trap"). Every path below resolves against this literal, and `describeCorpus` prints a guard so a
 * run on decoys can never be mistaken for a run on artwork.
 */
export const SHARED_CHECKOUT = "/Users/Flo/GitHub/palette"

export type CorpusEntry = Readonly<{
	image: string
	path: string
	/** Which of the four strata this entry was drawn from; an entry may belong to several. */
	strata: readonly string[]
	/** Latest verdict for this artwork, or `null` when it carries none. */
	verdict: string | null
}>

/**
 * The measured configurations. Every field is stated explicitly on every label, so a label's
 * meaning does not drift when `OBJECTIVE_REPAIRS`' shipped defaults change.
 *
 * - `or-off` is trunk `9063f6e`: all three repairs at their incumbent value. Verified byte-identical
 *   to a trunk checkout over all 171 images.
 * - `or-t1` / `or-t2` / `or-t3` isolate one repair each.
 * - `or-on` is all three enabled — the label the human review batch compares against `or-off`. It is
 *   NOT the recommended ship; it exists so review can overturn the two OFF recommendations.
 * - `or-ship` is the configuration this arm recommends, which is `or-off` plus the byte-neutral
 *   envelope repair, and is expected to reproduce `or-off` exactly.
 */
export const CONFIGURATIONS: Readonly<Record<string, Required<ObjectiveRepairOverrides>>> = Object.freeze({
	"or-off": {
		envelopeBasis: "coverage-inclusive",
		dominationVocabulary: "declared-guards",
		leximinFallback: "sorted-evidence-levels",
	},
	"or-t1-envelope": {
		envelopeBasis: "coverage-free",
		dominationVocabulary: "declared-guards",
		leximinFallback: "sorted-evidence-levels",
	},
	"or-t2-vocabulary": {
		envelopeBasis: "coverage-inclusive",
		dominationVocabulary: "objective-terms",
		leximinFallback: "sorted-evidence-levels",
	},
	"or-t3-leximin": {
		envelopeBasis: "coverage-inclusive",
		dominationVocabulary: "declared-guards",
		leximinFallback: "retired",
	},
	"or-on": {
		envelopeBasis: "coverage-free",
		dominationVocabulary: "objective-terms",
		leximinFallback: "retired",
	},
	"or-ship": {
		envelopeBasis: "coverage-free",
		dominationVocabulary: "declared-guards",
		leximinFallback: "sorted-evidence-levels",
	},
})

/** Latest verdict per artwork is authoritative (TRACK_CHARTER.md, "Verdict recency"). */
async function verdictCorpus(): Promise<Map<string, { path: string; verdict: string | null }>> {
	const records = await loadVerdicts(verdictsPath)
	const latest = new Map<string, { recordedAt: string; verdict: string | null }>()
	for (const record of records) {
		const seen = latest.get(record.image)
		if (seen === undefined || record.recordedAt > seen.recordedAt) {
			latest.set(record.image, { recordedAt: record.recordedAt, verdict: record.verdict })
		}
	}
	const batchFiles = (await readdir(batchesRoot))
		.filter((name) => name.endsWith(".json") && !name.endsWith(".key.json")).sort()
	const paths = new Map<string, string>()
	for (const file of batchFiles) {
		const batch = await readJson<Batch>(resolve(batchesRoot, file))
		for (const item of batch.items) {
			if (latest.has(item.image) && !paths.has(item.image)) paths.set(item.image, item.imagePath)
		}
	}
	const resolved = new Map<string, { path: string; verdict: string | null }>()
	for (const [image, path] of paths) {
		resolved.set(image, { path: resolve(SHARED_CHECKOUT, path), verdict: latest.get(image)!.verdict })
	}
	return resolved
}

export async function buildCorpus(): Promise<readonly CorpusEntry[]> {
	const strata = new Map<string, Set<string>>()
	const paths = new Map<string, string>()
	const verdicts = new Map<string, string | null>()
	const add = (image: string, path: string, stratum: string, verdict: string | null): void => {
		if (!paths.has(image)) paths.set(image, path)
		if (!strata.has(image)) strata.set(image, new Set())
		strata.get(image)!.add(stratum)
		if (verdict !== null || !verdicts.has(image)) verdicts.set(image, verdict)
	}

	for (const [image, { path, verdict }] of await verdictCorpus()) add(image, path, "verdict", verdict)

	for (const fixture of reviewFixtures) {
		const image = fixture.source.file.slice(fixture.source.file.lastIndexOf("/") + 1)
		add(image, resolve(SHARED_CHECKOUT, fixture.source.file), "fixture", null)
	}

	const imagesRoot = resolve(SHARED_CHECKOUT, "images")
	for (const name of (await readdir(imagesRoot)).sort()) {
		if (name.includes("-scrambled.")) add(name, resolve(imagesRoot, name), "scrambled", null)
	}

	const manifest = resolve(SHARED_CHECKOUT, "research/v2-3-eval/data/offpanel-manifest.txt")
	if (existsSync(manifest)) {
		const { readFile } = await import("node:fs/promises")
		for (const line of (await readFile(manifest, "utf8")).split("\n")) {
			const relative = line.trim()
			if (relative.length === 0) continue
			add(relative.slice(relative.lastIndexOf("/") + 1), resolve(SHARED_CHECKOUT, relative), "off-panel", null)
		}
	}

	const entries = [...paths.entries()].sort(([first], [second]) => (first < second ? -1 : 1))
		.map(([image, path]): CorpusEntry => ({
			image,
			path,
			strata: [...strata.get(image)!].sort(),
			verdict: verdicts.get(image) ?? null,
		}))
	return entries.filter(({ path }) => existsSync(path))
}

export function describeCorpus(entries: readonly CorpusEntry[]): string {
	const counts = new Map<string, number>()
	for (const entry of entries) for (const stratum of entry.strata) counts.set(stratum, (counts.get(stratum) ?? 0) + 1)
	const decoys = entries.filter(({ path }) => path.includes("-scrambled.")).length
	const expectedDecoys = counts.get("scrambled") ?? 0
	return `corpus: ${entries.length} image(s) from ${SHARED_CHECKOUT}; `
		+ [...counts.entries()].sort().map(([name, count]) => `${name}=${count}`).join(" ")
		+ `; scrambled decoys ${decoys}`
		+ (decoys === expectedDecoys ? " (all accounted for as the scrambled stratum)" : " — UNEXPECTED DECOY LEAK")
}
