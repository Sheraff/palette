# Script / object / overlay probe (probe 4) — 2026-08-03

Rows: `research/v3/data/sam/probe-4-scripts-objects.jsonl` (16 rows, one per image).
Log: `research/v3/data/sam/probe-4-scripts-objects.log`.
Script: `research/v3/oracle/sam/probe_scripts_objects.py`. Image list:
`research/v3/oracle/sam/probe-4-16.txt`. Overlays: `research/v3/data/sam/probe-4-overlays/`.

Model `mlx-community/sam3.1-bf16` @ `a992e302ea9b0f03f41dfd93414a4fd0e818f65b`, stored cut
`SCORE_THRESHOLD = 0.3`, calibrated cut `CALIBRATED_SCORE_THRESHOLD = 0.578`.
**GPU time: 51.6 s of inference, 54.5 s wall for the whole run** (16 images x 14 phrasings).
Nothing in `config.py` was touched. Everything below is a proposal.

## What was asked

The reviewer's residual round (`sam-mask-quality-2-v2-ratification`, fixture
`mask-quality-2-sample.json`) judged 7 of 15 residuals only *partly* field, and named two
misses. This probe finds out whether the model can be asked for those two things directly.

## Which covers the two named misses actually are

Both were found by opening the round-2 residual overlays and looking.

| item | cover | what is left standing in the residual |
|---|---|---|
| `smq2f-02b3899bac5b` | `10/ab67616d0000b27300100a3e9c764acf01c16db8` | Rose Liu. `person` takes the whole figure, `letter` takes the Latin "Rose Liu" — and the six large Chinese characters 没有你的天冬 plus the small 刘明湘 are left in the field. Residual fraction 0.427. |
| `smq2f-3394ee31e933` | `00/ab67616d0000b27300002947b898e4bd572ac4aa.jpg` | "GOALS". A Mercedes G-class fills the middle of the cover; concept set v2 masked the word GOALS, one small strip at the bottom, and the grille badge. Residual fraction **0.969** — the pipeline called a cover that *is* a car 97% field. |

Diagnosis, before any new measurement: concept set v2's glyph words (`words`, `letter`,
`lettering`, `album title`) all name a **Latin** unit, and the set has **no noun for any
object that is not a person, a face or a mark**. Neither miss is a recall failure inside a
category the set covers; both are categories the set does not ask about.

## Selection (why these 16, and not a random sample)

Every image was opened and its content confirmed by eye before it went on the list. The two
misses, then eight more covers with the same content, then negatives:

- **CJK (4)** — the Rose Liu miss; `03/…f2b6590090abe420d104.jpg` (佛前等花开, six large
  characters across the top); `08/…f7b7f01d9149dbe92fa0` (森昌子 / こころ雪, a *vertical*
  kanji column, no Latin at all); `10/…106c3252a4c133c0abde36` (言葉を恐れる set directly
  under a Latin line inside one box — the cleanest test of whether the model separates the
  two scripts).
- **Non-Latin but not CJK (3)** — Korean hangul, Thai, Malayalam. These decide whether the
  CJK phrasings mean *this script* or merely *not-Latin*.
- **Vehicles (5, incl. the GOALS miss)** — an illustrated sedan, an illustrated jeep, a
  photoreal Lamborghini, and a red saloon with four people standing around it (the last one
  tests whether the car noun and `person` fight over the same pixels).
- **Barcodes (2)** — the peel-off promo sticker carrying a real EAN barcode
  (`03/…3580bd2766859c4d81e13.jpg`, the same cover reviewer note 1 was about), and a parcel
  with a printed shipping label.
- **Negatives (2)** — the spa interior on which concept set v2 found *nothing at all*
  (`smq2f-86b12169135a`, residual 1.000), and `images/toxicity.jpg`, Latin display type only.

Eight of the sixteen are members of the 142-image premise eval set, so their eval-142 rows
are available for comparison. The other eight (three CJK, three vehicles, one barcode, one
control) do not exist in the eval set at all and were found by DINOv3 nearest-neighbour
search from the two miss covers over the whole 7,550-image sharded collection
(`data/embeddings/sharded.dinov3-vith16plus.npy`, CPU, no GPU) — the embeddings workstream's
index used as a corpus-search instrument, which is the cheapest way to find "more covers like
this one" that exists in the repo.

## Phrasings (14)

`cjk_script`: chinese characters, characters, asian text, hanzi, kanji, calligraphy,
foreign text. `object_noun`: car, vehicle, the car. `applied_overlay`: barcode, watermark.
`control`: text (probe 1 measured it at 0/10 — it should stay at zero), words (the incumbent
glyph concept from set v2).

