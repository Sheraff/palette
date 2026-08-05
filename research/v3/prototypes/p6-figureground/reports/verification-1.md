# P6 independent verification 1 — the implementers' claims, re-derived by other paths

W11b, 2026-08-05. Recovered and completed from W11's session-limited on-disk partial. Everything
below is `tests/verifier.test.ts`, which re-derives each claim by a path that does **not** run the
code the claim is about, wherever that is possible.

**Adversarial standing rule:** credit here is for discrepancies, not confirmations. Defects found in
the code under test are **reported, never fixed** — this worker owns `tests/verifier.test.ts` and
this file, nothing else.

## Headline

Five of the six checks CONFIRM the claim as stated. One finding, and it is about a document rather
than about code: the committed `ROUND.md`'s `## Staging checks` section **drops three attestations
`stage-round.ts` emitted**, including the blinding attestation for the very defect that retired the
round's first staging. Two further items are notes on the reports rather than defects.

Everything the reports claim about the *solver* and the *contract* survives independent
re-derivation exactly — including at float-bit level (§5) and across process boundaries (§4).

## Running it

    NODE_NO_WARNINGS=1 node --experimental-strip-types --test \
      research/v3/prototypes/p6-figureground/tests/verifier.test.ts

Default run: **0.7 s**, 10 tests, 5 pass / 1 fail (the finding) / 4 skipped.

    P6_VERIFY_HEAVY=1 NODE_NO_WARNINGS=1 node --experimental-strip-types --test \
      research/v3/prototypes/p6-figureground/tests/verifier.test.ts

Heavy run: **89 s**, 10 tests, 9 pass / 1 fail (the finding) / 0 skipped. `P6_VERIFY_TRIPLES` and
`P6_VERIFY_REAL_GRID` override the instance sizes.

**Timing caveat.** Both runs were measured under heavy CPU contention: a concurrent worker was
running `tools/sensitivity.ts --sweep --concurrency 4` in this same worktree (writing
`reports/sensitivity-1/`, which is *not* this worker's path), alongside three saturating
`src/robustness/check.ts` jobs in sibling worktrees. Every wall time quoted here is therefore an
**upper bound**; the per-check `duration_ms` figures in the tables are similarly inflated. The
correctness results are unaffected — nothing in this file depends on timing.

---

## CHECK 1 — the solver against an independently written enumerator — **CONFIRMED**

The enumerator in this file shares no line with `solve.ts`'s own `exhaustive: true` path (which is
the same file, the same loops and the same lists as the path it checks, so it is not an independent
oracle). It consumes only the *definitional* pieces — `terms.ts:unaryCost`, `coverage.ts`'s
quadrature, `barriers.ts:violatedBarriers` — and enumerates every tuple itself. Roles, collapse
flags and `energy.total` are compared for exact equality.

| instance | triples | tuples costed | barrier scans | brute | pruned evaluated | verdict |
|---|---|---|---|---|---|---|
| `nearTies` | 216 | 20 202 048 | 813 | 7.5 s | 5 | exact match |
| `infeasibleTop` (barrier-infeasible attractive tuples) | 216 | 10 124 352 | 94 400 | 3.3 s | 55 | exact match |
| `collapsePreferring` | 216 | 10 124 352 | 447 | 3.9 s | 42 | exact match |
| **real cover** `…00000133…` @16² | **519** | 279 866 079 | 602 810 | 69.0 s | 249 | exact match |

The branch-and-bound evaluates **5–249 tuples** where exhaustion costs 10⁷–10⁸. That pruning ratio
is the claim most worth attacking and it survives: on all four instances the pruned argmin is the
brute-force argmin, bit for bit.

**Note (harness, not code).** W11's header claimed grid 16 gives "≤256 distinct triples". Wrong: the
substrate's blur ladder invents colours the downscale never had, so grid 16 measures **519** triples
on the reference cover (20→575, 24→597, 28→604 — the count saturates, and cost grows ~n³). 519 is
inside the brief's 300–800 band, so the default stands; the check now asserts the *band* rather than
trusting the grid.

