# Phase 3 proposals — adversarial review on EVIDENCE

**Written 2026-08-29.** Scope: claims about what a prototype did or measured, or what the reviewer
said; re-entry into falsified shapes under new names; per-artwork notes read as general rules;
thresholds presented as structure. Every finding below was checked against the cited source or the
prototype's own code/reports. Defects only — no praise sections. Sources checked: `GRAFT_INVENTORY.md`,
`PROTOTYPE_RANKING.md`, `PHASE_2_HANDOFF.md`, the three surviving arms' `STATE.md`, `p1-mdl/STATE.md`,
`p4-portfolio/RULING.md`, `p6-figureground/reports/REOPENING_ANALYSIS.md`, `PRIOR_ART_CHECK.md`, the
field guide, `PHASE_0_DECISIONS.md`, `research/v3/src/contract/`, `research/v3/src/robustness/`, the
P2/P3/P5/P6 prototype trees, and the 61 distinct `phase2-*` warehouse judgements.

**Corpus arithmetic used as ground truth below.** The 206 `phase2-*` rows are autosave snapshots;
they deduplicate to **61 distinct verdicts + 2 endorsed-samples + 1 veto**. Of the 61, **39 carry a
comment and 22 do not** (19 of the 22 carry a `strong` on at least one side). 40 absolute + 21
pairwise verdicts = **82 palettes**. **18** noted verdicts carry an `unacceptable` on some side.

**Direction conventions (the brief's known defect).** P3's 16.0%/18.2% are *disagreement* (agreement
81.8–84%, as P5's own STATE quotes it); P3's accent "68–70%" is *agreement*. P5's 39.0%/40.8% are
*agreement* (~61% disagreement). P2's 9.0% overall is *agreement*; P2's dither **15.0% is a move
rate** ("15.0% moved vs the 10% line", `PROTOTYPE_RANKING.md` §2), not an agreement figure.

---

## field-and-marks

1. **§2 Terms (line 31) — uses a constant the contract forbids for this purpose.** It defines "Bar =
   `POOLED_SAME_COLOR_BAR` (0.01535), the contract's ruler for 'a human calls these one colour'" and
   then builds every per-pair judgement on it: claim radius = 4 bars (L47), `FAMILY_RADIUS` = 2 bars
   (L119), DP ε = 2.5 bars (L102), the surface rule (L156). `src/contract/constants.ts:250-255` says
   the pooled bar "exists for the one legitimate use of a scalar here: corpus metrics and dashboards
   … Any *per-pair* judgement uses `sameColorBar()` instead." Using it as the family radius also
   erases the dark-neutral region (0.00932, `PHASE_0_DECISIONS.md` §3) — the site of the four recorded
   near-black strikes the proposal itself inherits "whole" at L258-259.
2. **L107-108 — misquotes P3's 4-stop record.** "P3 recorded gradient *unacceptable* on all four of
   its 4-stop covers." Source: `p3-fields/src/constants.ts:297-306` and
   `review-rounds/round-3-gradient-pairwise/VERDICTS.md:14` — *banding was named* on all four 4-stop
   covers and none of the four 2-stop covers; one cover (r2-item-0) was held at unacceptable. The
   cap-3 rule is correct; its stated evidence is not.
3. **L110 — misattributes the owed-stop census.** "P2's and P3's guide-stop canon (owed-stop census
   zero on demo-20 + fresh-40)". That census is P2's alone (`p2-tree/STATE.md` §3; `GRAFT_INVENTORY`
   row 5). P3 contributed the spacing constant, not the census.
4. **L141-143 — grafts an instrument its source measured degenerate, without saying so.** `ink(F)`
   is built on P5's erosion mortality. `p5-fieldfit/STATE.md` §3: "erosion-mortality ink measurement
   is provably degenerate on bar-neighbourhood clusters (**1.0000 on 60/60**)". Family aggregation may
   be the fix, but the negative result is neither cited nor answered anywhere in the proposal.
5. **§5 / L272 — a held constant presented as measured.** "`middleBandMass` < 1/6 | P5 measured
   bracket (0.0446 / 0.2982)". `p5-fieldfit/src/ramp.ts:195` marks
   `CONTINUOUS_MIDDLE_BAND_MASS = 1/6` `[UNCALIBRATED]`, "half the uniform expectation"; 0.0446 and
   0.2982 are two single-cover sanity anchors, not the constant's derivation.
