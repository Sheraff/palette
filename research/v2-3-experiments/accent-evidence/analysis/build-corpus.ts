/**
 * Build the blast-radius corpus: every verdict-carrying artwork plus the off-panel manifest,
 * resolved to ABSOLUTE paths in the shared checkout (the worktree's own `images/` holds only
 * `-scrambled` decoys and is never used).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const SHARED = "/Users/Flo/GitHub/palette"
const EVAL = `${SHARED}/research/v2-3-eval`

const verdicts = readFileSync(`${EVAL}/data/verdicts.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l))
const wanted = new Set<string>()
for (const v of verdicts) if (v.image) wanted.add(v.image)

// resolve image -> repo-relative path from the batch files
const paths = new Map<string, string>()
for (const f of readdirSync(`${EVAL}/data/batches`)) {
	if (!f.endsWith(".json") || f.endsWith(".key.json")) continue
	const b = JSON.parse(readFileSync(`${EVAL}/data/batches/${f}`, "utf8"))
	for (const item of b.items ?? []) if (item.image && item.imagePath) paths.set(item.image, item.imagePath)
}

const invalid = new Set(readFileSync(`${EVAL}/data/invalid-artworks.txt`, "utf8").trim().split("\n").filter(Boolean))
const offpanel = readFileSync(`${EVAL}/data/offpanel-manifest.txt`, "utf8").trim().split("\n").filter(Boolean)

const chosen: { image: string; abs: string; group: string }[] = []
const missing: string[] = []
const seen = new Set<string>()

function push(image: string, rel: string | undefined, group: string) {
	if (seen.has(image)) return
	let abs: string | null = null
	const cands: string[] = []
	if (rel) cands.push(resolve(SHARED, rel))
	const bare = image.replace(/\.(jpg|jpeg|png|webp|avif)$/i, "")
	for (const e of ["", ".jpg", ".jpeg", ".png", ".webp", ".avif"]) {
		cands.push(resolve(SHARED, "images", bare + e))
		if (bare.length > 20) cands.push(resolve(SHARED, bare.slice(18, 20), bare + e))
	}
	for (const c of cands) if (existsSync(c) && !c.includes("-scrambled.")) { abs = c; break }
	if (!abs) { missing.push(image); return }
	seen.add(image)
	chosen.push({ image, abs, group })
}

// The 34 byte-pinned parity fixtures, always, so the guardrail check is complete even for the
// fixtures no review batch ever used.
const fixtureSrc = readFileSync(resolve(SHARED, "research/v2-3/test/review-fixtures.ts"), "utf8")
for (const m of fixtureSrc.matchAll(/file:\s*"([^"]+)"/g)) {
	const rel = m[1]
	push(rel.split("/").pop()!, rel, "fixture")
}

for (const image of [...wanted].sort()) {
	if ([...invalid].some((i) => image.startsWith(i.split("/")[1] ?? "\0"))) continue
	push(image, paths.get(image), "verdict")
}
for (const rel of offpanel) {
	if (invalid.has(rel) || invalid.has(rel.replace(/\.jpg$/, ""))) continue
	const image = (rel.split("/")[1] ?? rel).replace(/\.(jpg|jpeg|png|webp|avif)$/i, "")
	push(image, rel, "offpanel")
}

// A fresh off-panel sample on top of the manifest, so the blast radius is measured on artworks no
// review has ever seen. Deterministic: every bucket contributes its ASCII-first unseen entries,
// round-robin, until the quota is met.
const QUOTA = 70
const buckets = readdirSync(SHARED).filter((d) => /^[0-9a-f]{2}$/.test(d)).sort()
const pools = buckets.map((b) => {
	try {
		return readdirSync(resolve(SHARED, b)).filter((f) => !f.includes("-scrambled.")).sort()
			.map((f) => ({ bucket: b, file: f }))
	} catch { return [] }
})
let added = 0
for (let depth = 0; added < QUOTA; depth++) {
	let any = false
	for (const pool of pools) {
		if (depth >= pool.length) continue
		any = true
		const { bucket, file } = pool[depth]
		const image = file.replace(/\.(jpg|jpeg|png|webp|avif)$/i, "")
		if (seen.has(image) || invalid.has(`${bucket}/${image}`)) continue
		const before = chosen.length
		push(image, `${bucket}/${file}`, "offpanel-fresh")
		if (chosen.length > before) added++
		if (added >= QUOTA) break
	}
	if (!any) break
}

console.error(`verdict-carrying: ${chosen.filter((c) => c.group === "verdict").length}`)
console.error(`off-panel-fresh:  ${chosen.filter((c) => c.group === "offpanel-fresh").length}`)
console.error(`off-panel:        ${chosen.filter((c) => c.group === "offpanel").length}`)
console.error(`total:            ${chosen.length}`)
if (missing.length) console.error(`UNRESOLVED (${missing.length}): ${missing.join(", ")}`)
if (process.argv[2] === "--list") process.stdout.write(chosen.map((c) => c.abs).join(",") + "\n")
else process.stdout.write(JSON.stringify(chosen, null, 1) + "\n")
