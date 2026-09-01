# V3 — Plan, Process, and Ideas

**Status:** **Phase 0 built and complete, 2026-08-03.** Plan proposed 2026-08-02; §6's Phase 0
exit criteria are met, **with the two pipeline-facing rows (4 and 5) explicitly carved out** and
moved to the Phase 2 entry condition — see §6 for the status table, the carve-out argument and
the pointers. Phase 1 is **gated on
an adversarial review of Phase 0** — reviewer directive, 2026-08-03. Phases 1–3 remain proposal.
**Working model:** Claude Fable as architect/orchestrator, Opus subagents doing all implementation
work in isolated arms, Flo as the sole reviewer and ground truth.
**Companion documents:** `ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md` (dev-time VLM oracle),
`ORACLE_QUESTION_SET.md` (the oracle question set — v2; group A piloted and measured, groups
B/C/D/E piloted 2026-08-03 on both the model and the human side, group F still untouched),
`PHASE_0_DECISIONS.md` (input policy, output contract, metrics — working decisions),
`REVIEW_UI.md` (review server, verdict model, warehouse, oracle-validation mode),
`PHASE_0_LOOSE_ENDS.md` (every deliberately-open item, with owner and revival condition),
`PHASE_1_AUTHOR_BRIEF.md` (what a Phase 1 proposal author receives — and what they deliberately do
not),
`data/decisions/` (standing decision records, machine-recheckable against the warehouse).

---

## 1. What v3 is for — and what it cannot be for

