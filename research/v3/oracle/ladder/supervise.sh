#!/usr/bin/env bash
# Supervisor for the resolution-ladder worker (pipeline doc §5.1).
#
#   ./supervise.sh --scope sample --out ../../data/oracle-ladder/ladder-sample-1.jsonl [worker args...]
#
# "Resumability is only half of it — the process must also restart itself."
#   - auto-restart on non-zero exit; the queue is re-derived from the output file each time
#   - no state carried across restarts except the JSONL
#   - bounded restarts: continuous restarting means something systemic, so stop and alert
#   - exit 3 from the worker is a CANARY MISMATCH: never restart, the run is not usable
#
# The interpreter is the premise test's venv. This workstream installs nothing
# (CONVENTIONS.md: never install packages) and never writes inside premise/.
set -u -o pipefail

# [REVIEWED] Pipeline §5.1: "Bound total restarts (say 20)."
MAX_RESTARTS=20
# [MEASURED] Model load is ~35 s; a restart storm is only detectable if the loop does not spin.
RESTART_DELAY_SECONDS=10

cd "$(dirname "$0")" || exit 1
PYTHON=../premise/.venv/bin/python

if [ ! -x "$PYTHON" ]; then
	echo "missing interpreter: $PYTHON (see research/v3/oracle/premise/README.md)" >&2
	exit 2
fi

restarts=0
while true; do
	echo "=== supervisor: starting worker (restart ${restarts}/${MAX_RESTARTS}) at $(date -u +%FT%TZ)"
	"$PYTHON" run_ladder.py "$@"
	code=$?
	if [ "$code" -eq 0 ]; then
		echo "=== supervisor: worker finished cleanly"
		exit 0
	fi
	if [ "$code" -eq 3 ]; then
		echo "=== supervisor: CANARY MISMATCH (exit 3). Not restarting. The run is not a usable artifact."
		exit 3
	fi
	restarts=$((restarts + 1))
	if [ "$restarts" -ge "$MAX_RESTARTS" ]; then
		echo "=== supervisor: ${MAX_RESTARTS} restarts reached; something systemic. Stopping."
		exit 4
	fi
	echo "=== supervisor: worker exited ${code}; restarting in ${RESTART_DELAY_SECONDS}s"
	sleep "$RESTART_DELAY_SECONDS"
done
