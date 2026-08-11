/**
 * M4 round — the validation battery. **Exit 0 or the round does not ship.**
 *
 * Run from `research/v3`:
 *   node --experimental-strip-types \
 *     prototypes/p4-portfolio/review-rounds/m4-selector-vs-best/validate.ts
 *
 * Five things are checked, in the order they can kill a round:
 *
 *  1. **The id surface.** Every served string — itemId, imagePath, variantId, both fingerprint
 *     version fields, the commit, and every hex — is enumerated against this prototype's own
 *     prototype/round/member tokens. Zero hits, and the scanner is **armed**: a fabricated
 *     token-bearing payload must be flagged, or the scan is decoration (the failure mode
 *     `CONVENTIONS.md` records this repo hitting before).
 *  2. **`parseBatch` dry-run.** The real server parser, imported read-only, over the real payload
 *     with the paths absolutized as a push would. It must round-trip the palettes unchanged.
 *  3. **Exact-hex verification against the runs on disk.** Every colour on every side is re-read from
 *     the M3 member run files and compared character by character. Nothing in the payload may be a
 *     hex this prototype's runs never published.
 *  4. **The blinding is what it claims.** Two sides, distinct opaque tokens, and both the tokens and
 *     the fixture order recomputed from the private salt.
 *  5. **Deterministic rebuild.** `build.ts` is re-run and both files compared byte-for-byte.
 *
 * Plus the round's own eligibility, re-derived rather than trusted: on every item the elected side is
 * not `p3-fields`, and the two served palettes differ at the contract's regional bar.
 */

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"

import { compareRole, DEFAULT_MATCH_OPTIONS } from "../../../../src/adjudication/match.ts"
import { colorFromHex } from "../../../../src/contract/color.ts"
import { parseBatch } from "../../../../src/review-server/batch.ts"
import { nameHexes } from "../../../../src/review-server/color.ts"
import { canonicalPosition } from "../../../../src/review-server/gradient.ts"
import type { Palette, RoleName } from "../../../../src/contract/types.ts"

const HERE = dirname(new URL(import.meta.url).pathname)
const PROTOTYPE = resolve(HERE, "../..")
const REPO = "/Users/Flo/GitHub/palette"
const ROLES: readonly RoleName[] = ["background", "surface", "foreground", "accent"]
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/iu
const HEX = /^#[0-9a-f]{6}$/u
const STEM = /^[0-9a-f]{40}$/u
const EXPECTED_ITEMS = 8

/**
 * Everything that must not appear in a served string: this prototype, its members, its milestones,
 * its rounds, and the selector's own vocabulary. `"round"` itself is unusable as a token over KEYS
 * (`background`, `foreground` contain it) — the scan runs over served **values** only, which is
 * where a leak would actually reach the reviewer.
 */
const FORBIDDEN_TOKENS = [
	"p1", "p2", "p3", "p4", "p5", "p6",
	"portfolio", "tree", "fields", "fieldfit", "field-fit", "mdl", "figureground",
	"selector", "select", "elect", "member",
	"m1", "m2", "m3", "m4", "milestone", "round", "prototype", "arm-c", "armc",
	"winner", "margin", "bootstrap", "bits", "currency", "cheapest",
	"coverage", "demo", "flip", "best", "rival", "candidate", "blinded-a",
]

