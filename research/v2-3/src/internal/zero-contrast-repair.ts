import { apcaRawContrast, perceptualDifference } from "./color.ts";

import { rolePairIsUnreadable } from "./palette-core.ts";

import type { CompletePaletteTreatment } from "./palette-core.ts";

import { ALBUM_ARTWORK_PALETTE_V2_POLICY } from "./policy.ts";

import { swapMarkRoles } from "./text-role-restriction.ts";

import type { AlbumArtworkPaletteV2Phase3SupportedGradientMidpointDescriptor } from "./gradient-support.ts";

import type { RGB } from "./types.ts";

/**
 * Repair a published palette carrying a role pair that cannot be seen at all — without touching how
 * candidates are generated or ranked.
 *
 * The wide form of this rule refuses unreadable treatments in `createTreatment`. That is upstream of
 * the capacity-bounded materialization stage, so refusing a candidate that was never going to win
 * still changes what materialization admits and therefore what ranking sees. Measured over the
 * corpus, that cost ten moved artworks for every one it fixed, and it disturbed reviewed-strong
 * outcomes that never had the defect.
 *
 * This form pays none of that, and the reason is worth being precise about, because it is **not**
 * "because it never changes the field". It is because **the entry test is the defect itself**: an
 * artwork whose published palette is clean is never looked at again. A tier that re-picks the whole
 * palette, field included, is therefore just as cascade-free as one that only touches the marks —
 * the wide guard's cascade came from running for everyone, not from changing fields.
 *
 * The repair still prefers rearranging what the ranking already chose over substituting something it
 * did not, and when nothing works it **publishes the defect rather than inventing a palette nobody
 * ranked**. A known-bad pair a caller can measure beats a confident-looking one no evidence supports.
 */

/**
 * The pairs the question can be asked of. A "mark" role is drawn on a "field" colour.
 *
 * They are not equivalent, and the configuration exists so they need not be adopted together:
 *
 * - **The foreground pairs are text.** `foreground` is the reading colour, rendered as body copy on
 *   the background and on the surface panel. Zero contrast there means text nobody can read.
 * - **The accent pairs are not text.** The accent marks icons and small UI elements. Human review
 *   has said in as many words that slight loss of distinguishability there "is not a huge deal", so
 *   an accent repair buys much less than a foreground repair and should never be justified by
 *   arguments about legibility.
 * - **The midpoint pairs are the same two questions asked of the field's third stop.**
 */
export type ZeroContrastPair =
	| "foreground-surface"
	| "foreground-background"
	| "foreground-midpoint"
	| "accent-surface"
	| "accent-background"
	| "accent-midpoint"

export const ZERO_CONTRAST_PAIRS: readonly ZeroContrastPair[] = Object.freeze([
	"foreground-surface",
	"foreground-background",
	"foreground-midpoint",
	"accent-surface",
	"accent-background",
	"accent-midpoint",
])

/** The text pairs, separable from the accent pairs because review treats them differently. */
export const ZERO_CONTRAST_TEXT_PAIRS: readonly ZeroContrastPair[] = Object.freeze(
	["foreground-surface", "foreground-background", "foreground-midpoint"] as ZeroContrastPair[])

/**
 * Which pairs the repair enforces. **Empty means off**, and off is byte-identical to trunk.
 *
 * This is the coverage decision, deliberately expressed as data rather than a boolean, because the
 * pairs have genuinely different costs and different justifications and the corpus was measured per
 * configuration so the choice could be made from numbers. See the arm's `EXPERIMENT.md`.
 *
 * A caller does not list the midpoint pairs separately: they ride along with their mark role. See
 * `withMidpointPairs`.
 */
export const ZERO_CONTRAST_REPAIR_PAIRS: readonly ZeroContrastPair[] = Object.freeze([])

/**
 * Pairs a repair may never newly break, whatever it is trying to fix. Defaults to all of them.
 *
 * Separating this from the enforced set is what lets the accent's status be expressed honestly.
 * Review has said the accent marks icons and small UI elements, not text, and that slight loss of
 * distinguishability there "is not a huge deal". A caller who takes that seriously can protect only
 * the text pairs, which permits a repair to move an unreadable colour off the foreground and onto
 * the accent — cheap, and by review's own account nearly harmless. A caller who does not can leave
 * this at all of them and pay for it in repairs that fail.
 */
