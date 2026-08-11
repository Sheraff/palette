/**
 * Round-5 payload builder. Reads the three dev-loop run files and COPIES fields; nothing is
 * recomputed, re-quantised or re-rounded. The only transformations are round-3/4's caveats:
 *
 *  - `gradient.geometry` is DROPPED (caveat C: the run emits an object, the server requires a string
 *    of <=64 chars, and the pinned renderer fixes display at 135 degrees anyway);
 *  - stop positions are canonicalised to `GRADIENT_POSITION_DECIMALS` (6) with the server's own
 *    `canonicalPosition`, so `parseCalibrationBatch` round-trips the payload BYTE-IDENTICALLY;
 *  - `render-data.json` names come from the one `nameHexes()` call site and `fieldCss` from the
 *    pinned renderer, both imported here rather than reimplemented.
 *
 * TWO HARD ASSERTIONS, both of which throw rather than warn:
 *  - every row's own `palette.metadata.algorithmVersion` must read `p5-fieldfit-0.9.2`;
 *  - rows 1-3 are the returning covers, and their published accent must equal the hex
 *    `measurements/v9d-delta.json` and ROUND.md name in advance. This is the brief's LOUD STOP.
 *
 * Run from `research/v3`.
 */
import fs from "node:fs"
import path from "node:path"
import { nameHexes } from "../../../../src/review-server/color.ts"
import { canonicalPosition, fieldCss } from "../../../../src/review-server/gradient.ts"

const HERE = "prototypes/p5-fieldfit/review-rounds/round-5"
const RUNS = "data/devloop/runs"
const R3 = `${RUNS}/p5-fieldfit-p5-round3-fresh-20260811T185158056Z.jsonl`
const R4 = `${RUNS}/p5-fieldfit-p5-round4-fresh-20260811T185203809Z.jsonl`
const R5 = `${RUNS}/p5-fieldfit-p5-round5-fresh-20260811T185547524Z.jsonl`

const VARIANT = "p5-fieldfit-0.9.2"
const FINGERPRINT = {
	algorithmVersion: "p5-fieldfit-0.9.2",
	preprocessingVersion: "sharp-0.33.5/srgb/no-resample",
	gitCommit: "57f02ee0",
	dirty: false,
}

/** ROUND.md table order. `expectAccent` is set exactly on the three returning covers. */
const PLAN: Array<{ row: number; run: string; imagePath: string; expectAccent?: string }> = [
	{ row: 1, run: R4, imagePath: "01/ab67616d0000b27300012525e62c7f45baf46c90.jpg", expectAccent: "#8d2639" },
	{ row: 2, run: R3, imagePath: "12/ab67616d0000b27300125577fb06a6a8942d6547", expectAccent: "#009cff" },
	{ row: 3, run: R3, imagePath: "09/ab67616d0000b27300094a786a28459646be9b20", expectAccent: "#7f7ca7" },
	{ row: 4, run: R5, imagePath: "01/ab67616d0000b27300011897ac9fe3d4b4cd95b2.jpg" },
	{ row: 5, run: R5, imagePath: "02/ab67616d00001e0200020fe55990dc2670c3f5a6.jpg" },
	{ row: 6, run: R5, imagePath: "03/ab67616d0000b27300036816370505937e5e017c.jpg" },
	{ row: 7, run: R5, imagePath: "01/ab67616d00001e020001418e127493d543b718cb.jpg" },
	{ row: 8, run: R5, imagePath: "03/ab67616d0000b27300035026aa41f4f25760ac35.jpg" },
]

const rowsOf = (file: string) =>
	fs
		.readFileSync(file, "utf8")
		.trim()
		.split("\n")
		.map((l) => JSON.parse(l))
		.filter((r) => r.kind === "devloop-run-row" && r.ok)

const cache = new Map<string, any[]>()
const load = (f: string) => {
	if (!cache.has(f)) cache.set(f, rowsOf(f))
	return cache.get(f)!
}

const items = PLAN.map(({ row, run, imagePath, expectAccent }) => {
	const want = path.basename(imagePath)
	const matches = load(run).filter((r) => path.basename(r.imagePath) === want)
	if (matches.length !== 1) throw new Error(`row ${row}: ${want} matched ${matches.length} rows in ${run}`)
	const r = matches[0]
	const p = r.palette
	if (p.metadata.algorithmVersion !== VARIANT) throw new Error(`row ${row}: algorithmVersion ${p.metadata.algorithmVersion}`)
	if (p.metadata.preprocessingVersion !== FINGERPRINT.preprocessingVersion) {
		throw new Error(`row ${row}: preprocessingVersion ${p.metadata.preprocessingVersion}`)
	}
	if (expectAccent && p.roles.accent.hex !== expectAccent) {
		throw new Error(`LOUD STOP row ${row}: accent ${p.roles.accent.hex} != expected ${expectAccent}`)
	}
	const gradient =
		p.gradient === null
			? null
			: { stops: p.gradient.stops.map((s: any) => ({ color: s.color.hex, position: canonicalPosition(s.position) })) }
	return {
		itemId: path.basename(imagePath).replace(/\.[a-z0-9]+$/i, ""),
		imagePath,
		variantId: VARIANT,
		fingerprint: { ...FINGERPRINT },
		palette: {
			background: p.roles.background.hex,
			surface: p.roles.surface.hex,
			foreground: p.roles.foreground.hex,
			accent: p.roles.accent.hex,
			gradient,
			surfaceCollapsed: p.collapse.surfaceCollapsed,
			accentCollapsed: p.collapse.accentCollapsed,
		},
	}
})

const names = nameHexes(
	items.flatMap((i) => [
		i.palette.background,
		i.palette.surface,
		i.palette.foreground,
		i.palette.accent,
		...(i.palette.gradient?.stops.map((s) => s.color) ?? []),
	]),
)

const ROLES = ["background", "surface", "foreground", "accent"] as const
const renderData = Object.fromEntries(
	items.map((i) => [
		i.itemId,
		{
			roles: ROLES.map((role) => ({
				role,
				hex: i.palette[role],
				name: names[i.palette[role]],
				collapsed: role === "surface" ? i.palette.surfaceCollapsed : role === "accent" ? i.palette.accentCollapsed : false,
			})),
			gradient: i.palette.gradient,
			fieldCss: fieldCss(i.palette.gradient as any, i.palette.background, names),
		},
	]),
)

fs.writeFileSync(`${HERE}/items.json`, JSON.stringify(items, null, "\t") + "\n")
fs.writeFileSync(`${HERE}/render-data.json`, JSON.stringify(renderData, null, "\t") + "\n")
console.log(`wrote ${items.length} items; returning accents verified: 1 #8d2639, 2 #009cff, 3 #7f7ca7`)
