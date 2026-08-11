/**
 * The P4 selector: a non-fitted, member-independent selection currency (SPEC §1).
 *
 * `constants.ts` holds every number the selector runs on and the registries the F2 tripwire reads;
 * `substrate.ts` is arm-c′ §2.1's one pass; `currency.ts` is `L(palette | image)` in bits;
 * `select.ts` is arm-c′ §2.3's four mechanisms; `pipeline.ts` runs one cover through all of it.
 */

export * from "./constants.ts"
export * from "./types.ts"
export * from "./substrate.ts"
export * from "./currency.ts"
export * from "./select.ts"
export * from "./pipeline.ts"
