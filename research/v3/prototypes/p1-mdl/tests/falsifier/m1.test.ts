/**
 * # The falsifier's own tests
 *
 * The falsifier is thin by design — the energies have their own suites, `src/stats` has its own — so
 * only what this directory adds is tested here:
 *
 * 1. **End-to-end ordering** on two synthetic entries whose order is known before the code runs.
 * 2. **Determinism**: measure twice, score twice, byte-identical rows.
 * 3. **The λ decomposition**: `score.ts` reads the whole sweep off `dataPart + λ·structuralPart`
 *    instead of re-evaluating, and the re-evaluation must agree *exactly* — not within a tolerance,
 *    because the affine reading is the same additions the energies themselves perform.
 * 4. **The pairing arithmetic**, which is where a paired comparison would silently become an
 *    unpaired one, and where an empty stratum would silently become a rate instead of a refusal.
 *
 * ## The ordering, and why it is known in advance
 *
 * The fixture is the arm A′ **naming-gain** shape (`tests/energy-aprime/naming-gain.test.ts`, arm A′
 * §2.3; the same fixture family arm A's `orderings.test.ts` case (d) uses): a 64 × 64 image with a
 * large dull field, a second dull colour 1.58 identity bars away carrying 608 pixels, and a
 * chromatically isolated vivid patch 12.2 bars away carrying 81. The two entries differ in exactly
 * one field — which colour the ink names:
 *
 * - **good** names the vivid patch. Its 81 pixels cost 6.016 bits each generically and 3.148 named,
 *   so naming them saves `81 × 2.868 ≈ 232` bits.
 * - **bad** names the second dull colour. That colour lives inside the field's own kernel, so it is
 *   already cheap generically (1.730 bits) and dearer named (3.384): the assignment declines the
 *   name and the saving is exactly zero.
 *
 * Both configurations are flat and fully collapsed, so **Ω = 0 and L(P) = 51 bits for both**. The
 * structural halves of the two energies are therefore identical and the ordering is λ-independent by
 * construction — which is a property of the fixture, stated here, not a coincidence to be discovered.
 * The arithmetic above is arm A′'s; arm A prices the same pair in nats through a completely different
 * residual model (uniform over the sRGB gamut rather than the image's own density), and the test
 * asserts the ordering holds in **both** currencies, which is the only claim the falsifier needs.
 *
 * ```sh
 * cd research/v3
 * NODE_NO_WARNINGS=1 node --experimental-strip-types --test prototypes/p1-mdl/tests/falsifier/m1.test.ts
 * ```
 */

import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import type { LegacyEntry } from "../../src/emit/legacy.ts"
import { measureImage } from "../../src/measure/index.ts"
import type { Measurement } from "../../src/measure/types.ts"
import {
	pairedComparison,
	PREREGISTRATION_REFERENCE,
	type ComparisonSpec,
} from "../../src/falsifier/compare.ts"
import { checkLambdaAlgebra, scoreEntry } from "../../src/falsifier/score.ts"
import {
	DEGENERATE_EXPLAINED_MASS_BELOW,
	LAMBDA_GRID,
	lambdaKey,
	type ArtworkRecord,
	type EntryScore,
} from "../../src/falsifier/types.ts"
import { cleanupFixtures, legacyEntry, writeRgbImage } from "./support.ts"

/** The large dull field: everything the two blocks below do not cover. */
const FIELD: Rgb8 = [70, 75, 85]
/** A second dull colour, 1.58 identity bars from the field. 38 × 16 = 608 pixels. */
const SECOND_DULL: Rgb8 = [74, 79, 89]
/** The chromatically isolated patch, 12.2 bars from the field. 9 × 9 = 81 pixels. */
const VIVID: Rgb8 = [220, 30, 40]

const VIVID_PIXELS = 81
const PIXELS = 64 * 64

const SHA = "0000000000000000000000000000000000000000000000000000000000000001"

/** The hand-derived likelihood gain from naming the isolated patch, in bits. */
const EXPECTED_GAIN_BITS = 232.3

let imagePath: string
let measurement: Measurement
let goodEntry: LegacyEntry
let badEntry: LegacyEntry
let good: EntryScore
let bad: EntryScore

before(async () => {
	imagePath = await writeRgbImage("naming-gain.png", 64, 64, (x, y) => {
		if (y < 16 && x < 38) return SECOND_DULL
		if (y >= 40 && y < 49 && x >= 40 && x < 49) return VIVID
		return FIELD
	})
	measurement = await measureImage(imagePath)

	const shared = { imagePath, contentSha256: SHA, background: FIELD, surface: FIELD } as const
	goodEntry = legacyEntry({
		...shared,
		entryId: "synthetic-good",
		tier: "endorsed",
		foreground: VIVID,
		accent: VIVID,
	})
	badEntry = legacyEntry({
		...shared,
		entryId: "synthetic-bad",
		tier: "known-bad",
		foreground: SECOND_DULL,
		accent: SECOND_DULL,
	})

	good = scoreEntry(goodEntry, measurement)
	bad = scoreEntry(badEntry, measurement)
})

