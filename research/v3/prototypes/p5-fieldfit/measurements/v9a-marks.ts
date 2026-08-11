/**
 * W-V9a probe — the mark/region instrument on a real cover. Read-only: it imports the prototype's
 * modules, rebuilds the context `candidate.ts` builds (the same two branches, in the same order) and
 * reports. Nothing here is adopted and nothing is wired.
 *
 *     node --experimental-strip-types prototypes/p5-fieldfit/measurements/v9a-marks.ts <img> [hex…]
 *
 * Extra arguments are hex colours to locate in the mark set — the "is this published colour
 * ink-shaped at mark level" question (15b, and V9b's ordering question).
 */

import { analyzeImage } from "../candidate.ts"
import { colorFromHex, okLabDistance, rgbToHex, rgbToOkLab } from "../../../src/contract/color.ts"
import type { OkLab } from "../../../src/contract/types.ts"
import { coveredFamilies, sameColorLab } from "../src/assignment.ts"
import type { IdentitySet } from "../src/assignment.ts"
import { compositeFieldFit, fieldFitWithoutInk } from "../src/components.ts"
import type { FieldReading } from "../src/components.ts"
import { decodeAndInventory, unpackRgb } from "../src/decode.ts"
import { fitField, fitFieldComponents } from "../src/fieldfit.ts"
import { identityFamiliesV2, readMarks } from "../src/marks.ts"
import type { MarkRegion } from "../src/marks.ts"
import type { FieldFit } from "../src/types.ts"

const image = process.argv[2]
if (image === undefined) throw new Error("usage: v9a-marks.ts <image> [hex…]")
const probes = process.argv.slice(3)

const hexOf = (packed: number) => rgbToHex(unpackRgb(packed))
const round = (value: number, places = 4) => Number(value.toFixed(places))

// --- the context `candidate.ts` builds, rebuilt in its own order ---------------------------------
const t0 = performance.now()
const { raster } = await decodeAndInventory(image)
const fit = fitField(raster)
let overlayFit: FieldFit = fit
let components: FieldReading | null = null
if (fit.noField) {
	components = fitFieldComponents(raster)
	overlayFit = components.components[0] !== undefined
		? compositeFieldFit(components, raster, fit)
		: fieldFitWithoutInk(fit, components, raster)
}
const tContext = performance.now() - t0

const tMarks0 = performance.now()
const reading = readMarks(raster, overlayFit, components)
const tMarks = performance.now() - tMarks0

const v2 = identityFamiliesV2(reading.marks, reading.totalPixels)
const v2Full = identityFamiliesV2(reading.marks, reading.totalPixels, 1024)

// --- what ships today, for the before/after ------------------------------------------------------
const analysis = await analyzeImage(image)
const v1: IdentitySet | null = analysis.assignment?.identity ?? null

function familyTable(set: IdentitySet | null) {
	if (set === null) return null
	return {
		totalFamilies: set.totalFamilies,
		massRetained: round(set.massRetained),
		families: set.families.map((family) => ({
			rank: family.rank,
			hex: hexOf(family.representative),
			massFraction: round(family.massFraction),
			memberCount: family.memberCount,
		})),
	}
}

function markRow(entry: MarkRegion) {
	return {
		kind: entry.kind,
		index: entry.index,
		hex: hexOf(entry.representative),
		pixels: entry.pixels,
		mass: round(entry.mass, 1),
		massFraction: round(entry.massFraction),
		chroma: round(entry.chroma),
		mortality: entry.ink === null ? null : round(entry.ink.erosionMortality, 3),
		adjacency: entry.ink === null ? null : round(entry.ink.groundAdjacency, 3),
		inkLike: entry.inkLike,
		inkShaped: entry.inkShaped,
		box: [entry.box.minX, entry.box.minY, entry.box.maxX, entry.box.maxY],
	}
}

/**
 * How much material of a given colour exists at all, and which marks hold it.
 *
 * The 15b question is *"is the reviewer's colour ink-shaped at mark level"*, and a mark set that
 * publishes no such colour has two possible reasons — the material is not there, or it is there and
 * the grouping fragmented it. This separates them: it counts the raster pixels within one bar of the
 * probe that no field surface claims, and attributes them to marks.
 */
