import { okDistance, rgbToOKLab } from "./color.ts"
import type { Palette, RGB, RoleName } from "./types.ts"

export const evidenceLedgerSchemaVersion = 1 as const
export const paletteSemanticVersion = "role-rgb-generated-gradient-v1" as const
export const defaultPerceptualThresholdVersion = "role-oklab-0.025-v1" as const

export const perceptualThresholds = {
	[defaultPerceptualThresholdVersion]: {
		roleOKLabDistanceInclusive: 0.025,
		requireGradientDecisionMatch: true,
	},
} as const

export type ArtworkId = `artwork:${string}`
export type PaletteId = `palette:${string}`
export type PerceptualThresholdVersion = keyof typeof perceptualThresholds
export type EvidenceOutcome = "positive" | "negative" | "preference-only"
export type PaletteMethod = "spatial" | "expressive" | "quantized"

export type SemanticRoleColor = {
	rgb: RGB
	generated: boolean
}

export type SemanticPalette = {
	background: SemanticRoleColor
	foreground: SemanticRoleColor
	surface: SemanticRoleColor
	accent: SemanticRoleColor
	gradient: boolean
}

export type SemanticPaletteInput = Pick<Palette, RoleName | "gradient">

export type PaletteSnapshot = {
	artworkId: ArtworkId
	file: string
	algorithmVersion: string
	method: PaletteMethod
	paletteId: PaletteId
	semantic: SemanticPalette
}

export type PaletteOutcome = {
	paletteId: PaletteId
	outcome: EvidenceOutcome
}

export type PalettePreference =
	| { kind: "preferred"; preferredPaletteId: PaletteId; otherPaletteId: PaletteId }
	| { kind: "tie" | "neither"; paletteIds: readonly [PaletteId, PaletteId] }

export type JudgmentEvent = {
	id: string
	artworkId: ArtworkId
	observedAt: string | null
	sources: string[]
	outcomes: PaletteOutcome[]
	preference?: PalettePreference
}

export type CarryEdge = {
	id: string
	artworkId: ArtworkId
	fromPaletteId: PaletteId
	toPaletteId: PaletteId
	fromAlgorithmVersion: string
	toAlgorithmVersion: string
	eventIds: string[]
	thresholdVersion: PerceptualThresholdVersion
	maximumRoleDistance: number
	exactSemanticMatch: boolean
}

export type EvidenceConflict = {
	artworkId: ArtworkId
	positivePaletteId: PaletteId
	negativePaletteId: PaletteId
	positiveEventIds: string[]
	negativeEventIds: string[]
	exactSemanticMatch: boolean
	maximumRoleDistance: number
	thresholdVersion: PerceptualThresholdVersion
}

export type AcceptedPaletteEvidence = {
	artworkId: ArtworkId
	paletteId: PaletteId
	directEventIds: string[]
	carriedEventIds: string[]
	conflicted: boolean
}

const roleNames = ["background", "foreground", "surface", "accent"] as const

function normalizedPath(file: string): string {
	const segments: string[] = []
	for (const segment of file.replaceAll("\\", "/").split("/")) {
		if (!segment || segment === ".") continue
		if (segment === "..") segments.pop()
		else segments.push(segment)
	}
	return segments.join("/")
}

export function stableArtworkId(file: string): ArtworkId {
	const normalized = normalizedPath(file)
	if (!normalized) throw new Error("Artwork file must not be empty")
	const name = normalized.slice(normalized.lastIndexOf("/") + 1)
	const spotify = /^ab67616d[0-9a-f]{8}([0-9a-f]+)(?:\.[^.]+)?$/i.exec(name)
	if (spotify) return `artwork:spotify:${spotify[1].toLowerCase()}`
	return `artwork:file:${normalized}`
}

function semanticRole(role: SemanticPaletteInput[RoleName], name: RoleName): SemanticRoleColor {
	if (!Array.isArray(role.rgb) || role.rgb.length !== 3 ||
		role.rgb.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
		throw new Error(`Palette ${name} RGB must contain three byte values`)
	}
	if (typeof role.generated !== "boolean") throw new Error(`Palette ${name} generated flag must be boolean`)
	return { rgb: [role.rgb[0], role.rgb[1], role.rgb[2]], generated: role.generated }
}

