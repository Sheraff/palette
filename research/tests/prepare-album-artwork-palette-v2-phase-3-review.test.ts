import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test, { type TestContext } from "node:test"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import {
	parseAlbumArtworkPaletteV2Phase3ReviewArguments,
	prepareAlbumArtworkPaletteV2Phase3Review,
	verifyAlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidatePublication,
	verifyAlbumArtworkPaletteV2Phase3RegisteredAttemptPublication,
} from "../prepare-album-artwork-palette-v2-phase-3-review.ts"
import {
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_ATTEMPT,
	ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_ATTEMPT,
	normalizeAlbumArtworkPaletteV2Phase3Result,
} from "../src/album-artwork-palette-v2-phase-3-contract.ts"
import { mixOKLab, oklabToRGB, rgbToOKLab } from "../src/color.ts"
import {
	parseCompletePaletteReviewFeedbackStore,
	parseCompletePaletteReviewManifest,
	type CompletePaletteReviewManifest,
} from "../src/complete-palette-review-v2.ts"
import { loadNativeImage } from "../src/native-resolution-image.ts"
import type { RawImage } from "../src/types.ts"

const contractId = "album-artwork-palette-v2-phase-3-attempt-contract-v1"
const anchorId = "closed-anchor"
const candidateId = "candidate-attempt"
const comparisonId = "comparison-attempt"
const workingExpansionManifestPath = fileURLToPath(new URL(
	"../data/album-artwork-palette-v2-phase-3-working-expansion.json",
	import.meta.url,
))
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url))

function currentMidpointImage(): RawImage {
	const width = 72
	const height = 48
	const data = new Uint8Array(width * height * 3)
	const first = rgbToOKLab([34, 52, 142])
	const middle = rgbToOKLab([80, 130, 120])
	const second = rgbToOKLab([212, 164, 48])
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const amount = x / (width - 1)
			let color = amount < 0.5
				? oklabToRGB(mixOKLab(first, middle, amount * 2))
				: oklabToRGB(mixOKLab(middle, second, amount * 2 - 1))
			if (x >= 20 && x < 52 && (
				(y >= 10 && y < 13) || (y >= 18 && y < 21) || (y >= 26 && y < 29)
			)) color = [8, 8, 12]
			if ((x >= 56 && x < 63 && y >= 34 && y < 41) ||
				(x >= 9 && x < 14 && y >= 37 && y < 42)) color = [225, 30, 92]
			data.set(color, (y * width + x) * 3)
		}
	}
	return { width, height, data }
}

function publicationCopy<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

let currentMidpointPublication: Promise<Readonly<{
	image: RawImage
	sourceBytes: Buffer
	reproducedOutput: ReturnType<typeof normalizeAlbumArtworkPaletteV2Phase3Result>
	artifact: Readonly<{ source: unknown; identity: unknown; output: unknown }>
}>> | undefined

function genuineCurrentMidpointPublication() {
	currentMidpointPublication ??= (async () => {
		const source = currentMidpointImage()
		const encoded = await sharp(source.data, {
			raw: { width: source.width, height: source.height, channels: 3 },
		}).png().toBuffer()
		const image = await loadNativeImage(encoded)
		const reproducedOutput = normalizeAlbumArtworkPaletteV2Phase3Result(
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_ATTEMPT.extract(image),
		)
		return {
			image,
			sourceBytes: encoded,
			reproducedOutput,
			artifact: {
				source: { width: image.width, height: image.height },
				identity: publicationCopy(
					ALBUM_ARTWORK_PALETTE_V2_PHASE_3_MIDPOINT_AWARE_RENDER_CANDIDATE_ATTEMPT.identity,
				),
				output: publicationCopy(reproducedOutput),
			},
		}
	})()
	return currentMidpointPublication
}

let currentFinalPublication: Promise<Readonly<{
	image: RawImage
	sourceBytes: Buffer
	reproducedOutput: ReturnType<typeof normalizeAlbumArtworkPaletteV2Phase3Result>
	artifact: Readonly<{ source: unknown; identity: unknown; output: unknown }>
}>> | undefined

function genuineCurrentFinalPublication() {
	currentFinalPublication ??= (async () => {
		const source = await genuineCurrentMidpointPublication()
		const reproducedOutput = normalizeAlbumArtworkPaletteV2Phase3Result(
			ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT.extract(source.image),
		)
		return {
			image: source.image,
			sourceBytes: source.sourceBytes,
			reproducedOutput,
			artifact: {
				source: { width: source.image.width, height: source.image.height },
				identity: publicationCopy(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT.identity),
				output: publicationCopy(reproducedOutput),
			},
		}
	})()
	return currentFinalPublication
}

let currentIntegratedThreeStopOutput: ReturnType<typeof normalizeAlbumArtworkPaletteV2Phase3Result> | undefined

function genuineCurrentIntegratedThreeStopOutput() {
	currentIntegratedThreeStopOutput ??= normalizeAlbumArtworkPaletteV2Phase3Result(
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_ATTEMPT.extract(currentMidpointImage()),
	)
	const root = (currentIntegratedThreeStopOutput.diagnostics as any).phase3IntegratedCandidate
	assert.equal(root?.gradientAuthority.midpoint.kind, "source-supported-three-stop")
	return publicationCopy(currentIntegratedThreeStopOutput)
}

type RawTreatment = Readonly<{
	id: string
	background: Readonly<{ hex: string; generated: boolean }>
	surface: Readonly<{ hex: string; generated: boolean }>
	foreground: Readonly<{ hex: string; generated: boolean }>
	accent: Readonly<{ hex: string; generated: boolean }>
	gradient: boolean
	fieldTreatment: string
	sourceFieldHypothesisId: string
	familyRoles: Readonly<{
		background: string
		surface: string
		foreground: string
		accent: string
	}>
	collapse: Readonly<{ surface: boolean; accent: boolean }>
	gradientEvidence: null | Readonly<{ topology: string; direction: string }>
}>

function treatment(
	id: string,
	values: readonly [string, string, string, string],
	options: Readonly<{
		gradient?: boolean
		generatedAccent?: boolean
		fieldTreatment?: string
		sourceFieldHypothesisId?: string
		familyRoles?: RawTreatment["familyRoles"]
		gradientTopology?: string
		gradientDirection?: string
	}> = {},
): RawTreatment {
	const gradient = options.gradient ?? false
	return {
		id,
		background: { hex: values[0], generated: false },
		surface: { hex: values[1], generated: false },
		foreground: { hex: values[2], generated: false },
		accent: { hex: values[3], generated: options.generatedAccent ?? false },
		gradient,
		fieldTreatment: options.fieldTreatment ?? (gradient ? "gradient-field" : "separate-flat-fields"),
		sourceFieldHypothesisId: options.sourceFieldHypothesisId ?? (gradient ? "gradient:test" : "flat:test"),
		familyRoles: options.familyRoles ?? {
			background: "family-background",
			surface: "family-surface",
			foreground: "family-foreground",
			accent: "family-accent",
		},
		collapse: { surface: values[0] === values[1], accent: values[2] === values[3] },
		gradientEvidence: gradient ? {
			topology: options.gradientTopology ?? "linear",
			direction: options.gradientDirection ?? "left-right",
		} : null,
	}
}

