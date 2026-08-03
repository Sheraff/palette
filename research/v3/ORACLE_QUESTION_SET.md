# V3 Semantic Oracle — Proposed Question Set

**Status:** draft — discussed 2026-08-02, not yet piloted, not yet validated against human labels
**Companion to:** `ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md` — that document's §8 holds the
design rules and explicitly marks its own question list as a placeholder; this document is the
proposed actual set. The §8.1 design rules (closed vocabularies, 5-second answerability,
description separated from judgment, never ask for computables) govern everything below.

## Organizing rule

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

The heart of the set. v2-3's founding gradient rule — "shadows on one surface" vs "the sky and
the grass are different areas" — is pure semantics and consumed 10+ review rounds.

| field | vocabulary | decision it feeds |
|---|---|---|
| `ground_type` | `flat_field \| shaded_field \| multiple_distinct_fields \| full_scene \| pattern_or_texture \| none_discernible` | The gradient boolean's semantic core: `shaded_field` vs `multiple_distinct_fields` **is** the one-surface-vs-two-areas distinction. Single most valuable label in the pass. |
| `shading_geometry` (when shaded) | `linear \| radial_or_vignette \| irregular` | Output-contract decision on how much gradient geometry to keep (v2-3 detected radial on most gradient winners and threw it away). |
| `field_texture` | `one_textured_material \| distinct_areas \| smooth` | Does the field's color variation read as grain/texture of one material or as distinct colored areas — the scrambled-cover test in semantic form. |
| `enclosure` | `none \| thin_border \| thick_frame_or_bars` | The frame/bar class asked structurally (does a frame steal the background role), not as a per-artwork patch. |

**Expected reliability: low-to-medium.** These are the genuinely ambiguous questions — which is
exactly why they're worth asking. This group has the best existing validation hook: the
warehouse's gradient-boolean endorsements (~80 artworks with reviewed gradient verdicts).

## B. Text — feeds the foreground role

| field | vocabulary | decision it feeds |
|---|---|---|
| `has_text` | `yes \| no \| illegible_at_this_size` | Foreground candidacy. The third value is required: a 300 px thumbnail must never yield a confident negative (pipeline doc §7.1). |
| `text_roles` (multi-select) | `title_display \| artist_name \| tracklist_or_body \| badge_or_sticker \| label_logo \| incidental_in_scene` | Provenance distinction deciding whether text can claim the foreground at all. |
| `text_dominance` | `dominant_element \| present_secondary \| minor` | The giant-display-text rule ("the title *is* the artwork") as a direct question instead of a fought-over statistical prior. |

Deliberately absent: text color, polarity, pixel size — all computable once SAM's text masks
exist.

**Expected reliability: high** (except `text_roles` on ambiguous integrated typography).

## C. Provenance — feeds the "belongs to the artwork" exclusions

| field | vocabulary | decision it feeds |
|---|---|---|
| `overlays` (multi-select) | `parental_advisory \| label_logo \| barcode_or_price \| watermark \| none` | Identity exclusion: overlaid elements "don't really belong to the artwork itself". |
| `physical_media_scan` | `yes \| no` | Is this a photograph/scan of physical packaging (sleeve edges, vinyl, jewel case, wear) rather than the artwork itself — a class v2-3 never named, and it changes what "the field" means. |

**Expected reliability: high.** Cheap, decisive, consumable by any paradigm.

## D. Subject and identity — feeds the accent role

| field | vocabulary | decision it feeds |
|---|---|---|
| `has_dominant_subject` | `single \| multiple \| none` | Figure/ground separation at the coarsest useful grain. |
| `subject_area_band` | `under_25 \| 25_60 \| over_60` | Same; also the band where saliency methods degenerate (large-subject covers). |
| `has_signature_color` | `yes \| no` | Is there one color that reads as *this cover's* color. |
| `signature_carrier` (when yes) | `text \| subject \| background \| small_element` | Aimed at the measured finding that ~half of accent corrections were salience mismatches: names which evidence lane *should* supply the accent — which no color statistic can. |

**Expected reliability: medium.**

## E. Medium and character — priors, stratification, confound control

| field | vocabulary | primary use |
|---|---|---|
| `medium` | `photograph \| illustration_or_painting \| render_3d \| typography_only \| collage \| abstract_or_pattern` | Stratified evaluation; turning anecdotal failure classes into counted ones. |
| `color_character` | `monochrome \| duotone_or_tinted \| limited_palette \| full_spectrum` | Gates the all-one-hue edge class (accent may legitimately be neutral). |
| `grain_or_noise` | `yes \| no` | Visible grain/halftone/noise across large areas — texture-vs-structure prior, JPEG-artifact confound. |

These rarely feed a decision directly; their value is evaluation-side ("fails on illustrations
with limited palettes") and corpus stratification.

## F. Eval-side target variables — never algorithm inputs

| field | vocabulary | use |
|---|---|---|
| `light_text_safe` / `dark_text_safe` | `yes \| no \| only_some_regions` | Sanity flags on published palettes (oracle says only-dark-safe, algorithm published white text → auto-flag for review). Kept out of the algorithm path: half-computable, mixes description with judgment. |
| `two_color_faithful` | `yes \| no` | Could two colors faithfully represent this cover — a direct check on collapse pricing, a real reviewable decision with no signal behind it today. |

## Meta — on every record

Per the pipeline doc: `confidence` (`high | medium | low`), `ambiguity_note` (free text, human
audit only, never read by code), plus the full provenance columns of §5.2/§9.

---

## What is deliberately NOT asked

- **Anything colorimetric** — hex, contrast, areas, luminance ordering, polarity: computed.
- **Anything spatial** — where the text/badge/subject is: SAM's job. Concept prompts: `text`,
  `lettering`, `logo`, `sticker`, `person`, `face` — phrasings unioned per pipeline doc §8.3.
- **Anything aesthetic** — "is this a good accent": that is the reviewer, and only the reviewer.
- **Anything requiring deliberation** — violates the 5-second validation rule, so it cannot be
  validated and therefore cannot be trusted.

## Tiering and lifecycle

- **Core tier (groups A–D):** each maps to a named decision any candidate architecture must
  make. Runs corpus-wide after the pilot.
- **Candidate tier (groups E–F):** runs on the pilot; survives only if the validation sample
  shows both reliability *and* actual downstream use.

**Anti-anchoring caveat.** This set is derived from the problem spec's semantic primitives
(field, figure, text, provenance, identity), not from v2-3's failure ledger — but groups A and D
in particular encode hypotheses about what matters. The pilot plus the human validation sample
is where wrong or useless questions get deleted, and the paradigm bake-off (see `V3_PLAN.md`)
may add questions not foreseeable here. v2-3's failure classes are used as *test cases for the
questions*, never as their source.

---

## Candidate refinements surfaced during use

- **2026-08-03, premise disambiguation round (reviewer):** `ground_type` has a gap for
  "one flat field + one shaded field with a blurry meeting line". Resolution applied
  in-round (recorded here, not changed mid-round — vocabulary is frozen for comparability
  with the VLM run): the test is *surface identity*, never boundary softness — one surface
  partly flat/partly shaded → `shaded_field`; two areas with a soft join → 
  `multiple_distinct_fields`; genuine 5-second ambiguity → answer the gut read (the
  forced choice is symmetric with the VLM's). Schema v2 candidates: sharpen the
  definition sentence, or add an explicit value if reviewer notes show the forced choice
  losing real information.
