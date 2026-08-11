/**
 * Round-4 payload builder. Reads the two dev-loop run files and COPIES fields; nothing is
 * recomputed, re-quantised or re-rounded. The only transformations are the three round-3 caveats:
 *
 *  - `gradient.geometry` is DROPPED (round-3 caveat C: the run emits an object, the server requires
 *    a string of <=64 chars, and the pinned renderer fixes display at 135 degrees anyway);
 *  - stop positions are canonicalised to `GRADIENT_POSITION_DECIMALS` (6) with the server's own
 *    `canonicalPosition`, so `parseCalibrationBatch` round-trips the payload BYTE-IDENTICALLY. Round
 *    3's ramps were all 2-stop at positions 0 and 1, where this was a no-op; round 4 has two 3-stop
 *    ramps whose middle positions carry float tails, where it is not;
 *  - `render-data.json` names come from the one `nameHexes()` call site and `fieldCss` from the
 *    pinned renderer, both imported here rather than reimplemented.
 *
 * Run from `research/v3`.
 */
import fs from "node:fs"
import path from "node:path"
import { nameHexes } from "../../../../src/review-server/color.ts"
import { canonicalPosition, fieldCss } from "../../../../src/review-server/gradient.ts"

const HERE = "prototypes/p5-fieldfit/review-rounds/round-4"
const RUNS = "data/devloop/runs"
const DEMO = `${RUNS}/p5-fieldfit-demo-20-20260811T112525309Z.jsonl`
const R3 = `${RUNS}/p5-fieldfit-p5-round3-fresh-20260811T112531167Z.jsonl`
const R4 = `${RUNS}/p5-fieldfit-p5-round4-fresh-20260811T113044607Z.jsonl`
/**
 * Row 5's run, made by W-STAGE4B after the ROUND.md ruling admitted the disclosed near-miss as item
 * 5. Same candidate, same set file, all four rows cache hits — the palette is the one
 * `ITEM5-QUESTION.md` §3 published, taken verbatim from a run rather than recomputed here.
 */
const R4B = `${RUNS}/p5-fieldfit-p5-round4-fresh-20260811T114248560Z.jsonl`

const VARIANT = "p5-fieldfit-0.8.2"
const FINGERPRINT = {
	algorithmVersion: "p5-fieldfit-0.8.2",
	preprocessingVersion: "sharp-0.33.5/srgb/no-resample",
	gitCommit: "c5552f8",
	dirty: false,
}

/** ROUND.md table order. Row 5 is the disclosed near-miss admitted by the ROUND.md staging ruling 1. */
const PLAN: Array<{ row: number; run: string; token: string; imagePath: string }> = [
	{ row: 1, run: DEMO, token: "2376a6b67d", imagePath: "00/ab67616d00001e020000269ead63cf2376a6b67d.jpg" },
	{ row: 2, run: DEMO, token: "908479200b", imagePath: "00/ab67616d00001e02000022e7e9d11c908479200b.jpg" },
	{ row: 3, run: R3, token: "9646be9b20", imagePath: "09/ab67616d0000b27300094a786a28459646be9b20" },
	{ row: 4, run: DEMO, token: "fc8d58e0af", imagePath: "00/ab67616d00001e0200000ee5a62175fc8d58e0af.jpg" },
	{ row: 5, run: R4B, token: "10266bb9", imagePath: "02/ab67616d00001e0200028475c3197f4510266bb9.jpg" },
	{ row: 6, run: R4, token: "95a0f57b", imagePath: "03/ab67616d0000b2730003079010cf188395a0f57b.jpg" },
	{ row: 7, run: R4, token: "baf46c90", imagePath: "01/ab67616d0000b27300012525e62c7f45baf46c90.jpg" },
	{ row: 8, run: R4, token: "5408f632", imagePath: "02/ab67616d00001e02000227d883fd2cc65408f632.jpg" },
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

const items = PLAN.map(({ row, run, token, imagePath }) => {
	const matches = load(run).filter((r) => r.imagePath.includes(token))
	if (matches.length !== 1) throw new Error(`row ${row}: token ${token} matched ${matches.length} rows in ${run}`)
	const r = matches[0]
	if (path.basename(r.imagePath) !== path.basename(imagePath)) {
		throw new Error(`row ${row}: run path ${r.imagePath} disagrees with planned ${imagePath}`)
	}
	const p = r.palette
	if (p.metadata.algorithmVersion !== VARIANT) throw new Error(`row ${row}: algorithmVersion ${p.metadata.algorithmVersion}`)
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
console.log(`wrote ${items.length} items`)
