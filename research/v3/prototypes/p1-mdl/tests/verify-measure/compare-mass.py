#!/usr/bin/env python3
"""VERIFIER-OWNED. Diffs hand-computed m(c) against measureImage's exact-mode smoothed mass."""
import json
import sys

naive = json.load(open(sys.argv[1]))
meas = json.load(open(sys.argv[2]))
label = sys.argv[3]

nrows = {r["key"]: r for r in naive["rows"]}
mrows = {r["key"]: r for r in meas["allRowsIfSmall"]}
assert set(nrows) == set(mrows), "key sets differ"

print(f"=== {label} — smoothed mass, exact mode ({meas['smoothedMass']['mode']}) ===")
print(f"{'rgb':18s} {'region':16s} {'h':9s} {'n':>5s} {'hand m(c)':>18s} {'measure m(c)':>18s} {'rel delta':>12s}")
worst = 0.0
for k in sorted(nrows):
    n, m = nrows[k], mrows[k]
    # cross-check the OKLab too
    lab_delta = max(abs(a - b) for a, b in zip(n["lab"], m["lab"]))
    rel = abs(n["mass"] - m["mass"]) / n["mass"]
    worst = max(worst, rel, lab_delta)
    print(
        f"{str(n['rgb']):18s} {n['region']:16s} {n['bandwidth']:.5f} {n['count']:5d} "
        f"{n['mass']:18.10f} {m['mass']:18.10f} {rel:12.3e}   labΔ={lab_delta:.2e}"
    )
print(f"worst relative/abs deviation: {worst:.3e}")
print("VERDICT:", "CONFIRMED" if worst < 1e-12 else "DISCREPANCY")