export function semanticPalette(palette: SemanticPaletteInput): SemanticPalette {
	if (typeof palette.gradient?.isGradient !== "boolean") throw new Error("Palette gradient decision must be boolean")
	return {
		background: semanticRole(palette.background, "background"),
		foreground: semanticRole(palette.foreground, "foreground"),
		surface: semanticRole(palette.surface, "surface"),
		accent: semanticRole(palette.accent, "accent"),
		gradient: palette.gradient.isGradient,
	}
}

function semanticPaletteKey(palette: SemanticPalette): string {
	const roles = roleNames.map((role) => {
		const color = palette[role]
		return `${role}=${color.rgb.join(",")},${color.generated ? 1 : 0}`
	})
	return `${paletteSemanticVersion}|${roles.join("|")}|gradient=${palette.gradient ? 1 : 0}`
}

function hasGradientEvidence(palette: SemanticPaletteInput | SemanticPalette): palette is SemanticPaletteInput {
	return typeof palette.gradient === "object" && palette.gradient !== null && "isGradient" in palette.gradient
}

export function semanticPaletteId(palette: SemanticPaletteInput | SemanticPalette): PaletteId {
	const value = hasGradientEvidence(palette) ? semanticPalette(palette) : palette
	return `palette:${semanticPaletteKey(value)}`
}

export function paletteSnapshot(input: {
	file: string
	algorithmVersion: string
	method: PaletteMethod
	palette: SemanticPaletteInput
}): PaletteSnapshot {
	const semantic = semanticPalette(input.palette)
	return {
		artworkId: stableArtworkId(input.file),
		file: normalizedPath(input.file),
		algorithmVersion: input.algorithmVersion,
		method: input.method,
		paletteId: semanticPaletteId(semantic),
		semantic,
	}
}

export type PerceptualPaletteComparison = {
	matches: boolean
	thresholdVersion: PerceptualThresholdVersion
	maximumRoleDistance: number
	roleDistances: Record<RoleName, number>
	gradientMatches: boolean
	exactSemanticMatch: boolean
}

export function compareSemanticPalettes(
	first: SemanticPalette,
	second: SemanticPalette,
	thresholdVersion: PerceptualThresholdVersion = defaultPerceptualThresholdVersion,
): PerceptualPaletteComparison {
	const threshold = perceptualThresholds[thresholdVersion]
	if (!threshold) throw new Error(`Unknown perceptual threshold version: ${thresholdVersion}`)
	const roleDistances = Object.fromEntries(roleNames.map((role) => [
		role,
		okDistance(rgbToOKLab(first[role].rgb), rgbToOKLab(second[role].rgb)),
	])) as Record<RoleName, number>
	const maximumRoleDistance = Math.max(...Object.values(roleDistances))
	const gradientMatches = first.gradient === second.gradient
	return {
		matches: maximumRoleDistance <= threshold.roleOKLabDistanceInclusive &&
			(!threshold.requireGradientDecisionMatch || gradientMatches),
		thresholdVersion,
		maximumRoleDistance,
		roleDistances,
		gradientMatches,
		exactSemanticMatch: semanticPaletteId(first) === semanticPaletteId(second),
	}
}

