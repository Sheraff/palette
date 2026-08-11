/**
 * Gate on the round-4 floor-demonstration fixture. `node --experimental-strip-types validate.ts` —
 * exit 0 or nothing ships.
 *
 * It re-reads `items.json` from disk rather than trusting anything `build.ts` held in memory, because
 * the file is the artifact: the orchestrator installs THAT, and a check that runs inside the builder
 * only proves the builder agreed with itself. For the same reason nothing is imported from
 * `build.ts`: an import would EXECUTE the builder before this file could read the committed bytes,
 * so the constants below are deliberately a second, independent statement of what the round is. If
 * the two ever disagree, one of these checks fails — which is the point of writing them twice.
 *
 * ## What this round needs checked that earlier rounds did not
 *
 * One side of this comparison is **deliberately non-compliant**: it carries a foreground the contract
 * refuses, and it is staged that way on the reviewer's instruction (`ROUND.md`). So the checks split
 * in two:
 *
 *  - everything that is still non-negotiable is checked as usual, and harder: every colour on BOTH
 *    sides is decoded out of the artwork by this file's own `sharp` call, the two sides are proved to
 *    differ in the foreground and NOWHERE else, and the published side is proved byte-identical to
 *    the palette the reviewer already graded;
 *  - the violation itself is checked to be exactly the one declared — under the epsilon on both field
 *    roles, by the contract's own APCA path, on the substituted side only. A demonstration that
 *    silently drifted into some other violation would be a different round.
 *
 * ## Blinding, in two tiers
 *
 * The strict tier is the SERVED surface: the item id, the media URL built from it, the artwork's file
 * name and the palette hexes — the only strings this round puts in front of the reviewer. Those must
 * carry no candidate, pipeline, prototype or round token, and none of this round's own vocabulary:
 * the words "waiver", "floor", "I4", "epsilon", "APCA", "halo", "antialias" would each hand the
 * reviewer the answer to the question being asked. The reviewer must judge blind — two foregrounds,
 * no story.
 *
 * The second tier is the whole fixture's raw bytes, scanned the way rounds 1 and 3 scanned theirs. A
 * leak does not have to be in a field anyone anticipated.
 */

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { EPSILON_TEXT_RAW } from "../../../../src/contract/constants.ts"
import { apcaRawBetween, colorFromHex } from "../../../../src/contract/color.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "..", "..", "..", "..", "..", "..")

const problems: string[] = []
const fail = (message: string) => problems.push(message)

/** The round, restated independently of `build.ts`. See the header. */
const ITEM_COUNT = 1
const ITEM_ID = "ab67616d0000b27300008912d4517960ad020c7a"
const SUBSTITUTED_FOREGROUND = "#1e2221"
const PUBLISHED_FOREGROUND = "#fcffff"

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
type Side = {
	variantId: string
	palette: Palette
	fingerprint: { algorithmVersion: string; preprocessingVersion: string; gitCommit: string; dirty: boolean }
}
type Item = { itemId: string; imagePath: string; collection: string; sides: Side[] }

const items = JSON.parse(raw) as Item[]
const ROLES = ["background", "surface", "foreground", "accent"] as const

// --- 1. shape -----------------------------------------------------------------------------------

if (!Array.isArray(items)) fail("items.json is not an array")
if (items.length !== ITEM_COUNT) fail(`expected ${ITEM_COUNT} item, found ${items.length}`)

