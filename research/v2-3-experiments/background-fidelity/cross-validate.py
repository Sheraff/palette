"""Cross-validate the census runner against the probe runner.

`run-census.ts` does one extraction pass; `run-bgfidelity.ts` also builds the evidence pass first.
They are different code paths into the same algorithm, run in different processes at different
times, so every artwork present in both is an independent agreement check on top of determinism.

  python3 cross-validate.py <census.jsonl> <probe.jsonl>
"""
import json, os, sys

ROLES = ('background', 'surface', 'foreground', 'accent')


def read(p):
    o = {}
    for line in open(p):
        d = json.loads(line)
        if 'error' in d:
            continue
        s = d.get('published', d)
        if not all(r in s for r in ROLES):
            continue
        o[d['key']] = tuple(s[r] for r in ROLES) + (s['gradient'],)
    return o


a, b = read(sys.argv[1]), read(sys.argv[2])
shared = sorted(set(a) & set(b))
bad = [k for k in shared if a[k] != b[k]]
print(f"{os.path.basename(sys.argv[1])} vs {os.path.basename(sys.argv[2])}: "
      f"{len(shared)} artworks in both, {len(bad)} disagree")
for k in bad[:20]:
    print("  MISMATCH", k)
    print("    census:", a[k])
    print("    probe :", b[k])
