/**
 * The endorsement-recheck round — `endorsement-recheck-1`.
 *
 * **Why this round exists.** The reviewer's metric ruling of 2026-08-04
 * (`d-2026-08-04-reviewer-metric-follows-the-pair`) changed which ruler judges which pair of
 * published colours. It was measured, at the time it was recorded, to newly fail three palettes on
 * the roles matrix — and **two of the three are palettes the reviewer themselves endorsed**. That
 * record says so outright, and parks the consequence rather than deciding it:
 *
 *   > "TWO ENDORSED PALETTES NOW FAIL THE ROLES MATRIX AND THE REVIEWER HAS NOT YET RULED ON THEM.
 *   > PHASE_0_DECISIONS.md §4's meta-rule is that an invariant which ever blocks an endorsed palette
 *   > is demoted. That rule is not applied here — the count is reported for the reviewer to overrule
 *   > or accept, which is a different act from demotion, and until they do, the gate is stricter
 *   > than the only human verdicts we have."
 *
 * This round is that act. It puts the two palettes back in front of the reviewer, on the judging
 * surface, with a plain statement of what newly fails and by how much, and asks whether the
 * endorsement stands or the rule was right.
 *
 * **A new, self-contained file in the review-server's directory.** It lives here for the reason
 * `sam-mask-quality.ts` gives: it builds an `OracleValidationFixture`, and a fixture builder that
 * drifts from the type it builds is the failure this server exists to prevent. Nothing in
 * `oracle-validation.ts` is modified — this file only imports.
 *
 * **What is judged is a palette, so the round renders the real mock player.** Unlike every other
 * `oracle-validation` round, the served image is not the whole stimulus: the stimulus is the
 * artwork *with this palette applied*, which is `REVIEW_UI.md` §3's primary judging surface. The
 * mock is part of the output contract and `review-ui/mock.js` is its single renderer, so this round
 * does NOT pre-render a panel — a second mock renderer would produce a surface no verdict has ever
 * been scoped to. Instead it ships a page (`review-ui/endorsement-recheck.html`) that imports that
 * exact, unmodified module, and a side-car this file writes beside it carrying the palettes. The
 * one server change is a single routing line in `batchReviewPaths()` keyed on
 * {@link ENDORSEMENT_RECHECK_LABEL_SCHEMA_VERSION}, so the dashboard links the round to its own page
 * rather than to `/oracle`, which renders no palette at all.
 *
 * **Both palettes are shown on a FLAT field, and that is deliberate.** One of the two carries a
 * v2-3 gradient. `data/legacy/endorsements.json`'s own `gradientAdvisory` says v2-3 gradients reuse
 * background/surface as endpoints and pin the midpoint at t=0.5, that v3 stops are decoupled from
 * roles, and that "role-level color matching is the reliable signal". The failures being adjudicated
 * are both on the **roles matrix** — which is exactly the matrix the ruling reports these two under —
 * so the roles are what is rendered. Reproducing the v2-3 ramp would also mean composing `fieldCss`
 * outside the server, and the page pastes the pinned display mapping's output, never composes it.
 *
 * **The answers are three, not two, and the third is the escape.** `REVIEW_UI.md` §4, added
 * 2026-08-04: a forced choice must have somewhere to put "I can't tell", and its share is a
 * first-class result rather than something subtracted. Recorded as
 * `d-2026-08-04-purity-rounds-need-escape-answer`.
 *
 * Regenerate the committed fixture and the page's side-car:
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/src/review-server/endorsement-recheck.ts --write
 */
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { apcaLcBetween, apcaRawBetween, colorDistance, colorFromHex, sameColorBar } from "../contract/color.ts"
import {
	ACCENT_FUNCTIONAL_DISTANCE,
	ACCENT_VISIBILITY_COLOR_DISTANCE,
	EPSILON_ACCENT_RAW,
	FOREGROUND_ACCENT_SEPARATION_DISTANCE,
} from "../contract/constants.ts"
import {
	PREMISE_DISAMBIGUATION_FIXTURE_VERSION,
	serializeFixture,
	validateFixture,
	type OracleQuestion,
	type OracleValidationFixture,
	type OracleValidationItem,
} from "./oracle-validation.ts"

/* ------------------------------------------------------------------------------------------- */
/* Identity                                                                                      */
/* ------------------------------------------------------------------------------------------- */

