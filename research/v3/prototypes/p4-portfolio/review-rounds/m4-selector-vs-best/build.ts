/**
 * M4 round — build the payload. Writes `items.json` (servable) and `mapping.private.json` (never).
 *
 *     node --experimental-strip-types .../select-covers.ts    # decides the eight covers
 *     node --experimental-strip-types .../build.ts            # this file
 *     node --experimental-strip-types .../validate.ts         # exit 0 or it does not ship
 *
 * **No hex is typed here.** Every colour on every side is copied out of an M3 member run file, the
 * same rows the bit table was priced from, keyed on the cover's content hash. This file runs no
 * member and decodes no image.
 *
 * ## What the two sides are
 *
 * **Side A is the selector's elected palette** — the member `data/m3/bit-table-coverage.json` records
 * as `elected` on that cover, which after the bootstrap-semantics fix is the bootstrap-majority
 * member, not necessarily the cheapest total. **Side B is `p3-fields`**, SPEC §3's fixed best single
 * member. Which of the two lands in fixture position 0 is decided per item by a salted digest, and
 * the server re-shuffles again at push time with its own salt.
 *
 * ## Blinding, and what it cannot do
 *
 *  - `variantId` is an **opaque salted token**: `sha256(salt | itemId | member)`. It names nothing.
 *    (The review server does not serve it at all — `blinding.ts` withholds the variant id and the
 *    fingerprint from the browser — but the batch log carries it, and the batch log is read after
 *    release by whoever de-blinds.)
 *  - `fingerprint.algorithmVersion` is **masked neutral** and positional (`blinded-01`/`blinded-02`),
 *    and `preprocessingVersion` is the campaign's single string on both sides. The members' real
 *    versions differ (`p3-fields` records `…/alpha-excluded`) and would separate the arms outright;
 *    the true values are recorded in the private mapping instead.
 *  - What blinding **cannot** hide is the palettes themselves. `blinding.ts` says so at length: two
 *    arms that differ systematically in a served field are self-identifying. The gradient counts per
 *    side are measured in the private mapping and disclosed in `ROUND.md` for exactly that reason.
 *
 * Deterministic: the salt is generated once and then **read back** from `mapping.private.json`, so a
 * rebuild reproduces both files byte-for-byte. Nothing else here reads a clock or a random source.
 */

import { createHash, randomBytes } from "node:crypto"
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"

import { nameHexes } from "../../../../src/review-server/color.ts"
import type { Palette, RoleName } from "../../../../src/contract/types.ts"

const HERE = dirname(new URL(import.meta.url).pathname)
const PROTOTYPE = resolve(HERE, "../..")
const REPO = "/Users/Flo/GitHub/palette"

const BEST_MEMBER = "p3-fields"
const ROLES: readonly RoleName[] = ["background", "surface", "foreground", "accent"]
/** The campaign's single preprocessing string, served identically on both sides. */
const NEUTRAL_PREPROCESSING = "sharp-0.33.5/srgb/no-resample"
/** Salt length in bytes, matching `review-server/blinding.ts`'s own. */
const SALT_BYTES = 32

const MEMBER_RUNS: readonly { slug: string; runPaths: readonly string[] }[] = [
	{
		slug: "p2-tree",
		runPaths: ["data/m3/runs/p2-tree-coverage1.jsonl", "data/m3/runs/p2-tree-coverage1-resume-1.jsonl"],
	},
	{ slug: "p3-fields", runPaths: ["data/m3/runs/p3-fields-coverage1.jsonl"] },
	{ slug: "p5-fieldfit", runPaths: ["data/m3/runs/p5-fieldfit-coverage1.jsonl"] },
]

