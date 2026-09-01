import assert from "node:assert/strict"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
	CHROMATIC_ROLE_ALGORITHM_VERSION,
	CHROMATIC_ROLE_BASELINE_VERSION,
	extractChromaticRolePalette,
} from "../src/chromatic-role-extract.ts"
import { loadImage } from "../src/image.ts"
import { extractRegionGraph017Palette as extractPalette } from "../src/region-graph-0.17-extract.ts"

const projectRoot = fileURLToPath(new URL("../..", import.meta.url))
const reviewedFile = "00/ab67616d0000b2730000e47a4e869d4323ad0e3d.jpg"

test("chromatic role extraction preserves every canonical method when no supplement is available", async () => {
	const image = await loadImage(join(projectRoot, "images/artofficial.jpg"))
	const baseline = extractPalette(image)
	const result = extractChromaticRolePalette(image)

	assert.equal(result.extraction.version, CHROMATIC_ROLE_ALGORITHM_VERSION)
	assert.equal(result.certificate.baselineAlgorithmVersion, CHROMATIC_ROLE_BASELINE_VERSION)
	assert.deepEqual(result.extraction.methods, baseline.methods)
	assert.deepEqual(result.extraction.candidates, baseline.candidates)
	assert.equal(result.certificate.availability.selectedSupplements, 0)
	assert.equal(result.certificate.decision.solverRan, false)
	assert.equal(result.certificate.decision.emittedTreatment, false)
	assert.deepEqual(result.certificate.decision.changedRoles, [])
	assert.equal(result.certificate.solver.guarded, null)
	assert.equal(result.certificate.solver.joint, null)
})

test("broad missing families remain available without steering the role solver", async () => {
	const image = await loadImage(join(projectRoot, reviewedFile))
	const baseline = extractPalette(image)
	const result = extractChromaticRolePalette(image)
	const palette = result.extraction.methods.spatial

	assert.deepEqual(result.extraction.candidates.slice(0, baseline.candidates.length), baseline.candidates)
	assert.deepEqual(result.certificate.availability.supplements.map(({ anchorDegrees, hex }) => ({ anchorDegrees, hex })), [
		{ anchorDegrees: 30, hex: "#9c6b55" },
		{ anchorDegrees: 300, hex: "#6d6d8a" },
	])
	assert.equal(baseline.methods.spatial.accent.hex, "#b2a5a3")
	assert.deepEqual(palette, baseline.methods.spatial)
	assert.deepEqual(result.certificate.decision.availableSupplementIds, [13, 14])
	assert.deepEqual(result.certificate.decision.admittedSupplementIds, [])
	assert.deepEqual(result.certificate.decision.selectedSupplementRoles, {})
	assert.deepEqual(result.certificate.decision.changedRoles, [])
	assert.equal(result.certificate.decision.emittedTreatment, false)
	assert.equal(result.certificate.decision.solverRan, false)
	assert.equal(result.extraction.diagnostics.candidateCount, baseline.candidates.length + 2)
	assert.deepEqual(result.extraction.methods.expressive, baseline.methods.expressive)
	assert.deepEqual(result.extraction.methods.quantized, baseline.methods.quantized)
})

test("a reviewed minor chromatic family can improve an accent without moving other roles", async () => {
	const file = "00/ab67616d00001e02000045168a00c9fa6fcc59da.jpg"
	const image = await loadImage(join(projectRoot, file))
	const baseline = extractPalette(image)
	const result = extractChromaticRolePalette(image)
	const palette = result.extraction.methods.spatial

	assert.equal(baseline.methods.spatial.accent.hex, "#4996f0")
	assert.equal(palette.accent.hex, "#d87923")
	assert.deepEqual(palette.background, baseline.methods.spatial.background)
	assert.deepEqual(palette.foreground, baseline.methods.spatial.foreground)
	assert.deepEqual(palette.surface, baseline.methods.spatial.surface)
	assert.deepEqual(result.certificate.decision.availableSupplementIds, [13])
	assert.deepEqual(result.certificate.decision.admittedSupplementIds, [13])
	assert.deepEqual(result.certificate.decision.selectedSupplementRoles, { accent: 13 })
	assert.deepEqual(result.certificate.decision.changedRoles, ["accent"])
	assert.equal(result.certificate.decision.emittedTreatment, true)
})

