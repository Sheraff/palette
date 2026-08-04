# V3 Semantic Oracle — Question Set

**Version:** **v2**, 2026-08-03. Supersedes v1 (2026-08-02) **for group A**, and adds one field to
group D (§D.1 `subject_kind`, needs sign-off). Groups B, C, E and F are carried over unchanged.
v1's group A is kept verbatim in Appendix V1 at the bottom — nothing in this document has been
deleted.

> **STATUS CORRECTION, 2026-08-03. Groups B, C, D and E have been piloted — twice, on both
> sides.** This header previously said "nothing in groups B–F has been piloted" and that
> `group-bcde.v1` was "drafted and unrun". Both are false, and the correction governs every
> per-group "Not piloted" note below, each of which now carries its own count. On disk:
> `group-bcde-pilot-1.jsonl` (**model side** — 299 rows, variants E/F, 142 images, all ok) with
> `bcde-pilot-1-analysis.json` (49 pre-registered verdicts); and batch **`bcde-validation-1`**
> (**human side** — released, 160 items over 20 artworks × 8 questions, 163 warehouse records,
> every `oracle-label` carrying `labelSchemaVersion: "group-bcde.v1"`). Human answers by
> question: `overlays` 22 (C) · `grain_or_noise` 21 (E) · `has_dominant_subject` 20,
> `subject_kind` 20, `subject_area_band` 20, `has_signature_color` 20, `signature_carrier` 20
> (D) · `text_dominance` 20 (B). **Group F alone is genuinely untouched** — no
> `light_text_safe` / `dark_text_safe` / `two_color_faithful` record exists anywhere.
> This document's own Appendix R records **two reviewer rulings issued during that round**, so a
> reader who trusted the old header and Appendix R was reading two different worlds.
> **Nothing may be graded against the `bcde-validation-1` rows until the round's 45%
> self-contradiction rate has a reading on the record** — see `PHASE_0_LOOSE_ENDS.md` L-b and
> L-h, which also record that the round's served wording differed from variant E.

**Status:** group A is piloted and measured. Two measurements exist and are cited throughout:

| tag | what it is | size |
|---|---|---|
| `premise-run-1` | local VLM, 2 prompt variants (A/B), greedy + constrained decode, scored against the *accepted palette's* gradient boolean | 137 artworks × 2 variants (primary population) |
| `disambiguation-1` | the reviewer answering `ground_type` themselves on the artworks where oracle and flag contradicted | 30 artworks, 30 answered |

Ground truth in `premise-run-1` is an **accepted algorithm decision, not an elicited human
label** (`eval-set.json` → `meta.groundTruthEpistemology`). `disambiguation-1` is the only place
in this document where a human answered the actual question.

**Schema versions.**

| schema_version | prompts | vocabulary | state |
|---|---|---|---|
| `group-a.v1` | `prompts/group-a.variant-{a,b}.json` | v1 group-A vocabulary | **frozen**, run once as `premise-run-1`, never to be edited |
| `group-a.v2` | `prompts/group-a.v2.variant-{c,d}.json` | **identical to v1** | **RUN 2026-08-03** as `premise-run-cd` (299 rows, 142 images, all ok) — corrected criterion text + B ordering, vocabulary deliberately untouched. Its result is adverse to the ordering hypothesis; see design rule 6 and `oracle/premise/CD_RESULT.md` |
| `group-a.v3` | none yet | **split** `ground_type` (§A.5) | proposed 2026-08-03, **superseded the same day** by the probe arm, which generalises it (§A.6.7). Kept for the record; do not implement. |
| `group-a.probes.v1` | — | six probes, tag derived | **superseded before running** by v1.1 (referent defect, §A.6.0). Prompt files deleted; hashes kept in `PREMISE_NEXT.md` §13.2 |
| `group-a.probes.v1.1` | `prompts/group-a.probes.v1.1.*.json` (2 bundled + 6 solo) + `prompts/derivation.group-a.probes.v1.json` | **no ground_type question at all** — six probes, tag derived | drafted, not run — the **decomposed-probe arm**, reviewer-initiated (§A.6) |

The derivation table keeps the version `group-a.probes.v1` and is shared by both: the v1.1 fix
changed wording only, so the probe ids, the vocabulary and all 729 rows are unchanged and the file
is byte-identical (`sha256 da67d5eb…`). **The filename carries the derivation's own version, not
the prompt version.**

**Companion to:** `ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md` — that document's §8 holds the
design rules and explicitly marks its own question list as a placeholder; this document is the
actual set. The §8.1 design rules — **five** of them: ask what the algorithm must decide rather
than what the image *is*; closed vocabularies; 5-second answerability; description separated from
judgment; never ask for computables — govern everything below. This document **adds four more
(rules 6, 7, 8 and 9)**, in their own section near the bottom, each earned by measurement or by a
reviewer ruling rather than proposed. *(Corrected 2026-08-03: this line previously enumerated four
§8.1 rules, omitting the first, and said "§D below adds a sixth rule" — true when only rule 6
existed, and rule 6 was never in §D.)*

---

## Changelog v1 → v2

