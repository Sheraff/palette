/**
 * **Round 5 — five measured trades, priced.** Writes `items.json` (servable) and
 * `mapping.private.json` (the decode key, never servable).
 *
 *     sh pin.sh base          probe.ts        # once, before this
 *     sh pin.sh accent-member probe.ts
 *     sh pin.sh fg-member     probe.ts
 *     node --experimental-strip-types build.ts
 *     node --experimental-strip-types validate.ts   # exit 0 or it does not ship
 *
 * This file is a **pure function of `out/*.json`**. It runs no pipeline, decodes no image and reads no
 * HEAD: every palette on both sides of every item was built by `probe.ts` inside a git-archive export
 * of one pinned commit, and the fingerprint each side carries is that commit. That is the whole reason
 * for the split — a sibling worker owns `tos/` and may edit `pipeline.ts` while this round is staged,
 * and `validate.ts` re-runs this builder twice and byte-compares, which it could not do if the builder
 * re-ran the pipeline.
 *
 * **No hex in `items.json` is typed here.** Every published colour is read out of a probe file, and
 * every side is a whole palette some build of this prototype actually published — including item 5's,
 * which is the assembly walk's own output with one pool candidate moved to the front of the ranking it
 * already sits in.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { colorDistance, colorFromHex, rgbToOkLab, sameColorBar } from "../../../../src/contract/color.ts"

const HERE = dirname(fileURLToPath(import.meta.url))

type PaletteShape = {
	background: string
	surface: string
	foreground: string
	accent: string
	gradient: null | { stops: { color: string; position: number }[] }
	surfaceCollapsed: boolean
	accentCollapsed: boolean
}
type Alternative = {
	hex: string
	fieldContrast: number
	provenance: string
	led: boolean
	oneRoleWide: boolean
	contractViolations: string[]
	palette: PaletteShape
}
type CoverRecord = {
	imagePath: string
	palette: PaletteShape
	contractViolations: string[]
	notes: string[]
	swapped: boolean
	verdict: string
	foregroundPool: { hex: string; fieldContrast: number; provenance: string }[]
	accentPool: string[]
	accentCandidates: { hex: string; chromaFromField: number; fieldContrast: number }[]
	textGroups: { hex: string; componentCount: number; areaFraction: number; fieldContrast: number }[]
	coverage?: {
		palette: PaletteShape
		changed: boolean
		notes: string[]
		contractViolations: string[]
		familyCount: number
		families: { rank: number; hueStartDegrees: number; hueEndDegrees: number; memberCount: number }[]
	}
	foregroundAlternatives?: { replicaReproducesPublished: boolean; alternatives: Alternative[] }
}
type Probe = { variant: string; pinCommit: string; covers: Record<string, CoverRecord> }

const probeOf = (variant: string): Probe => JSON.parse(readFileSync(join(HERE, "out", `${variant}.json`), "utf8")) as Probe

const base = probeOf("base")
const accentMember = probeOf("accent-member")
const fgMember = probeOf("fg-member")

const pinCommit = base.pinCommit
for (const probe of [accentMember, fgMember]) {
	if (probe.pinCommit !== pinCommit) {
		throw new Error(`build.ts: ${probe.variant} was probed at ${probe.pinCommit}, base at ${pinCommit} — the sides would not be one build apart`)
	}
}

const CORAL = "ab67616d00001e0200000f92552b0935b967964d"
const BLACK_TITLE = "ab67616d00001e02000001335fe604d859a69094"
const COVERAGE_A = "ab67616d00001e0200001a9be12b7116a8247378"
const COVERAGE_B = "ab67616d00001e02000022e7e9d11c908479200b"
const LOW_CONTRAST_TYPE = "ab67616d00001e0200001073a73e3a949021f65e"

const assert = (condition: boolean, message: string): void => {
	if (!condition) throw new Error(`build.ts: ${message}`)
}

/** Which roles differ between two palettes. The round's whole claim about every item. */
function differingRoles(first: PaletteShape, second: PaletteShape): string[] {
	const roles = ["background", "surface", "foreground", "accent"] as const
	const moved: string[] = roles.filter((role) => first[role] !== second[role])
	if (JSON.stringify(first.gradient) !== JSON.stringify(second.gradient)) moved.push("gradient")
	if (first.surfaceCollapsed !== second.surfaceCollapsed) moved.push("surfaceCollapsed")
	if (first.accentCollapsed !== second.accentCollapsed) moved.push("accentCollapsed")
	return moved
}

