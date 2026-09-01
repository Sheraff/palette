# v2-3 Track Charter

Binding rules for every agent working on the palette algorithm v2-3 line. Read fully before touching anything.

## The goal

Improve the **accuracy** of the palette output. The output shape is fixed and correct: 4 colors (`background`, `surface`, `foreground`, `accent`) plus a gradient decision (boolean, optionally with a source-supported midpoint color). We aim to represent **what the artwork is** — nothing else.

## Hard constraints (from Flo, 2026-07-30)

1. **`research/v2-2/` is FROZEN.** Never edit anything under it. It is the parity-locked baseline. All work happens in `research/v2-3/` (or new sibling folders).
2. **APCA contrast is intentionally very low.** This is not web accessibility; human review has judged Lc ≈ 9 outputs as good. APCA is one piece of evidence among others. The hard minimum must remain a *parameter* a library user can raise, defaulting to the current behavior. Do NOT introduce accessibility-level contrast floors. Contrast *pathologies* are still fair game (e.g., APCA sign flips across gradient samples imply a zero-contrast crossing inside the gradient — that is a defect).
3. **Full-resolution processing is deliberate.** Downsampling previously destroyed artwork-identity information. Do not downsample unless you can demonstrate it is information-preserving for the evidence that consumes it. Accuracy matters more than speed while runtime is not the iteration bottleneck.
4. **Never snap a synthesized color to a bare single pixel.** A lone pixel can be noise, JPEG aberration, anything. Snapping to source requires a minimum representativity (density/population/neighborhood support). The existing `SourceSupportRecord` machinery shows the expected standard.
5. **Gradient neutrality.** An incorrectly *allowed* gradient is exactly as bad as an incorrectly *prevented* one. Measure both directions on every change.
6. **Determinism.** Same input → same output, always. No randomness, no time dependence. Follow the existing pattern: explicit tie-breaks (ASCII/id ordering) everywhere.
7. **Architecture invariants** (enforced by `research/v2-3/test/architecture.test.ts`): runtime imports stay closed inside `research/v2-3/` (only `apca-w3` and `sharp` as packages), and no reviewed-case IDs, fixture paths, source hashes, or expected output colors may appear in runtime code. Never special-case a test image.

## Working method

- Work only in your assigned worktree/branch. Commit with clear messages. Do not modify `package.json`, `research/v2-2/`, or other tracks' folders.
- The 34-fixture parity test (`research/v2-3/test/parity.test.ts`) freezes the *failed checkpoint's* outputs — including known-bad ones. Your change is *expected* to break parity on your target cases. Do not run the full parity suite repeatedly (it is very slow); run your targeted subset with a small script instead.
- Ground truth is human review, recorded in `research/ALBUM_ARTWORK_UI_PALETTE_PHASE_3_FINAL_SHOWCASE_POSTMORTEM.md` (absolute verdicts for all 34 `images/` artworks, failure-stage analysis) and earlier review docs. Read the verdicts for your target cases before designing.
- Evaluation discipline for every experiment:
  - Pick a **target subset** (the failure cases your idea addresses) and a **regression subset** (4–6 cases the postmortem judged `strong`, ideally spanning strata: 2-color collapse, 4-color flat, gradient).
  - Record before/after winners (all 4 hexes + gradient/midpoint) for both subsets. Any regression-subset change is a red flag you must explain.
  - Run one image twice to confirm determinism.
  - Typecheck (`node_modules/.bin/tsc -p research/v2-3/tsconfig.json`) and run the architecture test.
- Deliverable per experiment: an `EXPERIMENT.md` in your track folder containing: the hypothesis, what you changed (files + rationale), the before/after table, honest self-assessment (including uncertainty and regressions), and which cases you propose for the next 4–10-item human review batch.
- Human reviews are small (4–10 items) and frequent. Design your outputs so the orchestrator can assemble a review batch directly from your `EXPERIMENT.md`.

## Multiple valid palettes — guardrail semantics (Flo, 2026-08-02)

**Moving an artwork off its reviewed-strong palette is not automatically a regression.** An artwork
can have multiple valid palettes. A mover is a regression ONLY when the destination palette was
itself reviewed negatively, or was previously compared inferior to the palette it replaces. A mover
to an unadjudicated palette is *reviewable movement*: attribute it, put it in the batch, and let the
verdict decide. Byte-preservation of reviewed-strong outcomes is therefore NOT the guardrail bar —
the bar is "never move TO a known-worse palette." Arms should write their revert rules accordingly
(auto-kill only on destination-known-bad; destination-unknown goes to review).

## Verdict recency (learned 2026-08-01)

**The LATEST verdict per artwork is authoritative.** Guardrail/HOLD sets must be mined from the live `verdicts.jsonl` at arm start, not inherited from briefs or earlier EXPERIMENT.md files — three arms were found protecting outcomes that later batches reversed (the batch-20 foreground swaps superseded several long-standing "frozen" arrangements). A reviewed-strong outcome is frozen only until a newer verdict on the same artwork supersedes it.

## Machine budget (learned 2026-07-31)

- **One corpus-scale sweep at a time, orchestrator-serialized.** Parallel heavy sweeps starved each other (load 20–66; one track's stability draw died incomplete because another's 11-worker sweep owned the machine).
- **Sweep workers: at most 4 processes**, and set `VIPS_CONCURRENCY=1` (or `sharp.concurrency(1)`) in worker processes — sharp otherwise spawns ~ncpu threads *per process*, which is how 11 workers became 100+ threads.
- Long unattended sweeps must be checkpointed/resumable (write one result file per job) so the orchestrator can kill them at any time to free the machine for higher-priority arms.

## Corpus trap and deletion claims (learned 2026-07-31)

- **In a git worktree, `images/` checks out containing ONLY the `-scrambled` decoys** — the real artworks are gitignored. Scrambled images preserve color histograms but destroy spatial structure, so probes run on them make field/gradient/transition machinery look dead when it is not. Always read artwork from `/Users/Flo/GitHub/palette/images/` (the shared checkout) via the documented image-root env var, and state in your report which corpus every measurement used.
- **"Safe to delete" claims require**: the unscrambled corpus, a fresh off-panel sample of ≥60 artworks, and a winner-diffing ablation (replay with the mechanism removed) — never a firing-rate count alone. A mechanism firing on 1 artwork in 118 is indistinguishable from a dead one on any small corpus; three of four zero-effect claims in the first adversarial review were corpus or sample-size artifacts.

## Integration

Tracks do not merge themselves. The orchestrator integrates proven ideas into `research/v2-3/` sequentially after human review confirms them. Keep your diff minimal and focused so integration stays cheap.