## CHECK 2 — "scorecard 18/18 valid, 0 violations" — **CONFIRMED, and stronger than claimed**

Re-run from the run artifact and the staged fixture rather than quoted from a report, through both
`validatePalette` (hard mode) and `scorePalette` from `src/contract`.

| artifact | items | valid | violations | contrast escapes used |
|---|---|---|---|---|
| latest full run (`…demo-20-terminating-20260804T222031940Z.jsonl`) | 18 | **18/18** | **0** | 0 |
| `review-rounds/p6-round-1/fixture.json` (restaged) | 6 | **6/6** | **0** | 0 |

`second-palettes.md:134` claims "valid 18/18, 0 violations". Confirmed verbatim.

**Deferred checks, reported because the scorecard's "0 violations" is conditional on them:**
`I5.transparency-report` ×18, `I2.source-support` ×18, `I2.spatial-spread` ×18 — deferred because
they need the decoded artwork, which the scorecard path does not carry.

So CHECK 2c re-runs invariant 2 **with the artwork decoded**, which is the condition the reported
scorecard could not test: **18/18 valid, 0 violations**. The deferral was not concealing anything.

## CHECK 3 — the fixture parses, and both payloads are blind — **CONFIRMED**

`fixture.json` (paths absolutised exactly as the pusher does) parses through the real
`parseCalibrationBatch`: 6 items, `purpose: "calibration"`, `batchId: cal-bd66a37d` — the tool's
content-derived placeholder that the installer overwrites at push.

The blindness scan here is written in this file, not imported from `stage-round.ts` (which is the
tool that wrote the files being scanned). Zero leaks of candidate id, run id, code version, set hash,
candidate path, cover path, content hash, palette hash or variant id. The side-car's key set is
exactly `{questionKey, side}` and `side`'s is exactly
`{accentCollapsed, fieldCss, gradient, roles, surfaceCollapsed}` — render data only.

**Gap closed by W11b.** W11's scan looked for the *candidate's* tokens (`p6-figureground`, the run
id, the code version). That scan **already passed on the retired staging** — whose item ids were
`p6-round-1-NN-<hash>`, containing none of those strings. What retired staging 1 was the **round
name's** tokens, and nothing looked for them. Added: a scan of the reconstructed served surface,
built from `src/review-server/round-kit.ts`'s `ITEM_FIELD_ALLOWLIST` rather than from the staging
tool — 25 served strings × 6 tokens (`p6`, `round`, `figureground`, `figure-ground`, `devloop`,
`p6-round-1`), with word-ish boundaries so `background`/`foreground` do not false-positive.
**0 leaks.**

**Worth recording — where the leak channel actually is.** Per `round-kit.ts` and `server.ts:1594`, a
blinded round page gets `token`/`media`/`itemRef` built from an **opaque per-batch token**, so the
fixture's item id cannot reach them. But `questionKey` is served **verbatim** (`server.ts:1593`), and
in this fixture `questionKey` *is* the item id. That is the channel staging 1 leaked through, and the
only one under this prototype's control. `ROUND.md`'s correction-of-record says "every served item id
and media URL carried the prototype identifier" — the media URL carried it via the **batch id**
(which was the round name), not via the item id. The narrative is right; the mechanism it names is
loose in a way that matters if anyone reuses it as a rule.

## CHECK 4 — cross-process byte-determinism — **CONFIRMED. Field mask: EMPTY**

`paletteOf` run twice in **separate node processes** per cover, full `Palette` JSON byte-compared.

| cover | regime (re-measured) | verdict | sha256/12 |
|---|---|---|---|
| `…00000133…` (set 2 = demo 2) | healthy, max coincidence 1.00e+00, 604 triples | **byte-identical** | `7989de32c82d` |
| `…1448e1c8…` (set 9 = demo 10) | dead, max coincidence 3.67e-04, 8 887 triples | **byte-identical** | `4ceda7c96185` |
| `…1ecff3d9…` (set 12 = demo 14) | dark/greyscale, max coincidence 3.09e-07, 256 triples | **byte-identical** | `cb6c9f9087ea` |