const anchor = treatment("anchor", ["#101010", "#101010", "#f0f0f0", "#f0f0f0"])
const oldAlternative = treatment("old", ["#101010", "#101010", "#f0f0f0", "#cccccc"])
const changedWinner = treatment("changed", ["#101010", "#202020", "#f0f0f0", "#d00000"], {
	generatedAccent: true,
})
const novelFlat = treatment("novel-flat", ["#101010", "#101010", "#f0f0f0", "#00aa00"])
const novelGradient = treatment("novel-gradient", ["#101010", "#303030", "#f0f0f0", "#f0f0f0"], {
	gradient: true,
})
const secondNovel = treatment("second-novel", ["#181818", "#181818", "#eeeeee", "#3366cc"])
const comparisonAnchor = treatment("comparison", ["#121212", "#121212", "#ededed", "#ededed"])
const exactCarrier = treatment("exact-carrier", ["#202020", "#303030", "#505050", "#707070"], {
	gradient: true,
	sourceFieldHypothesisId: "gradient:exact-field",
	familyRoles: {
		background: "family-exact-background",
		surface: "family-exact-surface",
		foreground: "family-dark-foreground",
		accent: "family-exact-accent",
	},
	gradientTopology: "radial-center",
	gradientDirection: "center-out",
})
const exactReserve = treatment("exact-reserve", ["#202020", "#303030", "#f5f5f5", "#707070"], {
	gradient: true,
	sourceFieldHypothesisId: "gradient:exact-field",
	familyRoles: {
		background: "family-exact-background",
		surface: "family-exact-surface",
		foreground: "family-light-foreground",
		accent: "family-exact-accent",
	},
	gradientTopology: "radial-center",
	gradientDirection: "center-out",
})

function normalized(key: string, value: RawTreatment) {
	return { key, treatment: value }
}

function treatmentKey(value: RawTreatment): string {
	return `${value.background.hex}:${value.surface.hex}:${value.foreground.hex}:${value.accent.hex}:` +
		`${value.gradient ? "gradient" : "flat"}`
}

type FixtureSource = Readonly<{
	caseId: string
	path: string
	sha256: string
	byteCount: number
}>

type MutableExactCarrierArtifact = {
	attempts: Array<{
		identity: { attemptId: string }
		output: {
			winner: { key: string; treatment: RawTreatment }
			alternatives: Array<{ key: string; treatment: RawTreatment }>
			diagnostics?: {
				phase3SourceLightForegroundReserve: ReturnType<typeof exactCarrierDiagnostics>
			}
		}
		materialDelta: {
			winner: { candidateKey: string; changed: boolean }
		}
	}>
}

function artifact(source: FixtureSource, candidateWinner: RawTreatment,
	candidateAlternatives: Array<Readonly<{ key: string; treatment: RawTreatment }>>,
	comparisonWinner: RawTreatment = comparisonAnchor) {
	const anchorAlternatives = [normalized("anchor-key", anchor), normalized("old-key", oldAlternative)]
	const addedAlternativeKeys = candidateAlternatives
		.map(({ key }) => key)
		.filter((key) => !new Set(anchorAlternatives.map((entry) => entry.key)).has(key))
	const candidateWinnerKey = candidateWinner === anchor ? "anchor-key" : "changed-key"
	return {
		schemaVersion: 1,
		contractId,
		source: {
			caseId: source.caseId,
			sha256: source.sha256,
			byteCount: source.byteCount,
			width: 10,
			height: 10,
		},
		anchor: {
			identity: { anchorId },
			output: { winner: normalized("anchor-key", anchor), alternatives: anchorAlternatives },
		},
		attempts: [{
			identity: { attemptId: candidateId, configurationId: "synthetic" },
			output: { winner: normalized(candidateWinnerKey, candidateWinner), alternatives: candidateAlternatives },
			materialDelta: {
				identity: "canonical-role-hex-and-gradient-v1",
				winner: {
					anchorKey: "anchor-key",
					candidateKey: candidateWinnerKey,
					changed: candidateWinnerKey !== "anchor-key",
				},
				addedAlternativeKeys,
			},
		}, {
			identity: { attemptId: comparisonId, configurationId: "synthetic-comparison" },
			output: {
				winner: normalized("comparison-key", comparisonWinner),
				alternatives: [normalized("comparison-key", comparisonWinner)],
			},
			materialDelta: { identity: "unused-comparison-fixture" },
		}],
	}
}

