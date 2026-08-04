# P5 round 1 — first human look at the field-fit mechanism

**Proposed kind:** calibration (single palette on the mock, grade 1–4, veto, per-item `f` notes).
**Item count:** 8. **Source:** demo-20 run of `p5-fieldfit-0.1.0` (fresh run at staging time; run
file and fingerprint recorded in `items.json` beside this file).

## The question this round answers

Are palettes produced by the robust-field-fit mechanism acceptable — and do its *declared* failure
modes (no-field retreat, two-block rescue) produce acceptable palettes where they fire? Every item
is chosen to make one calibration question readable from its grade + note.

## Composition (8 items)

| # | cover | why it is in the round | what its grade informs |
|---|---|---|---|
| 1 | `0c4aab8aa7` | clean fitted gradient (near-white ramp) | mechanism core on its home ground |
| 2 | `eaed77a9cb` | explF 0.573, just above the field floor; was a retreat under the old detector, now a ramp | the noField threshold, from the "kept" side |
| 3 | `2376a6b67d` | two-block rescue, yellow/red block cover | the rescue path on its motivating case |
| 4 | `fc8d58e0af` | explF 0.472, rescue whose two blocks (`#545d58`/`#4b544f`) barely separate — suspected false positive | whether the rescue needs to demand more than bar-separation |
| 5 | `908479200b` | explF 0.100, declared retreat (photograph) | is a declared flat retreat acceptable on fieldless covers |
| 6 | `28279e9184` | explF 0.118, declared retreat, light palette | same, opposite lightness pole |
| 7 | `ca2eff2a4a` | order-0 flat black cover, fg `#ffffff` (an artwork pixel, no escape) | the trivial case is not being fumbled |
| 8 | *staging worker picks:* one of the 7 `I3.foreground-accent-not-separated` covers (d 0.027–0.054 < inherited 0.07444) not already listed above | whether sameColor-only fg/accent separation (the ruling) produces palettes the reviewer accepts |

## What we do differently per outcome

- **Retreats (5, 6) graded 3+ or veto**, notes pointing at the background choice → revisit the
  retreat's kept-fit-weights ruling with evidence; graded 1–2 → the declared-retreat posture stands.
- **Rescue false-positive (4) graded badly** with a note about indistinct surface → the rescue
  demands more than pairwise-bar separation (likely: apply the same explained-fraction test per
  block, or the min-distance collapse — which is already in the specs); graded well → leave it.
- **(2) graded well** → explF floor placement supported from the kept side; badly → floor moves up
  and (2) becomes a retreat.
- **(8) graded well / no accent note** → evidence FOR the sameColor-only ruling and against the
  inherited 0.07444; a veto or "accent invisible next to foreground" note → real evidence the
  fg/accent bar needs to be wider than sameColor, which is exactly the calibration question the
  reviewer said the formula owns.
- **(1, 7) graded badly** → core mechanism problem; MECHANISM-FALSIFIED territory if corroborated
  on a follow-up round, not a tuning ticket.

## Blinding

Payload and side-car carry palette + render data only — no prototype name, no arm labels, no
diagnostics, no explF values. The mapping from item to the table above stays in this file, which
never reaches the server.
