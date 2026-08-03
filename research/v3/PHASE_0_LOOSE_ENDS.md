# Phase 0 — known loose ends

**Compiled 2026-08-03, at the close of Phase 0.** Every item here is **deliberately open**: known,
priced where it could be priced, and parked on purpose. Nothing on this list is a surprise, and
that is the only claim it makes.

**This is the adversarial review's starting map — not its scope limit.** An item's absence is not
evidence it is fine; it is evidence nobody wrote it down. The most valuable output of the review
would be a row this file does not have.

**How to read a row.** *Owner* is who can close it — `reviewer` means it cannot be closed by any
agent or by the orchestrator. *Revives when* is the concrete trigger, not an aspiration. **Blast
radius** says what silently becomes wrong if the item is wrong.

**Counts — recounted 2026-08-03 after the adversarial review, by counting the headings.** The
previous header said "35 items — 9 sharp, 18 standing, 8 latent … four rows closed (A1, A5, A6,
B8)". Every one of those numbers was wrong or has since moved, which matters more here than
elsewhere: **a ledger whose headline count is wrong cannot be used as a checklist, and that is its
only job.**

**57 items, of which 46 are open and 11 are closed** — recounted 2026-08-03 (evening) after the
consolidated post-review pass, which closed **L-b**, added **B24** and **L-i**, and amended A10, B5
and B7 without changing their state.

| section | items | open | closed |
|---|---|---|---|
| **A — sharp** (something downstream is already leaning on them) | A1–A12 = 12 | 7 | 5 — A1, A5, A7, A8, A9 |
| **B — standing** (parked with a clear trigger) | B1–B24 = 24 | 20 | 4 — B4, B8, B16, B18 |
| **C — latent** (harmless today, harmful under one specific move) | C1–C12 = 12 | 11 | 1 — C11 (resolved by ruling, never a defect) |
| **L — review-server and round hygiene** (added 2026-08-03) | L-a–L-i = 9 | 8 | 1 — L-b |

**A6 is REOPENED**, not closed — it was closed on 2026-08-03 and reopened the same day, because its
closing argument turned out to be circular. It is counted as open above.

Closed rows are kept, **struck through, with their original text** — a ledger that deletes its
closed rows cannot be audited, and in A6's case the closure text is exactly what a later reader
needs in order to understand why artifacts on disk look the way they do.

---

## A. Sharp — something already depends on these

### A1. ~~The ladder's codec-control noise floor was never populated~~ CLOSED 2026-08-03
**Resolution:** the `--include-duplicate-sizes` rerun (`ladder-codec-control-1.jsonl`)
populated it: same-size agreement ground_type 0.903 / field_texture 0.922 / enclosure 0.961 /
shading_geometry 0.857 — every failing resolution bin sits far below its codec ceiling, so
the floors are genuine resolution effects. `PHASE_0_DECISIONS.md` §7 updated; verdicts no
longer provisional. Original entry kept below for the record.

### A1 (original). The ladder's codec-control noise floor was never populated
- **What.** `codec_control_same_size.n = 0` for every question in
  `data/oracle-ladder/ladder-sample-1.analysis.json` — the run did not pass
  `--include-duplicate-sizes`. Same-size agreement is what separates "information was lost at this
  resolution" from "the codec and the sampler are noisy"; the ladder's own README says the curve
  "means nothing until you know same-size agreement is not also 0.88".
- **Consequence.** **Every `unanswerable_below_px` verdict is provisional** — including the
  ~241 px `ground_type` / `gradient_boolean` floor and the ~441 px `shading_geometry` floor now
  written into `PHASE_0_DECISIONS.md` §7.
- **Owner.** oracle/ladder workstream. **Revives when:** a GPU slot is free — the fix is a rerun
  flag on a subset, not a redesign.
- **Blast radius.** Any input-policy or corpus-inclusion argument that cites a floor; the
  "2,270 300 px-only artworks" decision; `below_resolution` tagging corpus-wide.
- **It was not flagged anywhere before this ledger.** It read as a clean zero.

### A2. The 0.85 agreement floor is `[UNCALIBRATED]`
- **What.** `DEFAULT_AGREEMENT_FLOOR` in `oracle/ladder/analyze.py` is a CLI flag with no measured
  basis — "that is what this run produces". Every resolution floor in §7 moves with it.
- **Owner.** **reviewer.** **Revives when:** a reviewer picks a defensible floor, or the codec
  control (A1) supplies a noise floor to place it against.
- **Mitigation in place.** Every table prints the whole per-bin curve, so a moved floor re-reads
  off existing data without a rerun.

### A3. `EPSILON_TEXT_RAW` / `EPSILON_ACCENT_RAW` are `[UNCALIBRATED]` placeholders
- **What.** Both sit at 2.5 in `src/contract/constants.ts`. `PHASE_0_DECISIONS.md` §4 requires them
  **measured** from the raw-APCA distribution over corpus pairs. The placeholder was chosen only to
  clear the measured `APCA_RAW_IDENTICAL_CEILING` of 1.98152 — the residue an identical fg/bg pair
  produces through APCA's reverse branch.
- **Consequence.** These epsilons **are** invariant 4 and **are** the contrast parameters' default
  and minimum (§2). A wrong value is either a floor that lets an invisible pair publish, or a floor
  that condemns legitimate palettes — with no separate enforcement path to catch it.
- **Owner.** contract workstream (measurement only, no reviewer round needed).
  **Revives when:** any corpus run exists to draw the distribution from.
- **What the measurement will break, by design (added 2026-08-03).** When the corpus epsilon
  lands, `HAND_WRITTEN_EPSILON_CONTRAST` and the **six bracket fixtures** must be **re-derived**,
  not nudged. They are pinned to the 2.5 placeholder by test, so they will **fail loudly first** —
  that is the intended behaviour and not a regression. Whoever does the measurement owns all three
  files, and a green suite after the measurement means the re-derivation was skipped.

### A4. Invariant 2's spatial-spread half is permanently reported `deferred`
- **What.** `src/contract/types.ts` marks it `TODO [v3 Phase 1]`, never a pass:
  "the blocking question is not code but provenance: a threshold here has to come from measurement
  or from the reviewer, and neither has happened."
- **Correction 2026-08-03 — the cost estimate was wrong, the substance was not.** This entry said
  the wire-in point is "a single `spatialSpreadValidator` assignment in `invariants.ts`". **There
  is no such assignment**: `grep -c spatialSpreadValidator src/contract/invariants.ts` = 0, and the
  only occurrence repo-wide is a pointer at `src/contract/types.ts`:318. What `invariants.ts`
  actually has is `DEFERRED_SPATIAL_SPREAD = "I2.spatial-spread"`, pushed onto `deferred` at three
  sites. The deferral machinery is real and the `TODO [v3 Phase 1]` is genuinely at `types.ts`:312;
  only "one assignment and you're done" is unsupported. **Whoever picks this up in Phase 1 will
  find the job is to *create* the seam, not to fill it** — price it accordingly.
- **Consequence.** "Source support" currently checks the population floor only. A color that is a
  genuine pixel of the input but occurs as scattered noise passes.
- **Owner.** contract workstream + **reviewer** (for the threshold). **Revives when:** Phase 1.

### A5. ~~The SAM concept set was changed by an agent over a standing reviewer prerogative~~ CLOSED 2026-08-03
**Resolution:** the reviewer reviewed the masks. Batch `sam-mask-quality-1`, 60/60 answered and
released 2026-08-03, produced by the replaced concept set — verdict "the results are impressive,
though not always accurate … all in all, pretty good i thought"
(`data/sam/MASK_REVIEW_NOTES.md`). **The prompt set is ratified by that round**, which is exactly
the reviewer act A5 was waiting for. What the round did *not* ratify is the concept *wording*:
the reviewer's notes 1, 2 and 5 name three label/category mismatches, and the reviewer asked for
a vocabulary-alignment follow-up — carried forward as A9, not as a reopening of A5. The two code
defects riding along (the stale `[MEASURED, n=10, HELD]` comment, `CONCEPT_GROUPS["text_like"]`
still listing `text`/`typography`) remain the oracle workstream's to fix and are not closed here.
**Update 2026-08-03: both code defects are FIXED.** `config.py` now says the set "was REPLACED with
the measured winners", and `CONCEPT_GROUPS["text_like"]` is
`("words","letter","lettering","display-text")` — no `text`, no `typography`. The same two claims
are frozen as `fundingCaveats` on `d-2026-08-03-sam-prompt-set-replacement` and are stale there
too; that record is append-only history and must not be edited, so read
`d-2026-08-03-sam-concept-set-v2` and its successors instead.
Original entry kept below for the record.

### A5 (original). The SAM concept set was changed by an agent over a standing reviewer prerogative
- **What.** `oracle/sam/config.py` `CONCEPT_PROMPTS` was replaced with the probe's measured winners
  (`words`, `letter`, `lettering`, `album title`, `logo`, `sticker`, `person`, `face`) because the
  pipeline §8.3 phrasings `text` and `typography` fire on **0 of 10** images with this model. The
  measurement is sound and n=10.
- **Why it is sharp.** No reviewer has looked at a single mask from the new set, and the file's own
  standing rule is that "changing the question set is the reviewer's call, not an agent's". The
  change alters `CONCEPT_SET_HASH`, i.e. the identity of every mask row that will ever be produced.
