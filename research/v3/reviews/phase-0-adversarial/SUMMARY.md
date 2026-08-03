# Phase 0 adversarial review — consolidated summary

**Nine reports, one fleet, 2026-08-03.** Each arm re-derived the numbers in its scope from raw data
with code it wrote itself, never by re-running the script that produced the published figure.

Files summarised here, all in this directory:
`contract.md` · `warehouse-decisions.md` · `review-server.md` · `embeddings-corpus.md` ·
`premise-analyses.md` · `sam.md` · `docs-drift.md` · `cascade-basis.md` · `unrealized-ideas.md`

Every claim below cites the report file and the finding number inside it, so anything can be looked
up without re-reading nine documents.

---

## 1. Verdict

**The arithmetic held. The paperwork did not.** Nine independent attempts to break Phase 0's
published numbers found, over and over, that the numbers are right. The APCA contrast function is
byte-for-byte identical to the reference package over 665,536 colour pairs, with zero sign
disagreements (`contract.md` S1). All four frozen same-colour bars, the pooled bar and the accent
distance re-derive from the raw reviewer answers to five decimal places, with a fresh implementation
of the fitting maths (`contract.md` S4). All six embedding models' retrieval scores reproduce to
sixteen significant digits from the stored vectors (`embeddings-corpus.md` NEGATIVE-3), and the
holdout set is genuinely leak-proof — all 62 near-duplicate edges that touch a held-out artwork land
on the twelve artworks already quarantined, and each of those twelve was independently confirmed
ineligible (`embeddings-corpus.md` NEGATIVE-1). Every cell of every SAM probe table recounts exactly
(`sam.md` "Confirmed clean"), the mask compression was cross-checked in both directions against the
reference library over 455 real masks with zero mismatches, and every numeric field of the bcde
validation analysis was reproduced by a complete independent reimplementation — zero disagreements
(`review-server.md` "What held under attack"). Every published number in the VLM premise workstream
reproduces, with one fourth-digit rounding artefact (`premise-analyses.md`, bottom line). Where the
fleet did find failures, they are failures of **enforcement** (rules stated but not checked in code),
**provenance** (numbers whose stated evidence cannot be opened), **claim-scoping** (a true statistic
attached to the wrong slice or the wrong question), and **doc-sync** (documents describing a
repository that changed the same afternoon). Three findings are different in kind — they refute
substance, not bookkeeping: (1) the "32/34" figure behind the take-D cascade policy is not a
`multiple_distinct_fields` statistic at all and is scored against the one truth source the reviewer
has already barred from counting as accuracy (`cascade-basis.md` VERDICT); (2) the contract's
straddle-rule tie-break is presented as measured, the study exists nowhere in the repository, and on
independent replication the result reverses (`contract.md` F1); and (3) the SAM decision that "no
area guard is needed" is circular by construction and is falsified by a mask in its own round
(`sam.md` finding 1). One further item is not a defect at all but the most consequential thing the
fleet found: a pre-registered experiment was run, its result is adverse, and no document says so
(`docs-drift.md` §1.1).

---

## 2. Tier 1 — changes what we believed

Ranked by how much it moves a live belief. Every item here contradicts something a document
currently asserts or something a decision currently rests on.

### (a) The criterion arm ran, and its result is adverse — while every document says it is unrun
`docs-drift.md` §1.1 (critical).

The C/D variant arm exists for one purpose: to separate "the wording changed the answer" from "the
question order changed the answer" — the confound the frozen question set rests on. Four documents
say it has not been run (`PHASE_0_DECISIONS.md`:329, `PHASE_0_LOOSE_ENDS.md` B4, `PREMISE_NEXT.md`:3
and :10, `ORACLE_QUESTION_SET.md`:718–721 with its "Until then"). The run is on disk:
`premise-run-cd.jsonl`, 299 rows, 142 images, all complete.

| readout | A-vs-B (the frozen instrument) | C-vs-D (the deconfounder) |
|---|---|---|
| how often two wordings give the same answer | 0.708 | **0.4599** |
| agreement with the accepted-palette flag | A 0.21 / B 0.311 | C 0.126 / **D 0.392** |
| share of answers the vocabulary cannot map | 44% / 31% | **0% / 0%** |

Two consequences, neither written down anywhere. The pre-registered gate had two halves: the
unmapped-share half **passed outright** (0% against 31–44%), which is a large favourable result
nobody has reported; and the secondary criterion **failed hard** — C and D were supposed to land
within about five points of each other and instead agree on 46% of artworks, worse than A agrees
with B. Two wordings that keep B's ordering do not reproduce B, which is evidence *against* the
ordering hypothesis that C/D was pre-registered to confirm. No GPU work is needed; only the write-up
is missing.

### (b) The cascade policy's evidential basis is refuted
`cascade-basis.md` VERDICT, §1, §2, §3; corroborated independently by `premise-analyses.md`
finding 6.

The claim put to the reviewer was "D's `multiple_distinct_fields` is 32/34 right corpus-wide,
p = 2.3e-7". Both halves fail.

- **Wrong slice.** 32/34 is D's *pooled non-shaded* class — `flat_field` (14/15) plus
  `multiple_distinct_fields` (18/19). Forty-four percent of those 34 are a different answer value
  from the one the policy gates on. No `multiple_distinct_fields` slice has n=34 under any reading:
  corpus-wide it is 19 items, on the policy's own slice it is 8. The correctly-scoped p-value is
  1.1e-4, roughly two thousand times weaker than the one quoted (`cascade-basis.md` §1, §3.4).
- **Wrong truth.** Every "right" in 32/34, 18/19 and 8/8 is scored against the published
  accepted-palette gradient flag — the palette-conditional signal Appendix R rules must "never be
  called accuracy", with reviewer-elicited labels binding as the primary judge. Reviewer labels are
  loaded into the analysis rows and then never used in the scoring (`cascade-basis.md` §2).
