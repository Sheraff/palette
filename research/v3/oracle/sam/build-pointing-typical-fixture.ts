/**
 * Build the review fixture for the typical-strata pointing round (`pointing-typical-1`).
 *
 *     node --experimental-strip-types build-pointing-typical-fixture.ts
 *     node --experimental-strip-types build-pointing-typical-fixture.ts --write
 *     node --experimental-strip-types build-pointing-typical-fixture.ts --push http://127.0.0.1:3010
 *
 * Step 3 of three. Step 1 is `pointing_typical_probe.py`, the GPU run; step 2 is
 * `pointing_typical_round.py --write`, which renders the 48 panels; this turns that manifest into
 * the fixture the review server serves.
 *
 * **The question and its four answers are IMPORTED from the round-1 builder, not retyped.**
 * `POINTING_PROBE_NOTES.md` §13.8 freezes them verbatim — "any wording change breaks comparability
 * with this round" — and an import is the only guarantee that survives someone editing one copy.
 * What this round adds instead lives in the preamble, the instruction and the framing, which are
 * per-round text and were never frozen. Two things had to be said there:
 *
 * 1. **The strict criterion.** §13.8 makes it REQUIRED, and it is the reason this round exists:
 *    round 1 was answered "could this be considered correct" and the lenience went undeclared
 *    until afterwards, which cost that round its interpretability.
 * 2. **The plural dot.** The frozen question says "the green dot — the single pixel" and this
 *    round shows three. Editing the question to match would break the comparison the round is
 *    for, so the plural is explained in the framing instead.
 *
 * **The bar is not in this file's gift.** `POINTING_TYPICAL_PREREG.md` §6 fixed it, and it was
 * committed in `bafcc53` before the GPU run produced a single point. It is carried in
 * `selection.rule` so the fixture records what it was designed to decide.
 */

import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import {
	serializeFixture,
	validateFixture,
	type OracleValidationFixture,
	type OracleValidationItem,
} from "../../src/review-server/oracle-validation.ts"
import {
	PANEL_COLLECTION,
	POINTING_ANSWERS,
	POINTING_LABEL_SCHEMA_VERSION,
	POINTING_QUESTION_STEM,
} from "./build-pointing-round-1-fixture.ts"

/** [REVIEWED] Must equal `pointing_typical_probe.BATCH_ID`. The two are checked against each other. */
export const TYPICAL_BATCH_ID = "pointing-typical-1"

const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url))

export const TYPICAL_SAMPLE_PATH = fileURLToPath(
	new URL("../../data/sam/pointing-typical-1-sample.json", import.meta.url),
)
export const TYPICAL_FIXTURE_PATH = fileURLToPath(
	new URL(`../../data/sam/${TYPICAL_BATCH_ID}.json`, import.meta.url),
)

const SAMPLE_REPO_PATH = "research/v3/data/sam/pointing-typical-1-sample.json"

/**
 * [REVIEWED] Same question key and same label schema as `pointing-ground-1`, deliberately: the
 * whole point of freezing the wording is that the two rounds' answers are the same measurement,
 * and a different schema version would say they were not.
 */
const QUESTION_KEY = "pointing_ground"

export const TYPICAL_PREAMBLE =
	"Left is the artwork. Right is the same artwork with the model's answer drawn on it: green dots " +
	"where it pointed, and a pink wash over everything it then called background. Two separate " +
	"judgements, in one keypress. The DOT is the model's aim. The WASH is what it grew from that aim. " +
	"They fail differently and they are fixed differently, which is why they are asked apart. " +
	"Every cover in this round comes round three times, with the SAME dots under three different " +
	"washes — that is the experiment. Judge each tile on its own; do not try to remember or match " +
	"what you pressed on the others."

/**
 * [REVIEWED] §13.8, verbatim: "the round's own framing text must tell the reviewer explicitly to
 * answer 'is this correct' and NOT 'could this be considered correct'. This round's lenience went
 * undeclared until afterwards and cost it its interpretability. Without that instruction the two
 * rounds are not comparable at all."
 *
 * The second sentence pair separates the two things that got conflated last time: strictness about
 * WHICH REGION the wash claims (which is the measurement) from strictness about the EDGE of it
 * (which would just measure SAM's boundary quality and is not what failed).
 */
export const TYPICAL_INSTRUCTION =
	'Answer "is this correct" — NOT "could this be considered correct". This is the one thing that ' +
	"changed since the last round: it was answered charitably, and that cost it its meaning. " +
	"Be strict about WHICH pixels the wash claims. Stay relaxed about the exact edge — a ragged " +
	"boundary around the right region is still right, and the wrong region is still wrong however " +
	"neat its edge. Judge the pixels, not the wording. If it is genuinely a coin flip, answer with " +
	"your first read; do not deliberate."