after(async () => {
	await cleanupFixtures()
})

describe("the fixture is the image the ordering argument assumes", () => {
	test("three triples, the exact smoothed-mass path, the painted proportions", () => {
		assert.equal(measurement.triples.colorCount, 3)
		assert.equal(measurement.triples.pixelCount, PIXELS)
		assert.equal(measurement.smoothedMass.mode, "exact")
		const counts = [...measurement.triples.counts].sort((left, right) => right - left)
		assert.deepEqual(counts, [PIXELS - 608 - 81, 608, 81])
	})
})

describe("end-to-end: the hand-known ordering", () => {
	test("both entries convert and are scored in the two currencies", () => {
		assert.equal(good.tier, "endorsed")
		assert.equal(bad.tier, "known-bad")
		assert.equal(good.artworkSha, bad.artworkSha)
		assert.equal(good.p1a.unit, "nats")
		assert.equal(good.p1ap.unit, "bits")
		for (const score of [good, bad]) {
			assert.ok(Number.isFinite(score.p1a.dataPart))
			assert.ok(Number.isFinite(score.p1ap.dataPart))
		}
	})

	test("the two entries carry identical structure, so the ordering cannot come from λ", () => {
		// Ω = 0 (both collapse flags set, no ramp) and L(P) = 51 bits (2 flags + 1 gradient + 2 × 24).
		assert.equal(good.p1a.structuralPart, 0)
		assert.equal(bad.p1a.structuralPart, 0)
		assert.equal(good.p1ap.structuralPart, 51)
		assert.equal(bad.p1ap.structuralPart, 51)
	})

	test("naming the isolated patch beats naming the near-duplicate, at every λ, in both arms", () => {
		for (const lambda of LAMBDA_GRID) {
			const key = lambdaKey(lambda)
			assert.ok(
				good.p1a.totals[key] < bad.p1a.totals[key],
				`arm A at λ=${lambda}: ${good.p1a.totals[key]} should be below ${bad.p1a.totals[key]}`,
			)
			assert.ok(
				good.p1ap.totals[key] < bad.p1ap.totals[key],
				`arm A′ at λ=${lambda}: ${good.p1ap.totals[key]} should be below ${bad.p1ap.totals[key]}`,
			)
		}
	})

	test("arm A′'s margin is the hand-derived 232 bits", () => {
		const gain = bad.p1ap.dataPart - good.p1ap.dataPart
		assert.ok(Math.abs(gain - EXPECTED_GAIN_BITS) < 0.5, `gain was ${gain} bits`)
	})

	test("the structure diagnostic is the named-role share of image mass", () => {
		// `field + ink` and `1 − generic` are the same partition read two ways: `assemble()` gives every
		// pixel to exactly one code, so they agree to float association and nothing weaker.
		for (const score of [good, bad]) {
			const generic = score.p1ap.nuisance.genericMassFraction as number
			assert.ok(Math.abs(score.explainedMassFraction - (1 - generic)) < 1e-12)
			assert.ok(score.explainedMassFraction >= 0 && score.explainedMassFraction <= 1)
		}
		// The good entry explains exactly the vivid patch and nothing else; the bad entry explains
		// nothing at all, because the colour it names is cheaper left in the residual.
		assert.equal(good.explainedMassFraction, VIVID_PIXELS / PIXELS)
		assert.equal(bad.explainedMassFraction, 0)
		// Which puts the two on opposite sides of the report's degeneracy cut — the artwork's stratum
		// is the maximum over its entries, so this artwork is `structured`.
		assert.ok(good.explainedMassFraction > DEGENERATE_EXPLAINED_MASS_BELOW)
		assert.ok(bad.explainedMassFraction < DEGENERATE_EXPLAINED_MASS_BELOW)
	})
})

describe("determinism", () => {
	test("a second measurement and a second scoring produce byte-identical rows", async () => {
		const second = await measureImage(imagePath)
		assert.equal(JSON.stringify(scoreEntry(goodEntry, second)), JSON.stringify(good))
	})

	test("scoring twice off one measurement is byte-identical", () => {
		assert.equal(JSON.stringify(scoreEntry(badEntry, measurement)), JSON.stringify(bad))
	})
})

