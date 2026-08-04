# Phase 1 — the author brief

**What a proposal author receives, and what they deliberately do not.**

Written **2026-08-04**, deliberately **before any proposal exists**. That date is most of what this
document is worth: a reading list assembled after seeing the proposals would be indistinguishable
from moving the goalposts, and nobody — including whoever wrote it — would be able to tell the
difference afterwards. Specified by `d-2026-08-04-phase-1-authors-receive-a-tool-catalog`; the
process it serves is `V3_PLAN.md` §6, Phase 1.

**Who this is for.** You are one of several authors, each writing an architecture proposal
independently. You are not competing on polish and you are not being asked for code. **You are being
asked for a paradigm** — a way of getting from an image to a palette that is *structurally*
different from the others, described well enough that someone could prototype it.

**Read §7 before you start.** It is the list of things you are not being given, and the reasons are
not administrative.

---

## 1. What you are asked to produce

An architecture proposal: how your approach gets from an image to the output contract in §3, what
its evidence is, where its decisions live, and what it would cost to build.

Two rules about the shape of the answer:

- **Distinctness is the point of Phase 1, not quality.** Several authors are writing at once, and
  the phase succeeds if the proposals are *genuinely different paradigms* — not three variations
  with different constants. Phase 2 prototypes the 2–3 most distinct ones and judges **trajectory
  and ceiling, not first-round scores**. An immature idea that fails interestingly is worth more
  here than a safe one that scores.
- **Say where your free parameters are.** Not how many literals your code would contain — how many
  independent decisions your *paradigm* needs a human to make, and what would anchor each. This is
  success criterion 2 (§2) and it is measured in Phase 3, so a proposal that cannot say is a
  proposal that has not been thought through.

## 2. The goals

From `V3_PLAN.md` §1. These are the success criteria, and they are the only place in this brief
where numbers about the previous system appear — they are here because they define the target, not
as a diagnosis of what went wrong.

The previous system reached ~97% acceptable-or-better against a measured ~12% single-verdict noise
band. **v3 cannot meaningfully beat that number; we are at the measurement ceiling**, and chasing
acceptability points means chasing reviewer noise. The rewrite's goals are therefore not "score
higher":

1. **Robustness.** The incumbent is stable per file and collapses across encodings: 72.8% palette
   agreement on re-encode, a ±1-LSB dither moved all 114 test palettes, an ASCII id relabeling moved
   55.85% of the corpus. **These are architectural, not tunable.** Your paradigm should have an
   answer for why it does better, and that answer should be structural.
2. **Parameter honesty.** ~900 tunable sites against 11 human-anchored values, and 1.61× more
   perturbation-stable on reviewed than on unseen artwork — quantified overfitting. **v3 targets an
   order of magnitude fewer free constants, each carrying provenance from birth.**
3. **Structural completeness.** Every evidence lane can reach every role it should. The incumbent's
   candidacy walls made the reviewer's own corrected accents *structurally unpublishable* — the
   right answer existed and the architecture could not emit it. Identity coverage is first-class;
   the semantic classes (frames, overlays, giant text) are handled structurally rather than as
   patches.

**Success statement: match ~97% with a smaller, more stable, structurally complete system.**

## 3. The output contract

By pointer, because the contract is normative and this brief is not. Read these; do not infer the
contract from anything else here.

| what | where |
|---|---|
| Output contract — roles, gradient boolean, stops, decoupled render stops | `PHASE_0_DECISIONS.md` **§2** |
| Input policy — what the system is given and in what form | `PHASE_0_DECISIONS.md` **§1** |
| Metrics — what is tracked and how success is measured | `PHASE_0_DECISIONS.md` **§3** |
| Contract invariants and the pathology census — the gates a palette passes | `PHASE_0_DECISIONS.md` **§4**, implemented in `src/contract/` |
| Corpus, holdout and legacy policy | `PHASE_0_DECISIONS.md` **§5** |

The fixed problem shape, from `V3_PLAN.md` §2: **four roles** (background, surface, foreground,
accent) plus a **gradient boolean** and **stops**; foreground is text, accent is icons/UI, fields
are large areas; **contrast is deliberately low**, with the hard minimum a user parameter defaulting
near zero; **render stops are decoupled from role colours** and multi-stop capable.

**One standing rule about the gates, worth knowing before you design around them**
(`PHASE_0_DECISIONS.md` §4): *an invariant that ever blocks an endorsed palette is demoted — the
reviewer outranks the rule.* Gates are instruments, not axioms. If your paradigm is refused by one,
that is a fact about the gate as much as about your paradigm, and it is admissible as an argument.

## 4. Corpus facts

**Measured distributions, with no conclusions attached.** Every number carries the date it was
measured; re-derive rather than quoting these downstream. Nothing in this section is an argument
for or against any approach — it is here so you know what you are designing *for*.

