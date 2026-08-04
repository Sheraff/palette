/**
 * Every tunable number the reachability falsifier uses, in one place, each with a provenance tag.
 *
 * `SPEC.md` binding rule: "Every tunable constant is a named export with a provenance tag
 * (`[REVIEWED]|[MEASURED]|[FITTED]|[n=1]|[INHERITED]|[UNCALIBRATED]|[HELD]`) and a doc comment.
 * `[UNCALIBRATED]` is the honest default for cycle-1 guesses — say so loudly."
 *
 * Nothing in this file is a threshold the harness applies silently: the falsifier share is printed
 * beside every rate it judges, and the area floor is echoed on every row with the source it came
 * from.
 */

/** What this harness calls itself in report headers and run ids. */
export const FALSIFIER_ID = "p2-reachability-falsifier"

/** Report schema string, bumped when the row shape changes. */
export const REPORT_SCHEMA_VERSION = "p2-falsifier-report-1"

/**
 * The pre-registered falsifier share.
 *
 * `[REVIEWED]` — `SPEC.md` §"Pre-registered falsifiers" 1, adopted verbatim from
 * `phase-1/proposals/arm-b-prime.md` §7: *"if more than 25% of the 1,397 endorsed legacy role
 * colours are unreachable from the node-representative set **while remaining reachable from the set
 * of all exact triples meeting the same area floor**, the parse is not finding what people point
 * at, and the paradigm is wrong rather than under-tuned."*
 *
 * Pre-registered before any dump existed and **may not be reinterpreted after the fact**. It is a
 * report line, not a gate — the reviewer judges (`SPEC.md`).
 */
export const UNREACHABLE_SHARE_FALSIFIES_ABOVE = 0.25

/**
 * The number of endorsed legacy role colours the pre-registration names.
 *
 * `[MEASURED]` — counted from `research/v3/data/legacy/endorsements.json` on 2026-08-04:
 * 351 entries over 173 distinct artworks, 1,397 role slots actually carried (348 four-role entries,
 * one three-role, two single-role). Reproduces `arm-b-prime.md` §7's "1,397" exactly. Held here so
 * the report can say what fraction of the pre-registered denominator a run actually covered; the
 * harness never assumes it.
 */
export const ENDORSED_ROLE_COLOUR_SLOTS = 1397

/** Distinct artworks behind those slots. `[MEASURED]` — same count, same file, same date. */
export const ENDORSED_ARTWORKS = 173

/**
 * Area floor for the **control set**, as a fraction of total pixels, when a dump does not declare
 * the floor its own pipeline used.
 *
 * `[UNCALIBRATED]` — **a guess, and it is load-bearing.** The falsifier's control set is "all exact
 * triples whose pixel count clears *the same* area floor" (`SPEC.md`), so the honest source is the
 * pipeline's own retained-node floor, read off the dump. No numeric floor is pre-registered anywhere
 * in `research/v3`: `arm-b.md` §4.2 defines the structural area floor as a quantity to be *measured*
 * ("the smallest region whose colour the reviewer has ever endorsed"), and leaves it unmeasured. The
 * nearest documented sibling number in the tree is the **0.2 % area floor** used by the SAM residual
 * work (`oracle/sam/RESIDUAL_EXPERIMENT_NOTES.md`), which is where this 0.002 comes from and it is
 * the only reason it is this and not something else.
 *
 * Consequence, stated plainly: a run that falls back to this default is **not** comparing node
 * representatives against a control at the same floor, and every row it produces carries
 * `areaFloorSource: "uncalibrated-default"` so a reader can see that before reading the verdict.
 */
export const DEFAULT_AREA_FLOOR = 0.002

/**
 * The bar mode both reachability sides are measured under.
 *
 * `[INHERITED]` — `src/adjudication/types.ts`: `regional` is "the default and the only honest one",
 * the frozen region-dependent `sameColorBar(a, b)`. The harness calls the adjudication instrument's
 * own `assessReachability`, so this string selects the instrument's behaviour rather than
 * reimplementing it. No second radius, no local epsilon (`SPEC.md` binding rules).
 */
export const BAR_MODE = "regional" as const

/** Confidence level for every interval printed. `[INHERITED]` — `src/stats/binomial.ts` default. */
export const CONFIDENCE = 0.95

/**
 * Resamples for the artwork-clustered bootstrap.
 *
 * `[INHERITED]` — `src/stats/bootstrap.ts` `MIN_RESAMPLES` is 1000; 2000 is the next round number
 * above the floor and costs milliseconds at this n. The clustered interval exists because up to
 * eight colour slots can come from one artwork, and Wilson's denominator would count those as eight
 * independent facts.
 */
export const CLUSTER_BOOTSTRAP_RESAMPLES = 2000

/**
 * Bootstrap seed.
 *
 * `[UNCALIBRATED]` — an arbitrary constant, fixed only so two runs of the same input print the same
 * interval (`SPEC.md`: determinism, no RNG whose state is not pinned). It is not derived from any
 * measurement and carries no meaning.
 */
export const CLUSTER_BOOTSTRAP_SEED = 20260804
