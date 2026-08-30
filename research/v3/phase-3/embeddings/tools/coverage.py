import sys, os, json, collections, re
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import lib, pool
from cov import phase_sets
OUT = '/Users/Flo/GitHub/palette/research/v3/phase-3/embeddings'
SEED = 0x7c11e3
N_DRAW = 8

def mulberry32(seed):
    state = seed & 0xffffffff
    def rng():
        nonlocal state
        state = (state + 0x6d2b79f5) & 0xffffffff
        t = state
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xffffffff
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xffffffff)) & 0xffffffff
        t &= 0xffffffff
        return ((t ^ (t >> 14)) & 0xffffffff) / 4294967296
    return rng

def shuffle(items, rng):
    out = list(items)
    for i in range(len(out) - 1, 0, -1):
        j = int(rng() * (i + 1))
        out[i], out[j] = out[j], out[i]
    return out

# self-test against round-2 COVERS.md published draws for 0x5a7e21
_r = mulberry32(0x5a7e21)
_six = [round(_r(), 10) for _ in range(6)]
assert _six == [0.5923460522, 0.6422792317, 0.3976854985, 0.1768510023, 0.8656704151, 0.4309391670], _six

def main():
    d = lib.load(); pref = lib.prefixes()
    members, excluded, eval_missing = pool.build_pool(d)
    p2, p3, other = phase_sets(d, d['by_key'])
    raw = open(f'{lib.V3}/data/warehouse/warehouse.jsonl').read()
    hex_tokens = set(re.findall(r'[0-9a-f]{24,40}', raw))
    sizes = d['clusters']['clusterSizes']; tot = sum(sizes)

    # component -> members, from the reproduced near-dup component ids
    comp_members = collections.defaultdict(list)
    for k, r in d['by_key'].items():
        if r['componentId']:
            comp_members[r['componentId']].append(k)

    def cl(k):
        return d['by_key'][k]['cluster'] if k in d['by_key'] else None

    c2 = collections.Counter(cl(k) for k in p2 if k in d['by_key'])
    c3 = collections.Counter(cl(k) for k in p3 if k in d['by_key'])
    co = collections.Counter(cl(k) for k in other if k in d['by_key'])

    clusters = []
    for c in range(36):
        clusters.append({
            'cluster': c,
            'universeArtworks': sizes[c],
            'corpusSharePct': round(sizes[c] / tot * 100, 2),
            'phase2Covers': c2[c],
            'phase3Covers': c3[c],
            'phase2Plus3': c2[c] + c3[c],
            'otherBatchCovers': co[c],
            'categoryHole': (c2[c] + c3[c]) == 0,
            'phase2Ids': sorted(k for k in p2 if cl(k) == c),
            'phase3Ids': sorted(k for k in p3 if cl(k) == c),
        })
    holes = [r for r in clusters if r['categoryHole']]
    holes_sorted = sorted(holes, key=lambda r: (-r['universeArtworks'], r['cluster']))

    # ---- allocation: proportional to corpus share among the holes, largest remainder
    hole_total = sum(r['universeArtworks'] for r in holes)
    exact = {r['cluster']: r['universeArtworks'] / hole_total * N_DRAW for r in holes}
    alloc = {c: int(v) for c, v in exact.items()}
    left = N_DRAW - sum(alloc.values())
    for c, _ in sorted(exact.items(), key=lambda kv: (-(kv[1] - int(kv[1])), kv[0]))[:left]:
        alloc[c] += 1
    strata = [c for c in sorted(alloc, key=lambda c: (-sizes[c], c)) if alloc[c] > 0]

    # ---- eligibility
    def eligible(k):
        r = d['by_key'][k]
        coll, aid = k.split(':', 1)
        stem = os.path.splitext(os.path.basename(r['path']))[0]
        reasons = []
        if aid in d['holdout_ids'] or aid in d['quarantine_ids']:
            reasons.append('holdout-or-quarantine')
        for tok in (aid, stem, os.path.basename(r['path'])):
            if tok and (tok in raw or tok in hex_tokens):
                reasons.append(f'reviewed:{tok}')
                break
        comp = r['componentId']
        if comp:
            for sib in comp_members.get(comp, []):
                if sib == k:
                    continue
                sr = d['by_key'][sib]
                sid = sib.split(':', 1)[1]
                sstem = os.path.splitext(os.path.basename(sr['path']))[0]
                if sid in d['holdout_ids'] or sid in d['quarantine_ids']:
                    reasons.append(f'near-dup-of-holdout:{sib}')
                elif sid in raw or sstem in raw:
                    reasons.append(f'near-dup-of-reviewed:{sib}')
        if not os.path.exists(os.path.join(lib.ROOT, r['path'])):
            reasons.append('file-missing')
        return reasons

    core_keys = {f"{a['collection']}:{a['artworkId']}" for a in d['coverage']['artworks']
                 if a['role'] == 'core' and a.get('inEmbeddingUniverse')}
    rng = mulberry32(SEED)
    picks, rejections = [], []
    for c in strata:
        primary = sorted(k for k in core_keys if cl(k) == c)
        secondary = sorted(k for k in members if cl(k) == c and k not in core_keys)
        chosen = None
        for tierName, cand in (('coverage-set-1 core', primary), ('eval-142 / shard-15 pool', secondary)):
            if chosen:
                break
            for k in shuffle(cand, rng):
                bad = eligible(k)
                if bad:
                    rejections.append({'cluster': c, 'key': k, 'reasons': bad})
                    continue
                chosen = (k, tierName)
                break
        if not chosen:
            picks.append({'cluster': c, 'error': 'no eligible candidate in this cluster'})
            continue
        k, src = chosen
        r = d['by_key'][k]
        from PIL import Image
        with Image.open(os.path.join(lib.ROOT, r['path'])) as im:
            w, h = im.size
        picks.append({
            'slot': len(picks) + 1,
            'cluster': c,
            'clusterCorpusSharePct': round(sizes[c] / tot * 100, 2),
            'drawnFrom': src,
            'key': k,
            'collection': r['collection'],
            'artworkId': r['artworkId'],
            'id': os.path.splitext(os.path.basename(r['path']))[0],
            'path': r['path'],
            'widthFromHeader': w, 'heightFromHeader': h, 'wxh': f'{w}x{h}',
            'widthRecorded': r['width'], 'heightRecorded': r['height'],
            'headerMatchesRecorded': (w, h) == (r['width'], r['height']),
            'tier': r['tier'],
            'nearDupComponentId': r['componentId'],
            'nearDupComponentSize': len(comp_members.get(r['componentId'], [])) or 1,
        })

    doc = {
        'generatedBy': 'research/v3/phase-3/embeddings/tools/coverage.py (rendered to COVERAGE.md by tools/render_coverage.py); cluster labels from tools/clusters.json, produced by tools/recluster.ts',
        'what': 'Cluster coverage of what the reviewer has actually judged in Phase 2 and Phase 3, against the 36 coverage-set clusters, plus a proposed 8-cover draw that fills the largest category holes.',
        'clustering': {
            'k': 36, 'seedHex': '0xc0efface', 'arm': lib.ARM,
            'source': 'reproduced from research/v3/src/coverage-set/build-coverage-set.ts (same code path, same inputs)',
            'verification': 'cluster sizes and all 218 in-universe coverage-set-1 cluster labels reproduce exactly; 44 iterations, converged',
            'universeArtworks': tot,
        },
        'reviewSources': {
            'phase3Batches': ['cal-027', 'cal-028', 'cal-029', 'cal-030'],
            'phase3DistinctCovers': len(p3),
            'phase2BatchPrefix': 'phase2-',
            'phase2DistinctCovers': len(p2),
            'otherBatchesNote': 'every other warehouse batch (SAM mask quality, perception-4, accent-*, residual-purity, pointing-*, oracle-*, bracketing, dropped-colors, cascade-ground-truth, bcde-*, demo-*, endorsement-recheck). Counted in a separate column because those rounds asked different questions of a cover; they are not palette verdicts.',
            'otherDistinctCoversMappedToClusters': sum(co.values()),
            'otherDistinctCoversNotMappable': len([k for k in other if k not in d['by_key']]),
            'notMappableNote': 'legacy images/ covers and synthetic probe ids (smq-*, pt1-*, resid*-*, pg1-*) that are not corpus artworks and therefore have no cluster. SAM overlay and residual-sheet records ARE resolved, through rendition.artworkId, to the corpus artwork they show.',
        },
        'clusters': clusters,
        'holes': {
            'definition': 'a cluster with zero covers judged in Phase 2 or Phase 3',
            'count': len(holes),
            'clusters': [r['cluster'] for r in holes_sorted],
            'corpusSharePct': round(sum(r['universeArtworks'] for r in holes) / tot * 100, 2),
            'noteOnOtherBatches': 'with every other warehouse batch counted too, no cluster is empty — the holes are holes in PALETTE judgement, not in all reviewer contact',
        },
        'proposedDraw': {
            'n': N_DRAW,
            'seedHex': '0x7c11e3',
            'seedDecimal': SEED,
            'method': 'the 8 slots are allocated across the 10 hole clusters in proportion to corpus share (largest remainder), which lands exactly one cover in each of the 8 largest holes; clusters 11 and 31 (1.22% and 1.21%) get none. Within a cluster: candidates sorted by artworkId ascending, Fisher-Yates shuffled from one mulberry32(0x7c11e3) stream consumed in fixed stratum order (descending corpus share), then walked taking the first candidate passing every filter. The Python mulberry32 used here was verified against round-2 COVERS.md by reproducing its published first six draws for 0x5a7e21 exactly.',
            'candidateOrder': ['coverage-set-1 core members of the cluster', 'then eval-142 / shard-15 members of the cluster'],
            'filters': ['never reviewed: neither the artwork id, the file stem nor the basename appears anywhere in warehouse.jsonl (raw substring, plus every 24-40 hex token in it)',
                        'not held out and not quarantined',
                        'no near-duplicate component sibling that is reviewed, held out or quarantined',
                        'file present on disk; WxH re-read from the image header, not from a record'],
            'allocation': {str(c): alloc[c] for c in sorted(alloc)},
            'strataOrder': strata,
            'covers': picks,
            'rejectionsDuringWalk': rejections,
        },
    }
    os.makedirs(OUT, exist_ok=True)
    with open(f'{OUT}/coverage.json', 'w') as f:
        json.dump(doc, f, indent=1); f.write('\n')
    print('holes', [r['cluster'] for r in holes_sorted], round(sum(r['universeArtworks'] for r in holes)/tot*100,2))
    print('alloc', alloc)
    for p in picks:
        print(p.get('slot'), 'cl', p['cluster'], p.get('id'), p.get('wxh'), p.get('drawnFrom'), 'hdr==rec', p.get('headerMatchesRecorded'))
    print('rejections', len(rejections))
    for r in rejections: print('  rej cl', r['cluster'], r['key'], r['reasons'])

if __name__ == '__main__':
    main()
