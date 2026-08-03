# The cascade policy question — your answers, and what they decided

**For:** the reviewer, to read directly. **Date:** 2026-08-03.
**Round:** `cascade-ground-truth-1`, 19 covers, one question each, ~3 minutes of your time.
**Numbers behind every sentence here:** `data/oracle-premise/cascade-ground-truth-1-analysis.json`.

---

## The one-sentence answer

**The policy is not adopted. Your answers say the covers it would have labelled are covers our
vocabulary has no word for — so the honest thing is to leave them unlabelled, and to go fix the
vocabulary.** Formally the verdict is **UNDECIDED–ESCALATE**, and the separate "reject" test fired
too. Both point the same way, so nothing is left hanging: the covers stay unlabelled either way.

---

## What the question was

We have two ways of asking the model about the ground of a cover — call them **B** and **D**. They
are the same model on the same images; only the wording differs.

On roughly a third of the corpus, **B refuses to answer** — it picks a word like "full scene" that doesn't tell us
anything about whether the ground is flat or a gradient. **D never refuses.** So somebody proposed:

> when B refuses, use D's answer — but only when D says **"multiple distinct fields"**, and
> otherwise leave the cover unlabelled.

That would commit **8 covers**. The question was whether D is right on those 8.

## Why we had to ask you

The old evidence for the policy turned out to be measuring something else. It scored D against the
gradient flag on the palette we shipped — which, as you ruled, is a fact about the palette, not a
label of the artwork, and must never be called accuracy. On the 24 covers where we could compare,
that flag agrees with you barely more than a coin does.

So the evidence had a hole exactly where the policy operates: **none** of the 8 covers, and none of
the 19 covers where D uses that word at all, had ever been looked at by a human. This round filled
the hole. You are the judge; nothing else scored anything here.

We asked you the corrected §A.2 question — the "one continuous colour progression vs discrete
colour areas" wording you signed off this morning, which is the wording D itself was run under. We
deliberately did **not** reuse the older disambiguation round's wording, so these answers stand on
their own.

## What we set the bar at, before looking

Written down first, in the analysis file, before a single answer was scored:

- **Adopt** if D matched you on at least **6 of the 8** covers — clearly better than the 4 of 8 a
  coin gives — and agreed with you on the flat-vs-gradient direction on a solid majority.
- **Reject** if D matched you on **4 or fewer of 8**, or contradicted your direction on a third of
  the covers where both of you gave a directional answer.
- **Escalate** if **3 or more of the 8** of your answers landed on one of the three escape words
  ("full scene", "pattern or texture", "none discernible") — because that would mean the covers
  aren't labellable in this vocabulary, and the honest policy is to leave them alone.

## What your answers said

**The 8 covers the policy would actually commit** (6 thumbnails, 2 standard-size):

| cover | size | B said | D said | **you said** | same word? |
|---|---|---|---|---|---|
| `0002dfdc…` | standard | pattern or texture | multiple distinct fields | **multiple distinct fields** | ✅ yes |
| `0007d42f…` | standard | full scene | multiple distinct fields | **full scene** | no |
| `00083a2d…` | thumbnail | full scene | multiple distinct fields | **full scene** | no |
| `000e2291…` | thumbnail | full scene | multiple distinct fields | **full scene** | no |
| `00124d05…` | thumbnail | full scene | multiple distinct fields | **full scene** | no |
| `00030075…` | thumbnail | full scene | multiple distinct fields | **none discernible** | no |
| `00066a61…` | thumbnail | pattern or texture | multiple distinct fields | **none discernible** | no |
| `000c4d52…` | thumbnail | full scene | multiple distinct fields | **none discernible** | no |

**D matched you on 1 of these 8.** The bar for adoption was 6.

**The wider 19 covers** — every cover where D uses this word at all, whether or not B refused
(9 standard, 8 thumbnail, 2 large): **D matched you on 4 of 19.** Your words across the 19 were
*none discernible* 9, *full scene* 5, *multiple distinct fields* 4, *flat field* 1 — and
**"shaded field" zero times.**

The two slices are kept separate on purpose and there is no combined headline number. The policy
lives on the 8; the 19 is context.

