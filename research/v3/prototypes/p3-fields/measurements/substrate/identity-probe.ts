/**
 * **Gates (d) and (e), per cover, and the anchor measurement for `COHERENT_FILL_FLOOR`.**
 *
 * Nine covers, four flag settings each, one table.
 *
 * - the **seven identity-coverage covers** (`ACCENT_REDESIGN.md`): r2-item-4's purple, 208's yellow,
 *   130's cinnamon/coffee, 039's magenta, 188's corals, 168's blue-family accent, r2-item-2's
 *   pink/blue. Four of them (r2-item-4, 208, 130, 188) publish nothing the reviewer named at 0.4.0
 *   because `verifyColor`'s raw-share wall refuses the rank-0 candidate;
 * - **cover-114**, whose reviewer verdict is *"the background of this artwork is not white, it is
 *   red"* and whose diagnosis is spread-sensitive bar-count prevalence.
 *
 * For each it prints the published four roles, the field-set rule and the two prevalence numbers, and
 * **every accent verification the search performed** — support, the two interquartile extents, the
 * concentration `fill = support / (spreadX · spreadY)`, and which of the two eligibility routes passed.
 * `fill` on the four blocked covers against `fill` on the covers whose accent already publishes is the
 * distribution `COHERENT_FILL_FLOOR` is anchored on; it is printed rather than assumed.
 *
 *   node --experimental-strip-types \
 *     research/v3/prototypes/p3-fields/measurements/substrate/identity-probe.ts [--json out.json]
 */

import { writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { extractPalette } from "../../src/candidate.ts"

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..", "..")

/** Cover, its reviewer verbatim, and the image the round showed. */
const COVERS: readonly (readonly [string, string, string])[] = [
	["r2-item-4", "very distinct purple ... use instead (as the accent)", "05/ab67616d0000b2730005d8403971249d1ef0786b"],
	["208", "missing the significant yellow (album title, artist name)", "03/ab67616d0000b2730003f2b6590090abe420d104.jpg"],
	["130", "beautiful brown colors (cinnamon, coffee) ... instead of Holy Crow black", "0c/ab67616d00001e02000c4ff9e01aba5eae6cbec4"],
	["188", "missing some significant colors to reflect the full artwork's identity", "13/ab67616d0000b273001398589df77e24a722fe6a"],
	["039", "magenta color / white text", "music-artworks/d/7/6/d76d845e33b98c986bb8b1297e49487b.jpg"],
	["168", "accent ... within the blue family instead of ... the background and surface", "11/ab67616d0000b2730011a326091e7dd7df58b175"],
	["r2-item-2", "some pink and blue ... missing for a complete palette identity", "music-artworks/4/3/7/4378237c16d1002f395ab654ccdd7012.jpg"],
	["114", "the background of this artwork is not white, it is red", "09/ab67616d0000b2730009e00f495b4584cfdd4ef7"],
	["r2-item-8", "swap-demoted ex-foreground very hard to see", "11/ab67616d0000b2730011e7b5c1023c70f7a3d767"],
]

const SETTINGS: readonly (readonly [string, string | null])[] = [
	["0.4.0", null],
	["field", "field"],
	["elig", "eligibility"],
	["all", "all"],
]

type Row = {
	cover: string
	setting: string
	background: string
	surface: string
	foreground: string
	accent: string
	accentCollapsed: boolean
	fieldRule: string
	fieldSetSize: number
	prevalenceBackground: number
	prevalenceSurface: number
	accentVerdicts: {
		key: string
		support: number
		spreadX: number
		spreadY: number
		fill: number
		rawSharePasses: boolean
		coherencePasses: boolean
		spreadPasses: boolean
	}[]
}

const rows: Row[] = []

for (const [cover, , relative] of COVERS) {
	for (const [label, value] of SETTINGS) {
		if (value === null) delete process.env.P3_SUBSTRATE
		else process.env.P3_SUBSTRATE = value
		const { palette, intermediates } = await extractPalette(join(REPO_ROOT, relative))
		rows.push({
			cover,
			setting: label,
			background: palette.roles.background.hex,
			surface: palette.roles.surface.hex,
			foreground: palette.roles.foreground.hex,
			accent: palette.roles.accent.hex,
			accentCollapsed: palette.collapse.accentCollapsed,
			fieldRule: intermediates.fieldSetRule,
			fieldSetSize: intermediates.fieldSetSize,
			prevalenceBackground: intermediates.prevalence[0],
			prevalenceSurface: intermediates.prevalence[1],
			accentVerdicts: Object.entries(intermediates.verdicts)
				.filter(([key]) => key.startsWith("accent:"))
				.map(([key, verdict]) => ({
					key,
					support: verdict.support,
					spreadX: verdict.spreadX,
					spreadY: verdict.spreadY,
					fill: verdict.fill,
					rawSharePasses: verdict.rawSharePasses,
					coherencePasses: verdict.coherencePasses,
					spreadPasses: verdict.spreadPasses,
				})),
		})
	}
	delete process.env.P3_SUBSTRATE
}

const pct = (value: number) => `${(value * 100).toFixed(4)}%`
console.log("cover     set    bg      sf      fg      ac      coll rule                size    prev(bg/sf)")
for (const row of rows) {
	console.log(
		[
			row.cover.padEnd(9),
			row.setting.padEnd(6),
			row.background.padEnd(7),
			row.surface.padEnd(7),
			row.foreground.padEnd(7),
			row.accent.padEnd(7),
			(row.accentCollapsed ? "yes" : "no").padEnd(4),
			row.fieldRule.padEnd(19),
			String(row.fieldSetSize).padEnd(7),
			`${row.prevalenceBackground.toFixed(1)}/${row.prevalenceSurface.toFixed(1)}`,
		].join(" "),
	)
}

console.log("\ncover     set    accent-step  support     spreadX  spreadY  fill      raw  coh  spr")
for (const row of rows) {
	for (const verdict of row.accentVerdicts) {
		console.log(
			[
				row.cover.padEnd(9),
				row.setting.padEnd(6),
				verdict.key.padEnd(12),
				pct(verdict.support).padStart(11),
				verdict.spreadX.toFixed(4).padStart(8),
				verdict.spreadY.toFixed(4).padStart(8),
				verdict.fill.toFixed(5).padStart(9),
				(verdict.rawSharePasses ? " Y " : " . ").padEnd(4),
				(verdict.coherencePasses ? " Y " : " . ").padEnd(4),
				verdict.spreadPasses ? " Y " : " . ",
			].join(" "),
		)
	}
}

const jsonFlag = process.argv.indexOf("--json")
if (jsonFlag !== -1 && process.argv[jsonFlag + 1]) {
	await writeFile(resolve(process.argv[jsonFlag + 1]), `${JSON.stringify(rows, null, 2)}\n`)
}