6. **L332-333 — the falsifier's second reference point is direction-inverted.** "If it is not below
   ~25% (against P5's 46.2% and P3's 68–70%)". P5's 46.2% is accent *instability*; P3's 68–70% is the
   accent's *agreement* (`p3-fields/STATE.md` §3), i.e. ~30% instability. The comparison makes P3
   look like the worse arm on the exact axis it leads, and makes the 25% bar look easier than it is.
7. **L311 — timing mis-cited.** "P2's whole-image build is 685 ms median." 685 ms is the *median of
   `candidate.paletteOf` end to end* (`p2-tree/tos/integration-NOTES.md:270`, mean 627); the 3-lane
   parse is 617 ms (`:268`). Conservative direction, still wrong.
8. **Minor structural.** The "distinctness guaranteed by construction" claim (L120-122) is a property
   of single-linkage over *shape medoids*; the published colour is the stratum's *claim medoid*
   (L150), a different statistic, so the guarantee does not transfer verbatim to the published pair.
9. Verified accurate and worth recording: the `p3/src/coherence.ts` quote, `COMPONENT_CORE_FRACTION`
   as `[UNCALIBRATED]`/single-cover-anchored, the ink-veto "two hard thresholds in conjunction"
   (`COMPONENT_INK_MORTALITY 0.85`, `…GROUND_ADJACENCY_MAX 0.10`), P2's accent-churn 48% /
   background 13%, and every warehouse quotation.

## joint-search

1. **L5-7 — the corpus split is wrong, and §6's percentages are computed on it.** "deduplicate to 61
   distinct judgements, **40 noted** (17 of the **21** unnoted are strong)". Measured: 61 distinct
   verdicts, **39 noted / 22 unnoted**, 19 of the 22 carrying a strong. The 61 is exactly right; the
   denominator every class share in §6 is divided by is not.
2. **L124-126 — the ladder's ordering rests on a false count.** "background is the most-cited defect
   at 28%, and **all 12 `unacceptable` notes cite a wrong background or an unreadable foreground**."
   There are **18** noted verdicts carrying an unacceptable, and at least five cite neither: cal-022
   *"there aren't 2 shades of yellow on that artwork"*; cal-025 *"accent almost indistinguishable from
   background"*; cal-025 *"neither Firebrick … nor Eggshell … only present in the very small label
   logo"*; cal-017 *"all colors are incorrect. Maybe surface works"*; pair-023 *"side A: no
   green-to-brown in this artwork"*. "Structural correctness outranks margins, **because the reviewer
   puts it there**" (L122-123) is the design's largest hand-authored object and this is its evidence.
3. **L87-93 — a per-artwork note turned into a non-relaxable seat law.** Predicate **P** makes ground
   populations ineligible for the ink seats, sourced to pair-019's *"the Zen grey is not a foreground
   or accent color… it must be either background or surface"*. That is one grey on one cover; the same
   corpus contains reviewer-`strong` palettes whose figure roles are large low-chroma colours
   (cal-026 `bg#171717 sf#10100e fg#585858 ac#3a3a3a`; cal-026 `bg#3430c5 sf#04040e fg#0075cd
   ac#0075cd`). P is only dropped at **B5**, three bundles down the ladder — unlike tree-first's T1,
   which is explicitly a preference.
