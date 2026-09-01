import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Where the artwork corpus lives.
 *
 * The 34 authoritative artworks are **not** in the repository: `.gitignore` excludes `*.jpg`,
 * `*.png` and `*.avif` and re-includes only `*-scrambled.*`, so a fresh clone or worktree gets the
 * scrambled decoys and nothing else. That is deliberate — the artworks are copyrighted — but it
 * means every consumer of the corpus needs an override, and four tracks independently invented
 * four different ones (`PALETTE_IMAGES_ROOT`, `TRACK_C_IMAGES_ROOT`, `PALETTE_IMAGE_ROOT`, and a
 * hard-coded absolute path).
 *
 * `PALETTE_IMAGES_ROOT` is now the single name. It points at the directory that holds the artwork
 * files — i.e. the replacement for `<repo>/images`. Sibling corpus directories (the `<2-hex>/`
 * sample caches) are resolved relative to its parent.
 *
 * **The decoys are not a substitute.** Scrambling preserves a colour histogram but destroys
 * spatial structure, so field topology, transition traces and endpoint refinement all behave
 * differently on them. A sweep that silently ran on `-scrambled` files will report several
 * load-bearing mechanisms as dead. Always confirm which corpus you measured.
 */
export const imagesRoot: string = process.env.PALETTE_IMAGES_ROOT
	? resolve(process.env.PALETTE_IMAGES_ROOT)
	: resolve(fileURLToPath(new URL("../../..", import.meta.url)), "images")

/** Resolve a repository-relative corpus path such as `images/doja.jpg` or `09/ab6761…`. */
export function corpusPath(relative: string): string {
	return relative.startsWith("images/")
		? resolve(imagesRoot, relative.slice("images/".length))
		: resolve(imagesRoot, "..", relative)
}

/** True for the scrambled diagnostic variants, which are decoys rather than artwork. */
export function isScrambled(name: string): boolean {
	return name.includes("-scrambled.")
}
