import { chroma, labAt, oklabToRGB, perceptualDifference } from "./color.ts";

import { ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY } from "./base-scoring.ts";

import { ALBUM_ARTWORK_PALETTE_V2_POLICY } from "./policy.ts";

import type { CompletePaletteTreatment } from "./palette-core.ts";
import type { OKLab } from "./types.ts";

/**
 * How much of the artwork's colour the palette actually stands for.
 *
 * Every other quality axis reads a treatment role by role, or reads the *palette* against the families
 * the seed domain proposed. None of them reads the **artwork's own distribution of colour** and asks
 * whether the four published colours span it. That gap is what produced the reviewed complaints in this
 * class — "the surface color feels dull, almost grayish, when the artwork is so very colorful", "the
 * foreground is very close to a black when the artwork has many colors, so we are missing some of its
 * identity", an artwork of pink and purple splashes published with none of either.
 *
 * The measurement is a distribution over **hue direction, weighted by chroma**:
 *
 *     cover(b)  = max over roles r of  [ hueGap(h_r, b) <= W ] * min(1, C_r / C(b))
 *     coverage  = sum_b mass(b) * cover(b) / sum_b mass(b)
 *
 * Two properties are load-bearing, and both are why this is not the raw identity coverage that was
 * measured and rejected as `identityAuthority` (see `WINNER_RANKING_HYPOTHESES.authorizedIdentity`):
 *
 * - **A near-neutral role covers nothing.** Credit is `min(1, C_r / C(b))`, so a near-black violet
 *   sitting in the violet direction earns almost none of that direction's mass. Raw identity coverage
 *   was equally available to a treatment that covered its obligations with neutrals; this is not.
 * - **Two roles on one hue are paid once.** Coverage is a property of the *union* of hue windows, so a
 *   second role inside the same window adds nothing except through its chroma. This is the reviewer's
 *   `skap` principle, and here it holds by construction rather than by a dedup rule.
 *
 * The weighting, the chromatic floor and the binning are not invented here. They are the convention the
 * research track validated against the reviewer's own quantitative language ("half the image is red" =
 * 31.30 % of chromatic mass), and the floor is the selector policy's own `identityDirectionChroma`.
 */
export const ARTWORK_GAMUT_POLICY = Object.freeze({
	/**
	 * A pixel counts as chromatic at the same chroma the selector already requires of an identity
	 * direction. Below it a hue angle is noise, and reading one is how a wash of near-neutral pixels
	 * comes to outvote a small saturated mark.
	 */
	chromaticFloor: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.identityDirectionChroma,
	/**
	 * Half-width of the hue window a palette colour speaks for.
	 *
	 * Deliberately **not a new constant**: the selector already declares that two colours within
	 * `identityDirectionHueDegrees` (40 deg) are the *same* identity direction, so a direction is 40 deg
	 * wide and a colour at its centre reaches +/-20 deg. Deriving the window from the existing reviewed
	 * constant is what keeps it from being fitted — the research track's separation measurement is flat
	 * (AUC 0.834-0.902) across +/-10..+/-40 deg, so the data does not pick a window and consistency
	 * with the selector's own notion of "a direction" does.
	 */
	directionHalfWidthDegrees: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.identityDirectionHueDegrees / 2,
	/** One bin per degree. Finer than any decision made on it; coarse enough to stay cheap. */
	hueBins: 360,
	/**
	 * Slots available to cover the artwork. The ceiling is computed for exactly this many, because a
	 * palette has exactly this many colours to spend.
	 */
	slots: 4,
} as const)

