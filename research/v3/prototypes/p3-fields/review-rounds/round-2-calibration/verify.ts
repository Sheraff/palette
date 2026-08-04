/**
 * Round 2 (calibration) — the staging checklist, run as code. `VERIFY.md` records the run.
 *
 * Round 1's four checks, plus three this round needs because it draws from two runs and two
 * collections instead of one:
 *
 *  1. **Path resolves in the MAIN checkout.** `items.jsonl` carries repo-relative paths; the round was
 *     staged from a worktree whose corpus shards and `music-artworks/` are symlinks. The path the
 *     consumer will use is `<main checkout>/<imagePath>`, so that is the path checked.
 *  2. **Every hex is an exact pixel of its image at native resolution.** The contract's central rule.
 *     Decoded here independently of the pipeline: sRGB, no resample, alpha-excluded, and every hex in
 *     the item — four roles plus every gradient stop, guide stops included — must appear among the
 *     image's actual pixels.
 *  3. **Gradient endpoints are the field roles.** First stop == background, last stop == surface.
 *  4. **Collapse flags are consistent**, in both directions: `surfaceCollapsed` iff surface ==
 *     background, `accentCollapsed` iff accent == foreground.
 *  5. **The side-car renders the item it belongs to** — same four hexes, same gradient stop colours.
 *  6. **The palette passes `validatePalette`, and the item is a faithful copy of its run row.** The
 *     round excludes contract-failing covers, so this is the check that says so rather than the
 *     selection notes claiming it. `validatePalette` needs the *whole* `Palette` (contrast floors and
 *     metadata included), so it runs against the run row the item was built from, and the item's own
 *     hexes are compared field by field against that same row — which is also what makes "nothing was
 *     recomputed at staging time" a checked statement.
 *  7. **Provenance is exact**: `collection` matches `deriveCollection`'s rule for the path, and the
 *     fingerprint is the round's fingerprint on every row.
 *
 *   node --experimental-strip-types research/v3/prototypes/p3-fields/review-rounds/round-2-calibration/verify.ts
 *
 * Exit code 0 = every check passed. Non-zero = something must not ship.
 */