`kanji` was added to the reviewer's list as the Japanese counterpart of `hanzi`: two of the
four CJK covers are Japanese, and a script endonym that only covers half the family would be
scored unfairly.

## Hit rates

Images (of 16) where the phrasing fired at the stored 0.3 cut / at the calibrated 0.578 cut,
then precision and recall against the content confirmed by eye. "n=" is how many of the 16
covers actually contain the target.

| phrasing | fired | fired ≥0.578 | TP | FP | FN | prec | rec |
|---|---|---|---|---|---|---|---|
| **chinese characters** | 4 | **0** | 4 | 0 | 0 | **1.00** | **1.00** (n=4 CJK) |
| characters | 4 | 2 | 0 | 4 | 4 | 0.00 | 0.00 |
| asian text | 0 | 0 | 0 | 0 | 4 | — | 0.00 |
| hanzi | 1 | 0 | 1 | 0 | 3 | 1.00 | 0.25 |
| **kanji** | 3 | **2** | 3 | 0 | 1 | **1.00** | 0.75 |
| calligraphy | 3 | 0 | 2 | 1 | 2 | 0.67 | 0.50 |
| foreign text | 0 | 0 | 0 | 0 | 4 | — | 0.00 |
| **car** | 5 | **5** | 5 | 0 | 0 | **1.00** | **1.00** (n=5 vehicles) |
| **vehicle** | 6 | **5** | 5 | 1 | 0 | 0.83 | **1.00** |
| **the car** | 5 | **5** | 5 | 0 | 0 | **1.00** | **1.00** |
| **barcode** | 1 | 1 | 1 | 0 | 1 | **1.00** | 0.50 (n=2) |
| watermark | 9 | 4 | — | — | — | see below | |
| text (control) | **0** | 0 | 0 | 0 | 11 | — | 0.00 |
| words (control) | 12 | 6 | 9 | 3 | 2 | 0.75 | 0.82 (n=11 Latin) |

Max scores, per phrasing, on the covers that contain the target:

```
chinese characters   roseliu:0.39  佛前:0.39  森昌子:0.47  言葉:0.38     <- ALL below 0.578
kanji                roseliu:0.37  佛前:none  森昌子:0.60  言葉:0.64
hanzi                roseliu:none  佛前:none  森昌子:none  言葉:0.32
car                  GOALS:0.85  sedan:0.93  jeep:0.92  lambo:0.89  saloon:0.92
vehicle              GOALS:0.88  sedan:0.91  jeep:0.93  lambo:0.82  saloon:0.90
the car              GOALS:0.87  sedan:0.93  jeep:0.93  lambo:0.90  saloon:0.93
barcode              sticker:0.94   parcel:none
```

Three results carry the round:

1. **`text` fired on 0 of 16.** Probe 1's floor still holds under a completely different
   image set, so every other number here is measured against a live zero.
2. **The CJK words are score-poor, not recall-poor.** `chinese characters` is 4/4 with zero
   false positives — and its best score anywhere is **0.472**. The calibrated cut of 0.578
   throws away *all four* recoveries. `kanji` is the only script word that clears the cut,
   and only on the two Japanese covers (0.60, 0.64).
3. **The object nouns behave like a different instrument.** 0.82–0.93 on all five vehicles,
   every one clearing the calibrated cut with room to spare, and zero hits on the eleven
   covers with no vehicle. That is the strongest, cleanest signal any SAM probe in this
   project has produced.

Determiner: **it does not matter.** `car` and `the car` fire on exactly the same five covers
with the same instance counts; `the car` scores 0.01–0.04 higher on four of five, which is
noise at this n. `vehicle` is the hypernym and behaves like one — same five covers, plus one
loose extra hit (0.577, a full-width box over the bottom third of the Malayalam cover, which
does contain a motorcycle in its lower left but is not tightly masked). Recommendation: use
one phrasing, not three; the union buys nothing here.

## What the masks actually cover (overlays, looked at)

All eight sheets are in `data/sam/probe-4-overlays/`, two rows each: whole image per
phrasing, then the same masks cropped to the target.

- **`cjk-roseliu-THE-MISS.png`** — the decisive one. `chinese characters` (n=6, max 0.39)
  puts tight, glyph-shaped masks on 没 有 你 的 冬 天 *and* on the small 刘明湘 and "Rose
  Liu". `kanji` (n=9) and `calligraphy` (n=11) cover the same glyphs slightly more
  generously. `characters`, `asian text`, `hanzi`, `foreign text` and **`words`: nothing at
  all**. So the miss is exactly reproducible and exactly repairable — the incumbent glyph
  word is blind on this cover, and a script word is not.
