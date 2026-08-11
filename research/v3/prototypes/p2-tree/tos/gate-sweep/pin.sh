#!/bin/sh
# Run a gate-sweep/ script against a **pinned** export of the prototype, not against the live worktree.
#
# Why: this study's numbers are a property of one `pipeline.ts`, and a sibling worker may edit
# `tos/pipeline.ts` (and `tos/roles/`) while the sweep is running. The pattern is `tos/identity/pin.sh`'s,
# proven in cycle 3 after a published foreground moved between two runs of the same script.
#
# The pin is `PIN_COMMIT` below — the worktree's HEAD at the start of cycle 4, whose tracked `tos/`
# state is byte-identical to the working tree at pin time (`git status --porcelain` showed no tracked
# modifications; only gitignored `out/` directories were dirty). The export is a `git archive` of
# `research/v3` into a scratch directory with the corpus shards and `node_modules` symlinked beside it;
# nothing in the live worktree is written, checked out, stashed or committed.
#
# Usage:  sh tos/gate-sweep/pin.sh collect.ts [args…]
# Output: the script's own JSON/JSONL/TXT writes land in the export and are copied back into
#         `tos/gate-sweep/`.

set -e

PIN_COMMIT=9aab5f28065b80592112d0edc3fe89da3e170ca8
HERE=$(cd "$(dirname "$0")" && pwd)
TOS=$(cd "$HERE/.." && pwd)                # …/prototypes/p2-tree/tos
WORKTREE=$(cd "$TOS/../../../../.." && pwd) # the git worktree root
PIN=${GATE_SWEEP_PIN_DIR:-/private/tmp/p2-tos-gate-sweep-pin-9aab5f28}
TARGET="$PIN/research/v3/prototypes/p2-tree/tos"

if [ ! -d "$PIN/research" ]; then
	mkdir -p "$PIN"
	(cd "$WORKTREE" && git archive "$PIN_COMMIT" research/v3) | tar -x -C "$PIN"
	ln -s "$WORKTREE/node_modules" "$PIN/node_modules" 2>/dev/null || true
	for shard in 00 01 02 03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f 10 11 12 13 14 15; do
		ln -s "$WORKTREE/$shard" "$PIN/$shard" 2>/dev/null || true
	done
	# `images/` holds the 25 legacy-corpus covers whose endorsement paths are not shard paths; without
	# it 25 of the 144 labelled covers report `missing-on-disk` and the study silently measures 119.
	for tree in music-artworks images; do
		ln -s "$WORKTREE/$tree" "$PIN/$tree" 2>/dev/null || true
	done
fi

# The study's own scripts are the one thing that is *not* pinned: they are this worker's, they are
# untracked, and they are copied in on every run so an edit here takes effect without re-exporting.
rm -rf "$TARGET/gate-sweep"
mkdir -p "$TARGET/gate-sweep"
for source in "$HERE"/*.ts "$HERE"/*.sh; do
	[ -e "$source" ] && cp "$source" "$TARGET/gate-sweep/"
done
# Stage 2 reads stage 1's artefacts, and the line above just deleted the export's copy of them, so
# carry `out/` back in. The scripts are re-copied every run; the data is whatever stage 1 last wrote.
[ -d "$HERE/out" ] && cp -R "$HERE/out" "$TARGET/gate-sweep/out"

script=$1
shift
NODE_NO_WARNINGS=1 node --experimental-strip-types "$TARGET/gate-sweep/$script" "$@"

# Copy the artefacts back, never the scripts (the export is a build directory, not a source of truth).
for produced in $(cd "$TARGET/gate-sweep" && find . -name "*.json" -o -name "*.jsonl" -o -name "*.txt"); do
	mkdir -p "$HERE/$(dirname "$produced")"
	cp "$TARGET/gate-sweep/$produced" "$HERE/$produced"
done
