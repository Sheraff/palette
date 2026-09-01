"""Destination-adjudicate every mover against the full verdict warehouse.

Guardrail semantics (TRACK_CHARTER.md, "Multiple valid palettes", Flo 2026-08-02): a mover is a
regression ONLY if its destination was itself reviewed negatively, or was previously compared
inferior to the palette it replaces. Destination-unadjudicated is reviewable movement, not failure.

  python3 adjudicate.py <off.jsonl> <on.jsonl>

Accepts either the census format (one JSON object per line with `key` and the four role hexes) or
the collated probe format (same fields nested under `published`).
"""
import json, os, sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROLES = ('background', 'surface', 'foreground', 'accent')
warehouse = json.load(open(os.path.join(HERE, 'warehouse.json')))


def read(path):
    out = {}
    for line in open(path):
        line = line.strip()
        if not line:
            continue
        d = json.loads(line)
        if 'error' in d:
            continue
        src = d.get('published', d)
        if not all(r in src for r in ROLES):
            continue
        out[d['key']] = {r: src[r] for r in ROLES} | {'gradient': src['gradient']}
    return out


def hexkey(p):
    return '|'.join(p[r] for r in ROLES) + f"|{p['gradient']}"


def classify(key, source, dest):
    """How the warehouse judges moving from `source` to `dest` on this artwork.

    The charter's bar is "never move TO a known-worse palette", where *worse* means worse than
    the palette being replaced. So a record that contains BOTH palettes and expressed a
    preference is decisive and outranks any absolute judgement — a reviewer who calls an artwork
    weak-fallback while still preferring the destination has ranked the move UP, not down.
    """
    w = warehouse.get(key)
    if not w:
        return 'UNREVIEWED-ARTWORK', None
    sk, dk = hexkey(source), hexkey(dest)
    e = w['judgedPalettes'].get(dk)

    # 1. Head-to-head: a record holding both palettes.
    for rec in (e or {}).get('records', []):
        sib = w['judgedPalettes'].get(sk, {}).get('records', [])
        if not any(s['batch'] == rec['batch'] for s in sib):
            continue
        if rec['preferred']:
            return 'DESTINATION-PREFERRED-OVER-SOURCE', e
        if any(s['batch'] == rec['batch'] and s['preferred'] for s in sib):
            return 'DESTINATION-COMPARED-INFERIOR', e
        return 'DESTINATION-COMPARED-EQUAL', e

    # 2. No head-to-head: fall back to how the destination was judged on its own.
    if not e:
        return 'DESTINATION-UNADJUDICATED', None
    if e['negative'] or e['loser']:
        return 'DESTINATION-KNOWN-BAD', e
    if e['positive']:
        return 'DESTINATION-KNOWN-GOOD', e
    return 'DESTINATION-SEEN-UNJUDGED', e


FAIL = {'DESTINATION-COMPARED-INFERIOR', 'DESTINATION-KNOWN-BAD'}
PASS = {'DESTINATION-PREFERRED-OVER-SOURCE', 'DESTINATION-KNOWN-GOOD'}


off_path, on_path = sys.argv[1], sys.argv[2]
off, on = read(off_path), read(on_path)
keys = sorted(set(off) & set(on))
movers = [k for k in keys if off[k] != on[k]]
print(f"census: {len(keys)} artworks compared "
      f"(off file {len(off)}, on file {len(on)})")
print(f"movers: {len(movers)} = {100*len(movers)/max(1,len(keys)):.2f}%")

buckets = Counter()
bad, good = [], []
for k in movers:
    status, e = classify(k, off[k], on[k])
    buckets[status] += 1
    if status in FAIL:
        bad.append((k, status, e))
    if status in PASS:
        good.append((k, status, e))
print("\ndestination adjudication of every mover:")
for s, n in buckets.most_common():
    print(f"  {s:36s} {n}")

print(f"\n=== REGRESSIONS — destination judged worse than what it replaces: {len(bad)}")
for k, status, e in bad:
    w = warehouse[k]
    sid = k[16:24] if len(k) > 24 else k
    print(f"  {sid:12s} {status}  latest={w['verdict']} ({w['batch']})")
    print(f"      OFF {' '.join(off[k][r] for r in ROLES)} grad={off[k]['gradient']}")
    print(f"      ON  {' '.join(on[k][r] for r in ROLES)} grad={on[k]['gradient']}")
    if w['corrections']:
        print(f"      correction: {json.dumps(w['corrections'])}")
    if w['notes']:
        print(f"      notes: {w['notes'][:220]}")

print(f"\n=== ENDORSED — destination judged at least as good: {len(good)}")
for k, status, e in good:
    w = warehouse[k]
    sid = k[16:24] if len(k) > 24 else k
    batches = sorted({r['batch'] for r in e['records']})
    print(f"  {sid:12s} {status:36s} ({', '.join(batches)}; artwork now {w['verdict']})")

strong_movers = [k for k in movers if warehouse.get(k, {}).get('verdict') == 'strong']
print(f"\nmovers off an artwork whose latest verdict is STRONG: {len(strong_movers)}")
for k in strong_movers:
    status, _ = classify(k, off[k], on[k])
    sid = k[16:24] if len(k) > 24 else k
    print(f"  {sid:12s} -> {status}")

json.dump({'movers': movers,
           'regressions': [k for k, _, _ in bad],
           'endorsed': [k for k, _, _ in good],
           'buckets': dict(buckets),
           'perMover': {k: classify(k, off[k], on[k])[0] for k in movers}},
          open(os.path.join(HERE, 'adjudication.json'), 'w'), indent=1)
print("\nadjudication.json written")
