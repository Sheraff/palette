/** Diff two Track G sweep labels, role by role. */
import { readFile } from "node:fs/promises"

const [a, b] = process.argv.slice(2)
if (!a || !b) throw new Error("usage: diff.ts <labelA> <labelB>")
const load = async (label: string) =>
	JSON.parse(await readFile(`${import.meta.dirname}/data/${label}.json`, "utf8")) as Record<string, Record<string, unknown>>
const left = await load(a)
const right = await load(b)

const roles = ["background", "surface", "foreground", "accent", "gradient", "collapse", "midpoint"] as const
let changed = 0
for (const key of Object.keys(left)) {
	const l = left[key]
	const r = right[key]
	if (!r) continue
	const deltas = roles
		.filter((role) => JSON.stringify(l[role]) !== JSON.stringify(r[role]))
		.map((role) => `${role}: ${JSON.stringify(l[role])} -> ${JSON.stringify(r[role])}`)
	if (deltas.length === 0) continue
	changed += 1
	console.log(`${key}\n    ${deltas.join("\n    ")}`)
}
console.log(`\n${changed} of ${Object.keys(left).length} cases differ (${a} -> ${b})`)
