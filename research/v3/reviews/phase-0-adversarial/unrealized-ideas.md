# Unrealized ideas and todos — transcript archaeology

**Compiled 2026-08-03** by sweeping the full v3 campaign transcript (451 user/assistant turns,
~780 KB of text, read end to end — not sampled). Every item below was **raised and
acknowledged but never became code, data, a decision record, or a ledger entry.**

**Exclusion basis.** Cross-checked against `PHASE_0_LOOSE_ENDS.md` (A1–A12, B1–B18, C1–C8),
`data/decisions/decisions.json` (15 records), `V3_PLAN.md` §6 status table and backlog,
`oracle/premise/PREMISE_NEXT.md` (§7, §14, §15.8–15.10), and `ORACLE_QUESTION_SET.md`
Appendix R + changelog. Anything tracked there is **not** listed, even when still open.
Things done *differently* than first proposed count as done and are not listed.

Every candidate was then **verified against the repo** before it was kept. That check killed
five items I had drafted — the sidegrade movement rule (recorded in `REVIEW_UI.md` §52 and
`src/warehouse/records.ts`), neighborhood-expansion sampling and idle-time fresh-artwork
rounds (both in the review-server README's "Not built" list under B17), the detection-vs-
register bracketing finding (recorded qualitatively as "a factor of three" in the server
README and `decisions.json`), and the DINOv3-H+ arm (it *is* in `bakeoff.json` and named in
the canonical-model decision). Three more shrank once I found partial records; those are
flagged in place.

**How to read a row.** *Raised by* is Flo or assistant — agent reports count as assistant,
since the orchestrator relayed them and owned the follow-up. *Position* locates it by topic
rather than timestamp. *Status guess* is my read of whether work ever started.

**Count: 25 items.**

---

## At a glance — every item, ordered by value

Sections below are grouped by theme; this table is the value ordering. `§` is the section
number to jump to.

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
| 11 | §13 | "The background" as a SAM concept — measured, unratified | assistant | started-then-dropped |
| 12 | §18 | Concordance dashboard has no home in any plan | assistant | never-started |
| 13 | §14 | Provenance-corroboration ranking: design note, no code, no test | assistant | never-started |
| 14 | §15 | The `watermark` follow-up probe | assistant | never-started |
| 15 | §22 | Premise canary still rule-based, not cluster-based | assistant | never-started |
| 16 | §11 | Template-placeholder covers never became a hygiene class | assistant | never-started |
| 17 | §20 | "A granted GPU slot stays occupied" never reached CONVENTIONS | assistant | never-started |
| 18 | §21 | The self-certification verifier heuristic was never written down | assistant | never-started |
| 19 | §23 | Mock-layout revisions have no decision record | assistant | never-started |
| 20 | §19 | Phase-2 bake-off scheduler (round-robin across paradigms) | assistant | never-started |
| 21 | §12 | Embedding alpha-flatten is `[UNCALIBRATED]` and unmeasured | assistant | never-started |
| 22 | §16 | The promised first-item legend for mask rounds | assistant | started-then-dropped |
| 23 | §17 | The logotype-as-emblem boundary | assistant | never-started |
| 24 | §24 | The gold-30's own noise floor is unmeasured *(low confidence)* | Flo | never-started |
| 25 | §25 | Informed-vs-chaotic needs a threshold nobody has sourced *(low conf.)* | assistant | superseded-ish |

---

## A. Capabilities that were measured into existence and never wired up

### 1. The VLM→SAM synergy is proven and unbuilt
**Raised by:** assistant (SAM probe-5 agent), endorsed by the orchestrator.
**Position:** late — noun-breadth probe, right after Flo's missed-car observation.

> "**Species/artefact level, with the class word as a fallback — emit both, run both.** …
> Cost: 2 dynamic prompts per cover, ~0.08 s. The VLM must be explicitly barred from
> answering with a *part* (`eye`, `hand`, `face`, `wing`) — that is the one input that makes
> this instrument confidently wrong about the subject."

This is the payoff of three separate investments. `subject_kind` was **added to the question
set for this** (changelog row 12, reviewer-initiated). Probe-4 proved "car" recovers Flo's
missed car 5/5 at 0.82–0.93. Probe-5 proved **19 of 21 nouns hit perfect precision *and*
recall**, and that a wrong noun within a family costs 0.04 of score and no pixels. The pilot
then measured that **32 % of covers carry a subject noun outside SAM's fixed concept union** —
"the missed car class counted rather than anecdotal".

None of it is wired. There is no `dynamic_prompt` field on the SAM row schema; no prompt emits
a species noun (the schema only emits the six-value `subject_kind` class); the part-noun
prohibition exists in no stem; and the `concept_set_hash()` / `row_key` identity problem that
per-cover prompting creates was named in probe-4 and never resolved.

**To act on it now:** a `dynamic_prompt` field plus per-cover prompt list in the SAM runner; a
species-noun field in group D with the part-noun ban written into the stem; and a decision on
what `row_key` means when the prompt varies per image. Probe-5's own recommendation is to run
species **and** class, so the runner needs both.
**Status:** never-started. **Ranked first** because it is the largest concrete capability the
campaign paid for and did not collect, and because Flo's car and Chinese-character
counterexamples are the reason it exists.

### 2. Two of the four BCDE pilot question defects were measured and never filed
**Raised by:** assistant (pilot-analysis agent), relayed to Flo.
**Position:** late — group-BCDE pilot verdict, immediately before the validation round.

> "**Nothing is outright broken except one value:** `illegible_at_this_size`. Zero fires on
> 284 rows including 43 thumbnails, while the tier data shows small renditions produce more
> confident negatives. Re-word it or measure the floor before any 'no text' on a 300-px
> rendition is trusted."

The pilot produced four defects. Checking each against the repo:

- **`illegible_at_this_size` never fires** (0/284, every tier) — the escape hatch that exists
  to stop confident negatives on unreadable renditions. The *measurement* is durable
  (`bcde-pilot-1-analysis.json`, verdicts `15.6-2a.illegible_fires_on_thumbs` → FAIL). **The
  rewording todo exists nowhere.** This is the sharp one: it silently licenses "no text" on
  the 300 px tier, which is 38 % of the sharded corpus.
- **`overlays` is a singleton on 95.4 % of rows** — "the array bought nothing there". Measured
  as `report_only`; **no file proposes demoting it to a plain enum**, though §15.8
  pre-registered exactly that response.
- *(tracked, excluded)* `has_signature_color`'s degeneracy → `ORACLE_QUESTION_SET.md` §D
  already says "the gate and its dependent get reworked together".
- *(pre-registered but unscheduled)* `grain_or_noise`'s computed-statistic deletion test is a
  standing rule in both prompt files and `PREMISE_NEXT.md` §15.4 — but **nobody scheduled the
  bake-off that would execute it**, and it is the field whose yes-rate doubles between
  renderings.

**To act on it now:** two loose-end rows (illegible rewording; overlays→enum) plus one line
scheduling the grain bake-off. The measurements exist; nothing needs re-running.
**Status:** never-started (analysis landed, disposition never did).

### 3. No parameter-honesty instrument exists
**Raised by:** assistant; Flo asked for the plain-language explanation and accepted it.
**Position:** very early — the Phase 0 metrics discussion.

> "**Parameter honesty**, periodic: tunable-site count, human-anchored count, and the
> reviewed-vs-unseen perturbation-stability ratio (v2-3's 1.61× is the overfitting alarm;
> target ~1.0)."

Parameter honesty is **one of v3's three stated success criteria** (`V3_PLAN.md` §1). The
*discipline* exists — provenance tags, decision records, no anonymous literals. The
*measurement* does not: nothing counts tunable sites, nothing computes the human-anchored
fraction, and the reviewed-vs-unseen ratio has no harness. It survives as prose in
`PHASE_0_DECISIONS.md` §3 and `V3_PLAN.md` §1 only, and — unlike the perturbation gates — it
is **not** in `V3_PLAN.md`'s "specified, NOT built" rows, so nothing will surface it.

**To act on it now:** two of the three numbers are buildable today with no pipeline — a
provenance-tag census over `research/v3/src` constants files, roughly an afternoon, giving
Phase 1 a baseline from zero and making the ratio visible as it degrades. The stability ratio
genuinely needs a pipeline and belongs with the perturbation gates at the Phase 2 entry
condition.
**Status:** never-started.

### 4. The `d` / `m` adjudication annotations were built and never collected
**Raised by:** Flo (the observation), assistant (the instrument).
**Position:** mid-late — the `/oracle-review` browse.

Flo: *"the oracle-review is a good insight. Where i voted differently from the oracles, **i
could see their point of view.**"*
Assistant: *"If your `d`-rate on the flag-sided items comes back high, that's more evidence
the contested slice is intrinsically ambiguous."*

The page, the deliberately symmetric vocabulary (`oracle-defensible` / `oracle-misread`), the
note-record plumbing and 15 tests were all built. Flo said "yes i'll do that, where?", hit a
usability wall ("i don't know how to review this, there are multiple oracle answers per
artwork"), a rule line was added — and then the probe round was sequenced ahead of it for
anti-anchoring reasons and it was never returned to. **The warehouse contains zero notes with
either tag.**

Meanwhile the claim it was built to quantify — that the contested slice is *intrinsically
ambiguous* rather than the oracle being wrong — now appears in `PHASE_0_LOOSE_ENDS.md`,
`V3_PLAN.md` §5 and an Appendix R ruling, funded entirely by one verbal remark.

**To act on it now:** ~5 minutes of Flo's time on a page that already exists, already works,
and is already verified live. Highest evidence-per-minute item on this list.
**Status:** started-then-dropped (instrument complete, zero data).

---

## B. The resolution ladder

### 5. The reference rendition was never capped and the floors never re-scored
**Raised by:** assistant (ladder-runner agent), relayed to Flo verbatim.
**Position:** mid — ladder cost table and smoke, before the sample run.

> "At 3,000 px the model called one smoke artwork `pattern_or_texture`; every smaller
> rendition called it `flat_field` — it is seeing paper grain invisible at any size a user
> sees. If common, **cap the reference at a viewing-plausible size and re-score**; the run
> wouldn't need repeating, only the analysis."

Every resolution floor in `PHASE_0_DECISIONS.md` §7 — gradient ≥ 241 px, geometry ≥ 441 px —
is computed against the largest rendition as ground truth. If the paper-grain effect is
common, the floors are measured against an answer key that sees things no viewer does, biased
in an unknown direction. **Nobody ever checked how common it is.** The recommendation *is*
written down (ladder `README.md` §198-201 and `PHASE_0_DECISIONS.md` §389-391, which even
says "and the ladder **re-scored**") — but it is in neither the loose-ends ledger nor any
owner's queue, and `analyze.py` has no such mode.

**To act on it now:** pure analysis over `data/oracle-ladder/ladder-sample-1.jsonl` — count
how often the largest rendition is the odd one out against its own ladder, then re-score with
the reference capped near 640 px and diff the floors. No GPU, no re-run.
**Status:** never-started; explicitly priced as analysis-only by the agent that raised it.

*Related and already documented, so not a separate item:* the 561–680 px bin is structurally
empty, so the ladder is silent on whether **640 px** — the cap of the larger corpus — is
itself sufficient. That limit is recorded (ladder `README.md` §144, `PHASE_0_DECISIONS.md`
§382). What was never pursued is the only stated remedy: "it would need a different
collection."

---

## C. Corpus, embeddings and benches

### 6. The `flat_field` micro-adjudication and the "essentially" overcorrection hypothesis
**Raised by:** assistant, after the human probe round's 43 % result.
**Position:** mid-late — probe-gold analysis. *(Listed here because it is a bench/label
question, not a SAM one.)*

> "My working hypothesis for the flat_field collapse, **recorded but not yet acted on**: the
> v1.1 gloss *'if different parts have different colours, answer no'* … overcorrected by
> deleting the 'essentially' tolerance … and, if you're willing sometime, a five-minute
> micro-adjudication of those 9 artworks ('which tag do you actually endorse?')."

The probe round's headline — 43 % exact, twenty points below Flo's noise floor, concentrated
on `flat_field` (2/11 agreement) — is now cited in `PREMISE_NEXT.md` §12 and §14 row 7 as a
finding about **the decomposition**. The competing explanation, that a single gloss added
during the v1.1 repair caused it, was never tested. Repo check: zero occurrences of
"micro-adjudicat" or "overcorrect" anywhere in `research/v3`; nothing frames the v1.1 gloss
this way. And the *other* stated test route — the VLM probe runs — is parked (B3), so the
hypothesis has **no live path at all** while the finding it competes with is being quoted.

**To act on it now:** the 9 artworks are identified in `probe-gold-1-analysis.json`; a 9-item
round costs Flo ~2 minutes and would say whether the probes found real structure or a wording
accident. Scope it honestly as answered-after-reading-the-rules.
**Status:** never-started; both of its stated test routes are dormant.

### 7. DINO CLS + mean-patch pooling — the stated trigger fired and nobody noticed
**Raised by:** assistant (embeddings agent), as an open question.
**Position:** mid — DINOv2/PE-Core arm build, before the bake-off ran.

> "**DINO pooling is CLS-only.** The DINOv2 linear-eval recipe concatenates CLS with
> mean-patch (dim 2048), which sometimes helps instance retrieval. **One line in
> `_encode_dino_cls` if the first result is close.**"

The first result *was* close: DINOv2 vs PE-Core came out at **p = 0.816** on R@1 — a 12-pair
gap in 24,648, which the analysis itself called "reading noise". The condition the agent
attached to its own suggestion was met and the one-line change was never made. Repo check: all
four DINO arms are `"pooling": "CLS token"`; no mean-patch, no concat, no registered flag.

**To act on it now:** one line, a ~12 min full run, a rescore. It is the cheapest unexplored
quality lever in the embedding stack, and the canonical model is load-bearing for
stratification, the near-dup census, the holdout boundary assertion and the coverage set.
**Status:** never-started.

### 8. The embedding bake-off was never rescored census-aware
**Raised by:** assistant, in its own "what are we forgetting" sweep.
**Position:** late — the forgetting sweep, self-labelled "minor".

> "the embedding bake-off R@1s are known-pessimistic (near-dup partners counted as misses)
> and were never rescored census-aware — cosmetic, since the ranking was decisive"

The census found **6,386 cross-id near-duplicate pairs the filename ground truth doesn't
know about**, involving 2,718 files. Those are legitimate correct answers scored as misses, so
every published R@1 (0.6766–0.7892) is a floor, not a rate. Repo check: `bakeoff.json`
contains no census reference and `eval_pairs.py` never reads the census. The *ranking* is
safe; the *numbers* are quoted in `bakeoff.json`, `manifest.json`, the decision record and the
plan.

**To act on it now:** ~an hour — `eval_pairs.py` already loads what it needs; count a
retrieval as correct when the returned file shares a census component with the query. Worth
doing mainly so the recorded numbers aren't quietly wrong when Phase 2 cites them.
**Status:** never-started; self-flagged and self-deprioritized.

### 9. The holdout's thin ≤400 px stratum was decided by default, twice
**Raised by:** assistant (holdout agent), **once per freeze**.
**Position:** early (v1 freeze) and mid (v2 redraw).

> "**≤400 is thin** (93 candidates, 14 held out). Component-level stratification made it
> thinner than v1's 205. If you want tail-specific claims at low resolution, either
> oversample that stratum or accept corpus-wide claims only — **decide now, before anything
> consumes the list.**"

Both times the orchestrator applied a default ("accept; claim corpus-wide only") without
putting it to Flo, and both times the agent's framing was that the window closes once anything
consumes the list. It is now consumed — coverage set, ladder eligibility, boundary assertions.
Repo check: `HOLDOUT.md` tabulates the stratum but records no decision; the holdout loose ends
are A11, C1, C2, C3, C7 and none of them is this.

**To act on it now:** the honest half is cheap — record the default *as a decision* with its
consequence ("no tail-specific low-resolution claims are available from this holdout"), so an
end-of-campaign claim can't quietly assume otherwise. Re-drawing to oversample the tail voids
the freeze and needs Flo's authorisation (C3).
**Status:** started-then-dropped — decided by default, never recorded, twice.

### 10. GLM-4.5V — the only named out-of-family candidate, never probed
**Raised by:** assistant, in the "are we using the best models" answer.
**Position:** mid — after the premise verdict, before the challenger runs.

> "**GLM-4.5V** (106B MoE, borderline fit, generally behind Qwen3-VL on the relevant
> benchmarks)"

Of the four candidates named there, Qwen3-32B-dense and Gemma-3-27B ran, InternVL3.5 is
blocked with a recorded runtime reason (B2), and GLM-4.5V simply fell off the list. Repo
check: zero occurrences of `GLM` anywhere in `research/v3`; the registered arms are the three
Qwen/Gemma ones. It matters more now than when proposed: **A10** says the cascade cannot be
fully trusted until an **out-of-family adjudicator** exists — and A10 names no candidate, so
its "out-of-family option scan" has nothing to start from.

**To act on it now:** a feasibility check first — 106 B MoE against a 96 GB budget, mlx-vlm
support — roughly an hour, mostly to convert "borderline fit" into yes or no. If it fits, it
is A10's answer.
**Status:** never-started. **Possibly-superseded-by A10** in framing, but A10 is empty where
this is concrete.

### 11. Template-placeholder covers never became a corpus-hygiene class
**Raised by:** assistant (near-dup census agent), relayed as "a new corpus-hygiene class".
**Position:** mid — near-dup census.

> "one 16-id component is a single placeholder image shared by 16 unrelated releases — **a new
> corpus-hygiene class**"

The holdout redraw handles them incidentally (component-level draw), but nothing names, counts
or excludes them corpus-wide. Repo check: they exist only as `named_components[0]` in the
census JSON, with a generic note that doesn't distinguish "one placeholder, many releases"
from "one album, many reissues" — and those two shapes want opposite treatment. A palette
census that treats 16 unrelated albums with byte-similar art as 16 independent observations
over-weights one image; the same applies to any Phase 2 sampling.

**To act on it now:** the components are already computed — flag those whose members are
semantically unrelated, and add a line to the coverage-set and census docs. Small, and the
kind of thing that silently biases a corpus statistic.
**Status:** never-started.

### 12. Embedding alpha-flatten-to-white is `[UNCALIBRATED]` and unmeasured
**Raised by:** assistant (embeddings agent), as an open question; orchestrator answered "fine".
**Position:** early — embeddings smoke test.

> "**Alpha flattening is a judgment call, tagged `[UNCALIBRATED]`.** … White matches how a
> player would show the artwork, but **nobody has measured whether it changes neighbour
> structure for those files.**"

The 797 transparent files are excluded from the palette corpus, so the blast radius is small —
but they are *in* the embedding table, and therefore in the near-dup graph the holdout boundary
is asserted against. Repo check: still tagged `[UNCALIBRATED]` in `config.py`;
`PHASE_0_LOOSE_ENDS.md` has zero matches for "alpha" or "flatten".

**To act on it now:** re-embed the ~980 alpha-capable PNGs flattened to black and compare
neighbour rank correlation — minutes of GPU. Or just a ledger row. I flag it mainly because it
is an `[UNCALIBRATED]` tag that no ledger carries, which is the class of thing this campaign
otherwise tracks religiously.
**Status:** never-started.

---

## D. SAM — measured proposals never ratified

### 13. "The background" as a concept prompt — a measured positive left as a proposal
**Raised by:** assistant (SAM probe-3 agent).
**Position:** late — the salience probe, whose headline result was a null.

> "The surprise is the control. 'The background' fired 5/12, all above the cut, with clean
> field masks … it is a plausible **cross-check** on photographic covers. Proposal only;
> **nothing added to `CONCEPT_PROMPTS`**."

This matters more after Flo's round-2 verdict that everything-but-the-masks is a poor field
proxy (7 of 15 "partly", with a whole car and a set of Chinese characters left standing): a
*direct* background mask is the one measured alternative evidence source for the field, and it
validates the subtractive route from the opposite direction. The `barcode` add from the same
probe family was ratified; this was never put to Flo as a yes/no. Repo check: absent from
`CONCEPT_PROMPTS`; survives only as "Consider 'the background' as a cross-check lane" in
`SAM_DESIGN_NOTES.md`, which no ledger points at.

**To act on it now:** it is a concept-set change, so it costs a `concept_set_hash()` move and a
~6.5 min eval-142 re-run — a price already paid twice. Widening the probe first would be
cheap and more honest: n=12, on a set chosen for other reasons.
**Status:** started-then-dropped. **Possibly-superseded-by A9** if the next mask round folds it
in — but A9 names only the vocabulary refinements, not this.

### 14. The provenance-corroboration ranking: design note, no code, no test
**Raised by:** assistant, prompted by Flo's shield-blazon counterexample.
**Position:** late — "what if a sticker is part of the album?"

> "masks locate mark-shaped things; **they never decide provenance alone.** Exclusion requires
> corroboration — the group-C oracle answers, positional priors …, and **nesting**."

The principle is written down (`SAM_DESIGN_NOTES.md`) and both priors were *measured* —
nesting at 11.7 % of mark-like instances (pixel-true, not bbox), PA marks 8/8 edge-touching at
~0.9 % area. What does not exist is any code that combines them, any threshold, or any test —
and the measured counterexample (a genuine PA badge 96 % nested inside a frame-filling figure,
plus the converse: a mislabelled `sticker` on a chain pendant 100 % nested) means the rule must
be a ranked combination, never a single signal.

**To act on it now:** it is a Phase 1 consumer question, so the honest move is a loose-end row
naming it as designed-but-unimplemented **with the counterexample attached**, so a Phase 1
agent inherits the caveat rather than just the headline.
**Status:** never-started as code; design recorded.

### 15. The `watermark` follow-up probe
**Raised by:** assistant (SAM probe-4 agent).
**Position:** late — CJK/vehicle/barcode probe.

> "`watermark` is n=4-above-cut with 3 genuine credit marks/channel logos — **a next probe,
> not a proposal.**"

`watermark` is a named group-C provenance value in the question set, so a mask-side detector
has a waiting consumer, and three of four hits were genuine on a probe not designed for them.
Repo check: it *is* listed as follow-up item 3 in `PROBE4_NOTES.md` — but that file is a
workstream note, not a ledger, and nothing schedules it.

**To act on it now:** the same shape as probes 2–5 — ~15 targeted covers, a handful of
phrasings, well under a minute of GPU, an overlay sheet eyeballed, a proposal for
ratification.
**Status:** never-started.

### 16. The promised first-item legend for mask rounds
**Raised by:** assistant, after Flo's confusion on item 2 of the first mask round.
**Position:** mid-late — SAM mask-quality round 1.

> "the three-layer overlay stays, plus **a first-item legend next round**."

Round 2 was then built and shipped without it. Repo check: the legend *is* recorded in
`MASK_REVIEW_NOTES.md` ("add a one-line legend on the first item of a round") and `overlay.py`
still has none. Note that the larger half of the original promise — thinning the bbox and
strengthening the locator ring — was **deliberately reversed** once Flo said the three-layer
rendering was helpful, so only the legend is genuinely outstanding.

**To act on it now:** one item prepended to the next mask round, before the fixture's overlay
hashes are pinned (it cannot be changed mid-round).
**Status:** started-then-dropped; scope now much smaller than when promised.

### 17. The logotype-as-emblem boundary
**Raised by:** assistant, answering Flo's "what is emblem supposed to be".
**Position:** late — SAM ratification round.

> "The one genuine gray zone: a stylized band-name **logotype** (text designed as a graphic
> mark) can defensibly read as an emblem — gut call, and **if you hit one, that's exactly the
> kind of boundary worth a note afterward.**"