const seenIds = new Set<string>()
for (const item of items) {
	if (seenIds.has(item.itemId)) fail(`duplicate itemId ${item.itemId}`)
	seenIds.add(item.itemId)

	const expected = (item.imagePath.split("/").pop() ?? "")
		.replace(/\.[^.]+$/, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
	if (item.itemId !== expected) fail(`${item.itemId}: itemId is not the slug of its basename (expected ${expected})`)
	if (item.itemId !== ITEM_ID) fail(`${item.itemId}: this round is built on ${ITEM_ID} and no other cover`)
	if (item.collection !== "coverage-set-1") fail(`${item.itemId}: collection is ${item.collection}, expected coverage-set-1`)

	// Pairwise: two sides, or there is no comparison. A `variantId` here that is not a palette's own
	// is what the server refuses at push (`batch.ts`: "item.sides compares a variant with itself").
	if (!Array.isArray(item.sides) || item.sides.length !== 2) {
		fail(`${item.itemId}: expected exactly 2 sides`)
		continue
	}
	if (item.sides[0]!.variantId === item.sides[1]!.variantId) fail(`${item.itemId}: both sides carry the same variantId`)

	for (const [index, side] of item.sides.entries()) {
		const where = `${item.itemId}[${index === 0 ? "A" : "B"}]`
		if (typeof side.variantId !== "string" || side.variantId.length === 0) fail(`${where}: missing variantId`)
		const fingerprint = side.fingerprint
		if (typeof fingerprint !== "object" || fingerprint === null) {
			fail(`${where}: missing fingerprint`)
			continue
		}
		if (!/^[0-9a-f]{40}$/.test(fingerprint.gitCommit)) fail(`${where}: fingerprint.gitCommit is not a full sha1`)
		if (typeof fingerprint.dirty !== "boolean") fail(`${where}: fingerprint.dirty must be a boolean`)
		if (typeof fingerprint.preprocessingVersion !== "string" || fingerprint.preprocessingVersion.length === 0) {
			fail(`${where}: fingerprint.preprocessingVersion is empty`)
		}
		if (typeof fingerprint.algorithmVersion !== "string" || fingerprint.algorithmVersion.length === 0) {
			fail(`${where}: fingerprint.algorithmVersion is empty`)
		}
	}
	// Both sides are readings of the same bytes, so the same decode must be claimed for both.
	if (item.sides.length === 2 && item.sides[0]!.fingerprint?.preprocessingVersion !== item.sides[1]!.fingerprint?.preprocessingVersion) {
		fail(`${item.itemId}: the two sides claim different preprocessing versions`)
	}
}

// --- 2. every colour is an exact lowercase #rrggbb, on BOTH sides -------------------------------

const HEX = /^#[0-9a-f]{6}$/

function checkHex(label: string, value: unknown): boolean {
	if (typeof value !== "string" || !HEX.test(value)) {
		fail(`${label}: ${JSON.stringify(value)} is not a lowercase #rrggbb hex`)
		return false
	}
	return true
}

for (const item of items) {
	for (const [index, side] of (item.sides ?? []).entries()) {
		const where = `${item.itemId}[${index === 0 ? "A" : "B"}]`
		const palette = side.palette
		for (const role of ROLES) checkHex(`${where}.${role}`, palette[role])

		// --- 3. endpoint identity, if a gradient is present ---------------------------------------
		// This round publishes none, and the check is kept rather than dropped: a fixture edit that
		// added one must not be able to slip past the same rule every other round is held to.
		if (palette.gradient !== null && palette.gradient !== undefined) {
			const stops = palette.gradient.stops
			if (!Array.isArray(stops) || stops.length < 2) {
				fail(`${where}.gradient: fewer than 2 stops`)
			} else {
				stops.forEach((stop, stopIndex) => {
					checkHex(`${where}.gradient.stops[${stopIndex}].color`, stop.color)
					if (typeof stop.position !== "number" || stop.position < 0 || stop.position > 1) {
						fail(`${where}.gradient.stops[${stopIndex}].position ${stop.position} is outside [0, 1]`)
					}
					if (stopIndex > 0 && stop.position <= stops[stopIndex - 1]!.position) {
						fail(`${where}.gradient.stops[${stopIndex}]: positions are not strictly increasing`)
					}
				})
				const first = stops[0]!
				const last = stops[stops.length - 1]!
				if (first.color !== palette.background) fail(`${where}.gradient: stops[0] ${first.color} is not the background ${palette.background}`)
				if (last.color !== palette.surface) fail(`${where}.gradient: last stop ${last.color} is not the surface ${palette.surface}`)
			}
			if (palette.surfaceCollapsed) fail(`${where}: surfaceCollapsed is set but a gradient is published`)
		}

		// --- 4. collapse flags say exactly what the hexes say --------------------------------------
		if (palette.surfaceCollapsed !== (palette.surface === palette.background)) {
			fail(`${where}: surfaceCollapsed=${palette.surfaceCollapsed} but surface ${palette.surface} vs background ${palette.background}`)
		}
		if (palette.accentCollapsed !== (palette.accent === palette.foreground)) {
			fail(`${where}: accentCollapsed=${palette.accentCollapsed} but accent ${palette.accent} vs foreground ${palette.foreground}`)
		}
	}
}

// --- 5. the comparison is exactly one role wide -------------------------------------------------

/**
 * The round's whole claim is "everything else identical". If any other role moved, the reviewer's
 * preference would be about something nobody declared, and the answer would not read on the question.
 */
for (const item of items) {
	if ((item.sides ?? []).length !== 2) continue
	const [first, second] = item.sides as [Side, Side]
	for (const role of ROLES) {
		if (role === "foreground") continue
		if (first.palette[role] !== second.palette[role]) {
			fail(`${item.itemId}: ${role} differs between the sides (${first.palette[role]} vs ${second.palette[role]}) — the comparison is not one role wide`)
		}
	}
	if (JSON.stringify(first.palette.gradient) !== JSON.stringify(second.palette.gradient)) {
		fail(`${item.itemId}: the gradient differs between the sides`)
	}
	if (first.palette.surfaceCollapsed !== second.palette.surfaceCollapsed || first.palette.accentCollapsed !== second.palette.accentCollapsed) {
		fail(`${item.itemId}: the collapse flags differ between the sides`)
	}
	if (first.palette.foreground === second.palette.foreground) {
		fail(`${item.itemId}: both sides publish the same foreground — there is nothing to compare`)
	}
	const foregrounds = new Set([first.palette.foreground, second.palette.foreground])
	if (!foregrounds.has(SUBSTITUTED_FOREGROUND) || !foregrounds.has(PUBLISHED_FOREGROUND)) {
		fail(`${item.itemId}: the two foregrounds are ${[...foregrounds].join(" / ")}, expected ${SUBSTITUTED_FOREGROUND} and ${PUBLISHED_FOREGROUND}`)
	}
}

// --- 6. the two sides are the palettes they claim to be -----------------------------------------

/**
 * Cross-file identity. The graded side must be the graded bytes — not a re-run that happens to look
 * like them — and the substituted colour must be the one the diagnosis says was refused, not a hex
 * someone typed. Both source files are read here; neither is servable.
 */
type PriorItem = { itemId: string; palette: Palette; fingerprint: { preprocessingVersion: string } }
const priorItems = JSON.parse(readFileSync(join(HERE, "..", "round-3-quality", "items.json"), "utf8")) as PriorItem[]
const prior = priorItems.find((entry) => entry.itemId === ITEM_ID)
if (prior === undefined) {
	fail(`round-3-quality/items.json has no item ${ITEM_ID}`)
} else {
	for (const item of items) {
		const published = (item.sides ?? []).find((side) => side.palette.foreground === PUBLISHED_FOREGROUND)
		if (published === undefined) {
			fail(`${item.itemId}: no side carries the graded foreground ${PUBLISHED_FOREGROUND}`)
			continue
		}
		if (JSON.stringify(published.palette) !== JSON.stringify(prior.palette)) {
			fail(`${item.itemId}: the graded side is not byte-identical to round-3-quality's palette for this cover`)
		}
		const substituted = (item.sides ?? []).find((side) => side.palette.foreground === SUBSTITUTED_FOREGROUND)
		if (substituted === undefined) {
			fail(`${item.itemId}: no side carries the substituted foreground ${SUBSTITUTED_FOREGROUND}`)
			continue
		}
		if (JSON.stringify({ ...substituted.palette, foreground: PUBLISHED_FOREGROUND }) !== JSON.stringify(prior.palette)) {
			fail(`${item.itemId}: the substituted side is not the graded palette with one role replaced`)
		}
		if (published.fingerprint.preprocessingVersion !== prior.fingerprint.preprocessingVersion) {
			fail(`${item.itemId}: preprocessingVersion drifted from the graded fixture`)
		}
	}
}

type DiagnosisItem = {
	itemId: string
	publishedForeground: string
	walk: { foregroundSteps: { rank: number; hex: string; refusal: string | null; accepted: boolean }[] }
	election: { pool: { rank: number; hex: string; provenance: string }[] }
}
const diagnosis = JSON.parse(readFileSync(join(HERE, "..", "..", "tos", "identity", "q1", "report.json"), "utf8")) as {
	items: DiagnosisItem[]
}
const diagnosed = diagnosis.items.find((entry) => entry.itemId === ITEM_ID)
if (diagnosed === undefined) {
	fail(`tos/identity/q1/report.json has no item ${ITEM_ID}`)
} else {
	const step = diagnosed.walk.foregroundSteps[0]
	if (step === undefined || step.hex !== SUBSTITUTED_FOREGROUND || step.accepted !== false || step.refusal !== "contract-violation") {
		fail(`the diagnosis no longer says ${SUBSTITUTED_FOREGROUND} was elected at rank 0 and refused as a contract violation`)
	}
	if (diagnosed.election.pool[0]?.provenance !== "text-group") {
		fail("the diagnosis no longer says the refused colour came from the detector's own election")
	}
	if (diagnosed.publishedForeground !== PUBLISHED_FOREGROUND) {
		fail(`the diagnosis reproduces a published foreground of ${diagnosed.publishedForeground}, not ${PUBLISHED_FOREGROUND}`)
	}
}

// --- 7. the declared violation is the violation, by the contract's own APCA path -----------------

/**
 * Recomputed from the shipped bytes: the substituted foreground must be under the epsilon against
 * BOTH field roles, and the graded foreground must be over it against both. A demonstration that
 * drifted into some other violation — or into none — is a different round and must not ship as this
 * one. The numbers this reproduces are the ones `ROUND.md` quotes.
 */
for (const item of items) {
	for (const side of item.sides ?? []) {
		const palette = side.palette
		if (!HEX.test(palette.foreground)) continue
		const expectedUnder = palette.foreground === SUBSTITUTED_FOREGROUND
		for (const fieldRole of ["background", "surface"] as const) {
			const magnitude = Math.abs(apcaRawBetween(colorFromHex(palette.foreground), colorFromHex(palette[fieldRole])))
			const under = magnitude < EPSILON_TEXT_RAW
			if (under !== expectedUnder) {
				fail(
					`${item.itemId}: foreground ${palette.foreground} on ${fieldRole} ${palette[fieldRole]} has |raw APCA| ` +
						`${magnitude.toFixed(4)} — ${under ? "under" : "over"} the ${EPSILON_TEXT_RAW} epsilon, which is not what this side is declared to be`,
				)
			}
		}
	}
}

// --- 8. blinding, tier 1: the SERVED surface ----------------------------------------------------

/**
 * What the reviewer's browser is given for a pairwise item: the item id, the media URL built from it,
 * the artwork's file name, and the palette hexes. `variantId` and `fingerprint` never leave the
 * server (`round-kit.ts` `KNOWN_LEAK_FIELDS`), so they are not in this tier — they are in tier 2.
 */
const SERVED_FORBIDDEN: [RegExp, string][] = [
	[/\bp2[-_]?(alpha|tos|tree)?\b/i, "a prototype or candidate token"],
	[/\balpha\b/i, "the alpha pipeline name"],
	[/\btos\b/i, "the tos pipeline name"],
	[/tree[- ]of[- ]shapes/i, "the tree-of-shapes family name"],
	[/quasi[- ]?flat|flat[- ]?zone/i, "the quasi-flat-zone family name"],
	[/\bround[-_ ]?\d/i, "a round token"],
	[/floor[- ]?demo/i, "this round's own name"],
	[/\bcycle[-_ ]?\d/i, "a development-cycle token"],
	[/\bcal-\d|\bphase\d?-/i, "a batch id"],
	[/\bwaiv(er|ed|e)\b/i, "the waiver — the reviewer must not be told one side was let through"],
	[/\bfloors?\b/i, "the floor — naming it answers the question being asked"],
	[/\bi4\b|invariant/i, "the invariant that refused one of these colours"],
	[/\bepsilon\b|\bapca\b|\bcontrast\b|\blegib|\breadab/i, "the contrast vocabulary"],
	[/\bhalo\b|antialias|\bink\b|\bglyph\b|\bdetector\b|text[- ]?group/i, "the mechanism behind one of the two colours"],
	[/published|substitut|refus|elect/i, "which side is which"],
]

for (const item of items) {
	const servedStrings: [string, string][] = [
		["itemId", item.itemId],
		["media", `/media/<batch>/${encodeURIComponent(item.itemId)}`],
		["artwork.fileName", item.imagePath.split("/").pop() ?? item.imagePath],
	]
	for (const [index, side] of (item.sides ?? []).entries()) {
		for (const role of ROLES) servedStrings.push([`sides[${index}].${role}`, side.palette[role]])
		for (const [stopIndex, stop] of (side.palette.gradient?.stops ?? []).entries()) {
			servedStrings.push([`sides[${index}].gradient.stops[${stopIndex}]`, stop.color])
		}
	}
	for (const [where, value] of servedStrings) {
		for (const [pattern, why] of SERVED_FORBIDDEN) {
			const hit = value.match(pattern)
			if (hit) fail(`served-surface leak: ${where} = ${JSON.stringify(value)} contains ${JSON.stringify(hit[0])} — ${why}`)
		}
	}
	// The served id must be the cover's own slug and nothing else: 40 lowercase hex, no round or
	// prototype token riding along in it.
	if (!/^[0-9a-f]{40}$/.test(item.itemId)) fail(`served-surface leak: itemId ${item.itemId} is not a bare cover slug`)
}

// --- 9. blinding, tier 2: the whole fixture's raw bytes -----------------------------------------

const FORBIDDEN: [RegExp, string][] = [
	[/\bp2-alpha\b/i, "the alpha candidate id"],
	[/\bp2-tos\b/i, "the tos candidate id"],
	[/\bp2-tree\b/i, "the prototype id"],
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
	[/\bwaiv(er|ed|e)\b/i, "the waiver — it belongs to ROUND.md and mapping.private.json only"],
	[/\bfloors?\b/i, "the floor — it belongs to ROUND.md and mapping.private.json only"],
	[/\bi4\b/i, "the invariant id — it belongs to ROUND.md and mapping.private.json only"],
	[/\bepsilon\b/i, "the epsilon — it belongs to ROUND.md and mapping.private.json only"],
	[/\bapca\b/i, "the contrast ruler"],
	[/\bhalo\b|antialias/i, "the mechanism behind the graded foreground"],
]
for (const [pattern, why] of FORBIDDEN) {
	const hit = raw.match(pattern)
	if (hit) fail(`blinding leak: items.json contains ${JSON.stringify(hit[0])} — ${why}`)
}

/** `mapping.private.json` is the decode key and must never be mistaken for a servable file. */
const mappingRaw = readFileSync(join(HERE, "mapping.private.json"), "utf8")
if (!mappingRaw.includes("NOT SERVABLE")) fail("mapping.private.json does not declare itself unservable")
for (const marker of ["true-ink-floor-waived", "published-halo"]) {
	if (!mappingRaw.includes(marker)) fail(`mapping.private.json does not decode the sides: missing ${marker}`)
}

// --- 10. the image is on disk and repo-relative -------------------------------------------------

function setFile(path: string): Set<string> {
	return new Set(
		readFileSync(join(ROOT, path), "utf8")
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line !== "" && !line.startsWith("#")),
	)
}
/** D3's round-composition clause still holds: this cover was never tuned on, only graded once. */
const tunedOn = new Set([
	...setFile("research/v3/data/devloop/sets/demo-20.txt"),
	...setFile("research/v3/prototypes/p2-tree/falsifier/out/endorsed-173.txt"),
])

