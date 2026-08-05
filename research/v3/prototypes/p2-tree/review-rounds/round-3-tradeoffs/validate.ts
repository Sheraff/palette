/**
 * Gate on the round-3 trade-off fixture. `node --experimental-strip-types validate.ts` — exit 0 or
 * nothing ships.
 *
 * Same shape as `../round-3-quality/validate.ts` — it re-reads the artifact from disk, scans raw
 * bytes for blinding leaks, decodes each artwork with its own `sharp` call to prove every published
 * colour is an exact triple, applies D7's margin floor to every distinct role pair, and rebuilds
 * twice to prove determinism — plus the two checks a pairwise round owes on top:
 *
 * - **the sides are one palette apart.** Both items exist to price ONE substitution. If any role
 *   other than the accent, or the gradient, or `surfaceCollapsed`, differs between the sides, the
 *   reviewer's preference is not about the accent order and the item is void.
 * - **both accents clear the contract's own foreground/accent separation.** A counterfactual the
 *   contract would have refused is not a counterfactual; it is an invalid palette wearing one.
 */

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { colorDistance, colorFromHex } from "../../../../src/contract/color.ts"
import { FOREGROUND_ACCENT_SEPARATION_DISTANCE } from "../../../../src/contract/constants.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "..", "..", "..", "..", "..", "..")

/** D7's margin floor. Same value and same reasoning as `../round-3-quality/build.ts` documents. */
const MARGIN_FLOOR = 0.02

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
type Side = { variantId: string; palette: Palette; fingerprint: { algorithmVersion: string; preprocessingVersion: string; gitCommit: string; dirty: boolean } }
type Item = { itemId: string; imagePath: string; collection: string; sides: Side[] }

const items = JSON.parse(raw) as Item[]
const ROLES = ["background", "surface", "foreground", "accent"] as const

/**
 * The expected item count, read from the fixture's own private side-car rather than hard-coded.
 *
 * The brief pre-declared that batch B is **two** items unless no demo-20 cover's accent moves under
 * D3's level, in which case it is T1 alone. So the count is a function of a measurement, and the
 * check is that the count agrees with the scan that produced it — not that it equals 2.
 */
const mapping = JSON.parse(readFileSync(join(HERE, "mapping.private.json"), "utf8")) as {
	_salienceScan: { noneDiffered: boolean; selected: string | null; coversDiffering: number }
	_items: Record<string, { question: string; imagePath: string; v1Accent: { hex: string }; v2Accent: { hex: string } }>
}
const expectedCount = mapping._salienceScan.noneDiffered ? 1 : 2

// --- 1. shape ---------------------------------------------------------------------------------

if (!Array.isArray(items)) fail("items.json is not an array")
if (items.length !== expectedCount) fail(`expected ${expectedCount} items, found ${items.length}`)

const seenIds = new Set<string>()
for (const item of items) {
	if (seenIds.has(item.itemId)) fail(`duplicate itemId ${item.itemId}`)
	seenIds.add(item.itemId)

	const expected = (item.imagePath.split("/").pop() ?? "").replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")
	if (item.itemId !== expected) fail(`${item.itemId}: itemId is not the slug of its basename (expected ${expected})`)
	if (item.collection !== "demo-20") fail(`${item.itemId}: collection is ${item.collection}, expected demo-20`)
	if (!Array.isArray(item.sides) || item.sides.length !== 2) fail(`${item.itemId}: expected exactly 2 sides`)
	if (item.sides?.[0]?.variantId === item.sides?.[1]?.variantId) fail(`${item.itemId}: both sides carry the same variantId`)

	for (const side of item.sides ?? []) {
		const fingerprint = side.fingerprint
		if (typeof fingerprint !== "object" || fingerprint === null) {
			fail(`${item.itemId}: a side has no fingerprint`)
			continue
		}
		if (!/^[0-9a-f]{40}$/.test(fingerprint.gitCommit)) fail(`${item.itemId}: fingerprint.gitCommit is not a full sha1`)
		if (typeof fingerprint.dirty !== "boolean") fail(`${item.itemId}: fingerprint.dirty must be a boolean`)
	}
}

/** Side order alternates by item index — so neither position belongs to either accent order. */
items.forEach((item, index) => {
	const leading = item.sides?.[0]?.variantId
	const expected = index % 2 === 0 ? "p2-tree-round3b-v1" : "p2-tree-round3b-v2"
	if (leading !== expected) fail(`${item.itemId}: side order does not alternate by item index parity (leading ${leading})`)
})

