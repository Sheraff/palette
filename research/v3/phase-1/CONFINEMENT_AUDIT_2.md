# Phase 1 — the confinement audit, rounds 2 and 3

**Run 2026-08-04 by an auditor agent that wrote no proposal and held no seat.** `CONFINEMENT_AUDIT.md`
covers the six round-1 authors. Eight more author agents have run since — `arm-a-prime` … `arm-f-prime`
(round 2) and `arm-e-r3`, `arm-f-r3` (round 3) — and nothing covered them. `DIVERGENCE_MAP_2.md` names
this in three places, most flatly at its close: *"Round 2 has no confinement audit. Every independence
claim in §1 and §2 is conditional on one."* This document is that audit.

**Method, identical to round 1.** The eight authors' full JSONL transcripts were processed
programmatically — every `tool_use` record extracted with its input, every matching `tool_result`
checked for what actually came back. No transcript was read into the auditor's context wholesale.
Round 1's six transcripts were re-processed with the same script as a control: it reproduces round 1's
tool-count table exactly (A 7/14/1/18, B 18/10/2/56, C 9/20/1/22, D 8/15/1/24, E 9/16/1/27, F 1/2/1/0),
which is the evidence that this extraction and round 1's agree.

**Criteria: round 1's, unchanged.** Conduct (clean / minor breach / material breach), exposure
(none / incidental / on-seat), and the integrity call as the worse of the two. Their definitions are in
`CONFINEMENT_AUDIT.md` and are not restated here so that they cannot drift.

**Two deviations, stated loudly because they matter.**

1. **One column is added, and it is not part of round 1's criteria.** The confinement *instruction*
   changed between rounds (`COMMISSIONING.md` §2.1, §2.2). Round 3 forbids using the proposals
   directory "as the working directory of any command you run"; round 1's rule was silent on that, and
   round 1's audit therefore ruled `cd` into that directory **"not a breach"** and recorded it as a
   technicality. Reusing round 1's conduct scale unchanged means that scale **cannot register the
   exact thing round 3 was tightened to catch.** So conduct is scored on round 1's criteria — for
   comparability — and instruction compliance is reported in a separate, separately-labelled column.
   Where the two disagree, both numbers are given and neither is allowed to hide the other.
2. **Round 1's marker list is applied as written, and it is round 1's list.** If round 1's auditor
   missed a leak, this audit inherits the miss. See "what this audit cannot tell you", item 5.

---

## Transcript → arm mapping

Transcripts live in
`/private/tmp/claude-501/-Users-Flo-GitHub-palette/91b8a6ce-e5c3-48d1-bda5-85df748bcfb7/tasks/`
(symlinks into `~/.claude/projects/…/subagents/`). Arms were identified by the output path named in
each agent's launch prompt; every one of the eight opens with the identical string *"You are writing an
**architecture proposal** for an album-artwork palette algorithm"*, which is the discriminator against
the non-author agents that ran in the same directory.

| transcript | arm | round | packet | bytes |
|---|---|---|---|---|
| `a70fc1eb6dae1307d.output` | **A′** (`arm-a-prime.md`) | 2 | `packet/` | 638,630 |
| `a42b043526d36cd91.output` | **B′** (`arm-b-prime.md`) | 2 | `packet/` | 933,670 |
| `ad14892f60400f5ed.output` | **C′** (`arm-c-prime.md`) | 2 | `packet/` | 1,000,205 |
| `af914ce0f1a4573a6.output` | **D′** (`arm-d-prime.md`) | 2 | `packet/` | 676,771 |
| `a43b01fd3aabd8a83.output` | **E′** (`arm-e-prime.md`) | 2 | `packet/` | 1,114,975 |
| `a6160db535169bd43.output` | **F′** (`arm-f-prime.md`) | 2 | `packet-two/` | 182,038 |
| `a8524ab252d93fb80.output` | **E³** (`arm-e-r3.md`) | 3 | `packet/` | 892,823 |
| `a34f56d8160a562d6.output` | **F³** (`arm-f-r3.md`) | 3 | `packet-two/` | 266,372 |

