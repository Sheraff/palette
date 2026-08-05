/**
 * `p2-tos-chroma` — **an alias for `candidate.ts`**, kept so existing references stay valid.
 *
 * ## Why this file still exists, and why it holds no mechanism
 *
 * Cycle 2 ran two candidates side by side on purpose: `p2-tos` was the thing round 1 was judged
 * against, and keeping it runnable byte for byte was what made the chromatic lanes' pool-size, timing
 * and accent deltas measurable rather than asserted. The lanes then reached one role — the accent — and
 * `DECISIONS.md` D2 recorded the isoluminant *foreground* as a gap deferred to this integration pass.
 *
 * That pass merged the lanes into `candidate.ts`. There is now **one pool, one parse and one
 * implementation**; two candidate modules would be two names for one palette. So this module re-exports
 * `candidate.ts`'s `paletteOf` unchanged — the same function object, publishing the same
 * `algorithmVersion` — and overrides only `candidateId`. A palette from `p2-tos-chroma` is byte-for-byte
 * a palette from `p2-tos`, which is the honest statement of what the merge did.
 *
 * It is kept rather than deleted because run files, report paths and review-round `items.json` entries
 * from cycle 2 name `prototypes/p2-tree/tos/candidate-chroma.ts` as a candidate path, and a dangling
 * path in a released artefact is a worse defect than a two-line alias.
 *
 * ## The dev-loop cache cannot conflate the two
 *
 * `src/devloop/run.ts` keys every row on `computeCodeVersion(candidatePath)` — a digest over the entry
 * module's bytes *and* its transitive import graph — composed with the image's content hash, and it
 * stamps `candidateId` into the run id and the run header. This file's bytes differ from
 * `candidate.ts`'s, so the two ids carry different code versions and land in different cache entries and
 * different run files. They now *agree* on every palette, which is the point; nothing merges them.
 */

import { candidateId as mergedCandidateId, paletteOf as mergedPaletteOf } from "./candidate.ts"
import type { CandidatePalette } from "../../../src/devloop/types.ts"

/** The name this candidate is known by in run ids, cache paths and the viewer. */
export const candidateId = "p2-tos-chroma"

/** `candidate.ts`'s function, unwrapped. Not a copy and not a re-implementation. */
export const paletteOf: CandidatePalette = mergedPaletteOf

/** What this alias points at, so a test can assert the aliasing rather than trust this comment. */
export const aliasOf = mergedCandidateId

export { paletteWithDiagnostics, MERGED_ALGORITHM_VERSION } from "./candidate.ts"
