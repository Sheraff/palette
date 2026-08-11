/**
 * **A second build of the candidate with the guide-stop machinery replaced by an impostor.**
 *
 * `flat-byte-identity.test.ts` asserts that the machinery cannot touch a palette that publishes no
 * ramp. That claim needs *two* builds to be falsifiable — one where the machinery is live and one where
 * it is not — and the only honest baseline is one produced **in the same run**. A frozen run file from
 * before the change cannot serve: it is a statement about the constants that were in `constants.ts` on
 * the day it was written, so any later constant ruling (D15's coverage gate is the one that broke it)
 * makes the file stale for a reason that has nothing to do with gradients. This module removes that
 * whole class by regenerating the baseline instead of pinning one.
 *
 * ## How the second build is obtained without a seam in the candidate
 *
 * `candidate.ts` calls `guideStop` through a static ESM import; there is no injection point, and adding
 * one to production code to make a test possible would be the test dictating the shape of the pipeline.
 * So the substitution happens **below** the module graph, in Node's own module-customisation hooks
 * (`node:module`'s `register`):
 *
 *  - `resolve` tags every **file** URL reached from a marked parent with the same `?` marker, so one
 *    dynamic `import()` of `candidate.ts?<marker>` produces a *complete second copy* of the prototype's
 *    module graph. Bare specifiers and anything under `node_modules` are deliberately **not** marked —
 *    `sharp` is a native addon and must stay a single instance, and duplicating it would make the two
 *    builds differ for a reason that is not the machinery.
 *  - `load` answers for exactly one URL in that copy — `gradient/guide-stop.ts` — with the impostor
 *    below. Every other module in the copy is loaded normally, type-stripping included.
 *
 * ## Why the impostor is a no-op that counts, rather than a throw
 *
 * A stub that threw would prove only that the machinery was not *called*. The impostor instead returns
 * the two stops it was given, unchanged, and records the call. That buys both halves of the property at
 * once, on the same run:
 *
 *  - **it was not consulted** — `guideStopCalls` does not grow for a cover that publishes no ramp;
 *  - **and nothing it could have returned reached the palette** — the marked build's palette is
 *    byte-identical to the live build's, so no other field of the contract depends on it either.
 *
 * It also makes the marked build a usable baseline for the *ramp* covers: the impostor publishes the
 * plain 2-stop ramp, so the live build's palette must equal it exactly once the one interior stop the
 * machinery is allowed to insert is removed. That is the general statement of "must not touch" — the
 * inserted stop is the machinery's **only** channel into the published contract — and it is asserted
 * without naming a single colour.
 */

/** The query appended to every file URL of the second, machinery-free copy of the module graph. */
export const GUIDE_STOP_STUB_MARKER = "p2-guide-stop-stubbed"

/** The module the `load` hook answers for. Matched on the URL's path, so the marker does not interfere. */
const GUIDE_STOP_PATH_SUFFIX = "/tos/gradient/guide-stop.ts"

/**
 * The impostor, as source text.
 *
 * `refusal: "stubbed"` is not a member of `GuideStopRefusal` on purpose: it is how a test tells the two
 * builds apart, and a value the production union carries could be mistaken for a real refusal class.
 * `preservesMonotoneOrder` is exported because the real module exports it; nothing in the candidate's
 * graph calls it, and it answers `false` so that a future caller cannot silently take a stubbed answer
 * for a measurement.
 */
const GUIDE_STOP_STUB_SOURCE = `
export const guideStopCalls = []

export function guideStop(input) {
	guideStopCalls.push({ first: input.stops[0].color.hex, last: input.stops[1].color.hex })
	return {
		stops: [input.stops[0], input.stops[1]],
		report: {
			owed: false,
			inserted: false,
			refusal: "stubbed",
			before: null,
			after: null,
			stop: null,
			candidates: 0,
			requiredFallBars: 0,
			actualFallBars: null,
		},
	}
}

export function preservesMonotoneOrder() {
	return false
}
`

type ResolveResult = { url: string; format?: string | null; shortCircuit?: boolean; importAttributes?: object }
type ResolveContext = { parentURL?: string; conditions?: readonly string[]; importAttributes?: object }
type LoadResult = { format: string; source?: string | ArrayBuffer | Uint8Array; shortCircuit?: boolean }
type LoadContext = { format?: string | null; conditions?: readonly string[]; importAttributes?: object }

function marked(value: string | undefined): boolean {
	return typeof value === "string" && value.includes(GUIDE_STOP_STUB_MARKER)
}

export async function resolve(
	specifier: string,
	context: ResolveContext,
	nextResolve: (specifier: string, context: ResolveContext) => Promise<ResolveResult>,
): Promise<ResolveResult> {
	const selfMarked = marked(specifier)
	const cleaned = selfMarked ? specifier.replace(`?${GUIDE_STOP_STUB_MARKER}`, "") : specifier
	const resolved = await nextResolve(cleaned, context)
	if (!selfMarked && !marked(context.parentURL)) return resolved
	// Builtins, bare specifiers and anything installed stay single-instance: the second build differs
	// from the first in the machinery and in nothing else.
	if (!resolved.url.startsWith("file:") || resolved.url.includes("/node_modules/")) return resolved
	if (marked(resolved.url)) return resolved
	return { ...resolved, url: `${resolved.url}?${GUIDE_STOP_STUB_MARKER}` }
}

export async function load(
	url: string,
	context: LoadContext,
	nextLoad: (url: string, context: LoadContext) => Promise<LoadResult>,
): Promise<LoadResult> {
	if (marked(url) && new URL(url).pathname.endsWith(GUIDE_STOP_PATH_SUFFIX)) {
		return { format: "module", shortCircuit: true, source: GUIDE_STOP_STUB_SOURCE }
	}
	return nextLoad(url, context)
}
