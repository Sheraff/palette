<!-- Phase 1 author packet — provenance
     source: research/v3/ORACLE_QUESTION_SET.md
     commit: 71a1d62d51006dd8f353e8c0bc6e4434bdb0c4b2
     date:   2026-08-04
     This file is a verbatim EXTRACT of the source above: the question ids, their
     closed vocabularies, and the wording of every question that has wording. Assembled for a
     Phase 1 author packet. Every table and blockquote in it is quoted byte-for-byte from the
     source and was pulled out programmatically rather than retyped; the section headings and the
     connective sentences are the packet's own and are marked as such in the text.
     
     Everything on the "what it found" side of the source is REMOVED: accuracies, agreement rates,
     kappas, variant comparisons, replication verdicts, per-question reliability grades, resolution
     floors, and adoption or sign-off status. PHASE_1_AUTHOR_BRIEF.md §7 says authors do not
     receive the instruments' conclusions; what the oracle CAN LABEL is not a conclusion, and that
     is what this file carries.
-->

# The oracle's question inventory

**What the semantic oracle can label about an image.** This is an extract from
`research/v3/ORACLE_QUESTION_SET.md`, assembled for a Phase 1 author packet. It carries the
question ids, their closed vocabularies, and the wording of the questions that have wording. It
carries **nothing about how well any of them performed** — every accuracy, agreement rate, variant
comparison, replication verdict, reliability grade and adoption status has been removed, because
`PHASE_1_AUTHOR_BRIEF.md` §7 says authors do not receive the instruments' conclusions.

Everything in a table or a blockquote below is quoted byte-for-byte from the source. The section
headings and the connective sentences are the packet's, not the source's.

Two things worth knowing before you read: these labels are **dev-time only** — the algorithm never
reads a table at runtime (`PHASE_1_AUTHOR_BRIEF.md` §3.1) — and they are **labels, not ground
truth** (`PHASE_0_DECISIONS.md` §6, which is in your packet and says exactly what they are and
are not).

---

## A. Ground structure

Two alternative instruments exist for this group: a single multi-way question, and a decomposition
into six yes/no/unsure probes from which the tag is derived. Both are given below.

### A.1 The single-question instrument

| field | vocabulary |
|---|---|
| `ground_type` | `flat_field \| shaded_field \| multiple_distinct_fields \| full_scene \| pattern_or_texture \| none_discernible` |
| `shading_geometry` (when shaded) | `linear \| radial_or_vignette \| irregular` |
| `field_texture` | `one_textured_material \| distinct_areas \| smooth` |
| `enclosure` | `none \| thin_border \| thick_frame_or_bars` |

**`ground_type`, per-value definitions:**

| value | means |
|---|---|
| `flat_field` | one area, essentially one colour, no progression across it |
| `shaded_field` | **one continuous colour progression** across the ground — light, shadow, glow, fade, or colours melting into one another |
| `multiple_distinct_fields` | **discrete colour areas** — two or more, each its own colour, however hard or soft the join between them looks |
| `full_scene` | a depicted space whose ground has **no readable overall colour behaviour** — not merely "this is a photograph of a place" |
| `pattern_or_texture` | a repeating motif or a material surface that **is** the ground, with no overall progression and no discrete colour areas |
| `none_discernible` | no ground can be made out at all |

**Precedence rule** — the first three values answer the criterion
in §A.2 and are used **whenever the ground can be read at all**. The last three exist for
grounds where the criterion cannot be applied. A photograph of a place whose ground still reads
as one progression, or as discrete areas, takes the criterion answer — not `full_scene`.

**The criterion `ground_type` is judged by**, quoted as the prompt files carry it:

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

### A.2 The six-probe instrument

Every probe is answered `yes | no | unsure`.

**The referent preamble, shown once and carried by every prompt:**

> The background means everything behind the main subject and the text, taken AS A WHOLE — even if
> it has several different parts.

**The unsure framing:**

> Unsure is a real answer — some questions won't fit some artworks, and that is measured, not
> penalized.

**The six probes:**

| # | probe | question |
|---|---|---|
| 1 | `bg_visible` | Can you make out a background at all — anything behind the main subject and the text? |
| 2 | `one_colour` | Is the background essentially one single colour all over? **If different parts have different colours, answer no.** |
| 3 | `continuous_change` | Does the background's colour change continuously — a fade, a glow, a vignette, colours melting into one another — **across the whole background rather than only in one part of it? If it changes in one part and not in another, answer no.** |
| 4 | `separate_areas` | Can you point to two or more separate areas of the background, each with its own colour? **A blurry or soft join still counts as two areas.** |
| 5 | `motif_or_material` | Is the background **AS A WHOLE** a repeating motif, or the surface of a material — paper, fabric, film grain, concrete, brush marks? **If only one part of it is, answer no.** |
| 6 | `depicted_place` | **Taken as a whole**, does the background show a place with depth — a room, a landscape, a street? |

