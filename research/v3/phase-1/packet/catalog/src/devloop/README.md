<!-- Phase 1 author packet — provenance
     source: research/v3/src/devloop/README.md
     commit: 71a1d62d51006dd8f353e8c0bc6e4434bdb0c4b2
     date:   2026-08-04
     This file is a verbatim copy of the source above, assembled for a Phase 1 author packet.
-->

# The dev loop

**Status: built and working, 2026-08-04.** Four pieces that are one workflow: run a candidate over a
set of covers, get the second run for free, look at what came out, and see what your last change did.

Nothing here judges a palette. The loop produces palettes and shows them; judgement stays where it
already lives — the review server, the reviewer, the warehouse.

---

## The loop, in four commands

```sh
cd research/v3

# 1. run a candidate over a set
node --experimental-strip-types src/devloop/run.ts \
  --candidate src/devloop/candidates/toy-median-offsets.ts \
  --set data/devloop/sets/demo-20.txt

# 2. change the candidate, run again — the cache makes the unchanged work free
node --experimental-strip-types src/devloop/run.ts \
  --candidate src/devloop/candidates/toy-median-offsets.ts \
  --set data/devloop/sets/demo-20.txt

# 3. look at either run, and at the difference between them
node --experimental-strip-types src/devloop/serve.ts     # http://127.0.0.1:8791/

# 4. or read the difference as text
node --experimental-strip-types src/devloop/diff.ts <before.jsonl> <after.jsonl>
```

Tests:

```sh
NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/devloop-*.test.ts
NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/review-server-round-kit-browse.test.ts
```

---

## 1. The runner — `run.ts`

Takes a **candidate module** and a **set file**, runs the candidate across the machine's cores, and
writes one JSONL file: a provenance header, one row per image, a footer with the tallies.

A candidate module exports exactly two things (`types.ts`):

```ts
export const candidateId: string
export const paletteOf: (imagePath: string) => Promise<Palette>   // Palette from ../contract
```

A path rather than a decoded buffer, because decoding is part of what a candidate does — §1 of
`PHASE_0_DECISIONS.md` forbids resampling, dimensions come from the decoder's header, and a runner
that pre-decoded would be fixing a preprocessing choice on every candidate's behalf.

**A set file is a list of image paths**, one per line, `#` for comments, relative paths resolving
against the repository root. Twenty covers is an ordinary set; the coverage set is 220; the full
corpus is just a bigger file. Nothing in the runner defaults to or implies the whole corpus — a loop
that costs seventeen minutes per one-line change is a loop that stops being run.

**Rows are written in set order, never completion order.** Results come back from the pool as workers
finish and the parent holds them until the next index is ready. That buys the property everything
downstream leans on: two runs of the same candidate over the same set produce identical rows, so a
diff between two runs is a statement about the candidates and never about scheduling.
`deterministicPart()` names exactly which fields carry that promise (`index`, `imagePath`,
`inputContentHash`, `ok`, `palette`, `error`) and which are incidental (`cached`, `computeMs`).

**A failure is a row, not a missing line.** A candidate that throws on eleven covers has told you
something; it has told you nothing if those eleven simply do not appear.

**The header** carries the run id, the candidate id and path, the measured `codeVersion`, the set
path and `setHash`, the image count, the start time, `nodeVersion`, the worker count, and
`packageVersions` — both the **declared** range and the **resolved** installed version, because
`CONVENTIONS.md` records that this repository carries two `sharp` versions on purpose and they decode
some AVIFs differently.

**`--verify <run.jsonl>`** re-derives that provenance from what is on disk now and exits 1 if it
disagrees. This is the house `--check` pattern (`src/honesty/cli.ts`), and the "re-run and diff"
`reviews/toolbox-review/gap-scan.md` (F) asked every analysis output to support. It does not re-run
the candidate; that is what a second run and the diff are for.

## 2. The cache — `cache.ts`

Content-addressed, keyed on **(input file hash, computation id, code version)**. The runner uses it
automatically inside each worker; there is no invalidation command and no habit to acquire.

