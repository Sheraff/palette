import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { apcaContrast } from "../src/color.ts"
import { loadImage } from "../src/image.ts"
import {
	buildJointPaletteCompactRelationDominance,
	JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_POLICY,
	JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_VERSION,
	selectCompactRelationDominance,
	type CompactRelationDominanceCandidate,
	type CompactRelationVector,
} from "../src/joint-palette-compact-relation-dominance.ts"
import type { NextPaletteJointObjectiveVector } from "../src/next-palette-joint-pareto.ts"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const incumbent: NextPaletteJointObjectiveVector = [1, 1, 1, 1, 1, 1]
const canonicalCompact: CompactRelationVector = [1, 1, 1, 1]

function candidate(
	stableKey: string,
	objectives: NextPaletteJointObjectiveVector,
	compactVector: CompactRelationVector,
	changedSemanticAtoms = 1,
	semanticKey = stableKey,
	fieldChanged = true,
	overlayChanged = false,
	changedSemanticBlocks = 1,
): CompactRelationDominanceCandidate {
	return {
		stableKey,
		semanticKey,
		fieldChanged,
		overlayChanged,
		changedSemanticBlocks,
		changedSemanticAtoms,
		objectives,
		compactVector,
	}
}

test("compact relation selector requires one field block and strict dominance on both vectors", () => {
	const selected = selectCompactRelationDominance([
		candidate("overlay-change", [2, 2, 2, 2, 2, 2], [2, 2, 2, 2], 1, "a", true, true),
		candidate("two-blocks", [2, 2, 2, 2, 2, 2], [2, 2, 2, 2], 1, "a", true, false, 2),
		candidate("six-only", [1 + 2e-12, 1, 1, 1, 1, 1], [1, 1, 1, 1]),
		candidate("compact-only", [1, 1, 1, 1, 1, 1], [1 + 2e-12, 1, 1, 1]),
		candidate("epsilon-only", [1 + 5e-13, 1, 1, 1, 1, 1], [1 + 5e-13, 1, 1, 1]),
		candidate("admitted", [1 + 2e-12, 1, 1, 1, 1, 1], [1, 1 + 2e-12, 1, 1]),
	], incumbent, canonicalCompact)

	assert.deepEqual(selected.admitted.map((entry) => entry.stableKey), ["admitted"])
	assert.equal(selected.selected?.stableKey, "admitted")
})

test("six-objective Pareto, atoms, semantic key, and stable key are deterministic", () => {
	const values = [
		candidate("dominated", [1.1, 1, 1, 1, 1, 1], [1.1, 1, 1, 1], 1),
		candidate("more-atoms", [1.2, 1, 1, 1, 1, 1], [1.1, 1, 1, 1], 2),
		candidate("semantic-z", [1.1, 1.1, 1, 1, 1, 1], [1.1, 1, 1, 1], 1, "z"),
		candidate("stable-b", [1.1, 1.1, 1, 1, 1, 1], [1.1, 1, 1, 1], 1, "a"),
		candidate("stable-a", [1.1, 1.1, 1, 1, 1, 1], [1.1, 1, 1, 1], 1, "a"),
	]
	const first = selectCompactRelationDominance(values, incumbent, canonicalCompact)
	const second = selectCompactRelationDominance([...values].reverse(), incumbent, canonicalCompact)

	assert.deepEqual(first, second)
	assert.equal(first.withinClassFrontier.some((entry) => entry.stableKey === "dominated"), false)
	assert.equal(first.selected?.stableKey, "stable-a")
})

test("fresh constrained inference changes only a same-state source-exact field block", async () => {
	const image = await loadImage(await readFile(
		`${projectRoot}/00/ab67616d00001e020000bdd8f68862e90ee24dc8.jpg`,
	))
	const result = buildJointPaletteCompactRelationDominance(image)
	const certificate = result.certificate

	assert.equal(certificate.version, JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_VERSION)
	assert.equal(certificate.policy, JOINT_PALETTE_COMPACT_RELATION_DOMINANCE_POLICY)
	assert.equal(certificate.route, "compact-relation-dominator")
	assert.equal(certificate.selected.changed, true)
	assert.equal(certificate.selected.changedSemanticBlocks, 1)
	assert.equal(certificate.selected.fieldState, certificate.canonical.fieldState)
	assert.notEqual(certificate.selected.fieldState, "collapsed")
	assert.deepEqual(result.candidate.foreground, result.canonical.foreground)
	assert.deepEqual(result.candidate.accent, result.canonical.accent)
	assert.equal(result.candidate.background.generated, false)
	assert.equal(result.candidate.surface.generated, false)
	assert.ok(certificate.selected.compactDeltas?.every((delta) => delta >= -1e-12))
	assert.ok(certificate.selected.compactDeltas?.some((delta) => delta > 1e-12))
	assert.ok(certificate.selected.objectiveDeltas.every((delta) => delta >= -1e-12))
	assert.ok(certificate.selected.objectiveDeltas.some((delta) => delta > 1e-12))
	assert.equal(certificate.selected.compact?.recompositionPass, true)
	assert.equal(certificate.canonical.relation.compact?.recompositionPass, true)
	assert.ok(certificate.selected.roles)
	for (const role of ["background", "foreground", "surface", "accent"] as const) {
		const provenance = certificate.selected.roles[role]
		const offset = provenance.representativePixelIndex * 3
		assert.deepEqual(provenance.rgb, [...image.data.subarray(offset, offset + 3)])
		assert.deepEqual(provenance.rgb, result.candidate[role].rgb)
	}
	assert.equal(certificate.selected.apcaLc.foregroundOnBackground,
		apcaContrast(result.candidate.foreground.rgb, result.candidate.background.rgb))
	assert.equal(certificate.selected.apcaLc.accentOnSurface,
		apcaContrast(result.candidate.accent.rgb, result.candidate.surface.rgb))
	assert.deepEqual(certificate.completeTupleFrontier, certificate.withinClassFrontier)
	assert.equal(certificate.admittedTupleFrontier.length, certificate.counts.admittedCompleteTuples)
})

test("ineligible collapsed canonical returns the exact canonical object unchanged", async () => {
	const image = await loadImage(await readFile(
		`${projectRoot}/00/00007e976f2fb1819d1ec7e0cc2869f39d397ba3.jpg`,
	))
	const result = buildJointPaletteCompactRelationDominance(image)

	assert.equal(result.certificate.route, "preserve-canonical-collapsed")
	assert.equal(result.certificate.selected.changed, false)
	assert.equal(result.candidate, result.canonical)
	assert.deepEqual(result.candidate, result.canonical)
	assert.equal(JSON.stringify(result.candidate), JSON.stringify(result.canonical))
	assert.equal(result.certificate.counts.admittedCompleteTuples, 0)
	assert.deepEqual(result.certificate.admittedTupleFrontier, [])
})