**The image corpus.**
- 4,088 artworks → **991 non-square** removed → 3,097 square → **16 thumbnail-only** (best long edge
  ≤ 150 px) → **324 square real-transparency** files (disc scans, cutouts; all single-rendition) →
  **2,757 candidate artworks** (frozen 2026-08-02).
- Those 2,757 candidates are only **1,712 distinct images**. The nominal count double-counts
  duplicates; use the effective size when reasoning about statistical power.
- **Holdout: 413 artworks / 1,073 files (14.98%)**, drawn as whole near-duplicate components — 254
  independent components (14.84% of components). Frozen, seeded, byte-reproducible. **It is excluded
  from everything until end-of-campaign claims.** You will not see it and neither will your prototype.
- The near-duplicate census is a **lower bound**: measured against duplicates the filenames already
  know about, it undercounts by **46.3%** at cosine 0.95.
- **Image dimensions come from headers, never filenames.** 719 AVIFs in the corpus disagree with
  their own filenames. This is a corpus fact, not a coding style note.
- **Standard tuning bench:** `data/coverage-set/coverage-set-1.json`, 200 artworks, seed
  `0xc0efface`, byte-reproducible.

**The verdict evidence** (distilled from the previous era into fixtures — `data/legacy/`):
- **351 endorsed palettes**, 1,397 role colours.
- **166 acceptable** palettes, 664 role colours (a "not-rejected" tier, never an endorsement).
- **37 known-bad** palettes, 148 role colours. All 37 are hard-gate entries; there is no warn-only tier.
- Of the 1,397 endorsed role colours, **1** is absent from its source image as an exact 8-bit triple.
- Median endorsed role colour's exact-triple area share: **8.89e-5**. Same-colour-bar neighbourhood
  share, same population, median: **1.91e-2**.

**The live warehouse** (v3-era reviewer answers): **1,236 records across 21 batches as of
2026-08-04T08:00Z**, 0 verdicts (no palette pipeline has been graded yet). Re-derive with
`warehouse status` — this number moves daily.

## 5. The tool catalog

**Every instrument that exists, one line each: what it measures and how to invoke it.** This tells
you *what can be measured*. It deliberately does not tell you *what any of them found* — see §7.

Two honest labels you will see below. **Built** means the instrument has a README of its own, which
is the authority on what it currently does; this brief does not restate status for code another
workstream owns. **In flight** means it was being built on 2026-08-04 and its own README is the only
thing you should trust about it.

| instrument | what it measures | invoke | state |
|---|---|---|---|
| **Dev loop** (`src/devloop/`) | Runs a method over a batch of covers and diffs the result against a previous run — per-role change size, sorted by how much moved. Content-hash cached, so reruns are cheap and byte-stable. **A batch runner, deliberately not a full-corpus-per-iteration runner.** | see `src/devloop/` | in flight |
| **Robustness harness** (`src/robustness/`) | How much a palette moves under changes that should not matter: re-encode, quality change, resize, 1-px crop, dither, id relabeling, and the matched real-rendition pairs already on disk. This is success criterion 1 measured directly. | see `src/robustness/` | in flight |
| **Statistics module** (`src/stats/`) | One shared implementation of the tests everything else uses — agreement, bootstrap, binomial, Fisher, kappa, McNemar, multiplicity — with the common mistakes made unrepresentable (paired vs unpaired, and the unit of count, must be declared). | `import` from `src/stats/` | in flight |
| **Auto-adjudication** (`src/adjudication/`) | Runs your candidate palettes against the standing reviewer evidence and reports, per file and in aggregate: where you agree with an endorsed palette, where you reproduce a rejected one, where the evidence contradicts itself, and **whether your colour set could have produced the endorsed palette at all** (reachability). Split by era; **gates nothing**. | `node --experimental-strip-types src/adjudication/cli.ts run <candidates.jsonl>` · `… corpus` · `… explain <candidates.jsonl> --artwork <sha256>` | built (`src/adjudication/README.md`) |
| **Contract invariants** (`src/contract/`) | Whether a palette satisfies the output contract: role structure, source support, contrast relations, gradient rules. Returns violations and advisory findings. | `import` from `src/contract/`; `tests/contract-*.test.ts` | built |
| **Honesty scanner** (`src/honesty/`) | Counts the numbers in the codebase that could be changed to change behaviour, and how many carry a provenance story. This is success criterion 2 measured directly. Reports a **lower bound** (unclear cases are counted, not excluded). | `node --experimental-strip-types src/honesty/cli.ts` (`--check` exits 1 on a stale report) | built (`src/honesty/README.md`) |
| **Review rounds** (`src/review-server/`, `review-ui/round-kit.js`) | The human channel. Blinded 4–10 item batches, content-hash side shuffling, the key never served, calibration rounds with repeats, keyboard-only answering. **Every round carries a per-item free-text note and a copyable item id**, so the reviewer can say something the round did not ask. Reviewer bandwidth is the campaign's binding constraint — rounds are scheduled, not spent freely. | the orchestrator pushes batches; see `REVIEW_UI.md` | built (`src/review-server/README.md`) |
| **Warehouse** (`src/warehouse/`) | The evidence store and its query CLI. Every reviewer answer, amendments applied, with supersession and retraction visible rather than resolved away. | `node --experimental-strip-types src/warehouse/cli.ts status \| query \| tail` | built |
| **Semantic oracle** (`oracle/`, `data/sam/`, `data/embeddings/`) | Dev-time labels about image content: a VLM question set, SAM masks, and embeddings over both collections. **Labels, not ground truth** — `PHASE_0_DECISIONS.md` §6 states exactly what they are and are not. | see `ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md`, `ORACLE_QUESTION_SET.md` | built |

