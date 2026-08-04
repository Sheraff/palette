/**
 * Finding the artwork on disk, identifying it, and building the falsifier's **control set**.
 *
 * Three jobs the falsifier cannot do without and that nothing upstream does for it:
 *
 * 1. **Where the pixels are.** The corpus shards (`00/` … `15/`) are gitignored, so a git *worktree*
 *    of this repository does not contain a single artwork — 0 of the 173 endorsed files resolve
 *    under `.worktrees/p2-tree/`, all 173 resolve under the main checkout. Root resolution is
 *    therefore explicit and reported, never assumed. See `NOTES.md`.
 * 2. **Which artwork it is.** `PHASE_0_DECISIONS.md` §1 attaches a palette to the *file*, and every
 *    legacy entry is keyed by `artwork.contentSha256`. Verified 2026-08-04: that field is plain
 *    sha-256 of the file's bytes for 173 of 173 endorsed artworks. The join is on that hash and
 *    never on a filename.
 * 3. **The control set.** "All exact triples of the image whose pixel count clears the area floor"
 *    (`SPEC.md`). Exact triples, native resolution, no resampling, no quantisation.
 */

import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { colorFromRgb } from "../../../src/contract/color.ts"
import type { PaletteColor, Rgb8 } from "../../../src/contract/types.ts"

/** This worktree's `research/v3`, derived from this file's location so cwd never matters. */
export const V3_ROOT = fileURLToPath(new URL("../../..", import.meta.url)).replace(/\/$/, "")

/** This worktree's repository root — where `imagePath` values are *nominally* relative to. */
export const WORKTREE_ROOT = resolve(V3_ROOT, "..", "..")

/**
 * The main checkout's root, read out of the worktree's `.git` pointer file.
 *
 * A linked worktree carries a `.git` *file* whose content is `gitdir: <main>/.git/worktrees/<name>`.
 * Two `dirname` steps off that gives `<main>/.git`, one more gives `<main>`. Returns `null` outside
 * a linked worktree (where `.git` is a directory and `WORKTREE_ROOT` is already the main checkout).
 *
 * This is a *read* of a path, not a git invocation — no subprocess, nothing that could mutate state.
 */
export function mainCheckoutRoot(worktreeRoot: string = WORKTREE_ROOT): string | null {
	const pointer = resolve(worktreeRoot, ".git")
	if (!existsSync(pointer)) return null
	let content: string
	try {
		content = readFileSync(pointer, "utf8")
	} catch {
		return null // `.git` is a directory: this *is* the main checkout.
	}
	const match = /^gitdir:\s*(.+?)\s*$/m.exec(content)
	if (!match) return null
	const gitDir = match[1]!
	// <main>/.git/worktrees/<name>  ->  <main>
	return dirname(dirname(dirname(gitDir)))
}

/**
 * The ordered list of roots an artwork path is tried against.
 *
 * Explicit `--corpus-root` first (a reader asked for it), then this worktree, then the main
 * checkout. Reported verbatim in the run's header so nobody has to guess which one answered.
 */
export function corpusRoots(explicit: string | null): string[] {
	const roots: string[] = []
	if (explicit) roots.push(resolve(explicit))
	roots.push(WORKTREE_ROOT)
	const main = mainCheckoutRoot()
	if (main && main !== WORKTREE_ROOT) roots.push(main)
	return [...new Set(roots)]
}

export type ResolvedImage = Readonly<{
	/** The path exactly as the dump wrote it. */
	given: string
	/** Absolute path that exists on disk. */
	absolute: string
	/** Which entry of {@link corpusRoots} answered, or `"absolute"`. */
	rootUsed: string
}>

/** Resolve a dump's `imagePath` against the roots, in order. `null` when no root has the file. */
export function resolveImagePath(given: string, roots: readonly string[]): ResolvedImage | null {
	if (isAbsolute(given)) {
		return existsSync(given) ? { given, absolute: given, rootUsed: "absolute" } : null
	}
	for (const root of roots) {
		const candidate = resolve(root, given)
		if (existsSync(candidate)) return { given, absolute: candidate, rootUsed: root }
	}
	return null
}

