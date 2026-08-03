/**
 * The same-colour bar, in every variant this consequence analysis compares.
 *
 * The question this whole folder answers is narrow: the ruler is calibrated, but its calibration
 * still has width — a 95% interval per region, plus a measured-but-unencoded hue split inside
 * `light-saturated`. Does that remaining width change any decision that is actually made? A variant
 * here is one way of resolving the uncertainty; `decision-flips.ts` runs the contract's own
 * distinctness invariant once per variant and compares verdicts.
 *
 * `research/v3/CONVENTIONS.md` forbids anonymous literals, so every number below is named and
 * carries a provenance tag and a line saying where it comes from. Nothing here is a new
 * measurement: every value is copied from
 * `research/v3/data/calibration/bracketing-round-2-analysis.json`, and `assertBarsMatchSource()`
 * re-reads that file at run time and refuses to continue if a single digit has drifted.
 */

import {
	REGION_CHROMA_BOUNDARY,
	REGION_LIGHTNESS_BOUNDARY,
	SAME_COLOR_BAR_BY_REGION,
} from "../contract/constants.ts"
import { colorRegion, okLabFromColor, rgbToOkLab } from "../contract/color.ts"
import { hueThirdOf } from "../review-server/bracketing.ts"
import type { ColorRegion, OkLab, PaletteColor } from "../contract/types.ts"

/**
 * Per-region low end of the 95% interval on the same-colour bar.
 *
 * `[MEASURED]` — `bracketing-round-2-analysis.json`, `pooled.quadrants[*].confidenceInterval.low`,
 * rounded to five decimals exactly as `SAME_COLOR_BAR_BY_REGION` rounds the point estimates, so the
 * three variants are quoted on one scale.
 */
export const SAME_COLOR_BAR_CI_LOW_BY_REGION = {
	"dark-neutral": 0.00764,
	"dark-saturated": 0.01137,
	"light-neutral": 0.01308,
	"light-saturated": 0.01658,
} as const

/**
 * Per-region high end of the 95% interval on the same-colour bar.
 *
 * `[MEASURED]` — the same source, `confidenceInterval.high`.
 */
export const SAME_COLOR_BAR_CI_HIGH_BY_REGION = {
	"dark-neutral": 0.01137,
	"dark-saturated": 0.01986,
	"light-neutral": 0.02023,
	"light-saturated": 0.03170,
} as const

/**
 * The three hue thirds inside `light-saturated`, as thresholds.
 *
 * `[MEASURED]` — `bracketing-round-2-analysis.json`, `hueSplit.thirds[*].fit.threshold`. This is
 * deferred finding 1 in `constants.ts`: light-saturated is not one population, and the single
 * 0.02293 is a deliberate placeholder that is too loose for warm colours and too tight for violets.
 * The third index is `hueThirdOf()` from the round-2 fixture, i.e. the OKLab hue angle against the
 * 0/120/240° boundaries the fixture actually sampled on.
 *
 * Note the third-2 fit is *separated* (`separated: true`, gap 0.03211–0.04509): its 0.03805 is the
 * middle of a gap, not a fitted crossing. That is a caveat on the variant, not a reason to exclude
 * it — the whole point of variant `hue-split` is to price the finding as measured.
 */
export const SAME_COLOR_BAR_BY_HUE_THIRD = [0.01516, 0.02074, 0.03805] as const

/** The four bar variants this analysis compares, by name. */
export const VARIANT_NAMES = ["point", "ci-low", "ci-high", "hue-split"] as const
export type VariantName = (typeof VARIANT_NAMES)[number]

/** The bar a single colour contributes, under one variant. */
function barForColorUnderVariant(lab: OkLab, region: ColorRegion, variant: VariantName): number {
	switch (variant) {
		case "point":
			return SAME_COLOR_BAR_BY_REGION[region]
		case "ci-low":
			return SAME_COLOR_BAR_CI_LOW_BY_REGION[region]
		case "ci-high":
			return SAME_COLOR_BAR_CI_HIGH_BY_REGION[region]
		case "hue-split":
			// Only light-saturated splits. Every other region keeps its point estimate, so any flip
			// this variant produces is attributable to the hue finding and to nothing else.
			return region === "light-saturated"
				? SAME_COLOR_BAR_BY_HUE_THIRD[hueThirdOf(lab)]
				: SAME_COLOR_BAR_BY_REGION[region]
	}
}

