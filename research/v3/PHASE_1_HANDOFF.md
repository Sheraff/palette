# Phase 1 handoff — for the next orchestrator

**Written 2026-08-04 by the Phase 0 orchestrator, at the reviewer's direction: "i think we're done
with phase 0 work."** That sentence is the phase gate. Everything below is what you need to run
Phase 1: what exists, what is owed, and — most importantly — how this project works, because most
of the failure modes you will face were already hit once and have rules earned from them.

## 1. Roles

- **You (Fable)** are the architect/orchestrator. You do not implement. Opus subagents do ALL
  file-editing work, in parallel, with disjoint path ownership. Your exceptions: genuine
  one-liners where writing the spec costs more than the edit, memory files, and documents only
  your conversation context can author (like this one).
- **Flo** is the sole reviewer and the decision authority. Flo outranks every rule, every
  invariant, every number. Their conversational rulings are canonical — over round answers, over
  documents, over your recommendations. Address them in plain language: define every project
  term in the same breath you use it; never ask them to decide what a measurement can decide;
  anything they need to look at must already be live and verified in the review server before
  you mention it.
- **Persistent memory** lives at the project memory directory (MEMORY.md is your index). Read it
  first. The rules there are Flo's own corrections; they are not suggestions.

## 2. What Phase 1 is

Per `V3_PLAN.md`: **Phase 1 produces divergent palette-algorithm design PROPOSALS — no code.**
Phase 2 is the bake-off. Your job:

1. Commission several proposal arms (different Opus authors, different framings). Each author
   receives exactly `PHASE_1_AUTHOR_BRIEF.md` — the goals, the output contract, corpus facts,
   and the tool catalog. **They do not receive our conclusions, failure analyses, or the field
   guide** (anti-anchoring rule, decision-recorded). One arm is blind even to the tool catalog.
   Each proposal states what intermediate work it could expose (weak form — a template line).
2. While authors write (human-authoring time is your slack), build the deferred tooling as its
   triggers fire — see §5.
3. Keep Flo's queue small, frequent, and verified. Their bandwidth is the binding constraint.

The bake-off must not favor the paradigm we happened to tool for: region/mask thinking is
available but never required; global-statistics approaches are equally admissible.

## 3. The constraint sheet (canonical pointers, not paraphrase)

`PHASE_1_AUTHOR_BRIEF.md` §3.1 is the constraint sheet, amended through 2026-08-04. The
load-bearing ones, as the reviewer phrased them:

- **"The algorithm never reads a table."** Runtime is cold, per-file; precomputed datasets are
  for the agents (test, evaluate, ideate, find coverage holes) — development tools only.
- **No v2-3 code, ever.** Red-alert rule. The rewrite exists because v2-3 failed.
- **No models at runtime**, except SAM under four conjunctive conditions
  (`PHASE_0_DECISIONS.md` §6.1): determinism is measured-and-satisfied for the pinned stack;
  cold cost ~6.2 s/call "counts as slow" — the reviewer's bar is "very good reasons".
- **Output**: background/surface/foreground/accent; when the field is a gradient, the first stop
  IS the background and the last stop IS the surface; 2–3 stops (4 negotiable, guide-stop
  semantics quoted in the brief); sanctioned collapses (accent→fg, surface→bg) and the strictly
  bounded pure-white/black two-color escape are typed contract machinery.
- **Metric follows the pair**: fg/accent vs field = APCA contrast over the whole rendered ramp
  (OKLab-interpolated, per the reviewer); sibling pairs = color distance. Existence of a
  published color in the artwork is hard; population share is report-only ("belongs" is
  Flo-only judgment — measured: no pixel feature predicts it).
