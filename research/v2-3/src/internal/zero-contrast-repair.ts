import { apcaRawContrast, perceptualDifference } from "./color.ts";

import { rolePairIsUnreadable } from "./palette-core.ts";

import type { CompletePaletteTreatment } from "./palette-core.ts";

import { ALBUM_ARTWORK_PALETTE_V2_POLICY } from "./policy.ts";

import { swapMarkRoles } from "./text-role-restriction.ts";

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
 * This form pays none of that. Generation, materialization, ranking and selection run exactly as
 * before and produce exactly the same winner; only afterwards, and only when the published palette
 * actually carries the defect, is anything changed. An artwork without it cannot be reached at all,
 * because the entry test *is* the defect.
 *
 * The repair is deliberately unambitious. It prefers rearranging what the ranking already chose over
 * substituting something it did not, and when neither works it **publishes the defect rather than
 * inventing a palette nobody ranked**. A known-bad pair a caller can measure beats a
 * confident-looking one no evidence supports.
 */

/**
 * The four pairs the question can be asked of. A "mark" role is drawn on a "field" role.
 *
 * They are not equivalent, and the configuration exists so they need not be adopted together:
 *
 * - **The foreground pairs are text.** `foreground` is the reading colour, rendered as body copy on
 *   the background and on the surface panel. Zero contrast there means text nobody can read.
 * - **The accent pairs are not text.** The accent marks icons and small UI elements. Human review
 *   has said in as many words that slight loss of distinguishability there "is not a huge deal", so
 *   an accent repair buys much less than a foreground repair and should never be justified by
 *   arguments about legibility.
 */
export type ZeroContrastPair =
	| "foreground-surface"
	| "foreground-background"
	| "accent-surface"
	| "accent-background"

export const ZERO_CONTRAST_PAIRS: readonly ZeroContrastPair[] = Object.freeze([
	"foreground-surface",
	"foreground-background",
	"accent-surface",
	"accent-background",
])

/** The text pairs, separable from the accent pairs because review treats them differently. */
export const ZERO_CONTRAST_TEXT_PAIRS: readonly ZeroContrastPair[] =
	Object.freeze(["foreground-surface", "foreground-background"] as ZeroContrastPair[])

/**
 * Which pairs the repair enforces. **Empty means off**, and off is byte-identical to trunk.
 *
 * This is the coverage decision, deliberately expressed as data rather than a boolean, because the
 * four pairs have genuinely different costs and different justifications and the corpus was measured
 * per configuration so the choice could be made from numbers. See the arm's `EXPERIMENT.md` for the
 * blast radius of each.
 */
export const ZERO_CONTRAST_REPAIR_PAIRS: readonly ZeroContrastPair[] = Object.freeze([])

/** What the repair did, so a sweep reports the distribution rather than guessing at it. */
export type ZeroContrastRepairOutcome =
	/** The published palette carried no enforced defect; nothing was considered. */
	| "not-needed"
	/** Level 1 — the two mark roles were exchanged. */
	| "swap"
	/** Level 2 — the mark roles were taken from another candidate standing on the same field. */
	| "slate"
	/** Level 3 — nothing available cleared the bar, and the defect is published unchanged. */
	| "unrepairable"

