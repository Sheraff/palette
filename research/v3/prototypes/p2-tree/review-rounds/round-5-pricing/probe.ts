/**
 * **The measurement side of round 5.** Runs inside a pinned export (`pin.sh`), never in the worktree.
 *
 *     sh pin.sh base          probe.ts
 *     sh pin.sh accent-member probe.ts
 *     sh pin.sh fg-member     probe.ts
 *
 * Writes `out/<variant>.json`: for each of the round's five covers, the palette the pinned build
 * publishes, the two pools it published them from, and — in the `base` export only — the two things
 * that are not a palette of any variant:
 *
 *  - the **identity-coverage** allocation (`tos/coverage/candidate-coverage.ts`, worker K's design
 *    prototype behind its own candidate id) for the two adverse covers, and its family census;
 *  - every **admissible foreground alternative** for one cover: each pool candidate re-walked to the
 *    front of the foreground ranking through `roles/assemble.ts`'s own walk, with the palette that
 *    results and whether it is contract-clean and one role wide.
 *
 * `build.ts` is a pure function of these files. Splitting it this way is round 3's precedent
 * (`round-3-tradeoffs/out/demo-20.jsonl`): the palette build is the slow, pinned, side-effectful half,
 * and the fixture build has to be re-runnable byte-for-byte by `validate.ts` without re-running it.
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { colorFromRgb } from "../../../../src/contract/color.ts"
import { validatePalette } from "../../../../src/contract/invariants.ts"
import type { Palette, Rgb8 } from "../../../../src/contract/types.ts"
import { REPO_ROOT } from "../../../../src/devloop/run.ts"
import { paletteWithDiagnostics } from "../../tos/candidate.ts"
import { MAX_ASSEMBLY_ATTEMPTS } from "../../tos/constants.ts"
import { paletteWithCoverage } from "../../tos/coverage/candidate-coverage.ts"
import { familyCensus } from "../../tos/coverage/census.ts"
import { resolveRoles, roleSwapImproves } from "../../tos/roles/assemble.ts"
import { minFieldContrast, renderedFieldOf } from "../../tos/roles/rank.ts"

const HERE = dirname(fileURLToPath(import.meta.url))

const variant = process.env.ROUND5_VARIANT ?? "base"
const pinCommit = process.env.ROUND5_PIN_COMMIT ?? ""
if (!/^[0-9a-f]{40}$/.test(pinCommit)) throw new Error("probe.ts: ROUND5_PIN_COMMIT must be the full pinned sha (pin.sh sets it)")

/** The round's covers. Every one is a cover on which the trade being priced was *measured*. */
const COVERS = [
	"00/ab67616d00001e0200000f92552b0935b967964d.jpg",
	"00/ab67616d00001e02000001335fe604d859a69094.jpg",
	"00/ab67616d00001e0200001a9be12b7116a8247378.jpg",
	"00/ab67616d00001e02000022e7e9d11c908479200b.jpg",
	"00/ab67616d00001e0200001073a73e3a949021f65e.jpg",
] as const

/** The covers whose extra, base-only measurements this file makes. */
const COVERAGE_COVERS = new Set([COVERS[2], COVERS[3]])
const FOREGROUND_ALTERNATIVE_COVER = COVERS[4]

const idOf = (imagePath: string): string => (imagePath.split("/").pop() ?? "").replace(/\.[^.]+$/, "")

type PaletteShape = {
	background: string
	surface: string
	foreground: string
	accent: string
	gradient: null | { stops: { color: string; position: number }[] }
	surfaceCollapsed: boolean
	accentCollapsed: boolean
}

function shapeOf(palette: Palette): PaletteShape {
	return {
		background: palette.roles.background.hex,
		surface: palette.roles.surface.hex,
		foreground: palette.roles.foreground.hex,
		accent: palette.roles.accent.hex,
		gradient:
			palette.gradient === null || palette.gradient === undefined
				? null
				: { stops: palette.gradient.stops.map((stop) => ({ color: stop.color.hex, position: stop.position })) },
		surfaceCollapsed: palette.collapse?.surfaceCollapsed === true,
		accentCollapsed: palette.collapse?.accentCollapsed === true,
	}
}

const hexOf = (rgb: Rgb8): string => colorFromRgb(rgb).hex

const covers: Record<string, unknown> = {}

