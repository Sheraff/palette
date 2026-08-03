#!/bin/sh
#
# The review server's lifecycle, in one command with one answer.
#
#   serverctl.sh start | stop | restart | status | verify
#
# THE ORCHESTRATOR OWNS THE SERVER. The reviewer never starts, stops or restarts anything — one of
# their five standing complaints was "i never know if the server has been started already or if i
# have to start it myself", and the answer to that is not a better instruction, it is that starting
# it was never their job. `status` exists so the orchestrator can answer the question in one call
# instead of reading `ps` output and guessing.
#
# `start` does not return until the process ANSWERS: a pid is not a service. `restart` is stop then
# start, so the batch log and warehouse replay on the way up (both are append-only; a restart is
# invisible to the reviewer's work). `verify` runs the live crawl — and `start`/`restart` run it too,
# because a server that is listening but serving a broken page is the exact failure this whole
# machine exists to stop.
#
# Exit codes: 0 fine · 1 something failed · 3 (from `status`) not running.

set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
V3=$(cd "$HERE/../.." && pwd)

PORT=${REVIEW_SERVER_PORT:-3010}
HOST=127.0.0.1
BASE="http://$HOST:$PORT"
RUN_DIR="$V3/data/review-server"
PIDFILE="$RUN_DIR/server.pid"
LOGFILE="$RUN_DIR/server.log"

# How long `start` waits for the process to answer its first request, in seconds.
# [UNCALIBRATED] — chosen here. A cold start replays the warehouse and the batch log; on the current
# logs that is well under a second, and 30 leaves room for them to grow by two orders of magnitude.
START_TIMEOUT=30
# How long `stop` waits for a clean SIGTERM shutdown before SIGKILL, in seconds.
STOP_TIMEOUT=10

mkdir -p "$RUN_DIR"

running_pid() {
	[ -f "$PIDFILE" ] || return 1
	pid=$(cat "$PIDFILE" 2>/dev/null || true)
	[ -n "${pid:-}" ] || return 1
	# A pidfile outliving its process is the normal case after a crash, so the pid is always probed.
	kill -0 "$pid" 2>/dev/null || return 1
	echo "$pid"
}

healthy() {
	curl -fsS -o /dev/null --max-time 5 "$BASE/api/queue" 2>/dev/null
}

cmd_status() {
	if pid=$(running_pid); then
		if healthy; then
			echo "running   pid $pid   $BASE/   (log: $LOGFILE)"
			return 0
		fi
		echo "STALE     pid $pid is alive but $BASE/api/queue does not answer — restart it"
		return 1
	fi
	if healthy; then
		echo "FOREIGN   something else is serving $BASE (no pidfile here) — find it before starting"
		return 1
	fi
	echo "not running   (start it with: $0 start)"
	return 3
}

cmd_start() {
	if pid=$(running_pid); then
		echo "already running   pid $pid   $BASE/"
		cmd_verify
		return 0
	fi
	if healthy; then
		echo "refusing to start: $BASE already answers but is not ours (no pidfile)" >&2
		return 1
	fi
	rm -f "$PIDFILE"
	echo "starting on $BASE …"
	# Detached, output to the log: the orchestrator must be able to walk away, and a crash must leave
	# evidence rather than a silence.
	NODE_NO_WARNINGS=1 nohup node --experimental-strip-types \
		"$HERE/server.ts" --port "$PORT" >>"$LOGFILE" 2>&1 &
	echo $! >"$PIDFILE"
	pid=$(cat "$PIDFILE")

	waited=0
	while [ "$waited" -lt "$START_TIMEOUT" ]; do
		if healthy; then
			echo "started   pid $pid   $BASE/"
			cmd_verify
			return 0
		fi
		if ! kill -0 "$pid" 2>/dev/null; then
			echo "the server exited during start — last lines of $LOGFILE:" >&2
			tail -n 20 "$LOGFILE" >&2 || true
			rm -f "$PIDFILE"
			return 1
		fi
		sleep 1
		waited=$((waited + 1))
	done
	echo "started pid $pid but $BASE/api/queue did not answer within ${START_TIMEOUT}s" >&2
	tail -n 20 "$LOGFILE" >&2 || true
	return 1
}

cmd_stop() {
	if ! pid=$(running_pid); then
		rm -f "$PIDFILE"
		echo "not running"
		return 0
	fi
	kill "$pid" 2>/dev/null || true
	waited=0
	while [ "$waited" -lt "$STOP_TIMEOUT" ]; do
		kill -0 "$pid" 2>/dev/null || break
		sleep 1
		waited=$((waited + 1))
	done
	if kill -0 "$pid" 2>/dev/null; then
		echo "pid $pid ignored SIGTERM for ${STOP_TIMEOUT}s — killing"
		kill -9 "$pid" 2>/dev/null || true
	fi
	rm -f "$PIDFILE"
	echo "stopped   pid $pid"
}

cmd_verify() {
	NODE_NO_WARNINGS=1 node --experimental-strip-types "$HERE/verify-live.ts" --base "$BASE"
}

case "${1:-status}" in
start) cmd_start ;;
stop) cmd_stop ;;
restart)
	cmd_stop
	cmd_start
	;;
status) cmd_status ;;
verify) cmd_verify ;;
*)
	echo "usage: $0 {start|stop|restart|status|verify}" >&2
	exit 1
	;;
esac
