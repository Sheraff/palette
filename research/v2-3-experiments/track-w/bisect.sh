#!/bin/sh
# Historical bisection of one artwork across the v2-3 integration line.
#
# Replays the artwork through the public entry point at every commit that touched
# `research/v2-3/src`, swapping only that tree — `v2-3-experiments/` stays at HEAD so the probe
# script survives the checkout. Template: track-q/EXPERIMENT.md "Bisection".
#
#   sh bisect.sh <imagePath>
#
# Restores the runtime to HEAD on exit, including on interrupt.
set -e
cd "$(dirname "$0")/../.."
TARGET="$1"
if [ -z "$TARGET" ]; then echo "usage: bisect.sh <imagePath>"; exit 1; fi

restore() { git checkout HEAD -- v2-3/src >/dev/null 2>&1 || true; }
trap restore EXIT INT TERM

COMMITS="c9395ac $(git log --format=%h c9395ac..979c245 --reverse -- v2-3/src | tr '\n' ' ')"
for C in $COMMITS; do
  git checkout "$C" -- v2-3/src 2>/dev/null || { echo "$C  <checkout failed>"; continue; }
  OUT=$(VIPS_CONCURRENCY=1 node --no-warnings --experimental-strip-types \
    v2-3-experiments/track-w/extract-one.ts "$TARGET" 2>&1 | tail -1)
  SUBJ=$(git log -1 --format=%s "$C" | cut -c1-58)
  echo "$C  $OUT  | $SUBJ"
done
restore
echo "runtime restored to HEAD"
