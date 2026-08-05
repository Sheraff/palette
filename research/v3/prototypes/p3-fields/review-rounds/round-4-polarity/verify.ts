/**
 * Round 4 (near-neutral polarity pairwise) — the staging checklist, run as code.
 *
 * Eleven checks against what is actually on disk. `VERIFY.md` records the run.
 *
 *  1. **Path resolves in the MAIN checkout.** `items.jsonl` carries repo-relative paths; the round was
 *     staged from a worktree whose corpus shards are symlinks. The path the consumer will use is
 *     `<main checkout>/<imagePath>`, so that is the path checked — not the worktree's.
 *  2. **Every hex on BOTH sides is an exact pixel at native resolution.** Decoded here independently
 *     of the pipeline: sRGB, no resample, alpha-excluded. This matters more in this round than in
 *     round 3, where the second side was *constructed* from the first and could not introduce a new
 *     colour. Here side 1 is a genuine second run of the selection cascade, so it can in principle
 *     publish a colour side 0 never did — and every colour it publishes must still be a pixel of the
 *     artwork. That is the discipline line, checked rather than assumed.
 *  3. **Gradient endpoints are the field roles, on BOTH sides**, and the two sides' ramps are exact
 *     reverses of each other in colour with positions reflected. A ramp that did not reverse would
 *     mean the orientation was not re-derived from the new background.
 *  4. **Collapse flags consistent**, in both directions, on both sides.
 *  5. **The two sides differ in exactly `background`, `surface`, `gradient` — and background/surface
 *     are exactly swapped.** `foreground`, `accent` and both collapse flags must be byte-identical.
 *     Anything else differing would be a second manipulation the question did not ask about.
 *  6. **`validatePalette` passes on both sides of all six covers** (12/12). Pre-registered: this round
 *     cannot settle contract validity, so a pair with a contract-invalid side is a leading question
 *     and must not ship.
 *  7. **`render-preview.json` renders the item it belongs to** — a staging mistake that would make a
 *     human eyeball the wrong pair.
 *  8. **Side 0 is byte-for-byte what the published candidate emits.** Compared against
 *     `run-coverage-220-0.3.0.jsonl`, which was produced by `bead404`'s `src/` — so this check is
 *     simultaneously "the pinned copy reproduces the run" and "the override is inert when unset".
 *  9. **The pinned copy is `5a4f845` plus exactly the two documented changes.** Re-extracted here with
 *     `git show 5a4f845:<path>` and diffed; the diff must touch only the import-depth rewrite and the
 *     `P3_FORCE_BG_POLARITY` block.
 * 10. **The override changed only the polarity decision.** Off the diagnostics chains: identical
 *     `{e1, e2}` pixel set, identical field median, ends step and field-set rule; `farIsBackground`
 *     inverted. Plus the reproduction leg — forcing the polarity the shipped rule *already chose*
 *     reproduces the published palette exactly, on all 19 scanned candidates.
 * 11. **Nothing served carries a mechanism hint.** `itemId`s are the neutral `item-NNN` form and the
 *     orchestrator-only keys are confined to fields `parseItem` does not read.
 *
 *   node --experimental-strip-types research/v3/prototypes/p3-fields/review-rounds/round-4-polarity/verify.ts
 *
 * Exit code 0 = every check passed. Non-zero = something must not ship.
 */

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { validatePalette } from "../../../../src/contract/invariants.ts"
import type { Palette } from "../../../../src/contract/types.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const WORK = join(HERE, "work")
const MEASUREMENTS = join(HERE, "..", "..", "measurements")
const WORKTREE = "/Users/Flo/GitHub/palette/.worktrees/p3-fields"
const PINNED_COMMIT = "5a4f845"

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
	pool: string
	prevalenceRelativeGap: number
	tieBandFired: boolean
	publishedPolarity: "dark" | "light"
	deltaL: number
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

const runRows = new Map<number, { index: number; imagePath: string; ok: boolean; palette: Palette }>()
for (const line of readFileSync(join(MEASUREMENTS, "run-coverage-220-0.3.0.jsonl"), "utf8").trim().split("\n")) {
	const parsed = JSON.parse(line)
	if (parsed.kind === "devloop-run-row") runRows.set(parsed.index, parsed)
}

const loadScan = (file: string) =>
	new Map(
		readFileSync(join(WORK, file), "utf8").trim().split("\n").map((line) => {
			const row = JSON.parse(line)
			return [row.imagePath as string, row] as const
		}),
	)
