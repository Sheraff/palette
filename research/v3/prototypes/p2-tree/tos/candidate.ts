/**
 * `p2-tos` — the tree-of-shapes prototype as a dev-loop candidate.
 *
 * **Cycle-1 quality is not the claim.** `SPEC.md` says so out loud: what this cycle owes is a
 * candidate that runs end to end and produces contract-shaped palettes, so that the robustness
 * harness can measure the mechanism's suspected weakness (region boundaries under re-encode) and the
 * reachability falsifier can start answering "do endorsed colours live in tree nodes at all". A
 * palette out of this module is *validity* evidence, not quality evidence.
 *
 * The shape of the module follows `src/devloop/candidates/toy-median-offsets.ts`, which is the right
 * half of that file to copy: decode its own input, dimensions from the header, transparency refused
 * loudly, every published colour an exact triple of the source, and the whole contract filled in
 * including the metadata that makes a verdict about the output permanently scopable.
 *
 * The mechanism itself is in `pipeline.ts` and `tree.ts`; this file is the contract adapter.
 *
 * ## Cycle 2's integration pass: one candidate carries everything
 *
 * `lanes/` shipped its chromatic trees as a *second* candidate (`candidate-chroma.ts`) while the role
 * stage was being rewritten beside it, so that the pool-size, timing and accent deltas were measurable
 * against a byte-for-byte `p2-tos`. That sequencing is spent. `DECISIONS.md` D1–D3 are applied here and
 * in `pipeline.ts`, over **one** pool: three lanes, per-lane chain collapse, the text detector reading
 * every lane, chroma-first accent ranking, and D3's salience level ahead of both identity orders.
 * `candidate-chroma.ts` is now this module under its other id, so the two runs are the same palette.
 */

import { CONTRACT_VERSION } from "../../../src/contract/constants.ts"
import { colorFromRgb } from "../../../src/contract/color.ts"
import { DEFAULT_CONTRAST_PARAMETERS, resolveContrastParameters, validatePalette } from "../../../src/contract/invariants.ts"
import type { GradientStop, Palette, Rgb8 } from "../../../src/contract/types.ts"
import { hashFileBytes } from "../../../src/devloop/code-version.ts"
import type { CandidatePalette } from "../../../src/devloop/types.ts"
import { MAX_ASSEMBLY_ATTEMPTS, PREPROCESSING_VERSION } from "./constants.ts"
import { runChromaPipeline } from "./lanes/pool.ts"
import { resolveRoles, roleSwapImproves } from "./roles/assemble.ts"

/** The name this candidate is known by in run ids, cache paths and the viewer. */
export const candidateId = "p2-tos"

/**
 * What the merged candidate calls itself in `PaletteMetadata.algorithmVersion`.
 *
 * **`[UNCALIBRATED]` — a label, and nothing reads it as a number.** `0.3.0-cycle-2-merged` says: the
 * tree-of-shapes family, third prototype revision, the cycle-2 integration pass. It lives in this file
 * rather than in `constants.ts` because it describes what *this adapter* publishes, and because
 * `constants.ts`'s `ALGORITHM_VERSION` is the string round 1 was judged under and is left alone so the
 * round-1 artefacts keep meaning what they said.
 */
export const MERGED_ALGORITHM_VERSION = "p2-tos-0.3.0-cycle-2-merged"

/**
 * What the assembly decided, beside the palette it decided it for.
 *
 * The dev loop only ever reads `candidateId` and `paletteOf`. This exists so that a regression test can
 * assert things the published `Palette` cannot show — whether the foreground came from a text group,
 * whether the walk exhausted, whether the role-swap check fired — without a second run of the pipeline
 * or a copy of this file's assembly closure in the test.
 */
export type CandidateDiagnostics = Readonly<{
	palette: Palette
	parse: Awaited<ReturnType<typeof runChromaPipeline>>["parse"]
	/** Notes from the twin-matrix walk (`roles/assemble.ts`). */
	notes: readonly string[]
	/** Whether the role-swap check both fired and produced a palette the contract accepted. */
	swapped: boolean
	attempts: number
}>

