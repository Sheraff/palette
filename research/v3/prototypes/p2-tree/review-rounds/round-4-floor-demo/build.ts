/**
 * Build the round-4 floor-demonstration fixture: `items.json` (blinded, servable) +
 * `mapping.private.json` (never servable).
 *
 *     node --experimental-strip-types build.ts     # rewrites items.json + mapping.private.json
 *     node --experimental-strip-types validate.ts  # exit 0 or it does not ship
 *
 * ## What this round is
 *
 * One cover, two sides, identical in every role but the foreground. One side is the palette the
 * reviewer already graded in the previous absolute round; the other is that same palette with the
 * foreground replaced by the colour the earlier reading elected FIRST and then refused, because the
 * refused colour is what the reviewer's own note appears to have been asking for.
 *
 * ## Determinism
 *
 * Nothing here is chosen by this file. Both hexes are READ:
 *
 *  - the published side comes verbatim from `../round-3-quality/items.json`, the exact bytes that were
 *    pushed and graded — not from a re-run, which could drift under a moving candidate;
 *  - the substituted foreground comes from `../../tos/identity/q1/report.json`, the diagnosis of that
 *    grading: the first step of the recorded assembly walk, the one carrying a refusal.
 *
 * Everything else is a copy, an assertion, or a sort. No clock, no hash of a filename, no map
 * iteration order, no random salt. `validate.ts` runs this file twice more and byte-compares.
 *
 * ## Side order
 *
 * Round 1's mechanic, unchanged: the two sides are ordered by the item's index parity over a fixed
 * variant order, so the fixture's own order is a function of the item list and not of the builder's
 * taste. There is one item, at index 0 (even), so the substituted side takes fixture position A.
 *
 * That is the FIXTURE's order and not what the reviewer sees. The review server re-shuffles A/B at
 * push time under a fresh random salt (`server.ts` `pushBatch` → `materialize(…, newBlindingSalt())`),
 * and records the shuffle in the batch log. The decode after release therefore joins
 * `mapping.private.json` to the batch log's blinding index — which is what the analyst did for the
 * previous pairwise round, and why the fixture order is recorded here rather than assumed.
 */

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { EPSILON_TEXT_RAW } from "../../../../src/contract/constants.ts"
import { apcaRawBetween, colorDistance, colorFromHex } from "../../../../src/contract/color.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "..", "..", "..", "..", "..", "..")

/** One cover. The single-item decision is argued in `ROUND.md` and recorded in `mapping.private.json`. */
export const ITEM_COUNT = 1

/** The cover: the previous round's item 2, the only diagnosed instance of this failure shape. */
export const ITEM_ID = "ab67616d0000b27300008912d4517960ad020c7a"

/**
 * The blinded variant labels written into `items.json`.
 *
 * Deliberately opaque — not `…-v1` / `…-v2` carrying a prototype name, as the two earlier rounds used.
 * `variantId` is never served (`round-kit.ts` `KNOWN_LEAK_FIELDS`; the pairwise payload serves only
 * the palette), so this is defence in depth: on THIS round a label that hints at "the published one"
 * versus "the hand-built one" would decode the comparison for anyone who read the fixture, and the
 * fixture is read by more people than the served payload is. The true meaning of each label is in
 * `mapping.private.json`, so nothing is lost — it is moved.
 */
const VARIANT_SUBSTITUTED = "variant-01"
const VARIANT_PUBLISHED = "variant-02"
const ALGORITHM_SUBSTITUTED = "blinded-01"
const ALGORITHM_PUBLISHED = "blinded-02"

const ROLES = ["background", "surface", "foreground", "accent"] as const

type Palette = {
	background: string
	surface: string
	foreground: string
	accent: string
	gradient: null | { stops: { color: string; position: number }[] }
	surfaceCollapsed: boolean
	accentCollapsed: boolean
}
type PriorItem = {
	itemId: string
	imagePath: string
	collection: string
	variantId: string
	palette: Palette
	fingerprint: { algorithmVersion: string; preprocessingVersion: string; gitCommit: string; dirty: boolean }
}

// ---------------------------------------------------------------------------------------------
// Input 1 — the graded palette, verbatim
// ---------------------------------------------------------------------------------------------

const PRIOR_ITEMS = "../round-3-quality/items.json"

const priorItems = JSON.parse(readFileSync(join(HERE, PRIOR_ITEMS), "utf8")) as PriorItem[]
const prior = priorItems.find((item) => item.itemId === ITEM_ID)
if (prior === undefined) throw new Error(`${PRIOR_ITEMS} has no item ${ITEM_ID}`)

