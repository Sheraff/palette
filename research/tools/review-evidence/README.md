# Palette review evidence warehouse

This directory contains evaluation-only tooling. Historical JSON remains authoritative; the SQLite file is disposable, rebuilt atomically, and made read-only after import.

Build and inspect the default warehouse:

```sh
NODE_NO_WARNINGS=1 node --experimental-strip-types research/tools/review-evidence/cli.ts build
NODE_NO_WARNINGS=1 node --experimental-strip-types research/tools/review-evidence/cli.ts summary
NODE_NO_WARNINGS=1 node --experimental-strip-types research/tools/review-evidence/cli.ts unresolved
NODE_NO_WARNINGS=1 node --experimental-strip-types research/tools/review-evidence/cli.ts conflicts
```

Historical discovery excludes generated scratch review jobs. A nonempty submitted scratch feedback file can be included explicitly without changing that default inventory:

```sh
NODE_NO_WARNINGS=1 node --experimental-strip-types research/tools/review-evidence/cli.ts build --current-feedback research/data/scratch/path/to/submitted-feedback.json
```

Exact reports accept either a normalized treatment identity or a historical raw treatment ID:

```sh
NODE_NO_WARNINGS=1 node --experimental-strip-types research/tools/review-evidence/cli.ts exact --source SHA256 --treatment-id 'HISTORICAL_ID'
NODE_NO_WARNINGS=1 node --experimental-strip-types research/tools/review-evidence/cli.ts pair-history --source SHA256 --first-id 'ID_A' --second-id 'ID_B'
NODE_NO_WARNINGS=1 node --experimental-strip-types research/tools/review-evidence/cli.ts minimal-review --candidate path/to/candidate.json
```

`minimal-review` accepts a V2 rich/item manifest or a small adapter-neutral input:

```json
{
  "presentationVersion": "complete-treatment-presentation-v1",
  "candidates": [
    {
      "caseId": "case-1",
      "sourceSha256": "...",
      "treatment": {
        "roles": {
          "background": { "rgb": [0, 0, 0], "generated": false },
          "surface": { "rgb": [0, 0, 0], "generated": false },
          "foreground": { "rgb": [255, 255, 255], "generated": true },
          "accent": { "rgb": [255, 255, 255], "generated": true }
        },
        "collapse": { "surface": true, "accent": true },
        "gradient": false
      }
    }
  ]
}
```

Setwise valid options remain setwise, pairwise preferences remain pairwise, and unselected options are never converted to rejection. Legacy and native comparisons are retained in `binary_judgments`; exact topology decisions and other case-scoped conclusions are retained in `scoped_judgments`. They are not promoted to complete-palette treatment judgments.

`feedback_stores` reconciles every discovered historical store. Unsupported semantic mappings are preserved verbatim in `quarantined_submissions` with a stable adapter-specific reason instead of appearing as unresolved bindings. The current corpus contains 90 stores and 1,380 submissions: 62 stores / 890 submissions are bound, and 28 stores / 490 submissions are quarantined.

Reuse requires exact source bytes, visible treatment identity, render variant, and an absolute-quality question. The fast Phase 4 seal is imported only as an exclusion list; all 12 selected sources are excluded and never enter evidence queries.