/** OKLab chroma from the published background — `pipeline.ts`'s D1 ranking key, recomputed here. */
function chromaFromBackground(hex: string, backgroundHex: string): number {
	const lab = rgbToOkLab(colorFromHex(hex).rgb)
	const field = rgbToOkLab(colorFromHex(backgroundHex).rgb)
	return Math.hypot(lab[1] - field[1], lab[2] - field[2])
}

const separationOf = (first: string, second: string) => {
	const a = colorFromHex(first)
	const b = colorFromHex(second)
	const distance = colorDistance(a, b)
	const bar = sameColorBar(a, b)
	return { oklab: distance, bar, bars: distance / bar }
}

type BuiltItem = {
	itemId: string
	imagePath: string
	role: "accent" | "foreground"
	published: PaletteShape
	variant: PaletteShape
	/** The decoded name of each side, for `mapping.private.json` only. */
	publishedName: string
	variantName: string
	question: string
	measurements: Record<string, unknown>
}

const items: BuiltItem[] = []

// --- item 1: the accent cluster's chroma-extremal member (worker J's lever) ----------------------

{
	const published = base.covers[CORAL]
	const variant = accentMember.covers[CORAL]
	assert(published !== undefined && variant !== undefined, `${CORAL} is missing from a probe`)
	assert(published.palette.accent === "#d25068", `${CORAL} no longer publishes #d25068 (got ${published.palette.accent}) — D9's endorsed shade is what this item prices`)
	assert(variant.palette.accent === "#ee5567", `${CORAL}'s chromatic-member variant publishes ${variant.palette.accent}, not the #ee5567 worker J measured`)
	const moved = differingRoles(published.palette, variant.palette)
	assert(moved.length === 1 && moved[0] === "accent", `${CORAL}: the variant moves ${moved.join(",")}, not the accent alone`)
	items.push({
		itemId: CORAL,
		imagePath: published.imagePath,
		role: "accent",
		published: published.palette,
		variant: variant.palette,
		publishedName: "published-largest-member",
		variantName: "chroma-extremal-member",
		question: "Which of these two reds should the palette use as its accent?",
		measurements: {
			publishedChromaFromField: chromaFromBackground(published.palette.accent, published.palette.background),
			variantChromaFromField: chromaFromBackground(variant.palette.accent, variant.palette.background),
			separation: separationOf(published.palette.accent, variant.palette.accent),
			leverEffect: "dither arm 23% -> 24% agreement; the accent moves on 42 of 100 dithered covers against 50 (tos/roles/NOTES.md, worker J)",
		},
	})
}

// --- item 2: the text group's contrast-extremal member (worker J's symmetric lever) --------------

{
	const published = base.covers[BLACK_TITLE]
	const variant = fgMember.covers[BLACK_TITLE]
	assert(published !== undefined && variant !== undefined, `${BLACK_TITLE} is missing from a probe`)
	assert(
		published.palette.foreground === "#070506",
		`${BLACK_TITLE} no longer publishes #070506 (got ${published.palette.foreground}) — the round-1 ruling "black is the artwork's text" is what this item prices`,
	)
	assert(
		variant.palette.foreground !== published.palette.foreground,
		`${BLACK_TITLE}: the readable-member variant did not move the foreground, so worker J's measured loss no longer reproduces`,
	)
	const moved = differingRoles(published.palette, variant.palette)
	assert(moved.length === 1 && moved[0] === "foreground", `${BLACK_TITLE}: the variant moves ${moved.join(",")}, not the foreground alone`)
	const publishedGroup = published.textGroups.find((group) => group.hex === published.palette.foreground)
	const variantGroup = variant.textGroups.find((group) => group.hex === variant.palette.foreground)
	items.push({
		itemId: BLACK_TITLE,
		imagePath: published.imagePath,
		role: "foreground",
		published: published.palette,
		variant: variant.palette,
		publishedName: "published-largest-member",
		variantName: "contrast-extremal-member",
		question: "Which of these two near-blacks should the palette use for its text colour?",
		measurements: {
			publishedFieldContrast: publishedGroup?.fieldContrast ?? null,
			variantFieldContrast: variantGroup?.fieldContrast ?? null,
			separation: separationOf(published.palette.foreground, variant.palette.foreground),
			declaredNearCase:
				"the two sides are the round's near case: above the contract's own same-colour bar but under the 0.02 OKLab selection margin every earlier P2 round used to keep items off that boundary (D7)",
		},
	})
}

