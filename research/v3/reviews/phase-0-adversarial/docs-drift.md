# Phase 0 adversarial review — doc-vs-reality drift

**Arm:** docs-drift. **Date:** 2026-08-03. **Scope:** every statement in the Phase 0 governing
documents that is no longer true of the code and data on disk.

**Method.** Every provenance-tagged claim was spot-checked against its artifact; every "X is at Y"
pointer was resolved; every instrument-state statement was checked against the instrument's current
code; `V3_PLAN.md`'s status table was re-derived row by row; and `PHASE_0_LOOSE_ENDS.md` was audited
as a document rather than used as a scope limit.

**No file outside this one was modified.** Nothing here is a fix; every item is a report to the
owning workstream. No GPU work was performed; the SAM concept-set hashes were recomputed with the
pure-stdlib `concept_set_hash()` and no model was loaded.

---

## 0. Headline

The docs do not drift randomly. They drift in one direction, and there is one exception that matters
more than all the rest.

**The direction: systematic understatement.** Phase 0's last day closed a lot of items and finished
a lot of instruments, and the summarising documents were largely written *before* that day finished.
The result is that **three completed model runs, five built server features, one ratified concept
set, one calibrated threshold and one shipped tag vocabulary are all documented as not-done.** A
reader who trusts the docs will re-run finished GPU work and treat ratified instruments as
unratified.

**The exception, and the most serious finding in this report:** the criterion arm (variants C/D) —
the one experiment whose entire purpose is to deconfound the ordering effect that the frozen
instrument rests on — **has been run, and its results contradict the expectation that motivated the
freeze, and no document reports this.** Every doc still says it is unrun. See §1.1. That is not
understatement; that is a measured result sitting unread underneath a live decision.

Second most serious: `data/sam/model-manifest.json`, the file that anchors the identity of every SAM
run, **still pins a concept set two generations old** (§1.2).

Third: the decision ledger itself — the one artifact designed to be machine-recheckable — carries
**three caveats that are now false**, on a record with an empty `fundedBy`, so no machine can catch
them (§1.3).

Fourth: a constant whose measurement was **refuted and replaced** is still quoted at its refuted
value, under its refuted provenance, in six places — including eight lines below its own definition
(§1.9).

Counts: **9 critical, 20 major, 18 minor** — 47 findings, plus a cross-doc contradiction index (§4)
and a verified-clean list (§5) so later reviewers do not re-spend the effort.

**The good news, stated up front because it is load-bearing.** The *measured* core of Phase 0 is
sound. Every frozen same-color-bar digit matches `src/contract/constants.ts` exactly; the entire §7
resolution-floor table matches its analysis; every calibration-consequence number matches; the
SAM calibration reproduces from raw judgments; all 212 `fundedBy` ids on the question-set freeze
resolve to genuine warehouse records; and the A1, A10, A12 and B8 ledger closures are accurate to the
digit. The drift is concentrated in **status prose and expiring counts**, not in the numbers the
campaign will actually reason with. Two apparent contradictions turned out to be real and correct on
inspection (§5).

---

## 1. Critical

### 1.1 The criterion arm ran, its result is adverse, and every document still says it is unrun.

CONFIRMED. This is the finding to action first.

**What the docs say.** `PHASE_0_DECISIONS.md`:329 — "The criterion arm (variants C, D) was drafted
to deconfound it and has **not been run**." `PHASE_0_LOOSE_ENDS.md`:229–231 (B4) — "The criterion arm
(variants C, D) is drafted and unrun … ~50 min of GPU." `PREMISE_NEXT.md`:3–4 — "both **model** arms
are still drafted and unrun, and nothing in `common.py` has changed"; :10 — "Two model arms are
drafted and neither has been run"; :629–634 — "approved and QUEUED — waiting on a GPU slot".
`ORACLE_QUESTION_SET.md`:718–721 — design rule 6 is tagged `[MEASURED, one comparison,
**wording-confounded**]`, and: "Variants C and D are two further independent wordings that both keep
B's order; **if they land near B, ordering carried it**, and rule 6 is confirmed rather than merely
consistent with the data. **Until then** rule 6 is …".

**What is on disk.** `data/oracle-premise/premise-run-cd.jsonl` — 299 rows, variants C and D,
`schema_version: group-a.v2`, 142 images, all ok — plus `premise-run-cd.agreement.json`. `common.py`
also changed: it now carries a `PROMPT_SETS` registry (:120–131) whose own comment notes it replaced
the in-place edit the doc proposes.

**Why it is critical rather than merely stale.** The arm's readouts are computable, computed, and
**not near B**:

| readout | A-vs-B (frozen instrument) | C-vs-D (the deconfounder) |
|---|---|---|
| `ground_type` raw inter-variant agreement | 0.708 | **0.4599** |
| κ vs the accepted flag | A 0.21 / B 0.311 | **C 0.126 / D 0.392** |
| unmapped share | 60/137 (44%) / 43/137 (31%) | **0/137 / 0/137** |

Two independent things follow, and neither is written down anywhere:

1. **§4's gate is half-passed and unevaluated.** `PREMISE_NEXT.md`:142–152 sets the corpus-wide gate
   at unmapped ≤15% **and** exact match ≥22/30. The unmapped criterion passed *outright* — 0% under
   both C and D, against 31–44% under A/B. That is a large, favourable, unreported result, and it
   bears directly on `PHASE_0_LOOSE_ENDS.md` B5 ("Group A has not earned corpus-wide status") and on
   design rule 8.
2. **§4's secondary criterion failed hard.** C and D were to land within ~5 points of each other;
   they agree with each other on 46% of artworks, *worse* than A agrees with B. Two wordings that
   share B's ordering do **not** reproduce B. On its face that is evidence **against** rule 6's
   ordering hypothesis — the thing rule 6 pre-registered C/D to confirm.

So the campaign holds a measured answer to its own pre-registered question, the answer is not the
expected one, and the freeze it would revise is still described as resting on an unrun experiment.
`ORACLE_QUESTION_SET.md`'s "Until then" has already elapsed.

