/**
 * The decision corpus: every real published palette we have a reviewer verdict on, reshaped into
 * the v3 contract's object so the contract's *own* distinctness invariant can be run over it.
 *
 * Source is `research/v3/data/legacy/{known-bad,endorsements,acceptable}.json` — the distilled v2-3
 * verdict store. Nothing here reimplements the distinctness matrix; this module only builds the
 * objects `validateDistinctness()` takes.
 *
 * ## Two shaping decisions, both consequential enough to state
 *
 * **Collapse flags are derived from exact hex equality, not copied.** The legacy entries carry
 * `collapse: {surface, accent}` booleans, and on all 458 entries that carry them they agree with
 * exact hex equality of the corresponding role pair — checked, zero mismatches. Deriving rather than
 * copying means the 96 entries with no collapse block get the same treatment as the rest, and it
 * guarantees the flags are invariant-1-consistent, which is the precondition invariant 3's
 * sanctioned-collapse exemption is written against.
 *
 * **Gradients are advisory and live in a separate matrix.** v2-3 did not publish stops: it rendered
 * `linear-gradient(135deg in oklab, background 0%, midpoint 50%, surface 100%)`, so its "stops" are
 * the role colours plus an optional midpoint (`meta.gradientAdvisory` in every legacy file says so,
 * and says v3 stops are decoupled from roles). Reconstructing them is therefore not a reading of
 * what v3 will publish — but it does add the three pair classes v3 will really have (stop×stop,
 * stop×foreground, stop×accent), which is worth pricing. The headline numbers in the report are the
 * **roles** matrix; the reconstructed one is reported alongside, labelled advisory.
 */

import { readFile } from "node:fs/promises"
import type { Palette, PaletteColor, Rgb8 } from "../contract/types.ts"
import { CONTRACT_VERSION, ROLE_NAMES } from "../contract/constants.ts"
// `hex()` rather than a cast: it rejects anything that is not canonical `#rrggbb` lowercase, so a
// legacy entry with a spelling the contract would not accept fails loudly here instead of quietly
// producing a palette whose hex and rgb could disagree.
import { hex as canonicalHex } from "../contract/color.ts"

/** The three legacy fixtures, in the order the report lists them. */
export const LEGACY_FIXTURES = ["known-bad", "endorsements", "acceptable"] as const
export type LegacyFixture = (typeof LEGACY_FIXTURES)[number]

type LegacyColor = { hex: string; rgb: Rgb8; name?: string }

type LegacyEntry = {
	entryId: string
	kind?: string
	artwork?: { imagePath?: string; contentSha256?: string }
	palette: {
		completeness: string
		roles: Partial<Record<string, LegacyColor>>
		gradient: boolean | null
		midpoint: LegacyColor | null
		collapse: { surface: boolean; accent: boolean } | null
	}
	roleSignature?: string
}

export type CorpusPalette = Readonly<{
	fixture: LegacyFixture
	entryId: string
	completeness: string
	imagePath: string | null
	/** Roles only — the matrix the report leads with. */
	rolesOnly: Palette
	/**
	 * Roles plus the reconstructed v2-3 ramp as v3 stops, when the entry declares a gradient.
	 * `null` when it declares none, which is the same thing the contract means by `gradient: null`.
	 */
	withGradient: Palette | null
	/** How many stops the reconstruction carries: 0 (no gradient), 2, or 3. */
	reconstructedStopCount: number
}>

/** The only fields `validateDistinctness` reads; the rest of the contract object is filled to shape. */
function paletteFrom(
	roles: Partial<Record<string, LegacyColor>>,
	stops: readonly LegacyColor[] | null,
): Palette {
	const roleColors: Record<string, PaletteColor | undefined> = {}
	for (const role of ROLE_NAMES) {
		const source = roles[role]
		roleColors[role] = source === undefined ? undefined : { rgb: source.rgb, hex: canonicalHex(source.hex) }
	}
	const background = roles.background
	const surface = roles.surface
	const foreground = roles.foreground
	const accent = roles.accent
	return {
		contractVersion: CONTRACT_VERSION,
		roles: roleColors,
		gradient: stops === null ? null : {
			stops: stops.map((stop, index) => ({
				color: { rgb: stop.rgb, hex: canonicalHex(stop.hex) },
				// Positions are irrelevant to invariant 3 and are filled only so the object is
				// well-formed: first at 0, last at 1, evenly spaced between, which is exactly what
				// v2-3 rendered (midpoint pinned at t = 0.5).
				position: stops.length === 1 ? 0 : index / (stops.length - 1),
			})),
		},
		collapse: {
			// Derived, not copied — see the module comment.
			surfaceCollapsed: surface !== undefined && background !== undefined && surface.hex === background.hex,
			accentCollapsed: accent !== undefined && foreground !== undefined && accent.hex === foreground.hex,
		},
	} as unknown as Palette
}

