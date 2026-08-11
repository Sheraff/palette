# `p5-fieldfit` — member snapshot provenance

**Verified 2026-08-11T12:39:16.577Z. Member code is READ-ONLY (P4 SPEC §4): copied, never edited.**

The member worktrees are live — two of them moved HEAD during M1 — so a commit hash alone does not pin a snapshot. What pins it is the per-file sha-256 of the measured import closure below, re-checked against the home worktree by `tools/verify-pin.ts`; the commit is recorded as the checkout those bytes were found in.

## Source

| what | value |
|---|---|
| source worktree | `/Users/Flo/GitHub/palette/.worktrees/p5-fieldfit` |
| pinned commit (HEAD at verification) | `0bdfb5fe5440c95f48fce2c6c78bf51ce9ddf71a` |
| branch | `proto/p5-fieldfit` |
| home candidate module | `prototypes/p5-fieldfit/candidate.ts` |
| snapshot candidate module | `members/p5-fieldfit/v3/prototypes/p5-fieldfit/candidate.ts` |
| home `codeVersion` | `737d1f11667bf8518233591dea9e6c738ee3639bd8a1b5274f65acb5379d3b76` |
| snapshot `codeVersion` | `e03844f6758c31439564ee0f3a8730c98c679eb9ea273a8c7b671ea8b112f43d` |
| snapshot content is in that commit | **yes** (0 copied file(s) untracked in the home worktree, 0 with uncommitted edits) |
| closure re-verified | **PINNED** at 2026-08-11T12:39:16.577Z (9 copied + 9 shared files re-hashed; 0 copied drifted, 0 shared drifted) |

The two `codeVersion`s differ **by construction and only by construction**: `code-version.ts` hashes each file's path *relative to its own `research/v3`* into the digest, and the snapshot lives at a different relative path. The per-file sha-256s below are the checkout-independent identity, and the byte-identity gate is what actually proves the code is the same code.

## Import resolution — how the snapshot runs unmodified

The member is copied into a **mirror of `research/v3/`** so that every relative specifier it was written with resolves exactly as at home:

```
members/p5-fieldfit/v3/src        ->  symlink to research/v3/src
members/p5-fieldfit/v3/prototypes/…  copied files, at their original relative paths
```

So the candidate's own `../../../src/contract/types.ts` lands on **this worktree's one contract** through the symlink, and its intra-prototype imports resolve inside the copy. Nothing under `src/` is duplicated: those files were verified byte-identical between this worktree and the member's home before copying (`sharedFileDiffs` below), and forking the contract per member is exactly what a portfolio must not do. The symlink is inside p4's owned subtree.

**Note.** P5 field-fit, `prototypes/p5-fieldfit/candidate.ts`, candidateId `p5-fieldfit` (the v0.8.2 assembly module named in the task).

## Files copied

Measured, not chosen: the closure is `computeCodeVersion()`'s own transitive relative-import walk from the candidate module — 18 files, of which 9 are the member's own (copied) and 9 are shared `research/v3/src` files (symlinked).

| copied file (path relative to the home `research/v3`) | sha-256 |
|---|---|
| `prototypes/p5-fieldfit/candidate.ts` | `a86f5bcd8562d1f97bbf1736fc97d024a9f2f1f0f042745d4bb74b4af7cbcbf5` |
| `prototypes/p5-fieldfit/src/assignment.ts` | `a9cb7986ae9658eb8a41b450f1da50ba0ee28cd9303fd41095089dac6ecd9dd7` |
| `prototypes/p5-fieldfit/src/components.ts` | `37fd250b5f04d36d5b87a25dd9d809f59fac5dee01a943bab07d2c2765a79afd` |
| `prototypes/p5-fieldfit/src/decode.ts` | `677842750ddd444ce14ca69d6146eaf0a40a475858a4fc2a96e12b96bae1ebd9` |
| `prototypes/p5-fieldfit/src/fieldfit.ts` | `697892f2d9259c4b6a37c3f28c06a881eb61e59cc798ca473c1f6a2ed494ec65` |
| `prototypes/p5-fieldfit/src/overlay.ts` | `3399e3acedf2ea50b960ad593879dcd94652c9fae5214ac476210ce6c7f5c140` |
| `prototypes/p5-fieldfit/src/ramp.ts` | `844576d9954141888af17de2991527a76cce9d8770f212148e898d212e8f0be0` |
| `prototypes/p5-fieldfit/src/snap.ts` | `79b8fd2bea61e971221b5ea46090c5a8d6142d95a28cbca481baebad60e4ca94` |
| `prototypes/p5-fieldfit/src/types.ts` | `d3c63524154e44a9821611dfec9e95183185a0f83dfa362c0e8459304d5ee03f` |

### Shared, not copied (reached through the `src` symlink)

- `src/contract/challengers.ts`
- `src/contract/color.ts`
- `src/contract/constants.ts`
- `src/contract/invariants.ts`
- `src/contract/perception-model-spaces.ts`
- `src/contract/ramp.ts`
- `src/contract/types.ts`
- `src/devloop/code-version.ts`
- `src/devloop/types.ts`

Byte-identical home-vs-p4 check on those 9 files: **0 differ**.

## Byte-identity gate

**PASS** — 3/3 rows identical.

- home run: `data/m1/runs/p5-fieldfit-gate3-home.jsonl`
- snapshot run: `data/m1/runs/p5-fieldfit-gate3-snapshot.jsonl`
- median `computeMs` on the gate covers: home 107.00829100000001, snapshot 108.41525000000001

Compared: the palette JSON, `inputContentHash`, `ok`, `error` — serialized and string-equal, so key order and number formatting count. The single normalization is each row's own checkout-root prefix (`imagePath`'s grandparent), because `imagePath` and `metadata.sourceRendition.path` name the same bytes under two worktrees; `strictIdenticalRows` (0) reports the count with no normalization at all so the difference stays visible. The demo-20 shards were verified byte-identical across all five Phase-2 worktrees before any run.
