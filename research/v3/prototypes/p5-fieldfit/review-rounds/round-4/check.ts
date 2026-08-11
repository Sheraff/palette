/**
 * Round-4 validation battery. Round-3 §5's checks, re-run against the round-4 payload, plus the
 * push-fingerprint check this round needs (`gitCommit c5552f8`, `dirty false`) and the leak-scan
 * tokens the round-4 brief added (`class`, `union`, `coverage`).
 *
 * Run from `research/v3`. Staging artefact, not payload.
 */
import fs from "node:fs"
import path from "node:path"
import { nameHexes } from "../../../../src/review-server/color.ts"
import { canonicalPosition, fieldCss } from "../../../../src/review-server/gradient.ts"
import { parseCalibrationBatch } from "../../../../src/review-server/batch.ts"

const HERE = "prototypes/p5-fieldfit/review-rounds/round-4"
const MAIN = "/Users/Flo/GitHub/palette"
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/iu
const HEX = /^#[0-9a-f]{6}$/

const items = JSON.parse(fs.readFileSync(`${HERE}/items.json`, "utf8"))
const render = JSON.parse(fs.readFileSync(`${HERE}/render-data.json`, "utf8"))
const ROLES = ["background", "surface", "foreground", "accent"] as const

let failed = 0
const check = (name: string, ok: boolean, detail = "") => {
	if (!ok) failed++
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`)
}

const N = items.length
// EIGHT since the ROUND.md staging ruling admitted the disclosed near-miss into slot 5 (W-STAGE4B).
check(`items.json parses as an array of ${N}`, Array.isArray(items) && N === 8, `${N} items`)
check(`${N} unique itemIds`, new Set(items.map((i: any) => i.itemId)).size === N)
check("every itemId is a server-legal id token", items.every((i: any) => ID_PATTERN.test(i.itemId)))
check("every itemId is a full 40-hex stem", items.every((i: any) => /^[0-9a-f]{40}$/.test(i.itemId)))

const hexes = items.flatMap((i: any) => [
	...ROLES.map((r) => i.palette[r]),
	...(i.palette.gradient?.stops.map((s: any) => s.color) ?? []),
])
check(
	"every hex matches ^#[0-9a-f]{6}$",
	hexes.every((h: string) => HEX.test(h)),
	`${hexes.length} hexes checked, bad: ${hexes.filter((h: string) => !HEX.test(h)).join(",") || "none"}`,
)
check(
	"every imagePath exists under the MAIN checkout",
	items.every((i: any) => fs.existsSync(path.join(MAIN, i.imagePath))),
	`${items.filter((i: any) => fs.existsSync(path.join(MAIN, i.imagePath))).length}/${N} resolve`,
)
check("no imagePath is absolute", items.every((i: any) => !path.isAbsolute(i.imagePath)))
check("every itemId is its imagePath's filename stem", items.every((i: any) => path.basename(i.imagePath).replace(/\.[a-z0-9]+$/i, "") === i.itemId))

const withGradient = items.filter((i: any) => i.palette.gradient !== null)
check(
	"gradient ends are background -> surface",
	withGradient.every((i: any) => {
		const s = i.palette.gradient.stops
		return s[0].color === i.palette.background && s[s.length - 1].color === i.palette.surface
	}),
	`${withGradient.length} gradient items`,
)
check(
	"gradient positions in [0,1] and strictly increasing at 6 dp",
	withGradient.every((i: any) => {
		let prev = -Infinity
		return i.palette.gradient.stops.every((s: any) => {
			const p = canonicalPosition(s.position)
			const ok = p === s.position && p >= 0 && p <= 1 && p > prev
			prev = p
			return ok
		})
	}),
)
check("gradient ends sit at 0 and 1", withGradient.every((i: any) => {
	const s = i.palette.gradient.stops
	return s[0].position === 0 && s[s.length - 1].position === 1
}))
check("gradient stop counts within 2..4", withGradient.every((i: any) => i.palette.gradient.stops.length >= 2 && i.palette.gradient.stops.length <= 4))
check("no gradient carries a non-string geometry", withGradient.every((i: any) => i.palette.gradient.geometry === undefined))
check(
	"every item has both collapse booleans and required fields",
	items.every(
		(i: any) =>
			typeof i.palette.surfaceCollapsed === "boolean" &&
			typeof i.palette.accentCollapsed === "boolean" &&
			ROLES.every((r) => typeof i.palette[r] === "string") &&
			typeof i.itemId === "string" &&
			typeof i.imagePath === "string" &&
			typeof i.variantId === "string",
	),
)
// surfaceCollapsed pairs surface with BACKGROUND; accentCollapsed pairs accent with FOREGROUND.
check(
	"collapse flags agree with hex equality (surface~background, accent~foreground)",
	items.every(
		(i: any) =>
			i.palette.surfaceCollapsed === (i.palette.surface === i.palette.background) &&
			i.palette.accentCollapsed === (i.palette.accent === i.palette.foreground),
	),
)
check(
	"items.json items carry exactly the 5 push keys",
	items.every((i: any) => JSON.stringify(Object.keys(i).sort()) === JSON.stringify(["fingerprint", "imagePath", "itemId", "palette", "variantId"])),
)
check(
	"fingerprint is uniform and names v0.8.2 at c5552f8, dirty false",
	items.every(
		(i: any) =>
			i.variantId === "p5-fieldfit-0.8.2" &&
			i.fingerprint.algorithmVersion === "p5-fieldfit-0.8.2" &&
			i.fingerprint.preprocessingVersion === "sharp-0.33.5/srgb/no-resample" &&
			i.fingerprint.gitCommit === "c5552f8" &&
			i.fingerprint.dirty === false,
	),
)

check("render-data has one entry per itemId", Object.keys(render).length === N && items.every((i: any) => render[i.itemId]))
check(
	"every render entry has 4 named roles in order",
	items.every((i: any) => {
		const rs = render[i.itemId].roles
		return rs.length === 4 && rs.every((r: any, k: number) => r.role === ROLES[k] && typeof r.name === "string" && r.name.length > 0)
	}),
)
check(
	"render hexes and collapse flags match items.json verbatim",
	items.every((i: any) =>
		render[i.itemId].roles.every(
			(r: any, k: number) =>
				r.hex === i.palette[ROLES[k]] &&
				r.collapsed === (ROLES[k] === "surface" ? i.palette.surfaceCollapsed : ROLES[k] === "accent" ? i.palette.accentCollapsed : false),
		) && JSON.stringify(render[i.itemId].gradient) === JSON.stringify(i.palette.gradient),
	),
)
const liveNames = nameHexes(hexes)
check(
	"render names are the current colornames-oklab output",
	items.every((i: any) => render[i.itemId].roles.every((r: any) => r.name === liveNames[r.hex])),
)
check(
	"fieldCss is the pinned renderer's output for every item",
	items.every((i: any) => render[i.itemId].fieldCss === fieldCss(i.palette.gradient, i.palette.background, liveNames)),
)
check(
	"render entries carry exactly roles/gradient/fieldCss",
	Object.values(render).every((v: any) => JSON.stringify(Object.keys(v).sort()) === JSON.stringify(["fieldCss", "gradient", "roles"])),
)

// ---- leak scan
const served = JSON.stringify(render) + JSON.stringify(items.map((i: any) => ({ itemId: i.itemId, imagePath: i.imagePath, palette: i.palette })))
const TOKENS = [
	"p5", "fieldfit", "field-fit", "v0.", "0.3.0", "0.5.1", "0.6.0", "0.8.2", "explf", "nofield",
	"round-1", "round-2", "round-3", "round-4", "round 2", "round 3", "round 4", "before", "after",
	"twoblock", "two-block", "retreat", "component", "smooth", "prototype", "calibration", "diagnos",
	"class", "union", "coverage", "escape", "census", "returning", "fresh",
]
const hits = TOKENS.filter((t) => served.toLowerCase().includes(t))
check("no diagnostics / mechanism labels / version labels in any served field", hits.length === 0, hits.length ? `HITS: ${hits.join(", ")}` : "clean")
// `"round"` is unusable as a token (background/foreground contain it) and `"e2"` is unusable over
// colour DATA (item 7's surface is #d7e2e4). Scanned two ways instead, as round 3 did.
check('the "E2" mechanism label, word-bounded and case-sensitive', !/\bE2\b/.test(served))
const nameText = Object.values(render)
	.flatMap((v: any) => v.roles.map((r: any) => r.name))
	.join(" ")
check('"e2" over the served colour NAMES only (hex-free text)', !nameText.toLowerCase().includes("e2"), `names: ${new Set(nameText.split(" ")).size} words`)

// ---- parser dry run
const batch = {
	batchId: "dry-run-round-4",
	items: items.map((i: any) => ({ ...i, imagePath: path.join(MAIN, i.imagePath) })),
}
try {
	const parsed = parseCalibrationBatch(batch)
	const roundTrip = parsed.items.every((p: any, k: number) => JSON.stringify(p.palette) === JSON.stringify(items[k].palette))
	check(`parseCalibrationBatch OK: ${parsed.items.length} items, purpose ${parsed.purpose}`, parsed.items.length === N)
	check("round-trip identical (palettes byte-identical after parse)", roundTrip)
} catch (e) {
	check("parseCalibrationBatch OK", false, (e as Error).message)
}

console.log(failed === 0 ? "\nALL CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`)
process.exit(failed === 0 ? 0 : 1)
