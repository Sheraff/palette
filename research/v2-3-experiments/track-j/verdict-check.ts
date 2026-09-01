/**
 * Mine `research/v2-3-eval/data/verdicts.jsonl` and report, for every artwork a
 * human has judged, which recorded palettes a sweep still reproduces.
 *
 * A verdict is a fact about a specific set of four hexes, so "preserved" is a
 * question about *palettes*, not about labels: for each reviewed image this
 * prints the arrangement the sweep now produces and whether that arrangement
 * carries a verdict, plus what the arrangement was before.
 *
 * usage: verdict-check.ts <beforeLabel> <afterLabel>
 */
import { readFile } from "node:fs/promises"

const [beforeLabel, afterLabel] = process.argv.slice(2)
if (!beforeLabel || !afterLabel) throw new Error("usage: verdict-check.ts <before> <after>")

type Row = Readonly<{ background: string; surface: string; foreground: string; accent: string; gradient: boolean }>
const load = async (label: string) =>
	JSON.parse(await readFile(`${import.meta.dirname}/data/${label}.json`, "utf8")) as Record<string, Row>
const before = await load(beforeLabel)
const after = await load(afterLabel)
const key = (row: Row | undefined) => row === undefined
	? "(absent)"
	: `${row.background} ${row.surface} ${row.foreground} ${row.accent}`

const verdicts = (await readFile(`${import.meta.dirname}/../../v2-3-eval/data/verdicts.jsonl`, "utf8"))
	.split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, any>)

// image basename -> palette signature -> the verdicts recorded against it
const judged = new Map<string, Map<string, Array<Readonly<{ batch: string; label: string; verdict: string }>>>>()
for (const record of verdicts) {
	const image = String(record.image).split("/").pop()!
	const byPalette = judged.get(image) ?? new Map()
	judged.set(image, byPalette)
	for (const [label, palette] of Object.entries(record.palettes ?? {}) as Array<[string, any]>) {
		const signature = `${palette.background.hex} ${palette.surface.hex} ${palette.foreground.hex} ${palette.accent.hex}`
		const list = byPalette.get(signature) ?? []
		byPalette.set(signature, list)
		const applies = Array.isArray(record.verdictApplies) && record.verdictApplies.includes(label)
		const preferred = record.preference?.label === label
		const verdict = `${applies ? record.verdict : `not-applied(${record.verdict})`}${preferred ? "/preferred" : ""}`
		list.push({ batch: String(record.batch), label, verdict })
	}
}

const byBasename = (row: string) => row.split("/").pop()!
let changed = 0
let reviewedChanged = 0
for (const caseFile of Object.keys(after)) {
	const beforeKey = key(before[caseFile])
	const afterKey = key(after[caseFile])
	if (beforeKey === afterKey && before[caseFile]?.gradient === after[caseFile]?.gradient) continue
	changed += 1
	const palettes = judged.get(byBasename(caseFile))
	const beforeVerdicts = palettes?.get(beforeKey) ?? []
	const afterVerdicts = palettes?.get(afterKey) ?? []
	if (palettes) reviewedChanged += 1
	console.log(`\n${caseFile}${palettes ? "   [REVIEWED ARTWORK]" : ""}`)
	console.log(`  before ${beforeKey} ${before[caseFile]?.gradient ? "grad" : "flat"}` +
		(beforeVerdicts.length ? `   <- ${beforeVerdicts.map((v) => `${v.batch}/${v.label}:${v.verdict}`).join(", ")}` : palettes ? "   <- (no verdict on this exact palette)" : ""))
	console.log(`  after  ${afterKey} ${after[caseFile]?.gradient ? "grad" : "flat"}` +
		(afterVerdicts.length ? `   <- ${afterVerdicts.map((v) => `${v.batch}/${v.label}:${v.verdict}`).join(", ")}` : palettes ? "   <- (no verdict on this exact palette)" : ""))
}
console.log(`\n${changed} of ${Object.keys(after).length} cases changed; ${reviewedChanged} of them on artworks carrying verdicts`)
console.log(`(${judged.size} artworks carry verdicts in verdicts.jsonl)`)