const scanPublished = loadScan("published-220.jsonl")
const scanLight = loadScan("forced-light.jsonl")
const scanDark = loadScan("forced-dark.jsonl")

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

// -------------------------------------------------------------------------------------------
// Per-item checks 1–7
// -------------------------------------------------------------------------------------------

for (const item of items) {
	const absolute = join(MAIN_CHECKOUT, item.imagePath)
	const problems: string[] = []
	const [publishedSide, invertedSide] = item.sides

	// 1 — path resolves in the MAIN checkout.
	const pathOk = existsSync(absolute)
	if (!pathOk) problems.push(`path does not resolve: ${absolute}`)

	// 2 — every published hex, on BOTH sides, is an exact pixel.
	let pixelsOk = false
	let checkedCount = 0
	if (pathOk) {
		const pixels = await pixelSet(absolute)
		const published: [string, string][] = []
		for (const [label, side] of [["s0/published", publishedSide], ["s1/inverted", invertedSide]] as const) {
			for (const role of ROLES) published.push([`${label}.${role}`, side.palette[role]])
			side.palette.gradient?.stops.forEach((stop, index) => published.push([`${label}.gradient[${index}]`, stop.color]))
		}
		checkedCount = published.length
		const missing = published.filter(([, hex]) => !pixels.has(hex))
		pixelsOk = missing.length === 0
		for (const [where, hex] of missing) problems.push(`${where} ${hex} is not a pixel of the image`)
	}

	// 3 — gradient endpoints are the field roles on BOTH sides, and the ramps reverse.
	let endpointsOk = true
	const a = publishedSide.palette.gradient
	const b = invertedSide.palette.gradient
	if ((a === null) !== (b === null)) {
		endpointsOk = false
		problems.push(`gradient present on one side only (s0=${a !== null}, s1=${b !== null})`)
	} else if (a !== null && b !== null) {
		for (const [label, side] of [["s0", publishedSide], ["s1", invertedSide]] as const) {
			const stops = side.palette.gradient!.stops
			if (stops[0].color !== side.palette.background) {
				endpointsOk = false
				problems.push(`${label}: first stop ${stops[0].color} != background ${side.palette.background}`)
			}
			if (stops[stops.length - 1].color !== side.palette.surface) {
				endpointsOk = false
				problems.push(`${label}: last stop ${stops[stops.length - 1].color} != surface ${side.palette.surface}`)
			}
		}
		if (a.stops.length !== b.stops.length) {
			endpointsOk = false
			problems.push(`stop counts differ: ${a.stops.length} vs ${b.stops.length}`)
		} else {
			// Colours reverse and positions reflect: the ramp was re-derived from the new background,
			// not relabelled. Positions are compared with a tolerance because they come out of the
			// excursion machinery's own rank arithmetic on each run, not from `1 - t` applied here.
			for (let index = 0; index < a.stops.length; index += 1) {
				const mirror = b.stops[a.stops.length - 1 - index]
				if (a.stops[index].color !== mirror.color) {
					endpointsOk = false
					problems.push(`stop ${index} ${a.stops[index].color} != reversed stop ${mirror.color}`)
				}
				if (Math.abs(a.stops[index].position + mirror.position - 1) > 0.0626) {
					endpointsOk = false
					problems.push(
						`stop ${index} position ${a.stops[index].position} + mirror ${mirror.position} != 1 (±1 rank step)`,
					)
				}
			}
		}
	}

	// 4 — collapse flags consistent, both directions, both sides.
	let collapseOk = true
	for (const [label, side] of [["s0", publishedSide], ["s1", invertedSide]] as const) {
		const p = side.palette
		if (p.surfaceCollapsed !== (p.surface === p.background)) {
			collapseOk = false
			problems.push(`${label}: surfaceCollapsed=${p.surfaceCollapsed} but surface==background is ${p.surface === p.background}`)
		}
		if (p.accentCollapsed !== (p.accent === p.foreground)) {
			collapseOk = false
			problems.push(`${label}: accentCollapsed=${p.accentCollapsed} but accent==foreground is ${p.accent === p.foreground}`)
		}
		if (p.surfaceCollapsed) {
			// The round's whole premise: a collapsed field has no polarity to invert.
			collapseOk = false
			problems.push(`${label}: surface is collapsed — this cover is not a two-sided polarity question`)
		}
	}

	// 5 — the sides differ in exactly {background, surface, gradient}, with bg/sf swapped.
	let onlyPolarityOk = true
	const differing = Object.keys(publishedSide.palette).filter(
		(key) =>
			JSON.stringify((publishedSide.palette as Record<string, unknown>)[key]) !==
			JSON.stringify((invertedSide.palette as Record<string, unknown>)[key]),
	)
	const want = publishedSide.palette.gradient === null ? "background,surface" : "background,surface,gradient"
	if (differing.join(",") !== want) {
		onlyPolarityOk = false
		problems.push(`sides differ in [${differing.join(", ")}], want exactly [${want}]`)
	}
	if (publishedSide.palette.background !== invertedSide.palette.surface) {
		onlyPolarityOk = false
		problems.push(`s0.background ${publishedSide.palette.background} != s1.surface ${invertedSide.palette.surface}`)
	}
	if (publishedSide.palette.surface !== invertedSide.palette.background) {
		onlyPolarityOk = false
		problems.push(`s0.surface ${publishedSide.palette.surface} != s1.background ${invertedSide.palette.background}`)
	}
	if (publishedSide.variantId === invertedSide.variantId) {
		onlyPolarityOk = false
		problems.push("both sides carry the same variantId — parseItem refuses that")
	}

	// 6 — validatePalette on both sides. Re-run here from the run row's full Palette, which is the
	// shape the invariants take; the snapshot on the item line is a projection of it.
	const scanRowFor = (side: "s0" | "s1") => {
		const worktreePath = join(WORKTREE, item.imagePath)
		if (side === "s0") return scanPublished.get(worktreePath)
		return (item.publishedPolarity === "dark" ? scanLight : scanDark).get(worktreePath)
	}
	let contractOk = true
	for (const side of ["s0", "s1"] as const) {
		const row = scanRowFor(side)
		if (row === undefined) {
			contractOk = false
			problems.push(`${side}: no scan row`)
			continue
		}
		const verdict = validatePalette(row.palette as Palette)
		if (!verdict.valid) {
			contractOk = false
			problems.push(`${side}: validatePalette FAIL — ${verdict.violations.map((v: { code: string }) => v.code).join(",")}`)
		}
		// And the snapshot on the item line must be that palette, not a different one.
		const roles = (row.palette as Palette).roles
		const snapshot = side === "s0" ? publishedSide.palette : invertedSide.palette
		for (const role of ROLES) {
			if (roles[role].hex !== snapshot[role]) {
				contractOk = false
				problems.push(`${side}.${role}: item line ${snapshot[role]} != scan ${roles[role].hex}`)
			}
		}
	}

	// 7 — render-preview.json renders this item.
	let previewOk = true
	const entry = preview[item.itemId]
	if (entry === undefined) {
		previewOk = false
		problems.push("no render-preview entry")
	} else {
		const pairs = [
			["pushedSide0_asPublished", publishedSide],
			["pushedSide1_polarityInverted", invertedSide],
		] as const
		for (const [key, side] of pairs) {
			const rendered = entry[key]
			if (rendered === undefined) {
				previewOk = false
				problems.push(`render-preview missing ${key}`)
				continue
			}
			for (const role of ROLES) {
				const hex = rendered.roles.find((r) => r.role === role)?.hex
				if (hex !== side.palette[role]) {
					previewOk = false
					problems.push(`render-preview ${key}.${role} ${hex} != ${side.palette[role]}`)
				}
			}
		}
	}

	const flags = [
		["path", pathOk],
		["pixels", pixelsOk],
		["endpoints", endpointsOk],
		["collapse", collapseOk],
		["polarity-only", onlyPolarityOk],
		["contract", contractOk],
		["preview", previewOk],
	] as const
	report.push(
		`${item.itemId} [${item.pool}] gap=${item.prevalenceRelativeGap.toFixed(5)} ΔL=${item.deltaL.toFixed(4)} ` +
			`pub=${item.publishedPolarity} hexes=${checkedCount} ` +
			flags.map(([name, ok]) => `${name}:${ok ? "ok" : "FAIL"}`).join(" "),
	)
	for (const problem of problems) failures.push(`${item.itemId}: ${problem}`)
}