Flo judged 6 `emblem` masks in that round; no note came back and none was solicited. It
matters because `emblem` and `display-text` overlap precisely there, and both feed the
`text_like` / `mark_like` union fractions that provenance logic will consume — a cover whose
title *is* its logo lands in both unions or neither depending on an unwritten call.

**To act on it now:** one question in the next mask round, or a definition sentence in
`config.py`'s concept comments.
**Status:** never-started.

---

## E. Review-process machinery

### 18. The concordance dashboard has no home in any plan
**Raised by:** assistant, deciding the legacy-distillation agent's open questions.
**Position:** early-mid — legacy fixtures.

> "The concordance dashboard gets four tiers: matches-endorsement / matches-acceptable /
> matches-known-bad / unknown."

`V3_PLAN.md` §2 calls destination adjudication against the old warehouse "what makes the
economics work" — "a large fraction of early v3 iteration can be auto-adjudicated". The three
fixture files exist (37 / 351 / 166, membership-is-the-signal, disjoint by construction) and
each declares its `consumedBy` as this dashboard. The consumer does not exist. Loose end **A8**
covers only a stale README sentence, not the missing dashboard.

The real gap is a *tracking* one: the perturbation gates and robustness co-metric were
explicitly moved to the Phase 2 entry condition and recorded there; this was moved nowhere, so
nothing will surface it when a pipeline first emits palettes.

