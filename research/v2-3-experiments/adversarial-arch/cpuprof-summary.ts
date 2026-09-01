/**
 * Summarise a V8 `.cpuprofile`: self time per function, plus per-call-site
 * subtree totals for the functions named on the command line. The per-call-site
 * split is what distinguishes a stage that runs once from the same stage run
 * twice on different evidence.
 *
 *   node --no-warnings --experimental-strip-types \
 *     research/v2-3-experiments/adversarial-arch/cpuprof-summary.ts <file.cpuprofile> [fn...]
 */
import { readFile } from "node:fs/promises"

type ProfileNode = Readonly<{
	id: number
	callFrame: Readonly<{ functionName: string; url: string; lineNumber: number }>
	children?: readonly number[]
}>

type Profile = Readonly<{
	nodes: readonly ProfileNode[]
	startTime: number
	endTime: number
	samples: readonly number[]
	timeDeltas: readonly number[]
}>

const [path, ...targets] = process.argv.slice(2)
if (!path) throw new Error("usage: cpuprof-summary.ts <file.cpuprofile> [fn...]")
const profile: Profile = JSON.parse(await readFile(path, "utf8"))

const byId = new Map(profile.nodes.map((node) => [node.id, node]))
const parentOf = new Map<number, number>()
for (const node of profile.nodes) for (const child of node.children ?? []) parentOf.set(child, node.id)

const selfMicroseconds = new Map<number, number>()
for (let index = 0; index < profile.samples.length; index++) {
	const id = profile.samples[index]
	selfMicroseconds.set(id, (selfMicroseconds.get(id) ?? 0) + (profile.timeDeltas[index] ?? 0))
}

const totalMicroseconds = [...selfMicroseconds.values()].reduce((sum, value) => sum + value, 0)
const share = (microseconds: number): string => `${((microseconds / totalMicroseconds) * 100).toFixed(1)}%`

// Self time aggregated by function name.
const selfByName = new Map<string, number>()
for (const [id, microseconds] of selfMicroseconds) {
	const node = byId.get(id)
	if (!node) continue
	const frame = node.callFrame
	const file = frame.url.split("/").at(-1) ?? ""
	const name = `${frame.functionName || "(anonymous)"} @ ${file}:${frame.lineNumber + 1}`
	selfByName.set(name, (selfByName.get(name) ?? 0) + microseconds)
}

console.log(`total sampled: ${(totalMicroseconds / 1000).toFixed(0)} ms\n`)
console.log("== top self time ==")
for (const [name, microseconds] of [...selfByName].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
	console.log(`${(microseconds / 1000).toFixed(0).padStart(7)} ms  ${share(microseconds).padStart(6)}  ${name}`)
}

// Subtree totals per call-tree node, for the requested function names.
function subtreeMicroseconds(id: number): number {
	let sum = selfMicroseconds.get(id) ?? 0
	for (const child of byId.get(id)?.children ?? []) sum += subtreeMicroseconds(child)
	return sum
}

function callPath(id: number): string {
	const parts: string[] = []
	let current: number | undefined = id
	while (current !== undefined && parts.length < 12) {
		const frame = byId.get(current)?.callFrame
		if (frame) parts.unshift(frame.functionName || "(anonymous)")
		current = parentOf.get(current)
	}
	return parts.join(" > ")
}

if (targets.length > 0) {
	console.log("\n== subtree total per call site ==")
	for (const target of targets) {
		const sites = profile.nodes.filter((node) => node.callFrame.functionName === target)
		if (sites.length === 0) {
			console.log(`\n${target}: not sampled`)
			continue
		}
		console.log(`\n${target}: ${sites.length} call-tree node(s)`)
		let combined = 0
		for (const site of sites.sort((a, b) => subtreeMicroseconds(b.id) - subtreeMicroseconds(a.id))) {
			const microseconds = subtreeMicroseconds(site.id)
			combined += microseconds
			console.log(`  ${(microseconds / 1000).toFixed(0).padStart(7)} ms  ${share(microseconds).padStart(6)}  ${callPath(site.id)}`)
		}
		console.log(`  ${(combined / 1000).toFixed(0).padStart(7)} ms  ${share(combined).padStart(6)}  TOTAL`)
	}
}
