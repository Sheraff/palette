# Concept-vocabulary alignment probe (probe 2) — 2026-08-03

The follow-up the reviewer asked for at the end of the mask-quality round: *"maybe we need
to adjust the exact vocabulary of our queries so we more semantically align with what the
model is good at"* (MASK_REVIEW_NOTES.md, synthesis line).

- Runner: `research/v3/oracle/sam/probe_vocabulary.py` (same shape as `probe_prompts.py`,
  which chose the current set; neither imports nor mutates `config.CONCEPT_PROMPTS`).
- Image list: `research/v3/oracle/sam/vocab-probe-15.txt` (15 images).
- Rows: `probe-2-vocabulary.jsonl` — one per image, every instance's score, area fraction
  and normalized bbox, under every phrasing. Console log: `probe-2-vocabulary.log`.
- Overlays: `vocab-probe-overlays/*.png` — 7 sheets, two rows each (whole image per
  phrasing, then the same masks zoomed on the target region).
- **GPU time: 50.5 s of inference over 15 images, ~52 s wall including model load.** One
  pass, one process. The 10–15 min slot was not needed.

## What was asked

Probe 1 asked *"does any phrasing fire at all"*. That question is answered — the model
fires. The mask-quality round exposed the next one: the model fires on the right pixels
under a word that **misnames what it found**. Parental-advisory marks arrive as "sticker"
(reviewer note 2); artist names arrive as "album title" (note 5); "logo"/"sticker" both
imply provenance the mask cannot know (note 1). So this probe measures *labelling
accuracy*, not recall, and every image was opened and its contents confirmed by eye first.

## Selection (why these 15, and not a random sample)

All 15 are members of the 142-image premise eval set, so their existing `sam-eval-142`
rows are directly comparable. Grouping:

| group | n | how they were found |
|---|---|---|
| carries a parental-advisory mark | 5 | corner-crop contact sheets over all 140 eval-142 images (bottom-right / bottom-left / top-right at 25–40% crop), then each candidate opened full-size to confirm |
| sticker-like / emblem / badge | 4 | eval-142 rows ranked by best `sticker` score, then opened; the top row is a literal peel-off promo sticker with a barcode (`sticker` 0.928) |
| record-label logo / in-artwork branding | 2 | `images/franz.jpg` carries a real Domino label logo; `images/elephunk.jpg` carries a band emblem drawn *into* the artwork — the reviewer's note-1 ambiguity, one of each |
| main display text, title-vs-artist ambiguity | 2 | `toxicity` (artist huge, title small) and `vvbrown` (artist and title in identical banners) |
| negatives | 2 | one photo-only cover, one interior photo — no text, no logo, no sticker, no PA mark |

The PA group deliberately spans the hard cases: flat black background, a 1200px rendition,
a warm faded photo, a dark low-contrast photo, and a **300px** rendition where the mark is
~40×20 px and sits bottom-*left*.

## Phrasings (16)

