#!/usr/bin/env bash
#
# Freeze the four oracle virtualenvs into committed requirements files (build item 17).
#
# Why this exists: every Python result in data/ was produced by one of these four environments, and
# none of them is reconstructible from anything in the repo. A `pip freeze` output is not a lockfile
# and does not pretend to be one — it is a *witness*: the exact package set that produced the
# committed numbers, so that a future divergence can be attributed to a version change instead of
# argued about.
#
# The environments are deliberately separate (each model's dependencies conflict with the others'),
# so there are four files and not one.
#
#   cd research/v3 && bash src/provenance/freeze-venvs.sh
#
# Re-run after installing anything into any venv, and commit the diff. A freeze that silently drifts
# from its venv is worse than no freeze, because it is read as authoritative.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

OUT_DIR="data/provenance/venv-freeze"
mkdir -p "$OUT_DIR"

for venv in bakeoff embeddings premise sam; do
	python_bin="oracle/${venv}/.venv/bin/python"
	out="${OUT_DIR}/oracle-${venv}.requirements.txt"

	if [ ! -x "$python_bin" ]; then
		echo "missing venv: ${python_bin} — skipped, existing freeze left untouched" >&2
		continue
	fi

	{
		echo "# pip freeze — research/v3/oracle/${venv}/.venv"
		echo "# frozen $(date -u +%Y-%m-%dT%H:%M:%SZ) by research/v3/src/provenance/freeze-venvs.sh"
		echo "# python $("$python_bin" -c 'import sys;print(sys.version.split()[0])')"
		"$python_bin" -m pip freeze
	} >"$out"

	echo "${out}: $(grep -vc '^#' "$out") packages"
done