**v2-3's headline acceptability figure is withdrawn. There is no inherited numeric anchor.**
*(2026-08-04 — the reviewer's ruling: the number was fake and must never be quoted. What stands in
its place is the reviewer's verdicts, which is the only ground truth this campaign ever had.)* What
survives is the *shape* of the finding, and it is enough to set the goals: single-verdict noise was
measured at ~12% (reviewer regrade agreement 88%), so **acceptability points are not a direction v3
can meaningfully move in — we are at the measurement ceiling.** Chasing them means chasing reviewer
noise. The rewrite's actual goals, which double as its success criteria:

1. **Robustness.** v2-3 is stable per file but collapses across encodings: 72.8% palette
   agreement on re-encode, a ±1-LSB dither moved all 114 test palettes, an ASCII id relabeling
   moved 55.85% of the corpus. These are architectural, not tunable.
2. **Parameter honesty.** v2-3 carried ~900 tunable sites against 11 human-anchored values and
   measured 1.61× more perturbation-stable on reviewed than unseen artwork — quantified
   overfitting. v3 targets an order of magnitude fewer free constants, each carrying provenance
   from birth.
3. **Structural completeness.** Every evidence lane can reach every role it should
   (v2-3's candidacy walls made the reviewer's corrected accents structurally unpublishable);
   identity coverage first-class; the semantic classes (frames, overlays, giant text) handled
   structurally rather than as patches.

Success statement: **hold the reviewer's judgment at least as well as v2-3 did, with a smaller, more
stable, structurally complete system.** Deliberately not a number: the figure that used to sit here
was withdrawn on 2026-08-04, and success is measured against the reviewer's verdicts rather than
against an inherited anchor.

## 2. What carries over — and in what capacity

Fixed before design starts (these are about the *problem*, not any solution):

- **The problem spec.** Four roles (background, surface, foreground, accent) + gradient boolean
  + stops; role semantics (foreground is text, accent is icons/UI, fields are large areas);
  contrast deliberately low with the hard minimum a user parameter defaulting ~0; Flo's judgment
  as the only ground truth. Multi-stop capable, with **render stops decoupled from role colors —
  except the two ends**: the reviewer's ruling of 2026-08-04 pins the first stop to the
  `background` and the last to the `surface`. The decoupling agreed here survives for the
  *interior* of a ramp and nowhere else.
- **The evaluation assets.** The verdict warehouse (~495 records), the blinded review harness,
  the corpus, the calibration-with-repeats protocol. Crucially, **destination adjudication runs
  against the old warehouse before any human review** — a large fraction of early v3 iteration
  can be auto-adjudicated ("does the new pipeline land on already-endorsed / already-rejected
  palettes?"). Caveat the warehouse's own epistemology: verdicts are censored, relative, and
  rendition-scoped — guardrails ("never move TO known-worse") and matching oracles, never
  fitting targets.

Explicitly demoted: **the field guide
(`../ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md`) is an adversarial checklist, not a blueprint.**
Families, obligations, slates, evidence blends, even "policy at the winner stage" are things a
candidate design must *have an answer for*, not things it must contain. The v2-3 edge-case list
becomes tests, not design drivers. Using the guide as a blueprint reproduces v2-3 with better
hygiene — incremental at best.

## 3. Root causes, stated architecture-neutrally

What actually went wrong in v2-3, stripped of its own framing:

1. **The chaos is intrinsic to the shape, not the tuning.** Encoding sensitivity, cliffs,
   tie-break avalanches come from stacking many discrete, thresholded, order-dependent
   decisions (hard quantization bins, capped slates, staged winners). Hygiene labels cliffs; it
   does not remove them. A design that wants "less chaotic" needs decisions that are **few,
   global, and made over smooth quantities**.
2. **The hardest failures are semantic, and pixel statistics have a ceiling there.** The
   gradient boolean ("shadows on one surface" vs "sky and grass"), text vs texture, overlay vs
   substrate, figure vs ground. v2-3's residual debt list (black bars, giant text, badges) is
   exactly the semantic residue.
3. **Free parameters accumulate wherever hand-set weights are the mechanism of progress.**
   Any architecture whose iteration loop is "add a weighted term" will re-create the
   900-sites-vs-11-anchors ratio.

## 4. Candidate paradigms

Sketches for the divergence phase — at least three are structurally unlike v2-3. None is the
incumbent; all compete.

- **Global objective / reconstruction framing.** The palette is a compressed model of the
  artwork under the UI rendering contract. One objective (fidelity + role semantics +
  relational terms), searched globally. No stages, no cascade; gradient claims priced
  symmetrically inside the same objective (MDL for the whole palette, not just gradients). Few
  global knobs instead of many local thresholds — attacks root cause 1 directly.
- **Scene-parse first.** Segment the artwork into a layered understanding — ground/field,
  figures, text, overlays — then derive roles from the parse. Roles *are* semantic claims;
  this makes semantics primary and colorimetry secondary — the inversion of v2-3. Attacks root
  cause 2 directly. The oracle (and SAM masks specifically) is what makes this paradigm
  evaluable at all.
- **Portfolio of simple extractors + a selector.** Several small, legible strategies, each
  excellent on a slice, with selection the only complex part. Trades one deep brittle pipeline
  for shallow diverse ones.
- **v2-3's evidence pipeline, rebuilt clean.** Legitimate fifth candidate — competes on equal
  footing, is not the default.

(Learned end-to-end palette models were considered and rejected: ~7.5k items with categorical
labels doesn't train one, and the warehouse-fitting null showed the verdict data can't
supervise one either.)

## 5. The semantic oracle — role and sequencing

The dev-time VLM oracle (see pipeline doc) is the enabling investment. It is **never a runtime
component**. What it unlocks:

- **Makes scene-parse-first evaluable** — intermediate representations scored directly, not
  just final palettes.
- **A corpus-scale semantic census that doesn't need Flo.** e.g. gradient-boolean neutrality:
  v2-3's hardest lesson was "panel neutrality is not corpus neutrality; only a census settles
  it" — `ground_type` vs the algorithm's gradient boolean over ~6,900 artworks is a machine-run
  neutrality instrument.
- **Proxy calibration.** "Does this cheap deterministic proxy actually detect what I think it
  detects?" — measured per question, per resolution tier.
- **Failure-class characterization** via embeddings: one-off anomalies become named, counted
  classes.
- Possibly **removing (not just characterizing) the resolution confound**, if cross-collection
  content matching finds high-res versions of the 300px-only artworks.

**Sequencing — premise before machinery:**

1. **Premise test (hours):** run the oracle on the ~80 artworks where the warehouse already
   holds gradient-boolean endorsements and structure-relevant notes — the one place existing
   human data directly checks the hard questions. Poor agreement there = an afternoon spent,
   not a week.
2. **Embeddings over both collections (cheap, immediate):** stratification, near-dup
   detection, cross-collection overlap. Useful even if the oracle premise fails.
3. **Resolution ladder + 644-pair transfer check:** feeds the canonical-input-policy decision
   regardless of paradigm.
4. **Freeze the question set alongside the divergence phase** (the paradigms may add
   questions), then the full bulk run with the pipeline doc's §5 hygiene.

**Status 2026-08-03 — steps 1–3 are done and step 4 is half-done.** The premise came back weak but
not refuted: on the 30 artworks where oracle and flag contradicted, the reviewer sided with the
flag 14, the oracle 10, and neither 6 — "a lean, not a verdict". The reading usually attached to
that split — that the contested slice is *intrinsically ambiguous* rather than that the oracle is
wrong — **rests on one dated verbal remark** from the 2026-08-03 adjudication browse ("where i voted
differently from the oracles, i could see their point of view") **and on nothing else**. The
instrument built to quantify it (the `d`/`m` annotations) will not be run: reviewer ruling
2026-08-03, *"we already know it's not reliable so there is no point in me rating it"*
(`d-2026-08-03-reviewer-dm-annotations-not-collected`). Treat it as an unquantified reviewer
impression, permanently. Embeddings paid off
immediately and independently of the oracle, exactly as predicted: they found the holdout leak
that voided v1 (`PHASE_0_DECISIONS.md` §5). The ladder measured per-question resolution floors
(§7). **The question set is frozen** at v2 group A with variant B's ordering, and the labels are
scoped to census/flag/strata use only (§6 of `PHASE_0_DECISIONS.md`) — but the **bulk run has not
started**, because which model runs it is still open. See `PHASE_0_LOOSE_ENDS.md`.

**Correction to that paragraph, 2026-08-03 (post-adversarial-review).** Two things it implies are
no longer true. **(a) The bulk-model blocker is half discharged.** Two of the three arms now have
full eval-142 runs (`qwen3-30b-a3b` incumbent and `qwen3-32b-dense`, 137 scored / 0 failed each);
only `gemma3-27b` is gold-30-only. The cross-arm agreement quoted elsewhere as 0.533 is the
*gold-30* figure — on eval-142 the same pair agrees **0.761 (n=142)**, a materially different
picture. What remains is the **reviewer visual evaluations alone** — reviewer bandwidth, not GPU.
**(b) The criterion arm ran, and its result is adverse.** `premise-run-cd.jsonl` (299 rows, 142
images, variants C and D) was executed and analysed: the corpus-wide gate's *unmapped* criterion
passed outright (0% under both C and D against 31–44% under A/B), while its *exact-match* criterion
failed by every variant, and C and D agree with each other on only 46% of artworks — worse than A
agrees with B. Two wordings that share B's ordering do not reproduce B, so **ordering is not
sufficient** and the A→B difference cannot be attributed to it on available evidence. The freeze
itself stands; one design rule it cited now carries a failed replication. Write-up:
`oracle/premise/CD_RESULT.md`; consequences in `PHASE_0_DECISIONS.md` §6, `ORACLE_QUESTION_SET.md`
design rule 6, and loose ends B4 (closed) / B5 (amended).

**Status 2026-08-04 — the three routes to the figure/ground line, and where each one stands.** The
ground question is the one the oracle premise was weakest on, and three routes at it have now been
opened. **None is adopted, one is closed off, and the pick between them is still the reviewer's**
(loose end B24). Status claims below cite the workstream's own artifacts, per the rule in §6.

| route | state | where |
|---|---|---|
| **residual subtraction** — "everything but the masks is background" (reviewer direction R-3) | **NOT ADOPTED on the evidence.** A pre-registered reviewer round returned stratum-reweighted pure-field **0.2424** against a 0.75 bar, in both area-guard variants, with all five strata below the 0.50 floor and the charitable ceiling (0.7412 / 0.6127) still short. The residual is a **field-enriched prior, not a background isolator.** Not refuted — the round names the three fixes that would have to land first, and **one of the three is done** | `d-2026-08-04-r3-residual-not-adopted`; `oracle/sam/RESIDUAL_PURITY_VERDICT.md` |
| **pointing** — a pointing specialist puts a point on the ground, SAM grows a mask | **BAR FAILED; route `alive-pending`.** dot-right 7/8 clears its half, dot-right-and-wash-right 3/8 misses its half by one tile, so the conjunction is unmet and **pointing is not carried forward as a ground route.** "Alive" means only *not killable on this evidence*: the pointer missed zero of six where there was an answer key, and every decidable failure is SAM's mask growth. **Recommendation on the record: do not spend the next GPU slot on it** | `d-2026-08-04-pointing-route-alive-pending-typical-strata-probe`; `oracle/sam/POINTING_PROBE_NOTES.md` §13–§14 |
| **depth maps** — reviewer-proposed | **Scout reported; probe still unrun, and the scout argued it DOWN.** Last of five routes by expected value: the oracle's own answers cap applicability at **13.3%** of this corpus (n=30 gold), and the literature reproduces the predicted failure on printed pictures. Worth running **to close the question**, not to open a route | `oracle/sam/GROUND_ROUTES.md`; loose end B28 |

**Two things follow that are not route states.** A **`residual-purity-2`** round is pre-registered,
**built** (fixture, review-server support, 57/57 tests) and **NOT PUSHED** — 24 sheets × 2 panels,
the bar **held** rather than moved, plus the escape answer the last round lacked
(`d-2026-08-04-purity-rounds-need-escape-answer`). The warehouse holds no such batch; **pushing it is
the reviewer's act**, and so is the choice between it and the corpus-level version — it re-asks the
*paired* question on the same covers round 1 judged, which is cheaper and is not the corpus question,
because eval-142 cannot produce one. A **pointing typical-strata probe** is at the same stage:
pre-registered with its bar fixed (dot-right ≥ 12/16), CPU side built, **no inference run**. And **a toolbox review now exists** that no plan row asked for:
`reviews/toolbox-review/` holds a **bias audit** (10 findings) and a **gap scan** (~22 items), aimed
at Phase 1 and Phase 2 rather than at Phase 0's correctness. Its sharpest finding is a **hard gate
that is measurably wrong** — the source-support invariant would refuse 96.9% of the reviewer's own
endorsed palettes (loose end **A17**) — and its own argument is that several of its cheap fixes stop
being credible once Phase 1 proposals exist. **Nothing in it is prioritized and nobody owns
prioritizing it** (loose end **B33**).

**Emphasis correction to the pipeline doc:** SAM's masks may matter more than the VLM's labels.
The VLM answers image-level questions, but most unsolved semantics are *pixel-attribution*
problems (which pixels are the badge, the text, the residual field). `artwork_regions` is a
co-equal deliverable with `artwork_labels`, and mask quality goes into the human validation.

## 6. Process

### Phase 0 — instruments (no palette code) — **COMPLETE 2026-08-03**

The original criteria, each with its status and where to check it. Nothing below is a claim about
palette quality; Phase 0 built *instruments*, and the honest summary is that the instrument-side
criteria are met and the two pipeline-facing ones are **structurally unbuildable until a pipeline
exists** — they are specified, and they move to the Phase 2 entry condition rather than counting
as Phase 0 debt.

**Rule for reading and writing this table (added 2026-08-03, from the adversarial review).** Every
count here is a measurement of an artifact that keeps growing, and every status is a claim about
code some other workstream owns. So: **counts carry the timestamp they were measured at**, and a
status claim about another workstream's code **cites that workstream's README rather than asserting
independently.** The review found three completed model runs, five built server features, one
ratified concept set, one calibrated threshold and one shipped tag vocabulary all documented here as
not-done — every one of those inversions was a row written from outside the workstream that owned it.

| # | criterion | status | where |
|---|---|---|---|
| 1 | Review server + warehouse per `REVIEW_UI.md` — blinded 4–10 item batches, content-hash side shuffling, key never served, calibration rounds with repeats, plus the v3 changes (standing queue server, dual grades, agent-derived tags, oracle-validation mode) | **met** | `src/review-server/`, `src/warehouse/`, `review-ui/`; **773 warehouse records across 10 released batches, as of 2026-08-03T19:50Z** (703 `oracle-label` · 39 `note` · 13 `amendment` · 10 `batch-complete` · 8 `verdict`) — of which **10 records in two batches are self-declared demo fixtures** and are excluded from headline counts by the `demo-` id prefix (`d-2026-08-03-demo-fixtures-are-not-ground-truth`). Re-derive rather than quoting: `warehouse status`. The earlier "434 records across 5 batches" was true at 2026-08-03T10:12Z and froze while the warehouse nearly doubled. `src/tagging/` for the tag vocabulary and export |
| 2 | Input policy, output contract, metrics per `PHASE_0_DECISIONS.md` | **met, and three of them measured rather than assumed** | transparency resolved by exhaustive survey (§1); the one ruler calibrated *and frozen* (§3, §7); the ε floor's identical-colour APCA residue bounded at **1.98152** (§4 — analytic, `Y* = (0.62/0.65)^(1/0.03)`; the earlier exhaustive-scan value 1.9815 was **refuted**, `#df11de` against itself reaching 1.981519246) |
| 3 | Contract-invariant validation gate | **met** | `src/contract/invariants.ts`, `tests/contract-invariants.test.ts`; exercised corpus-wide by the calibration-consequence run over 554 real palettes |
| 4 | The perturbation gates — relabel-invariance, dither/re-encode canary, repeated-extraction canary, degenerate-artwork sweep | **specified, NOT built** | they take a palette pipeline as input and there is none yet. **Moved to the Phase 2 entry condition:** the first prototype that emits palettes does not get adjudicated until these run against it — **and, added 2026-08-03, until the reviewed-vs-unseen perturbation-stability ratio of row 5 is computed alongside them**, since the same perturbation machinery produces it. Tracked in `PHASE_0_LOOSE_ENDS.md` |
| 5 | Robustness as a first-class machine co-metric (cross-rendition agreement, dither stability, relabel invariance) | **specified, NOT built** — same reason as #4 | the 644 cross-rendition pairs and the resolution ladder that feed it **are** built and measured (`data/oracle-ladder/`). **Added to this row's carve-out 2026-08-03:** the **reviewed-vs-unseen perturbation-stability ratio** (§1 criterion 2's third number, v2-3's 1.61× overfitting alarm, healthy ≈ 1.0) is **tracked nowhere** — it is named in `PHASE_0_DECISIONS.md` §3's tracked-metrics list and measured by no instrument, which is how it stayed invisible through all of Phase 0. It joins rows 4 and 5 in the **Phase 2 entry condition** below rather than counting as Phase 0 debt, because it too takes a palette pipeline as input. Ledger row **B30** |
| 6 | Oracle step 1 — premise test | **met** | `premise-run-1` (142 artworks decoded, **137** the analysis population, × 2 variants) + `disambiguation-1` (30 reviewer answers). Premise verdict: **weak but not refuted**; the usual gloss — that the contested slice is intrinsically ambiguous — is one reviewer remark, not a measurement, and stays that way by ruling (`d-2026-08-03-reviewer-dm-annotations-not-collected`). The criterion arm (C/D) has since run; its result is adverse to the ordering hypothesis — see `PHASE_0_DECISIONS.md` §6 and loose end B5 |
| 7 | Oracle step 2 — embeddings over both collections | **met** | 6 arms × 2 collections = **16,145 images, 96,870 vectors** across 12 `.npy`/`.ids.jsonl` pairs; retrieval bake-off; near-duplicate census; cluster galleries |
| 8 | Oracle step 3 — resolution ladder + 644-pair transfer check | **met** | `data/oracle-ladder/ladder-sample-1.analysis.json`; transfer holds against both the curve and the matched-contrast control; per-question resolution floors measured (`PHASE_0_DECISIONS.md` §7) |
| 9 | Corpus, holdout and legacy distillation | **met** (not an original bullet; added during the phase) | holdout frozen at v2 on near-duplicate components (`data/holdout/`); three legacy fixtures distilled (`data/legacy/`) |
| 10 | SAM masks as a co-equal deliverable (§5's emphasis correction) | **met** | model pinned, machinery self-tested, concept set replaced on measurement and **ratified** at v2.1 (`d-2026-08-03-sam-concept-set-v2`, `-v2.1-barcode`); **100 reviewer-graded masks** across `sam-mask-quality-1` (60) and `sam-mask-quality-2-v2-ratification` (40); the consumer-side cut is **calibrated and `[REVIEWED]`** — `CALIBRATED_SCORE_THRESHOLD` (the run-time `SCORE_THRESHOLD = 0.3` is a deliberate *capture floor*, so raising the cut stays a query and never a re-run), with per-group thresholds and an area guard added 2026-08-03. The genuinely open SAM risks are **not** in this row: A6 (the area guard's untested `person` exposure — reopened 2026-08-03) and A12 (CJK below the cut) are in `PHASE_0_LOOSE_ENDS.md`. Status claims about SAM cite `oracle/sam/config.py` and `data/sam/`, not this table. **Added 2026-08-04:** the **point-prompt** path is now wired and exercised (98/100), on the feature-grid coordinate convention settled by measurement — ledger rows A14 and A15 both closed. What that path was built for did **not** clear its bar; see §5's route table |
| 11 | Coverage set — the standard tuning bench (not an original bullet; added during the phase) | **met** | `data/coverage-set/coverage-set-1.json`, 200 artworks, seed `0xc0efface`, byte-reproducible, 9 named checks passing; supersedes eval-142 as the bench for tuning v3's instruments (VLM prompts, SAM prompts, score thresholds). Recorded as `d-2026-08-03-coverage-set-canonical-bench`; already the population `bcde-validation-1` draws from. Write-up: `data/coverage-set/COVERAGE_SET.md` |
| 12 | **Parameter honesty — the measurement of success criterion 2** (not an original bullet; added 2026-08-03, from the adversarial review's worst instrument gap) | **built and measuring — two of the criterion's three numbers** | `src/honesty/`, generated page at `data/honesty/HONESTY.md`, full census with every untagged `file:line` at `data/honesty/honesty-report.json`. Re-derive rather than quoting: `node --experimental-strip-types src/honesty/cli.ts` (`--check` exits 1 on a stale report). The discipline existed from day one — provenance tags, decision records, no anonymous literals; the *measurement* did not, so the criterion could only ever be asserted. **What it covers:** tunable-site count and provenance fraction, deliberately as a **lower bound** (unclear cases are counted, not excluded), with `[UNCALIBRATED]` scoring as unanchored — both definitions recorded as `d-2026-08-03-honesty-census-definitions`. **What it does not cover:** the third number, the reviewed-vs-unseen perturbation-stability ratio, which needs a pipeline that emits palettes — see rows 4/5 and the Phase 2 entry condition. Status claims about the instrument cite `src/honesty/README.md`. **Reviewer ruling 2026-08-03 on the backlog it found:** *"tunable sites do not matter much in v3 Phase 0. This phase is about laying the groundwork and preparing tools for the next phases."* — so the untagged backlog is a **Phase 1 obligation, not Phase 0 debt** (`d-2026-08-03-reviewer-tunable-sites-are-a-phase-1-obligation`, ledger row **B29**) |

**Standing decisions are recorded in `data/decisions/decisions.json`** and are machine-recheckable
against the warehouse (`warehouse recheck --decisions`). Every deliberately-open item is in
**`PHASE_0_LOOSE_ENDS.md`** with an owner and a revival condition.

**Gate to Phase 1 — reviewer directive, 2026-08-03: an adversarial review of Phase 0.** Divergence
does not start until Phase 0's instruments have been attacked rather than admired. The reason is
the same one that motivates the whole rewrite: every Phase 1 proposal will be evaluated *through*
these instruments, so an instrument that is wrong in a way nobody looked for becomes an error that
no amount of later care can detect. `PHASE_0_LOOSE_ENDS.md` is that review's starting map, not its
scope limit.

### Phase 1 — divergence (anti-anchoring by construction)

Several subagents each produce an architecture proposal **from the problem spec and raw verdict
data only — not the field guide** — so v2-3's ontology cannot anchor them. The orchestrator
then stress-tests each proposal against the field guide as adversarial checklist.

**What each author receives is written down, and it was written down before any proposal existed**
(2026-08-04): **`PHASE_1_AUTHOR_BRIEF.md`**. Authors get the goals (§1's three criteria), the output
contract by section pointer, corpus facts as **measured distributions with no conclusions attached**,
and a **tool catalog** — every instrument that exists, one line each, what it measures and how to
invoke it. They do **not** get our failure analyses, the instruments' conclusions, or the field
guide.
**The catalog is the reviewer's own addition to the proposal** (`d-2026-08-04-phase-1-authors-receive-a-tool-catalog`),
and the distinction it rests on is between knowing *what can be measured* and knowing *what we
concluded*. An author who does not know a robustness harness exists will not design for robustness
and will be judged by it anyway — that is not anti-anchoring, it is a hidden rubric.
**One arm runs blind: goals and the output contract only**, no catalog and no corpus facts. It is
the control on everything above, including on the catalog itself — which is a real hole in the
blind, since naming the instruments tells an author what this campaign thinks is worth measuring.
**Authors are asked to show their work** — what they expect to fail at, and what would falsify the
approach — as a **template line with no enforcement**. The reviewer was explicitly unsure it is
worth anything, and that uncertainty is the decision rather than a footnote to it; if it produces
nothing across Phase 1, delete the line (`d-2026-08-04-show-your-work-is-a-template-line-not-a-gate`).

**Two questions are deliberately left to the authors rather than pre-decided as instruments**
(`d-2026-08-04-alpha-matte-and-cvd-are-algorithm-material`): how transparent images are flattened
(what matte an alpha region gets), and how colour-blind legibility is treated. Reviewer, verbatim:
*"part of the algorithm, not tooling"*. Deciding the matte in advance quietly decides what "the
image" **is** for every author; shipping a CVD diagnostic in advance quietly makes it a scoring axis
nobody voted for.

**Nothing built for Phase 1 may be ported from v2-3** — see `CONVENTIONS.md`, and
`d-2026-08-04-no-v2-3-code-enters-v3`. The evidence carries over; the code does not.

### Phase 2 — bake-off

Prototype the 2–3 most distinct paradigms just far enough to emit real palettes. Auto-adjudicate
all of them against the warehouse; put samples in front of Flo blinded. **Judge trajectory and
ceiling, not first-round scores** — immature prototypes lose head-to-head against distilled
lessons at first contact; the questions are "how does it fail?" and "are its failures fixable
within its own paradigm?". Otherwise the incumbent wins by default and the rewrite converges
back to v2-3.

### Phase 3 — commit and iterate

Commit to a paradigm; bring the field guide back as the audit checklist for the winner. Then
the proven v2-3 arm machinery, kept verbatim: isolated Opus subagent worktrees, flags OFF by
default, byte-identity gates from committed states, corpus census → destination adjudication →
sampled batch for big swings, composition batches before mechanisms stack, verdict-gated
integration, every constant pinned with a provenance tag at birth
(`[REVIEWED] [MEASURED] [FITTED] [n=1] [INHERITED] [UNCALIBRATED] [HELD]`), anonymous literals
forbidden.

**A constants budget from day one:** review batches designed to move one axis at a time, so
weights are fittable later if wanted (the v2-3 fitting null was a data-design failure, not a
method failure).

## 7. Honest risks

- **The gradient boolean stays hard.** It is semantic; no architecture fixes that. The oracle
  reduces rounds spent approximating it statistically but the final arbiter is still review.
- **The oracle premise may fail** exactly on the questions that matter most
  (`ground_type` reliability). That's why the premise test precedes the machinery.
- **Reaching parity takes real time.** v2-3 took ~2–3 intensive days *with* momentum; v3 spends
  its first stretch catching up to auto-adjudicated parity before any visible wins. Budget for
  that psychologically as much as logistically.
- **Reviewer bandwidth is the binding constraint**, as always. Oracle validation (~2–3k
  five-second judgments for the sample) is cheap per unit but must be scheduled deliberately.
- **The field guide's process/canary sections are its least-sourced part** (per the fact-check:
  unverifiable material concentrates in §4/§8/§11). Architecture lessons strong; anecdotes
  directional.
