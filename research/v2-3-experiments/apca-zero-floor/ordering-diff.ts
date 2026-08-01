/**
 * Which artworks' repairs changed when level 2b's ordering was flipped from "the ranking's best" to
 * "nearest the published palette"?
 *
 * The flip carries a reviewed verdict on one artwork, so the honest thing is to show every artwork it
 * moved — not just the one review looked at — and to confirm the artworks whose repairs review
 * already approved did not move with it.
 *
 * Usage: ordering-diff.ts --before <dir> --after <dir> [--configs a,b]
 */
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseArgs } from "node:util"

const { values } = parseArgs({
	options: { before: { type: "string" }, after: { type: "string" }, configs: { type: "string" } },
	strict: true,
})

type Published = {
	background: string; surface: string; foreground: string; accent: string
	gradient: boolean; midpoint: string | null; outcome: string
}
const load = (root: string) => {
	const rows = new Map<string, Record<string, Published>>()
	for (const file of readdirSync(resolve(root)).sort()) {
		if (!file.endsWith(".jsonl")) continue
		for (const line of readFileSync(resolve(root, file), "utf8").split("\n")) {
			if (!line.trim()) continue
			try {
				const row = JSON.parse(line)
				if (row.configurations) rows.set(row.path, row.configurations)
			} catch { /* torn trailing line */ }
		}
	}
	return rows
}

const before = load(values.before!)
const after = load(values.after!)
const configurations = values.configs
	? values.configs.split(",")
	: [...new Set([...after.values()].flatMap((entry) => Object.keys(entry)))]

const summarise = (palette: Published) =>
	`bg=${palette.background} surface=${palette.surface} fg=${palette.foreground} accent=${palette.accent}` +
	` ${palette.gradient ? "gradient" : "flat"} midpoint=${palette.midpoint ?? "none"}`
const key = (palette: Published) => summarise(palette)

for (const name of configurations) {
	const changed: string[] = []
	let compared = 0
	for (const [path, configs] of after) {
		const a = configs[name]
		const b = before.get(path)?.[name]
		if (!a || !b) continue
		compared += 1
		if (key(a) !== key(b)) {
			changed.push(`  ${path.split("/").slice(-2).join("/")}\n` +
				`    was  [${b.outcome.padEnd(7)}] ${summarise(b)}\n` +
				`    now  [${a.outcome.padEnd(7)}] ${summarise(a)}`)
		}
	}
	process.stdout.write(`\n=== ${name}: ${changed.length} of ${compared} artworks publish a different palette ===\n`)
	for (const line of changed) process.stdout.write(`${line}\n`)
}
