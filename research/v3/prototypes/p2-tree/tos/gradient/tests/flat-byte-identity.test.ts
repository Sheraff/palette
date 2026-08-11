/**
 * **The machinery must not touch a palette that publishes no ramp**, and on a palette that does, the
 * one interior stop it may insert is the *only* thing it is allowed to change.
 *
 * This is the assertion that makes the census safe to read. If D6's excursion work had moved a flat,
 * partitioned, textured or collapsed cover, every "before/after" number would be contaminated by a
 * change that has nothing to do with gradients, and the robustness and reachability readings taken
 * beside it would be measuring two changes at once.
 *
 * ## What the baseline is, and what it deliberately is not
 *
 * It used to be `tos/out/demo-20-cycle3-wl.run.jsonl` — the dev-loop run a previous worker published on
 * this set before the machinery existed. That baseline was **frozen across the constants**, and
 * `DECISIONS.md` D15 is what showed the cost: moving `UNREADABLE_COVERAGE_FRACTION` from 0.5 to 0.25
 * let `…0ee5a62175fc8d58e0af` pass the coverage gate and publish a ramp, so a file recorded under the
 * old gate started reporting a *gradient* failure for a *coverage* ruling. The test was right about
 * nothing it claimed to be about.
 *
 * The baseline is now **regenerated inside the same run**: `no-guide-stop-hooks.ts` registers module
 * hooks that build a second, complete copy of the candidate's module graph in which `guide-stop.ts` is
 * an impostor — it returns the two stops it was handed, unchanged, and records that it was called.
 * Both builds see the same constants because they are the same process, so no constant ruling can ever
 * stale this comparison again. What is asserted is a *relation between two builds*, never a stored
 * palette:
 *
 *  1. for a cover that publishes no ramp, the impostor is **not consulted at all**, and the two builds
 *     are byte-identical;
 *  2. for a cover that publishes one, the two builds are byte-identical **once the interior stops are
 *     removed** — which says the machinery's whole reach into the contract is the stop it inserts;
 *  3. and every ramp carries its excursion record, owed or not, inserted or not.
 *
 * Assertion (2) also carries the file's own liveness check: it reads the impostor's call log, so a
 * silently unregistered hook fails the suite instead of making it vacuous.
 */

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { register } from "node:module"
import { join, resolve } from "node:path"
import { before, test } from "node:test"
import type { Palette } from "../../../../../src/contract/types.ts"
import { type CandidateDiagnostics, paletteWithDiagnostics } from "../../candidate.ts"
import { GUIDE_STOP_STUB_MARKER } from "./no-guide-stop-hooks.ts"

/** The repository root: seven levels up from `research/v3/prototypes/p2-tree/tos/gradient/tests`. */
const REPOSITORY_ROOT = resolve(import.meta.dirname, "../../../../../../..")
/** The dev loop's own demonstration set — the same twenty covers the run file used to pin. */
const SET_FILE = resolve(import.meta.dirname, "../../../../../data/devloop/sets/demo-20.txt")

/** The second build's namespace: the same exports, over the impostor. */
type StubbedCandidate = { paletteWithDiagnostics: (imagePath: string) => Promise<CandidateDiagnostics> }
type StubbedGuideStop = { guideStopCalls: readonly { first: string; last: string }[] }

register("./no-guide-stop-hooks.ts", import.meta.url)

/** One cover, built twice: machinery live, and machinery replaced by a counting no-op. */
type Pair = Readonly<{
	imagePath: string
	live: CandidateDiagnostics
	stubbed: CandidateDiagnostics
	/** How many times the impostor was consulted while the stubbed build ran. */
	stubCalls: number
}>

let pairs: Pair[] = []

async function setCovers(): Promise<string[]> {
	const text = await readFile(SET_FILE, "utf8")
	return text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "" && !line.startsWith("#"))
		.map((relative) => join(REPOSITORY_ROOT, relative))
}

