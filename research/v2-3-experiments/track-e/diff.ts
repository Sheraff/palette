import { readFile } from "node:fs/promises"

const [a, b] = process.argv.slice(2)
const load = async (label: string): Promise<Record<string, Record<string, unknown>>> =>
	JSON.parse(await readFile(`${import.meta.dirname}/data/${label}.json`, "utf8"))
const first = await load(a)
const second = await load(b)
const roles = ["background", "surface", "foreground", "accent", "gradient", "midpoint"]
let differ = 0
for (const key of Object.keys(first)) {
	const left = first[key]
	const right = second[key]
	if (!right) { console.log(`${key}: missing in ${b}`); continue }
	const changed = roles.filter((role) => JSON.stringify(left[role]) !== JSON.stringify(right[role]))
	if (changed.length === 0) continue
	differ += 1
	console.log(`${key}`)
	for (const role of changed) console.log(`   ${role.padEnd(11)} ${JSON.stringify(left[role])} -> ${JSON.stringify(right[role])}`)
}
console.log(`\n${Object.keys(first).length} case(s) compared, ${differ} differ`)
