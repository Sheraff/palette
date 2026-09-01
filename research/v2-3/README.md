# Palette v2-3

This folder contains the standalone image-to-palette algorithm — the active development line, started as an exact duplicate of the frozen `research/v2-2` checkpoint. Its only public entry point is [`index.ts`](./index.ts).

Unlike `v2-2` (whose parity fixtures freeze the reviewed checkpoint, including its known-bad outputs), this folder is where accuracy improvements land after they are proven in review. When behavior intentionally diverges from `v2-2`, the parity fixtures here are expected to be updated to the newly reviewed outputs.

```ts
import { extractPalette, extractPaletteFromBytes } from "./index.ts"

const fromRawImage = extractPalette({ width, height, data })
const fromEncodedImage = await extractPaletteFromBytes(bytes)

// Optional. The only parameter today is the APCA hard minimum a role must exceed somewhere along
// the field to count as observable. It defaults to 0 — this library deliberately allows very low
// contrast, and raising the floor is the caller's decision, never the algorithm's.
const stricter = extractPalette({ width, height, data }, { contrastHardMinimum: 15 })
```

`extractPalette` accepts decoded three-channel sRGB `RawImage` data. It returns the image dimensions, four selected role colors, collapse and gradient state, and an optional exact source-supported midpoint render. Candidate scores, provenance, alternatives, and selection reports stay internal. `extractPaletteFromBytes` uses `sharp`, honors EXIF orientation, flattens transparency onto white, converts to sRGB, and enforces the 2,100,000-pixel default limit.

## Architecture

- `index.ts` is the complete public API and midpoint projection.
- `src/internal/palette.ts` contains the winner-selection flow.
- `src/internal/palette-core.ts` discovers source colors and constructs candidates.
- `src/internal/candidate-domain.ts`, `candidate-materialization.ts`, and `winner-scoring.ts` build and rank the bounded candidate domain.
- `src/internal/source-eligibility.ts`, `transition-promotion.ts`, and `gradient-support.ts` enforce source support and gradient correctness.
- The remaining internal modules contain image decoding, color math, field analysis, and role evidence.
- `test/review-fixtures.ts` contains the immutable expected treatments and source bindings from the completed 34-artwork review.
- `test/parity.test.ts` verifies exact displayed-winner parity against all 34 authoritative source images, as one named subtest per fixture; it also holds the real-artwork determinism case and the `contrastHardMinimum` contract.
- `test/configuration.test.ts` pins every flag, threshold and weight of the reviewed configuration, with the review that decided each value.
- `test/architecture.test.ts` enforces runtime import isolation and absence of review-case fixtures.
- `test/corpus.ts` resolves the artwork corpus. The artworks are copyrighted and not committed, so a fresh worktree holds only the `-scrambled` decoys; set `PALETTE_IMAGES_ROOT` to a checkout that has the real files. **The decoys are not a substitute** — scrambling preserves the colour histogram and destroys spatial structure, so field topology, transition traces and endpoint refinement all behave differently on them.

Nonwinning reserve generation, slate custody, review diagnostics, historical runners, attempt adapters, warehouses, review applications, and rejected implementations are intentionally absent.
Tests read the repository's `images/` corpus, but all expected outputs and runtime code are contained within this folder.

## Verification

Run from the repository root:

```sh
PALETTE_IMAGES_ROOT=/path/to/checkout/images \
  node --no-warnings --experimental-strip-types --test research/v2-3/test/*.test.ts
npx tsc -p research/v2-3/tsconfig.json   # from a worktree: <main-checkout>/node_modules/.bin/tsc
git diff --check -- research/v2-3
```
