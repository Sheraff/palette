/**
 * The dropped-colours round — `dropped-colors-1`.
 *
 * **Why this round exists.** `reviews/toolbox-review/bias-audit.md` B1 measured that invariant 2's
 * exact-8-bit-triple population floor refuses 96.9% of the reviewer's own endorsed palettes, and
 * proposed measuring population inside the calibrated same-colour bar instead. That fix takes the
 * refusal rate to 17.7% — and B1 says outright what the residual is for:
 *
 *   > "The residual 17.7% is not waste — it is the first honest review batch for this invariant:
 *   > put those 62 in front of the reviewer and let the floor be calibrated against endorsements
 *   > instead of against a noise argument."
 *
 * This round is that batch, at the colour level. `src/contract/BELONGS_STUDY.md` measured the 62
 * palettes down to **53 distinct (artwork, colour) units** that still fail, and — more importantly —
 * measured that no pixel feature tried, population or mode-distance or hue, separates endorsed
 * colours from known-bad ones at all. So the study could not recommend a calibrated threshold, and
 * says why: **there is no colour-level "does not belong" label in the campaign to calibrate
 * against.** `known-bad.json` grades palettes, not colours.
 *
 * This round is the first payment on that label. It asks the one question that would let any of it
 * be calibrated, about colours the reviewer has already endorsed once, in a palette they already
 * approved: *does this colour belong in this artwork's palette?*
 *
 * **What is judged is a palette, so the round renders the real mock player.** Same reasoning as
 * `endorsement-recheck.ts`: the stimulus is the artwork *with this palette applied*, which is
 * `REVIEW_UI.md` §3's primary judging surface, and `review-ui/mock.js` is its single renderer. This
 * file ships a page that imports that exact module unmodified, plus a side-car keyed on
 * `questionKey`. The one server change is a routing line in `batchReviewPaths()`.
 *
 * **Every number the reviewer reads is re-derived from the artwork's pixels at build time**, by
 * `measureBelonging` in `src/contract/belongs-study.ts` — the same function that produced the study.
 * The data file only chooses *which* colours to ask about. If a selected colour no longer fails the
 * neighbourhood rule, the builder throws rather than asking about a premise that has evaporated.
 *
 * **Palettes are shown on a flat field.** `data/legacy/endorsements.json`'s `gradientAdvisory` says
 * v2-3 gradients reuse background/surface as endpoints and that role-level colour matching is the
 * reliable signal; the question here is about one role colour. `side.fieldCss` is pasted, never
 * composed, exactly as `mock.js` requires.
 *
 * **Three answers, and the third is the escape.** `REVIEW_UI.md` §4, added 2026-08-04: a forced
 * choice must have somewhere to put "I can't tell", and its share is a first-class result rather
 * than something subtracted (`d-2026-08-04-purity-rounds-need-escape-answer`).
 *
 * Regenerate the committed fixture and the page's side-car:
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types \
 *     research/v3/src/review-server/dropped-colors.ts --write
 */
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

import { measureBelonging, PRIMARY_MASS_FLOOR, PRIMARY_RADIUS } from "../contract/belongs-study.ts"
import { SOURCE_POPULATION_FLOOR } from "../contract/constants.ts"
import { nameHexes } from "./color.ts"
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

export const DROPPED_COLORS_BATCH_ID = "dropped-colors-1"

/**
 * The marker that says "this round's items are palettes on the mock player, and the question is
 * about one named role colour of each".
 *
 * A fresh `labelSchemaVersion` because the answer vocabulary is new: a `belongs` verdict is not
 * comparable with an `endorsement-recheck.v1` ruling on a rule, nor with any VLM row.
 */
export const DROPPED_COLORS_LABEL_SCHEMA_VERSION = "dropped-colors.v1"

/** Where the committed fixture lives. */
export const DROPPED_COLORS_FIXTURE_PATH = fileURLToPath(
	new URL("../../data/oracle-validation/dropped-colors-1.json", import.meta.url),
)

/**
 * Where the page's side-car lives — under `review-ui/`, the only statically served directory.
 *
 * It carries the palettes and the measured numbers, keyed by question key. **It carries no answer
 * key of any kind**: there is nothing to blind (the reviewer is being asked about palettes they
 * endorsed, by name), and there is nothing in it the page does not draw.
 */
export const DROPPED_COLORS_PAGE_DATA_PATH = fileURLToPath(
	new URL("../../review-ui/dropped-colors-1.data.json", import.meta.url),
)

