import { readdir, readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

import { imagesRoot } from "../../v2-3/test/corpus.ts"

/**
 * The measurement corpus: every reviewed artwork whose path a batch records, plus the on-panel
 * originals, minus the vetoed artworks and minus the scrambled decoys.
 *
 * `imagesRoot` honours `PALETTE_IMAGES_ROOT`, so the caller decides which checkout is measured; the
 * sweep prints the resolved root, because a run that silently landed on `-scrambled` decoys would
 * report every spatial mechanism in this algorithm as dead (see `research/v2-3/test/corpus.ts`).
 */

const repoRoot: string = resolve(imagesRoot, "..")
const evalDataRoot: string = resolve(
	new URL("../../v2-3-eval/data", import.meta.url).pathname,
)

/** Artworks review has withdrawn from the corpus; excluded from every count in this arm. */
export const VETOED = Object.freeze([
	"06eb2197", "148e0886", "000f9f4b", "0011c1dc",
])

export type CorpusEntry = Readonly<{ image: string; path: string; reviewed: boolean }>

export async function measurementCorpus(): Promise<CorpusEntry[]> {
	const verdicts = (await readFile(resolve(evalDataRoot, "verdicts.jsonl"), "utf8"))
		.split("\n").filter(Boolean).map((line) => JSON.parse(line) as { image?: string })
	const reviewed = new Set(verdicts.map((record) => record.image).filter((image): image is string => Boolean(image)))
	const batchesRoot = resolve(evalDataRoot, "batches")
	const batchFiles = (await readdir(batchesRoot))
		.filter((name) => name.endsWith(".json") && !name.endsWith(".key.json")).sort()
	const paths = new Map<string, string>()
	for (const file of batchFiles) {
		const batch = JSON.parse(await readFile(resolve(batchesRoot, file), "utf8")) as {
			items: readonly { image: string; imagePath: string }[]
		}
		for (const item of batch.items) {
			if (reviewed.has(item.image) && !paths.has(item.image)) paths.set(item.image, item.imagePath)
		}
	}
	const entries = new Map<string, CorpusEntry>()
	for (const [image, path] of [...paths.entries()].sort(([first], [second]) => (first < second ? -1 : 1))) {
		const absolute = resolve(repoRoot, path)
		if (!existsSync(absolute)) continue
		entries.set(image, { image, path: absolute, reviewed: true })
	}
	for (const name of (await readdir(imagesRoot)).sort()) {
		if (!/\.(jpg|jpeg|png|avif)$/iu.test(name) || name.includes("-scrambled.")) continue
		if (entries.has(name)) continue
		entries.set(name, { image: name, path: resolve(imagesRoot, name), reviewed: reviewed.has(name) })
	}
	return [...entries.values()].filter(({ image }) => !VETOED.some((vetoed) => image.includes(vetoed)))
}

export { imagesRoot }