export function createCarryEdge(input: {
	artworkId: ArtworkId
	from: PaletteSnapshot
	to: PaletteSnapshot
	eventIds: readonly string[]
	thresholdVersion?: PerceptualThresholdVersion
}): CarryEdge | null {
	if (input.from.artworkId !== input.artworkId || input.to.artworkId !== input.artworkId) {
		throw new Error("Carry endpoints must belong to the edge artwork")
	}
	const thresholdVersion = input.thresholdVersion ?? defaultPerceptualThresholdVersion
	const comparison = compareSemanticPalettes(input.from.semantic, input.to.semantic, thresholdVersion)
	if (!comparison.matches) return null
	const eventIds = [...new Set(input.eventIds)].sort()
	return {
		id: [
			"carry:v1",
			input.artworkId,
			input.from.algorithmVersion,
			input.from.paletteId,
			input.to.algorithmVersion,
			input.to.paletteId,
			...eventIds,
		].join("|"),
		artworkId: input.artworkId,
		fromPaletteId: input.from.paletteId,
		toPaletteId: input.to.paletteId,
		fromAlgorithmVersion: input.from.algorithmVersion,
		toAlgorithmVersion: input.to.algorithmVersion,
		eventIds,
		thresholdVersion,
		maximumRoleDistance: comparison.maximumRoleDistance,
		exactSemanticMatch: comparison.exactSemanticMatch,
	}
}

function preferenceKey(preference: PalettePreference | undefined): string | null {
	if (!preference) return null
	return JSON.stringify(preference)
}

function normalizedOutcomes(eventId: string, outcomes: readonly PaletteOutcome[]): PaletteOutcome[] {
	const byPalette = new Map<PaletteId, EvidenceOutcome>()
	for (const outcome of outcomes) {
		const current = byPalette.get(outcome.paletteId)
		if (current !== undefined && current !== outcome.outcome) {
			throw new Error(`Judgment event ${eventId} has incompatible outcome evidence`)
		}
		byPalette.set(outcome.paletteId, outcome.outcome)
	}
	return [...byPalette].map(([paletteId, outcome]) => ({ paletteId, outcome }))
		.sort((first, second) => first.paletteId.localeCompare(second.paletteId) || first.outcome.localeCompare(second.outcome))
}

function outcomeKey(outcomes: readonly PaletteOutcome[]): string {
	return JSON.stringify(outcomes)
}

export function deduplicateJudgmentEvents(events: readonly JudgmentEvent[]): JudgmentEvent[] {
	const deduplicated = new Map<string, JudgmentEvent>()
	for (const event of events) {
		const outcomes = normalizedOutcomes(event.id, event.outcomes)
		const current = deduplicated.get(event.id)
		if (!current) {
			deduplicated.set(event.id, {
				...event,
				sources: [...new Set(event.sources)].sort(),
				outcomes,
			})
			continue
		}
		if (current.artworkId !== event.artworkId ||
			(current.observedAt !== null && event.observedAt !== null && current.observedAt !== event.observedAt)) {
			throw new Error(`Judgment event ${event.id} has inconsistent identity fields`)
		}
		if (preferenceKey(current.preference) !== null && preferenceKey(event.preference) !== null &&
			preferenceKey(current.preference) !== preferenceKey(event.preference)) {
			throw new Error(`Judgment event ${event.id} has inconsistent preference evidence`)
		}
		if (current.outcomes.length > 0 && outcomes.length > 0 && outcomeKey(current.outcomes) !== outcomeKey(outcomes)) {
			throw new Error(`Judgment event ${event.id} has incompatible outcome evidence`)
		}
		current.observedAt ??= event.observedAt
		current.preference ??= event.preference
		current.sources = [...new Set([...current.sources, ...event.sources])].sort()
		if (current.outcomes.length === 0) current.outcomes = outcomes
	}
	return [...deduplicated.values()].sort((first, second) =>
		(first.observedAt ?? "").localeCompare(second.observedAt ?? "") || first.id.localeCompare(second.id))
}

function paletteSnapshotIdentity(snapshot: PaletteSnapshot): string {
	return `${snapshot.algorithmVersion}\0${snapshot.artworkId}\0${snapshot.method}`
}

function paletteSnapshotValue(snapshot: PaletteSnapshot): string {
	return `${snapshot.artworkId}\0${snapshot.file}\0${snapshot.algorithmVersion}\0${snapshot.method}\0${snapshot.paletteId}\0${semanticPaletteKey(snapshot.semantic)}`
}