export async function paletteWithDiagnostics(imagePath: string): Promise<CandidateDiagnostics> {
	const { image, parse } = await runChromaPipeline(imagePath)
	const inputContentHash = await hashFileBytes(imagePath)

	const background = colorFromRgb(parse.roles.background)
	const surface = colorFromRgb(parse.roles.surface)

	// The endpoint ruling, honoured by construction rather than by a repair pass: when the parse says
	// laminar, the two ends of the ground chain *are* the two field roles, and the stops are those two
	// objects. A collapsed surface leaves no ramp to draw, so it publishes `gradient: null` — which is
	// the same fact the parse already established, not a second check.
	const collapsedField = surface.hex === background.hex
	const stops: GradientStop[] = [
		{ color: background, position: 0 },
		{ color: surface, position: 1 },
	]

	const assemble = (foregroundRgb: Rgb8, accentRgb: Rgb8): Palette => {
		const foreground = colorFromRgb(foregroundRgb)
		const accent = colorFromRgb(accentRgb)
		return {
			contractVersion: CONTRACT_VERSION,
			roles: { background, surface, foreground, accent },
			gradient: parse.gradient && !collapsedField ? { stops: stops as unknown as [GradientStop, GradientStop] } : null,
			collapse: {
				// Measured against the colours actually published, never asserted from the parse's intent.
				surfaceCollapsed: collapsedField,
				accentCollapsed: accent.hex === foreground.hex,
			},
			contrast: resolveContrastParameters(DEFAULT_CONTRAST_PARAMETERS),
			metadata: {
				algorithmVersion: MERGED_ALGORITHM_VERSION,
				preprocessingVersion: PREPROCESSING_VERSION,
				inputContentHash,
				sourceRendition: { path: imagePath, width: image.width, height: image.height, format: image.format },
				// Equal to the rendition's size, because §1 forbids resampling and this pipeline does none.
				processedSize: { width: image.width, height: image.height },
			},
		} satisfies Palette
	}

	// **The repair, arm-b′ §2.7, with cycle 2's twin matrix on top.** *"A violated invariant at assembly
	// is repaired by taking the next item in the same ranking, never by inventing or adjusting a
	// colour… and the whole palette is re-validated after it."* `roles/assemble.ts` owns the walk; what
	// changed this cycle is that it also owns the reviewer's **forbidden outcome** — a foreground or an
	// accent inside a field role's same-colour bar has no sanctioned collapse and is therefore not a
	// candidate at all, and cycle 1's "publish the first choice anyway" exhaustion path, which was the
	// one way this prototype could ship twins, is gone.
	//
	// Source support (invariant 2) is not checked in the walk — it needs the decoded image and every
	// colour in both pools is already an exact triple of it by construction — so the walk is deciding
	// distinctness and contrast, which are the two the first run of this prototype failed.
	const foregrounds = parse.foregroundPool.length > 0 ? parse.foregroundPool : [parse.roles.foreground]
	const accents = parse.accentPool.length > 0 ? parse.accentPool : [parse.roles.accent]
	const resolved = resolveRoles({
		background: parse.roles.background,
		surface: parse.roles.surface,
		foregroundPool: foregrounds,
		accentPool: accents,
		assemble,
		maxAttempts: MAX_ASSEMBLY_ATTEMPTS,
	})

	// **The role-swap check**, last, on the settled pair: if each colour ranks better in the *other*
	// role's ordering, the assignment was backwards and the swap is published — but only when the
	// swapped palette also validates, so the repair cannot relocate the defect.
	if (
		roleSwapImproves({
			foreground: resolved.foreground,
			accent: resolved.accent,
			foregroundPool: foregrounds,
			accentPool: accents,
		})
	) {
		const swapped = assemble(resolved.accent, resolved.foreground)
		if (validatePalette(swapped).violations.length === 0) {
			return { palette: swapped, parse, notes: resolved.notes, swapped: true, attempts: resolved.attempts }
		}
	}
	return { palette: resolved.palette, parse, notes: resolved.notes, swapped: false, attempts: resolved.attempts }
}

export const paletteOf: CandidatePalette = async (imagePath) => (await paletteWithDiagnostics(imagePath)).palette
