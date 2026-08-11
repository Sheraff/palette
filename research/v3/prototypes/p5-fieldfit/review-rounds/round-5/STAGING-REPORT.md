# P5 round 5 — staging report (W-STAGE5)

**8 itemIds**, ROUND.md order: `…45baf46c90`, `…a8942d6547`, `…9646be9b20`, `…b4cd95b2`,
`…70c3f5a6`, `…7e5e017c`, `…43b718cb`, `…5760ac35` (full 40-hex stems in `items.json`).

**Returning 1–3: MATCH, no loud stop.** Fresh runs, all rows `p5-fieldfit-0.9.2`, palettes verbatim.
Accents `#8d2639` / `#009cff` / `#7f7ca7` as predicted; item 2 is byte-identical to round 3's STRONG.
Asserted in `build-payload.ts` (throws) and re-asserted in `check.ts`.

**Fresh 4–8** (pool: round-4's 1075-file shard census, exclusions extended by `p5-round4-fresh`;
1037 censused; rules in `rank.mjs` before any ranking):

| # | class / rule | pick | one line |
|---|---|---|---|
| 4 | vivid illustration, inverted gate (miss risk disclosed) | `b4cd95b2` | **third miss** — solid green + corner sticker; palette drawn entirely from the sticker |
| 5 | two-component, round-3 rule verbatim | `70c3f5a6` | farmland photo (3rd photographic draw); fg APCA **15.71**, ratio 1.047; the green never lands |
| 6 | gradient-rich, high-chroma plane | `7e5e017c` | blue studio porthole — the round's one clean draw; accent shortlist **empty**, accent collapsed |
| 7 | wildcard A, ordinariness (round-4 rule) | `43b718cb` | karaoke cover; two-block fallback; mass picked a teal at 1.083× floor over a yellow at 62.9 APCA |
| 8 | wildcard B, diversity (max-min z-distance from 20 served) | `5760ac35` | near-black shrouded figure; `markLightShare 0.9211`; fg×accent margin **1.504×** bar |

**Name check (§names):** 7 flags. Highest — `#fae8d0` "**Sushi Rice**" ×2 on item 3, the known
grade-costing name, same cover; `#120032` and `#0f002a` both "**Narwhal Grey**" on item 2 (one name,
two hexes, and neither is grey — a confound for the silence test); `#8d2639` "Caponata" carries no
colour word on the item where the named ask is being delivered. Also "Ghost" on a mid blue,
"Inkwell" on a royal blue, "Belly Flop" ×2, "Iron"/"Iron Grey" near-collision. One cross-item repeat:
"Snow" (items 2, 4, same hex, benign). No hex changed.

**Validation: 29/29 PASS**, including `parseCalibrationBatch` dry run byte-identical and a clean leak
scan over 42 hexes / 38 name words with the four added tokens.

Nothing committed, nothing pushed. New caveats **U–Y** in STAGING.md §7 need an installer read.
