# p6-round-1

- **Round kind:** calibration (absolute grading, one palette per item, no comparison — REVIEW_UI.md §5)
- **Batch id:** `p6-round-1`
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
| 1 | `p6-round-1-01-d2b82cd5` | `00/00007e976f2fb1819d1ec7e0cc2869f39d397ba3.jpg` |
| 2 | `p6-round-1-02-9dcfd80b` | `00/ab67616d00001e02000001335fe604d859a69094.jpg` |
| 3 | `p6-round-1-03-066cdd5d` | `00/ab67616d00001e0200000ee5a62175fc8d58e0af.jpg` |
| 4 | `p6-round-1-04-9619ff4e` | `00/ab67616d00001e02000018e9b0ec8fc5ac790164.jpg` |
| 5 | `p6-round-1-05-7d3d097f` | `00/ab67616d00001e02000022e7e9d11c908479200b.jpg` |
| 6 | `p6-round-1-06-22ea9268` | `00/ab67616d00001e020000269ead63cf2376a6b67d.jpg` |

Candidate identity, code version and the run this came from are deliberately **not** here —
they live in `private-mapping.json`, which the post-release analyst reads and nobody else does.

## Staging checks

- every cover exists on disk and has a repo-relative path (6 covers).
- every palette's metadata hash and source path match its run row, and every cover's bytes still hash to what the run saw.
- `fixture.json` passes this tool's own mirror of the calibration push schema.
- `fixture.json` passes `src/review-server/batch.ts:parseCalibrationBatch` verbatim (paths absolutised, as the pusher will).
- `sidecar.data.json` carries render data only — no candidate id, code version, run id, or cover path.
- neither payload names the de-blinding join, and the fixture carries the candidate id only as `fingerprint.algorithmVersion` (schema-required, never served).

### Not checked, and why

- **Published colours were not re-checked against the artwork's pixels.** The run row carries a palette and a content hash, not a colour inventory, so the check would mean re-decoding every cover at staging time — with whichever `sharp` this process resolves, which is not necessarily the one the run used (`CONVENTIONS.md`: this repo carries two, and they decode some AVIFs differently). A staging-time decode could therefore manufacture a failure the palette does not have. Invariant 2 belongs to `src/contract/invariants.ts`, run against the same decode that produced the palette.
- **`gradient.geometry` is dropped.** The contract publishes an object; the push schema takes a string of ≤64 characters. There is no lossless map, and geometry is opportunistic by design (`PHASE_0_DECISIONS.md` §2).

## Before submission

1. Fill in `fundedBy` in `fixture.json` with the record ids of the evidence that motivated it.
2. Fill in every TODO above.
3. Hand the directory to the main orchestrator. **This prototype does not push.**
