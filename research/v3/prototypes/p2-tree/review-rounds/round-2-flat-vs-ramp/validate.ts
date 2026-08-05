/**
 * Gate for P2 round 2. Exit 0 or the round does not ship.
 *
 * Two of these checks are the round's actual safety property and not bookkeeping. The **leak scan**
 * reads the fixture's raw bytes and fails on any candidate name, any constant under consideration,
 * any of the automatic reading's own verdict words, and any per-artwork legacy record — this round's
 * whole value is that the reviewer answers about the artwork with nothing on screen telling them
 * what the machine thinks. The **double build** re-runs the builder twice and byte-compares, because
 * a selection that cannot be reproduced is a selection nobody can audit.
 *
 *   NODE_NO_WARNINGS=1 node --experimental-strip-types validate.ts
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { validateFixture, type OracleValidationFixture } from "../../../../src/review-server/oracle-validation.ts"
import { BATCH_ID, LABEL_SCHEMA_VERSION, QUESTION_KEY, RETIRED_LABEL_SCHEMA_VERSION } from "./build.ts"

const HERE = fileURLToPath(new URL("./", import.meta.url))
const REPO_ROOT = fileURLToPath(new URL("../../../../../../", import.meta.url))
const FIXTURE_PATH = join(HERE, "fixture.json")
const BUILD_PATH = join(HERE, "build.ts")

const EXPECTED_ITEMS = 8
/** Any one of these, as an answer key, is a reviewer's way out of a forced choice. */
const ESCAPE_KEYS = new Set(["cant_tell", "cannot_tell", "unsure", "none_discernible"])

/**
 * What must never appear in the fixture, matched case-insensitively as substrings.
 *
 * Three groups, and every entry earns its place. Candidate and family names would tell the reviewer
 * whose reading they are being asked to underwrite. The constants and the measurement words would
 * tell them a number exists and roughly what it is measuring. The automatic reading's verdict
 * vocabulary and the legacy record would tell them the answer outright — `flat` and `gradient` are
 * absent from this list only because they are the reviewer's OWN vocabulary here, offered as answers
 * rather than asserted about any artwork.
 */
const FORBIDDEN = [
	// the prototype, the round and the arms — the class of leak that aborted the first staging.
	// `p2` is bare on purpose: it is the token that rode in on a schema version and a batch id, both
	// of which are served, and it cannot collide with a content hash (hex has no `p`).
	"p2",
	"p2-tree",
	"prototype",
	"round-1",
	"round-2",
	"round 1",
	"round 2",
	// candidates, families, prior arms
	"p2-tos",
	"p2-alpha",
	"tree-of-shapes",
	"tree of shapes",
	"arm-b",
	"alpha-tree",
	"cycle1-v1",
	"cycle1-v2",
	// the constants and the measurements under consideration
	"laminarity",
	"laminar",
	"monotone",
	"monotonic",
	"migration_fraction",
	"coverage_fraction",
	"coverage",
	"endsdistinct",
	"chainlength",
	"fieldsiblings",
	// the automatic reading's own verdict words, minus the two the reviewer is being offered
	"partitioned",
	"textured",
	"unreadable",
	// the legacy record and this round's own bookkeeping about it
	"legacygradient",
	"legacybasis",
	"phantom",
	"ramp",
	"regression",
	"flipped",
	"flips",
	"endorse",
	// palette output, which this round shows none of
	"palette",
	"surface",
	"accent",
	"foreground",
	"algorithmversion",
	"gitcommit",
]

const failures: string[] = []
function check(condition: boolean, message: string): void {
	if (!condition) failures.push(message)
}

/**
 * Every string in the fixture, with the path that leads to it.
 *
 * Walked structurally rather than only scanned as raw bytes, for the reason the aborted first
 * staging demonstrated: a leak is easy to see in the question text and easy to MISS in a field
 * nobody thinks of as reviewer-visible. `labelSchemaVersion` drives page routing and `batchId` is on
 * screen; both carried the prototype token and both read as internal bookkeeping. Enumerating the
 * strings means no field is exempt by being unfamiliar — object keys are walked too, so a leak in a
 * key name fails exactly like a leak in a value.
 */
function* strings(node: unknown, path = "$"): Generator<{ path: string; value: string }> {
	if (typeof node === "string") {
		yield { path, value: node }
		return
	}
	if (Array.isArray(node)) {
		for (const [index, child] of node.entries()) yield* strings(child, `${path}[${index}]`)
		return
	}
	if (node !== null && typeof node === "object") {
		for (const [key, child] of Object.entries(node)) {
			yield { path: `${path}.${key} (key)`, value: key }
			yield* strings(child, `${path}.${key}`)
		}
	}
}

