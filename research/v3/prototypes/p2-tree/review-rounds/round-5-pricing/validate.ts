/**
 * Gate on the round-5 fixture. `node --experimental-strip-types validate.ts` — exit 0 or nothing ships.
 *
 * It re-reads `items.json` from disk rather than trusting anything `build.ts` held in memory, because
 * the file is the artifact: the orchestrator installs THAT. Nothing is imported from `build.ts` — an
 * import would execute the builder before this file could read the committed bytes — so the round is
 * restated below, independently, hex by hex. If the two statements ever disagree, one of these checks
 * fails, which is the point of writing them twice.
 *
 * ## What this round needs checked that earlier rounds did not
 *
 *  - **The pin.** Every side of every item was built inside a `git archive` export of one commit while
 *    a sibling worker was free to edit `tos/`. So the fingerprints, the probe files and `pin.sh`'s own
 *    `PIN_COMMIT` are cross-checked against each other, and a fixture whose sides came from two builds
 *    cannot ship.
 *  - **Five items, five different roles-under-test.** Round 3 could assert "the accent and nothing
 *    else" globally. Here three items move the accent and two move the foreground, so the one-role-wide
 *    proof is per item and names the role it expects.
 *  - **The outcome table is checked mechanically**, not read. Every row of `ROUND.md`'s table is
 *    restated here as a predicate over the answer space the review page can actually record, and every
 *    combination of that space is enumerated: exactly one row must fire in each block, or the table is
 *    ambiguous the way rounds 2 and 3's were (D9, D13.5).
 */

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { colorDistance, colorFromHex, sameColorBar } from "../../../../src/contract/color.ts"
import { FOREGROUND_ACCENT_SEPARATION_DISTANCE } from "../../../../src/contract/constants.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "..", "..", "..", "..", "..", "..")

const problems: string[] = []
const fail = (message: string) => problems.push(message)

/** D7's margin floor. Same value and same reasoning as rounds 3a/3b document. */
const MARGIN_FLOOR = 0.02

/** The round, restated independently of `build.ts`. See the header. */
const PIN_COMMIT = "734c3f564f16ce9cf829fb420ddbf220fa1103cf"
const DECLARED = [
	{ itemId: "ab67616d00001e0200000f92552b0935b967964d", role: "accent", published: "#d25068", variant: "#ee5567" },
	{ itemId: "ab67616d00001e02000001335fe604d859a69094", role: "foreground", published: "#070506", variant: "#050304" },
	{ itemId: "ab67616d00001e0200001a9be12b7116a8247378", role: "accent", published: "#c18d20", variant: "#362545" },
	{ itemId: "ab67616d00001e02000022e7e9d11c908479200b", role: "accent", published: "#fea851", variant: "#242e09" },
	{ itemId: "ab67616d00001e0200001073a73e3a949021f65e", role: "foreground", published: "#f8dab8", variant: "#16151a" },
] as const

const raw = readFileSync(join(HERE, "items.json"), "utf8")

type PaletteShape = {
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
	palette: PaletteShape
	fingerprint: { algorithmVersion: string; preprocessingVersion: string; gitCommit: string; dirty: boolean }
}
type Item = { itemId: string; imagePath: string; collection: string; sides: Side[] }

const items = JSON.parse(raw) as Item[]
const ROLES = ["background", "surface", "foreground", "accent"] as const

// --- 1. shape -----------------------------------------------------------------------------------

if (!Array.isArray(items)) fail("items.json is not an array")
if (items.length !== DECLARED.length) fail(`expected ${DECLARED.length} items, found ${items.length}`)