export const ENDORSEMENT_RECHECK_BATCH_ID = "endorsement-recheck-1"

/**
 * The marker that says "this round's items are palettes on the mock player, not bare artworks".
 *
 * It is a `labelSchemaVersion` for the same reason the free-text round's is: that is the column
 * every consumer of an `oracle-label` already reads before comparing anything, and it is what
 * `batchReviewPaths()` keys the page off. These answers are a ruling on a contract rule, and they
 * are not comparable with any VLM row or any other round's tokens.
 */
export const ENDORSEMENT_RECHECK_LABEL_SCHEMA_VERSION = "endorsement-recheck.v1"

/** Where the committed fixture lives. */
export const ENDORSEMENT_RECHECK_FIXTURE_PATH = fileURLToPath(
	new URL("../../data/oracle-validation/endorsement-recheck-1.json", import.meta.url),
)

/**
 * Where the page's side-car lives — under `review-ui/`, because that is the only directory the
 * server serves statically, and the page has to be able to fetch it.
 *
 * It carries the palettes and the arithmetic, keyed by question key, which is the one item field the
 * oracle payload does serve. It carries no answer key of any kind: there is nothing to blind here
 * (the reviewer endorsed these palettes and is being asked about them by name), but there is also
 * nothing in it the page does not draw.
 */
export const ENDORSEMENT_RECHECK_PAGE_DATA_PATH = fileURLToPath(
	new URL("../../review-ui/endorsement-recheck-1.data.json", import.meta.url),
)

const ENDORSEMENTS_PATH = fileURLToPath(new URL("../../data/legacy/endorsements.json", import.meta.url))

/** Repo-root-relative, for `builtFrom` and for the fixture's provenance. */
const ENDORSEMENTS_REF = "research/v3/data/legacy/endorsements.json"
const DECISIONS_REF = "research/v3/data/decisions/decisions.json"

/**
 * The two endorsement entry ids this round adjudicates.
 *
 * `[REVIEWED]` — named by `d-2026-08-04-reviewer-metric-follows-the-pair`, whose measured
 * consequence is "the roles matrix newly fails 3 — TWO OF THEM ENDORSEMENTS (one
 * I3.foreground-accent-not-separated, one I4.below-contrast-floor accent-vs-surface)". These are
 * those two. The builder re-derives the failure from the contract's own code and throws if either
 * palette no longer fails, so the round cannot silently outlive the ruling that motivated it.
 */
export const RECHECK_ENTRY_IDS = ["e7c9419abc1df0dd", "22e959d5164750bd"] as const

/**
 * Seed for the fixture. Fixed so the committed file is reproducible.
 * [UNCALIBRATED] — the build date, chosen here; any fixed value works. Nothing in this round is
 * shuffled (two items, and their order is the order the ruling lists them in), so it is recorded for
 * shape rather than used.
 */
export const ENDORSEMENT_RECHECK_SEED = 20260804

/* ------------------------------------------------------------------------------------------- */
/* The question                                                                                  */
/* ------------------------------------------------------------------------------------------- */

/**
 * The answering criterion, on screen for every item.
 *
 * `REVIEW_UI.md` §4, added 2026-08-04: "A round's framing text states the answering CRITERION, not
 * just the question" — the more expensive of two lessons learned that day, after two rounds turned
 * out to have been answered under a criterion the reviewer chose privately and disclosed afterwards.
 * So this says which reading is wanted, in the round's own words, where it will be read while
 * answering.
 */
export const RECHECK_INSTRUCTION =
	"Answer about THIS palette on THIS artwork, as rendered — not about the rule in general. " +
	"You endorsed this palette; nothing about it has changed. Only the rule that judges it has. " +
	"Keep the endorsement if you would still be happy to get this result, and the rule has to bend " +
	"for it. Say the rule is right if, seeing it again, this one was marginal and you can live with " +
	"losing it."

/** What §4's meta-rule does with each answer, stated to the reviewer so the stakes are not hidden. */
export const RECHECK_FRAMING =
	"PHASE_0_DECISIONS.md §4: an invariant that blocks an endorsed palette is demoted — the reviewer " +
	"outranks the rule. Keeping the endorsement means the rule gets an exception or a recalibration. " +
	"Neither answer is the safe one, and neither is a vote about the other item."