let failed = 0
const check = (name: string, ok: boolean, detail = ""): void => {
	if (!ok) failed += 1
	process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}${detail === "" ? "" : ` — ${detail}`}\n`)
}

type PushPalette = {
	background: string
	surface: string
	foreground: string
	accent: string
	gradient: { stops: { color: string; position: number }[] } | null
	surfaceCollapsed: boolean
	accentCollapsed: boolean
}
type Side = { variantId: string; palette: PushPalette; fingerprint: Record<string, unknown> }
type Item = { itemId: string; imagePath: string; sides: Side[] }

const itemsText = readFileSync(resolve(HERE, "items.json"), "utf8")
const items = JSON.parse(itemsText) as Item[]
const mappingText = readFileSync(resolve(HERE, "mapping.private.json"), "utf8")
const mapping = JSON.parse(mappingText) as {
	salt: string
	items: {
		itemId: string
		contentHash: string
		selector: { elected: string; differingRolesVsBest: RoleName[] }
		sides: {
			fixturePosition: number
			variantId: string
			member: string
			palette: PushPalette
			servedColorNames: { roles: Record<string, string>; gradientStops: string[] | null }
		}[]
	}[]
}

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex")

// ---------------------------------------------------------------------------------------------
// 0. Shape
// ---------------------------------------------------------------------------------------------

check(`items.json is an array of ${EXPECTED_ITEMS}`, Array.isArray(items) && items.length === EXPECTED_ITEMS, `${items.length}`)
check("every itemId is unique", new Set(items.map((item) => item.itemId)).size === items.length)
check("every itemId is a server-legal id token", items.every((item) => ID_PATTERN.test(item.itemId)))
check("every itemId is a full 40-hex stem", items.every((item) => STEM.test(item.itemId)))
check("no imagePath is absolute", items.every((item) => !isAbsolute(item.imagePath)))
check(
	"every itemId is its imagePath's filename stem",
	items.every((item) => item.imagePath.split("/").pop()!.replace(/\.[a-z0-9]+$/iu, "") === item.itemId),
)
check(
	"every imagePath resolves under the main checkout",
	items.every((item) => {
		try {
			readFileSync(join(REPO, item.imagePath))
			return true
		} catch {
			return false
		}
	}),
)
check("every item carries exactly the three push keys", items.every((item) => JSON.stringify(Object.keys(item).sort()) === JSON.stringify(["imagePath", "itemId", "sides"])))
check("every item has exactly two sides", items.every((item) => item.sides.length === 2))
check(
	"every side carries exactly variantId/palette/fingerprint",
	items.every((item) =>
		item.sides.every((side) => JSON.stringify(Object.keys(side).sort()) === JSON.stringify(["fingerprint", "palette", "variantId"])),
	),
)

const allHexes = items.flatMap((item) =>
	item.sides.flatMap((side) => [
		...ROLES.map((role) => side.palette[role]),
		...(side.palette.gradient?.stops.map((stop) => stop.color) ?? []),
	]),
)
check("every hex matches ^#[0-9a-f]{6}$", allHexes.every((hex) => HEX.test(hex)), `${allHexes.length} hexes`)
check(
	"collapse flags agree with hex equality (surface~background, accent~foreground)",
	items.every((item) =>
		item.sides.every(
			(side) =>
				side.palette.surfaceCollapsed === (side.palette.surface === side.palette.background) &&
				side.palette.accentCollapsed === (side.palette.accent === side.palette.foreground),
		),
	),
)

const gradients = items.flatMap((item) => item.sides.filter((side) => side.palette.gradient !== null))
check(
	"gradient stop counts within 2..4, positions canonical, strictly increasing, ends at 0 and 1",
	gradients.every((side) => {
		const stops = side.palette.gradient!.stops
		if (stops.length < 2 || stops.length > 4) return false
		let previous = -Infinity
		for (const stop of stops) {
			const position = canonicalPosition(stop.position)
			if (position !== stop.position || position <= previous || position < 0 || position > 1) return false
			previous = position
		}
		return stops[0]!.position === 0 && stops[stops.length - 1]!.position === 1
	}),
	`${gradients.length} gradient sides`,
)
check(
	"no gradient carries a geometry (it is a member fingerprint)",
	gradients.every((side) => (side.palette.gradient as Record<string, unknown>).geometry === undefined),
)

// ---------------------------------------------------------------------------------------------
// 1. The id surface, and the scanner armed against a fabricated leak
// ---------------------------------------------------------------------------------------------

/** Every string a push would carry to the server or the browser, values only. */
function servedStrings(payload: Item[]): string[] {
	return payload.flatMap((item) => [
		item.itemId,
		item.imagePath,
		...item.sides.flatMap((side) => [
			side.variantId,
			...Object.values(side.fingerprint).filter((value): value is string => typeof value === "string"),
			...ROLES.map((role) => side.palette[role]),
			...(side.palette.gradient?.stops.map((stop) => stop.color) ?? []),
		]),
	])
}

function scan(payload: Item[]): { token: string; where: string }[] {
	const hits: { token: string; where: string }[] = []
	for (const value of servedStrings(payload)) {
		const lowered = value.toLowerCase()
		for (const token of FORBIDDEN_TOKENS) if (lowered.includes(token)) hits.push({ token, where: value })
	}
	return hits
}

const hits = scan(items)
check(
	"no prototype / round / member / mechanism token in any served string",
	hits.length === 0,
	hits.length === 0 ? `${servedStrings(items).length} strings scanned` : hits.map((hit) => `${hit.token} in ${hit.where}`).join(", "),
)

const poisoned = JSON.parse(itemsText) as Item[]
poisoned[0]!.sides[0]!.variantId = "p4-portfolio-m4-selector-elected-01"
const poisonedHits = scan(poisoned)
check(
	"the scanner is armed: a fabricated token-bearing variantId is caught",
	poisonedHits.length > 0,
	`${poisonedHits.length} hit(s) on the negative control`,
)

check(
	"mapping.private.json is not referenced from the payload",
	!itemsText.includes("mapping.private") && !itemsText.includes(mapping.salt),
)

// ---------------------------------------------------------------------------------------------
// 2. parseBatch dry-run — the real parser, read-only
// ---------------------------------------------------------------------------------------------

try {
	const parsed = parseBatch({
		batchId: "dry-run-m4",
		purpose: "mechanism",
		fundedBy: [],
		items: items.map((item) => ({ ...item, imagePath: join(REPO, item.imagePath) })),
	})
	check(`parseBatch accepts the payload (${parsed.items.length} items, purpose ${parsed.purpose})`, parsed.items.length === EXPECTED_ITEMS)
	check(
		"round-trip identical: every parsed palette is the pushed palette",
		parsed.items.every((parsedItem, at) =>
			parsedItem.sides.every(
				(side, position) => JSON.stringify(side.palette) === JSON.stringify(items[at]!.sides[position]!.palette),
			),
		),
	)
	check(
		"the parser kept both variant tokens and they differ",
		parsed.items.every((parsedItem, at) =>
			parsedItem.sides.every((side, position) => side.variantId === items[at]!.sides[position]!.variantId),
		) && parsed.items.every((parsedItem) => parsedItem.sides[0].variantId !== parsedItem.sides[1].variantId),
	)
} catch (error) {
	check("parseBatch accepts the payload", false, (error as Error).message)
}

// ---------------------------------------------------------------------------------------------
// 3. Exact hexes, against the member runs on disk
// ---------------------------------------------------------------------------------------------

const RUN_PATHS: Record<string, string[]> = {
	"p2-tree": ["data/m3/runs/p2-tree-coverage1.jsonl", "data/m3/runs/p2-tree-coverage1-resume-1.jsonl"],
	"p3-fields": ["data/m3/runs/p3-fields-coverage1.jsonl"],
	"p5-fieldfit": ["data/m3/runs/p5-fieldfit-coverage1.jsonl"],
}

function runPalette(slug: string, contentHash: string): Palette | null {
	for (const runPath of RUN_PATHS[slug] ?? []) {
		for (const line of readFileSync(resolve(PROTOTYPE, runPath), "utf8").split("\n")) {
			if (line.trim() === "" || !line.includes(contentHash)) continue
			const row = JSON.parse(line) as { kind: string; inputContentHash: string; ok: boolean; palette: Palette | null }
			if (row.kind !== "devloop-run-row" || row.inputContentHash !== contentHash) continue
			if (row.ok && row.palette !== null) return row.palette
		}
	}
	return null
}

let hexMismatches = 0
let hexesChecked = 0
for (const entry of mapping.items) {
	const item = items.find((candidate) => candidate.itemId === entry.itemId)!
	for (const side of entry.sides) {
		const truth = runPalette(side.member, entry.contentHash)
		const served = item.sides[side.fixturePosition]!.palette
		if (truth === null) {
			hexMismatches += 1
			continue
		}
		for (const role of ROLES) {
			hexesChecked += 1
			if (truth.roles[role].hex !== served[role]) hexMismatches += 1
		}
		const truthStops = truth.gradient?.stops.map((stop) => stop.color.hex) ?? null
		const servedStops = served.gradient?.stops.map((stop) => stop.color) ?? null
		hexesChecked += truthStops?.length ?? 0
		if (JSON.stringify(truthStops) !== JSON.stringify(servedStops)) hexMismatches += 1
	}
}
check("every served hex is verbatim from a member run row", hexMismatches === 0, `${hexesChecked} hexes checked`)

check(
	"the private mapping's served colour names are the current colornames-oklab output",
	mapping.items.every((entry) => {
		const item = items.find((candidate) => candidate.itemId === entry.itemId)!
		const names = nameHexes(
			item.sides.flatMap((side) => [
				...ROLES.map((role) => side.palette[role]),
				...(side.palette.gradient?.stops.map((stop) => stop.color) ?? []),
			]),
		)
		return entry.sides.every((side) => {
			const served = item.sides[side.fixturePosition]!.palette
			const roleNamesAgree = ROLES.every((role) => side.servedColorNames.roles[role] === names[served[role]])
			const stopNames = served.gradient?.stops.map((stop) => names[stop.color]) ?? null
			return roleNamesAgree && JSON.stringify(side.servedColorNames.gradientStops) === JSON.stringify(stopNames)
		})
	}),
)

// ---------------------------------------------------------------------------------------------
// 4. The blinding, recomputed from the salt
// ---------------------------------------------------------------------------------------------

check(
	"every variantId is the salted token for its side, and names nothing",
	mapping.items.every((entry) =>
		entry.sides.every(
			(side) =>
				side.variantId === `v${sha256(`${mapping.salt}|${entry.itemId}|${side.member}`).slice(0, 15)}` &&
				items.find((item) => item.itemId === entry.itemId)!.sides[side.fixturePosition]!.variantId === side.variantId,
		),
	),
)
check(
	"the fixture side order is the salted per-item coin",
	mapping.items.every((entry) => {
		const flip = Number.parseInt(sha256(`${mapping.salt}|${entry.itemId}|order`).slice(0, 8), 16) % 2 === 1
		const elected = entry.sides.find((side) => side.member === entry.selector.elected)!
		return elected.fixturePosition === (flip ? 1 : 0)
	}),
)
check(
	"both orders actually occur (the coin is not stuck)",
	new Set(mapping.items.map((entry) => entry.sides.find((side) => side.member === entry.selector.elected)!.fixturePosition)).size === 2,
	`elected in position 0 on ${mapping.items.filter((entry) => entry.sides.find((side) => side.member === entry.selector.elected)!.fixturePosition === 0).length} of ${mapping.items.length}`,
)
check(
	"the served fingerprints are neutral and identical in everything but position",
	items.every((item) =>
		item.sides.every((side, position) => side.fingerprint.algorithmVersion === `blinded-0${position + 1}`) &&
		new Set(item.sides.map((side) => side.fingerprint.preprocessingVersion)).size === 1 &&
		new Set(item.sides.map((side) => side.fingerprint.gitCommit)).size === 1 &&
		new Set(item.sides.map((side) => side.fingerprint.dirty)).size === 1,
	),
)

// ---------------------------------------------------------------------------------------------
// 5. The round's own eligibility, re-derived
// ---------------------------------------------------------------------------------------------

check(
	"no item pits p3-fields against itself: one side is the elected member, the other is p3-fields",
	mapping.items.every(
		(entry) =>
			entry.selector.elected !== "p3-fields" &&
			new Set(entry.sides.map((side) => side.member)).size === 2 &&
			entry.sides.some((side) => side.member === "p3-fields"),
	),
)
check(
	"every item's two served palettes differ at the contract's regional bar",
	mapping.items.every((entry) => {
		const item = items.find((candidate) => candidate.itemId === entry.itemId)!
		const [first, second] = item.sides
		return ROLES.some(
			(role) =>
				!compareRole(role, colorFromHex(first!.palette[role]), colorFromHex(second!.palette[role]), DEFAULT_MATCH_OPTIONS)
					.same,
		)
	}),
)

// ---------------------------------------------------------------------------------------------
// 6. Deterministic rebuild
// ---------------------------------------------------------------------------------------------

execFileSync("node", ["--experimental-strip-types", resolve(HERE, "build.ts")], {
	env: { ...process.env, NODE_NO_WARNINGS: "1" },
	encoding: "utf8",
})
check("rebuilding items.json is byte-identical", readFileSync(resolve(HERE, "items.json"), "utf8") === itemsText)
check(
	"rebuilding mapping.private.json is byte-identical (the salt is reused, not regenerated)",
	readFileSync(resolve(HERE, "mapping.private.json"), "utf8") === mappingText,
)

process.stdout.write(failed === 0 ? "\nALL CHECKS PASSED\n" : `\n${failed} CHECK(S) FAILED\n`)
process.exit(failed === 0 ? 0 : 1)
