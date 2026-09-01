/**
 * Deterministic perturbations of a cover.
 *
 * Each arm is a pair of renderings of one source file — a baseline and a perturbed version — that
 * a correct palette system should not be able to tell apart. The files are cached under
 * `data/robustness/cache/` (gitignored) and regenerate byte-identically from the source corpus, so
 * nothing here is an artifact that has to be kept.
 *
 * ## Where these definitions come from
 *
 * v2-3's fragility finding was produced by `research/v2-3-experiments/resolution-pairs/`, which is
 * not in the working tree (it exists only in commit `56506d0`). The two perturbations are
 * reproduced here **from their documented definitions, written fresh** — the point is that v3's
 * number can be read against v2-3's, which requires the same perturbation and not the same code:
 *
 * - **`dither-lsb1`** — v2-3: "decode the 640, add a deterministic ±1 LSB dither, re-extract. The
 *   smallest possible pixel perturbation." Concretely a 2×2 checkerboard, `(x + y) % 2` alternating
 *   `+1` / `-1`, applied to the **blue channel only**, clamped to [0,255]. It left **0 of 114**
 *   v2-3 palettes unchanged.
 * - **`jpeg-q92`** — v2-3: JPEG quality 92 with `chromaSubsampling: "4:4:4"` at the same size,
 *   "compression noise only". This is the arm behind **72.8% agreement**, and it is anchored here
 *   at exactly those settings so the two campaigns' numbers mean the same thing.
 *
 * v2-3's own stated limitation carries over and is worth repeating before anyone quotes a
 * sensitivity from this: *"A different dither would give a different number; the qualitative result
 * (0 of 114 unchanged) is what matters and would not survive being quoted as a precise
 * sensitivity."*
 *
 * ## Why the dither arm has a lossless baseline
 *
 * v2-3 fed decoded pixel buffers straight to its extractor, so its dither baseline was the source
 * file itself. This harness hands candidates a **path**, so the dithered pixels have to be written
 * somewhere — and a ±1 LSB signal does not survive a JPEG round trip. The dither arm therefore
 * compares a PNG of the decoded original against a PNG of the decoded original plus dither. Both
 * sides take the identical encode path and differ only by the one bit under test. Comparing a
 * dithered PNG against the original JPEG would have measured the format change instead, and would
 * have looked like it was working.
 */

import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

import type { PerturbationArm, PerturbationArmName } from "./types.ts"

/**
 * `[INHERITED]` — quality 92 with 4:4:4 chroma is the exact v2-3 re-encode setting
 * (`research/v2-3-experiments/resolution-pairs/perturbation-probe.ts` in commit `56506d0`), kept so
 * v3's re-encode agreement is directly comparable to v2-3's 72.8%.
 */
export const V2_3_REENCODE_QUALITY = 92

/**
 * `[INHERITED]` — v2-3 used 4:4:4 (no chroma subsampling) so that the perturbation was compression
 * noise and not a colour-resolution change. Every JPEG arm here keeps it for the same reason.
 */
export const JPEG_CHROMA_SUBSAMPLING = "4:4:4"

/**
 * `[UNCALIBRATED]` — two lower qualities added below the v2-3 anchor to turn a single point into a
 * gradient. Not measured against anything; they exist so a reader can see whether agreement decays
 * with perturbation size or collapses at the first touch.
 */
export const ADDITIONAL_JPEG_QUALITIES = [85, 75] as const

/**
 * `[INHERITED]` — PNG at maximum compression with no palette quantisation, for the two lossless
 * renderings of the dither arm. `palette: false` matters: an indexed PNG would re-quantise the very
 * pixels the arm perturbs.
 */
export const LOSSLESS_PNG_OPTIONS = { compressionLevel: 9, palette: false, adaptiveFiltering: false } as const

export const PERTURBATION_ARMS: readonly PerturbationArm[] = [
	{
		name: "jpeg-q92",
		kind: "reencode",
		description: `JPEG re-encode at quality ${V2_3_REENCODE_QUALITY}, chroma ${JPEG_CHROMA_SUBSAMPLING}, same size — the v2-3 anchor arm (72.8% agreement).`,
		baseline: "original",
	},
	{
		name: "jpeg-q85",
		kind: "reencode",
		description: `JPEG re-encode at quality 85, chroma ${JPEG_CHROMA_SUBSAMPLING}, same size.`,
		baseline: "original",
	},
	{
		name: "jpeg-q75",
		kind: "reencode",
		description: `JPEG re-encode at quality 75, chroma ${JPEG_CHROMA_SUBSAMPLING}, same size.`,
		baseline: "original",
	},
	{
		name: "dither-lsb1",
		kind: "dither",
		description:
			"±1 LSB checkerboard on the blue channel only, both sides written as lossless PNG — v2-3's smallest possible pixel perturbation (0 of 114 palettes survived it).",
		baseline: "lossless",
	},
]

export function armByName(name: PerturbationArmName): PerturbationArm {
	const arm = PERTURBATION_ARMS.find((a) => a.name === name)
	if (!arm) throw new Error(`unknown perturbation arm: ${name}`)
	return arm
}

