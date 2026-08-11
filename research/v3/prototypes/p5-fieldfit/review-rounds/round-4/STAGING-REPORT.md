# W-STAGE4 — round-4 staging report

**SEVEN items, not eight.** ROUND.md order, slot 5 empty:

```
ab67616d00001e020000269ead63cf2376a6b67d   ab67616d00001e02000022e7e9d11c908479200b
ab67616d0000b27300094a786a28459646be9b20   ab67616d00001e0200000ee5a62175fc8d58e0af
ab67616d0000b2730003079010cf188395a0f57b   ab67616d0000b27300012525e62c7f45baf46c90
ab67616d00001e02000227d883fd2cc65408f632
```

**Returning 1–4 verified — all three stated expectations MATCH**, no loud stop: item 1 fg `#000000`
/ accent `#f81107`; item 2 accent `#231f20`, fg held `#fed078`; item 4 accent `#9ba193`. Item 3 is
cream `#fae8d0` / type-blue `#01bdfd` / black, `retreat: true` — the ink veto, visible.

**Item 5: ZERO qualifiers over 1041 covers** (shards 01/02/03 whole; holdout, all of coverage-set-1
and every previously drawn cover excluded first). Ceiling `markLightShare` **0.5636** vs the 0.60
gate. Nothing relaxed. Slot empty; one disclosed 6.1% near-miss in `ITEM5-QUESTION.md` — its palette
publishes `#dcdcdc` on `#fafafa`, raw APCA **17.85**, the only cover in the round inside ROUND.md's
(10.6, 28.9] bracket.

**Fresh 6–8** (rules stated before ranking, `rank.mjs`):

| # | class · rule | pick · diagnostic |
|---|---|---|
| 6 | vivid illustration · photo gate INVERTED (`flatFrac≥.20 ∧ topBinShare≥.15`), rank `vividFrac` | 283/1040 → flat blue low-poly stag; **escape fired**, fg=accent `#000000`, both collapse flags true |
| 7 | two-component · round-3's rule verbatim | 48/1039 → NARCOSIS, split 0.625; **accent union ranked the dominant crimson 2nd and published the sky** |
| 8 | wildcard · most-ordinary cover, `Σ|pct−0.5|` over six statistics | 1038 → moonlit foliage; **foreground is a 6-mass speck** (the moon) |

**Validation: 28/28 PASS**, `parseCalibrationBatch` OK, round-trip byte-identical, leak scan clean.

**Loud:** (1) slot 5 empty, ruling needed; (2) ROUND.md's item-7 question names `a8942d6547`, **not
in this payload** — three vehicle options in §7, none chosen; (3) item 6's inverted gate drew a
6-bin near-solid, the mirror of round-3 §3.3 — row 6's outcome rule can't apply as written;
(4) item 7 is an unstaged second instance of question (b); (5) HEAD moved `c5552f8`→`899614d` (the
robustness harness committed; algorithm diff empty, fingerprint stays `c5552f8`); (6) my `rank.mjs`
had a taken-set bug, fixed, picks identical before and after.
