/**
 * Rewrites the Track W policy exponents in `policy.ts` between sweeps.
 *
 * The runtime deliberately reads NO environment variables — the charter's architecture
 * invariant keeps configuration in the frozen policy object — so an experiment that wants
 * to compare settings has to edit the reviewed default and put it back. This does that
 * mechanically, so the "byte-identical at the default" claim can be re-established with
 * one command instead of by hand.
 *
 *   node ... set-config.ts <resolvedReferenceExponent> <componentFloorExponent>
 */
import { readFileSync, writeFileSync } from "node:fs"

const POLICY = `${import.meta.dirname}/../../v2-3/src/internal/policy.ts`

const resolvedExponent = process.argv[2]
const floorExponent = process.argv[3]
if (resolvedExponent === undefined || floorExponent === undefined) {
	throw new Error("usage: set-config.ts <resolvedReferenceExponent> <componentFloorExponent>")
}

let source = readFileSync(POLICY, "utf8")
const replace = (name: string, value: string): void => {
	const pattern = new RegExp(`(\\n\\t\\t${name}: )[^,]+(,)`)
	if (!pattern.test(source)) throw new Error(`could not locate ${name} in policy.ts`)
	source = source.replace(pattern, `$1${value}$2`)
}
replace("resolvedReferenceExponent", resolvedExponent)
replace("componentFloorExponent", floorExponent)
writeFileSync(POLICY, source)
console.log(`resolvedReferenceExponent=${resolvedExponent} componentFloorExponent=${floorExponent}`)
