"""Corpus-wide shape of the census diff: what kind of change is each mover?"""
import json, os
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROLES = ('background', 'surface', 'foreground', 'accent')
adj = json.load(open(os.path.join(HERE, 'adjudication.json')))
warehouse = json.load(open(os.path.join(HERE, 'warehouse.json')))


def read(p):
    o = {}
    for line in open(os.path.join(HERE, p)):
        d = json.loads(line)
        if 'error' not in d:
            o[d['key']] = d
    return o


off, on = read('data/census-off.jsonl'), read('data/census-on.jsonl')
movers = adj['movers']
print(f"movers: {len(movers)} of {len(off)} = {100*len(movers)/len(off):.2f}%\n")

shape = Counter()
collapse, uncollapse, gradflip = [], [], []
for k in movers:
    a, b = off[k], on[k]
    ca, cb = a['background'] == a['surface'], b['background'] == b['surface']
    if cb and not ca:
        collapse.append(k); shape['surface COLLAPSES (4 -> 3 colours)'] += 1
    elif ca and not cb:
        uncollapse.append(k); shape['surface UN-collapses (3 -> 4 colours)'] += 1
    elif a['background'] == b['surface'] and a['surface'] == b['background']:
        shape['clean background<->surface swap'] += 1
    elif a['background'] != b['background']:
        shape['background replaced'] += 1
    else:
        shape['other (surface/fg/accent only)'] += 1
    if a['gradient'] != b['gradient']:
        gradflip.append(k)

for s, n in shape.most_common():
    print(f"  {s:38s} {n:4d}  ({100*n/len(movers):.1f}% of movers)")

print(f"\ngradient flag flips: {len(gradflip)} "
      f"({100*len(gradflip)/len(movers):.1f}% of movers, "
      f"{100*len(gradflip)/len(off):.2f}% of corpus)")
gon = sum(1 for k in gradflip if on[k]['gradient'])
print(f"  gradient gained: {gon}   gradient lost: {len(gradflip)-gon}   "
      f"(charter rule 5 wants both directions counted)")

print(f"\ncardinality changes — collapse {len(collapse)}, un-collapse {len(uncollapse)}, "
      f"net {len(collapse)-len(uncollapse):+d}")
print("collapsing movers, with adjudication status:")
for k in collapse:
    sid = k[16:24] if len(k) > 24 else k
    print(f"  {sid:12s} {adj['perMover'][k]}")

print("\nmovers off an artwork whose latest verdict is STRONG, with destination status:")
for k in movers:
    w = warehouse.get(k)
    if not w or w['verdict'] != 'strong':
        continue
    sid = k[16:24] if len(k) > 24 else k
    a, b = off[k], on[k]
    print(f"  {sid:12s} {adj['perMover'][k]}  ({w['batch']})")
    print(f"      OFF {' '.join(a[r] for r in ROLES)} grad={a['gradient']}")
    print(f"      ON  {' '.join(b[r] for r in ROLES)} grad={b['gradient']}")