// --- 2. hexes, gradient endpoints, collapse flags, D7 margins ----------------------------------

const HEX = /^#[0-9a-f]{6}$/
function checkHex(label: string, value: unknown): boolean {
	if (typeof value !== "string" || !HEX.test(value)) {
		fail(`${label}: ${JSON.stringify(value)} is not a lowercase #rrggbb hex`)
		return false
	}
	return true
}

for (const item of items) {
	item.sides?.forEach((side, sideIndex) => {
		const where = `${item.itemId}[${sideIndex === 0 ? "A" : "B"}]`
		const palette = side.palette
		for (const role of ROLES) checkHex(`${where}.${role}`, palette[role])

		if (palette.gradient !== null) {
			const stops = palette.gradient.stops
			if (!Array.isArray(stops) || stops.length < 2) {
				fail(`${where}.gradient: fewer than 2 stops`)
			} else {
				stops.forEach((stop, index) => {
					checkHex(`${where}.gradient.stops[${index}].color`, stop.color)
					if (typeof stop.position !== "number" || stop.position < 0 || stop.position > 1) {
						fail(`${where}.gradient.stops[${index}].position ${stop.position} is outside [0, 1]`)
					}
					if (index > 0 && stop.position <= stops[index - 1]!.position) {
						fail(`${where}.gradient.stops[${index}]: positions are not strictly increasing`)
					}
				})
				if (stops[0]!.color !== palette.background) fail(`${where}.gradient: stops[0] is not the background`)
				if (stops[stops.length - 1]!.color !== palette.surface) fail(`${where}.gradient: the last stop is not the surface`)
			}
			if (palette.surfaceCollapsed) fail(`${where}: surfaceCollapsed is set but a gradient is published`)
		}

		if (palette.surfaceCollapsed !== (palette.surface === palette.background)) fail(`${where}: surfaceCollapsed disagrees with the hexes`)
		if (palette.accentCollapsed !== (palette.accent === palette.foreground)) fail(`${where}: accentCollapsed disagrees with the hexes`)

		for (let first = 0; first < ROLES.length; first += 1) {
			for (let second = first + 1; second < ROLES.length; second += 1) {
				const a = palette[ROLES[first]]
				const b = palette[ROLES[second]]
				if (a === b) continue
				const distance = colorDistance(colorFromHex(a), colorFromHex(b))
				if (distance < MARGIN_FLOOR) {
					fail(`${where}: ${ROLES[first]} ${a} and ${ROLES[second]} ${b} are ${distance.toFixed(5)} apart, under D7's ${MARGIN_FLOOR} margin floor`)
				}
			}
		}

		// The counterfactual must be a palette the contract would accept, or the item prices nothing.
		const separation = colorDistance(colorFromHex(palette.foreground), colorFromHex(palette.accent))
		if (!palette.accentCollapsed && separation < FOREGROUND_ACCENT_SEPARATION_DISTANCE) {
			fail(`${where}: foreground ${palette.foreground} and accent ${palette.accent} are ${separation.toFixed(5)} apart, under the contract's ${FOREGROUND_ACCENT_SEPARATION_DISTANCE} separation`)
		}
	})

	// --- 3. exactly one role differs between the sides -------------------------------------------
	if (item.sides?.length === 2) {
		const [a, b] = item.sides
		for (const role of ["background", "surface", "foreground"] as const) {
			if (a.palette[role] !== b.palette[role]) fail(`${item.itemId}: the sides differ in ${role} (${a.palette[role]} vs ${b.palette[role]}) — the item prices more than the accent`)
		}
		if (JSON.stringify(a.palette.gradient) !== JSON.stringify(b.palette.gradient)) fail(`${item.itemId}: the sides differ in the gradient`)
		if (a.palette.surfaceCollapsed !== b.palette.surfaceCollapsed) fail(`${item.itemId}: the sides differ in surfaceCollapsed`)
		if (a.palette.accent === b.palette.accent) fail(`${item.itemId}: the two sides publish the same accent — nothing to prefer`)
	}
}

// --- 4. blinding --------------------------------------------------------------------------------