async function json(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function fixture(context: TestContext): Promise<Readonly<{
	root: string
	iterationDirectory: string
	panelPath: string
}>> {
	const root = await realpath(await mkdtemp(join(tmpdir(), "phase-3-review-bridge-")))
	context.after(async () => rm(root, { recursive: true, force: true }))
	const iterationDirectory = join(root, "research", "data", "scratch", "iteration")
	const imageDirectory = join(root, "images")
	await mkdir(iterationDirectory, { recursive: true })
	await mkdir(imageDirectory, { recursive: true })
	const sources = await Promise.all(["one", "two", "three"].map(async (name, index) => {
		const bytes = Buffer.from(`synthetic-artwork-${name}`)
		const file = `images/${name}.jpg`
		await writeFile(join(root, file), bytes)
		return {
			caseId: `development-0${index + 1}`,
			path: file,
			sha256: createHash("sha256").update(bytes).digest("hex"),
			byteCount: bytes.byteLength,
		}
	}))
	const panelPath = join(root, "research", "data", "album-artwork-palette-v2-development-panel.json")
	await mkdir(join(root, "research", "data"), { recursive: true })
	await json(panelPath, { schemaVersion: 1, sourceCount: sources.length, sources })

	const artifacts = [
		artifact(sources[0], changedWinner, [
			normalized("changed-key", structuredClone(changedWinner)),
			normalized("old-key", oldAlternative),
			normalized("novel-flat-key", novelFlat),
			normalized("novel-gradient-key", novelGradient),
		]),
		artifact(sources[1], anchor, [
			normalized("anchor-key", anchor),
			normalized("second-novel-key", secondNovel),
		]),
		artifact(sources[2], anchor, [normalized("anchor-key", anchor), normalized("old-key", oldAlternative)]),
	]
	for (const artifactValue of artifacts) {
		await json(join(iterationDirectory, `${artifactValue.source.caseId}.json`), artifactValue)
	}
	await json(join(iterationDirectory, "iteration.json"), {
		schemaVersion: 1,
		contractId,
		iterationId: "synthetic",
		sources: [...sources].reverse().map((source) => ({
			caseId: source.caseId,
			file: `${source.caseId}.json`,
		})),
	})
	return { root, iterationDirectory, panelPath }
}

async function finalPublicationFixture(context: TestContext): Promise<Awaited<ReturnType<typeof fixture>> & Readonly<{
	artifactPath: string
	midpointHex: string
}>> {
	const publication = await genuineCurrentFinalPublication()
	const output = publication.artifact.output as any
	const root = await realpath(await mkdtemp(join(tmpdir(), "phase-3-final-publication-review-")))
	context.after(async () => rm(root, { recursive: true, force: true }))
	const iterationDirectory = join(root, "research", "data", "scratch", "iteration")
	const panelPath = join(root, "research", "data", "album-artwork-palette-v2-development-panel.json")
	const artifactPath = join(iterationDirectory, "development-01.json")
	await mkdir(iterationDirectory, { recursive: true })
	await mkdir(join(root, "images"), { recursive: true })
	const file = "images/final.png"
	await writeFile(join(root, file), publication.sourceBytes)
	const source = {
		caseId: "development-01",
		path: file,
		sha256: createHash("sha256").update(publication.sourceBytes).digest("hex"),
		byteCount: publication.sourceBytes.byteLength,
	}
	await json(panelPath, { schemaVersion: 1, sourceCount: 1, sources: [source] })
	const value = artifact(source, anchor, [normalized("anchor-key", anchor)]) as any
	value.source.width = publication.image.width
	value.source.height = publication.image.height
	const closedKeys = new Set(value.anchor.output.alternatives.map(({ key }: any) => key))
	value.attempts = [{
		identity: publication.artifact.identity,
		output,
		materialDelta: {
			identity: "canonical-role-hex-and-gradient-v1",
			winner: {
				anchorKey: value.anchor.output.winner.key,
				candidateKey: output.winner.key,
				changed: output.winner.key !== value.anchor.output.winner.key,
			},
			addedAlternativeKeys: output.alternatives.map(({ key }: any) => key)
				.filter((key: string) => !closedKeys.has(key)),
		},
	}]
	await json(artifactPath, value)
	await json(join(iterationDirectory, "iteration.json"), {
		schemaVersion: 1,
		contractId,
		iterationId: "final-publication",
		sources: [{ caseId: source.caseId, file: "development-01.json" }],
	})
	const midpoint = output.diagnostics.phase3FinalCandidate.gradientAuthority.midpoint
	assert.equal(midpoint.kind, "source-supported-three-stop")
	return { root, iterationDirectory, panelPath, artifactPath, midpointHex: midpoint.color.hex }
}

async function symmetricRenderFixture(context: TestContext): Promise<Awaited<ReturnType<typeof fixture>> & Readonly<{
	artifactPath: string
	integratedMidpointHex: string
}>> {
	const input = await fixture(context)
	const artifactPath = join(input.iterationDirectory, "development-01.json")
	const value = JSON.parse(await readFile(artifactPath, "utf8")) as any
	const ordinaryKey = treatmentKey(novelGradient)
	const ordinaryEntry = normalized(ordinaryKey, novelGradient)
	const ordinaryAttempt = value.attempts.find(({ identity }: any) => identity.attemptId === candidateId)
	assert.ok(ordinaryAttempt)
	ordinaryAttempt.output = { winner: ordinaryEntry, alternatives: [ordinaryEntry] }
	ordinaryAttempt.materialDelta = {
		identity: "canonical-role-hex-and-gradient-v1",
		winner: { anchorKey: "anchor-key", candidateKey: ordinaryKey, changed: true },
		addedAlternativeKeys: [ordinaryKey],
	}
	const integratedOutput = genuineCurrentIntegratedThreeStopOutput() as any
	const closedKeys = new Set(["anchor-key", "old-key"])
	value.attempts.push({
		identity: publicationCopy(ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_ATTEMPT.identity),
		output: integratedOutput,
		materialDelta: {
			identity: "canonical-role-hex-and-gradient-v1",
			winner: {
				anchorKey: "anchor-key",
				candidateKey: integratedOutput.winner.key,
				changed: integratedOutput.winner.key !== "anchor-key",
			},
			addedAlternativeKeys: integratedOutput.alternatives
				.map(({ key }: any) => key)
				.filter((key: string) => !closedKeys.has(key)),
		},
	})
	await json(artifactPath, value)
	await json(join(input.iterationDirectory, "iteration.json"), {
		schemaVersion: 1,
		contractId,
		iterationId: "symmetric-render",
		sources: [{ caseId: "development-01", file: "development-01.json" }],
	})
	return {
		...input,
		artifactPath,
		integratedMidpointHex:
			integratedOutput.diagnostics.phase3IntegratedCandidate.gradientAuthority.midpoint.color.hex,
	}
}

function exactCarrierDiagnostics(anchorKeys: readonly string[], outputKeys: readonly string[]) {
	const carrierIndex = anchorKeys.indexOf(treatmentKey(exactCarrier))
	const gates = Object.fromEntries([
		"materializedKeyCanonical",
		"qualityEvaluationAvailable",
		"completeLineageDiagnosticAvailable",
		"fieldConditionalRoleEvidenceAvailable",
		"foregroundFamilyEvidenceAvailable",
		"rolePreferenceForeground",
		"lightForegroundEvidenceAtLeastMinimum",
		"familyConcentrationAtLeastMinimum",
		"withinQualityLossMaximum",
		"foregroundApcaSamplesAvailableAndFinite",
		"foregroundApcaSamplesAllNonpositive",
		"foregroundApcaHasNegativeSample",
		"ordinaryCompleteLineageEligible",
		"exactCurrentSlateCarrierAvailable",
		"foregroundChangesRelativeToCarrier",
		"candidateAbsentFromSlate",
		"matchedCarrierPreservedByCapacityAction",
	].map((key) => [key, true]))
	return {
		version: "album-artwork-palette-v2-phase-3-source-light-foreground-reserve-diagnostics-v1",
		configurationId: "synthetic-exact-reserve",
		sourceLightForegroundReserve: {
			version: "album-artwork-palette-v2-phase-3-source-light-foreground-reserve-v1",
			policy: {
				maximumReservedTreatments: 1,
				baselineMutation: "append-or-replace-last-only",
			},
			identities: {
				canonicalTreatment: "canonical-role-hex-and-gradient-v1",
				exactCarrier: "exact-current-slate-field-collapse-accent-carrier-v1",
			},
			baseline: {
				winnerKey: treatmentKey(anchor),
				slateKeys: anchorKeys,
			},
			candidates: [{
				key: treatmentKey(exactReserve),
				carrierKey: treatmentKey(exactCarrier),
				carrierIndex,
				gates,
				eligible: true,
				rejectionReasons: [],
			}],
			eligibleReserveKeysInOrder: [treatmentKey(exactReserve)],
			outcome: {
				exactNoOp: false,
				reservedKey: treatmentKey(exactReserve),
				reservedCarrierKey: treatmentKey(exactCarrier),
				reservedCarrierIndex: carrierIndex,
				replacedKey: treatmentKey(oldAlternative),
				winnerKey: treatmentKey(anchor),
				outputSlateKeys: outputKeys,
				winnerPreserved: true,
				baselinePrefixLength: 2,
				baselinePrefixPreserved: true,
				matchedCarrierPreserved: true,
			},
		},
	}
}

async function exactCarrierFixture(context: TestContext): Promise<Readonly<{
	root: string
	iterationDirectory: string
	panelPath: string
	artifactPath: string
}>> {
	const root = await realpath(await mkdtemp(join(tmpdir(), "phase-3-exact-carrier-review-")))
	context.after(async () => rm(root, { recursive: true, force: true }))
	const iterationDirectory = join(root, "research", "data", "scratch", "iteration")
	const panelPath = join(root, "research", "data", "album-artwork-palette-v2-development-panel.json")
	const artifactPath = join(iterationDirectory, "development-01.json")
	await mkdir(iterationDirectory, { recursive: true })
	await mkdir(join(root, "images"), { recursive: true })
	const sourceBytes = Buffer.from("synthetic-exact-carrier-artwork")
	await writeFile(join(root, "images", "exact.jpg"), sourceBytes)
	const source = {
		caseId: "development-01",
		path: "images/exact.jpg",
		sha256: createHash("sha256").update(sourceBytes).digest("hex"),
		byteCount: sourceBytes.byteLength,
	}
	await json(panelPath, { schemaVersion: 1, sourceCount: 1, sources: [source] })
	const closedAlternatives = [
		normalized(treatmentKey(anchor), anchor),
		normalized(treatmentKey(oldAlternative), oldAlternative),
	]
	const comparisonAlternatives = [
		normalized(treatmentKey(anchor), anchor),
		normalized(treatmentKey(exactCarrier), exactCarrier),
		normalized(treatmentKey(oldAlternative), oldAlternative),
	]
	const candidateAlternatives = [
		normalized(treatmentKey(anchor), anchor),
		normalized(treatmentKey(exactCarrier), exactCarrier),
		normalized(treatmentKey(exactReserve), exactReserve),
	]
	await json(artifactPath, {
		schemaVersion: 1,
		contractId,
		source: {
			caseId: source.caseId,
			sha256: source.sha256,
			byteCount: source.byteCount,
			width: 10,
			height: 10,
		},
		anchor: {
			identity: { anchorId },
			output: {
				winner: normalized(treatmentKey(anchor), anchor),
				alternatives: closedAlternatives,
			},
		},
		attempts: [{
			identity: { attemptId: candidateId, configurationId: "synthetic-exact-reserve" },
			output: {
				winner: normalized(treatmentKey(anchor), anchor),
				alternatives: candidateAlternatives,
				diagnostics: {
					phase3SourceLightForegroundReserve: exactCarrierDiagnostics(
						comparisonAlternatives.map(({ key }) => key),
						candidateAlternatives.map(({ key }) => key),
					),
				},
			},
			materialDelta: {
				identity: "canonical-role-hex-and-gradient-v1",
				winner: {
					anchorKey: treatmentKey(anchor),
					candidateKey: treatmentKey(anchor),
					changed: false,
				},
				addedAlternativeKeys: [treatmentKey(exactCarrier), treatmentKey(exactReserve)],
			},
		}, {
			identity: { attemptId: comparisonId, configurationId: "synthetic-comparison" },
			output: {
				winner: normalized(treatmentKey(anchor), anchor),
				alternatives: comparisonAlternatives,
			},
			materialDelta: { identity: "unused-comparison-fixture" },
		}],
	})
	await json(join(iterationDirectory, "iteration.json"), {
		schemaVersion: 1,
		contractId,
		iterationId: "synthetic-exact-carrier",
		sources: [{ caseId: source.caseId, file: "development-01.json" }],
	})
	return { root, iterationDirectory, panelPath, artifactPath }
}

async function workingExpansionFixture(context: TestContext): Promise<Awaited<ReturnType<typeof fixture>>> {
	const root = await realpath(await mkdtemp(join(tmpdir(), "phase-3-working-expansion-review-")))
	context.after(async () => rm(root, { recursive: true, force: true }))
	const manifest = JSON.parse(await readFile(workingExpansionManifestPath, "utf8")) as {
		manifestId: string
		expansionGroup: { sources: FixtureSource[] }
	}
	const source = manifest.expansionGroup.sources.find(({ caseId }) => caseId === "working-expansion-11")
	assert.ok(source)
	const sourceBytes = await readFile(join(repositoryRoot, source.path))
	assert.equal(sourceBytes.byteLength, source.byteCount)
	assert.equal(createHash("sha256").update(sourceBytes).digest("hex"), source.sha256)
	const iterationDirectory = join(root, "research", "data", "scratch", "working-expansion-review")
	await mkdir(iterationDirectory, { recursive: true })
	await mkdir(join(root, "04"), { recursive: true })
	await writeFile(join(root, source.path), sourceBytes)
	const normalizedArtifact = artifact(source, anchor, [
		normalized("anchor-key", anchor),
		normalized("raw-relation-key", novelFlat),
	], anchor)
	await json(join(iterationDirectory, "working-expansion-11.json"), normalizedArtifact)
	await json(join(iterationDirectory, "iteration.json"), {
		schemaVersion: 1,
		contractId,
		iterationId: "working-expansion-review",
		sourceAuthorization: { mode: "working-expansion", manifestId: manifest.manifestId },
		sources: [{
			caseId: source.caseId,
			sourceSha256: source.sha256,
			file: "working-expansion-11.json",
		}],
	})
	return {
		root,
		iterationDirectory,
		panelPath: join(root, "research", "data", "unused-development-panel.json"),
	}
}

function options(fixtureValue: Awaited<ReturnType<typeof fixture>>, outputDirectory: string,
	overrides: Partial<Parameters<typeof prepareAlbumArtworkPaletteV2Phase3Review>[0]> = {}) {
	return {
		iterationDirectory: fixtureValue.iterationDirectory,
		candidateAttemptId: candidateId,
		anchorId,
		mode: "pairwise" as const,
		outputDirectory,
		all: true,
		maximumCases: 16,
		reviewCaseIds: [],
		projectRoot: fixtureValue.root,
		developmentPanelPath: fixtureValue.panelPath,
		...overrides,
	}
}

async function readManifest(path: string): Promise<CompletePaletteReviewManifest> {
	return parseCompletePaletteReviewManifest(JSON.parse(await readFile(path, "utf8")) as unknown)
}

test("CLI binds the iteration, candidate, anchor, mode, output, and bounded/all policy", () => {
	assert.deepEqual(parseAlbumArtworkPaletteV2Phase3ReviewArguments([
		"--iteration-directory", "scratch/run",
		"--candidate-attempt", candidateId,
		"--anchor", anchorId,
		"--mode", "pairwise",
		"--output-directory", "scratch/review",
		"--all",
	]), {
		iterationDirectory: "scratch/run",
		candidateAttemptId: candidateId,
		anchorId,
		mode: "pairwise",
		outputDirectory: "scratch/review",
		all: true,
		maximumCases: 16,
		reviewCaseIds: [],
	})
	assert.throws(() => parseAlbumArtworkPaletteV2Phase3ReviewArguments([
		"--iteration", "run", "--candidate", candidateId, "--anchor", anchorId,
		"--mode", "absolute", "--output", "review", "--all", "--limit", "2",
	]), /cannot be combined/u)
	assert.equal(parseAlbumArtworkPaletteV2Phase3ReviewArguments([
		"run", candidateId, anchorId, "absolute", "review", "--all",
	]).mode, "absolute")
	assert.deepEqual(parseAlbumArtworkPaletteV2Phase3ReviewArguments([
		"run", candidateId, anchorId, "pairwise", "review",
		"--review-case", "development-01.winner",
		"--review-case", "development-01.slate-04",
	]).reviewCaseIds, ["development-01.winner", "development-01.slate-04"])
	assert.equal(parseAlbumArtworkPaletteV2Phase3ReviewArguments([
		"run", candidateId, anchorId, "pairwise", "review",
		"--working-expansion-manifest", "research/data/working-expansion.json",
	]).workingExpansionManifestPath, "research/data/working-expansion.json")
	assert.equal(parseAlbumArtworkPaletteV2Phase3ReviewArguments([
		"run", candidateId, anchorId, "pairwise", "review",
		"--pairwise-slate-anchor", "exact-foreground-carrier",
	]).pairwiseSlateAnchor, "exact-foreground-carrier")
	assert.throws(() => parseAlbumArtworkPaletteV2Phase3ReviewArguments([
		"run", candidateId, anchorId, "absolute", "review",
		"--pairwise-slate-anchor", "exact-foreground-carrier",
	]), /valid only in pairwise mode/u)
	assert.throws(() => parseAlbumArtworkPaletteV2Phase3ReviewArguments([
		"run", candidateId, anchorId, "pairwise", "review",
		"--pairwise-slate-anchor", "winner",
	]), /must be exact-foreground-carrier/u)
	assert.throws(() => parseAlbumArtworkPaletteV2Phase3ReviewArguments([
		"run", candidateId, anchorId, "pairwise", "review", "--all",
		"--review-case", "development-01.winner",
	]), /cannot be combined/u)
})

test("registered midpoint publication verification accepts the exact source reproduction and binds identity and dimensions",
	async () => {
		const value = await genuineCurrentMidpointPublication()
		const output = value.artifact.output as any
		assert.equal(output.diagnostics.phase3MidpointAwareRenderCandidate.applicable, true)
		assert.doesNotThrow(() =>
			verifyAlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidatePublication(
				value.reproducedOutput,
				value.image,
				value.artifact,
				"genuine current midpoint publication",
			))

		const staleIdentity = publicationCopy(value.artifact) as any
		staleIdentity.identity.configurationId = "stale-configuration"
		assert.throws(() => verifyAlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidatePublication(
			value.reproducedOutput,
			value.image,
			staleIdentity,
			"stale midpoint identity",
		), /registered midpoint-aware attempt configuration identity/u)

		const staleDimensions = publicationCopy(value.artifact) as any
		staleDimensions.source.width++
		assert.throws(() => verifyAlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidatePublication(
			value.reproducedOutput,
			value.image,
			staleDimensions,
			"stale midpoint dimensions",
		), /decoded dimensions do not match/u)
	})

test("registered midpoint publication verification rejects serialized candidate-domain and custody tampering", async () => {
	const value = await genuineCurrentMidpointPublication()
	const reject = (label: string, mutate: (output: any) => void): void => {
		const artifact = publicationCopy(value.artifact) as any
		mutate(artifact.output)
		assert.throws(() => verifyAlbumArtworkPaletteV2Phase3MidpointAwareRenderCandidatePublication(
			value.reproducedOutput,
			value.image,
			artifact,
			label,
		), /exact source-bound reproduction/u, label)
	}

	reject("candidate reorder", (output) => {
		const candidates = output.diagnostics.phase3MidpointAwareRenderCandidate
			.pathBoundMaterialization.candidates
		assert.ok(candidates.length > 1)
		candidates.reverse()
	})
	reject("coordinated candidate and shared-binding truncation", (output) => {
		const root = output.diagnostics.phase3MidpointAwareRenderCandidate
		const materialization = root.pathBoundMaterialization
		const diagnostics = materialization.diagnostics
		let selected: { bundle: any; binding: any; removed: any[] } | undefined
		for (const bundle of diagnostics.bundles) {
			for (const binding of bundle.sharedRoleBindings) {
				if (binding.selected) continue
				const removed = materialization.candidates.filter((candidate: any) =>
					candidate.bundleId === bundle.bundleId && candidate.roleBindingKey === binding.key)
				if (removed.length > 0) {
					selected = { bundle, binding, removed }
					break
				}
			}
			if (selected) break
		}
		assert.ok(selected)
		const removedKeys = new Set(selected.removed.map(({ renderKey }) => renderKey))
		const removedEligibleCount = selected.removed.filter(({ eligible }) => eligible).length
		materialization.candidates = materialization.candidates.filter(({ renderKey }: any) =>
			!removedKeys.has(renderKey))
		materialization.eligibleCandidates = materialization.eligibleCandidates.filter(({ renderKey }: any) =>
			!removedKeys.has(renderKey))
		selected.bundle.sharedRoleBindings = selected.bundle.sharedRoleBindings.filter(({ key }: any) =>
			key !== selected!.binding.key)
		selected.bundle.sharedRoleBindingCount--
		selected.bundle.completeCrossProductCount -= selected.removed.length
		selected.bundle.completeRenderKeys = selected.bundle.completeRenderKeys.filter((key: string) =>
			!removedKeys.has(key))
		diagnostics.sharedRoleBindingCount--
		diagnostics.completeCrossProductCount -= selected.removed.length
		diagnostics.completeRenderCandidateCount -= selected.removed.length
		diagnostics.qualityEligibleCompleteRenderCandidateCount -= removedEligibleCount
		output.diagnostics.completeCandidateCount -= selected.removed.length
	})
	reject("baseline tampering", (output) => {
		const baseline = output.diagnostics.phase3MidpointAwareRenderCandidate.authoritativeBaseline.evaluation
		baseline.qualityUtility += 0.000001
	})
	reject("stale serialized spatial center in the core domain", (output) => {
		const bundles = output.diagnostics.phase3MidpointAwareRenderCandidate.coreEvaluation.bundles
		const bundle = bundles.find(({ path }: any) => path.spatialCenter !== null) ?? bundles[0]
		assert.ok(bundle)
		bundle.path.spatialCenter = bundle.path.spatialCenter === null
			? [0.25, 0.75]
			: [bundle.path.spatialCenter[0] === 0.25 ? 0.5 : 0.25, bundle.path.spatialCenter[1]]
	})
})

test("registered final publication gate accepts an exact genuine extraction before symmetric projection", async (context) => {
	const publication = await genuineCurrentFinalPublication()
	assert.doesNotThrow(() => verifyAlbumArtworkPaletteV2Phase3RegisteredAttemptPublication(
		publication.reproducedOutput,
		publication.image,
		publication.artifact,
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT.identity,
		"genuine current final publication",
	))
	const input = await finalPublicationFixture(context)
	const prepared = await prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "exact-final-publication"),
		{
			candidateAttemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT.identity.attemptId,
			all: false,
			maximumCases: 1,
		},
	))
	const manifest = await readManifest(prepared.manifestPath)
	if (manifest.mode !== "pairwise") throw new Error("Expected pairwise final-publication fixture")
	const render = manifest.cases[0].options.A.researchRender
	assert.equal(render?.field.stops[1].kind, "source-supported-color")
	assert.equal(render?.field.stops[1].kind === "source-supported-color"
		? render.field.stops[1].hex : undefined, input.midpointHex)

	const artifactValue = JSON.parse(await readFile(input.artifactPath, "utf8")) as any
	artifactValue.attempts[0].output.alternatives.reverse()
	await json(input.artifactPath, artifactValue)
	await assert.rejects(() => prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "reordered-final-publication"),
		{
			candidateAttemptId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT.identity.attemptId,
			all: false,
			maximumCases: 1,
		},
	)), /exact source-bound reproduction/u)
})

