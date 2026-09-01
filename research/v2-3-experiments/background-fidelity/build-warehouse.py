"""Index the FULL verdict warehouse — every record, not just the latest per artwork.

Two different questions need two different reads (charter, "Verdict recency"):

  - "what is this artwork's current standing?"  -> the LATEST record wins.
  - "has this exact palette ever been judged?"  -> EVERY record counts, because a destination
    adjudicated inferior in batch 12 is still a known-bad destination today.

`palettes` therefore accumulates every (hex-tuple -> judgement) pair ever recorded for an artwork.
A palette is judged POSITIVE when its label is in `verdictApplies` of a strong/acceptable record,
NEGATIVE when its label is in `verdictApplies` of an unacceptable/weak-fallback record, and
LOSER when the record expressed a preference for the other side.
"""
import json, glob, os
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
V = '/Users/Flo/GitHub/palette/research/v2-3-eval/data/verdicts.jsonl'
ROLES = ('background', 'surface', 'foreground', 'accent')

rows = [json.loads(l) for l in open(V)]
rows.sort(key=lambda d: d.get('recordedAt', ''))
print(f"warehouse records: {len(rows)}")

latest = {}
judged = defaultdict(dict)   # artwork -> hexkey -> {'positive':bool,'negative':bool,'loser':bool,...}

for d in rows:
    key = os.path.splitext(os.path.basename(d.get('image') or ''))[0]
    if not key:
        continue
    latest[key] = d
    verdict = d.get('verdict')
    applies = set(d.get('verdictApplies') or [])
    pref = (d.get('preference') or {}).get('label')
    labels = list((d.get('palettes') or {}).keys())
    for label, p in (d.get('palettes') or {}).items():
        hexkey = '|'.join(p[r]['hex'] for r in ROLES) + f"|{p['gradient']}"
        e = judged[key].setdefault(hexkey, {
            'positive': False, 'negative': False, 'loser': False, 'records': []})
        if label in applies and verdict in ('strong', 'acceptable'):
            e['positive'] = True
        if label in applies and verdict in ('unacceptable', 'weak-fallback'):
            e['negative'] = True
        # An explicit preference for the OTHER side makes this palette a compared-inferior one.
        if pref and label != pref and len(labels) > 1:
            e['loser'] = True
        e['records'].append({'batch': d.get('batch'), 'verdict': verdict, 'label': label,
                             'preferred': pref == label, 'applies': label in applies})

print("latest-verdict distribution:", Counter(d.get('verdict') for d in latest.values()).most_common())
print(f"artworks with any verdict: {len(latest)}   artworks with judged palettes: {len(judged)}")
print(f"distinct judged palettes: {sum(len(v) for v in judged.values())}")

paths = {}
for f in glob.glob('/Users/Flo/GitHub/palette/research/v2-3-eval/data/results/*/*.json'):
    try:
        d = json.load(open(f))
    except Exception:
        continue
    p = d.get('imagePath')
    if p:
        paths[os.path.splitext(os.path.basename(p))[0]] = p

out = {}
for k, d in latest.items():
    out[k] = {
        'verdict': d.get('verdict'), 'batch': d.get('batch'),
        'applies': d.get('verdictApplies') or [],
        'preference': (d.get('preference') or {}).get('label'),
        'corrections': d.get('corrections') or {},
        'notes': d.get('notes') or '',
        'path': paths.get(k),
        'judgedPalettes': judged.get(k, {}),
    }
json.dump(out, open(os.path.join(HERE, 'warehouse.json'), 'w'), indent=1)
print("warehouse.json written")
