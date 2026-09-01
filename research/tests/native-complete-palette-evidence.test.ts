import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
	buildNativeCompletePaletteEvidenceInventory,
	nativeCompletePaletteEvidenceJson,
	parseNativeCompletePaletteEvidenceInventory,
	supportabilityDecision,
	type NativeCompletePaletteEvidenceInventory,
} from "../src/native-complete-palette-evidence.ts"

const projectRoot = fileURLToPath(new URL("../..", import.meta.url))
const artifactPath = resolve(projectRoot,
	"research/data/experiments/native-complete-palette-0.1.0-development/evidence-inventory.json")

async function artifact(): Promise<NativeCompletePaletteEvidenceInventory> {
	return JSON.parse(await readFile(artifactPath, "utf8")) as NativeCompletePaletteEvidenceInventory
}

function clone(value: NativeCompletePaletteEvidenceInventory): NativeCompletePaletteEvidenceInventory {
	return structuredClone(value)
}

test("valid complete-palette evidence artifact is strict, reconciled, and deterministic", async () => {
	const raw = await readFile(artifactPath)
	const parsed = parseNativeCompletePaletteEvidenceInventory(JSON.parse(raw.toString("utf8")) as unknown)
	assert.equal(parsed.experiment.modelFitted, false)
	assert.equal(parsed.reconciliation.all, true)
	assert.equal(parsed.declarations.noReserveAccess.accessedRoots.length, 0)
	assert.deepEqual(parsed.declarations.noReserveAccess.forbiddenRoots, ["10", "11", "12", "13", "14"])
	assert.ok(parsed.events.length > 0)
	assert.ok(parsed.exactSources.length > 0)
	assert.ok(parsed.sourceGroups.length > 0)
	assert.equal(parsed.summary.comments.contentRetained, false)
	assert.equal(raw.includes(Buffer.from('"generatedAt"')), false)

	const first = await buildNativeCompletePaletteEvidenceInventory(projectRoot)
	const second = await buildNativeCompletePaletteEvidenceInventory(projectRoot)
	const firstBytes = Buffer.from(nativeCompletePaletteEvidenceJson(first))
	const secondBytes = Buffer.from(nativeCompletePaletteEvidenceJson(second))
	assert.deepEqual(firstBytes, secondBytes)
	assert.deepEqual(firstBytes, raw)
	assert.equal(createHash("sha256").update(raw).digest("hex"),
		createHash("sha256").update(firstBytes).digest("hex"))
})

test("strict parser rejects extra and missing keys", async () => {
	const extra = clone(await artifact()) as NativeCompletePaletteEvidenceInventory & { unexpected?: boolean }
	extra.unexpected = true
	assert.throws(() => parseNativeCompletePaletteEvidenceInventory(extra), /unexpected or missing fields/)

	const missing = clone(await artifact()) as unknown as Record<string, unknown>
	delete missing.reconciliation
	assert.throws(() => parseNativeCompletePaletteEvidenceInventory(missing), /unexpected or missing fields/)

	const nestedExtra = clone(await artifact())
	;(nestedExtra.events[0] as unknown as Record<string, unknown>).unexpected = true
	assert.throws(() => parseNativeCompletePaletteEvidenceInventory(nestedExtra), /unexpected or missing fields/)
})

test("invalid outcomes and hashes are rejected", async () => {
	const outcome = clone(await artifact())
	const pairwise = outcome.events.find((event) => event.pairwiseOutcome !== null)!
	;(pairwise as unknown as Record<string, unknown>).pairwiseOutcome = "candidate-wins-from-comment"
	assert.throws(() => parseNativeCompletePaletteEvidenceInventory(outcome), /pairwise outcome is invalid/)

	const hash = clone(await artifact())
	hash.events[0].sourceSha256 = "not-a-hash"
	assert.throws(() => parseNativeCompletePaletteEvidenceInventory(hash), /must be a SHA-256/)

	const polarity = clone(await artifact())
	const absolute = polarity.events.find((event) => event.absoluteOutcomes.length > 0)!
	absolute.absoluteOutcomes[0].polarity = absolute.absoluteOutcomes[0].polarity === "positive" ? "negative" : "positive"
	assert.throws(() => parseNativeCompletePaletteEvidenceInventory(polarity), /absolute outcome .* is invalid/)
})

