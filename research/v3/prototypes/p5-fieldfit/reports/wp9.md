# W-P9 — v0.5.1, the decoupled smooth gate

`p5-fieldfit-0.5.1`. `COMPONENT_CORE_FRACTION = 0.4` replaces `NO_FIELD_EXPLAINED_FRACTION` in the
component smooth gate only; the global `noField` trigger is untouched at 0.5. `Diagnostics.fieldComponents`
/ `.retreat` wired; `diagnose.ts` also prints an `attempts` table (sf/cf/gates per level).

Tests **47/47** (+1). `tsc --strict` clean in the prototype (two pre-existing `src/contract` errors).
Devloop `20 ok · 2247 ms` / `2 ok · 1589 ms`. Scorecard **zero violations both sets** (I3 20/20, 2/2).

## Blast radius: 2 of 22 changed

Diffed against `…223129403Z` / `…223131124Z` (confirmed byte-identical to the `2248…` pair).

| cover | newly qualifying component | v0.5.0 → v0.5.1 |
|---|---|---|
| `16a8247378` | **d1**, claim .138, core **.4202** | bg/su `#010000` flat → **`#606674`→`#897365` gradient**; ac `#493f3e`→`#3b3e4f` |
| `b948ee7f1b` | **d0**, claim .138, core **.4988** (was primary d1) | **`#d34503`→`#e76511`** → **`#f4942e`→`#f37c1e`**; fg/ac unchanged |

Neither is absurd: `16a8247378` is a stormy-prairie painting and slate→ochre is its sky; `b948ee7f1b`
publishes a lighter saffron off the same orange field. No texture region qualified.

**But the ruling's own mechanism did not fire.** `16a8247378`'s sky is **d0 at core .3966**, not .40 —
it still fails the gate the ruling set for it. The cover only moved because a *second, smaller*
component (.138 claim) crossed. Over all 22 covers the gate's next change downward is at **.3966**
(that sky, nothing else); upward at **.4202**. A gate of .39 admits the sky and changes nothing else
here — the ruling's intent, at a value its own evidence does not support. Round 3's call.

## Retreat, now separable

Only **`21256ce593`** retreats (`retreat: true`, 0 components, one .084 claim). `806cb6dd7d`
(`fieldComponents: 1`, d0 core .8988, flat `#000000`) and `908479200b` (3 components,
`#7a545f`→`#fd7b61`) were already components in v0.5.0 — the ambiguity the new field removes.
`16a8247378` is now `fieldComponents: 1`, `retreat: false`, `gradient: true`.
