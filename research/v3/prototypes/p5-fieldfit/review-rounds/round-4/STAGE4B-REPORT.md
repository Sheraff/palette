# W-STAGE4B — item 5 installed, round 4 is EIGHT items

**Item 5:** `ab67616d00001e0200028475c3197f4510266bb9` (`02/…10266bb9.jpg`), between `…fc8d58e0af`
and `…8395a0f57b`, per ROUND.md order.

**Palette, verbatim from a fresh run** (header `p5-fieldfit-0.8.2`; 4 cache hits, so identical to the
nominee run): bg `#fafafa` · surface `#fafafa` COLLAPSED · fg `#dcdcdc` · accent `#9a9f98` · gradient
and escape null. **Matches the ruling — no loud stop.** Diagnose re-confirms `minRawApca 17.854 /
floor 15 / ratio 1.19`, inside the (10.6, 28.9] bracket.

**Validation: 28/28 PASS over 8 items**; `parseCalibrationBatch` OK, round-trip byte-identical, leak
scan clean. The other seven items and render entries are byte-identical after rebuild. `c5552f8` /
`dirty false` re-verified — algorithm diff to HEAD empty, tree clean.

**Loud:** the ruling says 1,254 censused; every measured artefact says 1041 (STAGING.md §9, recorded
not resolved). The 6.1% shortfall and the "does not exhibit the class" disclosure are quoted verbatim
in §9.3: item 5 is evidence about the legibility floor, **not** about light ink.

**Files:** `items.json`, `render-data.json`, `build-payload.ts`, `check.ts`, `STAGING.md` §9, this
report; a comment on `data/devloop/sets/p5-round4-fresh.txt` (path already present, not duplicated;
`--verify` passes); run file `…p5-round4-fresh-20260811T114248560Z.jsonl`. Nothing committed.
