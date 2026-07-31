#!/bin/sh
# Threshold sensitivity for `identity.decisiveForegroundPolarity`.
#
# Rewrites the constant in place, replays the two target cases plus every case
# whose obligation set contains near-neutrals that a lower threshold would start
# calling "decisive" (the guardrail set), then restores the shipped value.
#
# usage: sh research/v2-3-experiments/track-h/sensitivity.sh 0.5 0.6 0.7
set -e
POLICY=research/v2-3/src/internal/policy.ts
SHIPPED=0.6
CASES="01/ab67616d0000b27300015083990110d3b1a4ea8a.jpg
07/ab67616d0000b2730007cc8b341c11227aa7b461
09/ab67616d0000b2730009d178a401f9433fdddff2
05/ab67616d0000b2730005230fae1822525e5a5ff6
03/ab67616d00001e020003e50500c5d762da89643a.jpg
11/ab67616d0000b2730011c0148119c34e2b222b02
images/once.jpg
images/placebo.jpg
images/black.jpg"

for value in "$@"; do
	sed -i '' "s/decisiveForegroundPolarity: [0-9.]*/decisiveForegroundPolarity: $value/" "$POLICY"
	echo "=== decisiveForegroundPolarity = $value"
	# shellcheck disable=SC2086
	node --no-warnings --experimental-strip-types research/v2-3-experiments/track-h/determinism.ts $CASES
done
sed -i '' "s/decisiveForegroundPolarity: [0-9.]*/decisiveForegroundPolarity: $SHIPPED/" "$POLICY"
echo "restored decisiveForegroundPolarity = $SHIPPED"
