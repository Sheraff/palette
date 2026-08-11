/**
 * # `toPalette` — the one map from what P1 decides to what P1 publishes
 *
 * A configuration plus a file's identity becomes a contract `Palette`. That is all this file does,
 * and the *all* is load-bearing: this map is **total and mechanical**. It does not judge, it does
 * not repair, and it does not drop a field it thinks is wrong. `DESIGN.md`: *"The contract is the
 * feasible set, never a term."* If the emitter quietly fixed a lying collapse flag or refused a
 * first stop that is not the background, the invariants would never see the mistake and the search
 * would be optimising against a feasible set nobody wrote down.
 *
 * The single exception is `ConfigurationError` (see `types.ts`), which fires only where there is no
 * contract *shape* to emit into.
 *
 * ## Metadata conventions
 *
 * Copied field for field from `src/devloop/candidates/toy-median-offsets.ts`, which is the
 * reference for the shape (never for the arithmetic):
 *
 * - `contractVersion` is `CONTRACT_VERSION` at publication.
 * - `preprocessingVersion` is the shared `PREPROCESSING_VERSION` string.
 * - `inputContentHash` is sha-256 over the input file's **bytes**, which is the identity
 *   `CONVENTIONS.md` and the devloop cache both key on.
 * - `processedSize` equals the rendition's dimensions, because §1 forbids resampling. It is still
 *   recorded so that a future downscale, if ever admitted, leaves prior verdicts interpretable.
 * - `contrast` is the *resolved* floors, via `resolveContrastParameters`, so what was enforced
 *   travels with the palette rather than having to be reconstructed from a requested Lc and an
 *   epsilon nobody wrote down.
 */

import { CONTRACT_VERSION } from "../../../../src/contract/constants.ts"
import { colorFromRgb, hex } from "../../../../src/contract/color.ts"
import {
	DEFAULT_CONTRAST_PARAMETERS,
	resolveContrastParameters,
} from "../../../../src/contract/invariants.ts"
import type {
	GradientSpec,
	GradientStop,
	NonSourceColorEscape,
	Palette,
} from "../../../../src/contract/types.ts"
import { ConfigurationError, type Configuration, type EmitMeta } from "./types.ts"

/**
 * The decoder and preprocessing every P1 arm uses.
 *
 * `[INHERITED]` — verbatim the toy candidate's string, and for the same two reasons: `sharp` 0.33.5
 * is what every v3 import resolves to (`CONVENTIONS.md`), and `no-resample` states the
 * `PHASE_0_DECISIONS.md` §1 rule at full resolution. Both P1 arms share it because they share a
 * measurement layer; a divergence here would be a bug, not a variant.
 */
export const PREPROCESSING_VERSION = "sharp-0.33.5/srgb/no-resample"

/**
 * What each arm calls itself in `PaletteMetadata.algorithmVersion`.
 *
 * `[UNCALIBRATED]` — labels, not measurements, exactly as the toy's header explains: the devloop
 * cache keys on measured source hashes precisely so a forgotten bump here cannot serve a stale
 * palette. The two strings exist because `DESIGN.md` runs *two* energies as one internal experiment
 * (`p1a`: nats + λ·Ω; `p1ap`: L(pixels|P) + λ·L(P)) and a warehouse row has to say which prior it
 * came out of.
 *
 * **This table is v0's stamp, and only v0's.** It is keyed by *arm*, not by candidate module, so it
 * cannot distinguish two operating points of the same arm — and v1 is exactly that (`candidates/
 * p1a-v1.ts`: λ=0.1, 240 s; `candidates/p1ap-v1.ts`: the 0.2.0 chromatic residual, 240 s). Keying a
 * palette's provenance on the arm alone stamped v1 palettes `"…-0.1.0"`, which is a false statement
 * about what produced them, so the table is now a **default fallback**: every candidate module passes
 * `emit({ algorithmVersion })` explicitly, and that override is what reaches
 * `PaletteMetadata.algorithmVersion`. The v0 modules pass these same two strings, so nothing they
 * emit changed; the fallback exists for a direct `emit()` call that names no version (tests, probes).
 */
export const ALGORITHM_VERSIONS = {
	p1a: "p1a-0.1.0",
	p1ap: "p1ap-0.1.0",
} as const

export type P1Arm = keyof typeof ALGORITHM_VERSIONS

/**
 * Assemble the published palette.
 *
 * Note what is *not* here: no snapping, no nearest-colour search, no contrast repair. Every colour
 * published is the triple the configuration named, byte for byte. A role named by `escape` publishes
 * whatever triple the configuration put there — the emitter does not substitute `[255,255,255]` for
 * a `#ffffff` declaration, because a declaration that disagrees with the published colour is
 * invariant 1's `I1.escape-*` finding and must survive to be reported.
 */
export function toPalette(config: Configuration, meta: EmitMeta): Palette {
	const background = colorFromRgb(config.background)
	const surface = colorFromRgb(config.surface)
	const foreground = colorFromRgb(config.foreground)
	const accent = colorFromRgb(config.accent)

	let gradient: GradientSpec | null = null
	if (config.gradient) {
		if (config.stops.length < 2) {
			throw new ConfigurationError(
				`a gradient configuration needs at least 2 stops to be representable as GradientSpec; got ${config.stops.length}`,
			)
		}
		// The upper bound is *not* checked here. Five stops is a contract violation
		// (`I1.stop-count-out-of-range`) and is perfectly representable, so it goes out and gets
		// reported rather than being intercepted by the emitter.
		const stops: GradientStop[] = config.stops.map((stop) => ({
			color: colorFromRgb(stop.rgb),
			position: stop.position,
		}))
		gradient = { stops: stops as unknown as GradientSpec["stops"] }
	}

	const escape: NonSourceColorEscape | null = config.escape === null
		? null
		: { role: config.escape.role, color: hex(config.escape.color) }

	return {
		contractVersion: CONTRACT_VERSION,
		roles: { background, surface, foreground, accent },
		gradient,
		collapse: {
			// Passed through verbatim. `PHASE_0_DECISIONS.md` §2 makes these *declarations*, and a
			// declaration the emitter recomputed from hex equality would be unfalsifiable — invariant 3
			// exists to catch a flag that disagrees with the colours, and it cannot catch one the emitter
			// has already silently corrected.
			surfaceCollapsed: config.surfaceCollapsed,
			accentCollapsed: config.accentCollapsed,
		},
		escape,
		contrast: resolveContrastParameters(meta.contrast ?? DEFAULT_CONTRAST_PARAMETERS),
		metadata: {
			algorithmVersion: meta.algorithmVersion,
			preprocessingVersion: PREPROCESSING_VERSION,
			inputContentHash: meta.inputContentHash,
			sourceRendition: meta.sourceRendition,
			processedSize: meta.processedSize ?? {
				width: meta.sourceRendition.width,
				height: meta.sourceRendition.height,
			},
		},
	}
}
