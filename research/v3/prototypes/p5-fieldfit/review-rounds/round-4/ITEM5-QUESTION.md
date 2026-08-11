# Item 5 — the light-field class returned ZERO qualifiers again. One nominee, for your ruling.

Written by W-STAGE4 during round-4 staging. **Slot 5 is empty in `items.json`** (7 items, not 8).
Nothing here was included in the payload. This file exists because the staging brief required the
near-miss to be surfaced for a ruling rather than shipped silently or dropped silently.

---

## 1. What the rule was, and that it was not relaxed

The rule, written into `rank.mjs` before any ranking was read, is round-3 §3.4's statistic with the
field terms as the brief fixes them — **unrelaxed**:

```
fieldMedianL >= 0.75  AND  fieldMedianC <= 0.06  AND  markLightShare >= 0.60
rank by markLightShare desc, tie-break fieldMedianL desc
```

**Pool: 1041 covers** — a census over shards `01/`, `02/`, `03/` taken whole, with the holdout, all
of coverage-set-1, and every cover any earlier P5 round drew excluded first (STAGING.md §3.0b).
That is 4.9× round 3's pool and it is drawn from *beyond* coverage-set-1, which is exactly what
ROUND.md row 5 asked staging to do.

**Survivors of all three terms: 0.**

Which term kills it, measured over the 1041:

| term | survivors |
|---|---|
| `fieldMedianL >= 0.75` | 182 |
| `fieldMedianC <= 0.06` | 699 |
| `markLightShare >= 0.60` | **6** |
| `fieldMedianL >= 0.75` ∧ `fieldMedianC <= 0.06` | 136 |
| **all three** | **0** |

- Highest `markLightShare` among the 136 light *and* neutral fields: **0.5636**.
- Highest `markLightShare` anywhere in the pool: **0.9211** — on covers that are not light fields.

This reproduces round 3's finding at 4.9× the sample and from a different part of the corpus. Round
3 measured a ceiling of 0.450 over 213; round 4 measures 0.5636 over 1041. The ceiling moved up but
did not reach 0.60. **The threshold was not bent, and the pool was widened as instructed.**

---

## 2. The nominee

`02/ab67616d00001e0200028475c3197f4510266bb9.jpg` — rank 1 of the 136 light-neutral fields, and the
only cover above the 0.50 disclosure floor the brief set.

| statistic | value | rule term | verdict |
|---|---|---|---|
| `fieldMedianL` | **1.0000** | ≥ 0.75 | passes, at the ceiling |
| `fieldMedianC` | **0.0000** | ≤ 0.06 | passes, at the floor |
| `markLightShare` | **0.5636** | ≥ 0.60 | **FAILS by 0.0364** |
| `markFrac` | 0.0537 | (round-3's ≥ 0.03) | would pass |
| `flatFrac` | 0.7825 | — | |
| `topBinShare` | 0.8157 | — | |
| `vividFrac` | 0.0000 | — | |

**The shortfall is 0.0364 on `markLightShare`, i.e. 6.1% short of the gate.** Round 3's shortfall was
0.150. Stated loudly: this cover **does not clear the stated rule**.

### What the artwork actually is (looked at after selection, before its palette was read)

A pure-white field with a small photograph pasted into the upper-middle third — a hazy harbour or
river under an overcast sky, a city skyline on the far bank, a white railing across the near
foreground — with a strip of translucent tape over the photo's top edge. Wide white margins all
round. No display type anywhere.

### The honest problem with the nominee, which is NOT a threshold problem

**This cover does not exhibit the class.** ROUND.md row 5 wants a *light field carrying light text*,
to test foreground legibility when the artwork's own ink is light. The nominee is a light field
carrying a **darker inset photograph**. That is precisely why `markLightShare` stops at 0.5636: the
marks against the white field are the photo, and the photo is mostly darker than the paper. Admitting
it does not answer ROUND.md's artwork-side question. **A reader told "round 4 tested light ink on a
light field" would be misled.** I will not smooth this over.

---

## 3. The reason the ruling is nevertheless live: the PALETTE lands in the bracket

The nominee was run through the dev loop (`p5-round4-fresh.txt` line 4, run
`p5-fieldfit-p5-round4-fresh-20260811T113044607Z.jsonl`, `p5-fieldfit-0.8.2`) so the ruling would not
need a later recompute. Its palette:

```
background #fafafa   surface #fafafa (COLLAPSED)   foreground #dcdcdc   accent #9a9f98
gradient: null      escape: null
```

`diagnose.ts`: `noField false`, `fieldExplainedFraction 0.828`, `residualScale 0`, `retreat false`,
and

```
foregroundLegibility: minRawApca 17.854, floor 15, ratio 1.19
```

**17.854 sits inside the (10.6, 28.9] legibility-floor bracket ROUND.md row 5 names as the thing
needing light-field evidence** — and it is the *only* cover in the whole round that does. The
published foreground is `#dcdcdc` on a `#fafafa` field: a near-white ink on near-white paper, chosen
over the `#9a9f98` and `#69746c` candidates that sat further down the same shortlist at raw APCA 52.1
and 73.5.

So the two halves of ROUND.md's question separate cleanly on this cover:

- **artwork-side** ("does the corpus contain light ink on light fields?") — **still unanswered**, at
  1041 covers as at 213. This may be a fact about album artwork rather than a sampling accident.
- **palette-side** ("does the legibility floor hold when the field is light?") — **answered, and
  answered badly**: the floor let a 1.19× ratio through and published near-invisible ink.

---

## 4. The three options, stated neutrally

1. **Leave slot 5 empty.** Round 4 ships 7 items. The rule is honoured exactly; the legibility floor
   goes untested for a second round; the class may simply not exist in this corpus.
2. **Admit the nominee as item 5, disclosed.** Round 4 ships 8. The reviewer grades a real
   near-invisible-foreground failure. STAGING.md and any write-up must then say the cover was a
   **stated 6.1% near-miss on `markLightShare`** and that it carries a light field with a *dark*
   inset, not light text — the grade is evidence about the legibility floor, **not** about light ink.
3. **Admit it as a different item, relabelled.** The cover is a genuine "light field / low-contrast
   foreground" specimen under a rule I would state honestly as `fieldMedianL ≥ 0.75 ∧ fieldMedianC ≤
   0.06`, ranked by `markLightShare`, with the third term dropped and *said to be dropped*. This
   ships the evidence without claiming the class was found.

I have no preference to record and did not act on one. Slot 5 is empty pending your word. If the
ruling is (2) or (3), the payload change is mechanical: one item appended to `items.json` and one
entry to `render-data.json`, colours already fixed by the run above, and the validation battery
re-run.

**Runners-up behind the nominee** (all also fail the third term), for completeness:

| rank | cover | `markLightShare` | `fieldMedianL` | `fieldMedianC` |
|---|---|---|---|---|
| 1 | `02/…10266bb9` | 0.5636 | 1.0000 | 0.0000 |
| 2 | `03/…7e860120` | 0.5510 | 0.7794 | 0.0000 |
| 3 | `02/…04d9b7c3` | 0.4863 | 0.8520 | 0.0176 |
| 4 | `02/…c369ae92` | 0.4828 | 0.8964 | 0.0287 |
| 5 | `01/…e7d3fbaa` | 0.4680 | 0.7533 | 0.0488 |
| 6 | `02/…d0a3be38` | 0.4555 | 0.7693 | 0.0054 |

Under the cross-class rule the nominee was withheld from classes 6–8, so admitting it cannot collide
with items 6, 7 or 8.
