"""Attribute each mover: which way did the background role move in population terms?

The 00034b60 loss is a fall-through that would have handed the background to a family holding a
small fraction of the artwork. This asks how often that happens across every mover, so the loss
can be called isolated or systematic on evidence rather than on one case.
"""
import json, os
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROLES = ('background', 'surface', 'foreground', 'accent')
warehouse = json.load(open(os.path.join(HERE, 'warehouse.json')))
adj = json.load(open(os.path.join(HERE, 'adjudication.json')))


def read(p):
    o = {}
    for line in open(p):
        d = json.loads(line)
        if 'error' not in d:
            o[d['key']] = d
    return o


off = read(os.path.join(HERE, 'data/eval479-off.jsonl'))
on = read(os.path.join(HERE, 'data/all-on2.jsonl'))

print(f"{'artwork':12s} {'status':34s} {'bgPop OFF':>10s} {'bgPop ON':>9s} {'dir':>7s}  {'decisive OFF -> ON'}")
buckets = Counter()
shrinkers = []
for k in adj['movers']:
    a, b = off[k], on[k]
    fa = (a.get('backgroundFamily') or {}).get('populationFraction')
    fb = (b.get('backgroundFamily') or {}).get('populationFraction')
    status = adj['perMover'][k]
    if fa is None or fb is None:
        d = '?'
    elif abs(fa - fb) < 1e-9:
        d = 'same'
    elif fb < fa:
        d = 'SMALLER'
    else:
        d = 'larger'
    buckets[d] += 1
    if d == 'SMALLER':
        shrinkers.append((k, status, fa, fb))
    sid = k[16:24] if len(k) > 24 else k
    print(f"{sid:12s} {status:34s} {fa if fa is None else round(fa,4):>10} "
          f"{fb if fb is None else round(fb,4):>9} {d:>7s}  "
          f"{a.get('decisiveCriterion')} -> {b.get('decisiveCriterion')}")

print(f"\nbackground-family population direction across movers: {dict(buckets)}")
print(f"\nmovers whose background moved to a SMALLER family: {len(shrinkers)}")
for k, status, fa, fb in shrinkers:
    sid = k[16:24] if len(k) > 24 else k
    print(f"  {sid:12s} {status:34s} {fa:.4f} -> {fb:.4f}  (ratio {fb/fa:.2f})")
