# `p1-mdl` — member snapshot provenance

**Verified 2026-08-11T12:39:15.550Z. Member code is READ-ONLY (P4 SPEC §4): copied, never edited.**

The member worktrees are live — two of them moved HEAD during M1 — so a commit hash alone does not pin a snapshot. What pins it is the per-file sha-256 of the measured import closure below, re-checked against the home worktree by `tools/verify-pin.ts`; the commit is recorded as the checkout those bytes were found in.

## Source

| what | value |
|---|---|
| source worktree | `/Users/Flo/GitHub/palette/.worktrees/p1-mdl` |
| pinned commit (HEAD at verification) | `149ee6d7faa8c4a0fce8c73f908dcf1faaa98d4a` |
| branch | `proto/p1-mdl` |
| home candidate module | `prototypes/p1-mdl/candidates/p1a-v1.ts` |
| snapshot candidate module | `members/p1-mdl/v3/prototypes/p1-mdl/candidates/p1a-v1.ts` |
| home `codeVersion` | `0c54a621a1c775e76db4cc303038efb561b65100e2ec7e7d8e66de6a43a5f7b2` |
| snapshot `codeVersion` | `a66ee452d38ff97485f593a7d2e756bba5b05c3ef4d4556836accb191ee72362` |
| snapshot content is in that commit | **yes** (0 copied file(s) untracked in the home worktree, 0 with uncommitted edits) |
| closure re-verified | **PINNED** at 2026-08-11T12:39:15.550Z (46 copied + 9 shared files re-hashed; 0 copied drifted, 0 shared drifted) |

The two `codeVersion`s differ **by construction and only by construction**: `code-version.ts` hashes each file's path *relative to its own `research/v3`* into the digest, and the snapshot lives at a different relative path. The per-file sha-256s below are the checkout-independent identity, and the byte-identity gate is what actually proves the code is the same code.

## Import resolution — how the snapshot runs unmodified

The member is copied into a **mirror of `research/v3/`** so that every relative specifier it was written with resolves exactly as at home:

```
members/p1-mdl/v3/src        ->  symlink to research/v3/src
members/p1-mdl/v3/prototypes/…  copied files, at their original relative paths
```

So the candidate's own `../../../src/contract/types.ts` lands on **this worktree's one contract** through the symlink, and its intra-prototype imports resolve inside the copy. Nothing under `src/` is duplicated: those files were verified byte-identical between this worktree and the member's home before copying (`sharedFileDiffs` below), and forking the contract per member is exactly what a portfolio must not do. The symlink is inside p4's owned subtree.

**Note.** **Probe member, and two disclosures.** (1) **Budget:** SPEC §4 says P1a runs at its 60 s budget as a probe. No 60 s candidate module exists in the p1-mdl worktree: `candidates/p1a-v1.ts` — the λ-repaired arm-a v1 module STATE.md names — hard-codes `BUDGET_MS = 240000`, and `candidates/p1a.ts` is the pre-repair v0 module at λ=1.0. Building a 60 s variant would mean editing member code, which SPEC §4 forbids, so the 240 s module is snapshotted verbatim and run on **3 covers only** (`data/m1/gate-3.txt`), not demo-20. Measured cost at that budget: **227.6 s median per cover** (3 workers), 251 s wall for three covers — the 60 s-vs-240 s question is therefore open and is the orchestrator's to settle. (2) **The first snapshot run FAILED all three covers** with `ENOENT … v3/data/legacy/endorsements.json`: p1's `src/emit/paths.ts` computes `LEGACY_DATA_DIR` from `import.meta.url`, a dependency no import walk can see. Fixed by declaring the directory and symlinking it (below) — not by editing p1 — after checking the four files under it are byte-identical between the two checkouts. The re-run gate then passed 3/3.

## Files copied

Measured, not chosen: the closure is `computeCodeVersion()`'s own transitive relative-import walk from the candidate module — 55 files, of which 46 are the member's own (copied) and 9 are shared `research/v3/src` files (symlinked).

