// Track D probe: faithful re-implementation of the connected field-domain flood fill,
// reporting per-corner occupancy so the corner gate can be understood. Evaluation-only.
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildNativePaletteEvidence } from "../../v2-3/src/internal/palette-core.ts"

const IMAGE_ROOT = process.env.PALETTE_IMAGE_ROOT ?? "/Users/Flo/github/palette/images"

function labAt(labs: Float32Array, index: number): [number, number, number] {
	return [labs[index * 3], labs[index * 3 + 1], labs[index * 3 + 2]]
}
function distance(first: readonly number[], second: readonly number[]): number {
	return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2])
}
function ascii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

for (const id of process.argv.slice(2)) {
	const image = await loadNativeImage(`${IMAGE_ROOT}/${id}`)
	const evidence = buildNativePaletteEvidence(image)
	const fieldIds = new Set(evidence.lanes.find(({ name }) => name === "field")?.familyIds ?? [])
	const smooth = new Set(evidence.adjacencies
		.filter(({ meanContrast }) => meanContrast <= evidence.familyAnchorRadius)
		.map(({ firstFamilyId, secondFamilyId }) => [firstFamilyId, secondFamilyId].sort(ascii).join(":")))
	const visited = new Uint8Array(evidence.pixelCount)
	const queue = new Int32Array(evidence.pixelCount)
	const cornerWidth = Math.max(1, Math.ceil(evidence.width * 0.15))
	const cornerHeight = Math.max(1, Math.ceil(evidence.height * 0.15))
	const cornerPopulation = cornerWidth * cornerHeight
	const results: Array<{ start: number; length: number; corners: number[]; borderPixels: number }> = []
	for (let start = 0; start < evidence.pixelCount; start++) {
		const startFamily = evidence.families[evidence.familyAt[start]]
		if (visited[start] || !fieldIds.has(startFamily.id)) continue
		let read = 0
		let length = 1
		queue[0] = start
		visited[start] = 1
		let borderPixels = 0
		const corners = [0, 0, 0, 0]
		while (read < length) {
			const pixelIndex = queue[read++]
			const x = pixelIndex % evidence.width
			const y = Math.floor(pixelIndex / evidence.width)
			const family = evidence.families[evidence.familyAt[pixelIndex]]
			if (x === 0 || y === 0 || x === evidence.width - 1 || y === evidence.height - 1) borderPixels += 1
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
				if (!fieldIds.has(neighborFamily.id)) continue
				if (family.id !== neighborFamily.id && (
					!smooth.has([family.id, neighborFamily.id].sort(ascii).join(":")) ||
					distance(labAt(evidence.labs, pixelIndex), labAt(evidence.labs, neighbor)) > evidence.familyAnchorRadius
				)) continue
				visited[neighbor] = 1
				queue[length++] = neighbor
			}
		}
		results.push({ start, length, corners: [...corners], borderPixels })
	}
	results.sort((first, second) => second.length - first.length)
	console.log(`\n=== ${id} corner block=${cornerWidth}x${cornerHeight} (${cornerPopulation}px), ownership needs >= 50%`)
	for (const result of results.slice(0, 4)) {
		console.log(`  field-domain-${result.start} pop=${(result.length / evidence.pixelCount * 100).toFixed(2)}% corners=[${result.corners.map((count) => (count / cornerPopulation * 100).toFixed(1) + "%").join(", ")}] owned=${result.corners.filter((count) => count >= cornerPopulation * 0.5).length}`)
	}
	// What occupies the unowned corners?
	const top = results[0]
	const inDomain = new Uint8Array(evidence.pixelCount)
	{
		let read = 0
		let length = 1
		const visited2 = new Uint8Array(evidence.pixelCount)
		queue[0] = top.start
		visited2[top.start] = 1
		while (read < length) {
			const pixelIndex = queue[read++]
			inDomain[pixelIndex] = 1
			const x = pixelIndex % evidence.width
			const y = Math.floor(pixelIndex / evidence.width)
			const family = evidence.families[evidence.familyAt[pixelIndex]]
			for (const neighbor of [
				x > 0 ? pixelIndex - 1 : -1,
				x + 1 < evidence.width ? pixelIndex + 1 : -1,
				y > 0 ? pixelIndex - evidence.width : -1,
				y + 1 < evidence.height ? pixelIndex + evidence.width : -1,
			]) {
				if (neighbor < 0 || visited2[neighbor]) continue
				const neighborFamily = evidence.families[evidence.familyAt[neighbor]]
				if (!fieldIds.has(neighborFamily.id)) continue
				if (family.id !== neighborFamily.id && (
					!smooth.has([family.id, neighborFamily.id].sort(ascii).join(":")) ||
					distance(labAt(evidence.labs, pixelIndex), labAt(evidence.labs, neighbor)) > evidence.familyAnchorRadius
				)) continue
				visited2[neighbor] = 1
				queue[length++] = neighbor
			}
		}
	}
	const cornerBoxes = [
		[0, cornerWidth, 0, cornerHeight],
		[evidence.width - cornerWidth, evidence.width, 0, cornerHeight],
		[0, cornerWidth, evidence.height - cornerHeight, evidence.height],
		[evidence.width - cornerWidth, evidence.width, evidence.height - cornerHeight, evidence.height],
	]
	for (let corner = 0; corner < 4; corner++) {
		const [x0, x1, y0, y1] = cornerBoxes[corner]
		const counts = new Map<string, number>()
		for (let y = y0; y < y1; y++) {
			for (let x = x0; x < x1; x++) {
				const pixelIndex = y * evidence.width + x
				if (inDomain[pixelIndex]) continue
				const family = evidence.families[evidence.familyAt[pixelIndex]]
				const label = `${family.id}${fieldIds.has(family.id) ? "" : "[non-field]"}`
				counts.set(label, (counts.get(label) ?? 0) + 1)
			}
		}
		const top3 = [...counts.entries()].sort((first, second) => second[1] - first[1]).slice(0, 3)
		console.log(`  corner ${corner} outside-domain: ${top3.map(([label, count]) => `${label}=${(count / cornerPopulation * 100).toFixed(1)}%`).join(" ")}`)
	}
}
