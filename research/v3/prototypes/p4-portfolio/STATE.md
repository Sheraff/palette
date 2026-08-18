# P4 — where we're at

**FINAL, 2026-08-18: MECHANISM-FALSIFIED — F3 fired on batch phase2-pair-023 (branch (b) by its
own pre-registered criterion; `RULING.md` is the authority). F1 ruled non-firing, F2 never
tripped: the selector failed honestly, with nothing tuned toward the reviewer. What is
falsified: description-length palette pricing as a selection authority — the currency
discriminates decisively and confidently elects what the judge does not prefer (no margin
dependence, τ-b −0.342). The prior-art pattern — the selector is where portfolios die — is
confirmed a fifth time, now for a non-fitted zero-hand-constant currency. Salvage inventory in
RULING.md §Salvage. The section below is the pre-round state, retained as the record.**

## 1. Mechanism

A portfolio of the campaign's real, judge-tested extractors under a selector whose currency —
description length of each member's published palette against the image, in bits — is
member-independent, non-fitted, and contains nothing to tune toward the reviewer
(`SPEC.md` §2; adapted from arm-c′ §2.3).

## 2. Judge-validated strengths

**None yet — honestly.** P4 has staged no review round; no palette of its choosing has been
graded. Its members' judge records belong to their own arms' STATE.md files, not to this one.

## 3. Measured findings so far

- **All-pairs material disagreement, 100% of demo-20 covers** (M1, `data/m1-disagreement.json`):
  every member pair differs beyond the contract's same-colour bar on every cover (all-agree
  0/20; accent 95–100%, foreground 70–100%; 52/240 role comparisons agree). The selector's
  burden is empirically established, not assumed — arm-c′'s expectation that immateriality
  absorbs most selections is FALSE for real members. The selector must actually decide, on
  essentially every artwork.
- Member integration is verified, not trusted: 4/4 byte-identity gates against home-worktree
  runs; determinism 20/20 strict on the three fast members; provenance pinned
  (`members/*/PROVENANCE.md`, re-verified by hash via `tools/verify-pin.ts`).
- Member runtime spread: P5 121 ms / P3 208 ms / P2 669 ms median per cover; P1a 227.6 s
  (hard-coded 240 s search budget) — runs as a 3-cover probe member only, by ruling: no fork of
  a closed arm's operating point away from its falsification record.

## 4. Open questions and their costs

1. **F1 — does the currency discriminate?** (bootstrap win fractions vs ½ where palettes
   differ.) Preview lands with W2 on demo-20; the real measurement is M3 on coverage-set-1 —
   roughly one orchestrated cycle plus corpus compute at Σ-member cost (~1 s/cover for the
   fast three).
2. **F2 — the hand-constant relapse.** Armed as an executable tripwire test in W2's brief: any
   tunable constant outside arm-c′'s eight anchored decisions fails the suite. Standing
   falsifier, zero additional cost — the question is only whether implementation pressure ever
   trips it.
3. **F3 — does the selector beat the best single member where they disagree?** One pairwise
   round (selector's choice vs P3) on disagreement covers; reviewer bandwidth is the cost.
   M1 says disagreement covers are ~all covers, so composition is easy.
4. P2 member provenance: its merged candidate is uncommitted in P2's tree (escalated; ordered
   to commit). Re-pin costs minutes once its commit lands.

## 5. Graftable components

- The **member integration harness**: snapshot-with-provenance + byte-identity gate + hash
  re-verification (`tools/snapshot-member.ts`, `verify-pin.ts`, `run-member.ts`) — runs any
  arm's candidate from a foreign tree with proof of fidelity. Useful to any future bake-off
  runner regardless of P4's fate.
- The **role-level disagreement matrix** tooling (`tools/disagreement.ts`) — pairwise material
  difference on the contract's own bar, member-agnostic.
- When W2 lands: the lattice/census/σ substrate and the palette-pricing currency — a
  score-any-palette instrument (like P1's energies but structure-blind) that could serve as a
  development aid even if the selector falsifies.

## 6. Honest promise assessment

The history is the risk: portfolios were built in every era of this repo and every selector
failed or turned out to be a human — P4 exists to test exactly one claim, that a non-fitted,
member-independent currency succeeds where four fitted/hand-tuned selectors failed, and all
three falsifiers (F1/F2/F3, `SPEC.md` §3) were pre-registered before implementation. M1 moved
the odds in one real way: the selector's value is not hypothetical — members disagree
materially everywhere, so a working selector would be choosing among genuinely different
palettes on every cover, and the fixed-best-member baseline (P3) is well-defined and strong.
Against that: the currency has never priced a palette yet (W2 uncollected), the reviewer has
graded nothing of P4's, and the mechanism inherits every member's runtime cost. Promise is
therefore *conditional and sharply testable*: one worker collection, one corpus measurement,
and one review round from a keep-or-kill-grade answer — cheap to resolve in either direction,
which is itself the healthiest property this arm has.
