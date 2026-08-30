"""Shared loading for the phase-3 embedding deliverables. Read-only."""
import json, os, re
import numpy as np

V3 = '/Users/Flo/GitHub/palette/research/v3'
ROOT = '/Users/Flo/GitHub/palette'
SP = os.path.dirname(os.path.abspath(__file__))
ARM = 'dinov2-vitl14'

def read_ids(p):
    return [json.loads(l) for l in open(p) if l.strip()]

def load():
    d = {}
    d['sharded_rows'] = read_ids(f'{V3}/data/embeddings/sharded.{ARM}.ids.jsonl')
    d['music_rows'] = read_ids(f'{V3}/data/embeddings/music_artworks.{ARM}.ids.jsonl')
    d['fresh_rows'] = read_ids(f'{V3}/data/embeddings-fresh-15/sharded_fresh_15.{ARM}.ids.jsonl')
    d['sharded_npy'] = np.load(f'{V3}/data/embeddings/sharded.{ARM}.npy')
    d['music_npy'] = np.load(f'{V3}/data/embeddings/music_artworks.{ARM}.npy')
    d['fresh_npy'] = np.load(f'{V3}/data/embeddings-fresh-15/sharded_fresh_15.{ARM}.npy')
    d['clusters'] = json.load(open(f'{SP}/clusters.json'))
    d['by_key'] = {r['key']: r for r in d['clusters']['rows']}
    d['coverage'] = json.load(open(f'{V3}/data/coverage-set/coverage-set-1.json'))
    d['evalset'] = json.load(open(f'{V3}/data/oracle-premise/eval-set.json'))
    ho = json.load(open(f'{V3}/data/holdout/holdout.json'))
    d['holdout_ids'] = set(a['id'] for a in ho['artworks'])
    d['quarantine_ids'] = set(ho['header']['nearDuplicateCensus']['nonCandidateQuarantine']['artworkIds'])
    d['warehouse'] = [json.loads(l) for l in open(f'{V3}/data/warehouse/warehouse.jsonl')]
    return d

SHARDED_PREFIXES = None
def sharded_artwork_id(path, prefixes):
    stem = os.path.splitext(os.path.basename(path))[0]
    if len(stem) == 40 and stem[:16] in prefixes:
        return stem[16:]
    return stem

def music_artwork_id(path):
    stem = os.path.splitext(os.path.basename(path))[0]
    return re.sub(r'_\d+x\d+$', '', stem)

def prefixes():
    # from corpus.ts SHARDED_RENDITION_PREFIXES
    src = open(f'{V3}/src/coverage-set/corpus.ts').read()
    m = re.search(r'SHARDED_RENDITION_PREFIXES[^{]*\{(.*?)\}', src, re.S)
    return set(re.findall(r"'?([0-9a-f]{16})'?\s*:", m.group(1)))

def vec(d, row):
    src = {'sharded': 'sharded_npy', 'music_artworks': 'music_npy', 'sharded_fresh_15': 'fresh_npy'}[row['collection']]
    return d[src][row['row']]
