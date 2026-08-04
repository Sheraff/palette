# Owed commits — p3-fields

Ledger empty. Backlog flushed 2026-08-04 after vault unlock: `3f0082e` (falsifier), `2f72619`
(pipeline), `809e2a5` (audit), all signed (G). File retained in case the vault locks again;
entries follow the format: pathspec, staged yes/no, full intended message.

## Pending — VAULT RE-LOCKED 2026-08-04 (error: `1Password: failed to fill whole buffer`,
## two attempts; staged, not committed)

### measurements + this ledger (READY, staged)

- **Pathspec:** `research/v3/prototypes/p3-fields/measurements research/v3/prototypes/p3-fields/OWED_COMMITS.md`
- **Message:**
  ```
  p3-fields: W4 baseline — robustness 18.2%, polarity inversions diagnosed

  Full 600-trial run, 0 errors: overall 18.2% [15.3-21.5], jpeg-q92 28.0%
  (v2-3 anchor 72.8%), dither-lsb1 18.0%, pairs 14.5%. Overfit ratio
  1.286x (perturbation basis; intervals overlap). Dominant failure:
  whole-palette black<->white inversion on near-neutral covers — 114/491
  disagreements move all four roles; worst roles fg 179, accent 168.
  Discrete near-tied choices, not hue drift. Adjudication over 197
  evidence artworks: W3 L0 NS194, 0 conflicts. Ledger: pending entry
  cleared.

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  ```
