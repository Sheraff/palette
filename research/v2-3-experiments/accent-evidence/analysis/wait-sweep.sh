#!/bin/sh
# Block until a swept label has all 223 corpus results. Usage: wait-sweep.sh <label>
label="$1"
dir="research/v2-3-eval/data/results/$label"
while [ "$(ls "$dir" 2>/dev/null | wc -l | tr -d ' ')" -lt 223 ]; do sleep 10; done
echo "sweep $label complete: 223 results"
