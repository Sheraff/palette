# Proposed ledger updates — wave-1 fix agents + reviewer rulings (2026-08-03)

Compiled by the orchestrator from the six wave-1 fix agents' final reports and the reviewer's
rulings of 2026-08-03. This is the docs-sync agent's work order. Each item names its source.
Nothing here has been applied to the shared ledgers yet.

## 0. Reviewer rulings (verbatim intent, recorded this evening — these are SIGNED, not proposals)

- **R-1 Holdout purpose.** "Every image that comes from `music-artworks/` I have seen multiple
  times before. We cannot claim I have never seen them (and we don't need to). Images from the
  hex folders those I probably haven't seen (unless shown in a review) *and* I can supply many
  more folders from the hex source. So we shouldn't worry too much about the holdouts."
  → Decision record: the holdout's claim is ALGORITHM/TUNING leakage prevention only, never
  reviewer-naive eyes; music-artworks holdout artworks are assumed reviewer-familiar; genuinely
  fresh-eyes evaluation routes through fresh hex-shard import at claim time (mechanism must be
  exercised once — existing loose end A11). Consequence: the embeddings agent's proposed
  "28.3% of the holdout has been seen / not yet resolved" HOLDOUT.md paragraph should be
  recast as a disclosure of fact, resolved by this ruling — not an open problem. The gallery
  exclude-by-default stays as hygiene; C-new-2 (3 held-out pinned query covers) stays as a
  minor embeddings task.
- **R-2 Area guard scope.** Reviewer: "since we're processing artworks, it wouldn't be too
  surprising to have 90% of the image be 'a face' or 'a car'." → The guard's untested `person`
  exposure (SAM agent's A6-reopen text) is confirmed as the live concern. Direction: propose
  per-concept-group scoping (guard mark_like/text_like; exempt person_like and future dynamic
  subject nouns), to be calibrated in a mask round 3 that must show the reviewer big-area
  person masks. A6 stays open until then.
- **R-3 Background strategy.** Reviewer direction: stop trying to make VLMs answer background
  questions; retry "everything but the masks" residual isolation, now with (a) calibrated cuts
  (round 2's residual panels were judged at the raw 0.3 union — SAM finding 4), (b) VLM→SAM
  dynamic prompting (measured 19/21, never built — unrealized-ideas #1), (c) per-group
  thresholds. If residual isolates background cleanly, background structure becomes a pixel
  computation and the group-A corpus-wide question is mooted. Record as the successor plan to
  the failed §4 gate (fits the gate's own escalation branch). CJK contamination (A12) and
  "location prior, never color evidence" stay in force until a purity round says otherwise.

## 1. From the contract agent

1. `PHASE_0_DECISIONS.md:84` §3 — "156 fitted answers" → **152 unique answers, 130 fitted
   points (120 same-colour + 10 accent), 140 same-colour items answered**.
2. `PHASE_0_DECISIONS.md:95` §3 — drop "(CI 0.052–0.106)"; quote the separation band
   **0.06300–0.08796** instead (the CI is a ridge artifact; threshold itself stands).
3. `PHASE_0_DECISIONS.md:65-72` §2 — note stop-scope of `minTextContrast` enforced as of
   2026-08-03 (code `I4.stop-below-contrast-floor`).
4. **Reviewer queue item:** re-decide the straddle rule — its only measured justification is
   withdrawn as unreproducible; independent replication favours `midpoint`; `Math.max` held on
   the safety argument alone. Update `PHASE_0_LOOSE_ENDS.md` B13.
5. **Reviewer queue item:** does `minAccentContrast` extend to published stops? Currently no,
   pinned by test.
6. `PHASE_0_LOOSE_ENDS.md` B15 — narrow to the ramp *interior* (stops now enforced).
7. `PHASE_0_LOOSE_ENDS.md` A3 — when the corpus epsilon measurement lands,
   `HAND_WRITTEN_EPSILON_CONTRAST` + the six bracket fixtures must be re-derived (they will
   fail loudly first, by design).
8. `decisions.json` — record for the I4 stop clause (empty fundedBy; artifacts: §2, contract
   review finding 2).
9. Cross-path note: `analyze-bracketing.ts` should suppress `confidenceInterval` on separated
   fits; `*-analysis.json` files should carry a warehouse input-count/hash header.

## 2. From the warehouse agent

Decision records to append (all empty fundedBy):
1. `d-2026-08-03-oracle-round-item-unit` (instrument-design) — an oracle round's item is one
   (image, question) answer when the round asks several questions; one image when one.
   `reviewed`/`pending` counted on that key.
2. `d-2026-08-03-amendment-allowlist-at-read` (instrument-design) — AMENDABLE_FIELDS enforced
   at query time as well as append time; refused patches dropped and reported. Identity /
   provenance / palette hashes unrewritable by anything that reaches the file.
3. `d-2026-08-03-recheck-covers-supersession-and-retraction` (process) — the funding gate flags
   amended, retracted, superseded, and missing evidence. `recheck` legitimately reports
   `flagged=2` today; not to be cleared by editing fundedBy.
4. `d-2026-08-03-demo-fixtures-are-not-ground-truth` (corpus-policy) — demo-batch-0001 /
   demo-calibration-0001 are fixtures, excluded from headline counts by fingerprint prefix,
   never deleted. Any analysis selecting verdicts must exclude them; v3 currently has ZERO
   reviewer verdicts.

Loose ends: F5 stale fundedByArtifacts.sha256 (2 of 9; no tool recomputes; owner housekeeping);
batch itemCount conventions coexist (mitigated by labelUnit; revives if a batch declares
images-only while asking several questions); bracketing item ids not artwork-derived
(`--item` cannot address `p1-*`/`r2-*` from the warehouse alone).
Docs: REVIEW_UI §6 should state the item-unit rule. Correction of record: the demo verdict
split is 4+4 (not 5+3 as the fleet report said); 10 demo records total.

## 3. From the premise agent

1. `ORACLE_QUESTION_SET.md:718-721` design rule 6 — retag to `[MEASURED, one comparison; the
   pre-registered replication FAILED — premise-run-cd]`; delete the elapsed "Until then"
   clause; add: holding B's order fixed does not reproduce B's result, so order is not
   sufficient and the A→B difference cannot be attributed to order on available evidence.
   Cite `oracle/premise/CD_RESULT.md`.
2. `PHASE_0_DECISIONS.md:329` + the question-set freeze record — replace "has not been run"
   with the run and its adverse outcome; amendment record on the freeze (freeze itself stands;
   one cited design rule now has a failed replication).
3. `decisions.json` — §4 gate outcome record: unmapped criterion MET (0% under C and D);
   exact-match criterion NOT met by any variant (best 16/30 vs required 22/30) → the gate's
   own branch: escalate the §A.5 vocabulary split as `group-a.v3`. NOTE: per reviewer ruling
   R-3 above, the actual successor is the residual-isolation route; record both (the gate
   branch as what the pre-registration says, R-3 as the chosen direction).
4. `decisions.json` — delete `confidence` from the next schema (pre-registered success >10%
   non-high; observed 1.4%; second run in a row).
5. `PHASE_0_LOOSE_ENDS.md` B4 — CLOSE (criterion arm run; write-up at CD_RESULT.md).
6. `PHASE_0_LOOSE_ENDS.md` B5 — keep open, amend: unmapped half satisfied; exact-match half
   worse; new revival condition = group-a.v3 / R-3 residual route.
7. New loose end — BCDE pilot's two failing bars + one met §15.8 wrongness condition need an
   owner: `15.6-2b.text_roles` (presence-rate on gate-open subset), `has_signature_color`
   (modal 0.8592), `overlays` singleton 0.9542 → plain enum in v2 unless reviewer overrides.
8. New loose end — `SINGLETON_NEAR_ONE = 0.90` is post-hoc; §15.8 should carry a pre-registered
   number before the next pilot.
9. Follow-up in premise path (from SAM agent, landed after premise finished): analyze_bcde.py
   should use `config.calibrated_threshold_for(concept)` (text_like 0.697295) + the area guard
   via `config.passes_calibrated_cut()`, and step-lock `SAM_TEXT_LIKE_CONCEPTS` to
   `CONCEPT_GROUPS["text_like"]`.

## 4. From the SAM agent

1. `PHASE_0_LOOSE_ENDS.md` A6 — REOPEN with the agent's drafted text (circularity; the
   `8b4f2aadf3b1:sticker:0` counterexample; guard now in place at zero in-sample TP cost;
   revives when the guard's corpus exposure on big-area `person` masks is reviewer-tested —
   see reviewer ruling R-2, which confirms and extends this with per-group scoping).
2. `decisions.json` — `d-2026-08-03-sam-calibrated-score-threshold` (fundedBy: the 60
   sam-mask-quality-1 oracle-label ids; artifacts mask-quality-analysis.json / sample /
   MASK_REVIEW_NOTES). Cut 0.578 + area guard 0.5 via `passes_calibrated_cut()`; sweep
   optimum 0.577937 recorded; stored constant kept deliberately (all artifacts computed at
   it); population-weighted alternative 0.643816.
3. `decisions.json` — `d-2026-08-03-sam-per-group-score-thresholds` (supersedes the record
   above if it lands first): `{"text_like": 0.697295}`, fallback pooled; reverses "groups did
   not separate" (an artifact of the every() quantifier); text_like at own cut precision
   1.000 / recall 0.4783; overall J 0.5140→0.5602. This is A12's category-aware mechanism;
   moves text_like UP so revives no CJK mask by itself.
4. Cross-path premise item — see §3 item 9 above.
5. NOTES addenda already applied in the SAM agent's own paths (MASK_REVIEW, SAM_DESIGN,
   PROBE4, VOCAB, PROBE5) — docs agent need not touch, listed for the record.

## 5. From the embeddings agent

1. `decisions.json` — append the superseding rationale record
   `d-2026-08-03-embedding-canonical-model-rationale` (supersedes
   `d-2026-08-02-embedding-canonical-model`). Full validated JSON was left at
   `/tmp/embfix/proposed-decision.json`; if absent, reconstruct from
   `reviews/phase-0-adversarial/embeddings-corpus.md` + the agent's key content: choice
   unchanged (dinov2-vitl14 @224); grounds restated — (1) PE-Core eliminated by the
   reviewer's semantic-leakage gallery observation (the ONLY evidence separating the top two;
   if withdrawn, decision must be REOPENED, not re-derived); (2) among remaining arms the
   bake-off separates decisively (vs dinov3-vitl16 McNemar p=1.351e-22; vs pe-core p=0.816 —
   NOT separated, never to be cited as though it were). fundingCaveats: no warehouse records
   fund it; gallery observations conversational, unportable to recheck; the browse rendered
   117 held-out artworks + 3 held-out pinned query covers (johns, krafty, muse) — per
   reviewer ruling R-1 this is now a disclosure, not a defect. Artifacts: GALLERY_NOTES.md
   (sha 28940918d3…), bakeoff.json (sha ef4cbf9318…), bakeoff-strata.json (sha 8af09537a2…).
2. HOLDOUT.md generator (`src/holdout/freeze-holdout.ts` renderMarkdown) — add the gallery-
   browse disclosure section, RECAST per ruling R-1: measured fact + hygiene fixes, resolved
   by the holdout-purpose decision (no "28.3% seen" open problem framing).
3. `PHASE_0_LOOSE_ENDS.md`: C-new-2 (3 held-out pinned query covers; fix = choose 3
   working-set replacements); C-new-3 (census holdout block superseded by sidecar
   near-dup-census.holdout-v2.json; anything reading holdout_crossing or pairs[].side must
   read the sidecar; closes on next census regeneration); C4 amendment (dinov2-vs-dinov3 IS
   settled on R@1 p=1.4e-22; the unseparated pair is dinov2-vs-pe-core, separated only by the
   reviewer's eye; restate the tail-vs-headline trade as the open part). C-new-1 (exposure
   undecided) is RESOLVED by ruling R-1 — record as such, do not add as open.

## 6. From the review-server agent

1. `REVIEW_UI.md` §2 — replace the blinding sentence with the agent's drafted honest text
   (salt closes hash reconstruction; content-level arm identity is NOT hidden — measured
   24/24 on style-separable arms; stop positions canonicalized to 6 dp; batch designers must
   ask whether arms are separable by a served field before treating blinding as a control).
2. `REVIEW_UI.md` §8 — new open item: push-time arm-separability diagnostic (never a refusal).
3. `REVIEW_UI.md` §6 — the warehouse item-unit rule (one line, per §2 above).
4. `decisions.json` — seven records (all empty fundedBy): blinding-guarantees-exactly-one-
   thing; gradient-stop-canonical-form (6 dp, push time); corpus-size-dependent-diagnostics-
   never-golden-compared; watch-batch-any-batch-ignores-history; oracle-label-supersession-
   persisted; reviewer-answers-held-to-model-ceiling (carries the adverse 45%-vs-10% result);
   pilot-overlap-joins-verified-against-bytes.
5. `PHASE_0_LOOSE_ENDS.md` new entries L-a..L-h as drafted by the agent, most importantly:
   **L-b — the bcde round's 45% contradiction rate has no reading; NOTHING may be graded
   against these rows until a reading is on the record** (revives before any VLM comparison
   against bcde-validation-1) — note the reconciliation labeling round now being built
   addresses this; and **L-h — the round's served wording differed from variant E** (anti-
   coherence instruction, opening paragraph, stale preamble) — must sit on the round's record
   before its labels are used.

## 7. Docs-drift findings

`reviews/phase-0-adversarial/docs-drift.md` — all 47, the docs agent's primary spec. Where a
drift finding and a fix-agent proposal touch the same line, the fix-agent proposal (which
post-dates the drift snapshot) wins. Remember the drift agent's own rule suggestion: status
claims about another workstream's code must cite that workstream's README.

## 8. Corrections of record (fold into SUMMARY.md reconciliation notes if not already there)

- Demo verdict split is 4+4, not 5+3 (warehouse agent).
- The gate-contradiction rate is 45% (9/20 artworks basis recomputed by the server agent's
  fixed analyzer), superseding the fleet report's 40%.
- The as-registered BCDE tally is 36 bars: 34 pass / 2 FAIL (text_roles flipped by the
  gate-dilution fix), superseding the auditor's provisional 35/1.
