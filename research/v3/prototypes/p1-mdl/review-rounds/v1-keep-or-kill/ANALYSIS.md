# V1 keep-or-kill round — de-blinded read

Batch staged `b-20260811-9d47`, installed and released as `phase2-pair-019`. Read against the
pre-registered reading in `ROUND.md`, which governs; structured data in `verdicts.json`. The
**orchestrator** declares keep-or-kill — this file is the evidence reading only.

## 0. Decode verification — PASS

| check | result |
|---|---|
| items = our eight stems, same order | fixture = KEY = installed batch = `releasedItemIds`, 8/8; artwork sha256 agrees across all three |
| answer rows' variantIds ∈ fixture | 41 verdict rows; 0 unknown ids, 0 cross-item mismatches, 0 `A == B` |
| side arrangement via KEY | every row's `sideA`/`sideB` decodes to one arm each |
| side arrangement via the server's own record | `batches.jsonl` `items[n].blinding {A,B}` indexes `batch.items[n].sides`; the arm it yields agrees with the row on all 7 answered items (item 6 unanswered) |
| served palettes = staged palettes | byte-identical, 0 mismatches; round salt and server salt are distinct values, as designed |
| prefill rule | both equal-graded items carry `explicit`, all five differing-graded ones carry `prefilled` — matches the page rule stated in `ROUND.md` |

**Revision re-saves.** 41 rows over 7 items (item 7: 11, item 2: 8, item 5: 7, item 3: 6, item 8: 5,
item 4: 3, item 1: 1; item 6: 0). All but item 4 are pure free-text keystroke saves — grades and
preference byte-identical across every revision. **Item 4 is the one grade change:** `a acceptable /
a′ unacceptable` → `a strong / a′ unacceptable` → `a strong / a′ weak`, preference `a` throughout;
finals used, flagged `gradesStableAcrossRevisions: false`. Two row types v0 lacked: a `veto` on item 6
(scope `artwork`) and an `endorsed-sample` on item 5 — both treated as data below.

## 1. Per-item extraction (de-blinded; final revision)

| # | a | a′ | pref | source | confound | free text (verbatim) |
|---|---|---|---|---|---|---|
| 1 | **strong** | acceptable | a | prefilled | no | *(none)* |
| 2 | unacceptable | unacceptable | a | **explicit** | no | "no gradient\nthe background is yellow\nthe 4 colors (correct in side B) are red, black, yellow and white" |
| 3 | weak | unacceptable | a | prefilled | no | "the background is black\nat least one color must be pink (good pick on side B with the Compote pink)" |
| 4 | **strong** | weak | a | prefilled | no | *(none)* |
| 5 | weak | unacceptable | a | prefilled | no | "side A: surface should not be Ivory grey, there is no grey in that artwork\nside B: almost good, but missing the distinctive red color (could be a good pick for the accent for example)" |
| 6 | — | — | — | — | — | **VETO** (scope artwork): "this artwork is too ugly for me to be comfortable accepting anything, so keeping it would introduce bias" |
| 7 | weak | weak | a | **explicit** | no | "missing the main pink text in both of those palettes\nthe Zen grey is not a foreground or accent color. If we must include it in the palette, it must be either background or surface\nThe background of both of these palettes is a good pick, it represents this artwork, and could work as either background or surface" |
| 8 | weak | unacceptable | a | prefilled | no | "the background of this artwork is dark, neither candidate chose a dark background (the Umbra color could work)" |

Side labels inside the quotes are the reviewer's displayed a/b: item 2 side B = **arm a**; item 3 side
B = **arm a**; item 5 side A = **arm a′**, side B = **arm a**. Confound flags: **0 of 41 rows**.

**Endorsed sample, item 5**, built on arm **a**'s palette (`basedOnPaletteHash` = a's hash):
`background #feffff / surface #70ba25 / foreground #020202 / accent #fb0000` — *"this palette would
capture all the main colors of the artwork, and is a faithful representation of the vibe of the
artwork"*. Arm a published that green in **both ink roles** on a white field; the endorsement demotes it
to **surface**, blacks the foreground, and adds a red neither side published.

## 2. (a) Grade deltas vs v0, per arm, on the same covers

Scale `strong > acceptable > weak > unacceptable`. Item 6 has no v1 grade (veto) and is excluded from
both arms, so both are read over the **same seven** items.

