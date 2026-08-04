# Phase 1 — the commissioning spec

**Written 2026-08-04 by the Phase 1 orchestrator, before any proposal exists.** That date carries
the same weight it carries in `PHASE_1_AUTHOR_BRIEF.md`: a roster, a seat assignment or a reading
rule invented after seeing the proposals would be indistinguishable from moving the goalposts.

This document decides the three things
`d-2026-08-04-phase-1-authors-receive-a-tool-catalog` explicitly left open — **how many authors
there are**, what framing each gets, and how the anti-anchoring rule is *enforced* rather than
merely requested. It does **not** decide how proposals are judged; that is Phase 2's entry
condition and is deliberately still open.

**Authority.** The reviewer (Flo) outranks every line here. Two items in §6 are flagged for them
rather than settled by me.

---

## 1. What is being commissioned

Six independent architecture proposals. **No code, in any arm.** Each author writes one document
and nothing else.

The phase succeeds if the six are *genuinely different paradigms*, not six variations with
different constants (`PHASE_1_AUTHOR_BRIEF.md` §1). Distinctness is the deliverable; quality is
Phase 2's question.

## 2. The roster

Each author is one fresh Opus subagent, launched in parallel, with no knowledge of the others'
output. Arms are named by letter, and the letter is the only identity a proposal carries until all
six have landed.

| arm | packet | seat |
|---|---|---|
| **A** | full | **One global objective.** The palette is chosen by optimising a single objective over the whole image at once. No staged pipeline, no sequential winners, no stage that eliminates candidates before a later stage sees them. |
| **B** | full | **Parse, then assign.** First produce a structural description of what the image is made of; then read the roles off that description. The structure is primary and the colour arithmetic is downstream of it. |
| **C** | full | **A portfolio and a selector.** Several small, independently legible methods, each strong on some kind of image, plus the machinery that decides which one spoke. The selector is allowed to be the only complex part. |
| **D** | full | **Pixels only.** No intermediate summary of the image stands between the pixel array and the published colours — no clustering into groups, no quantisation, no candidate-set stage. What that rules out precisely, and what computation replaces it, is the author's to work out. |
| **E** | full | **None.** No direction is given. E is the control on the seats: if E lands somewhere none of A–D would have reached, the seats cost us a paradigm; if it lands on top of one of them, the seats bought spread for free. |
| **F** | **blind** — §2 and §3 of the brief only | **None.** F is the control on the brief itself, per `PHASE_1_AUTHOR_BRIEF.md` §8. |

### 2.1 Round 2 — the primes, commissioned on the reviewer's direction

**Reviewer, 2026-08-04, after round 1 landed and a replication of arm B alone was proposed:**
*"if you're re-running B, we might as well re-run every other arm. It will give us more diversity
in the result, doubling our pool of ideas."*

So every arm runs a second time — `arm-a-prime` … `arm-f-prime` — twelve proposals in total. The
directive is about the idea pool, and it also buys a measurement nobody had commissioned: **whether
a seat determines its paradigm, or merely narrows it.** If A and A′ land on the same mechanism, the
seat did the work; if they diverge, the space inside that seat is wider than one proposal showed.
Round 1 already indicates the variance is large — E and B landed structurally adjacent from
completely different prompts — so identical prompts were expected to produce diversity on their
own.

**The primes are therefore prompt-identical to their originals, deliberately.** Varying the prompts
would have bought a little more spread at the cost of the replication read, and the spread was
coming anyway. **Three differences exist and are listed here rather than discovered later:**

1. **The packet's manifests are de-leaked.** Round 1's `packet/MANIFEST.json` disclosed withheld
   findings and the roster (§3.2). Round 2 runs against a packet verified clean against 73
   disclosure markers. This is the single most consequential difference and it is the one that
   makes B′ worth running at all.
2. **The confinement rule now names the proposals directory explicitly** — "not even to check your
   output path". Two round-1 arms tripped exactly there, both self-disclosing; the rule was
   ambiguous rather than the arms careless.
3. **Cost sections must state the pixel count being priced.** Round 1's six cost figures were not
   comparable — three arms named no image size at all, and the blind arm's estimate looked 2–4×
   worse than its peers only because it had priced a larger cover.

Fixes 2 and 3 repair defects round 1 exposed. They mean the primes are **not a pure replication**,
and any B-versus-B′ comparison must carry that caveat rather than attributing every difference to
the leak.

**One further change, for arm F′ only.** Round 1's blind packet lived at `phase-1/packet-blind/`,
which told arm F it was the blind arm before it opened a single file — a disclosure strictly worse
than the manifest note that was stripped for the same reason, because an author cannot avoid seeing
its own path. F′ reads from `phase-1/packet-two/`, a byte-identical copy under a name that says
nothing. F's own exposure is recorded as none and nothing already measured changes; the rename
protects the second control, and any future one.