const FORBIDDEN: [RegExp, string][] = [
	[/\bp2-alpha\b/i, "the alpha candidate id"],
	[/\bp2-tos\b/i, "the tos candidate id"],
	[/\balpha\b/i, "the alpha pipeline name"],
	[/\btos\b/i, "the tos pipeline name"],
	[/tree[- ]of[- ]shapes/i, "the tree-of-shapes family name"],
	[/\bmerged\b/i, "the integration pass's own label"],
	[/\bchroma\b/i, "the accent ordering key under test"],
	[/\bapca\b/i, "the competing accent ordering key"],
	[/salien|stability|growth|mser/i, "D3's salience machinery"],
	[/\blaminar\b|\bpartitioned\b|\bunreadable\b|\btextured\b/i, "the field verdict"],
	[/"verdict"|"coverage"|"class"|"question"/i, "the round's own machinery"],
]
for (const [pattern, why] of FORBIDDEN) {
	const hit = raw.match(pattern)
	if (hit) fail(`blinding leak: items.json contains ${JSON.stringify(hit[0])} — ${why}`)
}

// --- 5. images on disk, and every published colour an exact triple -------------------------------

async function exactColorsOf(imagePathRelative: string): Promise<Set<number>> {
	const { data, info } = await sharp(join(ROOT, imagePathRelative)).toColourspace("srgb").raw().toBuffer({ resolveWithObject: true })
	const colors = new Set<number>()
	for (let offset = 0; offset < data.length; offset += info.channels) {
		colors.add((data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2])
	}
	return colors
}
const packOf = (value: string): number => Number.parseInt(value.slice(1), 16)

for (const item of items) {
	if (typeof item.imagePath !== "string" || item.imagePath.startsWith("/")) {
		fail(`${item.itemId}: imagePath must be repo-relative, got ${item.imagePath}`)
		continue
	}
	if (!existsSync(join(ROOT, item.imagePath))) {
		fail(`${item.itemId}: image not on disk at ${item.imagePath}`)
		continue
	}
	const colors = await exactColorsOf(item.imagePath)
	for (const side of item.sides ?? []) {
		const published = new Map<string, string>()
		for (const role of ROLES) published.set(side.palette[role], role)
		if (side.palette.gradient !== null) {
			side.palette.gradient.stops.forEach((stop, index) => {
				if (!published.has(stop.color)) published.set(stop.color, `gradient.stops[${index}]`)
			})
		}
		for (const [value, role] of published) {
			if (!HEX.test(value)) continue
			if (!colors.has(packOf(value))) fail(`${item.itemId}[${side.variantId}]: ${role} ${value} is not an exact triple of ${item.imagePath}`)
		}
	}
}

// --- 6. the private side-car agrees with the artifact -------------------------------------------

for (const item of items) {
	const record = mapping._items[item.itemId]
	if (!record) {
		fail(`${item.itemId}: no entry in mapping.private.json`)
		continue
	}
	if (record.imagePath !== item.imagePath) fail(`${item.itemId}: mapping records a different imagePath`)
	const accents = new Set((item.sides ?? []).map((side) => side.palette.accent))
	if (!accents.has(record.v1Accent.hex) || !accents.has(record.v2Accent.hex)) {
		fail(`${item.itemId}: mapping's accents ${record.v1Accent.hex}/${record.v2Accent.hex} are not the two published accents`)
	}
}

// --- 7. deterministic rebuild --------------------------------------------------------------------

const ARTIFACTS = ["items.json", "mapping.private.json"] as const
const before = ARTIFACTS.map((name) => readFileSync(join(HERE, name), "utf8"))
for (let attempt = 0; attempt < 2; attempt += 1) {
	execFileSync("node", ["--experimental-strip-types", join(HERE, "build.ts")], { encoding: "utf8" })
	ARTIFACTS.forEach((name, index) => {
		if (readFileSync(join(HERE, name), "utf8") !== before[index]) {
			fail(`${name}: rebuild ${attempt + 1} does not reproduce the committed file byte-for-byte (HEAD moving under the worktree is the usual cause — rebuild before shipping)`)
		}
	})
}
ARTIFACTS.forEach((name, index) => writeFileSync(join(HERE, name), before[index]))

// -------------------------------------------------------------------------------------------------

if (problems.length > 0) {
	for (const problem of problems) console.error(`FAIL  ${problem}`)
	console.error(`\n${problems.length} problem(s) — the fixture is not shippable.`)
	process.exit(1)
}

console.log(
	`OK  ${items.length} item(s), ${items.length * 2} sides, one role apart each, every colour an exact triple, ` +
		`every distinct role pair ≥ ${MARGIN_FLOOR} OKLab, blinding clean, rebuild reproduces byte-for-byte.`,
)
