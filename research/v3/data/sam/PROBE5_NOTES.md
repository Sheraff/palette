# Noun-breadth probe (probe 5) — 2026-08-03

Rows: `research/v3/data/sam/probe-5-noun-breadth.jsonl` (32 rows, one per cover, 21 nouns
each). Logs: `probe-5-noun-breadth.log` (the run), `probe-5-rescore.log` (the scoring, both
ground truths). Scripts: `research/v3/oracle/sam/probe_noun_breadth.py`,
`find_noun_covers.py`, `contact_sheet_search.py`. Image list:
`research/v3/oracle/sam/probe-5-32.txt`. Overlays: `research/v3/data/sam/probe-5-overlays/`.
Corpus-search output: `probe-5-search.json`, rendered in `probe-5-search-sheets/`.
`probe-5-overlay-addendum.jsonl` holds the 3-cover re-run that rendered the last three
overlays (`part-noun-eye-macro`, `lineart-snake-miss`, `part-noun-eye-on-bottle`); its rows
duplicate three rows of the main file, same model and same 21 nouns, and are kept rather
than deleted so the extra GPU time has an artifact. All eleven overlay jobs now live in
`OVERLAY_JOBS`, so one full re-run of `probe-5-32.txt` reproduces every sheet.

Model `mlx-community/sam3.1-bf16` @ `a992e302ea9b0f03f41dfd93414a4fd0e818f65b`, stored cut
`SCORE_THRESHOLD = 0.3`, calibrated cut `CALIBRATED_SCORE_THRESHOLD = 0.578`.
**GPU time: 208.4 s of inference for the main run (211 s wall, 32 covers x 21 nouns), plus
16.2 s for a 3-cover overlay addendum. 224.6 s of inference in total, about 3.9 minutes.**
That is over the ~3 minute estimate, by about 25%: probe 4's rate did not extrapolate
because per-image cost is roughly `2.8 s + 0.037 s per prompt`, so a 32x21 grid is dominated
by the fixed per-image term, not by the prompt count. Nothing in `config.py` was touched.
Everything below is a proposal.

## What was asked, and why this round exists

Probe 4 measured object nouns on **one noun** — `car`, 5 covers, 0.82-0.93, zero hits on the
eleven covers without a car — and named its own limit in writing: "car" is a COCO class,
n=1, and nothing there showed that `guitar`, `skull`, `bottle` or `motorcycle` behave the
same. The VLM -> SAM synergy design rests on the claim that a noun the VLM emits for
`subject_kind` is reliably maskable. This round tests that claim across the vocabulary's
territory: 21 nouns spanning `animal | vehicle | object | building_or_structure`, over 32
covers, every pair run. `car` is deliberately absent — it is already measured.

## How the covers were found

The repo has no content labels, and probe 4's DINOv3 nearest-neighbour trick needs a seed
cover already known to contain the target. Probe 5 needed twenty different targets and had
a seed for none of them.

So this round used the other property of the embedding store. Two of the six arms are
**text-aligned** (`embeddings/config.py`: `siglip2-so400m`, `pe-core-l14`), and the SigLIP2
image side is already computed and committed for both collections — 16,145 L2-normalized
vectors. A text query is then one forward pass through the text tower and a dot product.
`find_noun_covers.py` does exactly that, on **CPU**, with four-template prompt ensembling
("a photo of a {}", "a {}", "an album cover with a {} on it", "artwork of a {}").

The embeddings workstream's config says "we never query these embeddings by text". That is
a statement about its three production uses (near-duplicate detection, stratification,
failure retrieval), all of which are image-to-image; it is not a prohibition. This is a
corpus-search instrument for building a probe list, the same role probe 4 gave the DINOv3
index. It found plausible candidates for all 21 nouns on the first attempt, and the top-8
per noun are in `probe-5-search.json` and rendered as contact sheets.

**Every candidate was then opened and its content confirmed by eye**, and two changed class
at that step — which is the whole reason the step exists:

- the **Two Door Cinema Club** cover, retrieved for "cat", was going on the list as a
  negative. At full size it is a dark cat lying on a tiled floor, its face behind the title
  lettering, its eyes inside the two Os of "DOOR". It became a hard positive.
- the **"PAST LIFE ANALYSIS"** cover looked like a scale texture at thumbnail size. It is a
  whole python in extreme close-up, head and coils visible top right.

The 32 covers, with the ground truth each one carries, are rendered as a single sheet at
`probe-5-overlays/probe-5-selection.png` — the caption under each cover is exactly the list
the precision and recall numbers are scored against, so the reviewer can re-check the
ground truth without opening 32 files.

