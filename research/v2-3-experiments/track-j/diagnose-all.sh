#!/bin/sh
# Run the accent-gap diagnostic for every case in the chromatic-marks class,
# each against the accent colour human review actually named.
set -e
J=research/v2-3-experiments/track-j/inspect-accent-gap.ts
run() { node --no-warnings --experimental-strip-types "$J" "$1" --want "$2"; }

# batch-15 correction records name the first two hexes exactly.
run 07/ab67616d0000b2730007cc8b341c11227aa7b461            '#f06d13'   # marmalade album title
run 08/ab67616d00001e0200087b1314ac8e17bc1c6916            '#ff4e2a'   # red accents, not caramel skin
run 11/ab67616d0000b2730011c0148119c34e2b222b02            '#c35151'   # red swoosh (Track E's mark census)
run 03/ab67616d00001e020003e50500c5d762da89643a.jpg        '#c8a13c'   # gold-orange corner writing
run 04/ab67616d00001e020004ccf0ae91364130886c02            '#b5652a'   # orange-brown line
run 05/ab67616d0000b2730005230fae1822525e5a5ff6            '#ee231f'   # GUARDRAIL: already correct
run 01/ab67616d00001e0200018a1e2daf68a53f504cb9.jpg        '#e8763c'   # batch-15 "Mothy orange", newly named
