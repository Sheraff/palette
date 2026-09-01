/**
 * Destination adjudication for every mover.
 *
 * For each artwork the arm moves, ask the LIVE warehouse what it thinks of where the palette
 * landed — not just whether it moved. Every role is compared at the repo's own `sameColor` bar.
 *
 *   node --experimental-strip-types destinations.ts <offLabel> <onLabel>
 *
 * Classification, per artwork, latest-wins:
 *   ENDORSED     the ON palette agrees with the standing endorsement on every role that moved
 *   CORRECTION   a moved role lands on a hex the reviewer wrote as a correction for that role
 *   REGRESSION   the OFF palette agreed with the standing endorsement on a moved role and ON does not
 *   KNOWN-BAD    a moved role lands on a hex a verdict graded `unacceptable`, or on the losing side
 *                of a decisive preference, for that same role
 *   UNADJUDICATED  no verdict on this artwork speaks to the roles that moved
 *
 * CORPUS/WAREHOUSE: reads the live warehouse only. No image is read here — it is arithmetic over
 * recorded hexes plus the swept extractions.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = "/Users/Flo/GitHub/palette"
const WAREHOUSE = `${ROOT}/research/v2-3-eval/data/verdicts.jsonl`
const [offLabel, onLabel] = process.argv.slice(2)
if (!offLabel || !onLabel) throw new Error("usage: destinations.ts <offLabel> <onLabel>")

const here = new URL(".", import.meta.url).pathname
const resultsRoot = resolve(here, "../../../..", "research/v2-3-eval/data/results")
const corpus = JSON.parse(readFileSync(resolve(here, "corpus.json"), "utf8")) as
	{ image: string; abs: string; group: string }[]
const groupOf = new Map(corpus.map((c) => [c.image, c.group]))

const ROLES = ["background", "surface", "foreground", "accent"] as const
type Role = typeof ROLES[number]

function rgb(hex: string): [number, number, number] {
	const h = hex.replace("#", "")
	return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
/** CIE76 in Lab, the bar the brief names; `< 3.3` is the repo's own `sameColor` threshold. */
function deltaE(a: string, b: string): number {
	const toLab = (c: string): [number, number, number] => {
		const f = (v: number) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
		const [r, g, bl] = rgb(c).map(f) as [number, number, number]
		const X = (0.4124 * r + 0.3576 * g + 0.1805 * bl) / 0.95047
		const Y = 0.2126 * r + 0.7152 * g + 0.0722 * bl
		const Z = (0.0193 * r + 0.1192 * g + 0.9505 * bl) / 1.08883
		const h = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29)
		const [fx, fy, fz] = [h(X), h(Y), h(Z)]
		return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
	}
	const [la, aa, ba] = toLab(a), [lb, ab, bb] = toLab(b)
	return Math.hypot(la - lb, aa - ab, ba - bb)
}
const same = (a: string | undefined, b: string | undefined) =>
	a !== undefined && b !== undefined && deltaE(a, b) < 3.3

type Winner = Record<Role, { hex: string }> & { gradient: boolean }
function load(label: string): Map<string, Winner> {
	const out = new Map<string, Winner>()
	const dir = resolve(resultsRoot, label)
	for (const f of readdirSync(dir)) {
		if (!f.endsWith(".json")) continue
		const r = JSON.parse(readFileSync(resolve(dir, f), "utf8"))
		out.set(r.image, r.extraction.winner)
	}
	return out
}
const OFF = load(offLabel), ON = load(onLabel)

const records = readFileSync(WAREHOUSE, "utf8").trim().split("\n").map((l, i) => ({ ...JSON.parse(l), line: i }))
/** Warehouse image ids sometimes carry an extension and sometimes not; normalise both ways. */
const bare = (s: string | null | undefined) =>
	typeof s === "string" ? s.replace(/\.(jpg|jpeg|png|webp|avif)$/i, "") : ""
const byImage = new Map<string, any[]>()
for (const r of records) {
	const k = bare(r.image)
	if (k === "") continue
	if (!byImage.has(k)) byImage.set(k, [])
	byImage.get(k)!.push(r)
}

