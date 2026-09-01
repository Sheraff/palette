#!/bin/sh
# Track W sweep driver: 3 workers, VIPS_CONCURRENCY=1, resumable (charter, "Machine budget").
#   sh sweep.sh <label>
set -e
cd "$(dirname "$0")/../.."
LABEL="$1"
if [ -z "$LABEL" ]; then echo "usage: sweep.sh <label>"; exit 1; fi
for SHARD in 0 1 2; do
  VIPS_CONCURRENCY=1 node --no-warnings --experimental-strip-types \
    v2-3-experiments/track-w/run.ts "$LABEL" "$SHARD" 3 &
done
wait
echo "swept: $(ls v2-3-experiments/track-w/data/"$LABEL" | wc -l) cases"