test("registered final publication verification rejects identity, dimensions, tamper, reorder, domain, and authority drift",
	async () => {
		const publication = await genuineCurrentFinalPublication()
		const reject = (
			label: string,
			mutate: (artifact: any) => void,
			pattern: RegExp = /exact source-bound reproduction/u,
		): void => {
			const artifact = publicationCopy(publication.artifact) as any
			mutate(artifact)
			assert.throws(() => verifyAlbumArtworkPaletteV2Phase3RegisteredAttemptPublication(
				publication.reproducedOutput,
				publication.image,
				artifact,
				ALBUM_ARTWORK_PALETTE_V2_PHASE_3_FINAL_CANDIDATE_ATTEMPT.identity,
				label,
			), pattern, label)
		}

		reject("final identity", (artifact) => {
			artifact.identity.configurationId = "stale"
		}, /registered final-candidate attempt configuration identity/u)
		reject("final dimensions", (artifact) => {
			artifact.source.height++
		}, /decoded dimensions do not match/u)
		reject("final output tamper", (artifact) => {
			artifact.output.diagnostics.phase3FinalCandidate.composition.checks.rawNeverWinner = false
		})
		reject("final coordinated slate reorder", (artifact) => {
			const output = artifact.output
			const root = output.diagnostics.phase3FinalCandidate
			assert.ok(output.alternatives.length > 1)
			output.alternatives.reverse()
			root.selection.slateKeys.reverse()
			root.composition.finalKeys.reverse()
			root.finalSlateCustody.reverse()
		})
		reject("final selector domain truncation", (artifact) => {
			const evaluations = artifact.output.diagnostics.phase3FinalCandidate.selector.evaluations
			assert.ok(evaluations.length > 1)
			evaluations.pop()
		})
		reject("final winner authority", (artifact) => {
			artifact.output.diagnostics.phase3FinalCandidate.gradientAuthority.winnerKey = "stale"
		})
	})