**The field mask the brief asked for is empty.** No field of the published `Palette` differs between
processes on any of the three covers — there is no timestamp, no run id, no hostname, no iteration
count, no floating-point drift. Nothing is legitimately nondeterministic, so there is nothing to
document and no undocumented nondeterministic field to report.

**Trap, recorded because it cost this worker a false alarm.** The census table in
`second-palettes.md` has **two** index columns, `demo #` and `set #`, and the dev-loop run's per-row
`index` is the **set #**. Reading it as a demo # makes the census prose look wrong (set 9 measures
3.67e-4, below the 1e-3 threshold, yet "9" is absent from the prose's list of covers below it). It is
not wrong: set 9 *is* demo 10, which the list does name. All three labels above were re-measured with
`tools/first-palettes.ts --probe --brief` and match the table exactly.

## CHECK 5 — per-term energy re-derivation — **CONFIRMED to 2.8e-17**

Every term of the winning tuple on `…00000133…`, recomputed by hand from `statsAt` /
`measureExcursion` / `unaryCost` / the coverage quadrature, against `Solution.energy.terms`. The
shipped key set and the re-derived key set are asserted equal, so a term cannot pass by being absent.

| term | shipped | re-derived | Δ |
|---|---|---|---|
| `field.descriptionLength` | 1.354543641853810 | 1.354543641853810 | 0 |
| `unary.background` | 0.145113618943242 | 0.145113618943242 | 0 |
| `unary.surface` | 0.214351552730247 | 0.214351552730247 | **2.78e-17** |
| `unary.foreground` | 0.382673108714867 | 0.382673108714867 | 0 |
| `unary.accent` | 0.604227924946150 | 0.604227924946150 | 0 |
| `belonging.background` | −0.408246616518729 | −0.408246616518729 | 0 |
| `belonging.foreground` | −0.605030682802639 | −0.605030682802639 | 0 |
| `belonging.accent` | −0.376868551015080 | −0.376868551015080 | 0 |
| `collapse.surface` | 0 | 0 | 0 |
| `collapse.accent` | 0 | 0 | 0 |
| `coverage` | 0.101841263206426 | 0.101841263206426 | 0 |
| `total` | 2.802751110394741 | 2.802751110394741 | 0 |

Worst per-term delta **2.78e-17** (one ULP at that magnitude), on `unary.surface` alone. The breakdown
is faithful.

**Note — the terms map is not naively summable, and nothing says so.** The additive subset
(`field.descriptionLength` + the four `unary.*` + the two `collapse.*` + `coverage`) sums to
**2.802751110394741**, matching `total` exactly (Δ 0). But summing *all* non-`total` keys gives
**1.412605260058292** — off by **1.390145850336448** — because `belonging.*` are *components of* the
`unary.*` they sit beside, not siblings of them. Any consumer that reduces over `Object.values(terms)`
gets a wrong number with no error. This is a report/consumer hazard, not a defect in the energy.

## CHECK 6 — staged-round byte-reproducibility — **CONFIRMED for payloads; FINDING on `ROUND.md`**

Re-ran `tools/stage-round.ts` out-of-tree with the same arguments the orchestrator used for the
restage. Those arguments are recoverable from the artifact itself: `private-mapping.json`'s
`provenance` block is written **only** from `--supersedes` / `--superseded-item-ids` (the tool omits
the whole block when neither is passed), so it reproduces them exactly.

| file | verdict |
|---|---|
| `sidecar.data.json` | **byte-identical** |
| `fixture.json` | differs **only** in the documented git state (`fingerprint.gitCommit`, ×6) |
| `private-mapping.json` | differs **only** in the documented git state (`stagedFrom.gitCommit`) |
| `ROUND.md` | hand-filled after staging (documented) — **see finding** |

The tool documents exactly one environment-dependent input: `gitCommit`/`dirty`, "read from the
working tree, which is *state* and not time". Masking those two keys, the two JSON payloads reproduce
byte for byte. **The staging tool is deterministic as claimed.**