// --- items 3-4: identity-coverage allocation, on its two adverse covers --------------------------

for (const itemId of [COVERAGE_A, COVERAGE_B]) {
	const published = base.covers[itemId]
	assert(published !== undefined, `${itemId} is missing from the base probe`)
	const coverage = published.coverage
	assert(coverage !== undefined, `${itemId}: the base probe carries no allocation reading`)
	assert(coverage!.changed, `${itemId}: the allocation is a no-op here (${coverage!.notes.join(" ")}) — there is no trade to price`)
	assert(coverage!.contractViolations.length === 0, `${itemId}: the allocated palette violates ${coverage!.contractViolations.join(",")}`)
	const moved = differingRoles(published.palette, coverage!.palette)
	assert(moved.length === 1 && moved[0] === "accent", `${itemId}: the allocation moves ${moved.join(",")}, not the accent alone`)
	const publishedChroma = chromaFromBackground(published.palette.accent, published.palette.background)
	const variantChroma = chromaFromBackground(coverage!.palette.accent, published.palette.background)
	assert(variantChroma < publishedChroma, `${itemId}: the allocated accent is not the lower-chroma side, so this is not the adverse case`)
	items.push({
		itemId,
		imagePath: published.imagePath,
		role: "accent",
		published: published.palette,
		variant: coverage!.palette,
		publishedName: "published-most-chromatic-accent",
		variantName: "family-allocated-accent",
		question: "Which of these two accents belongs on this artwork?",
		measurements: {
			publishedChromaFromField: publishedChroma,
			variantChromaFromField: variantChroma,
			chromaRetained: variantChroma / publishedChroma,
			separation: separationOf(published.palette.accent, coverage!.palette.accent),
			familyCount: coverage!.familyCount,
			families: coverage!.families,
			allocationNotes: coverage!.notes,
		},
	})
}

// --- item 5: worker L's owed item — identity against legibility at the floor ---------------------

{
	const published = base.covers[LOW_CONTRAST_TYPE]
	assert(published !== undefined, `${LOW_CONTRAST_TYPE} is missing from the base probe`)
	const measured = published.foregroundAlternatives
	assert(measured !== undefined, `${LOW_CONTRAST_TYPE}: the base probe carries no foreground alternatives`)
	assert(measured!.replicaReproducesPublished, `${LOW_CONTRAST_TYPE}: the re-walk does not reproduce the published palette, so nothing built on it means anything`)

	const pool = measured!.alternatives
	assert(pool[0]?.hex === published.palette.foreground, `${LOW_CONTRAST_TYPE}: the published foreground is not rank 0 of its own ranking`)

	// **The derivation, because `roles/NOTES.md` names the cover and not the alternative.** Admissible =
	// this pipeline's own walk settles on it, the contract accepts the whole palette, and no other role
	// moves. Among those, the alternative is the one **the published ranking itself puts next** — rank 1 —
	// which is also the most readable candidate at the ranking's leading eligibility level. Three pool
	// colours score higher raw readability and every one of them sits LATER in the pool, which under
	// `rankByFieldContrast`'s own ordering (level, then readability class, then colour) can only mean a
	// worse eligibility level: they are the boundary-tracing / low-salience class D12 and D14 say a
	// fallback must never reach for. Staging one of those would price a defect, not a trade.
	const admissible = pool.filter((entry, index) => index > 0 && entry.led && entry.oneRoleWide && entry.contractViolations.length === 0)
	assert(admissible.length > 0, `${LOW_CONTRAST_TYPE}: no admissible one-role-wide alternative exists`)
	const alternative = admissible[0]!
	assert(alternative.hex === pool[1]?.hex, `${LOW_CONTRAST_TYPE}: rank 1 of the pool is not admissible; the derivation's premise fails`)
	for (const [index, entry] of pool.entries()) {
		if (entry.fieldContrast > alternative.fieldContrast) {
			assert(
				index > 1,
				`${LOW_CONTRAST_TYPE}: ${entry.hex} is more readable than the alternative and ranks ahead of it — the eligibility argument for the choice does not hold`,
			)
		}
	}
	const moved = differingRoles(published.palette, alternative.palette)
	assert(moved.length === 1 && moved[0] === "foreground", `${LOW_CONTRAST_TYPE}: the alternative moves ${moved.join(",")}, not the foreground alone`)

	items.push({
		itemId: LOW_CONTRAST_TYPE,
		imagePath: published.imagePath,
		role: "foreground",
		published: published.palette,
		variant: alternative.palette,
		publishedName: "published-artwork-type",
		variantName: "next-in-ranking",
		question: "Which of these two colours should the artwork's text be written in?",
		measurements: {
			publishedFieldContrast: pool[0]!.fieldContrast,
			publishedProvenance: pool[0]!.provenance,
			variantFieldContrast: alternative.fieldContrast,
			variantProvenance: alternative.provenance,
			variantPoolRank: 1,
			separation: separationOf(published.palette.foreground, alternative.palette.foreground),
			moreReadableButLowerRanked: pool
				.filter((entry) => entry.fieldContrast > alternative.fieldContrast)
				.map((entry) => ({ hex: entry.hex, fieldContrast: entry.fieldContrast, poolIndex: pool.indexOf(entry) })),
			admissibleCount: admissible.length,
		},
	})
}

