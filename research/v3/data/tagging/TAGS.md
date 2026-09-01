# V3 reviewer-comment tag vocabulary

**Version:** 2.1.0 · **Updated:** 2026-08-03

> Generated from `research/v3/data/tagging/vocabulary.json` by
> `research/v3/src/tagging/build-tags-md.ts`. Edit the JSON, not this file.

---

## The rule

SYMMETRIC-VOCABULARY: for every expressible complaint, its opposite must exist. Every tag names exactly one other tag as its opposite; the relation is an involution within one axis. This is what closes v2-3's instrument-bias gap (REVIEW_UI.md §4): the UI could not record a gradient objection, so all 14 gradient notes asked for MORE gradient and three arms were misdirected. In v2 this rule is SCOPED rather than weakened: it binds every judgment axis unchanged, and descriptive axes carry the coverage law in "symmetryScoping" instead.

## Where the rule binds — judgment axes and descriptive axes

SYMMETRY IS SCOPED, NOT WEAKENED. Every axis declares a kind. On a "judgment" axis — anything asserting that something should have been otherwise — the involution rule applies unchanged: every tag names exactly one opposite, mutually, on the same axis, and the axis holds an even number of tags. On a "descriptive" axis — observations of what an instrument was seen to do, which have alternatives but no opposites ("DINOv2 focused on the layout" is not a complaint and inventing its negation would produce a tag nobody would ever file) — the involution is replaced by a law of the same shape minus self-inversion: every tag names at least one "counterpart" (the observation you would have filed had the instrument done otherwise), every tag must itself be named as some other tag's counterpart, so the alternative reading is expressible in both directions, and the axis must carry at least one positive-valence and at least one negative-valence tag, so that no axis can record only an instrument misbehaving. A descriptive axis may never carry a complaint: a tag that says something should have been otherwise belongs on a judgment axis and owes an opposite. The exemption is from self-inversion (and with it injectivity) only, and the linter checks it rather than trusting review discipline.

## What a tag is

Tags are an index over the reviewer's free text, never a replacement for it. The raw text is authoritative. Derived tag records can be dropped and rebuilt from the raw text at any time.

**103 tags across 12 axes: 48 opposed judgment pairs (96 tags) and 7 descriptive observations.** A tag id is `<axis>/<name>`. A comment maps to zero or more tags; zero is a real answer.

## Scope — what a statement is about

Every axis declares a scope; a tag may override its axis. Scope is what keeps a claim about one
review item from being read as a claim about the artwork, the instrument, or the rules.

| scope | what it covers |
| --- | --- |
| `pairwise-item` | One review item: the pair that was shown, or either palette in it. A pairwise-item statement is meaningless away from that item — it is a claim about what was published there, not about the artwork or about the rules. |
| `artwork` | This artwork, and any palette that could be derived from it. Survives the item it was said on: "this cover supports both a flat and a gradient reading" stays true of the next batch. |
| `instrument` | A tool we judge with or judge through: an embedding model, a segmenter, the VLM oracle, the review rendering, the tagging agent itself. Not about any one artwork, though it is usually observed on one. |
| `criterion` | The definitions, labels and tests by which judgments are made — the question set, the category words, the rulings that settle borderline cases. Binds no artwork and no instrument run. |

## The axes

