# M1 attribution — is a single term culpable?

Pure reader of `data/falsifier/m1-results.json` (run `08ad43dd05`, as-of 2026-08-04); no re-scoring, no RNG. λ=1; the stored terms sum to the compared total with residual 0 (p1a, nats) / 0 (p1ap, bits), so per-term deltas *are* a decomposition of the margin that decided each pair. **Every test here is post-hoc, two-sided and uncorrected**; the pre-registered numbers stay in `m1-summary.json`. Sign convention throughout: **positive Δ = the good/left side pays more**. Tables show the two `a-good-vs-known-bad` pair sets; all five pair sets are in `m1-attribution.json`, and detail tables show the larger `all-pairs` selection. Culpability rule, fixed in `attribution.ts` before any table was read: a term is culpable only if it is the largest contributor to the margin in ≥2/3 of losing pairs AND its median share of the margin is ≥0.5; otherwise the loss is spread. Every exploratory line below carries the same caveat and it is stated once here: post-hoc, two-sided, no direction fixed in advance, no multiplicity correction, because a post-hoc family has no honest size.

## 1. Which term drives the losses

`share` = Δterm / Δtotal (sums to 1 within a pair; exceeds 100% and goes negative when two terms nearly cancel — a 650% share means that term alone would have decided the pair six times over and the others gave most of it back). `gross` = |Δterm| / Σ|Δterm|, bounded. `argmax` = pairs where this term is the largest contributor *in the direction the pair went*.

| pair set | arm | term | LOSS mean Δ | LOSS med share | LOSS gross | LOSS argmax | WIN mean Δ | WIN med share | WIN argmax |
|---|---|---|---|---|---|---|---|---|---|
| all-pairs | p1a | field | 0.040 | -4.6% | 9.7% | 3/25 | -0.083 | -40.3% | 4/19 |
| all-pairs | p1a | ink | 0.149 | 17.4% | 32.1% | 9/25 | -0.383 | 58.3% | 7/19 |
| all-pairs | p1a | structural | 0.560 | 70.1% | 44.2% | 13/25 | -0.579 | 0.0% | 8/19 |
| all-pairs | p1a | escape | 0 | 0.0% | 0.0% | 0/25 | 0 | 0.0% | 0/19 |
| all-pairs | p1ap | fieldColorBits | -56046.912 | 0.0% | 0.0% | 4/31 | -22423.352 | 0.0% | 1/11 |
| all-pairs | p1ap | fieldSupportBits | -6063.417 | 0.0% | 0.0% | 0/31 | -8477.763 | 0.0% | 0/11 |
| all-pairs | p1ap | inkColorBits | -86692.426 | -70.7% | 23.6% | 4/31 | 1.09e+5 | -171.6% | 3/11 |
| all-pairs | p1ap | inkSupportBits | -33218.639 | -27.0% | 10.3% | 0/31 | 32455.436 | -99.9% | 0/11 |
| all-pairs | p1ap | genericBits | 2.40e+5 | 406.7% | 52.7% | 23/31 | -1.23e+5 | 919.3% | 6/11 |
| all-pairs | p1ap | paletteBits | 2.194 | 0.0% | 0.0% | 0/31 | 3.091 | 0.0% | 1/11 |

Verdicts under the rule above, all five pair sets:

| pair set | arm | W/L/T | loss verdict | top-by-argmax | argmax frac | med share | win verdict |
|---|---|---|---|---|---|---|---|
| a-good-vs-known-bad/best-of-side | p1a | 8/6/0 | **spread** | ink | 50.0% | 54.2% | spread |
| a-good-vs-known-bad/best-of-side | p1ap | 5/7/2 | **single term: genericBits** | genericBits | 71.4% | 652.9% | spread |
| a-good-vs-known-bad/all-pairs | p1a | 19/25/3 | **spread** | structural | 52.0% | 70.1% | spread |
| a-good-vs-known-bad/all-pairs | p1ap | 11/31/5 | **single term: genericBits** | genericBits | 74.2% | 406.7% | spread |
| a-endorsed-vs-known-bad/best-of-side | p1a | 5/5/0 | **spread** | structural | 60.0% | 76.0% | spread |
| a-endorsed-vs-known-bad/best-of-side | p1ap | 3/7/0 | **single term: genericBits** | genericBits | 71.4% | 652.9% | single term: inkColorBits |
| b-endorsed-vs-acceptable/best-of-side | p1a | 15/23/10 | **spread** | ink | 43.5% | -26.9% | spread |
| b-endorsed-vs-acceptable/best-of-side | p1ap | 9/21/18 | **single term: genericBits** | genericBits | 81.0% | 744.4% | single term: genericBits |
| b-acceptable-vs-known-bad/best-of-side | p1a | 5/4/0 | **spread** | ink | 50.0% | 60.8% | spread |
| b-acceptable-vs-known-bad/best-of-side | p1ap | 2/5/2 | **spread** | genericBits | 60.0% | 652.9% | spread |