describe("the λ sweep is algebra, and the algebra is exact", () => {
	test("re-evaluating at every swept λ reproduces the affine reading with zero deviation", () => {
		for (const lambda of LAMBDA_GRID) {
			for (const [entry, score] of [
				[goodEntry, good],
				[badEntry, bad],
			] as const) {
				const deviation = checkLambdaAlgebra(entry, measurement, score, lambda)
				assert.equal(deviation.p1a, 0, `arm A deviates at λ=${lambda}`)
				assert.equal(deviation.p1ap, 0, `arm A′ deviates at λ=${lambda}`)
			}
		}
	})

	test("total(λ) is affine with the reported slope", () => {
		for (const score of [good, bad]) {
			for (const arm of ["p1a", "p1ap"] as const) {
				const at1 = score[arm].totals[lambdaKey(1)]
				const at4 = score[arm].totals[lambdaKey(4)]
				assert.ok(Math.abs(at4 - at1 - 3 * score[arm].structuralPart) < 1e-9)
			}
		}
	})
})

describe("the paired comparison counts what it says it counts", () => {
	const spec: ComparisonSpec = {
		id: "test-good-vs-known-bad",
		label: "synthetic",
		leftTiers: ["endorsed", "acceptable"],
		rightTiers: ["known-bad"],
		alternative: "greater",
	}

	function fixture(): { byArtwork: Map<string, EntryScore[]>; artworks: ArtworkRecord[] } {
		return {
			byArtwork: new Map([[SHA, [good, bad]]]),
			artworks: [
				{
					artworkSha: SHA,
					imagePath,
					entryIds: [good.entryId, bad.entryId],
					tiers: ["endorsed", "known-bad"],
					explainedMassFraction: good.explainedMassFraction,
					stratum: "structured",
				},
			],
		}
	}

	test("one artwork, one pair, one win, and the exact test on n=1", () => {
		const { byArtwork, artworks } = fixture()
		const comparison = pairedComparison(spec, byArtwork, artworks, "p1ap", 1, "all", "best-of-side")
		assert.equal(comparison.artworks, 1)
		assert.deepEqual(comparison.counts, { wins: 1, losses: 0, ties: 0 })
		assert.equal(comparison.rows.length, 1)
		assert.equal(comparison.rows[0].leftEntryId, "synthetic-good")
		assert.equal(comparison.rows[0].rightEntryId, "synthetic-bad")
		assert.equal(comparison.rows[0].outcome, "left-lower")
		assert.ok(comparison.test.ok)
		// One trial at p=0.5, one-sided: P(X ≥ 1) = 0.5. A win on one artwork is not evidence, and the
		// test says so rather than the analysis having to remember it. (`stableSum` over the tail
		// leaves the last bit at 0.5000000000000004, which is the exact test's arithmetic, not slack.)
		assert.ok(Math.abs(comparison.test.pValue - 0.5) < 1e-12)
		assert.equal(
			comparison.test.provenance.inputs.directionFixedInAdvance,
			PREREGISTRATION_REFERENCE,
			"the one-sided direction must travel with the number",
		)
	})

	test("both arms agree on this artwork, at every λ", () => {
		const { byArtwork, artworks } = fixture()
		for (const arm of ["p1a", "p1ap"] as const) {
			for (const lambda of LAMBDA_GRID) {
				const comparison = pairedComparison(spec, byArtwork, artworks, arm, lambda, "all", "best-of-side")
				assert.deepEqual(comparison.counts, { wins: 1, losses: 0, ties: 0 }, `${arm} at λ=${lambda}`)
			}
		}
	})

	test("a stratum with no artworks yields a refusal, never a rate", () => {
		const { byArtwork, artworks } = fixture()
		const comparison = pairedComparison(spec, byArtwork, artworks, "p1a", 1, "degenerate", "best-of-side")
		assert.equal(comparison.artworks, 0)
		assert.deepEqual(comparison.counts, { wins: 0, losses: 0, ties: 0 })
		assert.equal(comparison.test.ok, false)
		assert.equal(comparison.interval.ok, false)
		// The refusal is a type: there is no `pValue` field to reach for.
		assert.ok(!("pValue" in comparison.test))
	})

	test("an artwork with only one side present contributes nothing", () => {
		const comparison = pairedComparison(
			spec,
			new Map([[SHA, [good]]]),
			[
				{
					artworkSha: SHA,
					imagePath,
					entryIds: [good.entryId],
					tiers: ["endorsed"],
					explainedMassFraction: good.explainedMassFraction,
					stratum: "structured",
				},
			],
			"p1a",
			1,
			"all",
			"best-of-side",
		)
		assert.equal(comparison.artworks, 0)
		assert.equal(comparison.rows.length, 0)
		assert.equal(comparison.test.ok, false)
	})

	test("all-pairs declares its pseudo-replication", () => {
		const { byArtwork, artworks } = fixture()
		const comparison = pairedComparison(spec, byArtwork, artworks, "p1ap", 1, "all", "all-pairs")
		assert.ok(comparison.test.ok)
		assert.equal(comparison.test.provenance.inputs.distinctUnits, 1)
		assert.ok(
			comparison.test.provenance.caveats.some((caveat) => caveat.includes("PSEUDO-REPLICATION")),
			"the all-pairs reading must carry the pseudo-replication caveat",
		)
	})
})
