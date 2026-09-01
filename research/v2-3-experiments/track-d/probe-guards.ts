// Track D probe: sweeps candidate guards on "field composite" membership.
// Evaluation-only.
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

// Fraction of a family's total inter-family boundary that is smooth adjacency to a member.
function embeddedComposite(evidence: NativePaletteEvidence, embedding: number, transitive: boolean): Set<string> {
	const members = new Set(evidence.lanes.find(({ name }) => name === "field")?.familyIds ?? [])
	const seeds = new Set(members)
	const totalBoundary = new Map<string, number>()
	for (const { firstFamilyId, secondFamilyId, boundaryEdges } of evidence.adjacencies) {
		totalBoundary.set(firstFamilyId, (totalBoundary.get(firstFamilyId) ?? 0) + boundaryEdges)
		totalBoundary.set(secondFamilyId, (totalBoundary.get(secondFamilyId) ?? 0) + boundaryEdges)
	}
	const smooth = evidence.adjacencies.filter(({ meanContrast }) => meanContrast <= evidence.familyAnchorRadius)
	for (;;) {
		const source = transitive ? members : seeds
		const smoothMemberBoundary = new Map<string, number>()
		for (const { firstFamilyId, secondFamilyId, boundaryEdges } of smooth) {
			if (source.has(firstFamilyId) && !members.has(secondFamilyId)) {
				smoothMemberBoundary.set(secondFamilyId, (smoothMemberBoundary.get(secondFamilyId) ?? 0) + boundaryEdges)
			}
			if (source.has(secondFamilyId) && !members.has(firstFamilyId)) {
				smoothMemberBoundary.set(firstFamilyId, (smoothMemberBoundary.get(firstFamilyId) ?? 0) + boundaryEdges)
			}
		}
		const additions = [...smoothMemberBoundary.entries()]
			.filter(([familyId, edges]) => edges / Math.max(1, totalBoundary.get(familyId) ?? 0) >= embedding)
			.map(([familyId]) => familyId)
			.sort(ascii)
		if (additions.length === 0) break
		for (const familyId of additions) members.add(familyId)
		if (!transitive) break
	}
	return members
}

function topDomain(evidence: NativePaletteEvidence, members: ReadonlySet<string>) {
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
	let best = { population: 0, borderCoverage: 0, quadrantCoverage: 0, ownedCornerCount: 0, weightedFieldScore: 0, familyCount: 0 }
	let eligibleCount = 0
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
		const record = {
			population: length,
			borderCoverage: Math.min(1, borderPixels / perimeter),
			quadrantCoverage: ((quadrants & 1 ? 1 : 0) + (quadrants & 2 ? 1 : 0) + (quadrants & 4 ? 1 : 0) + (quadrants & 8 ? 1 : 0)) / 4,
			ownedCornerCount: corners.filter((count) => count >= cornerPopulation * 0.5).length,
			weightedFieldScore,
			familyCount: familyPopulations.size,
		}
		if (length / evidence.pixelCount >= 0.08 && record.ownedCornerCount >= 2 && weightedFieldScore >= 0.35) eligibleCount += 1
		if (length > best.population) best = record
	}
	return { best, eligibleCount }
}

for (const id of IMAGES) {
	const image = await loadNativeImage(`${IMAGE_ROOT}/${id}`)
	const evidence = buildNativePaletteEvidence(image)
	console.log(`\n=== ${id} (${evidence.families.length} families)`)
	const variants: Array<[string, Set<string>]> = [
		["lane-only", new Set(evidence.lanes.find(({ name }) => name === "field")?.familyIds ?? [])],
		["1hop.90", embeddedComposite(evidence, 0.9, false)],
		["tr.90", embeddedComposite(evidence, 0.9, true)],
		["tr.75", embeddedComposite(evidence, 0.75, true)],
		["tr.50", embeddedComposite(evidence, 0.5, true)],
	]
	for (const [label, members] of variants) {
		const { best, eligibleCount } = topDomain(evidence, members)
		console.log(`  ${label.padEnd(10)} fam=${String(members.size).padStart(3)} elig=${eligibleCount} top: pop=${(best.population / evidence.pixelCount * 100).toFixed(2)}% border=${best.borderCoverage.toFixed(3)} quad=${best.quadrantCoverage} corners=${best.ownedCornerCount} wfs=${best.weightedFieldScore.toFixed(3)} fam=${best.familyCount}`)
	}
}
