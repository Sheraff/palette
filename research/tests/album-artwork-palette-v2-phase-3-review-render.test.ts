import assert from "node:assert/strict"
import test from "node:test"
import {
	projectAlbumArtworkPaletteV2Phase3WinnerResearchRender,
} from "../src/album-artwork-palette-v2-phase-3-review-render.ts"

const identity = {
	attemptId: "phase-3-supported-gradient-path",
	configurationId: "supported-gradient-test-v1",
}

function midpoint() {
	return {
		kind: "source-supported-three-stop",
		position: 0.5,
		color: { rgb: [24, 128, 167], oklab: [0.5, 0, 0], hex: "#1880a7" },
		provenance: {
			exactSource: true,
			familyId: "family-middle",
			regionId: "region-middle",
			pixelIndex: 304,
			x: 4,
			y: 3,
			fieldDomainId: "field-domain-1",
			stageIndex: 1,
			spatialPosition: 0.5,
			colorPosition: 0.5,
			populationFraction: 0.12,
		},
	}
}

function output(midpointValue: ReturnType<typeof midpoint> | Readonly<{
	kind: "ordinary-two-stop"
	position: null
	color: null
	provenance: null
}> = midpoint()) {
	return {
		dimensions: { width: 100, height: 80 },
		winner: {
			key: "#141975:#3fa72a:#030102:#d02981:gradient",
			treatment: {
				gradient: true,
				sourceFieldHypothesisId: "field-transition-1",
			},
		},
		diagnostics: {
			phase3SupportedGradientPath: {
				configurationId: identity.configurationId,
				gradientAuthority: {
					winnerKey: "#141975:#3fa72a:#030102:#d02981:gradient",
					correspondingPathIndex: 0,
					midpoint: midpointValue,
				},
				supportedGradientPath: {
					paths: [{
						eligible: true,
						hypothesisId: "field-transition-1",
						midpointCustody: structuredClone(midpointValue),
					}],
				},
			},
		},
	}
}

test("projects an exact midpoint into a review-only three-stop descriptor", () => {
	assert.deepEqual(projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(output(), identity, "fixture"), {
		schemaVersion: 1,
		field: {
			kind: "linear-gradient",
			angleDegrees: 135,
			interpolation: "oklab",
			stops: [
				{ kind: "role", role: "background", position: 0 },
				{ kind: "source-supported-color", hex: "#1880a7", position: 0.5 },
				{ kind: "role", role: "surface", position: 1 },
			],
		},
	})
	assert.equal(projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(output({
		kind: "ordinary-two-stop", position: null, color: null, provenance: null,
	}), identity, "fixture"), undefined)
	assert.equal(projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(output(), {
		attemptId: "phase-3-integrated-candidate", configurationId: "control",
	}, "fixture"), undefined)
})

test("fails closed when midpoint source or winner-path custody is stale", () => {
	const staleSource = output()
	staleSource.diagnostics.phase3SupportedGradientPath.gradientAuthority.midpoint.provenance.pixelIndex = 305
	assert.throws(() => projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(staleSource, identity, "fixture"),
		/source coordinates are invalid/u)
	const stalePath = output()
	stalePath.diagnostics.phase3SupportedGradientPath.supportedGradientPath.paths[0].hypothesisId = "other"
	assert.throws(() => projectAlbumArtworkPaletteV2Phase3WinnerResearchRender(stalePath, identity, "fixture"),
		/not bound to the rendered winner path/u)
})