before(async () => {
	const stubbedCandidate = (await import(
		`${new URL("../../candidate.ts", import.meta.url).href}?${GUIDE_STOP_STUB_MARKER}`
	)) as StubbedCandidate
	const stubbedGuideStop = (await import(
		`${new URL("../guide-stop.ts", import.meta.url).href}?${GUIDE_STOP_STUB_MARKER}`
	)) as StubbedGuideStop

	pairs = []
	for (const imagePath of await setCovers()) {
		const live = await paletteWithDiagnostics(imagePath)
		const callsBefore = stubbedGuideStop.guideStopCalls.length
		const stubbed = await stubbedCandidate.paletteWithDiagnostics(imagePath)
		pairs.push({ imagePath, live, stubbed, stubCalls: stubbedGuideStop.guideStopCalls.length - callsBefore })
	}
})

/** The same palette with any interior gradient stop dropped — the two ends are all the parse decided. */
function withoutInteriorStops(palette: Palette): Palette {
	const gradient = palette.gradient
	if (gradient === null || gradient.stops.length <= 2) return palette
	const ends = [gradient.stops[0], gradient.stops[gradient.stops.length - 1]]
	return { ...palette, gradient: { stops: ends as unknown as typeof gradient.stops } }
}

test("a palette without a ramp never reaches the machinery, and is byte-identical without it", async (context) => {
	const flat = pairs.filter((pair) => pair.live.palette.gradient === null)
	assert.ok(flat.length > 0, "demo-20 must contain covers that publish no ramp")

	for (const pair of flat) {
		assert.equal(
			pair.stubCalls,
			0,
			`${pair.imagePath} publishes no ramp, yet the guide-stop machinery was consulted for it`,
		)
		assert.equal(
			pair.live.gradientExcursion,
			null,
			`${pair.imagePath} publishes no ramp, so no excursion record may exist for it`,
		)
		assert.equal(pair.stubbed.gradientExcursion, null, `${pair.imagePath}: the impostor left a record behind`)
		assert.equal(
			JSON.stringify(pair.live.palette),
			JSON.stringify(pair.stubbed.palette),
			`${pair.imagePath} moved; the guide-stop machinery must not touch a palette without a ramp`,
		)
	}
	context.diagnostic(`${flat.length} of ${pairs.length} demo-20 covers publish no ramp; none reached the machinery`)
})

test("on a palette with a ramp, the inserted stop is the machinery's only reach into the contract", async (context) => {
	const ramps = pairs.filter((pair) => pair.live.palette.gradient !== null)
	assert.ok(ramps.length > 0, "demo-20 must contain covers that publish a ramp")

	let inserted = 0
	for (const pair of ramps) {
		// The impostor was consulted exactly once — which is also this file's proof that the second build
		// is a real second build and the hooks are registered.
		assert.equal(pair.stubCalls, 1, `${pair.imagePath} publishes a ramp; the machinery must run exactly once`)

		const report = pair.live.gradientExcursion
		assert.ok(report !== null, `${pair.imagePath} publishes a ramp and owes an excursion record`)
		assert.equal(report.before.stops, 2)
		assert.ok(Number.isFinite(report.before.maxBars))

		const published = pair.live.palette.gradient
		assert.ok(published !== null)
		assert.equal(published.stops.length, report.inserted ? 3 : 2)
		assert.equal(published.stops[0].color.hex, pair.live.palette.roles.background.hex)
		assert.equal(published.stops[published.stops.length - 1].color.hex, pair.live.palette.roles.surface.hex)

		// The baseline, regenerated in this run: the machinery-free build publishes the plain 2-stop ramp,
		// so removing the one interior stop must recover it exactly — roles, collapse flags, metadata and
		// both ends included. Nothing else in the contract may depend on the machinery having run.
		assert.equal(
			JSON.stringify(withoutInteriorStops(pair.live.palette)),
			JSON.stringify(pair.stubbed.palette),
			`${pair.imagePath}: the machinery changed something other than the interior stop`,
		)
		if (report.inserted) inserted += 1

		context.diagnostic(
			`${pair.imagePath.split("/").pop()}: ${report.before.maxBars.toFixed(3)} bars @ t=${
				report.before.position.toFixed(4)
			}, owed=${report.owed}, inserted=${report.inserted}, refusal=${report.refusal}`,
		)
	}
	context.diagnostic(`${ramps.length} demo-20 covers publish a ramp; ${inserted} kept a guide stop`)
})