items.forEach((item, index) => {
	const declared = DECLARED[index]
	if (declared === undefined) return
	if (item.itemId !== declared.itemId) fail(`item ${index}: itemId ${item.itemId}, expected ${declared.itemId}`)

	const expectedId = (item.imagePath.split("/").pop() ?? "")
		.replace(/\.[^.]+$/, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
	if (item.itemId !== expectedId) fail(`${item.itemId}: itemId is not the slug of its basename (expected ${expectedId})`)
	if (item.collection !== "demo-20") fail(`${item.itemId}: collection is ${item.collection}, expected demo-20`)

	if (!Array.isArray(item.sides) || item.sides.length !== 2) {
		fail(`${item.itemId}: expected exactly 2 sides`)
		return
	}
	if (item.sides[0]!.variantId === item.sides[1]!.variantId) fail(`${item.itemId}: both sides carry the same variantId`)
	for (const [position, side] of item.sides.entries()) {
		const where = `${item.itemId}[${position === 0 ? "A" : "B"}]`
		if (side.variantId !== `variant-0${position + 1}`) fail(`${where}: variantId ${side.variantId} does not follow the fixture position`)
		const fingerprint = side.fingerprint
		if (typeof fingerprint !== "object" || fingerprint === null) {
			fail(`${where}: missing fingerprint`)
			continue
		}
		if (fingerprint.gitCommit !== PIN_COMMIT) fail(`${where}: fingerprint.gitCommit ${fingerprint.gitCommit} is not the pinned commit`)
		if (typeof fingerprint.dirty !== "boolean") fail(`${where}: fingerprint.dirty must be a boolean`)
		if (fingerprint.algorithmVersion !== `blinded-0${position + 1}`) fail(`${where}: algorithmVersion ${fingerprint.algorithmVersion} is not the blinded label for this position`)
		if (typeof fingerprint.preprocessingVersion !== "string" || fingerprint.preprocessingVersion.length === 0) fail(`${where}: preprocessingVersion is empty`)
	}
	if (item.sides[0]!.fingerprint?.preprocessingVersion !== item.sides[1]!.fingerprint?.preprocessingVersion) {
		fail(`${item.itemId}: the two sides claim different preprocessing versions`)
	}
})

// --- 2. hexes, gradient endpoints, collapse flags, D7 margins, the contract's own separation -----

const HEX = /^#[0-9a-f]{6}$/
function checkHex(label: string, value: unknown): boolean {
	if (typeof value !== "string" || !HEX.test(value)) {
		fail(`${label}: ${JSON.stringify(value)} is not a lowercase #rrggbb hex`)
		return false
	}
	return true
}

for (const item of items) {
	for (const [position, side] of (item.sides ?? []).entries()) {
		const where = `${item.itemId}[${position === 0 ? "A" : "B"}]`
		const palette = side.palette
		for (const role of ROLES) checkHex(`${where}.${role}`, palette[role])

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
				if (stops[0]!.color !== palette.background) fail(`${where}.gradient: stops[0] ${stops[0]!.color} is not the background ${palette.background}`)
				if (stops[stops.length - 1]!.color !== palette.surface) fail(`${where}.gradient: the last stop is not the surface ${palette.surface}`)
			}
			if (palette.surfaceCollapsed) fail(`${where}: surfaceCollapsed is set but a gradient is published`)
		}

		if (palette.surfaceCollapsed !== (palette.surface === palette.background)) fail(`${where}: surfaceCollapsed disagrees with the hexes`)
		if (palette.accentCollapsed !== (palette.accent === palette.foreground)) fail(`${where}: accentCollapsed disagrees with the hexes`)

		for (let first = 0; first < ROLES.length; first += 1) {
			for (let second = first + 1; second < ROLES.length; second += 1) {
				const a = palette[ROLES[first]!]!
				const b = palette[ROLES[second]!]!
				if (a === b || !HEX.test(a) || !HEX.test(b)) continue
				const distance = colorDistance(colorFromHex(a), colorFromHex(b))
				if (distance < MARGIN_FLOOR) {
					fail(`${where}: ${ROLES[first]} ${a} and ${ROLES[second]} ${b} are ${distance.toFixed(5)} apart, under D7's ${MARGIN_FLOOR} margin floor`)
				}
			}
		}

		// A side the contract would have refused is not a side; it is an invalid palette wearing one.
		if (HEX.test(palette.foreground) && HEX.test(palette.accent) && !palette.accentCollapsed) {
			const separation = colorDistance(colorFromHex(palette.foreground), colorFromHex(palette.accent))
			if (separation < FOREGROUND_ACCENT_SEPARATION_DISTANCE) {
				fail(`${where}: foreground ${palette.foreground} and accent ${palette.accent} are ${separation.toFixed(5)} apart, under the contract's ${FOREGROUND_ACCENT_SEPARATION_DISTANCE}`)
			}
		}
	}
}

