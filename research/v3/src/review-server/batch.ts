/**
 * Batch validation, materialization at push time, and the blinded payload the browser receives.
 *
 * REVIEW_UI.md §1: batches are materialized at push time with code fingerprints on every side of
 * every item, so a verdict is always about the exact palettes shown (content-hashed), never about
 * "trunk" as a moving label.
 *
 * Palettes, fingerprints and artwork identity are the warehouse library's shapes — what is
 * persisted and what is pushed are the same objects, so nothing is translated on the way in.
 */
import { readFile } from "node:fs/promises"
import { basename, dirname, isAbsolute, relative as relative_, resolve as resolvePath } from "node:path"
import sharp from "sharp"
import { hashPalette, type ArtworkIdentity, type CodeFingerprint, type PaletteSnapshot } from "../warehouse/records.ts"
import { blindItem, sha256 } from "./blinding.ts"
import { nameHexes, normalizeHex } from "./color.ts"
import { displayStops, fieldCss } from "./gradient.ts"
import {
	BATCH_PURPOSES,
	ROLES,
	type BatchPurpose,
	type PushedBatch,
	type PushedItem,
	type PushedSide,
	type StoredBatch,
	type StoredItem,
} from "./types.ts"

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/iu
/** Shard directories of the sharded corpus are two lowercase hex digits at the repository root. */
const SHARD_PATTERN = /^[0-9a-f]{2}$/u

/** Stop count bounds from the output contract, PHASE_0_DECISIONS.md §2. [INHERITED] */
export const MIN_GRADIENT_STOPS = 2
export const MAX_GRADIENT_STOPS = 4

export class BadRequest extends Error {}

function require_(condition: unknown, message: string): asserts condition {
	if (!condition) throw new BadRequest(message)
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
	require_(typeof value === "object" && value !== null && !Array.isArray(value), `${what} must be an object`)
	return value as Record<string, unknown>
}

function asId(value: unknown, what: string): string {
	require_(typeof value === "string" && ID_PATTERN.test(value), `${what} must be a filesystem-safe token`)
	return value as string
}

function asString(value: unknown, what: string, maxLength: number): string {
	require_(
		typeof value === "string" && value.length <= maxLength,
		`${what} must be a string of at most ${maxLength} characters`,
	)
	return value as string
}

function normalizeHexOrThrow(value: unknown, what: string): string {
	try {
		return normalizeHex(value)
	} catch (error) {
		throw new BadRequest(`${what}: ${(error as Error).message}`)
	}
}

function parseGradient(value: unknown): PaletteSnapshot["gradient"] {
	if (value === null || value === undefined) return null
	const record = asRecord(value, "gradient")
	const stops = record.stops
	require_(
		Array.isArray(stops) && stops.length >= MIN_GRADIENT_STOPS && stops.length <= MAX_GRADIENT_STOPS,
		`gradient.stops must hold ${MIN_GRADIENT_STOPS}..${MAX_GRADIENT_STOPS} stops`,
	)
	let previous = -Infinity
	const parsed = stops.map((raw, index) => {
		const stop = asRecord(raw, `gradient.stops[${index}]`)
		const color = normalizeHexOrThrow(stop.color, `gradient.stops[${index}].color`)
		const position = stop.position
		require_(
			typeof position === "number" && Number.isFinite(position) && position >= 0 && position <= 1,
			`gradient.stops[${index}].position must be a number in [0,1]`,
		)
		require_(position > previous, "gradient stop positions must be strictly increasing")
		previous = position
		return { color, position }
	})
	// `geometry` is opportunistic (PHASE_0_DECISIONS.md §2): carried through when present, never required.
	const geometry = record.geometry
	if (geometry === undefined || geometry === null) return { stops: parsed }
	return { stops: parsed, geometry: asString(geometry, "gradient.geometry", 64) }
}

