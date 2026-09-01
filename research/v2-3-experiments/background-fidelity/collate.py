"""Collapse each per-artwork sweep directory into one JSONL, sorted by artwork id.

The runners write one file per job so a sweep is resumable and killable (charter, "Machine
budget"), but ~2,400 small JSONs is not a useful commit. The JSONL files are the committed record;
`data/<label>/` is regenerable by re-running the sweep and is gitignored.
"""
import glob, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
B = os.path.join(HERE, 'data')
KEEP = ['fresh320-off-recheck', 'verdict-off', 'all-on2', 'mountratio',
        'cases', 'cases-on2', 'cases-off-recheck']

for d in KEEP:
    src = os.path.join(B, d)
    if not os.path.isdir(src):
        print("missing", d)
        continue
    rows = []
    for f in sorted(glob.glob(os.path.join(src, '*.json'))):
        rows.append((os.path.splitext(os.path.basename(f))[0], json.load(open(f))))
    out = os.path.join(B, f'{d}.jsonl')
    with open(out, 'w') as fh:
        for k, r in sorted(rows):
            fh.write(json.dumps({'key': k, **r}, separators=(',', ':')) + '\n')
    print(f"{d:24s} {len(rows):4d} rows -> {os.path.basename(out)} "
          f"({os.path.getsize(out)//1024} KB)")
