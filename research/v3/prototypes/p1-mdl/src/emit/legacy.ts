/**
 * # The legacy fixtures, as three tiers that never touch
 *
 * `research/v3/data/legacy/` holds three files distilled from the v2-3 verdict warehouse:
 * `endorsements.json` (351), `acceptable.json` (166), `known-bad.json` (37). `DESIGN.md` §M1 makes
 * them the falsifier's input: *"score legacy fixtures (351 endorsed / 166 acceptable / 37 known-bad,
 * three tiers never concatenated) with both energies; paired same-artwork comparisons"*.
 *
 * ## Why "never concatenated" is enforced by the shape of this module
 *
 * There is no function here that returns all entries in one array, and that omission is the point.
 * The three tiers are three *different* epistemic objects and the README is explicit about it:
 * endorsements are reviewer corrections and `strong` grades, acceptable is a **not-rejected
 * baseline** and *"explicitly not endorsements"*, known-bad is a **hard gate**. A pooled list would
 * make the second silently endorse and the third silently pass.
 *
 * **And the tiers share artworks.** Measured on the files as they stand (`tests/emit/legacy.test.ts`
 * asserts these numbers so they cannot rot):
 *
 * - by `entryId`: **zero** overlap anywhere. Every entry belongs to exactly one tier, exactly as the
 *   README's membership rule promises.
 * - by **artwork**: endorsed ∩ acceptable = **69** artworks, endorsed ∩ known-bad = **22**,
 *   acceptable ∩ known-bad = **9**, all three = **9**. Twenty-two distinct artworks appear in both a
 *   good tier and the known-bad tier.
 *
 * That is not a contradiction — a *palette* is graded, not an artwork, and the same cover can have a
 * palette the reviewer endorsed and another they rejected. It is precisely why a paired,
 * same-artwork comparison (`DESIGN.md` M1's pre-registered reading) is the right instrument and a
 * pooled list is not: pooling would put an endorsed and a rejected palette for the same cover into
 * one undifferentiated bag and lose the only comparison that controls for the artwork.
 *
 * ## What is *not* reconstructible from these files
 *
 * The entries are v2-3 contract objects. Three gaps matter to P1:
 *
 * 1. **`gradient` is a boolean, not stops.** v2-3 published `background → midpoint@0.5 → surface`.
 *    `meta.gradientAdvisory` says gradient comparison against v3 is *advisory only*. So
 *    `toConfiguration()` reconstructs stops from that convention and **says it did**
 *    (`notes: ["gradient-reconstructed-from-v2-3-convention"]`); nothing downstream may treat a
 *    reconstructed ramp as evidence about stops.
 * 2. **93 endorsement entries are `roles-only`** and 3 are `partial` (three roles, no accent) —
 *    reviewer corrections carry the colours the reviewer chose and nothing else. They have no
 *    collapse flags and no gradient, so they cannot become a complete `Configuration`.
 * 3. **No escape.** v2-3 had no escape concept, so `escape` is `null` on every entry. Absence of a
 *    declaration here is absence of the *concept*, not a claim that no escape was taken.
 *
 * Everything a P1 module needs to know it is holding legacy data travels on the entry: `tier`,
 * `completeness`, and `notes` from the conversion.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import { LEGACY_DATA_DIR, resolveCorpusPath } from "./paths.ts"
import type { Configuration, ConfigurationStop } from "./types.ts"

// ---------------------------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------------------------

/**
 * The three tiers, by the name this prototype uses for them.
 *
 * `[INHERITED]` — the filenames and the meaning of each tier come from
 * `research/v3/data/legacy/README.md`, which is `PHASE_0_DECISIONS.md` §5's distillation. `endorsed`
 * rather than `endorsements` because the tier labels an entry, not a file.
 */
export const LEGACY_TIERS = ["endorsed", "acceptable", "known-bad"] as const

export type LegacyTier = (typeof LEGACY_TIERS)[number]

/** Which file each tier lives in. */
export const LEGACY_TIER_FILES: Readonly<Record<LegacyTier, string>> = {
	endorsed: "endorsements.json",
	acceptable: "acceptable.json",
	"known-bad": "known-bad.json",
}

/**
 * What each tier *is*, kept next to the loader so a consumer cannot pick one up without the caveat.
 * Condensed from `data/legacy/README.md`'s table.
 */