λ rescue — losses whose margin `Δdata + λ·Δstructural` changes sign at some λ, and whether that λ is inside the swept grid [¼, 4]:

On `all-pairs`: **p1a** 25 losses, 12 with Δstructural = 0 (no λ can move them at all), 4 flip at some λ>0, 0 flip inside the swept grid; **p1ap** 31 losses, 15 with Δstructural = 0 (no λ can move them at all), 8 flip at some λ>0, 2 flip inside the swept grid.

## 2. The reconstruction question

Legacy gradients were reconstructed `[background@0, midpoint@0.5, surface@1]`. Cross-tab of the pooled good-vs-known-bad pairs (all-pairs, n=47) by the two sides' gradient booleans; `path` = p1a {field + structural}, p1ap {fieldColorBits + fieldSupportBits + paletteBits}.

| arm | cell (good–bad) | n | W/L/T | good win rate | mean Δtotal | mean Δpath | med Δpath |
|---|---|---|---|---|---|---|---|
| p1a | grad-grad | 19 | 4/13/2 | 23.5% | 0.322 | 0.309 | 0.107 |
| p1a | grad-flat | 6 | 0/6/0 | 0.0% | 1.361 | 1.105 | 1.149 |
| p1a | flat-grad | 7 | 7/0/0 | 100.0% | -2.027 | -1.504 | -1.687 |
| p1a | flat-flat | 15 | 8/6/1 | 57.1% | -0.082 | 0.030 | 0.003 |
| p1ap | grad-grad | 19 | 3/13/3 | 18.8% | 60873.420 | 1118.347 | 0 |
| p1ap | grad-flat | 6 | 0/6/0 | 0.0% | 52713.475 | -3.79e+5 | -5.68e+5 |
| p1ap | flat-grad | 7 | 3/4/0 | 42.9% | 24520.982 | 49613.025 | -2.000 |
| p1ap | flat-flat | 15 | 5/8/2 | 38.5% | 747.258 | -24050.396 | 0 |

**The control.** Restricting to pairs where both sides declared the same gradient boolean takes the reconstruction penalty out of the comparison — both sides pay it or neither does. If a signal appears there, the M1 null is a reconstruction artifact.

| pair set | arm | matched W/L/T | matched good win rate | mismatched decided | flat side cheaper |
|---|---|---|---|---|---|
| all-pairs | p1a | 12/19/3 | 38.7% | 13 | 13/13 |
| all-pairs | p1ap | 8/21/5 | 27.6% | 13 | 9/13 |

Within-artwork gradient contrast — the artworks whose legacy records disagree with themselves about the gradient boolean, best-of-side within each state, Δ = gradient-true − gradient-false:

| arm | artworks | ramp costs more | mean Δtotal | med Δtotal | per-term mean Δ |
|---|---|---|---|---|---|
| p1a | 15 | 13/15 | 1.352 | 1.276 | field -0.377; ink 0.329; structural 1.400; escape 0 |
| p1ap | 15 | 12/15 | 48960.323 | 26.000 | fieldColorBits -35617.512; fieldSupportBits -16733.925; inkColorBits -25023.932; inkSupportBits -8004.729; genericBits 1.34e+5; paletteBits 17.467 |

- Reconstructed ramp costs more than its flat sibling on the same artwork: p1a 13/15 (86.7%) vs null p=0.5: p=0.0074; p1ap 12/15 (80.0%) vs null p=0.5: p=0.0352 (exact binomial, two-sided).
- Good side lower on **gradient-matched** pairs, all-pairs: p1a 12/31 (38.7%) vs null p=0.5: p=0.2810; p1ap 8/29 (27.6%) vs null p=0.5: p=0.0241. On **gradient-mismatched** pairs the flat side is the cheaper one: p1a 13/13 (100.0%) vs null p=0.5: p=0.0002; p1ap 9/13 (69.2%) vs null p=0.5: p=0.2668.

## 3. The degeneracy question (arm A′)

`genericBits` median share of the likelihood: all entries 98.3%, degenerate-artwork entries 99.7% (n=135 entries on 59 artworks), structured 96.9%. The premise — that on a degenerate artwork both sides code the same generic mass and the margin reduces to λ·ΔL(P) — is tested directly below.

