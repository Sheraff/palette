import { readdirSync, existsSync } from "node:fs"
import { resolve } from "node:path"

import { imagesRoot } from "../../../v2-3/test/corpus.ts"

/**
 * The gate corpus: 34 reviewed artworks + their 34 scrambled decoys + 37 off-panel artworks
 * drawn deterministically from the `<2-hex>/` sample caches.
 *
 * Every entry is an absolute path. `imagesRoot` honours `PALETTE_IMAGES_ROOT`, so the caller
 * decides which corpus is measured — and the harness prints the resolved root so no report can
 * silently claim artwork numbers that were produced on decoys (charter, "corpus trap").
 */

const hexRootParent: string = resolve(imagesRoot, "..")

function artworkFiles(): string[] {
	return readdirSync(imagesRoot)
		.filter((name) => /\.(jpg|jpeg|png|avif)$/i.test(name))
		.sort()
}

export function panelImages(): string[] {
	return artworkFiles()
		.filter((name) => !name.includes("-scrambled."))
		.map((name) => resolve(imagesRoot, name))
}

export function scrambledImages(): string[] {
	return artworkFiles()
		.filter((name) => name.includes("-scrambled."))
		.map((name) => resolve(imagesRoot, name))
}

/** Deterministic round-robin over the `00/`..`14/` caches so the sample spans every shard. */
export function offPanelImages(count = 37): string[] {
	const shards = Array.from({ length: 15 }, (_, index) => String(index).padStart(2, "0"))
		.map((shard) => resolve(hexRootParent, shard))
		.filter((dir) => existsSync(dir))
		.map((dir) => readdirSync(dir).sort().map((name) => resolve(dir, name)))
	const picked: string[] = []
	for (let depth = 0; picked.length < count; depth += 1) {
		let advanced = false
		for (const shard of shards) {
			if (depth >= shard.length) continue
			advanced = true
			picked.push(shard[depth]!)
			if (picked.length === count) return picked
		}
		if (!advanced) break
	}
	return picked
}

export function gateCorpus(): { label: string; path: string }[] {
	return [
		...panelImages().map((path) => ({ label: `panel:${path.split("/").pop()}`, path })),
		...scrambledImages().map((path) => ({ label: `scrambled:${path.split("/").pop()}`, path })),
		...offPanelImages().map((path) => ({ label: `offpanel:${path.split("/").pop()}`, path })),
	]
}

export { imagesRoot }
