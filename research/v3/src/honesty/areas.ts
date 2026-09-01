/**
 * Working areas for the parameter-honesty census, and which of them are *gated*.
 *
 * The census counts tunable sites over the whole of `src/` and `oracle/`, which makes the headline a
 * tree-wide number. That is the right headline and the wrong unit of action: nobody owns "the tree".
 * `CONVENTIONS.md` assigns every path to exactly one workstream, so the natural reporting unit — and
 * the natural unit of a growth rule — is the **working area**: the top-level directory under a scan
 * root that a single workstream owns.
 *
 * ## Why a gate flag exists, and why nothing is gated yet
 *
 * A growth check that fires on the whole tree is a check nobody can act on, because any workstream's
 * new file can trip another workstream's build. A growth check per area is actionable. But applying
 * it to every area at once, in Phase 0, would freeze areas that are still being written — the
 * untagged count in a young area is *supposed* to move while it is drafted, and a rule that punishes
 * that teaches people to write untagged constants somewhere else.
 *
 * So the gate is a per-area opt-in, and **Phase 0 sets every area to `INFORMATIONAL`** (the
 * reviewer's ruling on build item 15). The machinery is real, the report is complete, and no area
 * fails a growth check until someone deliberately promotes it. Promotion is a one-word edit here,
 * which is exactly how visible it should be.
 *
 * ## Why the list is explicit rather than derived
 *
 * `areaOf()` could derive area names from paths alone and never need this table. The table exists so
 * that a **new** area is a visible event: an area not listed here is reported with
 * `configured: false`, which is a reader-facing signal that a directory appeared without anyone
 * deciding what it is. A derived-only design would absorb new directories silently, which is the
 * failure mode this whole instrument exists to prevent.
 *
 * The one exception is `AREA_PREFIX_CONFIG`, for a root whose subdirectories are minted by the
 * campaign rather than named here; the reasoning for why explicitness buys nothing there is on that
 * declaration.
 */

/**
 * What a growth regression in this area means.
 *
 * `GATED` — the area's untagged count must not grow; `growth.ts` reports a regression and the local
 * test fails.
 * `INFORMATIONAL` — counted, reported, never fails anything.
 */
export type AreaGate = "GATED" | "INFORMATIONAL"

export interface AreaConfig {
	/** POSIX path prefix relative to `research/v3`, e.g. `src/contract`. */
	area: string
	gate: AreaGate
	/** The `CONVENTIONS.md` path-ownership row this area belongs to, for the report's blame column. */
	workstream: string
}

/**
 * A rule that configures every area under one scan root at once, by path prefix.
 *
 * The exception to "the list is explicit": see `AREA_PREFIX_CONFIG` for when that is the honest
 * shape and when it is not.
 */
export interface AreaPrefixConfig {
	/** POSIX prefix an area name must start with, e.g. `prototypes/`. Include the trailing slash. */
	prefix: string
	gate: AreaGate
	workstream: string
}

/**
 * Every working area under the scan roots, with its Phase 0 gate.
 *
 * `[REVIEWED]` — the areas are the `CONVENTIONS.md` path-ownership table's rows intersected with the
 * census scan roots (`src/`, `oracle/`); the uniform `INFORMATIONAL` setting is the reviewer's
 * ruling on build item 15, recorded 2026-08-04: per-area reporting now, gating later, and the growth
 * check is a normal local test rather than a CI dependency.
 *
 * **Three areas have no `CONVENTIONS.md` ownership row** and are labelled as such rather than given a
 * plausible-looking owner: `src/devloop`, `src/robustness`, `src/stats`. They were found by this
 * table's own unconfigured-area warning on its first run, which is the mechanism working as intended
 * — `CONVENTIONS.md` §"Path ownership" already records that an unowned path is a write collision
 * waiting to happen, and these three are exactly that. Assigning them is a housekeeping decision, not
 * this instrument's to make; the placeholder workstream strings say plainly that nobody has.
 */
