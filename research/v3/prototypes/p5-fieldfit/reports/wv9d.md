# W-V9d — the coherence gate ships. 3 of 31 move, exactly the three wv9c measured.

`ALGORITHM_VERSION = "p5-fieldfit-0.9.2"`. `COHERENCE_GATE_BAR_MULTIPLE = 8` `[UNCALIBRATED]`,
env-gating removed. Provenance quotes the bracket — crimson **.712** must-pass, `#39367d` **.274** /
`#7f7ca7` **.250** must-fail, window `[5, 10]`, 8 strictly interior — and states that 8 here and 8 in
`ACCENT_FG_EXCLUSION_MULTIPLE` are numeric coincidence, not reuse.

## Delta vs v0.9.0 — `measurements/v9d-delta.json`, 3/31, all accent

| cover | accent | note |
|---|---|---|
| `a8942d6547` | `#39367d`→**`#009cff`** | R3 silent STRONG **restored**, byte-identical to v0.8.2 |
| `16a8247378` | `#746045`→**`#736e6a`** | v0.8.x's answer; the R3 *"hard to see"* note returns with it |
| `21256ce593` | `#070be9`→**`#081bfb`** | unreviewed |

NARCOSIS and all round-4 silent STRONGs byte-identical (devloop diff: R4 **0**, R2 **0**, R3 **1**,
demo-20 **2** — the same three).

`9646be9b20`'s pin stands: withheld (.250, coverage 3→2) yet accent unmoved — not a pool gate. The
test says R4's ask is open pending a pool-gate ruling.

## Tests, runs

**121/121**, nothing relaxed. Recomputed: `2376a6b67d` covered `[1,3,4]`→`[1,2,3]` (its olive — the
colour R2 rejected by name — is withheld); synthetic patch .39 not .06 at 8×. New: gate-fires
end-to-end, both anchor tests re-pinned at the shipped radius. Devloop ×4, scorecard ×4: **0 fail, 0
refused**.

**Owed, not owned:** `v9c-gate-sweep.ts` has 2 dangling imports (the removed flag pair); `v9d-delta.ts`
supersedes it.
