#!/bin/sh
# Run a command with the two arm constants set to a named configuration, then restore trunk values.
#
#   with-arm.sh <channel> <reservation> <command...>
#     channel     = off | fidelity | quality | both   (ACCENT_EVIDENCE_CHANNEL)
#     reservation = off | lane | obligation | both    (CHROMATIC_CANDIDACY_RESERVATION)
#
# The constants are module-level `const`s on purpose — the runtime must not read the environment.
# This script edits them, runs, and restores, so no measurement can silently disagree with what the
# source says. It restores on any exit path, and it VERIFIES both edits before running anything.
set -e
channel="$1"; shift
reservation="$1"; shift
core="$(cd "$(dirname "$0")/../../../v2-3/src/internal" && pwd)/palette-core.ts"
backup="$(mktemp)"
cp "$core" "$backup"
restore() { cp "$backup" "$core"; rm -f "$backup"; }
trap restore EXIT INT TERM
CHANNEL="$channel" RESERVATION="$reservation" perl -pi -e '
  s/^(export const ACCENT_EVIDENCE_CHANNEL:[^=]*= )".*"$/$1"$ENV{CHANNEL}"/;
  s/^(export const CHROMATIC_CANDIDACY_RESERVATION:[^=]*= )".*"$/$1"$ENV{RESERVATION}"/;
' "$core"
grep -q "^export const ACCENT_EVIDENCE_CHANNEL:.* = \"$channel\"\$" "$core" ||
  { echo "with-arm: channel edit failed ($channel)" >&2; exit 1; }
grep -q "^export const CHROMATIC_CANDIDACY_RESERVATION:.* = \"$reservation\"\$" "$core" ||
  { echo "with-arm: reservation edit failed ($reservation)" >&2; exit 1; }
"$@"