import { existsSync, readFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { validatePalette } from "../../../../src/contract/invariants.ts"
import type { Palette } from "../../../../src/contract/types.ts"

const HERE = dirname(fileURLToPath(import.meta.url))

/** Where a repo-relative corpus path resolves for the consumer of this round. */
const MAIN_CHECKOUT = "/Users/Flo/GitHub/palette"
/** Where the two runs executed. */
const WORKTREE = "/Users/Flo/GitHub/palette/.worktrees/p3-fields"

const FINGERPRINT = {
	algorithmVersion: "p3-fields-0.3.0",
	preprocessingVersion: "sharp-0.33.5/srgb/no-resample/alpha-excluded",
	gitCommit: "bead404",
	dirty: false,
}

type Item = Readonly<{
	itemId: string
	imagePath: string
	collection: string
	variantId: string
	background: string
	surface: string
	foreground: string
	accent: string
	gradient: Readonly<{ stops: readonly Readonly<{ color: string; position: number }>[] }> | null
	surfaceCollapsed: boolean
	accentCollapsed: boolean
	fingerprint: Record<string, unknown>
}>

type RunRow = Readonly<{ kind: string; imagePath: string; ok: boolean; palette: Palette }>

const items: Item[] = readFileSync(join(HERE, "items.jsonl"), "utf8")
	.trim()
	.split("\n")
	.map((line) => JSON.parse(line) as Item)

const sidecar = JSON.parse(readFileSync(join(HERE, "sidecar.data.json"), "utf8")) as Record<
	string,
	{
		roles: { role: string; hex: string; name: string; collapsed: boolean }[]
		gradient: { stops: { hex: string }[] } | null
		fieldCss: string
	}
>

/** Both source runs, indexed by the repo-relative path the items carry. */
const runRows = new Map<string, RunRow>()
for (const file of ["run-regrade-4-0.3.0.jsonl", "../../measurements/run-coverage-220-0.3.0.jsonl"]) {
	for (const line of readFileSync(join(HERE, file), "utf8").trim().split("\n")) {
		const row = JSON.parse(line) as RunRow
		if (row.kind !== "devloop-run-row") continue
		if (!row.imagePath.startsWith(`${WORKTREE}/`)) continue
		runRows.set(row.imagePath.slice(WORKTREE.length + 1), row)
	}
}

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

/** `deriveCollection` from `src/review-server/batch.ts`, applied to the repo-relative path. */
const SHARD_PATTERN = /^[0-9a-f]{2}$/u
function collectionOf(repoRelativePath: string): string {
	if (repoRelativePath.startsWith("music-artworks/")) return "music-artworks"
	const parent = basename(dirname(repoRelativePath))
	return SHARD_PATTERN.test(parent) ? "sharded-corpus" : parent
}

const failures: string[] = []
const report: string[] = []

// Round-level: ids and images are distinct, and the side-car has no extra keys.
const seenIds = new Set<string>()
const seenPaths = new Set<string>()
for (const item of items) {
	if (seenIds.has(item.itemId)) failures.push(`duplicate itemId ${item.itemId}`)
	if (seenPaths.has(item.imagePath)) failures.push(`duplicate image ${item.imagePath}`)
	seenIds.add(item.itemId)
	seenPaths.add(item.imagePath)
}
for (const key of Object.keys(sidecar)) {
	if (!seenIds.has(key)) failures.push(`side-car has key ${key} with no item`)
}

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
		problems.push(
			`surfaceCollapsed=${item.surfaceCollapsed} but surface==background is ${item.surface === item.background}`,
		)
	}
	if (item.accentCollapsed !== (item.accent === item.foreground)) {
		collapseOk = false
		problems.push(
			`accentCollapsed=${item.accentCollapsed} but accent==foreground is ${item.accent === item.foreground}`,
		)
	}

	// 5 — the side-car renders this item.
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
		const sideStops = side.gradient?.stops.map((stop) => stop.hex) ?? null
		const itemStops = item.gradient?.stops.map((stop) => stop.color) ?? null
		if (JSON.stringify(sideStops) !== JSON.stringify(itemStops)) {
			sidecarOk = false
			problems.push(`side-car gradient ${JSON.stringify(sideStops)} != item ${JSON.stringify(itemStops)}`)
		}
	}

	// 6 — the source palette validates, and the item copies it faithfully.
	let contractOk = false
	let copyOk = false
	const row = runRows.get(item.imagePath)
	if (row === undefined || !row.ok) {
		problems.push("no successful run row for this image in either source run")
	} else {
		const result = validatePalette(row.palette)
		contractOk = result.valid
		if (!contractOk) problems.push(`validatePalette FAILED: ${result.violations.map((v) => v.code).join(", ")}`)
		const fromRow = {
			background: row.palette.roles.background.hex,
			surface: row.palette.roles.surface.hex,
			foreground: row.palette.roles.foreground.hex,
			accent: row.palette.roles.accent.hex,
			gradient:
				row.palette.gradient === null
					? null
					: {
							stops: row.palette.gradient.stops.map((stop) => ({ color: stop.color.hex, position: stop.position })),
						},
			surfaceCollapsed: row.palette.collapse.surfaceCollapsed,
			accentCollapsed: row.palette.collapse.accentCollapsed,
		}
		const fromItem = {
			background: item.background,
			surface: item.surface,
			foreground: item.foreground,
			accent: item.accent,
			gradient: item.gradient,
			surfaceCollapsed: item.surfaceCollapsed,
			accentCollapsed: item.accentCollapsed,
		}
		copyOk = JSON.stringify(fromRow) === JSON.stringify(fromItem)
		if (!copyOk) problems.push("item does not match its run row verbatim")
		if (row.palette.metadata.algorithmVersion !== FINGERPRINT.algorithmVersion) {
			problems.push(`run row algorithmVersion ${row.palette.metadata.algorithmVersion} != fingerprint`)
		}
		if (row.palette.metadata.preprocessingVersion !== FINGERPRINT.preprocessingVersion) {
			problems.push(`run row preprocessingVersion ${row.palette.metadata.preprocessingVersion} != fingerprint`)
		}
	}

	// 7 — provenance.
	let provenanceOk = true
	if (item.collection !== collectionOf(item.imagePath)) {
		provenanceOk = false
		problems.push(`collection ${item.collection} != derived ${collectionOf(item.imagePath)}`)
	}
	if (item.variantId !== FINGERPRINT.algorithmVersion) {
		provenanceOk = false
		problems.push(`variantId ${item.variantId} != ${FINGERPRINT.algorithmVersion}`)
	}
	for (const [key, value] of Object.entries(FINGERPRINT)) {
		if (item.fingerprint[key] !== value) {
			provenanceOk = false
			problems.push(`fingerprint.${key} = ${JSON.stringify(item.fingerprint[key])} != ${JSON.stringify(value)}`)
		}
	}

	const verdict = problems.length === 0 ? "PASS" : "FAIL"
	report.push(
		`${item.itemId}  ${verdict}  path=${pathOk ? "yes" : "NO"}  exact-pixel=${pixelsOk ? `yes (${checkedCount}/${checkedCount})` : "NO"}  gradient-endpoints=${item.gradient === null ? "n/a" : gradientOk ? "yes" : "NO"}  collapse=${collapseOk ? "yes" : "NO"}  sidecar=${sidecarOk ? "yes" : "NO"}  contract=${contractOk ? "pass" : "FAIL"}  verbatim=${copyOk ? "yes" : "NO"}  provenance=${provenanceOk ? "yes" : "NO"}`,
	)
	if (problems.length > 0) failures.push(`${item.itemId}: ${problems.join("; ")}`)
}

console.log(report.join("\n"))
console.log(`\n${items.length} items · ${failures.length === 0 ? "ALL PASS" : `${failures.length} FAILED`}`)
if (failures.length > 0) {
	console.log(failures.join("\n"))
	process.exitCode = 1
}
