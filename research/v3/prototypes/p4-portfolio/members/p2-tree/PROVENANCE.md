# `p2-tree` — member snapshot provenance

**Verified 2026-08-11T12:41:19.508Z. Member code is READ-ONLY (P4 SPEC §4): copied, never edited.**

The member worktrees are live — two of them moved HEAD during M1 — so a commit hash alone does not pin a snapshot. What pins it is the per-file sha-256 of the measured import closure below, re-checked against the home worktree by `tools/verify-pin.ts`; the commit is recorded as the checkout those bytes were found in.

## Source

| what | value |
|---|---|
| source worktree | `/Users/Flo/GitHub/palette/.worktrees/p2-tree` |
| pinned commit (HEAD at verification) | `21131282af7e9077ebc17f0ae7c2bc4af9577c39` |
| branch | `proto/p2-tree` |
| home candidate module | `prototypes/p2-tree/tos/candidate.ts` |
| snapshot candidate module | `members/p2-tree/v3/prototypes/p2-tree/tos/candidate.ts` |
| home `codeVersion` | `402bf32affa42133bd3f636ab6da4aed5599141aa9a03c1fa30706d1fc0d70ba` |
| snapshot `codeVersion` | `19e91d28fa6152df6bea151364859594a00e29fafec1ef1d81596744cab6bfc9` |
| snapshot content is in that commit | **NO** (4 copied file(s) untracked in the home worktree, 1 with uncommitted edits) |
| closure re-verified | **PINNED** at 2026-08-11T12:41:19.508Z (19 copied + 8 shared files re-hashed; 0 copied drifted, 0 shared drifted) |

The two `codeVersion`s differ **by construction and only by construction**: `code-version.ts` hashes each file's path *relative to its own `research/v3`* into the digest, and the snapshot lives at a different relative path. The per-file sha-256s below are the checkout-independent identity, and the byte-identity gate is what actually proves the code is the same code.


> **The commit does not contain this member.** The files below were snapshotted from the home worktree's *working tree*: 4 of them are untracked there (`prototypes/p2-tree/tos/gradient/constants.ts`, `prototypes/p2-tree/tos/gradient/excursion.ts`, `prototypes/p2-tree/tos/gradient/guide-stop.ts`, `prototypes/p2-tree/tos/gradient/occupancy.ts`), and 1 carry uncommitted edits (`prototypes/p2-tree/tos/candidate.ts`). So no commit reproduces what this member runs, and the sha-256 fingerprint below is the only pin there is. Recorded, not worked around — resolving it is the home prototype's call.

## Import resolution — how the snapshot runs unmodified

The member is copied into a **mirror of `research/v3/`** so that every relative specifier it was written with resolves exactly as at home:

```
members/p2-tree/v3/src        ->  symlink to research/v3/src
members/p2-tree/v3/prototypes/…  copied files, at their original relative paths
```

So the candidate's own `../../../src/contract/types.ts` lands on **this worktree's one contract** through the symlink, and its intra-prototype imports resolve inside the copy. Nothing under `src/` is duplicated: those files were verified byte-identical between this worktree and the member's home before copying (`sharedFileDiffs` below), and forking the contract per member is exactly what a portfolio must not do. The symlink is inside p4's owned subtree.

**Note.** P2's **merged** tree-of-shapes candidate: `prototypes/p2-tree/tos/candidate.ts`, candidateId `p2-tos`, publishing `MERGED_ALGORITHM_VERSION = p2-tos-0.3.0-cycle-2-merged` — the family STATE.md §1 records as carried. The frozen α-tree (`alpha/candidate.ts`) and the un-judged coverage-allocation prototype (`tos/coverage/candidate-coverage.ts`) are NOT snapshotted.

## Files copied

Measured, not chosen: the closure is `computeCodeVersion()`'s own transitive relative-import walk from the candidate module — 27 files, of which 19 are the member's own (copied) and 8 are shared `research/v3/src` files (symlinked).

