# Album Artwork UI Palette Future Sample 02 Protocol

Status: metadata-only source-family seal. This protocol does not authorize artwork access or palette extraction.

## Purpose

This protocol reserves one candidate-independent future Phase 4 sample for album-artwork palette V2. It selects exactly
12 source families from reserve root `10` while preserving reserve roots `11` through `14`. The selection is evidence
custody only: it contains no palette output, source dimensions, colors, opening state, or timestamp.

## Authorized Inputs

The sealer may read only these existing metadata artifacts and this protocol document:

- `research/data/source-provenance-inventory-00-14.json`
- `research/data/album-artwork-palette-v2-development-panel.json`
- `research/data/album-artwork-palette-v2-fresh-sample.sealed.json`
- `research/data/experiments/album-artwork-palette-v2-0.4.4-phase-4/protocol.json`
- `research/ALBUM_ARTWORK_UI_PALETTE_FUTURE_SAMPLE_02_PROTOCOL.md`

The inventory must be parsed by `parseSourceProvenanceInventory`. The other JSON inputs are strict-parsed as source
metadata and identity-bound before use. Each input is a physical, non-symlink file. Artwork directories and artwork
files must not be listed, opened, hashed, decoded, rendered, or otherwise inspected. `sharp`, image loaders, palette
extractors, candidate implementations, and candidate or baseline result artifacts are prohibited inputs.

## Exclusions

The seal binds each authoritative exclusion artifact by raw SHA-256 and its existing semantic ID or commitment:

- The fixed V2 development panel is bound by `manifestId`.
- The old, opened Phase 4 fresh seal is bound by `manifestId` and `sealCommitment`.
- The opened Phase 4 protocol is bound by `protocolId` and must bind the same fresh seal, inventory, and 12 source
  hashes.

Every source SHA-256 and artwork ID in the development panel and old fresh seal is excluded. The seal additionally
commits to the broad prior-development universe: every artwork family ID and every variant SHA-256 recorded by the
strict inventory under roots `00` through `0f`. Counts and domain-separated commitments are stored rather than the
large exclusion lists. The effective exclusion commitment binds the union.

## Eligibility And Selection

A family is eligible only when all of these conditions hold in the strict inventory:

- Its reserve provenance is `source-inventoried/output-unseen` and `futureValidationEligible` is true.
- Its only reserve root is `10`, every family variant is a direct root-`10` source, and both recorded JPEG signatures
  pass.
- Every variant's raw SHA-256 group has no prior-content path, exactly one reserve artwork ID equal to this family,
  and only root-`10` reserve paths.
- Neither its artwork ID nor any variant SHA-256 is in the effective exclusion set.

For each eligible family, the sealer commits to the artwork ID, preferred source path, and every recorded variant's
path, byte count, and SHA-256. It computes:

```text
SHA256(
  "album-artwork-palette-v2-future-sample-02-family-selection-v1" || NUL ||
  inventoryId || NUL || effectiveExclusionCommitment || NUL ||
  artworkId || NUL || familyCommitment
)
```

Families are ordered by ascending lowercase hexadecimal selection key, with artwork ID as the collision tie-breaker.
The first 12 become `future-02-01` through `future-02-12`. There is no randomness and no candidate, baseline, palette,
review outcome, or extracted output in this key.

## Seal And Publication

The manifest ID is a domain-separated SHA-256 of canonical JSON for the complete identity. The seal commitment uses a
separate domain and binds both that identity and manifest ID. The JSON parser is exact-key and identity strict; full
verification also rebuilds the expected seal from all bound metadata and requires deep equality.

Publication is one-shot. `seal` uses an atomic temporary file and hard-link publication with overwrite refusal. An
existing final path is never replaced or reused. `verify` is read-only and cannot publish. Neither mode prints selected
membership.

The required sequence is:

```sh
NODE_NO_WARNINGS=1 node --experimental-strip-types --test research/tests/album-artwork-palette-v2-future-sample.test.ts
corepack pnpm exec tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --skipLibCheck --allowImportingTsExtensions research/src/album-artwork-palette-v2-future-sample.ts research/prepare-album-artwork-palette-v2-future-sample.ts research/tests/album-artwork-palette-v2-future-sample.test.ts
NODE_NO_WARNINGS=1 node --experimental-strip-types research/prepare-album-artwork-palette-v2-future-sample.ts seal
NODE_NO_WARNINGS=1 node --experimental-strip-types research/prepare-album-artwork-palette-v2-future-sample.ts verify
```

Candidate or baseline extraction and broad research test commands are outside this protocol.
