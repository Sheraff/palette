/**
 * The legacy fixture loader — tier counts, tier separation, and image resolution.
 *
 * These are **census assertions on real data**, not fixtures: they read
 * `research/v3/data/legacy/*.json` as they stand. That is deliberate. `DESIGN.md` M1 pre-registers a
 * reading of the falsifier over "351 endorsed / 166 acceptable / 37 known-bad", and a pre-registered
 * reading over data that quietly changed size is not pre-registered at all. If a regeneration of the
 * fixtures moves a count, this test fails and someone has to decide whether M1's reading still says
 * what it said.
 */

import assert from "node:assert/strict"
import { test } from "node:test"
import {
	censusOfTier,
	LEGACY_TIER_FILES,
	LEGACY_TIERS,
	loadLegacyTier,
	loadLegacyTiers,
	toConfiguration,
	V2_3_MIDPOINT_POSITION,
	type LegacyTier,
} from "../../src/emit/legacy.ts"
import { serializationCost } from "../../src/emit/cost.ts"

/**
 * The counts `DESIGN.md` M1 and `data/legacy/README.md` both quote.
 * `[INHERITED]` — not measured here, restated here, and checked against the files.
 */
const EXPECTED_ENTRIES: Readonly<Record<LegacyTier, number>> = {
	endorsed: 351,
	acceptable: 166,
	"known-bad": 37,
}

test("three tiers, with the counts DESIGN.md M1 pre-registers", () => {
	const tiers = loadLegacyTiers()
	assert.deepEqual([...LEGACY_TIERS], ["endorsed", "acceptable", "known-bad"])
	for (const tier of LEGACY_TIERS) {
		assert.equal(tiers[tier].entries.length, EXPECTED_ENTRIES[tier], `${tier} entry count`)
		assert.equal(tiers[tier].tier, tier)
		assert.ok(tiers[tier].path.endsWith(LEGACY_TIER_FILES[tier]))
	}
	// 554 entries in total — asserted so that "never concatenated" is a rule about how they are used,
	// not an accident of nobody having added them up.
	const total = LEGACY_TIERS.reduce((sum, tier) => sum + tiers[tier].entries.length, 0)
	assert.equal(total, 554)
})

test("every entry carries its own tier tag, so a stray entry can always be traced back", () => {
	const tiers = loadLegacyTiers()
	for (const tier of LEGACY_TIERS) {
		for (const entry of tiers[tier].entries) assert.equal(entry.tier, tier)
	}
})

test("entryIds are disjoint across tiers — the README's membership rule, checked", () => {
	const tiers = loadLegacyTiers()
	const ids = Object.fromEntries(
		LEGACY_TIERS.map((tier) => [tier, new Set(tiers[tier].entries.map((entry) => entry.entryId))]),
	) as Record<LegacyTier, Set<string>>

	const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((id) => b.has(id)).length
	assert.equal(overlap(ids.endorsed, ids.acceptable), 0)
	assert.equal(overlap(ids.endorsed, ids["known-bad"]), 0)
	assert.equal(overlap(ids.acceptable, ids["known-bad"]), 0)

	// And unique within each tier.
	for (const tier of LEGACY_TIERS) assert.equal(ids[tier].size, EXPECTED_ENTRIES[tier])
})

test("artworks DO overlap across tiers — which is why concatenation is forbidden", () => {
	const tiers = loadLegacyTiers()
	const artworks = Object.fromEntries(
		LEGACY_TIERS.map((tier) => [
			tier,
			new Set(tiers[tier].entries.map((entry) => entry.artwork.imagePath)),
		]),
	) as Record<LegacyTier, Set<string>>

	const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((path) => b.has(path)).length

	assert.equal(overlap(artworks.endorsed, artworks.acceptable), 69)
	assert.equal(overlap(artworks.endorsed, artworks["known-bad"]), 22)
	assert.equal(overlap(artworks.acceptable, artworks["known-bad"]), 9)
	// 22 + 9 = 31 tier-pair collisions; 22 *distinct* artworks carry both an endorsed-or-acceptable
	// palette and a known-bad one, because the 9 acceptable∩known-bad artworks are all also endorsed.
	const good = new Set([...artworks.endorsed, ...artworks.acceptable])
	assert.equal(overlap(good, artworks["known-bad"]), 22)
	assert.equal(
		overlap(artworks.endorsed, artworks["known-bad"]) + overlap(artworks.acceptable, artworks["known-bad"]),
		31,
	)

	// 197 distinct artworks across all three tiers, against 554 entries: the fixtures are many
	// palettes per cover, which is exactly what makes the same-artwork paired comparison possible.
	const all = new Set([...good, ...artworks["known-bad"]])
	assert.equal(all.size, 197)
})

