# Round 2 — the two verdict-mandated cases (from trunk `9983a1e`)

Continues `EXPERIMENT.md`. Same corpus custody: every artwork measurement below is from the shared
checkout `/Users/Flo/GitHub/palette/`, full resolution, `VIPS_CONCURRENCY=1`, at most two extraction
processes; the worktree's scrambled-only `images/` was never read.

Batch 28 integrated M1 (`TEXT_DEMOTION_EVIDENCE = "strongest-claim"`) and settled four questions.
Two came back **`strong` for the alternative only**, so both un-actioned cases are now
verdict-mandated:

| case | endorsed by batch-28 | trunk `9983a1e` publishes | rank of the endorsed |
|---|---|---|---|
| `0cd48f` | `#ffffff #ffffff #a7dbd9 #bdf369` | `#ffffff #ffffff #201f41 #b7f07d` | **18** / 1045 |
| `03e50500` | `#050a06 #21331b #b67e1f #496036` | `#050a06 #121e10 #cfd4c0 #758151` | **160** / 1500 |

**Nothing ships from round 2.** What ships is a behaviour-neutral rename: the bare literal `90` in
`foregroundUtility` becomes `FOREGROUND_CONTRAST_SCALE`, carrying the argument and the measured
ladder below. Runtime output is byte-identical to `9983a1e` — verified on the seven artworks this
arm has touched, including `krafty` and the newly-integrated `slim` and `0d5cdb`.

## R1. The finding: the foreground's contrast reference is accessibility-grade

    foregroundUtility = sqrt( 0.5*clamp(mean|Lc|/90) + 0.5*clamp(min|Lc|/90) )

feeding `foregroundPath` at weight **0.15** — the joint-largest in the winner objective. APCA's own
guidance puts Lc 90 at body text in the smallest sizes. Charter constraint 2 says the opposite in as
many words: *"APCA contrast is intentionally very low. This is not web accessibility; human review
has judged Lc ~ 9 outputs as good."* The charter forbids introducing an accessibility-level
**floor**; a ramp that keeps paying all the way to 90 is the same policy error written as a
**reward**, and it was never audited because it is not a floor.

The correction is not a new idea. `ACCENT_OBSERVABILITY_ADEQUATE_LC = 9` answers the same question
for the accent, and its own comment makes exactly this argument — *"the scale is wrong, not the
blend. Saturating instead means candidates that are all adequately visible tie on this axis, and the
decision falls through to the axes that should own it"* — with the value taken from where *"review
has repeatedly put the floor of 'clearly good'"*, stable across 6..12. It was applied to the
gradient accent only, and the reason recorded at the time was **blast radius, not correctness**.

Measured |Lc| on every foreground this arm has a verdict for (`probe-contrast.ts`):

| artwork | foreground | \|Lc\| | batch-28 |
|---|---|---|---|
| `0cd48f` | `#201f41` navy | **102.6** | rejected |
| `0cd48f` | `#a7dbd9` teal | **24.3** | **endorsed** |
| `0d5cdb` | `#f7de67` gold | 86.7 | **endorsed** |
| `0d5cdb` | `#c7c6c1` grey | 72.0 | rejected |
| `0d5cdb` | `#e4b144` gold | 64.6 | **endorsed** (item 2) |
| `0d5cdb` | `#92071a` dark red | **13.0** | not reviewed |
| `03e50500` | `#cfd4c0` | 77.5-78.9 | rejected |
| `03e50500` | `#b67e1f` gold | 34.5-39.2 | **endorsed** |

Every endorsed foreground sits at |Lc| >= 24.3 — 2.7x the reviewed adequacy point. The endorsed teal
is penalised 0.042 of weighted objective purely for not reaching an accessibility grade this library
disclaims.

## R2. And the scale is nevertheless **not** the lever

`configure.ts --fg-scale` sweeps it over the real pipeline (`data/cases-H-fg*.json`):

