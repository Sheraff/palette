/**
 * # L(P) — arm A′'s description length of the palette itself
 *
 * `DESIGN.md` §"The internal experiment": *"`p1ap` (arm A′): E(P) = L(pixels|P) + λ·L(P), where L(P)
 * is the contract object's own serialization cost in bits (24 bits per named colour, gradient
 * boolean, stops, flags)."* This file is L(P), and **only** L(P) — the likelihood half lives in
 * `src/energy/aprime.ts` and the two must not meet here.
 *
 * ## The idea in one paragraph
 *
 * Arm A′'s claim is that the structural penalty does not need to be invented: the contract object
 * *is already a message*, and the number of bits it takes to write down is a prior over palettes
 * that nobody chose. A palette with a gradient and four distinct roles is a longer message than a
 * flat two-colour one, so it has to earn its length back in likelihood. Arm A pays for structure
 * with a hand-counted Ω (surface≠background: 1; ramp: 1; each interior stop: 1; accent≠foreground:
 * 1); arm A′ pays for it in bits. That difference *is* the internal experiment.
 *
 * ## The code being counted
 *
 * What follows is a **cost model over a declared configuration**, not a self-delimiting bitstream.
 * The distinction matters and is stated because an earlier draft of this comment overclaimed it. The
 * partition below assigns a length to each part of a `Configuration` that is already in hand; it is
 * not a format a decoder could parse from bits alone.
 *
 * ```
 *   collapse flags          2 bits   (surfaceCollapsed, accentCollapsed)
 *   gradient flag           1 bit
 *   background             24 bits   — unless the escape names it
 *   surface                24 bits   — only if not collapsed; a collapse is priced as a reference
 *   foreground             24 bits   — unless the escape names it
 *   accent                 24 bits   — only if not collapsed
 *   stop count              2 bits   — only if gradient; a fixed-width field over {2,3,4}
 *   per interior stop      32 bits   — 24 colour + 8 position; only if gradient
 *   escape             +1024 bits   — only if declared, replacing the escaping role's 24
 * ```
 *
 * **Where the analogy is exact.** The conditional parts — surface and accent present only when not
 * collapsed, stop fields present only under the gradient flag — are genuinely prefix-decodable: the
 * flags precede the fields whose presence they govern, so reading `surfaceCollapsed = 1` is enough to
 * know there is no surface field and that surface is a back-reference to the background. Two bits buy
 * up to forty-eight, and *that* is where arm A′'s prior gets its preference for simple palettes. It is
 * derived, not asserted, and it does not depend on the stream reading claim.
 *
 * **Where it is not.** The escape partition is **not** uniquely decodable as written. There is no
 * escape-present flag, and the 1024-bit escape blob is listed after the role fields — so a reader
 * arriving at the role fields has nothing telling it whether one of them is absent, nor which. A
 * single bit before the role fields, saying an escape follows and stating which role it names, would
 * close it: prefix the roles with 1 bit (escape present) and, when set, 2 bits for the role, and every
 * configuration becomes parseable left to right.
 *
 * **Why that bit is not taken.** It would add 1 bit to escape configurations, which already carry
 * `ESCAPE_COST_BITS = 1024` — a barrier chosen at nine times the entire 114-bit in-artwork span
 * precisely so that no in-artwork configuration can be outranked by an escape one. A 1-bit correction
 * next to a 1024-bit barrier changes no comparison this prototype can make, and adding it would buy a
 * property (self-delimitation) that nothing here consumes. So the code is left as it is and the claim
 * is narrowed to what the code does.
 *
 * **Gradient endpoints are free.** The reviewer's 2026-08-04 ruling pins `stops[0].color` to the
 * background and `stops[last].color` to the surface, and invariant 1 pins their positions to exactly
 * `POSITION_MIN` and `POSITION_MAX`. A decoder that has already read the two field roles can
 * reconstruct both endpoints with zero further bits. Only interior stops carry information.
 *
 * ## Achievable range, quoted because two constants below are justified against it
 *
 * Over all in-artwork configurations (no escape):
 * - minimum  = 2 + 1 + 24 (bg) + 24 (fg) = **51 bits** — both roles collapsed, flat field.
 * - maximum  = 2 + 1 + 96 + 2 + 2·32 = **165 bits** — four distinct roles, four-stop ramp.
 *
 * So the entire structural vocabulary of P1 spans **114 bits**.
 */

import type { Configuration } from "./types.ts"

// ---------------------------------------------------------------------------------------------
// The constants
// ---------------------------------------------------------------------------------------------

