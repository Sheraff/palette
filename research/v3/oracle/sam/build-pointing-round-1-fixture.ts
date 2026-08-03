/**
 * Build the review fixture for the pointing ground round (`pointing-ground-1`).
 *
 *     node --experimental-strip-types build-pointing-round-1-fixture.ts
 *     node --experimental-strip-types build-pointing-round-1-fixture.ts --write
 *     node --experimental-strip-types build-pointing-round-1-fixture.ts --push http://127.0.0.1:3010
 *
 * Step 3 of three. Step 1 is `pointing_phrasing_sweep.py --pointer molmo`, the GPU sweep; step 2 is
 * `pointing_round_1.py --write`, which picks the eight tiles and renders the panels; this turns that
 * manifest into the fixture the review server serves.
 *
 * Why this does not reuse `buildSamMaskQualityFixture`: that builder hardcodes the mask-quality
 * question (`is this a correct <thing> mask?`, y/n/p). This round asks a different question with
 * four answers, so the fixture is built directly against `oracle-validation.ts` and validated by the
 * same `validateFixture` every other round goes through. No server code is modified or needed.
 *
 * **The bar is pre-registered and is not in this file's gift.** `POINTING_PHRASING_PREREG.md` §5
 * fixed it before any answer was seen: dot-right >= 6/8 AND dot-right-and-wash-right >= 4/8. It is
 * carried in `selection.rule` so the fixture itself records what it was designed to decide.
 */

import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import {
	serializeFixture,
	validateFixture,
	type OracleAnswerOption,
	type OracleValidationFixture,
	type OracleValidationItem,
} from "../../src/review-server/oracle-validation.ts"

/** [REVIEWED] Must equal `pointing_round_1.BATCH_ID`. The two are checked against each other. */
export const POINTING_BATCH_ID = "pointing-ground-1"

/** [REVIEWED] A human instrument, so the schema names the instrument, not a VLM schema version. */
export const POINTING_LABEL_SCHEMA_VERSION = "pointing-ground.v1"

const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url))

export const POINTING_SAMPLE_PATH = fileURLToPath(
	new URL("../../data/sam/pointing-round-1-sample.json", import.meta.url),
)
export const POINTING_FIXTURE_PATH = fileURLToPath(
	new URL(`../../data/sam/${POINTING_BATCH_ID}.json`, import.meta.url),
)

const SAMPLE_REPO_PATH = "research/v3/data/sam/pointing-round-1-sample.json"

/** The served image is a rendered two-panel PNG, never a bare artwork. */
export const PANEL_COLLECTION = "sam-review-overlay"

/**
 * [REVIEWED] The question, its four answers and their hotkeys.
 *
 * Wording carried from `POINTING_PROBE_NOTES.md` §8, which proposed it before the sweep ran, and
 * re-fixed in `POINTING_PHRASING_PREREG.md` §5.
 *
 * Digits, not letters. `review-ui/oracle.js` resolves an answer hotkey BEFORE it falls through to
 * `u` (undo) and `r` (release), so binding `r` would make release unreachable on this pass and
 * binding `u` would displace undo to Backspace. Digits are also the AZERTY-safe row
 * (`review-ui/keys.js` DIGIT_ROW), which is what this reviewer's keyboard is.
 */
export const POINTING_ANSWERS: readonly OracleAnswerOption[] = [
	{
		key: "dot_right_wash_right",
		label: "dot right, wash right",
		gloss: "the dot is on background, and the pink wash is (roughly) the background area",
		hotkey: "1",
	},
	{
		key: "dot_right_wash_wrong",
		label: "dot right, wash wrong",
		gloss: "the dot is on background, but the pink wash covers the wrong pixels — too much, too little, or the wrong region",
		hotkey: "2",
	},
	{
		key: "dot_wrong",
		label: "dot wrong",
		gloss: "the dot is not on background at all — it is on a subject, a figure or an object",
		hotkey: "3",
	},
	{
		key: "cant_tell",
		label: "can't tell",
		gloss: "this cover has no answer — you cannot say which pixels are background here, so neither can anyone else",
		hotkey: "4",
	},
]