test("a minor family without typography support remains diagnostic-only", async () => {
	const file = "00/ab67616d0000b2730000fc5b6750a56548ed782b.jpg"
	const image = await loadImage(join(projectRoot, file))
	const baseline = extractPalette(image)
	const result = extractChromaticRolePalette(image)

	assert.deepEqual(result.certificate.decision.availableSupplementIds, [13, 14])
	assert.deepEqual(result.certificate.decision.admittedSupplementIds, [])
	assert.equal(result.certificate.availability.supplements.every((supplement) => supplement.id === 13 || supplement.id === 14), true)
	assert.deepEqual(result.extraction.methods.spatial, baseline.methods.spatial)
	assert.equal(result.certificate.decision.emittedTreatment, false)
})

test("a selected supplement below the emitted accent visibility floor preserves canonical", async () => {
	const file = "08/ab67616d0000b27300086bb1e80f41675d7d8093"
	const image = await loadImage(join(projectRoot, file))
	const baseline = extractPalette(image)
	const result = extractChromaticRolePalette(image)

	assert.equal(result.certificate.decision.selectedSupplementRoles.accent !== undefined, true)
	assert.equal(result.certificate.treatment.roles.accent.hex, "#bc987a")
	assert.equal(result.certificate.decision.accentVisibilityEligible, false)
	assert.equal(result.certificate.decision.emittedTreatment, false)
	assert.deepEqual(result.extraction.methods.spatial, baseline.methods.spatial)
})

test("a reviewed visible supplement above the accent floor remains emitted", async () => {
	const file = "08/ab67616d00001e02000894926f6f6a8dcf79517e"
	const image = await loadImage(join(projectRoot, file))
	const result = extractChromaticRolePalette(image)

	assert.equal(result.extraction.methods.spatial.accent.hex, "#69201f")
	assert.equal(result.extraction.methods.spatial.metrics.accentContrast >= 1.5, true)
	assert.equal(result.certificate.decision.accentVisibilityEligible, true)
	assert.equal(result.certificate.decision.accentIdentityEligible, true)
	assert.equal(result.certificate.decision.emittedTreatment, true)
})

test("a weaker minor accent preserves a typography-supported incumbent", async () => {
	const file = "09/ab67616d0000b27300095e360000a233d311fcb3"
	const image = await loadImage(join(projectRoot, file))
	const baseline = extractPalette(image)
	const result = extractChromaticRolePalette(image)

	assert.equal(result.certificate.treatment.roles.accent.hex, "#5d2d2e")
	assert.equal(result.certificate.decision.accentVisibilityEligible, true)
	assert.equal(result.certificate.decision.accentIdentityEligible, false)
	assert.equal(result.certificate.decision.emittedTreatment, false)
	assert.deepEqual(result.extraction.methods.spatial, baseline.methods.spatial)
})

test("a reviewed chroma gain can replace a stronger-typography incumbent", async () => {
	const file = "00/ab67616d0000b273000064c47077c5d50085297f.jpg"
	const image = await loadImage(join(projectRoot, file))
	const result = extractChromaticRolePalette(image)

	assert.equal(result.extraction.methods.spatial.accent.hex, "#753633")
	assert.equal(result.certificate.decision.accentIdentityEligible, true)
	assert.equal(result.certificate.decision.collateralRoleChromaEligible, true)
	assert.equal(result.certificate.decision.emittedTreatment, true)
})

test("the weakest reviewed chromatic accent remains emitted", async () => {
	const file = "0a/ab67616d0000b273000a934a0b0bf982a9bf3cc5"
	const image = await loadImage(join(projectRoot, file))
	const result = extractChromaticRolePalette(image)

	assert.equal(result.extraction.methods.spatial.accent.hex, "#384e66")
	assert.equal(result.certificate.decision.accentChromaEligible, true)
	assert.equal(result.certificate.decision.emittedTreatment, true)
})

test("a negligible text gain preserves an established accent", async () => {
	const file = "0a/ab67616d00001e02000ad4d2b51b0ade95449e5c"
	const image = await loadImage(join(projectRoot, file))
	const baseline = extractPalette(image)
	const result = extractChromaticRolePalette(image)

	assert.equal(result.certificate.treatment.roles.accent.hex, "#8b5941")
	assert.equal(result.certificate.decision.accentIdentityEligible, false)
	assert.equal(result.certificate.decision.emittedTreatment, false)
	assert.deepEqual(result.extraction.methods.spatial, baseline.methods.spatial)
})

test("a fully chromatic incumbent is not replaced by a less chromatic detail", async () => {
	const file = "0a/ab67616d00001e02000a7d98994c5af05199a82d"
	const image = await loadImage(join(projectRoot, file))
	const baseline = extractPalette(image)
	const result = extractChromaticRolePalette(image)

	assert.equal(result.certificate.treatment.roles.accent.hex, "#48d180")
	assert.equal(result.certificate.decision.accentIdentityEligible, false)
	assert.equal(result.certificate.decision.emittedTreatment, false)
	assert.deepEqual(result.extraction.methods.spatial, baseline.methods.spatial)
})