export const ZERO_CONTRAST_PROTECTED_PAIRS: readonly ZeroContrastPair[] = ZERO_CONTRAST_PAIRS

/**
 * The midpoint is a published **stop**, not a place the ramp passes through.
 *
 * A zero *crossing* somewhere mid-gradient is a thin line — contrast is zero at one position and
 * recovers on both sides — and it stays exempt for exactly that reason. A foreground that matches
 * the midpoint colour is a different thing: the ramp flattens out around each stop, so the text is
 * unreadable across a significant width of the field rather than along one seam. Review named this
 * on a repaired artwork — *"it's now the midpoint that causes an APCA of 0 … this one feels
 * particularly intense (it's white on white for a significant width)"*.
 *
 * So the midpoint pair is not a separate coverage choice: whenever a mark role's pairs are checked
 * at all, its midpoint pair is checked with them.
 */
export function withMidpointPairs(pairs: readonly ZeroContrastPair[]): readonly ZeroContrastPair[] {
	const expanded = new Set(pairs)
	if (pairs.some((pair) => pair === "foreground-surface" || pair === "foreground-background")) {
		expanded.add("foreground-midpoint")
	}
	if (pairs.some((pair) => pair === "accent-surface" || pair === "accent-background")) {
		expanded.add("accent-midpoint")
	}
	return [...expanded]
}

/**
 * A palette as it would actually be published: the treatment plus the field's third stop.
 *
 * The midpoint is carried as the descriptor the pipeline produced rather than a bare colour, because
 * it is what gets published — a repair that re-picks the field has to hand its own third stop back,
 * not the one the defective palette had.
 */
export type PublishedPalette = Readonly<{
	treatment: CompletePaletteTreatment
	midpoint: AlbumArtworkPaletteV2Phase3SupportedGradientMidpointDescriptor
}>

/** The midpoint colour, or `null` when the field renders with two stops. */
export function publishedMidpointColor(published: PublishedPalette): RGB | null {
	return published.midpoint.kind === "source-supported-three-stop" ? published.midpoint.color.rgb : null
}

/** What the repair did, so a sweep reports the distribution rather than guessing at it. */
export type ZeroContrastRepairOutcome =
	/** The published palette carried no enforced defect; nothing was considered. */
	| "not-needed"
	/** Level 1 — the two mark roles were exchanged. */
	| "swap"
	/** Level 2a — the mark roles were taken from another candidate standing on the same field. */
	| "slate"
	/** Level 2b — the whole palette, field included, was re-picked from the ranked slate. */
	| "repick"
	/** Level 3 — nothing available cleared the bar, and the defect is published unchanged. */
	| "unrepairable"

export type ZeroContrastRepairResult = Readonly<{
	published: PublishedPalette
	outcome: ZeroContrastRepairOutcome
	/** The enforced pairs that were unreadable on the way in, for reporting. */
	violated: readonly ZeroContrastPair[]
}>

/** A candidate the ranking already built, with the position ranking gave it. */
export type RepairSlateEntry = Readonly<{
	key: string
	rank: number
	treatment: CompletePaletteTreatment
}>

const DISTINCTNESS = ALBUM_ARTWORK_PALETTE_V2_POLICY.distinctness

/**
 * The raw magnitude below which APCA reports nothing at all.
 *
 * Measured rather than chosen: sweeping sixteen million luminance pairs finds no reported value
 * between 0 and 7.3, and the clamped form returns exactly zero precisely when the raw magnitude is
 * under this. See `apcaRawContrast`.
 */
export const EXPRESSIBLE_FLOOR_RAW = 10

/**
 * When a mark-role repair counts as *decisive* rather than merely legal.
 *
 * Twice the floor, and stated that way on purpose: the floor is the only non-arbitrary number on
 * this scale, so the one bar that has to be picked here is expressed as a multiple of it instead of
 * invented. A repair that clears the floor by less than its own width has bought very little, and
 * that is exactly the situation where giving up the artwork's field is worth considering.
 */
