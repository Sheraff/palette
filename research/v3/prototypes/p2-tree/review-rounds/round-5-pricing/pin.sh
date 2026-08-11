#!/bin/sh
# Run a round-5 script against a **pinned** export of the prototype, never against the live worktree.
#
# Why (the same reason `tos/identity/pin.sh` gives, and it applied again while this round was staged):
# a sibling worker owns `tos/` and may edit `pipeline.ts` mid-flight, and HEAD moved under this
# worktree between two of this staging worker's own commands. Every side this round publishes is
# built at ONE commit and the round says which, so a reviewer's answer is about a palette that can be
# rebuilt.
#
# Usage:  sh pin.sh <variant> <script> [args…]
#   variant = base            — the pinned prototype, unmodified: the PUBLISHED palettes
#             accent-member   — + the accent cluster publishes its most chromatic member (worker J)
#             fg-member       — + a text group publishes its most readable member (worker J)
#
# Each variant gets its **own** export directory. A variant is produced by `patch.ts`, which applies
# one exact, asserted, single-site substitution to the exported `tos/pipeline.ts` — the export is a
# build directory, not a source of truth, and nothing in the live worktree is written, checked out,
# stashed or committed. The two substitutions are the two levers `tos/roles/NOTES.md` (worker J)
# measured and was forbidden to take unilaterally; this round prices them.
#
# Artefacts: the script's own `out/*.json` writes land in the export and are copied back into `out/`.

set -e

PIN_COMMIT=734c3f564f16ce9cf829fb420ddbf220fa1103cf
HERE=$(cd "$(dirname "$0")" && pwd)
WORKTREE=$(cd "$HERE/../../../../../.." && pwd) # …/.worktrees/p2-tree
PIN_ROOT=${ROUND5_PIN_DIR:-/private/tmp/claude-501/-Users-Flo-GitHub-palette/round-5-pricing-pin}

variant=$1
shift
case "$variant" in
base | accent-member | fg-member) ;;
*)
	echo "pin.sh: unknown variant '$variant' (base | accent-member | fg-member)" >&2
	exit 2
	;;
esac

EXPORT="$PIN_ROOT/$variant"

if [ ! -d "$EXPORT/research" ]; then
	mkdir -p "$EXPORT"
	(cd "$WORKTREE" && git archive "$PIN_COMMIT" research/v3/src research/v3/prototypes/p2-tree research/v3/data/devloop) | tar -x -C "$EXPORT"
	ln -s "$WORKTREE/node_modules" "$EXPORT/node_modules" 2>/dev/null || true
	for shard in 00 01 02 03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f 10 11 12 13 14 15; do
		ln -s "$WORKTREE/$shard" "$EXPORT/$shard" 2>/dev/null || true
	done
	if [ "$variant" != "base" ]; then
		node --experimental-strip-types "$HERE/patch.ts" "$EXPORT" "$variant"
	fi
fi

TARGET="$EXPORT/research/v3/prototypes/p2-tree/review-rounds/round-5-pricing"
rm -rf "$TARGET"
mkdir -p "$(dirname "$TARGET")"
cp -R "$HERE" "$TARGET"

script=$1
shift
ROUND5_VARIANT="$variant" ROUND5_PIN_COMMIT="$PIN_COMMIT" node --experimental-strip-types "$TARGET/$script" "$@"

# Copy the artefacts back, never the scripts (the export is a build directory, not a source of truth).
mkdir -p "$HERE/out"
for produced in $(cd "$TARGET" && find out -name "*.json" 2>/dev/null); do
	cp "$TARGET/$produced" "$HERE/$produced"
done