export const POINTING_QUESTION_STEM =
	"The pink wash is what the model called the background. It was grown from the green dot — " +
	"the single pixel the model pointed at. Is the dot on the background? Is the wash the background?"

export const POINTING_PREAMBLE =
	"Left is the artwork. Right is the same artwork with the model's answer drawn on it: a green dot " +
	"where it pointed, and a pink wash over everything it then called background. Two separate " +
	"judgements, in one keypress. The DOT is the model's aim. The WASH is what it grew from that aim. " +
	"They fail differently and they are fixed differently, which is why they are asked apart."

export const POINTING_INSTRUCTION =
	"Judge the pixels, not the wording. Roughly right is right — do not hunt for a stray edge. " +
	"If it is genuinely a coin flip, answer with your first read; do not deliberate."

export const POINTING_FRAMING =
	"`can't tell` is a real answer and it is not a failure to decide. Some covers genuinely have no " +
	"background — that finding is what started this whole line of work, and it is recorded, not " +
	"penalised. Use it whenever you could not draw the background yourself."

export const POINTING_SELECTION_RULE =
	"Eight tiles, all from one MolmoPoint-8B run over the 15-cover pointing set, segmented by SAM 3.1 " +
	"point prompts. Six are the palette-decidable covers from `ground-freetext-1` — the covers where " +
	"the reviewer's own prose already fixes which pixels are ground, which is the only reason 'is the " +
	"dot on the background?' has an answer key at all. Two more are the covers where the picked " +
	"phrasing and its closest rival produced the most different masks, by mask IoU, because a " +
	"disagreement between two sentences is where a human eye is worth most. The three genuinely " +
	"ambiguous covers are deliberately NOT in the round: they have no correct answer and asking would " +
	"manufacture one. What this decides: every quality number about the pointing route so far is a " +
	"proxy — point-in-mask, not-on-a-face, phrasing agreement — and the pre-registered PASS criterion " +
	"needs a human and has never been scored. THE BAR, fixed in POINTING_PHRASING_PREREG.md §5 before " +
	"any answer was seen: carry pointing forward as a ground route only if dot-right >= 6/8 AND " +
	"dot-right-and-wash-right >= 4/8. The dot and the wash are separated deliberately — a right dot " +
	"under a bad wash is a SAM candidate-selection problem, a wrong dot is a pointer problem, and " +
	"pooling them would hide which one we have. No panel prints a number, a phrasing or a model name."

type ManifestItem = {
	itemId: string
	coverId: string
	phrasingKey: string
	stratum: string
	artwork: { imagePath: string; artworkId: string | null; collection: string }
	panel: { path: string; sha256: string; width: number; height: number } | null
}

type Manifest = {
	batchId: string
	seed: number
	pickedPhrasing: string
	rivalPhrasing: string
	builtFrom: string[]
	items: ManifestItem[]
}

/**
 * Nothing that could tell the reviewer what the answer is may reach the browser.
 *
 * Mirrors `assertNoAnswerKey` in `sam-mask-quality.ts`, with the forbidden list adapted to THIS
 * round's manifest: the reviewer's own prose, the mask area, the on-figure judgement, the phrasing
 * that produced the dot and the model that produced it are all in the manifest and none of them may
 * be served. A string scan, not a key check, because a nested value is just as much of a leak.
 */
