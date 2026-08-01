"""Off-panel (fresh, unreviewed) blast radius: OFF vs ON."""
import glob, json, os
from collections import Counter

B = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
R = ('background', 'surface', 'foreground', 'accent')


def load(d):
    o = {}
    for f in glob.glob(os.path.join(B, d, '*.json')):
        r = json.load(open(f))
        if 'error' in r:
            continue
        o[os.path.splitext(os.path.basename(f))[0]] = r
    return o


def pal(r):
    p = r['published']
    return tuple(p[x] for x in R) + (p['gradient'],)


off, on = load('fresh320-off-recheck'), load('all-on2')
keys = sorted(set(off) & set(on))
mv = [k for k in keys if pal(off[k]) != pal(on[k])]
print(f"OFF-PANEL fresh: {len(mv)}/{len(keys)} moved = {100*len(mv)/len(keys):.1f}%")

rc = Counter()
for k in mv:
    a, b = off[k]['published'], on[k]['published']
    for r in R:
        if a[r] != b[r]:
            rc[r] += 1
    if a['gradient'] != b['gradient']:
        rc['gradient'] += 1
print("roles changed among movers:", rc.most_common())

bg = [k for k in mv if off[k]['published']['background'] != on[k]['published']['background']]
print(f"background changed: {len(bg)} ({100*len(bg)/len(keys):.1f}% of panel)")
swap = [k for k in bg
        if off[k]['published']['background'] == on[k]['published']['surface']
        and off[k]['published']['surface'] == on[k]['published']['background']]
print(f"  of which a clean background<->surface SWAP: {len(swap)}")
print("decisive OFF->ON among movers:",
      Counter((off[k]['decisiveCriterion'], on[k]['decisiveCriterion']) for k in mv).most_common(8))
print("configuration count OFF:", sum(1 for k in keys if off[k]['configuration']),
      " ON:", sum(1 for k in keys if on[k]['configuration']))

fail = [k for k in keys if off[k]['configuration'] and (off[k]['massRatio'] or 0) >= 1.5]
print(f"\nfailure-pattern artworks (configuration AND massRatio>=1.5): {len(fail)}; "
      f"moved: {sum(1 for k in fail if k in mv)}")
for k in fail:
    a, b = off[k]['published'], on[k]['published']
    print(f"   {k[16:24]} mr={off[k]['massRatio']:.2f} {'MOVED' if k in mv else 'unchanged'}")
    print(f"      OFF bg={a['background']} sf={a['surface']} -> ON bg={b['background']} sf={b['surface']}")

json.dump([k for k in mv], open(os.path.join(os.path.dirname(B), 'fresh-movers.json'), 'w'), indent=1)
print("\nfresh movers written")