/**
 * A pair's bar under one variant, combining the two colours by the contract's own straddle rule:
 * **the larger of the two**, as `sameColorBar()` in `color.ts` does and for the reasons documented
 * there. The variants differ only in the per-region numbers fed into that rule, never in the rule.
 */
export function makeBarFor(variant: VariantName): (first: PaletteColor, second: PaletteColor) => number {
	return (first, second) =>
		Math.max(
			barForColorUnderVariant(okLabFromColor(first), colorRegion(first), variant),
			barForColorUnderVariant(okLabFromColor(second), colorRegion(second), variant),
		)
}

/** The bar an 8-bit pixel contributes, for the near-pair sampler which never builds PaletteColors. */
export function barForRgbUnderVariant(rgb: readonly [number, number, number], variant: VariantName): number {
	const lab = rgbToOkLab(rgb as [number, number, number])
	return barForColorUnderVariant(lab, regionOfLab(lab), variant)
}

/** `colorRegion()` without the PaletteColor wrapper, for the pixel sampler's hot loop. */
export function regionOfLab(lab: OkLab): ColorRegion {
	// Duplicating the two comparisons rather than the boundaries: the boundaries are imported.
	const chroma = Math.hypot(lab[1], lab[2])
	return `${lab[0] < REGION_LIGHTNESS_BOUNDARY ? "dark" : "light"}-${
		chroma < REGION_CHROMA_BOUNDARY ? "neutral" : "saturated"
	}` as ColorRegion
}

/**
 * Re-read the analysis file and check every constant above against it, to five decimals.
 *
 * A consequence analysis whose inputs have silently drifted from the measurement is worse than no
 * analysis, so this runs before anything else and throws rather than warns.
 */
export async function assertBarsMatchSource(analysisPath: string): Promise<void> {
	const { readFile } = await import("node:fs/promises")
	const analysis = JSON.parse(await readFile(analysisPath, "utf8"))
	const problems: string[] = []
	const round = (value: number) => Number(value.toFixed(5))

	for (const quadrant of analysis.pooled.quadrants) {
		const region = quadrant.quadrant as ColorRegion
		const checks: [string, number, number][] = [
			["point", SAME_COLOR_BAR_BY_REGION[region], round(quadrant.threshold)],
			["ci-low", SAME_COLOR_BAR_CI_LOW_BY_REGION[region], round(quadrant.confidenceInterval.low)],
			["ci-high", SAME_COLOR_BAR_CI_HIGH_BY_REGION[region], round(quadrant.confidenceInterval.high)],
		]
		for (const [name, ours, theirs] of checks) {
			if (ours !== theirs) problems.push(`${region} ${name}: constant ${ours}, analysis ${theirs}`)
		}
	}
	analysis.hueSplit.thirds.forEach((third: { fit: { threshold: number } }, index: number) => {
		const ours = SAME_COLOR_BAR_BY_HUE_THIRD[index]
		const theirs = round(third.fit.threshold)
		if (ours !== theirs) problems.push(`hue third ${index}: constant ${ours}, analysis ${theirs}`)
	})
	if (analysis.hueSplit.quadrant !== "light-saturated") {
		problems.push(`hue split is on ${analysis.hueSplit.quadrant}, not light-saturated`)
	}
	if (JSON.stringify(analysis.hueSplit.boundariesDegrees) !== JSON.stringify([0, 120, 240])) {
		problems.push(`hue boundaries are ${JSON.stringify(analysis.hueSplit.boundariesDegrees)}, not [0,120,240]`)
	}
	if (problems.length > 0) {
		throw new Error(`bar variants no longer match ${analysisPath}:\n  ${problems.join("\n  ")}`)
	}
}