### FINDING — the committed `ROUND.md` drops three staging attestations the tool emitted

`ROUND.md` is the one file the tool documents as *not* byte-final: it emits TODO placeholders and
tells the orchestrator to fill them in, so added prose is the documented workflow. But inside
`## Staging checks` there is nothing to fill in — every line the tool puts there is an assertion the
tool made about **this** staging. Three of them are **absent** from the committed file:

```
- item ids are content-derived and name nothing about this prototype (filename-stem).
- `batchId` is the placeholder `cal-bd66a37d`, derived from the item ids — the installer assigns
  the real batch id at push.
- no served string — item id, batch id, media URL, side-car key or fixture field — carries the
  round name or any of `p6`, `figureground`, `figure-ground`, `round`, except
  `fingerprint.algorithmVersion`, which the server never serves.
```

The third is the one that matters. **The round that was retired for a blinding defect no longer
records, in its own staging-checks section, that its replacement was scanned for that same defect.**
The committed file's correction-of-record prose does say the *test* now checks served strings, but
that is a statement about the test suite, not the tool's attestation that this staging passed. A
reader of `ROUND.md` cannot distinguish a check that was never run from one whose line was edited
away — which is precisely the failure mode the retirement was about.

The first two are restated in reworded form in the hand-written header, so they are wording changes.
The check is scoped to the `## Staging checks` section deliberately: elsewhere the orchestrator is
*told* to rewrite, and judging that would mean judging prose.

**Not fixed here** (this worker does not own `review-rounds/`). Reported for the orchestrator.

### Also unfilled, and pre-registered as required before submission

`fixture.json`'s `fundedBy` is `[]`, and `ROUND.md`'s own "Before submission" step 1 says to fill it
with the record ids of the evidence that motivated the batch. The round is not submission-ready by
its own checklist.

---

## Recovery notes — what W11's partial got right and wrong

The partial was **usable and largely complete**: all six checks were present, structurally sound, and
not truncated mid-write. It was recovered rather than restarted. Four repairs:

1. **CHECK 3 asserted `batchId === "p6-round-1"`** — written before the restage, and asserting the
   exact string that *is* the retired defect. Now asserts the id ROUND.md declares and that it
   matches the tool's neutral `cal-<hex>` placeholder shape.
2. **CHECK 6 omitted `--supersedes` / `--superseded-item-ids`**, so it was re-staging a *different*
   round than the committed one; its `private-mapping.json` mismatch was a harness artefact, not a
   finding. Now recovers both from the artifact's own `provenance` block.
3. **CHECK 6 asserted byte-equality on `ROUND.md`**, which the tool documents as hand-filled — the
   wrong assertion. Split into CHECK 6 (payload determinism, passes) and CHECK 6b (attestation
   preservation, the finding), so a red 6b cannot be misread as a non-reproducible staging tool.
4. **The blindness scan never looked for round-name tokens** — the defect class that caused the
   retirement. Added (CHECK 3), passes.

Plus two documentation corrections in the harness: the "≤256 triples" claim (§1) and the
unsourced determinism-cover labels, now traced to the census table with the set#/demo# trap recorded
(§4).

## Deviations from the brief

- **None on scope.** Only `tests/verifier.test.ts` and this file were written. No defect found in the
  code under test was fixed.
- The brief asked for the check-4 covers to be picked "from `second-palettes.md` tables". W11 had
  picked them by identity without citing rows; all three were re-measured and *are* table rows
  (set 2 / 9 / 12), so they were kept rather than swapped.
- CHECK 1's real-cover instance runs at 519 triples on the default grid, inside the brief's 300–800
  band, so `P6_VERIFY_REAL_GRID` was left at 16.
- Timings were taken under concurrent load from another worker in this worktree (see the caveat
  above) rather than on an idle machine. Nothing was committed; `git status` shows only
  `tests/verifier.test.ts` and `reports/verification-1.md` from this worker.