test("iteration loading rejects manifests above the runner's eight-case maximum", async (context) => {
	const input = await fixture(context)
	await json(join(input.iterationDirectory, "iteration.json"), {
		schemaVersion: 1,
		contractId,
		iterationId: "oversized",
		sources: Array.from({ length: 9 }, (_, index) => ({
			caseId: `development-${String(index + 1).padStart(2, "0")}`,
			file: `development-${String(index + 1).padStart(2, "0")}.json`,
		})),
	})
	await assert.rejects(() => prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "oversized"),
	)), /runner maximum of 8 cases/u)
})

test("sequential iteration loading is deterministic across manifest source order", async (context) => {
	const input = await fixture(context)
	const first = await prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "order-first"),
	))
	const iterationPath = join(input.iterationDirectory, "iteration.json")
	const iteration = JSON.parse(await readFile(iterationPath, "utf8")) as {
		sources: Array<{ caseId: string; file: string }>
	}
	iteration.sources.reverse()
	await json(iterationPath, iteration)
	const second = await prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "order-second"),
	))
	const firstManifest = await readManifest(first.manifestPath)
	const secondManifest = await readManifest(second.manifestPath)
	assert.deepEqual(secondManifest, firstManifest)
	assert.deepEqual(firstManifest.cases.map(({ caseId }) => caseId), [
		"development-01.winner",
		"development-02.slate-02",
		"development-01.slate-03",
		"development-01.slate-04",
	])
})