for (const item of items) {
	if (typeof item.imagePath !== "string" || item.imagePath.startsWith("/")) {
		fail(`${item.itemId}: imagePath must be repo-relative, got ${item.imagePath}`)
		continue
	}
	if (!existsSync(join(ROOT, item.imagePath))) fail(`${item.itemId}: image not on disk at ${item.imagePath}`)
	if (tunedOn.has(item.imagePath)) fail(`${item.itemId}: ${item.imagePath} is a cover the candidate was tuned on`)
}

// --- 11. every published colour, on BOTH sides, is an exact triple of the artwork ----------------

/**
 * The candidate's decode contract, re-implemented rather than imported: sRGB, raw, no resample.
 * Importing the pipeline's `decodeImage` would make this check assert that the pipeline agrees with
 * itself. What is wanted is that the shipped hexes are in the FILE — and on this round it carries
 * extra weight, because one of the two foregrounds is not a pipeline output at all: the substituted
 * colour is exactly the kind of hex that could have been typed, and this is where that is ruled out.
 */
async function exactColorsOf(imagePathRelative: string): Promise<Set<number>> {
	const { data, info } = await sharp(join(ROOT, imagePathRelative)).toColourspace("srgb").raw().toBuffer({ resolveWithObject: true })
	const channels = info.channels
	const colors = new Set<number>()
	for (let offset = 0; offset < data.length; offset += channels) {
		colors.add((data[offset]! << 16) | (data[offset + 1]! << 8) | data[offset + 2]!)
	}
	return colors
}

