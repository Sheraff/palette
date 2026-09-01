# Imported record — provenance

`EXPERIMENT.md` in this directory was **not produced on trunk**. It is a verbatim copy, imported so
that trunk citations resolve.

| | |
|---|---|
| Source branch | `worktree-agent-abde0e8506e62dab9` (local only; never pushed to `origin`) |
| Source commit | `7f3adc5` — *"v2-3: perceptual same-color floors for foreground/field and gradient endpoints"* |
| Source path | `research/v2-3-experiments/track-q/EXPERIMENT.md` (619 lines, unchanged) |
| Imported by | provenance-hygiene sweep, 2026-08-01, onto trunk `199796b` |

Imported because three trunk sites attribute a claim to "Track Q" with nothing behind it at HEAD:
`research/v2-3/src/internal/policy.ts:108` and `:129` (the 214-artwork bimodality argument) and
`research/v2-3/test/configuration.test.ts` (the unified same-colour bar). The adversarial evidence
review flagged this as a dangling citation.

Only `EXPERIMENT.md` was imported; the arm's single sibling `probe-refinement-funnel.ts` stays on
the source branch and nothing on trunk cites it.

## What it actually supports

The census at `EXPERIMENT.md:275-288` measures foreground-vs-field ΔE on **214 distinct
non-scrambled artworks** and finds the distribution sharply bimodal: one case at ΔE 0.356, then
nothing at all until ΔE 9.19 (`knuckles`). Any threshold in (1, 9) selects the same two artworks, so
reusing the reviewed same-colour bar of 3.3 as a foreground/field floor and a gradient-endpoint
floor has zero blast radius outside the degenerate cases (`:301-304`).

Independently re-verified during the import: `perceptualDifference("#dad6cb", "#beb2c6"-class pairs)`
reproduces the named figures — the degenerate case computes to ΔE 0.356 and `knuckles`' endorsed
foreground/background pair to ΔE 9.188. (The adversarial review quoted the degenerate case as
0.366; 0.356 is correct.)

This record does **not** support the seven midpoint anchors (0.00 / 1.00 / 3.01 / 3.64 / 9.78 /
19.75 / 62.59) that set 3.3 in the first place. Those exist only in the source comments at
`policy.ts:101` and `palette-core.ts:2856` and have no experiment record anywhere.
