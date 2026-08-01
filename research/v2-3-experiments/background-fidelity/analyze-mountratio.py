"""Where does minimumEnclosedPopulationRatio actually sit in the corpus?"""
import glob, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
B = os.path.join(HERE, 'data', 'mountratio')
verdicts = json.load(open(os.path.join(HERE, 'latest-verdicts.json')))

rows = []
for f in glob.glob(os.path.join(B, '*.json')):
    r = json.load(open(f))
    if 'error' in r:
        continue
    rows.append((os.path.splitext(os.path.basename(f))[0], r))
print(f"n={len(rows)}")

withowner = [(k, r) for k, r in rows if r['bestRatio'] is not None]
print(f"artworks with a border-owning family (borderCoverage >= 0.9): {len(withowner)} "
      f"({100*len(withowner)/len(rows):.1f}%)")

ratios = sorted(r['bestRatio'] for _, r in withowner)
if ratios:
    print(f"bestRatio: min={ratios[0]:.3f} median={ratios[len(ratios)//2]:.3f} max={ratios[-1]:.3f}")
    for bar in (0.76, 1.0, 1.58, 2.0, 2.399, 2.5, 4.47):
        n = sum(1 for v in ratios if v >= bar)
        print(f"  bestRatio >= {bar:5}: {n:3d} artworks would be MOUNTS "
              f"({100*n/len(rows):.1f}% of corpus)")

print("\n--- every artwork whose bestRatio lands between 1.0 and 3.0 (the decision zone) ---")
for k, r in sorted(withowner, key=lambda x: -x[1]['bestRatio']):
    v = ratios and r['bestRatio']
    if not (1.0 <= r['bestRatio'] <= 3.0):
        continue
    ver = verdicts.get(k)
    tag = f"{ver['verdict']} ({ver['batch']})" if ver else "unreviewed"
    sid = k[16:24] if len(k) > 24 else k
    o = r['borderOwners'][0]
    print(f"  {sid:10s} ratio={r['bestRatio']:.3f}  {tag:34s} "
          f"owner chroma={o['chroma']:.3f} pop={o['populationFraction']:.3f} "
          f"border={o['borderCoverage']:.3f} center={o['centerCoverage']:.3f}")

print("\n--- artworks above the incumbent 2.5 bar (already mounts today) ---")
for k, r in sorted(withowner, key=lambda x: -x[1]['bestRatio']):
    if r['bestRatio'] < 2.5:
        continue
    ver = verdicts.get(k)
    tag = f"{ver['verdict']} ({ver['batch']})" if ver else "unreviewed"
    sid = k[16:24] if len(k) > 24 else k
    print(f"  {sid:10s} ratio={r['bestRatio']:.3f}  {tag}")
