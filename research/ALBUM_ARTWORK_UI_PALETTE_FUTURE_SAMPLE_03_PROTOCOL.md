# Album Artwork UI Palette Future Sample 03 Protocol

Status: metadata-only source-family seal. This protocol does not authorize artwork access, palette
extraction, candidate execution, baseline execution, or review.

## Purpose

Future sample 03 reserves exactly 12 candidate-output-unseen source families from reserve root `11`
before another candidate is developed. It preserves reserve roots `12` through `14` and binds future
sample 02 as consumed. Selection is independent of candidate code, palette output, baseline output,
review labels, comments, and Phase 4 analysis.

## Authorized Inputs

The sealer may read only these physical metadata artifacts and this protocol document:

- `research/data/source-provenance-inventory-00-14.json`;
- `research/data/album-artwork-palette-v2-future-sample-02.sealed.json`;
- `research/data/experiments/album-artwork-palette-v2-0.5.2-phase-4-future-02/run-complete.json`; and
- `research/ALBUM_ARTWORK_UI_PALETTE_FUTURE_SAMPLE_03_PROTOCOL.md`.

The inventory is parsed by `parseSourceProvenanceInventory`; future sample 02 is parsed by
`parseAlbumArtworkPaletteV2FutureSample`; the consumption receipt is exact-key parsed and must bind the
same future-sample execution protocol with `futureSampleConsumed: true`, 12 candidate artifacts, and 12
baseline artifacts.

Artwork directories and files must not be listed, opened, hashed, decoded, rendered, or otherwise
inspected. Candidate and baseline artifacts, review manifests, feedback, technical interpretations,
and Phase 4 analysis are prohibited inputs. Image loaders, `sharp`, and palette extractors are prohibited
imports.

## Exclusions

The new seal binds:

- future sample 02's raw SHA-256, manifest ID, seal commitment, selected artwork IDs and variant hashes;
- future sample 02's inherited effective exclusion commitment covering broad prior development and all
  previously exposed V2 sources; and
- the immutable future-sample-02 consumption receipt and its execution protocol ID.

The effective exclusion commitment is domain-separated and binds both the inherited commitment and the
complete consumed-sample identity lists. Selection must not inspect any result produced on those
sources.

## Eligibility And Selection

A family is eligible only when:

- its reserve provenance is `source-inventoried/output-unseen` and `futureValidationEligible` is true;
- its only reserve root is `11`;
- every variant is a direct root-`11` source with both recorded JPEG boundary signatures;
- every raw-SHA group has no prior-content path, exactly one reserve artwork ID equal to the family,
  and only root-`11` reserve paths; and
- neither its artwork ID nor any variant SHA-256 belongs to consumed future sample 02.

For each eligible family, compute a commitment over artwork ID, preferred source path, and all recorded
variant paths, byte counts, and SHA-256 values. Then compute:

```text
SHA256(
  "album-artwork-palette-v2-future-sample-03-family-selection-v1" || NUL ||
  inventoryId || NUL || effectiveExclusionCommitment || NUL ||
  artworkId || NUL || familyCommitment
)
```

Order families by ascending lowercase hexadecimal selection key, with artwork ID as the collision
tie-breaker. The first 12 become `future-03-01` through `future-03-12`. There is no randomness and no
candidate, baseline, palette, review, or result field in the key.

## Seal And Publication

- The manifest ID and seal commitment use separate domain-separated SHA-256 identities.
- Parsing is exact-key and identity strict.
- Full verification rebuilds the expected seal from all authorized metadata and requires deep equality.
- Publication uses an atomic temporary file and hard-link overwrite refusal.
- An existing final path is never replaced, reused, or silently accepted.
- Verification is read-only.
- Neither sealing nor verification prints selected membership.

The final path is
`research/data/album-artwork-palette-v2-future-sample-03.sealed.json`.

Candidate development may begin only after generic tests, strict TypeScript compilation, one exclusive
seal publication, and read-only full verification pass.
