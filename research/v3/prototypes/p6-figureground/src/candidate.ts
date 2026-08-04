/**
 * # P6 as a dev-loop candidate — `p6-figureground-0.1.0`.
 *
 * The whole of proposal §2 in eight lines of wiring: substrate → lattice → field hypotheses →
 * one constrained minimisation → the contract. Every decision is in the energy; nothing here
 * decides anything, and that is the point of §3 ("Every judgment call is in the energy, and the
 * energy is one object").
 *
 * ## Wave 2, stated plainly
 *
 * `./substrate/`, `./lattice/` and `./fieldmodel/` are W1–W3's, built in parallel against
 * `./types.ts`; this file was written against those interfaces and wired to their entry points as
 * they landed. **End-to-end integration is still wave 2's** — nothing here has been run over the
 * demo set by this worker, and `tests/energy.test.ts` deliberately does not import this file: it
 * exercises the energy against synthetic implementations of the same interfaces, so a wave-1 test
 * failure is never a wave-2 wiring problem in disguise.
 *
 * ## What the contract makes this file responsible for
 *
 * - **Exact source pixels.** Every colour published below comes from a `DistinctTriple.rgb`, which
 *   the lattice enumerated from the artwork's own pixels. The one exception is the sanctioned
 *   escape, which is declared rather than smuggled (`palette.escape`) and only ever fires on the
 *   solver's decided infeasibility.
 * - **The gradient's ends are the field roles.** `stops[0]` is the background and `stops[n-1]` is
 *   the surface, exactly — the reviewer's ruling of 2026-08-04, which the solver already enforces
 *   by construction because the field hypothesis *is* where those two roles come from.
 * - **A collapsed surface publishes no gradient.** Both ends would be the same colour, which
 *   invariant 3 refuses as a degenerate ramp.
 * - **Declared collapses.** The flags are copied from the solution, where they are decisions with a
 *   price, not inferred from hex equality after the fact.
 */

import sharp from "sharp"
import { colorFromRgb } from "../../../src/contract/color.ts"
import { CONTRACT_VERSION } from "../../../src/contract/constants.ts"
import {
	DEFAULT_CONTRAST_PARAMETERS,
	resolveContrastParameters,
} from "../../../src/contract/invariants.ts"
import type { GradientStop, Palette } from "../../../src/contract/types.ts"
import { hashFileBytes } from "../../../src/devloop/code-version.ts"
import type { CandidateModule, CandidatePalette } from "../../../src/devloop/types.ts"
import { DEFAULT_EXCHANGE_RATES, solve } from "./energy/index.ts"
import { buildFieldHypotheses } from "./fieldmodel/index.ts"
import { buildLattice } from "./lattice/index.ts"
import { buildSubstrate } from "./substrate/index.ts"

/** The name this candidate is known by in run ids, cache paths and the viewer. */
export const candidateId = "p6-figureground-0.1.0"

/**
 * What this candidate calls itself in `PaletteMetadata.algorithmVersion`.
 *
 * `[UNCALIBRATED]` — a label, not a measurement, exactly as the toy candidate's is. **The commit
 * fingerprint is deliberately not in this string.** The dev loop already records a *measured*
 * source hash of this module and everything it imports (`RunHeader.codeVersion`,
 * `src/devloop/code-version.ts`), which is strictly stronger than a commit id plus a dirty flag:
 * it changes when the code changes and not when the branch does, and it cannot be forgotten. Adding
 * a `git rev-parse` here would also put a subprocess in a runtime that
 * `PHASE_1_AUTHOR_BRIEF.md` §3.1 requires to be cold and file-local. `PaletteMetadata` has no field
 * for a commit, and this file does not invent one.
 */
export const ALGORITHM_VERSION = "p6-figureground-0.1.0"

/**
 * The decoder and preprocessing this candidate used.
 *
 * `[INHERITED]` — `sharp` 0.33.5 is what every v3 import resolves to (`CONVENTIONS.md`);
 * `no-resample` states the `PHASE_0_DECISIONS.md` §1 rule the substrate honours (full resolution,
 * no downscale, header dimensions).
 */
export const PREPROCESSING_VERSION = "sharp-0.33.5/srgb/no-resample"

/** Thrown when the input is one this candidate cannot honestly answer for. */
export class P6CandidateError extends Error {
	override readonly name = "P6CandidateError"
}

export const paletteOf: CandidatePalette = async (imagePath) => {
	const substrate = await buildSubstrate(imagePath)
	const lattice = buildLattice(substrate)
	// The field model takes the rate registry as a third argument — W3's reported deviation from
	// `./types.ts`, which has no place for the description-length rate that free parameter 6 needs.
	// Handing it the *same* object the energy uses is what keeps `SPEC.md` rule 4 true across the two
	// modules: one registry, read in two places, perturbed once by the sensitivity harness.
	const hypotheses = buildFieldHypotheses(substrate, lattice, DEFAULT_EXCHANGE_RATES)
	const solution = solve(substrate, lattice, hypotheses, DEFAULT_EXCHANGE_RATES)

	const background = colorFromRgb(solution.background.rgb)
	const surface = colorFromRgb(solution.surface.rgb)
	const foreground = colorFromRgb(solution.foreground.rgb)
	const accent = colorFromRgb(solution.accent.rgb)

	// A gradient is published only when the winning field hypothesis is one and the surface did not
	// collapse — a collapsed surface is a flat field and says so with `gradient: null`.
	const publishesGradient = solution.field.kind === "gradient" &&
		solution.field.stops.length >= 2 &&
		!solution.surfaceCollapsed &&
		solution.escape === undefined
	const stops: GradientStop[] = solution.field.stops.map((stop) => ({
		color: colorFromRgb(stop.triple.rgb),
		position: stop.t,
	}))

	// Format comes from the decoder's header, never from the filename — `CONVENTIONS.md` records 719
	// AVIFs in `music-artworks/` whose names disagree with their own headers. The substrate carries
	// the dimensions it decoded at; the container format is a header read and costs nothing.
	const header = await sharp(imagePath).metadata()

	return {
		contractVersion: CONTRACT_VERSION,
		roles: { background, surface, foreground, accent },
		gradient: publishesGradient
			? { stops: stops as unknown as [GradientStop, GradientStop, ...GradientStop[]] }
			: null,
		collapse: {
			surfaceCollapsed: solution.surfaceCollapsed,
			accentCollapsed: solution.accentCollapsed,
		},
		escape: solution.escape === undefined ? null : {
			role: solution.escape.role,
			color: solution.escape.color as Palette["roles"]["background"]["hex"],
		},
		contrast: resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS),
		metadata: {
			algorithmVersion: ALGORITHM_VERSION,
			preprocessingVersion: PREPROCESSING_VERSION,
			inputContentHash: await hashFileBytes(imagePath),
			sourceRendition: {
				path: imagePath,
				width: substrate.planes.width,
				height: substrate.planes.height,
				format: header.format ?? "unknown",
			},
			// Equal to the rendition's size, because §1 forbids resampling.
			processedSize: { width: substrate.planes.width, height: substrate.planes.height },
		},
	}
}

const candidateModule: CandidateModule = { candidateId, paletteOf }
export default candidateModule
