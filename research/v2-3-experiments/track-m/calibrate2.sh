#!/bin/sh
# Second calibration pass: the first found the caramel already clears the objective's own
# `identityDirectionFullChroma` (0.09) at 0.0927, so the yardstick — not the strength — was the
# binding limitation. This sweeps the yardstick as well.
#
# usage: sh calibrate2.sh "<full> <strength>" ...
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

for pair in "$@"; do
	full=$(echo "$pair" | cut -d' ' -f1)
	strength=$(echo "$pair" | cut -d' ' -f2)
	echo "=== fullChroma=$full strength=$strength"
	# shellcheck disable=SC2086
	TRACK_M_FULL_CHROMA=$full TRACK_M_VIVIDNESS=$strength node --no-warnings \
		--experimental-strip-types research/v2-3-experiments/track-m/determinism.ts $CASES
done