### 2.2 Round 3 — E and F only, because the unseated arms are the diversity engine

**Reviewer, 2026-08-04, after round 2 landed:** *"let's run E and F again, they produced different
ideas, let's see if they can produce one more."*

Round 2 answered the seat question cleanly: **all four seated pairs reproduced their paradigm
family, and both unseated pairs diverged completely.** E went to component-tree persistence and E′
to a joint continuous figure–ground measure — E′ rejecting persistence by name, having never seen
E. F went to a robust affine field-plus-marks and F′ to the tree of shapes. Seats determine the
paradigm; the free framing generates new ones.

So round 3 re-runs **E and F alone**, prompts unchanged again. The reviewer's purpose is the idea
pool. The measurement it also produces is the one round 2 could not: **whether the free framing
keeps generating novel paradigms, or starts repeating.** Two divergences could be luck; a third
novel paradigm from each is a property of the framing, and a repeat is equally informative and
arrives just as cheaply. `arm-e-r3.md` and `arm-f-r3.md`.

**The confinement rule is tightened a third time**, and the history is worth stating because it is
the honest measure of what instruction-based confinement is worth. Round 1: two arms ran `ls` on
the proposals directory, both self-disclosing. Round 2 named that directory explicitly — *"not even
to check your output path"* — and one arm ran `ls -la` there anyway, **with the directory as its
working directory rather than as an argument**, then disclosed it. Round 3 closes that specific
form: *"and not as the working directory of any command you run"*.

Three rounds, three incidents, three self-disclosures, **zero content reads and zero undisclosed
breaches across fourteen author-runs.** The rule keeps failing at the edges and the culture keeps
catching it. That is the actual finding, and it should be read as a caution about confinement by
instruction rather than as reassurance: what makes this survivable is that agents report
themselves, which is not a property anyone can enforce.

**Seats are directions, not designs.** Each seat is stated above in full — one sentence, with no
justification attached, because the justification would be a failure analysis and authors do not
receive those (`PHASE_1_AUTHOR_BRIEF.md` §7). An author may reshape a seat and must say so if they
do; an author may not abandon it, because then the roster no longer covers the space.

**Authors are told that other seats exist and are not told what they are.** They are told not to
try to cover the whole space. Nothing else about the roster reaches an author.

**Why four seats plus two free arms.** The seats are the phase's insurance against the failure mode
the plan names: six authors reading one brief and independently writing the same clustering
pipeline. The free arms are the measurement of whether that insurance was needed. Both controls (E
and F) are single arms and therefore produce anecdotes, not measurements — the same honest
limitation `PHASE_1_AUTHOR_BRIEF.md` §8 states about the blind arm, and it applies to E for the
same reason.

## 3. The packet, and how the blind is enforced

**The anti-anchoring rule fails by default.** An Opus subagent with repository access will read the
field guide, the postmortems and `V3_PLAN.md` §3 within its first few tool calls, and the entire
design of Phase 1 collapses silently — nothing in the repo prevents it and no artifact afterwards
would record that it happened.

So the blind is **structural, not requested**:

1. A **packet directory** is built at `phase-1/packet/` before any author is launched, containing
   exactly what the brief says an author receives and nothing else — the brief itself, the
   normative sections of `PHASE_0_DECISIONS.md` it points to, and the READMEs the tool catalog
   names as authoritative. Extracts are **verbatim**, each carrying a provenance header naming its
   source file and section.
2. A **blind packet** at `phase-1/packet-blind/` contains §2 and §3 of the brief only (§3.1
   included — it is a subsection of §3 and is the constraint sheet the output contract needs).
3. Every author is confined to their packet directory by instruction: **read nothing outside it,
   search nothing, and do not open any file the packet does not contain.** Authors are told the
   reason — that they are the experiment and reading around it silently voids their own arm.
4. A `MANIFEST.json` records every packet file with its sha256, so what each arm actually received
   is recoverable after the fact rather than reconstructed from memory.