4. **L333-334 — falsifier 4 cannot fire (the brief's convention trap).** "If ±1-LSB dither moves
   palettes at a rate no better than P5's 39% overall". P5's 39.0% is its *agreement* figure
   (`p5-fieldfit/STATE.md`, cross-checked by "vs P3's 81.8%"); P5's move rate is ~61%. As written the
   design passes at a 39% move rate — materially *worse* than P5 — so the falsifier is inert.
5. **§5 undercounts by omitting inherited `[UNCALIBRATED]` constants.** Step 1 (L36-38) keeps "the
   component ink veto" whole; its two constants `COMPONENT_INK_MORTALITY = 0.85` and
   `COMPONENT_INK_GROUND_ADJACENCY_MAX = 0.10` are `[UNCALIBRATED]` with three- and two-cover brackets
   in `p5-fieldfit/src/components.ts:368-385`, and `COMPONENT_CORE_FRACTION = 0.39` is `[UNCALIBRATED]`
   single-cover-anchored (`src/fieldfit.ts:183-211`). None appears in the "roughly 12 tunable sites"
   table.
6. **L40-41 — citation slip.** "bg/surface bit-identical across nine P5 versions, field path bit-stable
   … (**P5 STATE.md §3**)". §3 carries only the ≤1.06× amplification; the nine-versions claim is
   `GRAFT_INVENTORY` row 6.
7. **L74, L305 — cites a batch id absent from the warehouse.** `phase2-cal-013` is not among the
   `phase2-*` rows (cal-017/020/022/025/026, pair-018/019/023/024). The claim it supports ("zero false
   gradients across six published ramps") is in `p5-fieldfit/STATE.md` §2 and is sound; the batch
   pointer is not checkable in the warehouse the brief names as the verdict source.
8. **Structural, self-flagged.** Step 5 × step 7 is a total order over complete tuples: bundle ladder
   crossed with dyadic margin rungs, then leximin over two profiles. The rungs derive from the
   contract ruler, but the ladder order is declared **HELD** and is a fixed exchange between structural
   satisfaction and margin — the shape `GRAFT_INVENTORY` constraint 3 calls "the repo's most-relapsed
   failure". Falsifier 3 (rung base ×½/×2, >25% moved) is the correct pre-registration and is stated.
9. **L94-97 (minor).** P-fg makes text-led foreground a hard boolean on 16/20 evidence; the brief §4
   uses the same white-typography note as its example of a per-artwork fact. Mitigated by B4.

## ranks-new-substrate

1. **§S6 / §5 row 9 — the spacing floor is set at the value the evidence calls the defect.**
   "~3% ramp-spacing floor (banding provenance, two rounds; `GRAFT_INVENTORY` learning 6)". Learning 6
   says "tight spacing (**~3%**) *reads as banding*". `p3-fields/src/constants.ts:297-306`: r2-item-0
   was held at unacceptable for seven drafts on *"very significant banding (purple at 71.9%, green at
   74.7%)"* — a **3.125%** gap — and P3's evidence-derived cut is `MIN_GUIDE_STOP_SPACING = 0.125`
   `[MEASURED]`, four times larger. The proposal adopts the banding gap as the permitted minimum.
2. **§2.0 vs §S8 — the design contradicts the discipline it says it keeps verbatim, and admits a
   candidacy wall.** §2.0 restates the kept line as "No candidate colour set, no clustering, no data
   structure indexed by colour … ever". §S8 then forms "**K = 8 candidates**", and §6 concedes "K = 8
   windows may not span a four-family artwork" — a structural-completeness (goal 3) wall introduced by
   the design, not counted as a departure. Compare `PRIOR_ART_CHECK.md` §P3, which defines P3's
   novelty as "no candidate object of cardinality ≠ N anywhere".
3. **§S5 — "every pixel reachable for every role" is not true of the field seats.** L62-63 claims
   "with no candidate set every pixel is reachable for every role at all times" and §3.5 repeats it.
   But `Γ = E·w·g` and the ground band is its **top τ = 0.25 quantile**; background and surface can
   only be drawn from that quartile. It is not a *mass* floor, but it is an eligibility gate on the
   two seats the reviewer treats as blocking.
4. **Composite fields presented as threshold-free.** §3.1 claims "the whole pipeline thresholds
   exactly one derived number (ρ*)". `Γ(p) = E(p)·w(p)·g(p)` (S5) and `ink(p) = w(p)·M(p)·‖c_p − B_6‖`
   (S7) each multiply heterogeneous quantities — two unitless agreements and an OKLab distance — with
   an unstated equal weighting. A product is a weighted sum in log space; these are exchange rates
   without coefficients written down, one level below the palette. Not fatal, but not "no scalar".
5. **L128, cal-013 citation** — same non-existent-in-warehouse batch id as joint-search.
6. **L58-63 — rejects the tree on the topline rather than on P2's own attribution.** "the tree is built
   from level-set thresholds and its depth-at-a-pixel is an integer that changes discontinuously … and
   P2 measured the consequence (dither 15.0%)". P2's attribution assigns the churn elsewhere:
   `a-node-set` (the tree's own set changing) is **26%** of failures against `c-winner` **82%**
   (`tos/stability/q1-dither/REPORT.md:25-27`), and the report's stated conclusion is that the
   instability "is downstream, in the role stage". The argument may still hold; the cited figure is
   the one that does not support it.
7. **§S2 (minor) — recalibrates a `[REVIEWED]` ruler while saying it does not.** Bilinear interpolation
   of the four regional bars across the L 0.55 / C 0.05 boundaries produces bar values that were never
   calibrated; "The frozen values are untouched" is true of the four numbers and false of the ruler.
8. Verified accurate: the four bar values against `PHASE_0_DECISIONS.md:168`, the −0.212 / 16-of-16 /
   43-of-54 figures, the 539-file shard-verified field-drift instrument
   (`measurements/substrate/SUBSTRATE_2_RULING.md:39`), the round-5 "6 of 9 notes" and the CONVERGE
   quote, and the correct reading of P3's ~16% as disagreement in §8.

## robustness-first

1. **L228-229 — reasons from a finding the reviewer withdrew.** Lists as a removed cause
   "ASCII/lexicographic tie-breaks on content-derived ids (**55.85%** of v2-3's corpus moved on a pure
   relabel)". The figure is real (field guide:483), but `PHASE_2_HANDOFF.md` §5 records the reviewer's
   ruling that "**the relabeling result was a bug, not a finding**", with the instruction not to reason
   about that arm. Removing a cause that the judge has ruled does not exist is unearned credit.
2. **L18 — one direction call is wrong inside an otherwise correct direction note.** "P2's and P5's are
   **agreement** (P2 9.0% overall / **15.0% dither**)". `PROTOTYPE_RANKING.md` §2 states P2's dither as
   "**15.0% moved** vs the 10% line", and P2's own trajectory 34→33→23→20→15 only reads as improvement
   as a move rate. The rest of the note (P3 disagreement, P5 agreement, the 81.8% cross-check) is
   correct and is the most careful direction handling of the six.
3. **L269-271 — count not supported by the rows.** "5 of 7 complaints named the *stop colours* rather
   than flatness". Of the six gradient complaints in the phase2 rows, three name colour pairs ("no
   beige to dark", "no green-to-brown", "no blue-to-brown") and three name existence/flatness ("very
   clearly all flat", "no gradient", "should be a gradient"). Sourcing note: the cited
   `criterion/both-readings-defensible` record is an **agent**-authored tagging note derived from a
   human note of 2026-08-03 about the oracle question set; the quotation *is* the reviewer's (record
   `n-msdbbesh-9f87f1b3`), but the tag cited belongs to the derived agent record and neither is a
   phase-2 verdict.