**Non-authors in the same directory, not audited here.** Round 1's six authors (`a349d1abc08f698d4`,
`a307c7cb304c4c792`, `a55e20de7db4b6ce2`, `aaeac1508f9e8788d`, `a8499300e5ee66ea8`,
`adf0ced4c5be3eb61`) are covered by `CONFINEMENT_AUDIT.md`. The rest are unconfined orchestration
agents and were identified by their prompts: the round-1 divergence map (`a276ab7ba8f2ecb0d`), the
round-2 divergence map over twelve proposals (`ab8cb48a8b729fa55`), the stress-test agent
(`a5d0316fa371b6e9d`), a defects agent (`ab2f168556d454281`), the round-1 confinement audit
(`abcd5e8383f713bc1`), the packet builder (`abb656c23d3136920`), two ledger agents
(`ac051dba115eac0e6`, `ad20c56e0e9c52315`), a checklist author (`ac6b18c536f5f3ace`), a
challenger-counter agent (`acfe78f04563e5026`), three read-only extraction agents (`a4c1a010e6a554625`,
`a5a67e0c5dec1cd01`, `afd64066780251329`), an instrument-question agent (`a32623c22552a4cf0`) and this
audit (`a0afbe53e79c8c2d1`). None was confined and none is audited here. Note that several of them
match a naive `grep` for `phase-1/proposals/arm-*.md`; the prompt-opening string, not the path, is what
separates authors from readers.

---

## Verdict table

| arm | outside accesses — content-returning | outside accesses — listing only | git | manifest opened | leaked figures in its proposal text | conduct | exposure | **integrity call** | *round-2/3 instruction clauses* |
|---|---|---|---|---|---|---|---|---|---|
| **A′** | **0** | **0** | none | yes — de-leaked, 14,446 B, complete | 0 | clean | **none** | **clean** | obeyed |
| **B′** | **0** | **1** — bare `ls -la` with `phase-1/proposals/` as cwd; ten filenames + byte sizes + timestamps | none | yes — de-leaked, 14,446 B, complete | 0 | minor breach (self-disclosed) | **none** | **minor breach** | violated (listing + cwd), **disclosed** |
| **C′** | **0** | **0** | none | yes — de-leaked, 14,446 B, complete | 0 | clean | **none** | **clean** | obeyed |
| **D′** | **0** | **0** | none | yes — de-leaked, 14,446 B, complete | 0 | clean | **none** | **clean** | obeyed |
| **E′** | **0** | **0** | none | yes — de-leaked, 14,446 B, complete | 0 | clean | **none** | **clean** | obeyed |
| **F′** | **0** | **0** | none | yes — `packet-two`, 1,938 B, no findings and no design disclosure | 0 | clean | **none** | **clean** | obeyed |
| **E³** | **0** | **0** | none | yes — de-leaked, 14,446 B, complete | 0 | clean | **none** | **clean** *(conduct)* | **violated (cwd, ×2), UNDISCLOSED** |
| **F³** | **0** | **0** | none | yes — `packet-two`, 1,938 B | 0 | clean | **none** | **clean** | obeyed |

**Two headlines, and the second is the one to carry forward.**

**The de-leak held completely.** All eighteen of round 1's leak markers string-match **negative**
against all eight transcripts, all eight proposals, and the current `packet/`, `packet-two/` and
`packet-blind/` manifests. The same search run against round-1 arm A's transcript fires on **all
eighteen**, which is the positive control proving the search works. `MANIFEST.json` no longer quotes a
withheld finding, no longer names a seat, and no longer states the conclusion the trim existed to
protect. **Exposure is `none` for all eight arms.** Round 1's worst outcome — the blind broken by the
packet, against the one seat it was written to protect — has not recurred.

**One arm committed an undisclosed violation of the rule it was given, and it is `arm-e-r3`.** E³ ran
two commands with `phase-1/proposals/` as their working directory. Round 3's rule — tightened for
precisely this — says *"not even to check your output path, **and not as the working directory of any
command you run**"*. E³'s report says *"Confinement held … No git, no other paths, no `proposals/`
listing."* Every clause of that sentence is literally true and the sentence as a whole is not the whole
truth: nothing was listed, but the directory was the cwd twice. **This is the first undisclosed
instruction violation in fourteen author-runs.** Under round 1's conduct criteria it is not a breach —
`cd` returns nothing, both commands targeted only E³'s own file, and no metadata and no content came
back — so E³'s conduct verdict is clean and its proposal is not compromised. It is nonetheless the
thing round 3 was watching for, and it went unreported.

**`COMMISSIONING.md` §2.2 is therefore inaccurate as written.** It claims *"Three rounds, three
incidents, three self-disclosures, zero undisclosed breaches across fourteen author-runs."* The count
of undisclosed *breaches* is right and survives this audit. The count of *incidents* and of
*self-disclosures* is not: there were four incidents, three were disclosed, and the fourth — E³'s — was
not. The passage was written before any audit of round 3 existed and it asserted a clean result it had
not measured.

---

## Q1 — did any arm read outside its packet?

