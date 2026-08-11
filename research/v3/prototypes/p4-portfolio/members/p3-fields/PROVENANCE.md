# `p3-fields` — member snapshot provenance

**Verified 2026-08-11T12:39:16.314Z. Member code is READ-ONLY (P4 SPEC §4): copied, never edited.**

The member worktrees are live — two of them moved HEAD during M1 — so a commit hash alone does not pin a snapshot. What pins it is the per-file sha-256 of the measured import closure below, re-checked against the home worktree by `tools/verify-pin.ts`; the commit is recorded as the checkout those bytes were found in.

## Source

| what | value |
|---|---|
| source worktree | `/Users/Flo/GitHub/palette/.worktrees/p3-fields` |
| pinned commit (HEAD at verification) | `b474fec4b27829854276315ffa39415c9a5b19d0` |
| branch | `proto/p3-fields` |
| home candidate module | `prototypes/p3-fields/src/candidate.ts` |
| snapshot candidate module | `members/p3-fields/v3/prototypes/p3-fields/src/candidate.ts` |
| home `codeVersion` | `a5f17f31abd94a3240f2cf1042ca183f3926a4d853976ed0dcb38e2c2332748a` |
| snapshot `codeVersion` | `d30999e96bad9e20ca00c5b36e5f04e3efeadb9ae08f082c6437ae7da03a4d15` |
| snapshot content is in that commit | **yes** (0 copied file(s) untracked in the home worktree, 0 with uncommitted edits) |
| closure re-verified | **PINNED** at 2026-08-11T12:39:16.314Z (13 copied + 8 shared files re-hashed; 0 copied drifted, 0 shared drifted) |

The two `codeVersion`s differ **by construction and only by construction**: `code-version.ts` hashes each file's path *relative to its own `research/v3`* into the digest, and the snapshot lives at a different relative path. The per-file sha-256s below are the checkout-independent identity, and the byte-identity gate is what actually proves the code is the same code.

## Import resolution — how the snapshot runs unmodified

The member is copied into a **mirror of `research/v3/`** so that every relative specifier it was written with resolves exactly as at home:

```
members/p3-fields/v3/src        ->  symlink to research/v3/src
members/p3-fields/v3/prototypes/…  copied files, at their original relative paths
```

So the candidate's own `../../../src/contract/types.ts` lands on **this worktree's one contract** through the symlink, and its intra-prototype imports resolve inside the copy. Nothing under `src/` is duplicated: those files were verified byte-identical between this worktree and the member's home before copying (`sharedFileDiffs` below), and forking the contract per member is exactly what a portfolio must not do. The symlink is inside p4's owned subtree.

**Note.** P3's carried devloop candidate, `prototypes/p3-fields/src/candidate.ts` (candidateId `p3-fields-0.4.2`), named by its STATE.md §5 graft list and by the 0.4.x line SPEC §4 pins.

## Files copied

Measured, not chosen: the closure is `computeCodeVersion()`'s own transitive relative-import walk from the candidate module — 21 files, of which 13 are the member's own (copied) and 8 are shared `research/v3/src` files (symlinked).

| copied file (path relative to the home `research/v3`) | sha-256 |
|---|---|
| `prototypes/p3-fields/src/accent.ts` | `d4b23062d73998e07226e15b2b3ed95621ba5125e2643b5d7c8fabc7639d862f` |
| `prototypes/p3-fields/src/candidate.ts` | `530b736d4b950f2cbf96ca94055773fa91f832a000c06c4adab7f7d5ebbb1213` |
| `prototypes/p3-fields/src/coherence.ts` | `ac5a271e78443a77a26d04c08d1448051a4b8abbd493ca5ef3bfc13012b9757d` |
| `prototypes/p3-fields/src/constants.ts` | `6d2be84c9f5ba77ce3c77daa8f6051f30cd0b8dcb21ab7d4b4f115766a98f86f` |
| `prototypes/p3-fields/src/decode.ts` | `bf034012429cd59dab652d118cb58daa32e852e07da5a904a7258ea66a0d62b0` |
| `prototypes/p3-fields/src/diagnostics.ts` | `b4bcd727b5182c4962fa773b9b62b30b4a2f0f2cc7d15e4cae4c018691c93bcf` |
| `prototypes/p3-fields/src/field-roles.ts` | `8a5c5c038d83d960a92281e8b09bdc2e6c9151626dd6f7bac356d0d9e436e7c7` |
| `prototypes/p3-fields/src/fields.ts` | `31df28db5093f9ce2ac069fb62dba8c871f6fbb5c7d1ecbb5e51a146e3406b51` |
| `prototypes/p3-fields/src/foreground.ts` | `61baa9fc28fabdd673803757d4843680e60eb9f073adf2a0ce4c591501779ff9` |
| `prototypes/p3-fields/src/gradient.ts` | `8487a32e9661e85eb1ddd1b09f92e72a059c80437f6d5e0507fdac5498a0c949` |
| `prototypes/p3-fields/src/pipeline.ts` | `4f70d3f674020a281792073ab9e5d9b1bc675d82b6f4b7c7f5a657cfd6e10535` |
| `prototypes/p3-fields/src/primitives.ts` | `c2e324798dbe26b9d543ca9e5b271a19f41c8279b5097cb126b782ad1d2dc998` |
| `prototypes/p3-fields/src/verify.ts` | `32d4cac272d8dd5f88eda36041fd7e41ccdc6a0333100a58ae0d6211541a50a6` |

### Shared, not copied (reached through the `src` symlink)

- `src/contract/challengers.ts`
- `src/contract/color.ts`
- `src/contract/constants.ts`
- `src/contract/invariants.ts`
- `src/contract/ramp.ts`
- `src/contract/types.ts`
- `src/devloop/code-version.ts`
- `src/devloop/types.ts`

Byte-identical home-vs-p4 check on those 8 files: **0 differ**.

## Byte-identity gate

**PASS** — 3/3 rows identical.

- home run: `data/m1/runs/p3-fields-gate3-home.jsonl`
- snapshot run: `data/m1/runs/p3-fields-gate3-snapshot.jsonl`
- median `computeMs` on the gate covers: home 272.108125, snapshot 259.53787500000004

Compared: the palette JSON, `inputContentHash`, `ok`, `error` — serialized and string-equal, so key order and number formatting count. The single normalization is each row's own checkout-root prefix (`imagePath`'s grandparent), because `imagePath` and `metadata.sourceRendition.path` name the same bytes under two worktrees; `strictIdenticalRows` (0) reports the count with no normalization at all so the difference stays visible. The demo-20 shards were verified byte-identical across all five Phase-2 worktrees before any run.
