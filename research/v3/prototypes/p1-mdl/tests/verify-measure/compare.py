#!/usr/bin/env python3
"""VERIFIER-OWNED. Diffs the naive re-derivation against measureImage's output."""
import json
import sys

naive = json.load(open(sys.argv[1]))
meas = json.load(open(sys.argv[2]))
label = sys.argv[3]

rows = []


def cmp(name, a, b):
    rows.append((name, a, b, "MATCH" if a == b else "DIFF"))


cmp("distinct triples", naive["distinctTriples"], meas["colorCount"])
cmp("total pixels", naive["pixelCount"], meas["pixelCount"])
cmp("sum of counts", naive["countSum"], meas["countSum"])
cmp("width", naive["width"], meas["source"]["width"])
cmp("height", naive["height"], meas["source"]["height"])
for i, (n, m) in enumerate(zip(naive["top5"], meas["top5"])):
    cmp(f"top{i+1} rgb", n["rgb"], m["rgb"])
    for f in ("count", "sumX", "sumY", "sumXX", "sumXY", "sumYY"):
        cmp(f"top{i+1} {f}", n[f], m[f])

bad = [r for r in rows if r[3] == "DIFF"]
print(f"=== {label}: {len(rows)} quantities, {len(bad)} differ ===")
for r in rows:
    if r[3] == "DIFF" or "-v" in sys.argv:
        print(f"  {r[0]:18s} naive={r[1]!s:22s} measure={r[2]!s:22s} {r[3]}")
print("VERDICT:", "CONFIRMED" if not bad else "DISCREPANCY")
