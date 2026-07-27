import { isDeepStrictEqual } from "node:util"
import { okDistance, rgbToOKLab } from "./color.ts"
import {
	extractNextPaletteIncumbentAccentWithContext,
	NEXT_PALETTE_INCUMBENT_ACCENT_ALGORITHM_VERSION,
	type NextPaletteIncumbentAccentCertificate,
} from "./next-palette-incumbent-accent.ts"
import type { Palette, RawImage, RoleName } from "./types.ts"

export const NEXT_PALETTE_NARROWED_ACCENT_ALGORITHM_VERSION =
	"region-graph-next-narrowed-accent-0.2.0-development"

export const NEXT_PALETTE_NARROWED_ACCENT_POLICY = Object.freeze({
	version: "next-palette-narrowed-accent-policy-0.2.0-development",
	predecessorAlgorithmVersion: NEXT_PALETTE_INCUMBENT_ACCENT_ALGORITHM_VERSION,
	minimumAccentDistanceFromFrozenRole: 0.025,
	largeAccentMoveDistance: 0.2,
	minimumIdentitySupportGainForLargeMove: 0.02,
	foregroundCollapseAllowed: false,
	fixedApcaAdmissionFloor: null,
	comparisonEpsilon: 1e-12,
})

export type NextPaletteNarrowedAccentCertificate = {
	schemaVersion: 1
	algorithmVersion: typeof NEXT_PALETTE_NARROWED_ACCENT_ALGORITHM_VERSION
	predecessorAlgorithmVersion: typeof NEXT_PALETTE_INCUMBENT_ACCENT_ALGORITHM_VERSION
	policy: typeof NEXT_PALETTE_NARROWED_ACCENT_POLICY
	predecessor: {
		selectedOptionId: string | null
		changed: boolean
		material: boolean
		accentDistance: number
		identitySupportDelta: number
		provenanceKind: "connected-family-local" | "foreground-collapse" | null
	}
	distanceFromFrozenRole: Record<Exclude<RoleName, "accent">, number>
	minimumDistanceFromFrozenRole: number
	guards: {
		connectedFamilyOnly: boolean
		roleSeparation: boolean
		largeMoveIdentityGain: boolean
		collateralRolesFrozen: boolean
	}
	failedGuards: readonly string[]
	selected: {
		optionId: string | null
		changed: boolean
		material: boolean
		suppressedPredecessor: boolean
	}
	invariants: {
		incumbentIsCanonical019: true
		backgroundFrozen: true
		foregroundFrozen: true
		surfaceFrozen: true
		gradientFrozen: true
		onlyAccentMayChange: true
		predecessorOutputOrExactCanonical: true
		foregroundCollapseAbsent: true
		minimumFrozenRoleDistanceEnforced: true
		largeMoveIdentityGainEnforced: true
		fixedApcaFloorAbsent: true
	}
}

export type NextPaletteNarrowedAccentResult = {
	palette: Palette
	certificate: NextPaletteNarrowedAccentCertificate
}

export type NextPaletteNarrowedAccentContext = NextPaletteNarrowedAccentResult & {
	canonicalExtraction: ReturnType<typeof extractNextPaletteIncumbentAccentWithContext>["canonicalExtraction"]
	predecessorCertificate: NextPaletteIncumbentAccentCertificate
}

const frozenRoles = ["background", "foreground", "surface"] as const

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value
	for (const child of Object.values(value)) deepFreeze(child)
	return Object.freeze(value)
}

