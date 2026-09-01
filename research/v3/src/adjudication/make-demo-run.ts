/**
 * Builds a synthetic candidate run out of the real evidence corpus, so the adjudication consumer can
 * be demonstrated end-to-end before any algorithm exists to feed it.
 *
 *   cd research/v3
 *   node --experimental-strip-types src/adjudication/make-demo-run.ts
 *
 * Writes `data/adjudication/demo-candidates.jsonl`. Deterministic: same corpus in, byte-identical
 * file out. No image is decoded and no palette is computed — every line is assembled from a standing
 * entry by one of five stated transforms, so the expected adjudication of every line is known in
 * advance and the tool's report can be checked against it by eye.
 *
 * **This is a demonstration, not a benchmark.** A run built by copying the answers will of course
 * "win"; what it demonstrates is that each of the five cases lands in the tier the semantics say it
 * should, on real data, at real corpus scale.
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { colorFromRgb, ROLE_NAMES, sameColor } from "../contract/index.ts"
import type { PaletteColor, RoleName } from "../contract/index.ts"
import { loadEvidence, V3_ROOT } from "./evidence.ts"
import type { EvidenceEntry } from "./types.ts"

/** A fabricated content hash for the "never seen" case. No such file exists, and that is the point. */
const UNSEEN_HASH = "0".repeat(64)

/** Nudge every channel by one, away from the clipping end. Stays well inside the same-colour bar. */
function nudge(color: PaletteColor): PaletteColor {
	return colorFromRgb(color.rgb.map((channel) => (channel >= 255 ? channel - 1 : channel + 1)) as unknown as [
		number,
		number,
		number,
	])
}

/** Rotate the channels. A large, deterministic move that lands nowhere near the original. */
function rotate(color: PaletteColor): PaletteColor {
	return colorFromRgb([color.rgb[2], color.rgb[0], color.rgb[1]])
}

function line(
	entry: EvidenceEntry,
	roles: Record<RoleName, PaletteColor>,
	arm: string,
	note: string,
	extra: Record<string, unknown> = {},
): string {
	return JSON.stringify({
		arm,
		note,
		palette: {
			contractVersion: "v3-contract-0.1.0",
			roles: Object.fromEntries(ROLE_NAMES.map((role) => [role, { hex: roles[role].hex, rgb: roles[role].rgb }])),
			metadata: {
				algorithmVersion: "demo-synthetic-0.1.0",
				preprocessingVersion: "none",
				inputContentHash: entry.artwork.contentSha256,
				sourceRendition: {
					path: entry.artwork.imagePath,
					width: entry.artwork.rendition.width ?? 0,
					height: entry.artwork.rendition.height ?? 0,
					format: entry.artwork.rendition.format ?? "jpeg",
				},
			},
		},
		...extra,
	})
}

function completeRoles(entry: EvidenceEntry): Record<RoleName, PaletteColor> | null {
	const roles: Partial<Record<RoleName, PaletteColor>> = {}
	for (const role of ROLE_NAMES) {
		const color = entry.roles[role]
		if (!color) return null
		roles[role] = color
	}
	return roles as Record<RoleName, PaletteColor>
}

