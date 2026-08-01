#!/bin/sh
# Sweep one label over the corpus with 4 shard workers (charter machine budget: <=4 processes,
# VIPS_CONCURRENCY=1). Usage: run-sweep.sh <label>
set -e
label="$1"
[ -n "$label" ] || { echo "usage: run-sweep.sh <label>" >&2; exit 1; }
here=$(dirname "$0")
for i in 0 1 2 3; do
  VIPS_CONCURRENCY=1 node --no-warnings --experimental-strip-types "$here/sweep.ts" "$label" "$i" 4 &
done
wait
echo "sweep $label complete"
