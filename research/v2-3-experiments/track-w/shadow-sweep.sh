#!/bin/sh
# 3 workers, VIPS_CONCURRENCY=1 (charter, "Machine budget").
set -e
cd "$(dirname "$0")/../.."
for SHARD in 0 1 2; do
  VIPS_CONCURRENCY=1 node --no-warnings --experimental-strip-types \
    v2-3-experiments/track-w/probe-shadow.ts "$SHARD" 3 >/dev/null &
done
wait
echo "shadow rows: $(ls v2-3-experiments/track-w/data/shadow | wc -l) artworks"