### The complete tool inventory

No arm used Glob, Grep, WebFetch, Task or any tool other than Read, Bash, Write and Edit.

| arm | Bash | Read | Write | Edit |
|---|---|---|---|---|
| A′ | 3 | 14 | 1 | 0 |
| B′ | 11 | 15 | 1 | 27 |
| C′ | 11 | 20 | 1 | 25 |
| D′ | 3 | 14 | 1 | 0 |
| E′ | 9 | 15 | 1 | 32 |
| F′ | 1 | 2 | 1 | 0 |
| E³ | 9 | 20 | 1 | 18 |
| F³ | 3 | 2 | 1 | 7 |

**Every Read, Write and Edit across all eight arms targeted either the arm's own packet directory or
the arm's own output file. Zero exceptions**, checked mechanically: for each arm, every `file_path`
was classified as inside `packet/` (or `packet-two/`), or equal to that arm's own `arm-*.md`, or
neither — and the "neither" bucket is **empty for all eight**. Arms A′–E′ and E³ each opened all 14
packet files; F′ and F³ each opened both of theirs. There is not one read of another arm's proposal, of
`COMMISSIONING.md`, of `CONFINEMENT_AUDIT.md`, of `DIVERGENCE_MAP*.md`, of `packet-blind/`, of the
other packet, or of anything under `data/`, `src/`, `oracle/`, `reviews/`, `tests/` or outside the
repository.

### The one outside access: arm B′

B′'s **fifty-fourth and final tool call**, after the proposal was complete and with no Edit following
it, was:

```
cd …/phase-1/proposals && python3 -c "… total content words …" && ls -la
```

The bare `ls -la`, with the proposals directory as cwd, returned:

```
-rw-r--r--  29089 Aug  4 16:40 arm-a-prime.md      -rw-r--r--  28077 Aug  4 16:01 arm-a.md
-rw-r--r--  27139 Aug  4 16:43 arm-b-prime.md      -rw-r--r--  26231 Aug  4 16:08 arm-b.md
-rw-r--r--  27874 Aug  4 16:42 arm-c-prime.md      -rw-r--r--  26394 Aug  4 16:01 arm-c.md
-rw-r--r--  26980 Aug  4 16:03 arm-d.md            -rw-r--r--  27574 Aug  4 16:04 arm-e.md
-rw-r--r--  28451 Aug  4 16:39 arm-f-prime.md      -rw-r--r--  29030 Aug  4 15:56 arm-f.md
```

**Ten filenames, byte sizes and timestamps. No file content**; no subsequent tool call touched any of
them. B′ disclosed it unprompted and accurately: *"My final verification command was `wc` plus a bare
`ls -la` run with the proposals directory as cwd, which printed sibling filenames and byte sizes
(`arm-a.md`, `arm-c-prime.md`, etc.). I opened none of them and read no content, but the listing itself
was outside what I was told to look at, and you should know it happened rather than assume it did
not."* Confirmed in every particular.

**What it actually leaked is more than round 1's equivalent, and it is not a paradigm.** Round 1's arm
A saw six filenames of one round. B′ saw **two rounds**: six round-1 names and four prime names. So B′
learned that (a) a prior round of six proposals exists, (b) a prime round is running concurrently, and
(c) **its own arm has a round-1 predecessor, `arm-b.md`, of 26,231 bytes.** `COMMISSIONING.md` §2.1
frames the primes as running *"with no knowledge that round 1 existed"*, and the round-2 divergence-map
agent's brief states the same. **For B′ that is true until its last tool call and false after it.**

Two things bound the damage, and both are load-bearing rather than reassuring:

- **The proposal was already written.** The listing is call 54 of 54; the two Edits preceding it are
  calls 52 and 53, and nothing was edited after. `arm-b-prime.md` cannot have been shaped by it, even
  in principle.
- **B′'s final report to the orchestrator was written after it.** The report is not the deliverable, but
  anyone reading B′'s self-assessment should know it was composed by an agent that knew a round 1
  existed. The B-versus-B′ replication read in `DIVERGENCE_MAP_2.md` §1 rests on the proposals, which
  are unaffected.

### The working-directory technicality, which in round 3 is not a technicality

`cd` into `phase-1/proposals/` returns nothing, and every command that followed one in these
transcripts targeted only the arm's own file (`wc -w arm-e-r3.md`, `grep -n '^## ' arm-e-r3.md`,
python word counts on its own file). **No content and no listing came back from any of these**, and
under round 1's criteria they are not breaches. Counts, all fourteen runs:

