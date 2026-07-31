#!/bin/sh
# Calibration for the gated accent-vividness bonus, over the 12 decisive verdicts.
# FLIP = the reviewer preferred the vivid accent; HOLD = the reviewer preferred the incumbent.
set -e
FLIP="08/ab67616d00001e0200087b1314ac8e17bc1c6916
06/ab67616d00001e020006eb2197bdb0a7b9392108
0e/ab67616d00001e02000e229142cb6dbae156341c
0a/ab67616d00001e02000a8aa1dafa651976a7bb44
0b/ab67616d00001e02000b87c4345d251dd50300f8
0d/ab67616d00001e02000d457f4b8829a59481e78b
02/ab67616d0000b2730002dc280ccc28cadb7d4ae4.jpg"
HOLD="05/ab67616d0000b273000531830819a9db4885e928
0a/ab67616d0000b273000a392cb5a08d9801562845
08/ab67616d0000b2730008601958194a047b8e75a3
05/ab67616d00001e020005a54a9ea60f48619788f1
01/ab67616d0000b27300014fb430dd1b693e653121.jpg"

for s in "$@"; do
	echo "=== TRACK_N_VIVIDNESS = $s"
	echo "--- must FLIP to the vivid accent"
	# shellcheck disable=SC2086
	TRACK_N_VIVIDNESS=$s node --no-warnings --experimental-strip-types \
		research/v2-3-experiments/track-n/determinism.ts $FLIP
	echo "--- must HOLD the incumbent accent"
	# shellcheck disable=SC2086
	TRACK_N_VIVIDNESS=$s node --no-warnings --experimental-strip-types \
		research/v2-3-experiments/track-n/determinism.ts $HOLD
done