**To act on it now:** one line in `V3_PLAN.md`'s §6 status table adding it beside criteria 4
and 5 at the Phase 2 entry condition. It needs a pipeline, so it cannot be built earlier —
but it can stop being invisible.
**Status:** never-started, and un-tracked rather than deferred.

### 19. The Phase-2 bake-off scheduler (round-robin pair sampling across paradigms)
**Raised by:** assistant, in the review-UI design.
**Position:** early — review UI design.

> "let the batch builder do **round-robin pair sampling across paradigms** — the UI doesn't
> change, only the scheduler does."

Flo confirmed pairwise presentation for the bake-off ("yes keep pairwise presentation, this is
more robust and consistent"). The scheduler that turns 3 paradigms into balanced pairwise
batches does not exist and appears in no backlog — including `V3_PLAN.md`'s Phase 2 section,
which describes the bake-off but not the machinery that serves it. Repo check: the round-robin
samplers that do exist run over clusters and over strata/concepts; nothing schedules pairs
across arms.

**To act on it now:** genuinely Phase 2 work; the ask today is a backlog line so Phase 2
doesn't discover it on the day it needs it.
**Status:** never-started; un-tracked.

---

## F. Process and governance rules that never landed in the docs

### 20. "A granted GPU slot is occupied until its holder reports done"
**Raised by:** assistant, after its own slot-overlap fault.
**Position:** late — probe-5 reported a premise job live at 33/284 "despite the granted slot".

> "The rule tightens: **a granted slot is *occupied* until its holder reports done, regardless
> of what `pgrep` says.**"

`CONVENTIONS.md` carries the agent-side rule ("agents never start GPU work … ask the
orchestrator for a slot") and the measured Metal-poisoning consequence. It does **not** carry
the orchestrator-side rule — which is the one that was actually violated, and cost a subagent
34 minutes of waiting. Repo check: nothing in `CONVENTIONS.md` about a granted slot staying
occupied.

**To act on it now:** two sentences appended to the GPU bullet.
**Status:** never-started (stated in conversation, saved to no file).

### 21. "Validation that trusts a field of the object under validation" as a standing check
**Raised by:** assistant, after the contract verifier found the I4 bypass.
**Position:** early — contract verification.

> "That pattern (validation trusting a field of the object under validation) is now something
> **I'll have every future verifier probe for explicitly.**"

This was the highest-value defect found in Phase 0 — a gate that passed a genuinely
zero-contrast isoluminant pair because the palette declared its own floor, invisible to the
builder's 75 green tests. The generalization was stated and lived only in that turn's context:
it is in no doc, no verifier brief template, and the adversarial fleet's briefs were written
without it.

**To act on it now:** one bullet in `CONVENTIONS.md`'s verification section. The kind of
heuristic that pays for itself the first time it fires.
**Status:** never-started.

### 22. The premise canary is rule-based, not embedding-cluster-based
**Raised by:** assistant (premise-setup agent), as an open question; **never answered by
either party.**
**Position:** mid — premise test setup.

> "**Canary selection is rule-based, not cluster-based.** §5.3 wants a canary from a dense
> embedding cluster; the embeddings are another workstream's path, so I used a pinned
> deterministic rule … **swap it if you'd rather.**"

Every long VLM run since — premise, C/D, both ladder scopes, the BCDE pilot — has used that
canary as its determinism/drift tripwire. The blocking reason dissolved the day the embeddings
landed, and nobody revisited. Repo check: `canary.json`'s `selection_rule` is a lexicographic
sha256 pick over a filter; no embedding cluster; the gap is recorded nowhere. A canary drawn
from a dense cluster is a stronger tripwire because drift shows against a typical
neighbourhood rather than one arbitrary `full_scene` cover.

**To act on it now:** a one-time selection against `dinov2-vitl14` and a new `canary.json`
entry — with the caveat that changing it changes what "stable canary" means across runs, so
old and new runs stay comparable only through the recorded rule.
**Status:** never-started; a question asked and never answered.

### 23. Mock-layout revisions have no decision record despite being contract-scoped
**Raised by:** assistant (UI agent), flagged as "not mine to file".
**Position:** late — layout revisions 3 and 4.

> "no record in `research/v3/data/decisions/` or `PHASE_0_LOOSE_ENDS.md` … If you want the
> layout revision and the prefill semantics as formal decision records, that is a housekeeping
> append."

The project's own rule, stated at the very first contract discussion, is that **the preview
renderer is part of the contract**: "changing it re-scopes gradient verdicts just like changing
normalization does". The layout has since moved through four revisions on verbal instruction,
pinned only in the review-server README and a drift-guard test. Repo check: none of the 15
decision records concerns the mock layout. The same gap covers `preferenceSource`, which is an
additive field written onto every verdict record.

**To act on it now:** two decision records with empty `fundedBy` — the pattern already used for
the handoff convention.
**Status:** never-started; flagged by the agent, acknowledged, not executed.

---

## G. Low-confidence — included rather than dropped silently

### 24. The gold-30's own noise floor is unmeasured
**Raised by:** Flo.
**Position:** mid — immediately after the disambiguation round.

> "i answered the oracle round as best i could, **not always confident**."

The gold-30 is the primary judge in the premise verdict, the Opus probe, the challenger
bake-off, the cascade simulation and the probe-gold comparison. Flo's stated uncertainty is a
scoping caveat on all of them and appears in no file. Note the 63 % repeat-consistency figure
quoted everywhere is a **bracketing-round** measurement of a different task — the gold-30's own
self-consistency was never measured.

**To act on it now:** re-serve ~10 of the 30 unlabelled to measure it directly; or, cheaper, a
caveat line wherever the gold-30 is cited as primary judge.
**Status:** never-started. Low confidence because it partly overlaps the recorded *anchoring*
caveat — but anchoring and self-consistency are different quantities, and only the first is
written down.

### 25. Informed-vs-chaotic disagreement needs a threshold nobody has sourced
**Raised by:** assistant, adopting Flo's cross-rendition framing.
**Position:** very early — canonical input policy.

> "the ladder data lets us classify each cross-rendition disagreement as **'informed'** (the
> differing role's support region falls below some pixel count at the smaller size) or
> **'chaotic'** … Informed disagreement is fine and expected; chaotic disagreement is the
> robustness failure."

This is recorded in `PHASE_0_DECISIONS.md` §1 and the gates it belongs with sit at the Phase 2
entry condition, so it is *mostly* covered. What is not covered: the classifier needs a
support-region threshold, and nobody has said where it comes from — which is the identical
provenance gap that keeps invariant 2's spatial-spread half (**A4**) permanently `deferred`.

**To act on it now:** nothing to build; add a pointer in A4's row so the two threshold-
provenance gaps are visibly the same gap and get solved once.
**Status:** possibly-superseded-by the Phase 2 entry condition; listed because its one hard
sub-problem is invisible in that framing.
