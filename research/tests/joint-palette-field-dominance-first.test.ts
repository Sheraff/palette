import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { apcaContrast } from "../src/color.ts"
import {
	buildJointPaletteFieldDominanceFirst,
	JOINT_PALETTE_FIELD_DOMINANCE_FIRST_POLICY,
	JOINT_PALETTE_FIELD_DOMINANCE_FIRST_VERSION,
	selectFieldDominanceFirst,
	type FieldDominanceCandidate,
} from "../src/joint-palette-field-dominance-first.ts"
import { loadImage } from "../src/image.ts"
import type { NextPaletteJointObjectiveVector } from "../src/next-palette-joint-pareto.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const incumbent: NextPaletteJointObjectiveVector = [1, 1, 1, 1, 1, 1]

function candidate(
	stableKey: string,
	objectives: NextPaletteJointObjectiveVector,
	changedSemanticBlocks: number,
	changedSemanticAtoms: number,
	fieldChanged = true,
	semanticKey = stableKey,
): FieldDominanceCandidate {
	return { stableKey, semanticKey, fieldChanged, changedSemanticBlocks, changedSemanticAtoms, objectives }
}

test("dominance-first routing rejects non-field and non-dominating tuples", () => {
	const selected = selectFieldDominanceFirst([
		candidate("no-field", [2, 2, 2, 2, 2, 2], 1, 1, false),
		candidate("incomparable", [2, 0, 2, 2, 2, 2], 1, 1),
		candidate("epsilon-only", [1 + 5e-13, 1, 1, 1, 1, 1], 1, 1),
		candidate("strict", [1 + 2e-12, 1, 1, 1, 1, 1], 1, 1),
	], incumbent)

	assert.deepEqual(selected.admitted.map((entry) => entry.stableKey), ["strict"])
	assert.equal(selected.selected?.stableKey, "strict")
})

test("minimum semantic blocks precede candidate Pareto dominance", () => {
	const oneBlock = candidate("one-block", [1.1, 1, 1, 1, 1, 1], 1, 2)
	const twoBlocks = candidate("two-blocks", [1.2, 1.2, 1, 1, 1, 1], 2, 2)
	const selected = selectFieldDominanceFirst([twoBlocks, oneBlock], incumbent)

	assert.equal(selected.admitted.length, 2)
	assert.equal(selected.selected?.stableKey, "one-block")
	assert.deepEqual(selected.minimumBlockFrontier.map((entry) => entry.stableKey), ["one-block"])
})

test("within-class Pareto, atoms, semantic identity, and stable identity are deterministic", () => {
	const values = [
		candidate("dominated", [1.1, 1, 1, 1, 1, 1], 1, 2),
		candidate("more-atoms", [1.2, 1, 1, 1, 1, 1], 1, 3),
		candidate("semantic-z", [1.1, 1.1, 1, 1, 1, 1], 1, 2, true, "z"),
		candidate("stable-b", [1.1, 1.1, 1, 1, 1, 1], 1, 2, true, "a"),
		candidate("stable-a", [1.1, 1.1, 1, 1, 1, 1], 1, 2, true, "a"),
	]
	const first = selectFieldDominanceFirst(values, incumbent)
	const second = selectFieldDominanceFirst([...values].reverse(), incumbent)

	assert.deepEqual(first, second)
	assert.equal(first.minimumBlockFrontier.some((entry) => entry.stableKey === "dominated"), false)
	assert.equal(first.selected?.stableKey, "stable-a")
})

test("field-required strict inference recovers a source-exact minimum-block treatment", async () => {
	const image = await loadImage(await readFile(
		`${projectRoot}/00/ab67616d00001e02000067ea8b55e965960581d5.jpg`,
	))
	const result = buildJointPaletteFieldDominanceFirst(image)

	assert.equal(result.certificate.version, JOINT_PALETTE_FIELD_DOMINANCE_FIRST_VERSION)
	assert.equal(result.certificate.policy, JOINT_PALETTE_FIELD_DOMINANCE_FIRST_POLICY)
	assert.equal(result.certificate.route, "strict-dominator")
	assert.ok(result.candidate)
	assert.equal(result.certificate.selected.changedSemanticBlocks, 1)
	assert.equal(result.certificate.selected.changedSemanticAtoms, 2)
	assert.ok(result.certificate.selected.objectiveDeltas.every((delta) => delta >= -1e-12))
	assert.ok(result.certificate.selected.objectiveDeltas.some((delta) => delta > 1e-12))
	assert.equal(result.certificate.minimumBlockFrontier.every((entry) => entry.changedBlocks.field), true)
	assert.equal(result.certificate.ablations["canonical-field-block"].route,
		"constraint-conflicts-with-required-field-change")
	assert.equal(result.certificate.ablations["canonical-field-block"].admitted, false)
	assert.equal(result.certificate.ablations["canonical-overlay-block"].admitted, true)
	assert.equal(result.candidate.background.hex, result.candidate.surface.hex)
	assert.deepEqual(result.candidate.background.rgb, [143, 127, 127])
	assert.deepEqual(result.candidate.foreground.rgb, [15, 14, 14])
	assert.deepEqual(result.candidate.accent.rgb, [181, 74, 38])
	assert.equal(result.candidate.gradient.isGradient, false)
	assert.ok(result.certificate.selected.roles)
	for (const role of ["background", "foreground", "surface", "accent"] as const) {
		const provenance = result.certificate.selected.roles[role]
		const offset = provenance.representativePixelIndex * 3
		assert.deepEqual(provenance.rgb, [...image.data.subarray(offset, offset + 3)])
	}
	assert.equal(result.certificate.selected.apcaLc?.foregroundOnBackground,
		apcaContrast(result.candidate.foreground.rgb, result.candidate.background.rgb))
	assert.equal(result.certificate.selected.apcaLc?.accentOnSurface,
		apcaContrast(result.candidate.accent.rgb, result.candidate.surface.rgb))
})