/**
 * sha-256 of the file's bytes — the corpus's artwork identity.
 *
 * Thin reimplementation of `src/adjudication/evidence.ts`'s private `sha256OfFile`, which is not
 * exported. Named here so the source is obvious; the algorithm is one line and cannot drift.
 */
export function contentSha256(absolutePath: string): string {
	return createHash("sha256").update(readFileSync(absolutePath)).digest("hex")
}

/** Raised when an image cannot be decoded under the contract's rules. Never swallowed. */
export class ControlSetError extends Error {}

export type ControlSet = Readonly<{
	width: number
	height: number
	totalPixels: number
	/** Distinct exact triples in the image, before the floor. */
	distinctTriples: number
	/** The floor actually applied, as a fraction of `totalPixels`. */
	areaFloor: number
	/** `ceil(areaFloor * totalPixels)` — the pixel count a triple has to clear. */
	minPixels: number
	/** Triples clearing the floor, ascending by packed RGB so downstream ties break deterministically. */
	colors: readonly PaletteColor[]
	/** Share of the image's pixels the surviving triples account for. */
	coveredPixelFraction: number
}>

/**
 * Build the control set: every exact triple whose pixel count clears the area floor.
 *
 * Native resolution, **no resampling** (`SPEC.md` binding rules; `PHASE_0_DECISIONS.md` §1).
 * Dimensions come from the decoded raster, and the header is read separately only to refuse a file
 * whose header will not state a size at all — `CONVENTIONS.md`: filenames lie, and so, sometimes,
 * do containers.
 *
 * A genuinely transparent pixel is **refused loudly**, never flattened (invariant 5, the same rule
 * `src/devloop/candidates/toy-median-offsets.ts` follows). The caller turns the refusal into a
 * reported error row; it is never a silent skip, because a skipped image is a colour that quietly
 * left the denominator.
 */
export async function controlSetOf(absolutePath: string, areaFloor: number): Promise<ControlSet> {
	if (!(areaFloor > 0) || !(areaFloor <= 1)) {
		throw new ControlSetError(`area floor must be in (0, 1], got ${areaFloor}`)
	}
	const image = sharp(absolutePath)
	const header = await image.metadata()
	if (header.width === undefined || header.height === undefined) {
		throw new ControlSetError(`no header dimensions for ${absolutePath}`)
	}

	const { data, info } = await image.toColourspace("srgb").raw().toBuffer({ resolveWithObject: true })
	const channels = info.channels
	if (channels !== 3 && channels !== 4) {
		throw new ControlSetError(`unsupported channel count ${channels} for ${absolutePath}`)
	}

	const counts = new Map<number, number>()
	for (let offset = 0; offset < data.length; offset += channels) {
		if (channels === 4 && data[offset + 3] !== 255) {
			throw new ControlSetError(
				`${absolutePath} has at least one transparent pixel; the contract refuses transparent input`,
			)
		}
		const packed = (data[offset]! << 16) | (data[offset + 1]! << 8) | data[offset + 2]!
		counts.set(packed, (counts.get(packed) ?? 0) + 1)
	}

	const totalPixels = info.width * info.height
	const minPixels = Math.ceil(areaFloor * totalPixels)
	const kept: number[] = []
	let coveredPixels = 0
	for (const [packed, count] of counts) {
		if (count < minPixels) continue
		kept.push(packed)
		coveredPixels += count
	}
	kept.sort((a, b) => a - b)

	return {
		width: info.width,
		height: info.height,
		totalPixels,
		distinctTriples: counts.size,
		areaFloor,
		minPixels,
		colors: kept.map((packed) => colorFromRgb(unpack(packed))),
		coveredPixelFraction: totalPixels === 0 ? 0 : coveredPixels / totalPixels,
	}
}

function unpack(packed: number): Rgb8 {
	return [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff]
}
