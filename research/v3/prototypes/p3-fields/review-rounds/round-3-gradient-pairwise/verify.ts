/**
 * Round 3 (flat-vs-gradient pairwise) — the staging checklist, run as code.
 *
 * Nine checks, per item, against what is actually on disk. `VERIFY.md` records the run.
 *
 *  1. **Path resolves in the MAIN checkout.** `items.jsonl` carries repo-relative paths; the round
 *     was staged from a worktree whose corpus shards are symlinks. The path the consumer will use is
 *     `<main checkout>/<imagePath>`, so that is the path checked — not the worktree's.
 *  2. **Every hex on BOTH sides is an exact pixel at native resolution.** Decoded here independently
 *     of the pipeline: sRGB, no resample, alpha-excluded.
 *  3. **Gradient endpoints are the field roles.** First stop == background, last stop == surface, on
 *     the gradient side. This is what makes the flat side contract-valid: dropping the ramp drops
 *     nothing the roles do not already carry.
 *  4. **The flat side is flat**, and its four roles are byte-identical to the gradient side's.
 *  5. **The two sides differ in `gradient` and in nothing else.** Anything else differing would be a
 *     second manipulation the question did not ask about.
 *  6. **Collapse flags consistent**, in both directions, on both sides.
 *  7. **`validatePalette` passes on both treatments** of all eight covers.
 *  8. **`render-preview.json` renders the item it belongs to** — a staging mistake that would make a
 *     human eyeball the wrong pair.
 *  9. **The run's `codeVersion` reproduces from the working tree**, so `gitCommit: bead404,
 *     dirty: false` on both sides' fingerprints is a fact and not a hope.
 *
 *   node --experimental-strip-types research/v3/prototypes/p3-fields/review-rounds/round-3-gradient-pairwise/verify.ts
 *
 * Exit code 0 = every check passed. Non-zero = something must not ship.
 */

import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { computeCodeVersion } from "../../../../src/devloop/code-version.ts"
import { validatePalette } from "../../../../src/contract/invariants.ts"
import type { Palette } from "../../../../src/contract/types.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const MEASUREMENTS = join(HERE, "..", "..", "measurements")

/** Where a repo-relative corpus path resolves for the consumer of this round. */
const MAIN_CHECKOUT = "/Users/Flo/GitHub/palette"

type Snapshot = Readonly<{
	background: string
	surface: string
	foreground: string
	accent: string
	gradient: Readonly<{ stops: readonly Readonly<{ color: string; position: number }>[] }> | null
	surfaceCollapsed: boolean
	accentCollapsed: boolean
}>

type Side = Readonly<{ variantId: string; palette: Snapshot; fingerprint: Record<string, unknown> }>

type Item = Readonly<{
	itemId: string
	imagePath: string
	collection: string
	artworkId: string
	sides: readonly [Side, Side]
	bestRho: number
	runIndex: number
}>

const items: Item[] = readFileSync(join(HERE, "items.jsonl"), "utf8")
	.trim()
	.split("\n")
	.map((line) => JSON.parse(line) as Item)

const preview = JSON.parse(readFileSync(join(HERE, "render-preview.json"), "utf8")) as Record<
	string,
	Record<string, { roles: { role: string; hex: string }[]; gradient: unknown; fieldCss: string }>
>

const rows = new Map<number, { index: number; imagePath: string; ok: boolean; palette: Palette }>()
for (const line of readFileSync(join(MEASUREMENTS, "run-coverage-220-0.3.0.jsonl"), "utf8").trim().split("\n")) {
	const parsed = JSON.parse(line)
	if (parsed.kind === "devloop-run-row") rows.set(parsed.index, parsed)
}
const runHeader = JSON.parse(readFileSync(join(MEASUREMENTS, "run-coverage-220-0.3.0.jsonl"), "utf8").split("\n")[0])

const ROLES = ["background", "surface", "foreground", "accent"] as const

/**
 * Every distinct pixel of the image, as `#rrggbb`.
 *
 * Native resolution — `sharp` is told nothing about size, so no resample happens; the raw buffer is
 * the decode. Alpha < 255 pixels are excluded, matching what the algorithm is allowed to publish.
 */