- **Perception model** (`src/contract/PERCEPTION_VERDICT.md`): identity tolerance is
  direction-anisotropic (~2.9× lightness vs chroma/hue, Holm-clean); the two criteria
  (identity vs accent-function) are anisotropic in OPPOSITE directions and must never share a
  number; space stays OKLab, direction-aware shape is provisional pending Flo's sign-off;
  `ACCENT_FUNCTIONAL_DISTANCE` remains `[UNCALIBRATED]` after two honest refusals.
- 97%-class quality claims from v2-3 are withdrawn ("fake" — reviewer). The quality criterion
  is Flo's verdicts; the noise context is their measured 83–88% self-consistency.

## 4. The toolbox (what exists, one line each)

- **Dev loop** `src/devloop/` — run a candidate over a sample set, view in the real mock, diff
  two runs sorted by change magnitude; content-addressed cache keyed on code+input (137 ms
  cold / 98 ms cached demo). THE inner loop; no agents, no ceremony.
- **Robustness harness** `src/robustness/` — 200 rendition pairs + 100×4 perturbations, one
  command, reviewed-vs-unseen overfit ratio. Run it early and often.
- **Auto-adjudication** `src/adjudication/` — scores a candidate run against 554 legacy
  verdicts: endorsement match = win, differ = NO signal, known-bad match = loss; conflicts
  surfaced never averaged; old regime informs, never gates. (Two endorsements are retired by
  ruling — see the sidecar loose end A19.)
- **Stats module** `src/stats/` — the corrected statistics, refusals as types. Analyses use it.
- **Contract** `src/contract/` — invariants with scorecard (report) mode for prototypes; hard
  mode for the bake-off. Constants carry provenance tags; a tripwire test blocks unaudited
  constants; the honesty scanner (`src/honesty/`) reports per-area (all informational in dev).
- **Review server + round kit** `src/review-server/`, `review-ui/round-kit.js` — ALL reviewer
  rounds; no new page outside the kit (shrink-only grandfather list); per-item `f` notes and
  copyable opaque item refs are standard; retire-batch exists for rounds that stop mattering.
- **Oracle stack (dev-time)** `oracle/` — VLM labels (all-nouns elicitation closes the
  single-noun gap; 8-cap binds on half the corpus), SAM v2.2 (per-group cuts, person-exempt
  guard, provisional CJK cut), embeddings/coverage/holdout. Labels are census/strata/priors —
  never per-item truth. Ground-structure is a PIXEL question (vocabulary route retired;
  residual = enriched prior at measured 24–56% purity; pointing stood down; depth rejected).

## 5. Owed / pending at handoff

- **Flo sign-offs outstanding**: the perception package (provisional direction-aware shape +
  defer-the-confirming-round recommendation); the force-push (origin/PR#5 diverged after the
  history re-sign — `--force-with-lease` owed or an explicit decision not to).
- **Report-only challengers to wire** (cheap, high-value): the direction-aware identity bar and
  ICtCp-global beside the frozen OKLab bars — count disagreements on every real palette; the
  counter decides whether the confirming round ever runs.
- **Excursion bar**: now its own `[UNCALIBRATED]` question — needs a ramp-stimulus round design
  (displaced interior stops, "does this ramp introduce a color that isn't the artwork's?").
  The 2.5× multiplier is known-arbitrary.
- **Deferred tools with named triggers** (chat-adjudication-map items 22–26, 28): smoothness
  profiler (first prototype exists), failure tracker (version history exists), corpus-drift
  (collection changes), instrument pricing (proposals arrive), second-layout mock check
  (immediately before the bake-off, once), warehouse deep-check (idle time).
- **Schema v2** (`oracle/premise/SCHEMA_V2_PROPOSAL.md`): applied rulings baked in; the carrier
  question is measured-broken (models read it as "name the regions") and needs redesign before
  any 200-cover pilot; prompt files load-fixed but DRAFT — NOT SIGNED OFF.