/**
 * Which roles are allowed to earn coverage.
 *
 * `"all-roles"` is the plain reading: any published colour that stands in a hue direction represents
 * it. `"field-and-accent"` excludes the **foreground**, and the reason is not tidiness — the
 * foreground is the text role, picked for legibility against the field, and rewarding it for being
 * chromatic is a documented failure mode (the reviewed foreground-mover regressions, where an
 * artwork's black or white display type lost the role to a chromatic non-text region). Excluding it
 * makes coverage a statement about the *field and its accent*, which is where every complaint in this
 * class actually landed ("the surface color feels dull", "would be stronger with a red surface", "the
 * accent could be muted grape purple").
 *
 * The counter-evidence is real and is recorded rather than hidden: one reviewed complaint asks for the
 * opposite ("the foreground is very close to a black when the artwork has many colors, so we are
 * missing some of its identity"). So this is a measured choice, not a derived one.
 *
 * `"mark-bearing"` is that recorded counter-evidence acted on, without giving back what the exclusion
 * bought. The failure named above is specific — *a chromatic non-text region taking the role from the
 * artwork's display type* — and the role classifier measures exactly that, so the distinction does not
 * need a blanket rule. The foreground earns coverage when the artwork's own evidence says the colour
 * standing in the text role is one of its marks, and earns nothing when the treatment is holding
 * materially better text in another of its roles. The predicate is the identity objective's own
 * `demotesBetterText`, computed once per treatment there; see `FOREGROUND_MARK_ADMISSION`.
 */
export type GamutCoverageScope = "all-roles" | "field-and-accent" | "mark-bearing"

/**
 * Coverage at which the term stops paying.
 *
 * A linear credit is unbounded in the wrong place: a palette already covering 99 % of what four
 * colours could cover still earns more for reaching 100 %, and that last percent is enough to buy a
 * change worth far more elsewhere. The measured case is a reviewed-**strong** artwork with a white
 * ground, where the axis inverted the entire field — background and surface both — to move coverage
 * from 99.1 % to 100.0 %.
 *
 * Saturating the credit says what the evidence actually supports: coverage is evidence that something
 * is *missing*, and once nothing is missing there is nothing left to buy. Above the saturation point
 * every candidate scores the same, so the reviewed axes decide, which is the correct behaviour when
 * the artwork is already represented.
 *
 * `1` reproduces the linear term exactly.
 */
export const GAMUT_COVERAGE_SATURATION = 0.75

/**
 * The field guard.
 *
 * Coverage on its own has no idea which part of the artwork the background and surface are supposed to
 * *be*. It only knows that a chromatic field covers more hue than a neutral one, so on an artwork whose
 * ground is genuinely white it will happily invert the whole field to near-black and call that an
 * improvement. That was measured twice on reviewed-**strong** artworks, and the saturation term only
 * masked it: saturation stops paying once an artwork is *already* well covered, so it protected the one
 * sitting at 99.1 % coverage and did nothing for the one at 23.5 %.
 *
 * The guard does not mention white and is not a threshold on the artwork. It says: **when the artwork's
 * own field is one you could not tell apart from grey, the background and surface earn no coverage at
 * all.** There is no colour in a neutral ground to represent, so any coverage those two roles could show
 * would have to be imported from somewhere the field is not — which is precisely the inversion.
 * Everything the non-field roles cover is still earned outright, and when the field is *not* achromatic
 * the axis pays in full, which is what leaves it able to replace a dull field with the artwork's real
 * colour.
 *
 * An earlier version shaded the field by the candidate's own `fieldFidelity` instead of gating on the
 * artwork. It was measured and rejected: `fieldFidelity` cannot tell *abandoning a real white ground*
 * from *replacing a dull field*, because both are field changes with reduced fidelity, so it suppressed
 * three of the four reviewed fixes the axis exists for. Gating on the artwork separates them exactly;
 * see `isAchromaticField`.
 */
export const GAMUT_COVERAGE_FIELD_GUARD = true

/**
 * Is this field one you could not tell apart from grey?
 *
 * The guard above must not fire on every field, or it suppresses exactly the fixes the axis exists for
 * — replacing a dull surface with the artwork's real colour is also a field change, and shading it by
 * `fieldFidelity` blocks it just as effectively as it blocks a white-ground inversion. So the guard is
 * gated on the artwork's field actually being achromatic.
 *
 * "Achromatic" is not a new constant. A colour is achromatic here when it is **the same colour as the
 * neutral grey of its own lightness**, judged by the repository's own reviewed same-colour bar
 * (`distinctness.sameColor`, ΔE 3.3) through the same `perceptualDifference` ruler every other
 * same-or-not decision uses. The field counts as achromatic only when *both* its roles are.
 *
 * Measured separation on the cases that define the problem: the two fields that must be protected sit
 * at ΔE **0.00** from grey, and the four fields that must stay free sit at **17.99, 18.60, 20.49 and
 * 22.09**. The bar at 3.3 is inside a gap spanning nearly twenty ΔE, so the cut is insensitive to where
 * in that gap it falls — which is what makes it a derived value rather than a fitted one.
 *
 * Note the *dominance* half of the original hypothesis was measured and **dropped**: the field needing
 * protection had population fraction 0.163 while one that had to stay free had 0.339, so area does not
 * separate these cases and adding it would only have introduced a constant that does no work.
 */