- **`cjk-japanese-inline.png`** — the cleanest evidence in the round. On the FEARING WORDS /
  言葉を恐れる cover, `words` (0.59) masks **only the Latin line** and `kanji` (0.64) masks
  **only the Japanese line**, each ignoring the other. Two scripts, two words, no overlap.
- **`cjk-japanese-vertical.png`** — `kanji` (n=12, max 0.60) takes every glyph of the
  vertical 森昌子 / こころ雪 column and the 美しき大地 line, per-glyph and tight.
  `chinese characters` (0.47) takes a subset. Here `words` *does* fire (0.50) and covers part
  of the same column — so the incumbent is not uniformly blind to CJK; it is unreliable on
  it.
- **`cjk-fofront.png`** — `chinese characters` (0.39, area 0.09) covers all six large
  brush-drawn characters as one region. Coarser than the Rose Liu masks (it fills between
  strokes) but on the right pixels. Every other phrasing: nothing.
- **`car-goals-THE-MISS.png`** — `car` / `vehicle` / `the car` return one instance each,
  0.85–0.88, area 0.155, outlining the G-class body, mirrors and grille precisely. The only
  part missed is the very dark lower skirt where the body merges into the black road. The
  residual on this cover goes from 0.969 to about 0.81 on this one mask.
- **`car-vs-people.png`** — the red saloon is masked (0.92, area 0.10) with the person
  standing in front of it **excluded**, cleanly, along their silhouette. The object noun and
  the person concept are not competing for pixels; they partition them.
- **`car-lamborghini.png`** — two instances: the car (0.89, area 0.31) and its **reflection
  in the wet ground** (0.38, area 0.16). The calibrated cut keeps the car and drops the
  reflection, which is the behaviour you want and is a small independent vote for 0.578.
- **`barcode-sticker.png`** — `barcode` (**0.94**, area 0.019) masks the printed bars and
  nothing else: not the sticker it sits on, not the number underneath it, not the lettering
  above it. Surgical. `watermark` fires 0 here; `words` takes the sticker's lettering and
  leaves the bars alone. The second barcode cover (a shipping label at maybe 40 px across)
  returns nothing — recall 1/2, precision 1/1.

`watermark` deserves a footnote rather than a verdict. It fired on 9 of 16, which reads like
junk, but its four hits **above** the calibrated cut are: the "Made with PosterMyWall.com"
credit strip along the bottom of the GOALS cover (0.69), the Muzik247 channel logo in the
top-right corner of the Malayalam cover (0.76), and the crest plus the parental-advisory
badge at the bottom of the red-saloon cover (0.66, 0.62) — three of four are genuine applied
overlays, small and corner-placed; the fourth (0.60 on `toxicity`) is on the title lettering.
That is interesting for `mark_like` and it is n=4. It is not a proposal, it is a next probe.

## Does this justify the VLM → SAM synergy design?

Yes, on the object side, and with a named limit.

The design is: the VLM names `subject_kind`, SAM masks the named noun. Its load-bearing
assumption is that **SAM's score is high and its mask is tight when the noun is right, and it
returns nothing when the noun is wrong** — because the VLM's answer is then self-validating,
and a wrong `subject_kind` costs a null rather than a plausible-looking wrong region. On five
vehicle covers that is exactly what happens: 0.82–0.93 with tight boundaries when the noun
matches, 0/11 when it does not, one instance per object, the person correctly excluded, the
reflection correctly scored below the cut. Object nouns are not a marginal capability of this
model; they are its strongest.

The limit: this is measured on **one noun** ("car"), 5 covers. "Car" is a COCO-class object
and near-certainly over-represented in SAM 3.1's training. Nothing here shows that "guitar",
"skull", "bottle" or "motorcycle" behave the same, and the one hypernym data point
(`vehicle`, loose box on a motorcycle) is a hint that they may be softer. The honest claim is
**"object nouns work well enough that the synergy design is worth building"**, not "any noun
the VLM emits will mask cleanly". A noun-breadth probe (one probe, ~20 nouns x ~20 covers,
under two minutes of GPU by this round's rate) would convert the hint into a number, and it
should run before the design is committed to.

## Proposal: dynamic per-cover prompting, not concept set v3

Two mechanisms are available. The measurements point at different ones for the two misses.