| axis | kind | scope | tags | what it is about |
| --- | --- | --- | --- | --- |
| `gradient` | judgment | `pairwise-item` | 12 (6 pairs) | Whether a gradient should exist at all, how many stops it has, how loud it is, and how closely its path follows the artwork. Positions run 0 (the background endpoint, the one the display mapping reserves room for) to 1. |
| `coverage` | judgment | `pairwise-item` | 10 (5 pairs) | Which colors reached the palette, and where the palette sits as a whole in lightness, chroma and hue relative to the artwork. Role-agnostic: about the set of published colors, not about who got which job. |
| `role` | judgment | `pairwise-item` | 10 (5 pairs) | Which color got which job (background / surface / foreground / accent), and whether each role's color is the right kind of color for that job. v2-3: 16% of corrections were pure role permutations — the same colors, reshuffled. |
| `contrast` | judgment | `pairwise-item` | 8 (4 pairs) | Luminance and legibility relations between published colors: foreground against background/surface/ramp, accent against the same, surface against background. Both directions — too little and too much. |
| `collapse` | judgment | `pairwise-item` | 6 (3 pairs) | Roles merging or staying apart. surface→background and accent→foreground are the two sanctioned collapses (PHASE_0_DECISIONS.md §4, invariant 3); this axis records the reviewer disagreeing with the call in either direction. |
| `identity` | judgment | `pairwise-item` | 6 (3 pairs) | Whether the palette reads as belonging to this artwork. Covers identity coverage (v2-3's single most frequent complaint class, 27 notes), signature colors, and the whole-palette 'does this feel like the cover' judgment. |
| `provenance` | judgment | `pairwise-item` | 6 (3 pairs) | Where a published color came from inside the image: material field, or an overlay (text, logo, watermark, sticker), a border/letterbox artifact, or noise. Both directions — wrongly included and wrongly excluded. |
| `meta` | judgment | `pairwise-item` | 8 (4 pairs) | Statements about the comparison itself rather than about one palette, plus the tagging agent's own confidence. Kept in the vocabulary so that "this pair told us nothing" is as expressible as "A won". SCOPE DECISION (v2): meta is pairwise-item scoped. A meta tag is a claim about one review item and the two palettes shown in it, and it does not survive the item — "both of these are fine" is meta/both-sides-good, while "both a flat and a gradient palette are defensible for this artwork" is criterion/both-readings-defensible at artwork scope. The two tagger tags override to instrument scope: they are about the tagging agent, which is itself an instrument, not about the pair. |
| `instrument-behavior` | descriptive | `instrument` | 7 | What a model or tool was observed to do: what it keyed on, what it grouped together, where it surprised us. Purely descriptive — a tag here says what happened, never that it should have happened otherwise. A complaint about an instrument belongs on instrument-fitness, which is a judgment axis and owes opposites. This is the only kind of axis exempt from the involution rule, and it pays for the exemption with the coverage law (counterparts in both directions, and both valences present). |
| `instrument-fitness` | judgment | `instrument` | 12 (6 pairs) | Judgments about the instruments themselves, including the rendering the reviewer judges through. Two families: is this instrument good enough for the job, and does the review view help or hinder the judgment it is asking for. The review UI is an instrument like any other, and a review instrument that misleads is the exact failure mode v2-3 shipped. |
| `concept` | judgment | `criterion` | 6 (3 pairs) | The words the question set uses against the things a detector actually finds. Records the right-detection/wrong-word case, a category word that admits too much or too little, and a word that conflates two things or splits one. About naming; how a call is decided is the criterion axis. |
| `criterion` | judgment | `criterion` | 12 (6 pairs) | Rulings about how a judgment is to be made, and about how many answers a case admits. A ruling is not a complaint about a palette: it fixes (or declines to fix) the test that later palettes will be judged by. Multi-validity lives here too — "both answers are defensible for this artwork" is an artwork-scoped statement and overrides the axis scope. |

---

## Gradient direction — `gradient`

**Kind:** judgment · **Scope:** `pairwise-item`

Whether a gradient should exist at all, how many stops it has, how loud it is, and how closely its path follows the artwork. Positions run 0 (the background endpoint, the one the display mapping reserves room for) to 1.

### `gradient/should-be-gradient` ↔ `gradient/should-be-flat`

| tag | means | example phrase |
| --- | --- | --- |
| `gradient/should-be-gradient` | A gradient background was called for and a flat one was published. | *this cover is a sky, it needs the ramp — flat blue kills it* |
| `gradient/should-be-flat` | A flat background was called for and a gradient was published. | *why is this a gradient at all? the sleeve is one solid colour* |

### `gradient/too-few-stops` ↔ `gradient/too-many-stops`

| tag | means | example phrase |
| --- | --- | --- |
| `gradient/too-few-stops` | The ramp needs another stop; the straight path between the current endpoints passes somewhere it should not. | *it goes through a muddy grey halfway down, it needs a stop in the middle* |
| `gradient/too-many-stops` | Stops that buy nothing; the flatter path was already fine, and the extra curvature costs banding. | *three stops is fussy here, two would look the same* |

### `gradient/ramp-too-subtle` ↔ `gradient/ramp-too-contrasty`

| tag | means | example phrase |
| --- | --- | --- |
| `gradient/ramp-too-subtle` | The endpoints are so close that the gradient does no visible work. | *I can't actually see any gradient, it may as well be flat* |
| `gradient/ramp-too-contrasty` | The endpoints are far enough apart that the ramp is louder than the artwork it came from. | *it goes from near-black to near-white, way more dramatic than the cover* |

### `gradient/ramp-off-artwork` ↔ `gradient/ramp-over-literal`

| tag | means | example phrase |
| --- | --- | --- |
| `gradient/ramp-off-artwork` | The rendered ramp passes through colors the artwork does not contain (pathology P1). | *halfway down it turns pink and there is no pink anywhere in this image* |
| `gradient/ramp-over-literal` | The ramp reproduces the artwork's own composition instead of serving as a background behind it. | *this is just the picture again, the background should be a calmer version of it* |

### `gradient/wrong-start-color` ↔ `gradient/wrong-end-color`

| tag | means | example phrase |
| --- | --- | --- |
| `gradient/wrong-start-color` | The stop at position 0 — the background endpoint — is the wrong color. | *the top of the ramp should be the deep navy, not that grey* |
| `gradient/wrong-end-color` | The stop at position 1 — the far endpoint — is the wrong color. | *the bottom should fade into the black of the sleeve, not into brown* |

### `gradient/midpoint-too-early` ↔ `gradient/midpoint-too-late`

| tag | means | example phrase |
| --- | --- | --- |
| `gradient/midpoint-too-early` | An intermediate stop sits too close to position 0; the first leg of the ramp is over too quickly. Successor to v2-3's one-way `wrong-midpoint` tag. | *the change happens right at the top, it should hold the dark longer* |
| `gradient/midpoint-too-late` | An intermediate stop sits too close to position 1; the ramp holds its first color too long and then rushes. | *it stays dark almost all the way down and then changes all at once* |

---

## Color coverage — `coverage`

**Kind:** judgment · **Scope:** `pairwise-item`

Which colors reached the palette, and where the palette sits as a whole in lightness, chroma and hue relative to the artwork. Role-agnostic: about the set of published colors, not about who got which job.

### `coverage/missing-color` ↔ `coverage/alien-color`

| tag | means | example phrase |
| --- | --- | --- |
| `coverage/missing-color` | A color that is plainly present and important in the artwork appears in no published role or stop. | *there is a big green field in this cover and nothing in the palette is green* |
| `coverage/alien-color` | A published color does not read as being in the artwork, or comes from a region too small to speak for it. | *where did that purple come from? I can't find it in the image* |

### `coverage/too-desaturated` ↔ `coverage/too-saturated`

| tag | means | example phrase |
| --- | --- | --- |
| `coverage/too-desaturated` | The palette is less chromatic than the artwork — vivid material rendered as near-neutrals. | *the cover is bright orange and the palette is all beige* |
| `coverage/too-saturated` | The palette is more chromatic than the artwork — muted material rendered as vivid colors. | *this is a soft grey photograph and the palette is shouting teal* |

### `coverage/too-dark` ↔ `coverage/too-light`

| tag | means | example phrase |
| --- | --- | --- |
| `coverage/too-dark` | The palette as a whole sits darker than the artwork reads. | *the sleeve is a bright daylight shot and this palette is nearly black* |
| `coverage/too-light` | The palette as a whole sits lighter than the artwork reads. | *this is a night scene, the background shouldn't be this pale* |

### `coverage/too-monochrome` ↔ `coverage/too-varied`

| tag | means | example phrase |
| --- | --- | --- |
| `coverage/too-monochrome` | The palette flattens a genuinely multi-hue artwork into a single hue family. | *everything here is a shade of the same blue and the cover has three clear colours* |
| `coverage/too-varied` | The palette spans more hue directions than the artwork has; the roles do not look like they belong together. | *red, green and blue all at once — this looks like a harlequin, the cover is basically one hue* |

### `coverage/hue-too-cool` ↔ `coverage/hue-too-warm`

| tag | means | example phrase |
| --- | --- | --- |
| `coverage/hue-too-cool` | The published colors are shifted cool relative to the artwork's own hue. | *that cream has gone blue-grey, it should still feel warm* |
| `coverage/hue-too-warm` | The published colors are shifted warm relative to the artwork's own hue. | *the blue reads purple here, the cover's blue is colder than that* |

---

## Role assignment — `role`

**Kind:** judgment · **Scope:** `pairwise-item`

Which color got which job (background / surface / foreground / accent), and whether each role's color is the right kind of color for that job. v2-3: 16% of corrections were pure role permutations — the same colors, reshuffled.

### `role/wrong-role-assignment` ↔ `role/wrong-color-selection`

| tag | means | example phrase |
| --- | --- | --- |
| `role/wrong-role-assignment` | The colors are right but the jobs are shuffled — a permutation would fix it. | *these are the right four colours, the accent and the foreground are just swapped* |
| `role/wrong-color-selection` | The role structure is right but at least one role picked the wrong color; no permutation fixes it. | *the layout of roles is fine, the accent is simply the wrong colour — no rearrangement helps* |

### `role/accent-should-be-chromatic` ↔ `role/accent-should-be-neutral`

| tag | means | example phrase |
| --- | --- | --- |
| `role/accent-should-be-chromatic` | A neutral was published as the accent where the artwork's chromatic pop should have taken the role. | *the accent is grey — the whole point of this cover is the red stripe* |
| `role/accent-should-be-neutral` | A chromatic color was published as the accent where a neutral was the right call. | *forcing a colour in as the accent looks wrong, the off-white would have been right* |

### `role/accent-too-recessive` ↔ `role/accent-too-prominent`

| tag | means | example phrase |
| --- | --- | --- |
| `role/accent-too-recessive` | The accent does not carry enough weight to function as an accent (a color judgment, not a contrast measurement). | *the accent is there but it never catches the eye, it just sits behind everything* |
| `role/accent-too-prominent` | The accent dominates the mock UI and competes with the foreground for attention. | *the accent is screaming, it pulls attention away from the track title* |

### `role/foreground-should-be-tinted` ↔ `role/foreground-should-be-neutral`

| tag | means | example phrase |
| --- | --- | --- |
| `role/foreground-should-be-tinted` | A plain white/black foreground was published where a color taken from the artwork was wanted. | *plain white is lazy here, the cream from the lettering would be much better* |
| `role/foreground-should-be-neutral` | A tinted foreground was published where a plain white/black was wanted. | *the tinted text looks dirty, just use white* |

### `role/surface-should-be-chromatic` ↔ `role/surface-should-be-neutral`

| tag | means | example phrase |
| --- | --- | --- |
| `role/surface-should-be-chromatic` | A neutral was published as the surface where a chromatic supporting color from the artwork was wanted. v2-3 traced 14 warehouse complaints to a constructor that could never route a chromatic color into the surface lane. | *the panel should be that sailor blue, not another grey* |
| `role/surface-should-be-neutral` | A chromatic color was published as the surface where a neutral supporting color was wanted. | *the coloured panel is too much, a plain dark grey would sit better under the artwork* |

---

## Contrast — `contrast`

**Kind:** judgment · **Scope:** `pairwise-item`

Luminance and legibility relations between published colors: foreground against background/surface/ramp, accent against the same, surface against background. Both directions — too little and too much.

### `contrast/text-too-low` ↔ `contrast/text-too-high`

| tag | means | example phrase |
| --- | --- | --- |
| `contrast/text-too-low` | The foreground is too close in luminance to the background or the surface to read comfortably. | *I can barely read the title against that background* |
| `contrast/text-too-high` | The foreground is pushed so far from the background that it looks harsh or unrelated to the artwork. | *pure white on near-black is brutal, this cover is much softer than that* |

### `contrast/accent-too-low` ↔ `contrast/accent-too-high`

| tag | means | example phrase |
| --- | --- | --- |
| `contrast/accent-too-low` | The accent is too close to the background or surface to be seen as a distinct element. | *the accent dot basically disappears into the panel* |
| `contrast/accent-too-high` | The accent is pushed so far from its ground that it looks pasted on. | *the accent is so much brighter than everything else it looks like a different app* |

### `contrast/surface-too-close-to-background` ↔ `contrast/surface-too-separated-from-background`

| tag | means | example phrase |
| --- | --- | --- |
| `contrast/surface-too-close-to-background` | The surface does not lift off the background enough to read as a panel. | *I can't tell where the card ends and the background starts* |
| `contrast/surface-too-separated-from-background` | The surface stands so far off the background that it reads as a second, competing background. | *the panel is a completely different colour from the background, it fights it* |

### `contrast/text-unreadable-over-ramp` ↔ `contrast/ramp-flattened-for-text`

| tag | means | example phrase |
| --- | --- | --- |
| `contrast/text-unreadable-over-ramp` | The foreground drops below legibility over part of the gradient (pathology P2, the indistinct fraction). | *the text is fine at the top and vanishes at the bottom of the gradient* |
| `contrast/ramp-flattened-for-text` | The gradient looks squeezed or lightened to protect legibility, at the cost of matching the artwork. | *the ramp has clearly been pulled apart to keep the text readable and now it doesn't match the cover* |

---

## Collapse — `collapse`

**Kind:** judgment · **Scope:** `pairwise-item`

Roles merging or staying apart. surface→background and accent→foreground are the two sanctioned collapses (PHASE_0_DECISIONS.md §4, invariant 3); this axis records the reviewer disagreeing with the call in either direction.

### `collapse/accent-should-collapse` ↔ `collapse/accent-should-not-collapse`

| tag | means | example phrase |
| --- | --- | --- |
| `collapse/accent-should-collapse` | A separate accent was published where the artwork has none; it should have collapsed onto the foreground. | *there is no accent colour in this cover, inventing one makes it worse* |
| `collapse/accent-should-not-collapse` | The accent was collapsed onto the foreground although the artwork clearly has an accent color. | *the accent has been dropped and this cover has an obvious yellow to use* |

### `collapse/surface-should-collapse` ↔ `collapse/surface-should-not-collapse`

| tag | means | example phrase |
| --- | --- | --- |
| `collapse/surface-should-collapse` | A separate surface was published where the artwork supports only one field; it should have collapsed onto the background. | *there's only one ground in this image, the second panel colour is made up* |
| `collapse/surface-should-not-collapse` | The surface was collapsed onto the background although the artwork has a second usable field. | *the surface got dropped but there is a clear second area it could have used* |

### `collapse/roles-too-alike` ↔ `collapse/roles-too-distinct`

| tag | means | example phrase |
| --- | --- | --- |
| `collapse/roles-too-alike` | Two roles are near-identical without being an honest collapse — the almost-but-not-quite case. | *these two are so close it looks like a bug, either make them the same or make them different* |
| `collapse/roles-too-distinct` | Roles are pushed apart to look different where the artwork wanted them alike. | *these two should just be the same colour, the difference is invented* |

---

## Identity — `identity`

**Kind:** judgment · **Scope:** `pairwise-item`

Whether the palette reads as belonging to this artwork. Covers identity coverage (v2-3's single most frequent complaint class, 27 notes), signature colors, and the whole-palette 'does this feel like the cover' judgment.

### `identity/coverage-shortfall` ↔ `identity/coverage-overreach`

| tag | means | example phrase |
| --- | --- | --- |
| `identity/coverage-shortfall` | A major hue direction of the artwork — large mass, real visual weight — reaches no published color (pathology P5). | *the whole bottom half of the cover is that rust colour and the palette ignores it completely* |
| `identity/coverage-overreach` | The palette forces in a minor or incidental hue direction that the artwork does not read as having. | *it has gone hunting for a second colour and picked up something nobody would notice* |

### `identity/signature-color-missing` ↔ `identity/signature-color-overweighted`

| tag | means | example phrase |
| --- | --- | --- |
| `identity/signature-color-missing` | The one color the artwork is recognised by reached no published role. | *this record is *the* pink one and there is no pink here at all* |
| `identity/signature-color-overweighted` | The signature color took over roles it should not own, crowding out the rest of the artwork. | *the pink is everywhere now — background, surface and accent — it's too much* |

### `identity/wrong-mood` ↔ `identity/too-literal`

| tag | means | example phrase |
| --- | --- | --- |
| `identity/wrong-mood` | Each color is defensible but the palette as a whole does not feel like this artwork. | *every colour is technically in there but it doesn't feel like this record at all* |
| `identity/too-literal` | The palette is a faithful sample of the artwork's pixels and works badly as a UI because of it. | *it has copied the image honestly and the result is unusable as an interface* |

---

## Provenance and overlay — `provenance`

**Kind:** judgment · **Scope:** `pairwise-item`

Where a published color came from inside the image: material field, or an overlay (text, logo, watermark, sticker), a border/letterbox artifact, or noise. Both directions — wrongly included and wrongly excluded.

### `provenance/overlay-color-published` ↔ `provenance/overlay-color-ignored`

| tag | means | example phrase |
| --- | --- | --- |
| `provenance/overlay-color-published` | A published color was taken from an overlay — title text, a logo, a parental-advisory sticker — rather than from the artwork's material. | *that red is the explicit-lyrics sticker, it isn't part of the artwork* |
| `provenance/overlay-color-ignored` | An overlay carries the artwork's identity — the band's logo color, the title's color — and was excluded anyway. | *the lettering colour *is* the identity of this sleeve and it's nowhere in the palette* |

### `provenance/border-artifact-published` ↔ `provenance/edge-content-ignored`

| tag | means | example phrase |
| --- | --- | --- |
| `provenance/border-artifact-published` | A published color came from a letterbox bar, frame, scan margin or padding rather than from the image. | *that black is just the letterbox bars at the top and bottom* |
| `provenance/edge-content-ignored` | Real content living at the edge of the image was dismissed as border and lost. | *the coloured band down the side is part of the design, not a frame* |

### `provenance/noise-color-published` ↔ `provenance/small-region-ignored`

| tag | means | example phrase |
| --- | --- | --- |
| `provenance/noise-color-published` | A published color came from compression artifacts, sensor noise or a stray speck. | *that colour only exists in the JPEG mush around the edge of the text* |
| `provenance/small-region-ignored` | A small but visually load-bearing region was dismissed as too small to count. | *it's a tiny patch but it's the only bright thing in the whole cover and it matters* |

---

## Comparison and process — `meta`

**Kind:** judgment · **Scope:** `pairwise-item`

Statements about the comparison itself rather than about one palette, plus the tagging agent's own confidence. Kept in the vocabulary so that "this pair told us nothing" is as expressible as "A won". SCOPE DECISION (v2): meta is pairwise-item scoped. A meta tag is a claim about one review item and the two palettes shown in it, and it does not survive the item — "both of these are fine" is meta/both-sides-good, while "both a flat and a gradient palette are defensible for this artwork" is criterion/both-readings-defensible at artwork scope. The two tagger tags override to instrument scope: they are about the tagging agent, which is itself an instrument, not about the pair.

### `meta/both-sides-good` ↔ `meta/both-sides-bad`

| tag | means | example phrase |
| --- | --- | --- |
| `meta/both-sides-good` | Both palettes in the pair are acceptable; the preference is a matter of taste, not of quality. | *honestly either of these would be fine, I just slightly prefer the left one* |
| `meta/both-sides-bad` | Neither palette in the pair works; the preference records the lesser failure. | *both of these are wrong, I picked the one that is less wrong* |

### `meta/sides-indistinguishable` ↔ `meta/sides-incomparable`

| tag | means | example phrase |
| --- | --- | --- |
| `meta/sides-indistinguishable` | The two sides look the same to the reviewer; the comparison carries no information. | *I genuinely cannot see a difference between these two* |
| `meta/sides-incomparable` | The two sides differ on so many axes at once that the comparison isolates nothing. | *these two are completely different palettes, I can't tell what I'm actually comparing* |

### `meta/improvement` ↔ `meta/regression`

| tag | means | example phrase |
| --- | --- | --- |
| `meta/improvement` | The reviewer says this is better than something they saw before. | *this is much better than what this cover used to give* |
| `meta/regression` | The reviewer says this is worse than something they saw before. | *this used to be right and now it isn't* |

### `meta/tagger-unsure` ↔ `meta/tagger-confident`

**Scope override:** `instrument`

| tag | means | example phrase |
| --- | --- | --- |
| `meta/tagger-unsure` | Filed by the tagging agent on its own work: this text is ambiguous and a human should check the mapping. Never filed from the reviewer's words. | *(agent-only) the comment says 'too flat' and could mean the gradient or the contrast* |
| `meta/tagger-confident` | The tagging agent's default state — never filed explicitly. Exists so that 'unsure' is one end of a pair rather than a one-way marker. | *(agent-only, never filed) the comment maps cleanly onto one tag* |

---

## Instrument behaviour — `instrument-behavior`

**Kind:** descriptive · **Scope:** `instrument`

What a model or tool was observed to do: what it keyed on, what it grouped together, where it surprised us. Purely descriptive — a tag here says what happened, never that it should have happened otherwise. A complaint about an instrument belongs on instrument-fitness, which is a judgment axis and owes opposites. This is the only kind of axis exempt from the involution rule, and it pays for the exemption with the coverage law (counterparts in both directions, and both valences present).

Descriptive tags have no opposite. Each names the alternative observation(s) — what would have
been filed had the instrument done otherwise — and a valence, so the axis can be checked for
being able to record both a good and a bad surprise.

| tag | valence | alternatives | means | example phrase |
| --- | --- | --- | --- | --- |
| `instrument-behavior/attends-to-appearance` | neutral | `instrument-behavior/attends-to-semantics`<br>`instrument-behavior/attends-to-outside-identity` | The instrument was observed keying on how the image looks — layout, colour, texture, the shape of the lettering. | *for krafty, DINOv2 focused on the layout and flowers* |
| `instrument-behavior/attends-to-semantics` | neutral | `instrument-behavior/attends-to-appearance` | The instrument was observed keying on what is depicted, grouping across visual styles. | *a photo of a boat, a painting of a boat, an origami boat — it put all the boats together* |
| `instrument-behavior/attends-to-outside-identity` | negative | `instrument-behavior/attends-to-appearance`<br>`instrument-behavior/attends-to-semantics` | The instrument was observed keying on who the artwork belongs to — the artist, the band logo, the lettering of the name — rather than on the picture. A cue we did not ask for, so the result may not generalise. | *it matches by artist, not by image; the covers don't look much alike* |
| `instrument-behavior/generalizes-beyond-expectation` | positive | `instrument-behavior/misses-expected-case` | The instrument handled a case we had no reason to expect it to handle. | *a chinese character was recognized as a word — not incorrect, just interesting* |
| `instrument-behavior/misses-expected-case` | negative | `instrument-behavior/generalizes-beyond-expectation` | The instrument failed on a case we did expect it to handle. | *it finds the logo on the obvious ones and misses it whenever the sleeve is dark* |
| `instrument-behavior/instruments-differ` | neutral | `instrument-behavior/instruments-agree` | Two instruments given the same input were observed behaving differently. | *DINOv2 and DINOv3 pick out different things on the same cover* |
| `instrument-behavior/instruments-agree` | positive | `instrument-behavior/instruments-differ` | Two or more instruments given the same input were observed behaving the same way. | *all three models put the same five covers at the top of the list* |

---

## Instrument fitness — `instrument-fitness`

**Kind:** judgment · **Scope:** `instrument`

Judgments about the instruments themselves, including the rendering the reviewer judges through. Two families: is this instrument good enough for the job, and does the review view help or hinder the judgment it is asking for. The review UI is an instrument like any other, and a review instrument that misleads is the exact failure mode v2-3 shipped.

### `instrument-fitness/display-confusing` ↔ `instrument-fitness/display-clarifying`

| tag | means | example phrase |
| --- | --- | --- |
| `instrument-fitness/display-confusing` | The rendering the reviewer judges through got in the way of the judgment it was asking for. | *I couldn't tell which of the overlays I was supposed to be looking at* |
| `instrument-fitness/display-clarifying` | The rendering the reviewer judges through made the thing being judged easier to see. | *the three-layer rendering was helpful, I could see exactly what the mask covered* |

### `instrument-fitness/display-too-busy` ↔ `instrument-fitness/display-too-sparse`

| tag | means | example phrase |
| --- | --- | --- |
| `instrument-fitness/display-too-busy` | The review view puts more on screen at once than the judgment needs. | *there is too much on screen at once, the boxes and the rings fight each other* |
| `instrument-fitness/display-too-sparse` | The review view withholds something the judgment needs. | *I need the artwork next to it, I can't judge this on its own* |

### `instrument-fitness/needs-onboarding` ↔ `instrument-fitness/self-explanatory`

| tag | means | example phrase |
| --- | --- | --- |
| `instrument-fitness/needs-onboarding` | The instrument works once understood, but the first encounter with it has to be explained. | *i just got confused the first time, after that it was fine* |
| `instrument-fitness/self-explanatory` | The instrument needed no explaining; it read correctly on first sight. | *I knew what I was looking at straight away, nobody had to tell me* |

### `instrument-fitness/fit-for-purpose` ↔ `instrument-fitness/unfit-for-purpose`

| tag | means | example phrase |
| --- | --- | --- |
| `instrument-fitness/fit-for-purpose` | The reviewer judges this instrument good enough for the job we want it to do. | *I think the DINO models are better, they're the ones to use* |
| `instrument-fitness/unfit-for-purpose` | The reviewer judges this instrument not good enough for the job we want it to do. | *this one is not doing the job, I wouldn't trust it for this* |

### `instrument-fitness/candidates-separable` ↔ `instrument-fitness/candidates-indistinguishable`

| tag | means | example phrase |
| --- | --- | --- |
| `instrument-fitness/candidates-separable` | The reviewer can tell two candidate instruments apart on the evidence shown, and says which one wins. | *the difference between these two models is obvious, the second one is clearly better* |
| `instrument-fitness/candidates-indistinguishable` | The reviewer cannot tell two candidate instruments apart on the evidence shown, so the choice between them is unfunded. | *I wouldn't know which one of the 2* |

### `instrument-fitness/disagrees-defensibly` ↔ `instrument-fitness/disagrees-indefensibly`

| tag | means | example phrase |
| --- | --- | --- |
| `instrument-fitness/disagrees-defensibly` | The instrument answered differently from the reviewer and the reviewer can see why: the disagreement is a difference of reading, not an error. | *where I voted differently from the oracle, I could see its point of view* |
| `instrument-fitness/disagrees-indefensibly` | The instrument answered differently from the reviewer and the answer is not one a careful reader could have reached. | *it says there are two fields and there is plainly only one — that is not a matter of opinion* |

---

## Concept and label — `concept`

**Kind:** judgment · **Scope:** `criterion`

The words the question set uses against the things a detector actually finds. Records the right-detection/wrong-word case, a category word that admits too much or too little, and a word that conflates two things or splits one. About naming; how a call is decided is the criterion axis.

### `concept/detection-right-label-wrong` ↔ `concept/label-right-detection-wrong`

| tag | means | example phrase |
| --- | --- | --- |
| `concept/detection-right-label-wrong` | The right thing was found, and the category word put on it is not the word the reviewer would use for it. | *i did not count 'parental advisory' marks as 'stickers' but the model seemed to* |
| `concept/label-right-detection-wrong` | The category word is the right one to be asking about; the region found under it is not what the word names. | *it says 'logo' and it has outlined the singer's face* |

### `concept/label-too-broad` ↔ `concept/label-too-narrow`

| tag | means | example phrase |
| --- | --- | --- |
| `concept/label-too-broad` | The category word admits cases we did not mean it to cover. | *'face' is catching a graffiti of a face and a sculpted bust as well* |
| `concept/label-too-narrow` | The category word excludes cases we did mean it to cover. | *'sticker' ought to cover the price tag too, and it doesn't* |

### `concept/label-conflates` ↔ `concept/label-splits`

| tag | means | example phrase |
| --- | --- | --- |
| `concept/label-conflates` | One category word covers two things the work needs to keep apart. | *'album-title' doesn't separate the title from the artist name — it is just the main text* |
| `concept/label-splits` | Two category words separate one thing that reads as a single thing, and the reviewer has to guess which to use. | *'border' and 'frame' are the same thing here, splitting them just makes me guess* |

---

## Criterion rulings — `criterion`

**Kind:** judgment · **Scope:** `criterion`

Rulings about how a judgment is to be made, and about how many answers a case admits. A ruling is not a complaint about a palette: it fixes (or declines to fix) the test that later palettes will be judged by. Multi-validity lives here too — "both answers are defensible for this artwork" is an artwork-scoped statement and overrides the axis scope.

### `criterion/ruling-given` ↔ `criterion/underdetermined`

| tag | means | example phrase |
| --- | --- | --- |
| `criterion/ruling-given` | The reviewer fixes how a case like this is to be judged from now on — a standing answer, not a one-off call. | *the test is surface identity, never boundary softness* |
| `criterion/underdetermined` | The existing criterion does not decide this case, and the reviewer says so rather than deciding it. | *sometimes 'logo' could be part of the artwork itself, or some sort of added branding* |

### `criterion/option-set-gap` ↔ `criterion/option-set-sufficient`

| tag | means | example phrase |
| --- | --- | --- |
| `criterion/option-set-gap` | The answer options offered for a question do not cover a case that actually occurs: the case is real and none of the available words fit it. A statement about the option set, not about whether the case has been decided — a ruling usually opens with one of these and then closes it. | *there's no option for one flat field and one shaded field with a blurry line between them* |
| `criterion/option-set-sufficient` | The answer options do cover the case; what was missing was the rule for choosing between them, not a new option. | *shaded_field already covers that wall, nothing new needs adding* |

### `criterion/criterion-narrowed` ↔ `criterion/criterion-widened`

| tag | means | example phrase |
| --- | --- | --- |
| `criterion/criterion-narrowed` | The ruling shrinks what counts: a property that seemed to decide the call is declared not to. | *a soft join does not make it two fields — that was never the test* |
| `criterion/criterion-widened` | The ruling enlarges what counts: a property that seemed required is demoted to a hint, or another reading is admitted. | *surface identity is a strong prior, neither necessary nor sufficient* |

### `criterion/forced-choice-required` ↔ `criterion/abstention-allowed`

| tag | means | example phrase |
| --- | --- | --- |
| `criterion/forced-choice-required` | A genuinely ambiguous case must still be answered, because the human answer has to be symmetric with the instrument's. | *answer it on the gut read — the model doesn't get to abstain either* |
| `criterion/abstention-allowed` | A genuinely ambiguous case is better left unanswered than forced. | *if you can't tell, don't guess — an empty answer is more useful than a coin flip* |

### `criterion/both-readings-defensible` ↔ `criterion/one-reading-only`

**Scope override:** `artwork`

| tag | means | example phrase |
| --- | --- | --- |
| `criterion/both-readings-defensible` | Two opposite answers are both defensible for this artwork; which one is published is a choice, not a correctness question. Artwork-scoped: unlike meta/both-sides-good it outlives the item it was said on. | *an artwork can support a valid flat palette and a valid gradient palette* |
| `criterion/one-reading-only` | Only one answer is defensible for this artwork; the other is wrong rather than a matter of taste. | *there is no reading of this cover where that call is defensible* |

### `criterion/unfair-comparison-basis` ↔ `criterion/fair-comparison-basis`

| tag | means | example phrase |
| --- | --- | --- |
| `criterion/unfair-comparison-basis` | The property being compared on is contaminated by choices made downstream of the thing under test, so a difference on it does not mean what it looks like it means. | *the flat/gradient flag depends on which colours got picked, it isn't a property of the artwork* |
| `criterion/fair-comparison-basis` | The property being compared on does isolate the thing under test, so a difference on it can be read at face value. | *this measure only moves when the thing we changed moves, so the comparison is clean* |

---

## Flat index

`opposite / alternatives` holds the opposite for a judgment tag and the counterparts for a descriptive one.

| tag | kind | scope | opposite / alternatives |
| --- | --- | --- | --- |
| `collapse/accent-should-collapse` | judgment | `pairwise-item` | `collapse/accent-should-not-collapse` |
| `collapse/accent-should-not-collapse` | judgment | `pairwise-item` | `collapse/accent-should-collapse` |
| `collapse/roles-too-alike` | judgment | `pairwise-item` | `collapse/roles-too-distinct` |
| `collapse/roles-too-distinct` | judgment | `pairwise-item` | `collapse/roles-too-alike` |
| `collapse/surface-should-collapse` | judgment | `pairwise-item` | `collapse/surface-should-not-collapse` |
| `collapse/surface-should-not-collapse` | judgment | `pairwise-item` | `collapse/surface-should-collapse` |
| `concept/detection-right-label-wrong` | judgment | `criterion` | `concept/label-right-detection-wrong` |
| `concept/label-conflates` | judgment | `criterion` | `concept/label-splits` |
| `concept/label-right-detection-wrong` | judgment | `criterion` | `concept/detection-right-label-wrong` |
| `concept/label-splits` | judgment | `criterion` | `concept/label-conflates` |
| `concept/label-too-broad` | judgment | `criterion` | `concept/label-too-narrow` |
| `concept/label-too-narrow` | judgment | `criterion` | `concept/label-too-broad` |
| `contrast/accent-too-high` | judgment | `pairwise-item` | `contrast/accent-too-low` |
| `contrast/accent-too-low` | judgment | `pairwise-item` | `contrast/accent-too-high` |
| `contrast/ramp-flattened-for-text` | judgment | `pairwise-item` | `contrast/text-unreadable-over-ramp` |
| `contrast/surface-too-close-to-background` | judgment | `pairwise-item` | `contrast/surface-too-separated-from-background` |
| `contrast/surface-too-separated-from-background` | judgment | `pairwise-item` | `contrast/surface-too-close-to-background` |
| `contrast/text-too-high` | judgment | `pairwise-item` | `contrast/text-too-low` |
| `contrast/text-too-low` | judgment | `pairwise-item` | `contrast/text-too-high` |
| `contrast/text-unreadable-over-ramp` | judgment | `pairwise-item` | `contrast/ramp-flattened-for-text` |
| `coverage/alien-color` | judgment | `pairwise-item` | `coverage/missing-color` |
| `coverage/hue-too-cool` | judgment | `pairwise-item` | `coverage/hue-too-warm` |
| `coverage/hue-too-warm` | judgment | `pairwise-item` | `coverage/hue-too-cool` |
| `coverage/missing-color` | judgment | `pairwise-item` | `coverage/alien-color` |
| `coverage/too-dark` | judgment | `pairwise-item` | `coverage/too-light` |
| `coverage/too-desaturated` | judgment | `pairwise-item` | `coverage/too-saturated` |
| `coverage/too-light` | judgment | `pairwise-item` | `coverage/too-dark` |
| `coverage/too-monochrome` | judgment | `pairwise-item` | `coverage/too-varied` |
| `coverage/too-saturated` | judgment | `pairwise-item` | `coverage/too-desaturated` |
| `coverage/too-varied` | judgment | `pairwise-item` | `coverage/too-monochrome` |
| `criterion/abstention-allowed` | judgment | `criterion` | `criterion/forced-choice-required` |
| `criterion/both-readings-defensible` | judgment | `artwork` | `criterion/one-reading-only` |
| `criterion/criterion-narrowed` | judgment | `criterion` | `criterion/criterion-widened` |
| `criterion/criterion-widened` | judgment | `criterion` | `criterion/criterion-narrowed` |
| `criterion/fair-comparison-basis` | judgment | `criterion` | `criterion/unfair-comparison-basis` |
| `criterion/forced-choice-required` | judgment | `criterion` | `criterion/abstention-allowed` |
| `criterion/one-reading-only` | judgment | `artwork` | `criterion/both-readings-defensible` |
| `criterion/option-set-gap` | judgment | `criterion` | `criterion/option-set-sufficient` |
| `criterion/option-set-sufficient` | judgment | `criterion` | `criterion/option-set-gap` |
| `criterion/ruling-given` | judgment | `criterion` | `criterion/underdetermined` |
| `criterion/underdetermined` | judgment | `criterion` | `criterion/ruling-given` |
| `criterion/unfair-comparison-basis` | judgment | `criterion` | `criterion/fair-comparison-basis` |
| `gradient/midpoint-too-early` | judgment | `pairwise-item` | `gradient/midpoint-too-late` |
| `gradient/midpoint-too-late` | judgment | `pairwise-item` | `gradient/midpoint-too-early` |
| `gradient/ramp-off-artwork` | judgment | `pairwise-item` | `gradient/ramp-over-literal` |
| `gradient/ramp-over-literal` | judgment | `pairwise-item` | `gradient/ramp-off-artwork` |
| `gradient/ramp-too-contrasty` | judgment | `pairwise-item` | `gradient/ramp-too-subtle` |
| `gradient/ramp-too-subtle` | judgment | `pairwise-item` | `gradient/ramp-too-contrasty` |
| `gradient/should-be-flat` | judgment | `pairwise-item` | `gradient/should-be-gradient` |
| `gradient/should-be-gradient` | judgment | `pairwise-item` | `gradient/should-be-flat` |
| `gradient/too-few-stops` | judgment | `pairwise-item` | `gradient/too-many-stops` |
| `gradient/too-many-stops` | judgment | `pairwise-item` | `gradient/too-few-stops` |
| `gradient/wrong-end-color` | judgment | `pairwise-item` | `gradient/wrong-start-color` |
| `gradient/wrong-start-color` | judgment | `pairwise-item` | `gradient/wrong-end-color` |
| `identity/coverage-overreach` | judgment | `pairwise-item` | `identity/coverage-shortfall` |
| `identity/coverage-shortfall` | judgment | `pairwise-item` | `identity/coverage-overreach` |
| `identity/signature-color-missing` | judgment | `pairwise-item` | `identity/signature-color-overweighted` |
| `identity/signature-color-overweighted` | judgment | `pairwise-item` | `identity/signature-color-missing` |
| `identity/too-literal` | judgment | `pairwise-item` | `identity/wrong-mood` |
| `identity/wrong-mood` | judgment | `pairwise-item` | `identity/too-literal` |
| `instrument-behavior/attends-to-appearance` | descriptive | `instrument` | `instrument-behavior/attends-to-semantics`, `instrument-behavior/attends-to-outside-identity` |
| `instrument-behavior/attends-to-outside-identity` | descriptive | `instrument` | `instrument-behavior/attends-to-appearance`, `instrument-behavior/attends-to-semantics` |
| `instrument-behavior/attends-to-semantics` | descriptive | `instrument` | `instrument-behavior/attends-to-appearance` |
| `instrument-behavior/generalizes-beyond-expectation` | descriptive | `instrument` | `instrument-behavior/misses-expected-case` |
| `instrument-behavior/instruments-agree` | descriptive | `instrument` | `instrument-behavior/instruments-differ` |
| `instrument-behavior/instruments-differ` | descriptive | `instrument` | `instrument-behavior/instruments-agree` |
| `instrument-behavior/misses-expected-case` | descriptive | `instrument` | `instrument-behavior/generalizes-beyond-expectation` |
| `instrument-fitness/candidates-indistinguishable` | judgment | `instrument` | `instrument-fitness/candidates-separable` |
| `instrument-fitness/candidates-separable` | judgment | `instrument` | `instrument-fitness/candidates-indistinguishable` |
| `instrument-fitness/disagrees-defensibly` | judgment | `instrument` | `instrument-fitness/disagrees-indefensibly` |
| `instrument-fitness/disagrees-indefensibly` | judgment | `instrument` | `instrument-fitness/disagrees-defensibly` |
| `instrument-fitness/display-clarifying` | judgment | `instrument` | `instrument-fitness/display-confusing` |
| `instrument-fitness/display-confusing` | judgment | `instrument` | `instrument-fitness/display-clarifying` |
| `instrument-fitness/display-too-busy` | judgment | `instrument` | `instrument-fitness/display-too-sparse` |
| `instrument-fitness/display-too-sparse` | judgment | `instrument` | `instrument-fitness/display-too-busy` |
| `instrument-fitness/fit-for-purpose` | judgment | `instrument` | `instrument-fitness/unfit-for-purpose` |
| `instrument-fitness/needs-onboarding` | judgment | `instrument` | `instrument-fitness/self-explanatory` |
| `instrument-fitness/self-explanatory` | judgment | `instrument` | `instrument-fitness/needs-onboarding` |
| `instrument-fitness/unfit-for-purpose` | judgment | `instrument` | `instrument-fitness/fit-for-purpose` |
| `meta/both-sides-bad` | judgment | `pairwise-item` | `meta/both-sides-good` |
| `meta/both-sides-good` | judgment | `pairwise-item` | `meta/both-sides-bad` |
| `meta/improvement` | judgment | `pairwise-item` | `meta/regression` |
| `meta/regression` | judgment | `pairwise-item` | `meta/improvement` |
| `meta/sides-incomparable` | judgment | `pairwise-item` | `meta/sides-indistinguishable` |
| `meta/sides-indistinguishable` | judgment | `pairwise-item` | `meta/sides-incomparable` |
| `meta/tagger-confident` | judgment | `instrument` | `meta/tagger-unsure` |
| `meta/tagger-unsure` | judgment | `instrument` | `meta/tagger-confident` |
| `provenance/border-artifact-published` | judgment | `pairwise-item` | `provenance/edge-content-ignored` |
| `provenance/edge-content-ignored` | judgment | `pairwise-item` | `provenance/border-artifact-published` |
| `provenance/noise-color-published` | judgment | `pairwise-item` | `provenance/small-region-ignored` |
| `provenance/overlay-color-ignored` | judgment | `pairwise-item` | `provenance/overlay-color-published` |
| `provenance/overlay-color-published` | judgment | `pairwise-item` | `provenance/overlay-color-ignored` |
| `provenance/small-region-ignored` | judgment | `pairwise-item` | `provenance/noise-color-published` |
| `role/accent-should-be-chromatic` | judgment | `pairwise-item` | `role/accent-should-be-neutral` |
| `role/accent-should-be-neutral` | judgment | `pairwise-item` | `role/accent-should-be-chromatic` |
| `role/accent-too-prominent` | judgment | `pairwise-item` | `role/accent-too-recessive` |
| `role/accent-too-recessive` | judgment | `pairwise-item` | `role/accent-too-prominent` |
| `role/foreground-should-be-neutral` | judgment | `pairwise-item` | `role/foreground-should-be-tinted` |
| `role/foreground-should-be-tinted` | judgment | `pairwise-item` | `role/foreground-should-be-neutral` |
| `role/surface-should-be-chromatic` | judgment | `pairwise-item` | `role/surface-should-be-neutral` |
| `role/surface-should-be-neutral` | judgment | `pairwise-item` | `role/surface-should-be-chromatic` |
| `role/wrong-color-selection` | judgment | `pairwise-item` | `role/wrong-role-assignment` |
| `role/wrong-role-assignment` | judgment | `pairwise-item` | `role/wrong-color-selection` |
