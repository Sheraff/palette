/**
 * Gate on the round-1 fixture. `node --experimental-strip-types validate.ts` — exit 0 or nothing ships.
 *
 * It re-reads `items.json` from disk rather than trusting anything `build.ts` held in memory, because
 * the file is the artifact: the orchestrator installs THAT, and a check that runs inside the builder
 * only proves the builder agreed with itself.
 *
 * The blinding check is a text scan over the raw bytes, not a walk over the parsed object. A leak
 * does not have to be in a field anyone anticipated — it can ride in on a key name, a stray note, or
 * a version string someone pasted in — and the reviewer's grade is only about the palette for as
 * long as nothing in the file says whose palette it is.
 */

import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const HERE = import.meta.dirname
const ROOT = join(HERE, "..", "..", "..", "..", "..", "..")

const problems: string[] = []
const fail = (message: string) => problems.push(message)

const raw = readFileSync(join(HERE, "items.json"), "utf8")
const items = JSON.parse(raw) as Item[]

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
	sides: { variantId: string; palette: Palette; fingerprint: Record<string, unknown> }[]
}

// --- 1. shape -------------------------------------------------------------------------------

if (!Array.isArray(items)) fail("items.json is not an array")
if (items.length !== 8) fail(`expected 8 items, found ${items.length}`)

const seenIds = new Set<string>()
for (const item of items) {
	if (seenIds.has(item.itemId)) fail(`duplicate itemId ${item.itemId}`)
	seenIds.add(item.itemId)

	// The slug is meant to be derivable from the basename; if it is not, the id is not deterministic.
	const expected = (item.imagePath.split("/").pop() ?? "").replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")
	if (item.itemId !== expected) fail(`${item.itemId}: itemId is not the slug of its basename (expected ${expected})`)

	if (item.collection !== "demo-20") fail(`${item.itemId}: collection is ${item.collection}, expected demo-20`)
	if (!Array.isArray(item.sides) || item.sides.length !== 2) fail(`${item.itemId}: expected exactly 2 sides`)
}

// --- 2. every colour is an exact #rrggbb ------------------------------------------------------

/** Lowercase only. The pipelines publish lowercase, and "hex-exact" comparisons are string compares. */
const HEX = /^#[0-9a-f]{6}$/

function checkHex(label: string, value: unknown): value is string {
	if (typeof value !== "string" || !HEX.test(value)) {
		fail(`${label}: ${JSON.stringify(value)} is not a lowercase #rrggbb hex`)
		return false
	}
	return true
}

for (const item of items) {
	item.sides.forEach((side, sideIndex) => {
		const where = `${item.itemId}[${sideIndex === 0 ? "A" : "B"}]`
		const p = side.palette
		for (const role of ["background", "surface", "foreground", "accent"] as const) checkHex(`${where}.${role}`, p[role])

		// --- 3. the gradient endpoint ruling: stops[0] IS background, stops[last] IS surface -----
		if (p.gradient !== null) {
			const stops = p.gradient.stops
			if (!Array.isArray(stops) || stops.length < 2) {
				fail(`${where}.gradient: fewer than 2 stops`)
			} else {
				stops.forEach((stop, i) => {
					checkHex(`${where}.gradient.stops[${i}].color`, stop.color)
					if (typeof stop.position !== "number" || stop.position < 0 || stop.position > 1) {
						fail(`${where}.gradient.stops[${i}].position ${stop.position} is outside [0, 1]`)
					}
					if (i > 0 && stop.position <= stops[i - 1]!.position) fail(`${where}.gradient.stops[${i}]: positions are not strictly increasing`)
				})
				const first = stops[0]!
				const last = stops[stops.length - 1]!
				if (first.color !== p.background) fail(`${where}.gradient: stops[0] ${first.color} is not the background ${p.background}`)
				if (last.color !== p.surface) fail(`${where}.gradient: last stop ${last.color} is not the surface ${p.surface}`)
			}
			// A collapsed surface means there is no gradient to publish.
			if (p.surfaceCollapsed) fail(`${where}: surfaceCollapsed is set but a gradient is published`)
		}

		// --- 4. collapse flags say exactly what the hexes say ------------------------------------
		if (p.surfaceCollapsed !== (p.surface === p.background)) {
			fail(`${where}: surfaceCollapsed=${p.surfaceCollapsed} but surface ${p.surface} vs background ${p.background}`)
		}
		if (p.accentCollapsed !== (p.accent === p.foreground)) {
			fail(`${where}: accentCollapsed=${p.accentCollapsed} but accent ${p.accent} vs foreground ${p.foreground}`)
		}
	})

	// The two sides must be two readings of ONE cover — a mismatch here would make the pair meaningless.
	if (item.sides.length === 2 && item.sides[0]!.variantId === item.sides[1]!.variantId) {
		fail(`${item.itemId}: both sides carry the same variantId`)
	}
}

// --- 5. blinding: nothing in the file names a candidate, a pipeline, or a class ----------------

/**
 * Word-boundary matches, because `tos` is a substring of `stops` and `alpha` of nothing here — a
 * naive `includes` would either miss the real leaks or fire on every gradient in the file.
 */
const FORBIDDEN: [RegExp, string][] = [
	[/\bp2-alpha\b/i, "the alpha candidate id"],
	[/\bp2-tos\b/i, "the tos candidate id"],
	[/\balpha\b/i, "the alpha pipeline name"],
	[/\btos\b/i, "the tos pipeline name"],
	[/quasi[- ]?flat/i, "the quasi-flat-zone family name"],
	[/flat[- ]?zone/i, "the quasi-flat-zone family name"],
	[/tree[- ]of[- ]shapes/i, "the tree-of-shapes family name"],
	[/\blaminar\b/i, "the field verdict — a prior about what the round expects"],
	[/\bpartitioned\b/i, "the field verdict"],
	[/\bunreadable\b/i, "the field verdict"],
	[/\btextured\b/i, "the field verdict"],
	[/"verdict"|"coverage"|"class"/i, "the field-verdict machinery"],
]
for (const [pattern, why] of FORBIDDEN) {
	const hit = raw.match(pattern)
	if (hit) fail(`blinding leak: items.json contains ${JSON.stringify(hit[0])} — ${why}`)
}

// --- 6. every image is on disk ----------------------------------------------------------------

for (const item of items) {
	if (typeof item.imagePath !== "string" || item.imagePath.startsWith("/")) {
		fail(`${item.itemId}: imagePath must be repo-relative, got ${item.imagePath}`)
		continue
	}
	if (!existsSync(join(ROOT, item.imagePath))) fail(`${item.itemId}: image not on disk at ${item.imagePath}`)
}

// ----------------------------------------------------------------------------------------------

if (problems.length > 0) {
	for (const problem of problems) console.error(`FAIL  ${problem}`)
	console.error(`\n${problems.length} problem(s) — the fixture is not shippable.`)
	process.exit(1)
}

const gradients = items.map((i) => i.sides.filter((s) => s.palette.gradient !== null).length)
console.log(`OK  8 items, 16 sides, ${gradients.reduce((a, b) => a + b, 0)} published gradients, blinding clean.`)
