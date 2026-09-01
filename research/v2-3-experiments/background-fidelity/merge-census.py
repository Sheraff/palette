"""Merge a sharded census (`<prefix>.0` .. `<prefix>.N`) into one sorted JSONL.

  python3 merge-census.py data/census-off
"""
import glob, json, os, sys

prefix = sys.argv[1]
rows = {}
dupes = errors = 0
for f in sorted(glob.glob(prefix + '.[0-9]*')):
    for line in open(f):
        line = line.strip()
        if not line:
            continue
        try:
            d = json.loads(line)
        except json.JSONDecodeError:
            continue          # truncated tail from a killed worker; the re-run rewrites it
        if d['key'] in rows:
            dupes += 1
        if 'error' in d:
            errors += 1
        rows[d['key']] = d
out = prefix + '.jsonl'
with open(out, 'w') as fh:
    for k in sorted(rows):
        fh.write(json.dumps(rows[k], separators=(',', ':')) + '\n')
print(f"{os.path.basename(out)}: {len(rows)} artworks "
      f"({dupes} duplicate keys collapsed, {errors} extraction errors)")
configs = {d.get('config') for d in rows.values()}
print(f"config recorded in rows: {configs}")
