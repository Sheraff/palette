/**
 * **Salience gates identity, implemented literally: a region that traces another region's boundary may
 * not lead an identity role.**
 *
 * ## The evidence, and it is measured
 *
 * `DECISIONS.md` D3, the reviewer's rule at P5 round 2: *presence ≠ eligibility — colours present only as
 * "accidental shadows" are ineligible for identity roles.* D12 names the concrete class W-I measured:
 *
 *  - `identity/q1/report.json` item 2. The published foreground `#fcffff` decomposes into five
 *    components, **every one of them with inradius 1 px and boundary fraction 1.0**, whose bounding
 *    boxes are 62,62–577,530 and 577,65–578,578 — a one-pixel rectangle tracing the outline of the
 *    photograph on the cover. The reviewer's verdict on it was *"not a color that is part of the
 *    artwork"*. It published because contract invariant I4 refused the artwork's real type `#1e2221`
 *    (D12) and the walk descended to the halo.
 *  - `identity/q3/report.json`: **30 of the 113 reachability failures** on the merged pool are
 *    `antialias-only` — the same class, at corpus scale.
 *
 * The counter-case that fixes the rule's shape is in the same report: item 1's published `#fcfefd` is a
 * blown highlight whose largest component has **inradius 57.9 px** and boundary fraction 0.116. It is a
 * region of the artwork, it is what the palette should keep publishing, and any rule that demotes it
 * because it is a near-white is the wrong rule.
 *
 * ## The predicate, which is not a threshold
 *
 * > A region **traces a boundary** when it has **no interior pixel**: every pixel of its mask has a
 * > 4-neighbour that is not in the mask.
 *
 * This is a topological property of a pixel set, not a size cut, and it introduces **no constant**:
 *
 *  - it is exactly *"the exact Euclidean inradius is 1 px"*, and 1 px is the **floor of that
 *    measurement's own range** — the smallest value the transform can return for a non-empty mask —
 *    rather than a value anyone chose. A pixel with all four 4-neighbours inside is at squared distance
 *    ≥ 2 from the outside, so `inradius > 1` and `has an interior pixel` are the same statement;
 *  - it is exactly *"the boundary fraction is 1.0"*, which is `pixels.ts`'s other reading of the same
 *    fact (*"a one-pixel antialiasing fringe scores 1.0 by construction"*).
 *
 * So the two attributes D12 names — inradius ≈ 1 px and boundary fraction ≈ 1.0 — are one measurement,
 * and it is one linear pass over a mask the caller already has.
 *
 * ## How it is applied: ordering, never retention
 *
 * A boundary-tracing candidate is **not removed from any pool**. It is a lexicographic level, outermost,
 * ahead of every existing key of the two identity orders:
 *
 *  - the **foreground**'s non-text tier composes it with D3's salience level as `2 · tracing + salience`,
 *    so the order is (interior, salient) → (interior, incidental) → (tracing, salient) → (tracing,
 *    incidental) and inside each the readability ranking is untouched;
 *  - the **accent** takes the tracing level alone, ahead of chroma-from-field. D1 forbids re-introducing
 *    an order that unseats the coral `#d25068`, and the salience level does exactly that
 *    (`integration-NOTES.md` §5) — the tracing level does not, because the coral's node has an interior.
 *    That deviation stands; this level is a different statement and is measured on the acceptance case.
 *
 * Ordering rather than exclusion is what the brief asks for and it is also what keeps the reachability
 * falsifier honest: `stability.retained` is untouched, no node leaves the pool, and the assembly walk can
 * still reach a demoted colour when nothing above it clears the contract.
 *
 * ## Where the level is measured, and where it is not
 *
 * Wherever a mask exists: every text-detector component (its mask is already cut for the distance
 * transform), every accent candidate (its mask is cut for this and nothing else), and every residual
 * triple. A **residual** colour is not a node, so its region is the contract's own **bar mask** — every
 * pixel the regional ruler calls the same colour — which is the unit `identity/pixels.ts` uses and the
 * only one that works: item 1's `#fcfefd` occupies 330 exact-triple pixels scattered across a blown
 * highlight, and only the bar mask shows the 16,937-pixel region they belong to.
 *
 * A **text group's** colour is exempt, exactly as it is exempt from D3's salience level: identity
 * outranks legibility, the artwork's own text colour claims the foreground first, and a rule meant to
 * stop accidental shadows carrying identity may not unseat the one candidate whose identity is not in
 * question. After the coincidence merge (`coincidence.ts`) a group can no longer be one mark counted
 * four times, which was the way a halo used to reach that exemption.
 */

/**
 * **Does this mask have an interior pixel?** One pass, 4-connectivity, no allocation.
 *
 * `mask` is row-major over `width × height` with 1 inside. A pixel on the mask's frame counts as
 * boundary — the frame is outside, the same convention `distanceFieldOf` encodes by padding, and for the
 * same reason: a region touching the edge of its own box must not be credited with thickness it does not
 * have.
 *
 * Returns `false` for an empty mask, which the caller reads as "nothing to lead with", never as "thick".
 */
export function hasInteriorPixel(mask: Uint8Array, width: number, height: number): boolean {
	for (let y = 1; y < height - 1; y += 1) {
		const row = y * width
		for (let x = 1; x < width - 1; x += 1) {
			const index = row + x
			if (mask[index] === 0) continue
			if (mask[index - 1] === 0 || mask[index + 1] === 0 || mask[index - width] === 0 || mask[index + width] === 0) continue
			return true
		}
	}
	return false
}

/**
 * The identity-eligibility level of a candidate: **0 when its region has an interior, 1 when it traces a
 * boundary.** Larger sorts later, and that is the whole of the rule.
 */
export function boundaryTracingLevel(hasInterior: boolean): 0 | 1 {
	return hasInterior ? 0 : 1
}

/**
 * The foreground's composed eligibility level: the tracing level outermost, D3's salience level inside
 * it. Two binary levels in one integer, which is what a lexicographic comparison over them is.
 */
export function identityEligibilityLevel(tracing: 0 | 1, salience: 0 | 1): number {
	return 2 * tracing + salience
}
