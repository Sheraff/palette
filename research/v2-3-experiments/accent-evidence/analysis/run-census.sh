#!/bin/sh
# Full-corpus census for one label, 4 shard workers (charter machine budget).
set -e
label="$1"
[ -n "$label" ] || { echo "usage: run-census.sh <label>" >&2; exit 1; }
here=$(dirname "$0")
for i in 0 1 2 3; do
  VIPS_CONCURRENCY=1 node --no-warnings --experimental-strip-types "$here/census.ts" "$label" "$i" 4 &
done
wait
echo "census $label complete"