const publishedPalette = prior.palette

// ---------------------------------------------------------------------------------------------
// Input 2 — the diagnosis, and the colour it says was refused
// ---------------------------------------------------------------------------------------------

const DIAGNOSIS = "../../tos/identity/q1/report.json"

type WalkStep = { rank: number; hex: string; refusal: string | null; violations: string[]; accepted: boolean }
type PoolEntry = { rank: number; hex: string; provenance: string; isPublished: boolean }
type DiagnosisItem = {
	itemId: string
	publishedForeground: string
	reproduced: boolean
	walk: { foregroundSteps: WalkStep[]; settledForeground: string; settledForegroundRank: number }
	election: { publishedRank: number; pool: PoolEntry[] }
}

const diagnosis = JSON.parse(readFileSync(join(HERE, DIAGNOSIS), "utf8")) as { provenance: string; candidate: string; items: DiagnosisItem[] }
const diagnosed = diagnosis.items.find((item) => item.itemId === ITEM_ID)
if (diagnosed === undefined) throw new Error(`${DIAGNOSIS} has no item ${ITEM_ID}`)

/**
 * The refused first step of the recorded walk.
 *
 * Asserted rather than assumed: if the diagnosis is ever re-run and the walk no longer refuses at
 * rank 0, this round's premise is gone and the build must stop rather than quietly stage a different
 * comparison under the same name.
 */
const refusedStep = diagnosed.walk.foregroundSteps[0]
if (refusedStep === undefined || refusedStep.accepted !== false || refusedStep.rank !== 0) {
	throw new Error(`${DIAGNOSIS}: ${ITEM_ID}'s walk does not open with a refused rank-0 step`)
}
if (refusedStep.refusal !== "contract-violation") {
	throw new Error(`${DIAGNOSIS}: ${ITEM_ID}'s rank-0 refusal is ${String(refusedStep.refusal)}, not a contract violation`)
}
const headOfPool = diagnosed.election.pool[0]
if (headOfPool === undefined || headOfPool.hex !== refusedStep.hex) {
	throw new Error(`${DIAGNOSIS}: ${ITEM_ID}'s refused step ${refusedStep.hex} is not the head of the election pool`)
}
if (headOfPool.provenance !== "text-group") {
	throw new Error(`${DIAGNOSIS}: ${ITEM_ID}'s pool head is ${headOfPool.provenance}, not the detector's own election`)
}
if (diagnosed.publishedForeground !== publishedPalette.foreground || diagnosed.reproduced !== true) {
	throw new Error(`${DIAGNOSIS}: ${ITEM_ID}'s reproduced foreground disagrees with the graded fixture`)
}

/** The detector's election: the colour the reading chose first and the contract refused. */
const SUBSTITUTED_FOREGROUND = refusedStep.hex

if (SUBSTITUTED_FOREGROUND === publishedPalette.foreground) {
	throw new Error("the two sides would be identical: the refused colour is the published one")
}

// ---------------------------------------------------------------------------------------------
// The measurement the round is built on, recomputed here from the contract's own APCA path
// ---------------------------------------------------------------------------------------------

/**
 * The contract's raw APCA magnitude, and the OKLab distance beside it.
 *
 * Recomputed rather than copied out of the diagnosis. The diagnosis is a report; a fixture that
 * quotes a number should be able to produce it, and `validate.ts` recomputes these again from the
 * shipped bytes.
 */
function against(text: string, field: string) {
	const raw = apcaRawBetween(colorFromHex(text), colorFromHex(field))
	return {
		field,
		raw,
		rawMagnitude: Math.abs(raw),
		shortfallBelowEpsilon: Math.max(0, EPSILON_TEXT_RAW - Math.abs(raw)),
		clearsEpsilon: Math.abs(raw) >= EPSILON_TEXT_RAW,
		oklabDistance: colorDistance(colorFromHex(text), colorFromHex(field)),
	}
}

const substitutedContrast = [
	against(SUBSTITUTED_FOREGROUND, publishedPalette.background),
	against(SUBSTITUTED_FOREGROUND, publishedPalette.surface),
]
const publishedContrast = [
	against(publishedPalette.foreground, publishedPalette.background),
	against(publishedPalette.foreground, publishedPalette.surface),
]

/** The premise, asserted: one side is under the epsilon on both field roles, the other is over on both. */
if (substitutedContrast.some((entry) => entry.clearsEpsilon)) {
	throw new Error(`${SUBSTITUTED_FOREGROUND} is not under the epsilon on both field roles — the demonstration has no subject`)
}
if (publishedContrast.some((entry) => !entry.clearsEpsilon)) {
	throw new Error(`${publishedPalette.foreground} does not clear the epsilon on both field roles — the graded side is not the compliant one`)
}

