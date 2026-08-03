# Reviewer notes — SAM mask-quality round 1 (2026-08-03)

60/60 answered, released. Verbatim observations (the reviewer's words), with orchestrator
implications. Overall verdict: "the results are impressive, though not always accurate …
all in all, pretty good i thought" — **the prompt-set replacement (loose end A5) is
ratified by this round.**

1. "sometimes 'logo' could be part of the artwork itself, or some sort of added branding" —
   and likewise "sticker": part of the artwork, or something added on top.
   *Implication:* provenance (belongs-to-artwork vs overlay) is NOT the mask's job and the
   concept words shouldn't imply it — SAM answers "where", the VLM's group-C questions
   answer "whose". Candidate refinement: provenance-neutral concept names.
2. "i did not count 'parental advisory' marks as 'stickers' but the model seemed to consider
   them as stickers." *Implication:* the model detects PA marks reliably (useful — they are a
   provenance-exclusion target) but the label word mismatches the reviewer's category; this
   explains most of sticker's 25% yes-rate. Candidate refinement: re-add "parental advisory"
   as its own concept (it was in the original §8.3 set) so the category is honest.
3. Faces fire on depicted faces — "a graffiti of a face", "a sculpted bust". *Implication:*
   for palette salience purposes this is often fine (a depicted face is salient content);
   for photographic-person reasoning it is noise. Note, not a defect.
4. "a chinese character was recognized as a word (not incorrect, just interesting)" — recall
   generalizes across scripts.
5. album-title masks sometimes ambiguous between title and artist name — "definitely some of
   the main text". *Implication:* the concept is really "main display text"; which role the
   text plays is the VLM's group-B question. Candidate refinement: rename accordingly.

Reviewer's synthesis: "maybe we need to adjust the exact vocabulary of our queries so we
more semantically align with what the model is good at and we'd get even better results."
Parked as a loose-end (concept-vocabulary refinement probe — cheap, ~10 min GPU) rather than
run now, per the freeze discipline.

6. On the overlay rendering (mask fill + bbox + locator ring): "the three-layer rendering
   was helpful in some cases, i just got confused the first time that's all." *Implication:*
   rendering stays as designed; add a one-line legend on the first item of a round.

## Calibration outcome (from mask-quality-analysis)

- **SCORE_THRESHOLD calibrated: 0.578** (single cut — concept groups did not separate;
  precision 91%, recall 69%, J 0.514). Population-weighted alternative 0.644 (J 0.373);
  the unweighted optimum is partly an artefact of even-quota sampling — both recorded.
- **All 3 hallucination-signature masks: rejected by the reviewer AND dropped by the cut** —
  no area-fraction guard needed at this threshold.
- Text concepts (words / letter / lettering / album-title): 100% yes-rates (letter and
  lettering underpowered, n=4 each). logo 60%, face 67%, person 69%, sticker 25% (see note 2).
