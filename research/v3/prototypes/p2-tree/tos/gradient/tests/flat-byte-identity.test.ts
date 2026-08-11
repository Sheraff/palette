/**
 * **The machinery must not touch a palette that publishes no ramp.**
 *
 * This is the assertion that makes the census safe to read. If D6's excursion work had moved a flat,
 * partitioned, textured or collapsed cover, every "before/after" number would be contaminated by a
 * change that has nothing to do with gradients, and the robustness and reachability readings taken
 * beside it would be measuring two changes at once.
 *
 * The baseline is not a snapshot this test wrote: it is `tos/out/demo-20-cycle3-wl.run.jsonl`, the
 * dev-loop run the **previous** worker published on the same set with the same candidate before this
 * pass existed. Byte-identity is asserted against that artefact, over the exact JSON the dev loop
 * stores, so the claim is "the published palette did not move" rather than "the code agrees with
 * itself".
 */

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import type { Palette } from "../../../../../src/contract/types.ts"
import { paletteWithDiagnostics } from "../../candidate.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const BASELINE = resolve(HERE, "..", "..", "out", "demo-20-cycle3-wl.run.jsonl")

type BaselineRow = Readonly<{ kind: string; imagePath: string; ok: boolean; palette: Palette | null }>

async function baselineRows(): Promise<BaselineRow[]> {
	const text = await readFile(BASELINE, "utf8")
	return text
		.split("\n")
		.filter((line) => line.trim() !== "")
		.map((line) => JSON.parse(line) as BaselineRow)
		.filter((row) => row.kind === "devloop-run-row" && row.ok && row.palette !== null)
}

test("every demo-20 palette without a ramp is byte-identical to the pre-change run", async (context) => {
	context.diagnostic(`baseline: ${BASELINE}`)
	const rows = await baselineRows()
	const flat = rows.filter((row) => row.palette?.gradient === null)
	assert.ok(flat.length > 0, "the baseline must contain covers that publish no ramp")

	let checked = 0
	for (const row of flat) {
		const diagnostics = await paletteWithDiagnostics(row.imagePath)
		assert.equal(
			JSON.stringify(diagnostics.palette),
			JSON.stringify(row.palette),
			`${row.imagePath} moved; the guide-stop machinery must not touch a palette without a ramp`,
		)
		assert.equal(
			diagnostics.gradientExcursion,
			null,
			`${row.imagePath} publishes no ramp, so no excursion record may exist for it`,
		)
		checked += 1
	}
	context.diagnostic(`${checked} of ${rows.length} demo-20 covers publish no ramp; all byte-identical`)
})

test("every demo-20 palette with a ramp carries an excursion record, always", async (context) => {
	const rows = await baselineRows()
	const ramps = rows.filter((row) => row.palette?.gradient !== null)
	assert.ok(ramps.length > 0, "the baseline must contain covers that publish a ramp")

	for (const row of ramps) {
		const diagnostics = await paletteWithDiagnostics(row.imagePath)
		const report = diagnostics.gradientExcursion
		assert.ok(report !== null, `${row.imagePath} publishes a ramp and owes an excursion record`)
		// Report-only for a ramp that is already on-artwork: same stops, same ends, nothing inserted.
		assert.equal(report.before.stops, 2)
		assert.ok(Number.isFinite(report.before.maxBars))
		const published = diagnostics.palette.gradient
		assert.ok(published !== null)
		assert.equal(published.stops.length, report.inserted ? 3 : 2)
		assert.equal(published.stops[0].color.hex, diagnostics.palette.roles.background.hex)
		assert.equal(published.stops[published.stops.length - 1].color.hex, diagnostics.palette.roles.surface.hex)
		if (!report.inserted) {
			assert.equal(
				JSON.stringify(diagnostics.palette),
				JSON.stringify(row.palette),
				`${row.imagePath} kept no guide stop, so its palette must be byte-identical to the pre-change run`,
			)
		}
		context.diagnostic(
			`${row.imagePath.split("/").pop()}: ${report.before.maxBars.toFixed(3)} bars @ t=${
				report.before.position.toFixed(4)
			}, owed=${report.owed}, inserted=${report.inserted}`,
		)
	}
})
