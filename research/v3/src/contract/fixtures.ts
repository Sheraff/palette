/**
 * Fixture palettes and synthetic sources for the contract tests.
 *
 * Two kinds live here: palettes that are valid and must stay valid, and palettes built to violate
 * exactly one invariant. The second kind is the more useful: a validator that only ever sees good
 * input is a validator nobody has tested.
 *
 * The colours are not arbitrary. Each violating fixture was chosen by measurement so that it trips
 * its own invariant and no other — in particular `contrastFloorViolation` is a vivid magenta on mid
 * grey, which is 24 same-colour bars apart by the one ruler and still, according to APCA, invisible.
 * That pair is the reason invariant 4 exists as a separate rule from invariant 3.
 */

import { colorFromHex } from "./color.ts"
import { CONTRACT_VERSION } from "./constants.ts"
import { DEFAULT_CONTRAST_PARAMETERS, resolveContrastParameters } from "./invariants.ts"
import type {
	GradientStop,
	Palette,
	PaletteColor,
	PaletteMetadata,
	PixelAccessor,
	PixelIterable,
	PixelSample,
	Rgb8,
	TransparencyReport,
} from "./types.ts"

// ---------------------------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------------------------

/** A syntactically valid sha-256 digest. Not the digest of anything; fixtures decode no files. */
const FIXTURE_CONTENT_HASH = "0".repeat(64)

const FIXTURE_SIZE = { width: 200, height: 200 }

export function fixtureMetadata(overrides: Partial<PaletteMetadata> = {}): PaletteMetadata {
	return {
		algorithmVersion: "v3-fixture-0",
		preprocessingVersion: "sharp-0.33.5/no-resample",
		inputContentHash: FIXTURE_CONTENT_HASH,
		sourceRendition: {
			path: "/fixtures/album.jpg",
			width: FIXTURE_SIZE.width,
			height: FIXTURE_SIZE.height,
			format: "jpeg",
		},
		processedSize: { ...FIXTURE_SIZE },
		...overrides,
	}
}

/** The contrast block a palette gets when the caller left both parameters at their defaults. */
export const DEFAULT_RESOLVED_CONTRAST = resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS)

// ---------------------------------------------------------------------------------------------
// Palette construction
// ---------------------------------------------------------------------------------------------

export type FixtureSpec = Readonly<{
	background: string
	surface: string
	foreground: string
	accent: string
	stops?: readonly (readonly [hex: string, position: number])[]
	surfaceCollapsed?: boolean
	accentCollapsed?: boolean
}>

export function makePalette(spec: FixtureSpec): Palette {
	const stops = spec.stops?.map(([value, position]): GradientStop => ({
		color: colorFromHex(value),
		position,
	}))
	return {
		contractVersion: CONTRACT_VERSION,
		roles: {
			background: colorFromHex(spec.background),
			surface: colorFromHex(spec.surface),
			foreground: colorFromHex(spec.foreground),
			accent: colorFromHex(spec.accent),
		},
		gradient: stops === undefined ? null : { stops: stops as unknown as [GradientStop, GradientStop] },
		collapse: {
			surfaceCollapsed: spec.surfaceCollapsed ?? spec.surface === spec.background,
			accentCollapsed: spec.accentCollapsed ?? spec.accent === spec.foreground,
		},
		contrast: DEFAULT_RESOLVED_CONTRAST,
		metadata: fixtureMetadata(),
	}
}

// ---------------------------------------------------------------------------------------------
// Valid fixtures
// ---------------------------------------------------------------------------------------------

/**
 * The plain case: four distinct roles, no gradient, no collapse. A dark blue field with near-white
 * text and a warm accent — the shape most album artwork ends up in.
 */
export const validFlat: Palette = makePalette({
	background: "#101820",
	surface: "#1e2a38",
	foreground: "#f2f5f7",
	accent: "#e0533a",
})

/**
 * Both sanctioned collapses at once, exactly equal and flagged: surface onto background, accent onto
 * foreground. This is what a legitimately two-colour artwork publishes.
 */
export const validCollapsed: Palette = makePalette({
	background: "#101820",
	surface: "#101820",
	foreground: "#f2f5f7",
	accent: "#f2f5f7",
})

/**
 * A three-stop gradient whose first stop is *exactly* the background colour, plus opportunistic
 * geometry. Both exercise contract clauses that are easy to get wrong: stops are decoupled from role
 * colours, so a field role coinciding with a stop is the natural case and is exempt from
 * distinctness — while the foreground and accent get no such exemption.
 */