// --- 3. exactly the declared role differs, per item, and the sides are worth showing -------------

items.forEach((item, index) => {
	const declared = DECLARED[index]
	if (declared === undefined || (item.sides ?? []).length !== 2) return
	const [first, second] = item.sides as [Side, Side]

	const moved: string[] = ROLES.filter((role) => first.palette[role] !== second.palette[role])
	if (JSON.stringify(first.palette.gradient) !== JSON.stringify(second.palette.gradient)) moved.push("gradient")
	if (first.palette.surfaceCollapsed !== second.palette.surfaceCollapsed) moved.push("surfaceCollapsed")
	if (first.palette.accentCollapsed !== second.palette.accentCollapsed) moved.push("accentCollapsed")

	if (moved.length !== 1 || moved[0] !== declared.role) {
		fail(`${item.itemId}: the sides differ in [${moved.join(", ")}] — this item prices ${declared.role} and must differ in that and nothing else`)
		return
	}

	const shown = new Set([first.palette[declared.role], second.palette[declared.role]])
	if (!shown.has(declared.published) || !shown.has(declared.variant)) {
		fail(`${item.itemId}: the two ${declared.role}s are ${[...shown].join(" / ")}, expected ${declared.published} and ${declared.variant}`)
		return
	}
	// Below the bar the two sides are one colour by the contract's own ruler and the item prices nothing.
	const a = colorFromHex(declared.published)
	const b = colorFromHex(declared.variant)
	const distance = colorDistance(a, b)
	const bar = sameColorBar(a, b)
	if (distance <= bar) {
		fail(`${item.itemId}: the two ${declared.role}s are ${distance.toFixed(5)} apart against a same-colour bar of ${bar.toFixed(5)} — one colour, nothing to prefer`)
	}
})

/** Side order alternates by item index — so neither position belongs to either decoded side. */
items.forEach((item, index) => {
	const declared = DECLARED[index]
	if (declared === undefined || (item.sides ?? []).length !== 2) return
	const leading = item.sides[0]!.palette[declared.role]
	const expected = index % 2 === 0 ? declared.published : declared.variant
	if (leading !== expected) fail(`${item.itemId}: side order does not alternate by item index parity (position A carries ${leading})`)
})

// --- 4. the pin: one build, and the one `pin.sh` names ------------------------------------------

const pinScript = readFileSync(join(HERE, "pin.sh"), "utf8")
if (!pinScript.includes(`PIN_COMMIT=${PIN_COMMIT}`)) fail(`pin.sh does not pin ${PIN_COMMIT}`)

for (const variant of ["base", "accent-member", "fg-member"]) {
	const path = join(HERE, "out", `${variant}.json`)
	if (!existsSync(path)) {
		fail(`out/${variant}.json is missing — the fixture cannot be rebuilt from probes that are not there`)
		continue
	}
	const probe = JSON.parse(readFileSync(path, "utf8")) as { variant: string; pinCommit: string }
	if (probe.variant !== variant) fail(`out/${variant}.json declares variant ${probe.variant}`)
	if (probe.pinCommit !== PIN_COMMIT) fail(`out/${variant}.json was probed at ${probe.pinCommit}, not the pinned commit`)
}

// --- 5. blinding, tier 1: the SERVED surface ----------------------------------------------------