**Stale by construction.** All three key parts are measured, never declared, and the third is the one
that matters: `code-version.ts` hashes the candidate's source **and everything it imports,
transitively, through relative specifiers**. So editing `../contract/color.ts` moves the key of every
candidate that reaches it. Bare specifiers (`sharp`) are deliberately *not* followed — a package is
an environment fact, and it travels in `packageVersions` instead, so "the decoder changed" and "the
candidate changed" stay distinguishable when reading back why two runs disagree.

This is the design `gap-scan.md` item (E) asked for ("keyed on (content hash, operation, params)", "a
cache key covering the **full dependency closure** makes that kind of voiding structurally
impossible"), and it is measured rather than declared because the alternative has already cost this
project an audit: the 0.7.7 discovery audit was voided because its implementation hash omitted
runtime dependencies.

The failure this guards against is not a wrong number, it is a wasted day: you tighten a candidate,
re-run, the old palettes come back, and you go looking for the bug in the code you just fixed.

Layout — plain files, no index, greppable on purpose:

```
data/devloop-cache/<computationId>/<codeVersion[0:16]>/<inputHash[0:2]>/<inputHash>.json
```

The path carries a **truncated** code version for legibility; the entry carries the full one and is
checked against it on read, so a truncation collision is a **miss**, never a wrong answer. A corrupt
or half-written entry is also a miss — the only correct response is to recompute. Only successes are
cached: a failure is usually about the environment, and caching it would make it outlive its cause
while looking exactly like a result.

Gitignored, via a self-ignoring `.gitignore` in the directory itself. It is derived data, which is
the property `PHASE_0_LOOSE_ENDS.md` C7 wishes a committed 1.08 MB measurement cache had.

## 3. The viewer — `serve.ts` + `review-ui/devloop-run.{html,js}`

A run's palettes beside the artworks they came from, through the **pinned mock player** — the one
`mock.js`, the one `[REVIEWED]` gradient display mapping, the one `colornames-oklab` naming call
site. `side.ts` routes a contract `Palette` into that shape and decides nothing itself. A dev viewer
that built its own ramp would be showing a developer something no reviewer will ever see, and the
difference is real: up to 0.153 OKLab mid-segment if only the interpolation space is wrong.

**The page is on the round kit, in browse mode** (`ROUND_KIT.md`: no new review page is written
outside the kit). Browse mode is a **kit extension**, not a bespoke page — see §5.

**It is not the review server, and that is the design.** `serve.ts` has no warehouse, no batch log, no
reviewer id, and answers `405` to every method that is not a read. Two consequences that look like
omissions and are not:

- **No blinding and no payload allowlist.** The review server withholds the algorithm version, the
  content hash and the image path from a page because a reviewer who can see which arm produced a
  palette is not grading the palette. Here the developer *is* the author: the arm is the thing they
  are looking at and the path is what they need to reproduce it. Projecting the payload would hide
  exactly the fields that make a dev viewer useful, to protect a judgement nobody is making.
- **No answers, and no way to give one.** The pages run in browse mode, where the one function in the
  kit that posts an answer throws.

## 4. The diff — `diff.ts` + `review-ui/devloop-diff.{html,js}`

Two runs over the same set, ordered by how much each cover moved, biggest first, before and after
side by side in the same viewer.

**The metric is `maxRolePairDistance`** — the largest OKLab distance between corresponding role
colours:

```
max over {background, surface, foreground, accent} of okLabDistance(before[role], after[role])
```

Why this one:

1. **It is the contract's own ruler.** `PHASE_0_DECISIONS.md` §3 fixes OKLab as the single space this
   project measures colour distance in, and the numbers are meant to be read against the same-colour
   bar (`SAME_COLOR_BAR_BY_REGION`) every other v3 judgement uses.
2. **Max, not mean.** A change that ruins one role and leaves three alone is as visible to a reviewer
   as one that ruins all four; averaging is what makes it disappear. The mean is reported beside it.
3. **Roles only.** Gradient and collapse changes are recorded on every entry (`gradientChanged`,
   `maxStopDistance`, `collapseChanged`) and kept **out of the ordering number** so the headline means
   one thing. A gradient-only change still sorts above the untouched covers — see `changeRank`.
4. **It is a magnitude, not a verdict.** A big number is not a regression. The reviewer's standing
   principle is that there are many valid palettes; this decides what you look at first, nothing else.

Covers are joined on **image path**, not position, so a set file that gained a line at the top does
not report the whole run as changed. Ties break on path, so the same two runs diff the same way
twice. A cover that **started failing** sorts above everything measurable; one that failed in both
runs sinks to the bottom. `inputChanged` says out loud when the bytes under a path moved — the
palette changed, but not because the candidate did.

## 5. Browse mode — the kit extension

`round-kit.js` gained `browse: true` and a `browseOnly` widget. A read-only viewer needs the kit's
payload fetch, navigation, visible-failure guarantee and generated keymap, and simply has nothing to
record — that is a **missing widget, not a missing framework**, and writing a page outside the kit is
what put three broken pages in front of the reviewer in three days.

**"Records nothing" is structural, not a promise.** `post()` throws in browse mode before it has a URL
to write to; `answer()`, `save()` and `release()` refuse; the note key, the undo key, `Enter` and `r`
are unbound and left *unhandled* rather than swallowed; and progress counts position only, because
"0 done" on a page that can never record anything is advertising a tally that will never move.

Tested in the kit suite (`tests/review-server-round-kit-browse.test.ts`), not beside the pages. That
file also closes a real harness gap: the kit requires dynamic imports to be root-absolute
(`import("/mock.js")`), which under Node is a filesystem path resolving to nothing — so **no page
using the pinned mock player had ever been executed in a test**. A `module.registerHooks` shim maps
that specifier to `review-ui/`, and both dev pages now render the real `mock.js` under test.

## 6. The toy candidate — **not a palette algorithm**

`candidates/toy-median-offsets.ts` exists to give the loop something to run so the loop can be tested
end to end. It is deliberately, visibly dumb: the channel-wise median of every pixel, moved by four
made-up OKLab offsets, then snapped to the nearest colour that actually occurs in the artwork.

**It is not a baseline, not a control, and not a starting point.** The snapping in particular is not a
design idea — it is the cheapest way to satisfy invariant 2 so the toy's output is contract-shaped and
can flow through every downstream instrument. Naive pixel-snapping is explicitly *not* how the real
algorithm should choose colours. What is worth copying from it is the **shape**: header dimensions,
transparency refused rather than flattened, exact source pixels, and the whole contract filled in.

---

## Known and open

- **Two decision records are owed to `data/decisions/decisions.json`**: the cache-key design (measured
  full-dependency-closure source hash, `fundedBy` empty) and the browse-mode/separate-server split.
  They were not appended because that file, `PHASE_0_LOOSE_ENDS.md` and `research/v3/.gitignore` all
  held another workstream's uncommitted changes when this landed, and `CONVENTIONS.md`'s
  explicit-pathspec rule exists because agents have swept each other's parked work into their commits.
  Owner: this workstream, with the orchestrator. **Revives when:** those files are not in flight.
- **The parameter-honesty census is one site behind** this workstream's latest edits
  (`tunable sites 5159 → 5160`). The committed report is currently **staged by the honesty
  workstream**, so regenerating it would overwrite their parked work; it is theirs to regenerate. Every
  *named* constant in `src/devloop/` carries a provenance tag; the untagged sites the census counts
  here are HTTP status codes and slice indices, the same class as the rest of the repository's
  backlog, which `V3_PLAN.md` row 12 records as a Phase 1 obligation per workstream (ledger **B29**).
- **The runner does not validate.** It shows what a candidate published, invalid palettes included —
  `src/contract/invariants.ts` is the instrument that judges them, and running it here would mean a
  dev loop that hides its own candidate's contract violations behind a filter.
- **A run file is one filter away from an adjudication run file.** `src/adjudication/` reads JSONL
  with one `{palette, arm?}` per line; the `ok` rows here carry `palette` in the contract's shape. No
  exporter is built, because nothing has asked for one yet.
