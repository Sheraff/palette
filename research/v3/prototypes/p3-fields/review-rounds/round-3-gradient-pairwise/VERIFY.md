# VERIFY — round 3, staging checklist

Run by this worker before handing the round over. Scripts are in this directory; every result below
is reproducible by running them.

```
node --experimental-strip-types research/v3/prototypes/p3-fields/review-rounds/round-3-gradient-pairwise/build.ts
node --experimental-strip-types research/v3/prototypes/p3-fields/review-rounds/round-3-gradient-pairwise/verify.ts
```

`verify.ts` exits 0. **All checks pass — 8 pairs, 16 palettes, 88 published colours, 0 failures.**

```
item-048  rho=0.6498  PASS  path=yes  exact-pixel=yes (12/12)  endpoints=yes  flat-side=yes  only-gradient-differs=yes  collapse=yes  contract=yes  preview=yes
item-181  rho=0.6385  PASS  path=yes  exact-pixel=yes (12/12)  endpoints=yes  flat-side=yes  only-gradient-differs=yes  collapse=yes  contract=yes  preview=yes
item-039  rho=0.6365  PASS  path=yes  exact-pixel=yes (10/10)  endpoints=yes  flat-side=yes  only-gradient-differs=yes  collapse=yes  contract=yes  preview=yes
item-114  rho=0.6341  PASS  path=yes  exact-pixel=yes (12/12)  endpoints=yes  flat-side=yes  only-gradient-differs=yes  collapse=yes  contract=yes  preview=yes
item-208  rho=0.6323  PASS  path=yes  exact-pixel=yes (10/10)  endpoints=yes  flat-side=yes  only-gradient-differs=yes  collapse=yes  contract=yes  preview=yes
item-130  rho=0.6228  PASS  path=yes  exact-pixel=yes (10/10)  endpoints=yes  flat-side=yes  only-gradient-differs=yes  collapse=yes  contract=yes  preview=yes
item-168  rho=0.6221  PASS  path=yes  exact-pixel=yes (10/10)  endpoints=yes  flat-side=yes  only-gradient-differs=yes  collapse=yes  contract=yes  preview=yes
item-188  rho=0.6217  PASS  path=yes  exact-pixel=yes (12/12)  endpoints=yes  flat-side=yes  only-gradient-differs=yes  collapse=yes  contract=yes  preview=yes

codeVersion reproduces: yes  (1cc28c1efb1f38de… vs run header 1cc28c1efb1f38de…)

8 pairs · ALL PASS
```

---

## 1 — Every `imagePath` resolves in the MAIN checkout

`items.jsonl` carries repo-relative paths. The run executed inside `.worktrees/p3-fields`, whose
corpus shards are symlinks back to the main checkout, so the run rows' absolute paths carry a
`.worktrees/p3-fields/` prefix that means nothing to a consumer. The repo-relative form is taken
verbatim from `measurements/gradient-borderline-0.3.0.json`, which is already relative.

Checked against `/Users/Flo/GitHub/palette/<imagePath>` — the main checkout directly, not the
worktree's symlink. 8/8 resolve. Note that four of the eight files carry **no extension**
(`12/ab67616d0000b273…`); `sharp` identifies them by content and `readArtworkIdentity` will read
their real dimensions from the header, never from the name.

## 2 — Every hex is an exact pixel of its image, at native resolution — **on both sides**

The contract's central rule, re-derived rather than trusted: the palettes are verified against an
**independent decode**, not against the pipeline's own. `verify.ts::pixelSet` decodes with `sharp` at
native resolution (no `resize`, so no resample), converts to sRGB, excludes `alpha < 255` pixels, and
builds the set of every distinct `#rrggbb` the image actually contains. Every published hex on
**both** sides — four roles per side, plus every gradient stop on the gradient side — must be in it.

| itemId | gradient side | flat side | total | exact pixel |
| --- | --- | --- | --- | --- |
| `item-048` | 8 (4 roles + 4 stops) | 4 | 12 | yes |
| `item-181` | 8 (4 roles + 4 stops) | 4 | 12 | yes |
| `item-039` | 6 (4 roles + 2 stops) | 4 | 10 | yes |
| `item-114` | 8 (4 roles + 4 stops) | 4 | 12 | yes |
| `item-208` | 6 (4 roles + 2 stops) | 4 | 10 | yes |
| `item-130` | 6 (4 roles + 2 stops) | 4 | 10 | yes |
| `item-168` | 6 (4 roles + 2 stops) | 4 | 10 | yes |
| `item-188` | 8 (4 roles + 4 stops) | 4 | 12 | yes |