const SERVED_FORBIDDEN: [RegExp, string][] = [
	[/\bp2[-_]?(alpha|tos|tree)?\b/i, "a prototype or candidate token"],
	[/\balpha\b/i, "the alpha pipeline name"],
	[/\btos\b/i, "the tos pipeline name"],
	[/tree[- ]of[- ]shapes/i, "the tree-of-shapes family name"],
	[/quasi[- ]?flat|flat[- ]?zone/i, "the quasi-flat-zone family name"],
	[/\bround[-_ ]?\d/i, "a round token"],
	[/\bcycle[-_ ]?\d/i, "a development-cycle token"],
	[/\bcal-\d|\bphase\d?-/i, "a batch id"],
	[/\bmember\b|\bcluster\b/i, "the publication rule two items price"],
	[/\bchroma\b|\bcontrast\b|\bapca\b|\blegib|\breadab/i, "the ordering keys under test"],
	[/\bcoverage\b|\bfamil(y|ies)\b|\ballocat/i, "the allocation rule two items price"],
	[/\bpublished\b|\bvariant\b|\bbaseline\b/i, "which side is which"],
	[/salien|stability|growth|mser|antialias|\bhalo\b/i, "the eligibility machinery"],
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
	if (!/^[0-9a-f]{40}$/.test(item.itemId)) fail(`served-surface leak: itemId ${item.itemId} is not a bare cover slug`)
}

// --- 6. blinding, tier 2: the whole fixture's raw bytes -----------------------------------------

const FORBIDDEN: [RegExp, string][] = [
	[/\bp2-alpha\b/i, "the alpha candidate id"],
	[/\bp2-tos\b/i, "the tos candidate id"],
	[/\bp2-tree\b/i, "the prototype id"],
	[/\balpha\b/i, "the alpha pipeline name"],
	[/\btos\b/i, "the tos pipeline name"],
	[/tree[- ]of[- ]shapes/i, "the tree-of-shapes family name"],
	[/quasi[- ]?flat|flat[- ]?zone/i, "the quasi-flat-zone family name"],
	[/\bmerged\b/i, "the integration pass's own label"],
	[/\bmember\b|\bcluster\b/i, "the publication rule two items price"],
	[/\bchroma\b|\bapca\b/i, "an ordering key under test"],
	[/\bcoverage\b|\bfamil(y|ies)\b/i, "the allocation rule two items price"],
	[/\bpublished\b|\bvariant-(?!0\d)/i, "which side is which"],
	[/salien|antialias|\bhalo\b/i, "the eligibility machinery"],
	[/\blaminar\b|\bpartitioned\b|\bunreadable\b|\btextured\b/i, "the field verdict"],
	[/"verdict"|"class"/i, "the round's own machinery"],
]
for (const [pattern, why] of FORBIDDEN) {
	const hit = raw.match(pattern)
	if (hit) fail(`blinding leak: items.json contains ${JSON.stringify(hit[0])} — ${why}`)
}

/** `mapping.private.json` is the decode key and must never be mistaken for a servable file. */
const mappingRaw = readFileSync(join(HERE, "mapping.private.json"), "utf8")
if (!mappingRaw.includes("NOT SERVABLE")) fail("mapping.private.json does not declare itself unservable")
const mapping = JSON.parse(mappingRaw) as {
	_pin: { commit: string }
	_items: Record<string, { imagePath: string; roleUnderTest: string; published: { hex: string }; variant: { hex: string } }>
}
if (mapping._pin?.commit !== PIN_COMMIT) fail("mapping.private.json records a different pinned commit")
for (const declared of DECLARED) {
	const record = mapping._items?.[declared.itemId]
	if (record === undefined) {
		fail(`${declared.itemId}: no entry in mapping.private.json`)
		continue
	}
	if (record.roleUnderTest !== declared.role) fail(`${declared.itemId}: mapping records role ${record.roleUnderTest}, expected ${declared.role}`)
	if (record.published.hex !== declared.published || record.variant.hex !== declared.variant) {
		fail(`${declared.itemId}: mapping decodes ${record.published.hex}/${record.variant.hex}, expected ${declared.published}/${declared.variant}`)
	}
}

