import { createHash } from "node:crypto"
import { lstat, readFile, realpath } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { namePalette } from "./src/color-name.ts"
import {
	contrastRatio,
	okDistance,
	rgbToHex,
	rgbToOKLab,
	roleMinimumDistance,
} from "./src/color.ts"
import { harmonicConjunction } from "./src/field-relation.ts"
import {
	buildNativeFieldHypothesisGraph,
	queryNativeFieldFamiliesAndTopology,
	type NativeFieldFamilyNode,
	type NativeFieldHypothesisGraph,
	type NativeFieldRelationRecord,
} from "./src/native-field-hypothesis-graph.ts"
import { loadNativeImage } from "./src/native-resolution-image.ts"
import type { NextPalettePresentedPalette } from "./src/next-palette-review-v2.ts"
import type { RGB } from "./src/types.ts"

type RoleInput = { rgb: RGB; generated: boolean; sourceDistance: number }
type Payload = { sourceSha256: string; foreground: RoleInput; accent: RoleInput }
type RelationCandidate = {
	relation: NativeFieldRelationRecord
	background: NativeFieldFamilyNode
	surface: NativeFieldFamilyNode
	backgroundRgb: RGB
	surfaceRgb: RGB
	oneFieldSupport: number
	twoFieldSupport: number
	pairSupport: number
}

function compareAscii(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0
}

function sameRgb(first: RGB, second: RGB): boolean {
	return first.every((channel, index) => channel === second[index])
}