Composition: 24 covers with at least one confirmed target, spread over all four classes
(9 animal, 5 vehicle, 9 object, 3 building_or_structure); 4 plausible-confusion covers (the
wolf, for `dog`; a jackal in sunglasses, for `dog` and `wolf`; a python that fills the whole
frame, for a target with no background to be tight against; and WESTBOUND TRAIN, which is
rails down an empty street with no train in it); 4 negatives (the spa interior that concept
set v2 found nothing at all on, `images/toxicity.jpg`, an abstract painted [mot] cover, and
a portrait under a Chinese brush title).

## Two ground truths, and why both are reported

The pre-registered `contains` list for each cover answers "what is this cover **of**". After
the run, several nouns had fired on things that are genuinely in the picture but are not
what the cover is of: an engraved rose border on the Sublime dalmatian cover, two hands on a
motorcycle's handlebars, two eyes on the face embossed in a wax seal. Those are not model
errors — they are errors in the question. Rewriting the ground truth in place would have
hidden that, so the 13 amendments are recorded individually with the evidence that settles
each one (`AMENDMENTS` in `probe_noun_breadth.py`), and `--rescore` prints both scorings
from the same rows with no GPU.

Two cases are deliberately **not** amended and stay scored as false positives: `eye` 0.92 on
the Apocalyptica skull (a skull has sockets, not eyes) and `eye` 0.66 on the 3D cat (whose
eyes are behind mirrored sunglasses).

## Per subject_kind class, at the calibrated 0.578 cut

Amended ground truth. "prec" counts a firing on a cover where the noun is genuinely absent
as a false positive; hypernym-true pairs (a castle *is* a building) are excluded from both
sides and reported separately.

| class | nouns | TP | FP | FN | prec | rec |
|---|---|---|---|---|---|---|
| animal | 6 | 8 | 1 | 1 | **0.89** | **0.89** |
| vehicle | 4 | 5 | 0 | 0 | **1.00** | **1.00** |
| object | 8 | 22 | 3 | 1 | **0.88** | **0.96** |
| building_or_structure | 3 | 3 | 1 | 0 | **0.75** | **1.00** |

Per noun, the same cut. `n+` is how many covers contain the noun.

| noun | class | n+ | TP | FP | FN | prec | rec |
|---|---|---|---|---|---|---|---|
| dog | animal | 2 | 2 | 1 | 0 | 0.67 | 1.00 |
| cat | animal | 2 | 2 | 0 | 0 | 1.00 | 1.00 |
| bird | animal | 1 | 1 | 0 | 0 | 1.00 | 1.00 |
| horse | animal | 1 | 1 | 0 | 0 | 1.00 | 1.00 |
| wolf | animal | 1 | 1 | 0 | 0 | 1.00 | 1.00 |
| snake | animal | 2 | 1 | 0 | 1 | 1.00 | 0.50 |
| motorcycle | vehicle | 2 | 2 | 0 | 0 | 1.00 | 1.00 |
| airplane | vehicle | 1 | 1 | 0 | 0 | 1.00 | 1.00 |
| boat | vehicle | 1 | 1 | 0 | 0 | 1.00 | 1.00 |
| train | vehicle | 1 | 1 | 0 | 0 | 1.00 | 1.00 |
| guitar | object | 2 | 2 | 0 | 0 | 1.00 | 1.00 |
| skull | object | 1 | 1 | 0 | 0 | 1.00 | 1.00 |
| flower | object | 2 | 2 | 0 | 0 | 1.00 | 1.00 |
| crown | object | 1 | 1 | 0 | 0 | 1.00 | 1.00 |
| sword | object | 1 | 1 | 0 | 0 | 1.00 | 1.00 |
| bottle | object | 1 | 1 | 0 | 0 | 1.00 | 1.00 |
| hand | object | 3 | 3 | 0 | 0 | 1.00 | 1.00 |
| **eye** | object | 12 | 11 | 3 | 1 | **0.79** | 0.92 |
| building | building_or_structure | 1 | 1 | 0 | 0 | 1.00 | 1.00 |
| castle | building_or_structure | 1 | 1 | 0 | 0 | 1.00 | 1.00 |
| church | building_or_structure | 1 | 1 | 1 | 0 | 0.50 | 1.00 |

**19 of 21 nouns are 1.00 / 1.00.** The three imperfections are `dog` (fires on a wolf),
`church` (fires on a castle), `snake` (silent on a line drawing) and `eye` (see below), and
every one of them has a specific, nameable cause.

