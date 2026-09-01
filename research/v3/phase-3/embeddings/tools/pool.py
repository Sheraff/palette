import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib
import numpy as np

def build_pool(d):
    pref = lib.prefixes()
    members = {}   # key -> set of source tags
    # coverage-set-1
    for a in d['coverage']['artworks']:
        if not a.get('inEmbeddingUniverse'):
            continue
        k = f"{a['collection']}:{a['artworkId']}"
        members.setdefault(k, set()).add('coverage-set-1:' + a['role'])
    # eval-142
    eval_missing = []
    for e in d['evalset']['entries']:
        if not e.get('included'):
            continue
        img = e['image']
        coll = 'music_artworks' if img['imagePath'].startswith('music-artworks/') else 'sharded'
        k = f"{coll}:{img['artworkId']}"
        if k not in d['by_key']:
            eval_missing.append(img['imagePath'])
            continue
        members.setdefault(k, set()).add('eval-142')
    # shard 15
    for k, r in d['by_key'].items():
        if r['collection'] == 'sharded_fresh_15':
            members.setdefault(k, set()).add('shard-15')
    # exclusions
    excluded = {}
    for k in list(members):
        coll, aid = k.split(':', 1)
        if aid in d['holdout_ids']:
            excluded[k] = 'holdout'; del members[k]
        elif aid in d['quarantine_ids']:
            excluded[k] = 'quarantine'; del members[k]
    return members, excluded, eval_missing

def reviewed_index(d):
    """artwork key -> list of batch ids the reviewer judged it in (any record type)."""
    pref = lib.prefixes()
    idx = {}
    raw_text = open(f'{lib.V3}/data/warehouse/warehouse.jsonl').read()
    for r in d['warehouse']:
        a = r.get('artwork')
        if not a:
            continue
        p = a['path'].replace(lib.ROOT + '/', '')
        coll = 'music_artworks' if p.startswith('music-artworks/') else 'sharded'
        aid = lib.music_artwork_id(p) if coll == 'music_artworks' else lib.sharded_artwork_id(p, pref)
        k = f'{coll}:{aid}'
        bid = (r.get('batch') or {}).get('id')
        idx.setdefault(k, {'batches': set(), 'types': set(), 'paths': set()})
        idx[k]['batches'].add(bid)
        idx[k]['types'].add(r['type'])
        idx[k]['paths'].add(p)
    return idx, raw_text

def grep_reviewed(raw_text, row, pref):
    """substring test over the raw warehouse, like round-2's filter"""
    stem = os.path.splitext(os.path.basename(row['path']))[0]
    aid = row['artworkId']
    hits = []
    for tok in {stem, aid}:
        if tok and tok in raw_text:
            hits.append(tok)
    return hits