async function pixelSet(absolutePath: string): Promise<Set<string>> {
	const { data, info } = await sharp(absolutePath).toColorspace("srgb").raw().toBuffer({ resolveWithObject: true })
	const channels = info.channels
	const set = new Set<string>()
	for (let offset = 0; offset < data.length; offset += channels) {
		if (channels === 4 && data[offset + 3] !== 255) continue
		set.add(
			`#${data[offset].toString(16).padStart(2, "0")}${data[offset + 1].toString(16).padStart(2, "0")}${data[offset + 2].toString(16).padStart(2, "0")}`,
		)
	}
	return set
}

const failures: string[] = []
const report: string[] = []

for (const item of items) {
	const absolute = join(MAIN_CHECKOUT, item.imagePath)
	const problems: string[] = []
	const [gradientSide, flatSide] = item.sides

	// 1 — path resolves in the MAIN checkout.
	const pathOk = existsSync(absolute)
	if (!pathOk) problems.push(`path does not resolve: ${absolute}`)

	// 2 — every published hex, on BOTH sides, is an exact pixel.
	let pixelsOk = false
	let checkedCount = 0
	if (pathOk) {
		const pixels = await pixelSet(absolute)
		const published: [string, string][] = []
		for (const [label, side] of [["A0/gradient", gradientSide], ["A1/flat", flatSide]] as const) {
			for (const role of ROLES) published.push([`${label}.${role}`, side.palette[role]])
			side.palette.gradient?.stops.forEach((stop, index) => published.push([`${label}.gradient[${index}]`, stop.color]))
		}
		checkedCount = published.length
		const missing = published.filter(([, hex]) => !pixels.has(hex))
		pixelsOk = missing.length === 0
		for (const [where, hex] of missing) problems.push(`${where} ${hex} is not a pixel of the image`)
	}

	// 3 — gradient endpoints are the field roles.
	let endpointsOk = true
	const stops = gradientSide.palette.gradient?.stops
	if (stops === undefined) {
		endpointsOk = false
		problems.push("side 0 publishes no gradient — this round's gradient side must have one")
	} else {
		if (stops[0].color !== gradientSide.palette.background) {
			endpointsOk = false
			problems.push(`first stop ${stops[0].color} != background ${gradientSide.palette.background}`)
		}
		if (stops[stops.length - 1].color !== gradientSide.palette.surface) {
			endpointsOk = false
			problems.push(`last stop ${stops[stops.length - 1].color} != surface ${gradientSide.palette.surface}`)
		}
	}

	// 4 — the flat side is flat, same roles.
	let flatOk = flatSide.palette.gradient === null
	if (!flatOk) problems.push("side 1 is not flat")
	for (const role of ROLES) {
		if (flatSide.palette[role] !== gradientSide.palette[role]) {
			flatOk = false
			problems.push(`flat ${role} ${flatSide.palette[role]} != gradient ${gradientSide.palette[role]}`)
		}
	}

	// 5 — the sides differ in `gradient` and nothing else.
	let onlyGradientOk = true
	const differing = Object.keys(gradientSide.palette).filter(
		(key) =>
			JSON.stringify((gradientSide.palette as Record<string, unknown>)[key]) !==
			JSON.stringify((flatSide.palette as Record<string, unknown>)[key]),
	)
	if (differing.join(",") !== "gradient") {
		onlyGradientOk = false
		problems.push(`sides differ in [${differing.join(", ")}], want exactly [gradient]`)
	}
	if (gradientSide.variantId === flatSide.variantId) {
		onlyGradientOk = false
		problems.push("both sides carry the same variantId — parseItem refuses that")
	}

	// 6 — collapse flags consistent, both directions, both sides.
	let collapseOk = true
	for (const [label, side] of [["gradient", gradientSide], ["flat", flatSide]] as const) {
		const p = side.palette
		if (p.surfaceCollapsed !== (p.surface === p.background)) {
			collapseOk = false
			problems.push(`${label}: surfaceCollapsed=${p.surfaceCollapsed} but surface==background is ${p.surface === p.background}`)
		}
		if (p.accentCollapsed !== (p.accent === p.foreground)) {
			collapseOk = false
			problems.push(`${label}: accentCollapsed=${p.accentCollapsed} but accent==foreground is ${p.accent === p.foreground}`)
		}
	}

	// 7 — validatePalette on both treatments, from the run row (the full contract Palette).
	let contractOk = true
	const row = rows.get(item.runIndex)
	if (row === undefined || !row.imagePath.endsWith(`/${item.imagePath}`)) {
		contractOk = false
		problems.push(`run index ${item.runIndex} does not carry ${item.imagePath}`)
	} else {
		for (const [label, palette] of [
			["gradient", row.palette],
			["flat", { ...row.palette, gradient: null } as Palette],
		] as const) {
			const result = validatePalette(palette)
			if (!result.valid) {
				contractOk = false
				problems.push(`${label}: validatePalette FAIL ${result.violations.map((v) => v.code).join(",")}`)
			}
		}
		// The staged hexes must be the run's, not a re-derivation.
		for (const role of ROLES) {
			if (gradientSide.palette[role] !== row.palette.roles[role].hex) {
				contractOk = false
				problems.push(`${role} ${gradientSide.palette[role]} != run row ${row.palette.roles[role].hex}`)
			}
		}
	}

	// 8 — the preview renders the item it belongs to, on both sides.
	let previewOk = true
	const entry = preview[item.itemId]
	if (entry === undefined) {
		previewOk = false
		problems.push("no render-preview entry")
	} else {
		for (const [key, side] of [["pushedSide0_gradient", gradientSide], ["pushedSide1_flat", flatSide]] as const) {
			const rendered = entry[key]
			if (rendered === undefined) {
				previewOk = false
				problems.push(`render-preview has no ${key}`)
				continue
			}
			const byRole = Object.fromEntries(rendered.roles.map((role) => [role.role, role.hex]))
			for (const role of ROLES) {
				if (byRole[role] !== side.palette[role]) {
					previewOk = false
					problems.push(`render-preview ${key} ${role} ${byRole[role]} != item ${side.palette[role]}`)
				}
			}
			const hasGradient = rendered.gradient !== null
			if (hasGradient !== (side.palette.gradient !== null)) {
				previewOk = false
				problems.push(`render-preview ${key} gradient presence disagrees with the item`)
			}
		}
		if (entry.pushedSide0_gradient?.fieldCss === entry.pushedSide1_flat?.fieldCss) {
			previewOk = false
			problems.push("the two sides render the same fieldCss — that is not a comparison")
		}
	}

	const verdict = problems.length === 0 ? "PASS" : "FAIL"
	report.push(
		`${item.itemId}  rho=${item.bestRho.toFixed(4)}  ${verdict}  path=${pathOk ? "yes" : "NO"}  ` +
			`exact-pixel=${pixelsOk ? `yes (${checkedCount}/${checkedCount})` : "NO"}  ` +
			`endpoints=${endpointsOk ? "yes" : "NO"}  flat-side=${flatOk ? "yes" : "NO"}  ` +
			`only-gradient-differs=${onlyGradientOk ? "yes" : "NO"}  collapse=${collapseOk ? "yes" : "NO"}  ` +
			`contract=${contractOk ? "yes" : "NO"}  preview=${previewOk ? "yes" : "NO"}`,
	)
	if (problems.length > 0) failures.push(`${item.itemId}: ${problems.join("; ")}`)
}

// 9 — the fingerprint's commit is honest: the candidate's module graph, hashed now, is the graph the
//     run recorded. `src/` is clean and has no diff against bead404, so this pins both.
const { codeVersion } = await computeCodeVersion(
	join(HERE, "..", "..", "src", "candidate.ts"),
)
const codeVersionOk = codeVersion === runHeader.codeVersion
report.push(
	`\ncodeVersion reproduces: ${codeVersionOk ? "yes" : "NO"}  (${codeVersion.slice(0, 16)}… vs run header ${String(runHeader.codeVersion).slice(0, 16)}…)`,
)
if (!codeVersionOk) failures.push("codeVersion does not reproduce — the fingerprint's commit claim is unverified")

console.log(report.join("\n"))
console.log(`\n${items.length} pairs · ${failures.length === 0 ? "ALL PASS" : `${failures.length} FAILED`}`)
if (failures.length > 0) {
	console.log(failures.join("\n"))
	process.exitCode = 1
}
