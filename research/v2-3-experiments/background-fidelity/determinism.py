"""Determinism: the same artwork extracted by two independent processes must agree.

`data/cases-on` and `data/all-on` were produced by separate invocations, on different shards, at
different times. Every artwork present in both is a two-process determinism trial. The bf-on
mirror (research/v2-3-eval/data/results/bf-on) is a THIRD independent process for 9 of them.
"""
import glob, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
B = os.path.join(HERE, 'data')
R = ('background', 'surface', 'foreground', 'accent')


def load(d):
    o = {}
    for f in glob.glob(os.path.join(B, d, '*.json')):
        r = json.load(open(f))
        if 'error' not in r:
            o[os.path.splitext(os.path.basename(f))[0]] = r
    return o


a, b = load('cases-on2'), load('all-on2')
shared = sorted(set(a) & set(b))
bad = [k for k in shared if a[k]['published'] != b[k]['published']]
print(f"ON, two independent sweeps: {len(shared)} artworks compared, {len(bad)} disagree")
for k in bad:
    print("  MISMATCH", k, a[k]['published'], b[k]['published'])

# third process: the mirrored batch
mir = '/Users/Flo/GitHub/palette/.claude/worktrees/agent-a44447f854afa671b/research/v2-3-eval/data/results/bf-on'
n = m = 0
for f in glob.glob(os.path.join(mir, '*.json')):
    rec = json.load(open(f))
    key = os.path.splitext(os.path.basename(rec['imagePath']))[0]
    if key not in b:
        continue
    w = rec['extraction']['winner']
    got = tuple(w[x]['hex'] for x in R) + (w['gradient'],)
    want = tuple(b[key]['published'][x] for x in R) + (b[key]['published']['gradient'],)
    n += 1
    if got != want:
        m += 1
        print("  MIRROR MISMATCH", key, got, want)
print(f"ON, mirror vs sweep (third process): {n} compared, {m} disagree")

# OFF: two independent sweeps of the 320
oa, ob = load('fresh320-off'), load('fresh320-off-recheck')
sh = sorted(set(oa) & set(ob))
bd = [k for k in sh if oa[k]['published'] != ob[k]['published']]
print(f"OFF, two independent sweeps: {len(sh)} artworks compared, {len(bd)} disagree")