/**
 * Bits to name one colour.
 *
 * `[DERIVED]` — not a choice. `PHASE_0_DECISIONS.md` §4 invariant 2 makes every published colour an
 * exact 8-bit sRGB triple, so the alphabet is the 2^24-element cube and a flat code over it is
 * exactly 24 bits. Nothing to calibrate: a different number here would be a claim that the contract
 * publishes something other than 8-bit triples.
 *
 * (A sharper code exists — the artwork's own colour histogram is a much better prior over which
 * triple a role will be than the uniform one, and would typically cost far fewer than 24 bits. That
 * is deliberately *not* used, because it would make L(P) a function of the image and so double-count
 * evidence already carried by L(pixels|P). L(P) prices structure; L(pixels|P) prices fit.)
 */
export const COLOR_NAME_BITS = 24

/** `[DERIVED]` — one boolean, one bit. `gradient: boolean` in the configuration. */
export const GRADIENT_FLAG_BITS = 1

/**
 * `[DERIVED]` — two booleans, two bits. `surfaceCollapsed` and `accentCollapsed`, always
 * transmitted, because the decoder needs them *before* it knows how many colour fields follow.
 */
export const COLLAPSE_FLAG_BITS = 2

/**
 * Bits for the stop count, sent only when the gradient flag is set.
 *
 * `[UNCALIBRATED]` — a fixed-width field over `MIN_GRADIENT_STOPS..MAX_GRADIENT_STOPS` = {2, 3, 4},
 * three values in a two-bit field with one code unused. The tight arithmetic code would be
 * log2(3) ≈ 1.585 bits and a code matching the *observed* distribution of stop counts would be
 * different again — but a per-configuration constant that is identical for every gradient
 * configuration cannot change any ranking among them, and against a flat configuration it shifts the
 * gradient/flat comparison by at most 0.415 bits, roughly a hundredth of one interior stop. Two bits
 * is chosen because it is the honest fixed-width answer and because it is exactly reproducible by
 * hand.
 */
export const GRADIENT_STOP_COUNT_BITS = 2

/**
 * Bits per interior stop position.
 *
 * `[UNCALIBRATED]` — the t-parameter is a real in (0,1) and a real needs a quantiser before it has a
 * length at all. Eight bits puts interior stops on a 1/256 grid, which is finer than the ramp is
 * ever inspected at and coarse enough to stay a small term next to the stop's own 24 colour bits.
 *
 * **Refinement invariance.** Changing this constant by k bits changes L(P) by exactly
 * `k · (number of interior stops)` — an affine function of the interior-stop count and of nothing
 * else. It is therefore *indistinguishable from a redefinition of the per-stop structural charge*:
 * for every choice of this constant there is a λ-and-per-stop-charge reparameterisation under which
 * every configuration keeps the same total. So no comparison this prototype makes between two
 * configurations with the same number of interior stops can depend on it at all, and comparisons
 * across stop counts depend on it only through a term the mandatory λ sweep (`DESIGN.md` §2,
 * λ ∈ {¼, ½, 1, 2, 4}) already varies by a factor of sixteen. Calibrating it would be calibrating λ
 * twice.
 */
export const STOP_POSITION_BITS = 8

/**
 * The escape penalty.
 *
 * `[UNCALIBRATED]` — a barrier, not a measured prior, and the derivation is stated so it can be
 * argued with:
 *
 * *What it must do.* `DESIGN.md` §6 fixes the escape as a **branch**, not an alternative:
 * *"search in-artwork feasible set; only if EMPTY, evaluate the two escape configurations."* The
 * reviewer's grant says the same thing in words — *"only when there is genuinely no other way to
 * produce a 2-color palette"*. L(P) must not fight that ordering. So the requirement is: **no
 * in-artwork configuration is ever outranked, on structural cost, by an escape configuration.**
 *
 * *What that forces.* The achievable in-artwork range of L(P) is 51..165 bits (see the header), a
 * span of 114. Any penalty exceeding that span makes the requirement hold by construction. 1024 is
 * 2^10, about 9× the span and 6× the maximum — comfortably outside, chosen at a round power of two
 * so that nobody reads precision into it.
 *
 * *The measured alternative, and why it is rejected.* One could price the escape as a prior from the
 * evidence: `BELONGS_STUDY.md` reports exactly one of 1,397 endorsed role colours completely absent
 * from its artwork, giving −log2(1/1397) ≈ 10.4 bits. That is a *smaller* charge than naming one
 * ordinary colour (24 bits), so an MDL search under it would reach for `#000000` to save bits
 * whenever a dark background was expensive to name — inverting the ruling. The frequency is real
 * evidence about how often the branch fires; it is not a price for taking it.
 *
 * *Consequence, stated.* Because this dominates, arm A′'s L(P) contributes nothing to *choosing
 * between* the two escape configurations (white-background vs black-foreground); that choice falls
 * entirely to the likelihood term, which is the correct place for it.
 */