Reviewer-derived, plus two the orchestrator judged promising (`explicit content` — the
mark's own second line; `wordmark` — most album "logos" are letterform marks). Incumbents
`album title` / `logo` / `sticker` are carried as baselines.

## Hit rates

Images (of 15) where the phrasing produced at least one instance. `PA/5`, `EMB/6`,
`TXT/2`, `NEG/2` are the confirmed-by-eye groups above.

Stored threshold (`SCORE_THRESHOLD` 0.3):

| phrasing | all/15 | PA/5 | EMB/6 | TXT/2 | NEG/2 | max score |
|---|---|---|---|---|---|---|
| parental advisory | 5 | **5** | 0 | 0 | 0 | 0.915 |
| parental advisory sticker | 11 | 5 | 6 | 0 | 0 | 0.956 |
| parental advisory label | 8 | 5 | 3 | 0 | 0 | 0.943 |
| advisory sticker | 11 | 5 | 6 | 0 | 0 | 0.950 |
| explicit content | 0 | 0 | 0 | 0 | 0 | — |
| emblem | 2 | 0 | 2 | 0 | 0 | 0.769 |
| badge | 3 | 1 | 2 | 0 | 0 | 0.849 |
| brand mark | 0 | 0 | 0 | 0 | 0 | — |
| record label logo | 8 | 5 | 3 | 0 | 0 | 0.821 |
| wordmark | 0 | 0 | 0 | 0 | 0 | — |
| title text | 0 | 0 | 0 | 0 | 0 | — |
| main text | 0 | 0 | 0 | 0 | 0 | — |
| large text | 0 | 0 | 0 | 0 | 0 | — |
| *album title* (incumbent) | 11 | 4 | 6 | 1 | 0 | 0.781 |
| *logo* (incumbent) | 12 | 5 | 6 | 1 | 0 | 0.926 |
| *sticker* (incumbent) | 6 | 2 | 4 | 0 | 0 | 0.928 |

At the calibrated cut (0.578): `parental advisory` 5 / 5 / 0 / 0 / 0 — unchanged.
`sticker` collapses to 3/15 (1 of 5 PA), `album title` to 6/15, `logo` to 7/15.

**Zero false positives on the negatives, for all 16 phrasings, at both thresholds.**

## What the masks actually cover (overlays, looked at)

- `pa-greenday.png` — all four PA phrasings return **one** instance whose mask is the whole
  advisory badge including its white keyline, tight to the edge, nothing bleeding into the
  black field. `explicit content` n=0. Plain `sticker` n=0 — on this cover the PA mark does
  *not* arrive as a sticker at all.
- `pa-dark-photo.png` — same, on a near-black corner; the mask is exactly the badge.
- `pa-small-rendition.png` — 300px image, mark ~40×20 px, bottom-left. `parental advisory`
  0.89, mask on the badge. `sticker` returns two instances: the badge (0.39) *and* the
  rapper's chain pendant (0.60) — i.e. at the calibrated cut, "sticker" keeps the pendant
  and drops the advisory mark. That is the note-2 failure in one picture.
- `sticker-real.png` (the literal peel-off sticker) — `sticker` 0.93, mask on the printed
  panel but stopping short of the barcode strip. `parental advisory sticker` 0.96 and
  `advisory sticker` 0.95 cover the *whole* sticker including the barcode — **so those two
  phrasings are not PA-specific at all; the detector is keying on "sticker".** Bare
  `parental advisory` n=0 here, correctly. `badge`, `emblem`, `brand mark` all n=0.
- `logo-franz-domino.png` — `logo` 0.88 tight on the Domino badge; `record label logo` 0.71
  on the same pixels. `emblem`, `badge`, `brand mark`, `wordmark` all n=0 — and note that
  none of them (including `wordmark`) fires on the huge "Franz Ferdinand" lettering.
- `emblem-crest.png` — `logo` n=2 (0.93, 0.65) covers the circular crest **and** the "db"
  monogram. `emblem` n=2 (0.77, 0.34) covers the same two. `badge` n=1 (0.74) and
  `record label logo` n=1 (0.82) get the crest only, missing the monogram. So on this
  evidence `logo` ⊇ `emblem` ⊇ `badge` — the neutral words are strictly lower recall.
- `title-vs-artist.png` — `album title` n=2: the **0.688** mask is on "SYSTEM OF A DOWN"
  (the *artist*), the 0.357 one is on "TOXICITY" (the actual title). The stronger detection
  is the wrong role — exactly the reviewer's note 5, and at the calibrated 0.578 cut only
  the artist-name mask survives.
  `title text`, `main text`, `large text` all n=0.

## The result that decides the shape of the proposal

Comparing every candidate instance's bbox against every incumbent instance's bbox
(IoU ≥ 0.5 counts as the same region):

    parental advisory          5 instances, 0 novel regions
    parental advisory label    8 instances, 0 novel
    record label logo          8 instances, 0 novel
    emblem                     3 instances, 0 novel
    badge                      3 instances, 0 novel
    parental advisory sticker 12 instances, 1 novel
    advisory sticker          12 instances, 1 novel

**No candidate phrasing finds a region the current set misses.** The whole value on offer
is *labelling*: the same pixels, arriving under an honest name and at a much higher score.
Best score on the PA-mark region, per image:

| image | parental advisory | parental advisory sticker | sticker | logo |
|---|---|---|---|---|
| images/greenday.jpg | 0.809 | 0.912 | — | 0.556 |
| images/slim.jpg | 0.819 | 0.908 | — | 0.714 |
| 03/…0211da.jpg | 0.915 | 0.939 | 0.356 | 0.805 |
| 0d/…d759bb | 0.867 | 0.911 | — | 0.773 |
| 0f/…aa893 | 0.891 | 0.917 | 0.391 | 0.748 |

At the calibrated 0.578 cut, **`parental advisory` keeps 5 of 5 PA marks; `sticker` keeps
0 of 5** (its two hits are 0.356 and 0.391); `logo` keeps 4 of 5. `parental advisory
sticker` scores highest of all — but it also fires on six non-PA images and on the literal
promo sticker at 0.96, so its high scores are the "sticker" head, not PA recognition.

## Proposal for reviewer ratification (concept set v2)

The reviewer's veto stands over the question set; this is a proposal, not a change.
`config.py` was **not** touched.

| # | change | prompt string sent to SAM | concept tag stored | evidence |
|---|---|---|---|---|
| 1 | **ADD** | `parental advisory` | `parental-advisory` | 5/5 PA images, 0/10 non-PA, 0/2 negatives, scores 0.81–0.92, all above the calibrated cut; masks tight on the badge in all three overlays |
| 2 | **RENAME tag only** | `album title` *(unchanged)* | `album-title` → `display-text` | every alternative main-text phrasing fires 0/15; the incumbent phrasing demonstrably masks the artist name as well as the title (`title-vs-artist.png`), so the honest fix is the tag, not the prompt |
| 3 | **RENAME tag only** | `logo` *(unchanged)* | `logo` → `emblem` | reviewer note 1 — the stored word shouldn't claim provenance. `emblem` as a *prompt* is 2/15 against `logo`'s 12/15 and finds nothing `logo` misses, so keep the phrasing and neutralize the label |
| 4 | **KEEP as-is** | `sticker` | `sticker` | once change 1 takes the PA marks, `sticker` stops being asked to cover a category the reviewer doesn't recognise; on the one true sticker in the set it is 0.93 and tight |
| 5 | **REJECT** | `explicit content`, `brand mark`, `wordmark`, `title text`, `main text`, `large text` | — | 0/15 each. Dead with this model |
| 6 | **REJECT** | `parental advisory sticker`, `advisory sticker`, `parental advisory label` | — | fire on non-PA stickers and crests (up to 0.96 on a promo sticker); higher scores, wrong category |
| 7 | **REJECT** | `emblem`, `badge`, `record label logo` *(as prompts)* | — | strict subsets of `logo`'s regions; `record label logo` fires on all 5 PA marks, so it does not mean "record label" |

Alongside, `CONCEPT_GROUPS["text_like"]` would take `parental-advisory` and the two renamed
tags (`selftest.py` asserts every concept is in exactly one group), and
`overlay.py:CONCEPT_COLORS` needs the same three keys — it asserts equality with
`CONCEPT_PROMPTS` and would fail loudly otherwise.

**Cost if ratified:** any of these changes (including a tag rename) changes
`concept_set_hash()`, which is part of `row_key`, so `sam-eval-142` re-runs in full. That
measured 391 s wall / 2.75 s per image on the last run — about 6.5 minutes. The change is
cheap; the reason to route it through the reviewer is that it is a change to the question,
not to the machinery.

**Ratification path (A5 pattern):** orchestrator decides, reviewer veto stands, the next
mask-quality round ratifies — that round should include the new `parental-advisory` masks
and a handful of `display-text` masks on covers where artist and title compete, since those
are the two claims a human can actually check.

## Ratified and applied — 2026-08-03

The reviewer ratified the proposal above ("new SAM wording sounds good"). Applied to
`oracle/sam/config.py` the same day, exactly as tabled — changes 1, 2 and 3, nothing else;
`sticker`, `words`, `letter`, `lettering`, `person`, `face` untouched. Knock-ons:
`overlay.py:CONCEPT_COLORS` re-keyed (the two renamed tags keep their colours — same prompt,
same pixels, only the stored name changed — and `parental-advisory` gets its own), and
`selftest.py` now imports `overlay` so a concept added without a colour fails the model-free
self-test rather than the first review round. `selftest.py`: ALL PASS.

**Grouping — one departure from the proposal.** The proposal put all three tags in
`CONCEPT_GROUPS["text_like"]`. What shipped is a three-group partition:

    text_like    words, letter, lettering, display-text
    mark_like    emblem, sticker, parental-advisory
    person_like  person, face

A group's only job is the union — `run_sam.py` writes one `<group>_union_area_fraction` per
image so that several words landing on the same pixels count once — and this probe measured
which words land on the same pixels. On all 5 confirmed PA covers, `logo` (now stored as
`emblem`) masks the PA badge at 0.556–0.805 and `sticker` masks it on 2 of the 5; the bbox-IoU
novelty analysis above found every PA region was already covered by an incumbent, and the
incumbents covering it are `logo` and `sticker`, never the glyph words. Leaving those three in
one group with the glyph concepts would have counted the same badge twice inside a single
fraction, which is the double count the union exists to prevent. The group is called
`mark_like` and not `overlay_like` because "overlay" asserts that the thing was added on top —
provenance, which reviewer note 1 says a mask cannot know, and which is the whole reason `logo`
became `emblem`. Full reasoning in the comment above `CONCEPT_GROUPS` in `config.py`.

**Consequence, unchanged from the cost estimate above:** `concept_set_hash()` moved, so the
eval-142 rows under concept set v1 answer a different question and cannot be mixed with v2 rows.
The re-run writes to a **new stem** rather than appending to `sam-eval-142.jsonl`, so v1 stays
intact as the evidence behind round 1's calibration:

    cd research/v3/oracle/sam && ./supervise.sh --eval-set --out sam-eval-142-v2

`review_round.py` (round 1's builder) now refuses to rebuild from a run whose concepts are not
in the current set, so the frozen round-1 manifest cannot be silently regenerated under v2.

The ratification round is built — build-only, not pushed — by `oracle/sam/review_round_2.py`
(the sample and the overlays) and `oracle/sam/build-ratification-fixture.ts` (the fixture),
batch `sam-mask-quality-2-v2-ratification`, reading whatever the re-run above produces.

**Built, 2026-08-03**, against the finished `sam-eval-142-v2` (142/142, 0 failed, 4.25 s/image):
40 items in four passes — 10 `parental-advisory` (the 5 covers confirmed by eye plus 5 on covers
nobody confirmed), 9 `display-text` (including both masks of `images/toxicity.jpg`, the note-5
cover: artist 0.688, title 0.357), 6 `emblem`, and 15 **residual-field** panels asking whether
what survives the masks is the background. One shortfall, recorded rather than papered over:
`images/vvbrown.jpg` produced **zero** `display-text` masks in v2, so the second confirmed
competing-text cover could not be in the round.

## Follow-ups that live elsewhere

- **Probe 3 (salience / non-semantic phrasings)** — run 2026-08-03, 12 covers, 10 phrasings,
  ~2 min GPU. Results, overlays and the proposal are in `SAM_DESIGN_NOTES.md` §3; rows in
  `probe-3-salience.jsonl`. Headline: the attributive-colour family is dead (0 above the
  calibrated cut, including on the two covers picked as its best case), the salience-noun family
  is nearly dead ("the most prominent object" 0/12; nothing at all fires on a cover with one
  unmistakable human subject) — and the control, "the background", fired on 5 of 12 with clean
  field masks, which §8.3 does not expect. Nothing was added to `CONCEPT_PROMPTS`.
- **What a mask may be asked to decide** — `SAM_DESIGN_NOTES.md` §1–2: masks locate mark-shaped
  things and never decide provenance alone; exclusion needs corroboration; the nesting signal is
  measured there (11.7% of `mark_like` instances sit inside a person), including its measured
  false-positive mode.

## Not done here (owned elsewhere)

- The standing-decision record in `research/v3/data/decisions/decisions.json` and the A5
  entry in `research/v3/PHASE_0_LOOSE_ENDS.md` belong to the housekeeping workstream; this
  probe only supplies the evidence and the file references above.
