/**
 * # The configuration — P1's decision variable, and the whole of it
 *
 * `DESIGN.md`, "The mechanism": *"One scalar objective over the whole configuration — four roles,
 * gradient boolean, stops, collapse flags — minimised together."* This file is that sentence as a
 * type. A `Configuration` is the **entire** answer for one artwork: nothing about a P1 palette lives
 * outside it, and no stage may hold a half-configuration in which some roles are decided and others
 * are not. If a future module finds itself wanting `Partial<Configuration>`, that is the staged
 * pipeline `DESIGN.md` forbids, wearing a type.
 *
 * ## Why this is not just `Palette`
 *
 * `Palette` (the contract) is the *published* object: hex spellings, resolved contrast floors,
 * metadata, the decoder's report on the file. All of that is a function of the configuration plus
 * the input file, and none of it is something the search chooses. Carrying it inside the search
 * would mean re-deriving `#rrggbb` strings and re-hashing a file at every node of a lattice.
 *
 * So the split is: **`Configuration` is what P1 decides, `Palette` is what P1 publishes**, and
 * `toPalette()` in `palette.ts` is the one, mechanical, total map between them.
 *
 * ## Colours are 8-bit triples, not `PaletteColor`
 *
 * `PHASE_0_DECISIONS.md` §4 invariant 2: every published colour is an *exact pixel of the source*.
 * The alphabet a P1 search draws from is therefore literally the set of 8-bit sRGB triples occurring
 * in the artwork, and a triple is the smallest thing that says so. `PaletteColor` adds a derived hex
 * and an optional presentation name — both of them outputs, neither an input.
 */

import type {
	EscapeRole,
	Rgb8,
	SourceRendition,
	ContrastParameters,
} from "../../../../src/contract/types.ts"

// ---------------------------------------------------------------------------------------------
// The configuration
// ---------------------------------------------------------------------------------------------

/**
 * The two colours the escape may name.
 *
 * `[INHERITED]` — `ESCAPE_COLORS` in `src/contract/constants.ts`, itself the reviewer's ruling of
 * 2026-08-04 verbatim: *"pure white (`#ffffff`) or pure black (`#000000`) only"*. Restated as a
 * literal union so a configuration cannot carry a third one even before validation runs.
 */
export type EscapeColorLiteral = "#ffffff" | "#000000"

/**
 * A configuration's declaration that it took the one sanctioned non-source colour.
 *
 * Structurally identical to the contract's `NonSourceColorEscape`, deliberately re-declared rather
 * than imported: the contract's `color` is a `HexColor` brand (a validated string), and a search
 * that had to mint branded strings to write down a candidate escape would be paying a string
 * allocation per lattice node for a branch `DESIGN.md` §6 expects to *essentially never fire*
 * (1,396 of 1,397 endorsed role colours are exact source triples).
 */
export type ConfigurationEscape = Readonly<{
	role: EscapeRole
	color: EscapeColorLiteral
}>

/**
 * One stop on the published colour path, as the search holds it.
 *
 * `position` is the t-parameter. Invariant 1 requires positions strictly increasing with the first
 * at exactly 0 and the last at exactly 1, so the endpoints carry no free position — see
 * `serializationCost()`, which prices them at zero bits for exactly this reason.
 */
export type ConfigurationStop = Readonly<{
	rgb: Rgb8
	position: number
}>

/**
 * **The whole answer, as one object.**
 *
 * Field-by-field, with the constraint each one is under. None of these constraints is enforced by
 * the type; all of them are enforced by `src/contract` through `feasibility()`, because
 * `DESIGN.md` is explicit that *"the contract is the feasible set"* and a second, weaker copy of the
 * rules living in the emitter is how the two drift apart.
 *
 * - `background`, `surface`, `foreground`, `accent` — exact 8-bit source triples (invariant 2),
 *   except a role named by `escape`, which is `#ffffff`/`#000000` and need not occur.
 * - `gradient` — whether the field is a ramp. One boolean, priced at one bit.
 * - `stops` — empty when `gradient` is false; otherwise 2–4 stops whose **first colour is
 *   `background` and last is `surface`** (reviewer's ruling, 2026-08-04) at positions 0 and 1.
 *   Interior stops are decoupled from the roles and are the only free colours here.
 * - `surfaceCollapsed` / `accentCollapsed` — *declared*, never inferred (invariant 3). A set flag
 *   asserts exact equality of the two triples; a clear flag asserts separation above the bar.
 * - `escape` — `null` for all but the empty-feasible-set branch of `DESIGN.md` §6.
 */
export type Configuration = Readonly<{
	background: Rgb8
	surface: Rgb8
	foreground: Rgb8
	accent: Rgb8
	gradient: boolean
	stops: readonly ConfigurationStop[]
	surfaceCollapsed: boolean
	accentCollapsed: boolean
	escape: ConfigurationEscape | null
}>

/** The four role names, in the order this prototype iterates and prices them. */
export const CONFIGURATION_ROLES = ["background", "surface", "foreground", "accent"] as const

export type ConfigurationRole = (typeof CONFIGURATION_ROLES)[number]

// ---------------------------------------------------------------------------------------------
// Publication metadata
// ---------------------------------------------------------------------------------------------

/**
 * What `toPalette()` needs that the configuration cannot know: which arm produced it, and what file
 * it came from.
 *
 * Passed in rather than measured here on purpose. `DESIGN.md`'s module layout puts decoding in
 * `src/measure/`, and an emitter that re-opened the file would decode every artwork twice and could
 * disagree with the measurement layer about the header — the exact failure `CONVENTIONS.md` records
 * for the 719 AVIFs whose filenames disagree with their own headers.
 */
export type EmitMeta = Readonly<{
	/** `ALGORITHM_VERSIONS.p1a` or `.p1ap`. The caller says which arm this is; the emitter never guesses. */
	algorithmVersion: string
	/** sha-256, hex, lowercase, of the input file's bytes. */
	inputContentHash: string
	sourceRendition: SourceRendition
	/**
	 * Dimensions actually processed. Omitted means "equal to the rendition", which is the only legal
	 * answer today because `PHASE_0_DECISIONS.md` §1 forbids resampling.
	 */
	processedSize?: Readonly<{ width: number; height: number }>
	/**
	 * What the caller asked for. Omitted means `DEFAULT_CONTRAST_PARAMETERS` — both floors at 0, which
	 * `PHASE_0_DECISIONS.md` §2 is careful to say is *not* "off".
	 */
	contrast?: ContrastParameters
}>

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

/**
 * Thrown when a configuration cannot be *represented* as a contract `Palette` at all.
 *
 * The bar for throwing here is deliberately very low, and the reason is `DESIGN.md`: *"The contract
 * is the feasible set, never a term."* Anything the invariants can judge — an illegal collapse, a
 * first stop that is not the background, an invented colour — must reach `validatePalette` and be
 * reported as a violation, not be swallowed by an emitter that decided to be helpful. An emitter
 * that pre-filters is a second, undocumented feasible set.
 *
 * So this fires only for configurations with no contract shape to be put into: a gradient with
 * fewer than the two stops `GradientSpec`'s tuple type requires.
 */
export class ConfigurationError extends Error {
	override readonly name = "ConfigurationError"
}

/**
 * Thrown by a candidate module whose search is not wired up yet. Named separately from
 * `ConfigurationError` so a devloop run's failed rows say "not built" rather than "bad input".
 */
export class NotYetWiredError extends Error {
	override readonly name = "NotYetWiredError"
}
