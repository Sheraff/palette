/**
 * Worker D — independent verification helpers.
 *
 * Nothing here imports sibling pipeline code (`alpha/**`, `tos/**`, `falsifier/**`). Their outputs
 * are the object under test: JSONL run files, JSONL node dumps, and the CLIs, executed as processes.
 * Shared instruments under `research/v3/src/**` are fair game and are imported directly.
 *
 * The image decode below is this file's own — deliberately re-derived from `sharp` rather than
 * borrowed — because "every published colour is an exact triple of this image" is only a check if
 * the decoder that answers it is not the decoder that produced the claim.
 */

import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import sharp from "sharp"

/**
 * Decoder used for the independent re-decode.
 *
 * [INHERITED] — `sharp`, the package the repository pins and the one every candidate decodes with.
 * Verifying exact-triple membership against a *different* decoder would test the decoders, not the
 * pipelines.
 */
export const VERIFY_DECODER = "sharp"

export type Decoded = {
	width: number
	height: number
	/** Every distinct 8-bit triple in the image, as `r<<16|g<<8|b`. */
	triples: Set<number>
	format: string
}

const cache = new Map<string, Decoded>()

/** Independent decode: raw RGB at native resolution, no resampling, alpha dropped after inspection. */
export async function decodeTriples(imagePath: string): Promise<Decoded> {
	const hit = cache.get(imagePath)
	if (hit) return hit
	const image = sharp(imagePath, { limitInputPixels: false })
	const meta = await image.metadata()
	const { data, info } = await image.raw().toBuffer({ resolveWithObject: true })
	const channels = info.channels
	const triples = new Set<number>()
	for (let i = 0; i < data.length; i += channels) {
		triples.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!)
	}
	const decoded: Decoded = {
		width: info.width,
		height: info.height,
		triples,
		format: meta.format ?? "unknown",
	}
	cache.set(imagePath, decoded)
	return decoded
}

export function hexToInt(hex: string): number | null {
	if (!/^#[0-9a-f]{6}$/.test(hex)) return null
	return Number.parseInt(hex.slice(1), 16)
}

export async function sha256File(path: string): Promise<string> {
	return createHash("sha256").update(await readFile(path)).digest("hex")
}

export async function readJsonl<T>(path: string): Promise<T[]> {
	const text = await readFile(path, "utf8")
	return text
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as T)
}

/** Canonical JSON with sorted keys, so a byte compare is a compare of content and not of key order. */
export function canonical(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
	const entries = Object.entries(value as Record<string, unknown>)
		.filter(([, v]) => v !== undefined)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
	return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`
}

/** Every colour a palette publishes, as `label -> hex`. Roles, gradient stops, and the escape. */
export function publishedColors(palette: any): Array<[string, string]> {
	const out: Array<[string, string]> = []
	for (const role of ["background", "surface", "foreground", "accent"] as const) {
		const c = palette?.roles?.[role]
		if (c?.hex) out.push([`roles.${role}`, c.hex])
	}
	const stops = palette?.gradient?.stops
	if (Array.isArray(stops)) {
		stops.forEach((s: any, i: number) => {
			if (s?.color?.hex) out.push([`gradient.stops[${i}]`, s.color.hex])
		})
	}
	return out
}