**Owner.** oracle/premise workstream (report the analysis) + reviewer (rule 6's status). Nothing here
needs GPU — the run is done; only the write-up is missing.

### 1.2 `data/sam/model-manifest.json` pins a concept set two generations old.

CONFIRMED. The manifest is what `pin_model.py` writes as a run's identity anchor. Its
`concept_prompts` field holds the **original pipeline §8.3 set** (`text`, `lettering`, `typography`,
`logo`, `sticker`, `person`, `face`) and hash `5b8f2e69…`.

The current `oracle/sam/config.py` set is v2.1, ten concepts:

```
("words","words") ("letter","letter") ("lettering","lettering") ("display-text","album title")
("emblem","logo") ("sticker","sticker") ("parental-advisory","parental advisory")
("person","person") ("face","face") ("barcode","barcode")
```

Recomputed hashes (read-only, pure stdlib):

| source | concept_set_hash | set |
|---|---|---|
| current `config.py` | `9c78298f3c99…` | v2.1, 10 concepts |
| `data/sam/sam-eval-142-v2.jsonl` | `402de9d8d3a0…` | v2, 9 concepts |
| `data/sam/sam-eval-142.jsonl` | `848359e5f158…` | v1 |
| **`data/sam/model-manifest.json`** | **`5b8f2e69…`** | **pre-v1 §8.3** |

`text` and `typography` — two of the seven prompts the manifest pins — were measured to fire on
**0 of 10** and **0 of 16** images with this model. The manifest pins prompts known to find nothing.

**Why critical.** `row_key` (`common.py`:297–309) embeds `concept_set_hash()[:16]`, so the manifest is
not decoration — it is the identity claim under which stored rows are read. `config.py`:122–123 does
state that stored rows are unreadable under v2.1 without a re-run, but nothing in `data/` reflects it,
and a consumer that trusts the manifest (which is exactly what a pinned manifest is for) gets the
wrong question set with no error. This is a harder failure than any prose staleness in this report.

**Owner.** oracle/SAM workstream.

### 1.3 `decisions.json` carries three false caveats, on a record with empty `fundedBy`, and no record in the file uses `supersedes`.

CONFIRMED. Two defects in the one artifact whose stated purpose is machine-recheckability.

**(a) False caveats.** `d-2026-08-03-sam-prompt-set-replacement.fundingCaveats` contains:

- *"NO WAREHOUSE RECORDS FUND THIS, and no reviewer has looked at a single mask produced by the new
  set."* — **False.** 100 reviewer-graded masks exist across `sam-mask-quality-1` (60) and
  `sam-mask-quality-2-v2-ratification` (40); the set was ratified (`d-2026-08-03-sam-concept-set-v2`,
  `fundedBy` = 40 records).
- *"STALE COMMENT IN THE CODE: the `[MEASURED, n=10, HELD]` block still reads 'The set above is left
  exactly as §8.3 specifies…'"* — **False.** `config.py`:127–139 now reads "the set above was REPLACED
  with the measured winners".
- *"DANGLING GROUP MEMBERS: `CONCEPT_GROUPS[text_like]` still lists `text` and `typography`"* —
  **False.** It is now `("words","letter","lettering","display-text")`.

These are the same two code defects `PHASE_0_LOOSE_ENDS.md`:82–83 says "remain the oracle
workstream's to fix". Both are fixed. The ledger and the decision record are stale together (§2.5).

**(b) The `supersedes` chain does not exist.** `CONVENTIONS.md`:66–68 is explicit: "Append, never
edit: a changed decision is a new record carrying `supersedes`." **Zero of the 15 records in
`decisions.json` carry a `supersedes` field.** Yet three of them describe one instrument in three
successive states:

`d-2026-08-03-sam-prompt-set-replacement` → `d-2026-08-03-sam-concept-set-v2` →
`d-2026-08-03-sam-concept-set-v2.1-barcode`

Nothing links them. A consumer reading `decisions.json` cannot tell which is current, and the
*earliest* — the one carrying the false caveats — is indistinguishable from the live one.

**Why critical.** `fundedBy` on that record is `[]`, so `warehouse recheck --decisions` has nothing to
check and will never flag it. The convention's own escape hatch (an empty `fundedBy` is "the honest
statement that no machine can ever re-check it") was written for reviewer-conversational decisions;
here it is attached to a record whose caveats are factual claims about code, and they are wrong.

**Owner.** housekeeping (owns `data/decisions/`).

### 1.4 `V3_PLAN.md`:162 — "434 warehouse records across 5 batches". Reality: **773 records across 10 batches.**

CONFIRMED. `data/warehouse/warehouse.jsonl`: 703 `oracle-label`, 39 `note`, 13 `amendment`, 10
`batch-complete`, 8 `verdict` = 773, over 10 released batches:

`oracle-probe-gold-1` 180 · `bcde-validation-1` 163 · `bracketing-round-2` 84 ·
`bracketing-round-1-clarified` 72 · `bracketing-round-1` 72 · `sam-mask-quality-1` 60 ·
`sam-mask-quality-2-v2-ratification` 40 · `oracle-premise-disambiguation-1` 32 ·
`demo-calibration-0001` 4 · `demo-batch-0001` 4.

**Why critical rather than cosmetic.** 434 is exactly the file's line count at `2026-08-03T10:12:22Z`
— the number was true when written and froze while the warehouse nearly doubled. This is the
signature of an expiring `[MEASURED]` claim: not a typo, a timestamp. It certifies criterion 1 as
"met", so it is the number a later reader cites for how much evidence Phase 0 has.

Any correction should note that two of the ten batches (8 records) are self-declared demo data.

### 1.5 `V3_PLAN.md`:171 — SAM row 10: "the score threshold is uncalibrated and no reviewer has validated a mask". **Both halves false.**

CONFIRMED, and contradicted by the ledger on the same day.

- `oracle/sam/config.py`:201 — `CALIBRATED_SCORE_THRESHOLD = 0.578`, tagged **`[REVIEWED]`**,
  "Calibrated 2026-08-03 by the reviewer's mask-quality round (60 masks, `sam-mask-quality-1`)".
- 100 reviewer-graded masks across two rounds.
- `PHASE_0_LOOSE_ENDS.md`:74 (A5) and :102 (A6) are struck through **CLOSED 2026-08-03** for exactly
  these two reasons.

`SCORE_THRESHOLD = 0.3 [UNCALIBRATED]` does still exist (`config.py`:207) but is demoted to a run-time
*capture floor* — "STORED ROWS keep using the low run-time threshold so raising the cut stays a query,
never a re-run; consumers should filter at `CALIBRATED_SCORE_THRESHOLD`". Row 10 is defensible only
about a constant no consumer should read.

**Blast radius.** Row 10 is the only row keeping the Phase 0 table from uniformly "met", and it is the
stated reason a reader treats SAM as not-ready. Meanwhile the genuinely open SAM risks — A9 (concept
vocabulary) and A12 (CJK invisible at the calibrated cut) — appear nowhere in it. The row is at once
too pessimistic and aimed at the wrong hazards.

### 1.6 `ORACLE_QUESTION_SET.md` — "Nothing in groups B–F has been piloted." Groups B, C, D and E were piloted, twice.

CONFIRMED, and the document contradicts itself. Batch `bcde-validation-1` is released with **163
`oracle-label` records, every one carrying `labelSchemaVersion: "group-bcde.v1"`**; the model-side
pilot `group-bcde-pilot-1.jsonl` (299 rows, variants E/F, 142 images, all ok) and its analysis
(`bcde-pilot-1-analysis.json`, 49 pre-registered verdicts: 42 pass / 3 fail / 4 report-only) also
exist, together with `analyze_bcde.py` (57 KB).

Human answers by question: `overlays` 22 (C) · `grain_or_noise` 21 (E) · `has_dominant_subject` 20,
`subject_kind` 20, `subject_area_band` 20, `has_signature_color` 20, `signature_carrier` 20 (D) ·
`text_dominance` 20 (B).

| line | says | reality |
|---|---|---|
| :5–6 | "Nothing in groups B–F has been piloted; … `group-bcde.v1` … is drafted and unrun" | ran twice (model + human) |
| :61 | "Groups B–F … remain unpiloted" | B, C, D, E piloted; F genuinely not |
| :562 (§B) | "Not piloted" | `text_dominance` ×20 |
| :574 (§B) | "`[UNCALIBRATED]` — still a guess, **no pilot has touched this group**" | false |
| :578 (§C) | "Not piloted" | `overlays` ×22 |
| :589 (§D) | "Not piloted" | five D fields ×20 each |
| :604 (§D.1) | `subject_kind` "Drafted into `group-bcde.v1`; **nothing has run**" | 20 `subject_kind` answers |
| :656 (§E) | "Not piloted" | `grain_or_noise` ×21 |

§F alone is correctly labelled — no `light_text_safe` / `dark_text_safe` / `two_color_faithful`
records exist.

**Why critical.** The same document's Appendix R (:817, :831) records **two reviewer rulings issued
during that round**, and §D.1 pre-registers an analysis of its results. The header and the appendix
describe different worlds. An agent reading top-down concludes B–E are untouched drafts and either
re-runs the pilot or discards its evidence. `PHASE_0_LOOSE_ENDS.md`:238–240 (B6) — "Oracle groups B–F
are unpiloted draft … **Nothing has touched them**" — is the same claim in the ledger, and is false
against 163 warehouse records.

### 1.7 `PHASE_0_LOOSE_ENDS.md`:308–310 (B18) — "The tagging vocabulary is **undrafted**." It shipped, at v2.1.0.

CONFIRMED, and flatly contradicted by `REVIEW_UI.md`:151, which strikes the same item through as
**"Built 2026-08-03"**. Two governing documents assert opposite states for one instrument.

Reality: `data/tagging/vocabulary.json` is **v2.1.0** — 103 tags across 12 axes (48 opposed judgment
pairs = 96 tags, plus 7 descriptive tags on `instrument-behavior`), with `lintVocabulary` /
`loadVocabulary` enforcing symmetry on read, three completed validation passes, an idempotent
reviewer-note port, and 13 derived `note` records live in the warehouse.

B18's substantive requirement ("symmetry is the requirement") was not merely met but *refined*: the
vocabulary needed a scoping rule that pure symmetry cannot express, recorded as
`d-2026-08-03-tagging-symmetry-scoping`. B18 as written has a reader re-derive all of it.

### 1.8 `REVIEW_UI.md`:151–153 — "66 tags in 33 symmetric pairs across 8 axes". Reality: **103 tags, 48 opposed pairs + 7 descriptive, 12 axes.**

CONFIRMED. The doc is pinned to vocabulary **v1.0.0**; the file is **v2.1.0**. Both artifacts the line
points at — `data/tagging/TAGS.md` (generated) and `src/tagging/TAGGING_PROTOCOL.md` §2 — already
carry the v2.1.0 numbers, so the pointer's own targets disagree with it.

Per-axis: gradient 12 · criterion 12 · instrument-fitness 12 · coverage 10 · role 10 · contrast 8 ·
meta 8 · instrument-behavior 7 · collapse 6 · concept 6 · identity 6 · provenance 6.

Not decorative: "33 symmetric pairs" asserts a *uniformly symmetric* vocabulary, and v2.1.0 is
deliberately not — 7 descriptive tags have no opposite by design. A consumer enforcing the documented
invariant would reject the real file.

### 1.9 `PHASE_0_DECISIONS.md`:161–162 — "**|raw| = 1.9815** (`[MEASURED]`, exhaustive Y scan)". The value was refuted, the provenance is no longer a scan, and the stale digits appear in six places.

CONFIRMED. This is the only finding in the report where a **`[MEASURED]` tag survives its own
refutation**, which is the exact failure mode the provenance convention exists to prevent.

**What happened.** `src/contract/constants.ts`:160 now reads `APCA_RAW_IDENTICAL_CEILING = 1.98152`,
and its docblock records that the earlier **1.9815 was refuted** by a verifier: the colour `#df11de`
against itself produces 1.981519246, which *exceeds* 1.9815 — "a rounded-down bound is not a bound".
The current provenance is **analytic** (`Y* = (0.62/0.65)^(1/0.03)`), explicitly **not** an exhaustive
scan.

So `PHASE_0_DECISIONS.md`:161–162 is wrong twice: it states the refuted digits, *and* it attributes
them to a method that no longer supports them.

**Why this is critical and not a rounding nit.** The constant is a **bound**, and its whole job is to
be exceeded by nothing. Both ε floors must clear it (§4 invariant 4), so a reader who implements
against 1.9815 implements against a value one identical-colour pair is measured to beat — which is
precisely the invisible-pair-publishes failure invariant 4 exists to stop. The refutation is the
reason the digits changed; quoting the old ones re-opens the hole.

**Six stale sites**, one of them self-contradicting:

| site | says |
|---|---|
| `PHASE_0_DECISIONS.md`:161 | 1.9815, "`[MEASURED]`, exhaustive Y scan" |
| `PHASE_0_DECISIONS.md`:421 | "the measured 1.9815 identical-colors residue" |
| `V3_PLAN.md`:163 | "the ε floor's 1.9815 raw-APCA residue measured exhaustively" |
| `src/review-server/README.md`:620, :624 | 1.9815 |
| `src/review-server/bracketing.ts`:167, :174 | 1.9815 |
| `src/contract/color.ts`:289 | 1.9815 |
| **`src/contract/constants.ts`:168** | "must exceed `APCA_RAW_IDENTICAL_CEILING` (**1.9815**)" — **eight lines after defining it as 1.98152** |

Correct today: `PHASE_0_LOOSE_ENDS.md`:57 (A3) says 1.98152. The ledger is right and the decisions
doc is wrong — the reverse of this report's usual pattern, and worth noting for that reason.

**Owner.** contract workstream (the code sites, incl. `constants.ts`:168) + housekeeping (the doc
sites).

---

## 2. Major

### 2.1 Three more completed runs are documented as unrun.

CONFIRMED, same class as §1.1, lower stakes because no live decision hangs on them.

| doc | claim | reality |
|---|---|---|
| `PREMISE_NEXT.md`:640–644, :957–962 | group-BCDE pilot "drafted, unrun, **not approved**"; "Analysis is not yet built, and deliberately so" | `group-bcde-pilot-1.jsonl` 299 rows; `analyze_bcde.py`; `bcde-pilot-1-analysis.json` with 49 verdicts |
| `oracle/bakeoff/README.md`:3–6 | "three arms registered, pinned and load-verified … **No bulk run has been started.**" | `qwen3-32b-dense.jsonl` 299 rows / 142 images (gold30 + eval142); `gemma3-27b.jsonl` 64 rows / 31 images; four run logs; `scores.json`/`scores.txt`. :185–187 still lists both challengers as "projected durations" |
| `oracle/premise/README.md`:3 | "**Status:** set up, pre-flighted, **not run**." | three completed runs out of that directory |
| `oracle/ladder/README.md`:3–5 | "**smoked on 2 artworks**. The real run launches only on reviewer go-ahead." | three real runs, 3,136 rows (sample / pairs / codec-control) |

### 2.1b The bulk-model blocker is half-discharged: the dense challenger's eval-142 run completed 90 minutes before the doc that calls it pending was saved.

CONFIRMED, and worth its own row because it changes what the reviewer is being asked for.

`PHASE_0_DECISIONS.md`:424–426 — "the incumbent … is the **only arm with a full 137-artwork run**;
challenger runs are **in progress** and so far only cover the gold-30". `PHASE_0_LOOSE_ENDS.md`:211–214
(B1) — "Challenger runs in progress and so far gold-30-only … **Next: eval-142 runs** plus reviewer
visual evaluations."

Actual arm coverage on disk:

| arm | gold-30 | eval-142 |
|---|---|---|
| `qwen3-30b-a3b` (incumbent, 6-bit MoE) | 60 rows | **complete** — 284 rows, 142 images, 137 scored, 0 failed |
| `qwen3-32b-dense` (8-bit) | 63 rows | **complete** — 236 eval142-tagged rows, 137 scored, 0 failed / 0 parse_failed |
| `gemma3-27b` (8-bit) | 64 rows | none |

`run.qwen32b.eval142.log` ends `[224/224] … ok`, `"exit_code": 0`, `=== supervisor: worker finished
cleanly` at **2026-08-03 14:29 local**; `scores.json` was regenerated at the same moment with full
`eval142` blocks for both Qwen arms. `PHASE_0_DECISIONS.md` was last saved at 16:03 — **an hour and a
half later.**

The cross-arm figure both docs quote (0.533) is correct *for gold-30*, but the same pair on eval-142
agrees **0.761 (n=142)** — a materially different picture of how far apart the two instruments are,
and exactly the number B1 says is needed to settle the choice.

**Accurate statement today:** two of three arms have full eval-142 runs; only `gemma3-27b` is
gold-30-only; the outstanding blocker is the **reviewer visual evaluations alone**. That is a much
smaller ask than either document implies, and it is reviewer-bandwidth-shaped rather than
GPU-shaped — which matters, because reviewer bandwidth is the campaign's stated binding constraint.

### 2.2 `PHASE_0_LOOSE_ENDS.md`:144–163 (A9) — stale on two counts, and carries no CLOSED marker.

CONFIRMED. A9's heading says the concept-vocabulary probe's results "are **not ratified**", and its
body says "**Nothing in `oracle/sam/config.py` was changed.**"

Both false. The probe-2 proposal was ratified and applied (`VOCAB_PROBE_NOTES.md`:170 "Ratified and
applied — 2026-08-03"; decision `d-2026-08-03-sam-concept-set-v2`, `fundedBy` = 40 records), and
`config.py` has since taken a *further* change — the barcode add, v2.1, with its own decision record.
A9 was already stale before the barcode landed. A5, A6 and A7 all carry strikethrough CLOSED markers;
A9 does not.

A9 also quotes the re-run cost as "**~6.5 min measured**". That figure is real for the *v1* run
(`run.eval142.log`:146 — `elapsed=391.2s`, 2.75 s/image), but the actual v2 re-run cost
`elapsed=604.1s`, 4.25 s/image = **10.1 min, 55% over**. A9 uses it to price a decision.

### 2.3 `PHASE_0_LOOSE_ENDS.md`:134–142 (A8) — already resolved, still listed as sharp/open.

CONFIRMED. A8 says `data/legacy/README.md` "still says the same-color bar is `[UNCALIBRATED]`" and
still tells consumers "until it lands, no consumer of these fixtures can compute a match, only an
exact-hex approximation of one".

That sentence is gone. `data/legacy/README.md`:409 now reads: "**Within the bar, on all four roles,
never exact hex.** The bar was `[UNCALIBRATED]` when this was decided; **it has since been calibrated
per region and frozen**." A8's own stated fix ("a one-paragraph correction") has been applied.

What remains at :438–439 is a *different and correct* statement — hit counts computed before
2026-08-03 are provisional because they predate the bar. A8 should be closed with that residue noted.

### 2.4 `PHASE_0_LOOSE_ENDS.md`:295–299 (B16) — wrong in three independent ways.

CONFIRMED. B16: "The palette composer / `endorsed-sample` flow is **unbuilt**… *a `composer.ts` has
since appeared … carrying **three** new `[UNCALIBRATED]` constants, and the README's 'not built' list
**has not been reconciled** with it.*"

1. **It is built.** `src/review-server/composer.ts` (eyedropper resolved against the decoded image,
   swatch grid of exact source pixels, membership enforced at submit) + `review-ui/composer.js`
   (`GRADIENT_MODES = ["flat","2-stop","3-stop"]`, preview POSTed through the pinned renderer),
   `endorsed-sample` records, deletion, `tests/review-server-composer.test.ts`.
2. **Two `[UNCALIBRATED]` constants, not three**: `SWATCH_GRID_SIZE = 24` (:33),
   `IMAGE_COLOR_CACHE_SIZE = 2` (:56). The third, `SWATCH_CLUSTER_LIMIT = 256` (:44), is `[MEASURED]`
   with a documented measurement. Miscounting a measured constant as uncalibrated is the exact error
   the provenance-tag convention exists to prevent.
3. **The README is already reconciled.** `src/review-server/README.md`:997 lists the composer under
   *Working end to end*; its "Not built" list (:1004–1015) does not mention it.

### 2.5 `PHASE_0_LOOSE_ENDS.md`:82–83 — A5's "two code defects riding along" are both fixed.

CONFIRMED. A5's closure note says they "remain the oracle workstream's to fix and are not closed
here". Both are done: `config.py`:127–139 no longer claims the set "is left exactly as §8.3
specifies", and `CONCEPT_GROUPS["text_like"]` is `("words","letter","lettering","display-text")` —
no `text`, no `typography`. The same two claims are frozen into `decisions.json` (§1.3a).

### 2.6 `PHASE_0_LOOSE_ENDS.md`:301–306 (B17) — half its "unbuilt" list is built.

CONFIRMED against the code and against `src/review-server/README.md`'s own lists.

| B17 item | reality |
|---|---|
| Post-release amendments (server returns 409) | **BUILT** — `server.ts`:2374 maps `Conflict → 409`; `tests/review-server-amendments.test.ts`; README:997 lists it as working |
| calibration `mode: "absolute"` | **BUILT** — `server.ts`:680/780/881/1102; `tests/review-server-calibration.test.ts`; README:996 |
| the completion watcher | **BUILT** — `src/review-server/watch-batch.ts` (offset-tracked JSONL tail, exit 0/2/1); `tests/review-server-watch-batch.test.ts`; README:997 |
| note-only records and tags | still open — README:1011 |
| coverage-aware sequential stopping | still open — README:1006 |
| multi-reviewer use, auth, LAN exposure | still open — README:1015 |

Three of six are stale. The README is the accurate document; the ledger is behind it.

### 2.7 `REVIEW_UI.md`:129–136 (§6) — coverage-aware sequential stopping is stated as fact; it is not built.

CONFIRMED. §6 describes per-stratum stopping, space-spanning serve order and neighbourhood expansion
in the present indicative with no unbuilt marker. `src/review-server/README.md`:1006 lists it first
under "Not built", blocked on another workstream's SigLIP embeddings.

The inverse of §2.6, and harder to catch — `REVIEW_UI.md` is the document a reviewer-facing
implementer is *told* to read (`CONVENTIONS.md`:72). The mitigation is real (`stratum` is recorded on
every `oracle-label` row, so the rule applies retroactively) but it lives only in the ledger.

### 2.8 `PHASE_0_LOOSE_ENDS.md`:339–351 (C5) — half right, half stale, and the port has fallen two rulings behind.

CONFIRMED, in both directions. Precision matters here, so both halves are stated exactly.

**(a) "Nothing cites them yet" is false — narrowly.** All 13 ported note ids appear in the `fundedBy`
of `d-2026-08-03-tagging-symmetry-scoping` and `d-2026-08-03-tagging-meta-scope` (13/13 by set
intersection).

**(b) C5's actual remaining half is genuinely still open.** Every one of the four decisions C5 names
still has `fundedBy: []`:

| decision | fundedBy | fundedByArtifacts |
|---|---|---|
| `d-2026-08-02-embedding-canonical-model` | `[]` | 2 |
| `d-2026-08-02-holdout-v2-redraw` | `[]` | 3 |
| `d-2026-08-02-legacy-contested-pairs-recency` | `[]` | 2 |
| `d-2026-08-03-sam-prompt-set-replacement` | `[]` | 2 |

So C5's *conclusion* holds and its *evidence sentence* does not.

**(c) The port is now two rulings behind.** C5 counts "3 `ORACLE_QUESTION_SET.md` Appendix R
rulings", and `data/tagging/port-reviewer-notes.ts` stops at `appendix-r-3`. Appendix R now carries
**five** dated entries — :782, :791, :805 (ported), plus **:817 and :831, both marked "SIGNED OFF
2026-08-03"**:

- :817 — `has_dominant_subject` has no unit rule → "count the groups you would circle, not the things
  you could name".
- :831 — `signature_carrier` forces one answer → make it multi-select.

Two signed reviewer rulings fund nothing and are invisible to `warehouse recheck --decisions`. The
decision that *should* cite them, `d-2026-08-03-bcde-question-rulings-and-rule-9`, has `fundedBy: []`
— while 163 warehouse records from the round that produced them sit available.

*For whoever fixes it:* re-running the idempotent port with `appendix-r-4`/`-5` also invalidates the
"13 of 13" fixture in `TAGGING_PROTOCOL.md` §8 and the pin in `tests/tagging-validation.test.ts`.
Three files, not one.

### 2.9 `ORACLE_QUESTION_SET.md`:614, :751 and pipeline §8.3 — the SAM concept prompt list is superseded, and the citation was never right.

CONFIRMED. Both lines state the union as "`text`, `lettering`, `logo`, `sticker`, `person`, `face` —
phrasings unioned per pipeline doc §8.3". That set is dead twice over (replaced at v2, extended at
v2.1), and `text` — the first prompt named — is the specific phrasing measured to fire on 0/10 and
0/16 images.

The citation is also inaccurate at source: pipeline §8.3 (:708–711) names
`text`/`lettering`/`typography`/`logo` for the union and `text`/`logo`/`person`/`sticker` as
well-handled. Neither is the six-item list quoted. The pipeline doc itself was never updated for
v1→v2→v2.1, so §8.3 is stale in its own right.

Compounding: §D.1 (:614) builds its whole argument on "That prompt list is **fixed and
hand-written**" — an argument about a list that has since changed twice, in the direction the
argument asks for. And `oracle/sam/config.py`:63 still says "This is the set §8.3 names", annotating a
tuple that shares **zero** phrasings with §8.3's text side.

### 2.10 `PHASE_0_LOOSE_ENDS.md`:15–18 — the ledger's own counts are wrong.

CONFIRMED by counting its headings.

| header claims | actual |
|---|---|
| "**35 items**" | **38** (A1–A12 = 12, B1–B18 = 18, C1–C8 = 8) |
| "9 **sharp**" | 12 |
| "18 **standing**" | 18 ✓ |
| "8 **latent**" | 8 ✓ |
| "Four rows are now **closed** (A1, A5, A6, B8)" | **five** — A7 (:119) is also struck through CLOSED |

A10–A12 and A7's closure were appended after the header was written. Structurally, A10–A12 also sit
*below* the `---` at :165 that was meant to end section A, so they render outside their own section.
A ledger whose headline count is wrong cannot be used as a checklist, which is its only job.

### 2.11 `PHASE_0_LOOSE_ENDS.md`:104 (A6) — states a constant the code does not have.

CONFIRMED. A6's closure asserts "**`SCORE_THRESHOLD = 0.578` `[REVIEWED]`**". The code has *two*
constants: `CALIBRATED_SCORE_THRESHOLD = 0.578 [REVIEWED]` (:193–201) and `SCORE_THRESHOLD = 0.3
[UNCALIBRATED]` (:203–207). The constant literally named `SCORE_THRESHOLD` is still 0.3 and still
uncalibrated.

The design (store low, filter high) is sound and deliberate; the ledger sentence just names the wrong
identifier, which is enough to make a grep-driven reader believe the file is inconsistent — or to make
a consumer filter at the wrong constant.

Related nuance on the same closure: "the concept groups **did not separate**, so no per-group
threshold is justified". Per-group optima are *not* equal — person_like 0.578 (J 0.678), text_like
0.697 (J 0.478). The claim is true only under `analyze-mask-quality.ts`'s adoption rule
(`PER_GROUP_MIN_SEPARATION` / J-gain), not as a raw statement. SUSPECTED overstatement.

### 2.12 "All nine probe prompt files are inert — no glob matches them" is literally false in three documents.

CONFIRMED. `PHASE_0_DECISIONS.md`:339, `PHASE_0_LOOSE_ENDS.md`:226 (B3) and `PREMISE_NEXT.md`:544 all
assert no glob matches `group-a.probes.v1.1.*`. `common.py`:124–125 registers **`group-a.probes.bundled`
and `group-a.probes.solo`** with matching globs.

The *operational* claim survives — the default prompt set is still `group-a.v1`, so no A/B rerun is
affected, and the arm is still gated on an explicit opt-in. But the stated mechanism of the guarantee
("nothing can reach them") is no longer the mechanism; the guarantee is now "nobody selects them",
which is a weaker property that should be stated as such.

### 2.13 `PREMISE_NEXT.md` §15.9 vs §15.10 row 15 — the same file contradicts itself.

CONFIRMED. :1123 (§15.9 title): "the follow-up reviewer validation round — batch spec, **NOT built** …
Do not build this until the pilot has run." :1223 (§15.10 row 15): "**BUILT AND PUSHED 2026-08-03**
(`bcde-validation-1`, 160 items)."

Reality: `data/oracle-validation/bcde-validation-1.json` (20 artworks × 8 questions = 160 items) plus
`bcde-validation-1-analysis.json` (160/160 answered, analyzed).

§15.9's spec is also superseded on its own numbers: :1142 says "260 = 20 artworks × 13 questions" and
:1148–1152 draws the 20 artworks "from the 142" (6 thumbnail / 12 standard / 2 large). The built round
is 160 items over 8 questions, drawn from `coverage-set-1.json` `role === "core"`, explicitly **not**
from eval-142. That is a deliberate improvement (it is the coverage set doing its job) and it is
recorded nowhere but in the built artifact.

### 2.14 `PHASE_0_DECISIONS.md`:231–232 (§5) — the candidate-count arithmetic does not close.

CONFIRMED. §5 says the transparency exclusion "reduced candidates from **3,097** square artworks to
**2,757** (**324** square real-transparency files…)". 3,097 − 324 = 2,773, not 2,757.

`data/coverage-set/COVERAGE_SET.md`:23 reconciles it: 4,088 artworks − 991 non-square = 3,097 square −
**16 thumbnail-only** − 324 transparency = 2,757. §5 omits the 16-artwork thumbnail filter, so its
parenthetical attributes the whole drop to transparency.

Endpoints are right and every downstream number keyed to 2,757 is safe; the stated *reason* is
incomplete, which matters because §5 is the document that defines the candidate set.

### 2.15 `PHASE_0_DECISIONS.md`:352 (§7) — two of the three population numbers in one sentence are wrong.

CONFIRMED. §7's provenance sentence reads "2,913 work rows, 1,225 ladder comparisons, 400 artworks
with an answered reference".

| quoted | actual (`ladder-sample-1.analysis.json`) | what the quoted number really is |
|---|---|---|
| 2,913 work rows | `health.work_rows` = **3,088** (3,136 rows − 48 canary) | the *planned image count* for the sample+pairs scope — `cost-scoping.json` `.images` = 2913 |
| 1,225 ladder comparisons | `ladder_comparisons_total` = **1,431**, `_primary` = **1,190** | `ground_type.pooled_unrestricted.n` — **one question's** count |
| 400 artworks | 400 ✔ | correct |

Two different category errors in one clause: a *plan* quoted as an *execution*, and a *per-question*
count quoted as a *population*. Both were correct-ish before the codec-control rerun landed and the
analysis was regenerated; the prose was not updated when the codec-control bullet immediately below
it (:372–378) was — so the paragraph and the bullet under it describe different runs.

Nothing downstream breaks (the floors themselves are exact, §5), but §7 is the section every
input-policy and corpus-inclusion argument cites for *how much evidence* the floors rest on.

### 2.16 `PHASE_0_DECISIONS.md`:382–383 (§7) — "**Two** bins are thin". The analysis's own rule names three.

CONFIRMED. §7 says "Two bins are thin (161–240 px n=4, 681–900 px n=4) and the 561–680 px bin is
empty". The first two counts and the empty bin are correct. But the analysis applies `min_bin_n = 30`
and its own `thin_bins` list names **three**: 161–240, 681–900 **and 901–1400 (n=15)** — plus 341–440
for `shading_geometry` specifically.

Understating thinness in the direction of confidence, in the section whose whole job is to say how far
the ladder can be trusted. The 901–1400 bin is also the one nearest the "is 640 px enough?" question
§7 says the ladder is silent on.

### 2.17 `PHASE_0_LOOSE_ENDS.md`:65–73 (A4) — the wire-in point it names does not exist.

CONFIRMED. A4 says invariant 2's spatial-spread half has a "wire-in point … a single
`spatialSpreadValidator` assignment in `invariants.ts`".

`grep -c spatialSpreadValidator src/contract/invariants.ts` = **0**. The only occurrence repo-wide is
the pointer at `src/contract/types.ts`:318. What `invariants.ts` actually has is
`DEFERRED_SPATIAL_SPREAD = "I2.spatial-spread"` (:766), pushed onto `deferred` at :812, :850 and :969.

A4's *substance* is accurate and important — the deferral machinery is real, the `TODO [v3 Phase 1]`
is still at `types.ts`:312, and the threshold genuinely lacks provenance. Only the "one assignment and
you're done" cost estimate is unsupported: there is no such assignment to make. Whoever picks A4 up in
Phase 1 will find the job is to *create* the seam, not to fill it.

### 2.18 `CONVENTIONS.md`:14–27 — the path-ownership table has no row for several live paths.

CONFIRMED. Directories under `research/v3` belonging to no workstream row:

- `src/coverage-set/` and `data/coverage-set/` — an entire Phase 0 instrument (§3.1).
- `data/tagging/` — the tagging row owns only `src/tagging/`, yet `data/tagging/` holds the
  vocabulary, the fixtures, the work files and `port-reviewer-notes.ts`.
- `tests/tagging-*.test.ts` (3 files) and `tests/sam-mask-quality.test.ts` — no row grants tests to
  the tagging or oracle workstreams.
- `data/warehouse/`, `data/review-server/`, `data/calibration/`, `data/source-surveys/`.

Path ownership is this campaign's collision-avoidance mechanism for parallel agents, and the table is
the only place an agent is told to look. An unowned path holding the authoritative vocabulary file is
a write collision waiting to happen.

### 2.19 `data/sam/` notes describe the pre-v2.1 instrument.

CONFIRMED, four documents:

| file:line | says | reality |
|---|---|---|
| `SAM_DESIGN_NOTES.md`:3, :138 | "written after concept set **v2** was ratified"; "The concept set stays as v2 ratified it." | set is v2.1 |
| `SAM_DESIGN_NOTES.md`:39 | "`mark_like` instances (emblem / sticker / parental-advisory)" | `mark_like` now also contains `barcode` |
| `VOCAB_PROBE_NOTES.md`:170–197 | applied set = 9 concepts; `mark_like = emblem, sticker, parental-advisory` | 10 concepts; barcode in `mark_like` |
| `PROBE4_NOTES.md`:11, :269 | "Nothing in `config.py` was touched … Everything below is a proposal"; "No change to `config.py`" | probe 4's barcode proposal was **accepted and applied** — `config.py`:114–124, 184–187 cite this very file |

`SAM_DESIGN_NOTES.md`'s §2 nesting table (77 marks / 12 bbox / 9 mask / 47 images / 7 images)
**reproduces exactly** against the stored `nesting-in-person.json` — but that JSON's `markGroup` is
the three-member former group, so the numbers are a correct measurement of a superseded definition.
`PROBE5_NOTES.md`'s equivalent "nothing was touched" wording is accurate for probe 5.

---

## 3. Minor

### 3.1 The coverage set is absent from every governing document.

CONFIRMED. `data/coverage-set/COVERAGE_SET.md` describes a built, checked, seeded 200-artwork tuning
bench (`coverage-set-1.json`, seed `0xc0efface`, byte-reproducible, 9 named checks all passing) that
explicitly supersedes eval-142 as "the standard bench for tuning v3's instruments — VLM prompts, SAM
prompts, score thresholds". It has a decision record (`d-2026-08-03-coverage-set-canonical-bench`) and
is already the population the built BCDE validation round draws from (§2.13).

It appears in **no** row of `V3_PLAN.md`'s Phase 0 status table and **no** row of `CONVENTIONS.md`'s
ownership table (§2.18). The document is internally consistent — its arithmetic closes (6,906 + 2,757
= 9,663 − 413 holdout − 18 enrichment = 9,232 = 6,888 + 2,344) and it is the artifact that corrects
§2.14 — so this is an omission from the summaries, not an error in the instrument.

`PHASE_0_LOOSE_ENDS.md`:186 (A11) understates it: "the coverage set now touches **most** sharded
clusters". Per COVERAGE_SET.md:130 the core covers **all 36** ("clusters with no core member: []").
A11's conclusion — membership is not a claims shield — is strengthened by the correction.

### 3.2 `ORACLE_QUESTION_SET.md`:39–40, :706 — the design-rule count is stale and self-inconsistent.

CONFIRMED. :40 says "§D below **adds a sixth rule**". The document now adds **four** (6, 7, 8, 9), in
their own section, not in §D — the line was written when only rule 6 existed. Separately, :39
enumerates pipeline §8.1 as four rules while :706 says "§8.1's **five** rules"; §8.1 (:655–669) has
five, and :39 omits rule 1 ("Ask what the algorithm must decide, not what the image *is*"). Rule 9
(`[REVIEWED]`, 2026-08-03) is correctly tagged; nothing downstream counts rules.

### 3.3 `V3_PLAN.md`:168 — "6 arms × 2 collections, **16,145 vectors**". Reality: 16,145 *images*, **96,870 vectors**.

CONFIRMED. 6 arms (siglip2-so400m, pe-core-l14, dinov2-vitl14, dinov2-vitl14-392, dinov3-vitl16,
dinov3-vith16plus) × 2 collections (music_artworks 8,595 + sharded 7,550 = 16,145 images); each arm
embeds all of them, so 96,870 vectors across 12 `.npy`/`.ids.jsonl` pairs. As written the sentence
understates the artifact 6×.

### 3.4 `V3_PLAN.md`:3, :152 — "all met" is not supported by the table it cites.

CONFIRMED. Rows 4 and 5 read "specified, NOT built" and row 10 "partially met". Lines 154–158
pre-emptively carve out rows 4 and 5 (structurally unbuildable without a pipeline; moved to the Phase
2 entry condition) — a legitimate argument — but never extend it to row 10.

Worth stating because it changes the fix: row 10 is stale in the *understating* direction (§1.5). A
corrected row 10 reads "met", at which point line 3 becomes true. The defect is the un-updated row,
not the summary.

### 3.5 `REVIEW_UI.md`:150 (§8) — "Server deployment details (port, LAN exposure, auth)" listed as open. Settled.

CONFIRMED. `server.ts`:172 `DEFAULT_PORT = 3010`; :2382–2385 `listen(port, host = "127.0.0.1")` —
localhost-only by default; `serverctl.sh`:26 uses `REVIEW_SERVER_PORT:-3010`. `README.md`:1015 states
the standing policy. The parenthetical "none needed if localhost-only" *is* the decision.

Worth linking where the port is documented: A7's revival condition is "before the server is ever
exposed beyond localhost", so the 127.0.0.1 binding is what keeps A7 dormant.

### 3.6 `REVIEW_UI.md`:122–123 (§6) — keyboard bindings are imprecise.

CONFIRMED, three mismatches against `review-ui/oracle.js`:252–281 and
`src/review-server/oracle-validation.ts`:45–64, 199–208:

- "**1–5 for enums**" — `DIGIT_HOTKEYS` is `1..9,0` (ten) and the live `ground_type` enum binds **1–6**.
- "**undo = one key**" — undo is `u`, `Backspace`, *or* `ArrowLeft`, and `u` is displaced to
  `Backspace` when a question binds `u` as an answer hotkey (probe questions bind `y`/`n`/`u`); the
  footer prints which is live. The intent holds; the literal claim does not.
- `r` releases the round — undocumented.

Correct as documented: multi-select toggles on digits and commits on **Enter or Space** (:263), empty
commit refused (:265), and `validateFixture` refuses a `multi` question binding anything but digits
(:202–208) — so §6's "binds digits and nothing else" is enforced in code, not merely asserted.

### 3.7 `REVIEW_UI.md`:126 — `text_roles` cited as a live multi-select; it is not served.

CONFIRMED. The `kind:"multi"` machinery is generic and built, but `text_roles` is deliberately omitted
from the built round (`oracle-validation.ts`:815–818); `overlays` is the only multi-select served (22
answers). Aspirational as an example, misleading as a pointer.

### 3.8 `REVIEW_UI.md`:24–27 — "a background watcher (**a shell loop** outside the model's context)".

CONFIRMED as imprecise. The watcher is `src/review-server/watch-batch.ts`, a Node script run detached
(the shell wrapper `serverctl.sh` exists separately, for the server). Its header quotes REVIEW_UI §1
verbatim, so the intent is faithfully implemented; only the mechanism is misdescribed.

Accepted flags are `--batch`, `--interval`, `--timeout`. **No document in `research/v3` currently
documents a flag it does not accept** — the known `watch-batch.ts` defect class is clean today (§5).

### 3.9 `V3_PLAN.md`:167, `PREMISE_NEXT.md`:30, `PHASE_0_DECISIONS.md`:298 — "137 artworks × 2 variants" conflates population with run.

CONFIRMED as imprecise. `premise-run-1.jsonl` holds 299 rows (284 work + 15 canary) over **142 distinct
artworks**; `premise-run-1.agreement.json` gives `population.primary = 137`,
`conflicted_truth_excluded = 5`, `images_with_at_least_one_ok_answer = 142`. 137 is the correct
*analysis population* and the right number for agreement figures; "137 × 2" describes a run that
decoded 142. `PREMISE_NEXT.md` §3 (:80) states 142 correctly, so the doc disagrees with itself.
`disambiguation-1` at 30/30 is exact.

### 3.10 `V3_PLAN.md`:9 — "`ORACLE_QUESTION_SET.md` … v2, **group A** piloted and measured".

CONFIRMED as now-incomplete: B, C, D and E have since been piloted (§1.6). Minor because the
parenthetical is descriptive, but it is the companion-document index and reinforces the same wrong
picture.

### 3.11 `PHASE_0_LOOSE_ENDS.md`:224 / `PREMISE_NEXT.md`:189 / `PHASE_0_DECISIONS.md` — small naming and status residue.

CONFIRMED, three small ones:

- `PREMISE_NEXT.md`:189 — "Write to a new output file — `premise-run-2.jsonl`". Actual output is
  `premise-run-cd.jsonl`.
- `PREMISE_NEXT.md` §14 rows 3 and 6 remain unsigned (correctly flagged "not blocking"), but §15.10
  rows **9–14 all still say "needs sign-off"** while the run they gate has already happened (§2.1).
- `PREMISE_NEXT.md` §15.9 presents `kind:"multi"` as an unbuilt option "not to be chosen by this
  workstream"; it was built, and has its own decision record (`d-2026-08-03-oracle-multi-kind`).

### 3.12 `config.py`:194 and `MASK_REVIEW_NOTES.md`:36 cite an analysis file that does not exist.

CONFIRMED. Both cite `data/sam/mask-quality-analysis.json`. The file is absent from disk and untracked;
`analyze-mask-quality.ts`:42–43 would write it (`.json` + `.txt`) but neither is present.

The numbers themselves reproduce exactly from the raw judgments (§5), so this is provenance loss
rather than a wrong claim — but it is a `[REVIEWED]` constant whose stated evidence cannot be opened.

### 3.13 `data/oracle-bakeoff/opus-eval142.jsonl` is an unlabelled artifact in a workstream output directory.

SUSPECTED. 142 rows, schema `{path, answer, confidence}`, no arm / model / run_id / prompt_hash
columns, no producing script, and no mention in the bakeoff README or its arms table. Same
provenance-less shape as `opus-probe-1.jsonl`, which the docs *do* flag as `[n=1, UNCALIBRATED]`.

Nothing marks it non-quotable, and it sits beside the real arms' outputs. Worth either a provenance
header or a README line saying what it is.

### 3.14 `CONVENTIONS.md`:6 — the available-dependency list is incomplete.

CONFIRMED. Root `package.json` also provides **`sharp-modern` (`npm:sharp@0.35.3`)** alongside
`sharp@0.33.5`. All five listed packages are present; `"type": "module"` and TypeScript 5.6.2 are as
documented.

Every v3 import resolves to plain `sharp` (0.33.5), which does register AVIF input
(`sharp.format.heif.input.file === true`), so ":6 AVIF-capable" holds for the package actually used.
The alias is simply undocumented — worth a line, since a repo normally carries two sharps because of a
decode difference, and `CONVENTIONS.md`:41–42 makes header-derived dimensions a hard rule over exactly
the AVIF files where the two versions could differ.

### 3.15 `src/tagging/TAGGING_PROTOCOL.md`:420–424 — "Owed elsewhere" debt is already paid.

CONFIRMED. The paragraph says the judgment/descriptive split and the meta-scope decision "owe a record
in `data/decisions/decisions.json`". Both exist — `d-2026-08-03-tagging-symmetry-scoping` and
`d-2026-08-03-tagging-meta-scope` — and both cite the 13 reviewer note ids.

### 3.16 `data/legacy/README.md`:312 — "the three files are disjoint by standing grade" overstates.

CONFIRMED. On (contentSha256, roleSignature), `endorsements ∩ acceptable` = **31** keys, and
`acceptable.json` holds **9** entries whose `standingGrade` is `"strong"`.

The claim that matters — good-tier ∩ **known-bad** = 0 — is exact (§5), and that is the one the
known-worse gate depends on. The overstatement is confined to the two good tiers, where overlap is
harmless (both feed the concordance dashboard). Worth correcting because a consumer could reasonably
read "disjoint" as licence to concatenate the three files.

Same README, :441–443, claims `meta.matchSemantics` was deliberately *not* rewritten. It was — all
three fixtures were regenerated 2026-08-03 13:14 and now carry the frozen-bar wording. Harmless, and
in the direction of the fix, but the sentence describes a decision that was reversed.

### 3.17 The holdout freeze pins the census's pair count but never its arm list.

CONFIRMED as a robustness gap rather than a drift. `PHASE_0_DECISIONS.md`:239–241 says the census
takes the union over three named embedding arms at cosine ≥ 0.95, and `freeze-holdout.ts` genuinely
asserts zero crossing edges on every run.

But the *arm list* is never asserted against a pinned constant: `NEAR_DUP_ARM_CRITERION`
(`freeze-holdout.ts`:79) is a doc string, and the census sha256 is computed and recorded (:843) but
never compared. The only identity pin is `EXPECTED_CENSUS_UNION_PAIRS = 6386` (:114).

So a census silently swapped to a different arm set with the same pair count would pass every check.
This matters more than it looks: C3 makes a holdout re-roll authorisation-gated and reviewer-only,
and the component rule is one of the three things C3 names as re-rolling it. The guard against an
accidental re-roll is currently a pair count, not the rule itself.

### 3.18 Selftest assertion counts are quoted and drifting.

SUSPECTED (not verified by execution — no runs performed). `oracle/premise/README.md`:190 says
`selftest.py` has "**31 assertions**"; the file is now 43 KB and covers the probe files, the bcde
schemas, llguidance grammar compilation and 13 pinned prompt hashes. Ladder README:32 ("60 model-free
assertions") prints its count dynamically at `selftest.py`:284 and is self-correcting; bakeoff
README:237 ("43 model-free assertions") prints none.

---

## 4. Cross-doc contradiction index

Where two in-scope documents assert different things about one fact. Listed separately because each is
a place a reader can be misled without either document looking wrong on its own.

| fact | doc A | doc B | who is right |
|---|---|---|---|
| tagging vocabulary exists | `REVIEW_UI.md`:151 "Built 2026-08-03" | `PHASE_0_LOOSE_ENDS.md`:308 "undrafted" | REVIEW_UI (§1.7) |
| tag counts | `REVIEW_UI.md`:151 "66 / 33 / 8" | `TAGS.md`, `TAGGING_PROTOCOL.md` §2 "103 / 48+7 / 12" | the protocol (§1.8) |
| SAM threshold + mask validation | `V3_PLAN.md`:171 "uncalibrated, no mask validated" | `PHASE_0_LOOSE_ENDS.md`:74, :102 "CLOSED" | the ledger (§1.5) |
| groups B–F piloted | `ORACLE_QUESTION_SET.md`:5, :61 "unpiloted" | same file, Appendix R :817, :831 | Appendix R (§1.6) |
| BCDE validation round built | `PREMISE_NEXT.md`:1123 "NOT built" | `PREMISE_NEXT.md`:1223 "BUILT AND PUSHED" | :1223 (§2.13) |
| composer built | `PHASE_0_LOOSE_ENDS.md`:295 "unbuilt" | `src/review-server/README.md`:997 "working end to end" | the README (§2.4) |
| completion watcher, amendments, calibration-absolute | `PHASE_0_LOOSE_ENDS.md`:301 "unbuilt" | `src/review-server/README.md`:996–997 | the README (§2.6) |
| coverage-aware stopping | `REVIEW_UI.md`:129 (stated as fact) | `src/review-server/README.md`:1006 "Not built" | the README (§2.7) |
| ladder work rows | `PHASE_0_DECISIONS.md`:352 "2,913" | same section :372–378 (codec-control bullet) | 3,088 (§2.15) |
| candidate arithmetic | `PHASE_0_DECISIONS.md`:231 (3,097 → 2,757 via 324) | `COVERAGE_SET.md`:23 (incl. 16 thumbnail-only) | COVERAGE_SET (§2.14) |
| premise-run-1 size | `PREMISE_NEXT.md`:30 "137" | `PREMISE_NEXT.md`:80 "142" | both, different quantities (§3.9) |
| SAM concept set | `ORACLE_QUESTION_SET.md`:614/:751, pipeline §8.3, `config.py`:63, `model-manifest.json` | `config.py` `CONCEPT_PROMPTS` (v2.1) | the tuple (§1.2, §2.9) |
| APCA identical-colour ceiling | `PHASE_0_DECISIONS.md`:161/:421, `V3_PLAN.md`:163, `constants.ts`:168, +3 code sites "1.9815" | `constants.ts`:160 = **1.98152**; `PHASE_0_LOOSE_ENDS.md`:57 agrees | the ledger (§1.9) |
| challenger eval-142 coverage | `PHASE_0_DECISIONS.md`:424, `PHASE_0_LOOSE_ENDS.md`:211 "gold-30-only" | `qwen3-32b-dense.jsonl` + `run.qwen32b.eval142.log` (exit 0, 14:29) | the disk (§2.1b) |
| ladder population | `PHASE_0_DECISIONS.md`:352 "1,225 comparisons" | `ladder_comparisons_total` 1,431 / primary 1,190 | the analysis (§2.15) |

**Pattern worth naming:** in every case where a *workstream README* disagrees with the *ledger*, the
README is right. The READMEs are maintained by the workstream that owns the code; the ledger was
compiled once, from outside, on one day. A ledger row asserting that someone else's code is unbuilt
should be checked against that workstream's own README before it is written — and again before it is
trusted.

---

## 5. Verified clean

Checked and found accurate. Recorded so a later reviewer does not re-spend the effort.

| claim | source | verdict |
|---|---|---|
| A1 codec-control closure | `PHASE_0_LOOSE_ENDS.md`:24–29 | **exact** — `ladder-sample-1.analysis.json` was regenerated over three result files and reports `codec_control_same_size` ground_type 0.9029 / field_texture 0.9223 / enclosure 0.9612 / shading_geometry 0.8571, n = 206/206/206/63. The worry that V3_PLAN's pointer sends readers to `n = 0` does **not** apply |
| B8 §14 sign-off closure | `PHASE_0_LOOSE_ENDS.md`:247–252 | **every clause true** — `PREMISE_NEXT.md`:623 row 4 SIGNED OFF, :624 row 5 SIGNED OFF "as RULES, skimmed", :626 row 7 DONE; §7 (:229–256) reads "settled 2026-08-03" and defers to §14 |
| A10 cascade numbers | `PHASE_0_LOOSE_ENDS.md`:168–181 | **all nine match** `cascade-sim-1.json` — 0.9767, 43/137, 43/69, 0.6977, 0.9489, 0.1898, 17.48 h vs 28.01 h, 0.9489 vs 0.6423 |
| A12 CJK numbers | `PHASE_0_LOOSE_ENDS.md`:195–208 | **exact** — `chinese characters` fires on exactly the 4 CJK covers, 0 FP, max 0.4720, none ≥ 0.578; `kanji` clears 0.578 on exactly the two Japanese covers (0.6048, 0.6418); `barcode` 0.9397 with 0 FP; `text` 0/16 |
| A6 calibration numbers | `MASK_REVIEW_NOTES.md`:36–45 | **re-derived from raw judgments** (60/60, joined to `mask-quality-sample.json`): optimum 0.577937, precision 0.9062, recall 0.6905, J 0.5140; weighted 0.643816, J 0.3732. All 3 hallucination-signature rows answered *no* and score below the cut |
| A7 symlink/realpath closure | `PHASE_0_LOOSE_ENDS.md`:119–121 | **fixed** — `batch.ts`:255–260 `isInsideReal()` realpaths root and candidate; `server.ts`:2025–2027 realpaths static serving |
| §7 resolution floors | `PHASE_0_DECISIONS.md`:353–358 | **every cell matches** the current analysis; transfer check 0.834 predicted / 0.814 matched-contrast / 0.818 observed (n = 644) matches |
| `DEFAULT_AGREEMENT_FLOOR` | `PHASE_0_LOOSE_ENDS.md`:46–52 (A2) | **0.85 confirmed** at `analyze.py`:76, correctly described as an uncalibrated CLI flag (`--agreement-floor` exists) |
| premise-run-1 agreement table | `PREMISE_NEXT.md`:36–41 | **cell for cell** — A κ 0.21 / B κ 0.311; unmapped 60 / 43; `full_scene` 50 / 38; mapped κ 0.446 / 0.4835; flag 14/24 |
| probe-gold round | `PHASE_0_DECISIONS.md`:333 | **exact** — 13/30 = 0.4333 against `noiseFloor` 0.63; binary 16/20; unsure 1/180 |
| 729-row derivation table | `ORACLE_QUESTION_SET.md`:426, `PREMISE_NEXT.md`:572 | **exactly 729 entries**, sha256 `da67d5eb…2fc5` as documented |
| prompt-hash identity tables | `PREMISE_NEXT.md`:209–215, :761–776 | **recomputed for C, D, E, F — all four match**, lengths 3286/3301/6092/5749 |
| disambiguation tiebreak 14/10/6 | `PHASE_0_DECISIONS.md`:320 | **matches** `premise-disambiguation-1-analysis.json`; `skipped.superseded: 2` explains the 32-rows-for-30-items gap |
| "~495 records" old warehouse | `V3_PLAN.md`:52 | **exact** — `research/v2-3-eval/data/verdicts.jsonl` is 495 lines; corroborated by `endorsements.json` `meta.counts.recordsRead = 495` |
| 554 palettes / 3,221 role pairs | `V3_PLAN.md`:164, `PHASE_0_DECISIONS.md`:401 | **exact** — 37 known-bad + 351 endorsements + 166 acceptable = 554 |
| three legacy fixtures | `V3_PLAN.md`:170 | **exact** — 37 / 351 / 166 |
| warehouse record types | `REVIEW_UI.md`:33–34 | **exact closed union** vs `src/warehouse/records.ts`:38–46; calibration is `mode:"absolute"` on a verdict, tags live on `note.tags` |
| gradient display mapping | `REVIEW_UI.md`:78–83 | **exact** vs `gradient.ts`:6, 22, 29, 41, 49 (also carries an undocumented `GRADIENT_DISPLAY_ANGLE_DEGREES = 135`) |
| §15.9 rationale cited by REVIEW_UI §6 | `REVIEW_UI.md`:127 | **exists and says that** — `PREMISE_NEXT.md`:1178 |
| §4 corpus-wide gate | `PREMISE_NEXT.md`:142–152 | **no competing numbers anywhere** — `ORACLE_QUESTION_SET.md`:764–766 defers to it; `PHASE_0_DECISIONS.md` §6 states no gate |
| **all CLI flags in all four oracle READMEs** | ladder / premise / bakeoff / PREMISE_NEXT | **no missing-flag instance found** — incl. `--include-duplicate-sizes`, all eight `preflight.py --stage` values, every `--prompt-set` key, `run_bakeoff.py`, `supervise.sh`, `build-manifest.ts --verify` |
| SAM script names, overlay dirs, record fields | `PROBE4_NOTES.md`, `PROBE5_NOTES.md`, `VOCAB_PROBE_NOTES.md` | **all verified** — 8 probe-4 sheets, 11 overlay jobs + selection, 13 amendments, 32 probe-5 rows, `sam-eval-142` = exactly 142 image rows |
| bakeoff selftest reproduction | `oracle/bakeoff/README.md`:229–233 | **matches** `scores.txt`, which ends "SELF-CHECK against the published gold-30 analysis: PASS" |
| tag vocabulary internals | `TAGGING_PROTOCOL.md` §2 | 103 / 12 / 96+7 and every per-axis count **exact** |
| tagging tooling + §8 numbers | `TAGGING_PROTOCOL.md` §3–§8 | **all clean** — every path, script, flag, report key, derived-record shape, test name, and the 13 entries / 22 tags / 0 zero-tag / 0 unsure fixture with per-axis 5/5/3/9 |
| reviewer-note port counts 4 + 6 + 3 = 13 | `PHASE_0_LOOSE_ENDS.md`:346–348 | **exact as of writing** — see §2.8(c) for why it is now behind |
| NUL-byte sweep | `PHASE_0_LOOSE_ENDS.md`:376–377 | **confirmed** — zero hits across all `.ts/.js/.py/.md/.json` in `research/v3`; `grep -P` works here, so `CONVENTIONS.md`:58's recipe is valid |
| toolchain | `CONVENTIONS.md`:3–5 | `"type":"module"`, typescript 5.6.2, all five named deps present |
| COVERAGE_SET.md internal arithmetic | whole document | **closes** — 6,906 + 2,757 = 9,663 − 413 − 18 = 9,232 = 6,888 + 2,344; all 9 declared checks pass |
| **every frozen same-color-bar digit** | `PHASE_0_DECISIONS.md`:87–90 | **exact against `src/contract/constants.ts` and `bracketing-round-2-analysis.json`** — DN 0.00932 (CI 0.00764–0.01137) · DS 0.01502 · LN 0.01627 · LS 0.02293 · pooled 0.01535 (n=120) · boundaries L 0.55 / C 0.05. `oneThresholdSurvives = false`, and both ends genuinely exclude the pooled value. **No digit mismatch anywhere** |
| `sameColorBar()` exists | `PHASE_0_DECISIONS.md`:90 | `src/contract/color.ts`:237 (two args rather than a pair object — cosmetic) |
| 156 answers / 63% repeats / clean controls | `PHASE_0_DECISIONS.md`:84 | **156** = `d-2026-08-03-same-color-bar-freeze.fundedBy` length, = 72 (`bracketing-round-1-clarified`) + 84 (`bracketing-round-2`) in the warehouse; repeats 0.625 → "63%"; controls 4/4, 2/2, 4/4, zero failures. *Nit:* 156 are the **answers funding** the fit; the **fitted points are 120** — "156 fitted answers" reads as the latter |
| accent visibility 0.0744 | `PHASE_0_DECISIONS.md`:95, :416 | 0.07444338, `separated: true`; §3's CI and §8's band are two different, correctly-named statistics (§6) |
| calibration-consequence flips | `PHASE_0_DECISIONS.md`:402–404 | **exact** — 554 / 3,221 pairs; 0 low-end flips, 2 high-end, 0 hue-split; **both high-end flips are on endorsed palettes** (`9e05a75cd6956ca0`, `13d692cd730368d0`, same `#fc8831`/`#fa7b34` pair at 0.02975) exactly as the argument claims |
| hue-split 0.03805 "middle of a gap" | `PHASE_0_DECISIONS.md`:407 | **exact** — `separationInterval` 0.03211–0.04509, threshold = its geometric mean |
| anisotropy 4/4 · 2/4 · 1/4 | `PHASE_0_DECISIONS.md`:411 | **exact** at the fixed 0.01500 probe (pooled curve predicts 51%) |
| **all §5 holdout counts** | `PHASE_0_DECISIONS.md`:230–253 | **every one exact** vs `holdout.json` / `near-dup-census.json` — v2.0.0, seed `0x5ea1f00d` `[HELD]`, 413 artworks / 1,073 files / 14.9801%, 1,712 distinct images, 254 components (14.8364%), 224 of 414 leaked in v1, 46.3% undercount, 12 quarantine ids, 0 crossing edges asserted on every run (`freeze-holdout.ts`:735–740, outside the `verifyOnly` branch) |
| **all §5 legacy counts** | `PHASE_0_DECISIONS.md`:268–286 | **every one exact** — 36 pairs with >1 distinct grade (recomputed), 6 involving a bad grade, 0 identical-timestamp conflicts, 37 hard-gate entries with no warn tier, good-tier ∩ known-bad = 0, 3 in / 3 out |
| 797 PNGs / 324 square transparency | `PHASE_0_DECISIONS.md`:36–43 | **exact** vs `pixel_results.json`; all 324 confirmed single-rendition |
| 13/15 repair relocation, 27 P5 notes, 0/114 dither | `PHASE_0_DECISIONS.md`:130, :191, :108 | all three trace to their v2-3 sources |
| ε placeholders | `PHASE_0_DECISIONS.md`:419–421 | `EPSILON_TEXT_RAW` / `EPSILON_ACCENT_RAW` both 2.5, both `[UNCALIBRATED]`, both docblocks state the corpus run has not happened — A3 accurate |
| invariant 2 deferral | `PHASE_0_LOOSE_ENDS.md`:65–73 | `types.ts`:312 `TODO [v3 Phase 1]` present; deferral machinery real (see §2.17 for the one inaccurate clause) |
| InternVL3.5 blocked | `PHASE_0_LOOSE_ENDS.md`:216–221 | **accurate** — `oracle/bakeoff/config.py`:82–84; mlx-vlm 0.6.8 has no `internvl` module, its only implementation is dense-only, both size-appropriate 3.5 checkpoints are MoE |
| 212 `fundedBy` ids on the question-set freeze | `PHASE_0_DECISIONS.md`:344 | **all 212 resolve** against the warehouse; 0 missing, 0 non-id entries; 180 `oracle-probe-gold-1` + 32 `oracle-premise-disambiguation-1`. `CONVENTIONS.md`:63's "warehouse record ids and nothing else" is honoured |

---

## 6. What this arm did not check

- **Semantic correctness of any instrument.** This arm asked only "does the document describe what is
  on disk", never "is what is on disk right". §1.1's adverse C/D result is reported as *unreported*,
  not as adjudicated — whether it should move rule 6 or the freeze is the reviewer's call.
- **Two `[MEASURED]` percentage ranges in §1 are unverifiable as stated, and are left open.**
  `PHASE_0_DECISIONS.md`:38 describes disc scans as "~26–31% transparent" and cutouts as "59–89%".
  `data/source-surveys/pixel_results.json` supports the counts (797 real-transparency PNGs, 324
  square) but its actual transparent-fraction range is **0.40%–100%**; 184 files fall in 26–31% and
  282 in 59–89%. These read as visual-inspection cluster descriptors rather than bounds. The
  *policy* they justify (exclude all real-transparency files) does not depend on them, so this is a
  provenance-precision issue, not a decision risk — but a reader would take them for measured bounds.
- **A 7-file discrepancy nobody explains.** The pipeline spec (:498) counts **980** PNGs in
  `music-artworks/`; `pixel_results.json` checked **973**. Neither artifact accounts for the gap.
- **Whether the two demo batches should be excluded** from any corrected warehouse count (§1.4).
- **Execution of any test suite.** Test *existence* was verified throughout; nothing was run, so
  §3.16's assertion-count drift is SUSPECTED rather than confirmed.

Two gaps flagged in an earlier draft of this file are now **closed, and both resolved in the docs'
favour** — recorded because the near-misses are instructive:

- **The §3-vs-§8 accent-visibility interval is not a contradiction.** §3's "CI 0.052–0.106" is
  `.part2.fit.confidenceInterval` (the logistic 95% CI); §8's "0.06300–0.08796 band" is
  `.separationInterval` (the complete-separation gap). Both live in the same fit object, both are
  correctly named in their own sentences, and 0.07444 is the **geometric mean of the gap**
  (√(0.06300·0.08796) = 0.074446, exact to five digits). Ledger B11's "bracketed, not pinned" is the
  right reading. Two different statistics of one measurement, not one statistic reported twice.
- **The `d-2026-08-02-legacy-contested-pairs-recency` empty `fundedBy` is correct**, not an instance
  of §2.8's gap: its `fundingCaveats` states the decision was given conversationally, which is
  exactly the case `CONVENTIONS.md`:66 says must carry an empty `fundedBy`.

---

## 7. The one process fix this suggests

Most findings here are **one-day-old staleness**: a document written on the morning of 2026-08-03
describing a repository that changed that afternoon. The conventions already have the right instinct —
`CONVENTIONS.md`:60–68 requires a *record* for anything later work may assume, :69–71 a *ledger entry*
for anything deliberately open.

What has no rule is the third case: **a summary sentence that was measured, was true, is cited, and
silently expires.** `V3_PLAN.md`'s "434 records", `REVIEW_UI.md`'s "66 tags",
`PHASE_0_LOOSE_ENDS.md`'s "35 items" and `PHASE_0_DECISIONS.md`'s "2,913 work rows" are all the same
failure — a number a document computed about an artifact that kept growing.

Offered to the housekeeping workstream rather than applied here: any count quoted in a governing
document either **(a)** carries the timestamp it was measured at — "434 records as of
2026-08-03T10:12Z" is honest and self-invalidating where "434 records" is not — or **(b)** is replaced
by the query that regenerates it. The warehouse CLI already makes (b) trivial for its own counts.

And a second, cheaper one, from §4's pattern: **a status claim about code another workstream owns
should cite that workstream's README, not assert independently.** Every one of this report's
built-vs-unbuilt inversions would have been caught by that single rule.