- **The flag is not a usable stand-in.** On the 24 items where both exist, flag and reviewer agree
  14/24 with a chance-corrected agreement of 0.06 — essentially independent. Variant D itself is the
  worst arm against the reviewer of every arm measured (`cascade-basis.md` §2).
- **The one primary-judge datapoint on the policy slice points against the policy.** Of the 8 items
  the policy would commit, 1 has a reviewer answer; the reviewer answered `pattern_or_texture`,
  agreeing with B and *not* giving D's answer (`cascade-basis.md` §2).

What survives and should not be discarded: the arithmetic reproduces to the digit; the separation
between D's shaded and non-shaded vocabulary is real under a properly specified test (Fisher
p = 6.2e-9); and B-vs-D is a clean wording contrast — same model, same weights, same images
(`cascade-basis.md` §5).

### (c) Review blinding is 100% defeatable, and the salt cannot fix it
`review-server.md` CR-1 (critical).

`blinding.ts` claims both pushed orders "stay exactly equally plausible from served data". They do
not. The salt closed the hash-reconstruction channel; it does not close the **content** channel,
because the page must show each side's full palette for the reviewer to judge it. Demonstrated on a
private instance with a 24-item two-arm batch shaped like the planned Phase 2 comparison (one arm
flat, one arm gradient): the shuffle genuinely swapped 14 of 24 sides, and a one-line rule — "the
side with a gradient is arm-beta" — recovered **24 of 24**. Other served fields carry the same
exposure: stop count, both collapse flags, the gradient geometry in the CSS, and the raw float form
of stop positions, which is never rounded or canonicalised. The instrument has never carried a real
arm comparison, so this is not merely unmeasured — it is unmeasurable from anything in the
repository today, and it first applies on the round that matters most.

### (d) SAM's A6 closure is circular *and* falsified by its own round — A6 must reopen
`sam.md` finding 1 (critical); the same sentence is listed as verified-clean in `docs-drift.md` §5
(see reconciliation note R7).

"All 3 hallucination-signature masks fall below the cut, so no area-fraction guard is needed" cannot
produce a counterexample: a "hallucination signature" is *defined* as area above 0.5 **and** score
below 0.5, so such a mask is below any cut at or above 0.5, and the verdict is computed only over
that force-included subset. The claim carries no information.

The same 60 masks contain the counterexample. Five masks in the sample have area above 0.5; the
reviewer rejected all five; one of them scores 0.6787 and **clears the calibrated cut with room** —
one of only three false positives at that cut. Corpus-wide, six regions with area above 0.5 survive
the cut, and none of them could ever have been force-included. The counterexample was actually
computed by the analysis script (`bigAreaRows`, emitted as `wholeSampleBigArea`) and then never
reached the verdict string — and the verdict string is what was copied into all three documents.

### (e) Per-group SAM thresholds *are* justified by the analysis's own gates
`sam.md` finding 2 (major); corroborated by `docs-drift.md` §2.11.

"The concept groups did not separate, so no per-group threshold is justified" is a property of how
the test is written, not a measurement. Re-derived: the text-like group's own best cut is 0.697
against the pooled 0.578 — a separation of 0.119 against a required 0.05, and a quality gain of
0.1196 against a required 0.05. Both gates pass. The only failing condition is structural: the
person-like group's own best cut *is* the pooled cut, so its gain is necessarily zero, and the rule
requires **every** group to gain. With two groups, one of which always defines the pooled cut, the
per-group test can never pass.

What it costs: at the pooled cut, text-like runs 0.875 precision / 0.609 recall; at its own cut it
runs **1.000 precision** / 0.478 recall. Text-like is 86% of all regions and 83% of everything that
clears the cut — so the group where a second threshold is warranted is nearly the whole instrument's
output. This is also where the known CJK problem (A12) lives: the `chinese characters` prompt finds
all four CJK covers with zero false positives and tops out at 0.4720, below the cut.

### (f) The reviewer's own validation answers break their own registered ceiling by four times, unreported
`review-server.md` CR-2 (critical).

`PREMISE_NEXT.md`:1047 pre-registers "total contradiction rate ≤ 10% of ok rows" as the bar for
gate-consistency. Recomputed from the raw warehouse records for the bcde validation round (20
artworks, all four gate pairs served in one sitting): 9 contradictions across 8 distinct artworks —
**40% of rows against a 10% ceiling**. Rule #9 alone accounts for 5: the reviewer said there is no
dominant subject and then named a subject kind anyway. The `subject_kind` answers contain **zero**
uses of the "not applicable" option despite five occasions where its own gate said none.

The published analysis computes no gate-consistency section at all. This is the human reference
standard the model is to be judged against, and it is internally inconsistent by four times the bar
set for the machine. This is an elicitation-design finding, not a reviewer-competence finding: the
plausible causes are gate-pair wording, question ambiguity, and a by-question pass structure that
lets the same artwork be answered from different framings minutes apart at a ~2.9-second median.
Whatever the reading, it must be on the record before any model is graded against these rows.

### (g) "42 of 45 pre-registered bars passed" is 35 of 36 as registered
`premise-analyses.md` finding 3 (major).

Nine of the 45 pass/fail verdicts were never registered as pass/fail. Four are "a value that fires
zero times is *reported* as possibly unanswerable" — a reporting obligation converted into a hard
verdict. Five are the section's own priors, which the source document labels "stated as priors and
not as measurements" under a column headed "what would be alarming" — and the analysis script's own
constant comment agrees in writing that each is "a flag, not a pass/fail of the schema", four lines
above the code that issues five pass/fail verdicts on them.

Evaluated as registered: **35 pass / 1 fail out of 36 bars**, plus 9 report-only observations. Both
the numerator and the denominator were inflated. Separately, 2 of the 3 published failures are one
fact counted twice — `illegible_at_this_size` fires zero times in the entire run, which trips two
different verdicts. The single genuine failure of a genuine bar is `has_signature_color`'s
degeneracy. No measurement changes; what changes is what the sentence means to a reader who has not
opened the pre-registration.

---

