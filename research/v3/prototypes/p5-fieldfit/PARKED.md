# PARKED — reviewer-ordered park #4, 2026-08-05

## State at park

- **STATE.md is committed** (`b2d9021`, signed G) — the reviewer's mechanism-selection input is
  on disk and in history, per the pre-park order.
- All work committed and signed through `b2d9021`; owed-commit ledger CLOSED (v0.8.0+v0.8.1
  flushed as `b3e1e94`).
- Committed state = v0.8.1 (pool re-union) + all rulings through SPEC decision 18's
  scale-mixing paragraph.

## Mid-flight (may complete during park; output NOT acted on)

- **W-P16** (fresh worker): fg class-first ordering (v0.8.2) — overlay candidates outrank
  ground-shaped components for the foreground slot; accent union unchanged. Reports to
  `reports/wp16.md`. STOP-CONDITION in its brief: if the sunset STRONG (`908479200b`) cannot be
  held byte-identical, it stops for a ruling instead of shipping. My watcher may fire during the
  park — noted, not acted on.

## Exact resume sequence

1. Read `reports/wp16.md` (stall protocol if absent). Verify anchors: (a) `2376a6b67d` fg
   `#000000` / accent `#f81107` — the reviewer's verbatim round-3 ask; (b) `908479200b`
   byte-identical (if the worker stopped for the accent-still-moves ruling, rule: the accent
   union may not displace a silently-STRONG accent — prefer holding reviewer-validated palettes;
   any override needs its own round evidence); (c) `28279e9184` fg `#ffffff`; (d) both other
   STRONGs byte-identical; (e) both delta tables (vs v0.8.1 and vs v0.7.1, the last
   reviewer-seen state). Rule on deviations, commit signed.
2. Full 600-trial robustness on the landed version (`--out data/robustness/reports/
   p5-fieldfit-<version>.json`, background, no --limit); compare v0.6.0's 40.8%/46.2% baseline;
   commit artifact.
3. Round 4 staging (fresh worker, rounds-2/3 protocol): returning — `2376a6b67d` (set-coverage +
   class-ruling verdict), `9646be9b20` (ink veto verdict), `16a8247378` or `908479200b` only if
   pass 16 moved them (else keep slots fresh); fresh — light-field-light-text drawn from BEYOND
   coverage-set-1 (0/213 there; widen the pool, never relax markLightShare), one vivid
   illustration (item-6 class), remainder by census; plus the targeted item-7 confirmation
   question (propose as a per-item note-prompt or freetext follow-on — installer decides the
   vehicle). Validate, commit, REVIEW-READY report per §7.
4. Then the standing queue: robustness stabilization (margin-aware selection, accent 46.2%
   target); v0.9 mark-level grouping (15b + coherence eligibility); upward formula packet
   (4 strikes) whenever the main orchestrator collects.

## Standing open items

Unchanged from STATE.md §3–4 (the authoritative statement for the reviewer): robustness flank
located-not-fixed; mark-level grouping unbuilt; identity granularity blocked upward; item-6
class unanswered; light-field class unevidenced; escape path unexercised; E1 deferred.
