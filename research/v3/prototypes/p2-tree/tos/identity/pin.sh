#!/bin/sh
# Run an identity/ script against a **pinned** export of the prototype, not against the live worktree.
#
# Why: a sibling worker owns `tos/roles/` and edited `pipeline.ts` and `roles/rank.ts` while this
# measurement was running, and the published foreground moved (`#fcfefd` → `#fbfbfb` on cal-014 item 1)
# between two runs of the same script. A diagnosis of a *reviewed* palette has to be taken against the
# code that produced it, so every number in q1/q2/q3 is measured against one commit and says which.
#
# The pin is `PIN_COMMIT` below — the commit at which `round-3-quality/items.json` reproduces byte for
# byte (each q*/report.json carries a `reproduced` flag asserting exactly that). The export is a
# `git archive` of `research/v3` into a scratch directory with the corpus shards and `node_modules`
# symlinked beside it; nothing in the live worktree is written, checked out, stashed or committed.
#
# Usage:  sh tos/identity/pin.sh q1/run.ts [args…]
# Output: the script's own writes land in the export and are copied back into `tos/identity/`.

set -e

PIN_COMMIT=16e84b75fa1c075bea720ee216f7b7879671edcc
HERE=$(cd "$(dirname "$0")" && pwd)
P2=$(cd "$HERE/.." && pwd)                 # …/prototypes/p2-tree/tos
WORKTREE=$(cd "$P2/../../../../.." && pwd) # the git worktree root
PIN=${IDENTITY_PIN_DIR:-/private/tmp/claude-501/-Users-Flo-GitHub-palette/2309a578-04f5-4ae0-97b9-481682d72c4f/scratchpad/pinned}
TARGET="$PIN/research/v3/prototypes/p2-tree/tos"

if [ ! -d "$PIN/research" ]; then
	mkdir -p "$PIN"
	(cd "$WORKTREE" && git archive "$PIN_COMMIT" research/v3) | tar -x -C "$PIN"
	ln -s "$WORKTREE/node_modules" "$PIN/node_modules" 2>/dev/null || true
	for shard in 00 01 02 03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f 10 11 12 13 14 15; do
		ln -s "$WORKTREE/$shard" "$PIN/$shard" 2>/dev/null || true
	done
	# `out/` directories are gitignored, so `git archive` does not carry them; q3 reads the merged
	# falsifier report from there. They are read-only inputs to this measurement, symlinked, not copied.
	for produced in prototypes/p2-tree/falsifier/out prototypes/p2-tree/tos/out prototypes/p2-tree/tos/lanes/out; do
		rmdir "$PIN/research/v3/$produced" 2>/dev/null || true
		ln -s "$WORKTREE/research/v3/$produced" "$PIN/research/v3/$produced" 2>/dev/null || true
	done
fi

rm -rf "$TARGET/identity"
cp -R "$HERE" "$TARGET/identity"

script=$1
shift
node --experimental-strip-types "$TARGET/identity/$script" "$@"

# Copy the artefacts back, never the scripts (the export is a build directory, not a source of truth).
for produced in $(cd "$TARGET/identity" && find . -name "*.json" -o -name "*.jsonl" -o -name "*.png"); do
	mkdir -p "$HERE/$(dirname "$produced")"
	cp "$TARGET/identity/$produced" "$HERE/$produced"
done