export const validGradient: Palette = {
	...makePalette({
		background: "#101820",
		surface: "#1e2a38",
		foreground: "#f2f5f7",
		accent: "#e0533a",
		stops: [["#101820", 0], ["#2b3f57", 0.5], ["#4a6b8a", 1]],
	}),
	gradient: {
		stops: [
			{ color: colorFromHex("#101820"), position: 0 },
			{ color: colorFromHex("#2b3f57"), position: 0.5 },
			{ color: colorFromHex("#4a6b8a"), position: 1 },
		],
		geometry: { kind: "linear", start: [0, 0], end: [1, 1], angleDegrees: 135 },
	},
}

export const validPalettes: readonly Palette[] = [validFlat, validCollapsed, validGradient]

// ---------------------------------------------------------------------------------------------
// Violating fixtures — one per invariant, each tripping only its own
// ---------------------------------------------------------------------------------------------

/** I1: a fifth stop. The contract allows two to four. */
export const schemaTooManyStops: Palette = makePalette({
	background: "#101820",
	surface: "#1e2a38",
	foreground: "#f2f5f7",
	accent: "#e0533a",
	stops: [["#101820", 0], ["#2b3f57", 0.3], ["#4a6b8a", 0.6], ["#7fa3c2", 0.8], ["#c3d8e8", 1]],
})

/** I1: positions that do not increase. */
export const schemaUnorderedStops: Palette = makePalette({
	background: "#101820",
	surface: "#1e2a38",
	foreground: "#f2f5f7",
	accent: "#e0533a",
	stops: [["#2b3f57", 0.7], ["#4a6b8a", 0.2]],
})

/**
 * I1: a ramp that does not span its own parameter — the first stop sits at 0.2 and the last at 0.8.
 * Ordered, in range, and still wrong: positions are normalized over the ramp's own span, so this
 * describes a mis-normalized gradient rather than a shorter one.
 */
export const schemaStopSpanIncomplete: Palette = makePalette({
	background: "#101820",
	surface: "#1e2a38",
	foreground: "#f2f5f7",
	accent: "#e0533a",
	stops: [["#2b3f57", 0.2], ["#4a6b8a", 0.8]],
})

/** I1: a position outside [0,1]. */
export const schemaStopOutOfRange: Palette = makePalette({
	background: "#101820",
	surface: "#1e2a38",
	foreground: "#f2f5f7",
	accent: "#e0533a",
	stops: [["#2b3f57", 0], ["#4a6b8a", 1.4]],
})

/**
 * I1: surface and background are exactly equal but the flag is clear. Collapse must be *stated*, or
 * it cannot be counted — which is the entire reason the flags exist.
 */
export const schemaCollapseUnflagged: Palette = makePalette({
	background: "#101820",
	surface: "#101820",
	foreground: "#f2f5f7",
	accent: "#e0533a",
	surfaceCollapsed: false,
})

/** I1: the flag is set but the colours are not exactly equal. */
export const schemaFlagWithoutEquality: Palette = makePalette({
	background: "#101820",
	surface: "#1e2a38",
	foreground: "#f2f5f7",
	accent: "#e0533a",
	surfaceCollapsed: true,
})

/** I1: the metadata block cannot identify what was extracted. */
export const schemaBadMetadata: Palette = {
	...validFlat,
	metadata: fixtureMetadata({ inputContentHash: "not-a-digest" }),
}

/** I1: the hex and the rgb triple disagree, so downstream checks would disagree with each other. */
export const schemaHexRgbMismatch: Palette = {
	...validFlat,
	roles: {
		...validFlat.roles,
		accent: { rgb: [224, 83, 58] as Rgb8, hex: "#000000" as PaletteColor["hex"] },
	},
}

/**
 * I3: two gradient stops the ruler cannot tell apart (OKLab distance 0.0113, under the 0.013 bar).
 * A degenerate ramp — the two stops render as one colour.
 */
export const distinctnessIndistinctStops: Palette = makePalette({
	background: "#101820",
	surface: "#1e2a38",
	foreground: "#f2f5f7",
	accent: "#e0533a",
	stops: [["#2b3f57", 0], ["#2e425a", 1]],
})

/**
 * I3: the foreground sits on top of a gradient stop. "White on white" — the field roles are exempt
 * from stop distinctness, the foreground is emphatically not.
 */
export const distinctnessForegroundMatchesStop: Palette = makePalette({
	background: "#101820",
	surface: "#1e2a38",
	foreground: "#f2f5f7",
	accent: "#e0533a",
	stops: [["#101820", 0], ["#f2f5f7", 1]],
})