const STUDY_PATH = fileURLToPath(new URL("../../data/contract/belongs-study.json", import.meta.url))
const ENDORSEMENTS_PATH = fileURLToPath(new URL("../../data/legacy/endorsements.json", import.meta.url))

const STUDY_REF = "research/v3/data/contract/belongs-study.json"
const ENDORSEMENTS_REF = "research/v3/data/legacy/endorsements.json"
const AUDIT_REF = "research/v3/reviews/toolbox-review/bias-audit.md"

/**
 * How many of the 53 residual colours this round asks about.
 *
 * `[UNCALIBRATED]` — a reviewer-bandwidth budget, not a measurement. 20 items at a palette-sized
 * judgement each is roughly the size of round the campaign has been able to turn around in one
 * sitting; `REVIEW_UI.md` §6 asks for rounds that resume in ten-minute chunks, and this one does.
 * The remaining 33 are not discarded — they are the same population, and a second batch is cheap
 * once this one has an answer shape that works.
 */
export const DROPPED_COLORS_ITEM_BUDGET = 20

/**
 * Seed for the fixture. Fixed so the committed file is reproducible.
 *
 * `[UNCALIBRATED]` — the build date. The selection below is a deterministic stride across the
 * sorted failure margin rather than a random draw, so the seed is recorded for shape rather than
 * used; nothing in this round is shuffled.
 */
export const DROPPED_COLORS_SEED = 20260804

/* ------------------------------------------------------------------------------------------- */
/* The question                                                                                  */
/* ------------------------------------------------------------------------------------------- */

/**
 * The answering criterion, on screen for every item.
 *
 * `REVIEW_UI.md` §4, added 2026-08-04: "A round's framing text states the answering CRITERION, not
 * just the question." Two rounds have already been governed by a criterion the reviewer chose
 * privately and disclosed only afterwards, which turns every rate into a ceiling of unknown height.
 * So this says which reading is wanted, where it will be read while answering.
 *
 * The distinction it has to carry is the reviewer's own reframe: not "is this colour in the
 * artwork" (it is — every one of these is an exact pixel of it) but "does it feel like it belongs".
 */
export const DROPPED_COLORS_INSTRUCTION =
	"Answer about THIS colour in THIS palette on THIS artwork, as rendered — not about the rule in " +
	"general, and not about whether the palette as a whole is good. The question is not whether the " +
	"colour is in the artwork: every colour here is an exact pixel of it. The question is whether it " +
	"feels like it belongs — whether a designer looking at this cover would accept this colour as " +
	"one of its colours. Answer 'belongs' if you would still be happy to get this colour here. " +
	"Answer 'does not belong' if, seeing it again, it reads as arbitrary or imported."

/** What the round does with each answer, stated so the stakes are not hidden. */
export const DROPPED_COLORS_FRAMING =
	"Every colour in this round is one you already endorsed, and one that invariant 2's population " +
	"floor would refuse to publish even after the same-colour-bar fix. src/contract/BELONGS_STUDY.md " +
	"measured that no pixel feature tried tells endorsed colours apart from known-bad ones, so it " +
	"could not recommend a calibrated threshold — the campaign has no colour-level 'does not belong' " +
	"label to calibrate against. These answers are that label. 'Belongs' is evidence the floor should " +
	"be demoted to advisory; 'does not belong' is evidence it is catching something real."