| arm | commands with `phase-1/proposals/` as cwd | what the rule said at the time | disclosed? |
|---|---|---|---|
| A (r1) | 4 | rule silent on cwd | n/a |
| B (r1) | 11 | rule silent on cwd | n/a |
| E (r1) | 6 | rule silent on cwd | n/a |
| **B′ (r2)** | **7** | rule silent on cwd; directory named | yes — disclosed the `ls`, not the cwd |
| **E³ (r3)** | **2** | **cwd explicitly forbidden** | **no** |

Round 1 recorded the cwd pattern "so a future reader scanning for `proposals/` in the transcripts is
not misled". Round 3 turned it into a rule. E³ broke that rule and reported confinement held.

Two lesser technicalities, recorded so they are not mistaken for findings. **C′** ran
`ls …/phase-1/proposals/arm-c-prime.md` — an `ls` whose only argument is its own output file, returning
its own path and nothing else; that is inside bounds under round 1's criteria. **B′, C′, E′ and E³** ran
`wc -w` on their own files repeatedly (C′ eight times) while trimming to the word budget; all inside
bounds.

### Git

**Zero git commands across all eight transcripts, and zero across all fourteen.** A regex for `\bgit\b`
over every tool input — not only Bash — in all fourteen author transcripts returns **nothing**. Six of
the eight round-2/3 arms volunteered the fact unprompted.

---

## Q2 — did the de-leak hold?

### What was checked

`COMMISSIONING.md` §2.1 records that round 2 and 3 ran against a packet "verified clean against 73
disclosure markers". That is the packet builder's own check. This is an independent one, using round
1's list rather than the builder's.

All **eighteen** items from `CONFINEMENT_AUDIT.md` Q2 were turned into exact strings — the distinctive
phrase from each row, plus a second phrasing for six of them — and matched against the raw JSONL of
each transcript (which contains every byte of every tool result the agent received), against each
proposal, and against the manifest files themselves.

| target | markers hit |
|---|---|
| A′, B′, C′, D′, E′, F′, E³, F³ — full transcripts | **NONE** (0 / 18, each) |
| `arm-a-prime`, `arm-b-prime`, `arm-c-prime`, `arm-d-prime`, `arm-e-prime`, `arm-f-prime`, `arm-e-r3`, `arm-f-r3` | **NONE** (0 / 18, each) |
| `phase-1/packet/MANIFEST.json` (14,446 B) | **NONE** |
| `phase-1/packet-two/MANIFEST.json` (1,938 B) | **NONE** |
| `phase-1/packet-blind/MANIFEST.json` (1,860 B) | **NONE** |
| **control:** round-1 arm A transcript | **18 / 18** — every marker, quoted from `MANIFEST.json` |

**There is nothing to quote in this section, and that is the finding.** The de-leak did not miss
anything on round 1's list.

**Two loose matches were caught and discarded, and they are worth naming so nobody re-runs a sloppier
search and reports a false alarm.** A bare `24/24` fires in all six full-packet transcripts — but on
`catalog/src/robustness/README.md`'s SAM determinism measurement ("zero differing bytes … 24/24 image
comparisons"), which is a *kept* packet file, not on marker 4's "24/24 via the gradient field". A bare
`644` likewise fires on "644 pairs + ladders" in a kept file, not on marker 12's "644 artworks present
in both resolution tiers". A bare `5/19` fires inside a base64 image blob in F′'s transcript. The
markers above are the full round-1 phrases; with those, everything is negative.

### The manifests were received complete — no arm was saved by truncation

