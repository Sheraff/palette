/**
 * The v3 palette output contract, as types.
 *
 * This file is the schema. `PHASE_0_DECISIONS.md` §2 is its specification and §4 its invariants;
 * `invariants.ts` enforces at runtime what the types can only describe. Nothing here computes.
 *
 * The shape in one paragraph: four role colours, each an **exact pixel of the source image**; an
 * optional gradient of two to four stops whose colours are **decoupled from the role colours** and
 * are themselves exact source pixels; two explicit collapse flags so collapse is countable rather
 * than inferred from hex equality; the two always-set minimum-contrast parameters as resolved; and
 * a metadata block that makes every verdict about a palette permanently scopable to the exact file,
 * decoder and algorithm that produced it.
 */

import type { COLOR_REGIONS, ROLE_NAMES } from "./constants.ts"

// ---------------------------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------------------------

declare const hexColorBrand: unique symbol

/**
 * A colour in this contract's canonical hex form: `#rrggbb`, lowercase. Branded so it cannot be
 * produced by accident — build one with `hex()` or `rgbToHex()` from `color.ts`.
 *
 * Canonicalisation is load-bearing, not cosmetic: `PHASE_0_DECISIONS.md` §4 invariant 3 defines the
 * sanctioned collapses as *exact* equality, and exactness needs one spelling.
 */
export type HexColor = string & { readonly [hexColorBrand]: true }

/** An 8-bit sRGB triple — the literal channel values of a source pixel. */
export type Rgb8 = readonly [red: number, green: number, blue: number]

/** A point in OKLab. The only space this contract measures distance in. */
export type OkLab = readonly [lightness: number, a: number, b: number]

/**
 * One of the four regions the same-colour bar is measured per. The reviewer's bracketing round
 * refuted a single threshold across them, so the bar a pair is judged against depends on where the
 * pair sits — see `sameColorBar()` in `color.ts`.
 */
export type ColorRegion = (typeof COLOR_REGIONS)[number]

/**
 * A published colour.
 *
 * `rgb` is the exact source pixel; `hex` is its canonical spelling, always derived from `rgb`.
 * `name` is presentation only — `CONVENTIONS.md` requires human-facing colour output to be named
 * via `colornames-oklab` alongside the hex — and is never read by any invariant.
 */
export type PaletteColor = Readonly<{
	rgb: Rgb8
	hex: HexColor
	name?: string
}>

// ---------------------------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------------------------

/** The four roles. Fixed before v3 design started (`V3_PLAN.md` §2). */
export type RoleName = (typeof ROLE_NAMES)[number]

/**
 * The four role colours. Flat colours, exact source pixels, always all four present — a role is
 * never absent, only collapsed onto another (see `CollapseFlags`).
 */
export type PaletteRoles = Readonly<Record<RoleName, PaletteColor>>

// ---------------------------------------------------------------------------------------------
// Gradient
// ---------------------------------------------------------------------------------------------

/**
 * One stop on the published colour path.
 *
 * `position` is the t-parameter in [0,1]. Stop colours are exact source pixels and are decoupled
 * from the role colours — the already-agreed contract change of `V3_PLAN.md` §2.
 */
export type GradientStop = Readonly<{
	color: PaletteColor
	position: number
}>

/**
 * How the gradient sits on the artwork.
 *
 * **Opportunistic and optional** (`PHASE_0_DECISIONS.md` §2): detection is geometry-agnostic — every
 * family publishes a t-parameterized colour path and the consumer renders it as a 135° linear
 * gradient. This field is populated only when the fit computed it anyway, and is never computed for
 * the sake of the output. Consumers must behave identically whether or not it is present.
 *
 * All coordinates are normalized to [0,1] against the processed size, per `CONVENTIONS.md`'s
 * scale-free rule — never pixels.
 */
export type GradientGeometry = Readonly<{
	kind: "linear" | "radial" | "conic"
	/** Where t = 0 sits. */
	start?: readonly [x: number, y: number]
	/** Where t = 1 sits. Linear only. */
	end?: readonly [x: number, y: number]
	/** Centre of the sweep. Radial and conic only. */
	center?: readonly [x: number, y: number]
	/** Sweep direction in degrees, clockwise from the positive x axis. Linear and conic only. */
	angleDegrees?: number
}>

/**
 * A published gradient: a colour path, nothing more.
 *
 * Stop count is 2..4 (`MIN_GRADIENT_STOPS`..`MAX_GRADIENT_STOPS`). The tuple type pins the first
 * two; the upper bound and the ordering of positions are enforced by invariant 1, because a type
 * cannot express "at most four" without making every consumer's life miserable.
 *
 * Stops 3–4 carry **guide semantics**: a third stop is legitimate when the artwork genuinely has a
 * three-colour ramp, and otherwise stops beyond the second exist only to pull the rendered OKLab
 * interpolation back onto the artwork. Never to expand colourspace coverage, never to fit a metric.
 */
