"""Print the role-ownership profile of named artworks from a sweep directory."""
import glob, json, os, sys

B = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
d = sys.argv[1]
ids = sys.argv[2:]
for f in sorted(glob.glob(os.path.join(B, d, '*.json'))):
    k = os.path.splitext(os.path.basename(f))[0]
    if ids and not any(i in k for i in ids):
        continue
    r = json.load(open(f))
    if 'error' in r:
        continue
    p = r['published']
    print(f"=== {k[16:24]} [{k[8:16]}] {r['width']}px cfg={r['configuration']}")
    print(f"    bg={p['background']} sf={p['surface']} fg={p['foreground']} ac={p['accent']} grad={p['gradient']}")
    print(f"    decisive={r['decisiveCriterion']} conf={r['decisiveConfidence']} "
          f"bgIsMount={r['backgroundIsMount']} massRatio={r['massRatio']}")
    for key in ('backgroundFamily', 'surfaceFamily', 'largestChromaticFamily'):
        v = r[key]
        if not v:
            continue
        print(f"    {key:22s} pop={v['populationFraction']:.4f} chroma={v['chroma']:.4f} "
              f"border={v['borderCoverage']:.3f} corner={v['cornerCoverage']:.3f} center={v['centerCoverage']:.3f}")
        print(f"    {'':22s} FRAME={v['frameCoverage']:.4f}(L{int(v['frameCoverage']/0.04)}) "
              f"periph={v['peripheralCoverage']:.4f}(L{int(v['peripheralCoverage']/0.04)}) "
              f"conn={v['connectedCoverage']:.4f}(L{int(v['connectedCoverage']/0.04)}) "
              f"field={v['fieldScore']:.4f}(L{int(v['fieldScore']/0.04)}) "
              f"popCov={v['populationCoverage']:.4f}(L{int(v['populationCoverage']/0.04)})")
