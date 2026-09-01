"""Resolve the review batch's 9 artworks to absolute paths."""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
IDS = ['000390c0', '000ec4aa', 'disney', '00034b60', '00034b1c',
       '00039a97', '0013095d', '000c4fb7', '0000cb59']

pool = []
for f in ('verdict-set.txt', 'fresh-320.txt'):
    pool += [l.strip() for l in open(os.path.join(HERE, f)) if l.strip()]

out = []
for i in IDS:
    hits = [p for p in pool if i in os.path.basename(p)]
    if not hits:
        print("MISSING", i)
        continue
    out.append(hits[0])
    print(f"{i:10s} -> {hits[0]}")
open(os.path.join(HERE, 'batch-list.txt'), 'w').write('\n'.join(out) + '\n')
print(f"\nbatch-list.txt: {len(out)} items")
