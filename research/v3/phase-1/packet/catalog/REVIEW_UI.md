<!-- Phase 1 author packet — provenance
     source: research/v3/REVIEW_UI.md
     commit: 71a1d62d51006dd8f353e8c0bc6e4434bdb0c4b2
     date:   2026-08-04
     This file is a verbatim copy of the source above, assembled for a Phase 1 author packet.
-->

# V3 Review UI & Warehouse

**Status:** working design, discussed 2026-08-02. Referenced from `V3_PLAN.md` (Phase 0
instruments).
**Prime directive:** this instrument is where all ground truth comes from. Its blind spots
become the campaign's blind spots (v2-3: the UI could not record a gradient objection; all 14
gradient notes asked for *more* gradient; three arms were misdirected).

---

## 1. Architecture — a standing server with a queue

- A **persistent local server** owns the review queue. The orchestrator pushes batches to it;
  the reviewer works through them whenever convenient. No per-batch serving/rebuilding.
- **Batches are materialized at push time** with code fingerprints (algorithm version,
  preprocessing version, git commit) on every side of every item. A verdict is always about
  the exact palettes shown (content-hashed) — never about "trunk" as a label. If trunk moves
  while a batch waits in the queue, adjudication sees it from the fingerprints; nothing is
  silently mislabeled.
- **Batch completion is an explicit reviewer action** — a "release batch" button, never an
  implicit last-item event. Until release, every item stays freely editable (revisit,
  re-grade, rewrite comments) with zero ceremony and no forced summary screen. Release
  appends the `batch-complete` record; that is the trigger.
- **Completion watching costs no agent context:** a background watcher
  (`src/review-server/watch-batch.ts`, a Node script run detached — outside the model's
  context; the `serverctl.sh` shell wrapper is a separate thing, for the server itself)
  waits for `batch-complete` and notifies the orchestrator once. No
  polling code or repeated status checks crowd the working context; between sessions, the
  next session reads the warehouse at start.
- **Storage: append-only JSONL. The agent-facing surface is a query CLI, not the file.**
  JSONL because at this volume it diffs, merges, and greps well; SQLite would add
  binary-in-git friction for query power we don't need. Token efficiency comes from the
  access pattern, not the format: agents never read the file wholesale — a small CLI
  (`warehouse status`, `warehouse query …`) returns filtered, aggregated results, and can
  build an ephemeral index internally if volume ever demands it. Record types:
  `verdict | note | endorsed-sample | veto | amendment | batch-complete | oracle-label`.
- **Post-release amendments are safe by construction:** an amendment is a new record pointing
  at the original verdict; the latest amendment wins at query time. Every downstream decision
  (adjudication, integration) records the verdict IDs that funded it, and a standing gate
  query flags any decision funded by a since-amended verdict for re-check. The orchestrator
  can therefore trigger immediately on release without racing the reviewer's second
  thoughts.

## 2. Verdict model

- **Pairwise A/B is the atomic comparative unit** (also for the Phase 2 bake-off — the batch
  builder does round-robin pair sampling across paradigms; the UI never changes).
- **Blinding guarantees exactly one thing, and it is narrower than v2-3 assumed.** Sides are
  shuffled per item by content hash under a per-batch salt, and the unblinding key is never
  served. What that closes is the **hash-reconstruction channel** — without the salt the served
  digest could be re-derived and the order recovered (measured at 53.2% before the salt landed).
  What it does **not** close is the **content channel**: the payload must serve each side's
  palette in full for the reviewer to judge it (`roles[].hex`, both collapse flags,
  `gradient.stops[]` with true positions, `fieldCss`), so whenever two arms differ
  *systematically* in any served field the arms are self-identifying and the shuffle is
  decoration. **Measured 2026-08-03:** a 24-item two-arm batch whose arms differed only in style
  (one always flat, one always a 2-stop gradient) was unblinded **24/24 from the served payload
  alone**, by the one-line rule "the side with a non-null `gradient` is arm-beta" — no hashing,
  no salt, no batch log (adversarial review, `reviews/phase-0-adversarial/review-server.md`
  CR-1). One narrow leak is now closed at the source: **stop positions are canonicalized to 6
  decimal places at push time**, so two code paths cannot betray their identity through float
  representation. The general case cannot be closed by the server. **Batch designers must ask,
  before treating blinding as a control, whether the arms are separable by any served field.**
  Phase 2's paradigm bake-off is exactly the shape that fails this test.
