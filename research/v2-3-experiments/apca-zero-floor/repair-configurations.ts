/**
 * The coverage sets, priced separately, shared by the sweep worker and every report so the two can
 * never disagree about what a configuration name means.
 *
 * `enforced` is what triggers a repair and must come out clean. `protect` is what a repair may never
 * newly break. The two are separate because review treats the accent differently from text: the
 * `-accent-ok` variants protect only the text pairs, which permits a repair to push an unreadable
 * colour off the foreground and onto the accent — the cheap move, and by review's own account
 * nearly harmless, since the accent marks icons rather than words.
 */
import type { ZeroContrastPair } from "../../v2-3/src/internal/zero-contrast-repair.ts"

export const TEXT_PAIRS: readonly ZeroContrastPair[] = ["foreground-surface", "foreground-background"]
export const ACCENT_PAIRS: readonly ZeroContrastPair[] = ["accent-surface", "accent-background"]
export const ALL_PAIRS: readonly ZeroContrastPair[] = [...TEXT_PAIRS, ...ACCENT_PAIRS]

export type RepairConfiguration = Readonly<{
	enforced: readonly ZeroContrastPair[]
	protect: readonly ZeroContrastPair[]
}>

export const CONFIGURATIONS: Readonly<Record<string, RepairConfiguration>> = {
	"fg-surface": { enforced: ["foreground-surface"], protect: ALL_PAIRS },
	"fg-surface-accent-ok": { enforced: ["foreground-surface"], protect: TEXT_PAIRS },
	"fg-both": { enforced: TEXT_PAIRS, protect: ALL_PAIRS },
	"fg-both-accent-ok": { enforced: TEXT_PAIRS, protect: TEXT_PAIRS },
	"accent-only": { enforced: ACCENT_PAIRS, protect: ALL_PAIRS },
	"all-four": { enforced: ALL_PAIRS, protect: ALL_PAIRS },
}

/** The census field name each pair is measured under. */
export const PAIR_FIELD: Readonly<Record<ZeroContrastPair, string>> = {
	"foreground-surface": "fgSurface",
	"foreground-background": "fgBackground",
	"accent-surface": "accentSurface",
	"accent-background": "accentBackground",
}

/**
 * A collapsed role is the role it collapsed onto, so its pairs are not distinct claims. This must
 * agree with `pairApplies` in the runtime or the reports would count a different population than
 * the repair acts on.
 */
export function pairApplies(
	collapse: Readonly<{ surface: boolean; accent: boolean }>,
	pair: ZeroContrastPair,
): boolean {
	if (collapse.surface && (pair === "foreground-surface" || pair === "accent-surface")) return false
	if (collapse.accent && (pair === "accent-surface" || pair === "accent-background")) return false
	return true
}
