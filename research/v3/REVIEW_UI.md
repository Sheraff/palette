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
- **No timing of the reviewer.** ("Humans are weak.")

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