export function extractNextPaletteNarrowedAccentWithContext(image: RawImage): NextPaletteNarrowedAccentContext {
	const predecessor = extractNextPaletteIncumbentAccentWithContext(image)
	const canonical = predecessor.canonicalExtraction.methods.spatial
	const predecessorSelection = predecessor.certificate.selected
	const predecessorOption = predecessor.certificate.options.find((option) =>
		option.optionId === predecessorSelection.optionId) ?? null
	const accentLab = rgbToOKLab(predecessor.palette.accent.rgb)
	const distanceFromFrozenRole = Object.fromEntries(frozenRoles.map((role) =>
		[role, okDistance(accentLab, rgbToOKLab(canonical[role].rgb))])) as Record<typeof frozenRoles[number], number>
	const minimumDistanceFromFrozenRole = Math.min(...Object.values(distanceFromFrozenRole))
	const guards = {
		connectedFamilyOnly: !predecessorSelection.changed || predecessorOption?.provenance.kind === "connected-family-local",
		roleSeparation: !predecessorSelection.changed || minimumDistanceFromFrozenRole +
			NEXT_PALETTE_NARROWED_ACCENT_POLICY.comparisonEpsilon >=
			NEXT_PALETTE_NARROWED_ACCENT_POLICY.minimumAccentDistanceFromFrozenRole,
		largeMoveIdentityGain: !predecessorSelection.changed ||
			predecessorSelection.accentDistance <= NEXT_PALETTE_NARROWED_ACCENT_POLICY.largeAccentMoveDistance ||
			predecessorSelection.identitySupportDelta + NEXT_PALETTE_NARROWED_ACCENT_POLICY.comparisonEpsilon >=
				NEXT_PALETTE_NARROWED_ACCENT_POLICY.minimumIdentitySupportGainForLargeMove,
		collateralRolesFrozen: frozenRoles.every((role) => isDeepStrictEqual(predecessor.palette[role], canonical[role])) &&
			isDeepStrictEqual(predecessor.palette.gradient, canonical.gradient),
	}
	const failedGuards = Object.entries(guards).filter(([, pass]) => !pass).map(([name]) => name).sort()
	const accepted = predecessorSelection.changed && failedGuards.length === 0
	const palette = accepted ? predecessor.palette : canonical
	for (const role of frozenRoles) {
		if (!isDeepStrictEqual(palette[role], canonical[role])) throw new Error(`Narrowed accent changed frozen role: ${role}`)
	}
	if (!isDeepStrictEqual(palette.gradient, canonical.gradient)) throw new Error("Narrowed accent changed frozen gradient")

	return deepFreeze({
		palette,
		canonicalExtraction: predecessor.canonicalExtraction,
		predecessorCertificate: predecessor.certificate,
		certificate: {
			schemaVersion: 1,
			algorithmVersion: NEXT_PALETTE_NARROWED_ACCENT_ALGORITHM_VERSION,
			predecessorAlgorithmVersion: NEXT_PALETTE_INCUMBENT_ACCENT_ALGORITHM_VERSION,
			policy: NEXT_PALETTE_NARROWED_ACCENT_POLICY,
			predecessor: {
				selectedOptionId: predecessorSelection.optionId,
				changed: predecessorSelection.changed,
				material: predecessorSelection.material,
				accentDistance: predecessorSelection.accentDistance,
				identitySupportDelta: predecessorSelection.identitySupportDelta,
				provenanceKind: predecessorOption?.provenance.kind ?? null,
			},
			distanceFromFrozenRole,
			minimumDistanceFromFrozenRole,
			guards,
			failedGuards,
			selected: {
				optionId: accepted ? predecessorSelection.optionId : null,
				changed: accepted,
				material: accepted && predecessorSelection.material,
				suppressedPredecessor: predecessorSelection.changed && !accepted,
			},
			invariants: {
				incumbentIsCanonical019: true,
				backgroundFrozen: true,
				foregroundFrozen: true,
				surfaceFrozen: true,
				gradientFrozen: true,
				onlyAccentMayChange: true,
				predecessorOutputOrExactCanonical: true,
				foregroundCollapseAbsent: true,
				minimumFrozenRoleDistanceEnforced: true,
				largeMoveIdentityGainEnforced: true,
				fixedApcaFloorAbsent: true,
			},
		},
	})
}

export function extractNextPaletteNarrowedAccent(image: RawImage): NextPaletteNarrowedAccentResult {
	const { canonicalExtraction: _canonicalExtraction, predecessorCertificate: _predecessorCertificate, ...result } =
		extractNextPaletteNarrowedAccentWithContext(image)
	return result
}
