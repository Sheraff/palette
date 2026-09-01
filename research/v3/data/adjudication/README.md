# Adjudication demo artifacts

Both files here are **synthetic demonstrations, not measurements**. Nothing in this directory is
evidence about any palette algorithm, because no palette algorithm exists yet — Phase 1 will produce
the first real candidate runs.

| file | what it is |
|---|---|
| `demo-candidates.jsonl` | 34 candidate palettes assembled from the real evidence corpus by five stated transforms |
| `demo-report.txt` | the adjudication of that run, `--as-of 2026-08-04` |

Regenerate (deterministic — same corpus in, byte-identical files out):

```sh
cd research/v3
node --experimental-strip-types src/adjudication/make-demo-run.ts
node --experimental-strip-types src/adjudication/cli.ts run data/adjudication/demo-candidates.jsonl \
  --as-of 2026-08-04 --out data/adjudication/demo-report.txt
```

The JSON form is not committed because it is 296 KB and fully regenerable: add `--format json`.

## What the demo is for

Every line is built by copying a standing entry and applying one known transform, so the expected
adjudication of every line is known in advance and the report can be checked by eye:

| lines | transform | expected |
|---|---|---|
| 8 | exact copy of an endorsement | WIN |
| 6 | endorsement, every channel nudged by one | WIN (4 of the 6 land inside the bar) |
| 5 | exact copy of a known-bad palette | LOSS |
| 8 | channel-rotated endorsement — a palette nobody graded | NO SIGNAL (`differs`) |
| 4 | exact copy of an acceptable-tier palette | baseline, no win |
| 2 | reachability probes | one reachable, one unreachable |
| 1 | a fabricated content hash | UNSEEN |

A run built by copying the answers will of course "win". What it demonstrates is that each case lands
in the tier the semantics say it should, on real data at real corpus scale.

## Three things the demo turned up that are about the corpus, not the tool

- **Two of the six one-LSB nudges fall outside the bar.** The dark-neutral bar is 0.00932 and a
  +1-per-channel step in a dark colour can clear it. That is the calibrated bar behaving as measured,
  and it is visible here rather than assumed.
- **Copies of `acceptable` palettes produced wins.** Two of the four land on entries that are
  *also* in `endorsements.json` — the 31-key good-tier overlap the legacy README documents. The tool
  reports both signals and raises a `tier-overlap` conflict rather than picking one.
- **Seven `grade-history-conflict` items on real entries.** Palettes the reviewer graded one way and
  later another. Recency settles standing; the disagreement is printed with its full history.