type SelectionItem = {
	contentHash: string
	itemId: string
	imagePath: string
	elected: string
	cheapestTotal: string | null
	flipped: boolean
	marginBits: number
	marginBand: string
	differingRoles: RoleName[]
	figureGroundClass: { elected: boolean; best: boolean }
	winFraction: number | null
	resamples: number | null
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

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex")

function readRun(runPaths: readonly string[]): Map<string, { palette: Palette; algorithmVersion: string; preprocessingVersion: string; codeVersion: string }> {
	const rows = new Map<string, { palette: Palette; algorithmVersion: string; preprocessingVersion: string; codeVersion: string }>()
	for (const runPath of runPaths) {
		let codeVersion = ""
		for (const line of readFileSync(resolve(PROTOTYPE, runPath), "utf8").split("\n")) {
			if (line.trim() === "") continue
			const parsed = JSON.parse(line) as Record<string, unknown>
			if (parsed.kind === "devloop-run-header") codeVersion = String(parsed.codeVersion)
			if (parsed.kind !== "devloop-run-row" || parsed.ok !== true || parsed.palette === null) continue
			const palette = parsed.palette as Palette
			const hash = String(parsed.inputContentHash)
			if (rows.has(hash)) continue
			rows.set(hash, {
				palette,
				algorithmVersion: String(palette.metadata.algorithmVersion),
				preprocessingVersion: String(palette.metadata.preprocessingVersion),
				codeVersion,
			})
		}
	}
	return rows
}

/** The push shape, straight off a run row. `geometry` is dropped: it is a member fingerprint. */
function toPushPalette(palette: Palette): PushPalette {
	return {
		background: palette.roles.background.hex,
		surface: palette.roles.surface.hex,
		foreground: palette.roles.foreground.hex,
		accent: palette.roles.accent.hex,
		gradient:
			palette.gradient === null
				? null
				: { stops: palette.gradient.stops.map((stop) => ({ color: stop.color.hex, position: stop.position })) },
		surfaceCollapsed: palette.collapse.surfaceCollapsed,
		accentCollapsed: palette.collapse.accentCollapsed,
	}
}

// ---------------------------------------------------------------------------------------------

const selection = JSON.parse(readFileSync(resolve(HERE, "selection.json"), "utf8")) as { items: SelectionItem[] }
const runs = new Map(MEMBER_RUNS.map((member) => [member.slug, readRun(member.runPaths)]))

const mappingPath = resolve(HERE, "mapping.private.json")
const previous = existsSync(mappingPath)
	? (JSON.parse(readFileSync(mappingPath, "utf8")) as { salt?: string })
	: {}
const salt = previous.salt ?? randomBytes(SALT_BYTES).toString("hex")

const gitCommit = execFileSync("git", ["-C", PROTOTYPE, "rev-parse", "--short=8", "HEAD"], { encoding: "utf8" }).trim()
const dirty = execFileSync("git", ["-C", PROTOTYPE, "status", "--porcelain"], { encoding: "utf8" }).trim() !== ""

const items: Record<string, unknown>[] = []
const mappingItems: Record<string, unknown>[] = []

for (const item of selection.items) {
	const sideMembers = [item.elected, BEST_MEMBER]
	// Fixture order: a salted per-item coin. The server shuffles again with its own salt at push time.
	const flip = Number.parseInt(sha256(`${salt}|${item.itemId}|order`).slice(0, 8), 16) % 2 === 1
	const ordered = flip ? [sideMembers[1]!, sideMembers[0]!] : sideMembers

	const built = ordered.map((slug, position) => {
		const row = runs.get(slug)!.get(item.contentHash)
		if (row === undefined) throw new Error(`${slug} has no run row for ${item.contentHash}`)
		return {
			slug,
			position,
			variantId: `v${sha256(`${salt}|${item.itemId}|${slug}`).slice(0, 15)}`,
			palette: toPushPalette(row.palette),
			trueAlgorithmVersion: row.algorithmVersion,
			truePreprocessingVersion: row.preprocessingVersion,
			codeVersion: row.codeVersion,
		}
	})

	// Names exactly as the server computes them: `nameHexes` over both sides' hexes of this item.
	const hexes = built.flatMap((side) => [
		...ROLES.map((role) => side.palette[role]),
		...(side.palette.gradient?.stops.map((stop) => stop.color) ?? []),
	])
	const names = nameHexes(hexes)

	items.push({
		itemId: item.itemId,
		imagePath: relative(REPO, item.imagePath),
		sides: built.map((side, position) => ({
			variantId: side.variantId,
			palette: side.palette,
			fingerprint: {
				algorithmVersion: `blinded-0${position + 1}`,
				preprocessingVersion: NEUTRAL_PREPROCESSING,
				gitCommit,
				dirty,
			},
		})),
	})

	mappingItems.push({
		itemId: item.itemId,
		contentHash: item.contentHash,
		imagePath: relative(REPO, item.imagePath),
		selector: {
			elected: item.elected,
			cheapestTotal: item.cheapestTotal,
			electionFlippedByFix: item.flipped,
			marginBits: item.marginBits,
			marginBand: item.marginBand,
			winFraction: item.winFraction,
			resamples: item.resamples,
			differingRolesVsBest: item.differingRoles,
			figureGroundClass: item.figureGroundClass,
		},
		sides: built.map((side) => ({
			fixturePosition: side.position,
			variantId: side.variantId,
			member: side.slug,
			role: side.slug === BEST_MEMBER ? "best single member (SPEC §3 F3's comparator)" : "the selector's elected palette",
			trueAlgorithmVersion: side.trueAlgorithmVersion,
			truePreprocessingVersion: side.truePreprocessingVersion,
			runCodeVersion: side.codeVersion,
			palette: side.palette,
			// NOTES-cross-arm note 1: the served colour NAMES are judged surface, so both sides' names
			// are recorded now — after release they are what makes a name effect attributable.
			servedColorNames: {
				roles: Object.fromEntries(ROLES.map((role) => [role, names[side.palette[role]]])),
				gradientStops: side.palette.gradient?.stops.map((stop) => names[stop.color]) ?? null,
			},
		})),
	})
}

const gradientsPerRole = {
	elected: mappingItems.filter((item) =>
		(item.sides as { member: string; palette: PushPalette }[]).some(
			(side) => side.member !== BEST_MEMBER && side.palette.gradient !== null,
		),
	).length,
	best: mappingItems.filter((item) =>
		(item.sides as { member: string; palette: PushPalette }[]).some(
			(side) => side.member === BEST_MEMBER && side.palette.gradient !== null,
		),
	).length,
}

const mapping = {
	_readme:
		"NOT SERVABLE. The decode key for the M4 round: which fixture position holds the selector's " +
		"elected palette, which holds p3-fields, the salt both the variant tokens and the fixture order " +
		"come from, every side's served colour names, and the selection evidence behind each item. " +
		"Never copy into a batch fixture, a media directory, or anywhere the review server can reach.",
	salt,
	saltUse:
		"variantId = 'v' + sha256(salt|itemId|member)[0:15]; fixture side order = sha256(salt|itemId|'order') parity. " +
		"Regenerating with this file present reuses the salt, which is what makes the build deterministic.",
	pin: {
		gitCommit,
		dirty,
		note:
			"the palettes are the M3 member runs' own rows (data/m3/runs/*.jsonl), keyed on the cover's " +
			"content hash; this build ran no member and decoded no image. The commit is this worktree's " +
			"HEAD at build time and the members' true code versions are on each side below.",
		memberRuns: MEMBER_RUNS,
		table: "data/m3/bit-table-coverage.json (post bootstrap-semantics fix)",
	},
	blindingCaution: {
		source: "src/review-server/blinding.ts — 'the shuffle is unguessable; the arms may still be recognisable'",
		itemsWhereElectedSidePublishesAGradient: gradientsPerRole.elected,
		itemsWhereBestSidePublishesAGradient: gradientsPerRole.best,
		note:
			"a served field that separates the arms systematically unblinds the round whatever the salt " +
			"does. These two counts are the measurement of that risk on this payload; ROUND.md discloses it.",
	},
	items: mappingItems,
}

writeFileSync(resolve(HERE, "items.json"), `${JSON.stringify(items, null, "\t")}\n`)
writeFileSync(mappingPath, `${JSON.stringify(mapping, null, "\t")}\n`)
process.stdout.write(
	`items.json: ${items.length} items · gradients: elected ${gradientsPerRole.elected}, best ${gradientsPerRole.best} · ${gitCommit}${dirty ? " (dirty)" : ""}\n`,
)