export const LEGACY_TIER_EPISTEMOLOGY: Readonly<Record<LegacyTier, string>> = {
	endorsed:
		"reviewer corrections (endorsed-sample) and palettes graded `strong`. A sample from a possibly-multi-valid set, never an oracle.",
	acceptable:
		"palettes graded `acceptable` — a not-rejected baseline tier, explicitly NOT endorsements. Concordance dashboard only, never a gate.",
	"known-bad":
		"palettes graded `weak-fallback` or `unacceptable`. All 37 are hard-gate entries; zero v3 outputs may match one.",
}

// ---------------------------------------------------------------------------------------------
// The shapes actually found in the files
// ---------------------------------------------------------------------------------------------

/** The artwork block, verbatim from the fixture. `absolutePath` is as recorded, not as resolved. */
export type LegacyArtworkRef = Readonly<{
	/** Corpus-relative, e.g. `01/ab67….jpg`. */
	imagePath: string
	/** As recorded when the fixture was distilled. May not exist in this checkout. */
	absolutePath: string
	contentSha256: string
	byteCount: number
	rendition: Readonly<{ format: string; width: number; height: number }>
	imageId: string
}>

/**
 * How complete the recorded palette is. Verbatim the fixture's own `palette.completeness` vocabulary.
 * Counts as they stand: endorsed 255 full / 93 roles-only / 3 partial; acceptable 166 full;
 * known-bad 37 full.
 */
export type LegacyCompleteness = "full" | "roles-only" | "partial"

/**
 * A legacy palette mapped onto P1's configuration vocabulary, with `null` wherever v2-3 did not
 * record the field. **Not** a `Configuration` — see `toConfiguration()` for the conversion and for
 * why it can fail.
 */
export type LegacyConfiguration = Readonly<{
	background: Rgb8 | null
	surface: Rgb8 | null
	foreground: Rgb8 | null
	accent: Rgb8 | null
	/** v2-3's boolean. `null` on roles-only/partial entries, which recorded no field structure. */
	gradient: boolean | null
	/**
	 * v2-3's midpoint colour, pinned at t=0.5. Advisory: `meta.gradientAdvisory` warns that v3 stops
	 * are decoupled from roles, so this is a reconstruction hint and never evidence.
	 */
	midpointAdvisory: Rgb8 | null
	surfaceCollapsed: boolean | null
	accentCollapsed: boolean | null
	/** Always `null`: v2-3 had no escape concept. Absence of the concept, not absence of an escape. */
	escape: null
}>

/** One fixture entry, tier-tagged and path-resolved. */
export type LegacyEntry = Readonly<{
	tier: LegacyTier
	/** Stable within the fixture set; unique across all three tiers (zero collisions, asserted). */
	entryId: string
	/** `grade-strong` / `correction-endorsed-sample` / `grade-acceptable`. Absent on known-bad. */
	kind: string | null
	completeness: LegacyCompleteness
	artwork: LegacyArtworkRef
	configuration: LegacyConfiguration
	/**
	 * Where the source image actually is in *this* checkout, or `null` if it is not on disk.
	 * See `resolveCorpusPath` — the recorded `absolutePath` is tried first, then the corpus roots.
	 */
	resolvedImagePath: string | null
	/** The untouched fixture object, for anything this mapping did not carry across. */
	raw: Readonly<Record<string, unknown>>
}>

/** One tier, loaded. There is deliberately no type that holds more than one tier's entries. */
export type LegacyTierFile = Readonly<{
	tier: LegacyTier
	path: string
	/** The file's `meta` block, untouched. Carries `gradientAdvisory`, `matchSemantics`, `gatePolicy`. */
	meta: Readonly<Record<string, unknown>>
	entries: readonly LegacyEntry[]
}>

// ---------------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------------

function asRgb8(value: unknown): Rgb8 | null {
	if (!Array.isArray(value) || value.length !== 3) return null
	const [r, g, b] = value as unknown[]
	if (typeof r !== "number" || typeof g !== "number" || typeof b !== "number") return null
	return [r, g, b]
}

function roleRgb(roles: unknown, name: string): Rgb8 | null {
	if (roles === null || typeof roles !== "object") return null
	const role = (roles as Record<string, unknown>)[name]
	if (role === null || role === undefined || typeof role !== "object") return null
	return asRgb8((role as Record<string, unknown>).rgb)
}

function asBoolean(value: unknown): boolean | null {
	return typeof value === "boolean" ? value : null
}

/**
 * Load one tier.
 *
 * Synchronous and unmemoised: the three files total ~2 MB of JSON, a falsifier run reads each once,
 * and a cache here would be a place for a stale tier to hide.
 */
