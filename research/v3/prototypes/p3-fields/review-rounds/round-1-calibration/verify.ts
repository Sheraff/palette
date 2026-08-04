/**
 * Round 1 (calibration) — the staging checklist, run as code.
 *
 * Four checks, per item, against what is actually on disk. `VERIFY.md` records the run.
 *
 *  1. **Path resolves in the MAIN checkout.** `items.jsonl` carries repo-relative paths; the round
 *     was staged from a worktree whose corpus shards are symlinks. The path the consumer will use is
 *     `<main checkout>/<imagePath>`, so that is the path checked — not the worktree's.
 *  2. **Every hex is an exact pixel of its image at native resolution.** The contract's central rule.
 *     Decoded here independently of the pipeline: sRGB, no resample, alpha-excluded, and every hex in
 *     the item (four roles plus every gradient stop) must appear among the image's actual pixels.
 *  3. **Gradient endpoints are the field roles.** First stop == background, last stop == surface.
 *  4. **Collapse flags are consistent.** `surfaceCollapsed` iff surface == background (exact hex
 *     equality); `accentCollapsed` iff accent == foreground. Checked in both directions, so a flag
 *     that is set without the equality fails just as loudly as an equality without the flag.
 *
 *   node --experimental-strip-types research/v3/prototypes/p3-fields/review-rounds/round-1-calibration/verify.ts
 *
 * Exit code 0 = every check passed. Non-zero = something must not ship.
 */

import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const HERE = dirname(fileURLToPath(import.meta.url))

/** Where a repo-relative corpus path resolves for the consumer of this round. */
const MAIN_CHECKOUT = "/Users/Flo/GitHub/palette"

type Item = Readonly<{
	itemId: string
	imagePath: string
	background: string
	surface: string
	foreground: string
	accent: string
	gradient: Readonly<{ stops: readonly Readonly<{ color: string; position: number }>[] }> | null
	surfaceCollapsed: boolean
	accentCollapsed: boolean
}>

const items: Item[] = readFileSync(join(HERE, "items.jsonl"), "utf8")
	.trim()
	.split("\n")
	.map((line) => JSON.parse(line) as Item)

const sidecar = JSON.parse(readFileSync(join(HERE, "sidecar.data.json"), "utf8")) as Record<
	string,
	{ roles: { role: string; hex: string; name: string; collapsed: boolean }[]; gradient: unknown; fieldCss: string }
>

/**
 * Every distinct pixel of the image, as `#rrggbb`.
 *
 * Native resolution — `sharp` is told nothing about size, so no resample happens; the raw buffer is
 * the decode. Alpha < 255 pixels are excluded, matching what the algorithm is allowed to publish.
 */
async function pixelSet(absolutePath: string): Promise<Set<string>> {
	const { data, info } = await sharp(absolutePath)
		.toColorspace("srgb")
		.raw()
		.toBuffer({ resolveWithObject: true })
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

	// 1 — path resolves in the MAIN checkout.
	const pathOk = existsSync(absolute)
	if (!pathOk) problems.push(`path does not resolve: ${absolute}`)

	// 2 — every published hex is an exact pixel.
	let pixelsOk = false
	let checkedCount = 0
	if (pathOk) {
		const pixels = await pixelSet(absolute)
		const published = [
			["background", item.background],
			["surface", item.surface],
			["foreground", item.foreground],
			["accent", item.accent],
			...(item.gradient?.stops.map((stop, index) => [`gradient[${index}]`, stop.color] as const) ?? []),
		] as const
		checkedCount = published.length
		const missing = published.filter(([, hex]) => !pixels.has(hex))
		pixelsOk = missing.length === 0
		for (const [role, hex] of missing) problems.push(`${role} ${hex} is not a pixel of the image`)
	}

	// 3 — gradient endpoints are the field roles.
	let gradientOk = true
	if (item.gradient !== null) {
		const stops = item.gradient.stops
		if (stops[0].color !== item.background) {
			gradientOk = false
			problems.push(`gradient first stop ${stops[0].color} != background ${item.background}`)
		}
		if (stops[stops.length - 1].color !== item.surface) {
			gradientOk = false
			problems.push(`gradient last stop ${stops[stops.length - 1].color} != surface ${item.surface}`)
		}
	}

	// 4 — collapse flags consistent, in both directions.
	let collapseOk = true
	if (item.surfaceCollapsed !== (item.surface === item.background)) {
		collapseOk = false
		problems.push(`surfaceCollapsed=${item.surfaceCollapsed} but surface==background is ${item.surface === item.background}`)
	}
	if (item.accentCollapsed !== (item.accent === item.foreground)) {
		collapseOk = false
		problems.push(`accentCollapsed=${item.accentCollapsed} but accent==foreground is ${item.accent === item.foreground}`)
	}

	// 5 — the side-car agrees with the item it is meant to render (not a listed check; a staging
	//     mistake that would silently show the reviewer the wrong colours).
	let sidecarOk = true
	const side = sidecar[item.itemId]
	if (side === undefined) {
		sidecarOk = false
		problems.push("no side-car entry")
	} else {
		const byRole = Object.fromEntries(side.roles.map((role) => [role.role, role.hex]))
		for (const [role, hex] of [
			["background", item.background],
			["surface", item.surface],
			["foreground", item.foreground],
			["accent", item.accent],
		] as const) {
			if (byRole[role] !== hex) {
				sidecarOk = false
				problems.push(`side-car ${role} ${byRole[role]} != item ${hex}`)
			}
		}
	}

	const verdict = problems.length === 0 ? "PASS" : "FAIL"
	report.push(
		`${item.itemId}  ${verdict}  path=${pathOk ? "yes" : "NO"}  exact-pixel=${pixelsOk ? `yes (${checkedCount}/${checkedCount})` : "NO"}  gradient-endpoints=${item.gradient === null ? "n/a" : gradientOk ? "yes" : "NO"}  collapse=${collapseOk ? "yes" : "NO"}  sidecar=${sidecarOk ? "yes" : "NO"}`,
	)
	if (problems.length > 0) failures.push(`${item.itemId}: ${problems.join("; ")}`)
}

console.log(report.join("\n"))
console.log(`\n${items.length} items · ${failures.length === 0 ? "ALL PASS" : `${failures.length} FAILED`}`)
if (failures.length > 0) {
	console.log(failures.join("\n"))
	process.exitCode = 1
}