type Evidence = {
	/** role -> hexes the LATEST verdict endorses (preferred side, or corrections which override) */
	endorsed: Partial<Record<Role, string[]>>
	/** role -> hexes some verdict rejected: unacceptable grades, and losing sides of a decisive preference */
	rejected: Partial<Record<Role, string[]>>
	corrections: Partial<Record<Role, string>>
	latestBatch: string | null
	latestVerdict: string | null
	recordCount: number
	/** roles the latest record showed two ways and the reviewer declined to choose between */
	tied: Set<Role>
	/** roles where the latest record is a STATED preference between two palettes that differed there */
	contested: Set<Role>
}

function evidenceFor(image: string): Evidence {
	const rs = byImage.get(bare(image)) ?? []
	const ev: Evidence = { endorsed: {}, rejected: {}, corrections: {}, latestBatch: null, latestVerdict: null, recordCount: rs.length, tied: new Set<Role>(), contested: new Set<Role>() }
	if (rs.length === 0) return ev
	const push = (map: Partial<Record<Role, string[]>>, role: Role, hex: string) => {
		if (!hex) return
		;(map[role] ??= []).push(hex)
	}
	// Rejections accumulate over all records: a palette graded unacceptable stays bad.
	for (const r of rs) {
		if (r.verdict === "unacceptable") {
			for (const p of Object.values(r.palettes ?? {}) as any[]) {
				for (const role of ROLES) if (p?.[role]?.hex) push(ev.rejected, role, p[role].hex)
			}
		}
	}
	// Endorsement is latest-wins: only the newest record on this artwork speaks.
	const last = rs[rs.length - 1]
	ev.latestBatch = last.batch ?? null
	ev.latestVerdict = last.verdict ?? null
	// A two-sided record with NO stated preference endorses neither side on the roles where the two
	// sides differ — the reviewer looked and declined to choose. Treating the alphabetically-first
	// label as an endorsement manufactures a regression out of an explicit tie, which is exactly the
	// mistake this arm's first pass made on `0007cc8b` and `0009d178`.
	const paletteCount = Object.keys(last.palettes ?? {}).length
	const stated: string | null = last.preference?.side ? (last.preference.label ?? null) : null
	const prefLabel: string | null = stated ?? (paletteCount === 1 ? Object.keys(last.palettes)[0] : null)
	const prefPalette = prefLabel ? last.palettes?.[prefLabel] : null
	const tiedRoles = new Set<Role>()
	if (stated === null && paletteCount === 2) {
		const [x, y] = Object.keys(last.palettes)
		for (const role of ROLES) {
			const a = last.palettes[x]?.[role]?.hex, b = last.palettes[y]?.[role]?.hex
			if (a && b && !same(a, b)) tiedRoles.add(role)
			// where both sides agree, the shared value IS endorsed by the grade
			else if (a && (last.verdict === "strong" || last.verdict === "acceptable")) push(ev.endorsed, role, a)
		}
	}
	if (prefPalette && (last.verdict === "strong" || last.verdict === "acceptable")) {
		for (const role of ROLES) if (prefPalette[role]?.hex) push(ev.endorsed, role, prefPalette[role].hex)
	}
	ev.tied = tiedRoles
	// A correction overrides the endorsement on the role it names, and marks the replaced hex bad.
	for (const role of ROLES) {
		const c = last.corrections?.[role]
		if (typeof c === "string" && c) {
			ev.corrections[role] = c
			ev.endorsed[role] = [c]
			if (prefPalette?.[role]?.hex) push(ev.rejected, role, prefPalette[role].hex)
		}
	}
	// The losing side of a decisive preference is rejected on the roles where the two sides differ.
	if (stated && last.palettes && paletteCount === 2) {
		const other = Object.keys(last.palettes).find((k) => k !== stated)
		if (other) for (const role of ROLES) {
			const win = last.palettes[stated]?.[role]?.hex, lose = last.palettes[other]?.[role]?.hex
			if (win && lose && !same(win, lose)) { push(ev.rejected, role, lose); ev.contested.add(role) }
		}
	}
	return ev
}

