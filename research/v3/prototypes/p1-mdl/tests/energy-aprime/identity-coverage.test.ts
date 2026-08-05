/**
 * # Identity coverage — the M3 round's item 2, reproduced as a fixture
 *
 * `review-rounds/m3-priors-pairwise/ANALYSIS.md` §4d, verbatim, on the round's item 2:
 *
 * > *"those 2 palette proposals are missing too much of the artwork's identity. The artwork has 4
 * > colors (white, yellow, red, black), and the background is yellow."*
 *
 * Both arms drew that sentence. Arm A′ published black/grey/white and put red in no role at all. The
 * analysis reads it as `DESIGN.md` fold item 11 — *"identity-coverage is a grading axis, and it is
 * CHROMATIC-DISTINCTNESS coverage, not mass coverage"* — and item 11's recorded repair is the
 * chromatic residual this suite tests. **This file is the reviewer's sentence turned into an
 * assertion**, so that if the residual ever goes back to reading mass, the round's own item fails
 * here before anything is emitted.
 *
 * ## The fixture, and why it is shaped like an album cover
 *
 * 64 × 64 = 4,096 pixels; four colours, in the two shapes a cover actually uses them in:
 *
 * | colour | rgb | pixels | shape |
 * |---|---|---|---|
 * | **yellow** | `#f0c420` (+2 shades) | 2,428 | the upper field, rows 0–39, softly banded |
 * | **white** | `#f5f5f0` (+2 shades) | 1,344 | the lower field, rows 40–63, softly banded |
 * | **black** | `#101014` | 228 | two lines of title text over the yellow |
 * | **red** | `#c82028` | 96 | a small mark on the white |
 *
 * The two field colours carry shading — three shades each, a bar or so apart — because real covers
 * do, and because that is exactly what makes them *chromatically crowded* and therefore cheap under
 * the residual. The two ink colours are single flat triples with stroke-like supports, which is what
 * a title and a logo are. **The reviewer counts four colours here, and so must the energy.**
 *
 * ## What is asserted, and what deliberately is not
 *
 * 1. The full four-role configuration beats **every** two-colour collapsed description at λ = 1 —
 *    the round's complaint, priced. It is also the argmin over all four-name configurations, and it
 *    beats every three-name one, so the fourth colour is not merely tolerated: it is bought.
 * 2. The background is the **yellow**, not the white. The energy itself is exactly indifferent
 *    between `(background, surface) = (yellow, white)` and `(white, yellow)` — both roles are field
 *    roles and the field code is the pointwise minimum of their two kernels — so this is asserted in
 *    two parts, which is the honest decomposition: the *energy* fixes the field **pair**, and
 *    `DESIGN.md` decision 5's convention (*"two-flat order: larger field mass is background"*,
 *    `orderFieldPair` in `src/search/conventions.ts`) fixes the **order**. Both are checked: the
 *    argmin's field pair is {yellow, white}, and yellow's smoothed mass is the larger, so the
 *    published background is the yellow.
 * 3. Determinism across the residual's per-measurement cache: the first call computes `ρ`, the second
 *    reads it back, and the two results must be byte-identical.
 *
 * Not asserted: any *magnitude* of the four-role total. Nothing in `DESIGN.md` pins one, and locking
 * it would make this a change-detector rather than the round's item.
 */

import assert from "node:assert/strict"
import { after, describe, it } from "node:test"
import type { Rgb8 } from "../../../../src/contract/types.ts"
import { energyOfAPrime } from "../../src/energy/aprime/index.ts"
import { measureImage } from "../../src/measure/index.ts"
import { FIXTURE_SIDE, cleanupFixtures, configuration, writeRgbImage } from "./support.ts"

after(cleanupFixtures)

const SIDE = FIXTURE_SIDE

const WHITE: Rgb8 = [245, 245, 240]
const YELLOW: Rgb8 = [240, 196, 32]
const RED: Rgb8 = [200, 32, 40]
const BLACK: Rgb8 = [16, 16, 20]
/** The artwork's four colours, in the order the reviewer named them. */
const ARTWORK: readonly Rgb8[] = [WHITE, YELLOW, RED, BLACK]

/** A field colour's shading: three shades three sRGB steps apart, i.e. about a bar. */
function shade(color: Rgb8, step: number): Rgb8 {
	return [color[0] + step * 3, color[1] + step * 3, color[2] + step * 3]
}

async function artworkFixture() {
	return measureImage(
		await writeRgbImage("i-identity.png", SIDE, SIDE, (x, y) => {
			// Two lines of title text, in black, over the yellow field.
			if (y >= 8 && y < 14 && x >= 6 && x < 46 && x % 6 < 3) return BLACK
			if (y >= 20 && y < 26 && x >= 6 && x < 38 && x % 6 < 3) return BLACK
			// A small red mark on the white field.
			if (y >= 46 && y < 54 && x >= 44 && x < 56) return RED
			if (y < 40) return shade(YELLOW, Math.floor(y / 14) - 1)
			return shade(WHITE, Math.floor((y - 40) / 8) - 1)
		}),
	)
}

/** Every configuration that names exactly `count` colours out of the artwork's four. */
function* configurations(count: 2 | 3 | 4): Generator<ReturnType<typeof configuration>> {
	for (const background of ARTWORK) {
		for (const foreground of ARTWORK) {
			if (count === 2) {
				yield configuration({ background, foreground })
				continue
			}
			for (const third of ARTWORK) {
				if (count === 3) {
					yield configuration({ background, surface: third, foreground })
					yield configuration({ background, foreground, accent: third })
					continue
				}
				for (const fourth of ARTWORK) {
					yield configuration({ background, surface: third, foreground, accent: fourth })
				}
			}
		}
	}
}