export const DROPPED_COLORS_ANSWERS = [
	{
		key: "belongs",
		label: "belongs",
		gloss: "This colour is one of this artwork's colours. Dropping it would be a loss.",
		hotkey: "1",
	},
	{
		key: "does_not_belong",
		label: "does not belong",
		gloss: "Seeing it again, this colour reads as arbitrary or imported. The rule would be right to drop it.",
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
/* Reading the study and the endorsements                                                        */
/* ------------------------------------------------------------------------------------------- */

type StudyFailure = Readonly<{
	set: string
	entryId: string
	imagePath: string
	sha: string
	imageId: string
	roles: readonly string[]
	hex: string
	name: string
	region: string
	neighbourhoodShare: number
}>

type EndorsementRole = Readonly<{ hex: string; rgb: readonly number[]; name: string }>

type EndorsementEntry = Readonly<{
	entryId: string
	kind: string
	artwork: Readonly<{
		imagePath: string
		contentSha256: string
		rendition: Readonly<{ format: string; width: number; height: number }>
		imageId: string
	}>
	palette: Readonly<{ roles: Readonly<Record<string, EndorsementRole>> }>
}>

async function readStudyFailures(): Promise<readonly StudyFailure[]> {
	const parsed = JSON.parse(await readFile(STUDY_PATH, "utf8")) as { neighbourhoodFailures: StudyFailure[] }
	const failures = parsed.neighbourhoodFailures
	if (!Array.isArray(failures) || failures.length === 0) {
		throw new Error(
			`${STUDY_REF} lists no residual failures — the premise of this round has evaporated. ` +
				"Regenerate the study before rebuilding this fixture.",
		)
	}
	return failures
}

const roleCountOf = (entry: EndorsementEntry): number =>
	ROLE_ORDER.filter((role) => entry.palette.roles[role] !== undefined).length

/**
 * The best endorsement entry to *render* for each (artwork, colour) pair.
 *
 * The study's unit is (artwork, hex) and it records whichever entry it met first; that entry is not
 * necessarily the one that draws best. Several endorsements often publish the same colour on the
 * same artwork, and `endorsements.json` holds three partial entries — two accent-only conversational
 * corrections and one with no accent. This picks the entry with the most roles, so the reviewer sees
 * the fullest palette that actually contains the colour under question.
 */
async function readRenderableEntries(): Promise<Map<string, EndorsementEntry>> {
	const parsed = JSON.parse(await readFile(ENDORSEMENTS_PATH, "utf8")) as { entries: EndorsementEntry[] }
	const best = new Map<string, EndorsementEntry>()
	for (const entry of parsed.entries) {
		for (const role of ROLE_ORDER) {
			const color = entry.palette.roles[role]
			if (color === undefined) continue
			const key = `${entry.artwork.contentSha256}|${color.hex}`
			const current = best.get(key)
			if (current === undefined || roleCountOf(entry) > roleCountOf(current)) best.set(key, entry)
		}
	}
	return best
}

/**
 * Deterministic stride across the sorted failure margin.
 *
 * The 53 residual colours span a narrow band just under the floor (6.59e-5 to 9.79e-4, against a
 * floor of 1e-3). The brief asks for a sample "across failure margin", so this takes an even stride
 * over the margin-sorted list rather than the worst 20 — sampling only the deepest failures would
 * answer a different question (are extreme cases bad?) than the one that calibrates a floor (where
 * does belonging stop?), and would bias the round toward 'does not belong'.
 *
 * Both endpoints are always included, so the round spans the full margin it is sampling.
 */
export function selectAcrossMargin<T>(sorted: readonly T[], budget: number): T[] {
	if (sorted.length <= budget) return [...sorted]
	const picked: T[] = []
	for (let slot = 0; slot < budget; slot += 1) {
		picked.push(sorted[Math.round((slot * (sorted.length - 1)) / (budget - 1))])
	}
	return picked
}

/* ------------------------------------------------------------------------------------------- */
/* Building                                                                                      */
/* ------------------------------------------------------------------------------------------- */

const ROLE_ORDER = ["background", "surface", "foreground", "accent"] as const

export type DroppedColorPageItem = Readonly<{
	questionKey: string
	entryId: string
	/** The colour the rule would drop, and the role(s) that publish it. */
	droppedHex: string
	droppedName: string
	droppedRoles: readonly string[]
	dropLine: string
	region: string
	measurements: Readonly<{
		exactShare: number
		neighbourhoodShare: number
		populationFloor: number
		modeDistance: number | null
		nearestModeHex: string | null
		nearestModeName: string | null
		nearestModeMass: number | null
		substantialModes: number
		modeRadius: number
		modeMassFloor: number
	}>
	side: Readonly<{
		roles: readonly Readonly<{ role: string; hex: string; name: string; collapsed: boolean }>[]
		gradient: null
		fieldCss: string
	}>
	gradientNote: string | null
}>

const questionKeyFor = (entryId: string, hex: string): string =>
	`dropped_color_${entryId}_${hex.slice(1)}`

/** Percentages small enough that two significant figures is the honest spelling. */
function showShare(fraction: number): string {
	const percent = fraction * 100
	return percent < 0.01 ? percent.toPrecision(2) : percent.toFixed(3)
}

export async function buildDroppedColorsFixture(): Promise<{
	fixture: OracleValidationFixture
	pageData: { batchId: string; items: readonly DroppedColorPageItem[] }
}> {
	const failures = await readStudyFailures()
	const renderable = await readRenderableEntries()

	// The study writes `neighbourhoodFailures` already sorted ascending by margin, but this round
	// must not depend on that: sort again here so the selection is a function of the values, not of
	// the upstream file's ordering.
	const sorted = [...failures].sort((first, second) => first.neighbourhoodShare - second.neighbourhoodShare)

	// A colour whose only endorsement is a partial palette cannot be asked about here: the question
	// is whether it belongs in *this artwork's palette*, and a mock drawn from one role is a
	// different stimulus with no background, surface or foreground to judge it against. Excluded
	// rather than rendered half-empty, and the count travels in `selection` so the round's
	// population is not quietly narrower than the study's.
	const askable = sorted.filter((failure) => {
		const entry = renderable.get(`${failure.sha}|${failure.hex}`)
		return entry !== undefined && roleCountOf(entry) === ROLE_ORDER.length
	})
	const excludedForPartialPalette = sorted.length - askable.length
	if (askable.length === 0) {
		throw new Error("no residual failure has a full-palette endorsement to render — nothing to ask about")
	}

	const chosen = selectAcrossMargin(askable, DROPPED_COLORS_ITEM_BUDGET)

	const questions: OracleQuestion[] = []
	const items: OracleValidationItem[] = []
	const pageItems: DroppedColorPageItem[] = []

	for (const failure of chosen) {
		const entry = renderable.get(`${failure.sha}|${failure.hex}`)
		if (entry === undefined) {
			throw new Error(`no endorsement publishes ${failure.hex} on ${failure.imageId} in ${ENDORSEMENTS_REF}`)
		}

		// Re-derive from the pixels. The study file chose the colour; the contract's own code is what
		// puts a number on screen.
		const measured = await measureBelonging(entry.artwork.imagePath, entry.artwork.contentSha256, failure.hex)
		if (measured.neighbourhoodPasses) {
			throw new Error(
				`${failure.hex} on ${failure.imageId} no longer fails the neighbourhood rule ` +
					`(${measured.neighbourhoodShare} >= ${SOURCE_POPULATION_FLOOR}). The premise this round ` +
					"adjudicates has moved; regenerate the study and rebuild.",
			)
		}

		const roles = entry.palette.roles
		const droppedRoles = ROLE_ORDER.filter((role) => roles[role]?.hex === failure.hex)
		if (droppedRoles.length === 0) {
			throw new Error(`${failure.hex} is not published by any role of endorsement ${entry.entryId}`)
		}

		const modeNames = measured.nearestModeHex === null ? {} : nameHexes([measured.nearestModeHex])
		const nearestModeName = measured.nearestModeHex === null ? null : modeNames[measured.nearestModeHex]

		const roleWord = droppedRoles.length === 1 ? droppedRoles[0] : droppedRoles.join(" and ")
		const modeClause =
			measured.modeDistance === null || measured.nearestModeHex === null
				? "this artwork has no colour mode above " +
					`${(PRIMARY_MASS_FLOOR * 100).toFixed(1)}% of its area to compare it against`
				: `the nearest substantial colour mode of the artwork is ${nearestModeName} ` +
					`(${measured.nearestModeHex}, ${(measured.nearestModeMass ?? 0) * 100 >= 0.1 ? ((measured.nearestModeMass ?? 0) * 100).toFixed(1) : "<0.1"}% of the artwork), ` +
					`${measured.modeDistance.toFixed(3)} away in OKLab`

		const dropLine =
			`The rule would drop the ${roleWord} — ${failure.name}, ${failure.hex}. ` +
			`It covers ${showShare(measured.neighbourhoodShare)}% of the artwork counting every pixel within ` +
			`the same-colour bar, against a floor of ${showShare(SOURCE_POPULATION_FLOOR)}%; ` +
			`${modeClause}.`

		const questionKey = questionKeyFor(entry.entryId, failure.hex)

		questions.push({
			key: questionKey,
			kind: "enum",
			question: "Does this colour belong in this artwork's palette?",
			instruction: DROPPED_COLORS_INSTRUCTION,
			preamble: dropLine,
			framing: DROPPED_COLORS_FRAMING,
			answers: DROPPED_COLORS_ANSWERS.map((answer) => ({ ...answer })),
		})

		items.push({
			itemId: `dropped-${entry.entryId}-${failure.hex.slice(1)}`,
			questionKey,
			imagePath: entry.artwork.imagePath,
			sha256: entry.artwork.contentSha256,
			imageId: entry.artwork.imageId,
			artworkId: null,
			collection: "sharded-corpus",
			rendition: {
				source: ENDORSEMENTS_REF,
				sourceEntryId: entry.entryId,
				longEdgePx: Math.max(entry.artwork.rendition.width, entry.artwork.rendition.height),
				width: entry.artwork.rendition.width,
				height: entry.artwork.rendition.height,
			},
			// Per-stratum reporting: which role the dropped colour serves is the axis the study found
			// the rule most biased on (accent 11.1% vs surface 0.8%).
			stratum: droppedRoles.join("+"),
		})

		pageItems.push({
			questionKey,
			entryId: entry.entryId,
			droppedHex: failure.hex,
			droppedName: failure.name,
			droppedRoles,
			dropLine,
			region: failure.region,
			measurements: {
				exactShare: measured.exactShare,
				neighbourhoodShare: measured.neighbourhoodShare,
				populationFloor: SOURCE_POPULATION_FLOOR,
				modeDistance: measured.modeDistance,
				nearestModeHex: measured.nearestModeHex,
				nearestModeName,
				nearestModeMass: measured.nearestModeMass,
				substantialModes: measured.substantialModes,
				modeRadius: PRIMARY_RADIUS,
				modeMassFloor: PRIMARY_MASS_FLOOR,
			},
			side: {
				roles: ROLE_ORDER.filter((role) => roles[role] !== undefined).map((role) => ({
					role,
					hex: roles[role].hex,
					name: roles[role].name,
					collapsed: false,
				})),
				gradient: null,
				// A flat field is the background hex and nothing else — no display mapping is composed
				// here (`mock.js`: `side.fieldCss` is pasted, never built).
				fieldCss: roles.background?.hex ?? roles[droppedRoles[0]].hex,
			},
			gradientNote: null,
		})
	}

	const fixture: OracleValidationFixture = {
		fixtureVersion: PREMISE_DISAMBIGUATION_FIXTURE_VERSION,
		batchId: DROPPED_COLORS_BATCH_ID,
		purpose: "oracle-validation",
		labelSchemaVersion: DROPPED_COLORS_LABEL_SCHEMA_VERSION,
		seed: DROPPED_COLORS_SEED,
		generatedBy: "research/v3/src/review-server/dropped-colors.ts",
		builtFrom: [STUDY_REF, ENDORSEMENTS_REF, AUDIT_REF],
		selection: {
			rule:
				`Endorsed colours that STILL fail invariant 2's population floor after B1's same-colour-bar ` +
				`fix — ${sorted.length} distinct (artwork, colour) units, measured by ${STUDY_REF}. ` +
				`${DROPPED_COLORS_ITEM_BUDGET} are asked about here, taken as an even stride across the ` +
				`margin-sorted list (both endpoints included) rather than the worst ${DROPPED_COLORS_ITEM_BUDGET}: ` +
				"sampling only the deepest failures would answer whether extreme cases are bad, not where " +
				"belonging stops, and would bias the round toward 'does not belong'. Colours whose only " +
				"endorsement is a partial palette are excluded first (see excludedForPartialPalette): the " +
				"question is whether a colour belongs in this artwork's PALETTE, and a mock drawn from one " +
				"role has no background, surface or foreground to judge it against. Every displayed number is " +
				"re-derived from the artwork's pixels at build time and the builder refuses to build a colour " +
				"that no longer fails.",
			counts: {
				residualFailures: sorted.length,
				askable: askable.length,
				excludedForPartialPalette,
				asked: items.length,
				questions: questions.length,
			},
		},
		questions,
		items,
		serveOrder: items.map((item) => item.itemId),
	}

	validateFixture(fixture)
	return { fixture, pageData: { batchId: DROPPED_COLORS_BATCH_ID, items: pageItems } }
}

async function main(): Promise<void> {
	const { values } = parseArgs({ options: { write: { type: "boolean", default: false } }, strict: true })
	const { fixture, pageData } = await buildDroppedColorsFixture()
	if (!values.write) {
		process.stdout.write(
			`${fixture.batchId}: ${fixture.items.length} items, ${fixture.questions.length} questions\n` +
				pageData.items
					.map((item) => `  ${item.droppedHex} ${item.droppedName} [${item.droppedRoles.join("+")}]\n    ${item.dropLine}\n`)
					.join(""),
		)
		return
	}
	await writeFile(DROPPED_COLORS_FIXTURE_PATH, serializeFixture(fixture))
	await writeFile(DROPPED_COLORS_PAGE_DATA_PATH, `${JSON.stringify(pageData, null, "\t")}\n`)
	process.stdout.write(`wrote ${DROPPED_COLORS_FIXTURE_PATH}\nwrote ${DROPPED_COLORS_PAGE_DATA_PATH}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
