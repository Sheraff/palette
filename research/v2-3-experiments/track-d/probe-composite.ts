// Track D probe: compares the current field-lane-restricted domain flood fill against
// the proposed "field composite" membership (families transitively smooth-adjacent to the
// field lane). Reports domain population / border / corner / eligibility for both.
// Evaluation-only; nothing in research/v2-3 imports this.
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildNativePaletteEvidence } from "../../v2-3/src/internal/palette-core.ts"
import type { NativePaletteEvidence } from "../../v2-3/src/internal/palette-core.ts"

const IMAGE_ROOT = process.env.PALETTE_IMAGE_ROOT ?? "/Users/Flo/github/palette/images"

const IMAGES = process.argv.slice(2).length > 0 ? process.argv.slice(2) : [
	"loups.jpg", "black.jpg", "slipknot.jpg", "artofficial.jpg", "knuckles.jpg",
	"nada.jpg", "toxicity.jpg", "muse.jpg", "orelsan.jpg", "infected.jpg", "birdsofprey.jpg",
]

function labAt(labs: Float32Array, index: number): [number, number, number] {
	return [labs[index * 3], labs[index * 3 + 1], labs[index * 3 + 2]]
}
function distance(first: readonly number[], second: readonly number[]): number {
	return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2])
}
function ascii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function fieldComposite(evidence: NativePaletteEvidence): Set<string> {
	const members = new Set(evidence.lanes.find(({ name }) => name === "field")?.familyIds ?? [])
	const smooth = evidence.adjacencies.filter(({ meanContrast }) => meanContrast <= evidence.familyAnchorRadius)
	for (;;) {
		let added = false
		for (const { firstFamilyId, secondFamilyId } of smooth) {
			for (const [inside, outside] of [[firstFamilyId, secondFamilyId], [secondFamilyId, firstFamilyId]]) {
				if (!members.has(inside) || members.has(outside)) continue
				members.add(outside)
				added = true
			}
		}
		if (!added) break
	}
	return members
}

function domains(evidence: NativePaletteEvidence, members: ReadonlySet<string>) {
	const smooth = new Set(evidence.adjacencies
		.filter(({ meanContrast }) => meanContrast <= evidence.familyAnchorRadius)
		.map(({ firstFamilyId, secondFamilyId }) => [firstFamilyId, secondFamilyId].sort(ascii).join(":")))
	const familyById = new Map(evidence.families.map((family) => [family.id, family]))
	const visited = new Uint8Array(evidence.pixelCount)
	const queue = new Int32Array(evidence.pixelCount)
	const cornerWidth = Math.max(1, Math.ceil(evidence.width * 0.15))
	const cornerHeight = Math.max(1, Math.ceil(evidence.height * 0.15))
	const cornerPopulation = cornerWidth * cornerHeight
	const perimeter = Math.max(1, evidence.width * 2 + evidence.height * 2 - 4)
	const out: Array<{ population: number; borderCoverage: number; quadrantCoverage: number; ownedCornerCount: number; weightedFieldScore: number; familyCount: number }> = []
	for (let start = 0; start < evidence.pixelCount; start++) {
		if (visited[start] || !members.has(evidence.families[evidence.familyAt[start]].id)) continue
		let read = 0
		let length = 1
		queue[0] = start
		visited[start] = 1
		let borderPixels = 0
		let quadrants = 0
		const corners = [0, 0, 0, 0]
		const familyPopulations = new Map<string, number>()
		while (read < length) {
			const pixelIndex = queue[read++]
			const x = pixelIndex % evidence.width
			const y = Math.floor(pixelIndex / evidence.width)
			const family = evidence.families[evidence.familyAt[pixelIndex]]
			familyPopulations.set(family.id, (familyPopulations.get(family.id) ?? 0) + 1)
			if (x === 0 || y === 0 || x === evidence.width - 1 || y === evidence.height - 1) borderPixels += 1
			quadrants |= 1 << ((x >= evidence.width / 2 ? 1 : 0) + (y >= evidence.height / 2 ? 2 : 0))
			if (x < cornerWidth && y < cornerHeight) corners[0] += 1
			if (x >= evidence.width - cornerWidth && y < cornerHeight) corners[1] += 1
			if (x < cornerWidth && y >= evidence.height - cornerHeight) corners[2] += 1
			if (x >= evidence.width - cornerWidth && y >= evidence.height - cornerHeight) corners[3] += 1
			for (const neighbor of [
				x > 0 ? pixelIndex - 1 : -1,
				x + 1 < evidence.width ? pixelIndex + 1 : -1,
				y > 0 ? pixelIndex - evidence.width : -1,
				y + 1 < evidence.height ? pixelIndex + evidence.width : -1,
			]) {
				if (neighbor < 0 || visited[neighbor]) continue
				const neighborFamily = evidence.families[evidence.familyAt[neighbor]]
				if (!members.has(neighborFamily.id)) continue
				if (family.id !== neighborFamily.id && (
					!smooth.has([family.id, neighborFamily.id].sort(ascii).join(":")) ||
					distance(labAt(evidence.labs, pixelIndex), labAt(evidence.labs, neighbor)) > evidence.familyAnchorRadius
				)) continue
				visited[neighbor] = 1
				queue[length++] = neighbor
			}
		}
		const weightedFieldScore = [...familyPopulations.entries()]
			.reduce((sum, [familyId, population]) => sum + (familyById.get(familyId)?.fieldScore ?? 0) * population, 0) / length
		out.push({
			population: length,
			borderCoverage: Math.min(1, borderPixels / perimeter),
			quadrantCoverage: ((quadrants & 1 ? 1 : 0) + (quadrants & 2 ? 1 : 0) + (quadrants & 4 ? 1 : 0) + (quadrants & 8 ? 1 : 0)) / 4,
			ownedCornerCount: corners.filter((count) => count >= cornerPopulation * 0.5).length,
			weightedFieldScore,
			familyCount: familyPopulations.size,
		})
	}
	return out.sort((first, second) => second.population - first.population)
}

function describe(evidence: NativePaletteEvidence, label: string, members: ReadonlySet<string>): void {
	const found = domains(evidence, members)
	const eligible = found.filter((domain) =>
		domain.population / evidence.pixelCount >= 0.08 && domain.ownedCornerCount >= 2 && domain.weightedFieldScore >= 0.35)
	const top = found[0]
	console.log(`  ${label.padEnd(10)} families=${members.size} domains=${found.length} eligible=${eligible.length} top: pop=${(top.population / evidence.pixelCount * 100).toFixed(2)}% border=${top.borderCoverage.toFixed(3)} quad=${top.quadrantCoverage} corners=${top.ownedCornerCount} wfs=${top.weightedFieldScore.toFixed(3)} fam=${top.familyCount}`)
}

for (const id of IMAGES) {
	const image = await loadNativeImage(`${IMAGE_ROOT}/${id}`)
	const evidence = buildNativePaletteEvidence(image)
	const lane = new Set(evidence.lanes.find(({ name }) => name === "field")?.familyIds ?? [])
	console.log(`\n=== ${id} (${evidence.families.length} families total)`)
	describe(evidence, "current", lane)
	describe(evidence, "composite", fieldComposite(evidence))
}