export function jpegQualityOf(name: PerturbationArmName): number {
	const match = /^jpeg-q(\d+)$/.exec(name)
	if (!match) throw new Error(`not a JPEG arm: ${name}`)
	return Number(match[1])
}

/**
 * The ±1 LSB checkerboard, in place, on the blue channel of an interleaved 8-bit buffer.
 *
 * Pure and synchronous so it can be tested on a hand-written buffer rather than through sharp.
 * `channels` is 3 for RGB and 4 for RGBA; the alpha channel is never touched, and neither is red
 * or green — the asymmetry is v2-3's, kept deliberately.
 */
export function ditherBlueChannelLsb(data: Uint8Array, width: number, channels: number): Uint8Array {
	if (channels < 3) throw new Error(`dither needs at least 3 channels, got ${channels}`)
	const pixels = data.length / channels
	if (!Number.isInteger(pixels)) throw new Error("buffer length is not a whole number of pixels")
	for (let pixel = 0; pixel < pixels; pixel++) {
		const x = pixel % width
		const y = Math.floor(pixel / width)
		const delta = (x + y) % 2 === 0 ? 1 : -1
		const index = pixel * channels + 2
		data[index] = Math.max(0, Math.min(255, data[index]! + delta))
	}
	return data
}

/** Short, stable, collision-free enough for a cache directory: the source hash plus the arm. */
export function cacheKey(sourceSha256: string, arm: PerturbationArmName, side: "baseline" | "perturbed"): string {
	return `${sourceSha256.slice(0, 16)}.${arm}.${side}`
}

export function cachePathFor(
	cacheDir: string,
	sourceSha256: string,
	arm: PerturbationArm,
	side: "baseline" | "perturbed",
): string {
	const extension = arm.kind === "reencode" && side === "perturbed" ? "jpg" : arm.baseline === "lossless" ? "png" : "src"
	return path.join(cacheDir, arm.name, `${cacheKey(sourceSha256, arm.name, side)}.${extension}`)
}

export type MaterializedArm = {
	arm: PerturbationArm
	baselinePath: string
	perturbedPath: string
	baselineSha256: string
	perturbedSha256: string
	regenerated: boolean
}

async function writeIfAbsent(target: string, produce: () => Promise<Buffer>, force: boolean): Promise<{ sha256: string; wrote: boolean }> {
	if (!force) {
		try {
			const existing = await readFile(target)
			return { sha256: createHash("sha256").update(existing).digest("hex"), wrote: false }
		} catch {
			// fall through and generate
		}
	}
	const buffer = await produce()
	await mkdir(path.dirname(target), { recursive: true })
	await writeFile(target, buffer)
	return { sha256: createHash("sha256").update(buffer).digest("hex"), wrote: true }
}

/**
 * Produce (or reuse) the two files for one arm of one cover.
 *
 * For the JPEG arms the baseline is the source file itself — nothing is written, and the returned
 * `baselinePath` is the corpus path. For the dither arm both sides are generated PNGs.
 */
export async function materializeArm(
	sourceAbsolutePath: string,
	sourceSha256: string,
	arm: PerturbationArm,
	cacheDir: string,
	force = false,
): Promise<MaterializedArm> {
	if (arm.kind === "reencode") {
		const quality = jpegQualityOf(arm.name)
		const perturbedPath = cachePathFor(cacheDir, sourceSha256, arm, "perturbed")
		const perturbed = await writeIfAbsent(
			perturbedPath,
			async () =>
				await sharp(sourceAbsolutePath)
					.jpeg({ quality, chromaSubsampling: JPEG_CHROMA_SUBSAMPLING })
					.toBuffer(),
			force,
		)
		return {
			arm,
			baselinePath: sourceAbsolutePath,
			perturbedPath,
			baselineSha256: sourceSha256,
			perturbedSha256: perturbed.sha256,
			regenerated: perturbed.wrote,
		}
	}

	// dither: both sides are lossless PNGs off the same decode.
	const baselinePath = cachePathFor(cacheDir, sourceSha256, arm, "baseline")
	const perturbedPath = cachePathFor(cacheDir, sourceSha256, arm, "perturbed")
	const decode = async () => await sharp(sourceAbsolutePath).raw().toBuffer({ resolveWithObject: true })

	const baseline = await writeIfAbsent(
		baselinePath,
		async () => {
			const { data, info } = await decode()
			return await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
				.png(LOSSLESS_PNG_OPTIONS)
				.toBuffer()
		},
		force,
	)
	const perturbed = await writeIfAbsent(
		perturbedPath,
		async () => {
			const { data, info } = await decode()
			const dithered = ditherBlueChannelLsb(new Uint8Array(data), info.width, info.channels)
			return await sharp(Buffer.from(dithered), {
				raw: { width: info.width, height: info.height, channels: info.channels },
			})
				.png(LOSSLESS_PNG_OPTIONS)
				.toBuffer()
		},
		force,
	)
	return {
		arm,
		baselinePath,
		perturbedPath,
		baselineSha256: baseline.sha256,
		perturbedSha256: perturbed.sha256,
		regenerated: baseline.wrote || perturbed.wrote,
	}
}
