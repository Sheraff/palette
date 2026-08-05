/**
 * Gate on the round-3 quality fixture. `node --experimental-strip-types validate.ts` — exit 0 or
 * nothing ships.
 *
 * It re-reads `items.json` from disk rather than trusting anything `build.ts` held in memory,
 * because the file is the artifact: the orchestrator installs THAT, and a check that runs inside the
 * builder only proves the builder agreed with itself.
 *
 * Two checks here are new relative to round 1 and are the reason this file is long:
 *
 * - **Exact triples.** Every published colour is decoded out of the artwork by this file's own
 *   `sharp` call and looked up in the image's exact colour set. The candidate claims every published
 *   colour is a pixel of the source; a round is where that claim reaches a human, so it is verified
 *   against the bytes here and not taken on the candidate's word.
 * - **D7's margin guard.** `DECISIONS.md` D7: *"the reviewer grades margins; optimizers sit on
 *   floors"* — a published pair at the same-colour bar plus an epsilon reads as one colour, and an
 *   item built on one collects a complaint about the instrument instead of a grade of the palette.
 *
 * The blinding check is a text scan over the raw bytes, not a walk over the parsed object. A leak
 * does not have to be in a field anyone anticipated.
 */

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { colorDistance, colorFromHex } from "../../../../src/contract/color.ts"
import { ITEM_COUNT, MARGIN_FLOOR } from "./build.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "..", "..", "..", "..", "..", "..")

const problems: string[] = []
const fail = (message: string) => problems.push(message)

const raw = readFileSync(join(HERE, "items.json"), "utf8")

type Palette = {
	background: string
	surface: string
	foreground: string
	accent: string
	gradient: null | { stops: { color: string; position: number }[] }
	surfaceCollapsed: boolean
	accentCollapsed: boolean
}
type Item = {
	itemId: string
	imagePath: string
	collection: string
	variantId: string
	palette: Palette
	fingerprint: { algorithmVersion: string; preprocessingVersion: string; gitCommit: string; dirty: boolean }
}

const items = JSON.parse(raw) as Item[]
const ROLES = ["background", "surface", "foreground", "accent"] as const

// --- 1. shape ---------------------------------------------------------------------------------

if (!Array.isArray(items)) fail("items.json is not an array")
if (items.length !== ITEM_COUNT) fail(`expected ${ITEM_COUNT} items, found ${items.length}`)

