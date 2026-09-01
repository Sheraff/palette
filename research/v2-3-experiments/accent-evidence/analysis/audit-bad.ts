/**
 * Hand-audit dossier for every mover the destination adjudicator scores REGRESSION or KNOWN-BAD.
 *
 * Prints, per artwork: the OFF palette, the ON palette, the full warehouse history (every record,
 * every palette shown, the verdict, the stated preference, the corrections and the note), so each
 * call can be checked by a human rather than trusted.
 *
 *   node --experimental-strip-types audit-bad.ts <offLabel> <onLabel> <image-substring>...
 * With no image arguments it prints the dossier for every artwork the arm moves that carries any
 * warehouse record at all.
 */
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = "/Users/Flo/GitHub/palette"
const [offLabel, onLabel, ...want] = process.argv.slice(2)
const here = new URL(".", import.meta.url).pathname
const resultsRoot = resolve(here, "../../../..", "research/v2-3-eval/data/results")
const ROLES = ["background", "surface", "foreground", "accent"] as const

function load(label: string) {
	const out = new Map<string, any>()
	for (const f of readdirSync(resolve(resultsRoot, label))) {
		if (!f.endsWith(".json")) continue
		const r = JSON.parse(readFileSync(resolve(resultsRoot, label, f), "utf8"))
		out.set(r.image, r.extraction.winner)
	}
	return out
}
const OFF = load(offLabel), ON = load(onLabel)
const bare = (s: unknown) => typeof s === "string" ? s.replace(/\.(jpg|jpeg|png|webp|avif)$/i, "") : ""
const records = readFileSync(`${ROOT}/research/v2-3-eval/data/verdicts.jsonl`, "utf8")
	.trim().split("\n").map((l, i) => ({ ...JSON.parse(l), line: i }))
const byImage = new Map<string, any[]>()
for (const r of records) {
	const k = bare(r.image); if (!k) continue
	if (!byImage.has(k)) byImage.set(k, []); byImage.get(k)!.push(r)
}
const show = (p: any) => p ? ROLES.map((r) => p[r]?.hex ?? "?").join(" ") +
	(p.gradient !== undefined ? ` grad=${p.gradient}` : "") : "(none)"

for (const [image, off] of OFF) {
	const on = ON.get(image)
	if (!on) continue
	const moved = ROLES.filter((r) => off[r].hex !== on[r].hex)
	if (moved.length === 0 && off.gradient === on.gradient) continue
	const rs = byImage.get(bare(image)) ?? []
	if (want.length > 0 && !want.some((w) => image.includes(w))) continue
	if (want.length === 0 && rs.length === 0) continue
	process.stdout.write(`\n${"=".repeat(100)}\n${image}   moved: ${moved.join("+")}` +
		`${off.gradient !== on.gradient ? ` +gradient(${off.gradient}->${on.gradient})` : ""}\n`)
	process.stdout.write(`  OFF (trunk) ${show(off)}\n  ON  (arm)   ${show(on)}\n`)
	process.stdout.write(`  warehouse: ${rs.length} record(s)\n`)
	for (const r of rs) {
		const pref = r.preference?.side ? `${r.preference.side}=${r.preference.label}` : "NO PREFERENCE"
		process.stdout.write(`   - line ${r.line} ${String(r.batch).padEnd(24)} ${String(r.verdict).padEnd(14)} ${pref}\n`)
		for (const [lab, p] of Object.entries(r.palettes ?? {})) {
			const mark = r.preference?.label === lab ? " <-- preferred" : ""
			process.stdout.write(`       ${lab.padEnd(16)} ${show(p)}${mark}\n`)
		}
		if (r.corrections && Object.keys(r.corrections).length) {
			process.stdout.write(`       corrections: ${JSON.stringify(r.corrections)}\n`)
		}
		if (r.notes) process.stdout.write(`       note: ${String(r.notes).replace(/\n/g, " ")}\n`)
	}
}
