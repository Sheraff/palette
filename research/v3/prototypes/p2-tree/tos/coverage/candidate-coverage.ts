/**
 * `p2-tos-coverage` — the identity-coverage allocation prototype, behind its own candidate id.
 *
 * **This is a design prototype, not an integration.** `../../DECISIONS.md` D9 made identity-coverage a
 * cycle-3 design item; whether it lands in `../candidate.ts` is a later, sequenced decision that a round
 * prices. So this file is a *wrapper*: it runs the published candidate, asks `census.ts` what families
 * the artwork carries, and — on the covers where the answer changes the allocation — re-walks the accent
 * ranking with the preferred family in front. Everything else is the published candidate's, unchanged.
 *
 * ## Why a wrapper and not a fork of `candidate.ts`
 *
 * D9's acceptance condition is that behaviour be **byte-identical to the current candidate** wherever the
 * census finds fewer than two families. A fork would make that a property to be tested and maintained; a
 * wrapper makes it a property of the control flow — on those covers this module *returns the published
 * candidate's own object*, and there is nothing left to drift.
 *
 * Where the rule does fire, the palette is still built by the published candidate's own construction:
 * `assemble` below is derived from the baseline `Palette`, so gradient, collapse flags and the whole
 * metadata block — including `algorithmVersion` — are carried across rather than restated. Two
 * consequences, both deliberate:
 *
 *  - `metadata.algorithmVersion` still reads `p2-tos-0.3.0-cycle-2-merged`. **This prototype's identity
 *    lives in `candidateId` only**, which is what the dev loop stamps into the run id, the run header and
 *    the code-version digest (`src/devloop/code-version.ts` hashes the entry module *and its transitive
 *    import graph*, so this file's runs can never share a cache entry with the published candidate's).
 *    Changing the algorithm version would break byte-identity on *every* cover, including the ones the
 *    rule deliberately leaves alone, and byte-identity is the thing being asserted. `DESIGN.md` records
 *    this as the one open integration question.
 *  - the assembly replica is **checked against the original at run time** on every cover it fires on: the
 *    same walk is first run with the pool in its published order and must reproduce the baseline palette
 *    exactly, or this module publishes the baseline and says so in its notes. A replica that had drifted
 *    would otherwise be invisible.
 *
 * ## What is not touched
 *
 * The parse, the field roles, the foreground ranking, D3's salience level, the text detector, the twin
 * matrix and the contract validation are all the published candidate's. The one thing this module can
 * change is **which order the accent ranking is walked in**, and only under `allocate.ts`'s three
 * narrowings.
 */

import { colorFromRgb } from "../../../../src/contract/color.ts"
import { validatePalette } from "../../../../src/contract/invariants.ts"
import type { Palette, Rgb8 } from "../../../../src/contract/types.ts"
import type { CandidatePalette } from "../../../../src/devloop/types.ts"
import { paletteWithDiagnostics } from "../candidate.ts"
import { MAX_ASSEMBLY_ATTEMPTS } from "../constants.ts"
import { resolveRoles, roleSwapImproves } from "../roles/assemble.ts"
import { allocateCoverage, type AllocationDecision } from "./allocate.ts"
import { familyOf } from "./census.ts"

/** The name this prototype is known by in run ids, cache paths and the viewer. */
export const candidateId = "p2-tos-coverage"

export type CoverageDiagnostics = Readonly<{
	palette: Palette
	/** The palette `../candidate.ts` publishes for this image, always computed. */
	baseline: Palette
	decision: AllocationDecision
	/** True when the published palette differs from the baseline. */
	changed: boolean
	notes: readonly string[]
}>