// --- 7. the images are on disk, repo-relative, and every colour is an exact triple ----------------

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
	if (typeof item.imagePath !== "string" || item.imagePath.startsWith("/")) {
		fail(`${item.itemId}: imagePath must be repo-relative, got ${item.imagePath}`)
		continue
	}
	if (!existsSync(join(ROOT, item.imagePath))) {
		fail(`${item.itemId}: image not on disk at ${item.imagePath}`)
		continue
	}
	const colors = await exactColorsOf(item.imagePath)
	for (const [position, side] of (item.sides ?? []).entries()) {
		const where = `${item.itemId}[${position === 0 ? "A" : "B"}]`
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

// --- 8. the outcome table, checked mechanically --------------------------------------------------

/**
 * `ROUND.md`'s table, restated as predicates over **the answer space the review page can record**:
 * a confound toggle, an artwork veto, and a preference that is always present and closed
 * (`a` | `b` | `no-preference`, decoded to which side it names). The free-text comment, the two grades
 * and the composer endorsement fire no row — declared in ROUND.md and *proved* here, because the
 * enumeration below varies nothing else and still finds exactly one firing row.
 */
type Answer = { confound: boolean; veto: boolean; preference: "published" | "variant" | "no-preference" }
const guarded = (answer: Answer): boolean => answer.confound || answer.veto

const ANSWERS: Answer[] = [true, false].flatMap((confound) =>
	[true, false].flatMap((veto) =>
		(["published", "variant", "no-preference"] as const).map((preference) => ({ confound, veto, preference })),
	),
)
if (ANSWERS.length !== 12) fail(`the enumerated answer space is ${ANSWERS.length} states, not the 12 ROUND.md declares`)

const itemRows = (n: number): { id: string; fires: (answer: Answer) => boolean }[] => [
	{ id: `I${n}-G`, fires: (answer) => guarded(answer) },
	{ id: `I${n}-P`, fires: (answer) => !guarded(answer) && answer.preference === "published" },
	{ id: `I${n}-V`, fires: (answer) => !guarded(answer) && answer.preference === "variant" },
	{ id: `I${n}-N`, fires: (answer) => !guarded(answer) && answer.preference === "no-preference" },
]

const rowIds: string[] = []
for (let n = 1; n <= DECLARED.length; n += 1) {
	const rows = itemRows(n)
	rowIds.push(...rows.map((row) => row.id))
	for (const answer of ANSWERS) {
		const firing = rows.filter((row) => row.fires(answer))
		if (firing.length !== 1) {
			fail(
				`outcome table block I${n} is not MECE: answer ${JSON.stringify(answer)} fires ${firing.length} rows (${firing.map((row) => row.id).join(", ") || "none"})`,
			)
		}
	}
}

/** Block J — the two allocation items read together. Denominator: 2 items, 144 joint states. */
const allocationPreferred = (answer: Answer): boolean => answer.preference === "variant"
const jointRows: { id: string; fires: (third: Answer, fourth: Answer) => boolean }[] = [
	{ id: "J-G", fires: (third, fourth) => guarded(third) || guarded(fourth) },
	{
		id: "J-2",
		fires: (third, fourth) => !guarded(third) && !guarded(fourth) && allocationPreferred(third) && allocationPreferred(fourth),
	},
	{
		id: "J-1",
		fires: (third, fourth) =>
			!guarded(third) && !guarded(fourth) && Number(allocationPreferred(third)) + Number(allocationPreferred(fourth)) === 1,
	},
	{
		id: "J-0a",
		fires: (third, fourth) =>
			!guarded(third) &&
			!guarded(fourth) &&
			!allocationPreferred(third) &&
			!allocationPreferred(fourth) &&
			third.preference === "published" &&
			fourth.preference === "published",
	},
	{
		id: "J-0b",
		fires: (third, fourth) =>
			!guarded(third) &&
			!guarded(fourth) &&
			!allocationPreferred(third) &&
			!allocationPreferred(fourth) &&
			(third.preference === "no-preference" || fourth.preference === "no-preference"),
	},
]
rowIds.push(...jointRows.map((row) => row.id))

let jointStates = 0
for (const third of ANSWERS) {
	for (const fourth of ANSWERS) {
		jointStates += 1
		const firing = jointRows.filter((row) => row.fires(third, fourth))
		if (firing.length !== 1) {
			fail(
				`outcome table block J is not MECE: ${JSON.stringify(third)} × ${JSON.stringify(fourth)} fires ${firing.length} rows (${firing.map((row) => row.id).join(", ") || "none"})`,
			)
		}
	}
}
if (jointStates !== 144) fail(`block J enumerated ${jointStates} joint states, not the 144 ROUND.md declares`)

/**
 * The table in `ROUND.md` is the one just checked: same rows, each written exactly once, and **no
 * row in it that no predicate covers** — which is the failure mode the round-3 table had. The section
 * is delimited by its own heading so that the item tables above it are not counted as outcome rows.
 */
const round = readFileSync(join(HERE, "ROUND.md"), "utf8")
const tableStart = round.indexOf("### The table")
const tableEnd = round.indexOf("\n## ", tableStart === -1 ? 0 : tableStart)
if (tableStart === -1 || tableEnd === -1) fail("ROUND.md has no delimited outcome-table section")
const table = tableStart === -1 || tableEnd === -1 ? "" : round.slice(tableStart, tableEnd)
for (const id of rowIds) {
	const occurrences = table.split(`| **${id}** |`).length - 1
	if (occurrences !== 1) fail(`ROUND.md's outcome table carries ${occurrences} rows for ${id}, expected exactly 1`)
}
const roundRowIds = table.match(/^\| \*\*([A-Za-z0-9-]+)\*\* \|/gm) ?? []
if (roundRowIds.length !== rowIds.length) {
	fail(`ROUND.md's outcome table has ${roundRowIds.length} rows, the checked table has ${rowIds.length} — a row exists that no predicate covers`)
}

// --- 9. deterministic rebuild --------------------------------------------------------------------

/**
 * `build.ts` writes in place, so the committed bytes are snapshotted first and restored if a rebuild
 * disagrees — a validator must not leave the artifact in a state its own failure message describes.
 * `build.ts` reads only the probe files and never HEAD, so a difference here is a real defect and not
 * a moving fingerprint.
 */
const ARTIFACTS = ["items.json", "mapping.private.json"] as const
const before = ARTIFACTS.map((name) => readFileSync(join(HERE, name), "utf8"))
for (let attempt = 0; attempt < 2; attempt += 1) {
	execFileSync("node", ["--experimental-strip-types", join(HERE, "build.ts")], { encoding: "utf8" })
	ARTIFACTS.forEach((name, index) => {
		if (readFileSync(join(HERE, name), "utf8") !== before[index]) {
			fail(`${name}: rebuild ${attempt + 1} does not reproduce the committed file byte-for-byte`)
		}
	})
}
ARTIFACTS.forEach((name, index) => writeFileSync(join(HERE, name), before[index]!))

// -------------------------------------------------------------------------------------------------

if (problems.length > 0) {
	for (const problem of problems) console.error(`FAIL  ${problem}`)
	console.error(`\n${problems.length} problem(s) — the fixture is not shippable.`)
	process.exit(1)
}

console.log(
	`OK  ${items.length} items, ${items.length * 2} sides, one role wide each ` +
		`(${DECLARED.map((entry) => `${entry.role[0]}:${entry.published}/${entry.variant}`).join(" ")}), ` +
		`every colour an exact triple, every distinct role pair ≥ ${MARGIN_FLOOR} OKLab, all sides pinned at ${PIN_COMMIT.slice(0, 8)}, ` +
		`served surface and fixture bytes blinding-clean, outcome table MECE over ${ANSWERS.length} states per item block and ${jointStates} joint states, ` +
		`rebuild reproduces byte-for-byte.`,
)
