import sys, json, os, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib

def phase_sets(d, by_key=None):
    pref = lib.prefixes()
    P3_BATCHES = {'cal-027', 'cal-028', 'cal-029', 'cal-030'}
    p2, p3, other = {}, {}, {}
    for r in d['warehouse']:
        a = r.get('artwork')
        if not a: continue
        p = a['path'].replace(lib.ROOT + '/', '')
        coll = 'music_artworks' if p.startswith('music-artworks/') else ('images' if p.startswith('images/') else 'sharded')
        aid = lib.music_artwork_id(p) if coll == 'music_artworks' else lib.sharded_artwork_id(p, pref)
        k = f'{coll}:{aid}'
        # SAM overlay / residual-sheet records carry a generated PNG as their path but
        # name the real corpus artwork in rendition.artworkId; resolve through that.
        if by_key is not None and k not in by_key:
            rid = ((r.get('artwork') or {}).get('rendition') or {}).get('artworkId')
            if rid:
                for cand in (f'sharded:{rid}', f'music_artworks:{rid}'):
                    if cand in by_key:
                        k = cand
                        break
        bid = (r.get('batch') or {}).get('id') or ''
        rec = (k, p, r['type'], bid)
        if bid in P3_BATCHES: p3.setdefault(k, p)
        elif bid.startswith('phase2-'): p2.setdefault(k, p)
        else: other.setdefault(k, p)
    return p2, p3, other

if __name__ == '__main__':
    d = lib.load()
    p2, p3, other = phase_sets(d, d['by_key'])
    print('phase2', len(p2), 'phase3', len(p3), 'other-batches', len(other))
    for name, s in [('p2', p2), ('p3', p3), ('other', other)]:
        missing = [k for k in s if k not in d['by_key']]
        print(name, 'no cluster for', missing)
    sizes = d['clusters']['clusterSizes']
    tot = sum(sizes)
    c2 = collections.Counter(d['by_key'][k]['cluster'] for k in p2 if k in d['by_key'])
    c3 = collections.Counter(d['by_key'][k]['cluster'] for k in p3 if k in d['by_key'])
    co = collections.Counter(d['by_key'][k]['cluster'] for k in other if k in d['by_key'])
    holes = [c for c in range(36) if c2[c] + c3[c] == 0]
    holes_all = [c for c in range(36) if c2[c] + c3[c] + co[c] == 0]
    print('holes (p2+p3 zero):', holes)
    print('  share', round(sum(sizes[c] for c in holes) / tot * 100, 2), '%')
    print('holes incl every other reviewed batch:', holes_all)
    for c in range(36):
        print(f'{c:2d} n={sizes[c]:4d} {sizes[c]/tot*100:5.2f}%  p2={c2[c]:2d} p3={c3[c]:2d} other={co[c]:3d}')
