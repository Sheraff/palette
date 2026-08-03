# The ground, in your own words — what the nine descriptions say

**For:** the reviewer, to read directly. **Date:** 2026-08-03.
**Round:** `ground-freetext-1`, 9 covers, one free-text box each, no list of options offered.
**Records:** batch `ground-freetext-1`, schema `ground-freetext.v1`, question key `ground_freetext`.
Nine standing answers (the round autosaved as you typed; 63 records exist, 54 of them superseded
drafts of the same nine).

**Where these nine came from.** They are exactly the covers where, in `cascade-ground-truth-1`, you
pressed **none discernible** — and then told us what that press had actually meant:

> "i answered 'none discernible' but this is not true, i can see the field, I just don't know how to
> tag it. it you show me the images with a free text field, i can try to explain for each of them,
> and that might give us some insight."

This round tested that sentence. **It holds, completely.** All nine covers are describable — every
one of the nine answers describes a ground, in some cases in more structural detail than any tag
could have carried. Not one of the nine says "there is nothing there".

---

## The one-page answer

| | |
|---|---|
| Covers that turned out to be describable in prose | **9 of 9** |
| …of those, **palette-decidable** in prose — the description fixes both what kind of ground it is and which pixels are ground | **6 of 9** |
| …**genuinely ambiguous even in prose** — more words would not settle it | **3 of 9** (`000c4d52` Buddha, `000fa9b5` Dahlbäck collage, `krafty`) |
| What the missing words are about | composition, extent, and **which pixels count as ground** — not what kind of ground it is |
| What the evidence favours | **option (b): retire the ground-type question to pixel computation** (the residual route, R-3), keeping prose as the evaluation vocabulary — with one narrowed human question surviving, and it is not a taxonomy |

The single most useful thing the round found is in the last row but one: **on the six decidable
covers the words you reached for were positions, proportions and counts** — "on the left", "on the
right", "about 15% of the height", "maybe 30%", "at the top, then, then", "in the four corners". You
volunteered an area proportion, unprompted, on three of nine covers. Those are quantities a pixel
computation produces directly. The vocabulary was asking for a *category* and you kept answering
with a *layout*.

---

## Cover by cover

Each entry gives your description verbatim, what structure it describes, and whether a palette
could be built from it. The decidability test is stated once, below the table of nine, so you can
disagree with the test rather than with my arithmetic.

---

### 1. `00014fb4…` — *El Josi, El Grandes Ligas* (standard, `o-msdp7f3s-95b4a738`)

> "In this case, there is a very clear background. This background is made of green on the left and
> red on the right. So those two feel like different fields. However, both of those fields also
> contain many things. For example, in the green, there is a photo of a woman, a drawing of a
> dragon, two footballs, some drawing of leaves, some reflections of lights, and on the red side,
> there are some patterns and some ink plots, a bit of writing and a drawing of a dragon.
> So it's both
> - 2 fields of very specific colors
> - many "things""

**The structure: two fields, each populated.** This is the compositional case in its purest form,
and you named it yourself in the last three lines — *"it's both"*. There is a definite ground (you
open with "there is a very clear background"), it has two parts split left/right by colour, and
each part independently carries scattered content. The vocabulary offers one slot and this needs
two levels: a **field structure** (two, side by side) and a **population** of each field.

**Palette-decidable: yes.** Ground = two distinct fields, green and red, split vertically. The
"things" sit on the ground and are not it. Every reading of your description routes a palette the
same way.

---

### 2. `00030075…` — the green-walled spa room (thumbnail, `o-msdpjnga-269ef6ff`)

> "This is a photo of a room that is facing one specific wall of the room, and this wall also has a
> pretty specific color (green) and occupies maybe 30% of the entire picture. But at the same time,
> it's just one wall of the entire room, so I'm not exactly sure"

**The structure: a photographic scene with one salient coloured plane, and the doubt is about
extent.** Nothing here is uncertain about *what is in the picture*. What you are unsure of is
whether a surface that takes 30% of the frame is entitled to be called "the" ground. That is an
**area-dominance question**, and the vocabulary contains no place to put a proportion — so the
uncertainty had nowhere to go but into the answer token.