export const DECISIVE_RAW = 2 * EXPRESSIBLE_FLOOR_RAW

function markColor(published: PublishedPalette, pair: ZeroContrastPair): RGB {
	return pair.startsWith("foreground-") ? published.treatment.foreground.rgb : published.treatment.accent.rgb
}

function fieldColor(published: PublishedPalette, pair: ZeroContrastPair): RGB | null {
	if (pair.endsWith("-surface")) return published.treatment.surface.rgb
	if (pair.endsWith("-background")) return published.treatment.background.rgb
	return publishedMidpointColor(published)
}

/**
 * A collapsed role is the role it collapsed onto, so asking about it separately would report the
 * same pair twice and, worse, would refuse the deliberate two-colour forms this library publishes.
 * A collapsed surface *is* the background and a collapsed accent *is* the foreground. A midpoint
 * pair applies only when the field actually publishes a third stop.
 */
export function pairApplies(published: PublishedPalette, pair: ZeroContrastPair): boolean {
	const collapse = published.treatment.collapse
	if (collapse.surface && (pair === "foreground-surface" || pair === "accent-surface")) return false
	if (collapse.accent && pair.startsWith("accent-")) return false
	if (pair.endsWith("-midpoint") && publishedMidpointColor(published) === null) return false
	return true
}

export function violatedZeroContrastPairs(
	published: PublishedPalette,
	enforced: readonly ZeroContrastPair[] = ZERO_CONTRAST_REPAIR_PAIRS,
): readonly ZeroContrastPair[] {
	return enforced.filter((pair) => {
		if (!pairApplies(published, pair)) return false
		const field = fieldColor(published, pair)
		return field !== null && rolePairIsUnreadable(markColor(published, pair), field)
	})
}

/**
 * The invariants a replacement arrangement has to keep, restated here because the repair runs after
 * `validateTreatment` and nothing downstream will check them again.
 *
 * This is the same set `createTreatment` enforces on the way in — the foreground is a different
 * colour from both field endpoints, and perceptually distinct from the background — so a repaired
 * palette satisfies exactly what an unrepaired one does. It is asked of the candidate's **own**
 * field, because a whole-palette re-pick brings its field with it.
 */
function keepsRoleDistinctness(treatment: CompletePaletteTreatment): boolean {
	const foreground = treatment.foreground
	if (foreground.hex === treatment.background.hex) return false
	if (foreground.hex === treatment.surface.hex) return false
	if (perceptualDifference(treatment.background.rgb, foreground.rgb) < DISTINCTNESS.foregroundField) return false
	return true
}

/** Same rendered field, same gradient claim, same field hypothesis — only the mark roles differ. */
function sharesTheField(candidate: CompletePaletteTreatment, winner: CompletePaletteTreatment): boolean {
	return candidate.background.hex === winner.background.hex &&
		candidate.surface.hex === winner.surface.hex &&
		candidate.gradient === winner.gradient &&
		candidate.sourceFieldHypothesisId === winner.sourceFieldHypothesisId
}

function labelled(option: PublishedPalette, tier: string): PublishedPalette {
	return { ...option, treatment: { ...option.treatment, id: `zero-contrast-repair-${tier}:${option.treatment.id}` } }
}