export function deduplicatePaletteSnapshots(palettes: readonly PaletteSnapshot[]): PaletteSnapshot[] {
	const deduplicated = new Map<string, PaletteSnapshot>()
	for (const palette of palettes) {
		const identity = paletteSnapshotIdentity(palette)
		const current = deduplicated.get(identity)
		if (current && paletteSnapshotValue(current) !== paletteSnapshotValue(palette)) {
			throw new Error(`Palette snapshot ${identity.replaceAll("\0", "|")} has incompatible duplicate data`)
		}
		deduplicated.set(identity, current ?? palette)
	}
	return [...deduplicated.values()]
}

type PropagatedEvidence = {
	artworkId: ArtworkId
	paletteId: PaletteId
	positive: Set<string>
	negative: Set<string>
	directPositive: Set<string>
	carriedPositive: Set<string>
}

function propagatedEvidence(events: readonly JudgmentEvent[], carryEdges: readonly CarryEdge[]): Map<string, PropagatedEvidence> {
	const evidence = new Map<string, PropagatedEvidence>()
	const get = (artworkId: ArtworkId, paletteId: PaletteId): PropagatedEvidence => {
		const key = `${artworkId}\0${paletteId}`
		let item = evidence.get(key)
		if (!item) {
			item = {
				artworkId,
				paletteId,
				positive: new Set(),
				negative: new Set(),
				directPositive: new Set(),
				carriedPositive: new Set(),
			}
			evidence.set(key, item)
		}
		return item
	}
	for (const event of deduplicateJudgmentEvents(events)) {
		for (const outcome of event.outcomes) {
			const item = get(event.artworkId, outcome.paletteId)
			if (outcome.outcome === "positive") {
				item.positive.add(event.id)
				item.directPositive.add(event.id)
			} else if (outcome.outcome === "negative") item.negative.add(event.id)
		}
	}

	let changed = true
	while (changed) {
		changed = false
		for (const edge of carryEdges) {
			const from = get(edge.artworkId, edge.fromPaletteId)
			const to = get(edge.artworkId, edge.toPaletteId)
			for (const eventId of edge.eventIds) {
				if (from.positive.has(eventId) && !to.positive.has(eventId)) {
					to.positive.add(eventId)
					to.carriedPositive.add(eventId)
					changed = true
				}
				if (from.negative.has(eventId) && !to.negative.has(eventId)) {
					to.negative.add(eventId)
					changed = true
				}
			}
		}
	}
	return evidence
}

export function acceptedSetFromEvents(
	events: readonly JudgmentEvent[],
	carryEdges: readonly CarryEdge[] = [],
	palettes: readonly PaletteSnapshot[] = [],
	thresholdVersion: PerceptualThresholdVersion = defaultPerceptualThresholdVersion,
): AcceptedPaletteEvidence[] {
	const conflictedPaletteKeys = new Set(findEvidenceConflicts(events, {
		carryEdges,
		palettes,
		thresholdVersion,
	}).map((conflict) => `${conflict.artworkId}\0${conflict.positivePaletteId}`))
	return [...propagatedEvidence(events, carryEdges).values()]
		.filter((item) => item.positive.size > 0)
		.map((item) => ({
			artworkId: item.artworkId,
			paletteId: item.paletteId,
			directEventIds: [...item.directPositive].sort(),
			carriedEventIds: [...item.carriedPositive].sort(),
			conflicted: conflictedPaletteKeys.has(`${item.artworkId}\0${item.paletteId}`),
		}))
		.sort((first, second) => first.artworkId.localeCompare(second.artworkId) || first.paletteId.localeCompare(second.paletteId))
}