**Palette-decidable: yes.** A room photographed as a scene; the single largest coloured plane is
the green wall at roughly 30%. Both of your readings ("the wall is the field" / "it's one wall of a
whole room") send a palette to the same place — the dominant surface colour is the green wall — so
the doubt does not change the outcome. This is the clearest case in the nine where **a number would
have discharged the whole difficulty.**

---

### 3. `00066a61…` — *iCarly Karaoke* (thumbnail, `o-msdpl1j9-9fe4f18a`)

> "The background of this image is made of many pink squares. It is many shades of pink, but at the
> same time taken together, they really look like one coherent background. So is it patterns? many
> fields? one field?"

**The structure: one ground, internally varied.** Your three closing questions are the vocabulary
failing in front of you, and it is worth spelling out why each option is wrong. `flat_field` is
wrong because it is many shades. `multiple_distinct_fields` is wrong because it reads as one thing.
`pattern_or_texture` is right about the surface but says **nothing about it being a single ground** —
it is a texture word where you needed a count. The value the list is missing is *"one field,
patterned"*, and the list cannot express it because texture and count are the same slot.

**Palette-decidable: yes, and unanimously.** All three of the tags you hesitated between imply the
same palette: one background surface, pink, non-uniform. The taxonomy question was the only thing
that was hard.

---

### 4. `00075841…` — *Best of Country Karaoke Vol. 40* (standard, `o-msdpnq19-8b525ed1`)

> "This artwork has two sections. There is a banner on top that takes about maybe 15% of the height,
> and this banner has a distinct white background, flat. Below this banner, it is a photo of shoes,
> a hat, and a guitar. Those occupy maybe 85% of the rest of the picture so it's more of a scene /
> many objects. But outside the remaining space we can see a hardwood floor that is sometimes so
> heavily shadowed by the guitar and shoes that it is fully black, so it could be 1 shaded field."

**The structure: three ground-types stacked in one cover, with proportions attached.** A flat field
(the white banner, 15%), a scene (the objects, 85%), and a shaded field (the wood floor running to
black under the objects) — and the third is *behind* the second, not beside it. The enum must pick
one of these three and would be wrong twice whichever it picked. Note the shape of the sentence:
you did not say "this is hard", you said **which** part is which and **how much** of the frame each
takes.

**Palette-decidable: yes.** Ground = a flat white band over a shaded dark-wood surface, with objects
in front. That is a complete role assignment.

---

### 5. `000c4d52…` — the bronze Buddha in flowers (thumbnail, `o-msdpq1dh-1e541341`)

> "This is a picture of a bronze statue of a Buddha surrounded by many pink and peach flowers. None
> of it really feels like a background. The flowers are so present that they could almost be
> subjects, and we don't see what's behind the flowers. The flowers also have pretty distinct
> colors, which is peach and pink. I'm not sure if this is a scene or patterns, maybe, because of
> the flowers"

**The structure: an occluded ground made of objects.** This is a different failure from the others.
The others are cases where the ground is real and the word is missing. Here you say **"none of it
really feels like a background"** and **"we don't see what's behind the flowers"** — the ground is
not merely unnamed, it is *not visible*, and what fills its place is a mass of things that are
halfway to being subjects.

**Palette-decidable: no.** Two readings live in your description and they give different palettes.
If the flowers are ground, the background is pink and peach. If the flowers are subject, the
background is whatever dark sits between them — and you say we cannot see it. A longer description
would not choose between these, because the choice is not a description problem.

---

### 6. `000f0a78…` — *ProSound Karaoke, Sing Tenor Pop Vol. 46* (thumbnail, `o-msdpri2p-35a2b76c`)

> "I might have rated that one in error. I think I just should have said many fields because there
> is a black bar at the top and then a champagne bar, and then a red field with some gradients and
> shapes. Is this a case of "multiple fields"?"

**The structure: three horizontal bands, one of which is itself a gradient.** Read this one
carefully, because it is the odd one out: **the vocabulary did have a word for it.** Your own
answer names it — `multiple_distinct_fields`. What stopped you was that one of the three fields is
*internally* a gradient, and choosing "multiple fields" felt like it discarded that. The enum forces
a choice between *how the ground is divided* and *what happens inside a division*, and you declined
rather than throw one away.

**Palette-decidable: yes** — three stacked fields: black, champagne, and a red field carrying a
gradient. This cover is evidence that the failure is **structural, not lexical**: adding words to
the list would not have helped here; the list needed a second level, or a second question.

---

### 7. `000fa9b5…` — *John Dahlbäck, Shades of a Shadow* (standard, `o-msdptr4p-761bd841`)

> "This artwork is a collage, so we have what looks like a picture in the middle, but it has been
> processed to the point that it almost doesn't look like "the subject" anymore, it looks like it's
> made of very few flat colors. But we also have other areas where there is some pattern of grey
> dots on a white background. There is other areas with a shaded yellow field. The collage aspect
> makes it pretty hard to know what to answer. It feels like almost every answer would be valid"

**The structure: a collage in which every vocabulary value is locally true.** Flat colours in the
middle, a dot pattern on white, a shaded yellow field, an orange band — four regions, four
different answers, all correct *somewhere*. And the figure/ground line is unstable too: the central
photograph has been posterised until it stops reading as the subject.

**Palette-decidable: no.** Not because the ground is unnamed — you named four regions — but because
nothing in the description says **which of them the background role belongs to**, and the subject
that would have anchored the rest has dissolved. "Almost every answer would be valid" is a true
statement about this cover, not a hedge.

---

### 8. `artofficial` — *Artofficial, Vitamins & Minerals* (large, `o-msdpwnn3-94a4ebba`)

> "This is genuinely one of our most complex images and it's the reason it was in the initial hard
> data set in `images/`. It is almost entirely made of many drawings and illustrations with many
> different colors each, but then those illustrations themselves are arranged in a way that makes
> shapes appear, and there are areas where it's more dominated by one color and areas where it's
> more dominated by one other color. This is a hugely complex image. but at the same time all of
> what I have described feels like the background because it is so heavily populated that when you
> look at it you don't zoom in on anything that feels like a subject except for one specific face
> close to the middle so that face in the middle feels like the subject and then everything else
> feels like the background but the background is so rich that almost any description would fit
> somewhere but not everywhere"

**The structure: the figure/ground line is clean and the ground itself is scale-dependent.** This
description does something none of the others do — it **settles** figure/ground explicitly (the face
near the middle is the subject; everything else is background) and then says the settled ground has
no single description: *"almost any description would fit somewhere but not everywhere."* The
missing concept is **scope**. Any ground answer here is only true of a region, and the vocabulary
has no way to say which region an answer is about.

**Palette-decidable: yes, at the level the contract asks about.** The ground is neither one flat
surface nor one continuous progression; it is many regions with local colour dominance. That routes
a palette away from a single background colour and toward regional sampling — a determinate
instruction, even though no single colour can be named. It is the weakest "yes" of the six, and it
is a yes only because the question is a route, not a hex value.

---

### 9. `krafty` — *Krafty Kuts, Freakshow* (standard, `o-msdpzis0-f25c8ba4`)

> "This picture has a very dominating typography in the middle with the name of the artist and the
> title, and then there are flowers on the four corners. So that could mean we could consider
> everything else besides what I just described to be the background. So that would be the black
> flat field behind everything, and all the many pink leaves that come out of the flowers. Or
> alternatively, we could consider that all of those pink leaves that come out of the flowers are
> part of the foreground, and then the background is purely just the black behind that. But the pink
> leaves are everywhere and they are a little bit less bright than the flowers or the typography, so
> they could also be kind of considered as part of the background."

**The structure: one flat field with a contested intermediate layer.** You lay out two readings and
deliberately decline to pick, and the thing you cannot place is a *layer* — the pink foliage — that
is neither clearly subject nor clearly ground, argued from its brightness relative to the things
around it. Note what the argument is made of: **relative luminance and spatial spread**, not
category.

**Palette-decidable: no — but narrowly, and it is worth saying exactly how narrowly.** The
*background colour* is invariant: flat black under both of your readings. What moves between the
readings is whether the pink is a **ground** colour or a **foreground/accent** colour — which is a
role the contract does care about. So this cover is decidable on the ground question and undecided
on a role question. If the count below were scored on background colour alone rather than on full
role assignment, this cover would flip and the split would be **7 / 2**.

---

## The decidability test, stated

A cover counts as **palette-decidable in prose** when the description fixes **both**:

1. **the ground's route** — one flat surface, one continuously shaded surface, or several distinct
   surfaces; and
2. **which pixels are ground** — the figure/ground line,

such that every reading the description allows sends a palette down the same path.

Applied: **decidable — 1, 2, 3, 4, 6, 8 (six).** **Ambiguous — 5, 7, 9 (three).** The three failures
are *not* failures of test (1): on 8 of 9 covers the route is determinate. They are failures of test
(2) or of both — `000c4d52` fails both, `000fa9b5` and `krafty` fail (2) only.

**Read that again, because it is the round's finding.** The question we asked was *what kind of
ground is this*. The thing that actually stopped you, on every cover where anything stopped you,
was *what counts as the ground*. We spent the round asking the easier of the two questions.

**Of the three covers that were in the cascade policy's committed eight** — `00030075` (spa),
`00066a61` (iCarly), `000c4d52` (Buddha) — two are decidable and one is not. So the policy's covers
were not un-labellable in principle; two of the three would have taken a determinate palette route,
and the label was lost to the instrument rather than to the image.

---

## What the nine share that the vocabulary cannot hold

`flat_field | shaded_field | multiple_distinct_fields | full_scene | pattern_or_texture |
none_discernible` is a flat, single-valued, unscoped list. Seven distinct things recur across the
nine descriptions, and the list can express none of them.

**1. Nesting — a field that contains things.** El Josi: *"those two feel like different fields.
However, both of those fields also contain many things … So it's both."* Also Country Karaoke (a
shaded floor **behind** a scene of objects) and artofficial (illustrations arranged so that shapes
emerge from them). The list has one level; grounds have two.