export function isAchromaticField(field: readonly OKLab[]): boolean {
	return field.every((color) => {
		const rendered = oklabToRGB(color)
		const neutral = oklabToRGB([color[0], 0, 0])
		return perceptualDifference(rendered, neutral) < ALBUM_ARTWORK_PALETTE_V2_POLICY.distinctness.sameColor
	})
}

/**
 * The artwork's chromatic content as mass per hue direction.
 *
 * `mass[b]` is the sum of chroma over the chromatic pixels whose hue falls in bin `b`; `sqMass[b]` is
 * the sum of chroma squared, so `sqMass[b] / mass[b]` is the chroma-weighted mean chroma of that bin —
 * the reference a palette colour's own chroma is judged against.
 */
export type ArtworkGamut = Readonly<{
	mass: Float64Array
	sqMass: Float64Array
	totalMass: number
	chromaticPixels: number
	pixelCount: number
	/** Largest share of `totalMass` any `slots` perfectly-placed, perfectly-saturated colours could cover. */
	ceiling: number
}>

function hueDegrees([, a, b]: OKLab): number {
	return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
}

function hueGapDegrees(first: number, second: number): number {
	const delta = Math.abs(first - second) % 360
	return delta > 180 ? 360 - delta : delta
}

/**
 * Largest share of the mass coverable by `slots` arcs of the direction width.
 *
 * Circular maximum coverage with fixed-length intervals, solved exactly: any optimal placement can be
 * rotated until one arc starts on a bin boundary, so enumerate that arc's start, cut the circle there,
 * and run a linear DP over the rest. No heuristic and no randomness — `O(bins^2 * slots)`, which at 360
 * bins and 4 slots is half a million operations, once per image.
 *
 * This is what stops the axis from punishing an artwork for being richer than four colours can express.
 * The reviewer named that case himself: "it's more colours than we can fit in our palettes". Dividing by
 * the ceiling asks *did we spend our four slots well*, not *is this artwork simple*.
 */
function coverageCeiling(mass: Float64Array, slots: number, halfWidth: number): number {
	const bins = mass.length
	let total = 0
	for (let bin = 0; bin < bins; bin++) total += mass[bin]
	if (total <= 0) return 1
	const width = Math.min(bins, 2 * halfWidth + 1)
	if (slots * width >= bins) return 1

	let best = 0
	const rotated = new Float64Array(bins)
	const prefix = new Float64Array(bins + 1)
	for (let cut = 0; cut < bins; cut++) {
		for (let index = 0; index < bins; index++) rotated[index] = mass[(cut + index) % bins]
		for (let index = 0; index < bins; index++) prefix[index + 1] = prefix[index] + rotated[index]
		// previous[i] = best mass covered by `arcs` arcs placed entirely inside [i, bins).
		let previous = new Float64Array(bins + 1)
		for (let arcs = 1; arcs <= slots - 1; arcs++) {
			const current = new Float64Array(bins + 1)
			for (let position = bins; position >= 0; position--) {
				const skip = position < bins ? current[position + 1] : 0
				const place = position + width <= bins
					? prefix[position + width] - prefix[position] + previous[position + width]
					: 0
				current[position] = skip > place ? skip : place
			}
			previous = current
		}
		const value = prefix[width] + (slots > 1 ? previous[width] : 0)
		if (value > best) best = value
	}
	return best / total
}

/**
 * One pass over the native-resolution pixels.
 *
 * Reads the OKLab buffer the native evidence already materialised rather than converting from RGB
 * again: `buildNativePaletteEvidence` converts the whole image once and retains `labs`, so this costs
 * a read and no colour conversion. Deliberately not downsampled — a small saturated mark is exactly the
 * evidence this axis exists to notice, and downsampling averages it into its surroundings (charter
 * rule 3).
 */