// -------------------------------------------------------------------------------------------
// 8 — side 0 is byte-for-byte the published candidate's output
// -------------------------------------------------------------------------------------------

let reproduced = 0
for (const [index, row] of runRows) {
	const scan = scanPublished.get(row.imagePath)
	if (scan === undefined) {
		failures.push(`check 8: run row #${index} has no published-side scan`)
		continue
	}
	if (JSON.stringify(scan.palette) !== JSON.stringify(row.palette)) {
		failures.push(`check 8: #${index} pinned output != run-coverage-220 row`)
		continue
	}
	reproduced += 1
}
report.push(`check 8: pinned copy reproduces ${reproduced}/${runRows.size} coverage-220 rows exactly`)

// -------------------------------------------------------------------------------------------
// 9 — the pinned copy is 5a4f845 plus exactly the two documented changes
// -------------------------------------------------------------------------------------------

const PINNED_DIR = join(HERE, "_pinned-5a4f845")
const IMPORT_REWRITE = [/from "\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/src\//, /from "\.\.\/\.\.\/\.\.\/src\//] as const
const pinnedFiles = readdirSync(PINNED_DIR).filter((name) => name.endsWith(".ts")).sort()
let provenanceOk = true
const overrideTouched: string[] = []

for (const name of pinnedFiles) {
	const local = readFileSync(join(PINNED_DIR, name), "utf8")
	const upstream = execFileSync(
		"git",
		["-C", WORKTREE, "show", `${PINNED_COMMIT}:research/v3/prototypes/p3-fields/src/${name}`],
		{ encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
	)
	// Undo the two documented changes and the file must become the committed one exactly.
	const undone = local
		.replaceAll('from "../../../../../src/', 'from "../../../src/')
		// The override block, in each of the three files it touches, delimited by its own identifiers.
		.replace(/\n\/\*\*\n \* Which lightness extreme[\s\S]*?\n}\n\n(?=\/\*\*\n \* \*\*The L axis's midpoint\*\*)/, "\n")
		.replace(/\tbackgroundPolarityOverrideInUse,\n/, "")
		.replace(/\t\/\*\* True when the gap fell inside δ_bs[\s\S]*?\n\tprevalenceTieBandFired: boolean\n\t\/\*\*\n\t \* Which rule actually settled[\s\S]*?\n\tpolarityDecidedBy: [^\n]*\n/, "\t/** True when the gap fell inside δ_bs and the darker-end convention decided instead of the count. */\n\tprevalenceTieBandFired: boolean\n")
		.replace(/\t\t\t\/\/ The no-extent path never reaches step 5[\s\S]*?\n\t\t\tpolarityDecidedBy: "no-extent",\n/, "")
		.replace(/\t\/\/ \*\*Dev-only, and not present in `src\/`\.\*\*[\s\S]*?const polarityOverride = backgroundPolarityOverrideInUse\(\)\n\tif \(polarityOverride !== null\) \{\n\t\tconst farL = lab\[farEnd \* 3\]\n\t\tconst nearL = lab\[nearEnd \* 3\]\n\t\tfarIsBackground = polarityOverride === "dark" \? farL < nearL : farL > nearL\n\t\} else if \(relativeGap >= BACKGROUND_PREVALENCE_TIE_BAND\) \{/, "\tif (relativeGap >= BACKGROUND_PREVALENCE_TIE_BAND) {")
		.replace(/\t\tpolarityDecidedBy: polarityOverride !== null\n[\s\S]*?: "prevalence",\n/, "")
		.replace(/\t\t\t\/\/ Which rule settled the polarity[\s\S]*?\n\t\t\tpolarityOverride: backgroundPolarityOverrideInUse\(\),\n/, "")
	if (undone !== upstream) {
		provenanceOk = false
		failures.push(`check 9: ${name} is not ${PINNED_COMMIT} + the two documented changes`)
	}
	if (local.includes("backgroundPolarityOverrideInUse") || local.includes("polarityDecidedBy")) overrideTouched.push(name)
	if (!IMPORT_REWRITE[0].test(local) && IMPORT_REWRITE[1].test(local)) {
		provenanceOk = false
		failures.push(`check 9: ${name} still carries the un-rewritten import depth`)
	}
}
report.push(
	`check 9: ${pinnedFiles.length} pinned files, provenance ${provenanceOk ? "ok" : "FAIL"}; ` +
		`override touches [${overrideTouched.join(", ")}]`,
)

// The pinned copy must not be reachable from the shipping candidate, and live `src/` must not carry
// the override — the two are the same statement from opposite ends.
//
// This is the ONE read of live `src/`, and it is read-only and tolerant on purpose: another worker is
// editing that directory under 0.4.0 while this round is staged, so a missing or renamed file there is
// their business and must not fail this round's checklist. What would be a real failure is finding the
// override in a file that is on the shipping path.
const LIVE_SRC = join(HERE, "..", "..", "src")
const liveFiles = existsSync(LIVE_SRC) ? readdirSync(LIVE_SRC).filter((name) => name.endsWith(".ts")) : []
const contaminated = liveFiles.filter((name) => {
	const text = readFileSync(join(LIVE_SRC, name), "utf8")
	return text.includes("P3_FORCE_BG_POLARITY") || text.includes("backgroundPolarityOverrideInUse")
})
for (const name of contaminated) {
	failures.push(`check 9: live src/${name} carries the override — it must exist in the pinned copy only`)
}
report.push(
	liveFiles.length === 0
		? "check 9b: live src/ not readable at this moment (another worker owns it) — override containment NOT checked"
		: `check 9b: override absent from all ${liveFiles.length} live src/*.ts files`,
)

// -------------------------------------------------------------------------------------------
// 10 — the override changed only the polarity decision
// -------------------------------------------------------------------------------------------

let sameLegOk = 0
let swapLegOk = 0
let scanned = 0
for (const [path, forced] of scanLight) {
	const base = scanPublished.get(path)
	const dark = scanDark.get(path)
	if (base === undefined || dark === undefined) continue
	scanned += 1
	const polarity = base.backgroundL < base.surfaceL ? "dark" : "light"
	const same = polarity === "dark" ? dark : forced
	const opposite = polarity === "dark" ? forced : dark
	// The reproduction leg: forcing the polarity the shipped rule already chose must reproduce it.
	if (JSON.stringify(same.palette) === JSON.stringify(base.palette)) sameLegOk += 1
	else failures.push(`check 10: ${path} forced-${polarity} != published`)
	// The swap leg: same two end pixels, same median/step/rule, inverted assignment.
	const endsSame =
		new Set([base.e1, base.e2]).size === 2 &&
		new Set([opposite.e1, opposite.e2]).size === 2 &&
		[base.e1, base.e2].every((pixel) => pixel === opposite.e1 || pixel === opposite.e2) &&
		base.median === opposite.median &&
		base.endsStep === opposite.endsStep &&
		base.fieldSetRule === opposite.fieldSetRule
	const inverted =
		base.farIsBackground !== opposite.farIsBackground &&
		base.palette.roles.background.hex === opposite.palette.roles.surface.hex &&
		base.palette.roles.surface.hex === opposite.palette.roles.background.hex &&
		base.palette.roles.foreground.hex === opposite.palette.roles.foreground.hex &&
		base.palette.roles.accent.hex === opposite.palette.roles.accent.hex
	if (endsSame && inverted) swapLegOk += 1
	else failures.push(`check 10: ${path} — endsSame=${endsSame} inverted=${inverted}`)
}
report.push(`check 10: ${scanned} candidates — reproduction leg ${sameLegOk}/${scanned}, swap leg ${swapLegOk}/${scanned}`)

// -------------------------------------------------------------------------------------------
// 11 — nothing served carries a mechanism hint
// -------------------------------------------------------------------------------------------

const SERVED_ITEM_KEYS = ["itemId", "imagePath", "collection", "artworkId", "sides"] as const
const HINTS = /polarity|invert|dark|light|tie|prevalence|background-end|forced/i
let blindingOk = true
for (const item of items) {
	if (!/^item-\d{3}$/.test(item.itemId)) {
		blindingOk = false
		failures.push(`check 11: ${item.itemId} is not the neutral item-NNN form`)
	}
	// `variantId` and `fingerprint` are on `sides` but `blindSidePayload` does not serve them; what
	// reaches the browser is roles, collapse flags, stops and fieldCss. Assert that shape here so a
	// future change to the push shape cannot smuggle a label through.
	for (const side of item.sides) {
		const keys = Object.keys(side).sort().join(",")
		if (keys !== "fingerprint,palette,variantId") {
			blindingOk = false
			failures.push(`check 11: ${item.itemId} side has keys [${keys}] — unexpected, re-check what is served`)
		}
	}
	const servedOnly = Object.fromEntries(SERVED_ITEM_KEYS.map((key) => [key, (item as Record<string, unknown>)[key]]))
	const serialized = JSON.stringify({ ...servedOnly, sides: item.sides.map((side) => side.palette) })
	if (HINTS.test(serialized)) {
		blindingOk = false
		failures.push(`check 11: ${item.itemId}'s served fields match /${HINTS.source}/`)
	}
}
report.push(`check 11: blinding ${blindingOk ? "ok" : "FAIL"} — ${items.length} neutral itemIds, no mechanism text in served fields`)

// -------------------------------------------------------------------------------------------

console.log(report.join("\n"))
console.log()
if (failures.length === 0) {
	console.log(`ALL CHECKS PASS — ${items.length} items, ${items.length * 2} palettes`)
	process.exit(0)
}
console.log(`${failures.length} FAILURES`)
for (const failure of failures) console.log(`  ${failure}`)
process.exit(1)
