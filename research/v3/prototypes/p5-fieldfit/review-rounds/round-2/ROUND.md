# P5 round 2 — did the round-1 rulings land, and one criterion question

**Proposed kind:** calibration (single palette on the mock, grade 1–4, veto, per-item `f` notes).
**Item count:** 8. **Source:** fresh demo-20 run of `p5-fieldfit-0.3.0` for items 1–6; a small
2-cover run for items 7–8 (set file staged beside this document).

## The questions this round answers

(a) Do the three round-1 rulings (fg legibility on the field, accent standing apart from
everything published, accent contrast floor) produce palettes the reviewer accepts on the covers
they were derived from? (b) One criterion-level question the mechanism cannot answer alone: on a
block cover whose furthest-from-published colour is a dark olive, is "furthest" the right accent
rule, or did the reviewer's hedged "maybe white" mean lighter-and-cleaner beats further? (c) Do
the fixes generalize off demo-20?

## Composition (8 items)

| # | cover | round-1 grade | what its round-2 grade informs |
|---|---|---|---|
| 1 | `0c4aab8aa7` | UNACCEPTABLE ("fg barely registers") | fg = argmax min\|APCA\| over ramp; now `#000000` on the white ramp |
| 2 | `2376a6b67d` | ACCEPTABLE ("maybe white accent") | **the criterion question**: published accent is dark olive `#453907` (min-dist 0.354); the artwork's white `#fbfaff` (0.218) loses under min-dist-to-published. Grade + note here is the evidence that decides whether the criterion changes |
| 3 | `908479200b` | WEAK ("rich sunset reduced to 2 colours") | retreat richness via the general accent rule (now a rose `#9c6167`); any fg↔accent swap note reads as ordering evidence (campaign addendum: swap = ordering, not extraction) |
| 4 | `28279e9184` | UNACCEPTABLE ("pink writing could be a great accent") | the reviewer's named pink `#ff00a0` is published; direct verification |
| 5 | `16a8247378` | *(not in round 1; the two I4 rows)* | accent floor ruling: `#00000b`-on-black → visible brown `#594841` |
| 6 | `fc8d58e0af` | ACCEPTABLE ("brown or green accent probably exists") | named-prediction check under the new accent rule |
| 7 | *fresh: light-field gradient cover, non-demo-20* | — | fg-adequacy generalization (item 1's class, unseen cover) |
| 8 | *fresh: vivid-colour photograph, non-demo-20* | — | identity/richness generalization (retreat or fitted, whatever fires) |

Staging worker picks 7–8 from coverage-set-1 or gold-30 (never the holdout), states the selection
rule used, and records both ids + their diagnostics in STAGING.md — chosen by stated criteria
(field lightness / chroma census), not by output quality. Do not cherry-pick pretty palettes.

## What we do differently per outcome

- **(1), (4), (5) graded 1–2** → the corresponding rulings stand; **graded 3+/veto** → the ruling
  failed its own motivating case: back to mechanism, not tuning (fg: the min|APCA| target;
  accent: the floor conjunction).
- **(2) graded 1–2 with no accent note** → min-dist-to-published stands, hedged-white is resolved
  as satisfied-by-olive. **An accent note asking for white/lighter** → the criterion gains a
  lightness preference *as a ruling with reviewer provenance* (direction from the note, not a
  coefficient), and the change is measured on the full set before round 3.
- **(3) graded 1–2** → retreat posture (flat bg + mined vivid accent) is acceptable and the
  "reflect the artwork" complaint is closed; **still 3+** → the retreat needs more than one accent
  colour of richness — likely the E2 two-field reading pulled forward.
- **(6): brown/green appears and grades well** → named prediction confirmed twice; **absent** →
  record which colour won and why (min-dist trace) as input to the (2) criterion question.
- **(7), (8) grade at parity with their demo-20 analogues** → fixes generalize; **markedly
  worse** → demo-20 overfitting flag on the ruling cycle, round 3 draws from a wider set.

## Blinding

Payload and side-car: palette + render data only. No version labels, no diagnostics, no
mechanism names, no before/after framing — the reviewer sees 8 fresh calibration items. The
mapping to this table stays in this file, which never reaches the server.
