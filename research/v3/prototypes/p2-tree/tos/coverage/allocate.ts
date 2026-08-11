/**
 * **Identity-coverage allocation.** The accent goes where nothing else went.
 *
 * `../../DECISIONS.md` D9: *"when the artwork carries ≥2 distinct chromatic families beyond the field
 * (green + red here), the four roles should be allocated so both are represented (fg/surface can carry
 * the second family), subject to the text-colour-leads rule and the contract."*
 *
 * ## The rule, in one sentence, as an ordering
 *
 * After `background`, `surface` and `foreground` have resolved under the rules that already exist —
 * **nothing in this module touches them, so D3's text-colour-leads foreground is untouched by
 * construction** — let `R` be the set of families those three already represent. If the accent's own
 * chroma-first choice lands in a family that is already in `R`, the accent ranking is **re-ordered** so
 * that the highest-ranked family *not* in `R` comes first; the walk then descends that family's
 * candidates in their existing chroma-first order before the rest of the pool, and every candidate still
 * passes the whole contract through `roles/assemble.ts` exactly as before.
 *
 * It is a **re-ordering, not a score**: no candidate is admitted that was not admissible, none is
 * excluded, and inside the preferred family D1's chroma-first order is what decides. If nothing in the
 * preferred family survives the assembly walk, the walk reaches the rest of the pool in its original
 * order and the published accent is the one the current candidate publishes.
 *
 * ## Three narrowings, each with a reason
 *
 * The rule fires **only when it strictly increases the number of represented families**:
 *
 *  1. **fewer than two families ⇒ no change.** D9's premise. The census says the artwork carries one
 *     chromatic identity or none; there is nothing to allocate. Byte-identity with the current
 *     candidate is asserted on exactly these covers (`tests/byte-identity.test.ts`).
 *  2. **`R` empty ⇒ no change.** Nothing else in the palette carries a family, so the accent is the sole
 *     carrier and the palette represents exactly one family whichever family the accent picks. Moving it
 *     would trade D1's *"correct shade of red (Strawberry Moon)"* for a colour the reviewer never asked
 *     for, and buy no coverage. D9 is explicit that D1 stays standing pending the coverage redesign; the
 *     redesign therefore does not touch the case D1 was about.
 *  3. **the current accent already in an unrepresented family ⇒ no change.** Coverage is already 2; the
 *     literal reading of "prefers the highest-ranked unrepresented family" would swap one uncovered
 *     family for another at no gain, and again spend D1's choice for nothing.
 *
 * So every cover this module changes is a cover whose palette represents **one more** colour family than
 * it did, and no cover changes for any other reason. That makes the changed-cover count a measurement of
 * the rule rather than of its side effects.
 *
 * ## What it does not do
 *
 * It does not move the foreground or the surface into a second family. D9 permits that (*"fg/surface can
 * carry the second family"*) and this prototype declines it deliberately: the foreground order is
 * text-colour-leads under D3 and identity-over-legibility, both reviewer rulings, and re-ordering it for
 * coverage would put a coverage preference in front of two rulings that were priced directly. The accent
 * is the slot D9's own diagnosis is about. `DESIGN.md` records this as the boundary and names the round
 * item that would price crossing it.
 */

import type { Rgb8 } from "../../../../src/contract/types.ts"
import type { Parse } from "../pipeline.ts"
import { familyCensus, familyOf, familyRepresentedBy, type ColorFamily, type FamilyCensus } from "./census.ts"

export type AllocationDecision = Readonly<{
	census: FamilyCensus
	/** Ranks of the families already represented by background, surface and foreground. Ascending. */
	representedRanks: readonly number[]
	/** The family the accent is steered to, or `null` when the rule does not fire. */
	target: ColorFamily | null
	/** The family the current candidate's accent lands in, or `null` when it is neutral. */
	currentAccentFamily: ColorFamily | null
	/** Machine-readable reason, always set. `coverage-*` prefixed so it reads in a notes array. */
	reason: string
	/** The accent ranking to walk: the preferred family's members first, then the rest, both in pool order. */
	accentOrder: readonly Rgb8[]
	/** True when `accentOrder` differs from the pool it was given. */
	reordered: boolean
}>

/**
 * Decide the accent's preferred family and produce the ranking to walk.
 *
 * `publishedFieldAndForeground` is the three roles that have already resolved — background, surface,
 * foreground — in that order. The accent is excluded on purpose: it is the slot being allocated.
 */
export function allocateCoverage(params: {
	parse: Parse
	accentPool: readonly Rgb8[]
	publishedFieldAndForeground: readonly Rgb8[]
	currentAccent: Rgb8
	census?: FamilyCensus
}): AllocationDecision {
	const { parse, accentPool, publishedFieldAndForeground, currentAccent } = params
	const census = params.census ?? familyCensus(parse)
	const unchanged = (reason: string, target: ColorFamily | null, represented: readonly number[]): AllocationDecision => ({
		census,
		representedRanks: represented,
		target,
		currentAccentFamily: familyOf(census, currentAccent),
		reason,
		accentOrder: accentPool,
		reordered: false,
	})

	if (census.families.length < 2) return unchanged(`coverage-families:${census.families.length}`, null, [])

	const representedRanks = census.families
		.filter((family) => publishedFieldAndForeground.some((published) => familyRepresentedBy(census, family, published)))
		.map((family) => family.rank)

	if (representedRanks.length === 0) return unchanged("coverage-no-op:accent-is-sole-carrier", null, representedRanks)

	const currentAccentFamily = familyOf(census, currentAccent)
	if (currentAccentFamily !== null && !representedRanks.includes(currentAccentFamily.rank)) {
		return unchanged(`coverage-no-op:accent-already-uncovered-family:${currentAccentFamily.rank}`, null, representedRanks)
	}

	const target = census.families.find((family) => !representedRanks.includes(family.rank)) ?? null
	if (target === null) return unchanged("coverage-no-op:all-families-represented", null, representedRanks)

	const preferred: Rgb8[] = []
	const rest: Rgb8[] = []
	for (const color of accentPool) (familyOf(census, color)?.rank === target.rank ? preferred : rest).push(color)
	if (preferred.length === 0) return unchanged(`coverage-no-op:family-${target.rank}-empty-in-accent-pool`, target, representedRanks)

	return {
		census,
		representedRanks,
		target,
		currentAccentFamily,
		reason: `coverage-prefer-family:${target.rank}:${target.representative.hex}:${preferred.length}/${accentPool.length}`,
		accentOrder: [...preferred, ...rest],
		reordered: true,
	}
}