export const TYPICAL_FRAMING =
	'The question below says "the green dot — the single pixel". It is kept word for word from the ' +
	"previous round so the two can be compared; this round simply shows several dots rather than one. " +
	"They are all points the model pointed at, and the pink wash was grown from all of them together. " +
	"`can't tell` is a real answer and it is not a failure to decide. Some covers genuinely have no " +
	"background — that finding is what started this whole line of work, and it is recorded, not " +
	"penalised. Use it whenever you could not draw the background yourself."

export const TYPICAL_SELECTION_RULE =
	"Forty-eight tiles: 16 covers x 3 mask-selection policies. The covers are drawn AT RANDOM from " +
	"the 142-image premise eval set with all 15 covers of the pointing test set excluded by id, so " +
	"this stratum is disjoint from `pointing-ground-1`. Nothing else is stratified on. What this " +
	"decides: `pointing-ground-1` failed its bar on the MISFIT TAIL — the covers this same reviewer " +
	"had already called 'none discernible' — and every one of its decidable failures was the wash, " +
	"never the dot. Two questions follow. Does the wash fail on ORDINARY covers too, or was that the " +
	"hard tail? And WHICH of three candidate mask-selection policies is right? Each cover's three " +
	"tiles are grown from IDENTICAL points, so the dots are the same on all three and the difference " +
	"between them is the policy alone — which is the comparison the last round's dot/wash split was " +
	"built to make and could not. THE BAR, fixed in POINTING_TYPICAL_PREREG.md §6 and committed " +
	"before the GPU run produced a single point: dot-right >= 12/16 AND, for at least one policy, " +
	"dot-right-and-wash-right >= 8/16. The previous round's 7/8 and 3/8 were answered leniently and " +
	"are ceilings; this round is answered strictly, so the comparison is biased AGAINST this round " +
	"and a tie reads as an improvement. Typical covers have no free-text prose behind them, so there " +
	"is NO independent answer key here: this round measures reviewer judgement only. No panel prints " +
	"a number, a phrasing, a model name or a policy name."

type ManifestItem = {
	itemId: string
	coverId: string
	policy: string
	stratum: string
	artwork: { imagePath: string; artworkId: string | null; collection: string }
	panel: { path: string; sha256: string; width: number; height: number } | null
}

type Manifest = {
	batchId: string
	seed: number
	builtFrom: string[]
	tileOrder: string[]
	items: ManifestItem[]
}

/**
 * Nothing that could tell the reviewer what the answer is may reach the browser.
 *
 * The round-1 list, plus this round's own additions. `policy` and `maskAreaFraction` are the two
 * that matter here: a reviewer who could see which policy produced a tile would be scoring the
 * label rather than the pixels, and that is precisely the comparison this round exists to make
 * blind. `sameCandidateAsContaining` would give the game away on exactly the tiles where the
 * policies disagree — the only tiles with any content.
 */
export function assertNoTypicalAnswerKey(fixture: OracleValidationFixture): void {
	const forbidden = [
		"reviewerGround",
		"groundRegions",
		"subjectRegions",
		"samAreaFraction",
		"maskAreaFraction",
		"maskStrategy",
		"sameCandidateAsContaining",
		"onFigure",
		"onMark",
		"conceptsAtPoints",
		"pointsNormalized",
		"pointsPixels",
		"phrasingKey",
		"samContainsPoints",
		"nDistinctPoints",
	]
	const serialized = JSON.stringify({ items: fixture.items, questions: fixture.questions })
	const hits = forbidden.filter((needle) => serialized.includes(needle))
	if (hits.length > 0) {
		throw new Error(
			`fixture would serve an answer key to the browser: ${hits.join(", ")}. ` +
				"These live in the manifest and must stay server-side.",
		)
	}
}

