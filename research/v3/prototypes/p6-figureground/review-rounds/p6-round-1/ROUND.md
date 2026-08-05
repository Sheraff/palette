# p6-round-1

- **Round kind:** calibration (absolute grading, one palette per item, no comparison — REVIEW_UI.md §5)
- **Batch id:** `cal-bd66a37d` (content-derived placeholder — the installer assigns the real batch id at push; the previous install was retired as record `bc-msf8yakf-716f40fb`)
- **Items:** 6
- **Purpose:** First P6 calibration: grade 6 palettes; arbitrates fg/accent ordering and accent vividness

## The question this round answers

How good are P6's first palettes on their own terms — specifically: did the algorithm put the
readable colour in the foreground seat and the vivid colour in the accent seat, or does the
grading show those two seats swapped or washed out? The six covers were chosen to expose exactly
that: two where our measurements say the reading is healthy, two where the energy assigned the
artwork's vivid colour to the *foreground* and the pale one to the accent (the ordering is the
question — both colours are in the palette), one where a pure-red mark got a near-white accent,
and one where the readable ink ranked far below a barely-readable winner.

## What we do under each outcome

Filled in BEFORE the round is submitted, not after it comes back. A round whose consequences
are written after the verdicts is a round that can be read to mean whatever is convenient.

- **Mostly strong (≥4 of 6 graded 3–4):** our check battery is a pessimistic instrument — its
  three failing checks (fg floor-clustering, accent dullness, near-zero swap gaps) do not predict
  reviewer verdicts. We proceed to robustness and the coverage set without further term repairs,
  and the degeneracy finding is characterized by the sensitivity harness only.
- **Mixed (grades split, with per-item notes pointing at accents on some covers and foregrounds
  on others):** the battery is directionally right. Repair priority is set by which complaint
  class dominates the notes: accent complaints → the fg/accent role-degeneracy is first (the
  anisotropy sensitivity sweep documents whether any principled magnitude separates the roles;
  if only a hand-set magnitude does, that is a MECHANISM-FALSIFIED datum per the pre-registered
  falsifier, not a tuning opportunity); foreground complaints → the coincidence-kernel width
  question (its 1-bar read is a letter-vs-intent gap already measured to suppress readable ink).
- **Mostly weak (≥4 of 6 graded 1–2):** the mechanism's role-fitness vocabulary (ink = lightness
  displacement, mark = chroma displacement, both per-mass, ground-coincidence-weighted) is
  reopened as a whole — the question stops being which term to repair and becomes whether
  figure-role reading off displacement statistics survives contact with the reviewer at all.
  No constant is nudged in response; the finding goes upward in the §7 report first.
- **Confounded / unanswerable (vetoes, or notes says the round asked the wrong question):**
  restage as a pairwise round — same covers, P6's palette against the same cover's palette with
  fg/accent swapped — so the ordering question is answered by preference instead of absolute
  grading.

## Items

| # | item id | cover |
|---|---|---|
| 1 | `00007e976f2fb1819d1ec7e0cc2869f39d397ba3` | `00/00007e976f2fb1819d1ec7e0cc2869f39d397ba3.jpg` |
| 2 | `ab67616d00001e02000001335fe604d859a69094` | `00/ab67616d00001e02000001335fe604d859a69094.jpg` |
| 3 | `ab67616d00001e0200000ee5a62175fc8d58e0af` | `00/ab67616d00001e0200000ee5a62175fc8d58e0af.jpg` |
| 4 | `ab67616d00001e02000018e9b0ec8fc5ac790164` | `00/ab67616d00001e02000018e9b0ec8fc5ac790164.jpg` |
| 5 | `ab67616d00001e02000022e7e9d11c908479200b` | `00/ab67616d00001e02000022e7e9d11c908479200b.jpg` |
| 6 | `ab67616d00001e020000269ead63cf2376a6b67d` | `00/ab67616d00001e020000269ead63cf2376a6b67d.jpg` |

Candidate identity, code version and the run this came from are deliberately **not** here —
they live in `private-mapping.json`, which the post-release analyst reads and nobody else does.

## Correction of record — first staging retired for a blinding defect

The first staging of this round was installed and RETIRED before any review (record
`bc-msf8yakf-716f40fb`, 0 answers): its item ids were `p6-round-1-NN-<hash>`, and the item id
is served to the reviewer verbatim as the `questionKey` (media and itemRef use opaque tokens —
the verifier corrected this attribution; the leak channel was `questionKey`, not the media URL) —
a mechanism-blinding break, violating
this prototype's own directive-10 standard ("no candidate identity anywhere the reviewer can
see"). Two failures, both ours: the id scheme, and the blinding test that scanned for candidate
ids and arm labels but not the round-name tokens the ids were built from. Both are fixed: item
ids are now the cover's own 40-hex stem (content-derived, cross-round joinable), the tool
hard-errors on prototype tokens in round names and batch ids, and the test that would have
caught the defect now checks every served string against the round name's tokens. The old→new
id mapping lives in `private-mapping.json` provenance — deliberately not here, since the old
ids name the prototype.

## Staging checks

- item ids are content-derived and name nothing about this prototype (filename-stem).
- `batchId` is the placeholder `cal-bd66a37d`, derived from the item ids — the installer assigns the real batch id at push.
- every cover exists on disk and has a repo-relative path (6 covers).
- every palette's metadata hash and source path match its run row, and every cover's bytes still hash to what the run saw.
- `fixture.json` passes this tool's own mirror of the calibration push schema.
- `fixture.json` passes `src/review-server/batch.ts:parseCalibrationBatch` verbatim (paths absolutised, as the pusher will).
- `sidecar.data.json` carries render data only — no candidate id, code version, run id, or cover path.
- neither payload names the de-blinding join, and the fixture carries the candidate id only as `fingerprint.algorithmVersion` (schema-required, never served).
- no served string — item id, batch id, media URL, side-car key or fixture field — carries the round name or any of `p6`, `figureground`, `figure-ground`, `round`, except `fingerprint.algorithmVersion`, which the server never serves.

*(Correction of record, second instance: the first hand-merge of this file dropped the three
attestations above that the regenerated tool emitted — including the round-name scan, the exact
defect class this restage exists to fix. Caught by the independent verifier (check 6b), restored
here. The lesson stands: hand-merging tool output loses exactly the lines one is not looking at.)*

### Not checked, and why

- **Published colours were not re-checked against the artwork's pixels.** The run row carries a palette and a content hash, not a colour inventory, so the check would mean re-decoding every cover at staging time — with whichever `sharp` this process resolves, which is not necessarily the one the run used (`CONVENTIONS.md`: this repo carries two, and they decode some AVIFs differently). A staging-time decode could therefore manufacture a failure the palette does not have. Invariant 2 belongs to `src/contract/invariants.ts`, run against the same decode that produced the palette.
- **`gradient.geometry` is dropped.** The contract publishes an object; the push schema takes a string of ≤64 characters. There is no lossless map, and geometry is opportunistic by design (`PHASE_0_DECISIONS.md` §2).

## Before submission

1. `fundedBy` stays `[]` by main-tier ruling (first install): the installer substitutes the neutral standard string; this prototype's committed reports are the recorded motivation.
2. Fill in every TODO above.
3. Hand the directory to the main orchestrator. **This prototype does not push.**