export function assertNoPointingAnswerKey(fixture: OracleValidationFixture): void {
	const forbidden = [
		"reviewerGround",
		"groundRegions",
		"subjectRegions",
		"samAreaFraction",
		"onFigure",
		"onMark",
		"conceptsAtPoints",
		"pointsNormalized",
		"phrasingKey",
		"samContainsPoints",
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

/** Deterministic shuffle, seeded, so the serve order is reproducible from the fixture alone. */
function shuffled<T>(values: readonly T[], seed: number): T[] {
	const out = [...values]
	let state = seed >>> 0
	const next = (): number => {
		state = (state * 1664525 + 1013904223) >>> 0
		return state / 0x100000000
	}
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(next() * (i + 1))
		;[out[i], out[j]] = [out[j]!, out[i]!]
	}
	return out
}

export async function buildPointingFixture(): Promise<OracleValidationFixture> {
	const manifest = JSON.parse(await readFile(POINTING_SAMPLE_PATH, "utf8")) as Manifest
	if (manifest.batchId !== POINTING_BATCH_ID) {
		throw new Error(
			`manifest batchId ${manifest.batchId} != ${POINTING_BATCH_ID}; the two must agree`,
		)
	}

	const items: OracleValidationItem[] = []
	for (const entry of manifest.items) {
		if (entry.panel === null) {
			throw new Error(
				`${entry.itemId}: no panel on disk. Run pointing_round_1.py --write before building.`,
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
			questionKey: "pointing_ground",
			imagePath: entry.panel.path,
			sha256,
			// The (cover, phrasing) pair, not the artwork: the answer is about this dot on this
			// cover, and the same cover under another sentence would be a different item.
			imageId: `${entry.coverId}|${entry.phrasingKey}`,
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

	const fixture: OracleValidationFixture = {
		fixtureVersion: "oracle-validation-1",
		batchId: POINTING_BATCH_ID,
		purpose: "oracle-validation",
		labelSchemaVersion: POINTING_LABEL_SCHEMA_VERSION,
		seed: manifest.seed,
		generatedBy: "research/v3/oracle/sam/build-pointing-round-1-fixture.ts",
		builtFrom: [...manifest.builtFrom, SAMPLE_REPO_PATH],
		selection: {
			rule: POINTING_SELECTION_RULE,
			counts: {
				tiles: items.length,
				decidableSix: items.filter((i) => i.stratum === "decidable-six").length,
				phrasingDisagreement: items.filter((i) => i.stratum === "phrasing-disagreement").length,
			},
		},
		questions: [
			{
				key: "pointing_ground",
				kind: "enum",
				question: POINTING_QUESTION_STEM,
				instruction: POINTING_INSTRUCTION,
				preamble: POINTING_PREAMBLE,
				framing: POINTING_FRAMING,
				answers: POINTING_ANSWERS,
			},
		],
		items,
		serveOrder: shuffled(
			items.map((i) => i.itemId),
			manifest.seed,
		),
	}

	validateFixture(fixture)
	assertNoPointingAnswerKey(fixture)
	return fixture
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: { write: { type: "boolean", default: false }, push: { type: "string" } },
		strict: true,
	})
	const fixture = await buildPointingFixture()

	process.stdout.write(
		`${fixture.batchId}: ${fixture.items.length} tiles, ` +
			`${fixture.questions.length} question, ${fixture.questions[0]!.answers.length} answers\n`,
	)
	for (const item of fixture.items) {
		process.stdout.write(`  ${item.itemId}  ${item.stratum.padEnd(22)} ${item.imageId}\n`)
	}
	process.stdout.write(
		`  hotkeys: ${fixture.questions[0]!.answers.map((a) => `${a.hotkey}=${a.key}`).join(" ")}\n`,
	)

	if (values.write) {
		await writeFile(POINTING_FIXTURE_PATH, serializeFixture(fixture))
		process.stdout.write(`wrote ${POINTING_FIXTURE_PATH}\n`)
	}
	if (values.push !== undefined) {
		const response = await fetch(`${values.push}/api/oracle-validation`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				fixture,
				fundedBy: [
					"POINTING_PROBE_NOTES.md §7.1 — every quality number for the pointing route is a proxy; the pre-registered PASS criterion needs a human and has never been scored",
					"POINTING_PHRASING_PREREG.md §5 — the bar (dot-right >= 6/8 AND dot-right-and-wash-right >= 4/8) was fixed before any answer was seen",
				],
			}),
		})
		const body = await response.text()
		process.stdout.write(`pushed to ${values.push}: ${response.status} ${body}\n`)
		if (!response.ok) process.exitCode = 1
	}
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