| scale | `0cd48f` published | `0d5cdb` published | `03e50500` published |
|---|---|---|---|
| **90 (trunk)** | navy (teal r18) | **`#f7de67` holds** | `#cfd4c0` (gold r160) |
| 75 (the flat accent's range) | navy (teal r18) | `#f7de67` holds | `#cfd4c0` (gold r164) |
| 40 | green `#71af70` (teal r4) | **grey `#c7c6c1` — REGRESSES** | `#cfd4c0` (gold r140) |
| 9 (reviewed adequacy) | green `#71af70` (teal **r1**) | **dark red `#92071a` — REGRESSES** | `#cfd4c0` (gold r171) |

Three things kill it, and the first is the one that matters:

1. **`0d5cdb`'s just-integrated gold *depends* on the ramp paying above adequacy.** `#f7de67` is at
   |Lc| 86.7 and the grey it beat is at 72.0; at any scale <= 72 they tie and the gold loses its own
   margin. The lever is **monotone-antagonistic to the outcome batch 28 just endorsed**.
2. **It never actually delivers `0cd48f`.** Even at scale 9, where the endorsed teal reaches rank 1
   of the full domain, the *published* winner is `#71af70 #9fdfe1` — a green foreground no review has
   seen. The teal is **source-eligible** (`probe-eligibility.ts`: 840 of 1045 candidates are, and it
   is one of them), so this is a frontier/precedence effect downstream of the ranking, not a lineage
   veto. I did not finish isolating which stage.
3. **It does nothing for `03e50500`**, whose gap is 0.067 of `qualityUtility` and only 0.026 of that
   is the contrast axis.

The values that *would* flip `0cd48f` are all <= ~24, i.e. chosen from the gap between the endorsed
teal (24.3) and the regression case (13.0). That is a fitted threshold and I did not ship one. 40
and 75 are not cheaper versions of the change — they are smaller numbers with no argument behind
them, and 40 already breaks `0d5cdb`.

## R3. A second defect found on the way: coverage pays twice for one hue

At scale 9, `0d5cdb` publishes `#000000 #000000 #92071a #f22632` — a **dark red foreground beside a
red accent, 1.0 degree of hue apart** (family-4694 at 23.5, family-6039 at 24.5). Its
`identityCoverage` is **0.7143** against the gold arrangement's 0.5714: the palette is paid twice for
showing "red".

`identityDirections` already refuses this for **authority** — both candidates carry the identical
`identityAuthorizedGain` 0.02286, so the second red adds nothing there — and its comment states the
rule in general terms: *"two colors of the same hue are one direction however differently they are
mixed, so a treatment cannot spend two roles on one hue and be credited twice for it (the reviewer's
`skap` note)."* **Ordinary coverage does not enforce it.** That is a stated-but-unenforced principle,
and it is the reason a scale change surfaced a nonsense palette rather than merely a worse one.

I did not implement it: it is a second mechanism with a large blast radius on an artwork set I had
no remaining budget to sweep, and on its own it does not close `0d5cdb` (the restatement refusal
moves `#92071a` by only ~0.007). It is the cleanest unclaimed lead in this arm.

## R4. `03e50500` — still not diagnosed to a lever

Rank 160. `identityCoverage` is **0.5714 for both** the endorsed gold arrangement and the incumbent,
so identity does not prefer it either — unlike `0cd48f`, where the endorsed side has perfect
coverage. The gap is 0.067 of `qualityUtility`, of which the contrast axis is 0.026.

**The strongest-claim machinery does not help here**, and the coordinator's question has a clean
answer: family-6837 carries this artwork's **lowest** foreground evidence (0.5505, against the
published `#cfd4c0`'s 0.8181), so the band name is emphatically *not* the artwork's strongest text
claim — it is the weakest. The remaining 0.041 is unattributed; I ran out of budget before
decomposing it.

## R5. Report-only: the slim vibe discriminator

**Asked:** what artwork-general signal separates "high-chroma text on a muted artwork breaks the
vibe" (`slim`) from "vivid text on a vivid artwork is the identity" (`krafty`, `0d5cdb`)?

**Answer: on the evidence available, no such signal exists in the chroma-coherence family.** It is
computable from the coverage machinery exactly as suspected — `probe-vibe.ts` reads it off
`buildArtworkGamut` — and it has **no valley**:

| artwork | foreground | verdict | C_fg | artwork mean C | chromatic share | C in fg's hue | adequacy | **overshoot** |
|---|---|---|---|---|---|---|---|---|
| `slim` | `#37c2eb` | **rejected** | 0.1274 | 0.0817 | 13.7 % | 0.0917 | 1.000 | **1.56** |
| `slim` | `#56676f` | endorsed | 0.0242 | 0.0817 | 13.7 % | 0.0823 | 0.294 | 0.30 |
| `krafty` | `#f7a223` | endorsed | 0.1603 | 0.1540 | 60.8 % | 0.1565 | 1.000 | 1.04 |
| `krafty` | `#eb0a8a` | rejected | 0.2489 | 0.1540 | 60.8 % | 0.1698 | 1.000 | 1.62 |
| `0d5cdb` | `#f7de67` | endorsed | 0.1407 | 0.1382 | 16.3 % | 0.1313 | 1.000 | 1.02 |
| `0d5cdb` | `#c7c6c1` | rejected | 0.0070 | 0.1382 | 16.3 % | 0.1309 | 0.053 | 0.05 |
| `0cd48f` | `#a7dbd9` | endorsed | 0.0536 | 0.1018 | 16.9 % | 0.0783 | 0.685 | 0.53 |
| `0cd48f` | `#201f41` | rejected | 0.0625 | 0.1018 | 16.9 % | 0.1142 | 0.547 | 0.61 |
| `03e50500` | `#b67e1f` | **endorsed** | 0.1240 | 0.0694 | 11.0 % | 0.1097 | 1.000 | **1.79** |
| `03e50500` | `#cfd4c0` | rejected | 0.0276 | 0.0694 | 11.0 % | 0.0700 | 0.394 | 0.40 |

**The pair that would define the signal falls on the wrong side of it.** `slim`'s rejected `#37c2eb`
overshoots its artwork's mean chroma by 1.56x on an artwork that is 13.7 % chromatic. `03e50500`'s
**endorsed** `#b67e1f` overshoots by **1.79x** on an artwork that is **11.0 %** chromatic — *more*
overshoot on a *less* chromatic artwork, and review endorsed it. Any monotone rule in
(overshoot, chromatic share) that rejects slim also rejects `03e50500`. `adequacy` fails the same
way: 1.000 appears on both sides three times.

**Mark evidence is a better signal and still fails.** On `slim` the two candidates separate sharply:
the endorsed `#56676f` is family-5490, an identity obligation with `requiredRole = "foreground"` and
`foregroundEvidence` **0.9341** — the artwork's strongest text claim, and the only *positive*
foreground classification anywhere in this table — with `identityCoverage` 0.9048; the rejected
`#37c2eb` is family-8092, **not an obligation**, ambiguous, 0.7261, `identityCoverage` **0.1905**.
`krafty` behaves identically (golden mango 0.9465, strongest). But it inverts on the other three:
review endorsed `0d5cdb`'s gold at 0.7111 **over** the grey at 0.8990, and `03e50500`'s gold at
0.5505 — the artwork's *weakest* claim — over `#cfd4c0` at 0.8181.

So across five reviewed pairs: chroma coherence is contradicted by `03e50500`, mark evidence is
contradicted three times, and no conjunction of the two is honest to fit on five points with three
features.

**My read: `slim` is not a "vibe" case at all — it is the one artwork in the set where the algorithm
had a positively-classified text family and moved off it.** That is a mark-evidence failure wearing
a chroma costume, and if it recurs the lever is the foreground's own identity coverage (0.1905), not
a chroma-coherence term.

## R6. Verification and honest self-assessment

| check | result |
|---|---|
| runtime diff vs `9983a1e` | one file, one bare literal replaced by a named constant of the same value |
| winners on the 7 artworks this arm has touched (`data/round2-spot.tsv`) | **byte-identical to trunk**, incl. `krafty`, `slim` `#37c2eb`, `0d5cdb` `#f7de67` |
| typecheck, architecture + configuration tests | pass |

**What I am confident in.** The |Lc| measurements and the ladder are direct reads of the real
pipeline; the finding that `0d5cdb`'s integrated gold depends on the ramp paying above adequacy is
arithmetic, not inference. The R5 negative is decisive on its own terms — one endorsed/rejected pair
straddles every threshold I could construct.

**What I am not.** I did not deliver either mandated case, and this is a failure to deliver, not a
proof of impossibility. Specifically: I never isolated *which* downstream stage publishes
`#71af70 #9fdfe1` on `0cd48f` when the endorsed teal is rank 1 and source-eligible. That is the
single most important open thread, because it means **ranking levers may not be sufficient for this
case at all**, which would reframe the assignment. I also left `03e50500` 0.041 unattributed. Both
are budget failures, not dead ends. I also did not run a 141-set sweep this round, because nothing
ships; the spot check covers only the seven artworks I have verdicts for.

**Where I would go next, in order:** (1) isolate the `0cd48f` publish-vs-rank divergence — it is one
probe and it decides whether ranking is even the right layer; (2) implement R3's coverage
restatement rule and sweep it, since it is fully argued and unclaimed; (3) only then revisit the
contrast scale, and only with a review-set foreground adequacy point, which is a review decision and
not an arm's.

## R7. Proposed review items

Round 2 changes no output, so these are **questions**, not A/B palettes to grade — except item 4,
which is a real pair I can build.

| # | question | why it needs review, not an arm |
|---|---|---|
| 1 | Is a foreground at APCA \|Lc\| **13** acceptable? (`0d5cdb` `#92071a`, dark red on black) | The whole contrast-scale lever turns on it. The charter says Lc ~ 9 is good, which would make 13 fine; if it is fine, saturating the foreground ramp at adequacy is correct and `0d5cdb` needs R3 instead. If it is not fine, the foreground's adequacy point is **above 13**, and review setting it is what unblocks `0cd48f`. |
| 2 | What is the foreground's adequacy \|Lc\|? | Every endorsed foreground measured sits at >= 24.3; the one problematic candidate at 13.0. The band between is empty, so a value exists — but picking one from that gap is a fitted threshold when an arm does it and a reviewed constant when review does. |
| 3 | Does the `skap` principle apply to ordinary identity coverage, not only to authority? | R3. The code states the rule in general terms and enforces it in one place only. A yes funds the implementation; a no closes a lead I would otherwise pursue. |
| 4 | `0d5cdb`: A `#000000 #000000 #f7de67 #f22632` (trunk) vs B `#000000 #000000 #92071a #f22632` | The concrete form of items 1 and 3 together. B is what the adequacy scale publishes. I expect B to lose badly; if it does not, my reading of the ladder is wrong. |
| 5 | Is `slim`'s `#37c2eb` better characterised as a **mark-evidence** failure than a "vibe" one? | R5. The reviewer's note said "aesthetically it's not exactly the vibe"; the data says the rejected colour is the one candidate in the set that is not an identity obligation, carrying `identityCoverage` 0.1905 against the endorsed 0.9048. Confirming the reframe points the next arm at identity coverage rather than at a chroma term that provably has no valley. |
