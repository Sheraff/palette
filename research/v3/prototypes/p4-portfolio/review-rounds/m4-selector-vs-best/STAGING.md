# M4 round — staging record

Written by the implementation worker in the worktree `.worktrees/p4-portfolio` (branch
`proto/p4-portfolio`, HEAD `892ad6a5`, working tree **dirty** — the bootstrap-semantics fix of the
same turn is uncommitted, and the payload's fingerprints say `dirty: true` because that is the truth).
**Nothing here was pushed to the server.** The round question and the pre-registered branches are in
`ROUND.md`; this file is how the payload was made and what the installer needs to know.

## 1. The pipeline, three files, in order

```
node --experimental-strip-types prototypes/p4-portfolio/review-rounds/m4-selector-vs-best/select-covers.ts
node --experimental-strip-types prototypes/p4-portfolio/review-rounds/m4-selector-vs-best/build.ts
node --experimental-strip-types prototypes/p4-portfolio/review-rounds/m4-selector-vs-best/validate.ts
```

- **`select-covers.ts` → `selection.json`.** Decides the eight covers from the post-fix bit table and
  the M3 member runs. Pure function of those inputs plus the sibling worktrees' staged itemIds; every
  rejection reason is counted in `selection.json` (`143 → 8`, rejections: 46 non-40-hex stems, 30
  covers where the selector elects P3, 13 covers already staged in another prototype's round, 1
  immaterial against P3).
- **`build.ts` → `items.json` + `mapping.private.json`.** Copies palettes out of the run rows. Runs no
  member, decodes no image, types no hex.
- **`validate.ts`.** 30 checks, **all PASS**. Exit non-zero and the round does not ship.

## 2. Where the palettes come from

Every colour on every side is a `palette.roles[*].hex` from an M3 member run row
(`data/m3/runs/*.jsonl`), joined on the cover's sha-256 content hash — the same rows the bit table was
priced from. `validate.ts` re-reads all **86** served hexes from those files and compares them
character by character.

| member | true `algorithmVersion` | true `preprocessingVersion` | run `codeVersion` |
|---|---|---|---|
| `p2-tree` | `p2-tos-0.3.0-cycle-2-merged` | `sharp-0.33.5/srgb/no-resample` | `0795f6e7b02e907f…` |
| `p3-fields` | `p3-fields-0.4.2` | `sharp-0.33.5/srgb/no-resample/alpha-excluded` | `d30999e96bad9e20…` |
| `p5-fieldfit` | `p5-fieldfit-0.8.2` | `sharp-0.33.5/srgb/no-resample` | `e03844f6758c3143…` |

**None of that reaches the payload.** The served `algorithmVersion` is the positional mask
`blinded-01` / `blinded-02` and the served `preprocessingVersion` is the campaign's single
`sharp-0.33.5/srgb/no-resample` on **both** sides — `p3-fields`'s real string ends `/alpha-excluded`
and would have separated the arms on sight. The true values are in `mapping.private.json`.

The palettes are the members' **published** outputs, so `gradient.geometry` — an object the p5 runs
carry and the p3 runs do not — is dropped on the way into the fixture. It is a member fingerprint,
and the push schema takes only a string geometry anyway.

## 3. Blinding

- `variantId` = `v` + `sha256(salt | itemId | member)[0:15]`. Opaque; names nothing. (The review
  server does not serve variant ids or fingerprints to the browser at all — `blinding.ts` withholds
  both — but the batch log carries them, which is what the post-release de-blind joins on.)
- Fixture side order = `sha256(salt | itemId | 'order')` parity, per item. The elected side sits first
  on 5 of 8 items. The server shuffles **again** at push time with its own 32-byte salt.
- The salt is 32 random bytes, generated once, kept in `mapping.private.json`, and **read back** on
  every rebuild — which is what makes `validate.ts`'s deterministic-rebuild check meaningful rather
  than tautological.
- `mapping.private.json` also records, per side, the **served colornames-oklab names** for all four
  roles and every gradient stop, computed exactly as `batch.ts` computes them (`nameHexes` over both
  sides' hexes of the item). That is `NOTES-cross-arm.md` note 1's requirement: the names are judged
  surface, so a name effect has to be attributable after release rather than invisible.

**The disclosure that matters more than any of the above:** `blinding.ts` states that arms differing
systematically in a served field are self-identifying whatever the shuffle does. Here the elected side
publishes a gradient on 7 of 8 items and the P3 side on 4 of 8. Overlapping, so no one-line rule
unblinds the round — but not independent either, and it is the reason `ROUND.md` §4 says so out loud.

## 4. Validation battery — what `validate.ts` checked

| group | checks |
|---|---|
| shape | 8 items, unique server-legal 40-hex itemIds, itemId = imagePath stem, relative paths that resolve under the main checkout, exactly the three push keys, exactly two sides, exactly the three side keys |
| colour | all 86 hexes `^#[0-9a-f]{6}$`; collapse flags agree with hex equality; 11 gradient sides with 2..4 canonical strictly-increasing stops ending at 0 and 1; no gradient geometry |
| id surface | **0 hits** over 166 served strings against 40+ prototype / round / member / mechanism tokens; **negative control**: a fabricated `p4-portfolio-m4-selector-elected-01` variantId is caught (7 hits); the payload references neither the private mapping nor the salt |
| parser | `parseBatch` (imported read-only) accepts the payload as `purpose: mechanism`, 8 items, palettes round-trip byte-identical, both variant tokens survive and differ |
| provenance | all 86 served hexes verbatim from the member run rows; the mapping's served names equal the current `nameHexes` output |
| blinding | every variantId recomputed from the salt; fixture order recomputed from the salt; both orders occur; fingerprints neutral and identical but for position |
| eligibility | no item pits P3 against itself; every item's two served palettes differ at the contract's regional bar |
| determinism | `build.ts` re-run — `items.json` and `mapping.private.json` byte-identical |

## 5. For the installer

1. **`imagePath` is repo-relative** (`04/ab67…` … `14/ab67…`, one per shard), matching the other
   prototypes' fixtures. `parseBatch` requires absolute paths, so the push must prefix the main
   checkout — that is exactly what the dry-run in `validate.ts` does.
2. **Purpose is `mechanism`**; kind is pairwise; 8 items; no new round kind is needed.
3. **None of the eight artwork files carries a file extension** — all eight are extension-less
   sharded-corpus files, so each itemId is its filename outright. They are real decodable images
   (every member decoded them, and `readArtworkIdentity` reads the header rather than the name), and
   `validate.ts` opens all eight from the main checkout, but it is worth knowing before a push.
4. **`mapping.private.json` must never be copied into a batch, a media directory, or anywhere the
   server can reach.** It is the decode key.
5. After release: the owning prototype spawns its own analyst, which joins the released payload with
   `data/review-server/batches.jsonl` and this mapping. The batch log is not read while the batch is
   open.