4. **L112-113 — the salvaged statistic is mis-described and mis-cited.** "salience = mark-mass share ÷
   area share … production's single load-bearing foreground signal (`PRIOR_ART_CHECK.md` **§B2.4**)".
   There is no §B2.4; the source is "Coverage holes" item 4, and the production statistic is
   **saliency**-mass share **minus** area share over an Itti–Koch saliency field
   (`extractColors.ts:172-205`) — a different field and a different operator. "*no Phase 1 or Phase 2
   proposal computed it*" also extends a statement PRIOR_ART_CHECK makes about the fourteen Phase-1
   proposals only.
5. **L131-132 — wrong section.** The APCA zero-clamp phantom-flip warning is field guide **§6**, not
   §7.
6. **§2 S7 level 4 + §5 — a threshold presented as structure.** Level 4 is sold as
   "**mode-connectivity**, not a margin constant" and §3 repeats "without a hand-set margin rate". §5
   then lists "ramp density-dip fraction (D4, **level 4**) | reviewer round; **bracketed by the margins
   evidence** (1.5× silent, 5.4× still complained-about)". The test needs a dip fraction, that fraction
   is anchored to the margins bracket, and it decides the near-twin class. It is a margin threshold in
   a different coordinate.
7. **§5 constant count.** "Eight constants" counts rows, several of which are families: the spatial
   ladder is three (min/max/ratio), the deadbands are four (D1/D2/D5/D6), `h_c` carries a multiple.
   The honest count is ~14; the comparison against "v2-3's ~908 tunable sites" is between differently
   counted quantities.
