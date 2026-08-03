# V3 — Plan, Process, and Ideas

**Status:** **Phase 0 built and complete, 2026-08-03.** Plan proposed 2026-08-02; §6's Phase 0
exit criteria are all met (see §6 for the status table and its pointers). Phase 1 is **gated on
an adversarial review of Phase 0** — reviewer directive, 2026-08-03. Phases 1–3 remain proposal.
**Working model:** Claude Fable as architect/orchestrator, Opus subagents doing all implementation
work in isolated arms, Flo as the sole reviewer and ground truth.
**Companion documents:** `ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md` (dev-time VLM oracle),
`ORACLE_QUESTION_SET.md` (the oracle question set — v2, group A piloted and measured),
`PHASE_0_DECISIONS.md` (input policy, output contract, metrics — working decisions),
`REVIEW_UI.md` (review server, verdict model, warehouse, oracle-validation mode),
`PHASE_0_LOOSE_ENDS.md` (every deliberately-open item, with owner and revival condition),
`data/decisions/` (standing decision records, machine-recheckable against the warehouse).

---

## 1. What v3 is for — and what it cannot be for

v2-3 ended at ~97% acceptable-or-better on its calibration set, with a measured ~12%
single-verdict noise band (reviewer regrade agreement 88%). **v3 cannot meaningfully beat that
number — we are at the measurement ceiling.** Chasing acceptability points means chasing
reviewer noise. The rewrite's actual goals, which double as its success criteria:

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

Success statement: **match ~97% with a smaller, more stable, structurally complete system.**

## 2. What carries over — and in what capacity

Fixed before design starts (these are about the *problem*, not any solution):

- **The problem spec.** Four roles (background, surface, foreground, accent) + gradient boolean
  + stops; role semantics (foreground is text, accent is icons/UI, fields are large areas);
  contrast deliberately low with the hard minimum a user parameter defaulting ~0; Flo's judgment
  as the only ground truth. One already-agreed contract change: **render stops decoupled from
  role colors**, multi-stop capable.
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
flag 14, the oracle 10, and neither 6 — "a lean, not a verdict", and evidence that the contested
slice is intrinsically ambiguous rather than that the oracle is wrong. Embeddings paid off
immediately and independently of the oracle, exactly as predicted: they found the holdout leak
that voided v1 (`PHASE_0_DECISIONS.md` §5). The ladder measured per-question resolution floors
(§7). **The question set is frozen** at v2 group A with variant B's ordering, and the labels are
scoped to census/flag/strata use only (§6 of `PHASE_0_DECISIONS.md`) — but the **bulk run has not
started**, because which model runs it is still open. See `PHASE_0_LOOSE_ENDS.md`.

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

| # | criterion | status | where |
|---|---|---|---|
| 1 | Review server + warehouse per `REVIEW_UI.md` — blinded 4–10 item batches, content-hash side shuffling, key never served, calibration rounds with repeats, plus the v3 changes (standing queue server, dual grades, agent-derived tags, oracle-validation mode) | **met** | `src/review-server/`, `src/warehouse/`, `review-ui/`; 434 warehouse records across 5 batches; `src/tagging/` for the tag vocabulary and export |
| 2 | Input policy, output contract, metrics per `PHASE_0_DECISIONS.md` | **met, and three of them measured rather than assumed** | transparency resolved by exhaustive survey (§1); the one ruler calibrated *and frozen* (§3, §7); the ε floor's 1.9815 raw-APCA residue measured exhaustively (§4) |
| 3 | Contract-invariant validation gate | **met** | `src/contract/invariants.ts`, `tests/contract-invariants.test.ts`; exercised corpus-wide by the calibration-consequence run over 554 real palettes |
| 4 | The perturbation gates — relabel-invariance, dither/re-encode canary, repeated-extraction canary, degenerate-artwork sweep | **specified, NOT built** | they take a palette pipeline as input and there is none yet. **Moved to the Phase 2 entry condition:** the first prototype that emits palettes does not get adjudicated until these run against it. Tracked in `PHASE_0_LOOSE_ENDS.md` |
| 5 | Robustness as a first-class machine co-metric (cross-rendition agreement, dither stability, relabel invariance) | **specified, NOT built** — same reason as #4 | the 644 cross-rendition pairs and the resolution ladder that feed it **are** built and measured (`data/oracle-ladder/`) |
| 6 | Oracle step 1 — premise test | **met** | `premise-run-1` (137 artworks × 2 variants) + `disambiguation-1` (30 reviewer answers). Premise verdict: **weak but not refuted** — the contested slice is intrinsically ambiguous |
| 7 | Oracle step 2 — embeddings over both collections | **met** | 6 arms × 2 collections, 16,145 vectors; retrieval bake-off; near-duplicate census; cluster galleries |
| 8 | Oracle step 3 — resolution ladder + 644-pair transfer check | **met** | `data/oracle-ladder/ladder-sample-1.analysis.json`; transfer holds against both the curve and the matched-contrast control; per-question resolution floors measured (`PHASE_0_DECISIONS.md` §7) |
| 9 | Corpus, holdout and legacy distillation | **met** (not an original bullet; added during the phase) | holdout frozen at v2 on near-duplicate components (`data/holdout/`); three legacy fixtures distilled (`data/legacy/`) |
| 10 | SAM masks as a co-equal deliverable (§5's emphasis correction) | **partially met** | model pinned, machinery self-tested, prompt set replaced on measurement; **the score threshold is uncalibrated and no reviewer has validated a mask** |

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
(`[REVIEWED] [MEASURED] [n=1] [INHERITED] [UNCALIBRATED] [HELD]`), anonymous literals
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
