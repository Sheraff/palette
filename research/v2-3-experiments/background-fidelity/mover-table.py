"""Emit the full-corpus mover table as markdown, ordered by adjudication status.

  python3 mover-table.py data/census-off.jsonl data/census-on.jsonl
"""
import json, os, sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROLES = ('background', 'surface', 'foreground', 'accent')
warehouse = json.load(open(os.path.join(HERE, 'warehouse.json')))
adj = json.load(open(os.path.join(HERE, 'adjudication.json')))

ORDER = ['DESTINATION-COMPARED-INFERIOR', 'DESTINATION-KNOWN-BAD',
         'DESTINATION-PREFERRED-OVER-SOURCE', 'DESTINATION-KNOWN-GOOD',
         'DESTINATION-COMPARED-EQUAL', 'DESTINATION-SEEN-UNJUDGED',
         'DESTINATION-UNADJUDICATED', 'UNREVIEWED-ARTWORK']
SHORT = {
    'DESTINATION-COMPARED-INFERIOR': 'REGRESSION (compared inferior)',
    'DESTINATION-KNOWN-BAD': 'REGRESSION (judged bad)',
    'DESTINATION-PREFERRED-OVER-SOURCE': 'win (preferred over incumbent)',
    'DESTINATION-KNOWN-GOOD': 'win (endorsed)',
    'DESTINATION-COMPARED-EQUAL': 'neutral (equal)',
    'DESTINATION-SEEN-UNJUDGED': 'seen, unjudged',
    'DESTINATION-UNADJUDICATED': 'unadjudicated destination',
    'UNREVIEWED-ARTWORK': 'unreviewed artwork',
}


def read(p):
    o = {}
    for line in open(p):
        d = json.loads(line)
        if 'error' in d:
            continue
        s = d.get('published', d)
        o[d['key']] = {r: s[r] for r in ROLES} | {'gradient': s['gradient']}
    return o


off, on = read(sys.argv[1]), read(sys.argv[2])
movers = adj['movers']
per = adj['perMover']

print(f"Movers: {len(movers)} of {len(set(off) & set(on))} artworks\n")
print("| artwork | status | verdict | OFF (bg / sf / fg / ac) | ON (bg / sf / fg / ac) |")
print("|---|---|---|---|---|")
for status in ORDER:
    for k in sorted(movers, key=lambda x: x[16:24] if len(x) > 24 else x):
        if per.get(k) != status:
            continue
        sid = k[16:24] if len(k) > 24 else k
        w = warehouse.get(k)
        v = f"{w['verdict']} ({w['batch']})" if w else "—"
        a = ' '.join(off[k][r] for r in ROLES) + (' grad' if off[k]['gradient'] else '')
        b = ' '.join(on[k][r] for r in ROLES) + (' grad' if on[k]['gradient'] else '')
        print(f"| `{sid}` | {SHORT[status]} | {v} | `{a}` | `{b}` |")

print("\nSummary:", dict(Counter(per[k] for k in movers)))