- **Owner.** **reviewer** (ratify or reverse — one edit either way).
  **Revives when:** the SAM validation round.
- **Two code defects riding along** (flagged to the oracle workstream, not edited here):
  the `[MEASURED, n=10, HELD]` comment block still says the set "is left exactly as §8.3
  specifies", which now contradicts the tuple it annotates; and `CONCEPT_GROUPS["text_like"]`
  still lists `text` and `typography`, so the group union is computed over concepts that can never
  appear.

### A6. The SAM cut and its area guard — **REOPENED 2026-08-03**
*(Closed 2026-08-03 on the calibration round; reopened the same day by the adversarial review and
by a reviewer ruling. The closure text is kept below, struck through, because artifacts were
computed under it.)*

- **Why it reopened — the closure's argument was circular.** The closure said no area-fraction
  guard was needed because "all three hallucination-signature masks were rejected by the reviewer
  **and** dropped by the cut". A hallucination-signature mask **cannot** score above the cut — that
  is what the signature means — so the sentence is a tautology and carries no information about
  whether a guard is needed. It is also **falsified by its own round**: `8b4f2aadf3b1:sticker:0` is
  a counterexample the verdict string dropped.
- **What changed in the code.** An area guard is now in place —
  `CALIBRATED_MAX_AREA_FRACTION = 0.5`, applied with the score cut through the single predicate
  `passes_calibrated_cut()` — **at zero in-sample true-positive cost**. That zero is evidence about
  the *sample*, not about the guard: the quality sample contains almost no big-area `person` masks.
- **The live concern, confirmed by the reviewer 2026-08-03.** *"since we're processing artworks, it
  wouldn't be too surprising to have 90% of the image be 'a face' or 'a car'."* A flat 0.5 area
  guard would drop exactly those masks, and nothing has measured how often that happens.
- **Direction (reviewer ruling R-2, `d-2026-08-03-reviewer-area-guard-scoped-per-concept-group`):**
  **per-concept-group scoping** — guard `mark_like` and `text_like`, **exempt `person_like`** and
  any future dynamic subject noun. The group assignment is the orchestrator's proposal, not the
  ruling; a full-bleed logo is not obviously implausible either, so it must be calibrated rather
  than assumed.
- **Owner.** **reviewer** + oracle/SAM workstream.
  **Revives when:** a **mask round 3** that puts **big-area `person` masks in front of the
  reviewer** — the current sample cannot price this guard because it barely contains the case.
- **Blast radius.** Every consumer that filters through `passes_calibrated_cut()`. A guard that is
  right for marks and wrong for people silently deletes the largest object on the cover, which is
  precisely the class §D.1's `subject_kind` question exists to recover.
- **Naming correction, same entry.** The old closure asserted "**`SCORE_THRESHOLD = 0.578`
  `[REVIEWED]`**". The code has **two** constants and that is not either of them:
  `CALIBRATED_SCORE_THRESHOLD = 0.578` `[REVIEWED]` is the consumer-side cut, while the constant
  literally named `SCORE_THRESHOLD` is still **0.3** and still `[UNCALIBRATED]` — a deliberate
  run-time *capture floor*, so raising the cut stays a query and never a re-run. The design is
  sound; the sentence named the wrong identifier, which is enough to make a grep-driven reader
  believe the file is inconsistent, or to make a consumer filter at the wrong constant.
- **Per-group correction, same entry.** The closure said "the concept groups **did not separate**,
  so no per-group threshold is justified". That was an artefact of an `every()` quantifier in the
  adoption rule, which required the gain to hold for *every* group before adopting it for *any*.
  Per-group optima are **not** equal — `person_like` 0.578 (J 0.678), `text_like` 0.697 (J 0.478) —
  and `text_like` at its own cut reaches precision 1.000 / recall 0.4783, lifting overall J from
  0.5140 to 0.5602. Per-group thresholds are now in force
  (`d-2026-08-03-sam-per-group-score-thresholds`).

### A6 (closure text of 2026-08-03, superseded by the reopen above)
~~**Resolution:** calibrated against the same round as A5 (`sam-mask-quality-1`, 60 reviewer
judgments). **`SCORE_THRESHOLD = 0.578` `[REVIEWED]`** — a single cut; the concept groups did not
separate, so no per-group threshold is justified. At that cut: precision 91%, recall 69%, J 0.514.
The population-weighted optimum is 0.644 (J 0.373) and is recorded alongside it, because the
unweighted optimum is partly an artefact of the even-quota sampling. All three
hallucination-signature masks were rejected by the reviewer **and** dropped by the cut, so no
area-fraction guard is needed at this threshold. Numbers in `data/sam/MASK_REVIEW_NOTES.md`
("Calibration outcome").~~ Original entry kept below for the record.

### A6 (original). `SCORE_THRESHOLD = 0.3` is `[UNCALIBRATED]`
- **What.** Deliberately low: §8.3 says recall is SAM's problem, and every row carries its score.
  "Raising this later is free; lowering it means re-running."
- **Owner.** **reviewer**, at the same round as A5. **Revives when:** masks are reviewed.
- **Blast radius.** Bounded by design — a stricter cut is a query, not a rerun. Listed as sharp
  only because it pairs with A5 and no reviewer round has been scheduled for either.

### A7. ~~The symlink/realpath gap in the review server's path allowlist~~ CLOSED 2026-08-03
**Resolution:** fixed structurally in the handoff-system pass — static serving and batch.ts imagePath containment both check the **realpath**, with tests. See review-server README (handoff convention).

### A7 (original). The symlink/realpath gap in the review server's path allowlist
- **What.** `src/review-server/batch.ts` `isInside()` is a purely **lexical** `resolve` + `relative`
  check. It does not call `realpath`, so a symlink inside the repo pointing outside it passes the
  allowlist. The surrounding rationale claims the allowlist "keeps a malformed push from turning
  the server into a read-any-file proxy" without noting the gap.
- **Why it is here.** This is the **one Phase 0 open item that existed nowhere in the repo** — it
  was raised by the review-server verifier and survives only in commit `2a8a17a`'s message
  ("Known low note: symlink-inside-repo not realpath'd before the allowlist check (follow-up)").
  Transcribing it is the reason this ledger exists.
- **Owner.** review-server workstream. **Revives when:** before the server is ever exposed beyond
  localhost — at which point it stops being low severity.

### A8. ~~The legacy fixtures' README still says the same-color bar is `[UNCALIBRATED]`~~ CLOSED 2026-08-03
**Resolution:** the one-paragraph correction A8 asked for has been applied.
`data/legacy/README.md`:409 now reads "**Within the bar, on all four roles, never exact hex.** The
bar was `[UNCALIBRATED]` when this was decided; **it has since been calibrated per region and
frozen**." The sentence A8 quoted is gone, and the known-worse gate's wiring instructions no longer
under-claim. **Residue, correct and deliberately kept:** the README still says at :438–439 that hit
counts computed **before 2026-08-03** are provisional, because they predate the bar. That is a
different and true statement, not the stale one. Original entry kept below for the record.

### A8 (original). The legacy fixtures' README still says the same-color bar is `[UNCALIBRATED]`
- **What.** `data/legacy/README.md` tells every consumer that "until it lands, no consumer of these
  fixtures can compute a match, only an exact-hex approximation of one" and to treat hit counts as
  provisional. **The bar has since been calibrated per region and frozen** (`PHASE_0_DECISIONS.md`
  §3, §8).
- **Consequence.** The known-worse gate's wiring instructions are stale in the direction of
  under-claiming — a reader would think the gate cannot be built yet.
- **Owner.** legacy workstream (path ownership — reported, not edited here).
  **Revives when:** immediately; it is a one-paragraph correction.

