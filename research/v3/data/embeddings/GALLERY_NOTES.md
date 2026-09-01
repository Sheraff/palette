# Reviewer notes — embedding gallery browse (2026-08-02)

Reviewer (Flo) browsed the three-finalist cluster galleries + neighbors panel. Verbatim
observations, recorded for the model decision and future threshold work. (To be ported into
the warehouse as tagged note records once the tagging flow exists.)

1. **PE-Core-L14 matches by artist, not by image.** "Seems to consider 'close' artworks when
   they are by the same artist, even if the images themselves don't look much alike (happens
   for toxicity, johns, krafty, muse, infected). For some of them it *could* be the band's
   logo that is the same, for others it might be the textual content that is the same (band's
   name), or it has deep knowledge of music artworks." — Consequence (orchestrator): this is
   semantic leakage for our use cases (near-dup, stratification, visual retrieval);
   PE-Core is eliminated as the canonical instrument on this evidence, independent of its
   R@1.
2. **DINOv2 vs DINOv3 attend to different structure.** "For krafty, DINOv2 focused on the
   layout and flowers, while DINOv3 seems to have focused more on the strong typography."
3. **DINOv3 sometimes matches semantic category across styles.** "For the boat in johns → a
   picture of a boat, a painting of a boat, a logo of a boat, a drawing of an origami boat,
   all in different styles but all boats."
4. **Overall:** "I think the DINO models are better, but I wouldn't know which one of the 2."

Decision status: DINO family chosen; v2-vs-v3 pending the dinov2-vitl14-392 tiebreaker +
tail-behavior argument (dinov3 worst rank 17 vs dinov2's 64 in `bakeoff.json`).