export function findEvidenceConflicts(
	events: readonly JudgmentEvent[],
	options: {
		carryEdges?: readonly CarryEdge[]
		palettes?: readonly PaletteSnapshot[]
		thresholdVersion?: PerceptualThresholdVersion
	} = {},
): EvidenceConflict[] {
	const thresholdVersion = options.thresholdVersion ?? defaultPerceptualThresholdVersion
	const evidence = [...propagatedEvidence(events, options.carryEdges ?? []).values()]
	const semanticByPaletteId = new Map((options.palettes ?? []).map((palette) => [palette.paletteId, palette.semantic]))
	const conflicts: EvidenceConflict[] = []
	const positives = evidence.filter((item) => item.positive.size > 0)
	const negatives = evidence.filter((item) => item.negative.size > 0)
	for (const positive of positives) {
		for (const negative of negatives) {
			if (positive.artworkId !== negative.artworkId) continue
			const exactSemanticMatch = positive.paletteId === negative.paletteId
			let maximumRoleDistance = exactSemanticMatch ? 0 : Infinity
			let matches = exactSemanticMatch
			const positivePalette = semanticByPaletteId.get(positive.paletteId)
			const negativePalette = semanticByPaletteId.get(negative.paletteId)
			if (!matches && positivePalette && negativePalette) {
				const comparison = compareSemanticPalettes(positivePalette, negativePalette, thresholdVersion)
				matches = comparison.matches
				maximumRoleDistance = comparison.maximumRoleDistance
			}
			if (!matches) continue
			conflicts.push({
				artworkId: positive.artworkId,
				positivePaletteId: positive.paletteId,
				negativePaletteId: negative.paletteId,
				positiveEventIds: [...positive.positive].sort(),
				negativeEventIds: [...negative.negative].sort(),
				exactSemanticMatch,
				maximumRoleDistance,
				thresholdVersion,
			})
		}
	}
	return conflicts.sort((first, second) => first.artworkId.localeCompare(second.artworkId) ||
		first.positivePaletteId.localeCompare(second.positivePaletteId) ||
		first.negativePaletteId.localeCompare(second.negativePaletteId))
}

export type AcceptedSetMatch = {
	accepted: boolean
	thresholdVersion: PerceptualThresholdVersion
	matches: Array<{
		paletteId: PaletteId
		exactSemanticMatch: boolean
		maximumRoleDistance: number
	}>
}

export function matchAcceptedSet(
	candidate: SemanticPaletteInput | SemanticPalette,
	accepted: readonly (SemanticPaletteInput | SemanticPalette)[],
	thresholdVersion: PerceptualThresholdVersion = defaultPerceptualThresholdVersion,
): AcceptedSetMatch {
	const candidateSemantic = hasGradientEvidence(candidate) ? semanticPalette(candidate) : candidate
	const matches = accepted.flatMap((palette) => {
		const acceptedSemantic = hasGradientEvidence(palette) ? semanticPalette(palette) : palette
		const comparison = compareSemanticPalettes(candidateSemantic, acceptedSemantic, thresholdVersion)
		return comparison.matches ? [{
			paletteId: semanticPaletteId(acceptedSemantic),
			exactSemanticMatch: comparison.exactSemanticMatch,
			maximumRoleDistance: comparison.maximumRoleDistance,
		}] : []
	}).sort((first, second) => first.maximumRoleDistance - second.maximumRoleDistance ||
		first.paletteId.localeCompare(second.paletteId))
	return { accepted: matches.length > 0, thresholdVersion, matches }
}

export function buildEvidenceLedger(input: {
	palettes: readonly PaletteSnapshot[]
	events: readonly JudgmentEvent[]
	carryEdges?: readonly CarryEdge[]
	thresholdVersion?: PerceptualThresholdVersion
}) {
	const thresholdVersion = input.thresholdVersion ?? defaultPerceptualThresholdVersion
	const palettes = deduplicatePaletteSnapshots(input.palettes)
	const events = deduplicateJudgmentEvents(input.events)
	const carryEdges = [...new Map((input.carryEdges ?? []).map((edge) => [edge.id, edge])).values()]
		.sort((first, second) => first.id.localeCompare(second.id))
	return {
		schemaVersion: evidenceLedgerSchemaVersion,
		thresholdVersion,
		palettes,
		events,
		carryEdges,
		acceptedSet: acceptedSetFromEvents(events, carryEdges, palettes, thresholdVersion),
		conflicts: findEvidenceConflicts(events, { palettes, carryEdges, thresholdVersion }),
	}
}