## 3. Tier 2 — instrument defects to fix before further reliance

Grouped by the workstream that owns the fix. Severity as the originating report assigned it.

### Warehouse — the ground-truth ledger (`warehouse-decisions.md`)

- **F1, critical — 290 phantom pending items.** `warehouse status` counts an oracle round's reviewed
  items by image id, on a stated assumption ("the image id *is* the batch's item id") that is false
  for every multi-question batch. `oracle-probe-gold-1` is 180/180 answered and released; status says
  150 pending. `bcde-validation-1` is 160/160 answered; status says 140 pending. No future answer can
  ever close them — there are only 30 and 20 images. The failure is silent, permanent, and invents
  reviewer work rather than hiding it. Second-order: `pending` is meaningless across batches, because
  two incompatible item-count conventions (images vs images×questions) coexist with nothing
  distinguishing them.
- **F2, critical — the amendment field allowlist is checked at one door only.** The rule is that an
  amendment may revise a *judgment* but never what the record was *about*. The allowlist is enforced
  inside `verifyAmendment`, which `append()` skips when asked to; `resolve()` re-applies patches with
  no check at all. Demonstrated on a scratch copy: one hand-appended line rewrites a verdict's
  artwork path, item id and palette hash at query time, validating cleanly. There is no `fsck` — the
  CLI reports orphan amendments and nothing else.
- **F3, major — `recheck` cannot see the reviewer changing their mind.** The gate watches amendments,
  which are the channel the reviewer has *never used* (all 13 are agent-authored note retractions);
  it ignores supersession, which is the channel the reviewer *does* use (re-answering). Six
  already-superseded records are cited as funding evidence across two decisions; `recheck` reports
  flagged=0. The science is unaffected — both analysis scripts drop superseded answers before
  fitting — but the ledger's own arithmetic is wrong: "156" and "212 reviewer answers" are 152 and
  210 standing.
- **F4, major — retracted evidence funds decisions silently.** Staleness is computed as "amendments
  dated after the decision", so a retraction that *predates* the citation is filtered out and
  `retracted` is never read. Citing evidence that was already withdrawn is the one case the gate is
  guaranteed to miss. Latent today; pointed straight at the next planned move (C5 puts exactly this
  class of note id into `fundedBy`).
- **F5, major — 2 of 9 recorded evidence hashes are already stale**, both from ordinary housekeeping
  inside a single day, both benign in substance — including the analysis file the question-set freeze
  rests on, regenerated four hours after the freeze. Nothing recomputes them.
- **F6, major — the ground-truth ledger contains demo data, and it is 100% of the verdicts.** Eight
  smoke-test verdicts authored as human/flo, with real artwork paths and real-looking comments, are
  every verdict record the warehouse contains. `status` reports `verdicts=8` with no marker; the
  honest answer to "how many reviewer verdicts exist in v3" is zero. Any Phase 1/2 grade analysis
  selecting `type == "verdict"` ingests eight fabricated judgments as ground truth.

### Contract — the output contract (`contract.md`)

- **F1, major — the straddle rule's "measurably most stable" tie-break.** The study is nowhere in the
  repository: no script, no seed, no output, no decision record; grepping every digit in its table
  returns only the comment itself. Reimplemented across 16 configurations, the documented ordering
  replicates in 1 of 16 for one statistic and 0 of 16 for the other, and the modal outcome is the
  opposite of the documented one — the midpoint rule is the most stable, which is exactly the result
  the comment says was expected and did not happen. Nothing downstream is wrong today (no calibration
  pair straddles a boundary), but a future round would reason from a premise that cannot be checked.
  The rule may well be right on its safety argument alone; the sentence claiming measurement should
  be struck or the study committed with its seed.
- **F2, major — `minTextContrast` against gradient stops is specified and enforced nowhere.** §2
  defines the parameter as covering "every published stop"; the enforced pair list contains four
  entries and none involves a stop. Constructed and confirmed passing: a palette whose text is
  invisible against half its own gradient publishes clean. Invariant 3 does not catch it, because the
  two colours are legitimately distinct in colour while being at zero luminance contrast — the one
  thing invariant 4 exists to forbid.
- **F3, major — both epsilon floors and the accent distance are unpinned by the tests.** Mutating the
  accent epsilon from 2.5 to 9.0 survives the whole suite; so do 2.4 and 2.9 on the text epsilon and
  0.06 on the accent distance. The only asserted bounds are structural, leaving a fivefold window in
  which the entire zero-contrast floor can move undetected. Root cause is mechanical: every normally
  built test fixture's declared contrast block is manufactured by the code under test, so an epsilon
  edit moves all fixtures in lockstep. The planned corpus measurement (A3) will land with no test
  able to tell whether it landed correctly.
- **F4, major — the accent visibility 95% interval is an artefact of the fitting penalty.** The ten
  accent points are perfectly separated; the script correctly substitutes a geometric midpoint for
  the threshold and then still emits a confidence interval computed from the penalised curve.
  Sweeping the penalty moves the interval's width by 2.4×, non-monotonically, and removing it makes
  the interval unbounded. It is a property of the penalty constant, not of the reviewer — and it is
  the number quoted in `PHASE_0_DECISIONS.md` §3.
- **F5, major — invariant 5 is silently skipped when no transparency report is supplied**, and a
  committed test asserts that its non-execution goes unreported. For an invariant whose whole
  statement is "transparent input refused loudly, never silently flattened", a caller that forgets
  the option gets a clean pass.
- **F6, major — the two central threshold comparisons' strictness is untested.** Both "at or above
  the bar" comparisons survive mutation to "strictly above". These are not equivalent mutants: the
  override hook that exists precisely so a future round can sweep the threshold distinguishes them,
  and no test uses it that way.

### Review server — the review instrument (`review-server.md`)

