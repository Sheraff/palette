#!/bin/bash
# Supervisor for the SAM stage (§5.1: resumability is only half of it — the process must
# also restart itself). Re-derives the work queue from the output JSONL on every restart;
# no state is carried across restarts except that file and the attempt ledger.
#
#   ./supervise.sh --eval-set --out sam-eval-142
#   ./supervise.sh --collection sharded --out sam-sharded
#
# Bounded restarts: continuous restarting means something systemic (wedged GPU, full
# disk) and should stop and alert rather than churn.

set -u
cd "$(dirname "$0")" || exit 1

MAX_RESTARTS=20   # [INHERITED] config.MAX_RESTARTS
restarts=0

while :; do
  .venv/bin/python run_sam.py "$@"
  code=$?
  if [ $code -eq 0 ]; then
    echo "[supervise] clean exit after $restarts restart(s)"
    exit 0
  fi
  # A canary mismatch halts deliberately (§5.3) and must not be restarted into.
  if [ $code -eq 2 ]; then
    echo "[supervise] deliberate halt (exit 2). Not restarting."
    exit 2
  fi
  restarts=$((restarts + 1))
  if [ $restarts -ge $MAX_RESTARTS ]; then
    echo "[supervise] $restarts restarts — stopping. Something systemic is wrong."
    exit 1
  fi
  echo "[supervise] exit $code — restart $restarts/$MAX_RESTARTS in 5s"
  sleep 5
done
