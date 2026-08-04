# `review-rounds/` — staged calibration rounds, one directory each

Written by `../tools/stage-round.ts`. Read by the P6 orchestrator, and — after release — by the P6
analyst. **Nothing here is pushed by this prototype**: staging and pushing are separate jobs and the
main orchestrator owns the second one.

## Layout

```
review-rounds/<round-name>/
  fixture.json          the POST /api/calibration payload
  sidecar.data.json     the review-ui side-car: render data only
  private-mapping.json  the de-blinding join. PRIVATE.
  ROUND.md              what the round asks, and what we do under each outcome
```

## Who may read what

| file | audience | contains |
|---|---|---|
| `fixture.json` | the pusher, the server | batch id, purpose, `fundedBy`, and per item: `itemId`, `imagePath`, `artworkId`, `variantId`, `fingerprint`, `palette` |
| `sidecar.data.json` | **the reviewer's browser** | `batchId` and, per item, `questionKey` plus a `side` of `roles` (hex + `colornames-oklab` name + collapsed flag), `surfaceCollapsed`, `accentCollapsed`, `gradient` (display stops), `fieldCss` |
| `private-mapping.json` | the post-release analyst only | item token ↔ cover ↔ candidate id + code version ↔ run file, plus palette hashes and any escape declaration |
| `ROUND.md` | the orchestrator | the question, the item table, the staging checks, the consequence table |

`sidecar.data.json` is the one file a reviewer can see, so it carries **no** candidate id, code
version, run id, arm label, cover path or palette hash. `private-mapping.json` is never pushed,
never served, and is referenced from neither of the other two files — SPEC directive 10.

`fixture.json` carries `variantId` as an opaque per-round token; the candidate's real identity
survives in it only as `fingerprint.algorithmVersion`, which the push schema requires and the server
never serves (`round-kit.ts`'s allowlist). See the header comment of `../tools/stage-round.ts`.

## Paths

`imagePath` entries are **repo-root-relative**, and the fixture says so with
`"imagePathsRelativeTo": "repo-root"` — the same convention as
`research/v3/src/review-server/fixtures/demo-calibration.json`. The push API requires absolute
paths; the pusher rewrites them.

## Regenerating

Staging is deterministic: same run file, same `--covers`, same `--name`, same working-tree state ⇒
byte-identical files. Re-running overwrites a round directory in place, so `stage-round.ts … && git
diff` is a real check that nothing moved.