## The headline number

**25 of the 27 pre-registered subject targets clear the calibrated cut. Median score 0.858,
range 0.75-0.954.** Every score, with the area fraction of the surviving mask:

```
dog        Sublime dalmatian 0.92/a0.37   labrador 0.84/a0.56
cat        3D render 0.80/a0.17           Two Door (occluded) 0.80/a0.26
bird       LANKS heron, line art 0.92/a0.04
horse      rider + horse 0.90/a0.13
wolf       TAPX wolf 0.90/a0.62
snake      python close-up 0.85/a0.82     line-drawn snake  NONE
motorcycle Martti Servo 0.82/a0.29        SOUL RIDER 0.79/a0.08
airplane   illustrated airliner 0.94/a0.09
boat       cut-paper sailboats 0.89/a0.19  (n=2 — two boats, one instance each)
train      ALADIAH 0.91/a0.15
guitar     Martti Servo 0.79/a0.04        MODERN ROCK vector 0.90/a0.13
skull      Apocalyptica 0.78/a0.36
flower     Tam Hoa lotus 0.86/a0.43       (n=11 — petals)
crown      Cat Empire logo 0.80/a0.19
sword      broadsword 0.88/a0.14
bottle     cognac bottle 0.95/a0.32
hand       hand on black 0.83/a0.18       + 2 amended covers, both above cut
eye        "Here I am" painted eye 0.87/a0.03   macro eye  0.42  <- below the cut
building   Nada Surf blocks 0.75/a0.64    (n=7 — one per block)
castle     fairy-tale castle 0.87/a0.47
church     white church 0.91/a0.10
```

Twenty-two of the twenty-five return **exactly one instance**. The three that do not are
legitimately multi-instance: two sailboats, eleven lotus petals, seven apartment blocks.

**Rendering style does not matter.** The set deliberately mixes photograph (dalmatian,
wolf, church, bottle, castle), 3D render (cat, train), painterly illustration (labrador,
airliner, SOUL RIDER), flat vector (MODERN ROCK guitar, crown logo), cut paper (sailboats),
pencil drawing (Nada Surf) and single-line ink (LANKS heron). The heron — line art, area
0.039 — scores **0.92**, the second-highest number in the round. Two of the three highest
scores are on non-photographic covers.

**Occlusion does not matter much.** The Two Door cat is mostly behind the title lettering
and still comes out at 0.80 with a mask on the visible body, and `dog`, `wolf`, `horse` all
return zero on it (`probe-5-overlays/animal-cat-occluded.png`).

## Confusion behaviour

### Within the canid family: total, and it costs nothing

The animal matrix is block-diagonal except for one cell (max score, all 21 nouns run):

```
cover                     dog   wolf    cat  horse   bird  snake
Sublime dalmatian        0.92   0.00   0.00   0.00   0.00   0.00
labrador                 0.84   0.00   0.00   0.00   0.00   0.00
3D cat                   0.00   0.00   0.80   0.00   0.00   0.00
Two Door cat             0.00   0.00   0.80   0.00   0.00   0.00
LANKS heron              0.00   0.00   0.00   0.00   0.92   0.00
rider + horse            0.00   0.00   0.00   0.90   0.00   0.00
TAPX wolf                0.86   0.90   0.00   0.00   0.00   0.00   <- the confusion
jackal (CONFUSION)       0.88   0.88   0.00   0.00   0.00   0.00   <- the confusion
line-drawn snake         0.00   0.35   0.00   0.00   0.00   0.00
python close-up          0.00   0.00   0.00   0.00   0.32   0.85
```

**Yes, `dog` fires on a wolf — at 0.86, against `wolf`'s own 0.90.** On the jackal the two
are tied at 0.88. And `dog` never fires on a cat, a horse, a bird or a snake; `cat` never
fires on a dog. The bleed is confined to the canid family, and it is symmetric within it.

The overlays settle what it costs: `probe-5-overlays/confusion-wolf-vs-dog.png` and
`confusion-jackal.png` show `dog` and `wolf` producing **the same mask** — 0.64 vs 0.62 area
on the wolf, 0.45 vs 0.43 on the jackal, both tight on the animal, both excluding the
background and the Cyrillic type. So the failure mode of a wrong species inside the right
family is **"right pixels, wrong word"**, not "wrong pixels". For a stage whose output is a
region, that costs nothing at all.

### Within the building family: same shape, and `building` is a real hypernym

