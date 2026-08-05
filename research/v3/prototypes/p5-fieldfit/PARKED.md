# PARKED — reviewer-ordered pause #2, 2026-08-05

## Current state

- **v0.5.1 shipped to round 3** (batch not yet released to my knowledge): 3 returning + 5 fresh
  calibration items, staged/validated/committed `79926a5`, robustness artifact `014c262`. All
  commits signed G through `014c262`.
- **Uncommitted in worktree:** SPEC.md decision 5's guide-stop ruling paragraph (2026-08-05),
  NOTES-cross-arm.md items 4–6, and whatever W-P10 has written so far. Intended commit after
  pass-10 collection: "p5-fieldfit v0.6.0: guide-stop doctrine (t-continuity discriminator,
  best-monotone acceptance), margin reporting; SPEC 5 ruling + cross-arm notes".

## Mid-flight (may complete during pause; output NOT to be acted on until RESUME)

- **W-P10** (fresh worker): guide-stop doctrine + margin reporting, v0.6.0. Reports to
  `reports/wp10.md`; may also write `reports/wp10-types.md` (Diagnostics fields proposal —
  types.ts is frozen pending my edit). My watcher for it may fire during the pause — noted here,
  not acted on.

## Exact next actions on RESUME, in order

1. Read `reports/wp10.md` (stall protocol if absent: check file mtimes under src/, worker output
   mtime). If `wp10-types.md` exists: review proposed Diagnostics fields, edit types.ts (mine),
   resume-or-respawn a fresh worker to wire them (W-P10 itself is one-shot; spawn fresh with
   pointers).
2. Verify pass-10 anchors from the report: item-8 cover publishes a monotone 3-stop guided ramp;
   `2376a6b67d` byte-identical two-block; measured t-continuity values for both anchors and the
   constant between them; blast radius vs run `20260805T062638253Z`.
3. Commit v0.6.0 + SPEC ruling + notes (signed, pathspec `research/v3/prototypes/p5-fieldfit`).
4. Full robustness on v0.6.0 (background, `--out data/robustness/reports/p5-fieldfit-0.6.0.json`)
   — the guide-stop change touches gradient publication, expect movement in bg/surface agreement.
5. Then the standing queue: **cost pass** (component recursion ≈ 9.4 s/palette at robustness
   scale — lattice-subsample the component solves as the global fit does); **robustness
   stabilization** (accent 46.3% instability; margin-aware selection once margin reporting is in).
6. If round-3 verdicts (batch id unknown yet) arrive first: analyst flow per the standing process
   change — spawn my own Opus analyst on the released payload + batch log + round-3 ROUND.md
   mapping, re-verify its decode from the warehouse myself (final record per item — the warehouse
   is append-only with mid-edit snapshots), then rule. Cross-arm priors for that analysis are in
   `review-rounds/round-3/NOTES-cross-arm.md` (identity-coverage axis first, family-separation
   accent shape, stop-count posture, margins-not-floors).

## Standing open items (unchanged from the last §7 report)

Cost pass owed; stabilization queue (v0.5.1: 40.8% overall, accent 46.3); upward
formula-calibration packet (near-black ratios 6.6/11.4, twin-ratio spread 1.8–6.6, cross-arm
epsilon-margins); guide stops never yet accepted on any real cover (pass 10 addresses); E1
multi-start still deferred; escape + post-snap third-stop paths unexercised on dev sets.
