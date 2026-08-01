import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

/** Inclusive (total) time per function, aggregated over all call-tree positions. */
const dir = process.argv[2]
const file = readdirSync(dir).filter((name) => name.endsWith(".cpuprofile")).sort().pop()
const profile = JSON.parse(readFileSync(resolve(dir, file), "utf8"))

const byId = new Map(profile.nodes.map((node) => [node.id, node]))
const parent = new Map()
for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id)

const selfTicks = new Map()
for (const id of profile.samples) selfTicks.set(id, (selfTicks.get(id) ?? 0) + 1)
const totalDelta = profile.timeDeltas.reduce((sum, delta) => sum + Math.max(0, delta), 0)
const perSampleUs = totalDelta / profile.samples.length
const totalTicks = [...selfTicks.values()].reduce((sum, ticks) => sum + ticks, 0)

const name = (node) => {
	const { functionName, url, lineNumber } = node.callFrame
	const shortUrl = (url ?? "").replace(/^file:\/\//, "").split("/").slice(-2).join("/")
	return `${functionName || "(anonymous)"} @ ${shortUrl}:${lineNumber + 1}`
}

// Inclusive time: a sample counts for every distinct function on its ancestor chain.
const inclusive = new Map()
for (const [id, ticks] of selfTicks) {
	const seen = new Set()
	for (let cursor = id; cursor !== undefined; cursor = parent.get(cursor)) {
		const node = byId.get(cursor)
		if (!node) break
		const key = name(node)
		if (!seen.has(key)) {
			seen.add(key)
			inclusive.set(key, (inclusive.get(key) ?? 0) + ticks)
		}
	}
}

const filter = process.argv[3]
console.log("=== inclusive time (top 35) ===")
for (const [label, ticks] of [...inclusive].sort((a, b) => b[1] - a[1])
	.filter(([label]) => !filter || label.includes(filter)).slice(0, 35)) {
	console.log(`${((ticks / totalTicks) * 100).toFixed(1).padStart(6)}%  ${(ticks * perSampleUs / 1000).toFixed(0).padStart(7)}ms  ${label}`)
}