export const ESCAPE_COST_BITS = 1024

// ---------------------------------------------------------------------------------------------
// The function
// ---------------------------------------------------------------------------------------------

/**
 * Where the bits went. Sums to `bits`; each field is independently hand-checkable.
 */
export type SerializationBreakdown = Readonly<{
	/** 24 bits per *named* colour. Collapsed roles and the escaping role contribute nothing. */
	roles: number
	/** Always `COLLAPSE_FLAG_BITS`. */
	collapseFlags: number
	/** Always `GRADIENT_FLAG_BITS`. */
	gradientFlag: number
	/** `GRADIENT_STOP_COUNT_BITS` when the field is a ramp, else 0. */
	stopCount: number
	/** `(COLOR_NAME_BITS + STOP_POSITION_BITS)` per **interior** stop. Endpoints are free. */
	stops: number
	/** `ESCAPE_COST_BITS` when declared, else 0. */
	escape: number
}>

export type SerializationCost = Readonly<{
	bits: number
	breakdown: SerializationBreakdown
}>

/**
 * L(P), in bits. Pure: same configuration in, same number out, no image, no state, no RNG.
 *
 * Reads only the fields it prices. In particular it does **not** check legality — an infeasible
 * configuration still has a length, and `DESIGN.md` requires the energy to be *"a function of any
 * contract-legal palette"* with legality decided by `feasibility()` alone. A cost function that
 * refused illegal input would be a second feasible set.
 *
 * One structural subtlety, and the only place this function looks at two fields at once: a role
 * named by `escape` is **not** charged `COLOR_NAME_BITS`. Its colour is not drawn from the artwork's
 * alphabet at all — the escape declaration itself identifies it, and `ESCAPE_COST_BITS` covers that
 * declaration whole (role and which of the two literals included; both are far below the noise of a
 * 1024-bit barrier). Its collapsed partner remains a reference, as always.
 */
export function serializationCost(config: Configuration): SerializationCost {
	const escapedRole = config.escape === null ? null : config.escape.role

	let roles = 0
	// Background and foreground are always published as distinct roles — neither is ever a reference,
	// because the two sanctioned collapses (`surface → background`, `accent → foreground`) both point
	// *at* them. Each is free only when the escape names it.
	if (escapedRole !== "background") roles += COLOR_NAME_BITS
	if (escapedRole !== "foreground") roles += COLOR_NAME_BITS
	// Surface and accent are named only when they are genuinely their own colour.
	if (!config.surfaceCollapsed) roles += COLOR_NAME_BITS
	if (!config.accentCollapsed) roles += COLOR_NAME_BITS

	const interiorStops = config.gradient ? Math.max(0, config.stops.length - 2) : 0

	const breakdown: SerializationBreakdown = {
		roles,
		collapseFlags: COLLAPSE_FLAG_BITS,
		gradientFlag: GRADIENT_FLAG_BITS,
		stopCount: config.gradient ? GRADIENT_STOP_COUNT_BITS : 0,
		stops: interiorStops * (COLOR_NAME_BITS + STOP_POSITION_BITS),
		escape: config.escape === null ? 0 : ESCAPE_COST_BITS,
	}

	const bits = breakdown.roles +
		breakdown.collapseFlags +
		breakdown.gradientFlag +
		breakdown.stopCount +
		breakdown.stops +
		breakdown.escape

	return { bits, breakdown }
}

/**
 * The two bounds quoted in this file's header, computed rather than asserted, so the escape
 * penalty's derivation stays true if a constant above ever moves.
 *
 * `MIN` — both roles collapsed, flat field, no escape. `MAX` — four distinct roles, four-stop ramp.
 */
export const IN_ARTWORK_COST_BOUNDS = {
	min: COLLAPSE_FLAG_BITS + GRADIENT_FLAG_BITS + 2 * COLOR_NAME_BITS,
	max: COLLAPSE_FLAG_BITS +
		GRADIENT_FLAG_BITS +
		4 * COLOR_NAME_BITS +
		GRADIENT_STOP_COUNT_BITS +
		2 * (COLOR_NAME_BITS + STOP_POSITION_BITS),
} as const
