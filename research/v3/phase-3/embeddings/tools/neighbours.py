import sys, os, json, collections
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import lib, pool
import numpy as np

OUT = '/Users/Flo/GitHub/palette/research/v3/phase-3/embeddings'
K = 12

SEEDS = [
 ('face-as-field', 'sharded', '00094a786a28459646be9b20', 'ab67616d0000b27300094a786a28459646be9b20',
  'round-1/2 cover 1; phase2-cal-026 "the Sushi Rice beige is the face of the subject on this artwork, not a background"'),
 ('face-as-field', 'sharded', '000f9ddb5dfe0c2590bed1b2', 'ab67616d00001e02000f9ddb5dfe0c2590bed1b2',
  'cal-027/028 and phase2-pair-023 cover; second face-as-field seed named in the task'),
 ('twice-unacceptable', 'sharded', '000131a334d00155369bb7b9', 'ab67616d0000b273000131a334d00155369bb7b9',
  'round-1 cover 7 and round-2 cover 2: both arms graded unacceptable, twice, with no reviewer text'),
 ('label-logo', 'sharded', '000146db0ad7d43bebdb3152', 'ab67616d0000b273000146db0ad7d43bebdb3152',
  'phase2-cal-025 verdict v-msp1tg8s-537e231c: "neither Firebrick (accent) nor Eggshell (surface) see to visually be part of this artwork. They are only present in the very small label logo at the bottom"'),
 ('frame-letterbox', 'music_artworks', '9c44f2accbca25be25af910c00f5b635', '9c44f2accbca25be25af910c00f5b635',
  'frame-probe.txt; retreat-test-4.md names it one of "the two thick-frame covers" (canvasShare 0.478); ground-test-1.jsonl reach 0.999 / enclosure 1.0'),
 ('frame-letterbox', 'music_artworks', '7b51bde9cbaefc73faf8f94402042cce', '7b51bde9cbaefc73faf8f94402042cce',
  'frame-probe.txt; retreat-test-4.md names it the other of "the two thick-frame covers" (canvasShare 0.446)'),
 ('no-field-photographic', 'sharded', '0003e28f477763147b213494', 'ab67616d0000b2730003e28f477763147b213494',
  'retreat-probe-2.txt; retreat-test-2.jsonl accepted=0, remainderArea 1.0, one full-canvas piece, no rejected attempts (the maximally degenerate retreat)'),
 ('no-field-photographic', 'music_artworks', '952266f2430177b8659cd7a83785ac5e', '952266f2430177b8659cd7a83785ac5e',
  'retreat-probe-2.txt; accepted=0, remainderArea 0.956, enclosure 0.943 with one rejected attempt (retreat with competing candidates)'),
 ('no-field-photographic', 'sharded', '0013d322d1bc6a020541cfbd', 'ab67616d00001e020013d322d1bc6a020541cfbd',
  'retreat-probe-2.txt; accepted=0, remainderArea 0.925 — the least degenerate unreviewed retreat cover'),
]

def wide_keys(d):
    keys = []
    for k, r in d['by_key'].items():
        coll, aid = k.split(':', 1)
        if aid in d['holdout_ids'] or aid in d['quarantine_ids']:
            continue
        if coll == 'music_artworks' and not r['inPool']:
            continue
        keys.append(k)
    return sorted(keys)


