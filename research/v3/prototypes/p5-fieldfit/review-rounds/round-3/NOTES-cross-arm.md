# Cross-arm evidence folded before round-3 analysis (2026-08-05)

Recorded pre-release so the round-3 analysis reads grades against these priors; the staged
composition is untouched (staging was in flight when this arrived).

1. **Identity-coverage is a grading axis** — a distinct chromatic colour present in the artwork
   but absent from the palette draws complaints even when everything published is fine. Two arms
   have now hit it independently (our round-2 "missing the white" + the other arm's round). For
   round-3 analysis: read every note through this axis first; P5's mass-led identity rules answer
   part of it, but coverage of a *second* vivid colour is nobody's role today — if it recurs,
   that's a mechanism question (which role, or the two-component surface, carries it), not a
   tuning one.
2. **Stop-spacing banding**: adjacent stops 3.1% apart read as "very significant banding" to the
   reviewer. P5 currently publishes 2-stop ramps (interior stop only via excursion, dropped if it
   snaps onto an end) — low exposure, but any future interior stop must respect a spacing floor;
   prior recorded, no constant invented ahead of evidence.
3. **Gradient boolean errs live in both directions across arms** (false gradient at high rank
   correlation; asked-for gradient where none published). P5's component reading just moved
   several covers from flat→gradient; round-3 items 1–2 and fresh item 8 grade exactly this.
   If a false-gradient complaint appears on a component ramp, endpoint-identity (do the ends read
   as the artwork's colours) matters beyond any correlation measure.
4. **Stop count drove preference in another arm's pairwise round** — every 4-stop ramp graded
   unacceptable with "banding" named; every preference-winner was 2-stop; one meander complaint
   ("no blue-to-red-to-blue"). P5's standing posture — 2 stops default, third only on measured
   excursion, no fourth, monotone-in-t enforced — is directly validated; the contract's "4
   negotiable" now has evidence against. No change; the posture is now evidence-backed rather
   than doctrine.
5. **Identity-coverage reaches foreground territory** (a missing title-text yellow — same shape
   as our item-7 white-title evidence, second arm), and a **new accent shape: family separation
   from the field** ("better within the blue family instead of the same family as background and
   surface"). P5's accent distinctness is bar-level vs published colours, not family-level vs the
   field — if one of our rounds draws a same-family-accent complaint, the mechanism question is
   whether accent feasibility needs a hue-family term, and it gets its own evidence before any
   rule changes. Prior recorded.
6. **The reviewer grades margins; optimizers sit on floors** (another arm: 6/6 low, published
   pairs cleared sameColorBar by 1e-4–3e-3, called indistinguishable). P5's mass-led argmaxes do
   not optimize *toward* floors, but epsilon-clearing happens by accident (fg floor at ~15.x, twin
   ratios just above 8, near-black at 11.4). Action folded into pass 10: publish per-pair margins
   over their bars in Diagnostics so round analyses can correlate complaints with epsilon-margins
   — reporting only, no behavioural change ahead of evidence. Epsilon-pairs reading as one colour
   is further same-colour-bar calibration evidence for the upward packet.
7. **Population floors exclude reviewer-named colours** (another arm: 4 of 7 reviewer-named marks
   at rank-0 blocked by a 0.1% population floor; corpus median *endorsed* role colour has
   exact-triple share 8.89e-5). P5's exposure assessment: our only candidacy floor is
   `NEGLIGIBLE_OVERLAY_MASS_FRACTION = 1e-4` **of total overlay mass**, not of image population —
   a tiny mark on a well-fitted field owns a large share of a small overlay total, so the shapes
   diverge exactly where the hazard lives; and every reviewer-named colour to date (pink, white
   title, brown/green) was missed by ranking criteria, never by the floor, on our record. Still
   scheduled: a measured audit in the next code pass — for each reviewer-named colour, the
   overlay-mass share of its family cluster vs the floor — so the exposure claim is verified, not
   assumed. Concentration-shaped eligibility (our overlay-mass denominator) over raw population
   share is precisely the arms' original design choice; the audit checks it held.
   *Audit result (wp11 §3):* held — nothing reviewer-named was floor-excluded (cluster shares
   69.6×–722× the floor); measured caveat: the floor drops most *triples* of a family (white
   519/554, pink 1183/1440) and two named colours sit at only ~5× triple-level headroom —
   concentration carries them.
   *Cross-arm follow-up (2026-08-05):* another arm replaced its raw population floor with
   **coherence-shaped eligibility** and measured it clean (robustness within noise, contract
   identical, 0.97× cost, 18 spurious accent collapses removed, floor-blocked named marks
   published at rank 0; residual risk — compact-artifact shapes — sent to the judge). For P5 this
   is the same mechanism family as the deferred decision-15b **mark-level grouping**: one
   mark-support instrument would serve both coherence eligibility and ink-likeness. If any round
   ever shows a P5 floor-blocked named colour, this is the measured-viable alternative shape;
   until then our floor stands on its verified audit.