describe("identity coverage — the artwork has four colours and the description must too", () => {
	it("beats every two-colour collapsed description with the full four-role configuration at λ = 1", async () => {
		const measurement = await artworkFixture()
		const four = energyOfAPrime(
			measurement,
			configuration({ background: YELLOW, surface: WHITE, foreground: BLACK, accent: RED }),
		)
		assert.equal(four.nuisance.serializationBits, 99)

		let bestTwo = Number.POSITIVE_INFINITY
		let bestTwoDescription = ""
		for (const config of configurations(2)) {
			const result = energyOfAPrime(measurement, config)
			assert.equal(result.nuisance.serializationBits, 51)
			if (result.total < bestTwo) {
				bestTwo = result.total
				bestTwoDescription = `${config.background}/${config.foreground}`
			}
		}

		assert.ok(
			four.total < bestTwo,
			`four roles (${four.total}) must beat the best two-colour description ${bestTwoDescription} (${bestTwo})`,
		)
		// The four-role description leaves nothing in the residual: every colour of the artwork is
		// named, and the 48 extra bits of L(P) are bought back many times over.
		assert.equal(four.nuisance.genericMassFraction, 0)
		assert.equal(four.nuisance.genericTriples, 0)
	})

	it("is the argmin: no three-name and no other four-name description is cheaper", async () => {
		const measurement = await artworkFixture()
		const four = energyOfAPrime(
			measurement,
			configuration({ background: YELLOW, surface: WHITE, foreground: BLACK, accent: RED }),
		)

		for (const config of configurations(3)) {
			const result = energyOfAPrime(measurement, config)
			assert.ok(
				four.total < result.total,
				`a three-name description scored ${result.total}, below the four-role ${four.total}`,
			)
		}
		for (const config of configurations(4)) {
			const result = energyOfAPrime(measurement, config)
			assert.ok(
				four.total <= result.total + 1e-9,
				`a four-name description scored ${result.total}, below the four-role ${four.total}`,
			)
		}
	})

	it("puts the yellow in the background: the energy fixes the pair, decision 5 fixes the order", async () => {
		const measurement = await artworkFixture()
		const rowOf = (rgb: Rgb8): number => {
			const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]
			const index = measurement.triples.keys.indexOf(key)
			assert.ok(index >= 0)
			return index
		}

		// (i) The energy's own choice of *which two colours are the field* is {yellow, white}: every
		// other field pair is strictly worse, whatever the inks do.
		const chosen = energyOfAPrime(
			measurement,
			configuration({ background: YELLOW, surface: WHITE, foreground: BLACK, accent: RED }),
		)
		for (const config of configurations(4)) {
			const pair = new Set([String(config.background), String(config.surface)])
			const isChosenPair = pair.has(String(YELLOW)) && pair.has(String(WHITE))
			if (isChosenPair) continue
			const result = energyOfAPrime(measurement, config)
			assert.ok(
				chosen.total < result.total,
				`field pair ${[...pair].join(" + ")} scored ${result.total}, at or below the chosen ${chosen.total}`,
			)
		}

		// (ii) The energy is exactly indifferent to the order within that pair — both are field roles
		// and the field code is the minimum of their kernels — so the order is a convention, not a
		// number this energy produces. Locking the indifference is what makes (iii) the whole answer.
		const swapped = energyOfAPrime(
			measurement,
			configuration({ background: WHITE, surface: YELLOW, foreground: BLACK, accent: RED }),
		)
		assert.equal(swapped.total, chosen.total)

		// (iii) `DESIGN.md` decision 5: *"two-flat order: larger field mass is background"*, read on
		// smoothed mass by `orderFieldPair` in `src/search/conventions.ts`. Yellow's is the larger, so
		// the published background is the yellow — which is the reviewer's sentence.
		const yellowMass = measurement.smoothedMass.mass[rowOf(YELLOW)]
		const whiteMass = measurement.smoothedMass.mass[rowOf(WHITE)]
		assert.ok(
			yellowMass > whiteMass,
			`yellow (${yellowMass}) must carry the larger field mass, not white (${whiteMass})`,
		)
	})

	it("is deterministic across the residual's per-measurement cache", async () => {
		const measurement = await artworkFixture()
		const config = configuration({
			background: YELLOW,
			surface: WHITE,
			foreground: BLACK,
			accent: RED,
		})
		// The first call computes ρ, the second reads the cache. Byte-identical, not "close".
		const first = JSON.stringify(energyOfAPrime(measurement, config))
		const second = JSON.stringify(energyOfAPrime(measurement, config))
		assert.equal(first, second)

		// A second, independent measurement of the same image must agree with the first — the cache is
		// keyed on the measurement object, so this is the check that it is an optimisation and nothing
		// more.
		const again = await artworkFixture()
		assert.equal(JSON.stringify(energyOfAPrime(again, config)), first)
	})

	it("is affine in λ on this fixture, with slope L(P)", async () => {
		const measurement = await artworkFixture()
		const config = configuration({
			background: YELLOW,
			surface: WHITE,
			foreground: BLACK,
			accent: RED,
		})
		const base = energyOfAPrime(measurement, config, { lambda: 1 })
		const paletteBits = base.nuisance.serializationBits as number
		for (const lambda of [0.25, 0.5, 1, 2, 4]) {
			const result = energyOfAPrime(measurement, config, { lambda })
			assert.equal(result.nuisance.likelihoodBits, base.nuisance.likelihoodBits)
			assert.equal(result.terms.paletteBits, lambda * paletteBits)
			assert.equal(result.total, (base.nuisance.likelihoodBits as number) + lambda * paletteBits)
		}
	})
})