test("a large accent chroma loss preserves the incumbent", async () => {
	const file = "0b/ab67616d0000b273000b9bcc0bc7a1f9e878585c"
	const image = await loadImage(join(projectRoot, file))
	const baseline = extractPalette(image)
	const result = extractChromaticRolePalette(image)

	assert.equal(result.certificate.treatment.roles.accent.hex, "#73a9b7")
	assert.equal(result.certificate.decision.accentIdentityEligible, false)
	assert.equal(result.certificate.decision.emittedTreatment, false)
	assert.deepEqual(result.extraction.methods.spatial, baseline.methods.spatial)
})

test("text evidence alone cannot hide a material accent saliency loss", async () => {
	const file = "0c/ab67616d0000b273000c08a767cd1141ae5e8be3"
	const image = await loadImage(join(projectRoot, file))
	const baseline = extractPalette(image)
	const result = extractChromaticRolePalette(image)

	assert.equal(result.certificate.treatment.roles.accent.hex, "#781b13")
	assert.equal(result.certificate.decision.accentIdentityEligible, false)
	assert.equal(result.certificate.decision.emittedTreatment, false)
	assert.deepEqual(result.extraction.methods.spatial, baseline.methods.spatial)
})

test("an accent treatment cannot preserve a fully chromatic collapsed background", async () => {
	const file = "0d/ab67616d00001e02000d90b577457d255d1c71ff"
	const image = await loadImage(join(projectRoot, file))
	const baseline = extractPalette(image)
	const result = extractChromaticRolePalette(image)

	assert.equal(result.certificate.treatment.roles.accent.hex, "#375399")
	assert.equal(result.certificate.decision.collapsedBackgroundEligible, false)
	assert.equal(result.certificate.decision.emittedTreatment, false)
	assert.deepEqual(result.extraction.methods.spatial, baseline.methods.spatial)
})

test("a surface-only supplement remains diagnostic", async () => {
	const file = "0d/ab67616d0000b273000d2b8619c6c164fcb36154"
	const image = await loadImage(join(projectRoot, file))
	const baseline = extractPalette(image)
	const result = extractChromaticRolePalette(image)

	assert.deepEqual(result.certificate.decision.selectedSupplementRoles, { surface: 13 })
	assert.equal(result.certificate.decision.selectedRoleEligible, false)
	assert.equal(result.certificate.decision.emittedTreatment, false)
	assert.deepEqual(result.extraction.methods.spatial, baseline.methods.spatial)
})

test("a weakly chromatic supplemental accent remains diagnostic", async () => {
	const file = "0e/ab67616d0000b273000ece7847f3b5fdea732479"
	const image = await loadImage(join(projectRoot, file))
	const baseline = extractPalette(image)
	const result = extractChromaticRolePalette(image)

	assert.equal(result.certificate.treatment.roles.accent.hex, "#3a5d61")
	assert.equal(result.certificate.decision.accentChromaEligible, false)
	assert.equal(result.certificate.decision.emittedTreatment, false)
	assert.deepEqual(result.extraction.methods.spatial, baseline.methods.spatial)
})

test("an accent supplement cannot erase collateral role chroma", async () => {
	const file = "0e/ab67616d00001e02000e46bf0797cb7279aa1dcd"
	const image = await loadImage(join(projectRoot, file))
	const baseline = extractPalette(image)
	const result = extractChromaticRolePalette(image)

	assert.equal(result.certificate.treatment.roles.surface.hex, "#e6d8cf")
	assert.equal(result.certificate.treatment.roles.accent.hex, "#132f47")
	assert.equal(result.certificate.decision.accentChromaEligible, true)
	assert.equal(result.certificate.decision.collateralRoleChromaEligible, false)
	assert.equal(result.certificate.decision.emittedTreatment, false)
	assert.deepEqual(result.extraction.methods.spatial, baseline.methods.spatial)
})

test("chromatic role output and provenance are deterministic", async () => {
	const image = await loadImage(join(projectRoot, "00/ab67616d00001e02000045168a00c9fa6fcc59da.jpg"))
	const first = extractChromaticRolePalette(image)
	const second = extractChromaticRolePalette(image)

	assert.deepEqual(first.extraction.methods, second.extraction.methods)
	assert.deepEqual(first.extraction.candidates, second.extraction.candidates)
	assert.deepEqual(first.certificate, second.certificate)
})
