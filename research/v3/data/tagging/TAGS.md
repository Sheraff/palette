# V3 reviewer-comment tag vocabulary

**Version:** 1.0.0 · **Updated:** 2026-08-03

> Generated from `research/v3/data/tagging/vocabulary.json` by
> `research/v3/src/tagging/build-tags-md.ts`. Edit the JSON, not this file.

---

## The rule

SYMMETRIC-VOCABULARY: for every expressible complaint, its opposite must exist. Every tag names exactly one other tag as its opposite; the relation is an involution within one axis. This is what closes v2-3's instrument-bias gap (REVIEW_UI.md §4): the UI could not record a gradient objection, so all 14 gradient notes asked for MORE gradient and three arms were misdirected.

## What a tag is

Tags are an index over the reviewer's free text, never a replacement for it. The raw text is authoritative. Derived tag records can be dropped and rebuilt from the raw text at any time.

**66 tags in 33 opposed pairs across 8 axes.** A tag id is `<axis>/<name>`. A comment maps to zero or more tags; zero is a real answer.

| axis | pairs | what it is about |
| --- | --- | --- |
| `gradient` | 6 | Whether a gradient should exist at all, how many stops it has, how loud it is, and how closely its path follows the artwork. Positions run 0 (the background endpoint, the one the display mapping reserves room for) to 1. |
| `coverage` | 5 | Which colors reached the palette, and where the palette sits as a whole in lightness, chroma and hue relative to the artwork. Role-agnostic: about the set of published colors, not about who got which job. |
| `role` | 5 | Which color got which job (background / surface / foreground / accent), and whether each role's color is the right kind of color for that job. v2-3: 16% of corrections were pure role permutations — the same colors, reshuffled. |
| `contrast` | 4 | Luminance and legibility relations between published colors: foreground against background/surface/ramp, accent against the same, surface against background. Both directions — too little and too much. |
| `collapse` | 3 | Roles merging or staying apart. surface→background and accent→foreground are the two sanctioned collapses (PHASE_0_DECISIONS.md §4, invariant 3); this axis records the reviewer disagreeing with the call in either direction. |
| `identity` | 3 | Whether the palette reads as belonging to this artwork. Covers identity coverage (v2-3's single most frequent complaint class, 27 notes), signature colors, and the whole-palette 'does this feel like the cover' judgment. |
| `provenance` | 3 | Where a published color came from inside the image: material field, or an overlay (text, logo, watermark, sticker), a border/letterbox artifact, or noise. Both directions — wrongly included and wrongly excluded. |
| `meta` | 4 | Statements about the comparison itself rather than about one palette, plus the tagging agent's own confidence. Kept in the vocabulary so that 'this pair told us nothing' is as expressible as 'A won'. |

---

## Gradient direction — `gradient`

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

Statements about the comparison itself rather than about one palette, plus the tagging agent's own confidence. Kept in the vocabulary so that 'this pair told us nothing' is as expressible as 'A won'.

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

| tag | means | example phrase |
| --- | --- | --- |
| `meta/tagger-unsure` | Filed by the tagging agent on its own work: this text is ambiguous and a human should check the mapping. Never filed from the reviewer's words. | *(agent-only) the comment says 'too flat' and could mean the gradient or the contrast* |
| `meta/tagger-confident` | The tagging agent's default state — never filed explicitly. Exists so that 'unsure' is one end of a pair rather than a one-way marker. | *(agent-only, never filed) the comment maps cleanly onto one tag* |

---

## Flat index

| tag | opposite |
| --- | --- |
| `collapse/accent-should-collapse` | `collapse/accent-should-not-collapse` |
| `collapse/accent-should-not-collapse` | `collapse/accent-should-collapse` |
| `collapse/roles-too-alike` | `collapse/roles-too-distinct` |
| `collapse/roles-too-distinct` | `collapse/roles-too-alike` |
| `collapse/surface-should-collapse` | `collapse/surface-should-not-collapse` |
| `collapse/surface-should-not-collapse` | `collapse/surface-should-collapse` |
| `contrast/accent-too-high` | `contrast/accent-too-low` |
| `contrast/accent-too-low` | `contrast/accent-too-high` |
| `contrast/ramp-flattened-for-text` | `contrast/text-unreadable-over-ramp` |
| `contrast/surface-too-close-to-background` | `contrast/surface-too-separated-from-background` |
| `contrast/surface-too-separated-from-background` | `contrast/surface-too-close-to-background` |
| `contrast/text-too-high` | `contrast/text-too-low` |
| `contrast/text-too-low` | `contrast/text-too-high` |
| `contrast/text-unreadable-over-ramp` | `contrast/ramp-flattened-for-text` |
| `coverage/alien-color` | `coverage/missing-color` |
| `coverage/hue-too-cool` | `coverage/hue-too-warm` |
| `coverage/hue-too-warm` | `coverage/hue-too-cool` |
| `coverage/missing-color` | `coverage/alien-color` |
| `coverage/too-dark` | `coverage/too-light` |
| `coverage/too-desaturated` | `coverage/too-saturated` |
| `coverage/too-light` | `coverage/too-dark` |
| `coverage/too-monochrome` | `coverage/too-varied` |
| `coverage/too-saturated` | `coverage/too-desaturated` |
| `coverage/too-varied` | `coverage/too-monochrome` |
| `gradient/midpoint-too-early` | `gradient/midpoint-too-late` |
| `gradient/midpoint-too-late` | `gradient/midpoint-too-early` |
| `gradient/ramp-off-artwork` | `gradient/ramp-over-literal` |
| `gradient/ramp-over-literal` | `gradient/ramp-off-artwork` |
| `gradient/ramp-too-contrasty` | `gradient/ramp-too-subtle` |
| `gradient/ramp-too-subtle` | `gradient/ramp-too-contrasty` |
| `gradient/should-be-flat` | `gradient/should-be-gradient` |
| `gradient/should-be-gradient` | `gradient/should-be-flat` |
| `gradient/too-few-stops` | `gradient/too-many-stops` |
| `gradient/too-many-stops` | `gradient/too-few-stops` |
| `gradient/wrong-end-color` | `gradient/wrong-start-color` |
| `gradient/wrong-start-color` | `gradient/wrong-end-color` |
| `identity/coverage-overreach` | `identity/coverage-shortfall` |
| `identity/coverage-shortfall` | `identity/coverage-overreach` |
| `identity/signature-color-missing` | `identity/signature-color-overweighted` |
| `identity/signature-color-overweighted` | `identity/signature-color-missing` |
| `identity/too-literal` | `identity/wrong-mood` |
| `identity/wrong-mood` | `identity/too-literal` |
| `meta/both-sides-bad` | `meta/both-sides-good` |
| `meta/both-sides-good` | `meta/both-sides-bad` |
| `meta/improvement` | `meta/regression` |
| `meta/regression` | `meta/improvement` |
| `meta/sides-incomparable` | `meta/sides-indistinguishable` |
| `meta/sides-indistinguishable` | `meta/sides-incomparable` |
| `meta/tagger-confident` | `meta/tagger-unsure` |
| `meta/tagger-unsure` | `meta/tagger-confident` |
| `provenance/border-artifact-published` | `provenance/edge-content-ignored` |
| `provenance/edge-content-ignored` | `provenance/border-artifact-published` |
| `provenance/noise-color-published` | `provenance/small-region-ignored` |
| `provenance/overlay-color-ignored` | `provenance/overlay-color-published` |
| `provenance/overlay-color-published` | `provenance/overlay-color-ignored` |
| `provenance/small-region-ignored` | `provenance/noise-color-published` |
| `role/accent-should-be-chromatic` | `role/accent-should-be-neutral` |
| `role/accent-should-be-neutral` | `role/accent-should-be-chromatic` |
| `role/accent-too-prominent` | `role/accent-too-recessive` |
| `role/accent-too-recessive` | `role/accent-too-prominent` |
| `role/foreground-should-be-neutral` | `role/foreground-should-be-tinted` |
| `role/foreground-should-be-tinted` | `role/foreground-should-be-neutral` |
| `role/surface-should-be-chromatic` | `role/surface-should-be-neutral` |
| `role/surface-should-be-neutral` | `role/surface-should-be-chromatic` |
| `role/wrong-color-selection` | `role/wrong-role-assignment` |
| `role/wrong-role-assignment` | `role/wrong-color-selection` |