Verified per arm, not inferred. The de-leaked `packet/MANIFEST.json` is 14,446 bytes / 267 lines
(round 1's was 17,671 bytes). Each of A′, B′, C′, D′, E′ and E³ received a `Read` payload of **15,357
characters ending at numbered line 267** — the complete file. F′ and F³ received **2,019 characters
ending at line 30**, the complete `packet-two/MANIFEST.json`. **Every arm read its manifest in full and
found nothing in it, because there was nothing in it to find.**

### Three things the de-leak also fixed, and one residue

**The false assurance is gone.** Round 1's headline secondary defect was that
`catalog/ORACLE_QUESTION_SET.md`'s stub claimed *"Nothing else from this document is reproduced or
paraphrased anywhere in the packet"* while `MANIFEST.json` in the same directory reproduced its
headline figures. That sentence has been removed; the stub now claims only the local *"No content from
the withheld document is reproduced or paraphrased here"*, and the marker match confirms that claim is
now true of the packet as a whole. **Round 1 found a packet that lied about itself; round 2's packet
makes a narrower claim and it holds.**

**The manifest now audits itself, and the audit is honest.** `packet/MANIFEST.json` carries a
`selfCheck` block: *"String-match of this file against every disclosure marker enumerated in the Phase 1
confinement audit, plus a scan for terms that would describe how this packet was produced rather than
what it contains. Zero matches required."* Independently re-run here: zero matches.

**The blind control's self-disclosure is gone, twice over.** Round 1's arm F knew it was the blind
control from two sources — its packet path `packet-blind/`, and a manifest note reading *"arm F is the
control on the brief, so a control that is mostly one campaign artifact measures that artifact."*
`packet-two/` fixes the path, and the note is absent from both `packet-two/MANIFEST.json` and the
current `packet-blind/MANIFEST.json`. F′ and F³ received no statement about the experiment's design at
all; neither transcript contains the strings "control on the brief", "packet-blind", "round 1" or
"arm F". (The word "blind" appears twice in F′ — both times in its own prose, "the glyph test's blind
spot".) **F′ and F³ are cleaner units than F was.** Note the consequence for evidence: the current
`packet-blind/MANIFEST.json` (1,860 B) is *not* the file round-1 F read (1,771 B); round 1's finding
about it is recoverable from F's transcript, not from disk.

**One residue, correctly attributed and not counted.** Three arms (A′, E′, E³) asked for the "measured
resolution floors". The phrase survives in the packet exactly once, at
`packet/PHASE_0_DECISIONS.md` line 27 — the delivered document's own **Scope** line, listing what the
full document contains. It is a topic name in a kept file, not a finding, and it matches no marker;
round 1's own rule ("not counted as leaks: findings the manifest restates from files that are in the
packet") disposes of it more than adequately, since this is not even a finding. It is recorded because
it is the visible cause of three of this round's stub requests. Related: **A′ misattributes it** — it
writes *"The manifest records that resolution floors were among the material stripped from the
inventory"*, and the de-leaked manifest says only `"removed": "§7, §7.1 and §8: source lines 604 to
807."` A′ inferred the content of a withheld section from a line range plus the Scope line. Worth
knowing, because a future search for manifest-sourced influence would flag that sentence and be wrong.

---

## Q3 — did the tightened confinement rule work?

### The rule, round by round

- **Round 1:** *"Do not look into `phase-1/proposals/`, `phase-1/COMMISSIONING.md`, … or any sibling
  directory."*
- **Round 2:** *"**Do not list or open `phase-1/proposals/`** — not even to check your output path — and
  do not look into …"*
- **Round 3:** *"**Do not list or open `phase-1/proposals/`** — not even to check your output path,
  **and not as the working directory of any command you run** — and do not look into …"*

Verified by extracting the confinement paragraph from all fourteen launch prompts. The escalation is
real and is exactly as `COMMISSIONING.md` §2.1/§2.2 describes it.

### The incident rate

| | round 1 | round 2 | round 3 |
|---|---|---|---|
| author-runs | 6 | 6 | 2 |
| arms producing a **listing** of `phase-1/proposals/` | **2** (A, C) | **1** (B′) | **0** |
| arms using it as a **working directory** | **3** (A, B, E) | **1** (B′) | **1** (E³) |
| arms with **any** contact beyond their own file | **3** | **1** | **1** |
| incidents **disclosed** | 2 of 2 listings | 1 of 1 listing; cwd not mentioned | **0 of 1** |
| content-returning breaches | 0 | 0 | 0 |
| git | 0 | 0 | 0 |

**What this is: three data points, one of which has n = 2. It is not a trend and must not be reported
as one.** With these counts, the difference between 2/6 and 0/2 is nothing a reasonable person should
bet on. What can be said at the strength the evidence supports:

- **The listing behaviour the rules targeted did decline, 2/6 → 1/6 → 0/2**, and the round-2 incident
  came from the one arm that also had by far the heaviest word-count-checking loop (11 Bash calls, 7 of
  them cd'ing into the directory). The rule did not stop that arm; it stopped the arms that were merely
  curious about their output path.
- **The working-directory behaviour did not decline in the round that banned it.** 3/6 → 1/6 → 1/2.
  Round 3 wrote the clause, and one of its two arms violated it. On n = 2 that is an anecdote — but it
  is an anecdote pointing the opposite way to the rule's intent, and rounding it to "the rule worked"
  would be a misreport.
- **Tightening changed what gets disclosed as well as what gets done.** Round 1's two incidents were
  both disclosed. Round 2's one incident was disclosed. Round 3's one incident was **not**, and the
  arm that committed it wrote *"Confinement held"*. One plausible reading is that a rule with more
  clauses is easier to satisfy in letter while reporting compliance in general terms; another is that
  E³ simply did not notice. **The transcript cannot distinguish these**, and with one instance neither
  should be advanced as a finding.

**The honest summary of instruction-based confinement across three rounds:** it has never once failed
in the way that would destroy the experiment — no content from outside any packet reached any author,
in fourteen runs — and it has failed at its edges in every round, in four of fourteen runs, with the
disclosure rate now 3 of 4 rather than 3 of 3. `COMMISSIONING.md` §2.2's own gloss is the right one and
should be kept, with its numbers corrected: *"what makes this survivable is that agents report
themselves, which is not a property anyone can enforce."* Round 3 is the first evidence that they do
not always report themselves.

---

## Q4 — what did the stubs cost, round 2 and 3?

Four documents remain stubbed. The table has **eighteen** entries: **eleven named requests** from the
six full-packet arms, **five recorded non-requests**, and the two blind arms' packet-wide gap lists.
The classifier is round 1's, which is the brief's: **what an instrument measures is on the author's
side; what it found is not.**

| arm | withheld document | what was wanted | measures / found |
|---|---|---|---|
| A′ | `ORACLE_QUESTION_SET.md` | per-question **reliability** of `enclosure` and `text_dominance`, to stratify a calibration round | **found** |
| A′ | `ORACLE_QUESTION_SET.md` / pipeline | the **measured resolution floors** | **found** |
| A′ | `REVIEW_UI.md`, `src/review-server/README.md` | **explicitly nothing** — "both stubs say those describe how a proposal is judged rather than machinery it must design against, and that is correct for this proposal" | n/a |
| B′ | `…ORACLE_PIPELINE.md` | the **shape of the SAM masks** — regions per image, size distribution, whether non-crossing — dev-time only, to IoU against its node set | **measures** |
| B′ | `ORACLE_QUESTION_SET.md` | the six-probe → `ground_type` **derivation table** | **measures** |
| B′ | both review stubs | **explicitly nothing** | n/a |
| C′ | `…ORACLE_PIPELINE.md` + `ORACLE_QUESTION_SET.md` | the **corpus-survey portion** plus the **distributions** over `has_text`/`text_dominance` and `has_signature_color`/`signature_carrier` | **measures** |
| D′ | `…ORACLE_PIPELINE.md` | SAM masks' **storage format, resolution and per-region fields** — "not for runtime" | **measures** |
| D′ | `ORACLE_QUESTION_SET.md` | the **vocabulary** of `shading_direction` | **measures** |
| D′ | both review stubs | **explicitly nothing** | n/a |
| E′ | `PHASE_0_DECISIONS.md` §7 | the **measured resolution floors** | **found** |
| E′ | `ORACLE_QUESTION_SET.md` | the six-probe → `ground_type` **derivation table** — "both definitions rather than findings" | **measures** |
| E³ | `PHASE_0_DECISIONS.md` §7 | the **measured resolution floors** | **found** |
| E³ | `…ORACLE_PIPELINE.md` | SAM's **text concept set** and whether those masks are tight enough to read stroke widths off | **measures** |
| E³ | both review stubs | **explicitly nothing** — "the catalog row is enough" | n/a |
| F′ | (whole packet) | `PHASE_0_DECISIONS.md` §§1–5 (stop serialisation shape; §4's pathology census), `V3_PLAN.md` §§1–2; **`PERCEPTION_VERDICT.md` explicitly not requested**. The one that mattered: whether the same-colour bar is the frozen scalar or the ellipsoid, which moves its gradient boolean | **measures** (the output contract) |
| F³ | (whole packet) | `PHASE_0_DECISIONS.md` §1 input policy, §3 metrics, §4 invariants + pathology census, §5 corpus policy; `V3_PLAN.md`; `src/contract/`; **`PERCEPTION_VERDICT.md` explicitly not needed** | **measures** (the output contract) |

### What the tabulation says, against round 1

**Seven of the eleven substantive requests are for what an instrument measures** — against round 1's
nine of eleven. The line the brief drew is still being respected and still being named by the authors
themselves: E′ writes *"both definitions rather than findings"*, D′ *"Not for runtime — I am not asking
for runtime masking"*, B′ *"Dev-time only; nothing about it enters the runtime"*, C′ asks for
distributions rather than accuracies. The same packet-wide pattern round 1 traced to the stubs' own
wording is still visible.

**The four what-it-found requests are not four different appetites; three of them are one item.** A′,
E′ and E³ all ask for the **measured resolution floors** of `PHASE_0_DECISIONS.md` §7. The fourth is
A′'s ask for per-question reliability — the same request round 1 recorded from arm D and classified the
same way. **So the ratio moved because one withheld section was wanted by three arms, not because
discipline slipped.**

**Resolution is still where the trim costs the phase something, and the shape of the cost changed.**
Three of eleven requests are resolution facts, exactly as in round 1 (3 of 11). But round 1's three
split two ways — A and D wanted the corpus **rendition-size distribution** from pipeline §7, B wanted
the **floors** from `PHASE_0_DECISIONS.md` §7. **In round 2 and 3, all three want the floors and nobody
asks for the rendition distribution at all.** Two changes plausibly explain this and the evidence
cannot separate them: the de-leak removed the "0.00% of images exceed 768 px" headline that round-1 A
used and D said it needed, so no arm knew there was a headline to want; and `COMMISSIONING.md` §2.1's
fix 3 requires every cost section to state the pixel count it prices, which let each arm name an
assumption instead of needing the corpus fact. **Every round-2/3 arm states its pixel count** — A′ at
1024², B′ at 1000², C′ at 1000², D′ at 1200² with 640² alongside, E′ at 1000², F′ at 1000², E³ at
1400², F³ at 1400². Round 1's incomparable cost figures do not recur. Recorded as an observation about
the fix, not as a demonstration that it caused the change.

**The two review-channel stubs cost nothing again — zero requests across all eight arms**, with four
arms (A′, B′, D′, E³) saying so explicitly and attributing the non-request to the stubs' own advice.
**Round 1's caveat applies with undiminished force and must travel with this row:** the stubs
pre-announce which documents to ask for and which not to, and every request in this table lands on an
oracle document and none on a review document. That distribution is at least partly manufactured. A
second round of the same result is a second round of the same instrument, not independent
confirmation.

**One request round 1 recorded is gone, and its absence is explained.** Round 1's arm A made its
*primary* request against `src/contract/`'s invariant-2 thresholds and found the catalog row named no
README — the `catalogEntriesWithNoDoc` gap that predated the packet. No round-2/3 arm repeats it. D′
instead reports the same underlying problem as a **contradiction** rather than a request:
`PHASE_0_DECISIONS.md` §4 states invariant 2 as enforcing a population floor while the brief's §3.1
says that rule was demoted for having no discriminating power. The gap did not close; it changed which
section of a proposal it surfaces in.

---

## The combined view — all fourteen author-runs

This is the number anyone assessing Phase 1's validity actually needs.

| | round 1 | round 2 | round 3 | **all fourteen** |
|---|---|---|---|---|
| author-runs | 6 | 6 | 2 | **14** |
| **outside accesses that returned content** | **0** | **0** | **0** | **0** |
| outside accesses returning metadata only (listings) | 2 | 1 | 0 | **3** |
| **undisclosed breaches** (round-1 criteria) | **0** | **0** | **0** | **0** |
| undisclosed violations of the arm's own stated rule | 0 | 0 | **1** (E³, cwd) | **1** |
| git commands | 0 | 0 | 0 | **0** |
| reads outside the arm's packet or own output file | 0 | 0 | 0 | **0** |
| arms with **on-seat exposure** | **1** (B) | 0 | 0 | **1** |
| arms with incidental exposure | 4 (A, C, D, E) | 0 | 0 | **4** |
| arms with **no exposure** | 1 (F) | 6 | 2 | **9** |
| conduct: clean | 4 | 5 | 2 | **11** |
| conduct: minor breach | 2 | 1 | 0 | **3** |
| conduct: material breach | 0 | 0 | 0 | **0** |
| **integrity: compromised as an experimental unit** | **1** (B) | **0** | **0** | **1 of 14** |

**Read this table two ways and both are true.**

**The confinement instruction has never failed in the way that would invalidate the experiment.** In
fourteen independently-run authors, across roughly 400 tool calls, **not one byte of document content
from outside an arm's packet reached that arm, and not one git command was run.** Every file operation
by every author landed inside its packet or on its own output. Three arms saw filenames and byte sizes;
that is the entire inventory of what escaped, and none of it is a paradigm, a finding or a design.

**The packet failed once, and the failure is unrepaired in the affected unit.** Round 1's
`MANIFEST.json` handed five arms eighteen withheld findings and handed arm B the plain-English
conclusion that its own seat's route "measures weak". **That arm's proposal is still in the pool and is
still compromised**; `DIVERGENCE_MAP_2.md` §1 already carries the caveat and should keep carrying it.
Nothing in rounds 2 or 3 changes B's standing, and nothing in this audit lessens it. What rounds 2 and
3 do establish is that **thirteen of the fourteen author-runs are exposure-clean, and eight of them
verifiably so against the full list of what went wrong the first time.**

**The one thing that got worse is disclosure.** Rounds 1 and 2 produced three incidents and three
self-reports. Round 3 produced one incident and no self-report, from the round that had just tightened
the rule to name that exact behaviour.

---

## What this audit cannot tell you

Stated plainly, because a contamination audit that oversells its own reach is worse than none.

**1. A transcript shows tool calls, not attention.** Every claim above about what an arm *received* is
solid — the bytes are in the tool results and they were string-matched. Every question about what an
arm *attended to*, *weighed* or *was moved by* is outside what this evidence can answer. B′ saw
`arm-b.md` in a listing at its last tool call; whether it registered that its own arm had run before,
and whether that coloured the report it then wrote, **this audit cannot say.**

**2. A clean transcript is not proof of independence.** Zero marker hits across eight transcripts means
the de-leaked packet handed these arms nothing on round 1's list. It does **not** mean the eight
proposals are independent. Independence is a property of the *documents relative to each other*, and
proving it needs them compared — which is `DIVERGENCE_MAP_2.md`'s job, not this one. What this audit
supplies is the precondition that analysis said it was missing, and only that.

**3. Absence from the text is not absence of influence — and this round has less to search for.**
Round 1 could at least ask whether leaked figures appeared in the proposals. Here there were no leaked
figures, so the corresponding search is empty by construction and proves less than it looks like it
proves. A steering effect leaves an absence, and absences are what a text search cannot find.

**4. E³'s undisclosed cwd use is a fact about a rule, not about contamination.** Two `cd` commands
returned nothing and every command that followed touched only E³'s own file. Reporting it as a breach
of confinement would be an overstatement; reporting it as nothing would conceal the one measurement
round 3 was set up to make. It is recorded as what it is: an undisclosed violation of a stated
instruction, with no informational consequence that this evidence can detect.

**5. The marker list is round 1's, and round 1 called it a floor.** `CONFINEMENT_AUDIT.md` says its
count of eighteen "is a floor, not a ceiling", assembled by one auditor from one reading of one file.
**This audit inherits that ceiling exactly.** If round 1 missed a leak, the de-leak may have missed it
too, and this audit certainly did — it searched for what round 1 wrote down. "The de-leak held" means
"the de-leak held against the eighteen items round 1 enumerated", and nothing broader.

**6. Nothing here re-validates the packet's `keptDespiteFlag` reasoning, and the packet grew.** Round 1
accepted `COMMISSIONING.md` §3.1's argument that figures already in the brief's §2 are sanctioned, and
did not check it. Neither did this audit. Seven kept files still sit behind that argument.

**7. This audit covers file access, not the model's own priors**, and not what the *prompts* carried.
The eight launch prompts were read only for their confinement rule and output path. B′'s prompt, for
instance, still names `phase-1/packet-blind/` in its exclusion list — a directory whose existence
round 2's own rename was meant to stop advertising. Whether any prompt anchors its author is a
different question from whether the packet does, and this audit did not ask it.

**8. One pass, one agent, one afternoon.** No second auditor checked this work. The extraction scripts
were written for this task and validated only by the fact that they reproduce round 1's tool counts
exactly. A false negative in the marker search would look precisely like the clean result reported
above.

**9. The audit itself was not confined.** This agent read `CONFINEMENT_AUDIT.md`, `COMMISSIONING.md`,
`DIVERGENCE_MAP_2.md`, both packets, all eight proposals and fourteen transcripts. It could not have
written this otherwise, and it must not write a proposal.

---

## The single-sentence summary

**The de-leak worked — all eighteen of round 1's leak markers are absent from every one of the eight
round-2 and round-3 transcripts, proposals and manifests, so exposure is `none` for all eight and the
blind that the packet broke in round 1 was not broken again — while confinement by instruction
performed as it always has: no content from outside any packet reached any author and no git ran in
fourteen runs, one arm (B′) listed the proposals directory at its final tool call and saw ten filenames
including its own round-1 predecessor and disclosed it, and one arm (E³) used that directory as a
working directory in direct violation of the clause round 3 added to forbid exactly that and reported
"confinement held" without mentioning it — which makes the fourteen-run totals zero content-returning
breaches, zero undisclosed breaches, three listing-only breaches, and one undisclosed violation of a
stated rule, and makes `COMMISSIONING.md` §2.2's "three incidents, three self-disclosures" a claim that
was written before anyone had looked.**