test("the census matches the schema actually found in the files", () => {
	const tiers = loadLegacyTiers()

	const endorsed = censusOfTier(tiers.endorsed)
	assert.equal(endorsed.entries, 351)
	assert.equal(endorsed.uniqueArtworks, 173)
	assert.deepEqual(endorsed.completeness, { full: 255, "roles-only": 93, partial: 3 })
	assert.equal(endorsed.gradientTrue, 134)
	assert.equal(endorsed.gradientFalse, 125)
	// The 93 roles-only entries recorded no field structure at all; 92 of them also record no
	// gradient boolean. (The three `partial` entries are roles-only in every practical sense.)
	assert.equal(endorsed.gradientUnrecorded, 92)

	const acceptable = censusOfTier(tiers.acceptable)
	assert.equal(acceptable.entries, 166)
	assert.equal(acceptable.uniqueArtworks, 89)
	assert.deepEqual(acceptable.completeness, { full: 166, "roles-only": 0, partial: 0 })
	assert.equal(acceptable.gradientTrue, 83)
	assert.equal(acceptable.gradientFalse, 83)

	const knownBad = censusOfTier(tiers["known-bad"])
	assert.equal(knownBad.entries, 37)
	assert.equal(knownBad.uniqueArtworks, 26)
	assert.deepEqual(knownBad.completeness, { full: 37, "roles-only": 0, partial: 0 })
	assert.equal(knownBad.gradientTrue, 14)
	assert.equal(knownBad.gradientFalse, 23)
})

test("every entry's source image resolves on disk", () => {
	const tiers = loadLegacyTiers()
	let found = 0
	let missing = 0
	for (const tier of LEGACY_TIERS) {
		const census = censusOfTier(tiers[tier])
		found += census.imagesFound
		missing += census.imagesMissing
		assert.equal(census.imagesFound, EXPECTED_ENTRIES[tier], `${tier}: images found`)
		assert.equal(census.imagesMissing, 0, `${tier}: images missing`)
	}
	assert.equal(found, 554)
	assert.equal(missing, 0)

	// Every entry carries the four identity fields a later verdict needs to stay scopable.
	for (const tier of LEGACY_TIERS) {
		for (const entry of tiers[tier].entries) {
			assert.match(entry.artwork.contentSha256, /^[0-9a-f]{64}$/)
			assert.ok(entry.artwork.byteCount > 0)
			assert.ok(entry.artwork.rendition.width > 0)
			assert.ok(entry.artwork.imagePath.length > 0)
		}
	}
})

test("full entries convert to a Configuration; incomplete ones say why they cannot", () => {
	const tiers = loadLegacyTiers()
	assert.equal(censusOfTier(tiers.endorsed).convertible, 255)
	assert.equal(censusOfTier(tiers.acceptable).convertible, 166)
	assert.equal(censusOfTier(tiers["known-bad"]).convertible, 37)

	// The 96 endorsement entries that are not `full` all fail, and never silently default.
	for (const entry of tiers.endorsed.entries) {
		const converted = toConfiguration(entry)
		assert.equal(converted.ok, entry.completeness === "full", entry.entryId)
		if (!converted.ok) assert.ok(converted.reason.length > 0)
	}

	// The three `partial` entries are reviewer corrections that named some roles and not others: one
	// gave background/surface/foreground, two gave the accent alone. The loader reports exactly which
	// are missing rather than reporting "partial" and leaving the caller to look.
	const partials = tiers.endorsed.entries.filter((entry) => entry.completeness === "partial")
	assert.equal(partials.length, 3)
	const reasons = partials.map((entry) => {
		const converted = toConfiguration(entry)
		assert.equal(converted.ok, false)
		return converted.ok ? "" : converted.reason
	}).sort()
	assert.deepEqual(reasons, [
		"roles missing from the v2-3 record: background, surface, foreground",
		"roles missing from the v2-3 record: background, surface, foreground",
		"roles missing from the v2-3 record: accent",
	].sort())
})