| copied file (path relative to the home `research/v3`) | sha-256 |
|---|---|
| `prototypes/p1-mdl/candidates/p1a-v1.ts` | `fd09f31eb8e981f3d02dce5e12acb7052921d8a81b9afa2968e90893cbb7cef6` |
| `prototypes/p1-mdl/src/emit/cost.ts` | `89a7e005e87ba3b036d5a5374f5e2de539ade38858c8cb3664caf24ab8947c39` |
| `prototypes/p1-mdl/src/emit/feasibility.ts` | `31d2192839de89a3be476bdc68fb88d4deb5f2c019c7b4634e2a7f6434de837a` |
| `prototypes/p1-mdl/src/emit/legacy.ts` | `5d02bbd600ea390167ac036ad852db839e17c01aa413fdb9138d31b79040fc19` |
| `prototypes/p1-mdl/src/emit/palette.ts` | `96b61b6ef8230b120744f76960b8af6cda6006874dea6cacb6d92cbb0472a6c1` |
| `prototypes/p1-mdl/src/emit/paths.ts` | `5fcaf50b1d26070207082c701f7b57a83ffa4897e127da9f43c2610256942059` |
| `prototypes/p1-mdl/src/emit/source-meta.ts` | `4d4016746f0d642df0ca5df70d663a2f19a11700148b318b96a1eb25cc4b30f0` |
| `prototypes/p1-mdl/src/emit/types.ts` | `627b55b80917a6085a1bb80c79988212b0be5a9d8c401803f612ef8745fec00d` |
| `prototypes/p1-mdl/src/energy/a/constants.ts` | `028a746bd56570e70d0f9791c1a95fa138c2651420fed00bdd02e366493cb12f` |
| `prototypes/p1-mdl/src/energy/a/gamut.ts` | `3d1ae1330b94086dd41832c917e62c72a6a1f6d6f1f36c53af06984c97fd224f` |
| `prototypes/p1-mdl/src/energy/a/index.ts` | `0a968862cbed909dd962911c32c0d6f6db2834d1ab3f9e70246ae6a292be7932` |
| `prototypes/p1-mdl/src/energy/a/mixture.ts` | `036f81cb03b851ef74f7054009e24645cb5c75f9e4f7c14a555eb1899fa56b72` |
| `prototypes/p1-mdl/src/energy/a/path.ts` | `c0d28b23d2e13ae21c1d7b0c4dea8cac6b3be50c0757e338b4167550fab43ae2` |
| `prototypes/p1-mdl/src/energy/a/split.ts` | `8fe40bf1f3b6546d442c4b4ad5e0dd7fdb2f2bf0648463c7d5676174b75aef61` |
| `prototypes/p1-mdl/src/energy/a/support.ts` | `e01704da097bef7030685a49e6215aaebf3d394fc50b53c5a056e5c4a10d4c4d` |
| `prototypes/p1-mdl/src/energy/a/types.ts` | `ca4c037e32810baf1b10c867b656cd0dda21b0f088a8dbcf9c3e8e966fe84462` |
| `prototypes/p1-mdl/src/energy/aprime/chromatic.ts` | `d0597764a3cabec263076e2c178cb07ddcd2b1cbf485786de16ec086333fb3e0` |
| `prototypes/p1-mdl/src/energy/aprime/constants.ts` | `c3303f4c21f4240b1591d03d712d184bbf87a35af3b1b37fdf483bba417f7f3b` |
| `prototypes/p1-mdl/src/energy/aprime/index.ts` | `e3cad852b00cb59ac08a765358d8fdae9ad1c7ed2cda7f041004065a6231efb6` |
| `prototypes/p1-mdl/src/energy/aprime/support.ts` | `a6963ba7b6026b0da87f6ec52c53b882319a694861f26577de6e1dda8e5acbba` |
| `prototypes/p1-mdl/src/energy/aprime/types.ts` | `731a48884900b89061a693b8207988cfb60ff9e243730d5c7d740a287bd7b808` |
| `prototypes/p1-mdl/src/measure/canonical.ts` | `15aef7fbe5eabfe24da5a6be443124922995d75d0068fc70f0589288635cae03` |
| `prototypes/p1-mdl/src/measure/constants.ts` | `70b8df1d1dbb4fc86564e8978d7a6baaf3991057183007e3c203ccc0b80aafbd` |
| `prototypes/p1-mdl/src/measure/decode.ts` | `3051f7c956abfeeb23ffa09fd250d5c8c26fbe84f9ba87bb4976f68dd7b15fd6` |
| `prototypes/p1-mdl/src/measure/errors.ts` | `d03f4fe85e4e2523fc79aad4541f29e82ce294b9ef2a0e54d0f03618592be07c` |
| `prototypes/p1-mdl/src/measure/geometry.ts` | `d819bf15b156111c621856de97831e18ef91d037a2e495640d14645b23416f67` |
| `prototypes/p1-mdl/src/measure/grid-moments.ts` | `1b4c3dad2e1a5ff6c6ddf4b953a31735f5cdb56c938daf12d0e7f489f34eb802` |
| `prototypes/p1-mdl/src/measure/index.ts` | `1d9c59b1eb36ce6c18c265cbb9b9ef00317bee76d7fc11f6488107b3ed64543b` |
| `prototypes/p1-mdl/src/measure/joint.ts` | `5adeeac0616d6921e9d2d8269e99e8af52981d2e3d4221abebeb499ab34a0e3d` |
| `prototypes/p1-mdl/src/measure/kernel.ts` | `5f617675a2f3b1e0c2f8e07b737e032f1e588691d4cfd6bf83a59c22109547d5` |
| `prototypes/p1-mdl/src/measure/ladder.ts` | `4f2d0541ab7be8ed1418a3210ec3274fd0b19146856cd5ddd749c82c74888114` |
| `prototypes/p1-mdl/src/measure/linalg.ts` | `9159883c6add4917fac6035db2af6d8058bfaa619122c6b5403b72c7717fe1df` |
| `prototypes/p1-mdl/src/measure/smoothed-mass.ts` | `64306a75ba926c23f220a9812d50ce06345b88263c5985c6cfa83272c2905746` |
| `prototypes/p1-mdl/src/measure/triples.ts` | `ea475d5e5539e79be7d9f4eb1678105d353c58f809d33c5d67d4b148ca03657c` |
| `prototypes/p1-mdl/src/measure/types.ts` | `9616309c874bd96afaf84a18b2ff2d6ab97e1accd244ba07de934f193d40ea62` |
| `prototypes/p1-mdl/src/search/constants.ts` | `81345400d0c3a211fff878b55410d4fa05f4951fa570c51530e1c36bed41f226` |
| `prototypes/p1-mdl/src/search/conventions.ts` | `648e57b2bc872f657ea8cd4c8ca9d2fb2ba4608a98c15ebdd9052a5253217f1f` |
| `prototypes/p1-mdl/src/search/diagnostics.ts` | `e8550b72d90f34c24979c9926062aa658ada908e19c161cc012b27bce63951d8` |
| `prototypes/p1-mdl/src/search/enumerate.ts` | `6018e806c8d094eb3893e0ab66648fe6930185c911847ea28346c4ee12569bf2` |
| `prototypes/p1-mdl/src/search/evaluator.ts` | `2758ac37ce365c0e3d91e84c6a582014fab5d1f467fca3c8f41135709ec0fb90` |
| `prototypes/p1-mdl/src/search/image-facts.ts` | `87903b13455dc92bdbc1cceeaab3b6252f28b9bdd45b9a167f39345ec952d841` |
| `prototypes/p1-mdl/src/search/index.ts` | `e6c2e8d76eedc30c4de203faa66af3aeb8db4588d962b68c836479fe6fa262d0` |
| `prototypes/p1-mdl/src/search/lattice.ts` | `07537767ee27375e837be14ef3bb5df6356ea6deb505a58cf5ef2c4213f1e941` |
| `prototypes/p1-mdl/src/search/plan.ts` | `c54f4b58c2a84ce4ebbbd47a52fc684dbb38dd269967a67ec87f5d35e7b5ee63` |
| `prototypes/p1-mdl/src/search/refine.ts` | `a7c9c6dcf27dd35cd8d12a38a301e8bd798fb71908ce11d7cef33aef9f38e946` |
| `prototypes/p1-mdl/src/search/types.ts` | `5c1793d1f645900db78cbae2a50fdd2741bc484f536ed4447b0bdad6dc554064` |

