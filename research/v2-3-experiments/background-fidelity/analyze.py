"""OFF vs ON: blast radius, guardrail status, and mover attribution.

Guardrail semantics per TRACK_CHARTER.md "Multiple valid palettes" (Flo, 2026-08-02):
a mover off a reviewed-strong palette is a REGRESSION only if the destination palette was
itself reviewed negatively, or previously compared inferior to what it replaces. A mover to an
unadjudicated destination is reviewable movement, not a failure.
"""
import glob, json, os, sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
B = os.path.join(HERE, 'data')
ROLES = ('background', 'surface', 'foreground', 'accent')

verdicts = json.load(open(os.path.join(HERE, 'latest-verdicts.json')))


def load(d):
    out = {}
    for f in glob.glob(os.path.join(B, d, '*.json')):
        r = json.load(open(f))
        if 'error' in r:
            continue
        out[os.path.splitext(os.path.basename(f))[0]] = r
    return out


def pal(r):
    p = r['published']
    return tuple(p[x] for x in ROLES) + (p['gradient'],)


def known_bad_destination(key, dest):
    """Was `dest` itself reviewed negatively on this artwork?"""
    v = verdicts.get(key)
    if not v:
        return None  # no verdict at all -> unadjudicated
    for label, p in v['palettes'].items():
        same = tuple(p[x] for x in ROLES) + (p['gradient'],) == dest
        if same:
            if v['verdict'] in ('unacceptable', 'weak-fallback') and label in (v['applies'] or []):
                return True
            if v['verdict'] in ('strong', 'acceptable') and label in (v['applies'] or []):
                return False
    return None  # destination not among the adjudicated palettes


off_all = {}
off_all.update(load('fresh320-off-recheck'))
off_all.update(load('verdict-off'))
on_all = load('all-on2')

keys = sorted(set(off_all) & set(on_all))
print(f"compared: {len(keys)} artworks (OFF have {len(off_all)}, ON have {len(on_all)})")

movers = [k for k in keys if pal(off_all[k]) != pal(on_all[k])]
print(f"movers: {len(movers)}/{len(keys)} = {100*len(movers)/max(1,len(keys)):.1f}%")

# split by panel
vk = [k for k in keys if k in verdicts]
fk = [k for k in keys if k not in verdicts]
vm = [k for k in movers if k in verdicts]
fm = [k for k in movers if k not in verdicts]
print(f"  verdict-carrying: {len(vm)}/{len(vk)} moved ({100*len(vm)/max(1,len(vk)):.1f}%)")
print(f"  off-panel fresh:  {len(fm)}/{len(fk)} moved ({100*len(fm)/max(1,len(fk)):.1f}%)")

# which role moved
rolechg = Counter()
for k in movers:
    a, b = off_all[k]['published'], on_all[k]['published']
    for r in ROLES:
        if a[r] != b[r]:
            rolechg[r] += 1
    if a['gradient'] != b['gradient']:
        rolechg['gradient'] += 1
print("roles changed among movers:", rolechg.most_common())

print("\n=== verdict-carrying movers (guardrail) ===")
buckets = Counter()
for k in sorted(vm):
    v = verdicts[k]
    dest = pal(on_all[k])
    bad = known_bad_destination(k, dest)
    status = 'DESTINATION-KNOWN-BAD' if bad is True else (
        'destination-known-good' if bad is False else 'destination-UNADJUDICATED')
    buckets[(v['verdict'], status)] += 1
    a, b = off_all[k]['published'], on_all[k]['published']
    print(f"  {k[16:24]} [{k[8:16]}] latest={v['verdict']} ({v['batch']}) -> {status}")
    print(f"      OFF {a['background']} {a['surface']} {a['foreground']} {a['accent']} grad={a['gradient']}")
    print(f"      ON  {b['background']} {b['surface']} {b['foreground']} {b['accent']} grad={b['gradient']}")
print("\nguardrail buckets:", dict(buckets))

auto_fail = [k for k in vm if known_bad_destination(k, pal(on_all[k])) is True]
print(f"\nAUTO-FAIL (mover to a known-bad destination): {len(auto_fail)} {[k[16:24] for k in auto_fail]}")

# strong movers specifically
strong_movers = [k for k in vm if verdicts[k]['verdict'] == 'strong']
print(f"movers off a reviewed-STRONG palette: {len(strong_movers)}/"
      f"{sum(1 for k in vk if verdicts[k]['verdict']=='strong')} "
      f"-> {[k[16:24] for k in strong_movers]}")

json.dump({'movers': movers, 'verdictMovers': vm, 'freshMovers': fm, 'autoFail': auto_fail},
          open(os.path.join(HERE, 'movers.json'), 'w'), indent=1)
print("\nmovers.json written")