| # | arm a: v0 → v1 | | arm a′: v0 → v1 | |
|---|---|---|---|---|
| 1 | acceptable → **strong** | improved | unacceptable → acceptable | improved |
| 2 | weak → unacceptable | **worse** | unacceptable → unacceptable | same |
| 3 | unacceptable → weak | improved | unacceptable → unacceptable | same |
| 4 | weak → **strong** | improved | unacceptable → weak | improved |
| 5 | unacceptable → weak | improved | weak → unacceptable | **worse** |
| 6 | unacceptable → *(vetoed)* | n/a | unacceptable → *(vetoed)* | n/a |
| 7 | weak → weak | same | unacceptable → weak | improved |
| 8 | weak → weak | same | weak → unacceptable | **worse** |

| arm | improved | same | worse | v1 over the 7 (strong/acc/weak/unacc) | v0 over the same 7 |
|---|---|---|---|---|---|
| a | **4** | 2 | 1 | **2** / 0 / 4 / 1 | 0 / 1 / 4 / 2 |
| a′ | 3 | 2 | **2** | **0** / 1 / 2 / 4 | 0 / 0 / 2 / 5 |

Read as a **direction over the eight** per `DESIGN` item 7, never as per-item arithmetic. **Arm a: the
zero-strong result is broken — two strong grades, the prototype's first, on a 4/2/1 direction. Arm a′,
the arm carrying the repair under test, is still zero-strong on a flat 3/2/2** (up on 1, 4, 7; down on
5, 8). Preference, de-blinded: **arm a 7 / 7**, a′ 0, none 0 — but only **2 explicit** (items 2 and 7,
both equal-graded) against **5 prefilled**, so per `ROUND.md` the five are the weaker signal; both
pressed ones landed on arm a, item 2's between two *unacceptable* grades.

## 3. (b) Kill-condition read (`DESIGN` § V1)

Recorded repair = (1) chromatic residual density for a′, (2) λ recalibration + a's collapse degeneracy,
(3) re-emission, (4) this round. `ROUND.md` (b) names the beyond-scope classes in advance: *"a
contrast/legibility term, a salience notion, a colour-family notion, a distinctness reward, a candidate filter"*.

| # | verbatim demand | classification |
|---|---|---|
| 2 | "no gradient" | **within** — λ direction (`DESIGN` 4/12: flat artwork must never buy a ramp). Granted, and it fired anyway *after* the recalibration. |
| 2 | "the background is yellow" / "the 4 colors (correct in side B) are red, black, yellow and white" | **BEYOND** — the four colours are called correct; the demand is a **role reassignment** (yellow ink → background). No granted item touches assignment. |
| 3 | "the background is black" | **BEYOND** — same class; arm a published `#000000` as **accent**. |
| 3 | "at least one color must be pink (good pick on side B with the Compote pink)" | **within** — `DESIGN` 11, the located cause. Note the form: a *hard inclusion constraint* ("must"), not a density preference. |
| 5 | "side A: surface should not be Ivory grey, there is no grey in that artwork" | **BEYOND** — a perceptual-presence gate on a published role (`#d9e2e1`): the **salience notion** *and* the **candidate filter**, two of the five pre-registered triggers. |
| 5 | "side B: almost good, but missing the distinctive red color (could be a good pick for the accent for example)" | **within** — `DESIGN` 11, on a cover that drew no such complaint in v0. |
| 7 | "missing the main pink text in both of those palettes" | **within** — `DESIGN` 11, on **both** arms. |
| 7 | "the Zen grey is not a foreground or accent color. If we must include it in the palette, it must be either background or surface" | **BEYOND** — role eligibility by colour character (neutrals are field-only): the **colour-family notion**, stated as a rule rather than a complaint. |
| 8 | "the background of this artwork is dark, neither candidate chose a dark background (the Umbra color could work)" | **BEYOND** — field-polarity fidelity + reassignment of a colour arm a **already published** (`#171c20`, its collapsed ink pair). |
| 5 | endorsed sample (§1) | **BEYOND** — a demonstrated target shape: four distinct roles, the ink demoted to surface, an unpublished colour promoted to accent. Identity coverage **and** assignment in one artefact. |
| 6 | "this artwork is too ugly for me to be comfortable accepting anything…" | **not a repair demand** — a corpus/instrument note. Excluded from the kill read; recorded as a lost item. |

**Five beyond-scope instances across four of the seven graded items (2, 3, 5, 7, 8), plus the endorsed
sample.** Three of the five pre-registered triggers appear verbatim (salience, colour-family, candidate
filter); only contrast/legibility does not. The dominant shape is **role assignment**: on items 2, 3, 7
and 8 the reviewer states the colours are right — *"correct in side B"*, *"good pick"*, *"the Umbra
color could work"* — and the **roles** wrong. Per `ROUND.md` (b) the kill fires **on the demand, not on
the grade**; this is not a prompt to implement the demand.

## 4. (c) Watch-classes

