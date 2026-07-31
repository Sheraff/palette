/**
 * Dump the field-conditional role classification for one artwork: for the
 * winning field hypothesis, every family's foreground/accent scores and their
 * decomposition, plus the resulting role-specific obligations.
 *
 * Read-only: calls the exported classifier directly.
 *
 * usage: inspect-roles.ts <image> [--field <hypothesisId>] [--top N]
 */
import { loadNativeImage } from "../../v2-3/src/internal/native-resolution-image.ts"
import { buildPaletteSeedDomain, DEFAULT_PALETTE_EXTRACTION_OPTIONS } from "../../v2-3/src/internal/palette-core.ts"
import { buildAlbumArtworkPaletteV2Phase3CommonBase } from "../../v2-3/src/internal/candidate-domain.ts"
import { classifyFieldConditionalFamilyRole, buildRoleSpecificIdentityObligations } from "../../v2-3/src/internal/role-obligations.ts"
import { extractPaletteDetails } from "../../v2-3/src/internal/palette.ts"

const ROOT = process.env.PALETTE_IMAGES_ROOT ?? "/Users/Flo/GitHub/palette"
const target = process.argv[2]
if (!target) throw new Error("usage: inspect-roles.ts <image> [--field id] [--top N]")
const fieldIndex = process.argv.indexOf("--field")
const fieldFilter = fieldIndex > 0 ? process.argv[fieldIndex + 1] : null
const topIndex = process.argv.indexOf("--top")
const top = topIndex > 0 ? Number(process.argv[topIndex + 1]) : 16

const image = await loadNativeImage(`${ROOT}/${target}`)
const seed = buildPaletteSeedDomain(image, DEFAULT_PALETTE_EXTRACTION_OPTIONS)
const common = buildAlbumArtworkPaletteV2Phase3CommonBase(seed)
const winner = extractPaletteDetails(image).winner
console.log(`${target}\nwinner: ${winner.background.hex} ${winner.surface.hex} fg=${winner.foreground.hex} ac=${winner.accent.hex} ${winner.gradient ? "grad" : "flat"}`)
console.log(`winner field hypothesis: ${winner.sourceFieldHypothesisId}`)
console.log(`winner familyRoles: ${JSON.stringify(winner.familyRoles)}\n`)

const fieldId = fieldFilter ?? winner.sourceFieldHypothesisId
const fields = common.fieldHypotheses.map(({ hypothesis }) => hypothesis)
const field = fields.find(({ id }) => id === fieldId)
if (!field) {
	console.log(`field ${fieldId} not in the seed hypothesis set; available:`)
	for (const f of fields) console.log(`  ${f.id}  bg=${f.backgroundFamilyId} sf=${f.surfaceFamilyId}`)
	process.exit(0)
}
console.log(`field ${field.id}: bg=${field.backgroundFamilyId} surface=${field.surfaceFamilyId}\n`)

const families = common.evidence.augmentedNative.families
const rows = families.map((family) => ({ family, e: classifyFieldConditionalFamilyRole(family, field) }))

console.log("family        popFrac  | FG score  geom  rept  lCon  polM  fLC | AC score  cmpt  chrm  sig | supp  pref                reason")
for (const { family, e } of [...rows].sort((a, b) =>
	Math.max(b.e.foreground.score, b.e.accent.score) - Math.max(a.e.foreground.score, a.e.accent.score)).slice(0, top)) {
	console.log(
		`${family.id.padEnd(13)} ${(family.populationFraction * 100).toFixed(2).padStart(6)}% | ` +
		`${e.foreground.score.toFixed(3)} ${e.foreground.typographyLikeGeometry.toFixed(3)} ${e.foreground.repetition.toFixed(3)} ${e.foreground.observedLocalContrast.toFixed(3)} ${e.foreground.polarityAgreement.toFixed(3)} ${e.foreground.fieldLightnessContrast.toFixed(3)} | ` +
		`${e.accent.score.toFixed(3)} ${e.accent.compactness.toFixed(3)} ${e.accent.chroma.toFixed(3)} ${e.accent.signatureObservation.toFixed(3)} | ` +
		`${e.coherentSupport.toFixed(3)} ${e.preference.padEnd(10)} ${e.fieldOwned ? "[field] " : ""}${e.reason}`)
}

const classified = fields.flatMap((f) => families.map((family) => classifyFieldConditionalFamilyRole(family, f)))
console.log("\n=== role-specific obligations on the winning field")
for (const o of buildRoleSpecificIdentityObligations(classified).filter((o) => o.fieldHypothesisId === field.id)) {
	console.log(`  p${o.priority} ${o.familyId.padEnd(13)} requiredRole=${o.requiredRole.padEnd(10)} fg=${o.evidence.foreground.score.toFixed(3)} ac=${o.evidence.accent.score.toFixed(3)} reason=${o.evidence.reason}`)
}