// --- the fixture --------------------------------------------------------------------------------

assert(items.length === 5, `expected 5 items, built ${items.length}`)

/**
 * Side order alternates by item index parity (round 1's mechanic, kept): on even items the published
 * palette takes fixture position A, on odd items the variant does. The labels are opaque and follow the
 * POSITION, so neither the label nor the position carries the answer — and the review server reshuffles
 * A/B at push under a fresh salt anyway, which is what a decode must be joined to.
 */
const servable = items.map((item, index) => {
	const publishedLeads = index % 2 === 0
	const ordered = publishedLeads ? [item.published, item.variant] : [item.variant, item.published]
	return {
		itemId: item.itemId,
		imagePath: item.imagePath,
		collection: "demo-20",
		sides: ordered.map((palette, position) => ({
			variantId: `variant-0${position + 1}`,
			palette,
			fingerprint: {
				algorithmVersion: `blinded-0${position + 1}`,
				preprocessingVersion: "sharp-0.33.5/srgb/no-resample",
				gitCommit: pinCommit,
				dirty: true,
			},
		})),
	}
})

writeFileSync(join(HERE, "items.json"), `${JSON.stringify(servable, null, "\t")}\n`)

const mapping = {
	_readme:
		"NOT SERVABLE. The decode key for round 5: which fixture position is the published palette on each item, what the other side is, and every measurement behind both. Never copy into a batch fixture, a media directory, or anywhere the review server can reach.",
	_pin: {
		commit: pinCommit,
		how: "every side is built by probe.ts inside a git-archive export of this commit (pin.sh); the two variant exports carry one asserted single-line substitution each (patch.ts). No side is built from the live worktree.",
		variants: {
			"accent-member": "an accent cluster publishes its most chromatic member instead of its largest (tos/pipeline.ts, the accentClusters site)",
			"fg-member": "a text group publishes its most readable member instead of its largest (roles/text.ts's memberScore hook)",
			coverage: "tos/coverage/candidate-coverage.ts, worker K's identity-coverage allocation, unmodified",
			"next-in-ranking": "the published pipeline's own assembly walk with one pool candidate moved to the front of the foreground ranking it already sits in",
		},
	},
	_items: Object.fromEntries(
		items.map((item, index) => [
			item.itemId,
			{
				imagePath: item.imagePath,
				question: item.question,
				roleUnderTest: item.role,
				fixturePositionA: index % 2 === 0 ? item.publishedName : item.variantName,
				fixturePositionB: index % 2 === 0 ? item.variantName : item.publishedName,
				published: { name: item.publishedName, hex: item.published[item.role], palette: item.published },
				variant: { name: item.variantName, hex: item.variant[item.role], palette: item.variant },
				measurements: item.measurements,
			},
		]),
	),
}

writeFileSync(join(HERE, "mapping.private.json"), `${JSON.stringify(mapping, null, "\t")}\n`)

console.log(`built ${items.length} items at pin ${pinCommit.slice(0, 8)}`)
for (const item of items) {
	console.log(`  ${item.itemId.slice(-12)} · ${item.role} · ${item.published[item.role]} vs ${item.variant[item.role]}`)
}
