#!/bin/sh
# Calibration curve for the accent-vividness term.
#
# ANCHORS (vivid accent wanted, verdict-backed):
#   08/...087b13  wants #ff4e2a-class red over the caramel #e7a680   <- must FLIP
#   placebo.jpg   #c91611 over #111312 (batch 14)                    <- already right, must HOLD
#   05/...5e5a5ff6 #ee231f (review-11)                               <- already right, must HOLD
# GUARDRAILS (muted/dark accent must survive):
#   07/...07cc8b #242426 (batch-15 strong)   doja #fda8cf   krafty #eb0a8a
#   johns #ff5a62   orelsan #6c5f57   horsley #f2eec1   once #6c5f71   skap (hue diversity)
#   meteora #a59073   horrorwood #808b91
set -e
CASES="08/ab67616d00001e0200087b1314ac8e17bc1c6916
images/placebo.jpg
05/ab67616d0000b2730005230fae1822525e5a5ff6
07/ab67616d0000b2730007cc8b341c11227aa7b461
images/doja.jpg
images/krafty.jpg
images/johns.jpg
images/orelsan.jpg
images/horsley.jpg
images/once.jpg
images/skap.jpg
images/meteora.jpg
images/horrorwood.jpg"

for s in "$@"; do
	echo "=== TRACK_M_VIVIDNESS = $s"
	# shellcheck disable=SC2086
	TRACK_M_VIVIDNESS=$s node --no-warnings --experimental-strip-types \
		research/v2-3-experiments/track-m/determinism.ts $CASES
done
