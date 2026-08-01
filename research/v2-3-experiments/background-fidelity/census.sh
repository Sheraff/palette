#!/bin/sh
# Full-corpus census driver. 4 workers, VIPS_CONCURRENCY=1, resumable (charter, "Machine budget").
#   sh census.sh <outFile> <listFile> [workers]
set -e
cd "$(dirname "$0")"
OUT="$1"; LIST="$2"; N="${3:-4}"
if [ -z "$OUT" ] || [ -z "$LIST" ]; then echo "usage: census.sh <outFile> <listFile> [workers]"; exit 1; fi
I=0
while [ "$I" -lt "$N" ]; do
  VIPS_CONCURRENCY=1 node --no-warnings --experimental-strip-types \
    run-census.ts "$OUT" "$LIST" "$I" "$N" &
  I=$((I + 1))
done
wait
echo "census rows: $(cat "$OUT".* | wc -l)"
