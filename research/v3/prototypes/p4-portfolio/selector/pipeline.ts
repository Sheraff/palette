/**
 * One cover, end to end: substrate → currency → selection.
 *
 * The order is SPEC §2's and it is load-bearing. **Immateriality is assessed first**, on the
 * palettes alone, and it is what decides whether a margin is measured at all: where every pair
 * agrees on every role at the contract's bar, the selection is recorded as immaterial and **no
 * bootstrap is paid for** — arm-c′ §2.3b's "no decision, no risk".
 *
 * Every member is nevertheless **priced** on every cover, immaterial or not. That is deliberate and
 * is the one place this file departs from a literal reading of §2.3b's "before any tie-break": the
 * milestone's deliverable is arm-c′ §8's bit table, which publishes `L(palette)`, residual bits and
 * total for every member on every cover, and a table that went blank on the immaterial covers would
 * be reporting the selector's shortcut rather than the currency's behaviour. The saving §2.3b is
 * about — the bootstrap, which is the only part whose cost is unbounded — is taken.
 *
 * Where the palettes do differ the cheapest total wins and the margin against the runner-up is
 * measured by block bootstrap.
 *
 * Nothing here knows what a member *is*. `MemberPalette` is a slug and a `Palette`; the slug is
 * carried so a result can be labelled and is never read by the arithmetic.
 */

import { PAIR_SIZE } from "./constants.ts"
import { priceMember } from "./currency.ts"
import { assessMateriality, blockBootstrap, decidedBySchemaPrice, rankMembers } from "./select.ts"
import { buildSubstrate } from "./substrate.ts"
import type { DecodedImage, MemberPalette, Selection, Substrate } from "./types.ts"

/** Price every member on one cover and select, at one lattice resolution. */
export function selectOnCover(
	image: DecodedImage,
	members: readonly MemberPalette[],
	resolution: number,
): { selection: Selection; substrate: Substrate } {
	const substrate = buildSubstrate(image, resolution)
	// Immateriality is a statement about the palettes, so it is assessed before anything touches σ and
	// survives even when the cover turns out to be unpriceable.
	const materiality = assessMateriality(members)
	const base = {
		contentHash: image.contentHash,
		imagePath: image.path,
		sigma: substrate.sigma,
		materiality,
	}

	// The refusal (see `Unpriceable`). σ is the currency's only scale; without it there is no
	// currency, and the alternative — a noise floor — is the free scale arm-c′ §2.3a forbids and the
	// hand-set constant F2 catches. Measured on demo-20: four covers of twenty.
	if (!(substrate.sigma > 0)) {
		return {
			selection: {
				...base,
				unpriceable: {
					reason:
						"the measured noise scale is zero: over half of this file's horizontally adjacent " +
						"pixel pairs are byte-identical, so the median absolute difference arm-c′ §2.1 " +
						"specifies has nothing to resolve and the residual has no scale to be priced at",
					sigma: substrate.sigma,
				},
				prices: [],
				winner: null,
				runnerUp: null,
				marginBits: null,
				tieBrokenBySchemaPrice: false,
				bootstrap: null,
			},
			substrate,
		}
	}

	const prices = members.map((member) => priceMember(member.slug, member.palette, image, substrate))
	const nonFinite = prices.filter((price) => !Number.isFinite(price.totalBits))
	if (nonFinite.length > 0) {
		// Belt and braces: σ > 0 should make every total finite, so if one is not, the cause is
		// something this code does not yet understand and a ranking over NaN would silently be the
		// sort's input order rather than a decision.
		return {
			selection: {
				...base,
				unpriceable: {
					reason: `non-finite total for ${nonFinite.map((price) => price.slug).join(", ")} at σ = ${substrate.sigma}`,
					sigma: substrate.sigma,
				},
				prices,
				winner: null,
				runnerUp: null,
				marginBits: null,
				tieBrokenBySchemaPrice: false,
				bootstrap: null,
			},
			substrate,
		}
	}

	const ranked = rankMembers(prices)
	const winner = ranked[0]!
	const runnerUp = ranked.length >= PAIR_SIZE ? ranked[1]! : null

	let bootstrap = null
	if (materiality.material && runnerUp !== null) {
		const difference = new Float64Array(substrate.cellCount)
		for (let cell = 0; cell < substrate.cellCount; cell += 1) {
			difference[cell] = winner.perCellResidualBits[cell]! - runnerUp.perCellResidualBits[cell]!
		}
		bootstrap = blockBootstrap(
			difference,
			winner.schema.bits - runnerUp.schema.bits,
			resolution,
			image.contentHash,
		)
	}

	return {
		selection: {
			...base,
			unpriceable: null,
			prices,
			winner: winner.slug,
			runnerUp: runnerUp?.slug ?? null,
			marginBits: runnerUp === null ? null : runnerUp.totalBits - winner.totalBits,
			tieBrokenBySchemaPrice: decidedBySchemaPrice(ranked),
			bootstrap,
		},
		substrate,
	}
}

/**
 * The member ranking on one cover — the object the C stability sweep compares across rungs.
 *
 * `null` on an unpriceable cover, because there is no ranking. Returning an empty array or the input
 * order would let the sweep count a refusal as agreement, which is exactly how the first run of this
 * milestone reported "20/20 stable" while four of those twenty were sorting `NaN`s.
 */
export function rankingOf(selection: Selection): string[] | null {
	if (selection.unpriceable !== null) return null
	return rankMembers(selection.prices).map((price) => price.slug)
}