**2. Composition — several ground-types in one cover.** Country Karaoke carries a flat field, a
scene and a shaded field simultaneously, in named proportions. ProSound carries three bands, one of
which is itself a gradient. Single-valued selection forces a lie in both cases.

**3. Count and texture are the same slot, and they are different questions.** iCarly: *"many shades
of pink, but … taken together, they really look like one coherent background. So is it patterns?
many fields? one field?"* — "one field, patterned" is unsayable, because `pattern_or_texture` spends
the slot describing the surface and leaves the count unstated.

**4. Extent — how much of the frame.** You volunteered proportions unprompted on three covers:
*"maybe 30%"*, *"about maybe 15% of the height"*, *"maybe 85%"*. On the spa room the proportion **is**
the whole difficulty. The vocabulary records no extent, so a dominance doubt has nowhere to land
except in the choice of token.

**5. Scope — the answer is regional, not global.** artofficial: *"almost any description would fit
somewhere but not everywhere."* Dahlbäck: *"it feels like almost every answer would be valid."* Two
of nine covers say explicitly that a global answer does not exist. The list has no way to attach an
answer to a region.

**6. The figure/ground line is presupposed, and it is what actually breaks.** The question asks what
kind of ground this is, which only has an answer once you know where the ground is. Buddha: *"none of
it really feels like a background … we don't see what's behind the flowers."* Krafty: two readings
laid out, neither chosen. Dahlbäck: a subject processed until it stops being one. Artofficial
resolves the line, and it is the only one of the four hard covers that does. **This is the deepest
gap: the vocabulary is a second question that assumes a first question was answered, and the first
question was never asked.**