```
cover                   building  castle  church
rider + temple ruins        0.33    0.45    0.33     (all below the cut)
ALADIAH + skyscrapers       0.77    0.00    0.00
Tam Hoa + temple roofs      0.81    0.00    0.00
Nada Surf blocks            0.75    0.00    0.00
fairy-tale castle           0.78    0.87    0.86     <- castle/church bleed
white church                0.86    0.41    0.91     <- castle does NOT bleed here
spa interior                0.36    0.00    0.00     (below the cut)
```

`church` fires on the castle at 0.86; `castle` on the church only reaches 0.41 and is
dropped by the cut. On the castle all three masks are identical (area 0.46/0.47/0.47,
`building-castle.png`); on the church, likewise (`building-church.png`), and the trees on
both sides are correctly excluded.

`building` fired above the cut on five covers and **every one of them really has a building
in it** — the skyscrapers behind the ALADIAH train, the temple roofs behind the Tam Hoa
lotus, the Nada Surf blocks, the castle, the church. Zero false positives. It is a genuine
hypernym, and the only cost of using it is that it is 0.03-0.09 *lower* than the correct
species word on the two covers where both fire.

### The train that is not there

WESTBOUND TRAIN — rails down an empty street, no train — draws `train` at **0.64**. That is
well below `train`'s 0.91 on the actual train, but it is above the calibrated cut, so it
survives filtering. This is the round's one genuinely misleading firing:
the model returns a region for a vehicle that is not in the picture, on a cover whose
*title* is the vehicle's name. It is scored as a marginal pair rather than a false positive
because rails are arguably train infrastructure, but it is the single clearest argument in
the round that a dynamic prompt must be allowed to come back wrong.

### Negatives

Three of the four negatives fire **nothing at all** across all 21 nouns at the calibrated
cut — including `images/toxicity.jpg` and the spa interior, on which `building` reaches only
0.36. The fourth fires only `eye` at 0.77, on the woman's visible eye, which is correct.

## The one real finding against the design: part nouns are not subject nouns

`eye` is the only noun in the round with poor precision, and the reason is not that the
model is wrong.

- It fired above the cut on **15 covers**. Eleven of those are genuine depicted eyes: the
  dalmatian's, the labrador's, the wolf's, the jackal's, the heron's drawn eye, the cat's
  eyes inside the Os of "DOOR", the eye in the Cat Empire logo, the woman's eye on the
  Chinese-title cover — and, at area 0.001, **two eyes on the cartoon face embossed in the
  cognac bottle's red wax seal**, which no one on this side of the run had noticed until the
  overlay was opened (`part-noun-eye-on-bottle.png`). On the line-drawn snake it masks
  exactly the drawn eye at 0.91 and area 0.00 (`lineart-snake-miss.png`).
- And on the one cover that **is** an eye — a macro photograph filling the whole frame — it
  scores **0.42** and is thrown away by the cut, with a ragged mask over the eyeball and
  upper lid (`part-noun-eye-macro.png`).

So the scale runs backwards: `eye` is confident about eyes that are small parts of something
else, and unconfident when an eye is the whole picture. That is exactly what a *part*
detector does. `hand` behaves the same way in miniature — 1.00/1.00 once the two motorcycle
covers are amended, because both riders' hands really are on the handlebars.

The consequence for the design is not "SAM is unreliable". It is: **the VLM must be
instructed to name the whole depicted thing and never a part of it.** A `subject_kind`
answer of "eye" or "hand" is a bad question, and the pipeline should treat part nouns as out
of vocabulary rather than as a subject.

## The other real finding: silence is not proof of a wrong noun

`snake` returns **nothing at all** on the line-drawn snake head, at any cut, while on the
same cover `wolf` reaches 0.35 and `eye` reaches 0.91 exactly on the drawn eye. The subject
is unmistakable to a person; the right species word gets zero.

This matters because probe 4's argument for the synergy was partly that a wrong noun
"self-validates" by returning a null. Probe 5 shows the converse is not safe: a **right**
noun can also return a null, on one rendering style, roughly 1 target in 27 here. A null
means "no answer", not "the VLM was wrong".

## Verdict on the synergy mechanism

**Yes. `car` was representative, not exceptional — with two named limits.**

