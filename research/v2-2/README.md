# Palette v2-2

This folder contains the standalone image-to-palette algorithm. Its only public entry point is [`index.ts`](./index.ts).

```ts
import { extractPalette, extractPaletteFromBytes } from "./index.ts"

const fromRawImage = extractPalette({ width, height, data })
const fromEncodedImage = await extractPaletteFromBytes(bytes)
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
- `test/parity.test.ts` verifies exact displayed-winner parity against all 34 authoritative source images.
- `test/architecture.test.ts` enforces runtime import isolation and absence of review-case fixtures.

Nonwinning reserve generation, slate custody, review diagnostics, historical runners, attempt adapters, warehouses, review applications, and rejected implementations are intentionally absent.
Tests read the repository's `images/` corpus, but all expected outputs and runtime code are contained within this folder.

## Verification

Run from the repository root:

```sh
node --no-warnings --experimental-strip-types --test research/v2-2/test/*.test.ts
node_modules/.bin/tsc -p research/v2-2/tsconfig.json
git diff --check -- research/v2-2
```