function role(value: unknown, label: string): RoleInput {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid`)
	const candidate = value as RoleInput
	if (!Array.isArray(candidate.rgb) || candidate.rgb.length !== 3 || candidate.rgb.some((channel) =>
		!Number.isInteger(channel) || channel < 0 || channel > 255) || typeof candidate.generated !== "boolean" ||
		typeof candidate.sourceDistance !== "number" || !Number.isFinite(candidate.sourceDistance) || candidate.sourceDistance < 0) {
		throw new Error(`${label} is invalid`)
	}
	return {
		rgb: [candidate.rgb[0], candidate.rgb[1], candidate.rgb[2]],
		generated: candidate.generated,
		sourceDistance: candidate.sourceDistance,
	}
}

function parsePayload(source: string): Payload {
	const value = JSON.parse(source) as unknown
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Controlled candidate payload is invalid")
	const candidate = value as Record<string, unknown>
	if (Object.keys(candidate).sort().join(",") !== "accent,foreground,sourceSha256" ||
		typeof candidate.sourceSha256 !== "string" || !/^[a-f0-9]{64}$/.test(candidate.sourceSha256)) {
		throw new Error("Controlled candidate payload is invalid")
	}
	return {
		sourceSha256: candidate.sourceSha256,
		foreground: role(candidate.foreground, "Controlled foreground"),
		accent: role(candidate.accent, "Controlled accent"),
	}
}

function centerRgb(family: NativeFieldFamilyNode): RGB {
	const representative = family.representatives.find((candidate) => candidate.stableKey === family.centerRepresentativeKey)
	if (!representative) throw new Error(`Family ${family.stableKey} has no center representative`)
	return [...representative.rgb]
}

function relationCandidates(graph: NativeFieldHypothesisGraph, foreground: RGB): RelationCandidate[] {
	const families = new Map(graph.families.filter((family) => family.kind === "primary-field").map((family) =>
		[family.stableKey, family]))
	const collapsed = new Map(graph.hypotheses.filter((hypothesis) => hypothesis.state === "collapsed").map((hypothesis) =>
		[hypothesis.backgroundFamilyStableKey, hypothesis.oneFieldFit.mean]))
	return graph.relations.map((relation): RelationCandidate | null => {
		const background = families.get(relation.backgroundFamilyStableKey)
		const surface = families.get(relation.surfaceFamilyStableKey)
		if (!background || !surface) return null
		const backgroundRgb = centerRgb(background)
		const surfaceRgb = centerRgb(surface)
		const pairSupport = harmonicConjunction([
			relation.scale.twoFieldFit.mean,
			relation.scale.incrementalSurfaceIdentity.mean,
		])
		const candidate = {
			relation,
			background,
			surface,
			backgroundRgb,
			surfaceRgb,
			oneFieldSupport: collapsed.get(background.stableKey)!,
			twoFieldSupport: pairSupport,
			pairSupport,
		}
		return relation.endpointDistance >= 0.04 && !sameRgb(backgroundRgb, surfaceRgb) &&
			relation.scale.twoFieldFit.mean >= 0.025 && relation.scale.incrementalSurfaceIdentity.mean >= 0.025 &&
			contrastRatio(foreground, backgroundRgb) >= 2.5 && contrastRatio(foreground, surfaceRgb) >= 2.5
			? candidate
			: null
	}).filter((candidate): candidate is RelationCandidate => candidate !== null)
}

function fieldRole(rgb: RGB) {
	return { rgb: [...rgb] as RGB, hex: rgbToHex(rgb).toLowerCase(), generated: false, sourceDistance: 0 }
}

function retainedRole(value: RoleInput) {
	return { ...value, rgb: [...value.rgb] as RGB, hex: rgbToHex(value.rgb).toLowerCase() }
}

function presentation(
	backgroundRgb: RGB,
	surfaceRgb: RGB,
	foreground: RoleInput,
	accent: RoleInput,
	gradient: boolean,
	gradientScore: number,
): NextPalettePresentedPalette {
	const roles = {
		background: fieldRole(backgroundRgb),
		foreground: retainedRole(foreground),
		surface: fieldRole(surfaceRgb),
		accent: retainedRole(accent),
	}
	const names = namePalette((["background", "foreground", "surface", "accent"] as const).map((name) => roles[name].rgb))
	const sourceDistances = Object.values(roles).map((entry) => entry.sourceDistance)
	return {
		roles: Object.fromEntries((["background", "foreground", "surface", "accent"] as const).map((name, index) => [
			name,
			{ ...roles[name], nearestName: names[index].nearestName },
		])) as NextPalettePresentedPalette["roles"],
		gradient: { isGradient: gradient, confidence: gradient ? gradientScore : 1 - gradientScore },
		metrics: {
			foregroundContrast: contrastRatio(foreground.rgb, backgroundRgb),
			foregroundSurfaceContrast: contrastRatio(foreground.rgb, surfaceRgb),
			accentContrast: contrastRatio(accent.rgb, backgroundRgb),
			accentSurfaceContrast: contrastRatio(accent.rgb, surfaceRgb),
			minimumRoleDistance: roleMinimumDistance(Object.values(roles).map((entry) => rgbToOKLab(entry.rgb))),
			meanSourceDistance: sourceDistances.reduce((sum, value) => sum + value, 0) / sourceDistances.length,
			meanReconstructionError: sourceDistances.reduce((sum, value) => sum + value, 0) / sourceDistances.length,
		},
	}
}

async function evaluate(projectRoot: string, relativePath: string, payload: Payload) {
	if (!/^images\/[^/\\]+$/.test(relativePath) || basename(relativePath) !== relativePath.slice("images/".length)) {
		throw new Error("Controlled candidate child accepts only direct images sources")
	}
	const path = join(projectRoot, relativePath)
	const metadata = await lstat(path)
	if (!metadata.isFile() || metadata.isSymbolicLink() || await realpath(path) !== path) {
		throw new Error("Controlled candidate source must be a regular physical file")
	}
	const source = await readFile(path)
	const sourceSha256 = createHash("sha256").update(source).digest("hex")
	if (sourceSha256 !== payload.sourceSha256) throw new Error(`Controlled candidate source changed: ${relativePath}`)
	const startedAt = performance.now()
	const native = await loadNativeImage(source)
	const graph = buildNativeFieldHypothesisGraph(native, sourceSha256)
	const candidates = relationCandidates(graph, payload.foreground.rgb)
	if (candidates.length < 2) {
		return {
			schemaVersion: 1 as const,
			status: "ineligible" as const,
			source: { relativePath, sha256: sourceSha256, bytes: source.byteLength, width: native.width, height: native.height },
			reason: "insufficient-distinct-field-relations",
			resource: { elapsedMs: performance.now() - startedAt, maximumRssBytes: process.resourceUsage().maxRSS * 1024 },
		}
	}
	const primary = [...candidates].sort((first, second) =>
		Math.abs(first.oneFieldSupport - first.twoFieldSupport) - Math.abs(second.oneFieldSupport - second.twoFieldSupport) ||
		Math.min(second.oneFieldSupport, second.twoFieldSupport) - Math.min(first.oneFieldSupport, first.twoFieldSupport) ||
		compareAscii(first.relation.stableKey, second.relation.stableKey))[0]
	const challenger = [...candidates].filter((candidate) =>
		candidate.background.stableKey !== primary.background.stableKey &&
		candidate.surface.stableKey !== primary.surface.stableKey &&
		!sameRgb(candidate.backgroundRgb, primary.backgroundRgb) && !sameRgb(candidate.surfaceRgb, primary.surfaceRgb))
		.sort((first, second) =>
			Math.abs(first.pairSupport - primary.pairSupport) - Math.abs(second.pairSupport - primary.pairSupport) ||
			second.pairSupport - first.pairSupport || compareAscii(first.relation.stableKey, second.relation.stableKey))[0]
	if (!challenger) {
		return {
			schemaVersion: 1 as const,
			status: "ineligible" as const,
			source: { relativePath, sha256: sourceSha256, bytes: source.byteLength, width: native.width, height: native.height },
			reason: "no-independent-pair-challenger",
			resource: { elapsedMs: performance.now() - startedAt, maximumRssBytes: process.resourceUsage().maxRSS * 1024 },
		}
	}
	const topologyResult = queryNativeFieldFamiliesAndTopology(native, sourceSha256,
		[primary.backgroundRgb, primary.surfaceRgb], [{
			backgroundRgb: primary.backgroundRgb,
			surfaceRgb: primary.surfaceRgb,
		}])
	const topology = topologyResult.topologyQueries[0]
	if (topology.status !== "mapped") {
		return {
			schemaVersion: 1 as const,
			status: "ineligible" as const,
			source: { relativePath, sha256: sourceSha256, bytes: source.byteLength, width: native.width, height: native.height },
			reason: `topology-${topology.status}`,
			resource: { elapsedMs: performance.now() - startedAt, maximumRssBytes: process.resourceUsage().maxRSS * 1024 },
		}
	}
	const gradientScore = topology.observation224.score
	return {
		schemaVersion: 1 as const,
		status: "eligible" as const,
		source: { relativePath, sha256: sourceSha256, bytes: source.byteLength, width: native.width, height: native.height },
		stratum: `${topology.observation224.eligible ? "gradient" : "flat"}|${primary.twoFieldSupport >= primary.oneFieldSupport ? "two" : "one"}`,
		selection: {
			primary: {
				relationStableKey: primary.relation.stableKey,
				backgroundFamilyStableKey: primary.background.stableKey,
				surfaceFamilyStableKey: primary.surface.stableKey,
				oneFieldSupport: primary.oneFieldSupport,
				twoFieldSupport: primary.twoFieldSupport,
			},
			challenger: {
				relationStableKey: challenger.relation.stableKey,
				backgroundFamilyStableKey: challenger.background.stableKey,
				surfaceFamilyStableKey: challenger.surface.stableKey,
				pairSupport: challenger.pairSupport,
			},
			topology,
		},
		presentations: {
			pairPrimary: presentation(primary.backgroundRgb, primary.surfaceRgb, payload.foreground, payload.accent, false, gradientScore),
			pairChallenger: presentation(challenger.backgroundRgb, challenger.surfaceRgb, payload.foreground, payload.accent, false, gradientScore),
			collapsed: presentation(primary.backgroundRgb, primary.backgroundRgb, payload.foreground, payload.accent, false, gradientScore),
			twoField: presentation(primary.backgroundRgb, primary.surfaceRgb, payload.foreground, payload.accent, false, gradientScore),
			flat: presentation(primary.backgroundRgb, primary.surfaceRgb, payload.foreground, payload.accent, false, gradientScore),
			gradient: presentation(primary.backgroundRgb, primary.surfaceRgb, payload.foreground, payload.accent, true, gradientScore),
		},
		resource: { elapsedMs: performance.now() - startedAt, maximumRssBytes: process.resourceUsage().maxRSS * 1024 },
	}
}

async function main() {
	const relativePath = process.argv[2]
	const payloadSource = process.argv[3]
	if (!relativePath || !payloadSource || process.argv.length !== 4) {
		throw new Error("Expected one images source and controlled candidate payload")
	}
	const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))
	process.stdout.write(`${JSON.stringify(await evaluate(projectRoot, relativePath, parsePayload(payloadSource)))}\n`)
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
	main().catch((error) => {
		process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
		process.exitCode = 1
	})
}