/**
 * I3: an invisible accent — indistinguishable from the surface it sits on. Promoted to an invariant
 * by the reviewer on 2026-08-02: an invisible accent is never valid.
 */
export const distinctnessInvisibleAccent: Palette = makePalette({
	background: "#101820",
	surface: "#1e2a38",
	foreground: "#f2f5f7",
	accent: "#1f2b39",
})

/**
 * I3: surface and background near-identical but not exactly equal, flag clear. Consistent as far as
 * invariant 1 is concerned — and still a violation, because a sanctioned collapse has to be exact.
 * "Almost collapsed" is the state the flags exist to make impossible.
 */
export const distinctnessNearCollapse: Palette = makePalette({
	background: "#2b3f57",
	surface: "#2e425a",
	foreground: "#f2f5f7",
	accent: "#e0533a",
	surfaceCollapsed: false,
})

/**
 * I4: a vivid magenta foreground on a mid-grey background. The two are 0.307 apart in OKLab — over
 * twenty same-colour bars, so invariant 3 is perfectly happy — and |raw APCA| is 2.31, below the
 * 2.5 epsilon. APCA reports Lc 0: at this luminance the hue carries the difference and the text
 * carries none of it. Surface and accent are chosen so that only the foreground/background pair
 * trips.
 */
export const contrastFloorViolation: Palette = makePalette({
	background: "#808080",
	surface: "#101820",
	foreground: "#ca00ff",
	accent: "#f2f5f7",
})

/**
 * A genuinely collapsed accent under an accent floor the pair cannot meet.
 *
 * The accent is exactly the foreground, and the caller has raised `minAccentContrast` to Lc 105 —
 * a raw floor of 107.7, above the pair's actual |raw| of 102.6. Invariant 4 must report nothing:
 * a collapsed accent is the foreground, is validated as the foreground, and has no independent
 * existence to hold to its own floor.
 */
export const collapsedAccentUnderRaisedFloor: Palette = {
	...makePalette({
		background: "#101820",
		surface: "#1e2a38",
		foreground: "#f2f5f7",
		accent: "#f2f5f7",
	}),
	contrast: resolveContrastParameters({ minTextContrast: 0, minAccentContrast: 105 }),
}

/**
 * The same exemption, claimed by a flag that is lying: `accentCollapsed` is set over two colours
 * that are not equal, and the accent sits at zero luminance contrast against both fields. Invariant
 * 1 catches the flag; invariant 4 must still catch the invisible accent, or a false flag would buy
 * an exemption from the thing the flag is supposed to make countable.
 */
export const lyingAccentCollapseFlag: Palette = makePalette({
	background: "#808080",
	surface: "#808080",
	foreground: "#f2f5f7",
	accent: "#e700a8",
	surfaceCollapsed: true,
	accentCollapsed: true,
})

/**
 * The self-certification bypass, found by an independent verifier on 2026-08-02.
 *
 * `#5a5a5a` on `#002bff` is isoluminant: 0.297 apart in OKLab — twenty-four same-colour bars, so
 * invariant 3 is content — and |raw APCA| 0.699, well below the text epsilon. It is precisely §4
 * invariant 4's founding case, "invalid regardless of hue".
 *
 * The palette declares `effectiveRawMagnitude: 0.0001`. Because invariant 4 measures against the
 * palette's own recorded floor, a declared floor below the epsilon used to certify this pair as
 * legible and the whole palette reported zero violations. Invariant 1 now rejects any declared floor
 * under its role's epsilon, which is what makes invariant 4 unfakeable.
 */
export const contrastFloorSelfCertified: Palette = {
	...makePalette({
		background: "#002bff",
		surface: "#101820",
		foreground: "#5a5a5a",
		accent: "#f2f5f7",
	}),
	contrast: {
		minTextContrast: { requestedLc: 0, effectiveRawMagnitude: 0.0001 },
		minAccentContrast: { requestedLc: 0, effectiveRawMagnitude: 0.0001 },
	},
}

/**
 * A declared floor that is above its epsilon but does not follow from the recorded `requestedLc`.
 * The palette is misreporting what it enforced, which makes any verdict about it unscopable.
 */
export const contrastFloorInconsistent: Palette = {
	...validFlat,
	contrast: {
		minTextContrast: { requestedLc: 60, effectiveRawMagnitude: 3 },
		minAccentContrast: DEFAULT_RESOLVED_CONTRAST.minAccentContrast,
	},
}

