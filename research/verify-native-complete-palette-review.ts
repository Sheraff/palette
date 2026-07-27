import { createHash } from "node:crypto"
import { readFile, realpath } from "node:fs/promises"
import { dirname, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { verifyNativeCompletePaletteArtifact } from "./evaluate-native-complete-palette.ts"
import { namePalette } from "./src/color-name.ts"
import {
	NATIVE_COMPLETE_PALETTE_REVIEW_CANDIDATE,
	NATIVE_COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION,
	NATIVE_COMPLETE_PALETTE_REVIEW_VERSION,
	nativeCompletePaletteReviewRoles,
	parseNativeCompletePaletteReviewManifest,
	type NativeCompletePalettePresentedPalette,
	type NativeCompletePaletteReviewEntry,
} from "./src/native-complete-palette-review.ts"
import type { Palette, RoleName } from "./src/types.ts"

export const NATIVE_COMPLETE_PALETTE_REVIEW_ROOT =
	"research/data/experiments/native-complete-palette-0.2.5-development/review-v1" as const
export const NATIVE_COMPLETE_PALETTE_REVIEW_MANIFEST = `${NATIVE_COMPLETE_PALETTE_REVIEW_ROOT}/manifest.json` as const
export const NATIVE_COMPLETE_PALETTE_REVIEW_PLAN = `${NATIVE_COMPLETE_PALETTE_REVIEW_ROOT}/plan.json` as const
export const NATIVE_COMPLETE_PALETTE_REVIEW_AUTHORIZATION =
	"research/data/experiments/native-complete-palette-0.2.5-development/review-authorization.json" as const
const phase5Root = "research/data/experiments/native-complete-palette-0.2.5-development/phase-5"

type ReviewAuthorization = {
	schemaVersion: 1
	candidate: typeof NATIVE_COMPLETE_PALETTE_REVIEW_CANDIDATE
	authorizationBasis: string
	experimentId: string
	boundPhase5: Record<string, string>
	review: {
		authorized: true
		reviewVersion: typeof NATIVE_COMPLETE_PALETTE_REVIEW_VERSION
		presentationVersion: typeof NATIVE_COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION
		exactChangedCases: 6
		materialChangedCases: 2
		hiddenMaterialRepeats: 2
		acceptedControls: 1
		rejectedControls: 1
		knownControls: 5
		totalCases: 15
		batchSize: 15
	}
	selection: {
		changedSourceSha256: string[]
		repeatSourceSha256: string[]
		controls: Array<{ kind: NativeCompletePaletteReviewEntry["kind"]; path: string; sourceSha256: string }>
	}
	prohibitions: {
		reserveAccessAuthorized: false
		promotionAuthorized: false
		canonicalChangeAuthorized: false
		openedReserveRoots: []
		allowedSourceRoots: ["images", "00"]
	}
}

function sha256(value: string | Uint8Array): string {
	return createHash("sha256").update(value).digest("hex")
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseAuthorization(value: unknown): ReviewAuthorization {
	if (!isRecord(value) || value.schemaVersion !== 1 || value.candidate !== NATIVE_COMPLETE_PALETTE_REVIEW_CANDIDATE ||
		typeof value.authorizationBasis !== "string" || value.authorizationBasis.length === 0 ||
		typeof value.experimentId !== "string" || !/^[a-f0-9]{64}$/.test(value.experimentId) ||
		!isRecord(value.boundPhase5) || !isRecord(value.review) || !isRecord(value.selection) ||
		!isRecord(value.prohibitions)) throw new Error("Native complete-palette review authorization is invalid")
	const review = value.review
	if (review.authorized !== true || review.reviewVersion !== NATIVE_COMPLETE_PALETTE_REVIEW_VERSION ||
		review.presentationVersion !== NATIVE_COMPLETE_PALETTE_REVIEW_PRESENTATION_VERSION ||
		review.exactChangedCases !== 6 || review.materialChangedCases !== 2 || review.hiddenMaterialRepeats !== 2 ||
		review.acceptedControls !== 1 || review.rejectedControls !== 1 || review.knownControls !== 5 ||
		review.totalCases !== 15 || review.batchSize !== 15 || !Array.isArray(value.selection.changedSourceSha256) ||
		!Array.isArray(value.selection.repeatSourceSha256) || !Array.isArray(value.selection.controls)) {
		throw new Error("Native complete-palette review authorization scope is invalid")
	}
	if (value.prohibitions.reserveAccessAuthorized !== false || value.prohibitions.promotionAuthorized !== false ||
		value.prohibitions.canonicalChangeAuthorized !== false || !Array.isArray(value.prohibitions.openedReserveRoots) ||
		value.prohibitions.openedReserveRoots.length !== 0 ||
		JSON.stringify(value.prohibitions.allowedSourceRoots) !== JSON.stringify(["images", "00"])) {
		throw new Error("Native complete-palette review authorization grants forbidden access")
	}
	return value as unknown as ReviewAuthorization
}

function presentPalette(palette: Palette): NativeCompletePalettePresentedPalette {
	const names = namePalette(nativeCompletePaletteReviewRoles.map((role) => palette[role].rgb))
	return {
		roles: Object.fromEntries(nativeCompletePaletteReviewRoles.map((role, index) => [role, {
			rgb: palette[role].rgb,
			hex: palette[role].hex.toLowerCase(),
			nearestName: names[index].nearestName,
			generated: palette[role].generated,
			sourceDistance: palette[role].sourceDistance,
		}])) as NativeCompletePalettePresentedPalette["roles"],
		gradient: { isGradient: palette.gradient.isGradient, confidence: palette.gradient.confidence },
		metrics: palette.metrics,
	}
}

function assignedOption(entry: NativeCompletePaletteReviewEntry, treatment: "baseline" | "candidate") {
	return entry.assignment.A === treatment ? entry.options.A : entry.options.B
}

function changedRoles(baseline: Palette, candidate: Palette): RoleName[] {
	return nativeCompletePaletteReviewRoles.filter((role) => baseline[role].generated !== candidate[role].generated ||
		baseline[role].rgb.some((channel, index) => channel !== candidate[role].rgb[index]))
}

async function verifyHashMap(projectRoot: string, hashes: Record<string, string>, label: string): Promise<void> {
	for (const [path, expected] of Object.entries(hashes)) {
		if (!/^[a-f0-9]{64}$/.test(expected) || sha256(await readFile(resolve(projectRoot, path))) !== expected) {
			throw new Error(`${label} changed: ${path}`)
		}
	}
}

export async function verifyNativeCompletePaletteReview(
	manifestPath = resolve(fileURLToPath(new URL("..", import.meta.url)), NATIVE_COMPLETE_PALETTE_REVIEW_MANIFEST),
	projectRoot = fileURLToPath(new URL("..", import.meta.url)),
) {
	const manifestSource = await readFile(manifestPath)
	const manifest = parseNativeCompletePaletteReviewManifest(JSON.parse(manifestSource.toString("utf8")) as unknown)
	const authorizationPath = resolve(projectRoot, NATIVE_COMPLETE_PALETTE_REVIEW_AUTHORIZATION)
	const authorizationSource = await readFile(authorizationPath)
	const authorization = parseAuthorization(JSON.parse(authorizationSource.toString("utf8")) as unknown)
	if (manifest.reviewAuthorizationSha256 !== sha256(authorizationSource) || manifest.experimentId !== authorization.experimentId) {
		throw new Error("Native complete-palette review authorization binding is invalid")
	}
	await verifyHashMap(projectRoot, manifest.provenance.experiment, "Review experiment provenance")
	await verifyHashMap(projectRoot, manifest.provenance.implementation, "Review implementation provenance")
	await verifyHashMap(projectRoot, manifest.provenance.presentation, "Review presentation provenance")
	for (const [path, expected] of Object.entries(authorization.boundPhase5)) {
		if (sha256(await readFile(resolve(projectRoot, path))) !== expected) {
			throw new Error(`Review-authorized Phase 5 artifact changed: ${path}`)
		}
	}
	const phase5 = await verifyNativeCompletePaletteArtifact(resolve(projectRoot, phase5Root), projectRoot)
	if (phase5.analysis.gateA.passed !== true || phase5.analysis.nextAuthorization !==
		"human-pause-1-no-review-artifacts-generated") throw new Error("Mechanical Gate A no longer authorizes review")
	const groupByPath = new Map<string, any>()
	for (const group of phase5.results.groups) for (const path of group.paths) groupByPath.set(path, group)
	const controlByPath = new Map(authorization.selection.controls.map((control) => [control.path, control]))
	const root = await realpath(projectRoot)
	for (const entry of manifest.entries) {
		const group = groupByPath.get(entry.source.file)
		if (!group || group.sourceSha256 !== entry.source.sha256 || group.bytes !== entry.source.bytes) {
			throw new Error(`Review source is not bound to the Phase 5 result: ${entry.source.file}`)
		}
		const sourcePath = await realpath(resolve(projectRoot, entry.source.file))
		if (!sourcePath.startsWith(`${root}${sep}`) || sha256(await readFile(sourcePath)) !== entry.source.sha256) {
			throw new Error(`Review source bytes changed: ${entry.source.file}`)
		}
		const scientific = group.scientific
		if (JSON.stringify(assignedOption(entry, "baseline")) !== JSON.stringify(presentPalette(scientific.canonicalPalette)) ||
			JSON.stringify(assignedOption(entry, "candidate")) !== JSON.stringify(presentPalette(scientific.palette)) ||
			JSON.stringify(entry.changedRoles) !== JSON.stringify(changedRoles(scientific.canonicalPalette, scientific.palette)) ||
			entry.gradientChanged !== scientific.gradientChanged || entry.materialChanged !== scientific.materialChanged) {
			throw new Error(`Review presentation differs from the Phase 5 result: ${entry.caseId}`)
		}
		if (entry.kind === "changed" || entry.kind === "hidden-repeat") {
			if (!authorization.selection.changedSourceSha256.includes(entry.source.sha256) || !scientific.exactChanged ||
				entry.kind === "hidden-repeat" && !authorization.selection.repeatSourceSha256.includes(entry.source.sha256)) {
				throw new Error(`Review changed-case selection is invalid: ${entry.caseId}`)
			}
		} else {
			const control = controlByPath.get(entry.source.file)
			if (!control || control.kind !== entry.kind || control.sourceSha256 !== entry.source.sha256 || scientific.exactChanged) {
				throw new Error(`Review control selection is invalid: ${entry.caseId}`)
			}
		}
	}
	const planPath = resolve(dirname(manifestPath), "plan.json")
	const plan = JSON.parse(await readFile(planPath, "utf8")) as Record<string, unknown>
	if (plan.schemaVersion !== 1 || plan.reviewVersion !== NATIVE_COMPLETE_PALETTE_REVIEW_VERSION ||
		plan.experimentId !== manifest.experimentId || plan.manifestId !== manifest.manifestId ||
		plan.manifestSha256 !== sha256(manifestSource) || plan.cases !== 15 || plan.batches !== 1 ||
		plan.reserveAccessed !== false) throw new Error("Native complete-palette review plan is invalid")
	return { manifest, authorization, phase5, plan, manifestSha256: sha256(manifestSource) }
}
