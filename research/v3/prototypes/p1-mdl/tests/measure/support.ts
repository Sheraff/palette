/**
 * Test support for the measurement layer: synthetic images built from raw buffers, and the one
 * lookup that finds a real corpus image from a set file.
 *
 * Synthetic images are written as PNG because it is lossless — a JPEG round trip would change the
 * triples the test hand-computed, and the point of these fixtures is that every count and moment in
 * them is known by arithmetic rather than by running the code under test.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises"
import { existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

/** `research/v3/`, from this file's location. */
export const V3_ROOT = fileURLToPath(new URL("../../../../", import.meta.url))

/** A pixel painter: returns the 8-bit triple at (x, y). */
export type Painter = (x: number, y: number) => readonly [number, number, number]

let scratchDirectory: string | null = null

/** A temporary directory shared by every fixture in a test process, removed by `cleanupFixtures`. */
export async function fixtureDirectory(): Promise<string> {
	if (scratchDirectory === null) {
		scratchDirectory = await mkdtemp(join(tmpdir(), "p1-measure-"))
	}
	return scratchDirectory
}

export async function cleanupFixtures(): Promise<void> {
	if (scratchDirectory !== null) {
		await rm(scratchDirectory, { recursive: true, force: true })
		scratchDirectory = null
	}
}

/** Write an RGB PNG whose pixels are exactly what `paint` returns. */
export async function writeRgbImage(
	name: string,
	width: number,
	height: number,
	paint: Painter,
): Promise<string> {
	const raw = Buffer.alloc(width * height * 3)
	let offset = 0
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1, offset += 3) {
			const [red, green, blue] = paint(x, y)
			raw[offset] = red
			raw[offset + 1] = green
			raw[offset + 2] = blue
		}
	}
	const path = join(await fixtureDirectory(), name)
	await sharp(raw, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 0 }).toFile(path)
	return path
}

/** Write an RGBA PNG. `alphaAt` returns 255 for opaque; anything else is what the contract refuses. */
export async function writeRgbaImage(
	name: string,
	width: number,
	height: number,
	paint: Painter,
	alphaAt: (x: number, y: number) => number,
): Promise<string> {
	const raw = Buffer.alloc(width * height * 4)
	let offset = 0
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1, offset += 4) {
			const [red, green, blue] = paint(x, y)
			raw[offset] = red
			raw[offset + 1] = green
			raw[offset + 2] = blue
			raw[offset + 3] = alphaAt(x, y)
		}
	}
	const path = join(await fixtureDirectory(), name)
	await sharp(raw, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 0 }).toFile(path)
	return path
}

/**
 * Resolve the repository root that actually holds the artwork shards.
 *
 * Set files list repository-relative paths (`data/devloop/sets/demo-20.txt`'s own header says so),
 * but the shard directories are git-ignored, so they exist only in the main checkout — a prototype
 * worktree has the code and not the corpus. This walks from the worktree to the checkout that does
 * have the images by reading the worktree's `.git` pointer file, and returns `null` when neither has
 * them so a test can skip with a reason instead of failing for the wrong cause.
 */
export function resolveCorpusRoot(probeRelativePath: string): string | null {
	const worktreeRoot = join(V3_ROOT, "..", "..")
	const candidates = [worktreeRoot]

	const gitPointer = join(worktreeRoot, ".git")
	if (existsSync(gitPointer)) {
		try {
			const contents = readFileSync(gitPointer, "utf8")
			const match = /^gitdir:\s*(.+?)\s*$/m.exec(contents)
			if (match) {
				const marker = match[1].indexOf("/.git/worktrees/")
				if (marker > 0) candidates.push(match[1].slice(0, marker))
			}
		} catch {
			// A `.git` directory rather than a pointer file: this is the main checkout already.
		}
	}

	for (const root of candidates) {
		if (existsSync(join(root, probeRelativePath))) return root
	}
	return null
}

/** The image paths listed in a devloop set file, comments and blanks removed. */
export async function readSetFile(setPath: string): Promise<string[]> {
	const contents = await readFile(setPath, "utf8")
	return contents
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith("#"))
}

/** `research/v3/data/devloop/sets/<name>` */
export function setFilePath(name: string): string {
	return join(V3_ROOT, "data", "devloop", "sets", name)
}

export { dirname }