export function buildDemoRun(): { text: string; summary: string[] } {
	const corpus = loadEvidence({ asOf: null })
	const sorted = (tier: string) =>
		corpus.entries
			.filter((entry) => entry.tier === tier && entry.provenance.era === "v2-3" && completeRoles(entry))
			.sort((a, b) => a.entryId.localeCompare(b.entryId))

	const endorsements = sorted("endorsement")
	const knownBad = sorted("known-bad")
	const acceptable = sorted("acceptable")

	const lines: string[] = []
	const summary: string[] = []
	let nudgedWithinBar = 0

	// 1. Exact reproductions of endorsements — expected WIN.
	for (const entry of endorsements.slice(0, 8)) {
		lines.push(line(entry, completeRoles(entry)!, "arm/copycat", `exact copy of endorsement ${entry.entryId}`))
	}
	summary.push("8 exact copies of endorsements            → expect WIN")

	// 2. One-LSB perturbations of endorsements — expected WIN, and only because the bar is not hex.
	for (const entry of endorsements.slice(8, 14)) {
		const roles = completeRoles(entry)!
		const nudged = Object.fromEntries(
			ROLE_NAMES.map((role) => [role, nudge(roles[role])]),
		) as Record<RoleName, PaletteColor>
		if (ROLE_NAMES.every((role) => sameColor(nudged[role], roles[role]))) nudgedWithinBar += 1
		lines.push(line(entry, nudged, "arm/nudged", `endorsement ${entry.entryId}, one LSB per channel`))
	}
	summary.push(`6 endorsements nudged by one LSB          → expect WIN (${nudgedWithinBar}/6 verified within the bar)`)

	// 3. Reproductions of known-bad palettes — expected LOSS.
	for (const entry of knownBad.slice(0, 5)) {
		lines.push(line(entry, completeRoles(entry)!, "arm/regressor", `exact copy of known-bad ${entry.entryId}`))
	}
	summary.push("5 exact copies of known-bad palettes      → expect LOSS")

	// 4. Channel-rotated endorsements — expected NO SIGNAL, and not a penalty.
	for (const entry of endorsements.slice(14, 22)) {
		const roles = completeRoles(entry)!
		const rotated = Object.fromEntries(
			ROLE_NAMES.map((role) => [role, rotate(roles[role])]),
		) as Record<RoleName, PaletteColor>
		lines.push(line(entry, rotated, "arm/divergent", `a palette nobody has graded, on a reviewed file`))
	}
	summary.push("8 unreviewed palettes on reviewed files   → expect NO SIGNAL (differs)")

	// 5. Acceptable-tier reproductions — expected baseline, neither win nor loss.
	for (const entry of acceptable.slice(0, 4)) {
		lines.push(line(entry, completeRoles(entry)!, "arm/tolerable", `exact copy of acceptable ${entry.entryId}`))
	}
	summary.push("4 exact copies of acceptable palettes     → expect baseline, no win")

	// 6. Reachability: an endorsement copy that carries the colour set it came from, and one that
	//    carries a colour set that cannot express it.
	const reachEntry = endorsements[22]!
	const reachRoles = completeRoles(reachEntry)!
	lines.push(
		line(reachEntry, reachRoles, "arm/reachable", "carries the colour set that contains the endorsement", {
			availableColors: ROLE_NAMES.map((role) => ({ hex: reachRoles[role].hex, rgb: reachRoles[role].rgb })),
		}),
	)
	const blindEntry = endorsements[23]!
	const blindRoles = completeRoles(blindEntry)!
	lines.push(
		line(blindEntry, blindRoles, "arm/blind", "carries a colour set that cannot express the endorsement", {
			availableColors: ROLE_NAMES.map((role) => {
				const rotated = rotate(blindRoles[role])
				return { hex: rotated.hex, rgb: rotated.rgb }
			}),
		}),
	)
	summary.push("2 reachability probes                     → expect one reachable, one unreachable")

	// 7. A file with no standing evidence at all — expected UNSEEN.
	const unseen = {
		...endorsements[0]!,
		artwork: { ...endorsements[0]!.artwork, contentSha256: UNSEEN_HASH, imagePath: "synthetic/never-reviewed.jpg" },
	}
	lines.push(line(unseen, completeRoles(endorsements[0]!)!, "arm/copycat", "a file nobody has ever reviewed"))
	summary.push("1 file with no evidence                   → expect UNSEEN")

	return { text: `${lines.join("\n")}\n`, summary }
}

const invokedDirectly = process.argv[1] && import.meta.url === `file://${resolve(process.argv[1])}`
if (invokedDirectly) {
	const { text, summary } = buildDemoRun()
	const out = resolve(V3_ROOT, "data/adjudication/demo-candidates.jsonl")
	mkdirSync(resolve(V3_ROOT, "data/adjudication"), { recursive: true })
	writeFileSync(out, text)
	process.stdout.write(`wrote ${out}\n${text.trim().split("\n").length} candidate lines\n\n`)
	for (const row of summary) process.stdout.write(`  ${row}\n`)
}
