/**
 * Guardrail check across two swept labels.
 *
 * The named outcomes an accent-ranking change must byte-preserve or predict-and-quote.
 * Standing verdicts are read latest-wins from the LIVE warehouse.
 */
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const here = new URL(".", import.meta.url).pathname
const worktreeRoot = resolve(here, "../../../..")
const resultsRoot = resolve(worktreeRoot, "research/v2-3-eval/data/results")

type Guard = { image: string; what: string; expect?: Partial<Record<"background" | "surface" | "foreground" | "accent", string>> }
const GUARDS: Guard[] = [
	{ image: "krafty.jpg", what: "batch review-7: golden mango foreground; the case `identityForegroundClaimMargin` exists for", expect: { background: "#050306", surface: "#680b3a", foreground: "#f7a223", accent: "#eb0a8a" } },
	{ image: "slim.jpg", what: "parity fixture; #37c2eb foreground", expect: { background: "#01040b", surface: "#140e18", foreground: "#37c2eb", accent: "#df2a33" } },
	{ image: "johns.jpg", what: "sailor blue #315a92 surface (batch-25/26 strong)", expect: { background: "#0d181c", surface: "#315a92", foreground: "#f7f8fa", accent: "#ff5a62" } },
	{ image: "ab67616d0000b273000d5cdbc67ed815efc360ad", what: "0d5cdb: gold #f7de67 fg + red #f22632 accent, batch-28 strong (latest wins over batch-27's #cd1227 ask)", expect: { foreground: "#f7de67", accent: "#f22632" } },
	// NOT pinned to batch-30's field. batch-30 endorsed `sk-on` (#100702 / #291107), but batch-31 —
	// LATER, and therefore authoritative under the charter's verdict-recency rule — graded the same
	// artwork `acceptable` and corrected the field to #040301 / #491600. Pinning batch-30 here is
	// exactly the "protecting an outcome a later batch reversed" mistake the charter records.
	{ image: "ab67616d00001e02000a8aa1dafa651976a7bb44", what: "batch-30 `sk-on`, SUPERSEDED by batch-31's field correction to #040301/#491600" },
	{ image: "nobs.jpg", what: "parity fixture; batch-31 graded ra-off strong", expect: { background: "#f6ffff", surface: "#f2f626", foreground: "#a1162d", accent: "#0695fd" } },
	{ image: "skap.jpg", what: "parity fixture; the one-hue-one-direction principle's namesake", expect: { background: "#ffffff", surface: "#5d763c", foreground: "#000103", accent: "#be814b" } },
	{ image: "black.jpg", what: "reviewed two-colour collapse (cited against identityAuthority)" },
	{ image: "ab67616d00001e02000564718f605c1f326b2ca2", what: "batch-30 strong" },
	{ image: "ab67616d00001e020006eb2197bdb0a7b9392108", what: "batch-30 strong" },
	{ image: "ab67616d0000b273000442caec7ec8cb724bf265", what: "batch-30 strong" },
	{ image: "ab67616d00001e020010b864b2a925ec6bfaa30e", what: "batch-31 strong (idx 243)" },
	{ image: "ab67616d00001e02000c3523d80259b49a06ee45", what: "batch-31 strong (idx 242)" },
	{ image: "ab67616d0000b2730005a91812c85db291ea5d85", what: "batch-31 strong (id corrected: the inherited list had the wrong 8-char prefix)" },
	{ image: "ab67616d00001e020013bebcaee941ebcc13437c", what: "batch-31 + batch-32 strong (id corrected: the inherited list had a nonexistent suffix)" },
]

const [a, b] = process.argv.slice(2)
const ROLES = ["background", "surface", "foreground", "accent"] as const
function read(label: string, image: string) {
	const p = resolve(resultsRoot, label, `${image}.json`)
	if (!existsSync(p)) return null
	return JSON.parse(readFileSync(p, "utf8"))
}

console.log(`guardrails: ${a} -> ${b}\n`)
let preserved = 0, moved = 0, absent = 0
for (const g of GUARDS) {
	const ra = read(a, g.image), rb = read(b, g.image)
	if (!ra || !rb) { console.log(`  [absent from sweep] ${g.image}  — ${g.what}`); absent++; continue }
	const wa = ra.extraction.winner, wb = rb.extraction.winner
	const changed = ROLES.filter((r) => wa[r].hex !== wb[r].hex)
	const gradFlip = wa.gradient !== wb.gradient
	const expectOk = g.expect ? Object.entries(g.expect).every(([r, hex]) => wb[r].hex === hex) : null
	const expectOkA = g.expect ? Object.entries(g.expect).every(([r, hex]) => wa[r].hex === hex) : null
	if (changed.length === 0 && !gradFlip) {
		preserved++
		console.log(`  BYTE-PRESERVED  ${g.image}${g.expect ? `  [expected roles held in both arms: ${expectOkA && expectOk}]` : ""}`)
	} else {
		moved++
		console.log(`  *** MOVED ***   ${g.image}   — ${g.what}`)
		for (const r of changed) console.log(`        ${r}: ${wa[r].hex} -> ${wb[r].hex}`)
		if (gradFlip) console.log(`        gradient: ${wa.gradient} -> ${wb.gradient}`)
		if (g.expect) console.log(`        pinned roles still held after the change: ${expectOk} (before: ${expectOkA})`)
	}
}
console.log(`\n${preserved} byte-preserved, ${moved} moved, ${absent} not in the sweep corpus`)
