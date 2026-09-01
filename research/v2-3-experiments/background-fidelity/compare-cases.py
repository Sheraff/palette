"""OFF vs ON on the verdict-backed target cases."""
import glob, json, os

B = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
WANT = {
    '000390c0': 'bg should become the dominating PEACH (reviewer: Snow wrong, Peach dominates)',
    '000ec4aa': 'bg should become the purple #483469 (correction), not the white frame',
    '00079f9a': 'bg #242328 CORRECT; complaint is SURFACE -> #953c5c',
    '000b5fe0': 'correction bg #010101 sf #014d7f',
    '000f9f4b': 'bg #21356a CORRECT; complaint is SURFACE (grey, no provenance)',
    '000e2291': '640px weak / 300px batch-26 STRONG (bg #101b15 sf #dd5839) must not move',
}
for f in sorted(glob.glob(B + '/cases/*.json')):
    n = os.path.basename(f)
    sid, res = n[16:24], n[8:16]
    a = json.load(open(f))
    b = json.load(open(B + '/cases-on/' + n))
    pa, pb = a['published'], b['published']
    print(f"=== {sid} [{res}] {'MOVED' if pa != pb else 'unchanged'}")
    print(f"    want: {WANT.get(sid, '')}")
    print(f"    OFF bg={pa['background']} sf={pa['surface']} fg={pa['foreground']} ac={pa['accent']} grad={pa['gradient']}")
    print(f"    ON  bg={pb['background']} sf={pb['surface']} fg={pb['foreground']} ac={pb['accent']} grad={pb['gradient']}")
    print(f"    decisive OFF={a['decisiveCriterion']}({a['decisiveConfidence']}) "
          f"ON={b['decisiveCriterion']}({b['decisiveConfidence']}) | "
          f"bgIsMount OFF={a['backgroundIsMount']} ON={b['backgroundIsMount']} | "
          f"mountCount OFF={a['mountCount']} ON={b['mountCount']}")