8. **§7 cost is not reconciled with its own work count.** ~35 linear passes plus a 64³ lattice is
   priced at 0.10–0.20 s / 2.5–4.5 s, i.e. *faster* than P5 (0.35 s / 4.2 s) while doing strictly more
   than P5's fit. Four of the other five proposals discount their estimates against the reviewer's
   standing note that all six understate difficulty; this one does not.
9. Verified accurate and load-bearing: "fields own borders; marks float" (field guide:279, §5), the
   ~908 sites / 11 human-anchored values (field guide:507, §8), the 13-of-15 repair relocation
   (field guide:499 and `PHASE_0_DECISIONS.md:228`), the 148-to-fix-14 collateral, the 2/98 endpoint
   argument against the guide's own −5.8% re-aim result, `pair-set.ts` "two encodings, two sizes",
   `compare.ts` regional-bar default, and the cal-017→cal-022 swap datum (same four colours,
   `acceptable` with blue as foreground, `weak` with blue as accent) — the cleanest role-assignment
   evidence in the corpus, correctly read.

## tree-first

1. **§5 / §2.9 — the same banding inversion as ranks-new-substrate.** "stop spacing floor | **~3% of
   ramp** | reviewer round — tight spacing reads as banding". 3.125% is the measured banding gap that
   held r2-item-0 at unacceptable for seven drafts; P3's cut is 0.125 `[MEASURED]`
   (`p3-fields/src/constants.ts:297-306`). Setting the floor at 3% licenses the defect.
2. **L304-305 — declines a cost mitigation on a diagnosis Phase 2 falsified.** "the repo's known
   instability source (v2's 0.04 grid moved **114/114** palettes under dither)". The 114/114 is the
   previous *system's* dither result (`src/robustness/README.md:104`); attributing it to the 0.04 grid
   is P6's founding diagnosis, and P6's own falsifier measured it false —
   "*the instability was never in the quantisation stage; the diagnosis was mistaken*"
   (`REOPENING_ANALYSIS.md:74`, both falsifiers fired).
3. **L228 — mixed conventions in one comparison.** "the least stable role in every arm (**P3 68–70%**,
   P5 46.2%, P2 65.8%)". P5's 46.2% and P2's 65.8% (`tos/roles/NOTES.md:140`) are change rates; P3's
   68–70% is the accent's agreement (`p3-fields/STATE.md` §3). Two instabilities and one stability
   presented as one series.
4. **§6 internal contradiction.** "(a) Wrong field colour … (**11 notes; dominant** and *blocking*)"
   against "(c) Unreadable or wrongly-sourced foreground (**14 notes, the largest class**)". Both
   cannot hold; the design's strongest structural claim is staked on (a) being dominant.
5. **§2.10 T3 — the one place it approaches the falsified shape.** The non-compensatory sequence is led
   by "the **integer count** of distinct pigments the four published colours represent", maximised over
   Σ. That is a single number with authority over the complete palette — the shape
   `GRAFT_INVENTORY` constraint 1 states as "no single number gets authority over role assignment or
   palette choice" (P1 at role level, P4 at selection level). The defence offered (an integer has wide
   plateaus, L152) is a *robustness* argument, not an answer to the pricing argument. It has no
   exchange rate, which is the meaningful difference; it should be said out loud.