test("source custody rejects a symlinked source ancestor where directory symlinks are available", async (context) => {
	const input = await fixture(context)
	const imageDirectory = join(input.root, "images")
	const actualImageDirectory = join(input.root, "actual-images")
	await rename(imageDirectory, actualImageDirectory)
	try {
		await symlink(actualImageDirectory, imageDirectory, process.platform === "win32" ? "junction" : "dir")
	} catch (error) {
		if (["EACCES", "ENOSYS", "EPERM"].includes((error as NodeJS.ErrnoException).code ?? "")) {
			context.skip("Directory symlinks are unavailable in this environment")
			return
		}
		throw error
	}
	await assert.rejects(() => prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "symlinked-source-ancestor"),
	)), /ancestor, or terminal symlinks/u)
})

test("working-expansion preparation requires explicit verified opt-in and preserves canonical defaults", async (context) => {
	const input = await workingExpansionFixture(context)
	await assert.rejects(() => prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "missing-opt-in"),
		{ anchorId: comparisonId, all: false, reviewCaseIds: ["working-expansion-11.slate-02"] },
	)), /requires an explicit verified --working-expansion-manifest/u)

	const prepared = await prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "explicit-opt-in"),
		{
			anchorId: comparisonId,
			all: false,
			reviewCaseIds: ["working-expansion-11.slate-02"],
			workingExpansionManifestPath,
		},
	))
	assert.deepEqual({
		candidateCount: prepared.candidateCount,
		reviewNeededCount: prepared.reviewNeededCount,
		queuedCount: prepared.queuedCount,
		warehouseUsed: prepared.warehouseUsed,
	}, {
		candidateCount: 1,
		reviewNeededCount: 1,
		queuedCount: 1,
		warehouseUsed: false,
	})
	const manifest = await readManifest(prepared.manifestPath)
	assert.equal(manifest.mode, "pairwise")
	if (manifest.mode !== "pairwise") throw new Error("Expected pairwise working-expansion fixture")
	assert.deepEqual(manifest.cases.map(({ caseId }) => caseId), ["working-expansion-11.slate-02"])
	assert.deepEqual(manifest.cases[0].source, {
		file: "04/ab67616d0000b27300041272670218ce2846bb53",
		sha256: "8fb979d4794012b8b84e61f6680fb601ab043132ffe46391016f6bbb806dbf95",
		bytes: 169766,
	})
	assert.equal(manifest.cases[0].options.A.roles.accent.hex, novelFlat.accent.hex)
	assert.equal(manifest.cases[0].options.B.roles.background.hex, anchor.background.hex)
})

test("working-expansion preparation rejects manifest tampering and normalized source path changes", async (context) => {
	const input = await workingExpansionFixture(context)
	const tamperedManifest = JSON.parse(await readFile(workingExpansionManifestPath, "utf8")) as {
		manifestId: string
	}
	tamperedManifest.manifestId = "0".repeat(64)
	const tamperedManifestPath = join(input.root, "tampered-working-expansion.json")
	await json(tamperedManifestPath, tamperedManifest)
	await assert.rejects(() => prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "tampered-manifest"),
		{
			anchorId: comparisonId,
			all: false,
			reviewCaseIds: ["working-expansion-11.slate-02"],
			workingExpansionManifestPath: tamperedManifestPath,
		},
	)), /does not exactly match/u)

	const artifactPath = join(input.iterationDirectory, "working-expansion-11.json")
	const changedPath = JSON.parse(await readFile(artifactPath, "utf8")) as {
		source: { file?: string }
	}
	changedPath.source.file = "04/not-the-pinned-source"
	await json(artifactPath, changedPath)
	await assert.rejects(() => prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "changed-source-path"),
		{
			anchorId: comparisonId,
			all: false,
			reviewCaseIds: ["working-expansion-11.slate-02"],
			workingExpansionManifestPath,
		},
	)), /conflicts with its development-panel source binding/u)
})

test("pairwise preparation groups duplicates, skips unchanged output, preserves custody and resumes feedback", async (context) => {
	const input = await fixture(context)
	const outputDirectory = join(input.root, "review", "bounded")
	const prepared = await prepareAlbumArtworkPaletteV2Phase3Review(options(input, outputDirectory, {
		all: false,
		maximumCases: 16,
	}))
	assert.deepEqual({
		candidateCount: prepared.candidateCount,
		reviewNeededCount: prepared.reviewNeededCount,
		queuedCount: prepared.queuedCount,
		deferredByBoundCount: prepared.deferredByBoundCount,
		warehouseUsed: prepared.warehouseUsed,
	}, {
		candidateCount: 4,
		reviewNeededCount: 4,
		queuedCount: 2,
		deferredByBoundCount: 2,
		warehouseUsed: false,
	})
	const manifest = await readManifest(prepared.manifestPath)
	assert.equal(manifest.mode, "pairwise")
	assert.equal(manifest.blinded, false)
	assert.deepEqual(manifest.cases.map(({ caseId }) => caseId), [
		"development-01.winner",
		"development-02.slate-02",
	])
	assert.equal(new Set(manifest.cases.map(({ source }) => source.sha256)).size, manifest.cases.length)
	if (manifest.mode !== "pairwise") throw new Error("Expected pairwise fixture")
	assert.deepEqual(manifest.cases[0].assignment, { A: "candidate", B: "anchor" })
	assert.equal(manifest.cases[0].options.A.roles.accent.generated, true)
	assert.equal(manifest.cases[0].options.A.collapse.surface, false)
	assert.equal(manifest.cases[0].options.A.gradient, false)
	assert.deepEqual(manifest.cases[0].source, {
		file: "images/one.jpg",
		sha256: createHash("sha256").update("synthetic-artwork-one").digest("hex"),
		bytes: Buffer.byteLength("synthetic-artwork-one"),
	})
	const emptyFeedback = parseCompletePaletteReviewFeedbackStore(
		JSON.parse(await readFile(prepared.feedbackPath, "utf8")) as unknown,
		manifest,
	)
	assert.deepEqual(emptyFeedback.entries, [])
	const resumed = {
		...emptyFeedback,
		entries: [{
			caseId: manifest.cases[0].caseId,
			sourceSha256: manifest.cases[0].source.sha256,
			qualityA: "strong",
			qualityB: "acceptable",
			comparison: "a-stronger",
			issuesA: [],
			issuesB: [],
			comment: "keep this response",
			submittedAt: "2026-07-28T00:00:00.000Z",
		}],
	}
	await json(prepared.feedbackPath, resumed)
	const rerun = await prepareAlbumArtworkPaletteV2Phase3Review(options(input, outputDirectory, {
		all: false,
		maximumCases: 16,
	}))
	assert.equal(rerun.resumedFeedbackCount, 1)
	assert.equal((JSON.parse(await readFile(prepared.feedbackPath, "utf8")) as typeof resumed).entries[0].comment,
		"keep this response")
})