test("invalid finite counts and reconciliation are rejected", async () => {
	const count = clone(await artifact())
	count.summary.evidenceClasses.total++
	assert.throws(() => parseNativeCompletePaletteEvidenceInventory(count), /counts do not reconcile/)

	const finite = clone(await artifact())
	finite.summary.absolute.ratings.total = Number.POSITIVE_INFINITY
	assert.throws(() => parseNativeCompletePaletteEvidenceInventory(finite), /counts do not reconcile/)

	const reconciliation = clone(await artifact())
	reconciliation.reconciliation.all = false as true
	assert.throws(() => parseNativeCompletePaletteEvidenceInventory(reconciliation), /reconciliation is not complete/)
})

test("exact transfers and repeats cannot leak into independent denominators", async () => {
	const value = clone(await artifact())
	const transfer = value.events.find((event) => event.evidenceClass === "exact-transfer")!
	transfer.evidenceClass = "direct-fresh"
	assert.throws(() => parseNativeCompletePaletteEvidenceInventory(value), /transfer\/repeat denominator classification is invalid/)

	const valid = parseNativeCompletePaletteEvidenceInventory(await artifact())
	const independentAbsolute = new Set(valid.events.filter((event) => event.evidenceClass === "direct-fresh" &&
		event.absoluteOutcomes.some((outcome) => outcome.polarity !== "uncertain")).map((event) => event.sourceGroupId))
	const independentPairwise = new Set(valid.events.filter((event) => event.evidenceClass === "direct-fresh" &&
		event.pairwiseOutcome !== null && event.pairwiseOutcome !== "neither-acceptable" &&
		event.pairwiseOutcome !== "uncertain").map((event) => event.sourceGroupId))
	assert.equal(valid.supportability.absolute.independentSourceGroups, independentAbsolute.size)
	assert.equal(valid.supportability.pairwise.independentSourceGroups, independentPairwise.size)
})

test("comments remain count-only and cannot become content or labels", async () => {
	const value = clone(await artifact())
	const commented = value.events.find((event) => event.commentPresent)!
	;(commented as unknown as Record<string, unknown>).commentText = "forbidden"
	assert.throws(() => parseNativeCompletePaletteEvidenceInventory(value), /unexpected or missing fields/)

	const parsed = parseNativeCompletePaletteEvidenceInventory(await artifact())
	assert.equal(parsed.summary.comments.eventsWithQualitativeContext,
		parsed.events.filter((event) => event.commentPresent).length)
	assert.ok(parsed.events.every((event) => !Object.keys(event).some((key) => /commentText|note|content/i.test(key))))
})

test("factorized evidence is structurally excluded", async () => {
	const value = clone(await artifact())
	assert.ok(value.exclusions.some((entry) => entry.kind === "factorized-field-state" && entry.status === "excluded"))
	assert.equal(value.reconciliation.factorizedEventsIncluded, 0)
	;(value.events[0] as unknown as Record<string, unknown>).sourceKind = "factorized-field-state"
	assert.throws(() => parseNativeCompletePaletteEvidenceInventory(value), /identity is invalid/)
})

test("supportability decisions use the exact 50-group boundary", async () => {
	assert.deepEqual(supportabilityDecision(49, 49), {
		minimumIndependentSourceGroups: 50,
		absolute: { independentSourceGroups: 49, supportable: false },
		pairwise: { independentSourceGroups: 49, supportable: false },
		decision: "neither-supportable",
	})
	assert.equal(supportabilityDecision(50, 49).decision, "absolute-only")
	assert.equal(supportabilityDecision(49, 50).decision, "pairwise-only")
	assert.equal(supportabilityDecision(50, 50).decision, "both-supportable")

	const value = clone(await artifact())
	value.supportability.absolute.supportable = !value.supportability.absolute.supportable
	assert.throws(() => parseNativeCompletePaletteEvidenceInventory(value), /Supportability decision does not reconcile/)
})
