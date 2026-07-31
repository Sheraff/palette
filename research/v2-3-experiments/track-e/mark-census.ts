/** Which families earn mark evidence, across the whole corpus. */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain } from "../../v2-3/src/internal/palette-core.ts"
import { reviewFixtures } from "../../v2-3/test/review-fixtures.ts"

const CASES = [
	...reviewFixtures.map(({ source }) => source.file),
	"03/ab67616d00001e020003e50500c5d762da89643a.jpg",
	"11/ab67616d0000b2730011c0148119c34e2b222b02",
	"05/ab67616d0000b2730005230fae1822525e5a5ff6",
	"09/ab67616d0000b2730009d178a401f9433fdddff2",
]

const ROOT = "/Users/Flo/GitHub/palette"
const filter = process.argv[2] ?? null
for (const caseFile of CASES) {
	if (filter && !caseFile.includes(filter)) continue
	const image = await loadNativeImage(`${ROOT}/${caseFile}`)
	const evidence = buildPaletteSeedDomain(image).evidence
	const marked = evidence.families
		.filter(({ markSupport }) => markSupport > 0)
		.sort((a, b) => b.markSupport - a.markSupport)
	console.log(`\n${caseFile}  (${marked.length} of ${evidence.families.length} families earn mark evidence)`)
	for (const f of marked) {
		console.log(`   ${f.id.padEnd(13)} ${f.representatives[0]?.hex ?? "?"} mark=${f.markSupport.toFixed(3)} strokes=${f.markComponentCount}/${f.componentCount} pop=${(f.populationFraction * 100).toFixed(4)}% chroma=${f.chroma.toFixed(3)} lcf=${f.largestComponentFraction.toFixed(5)} conc=${f.familyConcentration.toFixed(3)}`)
	}
}