export type ZeroContrastRepairResult = Readonly<{
	winner: CompletePaletteTreatment
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

function pairIsUnreadable(treatment: CompletePaletteTreatment, pair: ZeroContrastPair): boolean {
	switch (pair) {
		case "foreground-surface": return rolePairIsUnreadable(treatment.foreground.rgb, treatment.surface.rgb)
		case "foreground-background": return rolePairIsUnreadable(treatment.foreground.rgb, treatment.background.rgb)
		case "accent-surface": return rolePairIsUnreadable(treatment.accent.rgb, treatment.surface.rgb)
		case "accent-background": return rolePairIsUnreadable(treatment.accent.rgb, treatment.background.rgb)
	}
}

/**
 * A collapsed role is the role it collapsed onto, so asking about it separately would report the
 * same pair twice and, worse, would refuse the deliberate two-colour forms this library publishes.
 * A collapsed surface *is* the background and a collapsed accent *is* the foreground.
 */
function pairApplies(treatment: CompletePaletteTreatment, pair: ZeroContrastPair): boolean {
	if (treatment.collapse.surface && (pair === "foreground-surface" || pair === "accent-surface")) return false
	if (treatment.collapse.accent && (pair === "accent-surface" || pair === "accent-background")) return false
	return true
}

export function violatedZeroContrastPairs(
	treatment: CompletePaletteTreatment,
	enforced: readonly ZeroContrastPair[] = ZERO_CONTRAST_REPAIR_PAIRS,
): readonly ZeroContrastPair[] {
	return enforced.filter((pair) => pairApplies(treatment, pair) && pairIsUnreadable(treatment, pair))
}

/**
 * The invariants a replacement arrangement has to keep, restated here because the repair runs after
 * `validateTreatment` and nothing downstream will check them again.
 *
 * This is the same set `createTreatment` enforces on the way in — the foreground is a different
 * colour from both field endpoints, and perceptually distinct from the background — so a repaired
 * palette satisfies exactly what an unrepaired one does.
 */
function foregroundKeepsRoleDistinctness(
	field: CompletePaletteTreatment,
	foreground: CompletePaletteTreatment["foreground"],
): boolean {
	if (foreground.hex === field.background.hex) return false
	if (foreground.hex === field.surface.hex) return false
	if (perceptualDifference(field.background.rgb, foreground.rgb) < DISTINCTNESS.foregroundField) return false
	return true
}

/** Same rendered field, same gradient claim, same field hypothesis — only the mark roles differ. */
function sharesTheField(candidate: CompletePaletteTreatment, winner: CompletePaletteTreatment): boolean {
	return candidate.background.hex === winner.background.hex &&
		candidate.surface.hex === winner.surface.hex &&
		candidate.gradient === winner.gradient &&
		candidate.sourceFieldHypothesisId === winner.sourceFieldHypothesisId
}

/**
 * Pairs a repair may never newly break, whatever it is trying to fix. Defaults to all four.
 *
 * Separating this from `enforced` is what lets the accent's status be expressed honestly. Review has
 * said the accent marks icons and small UI elements, not text, and that slight loss of
 * distinguishability there "is not a huge deal". A caller who takes that seriously can protect only
 * the text pairs, which permits a repair to move an unreadable colour off the foreground and onto
 * the accent — cheap, and by review's own account nearly harmless. A caller who does not can leave
 * this at all four and pay for it in repairs that fail.
 *
 * It is a genuine choice with measured consequences on both sides, which is why it is a parameter
 * and not a decision this file makes.
 */
export const ZERO_CONTRAST_PROTECTED_PAIRS: readonly ZeroContrastPair[] = ZERO_CONTRAST_PAIRS

export function repairZeroContrastPairs(input: Readonly<{
	winner: CompletePaletteTreatment
	/** Source-eligible candidates the ranking already built, in ranking order. */
	slate: readonly RepairSlateEntry[]
	/** Defaults to the configured set; a harness passes an explicit one to sweep coverage. */
	enforced?: readonly ZeroContrastPair[]
	/** Pairs no repair may newly break. Defaults to all four. */
	protect?: readonly ZeroContrastPair[]
}>): ZeroContrastRepairResult {
	const winner = input.winner
	const enforced = input.enforced ?? ZERO_CONTRAST_REPAIR_PAIRS
	const protect = input.protect ?? ZERO_CONTRAST_PROTECTED_PAIRS
	const violated = violatedZeroContrastPairs(winner, enforced)
	if (violated.length === 0) return { winner, outcome: "not-needed", violated }

	const alreadyBroken = new Set(violatedZeroContrastPairs(winner, protect))

	/**
	 * A candidate repair counts only if it clears every ENFORCED pair **and** creates no new zero in
	 * ANY pair, enforced or not.
	 *
	 * The second half is the one that matters, and it is the trap the mark-role swap walks straight
	 * into: exchanging the two roles does not remove a zero, it *relocates* it. The accent inherits
	 * the exact colour that was unreadable against the surface. Checking only the enforced set would
	 * wave that through whenever the receiving pair happens to be outside the configuration — and
	 * measured on the corpus it did, on 13 of 15 repairs under the narrowest configuration, and on
	 * 290 of 298 under an accent-only one, where the swap was dumping unreadable colours onto the
	 * text role. A repair that fixes one pair by breaking another is not a repair.
	 *
	 * Pairs that were already broken on the way in are exempt: a configuration that does not enforce
	 * them is not asking them to be fixed, and refusing every candidate for a defect the repair was
	 * never sent to address would simply disable it.
	 */
	const clean = (treatment: CompletePaletteTreatment): boolean => {
		if (violatedZeroContrastPairs(treatment, enforced).length > 0) return false
		return violatedZeroContrastPairs(treatment, protect).every((pair) => alreadyBroken.has(pair))
	}

	/**
	 * How readable the text roles are, on the raw scale rather than the clamped one.
	 *
	 * `apcaContrast` cannot rank two repairs that both clear the floor if both land in the same
	 * clamped bucket, and it cannot see the difference between "just barely legible" and "obviously
	 * legible" at the bottom of the range at all. The raw value is continuous, so it can. The worst
	 * enforced text pair is the one that decides, because a palette is only as readable as its least
	 * readable text.
	 */
	const textReadability = (treatment: CompletePaletteTreatment): number => {
		const measured = enforced
			.filter((pair) => pair.startsWith("foreground-") && pairApplies(treatment, pair))
			.map((pair) => Math.abs(pair === "foreground-surface"
				? apcaRawContrast(treatment.foreground.rgb, treatment.surface.rgb)
				: apcaRawContrast(treatment.foreground.rgb, treatment.background.rgb)))
		return measured.length === 0 ? 0 : Math.min(...measured)
	}

	/** How much of the published palette a repair would change. Fewer roles moved is less damage. */
	const disturbance = (treatment: CompletePaletteTreatment): number =>
		(treatment.background.hex === winner.background.hex ? 0 : 1) +
		(treatment.surface.hex === winner.surface.hex ? 0 : 1) +
		(treatment.foreground.hex === winner.foreground.hex ? 0 : 1) +
		(treatment.accent.hex === winner.accent.hex ? 0 : 1)

	// Level 1 — exchange the two mark roles.
	//
	// The cheapest possible repair and the one already trusted: `restrictTextRoleToStrongestClaim`
	// performs exactly this exchange for its own reasons, so the machinery, its contrast relabelling
	// and its published shape are all reviewed. It also undoes the case where that very swap is what
	// created the defect — the arrangement before the exchange was the one that passed every gate.
	if (!winner.collapse.accent && foregroundKeepsRoleDistinctness(winner, winner.accent)) {
		const swapped = swapMarkRoles(winner)
		if (clean(swapped)) {
			return {
				winner: { ...swapped, id: `zero-contrast-repair-swap:${winner.id}` },
				outcome: "swap",
				violated,
			}
		}
	}

	// Level 2 — take the mark roles from another candidate standing on the same field.
	//
	// A whole candidate is adopted rather than a bare colour spliced in, because a candidate is a
	// complete treatment the pipeline built and validated: its contrast diagnostics, collapse flags,
	// cardinality and scores are all internally consistent, where a spliced colour would leave every
	// one of them describing a palette that no longer exists. Requiring the same background, surface,
	// gradient claim and field hypothesis is what keeps this a *mark-role* repair: the field the
	// reviewer sees is byte-identical, so the gradient and its earned midpoint remain exactly the
	// ones selection chose.
	//
	// Ordering, in words: change as little as possible, and among equally small changes take the one
	// whose text reads best on the raw scale. Ranking position only breaks what those two leave tied,
	// and the candidate key breaks what ranking leaves tied, so the choice is fully determined.
	const replacement = input.slate
		.filter(({ treatment }) => sharesTheField(treatment, winner))
		.filter(({ treatment }) => clean(treatment))
		.filter(({ treatment }) => foregroundKeepsRoleDistinctness(winner, treatment.foreground))
		.sort((first, second) =>
			disturbance(first.treatment) - disturbance(second.treatment) ||
			textReadability(second.treatment) - textReadability(first.treatment) ||
			first.rank - second.rank ||
			(first.key < second.key ? -1 : first.key > second.key ? 1 : 0))[0]
	if (replacement) {
		return {
			winner: { ...replacement.treatment, id: `zero-contrast-repair-slate:${replacement.treatment.id}` },
			outcome: "slate",
			violated,
		}
	}

	// Level 3 — publish the defect.
	//
	// Nothing the ranking built on this field can carry the roles, and forcing a colour from
	// somewhere else would be an invention with no evidence behind it. Charter rule 4's standard is
	// that a published colour has to be supported; a repair that cannot meet it should not happen.
	return { winner, outcome: "unrepairable", violated }
}
