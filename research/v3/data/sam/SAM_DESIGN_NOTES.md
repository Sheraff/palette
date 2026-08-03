# SAM design notes — what a mask can and cannot be asked

Standing notes for the geometry stage, written after concept set v2 was ratified (2026-08-03).
They record what the instrument is for, so later work does not re-derive it or, worse, assume
something the instrument cannot deliver. Evidence lives in `VOCAB_PROBE_NOTES.md` (probes 1–2),
`probe-3-salience.jsonl` (probe 3), `nesting-in-person.json`, and `MASK_REVIEW_NOTES.md`
(the reviewer's own words).

## 1. Masks locate mark-shaped things. They never decide provenance alone.

This is the correction that concept set v2's renames were the first half of.

A mask says *there is a mark-shaped thing here, and here are its pixels*. It does not say whose
the mark is, or whether it was part of the artwork or applied on top of it. Reviewer note 1,
verbatim: *"sometimes 'logo' could be part of the artwork itself, or some sort of added
branding"* — and likewise "sticker". That is why the stored tag is now `emblem` and not `logo`:
the word must not claim what the pixels cannot.

**Exclusion therefore requires corroboration.** Nothing may be dropped from the palette on the
strength of a mask alone. Three corroborating sources, in the order they should be trusted:

1. **Group-C oracle answers.** The VLM is asked whose a mark is. That is a question about
   meaning and it belongs to the model that reasons about meaning.
2. **Positional priors.** A parental-advisory mark sits against an edge at a near-constant small
   fraction of the cover. Measured on `sam-eval-142-v2` at the calibrated cut: 8 instances on 8
   covers, area fraction median **0.89%** (min 0.26%, max 2.68%), and **all 8 touch an edge** —
   4 bottom-right or bottom-left, 2 bottom-centre, 2 top-right. A "PA mark" occupying a tenth of
   the cover in the middle is not one, and that is checkable without asking anybody.
3. **Nesting.** A mark whose pixels sit inside a person's pixels was painted on the subject, so
   it is artwork content. The reviewer's canonical example, 2026-08-03: **a blazon on a
   character's shield, masked as a sticker, entirely part of the artwork.**

## 2. Nesting, measured

`analyze_nesting.py` over `sam-eval-142-v2`, at the calibrated cut 0.578, containment ≥ 0.80:

| | count | rate |
|---|---|---|
| `mark_like` instances (emblem / sticker / parental-advisory) | 77 on 47 images | — |
| nested in a person or face by **bounding box** | 12 | 15.6% |
| nested by **mask pixels** | 9 | 11.7% |
| …of those, inside a person covering >50% of the cover | **0** | — |
| images carrying at least one nested mark | 7 of 142 | 4.9% |

At the stored run cut of 0.3 the same measurement gives 168 marks, 42 bbox-nested (25.0%) and
30 mask-nested (17.9%).

Three things this says, none of them assertable without the measurement:

- **The signal is real and it is not an artefact of huge person masks.** Zero of the nine
  mask-nested marks are inside a person covering more than half the cover, which was the obvious
  way for this number to be worthless. The bbox test overstates by a third (12 vs 9), so the
  pixel test is the one to use.
- **It is rare.** Around one in nine marks, on one cover in twenty. Useful as corroboration on
  the covers where it fires; useless as a general rule, and no exclusion policy should be built
  as though it applies broadly.
- **It has a measured false-positive mode.** On
  `0a/ab67616d0000b273000a8097d86930fb02f5a76d` — opened and confirmed by eye — a **genuine**
  parental-advisory badge (bottom-centre, 0.3% of the cover) is 96% inside the `person` mask,
  because the hooded figure fills the bottom of the frame and the badge was placed over them. So
  nesting says "artwork content" about a real applied overlay. This is exactly why nesting is
  listed third and why it corroborates rather than decides: here the positional prior (bottom
  edge, tiny, constant aspect) is right and the nesting is wrong.

The pleasing converse, on `0f/ab67616d00001e02000f723f36271de0ed3aa893`: the `sticker` mask that
probe 2 found sitting on the rapper's chain pendant is 100% nested in the person. Probe 2 called
that a mislabelling; nesting independently says the same thing — it is jewellery in the artwork,
not an applied sticker.

## 3. Salience is not available from this model. Field might be. (probe 3)

Probe 3 asked whether SAM answers a **non-semantic** question — "where is the thing that draws
the eye", "where is the colour" — since an accent lane would be a genuinely different instrument
from the concept set. 12 covers confirmed by eye, 10 phrasings, ~2 min GPU.
Rows: `probe-3-salience.jsonl`; log: `probe-3-salience.log`; 5 overlay sheets in
`salience-probe-overlays/`.

Images fired on, of 12, at the stored cut / at the calibrated 0.578:

| phrasing | fired | above cut | instances | verdict |
|---|---|---|---|---|
| the eye-catching element | 7 | 6 | 72 | fires, but see below |
| the background | 5 | 5 | 6 | **coherent** |
| the main focal point | 2 | 1 | 2 | too rare to use |
| the subject | 1 | 0 | 1 | dead |
| the most prominent object | 0 | 0 | 0 | dead |
| brightly colored object | 2 | 0 | 31 | dead at the cut |
| colorful accent | 1 | 0 | 27 | dead at the cut |
| accent of color | 0 | 0 | 0 | dead |
| bright spot | 0 | 0 | 0 | dead |
| colorful detail | 0 | 0 | 0 | dead |

**The attributive-colour family is dead**, and the strongest evidence is not the zeroes: it is
the two covers chosen *as their best case* — a single glossy red apple on white, and one small
pink lotus mark on a near-empty white field. Both are the archetype of "a colourful accent". All
five colour phrasings return **nothing** on both. Where they do fire (a neon city street) they
return 27–29 fragments, none above the calibrated cut. The hypothesis that SAM cannot select on
an attribute it was never trained to rank survives.

**The salience-noun family is mostly dead too** — which the hypothesis did *not* predict. "The
most prominent object" is 0/12. On `images/orelsan.jpg`, a dark photograph of one man with his
hand pressed against glass — as unambiguous a focal subject as the corpus contains — **every one
of the ten phrasings returns nothing.** A family that misses that image is not a salience
detector.

"The eye-catching element" is the exception and it is not what it looks like. It is tight and
right where a single object exists (the hand on frosted glass, 0.79, one instance, 10% of the
cover; the lotus mark, 0.93, 2%), and it fragments where one does not: 16 instances on an
all-typography cover, 48 on the neon street. It does not mean "the one salient thing", it means
"any conspicuous thing", and it is already largely covered by the existing concepts on the
covers where it fires cleanly.

**The surprise is the control.** "The background" fired on 5 of 12 and *all five are above the
calibrated cut* — and the masks are the field, cleanly: the white ground around the apple with
the apple and the type cut out (0.78, 58% of the cover); the pale field around the hand with the
silhouette cut out (0.84, 87%). §8.3's premise is that SAM segments things and not stuff, and
that field must therefore be derived subtractively. On this evidence the model will sometimes
name the stuff directly. It fired on none of the flat-graphic covers (the yellow typography
cover: nothing), so it is not a replacement for the subtractive route — but it is a **potential
cross-check** on it, on exactly the photographic covers where the residual is hardest to trust.

**Proposal, for the reviewer — nothing was added to `CONCEPT_PROMPTS`:**

- Reject all five colour phrasings, "the most prominent object", "the subject", and "the main
  focal point". Dead with this model.
- Do **not** adopt "the eye-catching element" as a salience concept. It is a conspicuity
  detector, not a focal-point detector, and its clean cases are already masked.
- **Consider "the background" as a cross-check lane**, not as a member of the union: it answers
  a different question from every other concept (it names field, not things), so folding it into
  a `CONCEPT_GROUPS` union would corrupt the very fractions §8.3 subtracts. If it is adopted, it
  should be its own group with its own column, and its value is agreement-or-disagreement with
  `residual_field_fraction` on photographic covers. The residual section of the
  `sam-mask-quality-2-v2-ratification` round is the right place to learn whether the residual
  needs a cross-check at all.

## 4. What none of this changes

The concept set stays as v2 ratified it. Probe 3 proposed no addition; the vocabulary questions
are the reviewer's, and an agent's measurement is evidence for that decision, never the decision.

---

## ADDENDUM — phase-0 adversarial review (2026-08-03)

Appended, not edited. Source: `research/v3/reviews/phase-0-adversarial/sam.md`. CPU only.

**The nesting table above still reproduces exactly** — 77 `mark_like` instances on 47 images, 12
bbox-nested (15.6%), 9 mask-nested (11.7%), 0 inside a person covering >50%, 7 of 142 images — and
it was re-derived independently, not by re-running this repo's script.

**Two things about it were undisclosed and now are.** `analyze_nesting.py` had no stale-run guard:
it was run against `sam-eval-142-v2` (concept set v2, 9 concepts) under a v2.1 config (10), and
`mark_like` has had **4** members since `barcode` joined it, not the 3 the table was computed under.
The run was never asked for `barcode`, so its absence is not a measured zero. The script now prints
the mismatch and writes the run's recorded concept set into `nesting-in-person.json`.

**The area guard is off by default here, on purpose.** `data/sam/nesting-in-person.json` and the
table above were computed score-only, before `config.CALIBRATED_MAX_AREA_FRACTION` existed, and the
default has to keep reproducing them. With `--max-area-fraction 0.5` the same run gives **76**
`mark_like` instances on **46** images (one big-area `sticker` guarded out); the nested counts are
unchanged.

**"All 8 touch an edge" (the parental-advisory section) is tolerance-dependent and the tolerance is
not stated.** Re-derived over the 8 PA instances at the calibrated cut: **6/8** at a 2% tolerance,
**6/8** at 3%, **8/8** only at ≥5% — two badges sit 3.4% and 3.7% clear of the bottom edge.
Everything else in that claim reproduces exactly: 8 instances on 8 covers, area fraction median
0.89%, min 0.26%, max 2.68%, and the 4 bottom-right-or-left / 2 bottom-centre / 2 top-right
breakdown under a bbox-centre quadrant rule.

**The probe-3 salience table above reproduces exactly**, all 10 phrasings × 3 columns.