**For the CJK miss — a static concept-set addition, but it is blocked on the cut.**
`chinese characters` has perfect precision and perfect recall over four CJK covers and is
silent on twelve non-CJK covers, including three that are non-Latin (Korean, Thai, Malayalam)
— it means *this script*, not *not-Latin*, which is the property that makes it safe to add.
Its masks are glyph-tight. And **every one of its scores is below the calibrated 0.578 cut**,
so adding it changes nothing for any consumer that filters at the calibrated threshold. There
are only three honest ways forward and all three are the reviewer's call:

  * add `("cjk-script", "chinese characters")` to `CONCEPT_PROMPTS` **and** give it a
    per-concept threshold near 0.35 — which means admitting that one global cut was always a
    simplification, and that the 0.578 calibration was fitted on set-v2 categories that this
    one is not a member of;
  * add both `chinese characters` and `kanji` as one group and let the union carry it —
    `kanji` clears the cut on the Japanese covers, so the group would survive calibrated
    filtering on 2 of 4 CJK covers instead of 0 of 4;
  * add nothing and record the finding, on the grounds that a category whose evidence all
    sits below the cut is not yet ready to move a palette.

  My recommendation is the second, plus a *calibration* item: probe 4 is the first evidence
  that the single global cut is category-dependent, and the round that set 0.578 could not
  have seen it, because no CJK cover was in it.

**For the car miss — dynamic per-cover prompting. Not a concept-set addition.** A static set
cannot carry object nouns and it should not try. The nouns that matter are unbounded (car,
guitar, skull, bottle, horse, motorcycle, …), the cost is linear in the number of prompts,
and the value of any one of them on a random cover is near zero — `car` earns its 0.9 on five
covers out of sixteen *because those five were chosen for containing a car*. On the eval set
the same prompt would be dead weight on ~135 of 142 images. What probe 4 shows is not "add
`car` to the set"; it is that **when something tells you the noun, SAM will mask it, at a
score that clears the calibrated cut without special pleading**. That is precisely a dynamic
prompt: the VLM (or any subject classifier) emits `subject_kind`, and the SAM stage runs the
fixed set **plus** that one extra prompt for that one cover.

  Consequences that have to be accepted with it, stated plainly because they are real costs:
  `concept_set_hash()` is currently part of `row_key`, and a per-cover prompt makes the
  effective question set per-cover — so the row identity needs a separate field
  (`dynamic_prompt`) rather than a hash that silently changes meaning; and a dynamic prompt
  means the geometry stage no longer runs before, or independently of, the VLM stage.

**`barcode` is the one clean static addition in this round.** 0.94, mask exactly on the bars,
zero false positives on fifteen other covers including one carrying a different printed
label. It belongs in `mark_like` with `parental-advisory` — same argument, a distributor-
applied artefact of near-constant size that should not be read as artwork field. Recall is
1 of 2 (it misses a ~40 px shipping-label barcode), which is the usual §8.3 recall story and
an argument for keeping it, not against.

**Rejected outright** (measured, not judged): `asian text` 0/16 and `foreign text` 0/16 — the
fourth and fifth confirmations of the pattern probes 2 and 3 found, that a phrasing naming a
*property* or a *relation* rather than a *thing* returns nothing from this model, ever.
`characters` 4 hits and 0 of them on a CJK cover — the bare noun means "cartoon characters"
here, and it is the reason the qualifier in `chinese characters` is doing the work, not
decoration. `hanzi` 1/4 — a script endonym is too rare a word. `calligraphy` 0.67 precision
and never above the cut. `watermark` — not yet.

## Follow-ups this round opens (owner: reviewer / orchestrator; recorded here, not in ledgers this workstream does not own)

1. **The calibrated cut is category-dependent.** 0.578 was fitted on concept-set-v2 masks and
   discards a category with 4/4 precision *and* 4/4 recall. Either per-concept cuts, or an
   explicit statement that the global cut is a floor for the v2 categories only.
2. **Noun-breadth probe** before the VLM→SAM synergy is committed: ~20 object nouns over ~20
   covers, to find out whether "car" is representative or exceptional. Est. 2 min GPU.
3. **`watermark` / applied-overlay probe**: 4 above-cut hits, 3 of them genuine credit marks
   and channel logos. A category `mark_like` would want, on evidence too thin to act on.
4. **Rounds 1 and 2 never contained a CJK cover or a vehicle cover as a *mask* item** — both
   misses were only visible in the residual section. Whatever round 3 is, it should stratify
   on cover content, not only on score band and residual fraction.

## Not done here

No change to `config.py` (`CONCEPT_PROMPTS`, `CONCEPT_GROUPS`, thresholds all untouched); no
decision record (this is evidence, and the mechanism choice is the reviewer's); no re-run of
`sam-eval-142`; no edit to `PHASE_0_LOOSE_ENDS.md` or `data/decisions/`, which belong to the
housekeeping workstream — items 1–4 above are written here for that workstream to pick up.