const packOf = (value: string): number => Number.parseInt(value.slice(1), 16)

for (const item of items) {
	if (!existsSync(join(ROOT, item.imagePath))) continue
	const colors = await exactColorsOf(item.imagePath)
	for (const [index, side] of (item.sides ?? []).entries()) {
		const where = `${item.itemId}[${index === 0 ? "A" : "B"}]`
		const published = new Map<string, string>()
		for (const role of ROLES) published.set(side.palette[role], role)
		for (const [stopIndex, stop] of (side.palette.gradient?.stops ?? []).entries()) {
			if (!published.has(stop.color)) published.set(stop.color, `gradient.stops[${stopIndex}]`)
		}
		for (const [value, role] of published) {
			if (!HEX.test(value)) continue
			if (!colors.has(packOf(value))) fail(`${where}: ${role} ${value} is not an exact triple of ${item.imagePath}`)
		}
	}
}

// --- 12. deterministic rebuild ------------------------------------------------------------------

/**
 * `build.ts` writes in place, so the committed bytes are snapshotted first and restored if a rebuild
 * disagrees — a validator must not leave the artifact in a state its own failure message describes.
 *
 * `gitCommit` is read from HEAD, and HEAD moves under this worktree while a round is staged. A
 * rebuild that differs only in the fingerprint means the fixture was built at an older commit and
 * must be rebuilt before it ships: a real failure, not a tolerance to widen.
 */