Confinement by instruction is weaker than a sandbox and this document should not pretend
otherwise: it is auditable after the fact (the manifest plus the author's own tool calls) but it is
not prevented. That is the honest state of the enforcement.

**General knowledge is not anchoring.** Authors may use everything they know about colour science,
image processing and optimisation. The blind is on *this campaign's conclusions*, not on the field.

### 3.1 What the packet became, and why it is smaller than §5 of the brief promises

**The first build measured the hole, and the hole was most of the wall.** Every packet file was
flagged for whether it states what this campaign *found*, and **10 of 11 came back true**. The
brief's §7 promises authors do not receive the instruments' conclusions, while its §5 points those
same authors at READMEs that state them. Both cannot hold.

The trim resolves it toward §7, on two grounds. First, the governing record
(`d-2026-08-04-phase-1-authors-receive-a-tool-catalog`) says authors receive "a catalog of every
instrument that exists — **one line each**". The catalog *is* §5's table; it was never a promise of
the campaign's document library, so trimming moves the packet **closer** to the record. Second, the
asymmetry: a leaky packet that turns out wrong voids the arms unrecoverably, because an author
cannot unread a conclusion, while a trimmed packet that turns out wrong is repaired by handing the
document over. **The trim is the recoverable error.**

What changed, and the reasoning that is *not* symmetric across the four:

- **`PHASE_0_DECISIONS.md` cut to §§1–6.** Pure faithfulness repair. The brief's §3 table makes
  §§1–5 normative and its §6 is cited for what the oracle's labels are; **§7, §7.1 and §8 were
  never promised to an author**, and §7's measured resolution floors and §8's open-items ledger are
  conclusions. The whole-file copy was the orchestrator's instruction and it overshot.
- **Four documents replaced by stubs** — `REVIEW_UI.md`, `src/review-server/README.md`,
  `ORACLE_QUESTION_SET.md`, `ALBUM_ARTWORK_SEMANTIC_ORACLE_PIPELINE.md`. Each stub quotes the
  document's own §5 catalog row verbatim, states plainly that the document is withheld and why, and
  **invites the author to name what they needed**. The two review-channel documents cost the phase
  close to nothing: that instrument is how a proposal is *judged*, not something a proposal designs
  against. The oracle documents are a real cost and the stubs say so.
- **Seven flagged files kept anyway**, and the asymmetry is deliberate rather than an oversight.
  The incumbent's figures in the robustness and honesty READMEs (72.8%, the 114 dithered palettes,
  ~900 sites against 11 anchors, 1.61×) are **already in the brief's §2 verbatim and on purpose** —
  §2 says outright they "are here because they define the target, not as a diagnosis of what went
  wrong". Re-reading them in a README tells an author nothing §2 did not. Removing them would be
  theatre.
- **`ORACLE_QUESTION_INVENTORY.md` built**, restoring what the oracle stub over-removed: 28
  question ids with their full wording and closed vocabularies, 4 listed by id alone, and every
  accuracy, κ, agreement rate, variant comparison, replication verdict and reliability grade
  stripped. The distinction it honours is the brief's own — **what an instrument measures is on the
  author's side of the line; what it found is not.** The whole "decision it feeds" column was cut
  rather than filtered cell by cell, which costs the ~10 clean cells; that is the single most
  judgment-laden call in the packet and it is recorded as such.
- **`PERCEPTION_VERDICT.md` added to the full packet only.** §3.1 of the brief names it "Canonical
  text" for open question 3, and a dead pointer in a normative section is worse than the material
  it withholds. It was **also added to the blind packet and then removed**: at 25,809 bytes against
  a 16,525-byte extract it would have made arm F's packet **61% one perception-round document**,
  and a control that is mostly a single campaign artifact measures that artifact. `Canonical text:`
  is a provenance citation, not a reading instruction, and §3.1 is self-contained on the question.

**A confinement hazard the trim exposed rather than created.** That file cites five live paths
outside the packet (`data/calibration/`, `data/decisions/`, `data/contract/`). Arms A–E receive it,
and confinement is by instruction. The citations are left in place — the body is verbatim — and the
hazard is answered twice over: in the file's own provenance header, and by name in every author's
launch instruction.

**The seam this opens, stated because it is the orchestrator's to hold.** Four stubs promise that a
request will be "adjudicated", and nothing in the packet says by whom or how fast. Authors run in
one pass and cannot wait for an answer, so each launch instruction tells them to name the gap,
**state the assumption they proceeded under, and keep writing**. An author who names a gap is
signal about whether the trim cost anything; an author who silently designs around one is not.

## 4. What each author returns

One markdown document at `phase-1/proposals/arm-<letter>.md`, roughly 1,500–4,000 words. Longer is
not better; a proposal that cannot state its paradigm in its first paragraph has not found it yet.

Required content, taken from `PHASE_1_AUTHOR_BRIEF.md` §1 and §6 rather than invented here:

- **The paradigm**, stated in the opening paragraph, in a form someone could disagree with.
- **Image to contract** — how the approach gets from one cold image file to the four roles, the
  gradient boolean and the stops.
