/**
 * The legacy gradient labels: one boolean per endorsed artwork, or an honest refusal.
 *
 * ## Why this file reads the raw legacy JSON as well as `evidence.ts`
 *
 * `loadEvidence()` is the corpus loader and it is used here for exactly what it owns: which entries
 * are endorsements, which artwork each is attached to (content sha-256, repo-relative path), and the
 * per-entry grade history. What it deliberately does **not** carry is the gradient — `types.ts` says
 * so in as many words ("adjudication compares role colours only"), because the legacy fixtures'
 * own `gradientAdvisory` warns that v2-3 gradients reuse background/surface as endpoints while v3
 * stops are decoupled from roles.
 *
 * That advisory is about **endpoint colours**, not about the boolean. Whether the reviewer was
 * looking at a ramp or a flat field is a fact about the artwork, and it is the only recorded human
 * signal in the repository that speaks to `LAMINARITY_CUT` at all. So the boolean is read from
 * `data/legacy/endorsements.json` directly, joined on `entryId`, and every entry that carries no
 * gradient state or contradicts a sibling entry is **excluded and counted**, never defaulted.
 *
 * `null` in the source is *not recorded*, not *no gradient*: the entry's own `paletteSignature`
 * spells it `g?` against `g0` / `g1` for the recorded cases.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { loadEvidence, DEFAULT_LEGACY_DIR } from "../../../../../src/adjudication/evidence.ts"
import type { EvidenceEntry } from "../../../../../src/adjudication/types.ts"

export type GradientLabel = Readonly<{
	contentSha256: string
	imagePath: string
	/** The resolved boolean, or `null` when the artwork has no usable state. */
	gradient: boolean | null
	/** Why it is `null`, or `"unanimous"` / `"recency"` when it is not. */
	basis: "unanimous" | "recency" | "no-state-recorded" | "contested"
	entryCount: number
	recordedCount: number
	distinct: readonly boolean[]
}>

type RawEntry = Readonly<{
	entryId: string
	artwork: Readonly<{ contentSha256: string; imagePath: string }>
	palette: Readonly<{ gradient: boolean | null }>
	evidence?: readonly Readonly<{ recordedAt: string | null }>[]
}>

export type LabelSet = Readonly<{
	legacyFile: string
	endorsedArtworks: number
	usableStrict: number
	usableWithRecency: number
	noStateRecorded: number
	contested: number
	labels: readonly GradientLabel[]
}>

/**
 * Load one gradient label per endorsed artwork.
 *
 * Deterministic: artworks come out sorted by repo-relative image path, entries within an artwork by
 * `entryId`, and the recency tie-break reads the timestamps the source already carries.
 */
export function loadGradientLabels(legacyDir: string = DEFAULT_LEGACY_DIR): LabelSet {
	const corpus = loadEvidence({ legacyDir })
	const endorsed: EvidenceEntry[] = corpus.entries.filter((entry) => entry.tier === "endorsement" && entry.provenance.era === "v2-3")
	const endorsedIds = new Set(endorsed.map((entry) => entry.entryId))

	const legacyFile = resolve(legacyDir, "endorsements.json")
	const raw = JSON.parse(readFileSync(legacyFile, "utf8")) as { entries: RawEntry[] }

	const byArtwork = new Map<string, { imagePath: string; rows: { entryId: string; gradient: boolean | null; recordedAt: string | null }[] }>()
	for (const row of raw.entries) {
		// `entryId` is the join. An entry the corpus loader dropped (era, tier, demo fixture) is not an
		// endorsement for this study's purposes either.
		if (!endorsedIds.has(row.entryId)) continue
		const key = row.artwork.contentSha256
		let bucket = byArtwork.get(key)
		if (bucket === undefined) {
			bucket = { imagePath: row.artwork.imagePath, rows: [] }
			byArtwork.set(key, bucket)
		}
		const timestamps = (row.evidence ?? []).map((item) => item.recordedAt).filter((value): value is string => value !== null)
		timestamps.sort()
		bucket.rows.push({ entryId: row.entryId, gradient: row.palette.gradient, recordedAt: timestamps.length > 0 ? timestamps[timestamps.length - 1] : null })
	}

	const labels: GradientLabel[] = []
	for (const [contentSha256, bucket] of Array.from(byArtwork.entries()).sort((first, second) =>
		first[1].imagePath < second[1].imagePath ? -1 : first[1].imagePath > second[1].imagePath ? 1 : first[0] < second[0] ? -1 : 1,
	)) {
		const rows = bucket.rows.slice().sort((first, second) => (first.entryId < second.entryId ? -1 : 1))
		const recorded = rows.filter((row) => row.gradient !== null)
		const distinct = Array.from(new Set(recorded.map((row) => row.gradient as boolean))).sort()
		let gradient: boolean | null
		let basis: GradientLabel["basis"]
		if (recorded.length === 0) {
			gradient = null
			basis = "no-state-recorded"
		} else if (distinct.length === 1) {
			gradient = distinct[0]
			basis = "unanimous"
		} else {
			// The corpus contradicts itself. `evidence.ts` resolves standing grades by recency and says
			// so; the same rule is applied here, and the artwork is *also* counted as contested so the
			// strict reading is available in the report.
			const dated = recorded.filter((row) => row.recordedAt !== null).sort((first, second) => (first.recordedAt! < second.recordedAt! ? -1 : 1))
			gradient = dated.length > 0 ? (dated[dated.length - 1].gradient as boolean) : null
			basis = "contested"
		}
		labels.push({ contentSha256, imagePath: bucket.imagePath, gradient, basis, entryCount: rows.length, recordedCount: recorded.length, distinct })
	}

	return {
		legacyFile,
		endorsedArtworks: labels.length,
		usableStrict: labels.filter((label) => label.basis === "unanimous").length,
		usableWithRecency: labels.filter((label) => label.basis === "unanimous" || (label.basis === "contested" && label.gradient !== null)).length,
		noStateRecorded: labels.filter((label) => label.basis === "no-state-recorded").length,
		contested: labels.filter((label) => label.basis === "contested").length,
		labels,
	}
}
