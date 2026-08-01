#!/bin/sh
# Block until no census worker is running, then report the row count.
#   sh wait-census.sh <outFilePrefix>
cd "$(dirname "$0")"
PREFIX="$1"
while true; do
  W=`pgrep -f run-census | wc -l | tr -d ' '`
  if [ "$W" = "0" ]; then
    echo "census workers done: `cat $PREFIX.* 2>/dev/null | wc -l` rows"
    exit 0
  fi
  sleep 20
done
