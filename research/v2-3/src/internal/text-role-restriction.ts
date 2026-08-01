import { ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY } from "./role-obligations.ts";

import { ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY } from "./base-scoring.ts";

import type { AlbumArtworkPaletteV2Phase3IdentityRoleRequirement } from "./base-scoring.ts";

import type { CompletePaletteTreatment, ContrastDiagnostics, IdentityObligation } from "./palette-core.ts";

import type { OKLab } from "./types.ts";

/**
 * Whether the artwork's strongest text claim may take the text role back from the accent.
 *
 * The identity objective already computes **`strongestTextClaim`** — the greatest
 * `foregroundEvidence` among the artwork's own obligation families under a treatment's field —
 * and already protects it from *demotion* (`TEXT_DEMOTION_EVIDENCE`). It has no route to
 * *promotion*: when the winner puts that family in the accent, the classifier's
 * `"simultaneous-role-support"` (good evidence for both roles) is read downstream as no foreground
 * evidence, and the objective prices the artwork's own display type lower in the text role than in
 * the mark role. Human review named the class directly: "a recurring pattern of foreground and
 * accent having their roles flipped compared to what would best match the artwork."
 *
 * `decisive-claim` fires only where the classifier's own two scores settle the question. A family
 * carries the claim when its `foregroundEvidence` is the artwork's greatest; it may take the text
 * role only when its own `foregroundEvidence - accentEvidence` reaches `decisiveRoleMargin` — the
 * margin below which that same classifier refuses to name a role at all (`"close-role-evidence"`) —
 * and only when the colour it would carry there is a chromatic direction at all
 * (`identityDirectionChroma`). No new constant, and the margin compares two readings of one
 * classification rather than a family against whatever the ranking happened to choose.
 *
 * **The move is a true swap and nothing else.** The foreground and the accent exchange their
 * colours; no colour enters the palette that was not already in it, no role is re-sourced, no other
 * field of the treatment changes, and it happens after the field is final, so background, surface,
 * collapse, gradient and midpoint cannot be affected by it at all. Two rounds of review forced that
 * shape:
 *
 * - Round 1 (batch-31) reached the endorsed foreground on `0f58e77c` by *scoring*, and collapsed the
 *   whole field to near-black doing it. Review endorsed the flip and declined the output.
 * - Round 2 (batch-32) preserved the field but re-ranked the winner's own field with the text role
 *   restricted, which let the ranking pick a **new** accent. On `034b1c66` review then wrote the
 *   counterfactual out in full: "I would actually prefer option A because its foreground color
 *   matches the main text of the artwork, but I cannot rate it as high or higher than option B
 *   because it uses a nutmeg accent that doesn't really fit this artwork, or at least I don't see
 *   where it's coming from in the artwork. If the accent was Daguerreotype instead, then I think
 *   they would at least be equally good, or maybe option A would be even better." Daguerreotype is
 *   the colour the exchange displaced. Swapping is what the reviewer asked for; re-sourcing is the
 *   defect, and "I don't see where it's coming from" is the accent-provenance failure review has
 *   established elsewhere as its own class.
 *
 * A swap therefore cannot raise a provenance question: both colours are this winner's own published
 * role colours, each already carrying the source support its role demanded.
 *
 * **Why only the accent, and never an unplaced family.** Measured over the reviewed boundary
 * (`role-assignment-2/EXPERIMENT.md` §3): promoting a claim family that no role holds has no
 * separating property at all — every threshold that reaches the cases review asked for also reaches
 * `9d178a`, `0d5cdb`, `slim` and `1031d1e1`, whose latest verdicts hold their incumbent foreground.
 * Sourcing a colour into a role no candidate gave it is candidate nomination, not role assignment.
 *
 * `chromatic-claim` drops the margin and keeps only the chroma floor. It is kept because it is what
 * establishes that both halves are load-bearing, and because dropping it silently would hide the
 * measurement: see `EXPERIMENT.md` §4 for the two decomposition sweeps.
 *
 * `off` restores the previous behaviour exactly.
 */
export const TEXT_ROLE_RESTRICTION: "off" | "chromatic-claim" | "decisive-claim" = "decisive-claim"

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function chromaOf([, a, b]: OKLab): number {
	return Math.hypot(a, b)
}

/**
 * The obligation family carrying the artwork's strongest text claim under this treatment's field,
 * or `null` when no obligation makes one. Ties break on the obligation's own priority and then on
 * family id, so the answer does not depend on iteration order.
 */
function strongestTextClaimFamily(
	obligations: readonly IdentityObligation[],
	foregroundEvidenceOf: (familyId: string) => number,
): string | null {
	let bestFamily: string | null = null
	let bestEvidence = 0
	let bestPriority = Infinity
	for (const obligation of obligations) {
		const evidence = foregroundEvidenceOf(obligation.familyId)
		if (evidence <= 0) continue
		if (evidence > bestEvidence ||
			(evidence === bestEvidence && (obligation.priority < bestPriority ||
				(obligation.priority === bestPriority && compareAscii(obligation.familyId, bestFamily ?? "") < 0)))) {
			bestFamily = obligation.familyId
			bestEvidence = evidence
			bestPriority = obligation.priority
		}
	}
	return bestFamily
}