- **MA-1, major — `verify-live` passes with zero failures while four of five released oracle rounds
  have a dead adjudication link.** The crawler visits each batch's payload but never the JSON the
  post-release page loads. Measured live: `/api/oracle-review/<id>` returns 404 for four of the five
  released rounds, while the dashboard — the reviewer's single documented entry point — offers all
  five. Also uncrawled: `/api/queue`, called first by two pages; if it broke, both pages die and
  verify-live still passes.
- **MA-4, major — the committed test suite is RED.** 297 pass, 1 fail, exit 1, on a clean tree. The
  failing test deep-equals a golden file containing a diagnostic that counts warehouse records
  belonging to *other* batches — so it is guaranteed to re-break whenever any unrelated batch is
  pushed. Both deltas are exactly 213. A known-red suite is where a real regression goes to hide.
  The fix is to exclude corpus-size-dependent diagnostics from the comparison, not to refresh the
  golden.
- **MA-3, major — `watch-batch` in "any batch" mode fires instantly on the oldest release in
  history.** Run with default flags against the real warehouse: 2 milliseconds, exit 0, a release
  from two days earlier. The orchestrator's contract is "exit 0 means notify once", so this is a
  spurious notification with no release behind it. The covering test passes the non-default flag and
  starts from a truncated warehouse, so it exercises neither the default nor a non-empty log.
- **MA-5, major — the released round is 160 answers but 163 records, with no persisted supersession
  marker.** Three keys have two records each (all agreeing today). Oracle-label records carry no
  `supersedes`, no `revision`, no `retracted`; the server's revision counter is in-memory only, and
  supersession is reconstructed at read time by file order. Any consumer not replicating that exact
  convention sees 163 rows with 3 phantoms. The pairwise path does this correctly; the oracle path
  does not.
- **CR-3, critical — the analysis pools the join grades it promises not to pool.** The output emits a
  scoping claim that the two join grades — two byte-identical artworks and one different rendition of
  the same artwork — are never pooled. Every statistic in the file pools them into one group of
  three. It bites on exactly the two questions the note itself flags: `overlays` reads 2 agree / 1
  disagree pooled, but is 2/0 on identical bytes and 0/1 on the rendition row; `text_dominance` reads
  1/2 pooled but 1/1 on identical bytes. A rendition difference is being reported as model error, and
  the field the note singles out as legitimately rendition-sensitive is pooled anyway.
- **CR-2 (second half) — there is no gate-consistency section.** The analysis computes none; the word
  "contradiction" appears only inside prose strings. See Tier 1 (f) for the measured rate.
- Also major and confirmed: **MA-2** the dashboard advertises the adjudication page from batch kind
  alone, ignoring label schema, so it links to a page the server will refuse; **MA-6** the sorted
  multi-answer guarantee has never been exercised — every array in the entire warehouse has length 1,
  and the analyzer performs no vocabulary check; **MA-7** a reviewer refusal is recoded as "agreed
  with neither wording", which is exactly the pooling the file's own header says the third bucket
  exists to prevent; **MA-8** the pilot-overlap join is filename-stem string equality with no content
  check across three mixed id namespaces — it got the right answer, verified independently by
  re-hashing all 162 files and a full 20×142 perceptual sweep, by luck of a perfect naming
  convention rather than by verification; **MA-9** the per-question instruction line served to the
  reviewer is not in the model's prompt variant, so the reviewer received two anti-coherence
  instructions and the model one; **MA-10** `serverctl.sh` honours a port override but its pidfile
  and logfile do not, so a second instance overwrites the reviewer's pidfile and a later `stop` kills
  the wrong process.

### SAM — the geometry stage (`sam.md`)

- **Finding 3, major — the stored constant is a rounded display value and the published metrics do
  not hold at it.** The sweep's winning candidate is the observed score 0.577937; the stored constant
  is 0.578. Rounding up by 6.3e-5 pushes the mask that *defines* the boundary to the wrong side,
  turning one hit into a miss: the published "precision 91%, recall 69%, J 0.514" is the first value;
  the stored constant produces 0.9032 / 0.6667 / 0.4902. The same defect affects the weighted
  alternative (true optimum 0.643816, stored 0.644). Both sweeps otherwise reproduce exactly once two
  undocumented treatments are recovered: "partly" answers are excluded from both sides, and the
  weighted sweep uses cells the sample was *not* stratified by.
