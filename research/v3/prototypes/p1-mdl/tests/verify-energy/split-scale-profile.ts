/**
 * VERIFIER — check 10: `support.ts`'s third stated consequence, on real images.
 *
 * The module claims the extent code *"identifies the split scale from the data. The support cost
 * alone is minimised at the `π₀` that best fits the image's own extent distribution, so `ŝ*` is no
 * longer free to be chosen for the convenience of a colour term."* Two of the three consequences
 * (boundedness, no λ) are pinned by `tests/energy-a/support.test.ts`; this one is not, and it is the
 * behavioural claim. So it is measured here, on real covers rather than on synthetic diptychs.
 *
 * What would falsify it: if `ŝ*` lands on a grid **end** (0 or S) on most images, the support term is
 * not identifying a scale from the data — it is saturating, and the profile is being decided by which
 * end of the ladder the image's mass happens to sit at. The pre-fix profile (`withSupport: false`,
 * the same implementation) is printed beside it so the change is attributable.
 */

import { join } from "node:path"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import { measureImage } from "../../src/measure/index.ts"
import { energyOfA } from "../../src/energy/a/index.ts"
import { armA } from "./recompute.ts"
import { configuration, readSetFile, resolveCorpusRoot, setFilePath } from "../energy-a/support.ts"

const COVERS = 8

const corpusRoot = resolveCorpusRoot("00")
if (corpusRoot === null) throw new Error("artwork shards are not present in this checkout")
const paths = (await readSetFile(setFilePath("demo-20.txt"))).slice(0, COVERS)

/** One plausible four-role configuration, held fixed: the question is about ŝ*, not about roles. */
const DARK: Rgb8 = [24, 24, 28]
const LIGHT: Rgb8 = [236, 234, 228]
const config = configuration({ background: DARK, surface: LIGHT, foreground: LIGHT, accent: DARK })

console.log("cover                                          S   ŝ*(0.1.0)  ŝ*(0.2.0)   π₀        inkMass  support")
let ends = 0
for (const relative of paths) {
	const measurement = await measureImage(join(corpusRoot, relative))
	const span = measurement.constants.extentLadderScales
	const before = armA(measurement, config, 1, { withSupport: false }).splitScaleRung
	const after = energyOfA(measurement, config)
	const rung = after.nuisance.splitScaleRung as number
	if (rung === 0 || rung === span) ends += 1
	console.log(
		`${relative.slice(-24).padEnd(26)}  ${String(span).padStart(2)}   ${String(before).padStart(6)}` +
			`     ${String(rung).padStart(6)}   ${(after.nuisance.fieldPrior as number).toFixed(4)}` +
			`    ${(after.nuisance.inkMassFraction as number).toFixed(4)}   ${(
				after.nuisance.extentSupportCost as number
			).toFixed(4)}`,
	)
}
console.log(`\nŝ* on a grid end (0 or S): ${ends}/${paths.length} covers`)
