"""Build the guardrail set: latest verdict per artwork (charter, "Verdict recency")."""
import json, glob, os
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
V = '/Users/Flo/GitHub/palette/research/v2-3-eval/data/verdicts.jsonl'
rows = [json.loads(l) for l in open(V)]
rows.sort(key=lambda d: d.get('recordedAt', ''))
latest = {}
for d in rows:
    im = os.path.splitext(os.path.basename(d.get('image') or ''))[0]
    if im:
        latest[im] = d
print("artworks with a verdict:", len(latest))
print("latest verdicts:", Counter(d['verdict'] for d in latest.values()).most_common())

paths = {}
for f in glob.glob('/Users/Flo/GitHub/palette/research/v2-3-eval/data/results/*/*.json'):
    try:
        d = json.load(open(f))
    except Exception:
        continue
    p = d.get('imagePath')
    if p:
        paths[os.path.splitext(os.path.basename(p))[0]] = p
missing = [k for k in latest if k not in paths]
print("resolved paths:", len(latest) - len(missing), "missing:", len(missing))
if missing[:6]:
    print("  e.g.", missing[:6])

out = []
idx = {}
for k, d in sorted(latest.items()):
    if k not in paths:
        continue
    out.append('/Users/Flo/GitHub/palette/' + paths[k])
    pal = {}
    for lab, p in (d.get('palettes') or {}).items():
        pal[lab] = {r: p[r]['hex'] for r in ('background', 'surface', 'foreground', 'accent')}
        pal[lab]['gradient'] = p['gradient']
    idx[k] = {
        'verdict': d['verdict'], 'batch': d['batch'],
        'applies': d.get('verdictApplies', []), 'palettes': pal,
        'corrections': d.get('corrections', {}), 'notes': d.get('notes', ''),
    }
open(os.path.join(HERE, 'verdict-set.txt'), 'w').write('\n'.join(out) + '\n')
json.dump(idx, open(os.path.join(HERE, 'latest-verdicts.json'), 'w'), indent=1)
print("verdict-set.txt:", len(out), "| strong:", sum(1 for v in idx.values() if v['verdict'] == 'strong'))