**88 published colours, 88 found as literal pixels.** The flat side's four are re-checked rather than
assumed equal to the gradient side's — the equality is check 4's job, and a check that assumes the
thing another check proves is not a check.

## 3 — Gradient endpoints are the field roles

First stop `==` background, last stop `==` surface, by exact hex equality (the reviewer's ruling of
2026-08-04, and `GradientSpec`'s stated invariant). **This is the check the whole round rests on**:
it is why deleting the ramp leaves a contract-valid palette, because the ends were never anything but
the two field roles.

| itemId | first stop / background | last stop / surface |
| --- | --- | --- |
| `item-048` | `#0b0310` / `#0b0310` | `#85d6d0` / `#85d6d0` |
| `item-181` | `#183966` / `#183966` | `#ffc7dd` / `#ffc7dd` |
| `item-039` | `#0c0e0d` / `#0c0e0d` | `#101c36` / `#101c36` |
| `item-114` | `#eaeceb` / `#eaeceb` | `#904039` / `#904039` |
| `item-208` | `#b7b29e` / `#b7b29e` | `#75828b` / `#75828b` |
| `item-130` | `#deb355` / `#deb355` | `#fcdf99` / `#fcdf99` |
| `item-168` | `#0b0800` / `#0b0800` | `#26211d` / `#26211d` |
| `item-188` | `#e1f8ee` / `#e1f8ee` | `#094f59` / `#094f59` |

8/8. The flat side publishes no gradient — checked as `null`, not skipped.

## 4 — The flat side is flat, and its roles are the gradient side's

`gradient === null` on side 1 of all eight, and all four role hexes byte-identical to side 0's.
8/8 × 4 roles = 32 equalities, all hold.

## 5 — The two sides differ in `gradient` and in **nothing else**

The manipulation has to be the only manipulation. `verify.ts` compares the two palette objects
key by key and requires the differing-key list to be exactly `[gradient]`.

Served palette keys, per side: `background, surface, foreground, accent, gradient, surfaceCollapsed,
accentCollapsed`. Differing on every item: `gradient` only. 8/8.

`variantId` differs on every item (`p3-fields-0.3.0` vs `p3-fields-0.3.0-flat-treatment`) — required,
because `parseItem` refuses an item that "compares a variant with itself". Neither id is served.

## 6 — Collapse flags consistent, both directions, both sides

Checked **in both directions**, so a flag set without the equality fails as loudly as an equality
without the flag: `surfaceCollapsed` iff `surface === background`; `accentCollapsed` iff
`accent === foreground`. Exact hex equality, which is how invariant 3 defines a sanctioned collapse.

Two flags are set across the sixteen palettes, both `accentCollapsed`, both on both sides of their
item: `item-181` (accent = foreground = `#feffff`) and `item-039` (accent = foreground = `#16294a`).
The other six items have both flags false on both sides and no role-pair equal. No palette asserts a
collapse it does not have, and none has an equality it does not declare.

## 7 — `validatePalette` on both treatments, all eight

Not taken from any report. `validatePalette` (from `src/contract/invariants.ts`) run over the full
contract `Palette` from the run row, then over the same palette with `gradient: null`.

**16/16 valid.** No violations on either treatment of any shipped cover. Transparency is reported as
deferred (`DEFERRED_TRANSPARENCY_REPORT`) on all sixteen — no transparency report was supplied, the
same posture as round 1's check 8.

`verify.ts` also re-checks that each staged role hex equals the run row's, so the round cannot be
shipping a re-derivation of a palette it claims to be quoting. 8/8 × 4 roles.

### The one drop this check caused

`02/ab67616d00001e020002881a851f1e14c374562b.jpg`, ρ **0.6307**, distance 0.0107 — it would otherwise
have been the *sixth-closest* cover to ρ\*. Its **gradient** side fails:

```
I4.ramp-below-contrast-floor  roles.foreground (#bd3a88) over the rendered ramp at t=0.361389
                              (#6f6f84) has |raw APCA| 0.8662, below the floor of 2.5
I4.ramp-below-contrast-floor  roles.accent (#784d7b) over the rendered ramp at t=0.267731
                              (#5b5b73) has |raw APCA| 0.9149, below the floor of 2.5,
                              and is only 0.06385 away in OKLab (functional distance 0.14591)
```

Its flat side passes. **The asymmetry is the reason to drop it, not merely the failure**: shipping a
pair whose gradient side is contract-invalid and whose flat side is valid would put a contract defect
on one arm of a question that is supposed to be about perception, and a flat-preference on it would
have been unattributable. `build.ts` drops on failure of **either** treatment, so this is a rule the
round declared, not a decision taken after seeing which side failed.

## 8 — `render-preview.json` renders the item it belongs to

A staging mistake that would make a human eyeball the wrong pair, so it is checked rather than
assumed. Every preview entry's two sides have role hexes equal to their `items.jsonl` counterparts,
gradient presence agreeing, and — the real check — **different `fieldCss` between the two sides**, on
all eight. Two sides that rendered the same field would not be a comparison. 8/8.

The preview is built by `src/devloop/side.ts::sideFromPalette` — reused, not reimplemented. That
routes names through `review-server/color.ts` (the one `colornames-oklab` call site) and the field CSS
and display positions through `review-server/gradient.ts` (the pinned `[REVIEWED]` display mapping).
A dev viewer that composed its own ramp would show something no reviewer will ever see — up to 0.153
OKLab mid-segment if the interpolation space alone is wrong.

**`render-preview.json` is not a server input and is never served.** The `/pairwise` page
(`review-ui/index.html` + `app.js`) fetches `/api/batches/<id>`, and the server builds every side
itself through `blindSidePayload`. Round 1's equivalent file was called `sidecar.data.json`, a name
one directory away from `review-ui/*.data.json`, which *are* served; renamed here so nothing can copy
it into the wrong place by analogy.

## 9 — The fingerprint's commit claim is a fact

`gitCommit: bead404, dirty: false` on both sides of all eight items. Three independent confirmations,
because round 1 discovered the hard way that a commit hash can silently mean two different things:

1. `git status --porcelain research/v3/src research/v3/prototypes/p3-fields/src` → **empty**. The
   worktree's source is clean.
2. `git diff bead404..HEAD -- research/v3/src research/v3/prototypes/p3-fields/src` → **empty**. HEAD
   is `2ccb19b` (W9's re-measure, which touched only measurement files); the source trees are
   byte-identical to `bead404`.
3. `computeCodeVersion(prototypes/p3-fields/src/candidate.ts)` recomputed from the working tree
   returns `1cc28c1efb1f38de1806daab20029d1565c5f6b5eb930337f3bc0dd6e91b4849` — **equal** to the
   `codeVersion` in `run-coverage-220-0.3.0.jsonl`'s header. The run's module graph is the graph on
   disk now, and (by 1 and 2) the graph at `bead404`.

Unlike round 1, no `_pinned-<commit>/` re-extraction was needed: there is nothing to pin against,
because nothing moved.

## 10 — Payload hygiene

The blinded payload carries roles, collapse flags, gradient stops and `fieldCss` and nothing else
(`blindSidePayload`: no variant id, no fingerprint, no palette hash). Check 5 established that the two
sides differ only in `gradient`, so **no incidental served field separates the sides** — stop
positions are canonicalised at push time and `fieldCss` comes from one pinned formatter, closing the
two channels `blinding.ts` names as otherwise-fingerprinting.

The orchestrator-only fields in `items.jsonl` — `variantId`, `fingerprint`, `bestRho`,
`distanceFromRhoStar`, `runIndex` — live in a file that is never served, the same convention as round
1 and as `fixtures/demo-calibration.json`.

**What is deliberately NOT claimed:** that the reviewer cannot tell which side is which. They can, and
`ROUND.md` says so at length: `blinding.ts` documents that a flat-vs-gradient two-arm batch is
unblindable 24/24 from the served payload alone. The shuffle here buys position-bias removal, not
concealment, and this round's question does not need concealment.

---

## Files in this round

| file | what it is |
| --- | --- |
| `items.jsonl` | the 8 pairs, in the push shape; hexes copied verbatim from the run rows |
| `render-preview.json` | LOCAL two-sided render preview. Not served, not a server input |
| `ROUND.md` | the question, the design limitation, the decision rule and the outcome branches — all pre-registered |
| `VERIFY.md` | this file |
| `build.ts` | selects the 8 pairs and writes `items.jsonl` + `render-preview.json` |
| `verify.ts` | checks 1–9 |

Source data, both read-only to this round and living in `../../measurements/`:
`gradient-borderline-0.3.0.json` (the 20-cover draw pool, W9) and `run-coverage-220-0.3.0.jsonl`
(the 0.3.0 coverage-set-1 run: 220 rows, the source of every hex).