function parsePalette(value: unknown): PaletteSnapshot {
	const record = asRecord(value, "palette")
	const roles = Object.fromEntries(ROLES.map((role) => [role, normalizeHexOrThrow(record[role], `palette.${role}`)]))
	const surfaceCollapsed = record.surfaceCollapsed
	const accentCollapsed = record.accentCollapsed
	require_(typeof surfaceCollapsed === "boolean", "palette.surfaceCollapsed must be a boolean")
	require_(typeof accentCollapsed === "boolean", "palette.accentCollapsed must be a boolean")
	// Deliberately NOT checked here: that the collapse flags agree with hex equality, that stops are
	// source pixels, or any other contract invariant. Invariant enforcement belongs to the contract
	// workstream; the review server must be able to render an invalid palette, because showing
	// suspected-bad palettes to the reviewer is exactly what outlier-mining batches are for.
	return {
		background: roles.background,
		surface: roles.surface,
		foreground: roles.foreground,
		accent: roles.accent,
		gradient: parseGradient(record.gradient),
		surfaceCollapsed,
		accentCollapsed,
	}
}

function parseFingerprint(value: unknown): CodeFingerprint {
	const record = asRecord(value, "fingerprint")
	const dirty = record.dirty
	// Required, never defaulted: without it a commit hash silently means two different things.
	require_(typeof dirty === "boolean", "fingerprint.dirty must be a boolean (was the working tree dirty?)")
	return {
		algorithmVersion: asString(record.algorithmVersion, "fingerprint.algorithmVersion", 128),
		preprocessingVersion: asString(record.preprocessingVersion, "fingerprint.preprocessingVersion", 128),
		gitCommit: asString(record.gitCommit, "fingerprint.gitCommit", 128),
		dirty,
	}
}

function parseSide(value: unknown): PushedSide {
	const record = asRecord(value, "side")
	return {
		variantId: asString(record.variantId, "side.variantId", 128),
		palette: parsePalette(record.palette),
		fingerprint: parseFingerprint(record.fingerprint),
	}
}

function parseItem(value: unknown): PushedItem {
	const record = asRecord(value, "item")
	const imagePath = asString(record.imagePath, "item.imagePath", 4096)
	require_(isAbsolute(imagePath), "item.imagePath must be an absolute path")
	const sides = record.sides
	require_(Array.isArray(sides) && sides.length === 2, "item.sides must hold exactly two sides")
	const parsed: [PushedSide, PushedSide] = [parseSide(sides[0]), parseSide(sides[1])]
	require_(parsed[0].variantId !== parsed[1].variantId, "item.sides compares a variant with itself")
	return {
		itemId: asId(record.itemId, "item.itemId"),
		imagePath,
		collection: record.collection === undefined ? undefined : asString(record.collection, "item.collection", 128),
		artworkId:
			record.artworkId === undefined || record.artworkId === null
				? null
				: asString(record.artworkId, "item.artworkId", 256),
		sides: parsed,
	}
}

export function parseBatch(value: unknown): PushedBatch {
	const record = asRecord(value, "batch")
	const purpose = record.purpose
	require_(
		typeof purpose === "string" && (BATCH_PURPOSES as readonly string[]).includes(purpose),
		`batch.purpose must be one of ${BATCH_PURPOSES.join(" | ")}`,
	)
	const fundedBy = record.fundedBy ?? []
	require_(Array.isArray(fundedBy), "batch.fundedBy must be an array of strings")
	const items = record.items
	require_(Array.isArray(items) && items.length >= 1, "batch.items must hold at least one item")
	const parsedItems = items.map(parseItem)
	const seen = new Set<string>()
	for (const item of parsedItems) {
		require_(!seen.has(item.itemId), `batch has two items called ${item.itemId}`)
		seen.add(item.itemId)
	}
	return {
		batchId: asId(record.batchId, "batch.batchId"),
		purpose: purpose as BatchPurpose,
		fundedBy: fundedBy.map((entry, index) => asString(entry, `batch.fundedBy[${index}]`, 512)),
		items: parsedItems,
	}
}

/** True when `candidate` is `root` itself or sits below it, after normalization. */
function isInside(root: string, candidate: string): boolean {
	const relative = relative_(resolvePath(root), resolvePath(candidate))
	return relative.length > 0 && !relative.startsWith("..") && !isAbsolute(relative)
}

/** Which corpus a file belongs to, when the pusher did not say. */
export function deriveCollection(imagePath: string): string {
	if (imagePath.includes("/music-artworks/")) return "music-artworks"
	const parent = basename(dirname(imagePath))
	return SHARD_PATTERN.test(parent) ? "sharded-corpus" : parent
}