- **Housekeeping**: `dropped-colors.js` owes a kit migration; `data/decisions/decisions.json`
  awaits the perception-4 proposed records + a formal phase-0-closed record quoting the
  reviewer; loose-ends header counts should be generated, not hand-typed (three hand-recount
  errors on record); `gpg.ssh.allowedSignersFile` unset means `%G?` shows N for signed commits
  — check `gpgsig` headers directly.
- **Fresh shards**: `15/` (348 artworks, clean, mapped) is reserved evaluation material; the
  import is a procedure not a command (A11 open — runbook owed).

## 6. How we work — rules earned by failures (do not relearn these)

1. **Signed commits, explicit pathspec, always.** Bare `git commit` swept co-workers' staged
   files three times. Vault locking blocks signing: agents stop and report, never commit
   unsigned (fully-signed history is a reviewer ruling; one surgery was needed to restore it).
2. **Pre-register before data; bars never move after seeing data.** This saved us from
   overselling at least three times (proxy purity 82% vs human 24% is the canonical case).
3. **Verify-live + live-payload key smoke + executing-page test before any URL reaches Flo.**
   Pages shipped key-dead twice and content-invisible once; every guard exists because of a
   specific incident. The kit makes the bug classes structurally impossible — use it.
4. **Append-only ledgers; supersede, never edit; conflicts surfaced, never averaged.** Records
   of decisions cite warehouse evidence (`fundedBy`); `recheck` legitimately shows 2 standing
   flags — do not "fix" them.
5. **Escape answers on every round; timestamps mean nothing; wording is measured, not asked.**
   Forced choices without escapes produced three separate crises. Flo takes breaks — durations
   are noise by ruling.
6. **GPU single-owner**: granted slot = occupied until the holder reports done. Metal poisons
   on concurrency. Watch for quiet agent stalls (two died mid-GPU-run silently; check pgrep +
   output file mtimes, then recover their on-disk work — both recoveries succeeded).
7. **NUL bytes**: the escape sequence arrives stripped as raw NUL in copied text; grep here is
   ugrep and silently fails on NULs — sweep with Python. Repair with the six-char escape,
   never a space (hash-bearing separators).
8. **Correction-of-record culture**: mistakes are stated to Flo with old vs new, never
   smoothed. Agents that caught their own errors (and mine) were the campaign's best moments;
   report them prominently.
9. **No completion narratives.** Lead with open-item inventories and triage. Flo tracks the
   campaign by what is still open.
10. **Away-time autonomy**: when Flo grants it, execute the WHOLE backlog including buildable
    rounds — queue reviews in the server so everything is waiting on return. Small exploratory
    work outranks corpus runs; corpus runs need high confidence and their standing rule.
11. **Agent briefs**: state owned paths, forbidden paths, the no-commit/commit rules in force,
    and require final messages to be data (tables, hashes, counts), not prose. Resumed agents
    (SendMessage) keep context; transcripts age out — respawn with full pointers then.
12. **Heavy process belongs to instrument/contract changes only.** The dev loop is the fast
    lane; never let ceremony into the iteration cycle. Flo has flagged overhead once already.

## 7. Key documents

`V3_PLAN.md` · `PHASE_0_DECISIONS.md` · `PHASE_1_AUTHOR_BRIEF.md` (+§3.1 constraint sheet) ·
`PHASE_0_LOOSE_ENDS.md` (the open-item map; absence of a row proves nothing) ·
`data/decisions/decisions.json` (+README) · `CONVENTIONS.md` · `REVIEW_UI.md` ·
`reviews/toolbox-review/chat-adjudication-map.md` (chat rulings beat everything) ·
`src/contract/PERCEPTION_VERDICT.md` · `reviews/phase-0-adversarial/` (the fleet's findings —
what an honest audit of this codebase looks like; run one again when Phase 1's findings dry up).

**The single deepest lesson of Phase 0**: every number was re-derived exactly by independent
adversarial code — and the failures were all in enforcement, provenance, claim-scoping and
doc-sync around correct numbers. Guard the *claims*, not just the arithmetic.