const ARTIFACTS = ["items.json", "mapping.private.json"] as const
const before = ARTIFACTS.map((name) => readFileSync(join(HERE, name), "utf8"))
for (let attempt = 0; attempt < 2; attempt += 1) {
	execFileSync("node", ["--experimental-strip-types", join(HERE, "build.ts")], { encoding: "utf8" })
	ARTIFACTS.forEach((name, index) => {
		const after = readFileSync(join(HERE, name), "utf8")
		if (after !== before[index]) {
			fail(`${name}: rebuild ${attempt + 1} does not reproduce the committed file byte-for-byte${differingPaths(before[index]!, after)}`)
		}
	})
}
ARTIFACTS.forEach((name, index) => writeFileSync(join(HERE, name), before[index]!))

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

const magnitudes = (["background", "surface"] as const).map((role) =>
	Math.abs(apcaRawBetween(colorFromHex(SUBSTITUTED_FOREGROUND), colorFromHex(items[0]!.sides[0]!.palette[role]))).toFixed(4),
)
console.log(
	`OK  ${items.length} item, 2 sides, one role wide (${SUBSTITUTED_FOREGROUND} vs ${PUBLISHED_FOREGROUND}), ` +
		`every colour on both sides an exact triple, the declared violation reproduced ` +
		`(|raw| ${magnitudes.join(" / ")} against the two field roles, epsilon ${EPSILON_TEXT_RAW}), ` +
		`served surface and fixture bytes blinding-clean, rebuild reproduces byte-for-byte.`,
)