export type GradientSpec = Readonly<{
	stops: readonly [GradientStop, GradientStop, ...GradientStop[]]
	geometry?: GradientGeometry
}>

// ---------------------------------------------------------------------------------------------
// Collapse
// ---------------------------------------------------------------------------------------------

/**
 * The two sanctioned collapses, stated rather than inferred (`PHASE_0_DECISIONS.md` §2).
 *
 * A flag set means the two colours are **exactly** equal. A flag clear means they are distinct above
 * the same-colour bar. Near-identical-but-unequal, and equal-without-flag, are both violations of
 * invariant 3 — there is no third state.
 */
export type CollapseFlags = Readonly<{
	/** surface → background. */
	surfaceCollapsed: boolean
	/** accent → foreground. */
	accentCollapsed: boolean
}>

// ---------------------------------------------------------------------------------------------
// Minimum-contrast parameters
// ---------------------------------------------------------------------------------------------

/**
 * What a caller asks for. **Always set, never "none"** (`PHASE_0_DECISIONS.md` §2, settled after two
 * rounds of relitigation).
 *
 * The public unit is APCA Lc magnitude. Both default to 0, which is not "off" — Lc simply cannot
 * express the default, because the default equals the minimum equals an epsilon that lives inside
 * Lc's dead band of (0, 7.3). A request of 0 therefore resolves to the epsilon. Callers can raise a
 * floor; they cannot lower one below its epsilon.
 *
 * `minTextContrast` governs the foreground, `minAccentContrast` the accent — the accent is not text,
 * its stakes are lower, and it gets its own knob.
 */
export type ContrastParameters = Readonly<{
	minTextContrast: number
	minAccentContrast: number
}>

/**
 * What the algorithm actually enforced, recorded on the palette so a verdict stays scopable.
 *
 * `requestedLc` is what the caller passed, verbatim. `effectiveRawMagnitude` is
 * `max(lcFloorToRawMagnitude(requestedLc), ε_raw)` — the number invariant 4 compares |raw APCA|
 * against. Both are recorded because the second cannot be reconstructed from the first without also
 * knowing which epsilon was in force, and the epsilons are still `[UNCALIBRATED]`.
 */
export type ResolvedContrastFloor = Readonly<{
	requestedLc: number
	effectiveRawMagnitude: number
}>

export type ResolvedContrastFloors = Readonly<{
	minTextContrast: ResolvedContrastFloor
	minAccentContrast: ResolvedContrastFloor
}>

// ---------------------------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------------------------

/**
 * The source file this palette attaches to.
 *
 * `PHASE_0_DECISIONS.md` §1: the palette attaches to the *file*, not the artwork. Identity is full
 * path plus content hash (`CONVENTIONS.md`), and the dimensions come from the decoder's header —
 * never from the filename, which lies for 719 AVIFs in `music-artworks/`.
 */
export type SourceRendition = Readonly<{
	/** Absolute path of the file that was decoded. */
	path: string
	/** Header-reported pixel dimensions. */
	width: number
	height: number
	/** Container format as the decoder reported it, e.g. "jpeg", "png", "avif". */
	format: string
}>

/**
 * Everything needed to say what produced this palette and from what.
 *
 * `PHASE_0_DECISIONS.md` §2: "this is what keeps every verdict permanently scopable". A verdict
 * without it is a verdict about nothing in particular.
 */
export type PaletteMetadata = Readonly<{
	/** Version of the extraction algorithm. */
	algorithmVersion: string
	/** Version of the pinned decoder plus input preprocessing. */
	preprocessingVersion: string
	/** sha-256, hex, lowercase, of the input file's bytes. */
	inputContentHash: string
	sourceRendition: SourceRendition
	/**
	 * Dimensions actually processed. Equal to the rendition's dimensions today, because
	 * `PHASE_0_DECISIONS.md` §1 forbids resampling; recorded anyway so that if a downscale-above-W
	 * optimization is ever admitted, every prior verdict remains interpretable.
	 */
	processedSize: Readonly<{ width: number; height: number }>
}>

// ---------------------------------------------------------------------------------------------
// The palette
// ---------------------------------------------------------------------------------------------

/** A published palette: the whole output of the algorithm, and the only thing validation runs on. */
export type Palette = Readonly<{
	/** `CONTRACT_VERSION` at the time of publication. */
	contractVersion: string
	roles: PaletteRoles
	/** `null` means the algorithm published no gradient — a decision, not an absence of one. */
	gradient: GradientSpec | null
	collapse: CollapseFlags
	contrast: ResolvedContrastFloors
	metadata: PaletteMetadata
}>

