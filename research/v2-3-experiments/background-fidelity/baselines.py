"""Corpus baselines from a census file, for contextualising the census diff."""
import json, os, sys
from collections import Counter

rows = []
for line in open(sys.argv[1]):
    d = json.loads(line)
    if 'error' not in d:
        rows.append(d)
n = len(rows)
print(f"artworks: {n}")
coll = sum(1 for d in rows if d['background'] == d['surface'])
acc = sum(1 for d in rows if d['collapse'][1])
grad = sum(1 for d in rows if d['gradient'])
mid = sum(1 for d in rows if d.get('midpoint'))
print(f"surface collapsed (bg == sf): {coll} ({100*coll/n:.1f}%)")
print(f"accent collapsed:             {acc} ({100*acc/n:.1f}%)")
print(f"gradient published:           {grad} ({100*grad/n:.1f}%)")
print(f"source-supported midpoint:    {mid} ({100*mid/n:.1f}%)")