| # | change | where | kind |
|---|---|---|---|
| 1 | `ground_type`'s criterion corrected: the axis is **one continuous colour progression vs discrete colour areas**; surface identity is a prior, neither necessary nor sufficient | §A.2 | **SIGNED OFF 2026-08-03** (reviewer, incl. the birdsofprey continuous-rainbow case → shaded_field) |
| 2 | The two reviewer-decided cases written up as canonical examples, in one block that prompt files quote verbatim | §A.2 | mechanical (transcription of recorded rulings) |
| 3 | Per-value definition sentences added to the `ground_type` vocabulary, and a **precedence rule** saying when *not* to reach for `full_scene` / `pattern_or_texture` / `none_discernible` | §A.1, §A.3 | **SIGNED OFF 2026-08-03** (reviewer, after plain-language restatement) |
| 4 | New design rule: **question order matters; ask the context questions before the critical one** | §D | mechanical (states a measured result) |
| 5 | Expected reliability replaced with measured reliability, per field, per tier | §A.4 | mechanical |
| 6 | `confidence` recorded as **measured degenerate** (299 rows, 298 said `high`); inter-variant disagreement named as the real uncertainty signal | §A.4, §Meta | mechanical |
| 7 | `ground_type` vocabulary split proposed — `full_scene` / `pattern_or_texture` are answers on a *different axis* and eat the decision-relevant answer | §A.5 | **needs sign-off — proposal only, nothing implemented** |
| 8 | v1's group A preserved verbatim; v1's "candidate refinements" log preserved verbatim | Appendix V1, Appendix R | mechanical |
| 9 | **Decomposed-probe arm** added: six easy probes replace the six-way question, tag derived by a committed table. Reviewer-initiated 2026-08-03 | §A.6 | **needs sign-off** — it is a new instrument, not a rewording. Nothing is retired for it; it is an arm to be measured against C/D |
| 10 | The §A.5 split marked **superseded by §A.6** — the probe arm is its generalisation, and if the probes win, the split is subsumed | §A.5, §A.6.7 | mechanical (a pointer, not a decision) |
| 11 | Probe arm **v1 → v1.1: the referent defect** — reviewer stress test found the probes presupposed a singular background. Referent preamble + whole-region clauses + unsure framing; derivation untouched | §A.6.0, §A.6.1, §A.6.4 case 9 | **SIGNED OFF 2026-08-03** (reviewer: "the six probe wording is ok"; answered in the §12 round before reading the derivation rules — scoping note in the round's analysis) |
| 12 | **New field `subject_kind`** added to group D, and groups B–E folded into one pilot instrument (`group-bcde.v1`, `oracle/premise/PREMISE_NEXT.md` §15). Reviewer-initiated 2026-08-03 | §D.1, §D, §E | **NEEDS SIGN-OFF** — it is a new question, not a rewording. Nothing is retired for it |

Groups B–F are otherwise unchanged. Row 12 is the first addition any of them has ever taken; it
adds a field and pilots four groups, and corrected nothing *when written*, because there was no
measurement of these groups to correct. **That pilot has since run on both sides (see the status
correction at the top), so B, C, D and E are no longer unmeasured; F still is.**

---

## Organizing rule

*(unchanged from v1)*

Ask the VLM only what is:

1. **Semantic** — pixels + statistics cannot answer it (this is where v2-3 spent most of its
   rounds approximating, and where its residual debt list lives);
2. **Image-level** — SAM's masks answer "where"; the VLM answers "what it means";
3. **Not computable** — nothing derivable from pixels + masks (no colors, contrast, areas,
   polarity).

Every question is named for the algorithmic or evaluative decision it feeds. A question that
feeds no decision gets deleted at the pilot.

---

## A. Ground structure — feeds the gradient boolean and the background/surface roles

*Revised in v2. v1's version of this section is in Appendix V1.*

The heart of the set. v2-3's founding gradient rule — "shadows on one surface" vs "the sky and
the grass are different areas" — is pure semantics and consumed 10+ review rounds. v2 keeps the
same four fields and the same closed vocabularies; what changed is the **criterion** the
critical field is judged by, and the instructions around the values.

### A.1 Fields

| field | vocabulary | decision it feeds |
|---|---|---|
| `ground_type` | `flat_field \| shaded_field \| multiple_distinct_fields \| full_scene \| pattern_or_texture \| none_discernible` | The gradient boolean's semantic core: `shaded_field` vs `multiple_distinct_fields` **is** the continuous-progression-vs-discrete-areas distinction. Single most valuable label in the pass. |
| `shading_geometry` (when shaded) | `linear \| radial_or_vignette \| irregular` | Output-contract decision on how much gradient geometry to keep (v2-3 detected radial on most gradient winners and threw it away). |
| `field_texture` | `one_textured_material \| distinct_areas \| smooth` | Does the field's colour variation read as grain/texture of one material or as distinct coloured areas — the scrambled-cover test in semantic form. |
| `enclosure` | `none \| thin_border \| thick_frame_or_bars` | The frame/bar class asked structurally (does a frame steal the background role), not as a per-artwork patch. |

**Per-value definition sentences for `ground_type`** *(new in v2; the prompt files render these
in their own words)*:

| value | means | maps to the gradient boolean as |
|---|---|---|
| `flat_field` | one area, essentially one colour, no progression across it | flat |
| `shaded_field` | **one continuous colour progression** across the ground — light, shadow, glow, fade, or colours melting into one another | gradient |
| `multiple_distinct_fields` | **discrete colour areas** — two or more, each its own colour, however hard or soft the join between them looks | flat |
| `full_scene` | a depicted space whose ground has **no readable overall colour behaviour** — not merely "this is a photograph of a place" | *nothing* (unmapped) |
| `pattern_or_texture` | a repeating motif or a material surface that **is** the ground, with no overall progression and no discrete colour areas | *nothing* (unmapped) |
| `none_discernible` | no ground can be made out at all | *nothing* (unmapped) |

**Precedence rule** *(new in v2, needs sign-off)*: the first three values answer the criterion
in §A.2 and are used **whenever the ground can be read at all**. The last three exist for
grounds where the criterion cannot be applied. A photograph of a place whose ground still reads
as one progression, or as discrete areas, takes the criterion answer — not `full_scene`.

Why the rule exists, in numbers: `full_scene` was chosen by the VLM on **50 of 137** artworks
under variant A and **38 of 137** under variant B `[MEASURED premise-run-1]`, and by the
reviewer on **0 of 30** artworks in `disambiguation-1` — with the option present and hotkeyed
`[MEASURED disambiguation-1]`. Every one of those answers is a discarded answer: the field
exists to feed the gradient boolean and `full_scene` feeds it nothing. Under variant A, **44%**
of all `ground_type` answers (60/137) landed on a value that predicts nothing; under B, **31%**
(43/137).

### A.2 The criterion — corrected in v2

> **THE TEST.** Does the ground read as **one continuous colour progression**, or as
> **discrete colour areas**? Whether it is one physical surface is a strong hint, but it is
> neither required nor decisive.
>
> **Canonical case 1 — the painted wall.** A wall painted in bands that melt into each other is
> **one continuous progression** (`shaded_field`) — this is the contract's genuine three-stop
> gradient case. The same wall painted in *crisp* bands is **discrete areas**
> (`multiple_distinct_fields`). Same wall, same paint, different answer.
>
> **Canonical case 2 — the blurry meeting line.** One flat area meeting one shaded area along a
> blurry line is still **discrete areas** (`multiple_distinct_fields`). A single surface that is
> flat across part of itself and shaded across another part is **one continuous progression**
> (`shaded_field`). How soft the join looks is never the test.
>
> If it is genuinely a coin flip, answer with your first read. Do not deliberate.

Both cases were decided by the reviewer during `disambiguation-1` and are recorded verbatim in
Appendix R. Together they are what corrected the criterion: surface identity is **neither
necessary** (the crisp-banded wall is one surface and reads discrete) **nor sufficient** (a hazy
sky-into-sea is two things and can read continuous).

This block is the text the `group-a.v2` prompt files carry as **one shared block, byte-identical
between variants C and D** — so that the two instruments are quoting one sentence, not two
paraphrases of it. The prompt rendering differs from the blockquote above only in typography:
markdown emphasis is dropped and the em dashes become commas, because the prompt is plain text.
No word changes. The same rule applies to any human review form built for `group-a.v2`: quote the
block, do not restate it.

The v1 criterion — "a gradient means continuous shading within one physical surface; the sky and
the grass are different areas" — is not wrong, it is *incomplete*: it names the prior and stops.
It is preserved in Appendix V1 because `premise-run-1` and `disambiguation-1` were both
collected under it, and no re-reading of those numbers is legitimate under the new wording.

### A.3 Genuine ambiguity

A forced choice with no deliberation, matching the VLM's forced choice under constrained
decoding — the two instruments must be symmetric or the comparison is not a comparison. When the
answer is a coin flip, both answer their first read; the *disagreement between prompt variants*
is what carries the ambiguity, not a hedge inside one answer (§A.4, `confidence`).

### A.4 Reliability — measured, no longer expected

v1 said "expected reliability: low-to-medium" for this group. That guess is now replaced by
measurement. Every number below carries its source.

**`ground_type`, against a human who answered the same question** (`disambiguation-1`, the
30 artworks where oracle and flag contradicted — i.e. the *hard* subset by construction, not a
random sample):

| | exact `ground_type` match | binary gradient agreement |
|---|---|---|
| variant A | 7/30 = **23%** | 8/20 = **40%** |
| variant B | 16/30 = **53%** | 17/24 = **71%** |
| the v2-3 algorithm's flag | — | 14/24 = **58%** |

`[MEASURED disambiguation-1]`. Binary denominators differ because unmapped labels are dropped.

**`ground_type`, against the accepted palettes' flag, corpus-wide** (`premise-run-1`, n=137):

| | strict (unmapped forced to flat) | mapped labels only | unmapped |
|---|---|---|---|
| variant A | agreement 61%, κ **0.21** | n=77, agreement 71%, κ **0.45** | 60/137 |
| variant B | agreement 66%, κ **0.31** | n=94, agreement 74%, κ **0.48** | 43/137 |

`[MEASURED premise-run-1]`. Quote both columns or neither (`analyze.py` notes). Verdict:
**moderate at best, and only after a third of the answers are thrown away.**

**By resolution tier — `ground_type` at thumbnail tier is now MEASURED low.** On
`disambiguation-1`, of the 7 thumbnail-tier artworks the reviewer sided with the algorithm's
flag 6 times, with a label that predicts nothing once, and **with the oracle zero times**
(standard tier: oracle 10, flag 6, neither 5; large tier: oracle 0, flag 2)
`[MEASURED disambiguation-1, n=7 at this tier]`. The honest reading, stated with its
counterweight: at corpus scale against the flag, the thumbnail tier is *not* the worst tier
(variant B: thumbnail κ 0.42, standard κ 0.24, large κ 0.48 `[MEASURED premise-run-1]`). So the
claim is narrow and it is the one that matters: **where a human actually looked at a contested
thumbnail, the oracle never won.** This is consistent with pipeline §7.1 — a 300 px thumbnail
must never yield a confident negative — and it is the first measured support for it.

**The other three fields**, by inter-variant agreement only (no human answered these yet)
`[MEASURED premise-run-1, n=137]`:

| field | raw | κ | dominant disagreement | reading |
|---|---|---|---|---|
| `enclosure` | 0.87 | 0.60 | `none`↔`thin_border` (9) | medium-high; the disagreement is a threshold on "how thin is a border", which is a definition problem, not a perception problem |
| `shading_geometry` | 0.81 | 0.58 | `radial_or_vignette`↔`not_applicable` (21 of 26) | **not independently unreliable** — it is downstream of `ground_type`; almost all disagreement is one variant saying `shaded_field` and the other not |
| `field_texture` | 0.66 | 0.45 | `distinct_areas`→`smooth` (20) | **low, and the worst of the four.** It also overlaps `ground_type` (see §A.5) |
| `ground_type` | 0.71 | 0.61 | `shaded_field`→`flat_field` (12), `full_scene`→`shaded_field` (8) | the two variants disagree on the *binary* for **36/137 = 26%** of artworks |

**`confidence` is measured degenerate.** Across 299 parsed rows, **298 said `high`**; one said
`medium`. `ambiguity_note` was empty on the same 298. Inter-variant κ = 0.0 at 99% raw
agreement — the arithmetic of a constant. Under greedy constrained decoding the model does not
report uncertainty, so `confidence` **must not be used as a routing or filtering signal**. Keep
the field (it costs ~2 tokens and parity with the human form is worth something), but the real
uncertainty instrument is pipeline §3's: the 26% of artworks where the two prompt variants
disagree on the binary. `group-a.v2` gives the stem an operational trigger ("answer low whenever
a second answer is defensible") to see whether the degeneracy is the model or the question.

### A.5 The vocabulary question — proposal, HELD

v1's `ground_type` asks one enum to carry **two different axes**:

- **how the ground's colour varies** — `flat_field` / `shaded_field` /
  `multiple_distinct_fields`. This is the axis the gradient boolean needs.
- **what the ground is made of / whether it is a place** — `full_scene` / `pattern_or_texture` /
  `none_discernible`. This is a prior and a stratifier.

Forced into one slot, whichever axis reads more strongly wins, and the decision-relevant answer
is the one that gets eaten. The evidence, all `[MEASURED]`:

1. **The reviewer's own usage on the contested set:** `flat_field` 11, `shaded_field` 8,
   `pattern_or_texture` **5/30**, `multiple_distinct_fields` 5, `none_discernible` **1/30**,
   `full_scene` **0/30**. So **6 of 30 (20%)** of a *human's* answers on the hardest artworks
   landed on labels that predict nothing about the boolean this field exists to feed. Those six
   are not mistakes — an out-of-focus floral photograph really is a texture. The question simply
   has no way to also record how its colour varies.
2. **`full_scene` is the big leak, and it is a machine-only category.** 50/137 (A) and 38/137
   (B) at corpus scale, versus 0/30 from the human. Where the human ground truth said
   "gradient", variant A had answered `full_scene` on 29 artworks — the single largest block of
   discarded signal in the run.
3. **`pattern_or_texture` is smaller but real, and it is partly redundant.** The human used it
   5/30; the VLM 10/137 (A) and 5/137 (B). But `field_texture` already asks the texture question
   separately, so the same fact is being collected twice — once where it is harmless and once
   where it destroys the answer.
4. **`none_discernible` is rare and should stay.** 1/30 from the human, ~0 from the VLM. It is an
   escape hatch, not a category, and removing escape hatches is how you manufacture confident
   wrong answers.

**Proposed `group-a.v3` shape — NOT ADOPTED, NOT IMPLEMENTED:**

| field | vocabulary | note |
|---|---|---|
| `ground_variation` | `uniform \| continuous_progression \| discrete_areas \| not_discernible` | the decision field; always mapped except the escape hatch |
| `ground_content` | `flat_graphic \| depicted_space \| pattern_or_material \| photographic` | the prior and stratifier; never blocks the decision |

Expected effect: unmapped answers fall from 31–44% to roughly the `not_discernible` rate (~3%),
and `full_scene` stops being able to refuse the question. Cost: it is a **vocabulary change**,
so `premise-run-1` and `disambiguation-1` become non-comparable, the review form must be rebuilt,
and the reviewer must re-answer a set. That is a real bill and it is the reviewer's to authorise.

**Why `group-a.v2` (variants C/D) does not implement it.** Two changes at once cannot be
attributed. The corrected criterion is cheap and already reviewer-authored; the split is
expensive and unproven. C/D measure the criterion under the **frozen** vocabulary, which also
establishes the baseline the split would have to beat. If the criterion alone closes most of the
gap, the split may not be worth its bill.

**Definition sentences vs the split — both, not either.** The per-value sentences in §A.1 and the
precedence rule are in v2 *now* precisely because they are the cheap half of the same fix: they
try to stop `full_scene` from eating the answer using words instead of schema. If C/D show the
leak persisting despite the precedence rule, that is the argument that the leak is structural and
the split is required.

**Superseded, same day, by §A.6.** The split is a two-field coarsening of the six-probe arm below.
Do not implement it independently. §A.6.7 sets out what happens to it under each outcome.

## A.6 The decomposed-probe arm — `group-a.probes.v1`

*New in v2. Reviewer-initiated, 2026-08-03: "might increase reliability, and make the questions
easier to answer." Drafted, not run, nothing retired for it.*

Instead of one six-way question about a construct that took the reviewer two mid-round rulings to
pin down, ask **six easy things** and **derive** the tag from the answers. The bet is that a model
(and a human) can reliably answer "is the background one colour?" even when neither can reliably
answer "what is the ground made of?", and that the aggregate of six reliable answers beats one
unreliable one.

The arm asks **no question whose answer is `ground_type`.** That is the whole point. `ground_type`
and `field_texture` are *derived*.

### A.6.0 v1 → v1.1: the referent defect

**Found by the reviewer, 2026-08-03, before any inference was run**, by stress-testing the probe
wordings against a made-up hard case: *half blue sky, half red tiled roof, title text over both.*

v1 called the referent "**the** large area behind and around any subject" — **singular**. On that
artwork the background is plural, and four of the six probes become unanswerable rather than
merely hard: "is *the background* one colour?" has no true answer when there are two backgrounds,
and the same goes for `continuous_change`, `motif_or_material` and `depicted_place`. The probe
that survived is `separate_areas`, because it is the only one already phrased plurally.

This is worth naming precisely, because it is a **different failure from the one the arm was built
to fix**. §A.5's leak was a *vocabulary* problem — the answer existed but the value set could not
record it. This was a *presupposition* problem — the question had no answer at all. Decomposition
does not protect against it; if anything it multiplies the exposure, because six questions carry
six presuppositions where one carried one. **Every future probe must be checked against a plural
background before it ships.**

v1.1 fixes it in three places, and nothing else changes:

1. a **referent preamble**, byte-identical in all eight prompt files and in the human review form;
2. **whole-region clauses** on probes 2, 3, 5 and 6;
3. an **unsure framing** line, so that an honestly-unanswerable probe has somewhere to go.

**The derivation table is untouched** — same probe ids, same vocabulary, same nine rules, same 729
rows, byte-identical file. The fix was to the question, not to the inference from the answers,
which is the smallest repair that could have worked and is evidence the decomposition itself was
sound.

### A.6.1 The probes

Every probe is `yes | no | unsure`. Every probe passes the five-second rule standing alone, and
every probe means something on its own terms — none is the six-way question in disguise.

**The referent preamble, shown once and carried by every prompt** (byte-identical everywhere;
reviewer's words, verbatim):

> The background means everything behind the main subject and the text, taken AS A WHOLE — even if
> it has several different parts.

**The unsure framing, same treatment:**

> Unsure is a real answer — some questions won't fit some artworks, and that is measured, not
> penalized.

**The six probes**, v1.1 wordings, verbatim as they appear in every prompt file:

| # | probe | question |
|---|---|---|
| 1 | `bg_visible` | Can you make out a background at all — anything behind the main subject and the text? |
| 2 | `one_colour` | Is the background essentially one single colour all over? **If different parts have different colours, answer no.** |
| 3 | `continuous_change` | Does the background's colour change continuously — a fade, a glow, a vignette, colours melting into one another — **across the whole background rather than only in one part of it? If it changes in one part and not in another, answer no.** |
| 4 | `separate_areas` | Can you point to two or more separate areas of the background, each with its own colour? **A blurry or soft join still counts as two areas.** |
| 5 | `motif_or_material` | Is the background **AS A WHOLE** a repeating motif, or the surface of a material — paper, fabric, film grain, concrete, brush marks? **If only one part of it is, answer no.** |
| 6 | `depicted_place` | **Taken as a whole**, does the background show a place with depth — a room, a landscape, a street? |

With the option glosses, which are part of the wording and are also byte-identical across the
bundled and solo renderings:

| probe | yes | no | unsure |
|---|---|---|---|
| `bg_visible` | there is a background you can see | you cannot make out any background | you cannot tell |
| `one_colour` | one colour, all over | more than one colour is present, **or different parts have different colours** | you cannot tell |
| `continuous_change` | it changes continuously, across the whole background | it does not, or it only changes in one part | you cannot tell |
| `separate_areas` | two or more separate areas, each its own colour | you cannot pick out separate areas | you cannot tell |
| `motif_or_material` | **the whole background** is a repeating motif, or a material surface | neither, **or only one part of it is** | you cannot tell |
| `depicted_place` | a place with depth is shown | no place is shown | you cannot tell |

**The bolded clauses are load-bearing.** Two kinds, and they should not be confused:

- **Whole-region clauses** (probes 2, 3, 5, 6) are the v1.1 referent fix. They tell you what to do
  when the background has parts, which is the case that broke v1.
- **Criterion clauses** (probes 3 and 4) are the only place the canonical cases touch a probe.
  Probe 3's "across the whole background" is what makes a gradient sky over flat grass answer
  *no* — the colour changes in one part only. Probe 4's "a blurry or soft join still counts" is
  canonical case 2's ruling, applied locally.

Probe 3 carries one of each, and they happen to point the same way, which is why its wording did
the most work in the original design and needed the least repair.

**No probe quotes the corrected criterion or the canonical examples.** Importing the hard construct
into an "easy question" would make it the same question in more words, and the arm would be a
rewording rather than an alternative. The criterion's work is done in the *derivation*, once, in
public, by a table — not re-done by the answering instrument on every image.

### A.6.2 What is not decomposed, and why

- **`enclosure` stays a single three-way question, asked first.** It is already group A's most
  reliable field (raw 0.87, κ 0.60 inter-variant `[MEASURED premise-run-1]`) — decomposing a
  reliable question spends decode budget for nothing. Holding it fixed also makes it a **control**:
  if `enclosure` moves in this arm, something about the arm changed the model rather than the
  question. And first is the position the measured A→B ordering gain came from.
- **`shading_geometry` becomes `shading_direction`, asked unconditionally**, same four values, with
  the derivation forcing `not_applicable` when the derived tag is not `shaded_field`. In run 1,
  21 of this field's 26 inter-variant disagreements were `radial_or_vignette`↔`not_applicable`
  `[MEASURED premise-run-1]` — pure downstream noise from the ground answer. The arm deletes that
  class by construction instead of asking better.
- **`field_texture` is not asked at all.** It is derived (§A.6.5). Probe 5 already collects what it
  wanted, and its `distinct_areas` value duplicated probe 4.
- **`confidence` and `ambiguity_note` are dropped.** 298 of 299 rows said `high` and left the note
  empty `[MEASURED premise-run-1]`. Per-probe `unsure` is confidence asked at the granularity where
  it can act; the aggregate instrument is the inconsistency rate (§A.6.6).

### A.6.3 The derivation, as an ordered rule list

First match wins. Total by construction — rule 9 is a catch-all. `unsure` is **never an
assertion**: it triggers no rule, it is counted, and it can only route a vector to rule 9.

| # | if | then | disposition |
|---|---|---|---|
| 1 | `bg_visible == no` and any content probe `== yes` | `underdetermined` | `contradiction_visibility` |
| 2 | `bg_visible == no` | `none_discernible` | derived |
| 3 | `one_colour == yes` and (`continuous_change == yes` or `separate_areas == yes`) | `underdetermined` | `contradiction_uniformity` |
| 4 | `one_colour == yes` | `flat_field` | derived (tension `uniform_vs_material`) |
| 5 | `continuous_change == yes` | `shaded_field` | derived (tensions vs areas / material / place) |
| 6 | `separate_areas == yes` | `multiple_distinct_fields` | derived (tensions vs material / place) |
| 7 | `motif_or_material == yes` | `pattern_or_texture` | derived (tension vs place) |
| 8 | `depicted_place == yes` | `full_scene` | derived |
| 9 | otherwise | `underdetermined` | `unsure` if any probe is `unsure`, else `all_negative` |

Two things fall out of the ordering, and both are the fix rather than an accident:

- **Rule 6 closes the `full_scene` leak a priori.** Sky over grass is two areas that happen to be
  photographed, so it never reaches rule 8. `full_scene` is now reachable *only* when no
  colour-structure probe fired — which is exactly v2's definition sentence for it (§A.1), derived
  rather than hoped for.
- **Rule 5's precedence — continuity beats everything — is what the corrected criterion says**, and
  it is safe only because probe 3 asks about the *whole* background. §A.6.4 walks the cases.

The full enumeration of all **3⁶ = 729** answer vectors is committed in
`oracle/premise/prompts/derivation.group-a.probes.v1.json`, generated from these nine rules. It is
the contract: **an implementation that disagrees with any of the 729 entries is wrong, not the
table.** No post-hoc freedom, because there is nothing left to decide after the run.

### A.6.4 The worked cases, checked against the table

Every case the criterion was corrected over, run through the derivation:

| case | probes 2–6 (`one_colour`, `continuous`, `areas`, `motif`, `place`) | derived | wanted |
|---|---|---|---|
| melting-band wall (canonical 1) | n, **y**, y, n, n | `shaded_field` | `shaded_field` ✓ |
| crisp-band wall (canonical 1) | n, n, **y**, n, n | `multiple_distinct_fields` | `multiple_distinct_fields` ✓ |
| flat area meets shaded area, blurry join (canonical 2) | n, n, **y**, n, n | `multiple_distinct_fields` | `multiple_distinct_fields` ✓ |
| hazy sky into sea (§A.2's "not sufficient" example) | n, **y**, y, n, y | `shaded_field` | `shaded_field` ✓ |
| gradient sky over flat grass | n, n, **y**, n, y | `multiple_distinct_fields` | `multiple_distinct_fields` ✓ |
| vignette on one surface | n, **y**, n, n, n | `shaded_field` | `shaded_field` ✓ |
| photograph of a room, no colour structure | n, n, n, n, **y** | `full_scene` | `full_scene` ✓ |
| out-of-focus floral photograph | n, n, n, **y**, y | `pattern_or_texture` | `pattern_or_texture` ✓ |

The last two are the machine's and the human's most-used escape values, and the table sends each
where the v2 definition sentences say it should go. Note the second and third rows have the *same
probe vector* and the same answer — the two canonical cases collapse into one rule, which is what a
correct decomposition looks like.

**Worked case 9 — the reviewer's referent stress test.** Half blue sky, half red tiled roof, title
text over both. With the v1.1 referent fixed, the expected vector is
`bg_visible = yes`, `one_colour = no` (different parts, different colours), `continuous_change = no`
(each part behaves differently), `separate_areas = yes`, `motif_or_material = no or unsure` (the
roof tiles are a motif but the background as a whole is not), `depicted_place = unsure`.

Checked by lookup against the shipped 729-row table, **all four combinations of the two soft slots
derive `multiple_distinct_fields`**, disposition `derived`, no tension, `field_texture =
distinct_areas`:

| vector (`bg`,`one`,`cont`,`areas`,`motif`,`place`) | key | derived |
|---|---|---|
| y, n, n, y, **n**, **n** | `ynnynn` | `multiple_distinct_fields` |
| y, n, n, y, **n**, **u** | `ynnynu` | `multiple_distinct_fields` |
| y, n, n, y, **u**, **n** | `ynnyun` | `multiple_distinct_fields` |
| y, n, n, y, **u**, **u** | `ynnyuu` | `multiple_distinct_fields` |

**Rule 6 fires** (`separate_areas == yes`), and it is reached because rules 1–5 all fall through:
the background is visible, it is not one colour, and it does not change continuously across the
whole of itself.

Stronger than asked: the answer is stable across **all nine** combinations of probes 5 and 6,
including both taken to `yes`. Taking `depicted_place = yes` — a defensible reading, since sky over
a roof *is* a place — still derives `multiple_distinct_fields`, now flagged `areas_vs_place`; taking
`motif_or_material = yes` adds `areas_vs_material`. So on this artwork the derivation depends only
on probes 1–4, and the two probes the reviewer found hardest to answer **cannot change the
answer** — they can only raise a tension flag. That is the decomposition behaving as intended: the
uncertainty is recorded where it is, and it does not propagate into the tag.

### A.6.5 Derived `field_texture` and `shading_geometry`

`field_texture`: `motif_or_material == yes` → `one_textured_material`; else `separate_areas == yes`
→ `distinct_areas`; else `smooth`.

**Note the deliberate asymmetry**: material beats areas here, areas beat material in `ground_type`.
That is not an inconsistency — `field_texture` is *about* the material question, `ground_type` is
about colour structure, and the same evidence answers them differently. Being able to state that in
one line is itself an argument for decomposition: under one enum the two readings had to fight over
a single slot.

`shading_geometry`: take `shading_direction` as answered, then force `not_applicable` when the
derived tag is not `shaded_field`. Report raw and forced.

### A.6.6 Inconsistency is a first-class metric, not an error log

The derivation produces three named quantities per record, and the analysis must report all three:

| quantity | what it is | why it matters |
|---|---|---|
| **inconsistency rate** | share of records hitting rule 1 or rule 3 — logically contradictory vectors | the model asserted two things that cannot both hold. Unavailable from a single enum: a six-way question *cannot* be self-contradictory, which is not a virtue, it is a missing instrument |
| **tension rate** | share of records where two probes competed and precedence decided (e.g. `continuity_vs_areas`) | not an error. These are the genuinely hard artworks, named a priori |
| **unsure rate** | share of records with any `unsure` probe, and the per-probe breakdown | tells you *which* probe is hard, which a single enum can never localise |

Under `group-a.v1` the model's own uncertainty signal was degenerate (298/299 `high`). These three
are structural: they cannot be degenerate unless the answers genuinely are. **Whether they are
*useful* is pre-registered as a test, not assumed** — see `oracle/premise/PREMISE_NEXT.md`: do
flagged records predict the artworks the single-question arm contested?

### A.6.7 Relation to the §A.5 split — the probes generalise it

§A.5 proposed splitting one enum into two: `ground_variation` (the decision) and `ground_content`
(the prior). The probe arm is the same move taken further:

| §A.5's field | the probes that decompose it |
|---|---|
| `ground_variation` | `one_colour`, `continuous_change`, `separate_areas` |
| `ground_content` | `motif_or_material`, `depicted_place`, `bg_visible` |

So **§A.5 is the two-field coarsening of §A.6**, and the two must not be implemented as rivals.
What each outcome means:

| probe arm result | disposition of §A.5 |
|---|---|
| probes beat C/D | **subsumed.** Withdraw `group-a.v3`; the probe arm is the successor and the split is never built |
| probes lose, but the unmapped-share collapse holds | the split's benefit was real, the decomposition's cost was not. Build §A.5 as the cheap half |
| probes lose and unmapped share stays high | the construct is the problem, not its packaging. Neither is built; escalate |
| probes win only on the derived tag, not per-probe | suspect the derivation is doing the work a model should. Re-read §A.6.3 before believing it |

### A.6.8 Two presentation modes, because ordering effects are measured-large

Design rule 6 says order matters — measured at 23% → 53%. An arm that claims to be *more reliable*
has to show its probes are order-robust, so the arm ships in two modes:

- **Bundled** (`group-a.probes.v1.1.bundled-{p,q}.json`): all eight fields in one constrained decode. P uses the
  §A.6.1 order; Q uses a seeded random permutation of the six probes (seed 20260803, the fixture
  seed), with `enclosure` held first and `shading_direction` held last so P-vs-Q isolates probe
  order and nothing else. 4 of 6 probes move position.
- **Separate** (`group-a.probes.v1.1.solo-*.json`, six files): one inference per probe, so no probe can see another's
  answer. Tests whether bundling *contaminates* — whether answering `one_colour: no` pushes the
  next answer. Stems, glosses and framing are byte-identical to the bundled rendering, so the
  comparison measures bundling and not wording. Costs ~4× the bundled arm; gated on the gold-30
  first.

### A.6.9 What would make this arm wrong

Stated now, so it is not rationalised later:

- **A probe that is not actually easy.** Pre-registered per-probe bar: ≥90% P-vs-Q agreement. A
  probe under that fails its own premise and should be dropped or rewritten regardless of how the
  aggregate scores.
- **A derivation doing the model's work.** If the derived tag beats the single question while the
  individual probes are no more reliable than the enum was, the table is imposing structure the
  answers do not support. §A.6.7's fourth row.
- **Abstention dressed as accuracy.** `underdetermined` is honest, but an arm that abstains on a
  third of the corpus has not replaced anything. Pre-registered ceiling: ≤10%.
- **Six probes are more decode than one enum.** The bundled arm costs the same wall-clock as a
  single-question arm (image encode dominates), but the separate mode does not. If separate mode
  wins by a hair, it is not worth 4×.

## B. Text — feeds the foreground role

*Vocabulary unchanged from v1. **Piloted 2026-08-03** in `group-bcde.v1`: `text_dominance` × 20
human answers (`bcde-validation-1`) plus the model side. `text_roles` was deliberately **omitted**
from the built round despite the multi-select machinery existing, so it remains unanswered.*

| field | vocabulary | decision it feeds |
|---|---|---|
| `has_text` | `yes \| no \| illegible_at_this_size` | Foreground candidacy. The third value is required: a 300 px thumbnail must never yield a confident negative (pipeline doc §7.1). |
| `text_roles` (multi-select) | `title_display \| artist_name \| tracklist_or_body \| badge_or_sticker \| label_logo \| incidental_in_scene` | Provenance distinction deciding whether text can claim the foreground at all. |
| `text_dominance` | `dominant_element \| present_secondary \| minor` | The giant-display-text rule ("the title *is* the artwork") as a direct question instead of a fought-over statistical prior. |

Deliberately absent: text color, polarity, pixel size — all computable once SAM's text masks
exist.

**Expected reliability: high** (except `text_roles` on ambiguous integrated typography).
Still `[UNCALIBRATED]` — but no longer *untouched*: the group has been piloted (see the status
correction at the top), and `text_dominance` carries a **failing** pre-registered bar from the
BCDE pilot (`15.6-2b.text_roles`, presence-rate on the gate-open subset). "A guess" was true
before 2026-08-03; what is true now is "measured once, and one bar failed".

## C. Provenance — feeds the "belongs to the artwork" exclusions

*Vocabulary unchanged from v1. **Piloted 2026-08-03** in `group-bcde.v1`: `overlays` × 22 human
answers — the only multi-select actually served in the built round.*

| field | vocabulary | decision it feeds |
|---|---|---|
| `overlays` (multi-select) | `parental_advisory \| label_logo \| barcode_or_price \| watermark \| none` | Identity exclusion: overlaid elements "don't really belong to the artwork itself". |
| `physical_media_scan` | `yes \| no` | Is this a photograph/scan of physical packaging (sleeve edges, vinyl, jewel case, wear) rather than the artwork itself — a class v2-3 never named, and it changes what "the field" means. |

**Expected reliability: high.** Cheap, decisive, consumable by any paradigm. `[UNCALIBRATED]`

## D. Subject and identity — feeds the accent role

*Carried over from v1 unchanged, plus one new field (§D.1). **Piloted 2026-08-03** in
`group-bcde.v1`: `has_dominant_subject`, `subject_kind`, `subject_area_band`,
`has_signature_color` and `signature_carrier` at 20 human answers each. This is the round that
produced both Appendix R rulings and design rule 9. Two of its pre-registered bars are unresolved:
`has_signature_color` (modal 0.8592) and — from §C — `overlays` singleton at 0.9542, against a
**post-hoc** `SINGLETON_NEAR_ONE = 0.90`.*

| field | vocabulary | decision it feeds |
|---|---|---|
| `has_dominant_subject` | `single \| multiple \| none` | Figure/ground separation at the coarsest useful grain. |
| `subject_kind` (when a subject exists) | `person \| animal \| vehicle \| object \| building_or_structure \| abstract_shape` | **New in v2, §D.1.** Names the noun so SAM can be asked to mask it. |
| `subject_area_band` | `under_25 \| 25_60 \| over_60` | Same; also the band where saliency methods degenerate (large-subject covers). |
| `has_signature_color` | `yes \| no` | Is there one color that reads as *this cover's* color. |
| `signature_carrier` (when yes) | `text \| subject \| background \| small_element` | Aimed at the measured finding that ~half of accent corrections were salience mismatches: names which evidence lane *should* supply the accent — which no color statistic can. |

**Expected reliability: medium.** `[UNCALIBRATED]`

### D.1 `subject_kind` — the VLM→SAM handoff

*New in v2, 2026-08-03, reviewer-initiated. **NEEDS SIGN-OFF.** Drafted into `group-bcde.v1` —
and **it has since run**: 20 human `subject_kind` answers in `bcde-validation-1`, plus the model
side. The pre-registered analysis below (the distribution conditioned on
`has_dominant_subject == multiple`) is therefore computable and owed.*

Every other question in this document is asked because the answer is **semantic and not
computable**. `subject_kind` is asked for a different reason, and it is worth stating plainly
because it is the first question here whose purpose is **synergy with another instrument** rather
than a label in its own right:

> **SAM masks nouns it is given. The VLM is the thing that knows which noun to give it.**

*(Scoped 2026-08-03, from the pointing-model scout. That sentence is true of the prompt mode this
campaign uses and false as a statement about SAM: **SAM 3.1 also masks points, boxes and masks it is
given**, and the interactive point-prompt weights are in the snapshot we load on every run — 145
tensors, matched `strict=True`, never called, because mlx-vlm exposes no point-prompt entry point.
So the VLM→SAM seam can carry **coordinates**, not only nouns. Nothing about `subject_kind`'s
rationale changes; what changes is that "noun-passing" is one design of that seam rather than the
only one. Loose ends **A14**, **A15**, **B27**; source: `oracle/sam/POINTING_SCOUT_NOTES.md`.)*

The organizing rule says spatial questions are SAM's job and concept prompts are unioned across a
fixed set. *(Corrected 2026-08-03. This passage previously quoted the set as `text`, `lettering`,
`logo`, `sticker`, `person`, `face` "per pipeline §8.3". That was wrong twice: §8.3 never named
that six-item list, and the set is now **v2.1, ten concepts** — `words`, `letter`, `lettering`,
`display-text`/"album title", `emblem`/"logo", `sticker`, `parental-advisory`, `person`, `face`,
`barcode`. `oracle/sam/config.py` is the authority. The specific phrasing `text`, named first in
the old list, was measured to fire on **0 of 10** and **0 of 16** images with this model.)*
That prompt list is **hand-written** — and it has now changed twice, in exactly the direction this
argument asks for, which strengthens the argument rather than weakening it: a hand-written list
can only find the nouns someone thought of in advance, and the fix each time was that someone
thought of more.
Motivating case, from the residual round: **a car the masks missed.** `vehicle` was not in the
list, so no mask existed, so nothing downstream could reason about the largest coloured object on
the cover. A per-artwork `subject_kind` makes the concept prompt **conditional on the artwork**
instead of fixed, at the cost of one enum in a decode that is already happening.

This also means `subject_kind` is the one field in this document whose value is **not** settled by
its own reliability. A `subject_kind` that is right 80% of the time still adds a mask 80% of the
time where today there is none; the failure mode is a wasted SAM call, not a wrong label entering
the palette. Judge it by whether the named masks land, not by κ alone.

**Vocabulary**, six values, closed, five-second answerable:

| value | means |
|---|---|
| `person` | a person, a face, a figure, a crowd |
| `animal` | a creature of any kind |
| `vehicle` | a car, a bike, a boat, a plane, a train |
| `object` | a made thing: an instrument, a bottle, a chair, a tool |
| `building_or_structure` | a building, a bridge, a tower, a room read as a structure |
| `abstract_shape` | a shape or form that is not a thing you could name |

Asked **only when `has_dominant_subject != none`**, and a fixed JSON schema cannot express that, so
the prompt files add `not_applicable` — the same deviation `shading_geometry` has carried since
`group-a.v1`, and the gate is always generated first so the pair is jointly readable.

**The known limitation, recorded now rather than discovered later.** `subject_kind` is
**single-select**, so a cover holding a person *and* a car has two kinds and one slot. That is
design rule 8's shape — a value set that cannot record the answer it is asking for — and it is
exactly the failure the motivating case is made of. The prompt files resolve it by naming the
largest, and the pilot is **pre-registered to report the `subject_kind` distribution conditioned on
`has_dominant_subject == multiple`**. If mixed-kind covers are common, the successor is a
multi-select, and `group-bcde.v1` already carries multi-select machinery for `text_roles` and
`overlays`.

**What would retire this field:** if SAM's fixed prompt union turns out to already find the named
subject on ~every artwork, the question feeds no decision and the organizing rule deletes it at the
pilot.

## E. Medium and character — priors, stratification, confound control

*Unchanged from v1. **Piloted 2026-08-03** in `group-bcde.v1`: `grain_or_noise` × 21 human
answers. `medium` and `color_character` were not served in the built round.*

| field | vocabulary | primary use |
|---|---|---|
| `medium` | `photograph \| illustration_or_painting \| render_3d \| typography_only \| collage \| abstract_or_pattern` | Stratified evaluation; turning anecdotal failure classes into counted ones. |
| `color_character` | `monochrome \| duotone_or_tinted \| limited_palette \| full_spectrum` | Gates the all-one-hue edge class (accent may legitimately be neutral). |
| `grain_or_noise` | `yes \| no` | Visible grain/halftone/noise across large areas — texture-vs-structure prior, JPEG-artifact confound. |

These rarely feed a decision directly; their value is evaluation-side ("fails on illustrations
with limited palettes") and corpus stratification.

**v2 note.** If §A.5's split is ever adopted, `ground_content` and `medium` overlap and one of
them should go. Do not add both without deciding which one a downstream consumer reads.

**v2 note — group E is in the first pilot, alongside B, C and D** (`group-bcde.v1`,
`oracle/premise/PREMISE_NEXT.md` §15). Tiering below calls E a candidate tier that "runs on the
pilot", and this is that pilot. `medium` is also beyond SAM's reach — masks say *where* a region
is, never how the picture was made — so it cannot be recovered from the segmentation lane if it is
dropped here.

Two of the three sit close to the "never ask for computables" line and are flagged for it:
**`color_character` and `grain_or_noise` could plausibly be answered by a pixel statistic.** They
are asked anyway because their use is evaluation-side stratification rather than an algorithm
input, and because `grain_or_noise` is explicitly a JPEG-artifact confound control. Pre-registered
consequence: **if a cheap computed measure reproduces either of them, that question is deleted and
the statistic is used instead.**

## F. Eval-side target variables — never algorithm inputs

*Unchanged from v1. Not piloted.*

| field | vocabulary | use |
|---|---|---|
| `light_text_safe` / `dark_text_safe` | `yes \| no \| only_some_regions` | Sanity flags on published palettes (oracle says only-dark-safe, algorithm published white text → auto-flag for review). Kept out of the algorithm path: half-computable, mixes description with judgment. |
| `two_color_faithful` | `yes \| no` | Could two colors faithfully represent this cover — a direct check on collapse pricing, a real reviewable decision with no signal behind it today. |

## Meta — on every record

Per the pipeline doc: `confidence` (`high | medium | low`), `ambiguity_note` (free text, human
audit only, never read by code), plus the full provenance columns of §5.2/§9.

**v2 correction:** `confidence` as asked in `group-a.v1` is degenerate (§A.4) — 298 of 299 rows
said `high`, and `ambiguity_note` was empty on the same 298. Treat both as **audit trail, not
signal**, until a variant demonstrates otherwise. The uncertainty signal that *does* work is
inter-variant disagreement.

---

## Design rules added in v2 — measured, not proposed

These extend pipeline §8.1's five rules. They are here because a run produced them.

6. **Question order matters. Ask the context questions before the critical one.**
   Variants A and B put the same four questions, with the same closed vocabularies, to the same
   model under greedy constrained decoding. A asked `ground_type` **first**; B asked
   `enclosure`, then `field_texture`, then `ground_type`. Under constrained decoding the JSON
   property order *is* the generation order, so by the time B answers the critical question the
   model has already committed to two cheap, high-reliability facts about the same image.
   Result: **53% vs 23%** exact agreement with the reviewer, **71% vs 40%** on the binary, and
   **43 vs 60** discarded answers out of 137 `[MEASURED premise-run-1, disambiguation-1]`.

   *Stated honestly:* A and B differ in **both** order and wording, so this is "the B rendering
   wins", with ordering as the deliberate structural difference and the only one with a
   mechanism behind it. Variants C and D were two further independent wordings that both keep B's
   order, pre-registered so that landing near B would confirm rule 6 rather than leave it merely
   consistent with the data.

   ***The replication was run, and it FAILED*** (2026-08-03, `premise-run-cd`). C and D agree with
   each other on **0.4599** of artworks — *worse* than A agrees with B (0.708) — and neither lands
   near B. **Holding B's order fixed does not reproduce B's result.** So order is **not
   sufficient**, and the A→B difference **cannot be attributed to order** on the available
   evidence. Rule 6 is retagged
   **`[MEASURED, one comparison; the pre-registered replication FAILED — premise-run-cd]`**.
   What survives is the observation and the mechanism, not the causal attribution: B beat A, and
   generation-order-is-property-order remains a real property of constrained decoding. What does
   not survive is "ordering carried it". See `oracle/premise/CD_RESULT.md` for the analysis, and
   `PHASE_0_DECISIONS.md` §6 for the freeze's standing (it stands; one rule it cited does not).

7. **Self-reported confidence is not an uncertainty signal under greedy decoding.** Ask for it
   if you want an audit trail; get the actual uncertainty from disagreement between prompt
   variants (pipeline §3). 298/299 `[MEASURED premise-run-1]`.

8. **A value that maps to no decision is a value that can refuse the question.** Count the
   share of answers landing on unmapped values *before* reading any agreement number: at 31–44%
   the agreement figure is describing a minority of the corpus. §A.5.

9. **Design out ambiguity entirely — reframe the question or split it; never patch it with a
   gloss.** `[REVIEWED]` Reviewer directive 2026-08-03, issued while signing off both Appendix R
   rulings from `bcde-validation-1`: "generally we should design these so there is no possible
   ambiguity (whether that's a better framed question, or we split one into multiple
   questions)." Both live failures were structural, and glossing would not have fixed either:
   `has_dominant_subject` lacked a *unit* (no gloss can count "two hands holding an object"
   without a rule for what one subject is), and `signature_carrier`'s single slot could not
   *hold* a two-carrier answer no matter how it was worded. The order of remedies is therefore:
   first check the answer *shape* can record every real cover (rule 8), then check the question
   supplies its own unit/criterion, and only then polish wording. A question that needs a long
   gloss to be answerable is a question that wants splitting.

---

## What is deliberately NOT asked

*(unchanged from v1)*

- **Anything colorimetric** — hex, contrast, areas, luminance ordering, polarity: computed.
- **Anything spatial** — where the text/badge/subject is: SAM's job. Concept prompts are the
  **v2.1 set of ten**, unioned: `words`, `letter`, `lettering`, `display-text` ("album title"),
  `emblem` ("logo"), `sticker`, `parental-advisory`, `person`, `face`, `barcode`.
  **`oracle/sam/config.py` is the authority, not this line and not pipeline §8.3** — §8.3's list
  was never the one quoted here and has not been updated for v1→v2→v2.1.
- **Anything aesthetic** — "is this a good accent": that is the reviewer, and only the reviewer.
- **Anything requiring deliberation** — violates the 5-second validation rule, so it cannot be
  validated and therefore cannot be trusted.

## Tiering and lifecycle

- **Core tier (groups A–D):** each maps to a named decision any candidate architecture must
  make. Runs corpus-wide after the pilot.
- **Candidate tier (groups E–F):** runs on the pilot; survives only if the validation sample
  shows both reliability *and* actual downstream use.

**v2 addition — group A's own lifecycle.** Group A has now been through one pilot and one human
round. It has not earned corpus-wide status: at variant B's numbers, `ground_type` agrees with a
human on 53% of contested artworks and discards 31% of its answers. The gate for going
corpus-wide is in `oracle/premise/PREMISE_NEXT.md` §4.

**Update 2026-08-03 — the gate has been evaluated, and it splits.** The criterion arm ran. Its
**unmapped** criterion passed outright — **0%** unmapped under both C and D, against 31–44% under
A/B — which is a large favourable result on the half of the gate that motivated design rule 8. Its
**exact-match** criterion was **not met by any variant** (best 16/30 against a required 22/30). So
group A still has not earned corpus-wide status, but the reason has changed: it is no longer
"answers refuse the question", it is "the answers that are given do not match the human often
enough". The gate's own pre-registered branch on this outcome is to escalate the §A.5 vocabulary
split as `group-a.v3`; the **chosen** direction is instead the reviewer's residual-isolation route,
which would make background structure a pixel computation and moot the corpus-wide question rather
than answer it. Both are recorded — `d-2026-08-03-group-a-corpus-gate-outcome` and
`d-2026-08-03-reviewer-background-via-residual-isolation` — and the vocabulary split stays as the
fallback if the residual route fails a second time.

**Anti-anchoring caveat.** This set is derived from the problem spec's semantic primitives
(field, figure, text, provenance, identity), not from v2-3's failure ledger — but groups A and D
in particular encode hypotheses about what matters. The pilot plus the human validation sample
is where wrong or useless questions get deleted, and the paradigm bake-off (see `V3_PLAN.md`)
may add questions not foreseeable here. v2-3's failure classes are used as *test cases for the
questions*, never as their source.

---

## Appendix R — candidate refinements surfaced during use

*The record of what was decided, when, and by whom. **Nine dated entries as of 2026-08-04**;
re-derive rather than quoting that number —* `awk '/^## Appendix R/,/^## Appendix V1/'
ORACLE_QUESTION_SET.md | grep -cE '^- \*\*2026-'`*. The first two are kept verbatim from v1 and are
folded into §A.2; the sentence "both entries" applied when there were two and applies to those two
only. **Not every entry is applied** — two are signed rulings whose v2 fixes are gated on sign-off of
the rewrite, and several apply nothing at all.*

***What earns an entry, made explicit 2026-08-04 because it was about to be applied loosely:* a
reviewer STATEMENT made during or about a round — a ruling, a disclosure, or a complaint that names
something the question set cannot express. Reviewer *answers* do not earn one, however striking the
result; a scored round with no accompanying statement belongs to its own analysis and not here. Three
of the nine entries are disclosures rather than refinements, and they are the load-bearing ones,
because each is a **reading key without which a whole round's numbers are misread.***

- **2026-08-03, premise disambiguation round (reviewer):** `ground_type` has a gap for
  "one flat field + one shaded field with a blurry meeting line". Resolution applied
  in-round (recorded here, not changed mid-round — vocabulary is frozen for comparability
  with the VLM run): the test is *surface identity*, never boundary softness — one surface
  partly flat/partly shaded → `shaded_field`; two areas with a soft join → 
  `multiple_distinct_fields`; genuine 5-second ambiguity → answer the gut read (the
  forced choice is symmetric with the VLM's). Schema v2 candidates: sharpen the
  definition sentence, or add an explicit value if reviewer notes show the forced choice
  losing real information.
- **2026-08-03, same round (reviewer), second case:** one wall painted in bands that melt
  into each other → `shaded_field` (it is the contract's genuine-3-stop-gradient case);
  one wall in *crisp* bands → `multiple_distinct_fields`. Together with the first case this
  **corrects the criterion**: the axis is "does the ground read as one continuous color
  progression or as discrete color areas" — surface identity is a strong *prior*, neither
  necessary (crisp-banded wall reads discrete) nor sufficient (hazy sky-into-sea can read
  continuous). Schema v2's definition sentence should carry this axis; genuine ambiguity
  stays a gut read (symmetric with the VLM's forced choice).

**v2 disposition:** entry 1 → §A.2 canonical case 2. Entry 2 → §A.2 canonical case 1 and the
corrected criterion sentence. The "add an explicit value" option in entry 1 was **not** taken;
the reviewer notes did not show the forced choice losing information — what they showed was a
*different* leak, on a different axis (§A.5).

- **2026-08-03, adjudication browse (reviewer): the published gradient flag is
  palette-conditional, not an artwork label.** "The flat/gradient flag might not be the most
  fair comparison since it can really depend on which colors were picked for
  background/surface too." An artwork can support a valid flat palette AND a valid gradient
  palette; the flag records which choice won. Binding on all scoring: (a) reviewer-elicited
  labels (gold-30 and successors) are the PRIMARY judge for any oracle/model comparison;
  (b) flag-agreement is a secondary, palette-conditional signal — never call it accuracy;
  (c) the disambiguation tiebreak (flag 14 / oracle 10 / neither 6) overstates oracle error
  by an unknown share of legitimate other-choice cases. The reviewer also reported that
  where they voted differently from the oracle, they could see its point of view.
  *(Standing of that second half, recorded 2026-08-03: it is **one dated verbal remark and the
  only evidence there is** for "the contested slice is intrinsically ambiguous". The instrument
  built to quantify it — the `d`/`m` adjudication annotations, page, symmetric vocabulary, record
  plumbing and fifteen tests, all verified live — **will not be run**, by reviewer ruling: "we
  already know it's not reliable so there is no point in me rating it"
  (`d-2026-08-03-reviewer-dm-annotations-not-collected`). So the ambiguity claim is de-rated to an
  unquantified reviewer impression, permanently, and must be stated as one wherever it appears.
  The palette-conditional ruling above it is unaffected: that one is independently argued and keeps
  its full standing.)*

- **2026-08-03, BCDE validation round (reviewer): `has_dominant_subject` has no unit rule.**
  "What if the main content is just 2 hands holding an object — does it count as 1, 2, or 3?"
  The shared MAIN SUBJECT block says "take them all together" but never defines what *one*
  subject is, so `single` vs `multiple` is undecidable for any composite. v2 rule
  (SIGNED OFF 2026-08-03, under design rule 9 — the fix goes in the question's own criterion,
  not a gloss): **count the groups you would circle, not the things you could name** —
  elements touching or acting together (hands holding an object, a rider on a horse, a band
  huddled together) are ONE subject; `multiple` means subjects in *separate places* on the
  cover. Rationale: the question feeds a color-mass/location prior — `subject_area_band`
  already pools "taken together" and `subject_kind` takes the largest — and spatial
  separateness is what changes palette structure; nameable-part count changes nothing.
  Caveat on the round: its 20 `has_dominant_subject` answers (single 10 / multiple 5 /
  none 5) were given without this rule, as was every E/F model answer.

- **2026-08-03, same round (reviewer): `signature_carrier` forces one answer when the colour
  has several carriers.** "Some image has both the text and the main subject be the exact same
  colour which is the signature colour — how do you answer with only 1 answer?" The colour
  being in two places at once is not ambiguity about the carrier; it is a fact the enum cannot
  record (design rule 8's shape: a slot that cannot hold the answer it asks for). v2 fix
  (SIGNED OFF 2026-08-03, under design rule 9): make `signature_carrier` a **multi-select** —
  list every carrier; the
  grammar supports array-of-enum and the review UI's kind:"multi" already exists. A colour
  carried by text AND subject is a *stronger* signature, and that pervasiveness is signal the
  single-select was silently discarding. Folds into the already-flagged redesign of this axis
  (pilot 15.6-2b: `has_signature_color` 85.9% yes, κ.49 — the gate and its dependent get
  reworked together). Caveat on the round: recorded single answers on multi-carrier covers are
  forced choices and carry that noise.

- **2026-08-03, cascade ground-truth round + free-text follow-up (reviewer): the `ground_type`
  vocabulary is what failed, and `none_discernible` was never a claim that no ground exists.**
  Two rounds, in sequence, and **no question is edited by this entry** — the §A.2/§A.5 v2 rewrites
  stay gated on reviewer sign-off, and the frozen vocabulary is unchanged.

  **Round 1, `cascade-ground-truth-1` (19 covers, 1 question each).** Put to the reviewer under the
  corrected §A.2 wording, to test a proposed cascade policy — when bulk variant B returns an unmapped
  answer, take variant D's answer where D said `multiple_distinct_fields`. Pre-registered before
  scoring. **D matched the reviewer on 1 of the 8 covers the policy would commit** (adoption bar 6)
  and on 4 of the wider 19; escape values landed on **7 of 8**, firing the ESCALATE branch, with the
  REJECT thresholds met as well. Verdict **UNDECIDED–ESCALATE: not adopted, and the repair belongs to
  the vocabulary rather than to the routing.** Across the 19 the reviewer said `none_discernible` 9,
  `full_scene` 5, `multiple_distinct_fields` 4, `flat_field` 1 — and **`shaded_field` zero times**,
  which is why the round's flat-vs-gradient agreement is directionally vacuous and must never be
  quoted alone. Record: `d-2026-08-03-cascade-b-unmapped-take-d-not-adopted`. Write-up:
  `oracle/premise/CASCADE_POLICY_VERDICT.md`.

  **The reviewer's disclosure, which is the reading key for both rounds:** *"for this round, some
  images are genuinely hard to rank, and none of the options fit, or maybe several. So I answered
  'none discernible' but this is not true, i can see the field, I just don't know how to tag it."*
  A `none_discernible` answer in that round is a statement that **the list does not contain the right
  word**, not that the ground is absent. It counts neither as backing an abstention nor as
  contradicting a substantive answer.

  **Round 2, `ground-freetext-1` (9 covers, free text, no options offered).** Served on exactly the 9
  vocabulary-misfit covers, with the option list deliberately withheld so the round would measure
  *which words are missing* rather than whether a longer list is acceptable. **All 9 are describable
  in prose; not one description says there is nothing there.** On the contract's own terms —
  background and surface roles, not taxonomy — **6 of 9 are palette-decidable in prose** and **3 are
  genuinely ambiguous even in prose**. What the enum cannot hold, recurring across the nine: nesting
  (*"those two feel like different fields. However, both of those fields also contain many things …
  So it's both"*), several ground-types composed in one cover, count and texture sharing one slot
  (*"is it patterns? many fields? one field?"*), **extent** (area proportions volunteered unprompted
  on three covers), **scope** (*"almost any description would fit somewhere but not everywhere"*),
  and — the deepest gap — **the figure/ground line, which this question presupposes and never asks
  about**. One cover (`000f0a78`) is decisive against a purely lexical reading: the vocabulary
  **did** contain the right word and the reviewer still could not use it, because one of the three
  fields is itself a gradient and the single slot forced them to discard that.

  **Disposition: none applied to any question.** The §A.5 vocabulary split (B7) is due but its
  *shape* is now the open question, since a richer list cannot reach the 3 covers where the prose
  itself does not converge. The choice between vocabulary v3, retiring the question to pixel
  computation via the residual route (R-3), or both is **reviewer-owned and unmade** — carried as
  loose end **B24**, revives when the residual route's first purity measurement exists. The synthesis
  argues for retirement plus one narrowed human question that is *not* a taxonomy (*which parts of
  this cover are ground*), and it is an argument, not a ruling. Full synthesis with all nine
  descriptions verbatim: **`oracle/premise/GROUND_FREETEXT_SYNTHESIS.md`**. Record:
  `d-2026-08-03-ground-freetext-primary-evidence` — the prose is the primary evidence and any tag
  derived from it is a derived record (REVIEW_UI.md §4).

- **2026-08-03, schema-v2 review (reviewer): `signature_carrier` gets a *spread* value **and**
  multi-select, and the wording is the model's problem, not the reviewer's.** Three rulings in one,
  all SIGNED OFF 2026-08-03, recorded as
  `d-2026-08-03-reviewer-signature-carrier-spread-value-and-multi-select`:

  1. **Add a value for "the signature colour is spread across several elements."** This is the case
     gate-consistency rule #6 keeps firing on — `has_signature_color == yes` with
     `signature_carrier == not_applicable` — and it is precisely the case
     `d-2026-08-03-schema-v2-split-gated-pairs` said splitting the pair **could not reach**: that
     proposal's own residue paragraph asks for a *value*, not a split, and this ruling supplies it.
  2. **Keep multi-select as well — the two are cumulative, not alternatives.** The earlier
     Appendix R ruling above ("some image has both the text and the main subject be the exact same
     colour…") stands and is not replaced. A colour carried by text **and** subject is a *stronger*
     signature and gets listed twice; a colour that is simply spread with no nameable carrier is a
     different answer again and now has a slot.
  3. **The exact wording is to be optimized for MODEL comprehension via pilot, not chosen by
     argument.** Reviewer, verbatim: *"what matters is that the model understands it, not me."* So
     no phrasing is fixed here — for the new value or for the multi-select instruction — and the
     next group-BCDE pilot is what settles it. This is design rule 9 applied to phrasing:
     ambiguity is designed out empirically, not glossed.

  *Two caveats travel with this entry.* The **multi-select machinery has never been exercised by
  real data** (loose end L-f: zero array-valued answers anywhere in the warehouse carry two or more
  elements), so this question would be its first real test — while B19's `overlays` singleton rate
  argues for retiring multi-select on a *different* question, which is not a contradiction. And the
  **value and the multi-select overlap**: "spread" and "two carriers selected" can describe the same
  cover, so the pilot must measure whether the model uses the spread value as an escape hatch
  instead of naming carriers. If it does, the value is doing harm and half of this ruling goes back
  to the reviewer. Recorded single answers on multi-carrier covers stay forced choices and carry
  that noise; nothing already collected is corrected by this.

- **2026-08-04, residual purity round 1 (reviewer), post-release: the answer set could not hold the
  answer, and a labelling rule arrived with the complaint.** Two rulings in one paragraph of
  post-release prose, ported to the warehouse as human `note` records so they can be cited by id
  (`RESIDUAL_PURITY_VERDICT.md#post-release-misses`, `#post-release-escape`) — **no question is
  edited by this entry**, and the round's 50 released answers stand exactly as given.

  1. **A fourth answer for figure/ground questions — `can't tell what is field here`.** Reviewer,
     verbatim: *"sometimes it's hard to tell what is field and what is subject, so answers for those
     cases are not reliable (even with human feedback) unless we add an escape answer choice."* The
     round offered **pure field / mostly field / not field** and nothing else, so on covers where
     figure and ground genuinely are not separable the reviewer was forced to pick one of three
     anyway. **This is design rule 8's exact shape** — a slot that cannot hold the answer it asks
     for — and it is the same defect the `signature_carrier` entry above records on a different
     question. **How the escape scores is fixed in advance, because an escape that is quietly
     absorbed is worse than no escape:** `cant_tell` leaves both the numerator and the denominator,
     and its **share is a first-class per-stratum result**; a stratum whose escape share exceeds 0.50
     has *no* reliable rate and must be reported as having none rather than as having a low one.
     Corroboration that this is a property of the covers and not of the reviewer:
     `GROUND_FREETEXT_SYNTHESIS.md` found **3 of 9** covers ambiguous in unconstrained prose, with no
     answer slots constraining them at all. Record:
     `d-2026-08-04-purity-rounds-need-escape-answer`.
  2. **Decorations above and below the main text count as part of the main text.** Given in passing
     while listing what survived subtraction — *"decorations above/below the main text (that would be
     considered part of the main text)"* — and it settles a class that previously had **no defined
     answer**: such ornaments are neither a depicted subject nor part of any `text_like` mask, so
     nothing removed them and nothing could name them. A labelling rule for mask judgment rather than
     a question edit, but it belongs here because it is what a future round's question will *mean*.
     Record: `d-2026-08-04-text-adjacent-ornament-is-text`.

  *The reading key for the round itself, and it applies to every rate in it:* because the escape did
  not exist when the round ran, **residual-purity-1's rates are answers as given** and are not
  reliable on the ambiguous covers. The round's NOT-ADOPT verdict survives that — it fails its bar
  even at the charitable ceiling — but no individual per-stratum rate should be quoted as a purity
  estimate. Full reading: `oracle/sam/RESIDUAL_PURITY_VERDICT.md`.

- **2026-08-04, pointing round `pointing-ground-1` (reviewer), disclosed AFTER answering: the
  criterion applied was not the criterion the bar was written for.** Verbatim: *"i reviewed the
  pointing-ground-1 set, since it ran on mostly 'extremely hard background' artworks, i answered as
  'could this be considered correct' and not 'is this correct', results might be way better in other
  artworks but here it wasn't amazing."* Ported as
  `POINTING_PROBE_NOTES.md#pointing-ground-1-lenience`. **No question is edited by this entry**;
  like the `cascade-ground-truth-1` disclosure above, it is a **reading key**, and it is the second
  time an undeclared answering criterion has governed a whole round.

  **It cuts asymmetrically, which is the only reason the round is still interpretable.** Every rate
  is a **ceiling**: a **fail** under a lenient criterion is a **robust fail**, since the strict rate
  can only be lower — but the round's one passing half (dot-right 7/8) is **not** a robust pass,
  because it was bought at the generous reading. The sample compounds it: the six decidable tiles are
  *exactly* the covers where this same reviewer had earlier pressed `none_discernible` in
  `cascade-ground-truth-1`, so the round measures the misfit tail and only the misfit tail, and the
  reviewer says plainly that other artworks may be better. **The qualitative anchor is theirs:
  "it wasn't amazing", and no number from that round is to be carried above that sentence.**

  **The standing consequence for every future round, and it is a question-set obligation rather than
  a SAM one:** a round's own framing text must tell the reviewer explicitly to answer **"is this
  correct"** and *not* "could this be considered correct". This round's lenience went undeclared
  until afterwards and cost it its comparability — a strict successor is biased *against* itself
  relative to this one, so a tie would read as an improvement. Record and full reading:
  `d-2026-08-04-pointing-route-alive-pending-typical-strata-probe`,
  `oracle/sam/POINTING_PROBE_NOTES.md` §13.2.

*One 2026-08-04 finding is deliberately NOT an Appendix R entry.* `bracketing-round-3` returned
`anisotropy-confounded` on the straddle rule — a real result, recorded as
`d-2026-08-04-straddle-rule-anisotropy-confounded` — but **no ruling was issued during it and no
disclosure accompanied it.** It is a scored calibration round about the contract's colour ruler, not
a refinement surfaced by using the question set, and this appendix is not a results log. Reviewer
answers alone do not earn an entry here; a reviewer *statement* does.

## Appendix V1 — group A as written in v1

*Superseded by §A above. Preserved verbatim because `premise-run-1` and `disambiguation-1` were
both collected under this text, and those numbers may only be re-read against it.*

> ## A. Ground structure — feeds the gradient boolean and the background/surface roles
>
> The heart of the set. v2-3's founding gradient rule — "shadows on one surface" vs "the sky and
> the grass are different areas" — is pure semantics and consumed 10+ review rounds.
>
> | field | vocabulary | decision it feeds |
> |---|---|---|
> | `ground_type` | `flat_field \| shaded_field \| multiple_distinct_fields \| full_scene \| pattern_or_texture \| none_discernible` | The gradient boolean's semantic core: `shaded_field` vs `multiple_distinct_fields` **is** the one-surface-vs-two-areas distinction. Single most valuable label in the pass. |
> | `shading_geometry` (when shaded) | `linear \| radial_or_vignette \| irregular` | Output-contract decision on how much gradient geometry to keep (v2-3 detected radial on most gradient winners and threw it away). |
> | `field_texture` | `one_textured_material \| distinct_areas \| smooth` | Does the field's color variation read as grain/texture of one material or as distinct colored areas — the scrambled-cover test in semantic form. |
> | `enclosure` | `none \| thin_border \| thick_frame_or_bars` | The frame/bar class asked structurally (does a frame steal the background role), not as a per-artwork patch. |
>
> **Expected reliability: low-to-medium.** These are the genuinely ambiguous questions — which is
> exactly why they're worth asking. This group has the best existing validation hook: the
> warehouse's gradient-boolean endorsements (~80 artworks with reviewed gradient verdicts).

And the v1 criterion as it was put to both instruments, verbatim from
`data/oracle-validation/premise-disambiguation-1.json`:

> The GROUND is the large area behind and around any subject, text or figures. What is it made
> of?
>
> A gradient means continuous shading within one physical surface — shadows on the same
> surface. The sky and the grass are different areas, not a gradient.