// ---------------------------------------------------------------------------------------------
// Sides
// ---------------------------------------------------------------------------------------------

const substitutedPalette: Palette = { ...publishedPalette, foreground: SUBSTITUTED_FOREGROUND }

/** Everything but the foreground must be the same object, role for role. Asserted, not trusted. */
for (const role of ROLES) {
	if (role === "foreground") continue
	if (substitutedPalette[role] !== publishedPalette[role]) throw new Error(`${role} differs between the sides`)
}
if (JSON.stringify(substitutedPalette.gradient) !== JSON.stringify(publishedPalette.gradient)) {
	throw new Error("gradient differs between the sides")
}

/**
 * Round 1's parity mechanic. One item, index 0, even — the substituted side takes fixture position A.
 * The server reshuffles at push; see this file's header.
 */
const ITEM_INDEX = 0
const variantOrder =
	ITEM_INDEX % 2 === 0
		? ([VARIANT_SUBSTITUTED, VARIANT_PUBLISHED] as const)
		: ([VARIANT_PUBLISHED, VARIANT_SUBSTITUTED] as const)

const paletteOf = (variantId: string) => (variantId === VARIANT_SUBSTITUTED ? substitutedPalette : publishedPalette)
const algorithmOf = (variantId: string) => (variantId === VARIANT_SUBSTITUTED ? ALGORITHM_SUBSTITUTED : ALGORITHM_PUBLISHED)

// ---------------------------------------------------------------------------------------------
// Fingerprint
// ---------------------------------------------------------------------------------------------

const gitCommit = execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim()
const dirty =
	execFileSync("git", ["-C", ROOT, "status", "--porcelain", "research/v3/prototypes/p2-tree/tos"], { encoding: "utf8" })
		.trim().length > 0

// ---------------------------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------------------------