**7. "Both" and "several" are real answers.** *"So it's both."* *"none of the options fit, or maybe
several."* Forced single-select converts a two-value truth into a refusal — which is precisely how
nine describable covers became nine `none_discernible` presses.

One more thing worth noticing about all nine: **not one description reaches for a category word.**
They reach for *left / right / top / behind / corners / middle / 30% / 15% / less bright than*. The
descriptions are geometric and photometric throughout.

---

## What follows — three options, and which the evidence favours

These are stated as options for you to rule on. None is adopted here.

### (a) Vocabulary v3 — compositional values

Rebuild the list so it can hold nesting, composition, count-vs-texture as separate slots, and
extent. Concretely that is not a longer list but a small **structured** answer: number of ground
regions, layout (side-by-side / stacked / enclosing), per-region character, plus a proportion.

*What it would fix:* items 1–4 above, i.e. six of the nine covers, cleanly.
*What it would not fix:* items 5 and 6 — scope and the figure/ground line. **A richer vocabulary
cannot reach a case where the prose itself does not converge**, and the prose does not converge on
three of nine. Vocabulary v3 would relabel the covers that were already decidable and leave the ones
that broke exactly as broken.
*Cost:* a redesign, a re-elicitation round (~3 min of your time per the B7 note), and a new
`labelSchemaVersion`, which re-opens every downstream comparison.