export const RECHECK_ANSWERS = [
	{
		key: "keep_the_endorsement",
		label: "keep the endorsement",
		gloss: "This palette is fine. The rule gets an exception or a recalibration.",
		hotkey: "1",
	},
	{
		key: "the_rule_is_right",
		label: "the rule is right",
		gloss: "Seeing it again, this palette was marginal. The rule stands and this endorsement goes.",
		hotkey: "2",
	},
	{
		key: "cant_tell",
		label: "I can't tell",
		gloss:
			"Genuinely undecidable from what is on screen. Not a way of skipping a hard one — this " +
			"answer's share is reported as a result of the round.",
		hotkey: "3",
	},
] as const

/* ------------------------------------------------------------------------------------------- */
/* Reading the endorsements                                                                      */
/* ------------------------------------------------------------------------------------------- */

type EndorsementRole = Readonly<{ hex: string; rgb: readonly number[]; name: string }>

type EndorsementEntry = Readonly<{
	entryId: string
	kind: string
	artwork: Readonly<{
		imagePath: string
		absolutePath: string
		contentSha256: string
		rendition: Readonly<{ format: string; width: number; height: number }>
		imageId: string
	}>
	palette: Readonly<{ roles: Readonly<Record<string, EndorsementRole>> }>
	roleSignature: string
}>

async function readEndorsements(): Promise<Map<string, EndorsementEntry>> {
	const parsed = JSON.parse(await readFile(ENDORSEMENTS_PATH, "utf8")) as { entries: EndorsementEntry[] }
	return new Map(parsed.entries.map((entry) => [entry.entryId, entry]))
}

/* ------------------------------------------------------------------------------------------- */
/* The arithmetic — re-derived from the contract, never restated                                 */
/* ------------------------------------------------------------------------------------------- */

/** One pair's measurements, in the units the reviewer is shown. */
export type PairMeasurement = Readonly<{
	from: string
	to: string
	fromHex: string
	toHex: string
	fromName: string
	toName: string
	distance: number
	rawApca: number
	lc: number
	sameColorBar: number
}>

function measure(
	roles: Readonly<Record<string, EndorsementRole>>,
	from: string,
	to: string,
): PairMeasurement {
	const a = colorFromHex(roles[from].hex)
	const b = colorFromHex(roles[to].hex)
	return {
		from,
		to,
		fromHex: roles[from].hex,
		toHex: roles[to].hex,
		fromName: roles[from].name,
		toName: roles[to].name,
		distance: colorDistance(a, b),
		rawApca: apcaRawBetween(a, b),
		lc: apcaLcBetween(a, b),
		sameColorBar: sameColorBar(a, b),
	}
}

/** Round for display without pretending to more precision than the reviewer needs. */
const show = (value: number, places: number): string => value.toFixed(places)

/**
 * The two failures, each derived from the contract's own constants and colour code.
 *
 * Every number in the sentence the reviewer reads is computed here, so the round cannot drift from
 * the gate it is adjudicating: if a threshold moves, this file's assertions fail and the fixture has
 * to be rebuilt before it can be pushed again.
 */