/**
 * Read one artwork and build its identity: full path, content hash, and real dimensions from the
 * file header.
 *
 * Dimensions come from `sharp .metadata()`, never from the filename — `music-artworks/` filenames
 * lie, 719 AVIFs disagree with their own header (CONVENTIONS.md). Shared by every mode that serves
 * an artwork, so all of them identify one the same way.
 *
 * `what` names the caller's item in the error messages, which is what makes a bad push diagnosable.
 */
export async function readArtworkIdentity(
	imagePath: string,
	options: Readonly<{
		what: string
		collection?: string
		artworkId?: string | null
		imageRoots?: readonly string[]
	}>,
): Promise<ArtworkIdentity> {
	const imageRoots = options.imageRoots ?? []
	// Push is localhost-only and trusted, but there is no reason for a batch to reach outside the
	// corpus: an allowlist keeps a malformed or hostile push from turning the server into a
	// read-any-file proxy.
	require_(
		imageRoots.length === 0 || imageRoots.some((root) => isInside(root, imagePath)),
		`${options.what}: imagePath must live under ${imageRoots.join(" or ")}`,
	)
	let bytes: Buffer
	try {
		bytes = await readFile(imagePath)
	} catch (error) {
		throw new BadRequest(`${options.what}: cannot read ${imagePath} (${(error as Error).message})`)
	}
	let metadata: sharp.Metadata
	try {
		metadata = await sharp(bytes).metadata()
	} catch (error) {
		throw new BadRequest(`${options.what}: ${imagePath} is not a decodable image (${(error as Error).message})`)
	}
	require_(
		Number.isInteger(metadata.width) && Number.isInteger(metadata.height) && typeof metadata.format === "string",
		`${options.what}: ${imagePath} has no usable image header`,
	)
	return {
		path: imagePath,
		sha256: sha256(bytes),
		rendition: {
			width: metadata.width as number,
			height: metadata.height as number,
			format: metadata.format as string,
			bytes: bytes.byteLength,
			collection: options.collection ?? deriveCollection(imagePath),
			artworkId: options.artworkId ?? null,
		},
	}
}

/**
 * Read every artwork, hash both palettes, blind each item, and name every displayed color.
 */
export async function materialize(
	batch: PushedBatch,
	pushedAt: string,
	blindingSalt: string,
	imageRoots: readonly string[] = [],
): Promise<StoredBatch> {
	const items: StoredItem[] = []
	for (const item of batch.items) {
		const artwork = await readArtworkIdentity(item.imagePath, {
			what: `item ${item.itemId}`,
			collection: item.collection,
			artworkId: item.artworkId,
			imageRoots,
		})
		const paletteHashes: [string, string] = [hashPalette(item.sides[0].palette), hashPalette(item.sides[1].palette)]
		const hexes = item.sides.flatMap((side) => [
			...ROLES.map((role) => side.palette[role]),
			...(side.palette.gradient?.stops.map((stop) => stop.color) ?? []),
		])
		items.push({
			itemId: item.itemId,
			artwork,
			paletteHashes,
			blinding: blindItem(blindingSalt, artwork.sha256, paletteHashes),
			colorNames: nameHexes(hexes),
		})
	}
	return { batch, pushedAt, blindingSalt, items }
}

/**
 * Everything the browser is allowed to see for one side.
 *
 * Deliberately absent: the variant id, the fingerprint (an algorithm version would unblind the
 * pair outright), and the palette hash. Only what is needed to render and judge.
 */
export function blindSidePayload(palette: PaletteSnapshot, colorNames: Record<string, string>) {
	const gradient = palette.gradient
	return {
		roles: ROLES.map((role) => ({
			role,
			hex: palette[role],
			name: colorNames[palette[role]] ?? palette[role],
			collapsed:
				(role === "surface" && palette.surfaceCollapsed === true) ||
				(role === "accent" && palette.accentCollapsed === true),
		})),
		surfaceCollapsed: palette.surfaceCollapsed === true,
		accentCollapsed: palette.accentCollapsed === true,
		gradient: gradient === null ? null : { stops: displayStops(gradient, colorNames) },
		/** The pinned preview renderer's output. The browser pastes this, it does not compose it. */
		fieldCss: fieldCss(gradient, palette.background, colorNames),
	}
}