**The option glosses, which are part of the wording:**

| probe | yes | no | unsure |
|---|---|---|---|
| `bg_visible` | there is a background you can see | you cannot make out any background | you cannot tell |
| `one_colour` | one colour, all over | more than one colour is present, **or different parts have different colours** | you cannot tell |
| `continuous_change` | it changes continuously, across the whole background | it does not, or it only changes in one part | you cannot tell |
| `separate_areas` | two or more separate areas, each its own colour | you cannot pick out separate areas | you cannot tell |
| `motif_or_material` | **the whole background** is a repeating motif, or a material surface | neither, **or only one part of it is** | you cannot tell |
| `depicted_place` | a place with depth is shown | no place is shown | you cannot tell |

**Listed by id only** — these are outputs of this instrument rather than questions put to anyone,
and their derivation table is not reproduced here:

- `ground_type` — derived from the probe answers by a committed table.
- `field_texture` — derived from the probe answers.
- `shading_geometry` — derived from `shading_direction` and the derived tag.
- `shading_direction` — asked directly in this instrument; the source states its vocabulary only
  by reference to `shading_geometry`'s, so no wording is reproduced.

## B. Text

| field | vocabulary |
|---|---|
| `has_text` | `yes \| no \| illegible_at_this_size` |
| `text_roles` (multi-select) | `title_display \| artist_name \| tracklist_or_body \| badge_or_sticker \| label_logo \| incidental_in_scene` |
| `text_dominance` | `dominant_element \| present_secondary \| minor` |

## C. Provenance

| field | vocabulary |
|---|---|
| `overlays` (multi-select) | `parental_advisory \| label_logo \| barcode_or_price \| watermark \| none` |
| `physical_media_scan` | `yes \| no` |

## D. Subject and identity

| field | vocabulary |
|---|---|
| `has_dominant_subject` | `single \| multiple \| none` |
| `subject_kind` (when a subject exists) | `person \| animal \| vehicle \| object \| building_or_structure \| abstract_shape` |
| `subject_area_band` | `under_25 \| 25_60 \| over_60` |
| `has_signature_color` | `yes \| no` |
| `signature_carrier` (when yes) | `text \| subject \| background \| small_element` |

**`subject_kind` vocabulary:**

| value | means |
|---|---|
| `person` | a person, a face, a figure, a crowd |
| `animal` | a creature of any kind |
| `vehicle` | a car, a bike, a boat, a plane, a train |
| `object` | a made thing: an instrument, a bottle, a chair, a tool |
| `building_or_structure` | a building, a bridge, a tower, a room read as a structure |
| `abstract_shape` | a shape or form that is not a thing you could name |

## E. Medium and character

| field | vocabulary |
|---|---|
| `medium` | `photograph \| illustration_or_painting \| render_3d \| typography_only \| collage \| abstract_or_pattern` |
| `color_character` | `monochrome \| duotone_or_tinted \| limited_palette \| full_spectrum` |
| `grain_or_noise` | `yes \| no` |

## F. Eval-side target variables

| field | vocabulary |
|---|---|
| `light_text_safe` / `dark_text_safe` | `yes \| no \| only_some_regions` |
| `two_color_faithful` | `yes \| no` |

## Meta — on every record

`confidence` (`high | medium | low`), `ambiguity_note` (free text, human
audit only, never read by code)

## What the oracle is deliberately not asked

- **Anything colorimetric** — hex, contrast, areas, luminance ordering, polarity: computed.
- **Anything spatial** — where the text/badge/subject is: SAM's job. Concept prompts are the
  **v2.1 set of ten**, unioned: `words`, `letter`, `lettering`, `display-text` ("album title"),
  `emblem` ("logo"), `sticker`, `parental-advisory`, `person`, `face`, `barcode`.
  **`oracle/sam/config.py` is the authority, not this line and not pipeline §8.3** — §8.3's list
  was never the one quoted here and has not been updated for v1→v2→v2.1.
- **Anything aesthetic** — "is this a good accent": that is the reviewer, and only the reviewer.
- **Anything requiring deliberation** — violates the 5-second validation rule, so it cannot be
  validated and therefore cannot be trusted.

---

**What is not here, and how to get it.** The full `ORACLE_QUESTION_SET.md` also contains this
campaign's measurements of these questions and the reasoning that produced them; that is what §7 of
the brief withholds. Its companion `ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md` is withheld
whole. If you need something from either, name it in your proposal — which part you wanted and why
your design turns on it — and it will be adjudicated and handed to you if it is not an anchor.
