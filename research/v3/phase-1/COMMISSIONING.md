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

**(b) The challenger counter's trigger has not fired, and one cheap run would fire it.**
`PHASE_1_HANDOFF.md` §5(b) says to read `data/contract/challenger-disagreements.json` before
commissioning anything. Read 2026-08-04: `totals: []`, `entries: []` — **empty**, because no
palette run has ever exercised the pair invariants. The counter is not waiting on a v3 pipeline,
though: the 554 legacy palettes in `data/legacy/` are real palettes over real artwork, and
validating them would populate it today. That run is commissioned here as authoring-slack work,
with its price-the-round threshold **pre-registered before the run** per the project's standing
rule, and with the honest scope label it needs — a legacy-fixture run is not a v3-pipeline run, and
both challenger bars were measured in `dark-neutral` alone, so `disagreedByRegion` is read before
any total is quoted.

## 7. What this document does not decide

How proposals are judged; which 2–3 go to Phase 2; what the blind arm is compared against and by
whom; whether the seats worked. All of those are answered *after* the six land, and answering any
of them now would be the same goalpost move this document exists to avoid.