const seenIds = new Set<string>()
for (const item of items) {
	if (seenIds.has(item.itemId)) fail(`duplicate itemId ${item.itemId}`)
	seenIds.add(item.itemId)

	const expected = (item.imagePath.split("/").pop() ?? "")
		.replace(/\.[^.]+$/, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
	if (item.itemId !== expected) fail(`${item.itemId}: itemId is not the slug of its basename (expected ${expected})`)

	if (item.collection !== "coverage-set-1") fail(`${item.itemId}: collection is ${item.collection}, expected coverage-set-1`)
	// Absolute grading: one palette, no sides. A `sides` array here would mean the wrong builder ran.
	if ("sides" in (item as object)) fail(`${item.itemId}: a calibration item must carry one palette, not sides`)
	if (typeof item.variantId !== "string" || item.variantId.length === 0) fail(`${item.itemId}: missing variantId`)

	const fingerprint = item.fingerprint
	if (typeof fingerprint !== "object" || fingerprint === null) {
		fail(`${item.itemId}: missing fingerprint`)
	} else {
		if (!/^[0-9a-f]{40}$/.test(fingerprint.gitCommit)) fail(`${item.itemId}: fingerprint.gitCommit is not a full sha1`)
		if (typeof fingerprint.dirty !== "boolean") fail(`${item.itemId}: fingerprint.dirty must be a boolean`)
		if (typeof fingerprint.preprocessingVersion !== "string" || fingerprint.preprocessingVersion.length === 0) {
			fail(`${item.itemId}: fingerprint.preprocessingVersion is empty`)
		}
	}
}

// --- 2. every colour is an exact lowercase #rrggbb ---------------------------------------------

const HEX = /^#[0-9a-f]{6}$/

function checkHex(label: string, value: unknown): boolean {
	if (typeof value !== "string" || !HEX.test(value)) {
		fail(`${label}: ${JSON.stringify(value)} is not a lowercase #rrggbb hex`)
		return false
	}
	return true
}

for (const item of items) {
	const palette = item.palette
	for (const role of ROLES) checkHex(`${item.itemId}.${role}`, palette[role])

	// --- 3. the gradient endpoint ruling: stops[0] IS background, stops[last] IS surface ---------
	if (palette.gradient !== null) {
		const stops = palette.gradient.stops
		if (!Array.isArray(stops) || stops.length < 2) {
			fail(`${item.itemId}.gradient: fewer than 2 stops`)
		} else {
			stops.forEach((stop, index) => {
				checkHex(`${item.itemId}.gradient.stops[${index}].color`, stop.color)
				if (typeof stop.position !== "number" || stop.position < 0 || stop.position > 1) {
					fail(`${item.itemId}.gradient.stops[${index}].position ${stop.position} is outside [0, 1]`)
				}
				if (index > 0 && stop.position <= stops[index - 1]!.position) {
					fail(`${item.itemId}.gradient.stops[${index}]: positions are not strictly increasing`)
				}
			})
			const first = stops[0]!
			const last = stops[stops.length - 1]!
			if (first.color !== palette.background) {
				fail(`${item.itemId}.gradient: stops[0] ${first.color} is not the background ${palette.background}`)
			}
			if (last.color !== palette.surface) {
				fail(`${item.itemId}.gradient: last stop ${last.color} is not the surface ${palette.surface}`)
			}
		}
		if (palette.surfaceCollapsed) fail(`${item.itemId}: surfaceCollapsed is set but a gradient is published`)
	}

	// --- 4. collapse flags say exactly what the hexes say ----------------------------------------
	if (palette.surfaceCollapsed !== (palette.surface === palette.background)) {
		fail(`${item.itemId}: surfaceCollapsed=${palette.surfaceCollapsed} but surface ${palette.surface} vs background ${palette.background}`)
	}
	if (palette.accentCollapsed !== (palette.accent === palette.foreground)) {
		fail(`${item.itemId}: accentCollapsed=${palette.accentCollapsed} but accent ${palette.accent} vs foreground ${palette.foreground}`)
	}

	// --- 5. D7's margin guard --------------------------------------------------------------------
	for (let first = 0; first < ROLES.length; first += 1) {
		for (let second = first + 1; second < ROLES.length; second += 1) {
			const a = palette[ROLES[first]]
			const b = palette[ROLES[second]]
			if (a === b) continue
			const distance = colorDistance(colorFromHex(a), colorFromHex(b))
			if (distance < MARGIN_FLOOR) {
				fail(`${item.itemId}: ${ROLES[first]} ${a} and ${ROLES[second]} ${b} are ${distance.toFixed(5)} apart, under D7's ${MARGIN_FLOOR} margin floor`)
			}
		}
	}
}

// --- 6. blinding: nothing in the file names a candidate, a pipeline, or a class -----------------

const FORBIDDEN: [RegExp, string][] = [
	[/\bp2-alpha\b/i, "the alpha candidate id"],
	[/\bp2-tos\b/i, "the tos candidate id"],
	[/\balpha\b/i, "the alpha pipeline name"],
	[/\btos\b/i, "the tos pipeline name"],
	[/quasi[- ]?flat/i, "the quasi-flat-zone family name"],
	[/flat[- ]?zone/i, "the quasi-flat-zone family name"],
	[/tree[- ]of[- ]shapes/i, "the tree-of-shapes family name"],
	[/\bmerged\b/i, "the integration pass's own label"],
	[/\bchroma\b/i, "the chromatic-lane candidate id"],
	[/\blaminar\b/i, "the field verdict — a prior about what the round expects"],
	[/\bpartitioned\b/i, "the field verdict"],
	[/\bunreadable\b/i, "the field verdict"],
	[/\btextured\b/i, "the field verdict"],
	[/"verdict"|"coverage"|"class"|"laminarity"/i, "the field-verdict machinery"],
]
for (const [pattern, why] of FORBIDDEN) {
	const hit = raw.match(pattern)
	if (hit) fail(`blinding leak: items.json contains ${JSON.stringify(hit[0])} — ${why}`)
}

// --- 7. every image is on disk, repo-relative, and FRESH ----------------------------------------

function setFile(path: string): Set<string> {
	return new Set(
		readFileSync(join(ROOT, path), "utf8")
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line !== "" && !line.startsWith("#")),
	)
}
/** D3's round-composition clause: from round 3 on, P2 draws beyond the covers it was tuned on. */
const alreadySeen = new Set([
	...setFile("research/v3/data/devloop/sets/demo-20.txt"),
	...setFile("research/v3/prototypes/p2-tree/falsifier/out/endorsed-173.txt"),
])

for (const item of items) {
	if (typeof item.imagePath !== "string" || item.imagePath.startsWith("/")) {
		fail(`${item.itemId}: imagePath must be repo-relative, got ${item.imagePath}`)
		continue
	}
	if (!existsSync(join(ROOT, item.imagePath))) fail(`${item.itemId}: image not on disk at ${item.imagePath}`)
	if (alreadySeen.has(item.imagePath)) fail(`${item.itemId}: ${item.imagePath} is not a fresh cover (demo-20 / endorsed-173)`)
}