/** Deterministic slug from the image basename: lowercased, every non-alphanumeric run → one dash. */
function slugOf(imagePathRelative: string): string {
	const base = imagePathRelative.split("/").pop() ?? imagePathRelative
	const stem = base.replace(/\.[^.]+$/, "")
	return stem.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

const items = [
	{
		itemId: slugOf(prior.imagePath),
		imagePath: prior.imagePath,
		collection: prior.collection,
		sides: variantOrder.map((variantId) => ({
			variantId,
			palette: paletteOf(variantId),
			fingerprint: {
				algorithmVersion: algorithmOf(variantId),
				preprocessingVersion: prior.fingerprint.preprocessingVersion,
				gitCommit,
				dirty,
			},
		})),
	},
]

for (const item of items) {
	if (item.itemId !== ITEM_ID) throw new Error(`itemId ${item.itemId} is not ${ITEM_ID}`)
	if (!existsSync(join(ROOT, item.imagePath))) throw new Error(`image missing on disk: ${item.imagePath}`)
}
if (items.length !== ITEM_COUNT) throw new Error(`built ${items.length} items, expected ${ITEM_COUNT}`)

writeFileSync(join(HERE, "items.json"), `${JSON.stringify(items, null, "\t")}\n`)

writeFileSync(
	join(HERE, "mapping.private.json"),
	`${JSON.stringify(
		{
			_note:
				"NOT SERVABLE. The decode key for round-4-floor-demo, and the whole record of the waiver this round is built on.",
			_roundId: "p2-round-4-floor-demo",
			_kind: "pairwise",
			_variants: {
				[VARIANT_SUBSTITUTED]: {
					meaning: "true-ink-floor-waived",
					candidateId: "p2-tos",
					family: "tree of shapes",
					algorithmVersion: prior.fingerprint.algorithmVersion,
					trueAlgorithmVersion: "p2-tos-0.3.0-cycle-2-merged",
					foreground: SUBSTITUTED_FOREGROUND,
					isPipelineOutput: false,
					provenance:
						"the published palette of round-3-quality item 2 with the foreground replaced by the colour the detector elected at rank 0 and invariant I4's epsilon floor refused (tos/identity/q1/report.json, walk.foregroundSteps[0])",
					waiver:
						"this side deliberately violates I4's minTextContrast epsilon floor, for this demonstration only; it is not a publishable palette and no candidate produces it",
				},
				[VARIANT_PUBLISHED]: {
					meaning: "published-halo",
					candidateId: "p2-tos",
					family: "tree of shapes",
					algorithmVersion: prior.fingerprint.algorithmVersion,
					trueAlgorithmVersion: "p2-tos-0.3.0-cycle-2-merged",
					foreground: publishedPalette.foreground,
					isPipelineOutput: true,
					provenance:
						"round-3-quality/items.json item 2, byte-identical — the palette graded 'acceptable' in batch phase2-cal-014 with the note about the foreground not being a colour of the artwork",
					waiver: null,
				},
			},
			_variantAliases: {
				[VARIANT_PUBLISHED]:
					"the same palette round-3-quality/mapping.private.json records under the label p2-tree-cycle2-v1",
			},
			_sideOrder: {
				rule: "round 1's parity mechanic: sides ordered by item index parity over the fixed variant order; item 0 is even, so the substituted side takes FIXTURE position A",
				fixtureOrder: { A: VARIANT_SUBSTITUTED, B: VARIANT_PUBLISHED },
				caveat:
					"FIXTURE order only. The review server reshuffles A/B at push under a fresh random salt and records the blinding index in the batch log; the released decode must join this file to that index, exactly as the pair-015 analyst did.",
			},
			_item: {
				itemId: ITEM_ID,
				imagePath: prior.imagePath,
				collection: prior.collection,
				priorRound: "round-3-quality item 2 (batch phase2-cal-014), graded acceptable",
				priorNote:
					"The white foreground does not seem to be a color that is part of the artwork, and as a result the identity of this artwork is not well conveyed by this palette",
			},
			_demonstration: {
				question: "is the contrast floor wrong here, or the colour pick?",
				epsilonRawMagnitude: EPSILON_TEXT_RAW,
				parameter: "minTextContrast",
				invariant: "I4.below-contrast-floor",
				substituted: { foreground: SUBSTITUTED_FOREGROUND, against: substitutedContrast },
				published: { foreground: publishedPalette.foreground, against: publishedContrast },
				marginNote:
					"the substituted foreground sits under D7's 0.02 OKLab selection bar against the surface; it is staged anyway, because a colour the instrument would normally refuse to show is exactly what this round exists to show",
			},
			_singleItemDecision: {
				decision: "one item",
				rule: "a second item is built only if the diagnosis shows another cover of the SAME clean class — the detector's election refused by I4, with a near-white halo published instead",
				candidatesConsidered: [
					{
						item: "cal-014 item 1 (…39b7dbc802fd)",
						class: "no text group at all; the near-white was pool rank 0 and the walk accepted it with zero refusals",
						sameClass: false,
						source: "tos/identity/q1/report.json",
					},
					{
						item: "cal-014 item 5 (…f57bc46a3680)",
						class: "phantom text group (one mark named four times across lanes); published at rank 0 with zero refusals — a bypass, not a refusal",
						sameClass: false,
						source: "tos/identity/q2/report.json, DECISIONS.md D12",
					},
					{
						item: "cal-014 item 6 (…d5fd547eb7f3)",
						class: "two I4 refusals, but the accepted rank-2 colour IS the admissible pool maximum — a field-stage ceiling set by the published ramp, not a halo",
						sameClass: false,
						source: "tos/identity/q2/report.json",
					},
				],
			},
			_sources: {
				publishedSide: `review-rounds/round-3-quality/items.json (${ITEM_ID})`,
				substitutedForeground: `tos/identity/q1/report.json (${diagnosis.provenance}, candidate ${diagnosis.candidate})`,
				candidatePath: "research/v3/prototypes/p2-tree/tos/candidate.ts",
			},
		},
		null,
		"\t",
	)}\n`,
)

console.log(`item=${ITEM_ID.slice(0, 14)} cover=${prior.imagePath}`)
console.log(`fixture A=${variantOrder[0]} B=${variantOrder[1]}`)
console.log(`substituted fg=${SUBSTITUTED_FOREGROUND} published fg=${publishedPalette.foreground}`)
for (const entry of substitutedContrast) {
	console.log(
		`  ${SUBSTITUTED_FOREGROUND} on ${entry.field}: |raw| ${entry.rawMagnitude.toFixed(4)} ` +
			`(epsilon ${EPSILON_TEXT_RAW}, short by ${entry.shortfallBelowEpsilon.toFixed(4)}), OKLab ${entry.oklabDistance.toFixed(4)}`,
	)
}
for (const entry of publishedContrast) {
	console.log(`  ${publishedPalette.foreground} on ${entry.field}: |raw| ${entry.rawMagnitude.toFixed(4)}, OKLab ${entry.oklabDistance.toFixed(4)}`)
}
console.log(`gitCommit=${gitCommit} dirty=${dirty}`)
console.log(`wrote ${items.length} item, 2 sides`)