### (b) Retire the question to pixel computation — the residual route (your standing direction, R-3)

Stop asking humans to classify grounds. Compute ground structure from pixels via residual isolation,
and keep the free-text descriptions as the **evaluation vocabulary** — the language a human uses to
say whether the computed answer is right, rather than the language they must answer in.

*What supports it, from this round specifically:*
- **The words you used are already the outputs of a pixel computation.** Position, extent,
  contiguity, count, relative brightness — items 4 and 5 above, and every geometric phrase in the
  nine answers. A residual pass produces those quantities natively; the enum could not carry them.
- **The three covers that stayed ambiguous are ambiguous in a way no elicitation fixes.** They are
  covers where a determinate ground genuinely does not exist. A pixel computation can *report* that
  (low purity, no dominant residual) instead of forcing a token — which is a better outcome than any
  vocabulary can offer.
- **The one cover where the enum did have the right word (`000f0a78`) still failed.** That rules out
  "the list was too short" as the whole story.

*What it does not settle:* it needs the residual route to actually work, and there is no purity
measurement yet. It also inherits the standing constraint that SAM masks are a location prior and
never colour evidence (A12, R-3).

### (c) Both

Vocabulary v3 as the near-term label source, residual computation as the destination.

*Cost, stated plainly:* the near-term half is the expensive half — a redesign plus a re-elicitation
round plus a schema version — and by the argument above it buys labels only on the covers that were
never the problem. It also creates a second ground-truth channel that will disagree with the first.

### The recommendation

**The evidence favours (b), with one piece of (a) kept and repurposed.**

The reason is item 6. The vocabulary failed hardest not on *what kind of ground* — it got that right
in 8 of 9 descriptions — but on *which pixels are ground*, which it never asked about. Enriching the
answer list for a question whose premise is the unasked question is the wrong repair. A pixel
computation, by contrast, does not presuppose the figure/ground line: it produces a residual and a
purity, and where no ground exists it says so with a number rather than with a token you did not
mean.

The piece of (a) worth keeping is **not** a ground-type taxonomy. It is a single human question,
narrowed to the thing this round shows humans are actually good at and pixels are not: **which parts
of this cover are ground.** Six of nine descriptions answer it unprompted and unambiguously; the
three that do not are informative refusals, and should be recorded as such rather than resolved.

And the free text stays. `REVIEW_UI.md` §4 already makes free text the primary channel; this round
is the first time it has carried a result, and **nine prose answers produced more usable structure
than 19 forced-choice answers did in `cascade-ground-truth-1`.** Whatever you rule, the nine
descriptions are the evaluation vocabulary for the residual route's first purity measurement:
they are what "the computed ground is right" will be checked against.

*Recorded as `d-2026-08-03-ground-freetext-primary-evidence`, funded on the nine record ids. The
choice between (a), (b) and (c) is yours and is not recorded anywhere as made.*