**About the flat-vs-gradient direction.** On paper D agreed with you on every cover where the
comparison was possible — 1 of 1 on the 8, 5 of 5 on the 19. **This number is empty and should not
be quoted on its own.** D's word always points to "flat", and you never once said "shaded field",
so every comparison that existed was flat-against-flat. It cannot tell us D read anything
correctly; it only tells us nothing in this round was on the gradient side.

**One more thing the counts hide.** Of the 4 covers in the whole round where D did match your word,
**3 are covers where B did not refuse** — covers the policy never touches. D's word agrees with you
least often precisely where the policy would have used it.

## Your note, and why it changes the reading

You told us, after answering and while this was being analysed:

> "for this round, some images are *genuinely hard* to rank, and none of the options fit, or maybe
> several. So I answered "none discernible" but this is not true, i can see the field, I just don't
> know how to tag it."

That is important and it is applied throughout. **"None discernible" in this round does not mean
"there is no ground".** It means *the list of words we gave you does not contain the right one*.

So those answers are kept in their own bucket. They are not counted as you backing B's refusal, and
they are not counted as you contradicting D either. What they are is evidence that the vocabulary
is broken on these covers — which is exactly why the escalate branch fired, and exactly what the
C/D write-up (`CD_RESULT.md` §5) concluded on its own, independently, when it said the vocabulary,
not the criterion, is the problem and that the §A.5 vocabulary split is now due.

Your answers as given are reported above unedited; your note is the key for reading them, not an
edit to them.

## Was B wrong to refuse?

This was the other half of the question — when B refuses, is it dodging a question it could have
answered? On the 8:

- **4 covers: B was right to refuse.** You independently chose the very same escape word B chose
  ("full scene").
- **3 covers: the vocabulary misfit** — your "none discernible", which per your note is neither a
  vindication nor a cost.
- **1 cover: B's refusal cost us a real answer.** On `0002dfdc…` B said "pattern or texture" and
  you said "multiple distinct fields", a usable answer B declined to give.

**So B's refusals cost us at most one label out of eight, and were independently correct on half.**
B's caution looks well-founded, not lazy. (Worth noting: `0002dfdc…` is the one cover here you had
labelled once before, under the old wording, where you answered "pattern or texture" and that was
read as contradicting D. Under the corrected §A.2 wording you gave D's answer instead. The two
wordings aren't comparable, so this isn't a change of mind — but it is the round's single match,
and it sits on the cover where the criterion correction had the most room to bite.)

## What happens next

1. **The policy is not adopted.** The 8 covers stay unlabelled — which is what the policy's own
   "otherwise leave the cover unlabelled" clause already does for everything else.
2. **A free-text follow-up round is being built**, targeted at exactly the covers where you said
   "none discernible". It will ask you to describe the ground in your own words instead of picking
   from a list, so we can find out what words the vocabulary is missing. The 9 covers are:

   | cover | in the policy's 8? | image |
   |---|---|---|
   | `00030075…` | yes | `03/ab67616d00001e02000300752f338b6aedff856c.jpg` |
   | `00066a61…` | yes | `06/ab67616d00001e0200066a61bbcbeadd632f7f38` |
   | `000c4d52…` | yes | `0c/ab67616d00001e02000c4d52300a016ee65f1622` |
   | `00014fb4…` | no | `01/ab67616d0000b27300014fb430dd1b693e653121.jpg` |
   | `00075841…` | no | `07/ab67616d0000b27300075841f68d8cd71db368d8` |
   | `000f0a78…` | no | `0f/ab67616d00001e02000f0a78a1791248aec707e3` |
   | `000fa9b5…` | no | `0f/ab67616d0000b273000fa9b53f161dc999ef557d` |
   | `artofficial` | no | `images/artofficial.jpg` |
   | `krafty` | no | `images/krafty.jpg` |

3. **A decision record is proposed, not written.** It is yours to accept. It records the escalation,
   funds it on your 19 answers by record id, and notes that the reject test fired too.
4. **Nothing needs a GPU**, and no model run needs repeating.

## What this does not say

It does not say variant D is a bad instrument in general, and it does not revive or condemn any
other part of the cascade. It says one thing: **on the 8 covers this specific policy would have
committed, the word D uses is not the word you use, and on most of them you have no word at all.**
That is enough to decline the policy and not enough to conclude anything else.