| stratum | pairs | ties | decided | decided by L(P) **alone** | cheaper-L(P) side won | med L(P) share of margin | margins ≥99% L(P) |
|---|---|---|---|---|---|---|---|
| all | 128 | 27 | 101 | 4 (4.0%) | 33/49 (67.3%) | 0.0% | 13 |
| degenerate | 23 | 9 | 14 | 0 (0.0%) | 4/4 (100.0%) | 0.0% | 3 |
| structured | 105 | 18 | 87 | 4 (4.6%) | 29/45 (64.4%) | 0.0% | 10 |

Tie anatomy — a tie in which every term is identical is the same reconstructed configuration filed under two verdict tiers, i.e. a corpus labelling fact, not the energy failing to discriminate:

| arm | ties | every term identical | identical across good/known-bad | by tier pair |
|---|---|---|---|---|
| p1a | 13 | 12 | 2 | acceptable = known-bad: 1; endorsed = acceptable: 10; endorsed = known-bad: 1 |
| p1ap | 27 | 27 | 9 | acceptable = known-bad: 7; endorsed = acceptable: 18; endorsed = known-bad: 2 |

The endorsed-vs-acceptable inversion (`9W/21L/18T`, two-sided p=0.0428 — acceptable is *cheaper*), against the hypothesis that acceptable wins by naming fewer colours. Δ = endorsed − acceptable:

| arm | subset | n | mean ΔL(P) bits | mean ΔΩ | mean Δstops | endorsed more collapses | acceptable more collapses | acceptable cheaper in L(P) |
|---|---|---|---|---|---|---|---|---|
| p1ap | all | 48 | 2.50 | 0.083 | 0.063 | 2/48 | 3/48 | 8/48 |
| p1ap | loss (acceptable cheaper) | 21 | 5.71 | 0.190 | 0.143 | 1/21 | 2/21 | 7/21 |

## 4. The ink-support question (arm A, DESIGN.md decision 9)

The known defect lets broad mass read as ink for free. Its prediction: in the pairs the good side loses, the *known-bad* side should be the one carrying the larger `inkMassFraction`.

| pair set | outcome | n | mean ink (good) | mean ink (bad) | mean Δ | med Δ | bad side has more ink |
|---|---|---|---|---|---|---|---|
| all-pairs | losses | 25 | 0.2185 | 0.2236 | -0.0050 | 0 | 6/25 |
| all-pairs | wins | 19 | 0.3028 | 0.2138 | 0.0890 | 0.1255 | 1/19 |

- Losing pairs where the known-bad side carries the larger inkMassFraction: 6/25 (24.0%) vs null p=0.5: p=0.0146 — i.e. in 19 of 25 losses it is the **good** side holding more ink (exact binomial, two-sided).
- Pearson r(Δ inkMassFraction, Δ total), good-vs-known-bad: best-of-side r=-0.461 (n=14), all-pairs r=-0.392 (n=47). Negative r means *more* ink mass on the good side goes with a *lower* good-side energy — the defect, where it bites, is helping whoever takes the ink, not the known-bad side specifically.

## 5. Tier structural census

| tier | stratum | entries | artworks | gradient | surf. collapsed | acc. collapsed | mean stops | mean L(P) bits | mean Ω | mean explained mass |
|---|---|---|---|---|---|---|---|---|---|---|
| endorsed | all | 255 | 144 | 51.0% | 15.7% | 1.6% | 1.231 | 102.65 | 2.549 | 0.0611 |
| acceptable | all | 166 | 89 | 50.0% | 10.2% | 1.8% | 1.271 | 105.78 | 2.651 | 0.0593 |
| known-bad | all | 37 | 26 | 37.8% | 29.7% | 0.0% | 0.919 | 97.81 | 2.243 | 0.0589 |

λ enters only as λ·Ω (p1a) and λ·L(P) (p1ap), so the tier ordering of those two is the entire channel λ has: endorsed Ω=2.549, L(P)=102.7 bits; acceptable Ω=2.651, L(P)=105.8 bits; known-bad Ω=2.243, L(P)=97.8 bits. Known-bad is the structurally *cheapest* tier on both, so raising λ moves the falsifier against the good tiers, not for them. Per-stratum rows are in the JSON; the sharpest is known-bad on degenerate artworks — 6 entries, 0% gradient, 66.7% surface-collapsed, L(P)=83.0 bits, Ω=1.33.

Read: 256 pairs (λ=1, stratum=all comparisons only — the stratum-restricted comparisons are subsets and would double-count), 458 entries, 197 artworks.

