"""The full census corpus: all 7,550 hex-root artworks plus the 34 non-scrambled images/ fixtures."""
import glob, os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = '/Users/Flo/GitHub/palette'

out = []
for root in sorted(glob.glob(os.path.join(REPO, '[0-9a-f][0-9a-f]'))):
    for n in sorted(os.listdir(root)):
        out.append(os.path.join(root, n))
hexroots = len(out)

for n in sorted(os.listdir(os.path.join(REPO, 'images'))):
    if '-scrambled.' in n:
        continue          # decoys, never artwork (charter, "Corpus trap")
    out.append(os.path.join(REPO, 'images', n))

open(os.path.join(HERE, 'corpus-all.txt'), 'w').write('\n'.join(out) + '\n')
print(f"hex roots: {hexroots}   images/ fixtures: {len(out)-hexroots}   total: {len(out)}")
