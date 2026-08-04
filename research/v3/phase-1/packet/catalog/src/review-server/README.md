<!-- Phase 1 author packet — provenance
     source: research/v3/src/review-server/README.md
     commit: 71a1d62d51006dd8f353e8c0bc6e4434bdb0c4b2
     date:   2026-08-04
     This file is NOT a copy of the source above. It is a stub: the source is withheld
     from this packet, and this page records that fact, quotes the brief's §5 catalog row for
     the instrument verbatim, and tells the author how to ask for what they need. No content
     from the withheld document is reproduced or paraphrased here.
-->

# `src/review-server/README.md` — withheld from this packet

The document exists. It is at `research/v3/src/review-server/README.md` in the repository, and it is not in your packet.

**What you receive about this instrument is its row in the brief's §5 catalog, quoted here in full:**

| instrument | what it measures | invoke | state |
|---|---|---|---|
| **Review rounds** (`src/review-server/`, `review-ui/round-kit.js`) | The human channel. Blinded 4–10 item batches, content-hash side shuffling, the key never served, calibration rounds with repeats, keyboard-only answering. **Every round carries a per-item free-text note and a copyable item id**, so the reviewer can say something the round did not ask. Reviewer bandwidth is the campaign's binding constraint — rounds are scheduled, not spent freely. | the orchestrator pushes batches; see `REVIEW_UI.md` | built (`src/review-server/README.md`) |

That row is the catalog entry, and a catalog of every instrument — *one line each, saying what it
measures and how to invoke it* — is what an author was commissioned to receive
(`d-2026-08-04-phase-1-authors-receive-a-tool-catalog`). It is enough to know what this instrument
measures, which is the thing you are entitled to know.

**Why the document itself is withheld.** Alongside describing the instrument, it states what this
campaign *found* — its results and its failure analyses. `PHASE_1_AUTHOR_BRIEF.md` §7 says you do
not receive those, and gives the reason: *"a conclusion is an answer, and an answer sitting on the
shelf is an anchor."* Withholding it is the design of Phase 1, not an administrative choice. Nothing
from the document has been summarised or paraphrased here; this page is a closed door, not a digest.

**If you need something from it, ask — this is a real offer.** Name it in your proposal: which part
you wanted, and why your design turns on it. It will be adjudicated, and handed to you if it is not
an anchor. An author who names the gap tells us whether closing this door cost the phase anything;
an author who quietly designs around it tells us nothing, and that is the outcome worth avoiding.

One thing worth saying plainly, so you do not spend a request on it: this instrument is the human
review channel — how batches are put in front of the reviewer and how answers come back. It is how
your proposal would eventually be *judged*; it is not machinery your proposal has to design against.