test("exact compatible minimal-review evidence avoids duplicate review and --all retains the remaining slate", async (context) => {
	const input = await fixture(context)
	const firstOutput = join(input.root, "review", "report-source")
	await prepareAlbumArtworkPaletteV2Phase3Review(options(input, firstOutput))
	const report = JSON.parse(await readFile(join(firstOutput, "minimal-review.json"), "utf8")) as {
		candidateCount: number
		excludedCount: number
		reviewNeededCount: number
		reviewWorkAvoidedCount: number
		entries: Array<Record<string, unknown>>
	}
	report.entries[0] = {
		...report.entries[0],
		status: "exact-evidence-reused",
		reviewNeeded: false,
		exactQualities: ["strong"],
	}
	report.reviewNeededCount -= 1
	report.reviewWorkAvoidedCount += 1
	const consumedReportPath = join(input.root, "minimal-review-consumed.json")
	await json(consumedReportPath, report)
	const outputDirectory = join(input.root, "review", "reused")
	const prepared = await prepareAlbumArtworkPaletteV2Phase3Review(options(input, outputDirectory, {
		minimalReviewReportPath: consumedReportPath,
	}))
	assert.equal(prepared.warehouseUsed, true)
	assert.equal(prepared.reusedOrExcludedCount, 1)
	assert.equal(prepared.queuedCount, 3)
	const manifest = await readManifest(prepared.manifestPath)
	assert.deepEqual(manifest.cases.map(({ caseId }) => caseId), [
		"development-02.slate-02",
		"development-01.slate-03",
		"development-01.slate-04",
	])
	assert.deepEqual(JSON.parse(await readFile(prepared.minimalReviewReportPath, "utf8")), report)

	const bounded = await prepareAlbumArtworkPaletteV2Phase3Review(options(input, join(input.root, "review", "reused-bounded"), {
		all: false,
		maximumCases: 16,
		minimalReviewReportPath: consumedReportPath,
	}))
	assert.equal(bounded.queuedCount, 2)
	assert.equal(bounded.deferredByBoundCount, 1)
	const boundedManifest = await readManifest(bounded.manifestPath)
	assert.deepEqual(boundedManifest.cases.map(({ caseId }) => caseId), [
		"development-02.slate-02",
		"development-01.slate-03",
	])
	const boundedReport = JSON.parse(await readFile(bounded.minimalReviewReportPath, "utf8")) as {
		candidateCount: number
		entries: unknown[]
	}
	assert.equal(boundedReport.candidateCount, 4)
	assert.equal(boundedReport.entries.length, 4)
	await assert.rejects(() => prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "explicit-resolved"),
		{
			all: false,
			reviewCaseIds: ["development-01.winner"],
			minimalReviewReportPath: consumedReportPath,
		},
	)), /unavailable or already resolved/u)
})

test("absolute mode emits the candidate treatment without an anchor option", async (context) => {
	const input = await fixture(context)
	const prepared = await prepareAlbumArtworkPaletteV2Phase3Review(options(input, join(input.root, "review", "absolute"), {
		mode: "absolute",
		all: false,
		maximumCases: 1,
	}))
	const manifest = await readManifest(prepared.manifestPath)
	assert.equal(manifest.mode, "absolute")
	if (manifest.mode !== "absolute") throw new Error("Expected absolute fixture")
	assert.equal(manifest.cases[0].treatment.roles.accent.hex, "#d00000")
	assert.equal("options" in manifest.cases[0], false)
})

test("pairwise mode can use another aligned attempt as its comparison anchor", async (context) => {
	const input = await fixture(context)
	const prepared = await prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "attempt-anchor"),
		{ anchorId: comparisonId, all: false, maximumCases: 1 },
	))
	const manifest = await readManifest(prepared.manifestPath)
	if (manifest.mode !== "pairwise") throw new Error("Expected pairwise fixture")
	assert.equal(manifest.cases[0].options.B.roles.background.hex, "#121212")
	assert.equal(manifest.cases[0].options.A.researchRender, undefined)
	assert.equal(manifest.cases[0].options.B.researchRender, undefined)
	assert.deepEqual(manifest.cases[0].assignment, { A: "candidate", B: "anchor" })
})

test("pairwise projection keeps an ordinary candidate two-stop separate from an integrated three-stop anchor",
	async (context) => {
		const input = await symmetricRenderFixture(context)
		const prepared = await prepareAlbumArtworkPaletteV2Phase3Review(options(
			input,
			join(input.root, "review", "ordinary-vs-integrated"),
			{
				anchorId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_ATTEMPT.identity.attemptId,
				all: false,
				maximumCases: 1,
			},
		))
		const manifest = await readManifest(prepared.manifestPath)
		if (manifest.mode !== "pairwise") throw new Error("Expected pairwise symmetric-render fixture")
		const { A, B } = manifest.cases[0].options
		assert.equal(A.gradient, true)
		assert.equal(A.researchRender, undefined)
		assert.equal(B.researchRender?.field.stops[1].kind, "source-supported-color")
		assert.equal(B.researchRender?.field.stops[1].kind === "source-supported-color"
			? B.researchRender.field.stops[1].hex : undefined, input.integratedMidpointHex)
	})

test("pairwise projection keeps an integrated candidate three-stop separate from an ordinary comparison two-stop",
	async (context) => {
		const input = await symmetricRenderFixture(context)
		const prepared = await prepareAlbumArtworkPaletteV2Phase3Review(options(
			input,
			join(input.root, "review", "integrated-vs-ordinary"),
			{
				candidateAttemptId:
					ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_ATTEMPT.identity.attemptId,
				anchorId: candidateId,
				all: false,
				maximumCases: 1,
			},
		))
		const manifest = await readManifest(prepared.manifestPath)
		if (manifest.mode !== "pairwise") throw new Error("Expected pairwise symmetric-render fixture")
		const { A, B } = manifest.cases[0].options
		assert.equal(A.researchRender?.field.stops[1].kind, "source-supported-color")
		assert.equal(A.researchRender?.field.stops[1].kind === "source-supported-color"
			? A.researchRender.field.stops[1].hex : undefined, input.integratedMidpointHex)
		assert.equal(B.gradient, true)
		assert.equal(B.researchRender, undefined)
	})