def main():
    d = lib.load(); pref = lib.prefixes()
    members, excluded, eval_missing = pool.build_pool(d)
    raw = open(f'{lib.V3}/data/warehouse/warehouse.jsonl').read()
    hex_tokens = set(__import__('re').findall(r'[0-9a-f]{24,40}', raw))
    p2, p3, other = __import__('cov').phase_sets(d, d['by_key'])

    keys = sorted(members)
    rows = [d['by_key'][k] for k in keys]
    M = np.stack([lib.vec(d, r) for r in rows]).astype(np.float64)
    # vectors are L2-normalized on write; renormalize defensively (no-op to 1e-7)
    norms = np.linalg.norm(M, axis=1)
    assert abs(norms - 1).max() < 1e-3, norms.min()

    lines = open(f'{lib.V3}/data/warehouse/warehouse.jsonl').read().split('\n')
    parsed = [(l, json.loads(l)) for l in lines if l.strip()]

    def reviewed_info(k, row):
        stem = os.path.splitext(os.path.basename(row['path']))[0]
        aid = row['artworkId']
        # Line-level containment: catches records that name the artwork anywhere,
        # including SAM overlay records whose own path is a generated PNG.
        batches = sorted({(r.get('batch') or {}).get('id') for l, r in parsed
                          if (stem in l or aid in l) and (r.get('batch') or {}).get('id')})
        grep = sorted(t for t in {stem, aid} if t in raw)
        phase = []
        if k in p3: phase.append('phase-3')
        if k in p2: phase.append('phase-2')
        if k in other: phase.append('other-batch')
        return {'reviewed': bool(grep or batches), 'greppedTokensFound': grep,
                'batches': batches, 'phases': phase}

    wkeys = wide_keys(d)
    wrows = [d['by_key'][k] for k in wkeys]
    W = np.stack([lib.vec(d, r) for r in wrows]).astype(np.float64)

    def neighbour_rows(k, keyset, rowset, matrix, sources):
        v = lib.vec(d, d['by_key'][k]).astype(np.float64)
        sims = matrix @ v
        order = np.argsort(-sims, kind='stable')
        out = []
        for i in order:
            if keyset[i] == k:
                continue
            r = rowset[i]
            info = reviewed_info(keyset[i], r)
            out.append({
                'rank': len(out) + 1,
                'cosine': round(float(sims[i]), 6),
                'key': keyset[i],
                'collection': r['collection'],
                'artworkId': r['artworkId'],
                'stem': os.path.splitext(os.path.basename(r['path']))[0],
                'path': r['path'],
                'width': r['width'], 'height': r['height'],
                'wxh': f"{r['width']}x{r['height']}",
                'tier': r['tier'],
                'cluster': r['cluster'],
                'poolSources': sorted(sources.get(keyset[i], [])) or None,
                'everReviewed': info['reviewed'],
                'reviewedIn': info['batches'],
                'reviewPhases': info['phases'],
            })
            if len(out) == K:
                break
        return out

    out_seeds = []
    for cls, coll, aid, stem, why in SEEDS:
        k = f'{coll}:{aid}'
        srow = d['by_key'][k]
        neigh = neighbour_rows(k, keys, rows, M, members)
        wide = neighbour_rows(k, wkeys, wrows, W, members)
        sinfo = reviewed_info(k, srow)
        out_seeds.append({
            'failureClass': cls,
            'seed': {
                'key': k, 'collection': coll, 'artworkId': aid, 'stem': stem,
                'path': srow['path'], 'width': srow['width'], 'height': srow['height'],
                'wxh': f"{srow['width']}x{srow['height']}", 'tier': srow['tier'],
                'cluster': srow['cluster'],
                'inPool': k in members,
                'everReviewed': sinfo['reviewed'], 'reviewedIn': sinfo['batches'],
                'why': why,
            },
            'neighbours': neigh,
            'unreviewedAbove0_6': sum(1 for n in neigh if n['cosine'] >= 0.6 and not n['everReviewed']),
            'above0_6': sum(1 for n in neigh if n['cosine'] >= 0.6),
            'corpusWideNeighbours': wide,
            'corpusWideUnreviewedAbove0_6': sum(1 for n in wide if n['cosine'] >= 0.6 and not n['everReviewed']),
            'corpusWideAbove0_6': sum(1 for n in wide if n['cosine'] >= 0.6),
        })

    doc = {
        'what': 'k=12 nearest neighbours of each Phase 3 failure-class seed, so a fix can be tested on many artworks of the same kind rather than on one.',
        'generatedBy': 'research/v3/phase-3/embeddings/tools/neighbours.py (rendered to NEIGHBOURS.md by tools/render_neighbours.py); cluster labels from tools/clusters.json, produced by tools/recluster.ts',
        'arm': lib.ARM,
        'armDecision': 'd-2026-08-02-embedding-canonical-model',
        'metric': 'cosine (vectors are L2-normalized on write, so this is a dot product)',
        'k': K,
        'pool': {
            'what': 'coverage-set-1 union eval-142 union sharded shard 15, at ARTWORK level (one vector per artwork: its largest rendition), minus the holdout and its non-candidate quarantine',
            'size': len(members),
            'bySource': dict(collections.Counter(s for v in members.values() for s in v)),
            'byCollection': dict(collections.Counter(k.split(':')[0] for k in members)),
            'excludedAsHoldoutOrQuarantine': len(excluded),
            'excludedNote': 'zero: coverage-set-1 and shard 15 exclude the holdout by construction, and no locatable eval-142 entry is a held-out artwork, so this filter was vacuous rather than unapplied',
            'eval142NotInEmbeddedCorpus': len(eval_missing),
        },
        'reviewedFlag': {
            'source': 'research/v3/data/warehouse/warehouse.jsonl',
            'method': 'a neighbour counts as reviewed if its 24/32-hex artwork id or its file stem appears anywhere in the warehouse (raw substring, every record type), and the batch ids of any warehouse record whose artwork path carries that stem are listed',
        },
        'corpusWidePool': {
            'what': 'SUPPLEMENT, beyond the brief: every clustered artwork in the two embedded collections plus shard 15, minus the holdout, its quarantine, and the music-artworks non-candidates (non-square, thumbnail-only, real-transparency). Added because the briefed pool turned out to be too sparse to supply same-kind artworks for most classes.',
            'size': len(wkeys),
        },
        'seeds': out_seeds,
    }
    os.makedirs(OUT, exist_ok=True)
    with open(f'{OUT}/neighbours.json', 'w') as f:
        json.dump(doc, f, indent=1)
        f.write('\n')
    for s in out_seeds:
        print(s['failureClass'], s['seed']['stem'][:24], 'above0.6:', s['above0_6'], 'unreviewed>=0.6:', s['unreviewedAbove0_6'],
              'top:', s['neighbours'][0]['cosine'], 'k12:', s['neighbours'][-1]['cosine'],
              '| wide >=0.6:', s['corpusWideAbove0_6'], 'unrev:', s['corpusWideUnreviewedAbove0_6'])


if __name__ == '__main__':
    main()