/**
 * Malformed shapes a corpus sweep over persisted JSON will actually meet. Validation must count each
 * as a violation and never throw — one bad record cannot be allowed to kill the sweep.
 */
export const malformedPalettes: readonly (readonly [label: string, value: unknown])[] = [
	["null", null],
	["undefined", undefined],
	["empty object", {}],
	["roles undefined", { contractVersion: "v", roles: undefined }],
	["roles null", { contractVersion: "v", roles: null }],
	["roles not an object", { contractVersion: "v", roles: 42 }],
	["gradient stops not an array", { roles: {}, gradient: { stops: "nope" } }],
	["gradient not an object", { roles: {}, gradient: 7 }],
	["gradient stops of nulls", { roles: {}, gradient: { stops: [null, null] } }],
	["collapse null", { roles: {}, collapse: null }],
	["contrast a string", { roles: {}, contrast: "x" }],
	["metadata a number", { roles: {}, metadata: 3 }],
	["an array", []],
	["a string", "palette"],
]

// ---------------------------------------------------------------------------------------------
// Synthetic sources, for invariant 2
// ---------------------------------------------------------------------------------------------

function parseHex(value: string): Rgb8 {
	return colorFromHex(value).rgb
}

/**
 * An image of equal horizontal bands. Every colour occupies `1/n` of the frame, which clears the
 * population floor by two orders of magnitude at the fixture size.
 */
export function bandedSource(
	hexes: readonly string[],
	size: { width: number; height: number } = FIXTURE_SIZE,
): PixelAccessor {
	const colors = hexes.map(parseHex)
	return {
		width: size.width,
		height: size.height,
		getPixel(_x, y) {
			const band = Math.min(colors.length - 1, Math.floor((y / size.height) * colors.length))
			return colors[band]
		},
	}
}

/**
 * The same image, exposed through the iterator shape instead of random access, so the tests can
 * prove invariant 2 accepts both and reaches the same verdict.
 */
export function iterableSource(accessor: PixelAccessor): PixelIterable {
	return {
		width: accessor.width,
		height: accessor.height,
		*pixels(): Generator<PixelSample> {
			for (let y = 0; y < accessor.height; y++) {
				for (let x = 0; x < accessor.width; x++) {
					yield { x: x / accessor.width, y: y / accessor.height, rgb: accessor.getPixel(x, y) }
				}
			}
		},
	}
}

/**
 * A field of one colour with `rareCount` pixels of another sprinkled into the first row. Used to
 * drive a published colour below the population floor without removing it from the image — the
 * distinction invariant 2 has to make between "not there" and "not there enough".
 */
export function sparseSource(
	fieldHex: string,
	rareHex: string,
	rareCount: number,
	size: { width: number; height: number } = FIXTURE_SIZE,
): PixelAccessor {
	const field = parseHex(fieldHex)
	const rare = parseHex(rareHex)
	return {
		width: size.width,
		height: size.height,
		getPixel(x, y) {
			return y === 0 && x < rareCount ? rare : field
		},
	}
}

/** Every colour `validFlat` publishes, present in quantity. */
export const validFlatSource = bandedSource(["#101820", "#1e2a38", "#f2f5f7", "#e0533a"])

/** Every colour `validGradient` publishes, present in quantity. */
export const validGradientSource = bandedSource([
	"#101820",
	"#1e2a38",
	"#f2f5f7",
	"#e0533a",
	"#2b3f57",
	"#4a6b8a",
])

/** An image that simply does not contain `validFlat`'s accent. */
export const missingAccentSource = bandedSource(["#101820", "#1e2a38", "#f2f5f7", "#c0c8d0"])

// ---------------------------------------------------------------------------------------------
// Transparency reports, for invariant 5
// ---------------------------------------------------------------------------------------------

/** A JPEG: no alpha channel at all. The sharded corpus is 100% this. */
export const opaqueJpegReport: TransparencyReport = {
	hasAlphaChannel: false,
	hasTransparentPixels: false,
}

/** A PNG with an alpha channel that happens to be uniformly opaque. Accepted — alpha is not transparency. */
export const opaquePngReport: TransparencyReport = {
	hasAlphaChannel: true,
	hasTransparentPixels: false,
	transparentFraction: 0,
}

/** A disc scan: circular cutout, roughly 28% transparent. Refused. */
export const transparentDiscScanReport: TransparencyReport = {
	hasAlphaChannel: true,
	hasTransparentPixels: true,
	transparentFraction: 0.28,
}