- **Finding 4, major — every per-image summary aggregate is permanently baked at the 0.3 capture
  cut**, and nothing says so. A consumer following the documented advice ("filter at the calibrated
  threshold") gets regions at 0.578 and a residual at 0.3. Measured: 70 of 142 images differ by more
  than 0.01, 14 by more than 0.10, maximum 0.667 — on the field the runner's own comment calls "the
  number the colorimetry stage runs on". **It already leaked into a reviewer round**: round 2
  selected its masks at 0.578 and rendered its residual panels from the 0.3 union, so the reviewer's
  "7 of 15 residuals only partly field" verdict — the whole premise of probe 4 — is a judgment about
  the 0.3 union. Probe 4's own two named covers are barely affected, so its conclusions stand; the
  general trap does not.
- **Finding 5, major — `review_round_2.py` cannot be imported under the current config, and the
  self-test reports ALL PASS.** A step-lock assertion fires on import because the barcode concept was
  added without updating the labels list. The self-test deliberately imports one sibling module for
  exactly this reason, with a comment explaining that the assertion is worthless unless something
  exercises it — and does not do the same here. The round-2 sample builder is dead, and with it the
  ratification fixture builder, which has no test of its own.
- **Finding 17, minor but load-bearing — the calibration has no decision record.** The threshold is
  tagged reviewed, closed a loose end, and is exactly the class of standing decision the conventions
  require a record for. There is no SAM threshold decision record. (See reconciliation note R1 — this
  report's count of the decisions file disagrees with two others.)
- **Finding 18, minor — the cited calibration artifact does not exist.** Two documents cite
  `data/sam/mask-quality-analysis.json` as the provenance of the calibrated threshold. Neither it nor
  its text sibling is on disk, and neither is gitignored. The numbers are regenerable — this review
  regenerated them — but the named evidence file cannot be opened.

### Premise — the VLM analyses (`premise-analyses.md`)

- **Finding 1, major — analyzers exit 0 with a complete, well-formed report from a missing input.**
  `analyze.py` on a nonexistent path writes a full agreement report with zero rows and
  `canary_stable: true`, because the emptiness of the empty set satisfies the stability test. A
  safety property that exists to halt a run reports itself satisfied from no evidence. The two
  published agreement artifacts in scope came out of this script; their contents are correct, but the
  guard that would say otherwise does not exist.
- **Finding 2, major — a documented assertion does not exist, and its absence manufactures A10's
  headline in the same direction.** Two comments in the cascade simulator state that adjudicator
  coverage "is asserted at load, not assumed". There is no such assertion; coverage is recorded as a
  boolean nobody must read. The adjudicator file lives in a directory this workstream does not own.
  A silently truncated file sends every uncovered item to "undetermined" — which is the exact
  direction of A10's finding that the adjudicator abstains wherever bulk-B abstains and the route can
  be dropped for free. Today the input is complete (142/142, independently confirmed).
- **Finding 5, minor — the published summary lines that A10 quotes mix computed interpolation with
  typed-in literals.** Five numbers are hardcoded inside f-strings whose neighbours are computed. All
  five are correct today, checked one by one — the point is that a changed input moves half of a
  sentence and leaves the other half behind, and these are precisely the numbers A10 and the file's
  own verdict quote.
- Also: **finding 4** publishes a confidence field sourced from a different model than the field
  beside it under the same prefix (masked only because confidence is currently degenerate);
  **finding 6** applies a multiplicity correction to the hypothesis that was *rejected* and none to
  the rule that was *recommended*; **finding 8** dilutes a non-degeneracy bar with gate-forced
  not-applicable rows (no verdict flips today); **finding 9** files a met "this schema is wrong"
  condition as report-only with no flag raised; **finding 10** loses cross-run canary continuity if
  the output file is renamed.

### Embeddings and corpus map (`embeddings-corpus.md`)

- **MAJOR-1 — 117 held-out artworks are rendered in the reviewer-browsed cluster galleries, and
  nobody wrote it down.** 28.3% of the 413 held-out ids appear as visible thumbnails across four
  gallery pages the reviewer is recorded as having browsed, plus two of the twelve quarantined
  artworks. Those browsing notes are the stated provenance for two now-load-bearing things: the
  elimination of PE-Core, and the cluster count the coverage set is built on. The holdout rule is
  categorical — "Looking at a held-out artwork spends it. If one is looked at, say so and remove it
  from the end-of-campaign claim — do not quietly keep it." Nothing says so, anywhere. The gallery
  builder contains no occurrence of "holdout" and will re-expose the same pages on demand.
  Mitigating: the pages predate the current holdout freeze by two and a half hours, the exposure is
  cluster-granularity thumbnails rather than palette inspection, and the reviewer's recorded
  observations name five artworks. The ask is a ledger row naming the 117 and a ruling on whether a
  thumbnail view spends an artwork — not a re-roll.
- **MAJOR-2 — the near-duplicate census's holdout block describes the superseded holdout,
  unlabelled.** 23% of pair endpoints carry a side label that disagrees with the current holdout;
  of 224 ids under a key named "affected holdout artwork ids", only 44 are held out today. Read at
  face value the block says the current holdout leaks catastrophically. It does not. The file is
  pinned by hash as live evidence in three places, so the cheap fix is a sibling note rather than
  regeneration.
- **MAJOR-3 — "dinov2 won the retrieval bake-off" is not a win over pe-core.** Paired significance
  testing on the same 24,648 pairs: a 14-pair margin, p = 0.816 — indistinguishable. Every other arm
  separates decisively (p from 1.35e-22 down). The choice is right and the evidence for it exists:
  the reviewer's own observation that PE-Core matches by artist rather than by image, which is
  semantic leakage for every use this instrument has. The defect is that the machine-readable
  rationale cites the number that does *not* separate them, so anyone re-deriving the decision from
  the artifacts finds a coin flip. Related: the loose-ends ledger names the wrong pair as unargued —
  the dinov2-vs-dinov3 comparison it flags is settled by the headline metric at p = 1.35e-22.
- **MAJOR-4 — the census indexes secondary arms with primary-arm row indices, with nothing
  asserting the row orders agree.** A secondary arm with one fewer row silently shifts every index
  and every cross-arm number becomes garbage; a *larger* one raises an error loudly, so the failure
  is asymmetric toward silence. Verified latent today — all six arms produce byte-identical path
  order — which is why the holdout conclusion stands, but that is a property of this run's success
  rather than of the code.

### Docs — drift between the documents and the disk (`docs-drift.md`)

47 findings: **9 critical, 20 major, 18 minor**. Beyond §1.1 (Tier 1a), the criticals are:

- **§1.2** — `model-manifest.json`, the file that anchors the identity of every SAM run, pins a
  concept set **two generations old** (pre-v1, seven prompts), including two prompts measured to fire
  on 0 of 10 and 0 of 16 images. Row identity embeds this hash, so a consumer that trusts the pinned
  manifest — which is what a pinned manifest is for — gets the wrong question set with no error.
- **§1.3** — the decision ledger carries **three caveats that are now false** (claiming no reviewer
  has seen a mask from the new set: 100 graded masks exist; claiming two code defects remain: both
  fixed), on a record with an empty funding list so no machine can ever catch them. And **zero of the
  15 records carry a `supersedes` field**, while three of them describe one instrument in three
  successive states — a consumer cannot tell which is current, and the earliest, carrying the false
  caveats, is indistinguishable from the live one.
- **§1.4** — `V3_PLAN.md` certifies "434 warehouse records across 5 batches"; the file holds **773
  across 10**. The number was true at 10:12 that morning and froze while the warehouse nearly
  doubled. It is the number a later reader cites for how much evidence Phase 0 has.
- **§1.5** — `V3_PLAN.md`'s SAM row says "the score threshold is uncalibrated and no reviewer has
  validated a mask". Both halves false, and contradicted by the ledger on the same day. This is the
  only row keeping the Phase 0 table from uniformly "met" — and it is aimed at the wrong hazards: the
  genuinely open SAM risks (vocabulary, CJK below the cut) appear in it nowhere.
- **§1.6** — "Nothing in groups B–F has been piloted" appears eight times across one document; groups
  B, C, D and E were piloted **twice** (163 human answers plus a 299-row model pilot). The same
  document's own appendix records two reviewer rulings issued *during* that round. The header and
  the appendix describe different worlds. The ledger repeats the same false claim.
- **§1.7 / §1.8** — the tagging vocabulary is called "undrafted" in the ledger and "Built
  2026-08-03" in `REVIEW_UI.md`; it shipped at v2.1.0. `REVIEW_UI.md` then pins the v1.0.0 numbers
  ("66 tags in 33 symmetric pairs across 8 axes" against an actual 103 / 48 pairs + 7 descriptive /
  12 axes) — not decorative, because "33 symmetric pairs" asserts a uniformly symmetric vocabulary
  that v2.1.0 deliberately is not; a consumer enforcing the documented rule would reject the real
  file.
- **§1.9** — a constant whose value was **refuted and replaced** is still quoted at its refuted value,
  under its refuted provenance, in six places — including eight lines below its own corrected
  definition. The constant is a bound whose whole job is to be exceeded by nothing; implementing
  against the old digits re-opens the invisible-pair hole the bound exists to close. This is the only
  place in the report where a `[MEASURED]` tag survives its own refutation.

Structural findings worth acting on beyond the individual rows:

- **The ledger's own counts are wrong** (§2.10): the header says 35 items / 9 sharp / 4 closed; the
  actual headings are 38 / 12 / 5. Rows appended after the header was written also sit below the
  divider meant to end their section. A ledger whose headline count is wrong cannot be used as a
  checklist, which is its only job.
- **`V3_PLAN.md`'s status table is wrong in both directions** — too pessimistic on SAM (§1.5),
  too optimistic in its "all met" summary (§3.4), and silent on an entire built instrument, the
  coverage set, which appears in no row of the status table and no row of the path-ownership table
  (§3.1, §2.18).
- **The diagnosis, and the rule it suggests** (§4, §7): in *every* case where a workstream README
  disagrees with the central ledger, **the README is right**. The READMEs are maintained by the
  workstream that owns the code; the ledger was compiled once, from outside, on one day. The proposed
  rule: **a status claim about code another workstream owns must cite that workstream's README, not
  assert independently.** Every built-vs-unbuilt inversion in the report would have been caught by
  that one rule. A second, cheaper rule from §7: any count quoted in a governing document either
  carries the timestamp it was measured at, or is replaced by the query that regenerates it.

---

## 4. Tier 3 — minors

Not enumerated here; they are individually small and individually documented. Counts and where to
look:

| report | minors | where |
|---|---|---|
| `review-server.md` | 20 | "Minor" section, numbered 1–20 |
| `docs-drift.md` | 18 | §3.1–§3.18 |
| `sam.md` | 13 | findings 6–18 |
| `embeddings-corpus.md` | 8 | MINOR-5 – MINOR-12 |
| `contract.md` | 7 | F7–F13 |
| `premise-analyses.md` | 7 + 1 trivial | findings 4–10, finding 11 |
| `warehouse-decisions.md` | 3 | F7–F9 |
| `cascade-basis.md` | — | single verdict, not severity-tiered |
| `unrealized-ideas.md` | — | 25 ranked items, not defects |

**76 minor findings in total**, plus one trivial. Several are latent hazards rather than present
faults and say so in place.

### The unrealized-ideas top 10, verbatim from that report's value ordering

| rank | § | item | raised by | status |
|---|---|---|---|---|
| 1 | §1 | VLM→SAM dynamic prompting: proven, unbuilt | assistant | never-started |
| 2 | §2 | Two BCDE question defects measured and unfiled | assistant | never-started |
| 3 | §3 | No parameter-honesty instrument exists | assistant | never-started |
| 4 | §4 | `d`/`m` adjudication annotations: built, zero data | Flo + assistant | started-then-dropped |
| 5 | §5 | Ladder reference rendition never capped and re-scored | assistant | never-started |
| 6 | §6 | `flat_field` micro-adjudication + the "essentially" hypothesis | assistant | never-started |
| 7 | §7 | DINO CLS + mean-patch pooling — trigger fired, unnoticed | assistant | never-started |
| 8 | §8 | Bake-off R@1 never rescored census-aware | assistant | never-started |
| 9 | §9 | Holdout's thin ≤400 stratum decided by default, twice | assistant | started-then-dropped |
| 10 | §10 | GLM-4.5V — the only unprobed out-of-family candidate | assistant | never-started |

That report's own discipline is worth recording: 25 items kept, five drafted items **killed** by a
repo check that found them already tracked, and three more shrunk once partial records turned up.

---

## 5. Statistics

| report | critical | major | minor | what survived attack |
|---|---|---|---|---|
| `contract.md` | 0 | 6 | 7 | APCA byte-exact against the reference package over 665,536 pairs (0 differences, 0 sign flips); OKLab within 3.7e-8 of the reference library; all six frozen constants re-derived to 5 dp from raw answers with independent maths; invariant 4 blocked all ten self-certification attacks and a 3-million-palette search |
| `warehouse-decisions.md` | 2 | 4 | 3 | Append-only confirmed with no rewrite path anywhere in the codebase; all 421 unique funding ids resolve, 0 missing; amendment depth, ordering, orphan and cycle semantics all correct; every CLI total truthful except `pending`; 67/67 tests pass |
| `review-server.md` | 3 | 10 | 20 | An independent reimplementation reproduced **every** numeric field of the validation analysis — zero disagreements; 13 path-traversal encodings and four symlink escapes all refused; blinding survives restart byte-identically; the salt is in neither git nor the warehouse; all 20 artworks re-hash to their recorded values, 160/160 paths resolve, timestamps strictly monotonic across all 773 lines |
| `sam.md` | 1 | 4 | 13 | Mask compression cross-checked both directions against the reference library over 455 real masks, 0 mismatches; all area aggregates recomputed from raw masks, 0 mismatches; every probe table (4, 5, vocabulary, salience, nesting) recounts exactly to the digit; all 60 round-1 overlays still hash to what the reviewer was served; no analysis mixes concept-set generations today |
| `embeddings-corpus.md` | 0 | 4 | 8 | All six retrieval scores reproduce to 16 significant digits from stored vectors with independent nearest-neighbour code; the holdout is leak-proof — all 62 boundary edges land on the 12 quarantined artworks, each independently confirmed ineligible; the coverage set is byte-deterministic (re-run produced an identical file); census union semantics verified numerically; a hypothesis that near-duplicates deflate the metric was raised and refuted (2 of 5,195 misses) |
| `premise-analyses.md` | 0 | 3 | 7 (+1 trivial) | Every published number reproduces — not one mismatch beyond a fourth-digit rounding artefact; kappa hand-verified end to end on one field against two independent implementations; the cascade simulator is genuinely truth-blind; no selection on results (full 142, tiers as registered); gold-30 handling clean with no double-counting |
| `docs-drift.md` | 9 | 20 | 18 | The measured core: every frozen same-colour-bar digit, the entire resolution-floor table, every calibration-consequence number, all holdout counts, all legacy-fixture counts, all 212 funding ids on the question-set freeze, and the A1/A10/A12/B8 closures — all exact. Two apparent contradictions turned out on inspection to be correct and are recorded as such |
| `cascade-basis.md` | 1 refutation | — | — | The arithmetic reproduces to the digit (32/34, 18/19, 8/8, 22/35, p = 2.3334e-07); the flat-vs-gradient separation in D's vocabulary is real and survives a properly specified test (Fisher p = 6.2e-9); B-vs-D is a clean wording contrast — identical model, weights, temperature, images and rendition, verified row by row |
| `unrealized-ideas.md` | — | — | — | 25 items kept after a repo check killed five and shrank three; every quote traced to the transcript and cross-checked against the ledger, the decision records, the plan and the question set before being kept |

---

## 6. Reviewer-decision queue

Items no agent can resolve. **Every entry is PROPOSED — awaiting reviewer.** Nothing below has been
acted on.

1. **The cascade repair round — label ground type on about 27 covers (~3 minutes).**
   *PROPOSED — awaiting reviewer.* The take-D policy commits 8 items; the answer value it gates on
   has 19 instances corpus-wide; **zero** of either set carries a reviewer answer with a usable
   binary reading (`cascade-basis.md` §2, "What would settle it"). Eliciting your own `ground_type`
   on those items moves the measurement onto the judge that binds, for the exact wording and the
   exact answer value the condition names. The project's own estimate for re-elicitation is ~3
   minutes, and the ledger notes that this cost "is the reason nothing should be shaped around
   avoiding it".

2. **Read the C/D adverse result and rule on its consequence for the question-set freeze.**
   *PROPOSED — awaiting reviewer.* The experiment ran; the deconfounder disagreed with itself more
   than the instrument it was meant to vindicate (0.4599 against 0.708), while passing the other
   half of the gate outright (`docs-drift.md` §1.1). Design rule 6's "Until then" has already
   elapsed. The write-up is missing, not the data — but whether this moves rule 6, moves the freeze,
   or moves neither is a reviewer call, not an agent call. The docs-drift arm explicitly declined to
   adjudicate it (`docs-drift.md` §6).

3. **Reconcile the nine gate-contradictions in your own validation answers.**
   *PROPOSED — awaiting reviewer.* Nine contradictions across eight artworks — 40% of rows against a
   registered ceiling of 10% (`review-server.md` CR-2). Five are "no dominant subject" followed by a
   named subject kind; the "not applicable" option never fired in `subject_kind` across five chances.
   These rows are the human reference standard the model will be graded against. The question is
   which reading is right — gate-pair wording, question ambiguity, or the by-question pass structure
   — and it has to be on the record before any model is scored against them.

4. **The `d`/`m` adjudication annotations (~5 minutes).**
   *PROPOSED — awaiting reviewer.* The page, the deliberately symmetric vocabulary
   (`oracle-defensible` / `oracle-misread`), the record plumbing and fifteen tests were all built and
   verified live; the warehouse contains **zero** notes with either tag (`unrealized-ideas.md` §4).
   Meanwhile the claim the instrument was built to quantify — that the contested slice is
   intrinsically ambiguous rather than the oracle being wrong — now appears in the loose-ends ledger,
   the plan and an Appendix R ruling, funded entirely by one verbal remark. That report rates it the
   highest evidence-per-minute item on its list.

5. **Prioritisation of the fix batches.**
   *PROPOSED — awaiting reviewer.* The fleet found two critical warehouse defects, one critical
   blinding defect, one critical analysis-scoping defect, a red test suite, and 47 documentation
   findings. Several fixes are one-liners (the watch-batch flag default, the scoped pidfile, the
   `assertAmendablePatch` call inside `resolve()`); several are decisions with consequences (whether
   gradient stops get pair contrast now or wait for the gradient module; whether the demo verdicts
   are deleted, marked, or filtered; whether the 117 browsed held-out artworks are ledgered or
   subtracted from the end-of-campaign claim). Ordering is yours.

Adjacent, and also reviewer-owned, recorded here so they are not lost: **reopening A6** with an
area-fraction guard decision (`sam.md` finding 1); **ruling on per-group SAM thresholds** now that
the analysis's own gates are shown to pass (`sam.md` finding 2); and **deciding whether a
cluster-thumbnail view spends a held-out artwork** (`embeddings-corpus.md` MAJOR-1).

---

## 7. Reconciliation notes

Discrepancies between the reports' own numbers and their result summaries, or between two reports on
the same fact. **Twelve items.** None of them changes a Tier 1 or Tier 2 finding; they are recorded
so a later reader is not stopped by an apparent contradiction.

**R1 — the decisions file: 64 records with no SAM mention, or 15 records including three SAM
decisions?** `sam.md` finding 17 states "`data/decisions/decisions.json` holds 64 records and 0
mention SAM at all". `warehouse-decisions.md` F9 counts **15 records citing 434 ids (421 unique)**,
and `docs-drift.md` §1.3 counts 15 records and names three SAM decision records by id
(`d-2026-08-03-sam-prompt-set-replacement`, `-sam-concept-set-v2`, `-sam-concept-set-v2.1-barcode`),
with §2.2 citing the second as funded by 40 warehouse records. Both the count and the "no SAM
mention" claim conflict. `sam.md`'s substantive point — that there is no decision record **for the
calibrated threshold specifically** — is not contradicted by either other report, and none of the
three named SAM records concerns the threshold. Treat finding 17 as correct about the threshold and
wrong about the file.

**R2 — `sam.md` finding 1's precision gain mixes two cuts.** The claim is "precision 0.9062 → 0.9333
at unchanged recall" from removing one false positive with an area guard. 0.9062 is 29/32, measured
at the calibrated cut 0.577937; removing one false positive there gives 29/31 = 0.9355. 0.9333 is
28/30 — the arithmetic at the *stored* constant 0.578, whose own baseline the same report gives as
0.9032 (finding 3). Both readings support the finding; only the pair of numbers as printed does not
come from one cut.

**R3 — the dinov2-vs-pe-core margin: 12 pairs or 14?** `embeddings-corpus.md` MAJOR-3 measures 1,573
against 1,559 = a **14-pair** margin (and the score difference of 0.00057 over 24,648 pairs confirms
14). `unrealized-ideas.md` §7 describes the same result as "a 12-pair gap in 24,648". Both agree on
p = 0.816 and on the conclusion.

**R4 — the demo-batch split.** `docs-drift.md` §1.4's per-batch list gives `demo-calibration-0001` 4
and `demo-batch-0001` 4; `warehouse-decisions.md` F6 counts 5 verdicts + 1 batch-complete and 3
verdicts + 1 batch-complete. Both agree the warehouse holds **8 verdicts** and **773 records**; the
per-batch split differs by one in each direction, consistent with docs-drift excluding
batch-complete records from its per-batch counts.

**R5 — `warehouse-decisions.md` F6's own wording.** It enumerates 5 + 1 and 3 + 1 records, then says
"All 8 records are authored human/flo". The 8 refers to the verdicts, not to the ten records
enumerated two lines above.

**R6 — `docs-drift.md` §6 mis-cites its own section.** It refers to "§3.16's assertion-count drift";
the assertion-count finding is **§3.18** (§3.16 is the legacy-README disjointness claim).

**R7 — the same SAM sentence is both verified-clean and refuted.** `docs-drift.md` §5 lists A6's
calibration under verified-clean, including "All 3 hallucination-signature rows answered *no* and
score below the cut". `sam.md` finding 1 shows that exact sentence is a tautology — such a mask
cannot score above the cut by definition — and that the round contains a counterexample the verdict
string dropped. Not a numeric conflict: docs-drift verified that the sentence matches the data;
`sam.md` verified that the sentence carries no information. Both are right; the second supersedes
the first as a *conclusion*.

**R8 — `review-server.md` CR-2's denominator.** The headline reads "9 contradictions across 8
distinct artworks = 40% of rows", and "4x the ceiling" follows from 40% against 10%. 40% is 8
artworks of 20; per contradiction it is 9 of 20 = 45%. The registered ceiling is phrased "of ok
rows", so the artwork denominator is the defensible reading; the sentence as printed puts a
per-contradiction numerator over a per-artwork denominator.

**R9 — the same p-value reported as exact and as a rounding artefact.** `premise-analyses.md`
finding 11 re-derives 2.34e-07 from the unrounded base rate 0.5328467 against a published 2.33e-07,
and flags rounding a parameter before a tail probability as a habit worth dropping.
`cascade-basis.md` §3 re-derives 2.3333984e-07 using the same rounded 0.5328 the script uses and
reports it as reproducing exactly, explicitly noting the rounding is a probability rather than a
percentage so there is no unit bug. Both are correct; they differ on which null parameter to feed
the test, and neither notes the other's treatment.

**R10 — one report touched the repository.** `embeddings-corpus.md` discloses up front that its
re-run of `build-coverage-set.ts` wrote into `research/v3/data/coverage-set/` for real because an
interception wrapper did not take. The output was **byte-identical** — `git diff` and `git status`
both clean, only file modification times changed — so the accident is simultaneously the strongest
available confirmation of the determinism claim. The other eight reports state, and appear to have
kept, "no file modified outside this one".

**R11 — the "156" verdict differs between two reports.** `docs-drift.md` §5 lists "156 answers" under
verified-clean with a nit ("156 are the answers *funding* the fit; the fitted points are 120").
`contract.md` F7 rules the same `PHASE_0_DECISIONS.md` §3 sentence flatly **wrong**, giving 152
unique answers / 130 fitted points / 140 same-colour items answered — none of which is 156. The two
agree on every underlying count (and `warehouse-decisions.md` F3 independently gives 152 standing);
they differ only on whether "156 fitted answers" counts as accurate-with-a-nit or as wrong.

**R12 — `docs-drift.md` §2.1's heading undercounts its own table.** "Three more completed runs are
documented as unrun" heads a four-row table naming, between them, the BCDE pilot, two challenger arm
runs, three premise runs and three ladder runs. Wording rather than arithmetic — the row contents are
each individually verified — but a reader counting runs from the heading will be short.

---

*Compiled 2026-08-03 from the nine Phase 0 adversarial reports in this directory. This file creates
no new findings; every claim above is traceable to a report and a finding number in it.*
