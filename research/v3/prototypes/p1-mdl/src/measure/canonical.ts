/**
 * Canonical serialisation — how "the same file gives a byte-identical measurement" is *checked*.
 *
 * Determinism in this layer is structural (integer moments, canonical sorts, no RNG, no clock, no
 * hash-order iteration), but a structural claim still needs an instrument. This is it: one function
 * that turns a `Measurement` into a string with object keys in sorted order and typed arrays written
 * as plain arrays, so two runs can be compared byte for byte.
 *
 * Numbers go through `JSON.stringify`'s own formatting, which is the shortest round-tripping decimal
 * for a double and therefore a function of the bits alone.
 */

import { createHash } from "node:crypto"

function isTypedArray(value: unknown): value is { length: number; [index: number]: number } {
	return ArrayBuffer.isView(value) && !(value instanceof DataView)
}

function canonicalise(value: unknown): unknown {
	if (isTypedArray(value)) return Array.from(value as unknown as ArrayLike<number>)
	if (Array.isArray(value)) return value.map(canonicalise)
	if (value !== null && typeof value === "object") {
		const source = value as Record<string, unknown>
		const result: Record<string, unknown> = {}
		for (const key of Object.keys(source).sort()) {
			// A function on the object — `GridMoments.moment` is the only one this layer produces — is
			// not state and is dropped rather than serialised as null.
			if (typeof source[key] === "function") continue
			result[key] = canonicalise(source[key])
		}
		return result
	}
	return value
}

/** Deterministic JSON with sorted keys. Two runs over the same file must produce the same string. */
export function canonicalJson(value: unknown): string {
	return JSON.stringify(canonicalise(value))
}

/** SHA-256 of `canonicalJson`, for comparing large measurements without holding two of them as text. */
export function canonicalDigest(value: unknown): string {
	return createHash("sha256").update(canonicalJson(value)).digest("hex")
}