/**
 * Reconstruct v2-3's rendered ramp as v3 stops: background at t=0, the midpoint at t=0.5 when the
 * entry recorded one, surface at t=1. Returns `null` when the entry declares no gradient, or does
 * not say (the 92 endorsement entries recovered from hex-only records).
 */
function reconstructStops(entry: LegacyEntry): LegacyColor[] | null {
	const palette = entry.palette
	if (palette.gradient !== true) return null
	const background = palette.roles.background
	const surface = palette.roles.surface
	if (background === undefined || surface === undefined) return null
	return palette.midpoint === null ? [background, surface] : [background, palette.midpoint, surface]
}

export type CorpusLoadReport = Readonly<{
	entriesByFixture: Record<string, number>
	total: number
	/** Entries whose four roles are not all present — invariant 1's problem, and skipped pair-wise. */
	incompleteRoleEntries: number
	withReconstructedGradient: number
	threeStopReconstructions: number
	twoStopReconstructions: number
	/** Distinct role signatures, i.e. how many genuinely different palettes the 554 entries are. */
	distinctRoleSignatures: number
	collapseFlagMismatches: number
	/**
	 * The number of role pairs the distinctness matrix should evaluate, counted here *without* the
	 * contract module — six pairs per palette, minus any pair with a missing role, minus the
	 * sanctioned collapses that are exactly equal. `run.ts` checks it against what
	 * `validateDistinctness()` actually enumerated, so a silent change in the exemption logic
	 * cannot pass unnoticed.
	 */
	independentRolePairCount: number
	sanctionedCollapsePairsSkipped: number
}>

export async function loadDecisionCorpus(
	legacyDirectory: string,
): Promise<{ palettes: CorpusPalette[]; report: CorpusLoadReport }> {
	const palettes: CorpusPalette[] = []
	const entriesByFixture: Record<string, number> = {}
	let incompleteRoleEntries = 0
	let withReconstructedGradient = 0
	let threeStopReconstructions = 0
	let twoStopReconstructions = 0
	let collapseFlagMismatches = 0
	let independentRolePairCount = 0
	let sanctionedCollapsePairsSkipped = 0
	const signatures = new Set<string>()

	for (const fixture of LEGACY_FIXTURES) {
		const parsed = JSON.parse(await readFile(`${legacyDirectory}/${fixture}.json`, "utf8")) as {
			entries: LegacyEntry[]
		}
		entriesByFixture[fixture] = parsed.entries.length
		for (const entry of parsed.entries) {
			const roles = entry.palette.roles
			const complete = ROLE_NAMES.every((role) => roles[role] !== undefined)
			if (!complete) incompleteRoleEntries++

			// The derivation check, run rather than asserted once and forgotten.
			const declared = entry.palette.collapse
			if (declared !== null && complete) {
				const surfaceCollapsed = roles.surface!.hex === roles.background!.hex
				const accentCollapsed = roles.accent!.hex === roles.foreground!.hex
				if (declared.surface !== surfaceCollapsed || declared.accent !== accentCollapsed) {
					collapseFlagMismatches++
				}
			}

			// The independent pair count — deliberately written out longhand rather than reusing
			// anything from the contract, so it is a real second opinion on the enumeration.
			for (let i = 0; i < ROLE_NAMES.length; i++) {
				for (let j = i + 1; j < ROLE_NAMES.length; j++) {
					const firstRole = ROLE_NAMES[i]
					const secondRole = ROLE_NAMES[j]
					const first = roles[firstRole]
					const second = roles[secondRole]
					if (first === undefined || second === undefined) continue
					const isSanctioned = (firstRole === "background" && secondRole === "surface") ||
						(firstRole === "surface" && secondRole === "background") ||
						(firstRole === "foreground" && secondRole === "accent") ||
						(firstRole === "accent" && secondRole === "foreground")
					if (isSanctioned && first.hex === second.hex) {
						sanctionedCollapsePairsSkipped++
						continue
					}
					independentRolePairCount++
				}
			}

			const stops = reconstructStops(entry)
			if (stops !== null) {
				withReconstructedGradient++
				if (stops.length === 3) threeStopReconstructions++
				else twoStopReconstructions++
			}
			if (entry.roleSignature !== undefined) signatures.add(entry.roleSignature)

			palettes.push({
				fixture,
				entryId: entry.entryId,
				completeness: entry.palette.completeness,
				imagePath: entry.artwork?.imagePath ?? null,
				rolesOnly: paletteFrom(roles, null),
				withGradient: stops === null ? null : paletteFrom(roles, stops),
				reconstructedStopCount: stops === null ? 0 : stops.length,
			})
		}
	}

	return {
		palettes,
		report: {
			entriesByFixture,
			total: palettes.length,
			incompleteRoleEntries,
			withReconstructedGradient,
			threeStopReconstructions,
			twoStopReconstructions,
			distinctRoleSignatures: signatures.size,
			collapseFlagMismatches,
			independentRolePairCount,
			sanctionedCollapsePairsSkipped,
		},
	}
}