test("a reconstructed gradient is labelled as reconstructed and obeys the endpoint ruling", () => {
	const tiers = loadLegacyTiers()
	let ramps = 0
	let withMidpoint = 0
	for (const entry of tiers.acceptable.entries) {
		const converted = toConfiguration(entry)
		assert.equal(converted.ok, true)
		if (!converted.ok) continue
		const configuration = converted.configuration
		if (!configuration.gradient) {
			assert.deepEqual(configuration.stops, [])
			assert.deepEqual(converted.notes, [])
			continue
		}
		ramps += 1
		assert.ok(converted.notes.includes("gradient-reconstructed-from-v2-3-convention"))
		assert.ok(configuration.stops.length === 2 || configuration.stops.length === 3)
		// The endpoints are the field roles, at exactly 0 and 1.
		assert.deepEqual(configuration.stops[0].rgb, configuration.background)
		assert.equal(configuration.stops[0].position, 0)
		const last = configuration.stops[configuration.stops.length - 1]
		assert.deepEqual(last.rgb, configuration.surface)
		assert.equal(last.position, 1)
		if (configuration.stops.length === 3) {
			withMidpoint += 1
			assert.equal(configuration.stops[1].position, V2_3_MIDPOINT_POSITION)
		} else {
			assert.ok(converted.notes.includes("no-midpoint-recorded-two-stop-ramp"))
		}
	}
	assert.equal(ramps, 83)
	assert.ok(withMidpoint > 0, "v2-3 recorded midpoints on at least some ramps")
})

test("no legacy entry declares an escape — v2-3 had no such concept", () => {
	const tiers = loadLegacyTiers()
	for (const tier of LEGACY_TIERS) {
		for (const entry of tiers[tier].entries) {
			assert.equal(entry.configuration.escape, null)
		}
	}
})

test("loadLegacyTier is per-tier and matches the bundle", () => {
	const bundle = loadLegacyTiers()
	for (const tier of LEGACY_TIERS) {
		const single = loadLegacyTier(tier)
		assert.equal(single.entries.length, bundle[tier].entries.length)
		assert.equal(single.entries[0]?.entryId, bundle[tier].entries[0]?.entryId)
	}
})

test("the meta block travels with the tier, including the gradient advisory", () => {
	const tiers = loadLegacyTiers()
	for (const tier of LEGACY_TIERS) {
		assert.equal(tiers[tier].meta.contract, "v2-3")
		assert.equal(typeof tiers[tier].meta.gradientAdvisory, "string")
		assert.equal(typeof tiers[tier].meta.matchSemantics, "string")
	}
})

test("converted legacy configurations can be priced — the falsifier's smoke test", () => {
	// M1 scores legacy fixtures with both energies. L(P) is the half of arm A′ that needs no
	// measurement layer, so it can already be run over every convertible entry today.
	const tiers = loadLegacyTiers()
	let priced = 0
	let minBits = Infinity
	let maxBits = -Infinity
	for (const tier of LEGACY_TIERS) {
		for (const entry of tiers[tier].entries) {
			const converted = toConfiguration(entry)
			if (!converted.ok) continue
			const { bits } = serializationCost(converted.configuration)
			priced += 1
			minBits = Math.min(minBits, bits)
			maxBits = Math.max(maxBits, bits)
		}
	}
	assert.equal(priced, 255 + 166 + 37)
	// Every legacy palette is in-artwork (no escapes), so all of them sit inside the bounds
	// `cost.ts` derives.
	assert.ok(minBits >= 51, `min ${minBits}`)
	assert.ok(maxBits <= 165, `max ${maxBits}`)
})
