# `sr-batch` — review manifest (8 items)

**Arm:** `signature-role-score`. **Trunk:** `673daf8`. **Branch:** `worktree-agent-a33bd0d902afe6939`.
**Full record:** `research/v2-3-experiments/signature-role-score/EXPERIMENT.md`.

## What this batch asks

Not "is mechanism X better". The arm's mechanism failed and ships OFF. This batch asks a question
three arms have assumed the answer to without ever testing it:

> **When you asked for a different accent on these artworks, did you mean it?**

Every item pairs the palette the algorithm publishes today against **the same palette with the accent
you yourself prescribed** in the accent slot. Nothing else differs — same background, same surface,
same foreground, same gradient decision.

## Honest notes — read before reviewing

1. **One side is not an algorithm output.** The `sr-ask` side is synthetic: it is today's published
   treatment with the accent replaced by the hex recorded in your earlier correction. No mechanism
   produced it, and no mechanism currently can — that is the finding. Each result file carries
   `"synthetic": true` and a `syntheticProvenance` block naming the warehouse line it came from.
2. **The prescribed accents are real artwork colours.** Each was verified to be an exact pixel of the
   artwork before the record was written; all 13 candidates passed.
3. **Your earlier answer is not treated as an oracle.** Corrections are recorded as
   `endorsed-sample` — one palette you would endorse, not the only valid one. Preferring the
   incumbent here is a perfectly good answer and is genuinely informative; it is not a contradiction
   of your earlier click.
4. **Three of the original 19 asks were dropped** as already superseded by later `strong` verdicts on
   the same artwork (`0009d178`, `000cd48f`, `000d5cdb`). They are not in this batch.
5. Blinding is deterministic and content-derived; the batch name encodes nothing about the sides.

## Items and their standing verdicts

| # | artwork | standing verdict | incumbent accent | prescribed accent | why it is here |
|---|---|---|---|---|---|
| 1 | `ab67616d0000b2730007cc8b341c11227aa7b461` | line 250 `conversational`, no accent correction — ask not withdrawn | `#242426` near-black | `#f06d13` orange | reachable (rank 11); the only case carrying real mark evidence (`markSupport` 0.72) |
| 2 | `ab67616d00001e0200087b1314ac8e17bc1c6916` | line 251 `batch-32` `acceptable`, ask not withdrawn | `#e7a680` caramel | `#ff4e2a` red | reachable (rank 15) |
| 3 | `ab67616d0000b273000c42c61ba60f69e5a40a29` | line 216, no later verdict | `#de9b06` gold | `#fdfc0c` yellow | reachable (rank 8); smallest visual jump — tests whether the ask is a fine distinction or a real one |
| 4 | `ab67616d00001e02000a8aa1dafa651976a7bb44` | line 240, no later verdict; batch-31 corrected the *field* to `#040301`/`#491600` (batch-30's field endorsement is superseded) | `#fa8a02` orange | `#f0d202` yellow | in the pool but ranked 941 |
| 5 | `ab67616d00001e0200102a1cdfa1c0f12d6528ea` | line 205, no later verdict | `#d79a87` clay | `#f4405d` pink-red | dies in the signature lane at rank 31 |
| 6 | `ab67616d0000b27300028829f9e78dbe7ce92f7e.jpg` | line 210, no later verdict | `#e5b3cc` pink | `#40e1c2` turquoise | lane rank **42**, the deepest loss in the class |
| 7 | `ab67616d0000b2730001c404b8a04a8789db8dab.jpg` | line 209, no later verdict | `#055226` green | `#ede1bb` cream | **control** — one of only two asks that go *down* in chroma, against the class trend |
| 8 | `ab67616d0000b273000f815611cd5966187e2051` | lines 140/164/175, the same ask three times | `#8e672c` bronze | `#f168a0` pink | the most insistent ask in the warehouse |

## Serving

```sh
node --no-warnings --experimental-strip-types research/v2-3-eval/serve-review.ts sr-batch
```

## What each outcome commits us to

Decided before the batch was seen, so the reading is not chosen after the fact:

- **`sr-ask` preferred ≥ 6/8** — the class is real. A fourth arm gets a mandate to spend real blast
  radius at `signatureScore`'s `coherentSupport` and `repeatedSupport` terms, which is where the
  measurement says the suppression actually is. This is the *expensive* branch.
- **Split ~4/4** — the asks are one valid answer among several. Accent corrections should stop being
  mined as a target set, and the class is not a defect.
- **`sr-off` preferred ≥ 6/8** — the class dissolves; 0/19 across three arms was the algorithm being
  right, and this line of work closes.

## Revert rules

- `RELATIVE_CHROMA_ROLE_EVIDENCE` ships `false` and **must not be enabled under any outcome of this
  batch** — it delivers 0/19 on its own target class while moving 27/223 artworks materially and
  breaking `nobs.jpg`, a batch-31 `strong`.
- The `sr-ask` label is synthetic. It must never be used as an algorithm baseline, a parity
  reference, or an input to any recall or ranking metric.
- `sr-off` is byte-identical to trunk `673daf8` on 223/223 extractions and is safe to use as the
  trunk baseline for any follow-on arm.