/** Every forbidden token found in a fixture-shaped value, as `path → token` findings. */
function leaks(node: unknown): string[] {
	const found: string[] = []
	for (const { path, value } of strings(node)) {
		const haystack = value.toLowerCase()
		for (const needle of FORBIDDEN) {
			if (haystack.includes(needle.toLowerCase())) {
				const at = haystack.indexOf(needle.toLowerCase())
				found.push(`${path} leaks "${needle}": …${value.slice(Math.max(0, at - 50), at + 50)}…`)
			}
		}
	}
	return found
}

async function sha256Of(path: string): Promise<string> {
	return createHash("sha256").update(await readFile(path)).digest("hex")
}

function runBuilder(): void {
	execFileSync(process.execPath, ["--experimental-strip-types", BUILD_PATH], {
		cwd: HERE,
		env: { ...process.env, NODE_NO_WARNINGS: "1" },
		stdio: "pipe",
	})
}

async function main(): Promise<void> {
	const before = await readFile(FIXTURE_PATH)
	const fixture = JSON.parse(before.toString("utf8")) as OracleValidationFixture

	// 0. The server's own structural gate, first: everything below assumes a well-formed fixture.
	try {
		validateFixture(fixture)
	} catch (error) {
		failures.push(`validateFixture rejected the fixture: ${(error as Error).message}`)
	}

	// 1. Identity and size.
	check(fixture.batchId === BATCH_ID, `batchId is ${fixture.batchId}, expected ${BATCH_ID}`)
	check(
		fixture.labelSchemaVersion === LABEL_SCHEMA_VERSION,
		`labelSchemaVersion is ${fixture.labelSchemaVersion}, expected ${LABEL_SCHEMA_VERSION}`,
	)
	check(fixture.purpose === "oracle-validation", `purpose is ${fixture.purpose}`)
	check(fixture.items.length === EXPECTED_ITEMS, `fixture holds ${fixture.items.length} items, expected ${EXPECTED_ITEMS}`)

	// 2. Exactly one question, and it is the one this round declares.
	check(fixture.questions.length === 1, `fixture holds ${fixture.questions.length} questions, expected exactly 1`)
	const question = fixture.questions[0]
	if (question !== undefined) {
		check(question.key === QUESTION_KEY, `question key is ${question.key}, expected ${QUESTION_KEY}`)
		check(question.kind === "enum", `question kind is ${question.kind}, expected enum`)
		check(question.question.trim().length > 0, "the question stem is empty")
		check(question.instruction.trim().length > 0, "the question carries no standing instruction")
		check((question.preamble ?? "").trim().length > 0, "the question carries no referent preamble")
		check((question.framing ?? "").trim().length > 0, "the question carries no framing text")
		// 3. The escape. A forced choice with no way out files the reviewer's uncertainty as a reading.
		const escapes = question.answers.filter((answer) => ESCAPE_KEYS.has(answer.key))
		check(escapes.length === 1, `question ${question.key} offers ${escapes.length} escape answers, expected exactly 1`)
		const hotkeys = question.answers.map((answer) => answer.hotkey)
		check(new Set(hotkeys).size === hotkeys.length, `question ${question.key} binds a hotkey twice: ${hotkeys.join(" ")}`)
		for (const answer of question.answers) {
			check(answer.gloss.trim().length > 0, `answer ${answer.key} carries no gloss`)
			check(!answer.gloss.includes("TODO") && !answer.label.includes("TODO"), `answer ${answer.key} still carries a placeholder`)
		}
		check(question.answers.length === 4, `question ${question.key} offers ${question.answers.length} answers, expected 4`)
	}
	// No placeholder survived anywhere in the wording.
	for (const marker of ["TODO", "TBD", "FIXME", "XXX", "<placeholder>"]) {
		check(!before.toString("utf8").includes(marker), `the fixture still carries the placeholder marker ${marker}`)
	}

	// 4. Every item's file exists and its bytes are the bytes the round was designed against.
	for (const item of fixture.items) {
		const absolute = join(REPO_ROOT, item.imagePath)
		let exists = true
		try {
			const info = await stat(absolute)
			if (!info.isFile()) exists = false
		} catch {
			exists = false
		}
		check(exists, `item ${item.itemId}: ${item.imagePath} is not a file under the repository root`)
		if (!exists) continue
		const actual = await sha256Of(absolute)
		check(actual === item.sha256, `item ${item.itemId}: ${item.imagePath} hashes ${actual}, fixture says ${item.sha256}`)
		check(item.questionKey === QUESTION_KEY, `item ${item.itemId} asks ${item.questionKey}`)
		check(item.reconciliation === undefined, `item ${item.itemId} carries by-artwork reconciliation context it cannot render`)
		check(item.priorAnswer === undefined, `item ${item.itemId} carries a prior answer; this round shows the reviewer nothing`)
		check(item.rendition.longEdgePx === Math.max(item.rendition.width, item.rendition.height), `item ${item.itemId} has an inconsistent longEdgePx`)
	}

	// 5. Serve order covers every item exactly once.
	const itemIds = fixture.items.map((item) => item.itemId)
	check(new Set(itemIds).size === itemIds.length, "two items share an itemId")
	check(fixture.serveOrder.length === itemIds.length, `serveOrder holds ${fixture.serveOrder.length} entries for ${itemIds.length} items`)
	check(new Set(fixture.serveOrder).size === fixture.serveOrder.length, "serveOrder names an item twice")
	const known = new Set(itemIds)
	for (const id of fixture.serveOrder) check(known.has(id), `serveOrder names unknown item ${id}`)
	for (const id of itemIds) check(fixture.serveOrder.includes(id), `item ${id} is never served`)

	// 6a. The scan is checked before it is trusted.
	//
	// A leak scan that silently stops matching is worse than no leak scan, because it reports OK. So
	// it is first run against the exact value that got the first staging aborted — the retired schema
	// id `p2-field-gradient.v1` — placed in the field it actually rode in on. If that does not
	// produce a finding, the scan is broken and this file says so instead of passing.
	// Verified end to end, not only by this in-process canary: the committed fixture was tampered with
	// to carry the retired id and `validate.ts` was re-run, which failed with
	//   ✗ $.labelSchemaVersion leaks "p2": …p2-field-gradient.v1…
	//   ✗ raw bytes leak "p2" at byte 140 …
	// before the file was rebuilt and byte-compared back to the committed bytes.
	const canary = { labelSchemaVersion: RETIRED_LABEL_SCHEMA_VERSION }
	const canaryFindings = leaks(canary)
	check(
		canaryFindings.length > 0,
		`the leak scan does not catch the retired schema id ${RETIRED_LABEL_SCHEMA_VERSION}; the scan is broken, not the fixture`,
	)
	// And it is checked in the other direction too: the shipped schema id must NOT trip it, or every
	// build would fail for the wrong reason.
	check(
		leaks({ labelSchemaVersion: LABEL_SCHEMA_VERSION }).length === 0,
		`the leak scan rejects this round's own schema id ${LABEL_SCHEMA_VERSION}`,
	)

	// 6b. Leak scan over EVERY string field of the parsed fixture — values and object keys alike —
	// and then over the raw bytes as a backstop, so a leak in a field the walk somehow misses is
	// still caught.
	for (const finding of leaks(fixture)) failures.push(finding)
	const raw = before.toString("utf8").toLowerCase()
	for (const needle of FORBIDDEN) {
		const at = raw.indexOf(needle.toLowerCase())
		if (at !== -1) failures.push(`raw bytes leak "${needle}" at byte ${at}: …${raw.slice(Math.max(0, at - 60), at + 60)}…`)
	}

	// 7. Deterministic rebuild: two more builder runs, byte-compared against the committed file.
	let run1: Buffer | null = null
	let run2: Buffer | null = null
	try {
		runBuilder()
		run1 = await readFile(FIXTURE_PATH)
		runBuilder()
		run2 = await readFile(FIXTURE_PATH)
	} catch (error) {
		failures.push(`the builder did not run cleanly: ${(error as Error).message}`)
	}
	if (run1 !== null && run2 !== null) {
		check(run1.equals(run2), "two builder runs disagree; the build is not deterministic")
		check(before.equals(run1), "the committed fixture differs from a fresh build; rebuild it or explain the drift")
		if (!before.equals(run1)) await writeFile(FIXTURE_PATH, before)
	}

	if (failures.length > 0) {
		process.stderr.write(`round-2-flat-vs-ramp: ${failures.length} failure(s)\n`)
		for (const failure of failures) process.stderr.write(`  ✗ ${failure}\n`)
		process.exit(1)
	}
	process.stdout.write(
		`round-2-flat-vs-ramp OK: ${fixture.items.length} items, 1 question (${QUESTION_KEY}), ` +
			`escape present, ${fixture.serveOrder.length} served exactly once, ${FORBIDDEN.length} forbidden tokens absent, ` +
			"build reproduced byte-for-byte twice\n",
	)
}

await main()