export function loadLegacyTier(tier: LegacyTier): LegacyTierFile {
	const path = join(LEGACY_DATA_DIR, LEGACY_TIER_FILES[tier])
	const parsed = JSON.parse(readFileSync(path, "utf8")) as {
		meta?: Record<string, unknown>
		entries?: unknown[]
	}
	const rawEntries = Array.isArray(parsed.entries) ? parsed.entries : []

	const entries = rawEntries.map((value) => {
		const raw = value as Record<string, unknown>
		const artworkRaw = (raw.artwork ?? {}) as Record<string, unknown>
		const paletteRaw = (raw.palette ?? {}) as Record<string, unknown>
		const collapse = (paletteRaw.collapse ?? null) as Record<string, unknown> | null
		const rendition = (artworkRaw.rendition ?? {}) as Record<string, unknown>

		const artwork: LegacyArtworkRef = {
			imagePath: String(artworkRaw.imagePath ?? ""),
			absolutePath: String(artworkRaw.absolutePath ?? ""),
			contentSha256: String(artworkRaw.contentSha256 ?? ""),
			byteCount: Number(artworkRaw.byteCount ?? 0),
			rendition: {
				format: String(rendition.format ?? "unknown"),
				width: Number(rendition.width ?? 0),
				height: Number(rendition.height ?? 0),
			},
			imageId: String(artworkRaw.imageId ?? ""),
		}

		const configuration: LegacyConfiguration = {
			background: roleRgb(paletteRaw.roles, "background"),
			surface: roleRgb(paletteRaw.roles, "surface"),
			foreground: roleRgb(paletteRaw.roles, "foreground"),
			accent: roleRgb(paletteRaw.roles, "accent"),
			gradient: asBoolean(paletteRaw.gradient),
			midpointAdvisory: paletteRaw.midpoint === null || paletteRaw.midpoint === undefined
				? null
				: asRgb8((paletteRaw.midpoint as Record<string, unknown>).rgb),
			// v2-3 named the flags `surface`/`accent`; v3 names them `surfaceCollapsed`/`accentCollapsed`.
			surfaceCollapsed: collapse === null ? null : asBoolean(collapse.surface),
			accentCollapsed: collapse === null ? null : asBoolean(collapse.accent),
			escape: null,
		}

		const entry: LegacyEntry = {
			tier,
			entryId: String(raw.entryId ?? ""),
			kind: typeof raw.kind === "string" ? raw.kind : null,
			completeness: (paletteRaw.completeness ?? "partial") as LegacyCompleteness,
			artwork,
			configuration,
			resolvedImagePath: resolveArtworkPath(artwork),
			raw,
		}
		return entry
	})

	return { tier, path, meta: (parsed.meta ?? {}) as Record<string, unknown>, entries }
}

/**
 * Load all three tiers, **keyed by tier**.
 *
 * The return type is a record and not an array, so the only way to get at an entry is to have named
 * the tier it came from. That is the concatenation guard, expressed in a type rather than a comment.
 */
export function loadLegacyTiers(): Readonly<Record<LegacyTier, LegacyTierFile>> {
	return {
		endorsed: loadLegacyTier("endorsed"),
		acceptable: loadLegacyTier("acceptable"),
		"known-bad": loadLegacyTier("known-bad"),
	}
}

/**
 * Find the source image for an entry in *this* checkout, or `null`.
 *
 * The recorded `absolutePath` is tried first — it is what the distiller saw and is usually right —
 * then the corpus-relative `imagePath` against every root `paths.ts` knows about.
 */
export function resolveArtworkPath(artwork: LegacyArtworkRef): string | null {
	if (artwork.absolutePath !== "") {
		const direct = resolveCorpusPath(artwork.absolutePath)
		if (direct !== null) return direct
	}
	if (artwork.imagePath !== "") return resolveCorpusPath(artwork.imagePath)
	return null
}

// ---------------------------------------------------------------------------------------------
// Legacy entry → Configuration
// ---------------------------------------------------------------------------------------------

export type LegacyConversion =
	| Readonly<{ ok: true; configuration: Configuration; notes: readonly string[] }>
	| Readonly<{ ok: false; reason: string }>

/**
 * The v2-3 midpoint's fixed t. `[INHERITED]` — `meta.gradientAdvisory`: v2-3 *"pin[s] the midpoint
 * at t=0.5"*. Not a P1 choice and not calibratable; it is a fact about the old contract.
 */
export const V2_3_MIDPOINT_POSITION = 0.5

