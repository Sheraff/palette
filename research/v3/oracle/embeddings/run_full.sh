#!/bin/bash
# Supervisor for the full embedding run (spec section 5.1: the worker must not
# only resume, it must restart itself).
#
# Safe to launch with nohup and forget. Each restart re-derives its work queue
# from the output files, so no state is carried across restarts. Bounded restarts,
# because continuous restarting means something systemic.
#
#   cd research/v3/oracle/embeddings
#   nohup ./run_full.sh > ../../data/embeddings/run.log 2>&1 &
#
# Kill it with:  pkill -f run_full.sh; pkill -f embed.py
# Resume it with: the identical command. Nothing else.

set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
PYTHON="$HERE/.venv/bin/python"

# [REVIEWED] Spec section 5.1 suggests bounding restarts at about 20. A run that
# needs more than this has a systemic problem and should stop rather than churn.
MAX_RESTARTS=20

# [UNCALIBRATED] Pause between restarts, so a wedged GPU is not hammered. No
# measurement behind the value; it only has to be long enough to be visible in a log.
RESTART_SLEEP_SECONDS=10

attempt=0
while [ "$attempt" -le "$MAX_RESTARTS" ]; do
  echo "[supervisor] attempt $attempt at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  "$PYTHON" "$HERE/embed.py" "$@"
  status=$?
  echo "[supervisor] embed.py exited with $status at $(date -u +%Y-%m-%dT%H:%M:%SZ)"

  if [ "$status" -eq 0 ]; then
    echo "[supervisor] complete."
    exit 0
  fi
  if [ "$status" -eq 130 ]; then
    echo "[supervisor] stopped on request; not restarting."
    exit 130
  fi

  attempt=$((attempt + 1))
  sleep "$RESTART_SLEEP_SECONDS"
done

echo "[supervisor] gave up after $MAX_RESTARTS restarts. Something is systemic."
exit 1