### Shared, not copied (reached through the `src` symlink)

- `src/contract/challengers.ts`
- `src/contract/color.ts`
- `src/contract/constants.ts`
- `src/contract/invariants.ts`
- `src/contract/ramp.ts`
- `src/contract/scorecard.ts`
- `src/contract/types.ts`
- `src/devloop/code-version.ts`
- `src/devloop/types.ts`

Byte-identical home-vs-p4 check on those 9 files: **0 differ**.

### Runtime data dependencies (symlinked, not copied)

The import closure cannot see these — they are read through a path the member *computes* at runtime, not through an import — so they are declared explicitly and symlinked the same way `src` is, after every file under them was verified byte-identical between the two checkouts:

- `data/legacy` → `research/v3/data/legacy`

Byte-identity check on those trees: **0 files differ**.

## Byte-identity gate

**PASS** — 3/3 rows identical.

- home run: `data/m1/runs/p1-mdl-gate3-home.jsonl`
- snapshot run: `data/m1/runs/p1-mdl-gate3-snapshot.jsonl`
- median `computeMs` on the gate covers: home 293371.29479200003, snapshot 227585.33325

Compared: the palette JSON, `inputContentHash`, `ok`, `error` — serialized and string-equal, so key order and number formatting count. The single normalization is each row's own checkout-root prefix (`imagePath`'s grandparent), because `imagePath` and `metadata.sourceRendition.path` name the same bytes under two worktrees; `strictIdenticalRows` (0) reports the count with no normalization at all so the difference stays visible. The demo-20 shards were verified byte-identical across all five Phase-2 worktrees before any run.