function describeFailure(entry: EndorsementEntry): {
	violationCode: string
	failureLine: string
	measurements: readonly PairMeasurement[]
	floors: Readonly<Record<string, number>>
} {
	const roles = entry.palette.roles

	if (entry.entryId === "e7c9419abc1df0dd") {
		const pair = measure(roles, "foreground", "accent")
		if (!(pair.distance < FOREGROUND_ACCENT_SEPARATION_DISTANCE)) {
			throw new Error(
				`${entry.entryId} no longer fails foreground-accent separation: ` +
					`${pair.distance} >= ${FOREGROUND_ACCENT_SEPARATION_DISTANCE}. The ruling this round adjudicates has moved; rebuild it.`,
			)
		}
		return {
			violationCode: "I3.foreground-accent-not-separated",
			failureLine:
				`The foreground (${pair.fromName}, ${pair.fromHex}) and the accent (${pair.toName}, ${pair.toHex}) are now ` +
				`closer than the new separation floor: OKLab distance ${show(pair.distance, 4)} against a floor of ` +
				`${show(FOREGROUND_ACCENT_SEPARATION_DISTANCE, 5)}. Nothing about this palette changed. Until 2026-08-04 this ` +
				`pair was only checked against the same-colour bar (${show(pair.sameColorBar, 4)}), which it clears easily. ` +
				`The ruling of 2026-08-04 moved the foreground-accent pair onto colour distance at an elevated bar — and the ` +
				`number that bar borrowed, ${show(ACCENT_VISIBILITY_COLOR_DISTANCE, 5)}, was measured on a different question ` +
				`("are the icons clearly visible on this background?", for an accent sitting on a field). Nobody has ever been ` +
				`shown a foreground and an accent side by side and asked how far apart they must be to read as two roles.`,
			measurements: [pair, measure(roles, "background", "surface")],
			floors: { FOREGROUND_ACCENT_SEPARATION_DISTANCE, ACCENT_VISIBILITY_COLOR_DISTANCE },
		}
	}

	if (entry.entryId === "22e959d5164750bd") {
		const pair = measure(roles, "accent", "surface")
		const belowFloor = Math.abs(pair.rawApca) < EPSILON_ACCENT_RAW
		const escapeDenied = pair.distance < ACCENT_FUNCTIONAL_DISTANCE
		if (!belowFloor || !escapeDenied) {
			throw new Error(
				`${entry.entryId} no longer fails accent-vs-surface: |raw| ${Math.abs(pair.rawApca)} vs ${EPSILON_ACCENT_RAW}, ` +
					`distance ${pair.distance} vs ${ACCENT_FUNCTIONAL_DISTANCE}. The ruling this round adjudicates has moved; rebuild it.`,
			)
		}
		return {
			violationCode: "I4.below-contrast-floor",
			failureLine:
				`The accent (${pair.fromName}, ${pair.fromHex}) has almost no luminance contrast against the surface ` +
				`(${pair.toName}, ${pair.toHex}): |raw APCA| ${show(Math.abs(pair.rawApca), 2)} against a floor of ` +
				`${show(EPSILON_ACCENT_RAW, 1)}. On the public Lc scale it reads ${show(Math.abs(pair.lc), 1)} — the scale ` +
				`saying it cannot see any contrast at all. This accent used to escape that floor on colour distance, and it is ` +
				`still ${show(pair.distance, 3)} from the surface in OKLab — but the escape now requires ` +
				`${show(ACCENT_FUNCTIONAL_DISTANCE, 5)}. The ruling of 2026-08-04 held that a *detection* distance ("can you ` +
				`see the difference?") is the wrong instrument for an escape from a contrast floor, so the escape moved to a ` +
				`functional distance 1.96x larger. That number is itself an uncalibrated placeholder — the geometric midpoint ` +
				`of two rungs of an old ladder — awaiting a functional-visibility round.`,
			measurements: [pair, measure(roles, "accent", "background"), measure(roles, "foreground", "accent")],
			floors: { EPSILON_ACCENT_RAW, ACCENT_FUNCTIONAL_DISTANCE, ACCENT_VISIBILITY_COLOR_DISTANCE },
		}
	}

	throw new Error(`no failure description for entry ${entry.entryId}`)
}

/* ------------------------------------------------------------------------------------------- */
/* Building                                                                                      */
/* ------------------------------------------------------------------------------------------- */

const ROLE_ORDER = ["background", "surface", "foreground", "accent"] as const

/** What the page needs to render one item: the palette in `mock.js`'s `side` shape, and the words. */
export type RecheckPageItem = Readonly<{
	questionKey: string
	entryId: string
	failureLine: string
	violationCode: string
	endorsedAs: string
	side: Readonly<{
		roles: readonly Readonly<{ role: string; hex: string; name: string; collapsed: boolean }>[]
		gradient: null
		fieldCss: string
	}>
	measurements: readonly PairMeasurement[]
	floors: Readonly<Record<string, number>>
	gradientNote: string | null
}>

const questionKeyFor = (entryId: string): string => `endorsement_recheck_${entryId}`