test("attempt-backed comparison projection fails closed on stale integrated anchor diagnostics", async (context) => {
	const input = await symmetricRenderFixture(context)
	const value = JSON.parse(await readFile(input.artifactPath, "utf8")) as any
	const integrated = value.attempts.find(({ identity }: any) => identity.attemptId ===
		ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_ATTEMPT.identity.attemptId)
	assert.ok(integrated)
	integrated.output.diagnostics.phase3IntegratedCandidate.configurationId = "stale-configuration"
	await json(input.artifactPath, value)
	await assert.rejects(() => prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "stale-integrated-anchor"),
		{
			anchorId: ALBUM_ARTWORK_PALETTE_V2_PHASE_3_INTEGRATED_CANDIDATE_ATTEMPT.identity.attemptId,
			all: false,
			maximumCases: 1,
		},
	)), /integrated|configuration|identity/u)
})

test("exact-foreground-carrier is explicit and pairs the sole reserved slate addition with its carrier", async (context) => {
	const input = await exactCarrierFixture(context)
	const reviewCaseIds = ["development-01.slate-03"]
	const defaultPreparation = await prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "default-anchor"),
		{ anchorId: comparisonId, all: false, reviewCaseIds },
	))
	const defaultManifest = await readManifest(defaultPreparation.manifestPath)
	if (defaultManifest.mode !== "pairwise") throw new Error("Expected pairwise default fixture")
	assert.equal(defaultManifest.cases[0].options.A.roles.foreground.hex, exactReserve.foreground.hex)
	assert.equal(defaultManifest.cases[0].options.B.roles.foreground.hex, anchor.foreground.hex)

	const exactPreparation = await prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "exact-anchor"),
		{
			anchorId: comparisonId,
			all: false,
			reviewCaseIds,
			pairwiseSlateAnchor: "exact-foreground-carrier",
		},
	))
	assert.deepEqual({
		candidateCount: exactPreparation.candidateCount,
		reviewNeededCount: exactPreparation.reviewNeededCount,
		queuedCount: exactPreparation.queuedCount,
	}, { candidateCount: 1, reviewNeededCount: 1, queuedCount: 1 })
	const exactManifest = await readManifest(exactPreparation.manifestPath)
	if (exactManifest.mode !== "pairwise") throw new Error("Expected pairwise exact-carrier fixture")
	assert.deepEqual(exactManifest.cases.map(({ caseId }) => caseId), reviewCaseIds)
	assert.equal(exactManifest.cases[0].options.A.roles.foreground.hex, exactReserve.foreground.hex)
	assert.equal(exactManifest.cases[0].options.B.roles.foreground.hex, exactCarrier.foreground.hex)
	assert.equal(exactManifest.cases[0].options.A.roles.background.hex,
		exactManifest.cases[0].options.B.roles.background.hex)
	assert.deepEqual(exactManifest.cases[0].source, {
		file: "images/exact.jpg",
		sha256: createHash("sha256").update("synthetic-exact-carrier-artwork").digest("hex"),
		bytes: Buffer.byteLength("synthetic-exact-carrier-artwork"),
	})

	await assert.rejects(() => prepareAlbumArtworkPaletteV2Phase3Review(options(
		input,
		join(input.root, "review", "absolute-invalid"),
		{ mode: "absolute", pairwiseSlateAnchor: "exact-foreground-carrier" },
	)), /valid only in pairwise mode/u)
	await assert.rejects(() => prepareAlbumArtworkPaletteV2Phase3Review({
		...options(input, join(input.root, "review", "unsupported-value")),
		pairwiseSlateAnchor: "winner" as never,
	}), /must be exact-foreground-carrier/u)
})

test("exact-foreground-carrier rejects missing, stale, wrong-carrier, structural, and winner tampering", async (context) => {
	const rejectTamper = async (
		child: TestContext,
		name: string,
		mutate: (attempt: MutableExactCarrierArtifact["attempts"][number]) => void,
		pattern: RegExp,
	): Promise<void> => {
		const input = await exactCarrierFixture(child)
		const artifactValue = JSON.parse(await readFile(input.artifactPath, "utf8")) as MutableExactCarrierArtifact
		const attempt = artifactValue.attempts.find(({ identity }) => identity.attemptId === candidateId)
		assert.ok(attempt)
		mutate(attempt)
		await json(input.artifactPath, artifactValue)
		await assert.rejects(() => prepareAlbumArtworkPaletteV2Phase3Review(options(
			input,
			join(input.root, "review", name),
			{
				anchorId: comparisonId,
				all: false,
				reviewCaseIds: ["development-01.slate-03"],
				pairwiseSlateAnchor: "exact-foreground-carrier",
			},
		)), pattern)
	}

	await context.test("missing diagnostics", async (child) => rejectTamper(child, "missing", (attempt) => {
		delete attempt.output.diagnostics
	}, /diagnostics are missing/u))
	await context.test("unsupported diagnostics", async (child) => rejectTamper(child, "unsupported", (attempt) => {
		attempt.output.diagnostics!.phase3SourceLightForegroundReserve.version = "unsupported"
	}, /stale or unsupported/u))
	await context.test("wrong carrier", async (child) => rejectTamper(child, "wrong-carrier", (attempt) => {
		const reserve = attempt.output.diagnostics!.phase3SourceLightForegroundReserve.sourceLightForegroundReserve
		reserve.outcome.reservedCarrierKey = treatmentKey(anchor)
		reserve.outcome.reservedCarrierIndex = 0
		reserve.candidates[0].carrierKey = treatmentKey(anchor)
		reserve.candidates[0].carrierIndex = 0
	}, /candidate and carrier differ/u))
	await context.test("raw treatment structure", async (child) => rejectTamper(child, "structure", (attempt) => {
		const reserved = attempt.output.alternatives.find(({ key }) => key === treatmentKey(exactReserve))!
		reserved.treatment = {
			...reserved.treatment,
			familyRoles: { ...reserved.treatment.familyRoles, surface: "tampered-surface-family" },
		}
	}, /differ in surface family or hex/u))
	await context.test("winner change", async (child) => rejectTamper(child, "winner", (attempt) => {
		const reserved = attempt.output.alternatives.find(({ key }) => key === treatmentKey(exactReserve))!
		attempt.output.winner = structuredClone(reserved)
		attempt.materialDelta.winner.candidateKey = reserved.key
		attempt.materialDelta.winner.changed = true
		attempt.output.diagnostics!.phase3SourceLightForegroundReserve.sourceLightForegroundReserve.outcome.winnerKey =
			reserved.key
	}, /cannot use a winner change as a slate task/u))
})

test("explicit review cases accept multiple treatments per source and preserve requested order", async (context) => {
	const input = await fixture(context)
	const prepared = await prepareAlbumArtworkPaletteV2Phase3Review(options(input, join(input.root, "review", "explicit"), {
		all: false,
		reviewCaseIds: ["development-01.slate-04", "development-01.winner", "development-02.slate-02"],
	}))
	const manifest = await readManifest(prepared.manifestPath)
	assert.deepEqual(manifest.cases.map(({ caseId }) => caseId), [
		"development-01.slate-04",
		"development-01.winner",
		"development-02.slate-02",
	])
	assert.equal(prepared.queuedCount, 3)
	assert.equal(new Set(manifest.cases.map(({ source }) => source.sha256)).size, 2)
})