| copied file (path relative to the home `research/v3`) | sha-256 |
|---|---|
| `prototypes/p2-tree/tos/candidate.ts` | `1d15fd9ed3a9799e7a25d6a6464d7052d71d063f9a38744cb171f7fb9d3ab786` |
| `prototypes/p2-tree/tos/constants.ts` | `5f891a8e1378b76b2f5d8930054df33717098a34af3378619e556a8120d370f1` |
| `prototypes/p2-tree/tos/gradient/constants.ts` | `1120611ee0b35919d2fd314a84478f3d24d97032a1e8df5d749652a54e1087d7` |
| `prototypes/p2-tree/tos/gradient/excursion.ts` | `0c5cf9dc64b9ad4886febb745548f67561ba52f38976c72492b65c93b8c9d846` |
| `prototypes/p2-tree/tos/gradient/guide-stop.ts` | `e92c93fbf380bc7b392c3d40435ccb1d377459fb9a58c3aa12e6da3e5b501858` |
| `prototypes/p2-tree/tos/gradient/occupancy.ts` | `73a2a49bf9ef2f72dc37d424195dbaa3d08cde6d0fabaea460b2b7b1b79b8b6b` |
| `prototypes/p2-tree/tos/lanes/channels.ts` | `0326544c20bd6f500a9140457ff678f09350eb1b92802bf17e6b760cb87e3017` |
| `prototypes/p2-tree/tos/lanes/constants.ts` | `dda24e1232c74619e1a526c84258827851eadf85b102cb92ae1db21c68bae173` |
| `prototypes/p2-tree/tos/lanes/nodes.ts` | `40e8414260e38e8895b317e3976ed60a52b8b952b9312233bbe76535ef046ca7` |
| `prototypes/p2-tree/tos/lanes/pool.ts` | `084ba6526646b7e33e6548e9a58675e706c66c53c78d9d24b4014f002e24f0d0` |
| `prototypes/p2-tree/tos/pipeline.ts` | `991e964c3065f6a2d92d535f45b00e0f99bc7a2c6fa2bd02f9f26ed8b5d6f980` |
| `prototypes/p2-tree/tos/roles/assemble.ts` | `c48d121fc2d495eca89bd6a7d3f12d677c625c82dda2bbcf532ebfc6f650bd5d` |
| `prototypes/p2-tree/tos/roles/coincidence.ts` | `a5ee42113d71ca21ba54a1d43f752e8541b8960b38aa8bf14f0c23d00568fc97` |
| `prototypes/p2-tree/tos/roles/constants.ts` | `7371aadd0e190344ebf2dc347e89d662e2205f845f0307fed86ea805657986ba` |
| `prototypes/p2-tree/tos/roles/eligibility.ts` | `13d45ce0b423339feae5e18a936ac89529bcbb12372d8283a9fbdddfb10ca02b` |
| `prototypes/p2-tree/tos/roles/indifference.ts` | `b6bfc7d5f29fa86812d10a63bbd0e28658e3eec76663eb18a214a84784f6d288` |
| `prototypes/p2-tree/tos/roles/rank.ts` | `690daf43cf99c333b46c6ca375d7e490bfcdd2c252c6d435fd5c3f3b4178e281` |
| `prototypes/p2-tree/tos/roles/text.ts` | `1048f64a63fd4a51ae960f3fe97ab4b00ca57ee7909487d3ca337c3eb06937dd` |
| `prototypes/p2-tree/tos/tree.ts` | `89285c26b37c62adc898e3b9c6a41cbba71c9f2b1d0fa851add0556e7e0260ed` |

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

- home run: `data/m1/runs/p2-tree-gate3-home.jsonl`
- snapshot run: `data/m1/runs/p2-tree-gate3-snapshot.jsonl`
- median `computeMs` on the gate covers: home 514.353125, snapshot 540.180834

Compared: the palette JSON, `inputContentHash`, `ok`, `error` — serialized and string-equal, so key order and number formatting count. The single normalization is each row's own checkout-root prefix (`imagePath`'s grandparent), because `imagePath` and `metadata.sourceRendition.path` name the same bytes under two worktrees; `strictIdenticalRows` (0) reports the count with no normalization at all so the difference stays visible. The demo-20 shards were verified byte-identical across all five Phase-2 worktrees before any run.