for (const imagePath of COVERS) {
	const path = resolve(REPO_ROOT, imagePath)
	const diagnostics = await paletteWithDiagnostics(path)
	const { palette, parse } = diagnostics
	const audit = validatePalette(palette)

	// The rendered field every readability number in this round is measured against: both field roles
	// and, when a gradient is published, the whole OKLab interpolation between them. The contract's own
	// `minRawContrastOverRamp`, through `roles/rank.ts` — the function invariant 4 itself calls.
	const field = renderedFieldOf(parse.roles.background, parse.roles.surface, parse.gradient)
	const contrastOf = (color: Rgb8): number => minFieldContrast(color, field)

	const textGroupReprs = new Set(parse.textGroups.map((group) => hexOf(group.repr)))

	const record: Record<string, unknown> = {
		imagePath,
		palette: shapeOf(palette),
		contractViolations: audit.violations.map((entry) => entry.invariant),
		notes: [...diagnostics.notes, ...parse.notes],
		swapped: diagnostics.swapped,
		verdict: parse.verdict,
		foregroundPool: parse.foregroundPool.map((color) => ({
			hex: hexOf(color),
			fieldContrast: contrastOf(color),
			provenance: textGroupReprs.has(hexOf(color)) ? "text-group" : "pool",
		})),
		accentPool: parse.accentPool.slice(0, 24).map((color) => hexOf(color)),
		accentCandidates: parse.accentCandidates.slice(0, 24).map((candidate) => ({
			hex: hexOf(candidate.repr),
			chromaFromField: candidate.chromaFromField,
			lightnessMove: candidate.lightnessMove,
			fieldContrast: candidate.fieldContrast,
			stabilityLevel: candidate.stabilityLevel,
			tracingLevel: candidate.tracingLevel,
			growth: candidate.growth,
		})),
		textGroups: parse.textGroups.map((group) => ({
			hex: hexOf(group.repr),
			componentCount: group.componentCount,
			areaFraction: group.areaFraction,
			fieldContrast: group.fieldContrast,
		})),
	}

	if (variant === "base" && COVERAGE_COVERS.has(imagePath)) {
		const covered = await paletteWithCoverage(path)
		const census = familyCensus(parse)
		record.coverage = {
			palette: shapeOf(covered.palette),
			changed: covered.changed,
			notes: covered.notes.filter((note) => note.startsWith("coverage-")),
			contractViolations: validatePalette(covered.palette).violations.map((entry) => entry.invariant),
			familyCount: census.families.length,
			families: census.families.map((family) => ({
				rank: family.rank,
				hueStartDegrees: (family.hueStart * 180) / Math.PI,
				hueEndDegrees: (family.hueEnd * 180) / Math.PI,
				memberCount: family.members.length,
			})),
		}
	}

	if (variant === "base" && imagePath === FOREGROUND_ALTERNATIVE_COVER) {
		// Every pool candidate, walked to the front of the foreground ranking through the SAME walk the
		// candidate uses, so an "alternative" is a palette this pipeline can actually publish and not a
		// hex spliced into a fixture. The assemble closure is derived from the published palette exactly
		// as `coverage/candidate-coverage.ts` derives its own — gradient, collapse flags and the whole
		// metadata block are carried across rather than restated.
		const assemble = (foregroundRgb: Rgb8, accentRgb: Rgb8): Palette => {
			const foreground = colorFromRgb(foregroundRgb)
			const accent = colorFromRgb(accentRgb)
			return {
				...palette,
				roles: { ...palette.roles, foreground, accent },
				collapse: {
					surfaceCollapsed: palette.collapse?.surfaceCollapsed === true,
					accentCollapsed: accent.hex === foreground.hex,
				},
			} satisfies Palette
		}
		const accents = parse.accentPool.length > 0 ? parse.accentPool : [parse.roles.accent]
		const walk = (foregroundOrder: readonly Rgb8[]): Palette => {
			const resolved = resolveRoles({
				background: parse.roles.background,
				surface: parse.roles.surface,
				foregroundPool: foregroundOrder,
				accentPool: accents,
				assemble,
				maxAttempts: MAX_ASSEMBLY_ATTEMPTS,
			})
			if (
				roleSwapImproves({
					foreground: resolved.foreground,
					accent: resolved.accent,
					foregroundPool: parse.foregroundPool,
					accentPool: accents,
				})
			) {
				const swapped = assemble(resolved.accent, resolved.foreground)
				if (validatePalette(swapped).violations.length === 0) return swapped
			}
			return resolved.palette
		}

		// The replica check, worker K's: the same walk in the published order must reproduce the published
		// palette, or nothing built on it means anything.
		const replica = shapeOf(walk(parse.foregroundPool))
		const published = shapeOf(palette)
		const alternatives = parse.foregroundPool.map((candidate) => {
			const reordered = [candidate, ...parse.foregroundPool.filter((other) => hexOf(other) !== hexOf(candidate))]
			const result = shapeOf(walk(reordered))
			const led = result.foreground === hexOf(candidate)
			const oneRoleWide =
				led &&
				result.background === published.background &&
				result.surface === published.surface &&
				result.accent === published.accent &&
				JSON.stringify(result.gradient) === JSON.stringify(published.gradient) &&
				result.surfaceCollapsed === published.surfaceCollapsed &&
				result.accentCollapsed === published.accentCollapsed
			return {
				hex: hexOf(candidate),
				fieldContrast: contrastOf(candidate),
				provenance: textGroupReprs.has(hexOf(candidate)) ? "text-group" : "pool",
				led,
				oneRoleWide,
				contractViolations: validatePalette(walk(reordered)).violations.map((entry) => entry.invariant),
				palette: result,
			}
		})
		record.foregroundAlternatives = { replicaReproducesPublished: JSON.stringify(replica) === JSON.stringify(published), alternatives }
	}

	covers[idOf(imagePath)] = record
	console.log(`${variant} · ${idOf(imagePath).slice(-12)} · ${Object.values(shapeOf(palette)).slice(0, 4).join(" ")}`)
}

mkdirSync(join(HERE, "out"), { recursive: true })
writeFileSync(join(HERE, "out", `${variant}.json`), `${JSON.stringify({ variant, pinCommit, covers }, null, "\t")}\n`)
console.log(`wrote out/${variant}.json`)