export async function buildTypicalFixture(): Promise<OracleValidationFixture> {
	const manifest = JSON.parse(await readFile(TYPICAL_SAMPLE_PATH, "utf8")) as Manifest
	if (manifest.batchId !== TYPICAL_BATCH_ID) {
		throw new Error(
			`manifest batchId ${manifest.batchId} != ${TYPICAL_BATCH_ID}; the two must agree`,
		)
	}

	const items: OracleValidationItem[] = []
	for (const entry of manifest.items) {
		if (entry.panel === null) {
			throw new Error(
				`${entry.itemId}: no panel on disk. Run pointing_typical_round.py --write first.`,
			)
		}
		// Hash the bytes on disk, not the manifest's claim about them. The server re-hashes at push
		// time and 400s on a mismatch, so a stale panel must fail here, with a better message.
		const bytes = await readFile(join(REPO_ROOT, entry.panel.path))
		const sha256 = createHash("sha256").update(bytes).digest("hex")
		if (sha256 !== entry.panel.sha256) {
			throw new Error(
				`${entry.itemId}: ${entry.panel.path} hashes ${sha256}, manifest recorded ${entry.panel.sha256}`,
			)
		}
		items.push({
			itemId: entry.itemId,
			questionKey: QUESTION_KEY,
			imagePath: entry.panel.path,
			sha256,
			// The (cover, policy) pair, not the artwork: three washes over the same dots are three
			// different items and the dedupe key must say so. Not served — the browser payload is
			// exactly {token, questionKey, media, width, height, answer, revision}.
			imageId: `${entry.coverId}|${entry.policy}`,
			artworkId: entry.artwork.artworkId,
			collection: PANEL_COLLECTION,
			rendition: {
				source: SAMPLE_REPO_PATH,
				sourceEntryId: entry.itemId,
				longEdgePx: Math.max(entry.panel.width, entry.panel.height),
				width: entry.panel.width,
				height: entry.panel.height,
			},
			stratum: entry.stratum,
		})
	}

	const byId = new Map(manifest.items.map((i) => [i.itemId, i]))
	const counts: Record<string, number> = {
		tiles: items.length,
		covers: new Set(manifest.items.map((i) => i.coverId)).size,
	}
	for (const entry of manifest.items) {
		counts[`policy_${entry.policy}`] = (counts[`policy_${entry.policy}`] ?? 0) + 1
	}

	const fixture: OracleValidationFixture = {
		fixtureVersion: "oracle-validation-1",
		batchId: TYPICAL_BATCH_ID,
		purpose: "oracle-validation",
		labelSchemaVersion: POINTING_LABEL_SCHEMA_VERSION,
		seed: manifest.seed,
		generatedBy: "research/v3/oracle/sam/build-pointing-typical-fixture.ts",
		builtFrom: [...manifest.builtFrom, SAMPLE_REPO_PATH],
		selection: { rule: TYPICAL_SELECTION_RULE, counts },
		questions: [
			{
				key: QUESTION_KEY,
				kind: "enum",
				question: POINTING_QUESTION_STEM,
				instruction: TYPICAL_INSTRUCTION,
				preamble: TYPICAL_PREAMBLE,
				framing: TYPICAL_FRAMING,
				answers: POINTING_ANSWERS,
			},
		],
		items,
		// The shuffle is the manifest's, computed once in Python with a pre-registered seed, so the
		// tile order is a property of the round rather than of whichever builder ran last.
		serveOrder: manifest.tileOrder.filter((id) => byId.has(id)),
	}

	if (fixture.serveOrder.length !== items.length) {
		throw new Error(
			`serveOrder covers ${fixture.serveOrder.length} of ${items.length} tiles; the manifest's ` +
				"tileOrder and its items disagree",
		)
	}

	validateFixture(fixture)
	assertNoTypicalAnswerKey(fixture)
	return fixture
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: { write: { type: "boolean", default: false }, push: { type: "string" } },
		strict: true,
	})
	const fixture = await buildTypicalFixture()

	process.stdout.write(
		`${fixture.batchId}: ${fixture.items.length} tiles, ` +
			`${fixture.questions.length} question, ${fixture.questions[0]!.answers.length} answers\n`,
	)
	process.stdout.write(
		`  hotkeys: ${fixture.questions[0]!.answers.map((a) => `${a.hotkey}=${a.key}`).join(" ")}\n`,
	)
	process.stdout.write(
		`  counts: ${Object.entries(fixture.selection.counts)
			.map(([k, v]) => `${k}=${v}`)
			.join(" ")}\n`,
	)

	if (values.write) {
		await writeFile(TYPICAL_FIXTURE_PATH, serializeFixture(fixture))
		process.stdout.write(`wrote ${TYPICAL_FIXTURE_PATH}\n`)
	}
	if (values.push !== undefined) {
		const response = await fetch(`${values.push}/api/oracle-validation`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				fixture,
				fundedBy: [
					"POINTING_PROBE_NOTES.md §13.8 — pointing-ground-1 measured the misfit tail and only the misfit tail; whether the wash failure generalises to ordinary covers is undecided by construction",
					"POINTING_PROBE_NOTES.md §14.7 — three selection policies on identical points, so the reviewer's keypress separates the policy from the pointer",
					"POINTING_TYPICAL_PREREG.md §6 — the bar (dot-right >= 12/16 AND, for one policy, dot-right-and-wash-right >= 8/16) was committed in bafcc53 before the GPU run made a single point",
				],
			}),
		})
		const body = await response.text()
		process.stdout.write(`pushed to ${values.push}: ${response.status} ${body}\n`)
		if (!response.ok) process.exitCode = 1
	}
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