type Row = {
	image: string; group: string; movedRoles: Role[]
	klass: "ENDORSED" | "CORRECTION" | "REGRESSION-DECISIVE" | "REGRESSION-SAMPLE" | "KNOWN-BAD" | "TIED" | "UNADJUDICATED"
	detail: string; latestBatch: string | null; latestVerdict: string | null; records: number
}
const rows: Row[] = []
for (const [image, off] of OFF) {
	const on = ON.get(image)
	if (!on) continue
	const movedRoles = ROLES.filter((r) => off[r].hex !== on[r].hex)
	const gradientMoved = off.gradient !== on.gradient
	if (movedRoles.length === 0 && !gradientMoved) continue
	const ev = evidenceFor(image)
	const notes: string[] = []
	let klass: Row["klass"] = "UNADJUDICATED"

	const hitsBad = movedRoles.filter((r) => (ev.rejected[r] ?? []).some((h) => same(h, on[r].hex)))
	const hitsCorrection = movedRoles.filter((r) => ev.corrections[r] && same(ev.corrections[r], on[r].hex))
	const onAgrees = movedRoles.filter((r) => (ev.endorsed[r] ?? []).some((h) => same(h, on[r].hex)))
	const offAgreed = movedRoles.filter((r) => !ev.tied.has(r) && (ev.endorsed[r] ?? []).some((h) => same(h, off[r].hex)))

	if (hitsCorrection.length > 0) {
		klass = "CORRECTION"
		notes.push(`lands on the recorded correction for ${hitsCorrection.join("+")}`)
	} else if (hitsBad.length > 0) {
		klass = "KNOWN-BAD"
		notes.push(`${hitsBad.join("+")} lands on a hex a verdict rejected`)
	} else if (offAgreed.length > 0 && onAgrees.length < offAgreed.length) {
		const decisive = offAgreed.filter((r) => ev.contested.has(r))
		klass = decisive.length > 0 ? "REGRESSION-DECISIVE" : "REGRESSION-SAMPLE"
		notes.push(decisive.length > 0
			? `OFF holds ${decisive.join("+")}, which a STATED preference decided; ON leaves it`
			: `OFF matches a one-sided endorsed sample on ${offAgreed.join("+")}; ON's destination was never shown`)
	} else if (onAgrees.length === movedRoles.length && movedRoles.length > 0) {
		klass = "ENDORSED"
		notes.push(`every moved role (${movedRoles.join("+")}) matches the standing endorsement`)
	} else if (onAgrees.length > 0) {
		klass = "ENDORSED"
		notes.push(`${onAgrees.join("+")} matches the standing endorsement; ${movedRoles.filter((r) => !onAgrees.includes(r)).join("+")} unspoken`)
	} else if (movedRoles.every((r) => ev.tied.has(r)) && movedRoles.length > 0) {
		klass = "TIED"
		notes.push(`the latest record showed ${movedRoles.join("+")} both ways and the reviewer chose neither`)
	} else if (ev.recordCount === 0) {
		notes.push("no warehouse record for this artwork")
	} else {
		notes.push(`${ev.recordCount} record(s), none speak to ${movedRoles.join("+")}`)
	}
	if (gradientMoved) notes.push(`gradient ${off.gradient} -> ${on.gradient}`)
	rows.push({
		image, group: groupOf.get(image) ?? "?", movedRoles, klass,
		detail: notes.join("; "), latestBatch: ev.latestBatch, latestVerdict: ev.latestVerdict, records: ev.recordCount,
	})
}

rows.sort((a, b) => a.klass.localeCompare(b.klass) || a.image.localeCompare(b.image))
const tally: Record<string, number> = {}
for (const r of rows) tally[r.klass] = (tally[r.klass] ?? 0) + 1
process.stdout.write(`destination adjudication: ${offLabel} -> ${onLabel}\n`)
process.stdout.write(`warehouse: ${records.length} records\n`)
process.stdout.write(`movers: ${rows.length}\n\n`)
for (const r of rows) {
	process.stdout.write(`${r.klass.padEnd(14)} ${r.image.slice(-24)} ${r.group.padEnd(15)} ` +
		`${(r.latestBatch ?? "-").padEnd(18)} ${(r.latestVerdict ?? "-").padEnd(14)} ${r.detail}\n`)
}
process.stdout.write(`\n${JSON.stringify(tally, null, 1)}\n`)
const adjudicated = rows.length - (tally["UNADJUDICATED"] ?? 0)
process.stdout.write(`adjudicated destinations: ${adjudicated}/${rows.length}; ` +
	`good (ENDORSED+CORRECTION) ${(tally["ENDORSED"] ?? 0) + (tally["CORRECTION"] ?? 0)}, ` +
	`bad-decisive (KNOWN-BAD+REGRESSION-DECISIVE) ${(tally["KNOWN-BAD"] ?? 0) + (tally["REGRESSION-DECISIVE"] ?? 0)}, ` +
	`bad-unseen (REGRESSION-SAMPLE) ${tally["REGRESSION-SAMPLE"] ?? 0}\n`)
