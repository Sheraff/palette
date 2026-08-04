// Rank a robustness report's disagreements by how far the worst role moved, in bar multiples
// and in raw OKLab distance. Usage: node worst-disagreements.mjs <report.json> [n]
import { readFileSync } from "node:fs"

const [, , reportPath, nRaw] = process.argv
const n = Number(nRaw ?? 10)
const report = JSON.parse(readFileSync(reportPath, "utf8"))

const rows = report.disagreements.map((d) => {
	const moved = d.comparison.comparisons.filter((c) => !c.same)
	const worst = moved.reduce((a, b) => (b.distance > a.distance ? b : a), moved[0])
	return {
		trialId: d.trialId,
		kind: d.kind,
		arm: d.arm,
		reviewedness: d.reviewedness,
		collection: d.collection,
		left: d.leftPath,
		right: d.rightPath,
		roles: d.comparison.disagreeingRoles.join("+"),
		worstRole: worst.role,
		worstOklab: worst.distance,
		worstBarRatio: d.comparison.worstRoleBarRatio,
		hexes: `${worst.left} -> ${worst.right}`,
	}
})

rows.sort((a, b) => b.worstOklab - a.worstOklab)

console.log(`disagreements: ${rows.length}`)
console.log("\n--- top by raw OKLab movement of the worst role ---")
for (const r of rows.slice(0, n)) {
	console.log(
		`${r.worstOklab.toFixed(4)} oklab (${r.worstBarRatio.toFixed(1)}x bar)  ${r.kind}${r.arm ? "/" + r.arm : ""}  roles=${r.roles}  worst=${r.worstRole} ${r.hexes}`,
	)
	console.log(`    L ${r.left}`)
	console.log(`    R ${r.right}`)
}

const byRoleSet = {}
const byWorstRole = {}
const byArm = {}
for (const r of rows) {
	byRoleSet[r.roles] = (byRoleSet[r.roles] ?? 0) + 1
	byWorstRole[r.worstRole] = (byWorstRole[r.worstRole] ?? 0) + 1
	const k = `${r.kind}${r.arm ? "/" + r.arm : ""}`
	byArm[k] = (byArm[k] ?? 0) + 1
}
const show = (label, obj) => {
	console.log(`\n${label}`)
	for (const [k, v] of Object.entries(obj).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`)
}
show("disagreeing-role sets", byRoleSet)
show("worst role", byWorstRole)
show("by trial kind/arm", byArm)

// distribution of worst-role movement
const ds = rows.map((r) => r.worstOklab).sort((a, b) => a - b)
const q = (p) => ds[Math.min(ds.length - 1, Math.floor(p * ds.length))]
console.log(
	`\nworst-role OKLab movement: p10 ${q(0.1).toFixed(4)} · median ${q(0.5).toFixed(4)} · p90 ${q(0.9).toFixed(4)} · max ${ds[ds.length - 1].toFixed(4)}`,
)
const marginal = rows.filter((r) => r.worstBarRatio < 2).length
console.log(`disagreements under 2x the bar (marginal): ${marginal} of ${rows.length}`)