function material(lab: OkLab) {
	const holders = new Map<number, number>()
	let pixels = 0
	for (let position = 0; position < reading.marks.length; position += 1) {
		const entry = reading.marks[position]!
		if (entry.kind !== "mark") continue
		for (let row = entry.box.minY; row <= entry.box.maxY; row += 1) {
			for (let column = entry.box.minX; column <= entry.box.maxX; column += 1) {
				const index = row * raster.width + column
				if (entry.support[index] !== 1) continue
				const pixel: OkLab = [
					raster.lab[index * 3]!,
					raster.lab[index * 3 + 1]!,
					raster.lab[index * 3 + 2]!,
				]
				if (!sameColorLab(lab, pixel, 1)) continue
				pixels += 1
				holders.set(position, (holders.get(position) ?? 0) + 1)
			}
		}
	}
	const ranked = [...holders.entries()].sort((first, second) => second[1] - first[1]).slice(0, 4)
	return {
		unexplainedPixels: pixels,
		heldBy: ranked.map(([position, count]) => ({
			rank: position + 1,
			ofThisColour: count,
			...markRow(reading.marks[position]!),
		})),
	}
}

/** Where does a published colour sit in the mark set? Nearest entry in OKLab, and its verdict. */
function locate(hex: string) {
	const lab: OkLab = rgbToOkLab(colorFromHex(hex).rgb)
	const ranked = reading.marks
		.map((entry, position) => ({ entry, position, distance: okLabDistance(lab, entry.lab) }))
		.sort((first, second) =>
			first.distance - second.distance || first.entry.representative - second.entry.representative
		)
	const nearest = ranked[0]
	// Also: the highest-mass entry whose colour is the *same colour* as the probe, which is the
	// question "is this published colour's material ink-shaped" rather than "what is nearest".
	const same = reading.marks.find((entry) => sameColorLab(lab, entry.lab, 1))
	return {
		hex,
		nearestRank: nearest === undefined ? null : nearest.position + 1,
		nearestDistance: nearest === undefined ? null : round(nearest.distance),
		nearest: nearest === undefined ? null : markRow(nearest.entry),
		sameColorEntry: same === undefined ? null : markRow(same),
		coversV2: coveredFamilies(v2, [lab]),
		coversV1: v1 === null ? null : coveredFamilies(v1, [lab]),
		material: material(lab),
	}
}

process.stdout.write(JSON.stringify({
	image,
	size: `${raster.width}×${raster.height}`,
	published: {
		background: analysis.palette.roles.background.hex,
		surface: analysis.palette.roles.surface.hex,
		foreground: analysis.palette.roles.foreground.hex,
		accent: analysis.palette.roles.accent.hex,
		escape: analysis.palette.escape !== null,
	},
	fit: {
		noField: fit.noField,
		fieldExplainedFraction: round(fit.fieldExplainedFraction),
		components: components === null ? null : components.components.length,
		retreat: components?.retreat ?? null,
	},
	cost: { contextMs: round(tContext, 1), marksMs: round(tMarks, 1) },
	scale: {
		diagonal: round(reading.scale.diagonal, 1),
		radius: reading.scale.radius,
		chosenIndex: reading.scale.chosenIndex,
		criterion: reading.scale.criterion,
		plateauLength: reading.scale.plateauLength,
		curve: reading.scale.scales.map((radius, index) => ({
			r: radius,
			n: reading.scale.counts[index],
			flatness: reading.scale.flatness[index] === null
				? null
				: round(reading.scale.flatness[index]!, 3),
		})),
	},
	material: {
		unexplainedPixels: reading.unexplainedPixels,
		unexplainedFraction: round(reading.unexplainedPixels / reading.totalPixels),
		entries: reading.marks.length,
		massRetained: round(reading.massRetained),
	},
	marks: reading.marks.slice(0, 16).map(markRow),
	identityV1: familyTable(v1),
	identityV2: familyTable(v2),
	identityV2Ranking: v2Full.families.slice(0, 12).map((family) => ({
		rank: family.rank,
		hex: hexOf(family.representative),
		massFraction: round(family.massFraction),
	})),
	probes: probes.map(locate),
}, null, 2))
