/**
 * Corpus selection shared by track-I's probes.
 *
 * Charter corpus trap: in a git worktree `images/` checks out holding only the
 * `-scrambled` decoys, whose spatial structure is destroyed. Every probe here reads the
 * artwork through `PALETTE_IMAGES_ROOT` and prints the root it used, so no measurement
 * can silently be a scrambled-corpus artifact.
 *
 * Sets and their stride selection are the same ones `sweep.ts` uses, so a probe row and a
 * sweep row name the same image.
 */
import { readdirSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url))

export const imagesRoot = process.env.PALETTE_IMAGES_ROOT
	? resolve(process.env.PALETTE_IMAGES_ROOT)
	: resolve(repositoryRoot, "images")

const corpusRoot = dirname(imagesRoot)

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"])

const OFF_PANEL_SAMPLE = 30

const OFF_PANEL_WIDE_SAMPLE = 60

/** Off-panel sources named in the track experiment reports; always included. */
const OFF_PANEL_PINNED = [
	"09/ab67616d0000b2730009d178a401f9433fdddff2",
	"03/ab67616d00001e020003e50500c5d762da89643a.jpg",
	"11/ab67616d0000b2730011c0148119c34e2b222b02",
	"05/ab67616d0000b2730005230fae1822525e5a5ff6",
]

export type CorpusEntry = Readonly<{ id: string; path: string }>

function extensionOf(name: string): string {
	return name.slice(name.lastIndexOf(".")).toLowerCase()
}

function baseEntries(scrambled: boolean): CorpusEntry[] {
	return readdirSync(imagesRoot)
		.filter((name) => IMAGE_EXTENSIONS.has(extensionOf(name)))
		.filter((name) => name.includes("-scrambled.") === scrambled)
		.sort()
		.map((name) => ({ id: `images/${name}`, path: resolve(imagesRoot, name) }))
}

function offPanelEntries(sample: number): CorpusEntry[] {
	const directories = readdirSync(corpusRoot)
		.filter((name) => /^[0-9a-f]{2}$/u.test(name))
		.filter((name) => {
			try {
				return statSync(resolve(corpusRoot, name)).isDirectory()
			} catch {
				return false
			}
		})
		.sort()
	const all: string[] = []
	for (const directory of directories) {
		for (const name of readdirSync(resolve(corpusRoot, directory)).sort()) {
			all.push(`${directory}/${name}`)
		}
	}
	if (all.length === 0) return []
	const selected = new Map<string, CorpusEntry>()
	for (const pinned of OFF_PANEL_PINNED) {
		if (all.includes(pinned)) selected.set(pinned, { id: pinned, path: resolve(corpusRoot, pinned) })
	}
	const stride = Math.max(1, Math.floor(all.length / sample))
	for (let index = 0; selected.size < sample && index < all.length; index += stride) {
		const id = all[index]
		selected.set(id, { id, path: resolve(corpusRoot, id) })
	}
	return [...selected.values()].sort((first, second) =>
		first.id < second.id ? -1 : first.id > second.id ? 1 : 0)
}

export function corpusEntries(set: string): CorpusEntry[] {
	if (set === "base") return baseEntries(false)
	if (set === "scrambled") return baseEntries(true)
	if (set === "offpanel") return offPanelEntries(OFF_PANEL_SAMPLE)
	if (set === "offpanel-wide") return offPanelEntries(OFF_PANEL_WIDE_SAMPLE)
	if (set === "base+offpanel") return [...baseEntries(false), ...offPanelEntries(OFF_PANEL_SAMPLE)]
	if (set === "full") return [...baseEntries(false), ...baseEntries(true), ...offPanelEntries(OFF_PANEL_SAMPLE)]
	throw new Error(`unknown --set ${set}`)
}