- **Both sides get a grade** — the v2-3 gap this fixes: "prefer A, A is strong" never said
  whether B was also strong. Per item: grade A, grade B, then preference (`A | B |
  no-preference`). "No preference" contributes no ordering constraint (unchanged).
  Consequence for the movement rule: "never move to an inferior palette" becomes **"never
  move to a lower-graded palette; a move between two strongs is a sidegrade — allowed, but it
  costs a preference and needs a reason."**
- **Grade scale** (reviewer's definitions, verbatim, 2026-08-02):
  - `strong` — "I'd be happy to get this as a result"
  - `acceptable` — "not ideal, but I understand how it got here; if we can't do better I
    won't be mad"
  - `weak` — "we must have missed something important"
  - `unacceptable` — "the algorithm is broken"
  A `strong` does **not** mean "best possible; everything else is trash" — several palettes
  can be strong for one artwork. Regrade agreement is ~88%, so equal grades ≠ interchangeable.
- **Confound flag:** "I'm choosing A only because B has an unrelated defect" — a checkbox +
  which-defect note; queryable re-run trigger after the defect is fixed.
- **Corrections and second thoughts:** before release, any item is freely editable (no summary
  screen — friction). After release, "amend previous batch" creates `amendment` records; see
  §1 for why this never races the orchestrator.

## 3. Presentation

- **Mock UI is the primary judging surface**: the artwork embedded onto the background
  **borderless**, surface/foreground/accent in realistic player roles. **Raw swatches
  alongside** (identity check), never alone.
- **Every color the reviewer sees is named via `colornames-oklab`** — in the UI, in agent
  reports, in warehouse notes. One shared color vocabulary for humans and agents.
- **Review chrome is strictly two colors: black and white** — black background, flat, no
  shadows, no gradients — except the mock UI and swatches. The mock UI itself contains **no
  shadows** either.
- **Gradient display mapping** — the background endpoint gets extra room or it loses its
  importance: `display_pos = reserve + published_pos × (1 − reserve)`, with
  `reserve = 35%` (2 stops) and `10%` (3+ stops). Reproduces the v2-3 reviewed tunings
  (35→100; 10/55/100) exactly; generalizes to 4 stops with no new constant. `[REVIEWED]`
  (v2-3, carried). Display-only: published positions stay the true fitted values. The full
  preview renderer (mapping included) is pinned as part of the output contract.
- No magnifier needed (the reviewer zooms natively) — but the underlying lesson stays as
  **agent practice**: magnify the artwork before calling anything a regression (v2-3: a
  "regression" gold turned out to be display text only visible magnified).

## 4. Reviewer input

- **Free text is the primary and only required channel.** A tagging agent reads each comment
  afterward and files predetermined queryable tags as *derived* records (re-derivable, never
  overwriting the raw text; raw text stays authoritative). The **symmetric-vocabulary rule**
  applies to the agent's tag set: for every expressible complaint, its opposite must exist
  (should-be-gradient / should-be-flat, missing-color / alien-color, …) — this closes the
  v2-3 instrument-bias gap structurally.
- **Palette composer**, kept from v2-3 and simplified: assemble a palette from the full
  extracted color set; must support flat / 2-stop / 3-stop; always preview-before-submit;
  always optional. Statistical weight: `endorsed-sample` — never a fitting target, never an
  auto-win. Primary uses: **reachability diagnosis** ("can the algorithm even produce this?"
  — how v2-3's candidacy walls were found: 5 of 19 endorsed accents reachable), destination
  adjudication (landing on an endorsement = win), and complaint interpretation. Many palettes
  can be valid; the reviewer can be wrong; both stay true.
- **Artwork veto**, note-only records with tags, and idle-time fresh-artwork rounds — kept
  verbatim from v2-3.
- **Two standing feedback channels on every round — the per-item note and the copyable item id**
  (added 2026-08-04, and they are kit-level defaults, not per-round options). The reviewer asked for
  *either*: *"the review UI should either — have an optional free text box on every item in a batch —
  have IDs that I can copy paste to you to give feedback about a specific item in a batch. i often
  want to give feedback about a specific thing and we currently have no way of doing that, which
  prevents accidental discovery of information."* Both shipped, in the kit shell
  (`review-ui/round-kit.js`), so a round type cannot ship without them.
  **The last clause is the justification and it is the reviewer's own:** an instrument that can only
  record the answer it was designed to ask for cannot discover anything it did not anticipate. `f`
  opens the box, Enter saves, Escape closes; empty notes are never recorded; a note is **never an
  answer** — it never counts toward `reviewed`, never moves a completion count, never blocks a
  release, and is accepted after release. Storage is a `note` record with the text **verbatim** and
  `tags: []`, because a tag on a raw note is the page pre-judging what the reviewer meant.
  Recorded as `d-2026-08-04-round-kit-note-and-item-id-are-the-standing-feedback-channels`. *One
  page is outside the kit and therefore has neither channel — `review-ui/dropped-colors.js`, ledger
  row **B37**.*
- **A conversational ruling outranks a recorded round answer** (added 2026-08-04). Where the two
  conflict, **the chat is canonical**: the round is an instrument for eliciting the reviewer's
  judgement, and when the reviewer states the judgement directly, the instrument's reading of it is
  not a second opinion. Three cases on one day established it — the toolbox adjudication settled in
  chat while its 42-item round sat unanswered, `endorsement-recheck-1` overridden after being
  answered, `dropped-colors-1` stopped mid-round and settled in chat.
  **The conflicting answers are annotated, never deleted and never retracted:** a dated `note`
  record goes against the affected item saying what superseded it and why, and the answer stays in
  the log and keeps counting wherever it counted. An agent retracting a reviewer's answer is a move
  nobody has authorised. **And the round still has to be explained** — in all three cases the chat
  did not merely outrank the round, it exposed something wrong with it. Recorded as
  `d-2026-08-04-chat-rulings-outrank-in-round-answers`.
- **No timing of the reviewer.** ("Humans are weak.") **Reinforced and widened 2026-08-04, after
  this rule was found to have been quietly broken:** answer timestamps mean **nothing** and are used
  for **nothing**. Reviewer, verbatim: *"breaks make times meaningless"* — the reviewer gets up, does
  something else and comes back, and no record distinguishes that from deliberation. This forecloses
  the analysis a Phase 0 review had already performed (a 2.91-second median inter-answer gap, used
  both as a plausibility check and as a fatigue hypothesis) **and** the proposed
  reviewer-budget planner that would have priced rounds in reviewer-minutes: **round sizes are not
  chosen from timing data.** The timestamps themselves stay — they order the log, drive recency and
  supersession, and `recheck` compares them against decision dates; what is forbidden is inferring
  anything about the *human* from the gaps between them. The existing citations are **annotated, not
  rewritten**. Recorded as `d-2026-08-04-answer-timestamps-are-not-evidence`.
- **A round's framing text states the answering CRITERION, not just the question** (added
  2026-08-04, and it is the more expensive of two lessons learned the same day). Two rounds have now
  been governed by a criterion the reviewer chose for themselves and disclosed only afterwards:
  `cascade-ground-truth-1`, where `none_discernible` turned out to mean *"the list does not contain
  the right word"*, and `pointing-ground-1`, where the reviewer answered *"could this be considered
  correct"* rather than *"is this correct"* — verbatim, disclosed after the batch completed. **Both
  disclosures were volunteered.** Neither instrument asked, and nothing in the served page could have
  revealed it. The cost is not a wrong answer; it is that **every rate becomes a ceiling of unknown
  height**, and a strictly-framed successor is then biased against itself so that a tie reads as an
  improvement. So: say which reading is wanted, in the round's own text, where the reviewer will see
  it while answering.
- **A forced choice must have somewhere to put "I can't tell"** (added 2026-08-04). Design rule 8 of
  the question set already says a slot must be able to record the answer; what two rounds added is
  the reviewer's own reason — *"answers for those cases are not reliable (even with human feedback)
  unless we add an escape answer choice"*. The escape is not a way of discarding hard items:
  **its share is a first-class result**, reported per stratum, because ambiguity is a property of
  the artwork. A stratum whose escape share exceeds half has no reliable rate and is reported as
  having none. Recorded as `d-2026-08-04-purity-rounds-need-escape-answer`; the counterpart risk —
  an escape used as a general refuge — is real and is why the share is reported rather than
  subtracted.

## 5. Calibration mode

Kept from v2-3: periodic absolute grading (not A/B) of never-reviewed artworks, with
re-inclusion of previously graded ones — the repeats measure drift and reviewer noise. Same
grade scale, same warehouse.

## 6. Oracle validation mode

The human-labeling pass that validates the VLM oracle (`ORACLE_QUESTION_SET.md`). This is a
**very intense** process for a human; the UI must be ruthlessly streamlined:

- **By-question passes, not by-item forms:** one question across many artworks in a row
  ("has text? y/n" × 40), then the next question. Matches the 5-second rule; minimizes
  context switching.
- **Keyboard-only**, auto-advance on answer. Enums bind digits `1`–`9` and `0` (`DIGIT_HOTKEYS`,
  ten slots; the live `ground_type` enum uses 1–6); `y`/`n`/`u` where a question is boolean or
  probe-shaped. **Undo is one keypress but not one key**: `u`, `Backspace` or `ArrowLeft`, and
  `u` is displaced to `Backspace` whenever a question binds `u` as an answer hotkey — the footer
  prints which is live. `r` releases the round.
- **An item is one (image, question) answer** when the round asks several questions of an image,
  and one image when it asks one. `reviewed` / `pending` are counted on that key, and a batch's
  declared `itemCount` must be stated in the same unit (`labelUnit`). A round that declares
  images-only while asking several questions per image reports progress its reviewer cannot
  reconcile.
- **Multi-select questions toggle and commit.** Some oracle questions take a *list* of values, not
  one. `overlays` is the only one served today; `text_roles` is drafted for the shape but
  deliberately omitted from the built round. They are the one shape that cannot auto-advance: the digit keys
  turn values on and off and Enter — or Space — records the set and moves on. Such a question binds
  digits and nothing else, so the commit key and undo stay unambiguous, and the answer is one record
  carrying a sorted array. The alternative, one yes/no pass per value, was rejected because it asks a
  different question from the one the model answered (`PREMISE_NEXT.md` §15.9).
- **Resumable anywhere**, designed for ten-minute chunks.
- **Sequential stopping per question, made coverage-aware by the embeddings — SPECIFIED, NOT
  BUILT.** `src/review-server/README.md` lists it first under "Not built" (blocked on the
  embeddings workstream); everything in this bullet is the design, not the server's behaviour.
  The mitigation is real and already in place: `stratum` is recorded on every `oracle-label`
  row, so the rule can be applied retroactively to rounds already run. The design: the validation
  sample is drawn as a stratified cover of SigLIP embedding space (per-cluster quotas /
  farthest-point spread), items are served in space-spanning order, and the stopping rule is
  evaluated **per stratum** — a question stops only when agreement is tight in *every*
  region, not merely overall. This prevents the failure where 30 straight agreements all come
  from one dense mode (say, photo covers) while a distant region (say, flat illustration)
  goes unvalidated. A disagreement anywhere triggers neighborhood expansion: more samples
  drawn near it. Budget concentrates on contested questions *and* contested regions.
- Records go to the warehouse as `oracle-label` with the same provenance columns as the
  oracle's own rows (`human_labels` table in the pipeline doc).

## 7. Batch metadata

Every batch declares what it is testing (`mechanism | arm | calibration | outlier-mine |
oracle-validation | bake-off`) and what funded it, so the warehouse can answer "what evidence
funded this decision" without archaeology.

## 7.1 Retiring a round

**Added 2026-08-04, because two rounds needed it on the same day.** A batch that is pushed and then
overtaken — answered in chat, or built on a measurement the reviewer rejected — must be able to say
so. The **retire-batch action** does that: **append-only, with the reason recorded**, exactly like
every other state change in the warehouse.

**An open batch nobody intends to finish is a lie the status output tells every time it runs.**
`warehouse status` reported `dropped-colors-1` as open with 9 pending, which reads as work in
progress awaiting the reviewer; it was over. Retirement is how a round says it is over without
pretending it was completed.

- **Retiring is not releasing, and it is not deleting.** Answers already given **stand as valid
  data** and keep funding whatever they fund. `dropped-colors-1`'s 11 answers fund the
  source-support demotion; the round is retired all the same
  (`d-2026-08-04-dropped-colors-1-retired-with-its-partial-answers-standing`).
- **No completion rate is ever quoted for a retired round.** Eleven of twenty is not a 55% response
  rate, it is a round that stopped.
- **A retired round's own recommendations are void where a later ruling contradicts them.**
  `toolbox-adjudication-1` carried the orchestrator's per-item recommendations and was never
  answered; it is deprecated and they are void
  (`d-2026-08-04-toolbox-adjudication-1-deprecated`).

## 8. Open items

- The 2-stop 35% / 3+-stop 10% display reserves are carried `[REVIEWED]` from v2-3; re-tune
  only if the reviewer objects once real v3 gradients render.
- ~~Server deployment details (port, LAN exposure, auth)~~ **Settled — the parenthetical was
  the decision.** The server binds `127.0.0.1` on `DEFAULT_PORT = 3010` (`server.ts`;
  `serverctl.sh` honours `REVIEW_SERVER_PORT`), localhost-only, no auth. The standing policy is
  in `src/review-server/README.md`. Worth knowing where it is written down, because that
  binding is what keeps loose end A7 (symlink/realpath) dormant — A7's revival condition is
  "before the server is ever exposed beyond localhost".
- **Push-time arm-separability diagnostic — open, and never a refusal.** Per §2's measured
  content channel: at push time, report whether the batch's arms are distinguishable by any
  served field (gradient presence, stop count, collapse flags, `fieldCss` geometry token). It
  prints and records; it does not block, because a legitimate bake-off may deliberately compare
  a flat paradigm against a gradient one and the right response is to know it, not to be
  stopped. Owner: review-server workstream. *Revives when: the first real two-arm batch is
  designed — Phase 2's bake-off.*
- ~~The tagging agent's tag vocabulary~~ **Built 2026-08-03, at v2.1.0**: 103 tags across 12
  axes — 96 tags in 48 opposed judgment pairs, plus 7 descriptive tags on `instrument-behavior`
  that have **no opposite by design**. The vocabulary is deliberately *not* uniformly symmetric:
  symmetry is required of judgments, and a scoping rule (recorded as
  `d-2026-08-03-tagging-symmetry-scoping`) says where it applies. `lintVocabulary` /
  `loadVocabulary` enforce it on read. See `data/tagging/TAGS.md` (generated) and
  `src/tagging/TAGGING_PROTOCOL.md` §2, which are the authorities for these counts. Tags are
  filed post-hoc by the export/import tooling, so the review server needs no tagging UI.