export const AREA_CONFIG: readonly AreaConfig[] = [
	{ area: "oracle/bakeoff", gate: "INFORMATIONAL", workstream: "oracle — bakeoff" },
	{ area: "oracle/embeddings", gate: "INFORMATIONAL", workstream: "embeddings" },
	{ area: "oracle/ladder", gate: "INFORMATIONAL", workstream: "oracle — ladder" },
	{ area: "oracle/premise", gate: "INFORMATIONAL", workstream: "oracle — premise" },
	{ area: "oracle/sam", gate: "INFORMATIONAL", workstream: "oracle — SAM" },
	{ area: "src/adjudication", gate: "INFORMATIONAL", workstream: "adjudication" },
	{ area: "src/calibration-consequence", gate: "INFORMATIONAL", workstream: "calibration consequence" },
	{ area: "src/contract", gate: "INFORMATIONAL", workstream: "contract schema + gates" },
	{ area: "src/coverage-set", gate: "INFORMATIONAL", workstream: "coverage set" },
	{ area: "src/devloop", gate: "INFORMATIONAL", workstream: "dev loop / code version (no CONVENTIONS row)" },
	{ area: "src/holdout", gate: "INFORMATIONAL", workstream: "holdout freeze" },
	{ area: "src/honesty", gate: "INFORMATIONAL", workstream: "parameter honesty" },
	{ area: "src/legacy", gate: "INFORMATIONAL", workstream: "legacy distillation" },
	{ area: "src/provenance", gate: "INFORMATIONAL", workstream: "result fingerprints" },
	{ area: "src/review-server", gate: "INFORMATIONAL", workstream: "review server" },
	{ area: "src/robustness", gate: "INFORMATIONAL", workstream: "robustness comparison (no CONVENTIONS row)" },
	{ area: "src/stats", gate: "INFORMATIONAL", workstream: "shared statistics (no CONVENTIONS row)" },
	{ area: "src/tagging", gate: "INFORMATIONAL", workstream: "tagging" },
	{ area: "src/warehouse", gate: "INFORMATIONAL", workstream: "warehouse + query CLI" },
]

/**
 * Areas configured by prefix rather than by name, for roots whose subdirectories are created by the
 * campaign rather than by this table.
 *
 * `[REVIEWED]` — added 2026-08-04, after `prototypes/` joined `SCAN_ROOTS` (commit 1491622). Phase 2
 * prototypes live at `prototypes/<slug>/`, one slug per prototype worktree, and the slugs are minted
 * when `PHASE_2_HANDOFF.md` §6's six orchestrators are spawned — they are not knowable here, so an
 * explicit row per slug would be a table that is always one prototype out of date, and every slug
 * would arrive reported as `unassigned`.
 *
 * The explicitness argument in this file's header does not apply to this root, and the difference is
 * the point. Under `src/` and `oracle/`, a new directory means *someone made an ownership decision
 * nobody recorded*, which is worth a warning. Under `prototypes/`, a new directory means a prototype
 * orchestrator started work — the ownership decision was already made, in the brief, and it is the
 * same decision for every slug: the orchestrator owns its own subtree
 * (`phase-2/PROTOTYPE_ORCHESTRATOR_BRIEF.md`, and `PHASE_2_HANDOFF.md` §6.2 on per-prototype path
 * ownership). A warning that fires identically for all six carries no information.
 *
 * `INFORMATIONAL` like every other area in Phase 0, and doubly so here: a prototype's constants are
 * *supposed* to churn while it is being written, which is the exact case the gate opt-in exists for.
 */
export const AREA_PREFIX_CONFIG: readonly AreaPrefixConfig[] = [
	{ prefix: "prototypes/", gate: "INFORMATIONAL", workstream: "phase-2 prototype orchestrators" },
]

/**
 * How many path segments make an area: `src/contract/invariants.ts` -> `src/contract`.
 *
 * `[REVIEWED]` — one level under a scan root is exactly the granularity `CONVENTIONS.md` assigns
 * ownership at, so an area always has exactly one owner. Going deeper would split a single
 * workstream across several rows; going shallower would pool every workstream into `src`.
 */
const AREA_DEPTH = 2

/**
 * The area a scanned file belongs to.
 *
 * A file sitting directly in a scan root (`src/thing.ts`, with no owning subdirectory) has no area
 * under the depth rule. It gets `<root>/(root)` rather than being dropped: an unowned file at the
 * top of a scan root is precisely the kind of thing that should show up in a report, not vanish
 * from one.
 */
export function areaOf(file: string): string {
	const segments = file.split("/")
	if (segments.length > AREA_DEPTH) return segments.slice(0, AREA_DEPTH).join("/")
	return `${segments[0]}/(root)`
}

const AREA_INDEX = new Map(AREA_CONFIG.map((entry) => [entry.area, entry]))

/**
 * The configured gate for an area.
 *
 * Named entries win over prefix rules, so a prefix root can still have one slug called out by name
 * later without deleting the rule.
 *
 * An area matched by neither is `INFORMATIONAL` and `configured: false`. Defaulting an unknown area
 * to `GATED` would be the stricter choice and the wrong one — it would fail a build the moment
 * someone creates a directory, which teaches people to avoid the census rather than to tag
 * constants.
 */
export function gateFor(area: string): { gate: AreaGate; workstream: string; configured: boolean } {
	const found = AREA_INDEX.get(area)
	if (found) return { gate: found.gate, workstream: found.workstream, configured: true }
	const prefixed = AREA_PREFIX_CONFIG.find((entry) => area.startsWith(entry.prefix))
	if (prefixed) return { gate: prefixed.gate, workstream: prefixed.workstream, configured: true }
	return { gate: "INFORMATIONAL", workstream: "unassigned", configured: false }
}
