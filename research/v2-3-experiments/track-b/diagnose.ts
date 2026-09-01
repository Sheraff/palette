// Track B diagnostic: dumps gradient-side evidence for one case.
//
//   node --experimental-strip-types research/v2-3-experiments/track-b/diagnose.ts <caseId>

import { existsSync } from "node:fs"
import { resolve } from "node:path"

import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, diagnoseGradientFits } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { discoverNativeFieldTransitions, discoverSupportedNativeFieldTransitionPaths } from "../../v2-3/src/internal/field-transition.ts"

const IMAGE_ROOTS = [
	process.env.IMAGE_ROOT,
	resolve(import.meta.dirname, "../../../images"),
	"/Users/Flo/github/palette/images",
].filter((value): value is string => typeof value === "string")

function locate(caseId: string): string {
	for (const root of IMAGE_ROOTS) {
		const path = resolve(root, caseId)
		if (existsSync(path)) return path
	}
	throw new Error(`image not found for ${caseId}`)
}

function chroma([, a, b]: readonly [number, number, number]): number {
	return Math.hypot(a, b)
}

function hue([, a, b]: readonly [number, number, number]): number {
	const angle = Math.atan2(b, a)
	return angle < 0 ? angle + Math.PI * 2 : angle
}

const caseId = process.argv[2]
if (!caseId) throw new Error("usage: diagnose.ts <caseId>")

const image = await loadNativeImage(locate(caseId))
const seed = buildPaletteSeedDomain(image)
const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
const evidence = common.evidence.native

console.log(`# ${caseId}  ${evidence.width}x${evidence.height}  familyBinStep=${evidence.familyBinStep.toFixed(5)}  families=${evidence.families.length}`)

const discovery = discoverNativeFieldTransitions(evidence)
console.log(`\n## regions: ${discovery.regions.length}`)
const endpointEligible = discovery.regions.filter(({ endpointEligible: value }) => value)
console.log(`endpoint-eligible regions: ${endpointEligible.length}`)
for (const region of endpointEligible.slice(0, 14)) {
	console.log(`  ${region.id} family=${region.familyId} pop=${region.populationFraction.toFixed(4)} border=${region.borderCoverage.toFixed(3)} quad=${region.quadrantCoverage} span=${Math.max(region.widthFraction, region.heightFraction).toFixed(3)}`)
}
const reasonCounts = new Map<string, number>()
for (const region of discovery.regions) {
	for (const reason of region.endpointRejectionReasons) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1)
}
console.log(`endpoint rejection reason histogram (over ${discovery.regions.length} regions):`)
for (const [reason, count] of [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])) {
	console.log(`  ${count.toString().padStart(7)}  ${reason}`)
}
console.log(`radial-center-eligible regions: ${discovery.regions.filter(({ radialCenterEligible }) => radialCenterEligible).length}`)

console.log(`\n## traces: ${discovery.traces.length}  (eligible ${discovery.traces.filter(({ eligible }) => eligible).length})`)
for (const trace of discovery.traces.slice(0, 12)) {
	console.log(`  ${trace.fieldDomainId} ${trace.topology}/${trace.direction} stages=${trace.stageFamilyIds.length} dist=${trace.endpointDistance.toFixed(3)} spatialProg=${trace.spatialProgression.toFixed(3)} colorProg=${trace.colorProgression.toFixed(3)} colorDirect=${trace.colorDirectness.toFixed(3)} branch=${trace.branching.toFixed(3)}`)
	console.log(`     positions=[${trace.stagePositions.map((value) => value.toFixed(2)).join(", ")}]`)
	if (!trace.eligible) console.log(`     REJECT: ${trace.rejectionReasons.join(" | ")}`)
}
console.log(`\n## hypotheses: ${discovery.hypotheses.length}`)
for (const hypothesis of discovery.hypotheses.slice(0, 8)) {
	console.log(`  ${hypothesis.id} fidelity=${hypothesis.fieldFidelity.toFixed(3)}`)
}

const paths = discoverSupportedNativeFieldTransitionPaths(evidence)
console.log(`\n## supported paths: ${paths.length} (eligible ${paths.filter(({ eligible }) => eligible).length})`)
for (const path of paths.filter(({ hypothesis }) => hypothesis !== null).slice(0, 10)) {
	const first = path.stages[0]?.prototype ?? [0, 0, 0]
	const second = path.stages.at(-1)?.prototype ?? [0, 0, 0]
	const hueDifference = Math.abs(hue(first) - hue(second))
	const circular = Math.min(hueDifference, Math.PI * 2 - hueDifference)
	console.log(`  ${path.fieldDomainId} eligible=${path.eligible} hyp=${path.hypothesis?.id ?? "-"}`)
	console.log(`     chroma=[${chroma(first).toFixed(4)}, ${chroma(second).toFixed(4)}] floor=${(evidence.familyBinStep * 0.5).toFixed(4)} hueDelta=${circular.toFixed(3)} (threshold ${(Math.PI / 3).toFixed(3)})`)
	console.log(`     stages=${path.stages.length} accepted=${path.acceptedIntermediateSupport.length} colorPositions=[${path.stageColorPositions.map((value) => value.toFixed(2)).join(", ")}]`)
	for (const stage of path.acceptedIntermediateSupport) {
		console.log(`       accepted stage ${stage.stageIndex} family=${stage.familyId} spatial=${stage.spatialPosition.toFixed(3)} color=${stage.colorPosition.toFixed(3)} popFrac=${stage.populationFraction.toFixed(4)} seedHex=${stage.exactColor.hex} seed=(${stage.exactColor.provenance.x},${stage.exactColor.provenance.y})`)
	}
	if (!path.eligible) console.log(`     REJECT: ${path.rejectionReasons.join(" | ")}`)
}

const fits = diagnoseGradientFits(evidence)
console.log(`\n## gradient fits: ${fits.length} (accepted ${fits.filter(({ rejectionReasons }) => rejectionReasons.length === 0).length})`)
for (const fit of fits.slice(0, 12)) {
	console.log(`  ${fit.fieldDomainId} ${fit.topology}/${fit.direction} score=${fit.score.toFixed(3)} span=${fit.span.toFixed(3)} prog=${fit.progression.toFixed(3)} mono=${fit.monotonicity.toFixed(3)} resid=${fit.residual.toFixed(3)} tex=${fit.texture.toFixed(3)} ends=${fit.endpointHexes?.join("/") ?? "-"} (${fit.lowEndpointFamilyId}/${fit.highEndpointFamilyId})`)
	if (fit.rejectionReasons.length > 0) console.log(`     REJECT: ${fit.rejectionReasons.join(" | ")}`)
}
