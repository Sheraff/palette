"""Print OFF vs ON for every mover, with the mechanism attribution."""
import glob, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
B = os.path.join(HERE, 'data')
R = ('background', 'surface', 'foreground', 'accent')
mv = json.load(open(os.path.join(HERE, 'movers.json')))
verdicts = json.load(open(os.path.join(HERE, 'latest-verdicts.json')))


def load(d):
    o = {}
    for f in glob.glob(os.path.join(B, d, '*.json')):
        r = json.load(open(f))
        if 'error' not in r:
            o[os.path.splitext(os.path.basename(f))[0]] = r
    return o


off = {}
off.update(load('fresh320-off-recheck'))
off.update(load('verdict-off'))
on = load('all-on2')

for group in ('verdictMovers', 'freshMovers'):
    print(f"\n########## {group} ({len(mv[group])})")
    for k in mv[group]:
        a, b = off[k], on[k]
        pa, pb = a['published'], b['published']
        v = verdicts.get(k)
        sid = k[16:24] if len(k) > 24 else k
        tag = f"latest={v['verdict']} ({v['batch']})" if v else "unreviewed"
        swap = pa['background'] == pb['surface'] and pa['surface'] == pb['background']
        collapse = pb['background'] == pb['surface'] and pa['background'] != pa['surface']
        note = 'BG<->SF SWAP' if swap else ('SURFACE COLLAPSE' if collapse else 'other')
        print(f"  {sid:10s} {tag:42s} {note}")
        print(f"      OFF bg={pa['background']} sf={pa['surface']} fg={pa['foreground']} ac={pa['accent']} grad={pa['gradient']}")
        print(f"      ON  bg={pb['background']} sf={pb['surface']} fg={pb['foreground']} ac={pb['accent']} grad={pb['gradient']}")
        print(f"      decisive {a['decisiveCriterion']}({a['decisiveConfidence']}) -> {b['decisiveCriterion']}({b['decisiveConfidence']})"
              f" | cfg {a['configuration']}->{b['configuration']} | massRatio={a['massRatio']}")
        if v and v.get('notes'):
            print(f"      notes: {v['notes'][:150]}")