// ---------------------------------------------------------------------------------------------
// Source access, for invariant 2
// ---------------------------------------------------------------------------------------------

/** One pixel and where it is, in normalized coordinates. */
export type PixelSample = Readonly<{
	/** Normalized position in [0,1) — scale-free, per `CONVENTIONS.md`. */
	x: number
	y: number
	rgb: Rgb8
}>

/** Random access to the decoded source image. */
export type PixelAccessor = Readonly<{
	width: number
	height: number
	/** Integer pixel coordinates, origin top-left. */
	getPixel(x: number, y: number): Rgb8
}>

/** Sequential access to the decoded source image, for callers that stream. */
export type PixelIterable = Readonly<{
	width: number
	height: number
	pixels(): Iterable<PixelSample>
}>

/** Either access shape is accepted; invariant 2 normalizes internally. */
export type PixelSource = PixelAccessor | PixelIterable

/**
 * What invariant 2 needs to know about transparency, reported by the decoder rather than sniffed
 * here. `PHASE_0_DECISIONS.md` §1 and §4 invariant 5: an input with genuinely transparent pixels is
 * refused loudly, never silently flattened.
 *
 * "Genuinely transparent" means at least one pixel with alpha below opaque. A file with an alpha
 * channel that is uniformly opaque is not transparent and is accepted.
 */
export type TransparencyReport = Readonly<{
	hasAlphaChannel: boolean
	/** True only if at least one pixel is actually not fully opaque. */
	hasTransparentPixels: boolean
	/** Optional, for the error message and for the census. */
	transparentFraction?: number
}>

// ---------------------------------------------------------------------------------------------
// Spatial spread — declared now, implemented later
// ---------------------------------------------------------------------------------------------

/**
 * Input to the spatial-spread half of invariant 2.
 *
 * `PHASE_0_DECISIONS.md` §4 invariant 2 settles the *shape* — "meeting the population floor and
 * spatial-spread test (thresholds need provenance; shape settled)" — and defers the thresholds.
 * The type exists now so the interface is fixed before any implementation exists to bend it.
 */
export type SpatialSpreadInput = Readonly<{
	/** Every normalized coordinate at which the colour occurs exactly. */
	occurrences: readonly (readonly [x: number, y: number])[]
	/** Aspect ratio of the processed image, so a spread measure can be shape-aware if it must be. */
	aspectRatio: number
}>

export type SpatialSpreadVerdict = Readonly<{
	/** Scale-free spread measure. Definition deliberately not fixed yet. */
	spread: number
	passes: boolean
}>

/**
 * TODO [v3 Phase 1] — implement the spatial-spread check.
 *
 * Not implemented, on purpose. The blocking question is not code but provenance: a threshold here
 * has to come from measurement or from the reviewer, and neither has happened. Until one does,
 * `validateSourceSupport` reports the check as *deferred* rather than passing it, so no caller can
 * mistake silence for a pass. Wire an implementation in by assigning to
 * `spatialSpreadValidator` in `invariants.ts`.
 */
export type SpatialSpreadValidator = (input: SpatialSpreadInput) => SpatialSpreadVerdict

// ---------------------------------------------------------------------------------------------
// Validation results
// ---------------------------------------------------------------------------------------------

/** Which invariant of `PHASE_0_DECISIONS.md` §4 a violation belongs to. */
export type InvariantId = "I1" | "I2" | "I3" | "I4" | "I5"

/**
 * One violation. `code` is stable and machine-readable so the census can count by class; `message`
 * is for the human reading a stop-the-line report; `subjects` names the published colours involved
 * using dotted paths (`roles.foreground`, `gradient.stops[2]`).
 */
export type Violation = Readonly<{
	invariant: InvariantId
	code: string
	message: string
	subjects: readonly string[]
	/** Whatever the check measured, for the report and for threshold archaeology later. */
	measured?: Readonly<Record<string, number | string | boolean>>
}>

/**
 * The outcome of a validation run.
 *
 * `deferred` lists checks that were declared but not performed. Each entry is the stable code of the
 * check, in the same vocabulary as a violation's code, so a caller can tell exactly which one is
 * missing: `I2.spatial-spread` (thresholds not yet measured), `I2.source-support` (no decoded input
 * supplied), `I5.transparency-report` (no decoder transparency report supplied). The reason a check
 * is deferred belongs with its constant in `invariants.ts`, which is where it can be kept true.
 *
 * A run with violations is invalid; a run with deferrals is valid *as far as it went*, and says so
 * rather than pretending. Anything reading `valid` as "this palette is good" without also reading
 * `deferred` is reading silence as a pass, which is the failure this field exists to prevent.
 */
export type ValidationResult = Readonly<{
	valid: boolean
	violations: readonly Violation[]
	deferred: readonly string[]
}>