/**
 * The same measurements, relabelled.
 *
 * A pair is one role's colour measured against one field sample, and the swap changes neither the
 * two colours nor the field. The multiset of measurements is therefore identical and only which
 * role each belongs to changes: `minimumAbsoluteLc` and `meanAbsoluteLc` are unchanged by
 * construction and no APCA call is repeated. The `sameColor(accent, foreground)` guard that decides
 * whether an accent pair is emitted at all is symmetric in the two colours, so the pair count is
 * unchanged too.
 */
function swapContrastRoles(contrast: ContrastDiagnostics): ContrastDiagnostics {
	return {
		...contrast,
		pairs: contrast.pairs.map((pair) => pair.role === "foreground"
			? { ...pair, role: "accent" as const }
			: { ...pair, role: "foreground" as const }),
	}
}

/**
 * Exchange the two mark roles on an already-final treatment.
 *
 * `scores` is deliberately carried over unchanged and describes the pre-swap arrangement. Nothing
 * reads it after this point — the ranking is over — and trunk already establishes the convention:
 * `applyGradientSupport`'s flat fallback likewise keeps the scores (and the contrast) of the
 * gradient treatment it was derived from. The `id` prefix records that a post-ranking rearrangement
 * happened, exactly as that fallback's `supported-gradient-path-flat:` prefix does.
 */
function swapMarkRoles(treatment: CompletePaletteTreatment): CompletePaletteTreatment {
	return {
		...treatment,
		id: `text-role-swap:${treatment.id}`,
		foreground: treatment.accent,
		accent: treatment.foreground,
		familyRoles: {
			...treatment.familyRoles,
			foreground: treatment.familyRoles.accent,
			accent: treatment.familyRoles.foreground,
		},
		contrast: swapContrastRoles(treatment.contrast),
	}
}

export function restrictTextRoleToStrongestClaim(input: Readonly<{
	winner: CompletePaletteTreatment
	identityObligations: readonly IdentityObligation[]
	identityRoleRequirements: readonly AlbumArtworkPaletteV2Phase3IdentityRoleRequirement[]
}>): CompletePaletteTreatment {
	const winner = input.winner
	if (TEXT_ROLE_RESTRICTION === "off") return winner
	// A collapsed accent renders the foreground: there are not two mark roles to exchange.
	if (winner.collapse.accent) return winner
	// Two roles already showing one colour have nothing to exchange either.
	if (winner.accent.hex === winner.foreground.hex) return winner

	const requirementByFamily = new Map<string, AlbumArtworkPaletteV2Phase3IdentityRoleRequirement>()
	for (const requirement of input.identityRoleRequirements) {
		if (requirement.fieldHypothesisId !== winner.sourceFieldHypothesisId) continue
		if (requirementByFamily.has(requirement.familyId)) continue
		requirementByFamily.set(requirement.familyId, requirement)
	}
	const scoreOf = (familyId: string, key: "foregroundEvidence" | "accentEvidence"): number => {
		const value = requirementByFamily.get(familyId)?.[key]
		return Number.isFinite(value) ? value! : 0
	}

	const claimFamily = strongestTextClaimFamily(
		input.identityObligations,
		(familyId) => scoreOf(familyId, "foregroundEvidence"),
	)
	// Nothing to promote, or the claim already holds the text role.
	if (claimFamily === null || claimFamily === winner.familyRoles.foreground) return winner
	// Only an exchange between the two mark roles. See the note on the constant: promoting a family
	// no role holds has no measured boundary.
	if (claimFamily !== winner.familyRoles.accent) return winner
	// There has to be an identity to relocate. `identityDirections` refuses to count a colour below
	// `identityDirectionChroma` as a direction at all — "a neutral restates whatever the rest of the
	// palette already says" — and the whole premise here is that the artwork's own chromatic mark is
	// being spent on the accent while its text role holds something else. Between two near-neutrals
	// there is no such claim: the swap would be trading one grey for another and calling it identity.
	// Measured, this is where the corpus separates (`EXPERIMENT.md` §4).
	if (chromaOf(winner.accent.oklab) <
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_SELECTOR_POLICY.identityDirectionChroma) return winner
	// The classifier's own margin has to settle the role, at the threshold it uses to say a margin
	// settles anything.
	if (TEXT_ROLE_RESTRICTION === "decisive-claim" &&
		scoreOf(claimFamily, "foregroundEvidence") - scoreOf(claimFamily, "accentEvidence") <
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_ROLE_AWARE_POLICY.decisiveRoleMargin) return winner

	return swapMarkRoles(winner)
}