**What is deliberately absent from this catalog**, so you do not go looking: there is **no browsable
page of past verdicts with the artwork beside them**. It was proposed, it was dropped, and it was
never built (`d-2026-08-04-toolbox-adjudication-1-deprecated`). If you find it referenced elsewhere,
the reference is stale.

**And one rule that binds anything built for Phase 1:** no code from the previous system is ported
into v3 — it is built fresh (`CONVENTIONS.md`; `d-2026-08-04-no-v2-3-code-enters-v3`). The
*evidence* carries over. The code does not.

## 6. Show your work

**One line in your proposal. Nothing enforces it.**

> **Expected failures and falsifier.** What do you expect this approach to be bad at, and what result
> would tell you the paradigm itself is wrong (as opposed to under-tuned)?

Answer it if it is useful to you. **No proposal is rejected for omitting it**, no instrument reads
it, and it is not a gate. It is here because a self-aware failure prediction made *before* the
prototype exists is occasionally worth a great deal and costs one line
(`d-2026-08-04-show-your-work-is-a-template-line-not-a-gate`). It is recorded as an open question
whether it is worth anything at all; if Phase 1 produces nothing useful from it, the line gets
deleted.

*A known failure mode, stated so you can avoid it: an unfalsifiable prediction filled in to satisfy
the template is worse than a blank, because someone will later cite it as if it had been a real
pre-registration.*

## 7. What you do not receive, and why

**You are not given: our failure analyses, the instruments' conclusions, or the field guide.**

This is not information hoarding and it is not a test. It is the entire design of Phase 1.

**The field guide** (`ALBUM_ARTWORK_UI_PALETTE_FIELD_GUIDE.md`) is a detailed distillation of
everything the previous system learned. It is explicitly **demoted to an adversarial checklist, not
a blueprint** (`V3_PLAN.md` §2): its families, obligations, slates and evidence blends are things a
candidate design must *have an answer for*, not things it must contain. **A proposal written after
reading it is a repair of the old system** — the plan's own words are that using it as a blueprint
"reproduces v2-3 with better hygiene — incremental at best". You are here to produce something the
guide could not have predicted. The guide comes back in Phase 3, as the audit checklist for whatever
wins.

**The instruments' conclusions** are withheld for a narrower reason: a conclusion is an answer, and
an answer sitting on the shelf is an anchor. Knowing that a robustness harness *exists* lets you
design for robustness. Knowing what it *concluded about a particular approach* tells you which
approach to imitate. **The catalog in §5 is deliberately the first of those and not the second.**

**And the catalog is itself a hole in the blind, which is why §8 exists.** Naming the instruments
tells you what this campaign thinks is worth measuring, and that is a real anchor — weaker than the
conclusions, but not zero. We know it. The blind arm is how we find out what it cost.

**Two questions are also withheld — from us, not from you.** These were proposed as tooling and the
reviewer reclassified them: *"part of the algorithm, not tooling"*
(`d-2026-08-04-alpha-matte-and-cvd-are-algorithm-material`). Nothing has been pre-built for either,
because building either would quietly decide it for every author:

- **How transparent images are flattened** — what matte an alpha region gets (white, black, a
  blend, something else). Deciding this in advance decides what "the image" *is*.
- **How colour-blind legibility is treated**, if at all. Shipping a diagnostic in advance would make
  it a scoring axis nobody voted for.

If your paradigm has a view on either, that view is **part of your proposal** and will be judged as
such. If it does not, that is a fine answer too.

## 8. The blind arm

**One author receives §2 and §3 only** — the goals and the output contract. No corpus facts, no tool
catalog, no idea pile, no template line.

It is the control on this entire document. If the blind proposal's vocabulary, structure and
concerns turn out to look like the others', the briefing was not anchoring anyone; if it looks
materially different, this brief shaped the answers and we will know roughly how much.

**Stated plainly, because it is the weak point of the design:** this is **one arm**, so it produces
an anecdote, not a measurement. It is worth running anyway — the alternative is to anchor everyone
and never find out.