6. **§2.3 — removes a mass floor and installs a ruler-shaped eligibility gate, untested by the one
   instrument that exists.** `π(n) ≥ sameColorBar` correctly retires P2's `MIN_NODE_AREA_FRACTION =
   0.0005` (verified: `tos/constants.ts:76-81`, "45 pixels of a 300×300 cover"). But a colour whose
   every patch differs from its parent by less than the bar now never becomes a pigment. Falsifier 1
   (§8) tests **pigment-set churn**, not endorsed reachability — P2's 91.9%/1.7% instrument
   (`tos/integration-NOTES.md:245-247`) is not re-run against the new retention rule, which is exactly
   the measurement that would price this gate.
7. **L212-215 (minor).** "measured exactly zero movement (9.0% → 9.0%, dither 23.0% → 23.0%, *the same
   trials as before, to the trial*)". The table (`tos/roles/NOTES.md:334-340`) confirms 9.0→9.0 and
   23.0→23.0 (54/600, 23/100) but also shows accent role-moves 447 → **445**, so it is not identical to
   the trial.
8. Verified exact, and the densest correct-citation record of the six: 82% `c-winner` / 26%
   `a-node-set` / 15% `b-repr` / Jaccard 0.861 / top-64 90.1% / ground-chain length 69%
   (`q1-dither/REPORT.md`); laminarity 45.8% vs majority baseline 52.8%, phantom 69.2%, 0 of 77 Holm
   (`q2-laminarity/REPORT.md:12-17`) — a *more* accurate reading than P2's own STATE ("remains at the
   majority baseline"); lanes 86.6→91.9% and falsifier 3.4→1.7%; 617 ms parse / 627 ms mean palette;
   "206 rows dedupe to **82 palettes**" — independently reproduced here exactly. T1's Zen-grey use is
   explicitly a preference, not a wall (L171), which is the correct handling of that note.

## unseeded

1. **L140-141 — the grafted detector is quoted at its pre-fix numbers.** "graft P2's `roles/text.ts`
   **whole** … (**17/20** demo covers yield a text group; the foreground is the leading group's colour
   on **13/20**)". `tos/integration-NOTES.md:231-232` gives 17/20 and 13/20 as the **before** column of
   a before/after table whose after column is **19/20 and 16/20** — 16/20 is the figure
   `GRAFT_INVENTORY` row 4 canonises. A later measurement (`tos/roles/NOTES.md:469-470`) reads
   19/20→18/20 and 16/20→**15/20**. The proposal grafts the post-fix code and describes the pre-fix
   performance.
2. **§2.4 L74-77 — builds gradient asymmetry into the mechanism, then cites the neutrality rule.**
   "ramp = order-1, admitted only when its improvement **exceeds its certified interval**" while flat
   needs no margin — "so the asymmetry goes in the mechanism, not a threshold". Six lines later:
   "neutrality by construction, which the field guide says is the only way it ever held". Field guide
   §2.4 is "**A wrongly allowed gradient is exactly as bad as a wrongly prevented one**", and
   `GRAFT_INVENTORY` learning 6 records both directions as live complaint classes. The 5:1 note ratio
   is *correct* (verified: five false-gradient notes across cal-017, pair-019, pair-023 ×2 + one more
   in pair-023, against one explicit "should be a gradient" in pair-024) — but it is a sample of what
   the arms happened to publish, not a prior over artworks.
3. **§2.1 — recalibrates the repo's one calibrated ruler and prices it as a colour-space choice.** The
   flare `Y0 = 0.005` is applied before every distance, bar and residual, while the four `[REVIEWED]`
   bar values are used unchanged. Those values were calibrated in plain OKLab
   (`PHASE_0_DECISIONS.md` §3, dark-neutral 0.00932 with CI 0.00764–0.01137). The proposal's own
   arithmetic shows a dark pair going 0.1448 → **0.0292** (a ~5× compression) against a bar that stays
   0.00932. §5 lists the bar as "contract, measured … already the most-audited number here" without
   noting the audit was performed in a different space. The direction is defensible (the "upward
   packet" says the bar is too tight near black); the provenance claim is not.
4. **L125-126 — a paraphrase presented as the reviewer's words.** "The reviewer stated this
   architecture unprompted as their ideal: *'ground pair as one family's two shades (the field ramp's
   ends), figure pair from the marks laid over it'*". Those are the P5 orchestrator's words summarising
   a ground-truth session (`p5-fieldfit/STATE.md`, "the reviewer stated, unprompted, exactly this
   mechanism's role architecture as their ideal — ground pair as …"). No such reviewer utterance is in
   the warehouse. The proposal's own hedge — taking it as a two-*tier* not two-*family* claim — is
   correct and does not repair the attribution.
5. **§5 undercounts inherited constants.** Thirteen listed, but §2.2 keeps P5's recursion whole:
   `COMPONENT_CORE_FRACTION = 0.39` (`[UNCALIBRATED]`, one-cover anchor) and `MAX_COMPONENT_DEPTH` are
   not among them. Milder than joint-search's omission because "P5's constants inherited" is stated.
6. **§2.3 — two thresholds presented as aggregates.** "Both are aggregates over a fit-produced support,
   **not thresholds**" (L67-68) describes reach and thickness; the mechanism is
   `ground = greatest reach among components with thickness ≥ T`, and §5 lists both `T` and "minimum
   ground reach" as anchored constants. The aggregates are threshold-free; the *rule* is a gate pair,
   and §6 stakes the design's strongest claim on it.
7. **Structural, self-flagged.** §2.7 level 1 ("coverage — how many distinct identity families the four
   published colours span") is a scalar count with authority over the whole palette, the same shape as
   tree-first's T3. The proposal names the exposure itself ("§2.7's ordering is a comparator, this
   repo's most-relapsed shape") and gives three defences.
8. Verified accurate: the P6 exact-search non-termination on 2 of demo-20
   (`p6/reports/second-palettes.md:372`) — the best-sourced declined graft in the set; P5's pass-7
   accent 52.5 → 35.5 (`reports/winteg-pass7.md:93`); P5 ruling R3 "record-not-build"
   (`review-rounds/round-5/ROUND.md:81`); erosion mortality 60/60; `compare.ts` regional-bar default;
   the 8/8-unacceptable unreadable-foreground count; and — uniquely — **L232-233 states and corrects
   the brief's own §2 convention defect** ("P5's headline 39% is its *agreement* figure … the brief
   reads it as disagreement"), with §8.2 reading P3's ~16% as movement correctly.

---

## Ranking — evidential soundness

Judged on: do the citations say what the proposal says they say; is direction checked before a number
is compared; are held constants labelled held; does the design re-enter a falsified shape without
naming it. Not judged on design quality.

| # | proposal | one-line justification |
|---|---|---|
| 1 | **tree-first** | Highest verified-citation density of the six — every P2-internal figure (82%/26%/15%/0.861/90.1%/69%, laminarity 45.8 vs 52.8, lanes 86.6→91.9, 617/627 ms, the 0.0005 floor) checks out exactly, and its corpus arithmetic (82 palettes) reproduces independently; the defects are two evidence inversions (3% spacing, 114/114 attribution) and one direction mix, not misreadings of what a source says. |
| 2 | **unseeded** | The only proposal to catch and correct the brief's own convention defect, and it verifies its own arithmetic and its declined grafts; docked for quoting the grafted text detector at its superseded pre-fix numbers, for a paraphrase presented as a reviewer quotation, and for building gradient asymmetry into the mechanism two lines from citing the neutrality rule that forbids it. |
| 3 | **field-and-marks** | Accurate on prototype internals to code level (core fraction, ink-veto constants, ramp anchors, `coherence.ts`, 48%/13% churn) and on every warehouse quotation; docked for building all per-pair judgement on the pooled bar the contract reserves for dashboards, for overstating P3's 4-stop record, and for one direction-inverted reference point inside its own falsifier. |
| 4 | **robustness-first** | Best field-guide and contract sourcing, an explicit direction note, and the cleanest reading of the swap datum; docked for crediting itself with removing a cause the reviewer ruled a bug, for mis-describing the one production statistic it claims as new, and for a margin threshold sold as mode-connectivity structure. |
| 5 | **ranks-new-substrate** | Sound on P3's own record (drift slope, 16-of-16, 539-file instrument, the CONVERGE quote) and reads P3's 16% in the right direction; docked for setting the stop-spacing floor at the gap the evidence calls banding, for a K=8 candidate set that contradicts the discipline it restates verbatim and admits can block a four-family artwork, and for products of heterogeneous fields presented as "no scalar". |
| 6 | **joint-search** | The only proposal whose central ordering claim rests on a verdict count that is demonstrably false ("all 12 unacceptable notes cite a wrong background or an unreadable foreground" — 18 such notes, ≥5 counterexamples), compounded by a falsifier rendered inert by the brief's convention trap, a per-artwork note promoted to a seat law relaxable only three bundles down, and an undeclared pair of `[UNCALIBRATED]` inherited constants. |