**Unreadable / indistinguishable inks — did NOT fire.** No readability or ink-distinguishability words
in the round; v0's *"accent and foreground are impossible to distinguish on top of the surface"* did
not recur, and item 1's a′ side (collapsed inks) rose unacceptable → **acceptable**. Of the five sides
under min-|APCA| 15, item 3's a accent (8.8) sits under *"good pick … with the Compote pink"* and item
4's a′ fg (12.6) under an *improved* grade; item 6's three are unread. Fold item 1 did not fire twice (cf. fold item 10); the untouched axis produced no kill data.

**Missing chromatic identity (`DESIGN` 11 — the repair under test) — the complaints did NOT stop.**
**5 of 7** graded items carry one (2, 3, 5, 7, 8) against **2 of 8** in v0. At the located causes: item
2 recurs on **both** sides; on item 3 the magenta is delivered by arm **a**, the arm **without** the
repair, while repaired a′ publishes near-white / dark-grey / black, no magenta at all, and stays
unacceptable. Items 5, 7, 8 are the same axis from new directions — the repair failed at its own located cause, and a′'s new complaint is against a colour it *added*.

**Salience / shadow (`DESIGN` 8) — one adjacent instance.** *"there is no grey in that artwork"* against
a′'s `#d9e2e1`: perceptual presence, not literal shadow sourcing. Per item 8 it feeds the paradigm verdict, not a term tweak; it is the same instance supplying the candidate-filter demand.

**Accent family (`DESIGN` 14) — the predicted cleanest instance was lost** with item 6's veto. What
remains: item 1's chromatic accents on near-white fields took the round's **two best grades**, and item
7 states the converse rule explicitly — a neutral is not an ink. Corroborative, not decisive.

**Banding / stops (`DESIGN` 12–13) — split, and under-represented as pre-registered.** Both ramps are
2-stop and both are arm a′. Item 1's (`#e9e6dd → #e0e4e5`) drew **no comment** and rose to acceptable;
item 2's (`#fafaf8 → #fcd000`) drew *"no gradient"* as its first line, unacceptable. λ = 1 still bought
a ramp on flat artwork — item 4's anchor confirmed live, on one of two. No interior stops exist here,
so item 13's v1 rule stays unchecked; the quiet side is not evidence.

**Margins (`DESIGN` 15) — the one flagged pair went quiet.** Item 1, a′, background/surface, 0.0177 =
1.09× its bar and also that side's two ramp endpoints, drew **neither** *"no visible gradient"* **nor**
*"banding"*, on the item with the round's best a′ grade — the gradient complaint landed on the *wide*
ramp instead. No epsilon-margin finding this round.

**F/A-swap-delta-zero (`DESIGN` 6) — role demands arrived, wider than the diagnostic.** Four
role-reassignment demands (items 2, 3, 7, 8) on sides whose F/A swap delta is `0` or `null`: the
objective is indifferent to the assignment being rejected, exactly the pre-registered shape. **But all
four are field ↔ ink demands**, not the foreground ↔ accent swap the diagnostic measures — the
instrument is narrower than the round's ask, and per `ROUND.md` (b) the kill condition governs.

## 5. Evidence reading (not a verdict)

On the pre-registered axis the round splits cleanly. **The grade delta is real and one-sided:** arm a
moved 4/2/1 and produced the prototype's first two **strong** grades, breaking the zero-strong result
that anchored the `MECHANISM-FALSIFIED` report; arm a′, which carries the granted repair, moved 3/2/2,
stayed **zero-strong**, lost all seven preferences, and on the very cover that located the repair
(item 3, the magenta) published no chromatic identity at all while the *unrepaired* arm delivered the
colour asked for. Read as a direction, the repair is not shown to work; what improved is the arm that
received λ recalibration and collapse-disentangling instead. **The kill condition is a separate axis
and is met on its own terms:** five beyond-scope demands across four of seven items, three of the five
pre-registered trigger classes named verbatim, and one demonstrated target palette — the dominant class
being one the mechanism has no notion of and, by its own diagnostic, is *indifferent to*. The reviewer
repeatedly certifies the extraction and rejects the assignment. Against
§ V1's *"if the iteration needs ANYTHING beyond this recorded repair, that fact itself is the kill
signal"*, that reads as satisfied independent of the grade movement — and the grade movement that did
occur belongs to the arm that is not the repair.

**Deviations.** (1) Item 6 has no verdict — vetoed on the artwork, so 7 items not 8, and `DESIGN` 14's
cleanest predicted instance is unread. (2) v0 records vetoes as *"not expressible in schema v3.0"*;
`veto` and `endorsed-sample` row types both exist here, so the server surface changed between rounds.
(3) Item 4's grades were revised in place; finals used. (4) `DESIGN` 16's v1 check (exact-triple share) is an emission read, not a verdict read, and is not done here.
