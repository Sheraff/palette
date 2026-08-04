# PARKED — reviewer-ordered pause, 2026-08-04

## Current state

- v0.1 complete, verified, round-1 reviewed (batch phase2-cal-001: 2 STRONG, 3 ACCEPTABLE, 1 WEAK,
  2 UNACCEPTABLE). All state through round-1 staging committed and signed (`3df30d9` → `ec2c995`),
  branch `proto/p5-fieldfit`.
- Round-1 rulings recorded in SPEC.md decisions 7 and 8 (published-representative feasibility;
  foreground = argmax min|APCA| over rendered ramp, mass tie-break; accent = argmax min-distance to
  everything published, mass tie-break). SPEC edits are committed? NO — the two round-1-ruling
  edits to SPEC.md are uncommitted in the worktree (made after `ec2c995`); intended to be committed
  together with the v0.2 implementation as one signed commit.

## Mid-flight

- W-INTEG pass 5 (the v0.2 implementation of the three rulings + before/after on covers
  `0c4aab8aa7`, `2376a6b67d`, `908479200b`, `28279e9184` + fresh full robustness run) was
  dispatched BEFORE the pause order and is running unattended. Per the pause order it may finish
  writing to disk (`reports/winteg-pass5.md`, source changes, run/robustness outputs) but its
  output has NOT been read or acted on. Completion notifications, if any arrive during the pause,
  are noted and not acted on.

## Exact next actions on RESUME, in order

1. Read `reports/winteg-pass5.md`; if absent or stale, check worker liveness (output-file mtime,
   file mtimes under `src/`) before anything else — quiet-stall protocol.
2. Judge the four before/after palettes against the round-1 notes (expected: legible fg on
   `0c4aab8aa7`; white-ish accent + collapsed-or-distinct pair on `2376a6b67d`; vivid accent — the
   pink — on `28279e9184`; richer accent on `908479200b`). Compare the new robustness table to
   baseline (overall 37.7%, q92 59%, dither 33%, pairs 23.5%, accent unstable 50.8%).
3. Commit SPEC ruling edits + v0.2 implementation, signed, explicit pathspec.
4. If palettes match predictions: author `review-rounds/round-2/ROUND.md` (fg-adequacy
   corroboration + retreat-with-accent + `fc8d58e0af` named-accent check + 2–3 fresh non-demo-20
   covers), dispatch W-STAGE for round 2, then REVIEW-READY report per §7. If they do not match:
   iterate with W-INTEG before any round.
5. Standing next milestone after round 2: robustness stabilization of the discrete selections
   (snap, cluster argmax, front winner) — P5 trails P3 (62.3% vs 18.2% disagreement) and the
   72.8% q92 anchor.

## Open items unaffected by the pause (for the eventual §7 report)

Escape + post-snap third-stop paths unexercised (0/20); honesty scanner blind to `prototypes/`
(upward, instrument-level); contract I3 still enforces disavowed 0.07444 (upward; round-1 item 8
STRONG is fresh evidence for sameColor-only); E1 multi-start and E2 two-field reading deferred.