export async function paletteWithCoverage(imagePath: string): Promise<CoverageDiagnostics> {
	const base = await paletteWithDiagnostics(imagePath)
	const baseline = base.palette
	const parse = base.parse
	const notes = [...base.notes]

	const foregrounds = parse.foregroundPool.length > 0 ? parse.foregroundPool : [parse.roles.foreground]
	const accents = parse.accentPool.length > 0 ? parse.accentPool : [parse.roles.accent]

	// A swapped baseline has already exchanged its two mark roles, so "the foreground that resolved" and
	// "the accent slot" are no longer the roles the ranking produced. Rather than reason about coverage
	// through the swap, this prototype declines the cover. The swap check is a no-op on all twenty demo
	// covers (`../integration-NOTES.md` §9a), so the case is recorded rather than common.
	if (base.swapped) {
		const decision = allocateCoverage({
			parse,
			accentPool: accents,
			publishedFieldAndForeground: [baseline.roles.background.rgb, baseline.roles.surface.rgb, baseline.roles.foreground.rgb],
			currentAccent: baseline.roles.accent.rgb,
		})
		notes.push("coverage-no-op:role-swap-fired")
		return { palette: baseline, baseline, decision: { ...decision, reordered: false, accentOrder: accents }, changed: false, notes }
	}

	const decision = allocateCoverage({
		parse,
		accentPool: accents,
		publishedFieldAndForeground: [baseline.roles.background.rgb, baseline.roles.surface.rgb, baseline.roles.foreground.rgb],
		currentAccent: baseline.roles.accent.rgb,
	})
	notes.push(decision.reason)
	if (!decision.reordered) return { palette: baseline, baseline, decision, changed: false, notes }

	// The baseline's own construction, reused: everything that does not depend on the two mark roles is
	// carried across from the published palette rather than restated here.
	const assemble = (foregroundRgb: Rgb8, accentRgb: Rgb8): Palette => {
		const foreground = colorFromRgb(foregroundRgb)
		const accent = colorFromRgb(accentRgb)
		return {
			...baseline,
			roles: { ...baseline.roles, foreground, accent },
			collapse: {
				surfaceCollapsed: baseline.collapse?.surfaceCollapsed === true,
				accentCollapsed: accent.hex === foreground.hex,
			},
		} satisfies Palette
	}

	const walk = (accentOrder: readonly Rgb8[]): Palette => {
		const resolved = resolveRoles({
			background: parse.roles.background,
			surface: parse.roles.surface,
			foregroundPool: foregrounds,
			accentPool: accentOrder,
			assemble,
			maxAttempts: MAX_ASSEMBLY_ATTEMPTS,
		})
		// The swap check reads the **published** rankings, never this module's re-ordering — a preference
		// about coverage may not quietly become a preference about which role a colour belongs in.
		if (roleSwapImproves({ foreground: resolved.foreground, accent: resolved.accent, foregroundPool: foregrounds, accentPool: accents })) {
			const swapped = assemble(resolved.accent, resolved.foreground)
			if (validatePalette(swapped).violations.length === 0) return swapped
		}
		return resolved.palette
	}

	// **The replica check.** The same walk, the published order, must reproduce the published palette.
	const replica = walk(accents)
	if (!sameRoles(replica, baseline)) {
		notes.push("coverage-abandoned:assembly-replica-disagrees")
		return { palette: baseline, baseline, decision, changed: false, notes }
	}

	const candidate = walk(decision.accentOrder)
	// Only publish when the re-ordering achieved what it was for: the accent actually landed in the
	// preferred family. If nothing there survived the contract, the walk fell through to the rest of the
	// pool and the honest answer is the baseline.
	if (familyOf(decision.census, candidate.roles.accent.rgb)?.rank !== decision.target?.rank) {
		notes.push("coverage-no-op:preferred-family-did-not-survive-assembly")
		return { palette: baseline, baseline, decision, changed: false, notes }
	}
	if (candidate.roles.foreground.hex !== baseline.roles.foreground.hex) {
		notes.push("coverage-abandoned:foreground-moved")
		return { palette: baseline, baseline, decision, changed: false, notes }
	}
	notes.push(`coverage-accent:${baseline.roles.accent.hex}->${candidate.roles.accent.hex}`)
	return { palette: candidate, baseline, decision, changed: true, notes }
}

/** Do these two palettes publish the same four colours and the same collapse flags? */
function sameRoles(first: Palette, second: Palette): boolean {
	return (
		first.roles.background.hex === second.roles.background.hex &&
		first.roles.surface.hex === second.roles.surface.hex &&
		first.roles.foreground.hex === second.roles.foreground.hex &&
		first.roles.accent.hex === second.roles.accent.hex &&
		first.collapse?.surfaceCollapsed === second.collapse?.surfaceCollapsed &&
		first.collapse?.accentCollapsed === second.collapse?.accentCollapsed
	)
}

export const paletteOf: CandidatePalette = async (imagePath) => (await paletteWithCoverage(imagePath)).palette
