import { readFile } from "node:fs/promises"
import type { BlindPalette, Role } from "./shared.ts"

/**
 * Reader for the append-only verdict warehouse (`data/verdicts.jsonl`).
 *
 * Records are written by `serve-review.ts`, but the file is also the place where hand-recorded human
 * evidence lands (for example a `comparison: "correction-only"` note carrying a single corrected role
 * from a conversation). Mining tools must therefore treat the shape as *observed*, not guaranteed:
 * everything optional is normalized here so callers can rely on the fields they use.
 */

export type VerdictRecord = Readonly<{
	schemaVersion: number
	recordedAt: string
	batch: string
	image: string
	imageSha256: string | null
	labels: readonly string[]
	blindSides: Readonly<{ A: string; B: string }> | null
	palettes: Readonly<Record<string, BlindPalette>>
	comparison: string
	preference: Readonly<{ side: "A" | "B" | null; label: string | null }>
	verdict: string | null
	verdictApplies: readonly string[]
	corrections: Readonly<Partial<Record<Role, string>>>
	/**
	 * What a correction means. `endorsed-sample`: one palette the reviewer would endorse, not the unique
	 * correct answer — several palettes can be valid for one artwork, and an empty correction is not
	 * disagreement. Records written before this field existed carry the same meaning.
	 */
	correctionsKind: "endorsed-sample"
	tags: readonly string[]
	notes: string
	/** Zero-based position in the file, so a record can always be traced back. */
	line: number
}>

function normalize(value: Record<string, unknown>, line: number): VerdictRecord {
	const palettes = value.palettes !== null && typeof value.palettes === "object" && !Array.isArray(value.palettes)
		? value.palettes as Record<string, BlindPalette>
		: {}
	const preference = value.preference !== null && typeof value.preference === "object"
		? value.preference as { side?: unknown; label?: unknown }
		: {}
	return {
		schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : 1,
		recordedAt: typeof value.recordedAt === "string" ? value.recordedAt : "",
		batch: typeof value.batch === "string" ? value.batch : "",
		image: typeof value.image === "string" ? value.image : "",
		imageSha256: typeof value.imageSha256 === "string" ? value.imageSha256 : null,
		labels: Array.isArray(value.labels) ? value.labels.filter((label): label is string => typeof label === "string") : [],
		blindSides: value.blindSides !== null && typeof value.blindSides === "object"
			? value.blindSides as { A: string; B: string }
			: null,
		palettes,
		comparison: typeof value.comparison === "string" ? value.comparison : "ab",
		preference: {
			side: preference.side === "A" || preference.side === "B" ? preference.side : null,
			label: typeof preference.label === "string" ? preference.label : null,
		},
		verdict: typeof value.verdict === "string" ? value.verdict : null,
		verdictApplies: Array.isArray(value.verdictApplies)
			? value.verdictApplies.filter((label): label is string => typeof label === "string")
			: [],
		corrections: value.corrections !== null && typeof value.corrections === "object"
			? value.corrections as Partial<Record<Role, string>>
			: {},
		correctionsKind: "endorsed-sample",
		tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string") : [],
		notes: typeof value.notes === "string" ? value.notes : "",
		line,
	}
}

export async function loadVerdicts(path: string): Promise<VerdictRecord[]> {
	let raw: string
	try {
		raw = await readFile(path, "utf8")
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
		throw error
	}
	return raw.split("\n")
		.map((line, index) => ({ line: index, text: line.trim() }))
		.filter((entry) => entry.text.length > 0)
		.map((entry) => normalize(JSON.parse(entry.text) as Record<string, unknown>, entry.line))
}

/** Records carrying at least one human-corrected role color. */
export function correctedRecords(records: readonly VerdictRecord[]): VerdictRecord[] {
	return records.filter((record) => Object.keys(record.corrections).length > 0)
}
