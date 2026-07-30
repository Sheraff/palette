# Standalone Phase 3 Final Palette

This folder is a standalone, editable copy of the reviewed Phase 3 final algorithm. Its only public entry point is [`index.ts`](./index.ts).

```ts
import { extractPalette, extractPaletteFromBytes } from "./index.ts"

const fromRawImage = extractPalette({ width, height, data })
const fromEncodedImage = await extractPaletteFromBytes(bytes)
```

`extractPalette` accepts decoded three-channel sRGB `RawImage` data. The returned value includes the exact algorithm identity, winner, bounded alternatives, active inference diagnostics, and the optional exact source-supported midpoint review render. `extractPaletteFromBytes` uses `sharp`, honors EXIF orientation, flattens transparency onto white, converts to sRGB, and enforces the 2,100,000-pixel default limit.

## Architecture

- `index.ts` is the complete public API and midpoint projection.
- `src/internal/` contains only the symbol-level transitive closure of the reviewed inference and decoder.
- `tools/vendor-runtime.ts` deterministically refreshes that closure from the reviewed source using the TypeScript symbol graph. It is build tooling, not a runtime dependency.
- `test/review-fixtures.ts` contains the immutable expected treatments and source bindings from the completed 34-artwork review.
- `test/parity.test.ts` verifies exact displayed-winner parity against all 34 authoritative source images.
- `test/architecture.test.ts` enforces runtime import isolation and absence of review-case fixtures.

Historical runners, attempt adapters, contract barrels, warehouses, review applications, and rejected attempt implementations are intentionally absent.
Tests read the repository's `images/` corpus, but all expected outputs and runtime code are contained within this folder.

## Verification

Run from the repository root:

```sh
node --no-warnings --experimental-strip-types --test research/v2-2/test/*.test.ts
node_modules/.bin/tsc -p research/v2-2/tsconfig.json
git diff --check -- research/v2-2
```

To reproduce the internal source slice:

```sh
node --no-warnings --experimental-strip-types research/v2-2/tools/vendor-runtime.ts
```