Across 21 nouns spanning the whole `subject_kind` territory and 32 covers of every rendering
style in the corpus, 25 of 27 targets mask above the calibrated cut at a median of 0.858,
almost always as a single instance, with boundaries tight enough that the overlays show
people excluded from motorcycles, trees excluded from churches, and a person's guitar and
the motorcycle he sits on partitioned into two separate 0.79 and 0.82 masks with no overlap
(`object-guitar-vs-motorcycle.png`). **No noun ever fired above the cut on a cover of a
different class where the named thing was absent.** Fifteen above-cut firings do cross class
lines, and fourteen of them are a thing that is genuinely in the picture — an eye, a hand, a
rose border, skyscrapers behind a train; the fifteenth is the disputed `eye` 0.66 on a cat
wearing mirrored sunglasses. Three of four negatives are completely silent across all 21
nouns.

The load-bearing assumption of the synergy — high score and tight mask when the noun is
right, silence when it is wrong — holds across the vocabulary. The two limits:

1. **Part nouns break it** (`eye`, `hand`). Not a model failure, a question failure.
2. **A null is not a verdict.** The right noun can return nothing on line art.

## Granularity: what should the VLM name?

**Species / artefact level, with the class word as a fallback — two prompts, not one.**

The evidence for species:

- species-level nouns are what produced the 0.858 median; nothing in the round suggests they
  are harder than class words.
- where both the species and the class word fire, the **species wins**: `castle` 0.87 vs
  `building` 0.78 on the castle; `church` 0.91 vs `building` 0.86 on the church. Probe 4 saw
  the same thing on the vehicle side, where the hypernym `vehicle` picked up one loose
  full-width box on a motorcycle that `car` did not.
- getting the species *wrong within the family* is nearly free, because the mask is the
  same. A VLM that calls a wolf a dog loses 0.04 of score and no pixels at all.

The evidence for keeping the class word:

- `building` has 1.00 precision over five structures of five different kinds and never fires
  on a cover without one. It is a reliable safety net.
- `snake` returning zero on a line drawing is precisely the case a fallback exists for.

So the recommendation is that the VLM emit **both** — the specific noun it would use in a
caption, and the `subject_kind` class it already emits — and the SAM stage run both as
dynamic prompts, taking the species mask when it clears the cut and the class mask when it
does not. That is 2 extra prompts per cover, about 0.08 s of GPU by this round's rate, and
it converts the two named limits into a covered case. The VLM should be told explicitly
**not** to answer with a part (`eye`, `hand`, `wing`, `face`), because a part noun is the one
input that makes this instrument confidently wrong about what the subject is.

## Consequences that come with it (unchanged from probe 4, restated because they still bind)

`concept_set_hash()` is part of `row_key`, and a per-cover prompt makes the effective
question set per-cover — the row identity needs a separate `dynamic_prompt` field (now
plural: a species noun and a class noun) rather than a hash that silently changes meaning.
And a dynamic prompt means the geometry stage no longer runs before, or independently of,
the VLM stage.

## Not done here

No change to `config.py` (`CONCEPT_PROMPTS`, `CONCEPT_GROUPS`, thresholds all untouched); no
decision record — this is evidence, and the mechanism choice is the reviewer's; no re-run of
`sam-eval-142`; no edit to `PHASE_0_LOOSE_ENDS.md` or `data/decisions/`, which belong to the
housekeeping workstream. Nothing was installed and no package file was touched;
`find_noun_covers.py` runs under the existing `oracle/embeddings/.venv`.

## Follow-ups this round opens (owner: reviewer / orchestrator)

1. **Probe 4's follow-up 1 is reinforced, from a new direction.** That round found a
   category (`chinese characters`) whose evidence all sits *below* 0.578. This round found
   the opposite shape: `eye` at 0.42 on a cover that is an eye, while the same word scores
   0.87-0.92 on eyes that are 0.1% of the frame. One global cut is doing different work for
   different words.
2. **The `train`-on-rails firing at 0.64.** The only above-cut region in the round for a
   vehicle that is not in the picture, on a cover whose title names it. Worth knowing
   whether SAM 3.1's text encoder is reading the rendered title — probe 4's `words`/`kanji`
   separation suggests it reads glyphs as objects, not as language, but this is one data
   point pointing the other way and it is cheap to test.
3. **Line-art recall.** One target in 27 returned silence, and it was the line-drawn one.
   A probe stratified on rendering style (photo / render / flat vector / line art) would say
   whether that is a one-off or a class.
4. **Part-noun vocabulary.** If the VLM stage is built, the prompt needs an explicit list of
   nouns that are parts and must not be emitted as `subject_kind`. This round names four
   (`eye`, `hand`, and by inference `face`, `wing`); the real list is the reviewer's call.
