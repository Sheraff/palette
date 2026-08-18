# Phase 2 graft inventory — pieces for the next attempt

**Written 2026-08-18 by the Phase 2 orchestrator at the reviewer's request.** The premise, per
the reviewer: none of the six prototypes is the base for what comes next; the value is the
pieces. This inventory lists what provided *genuine, evidenced leverage* — judge-validated where
possible, measured otherwise — plus the negative results that should constrain the next design.
Per-arm detail and provenance live in each prototype's `STATE.md`; falsification salvage in
P1/P4/P6's ANALYSIS / RULING / REOPENING files.

## Judge-proven pieces

| piece | from | evidence |
|---|---|---|
| Exact-pixel publication discipline | P3 | Zero "shade not in artwork" complaints across seven rounds while other arms drew them; made reviewer prescriptions deliverable. Held across 24 workers, audited twice. |
| Coherence-shaped eligibility (no population floors) | P3 | Median endorsed role colour has 8.9e-5 exact-pixel share — any mass floor excludes what the judge endorses. Replacement measured clean; the floor-blocked reviewer-named marks published and graded strong. Needs the spatial-extent semantic caveat (title text eligible, label logo not). |
| Tree of shapes as candidate generator (+ chromatic lanes) | P2 | Endorsed-colour reachability 91.9% / falsifier 1.7% (rival tree 57.4%, control 36.4%), reconfirmed exactly at close, 100% coverage. Lanes recovered 74 endorsed slots incl. isoluminant blindness. |
| Text-led foreground election | P2 | Text-led fg on 16/20; the reviewer prescribes ink/type colours constantly (black-ink, white-type verdicts across three arms). P3's white-type-on-photo failures are the confirming counter-evidence. |
| Guide-stop / excursion machinery | P2 (canon: PHASE_0 §2) | Zero owed guide stops on demo-20 + fresh-40 vs the 42% legacy midpoint-excursion figure; reviewer banding verdicts calibrated the misuse cost (2-stop preferred, tight/many stops lose). |
| Robust-fit field pair + absolute explained-fraction detector | P5 | bg/surface bit-identical across nine versions; detector cleanly split block covers (two-block rescue) from photographs (retreat), both paths judge-graded; the reworked absolute form replaced a provably-inert relative one. |
| Foreground = argmax min \|raw APCA\| over the rendered ramp | P5 (converged: P3) | unacceptable→strong on the motivating cover, generalized to fresh covers, independently adopted by P3. Caveat from the floor-demonstration verdict: the legibility floor stands; identity picks WITHIN it (artwork's true ink wins among floor-clearing candidates). |
| Exact joint search (branch-and-bound) | P6 salvage | Bit-identical to exhaustive enumeration at real scale (280M tuples costed, 5–249 visited). Free solver for any future joint objective. |
| Per-mass (not per-area) mark reading | P6 salvage | Moved readable ink rank 39 → 1; corroborated by salience-beats-mass verdicts (2%-sticker palette strong; mass-1505 rejected for named mass-306). |
| λ-priced structure selection (collapse / flat / ramp) | P1 salvage | At measured λ=0.1, produced sensible structure diversity and the fleet's best rendition stability (8/8 pairs). Use as the "how much structure does this artwork deserve" sub-decision only — never as the whole objective. |
| Excursion probes | P1 + P6 salvage | The only working measurements of the off-artwork-ramp pathology the guide-stop canon requires. |

## Negative results as design constraints

1. **No scalar currency judges like the reviewer.** Proven twice in one family (P1 at role
   level, P4 at selection level); P4's margin-independence (τ-b −0.342 — more bits of confidence,
   no more judge agreement) is the sharpest form. No single number gets authority over role
   assignment or palette choice.
2. **Role assignment is a separate judged competence from extraction.** P1's kill condition; the
   reviewer repeatedly certified colours while rejecting seats ("the Zen grey must be background
   or surface"); P3's swap arc needed three rounds and ground truth to converge.
3. **Optimizers sit on floors; the judge grades margins.** Barrier-hugging at 1e-4–3e-3 read as
   one colour; the measured bracket: ~1.5× silent, ~5.4× still complained-about. Margins must be
   priced — but hand-set margin rates are the repo's most-relapsed failure (P6's kill), so the
   pricing must derive from the verdict corpus or format-derived scales.
4. **Selectors die.** Fifth confirmation, strongest form (member-independent, zero-hand-constant
   selection still failed). Compose subsystems structurally (field subsystem + figure subsystem);
   do not elect between rival whole-palette answers.
5. **Population/mass floors block endorsed colours** (see eligibility row above); presence mass
   is evidence about *which role* a colour fills, never an eligibility cost (P6 inheritance note).

## The reframing worth taking seriously

The reviewer's 168 ground truth defines a **two-family palette structure**: a ground family (two
related field colours, gradient-capable) and a figure family (two related figure colours), with
family separation BETWEEN pairs and family sharing WITHIN pairs correct. Every prototype started
from four independent roles; the evidence suggests the natural decomposition is the two families.
P5's field pair already implements the ground half; P2's text-led election and P3's paired-accent
machinery gesture at the figure half.

## The spec that isn't code

The **reviewer-principle corpus** (assembled in `PROTOTYPE_RANKING.md` §Cross-arm assets, with
round provenance throughout the warehouse): readability including accent against both field
roles; margins not floors; identity coverage including foreground; salience gates eligibility and
beats mass, with spatial-extent semantics; two-family separation; guide-stop canon; both gradient
error directions live; served colour names are judged surface; one direct test-retest measurement
of reviewer stability (stable). Plus two reviewer-authored endorsed palettes (pair-019 item 5,
pair-023 item 7) and the flat-vs-gradient perception labels (field-gradient-labels-1) as ground
truth. This corpus is the closest thing the campaign has produced to an executable spec of what
the judge grades — the next attempt should be designed against it from day one.