export function buildArtworkGamut(evidence: Readonly<{ labs: Float32Array; pixelCount: number }>): ArtworkGamut {
	const bins = ARTWORK_GAMUT_POLICY.hueBins
	const mass = new Float64Array(bins)
	const sqMass = new Float64Array(bins)
	const pixelCount = evidence.pixelCount
	let chromaticPixels = 0
	let totalMass = 0
	for (let pixel = 0; pixel < pixelCount; pixel++) {
		const lab = labAt(evidence.labs, pixel)
		const pixelChroma = chroma(lab)
		if (pixelChroma < ARTWORK_GAMUT_POLICY.chromaticFloor) continue
		const bin = Math.floor(hueDegrees(lab)) % bins
		chromaticPixels += 1
		totalMass += pixelChroma
		mass[bin] += pixelChroma
		sqMass[bin] += pixelChroma * pixelChroma
	}
	return {
		mass,
		sqMass,
		totalMass,
		chromaticPixels,
		pixelCount,
		ceiling: coverageCeiling(mass, ARTWORK_GAMUT_POLICY.slots, ARTWORK_GAMUT_POLICY.directionHalfWidthDegrees),
	}
}

/** Raw share of the artwork's chromatic mass the four role colours stand for, in `[0, 1]`. */
export function gamutCoverage(gamut: ArtworkGamut, roles: readonly OKLab[]): number {
	if (gamut.totalMass <= 0) return 1
	const halfWidth = ARTWORK_GAMUT_POLICY.directionHalfWidthDegrees
	const described = roles.map((role) => ({ hue: hueDegrees(role), chroma: chroma(role) }))
	let covered = 0
	for (let bin = 0; bin < gamut.mass.length; bin++) {
		const binMass = gamut.mass[bin]
		if (binMass <= 0) continue
		const binChroma = gamut.sqMass[bin] / binMass
		const binHue = bin + 0.5
		let best = 0
		for (const role of described) {
			if (hueGapDegrees(role.hue, binHue) > halfWidth) continue
			const adequacy = role.chroma >= binChroma ? 1 : role.chroma / binChroma
			if (adequacy > best) best = adequacy
		}
		covered += binMass * best
	}
	return covered / gamut.totalMass
}

/**
 * The axis value: coverage as a share of what four colours could possibly have covered.
 *
 * An artwork whose colour needs eight directions has a ceiling well below 1, and a palette that spends
 * its four slots perfectly on it scores 1 here — which is the whole point of normalising. An artwork
 * with no chromatic content at all scores 1, because there was nothing to represent and a neutral
 * palette is the right answer for it.
 */
export function normalizedGamutCoverage(
	gamut: ArtworkGamut,
	treatment: CompletePaletteTreatment,
	scope: GamutCoverageScope = "all-roles",
	saturation: number = 1,
	fieldShare: number = 1,
	/**
	 * Only read by `"mark-bearing"`, and defaulted to the conservative answer so the ~30 call sites
	 * that predate the scope keep meaning what they meant. See `FOREGROUND_MARK_ADMISSION`.
	 */
	markBearingForeground: boolean = false,
): number {
	if (gamut.totalMass <= 0 || gamut.ceiling <= 0) return 1
	// The field guard: the background and surface earn coverage only in proportion to how faithful
	// this treatment's field already is. Everything the non-field roles cover is earned outright; the
	// *additional* coverage the field buys is shaded. See `fieldShare` at the call site.
	const foregroundEarns = scope === "all-roles" ||
		(scope === "mark-bearing" && markBearingForeground)
	const nonFieldRoles = foregroundEarns
		? [treatment.foreground.oklab, treatment.accent.oklab]
		: [treatment.accent.oklab]
	const withoutField = gamutCoverage(gamut, nonFieldRoles)
	const withField = gamutCoverage(gamut, [
		...nonFieldRoles,
		treatment.background.oklab,
		treatment.surface.oklab,
	])
	// `gamutCoverage` is a max over roles per bin, so adding roles is monotone and the margin is >= 0.
	const raw = withoutField + fieldShare * (withField - withoutField)
	const normalized = raw / gamut.ceiling
	const bounded = normalized > 1 ? 1 : normalized < 0 ? 0 : normalized
	if (saturation >= 1) return bounded
	return bounded >= saturation ? 1 : bounded / saturation
}