- **Where the decisions live** — which parts of the design are making judgment calls, and where.
- **Free parameters** — how many independent decisions the *paradigm* needs a human to make, and
  what would anchor each. Not a count of literals. This is success criterion 2 and it is measured
  in Phase 3.
- **Cost** — an honest per-file estimate for a cold run, with an argument proportionate to where it
  lands in the bracket the brief's §3.1 describes.
- **Build cost** — what it would take to prototype far enough to emit real palettes.
- **Expected failures and falsifier** (template line, §6 — no arm is rejected for omitting it).
- **Exposable intermediate work** (template line — see §5 below).

## 5. The amendment to the brief

`PHASE_1_HANDOFF.md` §2 requires that "each proposal states what intermediate work it could expose
(weak form — a template line)". **`PHASE_1_AUTHOR_BRIEF.md` did not contain that line** — verified
2026-08-04 by search before any author was launched. It is added to §6 as a second template line,
in the same weak form as the first: answered if useful, no arm rejected for omitting it, nothing
enforcing it.

It earns its place because Phase 2 judges *trajectory and ceiling* rather than first-round scores
(`V3_PLAN.md` §6), and a paradigm that can show its working mid-computation is a paradigm whose
trajectory can be read early. A paradigm that exposes nothing but a final palette can only ever be
judged on the palette.

The amendment lands **before any author is launched**, which is the only property that makes it
legitimate. It is recorded in the decision ledger with that timing stated.

## 6. Two items for the reviewer — neither blocks the phase

**(a) There is no incumbent arm, and there structurally cannot be one.** `V3_PLAN.md` §4 lists
"v2-3's evidence pipeline, rebuilt clean" as a legitimate fifth candidate that "competes on equal
footing". No author can write it: doing so requires the field guide and the failure analyses, which
are exactly what §7 of the brief withholds. So the bake-off as commissioned has **no baseline
paradigm derived from what the previous system learned**. Three ways out, none taken here: leave it
out (Phase 3 brings the guide back as the winner's audit checklist anyway); commission it after the
six land, as a deliberately-anchored seventh arm that is marked as such; or drop it entirely as a
recorded decision. **This is the reviewer's call and it can be made any time before Phase 2.**

**(b) The challenger counter's trigger could never have fired, and the run that proved it is done.**
`PHASE_1_HANDOFF.md` §5(b) says to read `data/contract/challenger-disagreements.json` before
commissioning anything, and to wait for "a real corpus run" to populate it. Read 2026-08-04:
`totals: []`, `entries: []`.

**The stated reason for that emptiness was wrong.** The accumulation was never wired — the ledger's
`accumulate`/`saveLedger` had no caller anywhere outside their own test file — and challengers are
not evaluated at all unless an observation sink is passed, because `observe?.({…})` short-circuits
its whole argument list. No corpus run could ever have populated that file. Waiting on the trigger
as written would have waited forever. Recorded as
`d-2026-08-04-challenger-accumulation-was-never-wired`, which corrects the same wrong verb in three
places: handoff §5(b), clause (3) of `d-2026-08-04-perception-4-package-signed-off`, and `B42`.

The run went ahead over the legacy fixtures — real palettes over real artwork — with its
price-the-round thresholds **pre-registered and committed before any data was seen**. Result:
**0 disagreements across 2,857 judged pairs** over 492 distinct palettes (the familiar "554" is
fixture entries, not palettes), and the pre-registered rule mechanically returns **keep the
deferred round deferred**.

**The verdict is right and its usual reading is not available.** The pre-registration's low-rate
branch reads "the frozen scalar does no harm where it actually gets used"; this run does **not**
establish that. The zero comes from the population rather than the bar — the closest judged pair in
the whole corpus sits at 1.30× its regional bar, only one pair is under 2×, and there is
essentially no mass in the band where the frozen and direction-aware rules can differ at all. A
positive control fired 1/6 through the identical code path, so the instrument counts. The trigger
is therefore **re-armed, not spent**, and firing it again on the first genuine v3 corpus run
requires a **deliberate runner invocation** — the counter still does not populate itself.

Two limits found in passing: `ChallengerTally` carries `disagreedByRegion` but no
`judgedByRegion`, so a per-region *rate* is not computable from the ledger alone (`B44`); and
`dark-neutral`, the only region either challenger bar was ever measured in, carries **4.2%** of the
judged exposure here.

## 7. What this document does not decide

How proposals are judged; which 2–3 go to Phase 2; what the blind arm is compared against and by
whom; whether the seats worked. All of those are answered *after* the six land, and answering any
of them now would be the same goalpost move this document exists to avoid.
