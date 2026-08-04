# P2 round 1 — tree families

**Kind:** pairwise, blinded. **Items:** 8 covers, two sides each, on the real mock player.
**Answers per item:** the four role grades for each side, then a preference, then an optional veto
and free note. **Staged 2026-08-04** by the round-staging worker; the main orchestrator installs it.

## The question

**Which tree family's reading of a cover do you prefer — and are these palettes acceptable at all at
skeleton stage?** Both are cycle-1 prototypes and neither owes quality yet, so the second half of
that question is not a formality: "both unusable" is a result this round is built to be able to
return, and the preference is only worth reading if at least one side clears the floor.

## Items

Two candidates, one cover each, same bytes both sides. The classes below come from the tree-of-
shapes pipeline's own field verdict (`tos/out/demo-20.nodes.jsonl`); they name the **cover**, not
either reading of it, which is why they can be used to stratify a round that judges both.

| # | cover (`00/…`) | class | why it is here | gradient A / B |
|---|---|---|---|---|
| 1 | `00007e976f2f…3ba3` | partitioned | class representative, first by sorted path | – / – |
| 2 | `ab67616d…00d8bc25…2a4a` | flat | the only flat cover in demo-20 | – / – |
| 3 | `ab67616d…01335fe6…9094` | laminar | gradient disagreement | – / **yes** |
| 4 | `ab67616d…0bbc3367…e593` | unreadable | class representative, first by sorted path | – / – |
| 5 | `ab67616d…0f92552b…964d` | textured | the only textured cover in demo-20 | – / – |
| 6 | `ab67616d…13cdd885…2abc` | laminar | gradient disagreement | **yes** / – |
| 7 | `ab67616d…1448e1c8…66f4` | laminar | gradient disagreement | – / **yes** |
| 8 | `ab67616d…18e9b0ec…0164` | laminar | gradient disagreement | **yes** / – |

**All four laminar covers are in, deliberately.** They are every cover on which one side publishes a
gradient and the other does not — the sharpest structural disagreement the two families produce, and
the only place a reviewer can say whether a published ramp is a reading of the cover or an artefact.
The other four are one representative each of the remaining classes, taken **first by sorted image
path** within the class so no cover was chosen for how it looks. Full selection state, including
each cover's coverage number, is in `mapping.private.json`.

## What each outcome does

- **v-tos preferred** → the α-tree is demoted to a reference implementation; P2's cycle-2 investment
  goes to the tree of shapes.
- **v-alpha preferred** → before any further tos investment, the tos pipeline's representative-colour
  instability is investigated: its published roles moved on 4 of 20 covers between two code versions
  less than a minute apart, while its gradient set and its verdicts did not move at all.
- **Both sides weak** (grades at or below the floor on most items) → no more rounds this cycle;
  cycle-2 quality work first. A preference between two unacceptable readings is not a finding.
- **Any veto** → the vetoed cover's class gets a targeted fix before that class appears in another
  round, and the veto is recorded against the class, not the item.

## Blinding

Side A/B **alternates by item index parity** — neither position belongs to a candidate, and the
alternation is visible in the file without being decodable from it. `items.json` carries the blinded
labels `p2-tree-cycle1-v1` / `-v2` only; `validate.ts` scans its raw bytes and fails on any candidate
id, family name, or field verdict. That scan is why each side's `fingerprint.algorithmVersion` is the
blinded label and not the pipeline's own string — `p2-alpha-0.1.0` and `p2-tos-0.1.0-cycle-1` name
the candidate outright. The true versions, code versions and run files are in `mapping.private.json`,
so nothing was dropped; it was moved.

> **`mapping.private.json` is not servable.** It is the decode key — itemId → {A, B} candidate — and
> it exists so the orchestrators can read the results after release. It must never be copied into a
> batch fixture, a media directory, or anything the review server can reach.

## Provenance

Palettes are read from the latest dev-loop run of each candidate over `demo-20`
(`p2-alpha-…T171812541Z.jsonl`, code `a6b0a962`; `p2-tos-…T171511526Z.jsonl`, code `a51c1309`), both
20/20 ok. Each was re-run three times at its code version with byte-identical output, so no rerun was
needed. `gitCommit` `6f1d9ca3`, `dirty: true` on both sides (untracked `alpha/out/`, `tos/out/`).

**One caveat, recorded rather than hidden:** the node dump supplying the class labels was written at
tos code `c5d55eb2`, one version behind the published run. Its verdicts and its gradient set match
the published run exactly; its role colours match on 16 of 20 covers. Classes therefore come from the
dump and **every colour in `items.json` comes from the run** — the dump is never a source of a hex.

## Reproducing

```sh
node --experimental-strip-types build.ts     # rewrites items.json + mapping.private.json
node --experimental-strip-types validate.ts  # exit 0 or it does not ship
```

Both are deterministic: inputs are pinned by filename, every ordering is a sort over image path, and
a second `build.ts` run reproduces both files byte-for-byte.