### A9. ~~The concept-vocabulary refinement probe's results are not ratified~~ CLOSED 2026-08-03
**Resolution:** ratified and applied, then extended. `VOCAB_PROBE_NOTES.md`:170 records "Ratified
and applied — 2026-08-03"; the decision is `d-2026-08-03-sam-concept-set-v2`, funded by the 40
records of `sam-mask-quality-2-v2-ratification`. `config.py` has since taken a **further** change —
the barcode add, concept set **v2.1**, with its own record
(`d-2026-08-03-sam-concept-set-v2.1-barcode`). A9 was already stale before the barcode landed and
was the only A-row without a closure marker while A5/A6/A7 carried theirs.
**Two corrections to the original text, worth keeping because it was used to price a decision:**
(1) "**Nothing in `oracle/sam/config.py` was changed**" is false twice over. (2) The re-run cost
quoted as "**~6.5 min measured**" is the **v1** figure (`elapsed=391.2s`, 2.75 s/image); the actual
v2 re-run cost `elapsed=604.1s`, 4.25 s/image = **10.1 min, 55% over**. A vocabulary change is
therefore ~10 minutes of GPU, not ~6.5.
**What A9 did *not* settle, and where it went:** the reviewer's underlying ask — that the concept
wording semantically align with what the model is good at — is a standing direction, not a closed
item. Its live descendants are A12 (CJK below the cut) and A6 (the area guard's group scoping).
Original entry kept below for the record.

### A9 (original). The concept-vocabulary refinement probe's results are not ratified
- **What.** The mask-quality round closed A5 but opened its successor: the reviewer's own synthesis
  was *"maybe we need to adjust the exact vocabulary of our queries so we more semantically align
  with what the model is good at and we'd get even better results"*, backed by three concrete
  mismatches in the same round — "logo"/"sticker" imply a provenance the mask cannot know (note 1),
  parental-advisory marks arrive under "sticker" (note 2), and "album title" masks the artist name
  as often as the title (note 5). Probe 2 was run to answer it and its findings and proposed
  concept set v2 live in **`data/sam/VOCAB_PROBE_NOTES.md`**. Nothing in `oracle/sam/config.py` was
  changed.
- **Why it is sharp.** The same standing rule that made A5 sharp applies unchanged: changing the
  question set is the reviewer's call. Any of the proposed changes — including a tag rename with no
  prompt change — moves `concept_set_hash()`, which is part of `row_key`, so it alters the identity
  of every mask row ever produced and re-runs `sam-eval-142` (~6.5 min measured).
- **Owner.** **reviewer** (ratify, amend or reject the proposal).
  **Revives when:** the next mask-quality round — which should carry the new `parental-advisory`
  masks and `display-text` masks on covers where artist and title compete, since those are the two
  claims a human can actually check.
- **Blast radius.** Bounded and forward-only: today's stored rows stay valid under today's set. The
  cost of *not* deciding is that the labels keep misnaming what they found, which is a category
  error a downstream provenance rule would inherit silently.

### A10. The cascade's B-unmapped route is dead weight — and the adjudicator is same-family
- **What.** The offline cascade simulation (`data/oracle-premise/cascade-sim-1.json`) measured:
  when bulk-B abstains (unmapped), the dense adjudicator abstains too on **97.7%** of those
  items — correlated abstention, both models being Qwen3-VL. That route is 31% of items and
  62% of dense-model cost for ONE committed item. Dropping it is ~free; the measured
  alternative (take D's committed answer there, quality 0.698 on that slice) lifts commitment
  to 94.9%.
- **Consequence.** The bulk-run architecture should adjudicate ONLY B/D-disagreements (19% of
  items); and the cascade cannot be fully trusted until an out-of-family adjudicator exists
  (all measured local candidates failed: Gemma accuracy, InternVL blocked) or the correlated-
  abstention class is accepted as honest underdetermined.
- **Owner.** ~~reviewer (policy pick: take-D vs decline on B-unmapped)~~ **the policy pick is MADE
  (2026-08-03) — see below** + orchestrator (out-of-family option scan, low priority).
  **Revives when:** the bulk run is designed.
- **Blast radius.** Bulk-run cost (17.5h vs 28h) and label coverage (95% vs 64%).
- **AMENDED 2026-08-03 — the take-D half is decided, and it is NOT ADOPTED.** Record:
  `d-2026-08-03-cascade-b-unmapped-take-d-not-adopted`, funded on the 19 reviewer answers of
  `cascade-ground-truth-1`. The offline simulation's "take D's committed answer on the B-unmapped
  slice" was put to the reviewer on the 19 covers where D uses `multiple_distinct_fields`, under the
  corrected §A.2 wording D itself was run under. **D matched the reviewer on 1 of the 8 covers the
  policy would commit** (adoption bar: 6) and on 4 of the wider 19. Escape values landed on 7 of 8, so
  the pre-registered **ESCALATE** branch fired; the REJECT thresholds were met too. Verdict
  UNDECIDED–ESCALATE — **the 8 covers stay unlabelled and the repair belongs to the vocabulary, not to
  the routing.** The `0.698 quality on that slice` figure this row quotes was never a human number: it
  scored D against the shipped palette's gradient flag, which is a fact about the palette and must
  never be called accuracy. **What this does NOT touch:** the correlated-abstention finding (97.7%),
  the same-family adjudicator problem, and the out-of-family option scan are all untouched and still
  open — this row's *other* half is exactly as open as it was. Full write-up:
  `oracle/premise/CASCADE_POLICY_VERDICT.md`. Caveats worth carrying: n=8, 75% of the deciding slice is
  thumbnails, and the round's single match sits on the one cover with a non-comparable prior answer.


### A11. The sharded collection has NO holdout — coverage-set membership is not a claims shield
- **What.** The frozen holdout covers music-artworks only (by design: the sharded supply is
  effectively unlimited upstream, so "never-seen evaluation = import fresh shards" —
  reviewer decision 2026-08-02). The coverage set touches **all 36** sharded clusters, not
  "most" — `COVERAGE_SET.md`:130 records "clusters with no core member: []" — so
  "not in the coverage set" must never be read as "clean for a final accuracy claim". *(Corrected
  2026-08-03; the correction **strengthens** this entry's conclusion rather than weakening it.)*
- **Consequence.** Any end-of-campaign claim on the sharded distribution requires importing
  genuinely fresh shards at claim time; the mechanism has never been exercised.
- **This is now the campaign's only fresh-eyes path, and it is the untested one.** Reviewer ruling
  R-1 of 2026-08-03 (`d-2026-08-03-reviewer-holdout-purpose-is-algorithm-leakage`) establishes that
  the `music-artworks/` holdout prevents **algorithm and tuning leakage only** — the reviewer has
  seen those images many times and we do not claim otherwise. Genuinely reviewer-naive evaluation
  therefore routes **entirely** through the fresh hex-shard import named here. A11 stops being a
  tidy-up item and becomes the thing the whole naive-evaluation claim rests on.
- **Owner.** orchestrator (exercise the fresh-shard import once, before Phase 2 claims).
  **Revives when:** the first sharded-corpus accuracy claim is drafted — **or earlier**, since
  under R-1 it is cheaper to discover the mechanism is hard now than at claim time.
- **Blast radius.** Final claims only; dev work unaffected.

### A12. CJK text is invisible to the SAM stage at the calibrated threshold
- **What.** Probe 4: "chinese characters" recalls 4/4 CJK covers with zero false positives, but
  its best score anywhere is 0.472 — below the 0.578 calibrated cut, so every recovery is
  filtered out. "kanji" clears the cut only on the two Japanese covers. The reviewer approved
  the barcode static add (concept set v2.1, 2026-08-03) but the CJK words were deliberately NOT
  added: at the current single threshold they would contribute nothing.
- **Consequence.** Until fixed, any SAM-derived "text location" signal silently excludes CJK
  covers — the exact class the reviewer's Chinese-character contamination example came from.
- **The category-aware mechanism now EXISTS, and it moves the wrong way (2026-08-03).** Per-group
  thresholds landed (`d-2026-08-03-sam-per-group-score-thresholds`), which is the mechanism A12
  asked for. But the calibrated `text_like` cut is **0.697295** — it moves text_like **UP**, away
  from CJK, not toward it. CJK tops out at 0.472 anywhere. **Per-group thresholds by themselves
  revive no CJK mask**, and A12 is not addressed by them. What A12 needs is a **per-concept**
  threshold (or a separate CJK concept group with its own low cut), not a per-group one — and that
  needs CJK masks a reviewer has actually graded before any low cut can be justified.
- **Owner.** orchestrator (design a per-concept or CJK-group threshold; then a CJK mask-quality
  round — needs CJK covers pulled into the sample, the current quality sample has almost none).
  **Revives when:** SAM masks are first consumed by an algorithm stage, or the next
  mask-quality round is scheduled, whichever comes first. Mask round 3 is already owed by A6, so
  the CJK covers should ride along with the big-area `person` masks.
- **Blast radius.** SAM text-location signals only; the VLM questions see CJK text fine.
- **Standing constraint, restated by reviewer ruling R-3:** A12 and "SAM masks are a **location
  prior, never colour evidence**" both stay in force through the residual-isolation work, until a
  purity round says otherwise.

## B. Standing — parked with a clear trigger

### B1. The bulk-model decision (which VLM runs the corpus pass)
**Updated 2026-08-03 — half discharged, and the remaining half is a different shape.** Two of the
three arms now have **full eval-142 runs**: the incumbent `qwen3-30b-a3b` (284 rows / 142 images /
137 scored / 0 failed) and the dense challenger `qwen3-32b-dense` (236 eval142 rows / 137 scored /
0 failed / 0 parse_failed). Only `gemma3-27b` is still gold-30-only. The arms disagree in
**opposite directions** by variant on the gold-30, where cross-arm agreement is **0.533** — but on
eval-142 the same pair agrees **0.761 (n=142)**, a materially different picture of how far apart
they are, and exactly the number this row said was needed. **What is outstanding is the reviewer
visual evaluations alone.** That is reviewer-bandwidth-shaped rather than GPU-shaped, which matters
because reviewer bandwidth is the campaign's binding constraint. No bulk run starts first.
*Owner: **reviewer** — the orchestrator's half is done.*

### B2. InternVL3.5 is **blocked** — runtime, not choice
mlx-vlm 0.6.8 has no `internvl` model module; every published InternVL3.5 MLX conversion declares
`model_type=internvl`, and mlx-vlm's only InternVL implementation is **dense-only** while both
size-appropriate 3.5 checkpoints are **MoE**. Probed 2026-08-03. The revision is pinned anyway so a
later runtime upgrade starts from a known point. Fallback in place: Gemma 3 27B.
*Revives when: an mlx-vlm upgrade ships `internvl` MoE support.*

### B3. The oracle probe arm is parked, findings banked
Human half ran (43.3% vs a 63% noise floor — see `PHASE_0_DECISIONS.md` §6). **VLM half never ran**,
so its own three questions (are the probes easy, does the inconsistency rate earn its place, does
bundling contaminate) are unanswered. ~~All nine prompt files are inert — no glob matches them.~~
**Corrected 2026-08-03: a glob now matches them.** `common.py`'s `PROMPT_SETS` registry registers
`group-a.probes.bundled` and `group-a.probes.solo`. The *operational* guarantee survives — the
default prompt set is still `group-a.v1`, no A/B rerun is affected, and the arm is still gated on
an explicit opt-in — but the mechanism is now "**nobody selects them**", not "nothing can reach
them", which is a strictly weaker property and should be stated as the weaker one wherever it is
quoted (`PHASE_0_DECISIONS.md` §6 and `PREMISE_NEXT.md` are corrected to match).
*Revives when: an explicit orchestrator opt-in, and not before the bulk-model decision.*

### B4. ~~The criterion arm (variants C, D) is drafted and unrun~~ CLOSED 2026-08-03
**Resolution: it ran, and the answer is adverse.** `premise-run-cd.jsonl` — 299 rows, variants C
and D, `schema_version: group-a.v2`, 142 images, all ok. Write-up at
`oracle/premise/CD_RESULT.md`. The arm did the job it was drafted for and the job returned a
negative: **holding B's order fixed does not reproduce B's result.** C and D agree with each other
on 0.4599 of artworks — worse than A agrees with B (0.708) — so ordering is **not sufficient** and
the A→B difference cannot be attributed to it. Design rule 6 is retagged accordingly
(`ORACLE_QUESTION_SET.md`), and the freeze itself stands. The gate half of the same run is carried
forward in **B5**, which is where the still-open part lives. Record:
`d-2026-08-03-group-a-corpus-gate-outcome`. Original entry kept below for the record.

### B4 (original). The criterion arm (variants C, D) is drafted and unrun
It is the only thing that deconfounds variant B's **ordering** from its **wording** — the confound
the current instrument freeze rests on. ~50 min of GPU. *Owner: orchestrator.*

### B5. Group A has not earned corpus-wide status — **still open, amended 2026-08-03**
At variant B's numbers `ground_type` agrees with a human on 53% of *contested* artworks and
discards 31% of its answers. The corpus-wide gate is specified in `oracle/premise/PREMISE_NEXT.md`
§4.

**Amendment: the gate has now been evaluated, and it splits — one half satisfied, the other
worse.** From the criterion arm (B4):

- **The unmapped half is SATISFIED, outright.** 0% unmapped under both C and D, against a required
  ≤15% and against 31–44% under A/B. This is a large favourable result and it removes the
  "the instrument refuses the question" objection entirely.
- **The exact-match half is WORSE, not merely unmet.** No variant reaches the required 22/30 (best
  16/30), and C-vs-D agreement is 0.4599 — below A-vs-B's 0.708.

So the reason group A has not earned corpus-wide status has **changed**: it is no longer that the
answers refuse the question, it is that the answers given do not match the human often enough.

*Revives when:* **not** the bulk-model decision any more — that framing assumed the gate was
unevaluated. The new revival condition is **either successor route landing**: (a) the `group-a.v3`
vocabulary split, which is the gate's own pre-registered escalation branch; or (b) the reviewer's
**residual-isolation** route (R-3,
`d-2026-08-03-reviewer-background-via-residual-isolation`), which is the chosen direction and which
would **moot** this row rather than close it — if background structure becomes a pixel computation,
group A's corpus-wide status stops being a question anyone needs answered. Route (a) is the
fallback if (b) fails a second time.

**Further amended 2026-08-03 — route (a) is now known to be a partial repair, and that is new.** The
free-text round on the escalation's 9 misfit covers found **6 of 9 palette-decidable in prose and 3
genuinely ambiguous even in prose**, and found that the words the reviewer actually reaches for are
positions, proportions and counts rather than categories. A `group-a.v3` vocabulary can relabel the
covers that were already decidable; it **cannot** reach the three where the prose does not converge,
because those fail on the figure/ground line the question never asked about. So route (a) is no longer
a clean fallback for route (b) — it is a repair with a measured ceiling. This does not change B5's
revival condition, and it does not make route (b) work; the residual route still has **no purity
measurement**. See B24 and `oracle/premise/GROUND_FREETEXT_SYNTHESIS.md`.

### B6. Oracle groups B–F are unpiloted draft — **CORRECTED 2026-08-03: B, C, D and E are piloted; only F is not**
~~Nothing has touched them.~~ **False against 163 warehouse records.** Groups B, C, D and E were
piloted **twice** — model side (`group-bcde-pilot-1.jsonl`, 299 rows, 142 images, all ok, with
`bcde-pilot-1-analysis.json` carrying 49 pre-registered verdicts) and human side (batch
`bcde-validation-1`, released, 160 items over 20 artworks × 8 questions). Two reviewer rulings and
design rule 9 came **out of** that round. **Group F alone is genuinely untouched** — no
`light_text_safe` / `dark_text_safe` / `two_color_faithful` record exists anywhere.

What survives of this row, and why it stays open rather than closing: all five groups are still
`[UNCALIBRATED]`, and E–F remain candidate tier — "survive only if the validation sample shows both
reliability **and** actual downstream use". One pilot is not that sample, and the pilot's own bars
are unresolved (see B19). **Nothing may be graded against the `bcde-validation-1` rows until L-b's
contradiction rate has a reading.** *Revives when: the pilot's failing bars are adjudicated and a
second round exists.*

### B7. The §A.5 `ground_type` vocabulary split — proposal, `HELD`, "do not implement" — **and the hold is now the live question (2026-08-03)**
Superseded by the probe arm, which generalises it. Kept for the record. Re-elicitation against a
new vocabulary costs ~3 minutes of reviewer time, which is the reason nothing should be shaped
around avoiding it.

**Amended 2026-08-03 — this row stopped being an archived proposal and became the thing two
independent lines of evidence now point at.** `CD_RESULT.md` §5 concluded from the model side that
the vocabulary rather than the criterion is the problem; the cascade round's ESCALATE verdict
(`d-2026-08-03-cascade-b-unmapped-take-d-not-adopted`) reached the same place from the human side.
So the split is **due** — but the free-text round built on the escalation's own 9 covers has since
made the *shape* of the repair the open question rather than its timing.

**What `ground-freetext-1` established, and why it complicates the split rather than authorising it.**
All 9 covers are describable in prose; **6 of 9 are palette-decidable in prose and 3 are genuinely
ambiguous even there.** The recurring gaps are nesting, composition, count-vs-texture sharing one slot,
**extent** (the reviewer volunteered area proportions unprompted on three covers), **scope** (two
covers say explicitly that no global answer exists), and — the deepest one — **the figure/ground line,
which the question presupposes and never asks about.** Two consequences for this row: a richer
vocabulary **cannot reach** the 3 covers where the prose itself does not converge; and on `000f0a78`
the vocabulary **already contained the right word** and the reviewer still could not use it, which
rules out "the list was too short" as the whole story. Synthesis:
`oracle/premise/GROUND_FREETEXT_SYNTHESIS.md`; record
`d-2026-08-03-ground-freetext-primary-evidence`. **The split-versus-retire choice is B24**, and this
row should not be implemented ahead of it.

### B8. ~~`PREMISE_NEXT.md` §14 sign-off ledger has three unsigned items~~ CLOSED 2026-08-03
**Resolution:** §14 has been brought up to date — row 4 (probe wording, v1.1) and row 5 (the
derivation table, signed **as rules, skimmed**, not read row by row) are **SIGNED OFF 2026-08-03**,
and row 7 (the human probe round) is marked **DONE** with its result. §7 of the same file, which
still described rows 1–3 as pending, was made to agree on 2026-08-03. Nothing on that ledger is
blocking; the arms wait on a GPU slot. Original entry kept below for the record.

### B8 (original). `PREMISE_NEXT.md` §14 sign-off ledger has three unsigned items
The probe wording (item 4), the 729-row derivation table (item 5), and the human probe round
(item 7). **The round was run; the ledger was never updated to say so.** *Owner: reviewer +
oracle/premise workstream.*

### B9. The anisotropy finding is unencoded and tripwired
OKLab distance looks anisotropic under the reviewer's criterion: at a fixed 0.01500, lightness-only
pairs read "same" 4/4, chroma-only 2/4, hue-only 1/4. This is a **missing dimension, not a width** —
no scalar bar can express it, and the calibration-consequence analysis explicitly cannot price it.
Held by a deliberate failing-on-purpose tripwire in `tests/contract-color.test.ts`.
*Revives when: a round 3 is ever justified — this is the better question to spend it on than the
hue split.*

### B10. The light-saturated hue split is unencoded and tripwired
0.01516 / 0.02074 / 0.03805 by hue third — a 2.5× spread, and the single 0.02293 is "a deliberate
placeholder, not an accident". **Not adopted**: it flips only toward more violations, all on
endorsed or accepted palettes, and its 0.03805 third is the middle of a separation gap rather than
a fitted crossing. Same tripwire as B9.

### B11. The accent visibility distance is bracketed, not pinned
0.07444 was measured under **complete separation** — the logistic curve alone cannot pin it, and
the reported value is the middle of a 0.06300–0.08796 band.

### B12. The P1 excursion bar is still inherited
2.5× the same-color bar, carried over from v2-3; the bracketing round was supposed to recalibrate
it and did not.

### B13. The straddle rule is a default with a reason, not a finding — **and the reason has been withdrawn**
When a pair straddles two ruler regions the larger bar wins (`Math.max`). **Amended 2026-08-03: the
only measured justification this rule ever had is withdrawn as unreproducible**, and an independent
replication attempt favours **`midpoint`** instead. `Math.max` is now held **on the safety argument
alone** — the larger bar is the more conservative one, so a straddling pair is called "same" more
readily, which fails toward merging rather than toward publishing an invisible distinction.
That is a defensible reason. It is not a finding, and it is no longer even a measured default.
**This is a reviewer-queue item:** re-decide the straddle rule on the safety argument explicitly, or
take `midpoint` and accept the direction change. *Owner: **reviewer.***
*Revives when: the reviewer rules, or a bracketing round is run with deliberately straddling pairs
— whichever comes first; the round is no longer a precondition for the decision.*

### B14. Where the contrast parameters act is deliberately undecided
"Winner-stage repair" presumes v2-3's shape. Deferred on purpose to become a **Phase 2 bake-off
criterion**: (a) parameters at defaults → byte-identical to the unparameterized algorithm;
(b) enabling a floor may change only artworks that actually violate it — zero collateral.

### B15. The gradient module's indistinct-fraction shape is open — **narrowed 2026-08-03 to the ramp INTERIOR**
~~Foreground-vs-stops is deliberately **not** in the invariants.~~ **Published stops are now
enforced** (`minTextContrast` covers every published stop as of 2026-08-03, code
`I4.stop-below-contrast-floor`; `d-2026-08-03-min-text-contrast-covers-published-stops`), so this
row no longer covers them. What stays open is the **ramp interior**: between two published stops
the quantity is a **fraction**, not a pair contrast, and its shape (floor plus max-fraction) still
belongs to the gradient module when that exists. The interior is now the *only* part of a published
gradient the contract does not police, which is a much sharper statement of the gap than "stops are
not in the invariants" was.

### B16. ~~The palette composer / `endorsed-sample` flow is unbuilt~~ CLOSED 2026-08-03
**This row was wrong in three independent ways, and the README was right about all three.**
(1) **It is built** — `src/review-server/composer.ts` (eyedropper resolved against the decoded
image, swatch grid of exact source pixels, membership enforced at submit) plus
`review-ui/composer.js` (`GRADIENT_MODES = ["flat","2-stop","3-stop"]`, preview POSTed through the
pinned renderer), `endorsed-sample` records, deletion, and `tests/review-server-composer.test.ts`.
(2) **Two `[UNCALIBRATED]` constants, not three** — `SWATCH_GRID_SIZE = 24` and
`IMAGE_COLOR_CACHE_SIZE = 2`. The third, `SWATCH_CLUSTER_LIMIT = 256`, is **`[MEASURED]`** with a
documented measurement; miscounting a measured constant as uncalibrated is exactly the error the
provenance-tag convention exists to prevent, and this ledger made it. (3) **The README was already
reconciled** — `src/review-server/README.md` lists the composer under *Working end to end* and its
"Not built" list does not mention it. Its rules were and are pre-decided there (an endorsement is
immutable evidence). *The general lesson is recorded at the foot of this file: a ledger row
asserting that another workstream's code is unbuilt must cite that workstream's README.*

### B17. Review-server features specified but unbuilt — **half of this list is built (corrected 2026-08-03)**

| item | state |
|---|---|
| Post-release amendments (server returns 409) | **BUILT** — `server.ts` maps `Conflict → 409`; `tests/review-server-amendments.test.ts` |
| calibration `mode: "absolute"` | **BUILT** — `tests/review-server-calibration.test.ts` |
| the completion watcher | **BUILT** — `src/review-server/watch-batch.ts`, offset-tracked JSONL tail, exit 0/2/1; `tests/review-server-watch-batch.test.ts` |
| note-only records and tags | still open |
| **coverage-aware sequential stopping** | still open — blocked on another workstream's embeddings. Mitigated by recording `stratum` on every `oracle-label` row, so the rule applies retroactively to rounds already run. `REVIEW_UI.md` §6 previously stated this as fact and now marks it unbuilt |
| multi-reviewer use, auth, LAN exposure | still open — and the *deployment* half is decided, not open: the server binds `127.0.0.1:3010` by policy (see `REVIEW_UI.md` §8) |

`src/review-server/README.md` is the accurate document for all six; this row was behind it. Three
of six were stale in the "unbuilt" direction — the same inversion as B16.

### B18. ~~The tagging vocabulary is undrafted, and must be symmetric~~ CLOSED 2026-08-03 — it shipped, at v2.1.0
**Resolution:** `data/tagging/vocabulary.json` is **v2.1.0** — **103 tags across 12 axes**: 96 tags
in **48 opposed judgment pairs**, plus **7 descriptive tags** on `instrument-behavior`.
`lintVocabulary` / `loadVocabulary` enforce it on read; three validation passes are complete; the
reviewer-note port is idempotent and 13 derived `note` records are live in the warehouse. Tooling
and per-axis counts are in `src/tagging/TAGGING_PROTOCOL.md` §2 and `data/tagging/TAGS.md`, which
are the authorities.

**B18's requirement was not merely met but refined, and the refinement is the interesting part.**
"Symmetry is the requirement" turned out to be *almost* right: a vocabulary needs a **scoping rule**
that pure symmetry cannot express. The 7 descriptive tags have **no opposite by design**, so the
vocabulary is deliberately **not uniformly symmetric** — and a consumer enforcing naive symmetry
would reject the real file. The rule that says where symmetry applies is recorded as
`d-2026-08-03-tagging-symmetry-scoping`. The underlying purpose stands unchanged: a vocabulary that
can only express complaints produces a corpus that can only measure complaints.
*(This row said "undrafted" while `REVIEW_UI.md` §8 struck the same item through as "Built
2026-08-03" — two governing documents asserting opposite states for one instrument. Both now agree,
and both defer to the protocol for the counts.)*

### B19. The BCDE pilot's two failing bars and one met wrongness condition have no owner
*Added 2026-08-03.* The as-registered accounting of the BCDE pilot is **36 bars: 34 pass / 2 FAIL**
(superseding the auditor's provisional 35/1 — `text_roles` flipped when the gate-dilution fix
landed). Three items are unadjudicated and all three are cheap:

- **`15.6-2b.text_roles`** — FAIL. The presence-rate bar computed on the gate-open subset.
- **`has_signature_color`** — FAIL, modal share **0.8592**.
- **`overlays`** singleton at **0.9542** — meets §15.8's *wrongness* condition, which says the
  question is asking something with one obvious answer. Default remedy if nobody overrides: it
  becomes a **plain enum in v2** rather than a multi-select. Note the interaction with L-f — all 22
  `overlays` answers are single-element arrays, so the multi-select machinery was never exercised
  by this round either.

*Owner: **reviewer** (each is a "is this actually a defect" call, ~2 minutes) + oracle/premise
workstream (apply the outcome). **Revives when:** the next group-BCDE round is designed — nothing
should be re-piloted before these three are read.*

### B20. `SINGLETON_NEAR_ONE = 0.90` is post-hoc
*Added 2026-08-03.* The threshold that decides whether a question's modal answer is "near one" —
and therefore whether the question is asking something with an obvious answer — was chosen **after**
seeing the pilot's distributions. It is the bar that B19's `overlays` item turns on. §15.8 should
carry a **pre-registered** number before the next pilot, or the wrongness condition is a rule fitted
to the data it judges. *Owner: oracle/premise workstream. **Revives when:** the next pilot is
registered — this must be settled before it runs, not after.*

### B21. Does `minAccentContrast` extend to published stops?
*Added 2026-08-03, reviewer queue.* `minTextContrast` now covers every published stop
(`d-2026-08-03-min-text-contrast-covers-published-stops`); `minAccentContrast` **does not**, and a
test pins that. The asymmetry is currently a fact rather than a decision. The argument for leaving
it: an accent is not text, its stakes are lower, and §2 gives it its own knob for exactly that
reason. The argument against: an accent that vanishes into a published stop is invisible in the same
literal sense a foreground is, and invariant 3 already treats an invisible accent as never valid.
*Owner: **reviewer** (one call). **Revives when:** asked — it is a ~2-minute decision that currently
blocks nothing, which is why it is standing rather than sharp.*

### B22. Bracketing item ids are not artwork-derived, so `--item` cannot address them
*Added 2026-08-03.* Item ids in the bracketing rounds (`p1-*`, `r2-*`) are round-local synthetic
ids, not derived from any artwork or content hash. Consequence: `warehouse query --item` cannot
address a bracketing answer from the warehouse alone — you need the round's own fixture to resolve
what `r2-17` was. Harmless while the fixtures are committed beside the data; it becomes a real
archaeology cost the first time a bracketing result is questioned without them.
*Owner: warehouse workstream. **Revives when:** any analysis needs to address bracketing answers
individually from the warehouse, or a bracketing round 3 is designed.*

### B23. `fundedByArtifacts.sha256` values go stale and nothing recomputes them
*Added 2026-08-03.* Of the 9 recorded hashes in `decisions.json`, **2 no longer match the file on
disk** — both from ordinary housekeeping that changed prose and regenerated counters, neither
changing a number any decision rests on. No tool recomputes them, by design: `fundedByArtifacts` is
the deliberately-unchecked field, and `sha256` there means "this is the version I read", not "this
is sealed". The loose end is that the field *looks* like a seal, and a reader may treat it as one.
Cheapest honest fix is a re-hash pass that reports drift without failing.
*Owner: housekeeping. **Revives when:** anyone relies on a recorded `sha256` to establish that an
artifact has not moved.*

### B24. Vocabulary v3 versus retiring the ground question to pixels — the choice is open and it is the reviewer's
*Added 2026-08-03, out of `ground-freetext-1`.* The `ground_type` vocabulary
(`flat_field | shaded_field | multiple_distinct_fields | full_scene | pattern_or_texture |
none_discernible`) has failed twice over — the cascade round escalated to it
(`d-2026-08-03-cascade-b-unmapped-take-d-not-adopted`), and the free-text round showed **what** it is
missing. Three options are on the table and **none is adopted**:

- **(a) vocabulary v3** — a small *structured* answer rather than a longer list: number of ground
  regions, layout, per-region character, and an extent. Fixes nesting, composition, count-vs-texture
  and extent; **cannot** fix scope or the figure/ground line.
- **(b) retire the question to pixel computation** via the residual route (reviewer direction R-3,
  `d-2026-08-03-reviewer-background-via-residual-isolation`), keeping the prose descriptions as the
  **evaluation vocabulary** — the language a human uses to say the computed answer is right, rather
  than the language they must answer in.
- **(c) both** — v3 as the near-term label source, pixels as the destination.

**The synthesis argues for (b), plus one narrowed human question that is not a taxonomy** — *which
parts of this cover are ground* — on the grounds that 8 of 9 descriptions fix the ground's *kind* and
the failures are all on *which pixels*, and that the quantities the reviewer volunteers (position,
extent, count, relative brightness) are exactly what a residual pass produces natively. **That is an
argument, not a ruling.** Nothing may be built against it until the reviewer picks.

*Owner: **reviewer** (the pick) + oracle/premise workstream (whichever route is picked).
**Revives when:** the residual route's **first purity measurement exists** — before that, option (b)
cannot be evaluated on evidence and a pick would be a preference. Note the asymmetry in cost of
waiting: (a) is a redesign plus a re-elicitation round plus a new `labelSchemaVersion`, which reopens
every downstream comparison, so picking it early is expensive and picking it late is not.*
*Blast radius: everything that consumes a ground label, and B5's and B7's revival conditions both
route through this row.*
Records: `d-2026-08-03-ground-freetext-primary-evidence`,
`d-2026-08-03-cascade-b-unmapped-take-d-not-adopted`. Synthesis:
`oracle/premise/GROUND_FREETEXT_SYNTHESIS.md`.

---

## C. Latent — harmless today, harmful under one specific move

### C1. The holdout quarantine list
12 artworks that **failed** the candidate filters (non-square, thumbnail-only, real-transparency)
are near-duplicates of held-out artworks. They are in nobody's working set, so nothing leaks —
**but a transparency edge-case batch or a banner-shaped pathology hunt would create the leak.**
Ids in `holdout.json` → `header.nearDuplicateCensus.nonCandidateQuarantine`. **Treat as held out.**

### C2. The near-duplicate census undercounts by 46.3%
Measured against duplicates the filename ground truth already knows about. Component isolation
removes the duplicates we can see, not all of them — **end-of-campaign holdout numbers carry
residual optimism** that cannot be removed at this threshold.

### C3. A holdout re-roll voids every claim made against the old list
It has happened once, deliberately, with reviewer authorisation (v1 → v2). Changing `HOLDOUT_SEED`,
the census, or the component rule does it again. *Authorisation-gated: reviewer only.*

### C4. The DINOv2-vs-DINOv3 choice was never fully argued — **amended 2026-08-03: it names the wrong pair**
`GALLERY_NOTES.md` closes with "v2-vs-v3 **pending** the tiebreaker + tail-behavior argument", and
the reviewer's own words are "I think the DINO models are better, but I wouldn't know which one of
the 2."

**Amendment — what is settled and what is not, stated precisely, because this row had it backwards.**

- **dinov2-vs-dinov3 IS settled on the headline metric.** Paired McNemar over the same 24,648 pairs:
  dinov2-vitl14 beats dinov3-vitl16 at **p = 1.4e-22**. That is not a coin flip and must not be
  described as one.
- **The genuinely unseparated pair is dinov2-vs-pe-core**, which this row never mentioned:
  b01 = 1,573 against b10 = 1,559 — a **14-pair margin in 24,648**, χ²cc = 0.05, **p = 0.816**.
  The bake-off does **not** separate them and must never be cited as though it did. What separates
  them is **the reviewer's eye alone**: the gallery browse found pe-core matching by *artist* rather
  than by image, which is semantic leakage for every use this instrument has. If that observation is
  ever withdrawn, the canonical-model decision has **no remaining evidence** and must be **reopened,
  not re-derived** (`d-2026-08-03-embedding-canonical-model-rationale`).
- **What stays open here is the trade, not the ranking.** dinov3-vitl16 has the better **tail**
  (worst rank 17 against dinov2's 64) while losing on R@1 at p = 1.4e-22. That trade was **decided by
  the headline metric rather than argued**. Whether tail behaviour should outrank R@1 for
  near-duplicate detection specifically — where the worst case is the one that matters — is the
  open question.

Mitigated as before: the near-duplicate graph deliberately takes the **union** over three arms, so
the leak-prevention path does not depend on the choice.

### C5. The reviewer's gallery notes are not warehouse records
`GALLERY_NOTES.md` says they are "to be ported into the warehouse as tagged note records once the
tagging flow exists" (B18). Until then the canonical-embedding decision has an **empty `fundedBy`**
and `warehouse recheck` can never flag it. Same structural gap for the holdout redraw
authorisation, the legacy recency ruling, and the SAM prompt-set change.

**Update 2026-08-03 — half closed.** The port happened: 13 reviewer observations (4 gallery, 6 SAM
mask review, 3 `ORACLE_QUESTION_SET.md` Appendix R rulings) are now raw `note` records in the
warehouse, keyed by source document (`data/tagging/port-reviewer-notes.ts`, re-runnable and
idempotent).

**Correction to that update, 2026-08-03 — "nothing cites them yet" is false, narrowly.** All 13
ported note ids appear in the `fundedBy` of `d-2026-08-03-tagging-symmetry-scoping` and
`d-2026-08-03-tagging-meta-scope` (13/13 by set intersection). So C5's *conclusion* holds and its
*evidence sentence* does not.

**C5's actual remaining half, stated exactly.** Every one of the four decisions this row names still
has `fundedBy: []` — `d-2026-08-02-embedding-canonical-model`, `d-2026-08-02-holdout-v2-redraw`,
`d-2026-08-02-legacy-contested-pairs-recency`, `d-2026-08-03-sam-prompt-set-replacement`. Note that
one of the four is **correctly** empty and is not part of this gap: the legacy contested-pairs
recency ruling was given conversationally, which `CONVENTIONS.md` says *must* carry an empty
`fundedBy`. The same is true of the three reviewer rulings recorded on 2026-08-03. **An empty
`fundedBy` is only a defect where a warehouse record exists and is not cited.**

**And the port is now three rulings behind (recounted 2026-08-03, evening).** This row counts
"3 Appendix R rulings", and `data/tagging/port-reviewer-notes.ts` stops at `appendix-r-3`. Appendix R
now carries **six** dated entries — the sixth added by the consolidated post-review pass, recording
the cascade and free-text rounds and applying nothing. The two before it are both marked
**"SIGNED OFF 2026-08-03"**: `has_dominant_subject` has no
unit rule ("count the groups you would circle, not the things you could name"), and
`signature_carrier` forces one answer, so make it multi-select. **Two signed reviewer rulings
currently fund nothing and are invisible to `warehouse recheck --decisions`** — while 163 warehouse
records from the round that produced them sit available, and the decision that should cite them
(`d-2026-08-03-bcde-question-rulings-and-rule-9`) has `fundedBy: []`.
*For whoever fixes it:* re-running the idempotent port with `appendix-r-4`/`-5` also invalidates the
"13 of 13" fixture in `TAGGING_PROTOCOL.md` §8 and the pin in `tests/tagging-validation.test.ts`.
**Three files, not one.** *Owner: tagging workstream + housekeeping.*

### C6. The legacy identical-timestamp warn path is untested by reality
`contested` now means only "conflicting grades sharing an identical timestamp", which warns rather
than blocks. **There are zero such conflicts**, so the path has never fired.

### C7. `data/holdout/measurements.jsonl` — 1.08 MB of committed, regenerable cache
It is a real consumer-facing file (`oracle/ladder/build-manifest.ts` reads it) and deleting it only
makes the next freeze slower. The only open question is whether a megabyte of regenerable cache
belongs in the repo. No stated resolution condition.

### C8. Disk headroom
107 GB free of 926 GB (88% used) with three pinned VLM arms on disk. The next multi-arm workstream
should check before pulling another 30 GB model.

### C9. Three of the twelve pinned gallery query covers are held out
*Added 2026-08-03.* The embedding gallery pins 12 query covers; **3 of them are held-out artworks**
— `johns`, `krafty`, `muse` — and they are the covers named in the observations that decided the
canonical embedding model. Under reviewer ruling R-1 this is a **disclosure, not a defect**: the
holdout prevents algorithm and tuning leakage, and the reviewer has seen these images many times.
It is still worth fixing, because a pinned query cover is looked at repeatedly and forever.
**Fix:** choose 3 replacements from the working set. **Cost:** minutes.
*Owner: embeddings workstream. **Revives when:** the gallery is next regenerated.*

### C10. The census's holdout block is superseded by a sidecar, and old readers do not know
*Added 2026-08-03.* `near-dup-census.json`'s embedded holdout block is **stale**; the current
holdout-v2 view lives in the sidecar **`near-dup-census.holdout-v2.json`**. Anything that reads
`holdout_crossing` or `pairs[].side` **must read the sidecar** — the in-census fields answer the
question for the *voided v1* draw. Nothing enforces this: a consumer reading the census directly
gets a confidently wrong answer rather than an error, which is the same failure shape as the SAM
model-manifest pinning an old concept set.
*Owner: embeddings workstream. **Closes on:** the next census regeneration, which folds the sidecar
back in. Until then the sidecar is authoritative.*

### C11. ~~Whether the gallery browse's holdout exposure needs resolving~~ RESOLVED 2026-08-03
**Not an open item — recorded so it is not re-raised.** The bake-off gallery browse that decided the
canonical embedding model rendered **117 of the 413 held-out artworks** (28.3%), 2 quarantined
non-candidates, and 3 pinned query covers. That was flagged as an undecided exposure. **Reviewer
ruling R-1 of 2026-08-03 resolves it**: the holdout's claim is **algorithm and tuning leakage
prevention only**, never reviewer-naive eyes — *"Every image that comes from `music-artworks/` I
have seen multiple times before. We cannot claim I have never seen them (and we don't need to)."*
So the exposure is a **measured fact to disclose** (it is disclosed, in `HOLDOUT.md` and
`HOLDOUT_EXPOSURE.md`), not a problem to solve. The gallery's exclude-by-default stays as **hygiene**
— cheap, and there is no reason to spend the holdout casually. The genuinely load-bearing
consequence went to **A11**: fresh-eyes evaluation now routes entirely through fresh hex-shard
import, and that mechanism has never been exercised.
Record: `d-2026-08-03-reviewer-holdout-purpose-is-algorithm-leakage`.

### C12. The holdout freeze pins the census's pair count, but never its arm list
*Added 2026-08-03.* `PHASE_0_DECISIONS.md` §5 says the near-duplicate census takes the **union over
three named embedding arms** at cosine ≥ 0.95, and `freeze-holdout.ts` genuinely asserts zero
crossing edges on every run. But the **arm list itself is never asserted against a pinned
constant**: `NEAR_DUP_ARM_CRITERION` is a doc string, and the census sha256 is computed and recorded
in the header but **never compared**. The only identity pin is `EXPECTED_CENSUS_UNION_PAIRS = 6386`.

**So a census silently swapped to a different arm set with the same pair count would pass every
check.** This matters more than it looks: **C3** makes a holdout re-roll authorisation-gated and
reviewer-only, and **the component rule is one of the three things C3 names as re-rolling it** — so
the guard against an accidental, unauthorised re-roll is currently *a pair count*, not the rule
itself. Cheap fix: compare the recorded census sha256, and assert the arm list against a pinned
constant rather than describing it in prose.
*Owner: holdout workstream. **Revives when:** the census is regenerated for any reason — including
the C10 sidecar fold-back, which is a census regeneration.*

---

## L. Review-server and round hygiene (added 2026-08-03, from the adversarial review)

Eight items the review-server arm surfaced. They are grouped separately because they share one
owner and one revival window — the next reviewer round — rather than one severity.

### L-a. Four of five released oracle rounds have a dead adjudication link, and `verify-live` passed anyway
The dashboard offers `afterRelease: /oracle-review?batch=<id>` for every released oracle round;
four of five land on a page that renders `could not load: …`, because the endpoint behind it serves
only `group-a.v1`. `verify-live` crawled the *page* and never the JSON the page loads, so it
reported `ok: true, failures: 0` while the reviewer's single documented entry point was broken. The
crawl gap is fixed; the **dead links themselves are the open part**, and so is the general lesson:
`verify-live` must crawl every endpoint the UI can request (`/api/queue` and
`/api/oracle-review/:id` were both uncrawled), or its green is decoration.
*Owner: review-server workstream. **Revives when:** the next round is released — a reviewer
following the dashboard hits this immediately.*

### L-b. ~~The bcde round's 45% contradiction rate has NO reading, and nothing may be graded against these rows until it does~~ CLOSED 2026-08-03
**Resolution: the reading exists, and it is that the rate was never a defect.** Record:
`d-2026-08-03-gate-contradictions-are-elicitation-mode-effects`, funded on the 17 standing answers of
`bcde-gate-reconciliation-1`. **Independent and joint elicitation are two instruments, and neither is
the other's correction.** Asked question by question, the reviewer's answers contradict the gate table
**9 times across 8 of 20 artworks = 45%**. Re-asked jointly, **0 remain = 0%**. The ≤10% ceiling was
registered in `PREMISE_NEXT.md` §15.6-(3) **for the model**, whose constrained decode emits the gate
first and the dependent in its context — so the model's coherence is **architecture, not virtue**, and
the number does not transfer to a human answering each question in isolation under an instruction that
expressly forbade making the answers cohere. The reviewer's own account is the key: *"if you ask me
'is there a subject?' i might answer 'no', but if you ask me separately 'what is the subject?' i would
answer 'an animal' … if you ask me jointly … then I will change my answers so they are coherent
together."* The independent pair carries **more** information than the reconciled one, and what the 45%
measures is how often the gate's variable and its dependent's variable come apart on real covers —
which is the argument for splitting them (`d-2026-08-03-schema-v2-split-gated-pairs`, a **proposal**
awaiting reviewer sign-off), not for grading a human against a decoder's bar.

**The standing prohibition is LIFTED**, on this reading and with three conditions that travel with it:
every figure must be **labelled with its elicitation mode and the two never blended**; a downstream
consumer reads the **standing (joint)** state, because it must read exactly one and supersession picks
it by recency rather than correctness; anything said about what the reviewer *perceives*, or about how
by-question elicitation *behaves*, reads the **independent** state. **L-h is not closed by this** — the
served-wording divergence on `bcde-validation-1` is a separate defect and a candidate contributor to
the 45%, and it is not separable from the elicitation-mode effect by this evidence. The reconciliation
round carries its own wording defect too, recorded rather than re-run
(`d-2026-08-03-reconciliation-round-wording-caveat`).
Original entry kept below for the record.

### L-b (original). The bcde round's 45% contradiction rate has NO reading, and nothing may be graded against these rows until it does
**The sharpest item in this section.** `PREMISE_NEXT.md` pre-registers a gate-consistency ceiling of
**"total contradiction rate ≤ 10% of ok rows"**. Recomputed from raw warehouse records for
`bcde-validation-1` (20 artworks, all four gate pairs served in one round), the **reviewer's own
answers** contradict each other on **9 of 20 = 45%** — about **four times** the registered ceiling —
and no document reported it. *(45% is the like-for-like per-row figure and supersedes the fleet
report's 40%, which put a per-contradiction numerator over a per-artwork denominator.)*

The reading is **not** "the reviewer is unreliable". A 45% self-contradiction rate on a question set
means **the questions do not have unique answers** — design rule 9's finding arriving as a number
instead of an anecdote. But that is an interpretation, and it is not on the record.

**Standing prohibition until it is: NOTHING may be graded against the `bcde-validation-1` rows.**
No VLM comparison, no reliability figure, no "the model agrees with the human on X". The reconciliation
labeling round now being built is what is expected to supply the reading.
*Owner: **reviewer** (the reading) + oracle/premise workstream (the round). **Revives before** any
VLM comparison against `bcde-validation-1`.* Record:
`d-2026-08-03-reviewer-answers-held-to-model-ceiling`.

### L-c. The push-time arm-separability diagnostic is unbuilt, so blinding's content channel stays open
Blinding guarantees exactly one thing — that the batch order cannot be reconstructed from the item
hash. It does **not** hide content-level arm identity, measured at **24/24** on a two-arm batch whose
arms differed only in style. Stop positions are now canonicalized to 6 dp, which closes one narrow
leg. The general case needs a push-time check reporting whether the arms are separable by any served
field — **and it must never refuse a push**, because a legitimate bake-off may deliberately compare a
flat paradigm against a gradient one; the right response is to know it, not to be stopped.
*Owner: review-server workstream. **Revives when:** the first real two-arm batch is designed — Phase
2's bake-off, which is exactly the shape that fails the test.* Records:
`d-2026-08-03-blinding-guarantees-exactly-one-thing`, `d-2026-08-03-gradient-stop-canonical-form`.

### L-d. `batchReviewPaths` advertises the adjudication page from `kind` alone, ignoring label schema
The server returns `afterRelease: /oracle-review?batch=<id>` for **every** `oracle-validation` batch,
though the endpoint behind it refuses anything that is not `group-a.v1`. The server knows this at
dashboard-build time — the fixture's `labelSchemaVersion` is in hand — and emits the link anyway.
`afterRelease` should be `null` when the adjudication view cannot serve the batch, which is already
the modelled case for `bracketing`. This is the mechanism under L-a.
*Owner: review-server workstream. **Revives when:** L-a is fixed; they are one change.*

### L-e. A reviewer refusal is silently recoded as "the reviewer agreed with neither wording"
`variantSplitSubset` in the bcde-validation analyzer has **no can't-tell bucket**, so a
`not_applicable` answer is reported as `reviewerWithNeither: 1` — which reads as a substantive human
answer that missed both wordings, when the human **declined to answer**. Manifest case:
`signature_carrier` on `0e/ab67616d00001e02000e007955ee2f8b29f5b2b4`. The bucket logic elsewhere in
the same file gets this right; the split subset pools exactly what the file's own header says the
third bucket exists to prevent.
*Owner: oracle/premise workstream. **Revives when:** any variant-split figure is quoted — the current
ones are wrong by the count of refusals.*

### L-f. The sorted-multi-array guarantee has never been exercised by real data
Only one `multi` question was ever served (`overlays`; `text_roles` was dropped), and **all 22
answers are arrays of length 1**. Across the entire warehouse, **zero** array-valued answers have ≥2
elements. Sortedness, the no-duplicate rule and the set-equality joins that depend on them are
tested by unit tests and by nothing else. Values seen: `["none"]`×14, `["label_logo"]`×5,
`["watermark"]`×1 — `parental_advisory` and `barcode_or_price` never fired. So the round validates
the multi-select **mechanism** far less than its 160-answer size suggests. Write-time enforcement is
sound; the **analyzer performs no vocabulary check**, so a hand-appended row with a bogus value
passes analysis silently. Interacts with B19: `overlays`' 0.9542 singleton rate may retire the
multi-select before it is ever exercised.
*Owner: review-server + oracle/premise workstreams. **Revives when:** a round serves a multi-select
that real answers populate with two or more values.*

### L-g. `serverctl.sh`'s pidfile and logfile ignore `REVIEW_SERVER_PORT`
`PORT` is overridable; `PIDFILE`/`LOGFILE` are fixed. Starting a second instance on another port
overwrites the pidfile of the reviewer's 3010 server; a later default-port `stop` then kills the
*other* process, reports `stopped`, leaves the reviewer's server running and unmanaged, and
`restart` subsequently refuses ("already answers but is not ours"). A live hazard for exactly the
workflow an agent doing review-server work must use. **Fix: scope the run files by port.**
*Owner: review-server workstream. **Revives when:** any agent needs a second instance — which is
every adversarial review of this server.*

### L-h. The bcde round's SERVED wording differed from variant E, and this must sit on the round's record
The round served an extra per-question instruction line on all 8 questions — *"Answer this one
question only. Do not try to make your answers across questions tell one story."* — which appears
**zero** times in `group-bcde.v1.variant-e.json`. It was newly authored for the round and sits
directly beside the verbatim ANSWERING block, so **the reviewer received two anti-coherence
instructions and the model received one**. Two smaller divergences ride along: the opening paragraph
and a stale preamble fragment.

The round's own narrow claim **holds exactly** — 8/8 stems and 41/41 glosses byte-identical,
vocabularies identical in values *and order*, hotkeys `1..n` in that order, question order and
preamble both derived from E. But **"the served wording is variant E's" is not true of the whole
surface**, and the difference is in the one place most likely to move answers: instruction framing.
This is also a candidate explanation for L-b's contradiction rate, which makes it load-bearing
rather than pedantic.

**This must sit on the round's record before its labels are used in any comparison.**
*Owner: oracle/premise workstream. **Revives before** any use of `bcde-validation-1` labels — same
gate as L-b.*

### L-i. A review-UI page can crawl clean and be key-dead, and nothing checks that it is not
*Added 2026-08-03, from a live incident.* `verify-live` establishes that a module is **served**. It
does not and cannot establish that the module **runs**. Those are different properties and only the
second one is what the reviewer needs.

**The incident.** `review-ui/freetext.js` called `normalizeKey(event)` where every other page calls
`normalizeKey(event.key)`. `normalizeKey` opens with `digitFor(key)`, which returns `null` for a
non-string, so the function handed back the `KeyboardEvent` object unchanged and **every**
`key === "Enter"` / `"ArrowLeft"` / `"r"` comparison in the handler was false. The handler could not
fire at all. **The page loaded, rendered, crawled clean, and was completely unresponsive to the
keyboard — the reviewer was stuck on cover 1 with a fully working save path underneath it.** (The
autosave/blur path was untouched, so nothing was lost; 530 characters and 7 revisions survived on the
first cover.) A second defect rode along: `render()` focuses the textarea, so the in-field early
return made plain arrows unreachable and stepping became Escape-then-arrow. Fixed in commit `6ad95ec`.

**Why every existing check missed it.** All 16 tests around this feature drove the **server**. None
loaded `freetext.js` and pressed a key. The crawl gap is the same shape as **L-a** — there the crawler
checked the page and never the JSON the page loads; here it checks the module is delivered and never
that it executes — but the fix is not the same fix, which is why this is its own row.

**Proposed standing smoke check** (not built, and the proposal is the open part): for **every**
`review-ui` module, `openPage` it against a **seeded harness batch**, assert the page gets **past its
loading state**, and assert that its **primary key responds** — one keypress, one observable state
change. Two guards already landed as a down payment and neither generalises: an executing-page test
for `/freetext` (`tests/review-server-freetext.test.ts`) and a cross-page static guard that greps for
`normalizeKey(event)` (`tests/review-server-keymap.test.ts`). The static guard catches this exact
typo on any page and nothing else; the executing test covers one page of many. Suite went 377 → 385.

*Owner: review-server workstream. **Revives when:** any new review-UI page or interaction mode is
served to the reviewer — which is every round with a new answer shape. **Blast radius:** reviewer
bandwidth, the campaign's binding constraint. A key-dead page costs a whole round's scheduling slot
and it fails in the one way a green `verify-live` teaches everyone to disbelieve.*

---

## D. Standing hazards that are not "open items" but belong on the review's map

- **The GPU is single-owner.** A concurrent Metal job dies with
  `kIOGPUCommandBufferCallbackErrorTimeout` and leaves the process's Metal context **poisoned** —
  under an ordinary retry path a whole run marks itself failed-and-complete in seconds. Agents
  never start GPU work without an orchestrator slot. Measured, not theorised.
- **Stray NUL bytes in agent-written source.** Three separate files have carried literal NUL where
  a space belonged, typically inside template literals. Signature: `grep` calls a text file binary,
  or `Edit` cannot match text you can plainly see. Swept clean across all of `research/v3` on
  2026-08-03; the failure mode is not fixed, only currently absent.
- **The gold-30 is the hard tail by construction** — the 30 artworks are exactly those where the
  oracle and the accepted flag contradicted. Every rate computed on them is a rate on hard cases.
  An arm can win there and lose on the corpus.
- **The probe-gold round carries a recorded anchoring caveat** — the reviewer had browsed
  `/oracle-review`, which shows their own direct answers for those same 30 artworks, earlier the
  same day. Any agreement measured there is an **upper bound**.
- **Reviewer bandwidth is the binding constraint**, as it was throughout v2-3. Several items above
  are `reviewer`-owned and cheap individually (~3–15 min each); they are expensive to schedule.
- **The pipeline doc's own blocking question is still unanswered:** *"What decisions does the
  palette algorithm actually need these answers for?"* Until a paradigm exists, the question set is
  a placeholder shaped by hypotheses about what will matter. Phase 1 is what answers it.

---

## E. Two rules this ledger's own failures earned (2026-08-03)

The adversarial review found this file wrong in one direction almost every time: **it said things
were unbuilt that were built** (B16, B17, B18, and the SAM rows), and its own headline count was
wrong. Both failures have the same shape, and both have a one-line fix.

1. **A status claim about code another workstream owns must cite that workstream's README, not
   assert independently.** In *every* built-vs-unbuilt inversion the review found, the README was
   right and the ledger was behind it — because a README is maintained by the workstream that owns
   the code, while this ledger was compiled once, from outside, on one day. Check before writing a
   row that says someone else's code is unbuilt, and check again before trusting one.

2. **Any count quoted in a governing document either carries the timestamp it was measured at, or
   is replaced by the query that regenerates it.** "434 records" is not honest; "434 records as of
   2026-08-03T10:12Z" is honest and self-invalidating. `V3_PLAN.md`'s "434 records",
   `REVIEW_UI.md`'s "66 tags", this file's "35 items" and `PHASE_0_DECISIONS.md`'s "2,913 work
   rows" were all the same failure: **a number a document computed about an artifact that kept
   growing.** The conventions already require a *record* for anything later work may assume and a
   *ledger entry* for anything deliberately open; what had no rule was the third case — a summary
   sentence that was measured, was true, is cited, and silently expires.
