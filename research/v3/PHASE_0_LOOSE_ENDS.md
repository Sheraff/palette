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

**Counts:** 34 items — 8 **sharp** (something downstream is already leaning on them), 18
**standing** (parked with a clear trigger), 8 **latent** (harmless today, harmful under a specific
future move).

---

## A. Sharp — something already depends on these

### A1. The ladder's codec-control noise floor was never populated
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

### A4. Invariant 2's spatial-spread half is permanently reported `deferred`
- **What.** `src/contract/types.ts` marks it `TODO [v3 Phase 1]`, never a pass:
  "the blocking question is not code but provenance: a threshold here has to come from measurement
  or from the reviewer, and neither has happened." Wire-in point is a single
  `spatialSpreadValidator` assignment in `invariants.ts`.
- **Consequence.** "Source support" currently checks the population floor only. A color that is a
  genuine pixel of the input but occurs as scattered noise passes.
- **Owner.** contract workstream + **reviewer** (for the threshold). **Revives when:** Phase 1.

### A5. The SAM concept set was changed by an agent over a standing reviewer prerogative
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

### A6. `SCORE_THRESHOLD = 0.3` is `[UNCALIBRATED]`
- **What.** Deliberately low: §8.3 says recall is SAM's problem, and every row carries its score.
  "Raising this later is free; lowering it means re-running."
- **Owner.** **reviewer**, at the same round as A5. **Revives when:** masks are reviewed.
- **Blast radius.** Bounded by design — a stricter cut is a query, not a rerun. Listed as sharp
  only because it pairs with A5 and no reviewer round has been scheduled for either.

### A7. The symlink/realpath gap in the review server's path allowlist
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

### A8. The legacy fixtures' README still says the same-color bar is `[UNCALIBRATED]`
- **What.** `data/legacy/README.md` tells every consumer that "until it lands, no consumer of these
  fixtures can compute a match, only an exact-hex approximation of one" and to treat hit counts as
  provisional. **The bar has since been calibrated per region and frozen** (`PHASE_0_DECISIONS.md`
  §3, §8).
- **Consequence.** The known-worse gate's wiring instructions are stale in the direction of
  under-claiming — a reader would think the gate cannot be built yet.
- **Owner.** legacy workstream (path ownership — reported, not edited here).
  **Revives when:** immediately; it is a one-paragraph correction.

---

## B. Standing — parked with a clear trigger

### B1. The bulk-model decision (which VLM runs the corpus pass)
Challenger runs in progress and so far gold-30-only; the arms disagree in **opposite directions**
by variant and cross-arm agreement is 0.533, so the gold-30 cannot settle it. Next: eval-142 runs
plus **reviewer visual evaluations**. No bulk run starts first. *Owner: orchestrator → reviewer.*

### B2. InternVL3.5 is **blocked** — runtime, not choice
mlx-vlm 0.6.8 has no `internvl` model module; every published InternVL3.5 MLX conversion declares
`model_type=internvl`, and mlx-vlm's only InternVL implementation is **dense-only** while both
size-appropriate 3.5 checkpoints are **MoE**. Probed 2026-08-03. The revision is pinned anyway so a
later runtime upgrade starts from a known point. Fallback in place: Gemma 3 27B.
*Revives when: an mlx-vlm upgrade ships `internvl` MoE support.*

### B3. The oracle probe arm is parked, findings banked
Human half ran (43.3% vs a 63% noise floor — see `PHASE_0_DECISIONS.md` §6). **VLM half never ran**,
so its own three questions (are the probes easy, does the inconsistency rate earn its place, does
bundling contaminate) are unanswered. All nine prompt files are inert — no glob matches them.
*Revives when: an explicit orchestrator opt-in, and not before the bulk-model decision.*

### B4. The criterion arm (variants C, D) is drafted and unrun
It is the only thing that deconfounds variant B's **ordering** from its **wording** — the confound
the current instrument freeze rests on. ~50 min of GPU. *Owner: orchestrator.*

### B5. Group A has not earned corpus-wide status
At variant B's numbers `ground_type` agrees with a human on 53% of *contested* artworks and
discards 31% of its answers. The corpus-wide gate is specified in `oracle/premise/PREMISE_NEXT.md`
§4. *Revives when: the bulk-model decision lands and the gate is evaluated.*

### B6. Oracle groups B–F are unpiloted draft
Entirely `[UNCALIBRATED]`; group E–F are candidate tier and "survive only if the validation sample
shows both reliability **and** actual downstream use". Nothing has touched them.

### B7. The §A.5 `ground_type` vocabulary split — proposal, `HELD`, "do not implement"
Superseded by the probe arm, which generalises it. Kept for the record. Re-elicitation against a
new vocabulary costs ~3 minutes of reviewer time, which is the reason nothing should be shaped
around avoiding it.

### B8. `PREMISE_NEXT.md` §14 sign-off ledger has three unsigned items
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

### B13. The straddle rule is a default with a reason, not a finding
When a pair straddles two ruler regions the larger bar wins. *Revives when: a bracketing round is
ever run with deliberately straddling pairs.*

### B14. Where the contrast parameters act is deliberately undecided
"Winner-stage repair" presumes v2-3's shape. Deferred on purpose to become a **Phase 2 bake-off
criterion**: (a) parameters at defaults → byte-identical to the unparameterized algorithm;
(b) enabling a floor may change only artworks that actually violate it — zero collateral.

### B15. The gradient module's indistinct-fraction shape is open
Foreground-vs-stops is deliberately **not** in the invariants: along a ramp the quantity is a
fraction, not a pair contrast, and its shape (floor plus max-fraction) belongs to the gradient
module when that exists.

### B16. The palette composer / `endorsed-sample` flow is unbuilt
Its rules are pre-decided in `src/review-server/README.md` (an endorsement is immutable evidence).
*Note: a `composer.ts` has since appeared on the server side carrying three new `[UNCALIBRATED]`
constants, and the README's "not built" list has not been reconciled with it.*
*Revives when: Phase 2 needs endorsed samples.*

### B17. Review-server features specified but unbuilt
Post-release amendments (server returns 409; the warehouse machinery already exists); calibration
`mode: "absolute"`; **coverage-aware sequential stopping** for oracle validation — blocked on
another workstream's embeddings, mitigated by recording `stratum` on every row so the rule can be
applied retroactively; note-only records and tags; the completion watcher; multi-reviewer use,
auth, LAN exposure.

### B18. The tagging vocabulary is undrafted, and must be symmetric
To be drafted alongside the pathology census. Symmetry is the requirement — a vocabulary that can
only express complaints produces a corpus that can only measure complaints.

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

### C4. The DINOv2-vs-DINOv3 choice was never fully argued
`GALLERY_NOTES.md` closes with "v2-vs-v3 **pending** the tiebreaker + tail-behavior argument", and
the reviewer's own words are "I think the DINO models are better, but I wouldn't know which one of
the 2." dinov2 won on R@1 and mean rank; **dinov3-vitl16 has the better tail** (worst rank 17 vs
64). The tail argument was outvoted by the headline metric rather than answered. Mitigated: the
near-duplicate graph deliberately takes the **union** over three arms, so the leak-prevention path
does not depend on the choice.

### C5. The reviewer's gallery notes are not warehouse records
`GALLERY_NOTES.md` says they are "to be ported into the warehouse as tagged note records once the
tagging flow exists" (B18). Until then the canonical-embedding decision has an **empty `fundedBy`**
and `warehouse recheck` can never flag it. Same structural gap for the holdout redraw
authorisation, the legacy recency ruling, and the SAM prompt-set change.

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