export async function buildEndorsementRecheckFixture(): Promise<{
	fixture: OracleValidationFixture
	pageData: { batchId: string; items: readonly RecheckPageItem[] }
}> {
	const endorsements = await readEndorsements()
	const questions: OracleQuestion[] = []
	const items: OracleValidationItem[] = []
	const pageItems: RecheckPageItem[] = []

	for (const entryId of RECHECK_ENTRY_IDS) {
		const entry = endorsements.get(entryId)
		if (entry === undefined) throw new Error(`endorsement ${entryId} is not in ${ENDORSEMENTS_REF}`)
		const failure = describeFailure(entry)
		const questionKey = questionKeyFor(entryId)

		questions.push({
			key: questionKey,
			kind: "enum",
			question: "Does this endorsement stand, or was the rule right?",
			instruction: RECHECK_INSTRUCTION,
			preamble: failure.failureLine,
			framing: RECHECK_FRAMING,
			answers: RECHECK_ANSWERS.map((answer) => ({ ...answer })),
		})

		items.push({
			itemId: `recheck-${entryId}`,
			questionKey,
			imagePath: entry.artwork.imagePath,
			sha256: entry.artwork.contentSha256,
			imageId: entry.artwork.imageId,
			artworkId: null,
			collection: "sharded-corpus",
			rendition: {
				source: ENDORSEMENTS_REF,
				sourceEntryId: entryId,
				longEdgePx: Math.max(entry.artwork.rendition.width, entry.artwork.rendition.height),
				width: entry.artwork.rendition.width,
				height: entry.artwork.rendition.height,
			},
			stratum: failure.violationCode,
		})

		const roles = entry.palette.roles
		pageItems.push({
			questionKey,
			entryId,
			failureLine: failure.failureLine,
			violationCode: failure.violationCode,
			endorsedAs: entry.kind,
			side: {
				roles: ROLE_ORDER.map((role) => ({
					role,
					hex: roles[role].hex,
					name: roles[role].name,
					collapsed: false,
				})),
				gradient: null,
				// A flat field is the background hex and nothing else — no display mapping is composed
				// here, which is the rule the page follows for gradients (`mock.js`: `side.fieldCss` is
				// pasted, never built).
				fieldCss: roles.background.hex,
			},
			measurements: failure.measurements,
			floors: failure.floors,
			gradientNote:
				entryId === "22e959d5164750bd"
					? "This endorsement carried a v2-3 gradient (background to surface, midpoint pinned at t=0.5). It is " +
						"shown here as a flat field: v3 stops are decoupled from roles, endorsements.json marks v2-3 gradient " +
						"comparison advisory-only, and the failure being adjudicated is on the roles matrix."
					: null,
		})
	}

	const fixture: OracleValidationFixture = {
		fixtureVersion: PREMISE_DISAMBIGUATION_FIXTURE_VERSION,
		batchId: ENDORSEMENT_RECHECK_BATCH_ID,
		purpose: "oracle-validation",
		labelSchemaVersion: ENDORSEMENT_RECHECK_LABEL_SCHEMA_VERSION,
		seed: ENDORSEMENT_RECHECK_SEED,
		generatedBy: "research/v3/src/review-server/endorsement-recheck.ts",
		builtFrom: [ENDORSEMENTS_REF, DECISIONS_REF],
		selection: {
			rule:
				"The two endorsed palettes that d-2026-08-04-reviewer-metric-follows-the-pair measured as newly " +
				"failing the roles matrix under the metric ruling of 2026-08-04, one per violation code. The third " +
				"newly-failing palette is known-bad and needs no ruling; the 11 advisory reconstructed-gradient " +
				"failures are a separate question and are not in this round.",
			counts: { endorsements: items.length, questions: questions.length },
		},
		questions,
		items,
		serveOrder: items.map((item) => item.itemId),
	}

	validateFixture(fixture)
	return { fixture, pageData: { batchId: ENDORSEMENT_RECHECK_BATCH_ID, items: pageItems } }
}

async function main(): Promise<void> {
	const { values } = parseArgs({ options: { write: { type: "boolean", default: false } }, strict: true })
	const { fixture, pageData } = await buildEndorsementRecheckFixture()
	if (!values.write) {
		process.stdout.write(
			`${fixture.batchId}: ${fixture.items.length} items, ${fixture.questions.length} questions\n` +
				pageData.items.map((item) => `  ${item.entryId} — ${item.violationCode}\n    ${item.failureLine}\n`).join(""),
		)
		return
	}
	await writeFile(ENDORSEMENT_RECHECK_FIXTURE_PATH, serializeFixture(fixture))
	await writeFile(ENDORSEMENT_RECHECK_PAGE_DATA_PATH, `${JSON.stringify(pageData, null, "\t")}\n`)
	process.stdout.write(
		`wrote ${ENDORSEMENT_RECHECK_FIXTURE_PATH}\nwrote ${ENDORSEMENT_RECHECK_PAGE_DATA_PATH}\n`,
	)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
