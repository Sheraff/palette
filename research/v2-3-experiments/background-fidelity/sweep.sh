#!/bin/sh
# Background-fidelity sweep driver.
#   sh sweep.sh <outDir> <listFile> [workers]
# Charter, "Machine budget": at most 4 worker processes, VIPS_CONCURRENCY=1 each, resumable
# (one result file per artwork, existing files skipped) so it can be killed at any point.
set -e
cd "$(dirname "$0")"
OUT="$1"; LIST="$2"; N="${3:-4}"
if [ -z "$OUT" ] || [ -z "$LIST" ]; then echo "usage: sweep.sh <outDir> <listFile> [workers]"; exit 1; fi
I=0
while [ "$I" -lt "$N" ]; do
  VIPS_CONCURRENCY=1 node --no-warnings --experimental-strip-types \
    run-bgfidelity.ts "$OUT" "$LIST" "$I" "$N" &
  I=$((I + 1))
done
wait
echo "swept: $(ls "$OUT" | wc -l) results"
