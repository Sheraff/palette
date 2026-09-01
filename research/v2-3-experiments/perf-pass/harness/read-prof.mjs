import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

/** Aggregate a --cpu-prof .cpuprofile into self-time per function, and per file. */
const dir = process.argv[2]
const file = readdirSync(dir).filter((name) => name.endsWith(".cpuprofile")).sort().pop()
const profile = JSON.parse(readFileSync(resolve(dir, file), "utf8"))

const byId = new Map(profile.nodes.map((node) => [node.id, node]))
const selfTicks = new Map()
for (const id of profile.samples) selfTicks.set(id, (selfTicks.get(id) ?? 0) + 1)

const totalDelta = profile.timeDeltas.reduce((sum, delta) => sum + Math.max(0, delta), 0)
const perSampleUs = totalDelta / profile.samples.length

const byFunction = new Map()
const byFile = new Map()
for (const [id, ticks] of selfTicks) {
	const node = byId.get(id)
	if (!node) continue
	const { functionName, url, lineNumber } = node.callFrame
	const shortUrl = (url ?? "").replace(/^file:\/\//, "").split("/").slice(-2).join("/")
	const key = `${functionName || "(anonymous)"} @ ${shortUrl}:${lineNumber + 1}`
	byFunction.set(key, (byFunction.get(key) ?? 0) + ticks)
	byFile.set(shortUrl || "(native)", (byFile.get(shortUrl || "(native)") ?? 0) + ticks)
}

const totalTicks = [...selfTicks.values()].reduce((sum, ticks) => sum + ticks, 0)
const ms = (ticks) => (ticks * perSampleUs / 1000).toFixed(0)
const pct = (ticks) => ((ticks / totalTicks) * 100).toFixed(1)

console.log(`total ~${ms(totalTicks)}ms of samples across ${totalTicks} samples\n`)
console.log("=== self time by file ===")
for (const [name, ticks] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
	console.log(`${pct(ticks).padStart(6)}%  ${ms(ticks).padStart(7)}ms  ${name}`)
}
console.log("\n=== self time by function (top 40) ===")
for (const [name, ticks] of [...byFunction].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
	console.log(`${pct(ticks).padStart(6)}%  ${ms(ticks).padStart(7)}ms  ${name}`)
}