export function repairZeroContrastPairs(input: Readonly<{
	/** The palette as the pipeline would publish it, midpoint included. */
	published: PublishedPalette
	/** Source-eligible candidates the ranking already built, in ranking order. */
	slate: readonly RepairSlateEntry[]
	/**
	 * Run a candidate treatment through the same downstream stages the winner went through, so a
	 * replacement is judged on what would actually be published for it — its own midpoint included.
	 */
	publish: (treatment: CompletePaletteTreatment) => PublishedPalette
	/** Defaults to the configured set; a harness passes an explicit one to sweep coverage. */
	enforced?: readonly ZeroContrastPair[]
	/** Pairs no repair may newly break. Defaults to all of them. */
	protect?: readonly ZeroContrastPair[]
}>): ZeroContrastRepairResult {
	const published = input.published
	const enforced = withMidpointPairs(input.enforced ?? ZERO_CONTRAST_REPAIR_PAIRS)
	const protect = withMidpointPairs(input.protect ?? ZERO_CONTRAST_PROTECTED_PAIRS)
	const violated = violatedZeroContrastPairs(published, enforced)
	if (violated.length === 0) return { published, outcome: "not-needed", violated }

	const alreadyBroken = new Set(violatedZeroContrastPairs(published, protect))

	/**
	 * A candidate repair counts only if it clears every ENFORCED pair **and** creates no new zero in
	 * ANY protected pair.
	 *
	 * The second half is the one that matters, and it is the trap the mark-role swap walks straight
	 * into: exchanging the two roles does not remove a zero, it *relocates* it. The accent inherits
	 * the exact colour that was unreadable against the surface. Checking only the enforced set would
	 * wave that through whenever the receiving pair happens to be outside the configuration — and
	 * measured on the corpus it did, on 13 of 15 repairs under the narrowest configuration, and on
	 * 290 of 298 under an accent-only one, where the swap was dumping unreadable colours onto the
	 * text role. A repair that fixes one pair by breaking another is not a repair.
	 *
	 * Pairs already broken on the way in are exempt: a configuration that does not enforce them is
	 * not asking them to be fixed, and refusing every candidate over a defect the repair was never
	 * sent to address would simply disable it.
	 */
	const clean = (option: PublishedPalette): boolean => {
		if (!keepsRoleDistinctness(option.treatment)) return false
		if (violatedZeroContrastPairs(option, enforced).length > 0) return false
		return violatedZeroContrastPairs(option, protect).every((pair) => alreadyBroken.has(pair))
	}

	/**
	 * How readable the worst enforced pair is, on the raw scale rather than the clamped one.
	 *
	 * `apcaContrast` cannot rank two repairs that both clear the floor if both land in the same
	 * clamped bucket, and at the bottom of the range it cannot tell "just barely legible" from
	 * "obviously legible" at all. The raw value is continuous, so it can. A palette is only as
	 * readable as its least readable enforced pair, so that is the one that scores it.
	 */
	const worstEnforced = (option: PublishedPalette): number => {
		const measured = enforced
			.filter((pair) => pairApplies(option, pair))
			.map((pair) => {
				const field = fieldColor(option, pair)
				return field === null ? Infinity : Math.abs(apcaRawContrast(markColor(option, pair), field))
			})
		return measured.length === 0 ? Infinity : Math.min(...measured)
	}

	/** How much of the published palette a repair would change. Fewer roles moved is less damage. */
	const disturbance = (treatment: CompletePaletteTreatment): number =>
		(treatment.background.hex === published.treatment.background.hex ? 0 : 1) +
		(treatment.surface.hex === published.treatment.surface.hex ? 0 : 1) +
		(treatment.foreground.hex === published.treatment.foreground.hex ? 0 : 1) +
		(treatment.accent.hex === published.treatment.accent.hex ? 0 : 1)

	// Level 1 — exchange the two mark roles.
	//
	// The cheapest possible repair and the one already trusted: `restrictTextRoleToStrongestClaim`
	// performs exactly this exchange for its own reasons, so the machinery, its contrast relabelling
	// and its published shape are all reviewed. It also undoes the case where that very swap is what
	// created the defect. The field does not move, so the midpoint carries over unchanged.
	//
	// Measured: with the accent protected this can never succeed, for the structural reason above —
	// the accent inherits the offending colour on the same field. It is retained because it becomes
	// live, and does most of the work, the moment the accent is unprotected.
	if (!published.treatment.collapse.accent) {
		const swapped: PublishedPalette = {
			treatment: swapMarkRoles(published.treatment),
			midpoint: published.midpoint,
		}
		if (clean(swapped)) {
			return { published: labelled(swapped, "swap"), outcome: "swap", violated }
		}
	}

	// Every replacement is judged on what would actually be published for it, which is why each
	// candidate goes back through the downstream stages instead of being read as a bare treatment: a
	// different field earns a different midpoint, and the midpoint is one of the things being checked.
	const considered = input.slate
		.map((entry) => ({ entry, option: input.publish(entry.treatment) }))
		.filter(({ option }) => clean(option))

	// Level 2a — take the mark roles from another candidate standing on the same field.
	//
	// A whole candidate is adopted rather than a bare colour spliced in, because a candidate is a
	// complete treatment the pipeline built and validated: its contrast diagnostics, collapse flags,
	// cardinality and scores are all internally consistent, where a spliced colour would leave every
	// one of them describing a palette that no longer exists. Requiring the same background, surface,
	// gradient claim and field hypothesis is what keeps this a *mark-role* repair.
	//
	// Ordering: change as little as possible, then read as well as possible, then take the ranking's
	// own preference, then the candidate key. Fully determined, no ties left to chance.
	// Both the field test and the disturbance score read the PUBLISHED arrangement, not the raw
	// candidate. Publishing can rearrange it — the mark-role swap exchanges the two mark colours, and
	// the supported-gradient path can drop a gradient claim to flat — so judging the candidate would
	// be scoring a palette that is not the one the reviewer would see.
	const sameField = considered
		.filter(({ option }) => sharesTheField(option.treatment, published.treatment))
		.sort((first, second) =>
			disturbance(first.option.treatment) - disturbance(second.option.treatment) ||
			worstEnforced(second.option) - worstEnforced(first.option) ||
			first.entry.rank - second.entry.rank ||
			(first.entry.key < second.entry.key ? -1 : first.entry.key > second.entry.key ? 1 : 0))[0]

	// A mark-role repair that clears the floor decisively ends it: it is the smallest change that
	// works, and nothing is gained by looking further.
	if (sameField && worstEnforced(sameField.option) >= DECISIVE_RAW) {
		return { published: labelled(sameField.option, "slate"), outcome: "slate", violated }
	}

	// Level 2b — re-pick the whole palette, field included.
	//
	// Reached when no mark-role repair exists, or when the best one clears the floor by less than its
	// own width. Sometimes the field is the thing that is wrong: review's preferred fix for the
	// founding case of this whole line of work was to deepen the *surface* so the artwork's own text
	// colour could stay, and no amount of re-picking marks can produce that.
	//
	// This is still cascade-free. Nothing about the entry test changed — an artwork with a clean
	// published palette never reaches this line — so letting the field move costs none of what the
	// wide guard's up-front refusal cost.
	//
	// The tier is restricted to candidates on a *different* field, which is what makes it a distinct
	// tier rather than a re-run of 2a, and it takes the ranking's own preference among them: at this
	// point the question is no longer "what is the smallest change" but "what is the best palette the
	// pipeline built on some other field", and the ranking is the answer to that question the rest of
	// the algorithm already trusts.
	//
	// This ordering is a real choice and the outcome is sensitive to it — ordering by smallest change
	// instead produces a different published palette on the founding case. Neither has been reviewed,
	// so the least-invented rule wins for now and the alternative is measured in the arm's
	// `EXPERIMENT.md` rather than quietly adopted.
	const repick = considered
		.filter(({ option }) => !sharesTheField(option.treatment, published.treatment))
		.sort((first, second) =>
			first.entry.rank - second.entry.rank ||
			(first.entry.key < second.entry.key ? -1 : first.entry.key > second.entry.key ? 1 : 0))[0]

	// With both tiers offering something, moving the field has to actually buy readability. A tie
	// goes to the smaller change.
	if (repick && (!sameField || worstEnforced(repick.option) > worstEnforced(sameField.option))) {
		return { published: labelled(repick.option, "repick"), outcome: "repick", violated }
	}
	if (sameField) {
		return { published: labelled(sameField.option, "slate"), outcome: "slate", violated }
	}

	// Level 3 — publish the defect.
	//
	// Nothing the ranking built can carry the roles, and forcing a colour from somewhere else would
	// be an invention with no evidence behind it. Charter rule 4's standard is that a published
	// colour has to be supported; a repair that cannot meet it should not happen.
	return { published, outcome: "unrepairable", violated }
}
