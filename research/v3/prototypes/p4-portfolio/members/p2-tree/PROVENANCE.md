# `p2-tree` — member snapshot provenance

**Verified 2026-08-11T18:44:28.480Z. Member code is READ-ONLY (P4 SPEC §4): copied, never edited.**

The member worktrees are live — two of them moved HEAD during M1 — so a commit hash alone does not pin a snapshot. What pins it is the per-file sha-256 of the measured import closure below, re-checked against the home worktree by `tools/verify-pin.ts`; the commit is recorded as the checkout those bytes were found in.

## Source

| what | value |
|---|---|
| source worktree | `/Users/Flo/GitHub/palette/.worktrees/p2-tree` |
| pinned commit (HEAD at verification) | `041fc4b4d51fe23058b044cd4970b523a9fe6945` |
| branch | `proto/p2-tree` |
| home candidate module | `prototypes/p2-tree/tos/candidate.ts` |
| snapshot candidate module | `members/p2-tree/v3/prototypes/p2-tree/tos/candidate.ts` |
| home `codeVersion` | `93291d0f55348ad12fd0df30d0235c48a874af084f81bc2a2dd172ad841a831b` |
| snapshot `codeVersion` | `0795f6e7b02e907f4ad3aa65a131966c2c1149c8de78ee799e57f49728cf9ce4` |
| snapshot content is in that commit | **YES** (0 copied file(s) untracked in the home worktree, 0 with uncommitted edits) |
| closure re-verified | **PINNED** at 2026-08-11T18:44:28.480Z (19 copied + 8 shared files re-hashed; 0 copied drifted, 0 shared drifted) |

The two `codeVersion`s differ **by construction and only by construction**: `code-version.ts` hashes each file's path *relative to its own `research/v3`* into the digest, and the snapshot lives at a different relative path. The per-file sha-256s below are the checkout-independent identity, and the byte-identity gate is what actually proves the code is the same code.


> **The commit now contains this member.** All 19 files below are byte-identical to `041fc4b4:research/v3/…` in the home worktree. The commit and the fingerprint agree for the first time on this campaign, so `041fc4b4` reproduces exactly what this member runs. The sha-256 fingerprint remains the pin of record (it is checkout-independent); the commit is no longer a weaker statement than it.

## Import resolution — how the snapshot runs unmodified

The member is copied into a **mirror of `research/v3/`** so that every relative specifier it was written with resolves exactly as at home:

```
members/p2-tree/v3/src        ->  symlink to research/v3/src
members/p2-tree/v3/prototypes/…  copied files, at their original relative paths
```

So the candidate's own `../../../src/contract/types.ts` lands on **this worktree's one contract** through the symlink, and its intra-prototype imports resolve inside the copy. Nothing under `src/` is duplicated: those files were verified byte-identical between this worktree and the member's home before copying (`sharedFileDiffs` below), and forking the contract per member is exactly what a portfolio must not do. The symlink is inside p4's owned subtree.

**Note.** RE-PINNED 2026-08-11 (M3 prerequisite, PARKED.md resume step 3). The M1 snapshot (commit `21131282af`) is superseded: P2 has since committed the four previously-untracked `tos/gradient/*` files and `tos/candidate.ts`'s edits at `2da8b74b`, and its STATE.md restates the provenance pin at `1b830141` as *any commit from `78f0285` through HEAD*. Commit chain, oldest first: `78f0285` (content-final, P2's own pin floor) → `21131282af` (M1's recorded HEAD) → `2da8b74b` (the gradient closure committed) → `1b830141` (pin restated) → `0ae62542` (HEAD at this re-pin). **One member file still differs from HEAD's bytes:** `tos/constants.ts` carries an uncommitted working-tree edit — `UNREADABLE_COVERAGE_FRACTION` 0.5 → 0.25, P2's DECISIONS.md D15, retagged [UNCALIBRATED] → [MEASURED]. That is a live behavioural change to the member, and it is what the re-pin captures: the fingerprint below, not the commit, remains the pin. Byte-identity gate re-run after the re-snapshot: **PASS, 3/3 rows** (`data/m1/runs/p2-tree-gate3-{home,snapshot}.jsonl`).

**Note.** RE-PINNED again 2026-08-11T18:44:28.480Z (M3 follow-up). P2 has committed the D15 edit that the previous re-pin recorded as uncommitted: `041fc4b4` ("apply D15 — `UNREADABLE_COVERAGE_FRACTION` 0.5 → 0.25 [MEASURED] + gate-affected tests re-asserted"). Commit chain, oldest first: `78f0285` (content-final, P2's own pin floor) → `21131282af` (M1's recorded HEAD) → `2da8b74b` (gradient closure committed) → `1b830141` (pin restated) → `0ae62542` (previous re-pin's HEAD) → `041fc4b4` (**this pin**; P2's HEAD, working tree clean of member-relevant edits — only untracked `out/` run artifacts remain).

**Correction, per the main tier.** The previous re-pin's claim that this member's code lived only in P2's *live working tree*, with no commit reproducing it, was **wrong as a durable statement** — it described a transient mid-flight state and then outlived it. `041fc4b4` contains all 19 files byte-for-byte. Concretely retracted: the "the commit does not contain this member" blockquote above (now replaced), the `snapshot content is in that commit: NO` row, and `pin-p2-tree.json`'s `committedAtHead: false` (now `true`, `differsFromHead: []`).

**No re-snapshot was needed and none was taken.** All 19 copied files were diffed against `041fc4b4:research/v3/…` before this pin: **byte-identical, 19/19**. The snapshot bytes are untouched, so the per-file sha-256 table below is unchanged, `codeVersion` `0795f6e7…` is unchanged, the byte-identity gate result above still stands unmodified (not re-run — its inputs did not move), and **no M3/M4 palette can differ under the new pin**: `data/m3/runs/p2-tree-coverage1{,-resume-1}.jsonl` record `codeVersion` `0795f6e7…`, the same code this pin certifies. The re-pin is a provenance correction with **zero code delta**.

## Files copied

Measured, not chosen: the closure is `computeCodeVersion()`'s own transitive relative-import walk from the candidate module — 27 files, of which 19 are the member's own (copied) and 8 are shared `research/v3/src` files (symlinked).

| copied file (path relative to the home `research/v3`) | sha-256 |
|---|---|
| `prototypes/p2-tree/tos/candidate.ts` | `1d15fd9ed3a9799e7a25d6a6464d7052d71d063f9a38744cb171f7fb9d3ab786` |
| `prototypes/p2-tree/tos/constants.ts` | `b00429ee57ecc419d1134bf74e70691d22da7f4d03dfec1a17887fb61308e0b4` |
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
