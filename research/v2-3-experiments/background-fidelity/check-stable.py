"""For named artworks: does F1 change WHICH criterion decides their published field pair?"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
L = lambda v: int((v + 1e-12) / 0.04)
K = ('frameCoverage', 'peripheralCoverage', 'connectedCoverage', 'fieldScore', 'populationCoverage')
want = set(sys.argv[1:]) or {'loups', 'orelsan'}

for line in open(os.path.join(HERE, 'data/eval479-off.jsonl')):
    d = json.loads(line)
    if not any(w in d['key'] for w in want):
        continue
    bg, sf = d.get('backgroundFamily'), d.get('surfaceFamily')
    if not bg or not sf:
        continue
    dl = [L(bg[k]) - L(sf[k]) for k in K]
    off = next((K[i] for i, v in enumerate(dl) if v != 0), 'ascii-tie')
    on = next((K[i] for i, v in enumerate(dl) if abs(v) >= 2), 'ascii-tie')
    winner_off = 'bg' if (dl[K.index(off)] > 0 if off != 'ascii-tie' else True) else 'sf'
    winner_on = 'bg' if (dl[K.index(on)] > 0 if on != 'ascii-tie' else True) else 'sf'
    print(f"{d['key']:10s} deltas={dl}")
    print(f"{'':10s} OFF decider={off} ({winner_off} wins)   ON decider={on} ({winner_on} wins)   "
          f"orientation preserved={winner_off == winner_on}")