/**
 * Read a legacy entry as a P1 `Configuration`, or say why it cannot be read as one.
 *
 * Fails — rather than filling in a default — whenever v2-3 did not record the field. A default here
 * would be P1 inventing evidence and handing it to its own falsifier, which is the one direction
 * fabrication must never run in.
 *
 * Reconstruction rules, all reported in `notes`:
 * - `gradient: false` → `stops: []`.
 * - `gradient: true`, midpoint present → `[background@0, midpoint@0.5, surface@1]`.
 * - `gradient: true`, no midpoint → `[background@0, surface@1]`.
 *
 * Both ramp cases satisfy the reviewer's endpoint ruling by construction, because v2-3 happened to
 * use the same two colours as its ends. That agreement is a coincidence of the old design, not
 * evidence that v2-3 chose v3-legal stops, and `meta.gradientAdvisory` remains the governing caveat.
 *
 * No legality check happens here. A converted configuration may well be infeasible under the v3
 * contract — that is exactly what M1's falsifier wants to be able to measure, and
 * `feasibility()` is what measures it.
 */
export function toConfiguration(entry: LegacyEntry): LegacyConversion {
	const c = entry.configuration
	const missing: string[] = []
	if (c.background === null) missing.push("background")
	if (c.surface === null) missing.push("surface")
	if (c.foreground === null) missing.push("foreground")
	if (c.accent === null) missing.push("accent")
	if (missing.length > 0) {
		return { ok: false, reason: `roles missing from the v2-3 record: ${missing.join(", ")}` }
	}
	// Re-bound as non-null locals: the four checks above have established it, and the narrowing does
	// not survive the array-building indirection.
	const background = c.background as Rgb8
	const surface = c.surface as Rgb8
	const foreground = c.foreground as Rgb8
	const accent = c.accent as Rgb8

	const { surfaceCollapsed, accentCollapsed, gradient, midpointAdvisory } = c
	if (surfaceCollapsed === null || accentCollapsed === null) {
		return { ok: false, reason: `v2-3 record has no collapse block (completeness: ${entry.completeness})` }
	}
	if (gradient === null) {
		return { ok: false, reason: `v2-3 record has no gradient field (completeness: ${entry.completeness})` }
	}

	const notes: string[] = []
	let stops: ConfigurationStop[] = []
	if (gradient) {
		notes.push("gradient-reconstructed-from-v2-3-convention")
		if (midpointAdvisory === null) {
			stops = [
				{ rgb: background, position: 0 },
				{ rgb: surface, position: 1 },
			]
			notes.push("no-midpoint-recorded-two-stop-ramp")
		} else {
			stops = [
				{ rgb: background, position: 0 },
				{ rgb: midpointAdvisory, position: V2_3_MIDPOINT_POSITION },
				{ rgb: surface, position: 1 },
			]
		}
	}

	return {
		ok: true,
		configuration: {
			background,
			surface,
			foreground,
			accent,
			gradient,
			stops,
			surfaceCollapsed,
			accentCollapsed,
			escape: null,
		},
		notes,
	}
}

// ---------------------------------------------------------------------------------------------
// Census
// ---------------------------------------------------------------------------------------------

export type LegacyTierCensus = Readonly<{
	tier: LegacyTier
	entries: number
	uniqueArtworks: number
	completeness: Readonly<Record<LegacyCompleteness, number>>
	/** Entries whose source image was found on disk in this checkout. */
	imagesFound: number
	imagesMissing: number
	/** Entries that convert to a full `Configuration`. */
	convertible: number
	gradientTrue: number
	gradientFalse: number
	gradientUnrecorded: number
}>

/** Count one tier. Reads nothing but the tier handed to it — no cross-tier arithmetic here. */
export function censusOfTier(file: LegacyTierFile): LegacyTierCensus {
	const completeness: Record<LegacyCompleteness, number> = { full: 0, "roles-only": 0, partial: 0 }
	let imagesFound = 0
	let convertible = 0
	let gradientTrue = 0
	let gradientFalse = 0
	let gradientUnrecorded = 0
	const artworks = new Set<string>()

	for (const entry of file.entries) {
		completeness[entry.completeness] = (completeness[entry.completeness] ?? 0) + 1
		if (entry.resolvedImagePath !== null) imagesFound += 1
		if (toConfiguration(entry).ok) convertible += 1
		if (entry.configuration.gradient === true) gradientTrue += 1
		else if (entry.configuration.gradient === false) gradientFalse += 1
		else gradientUnrecorded += 1
		artworks.add(entry.artwork.imagePath)
	}

	return {
		tier: file.tier,
		entries: file.entries.length,
		uniqueArtworks: artworks.size,
		completeness,
		imagesFound,
		imagesMissing: file.entries.length - imagesFound,
		convertible,
		gradientTrue,
		gradientFalse,
		gradientUnrecorded,
	}
}