// --- 8. every published colour is an exact triple of the artwork --------------------------------

/**
 * The candidate's decode contract, re-implemented rather than imported: sRGB, raw, no resample.
 * Importing the pipeline's `decodeImage` would make this check assert that the pipeline agrees with
 * itself. What is wanted is that the published hexes are in the FILE.
 */
async function exactColorsOf(imagePathRelative: string): Promise<Set<number>> {
	const { data, info } = await sharp(join(ROOT, imagePathRelative))
		.toColourspace("srgb")
		.raw()
		.toBuffer({ resolveWithObject: true })
	const channels = info.channels
	const colors = new Set<number>()
	for (let offset = 0; offset < data.length; offset += channels) {
		colors.add((data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2])
	}
	return colors
}

const packOf = (value: string): number => Number.parseInt(value.slice(1), 16)

for (const item of items) {
	if (!existsSync(join(ROOT, item.imagePath))) continue
	const colors = await exactColorsOf(item.imagePath)
	const published = new Map<string, string>()
	for (const role of ROLES) published.set(item.palette[role], role)
	if (item.palette.gradient !== null) {
		item.palette.gradient.stops.forEach((stop, index) => {
			if (!published.has(stop.color)) published.set(stop.color, `gradient.stops[${index}]`)
		})
	}
	for (const [value, where] of published) {
		if (!HEX.test(value)) continue
		if (!colors.has(packOf(value))) fail(`${item.itemId}: ${where} ${value} is not an exact triple of ${item.imagePath}`)
	}
}

// --- 9. deterministic rebuild -------------------------------------------------------------------

/**
 * `build.ts` writes in place, so the committed bytes are snapshotted first and restored if a rebuild
 * disagrees — a validator must not leave the artifact in a state its own failure message describes.
 *
 * One honest caveat, and it is why the mismatch report names the differing JSON paths rather than
 * printing a byte offset: `gitCommit` is read from HEAD, and HEAD moves under this worktree while
 * the round is staged (the orchestrator appends decisions to `DECISIONS.md`). A rebuild that differs
 * only in the fingerprint means the fixture was built at an older commit and must be rebuilt before
 * it ships — which is a real failure, not a tolerance to widen.
 */
const ARTIFACTS = ["items.json", "mapping.private.json"] as const
const before = ARTIFACTS.map((name) => readFileSync(join(HERE, name), "utf8"))
for (let attempt = 0; attempt < 2; attempt += 1) {
	execFileSync("node", ["--experimental-strip-types", join(HERE, "build.ts")], { encoding: "utf8" })
	ARTIFACTS.forEach((name, index) => {
		const after = readFileSync(join(HERE, name), "utf8")
		if (after !== before[index]) {
			fail(`${name}: rebuild ${attempt + 1} does not reproduce the committed file byte-for-byte${differingPaths(before[index], after)}`)
		}
	})
}
ARTIFACTS.forEach((name, index) => writeFileSync(join(HERE, name), before[index]))

function differingPaths(a: string, b: string): string {
	try {
		const left = JSON.parse(a) as unknown
		const right = JSON.parse(b) as unknown
		const paths: string[] = []
		const walk = (x: unknown, y: unknown, path: string) => {
			if (JSON.stringify(x) === JSON.stringify(y)) return
			if (typeof x !== "object" || typeof y !== "object" || x === null || y === null) {
				paths.push(`${path} ${JSON.stringify(x)} → ${JSON.stringify(y)}`)
				return
			}
			const keys = new Set([...Object.keys(x), ...Object.keys(y)])
			for (const key of keys) walk((x as never)[key], (y as never)[key], `${path}.${key}`)
		}
		walk(left, right, "")
		return paths.length > 0 ? ` — differs at: ${paths.slice(0, 6).join("; ")}` : ""
	} catch {
		return ""
	}
}

// ------------------------------------------------------------------------------------------------

if (problems.length > 0) {
	for (const problem of problems) console.error(`FAIL  ${problem}`)
	console.error(`\n${problems.length} problem(s) — the fixture is not shippable.`)
	process.exit(1)
}

const gradients = items.filter((item) => item.palette.gradient !== null).length
console.log(
	`OK  ${items.length} items, ${gradients} published gradient(s), every colour an exact triple, ` +
		`every distinct role pair ≥ ${MARGIN_FLOOR} OKLab, blinding clean, rebuild reproduces byte-for-byte.`,
)
